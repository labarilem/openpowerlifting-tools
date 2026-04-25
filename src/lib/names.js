import { firstNames } from "./first-names.js";
import { toTitleCase } from "./format.js";

/**
 * Checks whether wors is a proposition used in person names.
 * @param {string} word
 * @returns {boolean}
 */
function isProposition(word) {
  if (!word) return false;
  return ["di", "da", "in"].includes(word.toLowerCase());
}

/**
 * Normalizes a person name in OPL format: {first name} {last name}.
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeFullName(rawName) {
  const nameParts = rawName.split(/\s+/);
  let lastFirstNameIndex = nameParts.length - 1;
  for (let i = lastFirstNameIndex - 1; i > 0; i--) {
    if (
      firstNames.has(nameParts[i].toLowerCase()) &&
      !isProposition(nameParts[i - 1])
    ) {
      lastFirstNameIndex = i;
      i--;
    } else break;
  }
  const name = toTitleCase(
    [...nameParts.splice(lastFirstNameIndex), ...nameParts].join(" "),
  );
  const normalizedName = name
    .replaceAll(/a['´ʹ']/g, "à")
    .replaceAll(/e['´ʹ']/g, "è")
    .replaceAll(/i['´ʹ']/g, "ì")
    .replaceAll(/o['´ʹ']/g, "ò")
    .replaceAll(/u['´ʹ']/g, "ù")
    .replaceAll(/'([a-z])/g, (_, letter) => `'${letter.toUpperCase()}`);
  return normalizedName;
}
