/*
 * JOB K AUDIT: THE inverseComposition SUPPORT FAMILY ON MANY SEEDED INSTANCES.
 *
 * supportFamily_inverseComposition.test.mjs checks the family on the authored
 * corpus. This file draws 200+ seeded instances of every shape the family
 * claims — inverseCompositionLab in each view on every function type, the
 * deriveInverse lab, functionOperationsLab with every operation (and both
 * composition orders), and multiAnswer items written the way the L3 / L4
 * lessons write them (inverse of a linear rule, a context inverse, an inverse
 * relation, the inverse property, a pointwise operation, composition values,
 * a context composition, symbolic compositions, an inverse check, operations
 * with an excluded value and a degree) — and re-solves every worked sibling
 * from its own prompt with mathjs and fraction.js: every inverse is composed
 * with its function, every composition, sum, product and value is evaluated,
 * and every "a = b = c" chain of numbers is recomputed. Hints are checked
 * against an independently computed key and for display hygiene.
 *
 * Then one test per defect the audit found, each red on the old code:
 *   - "f(0) = −0 − 7": a −1 coefficient times zero was written −0;
 *   - "log_2(4) = 2, and 2 + 0 = 2": an unshifted exponential's undo step
 *     added zero;
 *   - "replace every x in x² + 1 with 3x" (read as 3x²): a substituted rule
 *     that is not a single letter or number is now always in parentheses;
 *   - a cubic f composed with a linear g was told to "Expand (2x + 1)²";
 *   - a functionOperationsLab item with ONE sum, difference, product or
 *     composition never got a worked example (its one-line sibling failed
 *     the two-step rule every time).
 *
 * Mutation-checked: each fix was undone in inverseComposition.js and the test
 * named for it went red, then the fix was restored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';
import Fraction from 'fraction.js';

import * as ic from '../../src/platform/supports/families/inverseComposition.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';

const math = create(all);
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');

/* ---------------------------------------------------------------------------
 * Reading the family's written rules without the family.
 * ------------------------------------------------------------------------- */

const toMathjs = (rule) => ascii(rule)
  .replace(/·/g, '*').replace(/×/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3')
  .replace(/√\(/g, 'sqrt(').replace(/√x/g, 'sqrt(x)')
  .replace(/log_([0-9.]+)\(([^)]*)\)/g, 'log($2, $1)').replace(/log_([0-9.]+)x/g, 'log(x, $1)')
  .replace(/\|([^|]*)\|/g, 'abs($1)');
const ruleOf = (rule, variable = 'x') => {
  const compiled = math.parse(toMathjs(rule)).compile();
  return (value) => {
    const result = compiled.evaluate({ [variable]: value });
    return typeof result === 'number' ? result : Number.NaN;
  };
};
const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
const SAMPLES = [-3, -1.5, 0, 0.5, 2, 4.25];

/** A seeded generator, so a failure names an instance that can be replayed. */
const seeded = (seed) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const int = (low, high) => low + Math.floor(next() * (high - low + 1));
  return { next, int, nonZero: (low, high) => { let v = 0; while (!v) v = int(low, high); return v; }, pick: (values) => values[Math.floor(next() * values.length)] };
};

// "x + 0" is a hygiene slip; "1 + 0 = 1", adding a value that happens to be
// zero, is arithmetic a step may show.
const HYGIENE = /\+ -|\+ −|- -|− −|--|−−|(?<![\d.])1x|NaN|undefined|Infinity|(?<![\d.])[-−]0(?![.\d])|\bnull\b|\[object|[a-z)] [+−] 0(?![.\d])|\^\(x\)/;
const assertClean = (value, where) => assert.doesNotMatch(String(value), HYGIENE, `${where}: display hygiene in "${value}"`);

