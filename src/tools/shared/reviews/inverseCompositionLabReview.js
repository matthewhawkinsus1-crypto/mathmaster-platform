// Worked solution review for inverseCompositionLab (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE INVERSE & COMPOSITION LAB'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * Every value here is recomputed from the question with the helpers the shared
 * grader (functions/shared/serverGrading/tools/inverseCompositionLab.mjs) uses:
 * the same f and g (inverseLabFunctions), the same input x (inverseLabInitialX,
 * inverseLabInputLocked), the same compositions (composeValue), the same
 * inverse (hasFunctionalInverse, inverseValue), the same expected restriction
 * (expectedInverseRestriction) and the same parts per view
 * (inverseLabRequiredParts). The derivation is driven through the lab's own
 * state machine (createLinearInverseDerivation, applyInverseDerivationOperation)
 * with operands a student can type into its number box.
 *
 * Before a review is returned, the work it states — the numbers as a student
 * would type them, the restriction it names, the derivation it walks — is
 * graded by that grader through the bytes the server reads
 * (gradeWorkWithGrader). If the grader does not call it correct, the review is
 * null: a review never states an answer the gradebook would reject.
 *
 * Null — never a guess — when:
 *   - the question authors no f (the lab's demonstration functions are not a
 *     question), or a view that asks for compositions authors no g;
 *   - a function carries a field the lab and grader ignore (a horizontal scale
 *     `b`, a slope `m`) — the prompt and the screen would disagree;
 *   - the view is not one the lab draws its inputs for (an unknown `mode`
 *     shows no composition boxes but the grader still asks for them);
 *   - no answer can be right: a composition or f(x) outside a domain, an f the
 *     lab gives no inverse (an unrestricted parabola, |x|, and — as the lab
 *     treats them, hasFunctionalInverse — a cubic or a rational f), or an
 *     input off the kept branch of a parabola, where f⁻¹(f(x)) is not x;
 *   - a derivation needs an operand that cannot be typed exactly.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import inverseCompositionGrader from '../../../../functions/shared/serverGrading/tools/inverseCompositionLab.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { round } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  composeValue,
  evaluateSpecWithDomain,
  expectedInverseRestriction,
  functionLabel,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabInitialX,
  inverseLabInputLocked,
  inverseLabRequiredParts,
  inverseValue,
} from '../../../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';
import {
  applyInverseDerivationOperation,
  createLinearInverseDerivation,
  derivationEquationSolvesInverse,
  expectedLinearInverse,
  formatInverseDerivationRelation,
} from '../../../../functions/shared/toolMath/inverseComposition/inverseDerivationMath.mjs';

export const implemented = true;

const MINUS = '−';

/* ------------------------------------------------------------ number text */

const signed = (text) => String(text).replace(/^-/, MINUS);
// An authored constant exactly as written (a, h, k, base, x).
const num = (value) => signed(String(value));
const tidy = (value) => {
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
};

// The smallest denominator (≤ 64) that writes the value exactly — up to
// floating-point dust — or null.
const fractionOf = (value) => {
  for (let denominator = 2; denominator <= 64; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(value - numerator / denominator) <= 1e-9 * Math.max(1, Math.abs(value))) return { numerator, denominator };
  }
  return null;
};

/**
 * A computed value as the review writes it and as a student types it:
 *   decimal   2.5        exact, typed as written
 *   fraction  7/3        exact; typed 2.333 (the lab's boxes are number inputs)
 *   approx    1.414      rounded to 3 places (the grader allows 0.02)
 */
const shown = (value) => {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12) return null;
  const exact = tidy(value);
  const short = Number(exact.toFixed(4));
  if (short === exact) return { text: signed(String(short)), typed: String(short), exact: true, kind: 'decimal' };
  const typed = String(Number(exact.toFixed(3)));
  const fraction = fractionOf(value);
  if (fraction) return { text: signed(`${fraction.numerator}/${fraction.denominator}`), typed, exact: true, kind: 'fraction' };
  return { text: signed(typed), typed, exact: false, kind: 'approx' };
};

// An authored input, written as given (it is exact).
const given = (value) => {
  const text = String(value);
  return /e/i.test(text) ? null : { text: signed(text), typed: text, exact: true, kind: 'decimal' };
};

