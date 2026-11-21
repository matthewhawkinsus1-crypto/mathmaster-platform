/*
 * WE-A: THE WORKED-EXAMPLE PLAYER AND THE SECTION RULES
 * (docs/platform/WORKED_EXAMPLES.md sections 3, 4, 5 and 10).
 *
 * "See a similar problem worked" is stepped through, one slide a step, with a
 * "why" under each and a final "Your turn". It plays the lesson's authored
 * step card where a question names one (or an earlier Classwork question on
 * its skill does), and the built-in sibling otherwise. Classwork opens it by
 * itself before the first question on a skill; Practice plays it on request;
 * a DOL, quiz or test never has it, nor a control for it. Opening one is
 * recorded as workedExampleUsed and changes no score.
 *
 * The lesson is the authoring guide's own
 * (tests/platform/fixtures/learningSupportsLessonFragment.json), compiled as
 * the Assignment Creator compiles it and read back from the shape an
 * assignment is stored in, as a student's screen reads it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions, lessonSupportFields, storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { resolveQuestionActivityRole } from '../../src/platform/policies/activityPolicies.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { attemptSupportUsageFrom } from '../../src/platform/supports/supportUseMemory.js';
import { splitGrade, splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { exampleSkillOf as coverageSkillOf } from '../../src/platform/supports/workedExample/classworkCoverage.js';
import { exampleSkillOf } from '../../src/platform/supports/workedExample/exampleSkill.js';
import {
  EXAMPLE_PLAYER_COPY, EXAMPLE_PLAYER_LEAK_TEXTS, NO_EXAMPLE_ROLES, authoredExampleIsSafe, authoredExampleProblem, authoredExampleWarnings, authoredStepCard,
  exampleSlides, lessonExampleContext, resolveWorkedExample, slideLabel, slideReadingText, statedNumbers, stepSlide, workedExampleSectionRule,
} from '../../src/platform/supports/workedExample/lessonExample.js';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { NO_EXAMPLE_SECTION_ROLES } from '../../src/platform/contract/lessonSupportsV5.js';
import { LADDER_WORDS } from '../browser/support/assessmentLadderWords.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const FIXTURE = 'tests/platform/fixtures/learningSupportsLessonFragment.json';

// The guide's lesson, as a student's device holds it: compiled, stored, read back.
const lesson = () => {
  const compiled = parseAssignmentBlueprintText(read(FIXTURE));
  const stored = { id: 'lesson-1', ...canonicalV5PersistencePatch(compiled.assignmentV5) };
  const questions = getStoredAssignmentQuestions(stored);
  const sectionRoles = questions.map((question) => resolveQuestionActivityRole({ question, assignment: stored }));
  return { compiled, stored, questions, sectionRoles, lessonSupports: stored.lessonSupports };
};
const at = (held, questionId) => held.questions.findIndex((question) => question.questionId === questionId);
const contextFor = (held, questionId) => lessonExampleContext({
  questions: held.questions, index: at(held, questionId), lessonSupports: held.lessonSupports, roleOf: (_question, index) => held.sectionRoles[index],
});
// What the engine works out for a question running under its own section's role.
const exampleFor = (held, questionId, { as = null, hintsAllowed = null } = {}) => {
  const question = held.questions[at(held, questionId)];
  const context = contextFor(held, questionId);
  const running = as || context.sectionRole;
  return resolveWorkedExample({
    question,
    context,
    builtIn: () => buildSimilarWorkedExample(question),
    activityRole: running,
    hintsAllowed: hintsAllowed ?? getEffectiveActivityPolicy(running).hintsAllowed !== false,
  });
};

/* ------------------------------------------------------- the section rules */

