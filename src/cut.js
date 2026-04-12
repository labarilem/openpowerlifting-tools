import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

async function cutPDF() {
  try {
    // Read input parameters
    const inputJsonPath = path.join(process.cwd(), 'examples', '1', 'input.json');
    const inputPdfPath = path.join(process.cwd(), 'examples', '1', 'input.pdf');
    const outputPdfPath = path.join(process.cwd(), 'examples', '1', 'input-cut.pdf');

    const inputData = JSON.parse(fs.readFileSync(inputJsonPath, 'utf8'));
    const { fromPage, toPage } = inputData;

    console.log(`Cutting PDF from page ${fromPage} to page ${toPage}...`);

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
    copiedPages.forEach(page => newPdfDoc.addPage(page));

    // Save the output PDF
    const pdfBytesOutput = await newPdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytesOutput);

    console.log(`PDF successfully cut! Output saved to ${outputPdfPath}`);
  } catch (error) {
    console.error('Error cutting PDF:', error.message);
    process.exit(1);
  }
}

cutPDF();