const answerText = (value) => (value.kind === 'fraction' ? `${value.text} ≈ ${signed(value.typed)}` : value.exact ? value.text : `≈ ${value.text}`);
const eq = (value) => `${value.exact ? '=' : '≈'} ${value.text}`;
const grouped = (value) => (value.kind === 'fraction' || value.text.startsWith(MINUS) ? `(${value.text})` : value.text);

/* ---------------------------------------------------------- the functions */

const FAMILIES = Object.freeze(['linear', 'quadratic', 'absolute', 'cubic', 'squareRoot', 'exponential', 'logarithmic', 'rational']);
const LABELLED_BY_LAB = Object.freeze(['linear', 'quadratic', 'exponential', 'logarithmic', 'squareRoot']);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A function the lab evaluates exactly as authored: a, h, k (and base) only.
const readFunction = (spec) => {
  if (!isRecord(spec)) return null;
  const type = spec.type || 'linear';
  if (!FAMILIES.includes(type)) return null;
  // Fields the lab's label and the grader's evaluation both ignore: a prompt
  // written from them would describe a different function than the one marked.
  if ((spec.b != null && Number(spec.b) !== 1) || spec.m != null || spec.slope != null) return null;
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (![a, h, k, base].every(Number.isFinite) || Math.abs(a) <= 1e-9) return null;
  // Written into the steps as given, so never in exponent notation.
  if ([a, h, k, base].some((value) => /e/i.test(String(value)))) return null;
  return { spec, type, a, h, k, base };
};

const coefficientOf = (fn) => (fn.a === 1 ? '' : fn.a === -1 ? MINUS : num(fn.a));
const tailOf = (fn) => (fn.k === 0 ? '' : ` ${fn.k > 0 ? '+' : MINUS} ${num(Math.abs(fn.k))}`);
const shiftedOf = (inputText, h) => (h === 0 ? inputText : `${inputText} ${h > 0 ? MINUS : '+'} ${num(Math.abs(h))}`);

// "f(x) = …" as the lab writes it (functionLabel), in the same style for the
// families the lab's label does not spell out.
const labelOf = (fn, name) => {
  if (LABELLED_BY_LAB.includes(fn.type)) return functionLabel(fn.spec, name);
  const coefficient = coefficientOf(fn);
  const inside = shiftedOf('x', fn.h);
  if (fn.type === 'absolute') return `${name}(x) = ${coefficient}|${inside}|${tailOf(fn)}`;
  if (fn.type === 'cubic') return `${name}(x) = ${coefficient}${fn.h === 0 ? 'x' : `(${inside})`}³${tailOf(fn)}`;
  return `${name}(x) = ${num(fn.a)}/${fn.h === 0 ? 'x' : `(${inside})`}${tailOf(fn)}`;
};

// The right-hand side with a number put in for x.
const substituted = (fn, input) => {
  const coefficient = coefficientOf(fn);
  const times = coefficient && coefficient !== MINUS ? '·' : '';
  const argument = shiftedOf(input.text, fn.h);
  const tail = tailOf(fn);
  if (fn.type === 'linear') return coefficient === '' && fn.h === 0 ? `${input.text}${tail}` : `${coefficient}(${argument})${tail}`;
  if (fn.type === 'quadratic') return `${coefficient}(${argument})²${tail}`;
  if (fn.type === 'cubic') return `${coefficient}(${argument})³${tail}`;
  if (fn.type === 'absolute') return `${coefficient}|${argument}|${tail}`;
  // A plain non-negative number needs no brackets under a root or over a bar.
  const bare = fn.h === 0 && input.kind === 'decimal' && !input.text.startsWith(MINUS);
  if (fn.type === 'squareRoot') return bare ? `${coefficient}√${input.text}${tail}` : `${coefficient}√(${argument})${tail}`;
  if (fn.type === 'exponential') return `${coefficient}${times}${num(fn.base)}^(${argument})${tail}`;
  if (fn.type === 'logarithmic') return `${coefficient}${times}log_${num(fn.base)}(${argument})${tail}`;
  return bare ? `${num(fn.a)}/${input.text}${tail}` : `${num(fn.a)}/(${argument})${tail}`;
};

// "f(2) = 2(2) + 3 = 7"
const evaluation = (name, fn, input, output) => {
  const work = substituted(fn, input);
  const start = `${name}(${input.text}) = ${work}`;
  return work === output.text ? start : `${start} ${input.exact && output.exact ? '=' : '≈'} ${output.text}`;
};

/* -------------------------------------------------------------- the parts */

