import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { mergePdfBuffers } from "../../packages/opl-tools/src/lib/import-meet-pdf.js";

async function createSinglePagePdf(text) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 300]);
  page.drawText(text, { x: 20, y: 260 });
  return pdf.save();
}

test("mergePdfBuffers preserves order and page count", async () => {
  const pdfA = await createSinglePagePdf("A");
  const pdfB = await createSinglePagePdf("B");

  const mergedBytes = await mergePdfBuffers([pdfA, pdfB]);
  const mergedPdf = await PDFDocument.load(mergedBytes);

  assert.equal(mergedPdf.getPageCount(), 2);
});
