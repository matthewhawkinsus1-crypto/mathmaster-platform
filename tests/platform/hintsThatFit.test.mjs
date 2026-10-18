/*
 * STUDENT PASS 3, WAVE 6: HINTS THAT FIT (HELP-16, HELP-23, "Also noted").
 *
 * HELP-16. The leak guard dropped 32 of 200 teacher-written hints, silently.
 *   "The x-intercept is where the output is 0: solve 0 = 3x − 8." went
 *   because 3 is the slope. A number the hint only QUOTES from the problem —
 *   inside the prompt's own expression or point — is no longer counted; a
 *   hint that STATES an answer is still dropped, and Pre-Flight now lists
 *   every dropped hint with its reason.
 * HELP-23. Where nothing else is left, the fallback fits the kind of
 *   question (systems, matrix, sort, graph, build, choice) and the panel
 *   points to the teacher.
 * Also noted. "goes down 3 for every 1 to the right" for the field "Slope of
 *   line B′ = −3" is a Pre-Flight warning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { getEffectiveActivityPolicy } from '../../functions/shared/activityPolicies.mjs';
import {
  FALLBACK_HINTS, buildQuestionHints, fallbackKind, questionAnswerValues, questionHintAudit, questionVisibleText,
} from '../../src/platform/supports/hints/questionHints.js';
import { hintAnswerLeak, slopeParaphrases, statedAnswers } from '../../src/platform/supports/hints/hintLeakGuard.js';
import { auditAssignmentHiddenHints, auditAssignmentHintAnswers } from '../../src/platform/preflight/hintAnswerPreflight.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Every real lesson in the repository, as the pass-3 probe read them.
const LESSON_FILES = (() => {
  const files = [];
  const walk = (directory) => readdirSync(directory).sort().forEach((name) => {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.json')) files.push(full);
  });
  walk(join(ROOT, 'teacher-import-jsons'));
  walk(join(ROOT, 'docs/assignments'));
  files.push(join(ROOT, 'SAMPLE_AUTHORING_INTENT_V5.json'));
  return files;
})();
let lessons = null;
const realQuestions = () => {
  if (lessons) return lessons;
  lessons = LESSON_FILES.flatMap((file) => compileAuthoringIntentV5(JSON.parse(readFileSync(file, 'utf8'))).package.sections
    .flatMap((section) => section.questions.map((question) => ({ file, role: section.role, question }))));
  return lessons;
};
const real = (questionId) => {
  const found = realQuestions().find(({ question }) => question.questionId === questionId);
  assert.ok(found, `${questionId} is in the real lessons`);
  return found.question;
};
const authoredOf = (question) => [question.supportHints, question.hints, question.hint].flat()
  .filter(Boolean).map((hint) => String(typeof hint === 'string' ? hint : hint.text || '').trim()).filter(Boolean);
const shownTexts = (question) => new Set(buildQuestionHints(question).map((hint) => hint.text));
// The guard as it was: any answer value as text.
const plainGuardDrops = (question, hint) => hintRevealsAnswer(hint, questionAnswerValues(question));
// The 32 hints the guard dropped on the base (5062cba5), by the pass-3 probe.
const BASE_DROPPED = Object.freeze([
  'l2-wu-2: The x-intercept is where the output is 0: solve 0 = 3x − 8.',
  'l2-cw-3: Left 3 is written inside the function: f(x + 3).',
  'l2-cw-3: f(x + 3) = x + 3 and f(x) + 3 = x + 3.',
  'l2-cw-5: q(x) = j(x) + 4 = (2x − 1) + 4.',
  'l2-cw-5: r(x) = j(x + 4) = 2(x + 4) − 1. Distribute first.',
  'l2-cw-9: For d(x), the outputs stay −2, −1, 0, 1, 2; multiply each input by 5/4.',
  'l2-pr-1: Inside changes act on x in the opposite way you might expect: x − 7 moves right, x + 5 moves left, (1/2)x stretches by 2.',
  'l2-pr-2: Inside changes act on x in the opposite way you might expect: x − 7 moves right, x + 5 moves left, (1/2)x stretches by 2.',
  'l2-pr-3: Inside changes act on x in the opposite way you might expect: x − 7 moves right, x + 5 moves left, (1/2)x stretches by 2.',
  'l2-pr-4: Inside changes act on x in the opposite way you might expect: x − 7 moves right, x + 5 moves left, (1/2)x stretches by 2.',
  'l2-pr-5: Inside changes act on x in the opposite way you might expect: x − 7 moves right, x + 5 moves left, (1/2)x stretches by 2.',
  'l2-pr-6: Inside changes act on x in the opposite way you might expect: x − 7 moves right, x + 5 moves left, (1/2)x stretches by 2.',
  'l2-pr-7: Inside, signs and factors act the opposite way: x − 7 moves right, and (1/2)x is a horizontal STRETCH by a factor of 2.',
  'l2-pr-9: Multiply each y-coordinate by −2.',
  'l2-pr-9: S1 = (−2, −2) lands at (−2, 4).',
  'l3-wu-2: Compare 5/8 and −8/5: flip the fraction AND change the sign.',
  'l3-wu-3: The reciprocal keeps the sign: the reciprocal of −10 is −1/10.',
  'l3-cw-2: Line C: from (−2, 9) to (6, 5). Line C′: from (0, −7) to (6, 5).',
  'l3-cw-3: Slope from O(0, 0) to D(b, −a) is (−a − 0)/(b − 0).',
  'l3-cw-3: Multiply b/a by −a/b.',
  'l3-cw-4: A whole number n is n/1, so its negative reciprocal is −1/n.',
  'l3-cw-4: Check: the two slopes should multiply to −1.',
  'l3-cw-10: Pick two points on y = −2, like (0, −2) and (1, −2).',
  'l3-cw-10: Pick two points on x = 3, like (3, 0) and (3, 1). What is the run?',
  'l3-pr-2: The negative reciprocal of −3/4 is 4/3.',
  'l3-pr-2: −8 = (4/3)(3) + b.',
  'l3-pr-4: The negative reciprocal of 1/2 is −2.',
  'l3-pr-4: 7 = −2(−2) + b.',
  'l3-pr-5: The other line\'s slope is the negative reciprocal of 5/9.',
  'l3-pr-5: 9 = (−9/5)(5) + b.',
  'l3-pr-11: Adjacent sides AB and BC: does (1/2)(−2) equal −1?',
  'l3m-wu-3: Which number times anything is never 1?',
]);


/* -------------------------------------------------------- HELP-16, the guard */

