#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toTitleCase } from "../src/lib/format.js";
import { downloadPdf, mergePdfs } from "../src/lib/import-meet-pdf.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const IT_MONTHS = new Map([
  ["gennaio", 1],
  ["febbraio", 2],
  ["marzo", 3],
  ["aprile", 4],
  ["maggio", 5],
  ["giugno", 6],
  ["luglio", 7],
  ["agosto", 8],
  ["settembre", 9],
  ["ottobre", 10],
  ["novembre", 11],
  ["dicembre", 12],
]);

function printUsage() {
  console.error(
    "Usage: node scripts/import-calendar-meet.js <federation> <year> <meetCalendarId> <outputDir>",
  );
  console.error("");
  console.error(
    "  federation      e.g. fipl (reads scripts/data/<federation>/calendar/<year>.json)",
  );
  console.error("  year            Calendar file year, e.g. 2026");
  console.error("  meetCalendarId  id field of the meet in that JSON");
  console.error("  outputDir       Destination folder (created if missing)");
}

function parseArgs(argv) {
  const [federation, yearStr, meetIdStr, outputDir] = argv;
  if (!federation || !yearStr || !meetIdStr || !outputDir) {
    printUsage();
    process.exit(1);
  }
  const year = Number(yearStr);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    console.error("year must be an integer between 1900 and 2100");
    process.exit(1);
  }
  const meetCalendarId = Number(meetIdStr);
  if (!Number.isInteger(meetCalendarId) || meetCalendarId < 1) {
    console.error("meetCalendarId must be a positive integer");
    process.exit(1);
  }
  return { federation, year, meetCalendarId, outputDir };
}

/**
 * First competition day as YYYY-MM-DD; uses `year` if the string has no year.
 */
