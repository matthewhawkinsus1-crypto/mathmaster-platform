/*
 * THE SECURE TEST WORKFLOW IS WIRED TO ITS RULES.
 *
 * Nothing in this suite renders React (node cannot import .jsx), and App.jsx is
 * imported by no test: a call to a function that was never imported passes
 * lint and the build and is a ReferenceError the first time a student or a
 * teacher reaches it. So each new call is checked beside its import, each
 * screen is checked for the capability it has to offer, and the server's gates
 * are checked where they sit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertCapability, componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { studentScheduleBlocks } from '../../src/platform/student/testCycleScheduleView.js';
import { testSkillsSection } from '../../src/platform/student/testCycleDiscovery.js';
import {
  individuallyAssignedTestCycleIds, markIndividuallyAssigned, priorWorkAssignmentIds, workedAssignmentKey,
} from '../../src/platform/assignments/studentAssignmentScope.js';
import { assignmentIsForStudent } from '../../src/assignmentLifecycle.js';
import { verifyCheckpointAuthorization } from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { RESPONSE_CHECKPOINT_SCHEMA_VERSION } from '../../functions/shared/responseCheckpointSchema.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');
const functionsIndex = read('functions/index.js');
const app = componentSource('src/App.jsx');
const controls = componentSource('src/components/teacher/TestCycleControls.jsx');
const management = componentSource('src/components/teacher/TestCycleManagement.jsx');
const card = componentSource('src/components/student/TestCycleCard.jsx');
const service = read('src/services/testCycleService.js');
const bridge = read('tests/browser/emulator/testCycleBridgeServices.js');

const importedNames = (source, from) => {
  const pattern = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'[^']*${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g');
  return [...source.matchAll(pattern)].flatMap((match) => match[1].split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean));
};
const assertImported = (source, from, names, where) => {
  const imported = importedNames(source, from);
  names.forEach((name) => assert.ok(imported.includes(name), `${where} calls ${name} and must import it from ${from}`));
};

/* --- a call with no import is a runtime ReferenceError --------------------- */

