/*
 * FOLLOW-THROUGH GRADING (SP-3; docs/platform/SHOWING_THE_PROCESS.md section 4).
 *
 * A later part names the earlier part it builds on:
 *
 *   { "id": "slope", "label": "Slope of the boundary line", "answer": "-2" },
 *   { "id": "inequality", "label": "Using your slope of {slope}, write the inequality",
 *     "followThrough": { "from": ["slope"], "answer": "y > {slope}x + 3" } }
 *
 * The later part is keyed to the student's own earlier value, so a slip on the
 * slope is marked wrong once, not twice. These tests hold that on every grader
 * a multi-part answer meets (tests/platform/helpers/followThroughFixtures.mjs):
 * the browser's, the server's over the checkpointed response, a secure Test,
 * Corrections and Path field item's, and the teacher's simulation — with one
 * verdict on all of them. The earlier part is still graded on its own answer.
 * A blank or unreadable earlier value grades the later part against its own
 * answer, and a question with no followThrough grades exactly as before.
 *
 * The label and the value's own rules are in followThroughParts.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clientCredit, clientGrade, fieldItem, inequalityQuestion, lineQuestion, minusItem, minusQuestion, secureGrade, secureScore,
  serverCredit, serverGrade, setItem, setQuestion, simulatorGrade, simulatorScore,
} from './helpers/followThroughFixtures.mjs';

const everyGrader = async (answers) => ({
  client: clientGrade(inequalityQuestion, answers),
  server: serverGrade(inequalityQuestion, answers),
  secure: await secureGrade(fieldItem, answers),
  simulation: simulatorGrade(fieldItem, answers),
});
const assertEveryGrader = async (answers, expected) => {
  const graded = await everyGrader(answers);
  Object.entries(graded).forEach(([grader, verdict]) => assert.deepEqual(verdict, expected, `${grader}: ${JSON.stringify(answers)}`));
};

test('a slip on the slope, with the right inequality for that slope: the slope is wrong, the inequality right, on every grader', async () => {
  await assertEveryGrader({ slope: '-3', inequality: 'y > -3x + 3' }, { slope: false, inequality: true });
  // Written another way the part's own comparison takes.
  await assertEveryGrader({ slope: '-3', inequality: '-3x+3<y' }, { slope: false, inequality: true });
});

test('both parts right: both right', async () => {
  await assertEveryGrader({ slope: '-2', inequality: 'y > -2x + 3' }, { slope: true, inequality: true });
});

test('a wrong inequality for the student\'s own slope is wrong', async () => {
  // Slope -3, then an inequality that uses neither -3 nor the key's -2 rightly.
  for (const inequality of ['y > 3x + 3', 'y > -3x - 3', 'y < -3x + 3', 'y >= -3x + 3']) {
    await assertEveryGrader({ slope: '-3', inequality }, { slope: false, inequality: false });
  }
});

test('the part\'s own answer is still right after a slip: a right answer is never marked wrong', async () => {
  await assertEveryGrader({ slope: '-3', inequality: 'y > -2x + 3' }, { slope: false, inequality: true });
});

test('a negative, a fraction and a root slope are written in as mathematics and graded as the student writes them', async () => {
  await assertEveryGrader({ slope: '-\\frac{1}{2}', inequality: 'y>-\\frac{1}{2}x+3' }, { slope: false, inequality: true });
  await assertEveryGrader({ slope: '\\frac{1}{2}', inequality: 'y>\\frac{1}{2}x+3' }, { slope: false, inequality: true });
  // A root is one term: keyed as \sqrt{2}x, as the student writes it.
  await assertEveryGrader({ slope: '\\sqrt{2}', inequality: 'y>\\sqrt{2}x+3' }, { slope: false, inequality: true });
  await assertEveryGrader({ slope: '\\sqrt{2}', inequality: 'y > 2x + 3' }, { slope: false, inequality: false });
  await assertEveryGrader({ slope: '-4', inequality: 'y > -4x + 3' }, { slope: false, inequality: true });
  // Brackets keep the sign: slope -4 is not "y > x - 4 + 3" or "y > 4x + 3".
  await assertEveryGrader({ slope: '-4', inequality: 'y > 4x + 3' }, { slope: false, inequality: false });
});

test('a blank or unreadable earlier value grades the later part against its own answer, as without followThrough', async () => {
  for (const slope of ['', '   ', 'x = 2', 'y > 3', 'hello', '\\text{-3}', '2 +', '{slope}', '(1', '1,000', '\\placeholder{}']) {
    const own = await everyGrader({ slope, inequality: 'y > -2x + 3' });
    const keyedToIt = await everyGrader({ slope, inequality: `y > ${slope}x + 3` });
    ['client', 'server', 'secure', 'simulation'].forEach((grader) => {
      assert.equal(own[grader].inequality, true, `${grader}: the part's own answer, after ${JSON.stringify(slope)}`);
      assert.equal(keyedToIt[grader].inequality, false, `${grader}: no key is built from ${JSON.stringify(slope)}`);
    });
  }
});

test('two earlier parts: the guide\'s equation is keyed to the student\'s slope and intercept', () => {
  // Slope slipped to 4; the equation follows it, the intercept's -2 in brackets.
  const slipped = { slope: '4', intercept: '-2', equation: 'y = 4x - 2' };
  assert.deepEqual(clientGrade(lineQuestion, slipped), { slope: false, intercept: true, equation: true });
  assert.deepEqual(serverGrade(lineQuestion, slipped), { slope: false, intercept: true, equation: true });
  // Both slipped, and followed.
  const both = { slope: '4', intercept: '5', equation: 'y = 4x + 5' };
  assert.deepEqual(clientGrade(lineQuestion, both), { slope: false, intercept: false, equation: true });
  assert.deepEqual(serverGrade(lineQuestion, both), { slope: false, intercept: false, equation: true });
  // An equation that follows neither the student's values nor the key's.
  const wrong = { slope: '4', intercept: '-2', equation: 'y = 4x + 2' };
  assert.deepEqual(clientGrade(lineQuestion, wrong), { slope: false, intercept: true, equation: false });
  assert.deepEqual(serverGrade(lineQuestion, wrong), { slope: false, intercept: true, equation: false });
  // One of the two blank: the key is not built, and the part's own answer grades it.
  const blank = { slope: '4', intercept: '', equation: 'y = 4x - 2' };
  assert.deepEqual(clientGrade(lineQuestion, blank), { slope: false, intercept: false, equation: false });
});

test('the browser, the server, the secure item and the simulation agree on every input', async () => {
  const slopes = ['-2', '-3', '3', '0', '\\frac{1}{2}', '-\\frac{1}{2}', '1/2', '2.5', 'a+b', '', 'hello', 'x=2', '-', '-\\sqrt{2}', '2\\sqrt{2}'];
  const inequalities = ['y > -\\sqrt{2}x + 3', 'y>2\\sqrt{2}x+3', 'y > -2x + 3', 'y > -3x + 3', 'y>3x+3', 'y > 0x + 3', 'y > 3', 'y>\\frac{1}{2}x+3', 'y>-\\frac{1}{2}x+3',
    'y > 2.5x + 3', 'y > (a+b)x + 3', 'y < -2x + 3', 'y >= -3x + 3', ''];
  const plain = structuredClone(inequalityQuestion);
  plain.answerFields.forEach((field) => { delete field.followThrough; });
  let followed = 0;
  for (const slope of slopes) {
    for (const inequality of inequalities) {
      const answers = { slope, inequality };
      const client = clientGrade(inequalityQuestion, answers);
      const label = JSON.stringify(answers);
      assert.deepEqual(serverGrade(inequalityQuestion, answers), client, `server: ${label}`);
      // A secure item's slope box is a number box: the inequality is what
      // follow-through changes, and is compared on each.
      assert.equal((await secureGrade(fieldItem, answers)).inequality, client.inequality, `secure: ${label}`);
      assert.equal(simulatorGrade(fieldItem, answers).inequality, client.inequality, `simulation: ${label}`);
      // Right only because it follows the student's slope.
      if (client.inequality && !clientGrade(plain, answers).inequality) followed += 1;
    }
  }
  // Not vacuous: the corpus holds verdicts follow-through decides.
  assert.ok(followed >= 6, `${followed} followed-through verdicts`);
});

test('nothing changes without followThrough: the same question with none grades against its own answer', async () => {
  const plain = structuredClone(inequalityQuestion);
  plain.answerFields.forEach((field) => { delete field.followThrough; });
  assert.deepEqual(clientGrade(plain, { slope: '-3', inequality: 'y > -3x + 3' }), { slope: false, inequality: false });
  assert.deepEqual(serverGrade(plain, { slope: '-3', inequality: 'y > -3x + 3' }), { slope: false, inequality: false });
  assert.deepEqual(clientGrade(plain, { slope: '-2', inequality: 'y > -2x + 3' }), { slope: true, inequality: true });
  const plainItem = structuredClone(fieldItem);
  plainItem.responseFields.forEach((field) => { delete field.followThrough; });
  assert.deepEqual(await secureGrade(plainItem, { slope: '-3', inequality: 'y > -3x + 3' }), { slope: false, inequality: false });
  assert.deepEqual(simulatorGrade(plainItem, { slope: '-3', inequality: 'y > -3x + 3' }), { slope: false, inequality: false });
});

// ---------------------------------------------------------------- PR #601 review

// Any question and its secure/Path twin, on all four graders.
const assertOnEvery = async (question, item, answers, expected) => {
  const graded = {
    client: clientGrade(question, answers),
    server: serverGrade(question, answers),
    secure: await secureGrade(item, answers),
    simulation: simulatorGrade(item, answers),
  };
  Object.entries(graded).forEach(([grader, verdict]) => assert.deepEqual(verdict, expected, `${grader}: ${JSON.stringify(answers)}`));
};

test('a negative or compound root slope, written the ordinary way, is right; a wrong inequality for it is still wrong', async () => {
  for (const [slope, inequality] of [
    ['-\\sqrt{2}', 'y > -\\sqrt{2}x + 3'], ['2\\sqrt{2}', 'y > 2\\sqrt{2}x + 3'], ['-2\\sqrt{3}', 'y>-2\\sqrt{3}x+3'],
    ['-\\frac{1}{2}', 'y > -\\frac{1}{2}x + 3'], ['2\\sqrt{2}', 'y>2\\sqrt{2}x+3'],
  ]) {
    await assertOnEvery(inequalityQuestion, fieldItem, { slope, inequality }, { slope: false, inequality: true });
  }
  for (const [slope, inequality] of [
    ['-\\sqrt{2}', 'y > \\sqrt{2}x + 3'], ['-\\sqrt{2}', 'y > -\\sqrt{2}x - 3'], ['-\\sqrt{2}', 'y < -\\sqrt{2}x + 3'],
    ['2\\sqrt{2}', 'y > 2x + 3'], ['2\\sqrt{2}', 'y > \\sqrt{2}x + 3'], ['2\\sqrt{2}', 'y > -2\\sqrt{2}x + 3'],
  ]) {
    await assertOnEvery(inequalityQuestion, fieldItem, { slope, inequality }, { slope: false, inequality: false });
  }
});

test('3 - {slope}x with a negative slope is 3 - (-2)x, never 3 - -2x read another way', async () => {
  const right = { slope: false, inequality: true };
  const wrong = { slope: false, inequality: false };
  await assertOnEvery(minusQuestion, minusItem, { slope: '-2', inequality: 'y > 3 + 2x' }, right);
  await assertOnEvery(minusQuestion, minusItem, { slope: '-2', inequality: 'y > 3 - (-2)x' }, right);
  await assertOnEvery(minusQuestion, minusItem, { slope: '-2', inequality: 'y > 3 - 2x' }, wrong);
  await assertOnEvery(minusQuestion, minusItem, { slope: '-\\sqrt{2}', inequality: 'y > 3 + \\sqrt{2}x' }, right);
  await assertOnEvery(minusQuestion, minusItem, { slope: '-\\sqrt{2}', inequality: 'y > 3 - \\sqrt{2}x' }, wrong);
  // An unsigned root after the minus reads the same with or without brackets.
  await assertOnEvery(minusQuestion, minusItem, { slope: '2\\sqrt{2}', inequality: 'y > 3 - 2\\sqrt{2}x' }, right);
  await assertOnEvery(minusQuestion, minusItem, { slope: '2\\sqrt{2}', inequality: 'y > 3 + 2\\sqrt{2}x' }, wrong);
  // The part's own answer is still right.
  await assertOnEvery(minusQuestion, minusItem, { slope: '-2', inequality: 'y > 3 - 4x' }, right);
});

test('a numeric set marked element by element takes the better of its own set and the keyed one', async () => {
  // Authored {2, 3}, followThrough { {n}, 3 }, the student's n is 5.
  const plain = { ...setQuestion, answerFields: setQuestion.answerFields.map(({ followThrough: _builds, ...own }) => own) };
  const cases = [['{2, 3}', 1], ['{5, 3}', 1], ['{2}', clientCredit(plain, { n: '5', set: '{2}' }, 'set')], ['{5}', 0.5], ['{3}', 0.5], ['{7}', 0]];
  assert.equal(cases[2][1], 0.5, 'main gives {2} half credit');
  for (const [set, credit] of cases) {
    const answers = { n: '5', set };
    assert.equal(clientCredit(setQuestion, answers, 'set'), credit, `browser: ${set}`);
    assert.equal(serverCredit(setQuestion, answers, 'set'), credit, `server: ${set}`);
    // The item's score: n (5, wrong) earns 0 of its weight, so the score is half the set's credit.
    assert.equal(await secureScore(setItem, answers), credit / 2, `secure/Path: ${set}`);
    assert.equal(simulatorScore(setItem, answers), credit / 2, `simulation: ${set}`);
  }
  // A whole right set is marked right on every grader, the authored one included.
  for (const set of ['{2, 3}', '{3, 5}']) {
    await assertOnEvery(setQuestion, setItem, { n: '5', set }, { n: false, set: true });
  }
});
