import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Live Class exposes teacher-confirmed intervention actions rather than automatic plan changes', () => {
  const live = read('src/components/teacher/LiveClassMonitor.jsx');
  assert.match(live, /Watch Practice/);
  assert.match(live, /Adjust Path/);
  assert.match(live, /Use this move/);
  assert.match(live, /coachingSuggestion/);
  assert.match(live, /onOpenWeeklyPath/);
  assert.match(live, /Small-group candidate/);
  assert.match(live, /Confirm off-task/);
  assert.match(live, /Parent follow-up/);
  assert.match(live, /Log integrity review/);
  assert.match(live, /Dismiss pattern/);
  assert.match(live, /This is not a cheating finding/);
});

test('teacher home scopes Live Class to the actual in-session class id', () => {
  const home = read('src/TeacherHome.jsx');
  assert.match(home, /activeClassId=\{classIdInSession\}/);
});

test('teacher home exposes the unified support dashboard', () => {
  const home = read('src/TeacherHome.jsx');
  const dashboard = read('src/components/teacher/StudentSupportDashboard.jsx');
  assert.match(home, /StudentSupportDashboard/);
  assert.match(dashboard, /Watch Practice/);
  assert.match(dashboard, /Suggested Small Groups/);
  assert.match(dashboard, /Parent Follow-Up/);
  assert.match(dashboard, /Integrity Review/);
  assert.match(dashboard, /Productivity Review/);
  assert.match(dashboard, /platform telemetry alone can never place a student here/i);
});

test('student profile preserves support-event history separately from objective session summaries', () => {
  const drawer = read('src/components/teacher/StudentProfileDrawer.jsx');
  assert.match(drawer, /Support & intervention history/);
  assert.match(drawer, /Recent class-session summaries/);
  assert.match(drawer, /not behavior or integrity findings/i);
});

test('student clients publish only coarse live integrity/productivity counters', () => {
  const app = read('src/App.jsx');
  const presence = read('src/livePresence.js');
  assert.match(app, /visibilitychange/);
  assert.match(app, /summarizeRapidCorrectness/);
  assert.match(app, /focusLossCount/);
  assert.match(app, /rapidCorrectCount/);
  assert.match(presence, /No URLs, response text, keystrokes, or/);
  assert.doesNotMatch(presence, /activeTabUrl|browserHistory|screenCapture/i);
});

test('live presence payload changes do not delete/recreate the session on every answer', () => {
  const app = read('src/App.jsx');
  assert.match(app, /livePresencePayloadRef/);
  assert.match(app, /Archive live presence only at real assignment session boundaries|IMPORTANT LIFECYCLE BOUNDARY/i);
  assert.match(app, /const publishLatest/);
  assert.match(app, /activeAssignmentData\?\.id/);
});

test('presence deletion archives one compact session summary instead of heartbeat history', () => {
  const functionsIndex = read('functions/index.js');
  const summaryLib = read('functions/lib/studentSessionSummary.js');

  // Lock the deployed trigger path without coupling the test to whitespace,
  // quote style, or whether Firebase trigger options are added later.
  assert.match(functionsIndex, /archiveStudentPresenceSession/);
  assert.match(functionsIndex, /onDocumentDeleted[\s\S]{0,300}presence\/\{studentId\}/);
  assert.match(functionsIndex, /studentSessionSummaries/);
  assert.match(functionsIndex, /studentSessionSummary\.sessionSummaryIdFor/);
  assert.match(functionsIndex, /studentSessionSummary\.buildMergedSessionSummary/);

  // Stable identity and monotonic merging belong to the helper that actually
  // implements them, not to index.js merely because it imports that helper.
  // The behavioral session-summary tests prove the counters are monotonic; this
  // wiring test only proves the trigger calls that helper.
  assert.match(summaryLib, /crypto\.createHash\("sha256"\)/);
  assert.match(summaryLib, /function buildMergedSessionSummary/);
});

test('support history is append-only and session summaries are server-owned in Firestore rules', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/studentSupportEvents\/\{eventId\}/);
  assert.match(rules, /allow update, delete: if false/);
  assert.match(rules, /match \/studentSessionSummaries\/\{summaryId\}/);
  assert.match(rules, /allow create, update, delete: if false/);
  assert.match(rules, /grades\/\$\(request\.resource\.data\.studentId\).*assignedTeacherEmail/s);
});

test('the teacher subscribes to persistent support history and archived session summaries', () => {
  const app = read('src/App.jsx');
  const store = read('src/platform/teacher/studentSupportStore.js');
  assert.match(app, /subscribeStudentSupportEvents/);
  assert.match(app, /subscribeStudentSessionSummaries/);
  assert.match(store, /authorizedTeacherEmails/);
  assert.match(store, /array-contains/);
});


test('student reassignment carries support and session history to the new teacher without rewriting origin', () => {
  const functionsIndex = read('functions/index.js');
  assert.match(functionsIndex, /\["studentSupportEvents", "studentSessionSummaries"\]/);
  assert.match(functionsIndex, /reauthorizeContext\(entry\.data\(\).*classRecord/s);
  const store = read('src/platform/teacher/studentSupportStore.js');
  assert.match(store, /originClassId/);
  assert.match(store, /originTeacherEmail/);
  const summary = read('functions/lib/studentSessionSummary.js');
  assert.match(summary, /previous\.originClassId \|\| classId/);
  assert.match(summary, /previous\.originTeacherEmail \|\| assignedTeacherEmail/);
});

test('student deletion and pre-production reset include the persistent monitoring records', () => {
  const admin = read('functions/lib/admin.js');
  assert.match(admin, /"studentSupportEvents"/);
  assert.match(admin, /"studentSessionSummaries"/);
});

test('recent support/session listeners are bounded and backed by declared Firestore indexes', () => {
  const store = read('src/platform/teacher/studentSupportStore.js');
  const app = read('src/App.jsx');
  const firebase = read('firebase.json');
  const indexes = read('firestore.indexes.json');
  assert.match(store, /limit\(750\)/);
  assert.match(store, /limit\(1000\)/);
  assert.match(store, /orderBy\('createdAt', 'desc'\)/);
  assert.match(store, /orderBy\('endedAt', 'desc'\)/);
  assert.match(store, /where\('classId', '==', classId\)/);
  assert.match(store, /fetchStudentSupportHistory/);
  assert.match(store, /where\('studentId', '==', student\)/);
  assert.match(app, /classIds: classes/);
  assert.match(app, /profileSupportHistory/);
  assert.match(firebase, /firestore\.indexes\.json/);
  assert.match(indexes, /studentSupportEvents/);
  assert.match(indexes, /studentSessionSummaries/);
  assert.match(indexes, /"fieldPath": "classId"/);
  assert.match(indexes, /"fieldPath": "studentId"/);
});
