import { normalizeQuestionRecord, getQuestionCredit } from '../../attemptPolicy.js';
import { getIncludedQuestionIndices } from '../../assignmentLifecycle.js';
import { weightedQuestionTotals } from '../grading/questionWeights.js';

/*
 * TWO NUMBERS BEHIND EVERY GRADE, AND A THIRD ABOUT THE QUESTION ITSELF.
 *
 * A gradebook score of 40% is one of two completely different situations:
 *
 *   answered ten questions, got four right      — an academic finding
 *   answered four questions, got all four right — a completion finding
 *
 * The grade is the same. What the teacher should do about it is not remotely
 * the same, and a column of percentages cannot tell them apart. Every teacher
 * knows this and reconstructs it by clicking into individual students, which is
 * exactly the work a gradebook exists to save.
 *
 *   "Do not convert unanswered work into academic failure."
 *
 * This module does NOT change the grade. An unanswered question is worth zero,
 * because that is what a grade means, and quietly excusing missing work would
 * be its own kind of dishonesty. What it does is return the two figures that
 * explain the grade — accuracy on attempted work, and how much was attempted —
 * so the screen can show a completion problem as a completion problem.
 *
 * THE THIRD NUMBER: WAS THE RIGOR THE SAME?
 *
 *   "The teacher should never have to guess whether two students' scores came
 *    from identical rigor."
 *
 * On an adaptive assignment two students can both score 80% having answered
 * genuinely different questions. That is the point of adaptation, and it makes
 * the two scores incomparable in a way nothing on the screen currently admits.
 * `rigorComparability` reads the delivered evidence and says plainly which of
 * the three cases a teacher is looking at.
 */

const list = (value) => (Array.isArray(value) ? value : []);

export const GRADE_SHAPE = Object.freeze({
  NOT_STARTED: 'notStarted',
  INCOMPLETE: 'incomplete',
  COMPLETE: 'complete',
});

/**
 * The grade, and the two numbers that explain it.
 *
 * `score` is exactly what the gradebook has always shown — unchanged, and
 * deliberately so. Everything else is context around it.
 */
export const splitGrade = ({ tracker = null, assignment = null } = {}) => {
  const included = getIncludedQuestionIndices(assignment);
  if (!included.length) {
    return {
      score: null, attempted: 0, total: 0, unanswered: 0,
      creditOnAttempted: null, shape: GRADE_SHAPE.NOT_STARTED,
    };
  }

  let attempted = 0;
  included.forEach((index) => {
    const record = normalizeQuestionRecord(tracker?.[index]);
    if (record.status !== 'unattempted') attempted += 1;
  });

  const questions = assignment?.schemaVersion === 5
    ? (assignment.sections || []).flatMap((section) => section?.questions || [])
    : [];
  const weighted = weightedQuestionTotals({
    tracker,
    questions,
    indices: included,
    creditForRecord: (record) => getQuestionCredit(normalizeQuestionRecord(record)),
    attemptedForRecord: (record) => normalizeQuestionRecord(record).status !== 'unattempted',
  });

  const unanswered = included.length - attempted;
  return {
    score: weighted.score,
    attempted,
    total: included.length,
    unanswered,
    creditOnAttempted: weighted.creditOnAttempted,
    shape: attempted === 0
      ? GRADE_SHAPE.NOT_STARTED
      : unanswered > 0 ? GRADE_SHAPE.INCOMPLETE : GRADE_SHAPE.COMPLETE,
  };
};

/**
 * The sentence a teacher needs beside the score, or null when the score speaks
 * for itself.
 *
 * A completed assignment gets no explanatory line — the grade already means
 * what it appears to mean, and adding a line to every row is how a teacher
 * learns to skip the column.
 */
export const explainGrade = (split) => {
  if (!split || split.total === 0) return null;
  if (split.shape === GRADE_SHAPE.COMPLETE) return null;
  if (split.shape === GRADE_SHAPE.NOT_STARTED) {
    return `Not attempted. This is a ${split.total}-question assignment with no answers recorded — a completion gap, not a performance one.`;
  }
  return `${split.attempted} of ${split.total} answered, ${split.creditOnAttempted}% correct on those. The ${split.unanswered} unanswered question${split.unanswered === 1 ? '' : 's'} ${split.unanswered === 1 ? 'is' : 'are'} missing evidence, not wrong evidence.`;
};

