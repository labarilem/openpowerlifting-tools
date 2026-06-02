import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  convertFiplPdfBytesToOplCsv,
  convertFiplPdfToOplCsv,
} from "../../../packages/opl-tools/src/federations/fipl/parse.js";
import { getInputPdfPath } from "../../utils/dataset.js";

test("convertFiplPdfBytesToOplCsv matches file-based conversion", async () => {
  const federation = "fipl";
  const meetId = "2608";
  const inputPath = getInputPdfPath(federation, meetId);
  const options = { isOpenDivision: true };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opl-tools-"));
  const outputPath = path.join(tempDir, "entries.csv");

  try {
    await convertFiplPdfToOplCsv(inputPath, outputPath, options);
    const fileBasedCsv = fs.readFileSync(outputPath, "utf8");

    const bytes = fs.readFileSync(inputPath);
    const bytesBasedCsv = await convertFiplPdfBytesToOplCsv(bytes, options);

    assert.equal(bytesBasedCsv, fileBasedCsv);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
