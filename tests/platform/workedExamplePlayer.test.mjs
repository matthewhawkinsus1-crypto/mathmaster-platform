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
import { getQuestionCredit, normalizeQuestionRecord, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../../src/masteryEngine.js';
import { EXAMPLE_SHOWN_LABEL, analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import { focusAfterYourTurn } from '../../src/platform/supports/workedExample/yourTurnFocus.js';
import { splitGrade } from '../../src/platform/teacher/gradeEvidence.js';
import { WORKED_EXAMPLE_SHOWN_AUTO, attemptSupportUsageFrom, rememberSupportUse, restoredSupportUse, supportUseFromRecord } from '../../src/platform/supports/supportUseMemory.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { exampleSkillOf } from '../../src/platform/supports/workedExample/exampleSkill.js';
import { EXAMPLE_COULD_NOT_LOAD_TEXT, EXAMPLE_USE_THE_STEPS_TEXT } from '../../src/platform/supports/hints/hintCopy.js';
import {
  EXAMPLE_PROBLEM_NOTE,
  EXAMPLE_YOUR_TURN_LABEL,
  EXAMPLE_YOUR_TURN_TEXT,
  exampleSlideAt,
  exampleSlides,
  slideReadingText,
  slideTranslationText,
} from '../../src/platform/supports/workedExample/exampleSlides.js';
import {
  EXAMPLE_OPENED_ANNOUNCEMENT,
  EXAMPLE_SUB_SKILLS,
  NO_EXAMPLE_SECTION_ROLES,
  assignmentProblemKeys,
  authoredStepCard,
  exampleOpensByItself,
  exampleSectionRule,
  fadedExample,
  lessonExampleContext,
  questionExampleExemption,
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
  // The panel is handed that example, whole or faded (WE-C): no example, nothing to fade, nothing handed over.
  assert.match(region(engine, 'const hintPanel = helpControlAvailable ? (', ') : null;', 'the hint panel'), /similar=\{shownExample\}/);
  assert.match(region(engine, 'const shownExample = useMemo(', ');', 'the example the panel is handed'), /\? fadedExample\(similarExample\) : similarExample\)/);
  assert.equal(fadedExample(null), null);
  assert.doesNotMatch(engine, /buildSimilarWorkedExample/, 'no second way to an example');
  // The assignment hands over the lesson around the question as three plain values that stay the same between
  // renders: its stored questions, which of them this student is given (a retired or omitted one is not among
  // them), and the lesson's own examples.
  const host = executableSource(read('src/app/student/assignmentWorkspaceView.jsx'));
  assert.match(host, /lessonQuestions=\{questions\}\s+lessonGiven=\{includedQuestionIndices\.join\(\)\}\s+lessonSupports=\{assignment\.lessonSupports\}/);
  assert.match(host, /const includedQuestionIndices = projectedEntries\.map\(\(entry\) => entry\.storageIndex\);/);
  // QuestionEngine works the context out from them. The section's role is the stored question's OWN role
  // (activityRole), never the role it runs under: resolvedActivityPolicy is not read here.
  const context = region(engine, 'const workedExampleContext = useMemo(() => {', '}, [lessonQuestions, lessonGiven, lessonSupports, question]);', 'the example context');
  assert.match(context, /const roleOf = \(candidate\) => \(isActivityRole\(candidate\?\.activityRole\) \? String\(candidate\.activityRole\)\.trim\(\)\.toLowerCase\(\) : null\);/);
  for (const line of [/questions: given\.map\(\(index\) => lessonQuestions\[index\]\),/, /index: given\.indexOf\(lessonQuestions\.indexOf\(question\)\),/, /sectionRole: roleOf\(question\),/, /lessonSupports,/, /assignmentQuestions: lessonQuestions,/]) assert.match(context, line);
  assert.doesNotMatch(context, /resolvedActivityPolicy/);
  // A stored question's activityRole is its section's role: the DOL question of the guide's lesson says "dol",
  // which is what the host itself reads (resolveQuestionActivityRole).
  const stored = storedLesson();
  for (const entry of lessonQuestions(stored)) {
    assert.equal(entry.activityRole, resolveQuestionActivityRole({ question: entry, assignment: stored }), entry.questionId);
  }
  assert.equal(lessonQuestions(stored).find((entry) => entry.questionId === 'ls-dol-1').activityRole, 'dol');
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
  assert.equal(opens({ alreadyShown: true }), false, 'once: not after it has opened by itself');
  // QuestionEngine opens it through this rule. Nobody asked for it, so it is recorded as shown, never as used.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const now = region(engine, 'const exampleOpensNow = exampleOpensByItself({', '});', 'the opening rule');
  for (const line of [/rule: exampleRule,/, /newSkill: workedExampleContext\?\.newSkill === true,/, /example: similarExample,/, /alreadyUsed: restoredSupport\.workedExampleUsed \|\| workedExampleUsed,/, /alreadyShown: restoredSupport\.workedExampleShown \|\| workedExampleShown,/, /attemptCount: record\.attemptCount,/, /locked,/]) assert.match(now, line);
  const effect = region(engine, 'if (!exampleOpensNow) return;', '}, [exampleOpensNow]);', 'the opening effect');
  assert.match(effect, /setSimilarOpen\(true\);/);
  assert.match(effect, /setWorkedExampleShown\(true\);/);
  assert.doesNotMatch(effect, /setWorkedExampleUsed/, 'an example nobody asked for is not help asked for');
  assert.match(effect, /setHintPanelOpen\(true\);/);
  // A question with no skill to name is never a new skill: nothing says it is.
  const unnamed = [{ questionId: 'u1', activityRole: 'classwork', prompt: 'Find the slope of the line through (1, 2) and (5, 5).' }];
  assert.equal(exampleSkillOf(unnamed[0]), null);
  assert.equal(lessonExampleContext({ questions: unnamed, index: 0, sectionRole: 'classwork' }).newSkill, false);
});

