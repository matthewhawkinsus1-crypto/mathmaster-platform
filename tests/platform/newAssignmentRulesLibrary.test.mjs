/*
 * SP-5'S ACCEPTANCE: EXISTING ASSIGNMENTS RAISE NOTHING NEW.
 *
 * Every assignment file in teacher-import-jsons/ is compiled the way a
 * teacher's import is (scripts/check-teacher-import.mjs compileTeacherImport,
 * which builds Pre-Flight's model), and Pre-Flight judges it as an existing
 * assignment: the two new-assignment warnings (newAssignmentRulesPreflight.js)
 * find nothing, not even information.
 *
 * Each file is also given to a class from the Library: stored as the Library
 * stores it, then opened the way a teacher re-assigning it opens Review
 * (openStoredAssignmentForPreflight: create mode, and not authored now). That
 * is an existing assignment too, so it raises nothing either.
 *
 * Then each file is judged again as if it were new, to show what the rules
 * would say about content like ours (the counts are printed as diagnostics):
 *   - tool first: none. The library already asks for equations, graphs and
 *     division in their tools, and its answer-box "Solve" items are radical
 *     and rational-exponent equations the spec does not send to Step Algebra.
 *     A detector change that fires on any of it must be read by hand first;
 *   - show the step: every answer box with three or more parts, since no
 *     existing lesson has a checkpoint or followThrough yet, counted here
 *     independently of the module.
 * No lesson file is changed.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { lessonFiles } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { auditNewAssignmentRules } from '../../src/platform/preflight/newAssignmentRulesPreflight.js';
import { repo } from './helpers/firstLoadGraph.mjs';
import { openedByLibraryReuse, reviewOpener, rulesReviewShows, storedLibraryRecord } from './helpers/preflightOpenPaths.mjs';

const FILES = lessonFiles(repo);
// As new: the rules over the very questions the model judged, as the model
// runs them when the review is of a new assignment (isNewAssignment, held by
// tests/platform/newAssignmentRulesPreflight.test.mjs), so each file is
// compiled once.
const LESSONS = FILES.map((file) => {
  const { model } = compileTeacherImport(readFileSync(path.join(repo, file), 'utf8'));
  return { file, existing: model, asNew: { questions: model.questions, newAssignmentRules: auditNewAssignmentRules(model.questions, { isNew: true }) } };
});

const NOTHING = { isNew: false, toolFirst: { warnings: [], findings: [] }, showTheStep: { warnings: [], findings: [] } };

test('every assignment file in teacher-import-jsons compiles for Pre-Flight', () => {
  assert.ok(FILES.length >= 43, `${FILES.length} files`);
  const questions = LESSONS.reduce((sum, lesson) => sum + lesson.existing.questions.length, 0);
  assert.ok(questions >= 1291, `${questions} questions`);
});

test('as existing assignments, the library raises nothing new, not even as information', () => {
  for (const { file, existing } of LESSONS) assert.deepEqual(existing.newAssignmentRules, NOTHING, file);
});

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

test('re-assigned from the Library, every lesson still raises nothing', async () => {
  const open = await reviewOpener(vite);
  let reused = 0;
  for (const file of FILES) {
    const state = openedByLibraryReuse(open, storedLibraryRecord(JSON.parse(readFileSync(path.join(repo, file), 'utf8')), file));
    assert.equal(state.mode, 'create', `${file}: Library reuse opens Review in create mode`);
    assert.deepEqual(rulesReviewShows(state), NOTHING, file);
    reused += 1;
  }
  assert.equal(reused, FILES.length, 'every file goes through Library reuse');
});

test('as if each file were new: what the two rules would say', (t) => {
  const toolFirst = LESSONS.flatMap(({ file, asNew }) => asNew.newAssignmentRules.toolFirst.findings.map((finding) => ({ file, ...finding })));
  const showTheStep = LESSONS.flatMap(({ file, asNew }) => asNew.newAssignmentRules.showTheStep.findings.map((finding) => ({ file, ...finding })));
  assert.ok(LESSONS.every(({ asNew }) => asNew.newAssignmentRules.isNew === true));
  assert.deepEqual(toolFirst, [], 'tool first fires on none of the library');

  // Show the step, counted without the module: compiled answer boxes with
  // three or more answerFields, none carrying a checkpoint or followThrough.
  const expected = LESSONS.flatMap(({ file, asNew }) => asNew.questions.flatMap((question, index) => {
    const fields = Array.isArray(question.answerFields) ? question.answerFields : [];
    const bare = question.type === 'multiAnswer' && question.teacherExcluded !== true && fields.length >= 3
      && !fields.some((field) => field && (field.checkpoint !== undefined || field.followThrough !== undefined));
    return bare ? [{ file, questionNumber: index + 1 }] : [];
  }));
  assert.deepEqual(showTheStep.map(({ file, questionNumber }) => ({ file, questionNumber })), expected);
  assert.ok(showTheStep.length > 0);

  const roles = {};
  for (const { asNew } of LESSONS) {
    for (const { questionNumber } of asNew.newAssignmentRules.showTheStep.findings) {
      const role = asNew.questions[questionNumber - 1]?.activityRole || 'unknown';
      roles[role] = (roles[role] || 0) + 1;
    }
  }
  const answerBoxes = LESSONS.reduce((sum, { asNew }) => sum + asNew.questions.filter((question) => question.type === 'multiAnswer').length, 0);
  const lessonsWithAny = LESSONS.filter(({ asNew }) => asNew.newAssignmentRules.showTheStep.findings.length > 0).length;
  t.diagnostic(`tool first: ${toolFirst.length} questions`);
  t.diagnostic(`show the step: ${showTheStep.length} of ${answerBoxes} answer-box questions, in ${lessonsWithAny} of ${LESSONS.length} files; by section ${JSON.stringify(roles)}`);
});
