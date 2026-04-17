import fs from "fs";
import { PDFDocument } from "pdf-lib";

/**
 *
 * @param {string} inputPdfPath
 * @param {string} outputPdfPath
 * @param {numebr} fromPage
 * @param {number} toPage
 */
export async function cutPDF(inputPdfPath, outputPdfPath, fromPage, toPage) {
  // Read the input PDF
  const pdfBytes = fs.readFileSync(inputPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Create new PDF with selected pages
  const newPdfDoc = await PDFDocument.create();

  // Copy pages from fromPage to toPage (converting to 0-indexed)
  const pageIndices = [];
  for (let i = fromPage - 1; i < toPage; i++) {
    pageIndices.push(i);
  }

  const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
  copiedPages.forEach((page) => newPdfDoc.addPage(page));

  // Save the output PDF
  const pdfBytesOutput = await newPdfDoc.save();
  fs.writeFileSync(outputPdfPath, pdfBytesOutput);
}
