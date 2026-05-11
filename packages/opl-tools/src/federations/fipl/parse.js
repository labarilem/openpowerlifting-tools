import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist";
import { parseCsvLine } from "../../lib/csv.js";
import { normalizeFullName, withNameOverride } from "../../lib/names.js";
import { dedupeRects, isInAnyRectangle, isRedColor } from "../../lib/pdf.js";

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
);

/** @type {typeof import("pdfjs-dist")} */
const pdfjsApi = pdfjs.default ?? pdfjs;
const { OPS, Util, getDocument } = pdfjsApi;

const MAX_PLAUSIBLE_WEIGHT_CLASS_LIMIT = 140;

/** Lift slots: SQ1–3, BSQ, PA1–3, BPA, ST1–3, BST, TOT — red negation only on attempts. */
const NO_NEGATE_LIFT_SLOTS = new Set([3, 7, 11, 12]);

/** Lift slots: SQ1–3, BSQ, PA1–3, BPA, ST1–3, BST, TOT (IPF column ignored). */
const LIFT_SLOT_COUNT = 13;
const BENCH_ROW_LIFT_SLOTS = [4, 5, 6, 7, 12];
const DEADLIFT_ROW_LIFT_SLOTS = [8, 9, 10, 11, 12];
const COMPLETE_ROW_LIFT_SLOTS = Array.from(
  { length: LIFT_SLOT_COUNT },
  (_, index) => index,
);
const BENCH_ONLY_LIFT_SLOTS = new Set(BENCH_ROW_LIFT_SLOTS);
const DEADLIFT_ONLY_LIFT_SLOTS = new Set(DEADLIFT_ROW_LIFT_SLOTS);
const COMPLETE_LIFT_SLOTS = new Set(COMPLETE_ROW_LIFT_SLOTS);
const BENCH_ONLY_MARKERS = [
  "COPPA BERTOLETTI",
  "CAMPIONATO ITALIANO OPEN DI PANCA ",
  "GARA NAZIONALE OPEN DI PANCA",
];
const DEADLIFT_ONLY_MARKERS = [
  "GARA DI STACCO",
  "GARA OPEN DI STACCO",
  "GARA CLASSIC DI STACCO",
];
const SURNAME_PARTICLES = new Set([
  "DA",
  "DE",
  "DEL",
  "DEI",
  "DEGLI",
  "DELLA",
  "DELLE",
  "DI",
  "LA",
  "LE",
  "LO",
  "VAN",
  "VON",
]);
const DISAMBIGUATION_SUFFIX_REGEX = /\s+#\d+$/;
const DISAMBIGUATION_NAME_HEADER = "Name";
const FIPL_ATHLETES_HEADERS = ["Name", "BirthYear"];
const UNIFIED_WEIGHT_CLASS_LIST_REGEX =
  /^[-+]\d+(?:\s*,\s*[-+]\d+)+(?:\s*,\s*[-+]\d+)*$/;

/** Row start token in classification tables (matches main loop row detection). */
function isPlaceToken(text) {
  const t = String(text || "").trim();
  return /^(FG|DQ|\d+°)$/i.test(t);
}

/**
 * True when text is a category banner like "-43 Sub-Junior", "+84 Senior", "-76", or "84+".
 * Limits are capped so heavy lift attempts (e.g. -305) are never treated as class headers.
 */
function isWeightClassCategoryToken(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^\d+\+$/.test(t)) {
    const n = parseInt(t.slice(0, -1), 10);
    return Number.isFinite(n) && n <= MAX_PLAUSIBLE_WEIGHT_CLASS_LIMIT;
  }
  const isBare = /^[-+]\d+(?:\+)?$/.test(t);
  const isCombined = /^[-+]\d+(?:\+)?\s+[A-Za-zÀ-ÿ]/.test(t);
  if (!isBare && !isCombined) return false;
  const m = t.match(/^[-+](\d+)/);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n <= MAX_PLAUSIBLE_WEIGHT_CLASS_LIMIT;
}

/**
 * A weight-class banner is always immediately followed by a place token (1°, 2°, DQ, …).
 * This avoids ending a row on failed lifts like "-200" where the next token is not a place.
 * Bare limits (-93, +120) also follow IPF totals (e.g. "69,587") in the PDF stream; those are
 * not real banners — require a non-numeric, non-place previous token for bare forms.
 */
