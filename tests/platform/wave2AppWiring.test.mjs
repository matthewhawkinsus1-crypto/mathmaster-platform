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
  assert.match(imports, /import \{ describeDolClose, DOL_OPEN_NOTICE \} from '\.\/platform\/assessment\/dolCloseCopy\.js';/);
  const workspace = region(app, 'const renderAssignmentWorkspace = (preview = false) => {', '// The read-only "What changed" list', 'the assignment workspace');
  // The copy is the DOL state's: who closed it and the server's receipt. (D7
  // added the student's own extra-time close to the same call; any further
  // arguments are allowed, these three are required.)
  assert.match(workspace, /const currentDolCopy = currentIsDOL && !preview\s*\? describeDolClose\(\{ status: dolState\.status, teacherClosed: dolState\.teacherClosed, outcome: currentCheckpointOutcome(?:, [^}]*)? \}\)\s*: null;/);
  assert.ok(workspace.indexOf('const currentCheckpointOutcome =') < workspace.indexOf('const currentDolCopy ='), 'the receipt is read before the copy');
  // The lock message: the same condition, the wording from the copy module.
  assert.match(workspace, /assignmentLockedMessage=\{!preview && currentIsDOL && dolState\.status === 'ended'\s*\? currentDolCopy\.lockMessage/);
  assert.doesNotMatch(code, /The DOL timer has ended/);
  // "When time ends": a DOL only from the copy (open only); a Warm-Up only while active.
  assert.doesNotMatch(workspace, /completed answers are turned in|will be submitted automatically/, 'no literal promise: both come from the copy module (RT10)');
  assert.match(workspace, /\{!preview && runtimeActivityRole === 'dol' && currentDolCopy\?\.openNotice && \(/);
  assert.match(workspace, /\{!preview && runtimeActivityRole === 'warmup' && warmupState\.status === 'active' && \(\s*<p[^>]*>\{DOL_OPEN_NOTICE\}<\/p>/);
  // The receipt: only once the server wrote one (receipts are read when the
  // assignment opens, and an untouched question never gets one, so a
  // "checking" line could stand forever); the copy's words when it has them,
  // else the earlier receipt.
  assert.match(workspace, /\{!preview && currentCheckpointOutcome && !currentSectionOpenNow && \(\s*<p role="status"[^>]*>\s*\{currentDolCopy\?\.closeReceipt \|\| \(currentCheckpointOutcome === 'auto-submitted'/);
  assert.doesNotMatch(workspace, /\{!preview && \(?currentDolCopy\?\.closeReceipt/, 'the copy alone never opens the receipt line');
});

test('R2-m4: the copy the workspace now shows for each DOL state', () => {
  const open = describeDolClose({ status: 'active' });
  assert.match(open.openNotice, /^When time ends/);
  assert.equal(open.closeReceipt, '');
  const closedByTeacher = describeDolClose({ status: 'ended', teacherClosed: true, outcome: 'auto-submitted' });
  assert.match(closedByTeacher.lockMessage, /Your teacher closed this exit ticket/);
  assert.doesNotMatch(`${closedByTeacher.lockMessage} ${closedByTeacher.closeReceipt}`, /timer|when time ends/i);
  const timeUp = describeDolClose({ status: 'ended', outcome: 'incomplete-at-close' });
  assert.match(timeUp.lockMessage, /Time is up/);
  assert.match(timeUp.closeReceipt, /^Time is up\. No completed response was available to submit\.$/);
  // No receipt: the copy would say "checking", but the workspace shows no
  // receipt line until the server's receipt exists (asserted above).
  assert.doesNotMatch(describeDolClose({ status: 'ended', outcome: null }).closeReceipt, /submitted/);
  // Another day: nothing pending, so the workspace keeps the earlier receipt.
  // extraTimeNotice (D7): the student's own extra-time close, only while open.
  assert.deepEqual(describeDolClose({ status: 'notToday', outcome: 'auto-submitted' }), { state: 'not-open', lockMessage: '', openNotice: '', closeReceipt: '', extraTimeNotice: '' });
});

/*
 * I item 4: a lesson whose prerequisite the student met opens Classwork and
 * Practice early. assignmentLifecycle's sectionAccessForStudent binds the
 * student's own Classwork grades once; App binds `getSectionAccessState` to it
 * so every call (Home's providers, entry, the worksheet PDF, the workspace's
 * locks and the capture proofs a submission carries to the server) sees them.
 * The browser proof (the server accepting an early Classwork answer; DOL and
 * Warm-Up staying shut; a student without the prerequisite still "opens
 * later") is tests/browser/teacherWorkflow/prerequisiteEarlyJourneys.mjs.
 */
test('I item 4: getSectionAccessState is the signed-in student\'s binding everywhere in App', () => {
  // Both imports, beside the binding that calls them.
  const lifecycleImport = region(imports, 'import {\n  CLASS_PERIODS,', "} from './assignmentLifecycle';", 'the assignmentLifecycle import');
  assert.match(lifecycleImport, /\n {2}getSectionAccessState as getSectionAccessStateForAnyone,\n/);
  assert.match(lifecycleImport, /\n {2}sectionAccessForStudent,\n/);
  assert.doesNotMatch(lifecycleImport, /\n {2}getSectionAccessState,\n/, 'the plain name is never imported: it would shadow the binding');
  const binding = code.match(/const getSectionAccessState = useMemo\(\s*\(\) => sectionAccessForStudent\(user\?\.role === 'student' \? classworkGradesByAssignment : null\),\s*\[user\?\.role, classworkGradesByAssignment\],\s*\);/);
  assert.ok(binding, 'the binding: the student\'s grades, re-bound when they or the role change');
  // Declared after the state it reads and before its first use.
  const at = binding.index;
  assert.ok(code.indexOf('const [classworkGradesByAssignment, setClassworkGradesByAssignment] = useState(') < at);
  assert.ok(code.indexOf('const [user, setUser] = useState(') < at);
  const calls = [...code.matchAll(/\bgetSectionAccessState\(/g)].map((match) => match.index);
  // Six since pass 3: the Overview's own lock lookup became the navigator's
  // shared sectionAccessFor (assignmentNavigator.js), which asks the binding.
  assert.ok(calls.length >= 6, `every section-access call (found ${calls.length})`);
  const navigatorAccess = region(code, 'const sectionAccessFor = (entry) => {', 'sectionAccessCache.set(', 'the navigator\'s section access');
  assert.match(navigatorAccess, /manualState: getSectionAccessState\(\{/);
  assert.ok(calls.every((index) => index > at), 'no call before the binding');
  // Home's dashboard model receives the binding, not the plain function.
  const providers = region(code, 'function buildStudentDashboardNow() {', 'function studentUpNextDashboard() {', 'the dashboard providers');
  assert.match(providers, /\n\s+getSectionAccessState,\n/);
  // Both capture proofs (Submit and a counted step) record the bound state.
  const proofs = [...code.matchAll(/captureSectionAccessProof\(\{\s*sectionAccess: getSectionAccessState\(\{/g)];
  assert.equal(proofs.length, 2, 'both capture proofs ask the binding');
  // The plain function is used exactly once: the teacher's own section
  // toggle, which must never read a student's grades.
  const plain = [...code.matchAll(/\bgetSectionAccessStateForAnyone\(/g)];
  assert.equal(plain.length, 1);
  const toggle = region(code, 'const handleToggleSectionAccessForClass = async', 'if (!state.enabled)', 'the teacher section toggle');
  assert.match(toggle, /const state = getSectionAccessStateForAnyone\(\{ assignment, activityRole, classId, classPeriod, nowValue: Date\.now\(\) \}\);/);
});

test('I item 4: what the binding gives a student, a teacher and a preview', async () => {
  const { getSectionAccessState, sectionAccessForStudent } = await import('../../src/assignmentLifecycle.js');
  // A teacher, View as Student, or no grades loaded: the plain function.
  assert.equal(sectionAccessForStudent(null), getSectionAccessState);
  const NOW = Date.parse('2026-09-23T15:00:00Z');
  const lesson = {
    id: 'B1', schemaVersion: 5, assignedClassIds: ['class-a'], prerequisiteAssignmentId: 'A1',
    releaseAt: '2026-09-30T13:00:00Z', dueAt: '2026-10-07T22:00:00Z', lateDueAt: '2026-10-14T22:00:00Z',
    sections: [
      { id: 'classwork', role: 'classwork', questions: [{ type: 'algebra', prompt: 'CW', equationLatex: 'x=1', activityRole: 'classwork' }] },
      { id: 'practice', role: 'practice', questions: [{ type: 'algebra', prompt: 'P', equationLatex: 'x=2', activityRole: 'practice' }] },
      { id: 'dol', role: 'dol', questions: [{ type: 'algebra', prompt: 'D', equationLatex: 'x=3', activityRole: 'dol' }] },
    ],
  };
  const ask = (bound, role) => bound({ assignment: lesson, activityRole: role, classId: 'class-a', nowValue: NOW });
  const met = sectionAccessForStudent({ A1: { score: 100 } });
  const unmet = sectionAccessForStudent({ A1: { score: 60 } });
  for (const role of ['classwork', 'practice']) {
    assert.equal(ask(met, role).isOpen, true, `${role} opens early for the student who met it`);
    assert.equal(ask(unmet, role).status, 'scheduled', `${role} still opens later without it`);
    assert.equal(ask(getSectionAccessState, role).status, 'scheduled', `${role}: the teacher's plain view is unchanged`);
  }
  // A DOL is never a manual section: the binding cannot open it.
  assert.equal(ask(met, 'dol').enabled, false);
});
