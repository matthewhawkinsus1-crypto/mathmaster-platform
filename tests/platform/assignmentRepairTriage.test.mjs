import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssignmentRepairTriage,
  buildPlatformBugReproductionFixture,
  isDiagnosticOverridden,
  recordTeacherDiagnosticOverride,
  repairAllSafeTechnicalIssues,
  teacherMayOverrideDiagnostic,
  triageDiagnostic,
} from '../../src/platform/preflight/assignmentRepairTriage.js';
import { addTeacherReviewFlag } from '../../src/platform/preflight/teacherReviewContext.js';

const diagnostic = (overrides = {}) => ({
  severity: 'blocking',
  source: 'semantic',
  code: 'semantic.fixture',
  message: 'Question 1 needs a stronger mathematical requirement.',
  repairRequirement: 'Needs a stronger mathematical requirement.',
  questionId: 'q-1',
  questionNumber: 1,
  sectionId: 'cw',
  fieldPath: 'sections[0].questions[0].prompt',
  componentId: null,
  issueKind: 'assignmentIssue',
  ...overrides,
});

test('triage separates technical blockers, quality blockers, warnings, and platform defects without collapsing issueKind', () => {
  const persistence = triageDiagnostic(diagnostic({ source: 'persistence', code: 'persistence.nested-array' }));
  assert.equal(persistence.triageClass, 'technicalBlocker');
  assert.equal(persistence.issueKind, 'assignmentIssue');
  assert.equal(persistence.teacherOverrideEligible, false);

  const quality = triageDiagnostic(diagnostic({ source: 'semantic', code: 'semantic.rigor' }));
  assert.equal(quality.triageClass, 'qualityBlocker');
  assert.equal(quality.teacherOverrideEligible, true);

  const warning = triageDiagnostic(diagnostic({ severity: 'warning', source: 'alignmentSpecificity', code: 'alignmentSpecificity.detail' }));
  assert.equal(warning.triageClass, 'warning');
  assert.equal(warning.teacherOverrideEligible, false);

  const platform = triageDiagnostic(diagnostic({
    source: 'interaction',
    code: 'interaction.graph-render',
    issueKind: 'platformIssue',
    componentId: 'graphing2',
  }));
  assert.equal(platform.triageClass, 'technicalBlocker');
  assert.equal(platform.issueKind, 'platformIssue');
  assert.equal(platform.teacherOverrideEligible, false, 'a teacher must not bypass a platform defect as a content false positive');

  const summary = buildAssignmentRepairTriage([persistence, quality, warning, platform]);
  assert.deepEqual(summary.summary, {
    technicalBlockers: 2,
    qualityBlockers: 1,
    warnings: 1,
    platformIssues: 1,
    overrideEligible: 1,
  });
});

test('teacher override is limited to blocking quality false positives and survives later teacher flag edits', () => {
  const quality = diagnostic({ source: 'semantic', code: 'semantic.false-positive' });
  const technical = diagnostic({ source: 'persistence', code: 'persistence.real-break' });
  const platform = diagnostic({ source: 'interaction', code: 'interaction.tool-break', issueKind: 'platformIssue', componentId: 'stepAlgebra2' });
  const warning = diagnostic({ severity: 'warning', source: 'semantic', code: 'semantic.warning' });

  assert.equal(teacherMayOverrideDiagnostic(quality), true);
  assert.equal(teacherMayOverrideDiagnostic(technical), false);
  assert.equal(teacherMayOverrideDiagnostic(platform), false);
  assert.equal(teacherMayOverrideDiagnostic(warning), false);

  const context = recordTeacherDiagnosticOverride({ flags: [] }, quality, {
    reason: 'I reviewed this item; the validator is applying the wrong rigor rule to this representation.',
    assignmentRevision: 8,
    nowIso: '2026-09-07T16:00:00.000Z',
  });
  assert.equal(context.diagnosticOverrides.length, 1);
  assert.equal(context.diagnosticOverrides[0].diagnosticCode, 'semantic.false-positive');
  assert.equal(context.diagnosticOverrides[0].questionId, 'q-1');
  assert.equal(context.diagnosticOverrides[0].assignmentRevision, 8);
  assert.equal(isDiagnosticOverridden(context, quality), true);

  assert.throws(() => recordTeacherDiagnosticOverride(context, technical, { reason: 'ignore it' }), /not eligible|quality/i);
  assert.throws(() => recordTeacherDiagnosticOverride(context, platform, { reason: 'ignore it' }), /not eligible|platform/i);
  assert.throws(() => recordTeacherDiagnosticOverride(context, warning, { reason: 'ignore it' }), /not eligible|warning/i);
  assert.throws(() => recordTeacherDiagnosticOverride({ flags: [] }, quality, { reason: '   ' }), /reason/i);

  const withFlag = addTeacherReviewFlag(context, {
    scope: 'question',
    targetId: 'q-1',
    category: 'directions',
    severity: 'needsEditing',
    note: 'Keep the prompt short.',
  }, { flagId: 'flag-after-override', nowIso: '2026-09-07T16:01:00.000Z' });
  assert.equal(withFlag.diagnosticOverrides.length, 1, 'teacher review helpers must preserve diagnostic overrides instead of stripping them');
});

