const fs = require("fs");
const path = require("path");
const pdfjs = require("pdfjs-dist");

function round(n) {
  return Math.round(n * 10) / 10; // adjust precision if needed
}

function dedupeRects(rects) {
  const seen = new Set();

  return rects.filter((r) => {
    const key = `${round(r.x)}|${round(r.y)}|${round(r.w)}|${round(r.h)}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFilledRects(opList) {
  const { fnArray, argsArray } = opList;
  const OPS = pdfjsLib.OPS;

  const rects = [];

  let currentColor = null;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    // Track fill color
    if (fn === OPS.setFillRGBColor) {
      currentColor = args; // [r, g, b] (0–1 range)
    }

    // Rectangle path
    if (fn === OPS.constructPath) {
      const [ops, coords] = args;

      for (let j = 0; j < ops.length; j++) {
        if (ops[j] === OPS.rectangle) {
          const x = coords[j * 4];
          const y = coords[j * 4 + 1];
          const w = coords[j * 4 + 2];
          const h = coords[j * 4 + 3];

          const serializedColor = currentColor.join(",");
          rects.push({
            x,
            y,
            w,
            h,
            color: serializedColor,
          });
        }
      }
    }
  }

  return rects;
}

async function parsePdfStructural(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(pdfBuffer);
  const pdf = await pdfjs.getDocument({ data: uint8Array }).promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const opList = await page.getOperatorList();
    const rects = dedupeRects(extractFilledRects(opList));

    const colorsMap = new Map();
    for (const rect of rects) {
      if (rect.color === "255,0,0") console.log(rect);
      colorsMap.set(rect.color, (colorsMap.get(rect.color) || 0) + 1);
    }
    console.log(colorsMap);
  }

  // 52 first page
  // 28 second page
  // RED is rgb(255, 0, 0)
}

async function main() {
  const examplesDir = path.join(__dirname, "..", "examples", "1");
  const pdfPath = path.join(examplesDir, "input-cut.pdf");
  await parsePdfStructural(pdfPath);
}

if (require.main === module) {
  main();
}
