import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as supportStore from '../../src/platform/teacher/studentSupportStore.js';

const contactModule = await import('../../src/platform/teacher/parentContactCenter.js').catch(() => ({}));

const CONTACTED = {
  id: 'contact-1',
  kind: 'parentFollowUp',
  stage: 'actionTaken',
  studentId: 'STUDENT_A',
  studentName: 'Ada Lovelace',
  classId: 'class-a',
  classPeriod: 'Period 1',
  summary: 'Discussed missing classwork and a plan for tomorrow.',
  note: 'Guardian asked for a progress update Friday.',
  createdAt: '2026-09-15T15:00:00.000Z',
  evidence: {
    contactMethod: 'schoolStatus',
    contactOutcome: 'messageSent',
    contactReason: 'missingWork',
  },
};

test('parent contact event records method, outcome, reason, and teacher note as an append-only action', () => {
  assert.equal(typeof contactModule.buildParentContactEvent, 'function');
  const event = contactModule.buildParentContactEvent({
    student: { id: 'STUDENT_A', displayName: 'Ada Lovelace', classId: 'class-a', classPeriod: 'Period 1' },
    method: 'schoolStatus',
    outcome: 'messageSent',
    reason: 'missingWork',
    summary: 'Discussed missing classwork and a plan for tomorrow.',
    note: 'Guardian asked for a progress update Friday.',
  });
  assert.equal(event.kind, 'parentFollowUp');
  assert.equal(event.stage, 'actionTaken');
  assert.equal(event.studentId, 'STUDENT_A');
  assert.equal(event.classId, 'class-a');
  assert.equal(event.evidence.contactMethod, 'schoolStatus');
  assert.equal(event.evidence.contactOutcome, 'messageSent');
  assert.equal(event.evidence.contactReason, 'missingWork');
  assert.match(event.summary, /missing classwork/);
});

test('detail export keeps every completed contact across classes and resolves current student names', () => {
  assert.equal(typeof contactModule.parentContactDetailRows, 'function');
  const rows = contactModule.parentContactDetailRows({
    events: [
      CONTACTED,
      {
        ...CONTACTED,
        id: 'contact-2',
        classId: 'class-b',
        classPeriod: 'Period 2',
        createdAt: '2026-09-16T15:00:00.000Z',
        evidence: { contactMethod: 'phone', contactOutcome: 'guardianReached', contactReason: 'academicProgress' },
      },
      { ...CONTACTED, id: 'pending', stage: 'teacherConfirmed' },
      { ...CONTACTED, id: 'other-kind', kind: 'teacherIntervention' },
    ],
    students: [{ id: 'STUDENT_A', displayName: 'Ada Byron Lovelace' }],
    classes: [
      { classId: 'class-a', name: 'Algebra I — Period 1' },
      { classId: 'class-b', name: 'Algebra II — Period 2' },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].studentName, 'Ada Byron Lovelace');
  assert.deepEqual(rows.map((row) => row.className).sort(), ['Algebra I — Period 1', 'Algebra II — Period 2']);
  assert.deepEqual(rows.map((row) => row.method).sort(), ['phone', 'schoolStatus']);
});

test('merged export produces one student row with the full contact history across classes', () => {
  assert.equal(typeof contactModule.parentContactMergedRows, 'function');
  const detail = contactModule.parentContactDetailRows({
    events: [
      CONTACTED,
      {
        ...CONTACTED,
        id: 'contact-2',
        classId: 'class-b',
        classPeriod: 'Period 2',
        createdAt: '2026-09-16T15:00:00.000Z',
        summary: 'Reviewed improvement and the remaining DOL.',
        evidence: { contactMethod: 'phone', contactOutcome: 'guardianReached', contactReason: 'academicProgress' },
      },
    ],
    students: [{ id: 'STUDENT_A', displayName: 'Ada Lovelace' }],
    classes: [
      { classId: 'class-a', name: 'Algebra I — Period 1' },
      { classId: 'class-b', name: 'Algebra II — Period 2' },
    ],
  });
  const merged = contactModule.parentContactMergedRows(detail);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].studentId, 'STUDENT_A');
  assert.equal(merged[0].contactCount, 2);
  assert.match(merged[0].classes, /Algebra I/);
  assert.match(merged[0].classes, /Algebra II/);
  assert.match(merged[0].history, /missing classwork/);
  assert.match(merged[0].history, /remaining DOL/);
});

test('contact CSV safely quotes notes and supports detailed and merged exports', () => {
  assert.equal(typeof contactModule.parentContactCsv, 'function');
  const detailed = contactModule.parentContactCsv([{
    studentId: 'STUDENT_A',
    studentName: 'Ada Lovelace',
    className: 'Algebra I',
    classPeriod: 'Period 1',
    contactedAt: '2026-09-15T15:00:00.000Z',
    method: 'schoolStatus',
    outcome: 'messageSent',
    reason: 'missingWork',
    summary: 'Missing work, DOL',
    note: 'Guardian said "thank you".',
  }], { merged: false });
  assert.match(detailed, /Student ID,Student Name,Class/);
  assert.match(detailed, /"Missing work, DOL"/);
  assert.match(detailed, /"Guardian said ""thank you""\."/);

  const merged = contactModule.parentContactCsv([{
    studentId: 'STUDENT_A',
    studentName: 'Ada Lovelace',
    contactCount: 2,
    firstContactAt: '2026-09-15T15:00:00.000Z',
    latestContactAt: '2026-09-16T15:00:00.000Z',
    classes: 'Algebra I; Algebra II',
    methods: 'schoolStatus; phone',
    outcomes: 'messageSent; guardianReached',
    history: '2026-09-15 — Missing work\n2026-09-16 — Improving',
  }], { merged: true });
  assert.match(merged, /Contact Count/);
  assert.match(merged, /Ada Lovelace/);
  assert.match(merged, /Algebra I; Algebra II/);
});

test('support store exposes an unbounded teacher-authorized parent contact history query', () => {
  assert.equal(typeof supportStore.fetchParentContactEvents, 'function');
});

test('Parent Contact Center is a dedicated teacher surface wired from the sidebar and App', async () => {
  const [component, sidebar, app] = await Promise.all([
    readFile(new URL('../../src/components/teacher/ParentContactCenter.jsx', import.meta.url), 'utf8').catch(() => ''),
    readFile(new URL('../../src/TeacherSidebar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(component, /Parent Contact Center/);
  assert.match(component, /Export detailed log/);
  assert.match(component, /Export merged by student/);
  assert.match(component, /buildParentFollowUpCandidates/);
  assert.match(sidebar, /parentContact/);
  assert.match(app, /ParentContactCenter/);
});
