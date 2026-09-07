import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyQuestionBatchRepairReplacements,
  parseQuestionBatchRepairResponse,
} from '../../src/platform/contract/questionBatchRepairPacket.js';

/*
 * Two behaviours the batch-repair contract does not pin down, both of which
 * decide whether a teacher's repair actually lands.
 */

const reply = {
  repairPacketVersion: 1,
  assignmentId: 'assignment-17',
  baseRevision: 12,
  replacements: [{
    questionId: 'q-wu-1',
    question: { questionId: 'q-wu-1', type: 'algebra', prompt: 'Repaired', answer: '2' },
  }],
  platformIssues: [],
  unclearIssues: [],
};

const options = {
  expectedAssignmentId: 'assignment-17',
  expectedBaseRevision: 12,
  allowedQuestionIds: ['q-wu-1'],
};

/*
 * A teacher pastes what the chat gave them, and every chat UI fences JSON.
 * Refusing a fenced reply means telling teachers to hand-edit AI output before
 * MathMaster will read it — the manual step this feature exists to remove.
 */
test('a fenced AI reply is read rather than refused', () => {
  const bare = parseQuestionBatchRepairResponse(JSON.stringify(reply), options);
  assert.equal(bare.replacements.length, 1);

  for (const fenced of [
    `\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\``,
    `\`\`\`\n${JSON.stringify(reply)}\n\`\`\``,
  ]) {
    const parsed = parseQuestionBatchRepairResponse(fenced, options);
    assert.equal(parsed.replacements.length, 1);
    assert.equal(parsed.replacements[0].question.prompt, 'Repaired');
  }
});

/*
 * If a replacement names a question the assignment does not contain, the reply
 * and the draft disagree about what exists. Applying the rest silently would
 * report a successful repair while dropping a question the teacher asked to
 * have fixed.
 */
test('a replacement that matches no question in the assignment is refused, not skipped', () => {
  const assignmentV5 = {
    schemaVersion: 5,
    assignment: { assignmentId: 'assignment-17', title: 'T', courseId: 'algebra1' },
    sections: [{ id: 'warmup', role: 'warmup', questions: [{ questionId: 'q-wu-1', prompt: 'Warm-up one' }] }],
  };

  const good = parseQuestionBatchRepairResponse(JSON.stringify(reply), options);
  assert.equal(applyQuestionBatchRepairReplacements(assignmentV5, good).sections[0].questions[0].prompt, 'Repaired');

  const stale = parseQuestionBatchRepairResponse(JSON.stringify({
    ...reply,
    replacements: [{
      questionId: 'q-deleted',
      question: { questionId: 'q-deleted', prompt: 'Repaired a question that is gone' },
    }],
  }), { ...options, allowedQuestionIds: ['q-deleted'] });

  assert.throws(
    () => applyQuestionBatchRepairReplacements(assignmentV5, stale),
    /not in this assignment/i,
  );
});

console.log('questionBatchRepairPacketRobustness.test.mjs: all assertions passed');
