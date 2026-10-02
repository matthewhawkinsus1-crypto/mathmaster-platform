/*
 * THE VERIFIED-FACTS ENGINE, ON ITS OWN.
 *
 * functions/shared/processFacts/processFactsEngine.mjs is tool-agnostic: the
 * Multiple Representations board's Process Mode is its first user, and the
 * next representation tools (quadratic key features, exponential growth,
 * systems) are meant to describe their own facts, strategies and
 * representations and reuse it unchanged. So it is tested here with a small
 * model that is NOT linear — a rectangle whose area is found from its sides —
 * and only then with the board's own model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROCESS_LOG_LIMITS,
  appendProcessEntry,
  auditProcessModel,
  defineProcessModel,
  emptyProcessLog,
  missingTokens,
  normalizeProcessLog,
  processLogMatches,
  processOptions,
  reachableTokens,
  representationUnlocks,
  requirementAlternatives,
  requirementMet,
  resolveProcessFacts,
} from '../../functions/shared/processFacts/processFactsEngine.mjs';
import {
  LMR_PROCESS_MODEL,
  PROCESS_MODEL_COVERS_BOARD,
  lmrProcessContext,
} from '../../functions/shared/toolMath/representationBridge/lmrProcessModel.mjs';

/* A rectangle: measure its sides from the drawing, or read them from a label;
 * the area needs both sides; a "scale drawing" representation needs the area. */
const RECTANGLE = defineProcessModel({
  id: 'test.rectangle',
  facts: {
    width: { label: 'Width' },
    height: { label: 'Height' },
    area: { label: 'Area' },
    corner: { label: 'A corner', multiple: true },
  },
  strategies: {
    measure: { label: 'Measure', kind: 'derive', produces: ['width', 'height'], sources: [{ id: 'drawing', when: (context) => context?.given === 'drawing' }] },
    readLabel: { label: 'Read the label', kind: 'recognize', produces: ['width', 'height'], sources: [{ id: 'label', when: (context) => context?.given === 'label' }] },
    multiply: { label: 'Multiply', kind: 'derive', produces: ['area'], sources: [{ id: 'facts', needs: { all: ['width', 'height'] } }] },
    plot: { label: 'Plot a corner', kind: 'recognize', produces: ['corner'], sources: [{ id: 'drawing', when: (context) => context?.given === 'drawing' }] },
  },
  representations: {
    scaleDrawing: { label: 'Scale drawing', unlock: 'area' },
    outline: { label: 'Outline', unlock: { any: [{ all: ['width', 'height'] }, 'twoCorners'] } },
  },
  tokens: ['twoCorners'],
  tokensOf: (facts) => {
    const tokens = new Set(['width', 'height', 'area'].filter((fact) => facts[fact]));
    if ((facts.corner || []).length >= 2) tokens.add('twoCorners');
    return tokens;
  },
});

const TRUTH = { width: 3, height: 4, area: 12 };
// The rectangle's marking: a claim is right when it matches the truth.
const evaluate = (entry, { facts }) => {
  const ev = entry.ev || {};
  if (entry.strategy === 'multiply') {
    if (!facts.width || !facts.height || typeof ev.area !== 'number') return { usable: false, claims: [] };
    return { usable: true, claims: [{ fact: 'area', value: ev.area, correct: ev.area === facts.width.value * facts.height.value && ev.area === TRUTH.area }] };
  }
  if (entry.strategy === 'plot') {
    return Array.isArray(ev.corner) ? { usable: true, claims: [{ fact: 'corner', key: ev.corner.join(','), value: ev.corner, correct: true }] } : { usable: false, claims: [] };
  }
  const claims = ['width', 'height'].filter((fact) => typeof ev[fact] === 'number').map((fact) => ({ fact, value: ev[fact], correct: ev[fact] === TRUTH[fact] }));
  return { usable: claims.length > 0, claims };
};
const entry = (id, strategy, from, ev) => ({ id, strategy, from, at: 1, tries: 1, ev });
const resolve = (entries, binding = 'b1') => resolveProcessFacts({ model: RECTANGLE, log: { v: 1, bind: 'b1', entries }, binding, evaluate });

