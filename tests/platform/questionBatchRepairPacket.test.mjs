import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyQuestionBatchRepairReplacements,
  buildQuestionBatchRepairPacket,
  buildQuestionBatchRepairRequest,
  parseQuestionBatchRepairResponse,
} from '../../src/platform/contract/questionBatchRepairPacket.js';

const question = (questionId, prompt, answer = '1') => ({
  questionId,
  type: 'algebra',
  prompt,
  answer,
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
});

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'assignment-17',
    title: 'Selected repair fixture',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        question('q-wu-1', 'Warm-up one'),
        question('q-wu-2', 'Warm-up two'),
      ],
    },
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [question('q-cw-1', 'Classwork one')],
    },
  ],
};

const repairCenterModel = {
  questions: [
    {
      questionId: 'q-wu-1',
      questionNumber: 1,
      sectionId: 'warmup',
      sectionRole: 'warmup',
      question: assignmentV5.sections[0].questions[0],
      automatedFindings: [{
        code: 'interaction.tool-intent',
        severity: 'blocking',
        message: 'Question needs a supported student interaction.',
        repairRequirement: 'Choose a supported student interaction.',
        fieldPath: 'sections[0].questions[0].studentActions',
        issueKind: 'assignmentIssue',
        componentId: null,
      }],
      teacherConstraints: [{
        category: 'studentInteraction',
        severity: 'blocking',
        note: 'Keep the graph. Do not turn this into multiple choice.',
        hardConstraint: true,
      }],
    },
    {
      questionId: 'q-wu-2',
      questionNumber: 2,
      sectionId: 'warmup',
      sectionRole: 'warmup',
      question: assignmentV5.sections[0].questions[1],
      automatedFindings: [],
      teacherConstraints: [{
        category: 'directions',
        severity: 'needsEditing',
        note: 'Shorten the direction.',
        hardConstraint: true,
      }],
    },
    {
      questionId: 'q-cw-1',
      questionNumber: 3,
      sectionId: 'classwork',
      sectionRole: 'classwork',
      question: assignmentV5.sections[1].questions[0],
      automatedFindings: [],
      teacherConstraints: [],
    },
  ],
};

test('batch packet contains only selected questions and carries teacher notes as hard constraints', () => {
  const packet = buildQuestionBatchRepairPacket({
    assignmentV5,
    repairCenterModel,
    selectedQuestionIds: ['q-wu-2', 'q-wu-1'],
    assignmentId: 'assignment-17',
    baseRevision: 12,
  });

  assert.equal(packet.repairPacketVersion, 1);
  assert.deepEqual(packet.assignmentContext, {
    assignmentId: 'assignment-17',
    baseRevision: 12,
    schemaVersion: 5,
    title: 'Selected repair fixture',
    courseId: 'algebra1',
  });
  assert.deepEqual(packet.questions.map((entry) => entry.questionId), ['q-wu-2', 'q-wu-1']);
  assert.equal(packet.questions.some((entry) => entry.questionId === 'q-cw-1'), false);
  assert.equal(packet.questions[1].teacherConstraints[0].hardConstraint, true);
  assert.equal(packet.questions[1].teacherConstraints[0].note, 'Keep the graph. Do not turn this into multiple choice.');
  assert.equal(packet.questions[1].automatedFindings[0].repairRequirement, 'Choose a supported student interaction.');
});

test('batch request tells the AI to triage first and never rewrite the full assignment', () => {
  const request = buildQuestionBatchRepairRequest({
    assignmentV5,
    repairCenterModel,
    selectedQuestionIds: ['q-wu-1'],
    assignmentId: 'assignment-17',
    baseRevision: 12,
  });

  assert.match(request, /assignmentIssue/);
  assert.match(request, /platformIssue/);
  assert.match(request, /unclear/);
  assert.match(request, /Do not regenerate or return the full assignment/i);
  assert.match(request, /teacherConstraints/i);
  assert.match(request, /replacements/i);
  assert.match(request, /platformIssues/i);
  assert.match(request, /unclearIssues/i);
  assert.match(request, /"q-wu-1"/);
  assert.doesNotMatch(request, /"q-cw-1"/);
});

