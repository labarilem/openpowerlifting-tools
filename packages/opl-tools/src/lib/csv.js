/**
 * RFC-style CSV single-line parse (quoted fields, escaped quotes).
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  values.push(current);
  return values;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsv(value) {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

/**
 * @param {string[]} cells
 * @returns {string}
 */
export function joinCsvRow(cells) {
  return cells.map(escapeCsv).join(",");
}
