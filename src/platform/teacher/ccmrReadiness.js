import { INSTRUCTIONAL_BAND } from '../profile/studentLearningProfile.js';

/*
 * COURSE MASTERY IS NOT TRANSFER, AND THE GAP BETWEEN THEM IS THE WHOLE POINT.
 *
 * A student can hold an A in Algebra I and still not recognise the same
 * mathematics when the SAT asks for it in a paragraph with no equals sign in
 * sight. That is not a contradiction; it is the single most common shape of a
 * college-readiness problem, and it is invisible on every gradebook ever built,
 * because a gradebook only ever asks the question the way the teacher asked it.
 *
 * So this module reports TWO numbers per student and refuses to average them:
 *
 *   course mastery  — the TEKS, assessed the way the course assesses them.
 *   transfer        — the same mathematics, met in an exam-style context.
 *
 * The interesting students are the ones where those disagree, in either
 * direction, and they are the ones a single readiness score would erase.
 *
 *   "Do not equate Honors enrollment with automatic mastery."
 *
 * Enrollment is a scheduling fact. It says which room a student sits in, not
 * what they can do — and a dashboard that treats the Honors roster as the
 * college-ready roster tells a counsellor something false about every child in
 * it, in both directions. Nothing in this file reads course level except to
 * report it beside the evidence, and one test exists solely to keep it that way.
 */

const list = (value) => (Array.isArray(value) ? value : []);

export const CCMR_STATE = Object.freeze({
  NO_EVIDENCE: 'noEvidence',
  PROVISIONAL: 'provisional',
  TRANSFERS: 'transfers',
  COURSE_ONLY: 'courseOnly',
  TRANSFER_AHEAD: 'transferAhead',
  BOTH_LOW: 'bothLow',
});

export const CCMR_STATE_LABEL = Object.freeze({
  [CCMR_STATE.NO_EVIDENCE]: 'No exam-style evidence',
  [CCMR_STATE.PROVISIONAL]: 'Too little exam-style evidence',
  [CCMR_STATE.TRANSFERS]: 'Course knowledge transfers',
  [CCMR_STATE.COURSE_ONLY]: 'Knows the course, not the transfer',
  [CCMR_STATE.TRANSFER_AHEAD]: 'Transfers better than the course grade suggests',
  [CCMR_STATE.BOTH_LOW]: 'Course and transfer both low',
});

export const CCMR_THRESHOLDS = Object.freeze({
  // Below this an exam-style figure is a rumour. Matches the profile's own
  // `provisional` flag rather than inventing a second number.
  minTransferAttempts: 5,
  strong: 0.7,
  weak: 0.5,
  // How far the two can diverge before it is worth telling a teacher.
  divergence: 0.2,
});

/**
 * One student's CCMR picture: two numbers, their disagreement, and a sentence.
 *
 * `framework` selects which exam-style context to read (digitalSAT, act, …).
 * Passing none aggregates every framework the student has met, which is the
 * right default for a teacher and the wrong one for a counsellor targeting a
 * specific test — so both are available.
 */
