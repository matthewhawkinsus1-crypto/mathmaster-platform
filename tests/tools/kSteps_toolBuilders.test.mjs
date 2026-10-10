import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { buildSystemsWorkspaceReview } from '../../src/tools/shared/reviews/systemsWorkspaceReview.js';
import { buildRepresentationBridgeReview } from '../../src/tools/shared/reviews/representationBridgeReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K — A TOOL'S WORKED SOLUTION SHOWS HOW, NOT ONLY WHAT.
 *
 * The coordinator's m9 finding: a closed question's "worked solution" that is
 * only the answer. Driving every tool review builder over every mode found
 * the cases where the answer is computed but no step computes it:
 *
 *   sequenceExplorer        every mode — items only (aₙ, Sₙ, the rules, the
 *                           comparison);
 *   relationMapping         domain, range and the function verdict — items only;
 *   functionInvestigation2  compare (two values worked out) and intercepts
 *                           (f(x) = 0 solved, f(0)) — items only;
 *   representationMatch     tableAudit (each row against the rule) — items only;
 *   systemsWorkspace        spatial — "Solving the system gives the single
 *                           point …" asserted, never solved;
 *   representationBridge    the factored form, graph and meaning stages used
 *                           m, b and the zero without deriving them when the
 *                           table/general-form stages were not asked.
 *
 * Every assertion below recomputes the mathematics here (mathjs, exact
 * fractions where the values are rational), never with the tools' helpers:
 * the numbers each step states, every plain-arithmetic chain "a = b = c" in a
 * step, that the last step lands on the stated answer, and that the shared
 * grader marks the stated answer correct.
 */

const math = create(all, { number: 'Fraction' });
const numeric = create(all);
const F = (value) => math.fraction(value);

const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const int = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];
const nonzero = (random, low, high) => {
  const value = int(random, low, high);
  return value === 0 ? high : value;
};

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

/* --------------------------------------------- reading a step's arithmetic */

