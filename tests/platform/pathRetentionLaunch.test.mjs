/*
 * RETENTION THAT WORKS (student push D, item 5) — every door, and the map.
 *
 * Four buttons offer a retention check: the weekly Retention slot, the
 * Overview banner, the Overview focus card and the Path map's "Quick retention
 * check" section. Three launched ordinary practice, and the map section was
 * always empty because it read a row flag nothing set. These tests pin that
 * every door launches the two-question check, that the map lists what the
 * scheduler says is due, and that a finished check takes it off (or marks a
 * concern). The rule and the server: pathRetentionCheck.test.mjs. The
 * simulator: pathRetentionSimulator.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PURPOSE } from '../../src/platform/path/recommendationV2.js';
import { chooseWeeklyAlternative } from '../../src/platform/path/weeklyPathChoice.js';
import {
  QUICK_PRACTICE_LAUNCH,
  RETENTION_CHECK_ACTION_LABEL,
  overviewFocus,
  pathCardLaunchOptions,
  weeklySessionLaunchOptions,
} from '../../src/platform/path/pathSessionLaunch.js';
import {
  RETENTION_PROBE,
  resolveWeeklySlotSessionKind,
  retentionCheckOutcome,
} from '../../functions/shared/pathRetentionCheck.mjs';
import { DEFAULT_LIMITS, RETENTION_REASON, buildPathMap } from '../../src/platform/path/pathMap.js';
import { getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph, teksCodeFromSkillId } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';
import { evaluateStudentRetentionSchedule } from '../../src/platform/retention/retentionScheduler.js';
import { buildUnifiedMasteryProfiles, masteryBySkillFromProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { describeRetentionCheckOutcome } from '../../src/platform/retention/retentionCheckPresentation.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T15:00:00Z');
const WEEK = '2026-10-05';

const slot = (n, teks, purpose, extra = {}) => ({
  slot: n,
  weeklySlotKey: `${n}|teks:${teks}|${teks}|${purpose}|course|2|3`,
  skillId: `teks:${teks}`,
  teksCode: teks,
  purpose,
  context: 'course',
  dok: 2,
  difficultyBand: 3,
  ...extra,
});

// --- Every door launches the check --------------------------------------------

test('a weekly Retention card launches the two-question check, even after a swap', () => {
  const retention = slot(2, 'A.2D', PURPOSE.RETENTION, {
    recommendedSkillId: 'teks:A.2D',
    alternatives: [{ skillId: 'teks:A.2E', teksCode: 'A.2E', studentLabel: 'Another', purpose: PURPOSE.RETENTION, context: 'course', dok: 2, difficultyBand: 3 }],
  });
  const options = weeklySessionLaunchOptions(retention, { weekKey: WEEK });
  assert.equal(options.sessionKind, RETENTION_PROBE);
  assert.equal(options.requiredQuestions, 2);
  assert.equal(options.weeklySlotKey, retention.weeklySlotKey, 'the completion must still fill its own slot');
  assert.equal(options.weekKey, WEEK);
  assert.equal(options.weeklyPurpose, PURPOSE.RETENTION);
  assert.equal(options.framework, null);

  const swapped = chooseWeeklyAlternative(retention, 'teks:A.2E');
  assert.equal(swapped.teksCode, 'A.2E');
  const swappedOptions = weeklySessionLaunchOptions(swapped, { weekKey: WEEK });
  assert.equal(swappedOptions.sessionKind, RETENTION_PROBE, 'a swapped Retention slot is still a retention check');
  assert.equal(swappedOptions.weeklySlotKey, retention.weeklySlotKey);
  assert.equal(swappedOptions.chosenSkillId, 'teks:A.2E');
});

test('every other weekly card stays ordinary practice, and the server never refuses what the client asks for', () => {
  const current = weeklySessionLaunchOptions(slot(1, 'A.5A', PURPOSE.CURRENT_LEARNING), { weekKey: WEEK });
  assert.equal(current.sessionKind, 'practice');
  assert.equal('requiredQuestions' in current, false, 'practice keeps the default five-question session');
  const transfer = weeklySessionLaunchOptions(slot(3, 'A.5A', PURPOSE.TRANSFER, { context: 'act' }), { weekKey: WEEK });
  assert.deepEqual([transfer.sessionKind, transfer.framework], ['practice', 'act']);

  for (const purpose of Object.values(PURPOSE)) {
    const asked = weeklySessionLaunchOptions(slot(1, 'A.5A', purpose), { weekKey: WEEK });
    const server = resolveWeeklySlotSessionKind({ slotPurpose: purpose, requestedSessionKind: asked.sessionKind });
    assert.equal(server.ok, true, `the server would refuse the ${purpose} card's own launch`);
    assert.equal(server.sessionKind, asked.sessionKind, `client and server disagree about a ${purpose} slot`);
  }
  assert.equal(weeklySessionLaunchOptions(null), null);
});

test('the map card, the banner and the Overview focus all launch the same check', () => {
  assert.deepEqual(pathCardLaunchOptions({ isRetentionCheck: true, status: 'mastered' }), { sessionKind: RETENTION_PROBE, requiredQuestions: 2 });
  assert.deepEqual(pathCardLaunchOptions({ status: 'mastered' }), { coursePracticeIntent: null }, 'a Mastered card is review practice');

  const due = [{ teksCode: 'A.2D', priority: 3 }, { teksCode: 'A.2E', priority: 3 }];
  const focus = overviewFocus({ pendingProbes: due, recommendedTeks: 'A.5A' });
  assert.equal(focus.teksCode, 'A.2D', 'the focus names the check the banner names');
  assert.equal(focus.isRetentionCheck, true);
  assert.deepEqual(focus.launch, { sessionKind: RETENTION_PROBE, requiredQuestions: 2 },
    'the focus button used to start five questions of practice on the check it headlined');
  assert.equal(focus.buttonLabel, RETENTION_CHECK_ACTION_LABEL);
  assert.equal(overviewFocus({ pendingProbes: [{ teksCode: 'A.2D', priority: 1 }] }).concern, true);

  const practice = overviewFocus({ pendingProbes: [], recommendedTeks: 'A.5A' });
  assert.deepEqual([practice.teksCode, practice.isRetentionCheck], ['A.5A', false]);
  assert.deepEqual(practice.launch, { ...QUICK_PRACTICE_LAUNCH });
  assert.equal(overviewFocus({ pendingProbes: [], recommendedTeks: null }), null);
});

test('the screens launch through those helpers, and import them', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  const weekly = region(app, 'const startWeeklySession = (session) => {', '\n  };', 'startWeeklySession');
  assert.match(weekly, /startSession\(code, weeklySessionLaunchOptions\(session, \{ weekKey: weeklyGoal\?\.weekKey \|\| null \}\)\);/);
  assert.match(app, /import \{ pathCardLaunchOptions, weeklySessionLaunchOptions \} from '\.\.\/\.\.\/platform\/path\/pathSessionLaunch\.js';/);
  assert.match(region(app, 'onChooseSkill={(card) =>', '\n', 'map card launch'), /startSession\(code, pathCardLaunchOptions\(card\)\)/);
  // startSession carries the kind and the two-question count to the session.
  const startSession = region(app, 'const startSession = (teksCode, options = {}) => {', '\n  };', 'startSession');
  assert.match(startSession, /sessionKind: options\.sessionKind \|\| 'practice',/);
  assert.match(startSession, /requiredQuestions: options\.requiredQuestions \|\| \(options\.sessionKind === 'retentionProbe' \? 2 : 5\),/);

  const dashboard = executableSource(read('src/components/student/MyMathPathDashboard.jsx'));
  assert.match(dashboard, /const focus = useMemo\(\s*\(\) => overviewFocus\(\{ pendingProbes: report\.pendingProbes, recommendedTeks \}\),/);
  assert.match(dashboard, /onClick=\{\(\) => onStartSession\?\.\(focus\.teksCode, focus\.launch\)\}/);
  assert.doesNotMatch(dashboard, /sessionKind: 'practice', requiredQuestions: 5/, 'the focus button must not hardcode practice');
  assert.match(dashboard, /import \{ overviewFocus \} from '\.\.\/\.\.\/platform\/path\/pathSessionLaunch\.js';/);

  const banner = executableSource(read('src/components/student/RetentionQuickCheckBanner.jsx'));
  assert.match(banner, /onLaunchQuickCheck\?\.\(primary\.teksCode, retentionCheckLaunchOptions\(\)\)/);
});

// --- The map lists what the scheduler says is due -----------------------------

const COURSE = 'algebra1';
const skills = getSkillGraph(COURSE);
const optionsFor = (masteryBySkill = {}, windowIndex = 2) => getStudentPathOptions({
  courseId: COURSE,
  masteryBySkill,
  pacing: { windowIndex, windowCount: 6, accelerationRadius: 1 },
  pacingProvider: sequenceProvider({ skills, windowCount: 6 }),
});

// A Mastered profile by the shared rule, last shown `daysAgo` days ago.
const masteredServerProfile = (daysAgo) => ({
  mastery: { estimate: 92, confidence: 'High' },
  accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 },
  dimensions: { eligibleGradeLevelEvents: 6, dokRepresented: [2, 3], lastIndependentSuccessAt: NOW - daysAgo * DAY },
});

const codes = skills.slice(3, 6).map((skill) => teksCodeFromSkillId(skill.skillId));

const studentState = (schedules = {}) => {
  const profiles = buildUnifiedMasteryProfiles({
    serverProfiles: {
      [codes[0]]: masteredServerProfile(20), // due: 20 days since it was shown
      [codes[1]]: masteredServerProfile(3), // not due yet
      [codes[2]]: masteredServerProfile(25), // due
    },
    retentionSchedulesByTEKS: schedules,
  });
  const report = evaluateStudentRetentionSchedule(profiles, schedules, NOW);
  const options = optionsFor(masteryBySkillFromProfiles(profiles));
  return { profiles, report, options, map: buildPathMap(options, { retentionDue: report.pendingProbes }) };
};

test('the map lists the scheduler\'s due checks, as checks, and nothing that is not due', () => {
  const { report, map } = studentState();
  assert.deepEqual(report.pendingProbes.map((probe) => probe.teksCode).sort(), [codes[0], codes[2]].sort());
  assert.deepEqual(map.retentionDue.map((node) => node.code).sort(), [codes[0], codes[2]].sort(),
    'the section lists exactly what the banner says is due');
  map.retentionDue.forEach((node) => {
    assert.equal(node.isRetentionCheck, true);
    assert.equal(node.selectable, true, 'a retention check the student cannot start is not a check');
    assert.equal(node.statusLabel, 'Quick retention check');
    assert.equal(node.reason, RETENTION_REASON.due);
    assert.equal(node.actionLabel, RETENTION_CHECK_ACTION_LABEL);
    assert.deepEqual(pathCardLaunchOptions({ ...node }), { sessionKind: RETENTION_PROBE, requiredQuestions: 2 });
  });

  // The old bug, kept visible: with nothing passed in, the section is empty.
  assert.deepEqual(buildPathMap(studentState().options).retentionDue, []);
});

test('concerns come first, the section is short, unknown skills are skipped, and coverage can close the door', () => {
  const { options } = studentState();
  const probes = [
    { teksCode: codes[0], priority: 3 },
    { teksCode: 'A.99Z', priority: 1 },
    { teksCode: `texas:${codes[2]}`, priority: 1 },
    { teksCode: codes[1], priority: 2 },
  ];
  const map = buildPathMap(options, { retentionDue: probes });
  assert.equal(map.retentionDue.length, DEFAULT_LIMITS.retention);
  assert.deepEqual(map.retentionDue.map((node) => node.code), [codes[0], codes[2]],
    'the scheduler\'s order is kept; a skill this course does not know is skipped');
  assert.equal(map.retentionDue[1].reason, RETENTION_REASON.concern);
  assert.equal(map.retentionDue[1].retentionConcern, true);

  const closed = buildPathMap(options, { retentionDue: probes, isCovered: () => false });
  closed.retentionDue.forEach((node) => {
    assert.equal(node.selectable, false);
    assert.equal(node.contentPending, true);
  });
});

test('a check on a skill the class has not reached is still a door, not a calendar lock', () => {
  const options = optionsFor({}, 0);
  const future = options.future[0];
  assert.ok(future, 'this fixture must produce future work');
  const map = buildPathMap(options, { retentionDue: [{ teksCode: teksCodeFromSkillId(future.skillId), priority: 3 }] });
  assert.equal(map.retentionDue.length, 1);
  assert.equal(map.retentionDue[0].selectable, true);
  assert.equal(map.retentionDue[0].blockedBy, null, 'it must not say "your class reaches this later"');
  assert.equal(buildPathMap({}, { retentionDue: [{ teksCode: codes[0] }] }).isEmpty, true);

  // A student whose only open work is a due check has something to do: the
  // map must draw it rather than say "Nothing is open on your path".
  const onlyMastered = { courseId: COURSE, mastered: studentState().options.mastered };
  assert.equal(buildPathMap(onlyMastered).isEmpty, true);
  assert.equal(buildPathMap(onlyMastered, { retentionDue: [{ teksCode: codes[0], priority: 3 }] }).isEmpty, false);
});

test('after a check the map follows the moved schedule: a pass clears it, a miss keeps it as a concern', () => {
  const before = studentState();
  const checked = codes[0];
  assert.ok(before.map.retentionDue.some((node) => node.code === checked));

  const passed = retentionCheckOutcome({ teksCode: checked, summary: { completedQuestions: 2, independentSuccesses: 2 }, currentSchedule: {}, now: NOW });
  const afterPass = studentState({ [checked]: passed.schedule });
  assert.equal(afterPass.report.pendingProbes.some((probe) => probe.teksCode === checked), false, 'the banner drops it');
  assert.equal(afterPass.map.retentionDue.some((node) => node.code === checked), false, 'the map drops it');
  assert.ok(afterPass.map.retentionDue.some((node) => node.code === codes[2]), 'the other due check stays');

  const missed = retentionCheckOutcome({ teksCode: checked, summary: { completedQuestions: 2, independentSuccesses: 1 }, currentSchedule: {}, now: NOW });
  const afterMiss = studentState({ [checked]: missed.schedule });
  const probe = afterMiss.report.pendingProbes.find((entry) => entry.teksCode === checked);
  assert.equal(probe?.priority, 1, 'a missed check comes back as a concern');
  assert.equal(afterMiss.map.retentionDue[0].code, checked, 'and leads the section');
  assert.equal(afterMiss.map.retentionDue[0].reason, RETENTION_REASON.concern);
});

test('one retention report feeds the map, the banner and the focus card, and a finished session reloads it', () => {
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  assert.match(app, /const retentionReport = useMemo\(\s*\(\) => evaluateStudentRetentionSchedule\(masteryData\.masteryProfilesByTEKS, masteryData\.retentionSchedulesByTEKS\),/);
  assert.match(app, /import \{ evaluateStudentRetentionSchedule \} from '\.\.\/\.\.\/platform\/retention\/retentionScheduler\.js';/);
  const learningPath = region(app, '<StudentLearningPath', '/>', 'the Path map element');
  assert.match(learningPath, /retentionDue=\{retentionReport\.pendingProbes\}/);
  assert.match(app, /<MyMathPathDashboard [^\n]*retentionReport=\{retentionReport\}/);
  // A finished check reloads the schedules the report is computed from.
  // (The handler may also capture the finished session for the end screen.)
  assert.match(app, /onSessionComplete=\{\([^)]*\) => \{[^}]*setWeeklyRefreshKey\(\(value\) => value \+ 1\);[^}]*onReload\?\.\(\);[^}]*\}\}/);
  assert.match(region(app, 'const loadState = useCallback(async () => {', '}, [studentId, assignments]);', 'loadState'), /fetchStudentMasteryState\(studentId, \{ assignments \}\)/);

  const path = executableSource(read('src/components/student/StudentLearningPath.jsx'));
  assert.match(region(path, 'const map = useMemo(', '[pathOptions, limits, isCovered, retentionDue]', 'the map memo'), /\{ retentionDue \}/);
  assert.match(region(path, 'const choose = onChooseSkill ?', ') : null;', 'the card choice'), /isRetentionCheck: Boolean\(node\.isRetentionCheck\)/);
  assert.match(path, /buttonLabel: node\.actionLabel/, 'a retention card says what it starts, not a practice Level');

  const dashboard = executableSource(read('src/components/student/MyMathPathDashboard.jsx'));
  assert.match(dashboard, /\(\) => retentionReport \|\| evaluateStudentRetentionSchedule\(masteryProfilesByTEKS, retentionSchedulesByTEKS\)/);
  assert.match(dashboard, /<RetentionQuickCheckBanner pendingProbes=\{report\.pendingProbes\}/);
});

// --- A finished check says what it showed ---------------------------------

test('the verdict is shown only once the check is over', () => {
  const finished = { sessionKind: RETENTION_PROBE, status: 'completed', retentionOutcome: 'passed' };
  assert.equal(describeRetentionCheckOutcome(finished).passed, true);
  assert.match(describeRetentionCheckOutcome(finished).headline, /Still with you/);
  assert.equal(describeRetentionCheckOutcome({ ...finished, retentionOutcome: 'failed' }).passed, false);
  assert.equal(describeRetentionCheckOutcome({ ...finished, status: 'active' }), null,
    'nothing is said about the check while a question can still be answered');
  assert.equal(describeRetentionCheckOutcome({ ...finished, sessionKind: 'practice' }), null);

  const container = executableSource(read('src/components/student/MyMathPathProductionContainer.jsx'));
  assert.match(container, /const retentionVerdict = paused \? null : describeRetentionCheckOutcome\(session\);/);
  assert.match(container, /import \{ describeRetentionCheckOutcome \} from '\.\.\/\.\.\/platform\/retention\/retentionCheckPresentation\.js';/);
  assert.match(container, /\{retentionVerdict && \(/);
});
