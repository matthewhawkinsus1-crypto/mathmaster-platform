import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADEQUATE_ISSUABLE_FAMILIES, COVERAGE_STATE, buildCoverageIndex, coverageKey,
  evaluateSkillCoverage, explainCoverage, findUncoveredStandards, isSkillLaunchable,
  summarizeCoverage,
} from '../../functions/shared/pathCoverage.mjs';

const item = (id, code, { band = 3, active = true } = {}) => ({
  id, alignmentKeys: [`texas:${code}`], difficultyBand: band, active,
});

// `plans` mirror what buildIssuePlan returns for each bank id.
const plans = (map) => Object.fromEntries(Object.entries(map).map(([id, value]) => [
  id,
  value === true ? { issuable: true, reason: null } : { issuable: false, reason: value },
]));

// --- What actually counts as coverage ---------------------------------------------

test('a question counts only when the server could issue AND grade it', () => {
  const coverage = evaluateSkillCoverage({
    displayCode: 'A.5A',
    items: [item('q1', 'A.5A'), item('q2', 'A.5A'), item('q3', 'A.5A')],
    plans: plans({ q1: true, q2: 'no_server_grader_for_this_tool', q3: 'tool_has_no_gradable_answer' }),
  });
  assert.equal(coverage.authoredCount, 3);
  assert.equal(coverage.activeCount, 3);
  assert.equal(coverage.issuableCount, 1, 'matching the TEKS is not enough');
  assert.deepEqual(coverage.unusable.map((entry) => entry.reason), [
    'no_server_grader_for_this_tool', 'tool_has_no_gradable_answer',
  ]);
});

test('an inactive question is not coverage', () => {
  const coverage = evaluateSkillCoverage({
    displayCode: 'A.5A',
    items: [item('q1', 'A.5A', { active: false })],
    plans: plans({ q1: true }),
  });
  assert.equal(coverage.activeCount, 0);
  assert.equal(coverage.issuableCount, 0);
  assert.equal(coverage.studentReady, false);
});

// --- The four states are four different jobs -----------------------------------------

test('nothing authored reads as "no content"', () => {
  const coverage = evaluateSkillCoverage({ displayCode: 'A.12B', items: [], plans: {} });
  assert.equal(coverage.state, COVERAGE_STATE.NONE);
  assert.equal(coverage.studentReady, false);
});

test('authored but ungradeable is its own state, because it needs different work', () => {
  const coverage = evaluateSkillCoverage({
    displayCode: 'A.10A',
    items: [item('q1', 'A.10A'), item('q2', 'A.10A')],
    plans: plans({ q1: 'no_server_grader_for_this_tool', q2: 'no_gradable_definition' }),
  });
  assert.equal(coverage.state, COVERAGE_STATE.AUTHORED_UNUSABLE);
  assert.equal(coverage.studentReady, false, 'a student must not be routed here');
});

test('fewer than a session\'s worth of families is not student-ready', () => {
  // A session is five questions. One family means the same problem five times,
  // which tells the student the bank is empty however green the audit looks.
  const coverage = evaluateSkillCoverage({
    displayCode: 'A.3B',
    items: [item('q1', 'A.3B')],
    plans: plans({ q1: true }),
  });
  assert.equal(coverage.state, COVERAGE_STATE.MINIMAL);
  assert.equal(coverage.studentReady, false, 'partial progress is not a door');

  const four = evaluateSkillCoverage({
    displayCode: 'A.3B',
    items: [2, 3, 4, 5].map((band, index) => item(`q${index}`, 'A.3B', { band })),
    plans: plans({ q0: true, q1: true, q2: true, q3: true }),
  });
  assert.equal(four.issuableCount, 4);
  assert.equal(four.studentReady, false, 'four is still one short of a session');
});

test('"ready" needs a full session of families AND a spread of bands', () => {
  const sameBand = evaluateSkillCoverage({
    displayCode: 'A.2A',
    items: [1, 2, 3, 4, 5].map((n) => item(`q${n}`, 'A.2A', { band: 3 })),
    plans: plans({ q1: true, q2: true, q3: true, q4: true, q5: true }),
  });
  assert.equal(sameBand.issuableCount, ADEQUATE_ISSUABLE_FAMILIES);
  assert.equal(sameBand.state, COVERAGE_STATE.MINIMAL, 'five copies of one band is not variety');

  const spread = evaluateSkillCoverage({
    displayCode: 'A.2A',
    items: [2, 3, 3, 4, 5].map((band, index) => item(`q${index}`, 'A.2A', { band })),
    plans: plans({ q0: true, q1: true, q2: true, q3: true, q4: true }),
  });
  assert.equal(spread.state, COVERAGE_STATE.ADEQUATE);
  assert.deepEqual(spread.byBand, { 2: 1, 3: 2, 4: 1, 5: 1 });
});

// --- The course index -----------------------------------------------------------------