/** A step's notation as mathjs reads it. */
const plain = (text) => String(text)
  .replace(/−/g, '-')
  .replace(/·/g, '*')
  .replace(/÷/g, '/')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3')
  .replace(/\|([^|]+)\|/g, 'abs($1)')
  .replace(/√\(/g, 'sqrt(')
  .replace(/√([\d.]+)/g, 'sqrt($1)')
  .replace(/∛\(/g, 'cbrt(')
  .replace(/∛([\d.]+)/g, 'cbrt($1)')
  .replace(/log_\(?(-?[\d.]+)\)?\(((?:[^()]|\([^()]*\))*)\)/g, 'log($2, $1)');

/** A side that is arithmetic only (numbers, operators, brackets, the named variables). */
const evaluable = (side, names = []) => {
  const stripped = names.reduce((text, name) => text.replace(new RegExp(`\\b${name}\\b|(?<=\\d)${name}\\b`, 'g'), ''), side);
  return /\d/.test(side) && /^[-−\d\s.+*/÷·()^²³|√∛_,]*(?:log_)?[-−\d\s.+*/÷·()^²³|√∛_,]*$/.test(stripped.replace(/log_/g, ''));
};

/**
 * Every "a = b = c" (and "≈") chain of plain arithmetic in the text is true —
 * at `scope` when the chain names variables. Returns how many links it checked.
 */
const assertChains = (text, label, scope = {}) => {
  const names = Object.keys(scope);
  let checked = 0;
  String(text)
    .replace(/\(R\d\)/g, '')
    .replace(/\bR\d: /g, '')
    .split(/: |; |, | so | and | gives | then | — |, which simplifies to |\. (?=[A-Z])|\.$/)
    .forEach((clause) => {
      const parts = clause.trim().split(/ (=|≈) /);
      for (let index = 2; index < parts.length; index += 2) {
        const [left, op, right] = [parts[index - 2], parts[index - 1], parts[index]];
        if (!evaluable(left, names) || !evaluable(right, names)) continue;
        const l = numeric.evaluate(plain(left), { ...scope });
        const r = numeric.evaluate(plain(right), { ...scope });
        if (typeof l !== 'number' || typeof r !== 'number') continue;
        if (op === '=') {
          assert.ok(Math.abs(l - r) <= 1e-9 * Math.max(1, Math.abs(l)), `${label}: "${left} = ${right}" is false in "${text}"`);
        } else {
          const places = (String(right).split('.')[1] || '').length;
          assert.ok(Math.abs(l - r) <= 0.5 * 10 ** -places + 1e-9, `${label}: "${left} ≈ ${right}" is not a rounding in "${text}"`);
        }
        checked += 1;
      }
    });
  return checked;
};

/* ======================================================== sequenceExplorer */

const SEQUENCE = 'sequenceExplorer';
const termOf = (spec, n) => (spec.kind === 'arithmetic'
  ? F(spec.first).add(F(spec.difference).mul(n - 1))
  : F(spec.first).mul(F(spec.ratio).pow(n - 1)));
const sumOf = (spec, n) => Array.from({ length: n }, (_, index) => termOf(spec, index + 1)).reduce((sum, value) => sum.add(value), F(0));
const sameNumber = (text, fraction) => F(String(text).replace(/−/g, '-')).equals(fraction);

const randomSequence = (random) => (random() < 0.5
  ? { kind: 'arithmetic', first: pick(random, [-6, -2.5, 0, 1, 3, 7, 0.5]), difference: pick(random, [-4, -1.5, -1, 0.25, 2, 3, 5]) }
  : { kind: 'geometric', first: pick(random, [-3, 1, 2, 5, 0.5, 64]), ratio: pick(random, [-2, -0.5, 0.5, 2, 3, 1.5]) });

/** Every "aN = … = V" the steps state is the sequence's own N-th term. */
const assertTermsStated = (steps, spec, label) => {
  let stated = 0;
  steps.forEach((step) => {
    for (const [, n, chain] of step.matchAll(/\ba(\d+) = ([^,:;]+?)(?=, |\. |\.$| is )/g)) {
      const value = chain.split(' = ').pop();
      if (!/^[−-]?[\d.]+$/.test(value)) continue;
      assert.ok(sameNumber(value, termOf(spec, Number(n))), `${label}: a${n} = ${value} in "${step}"`);
      stated += 1;
    }
  });
  return stated;
};

const sequenceWork = (question, model, spec) => {
  const kindAnswer = spec.kind;
  const change = itemValue(model, spec.kind === 'arithmetic' ? 'Common difference' : 'Common ratio');
  const mode = question.mode || 'analyze';
  if (mode === 'ruleBridge') return { explicitRule: itemValue(model, 'Explicit rule'), recursiveFirst: itemValue(model, 'a₁'), recursiveRule: itemValue(model, 'Recursive rule') };
  if (mode === 'missingTerm') return { termAnswer: itemValue(model, `a${question.missingIndex}`), kindAnswer };
  if (mode === 'partialSum') return { lastTerm: itemValue(model, `Last term a${question.sumN}`), sumAnswer: itemValue(model, `Sum S${question.sumN}`) };
  if (mode === 'fullBridge') {
    const rows = [...String(itemValue(model, 'Table of (n, aₙ)')).matchAll(/\((\d+), ([^)]+)\)/g)].map(([, n, value]) => [Number(n), value]);
    return {
      tableValues: rows.map(([, value]) => value),
      plottedPoints: rows.map(([n, value]) => [n, Number(value)]),
      kindAnswer,
      changeAnswer: change,
      explicitRule: itemValue(model, 'Explicit rule'),
      recursiveFirst: itemValue(model, 'a₁'),
      recursiveRule: itemValue(model, 'Recursive rule'),
      termAnswer: itemValue(model, `a${question.targetN}`),
    };
  }
  return { kindAnswer, changeAnswer: change, termAnswer: itemValue(model, `a${question.targetN}`) };
};

test('sequenceExplorer: every mode derives its answers — each stated term, sum and difference recomputed exactly; graded correct', () => {
  const random = prng(0x5e9);
  const modes = ['analyze', 'ruleBridge', 'missingTerm', 'partialSum', 'fullBridge'];
  let reviewed = 0;
  for (let index = 0; index < 150; index += 1) {
    const sequence = randomSequence(random);
    const mode = modes[index % modes.length];
    const question = { type: SEQUENCE, mode, sequence };
    if (mode === 'analyze') question.targetN = int(random, 4, 12);
    if (mode === 'missingTerm') question.missingIndex = int(random, 1, 6);
    if (mode === 'partialSum') question.sumN = int(random, 3, 9);
    if (mode === 'fullBridge') {
      question.targetN = int(random, 7, 12);
      question.studentActions = ['buildSequenceTable', 'plotSequence', 'analyzeSequence', 'writeExplicit', 'writeRecursive', 'findSequenceTerm'];
    }
    const label = `sequence ${index} ${JSON.stringify(question)}`;
    const model = buildToolSolutionReviewModel(question);
    const { steps } = model;
    assert.ok(steps.length >= 2, `${label}: worked steps, not only the answer`);
    // The family is shown from the terms themselves.
    assert.match(steps[0], sequence.kind === 'arithmetic' ? /arithmetic with common difference/ : /geometric with common ratio/, label);
    assert.ok(assertTermsStated(steps, sequence, label) >= 3, `${label}: the terms it works from are stated`);
    const links = steps.reduce((sum, step) => sum + assertChains(step, label), 0);
    assert.ok(links >= 2, `${label}: the arithmetic in the steps is checked (${links} links)`);
    const last = steps[steps.length - 1];
    if (mode === 'analyze' || mode === 'fullBridge') {
      const expected = termOf(sequence, question.targetN);
      assert.ok(sameNumber(itemValue(model, `a${question.targetN}`), expected), `${label}: the term item`);
      assert.match(last, new RegExp(`a${question.targetN} = .* = ${itemValue(model, `a${question.targetN}`).replace('-', '−').replace('.', '\\.')}\\.$`), `${label}: the last step lands on a${question.targetN}`);
    }
    if (mode === 'missingTerm') {
      const n = question.missingIndex;
      assert.ok(sameNumber(itemValue(model, `a${n}`), termOf(sequence, n)), `${label}: the missing term`);
      assert.match(last, new RegExp(`a${n} = [^=]+ = ${itemValue(model, `a${n}`).replace('-', '−').replace('.', '\\.')}\\.$`), `${label}: worked from its neighbour`);
      // The shown terms it reads the pattern from are not the gap.
      assert.doesNotMatch(steps[0], new RegExp(`\\ba${n} = `), `${label}: the gap is not used to find itself`);
    }
    if (mode === 'partialSum') {
      const expected = sumOf(sequence, question.sumN);
      assert.ok(sameNumber(itemValue(model, `Sum S${question.sumN}`), expected), `${label}: the sum`);
      assert.match(last, new RegExp(`S${question.sumN} = .* = ${itemValue(model, `Sum S${question.sumN}`).replace('-', '−').replace('.', '\\.')}\\.$`), `${label}: the last step lands on the sum`);
    }
    if (mode === 'ruleBridge' || mode === 'fullBridge') {
      assert.match(steps.join(' '), /Recursive rule: start at a₁ = /, label);
      assert.match(steps.join(' '), /Explicit rule: to reach aₙ from a₁/, label);
    }
    const result = gradeToolWork({ toolId: SEQUENCE, question, work: sequenceWork(question, model, sequence) });
    assert.equal(result.isCorrect, true, `${label}: graded correct ${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))}`);
    reviewed += 1;
  }
  assert.equal(reviewed, 150);
});

test('sequenceExplorer compare: both terms, the larger and the difference are worked out — the grader\'s default pair when none is authored', () => {
  const random = prng(0xc0e);
  const cases = [{ type: SEQUENCE, mode: 'compare' }];
  for (let index = 0; index < 40; index += 1) {
    cases.push({ type: SEQUENCE, mode: 'compare', left: randomSequence(random), right: randomSequence(random), compareN: int(random, 2, 9) });
  }
  cases.forEach((question, index) => {
    const label = `compare ${index} ${JSON.stringify(question)}`;
    const model = buildToolSolutionReviewModel(question);
    // Unauthored: 3, 7, 11, … against 1, 2, 4, … (SequenceExplorer.jsx).
    const left = question.left || { kind: 'arithmetic', first: 3, difference: 4 };
    const right = question.right || { kind: 'geometric', first: 1, ratio: 2 };
    const n = question.compareN ?? 7;
    const [a, b] = [termOf(left, n), termOf(right, n)];
    assert.ok(sameNumber(itemValue(model, `Sequence A at n = ${n}`), a), `${label}: A`);
    assert.ok(sameNumber(itemValue(model, `Sequence B at n = ${n}`), b), `${label}: B`);
    const difference = a.sub(b).abs();
    assert.ok(sameNumber(itemValue(model, 'Absolute difference'), difference), `${label}: difference`);
    assert.equal(model.steps.length, 3, label);
    assert.ok(model.steps.reduce((sum, step) => sum + assertChains(step, label), 0) >= 5, `${label}: the arithmetic is checked`);
    assert.match(model.steps[2], new RegExp(`= ${itemValue(model, 'Absolute difference').replace('-', '−').replace('.', '\\.')}\\.$`), `${label}: ends on the difference`);
    const relation = a.equals(b) ? 'equal' : a.compare(b) > 0 ? 'A' : 'B';
    const result = gradeToolWork({ toolId: SEQUENCE, question, work: { relation, difference: itemValue(model, 'Absolute difference') } });
    assert.equal(result.isCorrect, true, label);
    assert.equal(itemValue(model, 'Larger term'), { A: 'Sequence A', B: 'Sequence B', equal: 'They are equal' }[relation], label);
  });
});

/* ========================================================= relationMapping */

test('relationMapping: the domain, range and function verdict are read off the pairs step by step; the verdict is the graded choice', () => {
  const random = prng(0x7e1);
  for (let index = 0; index < 80; index += 1) {
    const count = int(random, 2, 6);
    const pairs = Array.from({ length: count }, () => [int(random, -4, 4), int(random, -4, 4)]);
    const question = { type: 'relationMapping', pairs: pairs.map(([x, y], position) => (position % 2 ? { x, y } : [x, y])), ask: ['mapping', 'domain', 'range', 'isFunction'] };
    const label = `relation ${index} ${JSON.stringify(pairs)}`;
    const model = buildToolSolutionReviewModel(question);
    const domain = [...new Set(pairs.map(([x]) => x))].sort((p, q) => p - q);
    const range = [...new Set(pairs.map(([, y]) => y))].sort((p, q) => p - q);
    const outputs = new Map();
    pairs.forEach(([x, y]) => outputs.set(x, new Set([...(outputs.get(x) || []), y])));
    const isFunction = [...outputs.values()].every((set) => set.size === 1);
    assert.equal(model.steps.length, 4, label);
    assert.ok(model.steps[1].endsWith(`{${domain.join(', ')}}.`), `${label}: domain step ${model.steps[1]}`);
    assert.ok(model.steps[2].endsWith(`{${range.join(', ')}}.`), `${label}: range step ${model.steps[2]}`);
    const [, choiceLabel] = model.steps[3].match(/"([^"]+)"$/) || [];
    assert.ok(choiceLabel, `${label}: the verdict names the choice to make`);
    if (!isFunction) {
      const [, input, listed] = model.steps[3].match(/The input (-?\d+) has more than one output \(([^)]+)\)/);
      assert.ok(outputs.get(Number(input)).size > 1, `${label}: ${input} really has two outputs`);
      assert.deepEqual(listed.split(' and ').map(Number).sort(), [...outputs.get(Number(input))].sort(), label);
    }
    const choice = { 'Yes — every input has exactly one output.': 'yes-definition', 'No — at least one input has more than one output.': 'no-input-repeat' }[choiceLabel];
    assert.ok(choice, `${label}: "${choiceLabel}" is a choice the lab offers`);
    const result = gradeToolWork({
      toolId: 'relationMapping',
      question,
      work: {
        arrows: [...new Set(pairs.map(([x, y]) => `${x}|${y}`))].map((key) => key.split('|').map(Number)),
        domainText: itemValue(model, 'Domain').replace(/[{}]/g, ''),
        rangeText: itemValue(model, 'Range').replace(/[{}]/g, ''),
        isFunction: choice,
      },
    });
    assert.equal(result.isCorrect, true, `${label}: graded correct ${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))}`);
  }
});