// ------------------------------------ 1b. shown by itself is not help asked for

const TEKS = 'A.5A';
const masteryQuestion = (dok = 2) => ({ type: 'algebra', activityRole: 'classwork', alignments: [{ framework: 'teks', code: TEKS, role: 'primary', evidenceLevel: 'assessed' }], dok });
// A student who gets every Classwork question right first time, with the given help recorded on each.
const profileWith = (state) => {
  const assignment = { id: 'a1', title: 'Lesson', questions: Array.from({ length: 7 }, (_, index) => masteryQuestion(index % 3 === 0 ? 3 : 2)) };
  const grades = Object.fromEntries(assignment.questions.map((_, index) => [index, recordQuestionAttempt({
    record: null,
    isCorrect: true,
    supportUsage: attemptSupportUsageFrom({ supportUsage: {}, ...state }),
    occurredAt: '2026-11-20T15:00:00.000Z',
  }).record]));
  return { grades, profile: buildStudentMasteryProfile({ student: { id: 's1', gradesByAssignment: { a1: grades } }, assignments: [assignment] }) };
};

test('an example that opened by itself leaves mastery unchanged; one the student asked for still counts as supported', () => {
  const none = profileWith({});
  const shown = profileWith({ workedExampleShown: true });
  const asked = profileWith({ workedExampleUsed: true });
  // What the attempt records: shown apart from used, and still independent.
  assert.deepEqual(attemptSupportUsageFrom({ supportUsage: {}, workedExampleShown: true }), { ...attemptSupportUsageFrom({ supportUsage: {} }), workedExampleShown: WORKED_EXAMPLE_SHOWN_AUTO });
  assert.equal(shown.grades[0].supportUsage.workedExampleShown, 'auto');
  assert.equal(shown.grades[0].supportUsage.workedExampleUsed, false);
  assert.equal(shown.grades[0].supportUsage.isMathematicallyIndependent, true);
  assert.equal(asked.grades[0].supportUsage.isMathematicallyIndependent, false);
  // A record with no example shown keeps the shape it always had.
  assert.equal('workedExampleShown' in none.grades[0].supportUsage, false);
  assert.equal('workedExampleShown' in attemptSupportUsageFrom({ supportUsage: {} }), false);

  // Mastery: identical with the example shown, to the last field.
  assert.deepEqual(shown.profile, none.profile);
  const teks = (result) => result.profile.teks[TEKS];
  assert.ok(teks(none).score > 0 && teks(none).itemCount === 7);
  // Asked for: supported, as it always was (credit and independence both move).
  assert.ok(teks(asked).score < teks(none).score, `${teks(asked).score} < ${teks(none).score}`);
  assert.notDeepEqual(asked.profile, none.profile);
  const rows = (result) => collectStudentEvidence({ student: { id: 's1', gradesByAssignment: { a1: result.grades } }, assignments: [{ id: 'a1', title: 'Lesson', questions: Array.from({ length: 7 }, (_, index) => masteryQuestion(index % 3 === 0 ? 3 : 2)) }] });
  assert.deepEqual(rows(shown).map((row) => [row.supported, row.independentSuccess, row.credit]), rows(none).map((row) => [row.supported, row.independentSuccess, row.credit]));
  assert.ok(rows(asked).every((row) => row.supported === true && row.independentSuccess === false));
  // Both at once (it opened by itself, then the student opened it again): asked for wins.
  const both = attemptSupportUsageFrom({ supportUsage: {}, workedExampleShown: true, workedExampleUsed: true });
  assert.equal(both.workedExampleUsed, true);
  assert.equal(both.isMathematicallyIndependent, false);
});

