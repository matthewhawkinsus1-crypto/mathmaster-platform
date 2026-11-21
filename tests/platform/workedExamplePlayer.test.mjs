/*
 * WE-A: THE WORKED-EXAMPLE PLAYER AND THE SECTION RULES
 * (docs/platform/WORKED_EXAMPLES.md sections 3 to 5; the owner's decisions of
 * 2026-11-20).
 *
 * "See a similar problem worked" is a step-through player. What these tests
 * hold:
 *
 *   1. THE SECTION RULES. Classwork opens the example by itself before the
 *      first question on a new skill; Practice plays it only on request; a
 *      DOL, quiz or test never shows it, whatever role the question runs
 *      under, and where it is not shown it is not built.
 *   2. THE SCORE. Opening an example never lowers a score: a Practice attempt
 *      scores the same with the example opened, and only `workedExampleUsed`
 *      differs.
 *   3. THE EXAMPLE. Always a sibling: a lesson's own step card when it passes
 *      similarExampleIsSafe, otherwise the family's; never an item on the
 *      assignment; none for a question that says it needs none.
 *   4. THE SLIDES. The problem, each step with its why, the answer, and
 *      "Your turn" on the last.
 *   5. THE LESSON'S EXAMPLES REACH THE STUDENT: `lessonSupports` is stored
 *      with the assignment, and one without it is stored exactly as before.
 *   6. THE SCREEN. The player draws one slide with Next and Back in a polite
 *      live region; the Hint panel loads it on demand and draws nothing of it
 *      where no example is given.
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
import { NO_EXAMPLE_SECTION_ROLES as CONTRACT_NO_EXAMPLE_ROLES } from '../../src/platform/contract/lessonSupportsV5.js';
import {
  canonicalV5PersistencePatch,
  getStoredAssignmentQuestions,
  lessonSupportsFields,
  storedAssignmentToV5,
} from '../../src/platform/contract/storedAssignmentV5.js';
import { ACTIVITY_POLICIES, resolveQuestionActivityRole } from '../../src/platform/policies/activityPolicies.js';
import { getQuestionCredit, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { splitGrade } from '../../src/platform/teacher/gradeEvidence.js';
import { attemptSupportUsageFrom } from '../../src/platform/supports/supportUseMemory.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { exampleSkillOf } from '../../src/platform/supports/workedExample/exampleSkill.js';
import {
  EXAMPLE_PROBLEM_NOTE,
  EXAMPLE_SUB_SKILLS,
  EXAMPLE_YOUR_TURN_LABEL,
  EXAMPLE_YOUR_TURN_TEXT,
  NO_EXAMPLE_SECTION_ROLES,
  assignmentProblemKeys,
  authoredStepCard,
  exampleOpensByItself,
  exampleSectionRule,
  exampleSlideAt,
  exampleSlides,
  lessonExampleContext,
  questionExampleExemption,
  slideReadingText,
  slideTranslationText,
  workedExampleFor,
} from '../../src/platform/supports/workedExample/examplePlayer.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const fixture = () => JSON.parse(read('tests/platform/fixtures/learningSupportsLessonFragment.json'));

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

// ------------------------------------------------------- 1. the section rules

test('Classwork opens the example by itself; Practice plays it only on request', () => {
  const classwork = exampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: true });
  assert.deepEqual({ ...classwork }, { offered: true, opensByItself: true, subSkills: EXAMPLE_SUB_SKILLS.IN_SEQUENCE });
  const practice = exampleSectionRule({ sectionRole: 'practice', activityRole: 'practice', hintsAllowed: true });
  assert.deepEqual({ ...practice }, { offered: true, opensByItself: false, subSkills: EXAMPLE_SUB_SKILLS.ON_REQUEST }, 'sub-skills are one tap away');
  // A host that names no section (My Math Path, Recovery): on request, as it always was.
  assert.deepEqual({ ...exampleSectionRule({ activityRole: 'practice', hintsAllowed: true }) }, { ...practice });
  assert.equal(exampleSectionRule({ activityRole: 'classwork', hintsAllowed: true }).opensByItself, true);
  // Classwork revisited as practice after its due date: on request only.
  assert.equal(exampleSectionRule({ sectionRole: 'classwork', activityRole: 'practice', hintsAllowed: true }).opensByItself, false);
  assert.equal(exampleSectionRule({ sectionRole: 'warmup', activityRole: 'warmup', hintsAllowed: true }).opensByItself, false);
});

test('a DOL, quiz or test never shows an example, whatever the question runs as', () => {
  assert.deepEqual([...NO_EXAMPLE_SECTION_ROLES], ['dol', 'quiz', 'test']);
  assert.deepEqual([...NO_EXAMPLE_SECTION_ROLES], [...CONTRACT_NO_EXAMPLE_ROLES], 'the roles the authoring contract refuses an example on');
  for (const role of NO_EXAMPLE_SECTION_ROLES) {
    // By the section's own role, even where hints are allowed (a DOL practised after its due date).
    for (const activityRole of [role, 'practice', 'classwork', null]) {
      assert.deepEqual({ ...exampleSectionRule({ sectionRole: role, activityRole, hintsAllowed: true }) }, { offered: false, opensByItself: false, subSkills: null }, `${role} section run as ${activityRole}`);
    }
    // By the role it runs under, where the host names no section.
    assert.equal(exampleSectionRule({ activityRole: role, hintsAllowed: true }).offered, false);
    assert.equal(exampleSectionRule({ sectionRole: 'classwork', activityRole: role, hintsAllowed: true }).offered, false);
    // The policy of each of the three withholds hints, and the example with them.
    assert.equal(ACTIVITY_POLICIES[role].hintsAllowed, false);
    assert.equal(exampleSectionRule({ sectionRole: role, activityRole: role, hintsAllowed: ACTIVITY_POLICIES[role].hintsAllowed }).offered, false);
  }
  // Wherever hints are withheld, so is the example: nothing but true allows it.
  for (const hintsAllowed of [false, undefined, null, 'yes']) {
    assert.equal(exampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed }).offered, hintsAllowed === undefined, `hintsAllowed ${hintsAllowed}`);
  }
});

test('where the section shows no example, QuestionEngine builds none and draws none', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // The rule reads the section's own role beside the role the question runs under.
  const rule = region(engine, 'const exampleRule = exampleSectionRule({', '});', 'the section rule');
  assert.match(rule, /sectionRole: workedExampleContext\?\.sectionRole,/);
  assert.match(rule, /activityRole: resolvedActivityPolicy\?\.role,/);
  assert.match(rule, /hintsAllowed: hintControlAllowed,/);
  // The example is built only where the rule offers it; every control reads it.
  const built = region(engine, 'const similarExample = useMemo(', ');', 'the example');
  assert.match(built, /\(\) => \(exampleRule\.offered \? workedExampleFor\(processedQuestion, \{[\s\S]*\}\) : null\)/);
  assert.match(engine, /const similarOffered = Boolean\(similarExample && !similarOpen && !locked\);/);
  assert.match(region(engine, 'const openSimilarExample = (place) => {', '};', 'opening on request'), /if \(!similarExample\) return;/);
  assert.match(region(engine, 'const hintPanel = helpControlAvailable ? (', ') : null;', 'the hint panel'), /similar=\{similarExample\}/);
  assert.doesNotMatch(engine, /buildSimilarWorkedExample/, 'no second way to an example');
  // The assignment gives the section's OWN role, not the role it runs as, and the lesson around the question.
  const host = executableSource(read('src/app/student/assignmentWorkspaceView.jsx'));
  const lesson = region(host, "renderMemo('workedExampleLesson',", '}));', 'the lesson handed over');
  assert.match(lesson, /sectionRole: activeQuestionRole,/);
  assert.doesNotMatch(lesson, /runtimeActivityRole/);
  // The questions this student is given (a retired or omitted one is not among them), and every question for the item check.
  for (const line of [/questions: includedQuestionIndices\.map\(\(index\) => questions\[index\]\),/, /index: includedQuestionIndices\.indexOf\(currentQuestionIndex\),/, /assignmentQuestions: questions,/, /assignment,/]) assert.match(lesson, line);
  assert.match(host, /const includedQuestionIndices = projectedEntries\.map\(\(entry\) => entry\.storageIndex\);/);
  assert.match(host, /workedExampleLesson=\{currentWorkedExampleLesson\}/);
  // QuestionEngine works the context out from it, with each question's own section role.
  const context = region(engine, 'const workedExampleContext = useMemo(() => (workedExampleLesson ? lessonExampleContext({', '}) : null), [workedExampleLesson]);', 'the example context');
  for (const line of [/questions: workedExampleLesson\.questions,/, /index: workedExampleLesson\.index,/, /sectionRole: workedExampleLesson\.sectionRole,/, /roleOf: \(candidate\) => resolveQuestionActivityRole\(\{ question: candidate, assignment: workedExampleLesson\.assignment \|\| \{\} \}\),/, /lessonSupports: workedExampleLesson\.assignment\?\.lessonSupports,/, /assignmentQuestions: workedExampleLesson\.assignmentQuestions,/]) assert.match(context, line);
});

test('it opens by itself before the first Classwork question on a new skill, once', () => {
  const assignment = storedLesson();
  const questions = lessonQuestions(assignment);
  const skill = (id) => exampleSkillOf(questions[indexOfQuestion(questions, id)]);
  assert.equal(skill('ls-cw-2'), skill('ls-cw-3'), 'CW 2 and CW 3 are one skill');
  // CW 2 is the first equation: new. CW 3 is the same skill: CW 2's example taught it.
  assert.equal(contextAt(assignment, 'ls-cw-2', 'classwork').newSkill, true);
  assert.equal(contextAt(assignment, 'ls-cw-3', 'classwork').newSkill, false);
  // A question that says it needs none opens none.
  assert.equal(questionExampleExemption(questions[indexOfQuestion(questions, 'ls-cw-1')]), 'setup');
  assert.equal(contextAt(assignment, 'ls-cw-1', 'classwork').newSkill, false);
  assert.equal(contextAt(assignment, 'ls-cw-5', 'classwork').newSkill, false);
  // Never a new skill outside Classwork: the same equation skill on Practice and on the DOL.
  assert.equal(contextAt(assignment, 'ls-pr-1', 'practice').newSkill, false);
  assert.equal(contextAt(assignment, 'ls-dol-1', 'dol').newSkill, false);
  // An earlier question on the skill that had no example taught nothing: the next one opens.
  const bare = [
    { questionId: 'a', activityRole: 'classwork', studentActions: ['multipleResponses'], standard: 'A.2B', prompt: 'Describe the graph.' },
    { questionId: 'b', activityRole: 'classwork', studentActions: ['multipleResponses'], standard: 'A.2B', prompt: 'Describe the other graph.' },
  ];
  assert.equal(lessonExampleContext({ questions: bare, index: 1, sectionRole: 'classwork' }).newSkill, true);

  // Question Family slots are stored as blueprints, with no numbers until delivered: the family is the skill, and a
  // slot a support family claims taught it. The second slot opens none; another family's slot is a new skill.
  const slot = (questionId, id) => ({ questionId, type: 'multiAnswer', activityRole: 'classwork', questionFamily: { id, version: 1, tool: 'multiAnswer' } });
  const slots = [slot('f1', 'linear.twoStepEquation'), slot('f2', 'linear.twoStepEquation'), slot('f3', 'quadratics.identifyVertex')];
  assert.deepEqual(slots.map((_, index) => lessonExampleContext({ questions: slots, index, sectionRole: 'classwork' }).newSkill), [true, false, true]);
  // A question the student is not given (retired, or left out of their work) taught nothing: the host passes only
  // theirs, so with CW 2 gone CW 3 is the first equation they meet. Every question still counts as an item.
  const given = questions.filter((question) => question.questionId !== 'ls-cw-2');
  const withoutCw2 = lessonExampleContext({ questions: given, index: indexOfQuestion(given, 'ls-cw-3'), sectionRole: 'classwork', assignmentQuestions: questions, roleOf: (question) => resolveQuestionActivityRole({ question, assignment }) });
  assert.equal(withoutCw2.newSkill, true);
  assert.deepEqual([...withoutCw2.assignmentProblems], [...contextAt(assignment, 'ls-cw-3', 'classwork').assignmentProblems]);
  assert.equal(lessonExampleContext({ questions: given, index: -1, sectionRole: 'classwork' }).newSkill, false, 'a question not among theirs opens none');

  const rule = exampleSectionRule({ sectionRole: 'classwork', activityRole: 'classwork', hintsAllowed: true });
  const example = { prompt: 'p', steps: ['s'], answer: 'a' };
  const opens = (over) => exampleOpensByItself({ rule, newSkill: true, example, ...over });
  assert.equal(opens({}), true);
  assert.equal(opens({ newSkill: false }), false, 'only on a new skill');
  assert.equal(opens({ example: null }), false, 'only with an example to open');
  assert.equal(opens({ alreadyUsed: true }), false, 'once: not on coming back to the question');
  assert.equal(opens({ attemptCount: 1 }), false, 'not after a try');
  assert.equal(opens({ totalAttempts: 3 }), false, 'not on a replacement question');
  assert.equal(opens({ locked: true }), false, 'not on a closed question');
  for (const sectionRole of ['practice', 'warmup', 'dol', 'quiz', 'test']) {
    const other = exampleSectionRule({ sectionRole, activityRole: sectionRole, hintsAllowed: true });
    assert.equal(exampleOpensByItself({ rule: other, newSkill: true, example }), false, `${sectionRole} never opens one by itself`);
  }
  // QuestionEngine opens it through this rule, and records it as it records one asked for.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const now = region(engine, 'const exampleOpensNow = exampleOpensByItself({', '});', 'the opening rule');
  for (const line of [/rule: exampleRule,/, /newSkill: workedExampleContext\?\.newSkill === true,/, /example: similarExample,/, /alreadyUsed: restoredSupport\.workedExampleUsed \|\| workedExampleUsed,/, /attemptCount: record\.attemptCount,/, /locked,/]) assert.match(now, line);
  const effect = region(engine, 'if (!exampleOpensNow) return;', '}, [exampleOpensNow]);', 'the opening effect');
  assert.match(effect, /setSimilarOpen\(true\);/);
  assert.match(effect, /setWorkedExampleUsed\(true\);/);
  assert.match(effect, /setHintPanelOpen\(true\);/);
});

// --------------------------------------------------------------- 2. the score

test('a Practice score is unchanged after an example is opened; only workedExampleUsed differs', () => {
  const assignment = storedLesson();
  const questions = lessonQuestions(assignment);
  const practiceIndex = indexOfQuestion(questions, 'ls-pr-1');
  const classworkIndex = indexOfQuestion(questions, 'ls-cw-2');
  // What QuestionEngine records for the attempt, with and without the example opened.
  const usage = (workedExampleUsed) => attemptSupportUsageFrom({ supportUsage: {}, workedExampleUsed });
  assert.equal(usage(true).workedExampleUsed, true);
  assert.equal(usage(false).workedExampleUsed, false);

  // The same work each time: a miss with partial credit, then right; and three misses.
  const SEQUENCES = {
    'right first time': [{ isCorrect: true }],
    'a miss, then right': [{ isCorrect: false, partialCreditPercent: 50 }, { isCorrect: true }],
    'never right': [{ isCorrect: false, partialCreditPercent: 25 }, { isCorrect: false, partialCreditPercent: 50 }, { isCorrect: false, partialCreditPercent: 50 }],
  };
  const play = (attempts, workedExampleUsed, policy) => attempts.reduce((record, attempt, index) => recordQuestionAttempt({
    record,
    ...attempt,
    questionDetails: `try ${index + 1}`,
    timeSpent: 40,
    responseKey: `try-${index + 1}`,
    supportUsage: usage(workedExampleUsed),
    maximumAttempts: policy.attempts,
    occurredAt: '2026-11-20T15:00:00.000Z',
  }).record, null);

  for (const [role, index] of [['practice', practiceIndex], ['classwork', classworkIndex]]) {
    const policy = ACTIVITY_POLICIES[role];
    for (const [name, attempts] of Object.entries(SEQUENCES)) {
      const without = play(attempts, false, policy);
      const withExample = play(attempts, true, policy);
      const label = `${role}, ${name}`;
      assert.equal(withExample.supportUsage.workedExampleUsed, true, `${label}: the example is recorded`);
      assert.equal(without.supportUsage.workedExampleUsed, false);
      assert.equal(withExample.supportUsage.isMathematicallyIndependent, false, `${label}: mastery counts the attempt as supported`);
      // The score: the question's credit, and the assignment's grade.
      assert.equal(getQuestionCredit(withExample), getQuestionCredit(without), `${label}: the question's credit`);
      assert.equal(withExample.status, without.status);
      assert.equal(withExample.attemptCount, without.attemptCount, `${label}: it uses no attempt`);
      assert.equal(withExample.bestPartialCredit, without.bestPartialCredit);
      assert.deepEqual(
        splitGrade({ tracker: { [index]: withExample }, assignment }),
        splitGrade({ tracker: { [index]: without }, assignment }),
        `${label}: the grade`,
      );
      // Nothing else about the record moves.
      const strip = (record) => ({ ...record, supportUsage: { ...record.supportUsage, workedExampleUsed: null, isMathematicallyIndependent: null }, attempts: record.attempts?.map((entry) => ({ ...entry, supportUsage: null })) });
      assert.deepEqual(strip(withExample), strip(without), `${label}: only the support flags differ`);
    }
  }
  // A grade is real work: the comparison above is not two zeros.
  const right = play(SEQUENCES['right first time'], true, ACTIVITY_POLICIES.practice);
  assert.equal(getQuestionCredit(right), 1);
  assert.ok(splitGrade({ tracker: { [practiceIndex]: right }, assignment }).score > 0);
});

test('no grade reads workedExampleUsed, and opening an example uses no attempt', () => {
  for (const file of ['src/platform/teacher/gradeEvidence.js', 'src/platform/publishing/compositeGradeCalculator.js']) {
    assert.doesNotMatch(executableSource(read(file)), /workedExampleUsed/, `${file} reads no example flag`);
  }
  const credit = region(executableSource(read('functions/shared/attemptPolicy.mjs')), 'export const getQuestionCredit = (record) => {', '\n};', "a question's credit");
  assert.doesNotMatch(credit, /supportUsage|workedExampleUsed/);
  // Opening one, by itself or on request, sets the flag and grades nothing.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  for (const [start, end, label] of [
    ['const openSimilarExample = (place) => {', '\n  };', 'on request'],
    ['if (!exampleOpensNow) return;', '}, [exampleOpensNow]);', 'by itself'],
    ['const exampleYourTurn = () => {', '\n  };', 'Your turn'],
  ]) {
    const body = region(engine, start, end, label);
    assert.doesNotMatch(body, /onGrade|handleSubmit|recordQuestionAttempt|setFeedback|attemptCount\s*[+=]/, `${label} grades nothing`);
  }
  assert.match(region(engine, 'const openSimilarExample = (place) => {', '\n  };', 'on request'), /setWorkedExampleUsed\(true\);/);
});

// ------------------------------------------------------------- 3. the example

const receivedAt = (assignment, id) => {
  const questions = lessonQuestions(assignment);
  return asQuestionEngineReceivesIt(questions[indexOfQuestion(questions, id)]);
};

// A step card for CW 4 (slope 3, intercept −2, y = 3x − 2) that states none of its answers.
const SAFE_CARD = {
  id: 'ex-line-two-points',
  skill: 'lines.equationFromTwoPoints',
  source: 'authored',
  problem: 'A line passes through (1, 5) and (4, 20). Find its slope, its y-intercept and its equation.',
  steps: [
    { show: 'm = (20 - 5) / (4 - 1) = 15 / (4 - 1) = 5', why: 'Slope is the change in y over the change in x.' },
    { show: '5 = 5(1) + b, so b = 0', why: 'Put one point and the slope into y = mx + b to find b.' },
    { show: 'y = 5x', why: 'Write the slope and the y-intercept into y = mx + b.' },
  ],
};
const withCard = (card) => (source) => {
  const index = source.lessonSupports.examples.findIndex((example) => example.id === card.id);
  source.lessonSupports.examples[index] = card;
  return source;
};

test("a lesson's own step card plays for the question that names it, with a why on every step", () => {
  const assignment = storedLesson(withCard(SAFE_CARD));
  const question = receivedAt(assignment, 'ls-cw-4');
  const context = contextAt(assignment, 'ls-cw-4', 'classwork');
  const example = workedExampleFor(question, context);
  assert.equal(example.source, 'authored');
  assert.equal(example.prompt, SAFE_CARD.problem);
  assert.deepEqual(example.steps, SAFE_CARD.steps);
  assert.ok(example.steps.every((step) => step.why), 'every step says why');
  assert.equal(context.newSkill, true, 'and it opens by itself: the first question on its skill');
  // The guard every built-in sibling passes, on what the student is shown.
  assert.equal(similarExampleIsSafe(question, { prompt: example.prompt, steps: example.steps.map((step) => `${step.show} ${step.why}`), answer: example.answer }), true);
});

test('a step card that states the question\'s answer is not shown (similarExampleIsSafe is kept)', () => {
  // The same card with the question's own slope, 3, in its first step.
  const telling = { ...SAFE_CARD, steps: [{ show: 'm = (11 - 5) / (3 - 1) = 3', why: 'Slope is the change in y over the change in x.' }, ...SAFE_CARD.steps.slice(1)] };
  const assignment = storedLesson(withCard(telling));
  const question = receivedAt(assignment, 'ls-cw-4');
  assert.ok(authoredStepCard(question, assignment.lessonSupports, { sectionRole: 'classwork' }), 'the lesson wrote it');
  assert.equal(workedExampleFor(question, contextAt(assignment, 'ls-cw-4', 'classwork')), null, 'and it is withheld: no family sibling stands in for this question');
  // A why that states it is refused the same way.
  const tellingWhy = { ...SAFE_CARD, steps: [{ ...SAFE_CARD.steps[0], why: 'Like yours, where the slope is 3.' }, ...SAFE_CARD.steps.slice(1)] };
  const second = storedLesson(withCard(tellingWhy));
  assert.equal(workedExampleFor(receivedAt(second, 'ls-cw-4'), contextAt(second, 'ls-cw-4', 'classwork')), null);
});

test('an example is never an item on the same assignment, and never the question itself', () => {
  const assignment = storedLesson(withCard(SAFE_CARD));
  const questions = lessonQuestions(assignment);
  const question = receivedAt(assignment, 'ls-cw-4');
  const context = contextAt(assignment, 'ls-cw-4', 'classwork');
  // Its problem is one of the assignment's: withheld, whatever its spacing or case.
  const other = questions[indexOfQuestion(questions, 'ls-cw-5')];
  const stolen = { ...assignment.lessonSupports, examples: [{ ...SAFE_CARD, problem: `  ${other.prompt.toUpperCase()}` }] };
  assert.equal(assignmentProblemKeys(questions).has(other.prompt.toLowerCase().replace(/[\s$]+/g, '')), true);
  assert.equal(workedExampleFor(question, { ...context, lessonSupports: stolen }), null);
  // The family's sibling for an equation question is never that equation, or another item.
  const equation = receivedAt(assignment, 'ls-cw-2');
  const sibling = workedExampleFor(equation, { sectionRole: 'classwork', assignmentProblems: context.assignmentProblems });
  assert.equal(sibling.source, 'family');
  assert.notEqual(sibling.prompt, equation.prompt);
  assert.equal(context.assignmentProblems.has(sibling.prompt.toLowerCase().replace(/[\s$]+/g, '')), false);
  // If every sibling the family can make is an item of the assignment, none is shown.
  const everySibling = new Set(Array.from({ length: 18 }, (_, seed) => workedExampleFor(equation, { seed })?.prompt).filter(Boolean).map((prompt) => prompt.toLowerCase().replace(/[\s$]+/g, '')));
  assert.equal(workedExampleFor(equation, { assignmentProblems: everySibling }), null);
});

test('a tool replay the lesson wrote is left to the replay packages: the family\'s sibling plays meanwhile', () => {
  const assignment = storedLesson();
  const question = receivedAt(assignment, 'ls-cw-2');
  // ex-both-sides is `moves` on Step Algebra, with no `steps`.
  assert.equal(authoredStepCard(question, assignment.lessonSupports, { sectionRole: 'classwork' }), null);
  assert.equal(workedExampleFor(question, contextAt(assignment, 'ls-cw-2', 'classwork')).source, 'family');
  // An example kept to other sections is not this section's.
  const kept = { examples: [{ ...SAFE_CARD, roles: ['practice'] }] };
  const cw4 = receivedAt(storedLesson(withCard(SAFE_CARD)), 'ls-cw-4');
  assert.equal(authoredStepCard(cw4, kept, { sectionRole: 'classwork' }), null);
  assert.ok(authoredStepCard(cw4, kept, { sectionRole: 'practice' }));
  // A name the lesson does not have, an exemption, and no lesson supports at all: no card.
  assert.equal(authoredStepCard({ example: 'nowhere' }, kept), null);
  assert.equal(authoredStepCard({ example: { none: 'setup' } }, kept), null);
  assert.equal(authoredStepCard(cw4, null), null);
});

// -------------------------------------------------------------- 4. the slides

test('the slides: the problem, each step with its why, the answer, and Your turn on the last', () => {
  const family = { source: 'family', prompt: 'Solve $2x + 3 = 11$.', steps: ['Subtract 3 from both sides: $2x = 8$.', 'Divide both sides by 2: $x = 4$.'], answer: 'x = 4' };
  const slides = exampleSlides(family);
  assert.deepEqual(slides.map((slide) => [slide.kind, slide.label, slide.show]), [
    ['problem', 'The problem', 'Solve $2x + 3 = 11$.'],
    ['step', 'Step 1 of 2', 'Subtract 3 from both sides: $2x = 8$.'],
    ['step', 'Step 2 of 2', 'Divide both sides by 2: $x = 4$.'],
    ['answer', 'The answer', 'x = 4'],
  ]);
  assert.deepEqual(slides.map((slide) => slide.last), [false, false, false, true], 'Your turn is on the last slide only');
  assert.deepEqual(slides.map((slide) => slide.index), [0, 1, 2, 3]);
  // Read aloud says the move and where it is; Translate is given the sentence the language pack knows.
  assert.equal(slideReadingText(slides[0]), `The problem. Solve $2x + 3 = 11$. ${EXAMPLE_PROBLEM_NOTE}`);
  assert.equal(slideReadingText(slides[1]), 'Step 1 of 2. Subtract 3 from both sides: $2x = 8$.');
  assert.equal(slideReadingText(slides[3]), `The answer. Answer: x = 4 ${EXAMPLE_YOUR_TURN_TEXT}`);
  assert.deepEqual(slides.map(slideTranslationText), [family.prompt, ...family.steps, 'Answer: x = 4']);
  assert.equal(EXAMPLE_YOUR_TURN_LABEL, 'Your turn');

  // A lesson's step card: a why under every step, and it ends on its own last step.
  const card = exampleSlides({ source: 'authored', prompt: SAFE_CARD.problem, steps: SAFE_CARD.steps, answer: 'y = 5x' });
  assert.deepEqual(card.map((slide) => slide.kind), ['problem', 'step', 'step', 'step']);
  assert.deepEqual(card.slice(1).map((slide) => slide.why), SAFE_CARD.steps.map((step) => step.why));
  assert.equal(card.at(-1).last, true);
  assert.equal(slideReadingText(card[1]), `Step 1 of 3. ${SAFE_CARD.steps[0].show} Why: ${SAFE_CARD.steps[0].why}`);
  assert.equal(slideTranslationText(card[1]), `${SAFE_CARD.steps[0].show} ${SAFE_CARD.steps[0].why}`);

  // Next and Back never leave the example.
  assert.deepEqual([-3, 0, 2, 3, 99, NaN, undefined].map((index) => exampleSlideAt(slides, index)), [0, 0, 2, 3, 3, 0, 0]);
  // Nothing to play, nothing drawn.
  for (const empty of [null, {}, { prompt: 'p', steps: [] }, { prompt: '', steps: ['s'] }]) assert.deepEqual(exampleSlides(empty), []);
});

// ------------------------------------------- 5. the lesson's examples are stored

test("the lesson's examples reach the student's assignment; one without them is stored as before", () => {
  const source = fixture();
  const parsed = parseAssignmentBlueprintText(JSON.stringify(source));
  const patch = canonicalV5PersistencePatch(parsed.assignmentV5);
  assert.deepEqual(patch.lessonSupports, source.lessonSupports);
  // And back, for an edit or a copy: the next save keeps them.
  const reopened = storedAssignmentToV5({ id: 'lesson-1', ...patch });
  assert.deepEqual(reopened.lessonSupports, source.lessonSupports);
  assert.deepEqual(canonicalV5PersistencePatch(reopened).lessonSupports, source.lessonSupports);
  // The new-assignment save carries them the same way.
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  assert.match(workspace, /\.\.\.lessonSupportsFields\(reviewedV5\),/);

  // No lesson supports: no key at all, so nothing about the stored record moves.
  const bare = fixture();
  delete bare.lessonSupports;
  bare.sections.forEach((section) => section.questions.forEach((question) => { delete question.example; }));
  const barePatch = canonicalV5PersistencePatch(parseAssignmentBlueprintText(JSON.stringify(bare)).assignmentV5);
  assert.equal('lessonSupports' in barePatch, false);
  assert.equal('lessonSupports' in storedAssignmentToV5({ id: 'lesson-2', ...barePatch }), false);
  for (const empty of [undefined, null, {}, { lessonSupports: null }, { lessonSupports: [] }, { lessonSupports: {} }, { lessonSupports: { examples: [], referenceCards: [] } }]) {
    assert.deepEqual(lessonSupportsFields(empty), {});
  }
  assert.deepEqual(lessonSupportsFields({ lessonSupports: { examples: [SAFE_CARD], other: 1 } }), { lessonSupports: { examples: [SAFE_CARD] } });
});

// -------------------------------------------------------------- 6. the screen

const withModules = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run({
      Player: (await server.ssrLoadModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx')).default,
      HintPanel: (await server.ssrLoadModule('/src/platform/supports/hints/HintPanel.jsx')).default,
    });
  } finally {
    await server.close();
  }
};

const SIBLING = { source: 'family', prompt: 'Write 10/15 in lowest terms.', steps: ['5 divides 10 and 15.', '10 ÷ 5 = 2 and 15 ÷ 5 = 3.'], answer: '2/3' };

test('the player draws one slide, with Back and Next, in a polite live region', async () => {
  await withModules(({ Player }) => {
    const render = (props) => renderToStaticMarkup(React.createElement(Player, { example: SIBLING, ...props }));
    const first = render({});
    assert.match(first, /<div role="group" aria-label="Worked example" data-worked-example-player="" data-example-source="family" data-example-slide-number="1" data-example-slide-count="4" data-example-slide-kind="problem"/);
    // One slide: the problem, and none of the steps or the answer yet.
    assert.match(first, /<div aria-live="polite" aria-atomic="true" data-example-slide=""[^>]*><p data-example-slide-label=""[^>]*>The problem<\/p>/);
    assert.match(first, /<p data-example-show=""[^>]*><span>Write .* in lowest terms\.<\/span><\/p><p data-example-note=""[^>]*>This problem is like yours, with different numbers\./);
    assert.doesNotMatch(first, /data-example-why/, 'the problem has no why: its steps do');
    assert.doesNotMatch(first, /5 divides 10 and 15|2\/3|Answer:/, 'a step is not shown before its slide');
    // Back is in the page but not available on the first slide; Next is a button.
    assert.match(first, /<button type="button" data-example-back="" aria-disabled="true"[^>]*>Back<\/button>/);
    assert.match(first, /<span data-example-progress=""[^>]*>1 of 4<\/span>/);
    assert.match(first, /<button type="button" data-example-next=""[^>]*>Next<\/button>/);
    assert.doesNotMatch(first, /data-example-your-turn=""/, 'Your turn is the last slide\'s');
    assert.doesNotMatch(first, /data-example-opened-by-itself/);
    // Opened by Classwork before a new skill, it says so.
    assert.match(render({ openedByItself: true }), /<p data-example-opened-by-itself=""[^>]*>New skill\./);
    // Read aloud and Translate are offered on the slide for the student entitled to them.
    assert.match(render({ readAloud: { language: 'en' } }), /aria-label="Read the worked example, the problem aloud"/);
    assert.doesNotMatch(first, /data-supported-text-actions/);
    // Nothing to play: nothing drawn.
    assert.equal(render({ example: null }), '');
    assert.equal(render({ example: { prompt: 'p', steps: [] } }), '');
  });
  // Next becomes "Your turn" in place on the last slide, and hands over.
  const player = executableSource(read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx'));
  const next = region(player, 'const next = () => {', '};', 'Next');
  assert.match(next, /if \(slide\.last\) onYourTurn\?\.\(\);\s*else setPosition\(at \+ 1\);/);
  assert.match(player, /\{slide\.last \? EXAMPLE_YOUR_TURN_LABEL : 'Next'\}/);
  assert.match(player, /const back = \(\) => \{ if \(!first\) setPosition\(at - 1\); \};/);
  // Reduced motion: a slide replaces the last, with nothing to animate.
  assert.doesNotMatch(player, /transition|animation|@keyframes/);
});

test('the Hint panel loads the player on demand, and draws nothing of it with no example', async () => {
  await withModules(({ HintPanel }) => {
    const HINTS = [{ text: 'Find a number that divides 6 and 8.', source: 'authored' }];
    const render = (props) => renderToStaticMarkup(React.createElement(HintPanel, { hints: HINTS, release: { canRevealNext: true, waitingForAttempt: false }, onReveal: () => {}, onOpenSimilar: () => {}, ...props }));
    // No example given (a DOL, quiz or test, or a question with none): no offer, no example, no player.
    for (const props of [{ similar: null }, { similar: null, similarOpen: true }, { similar: null, similarOpen: true, similarOpenedByItself: true }]) {
      const none = render(props);
      assert.doesNotMatch(none, /Try a similar one|data-similar-example|data-worked-example-player|A similar problem, worked out|Loading the example/);
    }
    // Offered, then opened: the example's heading, and the player on its way.
    assert.match(render({ similar: SIBLING }), />Try a similar one<\/button>/);
    const open = render({ similar: SIBLING, similarOpen: true });
    assert.match(open, /<details open="" data-similar-example=""[^>]*><summary[^>]*>A similar problem, worked out<\/summary>/);
    assert.doesNotMatch(open, />Try a similar one<\/button>/);
  });
  // The player is not in the question's own chunk: one dynamic import, in the panel.
  const panel = executableSource(read('src/platform/supports/hints/HintPanel.jsx'));
  assert.match(panel, /const WorkedExamplePlayer = lazy\(\(\) => import\('\.\.\/workedExample\/WorkedExamplePlayer\.jsx'\)\);/);
  const opened = region(panel, '{similar && similarOpen && (', '</details>', 'the open example');
  assert.match(opened, /<Suspense fallback=\{<p role="status"[^\n]*\}>\s*<WorkedExamplePlayer\s+example=\{similar\}[\s\S]*onYourTurn=\{onYourTurn\}\s+openedByItself=\{similarOpenedByItself\}\s*\/>\s*<\/Suspense>/);
  for (const file of ['src/QuestionEngine.jsx', 'src/app/student/assignmentWorkspaceView.jsx', 'src/platform/supports/workedExample/examplePlayer.js']) {
    assert.doesNotMatch(executableSource(read(file)), /WorkedExamplePlayer\.jsx/, `${file} does not load the player itself`);
  }
  // The assignment screen is in Home's first load: it hands the lesson over and imports none of the example's code
  // (its rules reach the question families and their graders).
  assert.doesNotMatch(executableSource(read('src/app/student/assignmentWorkspaceView.jsx')), /supports\/workedExample\//);
  // The student's screen does not load the teacher's coverage report for the skill.
  assert.doesNotMatch(executableSource(read('src/platform/supports/workedExample/examplePlayer.js')), /classworkCoverage/);
});
