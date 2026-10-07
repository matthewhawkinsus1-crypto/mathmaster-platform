// Worked solution review for exponentialLogBridge (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE EXPONENTIAL ↔ LOG BRIDGE'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * Every view the bridge draws has one right answer per box, and every one is
 * recomputed here from the question with the helpers the shared grader
 * (functions/shared/serverGrading/tools/exponentialLogBridge.mjs) uses, with
 * the grader's own per-view defaults and the grader's own reading of the view
 * (exponentialLogGrader.support):
 *
 *   equivalentForms   log_b(b^e) = e and b^e        equivalentExpLogValues
 *   solveExponential  log_b(rhs) and x              solveExponentialLinearExponent
 *   solveLogarithmic  b^result and x                solveLogLinearArgument
 *   inverse           f⁻¹(f(x)) = x, x = k, side    normalizeExponentialSpec,
 *                                                   inversePairFeatures
 *   composition       f⁻¹(f(x)) and f(f⁻¹(y))       transformedExponentialValue,
 *                                                   inverseLogValue
 *
 * Before a review is returned, the answers it states — as a student would type
 * them into the bridge's boxes — are graded by that grader through the bytes
 * the server reads (gradeWorkWithGrader). If the grader does not call them
 * correct, the review is null: a review never states an answer the gradebook
 * would reject.
 *
 * Null — never a guess — when:
 *   - the input is not a question of this tool (no `toolId`/`type` naming it);
 *   - the bridge cannot draw the question (base 1, a = 0, m = 0: the grader
 *     calls it 'invalid-question');
 *   - no answer can be right: an exponential equation with a right side ≤ 0,
 *     or a composition whose y is outside the logarithm's domain;
 *   - an authored `equation`, `function` or `exponential` the bridge would not
 *     read as written (not an object, a family other than exponential, a
 *     horizontal scale b ≠ 1) — the review would describe a function the
 *     prompt does not;
 *   - a number it would print is too large, too small to show, or in
 *     exponent notation.
 *
 * Mathematics is written as $…$ (MathText renders it); item labels are plain
 * text because the review panel prints them as they are. Shown only once the
 * question is closed (QuestionEngine); pure, no React.
 */
import exponentialLogGrader from '../../../../functions/shared/serverGrading/tools/exponentialLogBridge.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { round } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  equivalentExpLogValues,
  inverseLogValue,
  inversePairFeatures,
  normalizeExponentialSpec,
  solveExponentialLinearExponent,
  solveLogLinearArgument,
  transformedExponentialValue,
} from '../../../../functions/shared/toolMath/exponentialLog/exponentialLogMath.mjs';

export const implemented = true;

const TOOL_ID = 'exponentialLogBridge';
const MINUS = '−';
const LIMIT = 1e12;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/* ------------------------------------------------------------ number text */

const plainNumber = (value) => {
  if (!Number.isFinite(value)) return null;
  const text = String(Object.is(value, -0) ? 0 : value);
  return /e/i.test(text) ? null : text;
};

/**
 * A number as the review writes it ({ tex }) and as a student types it
 * ({ typed }) — the bridge's boxes are read with Number(), so a fraction is
 * typed as its decimal:
 *   decimal   2.5     exact in at most 4 places
 *   fraction  7/3     exact; typed 2.3333
 *   approx    4.3219  rounded to 4 places (the grader allows 0.01)
 */
const shown = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= LIMIT) return null;
  const near = (candidate) => Math.abs(candidate - value) <= 1e-9 * Math.max(1, Math.abs(value));
  const short = Number(value.toFixed(4));
  const shortText = plainNumber(short);
  if (shortText === null) return null;
  if (near(short)) return { value: short, tex: shortText, typed: shortText, exact: true, kind: 'decimal' };
  for (let denominator = 2; denominator <= 64; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (near(numerator / denominator)) {
      return { value, tex: `${numerator < 0 ? '-' : ''}\\frac{${Math.abs(numerator)}}{${denominator}}`, typed: shortText, exact: true, kind: 'fraction' };
    }
  }
  // A tiny nonzero value would be stated as "≈ 0": nothing honest to show.
  if (short === 0) return null;
  return { value, tex: shortText, typed: shortText, exact: false, kind: 'approx' };
};

