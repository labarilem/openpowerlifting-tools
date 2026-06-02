import fs from "node:fs";
import * as pdfjs from "pdfjs-dist";
import { joinCsvRow } from "../../lib/csv.js";
import {
  isLastnameProposition,
  normalizeSplitName,
  withNameOverride,
} from "../../lib/names.js";

/** @type {typeof import("pdfjs-dist")} */
const pdfjsApi = pdfjs.default ?? pdfjs;
const { getDocument } = pdfjsApi;

const FIPE_SECTION_HEADER_REGEX = /^(WOMEN|MEN)\s+(\d+(?:\+)?)\s+\|\s+(.+)$/i;
const FIPE_RESULT_ROW_REGEX = /^(FG|DQ|\d+)\s+[WM]\s+\d+(?:\+)?\s+/i;
const FIPE_BIRTH_DATE_REGEX = /\b\d{2}\/\d{2}\/\d{4}\b/;
const FIPE_IGNORED_LINE_REGEXES = [
  /^POS\s+W\/M\s+CAT\s+COGNOME\s+NOME\s+BY\s+CLS\s+SOCIETA'/i,
  /^SQUAT\s+BENCH\s+DEADLIFT$/i,
  /^--\s+\d+\s+of\s+\d+\s+--$/,
  /RISULTATI UFFICIALI/i,
  /^[A-ZÀ-ÿ'` ]+,\s+\d{1,2}(?:-\d{1,2})?\s+[A-ZÀ-ÿ]+\s+20\d{2}$/i,
];

/** Uppercase token (cognome fragment), including legacy apostrophe forms. */
function isCognomeToken(token) {
  const t = String(token ?? "").trim();
  if (!t) return false;
  const upper = t.toUpperCase().replace(/`/g, "'");
  if (isLastnameProposition(upper)) return true;
  return /^[A-Z0-9'.-]+$/u.test(t.replace(/`/g, "'"));
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFipeNameFragment(s) {
  return String(s ?? "")
    .replace(/`/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/ãˆ/gi, "h")
    .replace(/ã/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Insert a space before a 6–7 digit federation code glued after a dot (e.g. `A.S.D.2004021`). */
function detachGluedCodice(line) {
  return line.replace(/\.(\d{6,7})\b/g, ". $1");
}

function pushCurrentLine(lines, currentLineParts) {
  if (currentLineParts.length === 0) return;
  const line = normalizeWhitespace(currentLineParts.join(" "));
  if (line) lines.push(line);
  currentLineParts.length = 0;
}

function groupTextItemsIntoLines(items) {
  const lines = [];
  const currentLineParts = [];
  let currentY = null;

  for (const item of items) {
    if (!("str" in item)) continue;
    const text = normalizeWhitespace(item.str);
    if (!text) {
      if (item.hasEOL) pushCurrentLine(lines, currentLineParts);
      continue;
    }

    const y =
      typeof item.transform?.[5] === "number" ? item.transform[5] : null;
    const sameLine =
      currentY == null || y == null || Math.abs(y - currentY) <= 2;
    if (!sameLine) {
      pushCurrentLine(lines, currentLineParts);
    }

    currentLineParts.push(text);
    currentY = y;

    if (item.hasEOL) {
      pushCurrentLine(lines, currentLineParts);
      currentY = null;
    }
  }

  pushCurrentLine(lines, currentLineParts);
  return lines;
}

/**
 * @param {Uint8Array} pdfBytes
 */
async function extractFipePdfTextContent(pdfBytes) {
  const document = await getDocument({ data: pdfBytes }).promise;
  const lines = [];
  let hasOpenCategory = false;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageLines = groupTextItemsIntoLines(textContent.items);
    const hasOfficialResultsMarker = pageLines.some((line) =>
      /RISULTATI UFFICIALI/i.test(line),
    );
    if (!hasOfficialResultsMarker) continue;
    if (pageLines.some((line) => /\(OPEN\)/i.test(line))) {
      hasOpenCategory = true;
    }
    lines.push(...pageLines);
  }

  return { lines, hasOpenCategory };
}

function parseSectionHeader(line) {
  const match = normalizeWhitespace(line).match(FIPE_SECTION_HEADER_REGEX);
  if (!match) return null;

  const [, , weightClassKg, divisionLabel] = match;
  return {
    weightClassKg,
    divisionLabel: normalizeWhitespace(divisionLabel),
  };
}

function isIgnoredLine(line) {
  const normalized = normalizeWhitespace(line);
  if (!normalized) return true;
  return FIPE_IGNORED_LINE_REGEXES.some((regex) => regex.test(normalized));
}

function isCandidateResultRow(line) {
  const normalized = normalizeWhitespace(line);
  return (
    FIPE_RESULT_ROW_REGEX.test(normalized) &&
    FIPE_BIRTH_DATE_REGEX.test(normalized)
  );
}

function parseEuropeanNumber(raw) {
  const s = String(raw).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * IPF GL (Goodlift) 2020 coefficients for SBD — same as OpenPowerlifting `goodlift.rs`.
 * @param {"M" | "F"} sex
 * @param {string} equipment OPL `Equipment` cell (`Raw` / `Single-ply`).
 * @returns {{ a: number, b: number, c: number }}
 */
function goodliftSbdParameters(sex, equipment) {
  const equipped = String(equipment) === "Single-ply";
  if (sex === "M") {
    return equipped
      ? { a: 1236.25115, b: 1449.21864, c: 0.01644 }
      : { a: 1199.72839, b: 1025.18162, c: 0.00921 };
  }
  return equipped
    ? { a: 758.63878, b: 949.31382, c: 0.02435 }
    : { a: 610.32796, b: 1045.59282, c: 0.03048 };
}

/** @param {"M" | "F"} sex */
function goodliftSbdPoints(sex, equipment, bodyweightKg, totalKg) {
  const { a, b, c } = goodliftSbdParameters(sex, equipment);
  if (!Number.isFinite(bodyweightKg) || bodyweightKg < 35) return NaN;
  if (!Number.isFinite(totalKg) || totalKg <= 0) return NaN;
  const denom = a - b * Math.exp(-c * bodyweightKg);
  if (!(denom > 0)) return NaN;
  return totalKg * (100 / denom);
}

/**
 * Invert IPF GL points to bodyweight when total and points are known (SBD).
 * @param {"M" | "F"} sex
 * @param {number} points IPF GL column value
 * @param {number} totalKg best total in kg
 * @param {number | null | undefined} classMaxKg upper bound (e.g. 63 for -63), or null for open-top classes (bisect up to 220 kg)
 * @returns {number | null}
 */
function estimateBodyweightFromGoodliftSbd(
  sex,
  equipment,
  points,
  totalKg,
  classMaxKg,
) {
  if (!Number.isFinite(points) || points <= 0) return null;
  if (!Number.isFinite(totalKg) || totalKg <= 0) return null;
  const bwMax =
    classMaxKg == null ? 220 : Math.min(classMaxKg, 220);
  const bwMin = 35;
  if (!(bwMax > bwMin)) return null;

  const { a, b, c } = goodliftSbdParameters(sex, equipment);
  const rhs = (a - (100 * totalKg) / points) / b;
  let bw =
    rhs > 0 && rhs < 1 ? -Math.log(rhs) / c : Number.NaN;
  if (
    Number.isFinite(bw) &&
    bw >= bwMin - 1e-6 &&
    bw <= bwMax + 1e-6
  ) {
    const back = goodliftSbdPoints(sex, equipment, bw, totalKg);
    if (Number.isFinite(back) && Math.abs(back - points) <= 0.2) {
      return Math.min(bwMax, Math.max(bwMin, bw));
    }
  }

  const atMin = goodliftSbdPoints(sex, equipment, bwMin, totalKg);
  const atMax = goodliftSbdPoints(sex, equipment, bwMax, totalKg);
  if (![atMin, atMax].every(Number.isFinite)) return null;
  // Bodyweight up → denominator up → GL points down.
  if (points > atMin + 1e-6 || points < atMax - 1e-6) return null;

  let lo = bwMin;
  let hi = bwMax;
  for (let i = 0; i < 56; i += 1) {
    const mid = (lo + hi) / 2;
    const pm = goodliftSbdPoints(sex, equipment, mid, totalKg);
    if (!Number.isFinite(pm)) return null;
    if (Math.abs(pm - points) <= 0.02) return mid;
    if (pm > points) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** @param {string} weightClassLabel e.g. `63`, `120+` */
function weightClassUpperBoundKg(weightClassLabel) {
  const s = String(weightClassLabel ?? "").trim();
  if (/^\d+\+$/i.test(s)) return null;
  const m = /^(\d+)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Trailing peeled token after lifts + total is the IPF GL column (when present).
 * @param {string[]} postTail from `findCodiceAndPost` (codice + bw stripped)
 * @param {boolean} isFg
 */
function fipeTrailingGoodliftPoints(postTail, isFg) {
  if (isFg) return NaN;
  const n = postTail.length;
  if (n === 14) return parseEuropeanNumber(postTail[13]);
  if (n === 13) return parseEuropeanNumber(postTail[12]);
  if (n === 15) return parseEuropeanNumber(postTail[14]);
  return NaN;
}

/**
 * When printed GL matches Goodlift at an absurd PDF body weight, GL+total
 * cannot be inverted to the real weight. Try a coarse divisor scan (FIPE
 * PDF glitches like `365,00` for ~62 kg in -63).
 */
function fipeSalvageBodyweightFromAbsurdPdfKg(absurdBw, classCap) {
  if (!Number.isFinite(absurdBw) || !Number.isFinite(classCap)) return null;
  if (absurdBw < 250) return null;
  const anchor = classCap - 1;
  let best = null;
  let bestDist = Infinity;
  for (const div of [
    12, 11, 10, 9, 8, 7, 6.5, 6.2, 6.1, 6, 5.95, 5.9, 5.887, 5.85, 5.8, 5.7, 5.6,
    5.5, 5,
  ]) {
    const c = absurdBw / div;
    if (c >= 35 && c <= classCap) {
      const d = Math.abs(c - anchor);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
  }
  return best == null ? null : Math.round(best * 10) / 10;
}

/** FIPE BY column is DD/MM/YYYY; OpenPowerlifting BirthDate is YYYY-MM-DD. */
function fipeBirthDateToOplIso(ddMmYyyy) {
  const m = String(ddMmYyyy)
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function formatKgCell(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/** FIPE PDFs use `0` where OpenPowerlifting uses an empty attempt cell. */
function formatAttemptKg(raw) {
  const n = parseEuropeanNumber(raw);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatKgCell(n);
}

function equipmentFromSectionLabel(divisionLabel) {
  const lower = String(divisionLabel || "").toLowerCase();
  if (lower.includes("raw")) return "Raw";
  if (lower.includes("equip")) return "Single-ply";
  return "Raw";
}

function peelTrailingNumericTokens(line) {
  let s = line.trim();
  const tail = [];
  while (true) {
    const m = s.match(/ (-?\d+[.,]\d+|-?\d+)$/);
    if (!m) break;
    tail.unshift(m[1]);
    s = s.slice(0, -m[0].length).trimEnd();
  }
  return { prefix: s.trim(), tail };
}

function findCodiceAndPost(tail) {
  for (let i = 0; i <= tail.length - 3; i += 1) {
    const codice = tail[i];
    if (!/^\d{6,7}$/.test(codice)) continue;
    const bwStr = tail[i + 1];
    const bw = parseEuropeanNumber(bwStr);
    const post = tail.slice(i + 2);
    if (post.length < 13 || post.length > 15) continue;

    // Always keep the parsed token after codice as `bw` when it is numeric, even
    // if absurd (e.g. `365,00` mis-extracted body weight) — downstream can
    // salvage using IPF GL or heuristics.
    if (Number.isFinite(bw)) {
      return { codiceIdx: i, codice, bwStr, bw, post };
    }
  }
  return null;
}

function splitCognomeNome(beforeBirth) {
  const toks = beforeBirth.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!isCognomeToken(t) && i > 0) break;
    i += 1;
  }
  const cognomeTokens = toks.slice(0, i);
  const nomeTokens = toks.slice(i);
  return { cognomeTokens, nomeTokens };
}

function parseResultLine(normalizedLine, section, division) {
  const line = detachGluedCodice(normalizedLine);
  const { prefix, tail } = peelTrailingNumericTokens(line);

  const birthMatch = prefix.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (!birthMatch) {
    throw new Error(
      `FIPE: missing birth date in row: ${normalizedLine.slice(0, 120)}`,
    );
  }
  const birth = birthMatch[1];
  const head = prefix.slice(0, birthMatch.index).trim();
  const tailText = prefix.slice(birthMatch.index + birthMatch[0].length).trim();

  // Row layout: POS (Place), W/M, CAT (weight class), COGNOME NOME … birth date …
  const headMatch = head.match(/^(\S+)\s+([WM])\s+(\d+(?:\+)?)\s+(.+)$/i);
  if (!headMatch) {
    throw new Error(`FIPE: bad row head: ${head}`);
  }
  const [, placeRaw, wmColumn, rowCat, beforeBirth] = headMatch;
  const isFg = placeRaw.toUpperCase() === "FG";
  const place = isFg ? "DQ" : placeRaw;

  const { cognomeTokens, nomeTokens } = splitCognomeNome(beforeBirth);

  const clsMatch = tailText.match(/^(\S+)\s+(.+)$/);
  if (!clsMatch) {
    throw new Error(`FIPE: missing CLS/club: ${tailText.slice(0, 80)}`);
  }

  const found = findCodiceAndPost(tail);
  if (!found) {
    throw new Error(
      `FIPE: could not locate codice/bw tail for: ${normalizedLine.slice(0, 120)}`,
    );
  }

  const { bw, post } = found;
  const postTailAll = [...post];

  let postNums = [...post];
  let s1;
  let s2;
  let s3;
  let sb;
  let b1;
  let b2;
  let b3;
  let bb;
  let d1;
  let d2;
  let d3;
  let db;
  let totalKg;

  if (postNums.length === 13) {
    const squat = postNums.slice(0, 4);
    const bench = postNums.slice(4, 7);
    const dead = postNums.slice(7, 11);
    const tot = postNums[11];
    [s1, s2, s3, sb] = squat;
    if (bench.length === 3) {
      [b1, b2, bb] = bench;
      b3 = "";
    } else {
      [b1, b2, b3, bb] = bench;
    }
    [d1, d2, d3, db] = dead;
    totalKg = tot;
  } else if (postNums.length === 14) {
    [s1, s2, s3, sb, b1, b2, b3, bb, d1, d2, d3, db, totalKg] = postNums;
  } else if (postNums.length === 15) {
    [s1, s2, s3, sb, b1, b2, b3, bb, d1, d2, d3, db, totalKg] = postNums.slice(
      0,
      14,
    );
  } else {
    throw new Error(`FIPE: unexpected post length ${postNums.length}`);
  }

  if (isFg && postNums.length === 15) {
    d1 = postNums[8];
    d2 = postNums[9];
    d3 = postNums[10];
    db = "";
    totalKg = "";
  }

  const birthYear = birth.slice(-4);

  const nome = sanitizeFipeNameFragment(nomeTokens.join(" "));
  const cognome = sanitizeFipeNameFragment(cognomeTokens.join(" "));
  const name = withNameOverride(normalizeSplitName(nome, cognome), birthYear);

  const sex = wmColumn.toUpperCase() === "M" ? "M" : "F";
  const sectionWc = rowCat || section?.weightClassKg || "";
  const equipment = equipmentFromSectionLabel(section?.divisionLabel ?? "");

  let bodyweightKgOut = bw === null ? null : bw;
  const classCap = weightClassUpperBoundKg(sectionWc);
  const totalNum = parseEuropeanNumber(String(totalKg));
  const glPts = fipeTrailingGoodliftPoints(postTailAll, isFg);

  const implausibleBw =
    bw !== null &&
    Number.isFinite(bw) &&
    (bw < 35 || bw > 220 || (classCap != null && bw > classCap));

  if (implausibleBw) {
    const canUseGl =
      Number.isFinite(totalNum) &&
      totalNum > 0 &&
      Number.isFinite(glPts) &&
      glPts > 0;

    if (canUseGl) {
      const glAtPdfBw = goodliftSbdPoints(sex, equipment, bw, totalNum);
      const glMatchesAbsurdPdfBw =
        Number.isFinite(glAtPdfBw) && Math.abs(glAtPdfBw - glPts) <= 0.35;

      if (glMatchesAbsurdPdfBw && classCap != null) {
        const salvaged = fipeSalvageBodyweightFromAbsurdPdfKg(bw, classCap);
        bodyweightKgOut = salvaged != null ? salvaged : null;
      } else if (!glMatchesAbsurdPdfBw) {
        const est = estimateBodyweightFromGoodliftSbd(
          sex,
          equipment,
          glPts,
          totalNum,
          classCap ?? 220,
        );
        bodyweightKgOut = est != null ? est : null;
      } else {
        bodyweightKgOut = null;
      }
    } else {
      bodyweightKgOut = null;
    }
  }

  const row = {
    Place: place,
    Name: name,
    BirthDate: fipeBirthDateToOplIso(birth),
    Sex: sex,
    BirthYear: birthYear,
    Equipment: equipment,
    Division: division,
    BodyweightKg:
      bodyweightKgOut === null || bodyweightKgOut === ""
        ? ""
        : formatKgCell(bodyweightKgOut),
    WeightClassKg: String(sectionWc).replace("+", "+"),
    Squat1Kg: formatAttemptKg(s1),
    Squat2Kg: formatAttemptKg(s2),
    Squat3Kg: formatAttemptKg(s3),
    Best3SquatKg: formatKgCell(parseEuropeanNumber(sb)),
    Bench1Kg: formatAttemptKg(b1),
    Bench2Kg: formatAttemptKg(b2),
    Bench3Kg: b3 === "" ? "" : formatAttemptKg(b3),
    Best3BenchKg: formatKgCell(parseEuropeanNumber(bb)),
    Deadlift1Kg: formatAttemptKg(d1),
    Deadlift2Kg: formatAttemptKg(d2),
    Deadlift3Kg: formatAttemptKg(d3),
    Best3DeadliftKg: isFg ? "" : formatKgCell(parseEuropeanNumber(db)),
    TotalKg: formatAttemptKg(totalKg),
    Event: "SBD",
  };

  return row;
}

const OPL_HEADER = [
  "Place",
  "Name",
  "BirthDate",
  "Sex",
  "BirthYear",
  "Equipment",
  "Division",
  "BodyweightKg",
  "WeightClassKg",
  "Squat1Kg",
  "Squat2Kg",
  "Squat3Kg",
  "Best3SquatKg",
  "Bench1Kg",
  "Bench2Kg",
  "Bench3Kg",
  "Best3BenchKg",
  "Deadlift1Kg",
  "Deadlift2Kg",
  "Deadlift3Kg",
  "Best3DeadliftKg",
  "TotalKg",
  "Event",
];

/**
 * Collect result-row candidates from a FIPE PDF. This is useful for iterating
 * on the parser without having to re-solve page text extraction each time.
 * @param {Uint8Array | Buffer} pdfBytes
 * @param {{ includeMetadata?: boolean }} [options]
 */
export async function collectFipeCandidateRowsFromPdfBytes(
  pdfBytes,
  options = {},
) {
  const normalizedBytes = Buffer.isBuffer(pdfBytes)
    ? new Uint8Array(pdfBytes)
    : pdfBytes;
  const data =
    normalizedBytes instanceof Uint8Array
      ? normalizedBytes
      : new Uint8Array(normalizedBytes);
  const { lines, hasOpenCategory } = await extractFipePdfTextContent(data);
  const candidates = [];
  let currentSection = null;

  for (const line of lines) {
    const sectionHeader = parseSectionHeader(line);
    if (sectionHeader) {
      currentSection = sectionHeader;
      continue;
    }

    if (isIgnoredLine(line)) continue;
    if (!isCandidateResultRow(line)) continue;

    candidates.push({
      line: normalizeWhitespace(line),
      section: currentSection,
    });
  }

  if (options.includeMetadata) {
    return { candidates, hasOpenCategory };
  }
  return candidates;
}

/**
 * @param {Uint8Array | Buffer} pdfBytes
 */
export async function convertFipePdfBytesToOplCsv(pdfBytes) {
  const { candidates, hasOpenCategory } =
    await collectFipeCandidateRowsFromPdfBytes(pdfBytes, {
      includeMetadata: true,
    });
  if (candidates.length === 0) {
    throw new Error(
      "FIPE PDF parser could not detect any candidate result rows.",
    );
  }
  const division = hasOpenCategory ? "Open" : "";
  const rows = candidates.map((candidate) =>
    parseResultLine(candidate.line, candidate.section, division),
  );

  const body = rows.map((r) => joinCsvRow(OPL_HEADER.map((h) => r[h] ?? "")));
  return [joinCsvRow(OPL_HEADER), ...body].join("\n");
}

/**
 * @param {string} pdfPath
 * @param {string} outputPath
 */
export async function convertFipePdfToOplCsv(pdfPath, outputPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const csv = await convertFipePdfBytesToOplCsv(pdfBuffer);
  fs.writeFileSync(outputPath, csv, "utf8");
}

export const convertPdfBytesToOplCsv = convertFipePdfBytesToOplCsv;
export const convertPdfToOplCsv = convertFipePdfToOplCsv;
