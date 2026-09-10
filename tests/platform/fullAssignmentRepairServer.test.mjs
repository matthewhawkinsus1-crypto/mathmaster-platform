import test from 'node:test';
import assert from 'node:assert/strict';
import server from '../../functions/lib/fullAssignmentRepair.js';

test('server authority accepts admins and designated teachers but never spoofed data', () => {
  assert.equal(server.repairAuthority({ token: { rootAdmin: true, admin: true } }), 'administrator');
  assert.equal(server.repairAuthority({ token: { role: 'teacher', assignmentRepairer: true } }), 'designatedRepairer');
  assert.equal(server.repairAuthority({ token: { role: 'teacher' } }), null);
  assert.equal(server.repairAuthority({ token: { role: 'student', assignmentRepairer: true } }), null);
  assert.equal(server.repairAuthority({ token: { role: 'teacher' }, assignmentRepairer: true }), null);
});

test('server commit changes selected questions and increments one revision without touching history fields', () => {
  const assignment = { id: 'a1', assignmentRevision: 4, submissions: { keep: true }, grades: { keep: true }, questions: [{ questionId: 'q1', prompt: 'old' }, { questionId: 'q2', prompt: 'same' }] };
  const request = { repairPacketVersion: 2, repairScope: 'fullAssignmentAudit', assignmentId: 'a1', baseRevision: 4,
    auditResults: [{ questionId: 'q1', classification: 'assignmentIssue' }, { questionId: 'q2', classification: 'passed' }], selectedQuestionIds: ['q1'], replacements: [{ questionId: 'q1', question: { questionId: 'q1', prompt: 'new' } }] };
  const result = server.prepareCommit({ assignment, request });
  assert.equal(result.toRevision, 5);
  assert.equal(result.assignment.questions[0].questionId, 'q1');
  assert.strictEqual(result.assignment.questions[1], assignment.questions[1]);
  assert.strictEqual(result.assignment.submissions, assignment.submissions);
  assert.throws(() => server.prepareCommit({ assignment: { ...assignment, assignmentRevision: 5 }, request }), /revision 4.*revision 5/);
});
