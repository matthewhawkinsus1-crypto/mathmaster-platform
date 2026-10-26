/*
 * STUDENT PASS 3, BATCH 4 ("LEARN FROM THE MISTAKE"): WHAT A STUDENT CAN STILL
 * DO AFTER THE LAST MISS.
 *
 *   HELP-1 / D3, HELP-9  "Practise one like this (no score)" under the worked
 *                        solution of a closed Classwork or Practice item: a
 *                        sibling from the item's question family, answered
 *                        with its own feedback, never recorded, never on a
 *                        Warm-Up, DOL, quiz, test or server-graded host.
 *   HELP-11              the legacy worked solution reaches Read aloud; a
 *                        multi-part item lists each part with what the
 *                        student wrote, wrong parts first; Pre-Flight warns
 *                        (never blocks) on answer-only solutions and a missing
 *                        solutionReview.commonError.
 *   HELP-12              Review My Work shows the same solution panel, told
 *                        the outcome, with Read aloud/Translate, and "Try one
 *                        like this" on wrong Classwork/Practice rows.
 *   HELP-18              choice-only items say "This has one try — a hint is
 *                        available." before it, and the author's reason for
 *                        the chosen option after it.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  PRACTICE_LIKE_THIS_ROLES,
  PRACTICE_SOURCE,
  PRACTICE_VERDICT,
  buildPracticeLikeThis,
  checkPracticeAnswers,
  checkPracticePart,
  practiceCheckMessage,
  practiceLikeThisOffered,
  readPracticeAnswer,
} from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { buildNumericVariant } from '../../src/platform/supports/workedExample/numericVariant.js';
import { buildClosedQuestionReview, buildPartReviewRows, legacyReviewSpeechLines, partReviewSpeech } from '../../src/platform/supports/review/closedQuestionReview.js';
import { auditAssignmentSolutionReviews, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';
import { ONE_TRY, ONE_TRY_WITH_HINT, chosenOptionReasons, oneTryNotice, optionRationale, optionRationaleProblems } from '../../src/platform/supports/feedback/oneTryChoice.js';
import { buildReviewMyWorkModel } from '../../src/platform/student/reviewMyWorkModel.js';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const code = (path) => executableSource(read(path));
const ROOT_PATH = fileURLToPath(ROOT);

/* ------------------------------------------------------- the real lessons */

const lessonFiles = () => {
  const files = [];
  const imports = join(ROOT_PATH, 'teacher-import-jsons');
  readdirSync(imports).forEach((folder) => readdirSync(join(imports, folder))
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => files.push(join(imports, folder, name))));
  readdirSync(join(ROOT_PATH, 'docs/assignments')).filter((name) => name.endsWith('.json')).forEach((name) => files.push(join(ROOT_PATH, 'docs/assignments', name)));
  files.push(join(ROOT_PATH, 'SAMPLE_AUTHORING_INTENT_V5.json'));
  return files;
};

let realItems = null;
const itemsByRole = () => {
  if (realItems) return realItems;
  realItems = [];
  lessonFiles().forEach((file) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(file, 'utf8')));
    compiled.package.sections.forEach((section) => section.questions.forEach((question) => realItems.push({ role: section.role, question })));
  });
  return realItems;
};

/* ------------------------------------------------- 1. practise one like this */

test('HELP-1: every real Classwork/Practice item with a family sibling gets an unscored practice — and its own answer checks as right', () => {
  const items = itemsByRole().filter((item) => PRACTICE_LIKE_THIS_ROLES.includes(item.role));
  assert.ok(items.length >= 200, 'the real lessons are read');
  let offered = 0;
  let checkable = 0;
  const onlyWords = [];
  items.forEach(({ question }) => {
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    // Offered where the family can work a sibling — and, since FB19, where the
    // item has none but can be varied in its own numbers (numericVariant.js;
    // which items, and how, is practiceLikeThisNumericVariant.test.mjs). A
    // family sibling always wins; with neither, nothing new.
    const familySibling = buildSimilarWorkedExample(question);
    assert.equal(Boolean(practice), Boolean(familySibling || buildNumericVariant(question)), 'a practice only where a sibling or a variant exists');
    if (familySibling) assert.equal(practice.source, PRACTICE_SOURCE.FAMILY, 'the family sibling, where there is one');
    if (!practice) return;
    offered += 1;
    assert.notEqual(practice.prompt, String(question.prompt || '').trim(), 'never this question in disguise');
    assert.ok(practice.steps.length > 0, 'a worked solution to compare with');
    if (practice.checkable) checkable += 1;
    else onlyWords.push(`${question.questionId}: ${practice.prompt} → ${practice.answer}`);
    // The sibling's own answer, typed part by part, is never marked wrong.
    const responses = Object.fromEntries(practice.parts.map((part) => [part.id, part.expected]));
    const result = checkPracticeAnswers(practice, responses);
    assert.deepEqual(result.parts.filter((part) => part.verdict === PRACTICE_VERDICT.INCORRECT), [], `${practice.answer}: its own answer is right`);
  });
  assert.ok(offered >= 100, `practice offered on ${offered} items`);
  // CT13: was "at most 12 items with nothing to check" (then 6). The last six are
  // read in practiceLikeThis.js, so the ratchet is closed: a new lesson item whose
  // sibling is only words is named here, to be read in a fixed shape or recorded
  // as a part that stays in words beside one that can be checked.
  assert.deepEqual(onlyWords, [], `${checkable} of ${offered} have a part that can be checked`);
  assert.equal(checkable, offered);
});

