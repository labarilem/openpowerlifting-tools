import { describe, test } from "node:test";
import { convertFiplPdfToOplCsv } from "../../../src/parse.js";
import { compareCSVFiles } from "../../utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "../../utils/dataset.js";
import { deadliftOnlyColumns } from "../../utils/parser.js";

describe("FIPL 2025", () => {
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

  test.only("2507", async () => {
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
});