function parseItalianCalendarDate(dateStr, calendarYear) {
  let s = dateStr.replace(/\s+/g, " ").trim();
  s = s.replace(/([A-Za-zÀ-ÿ])(\d{4})\b/g, "$1 $2");

  const yMatch = s.match(/\b(20\d{2})\b/);
  const y = yMatch ? parseInt(yMatch[1], 10) : calendarYear;

  const sLower = s.toLowerCase();
  const monthsByLen = [...IT_MONTHS.keys()].sort((a, b) => b.length - a.length);
  let monthNum = null;
  for (const mName of monthsByLen) {
    if (new RegExp(`\\b${mName}\\b`, "i").test(sLower)) {
      monthNum = IT_MONTHS.get(mName);
      break;
    }
  }
  if (!monthNum) {
    throw new Error(`Could not parse month from calendar date: "${dateStr}"`);
  }

  const dayMatch = s.match(/^(\d{1,2})(?:[\/\-]\d{1,2})*/);
  if (!dayMatch) {
    throw new Error(`Could not parse day from calendar date: "${dateStr}"`);
  }
  const day = parseInt(dayMatch[1], 10);
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day in calendar date: "${dateStr}"`);
  }

  const mm = String(monthNum).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function shortenMeetName(name) {
  const n = name.trim();
  const lower = n.toLowerCase();
  let cut = lower.search(/\s+cat\.[-\s\d]/);
  if (cut === -1) cut = lower.search(/\s+categorie\s/);
  if (cut === -1) return n;
  return n.slice(0, cut).trim();
}

function formatMeetName(calendarName) {
  let s = shortenMeetName(calendarName);
  s = toTitleCase(s);
  s = s.replace(/^(\d+)\^\s+/, "$1° ");
  s = s.replace(/^(\d)\s+/, "$1° ");
  s = s
    .replace(/\bDi\b/g, "di")
    .replace(/\bDa\b/g, "da")
    .replace(/\bE\b/g, "e");
  return s
    .replace(/\bPl\b/g, "PL")
    .replace(/\bSj\b/g, "SJ")
    .replace(/\bWec\b/g, "WEC")
    .replace(/\bIpf\b/g, "IPF")
    .replace(/\bEpf\b/g, "EPF");
}

/** FIPL result PDF paths often embed the meet date: /public/gare/YYYY-MM-DD-id-… */
function isoDateFromResultsUrls(resultsUrls, fallbackIso) {
  for (const u of resultsUrls) {
    const m = u.match(/\/gare\/(20\d{2})-(\d{2})-(\d{2})-\d+-/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return fallbackIso;
}

function meetTownFromLocation(locRaw) {
  const s = locRaw.trim();
  const m = s.match(/^(.+?)\s*-\s*([A-Z]{2})\s*$/);
  if (m) return toTitleCase(m[1].trim());
  return toTitleCase(s);
}

function csvEscape(field) {
  const s = String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const pdfDownloadOptions = { timeoutMs: 60_000 };

function writeMeetCsv(
  destDir,
  federationUpper,
  isoDate,
  meetName,
  locationRaw,
) {
  const meetTown = meetTownFromLocation(locationRaw);
  const row = [
    csvEscape(federationUpper),
    csvEscape(isoDate),
    csvEscape("Italy"),
    csvEscape(""),
    csvEscape(meetTown),
    csvEscape(meetName),
  ].join(",");
  const lines = [
    "Federation,Date,MeetCountry,MeetState,MeetTown,MeetName",
    row,
  ];
  fs.writeFileSync(
    path.join(destDir, "meet.csv"),
    lines.join("\n"),
    "utf8",
  );
}

async function main() {
  const { federation, year, meetCalendarId, outputDir } = parseArgs(
    process.argv.slice(2),
  );

  const calendarPath = path.join(
    scriptDir,
    "data",
    federation,
    "calendar",
    `${year}.json`,
  );
  if (!fs.existsSync(calendarPath)) {
    console.error(`Calendar file not found: ${calendarPath}`);
    process.exit(1);
  }

  const calendar = JSON.parse(fs.readFileSync(calendarPath, "utf8"));
  if (!Array.isArray(calendar)) {
    console.error(`Invalid calendar JSON (expected array): ${calendarPath}`);
    process.exit(1);
  }

  const meet = calendar.find((m) => m && m.id === meetCalendarId);
  if (!meet) {
    console.error(`No meet with id ${meetCalendarId} in ${calendarPath}`);
    process.exit(1);
  }

  const resultsUrls = Array.isArray(meet.resultsUrls)
    ? meet.resultsUrls.filter((u) => typeof u === "string" && u.trim())
    : [];

  if (resultsUrls.length === 0) {
    console.error(
      `Meet ${meetCalendarId} has no resultsUrls; cannot build input.pdf`,
    );
    process.exit(1);
  }

  const destDir = path.resolve(outputDir);
  fs.mkdirSync(destDir, { recursive: true });

  fs.writeFileSync(
    path.join(destDir, "URL"),
    resultsUrls.join("\n"),
    "utf8",
  );

  const isoFromCalendar = parseItalianCalendarDate(meet.date, year);
  const isoDate = isoDateFromResultsUrls(resultsUrls, isoFromCalendar);
  const meetName = formatMeetName(meet.name);
  const federationUpper = federation.toUpperCase();
  writeMeetCsv(destDir, federationUpper, isoDate, meetName, meet.location);

  const inputPdfPath = path.join(destDir, "input.pdf");

  if (resultsUrls.length === 1) {
    console.log(`Downloading PDF…`);
    await downloadPdf(resultsUrls[0], inputPdfPath, pdfDownloadOptions);
  } else {
    const tempPaths = [];
    try {
      for (let i = 0; i < resultsUrls.length; i += 1) {
        const url = resultsUrls[i];
        const tempPath = path.join(destDir, `input-part-${i + 1}.pdf`);
        tempPaths.push(tempPath);
        console.log(`Downloading PDF ${i + 1}/${resultsUrls.length}…`);
        await downloadPdf(url, tempPath, pdfDownloadOptions);
      }
      console.log(`Merging ${tempPaths.length} PDFs…`);
      await mergePdfs(tempPaths, inputPdfPath);
    } finally {
      for (const tempPath of tempPaths) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }
  }

  console.log(`Wrote: ${path.join(destDir, "input.pdf")}`);
  console.log(`Wrote: ${path.join(destDir, "URL")}`);
  console.log(`Wrote: ${path.join(destDir, "meet.csv")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
