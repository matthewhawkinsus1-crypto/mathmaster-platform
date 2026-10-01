/*
 * SKILL / TEKS ANALYSIS — FROM THE STANDARDS EACH QUESTION CARRIES.
 *
 * A question's standard comes from its own metadata (`standards`,
 * `alignments`, `alignmentKeys`) or from the alignment its attempt events
 * recorded — never from an assignment's title. Questions with no standard are
 * counted as untagged, not given one.
 *
 * Findings use fixed, stated rules with a minimum amount of evidence, and
 * every finding says its rule in numbers:
 *
 *   comparatively strongest     ≥3 scored questions, final accuracy ≥80%, top three
 *   needs additional instruction ≥3 scored questions, final accuracy <70%
 *   persistent errors           ≥3 scored, ≥2 not correct after all available
 *                               attempts, and those are ≥40% of its scored questions
 *   improvement after retries   ≥3 scored, ≥2 corrected on a later attempt,
 *                               ≥30% of its scored questions
 *   limited evidence            fewer than 3 scored questions — no finding
 *
 * Prerequisite gaps use MathMaster's authored within-course prerequisite map
 * (functions/shared/pathCoursePrerequisites.mjs) and the prerequisite
 * standards authored on the questions themselves. Nothing else counts as a
 * prerequisite. A prerequisite is described by the student's own evidence on
 * it in the selection; it is never said to be the reason for anything.
 *
 * Standard and Modified work are aggregated separately, always.
 */
import { getTexasStandard } from '../../../functions/shared/texasStandards.mjs';
import { getWithinCoursePrerequisites } from '../../../functions/shared/pathCoursePrerequisites.mjs';
import { QUESTION_OUTCOME } from './attemptAnalysis.js';

export const MIN_SCORED_FOR_SKILL_FINDING = 3;
export const STRONG_THRESHOLD = 80;
export const INSTRUCTION_THRESHOLD = 70;
export const PERSISTENT_MIN_EXHAUSTED = 2;
export const PERSISTENT_MIN_SHARE = 0.4;
export const RETRY_MIN_CORRECTED = 2;
export const RETRY_MIN_SHARE = 0.3;
export const TREND_MIN_QUESTIONS = 4;

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const DAY_MS = 86400000;

const UNSCORED = new Set([QUESTION_OUTCOME.NOT_ATTEMPTED, QUESTION_OUTCOME.SKIPPED]);
const NOT_CORRECT_AT_END = new Set([QUESTION_OUTCOME.EXHAUSTED, QUESTION_OUTCOME.LEFT_WITH_ATTEMPTS]);

/** Warm-Up, instructional (Classwork + Practice), DOL, or assessment (Quiz / Test). */
export const sectionGroupOf = (section) => {
  const role = clean(section).toLowerCase();
  if (role === 'warmup') return 'warmup';
  if (role === 'classwork' || role === 'practice') return 'instructional';
  if (role === 'dol') return 'dol';
  if (role === 'quiz' || role === 'test') return 'assessment';
  return 'other';
};

/** Accuracy figures over a set of question rows. */
export const accuracyOf = (rows = []) => {
  const scored = list(rows).filter((row) => !UNSCORED.has(row.outcome));
  const firstKnown = scored.filter((row) => row.firstAttemptCorrect !== null && row.firstAttemptCorrect !== undefined);
  const credit = scored.reduce((sum, row) => sum + (Number(row.finalCredit) || 0), 0);
  return {
    questions: list(rows).length,
    attempted: scored.length,
    finalCreditAverage: scored.length ? Math.round(credit / scored.length) : null,
    finalCorrect: scored.filter((row) => row.finalResult === 'correct').length,
    finalCorrectRate: percent(scored.filter((row) => row.finalResult === 'correct').length, scored.length),
    firstAttemptAccuracy: percent(firstKnown.filter((row) => row.firstAttemptCorrect).length, firstKnown.length),
    notCorrectAtEnd: scored.filter((row) => NOT_CORRECT_AT_END.has(row.outcome)).length,
    exhausted: scored.filter((row) => row.outcome === QUESTION_OUTCOME.EXHAUSTED).length,
    correctedAfterRetry: scored.filter((row) => row.outcome === QUESTION_OUTCOME.CORRECTED_AFTER_RETRY).length,
  };
};

