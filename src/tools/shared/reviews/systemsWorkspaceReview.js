// Worked solution review for systemsWorkspace (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/systemsWorkspace/graphical.mjs and
// algebraic.mjs), mode by mode. The mode is the one the grader resolves —
// toolModeSupport over the tool's own declaration — so the review explains the
// screen the student actually had:
//
//   linear           the classification solveTwoLines gives and, for exactly
//                    one solution, the crossing point (0.05 per coordinate);
//   matrix           2×2: the classification solve2x2System gives and the
//                    solution, reached by row reduction;
//   matrix3          the RREF the matrix technology computes (solve3x3System),
//                    the classification read from it and the solution;
//   linearQuadratic  the count solveLinearQuadratic gives and its points (0.1);
//   inequalities     legacy construct / analyze: two points on each boundary
//                    y = mx + b, solid or dashed, above or below; whether the
//                    marked point is in the region; and a point of the
//                    student's own in it — open, so the criterion is stated
//                    with an example checked by the grader's own test.
//                    student build: the model, the rewrite, each boundary /
//                    line style / shading, the region's class, the marked
//                    point, an own point and every vertex, all against the
//                    working constraints the grader builds
//                    (studentBuildWorkingConstraints) and self-checked with
//                    the grader's per-constraint rule (studentBuildConstraintStatus);
//   algebraic        2×2 and 3×3, by the authored method (or a sensible choice
//                    under studentChoice): the values and the original-equation
//                    check; or, for a dependent / inconsistent system, the
//                    statement with no variable and its readings — and, 3×3,
//                    how each pair of planes meets (planeTruthFor);
//   spatial          the authored answer of every answer field.
//
// The algebra a student follows is derived here, step by step, and every
// result is cross-checked against the grader's own key (solveTwoLines,
// solve2x2System, solveAlgebraicSystem, reductionAnswerKey, …) before a review
// is returned. A derivation that does not land on the key returns null.
//
// NULL — NEVER A GUESS — when the mode's data is not authored (the screen would
// show a default system nobody wrote), when a value cannot be written exactly
// where the grader needs it exact, for a shape the screen cannot build (a 3×3
// elimination with no variable in all three equations, a boundary with no two
// grid points to tap), for a nonunique 3×3 outside the elimination workflow
// (the grader does not grade it), and for any malformed input.
import declaration from '../../../../functions/shared/serverGrading/declarations/systemsWorkspace.mjs';
import { toolModeSupport } from '../../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { solveTwoLines } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  SYSTEMS_WORKSPACE_DEFAULTS,
  evaluatePoint,
  inequalityRelationToken,
  matrix3x4Rows,
  normalizeLinearInequality,
  satisfiesLinearInequality,
  solve2x2System,
  solve3x3System,
  solveLinearQuadratic,
} from '../../../../functions/shared/toolMath/systemsWorkspace/systemsMath.mjs';
import {
  algebraicSystemDimension,
  classifyLinearSystem,
  equationMentionsVariable,
  evaluateEquationSides,
  linearEquationForm,
  noVariableStatementType,
  normalizeAlgebraicSystemConfig,
  solveAlgebraicSystem,
} from '../../../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import {
  buildReductionSystem,
  reductionAnswerKey,
  reductionValueMatches,
  verificationGivenSides,
} from '../../../../functions/shared/toolMath/systemsWorkspace/substitutionReduction.mjs';
import { STATEMENT_KINDS, SYSTEM_MEANINGS, planeTruthFor } from '../../../../functions/shared/toolMath/systemsWorkspace/algebraicOutcomeModel.mjs';
import { PLANE_RELATIONSHIP_OPTIONS, planePairs } from '../../../../functions/shared/toolMath/systemsWorkspace/spatialFeedback.mjs';
import {
  classifyFeasibleRegion,
  feasibleRegionVertices,
  modelingEntryCorrect,
  pointMembership,
  pointOnBoundaryIndex,
  sameGraphingConstraint,
  satisfiesBoundary,
  sideOfBoundaryLine,
  studentBuildConstraintStatus,
  studentBuildInequalityEnabled,
  studentBuildInequalityTask,
  studentBuildWorkingConstraints,
} from '../../../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { displayRelation, formatInequality, prettifyInequalityText } from '../../systemsWorkspace/inequalityFormat.js';

export const implemented = true;