// The lab's own words for the restriction select's options.
const RESTRICTION_OPTIONS = Object.freeze({
  none: 'No restriction needed',
  left: 'Use the left branch (x ≤ vertex x)',
  right: 'Use the right branch (x ≥ vertex x)',
});

const compositionSteps = (outerName, outer, innerName, inner, x, xNumber) => {
  const middle = shown(evaluateSpecWithDomain(inner.spec, xNumber));
  const result = shown(composeValue(outer.spec, inner.spec, xNumber));
  if (!middle || !result) return null;
  const name = `(${outerName} ∘ ${innerName})(${x.text})`;
  return {
    name,
    result,
    steps: [
      `For ${name}, ${innerName} is written closest to x, so ${innerName} acts first: ${evaluation(innerName, inner, x, middle)}.`,
      `Then ${outerName} acts on that output: ${evaluation(outerName, outer, middle, result)}, so ${name} ${eq(result)}.`,
    ],
    trace: `${x.text} → ${innerName} → ${middle.text} → ${outerName} → ${result.text}`,
  };
};

// y = mx + c for a linear function, or null.
const linearForm = (fn) => (fn.type === 'linear' ? { m: fn.a, c: fn.k - fn.a * fn.h } : null);

const linearText = (m, c) => {
  const slope = shown(m);
  const constant = shown(Math.abs(c));
  if (!slope?.exact || !constant?.exact || tidy(m) === 0) return null;
  const term = slope.text === '1' ? 'x' : slope.text === `${MINUS}1` ? `${MINUS}x` : `${slope.kind === 'fraction' ? `(${slope.text})` : slope.text}x`;
  return tidy(c) === 0 ? term : `${term} ${c > 0 ? '+' : MINUS} ${constant.text}`;
};

// A formula check when both functions are linear: (f ∘ g)(x) = mx + c.
const composedFormulaCheck = (outerName, outer, innerName, inner, x, xNumber, result) => {
  const o = linearForm(outer);
  const i = linearForm(inner);
  if (!o || !i) return null;
  const m = o.m * i.m;
  const c = o.m * i.c + o.c;
  const formula = linearText(m, c);
  const inside = linearText(i.m, i.c);
  const value = composeValue(outer.spec, inner.spec, xNumber);
  if (!formula || !inside || Math.abs(m * xNumber + c - value) > 1e-9 * Math.max(1, Math.abs(value))) return null;
  return `As one formula, (${outerName} ∘ ${innerName})(x) = ${outerName}(${inside}) = ${formula}, and at x = ${x.text} it gives ${result.exact ? '' : '≈ '}${result.text} again.`;
};

// Undo f in reverse order, starting from y = f(x): each move and its result.
const undoMoves = (fn, start, branch) => {
  const moves = [];
  let value = start;
  const move = (describe, next, work) => {
    const before = shown(value);
    const after = shown(next);
    if (!before || !after) return false;
    moves.push(`${describe}: ${work(before)} ${eq(after)}`);
    value = next;
    return true;
  };
  if (fn.k !== 0 && !move(`undo the ${fn.k > 0 ? '+' : MINUS} ${num(Math.abs(fn.k))}`, value - fn.k,
    (before) => `${before.text} ${fn.k > 0 ? MINUS : '+'} ${num(Math.abs(fn.k))}`)) return null;
  if (fn.a !== 1 && !move(`undo the × ${fn.a < 0 ? `(${num(fn.a)})` : num(fn.a)}`, value / fn.a,
    (before) => `${before.text} ÷ ${fn.a < 0 ? `(${num(fn.a)})` : num(fn.a)}`)) return null;
  if (fn.type === 'quadratic') {
    if (value < -1e-9) return null;
    const root = Math.sqrt(Math.max(0, value));
    if (!move(`undo the square with the ${branch < 0 ? 'negative' : 'positive'} square root (the ${branch < 0 ? 'left' : 'right'} branch)`, branch * root,
      (before) => `${branch < 0 ? MINUS : ''}√${grouped(before)}`)) return null;
  } else if (fn.type === 'squareRoot') {
    if (value < -1e-9) return null;
    if (!move('undo the square root by squaring', value ** 2, (before) => `${grouped(before)}²`)) return null;
  } else if (fn.type === 'exponential') {
    if (!(value > 0)) return null;
    if (!move(`undo the power of ${num(fn.base)} with log base ${num(fn.base)}`, Math.log(value) / Math.log(fn.base),
      (before) => `log_${num(fn.base)}(${before.text})`)) return null;
  } else if (fn.type === 'logarithmic') {
    if (!move(`undo log base ${num(fn.base)} by raising ${num(fn.base)} to that power`, fn.base ** value,
      (before) => `${num(fn.base)}^${grouped(before)}`)) return null;
  } else if (fn.type !== 'linear') {
    return null;
  }
  if (fn.h !== 0 && !move(`undo the ${fn.h > 0 ? MINUS : '+'} ${num(Math.abs(fn.h))} on x`, value + fn.h,
    (before) => `${before.text} ${fn.h > 0 ? '+' : MINUS} ${num(Math.abs(fn.h))}`)) return null;
  return { moves, value };
};

