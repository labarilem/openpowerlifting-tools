import { firstNames } from "./first-names.js";
import { namesOverrides } from "./names-overrides.js";
import { toTitleCase } from "./format.js";

/** Uppercase surname particles (Italian, Dutch, Spanish, etc.). */
export const NAME_PARTICLES = new Set([
  "DA",
  "DAL",
  "DE",
  "DEL",
  "DELLA",
  "DI",
  "EL",
  "IN",
  "LA",
  "LE",
  "LO",
  "LAS",
  "LOS",
  "SAN",
  "SANT",
  "VAN",
  "VON",
]);

/**
 * Checks whether word is a proposition used in person last names.
 * @param {string} word
 * @returns {boolean}
 */
export function isLastnameProposition(word) {
  if (!word) return false;
  return NAME_PARTICLES.has(word.toUpperCase());
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

/** Title case plus OPL apostrophe / accent normalization (shared by name helpers). */
function toOplDisplayName(titleCasedJoined) {
  return titleCasedJoined
    .replaceAll(/a['´ʹ']/g, "à")
    .replaceAll(/e['´ʹ']/g, "è")
    .replaceAll(/i['´ʹ']/g, "ì")
    .replaceAll(/o['´ʹ']/g, "ò")
    .replaceAll(/u['´ʹ']/g, "ù")
    .replaceAll(/'([a-z])/g, (_, letter) => `'${letter.toUpperCase()}`);
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
  return toOplDisplayName(name);
}

/**
 * Same output shape as {@link normalizeFullName} when given name and family name
 * are already split (e.g. separate "Nome" / "Cognome" columns).
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string}
 */
export function normalizeSplitName(firstName, lastName) {
  const first = String(firstName ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const last = String(lastName ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = [];
  if (first) parts.push(first);
  if (last) parts.push(last);
  if (parts.length === 0) return "";
  return toOplDisplayName(toTitleCase(parts.join(" ")));
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
