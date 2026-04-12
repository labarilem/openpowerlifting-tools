import fs from "fs";
import path from "path";
import pdfjs from "pdfjs-dist";
import { toTitleCase } from "./lib/format.js";
import { normalizeFullName } from "./lib/names.js";
import { dedupeRects, isInAnyRectangle, isRedColor } from "./lib/pdf.js";
import { teamNames } from "./lib/team-names.js";

/** Lift slots: SQ1–3, BSQ, PA1–3, BPA, ST1–3, BST, TOT — red negation only on attempts. */
const NO_NEGATE_LIFT_SLOTS = new Set([3, 7, 11, 12]);

/** Lift slots: SQ1–3, BSQ, PA1–3, BPA, ST1–3, BST, TOT (IPF column ignored). */
const LIFT_SLOT_COUNT = 13;

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
 * Calibrate lift columns from the header row: one x-center per SQ1…TOT cell.
 * @param {Array<{ textItem: import("pdfjs-dist").TextItem }>} headerItemsSlice
 * @returns {number[] | null}
 */
function liftColumnCentersFromHeader(headerItemsSlice) {
  if (headerItemsSlice.length < LIFT_SLOT_COUNT) return null;
  const centers = [];
  for (let i = 0; i < LIFT_SLOT_COUNT; i++) {
    const w = headerItemsSlice[i];
    if (!w?.textItem) return null;
    centers.push(textItemXCenter(w));
  }
  return centers;
}

/**
 * X midpoint between the TOT and IPF header cells — text to the right is not a lift field.
 * @param {Array<{ textItem: import("pdfjs-dist").TextItem }>} fullHeaderRow 20 items POS…IPF POINTS
 * @returns {number | null}
 */
function liftFieldMaxXFromHeader(fullHeaderRow) {
  if (fullHeaderRow.length < 20) return null;
  const tot = fullHeaderRow[18];
  const ipf = fullHeaderRow[19];
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
function assignLiftsByCoordinates(rowItems, columnCenters, liftFieldMaxX, pageWidth) {
  const lifts = Array(LIFT_SLOT_COUNT).fill("");

  const assign = (col, wrapped) => {
    if (col < 0 || col >= LIFT_SLOT_COUNT) return;
    const v = parseLiftCell(wrapped, col);
    if (v !== "") lifts[col] = v;
  };

  let centers = columnCenters;
  if (!centers || centers.length !== LIFT_SLOT_COUNT) {
    centers = null;
  }

  const div = rowItems[5];
  if (!div?.textItem) {
    for (let j = 6; j < rowItems.length && j < 6 + LIFT_SLOT_COUNT; j++) {
      assign(j - 6, rowItems[j]);
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
        const d = Math.abs(cx - centers[k]);
        if (d < bestDist) {
          bestDist = d;
          bestCol = k;
        }
      }
      assign(bestCol, it);
      continue;
    }

    const usableRight = Math.min(pageWidth, xAfterDivision + (pageWidth - xAfterDivision) * 0.98);
    const liftSpan = Math.max(usableRight - xAfterDivision, 1e-6);
    const colW = liftSpan / LIFT_SLOT_COUNT;
    const col = Math.min(
      LIFT_SLOT_COUNT - 1,
      Math.max(0, Math.floor((cx - xAfterDivision) / colW)),
    );
    assign(col, it);
  }

  return lifts;
}

/**
 * Extract red rectangles from operator list (PDF coords)
 * Tracks CTM (Current Transformation Matrix) through save/restore/transform ops
 * Returns rectangles in PDF coordinate space (not viewport-transformed)
 */