test('requirements: a small boolean language — all, any — with the facts still missing', () => {
  const requirement = { any: [{ all: ['width', 'height'] }, 'twoCorners'] };
  assert.equal(requirementMet(requirement, new Set(['width'])), false);
  assert.equal(requirementMet(requirement, new Set(['width', 'height'])), true);
  assert.equal(requirementMet(requirement, ['twoCorners']), true);
  assert.equal(requirementMet(null, new Set()), true);
  assert.deepEqual(requirementAlternatives(requirement), [['width', 'height'], ['twoCorners']]);
  assert.deepEqual(missingTokens(requirement, new Set(['width'])), ['height'], 'the fewest still missing');
  assert.deepEqual(missingTokens(requirement, new Set(['width', 'height'])), []);
  // Only ways the question can actually reach are offered as "still needs".
  assert.deepEqual(missingTokens(requirement, new Set(), { achievable: new Set(['twoCorners']) }), ['twoCorners']);
  assert.equal(missingTokens(requirement, new Set(), { achievable: new Set() }), null, 'nothing reachable can open it');
});

test('a model that refers to something it does not define fails when it is defined, not in front of a student', () => {
  assert.throws(() => defineProcessModel({ id: 'bad', facts: { a: {} }, strategies: { s: { produces: ['b'], sources: [{ id: 'given' }] } } }), /produces unknown fact "b"/);
  assert.throws(() => defineProcessModel({ id: 'bad', facts: { a: {} }, strategies: { s: { produces: ['a'], sources: [] } } }), /has no source/);
  assert.throws(() => defineProcessModel({ id: 'bad', facts: { a: {} }, strategies: { s: { produces: ['a'], sources: [{ id: 'g', needs: 'ghost' }] } } }), /needs unknown token "ghost"/);
  assert.throws(() => defineProcessModel({ id: 'bad', facts: { a: {}, c: {} }, strategies: { s: { produces: ['a'], sources: [{ id: 'g', targets: ['c'] }] } } }), /targets "c", which it does not produce/);
  assert.throws(() => defineProcessModel({ id: 'bad', facts: { a: {} }, strategies: {}, representations: { r: { unlock: 'nowhere' } } }), /representation "r" needs unknown token "nowhere"/);
});

test('options: only the methods this GIVEN offers, for the fact being found, whose needs are met — within the author\'s restriction', () => {
  const drawing = { given: 'drawing' };
  const keys = (options) => options.map((option) => option.key).sort();
  assert.deepEqual(keys(processOptions(RECTANGLE, drawing)), ['measure@drawing', 'multiply@facts', 'plot@drawing']);
  assert.deepEqual(keys(processOptions(RECTANGLE, { given: 'label' })), ['multiply@facts', 'readLabel@label']);
  assert.deepEqual(keys(processOptions(RECTANGLE, drawing, { target: 'area' })), ['multiply@facts']);
  assert.deepEqual(keys(processOptions(RECTANGLE, drawing, { target: 'area', tokens: new Set(['width']) })), [], 'needs both sides');
  assert.deepEqual(keys(processOptions(RECTANGLE, drawing, { target: 'area', tokens: new Set(['width', 'height']) })), ['multiply@facts']);
  assert.deepEqual(keys(processOptions(RECTANGLE, drawing, { target: 'width', allowed: { width: ['readLabel'] } })), [], 'the author allowed only reading the label');
});

test('resolution: a fact needs ANOTHER entry\'s facts, never its own — and the order the student worked in does not matter', () => {
  const sides = entry('e1', 'measure', 'drawing', { width: 3, height: 4 });
  const area = entry('e2', 'multiply', 'facts', { area: 12 });
  const forward = resolve([sides, area]);
  const backward = resolve([area, sides]);
  assert.equal(forward.facts.area.value, 12);
  assert.equal(forward.facts.area.correct, true);
  assert.deepEqual(Object.keys(backward.facts).sort(), Object.keys(forward.facts).sort());
  assert.equal(backward.facts.area.value, 12, 'the area computed before the sides were measured still counts once they are');
  // Alone, the area has nothing to stand on: it cannot support itself.
  const alone = resolve([area]);
  assert.equal(alone.facts.area, undefined);
  assert.deepEqual(alone.entries[0].problems, ['needs-unmet']);
});

