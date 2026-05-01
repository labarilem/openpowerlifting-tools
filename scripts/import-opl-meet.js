#!/usr/bin/env node

import fs from "fs";
import path from "path";
import config from "../config.js";
import {
  downloadPdf,
  mergePdfs,
  readPdfUrls,
} from "../src/lib/import-meet-pdf.js";

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
