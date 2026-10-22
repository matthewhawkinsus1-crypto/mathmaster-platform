/*
 * WHAT "BUILD THE SEQUENCE MODEL" SAYS AFTER A WRONG CHECK (walkthrough
 * 2026-10-22, Algebra I DOL #3 Review PR 13).
 *
 * One sentence covered every miss: "Keep every representation consistent: n
 * is the table/graph input, the plotted points must match the table, and both
 * rules must generate those same outputs." A student who added 4 to n instead
 * of to the previous term (−7, 6, 7, 8, 9, 10) had plotted exactly their own
 * table, so consistency was not the problem, and the item had no rule fields,
 * so "both rules" named nothing on the screen. The message now follows the
 * parts the grader marked wrong, names that slip when the table shows it, and
 * speaks only of fields the item has. It never states the common difference
 * or ratio: on an item that asks for it, that is part of the answer.
 *
 * Shown only where the tool shows its verdict at all (useToolSubmission keeps
 * feedback null when the activity withholds outcomes).
 */
import { parseNumericAnswer } from '../../../functions/shared/toolMath/shared/toolMath.mjs';

const close = (left, right) => Math.abs(left - right) <= 0.01;

/** From n = 2 on, every term is the position n changed by d (or r), not the previous term. */
export const tableChangesPosition = (tableValues = [], spec = {}) => {
  const values = (Array.isArray(tableValues) ? tableValues : []).map(parseNumericAnswer);
  const later = values.map((value, index) => ({ n: index + 1, value })).slice(1).filter((cell) => cell.value !== null);
  if (later.length < 2) return false;
  const fromPosition = spec.kind === 'geometric'
    ? (n) => n * Number(spec.ratio)
    : (n) => n + Number(spec.difference);
  return later.every((cell) => close(cell.value, fromPosition(cell.n)));
};

/** The student's points are exactly the filled rows of the student's own table. */
export const plotMatchesTable = (plottedPoints = [], tableValues = []) => {
  const rows = (Array.isArray(tableValues) ? tableValues : [])
    .map((value, index) => ({ n: index + 1, value: parseNumericAnswer(value) }))
    .filter((row) => row.value !== null);
  const points = Array.isArray(plottedPoints) ? plottedPoints : [];
  if (!rows.length || points.length !== rows.length) return false;
  return rows.every((row) => points.some((point) => Number(point?.[0]) === row.n && close(Number(point?.[1]), row.value)));
};

export const fullBridgeMissMessage = ({ parts = [], work = {}, spec = {}, targetN = 0 } = {}) => {
  const wrong = new Set((Array.isArray(parts) ? parts : []).filter((part) => part?.isCorrect !== true).map((part) => part?.id));
  const geometric = spec.kind === 'geometric';
  const change = geometric ? 'multiply the previous term by the common ratio' : 'add the common difference to the previous term';
  const sentences = [];

  if (wrong.has('table')) {
    sentences.push(tableChangesPosition(work.tableValues, spec)
      ? `Each term comes from the term before it: ${change}, not ${geometric ? 'the term number n' : 'to the term number n'}.`
      : `Check your table: start from a₁, then ${change} to get each next term.`);
    if (wrong.has('plot') && plotMatchesTable(work.plottedPoints, work.tableValues)) {
      sentences.push('Your graph matches your table, so once the table is right, re-plot those points.');
    } else if (wrong.has('plot')) {
      sentences.push('Then plot each pair (n, aₙ) from the table as its own point.');
    }
  } else if (wrong.has('plot')) {
    sentences.push('Your table is right. Plot each pair (n, aₙ) from it as its own point, with n across and aₙ up.');
  }
  if (wrong.has('kind') || wrong.has('change')) {
    sentences.push('Classify from the table: equal differences make a sequence arithmetic; equal ratios make it geometric.');
  }
  const explicitWrong = wrong.has('explicit-rule');
  const recursiveWrong = wrong.has('recursive-first') || wrong.has('recursive-rule');
  if (explicitWrong && recursiveWrong) sentences.push('Check that both of your rules give the terms in your table, starting with a₁.');
  else if (explicitWrong) sentences.push('Check that your explicit rule gives the terms in your table: try n = 1 and n = 2.');
  else if (recursiveWrong) sentences.push('Check your recursive rule: it starts at a₁ and builds each term from the one before it.');
  if (wrong.has('term') && Number(targetN) > 0) sentences.push(`Find a${subscript(targetN)} by putting n = ${targetN} into your explicit rule.`);

  return sentences.length ? sentences.join(' ') : 'Not quite yet. Check each part against the sequence.';
};

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (n) => String(n).split('').map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit).join('');