/* ================================================== functionInvestigation2 */

const FI = 'functionInvestigation2';
const FAMILIES = ['linear', 'quadratic', 'absolute', 'cubic', 'cubeRoot', 'squareRoot', 'exponential', 'logarithmic', 'rational'];
/** f(x) from the family's definition, written out here. */
const valueAt = ({ type, a, h, k, base }, x) => {
  const d = x - h;
  if (type === 'linear') return a * d + k;
  if (type === 'quadratic') return a * d * d + k;
  if (type === 'absolute') return a * Math.abs(d) + k;
  if (type === 'cubic') return a * d * d * d + k;
  if (type === 'cubeRoot') return a * Math.sign(d) * Math.abs(d) ** (1 / 3) + k;
  if (type === 'squareRoot') return d < 0 ? NaN : a * Math.sqrt(d) + k;
  if (type === 'exponential') return a * base ** d + k;
  if (type === 'logarithmic') return d <= 0 ? NaN : a * Math.log(d) / Math.log(base) + k;
  return d === 0 ? NaN : a / d + k;
};
/** The real zeros of f, solved here family by family. */
const zerosOf = ({ type, a, h, k, base }) => {
  const r = -k / a;
  if (type === 'linear') return [h + r];
  if (type === 'quadratic') return r < 0 ? [] : r === 0 ? [h] : [h - Math.sqrt(r), h + Math.sqrt(r)];
  if (type === 'absolute') return r < 0 ? [] : r === 0 ? [h] : [h - r, h + r];
  if (type === 'squareRoot') return r < 0 ? [] : [h + r * r];
  if (type === 'cubic') return [h + Math.sign(r) * Math.abs(r) ** (1 / 3)];
  if (type === 'cubeRoot') return [h + r ** 3];
  if (type === 'exponential') return r > 0 ? [h + Math.log(r) / Math.log(base)] : [];
  if (type === 'logarithmic') return [h + base ** r];
  return k === 0 ? [] : [h - a / k];
};
const randomFunction = (random) => ({
  type: pick(random, FAMILIES),
  a: pick(random, [-3, -2, -1, -0.5, 0.5, 1, 2, 3]),
  h: int(random, -3, 3),
  k: int(random, -5, 5),
  base: pick(random, [2, 3, 0.5, 10]),
});
const near = (left, right, tolerance = 1e-4) => Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(right));

