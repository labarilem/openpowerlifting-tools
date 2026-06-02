import { describe, test } from "node:test";
import { convertFiplPdfToOplCsv } from "../../../packages/opl-tools/src/federations/fipl/parse.js";
import { compareCSVFiles } from "../../utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "../../utils/dataset.js";
import { allColumns, benchOnlyColumns } from "../../utils/parser.js";

describe("FIPL YEAR 2026", () => {
  const federation = "fipl";

  test("2601", async () => {
    const meetId = "2601";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        sortColumn: "Name",
        compareColumns: benchOnlyColumns,
      },
    );
  });

  test("2602", async () => {
    const meetId = "2602";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        compareColumns: benchOnlyColumns,
      },
    );
  });

  test("2603", async () => {
    const meetId = "2603";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        sortColumn: "Name",
        compareColumns: allColumns,
      },
    );
  });

  test("2604", async () => {
    const meetId = "2604";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        sortColumn: "Name",
        compareColumns: benchOnlyColumns,
      },
    );
  });

  test("2605", async () => {
    const meetId = "2605";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        compareColumns: benchOnlyColumns,
      },
    );
  });

  test("2606", async () => {
    const meetId = "2606";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        compareColumns: allColumns,
      },
    );
  });

  test("2607", async () => {
    const meetId = "2607";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        compareColumns: allColumns,
      },
    );
  });

  test("2608", async () => {
    const meetId = "2608";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        compareColumns: allColumns,
      },
    );
  });

  test("2609", async () => {
    const meetId = "2609";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      {
        // birth date has been added manually from contributors in this case because, it's not present in the PDF
        compareColumns: allColumns.filter((c) => c !== "BirthDate"),
      },
    );
  });
});
