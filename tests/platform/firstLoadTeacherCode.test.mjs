// TEACHER-ONLY CODE IS NOT IN A STUDENT'S FIRST LOAD (student pass 3, first load 2).
//
// scripts/check-first-load-budget.mjs measured these in front of every
// student's Home, although no student path runs them before it:
//   - the needs-attention queue, the Action Center's items, Assignment
//     Review's publishing intent, teacher worksheets and Classroom publishing,
//     which App imported for the teacher's screen, and the Action Center's
//     grade-transfer units. They now load as the teacher kit
//     (src/app/teacher/teacherKit.js) once a teacher is signed in, and the
//     teacher's screen waits for it;
//   - the authoring and repair logic, reached by Home only for four state
//     names (src/platform/preflight/authoringStates.js);
//   - every assessment standard reference, reached by the question navigator
//     only for "is this SAT practice" (src/platform/student/questionAssessmentFramework.js).
//
// The support-evidence store stays in the first load ON PURPOSE (last test).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const app = read('src/App.jsx');
const appCode = executableSource(app);
const graph = firstLoadGraph();

test('the walker reaches the first load (so an absence below means something)', () => {
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: the loaders, and the modules Home does read.
  for (const file of [
    'src/app/teacher/teacherKitLoader.js',
    'src/platform/preflight/authoringStates.js',
    'src/platform/student/questionAssessmentFramework.js',
    'src/platform/assignments/assignmentAvailability.js',
  ]) assert.ok(graph.has(path.join(repo, file)), `${file} is no longer reached: the walk or the wiring changed`);
});