test('every new function a screen calls is imported where it is called', () => {
  // App.jsx: the two loaders a student's device needs for a Test they were added to on their own.
  assert.match(app, /individuallyAssignedTestCycleIds\(testCycleGrades\)/);
  assert.match(app, /markIndividuallyAssigned\(fetched,/);
  assert.match(app, /individualAssignmentIds: individuallyAssignedTestCycleIds\(studentData\.testCycleGrades\)/);
  assertImported(app, 'platform/assignments/studentAssignmentScope.js', ['individuallyAssignedTestCycleIds', 'markIndividuallyAssigned', 'workedAssignmentKey'], 'App.jsx');

  // The teacher panel: its services, its tools and its panels.
  const controlCalls = {
    'services/testCycleService.js': ['adjustTestCycleGrade', 'runTestCycleBulkAction', 'updateTestCycleAudience', 'updateTestCycleAvailability', 'assignTestCycleSessions', 'teacherTestCycleAction'],
    'services/assessmentLifecycleService.js': ['getAssignmentEvidenceSummary', 'manageAssignmentLifecycle'],
    'platform/teacher/testCycleTeacherTools.js': ['BULK_ACTION', 'describeBulkPlan', 'describeReviewSummary', 'driveBulkOperation', 'newBulkOperationId', 'planBulkAction'],
    './TestCycleManagement.jsx': ['TestCycleAudiencePanel', 'TestCycleGradeForm', 'TestCycleLifecyclePanel', 'TestCycleOperationStatus', 'TestCycleStudentWindowForm', 'TestCycleWindowsPanel'],
  };
  Object.entries(controlCalls).forEach(([from, names]) => {
    names.forEach((name) => assert.match(controls, new RegExp(`(?:<|\\b)${name}\\b`), `TestCycleControls uses ${name}`));
    assertImported(controls, from, names, 'TestCycleControls.jsx');
  });
  const managementCalls = ['audienceCandidates', 'describeLifecycleEvidence', 'describeOperation', 'gradeAdjustmentChoices', 'instantFromSchoolInput', 'schoolDateKey', 'schoolInputValue', 'validateManualGrade'];
  managementCalls.forEach((name) => assert.match(executableSource(management), new RegExp(`\\b${name}\\(`), `TestCycleManagement calls ${name}`));
  assertImported(management, 'platform/teacher/testCycleTeacherTools.js', managementCalls, 'TestCycleManagement.jsx');
  assertImported(management, 'platform/studentName.js', ['compareStudentsByName', 'formatStudentLabel'], 'TestCycleManagement.jsx');
  // Every component the panel file exports is a function a JSX tag can name.
  ['TestCycleWindowsPanel', 'TestCycleAudiencePanel', 'TestCycleOperationStatus', 'TestCycleGradeForm', 'TestCycleStudentWindowForm', 'TestCycleLifecyclePanel']
    .forEach((name) => assert.match(management, new RegExp(`export const ${name} = \\(`)));

  // The student card.
  assert.match(card, /const scheduleBlocks = studentScheduleBlocks\(card\);/);
  assertImported(card, 'platform/student/testCycleScheduleView.js', ['studentScheduleBlocks'], 'TestCycleCard.jsx');

  // The teacher workspace hands the panel what it offers when adding to a Test.
  const workspace = componentSource('src/app/teacher/TeacherWorkspace.jsx');
  const mount = region(workspace, '<TeacherSecureExamDashboard', '/>', 'TeacherSecureExamDashboard mount');
  assert.match(mount, /classes=\{classes\}/);
  assert.match(mount, /teacherEmail=\{user\.email \|\| ''\}/);
  const dashboard = componentSource('src/components/assessment/TeacherSecureExamDashboard.jsx');
  assert.match(dashboard, /<TestCycleControls[^>]*classes=\{classes\}[^>]*teacherEmail=\{teacherEmail\}/);
});

test('each new callable has a browser service, and the browser QA bridge can reach it', () => {
  const callables = ['updateTestCycleAudience', 'updateTestCycleAvailability', 'adjustTestCycleGrade', 'runTestCycleBulkAction', 'getTestCycleOperation'];
  callables.forEach((name) => {
    assert.match(functionsIndex, new RegExp(`exports\\.${name} = onCall\\(TEST_CYCLE_ACTION_OPTIONS, async \\(request\\) => \\{`), `${name} is exported with room to run`);
    assert.match(service, new RegExp(`export const ${name} = async`), `${name} has a service`);
    assert.match(service, new RegExp(`call\\('${name}'`), `the ${name} service calls the ${name} callable`);
    assert.match(bridge, new RegExp(`export const ${name} = call\\('${name}'\\)`), `the QA bridge exposes ${name}`);
  });
  // The browser waits longer than the server may take, never less.
  const serverSeconds = { TEST_CYCLE_PANEL_OPTIONS: 120, TEST_CYCLE_ACTION_OPTIONS: 120, TEST_CYCLE_SWEEP_OPTIONS: 300 };
  Object.entries(serverSeconds).forEach(([name, seconds]) => {
    assert.match(functionsIndex, new RegExp(`const ${name} = Object\\.freeze\\(\\{ memory: "[0-9A-Za-z]+", timeoutSeconds: ${seconds} \\}\\);`));
  });
  assert.match(service, /const TEACHER_CALL_TIMEOUT_MS = 130000;/);
  assert.match(service, /const SWEEP_CALL_TIMEOUT_MS = 310000;/);
  assert.match(service, /httpsCallable\(functions, name, CALL_TIMEOUT_MS\[name\] \? \{ timeout: CALL_TIMEOUT_MS\[name\] \} : undefined\)/);
  ['assignTestCycleSessions', 'releaseTestCycleResults'].forEach((name) => {
    assert.match(functionsIndex, new RegExp(`exports\\.${name} = onCall\\(TEST_CYCLE_SWEEP_OPTIONS,`));
    assert.match(service, new RegExp(`${name}: SWEEP_CALL_TIMEOUT_MS`));
  });
});

/* --- the incident: memory, time, and asking who is calling first ----------- */

test('the panel loader has the memory a class needs and reads only the fields it uses', () => {
  assert.match(functionsIndex, /exports\.listTeacherTestCycleRecords = onCall\(TEST_CYCLE_PANEL_OPTIONS, async \(request\) => \{/);
  assert.match(functionsIndex, /const TEST_CYCLE_PANEL_OPTIONS = Object\.freeze\(\{ memory: "1GiB", timeoutSeconds: 120 \}\);/);
  const roster = region(functionsIndex, 'async function loadTestCycleRoster(', 'async function teacherTestCycleSchedule(', 'loadTestCycleRoster');
  // A field mask on both reads: the class query and the record holders by id.
  assert.match(roster, /\.where\("classId", "==", classId\)\.select\(\.\.\.fieldMask\)\.get\(\)/);
  assert.match(roster, /\{ fieldMask \},/);
  assert.doesNotMatch(executableSource(roster), /where\("classId", "==", classId\)\.get\(\)/, 'no unmasked whole-document class read');
  const mask = region(functionsIndex, 'function testCycleRosterFieldMask(', 'async function loadTestCycleRoster(', 'field mask');
  assert.match(mask, /new FieldPath\("gradesByAssignment", assignmentId\)/, 'this assignment\'s tracker, not every assignment\'s');
  // The handler uses that loader, and nothing in it reads the roster unmasked.
  const list = region(functionsIndex, 'exports.listTeacherTestCycleRecords = onCall(', 'function testCyclePolicyLocks(', 'listTeacherTestCycleRecords');
  assert.match(list, /await loadTestCycleRoster\(db, \{ assignment, assignmentId, recordsByStudent, identity \}\)/);
  assert.doesNotMatch(executableSource(list), /collection\("grades"\)\.where\(/);
  // The delete check reads only this assignment's evidence entries.
  const evidence = region(functionsIndex, 'async function assignmentEvidenceSummary(', 'exports.getAssignmentEvidenceSummary', 'evidence');
  assert.match(evidence, /\.where\("classId", "==", classId\)\.select\(\.\.\.evidenceMask\)\.get\(\)/);
});

test('every teacher Test Cycle callable asks who is calling before it reads the assignment', () => {
  const teacherCallables = [
    'releaseTestCycleAnswers', 'assignTestCycleSessions', 'preflightTestCycleAssignment', 'teacherTestCycleAction', 'listTeacherTestCycleRecords',
    'getTeacherTestCyclePlans', 'releaseTestCycleResults', 'updateTestCyclePolicy', 'getAssignmentEvidenceSummary', 'manageAssignmentLifecycle',
    'attachTestCycleContract', 'updateTestCycleAudience', 'updateTestCycleAvailability', 'adjustTestCycleGrade', 'runTestCycleBulkAction', 'getTestCycleOperation',
  ];
  teacherCallables.forEach((name) => {
    const start = functionsIndex.indexOf(`exports.${name} = onCall(`);
    assert.ok(start >= 0, `${name} exists`);
    const head = executableSource(functionsIndex.slice(start, start + 700));
    const lookup = head.indexOf('await assignmentForTeacherCall(request, db)');
    assert.ok(lookup > 0, `${name} looks its assignment up through assignmentForTeacherCall`);
    // Nothing before that lookup reads Firestore with an id from the request.
    assert.doesNotMatch(head.slice(0, lookup), /\.doc\(|\.get\(\)/, `${name} reads nothing before the caller is known`);
  });
  const lookup = region(functionsIndex, 'async function assignmentForTeacherCall(', '/** The bell schedule the platform already stores.', 'assignmentForTeacherCall');
  const code = executableSource(lookup);
  assert.ok(code.indexOf('await requireTeacher(request)') < code.indexOf('.get()'), 'the caller is checked before the read');
  assert.ok(code.indexOf('validDocumentId(id)') < code.indexOf('.get()'), 'and a bad id is refused before the read');
  assert.match(code, /throw new HttpsError\("invalid-argument", "A valid assignmentId is required\."\)/);
});

/* --- the server is the authority on when --------------------------------- */

test('the windows are enforced where every route into a secure session passes', () => {
  const gate = region(functionsIndex, 'async function assertCourseTestEntryAllowed(', 'async function teacherOwnedClassIds(', 'entry gate');
  assert.match(gate, /const schedule = await studentTestCycleSchedule\(db, shared, \{/);
  assert.match(gate, /resolveTestCycleStage\(\{\s*policy,\s*record,\s*reviewProgress: testCycleLib\.reviewProgress\(assignment, tracker\),\s*schedule,\s*\}\)/);
  assert.match(gate, /if \(state\?\.stage !== expectedStage \|\| state\.canEnter !== true\) \{\s*throw new HttpsError\(\s*"failed-precondition"/);
  // Start checks it before and inside its transaction; issue checks it per question.
  const start = region(functionsIndex, 'exports.startSecureExamSession = onCall(', 'exports.listStudentSecureExamSessions', 'start');
  assert.equal((start.match(/await assertCourseTestEntryAllowed\(/g) || []).length, 2);
  const issue = region(functionsIndex, 'exports.issueSecureExamQuestion = onCall(', 'exports.saveSecureExamDraft', 'issue');
  assert.match(issue, /assertCourseTestEntryAllowed\(/);
  // A new correction question is issued only inside the home window.
  const corrections = region(functionsIndex, 'exports.issueTestCycleCorrectionQuestion = onCall(', 'exports.submitTestCycleCorrectionResponse', 'corrections');
  assert.match(corrections, /await assertFollowUpWindowOpen\(db, shared, \{ assignment, policy, record: correctionsRecord, what: "Corrections", plural: true \}\);/);
  // The card resolves the stage with the same schedule the gate reads.
  const studentCard = region(functionsIndex, 'exports.getStudentTestCycle = onCall(', 'function testCycleSkillList(', 'card');
  assert.match(studentCard, /shared\.stages\.resolveTestCycleStage\(\{ policy, record, reviewProgress, schedule \}\)/);
  assert.match(studentCard, /schedule: publicTestCycleSchedule\(shared, schedule,/);
  // And the student's own list drops what can no longer be opened.
  const listed = region(functionsIndex, 'exports.listStudentSecureExamSessions = onCall(', 'exports.getStudentSecureExamReview', 'student list');
  assert.match(listed, /const stale = await staleCourseTestSessionIds\(db, studentId,/);
  assert.match(listed, /\.filter\(\(docSnapshot\) => !stale\.has\(docSnapshot\.id\)\)/);
});

test('a class-wide action is one server operation, never one browser request per student', () => {
  const bulkRun = region(controls, 'const runBulk = (', 'const continueOperation = ', 'runBulk');
  assert.match(bulkRun, /await driveBulkOperation\(\{\s*step: \(\) => runTestCycleBulkAction\(\{ assignmentId, action, operationId, scope \}\),\s*onProgress: setOperation,/);
  // The same operation id on every round, and on Continue.
  assert.match(bulkRun, /operationId = newBulkOperationId\(action\)/);
  assert.match(controls, /const continueOperation = \(view\) => runBulk\(\{ action: view\.action, scope: view\.scope \|\| \{ kind: 'all' \}, operationId: view\.operationId,/);
  // A clean finish is the only one given the one-line success summary.
  assert.match(bulkRun, /\(final\) => \(final\?\.tone === 'success' && summarize \? summarize\(final\) : ''\)/);
  // No loop anywhere in the panel sends a per-student teacher action.
  assert.doesNotMatch(executableSource(controls), /\.(?:map|forEach)\(\s*(?:async\s*)?\(?\s*(?:row|student|studentId)[^)]*\)?\s*=>\s*(?:teacherTestCycleAction|assignTestCycleSessions)\(/);
  assert.doesNotMatch(executableSource(controls), /Promise\.all\([^)]*teacherTestCycleAction/);
  // The class-wide Open button is that operation for a standard cycle.
  assertCapability(controls, [/: runBulk\(\{\s*action: BULK_ACTION\.OPEN_TEST_SESSIONS,\s*scope: targetClassId \? \{ kind: 'class', classId: targetClassId \} : \{ kind: 'all' \},/], 'the class-wide Open button must be one server operation.');
  // The server works a bounded batch and stores progress after each.
  const server = region(functionsIndex, 'exports.runTestCycleBulkAction = onCall(', 'exports.getTestCycleOperation', 'bulk callable');
  assert.match(server, /while \(pending\.length && Date\.now\(\) < stopAt\) \{/);
  assert.match(server, /const batch = pending\.slice\(0, bulk\.BULK_CONCURRENCY\);/);
  assert.match(server, /await operationRef\.update\(\s*"status", operation\.status,/);
  // The status box is green only for a clean finish.
  const status = region(management, 'export const TestCycleOperationStatus = (', 'export const TestCycleGradeForm = (', 'operation status');
  assert.match(status, /role=\{described\.tone === 'error' \? 'alert' : 'status'\}/);
  assert.match(status, /described\.failures\.map\(\(entry\) => <li key=\{entry\.studentId\}><strong>\{entry\.name\}<\/strong>: \{entry\.detail\}<\/li>\)/);
});

/* --- a student added on their own ---------------------------------------- */

test('a student added to a Test individually is found by their own device and by the server', () => {
  const projection = { 'test-1': { individuallyAssigned: true, stage: 'review' }, 'test-2': { stage: 'test' }, 'test-3': { individuallyAssigned: 'yes' } };
  assert.deepEqual(individuallyAssignedTestCycleIds(projection), ['test-1']);
  assert.deepEqual(individuallyAssignedTestCycleIds(null), []);
  // It is read by id even though the student has no work on it yet.
  assert.equal(workedAssignmentKey({ old: {} }, ['test-1']), 'old|test-1');
  assert.equal(workedAssignmentKey({ old: {} }), 'old', 'one argument behaves exactly as before');
  assert.deepEqual(priorWorkAssignmentIds({ gradesByAssignment: {}, loadedIds: ['class-lesson'], extraIds: ['test-1'] }), ['test-1']);

  const fetched = [{ id: 'test-1', assignedClassIds: ['another-class'], title: 'Unit Test' }, { id: 'old', assignedClassIds: ['former-class'] }];
  const marked = markIndividuallyAssigned(fetched, ['test-1']);
  assert.equal(marked[0].assignedToStudentIndividually, true);
  assert.equal('assignedToStudentIndividually' in marked[1], false);
  assert.equal(fetched[0].assignedToStudentIndividually, undefined, 'the fetched object is not mutated');
  // The one list predicate every student surface asks.
  const me = { classId: 'my-class', classPeriod: 'Period 2' };
  assert.equal(assignmentIsForStudent(marked[0], me), true);
  assert.equal(assignmentIsForStudent(marked[1], me), false, 'work from a former class is still not "assigned"');
  assert.equal(assignmentIsForStudent(fetched[0], me), false, 'a stored assignment never carries the mark');
  assert.equal(assignmentIsForStudent({ assignedClassIds: ['my-class'] }, me), true);

  // The server's proof is the same field, on the student's own grade row.
  const predicate = region(functionsIndex, 'function studentIndividuallyAssigned(', 'async function assertTeacherMayManageAssignment(', 'audience predicate');
  assert.match(predicate, /gradeData\?\.testCycleGrades\?\.\[id\]\?\.individuallyAssigned === true/);
  assert.match(predicate, /if \(classId && audience\.classIds\.includes\(String\(classId\)\)\) return true;\s*return studentIndividuallyAssigned\(gradeData, assignmentId \|\| assignment\?\.id\);/);
  assert.match(functionsIndex, /\.\.\.\(record\.audience\?\.individual === true \? \{ individuallyAssigned: true \} : \{\}\),/);
  // Their Review answers are accepted on every path a student's work travels.
  assert.equal((functionsIndex.match(/studentMatchesAssignmentAudience\(\{[^}]*gradeData[^}]*assignmentId[^}]*\}\)/g) || []).length >= 5, true);
});

test('the deadline finalizer accepts an individually added student\'s Review answer, and nobody else\'s', () => {
  const question = { questionId: 'r1', type: 'response', activityRole: 'review' };
  const assignment = { id: 'test-1', assignedClassIds: ['class-a'] };
  // A draft from a student in class C, whose class is NOT assigned this Test.
  const checkpoint = {
    schemaVersion: RESPONSE_CHECKPOINT_SCHEMA_VERSION, studentId: 'S1', assignmentId: 'test-1', classId: 'class-c',
    questionIndex: 0, questionId: 'r1', activityRole: 'review',
  };
  const authorize = (gradeDocument) => verifyCheckpointAuthorization({
    checkpoint, assignment, gradeDocument, gradeDocumentId: 'S1', question, isSecureAssignment: false,
  });
  assert.deepEqual(authorize({ classId: 'class-c', testCycleGrades: {} }), { ok: false, reason: 'assignment-not-assigned-to-class' });
  // The proof has to be for THIS assignment, and has to be exactly true.
  assert.equal(authorize({ classId: 'class-c', testCycleGrades: { 'another-test': { individuallyAssigned: true } } }).reason, 'assignment-not-assigned-to-class');
  assert.equal(authorize({ classId: 'class-c', testCycleGrades: { 'test-1': { individuallyAssigned: 'true' } } }).reason, 'assignment-not-assigned-to-class');
  assert.equal(authorize({ classId: 'class-c' }).reason, 'assignment-not-assigned-to-class');
  // Added on their own: past the audience check, and judged from there on
  // exactly as a student whose class has the Test is. (This bare fixture
  // question is one the server cannot grade, so both stop at that same later
  // check — which is the point: neither stopped at "not assigned".)
  const added = authorize({ classId: 'class-c', testCycleGrades: { 'test-1': { individuallyAssigned: true } } });
  const inAssignedClass = verifyCheckpointAuthorization({
    checkpoint: { ...checkpoint, classId: 'class-a' }, assignment, gradeDocument: { classId: 'class-a' }, gradeDocumentId: 'S1', question,
  });
  assert.notEqual(added.reason, 'assignment-not-assigned-to-class');
  assert.match(String(inAssignedClass.reason), /^unsupported-question:/);
  assert.deepEqual(added, inAssignedClass);
  // It does not excuse the rest of the checks: the class the draft names must
  // still be the student's own.
  assert.equal(verifyCheckpointAuthorization({
    checkpoint: { ...checkpoint, classId: 'class-a' }, assignment,
    gradeDocument: { classId: 'class-c', testCycleGrades: { 'test-1': { individuallyAssigned: true } } }, gradeDocumentId: 'S1', question,
  }).reason, 'class-mismatch');
});

/* --- what a student is shown --------------------------------------------- */

test('the student card shows the windows that are still ahead of them, in the server\'s words', () => {
  const window = (state, headline, extra = {}) => ({ state, enforced: state !== 'unset', headline, detail: `${headline} detail`, home: `${headline} home`, ...extra });
  const schedule = (test, followUp, missedTest = false) => ({ timeZone: 'America/Chicago', missedTest, test, followUp });
  const upcoming = schedule(window('upcoming', 'Opens Wed, Oct 14, 10:15 AM CDT'), window('upcoming', 'Opens when the Test window closes'));

  // Review or Test ahead: both, so "what if I am absent?" is answered.
  for (const stage of ['review', 'test']) {
    assert.deepEqual(studentScheduleBlocks({ stage, schedule: upcoming }).map((block) => [block.id, block.title, block.headline]), [
      ['test', 'Test', 'Opens Wed, Oct 14, 10:15 AM CDT'],
      ['followUp', 'Corrections and Retest', 'Opens when the Test window closes'],
    ]);
  }
  // Corrections or the Retest: only the home window.
  const home = schedule(window('closed', 'Closed Wed, Oct 14, 11:05 AM CDT'), window('open', 'Open now until Tue, Oct 20, 11:59 PM CDT'));
  for (const stage of ['corrections', 'retest', 'retestReady']) {
    assert.deepEqual(studentScheduleBlocks({ stage, schedule: home }).map((block) => block.id), ['followUp']);
  }
  // A missed Test: the Retest, named as that, and no Test window to read.
  const missed = studentScheduleBlocks({ stage: 'retest', schedule: { ...home, missedTest: true } });
  assert.deepEqual(missed.map((block) => [block.id, block.title]), [['followUp', 'Retest']]);
  assert.deepEqual(studentScheduleBlocks({ stage: 'review', schedule: { ...home, missedTest: true } }).map((block) => block.id), ['followUp']);
  // Finished, or nothing set: nothing to read.
  for (const stage of ['passed', 'complete', 'retestClosed', 'retestSubmitted']) assert.deepEqual(studentScheduleBlocks({ stage, schedule: home }), []);
  assert.deepEqual(studentScheduleBlocks({ stage: 'test', schedule: schedule(window('unset', 'No class-time window is set'), { state: 'unset', enforced: false }) }), []);
  assert.deepEqual(studentScheduleBlocks({ stage: 'test' }), [], 'an older server (no schedule) shows nothing rather than breaking');
  assert.deepEqual(studentScheduleBlocks(null), []);
  // Submitted and waiting: the Test window is no longer news; the home window is.
  assert.deepEqual(studentScheduleBlocks({ stage: 'awaitingRelease', schedule: home }).map((block) => block.id), ['followUp']);

  // "What's on your Retest" for a student who missed the Test: the whole Test,
  // never "mostly the ones you missed" (they gave no answers to miss).
  const skills = [{ alignmentKey: 'texas:A.5A', label: 'Solving linear equations', questionCount: 2 }, { alignmentKey: 'texas:A.7C', label: 'Quadratic key features', questionCount: 2 }];
  for (const stage of ['review', 'retestReady', 'retest']) {
    const section = testSkillsSection({ stage, testSkills: skills, schedule: { missedTest: true }, policy: {} });
    assert.deepEqual([section.title, section.showCounts, section.rows.length], ['What\'s on your Retest', true, 2]);
    assert.equal(section.note, 'You did not take the Test, so your Retest covers every skill that was on it.');
  }
  // A student who took the Test and failed still reads the targeted wording.
  assert.match(testSkillsSection({ stage: 'retest', testSkills: skills, schedule: { missedTest: false }, policy: {} }).note, /mostly the ones you missed/);
  assert.equal(testSkillsSection({ stage: 'test', testSkills: skills, policy: {} }).title, 'What\'s on your Test');

  // The card renders them, and a missed Test has a label of its own.
  assert.match(card, /scheduleBlocks\.map\(\(block\) => \(\s*<div key=\{block\.id\} data-schedule-block=\{block\.id\}/);
  assert.match(card, /\{block\.title\}: \{block\.headline\}/);
  assert.match(card, /\{block\.home && <span/);
  assert.match(card, /missed: 'Not taken',/);
});

test('the teacher panel shows the times, the Review as a grade, who is assigned, and archive or delete', () => {
  // The exact windows are always on the panel when the cycle has them.
  assert.match(controls, /\{testSchedule && \(\s*<TestCycleWindowsPanel\s*schedule=\{testSchedule\}/);
  const windows = region(management, 'export const TestCycleWindowsPanel = (', 'export const TestCycleAudiencePanel = (', 'windows panel');
  assert.match(windows, /<WindowFacts title="Test" window=\{entry\.test\} \/>/);
  assert.match(windows, /<WindowFacts title="Corrections and Retest" window=\{entry\.followUp\} \/>/);
  // A day is chosen from the bell schedule's days; no class time is typed for it.
  assert.match(windows, /entry\.upcomingDays\.map\(\(day\) => <option key=\{day\.dateKey\} value=\{day\.dateKey\}>\{day\.label\}<\/option>\)/);
  assert.match(windows, /onChange\(\{ action: 'setClassTestDay', classId: entry\.classId, dateKey: chosen \}/);
  // A typed time is read as school time, not the browser's.
  assert.match(windows, /instantFromSchoolInput\(exception\.closesAt, timeZone\)/);
  assert.match(management, /\{window\.home && <p style=\{\{ \.\.\.fact, fontWeight: 700 \}\}>\{window\.home\}<\/p>\}/);

  // The Review summary sits in the Review cell, apart from the secure scores.
  const reviewCell = region(controls, '<td style={cell} data-review-summary="">', '</td>', 'review cell');
  assert.match(reviewCell, /\{reviewFacts\.progress\} answered · \{reviewFacts\.points\}/);
  assert.match(reviewCell, /reviewFacts\.percent/);
  assert.match(reviewCell, /saved \$\{reviewFacts\.saved\}/);
  // A grade set by hand is marked on the recorded grade, and its source is in the panel.
  assert.match(controls, /\{row\.gradeAdjustment && <div[^>]*>Set by teacher<\/div>\}/);
  assert.match(controls, /adjustTestCycleGrade\(\{ assignmentId, studentId: row\.studentId, \.\.\.adjustment \}\)/);
  assert.match(controls, /adjustTestCycleGrade\(\{ assignmentId, studentId: row\.studentId, clear: true \}\)/);
  // A Retest with no original says the Test was not taken, not a blank.
  assert.match(controls, /row\.retestWithoutOriginal && row\.originalTestGrade === null \? 'Not taken' : percent\(row\.originalTestGrade\)/);

  // Who is assigned, and adding to the same Test.
  assert.match(controls, /Who is assigned · \{listing\?\.audience\?\.studentCount \?\? rows\.length\}/);
  assert.match(controls, /await updateTestCycleAudience\(\{ assignmentId, \.\.\.addition \}\)/);
  // Nothing added is reported as a failure, not as "Added 0".
  assert.match(controls, /if \(result\.counts\.failed > 0 && result\.counts\.classesAdded \+ result\.counts\.studentsAdded === 0\) \{\s*throw new Error\(/);

  // Archive is one click and reversible; delete asks the server first and needs the title.
  const lifecycle = region(management, 'export const TestCycleLifecyclePanel = (', '\n};\n', 'lifecycle panel');
  assert.match(lifecycle, /onClick=\{\(\) => \{ setConfirming\(true\); onCheckEvidence\(\); \}\}/);
  assert.match(lifecycle, /const mayDelete = Boolean\(described\?\.canDelete\) && typed\.trim\(\) === title/);
  assert.match(lifecycle, /disabled=\{busy \|\| !mayDelete\}/);
  assert.match(controls, /manageAssignmentLifecycle\(\{ assignmentId, action: 'delete', \.\.\.confirmation \}\)/);
  assert.match(controls, /manageAssignmentLifecycle\(\{ assignmentId, action: archive \? 'archive' : 'unarchive' \}\)/);
});
