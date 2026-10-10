import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildStepAlgebra2Review } from '../../src/tools/shared/reviews/stepAlgebra2Review.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  legacySolverWork,
  rewriteLinearFormWork,
} from '../../functions/shared/serverGrading/tools/stepAlgebra2.mjs';

/*
 * JOB K AUDIT — THE STEP ALGEBRA 2 WORKED SOLUTION, RECOMPUTED INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. Over hundreds of seeded draws per shape
 * (plus the edge cases: zero constant, negative and unit coefficients,
 * decimals, fractional answers, lines through the origin, y on both sides),
 * every number and equation the review shows is parsed back out of its text
 * and recomputed with mathjs in exact Fraction arithmetic — never with the
 * builder's or the tool's own helpers:
 *
 *   solver   every equation it writes, each move's effect on both sides, the
 *            stated solution, and every link of the substitution check;
 *   rewrite  every equation its steps write is the original line, the slope,
 *            intercept and x-intercept it names, the arithmetic it quotes,
 *            the "distribute to check" identity and the form of the answer.
 *
 * The answer it states is then graded by the shared grader, and the text is
 * checked for display hygiene ("+ −3", "1x", "−−", −0, NaN, unreduced
 * fractions).
 */

const TOOL_ID = 'stepAlgebra2';
const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

// A small deterministic PRNG (mulberry32), so every run draws the same cases.
const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const int = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];

/* ------------------------------------------------------------- reading text */

const plainMinus = (text) => String(text).replace(/−/g, '-');
// Plain review text ("(5/2)x − 3/2") or the review's TeX as a mathjs expression.
const texToMath = (tex) => {
  let text = String(tex);
  let previous;
  do {
    previous = text;
    text = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
  } while (text !== previous);
  return plainMinus(text)
    .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
    .replace(/\\div/g, '/').replace(/\\cdot/g, '*').replace(/~/g, ' ');
};
const evaluate = (expression, scope = {}) => math.evaluate(texToMath(expression), scope);
const equal = (left, right) => math.equal(math.fraction(left), math.fraction(right));

// A linear expression in x (and y): its coefficients, recovered exactly from three evaluations.
const linearIn = (expression, vars = ['x', 'y']) => {
  const node = math.parse(texToMath(expression));
  const at = (values) => F(node.evaluate(Object.fromEntries(vars.map((name, index) => [name, F(values[index])]))));
  const zero = at(vars.map(() => 0));
  const coefficients = vars.map((_, index) => at(vars.map((__, other) => (other === index ? 1 : 0))).sub(zero));
  // Linear for real: a fourth point agrees.
  const probe = vars.map((_, index) => index + 2);
  const predicted = coefficients.reduce((sum, coefficient, index) => sum.add(coefficient.mul(probe[index])), zero);
  assert.ok(at(probe).equals(predicted), `not linear: ${expression}`);
  return { coefficients, constant: zero };
};

// An equation "L = R" as L − R, linear in x and y.
const equationIn = (text, vars) => {
  const parts = String(text).split('=');
  assert.equal(parts.length, 2, `one equals sign in "${text}"`);
  return linearIn(`(${texToMath(parts[0])}) - (${texToMath(parts[1])})`, vars);
};
// Two linear equations describe the same set: one is a nonzero multiple of the other.
const sameEquation = (first, second) => {
  const a = [...first.coefficients, first.constant];
  const b = [...second.coefficients, second.constant];
  const index = a.findIndex((value) => !value.equals(0));
  if (index < 0 || b[index].equals(0)) return false;
  const ratio = b[index].div(a[index]);
  return a.every((value, position) => value.mul(ratio).equals(b[position]));
};