function extractRedRectangles(opList, pdfjs) {
  const { fnArray, argsArray } = opList;
  const OPS = pdfjs.OPS;
  const Util = pdfjs.Util;

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
function parseRowData(rowItems, weightClass, liftColumnCenters, liftFieldMaxX, pageWidth) {
  try {
    if (rowItems.length < 6) return null;

    let place = rowItems[0].text.replace("°", "");
    if (place === "FG") place = "DQ";

    const normalizedName = normalizeFullName(rowItems[1].text);
    const team =
      teamNames.get(rowItems[2].text.toLowerCase()) ||
      toTitleCase(rowItems[2].text);
    const birthYear = rowItems[3].text;
    const bodyweightStr = rowItems[4].text;
    const division = rowItems[5].text;

    const bodyweightKg = parseFloat(bodyweightStr.replace(",", "."));

    const lifts = assignLiftsByCoordinates(
      rowItems,
      liftColumnCenters,
      liftFieldMaxX,
      pageWidth,
    );

    while (lifts.length < 14) lifts.push("");

    return {
      Place: place,
      Name: normalizedName,
      Team: team,
      Sex: "M",
      Event: "SBD",
      Division: division || "Sub-Junior",
      WeightClassKg: parseWeightClass(weightClass),
      Equipment: "Raw",
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
  } catch (error) {
    console.log("Error parsing row", error);
    return null;
  }
}

/**
 * Read row — collect every PDF token until the next row marker.
 * A fixed token count breaks when names/teams span multiple text runs.
 */
function parseRow(
  items,
  startIndex,
  weightClass,
  liftColumnCenters,
  liftFieldMaxX,
  pageWidth,
) {
  const rowItems = [];

  let i = startIndex;
  while (i < items.length) {
    const item = items[i].text;

    if (/^[-+]\d+$/.test(item)) break;
    if (i > startIndex && /^(FG|DQ|\d+°)$/.test(item)) break;

    rowItems.push(items[i]);
    i++;
  }

  return {
    entry: parseRowData(
      rowItems,
      weightClass,
      liftColumnCenters,
      liftFieldMaxX,
      pageWidth,
    ),
    nextIndex: i,
  };
}

/**
 * Parse PDF
 */
async function parsePdf(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;

    const page1 = await pdf.getPage(1);
    const pageWidth = page1.getViewport({ scale: 1 }).width;

    const allItems = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // Extract red rectangles in PDF coordinate space
      const opList = await page.getOperatorList();
      const redRects = extractRedRectangles(opList, pdfjs);

      const content = await page.getTextContent();

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
            textItem: item,
          });
        }
      }
    }

    console.log(`Extracted ${allItems.length} text items from PDF`);

    const headers = [
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

    let headerStart = 0;
    while (headerStart < allItems.length && !headers.includes(allItems[headerStart].text)) {
      headerStart++;
    }

    const fullHeaderRow = allItems.slice(headerStart, headerStart + headers.length);
    const liftColumnCenters = liftColumnCentersFromHeader(
      fullHeaderRow.slice(6, 6 + LIFT_SLOT_COUNT),
    );
    const liftFieldMaxX = liftFieldMaxXFromHeader(fullHeaderRow);

    let i = headerStart + headers.length;

    while (i < allItems.length) {
      const item = allItems[i].text;

      if (/^[-+]\d+$/.test(item)) {
        currentWeightClass = item;
        i++;
        continue;
      }

      if (/^(FG|DQ|\d+°)$/.test(item)) {
        const row = parseRow(
          allItems,
          i,
          currentWeightClass,
          liftColumnCenters,
          liftFieldMaxX,
          pageWidth,
        );
        if (row.entry) entries.push(row.entry);
        i = row.nextIndex;
      } else {
        i++;
      }
    }

    return entries;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw error;
  }
}

function entriesToCsv(entries, options = { sort: true }) {
  const headers = [
    "Place",
    "Name",
    "Team",
    "Sex",
    "Event",
    "Division",
    "WeightClassKg",
    "Equipment",
    "BirthDate",
    "BirthYear",
    "BodyweightKg",
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

  const csvDataLines = [];

  for (const entry of entries) {
    const row = headers.map((header) => {
      const value = entry[header];
      if (value === "" || value == null) return "";

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

async function main() {
  const examplesDir = path.join("./examples", "1");
  const pdfPath = path.join(examplesDir, "input-cut.pdf");
  const outputPath = path.join(examplesDir, "entries-parsed.csv");

  try {
    console.log("Parsing PDF:", pdfPath);
    const entries = await parsePdf(pdfPath);
    console.log(`Extracted ${entries.length} entries`);
    const csv = entriesToCsv(entries);
    fs.writeFileSync(outputPath, csv, "utf-8");
    console.log(`CSV saved to: ${outputPath}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
