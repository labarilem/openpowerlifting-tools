/**
 * Formats str to a Title case string.
 * @param {string} str 
 * @returns {string}
 */
export function toTitleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}