test('Repair All Safe Technical Issues changes only whitelisted mathematically neutral structures', () => {
  const source = {
    schemaVersion: 5,
    assignment: { assignmentId: 'safe-repair', title: 'Safe repair', courseId: 'algebra1' },
    sections: [{
      id: 'cw',
      role: 'classwork',
      questions: [{
        questionId: 'q-1',
        type: 'graphing',
        prompt: 'Use the points.',
        points: [[1, 2], [3, 4]],
        matrix: [[1, 0], [0, 1]],
      }],
    }],
  };

  const result = repairAllSafeTechnicalIssues(source);
  assert.equal(result.changed, true);
  assert.equal(result.repairs.length, 2);
  assert.ok(result.repairs.every((entry) => entry.repairCode === 'persistence.coordinatePairToPointObject'));
  assert.deepEqual(result.assignmentV5.sections[0].questions[0].points, [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  assert.deepEqual(result.assignmentV5.sections[0].questions[0].matrix, [[1, 0], [0, 1]], 'unknown nested arrays/matrices must never be guessed at');
  assert.ok(result.remainingUnsafePaths.some((path) => path.includes('.matrix[')), 'unsafe unknown nested arrays remain blocked for review');

  const cleanSource = structuredClone(source);
  delete cleanSource.sections[0].questions[0].matrix;
  const cleanResult = repairAllSafeTechnicalIssues(cleanSource);
  assert.equal(cleanResult.repairs.length, 2);
  assert.deepEqual(cleanResult.remainingUnsafePaths, []);
});

test('platform bug fixture contains the affected question and reproducible context, never the rest of the assignment', () => {
  const assignmentV5 = {
    schemaVersion: 5,
    assignment: { assignmentId: 'bug-assignment', title: 'Bug fixture', courseId: 'algebra1' },
    sections: [{
      id: 'cw',
      role: 'classwork',
      title: 'Classwork',
      questions: [
        { questionId: 'q-1', type: 'graphing2', prompt: 'Graph y = x + 1.', answer: 'teacher-reviewed' },
        { questionId: 'q-2', type: 'algebra', prompt: 'Solve x + 2 = 5.', answer: '3' },
      ],
    }],
  };

  const fixture = buildPlatformBugReproductionFixture({
    assignmentV5,
    questionId: 'q-1',
    diagnostic: diagnostic({
      source: 'interaction',
      code: 'interaction.graphing2-render',
      issueKind: 'platformIssue',
      componentId: 'graphing2',
      message: 'The authored question is valid but the graphing tool does not render the expected interaction.',
    }),
    platformIssue: {
      classification: 'platformIssue',
      reason: 'The graphing tool drops the draggable point after focus mode opens.',
      suspectedComponent: 'graphing2',
    },
  });

  assert.equal(fixture.fixtureVersion, 1);
  assert.equal(fixture.assignmentContext.assignmentId, 'bug-assignment');
  assert.equal(fixture.section.id, 'cw');
  assert.equal(fixture.question.questionId, 'q-1');
  assert.equal(fixture.issue.componentId, 'graphing2');
  assert.equal(fixture.issue.diagnosticCode, 'interaction.graphing2-render');
  assert.equal(fixture.issue.issueKind, 'platformIssue');
  const serialized = JSON.stringify(fixture);
  assert.match(serialized, /q-1/);
  assert.doesNotMatch(serialized, /q-2/);
  assert.doesNotMatch(serialized, /Solve x \+ 2 = 5/);
});

console.log('assignmentRepairTriage.test.mjs: all assertions passed');
