#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { downloadPdf, mergePdfs } from "../packages/opl-tools/src/lib/import-meet-pdf.js";
import { getFederationOrThrow } from "../packages/opl-tools/src/federations/index.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

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
  console.error("");
  console.error("Example:");
  console.error(
    "  node scripts/import-calendar-meet.js fipl 2026 1 ./tests/dataset/fipl/calendar-meet-1",
  );
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

const pdfDownloadOptions = { timeoutMs: 60_000 };

async function main() {
  const { federation, year, meetCalendarId, outputDir } = parseArgs(
    process.argv.slice(2),
  );
  const federationModule = getFederationOrThrow(federation);
  if (typeof federationModule.buildMeetArtifactsFromCalendarEntry !== "function") {
    throw new Error(
      `Federation "${federation}" cannot build meet artifacts from calendar entries.`,
    );
  }

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

  const destDir = path.resolve(outputDir);
  fs.mkdirSync(destDir, { recursive: true });

  const { resultsUrls, meetCsv, urlFile } =
    federationModule.buildMeetArtifactsFromCalendarEntry(meet, year, federation);

  fs.writeFileSync(
    path.join(destDir, "URL"),
    urlFile,
    "utf8",
  );
  fs.writeFileSync(
    path.join(destDir, "meet.csv"),
    meetCsv,
    "utf8",
  );

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
