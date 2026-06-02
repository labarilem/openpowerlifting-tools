import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMeetArtifactsFromCalendarEntry,
  buildMeetCsvContent,
  buildUrlFileContent,
  formatMeetName,
  isoDateFromResultsUrls,
  parseItalianCalendarDate,
  resolveMeetIsoDate,
} from "../../../packages/opl-tools/src/federations/fipl/meet.js";

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

test("buildMeetCsvContent and buildUrlFileContent format output", () => {
  const csv = buildMeetCsvContent("FIPL", "2026-04-21", formatMeetName("3^ prova pl"), "roma - RM");
  assert.match(csv, /^Federation,Date,MeetCountry,MeetState,MeetTown,MeetName/m);
  assert.match(csv, /FIPL,2026-04-21,Italy,,Roma,3° Prova PL$/m);

  assert.equal(
    buildUrlFileContent(["https://a.test/file1.pdf", "https://a.test/file2.pdf"]),
    "https://a.test/file1.pdf\nhttps://a.test/file2.pdf",
  );
});