test('Classwork opens the example by itself, Practice plays it on request, a DOL, quiz or test never has it', () => {
  assert.deepEqual(workedExampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: true }), { onRequest: true, opensByItself: true });
  assert.deepEqual(workedExampleSectionRule({ sectionRole: 'practice', activityRole: 'practice', hintsAllowed: true }), { onRequest: true, opensByItself: false });
  // The three roles the authoring contract refuses an example on.
  assert.deepEqual([...NO_EXAMPLE_ROLES].sort(), [...NO_EXAMPLE_SECTION_ROLES].sort());
  for (const role of ['dol', 'quiz', 'test']) {
    // Whatever the host says about hints, and whichever of the two roles it is.
    for (const hintsAllowed of [true, false]) {
      assert.deepEqual(workedExampleSectionRule({ sectionRole: role, activityRole: role, hintsAllowed }), { onRequest: false, opensByItself: false }, role);
      // A DOL replayed after its due date runs as practice and is still a DOL.
      assert.equal(workedExampleSectionRule({ sectionRole: role, activityRole: 'practice', hintsAllowed }).onRequest, false, `${role} section, run as practice`);
      assert.equal(workedExampleSectionRule({ sectionRole: null, activityRole: role, hintsAllowed }).onRequest, false, `a host that names no section, run as ${role}`);
      assert.equal(workedExampleSectionRule({ sectionRole: 'classwork', activityRole: role, hintsAllowed }).onRequest, false);
    }
  }
  // The rule hints follow: where they are withheld, nothing.
  assert.deepEqual(workedExampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: false }), { onRequest: false, opensByItself: false });
  assert.deepEqual(workedExampleSectionRule({ sectionRole: 'practice', activityRole: 'practice' }), { onRequest: false, opensByItself: false }, 'hints not vouched for: nothing');
  // A host that holds no lesson (Recovery, My Math Path) offers it on request, as before, and never opens it.
  assert.deepEqual(workedExampleSectionRule({ sectionRole: null, activityRole: 'classwork', hintsAllowed: true }), { onRequest: true, opensByItself: false });
  // A Classwork section replayed as practice plays on request only.
  assert.deepEqual(workedExampleSectionRule({ sectionRole: 'classwork', activityRole: 'practice', hintsAllowed: true }), { onRequest: true, opensByItself: false });
});

/* ------------------------------------------------- the guide's own lesson */

test('the stored lesson keeps its examples, and each question gets the example the lesson gives it', () => {
  const held = lesson();
  assert.equal(held.lessonSupports.examples.length, 2, 'lessonSupports is on the stored assignment');

  // CW 4 names a step card: it plays, in full, and opens by itself (the first on its skill).
  const cw4 = exampleFor(held, 'ls-cw-4');
  assert.equal(cw4.kind, 'authored');
  assert.equal(cw4.id, 'ex-line-two-points');
  assert.equal(cw4.from, 'own');
  assert.equal(cw4.opensByItself, true);
  assert.equal(cw4.handOverAfter, null, 'the question that names the example plays all of it');
  assert.deepEqual(cw4.steps.map((step) => Object.keys(step).sort()), cw4.steps.map(() => ['show', 'why']));
  assert.equal(cw4.steps.length, 4);
  assert.match(cw4.prompt, /^A line passes through \(1, 4\) and \(5, 24\)\./);

  // CW 2 names a tool replay (moves, no steps), which this player does not
  // play: it degrades to the built-in sibling, and still opens by itself.
  const cw2 = exampleFor(held, 'ls-cw-2');
  assert.equal(contextFor(held, 'ls-cw-2').example.id, 'ex-both-sides');
  assert.equal(authoredStepCard(contextFor(held, 'ls-cw-2').example), null, 'a tool replay is not a step card');
  assert.equal(cw2.kind, 'builtIn');
  assert.equal(cw2.opensByItself, true);
  assert.ok(cw2.steps.length >= 3 && cw2.answer);

  // CW 3 is the same skill as CW 2: on request, never by itself a second time.
  const cw3 = exampleFor(held, 'ls-cw-3');
  assert.equal(exampleSkillOf(held.questions[at(held, 'ls-cw-3')]), exampleSkillOf(held.questions[at(held, 'ls-cw-2')]));
  assert.equal(cw3.kind, 'builtIn');
  assert.equal(cw3.opensByItself, false);

  // CW 1 and CW 5 say they need none: no example, the built-in one included.
  for (const exempt of ['ls-cw-1', 'ls-cw-5']) {
    assert.equal(contextFor(held, exempt).exempt, true);
    assert.equal(exampleFor(held, exempt), null, exempt);
    const question = held.questions[at(held, exempt)];
    assert.equal(resolveWorkedExample({ question, context: contextFor(held, exempt), builtIn: { prompt: 'Solve 2x = 6.', steps: ['Divide by 2.'], answer: 'x = 3' }, activityRole: 'classwork', hintsAllowed: true }), null, 'not even a sibling the platform could build');
  }

  // Practice: the same family, only on request.
  const practice = exampleFor(held, 'ls-pr-1');
  assert.ok(practice, 'Practice has an example to ask for');
  assert.equal(practice.opensByItself, false);

  // The DOL: nothing, under its own role and replayed as practice, whatever a host says about hints.
  assert.equal(exampleFor(held, 'ls-dol-1'), null);
  assert.equal(exampleFor(held, 'ls-dol-1', { as: 'practice' }), null);
  assert.equal(exampleFor(held, 'ls-dol-1', { as: 'practice', hintsAllowed: true }), null);
  assert.ok(buildSimilarWorkedExample(held.questions[at(held, 'ls-dol-1')]), 'though the platform could work a sibling for it');
  // And nothing anywhere hints are withheld.
  assert.equal(exampleFor(held, 'ls-cw-4', { hintsAllowed: false }), null);
  assert.equal(exampleFor(held, 'ls-pr-1', { hintsAllowed: false }), null);
});

