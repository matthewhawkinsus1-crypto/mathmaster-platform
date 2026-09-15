import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const home = fs.readFileSync('src/TeacherHome.jsx', 'utf8');
const panel = fs.readFileSync('src/components/teacher/StudentPersistenceRecoveryPanel.jsx', 'utf8');
const service = fs.readFileSync('src/services/persistenceRecoveryService.js', 'utf8');
const functions = fs.readFileSync('functions/index.js', 'utf8');

test('Submission Recovery is permanent and selects an active class before its assignments', () => {
  const recovery = region(home, '<h2 style={{ margin:', '{currentClass && (', 'permanent recovery section');
  assert.match(recovery, />Submission Recovery</);
  assert.doesNotMatch(recovery, /currentClass\s*&&/);
  assert.match(recovery, /classOptions\.filter\(\(entry\) => entry\.classId\)/);
  assert.match(recovery, /recoveryAssignments\.map/);
  assert.match(home, /assignments\.filter\(\(assignment\) => assignmentIsForStudent\(assignment, \{ classId: recoveryClassId \}\)\)/);
});

test('changing a recovery target cannot retain state from the previous target', () => {
  const classChange = region(home, 'const selectRecoveryClass', '\n  };', 'recovery class change');
  assert.match(classChange, /setRecoveryAssignmentId\(''\)/);
  assert.match(home, /key={`\$\{recoveryClassId\}::\$\{recoveryAssignmentId\}`}/);
  const reset = region(panel, 'useEffect(() => {', '}, [assignmentId, classId]);', 'panel target reset');
  assert.match(reset, /setReport\(null\)/);
  assert.match(reset, /setProposals\(null\)/);
});

test('draft recovery shows exact safe proposals and confirms before its write', () => {
  const previewTable = region(panel, "{proposals?.proposals?.length > 0", "{confirmationOpen &&", 'proposal preview');
  for (const heading of ['Student ID', 'Question ID', 'Section / role', 'Academic time recorded', 'Why eligible', 'Current canonical status', 'Proposed result']) {
    assert.match(previewTable, new RegExp(heading));
  }
  assert.match(panel, /onClick=\{\(\) => setConfirmationOpen\(true\)\}/);
  assert.match(panel, /Recover these saved responses as graded attempts\?/);
  assert.match(panel, /onClick=\{commitDrafts\}>Recover responses/);
  assert.match(service, /previewActionIds/);
});

test('server preview is non-writing, securely scoped, and commit requires that preview', () => {
  const callable = region(functions, 'exports.applyWorkspaceDraftRecovery =', 'logger.info("Workspace draft recovery committed"', 'draft recovery callable');
  assert.match(callable, /requireClassTeacher\(request, classId\)/);
  assert.match(callable, /studentMatchesAssignmentAudience\(\{ assignment, classId \}\)/);
  assert.match(callable, /secureAssignmentMode\(assignment\)/);
  assert.match(callable, /if \(!commit\) \{[\s\S]*committed: false/);
  assert.match(callable, /if \(commit && !previewActionIds\.length\)/);
  assert.match(callable, /String\(gradeData\.classId \|\| ""\) !== classId/);
  assert.match(callable, /No canonical attempt/);
  assert.doesNotMatch(callable, /answerKey:/);
});

test('the post-commit path refreshes the report and preserves unresolved proposals', () => {
  const commit = region(panel, 'const commitDrafts', 'const affectedStudents', 'draft commit handler');
  assert.match(commit, /filter\(\(proposal\) => proposal\.outcome\.disposition !== 'accepted'\)/);
  assert.match(commit, /await loadReport\(\)/);
  assert.match(panel, /Accepted \{commitSummary\.accepted\}/);
  assert.match(panel, /Failed\/retryable/);
});