/* --------------------------------------------------------- display hygiene */

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const assertClean = (model, label) => {
  const texts = [model.title, model.why, model.note, ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])].filter(Boolean);
  texts.forEach((raw) => {
    const text = plainMinus(raw);
    assert.doesNotMatch(text, /undefined|NaN|Infinity|\[object|\bnull\b/, `${label}: leaked value in "${raw}"`);
    assert.doesNotMatch(text, /[+-]\s*-\s*\d|--/, `${label}: a doubled sign in "${raw}"`);
    assert.doesNotMatch(text, /(^|[^\d.}])1\s*[xy]\b/, `${label}: a written-out 1 coefficient in "${raw}"`);
    assert.doesNotMatch(text, /[xy]\d/, `${label}: a coefficient after its variable in "${raw}"`);
    assert.doesNotMatch(text, /(^|[=(,:]\s*)-0(?![\d.\/])/, `${label}: −0 in "${raw}"`);
    for (const [, n, d] of text.matchAll(/(?<![\d.])(\d+)\/(\d+)(?![\d.])/g)) {
      assert.equal(gcd(Number(n), Number(d)), 1, `${label}: ${n}/${d} not in lowest terms in "${raw}"`);
      assert.notEqual(Number(d), 1, `${label}: ${n}/1 in "${raw}"`);
    }
    for (const [, n, d] of text.matchAll(/\\frac\{(\d+)\}\{(\d+)\}/g)) {
      assert.equal(gcd(Number(n), Number(d)), 1, `${label}: \\frac{${n}}{${d}} not in lowest terms in "${raw}"`);
      assert.notEqual(Number(d), 1, `${label}: \\frac{${n}}{1} in "${raw}"`);
    }
  });
};

/* ================================================== default: the solver */

// The equation each solver step ends on, ": <equation>." — and its move.
const MOVE = /\b(subtract|add) ([\d.]+) (?:from|to) both sides: (.+)\.$|\bdivide both sides by (−?[\d.]+): (.+)\.$/;

const auditSolver = (equation, label) => {
  const question = { type: TOOL_ID, toolId: TOOL_ID, equation };
  const model = buildStepAlgebra2Review(question);
  const [a, b, c] = [F(equation.a), F(equation.b), F(equation.c)];
  const solution = c.sub(b).div(a);
  assert.ok(model, `${label}: a review`);
  assertClean(model, label);

  // The opening equation is the question's own ax + b = c.
  const opening = model.steps[0].match(/^(?:Start with|The equation already reads) (.+?)[.:] /);
  assert.ok(opening, `${label}: the opening equation in "${model.steps[0]}"`);
  let state = equationIn(opening[1], ['x']);
  assert.ok(state.coefficients[0].equals(a) && state.constant.equals(b.sub(c)), `${label}: opens on ${opening[1]}, not ${JSON.stringify(equation)}`);

  // Each move does what it says to both sides, and lands on the equation written:
  // the x-term alone on the left (coefficient `coefficient`), `right` on the right.
  let coefficient = a;
  let right = c;
  const moves = [];
  model.steps.slice(1).forEach((step) => {
    const match = step.match(MOVE);
    assert.ok(match, `${label}: a balanced move in "${step}"`);
    if (match[1]) {
      const operand = F(match[2]);
      right = right.add(match[1] === 'subtract' ? operand.neg() : operand);
      moves.push({ operation: match[1], operand: Number(match[2]) });
    } else {
      const divisor = F(plainMinus(match[4]));
      assert.ok(divisor.equals(coefficient), `${label}: divides by the x coefficient in "${step}"`);
      coefficient = coefficient.div(divisor);
      right = right.div(divisor);
      moves.push({ operation: 'divide', operand: Number(plainMinus(match[4])) });
    }
    const [left, rightText] = (match[3] ?? match[5]).split('=');
    const leftSide = linearIn(left, ['x']);
    assert.ok(leftSide.constant.equals(0) && leftSide.coefficients[0].equals(coefficient), `${label}: the left side is ${coefficient.toFraction()}x in "${step}"`);
    assert.ok(F(evaluate(rightText)).equals(right), `${label}: the right side is ${right.toFraction()} in "${step}"`);
    state = equationIn(match[3] ?? match[5], ['x']);
  });

  // The last equation is x = the true solution, and so is the Solution item.
  assert.ok(state.coefficients[0].equals(1) && state.constant.neg().equals(solution), `${label}: ends on x = ${solution.toFraction()}`);
  const stated = model.items.find((item) => item.label === 'Solution').value.match(/^x = (.+)$/);
  assert.ok(stated && F(evaluate(stated[1])).equals(solution), `${label}: the solution item`);
  const summary = model.items.find((item) => item.label === 'Balanced moves').value;
  assert.equal(summary, moves.length
    ? moves.map((move, index) => `${index ? move.operation : move.operation[0].toUpperCase() + move.operation.slice(1)} ${move.operation === 'divide' ? 'by ' : ''}${String(move.operand).replace('-', '−')}`).join(', then ')
    : 'None needed', `${label}: the moves summary matches the steps`);

  // The substitution check: every link of the chain equals c, and starts from x substituted.
  const why = model.why.match(/^Substitute x = (\S+) into (.+?): (.+), the right side\./);
  if (why) {
    assert.ok(F(evaluate(why[1])).equals(solution), `${label}: the check substitutes the solution`);
    assert.ok(sameEquation(equationIn(why[2], ['x']), equationIn(opening[1], ['x'])), `${label}: the check uses the original equation`);
    const links = why[3].split(' = ');
    links.forEach((link) => assert.ok(F(evaluate(link)).equals(c), `${label}: ${link} = ${c.toFraction()} in "${model.why}"`));
    // The first link is the original left side with the solution written in for x.
    assert.ok(links[0].includes(`(${why[1]})`) || links[0].startsWith(why[1]), `${label}: the first link substitutes x in "${model.why}"`);
  } else {
    assert.match(model.why, /^The equation is already x = /, label);
    assert.equal(moves.length, 0, label);
  }

  // A student following the review is marked correct by the shared grader.
  const result = grade(question, legacySolverWork(moves));
  assert.equal(result.isCorrect, true, `${label}: graded correct`);
  assert.equal(result.isComplete, true, `${label}: complete`);
  return model;
};

