import { hashString32 } from './hashString32.mjs';

export const stableWorkloadValue = (value) => {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableWorkloadValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableWorkloadValue(value[key])]));
};

// A browser change detector, not an authorization token. Server preview tokens
// additionally SHA-256 all authoritative inputs inside the approval transaction.
export const workloadContentKey = (assignment) => {
  const text = JSON.stringify(stableWorkloadValue({ sections: assignment?.sections, schemaVersion: assignment?.schemaVersion, contentVersion: assignment?.contentVersion, contentLineage: assignment?.contentLineage, dol: assignment?.dol }));
  return `${hashString32(text).toString(16)}${hashString32(text, 0x9e3779b9).toString(16)}`;
};

export const workloadCorrectionFor = (profile, assignment) => profile?.workloadCorrections?.[assignment?.id] || null;
export const correctionContentIsCurrent = (correction, assignment) => correction?.contentKey === workloadContentKey(assignment);
