import test from 'node:test';
import assert from 'node:assert/strict';
import Fraction from 'fraction.js';

import { buildIntervalNumberLineReview } from '../../src/tools/shared/reviews/intervalNumberLineReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE NUMBER-LINE WORKED SOLUTION, RECOMPUTED INDEPENDENTLY.
 *
 * Job A shipped this builder without the independent mathematics review it
 * planned. This file is that review. Over hundreds of seeded draws — one to
 * four pieces, rays (authored as null, '-inf' / 'inf', ±Infinity), segments,
 * open and closed ends, integer, decimal, fraction and ±√n endpoints, text
 * endpoints, from / to keys, unsorted pieces, two open rays meeting at a
 * point, every combination of asked stages and a variable other than x — the
 * solution set is read here from the question alone (never the tool's
 * intervalMath helpers), and the review is read back:
 *
 *   - every endpoint label (−3, 2.5, −1/3, √2) is the exact endpoint;
 *   - the solution sentence, the graph item, the interval notation and the
 *     inequality each describe exactly the key set;
 *   - the words ("every number between a and b (a included, b not)"), the
 *     graph steps (circle, reason, shading direction) and the notation step
 *     agree with each piece;
 *   - the check: every test number lies in its region, every substituted
 *     clause is true or false as claimed, "shaded" is membership in the set,
 *     and every endpoint gets the circle its membership calls for;
 *   - the work a student following it submits (graph pieces, notation,
 *     inequality) is graded correct by the shared grader;
 *   - a null only for the documented refusals (an endpoint with no short exact
 *     form, an inequality stage whose 4-place form would be a rounding, an
 *     inequalityText that disagrees with the key, overlapping pieces);
 *   - display hygiene.
 */

const TOOL_ID = 'intervalNumberLine';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

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

/* ------------------------------------------------------------ reading -- */

// An endpoint label: "−3", "2.5", "−1/3", "√2", "−√2", "∞", "−∞".
const valueOf = (label) => {
  const text = label.trim().replace(/−/g, '-');
  if (text === '∞') return Infinity;
  if (text === '-∞') return -Infinity;
  const root = text.match(/^(-?)√(\d+)$/);
  if (root) return (root[1] ? -1 : 1) * Math.sqrt(Number(root[2]));
  const fraction = text.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) {
    assert.equal(new Fraction(Number(fraction[1]), Number(fraction[2])).n.toString(), String(Math.abs(Number(fraction[1]))), `"${label}" is in lowest terms`);
    return Number(fraction[1]) / Number(fraction[2]);
  }
  assert.match(text, /^-?\d+(\.\d+)?$/, `an endpoint label: "${label}"`);
  return Number(text);
};
const near = (a, b) => a === b || Math.abs(a - b) <= 1e-9;

// A clause with the variable: "x ≤ −1/3", "x > 3", "√2 < x ≤ 2.5" → a piece.
const readClause = (text, variable) => {
  const v = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ray = text.match(new RegExp(`^${v} ([<>≤≥]) (\\S+)$`));
  if (ray) {
    const [, op, bound] = ray;
    return op === '<' || op === '≤'
      ? { min: -Infinity, max: valueOf(bound), minClosed: false, maxClosed: op === '≤' }
      : { min: valueOf(bound), max: Infinity, minClosed: op === '≥', maxClosed: false };
  }
  const segment = text.match(new RegExp(`^(\\S+) ([<≤]) ${v} ([<≤]) (\\S+)$`));
  assert.ok(segment, `a clause in ${variable}: "${text}"`);
  return { min: valueOf(segment[1]), max: valueOf(segment[4]), minClosed: segment[2] === '≤', maxClosed: segment[3] === '≤' };
};
const readNotation = (text) => text.split(' ∪ ').map((part) => {
  const match = part.match(/^([[(])(.+), (.+)([\])])$/);
  assert.ok(match, `a notation piece: "${part}"`);
  return { min: valueOf(match[2]), max: valueOf(match[3]), minClosed: match[1] === '[', maxClosed: match[4] === ']' };
});
const readGraph = (text) => text.split('; ').map((part) => {
  let match = part.match(/^(closed|open) circle at (\S+), shaded left$/);
  if (match) return { min: -Infinity, max: valueOf(match[2]), minClosed: false, maxClosed: match[1] === 'closed' };
  match = part.match(/^(closed|open) circle at (\S+), shaded right$/);
  if (match) return { min: valueOf(match[2]), max: Infinity, minClosed: match[1] === 'closed', maxClosed: false };
  match = part.match(/^(closed|open) circle at (\S+), (closed|open) circle at (\S+), shaded between$/);
  assert.ok(match, `a graph piece: "${part}"`);
  return { min: valueOf(match[2]), max: valueOf(match[4]), minClosed: match[1] === 'closed', maxClosed: match[3] === 'closed' };
});
const samePieces = (a, b) => a.length === b.length && a.every((piece, index) => near(piece.min, b[index].min) && near(piece.max, b[index].max)
  && piece.minClosed === b[index].minClosed && piece.maxClosed === b[index].maxClosed);

