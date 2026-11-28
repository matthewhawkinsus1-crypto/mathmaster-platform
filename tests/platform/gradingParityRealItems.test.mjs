/*
 * THE REAL-ITEM GRADING PARITY AUDIT, A SEEDED SLICE ON EVERY PULL REQUEST.
 *
 * scripts/audit-grading-parity-real-items.mjs answers every gradable item in
 * teacher-import-jsons the way students answer it and holds the screen's
 * verdict to the server's, and both to the item's own key
 * (scripts/lib/gradingParityAudit). The whole run takes under a minute; this
 * runs a fixed seeded slice of it (items, answers per box, and tool work)
 * in well under that, and replays every entry of the review list.
 *
 * A failure here is one of:
 *   - the screen and the server gave one answer two verdicts: a grader or the
 *     response the screen sends changed on one side only;
 *   - a right answer the independent reading confirmed was marked wrong, or a
 *     wrong one right, and it is not on the review list
 *     (scripts/grading-parity-real-items-review.json): fix the grader, with a
 *     test, and run the verdict sweep (docs/architecture/GRADER_FUZZ.md);
 *   - an entry of the review list no longer reproduces: delete it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runRealItemAudit,
  runToolItemParity,
  screenVerdict,
  serverVerdict,
  signatureOf,
  typedBoxesOf,
  verdictsAgree,
} from '../../scripts/lib/gradingParityAudit/audit.mjs';
import { compareToKey } from '../../scripts/lib/gradingParityAudit/mathOracle.mjs';
import { readReviewList, unlistedFirm } from '../../scripts/lib/gradingParityAudit/reviewList.mjs';
import { realItems } from '../../scripts/lib/gradingParityAudit/realItems.mjs';
import { studentAnswersFor } from '../../scripts/lib/gradingParityAudit/studentAnswers.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';

const SLICE = Object.freeze({ seed: 'pr', seats: 1, itemSample: 700, answerSample: 22, toolItems: 360, toolPerItem: 4 });
const describe = (row) => `${row.item} [${row.box}] key ${JSON.stringify(row.key)} typed ${JSON.stringify(row.input)}: screen ${row.screen}${row.screenWhy ? ` (${row.screenWhy})` : ''}, server ${row.server}`;

let slice = null;
const typedSlice = () => {
  slice ??= runRealItemAudit({ seed: SLICE.seed, seats: SLICE.seats, itemSample: SLICE.itemSample, answerSample: SLICE.answerSample });
  return slice;
};

test('every lesson in teacher-import-jsons compiles, and the slice reaches every kind of typed box', () => {
  const { counts, failures } = typedSlice();
  assert.deepEqual(failures, [], 'a lesson or a family slot that does not compile is not audited');
  assert.equal(counts.lessons >= 40, true, `${counts.lessons} lessons read`);
  assert.equal(counts.items >= 1400, true, `${counts.items} items`);
  assert.equal(counts.answers >= 2500, true, `${counts.answers} answers typed`);
  for (const category of ['right', 'wrong', 'edge']) assert.equal((counts.byCategory[category] || 0) > 200, true, `${category}: ${counts.byCategory[category]}`);
});

test('the screen and the server give every answer in the slice one verdict', () => {
  const { disagreements } = typedSlice();
  assert.deepEqual(disagreements.map(describe), []);
});

test('no right answer is marked wrong and no wrong answer right, beyond the review list', () => {
  const { wrongVerdicts, keyNotRight } = typedSlice();
  assert.deepEqual(keyNotRight.map(describe), [], 'an item\'s own key is right on both sides');
  assert.deepEqual(unlistedFirm(wrongVerdicts).map((row) => `${signatureOf(row)} :: ${describe(row)}`), []);
});

test('every entry of the review list still reproduces (delete it once it does not)', () => {
  const { items } = realItems({ seats: 1 });
  const entries = readReviewList();
  assert.ok(entries.length >= 0);
  for (const entry of entries) {
    const item = items.find((candidate) => candidate.id === entry.repro.item);
    assert.ok(item, `${entry.repro.item} is still a real item`);
    const question = deliveredQuestionForGrading(item.question);
    const box = typedBoxesOf(question).find((candidate) => candidate.key === entry.repro.key);
    assert.ok(box, `a box keyed ${entry.repro.key}`);
    const screen = screenVerdict(question, box, entry.repro.input);
    const server = serverVerdict(question, screen, box);
    assert.match(entry.signature, new RegExp(`screen=${screen.verdict} \\| server=${server.verdict}$`), `${entry.repro.input}: screen ${screen.verdict}, server ${server.verdict} — the entry no longer reproduces; delete it`);
  }
});

test('rich-tool work on real items: one verdict on the device and the server, and never a throw', async () => {
  const { cases, findings } = await runToolItemParity({ seed: SLICE.seed, seats: SLICE.seats, itemSample: SLICE.toolItems, perItem: SLICE.toolPerItem });
  assert.equal(cases > 200, true, `${cases} pieces of tool work`);
  assert.deepEqual(findings.filter((found) => found.severity === 'fail').map((found) => `${found.item}: ${found.property} ${found.signature} ${found.message}`), []);
});

/* --------------------------------------------- the audit's own parts can fail */

