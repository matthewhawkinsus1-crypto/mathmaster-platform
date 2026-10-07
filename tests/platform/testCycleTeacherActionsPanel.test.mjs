import test from 'node:test';
import assert from 'node:assert/strict';

import { componentSource, region } from './helpers/sourceContract.mjs';
import { describeTeacherRow, teacherActionsForRow } from '../../src/platform/teacher/testCycleTeacherRows.js';
import { describeTestCycleCallError } from '../../src/platform/teacher/testCycleCallErrors.js';

const controls = componentSource('src/components/teacher/TestCycleControls.jsx');

/*
 * "WAIVE REVIEW IS GIVING AN INTERNAL MESSAGE, AND THE SCREEN CUTS THIS OFF."
 *
 * A teacher on a laptop with the sidebar open pressed Actions → Waive Review
 * for a student who had not started. Three things went wrong at once:
 *
 *   1. The panel printed the Firebase client's bare code, "internal": what the
 *      client reports when the callable gives no usable answer at all (not
 *      deployed, failed to start, network). Not what failed, not what to do.
 *   2. The actions opened as a 220px stack inside the last table cell, which
 *      widened a table already at its minimum, so the buttons were cut off at
 *      the edge of the panel and anything beside them could not be seen.
 *   3. Nothing said that waiving Review is not enough when no Test session has
 *      been opened: the student's card reads "Your teacher has not opened the
 *      secure test session yet." There WAS another button to press, a screen away.
 */

/* --- 1. a failed action says what failed, and what to try ----------------- */

test('a callable that never answered is named, not reported as "internal"', () => {
  // Exactly what the Firebase client throws when fetch gets no CORS response.
  const noAnswer = Object.assign(new Error('internal'), { code: 'functions/internal' });
  const text = describeTestCycleCallError(noAnswer, { action: 'Waive Review', callable: 'teacherTestCycleAction' });
  assert.notEqual(text, 'internal');
  assert.match(text, /^Waive Review did not go through/);
  assert.match(text, /did not answer/);
  assert.match(text, /teacherTestCycleAction/, 'names the function to check');
  assert.match(text, /Refresh to see whether it was applied/, 'does not claim nothing changed');
  assert.match(text, /not deployed or is failing to start/);
  // A timeout or outage with no message from the server is the same case.
  assert.match(describeTestCycleCallError(Object.assign(new Error('unavailable'), { code: 'functions/unavailable' }), { action: 'Waive Review' }), /did not answer/);
});

test('an unhandled server exception is told apart from no answer', () => {
  // The callable wrapper's reply for an exception the handler did not catch.
  const crashed = Object.assign(new Error('INTERNAL'), { code: 'functions/internal' });
  const text = describeTestCycleCallError(crashed, { action: 'Waive Review', callable: 'teacherTestCycleAction' });
  assert.match(text, /failed with a server error/);
  assert.match(text, /Cloud Functions log/);
  assert.doesNotMatch(text, /did not answer/);
});

test('a refusal the server wrote is shown as written', () => {
  const refused = Object.assign(new Error('That student is not assigned this Test Cycle.'), { code: 'functions/permission-denied' });
  assert.equal(describeTestCycleCallError(refused, { action: 'Waive Review' }), 'That student is not assigned this Test Cycle.');
  // The sandbox throws plain Errors with a sentence; those pass through too.
  assert.equal(describeTestCycleCallError(new Error('Releasing results runs on the server.'), { action: 'Release' }), 'Releasing results runs on the server.');
  // A bare code word that is not a no-answer code still gets a sentence.
  assert.match(describeTestCycleCallError(Object.assign(new Error('not-found'), { code: 'functions/not-found' }), { action: 'Waive Review' }), /^Waive Review did not complete \(not-found\)/);
});

