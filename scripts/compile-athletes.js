#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import config from "../config.js";

import { escapeCsv, parseCsvLine } from "../packages/opl-tools/src/lib/csv.js";

function printUsage() {
  console.error("Usage: node scripts/compile-athletes.js <federation> [repoPath]");
  console.error("");
  console.error(
    "  federation - Name of the federation folder under meet-data/",
  );
  console.error("  repoPath   - Path to the cloned opl-data repository");
  console.error("");
  console.error("Example:");
  console.error("  node scripts/compile-athletes.js fipl");
}

function readEntriesRows(entriesPath) {
  const content = fs.readFileSync(entriesPath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const nameIndex = headers.indexOf("Name");
  const birthYearIndex = headers.indexOf("BirthYear");
  const birthDateIndex = headers.indexOf("BirthDate");

  if (nameIndex === -1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const name = (cells[nameIndex] ?? "").trim();

    let birthYear = (cells[birthYearIndex] ?? "").trim();
    if (!birthYear && birthDateIndex !== -1) {
      const birthDate = (cells[birthDateIndex] ?? "").trim();
      const match = birthDate.match(/\b(\d{4})\b/);
      birthYear = match ? match[1] : "";
    }

    return { name, birthYear };
  });
}

function main() {
  let [, , federation, repoPath] = process.argv;

  if (!federation) {
    console.error("Error: Missing federation.\n");
    printUsage();
    process.exit(1);
  }

  repoPath = repoPath ?? config.defaultOplDataRepoPath;

  const federationDir = path.resolve(repoPath, "meet-data", federation);
  if (!fs.existsSync(federationDir)) {
    console.error(`Error: Federation folder not found: ${federationDir}`);
    process.exit(1);
  }

  if (!fs.statSync(federationDir).isDirectory()) {
    console.error(`Error: Path exists but is not a directory: ${federationDir}`);
    process.exit(1);
  }

  const meetIds = fs
    .readdirSync(federationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const athletesByKey = new Map();

  for (const meetId of meetIds) {
    const entriesPath = path.join(federationDir, meetId, "entries.csv");
    if (!fs.existsSync(entriesPath)) {
      continue;
    }

    const rows = readEntriesRows(entriesPath);
    for (const { name, birthYear } of rows) {
      if (!name) continue;
      const key = `${name}\u0000${birthYear}`;
      if (!athletesByKey.has(key)) {
        athletesByKey.set(key, { name, birthYear });
      }
    }
  }

  const athletes = [...athletesByKey.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return String(a.birthYear).localeCompare(String(b.birthYear), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const outputDir = path.resolve("packages", "opl-tools", "data");
  const federationOutputDir = path.join(outputDir, federation);
  fs.mkdirSync(federationOutputDir, { recursive: true });
  const outputPath = path.join(federationOutputDir, "athletes.csv");
  const disambiguationSourcePath = path.resolve(
    repoPath,
    "lifter-data",
    "name-disambiguation.csv",
  );
  const disambiguationOutputPath = path.join(
    federationOutputDir,
    "name-disambiguation.csv",
  );

  const lines = ["Name,BirthYear"];
  for (const athlete of athletes) {
    lines.push(`${escapeCsv(athlete.name)},${escapeCsv(athlete.birthYear)}`);
  }
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  if (fs.existsSync(disambiguationSourcePath)) {
    fs.copyFileSync(disambiguationSourcePath, disambiguationOutputPath);
  } else {
    fs.writeFileSync(disambiguationOutputPath, "", "utf8");
  }

  console.log(`Federation: ${federation}`);
  console.log(`Meet folders scanned: ${meetIds.length}`);
  console.log(`Unique athletes: ${athletes.length}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Disambiguation output: ${disambiguationOutputPath}`);
}

main();
