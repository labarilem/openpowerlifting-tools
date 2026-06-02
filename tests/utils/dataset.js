export function getInputPdfPath(federation, meetId) {
  return `./tests/dataset/${federation}/${meetId}/input.pdf`;
}

export function getOutputCsvPath(federation, meetId) {
  return `./tests/dataset/${federation}/${meetId}/entries-parsed.csv`;
}

export function getReferenceCsvPath(federation, meetId) {
  return `./tests/dataset/${federation}/${meetId}/entries.csv`;
}
