import { describe, test } from "node:test";
import { convertFiplPdfToOplCsv } from "../../../packages/opl-tools/src/parse.js";
import { compareCSVFiles } from "../../utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "../../utils/dataset.js";
import {
  allColumns,
  deadliftOnlyColumns,
  benchOnlyColumns,
} from "../../utils/parser.js";

describe("FIPL YEAR 2025", () => {
  test("2501", async () => {
    const meetId = "2501";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: benchOnlyColumns,
    });
  });

  test("2502", async () => {
    const meetId = "2502";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: benchOnlyColumns,
    });
  });

  test("2503", async () => {
    const meetId = "2503";
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

  test("2504", async () => {
    const meetId = "2504";
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

  test("2509", async () => {
    const meetId = "2509";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2510", async () => {
    const meetId = "2510";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2511", async () => {
    const meetId = "2511";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: true },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: allColumns,
    });
  });

  test("2512", async () => {
    const meetId = "2512";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: benchOnlyColumns,
    });
  });

  test("2513", async () => {
    const meetId = "2513";
    await convertFiplPdfToOplCsv(
      getInputPdfPath(meetId),
      getOutputCsvPath(meetId),
      { isOpenDivision: false },
    );
    compareCSVFiles(getOutputCsvPath(meetId), getReferenceCsvPath(meetId), {
      sortColumn: "Name",
      compareColumns: benchOnlyColumns,
    });
  });

  test("2514", async () => {
    const meetId = "2514";
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

  test("2515", async () => {
    const meetId = "2515";
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

  test("2516", async () => {
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
