/*
 * A CLASS WHOSE WEEK STARTS ON SUNDAY: EVERY SCREEN READS THE WEEK ITS GOALS ARE FROZEN UNDER.
 *
 * A class's stored weekly settings can say its week starts on Sunday (0). The
 * server froze a student's goal under that Sunday week
 * (functions/lib/weeklyPathFreezeInputs.js), and so did the goal the student's
 * screen proposed (buildWeeklyGoal). Four screens read the start as
 * `config.weekStartsOn || 1`, which turned 0 into Monday: the student's card,
 * the teacher's completions, and App's gradebook week and its "week finished"
 * gate looked in the Monday week, found no goal, and showed no work done.
 *
 * Every screen now asks weekStartsOnFor, the server's own reading. No stored
 * week moves: the goals were already keyed by the class's own start, and a
 * class with no stored start still runs Monday to Sunday. (The owner decided on
 * 2026-11-19 to fix this from the next week boundary; with nothing stored under
 * the Monday key, that boundary needs no code.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeeklyGoal, normalizeWeeklyGoalConfig, weekKeyFor, weekStartsOnFor } from '../../src/platform/path/weeklyPathGoal.js';
import { executableSource } from './helpers/sourceContract.mjs';
import { positionalHookSource } from './helpers/appScreens.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(repo, file), 'utf8');

test('a class\'s week start is read the way the server reads it', () => {
  // Stored value → the day its week starts, 0 = Sunday. A stored null or ''
  // is 0 on the server too (Number(null) is 0); the screens must agree with it.
  for (const [stored, day] of [[undefined, 1], [0, 0], ['0', 0], [3, 3], [6, 6], [7, 6], [-1, 0], [2.6, 3], [null, 0], ['', 0], ['Sunday', 1]]) {
    assert.equal(weekStartsOnFor({ weekStartsOn: stored }), day, JSON.stringify(stored));
  }
  assert.equal(weekStartsOnFor(undefined), 1);
  assert.equal(weekStartsOnFor({}), 1, 'no stored start: Monday');
  assert.equal(normalizeWeeklyGoalConfig({ weekStartsOn: 0 }).weekStartsOn, 0);
  assert.equal(normalizeWeeklyGoalConfig({}).weekStartsOn, 1);
  // The server's freeze reads the start with this same rule.
  assert.match(executableSource(read('functions/lib/weeklyPathFreezeInputs.js')),
    /const weekStartsOn = Number\.isFinite\(Number\(config\?\.weekStartsOn\)\)\s*\? Math\.min\(6, Math\.max\(0, Math\.round\(Number\(config\.weekStartsOn\)\)\)\)\s*: 1;/);
});

test('in a Sunday class, every screen reads the week its students\' goals are frozen under', () => {
  const config = { weekStartsOn: 0, sessions: 3 };
  // Sunday, Wednesday and Saturday of one week, at noon in Central time.
  for (const day of ['2026-11-15', '2026-11-18', '2026-11-21']) {
    const now = Date.parse(`${day}T18:00:00Z`);
    const frozen = buildWeeklyGoal({ config, now }).weekKey;
    assert.equal(frozen, '2026-11-15', `${day}: the goal's week starts that Sunday`);
    // App's gradebook week and the teacher's completions.
    assert.equal(weekKeyFor(now, weekStartsOnFor(config)), frozen, day);
    // The student's card: its normalized settings.
    assert.equal(weekKeyFor(now, normalizeWeeklyGoalConfig(config).weekStartsOn), frozen, day);
    // What the four screens used to ask for.
    assert.notEqual(weekKeyFor(now, config.weekStartsOn || 1), frozen, `${day}: the Monday reading missed the goal`);
  }
});

test('a class with no stored start keeps its Monday weeks', () => {
  const now = Date.parse('2026-11-18T18:00:00Z');
  assert.equal(weekKeyFor(now, weekStartsOnFor({})), '2026-11-16');
  assert.equal(buildWeeklyGoal({ config: {}, now }).weekKey, '2026-11-16');
  assert.equal(weekKeyFor(now, weekStartsOnFor({ weekStartsOn: 1 })), '2026-11-16');
});

const sourceFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return sourceFiles(full);
  return /\.(?:js|jsx|mjs)$/.test(name) ? [full] : [];
});

test('no screen turns a stored Sunday into Monday', () => {
  const offenders = sourceFiles(path.join(repo, 'src'))
    .filter((file) => /weekStartsOn\s*\|\|\s*1\b/.test(executableSource(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(repo, file));
  assert.deepEqual(offenders, []);
  // The four places, as each now reads it.
  // The gradebook's week and the kit's reading left App.jsx for its teacher hooks (the App split, slice 4).
  const app = executableSource(positionalHookSource('useTeacherAnalytics'));
  assert.match(app, /return weekKeyFor\(now, weekStartsOnFor\(config\)\);/, 'App: the gradebook\'s week');
  assert.match(app, /weekStartsOn: weekStartsOnFor\(config\),\s*dueDayOfWeek: config\.dueDayOfWeek \?\? 0,/, 'App: whether that week has finished');
  assert.match(executableSource(positionalHookSource('useTeacherLearningPaths')), /weekKeyFor, weekStartsOnFor \},/, 'App hands the teacher kit the reading');
  assert.match(executableSource(read('src/app/teacher/weeklyPathProgress.js')), /const weekStartsOn = path\.weekStartsOnFor\(config\);/, 'the teacher\'s completions');
  assert.match(executableSource(read('src/app/student/useStudentWeeklyPathProgress.js')), /const currentWeekKey = weekKeyFor\(now, settings\.weekStartsOn\);/, 'the student\'s card');
});
