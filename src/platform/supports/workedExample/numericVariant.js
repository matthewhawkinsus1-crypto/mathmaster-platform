/*
 * "PRACTISE ONE LIKE THIS" WHERE NO QUESTION FAMILY HAS A SIBLING (FB19):
 * THE ITEM ITSELF, WITH NEW NUMBERS.
 *
 *   buildNumericVariant(question, { seed }) → { prompt, steps, answer, source, kind } | null
 *
 * D3 says "always offer an unscored practise one like this after the last
 * miss", but a sibling came only from a question family
 * (buildSimilarWorkedExample), and about half the real Classwork and Practice
 * items have none. Some of those are static items whose numbers can change
 * without changing the method. For each kind below, the variant is the item's
 * own mathematics in the same shape with new numbers, worked in full, and the
 * grader that grades the item must agree with its key before it is offered.
 * practiceLikeThis.js asks for one only when the item has no family sibling;
 * the Hint panel never does (similarProblem.js does not read this module), so
 * a variant is only ever shown once the item has closed.
 *
 * THE FIRST KIND: a 3×3 linear system solved by hand — the Systems
 * Workspace's algebraic mode, three equations in three variables, by
 * elimination or the student's choice — written as "2x - y + 2z = 15" (every
 * variable in every equation, one whole number on the right), with one
 * solution in whole numbers, and every number of the problem in its
 * equations. A word problem (a context scenario, or a prompt that quotes
 * numbers, as an error analysis does too) is not varied: new equations would
 * contradict it. Neither is a family slot:
 * its other instances are classmates' questions, and a variant of the same
 * shape could be one of them.
 *
 * NEVER EASIER. The variant keeps the item's layout — the same variables in
 * the same order on the left, a ±1 coefficient kept as that ±1, every other
 * coefficient keeping its sign and moving at most one down or two up (never
 * below 2), with their sizes adding up to at least the item's — and then,
 * whichever elimination path the student takes (easeOf, below):
 *   - it takes at least as much scaling: over each variable and pair of
 *     equations, "same size" 0, "one divides the other" 1, "scale both" 2 adds
 *     up to at least the item's, with no more pairs at 0;
 *   - no more pairs of equations cancel two variables at once, and no more of
 *     the nine first eliminations come out kind (0 on the right, or a ±1
 *     coefficient once divided down);
 *   - no equation divides through by a common factor unless the item's does,
 *     and no more equations have 0 on the right;
 *   - the solution is whole numbers of the same size (a one-digit value stays
 *     within 1–6, or the item's largest, a two-digit one stays two digits within
 *     ten of it and keeps its sign), never 0, with at least as many negatives.
 *
 * NEVER A GIVE-AWAY. No value of the variant's solution equals the item's
 * value for that variable, and the item's answer, written as an ordered
 * triple or as "x = …, y = …, z = …", appears nowhere in the variant. The
 * guard every family sibling passes (similarExampleIsSafe) is run too.
 *
 * VERIFIED. The solution is checked exactly in every equation (whole
 * numbers), and the Systems Workspace's algebraic grader — the function the
 * tool's own Check and the server run for this mode — is asked about the
 * variant with the item's own rubric (its method, and checking each original
 * equation when the item requires it): the variant's solution must be graded
 * right, and a solution off by one graded wrong.
 *
 * NOTHING HERE IS RECORDED. It returns values, like practiceLikeThis.js.
 */
import algebraicGraders from '../../../../functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs';
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { isFamilyBackedQuestion } from '../../../../functions/shared/questionFamilySlot.mjs';
import {
  classifyLinearSystem,
  linearEquationForm,
  normalizeAlgebraicSystemConfig,
} from '../../../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { resolveSystemsWorkspaceMode } from '../../../../functions/shared/toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';
import { similarExampleIsSafe } from './similarProblem.js';

export const NUMERIC_VARIANT_SOURCE = 'numericVariant';
export const NUMERIC_VARIANT_KIND = Object.freeze({ SYSTEM_3X3: 'system3x3' });

const text = (value) => String(value ?? '').trim();
const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* ------------------------------------------------------ seeded randomness */

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const randomFrom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));

/* ----------------------------------------------------- reading the system */

