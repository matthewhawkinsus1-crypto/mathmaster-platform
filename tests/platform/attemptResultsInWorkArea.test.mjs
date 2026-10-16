/*
 * STUDENT PASS 3, BATCH 1: WHAT A SUBMIT PRODUCES IS WHERE THE STUDENT CAN SEE
 * IT, IN THE ORDER IT IS READ.
 *
 *   RUN-1   The outcome, the worked solution and the way on rendered after the
 *           question container. On a phone that container is a fixed,
 *           clipping box, so after a miss "Not quite…" sat at y=869 of 844 and
 *           the worked solution at y=1244, unreachable; on a Chromebook the
 *           message landed under the sticky action bar. They render inside the
 *           work area now, and the result is brought into view once per submit.
 *   RUN-6   A final miss stacked five "closed" messages, and the big Next card
 *           came before the worked solution. One closed card now: the verdict
 *           once, what the student wrote, the solution — then the way on.
 *   HELP-8  The first keystroke after a miss cleared everything the student
 *           was reading; the last miss stays, dimmed, until the next submit.
 *   HELP-15 The device's grading result never named its surface, so the
 *           misconception classifiers keyed `surfaceId/mode` never ran on the
 *           device: a slope/intercept swap got "Focus on: Slope".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { ATTEMPT_RESULT_FOCUS_ATTRIBUTE, attemptResultTarget, revealAttemptResult } from '../../src/platform/student/attemptResultsReveal.js';
import { displayGradingSurface } from '../../src/platform/grading/displayGradingSurface.js';
import { diagnoseMiss } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import graphingGrader from '../../functions/shared/serverGrading/tools/graphing.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from '../../src/platform/grading/sharedAnswerState.js';

const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));

const fakeRegion = (target) => ({
  querySelector: (selector) => (selector === `[${ATTEMPT_RESULT_FOCUS_ATTRIBUTE}]` ? target : null),
});

test('the result of a submit is brought into view, only as far as needed, and still on reduced motion', () => {
  const calls = [];
  const target = { scrollIntoView: (options) => calls.push(options) };
  assert.equal(revealAttemptResult(fakeRegion(target)), true);
  assert.deepEqual(calls.pop(), { block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  assert.equal(revealAttemptResult(fakeRegion(target), { reducedMotion: true }), true);
  assert.deepEqual(calls.pop(), { block: 'nearest', inline: 'nearest', behavior: 'auto' }, 'reduced motion jumps instead of gliding');
  // Nothing marked, or nothing to scroll: nothing happens, and nothing throws.
  assert.equal(revealAttemptResult(fakeRegion(null)), false);
  assert.equal(revealAttemptResult(fakeRegion({})), false);
  assert.equal(revealAttemptResult(null), false);
  assert.equal(attemptResultTarget({}), null);
  assert.equal(attemptResultTarget(fakeRegion(target)), target);
});

test('the engine reveals the result once per submit, unless a tool shows it in its own result area', () => {
  assert.match(engine, /const resultToReveal = feedback && !outcomeInTool \? feedback : null;/);
  const effect = region(engine, 'const resultToReveal = feedback && !outcomeInTool ? feedback : null;', '}, [resultToReveal]);', 'the reveal effect');
  assert.match(effect, /window\.requestAnimationFrame\(\(\) => \{\s*revealAttemptResult\(attemptResultsRef\.current, \{ reducedMotion: prefersReducedMotion\(\) \}\);/);
  assert.match(effect, /return \(\) => window\.cancelAnimationFrame\(frame\);/);
  assert.match(engine, /<div ref=\{attemptResultsRef\} className="mathmaster-attempt-results" data-attempt-results="">/);
});

test('the results render inside the work area, after the tool, and nowhere else', () => {
  const uses = engine.match(/\{attemptResults\}/g) || [];
  assert.equal(uses.length, 1, 'rendered once');
  // Inside the Work View figure, right after the work area itself, so the
  // Correct watermark and the back-up step still cover only the tool.
  assert.match(engine, /\n {6}<\/div>\n {6}\{attemptResults\}\n {6}<\/EnlargeableFigure>/);
  const figure = region(engine, '<EnlargeableFigure', '</EnlargeableFigure>', 'the work view figure');
  assert.ok(figure.indexOf('className="mathmaster-question-tool-workspace"') < figure.indexOf('{attemptResults}'));
});

test('a closed question reads in order: verdict, what was written, the solution, then the way on', () => {
  const results = region(engine, 'const attemptResults = (', '\n  );\n', 'the results area');
  const card = region(results, '<section className="mathmaster-closed-question-card"', '</section>', 'the closed card');
  const inCard = (needle) => {
    const index = card.indexOf(needle);
    assert.ok(index >= 0, `the closed card has ${needle}`);
    return index;
  };
  assert.ok(inCard('<div role="status"') < inCard('data-your-answer') && inCard('data-your-answer') < inCard('{closedReview}'),
    'the verdict, then what the student wrote, then the worked solution');
  const cardEnd = results.indexOf(card) + card.length;
  const section = results.indexOf('className={`mathmaster-section-completion-card');
  const next = results.indexOf('className="mathmaster-success-next-question"');
  assert.ok(cardEnd < section && section < next, 'only then the milestone and the way on');
  // The miss box steps aside for a closed question; the closed card says it once.
  assert.match(results, /\{feedback && !feedback\.blocked && showOutcomeFeedback && !outcomeInTool && !isExpired && \(/);
  // Each result a submit can produce is what the reveal brings into view.
  for (const marked of [/<div role="alert" \{\.\.\.ATTEMPT_RESULT_FOCUS\}/, /className="mathmaster-closed-question-card"[\s\S]{0,700}<div role="status" \{\.\.\.ATTEMPT_RESULT_FOCUS\}/, /<section\s+\{\.\.\.ATTEMPT_RESULT_FOCUS\}\s+className=\{`mathmaster-section-completion-card/, /\{terminalFeedbackHidden && \(\s*<div role="status" \{\.\.\.ATTEMPT_RESULT_FOCUS\}/]) {
    assert.match(results, marked);
  }
});

test('the last miss stays, dimmed, until the next submit, and is not announced twice', () => {
  const results = region(engine, 'const attemptResults = (', '\n  );\n', 'the results area');
  const previous = region(results, '{!feedback && previousMiss && !locked && showOutcomeFeedback && (', '\n      )}', 'the last try');
  assert.match(previous, /data-attempt-feedback="previous"/);
  assert.match(previous, />Your last try</);
  assert.doesNotMatch(previous, /role="status"|aria-live/, 'it was announced when it was new');
  // Kept from the box as it was shown; dropped on a new question or a reset.
  assert.match(engine, /lastMissShownRef\.current = \{ attempt: missShownAttempt, text: attemptOutcomeText, specific: attemptOutcomeSpecific, focus: attemptOutcomeFocus \};/);
  assert.match(engine, /setPreviousMiss\(lastMissShownRef\.current\);\s*setFeedback\(null\);/);
  assert.ok((engine.match(/setPreviousMiss\(null\);\s*lastMissShownRef\.current = null;/g) || []).length >= 2, 'a new question and a reset start clean');
});

test('the device names the grading surface, so a slope/intercept swap gets its own message', () => {
  assert.deepEqual(displayGradingSurface({ type: 'graphing', m: 2, b: -3 }), { surfaceId: 'graphing', mode: 'lineFeatures' });
  assert.deepEqual(displayGradingSurface({ type: 'literal' }), {}, 'an ordinary answer has no structured surface');
  assert.deepEqual(displayGradingSurface({ type: 'constructor' }), {}, 'an own-property lookup, not the prototype');
  assert.deepEqual(displayGradingSurface(null), {});
  assert.deepEqual(displayGradingSurface({ type: '  ' }), {});

  // y = 2x − 3, read back as slope −3 and intercept 2, graded the way the
  // device grades it (GraphLine → the shared grader → answer state), then
  // carried the way QuestionEngine carries it.
  const question = { type: 'graphing', prompt: 'Read the slope and the y-intercept.', m: 2, b: -3 };
  const answerState = answerStateFromSharedGrading(gradeToolCheck(graphingGrader, question, { slope: '-3', intercept: '2' }));
  const parts = (answerState.parts || []).map((part) => ({ ...part }));
  const named = diagnoseMiss({ question, grading: { graded: true, isCorrect: Boolean(answerState.isCorrect), parts, ...displayGradingSurface(question) } });
  assert.equal(named?.source, 'classifier');
  assert.equal(named?.code, 'slope-intercept-swapped');
  assert.equal(named?.message, studentMisconceptionMessage('slope-intercept-swapped'));
  // Without the surface the classifier never ran (the defect).
  const unnamed = diagnoseMiss({ question, grading: { graded: true, isCorrect: false, parts } });
  assert.notEqual(unnamed?.source, 'classifier');

  // The device-graded result carries it.
  assert.match(engine, /grading: \{ graded: true, isCorrect: Boolean\(answerState\.isCorrect\), parts: \(answerState\.parts \|\| \[\]\)\.map\(\(part\) => \(\{ \.\.\.part \}\)\), \.\.\.displayGradingSurface\(processedQuestion\) \},/);
});
