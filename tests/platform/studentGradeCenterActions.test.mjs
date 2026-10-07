import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GRADE_STATUS,
  buildStudentGradeCenter,
  describeGradeMath,
  findGradeCenterEntry,
  resolveGradeRowActions,
  summarizeGradeEntries,
} from '../../src/platform/student/studentGradeCenterModel.js';
import { gradeWeightTotals } from '../../src/platform/teacher/gradeEvidence.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  assignments,
  gradeCenterOptions,
  tracker,
} from './fixtures/studentGradesRaiseFixtures.mjs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const gradeCenterSource = read('../../src/components/student/StudentGradeCenter.jsx');
const breakdownSource = read('../../src/components/student/GradeSectionBreakdown.jsx');

const gradeCenter = buildStudentGradeCenter(gradeCenterOptions());
const entry = (id) => findGradeCenterEntry(gradeCenter, id);

/* 1. WHAT EACH ROW OFFERS IS DECIDED BY THE MODEL. */

test('open, unfinished work gets Start or Continue; finished, closed, excused, pending and locked work does not', () => {
  const expected = {
    'missing-open': { start: 'Start', viewResults: false, practiceNoCredit: false },
    'not-started': { start: 'Start', viewResults: false, practiceNoCredit: false },
    'late-progress': { start: 'Continue', viewResults: true, practiceNoCredit: false },
    'in-progress': { start: 'Continue', viewResults: true, practiceNoCredit: false },
    graded: { start: null, viewResults: true, practiceNoCredit: false },
    pending: { start: null, viewResults: true, practiceNoCredit: false },
    excused: { start: null, viewResults: true, practiceNoCredit: false },
    closed: { start: null, viewResults: true, practiceNoCredit: true },
    locked: { start: null, viewResults: true, practiceNoCredit: false },
  };
  for (const [id, want] of Object.entries(expected)) {
    const { actions } = entry(id);
    assert.deepEqual(
      { start: actions.start?.label ?? null, viewResults: actions.viewResults, practiceNoCredit: actions.practiceNoCredit },
      want,
      id,
    );
  }
});

test('resolveGradeRowActions: each rule, one at a time', () => {
  const open = { isOpen: true, isLate: false, isPracticeOnly: false };
  const late = { isOpen: true, isLate: true, isPracticeOnly: false };
  const closed = { isOpen: false, isPracticeOnly: true };
  const scheduled = { isOpen: false, isScheduled: true, isPracticeOnly: false };
  const none = { attempted: 0, total: 3 };
  const some = { attempted: 1, total: 3 };

  assert.deepEqual(resolveGradeRowActions({ status: GRADE_STATUS.REOPENED, overall: some, lifecycle: late }).start, { label: 'Continue' });
  assert.deepEqual(resolveGradeRowActions({ status: GRADE_STATUS.REOPENED, overall: none, lifecycle: open }).start, { label: 'Start' });
  // Reopened with no evidence still has somewhere to look (the spec's rule
  // hides View Results only on not-started/missing work).
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.REOPENED, overall: none, lifecycle: open }).viewResults, true);
  // Locked by a prerequisite, even while the window is open: no Start.
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.IN_PROGRESS, overall: some, lifecycle: open, locked: true }).start, null);
  // Not open yet.
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.NOT_STARTED, overall: none, lifecycle: scheduled }).start, null);
  // Excused never starts.
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.MISSING, overall: none, lifecycle: late, excused: true }).start, null);
  // Graded and pending work is finished from the student's side.
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.GRADED, overall: some, lifecycle: open }).start, null);
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.PENDING_GRADE, overall: some, lifecycle: open }).start, null);
  // Closed: no Start, results and the no-credit re-try instead.
  const frozen = resolveGradeRowActions({ status: GRADE_STATUS.GRADED, overall: some, lifecycle: closed });
  assert.deepEqual(frozen, { start: null, viewResults: true, practiceNoCredit: true });
  // Closed with nothing recorded still shows results (the "practice only" page).
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.PRACTICE_ONLY, overall: none, lifecycle: closed }).viewResults, true);
  // Missing / not started with evidence of nothing: no View Results.
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.MISSING, overall: none, lifecycle: late }).viewResults, false);
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.NOT_STARTED, overall: none, lifecycle: open }).viewResults, false);
  // Any recorded evidence earns a result page, whatever the status word says.
  assert.equal(resolveGradeRowActions({ status: GRADE_STATUS.MISSING, overall: some, lifecycle: late }).viewResults, true);
});