// The truth of a substituted clause: "−1 ≤ −1/3", "√2 < 0 ≤ 2.5".
const OPS = { '<': (a, b) => a < b && !near(a, b), '≤': (a, b) => a < b || near(a, b), '>': (a, b) => a > b && !near(a, b), '≥': (a, b) => a > b || near(a, b) };
const truthOf = (text) => {
  const tokens = text.split(' ');
  assert.equal(tokens.length % 2, 1, `a relation chain: "${text}"`);
  let holds = true;
  for (let index = 1; index < tokens.length; index += 2) {
    assert.ok(OPS[tokens[index]], `a relation in "${text}"`);
    if (!OPS[tokens[index]](valueOf(tokens[index - 1]), valueOf(tokens[index + 1]))) holds = false;
  }
  return holds;
};

/* ---------------------------------------------------- the key, here -- */

const LOWER_OPEN = new Set([null, undefined, '-inf', '-Infinity', -Infinity]);
const UPPER_OPEN = new Set([null, undefined, 'inf', 'Infinity', Infinity]);
const keyOf = (question) => question.intervals.map((raw) => {
  const lowRaw = raw.min ?? raw.from ?? raw.lower;
  const highRaw = raw.max ?? raw.to ?? raw.upper;
  const min = LOWER_OPEN.has(lowRaw) ? -Infinity : Number(lowRaw);
  const max = UPPER_OPEN.has(highRaw) ? Infinity : Number(highRaw);
  return { min, max, minClosed: Number.isFinite(min) && raw.minClosed === true, maxClosed: Number.isFinite(max) && raw.maxClosed === true };
}).sort((a, b) => a.min - b.min);
const inSet = (key, x) => key.some((piece) => (x > piece.min || (piece.minClosed && near(x, piece.min)))
  && (x < piece.max || (piece.maxClosed && near(x, piece.max))));

/* ------------------------------------------------------- display hygiene -- */

