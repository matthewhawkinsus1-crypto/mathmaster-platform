/*
 * THE PIECES A TOOL STATES ITS DRAFT'S SHAPE WITH, AND THE CHECKS EVERY FIELD
 * GETS WITHOUT ONE (src/tools/shared/toolDraftShape.js, usePersistentToolState.js).
 *
 * A draft is read back as a claim: an older build, another Chromebook or damage
 * can leave a shape the tool does not expect, and the tool then throws on every
 * load until the draft is gone. Two promises are tested here, both ways:
 *
 *   - a value of the right shape comes back exactly as it was saved (the same
 *     object), so a valid draft restores as before;
 *   - a part of the wrong shape is repaired when the repair keeps the
 *     student's work, dropped when it cannot be, and nothing throws.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DRAFT_TEXT_LENGTH, SCALAR_DRAFT_SHAPES, draftNormalizer, draftShape as s, withoutPrototypeKeys } from '../../src/tools/shared/toolDraftShape.js';
import { MAX_WORKSPACE_DRAFT_VALUE_BYTES } from '../../functions/shared/workspaceDraftSchema.mjs';

import { hydrateToolDraftField } from '../../src/tools/shared/usePersistentToolState.js';

const run = (shape, value) => draftNormalizer(shape)(value);
const hostileKeys = () => JSON.parse('{"__proto__":{"polluted":1},"constructor":"x","toString":1,"valueOf":null,"hasOwnProperty":2}');
// What a damaged draft can hold, anywhere.
const HOSTILE = () => [
  null, undefined, true, false, 0, -3, 2.5, 1e300, NaN, Infinity, -Infinity, '', 'abc', '12', 'a'.repeat(MAX_DRAFT_TEXT_LENGTH + 5),
  [], {}, [null], ['abc'], [7], [true], [{}], [[1, 2], [3, 4]], [[[]]], { a: null }, { a: 'x' }, { a: [1] }, { 0: 'x', 1: null },
  hostileKeys(), Array.from({ length: 3000 }, () => null),
];

/* ---------------------------------------------------------------- pieces */

test('a value of the right shape comes back as the same object, with nothing reported', () => {
  const row = { id: 'r1', type: 'expression', value: '(1, 2)' };
  const shapes = [
    [s.text(), 'x + 1'],
    [s.number(), -2.5],
    [s.boolean(), false],
    [s.oneOf(['add', 'subtract']), 'add'],
    [s.nullable(s.number()), null],
    [s.cell(), 3],
    [s.cell(), '3/4'],
    [s.point(), [1, -2]],
    [s.list(s.point()), [[1, 2], [3, 4]]],
    [s.list(s.cell({ or: '' }), { keepPositions: true, length: 3 }), ['1', '', 'x']],
    [s.record({ id: s.required(s.text()), type: s.oneOf(['expression']), value: s.text() }), row],
    [s.list(s.record({ id: s.required(s.text()) })), [row, { ...row, id: 'r2' }]],
    [s.map(s.boolean()), { a: true, b: false }],
    [s.grid(2, 2), [['1', 2], ['', 'x']]],
    [s.numberBox(), '1.5'],
    [s.via((model) => ({ family: model.family || 'linear', a: Number(model.a) })), { family: 'linear', a: 2 }],
  ];
  for (const [shape, value] of shapes) {
    const result = run(shape, value);
    assert.equal(result.value, value, `${JSON.stringify(value)} comes back as the same value`);
    assert.deepEqual(result.issues, [], `${JSON.stringify(value)} reports nothing`);
  }
});

test('text: an older build\'s number comes back as its digits, text past the backup\'s limit is cut, and nothing else is kept', () => {
  assert.equal(MAX_DRAFT_TEXT_LENGTH, MAX_WORKSPACE_DRAFT_VALUE_BYTES, 'the limit is the most the server backup keeps for a whole workspace');
  assert.deepEqual(run(s.text(), 12), { value: '12', issues: ['number-as-text'] });
  const long = run(s.text(), 'x'.repeat(MAX_DRAFT_TEXT_LENGTH + 10));
  assert.equal(long.value.length, MAX_DRAFT_TEXT_LENGTH);
  assert.deepEqual(long.issues, ['text-too-long']);
  for (const [index, value] of [null, true, {}, [], hostileKeys(), NaN].entries()) {
    assert.equal(run(s.text(), value).value, undefined, `value ${index} is not text`);
    assert.equal(run(s.text({ or: '' }), value).value, '', 'or a blank, where the shape gives one');
  }
});