test('every failure in the panel goes through the translation, row actions included', () => {
  const run = region(controls, 'const run = async (', 'const blocked = ', 'run');
  assert.match(run, /catch \(error\) \{[\s\S]*describeTestCycleCallError\(error, \{ action, callable \}\)/);
  assert.doesNotMatch(run, /error\.message/, 'never the raw client message');
  // Imported where it is called: a .jsx call with no import passes every check.
  assert.match(controls, /import \{ describeTestCycleCallError \} from '\.\.\/\.\.\/platform\/teacher\/testCycleCallErrors\.js';/);
  // The row action names its own label and callable.
  const apply = region(controls, 'const applyRowAction = (', 'const columns = ', 'applyRowAction');
  assert.match(apply, /action: item\.label, callable, studentId: row\.studentId/);
  assert.match(apply, /context\('teacherTestCycleAction'\)/);
});

/* --- 2. the actions are on screen, with what each one does ----------------- */

test('a student\'s actions open as a full-width row pinned inside the visible table', () => {
  const panel = region(controls, '{actionsOpen && (', '</React.Fragment>', 'actions panel row');
  // A row of its own, spanning every column — not a stack inside one cell.
  assert.match(panel, /<td colSpan=\{columns\.length\}/);
  // Pinned to the left of the scroller and as wide as what is visible of it.
  assert.match(panel, /position: 'sticky', left: 0/);
  assert.match(panel, /width: visibleTableWidth \? `\$\{visibleTableWidth\}px` : '100%'/);
  const measure = region(controls, 'const scrollerRef = useRef(null);', 'const load = useCallback(', 'scroller measure');
  assert.match(measure, /setVisibleTableWidth\(node\.clientWidth/);
  assert.match(controls, /<div ref=\{scrollerRef\} style=\{\{ overflowX: 'auto'/);
  // What an action does is printed beside it, not only in a tooltip that
  // a Chromebook or iPad never shows.
  assert.match(panel, /\{item\.detail && <span[^>]*>\{item\.detail\}<\/span>\}/);
  // The toggle sits beside "Where they are", ahead of the grade columns.
  const headings = controls.match(/const columns = \[([^\]]+)\]/)[1];
  assert.ok(headings.indexOf("'Actions'") < headings.indexOf("'Review'"), 'Actions comes before the grade columns');
  assert.ok(headings.indexOf("'Actions'") > headings.indexOf("'Where they are'"));
});

test('a student\'s confirmation and outcome appear in that student\'s panel', () => {
  const panel = region(controls, '{actionsOpen && (', '</React.Fragment>', 'actions panel row');
  assert.match(panel, /pendingConfirm\?\.studentId === row\.studentId \? confirmBox\(pendingConfirm\)/);
  assert.match(panel, /studentId: row\.studentId,\s*title:/, 'a row confirmation is tagged with its student');
  assert.match(panel, /rowOutcomeOnRow && rowOutcome\.studentId === row\.studentId && statusLine\(rowOutcome\)/);
  // The class-wide spot shows only class-wide confirmations.
  assert.match(controls, /\{pendingConfirm && !pendingConfirm\.studentId && confirmBox\(pendingConfirm\)\}/);
  // An outcome whose row is filtered away or closed is shown at the top, not lost.
  assert.match(controls, /const statusMessage = message \|\| \(rowOutcome && !rowOutcomeOnRow \? rowOutcome : null\);/);
});

/* --- 3. waiving Review says what is still needed, and offers it ------------ */

const notStarted = {
  studentId: 'S1', stage: 'review', bucket: 'notStarted',
  review: { attempted: 0, total: 12 }, test: { state: 'none', examSessionId: null },
  retest: { state: 'none' }, corrections: {}, teacherControls: {},
};

test('before any Test session exists, Waive Review says the Test still has to be opened', () => {
  const waive = teacherActionsForRow(notStarted).find((item) => item.action === 'waiveReview');
  assert.ok(waive);
  assert.match(waive.detail, /Test is not open yet/);
  assert.match(waive.doneNote, /Open this student's Test session/);
  assert.ok(!teacherActionsForRow(notStarted).some((item) => item.kind === 'openSession'), 'nothing to open before Review is settled');
  // With a session already open, the waiver alone lets them start.
  const opened = { ...notStarted, test: { state: 'assigned', examSessionId: 'exam-1' } };
  const openedWaive = teacherActionsForRow(opened).find((item) => item.action === 'waiveReview');
  assert.match(openedWaive.detail, /start the Test without finishing Review/);
  assert.equal(openedWaive.doneNote, null);
});

test('a waived student with no Test session is offered their session on the row', () => {
  const waived = { ...notStarted, stage: 'test', bucket: 'readyForTest', teacherControls: { reviewWaived: true } };
  const keys = teacherActionsForRow(waived).map((item) => item.key);
  // First: it is the step the student is waiting on.
  assert.deepEqual(keys, ['openTest', 'requireReview']);
  assert.equal(describeTeacherRow(waived).testText, 'Not opened', 'not a bare dash');
  // So is a student who finished Review before sessions were opened.
  const reviewed = { ...notStarted, stage: 'test', review: { complete: true } };
  assert.ok(teacherActionsForRow(reviewed).some((item) => item.kind === 'openSession'));
  // Once the session exists it is not offered again.
  assert.ok(!teacherActionsForRow({ ...waived, test: { state: 'assigned', examSessionId: 'exam-1' } }).some((item) => item.kind === 'openSession'));
  // An external-original retest opens from entered scores, not from this.
  assert.ok(!teacherActionsForRow(waived, { external: true }).some((item) => item.kind === 'openSession'));
});

test('opening one student\'s session is the class-wide callable scoped to that student', () => {
  const apply = region(controls, 'const applyRowAction = (', 'const columns = ', 'applyRowAction');
  const open = region(apply, "if (item.kind === 'openSession') {", 'return;', 'openSession branch');
  assert.match(open, /assignTestCycleSessions\(\{ assignmentId, classId: targetClassId, studentIds: \[row\.studentId\] \}\)/);
  assert.match(open, /context\('assignTestCycleSessions'\)/);
  // The waiver's own success message carries the next step.
  assert.match(apply, /`\$\{item\.label\} applied for \$\{name\}\.\$\{item\.doneNote \? ` \$\{item\.doneNote\}` : ''\}`/);
});
