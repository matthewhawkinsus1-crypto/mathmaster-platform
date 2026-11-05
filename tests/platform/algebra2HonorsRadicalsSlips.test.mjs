/*
 * ALGEBRA II HONORS RADICALS: THE PREDICTABLE SLIPS, NAMED ON A MISS
 * (PR #537 walkthrough, F-NO-MISCONCEPTION-FEEDBACK).
 *
 * A wrong box got "Not quite… Focus on: …" and nothing more, though the
 * radical slips are predictable. Each lesson now names them through the
 * platform's authored misconception feedback (missFeedback,
 * attemptFeedbackPlan.js), one sentence for one wrong answer in one box:
 *   - missing bars: 2xy² for 2|x|y², "Your answer is right when x ≥ 0. Try x = −1.";
 *   - the sign of an odd power: (−6)³ written as 216;
 *   - an even power of a negative: (−3)⁴ written as −81;
 *   - and the slips each item's own common error names, where the value
 *     typed shows them.
 * This holds that:
 *   - a slip is read only in its own box, by that box's grader, and only when
 *     that box is wrong: a right answer is never a slip, even where it is
 *     another box's (216 is right in the box above (−6)³);
 *   - every slip, in every generated version, is a wrong answer in its box,
 *     and typed there (as written, or as MathLive spells it) it is named;
 *   - no sentence states a box's answer;
 *   - on an Exit Ticket nothing is said while its outcome is withheld.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALGEBRA2_HONORS_RADICALS_LESSONS } from '../../scripts/content/build-algebra2-honors-radicals.mjs';
import { compiled, readRepoFile, versionsOf } from './helpers/lessonFileChecks.mjs';
import { boxesStated } from './helpers/boxesStated.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { feedbackOpenForItem, missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { getEffectiveActivityPolicy } from '../../functions/shared/activityPolicies.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';

const lessons = ALGEBRA2_HONORS_RADICALS_LESSONS.map((entry) => ({ entry, questions: compiled(readRepoFile(entry.file)).questions }));
const withSlips = () => lessons.flatMap(({ questions }) => questions.filter((question) => (question.misconceptions || []).length));
const field = (question, id) => question.answerFields.find((candidate) => candidate.id === id);
const keyOf = (question) => Object.fromEntries(question.answerFields.map((candidate) => [candidate.id, String(candidate.answer)]));
/** What the student is told under "Not quite", for these answers to this version. */
const saidFor = (question, responses) => {
  const { parts } = gradeMultiAnswerResponse(question, { ...keyOf(question), ...responses });
  const said = missFeedback({ question, parts });
  return said?.source === 'authored-misconception' ? said.message : null;
};

/* ------------------------------------------------- the platform's reading */

test('a slip is read in its own box, by that box\'s grader, and never when the box is right', () => {
  const powers = {
    type: 'multiAnswer',
    answerFields: [
      { id: 'cube', label: '(6)³ =', answer: '216', inputProfile: 'number' },
      { id: 'negativeCube', label: '(−6)³ =', answer: '-216', inputProfile: 'number' },
      { id: 'square', label: '(6)² =', answer: '36', inputProfile: 'number' },
    ],
    misconceptions: [{ field: 'negativeCube', match: ['216'], message: 'A negative number cubed is negative.' }],
  };
  assert.equal(saidFor(powers, { negativeCube: '216' }), 'A negative number cubed is negative.');
  assert.equal(saidFor(powers, {}), null, 'every box right: nothing');
  assert.equal(saidFor(powers, { square: '35' }), null, 'the 216 typed, and right, in the box above is not the slip');
  assert.equal(saidFor(powers, { square: '216' }), null, 'nor is the same value in another wrong box');

  // By the box's grader: the slip as a student types it in any spelling the
  // grader reads as the same answer; another wrong answer is not the slip.
  const bars = {
    type: 'multiAnswer',
    answerFields: [{ id: 'mixed', label: '⁴√(16x⁴y⁸) =', answer: '2|x|y^2', inputProfile: 'expression', gradingMode: 'simplestRadicalForm' }],
    misconceptions: [{ field: 'mixed', match: ['2xy^2'], message: 'Your answer is right when x ≥ 0. Try x = −1.' }],
  };
  ['2xy^{2}', '2x y^2', 'y^2\\cdot 2x', '2x\\left|y^{2}\\right|'].forEach((typed) => (
    assert.equal(saidFor(bars, { mixed: typed }), 'Your answer is right when x ≥ 0. Try x = −1.', typed)));
  ['2\\left|x\\right|y^{2}', '-2xy^{2}', '2|x|y^4'].forEach((typed) => assert.equal(saidFor(bars, { mixed: typed }), null, typed));

  // Both ways: read as a key, a slip with no bars samples its letters positive
  // only, so |x| would "be" the slip x. It is not.
  const square = {
    type: 'multiAnswer',
    answerFields: [{ id: 'twelve', label: '⁶√(x¹²) =', answer: 'x^2', inputProfile: 'expression', gradingMode: 'simplestRadicalForm' }],
    misconceptions: [{ field: 'twelve', match: ['x'], message: 'Check the exponent.' }],
  };
  assert.equal(saidFor(square, { twelve: 'x' }), 'Check the exponent.');
  assert.equal(saidFor(square, { twelve: '\\left|x\\right|' }), null);

  // A slip that names no box is read as before, as text, in a wrong box only.
  const plain = { misconceptions: [{ match: ['16'], message: 'It looks like 4 was added.' }] };
  assert.equal(missFeedback({ question: plain, parts: [{ response: '16' }] })?.message, 'It looks like 4 was added.');
  assert.equal(missFeedback({ question: plain, parts: [{ response: '16', isCorrect: true }] }), null);

  // The box travels with the slip; an entry that names none is as it was.
  assert.deepEqual(buildPrivateSupport({ misconceptions: [{ field: 'mixed', match: '2xy^2', message: 'M' }] }).misconceptions, [{ match: ['2xy^2'], message: 'M', field: 'mixed' }]);
  assert.deepEqual(buildPrivateSupport({ misconceptions: [{ match: ['16'], message: 'M' }] }).misconceptions, [{ match: ['16'], message: 'M' }]);
});

