import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateParentSummaryReport } from '../../src/platform/analytics/parentSummaryGenerator.js';

const simulatorModel = await readFile(new URL('../../src/platform/simulation/simulatedLearner.js', import.meta.url), 'utf8');
const simulatorUi = await readFile(new URL('../../src/components/teacher/PathSimulator.jsx', import.meta.url), 'utf8');

test('Path Simulator consumes the centralized Student Learning Profile and performance badge', () => {
  assert.match(simulatorModel, /buildStudentLearningProfile/);
  assert.match(simulatorModel, /learningProfile/);
  assert.match(simulatorUi, /StudentPerformanceBadge/);
  assert.match(simulatorUi, /evaluated\?\.learningProfile/);
});

test('parent summary uses the actual course and exposes centralized profile dimensions', () => {
  const report = generateParentSummaryReport({
    studentName: 'Sam', courseId: 'grade7',
    masteryProfilesByTEKS: { '7.4A': { mastery: { estimate: 82, status: 'Secure', confidence: 'High' } } },
  });
  assert.match(report.headline, /Grade 7/);
  assert.doesNotMatch(report.headline, /Algebra I/);
  assert.equal(report.courseId, 'grade7');
  assert.ok(report.learningProfile);
  assert.ok(report.dokProfile);
  assert.ok(report.difficultyProfile);
  assert.ok(report.ccmrTransfer);
  assert.ok(Array.isArray(report.gapDiagnostics));
});
