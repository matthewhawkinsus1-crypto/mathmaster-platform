/*
 * ERROR PATTERNS — ONLY WHERE A TOOL STORED ONE.
 *
 * MathMaster names an error pattern only from a structured misconception code
 * a tool stored on the record (functions/shared/misconceptionCodes.mjs lists
 * the codes and where they may be stored). A wrong answer is never classified
 * here, by rule or by a language model. Today no classroom tool stores a code,
 * so the honest answer for every question is:
 *
 *   "Error pattern not determinable from stored evidence."
 *
 * What the records DO hold is which named parts of a question the grader
 * marked not correct on the latest attempt (for example "y-intercept"). Those
 * are listed as recorded results — what was marked, not why — and only where
 * the part has a real name (not "Part 1").
 */
import { misconceptionLabel } from '../../../functions/shared/misconceptionCodes.mjs';
import { QUESTION_OUTCOME } from './attemptAnalysis.js';

export const ERROR_PATTERN_NOT_DETERMINABLE = 'Error pattern not determinable from stored evidence.';

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
  const codes = list(row?.misconceptionCodes);
  if (codes.length) {
    return { determinable: true, codes: codes.map((code) => ({ code, label: misconceptionLabel(code) || code })), statement: '' };
  }
  return { determinable: false, codes: [], statement: ERROR_PATTERN_NOT_DETERMINABLE };
};

/** Across a set of question rows: structured codes, and named parts marked not correct. */
export const analyzeErrorPatterns = ({ questions = [] } = {}) => {
  const rows = list(questions).filter((row) => !UNSCORED.has(row.outcome));
  const notCorrect = rows.filter((row) => row.finalResult !== 'correct');
  const byCode = new Map();
  rows.forEach((row) => {
    list(row.misconceptionCodes).forEach((code) => {
      const entry = byCode.get(code) || { code, label: misconceptionLabel(code) || code, questions: 0, assignmentIds: new Set(), questionRefs: [] };
      entry.questions += 1;
      entry.assignmentIds.add(row.assignmentId);
      entry.questionRefs.push({ assignmentId: row.assignmentId, storageIndex: row.storageIndex });
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
  const codes = [...byCode.values()].map(finish).sort((a, b) => b.questions - a.questions);
  return {
    determinable: codes.length > 0,
    statement: codes.length
      ? `${codes.reduce((sum, entry) => sum + entry.questions, 0)} structured error code${codes.length === 1 && codes[0].questions === 1 ? ' was' : 's were'} stored by MathMaster tools in this selection.`
      : ERROR_PATTERN_NOT_DETERMINABLE,
    codes,
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
