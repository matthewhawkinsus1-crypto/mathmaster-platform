/*
 * IS THE MODEL THE STUDENT WROTE THE SITUATION'S? (F-SW-CHECKS-OWN-MODEL)
 *
 * A context item starts with the student writing each constraint in the tool
 * (a·x + b·y, a symbol, a constant). "Graph these constraints" used to send any
 * complete model on to the graph: a student who wrote ≤ for "at least 20"
 * built that wrong half-plane, and every step after it — boundary, solid,
 * shading, "Every constraint checks out", the test point asked against their
 * own inequality — said ✓, until Submit said "Not yet" without saying why.
 *
 * Where outcomes are shown, that button is now the model's Check, as every
 * later step has one: a wrong model stays on its step with a line that says
 * why, and only a model the grader accepts is graphed. Where outcomes are
 * withheld (a DOL, quiz or test) it is unchanged: the model is sent as written
 * and nothing says whether it is right (resolveInequalityBuildGate).
 *
 * WHOSE VERDICT: the shared grader's. Each row is right exactly when the
 * grader's "Modeled constraint N" part is (modelRowVerdicts), so an equivalent
 * model — both sides scaled by a positive number, every sign switched with
 * the symbol turned round, the rows in any order — passes here because it
 * passes there. Why a row is wrong is read with the grader's own equivalence
 * (modelingEntryCorrect): never a second one. Grading is not changed.
 *
 * WHAT A WRONG ROW IS TOLD, in the item's own words where it has them:
 *   - the right line with the wrong symbol: what the situation's phrase means,
 *     and the symbol — “At least 20 points” means 20 points or more: ≥.
 *   - anything else: that it does not match the situation yet; a second miss
 *     says whether the coefficients or the constant is off. Never the numbers.
 *
 * No React here: tests/platform/inequalityModelCheck.test.mjs runs it in node.
 */
import { equivalentLinearInequality, modelingEntryCorrect, modelingEntryToCanonical } from './inequalityBuilderAdapter.js';
import { displayRelation, linearTerm } from './inequalityFormat.js';

const RELATIONS = Object.freeze(['>=', '>', '<=', '<']);
const FLIP = Object.freeze({ '>=': '<=', '<=': '>=', '>': '<', '<': '>' });

/**
 * Each row's verdict from the shared grader's result: true or false by its
 * "Modeled constraint N" part, null where there is none (nothing to judge,
 * so nothing to hold the student on).
 */
export const modelRowVerdicts = (parts = [], count = 0) => Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => {
  const part = (Array.isArray(parts) ? parts : []).find((entry) => entry?.id === `model-${index + 1}`);
  return part ? part.isCorrect === true : null;
});

/**
 * Why each row the grader turned down is wrong. Rows it accepted (or could
 * not judge) are null. The model is a set, as the grader matches it: the
 * accepted rows claim their expected constraints first, in order, and a wrong
 * row is compared only with the constraints still unclaimed.
 *
 *   { kind: 'relation', expectedIndex, relation }
 *       the row is that constraint's line with the wrong symbol; `relation`
 *       is the symbol the row needs as written (a row with every sign
 *       switched needs the situation's symbol turned round)
 *   { kind: 'terms', coefficientsFit }
 *       a coefficient or the constant is off; `coefficientsFit` says the x
 *       and y parts are a multiple of an unclaimed constraint's, so it is the
 *       constant
 */
export const diagnoseModelRows = ({ entries = [], expectedConstraints = [], rowCorrect = [] } = {}) => {
  const rows = Array.isArray(entries) ? entries : [];
  const expected = Array.isArray(expectedConstraints) ? expectedConstraints : [];
  const claimed = new Set();
  rows.forEach((row, index) => {
    if (rowCorrect[index] !== true) return;
    const match = expected.findIndex((constraint, at) => !claimed.has(at) && modelingEntryCorrect(row, constraint));
    if (match >= 0) claimed.add(match);
  });
  const open = expected.map((constraint, at) => ({ constraint, at })).filter(({ at }) => !claimed.has(at));
  return rows.map((row, index) => {
    if (rowCorrect[index] !== false) return null;
    for (const { constraint, at } of open) {
      // The same line, if some symbol makes the row the grader's match.
      const relation = RELATIONS.find((candidate) => modelingEntryCorrect({ ...row, relation: candidate }, constraint));
      if (relation) return { kind: 'relation', expectedIndex: at, relation };
    }
    const canonical = modelingEntryToCanonical(row);
    const coefficientsFit = Boolean(canonical) && open.some(({ constraint }) => RELATIONS.some((candidate) => (
      equivalentLinearInequality({ ...canonical, C: 0, relation: candidate }, { ...constraint, C: 0 })
    )));
    return { kind: 'terms', coefficientsFit };
  });
};