test('a host that holds no lesson keeps the built-in sibling on request, and nothing opens by itself', () => {
  const held = lesson();
  const question = held.questions[at(held, 'ls-cw-2')];
  const example = resolveWorkedExample({ question, context: null, builtIn: () => buildSimilarWorkedExample(question), activityRole: 'classwork', hintsAllowed: true });
  assert.equal(example.kind, 'builtIn');
  assert.equal(example.opensByItself, false);
  assert.equal(resolveWorkedExample({ question, context: null, builtIn: () => buildSimilarWorkedExample(question), activityRole: 'dol', hintsAllowed: true }), null);
  // The sibling is not worked where it will not be shown.
  let built = 0;
  resolveWorkedExample({ question, context: null, builtIn: () => { built += 1; return null; }, activityRole: 'test', hintsAllowed: false });
  assert.equal(built, 0);
});

/* ------------------------------------------------------ the same-skill rule */

const stepCardLesson = () => {
  const answerBox = (questionId, prompt, answer, extra = {}) => ({
    questionId, type: 'multiAnswer', activityRole: 'classwork', studentActions: ['multipleResponses'], standard: 'A.2B', prompt,
    answerFields: [{ id: 'm', label: 'Slope', answer }], ...extra,
  });
  const lessonSupports = { examples: [{
    id: 'ex-slope', source: 'authored', problem: 'Find the slope of the line through (1, 4) and (5, 24).',
    steps: [
      { show: 'rise = 24 - 4 = 20', why: 'Subtract the y-values.' },
      { show: 'run = 5 - 1 = 4', why: 'Subtract the x-values in the same order.' },
      { show: 'm = 20 / 4 = 5', why: 'Slope is rise over run.' },
    ],
    fade: { fromStep: 2 },
  }] };
  const questions = [
    answerBox('q1', 'Find the slope of the line through (0, 1) and (2, 7).', '3', { example: 'ex-slope' }),
    answerBox('q2', 'Find the slope of the line through (1, 1) and (3, 17).', '8'),
    { ...answerBox('q3', 'Find the slope of the line through (2, 0) and (4, 12).', '6'), activityRole: 'practice' },
    { ...answerBox('q4', 'Find the slope of the line through (0, 0) and (2, 14).', '7'), standard: 'A.3A' },
  ];
  return { questions, lessonSupports };
};

test('a later Classwork question on the same skill can open the earlier question\'s example, on request and faded', () => {
  const { questions, lessonSupports } = stepCardLesson();
  const context = (index) => lessonExampleContext({ questions, index, lessonSupports, builtInFor: () => false });
  const play = (index, role = 'classwork') => resolveWorkedExample({ question: questions[index], context: context(index), builtIn: null, activityRole: role, hintsAllowed: true });

  assert.deepEqual({ from: context(0).from, first: context(0).firstOnSkill }, { from: 'own', first: true });
  assert.equal(play(0).opensByItself, true);
  assert.equal(play(0).handOverAfter, null);

  // The same skill, later on Classwork: the earlier question's example, on request.
  assert.equal(coverageSkillOf(questions[1]), exampleSkillOf(questions[0]), 'the coverage report and the player read one skill');
  assert.deepEqual({ id: context(1).example.id, from: context(1).from, first: context(1).firstOnSkill }, { id: 'ex-slope', from: 'earlierSameSkill', first: false });
  const borrowed = play(1);
  assert.equal(borrowed.kind, 'authored');
  assert.equal(borrowed.opensByItself, false, 'it opened by itself on the first question only');
  // fade.fromStep 2: the student does step 2 onward, so one step is shown, then the hand-over.
  assert.equal(borrowed.handOverAfter, 1);
  assert.deepEqual(exampleSlides(borrowed).map((slide) => slide.kind), ['step', 'yourTurn']);
  assert.equal(exampleSlides(borrowed).at(-1).handedOver, true);
  assert.deepEqual(exampleSlides(borrowed, { showAll: true }).map((slide) => slide.kind), ['step', 'step', 'step', 'yourTurn'], 'the rest is there to ask for');

  // Classwork only: a Practice question names its own, and another skill borrows nothing.
  assert.equal(context(2).example, null);
  assert.equal(play(2, 'practice'), null);
  assert.equal(context(3).example, null);
  assert.equal(context(3).firstOnSkill, true);

  // A question the teacher excluded was never delivered: its example is not borrowed.
  const excluded = [{ ...questions[0], teacherExcluded: true }, ...questions.slice(1)];
  assert.equal(lessonExampleContext({ questions: excluded, index: 1, lessonSupports, builtInFor: () => false }).example, null);
  // An entry for other sections only is not for this one.
  const practiceOnly = { examples: [{ ...lessonSupports.examples[0], roles: ['practice'] }] };
  assert.equal(lessonExampleContext({ questions, index: 0, lessonSupports: practiceOnly, builtInFor: () => false }).example, null);
});