const hygiene = (model, label) => {
  const texts = [model.title, ...model.steps, model.why, model.note || '', ...model.items.flatMap((item) => [item.label, item.value])];
  texts.forEach((text) => {
    assert.doesNotMatch(text, /NaN|undefined|Infinity|\[object|\bnull\b/, `${label}: no broken value in "${text}"`);
    assert.doesNotMatch(text, /[−-]{2}|[−-]0(?![.\d/])|\d\.\d*0(?!\d)|\+ [−-]/, `${label}: no doubled sign, -0 or trailing zero in "${text}"`);
    assert.doesNotMatch(text, /(?<![\d.])-\d/, `${label}: a typographic minus in "${text}"`);
    assert.doesNotMatch(text, /\(∞|∞\]|\[−∞/, `${label}: infinity never closed in "${text}"`);
  });
};

/* ------------------------------------------------------------ the audit -- */

const audit = (question, label) => {
  const model = buildIntervalNumberLineReview(question);
  assert.ok(model, `${label}: explained`);
  hygiene(model, label);
  const key = keyOf(question);
  const variable = question.variable || 'x';
  const ask = Array.isArray(question.ask) && question.ask.some((stage) => ['graph', 'interval', 'inequality'].includes(stage))
    ? ['graph', 'interval', 'inequality'].filter((stage) => question.ask.includes(stage))
    : ['graph', 'interval'];
  const item = (name) => model.items.find((entry) => entry.label === name)?.value;

  // The items: one per asked stage (+ the set sentence unless the inequality is asked).
  const expectedLabels = [
    ...(ask.includes('inequality') ? [] : ['Solution set']),
    ...(ask.includes('graph') ? ['Number-line graph'] : []),
    ...(ask.includes('interval') ? ['Interval notation'] : []),
    ...(ask.includes('inequality') ? ['Inequality'] : []),
  ];
  assert.deepEqual(model.items.map((entry) => entry.label), expectedLabels, `${label}: the items`);

  // The set sentence (first step) and its words.
  const first = model.steps[0].match(/^The solution set is (.+): (.+)\.$/);
  assert.ok(first, `${label}: "${model.steps[0]}"`);
  const clauses = first[1].split(' or ');
  assert.ok(samePieces(clauses.map((clause) => readClause(clause, variable)), key), `${label}: "${first[1]}" is the key`);
  if (item('Solution set')) assert.equal(item('Solution set'), first[1]);
  const words = first[2].split(/, (?:or )?(?=every number)|,? or (?=every number)/);
  assert.equal(words.length, key.length, `${label}: words for every piece in "${first[2]}"`);
  words.forEach((phrase, index) => {
    const piece = key[index];
    let match = phrase.match(/^every number less than (or equal to )?(\S+)$/);
    if (match) {
      assert.ok(piece.min === -Infinity && near(valueOf(match[2]), piece.max) && Boolean(match[1]) === piece.maxClosed, `${label}: "${phrase}"`);
      return;
    }
    match = phrase.match(/^every number greater than (or equal to )?(\S+)$/);
    if (match) {
      assert.ok(piece.max === Infinity && near(valueOf(match[2]), piece.min) && Boolean(match[1]) === piece.minClosed, `${label}: "${phrase}"`);
      return;
    }
    match = phrase.match(/^every number between (\S+) and (\S+) \((.+)\)$/);
    assert.ok(match, `${label}: words "${phrase}"`);
    assert.ok(near(valueOf(match[1]), piece.min) && near(valueOf(match[2]), piece.max), `${label}: "${phrase}" endpoints`);
    const inclusion = piece.minClosed && piece.maxClosed ? 'both included'
      : !piece.minClosed && !piece.maxClosed ? 'neither included'
        : piece.minClosed ? `${match[1]} included, ${match[2]} not` : `${match[2]} included, ${match[1]} not`;
    assert.equal(match[3], inclusion, `${label}: "${phrase}"`);
  });

  const work = { intervals: [], notation: '', inequality: '' };
  if (ask.includes('graph')) {
    const graph = readGraph(item('Number-line graph'));
    assert.ok(samePieces(graph, key), `${label}: the graph item is the key`);
    work.intervals = graph.map(({ min, max, minClosed, maxClosed }) => ({ min, max, minClosed, maxClosed }));
    const graphSteps = model.steps.filter((step) => step.startsWith('Graph '));
    assert.equal(graphSteps.length, key.length);
    graphSteps.forEach((step, index) => {
      const piece = key[index];
      const circle = (closed) => (closed ? 'a closed circle (●)' : 'an open circle (○)');
      const reason = (closed, op) => (closed ? `${op} includes it` : `${op} leaves it out`);
      const at = step.match(/^Graph (.+?): put /);
      assert.ok(samePieces([readClause(at[1], variable)], [piece]), `${label}: "${step}"`);
      if (piece.min === -Infinity) {
        assert.ok(step.includes(`${circle(piece.maxClosed)} at `) && step.includes(reason(piece.maxClosed, piece.maxClosed ? '≤' : '<')) && step.includes('← Shade left') && step.includes('toward −∞'), `${label}: "${step}"`);
      } else if (piece.max === Infinity) {
        assert.ok(step.includes(`${circle(piece.minClosed)} at `) && step.includes(reason(piece.minClosed, piece.minClosed ? '≥' : '>')) && step.includes('Shade right →') && step.includes('toward ∞'), `${label}: "${step}"`);
      } else {
        const ends = step.match(/put (a closed circle \(●\)|an open circle \(○\)) at (\S+) because (.+?), and (a closed circle \(●\)|an open circle \(○\)) at (\S+) because (.+?); the segment between them is shaded\.$/);
        assert.ok(ends, `${label}: "${step}"`);
        assert.equal(ends[1], circle(piece.minClosed));
        assert.equal(ends[3], reason(piece.minClosed, piece.minClosed ? '≤' : '<'));
        assert.equal(ends[4], circle(piece.maxClosed));
        assert.equal(ends[6], reason(piece.maxClosed, piece.maxClosed ? '≤' : '<'));
        assert.ok(near(valueOf(ends[2]), piece.min) && near(valueOf(ends[5]), piece.max));
      }
    });
  }
  if (ask.includes('interval')) {
    const notation = item('Interval notation');
    assert.ok(samePieces(readNotation(notation), key), `${label}: "${notation}" is the key`);
    // √ is typed as sqrt( ) in the tool's notation box (it also takes \sqrt{ }).
    work.notation = notation.replace(/√(\d+)/g, 'sqrt($1)');
    const each = model.steps.find((step) => step.startsWith('Write each piece'));
    const list = each.slice(each.indexOf(' — so ') + ' — so '.length).replace(/\.$/, '');
    const pairs = [...list.matchAll(/(?:^|, (?:and )?| and )(.+?) is ([[(][^,]+, [^,]+?[\])])/g)];
    assert.equal(pairs.length, key.length, `${label}: a notation for each piece in "${each}"`);
    pairs.forEach(([, clause, text], index) => {
      assert.ok(samePieces([readClause(clause, variable)], [key[index]]) && samePieces(readNotation(text), [key[index]]), `${label}: "${clause} is ${text}"`);
    });
    if (key.length > 1) assert.ok(model.steps.some((step) => step.endsWith(`: ${notation}.`) && step.startsWith('Join the pieces')));
  }
  if (ask.includes('inequality')) {
    const inequality = item('Inequality');
    assert.ok(samePieces(inequality.split(' or ').map((clause) => readClause(clause, variable)), key), `${label}: "${inequality}" is the key`);
    work.inequality = inequality;
  }

  // The check.
  const why = model.why.match(/^Test one number from each region the endpoints cut the line into: (.+)\. Then check each endpoint: (.+)\. The shading and the circles match the inequality exactly\.$/);
  assert.ok(why, `${label}: "${model.why}"`);
  const endpoints = [...new Set(key.flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite))].sort((a, b) => a - b);
  const regions = why[1].split('; ');
  assert.equal(regions.length, endpoints.length + 1, `${label}: one test per region`);
  const bounds = [-Infinity, ...endpoints, Infinity];
  regions.forEach((region, index) => {
    const match = region.match(new RegExp(`^at ${variable} = (\\S+), (.+) (is true|is false|are both false|are all false), so (\\S+) is (shaded|not shaded)$`));
    assert.ok(match, `${label}: a region check "${region}"`);
    const t = valueOf(match[1]);
    assert.ok(t > bounds[index] && t < bounds[index + 1], `${label}: ${match[1]} lies in its region`);
    assert.equal(match[4], match[1]);
    const clausesAt = match[2].split(/, and |, | and /);
    const truths = clausesAt.map(truthOf);
    const member = inSet(key, t);
    assert.equal(match[5] === 'shaded', member, `${label}: ${match[1]} shaded ⇔ in the set`);
    if (match[3] === 'is true') {
      assert.deepEqual(truths, [true], `${label}: "${match[2]}" is true`);
    } else {
      assert.ok(truths.every((truth) => truth === false), `${label}: "${match[2]}" all false`);
      assert.equal(clausesAt.length, key.length, `${label}: every clause tested at ${match[1]}`);
      assert.equal(match[3], clausesAt.length === 1 ? 'is false' : clausesAt.length === 2 ? 'are both false' : 'are all false');
    }
  });
  const checks = why[2].split('; ');
  assert.equal(checks.length, endpoints.length, `${label}: one check per endpoint`);
  checks.forEach((check, index) => {
    const match = check.match(/^(.+) (is|are) (true|false|both false), so (\S+) gets (a closed circle \(●\)|an open circle \(○\))$/);
    assert.ok(match, `${label}: an endpoint check "${check}"`);
    const value = valueOf(match[4]);
    assert.ok(near(value, endpoints[index]), `${label}: endpoint ${match[4]} in order`);
    const halves = match[1].split(' and ').map(truthOf);
    const member = inSet(key, value);
    assert.equal(halves.some(Boolean), member, `${label}: "${match[1]}" ⇔ ${match[4]} in the set`);
    assert.equal(match[3] === 'true', member);
    assert.equal(match[5] === 'a closed circle (●)', member, `${label}: the circle at ${match[4]}`);
  });

  const verdict = grade(question, work);
  assert.equal(verdict.graded, true, `${label}: graded`);
  assert.equal(verdict.isCorrect, true, `${label}: the shared grader accepts ${JSON.stringify(work)}`);
  return model;
};

/* ------------------------------------------------------------ the draws -- */

const SEEDS = 300;
const ASKS = [undefined, [], ['graph'], ['interval'], ['inequality'], ['graph', 'interval'], ['graph', 'inequality'], ['interval', 'inequality'], ['graph', 'interval', 'inequality'], ['table'], ['inequality', 'graph']];
const VARIABLES = [undefined, 'x', 't', 'y', 'n'];

// An endpoint value and whether its inequality-stage (4-place) form is exact.
const drawEndpoint = (random, low, high) => {
  const style = random();
  if (style < 0.5) return int(random, low, high);
  if (style < 0.75) return int(random, low * 4, high * 4) / 4;
  if (style < 0.85) return int(random, low * 100, high * 100) / 100;
  if (style < 0.93) return int(random, low * 3, high * 3) / 3;
  const n = pick(random, [2, 3, 5, 7, 10]);
  return (random() < 0.5 ? -1 : 1) * Math.sqrt(n);
};

const drawQuestion = (random) => {
  const count = int(random, 1, 4);
  const values = new Set();
  while (values.size < count * 2) values.add(drawEndpoint(random, -9, 9));
  const sorted = [...values].sort((a, b) => a - b);
  const pieces = [];
  for (let index = 0; index < count; index += 1) {
    let min = sorted[2 * index];
    let max = sorted[2 * index + 1];
    if (index === 0 && random() < 0.4) min = pick(random, [null, '-inf', -Infinity, undefined]);
    if (index === count - 1 && random() < 0.4) max = pick(random, [null, 'inf', Infinity, undefined]);
    // A piece unbounded at both ends is a documented refusal; keep one end.
    if (LOWER_OPEN.has(min) && UPPER_OPEN.has(max)) max = sorted[2 * index + 1];
    const piece = {};
    const keys = random() < 0.15 ? ['from', 'to'] : ['min', 'max'];
    if (min !== undefined) piece[keys[0]] = random() < 0.1 && typeof min === 'number' && Number.isInteger(min) ? String(min) : min;
    if (max !== undefined) piece[keys[1]] = random() < 0.1 && typeof max === 'number' && Number.isInteger(max) ? String(max) : max;
    // A closed flag: true, false, or left out (open).
    const flag = () => pick(random, [true, true, false, undefined]);
    const [minClosed, maxClosed] = [flag(), flag()];
    if (minClosed !== undefined) piece.minClosed = minClosed;
    if (maxClosed !== undefined) piece.maxClosed = maxClosed;
    pieces.push(piece);
  }
  if (random() < 0.3) pieces.reverse();
  const question = { type: TOOL_ID, prompt: 'Graph the solution.', intervals: pieces };
  const ask = pick(random, ASKS);
  if (ask !== undefined) question.ask = ask;
  const variable = pick(random, VARIABLES);
  if (variable !== undefined) question.variable = variable;
  return question;
};

// The documented refusals, recomputed: an endpoint the inequality stage
// writes rounded (when that stage is asked).
const inequalityRounds = (question) => {
  const asksInequality = Array.isArray(question.ask) && question.ask.includes('inequality');
  return asksInequality && keyOf(question).some((piece) => [piece.min, piece.max].some((v) => Number.isFinite(v) && Math.abs(Number(v.toFixed(4)) - v) > 1e-9));
};

test('seeded number-line questions: every stage and every relation recomputed', () => {
  const random = prng(9001);
  let explained = 0;
  let refused = 0;
  for (let index = 0; index < SEEDS; index += 1) {
    const question = drawQuestion(random);
    const label = JSON.stringify(question, (k, v) => (v === Infinity ? '∞' : v === -Infinity ? '-∞' : v));
    const model = buildIntervalNumberLineReview(question);
    if (!model) {
      assert.ok(inequalityRounds(question), `${label}: refused, but nothing documented refuses it`);
      refused += 1;
      continue;
    }
    audit(question, label);
    explained += 1;
  }
  assert.ok(explained > SEEDS * 0.8, `${explained} explained, ${refused} refused`);
});

test('edge cases: two open rays meeting, all-but-a-point, a tiny gap, text endpoints, from/to keys', () => {
  [
    { intervals: [{ min: null, max: 3 }, { min: 3, max: null }], ask: ['graph', 'interval', 'inequality'] },
    { intervals: [{ min: 0, max: null, minClosed: true }] },
    { intervals: [{ min: null, max: 0, maxClosed: false }], ask: ['inequality'] },
    { intervals: [{ min: -0.5, max: 0.5, minClosed: true, maxClosed: true }], ask: ['graph', 'interval', 'inequality'] },
    { intervals: [{ min: 1, max: 1.01 }], ask: ['graph', 'interval'] },
    { intervals: [{ from: '7', to: null, minClosed: true }, { from: '-2', to: '1', minClosed: false, maxClosed: true }], ask: ['graph', 'interval', 'inequality'] },
    { intervals: [{ min: '-inf', max: -1 / 3, maxClosed: true }, { min: Math.SQRT2, max: 'inf' }], ask: ['graph', 'interval'] },
    { intervals: [{ min: -Math.sqrt(10), max: -1, minClosed: true }, { min: 1, max: Math.sqrt(10), maxClosed: true }] },
    { intervals: [{ min: -2, max: 6, minClosed: false, maxClosed: true }], ask: ['interval'], variable: 'n', inequalityText: '-2 < n ≤ 6' },
  ].forEach((question) => audit({ type: TOOL_ID, ...question }, JSON.stringify(question)));
  // Documented refusals: a key and its prompt disagreeing, a rounding as the
  // answer, overlapping pieces.
  [
    { intervals: [{ min: 2, max: null }], inequalityText: 'x ≥ 2' },
    { intervals: [{ min: 1 / 3, max: null }], ask: ['inequality'] },
    { intervals: [{ min: 0, max: 5 }, { min: 3, max: 8 }] },
    { intervals: [{ min: 0, max: 5, maxClosed: true }, { min: 5, max: 8 }] },
  ].forEach((question) => assert.equal(buildIntervalNumberLineReview({ type: TOOL_ID, ...question }), null, JSON.stringify(question)));
});

test('the audit itself can fail: a false clause, a wrong circle, an unreduced fraction', () => {
  assert.equal(truthOf('−1 ≤ −1/3'), true);
  assert.equal(truthOf('√2 < 1.4'), false);
  assert.equal(truthOf('3 ≤ 3'), true);
  assert.equal(truthOf('3 < 3'), false);
  assert.throws(() => valueOf('2/4'));
  assert.ok(!samePieces(readNotation('[−3, 5)'), readNotation('(−3, 5)')));
  assert.ok(samePieces(readGraph('closed circle at −3, open circle at 5, shaded between'), readNotation('[−3, 5)')));
});