function isWeightClassHeading(
  text,
  nextText,
  isHeaderClassList,
  prevText,
  inUnifiedSection,
) {
  if (isHeaderClassList) return false;
  if (!isWeightClassCategoryToken(text) || !isPlaceToken(nextText)) {
    return false;
  }
  const t = String(text || "").trim();
  // In unified-class sheets, bare "-83" / "-93" tokens often follow IPF scores or ranks
  // but are not real banners (see 2521). Outside unified layout, "69,587 | -93 | 1°" is a
  // normal section start and must still be recognized.
  if (inUnifiedSection && /^[-+]\d+(?:\+)?$/.test(t)) {
    const p = String(prevText || "").trim();
    if (/^\d+[.,]\d+$/.test(p)) return false;
    if (/^\d+°$/i.test(p)) return false;
  }
  return true;
}

let disambiguationEntries = null;
let fiplAthletesByBaseName = null;

function toDisambiguationLookupKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function stripDisambiguationSuffix(name) {
  return String(name || "")
    .replace(DISAMBIGUATION_SUFFIX_REGEX, "")
    .trim();
}

function loadDisambiguationEntries() {
  if (disambiguationEntries) return disambiguationEntries;

  const disambiguationPath = path.join(
    DATA_DIR,
    "fipl",
    "name-disambiguation.csv",
  );
  const entries = new Map();
  if (!fs.existsSync(disambiguationPath)) {
    disambiguationEntries = entries;
    return disambiguationEntries;
  }

  const lines = fs
    .readFileSync(disambiguationPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    disambiguationEntries = entries;
    return disambiguationEntries;
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const nameIndex = headers.indexOf(DISAMBIGUATION_NAME_HEADER);
  if (nameIndex === -1) {
    disambiguationEntries = entries;
    return disambiguationEntries;
  }

  const idIndex = headers.length > 1 ? 1 : -1;

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const name = (cells[nameIndex] || "").trim();
    const idRaw = idIndex !== -1 ? (cells[idIndex] || "").trim() : "";
    const id = /^\d+$/.test(idRaw) ? Number(idRaw) : null;
    if (!name) continue;
    entries.set(toDisambiguationLookupKey(name), { id });
  }

  disambiguationEntries = entries;
  return disambiguationEntries;
}

function loadFiplAthletesByBaseName() {
  if (fiplAthletesByBaseName) return fiplAthletesByBaseName;

  const athletesPath = path.join(DATA_DIR, "fipl", "athletes.csv");
  const athletesByName = new Map();
  if (!fs.existsSync(athletesPath)) {
    fiplAthletesByBaseName = athletesByName;
    return fiplAthletesByBaseName;
  }

  const lines = fs
    .readFileSync(athletesPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    fiplAthletesByBaseName = athletesByName;
    return fiplAthletesByBaseName;
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const nameIndex = headers.indexOf(FIPL_ATHLETES_HEADERS[0]);
  const birthYearIndex = headers.indexOf(FIPL_ATHLETES_HEADERS[1]);

  if (nameIndex === -1) {
    fiplAthletesByBaseName = athletesByName;
    return fiplAthletesByBaseName;
  }

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const fullName = (cells[nameIndex] || "").trim();
    if (!fullName) continue;
    const baseName = stripDisambiguationSuffix(fullName);
    const key = toDisambiguationLookupKey(baseName);
    if (!key) continue;
    const birthYear = (cells[birthYearIndex] || "").trim();
    const current = athletesByName.get(key) || [];
    current.push({ name: fullName, birthYear });
    athletesByName.set(key, current);
  }

  fiplAthletesByBaseName = athletesByName;
  return fiplAthletesByBaseName;
}

function resolveDisambiguatedName(name, birthYear) {
  const lookupName = toDisambiguationLookupKey(name);
  if (!lookupName) return name;

  const disambiguationMap = loadDisambiguationEntries();
  const disambiguationEntry = disambiguationMap.get(lookupName);
  if (!disambiguationEntry) return name;

  const athletesByName = loadFiplAthletesByBaseName();
  const matches = athletesByName.get(lookupName) || [];
  if (matches.length === 0) return name;
  if (matches.length === 1) return matches[0].name;

  let narrowedMatches = matches;
  const validBirthYear = /^\d{4}$/.test(birthYear) ? birthYear : "";
  if (validBirthYear) {
    const matchesWithBirthYear = matches.filter(
      (candidate) => candidate.birthYear === validBirthYear,
    );
    if (matchesWithBirthYear.length > 0) {
      narrowedMatches = matchesWithBirthYear;
    }
  }

  const firstHashedMatch = narrowedMatches.find((candidate) =>
    DISAMBIGUATION_SUFFIX_REGEX.test(candidate.name),
  );
  return (firstHashedMatch || narrowedMatches[0]).name;
}

