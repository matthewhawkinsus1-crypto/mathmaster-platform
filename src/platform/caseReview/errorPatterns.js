/*
 * ERROR PATTERNS — ONLY WHERE THE SERVER PROVED ONE.
 *
 * MathMaster names an error pattern only from misconception evidence a SERVER
 * classifier stored on an attempt's evidence event, from the authoritative
 * question, the student's raw work and the server's own grading
 * (functions/shared/misconceptionCodes.mjs is the registry and the trust gate;
 * functions/shared/misconceptionClassifiers.mjs the classifiers). A wrong
 * answer is never classified here, by rule or by a language model. Where no
 * classifier proved a pattern, the honest answer is:
 *
 *   "Error pattern not determinable from stored evidence."
 *
 * Where one did, the pattern is RECURRING when the same code was proved on two
 * or more different questions, and ISOLATED when it was proved on one (however
 * many attempts of that one question showed it). A code is evidence about
 * mathematical thinking, never a grade and never a judgement of the student.
 *
 * What the records DO hold besides is which named parts of a question the
 * grader marked not correct on the latest attempt (for example "y-intercept").
 * Those are listed as recorded results — what was marked, not why — and only
 * where the part has a real name (not "Part 1").
 */
import { getMisconceptionCode, misconceptionLabel } from '../../../functions/shared/misconceptionCodes.mjs';
import { QUESTION_OUTCOME, isRequiredQuestion } from './attemptAnalysis.js';

export const ERROR_PATTERN_NOT_DETERMINABLE = 'Error pattern not determinable from stored evidence.';

export const MISCONCEPTION_RECURRENCE = Object.freeze({
  RECURRING: 'recurring',
  ISOLATED: 'isolated',
});
export const RECURRING_MIN_QUESTIONS = 2;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** How a teacher reads one code's entry: "Recurring misconception: … (3 questions, 2 assignments)". */
export const describeMisconceptionEntry = (entry) => {
  const kind = entry.recurrence === MISCONCEPTION_RECURRENCE.RECURRING ? 'Recurring misconception' : 'Isolated misconception';
  const where = entry.questions === 1
    ? (entry.attempts > 1 ? `1 question, on ${entry.attempts} attempts` : '1 question')
    : `${plural(entry.questions, 'question')}, ${plural(entry.assignmentIds.length, 'assignment')}`;
  return `${kind}: ${entry.label} (${where})`;
};

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const GENERIC_PART = /^(?:part|field|answer|response|blank|input|box|step|question|item)\s*[#-]?\s*\d*$/i;
const UNSCORED = new Set([QUESTION_OUTCOME.NOT_ATTEMPTED, QUESTION_OUTCOME.SKIPPED]);

export const isNamedPart = (label) => {
  const text = clean(label);
  return Boolean(text) && !GENERIC_PART.test(text) && text.length <= 60;
};

/** The error-pattern answer for one question row. */
export const errorPatternForQuestion = (row) => {
  // Registry codes only: a code this build does not know is not shown.
  const codes = list(row?.misconceptionCodes).filter((code) => misconceptionLabel(code));
  if (codes.length) {
    const findings = list(row?.misconceptionFindings);
    return {
      determinable: true,
      codes: codes.map((code) => ({
        code,
        label: misconceptionLabel(code),
        meaning: getMisconceptionCode(code).teacherMeaning,
        attempts: new Set(findings.filter((finding) => finding.code === code).map((finding) => finding.attemptNumber)).size || 1,
      })),
      statement: '',
    };
  }
  return { determinable: false, codes: [], statement: ERROR_PATTERN_NOT_DETERMINABLE };
};

/** Across a set of question rows: structured codes, and named parts marked not correct. */
export const analyzeErrorPatterns = ({ questions = [] } = {}) => {
  // Scored work only; a question the student's accommodation omitted is
  // neither scored nor unscored — it is not their work.
  const rows = list(questions).filter((row) => isRequiredQuestion(row) && !UNSCORED.has(row.outcome));
  const notCorrect = rows.filter((row) => row.finalResult !== 'correct');
  const byCode = new Map();
  rows.forEach((row) => {
    const findings = list(row.misconceptionFindings);
    list(row.misconceptionCodes).forEach((code) => {
      const label = misconceptionLabel(code);
      // A code this build's registry does not know degrades to nothing.
      if (!label) return;
      const entry = byCode.get(code) || {
        code, label, meaning: getMisconceptionCode(code).teacherMeaning, questions: 0, attempts: 0, assignmentIds: new Set(), questionRefs: [],
      };
      const attempts = new Set(findings.filter((finding) => finding.code === code).map((finding) => finding.attemptNumber)).size || 1;
      entry.questions += 1;
      entry.attempts += attempts;
      entry.assignmentIds.add(row.assignmentId);
      entry.questionRefs.push({ assignmentId: row.assignmentId, storageIndex: row.storageIndex, attempts });
      byCode.set(code, entry);
    });
  });
  const byPart = new Map();
  notCorrect.forEach((row) => {
    const seen = new Set();
    list(row.latestParts).forEach((part) => {
      if (part.isCorrect || !part.isComplete || !isNamedPart(part.label)) return;
      const key = clean(part.label).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const entry = byPart.get(key) || { label: clean(part.label), questions: 0, assignmentIds: new Set(), questionRefs: [] };
      entry.questions += 1;
      entry.assignmentIds.add(row.assignmentId);
      entry.questionRefs.push({ assignmentId: row.assignmentId, storageIndex: row.storageIndex });
      byPart.set(key, entry);
    });
  });
  const finish = (entry) => ({ ...entry, assignmentIds: [...entry.assignmentIds] });
  const codes = [...byCode.values()].map(finish).map((entry) => {
    const recurrence = entry.questions >= RECURRING_MIN_QUESTIONS ? MISCONCEPTION_RECURRENCE.RECURRING : MISCONCEPTION_RECURRENCE.ISOLATED;
    const withRecurrence = { ...entry, recurrence };
    return { ...withRecurrence, description: describeMisconceptionEntry(withRecurrence) };
  }).sort((a, b) => b.questions - a.questions || b.attempts - a.attempts || a.code.localeCompare(b.code));
  const recurring = codes.filter((entry) => entry.recurrence === MISCONCEPTION_RECURRENCE.RECURRING).length;
  const isolated = codes.length - recurring;
  return {
    determinable: codes.length > 0,
    statement: codes.length
      ? `${[recurring ? plural(recurring, 'recurring misconception') : null, isolated ? plural(isolated, 'isolated misconception') : null].filter(Boolean).join(' and ')} identified by MathMaster's server-side classifiers in this selection.`
      : ERROR_PATTERN_NOT_DETERMINABLE,
    codes,
    recurring,
    isolated,
    notCorrectParts: [...byPart.values()].map(finish).sort((a, b) => b.questions - a.questions || a.label.localeCompare(b.label)),
    partNote: 'Named parts the grader marked not correct on each question\'s latest attempt. These are recorded results, not a diagnosis of why.',
    coverage: {
      scoredQuestions: rows.length,
      notCorrectQuestions: notCorrect.length,
      questionsWithCodes: rows.filter((row) => list(row.misconceptionCodes).length).length,
      notCorrectWithNamedParts: notCorrect.filter((row) => list(row.latestParts).some((part) => !part.isCorrect && isNamedPart(part.label))).length,
    },
  };
};

export default analyzeErrorPatterns;