test('parser accepts one batch JSON object and rejects replacements for questions that were not selected', () => {
  const good = parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [{
      questionId: 'q-wu-1',
      question: { ...question('q-wu-1', 'Repaired warm-up'), studentActions: ['solveEquation'] },
    }],
    platformIssues: [],
    unclearIssues: [],
  }), {
    expectedAssignmentId: 'assignment-17',
    expectedBaseRevision: 12,
    allowedQuestionIds: ['q-wu-1'],
  });

  assert.equal(good.replacements.length, 1);
  assert.equal(good.replacements[0].question.questionId, 'q-wu-1');

  assert.throws(() => parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [{ questionId: 'q-cw-1', question: question('q-cw-1', 'Unauthorized replacement') }],
    platformIssues: [],
    unclearIssues: [],
  }), {
    expectedAssignmentId: 'assignment-17',
    expectedBaseRevision: 12,
    allowedQuestionIds: ['q-wu-1'],
  }), /not part of this repair request/i);
});

test('parser enforces assignment and base revision so a stale repair cannot overwrite a newer draft', () => {
  const response = JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 11,
    replacements: [],
    platformIssues: [],
    unclearIssues: [],
  });

  assert.throws(() => parseQuestionBatchRepairResponse(response, {
    expectedAssignmentId: 'assignment-17',
    expectedBaseRevision: 12,
    allowedQuestionIds: [],
  }), /revision/i);

  assert.throws(() => parseQuestionBatchRepairResponse(response, {
    expectedAssignmentId: 'another-assignment',
    expectedBaseRevision: 11,
    allowedQuestionIds: [],
  }), /assignment/i);
});

test('replacement import matches immutable question ids and leaves every unselected question unchanged', () => {
  const originalUnselectedWarmup = assignmentV5.sections[0].questions[1];
  const originalUnselectedClasswork = assignmentV5.sections[1].questions[0];
  const parsed = parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [{
      questionId: 'q-wu-1',
      question: question('q-wu-1', 'Repaired warm-up', '2'),
    }],
    platformIssues: [{
      questionId: 'q-wu-2',
      classification: 'platformIssue',
      reason: 'The renderer ignores valid authored state.',
      suspectedComponent: 'graphing2',
    }],
    unclearIssues: [],
  }), {
    expectedAssignmentId: 'assignment-17',
    expectedBaseRevision: 12,
    allowedQuestionIds: ['q-wu-1', 'q-wu-2'],
  });

  const next = applyQuestionBatchRepairReplacements(assignmentV5, parsed);

  assert.equal(next.sections[0].questions[0].prompt, 'Repaired warm-up');
  assert.equal(next.sections[0].questions[0].answer, '2');
  assert.strictEqual(next.sections[0].questions[1], originalUnselectedWarmup);
  assert.strictEqual(next.sections[1].questions[0], originalUnselectedClasswork);
  assert.equal(next.sections[0].questions[1].prompt, 'Warm-up two', 'a platform issue must not mutate the question as a workaround');
});

test('parser rejects duplicate replacements and a replacement whose inner question id does not match', () => {
  assert.throws(() => parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [
      { questionId: 'q-wu-1', question: question('q-wu-1', 'One') },
      { questionId: 'q-wu-1', question: question('q-wu-1', 'Two') },
    ],
  }), { allowedQuestionIds: ['q-wu-1'] }), /duplicate/i);

  assert.throws(() => parseQuestionBatchRepairResponse(JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-17',
    baseRevision: 12,
    replacements: [
      { questionId: 'q-wu-1', question: question('wrong-id', 'Wrong identity') },
    ],
  }), { allowedQuestionIds: ['q-wu-1'] }), /questionId/i);
});

console.log('questionBatchRepairPacket.test.mjs: all assertions passed');