test('number, boolean, choice and null keep only their own kind', () => {
  assert.equal(run(s.number(), '3').value, undefined);
  assert.equal(run(s.number({ orText: true }), '3').value, '3', 'a number box keeps what was typed');
  assert.equal(run(s.number({ integer: true, min: 0, max: 2 }), 3).value, undefined, 'an index the question does not have');
  assert.equal(run(s.number({ integer: true, min: 0, max: 2 }), 1.5).value, undefined);
  assert.equal(run(s.number(), NaN).value, undefined);
  assert.equal(run(s.boolean(), 'true').value, undefined);
  assert.equal(run(s.oneOf(['x', 'y']), 'z').value, undefined);
  assert.equal(run(s.nullable(s.number()), null).value, null);
  assert.equal(run(s.nullable(s.number()), 'x').value, undefined);
  assert.equal(run(s.numberBox(), 'abc').value, undefined, 'a number box never holds other text');
  assert.equal(run(s.numberBox(), '').value, '', 'nothing typed yet');
  assert.equal(run(s.point(), [1, 'a']).value, undefined);
  assert.equal(run(s.point(), [1, 2, 3]).value, undefined);
});

test('a list drops what it cannot keep, keeps a blank in its place, or ends at the first damaged step', () => {
  assert.deepEqual(run(s.list(s.point()), [[1, 2], null, 'x', [3, 4]]).value, [[1, 2], [3, 4]]);
  assert.deepEqual(run(s.list(s.cell({ or: '' }), { keepPositions: true }), ['1', null, { a: 1 }, '4']).value, ['1', '', '', '4'], 'each cell keeps its place');
  assert.deepEqual(run(s.list(s.cell({ or: '' }), { keepPositions: true, length: 3 }), ['1']).value, ['1', '', ''], 'sized by the question');
  assert.deepEqual(run(s.list(s.cell({ or: '' }), { keepPositions: true, length: 2 }), ['1', '2', '3']).value, ['1', '2']);
  const step = s.record({ before: s.required(s.number()), after: s.required(s.number()) });
  assert.deepEqual(run(s.list(step, { untilInvalid: true }), [{ before: 1, after: 2 }, { before: 2 }, { before: 3, after: 4 }]).value, [{ before: 1, after: 2 }], 'a derivation keeps the steps before the damaged one');
  assert.equal(run(s.list(s.point(), { min: 1 }), [null]).value, undefined, 'nothing left: the field starts fresh');
  assert.equal(run(s.list(s.point()), { 0: [1, 2] }).value, undefined, 'not a list');
  assert.equal(run(s.list(s.point(), { max: 2 }), [[1, 1], [2, 2], [3, 3]]).value.length, 2);
});

test('a record keeps a missing optional key missing, takes a blank for a required one, keeps keys it does not name, and never a __proto__ key', () => {
  const shape = s.record({ id: s.required(s.text()), name: s.required(s.text({ or: '' })), note: s.text() });
  assert.deepEqual(run(shape, { id: 'a' }).value, { id: 'a', name: '' }, 'a required key with a blank takes it');
  assert.deepEqual(run(shape, { id: 'a', name: 'n', note: 5 }).value, { id: 'a', name: 'n', note: '5' });
  assert.deepEqual(run(shape, { id: 'a', name: 'n', note: {} }).value, { id: 'a', name: 'n' }, 'a damaged optional key is removed');
  assert.equal(run(shape, { name: 'n' }).value, undefined, 'a required key with no blank: the record is not kept');
  assert.deepEqual(run(shape, { id: 'a', name: 'n', extra: [1] }).value, { id: 'a', name: 'n', extra: [1] }, 'a key from a newer build stays');
  const kept = run(shape, JSON.parse('{"id":"a","name":"n","__proto__":{"polluted":1}}')).value;
  assert.equal(Object.prototype.hasOwnProperty.call(kept, '__proto__'), false);
  assert.equal(Object.getPrototypeOf(kept), Object.prototype);
  assert.equal(run(shape, ['a']).value, undefined, 'a list is not a record');
});