test('shown is remembered so it opens once, and the teacher sees it named apart from one asked for', () => {
  // Across a remount and from the record: shown stays shown, and is never read as used.
  const store = new Map();
  const storage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } };
  rememberSupportUse('draft-1', { workedExampleShown: true }, storage);
  const restored = restoredSupportUse({ draftKey: 'draft-1', record: null, storage });
  assert.equal(restored.workedExampleShown, true);
  assert.equal(restored.workedExampleUsed, false);
  const fromRecord = supportUseFromRecord({ attemptCount: 1, supportUsage: { workedExampleShown: 'auto' } });
  assert.equal(fromRecord.workedExampleShown, true);
  assert.equal(fromRecord.workedExampleUsed, false);
  assert.equal(supportUseFromRecord({ attemptCount: 1, supportUsage: { workedExampleShown: true } }).workedExampleShown, false, 'only the recorded value counts');
  // The record keeps it through every later attempt and a normalise, and never invents it.
  const first = recordQuestionAttempt({ record: null, isCorrect: false, supportUsage: attemptSupportUsageFrom({ supportUsage: {}, workedExampleShown: true }) }).record;
  const second = recordQuestionAttempt({ record: first, isCorrect: true, responseKey: 'b', supportUsage: attemptSupportUsageFrom({ supportUsage: {}, workedExampleShown: true }) }).record;
  assert.equal(normalizeQuestionRecord(second).supportUsage.workedExampleShown, 'auto');
  assert.equal(normalizeQuestionRecord(second).supportUsage.isMathematicallyIndependent, true);
  assert.equal('workedExampleShown' in normalizeQuestionRecord({ status: 'correct', attemptCount: 1, totalAttempts: 1, supportUsage: { workedExampleShown: 'yes' } }).supportUsage, false);
  // QuestionEngine carries it into the attempt and the memory, apart from used.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(region(engine, 'const attemptSupportUsage = () => attemptSupportUsageFrom({', '});', 'what an attempt records'), /workedExampleUsed,\s*workedExampleShown,/);
  assert.match(engine, /rememberSupportUse\(draftKey, \{ hintUsed, hintsRevealed, workedExampleUsed, workedExampleShown, /);
  // The teacher's attempt analysis: "Worked example" is one asked for; one shown has its own words.
  const question = masteryQuestion();
  const analyse = (supportUsage) => analyzeAssignmentQuestions({
    assignment: { id: 'a1', schemaVersion: 5, sections: [{ id: 'classwork', role: 'classwork', questions: [question] }] },
    student: { id: 's1', gradesByAssignment: { a1: { 0: recordQuestionAttempt({ record: null, isCorrect: true, supportUsage }).record } } },
  });
  const supportsOf = (result) => (Array.isArray(result) ? result : result?.questions || [])[0]?.lastAttemptSupports;
  const shownSupports = supportsOf(analyse(attemptSupportUsageFrom({ supportUsage: {}, workedExampleShown: true })));
  const askedSupports = supportsOf(analyse(attemptSupportUsageFrom({ supportUsage: {}, workedExampleUsed: true })));
  assert.deepEqual(shownSupports, [EXAMPLE_SHOWN_LABEL]);
  assert.deepEqual(askedSupports, ['Worked example']);
  assert.match(EXAMPLE_SHOWN_LABEL, /not asked for/);
});

// --------------------------------------------- 1c. Your turn, and the announcement