const MINUS = '−';
const RELATIONS = new Set(['<', '<=', '>', '>=']);
const FLIP = Object.freeze({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' });
const MAX_STEPS = 12; // textOnlyReview keeps twelve; a longer review would lose its end.

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// A review that cannot be written exactly is not written at all: every helper
// that meets such a value throws this, and the builder returns null.
class Unwritable extends Error {}
const unwritable = () => {
  throw new Unwritable('This review cannot be written exactly.');
};

/* ------------------------------------------------------------------ numbers */

// Float noise around a whole number (or zero) is snapped away; anything else
// keeps its full precision, so a chain of row operations never drifts.
const clean = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return number;
  if (Math.abs(number) < 1e-9) return 0;
  const whole = Math.round(number);
  if (Math.abs(number - whole) <= 1e-9 * Math.max(1, Math.abs(number))) return whole === 0 ? 0 : whole;
  return number;
};
const signed = (text) => String(text).replace(/-/g, MINUS);
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

const fixedExactly = (value, places) => {
  const fixed = Number(value.toFixed(places));
  return near(fixed, value) ? clean(fixed) : null;
};

const fractionParts = (value, maxDenominator = 10000) => {
  const magnitude = Math.abs(value);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let rest = magnitude;
  for (let step = 0; step < 64; step += 1) {
    const whole = Math.floor(rest);
    const h2 = whole * h1 + h0;
    const k2 = whole * k1 + k0;
    if (k2 > maxDenominator) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (near(magnitude, h1 / k1)) return { numerator: (value < 0 ? -1 : 1) * h1, denominator: k1 };
    const fractional = rest - whole;
    if (fractional < 1e-12) break;
    rest = 1 / fractional;
  }
  return null;
};

/*
 * How a non-whole number is written. The graphical modes take decimals in
 * type="number" boxes, so 2.5 stays 2.5 there; the algebraic workspace solves
 * exactly (Step Algebra), so its reviews write 5/2. Set for the duration of
 * one synchronous build only (see buildSystemsWorkspaceReview), never kept.
 */
let fractionStyle = false;

/**
 * A number as a student writes it: 3, −1, 2.5, 13/7 — or null when no short
 * form is exact. `fractions` writes 2.5 as 5/2 (beside other fractions).
 */
const exactOrNull = (value, { fractions = fractionStyle } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const tidy = clean(number);
  if (Number.isInteger(tidy)) return signed(String(tidy));
  const short = fractions ? null : fixedExactly(tidy, 2);
  if (short !== null) return signed(String(short));
  const parts = fractionParts(tidy);
  if (parts) return signed(`${parts.numerator}/${parts.denominator}`);
  const longer = fixedExactly(tidy, 6);
  return longer === null ? null : signed(String(longer));
};
const exact = (value) => exactOrNull(value) ?? unwritable();
// A factor written after × or ÷: bracketed when negative, so "× (−3)", never "× −3".
const bracketed = (value) => (clean(value) < 0 ? `(${exact(value)})` : exact(value));
// The value the review states, as the number a student's exact entry is: a key
// rounded to 1e-9 (1.166666667) becomes the float of 7/6 again.
const stated = (value) => {
  const [numerator, denominator] = exact(value).replace(MINUS, '-').split('/');
  return denominator === undefined ? Number(numerator) : Number(numerator) / Number(denominator);
};
const approx = (value, places = 2) => signed(String(clean(Number(Number(value).toFixed(places)))));
// Display only: exact where it can be, otherwise marked as rounded.
const shown = (value) => exactOrNull(value) ?? `≈ ${approx(value)}`;
// What goes in a decimal box (type="number"): exact when it has at most four
// decimal places, otherwise rounded to two (inside every tolerance it is used with).
const typed = (value) => {
  const tidy = clean(value);
  const short = Number.isInteger(tidy) ? tidy : fixedExactly(tidy, 4);
  return short !== null ? { text: signed(String(short)), exact: true } : { text: approx(tidy), exact: false };
};
const typedPoint = (coordinates) => {
  const parts = coordinates.map(typed);
  const text = `(${parts.map((part) => part.text).join(', ')})`;
  return parts.every((part) => part.exact) ? text : `≈ ${text}`;
};
// A point, its coordinates written alike: (1/3, 1/2, 7/6), not (1/3, 0.5, 7/6).
const pointText = (coordinates) => {
  const plain = coordinates.map(exact);
  const fractions = plain.some((text) => text.includes('/'));
  return `(${(fractions ? coordinates.map((value) => exactOrNull(value, { fractions: true }) ?? exact(value)) : plain).join(', ')})`;
};
/**
 * A solution the student types into decimal boxes (type="number"): stated
 * exactly, plus the decimals to enter when a box cannot hold it exactly
 * ("(13/7, 33/7) ≈ (1.86, 4.71)"); rounded only when no exact form exists.
 */
const answerPoint = (values, tolerance, { exactKnown = values.every((value) => exactOrNull(value) !== null) } = {}) => {
  const entered = typedPoint(values);
  const rounded = entered.startsWith('≈');
  const decimals = entered.replace('≈ ', '');
  if (!exactKnown) {
    return { value: entered, entry: `${decimals} (rounded; within ${tolerance} is accepted)` };
  }
  const point = pointText(values);
  return rounded
    ? { value: `${point} ${entered}`, entry: `${decimals} (within ${tolerance} of ${point} is accepted)` }
    : { value: point, entry: point };
};
const yesNo = (value) => (value ? 'Yes' : 'No');

/* -------------------------------------------------------------- expressions */

const coefficientBody = (magnitude) => {
  const text = exact(magnitude);
  if (text === '1') return '';
  return text.includes('/') ? `(${text})` : text;
};
const joinTerm = (text, coefficient, body) => {
  if (!text) return coefficient < 0 ? `${MINUS}${body}` : body;
  return `${text} ${coefficient < 0 ? MINUS : '+'} ${body}`;
};

/**
 * Σ coefficient·name + constant as written by hand — "2x − y + 3",
 * "−(4/3)y − 25/3", "0" — with any `known` variable shown as its value in
 * brackets after its coefficient: "3(−7) + 4y".
 */
const expressionText = (terms, constant = 0, known = {}) => {
  let text = '';
  terms.forEach(([coefficient, name]) => {
    const value = clean(coefficient);
    if (value === 0) return;
    const body = own(known, name)
      ? `${coefficientBody(Math.abs(value))}(${exact(known[name])})`
      : `${coefficientBody(Math.abs(value))}${name}`;
    text = joinTerm(text, value, body);
  });
  const tail = clean(constant);
  if (tail === 0) return text || '0';
  return text ? joinTerm(text, tail, exact(Math.abs(tail))) : exact(tail);
};

/* ------------------------------------------------- linear forms (Σ a·v = c) */

const termsOf = (form, vars) => vars.map((name) => [form.coefficients[name] ?? 0, name]);
const formText = (form, vars) => `${expressionText(termsOf(form, vars))} = ${exact(form.constant)}`;
const knownFormText = (form, vars, known) => `${expressionText(termsOf(form, vars), 0, known)} = ${exact(form.constant)}`;
const nonzeroVariables = (form, vars) => vars.filter((name) => clean(form.coefficients[name] ?? 0) !== 0);
const coefficientOf = (form, name) => clean(form.coefficients[name] ?? 0);
const scaleForm = (form, factor, vars) => ({
  coefficients: Object.fromEntries(vars.map((name) => [name, clean((form.coefficients[name] ?? 0) * factor)])),
  constant: clean(form.constant * factor),
});
const combineForms = (first, second, operation, vars) => {
  const sign = operation === 'subtract' ? -1 : 1;
  return {
    coefficients: Object.fromEntries(vars.map((name) => [name, clean((first.coefficients[name] ?? 0) + sign * (second.coefficients[name] ?? 0))])),
    constant: clean(first.constant + sign * second.constant),
  };
};
const restrictForm = (form, vars) => ({
  coefficients: Object.fromEntries(vars.map((name) => [name, coefficientOf(form, name)])),
  constant: clean(form.constant),
});
const prettyEquation = (text) => prettifyInequalityText(text);
const listText = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** `coefficient·name = rhs`, solved: "x = 3" or "3x = −9, so x = −3". */
const solvedFor = (coefficient, name, rhs) => {
  const value = clean(rhs / coefficient);
  if (clean(coefficient) === 1) return { value, text: `${name} = ${exact(value)}` };
  return { value, text: `${expressionText([[coefficient, name]])} = ${exact(rhs)}, so ${name} = ${exact(value)}` };
};

/* ---------------------------------------------------------- elimination */

const isWhole = (value) => Math.abs(value - Math.round(value)) < 1e-9;
const gcd = (first, second) => {
  let [a, b] = [Math.abs(Math.round(first)), Math.abs(Math.round(second))];
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

/** One elimination: scale two equations so `variable` cancels, then add or subtract them. */
const eliminationRound = (formA, formB, variable, vars) => {
  const p = coefficientOf(formA, variable);
  const q = coefficientOf(formB, variable);
  if (p === 0 || q === 0) unwritable();
  const [a, b] = [Math.abs(p), Math.abs(q)];
  let [k1, k2] = [b, a];
  if (near(a, b)) [k1, k2] = [1, 1];
  else if (isWhole(a) && isWhole(b)) [k1, k2] = [b / gcd(a, b), a / gcd(a, b)];
  const operation = Math.sign(p) === Math.sign(q) ? 'subtract' : 'add';
  const scaledA = scaleForm(formA, k1, vars);
  const scaledB = scaleForm(formB, k2, vars);
  const combined = combineForms(scaledA, scaledB, operation, vars);
  if (coefficientOf(combined, variable) !== 0) unwritable();
  return { variable, k1: clean(k1), k2: clean(k2), operation, scaledA, scaledB, combined, cost: k1 + k2 };
};

const roundText = (round, [labelA, labelB], vars, resultName = '') => {
  const scaledName = (factor, label) => (factor === 1 ? label : `${exact(factor)} × ${label}`);
  const scaled = [
    round.k1 !== 1 ? `${exact(round.k1)} × ${labelA} is ${formText(round.scaledA, vars)}` : null,
    round.k2 !== 1 ? `${exact(round.k2)} × ${labelB} is ${formText(round.scaledB, vars)}` : null,
  ].filter(Boolean);
  const operation = `${scaledName(round.k1, labelA)} ${round.operation === 'add' ? '+' : MINUS} ${scaledName(round.k2, labelB)}`;
  return `To eliminate ${round.variable} from ${labelA} and ${labelB}, compute ${operation}${scaled.length ? ` (${scaled.join('; ')})` : ''}: ${formText(round.combined, vars)}${resultName ? ` — call it ${resultName}` : ''}.`;
};

/*
 * An equation in a derivation: its form (Σ a·v = c), its name and how it is
 * written on the student's screen. When the authored text is not already in
 * the standard form a step works with, the step says which form it uses.
 */
const equationOf = (form, label, written = null) => ({ form, label, written: written || null });
const squash = (text) => String(text).replace(/\s+/g, '');
const shownEquation = (equation, vars) => equation.written || formText(equation.form, vars);
const workedAs = (equation, vars) => (equation.written && squash(equation.written) !== squash(formText(equation.form, vars))
  ? `${equation.label} (written as ${formText(equation.form, vars)})`
  : equation.label);

/** Substitute known values into an equation and solve it for `name`. */
const backSubstitute = (equation, vars, name, known) => {
  const { form } = equation;
  const rest = vars.filter((other) => other !== name)
    .reduce((sum, other) => sum + coefficientOf(form, other) * (own(known, other) ? known[other] : 0), 0);
  const solved = solvedFor(coefficientOf(form, name), name, clean(form.constant - rest));
  const values = vars.filter((other) => other !== name && own(known, other)).map((other) => `${other} = ${exact(known[other])}`);
  return { value: solved.value, text: `Substitute ${listText(values)} into ${workedAs(equation, vars)}: ${knownFormText(form, vars, known)} gives ${solved.text}.` };
};

/* ------------------------------------------------------------- 2×2 solving */

const degenerateType = (form) => (clean(form.constant) === 0 ? 'infinite' : 'none');

const directTwoByTwo = (equations, vars, nonzero) => {
  const first = nonzero[0].length === 1 ? 0 : 1;
  const second = 1 - first;
  const name = nonzero[first][0];
  const other = vars.find((candidate) => candidate !== name);
  const source = equations[first];
  const coefficient = coefficientOf(source.form, name);
  const solved = solvedFor(coefficient, name, source.form.constant);
  const steps = [squash(shownEquation(source, vars)) === squash(`${name} = ${exact(solved.value)}`)
    ? `${source.label} already gives ${name} = ${exact(solved.value)}.`
    : `${source.label}, ${shownEquation(source, vars)}, has only ${name}: ${solved.text}.`];
  const target = equations[second];
  if (coefficientOf(target.form, other) === 0) unwritable();
  const back = backSubstitute(target, vars, other, { [name]: solved.value });
  steps.push(coefficientOf(target.form, name) === 0
    ? `${target.label}, ${shownEquation(target, vars)}, has only ${other}: ${solvedFor(coefficientOf(target.form, other), other, target.form.constant).text}.`
    : back.text);
  return { type: 'one', values: { [name]: solved.value, [other]: back.value }, steps };
};

const eliminationTwoByTwo = (equations, vars) => {
  const [first, second] = equations;
  const options = vars
    .filter((name) => coefficientOf(first.form, name) !== 0 && coefficientOf(second.form, name) !== 0)
    .map((name) => eliminationRound(first.form, second.form, name, vars))
    .sort((a, b) => a.cost - b.cost);
  if (!options.length) unwritable();
  const round = options[0];
  const other = vars.find((name) => name !== round.variable);
  const written = equations.filter((equation) => workedAs(equation, vars) !== equation.label);
  const steps = [
    ...(written.length ? [`In standard form: ${listText(written.map((equation) => `${equation.label} is ${formText(equation.form, vars)}`))}.`] : []),
    roundText(round, [first.label, second.label], vars),
  ];
  const remaining = coefficientOf(round.combined, other);
  if (remaining === 0) return { type: degenerateType(round.combined), statement: round.combined, steps };
  const solved = solvedFor(remaining, other, round.combined.constant);
  if (remaining !== 1) steps.push(`Solve: ${solved.text}.`);
  const back = backSubstitute(first, vars, round.variable, { [other]: solved.value });
  steps.push(back.text);
  return { type: 'one', values: { [other]: solved.value, [round.variable]: back.value }, steps };
};

const substitutionTwoByTwo = (equations, vars) => {
  const choices = [];
  equations.forEach((equation, index) => vars.forEach((name, position) => {
    const coefficient = coefficientOf(equation.form, name);
    if (coefficient === 0 || coefficientOf(equations[1 - index].form, name) === 0) return;
    choices.push({ index, name, rank: (Math.abs(coefficient) === 1 ? 0 : 10) + index * 2 + position });
  }));
  if (!choices.length) unwritable();
  const { index, name } = choices.sort((a, b) => a.rank - b.rank)[0];
  const source = equations[index];
  const target = equations[1 - index];
  const other = vars.find((candidate) => candidate !== name);
  const coefficient = coefficientOf(source.form, name);
  const slope = clean(-coefficientOf(source.form, other) / coefficient);
  const intercept = clean(source.form.constant / coefficient);
  const isolated = expressionText([[slope, other]], intercept);
  const steps = [squash(shownEquation(source, vars)) === squash(`${name} = ${isolated}`)
    ? `${source.label} already gives ${name} = ${isolated}.`
    : `Solve ${source.label} for ${name}: ${shownEquation(source, vars)} gives ${name} = ${isolated}.`];

  // The target (in standard form) with the isolated expression in place of `name`.
  let substituted = '';
  vars.forEach((variable) => {
    const value = coefficientOf(target.form, variable);
    if (value === 0) return;
    const body = variable === name ? `${coefficientBody(Math.abs(value))}(${isolated})` : `${coefficientBody(Math.abs(value))}${variable}`;
    substituted = joinTerm(substituted, value, body);
  });
  const combined = clean(coefficientOf(target.form, name) * slope + coefficientOf(target.form, other));
  const shift = clean(coefficientOf(target.form, name) * intercept);
  const into = `Substitute it into ${workedAs(target, vars)}: ${substituted} = ${exact(target.form.constant)}.`;
  if (combined === 0) {
    const constant = clean(target.form.constant - shift);
    steps.push(`${into} Simplify: no variable is left, only ${exact(shift)} = ${exact(target.form.constant)} — the statement 0 = ${exact(constant)}.`);
    return { type: constant === 0 ? 'infinite' : 'none', statement: { coefficients: Object.fromEntries(vars.map((variable) => [variable, 0])), constant }, steps };
  }
  const solved = solvedFor(combined, other, clean(target.form.constant - shift));
  steps.push(`${into} Simplify: ${expressionText([[combined, other]], shift)} = ${exact(target.form.constant)} gives ${solved.text}.`);
  const value = clean(slope * solved.value + intercept);
  steps.push(`Substitute ${other} = ${exact(solved.value)} into ${name} = ${isolated}: ${name} = ${expressionText([[slope, other]], intercept, { [other]: solved.value })} = ${exact(value)}.`);
  return { type: 'one', values: { [other]: solved.value, [name]: value }, steps };
};

/**
 * A 2×2 system, solved the way the workspace's 2×2 does it:
 * { type: 'one', values } or { type: 'infinite' | 'none', statement }, with the
 * steps a student follows. An equation in one variable is solved as it stands.
 */
const solveTwoByTwo = (equations, vars, method) => {
  const nonzero = equations.map((equation) => nonzeroVariables(equation.form, vars));
  if (nonzero.some((list) => !list.length)) unwritable();
  const sameSingle = nonzero[0].length === 1 && nonzero[1].length === 1 && nonzero[0][0] === nonzero[1][0];
  if (!sameSingle && (nonzero[0].length === 1 || nonzero[1].length === 1)) return directTwoByTwo(equations, vars, nonzero);
  return method === 'substitution' ? substitutionTwoByTwo(equations, vars) : eliminationTwoByTwo(equations, vars);
};

const hasUnitCoefficient = (forms, vars) => forms.some((form) => vars.some((name) => Math.abs(coefficientOf(form, name)) === 1));

/* -------------------------------------------------- checking a solution */

// One side of an authored equation with the values in place: "3(−7) + 4(−1)",
// or null when the side is already a number.
const sideWork = (side, vars, values) => {
  const form = linearEquationForm(`${side} = 0`, vars);
  if (!form) unwritable();
  const present = nonzeroVariables(form, vars);
  // A side that is a number, or a bare variable, is simply its value.
  if (!present.length || (present.length === 1 && coefficientOf(form, present[0]) === 1 && clean(form.constant) === 0)) return null;
  return expressionText(termsOf(form, vars), clean(-form.constant), values);
};

const equationSides = (text, vars, values) => {
  const parts = String(text).split('=');
  if (parts.length !== 2) unwritable();
  const sides = evaluateEquationSides(text, values);
  // The two sides agree as the grader requires (within 1e-6), or the review is not written.
  if (![sides.left, sides.right].every(Number.isFinite) || Math.abs(sides.left - sides.right) >= 1e-6) unwritable();
  return {
    left: clean(sides.left),
    right: clean(sides.right),
    leftWork: sideWork(parts[0], vars, values),
    rightWork: sideWork(parts[1], vars, values),
  };
};

const sideSentence = (work, value) => (work ? `${work} = ${exact(value)}` : exact(value));

const checkSentence = (label, text, sides) => (
  `Check ${label}, ${prettyEquation(text)}: the left side is ${sideSentence(sides.leftWork, sides.left)} and the right side is ${sideSentence(sides.rightWork, sides.right)} — both ${exact(sides.left)}.`
);

/* ------------------------------------------------------------------ linear */

const lineText = (m, b) => `y = ${expressionText([[m, 'x']], b)}`;

const linearReview = (question) => {
  const system = question.system;
  if (!isRecord(system)) return null;
  const [m1, b1, m2, b2] = ['m1', 'b1', 'm2', 'b2'].map((key) => Number(system[key]));
  if (![m1, b1, m2, b2].every(Number.isFinite)) return null;
  const solution = solveTwoLines(system);
  const first = lineText(m1, b1);
  const second = lineText(m2, b2);
  const intro = `Equation 1 is ${first} (slope ${exact(m1)}, y-intercept ${exact(b1)}) and Equation 2 is ${second} (slope ${exact(m2)}, y-intercept ${exact(b2)}).`;
  if (solution.type === 'none' || solution.type === 'infinite') {
    const none = solution.type === 'none';
    // The sentences below name equal slopes (and, for one line, equal intercepts) exactly.
    if (clean(m1 - m2) !== 0 || (clean(b1 - b2) === 0) === none) return null;
    return {
      title: 'Linear-system solution',
      items: [{ label: 'Number of solutions', value: none ? 'No solution' : 'Infinitely many solutions' }],
      steps: [
        intro,
        none
          ? `The slopes are equal (${exact(m1)}) but the y-intercepts are different (${exact(b1)} and ${exact(b2)}), so the lines are parallel and never meet.`
          : `The slopes are equal (${exact(m1)}) and so are the y-intercepts (${exact(b1)}), so both equations describe the same line.`,
        none
          ? 'No point lies on both lines, so the system has no solution.'
          : 'Every point on that line satisfies both equations, so the system has infinitely many solutions.',
      ],
      why: none
        ? `Setting the right sides equal gives ${expressionText([[m1, 'x']], b1)} = ${expressionText([[m2, 'x']], b2)}; the x-terms cancel and leave ${exact(b1)} = ${exact(b2)}, which is false for every x.`
        : `Setting the right sides equal gives ${expressionText([[m1, 'x']], b1)} = ${expressionText([[m2, 'x']], b2)}, which is true for every x.`,
      note: null,
    };
  }
  if (solution.type !== 'one' || ![solution.x, solution.y].every(Number.isFinite)) return null;
  const { x, y } = solution;
  const slopeDifference = clean(m1 - m2);
  const constantDifference = clean(b2 - b1);
  const point = pointText([x, y]);
  const answer = answerPoint([x, y], 0.05);
  return {
    title: 'Linear-system solution',
    items: [
      { label: 'Number of solutions', value: 'Exactly one solution' },
      { label: 'Intersection point', value: answer.value },
    ],
    steps: [
      intro,
      `The slopes are different, so the lines cross exactly once: the system has exactly one solution.`,
      `At the crossing point both right sides are equal: ${expressionText([[m1, 'x']], b1)} = ${expressionText([[m2, 'x']], b2)}.`,
      `Collect the x-terms on one side: ${solvedFor(slopeDifference, 'x', constantDifference).text}.`,
      `Substitute x = ${exact(x)} into Equation 1: y = ${expressionText([[m1, 'x']], b1, { x })} = ${exact(y)}.`,
      `Choose "Exactly one solution" and enter the point ${answer.entry}.`,
    ],
    why: `${point} is on both lines: Equation 2 gives ${expressionText([[m2, 'x']], b2, { x })} = ${exact(m2 * x + b2)}, the same y.`,
    note: null,
  };
};

/* ------------------------------------------------------------------ matrix */

const SOLUTION_TYPE_LABELS = Object.freeze({ one: 'Exactly one solution', none: 'No solution', infinite: 'Infinitely many solutions' });
const rowText = (row) => `[${row.slice(0, -1).map(exact).join(' ')} | ${exact(row[row.length - 1])}]`;
const shownRowText = (row) => `[${row.slice(0, -1).map(shown).join(' ')} | ${shown(row[row.length - 1])}]`;
const rowForm = (row, vars) => ({ coefficients: Object.fromEntries(vars.map((name, index) => [name, clean(row[index])])), constant: clean(row[vars.length]) });

const matrixTwoReview = (question) => {
  const source = question.matrix;
  const keys = ['a11', 'a12', 'b1', 'a21', 'a22', 'b2'];
  if (!keys.every((key) => source[key] !== undefined && source[key] !== null && source[key] !== '' && Number.isFinite(Number(source[key])))) return null;
  const solution = solve2x2System(source);
  const vars = ['x', 'y'];
  let rows = [[source.a11, source.a12, source.b1], [source.a21, source.a22, source.b2]].map((row) => row.map((value) => clean(Number(value))));
  const steps = [`The augmented matrix ${rowText(rows[0])}, ${rowText(rows[1])} stands for ${formText(rowForm(rows[0], vars), vars)} and ${formText(rowForm(rows[1], vars), vars)}.`];
  if (rows[0][0] === 0) {
    if (rows[1][0] === 0) return null;
    rows = [rows[1], rows[0]];
    steps.push(`Swap the rows so the first row starts with a nonzero entry: ${rowText(rows[0])}, ${rowText(rows[1])}.`);
  }
  if (rows[0][0] !== 1) {
    const pivot = rows[0][0];
    rows[0] = rows[0].map((value) => clean(value / pivot));
    steps.push(`Divide row 1 by ${exact(pivot)}: ${rowText(rows[0])}.`);
  }
  if (rows[1][0] !== 0) {
    const factor = rows[1][0];
    rows[1] = rows[1].map((value, index) => clean(value - factor * rows[0][index]));
    steps.push(`Replace row 2 with row 2 ${MINUS} ${factor < 0 ? `(${exact(factor)})` : exact(factor)} × row 1: ${rowText(rows[1])}.`);
  }
  const items = [];
  let type;
  if (rows[1][1] === 0) {
    type = rows[1][2] === 0 ? 'infinite' : 'none';
    steps.push(type === 'none'
      ? `Row 2 now says 0 = ${exact(rows[1][2])}, which is never true, so the system has no solution.`
      : 'Row 2 now says 0 = 0, which is always true: only one real equation is left, so y is free and the system has infinitely many solutions.');
    if (type !== solution.type) return null;
    items.push({ label: 'Number of solutions', value: SOLUTION_TYPE_LABELS[type] });
    return {
      title: 'Matrix-system solution',
      items,
      steps,
      why: type === 'none'
        ? 'Row operations never change a system\'s solutions, and a row [0 0 | c] with c ≠ 0 is an equation no x and y can satisfy.'
        : 'Row operations never change a system\'s solutions; a row of zeros means one equation was a multiple of the other.',
      note: null,
    };
  }
  if (rows[1][1] !== 1) {
    const pivot = rows[1][1];
    rows[1] = rows[1].map((value) => clean(value / pivot));
    steps.push(`Divide row 2 by ${exact(pivot)}: ${rowText(rows[1])}.`);
  }
  if (rows[0][1] !== 0) {
    const factor = rows[0][1];
    rows[0] = rows[0].map((value, index) => clean(value - factor * rows[1][index]));
    steps.push(`Replace row 1 with row 1 ${MINUS} ${factor < 0 ? `(${exact(factor)})` : exact(factor)} × row 2: ${rowText(rows[0])}.`);
  }
  const [x, y] = [rows[0][2], rows[1][2]];
  if (solution.type !== 'one' || !near(x, solution.x) || !near(y, solution.y)) return null;
  const answer = answerPoint([x, y], 0.05);
  steps.push(`The reduced matrix ${rowText(rows[0])}, ${rowText(rows[1])} reads x = ${exact(x)} and y = ${exact(y)}: exactly one solution.`);
  steps.push(`Choose "Exactly one solution" and enter ${answer.entry}.`);
  return {
    title: 'Matrix-system solution',
    items: [
      { label: 'Number of solutions', value: SOLUTION_TYPE_LABELS.one },
      { label: 'Solution', value: answer.value },
    ],
    steps,
    why: `Check in the original equations: ${knownFormText(rowForm([source.a11, source.a12, source.b1].map(Number), vars), vars, { x, y })} and ${knownFormText(rowForm([source.a21, source.a22, source.b2].map(Number), vars), vars, { x, y })} — both true.`,
    note: null,
  };
};

const matrixThreeReview = (question, source) => {
  const rows = matrix3x4Rows(source);
  if (!rows) return null;
  const solution = solve3x3System(source);
  if (!solution.type || !Array.isArray(solution.rref) || solution.rref.length !== 3) return null;
  const vars = ['x', 'y', 'z'];
  const rref = solution.rref;
  const steps = [
    `The augmented matrix's rows stand for ${listText(rows.map((row) => formText(rowForm(row, vars), vars)))}.`,
    `Use the matrix technology (Compute RREF). The RREF is ${rref.map(shownRowText).join(', ')}.`,
  ];
  const items = [{ label: 'RREF (matrix technology)', value: rref.map(shownRowText).join(', ') }];
  if (solution.type === 'one') {
    const values = [solution.x, solution.y, solution.z];
    if (!values.every(Number.isFinite)) return null;
    const answer = answerPoint(values, 0.05);
    steps.push(`The coefficient columns are the identity, so each row reads off one variable: x = ${shown(values[0])}, y = ${shown(values[1])}, z = ${shown(values[2])} — exactly one solution.`);
    items.push(
      { label: 'Number of solutions', value: SOLUTION_TYPE_LABELS.one },
      { label: 'Solution', value: answer.value },
    );
    const checks = rows.map((row) => {
      const known = { x: values[0], y: values[1], z: values[2] };
      return values.every((value) => exactOrNull(value) !== null) ? knownFormText(rowForm(row, vars), vars, known) : null;
    });
    return {
      title: 'Matrix-technology solution',
      items,
      steps: [...steps, `Choose "Exactly one solution" and enter (x, y, z) = ${answer.entry}.`],
      why: checks.every(Boolean)
        ? `Check in the original rows: ${checks.join('; ')} — all true.`
        : 'Row reduction never changes a system\'s solutions, and the identity on the left leaves one value for each variable.',
      note: null,
    };
  }
  if (solution.type === 'none') {
    const index = rref.findIndex((row) => row.slice(0, 3).every((value) => clean(value) === 0) && clean(row[3]) !== 0);
    if (index < 0) return null;
    steps.push(`Row ${index + 1} is [0 0 0 | ${shown(rref[index][3])}], which says 0 = ${shown(rref[index][3])} — impossible — so the system has no solution.`);
  } else {
    steps.push('A row is all zeros and no row says 0 = a nonzero number: there are fewer than three pivots, so a variable is free and the system has infinitely many solutions.');
  }
  items.push({ label: 'Number of solutions', value: SOLUTION_TYPE_LABELS[solution.type] });
  return {
    title: 'Matrix-technology solution',
    items,
    steps: [...steps, `Choose "${SOLUTION_TYPE_LABELS[solution.type]}".`],
    why: solution.type === 'none'
      ? 'Row reduction never changes a system\'s solutions, and no x, y and z make 0 equal a nonzero number.'
      : 'Row reduction never changes a system\'s solutions; with a free variable, every value of it gives another solution.',
    note: null,
  };
};

const matrixReview = (question) => {
  const source = question.matrix;
  if (!isRecord(source)) return null;
  // The 3×3 view is chosen exactly as the grader (and MatrixMode) choose it.
  const isMatrix3 = question.mode === 'matrix3' || Boolean(matrix3x4Rows(source));
  return isMatrix3 ? matrixThreeReview(question, source) : matrixTwoReview(question);
};

/* --------------------------------------------------------- linearQuadratic */

const linearQuadraticReview = (question) => {
  const config = question.linearQuadratic;
  if (!isRecord(config) || !isRecord(config.line) || !isRecord(config.quadratic)) return null;
  const m = Number(config.line.m ?? 0);
  const k = Number(config.line.b ?? 0);
  const a = Number(config.quadratic.a ?? 1);
  const qb = Number(config.quadratic.b ?? 0);
  const qc = Number(config.quadratic.c ?? 0);
  if (![m, k, a, qb, qc].every(Number.isFinite) || clean(a) === 0) return null;
  const points = solveLinearQuadratic(config);
  const [A, B, C] = [clean(a), clean(qb - m), clean(qc - k)];
  const discriminant = clean(B * B - 4 * A * C);
  const expected = discriminant > 1e-9 ? 2 : Math.abs(discriminant) <= 1e-9 ? 1 : 0;
  if (expected !== points.length) return null;
  const parabola = expressionText([[a, 'x²'], [qb, 'x']], qc);
  const line = expressionText([[m, 'x']], k);
  const paren = (value) => `(${exact(value)})`;
  // Written like the coefficients it comes from: beside decimals, a decimal
  // (−10.2975, not −4119/400) whenever one of at most six places is exact.
  const decimalCoefficients = [A, B, C].every((value) => !exact(value).includes('/'));
  const discriminantDecimal = decimalCoefficients ? fixedExactly(discriminant, 6) : null;
  const discriminantText = discriminantDecimal === null ? exact(discriminant) : signed(String(discriminantDecimal));
  const steps = [
    `At an intersection the parabola and the line have the same y: ${parabola} = ${line}.`,
    `Move every term to one side: ${expressionText([[A, 'x²'], [B, 'x']], C)} = 0.`,
    `The discriminant is ${paren(B)}² ${MINUS} 4${paren(A)}${paren(C)} = ${discriminantText}, which is ${points.length === 2 ? 'positive, so the line crosses the parabola twice' : points.length === 1 ? 'zero, so the line touches the parabola once' : 'negative, so the line never meets the parabola'}.`,
  ];
  const items = [{ label: 'Number of intersections', value: String(points.length) }];
  if (!points.length) {
    return {
      title: 'Line-and-parabola solution',
      items,
      steps: [...steps, 'Choose 0 intersections.'],
      why: 'A negative discriminant means the quadratic has no real roots: no x makes the two y-values equal.',
      note: null,
    };
  }
  // The points are rational exactly when the discriminant is the square of a
  // rational — decided from the discriminant itself, never by matching a float
  // of an irrational root to a nearby fraction.
  const root = Math.sqrt(Math.max(0, discriminant));
  const rationalRoot = exactOrNull(root) !== null && Math.abs(stated(root) ** 2 - discriminant) <= 1e-12 * Math.max(1, Math.abs(discriminant));
  const allExact = (points.length === 1 || rationalRoot)
    && points.every((point) => exactOrNull(point.x) !== null && exactOrNull(point.y) !== null);
  const formula = points.length === 1
    ? `x = ${MINUS}${paren(B)} ÷ (2 × ${bracketed(A)}) = ${exact(points[0].x)}`
    : rationalRoot
      ? `x = (${exact(-B)} ± ${exact(root)}) ÷ ${bracketed(2 * A)}, so x = ${exact(points[0].x)} or x = ${exact(points[1].x)}`
      : `x = (${exact(-B)} ± √${discriminantText.includes('/') ? `(${discriminantText})` : discriminantText}) ÷ ${bracketed(2 * A)}, so x ≈ ${approx(points[0].x)} or x ≈ ${approx(points[1].x)}`;
  steps.push(`Solve with the quadratic formula: ${formula}.`);
  steps.push(`Find each y from the line y = ${line}: ${points.map((point) => (allExact ? `x = ${exact(point.x)} gives y = ${expressionText([[m, 'x']], k, { x: point.x })} = ${exact(point.y)}` : `x ≈ ${approx(point.x)} gives y ≈ ${approx(point.y)}`)).join('; ')}.`);
  const answers = points.map((point) => answerPoint([point.x, point.y], 0.1, { exactKnown: allExact }));
  steps.push(`Choose ${points.length} and enter ${points.length === 1 ? 'the point' : 'both points'}: ${answers.map((answer) => answer.entry).join(' and ')}.`);
  items.push({
    label: points.length === 1 ? 'Intersection point' : 'Intersection points',
    value: answers.map((answer) => answer.value).join(' and '),
  });
  // The parabola's y at a known x: "(3)² − 4".
  const parabolaAt = (x) => {
    let text = '';
    [[a, `(${exact(x)})²`], [qb, `(${exact(x)})`]].forEach(([coefficient, power]) => {
      const value = clean(coefficient);
      if (value !== 0) text = joinTerm(text, value, `${coefficientBody(Math.abs(value))}${power}`);
    });
    const tail = clean(qc);
    if (tail === 0) return text || '0';
    return text ? joinTerm(text, tail, exact(Math.abs(tail))) : exact(tail);
  };
  return {
    title: 'Line-and-parabola solution',
    items,
    steps,
    why: allExact
      ? `Each point is on both graphs: ${points.map((point) => `at x = ${exact(point.x)} the parabola gives ${parabolaAt(point.x)} = ${exact(point.y)}, the same y as the line`).join('; ')}.`
      : 'Each x solves the quadratic, so at that x the parabola and the line give the same y — that is what an intersection is.',
    note: null,
  };
};

/* ------------------------------------------------------ inequalities: text */

// A canonical constraint A·x + B·y + C (rel) 0 written for the student, with
// `names` as the two variables: y-form when y has a coefficient, else x-form.
const constraintParts = (constraint) => {
  const { A, B, C, relation } = normalizeLinearInequality(constraint);
  if (clean(B) !== 0) {
    return { kind: 'y', m: clean(-A / B), b: clean(-C / B), relation: B < 0 ? FLIP[relation] : relation };
  }
  return { kind: 'x', c: clean(-C / A), relation: A < 0 ? FLIP[relation] : relation };
};
const constraintText = (constraint, [X, Y]) => {
  const parts = constraintParts(constraint);
  return parts.kind === 'y'
    ? `${Y} ${displayRelation(parts.relation)} ${expressionText([[parts.m, X]], parts.b)}`
    : `${X} ${displayRelation(parts.relation)} ${exact(parts.c)}`;
};
const boundaryText = (constraint, [X, Y]) => {
  const parts = constraintParts(constraint);
  return parts.kind === 'y' ? `${Y} = ${expressionText([[parts.m, X]], parts.b)}` : `${X} = ${exact(parts.c)}`;
};
// "4 ≥ 2(2) + 1 = 5 is true" — the point checked in one constraint, with the
// verdict the grader's own membership test gives.
const pointCheckText = (constraint, [X], [px, py], holds) => {
  const parts = constraintParts(constraint);
  if (parts.kind === 'x') return `${exact(px)} ${displayRelation(parts.relation)} ${exact(parts.c)} is ${holds ? 'true' : 'false'}`;
  const right = expressionText([[parts.m, X]], parts.b, { [X]: px });
  const value = clean(parts.m * px + parts.b);
  return `${exact(py)} ${displayRelation(parts.relation)} ${right}${parts.m !== 0 ? ` = ${exact(value)}` : ''} is ${holds ? 'true' : 'false'}`;
};
const inclusionText = (relation) => (relation.includes('=')
  ? `${displayRelation(relation)} includes equality, so the line is solid`
  : `${displayRelation(relation)} is strict, so the line is dashed`);

const graphBounds = (graph, fallback) => {
  const source = isRecord(graph) ? graph : {};
  const bounds = Object.fromEntries(['xMin', 'xMax', 'yMin', 'yMax'].map((key) => [key, Number(source[key] ?? fallback[key])]));
  if (!Object.values(bounds).every(Number.isFinite) || bounds.xMin >= bounds.xMax || bounds.yMin >= bounds.yMax) unwritable();
  return bounds;
};
// The whole numbers in [min, max] — at most `limit` of them, nearest 0 (or the
// end nearest 0), so an enormous authored graph cannot make a search unbounded.
const integersIn = (min, max, limit = 201) => {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (!(high >= low)) return [];
  const centre = Math.min(Math.max(0, low), high);
  const values = [];
  for (let offset = 0; values.length < limit && (centre - offset >= low || centre + offset <= high); offset += 1) {
    if (centre + offset <= high) values.push(centre + offset);
    if (offset && centre - offset >= low && values.length < limit) values.push(centre - offset);
  }
  return values.sort((a, b) => a - b);
};
// The grid points of the graph (the plane snaps a tap to whole numbers).
const latticePoints = (bounds) => {
  const ys = integersIn(bounds.yMin, bounds.yMax);
  return integersIn(bounds.xMin, bounds.xMax).flatMap((x) => ys.map((y) => [x, y]));
};
const byDistanceTo = ([cx, cy]) => (p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy);
const distanceToLine = (constraint, [x, y]) => {
  const { A, B, C } = normalizeLinearInequality(constraint);
  return Math.abs(A * x + B * y + C) / Math.hypot(A, B);
};

/* ------------------------------------------- inequalities: legacy (m, b) */

const legacyInequalitiesReview = (question) => {
  const authored = Array.isArray(question.inequalities) ? question.inequalities : [];
  if (!authored.length || authored.length > 6) return null;
  const lines = authored.map((inequality) => {
    if (!isRecord(inequality)) unwritable();
    // The construct check reads y = m·x + b; a standard-form constraint is
    // read differently by the membership test, so it is not explained here.
    if (['A', 'B', 'C'].some((key) => Number.isFinite(Number(inequality[key])))) unwritable();
    const m = Number(inequality.m);
    const b = Number(inequality.b);
    const relation = inequalityRelationToken(inequality.relation);
    if (!Number.isFinite(m) || !Number.isFinite(b) || !RELATIONS.has(relation)) unwritable();
    return { m: clean(m), b: clean(b), relation, inequality, label: formatInequality(inequality) };
  });
  const ask = Array.isArray(question.ask) && question.ask.length
    ? question.ask
    : question.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate'];
  const steps = [];
  const items = [];
  const notes = [];

  if (ask.includes('construction')) {
    lines.forEach((line, index) => {
      // Two x-values that give tidy y-values (a multiple of the slope's denominator).
      const candidates = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10, 12, -12];
      const tidyXs = candidates.filter((x) => typed(line.m * x + line.b).exact);
      const xs = tidyXs.length >= 2 ? tidyXs.slice(0, 2).sort((p, q) => p - q) : [0, 1];
      const points = xs.map((x) => [x, clean(line.m * x + line.b)]);
      const above = line.relation.includes('>');
      const pointsText = points.map((point) => typedPoint(point)).join(' and ');
      steps.push(`Inequality ${index + 1}, ${line.label}: its boundary is ${lineText(line.m, line.b)}; at x = ${exact(xs[0])} and x = ${exact(xs[1])} it passes through ${pointsText}. The symbol ${inclusionText(line.relation)}. The y-values that work are ${above ? 'greater' : 'less'} than the line's, so shade ${above ? 'above' : 'below'} the boundary.`);
      items.push(
        { label: `Inequality ${index + 1}: two boundary points`, value: pointsText },
        { label: `Inequality ${index + 1}: boundary style`, value: line.relation.includes('=') ? 'Solid' : 'Dashed' },
        { label: `Inequality ${index + 1}: shade`, value: above ? 'Above the boundary' : 'Below the boundary' },
      );
    });
    if (lines.length > 1) steps.push('The solution of the system is where every shaded side overlaps.');
    notes.push('Any two points on a boundary line are accepted.');
  }

  if (ask.includes('testPoint')) {
    const testPoint = question.testPoint || SYSTEMS_WORKSPACE_DEFAULTS.inequalityTestPoint;
    const point = [Number(testPoint?.x), Number(testPoint?.y)];
    if (!point.every(Number.isFinite)) unwritable();
    const holds = lines.map((line) => satisfiesLinearInequality(line.inequality, point[0], point[1]));
    const inRegion = holds.every(Boolean);
    const firstFailure = holds.findIndex((value) => !value);
    steps.push(`Test the marked point ${pointText(point)} in each inequality: ${lines.map((line, index) => `Inequality ${index + 1}: ${pointCheckText(line.inequality, ['x', 'y'], point, holds[index])}`).join('; ')}. ${inRegion ? 'It satisfies every inequality, so it is in the feasible region.' : `It fails inequality ${firstFailure + 1}, so it is not in the feasible region.`}`);
    items.push({ label: `Is the marked point ${pointText(point)} in the feasible region?`, value: yesNo(inRegion) });
  }

  if (ask.includes('candidate')) {
    const bounds = graphBounds(question.graph, SYSTEMS_WORKSPACE_DEFAULTS.inequalityGraph);
    const inside = latticePoints(bounds).filter(([x, y]) => lines.every((line) => evaluatePoint(line.inequality, x, y) === 'inside'));
    if (!inside.length) unwritable();
    // Nearest the origin, preferring a point clear of every boundary line.
    const clear = inside.filter((point) => lines.every((line) => distanceToLine(line.inequality, point) >= 0.5));
    const example = (clear.length ? clear : inside).sort(byDistanceTo([0, 0]))[0];
    if (!lines.every((line) => satisfiesLinearInequality(line.inequality, example[0], example[1]))) unwritable();
    steps.push(`For a point of your own, pick one inside the overlap, for example ${pointText(example)}: ${lines.map((line, index) => `Inequality ${index + 1}: ${pointCheckText(line.inequality, ['x', 'y'], example, true)}`).join('; ')}.`);
    items.push({ label: 'A point in the feasible region', value: `Any point that satisfies every inequality, for example ${pointText(example)}` });
    notes.push('Any point that makes every inequality true is accepted, not only the example.');
  }

  if (!steps.length) return null;
  return {
    title: 'Inequality-system solution',
    items,
    steps,
    why: 'A point is a solution of the system exactly when it makes every inequality true; the boundary belongs to the region only for ≤ or ≥.',
    note: notes.join(' ') || null,
  };
};

/* --------------------------------------- inequalities: student build */

const CLASSIFICATION_LABELS = Object.freeze({ bounded: 'Bounded region', unbounded: 'Unbounded region', empty: 'No solution' });

// Two grid points (the plane snaps taps to whole numbers) on a slanted boundary, inside the graph.
const gridPointsOn = (constraint, bounds) => {
  const { A, B, C } = normalizeLinearInequality(constraint);
  const points = [];
  integersIn(bounds.xMin, bounds.xMax).forEach((x) => {
    const y = clean((-C - A * x) / B);
    if (Number.isInteger(y) && y >= bounds.yMin && y <= bounds.yMax) points.push([x, y]);
  });
  if (points.length < 2) return null;
  // The y-intercept when it is a grid point (else the point nearest the
  // origin), and the next grid point along the line to its right.
  const first = points.find(([x]) => x === 0) || points.slice().sort(byDistanceTo([0, 0]))[0];
  const later = points.filter(([x]) => x > first[0]);
  const second = later.length ? later[0] : points.filter((point) => point !== first).sort(byDistanceTo(first))[0];
  return [first, second].sort((p, q) => p[0] - q[0]);
};

const emptyBuildEntry = () => ({
  method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
  point1Plotted: false, point2Plotted: false,
  boundaryAttempts: 1, style: '', styleAttempts: 1, shadePoint: null, shadeAttempts: 1, visible: true,
});

const studentBuildReview = (question) => {
  if (!(Array.isArray(question.inequalities) || Array.isArray(question.expectedConstraints) || isRecord(question.modeling))) return null;
  const task = studentBuildInequalityTask(question);
  const { buildConfig, modeling, expectedConstraints, constraintCount } = task;
  if (!constraintCount || constraintCount > 4) return null;
  const bounds = graphBounds(task.bounds, SYSTEMS_WORKSPACE_DEFAULTS.inequalityGraph);
  const names = modeling ? task.variables.slice(0, 2).map((variable) => String(variable?.symbol ?? '').trim()) : ['x', 'y'];
  if (names.length !== 2 || names.some((name) => !/^[A-Za-z]\w*$/.test(name)) || names[0] === names[1]) return null;
  expectedConstraints.forEach((constraint) => normalizeLinearInequality(constraint));
  const source = (index) => {
    const authored = task.sourceConstraints?.[index];
    return typeof authored === 'string' ? prettifyInequalityText(authored) : constraintText(expectedConstraints[index], names);
  };

  const steps = [];
  const items = [];

  // 1. The model: each expected constraint written as A·x + B·y (rel) −C.
  const modelingEntries = modeling ? expectedConstraints.map((constraint) => {
    if (!RELATIONS.has(constraint.relation)) unwritable();
    const entry = {
      coeffA: typed(constraint.A),
      coeffB: typed(constraint.B),
      relation: constraint.relation,
      constant: typed(-constraint.C),
    };
    if (![entry.coeffA, entry.coeffB, entry.constant].every((part) => part.exact)) unwritable();
    const row = { coeffA: entry.coeffA.text.replace(MINUS, '-'), coeffB: entry.coeffB.text.replace(MINUS, '-'), relation: entry.relation, constant: entry.constant.text.replace(MINUS, '-') };
    if (!modelingEntryCorrect(row, constraint)) unwritable();
    return row;
  }) : [];
  if (modeling) {
    const written = expectedConstraints.map((constraint) => `${expressionText([[constraint.A, names[0]], [constraint.B, names[1]]])} ${displayRelation(constraint.relation)} ${exact(-constraint.C)}`);
    const meanings = task.variables.slice(0, 2).map((variable, index) => (variable?.label && variable.label !== names[index] ? `${names[index]} = ${variable.label}` : null)).filter(Boolean);
    steps.push(`Write one inequality for each condition${meanings.length ? ` (${meanings.join(', ')})` : ''}: ${listText(written)}. Enter each one's coefficients, symbol and constant, then send your model.`);
    written.forEach((text, index) => items.push({ label: `Constraint ${index + 1} (model)`, value: text }));
  }

  // 2. The rewrite: y alone, in the graphing form the grader re-checks.
  const rewriteConstraints = buildConfig.rewrite ? expectedConstraints.map((constraint) => {
    const { A, B, C, relation } = normalizeLinearInequality(constraint);
    if (clean(B) === 0) unwritable();
    const form = { A: clean(A / B), B: 1, C: clean(C / B), relation: B < 0 ? FLIP[relation] : relation };
    if (!sameGraphingConstraint(form, constraint)) unwritable();
    return form;
  }) : [];
  if (buildConfig.rewrite) {
    const rewrites = rewriteConstraints.map((form, index) => {
      const { B } = normalizeLinearInequality(expectedConstraints[index]);
      return `${source(index)} becomes ${constraintText(form, names)}${B < 0 ? ` (dividing by ${exact(B)} reverses the symbol)` : ''}`;
    });
    steps.push(`Rewrite each constraint with ${names[1]} alone: ${listText(rewrites)}.`);
    rewriteConstraints.forEach((form, index) => items.push({ label: `Constraint ${index + 1} rewritten`, value: constraintText(form, names) }));
  }

  // The constraints the student builds and reasons against, as the grader forms them.
  const working = studentBuildWorkingConstraints({ task, modelingEntries, modelingSent: true, rewriteConstraints });
  if (working.length !== constraintCount || working.some((constraint) => !constraint)) return null;
  working.forEach((constraint) => normalizeLinearInequality(constraint));

  // 3. Each constraint's boundary, line style and shading.
  if (task.hasBuildSteps) {
    working.forEach((constraint, index) => {
      const parts = constraintParts(constraint);
      const entry = emptyBuildEntry();
      const sentence = [`Constraint ${index + 1}, ${constraintText(constraint, names)}:`];
      if (buildConfig.boundary) {
        const { A, B } = normalizeLinearInequality(constraint);
        if (clean(B) === 0 || clean(A) === 0) {
          const vertical = clean(B) === 0;
          const value = vertical ? parts.c : parts.b;
          const constant = typed(value);
          if (!constant.exact) unwritable();
          Object.assign(entry, { method: vertical ? 'vertical' : 'horizontal', constant: constant.text.replace(MINUS, '-') });
          sentence.push(`its boundary is the ${vertical ? 'vertical' : 'horizontal'} line ${boundaryText(constraint, names)} (build it as "${vertical ? 'Vertical line (x = c)' : 'Horizontal line (y = c)'}" with c = ${constant.text});`);
          items.push({ label: `Constraint ${index + 1}: boundary`, value: `${vertical ? 'Vertical' : 'Horizontal'} line ${boundaryText(constraint, names)}` });
        } else {
          const points = gridPointsOn(constraint, bounds);
          if (!points) unwritable();
          Object.assign(entry, { method: 'points', x1: points[0][0], y1: points[0][1], x2: points[1][0], y2: points[1][1], point1Plotted: true, point2Plotted: true });
          sentence.push(`plot two points on its boundary ${boundaryText(constraint, names)}, such as ${pointText(points[0])} and ${pointText(points[1])};`);
          items.push({ label: `Constraint ${index + 1}: boundary`, value: `${boundaryText(constraint, names)} through ${pointText(points[0])} and ${pointText(points[1])}` });
        }
      }
      if (buildConfig.lineStyle) {
        const solid = String(constraint.relation || '>=').includes('=');
        entry.style = solid ? 'solid' : 'dashed';
        sentence.push(`${inclusionText(parts.relation)};`);
        items.push({ label: `Constraint ${index + 1}: line`, value: solid ? 'Solid' : 'Dashed' });
      }
      if (buildConfig.shading) {
        const candidates = latticePoints(bounds)
          .filter(([x, y]) => sideOfBoundaryLine(constraint, x, y) !== 0 && satisfiesBoundary(constraint, x, y))
          .sort(byDistanceTo([0, 0]));
        if (!candidates.length) unwritable();
        const tap = candidates[0];
        entry.shadePoint = tap;
        const side = parts.kind === 'y'
          ? (parts.relation.includes('>') ? 'above' : 'below')
          : (parts.relation.includes('>') ? 'to the right of' : 'to the left of');
        sentence.push(`shade ${side} the line — tap a point there such as ${pointText(tap)}, since ${pointCheckText(constraint, names, tap, true)}.`);
        items.push({ label: `Constraint ${index + 1}: shading`, value: `${side[0].toUpperCase()}${side.slice(1)} the line, the side containing ${pointText(tap)}` });
      }
      // The grader's own per-constraint rule must call this work right.
      const status = studentBuildConstraintStatus({ buildConfig, entry, workingConstraint: constraint, bounds: task.bounds, rewriteVerified: true });
      if (!status.constraintCorrect) unwritable();
      // (A rewrite-only task has nothing to build here: the rewrite step said it all.)
      if (sentence.length > 1) steps.push(sentence.join(' ').replace(/;$/, '.'));
    });
  }

  // 4. The region: its class and its corners, from the working constraints.
  const classification = classifyFeasibleRegion(working);
  const vertices = feasibleRegionVertices(working);
  if (task.askClassification) {
    if (!CLASSIFICATION_LABELS[classification]) unwritable();
    steps.push(classification === 'empty'
      ? 'No point satisfies every constraint at once — the shaded sides never overlap — so the system has no solution.'
      : classification === 'bounded'
        ? `The shaded sides overlap in a region closed in on every side${vertices.length ? `, with corners ${listText(vertices.map((vertex) => typedPoint([vertex.x, vertex.y])))}` : ''}, so it is a bounded region.`
        : 'The shaded sides overlap in a region that keeps going without end in at least one direction, so it is an unbounded region.');
    items.push({ label: 'Solution region', value: CLASSIFICATION_LABELS[classification] });
  }

  // 5. The marked point, constraint by constraint.
  if (task.testPointReasoningEnabled && task.teacherTestPoint) {
    const point = [Number(task.teacherTestPoint.x), Number(task.teacherTestPoint.y)];
    if (!point.every(Number.isFinite)) unwritable();
    const membership = pointMembership(working, point);
    const inSystem = membership.every(Boolean);
    steps.push(`Test the marked point ${pointText(point)}: ${working.map((constraint, index) => `constraint ${index + 1}: ${pointCheckText(constraint, names, point, membership[index])}`).join('; ')}. ${inSystem ? 'It satisfies every constraint, so it is a solution of the system.' : 'It fails at least one constraint, so it is not a solution of the system.'}`);
    items.push(
      { label: `Marked point ${pointText(point)}: each inequality`, value: membership.map(yesNo).join(', ') },
      { label: `Marked point ${pointText(point)}: the whole system`, value: yesNo(inSystem) },
    );
    const boundaryIndex = pointOnBoundaryIndex(working, point);
    if (task.boundaryProbeEnabled && boundaryIndex >= 0) {
      // The grader treats a point within 0.12 of a boundary as on it; the
      // review says "on the boundary" only of a point that really is.
      if (distanceToLine(working[boundaryIndex], point) > 1e-9) unwritable();
      steps.push(`${pointText(point)} lies on the boundary of constraint ${boundaryIndex + 1}, and it is ${inSystem ? 'included in the solution region, because it satisfies every constraint' : 'not included in the solution region, because it fails a constraint'}.`);
      items.push(
        { label: `Marked point ${pointText(point)}: on a boundary line?`, value: 'Yes' },
        { label: `Marked point ${pointText(point)}: included in the region?`, value: yesNo(inSystem) },
      );
    }
  }

  // 6. A point of the student's own: open, so the criterion and a worked example.
  if (task.testPointReasoningEnabled && task.allowStudentTestPoint) {
    const grid = latticePoints(bounds);
    const inside = grid.filter(([x, y]) => working.every((constraint) => evaluatePoint(normalizeLinearInequality(constraint), x, y) === 'inside'));
    const example = (inside.length ? inside : grid.filter(([x, y]) => pointOnBoundaryIndex(working, [x, y]) < 0)).sort(byDistanceTo([0, 0]))[0];
    if (!example) unwritable();
    const membership = pointMembership(working, example);
    steps.push(`Test a point of your own the same way. Any point works, as long as each answer matches it — for example ${pointText(example)}: ${working.map((constraint, index) => `constraint ${index + 1}: ${pointCheckText(constraint, names, example, membership[index])}`).join('; ')}.`);
    items.push(
      { label: 'Your own test point (example)', value: pointText(example) },
      { label: 'Your point: each inequality', value: membership.map(yesNo).join(', ') },
      { label: 'Your point: the whole system', value: yesNo(membership.every(Boolean)) },
    );
  }

  // 7. Every corner, and whether it belongs to the solution.
  if (task.askVertices) {
    steps.push(vertices.length
      ? `Mark every corner of the region — where two boundaries meet on its edge — and decide whether it is included: ${listText(vertices.map((vertex) => `${typedPoint([vertex.x, vertex.y])} ${vertex.included ? 'is included (it satisfies every constraint)' : `is not included (${vertex.reason ? vertex.reason.replace(/\.$/, '').toLowerCase() : 'a boundary through it is dashed'})`}`))}.`
      : 'The region has no corners, so there is no vertex to mark.');
    items.push({ label: 'Vertices', value: vertices.length ? vertices.map((vertex) => `${typedPoint([vertex.x, vertex.y])} ${vertex.included ? 'included' : 'not included'}`).join('; ') : 'none' });
  }

  if (!steps.length || !items.length) return null;
  return {
    title: 'Inequality-system solution',
    items,
    steps,
    why: 'A point solves the system exactly when it satisfies every constraint, so the solution region is the overlap of the shaded sides; a boundary point belongs to it only where its line is solid.',
    note: [
      task.hasBuildSteps && buildConfig.boundary ? 'Any two points on a boundary line build it, and any point on the right side shades it.' : null,
      modeling ? 'An equivalent inequality (a multiple of it, in any order) is accepted.' : null,
    ].filter(Boolean).join(' ') || null,
  };
};

const inequalitiesReview = (question) => (
  studentBuildInequalityEnabled(question) ? studentBuildReview(question) : legacyInequalitiesReview(question)
);

/* --------------------------------------------------------------- algebraic */

const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const validVariables = (vars, count) => vars.length === count && new Set(vars).size === count && vars.every((name) => VARIABLE_NAME.test(name));
const equationLabel = (index) => `Equation ${index + 1}`;

const algebraicTwoReview = (question) => {
  if (!Array.isArray(question.equations) || question.equations.length !== 2) return null;
  const config = normalizeAlgebraicSystemConfig(question);
  const vars = config.variables;
  if (!validVariables(vars, 2) || !config.equations.every((text) => typeof text === 'string')) return null;
  const forms = config.forms;
  if (!forms.every(Boolean) || !config.coefficients?.every(Boolean)) return null;
  // The grader's key reads the {a, b, c} coefficients; the derivation reads the forms. They must agree.
  if (!config.coefficients.every((coefficients, index) => near(coefficients.a, forms[index].coefficients[vars[0]])
    && near(coefficients.b, forms[index].coefficients[vars[1]]) && near(coefficients.c, forms[index].constant))) return null;
  const key = solveAlgebraicSystem(config.coefficients);
  const method = config.method === 'studentChoice' ? (hasUnitCoefficient(forms, vars) ? 'substitution' : 'elimination') : config.method;
  const labels = [equationLabel(0), equationLabel(1)];
  const equations = forms.map((form, index) => equationOf(form, labels[index], prettyEquation(config.equations[index])));
  const solved = solveTwoByTwo(equations, vars, method);
  const steps = [];
  if (config.method === 'studentChoice') {
    steps.push(method === 'substitution'
      ? 'Use substitution: a variable with coefficient 1 or −1 can be isolated without fractions.'
      : 'Use elimination: no variable has coefficient 1 or −1, so scaling and combining is quicker than isolating.');
  }
  steps.push(...solved.steps);

  if (key.type === 'one') {
    if (solved.type !== 'one' || !near(solved.values[vars[0]], key.x) || !near(solved.values[vars[1]], key.y)) return null;
    const values = { [vars[0]]: stated(key.x), [vars[1]]: stated(key.y) };
    const solution = pointText([key.x, key.y]);
    const checks = config.equations.map((text) => equationSides(text, vars, values));
    const items = [{ label: `Solution (${vars.join(', ')})`, value: solution }];
    if (config.requireVerification) {
      config.equations.forEach((text, index) => {
        steps.push(checkSentence(labels[index], text, checks[index]));
        items.push({ label: `Check ${labels[index]}`, value: `left side ${exact(checks[index].left)}, right side ${exact(checks[index].right)}` });
      });
    }
    if (steps.length > MAX_STEPS) return null;
    return {
      title: 'Systems solution',
      items,
      steps,
      why: `${solution} makes both original equations true — ${checks.map((sides) => `${exact(sides.left)} = ${exact(sides.right)}`).join(' and ')} — so it is on both lines, and lines that cross meet only once.`,
      note: null,
    };
  }

  if (solved.type !== key.type || !solved.statement) return null;
  const constant = clean(solved.statement.constant);
  const isTrue = key.type === 'infinite';
  if ((constant === 0) !== isTrue) return null;
  const statement = `0 = ${exact(constant)}`;
  steps.push(isTrue
    ? `${statement} is true whatever ${vars[0]} and ${vars[1]} are: both equations describe the same line, so the system has infinitely many solutions — it is consistent and dependent.`
    : `${statement} is false whatever ${vars[0]} and ${vars[1]} are: the lines are parallel and never meet, so the system has no solution — it is inconsistent.`);
  // Why: the second equation's left side is a multiple of the first's.
  const pivot = vars.find((name) => coefficientOf(forms[0], name) !== 0);
  const ratio = clean(coefficientOf(forms[1], pivot) / coefficientOf(forms[0], pivot));
  if (steps.length > MAX_STEPS) return null;
  return {
    title: 'Systems solution',
    items: [
      { label: 'Statement with no variable', value: statement },
      { label: 'Is the statement true or false?', value: isTrue ? 'True' : 'False' },
      { label: 'What does that mean for the system?', value: isTrue ? 'Infinitely many solutions' : 'No solution' },
      { label: 'Classification', value: isTrue ? 'Consistent and dependent' : 'Inconsistent' },
    ],
    steps,
    why: isTrue
      ? `${labels[1]} is ${exact(ratio)} times ${labels[0]}, constant included, so every solution of one is a solution of the other.`
      : `The variable terms of ${labels[1]} are ${exact(ratio)} times those of ${labels[0]}, but its constant ${exact(forms[1].constant)} is not ${exact(ratio)} × ${bracketed(forms[0].constant)}, so no pair can satisfy both.`,
    note: null,
  };
};

// Eliminating one variable (written in all three equations) from two different pairs.
const eliminationPlans = (forms, vars, texts) => {
  const pairSets = [[[0, 1], [0, 2]], [[0, 1], [1, 2]], [[0, 2], [1, 2]]];
  const plans = [];
  vars.forEach((name, position) => {
    if (!texts.every((text, index) => equationMentionsVariable(text, name) && coefficientOf(forms[index], name) !== 0)) return;
    pairSets.forEach((pairs, order) => {
      const rounds = pairs.map(([a, b]) => ({ pair: [a, b], ...eliminationRound(forms[a], forms[b], name, vars) }));
      plans.push({ variable: name, rounds, cost: rounds[0].cost + rounds[1].cost, order: position * 3 + order });
    });
  });
  return plans.sort((a, b) => a.cost - b.cost || a.order - b.order);
};

// The authored equations a derivation combines in standard form, named once.
const standardFormNote = (forms, vars, texts, except = -1) => {
  const differing = texts.map((text, index) => index)
    .filter((index) => index !== except && squash(prettyEquation(texts[index])) !== squash(formText(forms[index], vars)));
  return differing.length ? [`In standard form: ${listText(differing.map((index) => `${equationLabel(index)} is ${formText(forms[index], vars)}`))}.`] : [];
};

const eliminationUnique = (forms, vars, texts, plan) => {
  const remaining = vars.filter((name) => name !== plan.variable);
  const steps = [
    ...standardFormNote(forms, vars, texts),
    ...plan.rounds.map((round, index) => roundText(round, round.pair.map(equationLabel), vars, `R${index + 1}`)),
  ];
  const reduced = plan.rounds.map((round) => restrictForm(round.combined, remaining));
  const sub = solveTwoByTwo(reduced.map((form, index) => equationOf(form, `R${index + 1}`)), remaining, hasUnitCoefficient(reduced, remaining) ? 'substitution' : 'elimination');
  if (sub.type !== 'one') unwritable();
  steps.push(`Solve the reduced system R1: ${formText(reduced[0], remaining)} and R2: ${formText(reduced[1], remaining)}.`, ...sub.steps);
  const back = forms
    .map((form, index) => ({ form, index, size: Math.abs(coefficientOf(form, plan.variable)) }))
    .sort((a, b) => (a.size === 1 ? 0 : 1) - (b.size === 1 ? 0 : 1) || a.index - b.index)[0];
  const solvedBack = backSubstitute(equationOf(back.form, equationLabel(back.index), prettyEquation(texts[back.index])), vars, plan.variable, sub.values);
  steps.push(solvedBack.text);
  return { values: { ...sub.values, [plan.variable]: solvedBack.value }, steps };
};

const substitutionUnique = (forms, vars, texts) => {
  const choices = [];
  forms.forEach((form, index) => vars.forEach((name, position) => {
    const coefficient = coefficientOf(form, name);
    if (coefficient === 0 || !equationMentionsVariable(texts[index], name)) return;
    choices.push({ index, name, rank: (Math.abs(coefficient) === 1 ? 0 : 100) + index * 3 + position });
  }));
  if (!choices.length) unwritable();
  const { index, name } = choices.sort((a, b) => a.rank - b.rank)[0];
  const source = forms[index];
  const remaining = vars.filter((other) => other !== name);
  const coefficient = coefficientOf(source, name);
  const slopes = Object.fromEntries(remaining.map((other) => [other, clean(-coefficientOf(source, other) / coefficient)]));
  const intercept = clean(source.constant / coefficient);
  const isolated = expressionText(remaining.map((other) => [slopes[other], other]), intercept);
  const steps = [
    ...standardFormNote(forms, vars, texts, index),
    squash(prettyEquation(texts[index])) === squash(`${name} = ${isolated}`)
      ? `${equationLabel(index)} already gives ${name} = ${isolated}.`
      : `Solve ${equationLabel(index)} for ${name}: ${prettyEquation(texts[index])} gives ${name} = ${isolated}.`,
  ];
  const reduced = [];
  const reducedLabels = [];
  forms.forEach((form, target) => {
    if (target === index) return;
    const label = `R${reduced.length + 1}`;
    const hasName = equationMentionsVariable(texts[target], name);
    if (hasName && coefficientOf(form, name) === 0) unwritable();
    if (!hasName) {
      const carried = restrictForm(form, remaining);
      steps.push(`${equationLabel(target)} has no ${name}, so it is carried over unchanged as ${label}: ${formText(carried, remaining)}.`);
      reduced.push(carried);
      reducedLabels.push(label);
      return;
    }
    const factor = coefficientOf(form, name);
    const result = {
      coefficients: Object.fromEntries(remaining.map((other) => [other, clean(coefficientOf(form, other) + factor * slopes[other])])),
      constant: clean(form.constant - factor * intercept),
    };
    let substituted = '';
    vars.forEach((variable) => {
      const value = coefficientOf(form, variable);
      if (value === 0) return;
      const body = variable === name ? `${coefficientBody(Math.abs(value))}(${isolated})` : `${coefficientBody(Math.abs(value))}${variable}`;
      substituted = joinTerm(substituted, value, body);
    });
    steps.push(`Substitute it into ${equationLabel(target)}: ${substituted} = ${exact(form.constant)}, which simplifies to ${formText(result, remaining)} (${label}).`);
    reduced.push(result);
    reducedLabels.push(label);
  });
  if (reduced.length !== 2) unwritable();
  const sub = solveTwoByTwo(reduced.map((form, position) => equationOf(form, reducedLabels[position])), remaining, 'substitution');
  if (sub.type !== 'one') unwritable();
  steps.push(...sub.steps);
  const value = clean(remaining.reduce((sum, other) => sum + slopes[other] * sub.values[other], intercept));
  steps.push(`Substitute ${listText(remaining.map((other) => `${other} = ${exact(sub.values[other])}`))} into ${name} = ${isolated}: ${name} = ${expressionText(remaining.map((other) => [slopes[other], other]), intercept, sub.values)} = ${exact(value)}.`);
  return { values: { ...sub.values, [name]: value }, steps };
};

const planeExplanation = (forms, vars, { first, second }, truth) => {
  const a = forms[first - 1];
  const b = forms[second - 1];
  const coefficients = (form) => `(${vars.map((name) => exact(coefficientOf(form, name))).join(', ')})`;
  const relation = PLANE_RELATIONSHIP_OPTIONS.find((option) => option.value === truth)?.label;
  if (!relation) unwritable();
  if (truth === 'line') return `Planes ${first} and ${second}: their coefficients ${coefficients(a)} and ${coefficients(b)} are not in one ratio, so the planes are not parallel — they ${relation}.`;
  const pivot = vars.find((name) => coefficientOf(a, name) !== 0);
  const ratio = clean(coefficientOf(b, pivot) / coefficientOf(a, pivot));
  return `Planes ${first} and ${second}: every coefficient of plane ${second} is ${exact(ratio)} times plane ${first}'s, and its constant ${exact(b.constant)} ${truth === 'coincident' ? 'is' : 'is not'} ${exact(ratio)} × ${bracketed(a.constant)}, so they ${relation}.`;
};

const algebraicThreeReview = (question) => {
  if (!Array.isArray(question.equations) || question.equations.length !== 3) return null;
  const config = normalizeAlgebraicSystemConfig(question);
  const vars = config.variables;
  const texts = config.equations;
  if (!validVariables(vars, 3) || !texts.every((text) => typeof text === 'string')) return null;
  const forms = config.forms;
  if (!forms.every(Boolean)) return null;
  const system = buildReductionSystem({ variables: vars, equations: texts });
  const key = reductionAnswerKey(system);
  if (key.type === 'invalid') return null;
  const labels = texts.map((_, index) => equationLabel(index));

  if (key.type === 'unique') {
    const plans = eliminationPlans(forms, vars, texts);
    let method = config.method;
    if (method === 'studentChoice') method = hasUnitCoefficient(forms, vars) || !plans.length ? 'substitution' : 'elimination';
    if (method === 'elimination' && !plans.length) return null;
    const solved = method === 'elimination' ? eliminationUnique(forms, vars, texts, plans[0]) : substitutionUnique(forms, vars, texts);
    if (!vars.every((name) => reductionValueMatches(solved.values[name], key.solution[name]))) return null;
    const values = Object.fromEntries(vars.map((name) => [name, stated(key.solution[name])]));
    const solution = pointText(vars.map((name) => values[name]));
    const checks = texts.map((text) => equationSides(text, vars, values));
    const steps = [];
    const items = [];
    if (config.method === 'studentChoice') {
      steps.push(method === 'substitution'
        ? 'Choose substitution: a variable with coefficient 1 or −1 can be isolated without fractions.'
        : 'Choose elimination: no variable has coefficient 1 or −1, so combining equations is quicker than isolating.');
      items.push({ label: 'Method', value: method === 'substitution' ? 'Substitution' : 'Elimination' });
    }
    steps.push(...solved.steps);
    items.push({ label: `Solution (${vars.join(', ')})`, value: solution });
    if (config.requireVerification) {
      texts.forEach((text, index) => {
        const given = verificationGivenSides(system, `E${index + 1}`);
        items.push({
          label: `Check ${labels[index]}`,
          value: `left side ${given.left != null ? `${exact(checks[index].left)} (given)` : exact(checks[index].left)}, right side ${given.right != null ? `${exact(checks[index].right)} (given)` : exact(checks[index].right)}`,
        });
      });
      const verification = texts.map((text, index) => {
        const sides = checks[index];
        return `${labels[index]}: left side ${sideSentence(sides.leftWork, sides.left)}, right side ${sideSentence(sides.rightWork, sides.right)}`;
      });
      steps.push(`Verify ${solution} in every original equation: ${verification.join('; ')}.`);
    }
    if (steps.length > MAX_STEPS) return null;
    return {
      title: 'Systems solution',
      items,
      steps,
      why: `${solution} makes all three original equations true (${checks.map((sides) => `${exact(sides.left)} = ${exact(sides.right)}`).join(', ')}), so it is the one point on all three planes.`,
      note: null,
    };
  }

  // Dependent or inconsistent: only the elimination workflow classifies it.
  if (config.method !== 'elimination') return null;
  const plans = eliminationPlans(forms, vars, texts);
  // The first plan (fewest multiplications) whose statement is the system's own.
  const outcomeOf = (plan) => {
    const remaining = vars.filter((name) => name !== plan.variable);
    const steps = [
      ...standardFormNote(forms, vars, texts),
      ...plan.rounds.map((round, index) => roundText(round, round.pair.map(equationLabel), vars, `R${index + 1}`)),
    ];
    const rows = plan.rounds.map((round) => ({ form: round.combined, type: nonzeroVariables(round.combined, vars).length ? null : degenerateType(round.combined) }));
    // eliminationOutcome's reading: a contradiction in either row, else an
    // identity once both rows are done, else the reduced 2×2 decides.
    let terminal = rows.find((row) => row.type === 'none') || rows.find((row) => row.type === 'infinite') || null;
    if (!terminal) {
      const reduced = plan.rounds.map((round) => restrictForm(round.combined, remaining));
      const sub = solveTwoByTwo(reduced.map((form, index) => equationOf(form, `R${index + 1}`)), remaining, 'elimination');
      if (sub.type === 'one') return null;
      steps.push(`Solve the reduced system R1: ${formText(reduced[0], remaining)} and R2: ${formText(reduced[1], remaining)}.`, ...sub.steps);
      terminal = { form: sub.statement, type: sub.type };
    }
    const statement = `0 = ${exact(terminal.form.constant)}`;
    // The grader's reading of the statement must be the system's own.
    if (terminal.type !== key.type || noVariableStatementType(statement.replace(/−/g, '-'), vars) !== key.type) return null;
    return { statement, steps };
  };
  const outcome = plans.map(outcomeOf).find(Boolean) || null;
  if (!outcome) return null;
  const meaning = SYSTEM_MEANINGS.find((option) => option.value === key.type)?.label;
  const kindValue = key.type === 'infinite' ? 'identity' : 'contradiction';
  const kind = STATEMENT_KINDS.find((option) => option.value === kindValue)?.label;
  const truth = planeTruthFor({ equations: texts, variables: vars });
  const pairs = planePairs(3);
  if (!meaning || !kind || !pairs.every(({ id }) => truth[id])) return null;
  const steps = [
    ...outcome.steps,
    key.type === 'none'
      ? `${outcome.statement} is false whatever ${listText(vars)} are — a contradiction — so no ordered triple satisfies all three equations: no solution, the system is inconsistent.`
      : `${outcome.statement} is true whatever ${listText(vars)} are — an identity — and no step gave a contradiction, so the equations do not pin down one point: infinitely many solutions, the system is dependent.`,
    ...pairs.map((pair) => planeExplanation(forms, vars, pair, truth[pair.id])),
  ];
  if (steps.length > MAX_STEPS) return null;
  return {
    title: 'Systems solution',
    items: [
      { label: 'Statement with no variable', value: outcome.statement },
      { label: 'What kind of statement is it?', value: kind },
      { label: 'What it means for the system', value: meaning },
      ...pairs.map(({ id, first, second }) => ({ label: `Planes ${first} and ${second}`, value: PLANE_RELATIONSHIP_OPTIONS.find((option) => option.value === truth[id]).label })),
    ],
    steps,
    why: key.type === 'none'
      ? 'Every step combined true equations into another true one, so reaching a false statement means the three equations can never hold at once.'
      : 'Every step combined the equations into an equivalent one, and an identity adds no condition: one equation depends on the others, so a whole line (or plane) of points satisfies all three.',
    note: null,
  };
};

const algebraicReview = (question) => (
  algebraicSystemDimension(question) === 3 ? algebraicThreeReview(question) : algebraicTwoReview(question)
);

/* ------------------------------------------------------------------ spatial */

const fieldAnswerText = (field) => {
  const answer = [field.expected, field.answer, ...(Array.isArray(field.accepted) ? field.accepted : []), ...(Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : [])]
    .find((value) => value !== undefined && value !== null);
  if (typeof answer === 'string' && answer.trim()) return answer.trim();
  // As authored: the grader compares the response with this very value.
  if (typeof answer === 'number' && Number.isFinite(answer)) return String(answer);
  return unwritable();
};

const spatialReview = (question) => {
  const fields = (Array.isArray(question.answerFields) ? question.answerFields : []).filter((field) => isRecord(field) && field.id);
  if (!fields.length) return null;
  const answers = fields.map((field) => ({ label: String(field.label || field.id), answer: fieldAnswerText(field) }));
  // The geometry the model shows, from the equations it draws — context for
  // the answers, so a system it cannot write exactly only leaves it out.
  const geometry = (() => {
    const vars = Array.isArray(question.variables) && question.variables.length === 3 ? question.variables.map((name) => String(name).trim()) : ['x', 'y', 'z'];
    const texts = Array.isArray(question.equations) && question.equations.length === 3 && question.equations.every((text) => typeof text === 'string') ? question.equations : null;
    if (!texts || !validVariables(vars, 3)) return null;
    try {
      const forms = texts.map((text) => linearEquationForm(text, vars));
      const key = forms.every(Boolean) ? classifyLinearSystem(forms, vars) : { type: 'invalid' };
      const planes = `The three planes are ${listText(texts.map(prettyEquation))}.`;
      if (key.type === 'unique') {
        const values = Object.fromEntries(vars.map((name) => [name, stated(key.solution[name])]));
        const point = pointText(vars.map((name) => values[name]));
        const checks = texts.map((text) => equationSides(text, vars, values));
        return {
          step: `${planes} Solving the system gives the single point ${point}, the one place all three planes meet.`,
          why: `${point} lies on all three planes: ${texts.map((text, index) => `${sideSentence(checks[index].leftWork, checks[index].left)} and the right side is ${exact(checks[index].right)}`).join('; ')}.`,
        };
      }
      if (key.type === 'none') return { step: `${planes} No point satisfies all three equations, so the planes have no point in common.`, why: null };
      if (key.type === 'infinite') return { step: `${planes} The equations are dependent, so the planes share infinitely many points.`, why: null };
      return null;
    } catch (error) {
      if (error instanceof Unwritable) return null;
      throw error;
    }
  })();
  const steps = geometry ? [geometry.step] : [];
  const why = geometry?.why || null;
  answers.forEach(({ label, answer }) => steps.push(`${label} — ${answer}`));
  if (steps.length > MAX_STEPS) return null;
  return {
    title: 'Three-plane model solution',
    items: answers.map(({ label, answer }) => ({ label, value: answer })),
    steps,
    why: why || 'A solution of a system of three equations is a point that satisfies all three at once — a point on all three planes.',
    note: null,
  };
};

/* --------------------------------------------------------------- dispatch */

// The modes whose reviews write exact fractions (see fractionStyle).
const FRACTION_MODES = new Set(['algebraic', 'spatial']);

const BUILDERS = Object.freeze({
  linear: linearReview,
  matrix: matrixReview,
  matrix3: matrixReview,
  linearQuadratic: linearQuadraticReview,
  inequalities: inequalitiesReview,
  algebraic: algebraicReview,
  spatial: spatialReview,
});

export const buildSystemsWorkspaceReview = (question) => {
  if (!isRecord(question)) return null;
  try {
    // The mode the grader grades — the workspace's own resolution, with its
    // fallback — and only where the grader has a verdict to give.
    const support = toolModeSupport(declaration, question);
    if (!support.supported) return null;
    const builder = BUILDERS[support.mode];
    fractionStyle = FRACTION_MODES.has(support.mode);
    return builder ? builder(question) : null;
  } catch {
    return null;
  } finally {
    fractionStyle = false;
  }
};

export default buildSystemsWorkspaceReview;
