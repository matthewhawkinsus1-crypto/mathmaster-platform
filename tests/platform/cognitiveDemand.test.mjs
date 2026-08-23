// "DO NOT DIAGNOSE FROM TINY SAMPLES. ALWAYS EXPOSE EVIDENCE CONFIDENCE."
//
// A grid of twelve accuracy figures invites a teacher to find a pattern in
// noise, and it does so most convincingly in exactly the cells that have the
// least behind them. These tests pin the two defences: every cell carries the
// evidence it rests on, and the narrative findings fire only where that
// evidence supports them.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIDENCE, DEMAND_THRESHOLDS,
  classDemandProfile, classDifficultyProfile, demandFindings,
} from '../../src/platform/teacher/cognitiveDemand.js';

const studentWith = (id, dokProfile, byBand = {}) => ({ id, dokProfile, byBand });

const build = (entries) => ({
  students: entries.map((entry) => ({ id: entry.id })),
  profilesByStudentId: Object.fromEntries(entries.map((entry) => [entry.id, {
    dokProfile: entry.dokProfile || {},
    difficultyProfile: { byBand: entry.byBand || {} },
  }])),
});

const spread = (count, perStudent) => Array.from({ length: count }, (unused, index) => ({
  id: `s${index}`, ...perStudent,
}));

// --- confidence is never implicit ----------------------------------------------

test('a cell nobody has attempted is returned, not omitted', () => {
  // The most valuable and most easily hidden finding. A class cannot be weak at
  // reasoning it has never been asked for, and an absence is invisible in any
  // representation that only draws what exists.
  const demand = classDemandProfile(build(spread(6, { dokProfile: { 1: { attempts: 8, accuracy: 0.9 } } })));
  assert.equal(demand.length, 3, 'DOK 1-3 always present');
  const dok3 = demand.find((cell) => cell.dok === 3);
  assert.equal(dok3.attempts, 0);
  assert.equal(dok3.confidence, CONFIDENCE.NONE);
});

test('a thin cell is marked thin rather than dropped or dressed up as a result', () => {
  const demand = classDemandProfile(build([
    { id: 'a', dokProfile: { 2: { attempts: 3, accuracy: 0 } } },
    { id: 'b', dokProfile: { 2: { attempts: 2, accuracy: 0 } } },
  ]));
  const dok2 = demand.find((cell) => cell.dok === 2);
  assert.equal(dok2.attempts, 5);
  assert.equal(dok2.confidence, CONFIDENCE.THIN);
  assert.equal(dok2.accuracy, 0, 'the number is still shown — hiding it implies nothing is there');
});

test('plenty of attempts from too few students is still thin', () => {
  // 40 attempts from two children is one child's bad afternoon twice over.
  const demand = classDemandProfile(build([
    { id: 'a', dokProfile: { 2: { attempts: 20, accuracy: 0.2 } } },
    { id: 'b', dokProfile: { 2: { attempts: 20, accuracy: 0.2 } } },
  ]));
  assert.equal(demand.find((cell) => cell.dok === 2).confidence, CONFIDENCE.THIN);
});

test('enough attempts across enough students is adequate', () => {
  const demand = classDemandProfile(build(spread(8, { dokProfile: { 2: { attempts: 6, accuracy: 0.5 } } })));
  const dok2 = demand.find((cell) => cell.dok === 2);
  assert.ok(dok2.attempts >= DEMAND_THRESHOLDS.minAttempts);
  assert.ok(dok2.students >= DEMAND_THRESHOLDS.minStudents);
  assert.equal(dok2.confidence, CONFIDENCE.ADEQUATE);
});

test('accuracy is weighted by attempts, not averaged across students', () => {
  // A student who answered twenty questions and one who answered two are not
  // equal witnesses, and a mean of means would treat them as such.
  const demand = classDemandProfile(build([
    ...spread(5, { dokProfile: { 1: { attempts: 10, accuracy: 1 } } }),
    { id: 'z', dokProfile: { 1: { attempts: 2, accuracy: 0 } } },
  ]));
  const dok1 = demand.find((cell) => cell.dok === 1);
  assert.equal(dok1.attempts, 52);
  assert.ok(dok1.accuracy > 0.9, 'the two-question outlier does not drag it to 0.83');
});