// An authored constant, written exactly as the question gives it.
const authored = (raw) => {
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) >= LIMIT) return null;
  const text = plainNumber(value);
  return text === null ? null : { value, tex: text, typed: text, exact: true, kind: 'decimal' };
};

// A number as the bridge prints it in a label (displayNumber: 4 places).
const screenNumber = (value) => {
  const text = plainNumber(round(value, 4));
  return text === null ? null : text.replace(/^-/, MINUS);
};

const relation = (number) => (number.exact ? '=' : '\\approx');
// A fraction is followed by the decimal a student types.
const statedValue = (number) => (number.kind === 'fraction' ? `${number.tex} \\approx ${number.typed}` : number.tex);
const answer = (left, number) => `$${left} ${relation(number)} ${statedValue(number)}$`;

/*
 * "a = b = c ≈ d": each link is [expression, exact?]. Once a rounded number
 * enters the chain every later link is "≈"; a link that repeats the previous
 * expression is dropped.
 */
const chain = (first, links) => {
  let text = first;
  let last = first;
  let exact = true;
  links.forEach(([tex, linkExact]) => {
    if (!tex || tex === last) return;
    exact = exact && linkExact !== false;
    text += ` ${exact ? '=' : '\\approx'} ${tex}`;
    last = tex;
  });
  return text;
};

/* ---------------------------------------------------------------- LaTeX */

const absTex = (number) => number.tex.replace(/^-/, '');
const signedTerm = (number) => `${number.value > 0 ? '+' : '-'} ${absTex(number)}`;
const paren = (tex) => (tex.includes('\\frac') ? `\\left(${tex}\\right)` : `(${tex})`);
const baseTex = (base) => (Number.isInteger(base.value) ? base.tex : `(${base.tex})`);
const powerTex = (base, exponentTex) => `${baseTex(base)}^{${exponentTex}}`;
const logTex = (base, argumentTex) => `\\log_{${base.tex}}\\left(${argumentTex}\\right)`;

// mx + c, and mx + c with a number put in for x.
const coefficientTex = (m, variable) => (m.value === 1 ? variable : m.value === -1 ? `-${variable}` : `${m.tex}${variable}`);
const linearTex = (m, c, variable = 'x') => (c.value === 0 ? coefficientTex(m, variable) : `${coefficientTex(m, variable)} ${signedTerm(c)}`);
const linearAtTex = (m, c, x) => {
  const product = m.value === 1 ? x.tex : m.value === -1 ? `-${paren(x.tex)}` : `${m.tex}${paren(x.tex)}`;
  return c.value === 0 ? product : `${product} ${signedTerm(c)}`;
};

// "3^{4} = 3 · 3 · 3 · 3 = 81", "2^{-3} = 1/2^{3} = 0.125".
const powerEvaluation = (base, exponent, result) => {
  const e = exponent.value;
  const links = [];
  if (Number.isInteger(base.value) && Number.isInteger(e) && e >= 2 && e <= 6) links.push([Array(e).fill(base.tex).join(' \\cdot '), true]);
  if (Number.isInteger(e) && e < 0) links.push([`\\frac{1}{${powerTex(base, authored(-e).tex)}}`, true]);
  links.push([result.tex, result.exact]);
  return chain(powerTex(base, exponent.tex), links);
};

// Solve mx + c = value for x, one balanced move at a time.
const solveLinearStep = (noun, m, c, value, x) => {
  const left = linearTex(m, c);
  if (left === 'x') return `The ${noun} is just x, so $x ${relation(x)} ${x.tex}$.`;
  const parts = [`Solve $${left} ${relation(value)} ${value.tex}$ for x.`];
  if (c.value !== 0) {
    const moved = shown(value.value - c.value);
    if (!moved) return null;
    parts.push(`${c.value > 0 ? `Subtract $${c.tex}$ from` : `Add $${absTex(c)}$ to`} both sides: $${coefficientTex(m, 'x')} ${relation(moved)} ${moved.tex}$.`);
  }
  if (m.value !== 1) parts.push(`Divide both sides by $${m.tex}$: $x ${relation(x)} ${x.tex}$.`);
  return parts.join(' ');
};

/* ------------------------------------------------------- the five views */