const DECIMALS = [0.5, 0.25, 0.75, 1.5, 2.5, 0.1, 0.2, 0.3, 1.25, 0.4];
const drawSolver = (random) => {
  const shape = int(random, 0, 3);
  const nonzero = () => {
    const value = int(random, -12, 12);
    return value === 0 ? 1 : value;
  };
  const decimal = () => pick(random, DECIMALS) * (random() < 0.5 ? -1 : 1);
  if (shape === 0) return { a: nonzero(), b: int(random, -20, 20), c: int(random, -30, 30) };
  if (shape === 1) return { a: pick(random, [1, -1]), b: int(random, -9, 9), c: int(random, -9, 9) };
  if (shape === 2) return { a: decimal(), b: random() < 0.3 ? 0 : decimal(), c: int(random, -10, 10) };
  return { a: nonzero(), b: 0, c: random() < 0.3 ? 0 : int(random, -15, 15) };
};

test('solver: 400 seeded draws — every equation, move, value and check recomputed exactly, and graded correct', () => {
  const random = prng(0x5a2);
  for (let index = 0; index < 400; index += 1) {
    const equation = drawSolver(random);
    auditSolver(equation, `draw ${index} ${JSON.stringify(equation)}`);
  }
});

test('solver: edge cases — zero constant, zero answer, unit and negative-unit coefficients, fractional answers', () => {
  [
    { a: 1, b: 0, c: 7 }, { a: 1, b: 0, c: 0 }, { a: -1, b: 0, c: 0 }, { a: -1, b: 0, c: 5 },
    { a: 1, b: -3, c: -3 }, { a: -1, b: 4, c: 4 }, { a: 2, b: 0, c: 0 }, { a: 7, b: 3, c: 5 },
    { a: -7, b: 0, c: -3 }, { a: 0.3, b: 0.1, c: 0.7 }, { a: -0.25, b: 0.75, c: -1 }, { a: 6, b: 1, c: 0 },
    { a: -4, b: -6, c: 0 }, { a: 12, b: 5, c: -5 },
  ].forEach((equation) => auditSolver(equation, JSON.stringify(equation)));
});

test('solver: null only where no exact review exists (a = 0, an untypable operand), never a crash', () => {
  [{ a: 0, b: 3, c: 3 }, { a: 0, b: 2, c: 5 }, { a: 3, b: 1 / 3, c: 7 }, { a: 1 / 3, b: 0, c: 2 }]
    .forEach((equation) => assert.equal(buildStepAlgebra2Review({ type: TOOL_ID, equation }), null, JSON.stringify(equation)));
});

/* ======================================================= rewriteLinearForm */

// The $…$ segments (the odd pieces between dollar signs) that are equations.
const latexEquations = (text) => String(text).split('$').filter((piece, index) => index % 2 === 1 && piece.includes('='));
const itemOf = (model, label) => model.items.find((item) => item.label === label)?.value?.replace(/^\$|\$$/g, '');