test('the audit calls a split verdict a disagreement, and a refused box marked right by the server one too', () => {
  assert.equal(verdictsAgree({ verdict: 'right', whole: true }, { verdict: 'wrong', whole: false }), false);
  assert.equal(verdictsAgree({ verdict: 'right', whole: true }, { verdict: 'ungraded:incomplete-response', whole: false }), false);
  assert.equal(verdictsAgree({ verdict: 'refused', whole: false }, { verdict: 'right', whole: true }), false);
  assert.equal(verdictsAgree({ verdict: 'refused', whole: false }, { verdict: 'wrong', whole: false }), true);
  assert.equal(verdictsAgree({ verdict: 'right', whole: true }, { verdict: 'right', whole: false }), false, 'the whole item counts too');
});

test('the independent reading tells the same value from another, and says when it cannot read', () => {
  const same = [['7√2', 'sqrt(98)', 'expression'], ['y=-2x+8', 'y = 8 − 2x', 'equation'], ['b<=420', '420 ≥ b', 'inequality'], ['(2,0)', '( 2 , 0 )', 'orderedPair'], ['{±1, ±3}', '{-3,-1,1,3}', 'set'], ['4/3', '\\frac{4}{3}', 'number'], ['2x+3', '2·x+3', 'expression']];
  const different = [['y=-2x+8', 'y=2x+8', 'equation'], ['b<=420', 'b<420', 'inequality'], ['(2,0)', '(0,2)', 'orderedPair'], ['{1, -1}', '{1}', 'set'], ['x^2-64', 'x^2+64', 'expression'], ['4/3', '3/4', 'number']];
  for (const [key, typed, kind] of same) assert.equal(compareToKey(key, typed, kind), 'same', `${typed} for ${key}`);
  for (const [key, typed, kind] of different) assert.equal(compareToKey(key, typed, kind), 'different', `${typed} for ${key}`);
  assert.equal(compareToKey('2x+3', '2x+@', 'expression'), 'unknown');
});

test('a "wrong" answer the reading finds equal to the key is never built, nor a "right" one it finds unequal', () => {
  const answers = studentAnswersFor({ key: '(x+2)(x-1)', field: { gradingMode: 'factoredForm', inputProfile: 'expression' } });
  for (const answer of answers.filter((entry) => entry.category === 'wrong')) assert.notEqual(compareToKey('(x+2)(x-1)', answer.text, 'expression'), 'same', answer.text);
  for (const answer of answers.filter((entry) => entry.category === 'right' && entry.firm)) assert.equal(compareToKey('(x+2)(x-1)', answer.text, 'expression'), 'same', answer.text);
  assert.ok(answers.some((answer) => answer.category === 'unsimplified' && answer.text === 'x^2+x-2'), 'the expanded form of a factored key');
  const tolerant = studentAnswersFor({ key: '38.46', field: { inputProfile: 'number', numericTolerance: 0.01 } });
  assert.equal(tolerant.some((answer) => answer.category === 'wrong' && answer.text === '38.47'), false, 'inside the item\'s own tolerance a number is right');
});
