/*
 * RECOVERY V2 — WHAT TEACHERS AND STUDENTS SEE, AND THE BUTTONS THAT ACT.
 *
 * The readiness words are pure and run here. The screens are .jsx, which
 * Node cannot import, so their wiring is asserted on source — each assertion
 * on the behavior its comment names (AGENTS.md: assert behavior, not wording):
 *
 *   Pre-Flight shows Warm-Up and DOL Recovery readiness for the Standard and
 *     the Honors copy, offers "Fix for Recovery" on exactly the questions that
 *     stop it, and takes a repair only when the planner can then certify it;
 *   the assignment details show readiness as students have it NOW, the
 *     Recovery version, Prepare Recovery (the server's dry run, approved by
 *     the teacher, bound to its plan hash), and who in the class can recover;
 *   an assignment card offers Prepare Recovery only where it can add some;
 *   nothing a teacher calls "ready" is not ready, and an exception is never
 *     worded as a failure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import {
  RECOVERY_REPAIR_INSTRUCTION,
  recoveryReadinessLabel,
  recoveryReadinessSummary,
  recoveryRowLabel,
  recoveryVerdict,
} from '../../src/platform/recovery/recoveryReadinessCopy.js';

/* ---------------------------------------------------------------------------
 * The words.
 * ------------------------------------------------------------------------- */

test('a legitimate exception is never worded as a failure, and "ready" is said only of what is ready', () => {
  assert.equal(recoveryReadinessLabel('ready').text, 'Ready');
  assert.equal(recoveryReadinessLabel('unavailable').text, 'Not ready');
  assert.equal(recoveryReadinessLabel('notConfigured').text, 'Not ready');
  ['off', 'liveChallenge', 'secure', 'notPresent'].forEach((status) => {
    assert.doesNotMatch(recoveryReadinessLabel(status).text, /not ready/i, `${status} is an exception, not a failure`);
  });
  assert.equal(recoveryReadinessLabel('something-new').text, 'Not ready', 'an unknown status is never read as ready');
  assert.equal(recoveryReadinessSummary({ warmup: { status: 'ready' }, dol: { status: 'unavailable' } }), 'Warm-Up Recovery ready · DOL Recovery not ready');
  assert.equal(recoveryReadinessSummary({ warmup: { status: 'liveChallenge' }, dol: { status: 'notPresent' } }), 'Warm-Up Recovery live challenge — the result is the warm-up grade');
  // The verdict: never "ready" unless every section present is ready or an exception.
  assert.match(recoveryVerdict({ warmup: { status: 'ready' }, dol: { status: 'unavailable' } }, false), /^Not fully Recovery-ready yet/);
  assert.match(recoveryVerdict({ warmup: { status: 'ready' }, dol: { status: 'ready' } }, true), /^Ready: a student who needs it can recover the Warm-Up and the DOL/);
  assert.match(recoveryVerdict({ warmup: { status: 'liveChallenge' }, dol: { status: 'ready' } }, true), /either ready for Recovery or uses one of the exceptions/);
  assert.match(recoveryVerdict({ warmup: { status: 'off' }, dol: { status: 'off' } }, true), /^Nothing to prepare/);
});

test('a planned Recovery is "ready" in Pre-Flight (creation stores it) and "not ready yet" on a live assignment (it awaits approval)', () => {
  assert.match(recoveryRowLabel({ status: 'add' }, 'authoring'), /^ready — Recovery versions will be prepared/);
  assert.match(recoveryRowLabel({ status: 'add' }, 'live'), /^not ready yet — MathMaster can add Recovery versions without changing the question \(Prepare Recovery\)/);
  assert.match(recoveryRowLabel({ status: 'replace' }, 'live'), /^not ready — the question changed after its Recovery was prepared/);
  assert.match(recoveryRowLabel({ status: 'kept' }, 'live'), /^ready/);
  assert.match(recoveryRowLabel({ status: 'family' }, 'live'), /^ready/);
  assert.equal(recoveryRowLabel({ status: 'unavailable' }, 'live'), 'not ready');
  assert.match(RECOVERY_REPAIR_INSTRUCTION, /same skill, TEKS, DOK, difficulty and tool/);
  assert.match(RECOVERY_REPAIR_INSTRUCTION, /"questionFamily"/);
});