test('functionInvestigation2 compare: both values are worked out at the shared x and the verdict follows; graded correct', () => {
  const random = prng(0xf12);
  const cases = [{ type: FI, mode: 'compare' }];
  for (let index = 0; index < 120; index += 1) cases.push({ type: FI, mode: 'compare', left: randomFunction(random), right: randomFunction(random), x: int(random, -4, 4) });
  cases.forEach((question, index) => {
    const label = `compare ${index} ${JSON.stringify(question)}`;
    const model = buildToolSolutionReviewModel(question);
    // Unauthored: f(x) = x against g(x) = x², at x = 2 (the tool's own).
    const left = { base: 2, ...(question.left || { type: 'linear', a: 1, h: 0, k: 0 }) };
    const right = { base: 2, ...(question.right || { type: 'quadratic', a: 1, h: 0, k: 0 }) };
    const x = question.x ?? 2;
    const [fx, gx] = [valueAt(left, x), valueAt(right, x)];
    assert.equal(model.steps.length, 3, `${label}: f, g and the verdict`);
    [[fx, 'f', 0], [gx, 'g', 1]].forEach(([value, name, position]) => {
      const step = model.steps[position];
      if (Number.isNaN(value)) {
        assert.match(step, new RegExp(`so ${name}\\(${String(x).replace('-', '−')}\\) is undefined\\.$`), `${label}: ${name} undefined`);
        assert.equal(itemValue(model, `${name}(${x})`), 'undefined', label);
      } else {
        const stated = step.match(/(=|≈) ([−\d.]+)\.$/);
        assert.ok(stated && near(Number(stated[2].replace('−', '-')), value), `${label}: ${name}(${x}) = ${value} in "${step}"`);
        assert.ok(near(Number(itemValue(model, `${name}(${x})`)), value, 1e-6), `${label}: ${name} item`);
        assert.ok(assertChains(step, label) >= 2, `${label}: ${name}'s arithmetic is checked in "${step}"`);
      }
    });
    const code = Number.isNaN(fx) || Number.isNaN(gx) ? 'undefined' : Math.abs(fx - gx) <= 1e-6 ? 'equal' : fx > gx ? 'left' : 'right';
    assert.match(model.steps[2], { undefined: /undefined here/, equal: /they are equal/, left: /f\(x\) is greater/, right: /g\(x\) is greater/ }[code], label);
    assert.equal(gradeToolWork({ toolId: FI, question, work: { comparison: code } }).isCorrect, true, label);
  });
});