/*
 * THE SITUATION'S OWN WORDS FOR A CONSTRAINT.
 *
 * The constant a constraint compares with is in the item's prompt ("AT LEAST
 * 20 points per game", "at most 20 hours", "His raft holds 800 pounds"). The
 * phrase is quoted only where the prompt says it and it means the
 * constraint's own symbol; otherwise the amount is named as the prompt writes
 * it ("800 pounds", "$50") without a quote it does not contain.
 */
const PHRASES = Object.freeze([
  // Longest first: "no more than 20" is not "more than 20".
  ['no more than', '<='], ['not more than', '<='], ['no greater than', '<='], ['a maximum of', '<='], ['at most', '<='], ['up to', '<='],
  ['no less than', '>='], ['not less than', '>='], ['no fewer than', '>='], ['a minimum of', '>='], ['at least', '>='],
  ['more than', '>'], ['greater than', '>'],
  ['less than', '<'], ['fewer than', '<'],
]);
const PHRASE_RELATION = Object.freeze(Object.fromEntries(PHRASES));
const NUMBER = '(\\$)?(\\d[\\d,]*(?:\\.\\d+)?)';
const PHRASE_PATTERN = new RegExp(`\\b(${PHRASES.map(([words]) => words.replace(/ /g, '\\s+')).join('|')})\\s+${NUMBER}`, 'gi');
const AMOUNT_PATTERN = new RegExp(`(?<![\\w.])${NUMBER}`, 'g');
// A unit after the number is a plain plural word: points, pounds, hours, minutes.
const NOT_UNITS = new Set(['less', 'this', 'has', 'was', 'does', 'its', 'plus', 'minus', 'across', 'unless', 'yes', 'thus', 'is', 'as']);
const unitAfter = (text) => {
  const word = /^\s+([a-z]+)/.exec(text)?.[1] || '';
  return /^[a-z]{3,}s$/.test(word) && !NOT_UNITS.has(word) ? word : '';
};
const sameNumber = (written, value) => {
  const number = Number(String(written).replace(/,/g, ''));
  return Number.isFinite(number) && Math.abs(number - value) <= 1e-9 * Math.max(1, Math.abs(value));
};
const situationText = (question = {}) => [question?.prompt, question?.scenario, question?.context?.scenario]
  .filter((value) => typeof value === 'string' && value.trim())
  .join(' ')
  // A point such as (40, 20) names coordinates, never a constraint's amount.
  .replace(/\(\s*[-−]?\d[\d.,]*\s*,\s*[-−]?\d[\d.,]*\s*\)/g, ' ');
const numberText = (value) => String(Number(Number(value).toFixed(6))).replace('-', '−');
const sentenceCase = (text) => {
  const lower = text.replace(/\s+/g, ' ').toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
};

/**
 * The constraint as the situation reads it: A·x + B·y (relation) c with the
 * coefficients the right way round, whichever way the item stored it.
 */
export const situationConstraint = (expected = {}) => {
  const A = Number(expected.A ?? 0);
  const B = Number(expected.B ?? 0);
  const C = Number(expected.C ?? 0);
  const relation = RELATIONS.includes(expected.relation) ? expected.relation : '>=';
  const flipped = A <= 0 && B <= 0 && (A < 0 || B < 0);
  return flipped
    ? { A: -A, B: -B, constant: C, relation: FLIP[relation] }
    : { A, B, constant: -C, relation };
};

