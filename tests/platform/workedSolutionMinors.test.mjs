// WORKED-SOLUTION MINORS LEFT FROM THE K AUDIT (FB15, audit A1-59 / H-88).
//
// The closed-question review shows a family's own worked solution when an item
// has no authored steps. The K audit left five small things:
//
//   1. a literal equation's steps put terms and letters in an order nobody
//      writes: "Divide both sides by hw" for V = lwh, "2hπr", "2b + p = 3a";
//      and a power on a run of letters bound to all of them: at² read (at)²,
//      so s = ut + ½at² showed "a²t²" and E = mc² had no solution at all;
//   2. two single-variable equations named "by substitution" got no solution
//      and no similar problem;
//   3. "x+0.3333333333333333" echoed from an authored choice;
//   4. "never is" in a sign chart's last step;
//   5. many fractional-coefficient systems got nothing (no longer reproduces:
//      the sweep at the bottom keeps it that way).
//
// Every claim about mathematics here is checked with mathjs on numbers, never
// with the family's own helpers: the stated answer has to satisfy the original
// equation, and every equation a step writes has to be true at that same
// assignment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import * as systems from '../../src/platform/supports/families/systems.js';
import * as inverseComposition from '../../src/platform/supports/families/inverseComposition.js';
import * as pointsAndIntervals from '../../src/platform/supports/families/pointsAndIntervals.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { latexToExpression } from '../../functions/shared/algebra/latexToExpression.mjs';

const math = create(all);

/* ------------------------------------------------------------ the oracle */

