import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Parses a simple comma-separated CSV string into an array of row objects.
 * Assumes fields are never quoted and values never contain commas.
 *
 * @param {string} content - Raw CSV file content
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCSV(content) {
  const lines = content
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
  return { headers, rows };
}

/**
 * Compares two CSV files for logical equality.
 *
 * Both files are sorted by `sortColumn` before comparison.
 * Only the columns listed in `compareColumns` are checked.
 * Mismatches produce descriptive assertion errors identifying
 * the row index (post-sort), column name, and differing values.
 *
 * @param {string} fileA          - Path to the first CSV file
 * @param {string} fileB          - Path to the second CSV file
 * @param {string} sortColumn     - Column name to sort both files by before comparing
 * @param {string[]} compareColumns - Column names to compare (order matters after sort)
 */
export function compareCSVFiles(fileA, fileB, sortColumn, compareColumns) {
  const { rows: rawA } = parseCSV(readFileSync(fileA, "utf-8"));
  const { rows: rawB } = parseCSV(readFileSync(fileB, "utf-8"));

  // Validate that sortColumn and compareColumns exist in both files
  for (const [label, rows] of [
    ["fileA", rawA],
    ["fileB", rawB],
  ]) {
    const available = Object.keys(rows[0] ?? {}).join(", ");
    for (const col of [sortColumn, ...compareColumns]) {
      assert.ok(
        rows.length === 0 || col in rows[0],
        `Column "${col}" not found in ${label}. Available columns: ${available}`,
      );
    }
  }

  const sortFn = (a, b) =>
    String(a[sortColumn]).localeCompare(String(b[sortColumn]), undefined, {
      numeric: true,
    });

  const sortedA = [...rawA].sort(sortFn);
  const sortedB = [...rawB].sort(sortFn);

  assert.strictEqual(
    sortedA.length,
    sortedB.length,
    `Row count mismatch: "${fileA}" has ${sortedA.length} rows, "${fileB}" has ${sortedB.length} rows`,
  );

  for (let i = 0; i < sortedA.length; i++) {
    const rowA = sortedA[i];
    const rowB = sortedB[i];
    for (const col of compareColumns) {
      assert.strictEqual(
        rowA[col],
        rowB[col],
        `Mismatch at row ${i + 1}, column "${col}": ` +
          `"${fileA}" has ${JSON.stringify(rowA[col])}, ` +
          `"${fileB}" has ${JSON.stringify(rowB[col])} ` +
          `(sort key: ${JSON.stringify(rowA[sortColumn])})`,
      );
    }
  }
}
