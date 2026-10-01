/*
 * QUESTION-LEVEL ATTEMPT EVIDENCE: WHAT HAPPENED ON EACH QUESTION.
 *
 * Two stored records describe a student's work on one question:
 *
 *   grades/{student}.gradesByAssignment[assignment][index]
 *       the question's attempt RECORD — a running state, not a log: status,
 *       attempts on the current version, attempts in total, version number
 *       (a replacement question is a new version), best partial credit, the
 *       time of the last attempt, and the support flags of the last attempt.
 *
 *   grades/{student}/evidenceEvents/{eventKey}
 *       one event per graded ATTEMPT, written by the server when it ingests
 *       the attempt (functions/shared/attemptEvidenceEvent.mjs): the attempt's
 *       number, whether it was correct, its partial credit, its academic time
 *       and that attempt's support flags (calculator, hint, …).
 *
 * Where events cover every attempt, each attempt is a direct record. Where
 * they do not (work from before the server recorded attempts), the sequence is
 * DERIVED from the record by the attempt policy's own rules: a record stops at
 * its first correct answer, so every earlier attempt was not fully correct; a
 * replacement is only issued after the previous version's attempts ran out.
 * Whether those earlier attempts earned partial credit is not recorded, so they
 * read "not correct", never "wrong".
 *
 * Nothing here judges the student. "Left with attempts remaining" is a fact
 * about the record when the assignment closed, not about why.
 *
 * The attempt history is the student's own: a teacher override changes the
 * grade the question contributes (shown beside it), never the attempts.
 */
import {
  normalizeQuestionRecord, getQuestionCredit, resolveQuestionMaximumAttempts, resolveTeacherGrantedExtraAttempts,
} from '../../../functions/shared/attemptPolicy.mjs';
import { getEffectiveActivityPolicy, isActivityRole, normalizeActivityRole } from '../../../functions/shared/activityPolicies.mjs';
import { normalizeQuestionStandards, normalizeQuestionComplexity } from '../../../functions/shared/questionMetadata.mjs';
import { toDisplayCode } from '../../../functions/shared/teksUtils.mjs';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { projectedAssignmentTrackerFor } from '../grading/canonicalGradeProjection.js';
import { CASE_PROVENANCE } from './caseProvenance.js';

export const QUESTION_OUTCOME = Object.freeze({
  CORRECT_FIRST: 'correct-first-attempt',
  CORRECTED_AFTER_RETRY: 'corrected-after-retry',
  CORRECT_ATTEMPTS_UNKNOWN: 'correct-attempts-not-recorded',
  EXHAUSTED: 'incorrect-attempts-exhausted',
  OPEN_INCORRECT: 'not-yet-correct-attempts-remaining',
  LEFT_WITH_ATTEMPTS: 'left-with-attempts-remaining',
  SKIPPED: 'skipped',
  NOT_ATTEMPTED: 'not-attempted',
});

export const QUESTION_OUTCOME_LABEL = Object.freeze({
  'correct-first-attempt': 'Correct on the first attempt',
  'corrected-after-retry': 'Corrected on a later attempt',
  'correct-attempts-not-recorded': 'Correct (attempt count not recorded)',
  'incorrect-attempts-exhausted': 'Not correct after all available attempts',
  'not-yet-correct-attempts-remaining': 'Not yet correct · attempts remain',
  'left-with-attempts-remaining': 'Left with attempts remaining when the assignment closed',
  skipped: 'Skipped (a later question in the section was attempted)',
  'not-attempted': 'Not attempted',
});

export const SECTION_ROLE_LABEL = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
  quiz: 'Quiz',
  test: 'Test',
  review: 'Review',
  corrections: 'Corrections',
});

// Two attempts on one question further apart than this are separate visits.
// Fixed and named so the rule is stated, not tuned per report.
export const RETURN_GAP_MINUTES = 30;

const SUPPORT_FLAGS = Object.freeze([
  ['calculatorUsed', 'Calculator'],
  ['hintUsed', 'Hint'],
  ['scaffoldUsed', 'Math scaffold'],
  ['contextScaffoldUsed', 'Context scaffold'],
  ['workedExampleUsed', 'Worked example'],
  ['remediationUsed', 'Reteach'],
  ['teacherAssisted', 'Teacher assistance'],
]);

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const millis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

