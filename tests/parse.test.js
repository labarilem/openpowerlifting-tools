import { describe, test } from "node:test";
import { convertFiplPdfToOplCsv } from "../src/parse.js";
import { compareCSVFiles } from "./utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "./utils/dataset.js";
import { allColumns, benchOnlyColumns } from "./utils/parser.js";

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
      allColumns,
    );
  });

  test("2604", async () => {
    const meetId = "2604";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      "bench",
    );
    compareCSVFiles(
      getOutputCsvPath(meetId),
      getReferenceCsvPath(meetId),
      "Name",
      benchOnlyColumns,
    );
  });
});
