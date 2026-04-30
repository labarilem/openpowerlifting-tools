import { describe, test } from "node:test";
import { convertFiplPdfToOplCsv } from "../../../src/parse.js";
import { compareCSVFiles } from "../../utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "../../utils/dataset.js";
import { allColumns, benchOnlyColumns } from "../../utils/parser.js";

describe("FIPL YEAR 2026", () => {
  test("2601", async () => {
    const meetId = "2601";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: benchOnlyColumns,
    });
  });

  test("2602", async () => {
    const meetId = "2602";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      compareColumns: benchOnlyColumns,
    });
  });

  test("2603", async () => {
    const meetId = "2603";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2604", async () => {
    const meetId = "2604";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: benchOnlyColumns,
    });
  });

  test("2605", async () => {
    const meetId = "2605";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      compareColumns: benchOnlyColumns,
    });
  });

  test("2606", async () => {
    const meetId = "2606";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      compareColumns: allColumns,
    });
  });
});