test('a number the hint only quotes from the problem is not an answer it states', () => {
  const wu2 = real('l2-wu-2');
  const xIntercept = 'The x-intercept is where the output is 0: solve 0 = 3x − 8.';
  assert.ok(authoredOf(wu2).includes(xIntercept));
  assert.ok(plainGuardDrops(wu2, xIntercept), 'the old guard dropped it: 3 is the slope');
  assert.ok(shownTexts(wu2).has(xIntercept), 'the student now gets it');
  // The same number STATED is still an answer.
  const options = { answers: questionAnswerValues(wu2), visibleText: questionVisibleText(wu2) };
  assert.deepEqual(statedAnswers('The slope is 3.', options), ['3']);
  assert.deepEqual(statedAnswers('In 3x − 8, the slope is 3.', options), ['3'], 'every place the number is written must be a quotation');
  assert.deepEqual(statedAnswers('Solve 0 = 3x − 9.', options), ['3'], 'an expression the problem does not show is not a quotation');

  // Points the prompt gives are quotations too (slope of C′ is 2; "(−2, 9)" writes −2).
  const cw2 = real('l3-cw-2');
  const points = 'Line C: from (−2, 9) to (6, 5). Line C′: from (0, −7) to (6, 5).';
  assert.ok(plainGuardDrops(cw2, points));
  assert.ok(shownTexts(cw2).has(points));
  // A numerator over a variable is not the number: "−1/n" does not write −1.
  const cw4 = real('l3-cw-4');
  const rule = 'A whole number n is n/1, so its negative reciprocal is −1/n.';
  assert.ok(plainGuardDrops(cw4, rule));
  assert.ok(shownTexts(cw4).has(rule));
  assert.ok(!shownTexts(cw4).has('Check: the two slopes should multiply to −1.'), 'while "multiply to −1" still states the answer −1');
});

