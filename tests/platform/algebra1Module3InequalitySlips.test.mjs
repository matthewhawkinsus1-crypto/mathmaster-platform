/*
 * ALGEBRA I M3 T2 LESSONS 4 AND 5: THE PREDICTABLE SLIPS IN A "WRITE THE
 * INEQUALITY" BOX, NAMED ON A MISS (PR #537 walkthrough,
 * F-NO-MISCONCEPTION-FEEDBACK, as algebra2HonorsRadicalsSlips.test.mjs holds
 * the radicals lessons').
 *
 * A wrong inequality box got "Not quite…" and nothing more, though its slips
 * are predictable. Every box that asks for an inequality now names them,
 * through authored `misconceptions` entries with `match` and `field`, read in
 * that box only, by its own grader (slipMade, attemptFeedbackPlan.js):
 *   - the symbol turned the wrong way ("The symbol points the wrong way. Pick
 *     a point in the shaded region: it should make your inequality true.");
 *   - < for ≤ (a dashed line for a solid one), and ≤ for <;
 *   - a wrong sign on the y-intercept, where the line is read from a graph, a
 *     table or two points;
 *   - and two slips an item's own common error names: y − 2x for "twice the
 *     first minus the second", and the treadmill's rates for Emma's.
 * This holds that:
 *   - every inequality box, in every generated version, names the first two
 *     when they are typed there, and every box that reads a line names the
 *     third;
 *   - each slip names a typed box of its own item, at most six to an item
 *     (the support keeps six; an item with three or four boxes names all its
 *     wrong symbols in one sentence per box);
 *   - in every version each slip is wrong in its box and, typed there, is
 *     named; a right answer never is, in any spelling;
 *   - no sentence said on a miss states an answer;
 *   - on an Exit Ticket nothing is said while its outcome is withheld.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGEBRA1_M3_INEQUALITY_LESSONS } from '../../scripts/content/build-algebra1-m3-inequalities.mjs';
import { compiled, readRepoFile, versionsOf } from './helpers/lessonFileChecks.mjs';
import { answersStated } from './helpers/inequalityAnswersStated.mjs';
import { feedbackOpenForItem, missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { getEffectiveActivityPolicy } from '../../functions/shared/activityPolicies.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';

const lessons = ALGEBRA1_M3_INEQUALITY_LESSONS.map((entry) => ({ entry, questions: compiled(readRepoFile(entry.file)).questions }));
const allQuestions = () => lessons.flatMap(({ questions }) => questions);
const withSlips = () => allQuestions().filter((question) => (question.misconceptions || []).length);
const isInequalityBox = (field) => field.type !== 'choice' && field.inputProfile === 'inequality';
const field = (question, id) => question.answerFields.find((candidate) => candidate.id === id);
const keyOf = (question) => Object.fromEntries(question.answerFields.map((candidate) => [candidate.id, String(candidate.answer)]));
/** What the student is told under "Not quite", for these answers to this version. */
const saidFor = (question, responses) => {
  const { parts } = gradeMultiAnswerResponse(question, { ...keyOf(question), ...responses });
  const said = missFeedback({ question, parts });
  return said?.source === 'authored-misconception' ? said.message : null;
};