const buildEquivalentForms = (question) => {
  // The grader's defaults: 2³ when nothing is authored.
  const values = equivalentExpLogValues({ base: Number(question.base ?? 2), exponent: Number(question.exponent ?? 3) });
  const base = authored(values.base);
  const exponent = authored(values.exponent);
  const result = shown(values.value);
  if (!base || !exponent || !result) return null;
  const power = powerTex(base, exponent.tex);
  const log = logTex(base, result.tex);
  return {
    title: 'Equivalent forms solution',
    items: [
      { label: 'Logarithmic form', value: `$${log} ${relation(result)} ${exponent.tex}$` },
      { label: 'Exponential form', value: answer(power, result) },
    ],
    steps: [
      `Name the three parts: the base is $${base.tex}$, the exponent is $${exponent.tex}$, and the result is $${powerEvaluation(base, exponent, result)}$.`,
      `Exponential form says the base raised to the exponent gives the result: $${power} ${relation(result)} ${result.tex}$.`,
      `Logarithmic form asks the inverse question: what exponent on base $${base.tex}$ gives $${result.tex}$? ${result.exact ? 'That' : `Since $${power} \\approx ${result.tex}$, that`} exponent is $${exponent.tex}$, so $${log} ${relation(result)} ${exponent.tex}$.`,
    ],
    why: `Both forms hold the same three numbers. In $${log} ${relation(result)} ${exponent.tex}$ the base $${base.tex}$ is still the base, the result $${result.tex}$ is the logarithm's input and the exponent $${exponent.tex}$ is its output — raise $${base.tex}$ to that output and you get $${power} ${relation(result)} ${result.tex}$ back.`,
    stated: [exponent, result],
    work: { logAnswer: exponent.typed, expAnswer: result.typed },
  };
};

// The equation the bridge reads: an authored object, or its defaults.
const equationOf = (question) => {
  if (question.equation == null) return {};
  return isRecord(question.equation) ? question.equation : null;
};

const buildSolveExponential = (question) => {
  const equation = equationOf(question);
  if (!equation) return null;
  // The grader's defaults: 2^(2x − 1) = 16.
  const spec = {
    base: Number(equation.base ?? question.base ?? 2),
    m: Number(equation.m ?? 2),
    c: Number(equation.c ?? -1),
    rhs: Number(equation.rhs ?? 16),
  };
  const solution = solveExponentialLinearExponent(spec);
  // A right side ≤ 0: no real x, and no box the grader could accept.
  if (!solution.hasRealSolution) return null;
  const base = authored(spec.base);
  const m = authored(spec.m);
  const c = authored(spec.c);
  const rhs = authored(spec.rhs);
  const exponentValue = shown(solution.exponentValue);
  const x = shown(solution.x);
  if (!base || !m || !c || !rhs || !exponentValue || !x) return null;
  const exponentTex = linearTex(m, c);
  const log = logTex(base, rhs.tex);
  const solve = solveLinearStep('exponent', m, c, exponentValue, x);
  if (!solve) return null;
  const exactCheck = x.exact && exponentValue.exact;
  return {
    title: 'Exponential equation solution',
    items: [
      { label: 'Exponent value', value: answer(log, exponentValue) },
      { label: 'x', value: answer('x', x) },
    ],
    steps: [
      `The unknown is in the exponent of $${powerTex(base, exponentTex)} = ${rhs.tex}$, so rewrite the equation in logarithmic form — the exponent equals the logarithm of the right side: $${exponentTex} = ${log}$.`,
      exponentValue.exact
        ? `Evaluate the logarithm: $${log} = ${exponentValue.tex}$, because $${powerTex(base, exponentValue.tex)} = ${rhs.tex}$.`
        : `Evaluate the logarithm with the change-of-base formula: $${log} = \\frac{\\ln(${rhs.tex})}{\\ln(${base.tex})} \\approx ${exponentValue.tex}$.`,
      solve,
    ],
    why: exactCheck
      ? `Substitute $x = ${x.tex}$ back in: the exponent is $${linearAtTex(m, c, x)} = ${exponentValue.tex}$, and $${powerTex(base, exponentValue.tex)} = ${rhs.tex}$ — the right side of the equation.`
      : `At this x the exponent $${exponentTex}$ equals $${log}$ exactly, and raising $${base.tex}$ to the power $${log}$ gives $${rhs.tex}$ — the right side of the equation. The decimal $${x.tex}$ is that x rounded.`,
    stated: [exponentValue, x],
    work: { exponentAnswer: exponentValue.typed, xAnswer: x.typed },
  };
};

