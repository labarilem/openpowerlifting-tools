import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { PDFDocument } from "pdf-lib";

/**
 * Downloads a PDF from the given URL and saves it to destPath (redirects followed).
 *
 * @param {string} url
 * @param {string} destPath
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<string>} destPath on success
 */
export function downloadPdf(url, destPath, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const handleResponse = (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        return downloadPdf(redirectUrl, destPath, options)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(
          new Error(`Failed to download PDF: HTTP ${res.statusCode}`),
        );
      }

      const contentType = res.headers["content-type"] || "";
      if (
        !contentType.includes("pdf") &&
        !contentType.includes("octet-stream")
      ) {
        console.warn(`Warning: unexpected content-type '${contentType}'`);
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      const fileStream = fs.createWriteStream(destPath);

      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        resolve(destPath);
      });

      fileStream.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    const req = transport.get(url, handleResponse);

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

/**
 * Merges PDFs in order into a single file (synchronous read/write of output).
 *
 * @param {string[]} inputPaths
 * @param {string} outputPath
 */
export async function mergePdfs(inputPaths, outputPath) {
  const mergedPdf = await PDFDocument.create();

  for (const inputPath of inputPaths) {
    const bytes = fs.readFileSync(inputPath);
    const pdf = await PDFDocument.load(bytes);
    const pageIndices = pdf.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
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