// The opening "Start with $…$." quotes the authored equation as the screen
// shows it (it may be written "2x + -3"); hygiene applies to the rest.
const withoutQuote = (model) => {
  const quoted = model.steps[0]?.match(/^Start with \$(.+?)\$\. /);
  return quoted ? { ...model, steps: [model.steps[0].slice(quoted[0].length), ...model.steps.slice(1)] } : model;
};

const auditRewrite = (equation, target, label) => {
  const question = { type: TOOL_ID, toolId: TOOL_ID, mode: 'rewriteLinearForm', targetForm: target, equation };
  const factored = target === 'factoredLinear';
  const model = buildStepAlgebra2Review(question);
  const line = equationIn(equation, ['x', 'y']);
  const [A, B] = line.coefficients;
  const C = line.constant.neg();
  const slope = A.neg().div(B);
  const intercept = C.div(B);
  if (factored && slope.equals(0)) {
    assert.equal(model, null, `${label}: no a(x − c) for slope 0`);
    return null;
  }
  assert.ok(model, `${label}: a review`);
  assertClean(withoutQuote(model), label);

  // Every equation the steps and the why write is the original line.
  [...model.steps, model.why].flatMap(latexEquations).filter((tex) => /y/.test(tex)).forEach((tex) => {
    assert.ok(sameEquation(line, equationIn(tex, ['x', 'y'])), `${label}: "${tex}" is not the line ${equation}`);
  });

  // The answer: y alone, the right side the line's mx + b, in the form asked for.
  const answer = itemOf(model, factored ? 'Factored linear form' : 'Slope-intercept form');
  const [left, right] = answer.split('=').map((side) => side.trim());
  assert.equal(left, 'y', `${label}: y alone`);
  const rightSide = linearIn(right, ['x']);
  assert.ok(rightSide.coefficients[0].equals(slope) && rightSide.constant.equals(intercept), `${label}: ${answer} is y = ${slope.toFraction()}x + ${intercept.toFraction()}`);
  if (factored) {
    const root = intercept.neg().div(slope);
    const form = right.match(/^(.+?)\s*\\left\(\s*x\s*([+-])\s*(.+?)\s*\\right\)$/);
    assert.ok(form, `${label}: ${right} is a(x − c)`);
    assert.ok(F(evaluate(form[1])).equals(slope), `${label}: a is the slope`);
    const c = F(evaluate(form[3])).mul(form[2] === '-' ? 1 : -1);
    assert.ok(c.equals(root), `${label}: c is the x-intercept ${root.toFraction()}`);
    assert.ok(F(evaluate(itemOf(model, 'a (the slope)'))).equals(slope), `${label}: a item`);
    assert.ok(F(evaluate(itemOf(model, 'c (the x-intercept)'))).equals(root), `${label}: c item`);
    // "Since b ÷ a = −c": the quoted division is right.
    const since = model.steps.join(' ').match(/Since \$(.+?) \\div (.+?) = (.+?)\$/);
    if (since) assert.ok(F(evaluate(since[1])).div(F(evaluate(since[2]))).equals(F(evaluate(since[3]))), `${label}: ${since[0]}`);
    // "Distribute to check: $a(x − c) = mx + b$" is an identity.
    const check = model.why.match(/^Distribute to check: \$(.+?) = (.+?)\$/);
    assert.ok(check, `${label}: the distribute check`);
    const [p, q] = [linearIn(check[1], ['x']), linearIn(check[2], ['x'])];
    assert.ok(p.coefficients[0].equals(q.coefficients[0]) && p.constant.equals(q.constant), `${label}: ${check[0]}`);
  } else {
    assert.ok(F(evaluate(itemOf(model, 'Slope m'))).equals(slope), `${label}: m item`);
    assert.ok(F(evaluate(itemOf(model, 'y-intercept b'))).equals(intercept), `${label}: b item`);
  }
  // "Divide both sides by $k$": k is the y coefficient of the equation before it.
  model.steps.forEach((step, index) => {
    const divide = step.match(/^Divide both sides by \$(.+?)\$/);
    if (!divide) return;
    const before = latexEquations(model.steps[index - 1]).at(-1);
    assert.ok(F(evaluate(divide[1])).equals(equationIn(before, ['x', 'y']).coefficients[1]), `${label}: divides by the y coefficient`);
  });
  // "Multiplying both sides of … by $k$ gives back …": k really maps one to the other.
  const multiply = model.why.match(/^Multiplying both sides of \$y = (.+?)\$ by \$(.+?)\$ gives back \$(.+?) = (.+?)\$/);
  if (multiply) {
    const k = F(evaluate(multiply[2]));
    assert.ok(linearIn(multiply[3], ['y']).coefficients[0].equals(k), `${label}: k·y on the left`);
    const scaled = linearIn(multiply[1], ['x']);
    const result = linearIn(multiply[4], ['x']);
    assert.ok(scaled.coefficients[0].mul(k).equals(result.coefficients[0]) && scaled.constant.mul(k).equals(result.constant), `${label}: ${multiply[0]}`);
  }

  // The shared grader marks the stated equation correct.
  const finished = { left: 'y', right: texToMath(right) };
  const result = grade(question, rewriteLinearFormWork(finished, [{ after: finished }]));
  assert.equal(result.isCorrect, true, `${label}: graded correct (${JSON.stringify(finished)})`);
  assert.equal(result.isComplete, true, `${label}: complete`);
  return model;
};