test('functionInvestigation2 intercepts: f(x) = 0 is solved and f(0) evaluated, landing on the graded intercepts — the tool\'s defaults for an unauthored parameter', () => {
  const random = prng(0x1a7);
  const cases = [];
  for (let index = 0; index < 160; index += 1) cases.push({ type: FI, mode: 'intercepts', function: randomFunction(random) });
  // Partly authored: the grader fills the rest from { rational, a 2, h 1, k −2 }.
  cases.push({ type: FI, mode: 'intercepts', function: { type: 'quadratic', a: -1 } });
  cases.push({ type: FI, mode: 'intercepts' });
  cases.forEach((question, index) => {
    const spec = { type: 'rational', a: 2, h: 1, k: -2, base: 2, ...question.function };
    const label = `intercepts ${index} ${JSON.stringify(spec)}`;
    const model = buildToolSolutionReviewModel(question);
    const zeros = zerosOf(spec).sort((p, q) => p - q);
    const y = valueAt(spec, 0);
    const xItem = itemValue(model, 'x-intercepts');
    const yItem = itemValue(model, 'y-intercept');
    // The stated answer is the function's own …
    if (!zeros.length) assert.equal(xItem, 'none', label);
    else assert.deepEqual(xItem.split(', ').map(Number).map((value, position) => near(value, zeros[position])), zeros.map(() => true), `${label}: ${xItem}`);
    if (Number.isNaN(y)) assert.equal(yItem, 'none', label);
    else assert.ok(near(Number(yItem), y), `${label}: y ${yItem}`);
    // … reached by steps: f(x) = 0 solved, then f(0).
    const { steps } = model;
    assert.ok(steps.length >= 2, `${label}: worked steps`);
    assert.match(steps[0], /^Set f\(x\) = 0: /, label);
    const zeroText = steps.slice(0, -1).join(' ');
    if (!zeros.length) assert.match(zeroText, /so f has no x-intercept\.$/, label);
    else {
      const found = [...zeroText.matchAll(/\bx (=|≈) ([−\d]+(?:\.\d+)?)/g)].map(([, , value]) => Number(value.replace('−', '-')));
      zeros.forEach((zero) => assert.ok(found.some((value) => near(value, zero, 1e-3)), `${label}: x = ${zero} reached in "${zeroText}"`));
    }
    const last = steps[steps.length - 1];
    if (Number.isNaN(y)) assert.match(last, /no y-intercept\.$/, label);
    else {
      const stated = last.match(/(=|≈) ([−\d.]+)\.$/);
      assert.ok(stated && near(Number(stated[2].replace('−', '-')), y), `${label}: f(0) in "${last}"`);
    }
    const links = steps.reduce((sum, step) => sum + assertChains(step, label), 0);
    assert.ok(links >= 1, `${label}: the arithmetic in the steps is checked (${links} links)`);
    const result = gradeToolWork({ toolId: FI, question, work: { xIntercepts: xItem, yIntercept: yItem } });
    assert.equal(result.isCorrect, true, `${label}: graded correct ${JSON.stringify(result.parts)}`);
  });
});

