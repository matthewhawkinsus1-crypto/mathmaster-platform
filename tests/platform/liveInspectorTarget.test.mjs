/*
 * LIVE VIEW OPENS THE RESPONSE INSPECTOR ON THE QUESTION A STUDENT IS ON (#249, #554 item 8).
 *
 * The heartbeat names the question by its position in the student's list
 * (App.jsx: included.indexOf(currentQuestionIndex)); the inspector's callable
 * takes the storage index its record is kept under. liveInspectorTarget
 * rebuilds that index from the same functions the student's device used, and
 * answers null rather than name the wrong question. The tiles then hand the
 * target to the same screen and callable the gradebook uses, never on the
 * projector.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { liveInspectorTarget } from '../../src/platform/teacher/liveInspectorTarget.js';
import { studentAssignmentIndicesWithPracticePass } from '../../src/assignmentLifecycle.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const question = (id, activityRole, extra = {}) => ({ questionId: id, activityRole, type: 'literal', prompt: id, acceptedAnswers: ['1'], ...extra });
// Warm-Up 1, Classwork 2, Practice 2, DOL 1: storage indices 0..5.
const ASSIGNMENT = Object.freeze({
  id: 'a-live',
  schemaVersion: 5,
  sections: [
    { id: 'wu', role: 'warmup', title: 'Warm-Up', questions: [question('w1', 'warmup')] },
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [question('c1', 'classwork'), question('c2', 'classwork')] },
    { id: 'pr', role: 'practice', title: 'Practice', questions: [question('p1', 'practice'), question('p2', 'practice')] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: [question('d1', 'dol')] },
  ],
});
const live = (extra) => ({ assignmentId: 'a-live', activityRole: 'classwork', questionIndex: 1, questionCount: 6, sectionQuestionIndex: 0, questionStates: 'cx....', currentAttempts: 0, ...extra });

test('a student on Classwork Q1 is storage index 1, with an answer there', () => {
  assert.deepEqual(liveInspectorTarget({ studentId: '910003', live: live(), assignment: ASSIGNMENT }), {
    studentId: '910003', assignmentId: 'a-live', questionIndex: 1, attempted: true,
  });
});

test('a question the teacher left out moves every later position, and the target follows the student\'s own list', () => {
  const excluded = { ...ASSIGNMENT, sections: ASSIGNMENT.sections.map((section) => (section.id === 'cw' ? { ...section, questions: [{ ...section.questions[0], teacherExcluded: true }, section.questions[1]] } : section)) };
  const included = studentAssignmentIndicesWithPracticePass({ assignment: excluded });
  assert.equal(included.length, 5, 'one question fewer in the student\'s list');
  // Position 1 is now Classwork's second question, storage index 2.
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionCount: 5, sectionQuestionIndex: 0 }), assignment: excluded })?.questionIndex, 2);
});

test('a Practice Pass shortens the list: the heartbeat\'s count says which list the student had', () => {
  // With a pass, Practice is waived: the DOL is position 3 (storage 5) in a list of 4.
  const withPass = live({ activityRole: 'dol', questionIndex: 3, questionCount: 4, sectionQuestionIndex: 0, questionStates: 'ccca' });
  assert.equal(liveInspectorTarget({ studentId: 's', live: withPass, assignment: ASSIGNMENT })?.questionIndex, 5);
  // Without one, position 3 is Practice's first question (storage 3).
  const withoutPass = live({ activityRole: 'practice', questionIndex: 3, questionCount: 6, sectionQuestionIndex: 0, questionStates: 'ccca..' });
  assert.equal(liveInspectorTarget({ studentId: 's', live: withoutPass, assignment: ASSIGNMENT })?.questionIndex, 3);
});

test('no target when the question cannot be named for certain: an edited assignment, another assignment, a bad position', () => {
  // The heartbeat's list is longer than any this assignment gives (edited since the student loaded it).
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionCount: 7 }), assignment: ASSIGNMENT }), null);
  // The question at that position is not in the section the heartbeat names.
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ activityRole: 'warmup' }), assignment: ASSIGNMENT }), null);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ sectionQuestionIndex: 1 }), assignment: ASSIGNMENT }), null);
  // With no place in the section to compare, the section's role alone still refuses it.
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ activityRole: 'warmup', sectionQuestionIndex: undefined }), assignment: ASSIGNMENT }), null);
  // A heartbeat with no count and no role cannot say which list it had, and
  // the two lists name different questions at position 3 (Practice 1, or the DOL).
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionIndex: 3, questionCount: undefined, activityRole: undefined, sectionQuestionIndex: undefined }), assignment: ASSIGNMENT }), null);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ assignmentId: 'a-other' }), assignment: ASSIGNMENT }), null);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionIndex: 9 }), assignment: ASSIGNMENT }), null);
  assert.equal(liveInspectorTarget({ studentId: '', live: live(), assignment: ASSIGNMENT }), null);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live(), assignment: { ...ASSIGNMENT, schemaVersion: 4 } }), null);
});

test('attempted only when the heartbeat shows an answer on that question', () => {
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionStates: 'c.....' }), assignment: ASSIGNMENT })?.attempted, false);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionStates: 'c.....', currentAttempts: 2 }), assignment: ASSIGNMENT })?.attempted, true);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionStates: 'ca....' }), assignment: ASSIGNMENT })?.attempted, true);
  assert.equal(liveInspectorTarget({ studentId: 's', live: live({ questionStates: 'cn....' }), assignment: ASSIGNMENT })?.attempted, false, 'an item the student is not required to do');
});

test('hostile heartbeats and assignments give no target, and never throw', () => {
  const hostile = [null, undefined, 'x', 7, [], { toString: null }, { assignmentId: { toString: null } }, live({ questionIndex: -1 }), live({ questionIndex: 1.5 }), live({ questionIndex: '1' }), live({ questionStates: { toString: null } })];
  for (const entry of hostile) {
    for (const assignment of [ASSIGNMENT, null, { id: 'a-live', schemaVersion: 5, sections: 'nope' }, { id: 'a-live', schemaVersion: 5, sections: [null, { questions: [null] }] }]) {
      let target;
      assert.doesNotThrow(() => { target = liveInspectorTarget({ studentId: 's', live: entry, assignment }); });
      if (target) assert.ok(Number.isInteger(target.questionIndex));
    }
  }
});

/* ---------------------------------------------------------------- wiring */

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const monitor = read('src/components/teacher/LiveClassMonitor.jsx');