test('resolution: the latest claim is the answer; a multiple fact keeps one record per value; a claim outside the method is dropped', () => {
  const first = entry('a', 'measure', 'drawing', { width: 5 });
  const second = entry('b', 'measure', 'drawing', { width: 3 });
  assert.equal(resolve([first, second]).facts.width.value, 3);
  assert.equal(resolve([second, first]).facts.width.value, 5, 'log position, not value, decides');
  const corners = resolve([entry('c1', 'plot', 'drawing', { corner: [0, 0] }), entry('c2', 'plot', 'drawing', { corner: [3, 0] }), entry('c3', 'plot', 'drawing', { corner: [0, 0] })]);
  assert.deepEqual(corners.facts.corner.map((record) => record.key), ['0,0', '3,0']);
  assert.equal(corners.tokens.has('twoCorners'), true);
  // An evaluator claiming a fact the strategy does not produce is not believed.
  const sneaky = resolveProcessFacts({
    model: RECTANGLE,
    log: { bind: 'b1', entries: [entry('s', 'measure', 'drawing', { width: 3 })] },
    binding: 'b1',
    evaluate: () => ({ usable: true, claims: [{ fact: 'area', value: 12, correct: true }, { fact: 'width', value: 3, correct: true }] }),
  });
  assert.equal(sneaky.facts.area, undefined);
  assert.equal(sneaky.facts.width.value, 3);
  // An unknown method, or a marking that throws, establishes nothing.
  assert.deepEqual(resolve([entry('u', 'teleport', 'drawing', {})]).entries[0].problems, ['unknown-strategy']);
  const throwing = resolveProcessFacts({ model: RECTANGLE, log: { bind: 'b1', entries: [entry('t', 'measure', 'drawing', { width: 3 })] }, binding: 'b1', evaluate: () => { throw new Error('boom'); } });
  assert.deepEqual(throwing.facts, {});
});

test('binding: a log written for another question establishes nothing here', () => {
  const log = { v: 1, bind: 'version-A', entries: [entry('e1', 'measure', 'drawing', { width: 3, height: 4 })] };
  const elsewhere = resolveProcessFacts({ model: RECTANGLE, log, binding: 'version-B', evaluate });
  assert.equal(elsewhere.stale, true);
  assert.deepEqual(elsewhere.facts, {});
  assert.equal(resolveProcessFacts({ model: RECTANGLE, log, binding: 'version-A', evaluate }).stale, false);
  assert.equal(processLogMatches(log, 'version-B'), false);
  assert.equal(processLogMatches(emptyProcessLog('anything'), 'version-B'), true, 'an empty log belongs anywhere');
  // Appending on another question replaces the log rather than mixing two.
  const next = appendProcessEntry(log, entry('e2', 'measure', 'drawing', { width: 7 }), { binding: 'version-B', claimsOf: () => ['width'] });
  assert.equal(next.bind, 'version-B');
  assert.deepEqual(next.entries.map((held) => held.id), ['e2']);
});

test('the log is bounded and carries no verdict: what a device claims about itself is dropped before anything reads it', () => {
  const forged = normalizeProcessLog({
    v: 99,
    bind: 'b1',
    entries: [{
      id: 'e1',
      strategy: 'measure',
      from: 'drawing',
      at: 'yesterday',
      tries: -4,
      isCorrect: true,
      ev: { width: 3, isCorrect: true, correct: true, score: 1, answerKey: 3, nested: { verdict: 'right', ok: 'kept' }, ['__proto__']: { polluted: true } },
    }],
  });
  const [only] = forged.entries;
  assert.equal(forged.v, 1);
  assert.equal(only.isCorrect, undefined);
  assert.deepEqual(only.ev, { width: 3, nested: { ok: 'kept' } });
  assert.equal(only.at, 0);
  assert.equal(only.tries, 1);
  assert.equal({}.polluted, undefined);
  // Size: text, steps, entries and the whole serialized log.
  const long = 'x'.repeat(1000);
  const steps = Array.from({ length: 30 }, (_, index) => ({ left: `y${index}`, right: long }));
  const huge = normalizeProcessLog({
    bind: 'b1',
    entries: Array.from({ length: 40 }, () => ({ id: 'same', strategy: 'measure', from: 'drawing', ev: { note: long, steps } })),
  });
  assert.ok(huge.entries.length <= PROCESS_LOG_LIMITS.maxEntries);
  assert.ok(JSON.stringify(huge).length <= PROCESS_LOG_LIMITS.maxJsonLength, `${JSON.stringify(huge).length} characters`);
  assert.ok(huge.entries.every((held) => held.ev.note.length <= PROCESS_LOG_LIMITS.maxTextLength));
  assert.equal(new Set(huge.entries.map((held) => held.id)).size, huge.entries.length, 'ids are unique');
  // Garbage is an empty log, never an exception.
  for (const garbage of [null, 7, 'log', [], { entries: 'nope' }, { entries: [null, 3, { strategy: '' }] }]) {
    assert.deepEqual(normalizeProcessLog(garbage).entries, []);
  }
});