// "3×3" and "2×2" name the kind of system, not one of its numbers.
const SYSTEM_SIZE = /\b[23]\s*[×xX*]\s*[23]\b/g;
const quotesNumbers = (question) => [question?.prompt, question?.stem, question?.question]
  .some((value) => /\d/.test(text(value).replace(SYSTEM_SIZE, '')));

/**
 * "2x - y + 2z = 15" → { order, coefficients, constant }: the variables in the
 * order written, their coefficients in the system's variable order, and the
 * whole number on the right. Null for any other layout (a term on the right,
 * a missing variable, a fraction or decimal, a variable twice).
 */
const readRow = (equation, variables) => {
  const sides = text(equation).replace(/[−–]/g, '-').split('=');
  if (sides.length !== 2) return null;
  const [left, right] = sides.map((side) => side.replace(/\s+/g, ''));
  if (!/^-?\d+$/.test(right)) return null;
  const pieces = left.match(/[+-]?[^+-]+/g) || [];
  if (pieces.join('') !== left || pieces.length !== variables.length) return null;
  const order = [];
  const coefficients = variables.map(() => 0);
  for (const piece of pieces) {
    const match = /^([+-]?)([1-9]\d*)?([A-Za-z])$/.exec(piece);
    const index = match ? variables.indexOf(match[3]) : -1;
    if (index < 0 || order.includes(index)) return null;
    order.push(index);
    coefficients[index] = (match[1] === '-' ? -1 : 1) * (match[2] ? Number(match[2]) : 1);
  }
  return { order, coefficients, constant: Number(right) };
};

/** The platform's own reading of the equation must be the same one (a guard on readRow). */
const sameAsPlatform = (row, equation, variables) => {
  const form = linearEquationForm(equation, variables);
  return Boolean(form)
    && variables.every((name, index) => form.coefficients[name] === row.coefficients[index])
    && form.constant === row.constant;
};

/** The item as a 3×3 system this kind can vary, or null. */
const readSystem3x3 = (question) => {
  if (!question || typeof question !== 'object' || question.type !== 'systemsWorkspace') return null;
  if (isFamilyBackedQuestion(question) || question.familyDelivery || question.generator) return null;
  if (resolveSystemsWorkspaceMode(question) !== 'algebraic') return null;
  const config = normalizeAlgebraicSystemConfig(question);
  if (config.dimension !== 3 || !['elimination', 'studentChoice'].includes(config.method)) return null;
  // The authored equations, not normalizeAlgebraicSystemConfig's default system.
  if (!Array.isArray(question.equations) || question.equations.length !== 3) return null;
  // A word problem — a context scenario, or a prompt that quotes numbers — is
  // not varied: new equations would contradict it, and leave out its modelling.
  if (question.context || quotesNumbers(question)) return null;
  const { variables } = config;
  const rows = question.equations.map((equation) => readRow(equation, variables));
  if (rows.some((row, at) => !row || !sameAsPlatform(row, question.equations[at], variables))) return null;
  const solved = classifyLinearSystem(question.equations.map((equation) => linearEquationForm(equation, variables)), variables);
  if (solved.type !== 'unique') return null;
  const solution = variables.map((name) => solved.solution[name]);
  if (!solution.every(Number.isInteger)) return null;
  // Exactly, in whole numbers: the classification above is in floating point.
  if (!rows.every((row) => row.coefficients.reduce((sum, c, index) => sum + c * solution[index], 0) === row.constant)) return null;
  return { variables, rows, solution, method: config.method, requireVerification: config.requireVerification };
};

/* -------------------------------------------------------------- writing */

const formatRow = (row, variables) => {
  let left = '';
  row.order.forEach((index) => {
    const c = row.coefficients[index];
    if (!c) return;
    const term = `${Math.abs(c) === 1 ? '' : Math.abs(c)}${variables[index]}`;
    left = left ? `${left} ${c < 0 ? '-' : '+'} ${term}` : `${c < 0 ? '-' : ''}${term}`;
  });
  return `${left || '0'} = ${row.constant}`;
};