test('the tile offers the inspector on the student\'s question, stops the click there, and never on the projector', () => {
  const tile = region(monitor, 'function StudentTile({', 'function withClassworkStates', 'the Live Class student tile');
  const button = region(tile, '{onInspect && !roomMode && (', '</button>', 'the tile\'s inspect button');
  assert.match(button, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onInspect\(\); \}\}/, 'the tile behind it does not also open the student');
  assert.match(button, /aria-label=\{`Inspect the answer to \$\{liveQuestionName\(live\)\} for \$\{tileLabel\}`\}/);
  assert.match(button, />\s*Inspect answer\s*$/);
  const card = region(monitor, 'function WalkthroughCard({', 'function LiveTeachingPanel', 'the Walkthrough card');
  assert.match(card, /\{onInspect && \(\s*<button[\s\S]*?onClick=\{onInspect\}[\s\S]*?Inspect answer/);
});

test('Live View hands the inspector a target only for an answered question it can name, and not while projecting', () => {
  const inspectFor = region(monitor, 'const inspectFor = (row) => {', '};', 'the inspector target for a row');
  assert.match(inspectFor, /if \(!onInspectResponse \|\| projecting \|\| !row\?\.live\?\.assignmentId\) return null;/);
  assert.match(inspectFor, /const target = liveInspectorTarget\(\{ studentId: row\.id, live: row\.live, assignment \}\);/);
  assert.match(inspectFor, /if \(!target\?\.attempted\) return null;/);
  assert.match(inspectFor, /onInspectResponse\(\{ studentId: target\.studentId, assignmentId: target\.assignmentId, questionIndex: target\.questionIndex \}\)/);
  assert.match(monitor, /<StudentTile[\s\S]*?onInspect=\{inspectFor\(row\)\}[\s\S]*?\/>/);
  assert.match(monitor, /<WalkthroughCard key=\{row\.id\}[^\n]*onInspect=\{inspectFor\(row\)\}/);
});

test('Teacher Home passes it through, and the workspace opens the gradebook\'s own inspector with it', () => {
  const home = read('src/TeacherHome.jsx');
  assert.match(home, /onInspectResponse = null \}\) \{/);
  assert.match(region(home, '<LiveClassMonitor', '/>', 'Teacher Home\'s Live Class'), /onInspectResponse=\{onInspectResponse\}/);
  const workspace = read('src/app/teacher/TeacherWorkspace.jsx');
  assert.match(region(workspace, '<TeacherHome', '/>', 'Teacher Home in the workspace'), /onInspectResponse=\{\(target\) => setResponseInspectorTarget\(target\)\}/);
  // One inspector, the same one the gradebook opens: the same screen and callable.
  assert.equal((workspace.match(/<StudentResponseInspector\b/g) || []).length, 1);
  assert.match(workspace, /setResponseInspectorTarget\(\{ studentId: student\.id, assignmentId: selectedAssignment\.id, questionIndex: index \}\)/, 'the gradebook\'s entry, the same target shape');
});