test('appending: re-establishing a fact replaces the old entry; an entry that still holds another fact is kept', () => {
  const claimsOf = (candidate) => Object.keys(candidate.ev || {}).filter((key) => ['width', 'height'].includes(key));
  let log = emptyProcessLog('b1');
  log = appendProcessEntry(log, entry('a', 'measure', 'drawing', { width: 5, height: 4 }), { binding: 'b1', claimsOf });
  log = appendProcessEntry(log, entry('b', 'measure', 'drawing', { width: 3 }), { binding: 'b1', claimsOf });
  assert.deepEqual(log.entries.map((held) => held.id), ['a', 'b'], 'the first entry still holds the height');
  log = appendProcessEntry(log, entry('c', 'measure', 'drawing', { width: 3, height: 4 }), { binding: 'b1', claimsOf });
  assert.deepEqual(log.entries.map((held) => held.id), ['c'], 'both older entries are superseded');
  log = appendProcessEntry(log, entry('c', 'readLabel', 'label', { width: 3 }), { binding: 'b1', claimsOf: () => ['other'] });
  assert.equal(new Set(log.entries.map((held) => held.id)).size, log.entries.length, 'a repeated id is made unique');
});

test('unlocks and reachability: what a representation still needs, and whether a question can ever open it', () => {
  const held = new Set(['width']);
  const unlocks = representationUnlocks(RECTANGLE, held, { achievable: new Set(['width', 'height', 'area', 'twoCorners']) });
  assert.deepEqual(unlocks.outline, { unlocked: false, missing: ['height'] });
  assert.deepEqual(unlocks.scaleDrawing, { unlocked: false, missing: ['area'] });
  const labelOptions = processOptions(RECTANGLE, { given: 'label' });
  const reachable = reachableTokens(RECTANGLE, labelOptions);
  assert.deepEqual([...reachable].sort(), ['area', 'height', 'width'], 'a label can never give two corners');
  assert.deepEqual(auditProcessModel(RECTANGLE, { contexts: [{ given: 'drawing' }] }), []);
  // A fact whose only method needs the fact itself is circular.
  const circular = defineProcessModel({
    id: 'circular',
    facts: { a: {}, b: {} },
    strategies: { s: { produces: ['a'], sources: [{ id: 'facts', needs: 'b' }] }, t: { produces: ['b'], sources: [{ id: 'facts', needs: 'a' }] } },
    representations: { r: { unlock: 'a' } },
  });
  const problems = auditProcessModel(circular);
  assert.ok(problems.some((problem) => /fact "a".*can never be established/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /representation "r" can never be unlocked/.test(problem)));
});

test('the Multiple Representations model is sound for every GIVEN and covers every card on the board', () => {
  assert.equal(PROCESS_MODEL_COVERS_BOARD, true);
  for (const given of ['standardForm', 'slopeIntercept', 'pointSlope', 'twoPoints', 'table', 'graph', 'scenario']) {
    const context = { ...lmrProcessContext({ source: { kind: given } }), tableZeroX: false, tableZeroY: false };
    const base = given === 'twoPoints' ? ['point', 'anyPoint', 'twoPoints'] : [];
    const options = processOptions(LMR_PROCESS_MODEL, context);
    const reachable = reachableTokens(LMR_PROCESS_MODEL, options, base);
    for (const fact of ['slope', 'yIntercept', 'xIntercept', 'anyPoint', 'twoPoints']) {
      assert.equal(reachable.has(fact), true, `${given}: ${fact} can be established`);
    }
    // Every card can be opened from a GIVEN of this kind.
    const unlocks = representationUnlocks(LMR_PROCESS_MODEL, new Set(base), { achievable: reachable });
    for (const [cardId, unlock] of Object.entries(unlocks)) assert.notEqual(unlock.missing, null, `${given}: ${cardId} can be opened`);
  }
});
