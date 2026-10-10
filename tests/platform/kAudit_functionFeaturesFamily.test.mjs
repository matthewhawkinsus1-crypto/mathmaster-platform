/*
 * JOB K AUDIT: THE functionFeatures SUPPORT FAMILY ON MANY SEEDED INSTANCES.
 *
 * supportFamily_functionFeatures.test.mjs checks the family on the authored
 * corpus. This file draws hundreds of seeded instances per shape the family
 * claims (graphAnalysis / functionGraph on every function type, restricted and
 * not, with every analysis part; functionCharacteristics compiled from V5
 * intents; generated function tables; every sequenceExplorer mode; every
 * functionInvestigation2 mode) and re-solves every worked sibling from its own
 * prompt with mathjs: every f(a) = b, every zero, interval, point, range and
 * term it states. Hints and back-up steps are checked against the shared
 * grader's key and for display hygiene.
 *
 * Then one test per defect the audit found, each red on the old code:
 *   - a local minimum/maximum on a graph that never turns was explained by
 *     "the graph's only turning point is a highest point";
 *   - a "vertex" or "center" was stated as (h, k) for an exponential or a
 *     logarithm, where (h, k) is not that feature (a log's is not even on its
 *     graph);
 *   - "State its vertex (intervals in interval notation)": the notation note
 *     on a prompt that asks for no interval;
 *   - "it is never increasing and decreasing on (-2, 5)";
 *   - a functionCharacteristics sibling stated a cube root's y-intercept as
 *     "f(0) = -0.519842" (not equal: a rounding);
 *   - a reciprocal "falls the whole way" (it jumps at its asymptote), and its
 *     horizontal asymptote came from a "power term" it does not have;
 *   - the asymptote hint for a logarithm sent the student to a horizontal
 *     line written "y = …"; the turning-point hint assumed there is one;
 *   - a missing-term sibling read its common difference through the very
 *     term that was hidden; a ratio step was written "× -2";
 *   - a relation sibling asked "…{…} and range." with no domain, and answered
 *     a plot under "Build the mapping";
 *   - an attribute sibling called a reciprocal's graph "one connected piece".
 *
 * Mutation-checked: each fix was undone in functionFeatures.js and the test
 * named for it went red, then the fix was restored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { create, all } from 'mathjs';

import * as ff from '../../src/platform/supports/families/functionFeatures.js';
import { buildGraphWorkspaceModel } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';

const math = create(all);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');

/* ---------------------------------------------------------------------------
 * An evaluator independent of the family: the sibling's own written rule,
 * read by mathjs.
 * ------------------------------------------------------------------------- */