test('HELP-1: "another one" and the Hint panel\'s sibling are not repeated', () => {
  const { question } = itemsByRole().find((item) => PRACTICE_LIKE_THIS_ROLES.includes(item.role) && buildPracticeLikeThis(item.question));
  const hintSibling = buildSimilarWorkedExample(question, { seed: 0 });
  const first = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: [hintSibling.prompt] });
  assert.notEqual(first.prompt, hintSibling.prompt);
  const second = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: [hintSibling.prompt, first.prompt] });
  if (second) assert.notEqual(second.prompt, first.prompt);
});

const verdicts = (answer, typed) => readPracticeAnswer(answer).parts.map((part) => checkPracticePart(part, typed));

test('HELP-1: a practice answer is checked the way a field is graded, whatever way the student writes it', () => {
  // Equivalent forms, as MathLive sends them, are right.
  assert.deepEqual(verdicts('f⁻¹(x) = (x − 5)/2', '\\frac{x-5}{2}'), ['correct']);
  assert.deepEqual(verdicts('f⁻¹(x) = (x − 5)/2', 'f^{-1}(x)=\\frac{x}{2}-\\frac{5}{2}'), ['correct']);
  assert.deepEqual(verdicts('f⁻¹(x) = −(x + 1)/7', '\\frac{-x-1}{7}'), ['correct']);
  assert.deepEqual(verdicts('x² + 7x + 6 (coefficients 1, 7, 6)', 'x^{2}+7x+6'), ['correct']);
  assert.deepEqual(verdicts('domain -4 ≤ x ≤ 3', '[-4,3]'), ['correct'], 'an interval for the inequality');
  assert.deepEqual(verdicts('domain [-1, 4]', '-1\\le x\\le4'), ['correct'], 'the inequality for the interval');
  assert.deepEqual(verdicts('negative [-2, 0) ∪ (2, 3]', '\\lbrack-2,0)\\cup(2,3\\rbrack'), ['correct']);
  assert.deepEqual(verdicts('x-intercepts (-2, 0) and (2, 0)', '(2,0),(-2,0)'), ['correct'], 'intercepts in any order');
  assert.deepEqual(verdicts('zeros {-2, 2}', '\\lbrace2,-2\\rbrace'), ['correct']);
  assert.deepEqual(verdicts('increasing never', '\\emptyset'), ['correct']);
  assert.deepEqual(verdicts('t(r(1600)) = 1220', '1,220'), ['correct'], 'a thousands separator, as on every number box');
  assert.deepEqual(verdicts('4x - y = -8', '-4x+y=8'), ['correct'], 'the same line, rearranged');
  // Different answers are wrong.
  assert.deepEqual(verdicts('f⁻¹(x) = (x − 5)/2', '\\frac{x+5}{2}'), ['incorrect']);
  assert.deepEqual(verdicts('domain [-1, 4]', '(-1,4)'), ['incorrect']);
  assert.deepEqual(verdicts('(7, -6), (3, 5), (-6, 8), in that order', '(3,5),(7,-6),(-6,8)'), ['incorrect'], 'an ordered list keeps its order');
  assert.deepEqual(verdicts('x² + 7x + 6', 'x^2+6x+7'), ['incorrect']);
  assert.deepEqual(verdicts('slope 4', ''), ['blank']);
});

