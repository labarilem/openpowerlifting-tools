import { fiplFederation } from "./fipl/index.js";

const federations = new Map([[fiplFederation.id, fiplFederation]]);

function normalizeFederationId(federation) {
  return String(federation || "")
    .trim()
    .toLowerCase();
}

export function listFederationIds() {
  return [...federations.keys()];
}

export function getFederation(federation) {
  return federations.get(normalizeFederationId(federation)) || null;
}

export function getFederationOrThrow(federation) {
  const resolved = getFederation(federation);
  if (resolved) return resolved;

  const supported = listFederationIds();
  const label =
    supported.length === 1
      ? `Only "${supported[0]}" is currently supported.`
      : `Supported federations: ${supported.join(", ")}.`;
  throw new Error(`Unsupported federation "${federation}". ${label}`);
}