// --- the findings, and the silence between them --------------------------------

test('no finding is asserted from thin evidence', () => {
  const entries = [
    { id: 'a', dokProfile: { 1: { attempts: 4, accuracy: 1 }, 2: { attempts: 4, accuracy: 0 } } },
    { id: 'b', dokProfile: { 1: { attempts: 4, accuracy: 1 }, 2: { attempts: 4, accuracy: 0 } } },
  ];
  const demand = classDemandProfile(build(entries));
  const findings = demandFindings({ demand, difficulty: [] });
  assert.ok(!findings.some((finding) => finding.kind === 'reasoningGap'),
    'a perfect-looking pattern across two students is not a class finding');
  assert.ok(findings.some((finding) => finding.kind === 'thinEvidence'), 'but the thinness is reported');
});

test('"never asked" is reported as an assignment-design finding, not a student one', () => {
  const demand = classDemandProfile(build(spread(8, { dokProfile: { 1: { attempts: 6, accuracy: 0.9 } } })));
  const finding = demandFindings({ demand, difficulty: [] }).find((entry) => entry.kind === 'coverage');
  assert.match(finding.headline, /No DOK 2 or 3 evidence/);
  assert.match(finding.detail, /assignment-design finding, not a student one/);
});

test('class-wide "fluent at procedure, struggling at reasoning" fires only with real evidence', () => {
  const demand = classDemandProfile(build(spread(10, {
    dokProfile: { 1: { attempts: 8, accuracy: 0.92 }, 2: { attempts: 8, accuracy: 0.35 }, 3: { attempts: 4, accuracy: 0.3 } },
  })));
  const finding = demandFindings({ demand, difficulty: [] }).find((entry) => entry.kind === 'reasoningGap');
  assert.ok(finding);
  assert.equal(finding.confidence, CONFIDENCE.ADEQUATE);
  assert.match(finding.detail, /about how the work is being introduced rather than about the students/);
});

test('the inverted case — easy questions going worse than hard ones — is caught', () => {
  // Rarer, much easier to miss, and it means something completely different.
  const difficulty = classDifficultyProfile(build(spread(10, {
    byBand: {
      1: { attempts: 6, accuracy: 0.4 },
      2: { attempts: 6, accuracy: 0.45 },
      3: { attempts: 6, accuracy: 0.7 },
      4: { attempts: 6, accuracy: 0.72 },
    },
  })));
  const finding = demandFindings({ demand: [], difficulty }).find((entry) => entry.kind === 'foundationDrag');
  assert.ok(finding);
  assert.match(finding.detail, /prerequisite skill rather than the current unit/);
});

test('a class doing fine gets no diagnostic findings at all', () => {
  const demand = classDemandProfile(build(spread(10, {
    dokProfile: { 1: { attempts: 8, accuracy: 0.9 }, 2: { attempts: 8, accuracy: 0.85 }, 3: { attempts: 8, accuracy: 0.8 } },
  })));
  const findings = demandFindings({ demand, difficulty: [] });
  assert.deepEqual(findings, []);
});

test('the two axes are never collapsed into one rigor number', () => {
  // Averaging them would destroy the only distinction that tells a teacher
  // which lever to pull. Nothing in the module's output may contain one.
  const demand = classDemandProfile(build(spread(6, { dokProfile: { 2: { attempts: 6, accuracy: 0.5 } } })));
  const difficulty = classDifficultyProfile(build(spread(6, { byBand: { 3: { attempts: 6, accuracy: 0.5 } } })));
  [...demand, ...difficulty].forEach((cell) => {
    assert.ok(!('rigor' in cell) && !('combined' in cell) && !('score' in cell), 'no collapsed score');
  });
  assert.ok(demand.every((cell) => 'dok' in cell && !('band' in cell)));
  assert.ok(difficulty.every((cell) => 'band' in cell && !('dok' in cell)));
});
