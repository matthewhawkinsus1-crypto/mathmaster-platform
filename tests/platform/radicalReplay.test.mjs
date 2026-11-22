/*
 * WE-D: THE RADICAL EQUATION REPLAY, WITH ITS FACTORING SLIDES
 * (docs/platform/WORKED_EXAMPLES.md sections 3, 4 and 7;
 * src/platform/supports/workedExample/radicalReplay.js).
 *
 * What is proved here:
 *   1. every line of a replay is a line the relation workspace's own commit
 *      accepts: the replay's lines are the honest path's lines
 *      (helpers/radicalHonestPath.mjs, validated by validateRelationTransition),
 *      and a check's two values are the engine's exact values;
 *   2. an extraneous candidate is rejected on a slide of its own, and is not
 *      in the answer;
 *   3. the factor step opens the factoring slides: 4 for x² + bx + c and 6 for
 *      ax² + bx + c, each with what the owner's decision names;
 *   4. Classwork plays those slides in the sequence; on Practice the factor
 *      step is one line with "Show how", which opens them;
 *   5. a script that is not the tool's own path is refused, by the replay, the
 *      compiler and Pre-Flight;
 *   6. a radical item's example is always a sibling: another equation of the
 *      same kind, never the item, an item of the assignment or its answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { honestPath } from './helpers/radicalHonestPath.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { asQuestionEngineReceivesIt } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import {
  parseRelationSource,
  relationStateToLatex,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import {
  parseRadicalEquation,
  radicalSidesAt,
  rationalToText,
  solveRadicalShape,
} from '../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { factorQuadraticByMethod } from '../../src/platform/supports/workedExample/factoringVariant.js';
import {
  EXAMPLE_SHOW_HOW_LABEL,
  exampleSlides,
  shownHowSlideIndex,
} from '../../src/platform/supports/workedExample/exampleSlides.js';
import {
  assignmentProblemKeys,
  exampleOpensByItself,
  exampleSectionRule,
  fadedExample,
  lessonExampleContext,
  workedExampleFor,
} from '../../src/platform/supports/workedExample/examplePlayer.js';
import {
  FACTOR_SKILL,
  FACTOR_SLIDE_COUNT,
  RADICAL_REPLAY_OPERATIONS,
  isRadicalReplayEntry,
  radicalReplayErrors,
  radicalSiblingEquation,
  replayRadicalEquation,
} from '../../src/platform/supports/workedExample/radicalReplay.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const tidy = (latex) => latex.split('=').map((side) => side.trim()).join(' = ');
const latexOf = (state) => tidy(relationStateToLatex(state));
const resultLine = (step) => step.board?.lines.find((line) => line.result === true)?.latex;
const play = (equation, moves) => replayRadicalEquation({ sibling: { equation }, ...(moves ? { moves } : {}) });

const SIMPLE = 'sqrt(x + 10) + 2 = x'; // 0 = x² − 5x − 6: candidates −1 (extraneous) and 6
const AC = 'sqrt(x + 6) = 2x - 3'; // 0 = 4x² − 13x + 3: candidates 1/4 (extraneous) and 3
const LINEAR = 'nthRoot(2x + 3, 3) = 3'; // 2x + 3 = 27
const BOTH = 'sqrt(3x - 2) = x'; // 0 = x² − 3x + 2: 1 and 2 both check
const SPEC_SCRIPT = [
  { op: 'square', why: 'undo the root; check every answer' },
  { op: 'collectToZero' },
  { op: 'factor', detail: 'factor.trinomialAC' },
  { op: 'zeroProduct' },
  { check: 'each' },
];
const LESSON = 'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json';
const lessonQuestions = () => parseAssignmentBlueprintText(read(LESSON)).questions.map(asQuestionEngineReceivesIt);

// -------------------------------------------------- 1. the engine's own lines

test('every line of a replay is a line the workspace\'s own commit accepts', () => {
  for (const equation of [SIMPLE, AC, LINEAR, BOTH, 'sqrt(x + 3) - 2 = x - 1', 'sqrt(x + 2) = 2x - 2', 'sqrt(2x + 8) = 4']) {
    const replay = play(equation);
    assert.equal(replay.ok, true, `${equation}: ${replay.error}`);
    // The honest path is what a student writes, each step accepted by validateRelationTransition.
    const honest = honestPath(equation);
    for (const step of honest.steps) {
      assert.equal(validateRelationTransition(step.before, step.after, step.transition).valid, true, `${equation}: ${step.label}`);
    }
    // Each of its lines is a slide's result line, in the same order.
    // (The helper writes a product as 4*x and the replay as 4 x: one line, drawn with or without a thin space.)
    const drawn = (latex) => latex.replace(/\s+|\\cdot/g, '');
    const results = replay.steps.map(resultLine).filter(Boolean).map(drawn);
    // Up to the factoring: a product may be written in either order, so the factored line, the
    // branches and their solves are judged by the workspace's commit directly (the factoring tests).
    let at = -1;
    const factorAt = honest.steps.findIndex((step) => step.kind === 'factor');
    for (const step of factorAt < 0 ? honest.steps : honest.steps.slice(0, factorAt)) {
      const line = drawn(latexOf(step.after));
      const found = results.indexOf(line, at + 1);
      assert.ok(found > at, `${equation}: the line after "${step.label}" (${line}) is on a slide, in order`);
      at = found;
    }
    // A move starts from the line the one before it ended on.
    const boards = replay.steps.filter((step) => step.board && step.board.kind === 'move');
    boards.slice(1).forEach((step, index) => {
      assert.equal(step.board.lines[0].latex, resultLine(boards[index]), `${equation}: slide ${index + 2} starts where the last one ended`);
    });
    assert.equal(boards[0].board.lines[0].latex, latexOf(parseRelationSource(equation, 'x')));
    // The answer is the engine's own solution set.
    const expected = solveRadicalShape(parseRadicalEquation(equation).shape);
    assert.deepEqual(replay.candidates, expected.candidates.map(rationalToText));
    for (const value of expected.genuine) assert.ok(replay.answer.includes(`x = ${rationalToText(value).includes('/') ? '\\frac' : rationalToText(value)}`), `${equation}: ${replay.answer}`);
  }
  // The line with the operation on both sides is the engine's (unsimplified), before the simplified one.
  const first = play(SIMPLE).steps[0].board;
  assert.deepEqual(first.lines.map((line) => line.name), ['Start with', 'The same move on both sides', 'Simplify']);
  assert.equal(first.lines[1].latex, '\\sqrt{ x+10}+2-2 = x-2');
  assert.equal(first.lines[2].latex, '\\sqrt{ x+10} = x-2');
  assert.deepEqual([...RADICAL_REPLAY_OPERATIONS], ['add', 'subtract', 'multiply', 'divide', 'square', 'raise', 'collectToZero', 'factor', 'zeroProduct']);
});

// ------------------------------------------- 2. extraneous roots are rejected

test('an extraneous candidate is rejected on a slide of its own, with the engine\'s two values', () => {
  for (const [equation, rejected, kept] of [[SIMPLE, '-1', '6'], [AC, '1/4', '3']]) {
    const replay = play(equation);
    const checks = replay.steps.filter((step) => step.board && step.board.kind !== 'move');
    assert.deepEqual(checks.map((step) => step.board.kind), ['reject', 'check'], equation);
    const [reject, holds] = checks;
    const shape = parseRadicalEquation(equation).shape;
    const sides = (value) => radicalSidesAt(shape, shape && { n: Number(value.split('/')[0]), d: Number(value.split('/')[1] || 1) });
    // The rejected value: the two sides the engine computes are different, and the slide says so.
    const wrong = sides(rejected);
    assert.notEqual(rationalToText(wrong.left), rationalToText(wrong.right));
    assert.deepEqual(reject.board.lines.map((line) => line.name), ['The first equation', 'With the value put in', 'The two sides are not equal', 'Extraneous: rejected']);
    assert.match(reject.board.lines[2].latex, /\\ne/);
    assert.match(reject.show, /They are not equal, so \$x = .*\$ is extraneous: reject it\.$/);
    assert.match(reject.why, /extraneous/);
    assert.equal(reject.board.lines[0].latex, latexOf(parseRelationSource(equation, 'x')), 'checked in the FIRST equation');
    // The kept value: both sides equal.
    const right = sides(kept);
    assert.equal(rationalToText(right.left), rationalToText(right.right));
    assert.deepEqual(holds.board.lines.map((line) => line.name), ['The first equation', 'With the value put in', 'Both sides are equal', 'A solution']);
    assert.match(holds.show, /is a solution\.$/);
    // The answer has the solution and not the rejected value.
    assert.deepEqual(replay.extraneous, [rejected]);
    assert.equal(replay.answer, `$x = ${kept}$`);
    // Each check is its own slide, after every move.
    const slides = exampleSlides({ source: 'family', format: 'replay', prompt: replay.prompt, steps: replay.steps, answer: replay.answer });
    assert.deepEqual(slides.slice(-3).map((slide) => slide.board?.kind || slide.kind), ['reject', 'check', 'answer']);
  }
  // Both candidates check: no slide rejects anything, and both are the answer.
  const both = play(BOTH);
  assert.deepEqual(both.steps.filter((step) => step.board && step.board.kind !== 'move').map((step) => step.board.kind), ['check', 'check']);
  assert.equal(both.answer, '$x = 1$ or $x = 2$');
  // A root equal to a number: one candidate, checked.
  const linear = play(LINEAR);
  assert.deepEqual(linear.steps.map((step) => step.board.kind), ['move', 'move', 'move', 'move', 'check']);
  assert.deepEqual(linear.steps.map((step) => step.board.label.replace(/\$/g, '')), ['Raise both sides to the power 3', 'Work out the power', 'Subtract 3 on both sides', 'Divide both sides by 2', 'Check x = 12 in the first equation']);
  assert.equal(linear.factorSkill, null);
});

// ---------------------------------------------------- 3. the factoring slides

test('factoring x² + bx + c takes four slides: what to look for, the pairs and their sums, the factors multiplied back, the zero product', () => {
  const replay = play(SIMPLE);
  assert.equal(replay.factorSkill, FACTOR_SKILL.SIMPLE);
  const slides = replay.steps.filter((step) => step.subSkill);
  assert.equal(slides.length, 4);
  assert.equal(FACTOR_SLIDE_COUNT[FACTOR_SKILL.SIMPLE], 4);
  assert.deepEqual(slides.map((step) => [step.subSkill.index, step.subSkill.count, step.subSkill.optional]), [[1, 4, true], [2, 4, true], [3, 4, false], [4, 4, false]]);
  // The numbers are the lesson's own factoring method's.
  const found = factorQuadraticByMethod(1, -5, -6);
  assert.deepEqual([found.m + found.n, found.m * found.n], [-5, -6]);
  const [lookFor, pairs, factors, zero] = slides;
  assert.equal(lookFor.show, 'Factor ${ x}^{2}-5 x-6$. Look for two numbers that multiply to $-6$ and add to $-5$.');
  assert.match(pairs.show, /^The factor pairs of \$-6\$: \$1\$ and \$-6\$ add to \$-5\$; \$-1\$ and \$6\$ add to \$5\$; \$2\$ and \$-3\$ add to \$-1\$; \$-2\$ and \$3\$ add to \$1\$\. The pair \$-6\$ and \$1\$ adds to \$-5\$\.$/);
  assert.deepEqual(factors.board.lines.map((line) => line.name), ['Start with', 'Factored', 'Multiplied back']);
  assert.equal(factors.board.lines[0].latex, '0 = { x}^{2}-5 x-6');
  assert.equal(factors.board.lines[2].latex, '\\left( x+1\\right)\\left( x-6\\right) = { x}^{2}-5 x-6');
  // The factored line is one the board's own Factor tool accepts from the collected equation.
  const collected = parseRelationSource('0 = x^2 - 5 x - 6', 'x');
  const factored = parseRelationSource('0 = (x + 1)*(x - 6)', 'x');
  assert.equal(validateRelationTransition(collected, factored, { kind: 'factor', branchIndex: 0 }).valid, true);
  assert.equal(resultLine(factors), latexOf(factored));
  assert.deepEqual(zero.board.lines.map((line) => line.name), ['Start with', 'Each factor equal to 0']);
  assert.match(zero.why, /product is 0 only when one of its factors is 0/);
  assert.match(resultLine(zero), /x\+1 = 0\\quad\\text\{OR\}\\quad x-6 = 0/);
});

test('factoring ax² + bx + c takes six slides: a·c, the pairs, split the middle, group, the common binomial, the zero product', () => {
  const replay = play(AC);
  assert.equal(replay.factorSkill, FACTOR_SKILL.AC);
  const slides = replay.steps.filter((step) => step.subSkill);
  assert.equal(slides.length, 6);
  assert.equal(FACTOR_SLIDE_COUNT[FACTOR_SKILL.AC], 6);
  assert.deepEqual(slides.map((step) => [step.subSkill.index, step.subSkill.optional]), [[1, true], [2, true], [3, true], [4, true], [5, false], [6, false]]);
  const found = factorQuadraticByMethod(4, -13, 3);
  assert.deepEqual([found.m + found.n, found.m * found.n], [-13, 12]);
  const [ac, pairs, split, group, binomial, zero] = slides;
  assert.equal(ac.show, 'Factor $4 { x}^{2}-13 x+3$. Multiply $a$ and $c$: $4 \\cdot 3 = 12$.');
  assert.match(pairs.show, /^The factor pairs of \$12\$: .*\$-1\$ and \$-12\$ add to \$-13\$.* The pair \$-1\$ and \$-12\$ adds to \$-13\$\.$/);
  // Split and group are rewrites the workspace accepts; the factored line is one its Factor tool accepts.
  const collected = parseRelationSource('0 = 4 x^2 - 13 x + 3', 'x');
  const splitState = parseRelationSource('0 = 4 x^2 - x - 12 x + 3', 'x');
  const groupState = parseRelationSource('0 = x*(4 x - 1) - 3*(4 x - 1)', 'x');
  const factored = parseRelationSource('0 = (x - 3)*(4 x - 1)', 'x');
  assert.equal(validateRelationTransition(collected, splitState, { kind: 'equivalentRewrite' }).valid, true);
  assert.equal(validateRelationTransition(splitState, groupState, { kind: 'equivalentRewrite' }).valid, true);
  assert.equal(validateRelationTransition(collected, factored, { kind: 'factor', branchIndex: 0 }).valid, true);
  assert.equal(resultLine(split), latexOf(splitState));
  assert.equal(resultLine(group), latexOf(groupState));
  assert.equal(resultLine(binomial), latexOf(factored));
  assert.deepEqual(split.board.lines.map((line) => line.name), ['Start with', 'The middle term as two terms']);
  assert.deepEqual(group.board.lines.map((line) => line.name), ['Start with', 'Each pair with its common factor taken out']);
  assert.deepEqual(binomial.board.lines.map((line) => line.name), ['Start with', 'The common binomial taken out', 'Multiplied back']);
  assert.equal(binomial.board.lines[0].latex, latexOf(groupState), 'in the sequence it starts from the grouped line');
  assert.match(resultLine(zero), /x-3 = 0\\quad\\text\{OR\}\\quad4 x-1 = 0/);
  // A quadratic the slides do not factor (a common factor) is not played at all.
  const common = play('sqrt(x + 4) + 2 = x');
  assert.equal(common.ok, false);
  assert.match(common.error, /is not a trinomial the factoring slides factor/);
});

// ------------------------------------- 4. in the sequence, or behind Show how

test('Classwork plays the factoring slides in the sequence; on Practice the factor step is one line with Show how', () => {
  for (const [equation, count] of [[SIMPLE, 4], [AC, 6]]) {
    const replay = play(equation);
    const example = { source: 'family', format: 'replay', prompt: replay.prompt, steps: replay.steps, answer: replay.answer };
    const inSequence = exampleSlides({ ...example, subSkills: 'inSequence' });
    const factoring = inSequence.filter((slide) => slide.subSkill);
    assert.equal(factoring.length, count);
    assert.deepEqual(factoring.map((slide) => slide.label.replace(/^Step \d+ of \d+: /, '')), Array.from({ length: count }, (_, index) => `factoring, ${index + 1} of ${count}`));
    assert.ok(inSequence.every((slide) => !slide.showHow), 'Classwork has no Show how: nothing is folded');
    assert.deepEqual(exampleSlides(example).map((slide) => slide.label), inSequence.map((slide) => slide.label), 'with no mode named, nothing is left out');
    // Practice: the optional slides are behind Show how, and the factor step is one line from the collected equation.
    const practice = { ...example, subSkills: 'onRequest' };
    const folded = exampleSlides(practice);
    assert.equal(folded.length, inSequence.length - (count - 2));
    const asking = folded.filter((slide) => slide.showHow);
    assert.equal(asking.length, 1);
    assert.match(asking[0].show, /^Factor: \$0 = /);
    assert.equal(asking[0].board.label, 'Factor');
    assert.deepEqual(asking[0].board.lines.map((line) => line.name), ['Start with', 'Factored', 'Multiplied back']);
    assert.equal(asking[0].board.lines[0].latex, tidy(asking[0].board.lines[2].latex.split('=')[1].replace(/^/, '0 =')), 'it starts from the collected equation, not a line of a hidden slide');
    assert.ok(folded.every((slide) => /^(The problem|The answer|Step \d+ of \d+)$/.test(slide.label)), 'a folded step is numbered like any other');
    assert.equal(folded[asking[0].index + 1].subSkill.index, count, 'the zero product property is always played');
    // Show how: every slide of the skill, and the player lands on its first.
    const opened = exampleSlides(practice, { shownHow: true });
    assert.deepEqual(opened.map((slide) => slide.label), inSequence.map((slide) => slide.label));
    assert.ok(opened.every((slide) => !slide.showHow));
    const landing = shownHowSlideIndex(practice, asking[0].subSkill.skill);
    assert.equal(opened[landing].subSkill.index, 1);
  }
  assert.equal(EXAMPLE_SHOW_HOW_LABEL, 'Show how');
});

test('the section decides: a Classwork radical question gets the slides in sequence, a Practice one gets Show how', () => {
  const questions = lessonQuestions();
  const at = (id) => questions.findIndex((question) => question.questionId === id);
  const contextOf = (id, role) => lessonExampleContext({ questions, index: at(id), sectionRole: role });
  const classwork = workedExampleFor(questions[at('srh-cw-1')], contextOf('srh-cw-1', 'classwork'));
  const practice = workedExampleFor(questions[at('srh-p-1')], contextOf('srh-p-1', 'practice'));
  assert.deepEqual([classwork.format, classwork.tool, classwork.subSkills], ['replay', 'radicalEquation', 'inSequence']);
  assert.deepEqual([practice.format, practice.tool, practice.subSkills], ['replay', 'radicalEquation', 'onRequest']);
  assert.equal(exampleSlides(practice).filter((slide) => slide.showHow).length, 1);
  assert.equal(exampleSlides(classwork).filter((slide) => slide.showHow).length, 0);
  // The first Classwork radical question is a new skill; the second is the faded turn.
  const first = contextOf('srh-cw-1', 'classwork');
  const second = contextOf('srh-cw-2', 'classwork');
  assert.deepEqual([first.newSkill, first.fadeTurn], [true, false]);
  assert.deepEqual([second.newSkill, second.fadeTurn], [false, true]);
  const rule = exampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: true });
  assert.equal(exampleOpensByItself({ rule, newSkill: true, example: classwork }), true);
  // Faded: the first move only; no candidate, no check and no answer is on a faded slide.
  const fadedTurn = workedExampleFor(questions[at('srh-cw-2')], second);
  assert.equal(exampleOpensByItself({ rule, newSkill: false, fadeTurn: true, example: fadedTurn }), true);
  const faded = exampleSlides(fadedExample(fadedTurn));
  assert.equal(faded.length, 2);
  assert.ok(faded.every((slide) => !slide.board || slide.board.kind === 'move'));
  const most = exampleSlides(fadedExample({ ...fadedTurn, handOverAfter: fadedTurn.steps.length }));
  assert.equal(most.length, fadedTurn.fadeLimit + 1, 'asked for every step, it still stops before the zero product property');
  assert.doesNotMatch(JSON.stringify(most), /OR|Check:/);
  // A DOL never offers it (WE-A's section rule, unchanged).
  assert.equal(exampleSectionRule({ sectionRole: 'dol', activityRole: 'dol', hintsAllowed: false }).offered, false);
});

// ------------------------------------------------ 5. a script that is refused

test('an authored script must be the tool\'s own path: the replay, the compiler and Pre-Flight refuse any other', async () => {
  const replay = play(AC, SPEC_SCRIPT);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.steps[0].why, 'undo the root; check every answer', 'a move\'s why is the lesson\'s');
  assert.deepEqual(replay.steps.map((step) => step.show), play(AC).steps.map((step) => step.show), 'the lines are the engine\'s either way');
  const refusal = (moves, equation = AC) => {
    const refusedReplay = play(equation, moves);
    assert.equal(refusedReplay.ok, false, JSON.stringify(moves));
    assert.equal(refusedReplay.steps, undefined, 'a refused script plays nothing');
    return refusedReplay.error;
  };
  assert.match(refusal(SPEC_SCRIPT.slice(0, 3)), /its moves stop before the equation is solved\. The next move is \{ "op": "zeroProduct" \}\./);
  assert.match(refusal(SPEC_SCRIPT.slice(0, 4)), /its moves end without the check\..*add \{ "check": "each" \}\./);
  assert.match(refusal(SPEC_SCRIPT.slice(1)), /moves\[0\] is not the tool's move here\. On this equation the next move is \{ "op": "square" \}\./);
  assert.match(refusal([SPEC_SCRIPT[0], { check: 'each' }]), /moves\[1\] checks the candidates before the equation is solved/);
  assert.match(refusal([SPEC_SCRIPT[0], SPEC_SCRIPT[1], { op: 'factor', detail: 'factor.trinomial' }, SPEC_SCRIPT[3], SPEC_SCRIPT[4]]), /moves\[2\]\.detail "factor\.trinomial" is not this quadratic's factoring\. It is "factor\.trinomialAC"\./);
  assert.match(refusal([{ op: 'guess' }]), /moves\[0\]\.op "guess" is not a move of the radical equation tool\./);
  assert.match(refusal([...SPEC_SCRIPT, { op: 'square' }]), /moves\[4\] is the check, and the check is the last move\./);
  assert.match(refusal([]), /no moves to play/);
  // An isolating move must be the tool's own, with its operand.
  assert.equal(play(SIMPLE, [{ op: 'subtract', operand: '2' }, ...SPEC_SCRIPT.map((move) => (move.detail ? { op: 'factor' } : move))]).ok, true);
  assert.match(refusal([{ op: 'subtract', operand: '3' }], SIMPLE), /moves\[0\] is not the tool's move here\. On this equation the next move is \{ "op": "subtract", "operand": "2" \}\./);
  // Equations the tool does not verify, or whose quadratic the slides do not factor.
  assert.match(refusal(SPEC_SCRIPT, 'x + 2 = 5'), /is not a radical equation the tool verifies/);
  assert.match(refusal(SPEC_SCRIPT, 'sqrt(x + 4) + 2 = x'), /is not a trinomial the factoring slides factor/);
  assert.match(refusal(SPEC_SCRIPT, 'sqrt(x + 1) = -3'), /no solution by its structure|cannot solve/);

  // The compiler and Pre-Flight raise it on a lesson.
  const entry = (overrides = {}) => ({ id: 'ex-radical', tool: 'radicalEquation', source: 'builtIn', sibling: { equation: AC }, moves: SPEC_SCRIPT, ...overrides });
  const lesson = (example) => {
    const source = JSON.parse(read('tests/platform/fixtures/learningSupportsLessonFragment.json'));
    source.lessonSupports.examples.push(example);
    return source;
  };
  assert.equal(isRadicalReplayEntry(entry()), true);
  assert.equal(isRadicalReplayEntry({ tool: 'stepAlgebra', sibling: { equation: AC }, moves: [] }), false);
  assert.deepEqual(radicalReplayErrors(lesson(entry())), []);
  assert.ok(parseAssignmentBlueprintText(JSON.stringify(lesson(entry()))).assignmentV5);
  const broken = lesson(entry({ moves: SPEC_SCRIPT.slice(0, 3) }));
  const errors = radicalReplayErrors(broken);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^lessonSupports\.examples\[2\] is a radical equation replay the tool cannot play: its moves stop before the equation is solved\./);
  assert.throws(() => parseAssignmentBlueprintText(JSON.stringify(broken)), /is a radical equation replay the tool cannot play/);
  // A fade may not reach the candidates.
  const fadeErrors = radicalReplayErrors(lesson(entry({ fade: { handOverAfter: 12 } })));
  assert.match(fadeErrors[0], /^lessonSupports\.examples\[2\]\.fade would show the candidates: a faded radical example stops before the zero product property\. Use handOverAfter of 8 or less\.$/);
  assert.deepEqual(radicalReplayErrors(lesson(entry({ fade: { handOverAfter: 2 } }))), []);
  const { buildAssignmentV5PreflightModel } = await import('../../src/platform/preflight/assignmentV5PreflightModel.js');
  const { canonicalV5PersistencePatch } = await import('../../src/platform/contract/storedAssignmentV5.js');
  const stored = { id: 'lesson-1', ...canonicalV5PersistencePatch(parseAssignmentBlueprintText(JSON.stringify(lesson(entry()))).assignmentV5) };
  const raised = (model) => (JSON.stringify(model).match(/radical equation replay the tool cannot play/g) || []).length;
  assert.equal(raised(buildAssignmentV5PreflightModel(stored)), 0);
  const damaged = { ...stored, lessonSupports: { ...stored.lessonSupports, examples: stored.lessonSupports.examples.map((example) => (example.id === 'ex-radical' ? { ...example, moves: SPEC_SCRIPT.slice(0, 2) } : example)) } };
  assert.ok(raised(buildAssignmentV5PreflightModel(damaged)) >= 1);
  // An assignment with no radical replay is not looked at.
  assert.deepEqual(radicalReplayErrors({}), []);
  assert.deepEqual(radicalReplayErrors(JSON.parse(read('tests/platform/fixtures/learningSupportsLessonFragment.json'))), []);
});

// ------------------------------------------------------ 6. always a sibling

test('a radical item\'s example is another equation of the same kind, never the item, an item of the assignment or its answer', () => {
  const questions = lessonQuestions();
  const problems = assignmentProblemKeys(questions);
  const radicalItems = questions.filter((question) => question.type === 'stepAlgebra' && question.relationWorkspace === true);
  assert.ok(radicalItems.length >= 7, 'the lesson has radical Step Algebra items');
  const key = (value) => String(value).toLowerCase().replace(/[\s$]+/g, '');
  let quadratics = 0;
  for (const question of radicalItems) {
    const item = solveRadicalShape(parseRadicalEquation(question.equationLatex, { variable: question.solveFor }).shape);
    for (const seed of [0, 1, 2, 3]) {
      const sibling = radicalSiblingEquation(question.equationLatex, { seed, variable: question.solveFor });
      assert.ok(sibling, `${question.questionId}: a sibling for seed ${seed}`);
      assert.notEqual(key(sibling.equation), key(question.equationLatex));
      const siblingShape = parseRadicalEquation(sibling.equation, { variable: sibling.variable }).shape;
      const solved = solveRadicalShape(siblingShape);
      // The same kind: the index, whether it becomes a quadratic, and how many candidates are rejected.
      const itemShape = parseRadicalEquation(question.equationLatex, { variable: question.solveFor }).shape;
      assert.equal(siblingShape.index, itemShape.index, question.questionId);
      assert.equal(siblingShape.isolated.r.n === 0, itemShape.isolated.r.n === 0, question.questionId);
      if (siblingShape.isolated.r.n !== 0) assert.equal(solved.extraneous.length, Math.min(item.extraneous.length, 1), question.questionId);
      // None of its candidates is one of the item's.
      const itemValues = item.candidates.map(rationalToText);
      assert.ok(solved.candidates.every((value) => !itemValues.includes(rationalToText(value))), `${question.questionId}: ${sibling.equation}`);
      assert.deepEqual(radicalSiblingEquation(question.equationLatex, { seed, variable: question.solveFor }), sibling, 'the same seed gives the same sibling');
    }
    // What the question is handed: not an item of the assignment, and safe beside the item.
    const example = workedExampleFor(question, { sectionRole: 'classwork', assignmentProblems: problems });
    assert.ok(example, question.questionId);
    assert.equal(example.format, 'replay');
    assert.ok(!problems.has(key(example.prompt)));
    assert.ok(questions.every((other) => !key(example.prompt).includes(key(other.equationLatex || '\u0000'))), `${question.questionId}: the example is no item of the assignment`);
    assert.equal(similarExampleIsSafe(question, { prompt: example.prompt, steps: example.steps.map((step) => `${step.show} ${step.why}`), answer: example.answer }), true, question.questionId);
    if (example.steps.some((step) => step.subSkill)) quadratics += 1;
    // Asked only whether it has an example (for the questions before another), nothing is played.
    const asked = workedExampleFor(question, { sectionRole: 'classwork', assignmentProblems: problems, asReplay: false });
    assert.ok(asked && asked.steps.every((step) => !step.board));
  }
  assert.ok(quadratics >= 4, 'the square-root items with a variable on the other side get the factoring slides');
  // An item whose leading coefficient is more than 1 keeps the six-slide factoring.
  const hard = replayRadicalEquation({ sibling: radicalSiblingEquation('sqrt(5x - 1) = 2x - 1', { seed: 0 }) });
  assert.equal(hard.factorSkill, FACTOR_SKILL.AC);
  // Not a radical item, or one the tool does not verify: no sibling.
  assert.equal(radicalSiblingEquation('2x + 3 = 7'), null);
  const absolute = workedExampleFor({ type: 'stepAlgebra', relationWorkspace: true, equationLatex: '|x - 2| = 5', prompt: 'Solve $|x - 2| = 5$.', studentActions: ['solveStepByStep'] }, { sectionRole: 'classwork' });
  assert.notEqual(absolute?.tool, 'radicalEquation', 'an absolute value item keeps its own family\'s example');
});

// ------------------------------------------------------- what the player draws

test('the player draws a radical move, a rejected candidate and Show how', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const MathText = (await server.ssrLoadModule('/src/components/common/MathText.jsx')).default;
    const { SupportedTextActions } = await server.ssrLoadModule('/src/platform/supports/SupportedText.jsx');
    const Player = (await server.ssrLoadModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx')).default;
    const replay = play(SIMPLE);
    const example = { source: 'family', format: 'replay', prompt: replay.prompt, steps: replay.steps, answer: replay.answer };
    // The player opens on the problem; a slide is drawn by giving it an example of that one step.
    const drawStep = (step, overrides = {}) => renderToStaticMarkup(React.createElement(Player, { MathText, SupportedTextActions, example: { ...example, prompt: '', ...overrides, steps: [step] } }));
    const only = (step, overrides = {}) => {
      // With no prompt the example has no slides; so the step is drawn as the first step of a two-slide example.
      const html = renderToStaticMarkup(React.createElement(Player, { MathText, SupportedTextActions, example: { ...example, ...overrides, steps: [step], answer: '' } }));
      assert.match(html, /data-example-slide-count="2"/);
      return html;
    };
    assert.equal(drawStep(replay.steps[0]), '', 'no prompt, no slides');
    assert.match(only(replay.steps[0]), /data-example-format="replay"/);
    // The board itself: its lines are drawn as the replay names them, and a rejected candidate is marked.
    const source = read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx');
    assert.match(source, /const lines = Array\.isArray\(board\.lines\) \? board\.lines : \[/);
    assert.match(source, /data-example-board=\{board\.kind\}/);
    assert.match(source, /\{slide\.showHow \? \(/);
    assert.match(source, /data-example-show-how=""/);
    assert.match(source, /setPosition\(shownHowSlideIndex\(example, slide\.subSkill\?\.skill\)\)/);
    // Still only React and its slides: the replay runs in the question's chunk.
    const imports = [...source.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((match) => match[1]);
    assert.deepEqual(imports, ['react', './exampleSlides.js']);
    assert.deepEqual([...read('src/platform/supports/workedExample/exampleSlides.js').matchAll(/^import /gm)], []);
  } finally {
    await server.close();
  }
});
