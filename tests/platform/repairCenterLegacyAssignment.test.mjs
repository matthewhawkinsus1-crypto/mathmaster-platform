/*
 * TT24 — "Repair Center / Edit Questions" on a legacy assignment.
 *
 * The question editor rebuilds the stored assignment as Assignment V5 while it
 * renders (AssignmentQuestionEditor.jsx). An assignment saved before course and
 * TEKS were recorded on it cannot be rebuilt, and that throw landed in the
 * app's error screen ("Something went wrong on this screen") and took the whole
 * teacher workspace with it. Reproduced in the teacher harness first: the
 * Assignments list, "More actions", "Repair Center / Edit Questions".
 *
 * What this holds: the editor is only opened for an assignment that can be
 * rebuilt; for one that cannot, the teacher gets a toast that says why and
 * stays on the page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { region } from './helpers/sourceContract.mjs';

const workspace = readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8');
const editorWrapper = readFileSync(new URL('../../src/AssignmentQuestionEditor.jsx', import.meta.url), 'utf8');

// The shape the teacher harness and an old production record share: a V5 record
// with sections, but no course on the assignment and standards the course
// cannot be read from.
const legacyAssignment = () => ({
  id: 'legacy-1',
  schemaVersion: 5,
  title: 'Linear Equations — Lesson 5',
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{ questionId: 'legacy-1-p1', activityRole: 'practice', type: 'freeResponse', prompt: 'Solve 3x = 12.', expected: '4', standards: { primary: ['A.5A'] } }],
  }],
});

test('a legacy assignment with no course cannot be rebuilt as V5, and says why in plain words', () => {
  assert.throws(
    () => storedAssignmentToV5(legacyAssignment()),
    /does not contain enough course\/TEKS information/,
  );
  // The same record, once it names its course, rebuilds: the guard turns away
  // only what the editor itself could not open.
  const rebuilt = storedAssignmentToV5({ ...legacyAssignment(), courseId: 'algebra1' });
  assert.equal(rebuilt.assignment.courseId, 'algebra1');
  assert.equal(rebuilt.sections[0].questions.length, 1);
});

test('Edit Questions rebuilds the assignment first and opens the editor only if that worked', () => {
  const handler = region(workspace, 'const openQuestionEditor = (assignment) => {', 'const saveQuestionEditor', 'openQuestionEditor');
  const guard = handler.indexOf('storedAssignmentToV5(assignment)');
  const open = handler.indexOf('setQuestionEditorAssignment(assignment)');
  assert.ok(guard >= 0, 'the handler rebuilds the assignment the way the editor will');
  assert.ok(open > guard, 'the editor is opened only after the rebuild succeeded');
  // The failure is a toast and a return: it never reaches the open call.
  const failure = region(handler, 'catch (error) {', '}\n    setQuestionEditorAssignment', 'the failure branch');
  assert.match(failure, /toastError\(/);
  assert.match(failure, /return false;/);
  assert.match(handler, /return true;\s*\};\s*$/);
});

test('the assignment hub stays open when the editor could not open', () => {
  assert.match(
    workspace,
    /onEditQuestions=\{\(assignment\) => \{ if \(openQuestionEditor\(assignment\)\) setAssignmentHubTarget\(null\); \}\}/,
  );
});

test('the guard rebuilds exactly what the editor rebuilds', () => {
  // If the editor ever rebuilds differently, the guard has to follow it.
  const rebuild = region(editorWrapper, 'const assignmentV5 = useMemo(() => {', '}, [assignment, assignmentId]);', 'the editor rebuild');
  assert.match(rebuild, /storedAssignmentToV5\(assignment\)/);
});
