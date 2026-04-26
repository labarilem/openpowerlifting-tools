#!/usr/bin/env node

import fs from "fs";

function printUsage() {
  console.error(
    "Usage: node scripts/format-numer-column.js <csvPath> <columnName> <decimalDigits>",
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

  const headers = lines[0].split(",");
  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) {
    throw new Error(`Column "${columnName}" not found.`);
  }

  const outputLines = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") continue;

    const cells = line.split(",");
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

    outputLines.push(cells.join(","));
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
