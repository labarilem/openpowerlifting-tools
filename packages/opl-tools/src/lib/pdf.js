/**
 * Deduplicate rectangles by their coordinates.
 * @param {Array<{x: number, y: number, w: number, h: number}>} rects
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
export function dedupeRects(rects) {
  const seen = new Set();
  const result = [];
  for (const r of rects) {
    const key = `${r.x}|${r.y}|${r.w}|${r.h}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
    }
  }
  return result;
}

/**
 * Check if color is red.
 * @param {Array<number>} color
 * @returns {boolean}
 */
export function isRedColor(color) {
  if (!color) return false;
  return color.join(",") === "255,0,0";
}

/**
 * Check if text (in PDF coords) overlaps any red rectangle (in PDF coords).
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Array<{x: number, y: number, w: number, h: number}>} rects
 * @returns {boolean}
 */
export function isInAnyRectangle(x, y, width, height, rects) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  return rects.some((rect) => {
    const rectRight = rect.x + rect.w;
    const rectTop = rect.y + rect.h;
    return (
      centerX >= rect.x &&
      centerX <= rectRight &&
      centerY >= rect.y &&
      centerY <= rectTop
    );
  });
}