/**
 * Horizontal center of a text run in PDF user space (for column assignment).
 * @param {{ textItem: import("pdfjs-dist").TextItem }} wrapped
 * @returns {number}
 */
function textItemXCenter(wrapped) {
  const item = wrapped.textItem;
  const t = item.transform;
  const w = item.width || 0;
  return t[4] + w / 2;
}

/**
 * Right edge of a text run (start of the column to the right).
 * @param {{ textItem: import("pdfjs-dist").TextItem }} wrapped
 * @returns {number}
 */
function textItemXRight(wrapped) {
  const item = wrapped.textItem;
  const w = item.width || 0;
  return item.transform[4] + w;
}

/**
 * Left edge of a text run.
 * @param {{ textItem: import("pdfjs-dist").TextItem }} wrapped
 * @returns {number}
 */
function textItemXLeft(wrapped) {
  return wrapped.textItem.transform[4];
}

/**
 * Calibrate lift columns from the header row.
 * Returns a sparse array of length LIFT_SLOT_COUNT with center x values
 * only for slots present in this meet type.
 * @param {Array<{ textItem: import("pdfjs-dist").TextItem }>} headerItemsSlice
 * @param {number[]} slotOrder
 * @returns {Array<number | null> | null}
 */
function liftColumnCentersFromHeader(headerItemsSlice, slotOrder) {
  if (headerItemsSlice.length < slotOrder.length) return null;
  const centers = Array(LIFT_SLOT_COUNT).fill(null);
  for (let i = 0; i < slotOrder.length; i++) {
    const w = headerItemsSlice[i];
    if (!w?.textItem) return null;
    centers[slotOrder[i]] = textItemXCenter(w);
  }
  return centers;
}

/**
 * X midpoint between the TOT and IPF header cells — text to the right is not a lift field.
 * @param {Array<{ textItem: import("pdfjs-dist").TextItem }>} fullHeaderRow
 * @param {number} totIndex
 * @param {number} ipfIndex
 * @returns {number | null}
 */
function liftFieldMaxXFromHeader(fullHeaderRow, totIndex = 18, ipfIndex = 19) {
  if (fullHeaderRow.length <= Math.max(totIndex, ipfIndex)) return null;
  const tot = fullHeaderRow[totIndex];
  const ipf = fullHeaderRow[ipfIndex];
  if (!tot?.textItem || !ipf?.textItem) return null;
  return (textItemXRight(tot) + textItemXLeft(ipf)) / 2;
}

/**
 * Map lift text runs to 13 slots using x-position vs calibrated column centers.
 * Falls back to equal-width columns from the right edge of the division cell.
 * @param {Array<{ text: string, isInvalidLift: boolean, textItem: import("pdfjs-dist").TextItem }>} rowItems
 * @param {number[] | null} columnCenters from header SQ1…TOT
 * @param {number | null} liftFieldMaxX x beyond this (mid TOT|IPF) is IPF points, not a lift
 * @param {number} pageWidth PDF viewport width (scale 1)
 * @returns {(number|string)[]}
 */
function assignLiftsByCoordinates(
  rowItems,
  columnCenters,
  liftFieldMaxX,
  pageWidth,
  activeLiftSlots = COMPLETE_LIFT_SLOTS,
  rowLiftSlotOrder = COMPLETE_ROW_LIFT_SLOTS,
) {
  const lifts = Array(LIFT_SLOT_COUNT).fill("");

  const assign = (col, wrapped) => {
    if (col < 0 || col >= LIFT_SLOT_COUNT) return;
    if (!activeLiftSlots.has(col)) return;
    const v = parseLiftCell(wrapped, col);
    if (v !== "") lifts[col] = v;
  };

  let centers = columnCenters;
  if (!centers || centers.length !== LIFT_SLOT_COUNT) {
    centers = null;
  }

  const div = rowItems[5];
  if (!div?.textItem) {
    for (
      let j = 6;
      j < rowItems.length && j < 6 + rowLiftSlotOrder.length;
      j++
    ) {
      assign(rowLiftSlotOrder[j - 6], rowItems[j]);
    }
    return lifts;
  }

  const xAfterDivision = textItemXRight(div);

  for (let j = 6; j < rowItems.length; j++) {
    const it = rowItems[j];
    if (/^(FG|DQ)$/i.test(it.text)) continue;

    const cx = textItemXCenter(it);
    if (
      liftFieldMaxX != null &&
      Number.isFinite(liftFieldMaxX) &&
      cx > liftFieldMaxX
    ) {
      continue;
    }

    if (centers) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let k = 0; k < LIFT_SLOT_COUNT; k++) {
        if (!Number.isFinite(centers[k])) continue;
        const d = Math.abs(cx - centers[k]);
        if (d < bestDist) {
          bestDist = d;
          bestCol = k;
        }
      }
      if (bestDist === Infinity) continue;
      assign(bestCol, it);
      continue;
    }

    const usableRight = Math.min(
      pageWidth,
      xAfterDivision + (pageWidth - xAfterDivision) * 0.98,
    );
    const liftSpan = Math.max(usableRight - xAfterDivision, 1e-6);
    const colW = liftSpan / rowLiftSlotOrder.length;
    const rowCol = Math.min(
      rowLiftSlotOrder.length - 1,
      Math.max(0, Math.floor((cx - xAfterDivision) / colW)),
    );
    assign(rowLiftSlotOrder[rowCol], it);
  }

  return lifts;
}