test('"Your turn" puts focus where the student can act: the answer, the next empty field, or the Hint control', () => {
  const element = (name) => ({ name, focused: 0, focus() { this.focused += 1; doc.activeElement = this; } });
  const doc = { activeElement: null, querySelector: () => null };
  const answer = element('answer');
  const empty = element('empty');
  const hint = element('hint');
  const root = { contains: (node) => [answer, empty, hint].includes(node), querySelector: (selector) => (selector === '[data-hint-control]' ? hint : null) };
  const run = (options) => { doc.activeElement = null; return focusAfterYourTurn(root, { doc, ...options }); };
  // 1. The first answer control takes the cursor.
  assert.equal(run({ focusFirst: () => { answer.focus(); return true; }, nextEmpty: () => empty, acceptsFocus: () => true }), 'answer');
  // 2. It does not (Review all parts, a read-only first control): the next empty field.
  assert.equal(run({ focusFirst: () => false, nextEmpty: () => empty, acceptsFocus: () => true }), 'empty-field');
  assert.equal(doc.activeElement, empty);
  // It said it did, but focus is on the page body: still the next empty field.
  assert.equal(run({ focusFirst: () => true, nextEmpty: () => empty, acceptsFocus: () => true }), 'empty-field');
  // 3. No field takes a cursor: the Hint control, a button that is always there.
  assert.equal(run({ focusFirst: () => false, nextEmpty: () => null, acceptsFocus: () => true }), 'hint-control');
  assert.equal(doc.activeElement, hint);
  assert.equal(run({ focusFirst: () => false, nextEmpty: () => empty, acceptsFocus: () => false }), 'hint-control');
  // The Work View Help drawer's copy: the Hint control is found in the page when the work has none.
  const bare = { contains: () => false, querySelector: () => null };
  assert.equal(focusAfterYourTurn(bare, { doc: { activeElement: null, querySelector: (selector) => (selector === '[data-hint-control]' ? hint : null) }, focusFirst: () => false, nextEmpty: () => null }), 'hint-control');
  assert.equal(focusAfterYourTurn(null), null);
  // QuestionEngine hands over through it.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(region(engine, 'const exampleYourTurn = () => {', '\n  };', 'Your turn'), /if \(focusAuthority\.isLive\(ticket\)\) focusAfterYourTurn\(questionEngineRef\.current\);/);
});

test('an example that opens by itself is announced: a polite region, empty on mount, then filled', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // Empty when the question mounts; filled by the effect that opens the example.
  assert.match(engine, /const \[exampleAnnouncement, setExampleAnnouncement\] = useState\(''\);/);
  assert.match(region(engine, 'if (!exampleOpensNow) return;', '}, [exampleOpensNow]);', 'the opening effect'), /setExampleAnnouncement\(EXAMPLE_OPENED_ANNOUNCEMENT\);/);
  // Drawn whether or not the example is open yet, and only where one can open by itself (never a DOL, quiz or test).
  // Nor on a closed question: its result is its one live region.
  assert.match(engine, /\{exampleRule\.opensByItself && !locked \? \(\s*<div role="status" aria-live="polite" data-example-announcement="" style=\{SR_ONLY_STYLE\}>\{exampleAnnouncement\}<\/div>\s*\) : null\}/);
  assert.match(EXAMPLE_OPENED_ANNOUNCEMENT, /worked example opened/);
  // Opening it moves no focus: nothing in the effect asks for any.
  assert.doesNotMatch(region(engine, 'if (!exampleOpensNow) return;', '}, [exampleOpensNow]);', 'the opening effect'), /focus/i);
});

test('if the player cannot load, only it is replaced: the whole example as a list, and the question stays', async () => {
  const panel = executableSource(read('src/platform/supports/hints/HintPanel.jsx'));
  const opened = region(panel, '{similar && similarOpen && (', '</details>', 'the open example');
  assert.match(opened, /<QuestionSupplementBoundary\s+stage="worked-example"\s+context=\{exampleFailure\?\.context\}\s+draftKey=\{exampleFailure\?\.draftKey\}\s+resetKey=\{exampleFailure\?\.resetKey\}\s+fallback=\{<WholeExample example=\{similar\}[^\n]*\/>\}\s*>\s*<Suspense/);
  assert.match(opened, /<\/Suspense>\s*<\/QuestionSupplementBoundary>/);
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /const exampleFailure = \{ context: failureContext, draftKey, resetKey: supplementResetKey \};/);
  assert.match(region(engine, 'const hintPanel = helpControlAvailable ? (', ') : null;', 'the hint panel'), /exampleFailure=\{exampleFailure\}/);
  // The boundary contains a thrown load: its fallback is drawn in place of its children, and nothing above it sees the error.
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const Boundary = (await server.ssrLoadModule('/src/QuestionSupplementBoundary.jsx')).default;
    const boundary = new Boundary({ stage: 'worked-example', fallback: 'whole example', children: 'player' });
    assert.equal(boundary.render(), 'player');
    boundary.state = Boundary.getDerivedStateFromError(new Error('Failed to fetch dynamically imported module'));
    assert.equal(boundary.render(), 'whole example');
  } finally {
    await server.close();
  }
  assert.match(EXAMPLE_COULD_NOT_LOAD_TEXT, /could not load/);
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