/* ============================================ representationMatch tableAudit */

test('representationMatch tableAudit: each row is checked against the rule, and the row named is the one the grader wants', () => {
  const random = prng(0x7ab);
  const cases = [{ type: 'representationMatch', mode: 'tableAudit' }];
  for (let index = 0; index < 60; index += 1) {
    const fn = { ...randomFunction(random), type: pick(random, ['linear', 'quadratic', 'absolute', 'cubic']) };
    const xs = [-2, -1, 0, 1, 2, 3].slice(0, int(random, 3, 6));
    const bad = int(random, 0, xs.length - 1);
    const rows = xs.map((x, position) => [x, valueAt(fn, x) + (position === bad ? nonzero(random, -3, 3) : 0)]);
    cases.push({ type: 'representationMatch', mode: 'tableAudit', function: fn, rows });
  }
  cases.forEach((question, index) => {
    const label = `tableAudit ${index} ${JSON.stringify(question)}`;
    const model = buildToolSolutionReviewModel(question);
    // Unauthored: y = x² sampled at −2 … 2, the middle row raised by 2.
    const fn = { type: 'linear', a: 1, h: 0, k: 0, base: 2, ...(question.function || { type: 'quadratic' }) };
    const rows = question.rows || [-2, -1, 0, 1, 2].map((x) => [x, x * x + (x === 0 ? 2 : 0)]);
    const wrong = rows.map(([x, y], position) => (near(y, valueAt(fn, x), 1e-9) ? null : position)).filter((value) => value !== null);
    assert.equal(model.steps.length, 3, label);
    const checks = model.steps[1].split('; ');
    assert.equal(checks.length, rows.length, `${label}: every row checked`);
    checks.forEach((check, position) => {
      const [, at, value, shown] = check.match(/^Row \d+: f\(([−\d.]+)\) = ([−\d.]+) and the table shows ([−\d.]+)/);
      assert.equal(Number(at.replace('−', '-')), rows[position][0], label);
      assert.ok(near(Number(value.replace('−', '-')), valueAt(fn, rows[position][0]), 1e-9), `${label}: ${check}`);
      assert.equal(Number(shown.replace('−', '-')), rows[position][1], label);
      assert.match(check, wrong.includes(position) ? /they do not match\.?$/ : /a match\.?$/, `${label}: ${check}`);
    });
    assert.equal(wrong.length, 1, label);
    assert.equal(model.steps[2], `So Row ${wrong[0] + 1} is the row that breaks the rule.`, label);
    assert.equal(itemValue(model, 'Row that breaks the rule'), `Row ${wrong[0] + 1}`, label);
    assert.equal(gradeToolWork({ toolId: 'representationMatch', question, work: { rowIndex: wrong[0] } }).isCorrect, true, label);
  });
});

/* ===================================================== systemsWorkspace spatial */

