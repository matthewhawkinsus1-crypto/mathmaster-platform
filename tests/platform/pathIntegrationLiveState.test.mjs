/*
 * THREE PLACES THE STUDENT'S SCREENS COULD DISAGREE WITH EACH OTHER (job D
 * integration).
 *
 * 1. A weekly Retention slot appears when a check is due BY THE CLOCK, the way
 *    the Path map and the banner already say it is due. The server only ever
 *    stores "scheduled" or "concern", so the planner, reading the stored
 *    status, never planned a check for a skill that simply came due.
 * 2. My Math Path's wheel, map chips and retention report follow the live
 *    server mastery profile App.jsx subscribes to — the same profile the Path
 *    options already read — instead of a copy fetched once.
 * 3. The server freezes a week once; the client reuses that snapshot for the
 *    rest of the week instead of asking again every time mastery moves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWeeklyPathPlan, evaluatedRetentionSchedules } from '../../src/platform/path/weeklyPathPlan.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { evaluateStudentRetentionSchedule } from '../../src/platform/retention/retentionScheduler.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-07T15:00:00Z');
const DAY = 86400000;

const mastered = (verifiedDaysAgo) => ({
  mastery: { estimate: 92 },
  accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 },
  dimensions: { dokRepresented: [2, 3], lastIndependentSuccessAt: NOW - verifiedDaysAgo * DAY, eligibleGradeLevelEvents: 6 },
});

test('a stored "scheduled" check whose date has passed is due to the planner, as it is to the map', () => {
  const profiles = buildUnifiedMasteryProfiles({ serverProfiles: { 'A.2A': mastered(40) } });
  const stored = { 'A.2A': { status: 'scheduled', lastVerifiedAt: NOW - 40 * DAY, nextCheckDueAt: NOW - 26 * DAY, successfulCheckCount: 0 } };
  const planner = evaluatedRetentionSchedules({ masteryProfilesByTeks: profiles, retentionSchedules: stored, now: NOW });
  const map = evaluateStudentRetentionSchedule(profiles, stored, NOW);
  assert.equal(planner['A.2A'].status, map.schedules['A.2A'].status);
  assert.equal(planner['A.2A'].status, 'overdue');
  assert.ok(map.pendingProbes.some((probe) => probe.teksCode === 'A.2A'), 'the banner names it');
});

test('the weekly plan gets a Retention slot for a mastered skill that came due', () => {
  const server = { 'A.2A': mastered(40) };
  const profiles = buildUnifiedMasteryProfiles({ serverProfiles: server });
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', serverMasteryProfiles: server, nowValue: NOW });
  const stored = { 'A.2A': { status: 'scheduled', lastVerifiedAt: NOW - 40 * DAY, nextCheckDueAt: NOW - 26 * DAY, successfulCheckCount: 0 } };
  const plan = buildWeeklyPathPlan({ options, courseId: 'algebra1', masteryProfilesByTeks: profiles, retentionSchedules: stored, sessions: 4, now: NOW });
  const retention = (plan.sessions || []).filter((session) => session.purpose === 'retention');
  assert.deepEqual(retention.map((session) => session.teksCode), ['A.2A']);

  // A skill verified yesterday is not due, and gets no check.
  const fresh = buildUnifiedMasteryProfiles({ serverProfiles: { 'A.2A': mastered(1) } });
  const notDue = buildWeeklyPathPlan({ options, courseId: 'algebra1', masteryProfilesByTeks: fresh, retentionSchedules: {}, sessions: 4, now: NOW });
  assert.equal((notDue.sessions || []).some((session) => session.purpose === 'retention' && session.teksCode === 'A.2A'), false);
});

test('stored entries the scheduler does not evaluate pass through, keyed by display code', () => {
  const stored = { 'texas:A.5A': { status: 'concern', successfulCheckCount: 1 } };
  const planner = evaluatedRetentionSchedules({ masteryProfilesByTeks: {}, retentionSchedules: stored, now: NOW });
  assert.equal(planner['A.5A'].status, 'concern');
});

test('My Math Path re-derives its mastery from the live server profile App.jsx subscribes to', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  const live = region(app, 'const liveMasteryData = useMemo(() => {', '}, [masteryData, liveServerMasteryProfiles]);', 'live mastery');
  assert.match(live, /buildUnifiedMasteryProfiles\(\{\s*\.\.\.masteryData\.fallbackInputs,\s*serverProfiles: liveServerMasteryProfiles,/);
  assert.match(app, /const liveServerMasteryProfiles = props\.serverMasteryProfiles \|\| null;/);
  assert.match(region(app, '<MyMathPathExperience', '/>', 'the live element'), /masteryData=\{liveMasteryData\}/);
  assert.match(app, /import \{ buildUnifiedMasteryProfiles \} from '..\/..\/platform\/mastery\/unifiedMastery.js';/);
  const service = executableSource(read('src/services/masteryStateService.js'));
  assert.match(service, /fallbackInputs: \{ student, assignments \}/);
  // App.jsx hands the live profile over.
  assert.match(executableSource(read('src/App.jsx')), /serverMasteryProfiles=\{studentServerMasteryProfiles\}/);
});

test('a newer server profile changes what the wheel reads, through the same builder', () => {
  const inputs = { student: { id: 's' }, assignments: [] };
  const before = buildUnifiedMasteryProfiles({ ...inputs, serverProfiles: { 'A.2A': { mastery: { estimate: 60 }, accumulator: { eligibleEvents: 3, effectiveWeight: 3, independentSuccesses: 1 }, dimensions: { dokRepresented: [2] } } } });
  const after = buildUnifiedMasteryProfiles({ ...inputs, serverProfiles: { 'A.2A': mastered(0) } });
  assert.equal(before['A.2A'].mastery.status, 'Developing');
  assert.equal(after['A.2A'].mastery.status, 'Mastered');
});

test('a frozen week is reused for the rest of that week, not re-requested on every mastery change', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  const freeze = region(app, 'const [assignedWeeklyGoal, setAssignedWeeklyGoal]', 'const weeklyGoal = ', 'weekly freeze effect');
  const reuse = freeze.indexOf('if (frozen && frozen.weekKey === proposedWeeklyGoal.weekKey) {');
  const request = freeze.indexOf('resolveWeeklyPathGoalSnapshot(proposedWeeklyGoal)');
  assert.ok(reuse > 0 && request > reuse, 'the cached snapshot is checked before the server is asked');
  assert.match(freeze.slice(reuse, request), /setAssignedWeeklyGoal\(mergeWeeklyGoalSnapshot\(\{ proposed: proposedWeeklyGoal, snapshot: frozen\.snapshot \}\)\);\s*return undefined;/);
  assert.match(freeze, /frozenWeeklySnapshotRef\.current = \{ weekKey: snapshot\.weekKey \|\| proposedWeeklyGoal\.weekKey, snapshot \};/);
});