/**
 * Extract red rectangles from operator list (PDF coords)
 * Tracks CTM (Current Transformation Matrix) through save/restore/transform ops
 * Returns rectangles in PDF coordinate space (not viewport-transformed)
 */
function extractRedRectangles(opList) {
  const { fnArray, argsArray } = opList;

  const rects = [];
  let currentColor = null;
  let ctm = [1, 0, 0, 1, 0, 0]; // Current Transformation Matrix (identity)
  const ctmStack = []; // Stack for save/restore

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    // Track transformation operators
    if (fn === OPS.save) {
      ctmStack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      if (ctmStack.length > 0) {
        ctm = ctmStack.pop();
      }
    } else if (fn === OPS.transform) {
      ctm = Util.transform(ctm, args);
    } else if (fn === OPS.setFillRGBColor) {
      currentColor = args;
    } else if (fn === OPS.constructPath) {
      const [ops, coords] = args;

      for (let j = 0; j < ops.length; j++) {
        if (ops[j] === OPS.rectangle) {
          if (isRedColor(currentColor)) {
            const x0 = coords[j * 4];
            const y0 = coords[j * 4 + 1];
            const w = coords[j * 4 + 2];
            const h = coords[j * 4 + 3];

            // Transform rectangle corners by CTM to get PDF space coordinates
            const corners = [
              [x0, y0],
              [x0 + w, y0],
              [x0, y0 + h],
              [x0 + w, y0 + h],
            ];

            const transformedCorners = corners.map((corner) => {
              return Util.applyTransform(corner, ctm);
            });

            // Find bounding box of transformed corners
            const xs = transformedCorners.map((c) => c[0]);
            const ys = transformedCorners.map((c) => c[1]);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            rects.push({
              x: minX,
              y: minY,
              w: maxX - minX,
              h: maxY - minY,
            });
          }
        }
      }
    }
  }

  return dedupeRects(rects);
}

/**
 * Parses weight class string like "+100" or "-100" to "100" or "-100".
 * @param {string} weightClass
 * @returns string
 */
function parseWeightClass(weightClass) {
  if (!weightClass) return "";
  const match = weightClass.match(/[-+]?(\d+)/);
  const overCategory = weightClass.startsWith("+") ? "+" : "";
  return match ? match[1] + overCategory : "";
}

/**
 * Returns true when the token is a grouped class list like:
 * "-53, -59, -66, -74, -83, -93, -105, -120, +120"
 * @param {string} text
 * @returns {boolean}
 */
function isUnifiedWeightClassList(text) {
  const normalized = String(text || "").trim();
  return UNIFIED_WEIGHT_CLASS_LIST_REGEX.test(normalized);
}

/**
 * Parse grouped classes into sortable numeric thresholds.
 * @param {string} text
 * @returns {Array<{ raw: string, limit: number, isPlus: boolean }>}
 */
function parseUnifiedWeightClassList(text) {
  if (!isUnifiedWeightClassList(text)) return [];
  const parsed = text
    .split(",")
    .map((segment) => segment.trim())
    .map((token) => {
      const match = token.match(/^([+-])(\d+(?:[.,]\d+)?)$/);
      if (!match) return null;
      const limit = parseFloat(match[2].replace(",", "."));
      if (!Number.isFinite(limit)) return null;
      return {
        raw: token,
        limit,
        isPlus: match[1] === "+",
      };
    })
    .filter(Boolean);

  // OCR in some FIPL sheets duplicates "-76" as an extra "-72".
  // When both are present, keep the canonical "-76" bucket.
  const has72 = parsed.some(
    (weightClass) => !weightClass.isPlus && weightClass.limit === 72,
  );
  const has76 = parsed.some(
    (weightClass) => !weightClass.isPlus && weightClass.limit === 76,
  );
  if (has72 && has76) {
    return parsed.filter(
      (weightClass) => weightClass.isPlus || weightClass.limit !== 72,
    );
  }

  return parsed;
}

