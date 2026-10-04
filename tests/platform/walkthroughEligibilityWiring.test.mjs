import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * The screens are wired to the shared availability rule
 * (src/platform/assignments/assignmentAvailability.js), whose behaviour is
 * asserted in walkthroughEligibleAssignments.test.mjs. Node cannot render the
 * .jsx, so these read the source — each assertion is anchored to the statement
 * that does the work, not to a name appearing somewhere in a large file.
 */

const monitor = executableSource(fs.readFileSync('src/components/teacher/LiveClassMonitor.jsx', 'utf8'));
const app = executableSource(fs.readFileSync('src/App.jsx', 'utf8'));
const home = executableSource(fs.readFileSync('src/TeacherHome.jsx', 'utf8'));

test('Live Classroom builds ONE list of offerable assignments from the shared class-scoped rule', () => {
  assert.match(monitor, /import \{[^}]*walkthroughAssignmentsForClass[^}]*\} from '\.\.\/\.\.\/platform\/assignments\/assignmentAvailability\.js';/);
  const list = region(monitor, 'const eligibleAssignments = useMemo(() => walkthroughAssignmentsForClass({', '}), [assignments, activeClassId', 'eligibleAssignments');
  assert.match(list, /classId: activeClassId,/);
  assert.match(list, /gradingPeriodSettings,/);
  assert.match(monitor, /const teachableAssignments = eligibleAssignments;/);
});

test('the assignment selector lists only eligibleAssignments — no other class, no kept-over stale selection', () => {
  const select = region(monitor, 'aria-label="Assignment"', '</select>', 'assignment select');
  assert.match(select, /\{eligibleAssignments\.map\(\(assignment\) => <option key=\{assignment\.id\}/);
  assert.doesNotMatch(select, /assignments\.filter|String\(assignment\.id\) === String\(displayAssignmentId\)/, 'the old list kept a previous selection in the options');
});

test('the walked-through assignment is resolved from the eligible list, so a stale id renders as no selection', () => {
  const display = region(monitor, 'const manualAssignmentId = ', 'const selectedClasswork', 'selection');
  assert.match(display, /resolveWalkthroughSelection\(\{ eligibleAssignments, selectedId:/);
  assert.match(display, /const selectedAssignment = useMemo\(\(\) => eligibleAssignments\.find\(/);
});

test('entering Walkthrough never falls back to the first assignment of the whole library', () => {
  const switchMode = region(monitor, 'const switchMode = (nextMode) => {', 'const changeAssignment = ', 'switchMode');
  assert.doesNotMatch(switchMode, /assignments\[0\]/);
  assert.match(switchMode, /setAssignmentId\(eligibleAssignments\[0\]\.id\)/);
});

test('a Live Teaching session is followed only while its assignment is still eligible for this class', () => {
  const gate = region(monitor, 'const liveTeachingActiveForClass = ', 'const manualAssignmentId = ', 'live teaching gate');
  assert.match(gate, /liveTeachingSessionForClass\s*&& eligibleAssignmentIds\.has\(String\(liveTeachingSession\.assignmentId/);
});

test('switching class clears the selection, question position and checked students', () => {
  const reset = region(monitor, 'const previousClassIdRef = useRef(activeClassId);', '}, [activeClassId, focusKey, focusAssignmentId]);', 'class reset effect');
  assert.match(reset, /if \(classChanged\) \{[\s\S]*setTeacherQuestionIndex\(0\);[\s\S]*setCheckedStudentIds\(\[\]\);/);
  assert.match(reset, /else if \(classChanged\) setAssignmentId\('all'\);/);
});

test('a class with no live work shows an intentional empty state', () => {
  const walk = region(monitor, "{mode === 'walkthrough' ? (", ') : selectedClasswork.questions.length === 0', 'walkthrough body');
  assert.match(walk, /eligibleAssignments\.length === 0 \? \(/);
  assert.match(walk, /No active assignments for \{activeClassLabel \|\| 'this class'\}\./);
});

test('Teach This Lesson names the class the panel showed; App honours it and refuses ineligible work', () => {
  assert.match(monitor, /onClick=\{\(\) => onTeach\(choiceId, \{ classId: activeClassId \}\)\}/);
  assert.match(app, /import \{ validatePersistedWalkthroughSession, walkthroughEligibility \} from '\.\/platform\/assignments\/assignmentAvailability\.js';/);
  const teach = region(app, 'const teachAssignmentLive = async (', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /const classId = requestedClassId \|\| activeClass\?\.classId \|\| null;/);
  const guard = teach.indexOf('if (!walkthroughEligibility({ assignment: assignmentData, classId,');
  assert.ok(guard > 0 && guard < teach.indexOf('const startFresh = '), 'eligibility is checked before anything starts');
});

test('a saved session is restored only when validated, and a stale one is retired', () => {
  const teach = region(app, 'const teachAssignmentLive = async (', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /const savedCheck = saved \? validatePersistedWalkthroughSession\(\{/);
  assert.match(teach, /if \(saved\?\.active && !savedCheck\?\.valid\) \{[\s\S]*active: false/);
  assert.match(teach, /if \(savedCheck\?\.valid\) \{\s*const resumed = saved;/);
  assert.doesNotMatch(teach, /lookup\.data\(\)\?\.active\) \{/, 'the unvalidated restore path is gone');

  const stale = region(app, 'const liveTeachingValidityMinute = ', 'useEffect(() => {\n    if (user?.role !== \'teacher\' || !liveTeachingSession?.sessionId) return;', 'stale session effect');
  assert.match(stale, /const check = validatePersistedWalkthroughSession\(\{/);
  assert.match(stale, /if \(!check\.valid\) endLiveTeaching\(\);/);
});

test('marking periods reach Live Classroom', () => {
  const homeCall = region(app, '<TeacherHome', '/>', 'TeacherHome call');
  assert.match(homeCall, /gradingPeriodSettings=\{gradingPeriodSettings\}/);
  const monitorCall = region(home, '<LiveClassMonitor', '/>', 'LiveClassMonitor call');
  assert.match(monitorCall, /gradingPeriodSettings=\{gradingPeriodSettings\}/);
});
