import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordTeacherDiagnosticOverride,
  teacherMayOverrideDiagnostic,
  triageDiagnostic,
} from '../../src/platform/preflight/assignmentRepairTriage.js';

/*
 * A PLATFORM DEFECT IS NOT A CONTENT JUDGEMENT, WHATEVER REPORTED IT.
 *
 * The triage contract only exercises a platformIssue whose source is already
 * technical ("interaction"), so classifying by source alone passes it. But a
 * platform defect does not always surface through a technical validator: when
 * MathMaster's grader marks correct work wrong, the authored question is fine
 * and the finding arrives from the semantic checker.
 *
 * Classify that by source and it becomes a quality blocker — the one class a
 * teacher may overrule. The teacher, reasonably, believes their question is
 * correct, overrides it, and publishes a question that grades students wrongly.
 * The bug is in MathMaster and now nothing is tracking it.
 *
 * issueKind must outrank source.
 */

const platformDefect = (source, code) => ({
  severity: 'blocking',
  source,
  code,
  message: 'Correct student work is being marked wrong by the grader.',
  questionId: 'q-1',
  sectionId: 'cw',
  issueKind: 'platformIssue',
  componentId: 'stepAlgebra2',
});

test('a platform defect reported by a quality validator is still a technical blocker', () => {
  for (const [source, code] of [
    ['semantic', 'semantic.grading-mismatch'],
    ['alignment', 'alignment.tool-mismatch'],
    ['supportDifferentiation', 'supportDifferentiation.tool-mismatch'],
  ]) {
    const triaged = triageDiagnostic(platformDefect(source, code));
    assert.equal(triaged.triageClass, 'technicalBlocker', `${source} platform defect must not be a quality blocker`);
    assert.equal(triaged.teacherOverrideEligible, false, `${source} platform defect must not be override-eligible`);
    assert.equal(teacherMayOverrideDiagnostic(platformDefect(source, code)), false);
  }
});

test('overriding a platform defect is refused no matter which validator reported it', () => {
  assert.throws(
    () => recordTeacherDiagnosticOverride({ flags: [] }, platformDefect('semantic', 'semantic.grading-mismatch'), {
      reason: 'My question is correct, so this must be a false positive.',
    }),
    /not eligible|platform/i,
    'the teacher is right that the question is correct — and that is exactly why this must stay open against MathMaster',
  );
});

console.log('assignmentRepairTriagePlatformPrecedence.test.mjs: all assertions passed');
