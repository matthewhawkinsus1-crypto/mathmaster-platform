import test from 'node:test';
import assert from 'node:assert/strict';
import { addTeacherReviewFlag, emptyTeacherReviewContext } from '../../src/platform/preflight/teacherReviewContext.js';
import { buildAssignmentRepairCenterModel } from '../../src/platform/preflight/assignmentRepairCenterModel.js';
import { buildQuestionBatchRepairPacket } from '../../src/platform/contract/questionBatchRepairPacket.js';

/*
 * A teacher flag is only worth writing if it survives the trip to the AI.
 *
 * Every stage of that trip is already covered on its own: the context records
 * flags, the Repair Center model resolves constraints, and the packet builder
 * copies the constraints it is handed. What none of them covers is the join —
 * the packet tests build their rows with teacherConstraints already populated,
 * so the model could stop resolving them and every one of those tests would
 * stay green while the note silently stopped reaching the repair.
 *
 * This runs the whole path once: a teacher saves a note, and it comes out the
 * other end as a hard constraint on the AI request.
 */

const assignmentV5 = {
  schemaVersion: 5,
  title: 'Note delivery',
  sections: [
    { id: 'sec-dol', role: 'dol', questions: [{ questionId: 'q-1' }, { questionId: 'q-2' }] },
    { id: 'sec-warmup', role: 'warmup', questions: [{ questionId: 'q-3' }] },
  ],
};

const packetFor = (context, selectedQuestionIds) => buildQuestionBatchRepairPacket({
  assignmentV5,
  repairCenterModel: buildAssignmentRepairCenterModel({ assignmentV5, diagnostics: [], teacherReviewContext: context }),
  selectedQuestionIds,
  assignmentId: 'assignment-1',
  baseRevision: 1,
});

test('a question-scoped teacher note arrives in that question repair packet', () => {
  const context = addTeacherReviewFlag(emptyTeacherReviewContext(), {
    scope: 'question',
    targetId: 'q-1',
    category: 'teacherReview',
    severity: 'needsEditing',
    note: 'Keep the graph. Do not turn this into multiple choice.',
  });

  const packet = packetFor(context, ['q-1']);
  const notes = packet.questions[0].teacherConstraints.map((entry) => entry.note);

  assert.deepEqual(
    notes,
    ['Keep the graph. Do not turn this into multiple choice.'],
    'the note a teacher wrote must reach the AI request, or flagging a question changes nothing about how it gets repaired',
  );
});

test('a section-scoped teacher note reaches every question in that section', () => {
  const context = addTeacherReviewFlag(emptyTeacherReviewContext(), {
    scope: 'section',
    targetId: 'sec-dol',
    category: 'teacherReview',
    severity: 'needsEditing',
    note: 'Every graph in the DOL must keep its axis labels.',
  });

  const packet = packetFor(context, ['q-1', 'q-2']);

  packet.questions.forEach((question) => {
    assert.ok(
      question.teacherConstraints.some((entry) => entry.note === 'Every graph in the DOL must keep its axis labels.'),
      `the section note must govern ${question.questionId}; a section flag that does not reach the packet is a note the AI never sees`,
    );
  });
});

test('a section note does not leak into a question outside that section', () => {
  const context = addTeacherReviewFlag(emptyTeacherReviewContext(), {
    scope: 'section',
    targetId: 'sec-dol',
    category: 'teacherReview',
    severity: 'needsEditing',
    note: 'Every graph in the DOL must keep its axis labels.',
  });

  const packet = packetFor(context, ['q-3']);

  assert.deepEqual(
    packet.questions[0].teacherConstraints,
    [],
    'a warm-up question must not inherit a DOL section note; constraints that apply to the wrong question are how an AI gets told to preserve something that is not there',
  );
});
