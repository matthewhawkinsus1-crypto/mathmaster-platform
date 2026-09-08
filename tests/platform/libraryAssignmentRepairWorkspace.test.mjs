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

/*
 * MOVED FROM tests/preflight/ INTO tests/platform/.
 *
 * These assertions were real and passing, and no workflow ran them: CI globs
 * tests/platform/*.test.mjs and tests/tools/*.test.mjs, and tests/preflight/
 * matched neither. Regression coverage nothing executes is a comment that takes
 * longer to write.
 */
import { readFileSync } from 'node:fs';


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

/*
 * THE TWO REVISION-SAFETY PROPERTIES OF THE PREVIEW-TO-REPAIR-CENTER HANDOFF.
 *
 * The queue spans two screens and an unbounded amount of time. A teacher can
 * upload an AI response in student preview, hand-edit the assignment, close the
 * tab, come back tomorrow, and only then open Repair/Edit Questions. The
 * response was built against the questions as they were at upload time.
 *
 * So the revision has to travel with the response, and a mismatch has to be
 * refused. Neither half is worth anything alone: carrying a revision nobody
 * checks changes nothing, and checking a revision that was never recorded
 * refuses everything.
 */

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

const repairText = JSON.stringify({
  assignmentId: 'assignment-1',
  baseRevision: 4,
  questions: [{ questionId: 'q-1', prompt: 'Fixed prompt.' }],
});

test('the queued upload records the revision it was built from', () => {
  const storage = memoryStorage();
  queuePendingRepairUpload({ assignmentId: 'assignment-1', rawText: repairText, baseRevision: 4, storage });
  const queued = readPendingRepairUpload({ assignmentId: 'assignment-1', storage });
  assert.equal(queued.baseRevision, 4, 'without the revision, Repair Center cannot tell a fresh response from a stale one');
});

test('a response built from the current revision is handed over', () => {
  const storage = memoryStorage();
  queuePendingRepairUpload({ assignmentId: 'assignment-1', rawText: repairText, baseRevision: 4, storage });
  const pending = readPendingRepairUpload({ assignmentId: 'assignment-1', currentRevision: 4, storage });
  assert.equal(pending.stale, false);
  assert.equal(pending.rawText, repairText);
});

test('a response built before the assignment changed is refused, and says why', () => {
  const storage = memoryStorage();
  queuePendingRepairUpload({ assignmentId: 'assignment-1', rawText: repairText, baseRevision: 4, storage });

  // The teacher edited the assignment between uploading and opening the editor.
  const pending = readPendingRepairUpload({ assignmentId: 'assignment-1', currentRevision: 5, storage });

  assert.equal(pending.stale, true, 'applying a response built from an older revision would overwrite everything changed since');
  assert.match(pending.staleReason, /revision 4/);
  assert.match(pending.staleReason, /revision 5/);
  assert.match(pending.staleReason, /Copy the flagged questions again/, 'a refusal has to say what to do next');
});

test('a queued response with no recorded revision is refused rather than trusted', () => {
  const storage = memoryStorage();
  queuePendingRepairUpload({ assignmentId: 'assignment-1', rawText: repairText, storage });
  const pending = readPendingRepairUpload({ assignmentId: 'assignment-1', currentRevision: 4, storage });
  assert.equal(pending.stale, true, 'an unprovable response must be refused; "no revision recorded" is not "matches"');
});

test('a stale response is returned marked, never silently dropped', () => {
  const storage = memoryStorage();
  queuePendingRepairUpload({ assignmentId: 'assignment-1', rawText: repairText, baseRevision: 4, storage });
  const pending = readPendingRepairUpload({ assignmentId: 'assignment-1', currentRevision: 9, storage });
  assert.notEqual(pending, null,
    'returning null for a stale upload is worse than useless: the teacher opens Repair Center, sees nothing staged, and concludes the upload worked');
  assert.ok(pending.staleReason, 'the screen needs something to show');
});

/* Wiring: both halves have to be used, or the properties above are theatre. */
const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../../src/AssignmentQuestionEditor.jsx', import.meta.url), 'utf8');

test('Teacher Review carries the revision into the handoff', () => {
  const call = panelSource.slice(panelSource.indexOf('queuePendingRepairUpload({'));
  assert.match(call.slice(0, 160), /baseRevision/,
    'queueing without the revision stores null, and Repair Center then refuses every upload as unprovable');
});

test('Repair Center checks the revision and shows the refusal', () => {
  const call = editorSource.slice(editorSource.indexOf('readPendingRepairUpload({'));
  assert.match(call.slice(0, 160), /currentRevision/,
    'reading without the current revision skips the staleness check entirely');

  const effect = editorSource.slice(editorSource.indexOf('const pending = readPendingRepairUpload'));
  const body = effect.slice(0, effect.indexOf('stageRepairText'));
  assert.match(body, /pending\.stale/, 'the stale case must be handled');
  assert.match(body, /setMessage\(pending\.staleReason\)/, 'and shown to the teacher, not swallowed');
  assert.match(body, /clearPendingRepairUpload/, 'and the stale response discarded so it cannot be applied later');
});
