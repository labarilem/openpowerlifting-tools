import { describe, test } from "node:test";
import { convertFiplPdfToOplCsv } from "../../../src/parse.js";
import { compareCSVFiles } from "../../utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "../../utils/dataset.js";
import {
  allColumns,
  deadliftOnlyColumns,
  numericColumns,
} from "../../utils/parser.js";

describe("FIPL YEAR 2025", () => {
  test("2506", async () => {
    const meetId = "2506";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: deadliftOnlyColumns,
    });
  });

  test("2507", async () => {
    const meetId = "2507";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: deadliftOnlyColumns,
    });
  });

  test("2508", async () => {
    const meetId = "2508";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: deadliftOnlyColumns,
    });
  });

  test.only("2516", async () => {
    const meetId = "2516";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2517", async () => {
    const meetId = "2517";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2518", async () => {
    const meetId = "2518";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2519", async () => {
    const meetId = "2519";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2520", async () => {
    const meetId = "2520";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2521", async () => {
    const meetId = "2521";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });
});
