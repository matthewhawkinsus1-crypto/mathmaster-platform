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
  const start = app.indexOf('const renderStudentPackUpBanner');
  const end = app.indexOf('const renderStudentWarmupBanner', start);
  assert.ok(start >= 0 && end > start, 'student pack-up banner block must exist');
  const block = app.slice(start, end);

  assert.match(block, /minutesBeforeEnd: 5/);
  assert.match(block, /if \(packUp\.status !== 'active'\) return null/);
  assert.match(block, /PACK UP & RETURN TECHNOLOGY/);
  assert.doesNotMatch(block, /Return technology at/i);
  assert.doesNotMatch(block, /scheduled return/i);
  assert.doesNotMatch(block, /pack up early/i);
});

console.log('liveClassScheduleSync.test.mjs: all assertions passed');
