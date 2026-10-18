import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');

test('signed-in clients subscribe to live class schedule changes', () => {
  const start = app.indexOf('const liveScheduleSessionUid');
  const end = app.indexOf('const fetchCourseProfiles', start);
  assert.ok(start >= 0 && end > start, 'live class schedule subscription block must exist');
  const block = app.slice(start, end);

  assert.match(block, /auth\.status !== 'ready'/);
  assert.match(block, /onSnapshot\(/);
  assert.match(block, /doc\(db, 'settings', 'classSchedule'\)/);
  assert.match(block, /normalizeSchedule\(snapshot\.exists\(\) \? snapshot\.data\(\) : DEFAULT_CLASS_SCHEDULE\)/);
  assert.match(block, /setClassSchedule\(value\)/);
  assert.match(block, /setNow\(Date\.now\(\)\)/);
  assert.match(block, /return unsubscribe/);
});

test('student pack-up message remains final-five-minutes only', () => {
  const start = app.indexOf('const renderStudentPackUpNotice');
  const end = app.indexOf('const renderStudentWarmupBanner', start);
  assert.ok(start >= 0 && end > start, 'student pack-up line block must exist');
  const block = app.slice(start, end);

  assert.match(block, /minutesBeforeEnd: 5/);
  assert.match(block, /if \(packUp\.status !== 'active'\) return null/);
  // NAV-24: a slim line in its own chunk (StudentClassroomNotices.jsx); it still says to pack up.
  assert.match(block, /<Suspense fallback=\{null\}>\s*<PackUpLine unsent=\{Boolean\(logoutRisk\)\} endsAt=\{packUp\.endsAt\} \/>/);
  const notices = fs.readFileSync('src/components/student/StudentClassroomNotices.jsx', 'utf8');
  assert.match(notices, /Pack up and return your device\. The bell is in <DOLCountdown endsAt=\{endsAt\} \/>\./);
  assert.doesNotMatch(block, /Return technology at/i);
  assert.doesNotMatch(block, /scheduled return/i);
  assert.doesNotMatch(block, /pack up early/i);
});

console.log('liveClassScheduleSync.test.mjs: all assertions passed');