/* 2. THE GRADE MATH IS THE SUMMARY'S OWN NUMBERS, AND THEY RECONCILE. */

test('"How this grade is figured" prints the summary\'s earned/possible points and its percent, which reconcile', () => {
  const summary = gradeCenter.currentSummary;
  const counted = gradeCenter.entries.filter((item) => item.countsTowardPeriodGrade);
  const earned = counted.reduce((sum, item) => sum + item.weights.earnedWeight, 0);
  const possible = counted.reduce((sum, item) => sum + item.weights.possibleWeight, 0);
  assert.equal(summary.earnedWeight, earned);
  assert.equal(summary.possibleWeight, possible);
  assert.equal(Math.round((summary.earnedWeight / summary.possibleWeight) * 100), summary.score);

  const math = describeGradeMath(summary);
  assert.equal(math.score, summary.score);
  assert.equal(math.headline, `You've earned ${earned} of ${possible} points on counted work = ${summary.score}%.`);
  // The numbers printed reconcile to the printed percent.
  assert.equal(Math.round((Number(math.earnedPoints) / Number(math.possiblePoints)) * 100), summary.score);
});

test('in-progress work is named as counted at its current score', () => {
  const summary = gradeCenter.currentSummary;
  assert.deepEqual(summary.inProgress.map((item) => item.assignmentId).sort(), ['in-progress', 'late-progress']);
  for (const item of summary.inProgress) {
    assert.equal(entry(item.assignmentId).countsTowardPeriodGrade, true);
    assert.equal(item.score, entry(item.assignmentId).displayGrade);
  }
  const line = describeGradeMath(summary).lines.find((text) => /current score/.test(text));
  assert.ok(line, 'the in-progress line is missing');
  assert.match(line, /Distributive Property/);
  assert.match(line, /Graphing Linear Equations/);
  // Graded, finished work is not named as in progress.
  assert.doesNotMatch(line, /Solving One-Step Equations/);
});

test('missing, pending and excused work are named as not counted, with counts', () => {
  const summary = gradeCenter.currentSummary;
  assert.equal(summary.missing, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.excused, 1);
  // locked + not started; nothing else is left out.
  assert.equal(summary.notCountedOther, 2);
  assert.equal(summary.graded + summary.missing + summary.pending + summary.excused + summary.notCountedOther, summary.total);
  const line = describeGradeMath(summary).lines.find((text) => text.startsWith('Not counted'));
  assert.equal(line, 'Not counted in this grade: 1 missing, 1 waiting on your teacher, 1 excused, 2 not started or not open yet. None of these count as a zero.');
});

test('with nothing counted the explanation says so instead of inventing 0 of 0', () => {
  const math = describeGradeMath(summarizeGradeEntries([]));
  assert.equal(math.score, null);
  assert.doesNotMatch(math.headline, /0 of 0|0%/);
});

test('points with a fraction are printed to one decimal place and still reconcile', () => {
  const math = describeGradeMath({ score: 83, earnedWeight: 12.45, possibleWeight: 15, inProgress: [] });
  assert.equal(math.earnedPoints, '12.5');
  assert.equal(Math.round((12.45 / 15) * 100), math.score);
});

/* 3. EACH SECTION'S SHARE OF THE ASSIGNMENT GRADE RECONCILES WITH IT. */