const term = (coefficient, name) => {
  if (coefficient === 0) return '';
  if (coefficient === 1) return name;
  if (coefficient === -1) return `-${name}`;
  return `${coefficient}${name}`;
};
const join = (pieces) => pieces.filter(Boolean).join(' + ').replace(/\+ -/g, '- ') || '0';

// A line A·x + B·y = C, written the ways a teacher writes one.
const drawLine = (random) => {
  const A = int(random, -9, 9);
  let B = int(random, -9, 9);
  if (B === 0) B = pick(random, [1, -1, 2, -3]);
  const C = random() < 0.2 ? 0 : int(random, -24, 24);
  const shape = int(random, 0, 4);
  if (shape === 0) return `${join([term(A, 'x'), term(B, 'y')])} = ${C}`;
  if (shape === 1) return `${term(B, 'y')} = ${join([term(-A, 'x'), C ? String(C) : ''])}`;
  if (shape === 2) {
    // Point-slope: y − y1 = m(x − x1) with m = −A/B.
    const x1 = int(random, -5, 5);
    const y1 = int(random, -5, 5);
    const shift = (name, value) => (value < 0 ? `${name} + ${-value}` : `${name} - ${value}`);
    const divisor = gcd(A, B) * Math.sign(B);
    const [n, d] = [-A / divisor || 0, B / divisor];
    return `${shift('y', y1)} = ${d === 1 ? n : `(${n}/${d})`}(${shift('x', x1)})`;
  }
  if (shape === 3) {
    const k = int(random, 1, 9);
    return `${join([term(B, 'y'), String(k)])} = ${join([term(-A, 'x'), String(C + k)])}`;
  }
  return `${C} = ${join([term(A, 'x'), term(B, 'y')])}`;
};

test('rewrite: 300 seeded lines per target — every equation shown is the line, every value recomputed, the answer graded correct', () => {
  for (const target of ['factoredLinear', 'slopeIntercept']) {
    const random = prng(target === 'factoredLinear' ? 0xfac : 0x51e);
    let reviewed = 0;
    for (let index = 0; index < 300; index += 1) {
      const equation = drawLine(random);
      if (auditRewrite(equation, target, `${target} draw ${index}: ${equation}`)) reviewed += 1;
    }
    assert.ok(reviewed > 250, `${target}: most draws reviewed (${reviewed})`);
  }
});

test('rewrite: edge cases — through the origin, slope ±1, horizontal, fractions and decimals, y on both sides', () => {
  const cases = [
    'y = 2x', 'y = -x', 'x + y = 0', '4x = 2y', '3x - 4y = 0', 'y = x - 4', '3 = y - x', 'y = 2y + x - 3',
    'x/2 + y/3 = 1', '0.5x + 0.25y = 2', '-y = 2x + 4', 'y - 2 = 3(x - 1)', '2y + 3 = 4x - 5',
    'y - 7 = -(2/3)(x + 3)', 'y = (6 - 5x)/2', '5x + 2y = 6', 'y = 7', '2y = 6', 'y = 5x - 20', 'y = 2(x - 3)',
  ];
  for (const target of ['factoredLinear', 'slopeIntercept']) cases.forEach((equation) => auditRewrite(equation, target, `${target}: ${equation}`));
});

