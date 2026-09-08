import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAllOpenTeacherFlagRepairRequest,
  clearPendingRepairUpload,
  getOpenFlaggedQuestionIds,
  parseUnifiedRepairUpload,
  pendingRepairUploadKey,
  queuePendingRepairUpload,
  readPendingRepairUpload,
} from '../../src/platform/preflight/libraryAssignmentRepairWorkspace.js';

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'assignment-1',
    title: 'Repair handoff test',
    courseId: 'algebra1',
  },
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        { questionId: 'q1', type: 'multipleChoice', prompt: 'Question one' },
        { questionId: 'q2', type: 'multipleChoice', prompt: 'Question two' },
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [
        { questionId: 'q3', type: 'multipleChoice', prompt: 'Question three' },
      ],
    },
  ],
};

const context = {
  flags: [
    {
      id: 'flag-section',
      scope: 'section',
      targetId: 'warmup',
      category: 'directions',
      severity: 'needsEditing',
      note: 'Keep both warm-up questions short.',
      status: 'open',
    },
    {
      id: 'flag-q3',
      scope: 'question',
      targetId: 'q3',
      category: 'content',
      severity: 'needsEditing',
      note: 'Repair the graph description.',
      status: 'open',
    },
    {
      id: 'flag-resolved',
      scope: 'question',
      targetId: 'q2',
      category: 'content',
      severity: 'needsEditing',
      note: 'Old issue.',
      status: 'resolved',
    },
  ],
};

test('all flagged question ids expand section-level teacher flags', () => {
  assert.deepEqual(
    getOpenFlaggedQuestionIds({ assignmentV5, teacherReviewContext: context }),
    ['q1', 'q2', 'q3'],
  );
});

test('all-flag AI Fix Package contains every governed question and teacher constraints', () => {
  const built = buildAllOpenTeacherFlagRepairRequest({
    assignmentV5,
    teacherReviewContext: context,
    assignmentId: 'assignment-1',
    baseRevision: 7,
  });

  assert.deepEqual(built.questionIds, ['q1', 'q2', 'q3']);
  assert.match(built.request, /"assignmentId": "assignment-1"/);
  assert.match(built.request, /"baseRevision": 7/);
  assert.match(built.request, /"questionId": "q1"/);
  assert.match(built.request, /"questionId": "q2"/);
  assert.match(built.request, /"questionId": "q3"/);
  assert.match(built.request, /Keep both warm-up questions short\./);
  assert.match(built.request, /Repair the graph description\./);
  assert.doesNotMatch(built.request, /Old issue\./);
});

test('teacher-review upload parser refuses a replacement outside the flagged allow-list', () => {
  const raw = JSON.stringify({
    repairPacketVersion: 1,
    assignmentId: 'assignment-1',
    baseRevision: 7,
    replacements: [
      {
        questionId: 'q3',
        question: { questionId: 'q3', type: 'multipleChoice', prompt: 'Repaired question three' },
      },
    ],
    platformIssues: [],
    unclearIssues: [],
  });

  assert.throws(() => parseUnifiedRepairUpload(raw, {
    assignmentId: 'assignment-1',
    baseRevision: 7,
    allowedQuestionIds: ['q1', 'q2'],
  }), /not part of this repair request/i);
});

test('teacher-review upload handoff is assignment-scoped and can be consumed safely', () => {
  const records = new Map();
  const storage = {
    setItem(key, value) { records.set(key, value); },
    getItem(key) { return records.has(key) ? records.get(key) : null; },
    removeItem(key) { records.delete(key); },
  };
  const rawText = JSON.stringify({ assignmentId: 'assignment-1', baseRevision: 7, replacements: [] });

  const key = queuePendingRepairUpload({ assignmentId: 'assignment-1', rawText, storage });
  assert.equal(key, pendingRepairUploadKey('assignment-1'));
  assert.equal(readPendingRepairUpload({ assignmentId: 'assignment-2', storage }), null);

  const queued = readPendingRepairUpload({ assignmentId: 'assignment-1', storage });
  assert.equal(queued.assignmentId, 'assignment-1');
  assert.equal(queued.rawText, rawText);
  assert.ok(queued.queuedAt);

  assert.equal(clearPendingRepairUpload({ assignmentId: 'assignment-1', storage }), true);
  assert.equal(readPendingRepairUpload({ assignmentId: 'assignment-1', storage }), null);
});