test('section shares add up to exactly the assignment\'s own points and grade', () => {
  for (const id of ['graded', 'late-progress', 'in-progress', 'closed']) {
    const row = entry(id);
    const shares = Object.values(row.sectionShares);
    const possible = shares.reduce((sum, share) => sum + share.possibleWeight, 0);
    const earned = shares.reduce((sum, share) => sum + share.earnedWeight, 0);
    assert.equal(possible, row.weights.possibleWeight, id);
    assert.equal(earned, row.weights.earnedWeight, id);
    assert.equal(Math.round((earned / possible) * 100), row.displayGrade, id);
  }
  // The fixture's question weights: Warm-Up 2, Classwork 3, Practice 2, DOL 3 of 10.
  const shares = entry('graded').sectionShares;
  assert.deepEqual(
    Object.fromEntries(Object.entries(shares).map(([key, share]) => [key, share.sharePercent])),
    { warmup: 20, classwork: 30, practice: 20, dol: 30 },
  );
});

test('section shares come from gradeWeightTotals, including a Practice Pass waiver', () => {
  const assignment = assignments.find((item) => item.id === 'graded');
  const waived = buildStudentGradeCenter(gradeCenterOptions({
    practicePassRedemptionsByAssignment: { graded: { id: 'r1' } },
  }));
  const row = findGradeCenterEntry(waived, 'graded');
  const whole = gradeWeightTotals({ tracker: tracker.graded, assignment, practicePassRedeemed: true });
  assert.equal(row.weights.possibleWeight, whole.possibleWeight);
  // A waived Practice section carries no share of the grade.
  assert.equal(row.sectionShares.practice.possibleWeight, 0);
  const sum = Object.values(row.sectionShares).reduce((total, share) => total + share.possibleWeight, 0);
  assert.equal(sum, whole.possibleWeight);
});

test('shares that would not add up to the grade are withheld rather than shown', () => {
  // A question outside the four lesson sections still counts in the grade, so
  // the four sections' points cannot reach the assignment's total.
  const odd = {
    ...assignments.find((item) => item.id === 'graded'),
    id: 'odd',
    sections: [
      ...assignments.find((item) => item.id === 'graded').sections,
      { id: 'bonus', role: 'review', title: 'Review', questions: [{ id: 'b1' }] },
    ],
  };
  const center = buildStudentGradeCenter(gradeCenterOptions({ assignments: [odd], tracker: { odd: tracker.graded } }));
  const row = findGradeCenterEntry(center, 'odd');
  assert.ok(row.weights.possibleWeight > 0);
  assert.equal(row.sectionShares, null);
});

test('a Test Cycle row, whose grade is not the tracker, shows no section shares', () => {
  assert.equal(entry('cycle').sectionShares, null);
});

