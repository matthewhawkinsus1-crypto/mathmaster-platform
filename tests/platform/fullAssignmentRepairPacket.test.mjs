import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFullAssignmentRepairPacket,
  parseFullAssignmentRepairResponse,
  stageFullAssignmentRepairs,
} from '../../src/platform/contract/fullAssignmentRepairPacket.js';

const assignment = {
  schemaVersion: 5,
  assignment: { assignmentId: 'a1', title: 'Audit me' },
  sections: [{ id: 'classwork', role: 'classwork', questions: [
    { questionId: 'q1', prompt: 'one' },
    { questionId: 'q2', prompt: 'two' },
  ] }],
};

test('full audit includes every question and preserves hard teacher constraints', () => {
  const packet = buildFullAssignmentRepairPacket({
    assignmentV5: assignment, assignmentId: 'a1', baseRevision: 7,
    repairCenterModel: { questions: [
      { questionId: 'q1', teacherConstraints: [] },
      { questionId: 'q2', teacherConstraints: [{ note: 'keep rigor', hardConstraint: true }] },
    ] },
  });
  assert.deepEqual(packet.questions.map((q) => q.questionId), ['q1', 'q2']);
  assert.equal(packet.questions[1].teacherConstraints[0].hardConstraint, true);
  assert.equal(packet.repairScope, 'fullAssignmentAudit');
  assert.equal(packet.baseRevision, 7);
});

test('full audit refuses missing IDs and incomplete, duplicate, unknown, foreign, or stale replies', () => {
  assert.throws(() => buildFullAssignmentRepairPacket({ assignmentV5: { ...assignment, sections: [{ questions: [{}] }] } }), /stable questionId/);
  const good = { repairPacketVersion: 2, repairScope: 'fullAssignmentAudit', assignmentId: 'a1', baseRevision: 7,
    auditResults: [{ questionId: 'q1', classification: 'passed', reason: 'ok' }, { questionId: 'q2', classification: 'unclear', reason: '?' }], replacements: [] };
  const options = { expectedAssignmentId: 'a1', expectedBaseRevision: 7, currentQuestionIds: ['q1', 'q2'] };
  assert.equal(parseFullAssignmentRepairResponse(JSON.stringify(good), options).auditResults.length, 2);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...good, auditResults: good.auditResults.slice(0, 1) }), options), /missing an audit result/i);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...good, auditResults: [good.auditResults[0], good.auditResults[0]] }), options), /duplicate/i);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...good, auditResults: [...good.auditResults, { questionId: 'qx', classification: 'passed', reason: 'ok' }] }), options), /unknown/i);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...good, assignmentId: 'other' }), options), /other/);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...good, baseRevision: 6 }), options), /revision 6.*revision 7/i);
});

test('only assignment issues may be replaced and staging is surgical and selectable', () => {
  const base = { repairPacketVersion: 2, repairScope: 'fullAssignmentAudit', assignmentId: 'a1', baseRevision: 7,
    auditResults: [{ questionId: 'q1', classification: 'assignmentIssue', reason: 'wrong' }, { questionId: 'q2', classification: 'passed', reason: 'ok' }],
    replacements: [{ questionId: 'q1', question: { questionId: 'q1', prompt: 'fixed' } }] };
  const options = { expectedAssignmentId: 'a1', expectedBaseRevision: 7, currentQuestionIds: ['q1', 'q2'] };
  const parsed = parseFullAssignmentRepairResponse(JSON.stringify(base), options);
  const staged = stageFullAssignmentRepairs({ assignmentV5: assignment, parsedResponse: parsed, selectedQuestionIds: ['q1'] });
  assert.equal(staged.sections[0].questions[0].prompt, 'fixed');
  assert.strictEqual(staged.sections[0].questions[1], assignment.sections[0].questions[1]);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...base, replacements: [{ questionId: 'q2', question: { questionId: 'q2' } }] }), options), /passed.*replacement/i);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...base, replacements: [{ questionId: 'q1', question: { questionId: 'wrong' } }] }), options), /questionId/i);
  assert.throws(() => parseFullAssignmentRepairResponse(JSON.stringify({ ...base, replacements: [base.replacements[0], base.replacements[0]] }), options), /duplicate replacement/i);
});

test('selected-question version 1 still refuses an unselected replacement', async () => {
  const { parseQuestionBatchRepairResponse } = await import('../../src/platform/contract/questionBatchRepairPacket.js');
  assert.throws(() => parseQuestionBatchRepairResponse(JSON.stringify({ assignmentId: 'a1', baseRevision: 7, replacements: [{ questionId: 'q2', question: { questionId: 'q2' } }] }), { expectedAssignmentId: 'a1', expectedBaseRevision: 7, allowedQuestionIds: ['q1'] }), /not part of this repair request/);
});
