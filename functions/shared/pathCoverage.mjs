// Whether My Math Path actually has content for a skill.
//
// Course practice and assessment practice are deliberately different promises.
// Course coverage requires a session's worth of course-authored families.
// Assessment coverage answers a narrower question: does the ACTIVE secure bank
// contain at least one issuable family authored for this exact assessment and
// TEKS?  The secure issuer remains the final authority at launch time.
//
// Keeping those facts separate prevents SAT/ACT/TSIA2/ASVAB items from making a
// course skill look covered, and prevents a crosswalk row from advertising an
// assessment button when the live bank cannot issue the requested assessment.

import { analyzeStandardContent, CONTENT_STATE, summarizeStandardStates } from './pathStandardQuality.mjs';

export { CONTENT_STATE, CONTENT_STATE_LABELS, CONTENT_STATE_ORDER } from './pathStandardQuality.mjs';

export const SESSION_QUESTION_COUNT = 5;
export const MINIMUM_ISSUABLE_FAMILIES = SESSION_QUESTION_COUNT;
export const ADEQUATE_ISSUABLE_FAMILIES = SESSION_QUESTION_COUNT;
export const ADEQUATE_DISTINCT_BANDS = 2;

export const ASSESSMENT_COVERAGE_FRAMEWORKS = Object.freeze([
  'digitalSAT',
  'act',
  'tsia2',
  'asvab',
]);

export const COVERAGE_STATE = Object.freeze({
  NONE: 'none',
  AUTHORED_UNUSABLE: 'authoredUnusable',
  MINIMAL: 'minimal',
  ADEQUATE: 'adequate',
});

export const COVERAGE_STATE_LABELS = Object.freeze({
  [COVERAGE_STATE.NONE]: 'No content',
  [COVERAGE_STATE.AUTHORED_UNUSABLE]: 'Authored but unusable',
  [COVERAGE_STATE.MINIMAL]: 'Usable but thin',
  [COVERAGE_STATE.ADEQUATE]: 'Ready',
});

const list = (value) => (Array.isArray(value) ? value : []);

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

/**
 * The framework physically authored on a bank item.
 *
 * Unknown non-course framework strings stay non-null so a typo cannot make an
 * assessment item silently count as ordinary course content.
 */
export const assessmentFrameworkForItem = (item = {}) => {
  const raw = item?.assessmentContext?.framework ?? item?.assessmentFramework ?? null;
  if (raw == null || String(raw).trim() === '' || String(raw).trim().toLowerCase() === 'course') return null;
  return normalizeAssessmentFramework(raw) || String(raw).trim();
};

/**
 * Course coverage for one standard, from its bank items and their issue plans.
 */
export const evaluateSkillCoverage = ({ displayCode, items = [], plans = {} }) => {
  const active = items.filter((item) => item?.active !== false);
  const issuable = [];
  const unusable = [];

  active.forEach((item) => {
    const plan = plans[item.id];
    if (plan?.issuable) issuable.push(item);
    else unusable.push({ id: item.id, reason: plan?.reason || 'not_evaluated' });
  });

  const byBand = {};
  issuable.forEach((item) => {
    const band = Number(item.difficultyBand) || 3;
    byBand[band] = (byBand[band] || 0) + 1;
  });
  const distinctBands = Object.keys(byBand).length;

  let state = COVERAGE_STATE.NONE;
  if (issuable.length >= ADEQUATE_ISSUABLE_FAMILIES && distinctBands >= ADEQUATE_DISTINCT_BANDS) {
    state = COVERAGE_STATE.ADEQUATE;
  } else if (issuable.length > 0) {
    state = COVERAGE_STATE.MINIMAL;
  } else if (items.length > 0) {
    state = COVERAGE_STATE.AUTHORED_UNUSABLE;
  }

  const quality = analyzeStandardContent({ displayCode, items, plans });

  return {
    displayCode,
    authoredCount: items.length,
    activeCount: active.length,
    issuableCount: issuable.length,
    byBand,
    distinctBands,
    unusable: unusable.slice(0, 25),
    state,
    studentReady: issuable.length >= MINIMUM_ISSUABLE_FAMILIES,
    contentState: quality.state,
    quality,
  };
};