test('a hint that states an answer is still dropped: a value, a point, an expression, a coefficient the problem does not show', () => {
  const dropped = (questionId, hint) => {
    const question = real(questionId);
    assert.ok(authoredOf(question).includes(hint), `${questionId}: ${hint}`);
    assert.ok(!shownTexts(question).has(hint), `${questionId} must not show: ${hint}`);
  };
  dropped('l3-pr-2', 'The negative reciprocal of −3/4 is 4/3.');
  dropped('l3-pr-2', '−8 = (4/3)(3) + b.');
  dropped('l3-pr-4', '7 = −2(−2) + b.');
  dropped('l2-pr-9', 'S1 = (−2, −2) lands at (−2, 4).');
  dropped('l2-pr-9', 'Multiply each y-coordinate by −2.');
  dropped('l2-cw-3', 'Left 3 is written inside the function: f(x + 3).');
  dropped('l2-cw-5', 'q(x) = j(x) + 4 = (2x − 1) + 4.');
  dropped('l2-pr-7', 'Inside, signs and factors act the opposite way: x − 7 moves right, and (1/2)x is a horizontal STRETCH by a factor of 2.');
  dropped('l3-wu-3', 'The reciprocal keeps the sign: the reciprocal of −10 is −1/10.');
  // A point answer is an answer even when every number in it is in the prompt.
  const pointAnswer = { prompt: 'Plot (2, 3) moved right 4: where is (2, 3) now?', answerFields: [{ id: 'p', label: 'Image', answer: '(6, 3)' }] };
  assert.equal(buildQuestionHints(pointAnswer).some((hint) => hint.text.includes('(6, 3)')), false);
  assert.ok(hintAnswerLeak('It lands at (6, 3).', { answers: questionAnswerValues(pointAnswer), visibleText: questionVisibleText(pointAnswer) }));
  // A value read by value: "6/2" writes 3, "x/2" writes 2, "12" does not write 2.
  assert.deepEqual(statedAnswers('That is 6/2.', { answers: ['3'], visibleText: 'y = 3x' }), [], 'the shared guard never read 6/2 as 3 — only matches it found are refined');
  assert.deepEqual(statedAnswers('It is 3/1.', { answers: ['3'], visibleText: '' }), ['3']);
  assert.deepEqual(statedAnswers('Write f(x/2).', { answers: ['2'], visibleText: '' }), ['2']);
  assert.deepEqual(statedAnswers('Add 12 to both sides.', { answers: ['2'], visibleText: '' }), []);
  assert.deepEqual(statedAnswers('Start at −2 on the axis.', { answers: ['2'], visibleText: '' }), [], '−2 is not 2');
  assert.deepEqual(statedAnswers('Look at x − 2.', { answers: ['2'], visibleText: '' }), ['2'], 'a subtracted term is the number');
});

test('a table\'s answer cells are answers: the hint that filled the first row is dropped', () => {
  const cw9 = real('l2-cw-9');
  const values = questionAnswerValues(cw9);
  assert.ok(values.includes('-8/5') && values.includes('-5/2'), JSON.stringify(values));
  assert.ok(!shownTexts(cw9).has('(4/5)(−2) = −8/5 and (5/4)(−2) = −5/2.'), 'it states two of the cells the student fills in');
});

