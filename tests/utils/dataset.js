export function getInputPdfPath(meetId) {
  return `./tests/dataset/fipl/${meetId}/input.pdf`;
}

export function getOutputCsvPath(meetId) {
  return `./tests/dataset/fipl/${meetId}/entries-parsed.csv`;
}

export function getReferenceCsvPath(meetId) {
  return `./tests/dataset/fipl/${meetId}/entries.csv`;
}
