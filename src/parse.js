const fs = require("fs");
const path = require("path");
const pdfjs = require("pdfjs-dist");
const { teamNames } = require("./team-names");
const { firstNames } = require("./first-names");

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
          if (isRed(currentColor)) {
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

function isRed(color) {
  if (!color) return false;
  return color.join(",") === "255,0,0";
}

function dedupeRects(rects) {
  const seen = new Set();
  const result = [];

  for (const r of rects) {
    const key = `${r.x}|${r.y}|${r.w}|${r.h}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
      // console.log(r);
    }
  }

  return result;
}

function isInAnyRectangle(textX, textY, textWidth, textHeight, rects) {
  // Check if text (in PDF coords) overlaps any red rectangle (in PDF coords)
  // Both use same PDF coordinate space now
  return rects.some((rect) => {
    const textRight = textX + textWidth;
    const textTop = textY + textHeight;
    const rectRight = rect.x + rect.w;
    const rectTop = rect.y + rect.h;

    // AABB: no overlap if separated on any axis
    const noIntersection =
      textRight < rect.x || // text is entirely to the left
      textX > rectRight || // text is entirely to the right
      textTop < rect.y || // text is entirely below
      textY > rectTop; // text is entirely above

    return !noIntersection;
  });
}

/**
 * Parse PDF
 */
async function parsePdfStructural(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;

    const allItems = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });

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

          // console.log({ text: item.str, transform: item.transform });

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
    let i = 0;

    while (i < allItems.length && !headers.includes(allItems[i].text)) {
      i++;
    }

    i += headers.length;

    while (i < allItems.length) {
      const item = allItems[i].text;

      if (/^[-+]\d+$/.test(item)) {
        currentWeightClass = item;
        i++;
        continue;
      }

      if (/^(FG|DQ|\d+°)$/.test(item)) {
        const row = readRow(allItems, i, headers.length, currentWeightClass);
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

/**
 * Read row
 */
function readRow(items, startIndex, expectedFieldCount, weightClass) {
  const rowItems = [];

  let i = startIndex;
  const position = items[startIndex].text;
  const isDQ = position === "DQ";
  const isFG = position === "FG";

  while (i < items.length) {
    const item = items[i].text;

    if (/^[-+]\d+$/.test(item)) break;
    if (i > startIndex && /^(FG|DQ|\d+°)$/.test(item)) break;

    rowItems.push(items[i]);
    i++;

    if (rowItems.length >= (isDQ || isFG ? 20 : expectedFieldCount)) {
      break;
    }
  }

  return {
    entry: parseRowData(rowItems, weightClass),
    nextIndex: i,
  };
}

/**
 * Parse row data
 */
function parseRowData(rowItems, weightClass) {
  try {
    if (rowItems.length < 6) return null;

    let place = rowItems[0].text.replace("°", "");
    if (place === "FG") place = "DQ";

    // Reverse name/surname order (space-separated)
    // Handle various apostrophe characters (', ´, ʹ, ')
    /** @type Array<string> */
    const nameParts = rowItems[1].text.split(/\s+/);
    let lastFirstNameIndex = nameParts.length - 1;
    for (let i = lastFirstNameIndex - 1; i > 0; i--) {
      if (firstNames.has(nameParts[i].toLowerCase())) {
        lastFirstNameIndex = i;
        i--;
      } else break;
    }
    const name = toTitleCase(
      [...nameParts.splice(lastFirstNameIndex), ...nameParts].join(" "),
    );
    const normalizedName = name
      .replaceAll(/a['´ʹ']/g, "à")
      .replaceAll(/e['´ʹ']/g, "è")
      .replaceAll(/i['´ʹ']/g, "ì")
      .replaceAll(/o['´ʹ']/g, "ò")
      .replaceAll(/u['´ʹ']/g, "ù");

    const team =
      teamNames.get(rowItems[2].text.toLowerCase()) ||
      toTitleCase(rowItems[2].text);
    const birthYear = rowItems[3].text;
    const bodyweightStr = rowItems[4].text;
    const division = rowItems[5].text;

    const bodyweightKg = parseFloat(bodyweightStr.replace(",", "."));

    const isDQ = place === "DQ";
    const isFG = place === "DQ";

    const lifts = [];

    for (let j = 6; j < rowItems.length; j++) {
      const itemObj = rowItems[j];
      const item = itemObj.text;

      if (/^(FG|DQ|Sub-Junior|Senior|Master)$/i.test(item)) break;

      if (/^\d+[.,]\d+$|^\d+$/.test(item)) {
        let num = parseFloat(item.replace(",", "."));
        if (itemObj.isInvalidLift && num > 0) {
          num = -num;
        }
        lifts.push(num);
      }
    }

    const minLifts = isDQ || isFG ? 0 : 13;
    if (lifts.length < minLifts) return null;

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
      BodyweightKg: bodyweightKg.toFixed(2),
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
    console.log("Error parsing row:", error.message);
    return null;
  }
}

/**
 * parseWeightClass
 * @param {string} weightClass
 * @returns string
 */
function parseWeightClass(weightClass) {
  if (!weightClass) return "";
  const match = weightClass.match(/[-+]?(\d+)/);
  const overCategory = weightClass.startsWith("+") ? "+" : "";
  return match ? match[1] + overCategory : "";
}

function toTitleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function entriesToCsv(entries) {
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

      if (typeof value === "string" && value.includes(",")) {
        return `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    });

    csvDataLines.push(row.join(","));
  }

  csvDataLines.sort();

  return [headers.join(","), ...csvDataLines].join("\n");
}

async function main() {
  const examplesDir = path.join(__dirname, "..", "examples", "1");
  const pdfPath = path.join(examplesDir, "input-cut.pdf");
  const outputPath = path.join(examplesDir, "entries-parsed.csv");

  try {
    console.log("Parsing PDF:", pdfPath);
    const entries = await parsePdfStructural(pdfPath);

    console.log(`Extracted ${entries.length} entries\n`);
    if (entries.length > 0) console.log("First entry:", entries[0]);

    const csv = entriesToCsv(entries);
    fs.writeFileSync(outputPath, csv, "utf-8");

    console.log(`\nCSV saved to: ${outputPath}`);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parsePdfStructural, entriesToCsv };