test('over every real lesson, exactly three hints change to shown, and none of them states an answer', () => {
  const nowShown = [];
  const nowDropped = [];
  let total = 0;
  let droppedCount = 0;
  realQuestions().forEach(({ question }) => {
    const shown = shownTexts(question);
    const answers = questionAnswerValues(question);
    authoredOf(question).forEach((hint) => {
      total += 1;
      const before = !BASE_DROPPED.includes(`${question.questionId}: ${hint}`);
      const after = shown.has(hint);
      if (!after) droppedCount += 1;
      if (after && !before) nowShown.push(`${question.questionId}: ${hint}`);
      if (before && !after) nowDropped.push(`${question.questionId}: ${hint}`);
      if (!after) return;
      // A shown hint never contains a point, an expression or a word answer:
      // only a number may be excepted, and only as a quotation.
      answers.filter((value) => !/^[-−]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+)?$/.test(value.replace(/\s+/g, '')))
        .forEach((value) => assert.ok(!hintRevealsAnswer(hint, [value]), `${question.questionId} shows "${hint}", which contains the answer ${value}`));
    });
  });
  assert.equal(total, 200);
  assert.equal(BASE_DROPPED.length, 32);
  assert.deepEqual(nowShown.sort(), [
    'l2-wu-2: The x-intercept is where the output is 0: solve 0 = 3x − 8.',
    'l3-cw-2: Line C: from (−2, 9) to (6, 5). Line C′: from (0, −7) to (6, 5).',
    'l3-cw-4: A whole number n is n/1, so its negative reciprocal is −1/n.',
  ]);
  // The table's cells, read for the first time (the first is the price of
  // that: it multiplies by a factor that is also a cell).
  assert.deepEqual(nowDropped.sort(), [
    'l2-cw-9: (4/5)(−2) = −8/5 and (5/4)(−2) = −5/2.',
    'l2-cw-9: For c(x), multiply each output f(x) by 4/5.',
  ]);
  assert.equal(droppedCount, 31);
});

/* --------------------------------------------------- HELP-16, Pre-Flight */

const preflightOf = (file) => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(readFileSync(file, 'utf8')).assignmentV5, {}));

