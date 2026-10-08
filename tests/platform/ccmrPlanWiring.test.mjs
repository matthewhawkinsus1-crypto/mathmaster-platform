// The CCMR plan, wired through the screens.
//
// Node cannot render .jsx, so these read the components as source — each
// assertion bound to the region that must do the work (helpers/sourceContract).
// The behaviour behind them is tested directly: the plan rule in
// ccmrPlan.test.mjs, the screen helpers in ccmrPlanClient.test.mjs, the weekly
// format choice in weeklyTransferFramework.test.mjs, the rules in the emulator.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource, region } from './helpers/sourceContract.mjs';
import * as assessmentContextModule from '../../src/platform/ccmr/studentAssessmentContext.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

const pathApp = read('src/components/student/MyMathPathApp.jsx');
const hub = read('src/components/student/CCMRHub.jsx');
const simulator = read('src/components/teacher/SimulatedStudentExperience.jsx');
const store = read('src/platform/ccmr/ccmrPlanStore.js');
const roster = read('src/components/teacher/StudentsRoster.jsx');

const experience = region(pathApp, 'export const MyMathPathExperience = (', 'export const MyMathPathApp = (', 'MyMathPathExperience');
const container = region(pathApp, 'export const MyMathPathApp = (', 'export default MyMathPathApp', 'MyMathPathApp container');

const sourceFiles = (dir) => readdirSync(path.join(ROOT, dir)).flatMap((name) => {
  const relative = path.join(dir, name);
  if (statSync(path.join(ROOT, relative)).isDirectory()) return sourceFiles(relative);
  return /\.(js|jsx|mjs)$/.test(name) ? [relative] : [];
});