test('the first question on a skill is the first that had an example to show', () => {
  const { questions, lessonSupports } = stepCardLesson();
  const plain = questions.map(({ example: _example, ...question }) => question);
  // No example anywhere on the skill until the second question's built-in sibling.
  const builtInFor = (question) => question.questionId === 'q2';
  assert.equal(lessonExampleContext({ questions: plain, index: 0, lessonSupports, builtInFor }).firstOnSkill, true);
  assert.equal(lessonExampleContext({ questions: plain, index: 1, lessonSupports, builtInFor }).firstOnSkill, true, 'nothing was shown on the first, so this is where it opens');
  const three = [plain[0], plain[1], { ...plain[1], questionId: 'q2b' }];
  assert.equal(lessonExampleContext({ questions: three, index: 2, lessonSupports, builtInFor }).firstOnSkill, false);
  // A question whose skill cannot be told is not known to start one, unless it names its example.
  const { studentActions: _actions, standard: _standard, ...unknown } = plain[0];
  assert.equal(lessonExampleContext({ questions: [unknown], index: 0, lessonSupports, builtInFor }).firstOnSkill, false);
  assert.equal(lessonExampleContext({ questions: [{ ...unknown, example: 'ex-slope' }], index: 0, lessonSupports, builtInFor }).firstOnSkill, true);
});

/* ---------------------------------------------- never the student's own item */

test('an authored example is never the question\'s own problem, and never states its answer', () => {
  const question = { questionId: 'q', type: 'multiAnswer', prompt: 'A line passes through (0, -2) and (2, 4).', answerFields: [{ id: 'm', label: 'Slope', answer: '3' }, { id: 'eq', label: 'Equation', answer: 'y = 3x - 2' }] };
  const card = (entry) => authoredStepCard({ id: 'ex', source: 'authored', ...entry });
  const sibling = card({ problem: 'A line passes through (1, 4) and (5, 24).', steps: [{ show: 'm = (24 - 4) / (5 - 1) = 20 / 4 = 5', why: 'Rise over run.' }, { show: 'y = 5x - 1', why: 'Write m and b into y = mx + b.' }] });
  assert.equal(authoredExampleProblem(question, sibling), null);
  assert.equal(authoredExampleIsSafe(question, sibling), true);

  // The question's own problem, however it is spaced or cased.
  const own = card({ problem: 'a line passes through (0,-2) and (2,4).', steps: [{ show: 'm = 6 / 2', why: 'Rise over run.' }] });
  assert.equal(authoredExampleProblem(question, own).code, 'ownItem');
  const equation = { questionId: 'e', type: 'stepAlgebra', prompt: 'Solve 4x + 7 = x - 8 step by step.', equation: '4x + 7 = x - 8', answer: '-5' };
  assert.equal(authoredExampleProblem(equation, card({ sibling: { equation: '4x + 7 = x - 8' }, steps: [{ show: '3x + 7 = -8', why: 'Subtract x.' }] })).code, 'ownItem');

  // A step whose result is the question's answer gives it away: the same slope.
  const sameSlope = card({ problem: 'A line passes through (1, 2) and (3, 8).', steps: [{ show: 'm = (8 - 2) / (3 - 1) = 6 / 2 = 3', why: 'Rise over run.' }] });
  assert.deepEqual({ code: authoredExampleProblem(question, sameSlope).code, step: authoredExampleProblem(question, sameSlope).step }, { code: 'statesAnswer', step: 1 });
  assert.equal(authoredExampleProblem(question, card({ problem: 'Another line.', steps: [{ show: 'rise 6, run 2', why: 'So the slope is 3.' }] })).code, 'statesAnswer', 'said in the why');
  // An answer that is not a bare number is refused wherever it appears, as a built-in sibling's is.
  assert.equal(authoredExampleProblem(question, card({ problem: 'Another line.', steps: [{ show: 'so y = 3x - 2 here too', why: 'Write it out.' }] })).code, 'statesAnswer');
  // A number the example only uses on the way is not a statement of the answer: (3, 8) does not say "the slope is 3".
  assert.equal(authoredExampleProblem(question, card({ problem: 'A line passes through (1, 2) and (3, 12).', steps: [{ show: 'm = (12 - 2) / (3 - 1) = 10 / 2 = 5', why: 'Rise over run.' }] })), null);

  assert.deepEqual(statedNumbers('m = (8 - 2) / (3 - 1) = 6 / 2 = 3'), [3, 3]);
  assert.deepEqual(statedNumbers('2 = 3(1) + b, so b = -1'), [2, -1]);
  assert.deepEqual(statedNumbers('The slope is 3.'), [3]);
  assert.deepEqual(statedNumbers('the points (3, 8) and (1, 2)'), []);
  assert.deepEqual(statedNumbers('$x = \\frac{3}{4}$'), [0.75]);

  // One that fails is not shown: the built-in sibling plays in its place, or nothing does.
  const context = { sectionRole: 'classwork', exempt: false, example: { id: 'ex', source: 'authored', problem: 'A line passes through (1, 2) and (3, 8).', steps: [{ show: 'm = 6 / 2 = 3', why: 'Rise over run.' }] }, from: 'own', firstOnSkill: true };
  assert.equal(resolveWorkedExample({ question, context, builtIn: null, activityRole: 'classwork', hintsAllowed: true }), null);
  const fallback = resolveWorkedExample({ question, context, builtIn: { prompt: 'Find the slope through (0, 0) and (1, 9).', steps: ['Rise 9, run 1.'], answer: '9' }, activityRole: 'classwork', hintsAllowed: true });
  assert.equal(fallback.kind, 'builtIn');
  // A malformed entry never throws: nothing is shown.
  for (const broken of [null, 7, {}, { steps: 'x' }, { steps: [{}] }, { steps: [{ show: 'a', why: 'b' }] }, { problem: 'P', steps: [{ why: 'no show' }] }, { problem: 'P', moves: [{ op: 'subtract' }] }]) {
    assert.equal(authoredStepCard(broken), null, JSON.stringify(broken));
    assert.equal(resolveWorkedExample({ question, context: { ...context, example: broken }, builtIn: null, activityRole: 'classwork', hintsAllowed: true }), null);
  }
});

