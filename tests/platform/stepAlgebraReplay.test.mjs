/*
 * WE-C: THE STEP ALGEBRA REPLAY (docs/platform/WORKED_EXAMPLES.md sections 4,
 * 5 and 7; build plan row WE-C).
 *
 * A worked example for a Step Algebra question plays as the tool's own moves.
 * What these tests hold:
 *
 *   1. EVERY LINE IS THE ENGINE'S. Each line of a replayed move is what the
 *      board's own functions return for it (applyBalancedOperation,
 *      resolveEquationAfterMove, simplifyStudentExpression), called here
 *      directly and compared.
 *   2. A SCRIPT THAT DOES NOT REACH ITS ANSWER IS REFUSED: by the replay, by
 *      the compiler and by Pre-Flight, and such an example is never played.
 *   3. VARIABLES ON BOTH SIDES FIRST. The built-in moves collect the variable
 *      terms, then the numbers, then undo the coefficient, then check; an
 *      equation they do not cover keeps its family's text example.
 *   4. THE EXAMPLE A QUESTION GETS. A lesson's replay for the question that
 *      names it and for the next question on the skill; the family's sibling
 *      as a replay for a Step Algebra question with none; always a sibling.
 *   5. THE FADED HAND-OVER. The second Classwork question on a skill is shown
 *      the first moves only (`handOverAfter`), with no answer; on request the
 *      whole example plays.
 *   6. THE SCREEN. The player draws a move as the board's lines, each named
 *      in words, and Read aloud is given the move as a sentence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { asQuestionEngineReceivesIt } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from '../../src/platform/policies/activityPolicies.js';
import {
  applyBalancedOperation,
  equationToLatex,
  expressionToLatex,
  isSolvedEquation,
  parseEquationInput,
  simplifyStudentExpression,
} from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveEquationAfterMove } from '../../functions/shared/algebra/algebraSupportLevels.mjs';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import {
  EXAMPLE_FADED_TURN_TEXT,
  EXAMPLE_YOUR_TURN_TEXT,
  exampleSlides,
  slideReadingText,
  slideTurnText,
} from '../../src/platform/supports/workedExample/exampleSlides.js';
import {
  authoredReplay,
  exampleOpensByItself,
  exampleSectionRule,
  fadedExample,
  lessonExampleContext,
  workedExampleFor,
} from '../../src/platform/supports/workedExample/examplePlayer.js';
import {
  REPLAY_WHY,
  STEP_ALGEBRA_REPLAY_OPERATIONS,
  isStepAlgebraReplayEntry,
  replayStepAlgebra,
  stepAlgebraMovesFor,
  stepAlgebraReplayErrors,
} from '../../src/platform/supports/workedExample/stepAlgebraReplay.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const fixture = () => JSON.parse(read('tests/platform/fixtures/learningSupportsLessonFragment.json'));
const tidy = (latex) => latex.split('=').map((side) => side.trim()).join(' = ');

// The guide's example lesson, stored the way a published assignment is.
const storedLesson = (edit = (source) => source) => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify(edit(fixture())));
  return { id: 'lesson-1', ...canonicalV5PersistencePatch(parsed.assignmentV5) };
};
const lessonQuestions = (assignment) => getStoredAssignmentQuestions(assignment);
const indexOfQuestion = (questions, id) => questions.findIndex((question) => question.questionId === id);
const contextAt = (assignment, id, sectionRole) => {
  const questions = lessonQuestions(assignment);
  return lessonExampleContext({
    questions,
    index: indexOfQuestion(questions, id),
    sectionRole,
    roleOf: (question) => resolveQuestionActivityRole({ question, assignment }),
    lessonSupports: assignment.lessonSupports,
  });
};
const receivedAt = (assignment, id) => {
  const questions = lessonQuestions(assignment);
  return asQuestionEngineReceivesIt(questions[indexOfQuestion(questions, id)]);
};

const GUIDE_SCRIPT = [
  { op: 'subtract', operand: '2x', why: 'Collect the x-terms on one side.' },
  { op: 'subtract', operand: '3', why: 'Collect the numbers on the other side.' },
  { op: 'divide', operand: '3', why: 'Undo the multiplication by 3.' },
  { check: true, why: 'Put x = -4 back into both sides: each side is -17.' },
];
const GUIDE_EQUATION = '5x + 3 = 2x - 9';

// ----------------------------------------------- 1. every line is the engine's

test('each line of a replayed move is what the board\'s own engine returns for it', () => {
  for (const [equationText, script] of [
    [GUIDE_EQUATION, GUIDE_SCRIPT],
    ['4x - 7 = 9x + 8', [{ op: 'subtract', operand: '9x' }, { op: 'add', operand: 7 }, { op: 'divide', operand: -5 }]],
    ['7 = 2x + 1', [{ op: 'subtract', operand: '1' }, { op: 'divide', operand: '2' }]],
    ['x/3 + 17 = 37', [{ op: 'subtract', operand: '17' }, { op: 'multiply', operand: '3' }]],
  ]) {
    const replay = replayStepAlgebra({ sibling: { equation: equationText }, moves: script });
    assert.equal(replay.ok, true, `${equationText}: ${replay.error}`);
    // The same moves, made on the engine directly, as the board makes them.
    let equation = parseEquationInput({ equation: equationText });
    const operations = script.filter((move) => move.op);
    assert.equal(replay.moveCount, operations.length);
    operations.forEach((move, index) => {
      const board = replay.steps[index].board;
      const made = applyBalancedOperation({ equationState: equation, operation: move.op, operand: String(move.operand) });
      assert.equal(board.kind, 'move');
      assert.equal(board.operation, move.op);
      assert.equal(board.before, tidy(equationToLatex(equation)), `${equationText} move ${index + 1}: the line it starts from`);
      assert.equal(board.applied, `${made.unsimplifiedLatex.left.trim()} = ${made.unsimplifiedLatex.right.trim()}`, 'the operation on both sides is the engine\'s line');
      assert.deepEqual(board.cancels, made.requiredCancellationSides, 'what cancels is what the engine says cancels');
      const cancelled = resolveEquationAfterMove(made, 3, made.requiredCancellationSides);
      if (board.cancelled) assert.equal(board.cancelled, tidy(equationToLatex(cancelled)), 'the cancelled line is the engine\'s');
      // The next line is each side as the board's Simplify leaves it, or the side as it stands.
      const after = board.after.split(' = ');
      const chosen = ['left', 'right'].map((side, sideIndex) => {
        const forms = [cancelled[side], simplifyStudentExpression(cancelled[side], equation.variable)];
        const form = forms.find((expression) => expressionToLatex(expression).trim() === after[sideIndex]);
        assert.ok(form !== undefined, `${equationText} move ${index + 1}: "${after[sideIndex]}" is one of the engine's forms of that side`);
        return form;
      });
      assert.ok(replay.steps[index].show.endsWith(`$${board.after}$.`), 'the sentence ends on the engine\'s line');
      // The next move starts from the line this one ended on.
      equation = { ...cancelled, left: chosen[0], right: chosen[1] };
    });
  }
});

test('the guide\'s script plays to x = -4, cancels where the board cancels, and checks in the first equation', () => {
  const replay = replayStepAlgebra({ sibling: { equation: GUIDE_EQUATION }, moves: GUIDE_SCRIPT });
  assert.equal(replay.ok, true);
  assert.equal(replay.prompt, 'Solve $5 x+3 = 2 x-9$ for $x$.');
  assert.equal(replay.answer, '$x = -4$');
  assert.deepEqual(replay.steps.map((step) => step.board.after), ['3x+3 = -9', '3x = -12', 'x = -4', '-17 = -17']);
  assert.deepEqual(replay.steps.map((step) => step.board.cancels), [['right'], ['left'], ['left'], []]);
  assert.deepEqual(replay.steps.map((step) => step.why), GUIDE_SCRIPT.map((move) => move.why), 'the why is the author\'s');
  assert.deepEqual(replay.steps.map((step) => step.board.label), [
    'Subtract $2 x$ on both sides', 'Subtract $3$ on both sides', 'Divide by $3$ on both sides', 'Check $x = -4$ in the first equation',
  ]);
  const check = replay.steps.at(-1);
  assert.equal(check.board.kind, 'check');
  assert.equal(check.board.before, '5 x+3 = 2 x-9', 'the check goes back to the first equation');
  assert.match(check.board.applied, /^5 \\left\(-4\\right\)\+3 = 2 \\left\(-4\\right\)-9$/);
  assert.equal(check.show, 'Check: put $x = -4$ into $5 x+3 = 2 x-9$. Both sides equal $-17$.');
  // A value that would be shown as a rounded decimal is left as the board has it.
  const thirds = replayStepAlgebra({ sibling: { equation: 'x/3 + 17 = 37' }, moves: [{ op: 'subtract', operand: '17' }, { op: 'multiply', operand: '3' }] });
  assert.equal(thirds.ok, true);
  assert.doesNotMatch(JSON.stringify(thirds.steps), /0\.3333/);
  assert.equal(thirds.answer, '$x = 60$');
});

// ------------------------------------------- 2. a script that fails is refused

test('a script that does not reach its answer is refused, and says where', () => {
  const refusal = (moves, equation = GUIDE_EQUATION) => {
    const replay = replayStepAlgebra({ sibling: { equation }, moves });
    assert.equal(replay.ok, false, JSON.stringify(moves));
    assert.equal(replay.steps, undefined, 'a refused script plays nothing');
    return replay.error;
  };
  assert.match(refusal(GUIDE_SCRIPT.slice(0, 1)), /its moves end at 3x\+3 = -9, which is not solved for x/);
  assert.match(refusal(GUIDE_SCRIPT.slice(0, 2)), /its moves end at 3x = -12, which is not solved for x/);
  // A wrong move is still balanced algebra, so the board plays it; the script is refused because it does not finish.
  assert.match(refusal([{ op: 'subtract', operand: '2x' }, { op: 'subtract', operand: '3' }, { op: 'divide', operand: '4' }]), /which is not solved for x/);
  assert.match(refusal([{ check: true }]), /moves\[0\] checks the answer, but the equation is not solved there/);
  assert.match(refusal([{ op: 'square' }]), /moves\[0\]\.op "square" is not a Step Algebra move\. Use add, subtract, multiply, divide\./);
  assert.match(refusal([{ op: 'subtract' }]), /moves\[0\] needs an operand/);
  assert.match(refusal([{ op: 'divide', operand: 0 }]), /moves\[0\] cannot be played on 5 x\+3 = 2 x-9: .*zero is not allowed\./);
  assert.match(refusal([...GUIDE_SCRIPT, { op: 'add', operand: 1 }]), /moves\[4\] comes after the check/);
  assert.match(refusal([...GUIDE_SCRIPT.slice(0, 3), { op: 'add', operand: 1 }]), /moves\[3\] comes after the equation is solved/);
  assert.match(refusal([], GUIDE_EQUATION), /no moves to play/);
  assert.match(refusal(GUIDE_SCRIPT, '5x + 3'), /the sibling equation cannot be read/);
  assert.match(refusal(GUIDE_SCRIPT, ''), /the sibling equation cannot be read/);
  assert.deepEqual([...STEP_ALGEBRA_REPLAY_OPERATIONS], ['add', 'subtract', 'multiply', 'divide']);
});

test('the compiler and Pre-Flight refuse a lesson whose Step Algebra replay does not reach its answer', async () => {
  const broken = (source) => {
    source.lessonSupports.examples[0].moves = GUIDE_SCRIPT.slice(0, 2);
    delete source.lessonSupports.examples[0].fade;
    return source;
  };
  // The lesson as the guide writes it compiles; its replay reaches x = -4.
  assert.deepEqual(stepAlgebraReplayErrors(fixture()), []);
  assert.ok(parseAssignmentBlueprintText(JSON.stringify(fixture())).assignmentV5);
  // With the last moves taken out it is refused, naming the example and the line it stops at.
  const errors = stepAlgebraReplayErrors(broken(fixture()));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^lessonSupports\.examples\[0\] is a Step Algebra replay the tool cannot play: its moves end at 3x = -12, which is not solved for x\./);
  assert.throws(() => parseAssignmentBlueprintText(JSON.stringify(broken(fixture()))), /lessonSupports\.examples\[0\] is a Step Algebra replay the tool cannot play/);
  // Pre-Flight raises the same error on a stored assignment.
  const { buildAssignmentV5PreflightModel } = await import('../../src/platform/preflight/assignmentV5PreflightModel.js');
  const stored = storedLesson();
  const sound = buildAssignmentV5PreflightModel(stored);
  const structuralErrors = (model) => JSON.stringify(model).match(/Step Algebra replay the tool cannot play/g) || [];
  assert.equal(structuralErrors(sound).length, 0);
  const damaged = { ...stored, lessonSupports: broken(JSON.parse(JSON.stringify({ lessonSupports: stored.lessonSupports }))).lessonSupports };
  assert.ok(structuralErrors(buildAssignmentV5PreflightModel(damaged)).length >= 1);
  // An assignment with no replay is not looked at: a step card, another tool, no supports at all.
  assert.deepEqual(stepAlgebraReplayErrors({}), []);
  assert.deepEqual(stepAlgebraReplayErrors({ lessonSupports: { examples: [{ id: 'card', steps: [{ show: 'a', why: 'b' }] }, { id: 'radical', tool: 'radicalEquation', sibling: { equation: 'sqrt(x) = 2' }, moves: [{ op: 'square' }] }] } }), []);
  assert.equal(isStepAlgebraReplayEntry({ tool: 'stepAlgebra', moves: [] }), true);
  assert.equal(isStepAlgebraReplayEntry({ sibling: { equation: 'x = 1' }, moves: [] }), true, 'moves on a sibling equation with no tool named');
  assert.equal(isStepAlgebraReplayEntry({ tool: 'radicalEquation', sibling: { equation: 'x = 1' }, moves: [] }), false);
  assert.equal(isStepAlgebraReplayEntry({ tool: 'stepAlgebra', steps: [] }), false);
});

// ------------------------------------------ 3. variables on both sides first

test('the built-in moves: the variable terms, then the numbers, then the coefficient, then the check', () => {
  const kinds = (equation, variable = '') => stepAlgebraMovesFor({ equation, variable })?.map((move) => (move.check ? 'check' : `${move.op} ${move.operand}`));
  assert.deepEqual(kinds('5x + 3 = 2x - 9'), ['subtract 2x', 'subtract 3', 'divide 3', 'check']);
  assert.deepEqual(kinds('4x - 7 = 9x + 8'), ['subtract 9x', 'add 7', 'divide -5', 'check']);
  assert.deepEqual(kinds('6 - 2x = 3x + 1'), ['subtract 3x', 'subtract 6', 'divide -5', 'check']);
  assert.deepEqual(kinds('3x + 4 = -x + 12'), ['add x', 'subtract 4', 'divide 4', 'check']);
  assert.deepEqual(kinds('3y - 2 = y + 8', 'y'), ['subtract y', 'add 2', 'divide 2', 'check']);
  // One side only: the two-step equation the same way.
  assert.deepEqual(kinds('3x + 6 = 21'), ['subtract 6', 'divide 3', 'check']);
  assert.deepEqual(kinds('7 = 2x + 1'), ['subtract 1', 'divide 2', 'check']);
  const whys = stepAlgebraMovesFor({ equation: GUIDE_EQUATION }).map((move) => move.why);
  assert.deepEqual(whys, [REPLAY_WHY.variables, REPLAY_WHY.constants, REPLAY_WHY.coefficient, REPLAY_WHY.check], 'every move says why');
  // Every script it writes plays to a solved equation that checks.
  for (const equation of ['5x + 3 = 2x - 9', '4x - 7 = 9x + 8', '6 - 2x = 3x + 1', '3x + 4 = -x + 12', '3x + 6 = 21', '7 = 2x + 1', '-x + 4 = 10', '8x = 3x + 35']) {
    const replay = replayStepAlgebra({ sibling: { equation }, moves: stepAlgebraMovesFor({ equation }) });
    assert.equal(replay.ok, true, `${equation}: ${replay.error}`);
    assert.equal(replay.steps.at(-1).board.kind, 'check');
  }
  // Not covered: something to distribute, a fraction to clear, no single solution, more than one variable.
  for (const equation of ['-2(x - 3) + 5x = 4', 'x/3 + 17 = 37', '2x + 5 = 2x - 1', '2x + 6 = 2(x + 3)', 'ax + b = c', 'x^2 = 9', 'not an equation']) {
    assert.equal(stepAlgebraMovesFor({ equation }), null, equation);
  }
});

// ------------------------------------------- 4. the example a question gets

test('a lesson\'s replay plays for the question that names it, and is always a sibling', () => {
  const assignment = storedLesson();
  const question = receivedAt(assignment, 'ls-cw-2');
  const context = contextAt(assignment, 'ls-cw-2', 'classwork');
  const example = workedExampleFor(question, context);
  assert.equal(example.source, 'authored');
  assert.equal(example.format, 'replay');
  assert.equal(example.id, 'ex-both-sides');
  assert.equal(example.prompt, 'Solve $5 x+3 = 2 x-9$ for $x$.');
  assert.equal(example.answer, '$x = -4$');
  assert.equal(example.steps.length, 4);
  assert.ok(example.steps.every((step) => step.board && step.show && step.why), 'every move has its board, its sentence and its why');
  assert.equal(example.handOverAfter, 1, 'the lesson fades it after one move');
  assert.deepEqual(example, authoredReplay(question, assignment.lessonSupports, { sectionRole: 'classwork' }));
  // It passes the guard every sibling passes: not the question's prompt, answer, or a step that states it.
  assert.equal(similarExampleIsSafe(question, { prompt: example.prompt, steps: example.steps.map((step) => `${step.show} ${step.why}`), answer: example.answer }), true);
  // A replay whose sibling is the student's own equation is not played: the family's sibling is.
  const own = storedLesson((source) => {
    source.lessonSupports.examples[0].sibling = { equation: '4x + 7 = x - 9' };
    source.lessonSupports.examples[0].moves = [{ op: 'subtract', operand: 'x' }, { op: 'subtract', operand: '7' }, { op: 'divide', operand: '3' }];
    source.sections[0].questions[1].equation = '4x + 7 = x - 8';
    return source;
  });
  // (x = -16/3 there, so it is a different problem and safe; the next case shares the answer.)
  assert.equal(workedExampleFor(receivedAt(own, 'ls-cw-2'), contextAt(own, 'ls-cw-2', 'classwork')).source, 'authored');
  const sameAnswer = storedLesson((source) => {
    source.lessonSupports.examples[0].sibling = { equation: '2x + 1 = x - 4' };
    source.lessonSupports.examples[0].moves = [{ op: 'subtract', operand: 'x' }, { op: 'subtract', operand: '1' }];
    delete source.lessonSupports.examples[0].fade;
    return source;
  });
  const fallback = workedExampleFor(receivedAt(sameAnswer, 'ls-cw-2'), contextAt(sameAnswer, 'ls-cw-2', 'classwork'));
  assert.equal(fallback.source, 'family', 'a replay that reaches the question\'s own answer (x = -5) is never shown');
  // A script the engine refuses is not this question's example either (a stored assignment from before the check).
  const refusedLesson = { ...assignment, lessonSupports: { ...assignment.lessonSupports, examples: assignment.lessonSupports.examples.map((entry) => (entry.id === 'ex-both-sides' ? { ...entry, moves: GUIDE_SCRIPT.slice(0, 1), fade: undefined } : entry)) } };
  assert.equal(authoredReplay(question, refusedLesson.lessonSupports, { sectionRole: 'classwork' }), null);
  assert.equal(workedExampleFor(question, { ...context, lessonSupports: refusedLesson.lessonSupports }).source, 'family');
});

test('a Step Algebra question with no example of its own gets its family\'s sibling as a replay', () => {
  const assignment = storedLesson((source) => {
    delete source.sections[0].questions[1].example;
    return source;
  });
  const question = receivedAt(assignment, 'ls-cw-2');
  assert.equal(question.type, 'stepAlgebra');
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    const example = workedExampleFor(question, { seed, sectionRole: 'classwork' });
    assert.equal(example.source, 'family');
    assert.equal(example.format, 'replay', `seed ${seed}`);
    assert.match(example.prompt, /^Solve \$[^$]+\$ for \$x\$\.$/);
    assert.notEqual(example.prompt, question.prompt);
    assert.ok(example.steps.every((step) => step.board), 'every slide is a move of the board');
    assert.equal(example.steps.at(-1).board.kind, 'check');
    assert.ok(example.steps.length >= 3);
    assert.equal(example.handOverAfter, 1, 'a built-in replay fades after its first move');
    assert.equal(similarExampleIsSafe(question, { prompt: example.prompt, steps: example.steps.map((step) => `${step.show} ${step.why}`), answer: example.answer }), true);
  }
  // A question that is not on the Step Algebra board keeps its text example, whatever its sibling reads.
  const text = workedExampleFor({ ...question, type: 'multiAnswer' }, { sectionRole: 'classwork' });
  if (text) assert.notEqual(text.format, 'replay');
});

// ----------------------------------------------------- 5. the faded hand-over

test('the second Classwork question on a skill is shown the first moves only; on request the whole example plays', () => {
  const assignment = storedLesson();
  const first = contextAt(assignment, 'ls-cw-2', 'classwork');
  const second = contextAt(assignment, 'ls-cw-3', 'classwork');
  assert.deepEqual([first.newSkill, first.fadeTurn, first.coveringExample], [true, false, null]);
  assert.deepEqual([second.newSkill, second.fadeTurn, second.coveringExample], [false, true, 'ex-both-sides'], 'CW 3 names no example: CW 2\'s covers it');
  // On Practice, and on a DOL, nothing is new and nothing fades.
  for (const [id, role] of [['ls-pr-1', 'practice'], ['ls-dol-1', 'dol']]) {
    const context = contextAt(assignment, id, role);
    assert.deepEqual([context.newSkill, context.fadeTurn], [false, false], id);
  }
  const rule = exampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: true });
  const question = receivedAt(assignment, 'ls-cw-3');
  const example = workedExampleFor(question, second);
  assert.equal(example.format, 'replay');
  assert.ok(example.handOverAfter >= 1);
  // It opens by itself on the faded turn, once, and never where the section does not open examples.
  const opens = (overrides = {}) => exampleOpensByItself({ rule, newSkill: second.newSkill, fadeTurn: second.fadeTurn, example, ...overrides });
  assert.equal(opens(), true);
  assert.equal(opens({ alreadyShown: true }), false);
  assert.equal(opens({ alreadyUsed: true }), false);
  assert.equal(opens({ attemptCount: 1 }), false);
  assert.equal(opens({ locked: true }), false);
  assert.equal(opens({ example: { ...example, handOverAfter: 0 } }), false, 'an example with nothing to fade does not open a second time');
  assert.equal(opens({ rule: exampleSectionRule({ sectionRole: 'practice', activityRole: 'practice', hintsAllowed: true }) }), false);
  assert.equal(opens({ rule: exampleSectionRule({ sectionRole: 'dol', activityRole: 'dol', hintsAllowed: false }) }), false);
  // A third question on the skill is neither new nor the faded turn.
  assert.equal(exampleOpensByItself({ rule, newSkill: false, fadeTurn: false, example }), false);
  // Faded: the first moves, no answer, and the last slide leaves the rest to the student.
  const faded = fadedExample(example);
  assert.equal(faded.faded, true);
  assert.equal(faded.steps.length, example.handOverAfter);
  assert.equal(faded.stepCount, example.steps.length);
  assert.equal(faded.answer, '');
  const slides = exampleSlides(faded);
  assert.deepEqual(slides.map((slide) => slide.kind), ['problem', ...Array(example.handOverAfter).fill('step')]);
  assert.equal(slides.at(-1).label, `Step ${example.handOverAfter} of ${example.steps.length}`, 'it says how many steps there are');
  assert.equal(slideTurnText(slides.at(-1)), EXAMPLE_FADED_TURN_TEXT);
  assert.ok(slideReadingText(slides.at(-1)).endsWith(EXAMPLE_FADED_TURN_TEXT));
  assert.doesNotMatch(JSON.stringify(slides), new RegExp(example.answer.replace(/[$\\]/g, '\\$&')), 'the sibling\'s answer is not on a faded slide');
  // The whole example: every move, then the answer, and the usual last line.
  const whole = exampleSlides(example);
  assert.deepEqual(whole.map((slide) => slide.kind), ['problem', ...example.steps.map(() => 'step'), 'answer']);
  assert.equal(slideTurnText(whole.at(-1)), EXAMPLE_YOUR_TURN_TEXT);
  // Nothing to fade: the example itself.
  assert.equal(fadedExample({ ...example, handOverAfter: 0 }).faded, undefined);
  assert.equal(fadedExample({ ...example, handOverAfter: example.steps.length }).faded, undefined);
  // A step card fades too (`fromStep: 3` lets the student do step 3 onward).
  const card = { source: 'authored', format: 'steps', prompt: 'P', steps: [{ show: 'a', why: 'w' }, { show: 'b', why: 'w' }, { show: 'c', why: 'w' }, { show: 'd', why: 'w' }], answer: 'd', handOverAfter: 2 };
  assert.deepEqual(exampleSlides(fadedExample(card)).map((slide) => slide.show), ['P', 'a', 'b']);
});

test('QuestionEngine fades only the example it opened by itself on the faded turn', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const shown = region(engine, 'const shownExample = useMemo(', ');', 'the example the panel is handed');
  assert.match(shown, /exampleOpenedByItself && workedExampleContext\?\.fadeTurn === true \? fadedExample\(similarExample\) : similarExample/);
  const opens = region(engine, 'const exampleOpensNow = exampleOpensByItself({', '});', 'when it opens by itself');
  assert.match(opens, /fadeTurn: workedExampleContext\?\.fadeTurn === true,/);
  // Asking for the example clears "opened by itself", so the whole example plays and is recorded as asked for.
  const asked = region(engine, 'const openSimilarExample = (place) => {', '};', 'opening on request');
  assert.match(asked, /setExampleOpenedByItself\(false\);/);
  assert.match(asked, /setWorkedExampleUsed\(true\);/);
  assert.match(region(engine, 'const similarExample = useMemo(', ');', 'the example'), /coveringExample: workedExampleContext\?\.coveringExample,/);
});

// ------------------------------------------------------------ 6. the screen

test('the player draws a move as the board\'s lines, each named in words', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const MathText = (await server.ssrLoadModule('/src/components/common/MathText.jsx')).default;
    const { SupportedTextActions } = await server.ssrLoadModule('/src/platform/supports/SupportedText.jsx');
    const Player = (await server.ssrLoadModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx')).default;
    const replay = replayStepAlgebra({ sibling: { equation: GUIDE_EQUATION }, moves: GUIDE_SCRIPT });
    const example = { source: 'authored', format: 'replay', prompt: replay.prompt, steps: replay.steps, answer: replay.answer, handOverAfter: 1 };
    const draw = (shownExample, props = {}) => renderToStaticMarkup(React.createElement(Player, { MathText, SupportedTextActions, example: shownExample, ...props }));
    // The first slide is the problem; a move is drawn from its board.
    const problem = draw(example);
    assert.match(problem, /data-example-format="replay"/);
    assert.doesNotMatch(problem, /data-example-board=/);
    // Draw each slide as the player would, by giving it an example that starts at that step.
    const moveOnly = draw({ ...example, prompt: example.prompt, steps: [example.steps[0]], answer: '' });
    assert.match(moveOnly, /data-example-slide-count="2"/);
    const slides = exampleSlides(example);
    assert.deepEqual(slides.map((slide) => Boolean(slide.board)), [false, true, true, true, true, false]);
    // The board component itself, on the move and on the check.
    const playerSource = executableSource(read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx'));
    assert.match(playerSource, /\{slide\.board \? <ReplayBoard MathText=\{MathText\} board=\{slide\.board\} \/> : \(/);
    for (const name of ['Start with', 'The same move on both sides', 'Cancel on ', 'Simplify', 'The first equation', 'With the value put in', 'Both sides']) {
      assert.ok(playerSource.includes(`'${name}`) || playerSource.includes(`\`${name}`), `the board names "${name}" in words`);
    }
    // A faded example says so when it opens by itself, and ends on the faded line.
    const faded = draw(fadedExample(example), { openedByItself: true });
    assert.match(faded, /data-example-faded=""/);
    assert.match(faded, /Same skill as before\. This time only the first part is worked for you\./);
    assert.doesNotMatch(draw(example, { openedByItself: true }), /data-example-faded/);
  } finally {
    await server.close();
  }
  // Read aloud is given the move as a sentence, then its why.
  const replay = replayStepAlgebra({ sibling: { equation: GUIDE_EQUATION }, moves: GUIDE_SCRIPT });
  const slide = exampleSlides({ source: 'authored', format: 'replay', prompt: replay.prompt, steps: replay.steps, answer: replay.answer })[1];
  assert.equal(slideReadingText(slide), 'Step 1 of 4. Subtract $2 x$ on both sides: $3x+3 = -9$. Why: Collect the x-terms on one side.');
  // The player still imports only React and its slides; the replay runs in the question's chunk.
  const imports = [...read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx').matchAll(/^import [^;]*? from '([^']+)';/gms)].map((match) => match[1]);
  assert.deepEqual(imports, ['react', './exampleSlides.js']);
  assert.deepEqual([...read('src/platform/supports/workedExample/exampleSlides.js').matchAll(/^import /gm)], []);
  assert.ok(isSolvedEquation(parseEquationInput({ equation: 'x = -4' })));
});