export const ccmrForStudent = ({
  studentId, studentName, profile, courseLevel = 'standard', framework = null,
} = {}) => {
  const transferProfile = profile?.ccmrTransfer || {};
  const entries = framework
    ? [transferProfile[framework]].filter(Boolean)
    : Object.values(transferProfile);

  const attempts = entries.reduce((sum, entry) => sum + (Number(entry?.attempts) || 0), 0);
  const correct = entries.reduce((sum, entry) => (
    sum + ((Number(entry?.proficiency) || 0) * (Number(entry?.attempts) || 0))
  ), 0);
  const transfer = attempts ? correct / attempts : null;
  // `Number(null)` is 0, not NaN, so a plain `Number.isFinite(Number(x))` guard
  // silently turns "no course mastery figure yet" into "0% course mastery" —
  // which then reads as either a compliment (transfers ahead of their grade) or
  // an accusation (course and transfer both low) about a student nobody has
  // measured. The null check has to come first.
  const rawMastery = profile?.courseMastery;
  const mastery = rawMastery == null || !Number.isFinite(Number(rawMastery))
    ? null
    : Number(rawMastery);

  const base = {
    studentId,
    studentName,
    // Reported, never used as evidence. See the note at the top of this file.
    courseLevel,
    courseMastery: mastery,
    transfer,
    transferAttempts: attempts,
    instructionalBand: profile?.instructionalBand || null,
  };

  if (!attempts) {
    return {
      ...base,
      state: CCMR_STATE.NO_EVIDENCE,
      detail: 'This student has not met any exam-style question yet, so nothing here can say whether their course knowledge transfers. Assign CCMR practice before drawing a conclusion.',
    };
  }

  if (attempts < CCMR_THRESHOLDS.minTransferAttempts) {
    return {
      ...base,
      state: CCMR_STATE.PROVISIONAL,
      detail: `${attempts} exam-style question${attempts === 1 ? '' : 's'} so far. Shown because hiding it would imply there is nothing here, but it is too little to act on.`,
    };
  }

  if (mastery == null) {
    return {
      ...base,
      state: CCMR_STATE.PROVISIONAL,
      detail: `${Math.round(transfer * 100)}% on ${attempts} exam-style questions, but no course mastery figure to compare it against yet.`,
    };
  }

  const gap = mastery - transfer;

  if (transfer >= CCMR_THRESHOLDS.strong && mastery >= CCMR_THRESHOLDS.weak) {
    return {
      ...base,
      state: CCMR_STATE.TRANSFERS,
      detail: `${Math.round(transfer * 100)}% on exam-style questions against ${Math.round(mastery * 100)}% course mastery. What they know in class is reaching them when the question is dressed differently.`,
    };
  }

  if (gap >= CCMR_THRESHOLDS.divergence) {
    return {
      ...base,
      state: CCMR_STATE.COURSE_ONLY,
      // The finding this dashboard exists for.
      detail: `${Math.round(mastery * 100)}% course mastery but ${Math.round(transfer * 100)}% on exam-style questions. They know this mathematics the way the course asks for it and do not yet recognise it elsewhere — which is a practice problem with unfamiliar phrasing, not a reteaching problem.`,
    };
  }

  if (-gap >= CCMR_THRESHOLDS.divergence) {
    return {
      ...base,
      state: CCMR_STATE.TRANSFER_AHEAD,
      detail: `${Math.round(transfer * 100)}% on exam-style questions against ${Math.round(mastery * 100)}% course mastery. Worth a look at whether the course grade is measuring completion rather than what this student can do.`,
    };
  }

  return {
    ...base,
    state: CCMR_STATE.BOTH_LOW,
    detail: `${Math.round(mastery * 100)}% course mastery and ${Math.round(transfer * 100)}% transfer. The gap is not the problem here; the underlying mathematics is, and CCMR practice on its own will not close it.`,
  };
};

/**
 * The class, and the sentences worth saying about it.
 *
 * Deliberately returns no aggregate readiness percentage. A single number
 * across a class would be an average of two things that must not be averaged,
 * and it is precisely the number that gets pasted into a campus report and
 * treated as a fact about the children.
 */
export const buildCcmrView = ({
  students = [], profilesByStudentId = {}, courseLevelByStudentId = {}, framework = null,
} = {}) => {
  const rows = list(students).map((student) => ccmrForStudent({
    studentId: student.id,
    studentName: student.displayName || student.name || String(student.id),
    profile: profilesByStudentId[student.id] || null,
    courseLevel: courseLevelByStudentId[student.id] || 'standard',
    framework,
  }));

  const byState = (state) => rows.filter((row) => row.state === state);
  const findings = [];

  const courseOnly = byState(CCMR_STATE.COURSE_ONLY);
  if (courseOnly.length) {
    findings.push({
      state: CCMR_STATE.COURSE_ONLY,
      headline: `${courseOnly.length} student${courseOnly.length === 1 ? '' : 's'} know the course but not the transfer`,
      detail: 'Strong on the TEKS as the course assesses them, weak when the same mathematics appears in exam phrasing. This is the gap a gradebook cannot show, and it closes with unfamiliar contexts rather than with reteaching.',
      students: courseOnly,
    });
  }

  const transferAhead = byState(CCMR_STATE.TRANSFER_AHEAD);
  if (transferAhead.length) {
    findings.push({
      state: CCMR_STATE.TRANSFER_AHEAD,
      headline: `${transferAhead.length} student${transferAhead.length === 1 ? '' : 's'} transfer better than their course grade suggests`,
      detail: 'Worth checking whether the course grade is measuring completion rather than mathematics for these students.',
      students: transferAhead,
    });
  }

  const noEvidence = byState(CCMR_STATE.NO_EVIDENCE);
  if (noEvidence.length) {
    findings.push({
      state: CCMR_STATE.NO_EVIDENCE,
      headline: `${noEvidence.length} student${noEvidence.length === 1 ? '' : 's'} have met no exam-style question`,
      detail: 'Nothing on this screen says anything about their college readiness, and no conclusion should be drawn from their absence from the lists above.',
      students: noEvidence,
    });
  }

  return { rows, findings };
};

export default buildCcmrView;
