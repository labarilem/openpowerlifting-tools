#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeFiplCalendar } from "../src/lib/fipl-calendar.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function printUsage() {
  console.error("Usage: node scripts/update-calendar.js <federation> [year]");
  console.error("");
  console.error("  federation  Required (e.g. fipl)");
  console.error(
    "  year        Optional; calendar year (defaults to current year)",
  );
}

function parseArgs(argv) {
  const federation = argv[0];
  if (!federation) {
    printUsage();
    process.exit(1);
  }

  let year;
  if (argv[1] !== undefined) {
    const y = Number(argv[1]);
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      console.error("year must be an integer between 1900 and 2100");
      process.exit(1);
    }
    year = y;
  } else {
    year = new Date().getFullYear();
  }

  return { federation, year };
}

/** Stable identity across runs (ids are renumbered each scrape). */
function meetKey(meet) {
  return `${meet.name}\0${meet.date}\0${meet.location}`;
}

/**
 * @param {string} outPath
 * @returns {Promise<Array<Record<string, unknown>> | null>}
 */
async function readExistingCalendar(outPath) {
  try {
    const raw = await fs.readFile(outPath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data;
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

/**
 * @param {Array<Record<string, unknown>> | null} oldList
 * @param {Array<{ id: number; name: string; date: string; location: string; description: string; resultsUrls: string[] }>} newList
 */
function diffNewResultsAvailable(oldList, newList) {
  const newMeetsWithResults = [];
  const meetsThatGainedResults = [];

  const oldMap = new Map();
  if (oldList) {
    for (const m of oldList) {
      if (!m || typeof m !== "object") continue;
      if (
        typeof m.name !== "string" ||
        typeof m.date !== "string" ||
        typeof m.location !== "string"
      ) {
        continue;
      }
      oldMap.set(meetKey(m), m);
    }
  }

  for (const m of newList) {
    const urls = m.resultsUrls;
    const hasResults = Array.isArray(urls) && urls.length > 0;
    if (!hasResults) continue;

    const prev = oldMap.get(meetKey(m));
    if (!prev) {
      newMeetsWithResults.push(m);
      continue;
    }

    const prevUrls =
      "resultsUrls" in prev && Array.isArray(prev.resultsUrls)
        ? prev.resultsUrls
        : [];
    const hadResults = prevUrls.length > 0;
    if (!hadResults) {
      meetsThatGainedResults.push(m);
    }
  }

  return { newMeetsWithResults, meetsThatGainedResults };
}

function printNewResultsReport(diff) {
  const { newMeetsWithResults, meetsThatGainedResults } = diff;
  if (newMeetsWithResults.length === 0 && meetsThatGainedResults.length === 0) {
    return;
  }

  const pick = (m) => ({ id: m.id, name: m.name, date: m.date });

  console.log(
    JSON.stringify(
      {
        newMeetsWithResults: newMeetsWithResults.map(pick),
        meetsThatGainedResults: meetsThatGainedResults.map(pick),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const { federation, year } = parseArgs(process.argv.slice(2));

  if (federation !== "fipl") {
    console.error(
      `Unsupported federation "${federation}". Only "fipl" is supported.`,
    );
    process.exit(1);
  }

  const calendarDir = path.join(scriptDir, "data", federation, "calendar");
  const meetsWithIds = await scrapeFiplCalendar(year);
  await fs.mkdir(calendarDir, { recursive: true });
  const outPath = path.join(calendarDir, `${year}.json`);

  const previous = await readExistingCalendar(outPath);
  if (previous !== null) {
    const diff = diffNewResultsAvailable(previous, meetsWithIds);
    printNewResultsReport(diff);
  }

  await fs.writeFile(outPath, `${JSON.stringify(meetsWithIds, null, 2)}\n`, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