test('rewrite: null only for a vertical line, a factored target with slope 0, or no line — never a crash', () => {
  for (const equation of ['x = 7', '2x = 6', 'y = 7', 'y = x^2', 'y = mx + 3']) {
    const question = { type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation };
    assert.doesNotThrow(() => buildStepAlgebra2Review(question));
    assert.equal(buildStepAlgebra2Review(question), null, equation);
  }
  for (const equation of ['x = 7', 'y = x^2']) {
    assert.equal(buildStepAlgebra2Review({ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation }), null, equation);
  }
});

test('rewrite: a left side that only simplifies to y (y − 0 = …) is answered as y = …, never claimed to be y alone', () => {
  // Defect found by this audit: the grader simplifies the left side, so the
  // point-slope "y − 0 = 2(x − 3)" is already factored form, and the review
  // stated "y-0 = 2(x − 3)" itself as the answer, "with y alone on the left".
  const factored = buildStepAlgebra2Review({ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y - 0 = 2(x - 3)' });
  assert.equal(itemOf(factored, 'Factored linear form'), 'y = 2\\left(x - 3\\right)');
  assert.match(factored.steps[0], /left side simplifies to y/);
  auditRewrite('y - 0 = 2(x - 3)', 'factoredLinear', 'y − 0, factored');
  const slope = buildStepAlgebra2Review({ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation: 'y - 0 = 2(x - 3)' });
  assert.equal(itemOf(slope, 'Slope-intercept form'), 'y = 2x - 6');
  assert.ok(slope.steps.every((step) => !/y is already alone/.test(step)), 'y − 0 is not "already alone"');
  auditRewrite('y - 0 = 2(x - 3)', 'slopeIntercept', 'y − 0, slope-intercept');
  auditRewrite('y + 0 = -3(x + 1)', 'factoredLinear', 'y + 0, factored');
});

test('rewrite: an authored right side the grader calls finished is still answered in the form, written the review\'s way', () => {
  // Defect found by the verifier: when the grader treats the original as
  // finished, the review showed the authored right side verbatim as the
  // answer ("y = 2 x+-3", "y = 1 x+2", "y = x2-6") and called −(x + 1)
  // "written as mx + b". The authored equation is still quoted once, as the
  // equation the student was given; everything after it is the review's own.
  const cases = [
    ['slopeIntercept', 'y = 2x + -3', 'y = 2x - 3'],
    ['slopeIntercept', 'y = 1x + 2', 'y = x + 2'],
    ['slopeIntercept', 'y = -1x', 'y = -x'],
    ['slopeIntercept', 'y = x*2 - 6', 'y = 2x - 6'],
    ['slopeIntercept', 'y = -(x+1)', 'y = -x - 1'],
    ['slopeIntercept', 'y = 0.5x + 3', 'y = \\frac{1}{2}x + 3'],
    ['factoredLinear', 'y = 2(x + -3)', 'y = 2\\left(x - 3\\right)'],
  ];
  for (const [target, equation, expected] of cases) {
    const label = `${target}: ${equation}`;
    const model = buildStepAlgebra2Review({ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: target, equation });
    assert.equal(itemOf(model, target === 'factoredLinear' ? 'Factored linear form' : 'Slope-intercept form'), expected, label);
    assert.ok(model.steps.every((step) => !/already has y alone on the left and the right side written/.test(step)), `${label}: not "already" in the form`);
    // The screen's own LaTeX writes x*2 as "x2" (rewriteLinearFormMath.js,
    // outside this builder), so that one quoted start is not re-parsed.
    if (!equation.includes('*')) auditRewrite(equation, target, label);
  }
  // Authored exactly in the form: still "already", with the same answer.
  for (const [target, equation] of [['slopeIntercept', 'y = 2x - 3'], ['slopeIntercept', 'y = (5/2)x + 3'], ['factoredLinear', 'y = 2(x - 3)'], ['factoredLinear', 'y = (5/2)(x - 4)'], ['factoredLinear', 'y = 2*(x-3)']]) {
    const model = buildStepAlgebra2Review({ type: TOOL_ID, mode: 'rewriteLinearForm', targetForm: target, equation });
    assert.match(model.steps[0], /already has y alone on the left/, `${target}: ${equation}`);
    auditRewrite(equation, target, `${target}: ${equation}`);
  }
});