test('a map keeps only the keys the question still has, and the shape of each value', () => {
  assert.deepEqual(run(s.map(s.text(), { keys: ['a', 'b'] }), { a: 'x', c: 'y', b: 1 }).value, { a: 'x', b: '1' });
  assert.deepEqual(run(s.map(s.text(), { keys: (key) => key.startsWith('k') }), { k1: 'x', constructor: 'y', toString: 'z' }).value, { k1: 'x' });
  assert.deepEqual(run(s.map(s.boolean()), { a: true, b: 'no' }).value, { a: true });
  assert.deepEqual(run(s.map(s.boolean({ or: false })), { a: true, b: 'no' }).value, { a: true, b: false });
});

test('the tool\'s own model normaliser: kept as saved when it changes nothing, its repair when it does', () => {
  const normalizeModel = (model) => ({ family: ['linear', 'quadratic'].includes(model.family) ? model.family : 'linear', a: Number.isFinite(Number(model.a)) ? Number(model.a) : 1 });
  const saved = { family: 'quadratic', a: 2 };
  assert.equal(run(s.via(normalizeModel), saved).value, saved);
  assert.deepEqual(run(s.via(normalizeModel), { family: 'nope', a: {} }), { value: { family: 'linear', a: 1 }, issues: ['repaired'] });
  assert.equal(run(s.via(normalizeModel), 'quadratic').value, undefined, 'anything but a record starts from the question');
  assert.equal(run(s.via(() => { throw new Error('model bug'); }), saved).value, undefined);
});

test('a grid keeps every cell in its place and every row the question\'s width', () => {
  assert.deepEqual(run(s.grid(2, 3), [['1', null, '3'], 'row', ['x']]).value, [['1', '', '3'], ['', '', '']]);
  assert.deepEqual(run(s.grid(2, 2), [['1', '2']]).value, [['1', '2'], ['', '']]);
  assert.deepEqual(run(s.grid(), [['1'], null, ['2', '3']]).value, [['1'], [], ['2', '3']], 'a grid the student sizes: a damaged row is an empty row');
});

test('no piece throws on anything a damaged draft can hold', () => {
  const step = s.record({ phase: s.required(s.text()), left: s.required(s.record({ x: s.required(s.number()) })), history: s.list(s.record({ phase: s.text() }), { untilInvalid: true }) });
  const pieces = [
    s.text(), s.text({ or: '' }), s.number(), s.number({ orText: true }), s.boolean(), s.oneOf(['a']), s.nullable(s.point()),
    s.cell(), s.cell({ or: '' }), s.point(), s.numberBox(), s.any(), s.either(s.number(), s.text()),
    s.list(s.point()), s.list(s.cell({ or: '' }), { keepPositions: true, length: 4 }), s.list(step, { untilInvalid: true, min: 1 }),
    s.tuple([s.text(), s.number()]), step, s.map(s.map(s.text())), s.map(s.cell(), { keys: ['a'] }), s.grid(3, 3), s.grid(),
    s.via((model) => ({ ...model })), s.refine(s.number(), (value) => value > 0, { or: 1 }),
    ...Object.values(SCALAR_DRAFT_SHAPES),
  ];
  for (const piece of pieces) {
    for (const value of HOSTILE()) {
      assert.doesNotThrow(() => run(piece, value));
      for (const nested of [{ x: value }, [value], { phase: 'p', left: { x: value }, history: [value] }]) {
        assert.doesNotThrow(() => run(piece, nested));
      }
    }
  }
});

test('withoutPrototypeKeys removes __proto__ at any depth and returns the same object when there is none', () => {
  const clean = { a: [{ b: 1 }], c: 'x' };
  assert.equal(withoutPrototypeKeys(clean), clean);
  const damaged = JSON.parse('{"a":[{"b":1,"__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}');
  const kept = withoutPrototypeKeys(damaged);
  assert.deepEqual(JSON.parse(JSON.stringify(kept)), { a: [{ b: 1 }] });
  // Written back the way a tool copies a record, it can no longer change one's prototype.
  const copy = Object.assign({}, kept.a[0]);
  assert.equal(copy.polluted, undefined);
});

/* ------------------------------------------------ every field, without saying so */