const trendOf = (rows) => {
  const dated = list(rows)
    .filter((row) => !UNSCORED.has(row.outcome) && Number.isFinite(row.lastAttemptAtMs))
    .sort((a, b) => a.lastAttemptAtMs - b.lastAttemptAtMs);
  const days = new Set(dated.map((row) => Math.floor(row.lastAttemptAtMs / DAY_MS)));
  if (dated.length < TREND_MIN_QUESTIONS || days.size < 2) {
    return { determinable: false, note: `A trend needs at least ${TREND_MIN_QUESTIONS} dated questions on two or more days.` };
  }
  const half = Math.ceil(dated.length / 2);
  const earlier = accuracyOf(dated.slice(0, half));
  const later = accuracyOf(dated.slice(half));
  const change = later.finalCreditAverage - earlier.finalCreditAverage;
  return {
    determinable: true,
    earlier: { ...earlier, fromMs: dated[0].lastAttemptAtMs, toMs: dated[half - 1].lastAttemptAtMs },
    later: { ...later, fromMs: dated[half].lastAttemptAtMs, toMs: dated[dated.length - 1].lastAttemptAtMs },
    change,
    direction: change >= 10 ? 'higher' : change <= -10 ? 'lower' : 'similar',
    note: 'Earlier half of the dated questions compared with the later half, by the time of each question\'s last attempt.',
  };
};

const describeStandard = (code) => {
  const entry = getTexasStandard(code);
  return {
    registered: Boolean(entry),
    description: entry?.description || null,
    courseId: entry?.courseId || null,
    course: entry?.course || null,
    classification: entry?.classification || null,
  };
};

/**
 * Aggregate question rows (from attemptAnalysis, each annotated with its
 * assignment's `condition`: 'standard' | 'modified') by standard.
 */
