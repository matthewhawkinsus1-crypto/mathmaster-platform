/*
 * POST-DEADLINE PRACTICE: THE SAVED COPY AND THIS SESSION, MERGED PER QUESTION.
 *
 * Every entry into a closed assignment seeds a Practice tracker from the graded
 * one (same variant, no attempts) before the saved practice copy has arrived
 * from the workspace-draft document. The merge used to be
 *
 *   { ...saved, ...current }
 *
 * — and the seed has a row for EVERY question, so it overwrote every saved row,
 * and the next draft sync wrote the seed back with a newer timestamp. A reload
 * or a different Chromebook put the student back on the graded variant (often
 * the one whose solution they had already seen) with their practice gone.
 *
 * Now each question keeps whichever record carries more practice progress:
 * a later variant first, then more attempts, then a correct answer, then the
 * more recent attempt. A fresh seed (variant unchanged, no attempts) therefore
 * never beats saved work, and work done in this session before the saved copy
 * arrived is never thrown away either.
 */

import { normalizeQuestionRecord } from '../../attemptPolicy.js';

const progressKey = (record) => {
  const normalized = normalizeQuestionRecord(record);
  return [
    Number(normalized.variantIndex) || 0,
    Number(normalized.totalAttempts) || 0,
    normalized.status === 'correct' ? 1 : 0,
    Date.parse(normalized.lastAttemptAt || '') || 0,
  ];
};

const compareProgress = (left, right) => {
  const a = progressKey(left);
  const b = progressKey(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

export const mergePracticeTrackers = (saved = {}, current = {}) => {
  const savedRows = saved && typeof saved === 'object' ? saved : {};
  const currentRows = current && typeof current === 'object' ? current : {};
  const keys = new Set([...Object.keys(savedRows), ...Object.keys(currentRows)]);
  const merged = {};
  keys.forEach((key) => {
    const fromSaved = savedRows[key];
    const fromSession = currentRows[key];
    if (fromSaved === undefined) merged[key] = fromSession;
    else if (fromSession === undefined) merged[key] = fromSaved;
    // Ties keep this session's row: it is the one on screen.
    else merged[key] = compareProgress(fromSaved, fromSession) > 0 ? fromSaved : fromSession;
  });
  return merged;
};
