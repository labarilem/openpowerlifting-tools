const fs = require("fs");
const path = require("path");
const pdfjs = require("pdfjs-dist");

/**
 * Parse powerlifting competition PDF using structural approach
 * Reads text elements in order from PDF and groups them into rows
 */
async function parsePdfStructural(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;

    const allItems = [];

    // Extract text from all pages, preserving invalid lift info
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      // Collect text items with invalid lift detection based on red rectangles
      for (const item of content.items) {
        if (item.str && item.str.trim().length > 0) {
          const textX = item.transform[4];
          const textY = item.transform[5];
          const isInvalidLift = // isInRedRectangle(textX, textY);

          allItems.push({
            text: item.str.trim(),
            isInvalidLift,
            textItem: item,
          });
        }
      }
    }

    console.log(`Extracted ${allItems.length} text items from PDF`);

    // Expected column headers in order
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

    // Skip title and header
    while (i < allItems.length && !headers.includes(allItems[i].text)) {
      i++;
    }

    // Skip header row
    i += headers.length;

    // Parse rows
    while (i < allItems.length) {
      const item = allItems[i].text;

      // Check for weight class markers
      if (/^[-+]\d+$/.test(item)) {
        currentWeightClass = item;
        i++;
        continue;
      }

      // Check if this is a data row (starts with position)
      if (/^(FG|DQ|\d+°)$/.test(item)) {
        const row = readRow(allItems, i, headers.length, currentWeightClass);
        if (row.entry) {
          entries.push(row.entry);
        }
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
 * Read a single row of data from items array
 */
function readRow(items, startIndex, expectedFieldCount, weightClass) {
  const rowItems = [];

  // Collect items for this row
  let i = startIndex;
  const position = items[startIndex].text;
  const isDQ = position === "DQ";
  const isFG = position === "FG";

  while (i < items.length) {
    const item = items[i].text;

    // Stop if we hit a new weight class
    if (/^[-+]\d+$/.test(item)) {
      break;
    }

    // Stop if we hit a new position marker (next row)
    if (i > startIndex && /^(FG|DQ|\d+°)$/.test(item)) {
      break;
    }

    rowItems.push(items[i]);
    i++;

    // For DQ/FG entries, collect up to 20 items
    // For normal entries, collect all expected fields
    if (rowItems.length >= (isDQ || isFG ? 20 : expectedFieldCount)) {
      break;
    }
  }

  const entry = parseRowData(rowItems, weightClass);

  return {
    entry: entry,
    nextIndex: i,
  };
}

/**
 * Parse row data into entry object
 */
function parseRowData(rowItems, weightClass) {
  try {
    if (rowItems.length < 6) {
      return null;
    }

    let place = rowItems[0].text.replace("°", "");
    // Convert FG to DQ for output
    if (place === "FG") {
      place = "DQ";
    }
    const name = toTitleCase(rowItems[1].text);
    const team = toTitleCase(rowItems[2].text);
    const birthYear = rowItems[3].text;
    const bodyweightStr = rowItems[4].text;
    const division = rowItems[5].text;

    // Parse bodyweight
    const bodyweightKg = parseFloat(bodyweightStr.replace(",", "."));

    // Parse lift numbers starting from index 6
    const isDQ = place === "DQ";
    const isFG = place === "DQ";

    const lifts = [];
    for (let j = 6; j < rowItems.length; j++) {
      const itemObj = rowItems[j];
      const item = itemObj.text;

      // Stop on non-numeric or special markers
      if (/^(FG|DQ|Sub-Junior|Senior|Master)$/i.test(item)) {
        break;
      }

      // Try to parse as number
      if (/^\d+[.,]\d+$|^\d+$/.test(item)) {
        let num = parseFloat(item.replace(",", "."));
        // If marked as in red rectangle (invalid), prefix with negative to indicate failed lift
        if (itemObj.isInvalidLift && num > 0) {
          num = -num;
        }
        lifts.push(num);
      }
    }

    // For DQ/FG entries, allow fewer lift values (they may be incomplete)
    // For normal entries, we need: sq1-3, bsq, bench1-3, bbench, deadlift1-3, bdeadlift, total = 13 values
    const minLifts = isDQ || isFG ? 0 : 13;
    if (lifts.length < minLifts) {
      return null;
    }

    // Pad lifts array to expected length for consistent output
    while (lifts.length < 14) {
      lifts.push("");
    }

    const entry = {
      Place: place,
      Name: name,
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

    return entry;
  } catch (error) {
    console.log("Error parsing row:", error.message);
    return null;
  }
}

/**
 * Parse weight class from string like "-59" or "+120"
 */
function parseWeightClass(weightClass) {
  if (!weightClass) return "";
  const match = weightClass.match(/[-+]?(\d+)/);
  return match ? parseFloat(match[1]) : "";
}

/**
 * Convert string to Title Case (capitalize each word)
 */
function toTitleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Convert entries array to CSV format
 */
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

  const csvLines = [headers.join(",")];

  for (const entry of entries) {
    const row = headers.map((header) => {
      const value = entry[header];
      if (value === "" || value === null || value === undefined) return "";
      // Format numeric columns with specific decimal places
      if (typeof value === "number") {
        if (header === "BodyweightKg") {
          return value.toFixed(2);
        }
        // Lift columns: 1 decimal place
        if (
          [
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
          ].includes(header)
        ) {
          return value.toFixed(1);
        }
      }
      if (typeof value === "string" && value.includes(",")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvLines.push(row.join(","));
  }

  return csvLines.join("\n");
}

/**
 * Main execution
 */
async function main() {
  const examplesDir = path.join(__dirname, "..", "examples", "1");
  const pdfPath = path.join(examplesDir, "input-cut.pdf");
  const outputPath = path.join(examplesDir, "entries-parsed.csv");

  try {
    console.log("Parsing PDF (structural approach):", pdfPath);
    const entries = await parsePdfStructural(pdfPath);

    console.log(`Extracted ${entries.length} entries\n`);

    // Show first few entries
    if (entries.length > 0) {
      console.log("First entry:", entries[0]);
    }

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