const toMathjs = (rhs) => ascii(rhs)
  .replace(/·/g, '*').replace(/²/g, '^2').replace(/³/g, '^3')
  .replace(/√x/g, 'sqrt(x)').replace(/√\(/g, 'sqrt(').replace(/∛x/g, 'cbrt(x)').replace(/∛\(/g, 'cbrt(')
  .replace(/log₂\(/g, 'log2(').replace(/(^|[^0-9a-z_])log\(/g, '$1log10(').replace(/log_([0-9.]+)\(([^)]*)\)/g, 'log($2, $1)')
  .replace(/\|([^|]*)\|/g, 'abs($1)');
const functionOf = (rhs) => {
  const compiled = math.parse(toMathjs(rhs)).compile();
  return (x) => {
    try {
      const value = compiled.evaluate({ x });
      return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
    } catch {
      return Number.NaN;
    }
  };
};
const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/** A seeded generator, so a failure names an instance that can be replayed. */
const seeded = (seed) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return { next, pick: (values) => values[Math.floor(next() * values.length)], int: (low, high) => low + Math.floor(next() * (high - low + 1)) };
};

const HYGIENE = /\+ -|\+ −|- -|− −|--|−−|(?<![\d.])1x|NaN|undefined|Infinity|(?<![\d.])[-−]0(?![.\d])|\bnull\b|\[object|× -/;
const assertClean = (value, where) => assert.doesNotMatch(String(value), HYGIENE, `${where}: display hygiene in "${value}"`);

const parseIntervals = (value) => ascii(value).split(' ∪ ').map((piece) => {
  const match = /^([[(])(-?[\d.]+|-∞), (-?[\d.]+|∞)([\])])$/.exec(piece.trim());
  if (!match) return null;
  const end = (raw) => (raw === '∞' ? Infinity : raw === '-∞' ? -Infinity : Number(raw));
  return { lo: end(match[2]), hi: end(match[3]), loIn: match[1] === '[', hiIn: match[4] === ']' };
});
const parseInequality = (value, variable) => {
  const text = ascii(value);
  let match = new RegExp(`^(-?[\\d.]+) (≤|<) ${variable} (≤|<) (-?[\\d.]+)$`).exec(text);
  if (match) return [{ lo: Number(match[1]), hi: Number(match[4]), loIn: match[2] === '≤', hiIn: match[3] === '≤' }];
  return parseIntervals(text);
};
const inSet = (x, set) => set.some((part) => (x > part.lo || (part.loIn && close(x, part.lo))) && (x < part.hi || (part.hiIn && close(x, part.hi))));

/** The samples of a graph over its window: dense, plus every whole number. */
const samplesOf = (f, [low, high]) => {
  const xs = new Set();
  for (let index = 0; index <= 2400; index += 1) xs.add(low + ((high - low) * index) / 2400);
  for (let x = Math.ceil(low); x <= high; x += 1) xs.add(x);
  return [...xs].sort((a, b) => a - b).map((x) => [x, f(x)]).filter(([, y]) => Number.isFinite(y));
};

/** Check one "kind value" clause of a graph sibling's answer against the graph itself. */
const verifyClause = (f, window, clause, where) => {
  const points = samplesOf(f, window);
  const ys = points.map(([, y]) => y);
  let match;
  if ((match = /^domain (.+)$/.exec(clause))) {
    const set = parseInequality(match[1], 'x');
    assert.ok(set.every(Boolean), `${where}: readable ${clause}`);
    assert.ok(close(set[0].lo, points[0][0]) && close(set[set.length - 1].hi, points[points.length - 1][0]), `${where}: ${clause}`);
    return;
  }
  if ((match = /^range (.+)$/.exec(clause))) {
    const set = parseInequality(match[1], 'y');
    assert.ok(set.every(Boolean), `${where}: readable ${clause}`);
    if (set.length === 1 && Number.isFinite(set[0].lo) && Number.isFinite(set[0].hi)) {
      assert.ok(close(set[0].lo, Math.min(...ys)) && close(set[0].hi, Math.max(...ys)), `${where}: ${clause}, sampled [${Math.min(...ys)}, ${Math.max(...ys)}]`);
    }
    ys.forEach((y) => assert.ok(inSet(y, set) || set.some((part) => close(y, part.lo, 1e-6) || close(y, part.hi, 1e-6)), `${where}: ${clause} misses y = ${y}`));
    return;
  }
  if ((match = /^(increasing|decreasing|positive|negative|constant) (.+)$/.exec(clause))) {
    const set = match[2] === 'never' ? [] : parseIntervals(match[2]);
    assert.ok(set.every(Boolean), `${where}: readable ${clause}`);
    for (let index = 1; index < points.length - 1; index += 1) {
      const [x, y] = points[index];
      if (set.some((part) => close(x, part.lo, 1e-3) || close(x, part.hi, 1e-3))) continue;
      const change = points[index + 1][1] - points[index - 1][1];
      const truth = { positive: y > 1e-9, negative: y < -1e-9, increasing: change > 1e-12, decreasing: change < -1e-12, constant: Math.abs(change) < 1e-12 }[match[1]];
      // A turning point is flat in a symmetric difference: skip it.
      if (['increasing', 'decreasing', 'constant'].includes(match[1]) && Math.abs(change) < 1e-12) continue;
      assert.equal(inSet(x, set), truth, `${where}: ${clause} at x = ${x}`);
    }
    return;
  }
  if ((match = /^x-intercepts (.+?)(?:, zeros \{(.*)\})?$/.exec(clause))) {
    const stated = match[1] === 'never' ? [] : [...ascii(match[1]).matchAll(/\((-?[\d.]+), 0\)/g)].map((m) => Number(m[1]));
    stated.forEach((x) => assert.ok(close(f(x), 0), `${where}: f(${x}) = 0`));
    // A sign change across a reciprocal's asymptote (a jump) is not a crossing.
    const crossings = ys.slice(1).filter((y, index) => Math.sign(y) !== Math.sign(ys[index]) && Math.sign(y) !== 0 && Math.abs(y - ys[index]) < 1).length;
    assert.ok(crossings <= stated.length, `${where}: ${clause} misses a crossing`);
    return;
  }
  if ((match = /^y-intercept (.+)$/.exec(clause))) {
    if (match[1] === 'never') { assert.ok(!Number.isFinite(f(0)) || window[0] > 0 || window[1] < 0, `${where}: ${clause}`); return; }
    const point = /^\(0, (-?[\d.]+)\)$/.exec(ascii(match[1]));
    assert.ok(point, `${where}: ${clause}`);
    assert.ok(close(f(0), Number(point[1]), 1e-9), `${where}: ${clause} but f(0) = ${f(0)}`);
    return;
  }
  if ((match = /^(vertex|center|local minimum|local maximum|lowest point|highest point) (.+)$/.exec(clause))) {
    const interior = points.filter(([x]) => x > window[0] + 0.05 && x < window[1] - 0.05);
    const turns = interior.filter(([, y], index) => index > 0 && index < interior.length - 1
      && Math.sign(y - interior[index - 1][1]) !== Math.sign(interior[index + 1][1] - y) && Math.abs(interior[index + 1][1] - interior[index - 1][1]) < 0.05);
    if (match[2] === 'never') {
      const wantMin = /minimum|lowest/.test(match[1]);
      const found = interior.some(([, y], index) => index > 0 && index < interior.length - 1
        && (wantMin ? y < interior[index - 1][1] && y < interior[index + 1][1] : y > interior[index - 1][1] && y > interior[index + 1][1]));
      assert.equal(found, false, `${where}: ${clause} but the graph has one`);
      return;
    }
    const [, x, y] = /\((-?[\d.]+), (-?[\d.]+)\)/.exec(ascii(match[2])).map(Number);
    if (match[1] === 'center') {
      // A cubic's or cube root's point of symmetry, or where a reciprocal's asymptotes cross.
      const symmetric = [0.5, 1, 2].every((t) => close(f(x - t) + f(x + t), 2 * y, 1e-6));
      assert.ok(symmetric, `${where}: ${clause} is a center of symmetry`);
      return;
    }
    assert.ok(close(f(x), y, 1e-9), `${where}: ${clause} is on the graph (f(${x}) = ${f(x)})`);
    assert.ok(turns.length >= 1 && (f(x - 0.5) - y) * (f(x + 0.5) - y) > 0, `${where}: ${clause} is a turning point`);
    return;
  }
  if ((match = /^(rises|falls) everywhere$/.exec(clause))) {
    const direction = match[1] === 'rises' ? 1 : -1;
    points.slice(1).forEach(([x, y], index) => assert.ok(direction * (y - points[index][1]) > 0, `${where}: ${clause} at ${x}`));
    return;
  }
  if ((match = /^each branch (rises|falls)$/.exec(clause))) {
    const direction = match[1] === 'rises' ? 1 : -1;
    points.slice(1).forEach(([x, y], index) => {
      if (x - points[index][0] < 0.05) assert.ok(direction * (y - points[index][1]) > 0 || Math.abs(y - points[index][1]) > 50, `${where}: ${clause} at ${x}`);
    });
    return;
  }
  if ((match = /^(rises|falls), then (rises|falls)$/.exec(clause))) return;
  if ((match = /^asymptote y = (-?[\d.]+)$/.exec(ascii(clause)))) {
    assert.ok([-1e7, 1e7].some((x) => close(f(x), Number(match[1]), 1e-4)), `${where}: ${clause}`);
    return;
  }
  if ((match = /^axis x = (-?[\d.]+)$/.exec(ascii(clause)))) {
    [0.5, 1, 2].forEach((t) => assert.ok(close(f(Number(match[1]) - t), f(Number(match[1]) + t)), `${where}: ${clause}`));
    return;
  }
  if (/^turning point never$/.test(clause)) {
    // A reciprocal (a "/" in its rule) only seems to turn where it jumps at its asymptote.
    const changes = points.slice(1).map(([, y], index) => Math.sign(y - points[index][1])).filter(Boolean);
    assert.ok(changes.every((value) => value === changes[0]) || /\//.test(where), `${where}: ${clause}`);
    return;
  }
  if (clause.startsWith('The graph through')) {
    [...ascii(clause).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].forEach(([, x, y]) => assert.ok(close(f(Number(x)), Number(y)), `${where}: (${x}, ${y}) is on the graph`));
    return;
  }
  assert.fail(`${where}: no check for clause "${clause}"`);
};

/** Every "f(a) = b" and "gives x = r" the steps state, recomputed. */
const verifyStepNumbers = (f, steps, where) => {
  const text = ascii(steps.join(' '));
  for (const [whole, x, y] of text.matchAll(/f\((-?[\d.]+)\) = (-?[\d.]+)(?![\d.]*[)/])/g)) assert.ok(close(f(Number(x)), Number(y), 1e-9), `${where}: ${whole} but f(${x}) = ${f(Number(x))}`);
  for (const [, first, second] of text.matchAll(/gives x = (-?[\d.]+)(?: or x = (-?[\d.]+))?/g)) {
    [first, second].filter(Boolean).forEach((root) => assert.ok(close(f(Number(root)), 0), `${where}: x = ${root} is a zero`));
  }
};

const siblingRule = (prompt) => {
  const match = /f\(x\) = (.+?)(?: for (-?[\d.]+) ≤ x ≤ (-?[\d.]+))?(?:\. State| is shown)/.exec(ascii(prompt)) || /^Graph f\(x\) = (.+)\.$/.exec(ascii(prompt));
  return match ? { rhs: match[1], window: match[2] !== undefined ? [Number(match[2]), Number(match[3])] : [-12, 12] } : null;
};

const verifyFunctionSibling = (example, where) => {
  [example.prompt, ...example.steps, example.answer].forEach((piece) => assertClean(piece, where));
  const rule = siblingRule(example.prompt);
  assert.ok(rule, `${where}: the sibling names its function: ${example.prompt}`);
  const f = functionOf(rule.rhs);
  verifyStepNumbers(f, example.steps, `${where} [${example.prompt}]`);
  example.answer.split('; ').forEach((clause) => verifyClause(f, rule.window, clause, `${where} [${example.prompt}]`));
  return { f, rule };
};

/* ---------------------------------------------------------------------------
 * Instances.
 * ------------------------------------------------------------------------- */

const TYPES = ['linear', 'absolute', 'quadratic', 'squareRoot', 'cubic', 'cubeRoot', 'exponential', 'logarithmic', 'rational'];
const PART_SETS = [
  ['domain', 'range'], ['increasing', 'decreasing'], ['positive', 'negative'], ['constant', 'increasing', 'decreasing'],
  ['point:vertex'], ['point:center'], ['point:xIntercepts'], ['point:yIntercept'], ['point:localMinimum'], ['point:localMaximum'],
  ['domain', 'range', 'increasing', 'decreasing'], [],
];

const graphInstance = (random, type, parts, index) => {
  const spec = type === 'linear'
    ? { type, m: random.pick([1, -1, 2, -2, 0.5, 3]), b: random.int(-4, 4) }
    : { type, a: random.pick([1, -1, 2, -2, 0.5]), h: random.int(-3, 3), k: random.int(-3, 3) };
  if (type === 'exponential') spec.base = random.pick([2, 3, 0.5]);
  if (type === 'logarithmic') spec.base = random.pick([2, 3, 10]);
  if (random.next() < 0.4) {
    const low = random.int(-4, 1);
    spec.domain = { min: low, max: low + random.int(2, 6), minClosed: random.next() < 0.7, maxClosed: random.next() < 0.7 };
  }
  const notation = random.pick(['interval', 'inequality']);
  const analysisRequests = parts.map((part) => (part.startsWith('point:') ? { id: part.slice(6), kind: 'point', feature: part.slice(6) } : { id: part, kind: part, notation }));
  return parts.length
    ? { type: 'graphAnalysis', functionSpec: spec, analysisRequests, prompt: `Use the graph shown (${index}).` }
    : { type: random.pick(['functionGraph', 'functionInvestigation']), functionSpec: spec, prompt: `Graph the function (${index}).` };
};

const graphKey = (question) => {
  const model = buildGraphWorkspaceModel(question, { analysisMode: question.type === 'graphAnalysis' });
  const keys = [];
  model.analysisParts.forEach((part) => {
    (part.acceptedAnswers || []).forEach((answer) => keys.push(String(answer)));
    (part.expected || []).forEach((point) => Array.isArray(point) && keys.push(`(${point[0]}, ${point[1]})`));
  });
  return keys;
};

test('graph items: 200 seeded instances per shape, every sibling re-solved, every hint clean and key-free', () => {
  let checked = 0;
  TYPES.forEach((type, typeIndex) => {
    const random = seeded(7000 + typeIndex);
    for (let index = 0; index < 220; index += 1) {
      const parts = PART_SETS[index % PART_SETS.length];
      const question = graphInstance(random, type, parts, index);
      const where = `${type} ${parts.join(',') || 'construct'} #${index}`;
      if (!ff.matches(question)) continue;
      const keys = graphKey(question);
      ff.hints(question).forEach((hint) => {
        assertClean(hint, where);
        assert.equal(keys.length ? hintRevealsAnswer(hint, keys) : false, false, `${where}: hint names an answer: ${hint}`);
      });
      const backUp = ff.backUpQuestion(question);
      if (backUp) [backUp.prompt, ...backUp.options].forEach((piece) => assertClean(piece, where));
      const sibling = ff.similarProblem(question, { seed: index });
      if (!sibling) continue;
      verifyFunctionSibling(sibling, where);
      checked += 1;
    }
  });
  assert.ok(checked > 1000, `enough siblings were re-solved (${checked})`);
});

/* ---- functionCharacteristics, compiled from V5 intents the way a lesson reaches a class ---- */

const LESSON = JSON.parse(readFileSync(path.join(ROOT, 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json'), 'utf8'));
const questionsIn = (value) => {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if ((node.type || node.toolId) && (node.prompt || node.answerFields)) { out.push(node); return; }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return out;
};
const compileIntent = (intent) => questionsIn(compileAuthoringIntentV5({ ...LESSON, sections: [{ ...LESSON.sections[0], questions: [intent] }] }).package);

const ACTIONS = ['findXIntercepts', 'findZeros', 'findYIntercept', 'findMaximum', 'findMinimum', 'findAxisOfSymmetry', 'findAsymptote', 'analyzeIncreasing', 'analyzeDomain', 'analyzeRange'];
const characteristicsIntent = (random, family, index) => {
  const fn = family === 'linear' ? { family, m: random.pick([2, -1, 3]), b: random.int(-4, 4) } : { family, a: random.pick([1, -1, 2, -2]), h: random.int(-3, 3), k: random.int(-3, 3) };
  if (family === 'exponential') { fn.base = random.pick([2, 0.5, 3]); fn.h = 0; }
  if (family === 'logarithmic') fn.base = 2;
  const actions = ['readGraph', ...ACTIONS.filter(() => random.next() < 0.3)];
  if (actions.length === 1) actions.push(random.pick(ACTIONS));
  return { standard: 'A.9D', dok: 2, difficultyBand: 2, prompt: `Use the graph shown to describe this function. (${index})`, studentActions: actions, function: fn, graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } };
};

test('functionCharacteristics items: 200 compiled instances per family, every sibling re-solved', () => {
  let checked = 0;
  TYPES.forEach((family, familyIndex) => {
    const random = seeded(8100 + familyIndex);
    for (let index = 0; index < 200; index += 1) {
      const intent = characteristicsIntent(random, family, index);
      let compiled = [];
      try { compiled = compileIntent(intent); } catch { continue; }
      compiled.filter((question) => question.type === 'functionCharacteristics' && ff.matches(question)).forEach((question) => {
        const where = `characteristics ${family} ${intent.studentActions.join(',')} #${index}`;
        ff.hints(question).forEach((hint) => assertClean(hint, where));
        const sibling = ff.similarProblem(question, { seed: index });
        if (!sibling) return;
        verifyFunctionSibling(sibling, where);
        checked += 1;
      });
    }
  });
  assert.ok(checked > 600, `enough siblings were re-solved (${checked})`);
});

/* ---- generated function tables (problemGenerator, the legacy `table` type) ---- */

test('generated function tables: 200 per rule type, the sibling table recomputed, the hints key-free', () => {
  ['linear', 'quadratic'].forEach((ruleType) => {
    for (let index = 0; index < 200; index += 1) {
      const question = generateQuestion({ type: 'table', prompt: 'Complete the table.', generator: { kind: 'functionTable', ruleType, rowCount: 5, blankCount: 3 } }, `kaudit-table-${ruleType}-${index}`);
      const where = `table ${ruleType} #${index} ${JSON.stringify(question.rule)}`;
      assert.ok(ff.matches(question), where);
      const keys = Object.values(question.table.answers).map(String);
      ff.hints(question).forEach((hint) => {
        assertClean(hint, where);
        assert.equal(hintRevealsAnswer(hint, keys), false, `${where}: ${hint}`);
      });
      const sibling = ff.similarProblem(question, { seed: index });
      assert.ok(sibling, `${where}: a sibling`);
      const [, rhs, xsText] = /y = (.+) at x = (.+)\.$/.exec(ascii(sibling.prompt));
      const f = functionOf(rhs);
      const xs = xsText.split(', ').map(Number);
      assert.equal(ascii(sibling.answer), `y-values ${xs.map(f).join(', ')}`, where);
      sibling.steps.forEach((step, row) => {
        const [, shown, value] = /: y = (.+) = (-?\d+)\.$/.exec(ascii(step));
        assert.equal(math.evaluate(shown.replace(/²/g, '^2')), Number(value), `${where}: ${step}`);
        assert.equal(Number(value), f(xs[row]), `${where}: ${step}`);
      });
    }
  });
});

/* ---- sequences: every mode, arithmetic and geometric ---- */

const termOf = ({ kind, first, change }, n) => (kind === 'arithmetic' ? first + (n - 1) * change : first * change ** (n - 1));
const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];

/** The sequence a sibling's prompt shows, read without the family. */
const sequenceFromPrompt = (prompt) => {
  const shown = /(?:begins|sequence|term:) ((?:-?\d+|__)(?:, (?:-?\d+|__))+)/.exec(ascii(prompt))[1].split(', ');
  const known = shown.map((value, index) => [index + 1, value]).filter(([, value]) => value !== '__').map(([n, value]) => [n, Number(value)]);
  const [[n1, t1], [n2, t2]] = known;
  const arithmetic = known.every(([n, value]) => value === t1 + ((n - n1) * (t2 - t1)) / (n2 - n1));
  const ratio = (t2 / t1) ** (1 / (n2 - n1));
  const reading = arithmetic
    ? { kind: 'arithmetic', first: t1 - (n1 - 1) * ((t2 - t1) / (n2 - n1)), change: (t2 - t1) / (n2 - n1) }
    : { kind: 'geometric', first: t1 / ratio ** (n1 - 1), change: ratio };
  known.forEach(([n, value]) => assert.equal(termOf(reading, n), value, `${prompt}: one rule fits every shown term`));
  return { reading, shown };
};

test('sequenceExplorer: 200 instances per mode, every stated term, sum and step recomputed', () => {
  const modes = ['analyze', 'missingTerm', 'partialSum', 'ruleBridge', 'fullBridge', 'compare'];
  modes.forEach((mode, modeIndex) => {
    const random = seeded(9100 + modeIndex);
    for (let index = 0; index < 200; index += 1) {
      const kind = random.pick(['arithmetic', 'geometric']);
      const first = random.pick([3, -2, 5, 1, 4, -6]);
      const change = kind === 'arithmetic' ? random.pick([4, -3, 2, 7, -5]) : random.pick([2, -3, 3, 0.5]);
      const question = mode === 'compare'
        ? { type: 'sequenceExplorer', mode, prompt: `Compare (${index})`, left: { kind: 'arithmetic', first, difference: Math.abs(change) + 1 }, right: { kind: 'geometric', first: 2, ratio: 2 }, compareN: random.int(4, 8), leftLabel: 'A', rightLabel: 'B' }
        : { type: 'sequenceExplorer', mode, prompt: `Sequence (${index})`, sequence: { kind, first, ...(kind === 'arithmetic' ? { difference: change } : { ratio: change }) }, targetN: random.int(5, 9), missingIndex: random.int(2, 5), sumN: random.int(4, 7), studentActions: mode === 'fullBridge' ? ['analyzeSequence', 'writeRecursive'] : [] };
      const where = `sequence ${mode} ${kind} ${first} ${change} #${index}`;
      assert.ok(ff.matches(question), where);
      ff.hints(question).forEach((hint) => assertClean(hint, where));
      const sibling = ff.similarProblem(question, { seed: index });
      if (!sibling) continue;
      [sibling.prompt, ...sibling.steps, sibling.answer].forEach((piece) => assertClean(piece, where));
      const prompt = ascii(sibling.prompt);
      const answer = ascii(sibling.answer);
      let match;
      if ((match = /starts at (-?\d+) and adds (-?\d+) each time; sequence Q starts at (-?\d+) and doubles each time\. Which has the larger (\w+) term/.exec(prompt))) {
        const n = ORDINALS.indexOf(match[4]);
        const p = termOf({ kind: 'arithmetic', first: Number(match[1]), change: Number(match[2]) }, n);
        const q = termOf({ kind: 'geometric', first: Number(match[3]), change: 2 }, n);
        assert.equal(answer, p === q ? 'equal, by 0' : `${p > q ? 'P' : 'Q'}, by ${Math.abs(p - q)}`, where);
        continue;
      }
      const { reading, shown } = sequenceFromPrompt(prompt);
      if ((match = /find the (\w+) term\.$/.exec(prompt))) {
        const n = ORDINALS.indexOf(match[1]);
        assert.equal(answer, `a common ${reading.kind === 'arithmetic' ? 'difference' : 'ratio'} of ${reading.change}; ${match[1]} term ${termOf(reading, n)}`, where);
      } else if (prompt.startsWith('Find the missing term')) {
        const gap = shown.indexOf('__') + 1;
        assert.ok(answer.startsWith(`${ORDINALS[gap]} term ${termOf(reading, gap)} `), `${where}: ${answer}`);
      } else if ((match = /find the (\w+) term and the sum of the first (\d+) terms/.exec(prompt))) {
        const n = Number(match[2]);
        const sum = Array.from({ length: n }, (_, at) => termOf(reading, at + 1)).reduce((total, value) => total + value, 0);
        assert.equal(answer, `${match[1]} term ${termOf(reading, n)}; sum ${sum}`, where);
      } else {
        assert.match(prompt, /explicit rule and a recursive rule/, where);
        const explicit = /aₙ = ([^;]+);/.exec(answer)[1].replace(/·/g, '*').replace(/(\d)\(/g, '$1*(');
        [1, 2, 3, 6].forEach((n) => assert.ok(close(math.evaluate(explicit, { n }), termOf(reading, n)), `${where}: explicit rule at n = ${n}`));
      }
      // Every "a + n · d = v" and "a · r^n = v" the steps write is arithmetic that holds.
      sibling.steps.forEach((step) => {
        for (const [whole, expression, value] of ascii(step).matchAll(/((?:-?\d+) (?:\+ \d+ · \(?-?\d+\)?|· \(?-?\d+\)?\^\d+)) = (-?\d+)/g)) {
          assert.equal(math.evaluate(expression.replace(/·/g, '*')), Number(value), `${where}: ${whole}`);
        }
      });
    }
  });
});

/* ---- functionInvestigation2: every mode on every type ---- */

test('functionInvestigation2: 200 instances per mode, the sibling re-solved from its rule', () => {
  const modes = ['features', 'domainRange', 'intercepts', 'behavior', 'compare'];
  modes.forEach((mode, modeIndex) => {
    const random = seeded(9500 + modeIndex);
    for (let index = 0; index < 200; index += 1) {
      const type = random.pick(TYPES);
      const fn = { type, a: random.pick([1, -1, 2, -2, 0.5]), h: random.int(-3, 3), k: random.int(-3, 3), base: random.pick([2, 0.5, 3]) };
      const question = mode === 'compare'
        ? { type: 'functionInvestigation2', mode, prompt: `Compare (${index})`, left: fn, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: random.int(-3, 3) }
        : { type: 'functionInvestigation2', mode, prompt: `Investigate (${index})`, function: fn };
      const where = `investigation ${mode} ${JSON.stringify(fn)}`;
      assert.ok(ff.matches(question), where);
      const sibling = ff.similarProblem(question, { seed: index });
      if (!sibling) continue;
      [sibling.prompt, ...sibling.steps, sibling.answer].forEach((piece) => assertClean(piece, where));
      const prompt = ascii(sibling.prompt);
      const answer = ascii(sibling.answer);
      let match;
      if ((match = /^Compare f\(x\) = (.+) and g\(x\) = (.+) at x = (-?\d+):/.exec(prompt))) {
        const x = Number(match[3]);
        const [left, right] = [functionOf(match[1])(x), functionOf(match[2])(x)];
        assert.equal(answer, left === right ? 'They are equal' : `${left > right ? 'f' : 'g'} is greater (${left} vs ${right})`, where);
        continue;
      }
      const f = functionOf(/Investigate f\(x\) = (.+): find/.exec(prompt)[1]);
      verifyStepNumbers(f, sibling.steps, where);
      if ((match = /^x-intercepts (.+); y-intercept (.+)$/.exec(answer))) {
        match[1].split(', ').forEach((x) => assert.ok(close(f(Number(x)), 0), `${where}: f(${x}) = 0`));
        assert.ok(close(f(0), Number(match[2])), `${where}: f(0)`);
      } else if ((match = /^(?:vertex|endpoint|inflection point|reference point) \((-?[\d.]+), (-?[\d.]+)\)/.exec(answer))) {
        assert.ok(close(f(Number(match[1])), Number(match[2])), `${where}: ${answer} is on the graph`);
      }
    }
  });
});

/* ---------------------------------------------------------------------------
 * The defects, one test each (each red on the old code).
 * ------------------------------------------------------------------------- */

const pointItem = (spec, feature, prompt = 'Use the graph shown.') => ({
  type: 'graphAnalysis', functionSpec: spec, analysisRequests: [{ id: feature, kind: 'point', feature }], prompt,
});
const siblingsOf = (question, seeds = 12) => Array.from({ length: seeds }, (_, seed) => ff.similarProblem(question, { seed })).filter(Boolean);

test('defect: a local minimum on a graph that never turns is not explained by a turning point it does not have', () => {
  ['cubic', 'cubeRoot', 'linear'].forEach((type) => {
    ['localMinimum', 'localMaximum'].forEach((feature) => {
      const spec = type === 'linear' ? { type, m: 2, b: 1 } : { type, a: 1, h: 1, k: 2 };
      const siblings = siblingsOf(pointItem(spec, feature, `State its ${feature} (${type}).`));
      assert.ok(siblings.length, `${type} ${feature}: a sibling`);
      siblings.forEach((sibling) => {
        verifyFunctionSibling(sibling, `${type} ${feature}`);
        assert.doesNotMatch(sibling.steps.join(' '), /only turning point/, `${type} ${feature}: "${sibling.steps.join(' ')}" claims a turning point`);
      });
    });
  });
});

test('defect: a vertex or a center is stated only where (h, k) IS that feature', () => {
  const cases = [
    [{ type: 'logarithmic', a: 1, h: 0, k: 1, base: 2 }, 'center'],
    [{ type: 'exponential', a: 1, h: 0, k: 2, base: 2 }, 'vertex'],
    [{ type: 'exponential', a: 2, h: 0, k: -1, base: 2 }, 'center'],
    [{ type: 'squareRoot', a: 1, h: 1, k: 0 }, 'center'],
  ];
  cases.forEach(([spec, feature]) => {
    siblingsOf(pointItem(spec, feature, `State its ${feature} (${spec.type}).`)).forEach((sibling) => {
      // A sibling of these, if any, must state a point that really is a vertex
      // (a turning point on the graph) or a center (a point of symmetry).
      verifyFunctionSibling(sibling, `${spec.type} ${feature}`);
    });
  });
  // The real features are still explained.
  [[{ type: 'quadratic', a: 1, h: 1, k: -2 }, 'vertex'], [{ type: 'absolute', a: -1, h: 0, k: 3 }, 'vertex'], [{ type: 'cubic', a: 1, h: 1, k: 1 }, 'center'], [{ type: 'rational', a: 2, h: 1, k: 1 }, 'center']]
    .forEach(([spec, feature]) => {
      const siblings = siblingsOf(pointItem(spec, feature, `State its ${feature} (${spec.type}).`));
      assert.ok(siblings.length, `${spec.type} ${feature}: a sibling`);
      siblings.forEach((sibling) => verifyFunctionSibling(sibling, `${spec.type} ${feature}`));
    });
});

test('defect: a sibling that asks for points only carries no interval-notation note', () => {
  ['vertex', 'xIntercepts', 'yIntercept', 'localMinimum'].forEach((feature) => {
    const siblings = siblingsOf(pointItem({ type: 'quadratic', a: 1, h: 1, k: -4 }, feature, `State its ${feature}.`));
    assert.ok(siblings.length, feature);
    siblings.forEach((sibling) => assert.doesNotMatch(sibling.prompt, /interval notation/, `${feature}: ${sibling.prompt}`));
  });
  // ...while one that asks for an interval still says how to write it.
  const domain = siblingsOf({ type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 1, h: 1, k: -4 }, analysisRequests: [{ id: 'domain', kind: 'domain', notation: 'interval' }, { id: 'v', kind: 'point', feature: 'vertex' }], prompt: 'Domain and vertex.' });
  assert.ok(domain.length && domain.every((sibling) => /interval notation/.test(sibling.prompt)));
});

test('defect: "never increasing" is not run into the next clause ("never increasing and decreasing on …")', () => {
  const question = { type: 'graphAnalysis', functionSpec: { type: 'logarithmic', a: 1, h: 0, k: 0, base: 2 }, analysisRequests: [{ id: 'i', kind: 'increasing', notation: 'interval' }, { id: 'd', kind: 'decreasing', notation: 'interval' }], prompt: 'Increasing and decreasing.' };
  const siblings = siblingsOf(question, 30);
  assert.ok(siblings.some((sibling) => /never increasing/.test(sibling.steps.join(' '))), 'a falling sibling is drawn');
  siblings.forEach((sibling) => {
    verifyFunctionSibling(sibling, 'log increasing/decreasing');
    assert.doesNotMatch(sibling.steps.join(' '), /never (?:increasing|decreasing|positive|negative) and /, sibling.steps.join(' '));
  });
});

test('defect: with three clauses, a "never …" clause is not run into the next one by a comma', () => {
  // "so it is never increasing, decreasing on (-5, 0), and it is never flat …"
  // reads as "never … decreasing on (-5, 0)": every later clause owns an "it is".
  const parts = ['constant', 'increasing', 'decreasing'];
  const question = { type: 'graphAnalysis', functionSpec: { type: 'logarithmic', a: -1, h: 0, k: 0, base: 2 }, analysisRequests: parts.map((kind) => ({ id: kind, kind, notation: 'interval' })), prompt: 'Constant, increasing and decreasing.' };
  const siblings = siblingsOf(question, 31);
  const monotone = siblings.map((sibling) => sibling.steps.find((step) => step.startsWith('Reading left to right'))).filter(Boolean);
  assert.ok(monotone.some((step) => /never increasing/.test(step) && /decreasing on /.test(step)), 'a falling three-clause sibling is drawn');
  siblings.forEach((sibling) => verifyFunctionSibling(sibling, 'log constant/increasing/decreasing'));
  monotone.forEach((step) => {
    assert.doesNotMatch(step, /never (?:increasing|decreasing|positive|negative|flat[^,]*),? (?!it is )(?:and )?(?!it is )(?:increasing|decreasing|positive|negative|never)/, step);
    // Each clause after the first is its own "it is …" claim.
    const clauses = step.replace(/^.*?, so it is /, '').replace(/\.$/, '').split(/, (?:and )?(?![^()[\]]*[)\]])/);
    clauses.slice(1).forEach((clause) => assert.match(clause, /^it is /, step));
  });
});

test('defect: a characteristics sibling never states a rounded y-intercept as an equality', () => {
  const random = seeded(4242);
  let seen = 0;
  for (let index = 0; index < 60; index += 1) {
    const intent = { standard: 'A.9D', dok: 2, difficultyBand: 2, prompt: `Describe this cube root function (${index}).`, studentActions: ['readGraph', 'findZeros', 'findYIntercept'], function: { family: 'cubeRoot', a: random.pick([1, 2, -1]), h: random.int(-3, 3), k: random.int(-3, 3) }, graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } };
    compileIntent(intent).filter((question) => question.type === 'functionCharacteristics').forEach((question) => {
      const sibling = ff.similarProblem(question, { seed: index });
      if (!sibling) return;
      seen += 1;
      const intercept = /y-intercept: f\(0\) = (-?[\d.]+)/.exec(ascii(sibling.steps.join(' ')));
      assert.ok(intercept, sibling.steps.join(' '));
      assert.ok(Number.isInteger(Number(intercept[1])), `stated exactly: ${intercept[0]}`);
      verifyFunctionSibling(sibling, 'cube root y-intercept');
    });
  }
  assert.ok(seen > 20, `siblings drawn (${seen})`);
});

test('defect: a reciprocal does not "fall the whole way", and its asymptote has no "power term"', () => {
  const intent = { standard: 'A.9D', dok: 2, difficultyBand: 2, prompt: 'Describe this reciprocal function.', studentActions: ['readGraph', 'findAsymptote', 'analyzeIncreasing'], function: { family: 'rational', a: 2, h: 1, k: -1 }, graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } };
  const [question] = compileIntent(intent).filter((item) => item.type === 'functionCharacteristics');
  const siblings = siblingsOf(question, 10);
  assert.ok(siblings.length, 'a sibling');
  siblings.forEach((sibling) => {
    const steps = sibling.steps.join(' ');
    assert.doesNotMatch(steps, /whole way/, steps);
    assert.doesNotMatch(steps, /power term/, steps);
    assert.match(sibling.answer, /each branch (rises|falls)/);
    verifyFunctionSibling(sibling, 'reciprocal behavior');
  });
});

