import { firstNames } from "./first-names.js";
import { namesOverrides } from "./names-overrides.js";
import { toTitleCase } from "./format.js";

/**
 * Checks whether wors is a proposition used in person last names.
 * @param {string} word
 * @returns {boolean}
 */
function isLastnameProposition(word) {
  if (!word) return false;
  return [
    "di",
    "da",
    "in",
    "el",
    "la",
    "lo",
    "della",
    "de",
    "del",
    "dal",
  ].includes(word.toLowerCase());
}

const maxFirstNameWords = Math.max(
  ...Array.from(firstNames, (name) => name.split(/\s+/).length),
);

function getFirstNameWordsEndingAt(nameParts, endIndex) {
  const maxWords = Math.min(maxFirstNameWords, endIndex + 1);
  for (let wordCount = maxWords; wordCount > 0; wordCount--) {
    const startIndex = endIndex - wordCount + 1;
    const candidate = nameParts.slice(startIndex, endIndex + 1).join(" ");
    if (firstNames.has(candidate.toLowerCase())) return wordCount;
  }
  return 0;
}

/**
 * Normalizes a person name in OPL format: {first name} {last name}.
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeFullName(rawName) {
  const nameParts = rawName.split(/\s+/);
  let lastFirstNameIndex = nameParts.length - 1;
  for (let i = lastFirstNameIndex; i > 0; ) {
    const firstNameWords = getFirstNameWordsEndingAt(nameParts, i);
    if (!firstNameWords) break;

    const firstNameStartIndex = i - firstNameWords + 1;
    if (isLastnameProposition(nameParts[firstNameStartIndex - 1])) break;

    lastFirstNameIndex = firstNameStartIndex;
    i = firstNameStartIndex - 1;
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

/**
 * Applies per-athlete name overrides keyed by normalized name + birth year.
 * @param {string} name
 * @param {string} birthYear
 * @returns {string}
 */
export function withNameOverride(name, birthYear) {
  const key = `${name},${birthYear}`.toLowerCase();
  return namesOverrides.get(key) || name;
}
