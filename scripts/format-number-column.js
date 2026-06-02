#!/usr/bin/env node

import fs from "fs";

import { joinCsvRow, parseCsvLine } from "../packages/opl-tools/src/lib/csv.js";

function printUsage() {
  console.error(
    "Usage: node scripts/format-number-column.js <csvPath> <columnName> <decimalDigits>",
  );
  console.error("");
  console.error("  csvPath        - Path to the CSV file (updated in place)");
  console.error("  columnName     - Header name of the column to format");
  console.error(
    "  decimalDigits  - Number of digits after the decimal point (non-negative integer)",
  );
  console.error("");
  console.error("Example:");
  console.error(
    "  node scripts/format-number-column.js tests/dataset/fipl/2601/entries.csv TotalKg 2",
  );
}

function parseArgs(argv) {
  if (argv.length !== 3) {
    printUsage();
    process.exit(1);
  }

  const [csvPath, columnName, decimalDigitsRaw] = argv;
  const decimalDigits = Number.parseInt(decimalDigitsRaw, 10);

  if (!Number.isInteger(decimalDigits) || decimalDigits < 0) {
    console.error("decimalDigits must be a non-negative integer.");
    process.exit(1);
  }

  return { csvPath, columnName, decimalDigits };
}

function formatNumericColumn(csvText, columnName, decimalDigits) {
  const hasTrailingNewline = csvText.endsWith("\n");
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    throw new Error("CSV file is empty.");
  }

  const headerCells = parseCsvLine(lines[0]);
  const columnIndex = headerCells.indexOf(columnName);
  if (columnIndex === -1) {
    throw new Error(`Column "${columnName}" not found.`);
  }

  const outputLines = [joinCsvRow(headerCells)];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") continue;

    const cells = parseCsvLine(line);
    if (columnIndex >= cells.length) {
      outputLines.push(line);
      continue;
    }

    const rawValue = cells[columnIndex].trim();
    if (rawValue !== "") {
      const numericValue = Number.parseFloat(rawValue);
      if (!Number.isFinite(numericValue)) {
        throw new Error(
          `Non-numeric value "${rawValue}" at row ${i + 1}, column "${columnName}".`,
        );
      }
      cells[columnIndex] = numericValue.toFixed(decimalDigits);
    }

    outputLines.push(joinCsvRow(cells));
  }

  const result = outputLines.join("\n");
  return hasTrailingNewline ? `${result}\n` : result;
}

function main() {
  const { csvPath, columnName, decimalDigits } = parseArgs(process.argv.slice(2));
  const csvText = fs.readFileSync(csvPath, "utf-8");
  const formattedCsv = formatNumericColumn(csvText, columnName, decimalDigits);
  fs.writeFileSync(csvPath, formattedCsv, "utf-8");
}

main();
