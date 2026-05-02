#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseCsvLine } from "../packages/opl-tools/src/lib/csv.js";

function printUsage() {
  console.error(
    "Usage: node scripts/compare-csv-names.js <federation> <meetId> [columnName]",
  );
  console.error("");
  console.error("Example:");
  console.error("  node scripts/compare-csv-names.js fipl 2601");
  console.error("  node scripts/compare-csv-names.js fipl 2601 Name");
}

function parseCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

function readColumnValues(csvPath, columnName) {
  const content = fs.readFileSync(csvPath, "utf8");
  const { headers, rows } = parseCsv(content);
  const columnIndex = headers.indexOf(columnName);

  if (columnIndex === -1) {
    throw new Error(
      `Column "${columnName}" not found in "${csvPath}". Available columns: ${headers.join(", ")}`,
    );
  }

  return rows
    .map((row) => (row[columnIndex] ?? "").trim())
    .filter((value) => value !== "");
}

function compareValueSets(leftValues, rightValues) {
  const leftSet = new Set(leftValues);
  const rightSet = new Set(rightValues);

  const onlyLeft = [...leftSet]
    .filter((value) => !rightSet.has(value))
    .sort((a, b) => a.localeCompare(b));

  const onlyRight = [...rightSet]
    .filter((value) => !leftSet.has(value))
    .sort((a, b) => a.localeCompare(b));

  return { onlyLeft, onlyRight };
}

function main() {
  const [federation, meetId, columnName = "Name"] = process.argv.slice(2);

  if (!federation || !meetId) {
    printUsage();
    process.exit(1);
  }

  const baseDir = path.join(".", "tests", "dataset", federation, meetId);

  const leftFileName = `entries.csv`;
  const leftCsvPath = path.join(baseDir, leftFileName);
  const rightFileName = `entries-parsed.csv`;
  const rightCsvPath = path.join(baseDir, rightFileName);

  if (!fs.existsSync(leftCsvPath)) {
    console.error(`File not found: ${leftCsvPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(rightCsvPath)) {
    console.error(`File not found: ${rightCsvPath}`);
    process.exit(1);
  }

  const leftValues = readColumnValues(leftCsvPath, columnName);
  const rightValues = readColumnValues(rightCsvPath, columnName);
  const { onlyLeft, onlyRight } = compareValueSets(leftValues, rightValues);

  console.log(`Compared column "${columnName}"`);
  console.log(`  Federation : ${federation}`);
  console.log(`  Meet ID    : ${meetId}`);
  console.log(`  Left file  : ${leftCsvPath}`);
  console.log(`  Right file : ${rightCsvPath}`);
  console.log("");

  console.log(`Rows in ${leftFileName} file : ${leftValues.length}`);
  console.log(`Rows in ${rightFileName} file: ${rightValues.length}`);
  console.log("");

  console.log(`Values only in ${leftFileName} (${onlyLeft.length}):`);
  for (const value of onlyLeft) {
    console.log(`- ${value}`);
  }

  console.log("");
  console.log(`Values only in ${rightFileName} (${onlyRight.length}):`);
  for (const value of onlyRight) {
    console.log(`- ${value}`);
  }

  if (onlyLeft.length === 0 && onlyRight.length === 0) {
    console.log("");
    console.log("No value-set differences found.");
  }
}

main();
