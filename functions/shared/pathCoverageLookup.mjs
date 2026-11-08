// READING A STORED COVERAGE INDEX: CAN A STUDENT BE SENT TO THIS SKILL?
//
// A student's Home asks only this of My Math Path's coverage (the recommended
// skills, the weekly plan's transfer framework, the CCMR plan's frameworks):
// is a skill, or a skill for one assessment, open to practise in the index the
// server built. Building that index, and judging the quality of a standard's
// content, is pathCoverage.mjs (with pathStandardQuality.mjs and
// pathQuestionQuality.mjs under it), which My Math Path, the teacher's audit
// and the server load. These lookups lived there, and importing them carried
// all of it in front of every student's Home (PF01). pathCoverage.mjs
// re-exports every name here, so no caller and no answer changes
// (tests/platform/pathCoverageLookup.test.mjs).

export const ASSESSMENT_COVERAGE_FRAMEWORKS = Object.freeze([
  'digitalSAT',
  'act',
  'tsia2',
  'asvab',
]);

/** `texas:A.5A` and `A.5A` are the same standard. Compare one way. */
export const coverageKey = (value) => String(value ?? '')
  .trim()
  .replace(/^texas:/i, '')
  .replace(/^teks:/i, '')
  .toUpperCase()
  .replace(/\s+/g, '');

export const normalizeAssessmentFramework = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.toLowerCase() === 'course') return null;
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (['digitalsat', 'sat'].includes(key)) return 'digitalSAT';
  if (key === 'act') return 'act';
  if (['tsia2', 'tsi2', 'tsi'].includes(key)) return 'tsia2';
  if (key === 'asvab') return 'asvab';
  return null;
};

/** Can a student be sent to ordinary course Path practice here? */
export const isSkillLaunchable = (index, teksCode) => {
  const key = coverageKey(teksCode);
  if (!key) return false;
  const record = index?.skills?.[key] || index?.offWheel?.[key];
  return record?.studentReady === true;
};

export const frameworkCoverageKnown = (index, framework) => {
  const normalized = normalizeAssessmentFramework(framework);
  return Boolean(normalized && index?.frameworks && Object.prototype.hasOwnProperty.call(index.frameworks, normalized));
};

export const frameworkCoverageRecord = (index, teksCode, framework) => {
  const normalized = normalizeAssessmentFramework(framework);
  const key = coverageKey(teksCode);
  if (!normalized || !key || !frameworkCoverageKnown(index, normalized)) return null;
  const frameworkIndex = index.frameworks[normalized];
  return frameworkIndex?.skills?.[key] || frameworkIndex?.offWheel?.[key] || null;
};

/**
 * Can the active secure bank issue this exact assessment for this exact skill?
 *
 * Fails closed when the schema has not been rebuilt yet.
 */
export const isFrameworkSkillLaunchable = (index, teksCode, framework) => (
  frameworkCoverageRecord(index, teksCode, framework)?.published === true
);
