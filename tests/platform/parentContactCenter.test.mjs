import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildStudentProgressBrief, contactsCsv, groupContactsByStudent, progressBriefText, projectProgressBriefGrades, validateContactDraft } from '../../src/platform/teacher/parentContactCenter.js';
import { resolveContactEvents } from '../../src/platform/teacher/parentContactStore.js';

test('contact history groups canonical student IDs and always resolves the current roster name', () => {
  const contacts = [
    { id: 'b', studentId: 'S1', studentName: 'Old Name', occurredAt: '2026-09-02T10:00:00Z', method: 'email' },
    { id: 'a', studentId: 'S1', studentName: 'Old Name', occurredAt: '2026-09-01T10:00:00Z', method: 'phone' },
  ];
  const groups = groupContactsByStudent({ contacts, students: [{ id: 'S1', displayName: 'Current Name' }] });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].studentName, 'Current Name');
  assert.deepEqual(groups[0].contacts.map((entry) => entry.id), ['b', 'a']);
  const exported = contactsCsv({ contacts, students: [{ id: 'S1', displayName: 'Current Name' }] });
  assert.equal(exported.match(/Current Name/g)?.length, 2);
  assert.doesNotMatch(exported, /Old Name/);
});

test('contact draft requires the communication facts and permits every required category', () => {
  for (const category of ['academics', 'missingWork', 'attendance', 'behavior', 'academicIntegrity', 'cellphone', 'positiveContact', 'other']) {
    assert.deepEqual(validateContactDraft({ studentId: 'S1', occurredAt: '2026-09-17T09:30', method: 'phone', category, outcome: 'Reached guardian' }), []);
  }
  assert.ok(validateContactDraft({}).length >= 4);
});

test('progress brief presents canonical grades and facts without calculating a replacement grade or rank', () => {
  const brief = buildStudentProgressBrief({
    student: { id: 'S1', displayName: 'Ada Student' },
    gradeEntries: [
      { title: 'Lesson 1', grade: 70, status: 'complete', attempts: 2, completedAt: '2026-09-10', sectionGrades: { classwork: 75 } },
      { title: 'Lesson 2', grade: 80, status: 'complete', attempts: 1, completedAt: '2026-09-12', late: true },
      { title: 'Lesson 3', status: 'missing' },
    ],
    classGradeValues: [60, 70, 80, 90, 100], contacts: [{ followUpDate: '2026-09-20' }],
    returnCheckIns: [{ studentId: 'S1', status: 'open' }], sessionSummaries: [{ startedAt: 0, endedAt: 3600000, activeSeconds: 600 }],
  });
  assert.deepEqual(brief.recentGradeTrend.map((entry) => entry.grade), [80, 70]);
  assert.equal(brief.completion.rate, 2 / 3);
  assert.equal(brief.missingAssignments[0].title, 'Lesson 3');
  assert.equal(brief.outstandingFollowUps.length, 1);
  assert.equal(brief.returnFromAbsenceFollowUps.length, 1);
  assert.equal(brief.neutralClassContext.comparison, 'near the class median');
  assert.equal(brief.engagementMinutes, 10, 'parent-facing engagement uses active time, not elapsed wall-clock time');
  assert.doesNotMatch(progressBriefText(brief), /rank/i);
});

test('progress brief projects question trackers through canonical Grade Center overrides', () => {
  const assignment = { id: 'a1', title: 'Canonical lesson', schemaVersion: 5, assignment: { title: 'Canonical lesson' }, sections: [{ id: 'practice', role: 'practice', questions: [{ id: 'q1', type: 'algebra' }, { id: 'q2', type: 'algebra' }] }], variantPolicy: { mode: 'shared', sectionModes: { practice: 'shared' } } };
  const student = {
    id: 'S1', gradesByAssignment: { a1: { 0: { status: 'correct', attemptCount: 1 }, 1: { status: 'expired', bestPartialCredit: 50, attemptCount: 2 } } },
    teacherGradeOverridesByAssignment: { a1: { __assignment: { active: true, score: 92 } } },
  };
  const [entry] = projectProgressBriefGrades({ student, assignments: [assignment] });
  assert.equal(entry.grade, 92, 'the authoritative assignment override is the final grade');
  assert.equal(entry.status, 'complete');
  assert.equal(entry.attempts, 3);
  assert.equal(entry.sectionGrades.practice.total, 2);
});

test('append-only resolution events clear linked outstanding follow-ups without rewriting contacts', () => {
  const contact = { id: 'contact-1', recordType: 'contact', studentId: 'S1', followUpDate: '2026-09-20' };
  const resolution = { id: 'resolution-1', recordType: 'followUpResolution', parentContactId: 'contact-1', studentId: 'S1' };
  assert.deepEqual(resolveContactEvents([contact, resolution]), [{ ...contact, followUpCompleted: true }]);
});

test('runtime wiring imports the contact center and store next to their calls', async () => {
  const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /import ParentContactCenter from '.\/components\/teacher\/ParentContactCenter\.jsx'/);
  assert.match(app, /import \{ fetchAllParentContactsForExport, recordParentContact, recordParentContactResolution, subscribeParentContacts \} from '.\/platform\/teacher\/parentContactStore\.js'/);
  assert.match(app, /teacherTab === 'parentContacts'[\s\S]{0,500}<ParentContactCenter/);
});

test('contact persistence is allow-listed and never serializes answer content', async () => {
  const store = await readFile(new URL('../../src/platform/teacher/parentContactStore.js', import.meta.url), 'utf8');
  const payload = store.slice(store.indexOf('const payload = {'), store.indexOf('const ref = await addDoc'));
  assert.doesNotMatch(payload, /answer|response|evidence|tracker/i);
  assert.match(payload, /studentId: clean\(contact\.studentId\)/);
  assert.match(payload, /originTeacherEmail: email/);
  assert.doesNotMatch(payload, /sourceEventId/, 'Action Center support linkage must stay transient so parentContactLogs still satisfies the PR #271 Firestore allow-list');
  assert.match(store, /getDocs\(query\(collection\(db, PARENT_CONTACT_COLLECTION\)[\s\S]*orderBy\('occurredAt', 'desc'\)\)\)/);
  assert.doesNotMatch(store.slice(store.indexOf('fetchAllParentContactsForExport')), /limit\(/);
});