/**
 * Assessment publication coverage intentionally uses a different threshold
 * from course Path coverage. One valid generative assessment family is a real
 * published assessment family; requiring five would incorrectly hide much of
 * the deliberately-authored V2.1 ACT/TSIA2 corpus.
 */
export const evaluateAssessmentSkillCoverage = ({ displayCode, items = [], plans = {} }) => {
  const active = items.filter((item) => item?.active !== false);
  const issuable = [];
  const unusable = [];

  active.forEach((item) => {
    const plan = plans[item.id];
    if (plan?.issuable) issuable.push(item);
    else unusable.push({ id: item.id, reason: plan?.reason || 'not_evaluated' });
  });

  const familyIds = [...new Set(
    issuable.map((item) => String(item.familyId || item.id || '')).filter(Boolean),
  )];
  const byBand = {};
  issuable.forEach((item) => {
    const band = Number(item.difficultyBand) || 3;
    byBand[band] = (byBand[band] || 0) + 1;
  });

  return {
    displayCode,
    authoredCount: items.length,
    activeCount: active.length,
    issuableCount: issuable.length,
    familyCount: familyIds.length,
    byBand,
    published: familyIds.length > 0,
    unusable: unusable.slice(0, 5),
  };
};

const indexItemsByCode = (bankItems = []) => {
  const itemsByCode = new Map();
  bankItems.forEach((item) => {
    const keys = new Set(list(item.alignmentKeys).map(coverageKey).filter(Boolean));
    keys.forEach((key) => {
      if (!itemsByCode.has(key)) itemsByCode.set(key, []);
      itemsByCode.get(key).push(item);
    });
  });
  return itemsByCode;
};

const buildCourseSlice = ({ wheelTeks = [], bankItems = [], plans = {} }) => {
  const itemsByCode = indexItemsByCode(bankItems);
  const skills = {};

  wheelTeks.forEach((code) => {
    const key = coverageKey(code);
    skills[key] = evaluateSkillCoverage({
      displayCode: key,
      items: itemsByCode.get(key) || [],
      plans,
    });
  });

  const offWheel = {};
  itemsByCode.forEach((items, key) => {
    if (skills[key]) return;
    offWheel[key] = evaluateSkillCoverage({ displayCode: key, items, plans });
  });

  const values = Object.values(skills);
  return {
    skills,
    offWheel,
    summary: {
      wheelSkills: values.length,
      studentReady: values.filter((entry) => entry.studentReady).length,
      adequate: values.filter((entry) => entry.state === COVERAGE_STATE.ADEQUATE).length,
      minimal: values.filter((entry) => entry.state === COVERAGE_STATE.MINIMAL).length,
      authoredUnusable: values.filter((entry) => entry.state === COVERAGE_STATE.AUTHORED_UNUSABLE).length,
      none: values.filter((entry) => entry.state === COVERAGE_STATE.NONE).length,
      fullyCovered: values.length > 0 && values.every((entry) => entry.studentReady),
      quality: summarizeStandardStates(values.map((entry) => entry.quality)),
      productionReady: values.filter((entry) => entry.contentState === CONTENT_STATE.PRODUCTION_READY).length,
    },
  };
};

const buildFrameworkSlice = ({ framework, wheelTeks = [], bankItems = [], plans = {} }) => {
  const frameworkItems = bankItems.filter((item) => assessmentFrameworkForItem(item) === framework);
  const itemsByCode = indexItemsByCode(frameworkItems);
  const skills = {};

  wheelTeks.forEach((code) => {
    const key = coverageKey(code);
    skills[key] = evaluateAssessmentSkillCoverage({
      displayCode: key,
      items: itemsByCode.get(key) || [],
      plans,
    });
  });

  // Off-wheel assessment rows stay lightweight. They matter for prerequisite
  // routes and for the audit, but duplicating full quality reports four times
  // would needlessly inflate every Firestore coverage document.
  const offWheel = {};
  itemsByCode.forEach((items, key) => {
    if (skills[key]) return;
    offWheel[key] = evaluateAssessmentSkillCoverage({ displayCode: key, items, plans });
  });

  const values = Object.values(skills);
  const offWheelValues = Object.values(offWheel);
  return {
    framework,
    sourceItemCount: frameworkItems.length,
    skills,
    offWheel,
    summary: {
      wheelSkills: values.length,
      published: values.filter((entry) => entry.published).length,
      missing: values.filter((entry) => !entry.published).length,
      offWheelPublished: offWheelValues.filter((entry) => entry.published).length,
    },
  };
};