const WHEEL = ['A.5A', 'A.5B', 'A.12A', 'A.12B'];
// A.5A is authored the way the platform target says a standard should be: the
// five slots, across bands. A.5B is partway there. A.12A has content nobody can
// grade. A.12B has nothing at all.
const BANK = [
  item('a1', 'A.5A', { band: 2 }), item('a2', 'A.5A', { band: 3 }), item('a3', 'A.5A', { band: 3 }),
  item('a4', 'A.5A', { band: 4 }), item('a5', 'A.5A', { band: 5 }),
  item('b1', 'A.5B'),
  item('c1', 'A.12A'),
  // Aligned to a standard from an earlier course — a prerequisite the routing
  // engine can send a student into, but not itself on this wheel.
  ...[2, 3, 3, 4, 5].map((band, index) => item(`p${index + 1}`, '8.5I', { band })),
];
const INDEX = buildCoverageIndex({
  courseId: 'algebra1',
  wheelTeks: WHEEL,
  bankItems: BANK,
  plans: plans({
    a1: true, a2: true, a3: true, a4: true, a5: true,
    b1: true,
    c1: 'no_server_grader_for_this_tool',
    p1: true, p2: true, p3: true, p4: true, p5: true,
  }),
});

test('the index answers for every wheel standard, including the empty ones', () => {
  assert.deepEqual(Object.keys(INDEX.skills).sort(), ['A.12A', 'A.12B', 'A.5A', 'A.5B']);
  assert.equal(INDEX.skills['A.5A'].state, COVERAGE_STATE.ADEQUATE);
  assert.equal(INDEX.skills['A.5B'].state, COVERAGE_STATE.MINIMAL);
  assert.equal(INDEX.skills['A.12A'].state, COVERAGE_STATE.AUTHORED_UNUSABLE);
  assert.equal(INDEX.skills['A.12B'].state, COVERAGE_STATE.NONE);
});

test('off-wheel prerequisites get coverage too, because routing can reach them', () => {
  assert.equal(INDEX.skills['8.5I'], undefined);
  assert.equal(INDEX.offWheel['8.5I'].studentReady, true);
  assert.equal(isSkillLaunchable(INDEX, '8.5I'), true);
});

test('the summary counts what a launch decision needs', () => {
  assert.deepEqual(INDEX.summary, {
    wheelSkills: 4,
    studentReady: 1,
    adequate: 1,
    minimal: 1,
    authoredUnusable: 1,
    none: 1,
    fullyCovered: false,
  });
});

test('full coverage is every wheel standard issuable, not most of them', () => {
  const complete = buildCoverageIndex({
    courseId: 'algebra1',
    wheelTeks: ['A.5A'],
    bankItems: [2, 3, 3, 4, 5].map((band, index) => item(`a${index}`, 'A.5A', { band })),
    plans: plans({ a0: true, a1: true, a2: true, a3: true, a4: true }),
  });
  assert.equal(complete.summary.fullyCovered, true);
});

// --- Launchability fails closed ---------------------------------------------------------

test('an unknown skill, or a missing index, is never launchable', () => {
  assert.equal(isSkillLaunchable(INDEX, 'A.99Z'), false);
  assert.equal(isSkillLaunchable(null, 'A.5A'), false, 'no index means nothing is confirmed');
  assert.equal(isSkillLaunchable(INDEX, ''), false);
});

test('authored-but-unusable is not launchable, which is the whole point', () => {
  assert.equal(isSkillLaunchable(INDEX, 'A.12A'), false);
  assert.equal(isSkillLaunchable(INDEX, 'A.12B'), false);
  assert.equal(isSkillLaunchable(INDEX, 'A.5A'), true);
});

test('the canonical and display forms of a code are the same standard', () => {
  assert.equal(coverageKey('texas:A.5A'), 'A.5A');
  assert.equal(coverageKey(' a.5a '), 'A.5A');
  assert.equal(isSkillLaunchable(INDEX, 'texas:A.5A'), true);
});

// --- What a human is told -----------------------------------------------------------------

test('the explanation says what to do, not just that something is wrong', () => {
  assert.match(explainCoverage(INDEX, 'A.12B'), /No My Math Path practice content/);
  assert.match(explainCoverage(INDEX, 'A.12A'), /none can be graded securely/);
  assert.match(explainCoverage(INDEX, 'A.5B'), /1 of the 5 practice question families/);
  assert.match(explainCoverage(INDEX, 'A.5A'), /5 practice question families are ready/);
});

test('the audit reads the way the gap list needs to read', () => {
  const rows = summarizeCoverage(INDEX);
  assert.deepEqual(rows.map((row) => `${row.displayCode} — ${row.issuableCount}`), [
    'A.5A — 5', 'A.5B — 1', 'A.12A — 0', 'A.12B — 0',
  ]);
  const gaps = summarizeCoverage(INDEX, { onlyGaps: true });
  assert.deepEqual(gaps.map((row) => row.displayCode), ['A.5B', 'A.12A', 'A.12B']);
});

test('publish-time checking names the standards an author would leave uncovered', () => {
  assert.deepEqual(findUncoveredStandards(INDEX, ['A.5A', 'A.12A', 'texas:A.12B']), ['A.12A', 'A.12B']);
  assert.deepEqual(findUncoveredStandards(INDEX, ['A.5A']), []);
});
