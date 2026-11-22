/*
 * WE-F: SPOT THE MISTAKE AND WHY THIS STEP? (docs/platform/WORKED_EXAMPLES.md
 * sections 4 and 5).
 *
 * What these tests hold:
 *
 *   1. THE SECTION RULES. Spot the mistake wherever an example is (Classwork
 *      and Practice); Why this step? on Classwork only; neither on a DOL, quiz
 *      or test, nor anywhere hints are withheld.
 *   2. SPOT THE MISTAKE READS THE QUESTION. The step and its right reason are
 *      the two parts of the question's own `solutionReview.commonError`; the
 *      two wrong choices are fixed and never true; nothing else is written.
 *      One that would state an answer of the question is not shown.
 *   3. WHY THIS STEP? READS THE EXAMPLE. Its choices are the example's own
 *      whys, the right one the step's; fewer than three different whys ask
 *      nothing.
 *   4. THE SCORE. Answering Spot the mistake never changes a score or an
 *      attempt; it is recorded as a fact (`spotTheMistakeUsed`), never whether
 *      the choice was right, and it leaves independence alone.
 *   5. THE SCREEN AND THE GATES. The player draws both with buttons, Skip,
 *      polite regions and Read aloud; QuestionEngine builds Spot the mistake
 *      only where the rule offers it; the assessment leak gate refuses their
 *      words and controls on a DOL, quiz or test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { ACTIVITY_POLICIES } from '../../src/platform/policies/activityPolicies.js';
import { getQuestionCredit, normalizeQuestionRecord, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { SPOT_THE_MISTAKE_LABEL, analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import { attemptSupportUsageFrom, emptySupportUse, rememberSupportUse, restoredSupportUse, supportUseFromRecord } from '../../src/platform/supports/supportUseMemory.js';
import { SPOT_THE_MISTAKE_GENERIC, splitCommonError, spotTheMistakeFor } from '../../src/platform/supports/workedExample/spotTheMistake.js';
import { exampleSectionRule, lessonExampleContext, workedExampleFor } from '../../src/platform/supports/workedExample/examplePlayer.js';
import {
  SPOT_THE_MISTAKE_INTRO,
  SPOT_THE_MISTAKE_OTHER,
  SPOT_THE_MISTAKE_QUESTION,
  SPOT_THE_MISTAKE_RIGHT,
  WHY_THIS_STEP_OTHER,
  WHY_THIS_STEP_PROMPT,
  WHY_THIS_STEP_RIGHT,
  exampleSlides,
  spotTheMistakeFeedback,
  spotTheMistakeReadingText,
  spotTheMistakeTranslationText,
  whyThisStepFor,
  whyThisStepReadingText,
} from '../../src/platform/supports/workedExample/exampleSlides.js';
import { ASSESSMENT_LEAK_TEXTS, EXAMPLE_CONTROL_SELECTORS } from '../browser/support/assessmentLadderWords.mjs';
import { supportSentences } from '../../src/platform/language/packs/esSupport.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const stored = (path) => {
  const parsed = parseAssignmentBlueprintText(read(path));
  return { id: 'lesson', ...canonicalV5PersistencePatch(parsed.assignmentV5) };
};

// A question with a common error that says what was done and what is wrong with it.
const SLOPE = Object.freeze({
  questionId: 'we-f-slope',
  type: 'multiAnswer',
  prompt: 'A line passes through (1, 2) and (5, 5). Find its slope.',
  answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4', inputProfile: 'text' }],
  solutionReview: { commonError: 'Dividing the change in x by the change in y: slope is the change in y over the change in x.' },
});

// ------------------------------------------------------- 1. the section rules

test('Spot the mistake wherever an example is; Why this step? on Classwork only; neither on a DOL, quiz or test', () => {
  const rule = (sectionRole, activityRole = sectionRole, hintsAllowed = true) => exampleSectionRule({ sectionRole, activityRole, hintsAllowed });
  assert.equal(rule('classwork').spotTheMistake, true);
  assert.equal(rule('classwork').whyThisStep, true);
  assert.equal(rule('practice').spotTheMistake, true);
  assert.equal(rule('practice').whyThisStep, false, 'Practice: Spot the mistake only (section 5)');
  // Classwork revisited as practice after its due date is played as Practice.
  assert.equal(rule('classwork', 'practice').whyThisStep, false);
  for (const role of ['dol', 'quiz', 'test']) {
    for (const activityRole of [role, 'practice', 'classwork']) {
      assert.equal(rule(role, activityRole).spotTheMistake, false, `${role} run as ${activityRole}`);
      assert.equal(rule(role, activityRole).whyThisStep, false, `${role} run as ${activityRole}`);
    }
    // Their own policy withholds hints, and both with them.
    assert.equal(rule(role, role, ACTIVITY_POLICIES[role].hintsAllowed).spotTheMistake, false);
  }
  for (const hintsAllowed of [false, null, 'yes']) {
    assert.equal(rule('classwork', 'classwork', hintsAllowed).spotTheMistake, false, `hintsAllowed ${hintsAllowed}`);
    assert.equal(rule('classwork', 'classwork', hintsAllowed).whyThisStep, false, `hintsAllowed ${hintsAllowed}`);
  }
});

// ------------------------------------------------ 2. spot the mistake: the words

test('the step and its reason are the two parts of the question\'s own common error', () => {
  const shapes = [
    ['Writing n² ÷ n¹⁰ = n⁵: subtract the exponents, do not divide them.', 'Writing n² ÷ n¹⁰ = n⁵.', 'Subtract the exponents, do not divide them.'],
    ['Writing 4x + 4y = 5 — the 5 counts tickets, not dollars.', 'Writing 4x + 4y = 5.', 'The 5 counts tickets, not dollars.'],
    ['Leaving 0 out of the domain; the friends may buy no buckets at all.', 'Leaving 0 out of the domain.', 'The friends may buy no buckets at all.'],
    ['Keeping < after dividing by −1, which shades the wrong half-plane.', 'Keeping < after dividing by −1.', 'That shades the wrong half-plane.'],
    ['Writing x = 0 after the x-terms cancel. When the variable disappears, the statement left decides.', 'Writing x = 0 after the x-terms cancel.', 'When the variable disappears, the statement left decides.'],
    // The earliest turn wins, and a colon inside $…$ is mathematics, not a turn.
    ['Reading $f: x \\mapsto 2x$ as a product: f names the rule, it does not multiply.', 'Reading $f: x \\mapsto 2x$ as a product.', 'F names the rule, it does not multiply.'],
  ];
  for (const [commonError, line, reason] of shapes) {
    assert.deepEqual(splitCommonError(commonError), { line, reason }, commonError);
  }
  // Only what was done, with nothing on what is wrong with it: the two would be the same words, so none.
  for (const single of ['Writing 6(x − 1) as 6x − 1.', 'Forgetting to reverse the symbol after dividing both sides by a negative number.', '', null, 42]) {
    assert.equal(splitCommonError(single), null, String(single));
  }
  // A Question Family slot still in it is not the student's numbers.
  assert.equal(splitCommonError('Writing x = {{m}}y: angle B is the larger angle, so y = {{m}}x.'), null);
});

test('three choices: the reason, and two fixed ones that are never what went wrong; nothing else is written', () => {
  const spot = spotTheMistakeFor(SLOPE);
  assert.ok(spot, 'a common error with both parts is shown');
  assert.equal(spot.line, 'Dividing the change in x by the change in y.');
  assert.equal(spot.explanation, SLOPE.solutionReview.commonError);
  assert.equal(spot.choices.length, 3);
  assert.deepEqual(spot.choices.filter((choice) => choice.right).map((choice) => choice.text), ['Slope is the change in y over the change in x.']);
  assert.deepEqual(spot.choices.filter((choice) => !choice.right).map((choice) => choice.text).sort(), [...SPOT_THE_MISTAKE_GENERIC].sort());
  // Both fixed choices say the step is correct, which a step holding a known mistake is not.
  for (const generic of SPOT_THE_MISTAKE_GENERIC) assert.match(generic, /(correct|right)/);
  // Every word shown is the question's or the fixed choices'.
  const words = [spot.line, ...spot.choices.map((choice) => choice.text)];
  const commonError = SLOPE.solutionReview.commonError.toLowerCase();
  for (const piece of words) {
    assert.ok(SPOT_THE_MISTAKE_GENERIC.includes(piece) || commonError.includes(piece.replace(/\.$/, '').toLowerCase()), piece);
  }
  // The same question asks the same way every time; a different seed may move the right one.
  assert.deepEqual(spotTheMistakeFor(SLOPE), spot);
  const places = new Set([0, 1, 2, 3, 4].map((seed) => spotTheMistakeFor(SLOPE, { seed }).choices.findIndex((choice) => choice.right)));
  assert.ok(places.size > 1, 'the right one is not always in the same place');
  // Nothing to read: nothing shown.
  for (const question of [{ ...SLOPE, solutionReview: null }, { ...SLOPE, solutionReview: { commonError: '' } }, { ...SLOPE, solutionReview: { commonError: 'Writing 6(x − 1) as 6x − 1.' } }, null]) {
    assert.equal(spotTheMistakeFor(question), null);
  }
});

test('a common error that would state the question\'s answer, or be its prompt, is not shown', () => {
  // Its reason names the answer.
  const naming = { ...SLOPE, solutionReview: { commonError: 'Dividing the change in x by the change in y: the slope is 3/4, the change in y over the change in x.' } };
  assert.equal(spotTheMistakeFor(naming), null);
  // Its step names the answer.
  const stepNaming = { ...SLOPE, answerFields: [{ id: 'x', label: 'x', answer: '-4', inputProfile: 'text' }], solutionReview: { commonError: 'Writing x = -4 before the check: check it in the first equation every time.' } };
  assert.equal(spotTheMistakeFor(stepNaming), null);
  // Its step is the question's own prompt.
  const prompt = { ...SLOPE, prompt: 'Dividing the change in x by the change in y.', solutionReview: SLOPE.solutionReview };
  assert.equal(spotTheMistakeFor(prompt), null);
});

test('over the real lessons, every Spot the mistake shown reads its question and states none of its answers', () => {
  const lessons = [
    'teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables.json',
    'teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json',
    'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json',
  ];
  let shown = 0;
  let refused = 0;
  for (const path of lessons) {
    for (const question of getStoredAssignmentQuestions(stored(path))) {
      if (!['classwork', 'practice'].includes(String(question.activityRole)) || !question.solutionReview?.commonError) continue;
      const spot = spotTheMistakeFor(question);
      if (!spot) { refused += 1; continue; }
      shown += 1;
      const answers = questionAnswerValues(question);
      for (const piece of [spot.line, ...spot.choices.map((choice) => choice.text), spot.explanation]) {
        assert.equal(hintRevealsAnswer(piece, answers), false, `${question.questionId}: "${piece}" states an answer`);
      }
      const parts = splitCommonError(question.solutionReview.commonError);
      assert.equal(spot.line, parts.line, question.questionId);
      assert.deepEqual(spot.choices.filter((choice) => choice.right).map((choice) => choice.text), [parts.reason], question.questionId);
    }
  }
  assert.ok(shown >= 10, `${shown} shown`);
  assert.ok(refused >= 1, 'some are held back: the guard is doing work');
});

// --------------------------------------------- 3. why this step? reads the example

const guideLesson = () => stored('tests/platform/fixtures/learningSupportsLessonFragment.json');
const classworkReplay = () => {
  const assignment = guideLesson();
  const questions = getStoredAssignmentQuestions(assignment);
  const question = questions.find((entry) => entry.questionId === 'ls-cw-2');
  const context = lessonExampleContext({ questions, index: questions.indexOf(question), sectionRole: 'classwork', roleOf: (entry) => entry.activityRole, lessonSupports: assignment.lessonSupports });
  return workedExampleFor(question, { lessonSupports: context.lessonSupports, sectionRole: 'classwork', assignmentProblems: context.assignmentProblems });
};

test('Why this step? asks about one step, before it plays, with the example\'s own whys', () => {
  const example = classworkReplay();
  assert.equal(example?.format, 'replay');
  const slides = exampleSlides(example);
  const check = whyThisStepFor(slides);
  assert.ok(check);
  const stepSlides = slides.filter((slide) => slide.kind === 'step');
  const target = slides[check.stepAt];
  // The first step with a why, asked on the slide before it, which names its move.
  assert.equal(target, stepSlides.find((slide) => slide.why));
  assert.equal(check.askAt, check.stepAt - 1);
  assert.equal(check.nextStep, target.board.label);
  // Three choices: that step's own why, and two other steps' whys; the right one is the step's.
  assert.equal(check.choices.length, 3);
  assert.deepEqual(check.choices.filter((choice) => choice.right).map((choice) => choice.text), [target.why]);
  const whys = stepSlides.map((slide) => slide.why);
  for (const choice of check.choices) assert.ok(whys.includes(choice.text), choice.text);
  assert.equal(new Set(check.choices.map((choice) => choice.text)).size, 3, 'three different reasons');
  // Read aloud says the move, the question and each choice.
  const spoken = whyThisStepReadingText(check);
  assert.ok(spoken.includes(WHY_THIS_STEP_PROMPT) && spoken.includes('Choice 3:'), spoken);
});

test('fewer than three different whys ask nothing (a family\'s text steps have none)', () => {
  const steps = (whys) => ({ source: 'authored', format: 'steps', prompt: 'A problem like yours.', steps: whys.map((why, index) => ({ show: `Line ${index + 1}`, why })), answer: '' });
  assert.equal(whyThisStepFor(exampleSlides(steps(['Undo the adding.', 'Undo the adding.', 'Undo the multiplying.']))), null);
  assert.equal(whyThisStepFor(exampleSlides(steps(['Undo the adding.', '', 'Undo the multiplying.']))), null);
  assert.ok(whyThisStepFor(exampleSlides(steps(['Undo the adding.', 'Undo the multiplying.', 'Check it.']))));
  const family = { source: 'family', format: 'steps', prompt: 'Write 10/15 in lowest terms.', steps: ['5 divides 10 and 15.', '10 ÷ 5 = 2 and 15 ÷ 5 = 3.', 'So it is 2/3.'], answer: '2/3' };
  assert.equal(whyThisStepFor(exampleSlides(family)), null);
});

// ------------------------------------------------------------------ 4. the score

test('answering Spot the mistake changes no score and uses no attempt; it is a fact, not a grade', () => {
  const usage = (spotTheMistakeUsed) => attemptSupportUsageFrom({ supportUsage: {}, workedExampleUsed: true, spotTheMistakeUsed });
  assert.equal(usage(true).spotTheMistakeUsed, true);
  assert.equal('spotTheMistakeUsed' in usage(false), false, 'absent unless answered: an attempt without it records what it did before');
  // It leaves independence to the example's own flags.
  assert.equal(attemptSupportUsageFrom({ supportUsage: {}, workedExampleShown: true, spotTheMistakeUsed: true }).isMathematicallyIndependent, true);
  const SEQUENCES = {
    'right first time': [{ isCorrect: true }],
    'a miss, then right': [{ isCorrect: false, partialCreditPercent: 50 }, { isCorrect: true }],
    'never right': [{ isCorrect: false, partialCreditPercent: 25 }, { isCorrect: false, partialCreditPercent: 50 }, { isCorrect: false, partialCreditPercent: 50 }],
  };
  const play = (attempts, answered, policy) => attempts.reduce((record, attempt, index) => recordQuestionAttempt({
    record,
    ...attempt,
    questionDetails: `try ${index + 1}`,
    timeSpent: 40,
    responseKey: `try-${index + 1}`,
    supportUsage: usage(answered),
    maximumAttempts: policy.attempts,
    occurredAt: '2026-11-22T15:00:00.000Z',
  }).record, null);
  for (const role of ['classwork', 'practice']) {
    for (const [name, attempts] of Object.entries(SEQUENCES)) {
      const policy = ACTIVITY_POLICIES[role];
      const without = play(attempts, false, policy);
      const answered = play(attempts, true, policy);
      const label = `${role}, ${name}`;
      assert.equal(answered.supportUsage.spotTheMistakeUsed, true, `${label}: the fact is recorded`);
      assert.equal('spotTheMistakeUsed' in without.supportUsage, false, `${label}: and not invented`);
      assert.equal(getQuestionCredit(answered), getQuestionCredit(without), `${label}: the credit`);
      assert.equal(answered.status, without.status);
      assert.equal(answered.attemptCount, without.attemptCount, `${label}: no attempt`);
      assert.equal(answered.bestPartialCredit, without.bestPartialCredit);
      const strip = (record) => ({ ...record, supportUsage: { ...record.supportUsage, spotTheMistakeUsed: null }, attempts: record.attempts?.map((entry) => ({ ...entry, supportUsage: null })) });
      assert.deepEqual(strip(answered), strip(without), `${label}: only the fact differs`);
      assert.equal(normalizeQuestionRecord(answered).supportUsage.spotTheMistakeUsed, true, `${label}: it survives a normalise`);
    }
  }
  // Only true is kept: whether the choice was right is never there to keep.
  assert.equal('spotTheMistakeUsed' in normalizeQuestionRecord({ status: 'correct', attemptCount: 1, totalAttempts: 1, supportUsage: { spotTheMistakeUsed: 'right' } }).supportUsage, false);
  for (const key of Object.keys(usage(true))) assert.doesNotMatch(key, /mistake(Right|Correct|Choice)/i);
});

test('it is remembered across a remount and named for the teacher', () => {
  assert.equal(emptySupportUse().spotTheMistakeUsed, false);
  const store = new Map();
  const storage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } };
  rememberSupportUse('draft-f', { spotTheMistakeUsed: true }, storage);
  assert.equal(restoredSupportUse({ draftKey: 'draft-f', record: null, storage }).spotTheMistakeUsed, true);
  assert.equal(supportUseFromRecord({ attemptCount: 1, supportUsage: { spotTheMistakeUsed: true } }).spotTheMistakeUsed, true);
  const question = { questionId: 'q1', type: 'multiAnswer', prompt: 'p', answerFields: [{ id: 'a', answer: '1' }] };
  const analyse = (supportUsage) => analyzeAssignmentQuestions({
    assignment: { id: 'a1', schemaVersion: 5, sections: [{ id: 'classwork', role: 'classwork', questions: [question] }] },
    student: { id: 's1', gradesByAssignment: { a1: { 0: recordQuestionAttempt({ record: null, isCorrect: true, supportUsage }).record } } },
  });
  const supportsOf = (result) => (Array.isArray(result) ? result : result?.questions || [])[0]?.lastAttemptSupports;
  assert.deepEqual(supportsOf(analyse(attemptSupportUsageFrom({ supportUsage: {}, workedExampleUsed: true, spotTheMistakeUsed: true }))), ['Worked example', SPOT_THE_MISTAKE_LABEL]);
  assert.deepEqual(supportsOf(analyse(attemptSupportUsageFrom({ supportUsage: {}, workedExampleUsed: true }))), ['Worked example']);
});

// ------------------------------------------------------- 5. the screen and the gates

const withModules = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const player = await server.ssrLoadModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx');
    return await run({
      MathText: (await server.ssrLoadModule('/src/components/common/MathText.jsx')).default,
      SupportedTextActions: (await server.ssrLoadModule('/src/platform/supports/SupportedText.jsx')).SupportedTextActions,
      Player: player.default,
      SpotTheMistake: player.SpotTheMistake,
    });
  } finally {
    await server.close();
  }
};

test('the player asks Why this step? on Classwork with buttons and Skip, and draws Spot the mistake with a polite answer', async () => {
  const example = classworkReplay();
  await withModules(({ Player, SpotTheMistake, MathText, SupportedTextActions }) => {
    const render = (props) => renderToStaticMarkup(React.createElement(Player, { example, MathText, SupportedTextActions, ...props }));
    // Classwork: the problem slide names the first move and asks for its reason, outside the slide's live region.
    const asking = render({ whyThisStep: true, readAloud: { language: 'en' } });
    assert.match(asking, /data-example-slide-kind="problem"/);
    assert.match(asking, /<fieldset data-why-this-step=""[^>]*><legend[^>]*>Why this step\? Pick the reason before it plays\.<\/legend>/);
    assert.equal((asking.match(/data-why-choice="/g) || []).length, 3);
    assert.match(asking, /<button type="button" data-why-skip=""[^>]*>Skip<\/button>/);
    assert.match(asking, /data-why-next-step=""/);
    assert.match(asking, /<p role="status" aria-live="polite" data-why-feedback=""[^>]*><\/p>/, 'the answer region is there, empty, before a choice');
    assert.doesNotMatch(asking.slice(asking.indexOf('data-example-slide=""'), asking.indexOf('data-why-this-step')), /data-why-choice/, 'not inside the slide');
    // One Read aloud for the slide, and its text holds the question.
    assert.equal((asking.match(/aria-label="Read the worked example, the problem aloud"/g) || []).length, 1);
    // Practice (whyThisStep false), or an example with no whys: nothing asked.
    assert.doesNotMatch(render({ whyThisStep: false }), /data-why-this-step/);
    assert.doesNotMatch(render({ whyThisStep: true, example: { source: 'family', prompt: 'Write 10/15 in lowest terms.', steps: ['5 divides 10 and 15.', '10 ÷ 5 = 2.'], answer: '2/3' } }), /data-why-this-step/);
    // Spot the mistake is never on a slide before the last.
    assert.doesNotMatch(render({ whyThisStep: true, spotTheMistake: spotTheMistakeFor(SLOPE) }), /data-spot-the-mistake/);

    const spot = spotTheMistakeFor(SLOPE);
    const drawSpot = (chosen) => renderToStaticMarkup(React.createElement(SpotTheMistake, { MathText, SupportedTextActions, spot, chosen, onChoose: () => {}, readAloud: { language: 'en' } }));
    const open = drawSpot(null);
    assert.match(open, /<section aria-label="Spot the mistake" data-spot-the-mistake=""/);
    assert.match(open, /data-spot-line=""[^>]*><span>Dividing the change in x by the change in y\.<\/span>/);
    assert.equal((open.match(/data-spot-choice="[^"]*" aria-pressed="false"/g) || []).length, 3, 'three buttons, none pressed');
    assert.match(open, /<p role="status" aria-live="polite" data-spot-feedback=""[^>]*><\/p>/);
    assert.match(open, /aria-label="Read spot the mistake aloud"/);
    const right = spot.choices.find((choice) => choice.right).id;
    const other = spot.choices.find((choice) => !choice.right).id;
    const answered = drawSpot(right);
    assert.match(answered, new RegExp(`data-spot-choice="${right}" aria-pressed="true"[^>]*><span[^>]*>Your choice</span>`));
    assert.equal((answered.match(/aria-disabled="true"/g) || []).length, 2, 'the other two are no longer available');
    assert.match(answered, /data-spot-feedback=""[^>]*><span>Yes, that is what went wrong\. Dividing the change in x/);
    assert.match(drawSpot(other), /data-spot-feedback=""[^>]*><span>Not this one\. This is what went wrong\. Dividing the change in x/);
  });
  // Where the player puts them: Spot the mistake after the last slide of a whole example; Next past an open question skips it.
  const player = executableSource(read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx'));
  assert.match(player, /const spotShown = Boolean\(spotTheMistake\) && slide\.last && example\?\.faded !== true;/);
  assert.match(player, /const whyCheck = useMemo\(\(\) => \(whyThisStep === true \? whyThisStepFor\(slides\) : null\), \[whyThisStep, slides\]\);/);
  const next = region(player, 'const next = () => {', '};', 'Next');
  assert.match(next, /if \(whyPending\) settleWhy\(\{ skipped: true \}\);/);
  const answer = region(player, 'const answerWhy = (answer) => {', '};', 'a choice or Skip');
  assert.match(answer, /nextRef\.current\?\.focus\(\);/, 'the choices go, so focus goes to Next');
  // Once per example.
  assert.match(region(player, 'const settleWhy = (answer) => {', '};', 'settling the question'), /whyAnswers\.set\(exampleKey\(example\), answer\)/);
  assert.match(player, /const whyPending = whyHere && !whyAnswer && !whyAnswers\.has\(exampleKey\(example\)\);/);
  // The player still imports React and its own slides only.
  const imports = [...read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx').matchAll(/^import [^;]*? from '([^']+)';/gms)].map((match) => match[1]);
  assert.deepEqual(imports, ['react', './exampleSlides.js']);
});

test('the words Read aloud and Translate are given', () => {
  const spot = spotTheMistakeFor(SLOPE);
  const right = spot.choices.find((choice) => choice.right).id;
  assert.equal(spotTheMistakeFeedback(spot, null), '');
  assert.equal(spotTheMistakeFeedback(spot, right), `${SPOT_THE_MISTAKE_RIGHT} ${SLOPE.solutionReview.commonError}`);
  assert.ok(spotTheMistakeFeedback(spot, spot.choices.find((choice) => !choice.right).id).startsWith(SPOT_THE_MISTAKE_OTHER));
  const spoken = spotTheMistakeReadingText(spot);
  for (const piece of [SPOT_THE_MISTAKE_INTRO, spot.line, SPOT_THE_MISTAKE_QUESTION, 'Choice 1:', 'Choice 3:']) assert.ok(spoken.includes(piece), piece);
  assert.ok(spotTheMistakeReadingText(spot, right).endsWith(SLOPE.solutionReview.commonError));
  // Translate: one sentence a line, and the platform's own sentences are in the Spanish pack.
  const lines = spotTheMistakeTranslationText(spot).split('\n');
  assert.deepEqual(lines.slice(0, 3), [SPOT_THE_MISTAKE_INTRO, spot.line, SPOT_THE_MISTAKE_QUESTION]);
  const known = new Set(supportSentences.map(([english]) => english));
  for (const sentence of [SPOT_THE_MISTAKE_INTRO, SPOT_THE_MISTAKE_QUESTION, ...SPOT_THE_MISTAKE_GENERIC, SPOT_THE_MISTAKE_RIGHT, 'Why this step?', 'Pick the reason before it plays.']) {
    assert.ok(known.has(sentence), `the Spanish pack knows "${sentence}"`);
  }
});

test('QuestionEngine builds Spot the mistake only where the rule offers it, and records the fact', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const built = region(engine, 'const spotTheMistake = useMemo(', ');', 'Spot the mistake');
  assert.match(built, /\(\) => \(exampleRule\.spotTheMistake && similarExample \? spotTheMistakeFor\(processedQuestion, \{ seed: Number\(record\.variantIndex\) \|\| 0 \}\) : null\)/);
  const panel = region(engine, 'const hintPanel = helpControlAvailable ? (', ') : null;', 'the hint panel');
  assert.match(panel, /whyThisStep=\{exampleRule\.whyThisStep\}/);
  assert.match(panel, /spotTheMistake=\{shownExample\?\.faded === true \? null : spotTheMistake\}/, 'a faded example hands over without one');
  assert.match(panel, /onSpotTheMistake=\{\(\) => setSpotTheMistakeUsed\(true\)\}/);
  assert.match(region(engine, 'const attemptSupportUsage = () => attemptSupportUsageFrom({', '});', 'what an attempt records'), /spotTheMistakeUsed,/);
  assert.match(engine, /rememberSupportUse\(draftKey, \{[^}]*spotTheMistakeUsed[^}]*\}\);/);
  // The panel hands both to the player, and builds neither itself.
  const hintPanel = executableSource(read('src/platform/supports/hints/HintPanel.jsx'));
  const opened = region(hintPanel, '<WorkedExamplePlayer', '/>', 'the player');
  for (const prop of [/whyThisStep=\{whyThisStep\}/, /spotTheMistake=\{spotTheMistake\}/, /onSpotTheMistake=\{onSpotTheMistake\}/]) assert.match(opened, prop);
  assert.doesNotMatch(hintPanel, /spotTheMistakeFor|whyThisStepFor/);
  // No grade path reads the fact.
  for (const file of ['src/platform/teacher/gradeEvidence.js', 'src/platform/publishing/compositeGradeCalculator.js', 'src/masteryEngine.js', 'functions/shared/practiceMastery.mjs']) {
    assert.doesNotMatch(executableSource(read(file)), /spotTheMistake/, `${file} reads no Spot the mistake`);
  }
});

test('the assessment leak gate refuses their words and controls on a DOL, quiz or test', () => {
  for (const words of [SPOT_THE_MISTAKE_INTRO, SPOT_THE_MISTAKE_QUESTION, SPOT_THE_MISTAKE_RIGHT, SPOT_THE_MISTAKE_OTHER, ...SPOT_THE_MISTAKE_GENERIC, WHY_THIS_STEP_PROMPT, WHY_THIS_STEP_RIGHT, WHY_THIS_STEP_OTHER]) {
    assert.ok(ASSESSMENT_LEAK_TEXTS.includes(words), words);
  }
  for (const selector of ['[data-spot-the-mistake]', '[data-spot-choice]', '[data-spot-feedback]', '[data-why-this-step]', '[data-why-choice]', '[data-why-skip]']) {
    assert.ok(EXAMPLE_CONTROL_SELECTORS.includes(selector), selector);
  }
  // Every selector names an attribute the player really draws.
  const player = read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx');
  for (const selector of EXAMPLE_CONTROL_SELECTORS.filter((entry) => /data-(spot|why)-/.test(entry))) {
    assert.ok(player.includes(selector.slice(1, -1)), selector);
  }
  // The gate's DOL and test page carries a common error, so a leak would be seen there.
  assert.match(read('tests/browser/assessmentLeakGatesMain.jsx'), /commonError: 'Dividing the change in x by the change in y: LEAKCHECK-ERROR/);
});
