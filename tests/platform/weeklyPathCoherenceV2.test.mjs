import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { REASON, STATUS } from '../../src/platform/path/recommendationEngine.js';
import { evaluateStudentRetentionSchedule } from '../../src/platform/retention/retentionScheduler.js';

const question = (code) => ({ alignments: [{ framework: 'teks', role: 'primary', code }] });
const allRows = (options) => [
  ...(options.required || []), ...(options.remediation || []), ...(options.priority || []),
  ...(options.recommended || []), ...(options.available || []), ...(options.extension || []),
  ...(options.future || []), ...(options.locked || []), ...(options.mastered || []),
];

test('open classroom assignments influence Path relevance without becoming an invisible completion gate', () => {
  const target = teksSkillId('A.5A');
  const options = buildStudentPathOptions({
    student: { id: 'student', gradesByAssignment: {} },
    assignments: [{ id: 'open-assignment', questions: [question('A.5A')] }],
    courseId: 'algebra1',
    nowValue: Date.parse('2026-08-23T18:00:00Z'),
  });

  assert.equal(options.required.length, 0, 'an open classroom assignment must not silently become a Path-session requirement');
  const row = allRows(options).find((entry) => entry.skillId === target);
  assert.ok(row, 'the assigned skill is still represented by the Path engine');
  assert.ok(row.reasons.includes(REASON.ASSIGNMENT_RELEVANCE), 'classroom work still influences recommendation relevance');
  assert.notEqual(row.status, STATUS.REQUIRED, 'free choice cannot stay locked merely because an assignment due window is open');
});

test('a real explicit Path requirement can still use REQUIRED when a caller owns its completion contract', () => {
  const target = teksSkillId('A.5A');
  const options = buildStudentPathOptions({
    student: { id: 'student', gradesByAssignment: {} },
    assignments: [{ id: 'open-assignment', questions: [question('A.5A')] }],
    courseId: 'algebra1',
    requiredSkillIds: [target],
    nowValue: Date.parse('2026-08-23T18:00:00Z'),
  });
  assert.ok(options.required.some((entry) => entry.skillId === target));
});

test('missing retention timestamps do not become January 1970', () => {
  const now = Date.parse('2026-08-23T18:00:00Z');
  const report = evaluateStudentRetentionSchedule({
    'A.2A': {
      mastery: { status: 'Secure' },
      dimensions: { lastIndependentSuccessAt: now - 3 * 24 * 60 * 60 * 1000 },
      signals: {},
    },
  }, {
    'A.2A': { lastVerifiedAt: null, nextCheckDueAt: null, successfulCheckCount: 0 },
  }, now);

  assert.ok(report.schedules['A.2A'].nextCheckDueAt > now, 'missing dates should fall back to real mastery evidence, not epoch zero');
  assert.ok(report.schedules['A.2A'].daysOverdue < 100, 'no five-digit overdue count should be possible from an absent timestamp');
});

test('student surfaces tell one weekly-progress story across Path, mastery and active practice', () => {
  const app = fs.readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8');
  const panel = fs.readFileSync(new URL('../../src/components/student/WeeklyPathGoalPanel.jsx', import.meta.url), 'utf8');
  const player = fs.readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');
  const container = fs.readFileSync(new URL('../../src/components/student/MyMathPathProductionContainer.jsx', import.meta.url), 'utf8');

  assert.match(app, /freeChoiceLocked=\{weeklyFreeChoiceLocked\}/);
  assert.match(app, /WeeklyPathGoalPanel/);
  assert.match(panel, /Weekly target complete!/);
  assert.match(panel, /weekly sessions done/);
  assert.match(player, /Completing this session counts toward your weekly target/);
  assert.match(container, /Weekly target reached!/);
});
