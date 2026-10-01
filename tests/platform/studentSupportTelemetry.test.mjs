// What a student's own client may claim about supports: only what is TRUE for
// the assignment actually opened. Configured is not available is not provided
// is not used — and a modification that changed nothing is not a modification.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  launchSupportRecords, modificationsAppliedToQuestion, studentMayRecordSupport, usedRecordKey,
} from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';

const NOW = Date.parse('2026-09-30T15:00:00Z');
const profile = (accommodations, { inclusionStatus = false, status = 'active', modifications = [] } = {}) => buildSupportProjection({
  revisions: [{ id: 'r1', revisionId: 'r1', revision: 1, status, effectiveStart: '2026-08-17', inclusionStatus, accommodations, modifications }],
  todayKey: '2026-09-30',
});
const a = (id, params = {}, appliesTo = []) => ({ id, params, appliesTo });
const byId = (result) => Object.fromEntries(result.records.map((record) => [record.supportId, record.eventType]));

test('automatic presentation supports are "provided" at launch; adult-delivered ones are never claimed', () => {
  const result = launchSupportRecords({
    profile: profile([a('declutter-ui'), a('large-text'), a('check-for-understanding'), a('glossary-lookup')]),
    assignment: { dueAt: '2026-10-01' }, roles: ['classwork'], nowValue: NOW,
  });
  assert.equal(result.revisionId, 'r1');
  assert.deepEqual(byId(result), { 'declutter-ui': 'provided', 'large-text': 'provided' });
});

test('read aloud and the calculator are recorded when a question shows them, not at launch', () => {
  const result = launchSupportRecords({ profile: profile([a('text-to-speech'), a('calculator')]), assignment: {}, roles: ['classwork'], nowValue: NOW });
  assert.deepEqual(result.records, []);
});

test('an individualized due date is "provided" only when this assignment\'s due date actually moved', () => {
  const extraTime = profile([a('extra-time', { dueDateExtension: { mode: 'school-days', value: 1 } })]);
  assert.deepEqual(byId(launchSupportRecords({ profile: extraTime, assignment: { dueAt: '2026-10-01' }, roles: ['classwork'], nowValue: NOW })), { 'extra-time': 'provided' });
  assert.deepEqual(launchSupportRecords({ profile: extraTime, assignment: {}, roles: ['classwork'], nowValue: NOW }).records, [], 'no due date, nothing extended');
  const unset = profile([a('extra-time', { dueDateExtension: { mode: 'none' } })]);
  assert.deepEqual(launchSupportRecords({ profile: unset, assignment: { dueAt: '2026-10-01' }, roles: ['classwork'], nowValue: NOW }).records, []);
});

test('a hidden countdown is only a fact on an assignment with a timed section', () => {
  const p = profile([a('no-countdown')]);
  assert.deepEqual(launchSupportRecords({ profile: p, assignment: {}, roles: ['classwork', 'practice'], nowValue: NOW }).records, []);
  assert.deepEqual(byId(launchSupportRecords({ profile: p, assignment: {}, roles: ['classwork', 'dol'], nowValue: NOW })), { 'no-countdown': 'provided' });
});

test('applicability by activity role is honoured', () => {
  const p = profile([a('declutter-ui', {}, ['dol'])]);
  assert.deepEqual(launchSupportRecords({ profile: p, assignment: {}, roles: ['classwork'], nowValue: NOW }).records, []);
  assert.deepEqual(byId(launchSupportRecords({ profile: p, assignment: {}, roles: ['classwork', 'dol'], nowValue: NOW })), { 'declutter-ui': 'provided' });
});

test('resources are "available" only when the profile actually lists one', () => {
  const none = profile([a('study-sheet', { resources: [] })]);
  assert.deepEqual(launchSupportRecords({ profile: none, assignment: {}, roles: ['classwork'], nowValue: NOW }).records, []);
  const some = profile([a('study-sheet', { resources: [{ label: 'Slope notes', url: 'https://docs.example.test/slope' }] }), a('graph-paper')]);
  assert.deepEqual(byId(launchSupportRecords({ profile: some, assignment: {}, roles: ['classwork'], nowValue: NOW })), { 'study-sheet': 'available', 'graph-paper': 'available' });
});

test('inclusion status contributes its implied supports; an inactive profile contributes nothing', () => {
  const inclusion = launchSupportRecords({ profile: profile([], { inclusionStatus: true }), assignment: {}, roles: ['classwork', 'dol'], nowValue: NOW });
  assert.deepEqual(Object.keys(byId(inclusion)).sort(), ['declutter-ui', 'disable-idle-timer', 'high-contrast', 'large-text', 'no-countdown', 'visual-chunking']);
  assert.deepEqual(launchSupportRecords({ profile: profile([a('declutter-ui')], { status: 'inactive' }), assignment: {}, roles: ['classwork'], nowValue: NOW }).records, []);
  assert.equal(studentMayRecordSupport(profile([a('text-to-speech')]), 'text-to-speech', { nowValue: NOW }), true);
  assert.equal(studentMayRecordSupport(profile([a('text-to-speech')]), 'calculator', { nowValue: NOW }), false);
});

test('a modification counts only where it changed the item', () => {
  const configured = ['reduce-complexity', 'prefill-first-step'];
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'functionGraph' }, configured), [], 'graphing item: grade level');
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'stepAlgebra', generator: { kind: 'stepLinearEquation' } }, configured), ['reduce-complexity', 'prefill-first-step']);
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'multipleChoice', choices: ['a', 'b', 'c', 'd'] }, configured), ['reduce-complexity']);
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'multipleChoice', choices: ['a', 'b'] }, configured), [], 'nothing to trim');
  assert.deepEqual(modificationsAppliedToQuestion({ type: 'stepAlgebra' }, []), []);
});

test('"used" is de-duplicated to once per question per minute', () => {
  const t = Date.parse('2026-10-01T15:00:10Z');
  assert.equal(usedRecordKey({ assignmentId: 'A1', questionIndex: 2, supportId: 'text-to-speech', nowMs: t }), usedRecordKey({ assignmentId: 'A1', questionIndex: 2, supportId: 'text-to-speech', nowMs: t + 40000 }));
  assert.notEqual(usedRecordKey({ assignmentId: 'A1', questionIndex: 2, supportId: 'text-to-speech', nowMs: t }), usedRecordKey({ assignmentId: 'A1', questionIndex: 3, supportId: 'text-to-speech', nowMs: t }));
});