test('Pre-Flight lists every hint students will not see, with the reason, and only where hints are offered', () => {
  const l2 = preflightOf(join(ROOT, 'teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json'));
  const warnings = l2.hiddenHints.warnings;
  const l2Dropped = realQuestions().filter(({ file }) => file.includes('L2_Vertical_and_Horizontal'))
    .reduce((count, { question }) => count + authoredOf(question).filter((hint) => !shownTexts(question).has(hint)).length, 0);
  assert.equal(warnings.length, l2Dropped, 'one line per dropped hint');
  const xIntercept = warnings.find((warning) => warning.includes('lands at'));
  assert.match(xIntercept, /^Question \d+, hint 3 \(“S1 = \(−2, −2\) lands at \(−2, 4\)\.”\) is never shown to students: it names “−2”, “4”, “\(-2, 4\)”, which are answers to this question or parts of them\./);
  assert.ok(warnings.every((warning) => /is never shown to students: (it names .+|it repeats an earlier hint)\./.test(warning)), warnings.join('\n'));
  assert.ok(!warnings.some((warning) => warning.includes('solve 0 = 3x − 8')), 'a hint that is shown is not listed');
  // Advisory: never a readiness finding (assignmentAuthoringState reads diagnostics).
  assert.ok(!JSON.stringify(l2.diagnostics || []).includes('never shown to students'));
  assert.ok(!(l2.warnings || []).some((warning) => warning.includes('never shown to students')));

  // A DOL, quiz or test offers no hints, so nothing is listed there.
  const leaky = { activityRole: 'dol', prompt: 'Solve 2x = 6.', answerFields: [{ id: 'x', label: 'x', answer: '3' }], hints: ['x is 3.'] };
  assert.equal(getEffectiveActivityPolicy('dol').hintsAllowed, false);
  assert.deepEqual(auditAssignmentHiddenHints([leaky]).warnings, []);
  assert.equal(auditAssignmentHiddenHints([{ ...leaky, activityRole: 'practice' }]).warnings.length, 1);
  assert.equal(auditAssignmentHiddenHints([{ ...leaky, activityRole: 'practice', teacherExcluded: true }]).warnings.length, 0);

  // Every lesson: the panel's count is the guard's count.
  const fromPreflight = LESSON_FILES.reduce((count, file) => count + preflightOf(file).hiddenHints.warnings.length, 0);
  assert.equal(fromPreflight, 31);

  // The panel is wired, advisory, and names the list it shows.
  const modal = executableSource(read('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.hiddenHints?.warnings?.length > 0 && (', '\n      )}', 'the hidden-hints panel');
  assert.match(panel, />Hints students will not see</);
  assert.match(panel, /preflightModel\.hiddenHints\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
  assert.match(panel, /This does not stop you publishing\./);
  const model = executableSource(read('src/platform/preflight/assignmentV5PreflightModel.js'));
  assert.match(model, /\n\s*const hiddenHints = auditAssignmentHiddenHints\(questions, deliveredOnly\);/);
  assert.match(model, /\n\s*hiddenHints,\n/);
});

test('a slope described in words is a Pre-Flight warning — L3 Activity 3.1, and nothing else in the real lessons', () => {
  const field = { label: 'Slope of line B′ (read it from the graph)', answer: '-3' };
  assert.deepEqual(slopeParaphrases('From (0, 5), line B′ goes down 3 for every 1 to the right.', [field]), [{ field: field.label, answer: '-3' }]);
  assert.deepEqual(slopeParaphrases('It goes up 3 for every 1 to the right.', [field]), [], 'a different slope is not flagged');
  assert.deepEqual(slopeParaphrases('It goes down 3 for every 1 to the right.', [{ label: 'Its y-intercept', answer: '-3' }]), [], 'only a field that asks for a slope');
  assert.deepEqual(slopeParaphrases('A rise of 4 and a run of 3.', [{ label: 'Slope', answer: '4/3' }]), [{ field: 'Slope', answer: '4/3' }]);

  const flagged = LESSON_FILES.flatMap((file) => preflightOf(file).hintAnswers.warnings
    .filter((warning) => warning.includes('in words'))
    .map((warning) => `${file.split('/').pop()}: ${warning.split('. A hint should')[0]}`));
  assert.deepEqual(flagged, ['L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json: Question 4, hint 1 describes the slope −3 in words, the answer to “Slope of line B′ (read it from the graph)”']);
  // Still shown to the student: a warning for the author, not a drop.
  const question = realQuestions().find(({ question: q }) => authoredOf(q).includes('From (0, 5), line B′ goes down 3 for every 1 to the right.')).question;
  assert.ok(shownTexts(question).has('From (0, 5), line B′ goes down 3 for every 1 to the right.'));
  assert.equal(auditAssignmentHintAnswers([question]).warnings.length, 1);
});

/* ------------------------------------------------- HELP-23, the fallbacks */

test('the fallback fits the kind of question, and names no method step the item measures', () => {
  const genericOnly = realQuestions()
    .filter(({ role }) => getEffectiveActivityPolicy(role)?.hintsAllowed)
    .filter(({ question }) => buildQuestionHints(question).every((hint) => hint.source === 'generic'))
    .map(({ question }) => question);
  assert.equal(genericOnly.length, 50, 'the report counted 50');
  const kinds = {};
  genericOnly.forEach((question) => {
    const kind = fallbackKind(question);
    kinds[kind] = (kinds[kind] || 0) + 1;
    assert.deepEqual(buildQuestionHints(question).map((hint) => hint.text), [...FALLBACK_HINTS[kind]]);
  });
  // No systems, matrix, sort, graph or build item gets "keep the two sides equal" now.
  assert.deepEqual(kinds, { sort: 7, graphChoice: 4, general: 2, choice: 10, graph: 2, build: 5, systems: 20 });
  const systems = genericOnly.filter((question) => question.type === 'systemsWorkspace');
  assert.equal(systems.length, 20);
  systems.forEach((question) => assert.equal(fallbackKind(question), 'systems'));
  assert.equal(fallbackKind({ type: 'matrixLab' }), 'matrix');
  assert.equal(fallbackKind({ type: 'graphing2' }), 'graph');
  assert.equal(fallbackKind({ type: 'multiAnswer', answerFields: [{ type: 'number' }] }), 'general');

  // No fallback names a method: the moves these items grade.
  const METHOD = /eliminat|substitut|reciprocal|slope|distribut|both sides|inverse|row operation|reduce|factor|isolate|undo|swap|reflect|stretch|shift|translat|intercept|vertex/i;
  Object.entries(FALLBACK_HINTS).forEach(([kind, hints]) => hints.forEach((hint) => {
    if (kind === 'general' && /both sides|two sides/.test(hint)) return; // equations only: the platform's checking question
    assert.doesNotMatch(hint, METHOD, `${kind}: ${hint}`);
  }));
  // Each fallback still goes through nothing it could leak: it carries no number.
  Object.values(FALLBACK_HINTS).flat().forEach((hint) => assert.doesNotMatch(hint, /\d/));
});

test('where only fallbacks are left, the panel points to Ask my teacher — and only where Ask is there', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const HintPanel = (await server.ssrLoadModule('/src/platform/supports/hints/HintPanel.jsx')).default;
    const render = (props) => renderToStaticMarkup(React.createElement(HintPanel, { release: { canRevealNext: true }, onReveal: () => {}, ...props }));
    const fallback = FALLBACK_HINTS.systems.map((text) => ({ text, source: 'generic' }));
    const ask = { requested: false, onToggle: () => {} };
    const POINTER = /<p data-hint-fallback-ask=""[^>]*>These hints are general, not written for this question\. For help with this one, ask your teacher with the button below\.<\/p>/;
    const withAsk = render({ hints: fallback, askTeacher: ask });
    assert.match(withAsk, POINTER);
    assert.ok(withAsk.indexOf('data-hint-fallback-ask') < withAsk.indexOf('Ask my teacher'), 'above the button it points to');
    assert.doesNotMatch(render({ hints: fallback }), /data-hint-fallback-ask/, 'no pointer at a button that is not there');
    assert.doesNotMatch(render({ hints: [{ text: 'Your teacher wrote this.', source: 'authored' }, ...fallback], askTeacher: ask }), /data-hint-fallback-ask/, 'a hint that fits is not general');
    assert.doesNotMatch(render({ hints: [], askTeacher: ask }), /data-hint-fallback-ask/, 'the Ask-only panel of a DOL says nothing about hints');
  } finally {
    await server.close();
  }
});

/* ------------------------------------------------- the audit and the ladder */

test('the ladder is the audit\'s shown hints; repeats and leaks are dropped with their reason', () => {
  const question = { prompt: 'Solve 2x + 3 = 11.', answerFields: [{ id: 'x', label: 'x', answer: '4' }], hints: ['Undo the + 3 first.', 'Undo the + 3 first.', 'x = 4.'] };
  const audit = questionHintAudit(question);
  assert.deepEqual(audit.map(({ shown, reason }) => [shown, reason || null]), [
    [true, null],
    [false, 'it repeats an earlier hint'],
    [false, 'it names “4”, which is an answer to this question or part of one'],
  ]);
  assert.deepEqual(buildQuestionHints(question).map((hint) => hint.text), ['Undo the + 3 first.']);
});
