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
 * When `sortColumn` is provided, both files are sorted by that column.
 * Only the columns listed in `compareColumns` are checked.
 * Mismatches produce descriptive assertion errors identifying
 * the row index (post-sort), column name, and differing values.
 *
 * @param {string} fileA          - Path to the first CSV file
 * @param {string} fileB          - Path to the second CSV file
 * @param {{ sortColumn?: string, sortColumns?: string[], compareColumns: string[] }} options
 *   - `sortColumn`: Optional single column name to sort by before comparing
 *   - `sortColumns`: Optional list of columns used for lexicographic sort
 *   - `compareColumns`: Column names to compare (order matters if not sorted)
 */
export function compareCSVFiles(fileA, fileB, options = {}) {
  const { sortColumn, sortColumns, compareColumns = [] } = options;
  const sortKeys =
    Array.isArray(sortColumns) && sortColumns.length > 0
      ? sortColumns
      : sortColumn
        ? [sortColumn]
        : [];
  const { rows: rawA } = parseCSV(readFileSync(fileA, "utf-8"));
  const { rows: rawB } = parseCSV(readFileSync(fileB, "utf-8"));

  assert.ok(
    Array.isArray(compareColumns),
    "options.compareColumns must be an array",
  );

  // Validate that compareColumns (and optional sortColumn) exist in both files
  const columnsToValidate =
    sortKeys.length > 0 ? [...sortKeys, ...compareColumns] : compareColumns;
  for (const [label, rows] of [
    ["fileA", rawA],
    ["fileB", rawB],
  ]) {
    const available = Object.keys(rows[0] ?? {}).join(", ");
    for (const col of columnsToValidate) {
      assert.ok(
        rows.length === 0 || col in rows[0],
        `Column "${col}" not found in ${label}. Available columns: ${available}`,
      );
    }
  }

  const sortedA = [...rawA];
  const sortedB = [...rawB];
  if (sortKeys.length > 0) {
    const sortFn = (a, b) => {
      for (const key of sortKeys) {
        const cmp = String(a[key]).localeCompare(String(b[key]), undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (cmp !== 0) return cmp;
      }
      return 0;
    };
    sortedA.sort(sortFn);
    sortedB.sort(sortFn);
  }

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
          (sortKeys.length > 0
            ? ` (sort key: ${JSON.stringify(sortKeys.map((k) => rowA[k]))})`
            : ` (key: ${JSON.stringify(rowA["Name"])})`),
      );
    }
  }
}
