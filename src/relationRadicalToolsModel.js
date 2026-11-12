/*
 * THE LOGIC BEHIND THE RADICAL / QUADRATIC TOOLS OF THE RELATION WORKSPACE.
 *
 * React-free so node tests certify exactly what the panels (RelationRadicalTools
 * .jsx) and MultiRelationAlgebraCore do with a student's input. Nothing here
 * decides whether a step is RIGHT: each builder turns what the student typed
 * into the next relation state and hands it to the workspace's own validated
 * commit (validateRelationTransition), which is also what the server runs.
 *
 *   raiseResult / factorResult / zeroProductResult   the next state, student-authored
 *   relationToolsFor                                  which tools a lesson turns on
 *   radicalCandidateList                              the candidates a solve reached, exactly
 *   readSolutionSetDraft / solutionSetReadable        the final answer a student records
 *
 * The tools are opt-in. A radical equation the lesson verifies turns on all
 * three; any other lesson names the ones it wants in `question.algebraTools`
 * (a standalone quadratic lesson asks for ["factor", "zeroProduct"]). No
 * absolute-value or inequality lesson gains a button it did not have.
 */
import {
  RADICAL_ALGEBRA_TOOLS,
  cloneRelationState,
  factorTargetOfBranch,
  normalizeRelationExpressionInput,
  raiseRadicalRelation,
  zeroProductFactors,
} from './algebraRelationFoundation.js';
import { radicalGradingContext, readExactValue } from '../functions/shared/serverGrading/stepAlgebraRadicalGrading.mjs';
import { rationalToNumber, rationalToText } from '../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';

/** The radical shape and its exact solution for the relation the workspace opened, or null. */
export const radicalContextOf = (pristine) => radicalGradingContext(pristine);

/** Which of the radical / quadratic tools this question turns on, in menu order. */
export const relationToolsFor = (question, pristine) => {
  const declared = new Set((Array.isArray(question?.algebraTools) ? question.algebraTools : []).map(String));
  if (radicalContextOf(pristine)) RADICAL_ALGEBRA_TOOLS.forEach((tool) => declared.add(tool.id));
  return RADICAL_ALGEBRA_TOOLS.filter((tool) => declared.has(tool.id));
};

const POWER_NAMES = Object.freeze({ 2: 'Square', 3: 'Cube', 4: '4th power', 5: '5th power' });
export const powerChoiceLabel = (power) => POWER_NAMES[power] || `Power ${power}`;

/*
 * A student writes x(x - 5) and 2x(x - 3): the variable straight before a
 * bracket is a PRODUCT on the board. The parser reads it as a call of a function
 * named x, which no relation holds (the grader notes the same hazard for its
 * own keys), so a correct factored form would be refused. Only the relation's
 * own variable is read as a factor, and only here, in these tools: the shared
 * normalizer is left alone so function notation elsewhere is not disturbed.
 */
export const withExplicitProducts = (raw, variable = 'x') => {
  const letter = /^[A-Za-z]$/.test(String(variable)) ? String(variable) : 'x';
  // The letter, not part of a longer name (a digit before it is a coefficient: 2x(x - 3)),
  // then a bracket — MathLive writes it x\left( — read as a factor.
  return String(raw ?? '').replace(new RegExp(`(?<![A-Za-z_\\\\])${letter}\\s*(?:\\\\left)?\\s*\\(`, 'g'), `${letter}*(`);
};

const readExpression = (raw, variable = 'x') => {
  try {
    return { ok: true, expression: normalizeRelationExpressionInput(withExplicitProducts(raw, variable)) };
  } catch (error) {
    return { ok: false, reason: error?.message || 'That expression could not be read.' };
  }
};

/**
 * "Raise both sides to the power n": the student types what each side becomes.
 * Ready only when the radical is isolated and n is its index; the commit then
 * judges the typed line (validateRelationTransition kind radicalRaise).
 */
export const raiseResult = ({ state, branchIndex = 0, power, left, right }) => {
  const expected = raiseRadicalRelation(state, branchIndex, power);
  if (!expected.ready) return { ready: false, reason: expected.reason };
  const first = readExpression(left, state?.variable);
  const second = readExpression(right, state?.variable);
  if (!first.ok || !second.ok) return { ready: false, reason: (first.ok ? second : first).reason };
  const next = cloneRelationState(state);
  next.branches[branchIndex] = { expressions: [first.expression, second.expression], relations: ['='] };
  const exponent = Number(power);
  return {
    ready: true,
    state: next,
    label: `Raise both sides to the power ${exponent}`,
    kind: 'radical-raise',
    transition: { kind: 'radicalRaise', branchIndex, power: exponent },
  };
};

export const FACTOR_NEEDS_ZERO = 'Write the equation with 0 on one side first (add or subtract to get there), then factor the other side.';

/** "Factor": the student types the product that replaces the polynomial next to the 0. */
export const factorResult = ({ state, branchIndex = 0, text }) => {
  const branch = state?.branches?.[branchIndex];
  const target = factorTargetOfBranch(branch, state?.variable || 'x');
  if (!target) return { ready: false, reason: FACTOR_NEEDS_ZERO };
  const read = readExpression(text, state?.variable);
  if (!read.ok) return { ready: false, reason: read.reason };
  const next = cloneRelationState(state);
  const expressions = [...branch.expressions];
  expressions[target.other] = read.expression;
  next.branches[branchIndex] = { expressions, relations: ['='] };
  return { ready: true, state: next, label: 'Factor', kind: 'factor', transition: { kind: 'factor', branchIndex } };
};

