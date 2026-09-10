const clean = (value) => String(value ?? '').trim();

const positiveInt = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

export function normalizeContentLineage(assignment = {}) {
  const raw = assignment?.contentLineage && typeof assignment.contentLineage === 'object' && !Array.isArray(assignment.contentLineage)
    ? assignment.contentLineage
    : {};
  const version = positiveInt(raw.version, 1);
  return {
    familyId: clean(raw.familyId) || null,
    version,
    label: `V${version}`,
    releaseStatus: clean(raw.releaseStatus) === 'superseded' ? 'superseded' : 'current',
    supersedesVersion: Number.isInteger(Number(raw.supersedesVersion)) && Number(raw.supersedesVersion) > 0
      ? Number(raw.supersedesVersion)
      : null,
    sourceAssignmentId: clean(raw.sourceAssignmentId) || null,
    createdFromAuditId: clean(raw.createdFromAuditId) || null,
  };
}

export const contentVersionOf = (assignment = {}) => normalizeContentLineage(assignment).version;

export const contentVersionLabel = (assignment = {}) => `Content V${contentVersionOf(assignment)}`;

export const sameContentFamily = (left = {}, right = {}) => {
  const leftFamily = normalizeContentLineage(left).familyId;
  const rightFamily = normalizeContentLineage(right).familyId;
  return Boolean(leftFamily && rightFamily && leftFamily === rightFamily);
};

export function latestFamilyRelease(assignments = [], assignment = {}) {
  const familyId = normalizeContentLineage(assignment).familyId;
  if (!familyId) return null;
  const matches = (Array.isArray(assignments) ? assignments : [])
    .filter((candidate) => normalizeContentLineage(candidate).familyId === familyId)
    .sort((a, b) => contentVersionOf(b) - contentVersionOf(a));
  return matches[0] || null;
}

export function groupCurrentLibraryReleases(assignments = []) {
  const visible = [];
  const families = new Map();

  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const lineage = normalizeContentLineage(assignment);
    if (!lineage.familyId) {
      visible.push(assignment);
      continue;
    }
    if (!families.has(lineage.familyId)) families.set(lineage.familyId, []);
    families.get(lineage.familyId).push(assignment);
  }

  for (const [familyId, releases] of families) {
    releases.sort((a, b) => contentVersionOf(b) - contentVersionOf(a));
    const current = releases.find((assignment) => normalizeContentLineage(assignment).releaseStatus === 'current') || releases[0];
    if (current) visible.push(current);
    families.set(familyId, releases);
  }

  return { visible, families };
}