/* ---------------------------------------------------------------------------
 * Pre-Flight.
 * ------------------------------------------------------------------------- */

const preflight = componentSource('src/components/teacher/LessonPreflightModal.jsx');

test('Pre-Flight shows Recovery readiness for the Standard copy and, once there is one, the Honors copy on its own questions', () => {
  assert.match(preflight, /^import RecoveryReadinessPanel from '\.\/RecoveryReadinessPanel\.jsx';$/m);
  const block = region(preflight, 'const renderRecoveryReadiness = () => (', '\n  );\n', 'Recovery readiness block');
  assert.match(block, /sections=\{preflightModel\.questionGeneration\?\.recovery\}/);
  assert.match(block, /fullyReady=\{preflightModel\.questionGeneration\?\.recoveryReadiness\?\.fullyReady \?\? null\}/);
  assert.match(block, /sections=\{honorsRecoveryModel\.questionGeneration\?\.recovery\}/, 'the Honors copy is judged on its own questions');
  assert.match(preflight, /const honorsRecoveryModel = honorsCandidateCurrent \? honorsCandidate\?\.model : null;/, 'only the Honors version Create would publish');
  // It is shown in the Check step, beside the question-generation notes.
  const check = region(preflight, 'const renderCheck = () => (', 'const ', 'Check step');
  assert.match(check, /\{renderRecoveryReadiness\(\)\}/);
});

