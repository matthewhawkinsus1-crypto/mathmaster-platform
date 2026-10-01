/*
 * POST-DEADLINE PRACTICE: TWO COPIES OF IT, MERGED PER QUESTION.
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
 *
 * The same rule merges the SERVER copy (workspaceDraftSchema.mjs). The device
 * sends its tracker the moment Practice Mode opens — the seed — and that save
 * used to replace the server's practice whole whenever it was the newer write.
 * Usually the device's read landed first and sent the merged tracker back; when
 * the read failed and the save got through (the server unreachable at open and
 * back without the browser noticing), or the tab closed in between, the seed
 * stayed and the practice was gone for every device (PQ-044, Practice Mode).
 * Merged per question inside the save's transaction, a seed adds nothing and
 * removes nothing, in any order.
 *
 * Progress only grows — a new variant replaces an expired one, attempts are
 * counted, a correct answer stays correct — so "more progress" is "later".
 */

import { normalizeQuestionRecord } from './attemptPolicy.mjs';

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

const rowsOf = (tracker) => (tracker && typeof tracker === 'object' ? tracker : {});

export const mergePracticeTrackers = (saved = {}, current = {}) => {
  const savedRows = rowsOf(saved);
  const currentRows = rowsOf(current);
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

/**
 * Do two trackers record the same practice progress, question by question?
 * Compared by progress alone, so a row that records none (no attempts, the
 * first variant) is the same as no row at all.
 */
export const samePracticeProgress = (left = {}, right = {}) => {
  const leftRows = rowsOf(left);
  const rightRows = rowsOf(right);
  const keys = new Set([...Object.keys(leftRows), ...Object.keys(rightRows)]);
  return [...keys].every((key) => compareProgress(leftRows[key], rightRows[key]) === 0);
};
