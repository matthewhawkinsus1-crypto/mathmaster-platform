// Where V1 and V2 meet.
//
// V1 (`recommendationEngine.js`) knows the curriculum: the prerequisite graph,
// the district calendar, teacher overrides, what is locked and what is required.
// That work is correct and V2 does not repeat it. What V1 produces is nine
// status buckets of scored skills.
//
// V2 (`recommendationV2.js`) knows the STUDENT across time: what they did last
// week, what has stuck, what they are ready to be stretched on. It needs rows,
// and it needs the student records V1 never sees.
//
// This module is the seam. It flattens V1's buckets into candidate rows, adds
// the per-student history from Firestore, and hands both to V2. Deliberately
// thin: no scoring lives here, so there is no third place to check when a
// recommendation surprises somebody.

import { describeSkill, getSkillGraph, teksCodeFromSkillId } from './skillGraph.js';
import { REASON, STATUS } from './recommendationEngine.js';
import { TIMING } from './curriculumPacing.js';
import { buildStudentLearningProfile } from '../profile/studentLearningProfile.js';
import { buildWeeklyRecommendations } from './recommendationV2.js';

/**
 * Which V1 buckets may be considered for a weekly Path.
 *
 * LOCKED and FUTURE are absent on purpose. A severe prerequisite gap or content
 * the class has not reached is V1's judgement about the CURRICULUM, and V2 —
 * which reasons about the student — has no standing to overturn it. MASTERED is
 * included because V2 can legitimately want it back, as retention or extension.
 */
const CONSIDERED_BUCKETS = Object.freeze([
  STATUS.REQUIRED,
  STATUS.PRIORITY,
  STATUS.REMEDIATION,
  STATUS.RECOMMENDED,
  STATUS.AVAILABLE,
  STATUS.EXTENSION,
  STATUS.MASTERED,
]);

/** Strand per skill, read once from the graph rather than parsed out of codes. */
export const buildStrandIndex = (courseId) => {
  const index = new Map();
  getSkillGraph(courseId).forEach((skill) => {
    index.set(skill.skillId, skill.domain || null);
  });
  return index;
};

/**
 * V1's buckets, flattened into rows V2 can score.
 *
 * The bucket travels with the row. A teacher looking at why something was
 * chosen needs to see BOTH judgements — "the engine had this as required" and
 * "the student is due a retention check on it" are different sentences.
 */
export const flattenEngineRows = (options, { strandIndex = new Map() } = {}) => {
  const rows = [];
  CONSIDERED_BUCKETS.forEach((bucket) => {
    (options?.[bucket] || []).forEach((row) => {
      rows.push({
        ...row,
        engineStatus: bucket,
        teksCode: teksCodeFromSkillId(row.skillId) || row.skillId,
        // Resolved once here so the student's screen, the teacher's screen and
        // the simulator all read the same name for the same skill.
        studentLabel: describeSkill(row.skillId).studentLabel || null,
        strand: strandIndex.get(row.skillId) || null,
        // V1 scores 0..1 already; V2 clamps, but keep the contract explicit.
        score: Number(row.score) || 0,
      });
    });
  });
  return rows;
};

/**
 * The skills the class is on right now, and the ones standing in their way.
 *
 * Both are derived from V1's own timing and prerequisite work — not
 * recalculated — so the two engines cannot disagree about where the class is.
 */
export const deriveInstructionalContext = (rows) => {
  const currentInstructionSkills = rows
    .filter((row) => row.curriculumTiming === TIMING.CURRENT)
    .map((row) => row.skillId);

  // A prerequisite only counts as blocking if it is blocking something the
  // class is ACTUALLY on. A gap under a unit in April is not this week's
  // problem, and treating it as one is how a student ends up in a remediation
  // trap in September.
  const currentSet = new Set(currentInstructionSkills);
  const prerequisiteOfCurrent = [...new Set(rows
    .filter((row) => currentSet.has(row.skillId) && row.remediationTarget)
    .map((row) => row.remediationTarget))];

  const openAssignmentSkills = rows
    .filter((row) => row.engineStatus === STATUS.REQUIRED
      || (row.reasons || []).includes(REASON.ASSIGNMENT_RELEVANCE)
      || (row.reasons || []).includes(REASON.REQUIRED_ASSIGNMENT))
    .map((row) => row.skillId);

  return { currentInstructionSkills, prerequisiteOfCurrent, openAssignmentSkills };
};