/** "2(3) - (-1) + (5)": the row's left side at known values, the rest as variables (the families' check style). */
const substitutedLeft = (row, variables, known) => {
  let left = '';
  row.order.forEach((index) => {
    const c = row.coefficients[index];
    if (!c) return;
    const size = Math.abs(c) === 1 ? '' : String(Math.abs(c));
    const term = Object.hasOwn(known, variables[index]) ? `${size}(${known[variables[index]]})` : `${size}${variables[index]}`;
    left = left ? `${left} ${c < 0 ? '-' : '+'} ${term}` : `${c < 0 ? '-' : ''}${term}`;
  });
  return left;
};

const scale = (row, factor) => ({ ...row, coefficients: row.coefficients.map((c) => c * factor), constant: row.constant * factor });
const rowIn = (coefficients, constant) => ({ order: [0, 1, 2], coefficients, constant });
const nonZero = (row) => row.coefficients.map((c, index) => (c ? index : -1)).filter((index) => index >= 0);

/** Scaling two coefficients to cancel: 0 when they are the same size, 1 when one divides the other, 2 otherwise. */
const scalingEffort = (left, right) => {
  const a = Math.abs(left);
  const b = Math.abs(right);
  if (a === b) return 0;
  return a % b === 0 || b % a === 0 ? 1 : 2;
};

const PAIRS = [[0, 1], [0, 2], [1, 2]];

/*
 * What makes eliminating by hand easier, counted so a variant can be held to
 * at most the item's ease:
 *   effort     over each variable and pair of equations, the scaling needed
 *              to cancel it (scalingEffort) — more is harder;
 *   free       pairs that need no scaling at all;
 *   shortcuts  a pair of equations that cancels two variables at once (their
 *              coefficients of those two are in proportion);
 *   divisible  an equation that divides through by a common factor (often
 *              into ±1 coefficients);
 *   zeros      equations with 0 on the right;
 *   lucky      of the nine first eliminations (each variable, each pair of
 *              equations, by the smallest multipliers), those that come out
 *              kind — 0 on the right, or a ±1 coefficient once divided by a
 *              common factor — whichever path the student takes;
 *   size       the sizes of the coefficients other than ±1, added up.
 */
const easeOf = (rows) => {
  let effort = 0;
  let free = 0;
  let shortcuts = 0;
  let lucky = 0;
  PAIRS.forEach(([first, second]) => {
    const [a, b] = [rows[first].coefficients, rows[second].coefficients];
    for (let index = 0; index < 3; index += 1) {
      const step = scalingEffort(a[index], b[index]);
      effort += step;
      if (step === 0) free += 1;
      // The elimination of this variable from this pair, divided by any common factor.
      const common = gcd(a[index], b[index]);
      const [m1, m2] = [b[index] / common, a[index] / common];
      const left = a.map((c, at) => m1 * c - m2 * b[at]);
      const right = m1 * rows[first].constant - m2 * rows[second].constant;
      const divisor = gcd(left.reduce((g, c) => gcd(g, c), 0), right) || 1;
      if (right === 0 || left.some((c) => Math.abs(c) === divisor)) lucky += 1;
    }
    PAIRS.forEach(([p, q]) => {
      if (a[p] * b[q] - a[q] * b[p] === 0) shortcuts += 1;
    });
  });
  return {
    effort,
    free,
    shortcuts,
    lucky,
    divisible: rows.map((row) => row.coefficients.reduce((g, c) => gcd(g, c), row.constant) > 1),
    zeros: rows.filter((row) => row.constant === 0).length,
    size: rows.reduce((sum, row) => sum + row.coefficients.reduce((total, c) => total + (Math.abs(c) > 1 ? Math.abs(c) : 0), 0), 0),
  };
};

/** Never easier than the item: every count of ease at most the item's, every count of work at least. */
const noEasierThan = (variant, item) => variant.effort >= item.effort
  && variant.free <= item.free
  && variant.shortcuts <= item.shortcuts
  && variant.lucky <= item.lucky
  && variant.divisible.every((divides, at) => !divides || item.divisible[at])
  && variant.zeros <= item.zeros
  && variant.size >= item.size;

/**
 * c·v = k → its value, "$v = 2$", and, unless c is 1, "$3v = 6$" said first;
 * null when the value is not a whole number.
 */