/**
 * Infer weight class for grouped-class layouts from athlete bodyweight.
 * Picks the smallest class limit >= bodyweight.
 * Falls back to plus bucket when present.
 * @param {number} bodyweightKg
 * @param {Array<{ raw: string, limit: number, isPlus: boolean }>} groupedClasses
 * @returns {string}
 */
function inferUnifiedWeightClass(bodyweightKg, groupedClasses) {
  if (!Number.isFinite(bodyweightKg) || groupedClasses.length === 0) return "";

  const sorted = [...groupedClasses].sort((a, b) => a.limit - b.limit);
  const smallestFittingClass = sorted.find(
    (weightClass) => bodyweightKg <= weightClass.limit,
  );
  if (smallestFittingClass) {
    return parseWeightClass(smallestFittingClass.raw);
  }

  const plusClass = sorted.find((weightClass) => weightClass.isPlus);
  if (plusClass) return parseWeightClass(plusClass.raw);

  const nonPlus = sorted.filter((weightClass) => !weightClass.isPlus);
  if (nonPlus.length === 0) return "";

  const maxNonPlusLimit = Math.max(...nonPlus.map((w) => w.limit));
  if (bodyweightKg > maxNonPlusLimit) return "";

  return parseWeightClass(sorted[sorted.length - 1]?.raw || "");
}

function parseLiftCell(itemObj, slotIndex) {
  const item = itemObj.text.trim();
  if (item === "" || item === "-" || item === "—") return "";

  if (!/^\d+[.,]\d+$|^\d+$/.test(item)) return "";

  let num = parseFloat(item.replace(",", "."));
  if (Number.isNaN(num)) return "";

  // Some sheets print 0 for an empty best / total cell.
  if (num === 0 && NO_NEGATE_LIFT_SLOTS.has(slotIndex)) return "";

  if (
    itemObj.isInvalidLift &&
    num > 0 &&
    !NO_NEGATE_LIFT_SLOTS.has(slotIndex)
  ) {
    num = -num;
  }
  return num;
}

/**
 * Parse row data
 * @param {number[] | null} liftColumnCenters x-centers for SQ1…TOT from the header row
 * @param {number | null} liftFieldMaxX exclude IPF column (see liftFieldMaxXFromHeader)
 * @param {number} pageWidth PDF page width (viewport scale 1) for equal-width fallback
 */
