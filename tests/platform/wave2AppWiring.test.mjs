// src/App.jsx wiring for rules that wave-2 jobs left for App: J's DOL reminder
// rule (#464, QA m13) and H's closed-DOL copy (#463, QA R2-m4). Nothing imports
// App.jsx, so a call with no import would be a runtime ReferenceError that
// passes every other gate (AGENTS.md): each call is asserted beside its import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { describeDolClose } from '../../src/platform/assessment/dolCloseCopy.js';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const code = executableSource(app);
// The module's import block: everything before the first top-level component.
const imports = region(app, 'import ', '\nfunction ', 'App.jsx imports');

test('m13: the DOL reminder is not shown while the student is on that DOL', () => {
  assert.match(imports, /import \{ shouldShowDolOpenReminder \} from '\.\/platform\/student\/dolReminder\.js';/);
  const effect = region(app, 'const activeKeys = new Set();', '// A REOPENED DOL OR AN EXTRA ATTEMPT', 'the DOL reminder effect');
  const gate = effect.indexOf('if (!shouldShowDolOpenReminder({');
  assert.ok(gate > 0, 'the reminder asks the rule');
  // Asked after the key is kept (so leaving the DOL does not restart the
  // "first reminder") and before the reminder is stamped or shown.
  assert.ok(effect.indexOf('activeKeys.add(key);') < gate);
  assert.ok(gate < effect.indexOf('dolOpenAnnouncedRef.current[key] = now;'));
  assert.ok(gate < effect.indexOf('toastWarning('));
  const call = region(effect, 'if (!shouldShowDolOpenReminder({', '})) return;', 'the rule call');
  assert.match(call, /assignmentId: assignment\.id,/);
  assert.match(call, /dolQuestionIndices: dolState\.questionIndices \|\| \[dolState\.questionIndex\],/);
  assert.match(call, /activeView,/);
  assert.match(call, /activeAssignmentId,/);
  assert.match(call, /currentQuestionIndex,/);
  // The view state the rule reads re-runs the effect when it changes.
  assert.match(effect, /\}, \[now, user, assignments, classSchedule, tracker, toastWarning, activeView, activeAssignmentId, currentQuestionIndex\]\);/);
});

test('R2-m4: a closed DOL says who closed it, and only an open one promises "when time ends"', () => {
  assert.match(imports, /import \{ describeDolClose \} from '\.\/platform\/assessment\/dolCloseCopy\.js';/);
  const workspace = region(app, 'const renderAssignmentWorkspace = (preview = false) => {', '// The read-only "What changed" list', 'the assignment workspace');
  assert.match(workspace, /const currentDolCopy = currentIsDOL && !preview\s*\? describeDolClose\(\{ status: dolState\.status, teacherClosed: dolState\.teacherClosed, outcome: currentCheckpointOutcome \}\)\s*: null;/);
  assert.ok(workspace.indexOf('const currentCheckpointOutcome =') < workspace.indexOf('const currentDolCopy ='), 'the receipt is read before the copy');
  // The lock message: the same condition, the wording from the copy module.
  assert.match(workspace, /assignmentLockedMessage=\{!preview && currentIsDOL && dolState\.status === 'ended'\s*\? currentDolCopy\.lockMessage/);
  assert.doesNotMatch(code, /The DOL timer has ended/);
  // "When time ends": a DOL only from the copy (open only); a Warm-Up only while active.
  const promises = workspace.match(/will be submitted automatically when time ends/g) || [];
  assert.equal(promises.length, 1, 'one literal promise left, the Warm-Up one');
  assert.match(workspace, /\{!preview && runtimeActivityRole === 'dol' && currentDolCopy\?\.openNotice && \(/);
  assert.match(workspace, /\{!preview && runtimeActivityRole === 'warmup' && warmupState\.status === 'active' && \(\s*<p[^>]*>Your latest completed response will be submitted automatically when time ends\.<\/p>/);
  // The receipt: only once the server wrote one (receipts are read when the
  // assignment opens, and an untouched question never gets one, so a
  // "checking" line could stand forever); the copy's words when it has them,
  // else the earlier receipt.
  assert.match(workspace, /\{!preview && currentCheckpointOutcome && !currentSectionOpenNow && \(\s*<p role="status"[^>]*>\s*\{currentDolCopy\?\.closeReceipt \|\| \(currentCheckpointOutcome === 'auto-submitted'/);
  assert.doesNotMatch(workspace, /\{!preview && \(?currentDolCopy\?\.closeReceipt/, 'the copy alone never opens the receipt line');
});

test('R2-m4: the copy the workspace now shows for each DOL state', () => {
  const open = describeDolClose({ status: 'active' });
  assert.match(open.openNotice, /when time ends/);
  assert.equal(open.closeReceipt, '');
  const closedByTeacher = describeDolClose({ status: 'ended', teacherClosed: true, outcome: 'auto-submitted' });
  assert.match(closedByTeacher.lockMessage, /Your teacher closed this DOL/);
  assert.doesNotMatch(`${closedByTeacher.lockMessage} ${closedByTeacher.closeReceipt}`, /timer|when time ends/i);
  const timeUp = describeDolClose({ status: 'ended', outcome: 'incomplete-at-close' });
  assert.match(timeUp.lockMessage, /Time is up/);
  assert.match(timeUp.closeReceipt, /^Time is up\. No completed response was available to submit\.$/);
  // No receipt: the copy would say "checking", but the workspace shows no
  // receipt line until the server's receipt exists (asserted above).
  assert.doesNotMatch(describeDolClose({ status: 'ended', outcome: null }).closeReceipt, /submitted/);
  // Another day: nothing pending, so the workspace keeps the earlier receipt.
  assert.deepEqual(describeDolClose({ status: 'notToday', outcome: 'auto-submitted' }), { state: 'not-open', lockMessage: '', openNotice: '', closeReceipt: '' });
});
