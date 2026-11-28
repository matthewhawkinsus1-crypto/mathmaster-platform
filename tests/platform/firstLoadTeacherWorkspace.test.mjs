// THE AUTHORING CODE IS NOT IN A TEACHER'S FIRST LOAD (the teacher's first load).
//
// scripts/check-first-load-budget.mjs measured about 1 MB gzip of the teacher
// workspace's static imports in front of every teacher's Home (teacherHome):
// Pre-Flight's model and what it runs (the compiler and its checks, the
// tools' solution reviews, the graders' simplify rules, the Spanish support
// text), live corrections, Library reuse, Honors CCMR and the Honors
// extension recipes, Recovery planning and the Recovery audit. No teacher
// screen draws with them: an action runs them (an import, Review / Edit Setup
// and Create, Duplicate, a question edit, a Library repair, Dates & Classes),
// and the Assignments list reads two checks on each card. The workspace now
// takes them from one module it loads on demand (app/teacher/
// teacherAuthoringKit.js, through authoringKitLoader.js): fetched while the
// browser is idle once the workspace has drawn, and at once by the action or
// screen that needs it first. The gradebook's Recovery marks (R, Held, LC)
// come from their own module (platform/recovery/gradebookRecoveryMarks.js).
//
// The walk: tests/platform/helpers/firstLoadGraph.mjs's teacherFirstLoadGraph,
// the student's first load plus what the budget's teacherHome path measures
// (TEACHER_HOME_KEYS), static imports only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chainTo, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';
import { authoringKitExports, authoringKitNames } from './helpers/authoringKitImport.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { teacherWorkspaceSource } from './helpers/appScreens.mjs';

const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const graph = teacherFirstLoadGraph();
const workspace = executableSource(teacherWorkspaceSource());