function parseRowData(
  rowItems,
  weightClass,
  unifiedWeightClassGroup,
  liftColumnCenters,
  liftFieldMaxX,
  pageWidth,
  meetType,
  sex,
  equipment,
  isOpenDivision,
  activeLiftSlots,
  rowLiftSlotOrder,
) {
  if (rowItems.length < 6) return null;

  const normalizedRowItems = [...rowItems];
  const rawNameToken = normalizedRowItems[1]?.text?.trim() || "";
  const nameWordCount = rawNameToken.split(/\s+/).filter(Boolean).length;

  // Some rows split names into separate tokens.
  // Merge them so downstream fixed-column parsing keeps the expected offsets.
  if (nameWordCount === 1 && normalizedRowItems.length > 2) {
    const secondNameToken = normalizedRowItems[2]?.text?.trim() || "";
    const thirdNameToken = normalizedRowItems[3]?.text?.trim() || "";
    const hasSurnameParticle =
      SURNAME_PARTICLES.has(secondNameToken.toUpperCase()) && thirdNameToken;
    const mergedName = hasSurnameParticle
      ? `${normalizedRowItems[1].text} ${secondNameToken} ${thirdNameToken}`.trim()
      : `${normalizedRowItems[1].text} ${secondNameToken}`.trim();

    normalizedRowItems[1] = {
      ...normalizedRowItems[1],
      text: mergedName,
    };
    normalizedRowItems.splice(2, hasSurnameParticle ? 2 : 1);
  }

  let place = normalizedRowItems[0].text.replace("°", "");
  if (place === "FG") place = "DQ";

  const birthYearIndex = normalizedRowItems.findIndex(
    (item, index) => index >= 3 && /^\d{4}$/.test(item.text),
  );
  if (birthYearIndex < 0 || birthYearIndex + 2 >= normalizedRowItems.length) {
    return null;
  }

  const nameTokens = normalizedRowItems
    .slice(1, Math.max(2, birthYearIndex - 1))
    .map((item) => item.text)
    .filter(Boolean);
  const rawName = nameTokens.join(" ").trim() || normalizedRowItems[1].text;
  const birthYear = normalizedRowItems[birthYearIndex].text;
  const normalizedName = normalizeFullName(rawName);
  const finalName = resolveDisambiguatedName(
    withNameOverride(normalizedName, birthYear),
    birthYear,
  );
  const bodyweightStr = normalizedRowItems[birthYearIndex + 1].text;
  const division = normalizedRowItems[birthYearIndex + 2].text;

  const bodyweightKg = parseFloat(bodyweightStr.replace(",", "."));
  const hasValidBirthYear = /^\d{4}$/.test(birthYear);
  const hasValidBodyweight = Number.isFinite(bodyweightKg);
  const isHeaderLikeDivision = /^(SOCIETÀ|CAT\.\s*ETÀ)$/i.test(division);
  if (!hasValidBirthYear || !hasValidBodyweight || isHeaderLikeDivision) {
    return null;
  }

  const lifts = assignLiftsByCoordinates(
    normalizedRowItems,
    liftColumnCenters,
    liftFieldMaxX,
    pageWidth,
    activeLiftSlots,
    rowLiftSlotOrder,
  );

  while (lifts.length < 14) lifts.push("");

  const inferredUnifiedWeightClass = inferUnifiedWeightClass(
    bodyweightKg,
    unifiedWeightClassGroup,
  );
  const normalizedWeightClass =
    inferredUnifiedWeightClass || parseWeightClass(weightClass);

  return {
    Place: place,
    Name: finalName,
    Sex: sex,
    Event: meetType === "bench" ? "B" : meetType === "deadlift" ? "D" : "SBD",
    Division: isOpenDivision ? "Open" : division || "Sub-Junior",
    WeightClassKg: normalizedWeightClass,
    Equipment: equipment,
    BirthDate: "",
    BirthYear: birthYear,
    BodyweightKg: bodyweightKg,
    Squat1Kg: lifts[0] || "",
    Squat2Kg: lifts[1] || "",
    Squat3Kg: lifts[2] || "",
    Best3SquatKg: lifts[3] || "",
    Bench1Kg: lifts[4] || "",
    Bench2Kg: lifts[5] || "",
    Bench3Kg: lifts[6] || "",
    Best3BenchKg: lifts[7] || "",
    Deadlift1Kg: lifts[8] || "",
    Deadlift2Kg: lifts[9] || "",
    Deadlift3Kg: lifts[10] || "",
    Best3DeadliftKg: lifts[11] || "",
    TotalKg: lifts[12] || "",
  };
}

/**
 * Read row — collect every PDF token until the next row marker.
 * A fixed token count breaks when names/teams span multiple text runs.
 */
function parseRow(
  items,
  startIndex,
  weightClass,
  unifiedWeightClassGroup,
  liftColumnCenters,
  liftFieldMaxX,
  pageWidth,
  meetType,
  equipment,
  isOpenDivision,
  activeLiftSlots,
  rowLiftSlotOrder,
) {
  const rowItems = [];

  let i = startIndex;
  while (i < items.length) {
    const item = items[i].text;
    const nextItem = items[i + 1]?.text || "";
    const prevItem = i > startIndex ? items[i - 1]?.text || "" : "";
    const isHeaderClassList =
      /,\s*[-+]\d+/.test(item) && /CLASSIFICA CAT\./i.test(nextItem);

    if (isUnifiedWeightClassList(item)) break;

    if (
      isWeightClassHeading(
        item,
        nextItem,
        isHeaderClassList,
        prevItem,
        unifiedWeightClassGroup.length > 0,
      )
    )
      break;
    if (i > startIndex && /^(FG|DQ|\d+°)$/.test(item)) break;

    rowItems.push(items[i]);
    i++;
  }

  return {
    entry: parseRowData(
      rowItems,
      weightClass,
      unifiedWeightClassGroup,
      liftColumnCenters,
      liftFieldMaxX,
      pageWidth,
      meetType,
      rowItems[0]?.sex || "M",
      equipment,
      isOpenDivision,
      activeLiftSlots,
      rowLiftSlotOrder,
    ),
    nextIndex: i,
  };
}

/**
 * Parse PDF
 * @param {Uint8Array} pdfBytes
 * @param {{ isOpenDivision?: boolean }} [options]
 */