const buildSolveLogarithmic = (question) => {
  const equation = equationOf(question);
  if (!equation) return null;
  // The grader's defaults: log₃(2x + 1) = 2 — base 3, not 2.
  const spec = {
    base: Number(equation.base ?? question.base ?? 3),
    m: Number(equation.m ?? 2),
    c: Number(equation.c ?? 1),
    result: Number(equation.result ?? 2),
  };
  const solution = solveLogLinearArgument(spec);
  if (!solution.domainSatisfied) return null;
  const base = authored(spec.base);
  const m = authored(spec.m);
  const c = authored(spec.c);
  const result = authored(spec.result);
  const argument = shown(solution.argumentValue);
  const x = shown(solution.x);
  if (!base || !m || !c || !result || !argument || !x) return null;
  const argumentTex = linearTex(m, c);
  const power = powerTex(base, result.tex);
  const solve = solveLinearStep('argument', m, c, argument, x);
  if (!solve) return null;
  const exactCheck = x.exact && argument.exact;
  return {
    title: 'Logarithmic equation solution',
    items: [
      { label: 'Required argument value', value: answer(power, argument) },
      { label: 'x', value: answer('x', x) },
    ],
    steps: [
      `Rewrite $${logTex(base, argumentTex)} = ${result.tex}$ in exponential form — the argument equals the base raised to the result: $${argumentTex} = ${power}$.`,
      `Evaluate the power: $${powerEvaluation(base, result, argument)}$, so the argument must be $${argumentTex} ${relation(argument)} ${argument.tex}$.`,
      solve,
      `Check the domain: a logarithm only accepts positive inputs. This x makes the argument $${argumentTex}$ equal to $${power}$, a power of a positive base, so the argument is positive and $x ${relation(x)} ${x.tex}$ is allowed.`,
    ],
    why: exactCheck
      ? `Substitute $x = ${x.tex}$ back in: $${chain(logTex(base, linearAtTex(m, c, x)), [[logTex(base, argument.tex), true], [result.tex, true]])}$, because $${power} = ${argument.tex}$.`
      : `This x makes the argument $${argumentTex}$ equal to $${power}$ exactly, and $${logTex(base, power)} = ${result.tex}$ — the right side of the equation. The decimal $${x.tex}$ is that x rounded.`,
    stated: [argument, x],
    work: { argumentAnswer: argument.typed, xAnswer: x.typed },
  };
};

/* ------------------------------------------ the exponential f and its inverse */

// ExponentialLogBridge.jsx expSpecFromQuestion, as the grader reads it: an
// authored `function`, else `exponential`, else flat a / base / h / k.
const exponentialOf = (question) => {
  const source = question.function || question.exponential;
  if (source) {
    if (!isRecord(source)) return null;
    // The bridge reads a, base, h and k only. Another family, or a horizontal
    // scale, is a function the prompt describes and the screen does not draw.
    if (source.type != null && source.type !== 'exponential') return null;
    if (source.b != null && Number(source.b) !== 1) return null;
  }
  const spec = normalizeExponentialSpec(source || {
    a: question.a ?? 1,
    base: question.base ?? 2,
    h: question.h ?? 0,
    k: question.k ?? 0,
  });
  const fn = { spec, a: authored(spec.a), base: authored(spec.base), h: authored(spec.h), k: authored(spec.k) };
  return fn.a && fn.base && fn.h && fn.k ? fn : null;
};

const shiftTex = (variableTex, h) => (h.value === 0 ? variableTex : `${variableTex} ${h.value > 0 ? '-' : '+'} ${absTex(h)}`);
const scaledTex = (fn, tex) => (fn.a.value === 1 ? tex : fn.a.value === -1 ? `-${tex}` : `${fn.a.tex} \\cdot ${tex}`);
const tailTex = (fn) => (fn.k.value === 0 ? '' : ` ${signedTerm(fn.k)}`);
const fTex = (fn, variableTex = 'x') => `${scaledTex(fn, powerTex(fn.base, shiftTex(variableTex, fn.h)))}${tailTex(fn)}`;