// "Lowercase letters standing together are separate variables" is the platform's
// convention for a formula (bh = b·h); a power binds to the last letter alone.
const toMath = (latex) => latexToExpression(String(latex).trim())
  .replace(/(?<![A-Za-z\\_])(?!pi(?![A-Za-z]))[a-z]{2,3}(?![A-Za-z(])/g, (run) => run.split('').join('*'))
  // m(x - a) is m times a group here, never a call of a function m.
  .replace(/([A-Za-z0-9_)])\(/g, '$1*(');

const lettersOf = (...latexes) => [...new Set(latexes.flatMap((latex) => (toMath(latex).replace(/\bpi\b/g, '').match(/[A-Za-z]+(?:_\d+)?/g) || [])))];
const residual = (equation, scope) => {
  const [left, right] = equation.split('=');
  return math.evaluate(`(${toMath(left)}) - (${toMath(right)})`, scope);
};
const mathSegments = (step) => [...step.matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);

const scopeFor = (letters, salt) => Object.fromEntries(letters.map((letter, index) => [letter, 2 + ((index * 5 + salt * 3) % 7) + (index + salt) / 8]));

const literal = (formula, target) => linearEquations.workedSolution({
  type: 'literal', formulaLatex: formula, solveFor: target, prompt: `Solve $${formula}$ for $${target}$.`,
});

/**
 * Every step is true where the stated answer puts the target, and the answer
 * solves the original. `readAs` spells the formula for mathjs when its letters
 * are not all separate variables (Prt, one run holding the letter solved for).
 */
const assertSound = (formula, target, readAs = formula) => {
  const worked = literal(formula, target);
  assert.ok(worked, `${formula} for ${target}: a worked solution`);
  const stated = /\$([A-Za-z]) = (.+)\$\.$/.exec(worked.answerSummary);
  assert.ok(stated && stated[1] === target, `${formula}: ${worked.answerSummary}`);
  const letters = lettersOf(readAs).filter((letter) => letter !== target);
  for (const salt of [0, 1, 2]) {
    const scope = scopeFor(letters, salt);
    const assigned = { ...scope, [target]: math.evaluate(toMath(stated[2]), scope) };
    assert.ok(Math.abs(residual(readAs, assigned)) < 1e-9, `${formula}: the stated answer ${stated[2]} solves it`);
    worked.steps.forEach((step) => mathSegments(step).filter((segment) => segment.includes('=')).forEach((equation) => {
      assert.ok(Math.abs(residual(equation, assigned)) < 1e-9, `${formula} for ${target}: "${equation}" in "${step}" is true`);
    }));
  }
  return worked;
};

/* ------------------------------------------------------ 1. literal steps */

test('a literal equation\'s letters and terms stay in the order the formula wrote them', () => {
  // Letters inside a term: the formula\'s own, not alphabetical.
  assert.deepEqual(literal('V = lwh', 'l').steps, ['Divide both sides by $wh$: $l = \\frac{V}{wh}$.']);
  assert.deepEqual(literal('V = lwh', 'w').steps, ['Divide both sides by $lh$: $w = \\frac{V}{lh}$.']);
  assert.deepEqual(literal('A = \\pi r h', 'r').steps, ['Divide both sides by $\\pi h$: $r = \\frac{A}{\\pi h}$.']);
  assert.equal(literal('S = 2\\pi r^2 + 2\\pi rh', 'h').steps[0], 'Subtract $2\\pi r^{2}$ from both sides: $S - 2\\pi r^{2} = 2\\pi rh$.');
  assert.deepEqual(literal('s = ut + vt', 'u').steps, ['Subtract $vt$ from both sides: $s - vt = ut$.', 'Divide both sides by $t$: $u = \\frac{s - vt}{t}$.']);
  assert.equal(literal('w = 5 + vt', 't').steps[0], 'Subtract $5$ from both sides: $w - 5 = vt$.');
  // The solved-for letter keeps its place in the term, whichever letter it is.
  assert.equal(literal('w = 5 + vt', 'v').steps[0], 'Subtract $5$ from both sides: $w - 5 = vt$.');
  assert.equal(literal('y = mx + b', 'm').steps[0], 'Subtract $b$ from both sides: $y - b = mx$.');
  assert.equal(literal('y = mx + b', 'x').steps[0], 'Subtract $b$ from both sides: $y - b = mx$.');
  // A term moved across the equals sign goes after the ones already there.
  assert.equal(literal('p = 3a - 2b', 'a').steps[0], 'Add $2b$ to both sides: $p + 2b = 3a$.');
  assert.equal(literal('M = wl - dh', 'w').steps[0], 'Add $dh$ to both sides: $M + dh = wl$.');
  assert.equal(literal('y - 3 = m(x - 2)', 'x').steps[1], 'Add $2m$ to both sides: $y - 3 + 2m = mx$.');
  assert.equal(literal('k = 2g - c + dg', 'g').steps[0], 'Add $c$ to both sides: $k + c = 2g + dg$.');
  // A factored coefficient reads in the formula\'s order too.
  assert.equal(literal('A = P + Prt', 'P').steps[0], 'Factor $P$ out of the $P$-terms: $A = P\\left(1 + rt\\right)$.');
});

test('a side that would open with a minus sign still opens with a plus', () => {
  assert.equal(literal('T = 11 - 3k', 'k').steps.at(-1), 'Divide both sides by $-3$: $k = \\frac{11 - T}{3}$.');
  assert.equal(literal('q = pr - st', 's').steps.at(-1), 'Divide both sides by $-t$: $s = \\frac{pr - q}{t}$.');
  assert.equal(literal('y - b = mx', 'b').steps[0], 'Subtract $y$ from both sides: $-b = mx - y$.');
});

const FORMULAS = [
  ['A = bh + c', 'h'], ['A = 5r - 3', 'r'], ['P = 2l + 2w', 'w'], ['y = mx + b', 'x'], ['y = mx + b', 'm'], ['y = mx + b', 'b'],
  ['C = \\frac{5}{9}(F - 32)', 'F'], ['V = lwh', 'l'], ['V = lwh', 'h'], ['d = rt', 't'], ['ax + by = c', 'y'], ['ax + by = c', 'x'],
  ['T = 11 - 3q', 'q'], ['y - b = m(x - a)', 'x'], ['y - y_1 = m(x - x_1)', 'x'], ['S = 2\\pi r^2 + 2\\pi rh', 'h'],
  ['A = \\frac{1}{2}bh', 'b'], ['A = \\frac{1}{2}(a + b)h', 'a'], ['F = \\frac{9}{5}C + 32', 'C'], ['v = u + at', 'a'],
  ['p = 3a - 2b', 'a'], ['p = 3a - 2b', 'b'], ['z = c - dw', 'w'], ['ax + b = cx + d', 'x'], ['SA = 2lw + 2lh + 2wh', 'h'],
  ['A = P + Prt', 'P', 'A = P + P*r*t'], ['s = ut + vt', 'u'], ['M = wl - dh', 'w'], ['k = 2g - c + dg', 'g'], ['A = \\pi r h', 'r'],
];

test('every step of a literal solution is still true, and the answer still solves the formula', () => {
  FORMULAS.forEach(([formula, target, readAs]) => assertSound(formula, target, readAs));
});

/* ----------------------------------------- 1b. a power on a run of letters */

test('a power on a run of letters belongs to the last letter: at² is a·t², never (at)²', () => {
  assert.deepEqual(literal('A = at^2', 'a').steps, ['Divide both sides by $t^{2}$: $a = \\frac{A}{t^{2}}$.']);
  assert.deepEqual(literal('E = mc^2', 'm').steps, ['Divide both sides by $c^{2}$: $m = \\frac{E}{c^{2}}$.']);
  assert.deepEqual(literal('K = \\frac{1}{2}mv^2', 'm').steps, ['Multiply both sides by $2$ to clear the fraction: $2K = mv^{2}$.', 'Divide both sides by $v^{2}$: $m = \\frac{2K}{v^{2}}$.']);
  const upward = assertSound('s = ut + \\frac{1}{2}at^2', 'u');
  assert.equal(upward.steps[0], 'Multiply both sides by $2$ to clear the fraction: $2s = 2ut + at^{2}$.');
  assert.equal(upward.steps.at(-1), 'Divide both sides by $2t$: $u = \\frac{2s - at^{2}}{2t}$.');
  assertSound('s = ut + \\frac{1}{2}at^2', 'a');
  assertSound('A = at^2', 'a');
  assertSound('E = mc^2', 'm');
  assertSound('V = \\pi r^2 h', 'h');
  // A bracketed product keeps its power whole: (at)² really is a²t².
  assert.equal(literal('A = (at)^2', 'a'), null, 'a² in a is not a linear solve');
});

/* ----------------------------------------------- 2. two one-variable equations */

const system = (equations, extra = {}) => ({
  type: 'system', prompt: `Solve the system $${equations[0]}$ and $${equations[1]}$.`, equationsLatex: equations, ...extra,
});
const numbersIn = (text) => [...String(text).matchAll(/(?<![\d.])\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
const valueOf = (latex) => math.evaluate(toMath(latex));
const pairIn = (text) => {
  const match = /\(([^,]+), ([^)]+)\)/.exec(String(text).replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2'));
  assert.ok(match, `a pair in "${text}"`);
  return { x: valueOf(match[1]), y: valueOf(match[2]) };
};
const holdsAt = (equation, point) => Math.abs(residual(equation, point)) < 1e-9;

const SEPARATE = [
  ['3x = 6', 'y - 4 = 1'], ['2x + 1 = 7', '3y - 6 = 0'], ['\\frac{1}{2}x = 3', '\\frac{2}{3}y = 4'],
  ['0.5x = 2', '0.25y = 1.5'], ['-5y = 10', 'x - 9 = 0'], ['4x = -8', 'y + 3 = 5'],
];

test('two one-variable equations named "by substitution" get a worked solution, hints and a similar problem', () => {
  for (const equations of SEPARATE) {
    const label = equations.join(' ; ');
    const question = system(equations, { method: 'substitution' });
    const worked = systems.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    const point = pairIn(worked.answerSummary);
    equations.forEach((equation) => assert.ok(holdsAt(equation, point), `${label}: the stated pair solves ${equation}`));
    worked.steps.flatMap(mathSegments).filter((segment) => segment.includes('=')).forEach((equation) => {
      assert.ok(holdsAt(equation, point), `${label}: "${equation}" is true at the pair`);
    });
    assert.equal(worked.steps.length, 3, `${label}: one step for each equation, then the pair`);
    assert.match(worked.headline, /solve each equation on its own/, label);

    const hints = systems.hints(question);
    assert.ok(hints.length >= 3, `${label}: a hint ladder`);
    hints.forEach((hint) => assert.ok(![point.x, point.y].some((value) => numbersIn(hint).includes(Math.abs(value))), `${label}: "${hint}" names no coordinate`));

    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sibling = systems.similarProblem(question, { seed });
      assert.ok(sibling, `${label}: a similar problem for seed ${seed}`);
      const siblingEquations = mathSegments(sibling.prompt).filter((segment) => segment.includes('='));
      assert.equal(siblingEquations.length, 2, `${sibling.prompt}: two equations`);
      assert.deepEqual(siblingEquations.map((equation) => /x/.test(equation) + 2 * /y/.test(equation)).sort(), [1, 2], `${sibling.prompt}: one equation in x and one in y`);
      const answer = pairIn(sibling.answer);
      siblingEquations.forEach((equation) => assert.ok(holdsAt(equation, answer), `${sibling.prompt}: ${sibling.answer} solves ${equation}`));
      sibling.steps.flatMap(mathSegments).filter((segment) => segment.includes('=')).forEach((equation) => assert.ok(holdsAt(equation, answer), `${sibling.prompt}: "${equation}"`));
      // Another problem: its answer is not this one, and it prints none of this answer's numbers.
      assert.ok(!(answer.x === point.x && answer.y === point.y), `${label}: a different answer`);
      const printed = numbersIn([sibling.prompt, ...sibling.steps, sibling.answer].join(' '));
      assert.ok(![point.x, point.y].some((value) => printed.includes(Math.abs(value))), `${label}: the similar problem prints a coordinate of this one (${sibling.prompt})`);
    }
  }
});

test('the method a question names does not change a pair of one-variable equations', () => {
  for (const equations of SEPARATE) {
    const answers = ['substitution', 'elimination', undefined].map((method) => {
      const worked = systems.workedSolution(system(equations, method ? { method } : {}));
      assert.ok(worked, `${equations.join(' ; ')} by ${method}: a worked solution`);
      return worked.answerSummary;
    });
    assert.equal(new Set(answers).size, 1, equations.join(' ; '));
  }
});

test('an equation written y - 4 = 1 is shown as written, never as "y = 5, so y = 5"', () => {
  const worked = systems.workedSolution(system(['3x = 6', 'y - 4 = 1'], { method: 'substitution' }));
  assert.deepEqual(worked.steps, [
    'The first equation has only $x$ in it: $3x = 6$, so $x = 2$.',
    'The second equation has only $y$ in it: $y - 4 = 1$, so $y = 5$.',
    'So the solution of the system is $(2, 5)$.',
  ]);
  // The same holds when the single-variable equation is the second one of a substitution.
  const isolated = systems.workedSolution(system(['x = 2y - 1', 'y - 4 = 1'], { method: 'substitution' }));
  assert.ok(isolated.steps.some((step) => step.includes('$y - 4 = 1$, so $y = 5$')), isolated.steps.join(' | '));
  assert.ok(!isolated.steps.some((step) => /\$y = 5\$, so \$y = 5\$/.test(step)), isolated.steps.join(' | '));
});

/* ---------------------------------- 3. fractional-coefficient systems (kept working) */

const lcg = (seed) => {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
};

test('systems with fractional or decimal coefficients, in four notations and three methods, keep their solution and similar problem', () => {
  const random = lcg(20261025);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const fraction = (n, d) => { const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
  const word = ({ n, d }, form) => {
    if (d === 1) return String(n);
    const sign = n < 0 ? '-' : '';
    return form === 'plain' ? `${sign}${Math.abs(n)}/${d}` : `${sign}\\frac{${Math.abs(n)}}{${d}}`;
  };
  const term = (coef, letter, form) => {
    if (coef.n === 0) return null;
    const magnitude = { n: Math.abs(coef.n), d: coef.d };
    const unit = magnitude.n === 1 && magnitude.d === 1;
    let body;
    if (unit) body = letter;
    else if (form === 'decimal' && [2, 4, 5].includes(magnitude.d)) body = `${magnitude.n / magnitude.d}${letter}`;
    else if (form === 'overLetter') body = magnitude.d === 1 ? `${magnitude.n}${letter}` : `\\frac{${magnitude.n === 1 ? '' : magnitude.n}${letter}}{${magnitude.d}}`;
    else if (form === 'plain') body = magnitude.d === 1 ? `${magnitude.n}${letter}` : `(${magnitude.n}/${magnitude.d})${letter}`;
    else body = magnitude.d === 1 ? `${magnitude.n}${letter}` : `\\frac{${magnitude.n}}{${magnitude.d}}${letter}`;
    return { sign: coef.n < 0 ? '-' : '+', body };
  };
  const equation = (a, b, c, form) => {
    const parts = [term(a, 'x', form), term(b, 'y', form)].filter(Boolean);
    const left = parts.map((part, index) => (index === 0 ? (part.sign === '-' ? `-${part.body}` : part.body) : ` ${part.sign} ${part.body}`)).join('');
    const right = form === 'decimal' && [1, 2, 4, 5].includes(c.d) ? String(c.n / c.d) : word(c, form === 'plain' ? 'plain' : 'latex');
    return `${left} = ${right}`;
  };
  const forms = ['frac', 'overLetter', 'plain', 'decimal'];
  const methods = ['elimination', 'substitution', undefined];
  const seen = new Set();
  let checked = 0;
  while (checked < 120) {
    const form = pick(forms);
    const method = pick(methods);
    const coef = () => { let n = 0; while (!n) n = int(-6, 6); return fraction(n, pick([1, 2, 3, 4, 5, 6])); };
    const rows = [{ a: coef(), b: coef() }, { a: coef(), b: coef() }];
    const px = fraction(int(-6, 6), pick([1, 1, 2, 3]));
    const py = fraction(int(-6, 6), pick([1, 1, 2, 3]));
    const det = (rows[0].a.n / rows[0].a.d) * (rows[1].b.n / rows[1].b.d) - (rows[0].b.n / rows[0].b.d) * (rows[1].a.n / rows[1].a.d);
    if (Math.abs(det) < 1e-9) continue;
    const constant = (row) => fraction(
      row.a.n * px.n * row.b.d * py.d + row.b.n * py.n * row.a.d * px.d,
      row.a.d * px.d * row.b.d * py.d,
    );
    const equations = rows.map((row) => equation(row.a, row.b, constant(row), form));
    const question = system(equations, method ? { method } : {});
    const label = `${form} ${method || 'no method'}: ${equations.join(' ; ')}`;
    const worked = systems.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    const point = pairIn(worked.answerSummary);
    equations.forEach((text) => assert.ok(holdsAt(text, point), `${label}: the stated pair solves ${text}`));
    assert.ok(systems.similarProblem(question, { seed: 1 }), `${label}: a similar problem`);
    seen.add(form);
    checked += 1;
  }
  assert.equal(seen.size, 4, 'every notation was drawn');
});

/* --------------------------------------------- 4. a float echoed from a choice */

const compile = (prompt, responses) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'FB15', courseId: 'algebra2' },
  sections: [{ role: 'practice', questions: [{ standard: 'A2.2B', dok: 2, difficultyBand: 2, prompt, studentActions: ['multipleResponses'], responses }] }],
}).package.sections[0].questions[0];
const choice = (id, label, answer, distractors) => ({ id, label, type: 'choice', options: [answer, ...distractors.filter((option) => option !== answer)], answer });
const INVERSES = 'Determine whether f(x)=3x−2 and g(x)=(x+3)/3 are inverses.';
const inverseItem = (composed) => compile(INVERSES, [
  choice('fog', '(f∘g)(x)', 'x+1', ['3x']), choice('gof', '(g∘f)(x)', composed, ['3x']), choice('inverse', 'Are they inverses?', 'no', ['yes', 'no']),
]);

