import { describe, test } from "node:test";
import { convertFipePdfToOplCsv } from "../../../packages/opl-tools/src/federations/fipe/parse.js";
import { compareCSVFiles } from "../../utils/csv.js";
import {
  getInputPdfPath,
  getOutputCsvPath,
  getReferenceCsvPath,
} from "../../utils/dataset.js";
import { allColumns } from "../../utils/parser.js";

describe("FIPE YEAR 2026", () => {
  const federation = "fipe";

  test("2604", async () => {
    const meetId = "2604";
    await convertFipePdfToOplCsv(
      getInputPdfPath(federation, meetId),
      getOutputCsvPath(federation, meetId),
    );
    compareCSVFiles(
      getOutputCsvPath(federation, meetId),
      getReferenceCsvPath(federation, meetId),
      { sortColumn: "Name", compareColumns: allColumns.filter((c) => c !== "BirthDate") },
    );
  });
});
