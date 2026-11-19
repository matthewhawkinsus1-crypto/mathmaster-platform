/*
 * PRE-FLIGHT'S SUGGESTIONS LINE READS CORRECTLY AT ONE, AND COUNTS EVERY PANEL.
 *
 * Review's Check step opens its advice with one line: "3 suggestions below (1
 * hint that states the answer, 2 answer keys to check)". Each group was
 * named only in the plural, so one note read "1 prompts that need another
 * question's answer", "1 hints that state the answer". And the answer-key and
 * double-check panels, advice in their own panels like the rest, were left
 * out of the count.
 *
 * The phrases below are an independent list: a group's singular or plural
 * changed, or a panel dropped from the count, fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVISORY_FINDING_GROUPS,
  advisoryCountsText,
  advisoryTotalText,
  buildAssignmentV5PreflightModel,
  summarizeAdvisoryFindings,
} from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { auditAssignmentChoiceOptions } from '../../src/platform/preflight/choiceOptionPreflight.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// What a teacher reads for one note of each group, and for two.
const READS = Object.freeze({
  solutionReviews: ['1 note on worked solutions', '2 notes on worked solutions'],
  attemptFeedback: ['1 Practice question with no attempt feedback', '2 Practice questions with no attempt feedback'],
  hintAnswers: ['1 hint that states the answer', '2 hints that state the answer'],
  hiddenHints: ['1 hint students will not see', '2 hints students will not see'],
  // One note per choice box (choiceOptionPreflight.js), and a question can have several.
  choiceOptions: ['1 choice box with an option worth the same as the key', '2 choice boxes with options worth the same as the key'],
  spanishVersions: ['1 note on Spanish for hints and worked solutions', '2 notes on Spanish for hints and worked solutions'],
  otherQuestionReferences: ['1 prompt that needs another question\'s answer', '2 prompts that need another question\'s answer'],
  graphingCalculatorPrompts: ['1 prompt that names a graphing calculator students do not get', '2 prompts that name a graphing calculator students do not get'],
  answerKeys: ['1 answer key to check', '2 answer keys to check'],
  impossibleItems: ['1 note to double-check', '2 notes to double-check'],
});

const notes = (count) => ({ warnings: Array.from({ length: count }, (_, index) => `note ${index + 1}`) });

test('every group reads correctly with one note, and with two', () => {
  assert.deepEqual(ADVISORY_FINDING_GROUPS.map(({ id }) => id), Object.keys(READS), 'every group has its phrases here');
  for (const [id, [one, two]] of Object.entries(READS)) {
    assert.equal(advisoryCountsText(summarizeAdvisoryFindings({ [id]: notes(1) })), one, id);
    assert.equal(advisoryCountsText(summarizeAdvisoryFindings({ [id]: notes(2) })), two, id);
    assert.equal(advisoryCountsText(summarizeAdvisoryFindings({ [id]: notes(7) })), two.replace(/^2 /, '7 '), id);
  }
});

test('the line lists each group with notes, in order, and counts them all', () => {
  const audits = { hintAnswers: notes(1), answerKeys: notes(2), impossibleItems: notes(1), otherQuestionReferences: notes(1) };
  const advisory = summarizeAdvisoryFindings(audits);
  assert.equal(advisory.total, 5);
  assert.equal(advisoryCountsText(advisory), '1 hint that states the answer, 1 prompt that needs another question\'s answer, 2 answer keys to check, 1 note to double-check');
  assert.equal(advisoryTotalText(advisory), '5 suggestions');
  assert.equal(advisoryTotalText(summarizeAdvisoryFindings({ answerKeys: notes(1) })), '1 suggestion');
  assert.equal(advisoryCountsText(summarizeAdvisoryFindings({})), '');
  assert.equal(advisoryTotalText(undefined), '0 suggestions');
});

const lesson = (questions) => ({
  schemaVersion: 5,
  assignment: { title: 'Advice counts', courseId: 'algebra2', instructionalPurpose: 'lesson', gradingPurpose: 'practice' },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: questions.map((question) => ({ dok: 2, ...question, alignments: [{ framework: 'teks', code: '2A.5A', role: 'primary', evidenceLevel: 'assessed' }] })),
  }],
});

test('an answer key to check and a question to double-check are counted with the suggestions', () => {
  const twoWays = { type: 'multiAnswer', prompt: 'Write the function.', answerFields: [{ id: 'f', label: 'f(x)', answer: '2^(x-1)/3' }] };
  const noSolution = { type: 'systemsWorkspace', mode: 'algebraic', equations: ['0 = 5', '0 = 3'], studentActions: ['solveSystem'], variables: ['x', 'y'], method: 'studentChoice', prompt: 'Solve the system.' };
  const model = buildAssignmentV5PreflightModel(lesson([twoWays, noSolution]));
  assert.equal(model.answerKeys.warnings.length, 1, 'the key reads two ways');
  assert.equal(model.impossibleItems.warnings.length, 1, 'the system has no single solution');
  const counted = Object.fromEntries(model.advisory.groups.map((group) => [group.id, group.count]));
  assert.equal(counted.answerKeys, 1);
  assert.equal(counted.impossibleItems, 1);
  // Every panel's notes, and nothing else, make up the total.
  assert.equal(model.advisory.total, Object.keys(READS).reduce((sum, id) => sum + (model[id]?.warnings?.length || 0), 0));
  assert.match(advisoryCountsText(model.advisory), /1 answer key to check/);
  assert.match(advisoryCountsText(model.advisory), /1 note to double-check/);
  // Still advice: the two notes are no readiness finding.
  const advice = new Set([...model.answerKeys.warnings, ...model.impossibleItems.warnings]);
  assert.equal(model.warnings.some((warning) => advice.has(warning)), false);
  assert.equal(model.errors.some((error) => advice.has(error)), false);
});

test('Review\'s Check step counts every advisory panel it shows, with the shared words', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const line = region(modal, '{preflightModel.advisory?.total > 0 && (', '\n      )}', 'the suggestions line');
  assert.match(line, /<strong>\{advisoryTotalText\(preflightModel\.advisory\)\} below<\/strong>/);
  assert.match(line, /\(\{advisoryCountsText\(preflightModel\.advisory\)\}\)\. Advice only: they never stop the assignment from being ready or published\./);
  assert.doesNotMatch(line, /group\.label|'1 suggestion'/, 'the line builds no count of its own');
  // Each advice panel of the Check step is one counted group, and each group has its panel.
  const check = region(modal, 'const renderCheck = () => (', '{preflightModel.questionValues?.rows?.length > 0 && (', 'the Check step\'s advice panels');
  const panels = [...check.matchAll(/\{preflightModel\.(\w+)\?\.warnings\?\.length > 0 && \(/g)].map((match) => match[1]);
  assert.deepEqual([...panels].sort(), Object.keys(READS).sort());
});

// One question with two choice boxes, each with an option worth its key: two
// notes, one a box, and the line said "2 questions with choices worth the
// same as the key" for one question (probe_choice_count).
test('choice notes are counted, and named, per choice box: two boxes of one question read as two boxes', () => {
  const question = {
    questionId: 'q1',
    type: 'multiAnswer',
    activityRole: 'classwork',
    prompt: 'Which forms equal each value?',
    answerFields: [
      { id: 'a', label: 'One half', inputProfile: 'choice', options: ['1/2', '0.5', '2'], answer: '1/2' },
      { id: 'b', label: 'Three quarters', inputProfile: 'choice', options: ['3/4', '0.75', '4/3'], answer: '3/4' },
    ],
  };
  const choiceOptions = auditAssignmentChoiceOptions([question]);
  assert.deepEqual(choiceOptions.warnings.map((note) => note.slice(0, note.indexOf(':'))), ['Question 1 (One half)', 'Question 1 (Three quarters)'], 'one note a box, both on Question 1');
  const advisory = summarizeAdvisoryFindings({ choiceOptions });
  assert.equal(`${advisoryTotalText(advisory)} below (${advisoryCountsText(advisory)})`, '2 suggestions below (2 choice boxes with options worth the same as the key)');
  // The panel's summary names what its list holds, a line a box.
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.choiceOptions?.warnings?.length > 0 && (', '\n      )}', 'the choice-option panel');
  assert.match(panel, /<summary[^>]*>\{preflightModel\.choiceOptions\.warnings\.length === 1 \? '1 choice box' : `\$\{preflightModel\.choiceOptions\.warnings\.length\} choice boxes`\}<\/summary>/);
  assert.doesNotMatch(panel, /'1 question'/);
});
