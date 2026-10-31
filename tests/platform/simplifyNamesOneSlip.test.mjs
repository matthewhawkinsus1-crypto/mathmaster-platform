// TL41: "CHECK MY SIMPLIFICATION" NAMES ONE SLIP, AND NEVER THE ANSWER.
//
// Simplify's whole-side route (the student retypes a side) names one slip — a
// sign left as it was when parentheses the board shows after a minus were
// removed — only when the student's own line shows it, only where fixing it
// would not put the answer on the board, and only where the host asks (Step
// Algebra, verdicts shown). Every other line keeps the plain "not equivalent"
// message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  SIMPLIFY_MESSAGES,
  SIMPLIFY_SLIPS,
  checkRegionRewrite,
  regionRewriteSlip,
  simplifyMessage,
} from '../../src/platform/algebra/simplify/simplifyEngine.js';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const SLIP = SIMPLIFY_SLIPS.SIGN_INSIDE_PARENTHESES;

const sides = (left, right) => [
  { key: 'left', label: 'left side', expression: left, variable: 'x' },
  { key: 'right', label: 'right side', expression: right, variable: 'x' },
];

// What the panel tells the student about a retyped side: accepted, the slip
// when it is named, or the plain check's own reason.
const told = ([left, right, key, typed]) => {
  const regions = sides(left, right);
  const result = checkRegionRewrite(regions.find((entry) => entry.key === key), typed);
  if (result.ok) return 'accepted';
  return (result.reason === 'notEquivalentSide' && regionRewriteSlip(regions, key, typed)) || result.reason;
};
const label = ([left, right, key, typed]) => `${left} = ${right}, ${key} side typed as ${typed}`;

test('a line that shows a sign left as it was inside parentheses after a minus is named', () => {
  const shown = [
    ['5 - 3(x - 2)', '2', 'left', '5 - 3x - 6'], // the second sign left as it was
    ['5 - 3(x - 2)', '2', 'left', '5 + 3x - 6'], // every sign left: the minus dropped
    ['4x - 2(x + 3)', '10', 'left', '4x - 2x + 6'],
    ['2(x - 3) - 4(x + 1)', '5', 'left', '2x - 6 - 4x + 4'], // the other group correctly removed
    ['2(x - 3) - 4(x + 1)', '5', 'left', '2(x - 3) - 4x + 4'], // the other group kept whole
    ['2(x - 3) - 4(x + 1)', '5', 'left', '4 - 4x - 6 + 2x'], // in any order
    ['2(x - 3) - 4(x + 1)', '5', 'left', '2\\left(x-3\\right)-4x+4'], // as the math field sends it
    ['-3(x - 2) + 4', '1', 'left', '-3x - 6 + 4'], // a negative number in front
    ['7 - 2(x - y)', '2', 'left', '7 - 2x - 2y'], // two letters
    ['3x - 1 * (2x - 1)', '7', 'left', '3x - 2x - 1'], // a substitution's stored −1(…), drawn −(2x − 1)
    ['2x', '10 - 2(3 + 1)', 'right', '10 - 6 + 2'], // the numbers side: x is still a division away
  ];
  for (const entry of shown) {
    // The plain check refuses the line on its own; the slip is named on top of that.
    const regions = sides(entry[0], entry[1]);
    assert.equal(checkRegionRewrite(regions.find((side) => side.key === entry[2]), entry[3]).reason, 'notEquivalentSide', label(entry));
    assert.equal(told(entry), SLIP, label(entry));
  }
});

test('a line that does not show the slip keeps the plain message', () => {
  const notShown = [
    ['4x - 2(x + 3)', '10', 'left', '2x + 6'], // what the slip gives, combined: the line does not show it
    ['5 - 3(x - 2)', '2', 'left', '-1 - 3x'], // the same
    ['4x - 2(x + 3)', '10', 'left', '4x - 2x - 5'], // a different error
    ['4x + 2(x - 3)', '10', 'left', '4x + 2x + 6'], // a sign changed after a PLUS: not this slip
    ['4x - 2(x + 3)', '10', 'left', '4x - 2x + 6 + 1'], // the slip and something more
    ['5 - 3(x - 2)', '2', 'left', '5 - 3x + 2'], // the sign changed, the product not taken
  ];
  for (const entry of notShown) assert.equal(told(entry), 'notEquivalentSide', label(entry));
  // A right line is accepted as before.
  assert.equal(told(['4x - 2(x + 3)', '10', 'left', '2x - 6']), 'accepted');
  assert.equal(regionRewriteSlip(sides('4x - 2(x + 3)', '10'), 'left', '2x - 6'), null);
  // An equal line is never a slip, even one written with every sign inside left
  // as it was (−2(2 − 2) is zero either way).
  assert.equal(regionRewriteSlip(sides('2x', '5 - 2(2 - 2)'), 'right', '5 + 4 - 4'), null);
  assert.equal(regionRewriteSlip(sides('2x', '5 - 2(2 - 3)'), 'right', '5 - 4 - 6'), SLIP);
  // Nothing typed, or nothing readable: nothing named.
  assert.equal(regionRewriteSlip(sides('4x - 2(x + 3)', '10'), 'left', ''), null);
  assert.equal(regionRewriteSlip(sides('4x - 2(x + 3)', '10'), 'left', '2x - (('), null);
});