test('the model still computes no question weight or credit of its own', () => {
  const source = executableSource(read('../../src/platform/student/studentGradeCenterModel.js'));
  const shares = region(source, 'const sectionWeightShares = ', 'const START_STATUSES', 'sectionWeightShares');
  assert.match(shares, /gradeWeightTotals\(/);
  assert.doesNotMatch(source, /getQuestionCredit|normalizeQuestionWeight|weightedQuestionTotals|questionWeight\b/);
});

/* 4. THE SCREEN DRAWS WHAT THE MODEL DECIDED. */

const gradeRow = region(gradeCenterSource, 'function GradeRow(', 'function PeriodGroup(', 'GradeRow');
const screen = region(gradeCenterSource, 'export default function StudentGradeCenter(', null, 'StudentGradeCenter');

test('GradeRow draws Start, View Results and the no-credit re-try from entry.actions only', () => {
  const code = executableSource(gradeRow);
  // entry.actions, narrowed only by the model's applyTodayToGradeActions (the
  // one "Today" rule, tests/platform/studentVerifyFixes.test.mjs).
  assert.match(code, /const actions = applyTodayToGradeActions\(entry\.actions \|\| \{\}, today\);/);
  assert.match(code, /\{actions\.start && \(/);
  assert.match(code, /onClick=\{pressStart\}[^]*?\{actions\.start\.label\}/);
  const press = region(code, 'const pressStart = () => {', '};', 'pressStart');
  assert.match(press, /onStart\?\.\(entry\.assignmentId\)/);
  assert.match(code, /\{actions\.viewResults && \([^]*?onOpenResult\?\.\(entry\.assignmentId\)[^]*?View Results/);
  assert.match(code, /\{actions\.practiceNoCredit && \([^]*?onPractice\?\.\(entry\.assignmentId\)[^]*?Try it again — no credit/);
  // The row does not re-decide: no status or lifecycle test drives a button.
  assert.doesNotMatch(code, /entry\.practiceAvailable|entry\.status === |lifecycle/);
  // "Practice" alone is never a button label on Grades.
  assert.doesNotMatch(code, />\s*Practice\s*</);
});

test('onStart reaches every row, in the current and past periods', () => {
  assert.match(screen, /onStart = null/);
  const groups = [...screen.matchAll(/<PeriodGroup[^>]*?\/>|<PeriodGroup[\s\S]*?\/>/g)].map((match) => match[0]);
  assert.equal(groups.length, 2);
  for (const group of groups) assert.match(group, /onStart=\{onStart\}/);
  const periodGroup = region(gradeCenterSource, 'function PeriodGroup(', 'export default function StudentGradeCenter(', 'PeriodGroup');
  assert.match(periodGroup, /<GradeRow[\s\S]*?onStart=\{onStart\}[\s\S]*?\/>/);
});

test('Ways to raise your grade renders the list prop and hands the chosen way back', () => {
  const ways = region(gradeCenterSource, 'function WaysToRaise(', 'function GradeRow(', 'WaysToRaise');
  const code = executableSource(ways);
  assert.match(code, /if \(!Array\.isArray\(ways\)\) return null;/);
  assert.match(code, /Ways to raise your grade/);
  assert.match(code, /ways\.map\(\(way\) =>[\s\S]*?onClick=\{\(\) => onWayAction\?\.\(way\)\}/);
  assert.match(code, /minHeight: MIN_TOUCH_TARGET_PX/);
  assert.match(code, /ways\.length === 0 \?/);
  assert.match(screen, /<WaysToRaise ways=\{waysToRaise\} onWayAction=\{onWayAction\} \/>/);
});

test('the grade math is an expandable button under the summary, reading describeGradeMath', () => {
  const math = region(gradeCenterSource, 'function GradeMath(', 'function WaysToRaise(', 'GradeMath');
  const code = executableSource(math);
  assert.match(code, /aria-expanded=\{open\}/);
  assert.match(code, /describeGradeMath\(summary\)/);
  assert.match(code, /How this grade is figured/);
  assert.match(code, /\{open && \(/);
  // No arithmetic of its own: it prints what describeGradeMath returned.
  assert.doesNotMatch(code, /Math\.round|earnedWeight|possibleWeight/);
  const summary = region(gradeCenterSource, 'function PeriodSummary(', 'function GradeMath(', 'PeriodSummary');
  assert.match(summary, /\{!hidden && <GradeMath summary=\{summary\} \/>\}/);
});

test('the What changed panel sits right after the summary and renders nothing when absent', () => {
  assert.match(screen, /whatChangedPanel = null/);
  const order = ['<PeriodSummary', '{whatChangedPanel || null}', '<WaysToRaise', '{currentGroup && ('];
  const positions = order.map((needle) => screen.indexOf(needle));
  positions.forEach((position, index) => assert.notEqual(position, -1, order[index]));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'summary, What changed, ways, then the rows');
});

test('Grades keeps its "← Home" button', () => {
  assert.match(screen, /onClick=\{\(\) => onBackToHome\?\.\(\)\}[\s\S]{0,600}?← Home\s*</);
});

test('the section breakdown prints each section\'s share only from the shares it was handed', () => {
  const code = executableSource(breakdownSource);
  assert.match(code, /shares = null/);
  assert.match(code, /\{shares\[key\]\.sharePercent\}% of this grade/);
  assert.match(code, /!excused && Number\.isFinite\(Number\(shares\?\.\[key\]\?\.sharePercent\)\)/);
  assert.match(gradeRow, /<GradeSectionBreakdown[^>]*shares=\{entry\.sectionShares\}/);
});
