#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { joinCsvRow, parseCsvLine } from "../packages/opl-tools/src/lib/csv.js";

function printUsage() {
  console.error(
    "Usage: node scripts/set-column.js <federation> <meetId> <columnName> <columnValue>",
  );
  console.error("");
  console.error("Example:");
  console.error('  node scripts/set-column.js fipl 2507 Division "Senior"');
}

function main() {
  const [federation, meetId, columnName, columnValue] = process.argv.slice(2);

  if (!federation || !meetId || !columnName || columnValue == null) {
    printUsage();
    process.exit(1);
  }

  const entriesPath = path.join(
    ".",
    "tests",
    "dataset",
    federation,
    meetId,
    "entries.csv",
  );

  if (!fs.existsSync(entriesPath)) {
    console.error(`File not found: ${entriesPath}`);
    process.exit(1);
  }

  const lines = fs
    .readFileSync(entriesPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    console.error(`CSV file is empty: ${entriesPath}`);
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]);
  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) {
    console.error(
      `Column "${columnName}" not found in "${entriesPath}". Available columns: ${headers.join(", ")}`,
    );
    process.exit(1);
  }

  const updatedRows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    while (cells.length < headers.length) cells.push("");
    cells[columnIndex] = columnValue;
    return joinCsvRow(cells);
  });

  const output = [joinCsvRow(headers), ...updatedRows].join("\n");
  fs.writeFileSync(entriesPath, `${output}\n`, "utf8");

  console.log(`Updated column "${columnName}" in: ${entriesPath}`);
  console.log(`Rows updated: ${updatedRows.length}`);
  console.log(`New value: ${columnValue}`);
}

main();
