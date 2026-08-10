// Whether My Math Path actually has content for a skill.
//
// The wheel offers a student every TEKS in their course. The secure bank holds
// whatever has been authored. Nothing connected those two facts, so a student
// could click a standard and be told "No authored question ... aligned to
// [TEKS]" — a dead end produced by a content gap, surfaced as a server error.
//
// The fix is not to catch the error. It is to know, before the student clicks,
// whether the skill is launchable, and to say so honestly everywhere: on the
// wheel, in the routing engine that may send a student into a prerequisite, and
// in an audit a teacher can read before a class ever meets it.
//
// WHAT COUNTS AS COVERAGE. Not "a question exists with this TEKS". A question
// counts only when the server could actually issue and grade it — the same
// `buildIssuePlan` check `issueNextQuestion` runs. A question whose tool has no
// server grader, or that carries no answer, is authored content that cannot
// teach anybody, and counting it would move the dead end rather than remove it.
//
// FOUR STATES, because "missing" and "broken" need different work from a human:
//
//   none              nobody has authored anything for this standard
//   authoredUnusable  something exists and the server cannot issue it
//   minimal           issuable, but thin enough that a student will repeat items
//   adequate          enough families, spread across difficulty bands
//
// `minimal` is the no-dead-end floor: a student can practise without hitting an
// error. `adequate` is the launch bar. Both are reported, because shipping at
// the floor is a decision somebody should make deliberately rather than
// discover in March.

/** The absolute floor. Below this a student meets an error. */
export const MINIMUM_ISSUABLE_FAMILIES = 1;

/** The bar a course should clear before students are turned loose on it. */
export const ADEQUATE_ISSUABLE_FAMILIES = 3;

/** Spread matters as much as count: three copies of one band is not variety. */
export const ADEQUATE_DISTINCT_BANDS = 2;

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
  .toUpperCase()
  .replace(/\s+/g, '');

/**
 * Coverage for one standard, from its bank items and their issue plans.
 *
 * `plans` are the results of the SAME `buildIssuePlan` the server runs when it
 * issues a question, keyed by bank id. Passing them in rather than recomputing
 * here is what keeps this file pure and keeps the two definitions of "issuable"
 * from drifting into two different answers.
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
  } else if (issuable.length >= MINIMUM_ISSUABLE_FAMILIES) {
    state = COVERAGE_STATE.MINIMAL;
  } else if (items.length > 0) {
    // Something was authored for this standard and none of it can be issued.
    // That is a different job from writing new content, so it says so.
    state = COVERAGE_STATE.AUTHORED_UNUSABLE;
  }

  return {
    displayCode,
    authoredCount: items.length,
    activeCount: active.length,
    issuableCount: issuable.length,
    byBand,
    distinctBands,
    // Why the authored items cannot be issued, so the audit can be acted on
    // rather than merely read.
    unusable: unusable.slice(0, 25),
    state,
    // The one field the student UI and the routing engine consult.
    studentReady: issuable.length >= MINIMUM_ISSUABLE_FAMILIES,
  };
};

/**
 * The coverage index for a course — the document stored at
 * `pathCoverage/{courseId}` and read by every surface that needs to know
 * whether a skill can be launched.
 */