export const COMPARABILITY = Object.freeze({
  UNKNOWN: 'unknown',
  IDENTICAL: 'identical',
  VARIED: 'varied',
});

/**
 * Did these students answer questions of the same rigor?
 *
 * Read from DELIVERED evidence, never from the assignment's declared mode. An
 * assignment set to adaptive can still hand everyone the authored question, and
 * an assignment set to shared cannot vary — but only the evidence knows what
 * actually happened, and the evidence is what the grades came from.
 *
 * Returns UNKNOWN rather than guessing when there is no delivery history.
 * "We do not know whether these scores are comparable" is a useful thing to
 * tell a teacher; a confident wrong answer is not.
 */
export const rigorComparability = ({ evidenceByStudentId = {}, assignmentId = null } = {}) => {
  const perStudent = [];
  Object.entries(evidenceByStudentId).forEach(([studentId, events]) => {
    const relevant = list(events).filter((event) => (
      !assignmentId || String(event?.source?.assignmentId || '') === String(assignmentId)
    ));
    if (!relevant.length) return;
    const bands = new Set();
    const doks = new Set();
    let adapted = false;
    relevant.forEach((event) => {
      const snapshot = event?.questionSnapshot || {};
      if (Number.isFinite(Number(snapshot.difficultyBand))) bands.add(Number(snapshot.difficultyBand));
      if (Number.isFinite(Number(snapshot.dok))) doks.add(Number(snapshot.dok));
      if (snapshot.adapted) adapted = true;
    });
    perStudent.push({
      studentId,
      bands: [...bands].sort((a, b) => a - b),
      doks: [...doks].sort((a, b) => a - b),
      adapted,
      questions: relevant.length,
    });
  });

  if (perStudent.length < 2) {
    return { state: COMPARABILITY.UNKNOWN, students: perStudent, note: 'Not enough delivery history to say whether these scores came from the same rigor.' };
  }

  const signature = (entry) => `${entry.bands.join(',')}|${entry.doks.join(',')}`;
  const signatures = new Set(perStudent.map(signature));
  const anyAdapted = perStudent.some((entry) => entry.adapted);

  if (signatures.size === 1 && !anyAdapted) {
    return {
      state: COMPARABILITY.IDENTICAL,
      students: perStudent,
      note: 'Every student answered questions at the same difficulty and cognitive demand. These scores are directly comparable.',
    };
  }

  return {
    state: COMPARABILITY.VARIED,
    students: perStudent,
    note: 'Students received different difficulty or cognitive demand on this assignment. The scores are not directly comparable — open a student to see what they were actually given and why.',
  };
};

/**
 * What one student was given, in the words a teacher would use.
 *
 * The per-student half of the same question. Returns null when the evidence
 * says nothing was adapted, because "you got what was assigned" needs no
 * explanation.
 */
export const describeDeliveredRigor = (events = [], assignmentId = null) => {
  const relevant = list(events).filter((event) => (
    !assignmentId || String(event?.source?.assignmentId || '') === String(assignmentId)
  ));
  const adapted = relevant.filter((event) => event?.questionSnapshot?.adapted);
  if (!relevant.length) return null;
  if (!adapted.length) {
    return {
      adaptedCount: 0,
      total: relevant.length,
      summary: `All ${relevant.length} question${relevant.length === 1 ? '' : 's'} were delivered exactly as authored.`,
      reasons: [],
    };
  }
  // Reasons are deduplicated: five questions moved for the same reason is one
  // thing a teacher needs to read, not five.
  const reasons = [...new Set(adapted
    .map((event) => event?.adaptation?.reason)
    .filter(Boolean))];
  return {
    adaptedCount: adapted.length,
    total: relevant.length,
    summary: `${adapted.length} of ${relevant.length} questions were adapted for this student. The assigned standard was preserved every time.`,
    reasons,
  };
};

export default splitGrade;
