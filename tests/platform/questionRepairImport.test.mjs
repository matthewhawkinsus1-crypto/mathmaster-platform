import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commitStagedQuestionRepairImport,
  parseSingleQuestionRepairJson,
  stageBatchQuestionRepairImport,
  stageSingleQuestionRepairImport,
} from '../../src/platform/preflight/questionRepairImport.js';
import { parseQuestionBatchRepairResponse } from '../../src/platform/contract/questionBatchRepairPacket.js';
import {
  addTeacherReviewFlag,
  emptyTeacherReviewContext,
} from '../../src/platform/preflight/teacherReviewContext.js';

const question = (questionId, prompt, role, answer = '3') => ({
  questionId,
  type: 'algebra',
  prompt,
  answer,
  activityRole: role,
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
});

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'assignment-17',
    title: 'Repair import fixture',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized', dol: 'shared' },
  },
  sections: [
    {
      id: 'cw',
      role: 'classwork',
      title: 'Classwork',
      questions: [question('q-cw-1', 'Solve x + 2 = 5.', 'classwork')],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [question('q-pr-1', 'Solve x + 4 = 7.', 'practice')],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [question('q-dol-1', 'Solve x + 1 = 4.', 'dol')],
    },
  ],
};

const cloneAssignment = () => structuredClone(assignmentV5);

const teacherContextForClasswork = () => addTeacherReviewFlag(
  emptyTeacherReviewContext(),
  {
    scope: 'question',
    targetId: 'q-cw-1',
    category: 'directions',
    severity: 'needsEditing',
    note: 'Make the direction shorter without changing the skill.',
  },
  {
    flagId: 'flag-cw-1',
    assignmentRevision: 12,
    nowIso: '2026-09-07T14:00:00.000Z',
  },
);

test('single-question paste accepts fenced AI JSON but refuses a different question or a whole assignment', () => {
  const parsed = parseSingleQuestionRepairJson(`\`\`\`json\n${JSON.stringify({
    ...question('q-cw-1', 'Solve the equation.', 'classwork'),
    prompt: 'Solve \\frac{x}{2}=3.',
  })}\n\`\`\`` , { expectedQuestionId: 'q-cw-1' });

  assert.equal(parsed.questionId, 'q-cw-1');
  assert.equal(parsed.prompt, 'Solve \\frac{x}{2}=3.');

  assert.throws(() => parseSingleQuestionRepairJson(JSON.stringify(
    question('q-pr-1', 'Wrong target.', 'practice'),
  ), { expectedQuestionId: 'q-cw-1' }), /questionId/i);

  assert.throws(() => parseSingleQuestionRepairJson(JSON.stringify(assignmentV5), {
    expectedQuestionId: 'q-cw-1',
  }), /one question|single question/i);
});

test('single repair stages only the selected immutable id and produces a before/after diff plus revalidation', () => {
  const source = cloneAssignment();
  const untouchedPractice = source.sections[1].questions[0];
  const untouchedDol = source.sections[2].questions[0];
  const replacement = {
    ...source.sections[0].questions[0],
    prompt: 'Solve x + 2 = 5. Show one algebra step.',
    answer: '3',
  };

  const staged = stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: replacement,
    baseRevision: 12,
    currentRevision: 12,
    teacherReviewContext: emptyTeacherReviewContext(),
  });

  assert.equal(staged.kind, 'singleQuestionRepairImport');
  assert.equal(staged.questionId, 'q-cw-1');
  assert.equal(staged.baseRevision, 12);
  assert.equal(staged.canCommit, true, staged.validation.newBlockingDiagnostics.map((item) => item.message).join('\n'));
  assert.equal(staged.previousQuestion.prompt, 'Solve x + 2 = 5.');
  assert.equal(staged.candidateAssignmentV5.sections[0].questions[0].prompt, 'Solve x + 2 = 5. Show one algebra step.');
  assert.strictEqual(staged.candidateAssignmentV5.sections[1].questions[0], untouchedPractice);
  assert.strictEqual(staged.candidateAssignmentV5.sections[2].questions[0], untouchedDol);
  assert.ok(staged.diff.some((change) => change.path === 'prompt'));
  assert.equal(staged.validation.assignmentIsValid, true);
  assert.equal(staged.validation.newBlockingDiagnostics.length, 0);
  assert.equal(source.sections[0].questions[0].prompt, 'Solve x + 2 = 5.', 'staging must never mutate the live draft');
});

test('staging rejects stale/id-mismatched repair input and blocks a replacement that introduces a new Preflight failure', () => {
  const source = cloneAssignment();

  assert.throws(() => stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: source.sections[0].questions[0],
    baseRevision: 11,
    currentRevision: 12,
  }), /revision|stale/i);

  assert.throws(() => stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: { ...source.sections[0].questions[0], questionId: 'q-pr-1' },
    baseRevision: 12,
    currentRevision: 12,
  }), /questionId/i);

  const unsafe = stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: {
      ...source.sections[0].questions[0],
      xIntercepts: [[3, 0, 99]],
    },
    baseRevision: 12,
    currentRevision: 12,
  });

  assert.equal(unsafe.canCommit, false);
  assert.ok(unsafe.validation.newBlockingDiagnostics.some((item) => /Firestore/i.test(item.message)));
  assert.equal(source.sections[0].questions[0].xIntercepts, undefined);
});

