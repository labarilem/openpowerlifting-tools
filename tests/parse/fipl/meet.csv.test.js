import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMeetArtifactsFromCalendarEntry,
  buildMeetCsvContent,
  buildUrlFileContent,
  findLatestMeetWithResults,
  formatMeetName,
  isoDateFromResultsUrls,
  meetHasPublishedResults,
  parseItalianCalendarDate,
  resolveMeetIsoDate,
} from "../../../packages/opl-tools/src/federations/fipl/meet.js";

const calendar2026 = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../scripts/data/fipl/calendar/2026.json",
    ),
    "utf8",
  ),
);

test("parseItalianCalendarDate parses first date and month", () => {
  assert.equal(parseItalianCalendarDate("15/16 marzo", 2026), "2026-03-15");
  assert.equal(parseItalianCalendarDate("29/30/31 MAGGIO 2026", 2026), "2026-05-29");
});

test("isoDateFromResultsUrls extracts embedded date", () => {
  const date = isoDateFromResultsUrls(
    [
      "https://www.powerliftingitalia-fipl.it/public/gare/2026-04-21-95-risultati.pdf",
    ],
    null,
  );
  assert.equal(date, "2026-04-21");
});

test("resolveMeetIsoDate prefers calendar date over result PDF URLs", () => {
  const resultsUrls = [
    "https://www.powerliftingitalia-fipl.it/public/gare/2026-06-01-221-risultati.pdf",
  ];
  assert.equal(
    resolveMeetIsoDate("29/30/31 MAGGIO 2026", 2026, resultsUrls),
    "2026-05-29",
  );
});

test("resolveMeetIsoDate falls back to result PDF URLs when calendar date is unparseable", () => {
  const resultsUrls = [
    "https://www.powerliftingitalia-fipl.it/public/gare/2026-04-21-95-risultati.pdf",
  ];
  assert.equal(resolveMeetIsoDate("invalid date", 2026, resultsUrls), "2026-04-21");
});

test("buildMeetArtifactsFromCalendarEntry uses calendar date for meet.csv", () => {
  const { isoDate, meetCsv } = buildMeetArtifactsFromCalendarEntry(
    {
      id: 12,
      name: "7° CAMPIONATO ITALIANO DI STACCO  CLASSIC -SUB JUNIOR -JUNIOR E MASTER MASCHILE E FEMMINILE",
      date: "29/30/31 MAGGIO 2026",
      location: "FIERA DI RIMINI WELLNESS - RN",
      resultsUrls: [
        "https://www.powerliftingitalia-fipl.it/public/gare/2026-06-01-221-risultati.pdf",
      ],
    },
    2026,
  );
  assert.equal(isoDate, "2026-05-29");
  assert.match(meetCsv, /FIPL,2026-05-29,Italy,,Fiera Di Rimini Wellness,/);
});

test("meetHasPublishedResults detects non-empty result PDF URLs", () => {
  assert.equal(meetHasPublishedResults({ resultsUrls: [] }), false);
  assert.equal(meetHasPublishedResults({ resultsUrls: ["  "] }), false);
  assert.equal(
    meetHasPublishedResults({
      resultsUrls: ["https://example.test/results.pdf"],
    }),
    true,
  );
});

test("findLatestMeetWithResults picks the most recent meet with published results", () => {
  const latest = findLatestMeetWithResults(calendar2026, 2026);
  assert.equal(latest?.id, 12);
});

test("findLatestMeetWithResults returns null when no meets have results", () => {
  const calendar = [
    { id: 1, date: "1 GENNAIO 2026", resultsUrls: [] },
    { id: 2, date: "2 GENNAIO 2026", resultsUrls: ["  "] },
  ];
  assert.equal(findLatestMeetWithResults(calendar, 2026), null);
});

test("buildMeetCsvContent and buildUrlFileContent format output", () => {
  const csv = buildMeetCsvContent("FIPL", "2026-04-21", formatMeetName("3^ prova pl"), "roma - RM");
  assert.match(csv, /^Federation,Date,MeetCountry,MeetState,MeetTown,MeetName/m);
  assert.match(csv, /FIPL,2026-04-21,Italy,,Roma,3° Prova PL$/m);

  assert.equal(
    buildUrlFileContent(["https://a.test/file1.pdf", "https://a.test/file2.pdf"]),
    "https://a.test/file1.pdf\nhttps://a.test/file2.pdf",
  );
});