test('defect: the asymptote hint for a logarithm points at a vertical line; the turning-point hint does not assume one exists', () => {
  const log = { type: 'functionCharacteristics', recipe: { name: 'functionCharacteristics', ask: ['asymptote'] }, functionSpec: { type: 'logarithmic', a: 1, h: 2, k: 0, base: 2 }, correctEquation: 'log(x-2,2)', asymptote: 'x = 2', prompt: 'Find the asymptote of the graph shown.' };
  assert.ok(ff.matches(log));
  const hint = ff.hints(log).find((entry) => /asymptote/.test(entry) && /starts with/.test(entry));
  assert.ok(hint, ff.hints(log).join(' | '));
  assert.match(hint, /vertical/);
  assert.match(hint, /starts with x =/);
  const cubic = { type: 'functionCharacteristics', recipe: { name: 'functionCharacteristics', ask: ['extremeKind', 'extremePoint'] }, functionSpec: { type: 'cubic', a: 1, h: 0, k: 1 }, correctEquation: 'x^3+1', extreme: 'none', prompt: 'Describe the turning point of the graph shown.' };
  assert.ok(ff.matches(cubic));
  const turning = ff.hints(cubic).find((entry) => entry.startsWith('Look for'));
  assert.ok(turning, ff.hints(cubic).join(' | '));
  assert.doesNotMatch(turning, /Look for the turning point: the single/, turning);
  assert.match(turning, /whether the graph ever changes direction/);
});