// f⁻¹(input) = log_b((input − k)/a) + h.
// Undoing the scale a: a reflection (a = −1) is a sign change, not a fraction.
const unscaledTex = (fn, tex, bare) => {
  if (fn.a.value === 1) return tex;
  if (fn.a.value === -1) return bare ? `-${tex}` : `-(${tex})`;
  return `\\frac{${tex}}{${fn.a.tex}}`;
};
const inverseTex = (fn, inputTex) => {
  const top = fn.k.value === 0 ? inputTex : `${inputTex} ${fn.k.value > 0 ? '-' : '+'} ${absTex(fn.k)}`;
  const inside = unscaledTex(fn, top, top === 'x');
  const log = logTex(fn.base, inside);
  return fn.h.value === 0 ? log : `${log} ${signedTerm(fn.h)}`;
};
const hTail = (fn) => (fn.h.value === 0 ? '' : ` ${signedTerm(fn.h)}`);

// "f(3) = 2 · 2^{3 − 1} − 3 = 2 · 2^{2} − 3 = 2 · 4 − 3 = 5"
const evaluateForward = (fn, input) => {
  const exponent = shown(input.value - fn.h.value);
  const powerValue = shown(fn.base.value ** (input.value - fn.h.value));
  const output = shown(transformedExponentialValue(fn.spec, input.value));
  if (!exponent || !powerValue || !output) return null;
  const tex = chain(`f(${input.tex})`, [
    [fTex(fn, input.tex), true],
    [`${scaledTex(fn, powerTex(fn.base, exponent.tex))}${tailTex(fn)}`, exponent.exact],
    [`${scaledTex(fn, powerValue.tex)}${tailTex(fn)}`, powerValue.exact],
    [output.tex, output.exact],
  ]);
  return { tex, output, exponent, powerValue };
};

// f⁻¹(f(x₀)) undone back to x₀: the ratio (f(x₀) − k)/a is b^(x₀ − h).
const inverseOfForward = (fn, input, forward) => {
  const ratioTex = forward.powerValue.exact ? forward.powerValue.tex : powerTex(fn.base, forward.exponent.tex);
  return chain(`f^{-1}\\left(${forward.output.tex}\\right)`, [
    [inverseTex(fn, forward.output.tex), true],
    [`${logTex(fn.base, ratioTex)}${hTail(fn)}`, forward.output.exact],
    [`${forward.exponent.tex}${hTail(fn)}`, forward.exponent.exact],
    [input.tex, true],
  ]);
};

const inverseDerivationStep = (fn) => {
  const powerY = powerTex(fn.base, shiftTex('y', fn.h));
  const moves = [];
  let left = 'x';
  if (fn.k.value !== 0) {
    left = `x ${fn.k.value > 0 ? '-' : '+'} ${absTex(fn.k)}`;
    moves.push(`${fn.k.value > 0 ? `subtract $${fn.k.tex}$ from` : `add $${absTex(fn.k)}$ to`} both sides, $${left} = ${scaledTex(fn, powerY)}$`);
  }
  if (fn.a.value !== 1) {
    left = unscaledTex(fn, left, left === 'x');
    moves.push(`${fn.a.value === -1 ? 'multiply both sides by $-1$' : `divide both sides by $${fn.a.tex}$`}, $${left} = ${powerY}$`);
  }
  moves.push(`take $\\log_{${fn.base.tex}}$ of both sides, $${logTex(fn.base, left)} = ${shiftTex('y', fn.h)}$`);
  if (fn.h.value !== 0) {
    moves.push(`${fn.h.value > 0 ? `add $${fn.h.tex}$ to` : `subtract $${absTex(fn.h)}$ from`} both sides, $y = ${inverseTex(fn, 'x')}$`);
  }
  return `Find the inverse: write $y = ${fTex(fn, 'x')}$ and swap x and y to get $x = ${fTex(fn, 'y')}$. Undo the operations on y in reverse order — ${moves.join('; ')}. So $f^{-1}(x) = ${inverseTex(fn, 'x')}$.`;
};

const domainOf = (fn) => {
  const above = fn.a.value > 0;
  return { above, side: above ? 'greater' : 'less', op: above ? '>' : '<', word: above ? 'greater' : 'less' };
};