/**
 * The coverage document stored at pathCoverage/{courseId}.
 *
 * Schema 2 keeps the existing course fields stable and adds framework-specific
 * publication indexes. Assessment-authored items no longer count toward the
 * ordinary course launch gate.
 */
export const buildCoverageIndex = ({
  courseId,
  wheelTeks = [],
  bankItems = [],
  plans = {},
  generatedAt = null,
}) => {
  const courseItems = bankItems.filter((item) => assessmentFrameworkForItem(item) === null);
  const course = buildCourseSlice({ wheelTeks, bankItems: courseItems, plans });

  const frameworks = Object.fromEntries(
    ASSESSMENT_COVERAGE_FRAMEWORKS.map((framework) => [
      framework,
      buildFrameworkSlice({ framework, wheelTeks, bankItems, plans }),
    ]),
  );

  return {
    courseId,
    generatedAt: generatedAt ?? null,
    schemaVersion: 2,
    thresholds: {
      minimumIssuableFamilies: MINIMUM_ISSUABLE_FAMILIES,
      adequateIssuableFamilies: ADEQUATE_ISSUABLE_FAMILIES,
      adequateDistinctBands: ADEQUATE_DISTINCT_BANDS,
      assessmentPublishedFamilies: 1,
    },
    skills: course.skills,
    offWheel: course.offWheel,
    summary: course.summary,
    frameworks,
  };
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

/** Why course Path is not launchable, in words a teacher can act on. */
export const explainCoverage = (index, teksCode) => {
  const key = coverageKey(teksCode);
  const record = index?.skills?.[key] || index?.offWheel?.[key];
  if (!index) return 'MathMaster has not checked which standards have practice content yet.';
  if (!record) return `${key} is not part of this course's My Math Path content.`;
  switch (record.state) {
    case COVERAGE_STATE.ADEQUATE:
      return `${record.issuableCount} practice question families are ready for ${key}.`;
    case COVERAGE_STATE.MINIMAL:
      return `${key} has ${record.issuableCount} of the ${MINIMUM_ISSUABLE_FAMILIES} practice question families a session needs, so it is not open to students yet.`;
    case COVERAGE_STATE.AUTHORED_UNUSABLE:
      return `${key} has ${record.activeCount} authored question${record.activeCount === 1 ? '' : 's'}, but none can be graded securely yet.`;
    default:
      return `No My Math Path practice content has been published for ${key} yet.`;
  }
};

/** The ordinary course audit, as rows. */
export const summarizeCoverage = (index, { onlyGaps = false } = {}) => {
  const rows = Object.values(index?.skills || {})
    .map((entry) => ({
      displayCode: entry.displayCode,
      issuableCount: entry.issuableCount,
      activeCount: entry.activeCount,
      state: entry.state,
      label: COVERAGE_STATE_LABELS[entry.state],
      byBand: entry.byBand,
      studentReady: entry.studentReady,
      contentState: entry.contentState || null,
      quality: entry.quality || null,
    }))
    .sort((a, b) => a.displayCode.localeCompare(b.displayCode, undefined, { numeric: true }));
  return onlyGaps ? rows.filter((row) => !row.studentReady || row.state === COVERAGE_STATE.MINIMAL) : rows;
};

export const findUncoveredStandards = (index, teksCodes = []) => (
  [...new Set(teksCodes.map(coverageKey).filter(Boolean))]
    .filter((key) => !isSkillLaunchable(index, key))
    .sort()
);