const inverseWork = (f, x, xNumber) => {
  if (!hasFunctionalInverse(f.spec)) return null;
  const fxNumber = evaluateSpecWithDomain(f.spec, xNumber);
  const fx = shown(fxNumber);
  if (!fx) return null;
  const inverseNumber = inverseValue(f.spec, fxNumber);
  const close = (value) => Number.isFinite(value) && Math.abs(value - xNumber) <= 1e-6 * Math.max(1, Math.abs(xNumber));
  // The grader accepts x itself. Where f⁻¹ does not actually send f(x) back to
  // x (an input off the kept branch of a parabola), that is not mathematics a
  // review can explain.
  if (!close(inverseNumber)) return null;
  const restriction = expectedInverseRestriction(f.spec);
  const branch = restriction === 'left' ? -1 : 1;
  const undo = undoMoves(f, fxNumber, branch);
  if (!undo || !close(undo.value)) return null;
  // The lab labels the box with f(x) rounded to 3 places.
  const name = `f⁻¹(${signed(String(round(fxNumber, 3)))})`;
  const undoStep = undo.moves.length
    ? `To find f⁻¹(${fx.text}), undo f's operations in reverse order — ${undo.moves.join('; ')}. So f⁻¹(${fx.text}) = ${x.text}, the input you started with.`
    : `f leaves every input unchanged, so f⁻¹ does too: f⁻¹(${fx.text}) = ${x.text}, the input you started with.`;
  return {
    name,
    fx,
    steps: [
      `f sends the input ${x.text} to ${evaluation('f', f, x, fx)}, so f⁻¹(${fx.text}) is the input that f sends to ${fx.text}.`,
      undoStep,
    ],
    why: `Check by applying f again: f(${x.text}) ${eq(fx)}, so f⁻¹ sends ${fx.text} straight back to ${x.text}. On the graph, (${x.text}, ${fx.text}) on f and (${fx.text}, ${x.text}) on f⁻¹ are mirror images across y = x.`,
  };
};

// Is f always increasing or always decreasing (so already one-to-one)?
const monotoneDirection = (fn) => {
  const sign = ['exponential', 'logarithmic'].includes(fn.type) ? fn.a * Math.log(fn.base) : fn.a;
  if (!['linear', 'squareRoot', 'exponential', 'logarithmic'].includes(fn.type) || !Number.isFinite(sign) || sign === 0) return null;
  return sign > 0 ? 'increasing' : 'decreasing';
};

const restrictionWork = (f) => {
  const expected = expectedInverseRestriction(f.spec);
  const option = RESTRICTION_OPTIONS[expected];
  if (!option) return null;
  if (expected === 'none') {
    const direction = monotoneDirection(f);
    if (!direction) return null;
    return {
      choice: expected,
      value: option,
      steps: [`${labelOf(f, 'f')} is always ${direction}, so no two inputs share an output: f is already one-to-one and has an inverse on its whole domain. Choose “${option}”.`],
      why: 'Because f is one-to-one, every output comes from exactly one input — which is all an inverse function needs.',
    };
  }
  if (f.type !== 'quadratic') return null;
  const vertex = num(f.h);
  const left = shown(f.h - 1);
  const right = shown(f.h + 1);
  const output = shown(f.a + f.k);
  if (!left || !right || !output) return null;
  const side = expected === 'left' ? `x ≤ ${vertex}` : `x ≥ ${vertex}`;
  return {
    choice: expected,
    value: `${option}: ${side}`,
    steps: [
      `${labelOf(f, 'f')} is a parabola with its vertex at x = ${vertex}. The whole parabola is not one-to-one: x = ${left.text} and x = ${right.text} both give y ${eq(output)}, so an inverse could not tell which input to give back.`,
      `Keeping one side of the vertex fixes that. The lab's inverse condition keeps the ${expected} branch, ${side}, so choose “${option}”.`,
    ],
    branchStep: `${labelOf(f, 'f')} is a parabola, so it has an inverse function only on one side of its vertex. The lab's inverse condition keeps the ${expected} branch, ${side}.`,
    why: `On the ${expected} branch (${side}) each output of f comes from exactly one input, so f⁻¹ is a function there.`,
  };
};