test('an authored choice keyed with a float artefact is stated as the fraction it is', () => {
  const question = inverseItem('x+0.3333333333333333');
  assert.equal(inverseComposition.matches(question), true);
  const worked = inverseComposition.workedSolution(question);
  assert.ok(worked, 'a worked solution');
  const said = [...worked.steps, worked.answerSummary].join(' | ');
  assert.doesNotMatch(said, /0\.3333/, said);
  assert.match(worked.answerSummary, /\(g∘f\)\(x\) = x \+ 1\/3;/, said);
});

test('a key a person wrote is stated as written: a fraction key stays, a typed field states the computed fraction', () => {
  const fractionKey = inverseComposition.workedSolution(inverseItem('x+1/3'));
  assert.match(fractionKey.answerSummary, /\(g∘f\)\(x\) = x\+1\/3;/);
  const typed = inverseComposition.workedSolution(compile(INVERSES, [
    { id: 'fog', label: '(f∘g)(x)', answer: 'x+1' }, { id: 'gof', label: '(g∘f)(x)', answer: 'x + 1/3' },
  ]));
  assert.ok(typed.answerSummary.includes('x + 1/3'), typed.answerSummary);
});

/* ------------------------------------------------ 5. "never is" in a sign chart */

test('a sign chart says an excluded point is "never included", not "never is"', () => {
  const tool = (fields) => ({ type: 'signSolutionAnalyzer', ...fields });
  const one = tool({ mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' });
  const two = tool({ mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -1 }, { root: 4 }], relation: '>=' });
  const lineOf = (question) => pointsAndIntervals.workedSolution(question).steps.find((step) => /also accepts 0/.test(step));
  assert.equal(lineOf(one), '≥ also accepts 0, so x = 2 is included; x = -3 is never included, because the denominator is 0 there.');
  assert.equal(lineOf(two), '≥ also accepts 0, so x = 2 is included; x = -1 and x = 4 are never included, because the denominator is 0 there.');
  for (const question of [one, two]) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const sibling = pointsAndIntervals.similarProblem(question, { seed });
      const line = sibling.steps.find((step) => /also accepts 0/.test(step));
      assert.match(line, /; x = \S+(?: and x = \S+)* (?:is|are) never included, because the denominator is 0 there\.$/, line);
      assert.doesNotMatch(line, /never (?:is|are)\b/, line);
    }
  }
});
