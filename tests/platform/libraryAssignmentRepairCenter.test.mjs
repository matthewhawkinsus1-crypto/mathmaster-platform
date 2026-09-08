import test from 'node:test';
import assert from 'node:assert/strict';
import { addTeacherReviewFlag, emptyTeacherReviewContext, resolveTeacherReviewFlag } from '../../src/platform/preflight/teacherReviewContext.js';
import {
  buildAllOpenTeacherFlagRepairRequest,
  getOpenFlaggedQuestionIds,
  parseUnifiedRepairUpload,
} from '../../src/platform/preflight/libraryAssignmentRepairWorkspace.js';

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'library-a1',
    title: 'Library repair acceptance',
    courseId: 'algebra1',
  },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        { questionId: 'q-1', type: 'freeResponse', prompt: 'Question one', answer: '1' },
        { questionId: 'q-2', type: 'freeResponse', prompt: 'Question two', answer: '2' },
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [
        { questionId: 'q-3', type: 'freeResponse', prompt: 'Question three', answer: '3' },
      ],
    },
  ],
};

const addFlag = (context, flag, flagId) => addTeacherReviewFlag(context, flag, {
  flagId,
  assignmentRevision: 4,
  nowIso: '2026-09-07T12:00:00.000Z',
});

test('all-open-flags selection includes inherited assignment/section notes and excludes resolved-only questions', () => {
  let context = emptyTeacherReviewContext();
  context = addFlag(context, {
    scope: 'section',
    targetId: 'warmup',
    note: 'Keep both warm-up questions visual.',
  }, 'section-open');
  context = addFlag(context, {
    scope: 'question',
    targetId: 'q-3',
    note: 'Fix the answer key on question three.',
  }, 'q3-resolved');
  context = resolveTeacherReviewFlag(context, 'q3-resolved', {
    status: 'resolved',
    nowIso: '2026-09-07T12:05:00.000Z',
  });

  assert.deepEqual(getOpenFlaggedQuestionIds({ assignmentV5, teacherReviewContext: context }), ['q-1', 'q-2']);
});

test('Copy AI Fix Package carries exact flagged questions and teacher notes, not the rest of the assignment', () => {
  let context = emptyTeacherReviewContext();
  context = addFlag(context, {
    scope: 'question',
    targetId: 'q-2',
    note: 'Keep this free response; correct only the misleading prompt.',
  }, 'q2-open');

  const result = buildAllOpenTeacherFlagRepairRequest({
    assignmentV5,
    teacherReviewContext: context,
    assignmentId: 'library-a1',
    baseRevision: 4,
  });

  assert.deepEqual(result.questionIds, ['q-2']);
  assert.match(result.request, /Keep this free response; correct only the misleading prompt\./);
  assert.match(result.request, /"questionId": "q-2"/);
  assert.doesNotMatch(result.request, /"questionId": "q-1"/);
  assert.doesNotMatch(result.request, /"questionId": "q-3"/);
});

test('single uploaded repaired-question JSON is normalized into the same atomic batch contract', () => {
  const parsed = parseUnifiedRepairUpload(JSON.stringify({
    questionId: 'q-2',
    type: 'freeResponse',
    prompt: 'Repaired question two',
    answer: '2',
  }), {
    assignmentId: 'library-a1',
    baseRevision: 4,
    allowedQuestionIds: ['q-2'],
  });

  assert.equal(parsed.assignmentId, 'library-a1');
  assert.equal(parsed.baseRevision, 4);
  assert.equal(parsed.replacements.length, 1);
  assert.equal(parsed.replacements[0].questionId, 'q-2');
  assert.equal(parsed.replacements[0].question.prompt, 'Repaired question two');
});

test('batch upload is accepted and an unflagged replacement is refused', () => {
  const batch = JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'library-a1',
    baseRevision: 4,
    replacements: [{
      questionId: 'q-2',
      question: { questionId: 'q-2', type: 'freeResponse', prompt: 'Repaired q2', answer: '2' },
    }],
    platformIssues: [],
    unclearIssues: [],
  });

  const parsed = parseUnifiedRepairUpload(batch, {
    assignmentId: 'library-a1',
    baseRevision: 4,
    allowedQuestionIds: ['q-2'],
  });
  assert.equal(parsed.replacements.length, 1);

  assert.throws(() => parseUnifiedRepairUpload(JSON.stringify({
    questionId: 'q-1',
    type: 'freeResponse',
    prompt: 'Unrequested replacement',
    answer: '1',
  }), {
    assignmentId: 'library-a1',
    baseRevision: 4,
    allowedQuestionIds: ['q-2'],
  }), /not part of this repair request/i);
});

test('repair workspace source exposes the teacher-facing one-click controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const editorSource = await readFile(new URL('../../src/AssignmentQuestionEditor.jsx', import.meta.url), 'utf8');
  const librarySource = await readFile(new URL('../../src/AssignmentLibrary.jsx', import.meta.url), 'utf8');

  assert.match(editorSource, /Copy AI Fix Package/);
  assert.match(editorSource, /Upload AI Repairs/);
  assert.match(editorSource, /type=["']file["']/);
  assert.match(editorSource, /Apply Repairs/);
  assert.match(librarySource, /Repair Center/);
});
