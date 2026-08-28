import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const lifecycle = fs.readFileSync('src/assignmentLifecycle.js', 'utf8');
const destinations = fs.readFileSync('src/assignmentDestinations.js', 'utf8');
const functions = fs.readFileSync('functions/index.js', 'utf8');
const preflight = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');

test('student assignment audience is class-ID only', () => {
  const start = lifecycle.indexOf('export const assignmentIsForStudent');
  const end = lifecycle.indexOf('const scopedOverride', start);
  const block = lifecycle.slice(start, end);
  assert.match(block, /assignedClassIds/);
  assert.doesNotMatch(block, /assignedClassPeriods|assignedPeriods|classPeriod.*includes/);
});

test('assignment creation mode and destinations are class-ID authoritative', () => {
  assert.match(destinations, /resolveCreationMode = \(\{ assignedClassIds = \[\] \}/);
  assert.match(destinations, /buildDestinationGroups = \(\{ assignedClassIds = \[\], classes = \[\] \}/);
  assert.doesNotMatch(destinations, /buildDestinationGroups = \(\{ assignedClassPeriods/);
});

test('server Classroom and assignment authorization never falls back to period audience', () => {
  const audienceStart = functions.indexOf('const assignmentAudience');
  const audienceEnd = functions.indexOf('async function assertTeacherMayManageAssignment', audienceStart);
  const audienceBlock = functions.slice(audienceStart, audienceEnd);
  assert.match(audienceBlock, /classIds/);
  assert.doesNotMatch(audienceBlock, /classPeriods|mappedPeriod/);

  const publishStart = functions.indexOf('const mappedClassId');
  const publishBlock = functions.slice(publishStart, publishStart + 600);
  assert.match(publishBlock, /audience\.classIds\.includes\(mappedClassId\)/);
  assert.doesNotMatch(publishBlock, /mappedPeriod|audience\.classPeriods/);
});

test('teacher assignment UI has no period-only audience fallback', () => {
  assert.doesNotMatch(preflight, /classPeriods\.map\(\(period\) => \(\{ classId: null/);
  assert.doesNotMatch(app, /buildDestinationGroups\(\{ assignedClassPeriods/);
  assert.doesNotMatch(app, /else config\.overridesByClassPeriod/);
  assert.doesNotMatch(app, /warmup\.closedByClassPeriod\s*=/);
  assert.doesNotMatch(app, /dol\.earlyUnlocks\s*=/);
});

console.log('assignmentClassIdAudienceWiring.test.mjs: all assertions passed');
