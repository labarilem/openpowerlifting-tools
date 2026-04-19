import { test, describe } from "node:test";
import { compareCSVFiles } from "./utils/csv.js";
import { convertFiplPdfToOplCsv } from "../src/parse.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "./utils/dataset.js";
import { allParserColumns } from "./utils/parser.js";

describe("FIPL", () => {
  test("2603", async () => {
    const meetId = "2603";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(meetId),
      getReferenceCsvPath(meetId),
      "Name",
      allParserColumns,
    );
  });

  test("2604", async () => {
    const meetId = "2604";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(meetId),
      getReferenceCsvPath(meetId),
      "Name",
      allParserColumns,
    );
  });
});