const isolate = (coefficient, constant, name) => {
  if (!coefficient || constant % coefficient !== 0) return null;
  const value = constant / coefficient + 0;
  return {
    value,
    before: coefficient === 1 ? null : `$${coefficient === -1 ? '-' : coefficient}${name} = ${constant}$`,
    result: `$${name} = ${value}$`,
  };
};

/*
 * One elimination: rows `first` and `second` combined so that the variable at
 * `index` cancels, by the smallest whole multipliers. Written the way the
 * lessons ask ("write every product and combination"): the scaled equations
 * and what they give. What they give then ends the sentence one of two ways:
 * a single variable is solved on the spot ("gives $11z = 33$, so $z = 3$"),
 * and two variables are divided by any common factor ("gives $4x + 2z = 10$,
 * or $2x + z = 5$ after dividing by $2$"). `solved` is that single variable.
 */
const combine = (first, second, index, variables) => {
  const a = first.row.coefficients[index];
  const b = second.row.coefficients[index];
  const common = gcd(a, b);
  const [m1, m2] = [Math.abs(b) / common, Math.abs(a) / common];
  const add = Math.sign(a) !== Math.sign(b);
  const one = scale(first.row, m1);
  const two = scale(second.row, m2);
  const sum = rowIn(one.coefficients.map((c, at) => (add ? c + two.coefficients[at] : c - two.coefficients[at])), add ? one.constant + two.constant : one.constant - two.constant);
  const times = (m, label) => (m === 1 ? label : `$${m}$ times ${label}`);
  const how = add ? `add ${times(m1, first.label)} and ${times(m2, second.label)}` : `subtract ${times(m2, second.label)} from ${times(m1, first.label)}`;
  const opening = `To eliminate $${variables[index]}$, ${how}: $${formatRow(one, variables)}$ ${add ? 'plus' : 'minus'} $${formatRow(two, variables)}$ gives`;
  const left = nonZero(sum);
  if (left.length === 1) {
    const solved = isolate(sum.coefficients[left[0]], sum.constant, variables[left[0]]);
    if (!solved) return null;
    return { sentence: `${opening} ${solved.before ? `${solved.before}, so ${solved.result}` : solved.result}.`, result: sum, solved: { index: left[0], value: solved.value } };
  }
  const divisor = gcd(sum.coefficients.reduce((g, c) => gcd(g, c), 0), sum.constant) || 1;
  const result = divisor > 1 ? rowIn(sum.coefficients.map((c) => c / divisor), sum.constant / divisor) : sum;
  const sentence = `${opening} $${formatRow(sum, variables)}$${divisor > 1 ? `, or $${formatRow(result, variables)}$ after dividing by $${divisor}$` : ''}.`;
  return { sentence, result, solved: null };
};

/** Substitute what is known into a row with one unknown left: the sentence's math, and the unknown's value. */
const backSubstitute = (row, variables, known) => {
  const unknown = nonZero(row).filter((index) => !Object.hasOwn(known, variables[index]));
  if (unknown.length !== 1) return null;
  const [index] = unknown;
  const rest = row.coefficients.reduce((sum, c, at) => (at === index ? sum : sum + c * (known[variables[at]] ?? 0)), 0);
  const solved = isolate(row.coefficients[index], row.constant - rest, variables[index]);
  if (!solved) return null;
  const then = solved.before ? `${solved.before} and ${solved.result}` : solved.result;
  return { index, value: solved.value, words: `$${substitutedLeft(row, variables, known)} = ${row.constant}$, so ${then}` };
};

/*
 * The worked solution, by elimination: eliminate one variable from two pairs
 * (the one whose pairs need the least scaling, kept against the equation where
 * it is smallest), solve the 2×2 that is left, back-substitute, and check the
 * ordered triple in all three original equations. A first combination that
 * already leaves one variable is solved on the spot. Every equation written is
 * true at the solution (tests/platform/practiceLikeThisNumericVariant.test.mjs
 * evaluates each one).
 */