test('HELP-1: words and rosters with an ellipsis are never marked right or wrong; a mapping and a shift only once they are read completely (CT13)', () => {
  const { parts } = readPracticeAnswer('arrows -7 → 5, -3 → 8; domain {0, 1, 2, ..., 40}; falls, then rises; Horizontal: 6 units to the left');
  assert.equal(parts.length, 4);
  // A mapping and a distance with a direction have a fixed shape: checked (practiceLikeThisFixedShapes.test.mjs).
  assert.deepEqual(parts.map((part) => [part.kind, part.checkable]), [['mapping', true], ['value', false], ['words', false], ['shift', true]]);
  parts.forEach((part) => {
    // Whatever cannot be read completely is compared, never called wrong.
    assert.equal(checkPracticePart(part, 'anything'), PRACTICE_VERDICT.COMPARE);
  });
  const checked = checkPracticeAnswers(readPracticeAnswer('domain [0, 2]; rises everywhere'), { 'part-1': '[0,2]' });
  assert.equal(checked.allCorrect, true);
  assert.match(practiceCheckMessage(checked), /Compare the rest with the worked solution/);
});

test('HELP-1: a line named by two of its points is checked as the line — any two of its points, or its equation', () => {
  // Any two points of the line answer it, so the two the family happened to
  // name are not the answer: the line is. Module 3 (systems by graphing) and
  // Module 2 L3 ask for one on every intercept item.
  const [line] = readPracticeAnswer('The line through (0, 2) and (-4, 0)').parts;
  assert.equal(line.kind, 'line');
  assert.equal(line.checkable, true);
  const verdict = (typed) => checkPracticePart(line, typed);
  assert.equal(verdict('(0, 2), (-4, 0)'), PRACTICE_VERDICT.CORRECT, 'the two points named');
  assert.equal(verdict('(-4,0),(4,4)'), PRACTICE_VERDICT.CORRECT, 'two other points of it, in any order');
  assert.equal(verdict('y=\\frac{1}{2}x+2'), PRACTICE_VERDICT.CORRECT, 'slope-intercept form, as MathLive sends it');
  assert.equal(verdict('x-2y=-4'), PRACTICE_VERDICT.CORRECT, 'standard form');
  assert.equal(verdict('y=2x+2'), PRACTICE_VERDICT.INCORRECT, 'a different line through one of the points');
  assert.equal(verdict('(0, 2), (0, 2)'), PRACTICE_VERDICT.INCORRECT, 'one point twice is not a line');
  assert.equal(verdict('(0, 2), (1, 1)'), PRACTICE_VERDICT.INCORRECT, 'a point off the line');
  assert.equal(verdict('y=\\frac{1}{8}x^{2}+\\frac{1}{2}x+2'), PRACTICE_VERDICT.INCORRECT, 'a curve through both points is not the line');
  assert.equal(verdict(''), PRACTICE_VERDICT.BLANK);
  // Vertical and horizontal lines (Module 2 L3).
  const [vertical] = readPracticeAnswer('The vertical line through (2, -2) and (2, 3)').parts;
  assert.equal(checkPracticePart(vertical, 'x=2'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(vertical, 'y=2'), PRACTICE_VERDICT.INCORRECT);
  const [horizontal] = readPracticeAnswer('The horizontal line through (-2, -1) and (3, -1)').parts;
  assert.equal(checkPracticePart(horizontal, 'y=-1'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(horizontal, '(10, -1), (-7, -1)'), PRACTICE_VERDICT.CORRECT);
});

test('HELP-1 / D3: offered only on a closed Classwork or Practice item the host vouched for — never a Warm-Up, DOL, quiz, test or server-graded host', () => {
  const yes = { hostAllows: true, activityRole: 'classwork', closedOnMiss: true, feedbackOpen: true, hintsAllowed: true, serverGraded: false };
  assert.equal(practiceLikeThisOffered(yes), true);
  assert.equal(practiceLikeThisOffered({ ...yes, activityRole: 'practice' }), true);
  ['warmup', 'dol', 'quiz', 'test', 'review', 'corrections', '', null].forEach((role) => {
    assert.equal(practiceLikeThisOffered({ ...yes, activityRole: role }), false, `${role}: none`);
  });
  assert.equal(practiceLikeThisOffered({ ...yes, hostAllows: false }), false, 'Recovery and Path run on a "practice" policy but never vouch');
  assert.equal(practiceLikeThisOffered({ ...yes, serverGraded: true }), false);
  assert.equal(practiceLikeThisOffered({ ...yes, closedOnMiss: false }), false, 'only after the last miss');
  assert.equal(practiceLikeThisOffered({ ...yes, feedbackOpen: false }), false);
  assert.equal(practiceLikeThisOffered({ ...yes, hintsAllowed: false }), false, 'a teacher who switched help off');
});

test('HELP-1: the practice records nothing — no grader, attempt, grade, evidence or storage is reachable from it', () => {
  const forbidden = /onGrade|onStateChange|recordQuestionAttempt|onSupportEvidence|onEvidence|reportSupportEvidence|setDoc|updateDoc|addDoc|httpsCallable|localStorage|sessionStorage|indexedDB|questionDraftStorage|evidence/i;
  assert.doesNotMatch(code('src/platform/supports/workedExample/PracticeLikeThis.jsx'), forbidden);
  assert.doesNotMatch(code('src/platform/supports/workedExample/practiceLikeThis.js'), forbidden);
  // FB19's variants: the grader is asked about the variant's key, and its verdict goes nowhere.
  assert.doesNotMatch(code('src/platform/supports/workedExample/numericVariant.js'), forbidden);
  // The engine hands it the question and the text supports, and nothing that reports.
  const engine = code('src/QuestionEngine.jsx');
  const mount = region(engine, 'const practiceLikeThis = practiceOffered ? (', ') : null;');
  assert.match(mount, /<PracticeLikeThis\s/);
  assert.doesNotMatch(mount, /onSupportEvidence|onEvidence|onGrade|onStateChange|reportSupportedTextUse/);
  // It owns its Enter, so Enter in a practice box never submits or advances the question.
  assert.match(code('src/platform/supports/workedExample/PracticeLikeThis.jsx'), /data-mm-enter-owner="practice"/);
});

test('HELP-1 / HELP-9: the closed card puts it under the worked solution, gated by the host, the role and the miss', () => {
  const engine = code('src/QuestionEngine.jsx');
  const gate = region(engine, 'const practiceOffered = practiceLikeThisOffered({', '});');
  assert.match(gate, /hostAllows:\s*practiceLikeThisAllowed/);
  assert.match(gate, /activityRole:\s*explicitActivityRole/);
  assert.match(gate, /closedOnMiss:\s*isExpired && !isCorrect/);
  assert.match(gate, /feedbackOpen,/);
  assert.match(gate, /serverGraded,/);
  assert.match(engine, /practiceLikeThisAllowed = false,/, 'off unless a host says so');
  const card = region(engine, 'className="mathmaster-closed-question-card"', '</section>');
  assert.ok(card.indexOf('{closedReview}') >= 0 && card.indexOf('{closedReview}') < card.indexOf('{practiceLikeThis}'), 'under the worked solution');
  // The classroom assignment vouches for Classwork and Practice by the
  // SECTION's role: post-due practice runs a DOL as 'practice'.
  const app = code('src/App.jsx');
  assert.match(app, /practiceLikeThisAllowed=\{\['classwork', 'practice'\]\.includes\(activeQuestionRole\)\}/);
  ['src/components/student/SectionRecoveryRunner.jsx', 'src/components/student/PathSessionPlayer.jsx', 'src/components/student/TestCycleCorrections.jsx', 'src/components/liveChallenge/LiveChallengeStudent.jsx', 'src/components/question/RichQuestionRuntime.jsx', 'src/components/demo/DemoExperience.jsx']
    .forEach((path) => assert.doesNotMatch(code(path), /practiceLikeThisAllowed/, `${path} never vouches`));
});

/* ----------------------------------------------------- 2. HELP-11 */

test('HELP-11: the legacy worked solution reaches Read aloud', () => {
  const question = { type: 'multiAnswer', prompt: 'Find the slope and intercept.', answerFields: [{ id: 'm', label: 'Slope', answer: '-1/2' }, { id: 'b', label: 'b', answer: '5' }] };
  const legacyContent = () => ({
    hasContent: true,
    workflowSolution: null,
    representations: ['y=-\\frac{1}{2}x+5', 'The solution is the intersection of the two lines.'],
    completeAnswerDetails: ['Slope: -1/2', 'b: 5'],
    analysisSummary: ['Domain: [0, 4]'],
  });
  const review = buildClosedQuestionReview({ question, legacyContent });
  assert.equal(review.legacy, true);
  assert.match(review.speechText, /Slope: -1\/2 b: 5/);
  assert.match(review.speechText, /\$y=-\\frac\{1\}\{2\}x\+5\$/, 'LaTeX is read as mathematics');
  assert.match(review.speechText, /The solution is the intersection of the two lines\./, 'a sentence as words');
  assert.match(review.speechText, /Domain: \[0, 4\]/);
  const steps = legacyReviewSpeechLines({}, { workflowSolution: { entries: [{ title: 'Step 1 — Equation', prompt: 'Write the rule.', math: 'f(x)=2x', lines: [], table: { rows: [[1, 2]] } }] } });
  assert.deepEqual(steps, ['Step 1 — Equation. Write the rule.', '$f(x)=2x$', 'Input 1, output 2']);
  // A tool question's review is not the legacy one, and is not read twice.
  assert.equal(buildClosedQuestionReview({ question, legacyContent, isToolQuestion: true }).legacy, false);
});

test('HELP-11: part by part, what the student wrote beside the answer, wrong parts first', () => {
  const question = { type: 'multiAnswer', answerFields: [
    { id: 'm', label: 'Slope', answer: '-1/2' },
    { id: 'b', label: 'y-intercept b', acceptedAnswers: ['5'] },
    { id: 'eq', label: 'Equation', answer: 'y=-1/2x+5' },
  ] };
  const rows = buildPartReviewRows({ question, parts: [
    { key: 'm', response: '-1/2', isCorrect: true },
    { key: 'b', response: '-10', isCorrect: false },
    { key: 'eq', response: 'y=2x-10', isCorrect: false },
  ] });
  assert.deepEqual(rows.map((row) => [row.id, row.yourAnswer, row.correct, row.isCorrect]), [
    ['b', '-10', '5', false],
    ['eq', 'y=2x-10', 'y=-1/2x+5', false],
    ['m', '-1/2', '-1/2', true],
  ]);
  assert.match(partReviewSpeech(rows), /^y-intercept b: not correct\. You wrote \$-10\$\. The answer is \$5\$\./);
  assert.deepEqual(buildPartReviewRows({ question: { answerFields: [question.answerFields[0]] }, parts: [{ key: 'm', response: '1', isCorrect: false }] }), [], 'one box: the card already says it');
  assert.deepEqual(buildPartReviewRows({ question, parts: [] }), [], 'no grading on this device: no rows');
});

test('HELP-11: the panel shows the rows, reads them, and the legacy review leaves out its bare list', () => {
  const panel = code('src/SolutionReviewPanel.jsx');
  assert.match(panel, /const partRows = hasContent && !isToolQuestion \? buildPartReviewRows\(\{ question, parts: yourParts \}\) : \[\];/);
  assert.match(panel, /<SupportedTextActions text=\{speechText\}/);
  assert.match(panel, /const speechText = \[partReviewSpeech\(partRows\), review\.speechText\]/);
  assert.match(panel, /<SolutionReview question=\{question\} incorrectParts=\{incorrectParts\} embedded hideAnswerDetails=\{partRows\.length > 0\} \/>/);
  assert.match(code('src/SolutionReview.jsx'), /\{!hideAnswerDetails && completeAnswerDetails\.length > 0 && \(/);
  const engine = code('src/QuestionEngine.jsx');
  assert.match(region(engine, '<SolutionReviewPanel', '/>'), /yourParts=\{closedYourAnswer\}/);
  // With the rows in the review, the card does not list the same answers again above them.
  assert.match(engine, /\{closedYourAnswer\.length > 0 && !closedPartRowsShown && \(/);
});

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

test('HELP-11: rendered, the wrong part comes first and says what the student wrote', async () => {
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  const question = {
    type: 'multiAnswer',
    prompt: 'Find the slope and the y-intercept.',
    answerFields: [{ id: 'm', label: 'Slope', answer: '-1/2' }, { id: 'b', label: 'Intercept', answer: '5' }],
    solutionReview: { headline: 'Read m and b.', reasoning: ['The slope is the coefficient of x.', 'b is the constant.'] },
  };
  const html = renderToStaticMarkup(React.createElement(SolutionReviewPanel, {
    question,
    yourParts: [{ key: 'm', response: '-1/2', isCorrect: true }, { key: 'b', response: '-10', isCorrect: false }],
    readAloud: { language: 'en' },
  }));
  assert.match(html, /data-part-review=""/);
  assert.ok(html.indexOf('data-part-review-row="wrong"') < html.indexOf('data-part-review-row="right"'), 'wrong first');
  assert.ok(html.indexOf('Intercept') < html.indexOf('Slope'));
  assert.match(html, /You wrote: /);
  assert.match(html, /aria-label="Read the worked solution aloud"/);
});

test('HELP-11: Pre-Flight warns — never blocks — on answer-only worked solutions and a missing common error', async () => {
  const answerOnly = { type: 'multiAnswer', prompt: 'Find m.', answerFields: [{ id: 'm', label: 'Slope', answer: '3' }, { id: 'b', label: 'b', answer: '1' }] };
  const withSteps = { ...answerOnly, solutionReview: { reasoning: ['Rise over run is 3.'], commonError: 'Run over rise gives 1/3.' } };
  assert.equal(workedSolutionDepth(answerOnly), 'answerOnly');
  assert.equal(workedSolutionDepth(withSteps), 'steps');
  const audit = auditAssignmentSolutionReviews([answerOnly, withSteps, { ...answerOnly, teacherExcluded: true }]);
  assert.deepEqual(audit.answerOnly, [1]);
  assert.deepEqual(audit.noCommonError, [1]);
  assert.match(audit.warnings[0], /^Question 1 shows only the answer after the last try/);
  assert.match(audit.warnings[1], /solutionReview\.commonError/);
  // A Question Family slot is judged by a version a student is shown: a tool
  // template gets the tool's worked steps; a multi-answer template gets only
  // what it authors.
  const template = (fields) => ({ ...fields, questionFamily: { scope: 'assignment' } });
  const factorTemplate = template({
    type: 'polynomialWorkshop', mode: 'factorQuadratic', prompt: 'Factor $x^2 + {{s}}x + {{p}}$.', coefficients: [1, '{{s}}', '{{p}}'],
    generator: { parameters: { m: { type: 'int', min: 1, max: 5 }, n: { type: 'int', min: 6, max: 9 } }, derived: { s: 'm + n', p: 'm * n' } },
  });
  const sumTemplate = template({
    type: 'multiAnswer', prompt: 'Add {{a}} and 1.', answerFields: [{ id: 'v', label: 'Sum', answer: '{{v}}' }],
    generator: { parameters: { a: { type: 'int', min: 1, max: 9 } }, derived: { v: 'a + 1' } },
  });
  assert.equal(workedSolutionDepth(factorTemplate), 'steps');
  assert.equal(workedSolutionDepth(sumTemplate), 'answerOnly');
  assert.equal(workedSolutionDepth({ ...sumTemplate, solutionReview: { reasoning: ['{{a}} + 1 = {{v}}.'] } }), 'steps');
  // The real lessons: 905 of 971 practice-like items walk through steps —
  // 204 of 265 in the lessons before October 22 (199 before family slots
  // were judged by a version), then every one in Operations on Polynomials
  // and Dividing Polynomials (59), the Algebra I DOL #3 Review (13) and its
  // Honors version (16), the Algebra II Honors DOL #2 review (33), Module 3
  // (144) and its Honors files (146), the Algebra II Polynomials and
  // Radicals lessons (132) and their Honors versions (137), and the Algebra I
  // Lesson 3 Honors file (26, 9 with steps: the Regular lesson's 8 less the
  // one it swaps out, and both audited items); and the 12 warm-up, classwork
  // and practice transformation descriptions of Algebra II Honors Module 1
  // (L1 absolute value, L2 day 2), which the transformations family now
  // works (CT02; its two DOL items are not practice-like).
  const practiceLike = itemsByRole().filter((item) => ['warmup', 'classwork', 'practice'].includes(item.role));
  assert.equal(practiceLike.length, 265 + 59 + 13 + 16 + 33 + 144 + 146 + 132 + 137 + 26);
  assert.equal(practiceLike.filter((item) => workedSolutionDepth(item.question) === 'steps').length, 204 + 59 + 13 + 16 + 33 + 144 + 146 + 132 + 137 + 9 + 12);
  // Wired into Pre-Flight as advice the teacher sees in the Check step, and
  // never as a diagnostic: any warning diagnostic makes an assignment "Needs
  // Review", which students never see (isUnpublishedDraft) — and most real
  // lessons author no commonError.
  const { buildAssignmentV5PreflightModel } = await import('../../src/platform/preflight/assignmentV5PreflightModel.js');
  const source = JSON.parse(read('teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json'));
  const model = buildAssignmentV5PreflightModel(compileAuthoringIntentV5(source).package);
  assert.ok(model.solutionReviews.warnings.some((warning) => /no solutionReview\.commonError/.test(warning)), 'the teacher is told');
  assert.ok(![...model.errors, ...model.warnings].some((message) => /solutionReview|only the answer after the last try/.test(message)), 'never an error or a readiness warning');
  assert.ok(!model.diagnostics.some((entry) => /solutionReview/.test(entry.message)));
  assert.equal(model.authoringState, 'ready', 'the lesson stays ready');
  const modal = code('src/components/teacher/LessonPreflightModal.jsx');
  assert.match(modal, /\{preflightModel\.solutionReviews\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)\}/);
});

/* ----------------------------------------------------- 3. HELP-12 */

test('HELP-12: Review My Work shows the one solution panel, told the outcome, with Read aloud and Translate', () => {
  const screen = code('src/components/student/ReviewMyWork.jsx');
  const panel = region(screen, '<SolutionReviewPanel', '/>');
  assert.match(panel, /wasCorrect=\{item\.outcome === REVIEW_OUTCOME\.CORRECT\}/);
  assert.match(panel, /readAloud=\{supports\.readAloud\}/);
  assert.match(panel, /translation=\{supports\.translation\}/);
  assert.match(panel, /isToolQuestion=\{isToolQuestion\}/);
  assert.doesNotMatch(screen, /<SolutionReview\s|<ToolSolutionReview/, 'not the thin legacy renderers');
  // Entitlement exactly as a question: the plan, or a practice-like row's universal tools.
  const supports = region(screen, 'const textSupportsFor = ', '};\n');
  assert.match(supports, /toolsEntitlementFromProfile\(studentProfile, \{ activityRole: role \|\| null, universalDesignRole: role \|\| null \}\)/);
  assert.match(supports, /speechReady && \(presentation\?\.textToSpeech \|\| toolList\.includes\('read-aloud'\)\)/);
  // The signed-in student's own profile reaches the screen (the prop order,
  // and the other props the mount carries, are not the contract).
  const mount = region(code('src/App.jsx'), '<ReviewMyWork', '</Suspense>');
  assert.match(mount, /\bstudentProfile=\{user\.profile\}/);
});

test('HELP-12: "Try one like this" only on a wrong Classwork or Practice row', () => {
  const screen = code('src/components/student/ReviewMyWork.jsx');
  assert.match(screen, /const WRONG_OUTCOMES = new Set\(\[REVIEW_OUTCOME\.INCORRECT, REVIEW_OUTCOME\.PARTIAL\]\);/);
  assert.match(screen, /const offerPractice = WRONG_OUTCOMES\.has\(item\.outcome\) && PRACTICE_LIKE_THIS_ROLES\.includes\(item\.role\);/);
  assert.match(screen, /\{offerPractice && \(\s*<PracticeLikeThis /);
  const model = buildReviewMyWorkModel({ result: { questions: [
    { index: 0, outcome: 'incorrect', sectionRole: 'Classwork', solutionSource: 'delivered', deliveredQuestion: { prompt: 'p' } },
    { index: 1, outcome: 'incorrect', sectionRole: 'dol', solutionSource: 'delivered', deliveredQuestion: { prompt: 'q' } },
  ] }, assignment: null });
  assert.deepEqual(model.items.map((item) => item.role), ['classwork', 'dol']);
});

/* ----------------------------------------------------- 4. HELP-18 */

const choiceQuestion = {
  type: 'multiAnswer',
  prompt: 'For g(x) = f(x − 4) + 3, describe the translations.',
  answerFields: [
    { id: 'horizontal', label: 'Horizontal', type: 'choice', inputProfile: 'choice', options: ['right 4', 'left 4', 'none'], answer: 'right 4',
      optionRationales: { 'left 4': 'Inside the bracket the shift goes the other way: x − 4 moves the graph right.', 'right 4': 'x − 4 inside the function moves every point 4 to the right.' } },
    { id: 'vertical', label: 'Vertical', type: 'choice', inputProfile: 'choice', options: ['up 3', 'down 3', 'none'], answer: 'up 3' },
  ],
};

test('HELP-18: before the single try a choice-only item says so, and that a hint is there', () => {
  const base = { question: choiceQuestion, maximumAttempts: 1, attemptCount: 0, open: true, immediateFeedback: true, hintAvailable: true };
  assert.equal(oneTryNotice(base), ONE_TRY_WITH_HINT);
  assert.equal(ONE_TRY_WITH_HINT, 'This has one try — a hint is available.');
  assert.equal(oneTryNotice({ ...base, hintAvailable: false }), ONE_TRY, 'never promises a hint the control will not give');
  assert.equal(oneTryNotice({ ...base, attemptCount: 1 }), null, 'only before it');
  assert.equal(oneTryNotice({ ...base, maximumAttempts: 2 }), null, 'a teacher granted another try');
  assert.equal(oneTryNotice({ ...base, immediateFeedback: false }), null, 'a DOL, quiz or test says nothing');
  assert.equal(oneTryNotice({ ...base, question: { type: 'multiAnswer', answerFields: [{ id: 'a', answer: '3' }] } }), null, 'typed answers have three tries');
  const engine = code('src/QuestionEngine.jsx');
  const notice = region(engine, 'const oneTryLine = oneTryNotice({', '});');
  assert.match(notice, /hintAvailable: hintState\.canRevealNext/);
  assert.match(notice, /immediateFeedback: showOutcomeFeedback && resolvedActivityPolicy\?\.feedback === 'immediate'/);
  const panel = region(engine, '<div className="mathmaster-question-context-panel">', '{!supportPresentation.declutter && (');
  assert.match(panel, /\{oneTryLine && \(/, 'shown before the declutter gate, so an inclusion student sees it');
  // The notice sits at the top of the work, so the panel opens there (FB10).
  assert.match(panel, /onClick=\{\(\) => revealNextHint\('top'\)\}/, 'the existing hint reveal, rules unchanged');
});

test('HELP-18: after it, the author\'s one-line reason for the chosen option — kept through the compiler, checked in Pre-Flight', () => {
  const reasons = chosenOptionReasons({ question: choiceQuestion, parts: [
    { id: 'horizontal', response: 'Left 4', isCorrect: false },
    { id: 'vertical', response: 'up 3', isCorrect: true },
  ] });
  assert.deepEqual(reasons, [{ id: 'horizontal', label: 'Horizontal', chosen: 'left 4', rationale: 'Inside the bracket the shift goes the other way: x − 4 moves the graph right.', isCorrect: false }]);
  assert.equal(optionRationale(choiceQuestion.answerFields[1], 'up 3'), '', 'nothing authored, nothing shown');
  // The reason is the chosen option's, not any authored one.
  assert.equal(chosenOptionReasons({ question: choiceQuestion, parts: [{ id: 'horizontal', response: 'right 4', isCorrect: true }] })[0].rationale, 'x − 4 inside the function moves every point 4 to the right.');
  assert.deepEqual(chosenOptionReasons({ question: choiceQuestion, parts: [{ id: 'horizontal', response: 'none', isCorrect: false }] }), [], 'no reason for that option: nothing');
  // The compiler keeps the authored reasons on the field.
  const source = JSON.parse(read('teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json'));
  let target = null;
  source.sections.forEach((section, s) => section.questions.forEach((question, q) => {
    if (!target && Array.isArray(question.responses) && question.responses.every((response) => response.type === 'choice')) target = [s, q];
  }));
  const field = source.sections[target[0]].questions[target[1]].responses[0];
  field.optionRationales = { [field.options[1]]: 'One short reason.' };
  const compiled = compileAuthoringIntentV5(source).package.sections[target[0]].questions[target[1]];
  assert.deepEqual(compiled.answerFields[0].optionRationales, { [field.options[1]]: 'One short reason.' });
  // Pre-Flight names a reason that can never be shown.
  assert.deepEqual(optionRationaleProblems(choiceQuestion), []);
  const broken = { answerFields: [{ ...choiceQuestion.answerFields[0], optionRationales: { 'left 5': 'Never shown.', 'right 4': '' } }] };
  assert.equal(optionRationaleProblems(broken).length, 2);
  assert.match(auditAssignmentSolutionReviews([broken]).warnings.join(' '), /"left 5" in "Horizontal" is not one of its options/);
  // Shown only where the worked solution may be, in the closed card and after a right answer.
  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /const choiceReasons = \(isCorrect \|\| isExpired\) && feedbackOpen && gradedForDisplay/);
  const card = region(engine, 'className="mathmaster-closed-question-card"', '</section>');
  assert.match(card, /\{choiceReasonBlock\}\s*\{closedReview\}\s*\{practiceLikeThis\}/, 'the reason, the worked solution, then the similar item');
});
