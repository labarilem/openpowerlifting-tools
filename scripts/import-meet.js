#!/usr/bin/env node

import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { PDFDocument } from "pdf-lib";
import config from "../config.js";

/**
 * Downloads a PDF from the given URL and saves it to destPath.
 *
 * @param {string} url        - Full URL of the PDF to download
 * @param {string} destPath   - Local file path to write the PDF to
 * @returns {Promise<string>} - Resolves with destPath on success
 */
function downloadPdf(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const handleResponse = (res) => {
      // Follow redirects (301, 302, 307, 308)
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        return downloadPdf(redirectUrl, destPath).then(resolve).catch(reject);
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
        fs.unlink(destPath, () => {}); // clean up partial file
        reject(err);
      });
    };

    const req = transport.get(url, handleResponse);

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(30_000, () => {
      req.destroy(new Error("Request timed out after 30s"));
    });
  });
}

function printUsage() {
  console.error("Usage: node import-meet.js <meetId> <repoPath> <outputDir>");
  console.error("");
  console.error(
    "  federation     - Name of the federation folder under meet-data/",
  );
  console.error(
    "  meetId     - Name of the meet folder under meet-data/<federation>/",
  );
  console.error("  repoPath   - Path to the cloned opl-data repository");
  console.error("  outputDir   - Path to the output directory");
  console.error("");
  console.error("Example:");
  console.error(
    "  node copy-meet.js 2023-01-15-Nationals /path/to/opl-data ./output",
  );
}

function copyDirContents(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${entry.name}`);
    }
  }
}

function readPdfUrls(urlFilePath) {
  const rawText = fs.readFileSync(urlFilePath, "utf8");
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function mergePdfs(inputPaths, outputPath) {
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

async function main() {
  let [, , federation, meetId, repoPath, outputDir] = process.argv;

  if (!federation || !meetId) {
    console.error("Error: Missing required arguments.\n");
    printUsage();
    process.exit(1);
  }
  repoPath = repoPath ?? config.defaultOplDataRepoPath;
  outputDir = outputDir ?? `./tests/dataset/${federation}/${meetId}`;

  const meetSrcDir = path.resolve(repoPath, "meet-data", federation, meetId);
  if (!fs.existsSync(meetSrcDir)) {
    console.error(`Error: Meet folder not found: ${meetSrcDir}`);
    process.exit(1);
  }

  const stat = fs.statSync(meetSrcDir);
  if (!stat.isDirectory()) {
    console.error(`Error: Path exists but is not a directory: ${meetSrcDir}`);
    process.exit(1);
  }

  const destDir = path.resolve(outputDir);

  console.log(`Copying meet '${meetId}' from:`);
  console.log(`  Source : ${meetSrcDir}`);
  console.log(`  Dest   : ${destDir}`);
  console.log("");

  copyDirContents(meetSrcDir, destDir);

  console.log(`Copied meet`);

  const destPDFPath = path.join(destDir, "URL");
  if (fs.existsSync(destPDFPath)) {
    const meetPdfUrls = readPdfUrls(destPDFPath);

    if (meetPdfUrls.length === 0) {
      console.warn("Cannot download PDF (URL file is empty)");
    } else if (meetPdfUrls.length === 1) {
      const [meetPdfUrl] = meetPdfUrls;
      const inputPath = path.join(destDir, "input.pdf");
      console.log(`Downloading PDF '${meetPdfUrl}'`);
      await downloadPdf(meetPdfUrl, inputPath);
      console.log("Downloaded PDF");
    } else {
      const tempPaths = [];
      try {
        for (let i = 0; i < meetPdfUrls.length; i += 1) {
          const url = meetPdfUrls[i];
          const tempPath = path.join(destDir, `input-part-${i + 1}.pdf`);
          tempPaths.push(tempPath);
          console.log(
            `Downloading PDF ${i + 1}/${meetPdfUrls.length} '${url}'`,
          );
          await downloadPdf(url, tempPath);
        }

        const mergedPath = path.join(destDir, "input.pdf");
        console.log(`Merging ${tempPaths.length} PDFs into '${mergedPath}'`);
        await mergePdfs(tempPaths, mergedPath);
        console.log("Merged PDF");
      } finally {
        for (const tempPath of tempPaths) {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }
      }
    }
  } else {
    console.warn("Cannot download PDF (missing URL file)");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
