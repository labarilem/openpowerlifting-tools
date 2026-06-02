#!/usr/bin/env node

import fs from "fs";
import path from "path";
import config from "../config.js";
import {
  downloadPdf,
  mergePdfs,
  readPdfUrls,
} from "../packages/opl-tools/src/lib/import-meet-pdf.js";

function printUsage() {
  console.error(
    "Usage: node scripts/import-opl-meet.js <federation> <meetId> [repoPath] [outputDir]",
  );
  console.error("");
  console.error(
    "  federation  - Name of the federation folder under meet-data/",
  );
  console.error(
    "  meetId      - Name of the meet folder under meet-data/<federation>/",
  );
  console.error(
    "  repoPath    - Optional; path to the cloned opl-data repository (default from config.js)",
  );
  console.error(
    "  outputDir   - Optional; destination folder (default: ./tests/dataset/<federation>/<meetId>)",
  );
  console.error("");
  console.error("Example:");
  console.error("  node scripts/import-opl-meet.js fipl 2604");
  console.error(
    "  node scripts/import-opl-meet.js fipe 2604 ~/opl-data ./tests/dataset/fipe/2604",
  );
}

const MEET_FILES_TO_COPY = ["entries.csv", "meet.csv", "URL"];

function copyMeetFiles(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  for (const fileName of MEET_FILES_TO_COPY) {
    const srcPath = path.join(srcDir, fileName);
    const destPath = path.join(destDir, fileName);

    if (!fs.existsSync(srcPath)) {
      console.warn(`Warning: File not found, skipping: ${srcPath}`);
      continue;
    }

    if (!fs.statSync(srcPath).isFile()) {
      console.warn(`Warning: Expected a file, skipping: ${srcPath}`);
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied: ${fileName}`);
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

  copyMeetFiles(meetSrcDir, destDir);

  console.log(`Copied meet`);

  const destInputPdfPath = path.join(destDir, "input.pdf");
  const srcUrlPath = path.join(meetSrcDir, "URL");
  if (!fs.existsSync(destInputPdfPath) && fs.existsSync(srcUrlPath)) {
    try {
      const meetPdfUrls = readPdfUrls(srcUrlPath);

      if (meetPdfUrls.length === 0) {
        console.warn("Cannot download PDF (URL file is empty)");
      } else if (meetPdfUrls.length === 1) {
        const [meetPdfUrl] = meetPdfUrls;
        console.log(`Downloading PDF '${meetPdfUrl}'`);
        await downloadPdf(meetPdfUrl, destInputPdfPath);
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
    } catch (err) {
      console.warn(`Cannot download PDF (${err.message})`);
    }
  } else if (!fs.existsSync(destInputPdfPath)) {
    console.warn("Cannot download PDF (missing URL file)");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