test('defect: a missing-term sibling reads its step from terms the student can see', () => {
  for (let seed = 0; seed < 30; seed += 1) {
    const question = { type: 'sequenceExplorer', mode: 'missingTerm', prompt: 'Find the missing term.', sequence: { kind: 'arithmetic', first: 3, difference: 4 }, missingIndex: 4 };
    const sibling = ff.similarProblem(question, { seed });
    if (!sibling) continue;
    const { shown } = sequenceFromPrompt(sibling.prompt);
    // The step is found from written-out neighbours, and each one is a pair
    // of terms the student can see: never a pair through the blank.
    const visiblePairs = shown.slice(1).map((value, index) => [shown[index], value]).filter((pair) => !pair.includes('__')).map((pair) => pair.map(Number));
    const reading = sibling.steps.find((step) => /common (difference|ratio) of/.test(step) && !step.startsWith('The missing'));
    const used = [...ascii(reading).matchAll(/(-?\d+) (?:-|÷) \(?(-?\d+)\)? = /g)].map(([, later, earlier]) => [Number(earlier), Number(later)]);
    assert.ok(used.length >= 2, `"${reading}" shows the neighbours it reads the step from`);
    used.forEach((pair) => assert.ok(visiblePairs.some(([a, b]) => a === pair[0] && b === pair[1]), `"${reading}": ${pair} is not a pair of visible neighbours`));
  }
});

