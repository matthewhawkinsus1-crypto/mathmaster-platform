/*
 * THE SHAPE OF ONE AUTHORITATIVE GRADING RESULT.
 *
 * Every shared grader — the ordinary question types and every rich tool —
 * returns this, and the browser, ingestion, the deadline finalizer, Recovery,
 * the Response Inspector and the tests all read it the same way:
 *
 *   {
 *     graded:     true when a verdict exists (false + `reason` otherwise)
 *     reason:     machine-readable reason when `graded` is false
 *     isComplete: the student finished everything the question grades
 *     isCorrect:  every graded part is correct
 *     score:      0..1 — the tool's legitimate partial credit, when it has one
 *     parts:      [{ id, label, isComplete, isCorrect, credit, weight, response }]
 *   }
 *
 * `attemptInputsFromGrading` is the ONE mapping from that result to the
 * attempt policy. A manual Submit in the browser and a server ingestion both
 * call it, so the same raw work produces the same record — status, attempt
 * count, partial credit and part grades — whichever path delivered it.
 *
 * Pure.
 */

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const text = (value) => String(value ?? '');

/** A grader could not produce a verdict, and says why. */
export const ungradedResult = (reason, extra = {}) => ({
  graded: false,
  reason: text(reason) || 'ungraded',
  isComplete: false,
  isCorrect: false,
  score: 0,
  parts: [],
  ...extra,
});

const partResponseText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

/**
 * Build a graded result from per-part checks.
 *
 * `parts`: [{ id, label?, isCorrect, isComplete?, credit?, weight?, response? }]
 *
 * `score` defaults to the weighted share of correct parts — the arithmetic
 * almost every tool already used (`checks.filter(Boolean).length / n`). A tool
 * whose score is NOT that (an all-or-nothing tool that still reports parts, or
 * one that awards a half step) passes `score` explicitly.
 */
export const gradedResult = ({ parts = [], isComplete = null, isCorrect = null, score = null, detail = null } = {}) => {
  const normalized = (Array.isArray(parts) ? parts : []).map((part, index) => {
    const weight = Number.isFinite(Number(part?.weight)) && Number(part.weight) > 0 ? Math.min(20, Number(part.weight)) : 1;
    const partCorrect = part?.isCorrect === true;
    return {
      id: text(part?.id || `part-${index + 1}`),
      label: text(part?.label || part?.id || `Part ${index + 1}`),
      isComplete: part?.isComplete === undefined ? true : part.isComplete === true,
      isCorrect: partCorrect,
      credit: Number.isFinite(Number(part?.credit)) ? clamp01(part.credit) : (partCorrect ? 1 : 0),
      weight,
      ...(part?.graded === false ? { graded: false } : {}),
      response: partResponseText(part?.response).slice(0, 240),
    };
  });
  const scorable = normalized.filter((part) => part.graded !== false);
  const totalWeight = scorable.reduce((sum, part) => sum + part.weight, 0);
  const earned = scorable.reduce((sum, part) => sum + part.credit * part.weight, 0);
  const derivedScore = totalWeight > 0 ? earned / totalWeight : 0;
  const allCorrect = scorable.length > 0 && scorable.every((part) => part.isCorrect);
  const complete = isComplete === null ? normalized.every((part) => part.isComplete) : isComplete === true;
  const correct = isCorrect === null ? complete && allCorrect : isCorrect === true;
  return {
    graded: true,
    reason: null,
    isComplete: complete,
    isCorrect: correct,
    score: correct ? 1 : clamp01(score === null ? derivedScore : score),
    parts: normalized,
    ...(detail ? { detail } : {}),
  };
};

/**
 * The attempt-policy inputs for a graded result — shared by the browser and
 * the server so both record identical attempts from identical work.
 */
export const attemptInputsFromGrading = (result) => {
  const isCorrect = result?.isCorrect === true;
  const score = clamp01(result?.score);
  return {
    isCorrect,
    parts: Array.isArray(result?.parts) ? result.parts : [],
    partialCreditPercent: isCorrect ? 100 : Math.round(score * 100),
  };
};