export const ZERO_PRODUCT_NEEDS_PRODUCT = 'The zero-product property needs a product of factors equal to 0. Factor first.';
export const MAX_ZERO_PRODUCT_ROWS = 4;

/**
 * "Zero-product property": each row the student writes becomes a branch; the
 * branches are joined by OR. How many rows, and what they are, is the
 * student's to decide — nothing is filled in.
 */
export const zeroProductResult = ({ state, branchIndex = 0, rows }) => {
  if (!zeroProductFactors(state, branchIndex)) return { ready: false, reason: ZERO_PRODUCT_NEEDS_PRODUCT };
  const written = (Array.isArray(rows) ? rows : []).slice(0, MAX_ZERO_PRODUCT_ROWS);
  if (!written.length) return { ready: false, reason: 'Write at least one equation.' };
  const branches = [];
  for (const row of written) {
    const left = readExpression(row?.left, state?.variable);
    const right = readExpression(row?.right, state?.variable);
    if (!left.ok || !right.ok) return { ready: false, reason: 'Fill in both sides of every equation you wrote.' };
    branches.push({ expressions: [left.expression, right.expression], relations: ['='] });
  }
  const next = cloneRelationState(state);
  next.branches.splice(branchIndex, 1, ...branches);
  next.connective = next.branches.length > 1 ? 'OR' : null;
  return {
    ready: true,
    state: next,
    label: 'Zero-product property',
    kind: 'zero-product',
    transition: { kind: 'zeroProduct', branchIndex },
  };
};

// --- Candidates and the final answer ----------------------------------------------------

/**
 * The candidates a solve reached, as exact numbers: [{ key, expression, value, exact }].
 * `key` is the candidate's value in lowest terms ("1/4"), which is how its
 * check is stored — so 0.25 and 1/4 are one candidate, one check. A relation
 * whose values are not all exact numbers has no readable candidates.
 */
export const radicalCandidateList = (summary) => {
  if (summary?.kind !== 'values') return [];
  const list = [];
  for (const expression of summary.valueExpressions || []) {
    const exact = readExactValue(expression);
    if (!exact) return [];
    const key = rationalToText(exact);
    if (!list.some((entry) => entry.key === key)) list.push({ key, expression, value: rationalToNumber(exact), exact });
  }
  return list;
};

/** A recorded check carries a decision and both substituted values. */
export const isRecordedCheck = (entry) => Boolean(entry)
  && typeof entry === 'object'
  && (entry.choice === 'valid' || entry.choice === 'extraneous')
  && typeof entry.left === 'string' && entry.left.trim() !== ''
  && typeof entry.right === 'string' && entry.right.trim() !== '';

/** What a check's choice is, for an old string entry or a recorded one. */
export const checkChoiceOf = (entry) => (typeof entry === 'string' ? entry : entry?.choice || null);

const MAX_SET_VALUES = 4;

/** A saved solution set that can safely be drawn, or null. */
export const restorableSolutionSet = (saved) => {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  if (saved.none === true) return { none: true, values: [] };
  if (!Array.isArray(saved.values)) return null;
  const values = saved.values.filter((value) => typeof value === 'string' && value.trim() !== '').slice(0, MAX_SET_VALUES).map((value) => value.slice(0, 80));
  return values.length ? { none: false, values } : null;
};

export const SOLUTION_SET_UNREADABLE = 'Enter each solution as a number, like 5, 1/4 or 0.25.';

/**
 * The solution set a student has typed, ready to record: { ok, set } or
 * { ok: false, reason }. "No real solution" and a list of values are exclusive.
 */
export const readSolutionSetDraft = ({ none = false, values = [] }) => {
  if (none) return { ok: true, set: { none: true, values: [] } };
  const entries = (Array.isArray(values) ? values : []).map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean);
  if (!entries.length) return { ok: false, reason: 'Write each solution, or choose No real solution.' };
  if (!entries.every((entry) => readExactValue(entry) !== null)) return { ok: false, reason: SOLUTION_SET_UNREADABLE };
  return { ok: true, set: { none: false, values: entries.slice(0, MAX_SET_VALUES) } };
};

export const CHECK_VALUE_UNREADABLE = 'Enter each side as a number, like 4, 1/2 or -0.5.';

/** A candidate's check, as the student typed it, ready to record: { ok, entry } or { ok: false, reason }. */
export const readCheckDraft = ({ left = '', right = '', choice = null }) => {
  const sides = [left, right].map((side) => (typeof side === 'string' ? side.trim() : ''));
  if (!sides[0] || !sides[1]) return { ok: false, reason: 'Substitute the value into both sides and enter what each side equals.' };
  // A value written with a root — sqrt(9) + 2 — is a value; the grader reads it.
  const unreadable = sides.some((side) => readExactValue(side) === null && !/\\sqrt|sqrt|cbrt|nthroot/i.test(side));
  if (unreadable) return { ok: false, reason: CHECK_VALUE_UNREADABLE };
  if (choice !== 'valid' && choice !== 'extraneous') return { ok: false, reason: 'Decide whether this value satisfies the original equation.' };
  return { ok: true, entry: { choice, left: sides[0].slice(0, 80), right: sides[1].slice(0, 80) } };
};
