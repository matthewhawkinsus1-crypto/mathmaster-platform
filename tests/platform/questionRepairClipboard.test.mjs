import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFailedQuestionContextClipboardText,
  buildQuestionJsonClipboardText,
} from '../../src/platform/contract/questionRepairClipboard.js';

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
    title: 'Clipboard fixture',
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
        question('q-wu-1', 'Repair this exact question.'),
        question('q-wu-2', 'Do not copy this other question.'),
      ],
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
      sectionTitle: 'Warm-Up',
      question: assignmentV5.sections[0].questions[0],
      automatedFindings: [{
        code: 'interaction.tool-intent',
        severity: 'blocking',
        source: 'interaction',
        message: 'Question needs a supported student interaction.',
        repairRequirement: 'Choose a supported student interaction.',
        fieldPath: 'sections[0].questions[0].studentActions',
        issueKind: 'assignmentIssue',
        componentId: null,
      }],
      teacherConstraints: [{
        source: 'teacher',
        flagId: 'flag-1',
        scope: 'question',
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
      sectionTitle: 'Warm-Up',
      question: assignmentV5.sections[0].questions[1],
      automatedFindings: [],
      teacherConstraints: [],
    },
  ],
};

test('Copy Question JSON returns the exact selected question and nothing from neighboring questions', () => {
  const copied = buildQuestionJsonClipboardText({
    repairCenterModel,
    questionId: 'q-wu-1',
  });

  assert.deepEqual(JSON.parse(copied), assignmentV5.sections[0].questions[0]);
  assert.match(copied, /Repair this exact question/);
  assert.doesNotMatch(copied, /Do not copy this other question/);
  assert.doesNotMatch(copied, /automatedFindings/);
  assert.doesNotMatch(copied, /teacherConstraints/);
});

test('Copy failed-question context carries exact diagnostics, teacher constraints, and draft identity without the full assignment', () => {
  const copied = buildFailedQuestionContextClipboardText({
    assignmentV5,
    repairCenterModel,
    questionId: 'q-wu-1',
    assignmentId: 'assignment-17',
    baseRevision: 12,
  });
  const parsed = JSON.parse(copied);

  assert.equal(parsed.repairPacketVersion, 1);
  assert.deepEqual(parsed.assignmentContext, {
    assignmentId: 'assignment-17',
    baseRevision: 12,
    schemaVersion: 5,
    title: 'Clipboard fixture',
    courseId: 'algebra1',
  });
  assert.equal(parsed.question.questionId, 'q-wu-1');
  assert.equal(parsed.question.questionNumber, 1);
  assert.equal(parsed.question.sectionId, 'warmup');
  assert.equal(parsed.question.sectionRole, 'warmup');
  assert.deepEqual(parsed.question.question, assignmentV5.sections[0].questions[0]);
  assert.equal(parsed.question.automatedFindings[0].code, 'interaction.tool-intent');
  assert.equal(parsed.question.automatedFindings[0].repairRequirement, 'Choose a supported student interaction.');
  assert.equal(parsed.question.teacherConstraints[0].hardConstraint, true);
  assert.equal(parsed.question.teacherConstraints[0].note, 'Keep the graph. Do not turn this into multiple choice.');

  assert.doesNotMatch(copied, /Do not copy this other question/);
  assert.equal(Object.hasOwn(parsed, 'sections'), false);
  assert.equal(Object.hasOwn(parsed, 'assignmentV5'), false);
});

test('clipboard helpers reject an unknown question id instead of copying empty or misleading context', () => {
  assert.throws(() => buildQuestionJsonClipboardText({
    repairCenterModel,
    questionId: 'q-missing',
  }), /not found/i);

  assert.throws(() => buildFailedQuestionContextClipboardText({
    assignmentV5,
    repairCenterModel,
    questionId: 'q-missing',
    assignmentId: 'assignment-17',
    baseRevision: 12,
  }), /not found/i);
});

test('clipboard output is an immutable text snapshot rather than a live object reference', () => {
  const copied = buildQuestionJsonClipboardText({ repairCenterModel, questionId: 'q-wu-1' });
  const parsed = JSON.parse(copied);
  parsed.prompt = 'Changed only in the pasted copy.';

  assert.equal(assignmentV5.sections[0].questions[0].prompt, 'Repair this exact question.');
  assert.equal(repairCenterModel.questions[0].question.prompt, 'Repair this exact question.');
});