/* ------------------------------------------------------------- the review */

const LAB_VIEWS = Object.freeze(['full', 'composition', 'inverse', 'restriction']);
const TITLES = Object.freeze({
  full: 'Composition and inverse solution',
  composition: 'Composition solution',
  inverse: 'Inverse solution',
  restriction: 'Restriction and inverse solution',
});

const acceptedByGrader = (question, work) => {
  const result = gradeWorkWithGrader({ grader: inverseCompositionGrader, question, work });
  return result.graded === true && result.isCorrect === true;
};

const buildLabReview = (question) => {
  // The lab's own reading of its view. Any other value hides the composition
  // boxes while the grader still asks for them: nothing could be right.
  const view = question.mode || 'full';
  if (!LAB_VIEWS.includes(view)) return null;
  if (!isRecord(question.f)) return null;
  const { f: fSpec, g: gSpec } = inverseLabFunctions(question);
  const f = readFunction(fSpec);
  if (!f) return null;
  const parts = inverseLabRequiredParts(view, fSpec);
  const composes = parts.includes('fog') || parts.includes('gof');
  const g = composes && isRecord(question.g) ? readFunction(gSpec) : null;
  if (composes && !g) return null;

  const xValue = inverseLabInitialX(question);
  if (!(typeof xValue === 'number' || (typeof xValue === 'string' && xValue.trim() !== ''))) return null;
  const xNumber = Number(xValue);
  if (!Number.isFinite(xNumber)) return null;
  const x = given(xNumber);
  if (!x) return null;

  const items = [];
  const steps = [];
  const why = [];
  const work = { x: xValue, fogAnswer: '', gofAnswer: '', inverseAnswer: '', restrictionChoice: '' };

  if (composes) {
    const fog = compositionSteps('f', f, 'g', g, x, xNumber);
    const gof = compositionSteps('g', g, 'f', f, x, xNumber);
    if (!fog || !gof) return null;
    items.push({ label: fog.name, value: answerText(fog.result) }, { label: gof.name, value: answerText(gof.result) });
    steps.push(...fog.steps, ...gof.steps);
    work.fogAnswer = fog.result.typed;
    work.gofAnswer = gof.result.typed;
    why.push(fog.result.text === gof.result.text
      ? `The function written closest to x always acts first: ${fog.trace}, and ${gof.trace}. Here the two orders happen to give the same value, which is not true in general.`
      : `The function written closest to x always acts first, so the order matters: ${fog.trace}, but ${gof.trace}.`);
    const formulas = [composedFormulaCheck('f', f, 'g', g, x, xNumber, fog.result), composedFormulaCheck('g', g, 'f', f, x, xNumber, gof.result)];
    if (formulas.every(Boolean)) why.push(...formulas);
  }

  const restriction = parts.includes('restriction') ? restrictionWork(f) : null;
  if (parts.includes('restriction') && !restriction) return null;
  const inverse = parts.includes('inverse') ? inverseWork(f, x, xNumber) : null;
  if (parts.includes('inverse') && !inverse) return null;

  if (restriction) {
    steps.push(...restriction.steps);
    work.restrictionChoice = restriction.choice;
  }
  if (inverse) {
    // An inverse-only view still shows a parabola's restriction select (it is
    // not marked there): the branch is part of the reasoning, not an answer.
    if (!restriction && f.type === 'quadratic') {
      const kept = restrictionWork(f);
      if (!kept?.branchStep) return null;
      steps.push(kept.branchStep);
    }
    steps.push(...inverse.steps);
    work.inverseAnswer = x.typed;
    why.push(inverse.why);
  }
  if (restriction) why.push(restriction.why);
  // Items in the order the grader marks the parts.
  parts.forEach((part) => {
    if (part === 'inverse') items.push({ label: inverse.name, value: x.text });
    if (part === 'restriction') items.push({ label: 'Domain restriction', value: restriction.value });
  });

  if (!acceptedByGrader(question, work)) return null;
  return {
    title: TITLES[view],
    items,
    steps,
    why: why.join(' '),
    note: inverseLabInputLocked(question)
      ? null
      : `This question let you change the input x. The answers above are for x = ${x.text}, where the lab starts; with a different x, follow the same steps with your x.`,
  };
};

