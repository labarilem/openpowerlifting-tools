import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { PDFDocument } from "pdf-lib";

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Buffer>}
 */
export function downloadPdfToBuffer(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const req = transport.get(url, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        downloadPdfToBuffer(redirectUrl, options).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download PDF: HTTP ${res.statusCode}`));
        return;
      }

      const contentType = res.headers["content-type"] || "";
      if (
        !contentType.includes("pdf") &&
        !contentType.includes("octet-stream")
      ) {
        console.warn(`Warning: unexpected content-type '${contentType}'`);
      }

      const chunks = [];
      res.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

/**
 * Downloads a PDF from the given URL and saves it to destPath (redirects followed).
 *
 * @param {string} url
 * @param {string} destPath
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<string>} destPath on success
 */
export function downloadPdf(url, destPath, options = {}) {
  return downloadPdfToBuffer(url, options).then((buffer) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return destPath;
  });
}

/**
 * Merges PDFs in order and returns the merged PDF bytes.
 * @param {Array<Uint8Array | Buffer>} inputBuffers
 * @returns {Promise<Uint8Array>}
 */
export async function mergePdfBuffers(inputBuffers) {
  const mergedPdf = await PDFDocument.create();

  for (const bytes of inputBuffers) {
    const pdf = await PDFDocument.load(bytes);
    const pageIndices = pdf.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return mergedPdf.save();
}

/**
 * Merges PDFs in order into a single file (synchronous read/write of output).
 *
 * @param {string[]} inputPaths
 * @param {string} outputPath
 */
export async function mergePdfs(inputPaths, outputPath) {
  const inputBuffers = inputPaths.map((inputPath) => fs.readFileSync(inputPath));
  const mergedBytes = await mergePdfBuffers(inputBuffers);
  fs.writeFileSync(outputPath, mergedBytes);
}

/**
 * Reads newline-separated PDF URLs from a meet `URL` file (trimmed, non-empty lines).
 *
 * @param {string} urlFilePath
 * @returns {string[]}
 */
export function readPdfUrls(urlFilePath) {
  const rawText = fs.readFileSync(urlFilePath, "utf8");
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