const VARS = ['x', 'y', 'z'];
const writeEquation = (coefficients, constant) => {
  let text = '';
  coefficients.forEach((a, index) => {
    if (a === 0) return;
    const body = Math.abs(a) === 1 ? VARS[index] : `${Math.abs(a)}${VARS[index]}`;
    text += text ? (a < 0 ? ` - ${body}` : ` + ${body}`) : (a < 0 ? `-${body}` : body);
  });
  return `${text || '0'} = ${constant}`;
};
/** Reduced row echelon form of [A | b] in exact fractions. */
const reduce = (rows) => {
  const matrix = rows.map((row) => row.map(F));
  let pivotRow = 0;
  const pivots = [];
  for (let column = 0; column < 3 && pivotRow < 3; column += 1) {
    const found = matrix.findIndex((row, index) => index >= pivotRow && !row[column].equals(0));
    if (found < 0) continue;
    [matrix[pivotRow], matrix[found]] = [matrix[found], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    matrix[pivotRow] = matrix[pivotRow].map((entry) => entry.div(pivot));
    matrix.forEach((row, index) => {
      if (index === pivotRow || row[column].equals(0)) return;
      const factor = row[column];
      matrix[index] = row.map((entry, position) => entry.sub(factor.mul(matrix[pivotRow][position])));
    });
    pivots.push(column);
    pivotRow += 1;
  }
  const inconsistent = matrix.slice(pivots.length).some((row) => !row[3].equals(0));
  return { matrix, pivots, inconsistent };
};
/** Two different solutions of a consistent system (free variables 0 and 1). */
const solutions = ({ matrix, pivots }) => [0, 1].map((free) => {
  const values = [F(free), F(free), F(free)];
  pivots.forEach((column, row) => {
    values[column] = matrix[row][3];
    [0, 1, 2].filter((other) => !pivots.includes(other)).forEach((other) => { values[column] = values[column].sub(matrix[row][other].mul(free)); });
  });
  return Object.fromEntries(VARS.map((name, index) => [name, Number(values[index].valueOf())]));
});

test('systemsWorkspace spatial: where the three planes meet is solved, not asserted — every equation in the work holds on the common points; graded correct', () => {
  const random = prng(0x3d1);
  const counts = { one: 0, none: 0, infinite: 0, derived: 0 };
  for (let index = 0; index < 180; index += 1) {
    const solution = [int(random, -4, 4), int(random, -4, 4), int(random, -4, 4)];
    const rows = Array.from({ length: 3 }, () => [nonzero(random, -4, 4), int(random, -4, 4), nonzero(random, -4, 4)]);
    const kind = index % 3;
    if (kind > 0) rows[2] = rows[0].map((entry, column) => 2 * entry - rows[1][column]);
    const constants = rows.map((row) => row.reduce((sum, entry, column) => sum + entry * solution[column], 0));
    if (kind === 1) constants[2] += nonzero(random, -3, 3);
    const augmented = rows.map((row, position) => [...row, constants[position]]);
    const reduced = reduce(augmented);
    const truth = reduced.inconsistent ? 'none' : reduced.pivots.length < 3 ? 'infinite' : 'one';
    if (truth === 'infinite' && reduced.pivots.length !== 2) continue;
    const equations = rows.map((row, position) => writeEquation(row, constants[position]));
    const answer = { one: 'one point', none: 'no point', infinite: 'a line of points' }[truth];
    const question = {
      type: 'systemsWorkspace', mode: 'spatial', spatialModel: { kind: 'threePlanes' }, studentActions: ['connectRepresentations'], equations, variables: VARS,
      answerFields: [{ id: 'meet', label: 'Where do the planes meet?', options: ['one point', 'no point', 'a line of points'], answer }],
    };
    const label = `spatial ${index} ${JSON.stringify(equations)}`;
    // Elimination needs a variable written in all three equations.
    if (![0, 1, 2].some((column) => rows.every((row) => row[column] !== 0))) continue;
    const model = buildSystemsWorkspaceReview(question);
    assert.ok(model, label);
    counts[truth] += 1;
    const work = model.steps.slice(0, -1);
    // A variable is in every equation, so the derivation can always be written.
    assert.ok(work.length >= 3, `${label}: the meeting is worked out (${work.length} steps)`);
    counts.derived += 1;
    const conclusion = work[work.length - 1];
    if (truth === 'one') {
      const point = Object.fromEntries(VARS.map((name, position) => [name, Number(reduced.matrix[position][3].valueOf())]));
      const [, stated] = conclusion.match(/the single point \(([^)]+)\) is the one place all three planes meet\.$/) || [];
      assert.ok(stated, `${label}: concludes on the point: ${conclusion}`);
      assert.deepEqual(stated.split(', ').map((value) => F(value.replace(/−/g, '-'))).map((value, position) => value.equals(reduced.matrix[position][3])), [true, true, true], `${label}: (${stated}) is the solution`);
      let links = 0;
      work.forEach((step) => { links += assertChains(step, label, point); });
      assert.ok(links >= 3, `${label}: the work's equations are checked at the point (${links})`);
    } else if (truth === 'none') {
      const [, constant] = conclusion.match(/^0 = ([−\d/]+) is false/) || [];
      assert.ok(constant && !F(constant.replace('−', '-')).equals(0), `${label}: ends on a contradiction: ${conclusion}`);
      assert.match(conclusion, /the planes have no point in common\.$/, label);
    } else {
      const identity = work.find((step) => step.startsWith('0 = 0 is true'));
      assert.ok(identity, `${label}: an identity`);
      assert.match(conclusion, /they meet in a line\. .*the planes share a line of points\.$/, label);
      // Every equation the work writes holds at two different common points.
      solutions(reduced).forEach((point) => {
        const links = work.reduce((sum, step) => sum + assertChains(step, label, point), 0);
        assert.ok(links >= 1, `${label}: the work's equations are checked on the line (${links})`);
      });
    }
    assert.equal(model.steps[model.steps.length - 1], `Where do the planes meet? — ${answer}`, label);
    const result = gradeToolWork({ toolId: 'systemsWorkspace', question, work: { responses: [{ id: 'meet', value: model.items[0].value }] } });
    assert.equal(result.isCorrect, true, label);
  }
  assert.ok(counts.one > 30 && counts.none > 20 && counts.infinite > 10, JSON.stringify(counts));
});

/* ================================================== representationBridge */

const CONTEXT = {
  inputLabel: 'hours', outputLabel: 'distance', inputUnit: 'hours', outputUnit: 'miles', rateUnit: 'miles per hour',
  rateMeaning: 'distance covered each hour', yInterceptMeaning: 'distance from the start at hour 0', zeroMeaning: 'hour at which the distance is 0',
};
const fractionText = (text) => F(String(text).replace(/−/g, '-'));