// The slips, written from a key here, apart from the lesson modules' own.
const FLIP = Object.freeze({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' });
const TOGGLE = Object.freeze({ '<': '<=', '<=': '<', '>': '>=', '>=': '>' });
const relationOf = (key) => String(key).match(/<=|>=|<|>/)[0];
const withRelation = (key, table) => String(key).replace(/<=|>=|<|>/, (relation) => table[relation]);
/** The key read from its other side: y > 1/2x − 3 as 1/2x − 3 < y. A right answer. */
const readBackwards = (key) => {
  const [left, relation, right] = String(key).split(/(<=|>=|<|>)/);
  return `${right.trim()} ${FLIP[relation]} ${left.trim()}`;
};
/** The key with the sign of its constant term changed: y > 4x + 2 as y > 4x − 2, x < 3 as x < −3. */
const otherConstantSign = (key) => {
  const [left, relation, right] = String(key).split(/(<=|>=|<|>)/);
  const term = /^(.*\S)\s*([+-])\s*(\d+(?:\.\d+)?)$/.exec(right.trim());
  if (term) return `${left}${relation} ${term[1]} ${term[2] === '+' ? '-' : '+'} ${term[3]}`;
  const alone = /^(-?)(\d+(?:\.\d+)?)$/.exec(right.trim());
  return `${left}${relation} ${alone[1] ? '' : '-'}${alone[2]}`;
};

/* ---------------------------------------------------- the boxes and slips */

test('every inequality box names the symbol turned the wrong way and the line style swapped, in every version', () => {
  const problems = new Set();
  let boxes = 0;
  allQuestions().filter((question) => (question.answerFields || []).some(isInequalityBox)).forEach((question) => versionsOf(question).forEach((version) => {
    version.answerFields.filter(isInequalityBox).forEach((box) => {
      boxes += 1;
      const key = String(box.answer);
      [['turned the wrong way', withRelation(key, FLIP)], ['with the line style swapped', withRelation(key, TOGGLE)]].forEach(([what, typed]) => {
        if (saidFor(version, { [box.id]: typed }) === null) problems.add(`${version.questionId} ${box.id}: ${typed} (${what}) is not named`);
      });
    });
  }));
  assert.deepEqual([...problems], []);
  assert.ok(boxes >= 550, `${boxes} boxes read`);
});

/*
 * The boxes that read a line from what the student sees, a graph, a table
 * or two points, and not from an inequality printed in the problem.
 */
const READ_A_LINE = Object.freeze({
  'Lesson 4': ['cw-12 inequality', 'cw-13 a', 'cw-13 b', 'cw-13 c', 'cw-14 inequality', 'p-6 a', 'p-6 b', 'p-10 graphed', 'p-12 inequality', 'p-15 inequality', 'p-16 slopeIntercept'],
  'Lesson 5': ['p-10 solid', 'p-10 dashed'],
});

test('every box that reads a line from a graph, a table or two points names a wrong sign on its y-intercept', () => {
  const problems = [];
  let named = 0;
  lessons.forEach(({ entry, questions }) => {
    const lesson = entry.lesson.assignment.folder.split('/').pop();
    const prefix = questions[0].questionId.replace(/-wu-1$/, '');
    READ_A_LINE[lesson].map((box) => box.split(' ')).forEach(([item, id]) => {
      const question = questions.find((candidate) => candidate.questionId === `${prefix}-${item}`);
      if (!question) return; // Honors-only items (p-15, p-16) are not in the regular file.
      versionsOf(question).forEach((version) => {
        const typed = otherConstantSign(field(version, id).answer);
        if (saidFor(version, { [id]: typed }) === null) problems.push(`${version.questionId} ${id}: ${typed} is not named`);
        else named += 1;
      });
    });
  });
  assert.deepEqual(problems, []);
  assert.equal(named, 9 + 11 + 2 + 2, 'nine boxes in the regular Lesson 4, eleven in its Honors file, two in each Lesson 5');
});

test('every slip names a typed box of its own item, with at most six to an item', () => {
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
  assert.deepEqual(counts, {
    'T2_L4_Graphing_Inequalities_in_Two_Variables.json': 47,
    'T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json': 57,
    'T2_L5_Systems_of_Linear_Inequalities.json': 33,
    'T2_L5_Systems_of_Linear_Inequalities_Honors.json': 35,
  });
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
    // The key read from its other side is right, and so never a slip.
    version.answerFields.filter(isInequalityBox).forEach((box) => {
      const backwards = readBackwards(box.answer);
      if (!matchesFieldAnswer(backwards, box)) problems.push(`${version.questionId} ${box.id}: ${backwards} is refused`);
      else if (saidFor(version, { [box.id]: backwards }) !== null) problems.push(`${version.questionId} ${box.id}: the right answer ${backwards} is called a slip`);
    });
  }));
  assert.deepEqual(problems, []);
  assert.ok(checked >= 1700, `${checked} slips checked`);
});

// As MathLive writes what a student types (\le, \ge, \frac), in items whose
// numbers are the same for every student, with what each one should hear.
const TYPED = [
  ['m3t2l4-cw-5', 'atLeast', '2x+3y\\le20', '"At least 20" means 20 or more, and 20 itself counts.'],
  ['m3t2l4-cw-7', 'c', '2y\\ge x-6', 'The line is right, so check the symbol: is graph c’s line solid or dashed, and which side is shaded?'],
  ['m3t2l4-cw-12', 'inequality', 'y>-\\frac{3}{2}x-5', 'The line is solid, so the points on it are solutions: your symbol should include them.'],
  ['m3t2l4-cw-13', 'b', 'y\\ge\\frac{1}{2}x+3', 'Check the sign of the y-intercept: does the line cross the y-axis above or below the origin?'],
  ['m3t2l4-cw-17', 'lt0', 'x+y\\le0', 'This set leaves the line out, so your symbol should leave it out too.'],
  ['m3t2l4-p-6', 'b', 'y\\ge2', 'Check the sign: is the line above or below the x-axis?'],
  ['m3t2l4-p-8', 'b', 'y-2x>4', 'Check the order: start from twice the first number, then subtract the second.'],
  ['m3t2l4-p-10', 'graphed', 'y<-2x+1', 'That is the inequality Marcus meant to graph. His line is solid, so it shows a symbol that includes the line.'],
  ['m3t2l4-p-12', 'inequality', '-2x+4\\ge y', 'The symbol points the wrong way: (0, 0) is not shaded, so it should make your inequality false.'],
  ['m3t2l4h-p-14', 'k', 'k\\le2', 'At k = 2 the point is on the boundary, and > leaves the boundary out.'],
  ['m3t2l4h-p-16', 'slopeIntercept', 'y>\\frac{3}{4}x-3', 'Dividing both sides by −4 reverses the symbol.'],
  ['m3t2l5-cw-1', 'weight', '200x+100y\\ge800', 'The raft holds at most 800 pounds: the weight can be 800 pounds or less.'],
  ['m3t2l5-cw-9', 'calories', '7.6x+12.4y\\ge400', 'Emma uses the stair stepper: use its two rows of the table.'],
  ['m3t2l5-cw-15', 'c2', 'y>10-3x', 'Read "10 − 3x > y" from y’s side: which side is greater?'],
  ['m3t2l5-p-7', 'fixed', 'y<2x-4', 'That is the inequality as it was: its boundary is dashed, so (3, 2) is still left out.'],
  ['m3t2l5-p-10', 'dashed', 'y\\le-x+5', 'The line is dashed, so the points on it are not solutions: your symbol should leave them out.'],
  ['m3t2l5h-p-11', 'k', 'k<3', 'At k = 3 the two boundaries are the same solid line, and its points solve the system.'],
];

