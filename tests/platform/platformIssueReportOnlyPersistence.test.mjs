import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commitStagedQuestionRepairImport,
  stageBatchQuestionRepairImport,
} from '../../src/platform/preflight/questionRepairImport.js';
import {
  applyIncompleteDraftRepairCommit,
  refreshIncompleteDraftPlatformIssues,
} from '../../src/platform/preflight/incompleteAssignmentDraft.js';
import { buildAssignmentRepairCenterModel } from '../../src/platform/preflight/assignmentRepairCenterModel.js';
import { RUNTIME_REPAIR_KEYS } from '../../src/platform/assignments/assignmentRuntimeRepair.js';

const assignment = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'platform-report-fixture',
    title: 'Platform report fixture',
    courseId: 'algebra1',
  },
  sections: [{
    id: 'cw',
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      questionId: 'q1',
      type: 'relationshipModel',
      prompt: 'Classify the relationship and state the domain.',
      studentActions: ['classifyContinuity', 'stateDomain'],
      recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
      alignments: [{ framework: 'teks', code: 'A.2A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  }],
};

const platformIssue = {
  questionId: 'q1',
  classification: 'platformIssue',
  suspectedComponent: 'functionModeling graph stage',
  reason: 'A graph appears even though the authored question does not ask for one.',
  repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
};

const draft = () => ({
  id: 'draft-1',
  schemaVersion: 5,
  assignmentRevision: 4,
  teacherReviewContext: { flags: [{ id: 'teacher-flag', scope: 'question', targetId: 'q1', status: 'open', note: 'Keep the question wording.' }] },
  platformIssues: [],
  authoringDraft: { canonicalJson: JSON.stringify(assignment), sourceSchemaVersion: 5 },
  repairHistory: [{ fromRevision: 2, toRevision: 3, questions: [] }],
});

test('report-only packet persists platform issues without changing canonical JSON or assignment revision', () => {
  const staged = stageBatchQuestionRepairImport({
    assignmentV5: assignment,
    parsedResponse: {
      repairPacketVersion: 1,
      assignmentId: 'platform-report-fixture',
      baseRevision: 4,
      replacements: [],
      platformIssues: [platformIssue],
      unclearIssues: [],
    },
    baseRevision: 4,
    currentRevision: 4,
    teacherReviewContext: draft().teacherReviewContext,
  });

  assert.equal(staged.responseKind, 'reportOnly');
  assert.equal(staged.canCommit, true, 'report-only findings need a save action even though they never replace a question');

  const committed = commitStagedQuestionRepairImport({
    stagedImport: staged,
    teacherReviewContext: draft().teacherReviewContext,
    currentRevision: 4,
    nextRevision: 5,
  });
  assert.equal(committed.kind, 'platformIssueReport');
  assert.equal(committed.committedRevision, 4, 'report-only save must not invent a new assignment content revision');

  const before = draft();
  const saved = applyIncompleteDraftRepairCommit(before, committed, { nowIso: '2026-09-09T22:00:00.000Z' });
  assert.equal(saved.assignmentRevision, 4);
  assert.equal(saved.authoringDraft.canonicalJson, before.authoringDraft.canonicalJson);
  assert.deepEqual(saved.repairHistory, before.repairHistory);
  assert.deepEqual(saved.teacherReviewContext.flags, before.teacherReviewContext.flags);
  assert.equal(saved.platformIssues.length, 1);
  assert.equal(saved.teacherReviewContext.platformIssues.length, 1, 'Repair Center receives the persisted report through its existing review-context boundary');
});

test('persisted open issue is shown as a platform diagnostic and exact runtime repair resolves it', () => {
  const before = draft();
  const saved = applyIncompleteDraftRepairCommit(before, {
    kind: 'platformIssueReport',
    assignmentV5: assignment,
    teacherReviewContext: before.teacherReviewContext,
    committedRevision: 4,
    platformIssues: [platformIssue],
  }, { nowIso: '2026-09-09T22:00:00.000Z' });

  const openModel = buildAssignmentRepairCenterModel({
    assignmentV5: assignment,
    diagnostics: [],
    teacherReviewContext: saved.teacherReviewContext,
  });
  assert.equal(openModel.questions[0].automatedFindings.some((entry) => entry.issueKind === 'platformIssue'), true);

  const resolved = refreshIncompleteDraftPlatformIssues(saved, {
    repairManifest: [{
      questionId: 'q1',
      repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
      runtimeVersion: 1,
      changed: false,
      presentationOnly: true,
    }],
    nowIso: '2026-09-09T22:05:00.000Z',
  });
  assert.equal(resolved.platformIssues[0].status, 'resolvedByPlatformUpdate');
  assert.equal(resolved.assignmentRevision, 4);
  assert.equal(resolved.authoringDraft.canonicalJson, saved.authoringDraft.canonicalJson);

  const resolvedModel = buildAssignmentRepairCenterModel({
    assignmentV5: assignment,
    diagnostics: [],
    teacherReviewContext: resolved.teacherReviewContext,
  });
  const resolvedFinding = resolvedModel.questions[0].automatedFindings.find((entry) => entry.issueKind === 'resolvedPlatformIssue');
  assert.ok(resolvedFinding);
  assert.match(resolvedFinding.message, /Resolved by platform update/i);
});
