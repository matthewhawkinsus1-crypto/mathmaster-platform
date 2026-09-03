import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');
const panel = fs.readFileSync('src/components/teacher/WeeklyPathGradePanel.jsx', 'utf8');
const control = fs.readFileSync('src/components/teacher/WeeklyPathAutoPublish.jsx', 'utf8');
const deploy = fs.readFileSync('scripts/deploy-assignment-v5-followup.sh', 'utf8');

const blockAfter = (source, marker, length = 2600) => {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} must exist`);
  return source.slice(start, start + length);
};

test('automatic publishing is off until a human turns it on for that class', () => {
  // Deploying this must never retroactively push grades for a class nobody has
  // reviewed, so "enabled" is opt-in per class and the schedule only visits
  // classes that opted in.
  const setter = blockAfter(functionsIndex, 'exports.setWeeklyPathClassroomSync');
  assert.match(setter, /requireClassTeacher\(request, classId\)/);
  assert.match(setter, /enabled = request\.data\?\.enabled === true/);

  const scheduled = blockAfter(functionsIndex, 'exports.publishWeeklyPathGrades', 1200);
  assert.match(scheduled, /WEEKLY_PATH_CLASSROOM_CONFIG\)\.where\("enabled", "==", true\)/);
});

test('the schedule runs after the deadline, not before it', () => {
  // A student finishing at 11pm on the due date must have that count, and a job
  // running before the week is really over publishes a grade the student could
  // still have changed.
  const scheduled = blockAfter(functionsIndex, 'exports.publishWeeklyPathGrades', 700);
  assert.match(scheduled, /schedule: "0 8 \* \* 6"/);
  assert.match(scheduled, /timeZone: "America\/Chicago"/);
  assert.match(scheduled, /invoker: "private"/);
});

test('the job grades the week that ended, using the same weekKeyFor students got', () => {
  // A second definition of the week boundary here would let the job grade a week
  // nobody was ever assigned.
  const scheduled = blockAfter(functionsIndex, 'exports.publishWeeklyPathGrades', 1800);
  assert.match(scheduled, /await import\("\.\/shared\/weeklyPathGrade\.mjs"\)/);
  assert.match(scheduled, /weekKeyFor\(now - 3 \* 24 \* 60 \* 60 \* 1000\)/);
  assert.doesNotMatch(scheduled, /toISOString\(\)\.slice/);
});

test('one broken class or student never costs the others their grade', () => {
  const scheduled = blockAfter(functionsIndex, 'exports.publishWeeklyPathGrades', 2400);
  assert.match(scheduled, /catch \(error\)/);
  assert.match(scheduled, /failed for one class/);

  const sync = fs.readFileSync('functions/lib/weeklyPathSync.js', 'utf8');
  assert.match(sync, /classroom_rejected_the_grade_write/);
});

test('every grade write is preceded by a decision and recorded for idempotency', () => {
  const sync = fs.readFileSync('functions/lib/weeklyPathSync.js', 'utf8');
  const decisionAt = sync.indexOf('weeklyPathPublishDecision(');
  const patchAt = sync.indexOf('await patchGrade(');
  assert.ok(decisionAt >= 0 && patchAt > decisionAt, 'the decision must come before the write');

  // What was published is stored, so a re-run recognises its own last value and
  // can tell it apart from a teacher's edit.
  const runner = blockAfter(functionsIndex, 'async function runWeeklyPathClassroomSync', 3200);
  assert.match(runner, /publishedByStudentId/);
  assert.match(runner, /WEEKLY_PATH_CLASSROOM_SYNCS/);
  assert.match(runner, /dryRun/);
});

test('the teacher can preview the real run before agreeing to it', () => {
  assert.match(control, /runWeeklyPathClassroomSyncNow/);
  assert.match(control, /dryRun: true/);
  assert.match(control, /writes nothing/i);
  assert.match(panel, /<WeeklyPathAutoPublish/);
});

test('the new Classroom functions ship with the focused deploy', () => {
  for (const name of [
    'publishWeeklyPathGrades',
    'runWeeklyPathClassroomSyncNow',
    'setWeeklyPathClassroomSync',
    'getWeeklyPathClassroomSync',
  ]) {
    assert.ok(deploy.includes(name), `${name} must be in the focused deploy`);
  }
});