export const analyzeSkills = ({ questions = [] } = {}) => {
  const rows = list(questions);
  const byCode = new Map();
  const untaggedRows = [];
  const inferredRows = [];
  rows.forEach((row) => {
    if (row?.standardsSource === 'platform-inferred') { inferredRows.push(row); return; }
    const codes = [...new Set(list(row?.standards?.primary).map(clean).filter(Boolean))];
    if (!codes.length) { untaggedRows.push(row); return; }
    codes.forEach((code) => {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(row);
    });
  });

  const skills = [...byCode.entries()].map(([code, tagged]) => {
    const overall = accuracyOf(tagged);
    const groups = ['warmup', 'instructional', 'dol', 'assessment'];
    const byGroup = Object.fromEntries(groups.map((group) => [group, accuracyOf(tagged.filter((row) => sectionGroupOf(row.section) === group))]));
    return {
      code,
      ...describeStandard(code),
      ...overall,
      warmup: byGroup.warmup,
      instructional: byGroup.instructional,
      dol: byGroup.dol,
      assessment: byGroup.assessment,
      bySection: Object.fromEntries(['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test']
        .map((section) => [section, accuracyOf(tagged.filter((row) => row.section === section))])
        .filter(([, value]) => value.questions > 0)),
      byCondition: {
        standard: accuracyOf(tagged.filter((row) => row.condition !== 'modified')),
        modified: accuracyOf(tagged.filter((row) => row.condition === 'modified')),
      },
      assignmentIds: [...new Set(tagged.map((row) => row.assignmentId))],
      questionRefs: tagged.map((row) => ({ assignmentId: row.assignmentId, storageIndex: row.storageIndex })),
      trend: trendOf(tagged),
      prerequisiteTags: [...new Set(tagged.flatMap((row) => list(row?.standards?.prerequisite)))],
    };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  // Findings are computed on Standard (grade-level) work only, so Modified
  // work is never blended into a grade-level skill picture; Modified work is
  // reported beside it.
  const eligible = skills.filter((skill) => skill.byCondition.standard.attempted >= MIN_SCORED_FOR_SKILL_FINDING);
  const std = (skill) => skill.byCondition.standard;
  const finding = (skill, reason) => ({ code: skill.code, description: skill.description, reason, attempted: std(skill).attempted });
  const strongest = eligible
    .filter((skill) => std(skill).finalCreditAverage >= STRONG_THRESHOLD)
    .sort((a, b) => std(b).finalCreditAverage - std(a).finalCreditAverage || (std(b).firstAttemptAccuracy ?? 0) - (std(a).firstAttemptAccuracy ?? 0))
    .slice(0, 3)
    .map((skill) => finding(skill, `${std(skill).finalCreditAverage}% final accuracy on ${std(skill).attempted} scored questions (${std(skill).firstAttemptAccuracy ?? '—'}% on the first attempt).`));
  const needsInstruction = eligible
    .filter((skill) => std(skill).finalCreditAverage < INSTRUCTION_THRESHOLD)
    .sort((a, b) => std(a).finalCreditAverage - std(b).finalCreditAverage)
    .map((skill) => finding(skill, `${std(skill).finalCreditAverage}% final accuracy on ${std(skill).attempted} scored questions, below ${INSTRUCTION_THRESHOLD}%.`));
  const persistentError = eligible
    .filter((skill) => std(skill).notCorrectAtEnd >= PERSISTENT_MIN_EXHAUSTED && std(skill).notCorrectAtEnd / std(skill).attempted >= PERSISTENT_MIN_SHARE)
    .sort((a, b) => std(b).notCorrectAtEnd - std(a).notCorrectAtEnd)
    .map((skill) => finding(skill, `${std(skill).notCorrectAtEnd} of ${std(skill).attempted} scored questions ended not correct after the attempts used.`));
  const improvedAfterRetry = eligible
    .filter((skill) => std(skill).correctedAfterRetry >= RETRY_MIN_CORRECTED && std(skill).correctedAfterRetry / std(skill).attempted >= RETRY_MIN_SHARE)
    .sort((a, b) => std(b).correctedAfterRetry - std(a).correctedAfterRetry)
    .map((skill) => finding(skill, `${std(skill).correctedAfterRetry} of ${std(skill).attempted} scored questions were corrected on a later attempt.`));
  const limitedEvidence = skills
    .filter((skill) => skill.byCondition.standard.attempted < MIN_SCORED_FOR_SKILL_FINDING)
    .map((skill) => ({ code: skill.code, description: skill.description, attempted: skill.byCondition.standard.attempted, reason: `${skill.byCondition.standard.attempted} scored grade-level question${skill.byCondition.standard.attempted === 1 ? '' : 's'} — fewer than ${MIN_SCORED_FOR_SKILL_FINDING}, so no finding is made.` }));

  // Prerequisites of the standards that need instruction or show persistent
  // errors: from the authored map and the questions' own prerequisite tags.
  const concern = [...new Set([...needsInstruction, ...persistentError].map((entry) => entry.code))];
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill]));
  const prerequisites = concern.map((code) => {
    const skill = skillByCode.get(code);
    const mapped = skill?.courseId ? getWithinCoursePrerequisites(skill.courseId, code) : [];
    const entries = [
      ...mapped.map((entry) => ({ code: entry.code, strength: entry.strength, source: 'course-prerequisite-map' })),
      ...list(skill?.prerequisiteTags)
        .filter((tag) => !mapped.some((entry) => entry.code === tag))
        .map((tag) => ({ code: tag, strength: null, source: 'question-metadata' })),
    ];
    return {
      code,
      prerequisites: entries.map((entry) => {
        const evidence = skillByCode.get(entry.code);
        const standard = evidence ? std(evidence) : null;
        let status = 'no-evidence-in-selection';
        if (standard && standard.attempted > 0) {
          status = standard.attempted < 2
            ? 'limited-evidence'
            : standard.finalCreditAverage < INSTRUCTION_THRESHOLD ? 'evidence-below-threshold' : 'evidence-at-or-above-threshold';
        }
        return {
          ...entry,
          description: getTexasStandard(entry.code)?.description || null,
          attempted: standard?.attempted ?? 0,
          finalCreditAverage: standard?.finalCreditAverage ?? null,
          status,
        };
      }),
    };
  });

  const untagged = accuracyOf(untaggedRows);
  return {
    skills,
    untagged: {
      ...untagged,
      note: untaggedRows.length
        ? `${untaggedRows.length} question${untaggedRows.length === 1 ? ' has' : 's have'} no standard in MathMaster's question metadata, so ${untaggedRows.length === 1 ? 'it is' : 'they are'} counted here and not assigned to any skill.`
        : '',
    },
    platformInferred: {
      ...accuracyOf(inferredRows),
      note: inferredRows.length
        ? `${inferredRows.length} MathMaster-generated Honors extension question${inferredRows.length === 1 ? ' carries' : 's carry'} the assignment's first TEKS automatically, so ${inferredRows.length === 1 ? 'it is' : 'they are'} not counted toward any standard.`
        : '',
    },
    findings: { strongest, needsInstruction, persistentError, improvedAfterRetry, limitedEvidence },
    prerequisites,
    rules: {
      minScored: MIN_SCORED_FOR_SKILL_FINDING,
      strongAtOrAbove: STRONG_THRESHOLD,
      instructionBelow: INSTRUCTION_THRESHOLD,
      persistent: { minNotCorrect: PERSISTENT_MIN_EXHAUSTED, minShare: PERSISTENT_MIN_SHARE },
      retry: { minCorrected: RETRY_MIN_CORRECTED, minShare: RETRY_MIN_SHARE },
      note: 'Findings use grade-level (Standard) work only; Modified work is shown beside each standard and never blended in.',
    },
  };
};

export default analyzeSkills;