const workBySolving = (rows, variables) => {
  const labelled = rows.map((row, at) => ({ row, label: `equation ${at + 1}` }));
  const plans = [0, 1, 2].map((index) => {
    const pivot = [0, 1, 2].reduce((best, at) => (Math.abs(rows[at].coefficients[index]) < Math.abs(rows[best].coefficients[index]) ? at : best), 0);
    const others = [0, 1, 2].filter((at) => at !== pivot);
    return { index, pivot, others, effort: others.reduce((sum, at) => sum + scalingEffort(rows[pivot].coefficients[index], rows[at].coefficients[index]), 0) };
  });
  const plan = plans.reduce((best, entry) => (entry.effort < best.effort ? entry : best));
  const steps = [];
  const known = {};
  const learn = (index, value) => {
    known[variables[index]] = value;
  };
  const reduced = [];
  for (const other of plan.others) {
    const [first, second] = [Math.min(plan.pivot, other), Math.max(plan.pivot, other)];
    const step = combine(labelled[first], labelled[second], plan.index, variables);
    if (!step || !nonZero(step.result).length) return null;
    steps.push(step.sentence);
    reduced.push(step.result);
    if (step.solved) learn(step.solved.index, step.solved.value);
  }
  // A combination that left one variable is a shortcut the problem gives.
  const shortcuts = reduced.filter((row) => nonZero(row).length === 1).length;
  const [one, two] = reduced;

  if (!shortcuts) {
    // A 2×2 in the two variables left: eliminate the one that needs less scaling.
    const remaining = [0, 1, 2].filter((index) => index !== plan.index);
    const target = remaining.reduce((best, index) => (scalingEffort(one.coefficients[index], two.coefficients[index]) < scalingEffort(one.coefficients[best], two.coefficients[best]) ? index : best));
    const step = combine({ row: one, label: 'the first' }, { row: two, label: 'the second' }, target, variables);
    if (!step?.solved) return null;
    learn(step.solved.index, step.solved.value);
    steps.push(`Now solve $${formatRow(one, variables)}$ and $${formatRow(two, variables)}$. ${step.sentence}`);
    const into = Math.abs(one.coefficients[target]) <= Math.abs(two.coefficients[target]) ? one : two;
    const found = backSubstitute(into, variables, known);
    if (!found) return null;
    learn(found.index, found.value);
    steps.push(`Substitute $${variables[step.solved.index]} = ${step.solved.value}$ into $${formatRow(into, variables)}$: ${found.words}.`);
  } else if (Object.keys(known).length < 2) {
    // One combination already gave a value: the other reduced equation gives the second.
    const other = reduced.find((row) => nonZero(row).length === 2);
    const solvedName = Object.keys(known)[0];
    const found = other ? backSubstitute(other, variables, known) : null;
    if (!found) return null;
    learn(found.index, found.value);
    steps.push(`Substitute $${solvedName} = ${known[solvedName]}$ into $${formatRow(other, variables)}$: ${found.words}.`);
  }
  if (Object.keys(known).length !== 2) return null;

  // The first variable eliminated, from the original equation where it is smallest.
  const back = [0, 1, 2].reduce((best, at) => (Math.abs(rows[at].coefficients[plan.index]) < Math.abs(rows[best].coefficients[plan.index]) ? at : best), 0);
  const [firstKnown, secondKnown] = variables.filter((name) => Object.hasOwn(known, name));
  const last = backSubstitute(rows[back], variables, known);
  if (!last) return null;
  learn(last.index, last.value);
  steps.push(`Substitute $${firstKnown} = ${known[firstKnown]}$ and $${secondKnown} = ${known[secondKnown]}$ into equation ${back + 1}: ${last.words}.`);
  const checks = rows.map((row) => `$${substitutedLeft(row, variables, known)} = ${row.constant}$`);
  steps.push(`Check in all three original equations: ${checks[0]}, ${checks[1]} and ${checks[2]} are all true.`);
  return { steps, solution: variables.map((name) => known[name]) };
};

/* ------------------------------------------------------------ the variant */

const SOLUTION_SMALL = 6;

/** A value of the same size as the item's (one digit, or two digits with its sign), never 0 and never the item's. */
const drawValue = (random, value, smallest) => {
  if (Math.abs(value) < 10) {
    for (let tries = 0; tries < 20; tries += 1) {
      const size = integer(random, 1, smallest);
      const next = random() < 0.5 ? -size : size;
      if (next !== value) return next;
    }
    return null;
  }
  const size = Math.abs(value);
  for (let tries = 0; tries < 20; tries += 1) {
    const next = Math.sign(value) * integer(random, Math.max(10, size - 10), size + 10);
    if (next !== value) return next;
  }
  return null;
};