test('representationBridge: a stage that uses m, b or the zero derives them first when no earlier stage did — each value recomputed; graded correct', () => {
  const random = prng(0xb1d);
  const stageSets = [['factoredForm'], ['graph'], ['meaning'], ['factoredForm', 'graph'], ['graph', 'meaning'], ['rateEvidence', 'graph'], ['rateEvidence', 'factoredForm']];
  let reviewed = 0;
  for (let index = 0; index < 140; index += 1) {
    const m = F(nonzero(random, -6, 6)).div(pick(random, [1, 1, 2, 4]));
    const b = F(int(random, -12, 12));
    const xs = [...new Set(Array.from({ length: 6 }, () => int(random, -8, 8)))].slice(0, int(random, 3, 5));
    if (xs.length < 3) continue;
    const rows = xs.map((x) => ({ x, y: Number(m.mul(x).add(b).valueOf()) }));
    const stages = stageSets[index % stageSets.length];
    const question = { type: 'representationBridge', mode: 'linear', source: { kind: 'table', rows }, context: CONTEXT, requiredStages: stages, requiredComparisons: 2 };
    const label = `bridge ${index} ${JSON.stringify(question.source.rows)} ${stages.join('+')}`;
    const model = buildRepresentationBridgeReview(question);
    if (!model) continue;
    reviewed += 1;
    const zero = b.neg().div(m);
    assert.ok(model.steps.reduce((sum, step) => sum + assertChains(step, label), 0) >= 2, `${label}: the arithmetic is checked`);
    const prerequisite = model.steps.find((step) => /^To (write the factored form|draw the graph|explain what m, b and c mean), first find what it uses\./.test(step));
    assert.ok(prerequisite, `${label}: m and b are found before they are used`);
    // m: from two rows, unless the rate stage already found it.
    if (stages.includes('rateEvidence')) assert.doesNotMatch(prerequisite, /m = Δy ÷ Δx/, `${label}: m is not found twice`);
    else {
      const [, slope] = prerequisite.match(/m = Δy ÷ Δx = [^=]+ = ([−\d/]+)\./) || [];
      assert.ok(slope && fractionText(slope).equals(m), `${label}: m in "${prerequisite}"`);
    }
    const [, intercept] = prerequisite.match(/b = (?:[^=.]+ = )?([−\d/]+)\./) || [];
    assert.ok(intercept && fractionText(intercept).equals(b), `${label}: b in "${prerequisite}"`);
    if (!stages.includes('factoredForm')) {
      const [, c] = prerequisite.match(/so c = ([−\d/]+)\.$/) || [];
      assert.ok(c && fractionText(c).equals(zero), `${label}: c in "${prerequisite}"`);
    }
    // It comes before the stage that uses it.
    const user = model.steps.findIndex((step) => /^(Factored form|Graph|Meaning): /.test(step));
    assert.ok(model.steps.indexOf(prerequisite) < user, `${label}: derived before it is used`);
    const work = {};
    if (stages.includes('rateEvidence')) {
      work.tableEvidence = model.items.filter((item) => /^Row \d+ → Row \d+$/.test(item.label)).map((item) => {
        const [, i, j] = item.label.match(/^Row (\d+) → Row (\d+)$/).map(Number);
        const [, dx, dy, rate] = item.value.match(/^Δx = (\S+), Δy = (\S+), rate = (\S+)$/);
        return { i: i - 1, j: j - 1, dx, dy, rate };
      });
      work.studentSlope = itemValue(model, 'm (your slope)');
      work.rateConclusion = 'constant';
    }
    if (stages.includes('factoredForm')) {
      assert.ok(fractionText(itemValue(model, 'Factored form: c')).equals(zero), label);
      work.factoredForm = { a: itemValue(model, 'Factored form: a'), c: itemValue(model, 'Factored form: c'), equation: itemValue(model, 'Factored form equation') };
    }
    if (stages.includes('graph')) {
      const points = [...itemValue(model, 'Graph points').matchAll(/\(([^,()]+), ([^,()]+)\)/g)].map(([, x, y]) => [Number(fractionText(x).valueOf()), Number(fractionText(y).valueOf())]);
      assert.ok(near(points[0][0], Number(zero.valueOf()), 1e-12) && points[0][1] === 0, `${label}: the graph starts at the zero`);
      work.graphConstruction = { points };
    }
    if (stages.includes('meaning')) {
      const meaning = (id, prefix) => {
        const [, unit, contextMeaning, mathRole] = model.items.find((item) => item.label.startsWith(prefix)).value.match(/^Unit: (.+) · Meaning: (.+) · Role: (.+)$/);
        return [id, { unit, contextMeaning, mathRole }];
      };
      work.meaningAssignments = Object.fromEntries([meaning('rate', 'Meaning of m = '), meaning('yIntercept', 'Meaning of b = '), meaning('zero', 'Meaning of c = ')]);
    }
    const result = gradeToolWork({ toolId: 'representationBridge', question, work });
    assert.equal(result.isCorrect, true, `${label}: graded correct ${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))}`);
  }
  assert.ok(reviewed > 80, `bridges reviewed (${reviewed})`);
});
