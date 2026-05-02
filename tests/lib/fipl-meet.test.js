import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMeetCsvContent,
  buildUrlFileContent,
  formatMeetName,
  isoDateFromResultsUrls,
  parseItalianCalendarDate,
} from "../../packages/opl-tools/src/lib/fipl-meet.js";

test("parseItalianCalendarDate parses first date and month", () => {
  assert.equal(parseItalianCalendarDate("15/16 marzo", 2026), "2026-03-15");
});

test("isoDateFromResultsUrls prefers embedded date", () => {
  const date = isoDateFromResultsUrls(
    [
      "https://www.powerliftingitalia-fipl.it/public/gare/2026-04-21-95-risultati.pdf",
    ],
    "2026-04-20",
  );
  assert.equal(date, "2026-04-21");
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