test('typed as MathLive spells it, each slip is named', () => {
  const questions = withSlips();
  TYPED.forEach(([questionId, box, typed, message]) => {
    const [question] = versionsOf(questions.find((candidate) => candidate.questionId === questionId), 1);
    assert.equal(saidFor(question, { [box]: typed }), message, `${questionId} ${box}: ${typed}`);
  });
});

test('no sentence said on a miss states an answer, in any version', () => {
  const problems = new Set();
  withSlips().forEach((question) => versionsOf(question).forEach((version) => version.misconceptions.forEach((slip) => {
    const stated = answersStated(slip.message, version);
    if (stated.length) problems.add(`${version.questionId} ${slip.field} ("${slip.message}") states ${stated.join('; ')}`);
  })));
  assert.deepEqual([...problems], []);
});

/* -------------------------------------------------------- the Exit Ticket */

test('on an Exit Ticket nothing is said while its outcome is withheld; its Practice twin says it at once', () => {
  // QuestionEngine works out the sentence only inside the gate (its wiring is
  // held by feedbackThatTeaches.test.mjs and algebra2HonorsRadicalsSlips.test.mjs);
  // this is the gate as it opens for each role's policy.
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
  assert.deepEqual(exitTickets.map((question) => question.questionId), ['m3t2l4-dol-3', 'm3t2l4h-dol-3', 'm3t2l5-dol-3', 'm3t2l5h-dol-3']);
  exitTickets.forEach((question) => {
    const [version] = versionsOf(question, 1);
    const slip = version.misconceptions[0];
    // The sentence is there to say: it is the gate that keeps it back.
    assert.equal(saidFor(version, { [slip.field]: String(slip.match[0]) }), slip.message);
    assert.equal(open('dol', { closed: false }), false, `${question.questionId}: while it can be answered`);
    assert.equal(open('dol', { closed: true, perItemRelease: true }), false, `${question.questionId}: after its one try`);
    assert.equal(open('dol', { closed: true, perItemRelease: true, teacherRelease: true }), true, 'once the teacher releases feedback');
  });
  // The Practice items that model a situation the same way (L4 PR 4, L5 PR 4)
  // name the same kind of slip while tries are left.
  ['m3t2l4-p-4', 'm3t2l5-p-4'].forEach((questionId) => {
    const [version] = versionsOf(withSlips().find((question) => question.questionId === questionId), 1);
    const slip = version.misconceptions[0];
    assert.equal(open('practice', { closed: false }), true);
    assert.equal(saidFor(version, { [slip.field]: String(slip.match[0]) }), slip.message);
    assert.equal(relationOf(slip.match[0]) !== relationOf(field(version, slip.field).answer), true, 'a symbol slip');
  });
});

/*
 * A slip names a wrong answer. L5 PR 7 asked to "change only the second symbol
 * so that its boundary is included and (3, 2) becomes a solution": y ≥ 2x − 4
 * does both, but the key is y ≤ 2x − 4 and a slip called y ≥ 2x − 4 turned
 * round (2026-11-06 walkthrough). The prompt names the condition the key
 * keeps, the side the inequality shades, so the symbols that meet the prompt
 * are exactly the symbols the box takes.
 */
test('L5 PR 7: the symbols the prompt allows are the symbols the box takes', () => {
  const items = allQuestions().filter((question) => /^m3t2l5h?-p-7$/.test(question.questionId));
  assert.equal(items.length, 2, 'the regular and the Honors item');
  items.forEach((question) => {
    const box = field(question, 'fixed');
    const keepsTheSide = /keeping the side it shades/.test(question.prompt);
    const point = { x: 3, y: 2 };
    ['<', '<=', '>', '>='].forEach((relation) => {
      const candidate = `y ${relation} 2x - 4`;
      const bound = 2 * point.x - 4;
      const solves = { '<': point.y < bound, '<=': point.y <= bound, '>': point.y > bound, '>=': point.y >= bound }[relation];
      // The system's second inequality, y < 2x − 4, shades below its line.
      const meets = relation.includes('=') && solves && (!keepsTheSide || relation.startsWith('<'));
      assert.equal(matchesFieldAnswer(candidate, box), meets, `${question.questionId}: ${candidate} ${meets ? 'meets' : 'does not meet'} the prompt`);
    });
  });
});