const questionType = (question) => clean(question?.type || question?.toolId || question?.questionType) || 'question';

const flagsOf = (usage) => SUPPORT_FLAGS.filter(([key]) => usage?.[key] === true).map(([, label]) => label);

// --- Per-attempt server events ------------------------------------------------------------

/** The attempt events for one assignment (assignment work only, not Path or Live Challenge). */
export const attemptEventsForAssignment = (events = [], assignmentId) => {
  const id = clean(assignmentId);
  const seen = new Set();
  return list(events).filter((event) => {
    const source = event?.source || {};
    if (clean(source.kind || 'assignment') !== 'assignment' || clean(source.assignmentId) !== id) return false;
    const key = clean(event.eventKey || event.id) || `${source.questionIndex}|${event?.questionSnapshot?.variantIndex}|${event?.performance?.attemptNumber}|${millis(event.occurredAt)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const eventsByQuestion = (events) => {
  const map = new Map();
  list(events).forEach((event) => {
    const index = Number(event?.source?.questionIndex);
    if (!Number.isInteger(index) || index < 0) return;
    if (!map.has(index)) map.set(index, []);
    map.get(index).push(event);
  });
  return map;
};

const isReplacementMarker = (event) => clean(event?.performance?.status) === 'unattempted';

const eventResult = (event) => {
  const performance = event?.performance || {};
  if (performance.isCorrect === true) return 'correct';
  const credit = Number(performance.partialCredit);
  return Number.isFinite(credit) && credit > 0 ? 'partial' : 'incorrect';
};

/** Visits: attempts separated by more than RETURN_GAP_MINUTES start a new one. */
const countVisits = (times) => {
  const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  let visits = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] - sorted[index - 1] > RETURN_GAP_MINUTES * 60000) visits += 1;
  }
  return visits;
};

// --- The attempt sequence -------------------------------------------------------------------

/**
 * Attempt-by-attempt results for one question. Events supply the attempts
 * they cover (by attempt number); the record supplies the rest by the attempt
 * policy's rules.
 */
const attemptSequence = ({ record, events }) => {
  const total = Number(record.totalAttempts) || 0;
  const attempts = events.filter((event) => !isReplacementMarker(event));
  // One event per attempt number; a step-by-step attempt rewrites its own
  // event, so the latest write for a number is that attempt's state.
  const byNumber = new Map();
  attempts.forEach((event) => {
    const number = Math.max(1, Number(event?.performance?.attemptNumber) || 1);
    const existing = byNumber.get(number);
    if (!existing || (millis(event.occurredAt) ?? 0) >= (millis(existing.occurredAt) ?? 0)) byNumber.set(number, event);
  });
  const count = Math.max(total, byNumber.size ? Math.max(...byNumber.keys()) : 0);
  const correctNumber = record.status === 'correct' ? count : null;
  const sequence = [];
  for (let number = 1; number <= count; number += 1) {
    const event = byNumber.get(number);
    if (event) {
      sequence.push({
        number,
        result: eventResult(event),
        partialCredit: Number(event?.performance?.partialCredit) || 0,
        atMs: millis(event.occurredAt),
        variantIndex: Number(event?.questionSnapshot?.variantIndex) || 0,
        calculatorUsed: event?.supportUsage?.calculatorUsed === true,
        supports: flagsOf(event?.supportUsage),
        provenance: CASE_PROVENANCE.DIRECT,
      });
    } else {
      sequence.push({
        number,
        result: number === correctNumber ? 'correct' : 'not-correct',
        partialCredit: null,
        atMs: number === count ? millis(record.academicOccurredAt || record.lastAttemptAt) : null,
        variantIndex: null,
        calculatorUsed: null,
        supports: [],
        provenance: CASE_PROVENANCE.DERIVED,
      });
    }
  }
  const direct = sequence.filter((attempt) => attempt.provenance === CASE_PROVENANCE.DIRECT).length;
  let source = 'none';
  if (sequence.length) source = direct === sequence.length ? 'evidence-events' : direct ? 'mixed' : 'derived-from-record';
  return { sequence, source };
};

// --- One assignment ---------------------------------------------------------------------------

const roleOf = (entry) => {
  const role = clean(entry?.logicalRole).toLowerCase();
  return isActivityRole(role) ? normalizeActivityRole(role) : (role || 'practice');
};

/**
 * Every current question of one assignment, with what the records show.
 * `closedForStudent`: the student's own final cutoff (class, attendance or
 * individualized) has passed.
 */
export const analyzeAssignmentQuestions = ({
  assignment,
  student,
  attemptEvents = [],
  supportEvidence = [],
  closedForStudent = false,
} = {}) => {
  const assignmentId = clean(assignment?.id);
  const rawTracker = student?.gradesByAssignment?.[assignmentId] || {};
  const projected = projectedAssignmentTrackerFor({ student, assignment }) || {};
  const events = eventsByQuestion(attemptEventsForAssignment(attemptEvents, assignmentId));
  const supportUses = list(supportEvidence).filter((event) => clean(event?.assignmentId) === assignmentId && event?.eventType === 'used');
  const entries = projectCurrentAssignmentContent(assignment).entries;

  const rows = entries.map((entry, overallIndex) => {
    const question = entry.question || {};
    const role = roleOf(entry);
    const index = entry.storageIndex;
    const raw = rawTracker[index] ?? rawTracker[String(index)];
    const record = normalizeQuestionRecord(raw);
    const graded = normalizeQuestionRecord(projected[index] ?? projected[String(index)]);
    const questionEvents = events.get(index) || [];
    const maxAttempts = resolveQuestionMaximumAttempts({
      question,
      activityPolicy: getEffectiveActivityPolicy(role),
      teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({
        assignment, activityRole: role, classId: student?.classId || null, studentId: student?.id || null,
      }),
    });
    const attempted = Boolean(raw) && record.status !== 'unattempted';
    const { sequence, source } = attempted ? attemptSequence({ record, events: questionEvents }) : { sequence: [], source: 'none' };
    const replacements = Number(record.variantIndex) || 0;
    const attemptsRemaining = Math.max(0, maxAttempts - (Number(record.attemptCount) || 0));
    const finalCredit = attempted ? Math.round(getQuestionCredit(record) * 100) : null;
    const standards = normalizeQuestionStandards(question);
    // A question without standards metadata can still name its standard
    // through the attempt events, which carry the alignment the question had
    // when it was answered. Never the assignment title.
    const eventStandards = [...new Set(questionEvents
      .flatMap((event) => list(event?.alignmentKeys))
      .map(toDisplayCode)
      .filter((code) => code && !code.includes(':')))];
    const primaryStandards = standards.primary.length
      ? standards.primary.map((entryCode) => toDisplayCode(entryCode.code))
      : eventStandards;
    const timedAttempts = sequence.filter((attempt) => attempt.provenance === CASE_PROVENANCE.DIRECT && Number.isFinite(attempt.atMs));
    const lastAtMs = millis(record.academicOccurredAt || record.lastAttemptAt);

    let outcome;
    if (!attempted) outcome = QUESTION_OUTCOME.NOT_ATTEMPTED;
    else if (record.status === 'correct') {
      if ((Number(record.totalAttempts) || 0) === 0) outcome = QUESTION_OUTCOME.CORRECT_ATTEMPTS_UNKNOWN;
      else if (replacements === 0 && Number(record.totalAttempts) === 1) outcome = QUESTION_OUTCOME.CORRECT_FIRST;
      else outcome = QUESTION_OUTCOME.CORRECTED_AFTER_RETRY;
    } else if (attemptsRemaining <= 0) outcome = QUESTION_OUTCOME.EXHAUSTED;
    else outcome = closedForStudent ? QUESTION_OUTCOME.LEFT_WITH_ATTEMPTS : QUESTION_OUTCOME.OPEN_INCORRECT;

    const firstAttemptCorrect = !attempted || outcome === QUESTION_OUTCOME.CORRECT_ATTEMPTS_UNKNOWN
      ? null
      : outcome === QUESTION_OUTCOME.CORRECT_FIRST;
    const firstCredit = sequence[0]
      ? (sequence[0].result === 'correct' ? 100 : (Number.isFinite(sequence[0].partialCredit) ? sequence[0].partialCredit : 0))
      : null;

    return {
      assignmentId,
      storageIndex: index,
      questionId: clean(entry.questionId) || null,
      number: overallIndex + 1,
      sectionNumber: (Number(entry.logicalPosition) || 0) + 1,
      section: role,
      sectionLabel: SECTION_ROLE_LABEL[role] || role,
      familyId: clean(question.familyId) || null,
      questionType: questionType(question),
      dok: normalizeQuestionComplexity(question).level || null,
      standards: {
        primary: primaryStandards,
        secondary: standards.secondary.map((entryCode) => toDisplayCode(entryCode.code)),
        prerequisite: standards.prerequisite.map((entryCode) => toDisplayCode(entryCode.code)),
      },
      // A MathMaster-generated Honors extension copies the assignment's first
      // TEKS onto itself automatically: platform-inferred, never authored.
      standardsSource: question?.honorsEnrichment?.generatedBy === 'MathMaster'
        ? 'platform-inferred'
        : standards.primary.length ? 'question-metadata' : (eventStandards.length ? 'attempt-evidence' : null),
      maxAttempts,
      attemptsUsedOnCurrentVersion: Number(record.attemptCount) || 0,
      totalAttempts: Number(record.totalAttempts) || 0,
      attemptsRemaining,
      replacements,
      replacementEvents: questionEvents.filter(isReplacementMarker).length,
      attempts: sequence,
      attemptsSource: source,
      outcome,
      outcomeLabel: QUESTION_OUTCOME_LABEL[outcome],
      finalResult: !attempted ? 'not-attempted' : record.status === 'correct' ? 'correct' : finalCredit > 0 ? 'partial' : 'incorrect',
      finalCredit,
      gradedCredit: graded.status === 'unattempted' && !raw ? null : Math.round(getQuestionCredit(graded) * 100),
      teacherOverride: Boolean(graded.teacherGradeOverrideDisplay),
      firstAttemptCorrect,
      improved: attempted && firstCredit !== null && finalCredit !== null && finalCredit > firstCredit,
      repeatedReturn: timedAttempts.length >= 2 ? countVisits(timedAttempts.map((attempt) => attempt.atMs)) >= 2 : null,
      lastAttemptAtMs: attempted ? lastAtMs : null,
      // A server-ingested record's time is bounded by the server; an older
      // record's time came from the student's device.
      lastAttemptTimeProvenance: !attempted || lastAtMs === null
        ? CASE_PROVENANCE.NOT_RECORDED
        : (record.academicOccurredAt || record.submissionOrigin === 'server-ingestion' ? CASE_PROVENANCE.DIRECT : CASE_PROVENANCE.LEGACY),
      lastAttemptSupports: attempted ? flagsOf(record.supportUsage) : [],
      supportUses: supportUses.filter((event) => Number(event?.questionIndex) === index).map((event) => clean(event.supportId)),
      recoveredLate: record.recoveredLate === true,
    };
  });

  // "Skipped": no attempt while a later question in the same section has one.
  const lastAttemptedBySection = new Map();
  rows.forEach((row) => {
    if (row.outcome !== QUESTION_OUTCOME.NOT_ATTEMPTED) lastAttemptedBySection.set(row.section, row.number);
  });
  rows.forEach((row) => {
    if (row.outcome === QUESTION_OUTCOME.NOT_ATTEMPTED && (lastAttemptedBySection.get(row.section) || 0) > row.number) {
      row.outcome = QUESTION_OUTCOME.SKIPPED;
      row.outcomeLabel = QUESTION_OUTCOME_LABEL[QUESTION_OUTCOME.SKIPPED];
    }
  });

  return { assignmentId, title: clean(assignment?.title), questions: rows };
};

// --- Summaries ---------------------------------------------------------------------------------

const FINISHED = new Set([
  QUESTION_OUTCOME.CORRECT_FIRST,
  QUESTION_OUTCOME.CORRECTED_AFTER_RETRY,
  QUESTION_OUTCOME.EXHAUSTED,
]);

/** Deterministic counts over any set of question rows (one assignment, a section, a standard, a period). */
export const summarizeQuestionOutcomes = (questions = []) => {
  const rows = list(questions);
  const count = (outcome) => rows.filter((row) => row.outcome === outcome).length;
  const scoredRows = rows.filter((row) => ![QUESTION_OUTCOME.NOT_ATTEMPTED, QUESTION_OUTCOME.SKIPPED].includes(row.outcome));
  const scored = scoredRows.length;
  const firstKnown = scoredRows.filter((row) => row.firstAttemptCorrect !== null);
  const firstAttemptCorrect = firstKnown.filter((row) => row.firstAttemptCorrect).length;
  const finished = rows.filter((row) => FINISHED.has(row.outcome));
  const correct = scoredRows.filter((row) => row.finalResult === 'correct').length;
  const creditTotal = scoredRows.reduce((sum, row) => sum + (Number(row.finalCredit) || 0), 0);
  const returnKnown = scoredRows.filter((row) => row.repeatedReturn !== null);
  return {
    questions: rows.length,
    scored,
    firstAttemptCorrect,
    firstAttemptKnown: firstKnown.length,
    correctedAfterRetry: count(QUESTION_OUTCOME.CORRECTED_AFTER_RETRY),
    correctAttemptsNotRecorded: count(QUESTION_OUTCOME.CORRECT_ATTEMPTS_UNKNOWN),
    exhausted: count(QUESTION_OUTCOME.EXHAUSTED),
    leftWithAttempts: count(QUESTION_OUTCOME.LEFT_WITH_ATTEMPTS),
    openIncorrect: count(QUESTION_OUTCOME.OPEN_INCORRECT),
    skipped: count(QUESTION_OUTCOME.SKIPPED),
    notAttempted: count(QUESTION_OUTCOME.NOT_ATTEMPTED),
    finalCorrect: correct,
    improved: scoredRows.filter((row) => row.improved).length,
    replaced: scoredRows.filter((row) => row.replacements > 0).length,
    averageAttemptsPerFinishedQuestion: finished.length
      ? Math.round((finished.reduce((sum, row) => sum + row.totalAttempts, 0) / finished.length) * 10) / 10
      : null,
    firstAttemptAccuracy: percent(firstAttemptCorrect, firstKnown.length),
    finalCorrectRate: percent(correct, scored),
    finalCreditAverage: scored ? Math.round(creditTotal / scored) : null,
    returnedQuestions: returnKnown.filter((row) => row.repeatedReturn).length,
    returnDeterminable: returnKnown.length,
    attemptsFromEvents: scoredRows.filter((row) => row.attemptsSource === 'evidence-events').length,
    attemptsDerived: scoredRows.filter((row) => row.attemptsSource === 'derived-from-record').length,
    attemptsMixed: scoredRows.filter((row) => row.attemptsSource === 'mixed').length,
  };
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** The summary as sentences — counts only, in the brief's own form. */
export const describeAttemptSummary = (summary) => {
  if (!summary?.scored) return 'No attempts are recorded for these questions.';
  const sentences = [
    `${summary.firstAttemptCorrect} of ${summary.firstAttemptKnown} scored question${summary.firstAttemptKnown === 1 ? ' was' : 's were'} correct on the first attempt.`,
    `${plural(summary.correctedAfterRetry, 'additional question was', 'additional questions were')} corrected on a later attempt.`,
    `${summary.exhausted} remained incorrect after all available attempts.`,
  ];
  if (summary.leftWithAttempts) sentences.push(`${plural(summary.leftWithAttempts, 'question was', 'questions were')} left with attempts remaining when the assignment closed.`);
  if (summary.openIncorrect) sentences.push(`${plural(summary.openIncorrect, 'question is', 'questions are')} not yet correct with attempts remaining.`);
  if (summary.correctAttemptsNotRecorded) sentences.push(`${plural(summary.correctAttemptsNotRecorded, 'correct question has', 'correct questions have')} no recorded attempt count.`);
  return sentences.join(' ');
};

export default analyzeAssignmentQuestions;