test('the built-in sibling is still checked by similarExampleIsSafe where it is built', () => {
  const similar = executableSource(read('src/platform/supports/workedExample/similarProblem.js'));
  const build = region(similar, 'export const buildSimilarWorkedExample', '\n};', 'the sibling builder');
  assert.match(build, /if \(similarExampleIsSafe\(question, example, \{ keepCase: keepCase === true \}\)\) \{\s*return \{/);
  // And the engine plays no sibling but that builder's.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const example = region(engine, 'const similarExample = useMemo(', '\n  );', 'the engine\'s example');
  assert.match(example, /builtIn: \(\) => buildSimilarWorkedExample\(processedQuestion, \{ seed: Number\(record\.variantIndex\) \|\| 0 \}\),/);
  const held = lesson();
  const question = held.questions[at(held, 'ls-cw-2')];
  const built = buildSimilarWorkedExample(question);
  assert.equal(similarExampleIsSafe(question, built), true);
  assert.equal(similarExampleIsSafe(question, { ...built, prompt: question.prompt }), false);
});

test('Pre-Flight tells the author when an example will not be shown on its question', () => {
  const held = lesson();
  assert.deepEqual(authoredExampleWarnings(held.compiled.assignmentV5), [], 'the guide\'s own lesson is clean');
  const source = JSON.parse(read(FIXTURE));
  const example = source.lessonSupports.examples.find((entry) => entry.id === 'ex-line-two-points');
  // The same slope as the question it teaches (3).
  example.problem = 'A line passes through (1, 2) and (3, 8). Find its slope, its y-intercept and its equation.';
  example.steps = [
    { show: 'm = (8 - 2) / (3 - 1) = 6 / 2 = 3', why: 'Slope is the change in y over the change in x.' },
    { show: 'y = 3x - 1', why: 'Write the slope and the y-intercept into y = mx + b.' },
  ];
  delete example.fade;
  const compiled = parseAssignmentBlueprintText(JSON.stringify(source));
  const model = buildAssignmentV5PreflightModel(compiled.assignmentV5);
  const warning = model.warnings.find((line) => /will not be shown to students/.test(line));
  assert.match(warning, /^Section 1 Question 4 example "ex-line-two-points" will not be shown to students on this question: step 1 states 3, which is one of this question's answers\./);
  assert.equal(model.errors.length, 0, 'a warning, never an error: the assignment still imports');
  // An assignment that writes no examples gains nothing.
  const { lessonSupports: _supports, ...plain } = held.compiled.assignmentV5;
  assert.deepEqual(authoredExampleWarnings(plain), []);
});

/* ------------------------------------------------------------- the slides */

test('one slide a step with its why, then Your turn; Next and Back never leave the example', () => {
  const held = lesson();
  const example = exampleFor(held, 'ls-cw-4');
  const slides = exampleSlides(example);
  assert.deepEqual(slides.map((slide) => slide.kind), ['step', 'step', 'step', 'step', 'yourTurn']);
  assert.deepEqual(slides.slice(0, 4).map(slideLabel), ['Step 1 of 4', 'Step 2 of 4', 'Step 3 of 4', 'Step 4 of 4']);
  assert.equal(slideLabel(slides[4]), 'Your turn');
  slides.slice(0, 4).forEach((slide) => assert.ok(slide.show && slide.why, 'every authored step carries its why'));
  assert.equal(slides[4].handedOver, false);
  // What Read aloud says and Translate reads: the move, then its why.
  assert.equal(slideReadingText(slides[2]), 'y = 5x - 1\nWhy: Write the slope and the y-intercept into y = mx + b.');
  assert.equal(slideReadingText(slides[4]), EXAMPLE_PLAYER_COPY.yourTurnLine);

  // The built-in sibling: its steps, then its answer on "Your turn".
  const builtIn = exampleSlides(exampleFor(held, 'ls-cw-2'));
  assert.equal(builtIn.at(-1).kind, 'yourTurn');
  assert.match(slideReadingText(builtIn.at(-1)), /^Answer: .+\nYour question uses different numbers/);
  assert.ok(builtIn.slice(0, -1).every((slide) => slide.kind === 'step' && slide.show && slide.why === ''));

  assert.equal(stepSlide(0, -1, 5), 0, 'Back on the first slide stays there');
  assert.equal(stepSlide(0, 1, 5), 1);
  assert.equal(stepSlide(4, 1, 5), 4, 'Next on the last slide stays there');
  assert.equal(stepSlide(9, 0, 5), 4);
  assert.deepEqual(exampleSlides(null), []);
  assert.deepEqual(exampleSlides({ steps: [] }), []);
});

const withModule = async (path, run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run((await server.ssrLoadModule(path)).default);
  } finally {
    await server.close();
  }
};

test('the player draws one slide: its place, the move, its why, Back and Next, and a polite live region', async () => {
  const held = lesson();
  const example = exampleFor(held, 'ls-cw-4');
  await withModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx', (WorkedExamplePlayer) => {
    const html = renderToStaticMarkup(React.createElement(WorkedExamplePlayer, { example, readAloud: { language: 'en' } }));
    assert.match(html, /data-worked-example-player="" data-example-kind="authored" data-example-slide="1"/);
    // The slide is announced whole, politely, when it changes.
    assert.match(html, /<div role="group" aria-roledescription="slide" aria-label="Step 1 of 4" aria-live="polite" aria-atomic="true"/);
    assert.match(html, /<p data-example-step-label=""[^>]*>Step 1 of 4<\/p>/);
    assert.match(html, /<p data-example-why=""[^>]*><strong>Why: <\/strong><span[^>]*>Slope is the change in y over the change in x\.<\/span><\/p>/);
    // One slide at a time: the later steps are not in the page.
    assert.doesNotMatch(html, /Check with the other point|Step 2 of 4|Your turn/);
    // Back is there and inert on the first slide (never removed: focus stays), then Next.
    assert.match(html, /<button type="button" data-example-back="" aria-disabled="true"[^>]*>Back<\/button><button type="button" data-example-next=""[^>]*>Next<\/button>/);
    // Read aloud, through the same actions a worked solution has.
    assert.match(html, /aria-label="Read the worked example, step 1 of 4 aloud"/);
    // A status that says nothing until the example opens by itself.
    assert.match(html, /<p role="status"[^>]*><\/p>/);
  });
  // The mathematics is drawn as a Solution Review step is, and the actions are the same ones.
  const player = executableSource(read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx'));
  assert.match(player, /<MathText as="p"[^>]*>\{slide\.show\}<\/MathText>/);
  assert.match(player, /<MathText>\{slide\.why\}<\/MathText>/);
  assert.match(read('src/SolutionReviewPanel.jsx'), /<li key=\{`a-\$\{index\}`\}[^>]*><MathText>\{line\}<\/MathText><\/li>/);
  assert.match(player, /<SupportedTextActions key=\{.+?\} text=\{slideReadingText\(slide\)\} readAloud=\{readAloud\} translation=\{translation\}/);
  // Slides change with no animation, so reduced motion has nothing to stop.
  assert.doesNotMatch(player, /transition|animation|@keyframes/);
  // The last button returns the student to their question.
  assert.match(player, /onClick=\{\(\) => \{ if \(last\) onYourTurn\?\.\(\); else go\(1\); \}\}/);
});

test('the Hint panel plays the example in the player, first when it opened by itself', async () => {
  const held = lesson();
  const example = exampleFor(held, 'ls-cw-4');
  await withModule('/src/platform/supports/hints/HintPanel.jsx', (HintPanel) => {
    const render = (props) => renderToStaticMarkup(React.createElement(HintPanel, { hints: [{ text: 'Find the rise.', source: 'authored' }], release: { canRevealNext: true }, similar: example, onReveal: () => {}, onOpenSimilar: () => {}, ...props }));
    const closed = render({ similarOpen: false });
    assert.match(closed, />Try a similar one<\/button>/, 'offered on request');
    assert.doesNotMatch(closed, /data-worked-example-player|Step 1 of 4/);
    const asked = render({ similarOpen: true });
    assert.match(asked, /<details open="" data-similar-example=""[^>]*><summary[^>]*>A similar problem, worked out<\/summary><div data-worked-example-player=""/);
    assert.ok(asked.indexOf('data-hint-cost-note') < asked.indexOf('data-similar-example'), 'asked for, it opens under the hints');
    const byItself = render({ similarOpen: true, similarOpenedByItself: true });
    assert.ok(byItself.indexOf('data-similar-example') < byItself.indexOf('data-hint-cost-note'), 'opened by itself, it comes first');
    assert.match(byItself, /data-example-opened-by-itself=""/);
    // With no example there is no control for one.
    const none = render({ similar: null, similarOpen: true, similarOpenedByItself: true });
    assert.doesNotMatch(none, /similar|data-worked-example-player|Your turn/i);
  });
});

/* ------------------------------------------------- the engine and its host */

test('the engine resolves the example under the hint permission, opens it by itself once, and records it', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const example = region(engine, 'const similarExample = useMemo(', '\n  );', 'the engine\'s example');
  assert.match(example, /\(\) => resolveWorkedExample\(\{/);
  assert.match(example, /context: stableExampleContext,/);
  assert.match(example, /hintsAllowed: hintControlAllowed,/, 'the permission hints follow');
  assert.match(engine, /const hintControlAllowed = toolHintsAllowed && !serverGrading && ladderRoleKnown;/);
  // Drawn only inside the Hint panel, which carries no example where there is none.
  assert.equal([...engine.matchAll(/similar=\{similarExample\}/g)].length, 1);
  assert.doesNotMatch(engine, /WorkedExamplePlayer/, 'the engine draws the player nowhere else');

  // By itself: only where the example says so, before the first try, on an open question.
  assert.match(engine, /const exampleOpensByItself = Boolean\(similarExample\?\.opensByItself && helpControlAvailable && !locked && !\(Number\(record\.attemptCount\) > 0\)\);/);
  const byItself = region(engine, 'const exampleOpensByItself = Boolean(', 'const finishSimilarExample = () => {', 'the effect that opens it');
  assert.match(byItself, /if \(!exampleOpensByItself\) return;/);
  // Once: an example already had on this question (kept per draft key) is not opened again.
  assert.match(byItself, /else if \(workedExampleUsed \|\| restoredSupportUse\(\{ draftKey, record \}\)\.workedExampleUsed\) \{\s*exampleByItselfRef\.current = \{ key, done: true \};\s*return;/);
  // Recorded exactly as a requested one is.
  assert.match(byItself, /setSimilarOpen\(true\);\s*setWorkedExampleUsed\(true\);/);
  const asked = region(engine, 'const openSimilarExample = (place) => {', '\n  };', 'the example on request');
  assert.match(asked, /if \(!similarExample\) return;/);
  assert.match(asked, /setWorkedExampleUsed\(true\);/);
  // What an attempt records is the same flag as before.
  assert.match(region(engine, 'const attemptSupportUsage = () => attemptSupportUsageFrom({', '});', 'the attempt\'s support use'), /workedExampleUsed,/);

  // "Your turn" closes the example and returns the student to their own question.
  const done = region(engine, 'const finishSimilarExample = () => {', '\n  };', 'Your turn');
  assert.match(done, /setSimilarOpen\(false\);/);
  assert.match(done, /focusFirstAnswerControl\(root\)/);
  assert.match(done, /behavior: scrollMotion\(\)/, 'no glide where motion is reduced');
  assert.match(engine, /onExampleDone=\{finishSimilarExample\}\s*similarOpenedByItself=\{similarOpenedByItself\}/);

  // The student's assignment screen hands over the lesson and each section's own role.
  const view = executableSource(read('src/app/student/assignmentWorkspaceView.jsx'));
  const handed = region(view, 'workedExampleLesson={renderMemo(', '}))}', 'the lesson handed to the engine');
  assert.match(handed, /index === currentQuestionIndex \? activeQuestionRole : resolveQuestionActivityRole\(\{ question, assignment \}\)/);
  assert.match(handed, /lessonSupports: assignment\?\.lessonSupports \|\| null,/);
  assert.match(engine, /lessonExampleContext\(\{ questions: lessonQuestions, index: lessonQuestionIndex, lessonSupports, roleOf: \(_question, at\) => lessonSectionRoles\?\.\[at\] \}\)/);
});

test('the leak gate looks for every sentence the player can put on a page', () => {
  // Its one-word labels are on every page for other reasons ("Next part"), so
  // the browser gate looks for the player itself as well.
  const ordinary = ['why', 'back', 'next', 'yourTurn'];
  for (const [name, words] of Object.entries(EXAMPLE_PLAYER_COPY)) {
    if (ordinary.includes(name)) continue;
    assert.ok(EXAMPLE_PLAYER_LEAK_TEXTS.includes(words), `${name} is one of the player's sentences`);
    assert.ok(LADDER_WORDS.includes(words), `${name}: "${words}" is not in the assessment leak list`);
  }
  assert.ok(LADDER_WORDS.includes('Try a similar one') && LADDER_WORDS.includes('See a similar problem worked'), 'and both offers of it');
  const gate = read('tests/browser/assessmentLeakGates.mjs');
  assert.match(gate, /\[data-worked-example-player\], \[data-similar-example\], \[data-similar-offer\]/);
});

/* ------------------------------------------------------------ persistence */

test('the lesson\'s examples are stored with the assignment and come back when it is edited', () => {
  const compiled = parseAssignmentBlueprintText(read(FIXTURE));
  const patch = canonicalV5PersistencePatch(compiled.assignmentV5);
  assert.deepEqual(patch.lessonSupports, compiled.assignmentV5.lessonSupports);
  const back = storedAssignmentToV5({ id: 'a1', ...patch });
  assert.deepEqual(back.lessonSupports, compiled.assignmentV5.lessonSupports);
  // So an edit is judged with the examples its questions name (it used to be refused for an id that named nothing).
  assert.deepEqual(buildAssignmentV5PreflightModel(back).errors, []);

  // An assignment that has none stores no field: every existing assignment is written as before.
  const { lessonSupports: _supports, ...plain } = compiled.assignmentV5;
  plain.sections = plain.sections.map((section) => ({ ...section, questions: section.questions.map(({ example: _example, ...question }) => question) }));
  assert.equal('lessonSupports' in canonicalV5PersistencePatch(plain), false);
  assert.equal('lessonSupports' in storedAssignmentToV5({ id: 'a2', ...canonicalV5PersistencePatch(plain) }), false);
  assert.deepEqual(lessonSupportFields({ lessonSupports: {} }), {});
  assert.deepEqual(lessonSupportFields({ lessonSupports: [] }), {});
  assert.deepEqual(lessonSupportFields(null), {});

  // The create path writes them too.
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  const payload = region(workspace, 'const assignmentPayloadBase = {', 'createdAt: new Date(),', 'the create payload');
  assert.match(payload, /\.\.\.lessonSupportFields\(reviewedV5\),/);
});

/* ------------------------------------------------------------------ score */

test('opening an example on Practice changes no score: only how the attempt is recorded', () => {
  const held = lesson();
  const index = at(held, 'ls-pr-1');
  const example = exampleFor(held, 'ls-pr-1');
  assert.ok(example && example.opensByItself === false, 'the Practice question has an example to open, on request');

  // Two students answer the same way: wrong, then right. One opened the example first.
  const answer = (supportUsage) => {
    const first = recordQuestionAttempt({ record: null, isCorrect: false, supportUsage, responseKey: 'x=2', maximumAttempts: 3 });
    return recordQuestionAttempt({ record: first.record, isCorrect: true, supportUsage, responseKey: 'x=-3', maximumAttempts: 3 });
  };
  const alone = answer(attemptSupportUsageFrom({}));
  const helped = answer(attemptSupportUsageFrom({ workedExampleUsed: true }));

  // Recorded as today: the teacher sees it, and the attempt is not counted as independent.
  assert.equal(helped.record.supportUsage.workedExampleUsed, true);
  assert.equal(helped.record.supportUsage.isMathematicallyIndependent, false);
  assert.equal(alone.record.supportUsage.workedExampleUsed, false);
  assert.equal(alone.record.supportUsage.isMathematicallyIndependent, true);

  // The result the student is given, and every number on the record, are the same.
  assert.deepEqual(helped.result, alone.result);
  const withoutSupport = ({ supportUsage: _usage, attempts, ...record }) => ({
    ...record,
    attempts: (attempts || []).map(({ supportUsage: _attemptUsage, timestamp: _timestamp, ...attempt }) => attempt),
  });
  const strip = (record) => JSON.parse(JSON.stringify(withoutSupport(record), (key, value) => (/At$|^timestamp$|Time$/.test(key) ? undefined : value)));
  assert.deepEqual(strip(helped.record), strip(alone.record));

  // And so are the assignment's grade and the Practice section's.
  const grade = (record) => {
    const tracker = { [index]: record };
    return { whole: splitGrade({ tracker, assignment: held.stored }), sections: splitGradesBySection({ tracker, assignment: held.stored }) };
  };
  assert.deepEqual(grade(helped.record), grade(alone.record));
  assert.ok(grade(helped.record).whole.attempted === 1);
});