test('a Step Algebra replay the lesson wrote is not a step card: the tool\'s engine plays it (WE-C)', () => {
  const assignment = storedLesson();
  const question = receivedAt(assignment, 'ls-cw-2');
  // ex-both-sides is `moves` on Step Algebra, with no `steps`: no card, and the replay is the example
  // (tests/platform/stepAlgebraReplay.test.mjs holds what it plays).
  assert.equal(authoredStepCard(question, assignment.lessonSupports, { sectionRole: 'classwork' }), null);
  const played = workedExampleFor(question, contextAt(assignment, 'ls-cw-2', 'classwork'));
  assert.equal(played.source, 'authored');
  assert.equal(played.format, 'replay');
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
  // Nothing to carry: no key. What the lesson wrote is carried as written (the validator judged its shape).
  for (const empty of [undefined, null, {}, { lessonSupports: null }, { lessonSupports: [] }, { lessonSupports: 'cards' }]) {
    assert.deepEqual(lessonSupportsFields(empty), {});
  }
  assert.deepEqual(lessonSupportsFields({ lessonSupports: { examples: [SAFE_CARD] } }), { lessonSupports: { examples: [SAFE_CARD] } });
});

// -------------------------------------------------------------- 6. the screen

const withModules = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run({
      MathText: (await server.ssrLoadModule('/src/components/common/MathText.jsx')).default,
      SupportedTextActions: (await server.ssrLoadModule('/src/platform/supports/SupportedText.jsx')).SupportedTextActions,
      Player: (await server.ssrLoadModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx')).default,
      HintPanel: (await server.ssrLoadModule('/src/platform/supports/hints/HintPanel.jsx')).default,
    });
  } finally {
    await server.close();
  }
};

const SIBLING = { source: 'family', prompt: 'Write 10/15 in lowest terms.', steps: ['5 divides 10 and 15.', '10 ÷ 5 = 2 and 15 ÷ 5 = 3.'], answer: '2/3' };

test('the player draws one slide, with Back and Next, in a polite live region', async () => {
  await withModules(({ Player, MathText, SupportedTextActions }) => {
    // The panel hands the player the two components it draws with (the player imports neither).
    const render = (props) => renderToStaticMarkup(React.createElement(Player, { example: SIBLING, MathText, SupportedTextActions, ...props }));
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
  assert.match(opened, /<Suspense fallback=\{<p role="status"[^\n]*\}>\s*<WorkedExamplePlayer\s+MathText=\{MathText\}\s+SupportedTextActions=\{SupportedTextActions\}\s+example=\{similar\}[\s\S]*onYourTurn=\{onYourTurn\}\s+openedByItself=\{similarOpenedByItself\}\s*\/>\s*<\/Suspense>/);
  for (const file of ['src/QuestionEngine.jsx', 'src/app/student/assignmentWorkspaceView.jsx', 'src/platform/supports/workedExample/examplePlayer.js']) {
    assert.doesNotMatch(executableSource(read(file)), /WorkedExamplePlayer\.jsx/, `${file} does not load the player itself`);
  }
  // The player's chunk shares no module with the question's: it imports React and its own slides, and nothing else,
  // and nothing in the question's chunk imports those slides. (Shared modules are split out by the build, and some
  // of that reached the first load: scripts/check-first-load-budget.mjs.)
  const playerImports = [...read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx').matchAll(/^import [^;]*? from '([^']+)';/gms)].map((match) => match[1]);
  assert.deepEqual(playerImports, ['react', './exampleSlides.js']);
  assert.doesNotMatch(read('src/platform/supports/workedExample/exampleSlides.js'), /^import /m);
  for (const file of ['src/QuestionEngine.jsx', 'src/platform/supports/hints/HintPanel.jsx', 'src/platform/supports/workedExample/examplePlayer.js', 'src/platform/supports/workedExample/yourTurnFocus.js']) {
    assert.doesNotMatch(executableSource(read(file)), /exampleSlides/, `${file} does not import the player's slides`);
  }
  // The assignment screen is in Home's first load: it hands the lesson over and imports none of the example's code
  // (its rules reach the question families and their graders).
  assert.doesNotMatch(executableSource(read('src/app/student/assignmentWorkspaceView.jsx')), /supports\/workedExample\//);
  // The student's screen does not load the teacher's coverage report for the skill.
  assert.doesNotMatch(executableSource(read('src/platform/supports/workedExample/examplePlayer.js')), /classworkCoverage/);
});
