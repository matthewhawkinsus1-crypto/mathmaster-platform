import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * WIRING THE REWARDS SYSTEM TOGETHER.
 *
 * Node cannot render the screens, so these hold the connections the rest of
 * the suite cannot see: the callables exist and delegate to the tested store,
 * every reader of a Practice Pass waiver honours an undo, the teacher's grade
 * views pass the waiver through, and the screens are reachable and imported.
 * Each assertion is bound to the region that does the work.
 */

const read = (file) => fs.readFileSync(file, 'utf8');
const index = read('functions/index.js');
const app = read('src/App.jsx');

test('every reward action is a callable that delegates to the one transactional store', () => {
  for (const [callable, storeCall] of [
    ['redeemPracticePass', 'store.redeemPracticePass('],
    ['awardRewardGrant', 'store.awardRewardGrant('],
    ['revokeRewardGrant', 'store.revokeRewardGrant('],
    ['undoPracticePassRedemption', 'store.undoPracticePassRedemption('],
  ]) {
    const body = executableSource(region(index, `exports.${callable} = onCall(`, '\n});', callable));
    assert.ok(body.includes(storeCall), `${callable} delegates to ${storeCall}`);
    assert.match(body, /translateRewardActionError\(error\)/, `${callable} turns store errors into callable errors`);
    assert.doesNotMatch(body, /transaction\.set\(/, `${callable} writes nothing outside the store`);
  }
  // The student identity is the verified token, never the request.
  assert.match(region(index, 'exports.redeemPracticePass = onCall(', '\n});', 'redeem'), /const \{ studentId \} = requireStudent\(request\);[\s\S]*studentId,/);
  // Teacher actions require a verified teacher before anything else.
  const teacherGate = region(index, 'async function rewardTeacher(', '\n}', 'rewardTeacher');
  assert.match(teacherGate, /await requireTeacher\(request\)/);
});

test('the teacher read authorizes before it reads anything about the student', () => {
  const callable = executableSource(region(index, 'exports.getStudentRewards = onCall(', '\n});', 'getStudentRewards'));
  assert.match(callable, /await rewardTeacher\(request\)[\s\S]*store\.loadStudentRewardsForTeacher\(/);
  const body = executableSource(region(read('functions/shared/rewardActionStore.mjs'), 'export async function loadStudentRewardsForTeacher(', '\n}\n', 'teacher read'));
  const authorize = body.indexOf('rosterAuthorization(');
  const firstRewardRead = body.indexOf('db.collection(COLLECTIONS.GRANTS)');
  assert.ok(authorize > 0 && firstRewardRead > authorize, 'authorization first');
});

test('an undone Practice Pass stops excusing Practice in ingestion and in Classroom passback', () => {
  const ingestion = region(index, 'A REDEEMED PRACTICE PASS RETIRES A CREDIT-BEARING PRACTICE RESPONSE', 'const classworkIndices = runtimeIncludedQuestionIndicesForSection', 'ingestion waiver check');
  assert.match(executableSource(ingestion), /if \(rewards\.isActivePracticePassRedemption\(redemptionSnap\.exists \? redemptionSnap\.data\(\) : null\)\)/);
  const passback = region(index, 'A REDEEMED PRACTICE PASS REMOVES PRACTICE FROM THIS SAME DENOMINATOR', 'if (!isTestCycleAssignment && !questionIndices.length) continue;', 'passback waiver check');
  assert.match(executableSource(passback), /if \(rewards\.isActivePracticePassRedemption\(redemptionSnap\.exists \? redemptionSnap\.data\(\) : null\)\)/);
  // Grade Transfer already counted only status === "redeemed".
  assert.match(region(index, 'exports.listGradeTransferState = onCall(', '\n});', 'listGradeTransferState'), /value\.status === "redeemed"/);
});

test('the browser waiver map holds only live waivers; history gets every record', () => {
  const subscription = executableSource(region(read('src/platform/classPointsClient.js'), 'export const subscribeToPracticePassRedemptions', '\n};', 'redemptions subscription'));
  assert.match(subscription, /if \(assignmentId && isActivePracticePassRedemption\(data\)\) byAssignmentId\[assignmentId\] = data;/);
  assert.match(subscription, /onRedemptions\(byAssignmentId, all\)/);
});

test("the teacher's gradebook, Assignment Hub and student drawer all pass the waiver through", () => {
  const gradebookRow = region(app, 'const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const practicePassRedeemed', 'const gradeExplanation', 'gradebook row');
  assert.match(gradebookRow, /calculateGrade\(grades, selectedAssignment, \{ practicePassRedeemed \}\)/);
  assert.match(gradebookRow, /splitGradesBySection\(\{ tracker: grades, assignment: selectedAssignment, practicePassRedeemed \}\)/);
  assert.match(app, /classGradeProgress\(\{ assignment: selectedAssignment,[^\n]*hasPracticePass: gradebookHasPracticePass \}\)/);
  assert.match(app, /import \{ useClassPracticePasses \} from '\.\/platform\/rewards\/useClassPracticePasses\.js';/);

  // Hooks before the early return: a hook after `return null` crashes the
  // drawer the first time it opens.
  const hub = read('src/components/teacher/AssignmentHub.jsx');
  assert.ok(hub.indexOf('useClassPracticePasses(') < hub.indexOf('if (!open || !assignment) return null;'));
  assert.match(region(hub, 'const grades = !classContext', ': null;', 'hub grades'), /hasPracticePass \}\)[\s\S]*hasPracticePass \}\)/);

  const drawer = read('src/components/teacher/StudentProfileDrawer.jsx');
  assert.ok(drawer.indexOf('useStudentRewards(') < drawer.indexOf('if (!open) return null;'));
  assert.match(drawer, /excusedAssignmentIds=\{excusedAssignmentIds\}/);
  assert.match(drawer, /<StudentRewardsPanel /);
  assert.match(read('src/components/teacher/StudentAssignmentsList.jsx'), /practicePassRedeemed: Boolean\(excusedAssignmentIds\?\.has\(assignment\.id\)\)/);
});