export const buildCoverageIndex = ({ courseId, wheelTeks = [], bankItems = [], plans = {}, generatedAt = null }) => {
  const itemsByCode = new Map();
  bankItems.forEach((item) => {
    const keys = new Set(list(item.alignmentKeys).map(coverageKey).filter(Boolean));
    keys.forEach((key) => {
      if (!itemsByCode.has(key)) itemsByCode.set(key, []);
      itemsByCode.get(key).push(item);
    });
  });

  const skills = {};
  wheelTeks.forEach((code) => {
    const key = coverageKey(code);
    skills[key] = evaluateSkillCoverage({
      displayCode: key,
      items: itemsByCode.get(key) || [],
      plans,
    });
  });

  // Bank content aligned to a standard that is not on this course's wheel. Not
  // an error — a prerequisite from an earlier course is exactly this — but the
  // routing engine may send a student there, so its coverage is recorded too.
  const offWheel = {};
  itemsByCode.forEach((items, key) => {
    if (skills[key]) return;
    offWheel[key] = evaluateSkillCoverage({ displayCode: key, items, plans });
  });

  const values = Object.values(skills);
  return {
    courseId,
    generatedAt: generatedAt ?? null,
    schemaVersion: 1,
    thresholds: {
      minimumIssuableFamilies: MINIMUM_ISSUABLE_FAMILIES,
      adequateIssuableFamilies: ADEQUATE_ISSUABLE_FAMILIES,
      adequateDistinctBands: ADEQUATE_DISTINCT_BANDS,
    },
    skills,
    offWheel,
    summary: {
      wheelSkills: values.length,
      studentReady: values.filter((entry) => entry.studentReady).length,
      adequate: values.filter((entry) => entry.state === COVERAGE_STATE.ADEQUATE).length,
      minimal: values.filter((entry) => entry.state === COVERAGE_STATE.MINIMAL).length,
      authoredUnusable: values.filter((entry) => entry.state === COVERAGE_STATE.AUTHORED_UNUSABLE).length,
      none: values.filter((entry) => entry.state === COVERAGE_STATE.NONE).length,
      // The launch gate, per the coverage spec: every wheel TEKS issuable.
      fullyCovered: values.length > 0 && values.every((entry) => entry.studentReady),
    },
  };
};

/**
 * Can a student be sent here?
 *
 * Fails CLOSED when the index is missing or the skill is unknown: an unknown
 * skill is one nobody has confirmed content for, and guessing yes is how the
 * dead end came back.
 */
export const isSkillLaunchable = (index, teksCode) => {
  const key = coverageKey(teksCode);
  if (!key) return false;
  const record = index?.skills?.[key] || index?.offWheel?.[key];
  return record?.studentReady === true;
};

/** Why not, in words a teacher can act on. */
export const explainCoverage = (index, teksCode) => {
  const key = coverageKey(teksCode);
  const record = index?.skills?.[key] || index?.offWheel?.[key];
  if (!index) return 'MathMaster has not checked which standards have practice content yet.';
  if (!record) return `${key} is not part of this course's My Math Path content.`;
  switch (record.state) {
    case COVERAGE_STATE.ADEQUATE:
      return `${record.issuableCount} practice question families are ready for ${key}.`;
    case COVERAGE_STATE.MINIMAL:
      return `${key} has ${record.issuableCount} practice question famil${record.issuableCount === 1 ? 'y' : 'ies'} — enough to practise, but students will repeat items.`;
    case COVERAGE_STATE.AUTHORED_UNUSABLE:
      return `${key} has ${record.activeCount} authored question${record.activeCount === 1 ? '' : 's'}, but none can be graded securely yet.`;
    default:
      return `No My Math Path practice content has been published for ${key} yet.`;
  }
};

/**
 * The audit, as rows.
 *
 * Deliberately the shape the request asked to see — "A.12A — 8 usable question
 * families" — because until coverage is visible, authoring hundreds of
 * questions is guessing about whether routing can use them.
 */
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
    }))
    .sort((a, b) => a.displayCode.localeCompare(b.displayCode, undefined, { numeric: true }));
  return onlyGaps ? rows.filter((row) => !row.studentReady || row.state === COVERAGE_STATE.MINIMAL) : rows;
};

/**
 * Which of these standards would leave a gap.
 *
 * Used at publish time: an author saving an assignment can be told that the
 * standards it touches still have no Path content, before anyone routes a
 * student into one of them.
 */
export const findUncoveredStandards = (index, teksCodes = []) => (
  [...new Set(teksCodes.map(coverageKey).filter(Boolean))]
    .filter((key) => !isSkillLaunchable(index, key))
    .sort()
);