const buildInverse = (question) => {
  const fn = exponentialOf(question);
  if (!fn) return null;
  // The grader's sample input: x = 2 unless authored.
  const input = authored(Number(question.x ?? 2));
  if (!input) return null;
  const features = inversePairFeatures(fn.spec);
  const domain = domainOf(fn);
  if (features.logarithmDomainSide !== domain.side || features.logarithmVerticalAsymptote !== fn.k.value) return null;
  const forward = evaluateForward(fn, input);
  const label = forward && screenNumber(forward.output.value);
  if (!forward || !label) return null;
  const y = forward.output;
  // The box is labelled with f(x₀) rounded to 4 places; its inverse is x₀
  // exactly only when that label is f(x₀) itself.
  const inverseValue = { ...input, exact: y.kind === 'decimal' };
  const k = fn.k;
  const powerX = powerTex(fn.base, shiftTex('x', fn.h));
  const pointY = y.exact ? y.tex : `f(${input.tex})`;
  return {
    title: 'Inverse function solution',
    items: [
      { label: `f⁻¹(${label})`, value: inverseValue.exact ? `$${input.tex}$` : `$\\approx ${input.tex}$` },
      { label: 'Inverse vertical asymptote', value: `$x = ${k.tex}$` },
      { label: 'Inverse domain', value: `$x ${domain.op} ${k.tex}$` },
    ],
    steps: [
      `Evaluate f at the given input: $${forward.tex}$. So the point $(${input.tex}, ${pointY})$ is on the graph of f.`,
      `An inverse sends every output back to the input it came from, so $f^{-1}(${y.tex}) ${relation(y)} ${input.tex}$, the input you started with.`,
      inverseDerivationStep(fn),
      `Substitute to confirm: $${inverseOfForward(fn, input, forward)}$.`,
      `The power $${powerX}$ is always positive and gets as close to 0 as you like without reaching it, so $f(x) = ${fTex(fn)}$ gets as close to $${k.tex}$ as you like but never equals it: f has the horizontal asymptote $y = ${k.tex}$. Reflecting the graph across $y = x$ turns that horizontal line into the vertical line $x = ${k.tex}$, the vertical asymptote of $f^{-1}$.`,
      `Because $a = ${fn.a.tex}$ is ${domain.above ? 'positive' : 'negative'}, $${scaledTex(fn, powerX)}$ is always ${domain.above ? 'positive' : 'negative'}, so every output of f is ${domain.word} than $${k.tex}$: the range of f is $y ${domain.op} ${k.tex}$. The domain of $f^{-1}$ is the range of f, so $f^{-1}$ is defined for $x ${domain.op} ${k.tex}$.`,
    ],
    why: `Check the reflection: $(${input.tex}, ${pointY})$ is on f, so $(${pointY}, ${input.tex})$ is on $f^{-1}$ — the same point mirrored across $y = x$. The same mirror sends f's horizontal asymptote $y = ${k.tex}$ to the vertical asymptote $x = ${k.tex}$, and f's range $y ${domain.op} ${k.tex}$ to the domain $x ${domain.op} ${k.tex}$ of $f^{-1}$.`,
    stated: [inverseValue],
    work: { inverseAnswer: input.typed, asymptote: k.typed, domainSide: features.logarithmDomainSide },
  };
};