test('My Rewards is a student destination with its own screen, imported where it is used', () => {
  const navigate = region(app, 'const navigateStudent = ', 'const openStudentAssignmentResult', 'navigateStudent');
  assert.match(navigate, /STUDENT_DESTINATION\.REWARDS\) return openStudentDashboardMode\('rewards'\)/);
  const branch = region(app, "if (studentDashboardMode === 'rewards') {", "if (studentDashboardMode === 'grades') {", 'rewards branch');
  assert.match(branch, /<StudentRewardsCenter/);
  assert.match(branch, /onUsePracticePass=\{handleUsePracticePass\}/);
  assert.match(branch, /eligibleAssignments=\{studentPracticePassEligibleAssignments\}/);
  assert.match(app, /import StudentRewardsCenter from '\.\/components\/student\/rewards\/StudentRewardsCenter\.jsx';/);
  assert.match(app, /import ChallengeRewardsEarned from '\.\/components\/student\/rewards\/ChallengeRewardsEarned\.jsx';/);
  assert.match(read('src/components/student/rewards/StudentRewardsCenter.jsx'), /current=\{STUDENT_DESTINATION\.REWARDS\}/);
});

test('the reward listeners are scoped to one student and one class, and only after the role gate', () => {
  const effect = region(app, "if (user?.role !== 'student' || !user.id || !user.classId) {", '}, [user?.role, user?.id, user?.classId]);', 'student rewards effect');
  assert.match(effect, /subscribeToStudentRewardInventory\(\{\s*db,\s*studentId: user\.id,\s*classId: user\.classId,/);
  const inventory = executableSource(region(read('src/platform/rewards/rewardsClient.js'), 'export const subscribeToStudentRewardInventory', '\n};', 'inventory'));
  assert.match(inventory, /where\('studentId', '==', student\),\s*where\('classId', '==', cls\),\s*where\('status', '==', 'available'\)/);
  assert.match(inventory, /if \(!db \|\| !student \|\| !cls\)/, 'no identity, no query');
});

test('a finished Live Challenge shows its rewards apart from placement, through a slot', () => {
  const student = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
  const finished = region(student, "{room.status === 'finished' && (", "{room.status === 'cancelled' && (", 'finished view');
  assert.match(finished, /renderMatchRewards && invite\?\.roomId \? renderMatchRewards\(invite\.roomId\) : null/);
  assert.match(region(app, '<LiveChallengeStudent', '/>\n          </Suspense>', 'student challenge mount'), /renderMatchRewards=\{\(roomId\) => \(\s*<ChallengeRewardsEarned/);
});

test("the teacher's reward choice reaches createLiveChallenge as a validated policy", () => {
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  // Every create — a bank game's and a Graph Feature Rush's — carries it.
  const creates = [...teacher.matchAll(/created = await createLiveChallenge\(\{([\s\S]*?)\n\s*\}\);/g)].map((match) => match[1]);
  assert.ok(creates.length >= 2, 'both create paths are found');
  creates.forEach((create) => assert.match(create, /rewardPolicy: buildChallengeRewardPolicy\(rewardChoice\)/));
  assert.match(teacher, /<ChallengeRewardSettings choice=\{rewardChoice\} onChange=\{setRewardChoice\} \/>/);
});

test('reward delivery records why a whole match gave no rewards', () => {
  const deliver = executableSource(region(index, 'async function deliverLiveChallengeRewardsFromResult(', '\n}', 'deliver'));
  assert.match(deliver, /if \(delivery\?\.status === "skipped" && result\.roomId\)/);
  assert.match(deliver, /\.update\(\{ rewardsSkipReason:/, 'update, never set: a removed result is never recreated');
});
