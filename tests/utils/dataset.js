function resolveFederationAndMeetId(firstArg, secondArg) {
  if (secondArg === undefined) {
    return { federation: "fipl", meetId: firstArg };
  }
  return { federation: firstArg, meetId: secondArg };
}

export function getInputPdfPath(federationOrMeetId, maybeMeetId) {
  const { federation, meetId } = resolveFederationAndMeetId(
    federationOrMeetId,
    maybeMeetId,
  );
  return `./tests/dataset/${federation}/${meetId}/input.pdf`;
}

export function getOutputCsvPath(federationOrMeetId, maybeMeetId) {
  const { federation, meetId } = resolveFederationAndMeetId(
    federationOrMeetId,
    maybeMeetId,
  );
  return `./tests/dataset/${federation}/${meetId}/entries-parsed.csv`;
}

export function getReferenceCsvPath(federationOrMeetId, maybeMeetId) {
  const { federation, meetId } = resolveFederationAndMeetId(
    federationOrMeetId,
    maybeMeetId,
  );
  return `./tests/dataset/${federation}/${meetId}/entries.csv`;
}
