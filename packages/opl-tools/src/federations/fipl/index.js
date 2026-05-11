import { scrapeCalendar } from "./calendar.js";
import { buildMeetArtifactsFromCalendarEntry } from "./meet.js";
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
  buildMeetArtifactsFromCalendarEntry,
  convertPdfBytesToOplCsv,
  convertPdfToOplCsv,
};
