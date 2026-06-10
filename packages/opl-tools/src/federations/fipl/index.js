import { scrapeCalendar } from "./calendar.js";
import {
  buildMeetArtifactsFromCalendarEntry,
  findLatestMeetWithResults,
} from "./meet.js";
import {
  convertPdfBytesToOplCsv,
  convertPdfToOplCsv,
} from "./parse.js";

export const fiplFederation = {
  id: "fipl",
  parseOptionsSchema: {
    isOpenDivision: "boolean",
  },
  scrapeCalendar,
  findLatestMeetWithResults,
  buildMeetArtifactsFromCalendarEntry,
  convertPdfBytesToOplCsv,
  convertPdfToOplCsv,
};
