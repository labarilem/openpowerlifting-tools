#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const BASE = "https://www.powerliftingitalia-fipl.it";

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

  const pick = (m) => ({ id: m.id, name: m.name });

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

/**
 * @returns {Promise<Array<{ name: string; date: string; location: string; description: string; resultsUrls: string[] }>>}
 */
async function scrapeMeets(page) {
  return page.evaluate((base) => {
    function norm(s) {
      return (s || "").replace(/\s+/g, " ").trim();
    }

    function abs(href) {
      try {
        return new URL(href, base).href;
      } catch {
        return href;
      }
    }

    /** @param {HTMLTableElement} table */
    function extractFromTable(table) {
      const trs = [...table.querySelectorAll("tr")];
      const colspanTds = [];
      for (const tr of trs) {
        const cells = tr.querySelectorAll("td");
        if (cells.length !== 1) continue;
        const td = cells[0];
        if (td.getAttribute("colspan") === "2") colspanTds.push(td);
      }

      const date = colspanTds[0] ? norm(colspanTds[0].textContent) : "";
      const location = colspanTds[1] ? norm(colspanTds[1].textContent) : "";
      const description = colspanTds[2] ? norm(colspanTds[2].textContent) : "";

      const resultsUrls = [];
      let inResults = false;

      for (const tr of trs) {
        const td = tr.querySelector("td[colspan='2']");
        if (!td) {
          if (inResults) inResults = false;
          continue;
        }

        const hasRisultatiLabel =
          !!td.querySelector("strong") &&
          /risultati\s*:/i.test(td.textContent || "");

        if (hasRisultatiLabel) {
          inResults = true;
          for (const a of td.querySelectorAll("a[href]")) {
            const h = a.getAttribute("href");
            if (h) resultsUrls.push(abs(h));
          }
          continue;
        }

        if (inResults) {
          const links = [...td.querySelectorAll("a[href]")].map((a) =>
            a.getAttribute("href"),
          );
          const allPdf = links.every((h) => h && /\.pdf(\?|$)/i.test(h));
          if (links.length && allPdf) {
            for (const h of links) {
              if (h) resultsUrls.push(abs(h));
            }
          } else {
            inResults = false;
          }
        }
      }

      return { date, location, description, resultsUrls };
    }

    const blocks = document.querySelectorAll("div.colonna-1-3");
    const meets = [];

    for (const block of blocks) {
      const h1 = block.querySelector("h1.Text14Black, h1");
      const table = block.querySelector("table");
      if (!h1 || !table) continue;

      const name = (h1.textContent || "").trim();
      if (!name || name === "Calendario Gare e Risultati") continue;

      const { date, location, description, resultsUrls } =
        extractFromTable(table);
      meets.push({
        name,
        date,
        location,
        description,
        resultsUrls,
      });
    }

    return meets;
  }, BASE);
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
  const url = `${BASE}/calendario-gare.asp?anno=${year}`;

  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
    const meets = await scrapeMeets(page);
    const meetsWithIds = meets.map((meet, index) => ({
      id: index + 1,
      ...meet,
    }));
    await fs.mkdir(calendarDir, { recursive: true });
    const outPath = path.join(calendarDir, `${year}.json`);

    const previous = await readExistingCalendar(outPath);
    if (previous !== null) {
      const diff = diffNewResultsAvailable(previous, meetsWithIds);
      printNewResultsReport(diff);
    }

    await fs.writeFile(
      outPath,
      `${JSON.stringify(meetsWithIds, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
