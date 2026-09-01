import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Live Class exposes teacher-confirmed intervention actions rather than automatic plan changes', () => {
  const live = read('src/components/teacher/LiveClassMonitor.jsx');
  assert.match(live, /Watch Practice/);
  assert.match(live, /Small-group candidate/);
  assert.match(live, /Confirm off-task/);
  assert.match(live, /Parent follow-up/);
  assert.match(live, /Log integrity review/);
  assert.match(live, /Dismiss pattern/);
  assert.match(live, /This is not a cheating finding/);
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

test('presence deletion archives one compact session summary instead of heartbeat history', () => {
  const functionsIndex = read('functions/index.js');
  assert.match(functionsIndex, /archiveStudentPresenceSession/);
  assert.match(functionsIndex, /onDocumentDeleted\("presence\/\{studentId\}"\)/);
  assert.match(functionsIndex, /studentSessionSummaries/);
  assert.match(functionsIndex, /crypto\.createHash\("sha256"\)/);
  assert.match(functionsIndex, /Math\.max\(previousActive/);
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