test('hydrateToolDraftField: a field that starts as text restores text, and nothing else reaches the tool', () => {
  // An object where a box's text belongs threw on every load ("Objects are not
  // valid as a React child", or "Cannot convert object to primitive value"
  // where it has its own toString, as damage can leave it).
  assert.deepEqual(hydrateToolDraftField({ record: { slope: { a: 1 } }, field: 'slope', initialValue: '' }), { value: '', restored: false, issues: ['expected-text'] });
  assert.deepEqual(hydrateToolDraftField({ record: { slope: hostileKeys() }, field: 'slope', initialValue: '' }), { value: '', restored: false, issues: ['expected-text'] });
  assert.deepEqual(hydrateToolDraftField({ record: { slope: ['3'] }, field: 'slope', initialValue: '' }).value, '');
  assert.deepEqual(hydrateToolDraftField({ record: { slope: null }, field: 'slope', initialValue: 'm' }), { value: 'm', restored: false, issues: ['expected-text'] });
  assert.deepEqual(hydrateToolDraftField({ record: { slope: 3 }, field: 'slope', initialValue: '' }), { value: '3', restored: true, issues: ['number-as-text'] });
  const long = hydrateToolDraftField({ record: { slope: 'x'.repeat(100000) }, field: 'slope', initialValue: '' });
  assert.equal(long.value.length, MAX_DRAFT_TEXT_LENGTH, 'a text no copy but this device keeps is cut, not dropped');
  assert.deepEqual(long.issues, ['text-too-long']);
});

test('hydrateToolDraftField: a field that starts as a boolean restores a boolean, and one that starts as a number a number or what was typed', () => {
  assert.deepEqual(hydrateToolDraftField({ record: { done: 'yes' }, field: 'done', initialValue: false }), { value: false, restored: false, issues: ['expected-boolean'] });
  assert.deepEqual(hydrateToolDraftField({ record: { done: true }, field: 'done', initialValue: false }), { value: true, restored: true, issues: [] });
  assert.deepEqual(hydrateToolDraftField({ record: { x: '3.5' }, field: 'x', initialValue: 2 }), { value: '3.5', restored: true, issues: [] }, 'a number box holds what was typed');
  assert.deepEqual(hydrateToolDraftField({ record: { x: { n: 1 } }, field: 'x', initialValue: 2 }), { value: 2, restored: false, issues: ['expected-number'] });
  assert.deepEqual(hydrateToolDraftField({ record: { x: NaN }, field: 'x', initialValue: 2 }), { value: 2, restored: false, issues: ['expected-number'] });
});

test('hydrateToolDraftField: a field that starts as null is left to its own normalize, and a value the normalize cannot keep starts fresh', () => {
  assert.deepEqual(hydrateToolDraftField({ record: { badRow: 2 }, field: 'badRow', initialValue: null }), { value: 2, restored: true, issues: [] });
  const point = draftNormalizer(s.nullable(s.point()));
  assert.deepEqual(hydrateToolDraftField({ record: { at: [1, 2] }, field: 'at', initialValue: null, normalize: point }), { value: [1, 2], restored: true, issues: [] });
  assert.deepEqual(hydrateToolDraftField({ record: { at: 'x' }, field: 'at', initialValue: null, normalize: point }), { value: null, restored: false, issues: ['not-a-tuple'] });
  // A record held in memory (a remount in the same session) can hold undefined.
  assert.deepEqual(hydrateToolDraftField({ record: { at: undefined }, field: 'at', initialValue: null }), { value: null, restored: false, issues: ['no-value'] });
});

test('hydrateToolDraftField: no __proto__ key reaches a tool, at any depth', () => {
  const record = JSON.parse('{"rows":[{"id":"a","__proto__":{"polluted":true}}]}');
  const { value, issues } = hydrateToolDraftField({ record, field: 'rows', initialValue: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(value[0], '__proto__'), false);
  assert.equal(Object.assign({}, value[0]).polluted, undefined);
  assert.deepEqual(issues, ['hostile-key']);
});

test('hydrateToolDraftField: a valid value of every kind restores exactly as saved', () => {
  const cases = [
    [{ sum: '12' }, 'sum', ''], [{ sum: '' }, 'sum', '7'], [{ on: false }, 'on', true], [{ n: 0 }, 'n', 5], [{ n: '' }, 'n', 5],
    [{ rows: [{ id: 'a' }] }, 'rows', []], [{ map: { a: [1] } }, 'map', {}], [{ v: { x: 1 } }, 'v', null], [{ v: 'x' }, 'v', null],
  ];
  for (const [record, field, initialValue] of cases) {
    const result = hydrateToolDraftField({ record, field, initialValue });
    assert.equal(result.value, record[field], JSON.stringify(record));
    assert.deepEqual([result.restored, result.issues], [true, []], JSON.stringify(record));
  }
});