/**
 * { phrase, amount }: the prompt's phrase for this constraint ("At least 20
 * points"), or null; and its amount as the prompt writes it ("20 points",
 * "$50", "800 pounds"), or the bare number.
 */
export const situationWords = (question = {}, expected = {}) => {
  const { constant, relation } = situationConstraint(expected);
  const text = situationText(question);
  for (const match of text.matchAll(PHRASE_PATTERN)) {
    const [, words, dollar = '', written] = match;
    if (!sameNumber(written, constant)) continue;
    if (PHRASE_RELATION[words.replace(/\s+/g, ' ').toLowerCase()] !== relation) continue;
    const unit = unitAfter(text.slice(match.index + match[0].length));
    const amount = `${dollar}${written}${unit ? ` ${unit}` : ''}`;
    return { phrase: sentenceCase(`${words} ${amount}`), amount };
  }
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const [, dollar = '', written] = match;
    if (!sameNumber(written, constant)) continue;
    const unit = unitAfter(text.slice(match.index + match[0].length));
    return { phrase: null, amount: `${dollar}${written}${unit ? ` ${unit}` : ''}` };
  }
  return { phrase: null, amount: numberText(constant) };
};

const MEANING = Object.freeze({
  '>=': (amount) => `${amount} or more`,
  '<=': (amount) => `${amount} or less`,
  '>': (amount) => `more than ${amount}, not ${amount} itself`,
  '<': (amount) => `less than ${amount}, not ${amount} itself`,
});
const inclusive = (relation) => relation === '>=' || relation === '<=';
const sameDirection = (first, second) => String(first).charAt(0) === String(second).charAt(0);
// What the constant is compared with, where no phrase is quoted: a sum of
// costs, weights or points is "the total"; a difference is written out.
const situationSubject = (question, expected) => {
  const { A, B } = situationConstraint(expected);
  if (A >= 0 && B >= 0) return 'the total';
  const [first = { symbol: 'x' }, second = { symbol: 'y' }] = question?.modeling?.variables || [];
  const xTerm = linearTerm(A, first.symbol, true);
  return `${xTerm}${linearTerm(B, second.symbol, !xTerm)}`.trim();
};

/**
 * The line a wrong row is given. `diagnosis` is diagnoseModelRows' entry for
 * it, `row` the student's row, `expected` the constraint it was compared
 * with, `misses` how many times this row has been sent wrong, `label`
 * "Constraint 2: " in a system and '' for one constraint.
 */
export const modelRowMessage = ({ diagnosis, row = {}, question = {}, expected = {}, misses = 1, label = '' } = {}) => {
  if (!diagnosis) return null;
  if (diagnosis.kind === 'relation') {
    const { relation: situationRelation } = situationConstraint(expected);
    const { phrase, amount } = situationWords(question, expected);
    // ">" for "at least": the direction was right, the boundary is in.
    const boundaryOnly = sameDirection(row?.relation, diagnosis.relation) && inclusive(row?.relation) !== inclusive(diagnosis.relation);
    const meaning = `${MEANING[situationRelation](amount)}${boundaryOnly && inclusive(situationRelation) ? `, so exactly ${amount} counts too` : ''}`;
    const said = phrase ? `“${phrase}” means ${meaning}` : `In this situation ${situationSubject(question, expected)} must be ${meaning}`;
    // A row with every sign switched needs the situation's symbol turned round.
    return diagnosis.relation === situationRelation
      ? `${label}${said}: ${displayRelation(diagnosis.relation)}.`
      : `${label}${said}. Your row has every sign switched, so it needs ${displayRelation(diagnosis.relation)}.`;
  }
  // First miss neutral, a repeat narrows it (the mode's staged feedback).
  if (misses <= 1) return `${label}This does not match the situation yet. Check each coefficient and the constant.`;
  const [first = { symbol: 'x' }, second = { symbol: 'y' }] = question?.modeling?.variables || [];
  return diagnosis.coefficientsFit
    ? `${label}The ${first.symbol} and ${second.symbol} parts fit the situation, but the constant does not.`
    : `${label}Check the coefficients of ${first.symbol} and ${second.symbol} against the situation.`;
};