async function parseEntriesFromFiplPdfBytes(pdfBytes, options = {}) {
  const pdf = await getDocument({ data: pdfBytes }).promise;

  const page1 = await pdf.getPage(1);
  const page1Content = await page1.getTextContent();
  const pageWidth = page1.getViewport({ scale: 1 }).width;
  const page1Text = page1Content.items
    .map((item) => item.str || "")
    .join(" ")
    .toUpperCase();
  const isDeadliftOnly = DEADLIFT_ONLY_MARKERS.some((x) =>
    page1Text.includes(x),
  );
  const isBenchOnly = BENCH_ONLY_MARKERS.some((x) => page1Text.includes(x));
  const meetType = isDeadliftOnly
    ? "deadlift"
    : isBenchOnly
      ? "bench"
      : "complete";
  const activeLiftSlots =
    meetType === "bench"
      ? BENCH_ONLY_LIFT_SLOTS
      : meetType === "deadlift"
        ? DEADLIFT_ONLY_LIFT_SLOTS
        : COMPLETE_LIFT_SLOTS;
  const rowLiftSlotOrder =
    meetType === "bench"
      ? BENCH_ROW_LIFT_SLOTS
      : meetType === "deadlift"
        ? DEADLIFT_ROW_LIFT_SLOTS
        : COMPLETE_ROW_LIFT_SLOTS;
  const equipment = page1Content.items.some((item) =>
    /ATTREZZAT/i.test(item.str || ""),
  )
    ? "Single-ply"
    : "Raw";
  const isOpenDivision =
    options.isOpenDivision !== undefined
      ? options.isOpenDivision
      : page1Text.includes("OPEN");
  const hasUnifiedWeightClassLayout =
    page1Text.includes("COPPA ITALIA") && page1Text.includes("ATTREZZAT");

  const allItems = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageTexts = content.items
      .map((item) => item.str || "")
      .filter((text) => text.trim().length > 0);

    const hasClassificationTable = pageTexts.some((text) =>
      text.includes("CLASSIFICA CAT."),
    );
    if (!hasClassificationTable) {
      continue;
    }
    const pageSex = pageTexts.some((text) =>
      text.includes("CLASSIFICA CAT. FEMMINILE"),
    )
      ? "F"
      : "M";

    // Extract red rectangles in PDF coordinate space
    const opList = await page.getOperatorList();
    const redRects = extractRedRectangles(opList);

    for (const item of content.items) {
      if (item.str && item.str.trim().length > 0) {
        const textX = item.transform[4];
        const textY = item.transform[5];
        const textWidth = item.width || 0;
        const textHeight = item.height || 0;

        const isInvalidLift = isInAnyRectangle(
          textX,
          textY,
          textWidth,
          textHeight,
          redRects,
        );

        allItems.push({
          text: item.str.trim(),
          isInvalidLift,
          sex: pageSex,
          textItem: item,
        });
      }
    }
  }

  const headers =
    meetType === "bench"
      ? [
          "POS",
          "ATLETA",
          "SOCIETÀ",
          "A.N.",
          "PESO",
          "CAT. ETÀ",
          "PA1",
          "PA2",
          "PA3",
          "BPA",
          "TOT",
          "IPF POINTS",
        ]
      : meetType === "deadlift"
        ? [
            "POS",
            "ATLETA",
            "SOCIETÀ",
            "A.N.",
            "PESO",
            "CAT. ETÀ",
            "ST1",
            "ST2",
            "ST3",
            "BST",
            "TOT",
            "IPF POINTS",
          ]
        : [
            "POS",
            "ATLETA",
            "SOCIETÀ",
            "A.N.",
            "PESO",
            "CAT. ETÀ",
            "SQ1",
            "SQ2",
            "SQ3",
            "BSQ",
            "PA1",
            "PA2",
            "PA3",
            "BPA",
            "ST1",
            "ST2",
            "ST3",
            "BST",
            "TOT",
            "IPF POINTS",
          ];

  const entries = [];
  let currentWeightClass = "";
  let currentUnifiedWeightClassGroup = [];

  let headerStart = 0;
  while (
    headerStart < allItems.length &&
    !headers.includes(allItems[headerStart].text)
  ) {
    headerStart++;
  }

  const fullHeaderRow = allItems.slice(
    headerStart,
    headerStart + headers.length,
  );
  const liftColumnCenters =
    meetType === "bench"
      ? liftColumnCentersFromHeader(
          fullHeaderRow.slice(6, 11),
          [4, 5, 6, 7, 12],
        )
      : meetType === "deadlift"
        ? liftColumnCentersFromHeader(
            fullHeaderRow.slice(6, 11),
            [8, 9, 10, 11, 12],
          )
        : liftColumnCentersFromHeader(
            fullHeaderRow.slice(6, 6 + LIFT_SLOT_COUNT),
            COMPLETE_ROW_LIFT_SLOTS,
          );
  const liftFieldMaxX =
    meetType === "bench"
      ? liftFieldMaxXFromHeader(fullHeaderRow, 10, 11)
      : meetType === "deadlift"
        ? liftFieldMaxXFromHeader(fullHeaderRow, 10, 11)
        : liftFieldMaxXFromHeader(fullHeaderRow);

  let i = 0;

  while (i < allItems.length) {
    const item = allItems[i].text;
    const nextItem = allItems[i + 1]?.text || "";
    const prevItem = i > 0 ? allItems[i - 1]?.text || "" : "";
    const isHeaderClassList =
      /,\s*[-+]\d+/.test(item) && /CLASSIFICA CAT\./i.test(nextItem);
    if (isUnifiedWeightClassList(item)) {
      currentUnifiedWeightClassGroup = parseUnifiedWeightClassList(item);
      i++;
      continue;
    }

    if (
      isWeightClassHeading(
        item,
        nextItem,
        isHeaderClassList,
        prevItem,
        currentUnifiedWeightClassGroup.length > 0,
      )
    ) {
      currentWeightClass = item;
      currentUnifiedWeightClassGroup = [];
      i++;
      continue;
    }

    if (/^(FG|DQ|\d+°)$/.test(item)) {
      const row = parseRow(
        allItems,
        i,
        currentWeightClass,
        currentUnifiedWeightClassGroup,
        liftColumnCenters,
        liftFieldMaxX,
        pageWidth,
        meetType,
        equipment,
        isOpenDivision,
        activeLiftSlots,
        rowLiftSlotOrder,
      );
      if (row.entry) entries.push(row.entry);
      i = row.nextIndex;
    } else {
      i++;
    }
  }

  return { entries, meetType };
}

