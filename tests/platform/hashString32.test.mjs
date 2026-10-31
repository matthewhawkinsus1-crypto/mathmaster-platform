// THE PLATFORM'S STRING HASH GIVES THE NUMBER IT ALWAYS GAVE (PF01).
//
// functions/shared/hashString32.mjs holds the hash that used to be defined inside
// the question family engine. A student's Home reaches it through
// questionGenerationIdentity.mjs, to name a seat (the opaque token, and where a
// provisional seat lands), and moving it took the engine and the family contract
// (about 6 KB gzip) out of the first load
// (tests/platform/firstLoadQuestionFamilyEngine.test.mjs). That is safe only
// while it is the same arithmetic: the seat tokens already stored on assignments,
// and the order each family deals its questions in, come from it, and a different
// number would seat a student somewhere else and hand them a different question.
// This holds it to the function as it was written in the engine, to the
// published FNV-1a vectors, and to tokens and seats made by the code before the
// move.

import test from 'node:test';
import assert from 'node:assert/strict';
import { hashString32 } from '../../functions/shared/hashString32.mjs';
import * as engine from '../../functions/shared/questionFamilyEngine.mjs';
import { learnerToken, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';

// The function exactly as it was in questionFamilyEngine.mjs.
const asItWas = (value, seed = 0x811c9dc5) => {
  let hash = seed >>> 0;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

test('the engine still hands out the very function, so there is one hash', () => {
  assert.equal(engine.hashString32, hashString32);
});

test('it is FNV-1a over 32 bits: the published vectors', () => {
  assert.equal(hashString32(''), 0x811c9dc5);
  assert.equal(hashString32('a'), 0xe40c292c);
  assert.equal(hashString32('foobar'), 0xbf9cf968);
});

// Values a caller can pass, and seeds: the hash reads String(value ?? '') and seed >>> 0.
const VALUES = [
  '', ' ', 'a', 'A', 'foobar', 'mmLearner|asg-1|stu-1', 'Algebra-1-Lesson-3|910002|variant:2|slot:0',
  'héllo wörld', 'naïve café', '日本語', '😀', 'a😀b', '\u0000', '￿', 'line\nbreak\ttab', 'x'.repeat(5000),
  undefined, null, 0, -0, 1, 42, -7, 1.5, NaN, Infinity, 1e21, 2 ** 53, true, false, 10n,
  [], [1, 2], ['a', 'b'], {}, { toString: () => 'from toString' }, Symbol('s'),
];
const SEEDS = [
  undefined, 0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0, 1, 255, 0xffffffff, 0x100000005, -1, -0x9e3779b9,
  1.9, NaN, Infinity, 2 ** 53, '7', '0x10', null, true, [], {},
];

test('it gives the number it always gave, for every kind of value and seed', () => {
  let tried = 0;
  const moved = [];
  for (const value of VALUES) {
    for (const seed of SEEDS) {
      tried += 1;
      const was = asItWas(value, seed);
      const now = hashString32(value, seed);
      if (!Object.is(was, now)) moved.push(`${String(value)} / ${String(seed)}: was ${was}, now ${now}`);
    }
  }
  // Strings of every length and code unit, from a fixed generator.
  let state = 0x2545f491;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let round = 0; round < 3000; round += 1) {
    const text = String.fromCharCode(...Array.from({ length: next() % 40 }, () => next() % 0x10000));
    for (const seed of [undefined, 0x9e3779b9]) {
      tried += 1;
      if (!Object.is(asItWas(text, seed), hashString32(text, seed))) moved.push(`${JSON.stringify(text)} / ${String(seed)}`);
    }
  }
  assert.ok(tried > 6000, `only ${tried} inputs were tried`);
  assert.deepEqual(moved.slice(0, 10), [], `${moved.length} of ${tried} hashes moved`);
});

// Tokens and seats made by the code before the move (questionGenerationIdentity
// read the hash from the engine then), written out here and not read back from
// the module under test.
test('the tokens and seats a student\'s Home names are the ones already stored', () => {
  assert.equal(learnerToken('asg-1', 'stu-1'), 'ltc6b9a0ef885b1633');
  assert.equal(learnerToken('Algebra-1-Lesson-3', '910002'), 'lt8f3946b307c55b5f');
  assert.equal(learnerToken('asg-1', ''), null);

  const freshClass = { id: 'asg-1', generationSeats: { byClassId: { c1: {} } } };
  const provisional = (studentId) => resolveLearnerSeat({ assignment: freshClass, studentId, classId: 'c1' });
  assert.deepEqual(provisional('stu-1'), { token: 'ltc6b9a0ef885b1633', seat: 5, basis: 'provisional', classId: 'c1', classSize: 0 });
  assert.deepEqual(provisional('stu-2'), { token: 'ltc7b9a282895b17c6', seat: 6, basis: 'provisional', classId: 'c1', classSize: 0 });
  assert.deepEqual(provisional('stu-3'), { token: 'ltc8b9a4158a5b1959', seat: 12, basis: 'provisional', classId: 'c1', classSize: 0 });
  assert.deepEqual(provisional('910002'), { token: 'ltcb8d89a989998d5d', seat: 1, basis: 'provisional', classId: 'c1', classSize: 0 });

  // A class with seats already given: the next provisional seat sits above them.
  const nineSeated = { id: 'asg-1', generationSeats: { byClassId: { c1: { lt0000000000000000: 8, lt1111111111111111: 2 } } } };
  assert.deepEqual(
    resolveLearnerSeat({ assignment: nineSeated, studentId: 'stu-9', classId: 'c1' }),
    { token: 'ltceb9ad87905b22cb', seat: 12, basis: 'provisional', classId: 'c1', classSize: 9 },
  );
  // A seat already given is kept.
  const seated = { id: 'asg-1', generationSeats: { byClassId: { c1: { ltc6b9a0ef885b1633: 7, lt0000000000000000: 8 } } } };
  assert.deepEqual(
    resolveLearnerSeat({ assignment: seated, studentId: 'stu-1', classId: 'c1' }),
    { token: 'ltc6b9a0ef885b1633', seat: 7, basis: 'seated', classId: 'c1', classSize: 9 },
  );
});
