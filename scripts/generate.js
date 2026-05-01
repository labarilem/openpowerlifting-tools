#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { scrapeFiplCalendar } from "../src/lib/fipl-calendar.js";
import {
  buildMeetCsvContent,
  buildUrlFileContent,
  formatMeetName,
  isoDateFromResultsUrls,
  parseItalianCalendarDate,
} from "../src/lib/fipl-meet.js";
import {
  downloadPdfToBuffer,
  mergePdfBuffers,
} from "../src/lib/import-meet-pdf.js";
import { convertFiplPdfBytesToOplCsv } from "../src/parse.js";

const PARSE_OPTION_SPECS = {
  isOpenDivision: "boolean",
};

function printUsage() {
  console.error(
    "Usage: node scripts/generate.js <federation> <year> <meetId> <outputDir> [--isOpenDivision <true|false>]",
  );
}

function parsePositiveInt(name, rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseBooleanOption(name, rawValue) {
  const value = String(rawValue).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  if (argv.length < 4) {
    printUsage();
    process.exit(1);
  }

  const [federation, yearRaw, meetIdRaw, outputDir, ...rest] = argv;
  const year = parsePositiveInt("year", yearRaw);
  const meetId = parsePositiveInt("meetId", meetIdRaw);
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const spec = PARSE_OPTION_SPECS[key];
    if (!spec) {
      throw new Error(`Unsupported option: --${key}`);
    }

    const next = rest[i + 1];
    if (next == null || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (spec === "boolean") {
      options[key] = parseBooleanOption(`--${key}`, next);
    }
    i += 1;
  }

  return { federation, year, meetId, outputDir, options };
}

async function main() {
  const { federation, year, meetId, outputDir, options } = parseArgs(
    process.argv.slice(2),
  );

  if (federation !== "fipl") {
    throw new Error(
      `Unsupported federation "${federation}". Only "fipl" is supported.`,
    );
  }

  const calendar = await scrapeFiplCalendar(year);
  const meet = calendar.find((entry) => entry.id === meetId);
  if (!meet) {
    throw new Error(`No meet with id ${meetId} found in FIPL calendar ${year}`);
  }

  const resultsUrls = Array.isArray(meet.resultsUrls)
    ? meet.resultsUrls.filter((u) => typeof u === "string" && u.trim())
    : [];
  if (resultsUrls.length === 0) {
    throw new Error(`Meet ${meetId} has no resultsUrls`);
  }

  const pdfBuffers = [];
  for (const url of resultsUrls) {
    pdfBuffers.push(await downloadPdfToBuffer(url, { timeoutMs: 60_000 }));
  }
  const mergedPdfBytes =
    pdfBuffers.length === 1 ? pdfBuffers[0] : await mergePdfBuffers(pdfBuffers);

  const isoFromCalendar = parseItalianCalendarDate(meet.date, year);
  const isoDate = isoDateFromResultsUrls(resultsUrls, isoFromCalendar);
  const meetName = formatMeetName(meet.name);
  const meetCsv = buildMeetCsvContent(
    federation.toUpperCase(),
    isoDate,
    meetName,
    meet.location,
  );
  const urlFile = buildUrlFileContent(resultsUrls);
  const entriesCsv = await convertFiplPdfBytesToOplCsv(mergedPdfBytes, options);

  const finalOutputDir = path.resolve(outputDir);
  fs.mkdirSync(finalOutputDir, { recursive: true });
  fs.writeFileSync(path.join(finalOutputDir, "meet.csv"), meetCsv, "utf8");
  fs.writeFileSync(path.join(finalOutputDir, "URL"), urlFile, "utf8");
  fs.writeFileSync(path.join(finalOutputDir, "entries.csv"), entriesCsv, "utf8");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