function entriesToOplCsv(
  entries,
  meetType = "complete",
  options = { sort: false },
) {
  const commonHeaders = [
    "Place",
    "Name",
    "Sex",
    "Event",
    "Division",
    "WeightClassKg",
    "Equipment",
    "BirthDate",
    "BirthYear",
    "BodyweightKg",
  ];
  const liftHeaders =
    meetType === "bench"
      ? ["Bench1Kg", "Bench2Kg", "Bench3Kg", "Best3BenchKg", "TotalKg"]
      : meetType === "deadlift"
        ? [
            "Deadlift1Kg",
            "Deadlift2Kg",
            "Deadlift3Kg",
            "Best3DeadliftKg",
            "TotalKg",
          ]
        : [
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
          ];
  const headers = [...commonHeaders, ...liftHeaders];

  const csvDataLines = [];

  for (const entry of entries) {
    const row = headers.map((header) => {
      const value = entry[header];
      if (value === "" || value == null) return "";

      // format numbers
      if (typeof value === "number") {
        if (header === "BodyweightKg") return value.toFixed(2);
        return value.toFixed(1);
      }

      return value;
    });

    csvDataLines.push(row.join(","));
  }

  if (options.sort) csvDataLines.sort();
  return [headers.join(","), ...csvDataLines].join("\n") + "\n";
}

/**
 * @param {Uint8Array | Buffer} pdfBytes
 * @param {{ isOpenDivision?: boolean }} [options]
 */
export async function convertFiplPdfBytesToOplCsv(pdfBytes, options = {}) {
  const normalizedBytes = Buffer.isBuffer(pdfBytes)
    ? new Uint8Array(pdfBytes)
    : pdfBytes;
  const { entries: parsedEntries, meetType } =
    await parseEntriesFromFiplPdfBytes(
      normalizedBytes instanceof Uint8Array
        ? normalizedBytes
        : new Uint8Array(normalizedBytes),
      options,
    );
  return entriesToOplCsv(parsedEntries, meetType);
}

/**
 * @param {string} pdfPath
 * @param {string} outputPath
 * @param {{ isOpenDivision?: boolean }} [options] forwarded to {@link convertFiplPdfBytesToOplCsv}
 */
export async function convertFiplPdfToOplCsv(
  pdfPath,
  outputPath,
  options = {},
) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const csv = await convertFiplPdfBytesToOplCsv(pdfBuffer, options);
  fs.writeFileSync(outputPath, csv, "utf-8");
}

export const convertPdfBytesToOplCsv = convertFiplPdfBytesToOplCsv;
export const convertPdfToOplCsv = convertFiplPdfToOplCsv;