/* ---------------------------------------------------------- the lessons */

test('every slip names a box of its own item, with at most six to an item, and the walkthrough\'s three are there', () => {
  const problems = [];
  const counts = {};
  lessons.forEach(({ entry, questions }) => {
    counts[entry.file.split('/').pop()] = questions.reduce((sum, question) => sum + (question.misconceptions || []).length, 0);
    questions.filter((question) => (question.misconceptions || []).length).forEach((question) => {
      if (question.misconceptions.length > 6) problems.push(`${question.questionId}: more than the six the support keeps`);
      question.misconceptions.forEach((slip) => {
        const box = field(question, slip.field);
        if (!box || box.type === 'choice') problems.push(`${question.questionId}: "${slip.field}" is not one of its typed boxes`);
        if (!slip.match.length || !String(slip.message).trim()) problems.push(`${question.questionId} ${slip.field}: no slip or no sentence`);
      });
    });
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(counts, { 'L1_nth_Roots.json': 31, 'L2_Operations_with_Radical_Expressions.json': 13, 'L3_Rational_Exponents.json': 15 });
  const named = (questionId, box) => withSlips().find((question) => question.questionId === questionId)?.misconceptions.find((slip) => slip.field === box);
  assert.deepEqual(named('a2r1-cw-7', 'mixed'), { field: 'mixed', match: ['2xy^2'], message: 'Your answer is right when x ≥ 0. Try x = −1.' });
  assert.deepEqual(named('a2r1-wu-1', 'negativeCube').match, ['{{c3}}'], 'the sign of an odd power: (−c)³ written as c³');
  assert.deepEqual(named('a2r1-wu-1', 'negativeFourth').match, ['-{{d4}}'], 'an even power of a negative: (−d)⁴ written as −d⁴');
});

test('in every generated version each slip is wrong in its box and, typed there, is named; a right answer never is', () => {
  const problems = [];
  let checked = 0;
  withSlips().forEach((question) => versionsOf(question).forEach((version) => {
    if (saidFor(version, {}) !== null) problems.push(`${version.questionId}: its own key is called a slip`);
    version.misconceptions.forEach((slip) => slip.match.map(String).forEach((wrong) => {
      checked += 1;
      const box = field(version, slip.field);
      if (matchesFieldAnswer(wrong, box)) problems.push(`${version.questionId} ${slip.field}: the slip ${wrong} is right (key ${box.answer})`);
      if (saidFor(version, { [slip.field]: wrong }) !== slip.message) problems.push(`${version.questionId} ${slip.field}: ${wrong} is not named`);
    }));
  }));
  assert.deepEqual(problems, []);
  assert.ok(checked >= 700, `${checked} slips checked`);
});

// As MathLive writes what a student types (braces, \left|…\right|, \frac,
// \sqrt[n]{…}), in the items whose numbers are the same for every student.
const TYPED = [
  ['a2r1-cw-7', 'mixed', '2xy^{2}'],
  ['a2r1-cw-7', 'sixth', 't'],
  ['a2r1-cw-4', 'cyp', '\\left(a^{3}+2\\right)^{4}'],
  ['a2r1-cw-5', 'cyp', '\\pm2xy^{2}'],
  ['a2r1-cw-8', 'cyp', '\\left|2\\left(x+2\\right)^{5}\\right|'],
  ['a2r1-cw-10', 'simplified', '3x^{2}y^{5}z^{2}'],
  ['a2r1-cw-11', 'radicand', '26a^{2}'],
  ['a2r2-cw-12', 'second', '3x^{3}y^{4}\\sqrt[3]{y}'],
  ['a2r2-cw-3', 'second', '5b^{7}k^{5}\\sqrt[4]{k^{3}}'],
  ['a2r2-cw-5', 'perfectCube', '81x^{2}'],
  ['a2r2-p-9', 'correct', '5\\sqrt{x}'],
  ['a2r2-p-12', 'multiplier1', '\\sqrt[3]{4}'],
  ['a2r3-cw-2', 'c', '\\frac{4r^{4}}{s^{9}}'],
  ['a2r3-cw-3', 'a7', '\\sqrt{a^{7}}'],
  ['a2r3-cw-4', 'value49', '-\\frac{1}{7}'],
  ['a2r3-cw-9', 'simplified', '\\frac{y+1}{y-1}'],
  ['a2r3-p-9', 'product', '\\sqrt[3]{x^{2}}'],
];

test('typed as MathLive spells it, each slip is named', () => {
  const questions = withSlips();
  TYPED.forEach(([questionId, box, typed]) => {
    const [question] = versionsOf(questions.find((candidate) => candidate.questionId === questionId), 1);
    const slip = question.misconceptions.find((candidate) => candidate.field === box);
    assert.equal(saidFor(question, { [box]: typed }), slip.message, `${questionId} ${box}: ${typed}`);
  });
});

test('no sentence said on a miss states a box\'s answer, in any version', () => {
  const problems = new Set();
  withSlips().forEach((question) => versionsOf(question).forEach((version) => version.misconceptions.forEach((slip) => {
    const stated = boxesStated(slip.message, version);
    if (stated.length) problems.add(`${version.questionId} ${slip.field} ("${slip.message}") states ${stated.join(', ')}`);
  })));
  assert.deepEqual([...problems], []);
});

/* -------------------------------------------------------- the Exit Ticket */

test('on an Exit Ticket nothing is said while its outcome is withheld; its Practice twin says it at once', () => {
  // QuestionEngine works out the sentence only inside the gate: missDetail
  // returns null unless feedbackOpen, and only then calls missFeedback
  // (feedbackThatTeaches.test.mjs holds the gate's own wiring).
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  const detail = region(engine, 'const missDetail = useMemo(() => {', '}, [', 'the miss detail');
  assert.ok(detail.indexOf('!feedbackOpen) return null;') !== -1 && detail.indexOf('!feedbackOpen) return null;') < detail.indexOf('return missFeedback({'));
  assert.equal((engine.match(/\bmissFeedback\(/g) || []).length, 1, 'missFeedback is called in that one place');

  // The gate as QuestionEngine opens it, for a role's policy. After its one
  // try an Exit Ticket item is closed and shows right or wrong (App releases
  // that per item), but its review waits for the teacher's release.
  const open = (role, { closed, perItemRelease = false, teacherRelease = false }) => {
    const policy = getEffectiveActivityPolicy(role);
    return feedbackOpenForItem({
      showOutcomeFeedback: policy.feedback === 'immediate' || perItemRelease || teacherRelease,
      immediateFeedback: policy.feedback === 'immediate',
      closed,
      assessmentReleased: teacherRelease,
      roleKnown: true,
    });
  };
  const exitTickets = withSlips().filter((question) => question.sectionId === 'dol');
  assert.deepEqual(exitTickets.map((question) => question.questionId), ['a2r1-dol-1', 'a2r1-dol-2']);
  exitTickets.forEach((question) => {
    const [version] = versionsOf(question, 1);
    const slip = version.misconceptions[0];
    // The sentence is there to say: it is the gate that keeps it back.
    assert.equal(saidFor(version, { [slip.field]: String(slip.match[0]) }), slip.message);
    assert.equal(open('dol', { closed: false }), false, `${question.questionId}: while it can be answered`);
    assert.equal(open('dol', { closed: true, perItemRelease: true }), false, `${question.questionId}: after its one try`);
    assert.equal(open('dol', { closed: true, perItemRelease: true, teacherRelease: true }), true, 'once the teacher releases feedback');
  });
  // The Practice twins (PR 3 and PR 2) name the same slip while attempts are left.
  ['a2r1-p-3', 'a2r1-p-2'].forEach((questionId) => {
    const [version] = versionsOf(withSlips().find((question) => question.questionId === questionId), 1);
    const slip = version.misconceptions[0];
    assert.equal(open('practice', { closed: false }), true);
    assert.equal(saidFor(version, { [slip.field]: String(slip.match[0]) }), slip.message);
  });
});