const determinant = (rows) => {
  const [[a, b, c], [d, e, f], [g, h, i]] = rows.map((row) => row.coefficients);
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
};

/** The grader that grades the item, with the item's rubric, about the variant. */
const graderAgrees = (item, rows, solution) => {
  const question = {
    type: 'systemsWorkspace',
    mode: 'algebraic',
    variables: item.variables,
    equations: rows.map((row) => formatRow(row, item.variables)),
    method: item.method,
    requireVerification: item.requireVerification,
  };
  const workFor = (values) => ({
    dimension: 3,
    method: 'elimination',
    values: Object.fromEntries(item.variables.map((name, index) => [name, values[index]])),
    verification: Object.fromEntries(rows.map((row, at) => [`E${at + 1}`, {
      left: String(row.coefficients.reduce((sum, c, index) => sum + c * values[index], 0)),
      right: String(row.constant),
    }])),
  });
  try {
    const right = algebraicGraders.algebraic(question, workFor(solution));
    const offByOne = algebraicGraders.algebraic(question, workFor(solution.map((value, index) => (index === 2 ? value + 1 : value))));
    return right?.isCorrect === true && offByOne?.isCorrect === false;
  } catch {
    return false;
  }
};

const ATTEMPTS = 400;

const system3x3Variant = (question, item, seed) => {
  const { variables, rows, solution } = item;
  const ease = easeOf(rows);
  const smallest = Math.max(SOLUTION_SMALL, ...solution.filter((value) => Math.abs(value) < 10).map(Math.abs));
  const negatives = solution.filter((value) => value < 0).length;
  const constantLimit = Math.max(36, 2 * Math.max(...rows.map((row) => Math.abs(row.constant))));
  // The item's answer as a student or the review would write it.
  const itemAnswers = [
    `(${solution.join(', ')})`,
    `(${solution.join(',')})`,
    variables.map((name, index) => `${name} = ${solution[index]}`).join(', '),
  ];
  const random = randomFrom(hashText(`${Number(seed) || 0}|${NUMERIC_VARIANT_KIND.SYSTEM_3X3}|${rows.map((row) => formatRow(row, variables)).join('|')}`));

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const coefficients = rows.map((row) => row.coefficients.map((c) => (Math.abs(c) === 1 ? c : Math.sign(c) * integer(random, Math.max(2, Math.abs(c) - 1), Math.abs(c) + 2))));
    const values = solution.map((value) => drawValue(random, value, smallest));
    if (values.some((value) => value === null)) continue;
    if (values.filter((value) => value < 0).length < negatives) continue;
    const next = rows.map((row, at) => ({ order: row.order, coefficients: coefficients[at], constant: coefficients[at].reduce((sum, c, index) => sum + c * values[index], 0) }));
    if (next.some((row) => Math.abs(row.constant) > constantLimit)) continue;
    if (!determinant(next)) continue;
    if (!noEasierThan(easeOf(next), ease)) continue;
    const worked = workBySolving(next, variables);
    if (!worked || worked.solution.some((value, index) => value !== values[index])) continue;

    const equations = next.map((row) => formatRow(row, variables));
    const listed = `$${equations[0]}$, $${equations[1]}$ and $${equations[2]}$`;
    const variant = {
      prompt: item.method === 'elimination' ? `Solve the system by elimination: ${listed}.` : `Solve the system: ${listed}.`,
      steps: worked.steps,
      answer: variables.map((name, index) => `${name} = ${values[index]}`).join(', '),
      source: NUMERIC_VARIANT_SOURCE,
      kind: NUMERIC_VARIANT_KIND.SYSTEM_3X3,
    };
    const everything = [variant.prompt, ...variant.steps, variant.answer].join('\n');
    if (hintRevealsAnswer(everything, itemAnswers)) continue;
    if (!similarExampleIsSafe(question, variant)) continue;
    if (!graderAgrees(item, next, values)) continue;
    return variant;
  }
  return null;
};

export const buildNumericVariant = (question, { seed = 0 } = {}) => {
  try {
    const system = readSystem3x3(question);
    return system ? system3x3Variant(question, system, seed) : null;
  } catch {
    return null;
  }
};