test('teacher-raised repair constraints remain open after import and are marked for explicit verification', () => {
  const source = cloneAssignment();
  const reviewContext = teacherContextForClasswork();
  const staged = stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: {
      ...source.sections[0].questions[0],
      prompt: 'Solve x + 2 = 5.',
    },
    baseRevision: 12,
    currentRevision: 12,
    teacherReviewContext: reviewContext,
  });

  assert.equal(staged.requiresTeacherVerification, true);
  assert.deepEqual(staged.pendingTeacherFlagIds, ['flag-cw-1']);

  const committed = commitStagedQuestionRepairImport({
    stagedImport: staged,
    teacherReviewContext: reviewContext,
    currentRevision: 12,
    nextRevision: 13,
    nowIso: '2026-09-07T15:00:00.000Z',
  });

  const flag = committed.teacherReviewContext.flags.find((entry) => entry.id === 'flag-cw-1');
  assert.equal(flag.status, 'open', 'an AI/import must never resolve a teacher flag for the teacher');
  assert.equal(flag.potentiallyAddressedByRevision, 13);
  assert.equal(committed.requiresTeacherVerification, true);
  assert.deepEqual(committed.pendingTeacherFlagIds, ['flag-cw-1']);
});

test('batch import stages all replacements together, reports each question, and refuses the whole commit if one replacement is unsafe', () => {
  const source = cloneAssignment();
  const response = parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [
      {
        questionId: 'q-cw-1',
        question: { ...source.sections[0].questions[0], prompt: 'Shorter classwork direction.' },
      },
      {
        questionId: 'q-pr-1',
        question: { ...source.sections[1].questions[0], xIntercepts: [[5, 0, 99]] },
      },
    ],
    platformIssues: [{
      questionId: 'q-dol-1',
      classification: 'platformIssue',
      reason: 'Renderer defect.',
      suspectedComponent: 'stepAlgebra2',
    }],
    unclearIssues: [],
  }), {
    expectedAssignmentId: 'assignment-17',
    expectedBaseRevision: 12,
    allowedQuestionIds: ['q-cw-1', 'q-pr-1', 'q-dol-1'],
  });

  const staged = stageBatchQuestionRepairImport({
    assignmentV5: source,
    parsedResponse: response,
    baseRevision: 12,
    currentRevision: 12,
    teacherReviewContext: teacherContextForClasswork(),
  });

  assert.equal(staged.kind, 'batchQuestionRepairImport');
  assert.equal(staged.questionResults.length, 2);
  assert.deepEqual(staged.questionResults.map((result) => result.questionId), ['q-cw-1', 'q-pr-1']);
  assert.equal(staged.questionResults[0].canCommit, true);
  assert.equal(staged.questionResults[1].canCommit, false);
  assert.equal(staged.canCommit, false, 'batch commit is atomic: one unsafe replacement prevents a partial silent import');
  assert.equal(staged.platformIssues.length, 1);
  assert.equal(staged.candidateAssignmentV5.sections[2].questions[0].prompt, 'Solve x + 1 = 4.', 'platform issue reports must never rewrite a question');
  assert.throws(() => commitStagedQuestionRepairImport({
    stagedImport: staged,
    teacherReviewContext: teacherContextForClasswork(),
    currentRevision: 12,
    nextRevision: 13,
  }), /cannot be committed|blocking/i);
});

test('a safe batch commits atomically while preserving every unselected question', () => {
  const source = cloneAssignment();
  const originalDol = source.sections[2].questions[0];
  const response = parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [
      {
        questionId: 'q-cw-1',
        question: { ...source.sections[0].questions[0], prompt: 'Classwork repaired.' },
      },
      {
        questionId: 'q-pr-1',
        question: { ...source.sections[1].questions[0], prompt: 'Practice repaired.' },
      },
    ],
    platformIssues: [],
    unclearIssues: [],
  }), {
    expectedAssignmentId: 'assignment-17',
    expectedBaseRevision: 12,
    allowedQuestionIds: ['q-cw-1', 'q-pr-1'],
  });

  const staged = stageBatchQuestionRepairImport({
    assignmentV5: source,
    parsedResponse: response,
    baseRevision: 12,
    currentRevision: 12,
    teacherReviewContext: emptyTeacherReviewContext(),
  });

  assert.equal(staged.canCommit, true);
  assert.equal(staged.candidateAssignmentV5.sections[0].questions[0].prompt, 'Classwork repaired.');
  assert.equal(staged.candidateAssignmentV5.sections[1].questions[0].prompt, 'Practice repaired.');
  assert.strictEqual(staged.candidateAssignmentV5.sections[2].questions[0], originalDol);

  const committed = commitStagedQuestionRepairImport({
    stagedImport: staged,
    teacherReviewContext: emptyTeacherReviewContext(),
    currentRevision: 12,
    nextRevision: 13,
  });

  assert.equal(committed.assignmentV5.sections[0].questions[0].prompt, 'Classwork repaired.');
  assert.equal(committed.assignmentV5.sections[1].questions[0].prompt, 'Practice repaired.');
  assert.strictEqual(committed.assignmentV5.sections[2].questions[0], originalDol);
});

console.log('questionRepairImport.test.mjs: all assertions passed');