test('a bare group the board already draws opened was not removed by the student: not named', () => {
  // 2(x − 3) − (x + 1) is drawn 2(x − 3) − x − 1 (the shared splitter opens a
  // bare group), so a + 1 typed there is a sign copied wrong, not this slip.
  const bare = ['2(x - 3) - (x + 1)', '5', 'left', '2x - 6 - x + 1'];
  assert.equal(told(bare), 'notEquivalentSide', label(bare));
  // The same parentheses kept on the board (a substitution's stored −1(…),
  // drawn −(x + 1)) are the student's to remove, and the same line is named.
  const kept = ['2(x - 3) - 1 * (x + 1)', '5', 'left', '2x - 6 - x + 1'];
  assert.equal(told(kept), SLIP, label(kept));
});

test('never named where fixing the slip would put the answer on the board, so the next line is never given away', () => {
  // Each row: the same typed line on an item where the corrected line IS the
  // answer, and on a neighbour where it is not. The neighbour proves the line
  // shows the slip; the answer item must still get only the plain message.
  const pairs = [
    // The corrected line, x = 10 − 6 − 2, is the answer.
    [['x', '10 - 2(3 + 1)', 'right', '10 - 6 + 2'], ['2x', '10 - 2(3 + 1)', 'right', '10 - 6 + 2']],
    // Either way round.
    [['10 - 2(3 + 1)', 'x', 'left', '10 - 6 + 2'], ['10 - 2(3 + 1)', '3x', 'left', '10 - 6 + 2']],
    // y in terms of x is the answer.
    [['y', '4x - 2(x + 3)', 'right', '4x - 2x + 6'], ['2y', '4x - 2(x + 3)', 'right', '4x - 2x + 6']],
    // This side is x in disguise, and the other side does not depend on x.
    [['x - 2(2 - 2)', '10', 'left', 'x - 4 - 4'], ['x - 2(2 - 2)', '10 - x', 'left', 'x - 4 - 4']],
    // The other side does not depend on x, though x is written in it.
    [['x', 'x - 1 * (x - 5)', 'right', 'x - x - 5'], ['x + 1', 'x - 1 * (x - 5)', 'right', 'x - x - 5']],
    // x, however it is written.
    [['2x / 2', '10 - 2(3 + 1)', 'right', '10 - 6 + 2'], ['2x / 4', '10 - 2(3 + 1)', 'right', '10 - 6 + 2']],
    // No letter at all: the side's value is all the line says.
    [['10 - 2(3 + 1)', '2', 'left', '10 - 6 + 2'], ['10 - 2(3 + 1)', '2x', 'left', '10 - 6 + 2']],
  ];
  for (const [answerItem, neighbour] of pairs) {
    assert.equal(told(neighbour), SLIP, `neighbour ${label(neighbour)}`);
    assert.equal(told(answerItem), 'notEquivalentSide', `answer item ${label(answerItem)}`);
  }
});

test('the named slip says the kind of slip and the rule: no number, no letter, no line, the same for every item', () => {
  const message = simplifyMessage(SLIP);
  assert.notEqual(message, SIMPLIFY_MESSAGES.notEquivalentSide);
  assert.notEqual(message, simplifyMessage('no-such-reason'));
  assert.doesNotMatch(message, /\d/);
  assert.doesNotMatch(message, /\b[a-z]\b(?<!\ba\b)/i, 'a letter other than the article "a"');
  assert.doesNotMatch(message, /[=+*/^()−]/);
  // The same words whatever the item and whatever was typed.
  const first = simplifyMessage(regionRewriteSlip(sides('5 - 3(x - 2)', '2'), 'left', '5 - 3x - 6'));
  const second = simplifyMessage(regionRewriteSlip(sides('7 - 2(x - y)', '2'), 'left', '7 - 2x - 2y'));
  assert.equal(first, message);
  assert.equal(second, message);
});

test('only where the host asks: Step Algebra names it where verdicts are shown; the relation workspace does not ask', () => {
  const panel = executableSource(read('src/platform/algebra/simplify/SimplifyPanel.jsx'));
  // Off unless a host turns it on.
  assert.match(panel, /nameSlips\s*=\s*false/);
  const commitRegion = region(panel, 'const commitRegion', 'const onToolbarKeyDown', 'the whole-side check');
  // Only for a line the plain check found not equal, only when asked, never
  // with a host's own reader, and the slip replaces the plain reason.
  assert.match(commitRegion, /nameSlips\s*&&\s*!regionCheck\s*&&\s*result\.reason\s*===\s*'notEquivalentSide'/);
  assert.match(commitRegion, /regionRewriteSlip\(regions,\s*region\.key,\s*answer\)/);
  assert.match(commitRegion, /simplifyMessage\(slip\s*\|\|\s*result\.reason\)/);

  const algebra = executableSource(read('src/StepByStepAlgebraCore.jsx'));
  assert.match(algebra, /const verdictsShown = useToolRuntimeContext\(\)\.verdictsWithheld !== true;/);
  const mount = region(algebra, '<SimplifyPanel', '/>', 'the Step Algebra Simplify panel');
  assert.match(mount, /nameSlips=\{verdictsShown\}/);

  const relation = executableSource(read('src/MultiRelationAlgebraCore.jsx'));
  const relationMount = region(relation, '<SimplifyPanel', '/>', 'the relation workspace Simplify panel');
  assert.doesNotMatch(relationMount, /nameSlips/);
});

test('the "Check my simplification" box after a balanced move names no slip (its arithmetic is usually the answer)', () => {
  const algebra = executableSource(read('src/StepByStepAlgebraCore.jsx'));
  const check = region(algebra, 'const checkSimplifications', 'const expressionRectForSide', 'checkSimplifications');
  // The region is the check itself: it compares the boxes and names the side.
  assert.match(check, /expressionsEquivalent\(simplificationAnswers\[target\.side\]/);
  assert.doesNotMatch(check, /regionRewriteSlip|SIMPLIFY_SLIPS|simplifyMessage/);
});
