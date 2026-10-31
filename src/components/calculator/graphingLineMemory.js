/*
 * THE GRAPHING CALCULATOR'S LINES, KEPT FOR THE ASSIGNMENT (TL18, C1-48).
 *
 * On an ordinary assignment the calculator lives inside the per-question
 * QuestionEngine, so the lines a student typed vanished on the next question;
 * a secure test keeps them because its panel stays mounted. Now the typed
 * lines are kept for the assignment in this tab (sessionStorage): plain text,
 * at most ten lines of at most 200 characters, nothing about the question.
 * A storage that is unavailable or full is simply not used.
 */
import { parseQuestionDraftKey } from '../../questionDraftStorage.js';

export const GRAPHING_LINES_MAX = 10;
const LINE_TEXT_MAX = 200;
const PREFIX = 'mm.graphingLines';

const sessionStore = () => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
};

/** One key per student, assignment and session bucket; null where there is no assignment draft key. */
export const graphingLinesKeyFor = (draftKey) => {
  const parsed = parseQuestionDraftKey(draftKey);
  if (!parsed?.studentId || !parsed?.assignmentId) return null;
  return [PREFIX, parsed.studentId, parsed.assignmentId, parsed.sessionBucket || 'graded'].map(encodeURIComponent).join(':');
};

const cleanLines = (value) => (Array.isArray(value) ? value : [])
  .filter((text) => typeof text === 'string')
  .map((text) => text.slice(0, LINE_TEXT_MAX))
  .slice(0, GRAPHING_LINES_MAX);

export const readGraphingLines = (key, storage = sessionStore()) => {
  if (!key || !storage) return [];
  try {
    return cleanLines(JSON.parse(storage.getItem(key) || '[]'));
  } catch {
    return [];
  }
};

export const writeGraphingLines = (key, texts, storage = sessionStore()) => {
  if (!key || !storage) return;
  try {
    const lines = cleanLines(texts);
    if (lines.some((text) => text.trim())) storage.setItem(key, JSON.stringify(lines));
    else storage.removeItem(key);
  } catch {
    // Full or blocked storage: the lines live for this question, as before.
  }
};
