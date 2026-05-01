import { toTitleCase } from "./format.js";

const IT_MONTHS = new Map([
  ["gennaio", 1],
  ["febbraio", 2],
  ["marzo", 3],
  ["aprile", 4],
  ["maggio", 5],
  ["giugno", 6],
  ["luglio", 7],
  ["agosto", 8],
  ["settembre", 9],
  ["ottobre", 10],
  ["novembre", 11],
  ["dicembre", 12],
]);

/**
 * First competition day as YYYY-MM-DD; uses `year` if the string has no year.
 * @param {string} dateStr
 * @param {number} calendarYear
 */
export function parseItalianCalendarDate(dateStr, calendarYear) {
  let s = dateStr.replace(/\s+/g, " ").trim();
  s = s.replace(/([A-Za-zÀ-ÿ])(\d{4})\b/g, "$1 $2");

  const yMatch = s.match(/\b(20\d{2})\b/);
  const y = yMatch ? parseInt(yMatch[1], 10) : calendarYear;

  const sLower = s.toLowerCase();
  const monthsByLen = [...IT_MONTHS.keys()].sort((a, b) => b.length - a.length);
  let monthNum = null;
  for (const mName of monthsByLen) {
    if (new RegExp(`\\b${mName}\\b`, "i").test(sLower)) {
      monthNum = IT_MONTHS.get(mName);
      break;
    }
  }
  if (!monthNum) {
    throw new Error(`Could not parse month from calendar date: "${dateStr}"`);
  }

  const dayMatch = s.match(/^(\d{1,2})(?:[\/\-]\d{1,2})*/);
  if (!dayMatch) {
    throw new Error(`Could not parse day from calendar date: "${dateStr}"`);
  }
  const day = parseInt(dayMatch[1], 10);
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day in calendar date: "${dateStr}"`);
  }

  const mm = String(monthNum).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function shortenMeetName(name) {
  const n = name.trim();
  const lower = n.toLowerCase();
  let cut = lower.search(/\s+cat\.[-\s\d]/);
  if (cut === -1) cut = lower.search(/\s+categorie\s/);
  if (cut === -1) return n;
  return n.slice(0, cut).trim();
}

/**
 * @param {string} calendarName
 */
export function formatMeetName(calendarName) {
  let s = shortenMeetName(calendarName);
  s = toTitleCase(s);
  s = s.replace(/^(\d+)\^\s+/, "$1° ");
  s = s.replace(/^(\d)\s+/, "$1° ");
  s = s.replace(/\bDi\b/g, "di").replace(/\bDa\b/g, "da").replace(/\bE\b/g, "e");
  return s
    .replace(/\bPl\b/g, "PL")
    .replace(/\bSj\b/g, "SJ")
    .replace(/\bWec\b/g, "WEC")
    .replace(/\bIpf\b/g, "IPF")
    .replace(/\bEpf\b/g, "EPF");
}

/**
 * FIPL result PDF paths often embed the meet date: /public/gare/YYYY-MM-DD-id-...
 * @param {string[]} resultsUrls
 * @param {string} fallbackIso
 */
export function isoDateFromResultsUrls(resultsUrls, fallbackIso) {
  for (const u of resultsUrls) {
    const m = u.match(/\/gare\/(20\d{2})-(\d{2})-(\d{2})-\d+-/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return fallbackIso;
}

function meetTownFromLocation(locRaw) {
  const s = locRaw.trim();
  const m = s.match(/^(.+?)\s*-\s*([A-Z]{2})\s*$/);
  if (m) return toTitleCase(m[1].trim());
  return toTitleCase(s);
}

function csvEscape(field) {
  const s = String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {string} federationUpper
 * @param {string} isoDate
 * @param {string} meetName
 * @param {string} locationRaw
 */
export function buildMeetCsvContent(
  federationUpper,
  isoDate,
  meetName,
  locationRaw,
) {
  const meetTown = meetTownFromLocation(locationRaw);
  const row = [
    csvEscape(federationUpper),
    csvEscape(isoDate),
    csvEscape("Italy"),
    csvEscape(""),
    csvEscape(meetTown),
    csvEscape(meetName),
  ].join(",");
  return [
    "Federation,Date,MeetCountry,MeetState,MeetTown,MeetName",
    row,
  ].join("\n");
}

/**
 * @param {string[]} urls
 */
export function buildUrlFileContent(urls) {
  return urls.join("\n");
}
