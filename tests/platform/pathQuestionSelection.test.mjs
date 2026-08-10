import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFillSessionWithoutRepeats, rankCandidates, recordFamilyUse, selectNextFamily,
} from '../../functions/shared/pathQuestionSelection.mjs';

// The five slots a standard is authored with.
const STANDARD = [
  { id: 'foundation', difficultyBand: 2 },
  { id: 'core', difficultyBand: 3 },
  { id: 'representation', difficultyBand: 3 },
  { id: 'application', difficultyBand: 4 },
  { id: 'challenge', difficultyBand: 5 },
];

/** Run a whole session, returning the families it issued in order. */
const runSession = (candidates, { preferredBand = 3, questions = 5 } = {}) => {
  let usage = {};
  const issued = [];
  for (let index = 0; index < questions; index += 1) {
    const choice = selectNextFamily(candidates, { preferredBand, usage });
    issued.push(choice.question.id);
    usage = recordFamilyUse(usage, choice.question.id, index + 1);
  }
  return issued;
};

// --- The bug this exists to fix --------------------------------------------------

test('a five-question session uses all five families, not the two in the preferred band', () => {
  const issued = runSession(STANDARD, { preferredBand: 3 });
  assert.equal(new Set(issued).size, 5, `repeated within one session: ${issued.join(', ')}`);
  assert.deepEqual([...issued].sort(), ['application', 'challenge', 'core', 'foundation', 'representation']);
});

test('the preferred band still goes first', () => {
  const issued = runSession(STANDARD, { preferredBand: 3 });
  assert.deepEqual(issued.slice(0, 2).sort(), ['core', 'representation'], 'both Band 3 families lead');
});

test('readiness at a different band leads from that band', () => {
  assert.equal(runSession(STANDARD, { preferredBand: 5 })[0], 'challenge');
  assert.equal(runSession(STANDARD, { preferredBand: 2 })[0], 'foundation');
});

// --- Widening, and the direction it widens ---------------------------------------

test('an exhausted band widens to the closest adjacent one', () => {
  const usage = { core: { timesUsed: 1, lastUsedAt: 1 }, representation: { timesUsed: 1, lastUsedAt: 2 } };
  const choice = selectNextFamily(STANDARD, { preferredBand: 3, usage });
  assert.equal(choice.reason, 'unused_family_in_adjacent_band');
  assert.equal(choice.distanceFromPreferred, 1);
  assert.ok(['foundation', 'application'].includes(choice.question.id));
});

test('at equal distance it steps down before it steps up', () => {
  // Band 2 and Band 4 are both one away from Band 3. Easier work first is the
  // kinder direction for a student who has already seen everything at level.
  const usage = { core: 1, representation: 1 };
  assert.equal(selectNextFamily(STANDARD, { preferredBand: 3, usage }).question.id, 'foundation');
});

test('an unused family one band away beats a used one in the preferred band', () => {
  const usage = { core: { timesUsed: 1, lastUsedAt: 1 }, representation: { timesUsed: 1, lastUsedAt: 2 } };
  const choice = selectNextFamily(STANDARD, { preferredBand: 3, usage });
  assert.equal(choice.isRepeat, false, 'a new problem one band away teaches more than the same problem twice');
});

// --- Repeating, when there is nothing else -----------------------------------------

test('a standard with one family repeats it rather than failing', () => {
  const single = [{ id: 'only', difficultyBand: 3 }];
  const issued = runSession(single, { preferredBand: 3 });
  assert.deepEqual(issued, ['only', 'only', 'only', 'only', 'only']);
});

test('when everything has been used, the least-used family comes next', () => {
  const usage = {
    foundation: { timesUsed: 2, lastUsedAt: 10 },
    core: { timesUsed: 1, lastUsedAt: 20 },
    representation: { timesUsed: 3, lastUsedAt: 5 },
    application: { timesUsed: 2, lastUsedAt: 30 },
    challenge: { timesUsed: 2, lastUsedAt: 40 },
  };
  const choice = selectNextFamily(STANDARD, { preferredBand: 3, usage });
  assert.equal(choice.question.id, 'core');
  assert.equal(choice.reason, 'all_families_used_repeating_least_used');
  assert.equal(choice.isRepeat, true);
});

test('among equally-used families the least recently seen comes next', () => {
  const two = [{ id: 'a', difficultyBand: 3 }, { id: 'b', difficultyBand: 3 }];
  const usage = { a: { timesUsed: 1, lastUsedAt: 50 }, b: { timesUsed: 1, lastUsedAt: 10 } };
  assert.equal(selectNextFamily(two, { preferredBand: 3, usage }).question.id, 'b');
});

// --- Housekeeping --------------------------------------------------------------------

test('selection is deterministic for the same session state', () => {
  const usage = { core: 1 };
  const first = selectNextFamily(STANDARD, { preferredBand: 3, usage });
  const second = selectNextFamily(STANDARD, { preferredBand: 3, usage });
  assert.equal(first.question.id, second.question.id);
});

test('an empty bank selects nothing rather than throwing', () => {
  assert.equal(selectNextFamily([], { preferredBand: 3 }), null);
});

test('usage accepts the older bare-count shape', () => {
  const usage = { core: 2, representation: 1 };
  const ranked = rankCandidates(STANDARD, { preferredBand: 3, usage });
  const used = ranked.filter((entry) => entry.timesUsed > 0).map((entry) => entry.question.id);
  assert.deepEqual(used.sort(), ['core', 'representation']);
});

test('recording a use increments rather than overwriting', () => {
  const once = recordFamilyUse({}, 'core', 100);
  assert.deepEqual(once.core, { timesUsed: 1, lastUsedAt: 100 });
  const twice = recordFamilyUse(once, 'core', 200);
  assert.deepEqual(twice.core, { timesUsed: 2, lastUsedAt: 200 });
});

test('five families is exactly what a five-question session needs', () => {
  assert.equal(canFillSessionWithoutRepeats(STANDARD, 5), true);
  assert.equal(canFillSessionWithoutRepeats(STANDARD.slice(0, 4), 5), false);
});