/** Every "A = B = C" run whose pieces are plain numeric expressions holds. */
const assertChains = (step, where) => {
  ascii(step).replace(/\.$/, '').split(/[;:]|, (?![^(]*\))|\. /).forEach((clause) => {
    const values = clause.split(' = ').map((piece) => {
      const expression = toMathjs(piece.trim());
      if (!/\d/.test(expression) || /[a-z]/.test(expression.replace(/log/g, ''))) return null;
      try {
        const value = math.evaluate(expression.replace(/(\d)\s*\(/g, '$1*(').replace(/\)\s*\(/g, ')*('));
        return typeof value === 'number' ? value : null;
      } catch {
        return null;
      }
    });
    values.forEach((value, index) => {
      if (index && value !== null && values[index - 1] !== null) assert.ok(close(value, values[index - 1]), `${where}: "${clause}" does not hold`);
    });
  });
};

/** Integer-coefficient polynomial text, written independently (fraction.js for the numbers). */
const polyText = (coefficients) => {
  const terms = [];
  coefficients.forEach((c, power) => { if (c !== 0) terms.unshift([c, power]); });
  if (!terms.length) return '0';
  return terms.map(([c, power], index) => {
    const magnitude = new Fraction(Math.abs(c)).toFraction();
    const letter = power === 0 ? '' : power === 1 ? 'x' : `x${power === 2 ? '²' : '³'}`;
    const body = letter && magnitude === '1' ? letter : `${magnitude}${letter}`;
    return index === 0 ? `${c < 0 ? '−' : ''}${body}` : `${c < 0 ? '−' : '+'} ${body}`;
  }).join(' ');
};
const spellings = (value) => {
  const base = String(value);
  return [...new Set([base, ascii(base), base.replace(/\s+/g, ''), ascii(base).replace(/\s+/g, '')])];
};

/* ---------------------------------------------------------------------------
 * Re-solving a sibling from its own prompt.
 * ------------------------------------------------------------------------- */

const verifySibling = (example, where) => {
  const prompt = example.prompt;
  const answer = ascii(example.answer);
  [prompt, ...example.steps, example.answer].forEach((piece) => assertClean(piece, where));
  example.steps.forEach((step) => assertChains(step, where));
  let match;
  const at = `${where} [${prompt}]`;
  if ((match = /^Find the inverse of ([a-zA-Z])\(x\) = (.+)\.$/.exec(prompt))) {
    const f = ruleOf(match[2]);
    const inverse = ruleOf(/⁻¹\(x\) = ([^;]+)/.exec(example.answer)[1]);
    SAMPLES.forEach((x) => assert.ok(close(f(inverse(x)), x), `${at}: f(f⁻¹(${x})) = ${x}`));
    return;
  }
  if ((match = /^Let ([A-Za-z])\(([a-z])\) = (.+?)\. Find the inverse rule/.exec(prompt))) {
    const f = ruleOf(match[3], match[2]);
    const inverse = ruleOf(/⁻¹\(x\) = ([^;]+)/.exec(example.answer)[1]);
    SAMPLES.forEach((x) => assert.ok(close(f(inverse(x)), x), `${at}: composes to x`));
    const value = /when [A-Za-z]\([a-z]\) = ([\d.]+)/.exec(prompt);
    if (value) assert.ok(close(f(Number(/; [a-z] = (-?[\d.]+)$/.exec(answer)[1])), Number(value[1])), `${at}: the value`);
    return;
  }
  if ((match = /^Find the inverse relation of \{(.+)\}\.$/.exec(prompt))) {
    const pairs = [...ascii(match[1]).matchAll(/\((-?\d+), (-?\d+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    assert.ok(answer.startsWith(`{${pairs.map(([x, y]) => `(${y}, ${x})`).join(', ')}}`), at);
    if (/function/.test(answer)) {
      const distinct = new Set(pairs.map(([, y]) => y)).size === pairs.length;
      assert.match(answer, distinct ? /it is a function$/ : /it is not a function$/, at);
    }
    return;
  }
  if ((match = /^If ([a-z])\((-?\d+)\) = (-?\d+), complete/.exec(ascii(prompt)))) {
    assert.equal(answer, `${match[1]}⁻¹(${match[3]}) = ${match[2]}`, at);
    return;
  }
  if ((match = /^The point \((-?[\d.]+), (-?[\d.]+)\) is on the graph of f/.exec(ascii(prompt)))) {
    assert.equal(answer, `(${match[2]}, ${match[1]})`, at);
    return;
  }
  if ((match = /^A function f and its inverse meet at the point \((-?\d+), \1\)/.exec(ascii(prompt)))) {
    assert.equal(answer, `f(${match[1]}) = ${match[1]} and f⁻¹(${match[1]}) = ${match[1]}`, at);
    return;
  }
  if ((match = /^(?:Given|For) f\(x\) = (.+) and g\(x\) = (.+?), find (.+)\.$/.exec(prompt))) {
    const f = ruleOf(match[1]);
    const g = ruleOf(match[2]);
    const truth = {
      '(f + g)(x)': (x) => f(x) + g(x),
      '(f - g)(x)': (x) => f(x) - g(x),
      '(f · g)(x)': (x) => f(x) * g(x),
      '(f / g)(x)': (x) => f(x) / g(x),
      '(f ∘ g)(x)': (x) => f(g(x)),
      '(g ∘ f)(x)': (x) => g(f(x)),
    };
    answer.split('; ').forEach((clause) => {
      let part;
      if ((part = /^(\([fg] [+\-·/∘] [fg]\)\(x\)) = (.+)$/.exec(clause))) {
        const stated = ruleOf(part[2]);
        SAMPLES.filter((x) => Math.abs(g(x)) > 1e-9).forEach((x) => assert.ok(close(stated(x), truth[part[1]](x)), `${at}: ${clause} at x = ${x}`));
        return;
      }
      if ((part = /^excluded x = (.+)$/.exec(clause))) {
        part[1].split(', ').forEach((value) => assert.ok(close(g(Number(value)), 0), `${at}: g(${value}) = 0`));
        return;
      }
      if ((part = /^degree (\d+)$/.exec(clause))) {
        const product = /\(f · g\)\(x\) = ([^;]+)/.exec(answer)[1];
        assert.equal(Number(part[1]), Math.max(...[...ascii(product).matchAll(/x(²|³)?/g)].map(([, power]) => (power === '³' ? 3 : power === '²' ? 2 : 1))), `${at}: ${clause}`);
        return;
      }
      assert.fail(`${at}: no check for "${clause}"`);
    });
    // A "Check at x = c" step: every f(n) = m and g(n) = m it states, the
    // operation's value at c, and the value the result "also gives" at c.
    example.steps.map(ascii).filter((step) => step.startsWith('Check at x = ')).forEach((step) => {
      const c = Number(/^Check at x = (-?\d+):/.exec(step)[1]);
      const rules = { f, g };
      const values = [...step.matchAll(/(?<![\w)])([fg])\((-?\d+)\) = (-?\d+)/g)];
      assert.ok(values.length >= 2, `${at}: "${step}" states f and g at a number`);
      values.forEach(([piece, name, x, y]) => assert.ok(close(rules[name](Number(x)), Number(y)), `${at}: ${piece}`));
      const [, label, result] = /^(\([fg] [+\-·/∘] [fg]\)\(x\)) = ([^;]+)/.exec(answer);
      if (label.includes('∘')) {
        const [, inner] = /^\([fg] ∘ ([fg])\)/.exec(label);
        assert.match(step, new RegExp(`^Check at x = ${c}: ${inner}\\(${c}\\) = `), `${at}: ${label} starts from ${inner}(${c})`);
      } else {
        const stated = new RegExp(`${label.replace('(x)', `(${c})`).replace(/[()+·/]/g, '\\$&')} = [^=]+ = (-?\\d+)`).exec(step);
        assert.ok(stated && close(Number(stated[1]), truth[label](c)), `${at}: ${label} at ${c} in "${step}"`);
      }
      const gives = /also gives (-?\d+) at x = (-?\d+)\.$/.exec(step);
      assert.ok(gives && Number(gives[2]) === c, `${at}: "${step}" names the value at c`);
      assert.ok(close(Number(gives[1]), truth[label](c)), `${at}: ${label} at ${c} is ${truth[label](c)}, not ${gives[1]}`);
      assert.ok(close(ruleOf(result)(c), Number(gives[1])), `${at}: ${result} at ${c}`);
    });
    return;
  }
  if ((match = /^If ([a-z])\((-?\d+)\) = (-?\d+) and ([a-z])\(\2\) = (-?\d+), evaluate/.exec(ascii(prompt)))) {
    const [left, right] = [Number(match[3]), Number(match[5])];
    answer.split('; ').forEach((clause) => {
      const [, op, value] = /^\([a-z] (.) [a-z]\)\(-?\d+\) = (-?[\d.]+)$/.exec(clause);
      const expected = { '+': left + right, '-': left - right, '·': left * right, '/': left / right }[op];
      assert.ok(close(Number(value), expected), `${at}: ${clause}`);
    });
    return;
  }
  if ((match = /^If ([a-z])\((-?\d+)\) = (-?\d+) and ([a-z])\((-?\d+)\) = (-?\d+), evaluate/.exec(ascii(prompt)))) {
    assert.ok(answer.endsWith(`${match[4]}(${match[1]}(${match[2]})) = ${match[6]}`) && match[5] === match[3], at);
    return;
  }
  if ((match = /^Let (.+?)\. Find (.+)\.$/.exec(prompt)) && /\(\w\(\d/.test(match[2]) && !/∘/.test(prompt)) {
    const rules = Object.fromEntries([...match[1].matchAll(/([a-z])\(([a-z])\) = (.+?)(?= and |$)/g)].map(([, name, variable, rule]) => [name, ruleOf(rule, variable)]));
    answer.split('; ').forEach((clause) => {
      const [, outer, inner, value, result] = /^([a-z])\(([a-z])\((-?[\d.]+)\)\) = (-?[\d.]+)$/.exec(clause);
      assert.ok(close(rules[outer](rules[inner](Number(value))), Number(result)), `${at}: ${clause}`);
    });
    return;
  }
  if ((match = /^Determine whether f\(t\) = (.+) and g\(t\) = (.+) are inverses\.$/.exec(prompt))) {
    const f = ruleOf(match[1], 't');
    const g = ruleOf(match[2], 't');
    const [, fog, gof] = /^f\(g\(t\)\) = (.+); g\(f\(t\)\) = (.+); /.exec(answer);
    SAMPLES.forEach((t) => {
      assert.ok(close(ruleOf(fog, 't')(t), f(g(t))), `${at}: f(g(t))`);
      assert.ok(close(ruleOf(gof, 't')(t), g(f(t))), `${at}: g(f(t))`);
    });
    const inverses = SAMPLES.every((t) => close(f(g(t)), t) && close(g(f(t)), t));
    assert.match(answer, inverses ? /f and g are inverses$/ : /f and g are not inverses$/, at);
    return;
  }
  if ((match = /^Let f\(x\) = (.+?) and g\(x\) = (.+?)\. Find \(f ∘ g\)\((−?\d+)\) and \(g ∘ f\)\(\3\)/.exec(prompt))) {
    const f = ruleOf(match[1]);
    const g = ruleOf(match[2]);
    const x = Number(ascii(match[3]));
    assert.ok(answer.startsWith(`(f ∘ g)(${x}) = ${f(g(x))} and (g ∘ f)(${x}) = ${g(f(x))}`), `${at}: ${answer}`);
    if (/f⁻¹/.test(answer)) assert.ok(answer.endsWith(`f⁻¹(${f(x)}) = ${x}`), at);
    return;
  }
  if ((match = /^Let f\(x\) = (.+?)(?: with its domain kept to x (≥|≤) (−?\d+))?\. (?:Find f\((−?\d+)\), then use f⁻¹|Explain why)/.exec(prompt))) {
    const f = ruleOf(match[1]);
    const [, y, x] = /f⁻¹\((-?[\d.]+)\) = (-?[\d.]+)$/.exec(answer);
    assert.ok(close(f(Number(x)), Number(y)), `${at}: f(${x}) = ${y}`);
    if (match[2]) {
      const edge = Number(ascii(match[3]));
      assert.ok(match[2] === '≥' ? Number(x) >= edge : Number(x) <= edge, `${at}: ${x} is on the kept side`);
    }
    if (match[4]) assert.equal(Number(x), Number(ascii(match[4])), at);
    return;
  }
  assert.fail(`${where}: no check for sibling "${prompt}"`);
};

const keyIsAbsent = (question, key, where) => {
  ic.hints(question).forEach((hint) => {
    assertClean(hint, where);
    assert.equal(hintRevealsAnswer(hint, key.flatMap(spellings)), false, `${where}: "${hint}" names an answer (${key.join(' | ')})`);
  });
  const backUp = ic.backUpQuestion(question);
  if (backUp) [backUp.prompt, ...backUp.options].forEach((piece) => assertClean(piece, where));
};

const siblingsChecked = (question, where, seeds = [0, 1]) => seeds
  .map((seed) => ic.similarProblem(question, { seed }))
  .filter(Boolean)
  .map((example) => { verifySibling(example, where); return example; }).length;

/* ---------------------------------------------------------------------------
 * The registry tools.
 * ------------------------------------------------------------------------- */

test('inverseCompositionLab: 200 instances per view on every function type, siblings re-solved', () => {
  const types = ['linear', 'quadratic', 'exponential', 'logarithmic', 'squareRoot', 'absolute', 'cubic'];
  ['full', 'composition', 'inverse', 'restriction'].forEach((mode, modeIndex) => {
    const random = seeded(300 + modeIndex);
    let checked = 0;
    for (let index = 0; index < 210; index += 1) {
      const type = types[index % types.length];
      const f = { type, a: random.pick([1, 2, -1, 3, 0.5]), h: random.int(-2, 2), k: random.int(-3, 3), ...(['exponential', 'logarithmic'].includes(type) ? { base: random.pick([2, 3, 10]) } : {}) };
      const g = { type: 'linear', a: random.pick([2, -3, 1]), h: 0, k: random.int(-2, 2) };
      const question = { type: 'inverseCompositionLab', mode, f, g, x: random.int(-2, 3), prompt: `Lab ${mode} (${index})` };
      const where = `lab ${mode} ${JSON.stringify(f)}`;
      assert.ok(ic.matches(question), where);
      ic.hints(question).forEach((hint) => assertClean(hint, where));
      checked += siblingsChecked(question, where);
    }
    assert.ok(checked > 200, `${mode}: siblings re-solved (${checked})`);
  });
});

test('deriveInverse and functionOperationsLab: 200 instances per shape, siblings re-solved, hints key-free', () => {
  const random = seeded(411);
  for (let index = 0; index < 200; index += 1) {
    const a = random.nonZero(-6, 6);
    const b = random.int(-9, 9);
    const question = { type: 'inverseCompositionLab', mode: 'deriveInverse', f: { type: 'linear', a, h: 0, k: b }, prompt: `Derive (${index})` };
    const inverse = polyText([new Fraction(-b, a).valueOf(), new Fraction(1, a).valueOf()]);
    keyIsAbsent(question, a === 1 || a === -1 ? [inverse] : [], `derive ${a}x + ${b}`);
    assert.ok(siblingsChecked(question, `derive ${a}x + ${b}`) > 0, `derive ${a}x + ${b}: a sibling`);
  }
  const OPERATIONS = [['sum'], ['difference'], ['product'], ['quotient'], ['composition'], ['sum', 'difference', 'product', 'quotient'], ['composition', 'product']];
  OPERATIONS.forEach((operations, setIndex) => {
    const draw = seeded(500 + setIndex);
    let offered = 0;
    for (let index = 0; index < 200; index += 1) {
      const quadratic = draw.next() < 0.5;
      const f = quadratic ? { type: 'polynomial', coefficients: [draw.nonZero(-3, 3), draw.int(-5, 5), draw.int(-6, 6)] } : { type: 'linear', m: draw.nonZero(-5, 5), b: draw.int(-6, 6) };
      const g = { type: 'linear', m: draw.nonZero(-4, 4), b: draw.nonZero(-6, 6) };
      const question = { type: 'functionOperationsLab', operations, composeOrder: draw.pick(['fOfG', 'gOfF']), f, g, prompt: `Operations (${index})` };
      const where = `ops ${operations.join('+')} ${JSON.stringify([f, g])}`;
      assert.ok(ic.matches(question), where);
      ic.hints(question).forEach((hint) => assertClean(hint, where));
      offered += siblingsChecked(question, where, [index]);
    }
    assert.ok(offered > 150, `${operations.join('+')}: a worked example for most items (${offered} of 200)`);
  });
});

/* ---------------------------------------------------------------------------
 * multiAnswer items, written the way the L3 / L4 lessons write them, with
 * keys computed here.
 * ------------------------------------------------------------------------- */

const signed = (value) => (value < 0 ? `−${Math.abs(value)}` : `${value}`);
const linearText = (a, b, v = 'x') => `${a === 1 ? '' : a === -1 ? '−' : a}${v}${b === 0 ? '' : b > 0 ? `+${b}` : `−${Math.abs(b)}`}`;

const MULTI = {
  linearInverse: (random, index) => {
    const a = random.pick([2, 3, 4, 5, -2, -3, -4, 6]);
    const b = random.nonZero(-12, 12);
    const inverse = new Fraction(b).neg().div(a);
    const key = `(x${b > 0 ? '−' : '+'}${Math.abs(b)})/${a}`;
    return {
      key: [key, `${new Fraction(1, a).toFraction()}x`, inverse.toFraction()],
      question: { type: 'multiAnswer', prompt: `Find the inverse of f(x)=${linearText(a, b)}. (${index})`, answerFields: [{ id: 'inverse', label: 'f⁻¹(x)', answer: key, inputProfile: 'choice', options: [key, `${a}x+${b}`] }] },
    };
  },
  contextInverse: (random, index) => {
    const rate = random.pick([12, 15, 20, 25, 40]);
    const fee = random.pick([25, 30, 50, 60]);
    const months = random.int(3, 20);
    const total = fee + rate * months;
    return {
      key: [String(months)],
      question: { type: 'multiAnswer', prompt: `A plan costs C(m)=${rate}m+${fee}, where m is months. Use the inverse relationship. (${index})`, answerFields: [{ id: 'inverse', label: 'Inverse rule m = C⁻¹(x)', answer: `(x−${fee})/${rate}`, inputProfile: 'choice', options: [`(x−${fee})/${rate}`, `${rate}x+${fee}`] }, { id: 'months', label: `Months represented by a total cost of $${total}`, answer: months, inputProfile: 'number' }] },
    };
  },
  inverseRelation: (random, index) => {
    const pairs = [];
    while (pairs.length < 4) {
      const pair = [random.int(-8, 9), random.int(-8, 9)];
      if (!pairs.some(([x]) => x === pair[0])) pairs.push(pair);
    }
    const swapped = `{${pairs.map(([x, y]) => `(${signed(y)}, ${signed(x)})`).join(', ')}}`;
    return {
      key: [swapped],
      question: { type: 'multiAnswer', prompt: `Find the inverse relation of {${pairs.map(([x, y]) => `(${signed(x)}, ${signed(y)})`).join(', ')}}. (${index})`, answerFields: [{ id: 'inverse', label: 'Inverse relation', answer: swapped, inputProfile: 'text' }] },
    };
  },
  inverseProperty: (random, index) => {
    const p = random.int(-9, 12);
    let q = random.int(-9, 12);
    if (q === p) q += 1;
    return {
      key: [String(q), String(p)].map((value) => value.replace('-', '−')),
      question: { type: 'multiAnswer', prompt: `Use the inverse property. If f(${signed(p)})=${signed(q)}, complete the statement about f⁻¹. (${index})`, answerFields: [{ id: 'input', label: 'Input to f⁻¹', answer: q, inputProfile: 'number' }, { id: 'output', label: 'Output of f⁻¹', answer: p, inputProfile: 'number' }] },
    };
  },
  pointwise: (random, index) => {
    const a = random.int(-4, 6);
    const p = random.nonZero(-9, 9);
    const q = random.nonZero(-9, 9);
    return {
      key: [String(p + q), String(p - q)],
      question: { type: 'multiAnswer', prompt: `If f(${signed(a)})=${signed(p)} and g(${signed(a)})=${signed(q)}, evaluate two pointwise operations. (${index})`, answerFields: [{ id: 'sum', label: `(f+g)(${signed(a)})`, answer: p + q, inputProfile: 'number' }, { id: 'difference', label: `(f−g)(${signed(a)})`, answer: p - q, inputProfile: 'number' }] },
    };
  },
  compositionValues: (random, index) => {
    const a = random.int(-4, 8);
    const b = random.int(-6, 9);
    const c = random.int(-9, 12);
    return {
      key: [String(b), String(c)],
      question: { type: 'multiAnswer', prompt: `If g(${signed(a)})=${signed(b)} and f(${signed(b)})=${signed(c)}, evaluate the composition f(g(${signed(a)})). (${index})`, answerFields: [{ id: 'inside', label: `g(${signed(a)})`, answer: b, inputProfile: 'number' }, { id: 'composition', label: `f(g(${signed(a)}))`, answer: c, inputProfile: 'number' }] },
    };
  },
  contextComposition: (random, index) => {
    const off = random.pick([50, 100, 150, 200]);
    const rate = random.pick([0.9, 0.95, 0.8, 0.96]);
    const pay = random.pick([1000, 1500, 2000, 2400]);
    const first = rate * (pay - off);
    const second = rate * pay - off;
    return {
      key: [String(Math.round(first * 100) / 100), String(Math.round(second * 100) / 100)],
      question: { type: 'multiAnswer', prompt: `A $${off} deduction and a tax can be applied in different orders to a $${pay} paycheck. Let r(x)=x−${off} and t(x)=${rate}x. (${index})`, answerFields: [{ id: 'one', label: `t(r(${pay}))`, answer: first, inputProfile: 'number' }, { id: 'two', label: `r(t(${pay}))`, answer: second, inputProfile: 'number' }] },
    };
  },
  compositionSymbolic: (random, index) => {
    const f = [random.int(-5, 5), random.nonZero(-4, 4), random.nonZero(-3, 3)];
    const g = [random.nonZero(-5, 5), random.nonZero(-3, 3)];
    const F = (x) => f[0] + f[1] * x + f[2] * x * x;
    const fog = polyText([F(g[0]) - 0, 0, 0].map((_, power) => (power === 0 ? f[0] + f[1] * g[0] + f[2] * g[0] ** 2 : power === 1 ? f[1] * g[1] + 2 * f[2] * g[0] * g[1] : f[2] * g[1] ** 2)));
    const gof = polyText([g[0] + g[1] * f[0], g[1] * f[1], g[1] * f[2]]);
    return {
      key: [fog, gof],
      question: { type: 'multiAnswer', prompt: `For f(x)=${polyText(f).replace(/\s+/g, '')} and g(x)=${polyText(g).replace(/\s+/g, '')}, find both compositions. (${index})`, answerFields: [{ id: 'fog', label: '(f∘g)(x)', answer: fog.replace(/\s+/g, ''), inputProfile: 'choice', options: [fog.replace(/\s+/g, ''), gof.replace(/\s+/g, '')] }, { id: 'gof', label: '(g∘f)(x)', answer: gof.replace(/\s+/g, ''), inputProfile: 'choice', options: [gof.replace(/\s+/g, ''), fog.replace(/\s+/g, '')] }] },
    };
  },
  inverseVerification: (random, index) => {
    const a = random.pick([2, 3, 4, 5]);
    const b = random.nonZero(-9, 9);
    const b2 = random.next() < 0.5 || b === -1 ? b : b + 1;
    const verdict = b2 === b ? 'yes' : 'no';
    return {
      key: [verdict],
      question: { type: 'multiAnswer', prompt: `Determine whether f(x)=${linearText(a, b)} and g(x)=(x${b2 > 0 ? '−' : '+'}${Math.abs(b2)})/${a} are inverses. (${index})`, answerFields: [{ id: 'fog', label: '(f∘g)(x)', answer: 'x', inputProfile: 'choice', options: ['x', `x+${a}`] }, { id: 'inverse', label: 'Are f and g inverses?', answer: verdict, inputProfile: 'choice', options: ['yes', 'no'] }] },
    };
  },
  operationsExcluded: (random, index) => {
    const f = [random.int(-5, 5), random.int(-4, 4), random.nonZero(-3, 3)];
    const root = random.nonZero(-6, 6);
    const g = [-root, 1];
    return {
      key: [String(root).replace('-', '−')],
      question: { type: 'multiAnswer', prompt: `Given f(x)=${polyText(f).replace(/\s+/g, '')} and g(x)=${polyText(g).replace(/\s+/g, '')}, write the quotient and identify the excluded input. (${index})`, answerFields: [{ id: 'quotient', label: '(f/g)(x)', answer: `(${polyText(f)})/(${polyText(g)})`, inputProfile: 'text' }, { id: 'excluded', label: 'Excluded x-value', answer: root, inputProfile: 'number' }] },
    };
  },
};

test('multiAnswer inverse and composition items: 200 per shape, hints key-free, siblings re-solved', () => {
  Object.entries(MULTI).forEach(([shape, make], shapeIndex) => {
    const random = seeded(1300 + shapeIndex);
    let offered = 0;
    for (let index = 0; index < 200; index += 1) {
      const { key, question } = make(random, index);
      const where = `${shape} #${index}: ${question.prompt}`;
      assert.ok(ic.matches(question), where);
      keyIsAbsent(question, key, where);
      offered += siblingsChecked(question, where, [index]);
    }
    assert.ok(offered > 150, `${shape}: a worked example for most items (${offered} of 200)`);
  });
});

/* ---------------------------------------------------------------------------
 * The defects, one test each (each red on the old code).
 * ------------------------------------------------------------------------- */

const allSiblings = (question, seeds = 80) => Array.from({ length: seeds }, (_, seed) => ic.similarProblem(question, { seed })).filter(Boolean);

test('defect: −1 times zero is never written "−0" in a lab sibling (f(0) or f⁻¹(0))', () => {
  // Answers 38, 29 and 2: none of them is in "−1·0", so the guard keeps those siblings.
  const steps = Array.from({ length: 1200 }, (_, index) => ic.similarProblem({ type: 'inverseCompositionLab', mode: 'full', f: { type: 'linear', a: 3, h: 0, k: 5 }, g: { type: 'linear', a: 2, h: 0, k: 7 }, x: 2, prompt: `Item ${index}` }, { seed: 0 }))
    .filter(Boolean)
    .flatMap((example) => { verifySibling(example, 'lab full'); return example.steps; });
  assert.ok(steps.some((step) => /[fg]\(0\) = −1·0/.test(step)), 'a sibling evaluates −x + b at zero');
  assert.ok(steps.some((step) => /f⁻¹\(0\) = −1·0/.test(step)), 'a sibling evaluates f⁻¹(x) = −x + b at zero');
  steps.forEach((step) => assert.doesNotMatch(step, /(?<![\d.])−0(?![.\d])/, step));
});

test('defect: an unshifted exponential is undone without adding zero', () => {
  const question = { type: 'inverseCompositionLab', mode: 'inverse', f: { type: 'exponential', a: 1, h: 0, k: 1, base: 2 }, x: 1, prompt: 'Undo the exponential.' };
  const examples = allSiblings(question, 200).filter((example) => /log_/.test(example.steps.join(' ')));
  assert.ok(examples.some((example) => !/\^\(/.test(example.prompt)), 'an unshifted exponential sibling is drawn');
  examples.forEach((example) => {
    verifySibling(example, 'exponential undo');
    example.steps.forEach((step) => assert.doesNotMatch(step, /[+−] 0 = /, step));
  });
});

test('defect: a rule substituted into another is in parentheses unless it is one letter or number', () => {
  const question = { type: 'multiAnswer', prompt: 'For f(x)=x²+1 and g(x)=3x, find both compositions.', answerFields: [{ id: 'fog', label: '(f∘g)(x)', answer: '9x²+1', inputProfile: 'choice', options: ['9x²+1', '3x²+3'] }, { id: 'gof', label: '(g∘f)(x)', answer: '3x²+3', inputProfile: 'choice', options: ['3x²+3', '9x²+1'] }] };
  const hint = ic.hints(question).find((entry) => /replace every x in x² \+ 1/.test(entry));
  assert.ok(hint, ic.hints(question).join(' | '));
  assert.match(hint, /with \(3x\)/, hint);
  const ops = { type: 'functionOperationsLab', operations: ['composition'], composeOrder: 'fOfG', f: { type: 'polynomial', coefficients: [1, 0, 1] }, g: { type: 'linear', m: -2, b: 0 }, prompt: 'Compose.' };
  const opsHint = ic.hints(ops).find((entry) => /replace every x in/.test(entry));
  assert.ok(opsHint, ic.hints(ops).join(' | '));
  assert.match(opsHint, /with \(−2x\)/, opsHint);
});

test('defect: a cubic f composed with a linear g expands a cube, not a square', () => {
  const question = { type: 'multiAnswer', prompt: 'For f(x)=x³+2 and g(x)=2x+1, find both compositions.', answerFields: [{ id: 'fog', label: '(f∘g)(x)', answer: '8x³+12x²+6x+3', inputProfile: 'choice', options: ['8x³+12x²+6x+3', '2x³+5'] }, { id: 'gof', label: '(g∘f)(x)', answer: '2x³+5', inputProfile: 'choice', options: ['2x³+5', '8x³+12x²+6x+3'] }] };
  const hint = ic.hints(question).find((entry) => entry.startsWith('Expand'));
  assert.ok(hint, ic.hints(question).join(' | '));
  assert.match(hint, /^Expand \(2x \+ 1\)³ as \(2x \+ 1\)\(2x \+ 1\)\(2x \+ 1\)/, hint);
});

test('defect: one sum, difference, product or composition gets a worked example, checked at a number', () => {
  ['sum', 'difference', 'product', 'composition'].forEach((operation) => {
    const question = { type: 'functionOperationsLab', operations: [operation], composeOrder: 'gOfF', f: { type: 'linear', m: 1, b: -2 }, g: { type: 'linear', m: 1, b: -3 }, prompt: `One ${operation}.` };
    const example = ic.similarProblem(question, { seed: 0 });
    assert.ok(example, `${operation}: a worked example`);
    verifySibling(example, operation);
    assert.match(example.steps[example.steps.length - 1], /^Check at x = /, operation);
  });
});

test('off a parabola\'s kept branch the guarded answers include the value the grader marks, 2h − x', async () => {
  const { expectedValues } = await import('../../src/platform/supports/families/inverseComposition.js');
  // f(x) = (x − 2)² kept on x ≥ 2 (declared on the question, where V5 puts it); x = 0:
  // f(0) = 4 and f⁻¹(4) = 2 + √4 = 4.
  const question = { type: 'inverseCompositionLab', mode: 'inverse', inverseBranch: 'right', f: { type: 'quadratic', a: 1, h: 2, k: 0 }, x: 0 };
  const values = expectedValues(question).map(String);
  assert.ok(values.includes('4'), `expected 4 among ${JSON.stringify(values)}`);
  assert.ok(values.includes('0'), 'x itself stays guarded');
});