test('no code writes CCMR goals to browser storage any more', () => {
  // The old store is gone from the assessment context, by export — not by text.
  assert.equal('writeCcmrGoals' in assessmentContextModule, false);
  assert.equal('readCcmrGoals' in assessmentContextModule, false);
  const offenders = sourceFiles('src').filter((file) => {
    const code = executableSource(read(file));
    return /writeCcmrGoals|readCcmrGoals/.test(code)
      || (/ccmrGoals/.test(code) && /\bsetItem\s*\(/.test(code));
  });
  assert.deepEqual(offenders, []);
  // The legacy key survives only to be read once and removed.
  const storeCode = executableSource(store);
  assert.doesNotMatch(storeCode, /\bsetItem\s*\(/);
  assert.match(region(storeCode, 'export const clearLegacyCcmrGoals', '\n};', 'clearLegacyCcmrGoals'), /removeItem\(`\$\{LEGACY_CCMR_GOAL_STORAGE_PREFIX\}\$\{studentId\}`\)/);
});

test('the store reads the plan document live and writes only through the callable', () => {
  const subscribe = region(store, 'export const subscribeStudentCcmrPlan', '\n};', 'subscribeStudentCcmrPlan');
  assert.match(subscribe, /onSnapshot\(\s*doc\(db, CCMR_PLAN_COLLECTION, String\(studentId\)\)/);
  assert.match(subscribe, /includeMetadataChanges: true/, 'the migration must see the server confirm "no plan"');
  assert.match(subscribe, /fromCache: snapshot\.metadata\?\.fromCache === true/);
  const save = region(store, 'export const saveMyCcmrPlan', '\n};', 'saveMyCcmrPlan');
  assert.match(save, /httpsCallable\(functions, 'setMyCcmrPlan'\)/);
  assert.doesNotMatch(executableSource(store), /setDoc|updateDoc|addDoc|writeBatch/);
});

test('the live container subscribes to the student\'s plan and hands it down as data', () => {
  assert.match(pathApp, /import \{\s*clearLegacyCcmrGoals, readLegacyCcmrGoals, saveMyCcmrPlan, subscribeStudentCcmrPlan,\s*\} from '\.\.\/\.\.\/platform\/ccmr\/ccmrPlanStore\.js';/);
  assert.match(container, /return subscribeStudentCcmrPlan\(\{\s*studentId,/);
  assert.match(container, /ccmrPlan=\{ccmrPlanCurrent \? ccmrPlanState\.plan : null\}/);
  // Editable only once KNOWN: a cached "no plan" is not an answer, and a save
  // built on it could overwrite a plan saved on another device.
  assert.match(container, /ccmrPlanLoaded=\{ccmrPlanKnown\}/);
  assert.match(container, /const ccmrPlanKnown = ccmrPlanCurrent && ccmrPlanState\.loaded && !ccmrPlanState\.error\s*&& \(ccmrPlanState\.exists \|\| !ccmrPlanState\.fromCache\);/);
  // The week waits for a known plan, an error, or a few seconds offline.
  assert.match(container, /ccmrPlanSettled=\{ccmrPlanSettled\}/);
  assert.match(container, /const ccmrPlanSettled = ccmrPlanCurrent && \(ccmrPlanKnown \|\| Boolean\(ccmrPlanState\.error\) \|\| ccmrPlanWaitExpired\);/);
  // A teacher's read-only view reads the student's plan and can never save it.
  assert.match(container, /onSaveCcmrPlan=\{readOnly \? null : saveCcmrPlan\}/);
  assert.match(container, /const readOnly = Boolean\(props\.readOnly\)/);
  // Saves go out one at a time, in order, through the callable wrapper.
  const queue = region(container, 'const saveCcmrPlan = useCallback(', '}, [studentId]);', 'container save queue');
  assert.match(queue, /ccmrSaveQueue\.current\.catch\(\(\) => \{\}\)\.then\(\(\) => saveMyCcmrPlan\(request\)\)/);
});

test('browser goals move to the account once, by the tested decision, then are forgotten', () => {
  assert.match(pathApp, /decideLegacyCcmrMigration,?[\s\S]{0,80}\} from '\.\.\/\.\.\/platform\/ccmr\/ccmrPlan\.js'/);
  const migration = region(container, 'const ccmrMigrationAttempted = useRef(null);', 'const ccmrPlanCurrent', 'migration effect');
  assert.match(migration, /decideLegacyCcmrMigration\(\{[\s\S]*readOnly,[\s\S]*fromCache: ccmrPlanState\.fromCache,[\s\S]*legacyGoals: readLegacyCcmrGoals\(studentId\),[\s\S]*attempted: ccmrMigrationAttempted\.current === studentId,/);
  assert.match(migration, /if \(decision\.action === 'clear'\) clearLegacyCcmrGoals\(studentId\)/);
  const migrateAt = migration.indexOf("if (decision.action !== 'migrate') return;");
  const markAt = migration.indexOf('ccmrMigrationAttempted.current = studentId;');
  const saveAt = migration.indexOf('saveCcmrPlan(decision.request)');
  assert.ok(migrateAt > -1 && markAt > migrateAt && saveAt > markAt, 'marked as attempted before the save, so it cannot run twice');
  assert.match(migration.slice(saveAt), /\.then\(\(\) => clearLegacyCcmrGoals\(studentId\)\)/);
});

test('the weekly plan waits for the student\'s plan and uses it with the teacher\'s framework', () => {
  const weekly = region(experience, 'const weeklyPlan = useMemo(', '\n  const proposedWeeklyGoal', 'weeklyPlan memo');
  assert.match(weekly, /pathOptions && ccmrPlanSettled \? buildWeeklyPathPlan\(\{/);
  assert.match(weekly, /\bccmrPlan,\s/);
  // The class's settings arrive through the helper the teacher's previews
  // use (weeklyPlanClassInputs, behaviour-tested in weeklyPlanClassInputs.test.mjs).
  assert.match(weekly, /\.\.\.weeklyPlanClassInputs\(\{ config: weeklyGoalConfig \|\| \{\}, honors \}\),/);
  assert.match(pathApp, /import \{[^}]*\bweeklyPlanClassInputs\b[^}]*\} from '\.\.\/\.\.\/platform\/path\/weeklyPathGoal\.js';/);
  assert.match(weekly, /\[pathOptions, ccmrPlanSettled,[^\]]*ccmrPlan\]/, 'and recomputes when the plan arrives');
  // Editing, not the week, follows the stricter "known" signal.
  assert.match(region(experience, 'const ccmrPlanStatus = useMemo(', '}), [', 'plan status'), /editable: !readOnly && Boolean\(onSaveCcmrPlan\) && ccmrPlanLoaded && !ccmrPlanError,/);
});

test('the student\'s goals and test date are saved through the container, never in read-only mode', () => {
  const save = region(experience, 'const saveCcmrPlan = useCallback(', '}, [readOnly, onSaveCcmrPlan]);', 'experience save');
  const guardAt = save.indexOf('if (readOnly || !onSaveCcmrPlan) {');
  const callAt = save.indexOf('onSaveCcmrPlan(ccmrPlanSaveRequest(next, { now: Date.now() }))');
  assert.ok(guardAt > -1 && callAt > guardAt, 'read-only and simulator-less views cannot save');
  assert.match(save, /setPendingCcmrPlan\(next\)/);
  assert.match(save, /if \(ccmrSavesInFlight\.current === 0\) setPendingCcmrPlan\(null\)/, 'a failed save visibly undoes itself');
  assert.match(region(experience, 'const changeGoals = useCallback(', '}, [readOnly, saveCcmrPlan, visibleCcmrPlan]);', 'changeGoals'), /saveCcmrPlan\(ccmrPlanWithGoals\(visibleCcmrPlan, next\)\)/);
  assert.match(region(experience, 'const changeTest = useCallback(', '}, [readOnly, saveCcmrPlan, visibleCcmrPlan]);', 'changeTest'), /saveCcmrPlan\(ccmrPlanWithTest\(visibleCcmrPlan, test\)\)/);
  const hubMount = region(experience, '<CCMRHub', '/>', 'CCMRHub mount');
  assert.match(hubMount, /plan=\{visibleCcmrPlan\}/);
  assert.match(hubMount, /planStatus=\{ccmrPlanStatus\}/);
  assert.match(hubMount, /onChangeTest=\{changeTest\}/);
  assert.match(hubMount, /readOnly=\{readOnly\}/);
});

test('the CCMR hub has a bounded test-date field, benchmark lines, and stays read-only for teachers', () => {
  const panel = region(hub, 'function CcmrPlanPanel(', '\n}\n', 'CcmrPlanPanel');
  assert.match(hub, /import \{\s*ccmrTestDateBounds, ccmrTestDateDraftProblem, describeCcmrPlan,\s*\} from '\.\.\/\.\.\/platform\/ccmr\/ccmrPlan\.js';/);
  assert.match(panel, /type="date"[\s\S]*min=\{bounds\.min\}[\s\S]*max=\{bounds\.max\}/);
  assert.match(panel, /onClick=\{\(\) => onChangeTest\?\.\(\{ testDate: draftDate, testFramework: framework \}\)\}/);
  // Save is off until a valid, different date is entered — and looks off.
  assert.match(panel, /const saveDisabled = !changed \|\| Boolean\(problem\) \|\| !draftDate;/);
  assert.match(panel, /disabled=\{saveDisabled\}[\s\S]{0,160}style=\{buttonStyle\(true, saveDisabled\)\}/);
  assert.match(panel, /described\.lines\.map\(\(line\) => \(/);
  // A teacher is told about "the" test; the student about "your" test.
  assert.match(panel, /describeCcmrPlan\(plan, \{ now, audience: readOnly \? 'teacher' : 'student' \}\)/);
  // Read-only renders the date as text: the input and its buttons live only
  // in the editable branch.
  const readOnlyBranch = region(panel, '{readOnly ? (', ') : (', 'read-only test date');
  assert.doesNotMatch(readOnlyBranch, /<input|<button|<select/);
  assert.match(readOnlyBranch, /described\.test \?/);
  // Editing waits for the saved plan: the goal checkboxes AND the date field
  // each sit in a fieldset that is disabled until the plan has loaded.
  const fieldsets = [...panel.matchAll(/<fieldset([^>]*)>([\s\S]*?)<\/fieldset>/g)];
  const goalSet = fieldsets.find((entry) => /type="checkbox"/.test(entry[2]));
  const dateSet = fieldsets.find((entry) => /type="date"/.test(entry[2]));
  assert.ok(goalSet && dateSet, 'both groups are fieldsets');
  assert.match(goalSet[1], /disabled=\{locked\}/);
  assert.match(dateSet[1], /disabled=\{locked\}/);
  assert.match(panel, /const locked = !readOnly && Boolean\(planStatus\) && planStatus\.editable === false;/);
  assert.match(region(hub, 'export default function CCMRHub(', 'const byFramework', 'CCMRHub props'), /onChangeTest,/);
  assert.match(hub, /onChangeTest=\{readOnly \? null : onChangeTest\}/);
});

test('the Teacher Path Simulator keeps its own plan and never touches the student store', () => {
  assert.match(simulator, /import \{ ccmrPlanFrameworks, normalizeStoredCcmrPlan, validateCcmrPlanInput \} from '\.\.\/\.\.\/platform\/ccmr\/ccmrPlan\.js';/);
  assert.doesNotMatch(executableSource(simulator), /ccmrPlanStore|setMyCcmrPlan|saveMyCcmrPlan/);
  const override = region(simulator, 'const assessmentContext = useMemo(', '}), [assessmentEvidence, directIndex, simulatedCcmrPlan]);', 'simulator assessment context');
  assert.match(override, /goals: ccmrPlanFrameworks\(simulatedCcmrPlan\),/);
  const save = region(simulator, 'const saveSimulatedCcmrPlan = (request) => {', '\n  };', 'simulator save');
  assert.match(save, /validateCcmrPlanInput\(request, \{ now: Date\.now\(\) \}\)/, 'it refuses what production refuses');
  // Kept per simulated learner, so one slot's test date never follows the
  // teacher into another slot.
  assert.match(save, /setSimulatedCcmrPlans\(\(current\) => \(\{ \.\.\.current, \[learnerKey\]: plan \}\)\)/);
  assert.match(simulator, /const learnerKey = learner\?\.id \|\| 'simulated';/);
  assert.match(simulator, /const simulatedCcmrPlan = simulatedCcmrPlans\[learnerKey\] \|\| null;/);
  const mount = region(simulator, '<MyMathPathExperience', '/>', 'simulated experience');
  assert.match(mount, /assessmentContextOverride=\{assessmentContext\}/);
  assert.match(mount, /ccmrPlan=\{simulatedCcmrPlan\}/);
  assert.match(mount, /onSaveCcmrPlan=\{saveSimulatedCcmrPlan\}/);
});

test('the teacher\'s student view is the live container, so it reads the student\'s server plan', () => {
  // StudentsRoster renders the container (which subscribes), not the bare
  // experience, and passes the student's id — the plan it shows is the
  // student's, not the teacher's browser.
  assert.match(roster, /<MyMathPathApp key=\{selected\.id\} readOnly[^>]*studentId=\{selected\.id\}/);
  assert.doesNotMatch(executableSource(roster), /ccmrGoals|localStorage/);
});