test('the walker reaches a teacher\'s first load, and what stays on it on purpose', () => {
  assert.ok(graph.size > 500, `only ${graph.size} modules reached`);
  for (const file of [
    // The screen, and how it loads the rest.
    'src/app/teacher/TeacherWorkspace.jsx',
    'src/app/teacher/authoringKitLoader.js',
    'src/app/student/studentScreenPrefetch.js',
    // Home's screen itself.
    'src/TeacherHome.jsx',
  ]) {
    assert.ok(graph.has(path.join(repo, file)), `${file} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const [file, why] of [
  ['src/app/teacher/teacherAuthoringKit.js', 'the authoring code loads on demand (authoringKitLoader.js)'],
  ['src/platform/preflight/assignmentV5PreflightModel.js', 'Pre-Flight\'s model: an import, Review / Edit Setup, Create, Duplicate, a question edit, Library reuse and repair'],
  ['src/platform/preflight/solutionReviewPreflight.js', 'Pre-Flight\'s solution review'],
  ['src/tools/shared/toolSolutionReview.js', 'the tools\' solution reviews Pre-Flight runs'],
  ['src/platform/language/authoredSupportText.js', 'Pre-Flight\'s check of a Spanish version'],
  ['src/assignmentBlueprint.js', 'the compiler: an import, and Create\'s last checks'],
  ['src/tools/toolSchemas.js', 'the compiler\'s tool schemas'],
  ['functions/shared/algebra/simplifyRulesParsedOnce.mjs', 'the graders\' simplify rules, reached through the compiler\'s checks'],
  ['functions/shared/algebra/simplifyFirstMatch.mjs', 'the graders\' simplify, reached through the compiler\'s checks'],
  ['src/platform/contract/semanticValidation.js', 'an import\'s checks'],
  ['src/platform/preflight/assignmentAuthoringState.js', 'an import held for repair (the intake loads it itself)'],
  ['src/platform/preflight/incompleteAssignmentDraftStore.js', 'Create closes the incomplete draft it came from'],
  ['src/platform/assignment/liveQuestionCorrection.js', 'a live correction, saved from the question editor (App\'s grader repair imports it on Grades)'],
  ['functions/shared/liveResponseRepairPolicy.mjs', 'a live correction\'s kinds'],
  ['src/platform/labs/labDefinitionSchema.js', 'Create\'s private modeling labs'],
  ['src/platform/assignments/libraryAssignmentReuse.js', 'Review / Edit Setup, Dates & Classes for a Library lesson, Library repair'],
  ['src/platform/assignments/canonicalCcmrHydration.js', 'Honors CCMR, at an import and at Create'],
  ['src/platform/assignments/ccmrAuditWarnings.js', 'an import\'s CCMR warnings'],
  ['src/platform/rigor/honorsExtensionRecipes.js', 'Create certifies the Honors extension'],
  ['src/platform/rigor/honorsExtensionSwap.js', 'the question editor\'s appended sections'],
  ['src/platform/recovery/recoveryContentAuthoring.js', 'Create and Duplicate plan Recovery'],
  ['src/platform/recovery/teacherRecoveryAudit.js', 'the Recovery audit trail in a student\'s Details (its own panel)'],
  ['functions/shared/assignmentPrivacy.mjs', 'Duplicate copies no instance state'],
  // The third pass: what the workspace ran or drew only on its way to another screen.
  ['src/app/teacher/workspaceAssignmentActions.js', 'the async assignment actions (an import, Create, a question edit\'s Save, Duplicate, Library repair, Dates & Classes)'],
  ['src/app/teacher/assignmentsTabView.jsx', 'the Assignments screen\'s JSX, which waits for the authoring code anyway'],
  ['src/app/teacher/gradebookTabView.jsx', 'the gradebook\'s JSX, under the Grades heading'],
  ['src/services/assignmentCcmrService.js', 'an import\'s CCMR request, which only the assignment actions make'],
  ['src/platform/recovery/gradebookRecoveryMarks.js', 'the gradebook\'s Recovery marks (R, Held, LC), which only its JSX draws'],
  ['src/app/teacher/administrationView.jsx', 'the root administrator\'s screen'],
  ['src/platform/teacher/parentContactStore.js', 'the parent-contact writes, which Discipline and Parent Contacts load as they open'],
  ['src/components/teacher/LiveAttendancePanel.jsx', 'Today\'s Live Attendance, behind the live monitor\'s toggle'],
  ['src/components/teacher/ClassPointsAwardDialog.jsx', 'Class points\' award dialog'],
  ['src/components/teacher/ClassPointsHistoryPanel.jsx', 'Class points\' activity, behind its toggle'],
]) {
  test(`${path.basename(file)} is not in a teacher's first load: ${why}`, () => {
    const key = path.join(repo, file);
    // A renamed or deleted module is in no graph at all: say so, or the
    // absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${file} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${file} is in a teacher's first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

// Every kit member the workspace uses is bound from the kit where it is
// called, never imported again (TeacherWorkspace is .jsx: no test imports it,
// and a call with no binding is a ReferenceError that passes every other check).
test('the workspace takes exactly the kit\'s members from the kit, and imports none of them', () => {
  const exported = authoringKitExports();
  const taken = [...new Set(authoringKitNames(workspace))].sort();
  assert.deepEqual(taken, [...exported.keys()].sort(), 'the workspace uses every member, and nothing the kit lacks');
  for (const [name, from] of exported) {
    assert.doesNotMatch(workspace, new RegExp(`^import [^;]*\\b${name}\\b[^;]*;$`, 'm'), `the workspace imports ${name} statically again`);
    assert.ok(existsSync(path.join(repo, from)) || existsSync(path.join(repo, `${from}.js`)), `${name} comes from ${from}, which exists`);
  }
  // Each handler binds what it calls (the list's two checks too).
  const binds = (start, end, names) => {
    const handler = region(workspace, start, end, start);
    const bound = authoringKitNames(handler);
    names.forEach((name) => assert.ok(bound.includes(name), `${start} binds ${name}`));
  };
  binds('const readAssignmentJson = (rawText) => {', 'const handleAssignmentJsonReady', ['parseAssignmentBlueprintText', 'validateAssignmentQuestions', 'validateQuestionsSemantics']);
  binds('const handleAssignmentJsonReady = async', 'const handleCreateAssignment', ['buildAssignmentV5PreflightModel', 'canSalvageV5IntakeResult', 'ccmrAuditWarnings', 'parseAssignmentBlueprintText', 'proveImportedCcmrClaims']);
  binds('const handleCreateAssignment = async', 'const updateExistingAssignmentFromReview', ['assertFirestoreSafeAssignmentPayload', 'buildAssignmentV5PreflightModel', 'certifyHonorsExtensionQuestion', 'confirmHonorsCandidateForCreate', 'creationRecoveryContent', 'markIncompleteAssignmentDraftPublished', 'normalizeLabDefinition', 'validateAssignmentQuestions']);
  binds('const updateExistingAssignmentFromReview = async', 'const confirmAssignmentPreflight', ['assertFirestoreSafeAssignmentPayload', 'buildAssignmentV5PreflightModel']);
  binds('const saveQuestionEditor = async', 'const handleDuplicateAssignment', ['GRAPH_VIEWPORT_REPAIR_KIND', 'buildAssignmentV5PreflightModel', 'questionFingerprint', 'repairAssignmentTrackerForGranularWorkflowCredit', 'repairAssignmentTrackerForLiveCorrections', 'withAppendedQuestionSections']);
  binds('const handleDuplicateAssignment = async', 'const openStoredAssignmentForPreflight', ['buildAssignmentV5PreflightModel', 'creationRecoveryContent', 'stripAssignmentInstanceState']);
  binds('const openStoredAssignmentForPreflight = async', 'const handleRepairAssignmentFromLibrary', ['prepareStoredAssignmentForReuse']);
  binds('const beginEditAssignmentSetup = (assignment) => {', 'const beginAssignLibraryAssignment', ['prepareStoredAssignmentForReuse']);
  binds('const handleRepairAssignmentFromLibrary = async', 'const handleSaveAssignmentDates', ['buildSafeLibraryContentRepair', 'inspectLibraryContentRepair']);
  binds('export function renderAssignmentsTab(scope) {', 'const renderAssignmentCard = (assignment) => {', ['inspectLibraryContentRepair', 'recoveryPreparationAvailable']);
  // The kit is read without waiting only where it is certainly here:
  // readAssignmentJson, after handleAssignmentJsonReady's await, and Review /
  // edit setup, which opens at once when it is here (as it did, so the hub
  // closes as the review opens) and otherwise once it has arrived.
  const ready = region(workspace, 'const handleAssignmentJsonReady = async', 'const handleCreateAssignment', 'import');
  assert.ok(ready.indexOf('await authoringKit()') >= 0 && ready.indexOf('await authoringKit()') < ready.indexOf('readAssignmentJson(sourceText)'));
  const setup = region(workspace, 'const beginEditAssignmentSetup = (assignment) => {', 'const beginAssignLibraryAssignment', 'Review / edit setup');
  assert.match(setup, /^const beginEditAssignmentSetup = \(assignment\) => \{[\s\S]*?if \(!loadedAuthoringKit\(\)\) \{\s*authoringKit\(\)\.then\(\(\) => beginEditAssignmentSetup\(assignment\), \(\) => \{[^}]*\}\);\s*return;\s*\}\s*try \{\s*const \{ prepareStoredAssignmentForReuse \} = requireAuthoringKit\(\);/);
  assert.equal((workspace.match(/requireAuthoringKit\(\);/g) || []).length, 2, 'only those two read the kit without waiting for it');
  // The question editor opens without the code, and its Save runs it: it is
  // asked for as the editor opens, so a chunk that cannot load says so before
  // an edit is made. Every Pre-Flight review opens only after it has arrived.
  const editor = region(workspace, 'const openQuestionEditor = (assignment) => {', 'const saveQuestionEditor', 'openQuestionEditor');
  assert.ok(editor.indexOf('authoringKit().catch(') > editor.indexOf('setQuestionEditorAssignment(assignment);'), 'asked for once the editor opens');
  for (const [start, end] of [
    ['const handleAssignmentJsonReady = async', 'const handleCreateAssignment'],
    ['const openStoredAssignmentForPreflight = async', 'const handleRepairAssignmentFromLibrary'],
  ]) {
    const opener = region(workspace, start, end, start);
    assert.ok(opener.indexOf('await authoringKit()') >= 0 && opener.indexOf('await authoringKit()') < opener.indexOf('openAssignmentPreflight('), `${start} has the code before the review opens`);
  }
  // Dates & Classes waits for the Library lesson's review before it closes.
  const dates = region(workspace, 'const handleSaveAssignmentDates = async', '\n  return {\n    handleAssignmentJsonReady,', 'Dates & Classes');
  assert.equal((dates.match(/await openStoredAssignmentForPreflight\(assignment, \{/g) || []).length, 2);
});

// One request per page; once here, every later caller gets it at once. A
// failed request is kept (a browser keeps a failed module URL for the page's
// life): the workspace hands it to AppErrorBoundary, whose "Load the new
// version" loads a new page, as for a teacher screen's chunk.
test('the authoring code loads once, is handed out at once after that, and a failure is kept and reaches AppErrorBoundary', async () => {
  const loader = await import('../../src/app/teacher/authoringKitLoader.js');
  assert.equal(loader.loadedAuthoringKit(), null, 'nothing is loaded until someone asks');
  const first = loader.loadAuthoringKit();
  assert.equal(loader.loadAuthoringKit(), first, 'a second caller shares the first request');
  const kit = await first;
  assert.equal(loader.loadedAuthoringKit(), kit);
  assert.deepEqual(Object.keys(kit).sort(), [...authoringKitExports().keys()].sort());
  const loaderCode = executableSource(read('src/app/teacher/authoringKitLoader.js'));
  assert.match(loaderCode, /if \(!pending\) pending = import\('\.\/teacherAuthoringKit\.js'\)\.then\(\(kit\) => \{ loaded = kit; return kit; \}\);/);
  assert.equal((loaderCode.match(/\bpending = /g) || []).length, 2, 'pending is declared, and set once by the request');
  assert.doesNotMatch(loaderCode, /\(error\) => \{[^}]*pending = null/, 'a failed request is not forgotten: asking again would fail the same way');
  // The workspace: an action's failure becomes the render's, and the list's
  // wait throws it itself (React's use()).
  assert.match(workspace, /const \[authoringKitError, setAuthoringKitError\] = useState\(null\);/);
  assert.match(workspace, /if \(authoringKitError\) throw authoringKitError;/);
  assert.match(workspace, /const authoringKit = \(\) => loadAuthoringKit\(\)\.catch\(\(error\) => \{\s*setAuthoringKitError\(error\);\s*throw error;\s*\}\);/);
  assert.match(workspace, /const assignmentListKit = teacherTab === 'assignments' \? \(loadedAuthoringKit\(\) \|\| use\(loadAuthoringKit\(\)\)\) : null;/);
  // The list waits only where it is drawn: after the administrator's own
  // screen has returned, before the workspace's.
  assert.ok(workspace.indexOf("if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {") < workspace.indexOf('const assignmentListKit ='));
  assert.ok(workspace.indexOf('const assignmentListKit =') < workspace.indexOf("{teacherTab === 'assignments' && assignmentsTab.renderAssignmentsTab("));
});

// Once the workspace has drawn, the next idle moment fetches the code: once
// per page, never when the device asks to save data (the student screens'
// prefetch, studentScreenPrefetch.js, whose rules are tested there).
test('the workspace fetches the authoring code when the browser is idle, once it has drawn', async () => {
  assert.match(workspace, /useEffect\(\(\) => prefetchAuthoringKit\(\), \[\]\);/);
  const { prefetchAuthoringKit } = await import('../../src/app/teacher/authoringKitLoader.js');
  const fakeWindow = ({ saveData = false } = {}) => {
    const idle = [];
    return {
      idle,
      navigator: { onLine: true, connection: { saveData } },
      requestIdleCallback: (callback, options) => { idle.push({ callback, options }); return idle.length; },
      cancelIdleCallback: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  };
  const saving = fakeWindow({ saveData: true });
  prefetchAuthoringKit(saving);
  assert.equal(saving.idle.length, 0, 'a device saving data fetches nothing ahead');
  const win = fakeWindow();
  const cancel = prefetchAuthoringKit(win);
  assert.equal(typeof cancel, 'function', 'the effect can cancel it');
  assert.equal(win.idle.length, 1, 'asked for once the browser is idle');
  assert.equal(win.idle[0].options.timeout, 5000);
  win.idle[0].callback();
  const again = fakeWindow();
  prefetchAuthoringKit(again);
  assert.equal(again.idle.length, 0, 'once per page');
});