for (const [file, why] of [
  ['src/app/teacher/teacherKit.js', 'the teacher kit loads for a teacher (app/teacher/teacherKitLoader.js)'],
  ['src/platform/teacher/needsAttention.js', 'only Teacher Home shows the queue'],
  ['src/platform/teacher/teacherActionCenter.js', 'only the Action Center shows its items'],
  ['src/platform/gradeTransfer/gradeTransferProjection.js', 'only the Action Center projects grade-transfer units'],
  ['src/platform/assessment/dolAttemptGrantClient.js', 'only a teacher grants DOL attempts or writes a class\'s DOL fields'],
  ['src/platform/attendance/returnCheckIn.js', 'only the Action Center resolves return check-ins, and only a teacher resolves an attendance correction'],
  ['src/platform/attendance/extensionReconciliation.js', 'only a teacher\'s attendance correction reconciles extensions'],
  ['src/platform/authoring/lessonPublishingIntent.js', 'only Assignment Review reads it'],
  ['src/platform/resources/teacherWorksheetEligibility.js', 'only a teacher\'s worksheet export reads it'],
  ['src/platform/classroom/automaticClassroomPublishing.js', 'only a teacher publishes to Classroom'],
  ['src/platform/preflight/assignmentAuthoringState.js', 'Home reads only the state names (preflight/authoringStates.js)'],
  ['src/platform/student/questionAlignmentInfo.js', 'the navigator reads only questionAssessmentFramework'],
  ['src/platform/ccmr/assessmentStandardReferences.js', 'the standard references belong to the alignment panel'],
]) {
  test(`${path.basename(file)} is not in the first load: ${why}`, () => {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

// The kit is one request per page; once here, every later reader gets it at
// once; a failed load is forgotten (a reload is what recovers: the browser
// caches a failed dynamic import per URL).
test('the teacher kit loads once, is handed out at once after that, and exports what App calls', async () => {
  const loader = await import('../../src/app/teacher/teacherKitLoader.js');
  assert.equal(loader.loadedTeacherKit(), null, 'nothing is loaded until someone asks');
  const first = loader.loadTeacherKit();
  assert.equal(loader.loadTeacherKit(), first, 'a second caller shares the first request');
  const kit = await first;
  assert.equal(loader.loadedTeacherKit(), kit);
  const loaderSource = executableSource(read('src/app/teacher/teacherKitLoader.js'));
  assert.match(loaderSource, /pending = import\('\.\/teacherKit\.js'\)\.then\(\s*\(kit\) => \{ loaded = kit; return kit; \},\s*\(error\) => \{ pending = null; throw error; \},\s*\);/);
  // Every kit member App uses is called through the kit, never as a bare name
  // (App.jsx is .jsx: no test imports it, and a call with no import is a
  // ReferenceError that passes every other check).
  const used = [...appCode.matchAll(/(?:teacherKit\.|requireTeacherKit\(\)\.)(\w+)\(/g)].map((match) => match[1]);
  // (a destructure from requireTeacherKit(), or from teacherKit after a handler has checked it loaded)
  const destructured = [...appCode.matchAll(/const \{ ([\w, ]+) \} = (?:requireTeacherKit\(\)|teacherKit);/g)].flatMap((match) => match[1].split(', '));
  const members = [...new Set([...used, ...destructured])].sort();
  assert.deepEqual(members, Object.keys(kit).sort(), 'App uses exactly the kit\'s members, through the kit');
  for (const name of members) {
    assert.equal(typeof kit[name], 'function', `${name} is a function of the kit`);
    assert.doesNotMatch(appCode, new RegExp(`^import [^;]*\\b${name}\\b[^;]*;$`, 'm'), `App imports ${name} statically again`);
  }
});

test('App loads the kit for a teacher, never hands it to one who has left, and says a failed load', () => {
  assert.match(app, /^import \{ loadTeacherKit, loadedTeacherKit, prefetchTeacherWorkspace \} from '\.\/app\/teacher\/teacherKitLoader\.js';$/m);
  assert.match(appCode, /const \[teacherKit, setTeacherKit\] = useState\(loadedTeacherKit\);/);
  const effect = region(appCode, 'const [teacherKitError, setTeacherKitError] = useState(null);', '}, [user?.role, teacherKit]);', 'teacher kit effect');
  assert.match(effect, /if \(user\?\.role !== 'teacher' \|\| teacherKit\) return undefined;/, 'only a teacher loads it');
  assert.match(effect, /let stopped = false;[\s\S]*loadTeacherKit\(\)\s*\.then\(\(kit\) => \{ if \(!stopped\) setTeacherKit\(kit\); \}\)/);
  assert.match(effect, /\.catch\(\(error\) => \{\s*console\.error\('The teacher workspace could not load:', error\);\s*if \(!stopped\) setTeacherKitError\(error\);\s*\}\);/);
  assert.match(effect, /return \(\) => \{ stopped = true; \};/);
  assert.match(effect, /prefetchTeacherWorkspace\(\);/, 'the screen\'s chunk is fetched alongside the kit, not after it');
  // The screen renders only with the kit; a failure reaches AppErrorBoundary
  // (the shape is pinned in appShellSplit.test.mjs).
  const branch = region(appCode, "if (user.role === 'teacher') {", '<TeacherWorkspace', 'teacher branch');
  assert.match(branch, /if \(teacherKitError\) throw teacherKitError;\s*if \(!teacherKit\) \{\s*return <SessionGate authStatus="loading"/);
  // A call that somehow comes without the kit says so, inside the caller's own
  // error handling, instead of a bare TypeError.
  assert.match(appCode, /const requireTeacherKit = \(\) => \{\s*if \(!teacherKit\) throw new Error\('The teacher workspace has not finished loading\. Try again in a moment\.'\);\s*return teacherKit;\s*\};/);
});

// Both projections are computed with the kit, and recomputed when it arrives.
test('the needs-attention queue and the Action Center wait for the kit, and rebuild when it arrives', () => {
  const queue = region(appCode, 'const needsAttentionQueue = useMemo(() => {', '\n  ]);', 'needs-attention memo');
  assert.match(queue, /if \(!teacherKit \|\| !\['home', 'classesWorkspace'\]\.includes\(teacherTab\)\) return \[\];/);
  assert.match(queue, /return teacherKit\.buildNeedsAttentionQueue\(\{/);
  assert.match(queue, /\bteacherKit,\s*$/, 'the memo depends on the kit');
  const items = region(appCode, 'const teacherActionItems = useMemo(() => {', '\n  const currentTeacherActionOpenCount', 'action items memo');
  assert.match(items, /if \(!teacherKit \|\| teacherWorkspaceMode !== 'teacher' \|\| teacherTab !== 'actionCenter'\) return \[\];/);
  assert.match(items, /return teacherKit\.buildTeacherActionItems\(\{/);
  assert.match(items, /\}, \[teacherKit, /, 'the memo depends on the kit');
  // The Action Center's grade-transfer units (their saved state loads with the
  // first load's grade-transfer store, which rewards use too).
  const scope = region(appCode, 'const actionGradeScope = useMemo(() => {', '\n  const actionReturnCheckIns', 'grade-transfer scope memo');
  assert.match(scope, /if \(!teacherKit \|\| teacherWorkspaceMode !== 'teacher' \|\| teacherTab !== 'actionCenter'\) \{\s*return \{ units: \[\], authorizedClassIds: \[\] \};/);
  assert.match(scope, /return teacherKit\.projectGradeTransferUnits\(\{/);
  assert.match(scope, /\}, \[teacherKit, /, 'the memo depends on the kit');
  // Its return check-ins, and the attendance correction helpers, are the kit's too.
  const returns = region(appCode, 'const actionReturnCheckIns = useMemo(() => {', '\n  const teacherActionItems', 'return check-ins memo');
  assert.match(returns, /if \(!teacherKit \|\| teacherWorkspaceMode !== 'teacher' \|\| teacherTab !== 'actionCenter'\) return \[\];/);
  assert.match(returns, /teacherKit\.resolveReturnCheckIns\(\{/);
  assert.match(returns, /\}, \[teacherKit, /, 'the memo depends on the kit');
  assert.match(appCode, /requireTeacherKit\(\)\.reconcileAssignmentExtensionsForCorrection\(\{/);
  assert.match(appCode, /requireTeacherKit\(\)\.buildStudentExtensionPatch\(\{/);
});

test('the authoring states and the exam-practice rule are the same values from their new homes', async () => {
  const { AUTHORING_STATES } = await import('../../src/platform/preflight/authoringStates.js');
  const authoring = await import('../../src/platform/preflight/assignmentAuthoringState.js');
  assert.equal(authoring.AUTHORING_STATES, AUTHORING_STATES, 'one frozen object, re-exported');
  assert.match(read('src/platform/assignments/assignmentAvailability.js'), /^import \{ AUTHORING_STATES \} from '\.\.\/preflight\/authoringStates\.js';$/m);

  const framework = await import('../../src/platform/student/questionAssessmentFramework.js');
  const alignment = await import('../../src/platform/student/questionAlignmentInfo.js');
  assert.equal(alignment.questionAssessmentFramework, framework.questionAssessmentFramework, 'one function, re-exported');
  assert.match(app, /^import \{ questionAssessmentFramework \} from '\.\/platform\/student\/questionAssessmentFramework\.js';$/m);
  const sat = { assessmentContext: { examStyle: true, framework: 'digitalSAT' }, alignments: [{ framework: 'digitalSAT', domainId: 'algebra' }] };
  assert.deepEqual(framework.questionAssessmentFramework(sat), { framework: 'digitalSAT', domainId: 'algebra', examStyle: true });
  assert.deepEqual(framework.questionAssessmentFramework({ assessmentContext: { examStyle: true, framework: 'digitalSAT' } }), { framework: null, domainId: '', examStyle: false });
});

// Support evidence is a student record. Imported with App, every write goes
// straight into Firestore's durable queue (src/firebase.js persistentLocalCache),
// offline or in a tab older than the last deploy. Loaded on demand, a write
// made before the chunk arrived was dropped instead (tried in first load 2 and
// reverted). It stays static in App and in the engagement ledger.
test('the support-evidence store stays in the first load, so evidence is never dropped before it loads', () => {
  const key = path.join(repo, 'src/platform/supportEvidence/supportEvidenceStore.js');
  assert.ok(graph.has(key), 'the support-evidence store left the first load: a write before its chunk arrives would be dropped');
  assert.match(app, /^import \{ recordStudentSupportEvidence as saveStudentSupportEvidence \} from '\.\/platform\/supportEvidence\/supportEvidenceStore\.js';$/m);
  const hook = executableSource(read('src/platform/supportEvidence/useEngagementLedger.js'));
  assert.match(hook, /^import \{ recordEngagementMinute \} from '\.\/supportEvidenceStore\.js';$/m);
  assert.doesNotMatch(appCode + hook, /import\(['"][^'"]*supportEvidenceStore/, 'no on-demand load of the store');
});