const buildComposition = (question) => {
  const fn = exponentialOf(question);
  if (!fn) return null;
  // The grader's inputs: x = 1, and y = f(x + 1) unless `y` or
  // `inverseSeedX` is authored.
  const xValue = Number(question.x ?? 1);
  const defaultY = transformedExponentialValue(fn.spec, Number(question.inverseSeedX ?? xValue + 1));
  const yValue = Number(question.y ?? defaultY);
  const input = authored(xValue);
  if (!input || !Number.isFinite(yValue)) return null;
  const forward = evaluateForward(fn, input);
  if (!forward) return null;
  // The screen shows y to 4 places; when y is not exactly that, the review
  // starts from the value the student sees.
  const exactY = shown(yValue);
  const fromScreen = !(exactY && exactY.kind === 'decimal');
  const start = fromScreen ? authored(round(yValue, 4)) : exactY;
  const startLabel = screenNumber(yValue);
  // The screen writes x as given in f⁻¹(f(x)).
  const xLabel = input.tex.replace(/^-/, MINUS);
  if (!start || !startLabel || !xLabel) return null;
  const domain = domainOf(fn);
  const ratio = shown((start.value - fn.k.value) / fn.a.value);
  // A y outside the logarithm's domain: f⁻¹(y) does not exist.
  if (!ratio || !(ratio.value > 0)) return null;
  const logValue = shown(Math.log(ratio.value) / Math.log(fn.base.value));
  const back = shown(inverseLogValue(fn.spec, start.value));
  if (!logValue || !back) return null;
  const inverseStart = `f^{-1}\\left(${start.tex}\\right)`;
  const inverseChain = chain(inverseStart, [
    [inverseTex(fn, start.tex), true],
    [`${logTex(fn.base, ratio.tex)}${hTail(fn)}`, ratio.exact],
    [`${logValue.tex}${hTail(fn)}`, logValue.exact],
    [back.tex, back.exact],
  ]);
  const forwardChain = chain(`f\\left(${inverseStart}\\right)`, [
    [fTex(fn, inverseStart), true],
    [`${scaledTex(fn, powerTex(fn.base, logTex(fn.base, ratio.tex)))}${tailTex(fn)}`, ratio.exact],
    [`${scaledTex(fn, ratio.tex)}${tailTex(fn)}`, true],
    [start.tex, true],
  ]);
  const shownY = fromScreen ? `$y = ${start.tex}$, the value on the screen` : `$y = ${start.tex}$`;
  return {
    title: 'Inverse composition solution',
    items: [
      { label: `f⁻¹(f(${xLabel}))`, value: `$${input.tex}$` },
      { label: `f(f⁻¹(${startLabel}))`, value: `$${start.tex}$` },
    ],
    steps: [
      `Apply f first: $${forward.tex}$.`,
      inverseDerivationStep(fn),
      `Apply $f^{-1}$ to that output: $${inverseOfForward(fn, input, forward)}$. So $f^{-1}(f(${input.tex})) = ${input.tex}$, the input you started with.`,
      `Now the other order, starting from ${shownY}. It is in the domain of $f^{-1}$ because $${start.tex} ${domain.op} ${fn.k.tex}$. Apply $f^{-1}$ first: $${inverseChain}$.`,
      `Then apply f: $${forwardChain}$. So $f(f^{-1}(${start.tex})) = ${start.tex}$, the value you started with.`,
    ],
    why: `A function and its inverse undo each other, so composing them in either order gives back the starting value: $f^{-1}(f(${input.tex})) = ${input.tex}$ and $f(f^{-1}(${start.tex})) = ${start.tex}$. The second order works only for a start inside the domain of $f^{-1}$, $x ${domain.op} ${fn.k.tex}$ — which $${start.tex}$ is.`,
    stated: [input, start],
    work: { inverseAfterForward: input.typed, forwardAfterInverse: start.typed },
  };
};

/* ------------------------------------------------------------- the review */

const VIEW_BUILDERS = Object.freeze({
  equivalentForms: buildEquivalentForms,
  solveExponential: buildSolveExponential,
  solveLogarithmic: buildSolveLogarithmic,
  inverse: buildInverse,
  composition: buildComposition,
});

const acceptedByGrader = (question, work) => {
  const result = gradeWorkWithGrader({ grader: exponentialLogGrader, question, work });
  return result.graded === true && result.isCorrect === true;
};

export const buildExponentialLogBridgeReview = (question) => {
  try {
    if (!isRecord(question) || (question.toolId || question.type) !== TOOL_ID) return null;
    // The grader's own reading of the view — the one the bridge draws.
    const support = exponentialLogGrader.support(question);
    if (!support || support.supported !== true) return null;
    const build = Object.prototype.hasOwnProperty.call(VIEW_BUILDERS, support.mode) ? VIEW_BUILDERS[support.mode] : null;
    const review = build ? build(question) : null;
    if (!review || review.steps.some((step) => typeof step !== 'string')) return null;
    if (!acceptedByGrader(question, review.work)) return null;
    const rounded = review.stated.some((number) => number.kind !== 'decimal' || !number.exact);
    return {
      title: review.title,
      items: review.items,
      steps: review.steps,
      why: review.why,
      note: rounded ? 'The answer boxes take decimals, not fractions, and a decimal within 0.01 of the exact value is marked correct.' : null,
    };
  } catch {
    return null;
  }
};

export default buildExponentialLogBridgeReview;