test('"Fix for Recovery" repairs exactly the questions that stop Recovery, and a repair is taken only if the planner can then certify it', () => {
  const block = region(preflight, 'const renderRecoveryReadiness = () => (', '\n  );\n', 'Recovery readiness block');
  assert.match(block, /onRepair=\{allowQuestionRepair \? \(row\) => beginQuestionRepair\(row\.storageIndex, 'recovery'\) : null\}/, 'never offered where question content is locked by student records');
  assert.match(block, /renderRepairControls=\{repairPurpose === 'recovery' \? renderRepairControls : null\}/);
  // The repair request names the planner's reasons and asks for a recoverable version.
  const issues = region(preflight, 'const recoveryRepairIssues = useMemo(() => {', '}, [preflightModel.questionGeneration, previewQuestions]);', 'recovery repair issues');
  assert.match(issues, /\['off', 'liveChallenge', 'secure'\]\.includes\(entry\.status\)\) return \[\];/, 'no repair where Recovery does not apply');
  assert.match(issues, /row\.status === 'unavailable'/);
  assert.match(issues, /RECOVERY_REPAIR_INSTRUCTION,/);
  assert.match(issues, /recovery: true,/);
  assert.match(preflight, /\(repairPurpose === 'recovery' \? recoveryRepairIssues : questionRepairIssues\)/);
  // Acceptance: the same blocker checks, then the planner's own verdict on the replacement.
  const accept = region(preflight, 'const acceptQuestionRepairReplacement = (replacement, issue, sourceLabel) => {', '\n  };\n', 'repair acceptance');
  assert.match(accept, /if \(issue\?\.recovery\) \{[\s\S]*candidateModel\.questionGeneration\?\.recovery[\s\S]*entry\.storageIndex === repairTargetIndex[\s\S]*if \(!row \|\| row\.status === 'unavailable'\) \{[\s\S]*throw new Error\(/);
  assert.ok(accept.indexOf('if (issue?.recovery)') < accept.indexOf('setWorkingAssignmentV5(candidateModel.assignmentV5);'), 'refused before anything is changed');
});

/* ---------------------------------------------------------------------------
 * The assignment details.
 * ------------------------------------------------------------------------- */

const hub = componentSource('src/components/teacher/AssignmentHub.jsx');

test('the assignment details show Recovery as students have it now, its version, and Prepare Recovery where it can add some', () => {
  const section = region(hub, 'function AssignmentRecoverySection({', '\nexport default function AssignmentHub', 'hub Recovery section');
  assert.match(section, /planAssignmentRecoveryContent\(\{ assignment, gradeSample: lightRecoveryKeyCheck \}\)/);
  assert.match(section, /const sections = liveRecoverySections\(plan\);/, 'a binding not yet stored is not counted as ready');
  assert.match(section, /<RecoveryReadinessPanel sections=\{sections\} fullyReady=\{fullyReadyNow\} context="live"/);
  assert.match(section, /const preparable = plan\.rows\.filter\(\(row\) => row\.status === 'add' \|\| row\.status === 'replace'\);/);
  assert.match(section, /\{preparable\.length > 0 && \([\s\S]*onClick=\{\(\) => setUpgradeOpen\(true\)\}>Prepare Recovery…<\/button>/);
  assert.match(section, /\{upgradeOpen && \(\s*<RecoveryUpgradeModal\s+assignment=\{assignment\}\s+onClose=\{\(\) => setUpgradeOpen\(false\)\}\s+onUpgraded=\{onRecoveryUpgraded\}/);
  assert.match(section, /normalizeRecoveryContent\(assignment\?\.recoveryContent\)/);
  // The plan is recomputed when a question, the policy or Recovery changes — not on every live refresh.
  assert.match(section, /const plan = useMemo\(\(\) => \{[\s\S]*\}, \[planKey\]\);/);
  ['assignment?.assignmentRevision', 'assignment?.recoveryContent?.version', 'assignment?.recoveryPolicy', 'questionCount', 'excludedCount'].forEach((input) => {
    assert.ok(region(section, 'const planKey = [', '].join', 'plan key').includes(input), `the plan key includes ${input}`);
  });
  // Mounted for every ordinary assignment (a Test Cycle has its own retest process).
  assert.match(hub, /const recoverySection = !isTestCycleAssignment\(assignment\) && \(\s*<AssignmentRecoverySection/);
});

test('who can recover is read when the teacher asks, from the class\'s grade records, with the server\'s reasons', () => {
  const section = region(hub, 'function AssignmentRecoverySection({', '\nexport default function AssignmentHub', 'hub Recovery section');
  const read = region(section, 'const readRoster = async () => {', '\n  };', 'read roster');
  assert.match(read, /const students = gradeStudents \|\| \(onLoadClassGrades \? await onLoadClassGrades\(classContext\.classId\) : null\);/);
  assert.match(read, /buildTeacherRecoveryRoster\(\{/);
  assert.match(section, /<NameList rows=\{openRoster\.rows\} detail=\{\(row\) => row\.reasonText\} onOpenStudent=\{onOpenStudent\} \/>/);
  assert.match(section, /As of \{clock\(snapshot\.at\)\}/, 'it says how fresh it is');
  assert.match(hub, /gradeStudents=\{hasGradeRecords \? roster : fetched\?\.students \|\| null\}/);
});

test('Prepare Recovery shows the server\'s dry run and approves exactly that plan', () => {
  const modal = executableSource(componentSource('src/components/teacher/RecoveryUpgradeModal.jsx'));
  assert.match(modal, /teacherAdmin\.previewRecoveryContentUpgrade\(\{ assignmentId: assignment\.id \}\)/);
  const approve = region(modal, 'const approve = async () => {', '\n  };', 'approve');
  assert.match(approve, /if \(!canApprove\) return;/);
  assert.match(approve, /teacherAdmin\.commitRecoveryContentUpgrade\(\{\s*assignmentId: assignment\.id,\s*expectedPlanHash: preview\.planHash,\s*\}\)/, 'the approval is bound to the plan the teacher read');
  assert.match(modal, /const canApprove = Boolean\(report\?\.changed && preview\?\.planHash && !result && !committing && !loading\);/);
  // The report's halves: what changes, what does not, and what is still not ready.
  assert.match(modal, /aria-label="What this adds"/);
  assert.match(modal, /aria-label="What stays exactly the same"/);
  assert.match(modal, /aria-label="Still not ready"/);
  assert.match(modal, /report\.untouched\?\.statements/);
  // A plan that moved after the preview: nothing changed, and the teacher can check again.
  assert.match(modal, /planChanged: reason === 'recovery-upgrade-plan-changed'/);
  assert.match(modal, /onClick=\{loadPreview\}[^>]*>Check again<\/button>/);
  const auth = readFileSync(new URL('../../src/auth/authService.js', import.meta.url), 'utf8');
  assert.match(auth, /previewRecoveryContentUpgrade: \(payload\) =>\s*callable\('previewRecoveryContentUpgrade'\)\(payload\)/);
  assert.match(auth, /commitRecoveryContentUpgrade: \(payload\) =>\s*callable\('commitRecoveryContentUpgrade'\)\(payload\)/);
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(index, /^exports\.previewRecoveryContentUpgrade = onCall\(/m);
  assert.match(index, /^exports\.commitRecoveryContentUpgrade = onCall\(/m);
});

test('an assignment card offers Prepare Recovery only where a static Warm-Up or DOL question can gain it, and the details refresh after', () => {
  const workspace = executableSource(componentSource('src/app/teacher/TeacherWorkspace.jsx'));
  assert.match(workspace, /^import \{ recoveryPreparationAvailable \} from '\.\.\/\.\.\/\.\.\/functions\/shared\/recoveryContentPlan\.mjs';$/m);
  const card = region(workspace, 'const renderAssignmentCard = (assignment) => {', 'key: \'move-folder\'', 'assignment card');
  assert.match(card, /const recoveryCanBeAdded = recoveryPreparationAvailable\(assignment\);/);
  assert.match(card, /\{recoveryCanBeAdded && <button type="button" data-recovery-can-be-added=\{assignment\.id\} onClick=\{\(\) => openAssignmentHub\(assignment\.id\)\}/);
  assert.match(card, /\.\.\.\(recoveryCanBeAdded \? \[\{\s*key: 'prepare-recovery',\s*label: 'Prepare Recovery…',\s*onClick: \(\) => openAssignmentHub\(assignment\.id\),/);
  const mount = region(workspace, '<AssignmentHub', '/>', 'hub mount');
  assert.match(mount, /onRecoveryUpgraded=\{async \(result\) => \{\s*await fetchAssignments\(\);/);
});

test('the student\'s Recovery decision reads the teacher\'s per-question grades, so a teacher-graded Practice answer never unlocks it', () => {
  const app = executableSource(componentSource('src/App.jsx'));
  const results = region(app, 'const studentRecoverySummary = useMemo(', '}, [recoveryAssignmentId', 'result summary');
  assert.match(results, /overrides: teacherGradeOverridesByAssignment\?\.\[recoveryAssignmentId\] \|\| null,/);
  const all = region(app, 'const studentRecoverySummariesByAssignment = useMemo(', ']);', 'summaries');
  assert.match(all, /overridesByAssignment: teacherGradeOverridesByAssignment \|\| \{\},/);
  const discovery = region(app, 'const studentRecoveryDiscovery = useMemo(', '\n  );\n', 'discovery');
  assert.match(discovery, /overridesByAssignment: teacherGradeOverridesByAssignment \|\| \{\},/);
});

test('recoveryContent is server-owned: a teacher\'s browser can create an assignment with it but never change it afterwards', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const owned = region(rules, 'function serverOwnedAssignmentFields()', '}', 'server-owned assignment fields');
  assert.match(owned, /'recoveryContent'/);
});