// The equation the lab shows, with a true minus sign.
const relationText = (state) => formatInverseDerivationRelation(state).replace(/-/g, MINUS);

// An operand a student can type exactly into the lab's number box.
const typeable = (value) => {
  const text = shown(value);
  return text && text.kind === 'decimal' ? text : null;
};

const buildDerivationReview = (question) => {
  if (!isRecord(question.f)) return null;
  const f = readFunction(question.f);
  if (!f || question.f.type !== 'linear') return null;
  let state = createLinearInverseDerivation(question.f);
  const slope = state.right.x;
  const constant = state.right.c;
  const original = relationText(state);
  const steps = [`Write ${labelOf(f, 'f')} as an equation in x and y: ${original}.`];

  state = applyInverseDerivationOperation(state, 'swapVariables');
  const swapped = relationText(state);
  steps.push(`Swap x and y — this is the step that makes it the inverse, because every output becomes an input: ${swapped}.`);

  if (constant !== 0) {
    const amount = typeable(Math.abs(constant));
    if (!amount) return null;
    state = applyInverseDerivationOperation(state, constant > 0 ? 'subtract' : 'add', Number(amount.typed));
    steps.push(constant > 0
      ? `Subtract ${amount.text} from both sides to clear the constant from the y side: ${relationText(state)}.`
      : `Add ${amount.text} to both sides to clear the constant from the y side: ${relationText(state)}.`);
  }
  if (slope !== 1) {
    const divisor = typeable(slope);
    const reciprocal = divisor ? null : typeable(1 / slope);
    if (!divisor && !reciprocal) return null;
    state = divisor
      ? applyInverseDerivationOperation(state, 'divide', Number(divisor.typed))
      : applyInverseDerivationOperation(state, 'multiply', Number(reciprocal.typed));
    steps.push(divisor
      ? `Divide both sides by ${divisor.text} so y stands alone: ${relationText(state)}.`
      : `Multiply both sides by ${reciprocal.text}, the reciprocal of ${shown(slope).text}, so y stands alone: ${relationText(state)}.`);
  }

  const equation = { left: state.left, right: state.right };
  if (!derivationEquationSolvesInverse(equation, question.f)) return null;
  const relation = relationText(state);
  if (!relation.endsWith(' = y')) return null;
  const inverse = relation.slice(0, -4);
  steps.push(`y is alone, so f⁻¹(x) = ${inverse}.`);

  // A point check: f(1), then f⁻¹ of that output, gives back 1.
  const expected = expectedLinearInverse(question.f);
  const output = shown(slope + constant);
  if (!output?.exact || Math.abs(expected.slope * (slope + constant) + expected.intercept - 1) > 1e-9) return null;
  const pointCheck = `Check with a point: f(1) = ${output.text}, and f⁻¹(${output.text}) = ${inverse.replace(/x/g, `(${output.text})`)} = 1 — f⁻¹ sends f's output back to its input.`;

  const work = {
    equation,
    relation: formatInverseDerivationRelation(state),
    steps: state.history?.length || 0,
  };
  if (!acceptedByGrader(question, work)) return null;
  return {
    title: 'Inverse derivation solution',
    items: [
      { label: 'After swapping x and y', value: swapped },
      { label: 'f⁻¹(x)', value: inverse },
    ],
    steps,
    why: `Every move after the swap did the same thing to both sides, so the final equation still says x = f(y) — solved for y, which is exactly f⁻¹. ${pointCheck}`,
    note: null,
  };
};

export const buildInverseCompositionLabReview = (question) => {
  try {
    if (!isRecord(question)) return null;
    // The grader's own reading of the view, and whether it can mark it at all.
    const support = inverseCompositionGrader.support(question);
    if (!support || support.supported !== true) return null;
    return support.mode === 'deriveInverse' ? buildDerivationReview(question) : buildLabReview(question);
  } catch {
    return null;
  }
};

export default buildInverseCompositionLabReview;