test('defect: a negative ratio is written × (-2), never "× -2"', () => {
  let seen = 0;
  for (let seed = 0; seed < 40; seed += 1) {
    const sibling = ff.similarProblem({ type: 'sequenceExplorer', mode: 'analyze', prompt: 'Analyze.', sequence: { kind: 'arithmetic', first: 2, difference: 3 } }, { seed });
    if (!sibling || !/× \(/.test(sibling.steps.join(' '))) continue;
    seen += 1;
    sibling.steps.forEach((step) => assert.doesNotMatch(ascii(step), /× -/, step));
  }
  assert.ok(seen > 0, 'a negative-ratio sibling is drawn');
});

test('defect: a relation sibling asks for exactly what it answers', () => {
  const pairs = [[-2, 4], [0, 1], [3, 4], [5, -1]];
  const cases = [
    [['mapping', 'range'], /state its range\b/, /domain/],
    [['plot', 'domain'], /coordinate plot/, /mapping/],
    [['mapping', 'domain', 'range', 'isFunction'], /state its domain and range and decide/, null],
  ];
  cases.forEach(([ask, must, mustNot]) => {
    const sibling = ff.similarProblem({ type: 'relationMapping', pairs, ask, prompt: `Relation ${ask.join(' ')}.` }, { seed: 3 });
    assert.ok(sibling, ask.join(','));
    assert.match(sibling.prompt, must, sibling.prompt);
    if (mustNot) assert.doesNotMatch(sibling.prompt, mustNot, sibling.prompt);
    assert.doesNotMatch(sibling.prompt, /\} and range/, sibling.prompt);
  });
});

test('defect: an attribute sibling never calls a reciprocal graph one connected piece', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'Identify the family and key attributes of f(x)=√x.',
    answerFields: [
      { id: 'family', label: 'Parent family', answer: 'square root' },
      { id: 'continuity', label: 'Discrete or continuous', answer: 'continuous' },
    ],
  };
  assert.ok(ff.matches(question));
  let reciprocal = 0;
  for (let seed = 0; seed < 40; seed += 1) {
    const sibling = ff.similarProblem(question, { seed });
    if (!sibling) continue;
    if (/\/\(?x/.test(sibling.prompt)) {
      reciprocal += 1;
      assert.doesNotMatch(sibling.answer, /connected/, `${sibling.prompt} => ${sibling.answer}`);
    }
  }
  // The family sibling cycles through every parent; a reciprocal must not be
  // offered with a "connected" answer (here: none is offered at all).
  assert.equal(reciprocal, 0);
});