/**
 * When was each standard last actually worked?
 *
 * This is the input V2's whole cooldown mechanism rests on, and nothing in the
 * repository was computing it. It comes from the evidence events, which are the
 * only immutable record of what a student really did.
 */
export const buildLastPracticedIndex = (evidenceEvents = []) => {
  const index = {};
  (Array.isArray(evidenceEvents) ? evidenceEvents : []).forEach((event) => {
    const at = Number(event?.recordedAt || event?.createdAt || event?.timestamp || 0);
    if (!at) return;
    (event?.alignmentKeys || []).forEach((key) => {
      const code = String(key).includes(':') ? String(key).split(':').pop() : String(key);
      if (!code) return;
      if (!index[code] || at > index[code]) index[code] = at;
    });
  });
  return index;
};

/**
 * The most recent difficulty band the student MISSED on each standard.
 *
 * Feeds the rule that matters most in V2: after a miss above the student's
 * stable band, retry the same standard lower before anything concludes a
 * prerequisite gap. Without this the signal simply is not there and V2 falls
 * back to ordinary targeting.
 */
export const buildRecentFailureIndex = (evidenceEvents = []) => {
  const latest = {};
  (Array.isArray(evidenceEvents) ? evidenceEvents : []).forEach((event) => {
    if (event?.performance?.status !== 'finalized') return;
    if (event?.performance?.isCorrect !== false) return;
    const band = Number(event?.questionSnapshot?.difficultyBand);
    if (!Number.isFinite(band)) return;
    const at = Number(event?.recordedAt || event?.createdAt || event?.timestamp || 0);
    (event?.alignmentKeys || []).forEach((key) => {
      const code = String(key).includes(':') ? String(key).split(':').pop() : String(key);
      if (!code) return;
      if (!latest[code] || at >= latest[code].at) latest[code] = { at, band };
    });
  });
  return Object.fromEntries(Object.entries(latest).map(([code, entry]) => [code, entry.band]));
};

/**
 * The weekly Path for one student: V1's curriculum judgement, V2's reasons.
 *
 * `options` is whatever `buildStudentPathOptions` returned — this never calls
 * the engine itself, so a caller that already has options does not pay for a
 * second run, and the simulator can pass the exact options it is displaying.
 */
export const buildWeeklyPathPlan = ({
  options,
  courseId = 'algebra1',
  masteryProfilesByTeks = {},
  evidenceEvents = [],
  retentionSchedules = {},
  foundationGapDepth = 0,
  completion = null,
  previousBand = null,
  eventsSincePreviousChange = 0,
  profile = null,
  pinnedSkills = [],
  sessions = 4,
  honors = false,
  interventionMode = false,
  coverage = undefined,
  now = Date.now(),
} = {}) => {
  const strandIndex = buildStrandIndex(courseId);
  const rows = flattenEngineRows(options, { strandIndex });
  const { currentInstructionSkills, prerequisiteOfCurrent, openAssignmentSkills } = deriveInstructionalContext(rows);

  const learningProfile = profile || buildStudentLearningProfile({
    courseId,
    masteryProfilesByTeks,
    evidenceEvents,
    retentionSchedules,
    foundationGapDepth,
    completion,
    previousBand,
    eventsSincePreviousChange,
  });

  const recentFailureByTeks = buildRecentFailureIndex(evidenceEvents);
  const rowsWithHistory = rows.map((row) => ({
    ...row,
    recentFailureBand: recentFailureByTeks[row.teksCode] ?? null,
  }));

  const week = buildWeeklyRecommendations({
    rows: rowsWithHistory,
    profile: learningProfile,
    masteryProfilesByTeks,
    retentionSchedules,
    lastPracticedByTeks: buildLastPracticedIndex(evidenceEvents),
    currentInstructionSkills,
    openAssignmentSkills,
    pinnedSkills,
    prerequisiteOfCurrent,
    sessions,
    honors,
    interventionMode,
    coverage,
    now,
  });

  return {
    ...week,
    courseId,
    profile: learningProfile,
    // Both engines' views, so a teacher screen can show "the curriculum said
    // this, the student's history said that" rather than one merged number.
    engineRowCount: rows.length,
    instructionalContext: { currentInstructionSkills, prerequisiteOfCurrent, openAssignmentSkills },
  };
};

export default buildWeeklyPathPlan;
