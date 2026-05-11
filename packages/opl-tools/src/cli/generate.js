import fs from "node:fs";
import path from "node:path";
import {
  downloadPdfToBuffer,
  mergePdfBuffers,
} from "../lib/import-meet-pdf.js";
import { getFederationOrThrow } from "../federations/index.js";

export const GENERATE_USAGE =
  "<federation> <year> <meetId> <outputDir> [--isOpenDivision <true|false>]";

/** @param {string} message */
function log(message) {
  console.log(message);
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
 * @param {string[]} args
 * @param {Record<string, string>} optionSpecs
 */
function parseOptions(args, optionSpecs) {
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const spec = optionSpecs[key];
    if (!spec) {
      throw new Error(`Unsupported option: --${key}`);
    }

    const next = args[i + 1];
    if (next == null || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    if (spec === "boolean") {
      options[key] = parseBooleanOption(`--${key}`, next);
    }
    i += 1;
  }

  return options;
}

/**
 * @param {string[]} argv already sliced (no node/script entries)
 * @param {Record<string, string>} optionSpecs
 */
function parseArgs(argv, optionSpecs) {
  if (argv.length < 4) {
    const err = new Error(`Usage: opl-tools generate ${GENERATE_USAGE}`);
    err.isUsageError = true;
    throw err;
  }

  const [federation, yearRaw, meetIdRaw, outputDir, ...rest] = argv;
  const year = parsePositiveInt("year", yearRaw);
  const meetId = parsePositiveInt("meetId", meetIdRaw);
  const options = parseOptions(rest, optionSpecs);

  return { federation, year, meetId, outputDir, options };
}

/**
 * @param {string[]} argv already sliced (e.g. process.argv.slice(3) from the bin)
 */
export async function runGenerate(argv) {
  if (argv.length < 4) {
    const err = new Error(`Usage: opl-tools generate ${GENERATE_USAGE}`);
    err.isUsageError = true;
    throw err;
  }

  const federationModule = getFederationOrThrow(argv[0]);
  const { federation, year, meetId, outputDir, options } = parseArgs(
    argv,
    federationModule.parseOptionsSchema || {},
  );

  if (typeof federationModule.scrapeCalendar !== "function") {
    throw new Error(
      `Federation "${federation}" does not support calendar-backed generate.`,
    );
  }
  if (typeof federationModule.buildMeetArtifactsFromCalendarEntry !== "function") {
    throw new Error(
      `Federation "${federation}" cannot build meet artifacts from calendar entries.`,
    );
  }
  if (typeof federationModule.convertPdfBytesToOplCsv !== "function") {
    throw new Error(`Federation "${federation}" does not provide a PDF parser.`);
  }

  const finalOutputDir = path.resolve(outputDir);
  log(
    `opl-tools generate: federation=${federation} year=${year} meetId=${meetId} output=${finalOutputDir}`,
  );

  log(`Fetching ${federation.toUpperCase()} calendar for ${year}...`);
  const calendar = await federationModule.scrapeCalendar(year);
  const meet = calendar.find((entry) => entry.id === meetId);
  if (!meet) {
    throw new Error(
      `No meet with id ${meetId} found in ${federation.toUpperCase()} calendar ${year}`,
    );
  }

  const { resultsUrls, meetName, meetCsv, urlFile } =
    federationModule.buildMeetArtifactsFromCalendarEntry(meet, year, federation);

  log(`Meet: ${meetName} (${resultsUrls.length} result PDF URL(s))`);

  const pdfBuffers = [];
  for (let i = 0; i < resultsUrls.length; i += 1) {
    const url = resultsUrls[i];
    log(`Downloading PDF ${i + 1}/${resultsUrls.length}...`);
    pdfBuffers.push(await downloadPdfToBuffer(url, { timeoutMs: 60_000 }));
  }
  if (pdfBuffers.length > 1) {
    log("Merging PDFs...");
  }
  const mergedPdfBytes =
    pdfBuffers.length === 1 ? pdfBuffers[0] : await mergePdfBuffers(pdfBuffers);

  log("Parsing merged PDF to OpenPowerlifting CSV...");
  const entriesCsv = await federationModule.convertPdfBytesToOplCsv(
    mergedPdfBytes,
    options,
  );

  fs.mkdirSync(finalOutputDir, { recursive: true });
  log("Writing meet.csv, URL, entries.csv...");
  fs.writeFileSync(path.join(finalOutputDir, "meet.csv"), meetCsv, "utf8");
  fs.writeFileSync(path.join(finalOutputDir, "URL"), urlFile, "utf8");
  fs.writeFileSync(path.join(finalOutputDir, "entries.csv"), entriesCsv, "utf8");
  log("Done.");
}
