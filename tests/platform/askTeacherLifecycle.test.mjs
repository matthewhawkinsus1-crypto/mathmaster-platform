// TT26: "Ask my teacher" after a class changes hands, while class is in
// session or projected, and over time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASK_TEACHER_RETENTION_DAYS,
  askTeacherQuestionExpired,
  openQuestionHandover,
} from '../../functions/shared/askTeacherLifecycle.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const rawIndex = readFileSync('functions/index.js', 'utf8');
const index = executableSource(rawIndex);
const DAY = 24 * 60 * 60 * 1000;

test('a waiting question follows the student to the new teacher of record; an answered one stays', () => {
  const waiting = { status: 'open', teacherEmail: 'old@school.org', classId: 'c1' };
  assert.deepEqual(openQuestionHandover(waiting, { teacherOfRecord: 'New@School.org', classId: 'c1' }), { teacherEmail: 'new@school.org', classId: 'c1' });
  assert.deepEqual(openQuestionHandover(waiting, { teacherOfRecord: 'new@school.org', classId: 'c2' }), { teacherEmail: 'new@school.org', classId: 'c2' });
  assert.equal(openQuestionHandover({ ...waiting, status: 'answered' }, { teacherOfRecord: 'new@school.org', classId: 'c2' }), null);
  assert.equal(openQuestionHandover(waiting, { teacherOfRecord: 'old@school.org', classId: 'c1' }), null, 'nothing moved');
  assert.equal(openQuestionHandover(waiting, null), null, 'a student taken off a class keeps it where it was');
  assert.equal(openQuestionHandover(waiting, { teacherOfRecord: '', classId: 'c1' }), null);
});

test('the handover runs wherever a student\'s teacher of record changes', () => {
  const reauthorize = executableSource(region(rawIndex, 'async function reauthorizeStudentRecords(', '// Class Points accounts and transactions', 'reauthorizeStudentRecords'));
  assert.match(reauthorize, /counts\.askTeacherQuestions = await handOverOpenTeacherQuestions\(db, studentId, classRecord, apply\);/);
  const handover = region(index, 'async function handOverOpenTeacherQuestions(', '\n}\n', 'the handover');
  assert.match(handover, /\.where\("studentId", "==", studentId\)\s*\.where\("status", "==", "open"\)/);
  assert.match(handover, /lifecycle\.openQuestionHandover\(entry\.data\(\) \|\| \{\}, classRecord\)/);
  // The older one-student path that sets a teacher without a class.
  const legacy = region(index, 'await studentRef.set({ assignedTeacherEmail, classPeriod', 'student_teacher_assignment_changed', 'the legacy assignment');
  assert.match(legacy, /await handOverOpenTeacherQuestions\(db, studentId, \{\s*teacherOfRecord: assignedTeacherEmail,/);
});

test('a question and its answer are kept one school year after their last change', () => {
  assert.equal(ASK_TEACHER_RETENTION_DAYS, 365);
  const now = Date.UTC(2027, 5, 1);
  const at = (daysAgo) => ({ toMillis: () => now - daysAgo * DAY });
  assert.equal(askTeacherQuestionExpired({ updatedAt: at(366) }, now), true);
  assert.equal(askTeacherQuestionExpired({ updatedAt: at(364) }, now), false);
  assert.equal(askTeacherQuestionExpired({ answeredAt: at(400) }, now), true, 'the latest change it has');
  assert.equal(askTeacherQuestionExpired({}, now), false, 'nothing to go by: kept');
  const job = region(index, 'exports.expireAskTeacherQuestions = onSchedule({', '\n});\n', 'the retention job');
  assert.match(job, /invoker: "private"/);
  assert.match(job, /const cutoff = new Date\(Date\.now\(\) - lifecycle\.ASK_TEACHER_RETENTION_MS\);/);
  assert.match(job, /\.where\("updatedAt", "<", cutoff\)\.limit\(400\)/);
  assert.match(job, /batch\.delete\(entry\.ref\)/);
});

test('while a class is in session or the room tiles are projected, only the count shows', () => {
  const home = componentSource('src/TeacherHome.jsx');
  assert.match(home, /<StudentQuestionsPanel\s+withheld=\{teachingNow \|\| roomProjected\}/);
  assert.match(home, /onProjectingChange=\{setRoomProjected\}/);
  const monitor = componentSource('src/components/teacher/LiveClassMonitor.jsx');
  assert.match(monitor, /onProjectingChange\?\.\(projecting\);/);
  const panel = executableSource(componentSource('src/components/teacher/StudentQuestionsPanel.jsx'));
  const withheld = region(panel, 'if (withheld) {', '\n  }\n', 'the withheld view');
  assert.doesNotMatch(withheld, /<details|QuestionRow|question\.text|studentName|resolveRosterStudentName/, 'no name, no words, nothing to open');
  assert.match(withheld, /waiting\.length/);
});
