// The discipline tracker's shared rules (functions/shared/disciplineTracker.mjs):
// the violation catalog, the district Google Form (read, checked, filled in),
// when a class's batch goes out, repeat offenders, and the wording a family
// and the principal receive.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DISTRICT_VIOLATION_FORM,
  DisciplineInputError,
  VIOLATION_TYPES,
  checkDistrictForm,
  classifyFormReply,
  disciplineDateKey,
  formResponseBody,
  formStudentName,
  normalizeViolationInput,
  outlookComposeUrl,
  parentMessage,
  parseGoogleFormDefinition,
  pendingFormSubmissions,
  principalReport,
  repeatOffenders,
  schoolDaysEndingOn,
  submissionDueAtMs,
  violationLabel,
} from '../../functions/shared/disciplineTracker.mjs';

const FORM_PAGE = readFileSync(new URL('./fixtures/campusViolationTrackerForm.html', import.meta.url), 'utf8');
// Monday, November 30, 2026, in Central time (UTC-6).
const at = (hhmm, day = '2026-11-30') => Date.parse(`${day}T${hhmm}:00-06:00`);
let next = 0;
const incident = (overrides = {}) => {
  const occurredAtMs = overrides.occurredAtMs ?? at('08:05');
  return {
    id: `i${(next += 1)}`,
    classId: 'alg1-p1',
    classPeriod: 'Period 1',
    studentId: 'u-ada',
    type: 'tardy',
    detail: '',
    occurredAtMs,
    dateKey: disciplineDateKey(occurredAtMs),
    form: { state: 'pending' },
    ...overrides,
  };
};
const students = new Map([
  ['u-ada', { firstName: 'Ada', lastName: 'Lovelace', sisStudentId: '1500101' }],
  ['u-ben', { displayName: 'Ortiz, Ben', sisStudentId: '1500102' }],
  ['1500103', { firstName: 'Cal', lastName: 'Reyes' }], // legacy: the account id is the district id
  ['u-dee', { firstName: 'Dee', lastName: 'Park' }], // no district id on file
]);

test('the catalog: four violations, one per district form checkbox, with ID and dress code details', () => {
  assert.deepEqual(VIOLATION_TYPES.map((entry) => entry.formOption), DISTRICT_VIOLATION_FORM.options.slice().sort((a, b) => ['Tardy', 'Dress Code', 'ID Violation', 'Electronic Device Collected'].indexOf(a) - ['Tardy', 'Dress Code', 'ID Violation', 'Electronic Device Collected'].indexOf(b)));
  assert.deepEqual(VIOLATION_TYPES.find((entry) => entry.id === 'idViolation').details.map((entry) => entry.label), [
    'ID removed', 'ID not displayed (no lanyard)', 'ID not on and visible all day',
  ]);
  assert.deepEqual(VIOLATION_TYPES.find((entry) => entry.id === 'dressCode').details.map((entry) => entry.label), ['Swapping in and out of dress code']);
  assert.deepEqual(normalizeViolationInput({ type: 'idViolation', detail: 'noLanyard' }), { type: 'idViolation', detail: 'noLanyard' });
  assert.deepEqual(normalizeViolationInput({ type: 'tardy' }), { type: 'tardy', detail: '' });
  assert.throws(() => normalizeViolationInput({ type: 'fighting' }), DisciplineInputError);
  assert.throws(() => normalizeViolationInput({ type: 'tardy', detail: 'noLanyard' }), /Tardy has no detail/);
  assert.equal(violationLabel({ type: 'idViolation', detail: 'noLanyard' }), 'ID Violation · ID not displayed (no lanyard)');
});

test('the live district form is read and checked before anything is sent to it', () => {
  const definition = parseGoogleFormDefinition(FORM_PAGE);
  assert.equal(definition.title, 'Campus Violation Tracker');
  assert.deepEqual(checkDistrictForm(definition), { ok: true, entries: { studentId: '53561676', name: '1778257346', violations: '420745546' } });

  const edited = (change) => {
    const copy = structuredClone(definition);
    change(copy);
    return checkDistrictForm(copy);
  };
  assert.match(edited((form) => { form.questions[1].title = 'Student Name'; }).problems[0], /no "First Name" question/);
  assert.match(edited((form) => { form.questions[2].options.pop(); }).problems[0], /no longer offers: Electronic Device Collected/);
  assert.match(edited((form) => { form.questions.push({ title: 'Location', entry: '9', required: true, options: [] }); }).problems[0], /new required question: "Location"/);
  // Questions found by title: a re-ordered form still works, with the live ids.
  const moved = edited((form) => { form.questions.reverse(); form.questions[0].entry = '777'; });
  assert.deepEqual(moved, { ok: true, entries: { studentId: '53561676', name: '1778257346', violations: '777' } });
  assert.equal(parseGoogleFormDefinition('<html>Sign in to continue</html>'), null);
  assert.equal(checkDistrictForm(null).ok, false);
});

test('one response per student per class per day, every category they had, in the form\'s order', () => {
  const { submissions, blocked } = pendingFormSubmissions({
    studentsById: students,
    incidents: [
      incident({ type: 'idViolation', detail: 'noLanyard', occurredAtMs: at('08:30') }),
      incident({ type: 'tardy', occurredAtMs: at('08:05') }),
      incident({ type: 'tardy', occurredAtMs: at('08:06'), voidedAt: '2026-11-30T14:07:00Z' }), // undone
      incident({ type: 'dressCode', form: { state: 'submitted' } }), // already sent
      incident({ studentId: 'u-ben', type: 'deviceCollected' }),
      incident({ studentId: '1500103', type: 'dressCode', detail: 'swapping' }),
      incident({ studentId: 'u-dee', type: 'tardy' }),
      incident({ classId: 'alg1-p5', classPeriod: 'Period 5', type: 'tardy', occurredAtMs: at('13:05') }), // another class
    ],
  });
  const ada = submissions.find((entry) => entry.key === 'alg1-p1|2026-11-30|u-ada');
  assert.deepEqual([ada.sisStudentId, ada.name, ada.options, ada.incidentIds.length], ['1500101', 'Ada Lovelace', ['Tardy', 'ID Violation'], 2]);
  assert.deepEqual(submissions.find((entry) => entry.studentId === 'u-ben').name, 'Ben Ortiz', 'a "Last, First" name reads First Last');
  assert.deepEqual(submissions.find((entry) => entry.studentId === '1500103').sisStudentId, '1500103');
  assert.ok(submissions.some((entry) => entry.key === 'alg1-p5|2026-11-30|u-ada'), 'each class is its own response');
  assert.deepEqual(blocked.map((entry) => [entry.studentId, entry.reason]), [['u-dee', 'Missing or invalid district student ID']]);
  assert.equal(formStudentName({ id: 'x', firstName: 'Ada', lastName: 'Lovelace' }), 'Ada Lovelace');
});

test('the response body is exactly the form\'s fields, one value per checked box', () => {
  const body = formResponseBody({ entries: { studentId: '53561676', name: '1778257346', violations: '420745546' }, sisStudentId: '1500101', name: 'Ada Lovelace', options: ['Tardy', 'ID Violation'] });
  assert.equal(body, 'entry.53561676=1500101&entry.1778257346=Ada+Lovelace&entry.420745546=Tardy&entry.420745546=ID+Violation&fvv=1&pageHistory=0');
});

test('a reply that never came is never sent again on its own: it could double a student\'s record', () => {
  assert.equal(classifyFormReply({ status: 200 }).state, 'submitted');
  assert.equal(classifyFormReply({ status: 400 }).state, 'failed');
  assert.match(classifyFormReply({ status: 403 }).reason, /requires a sign-in/);
  assert.equal(classifyFormReply({ status: 503 }).state, 'retry');
  assert.equal(classifyFormReply({ status: 429 }).state, 'retry');
  assert.equal(classifyFormReply({ networkError: 'getaddrinfo ENOTFOUND docs.google.com' }).state, 'retry', 'never reached Google');
  assert.equal(classifyFormReply({ networkError: 'The operation was aborted due to timeout' }).state, 'unknown');
  assert.equal(classifyFormReply({ networkError: 'socket hang up' }).state, 'unknown');
});

const schedule = {
  version: 2,
  daySchedules: { A: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '09:30' } } }, B: { periods: {} } },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
};

test('a class\'s batch goes out ten minutes after its period ends, or at 4:30 pm with no bell window', () => {
  const submission = { dateKey: '2026-11-30', firstOccurredAtMs: at('08:05'), lastRecordedAtMs: at('08:30') };
  assert.equal(submissionDueAtMs({ submission, classPeriod: 'Period 1', schedule }), at('09:40'));
  // A tap near the end keeps the batch open five more minutes for an undo.
  assert.equal(submissionDueAtMs({ submission: { ...submission, lastRecordedAtMs: at('09:38') }, classPeriod: 'Period 1', schedule }), at('09:43'));
  // Tuesday is a B day: Period 1 has no window, so the end of the day.
  const tuesday = { dateKey: '2026-12-01', firstOccurredAtMs: at('08:05', '2026-12-01'), lastRecordedAtMs: at('08:05', '2026-12-01') };
  assert.equal(submissionDueAtMs({ submission: tuesday, classPeriod: 'Period 1', schedule }), at('16:30', '2026-12-01'));
  assert.equal(submissionDueAtMs({ submission, classPeriod: '', schedule: null }), at('16:30'));
});

test('school days skip weekends and Thanksgiving break', () => {
  assert.deepEqual(schoolDaysEndingOn('2026-12-01', 5), ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-30', '2026-12-01']);
});

test('repeat offenders: 3 in 10 school days, or the same violation twice in 5', () => {
  const day = (key, hhmm = '08:05') => at(hhmm, key);
  const list = [
    // Ada: three different violations across the window.
    incident({ type: 'tardy', occurredAtMs: day('2026-11-18') }),
    incident({ type: 'dressCode', occurredAtMs: day('2026-11-20') }),
    incident({ type: 'idViolation', detail: 'idRemoved', occurredAtMs: day('2026-12-01', '10:15') }),
    // Ben: the same violation twice in five school days.
    incident({ studentId: 'u-ben', type: 'deviceCollected', occurredAtMs: day('2026-11-30') }),
    incident({ studentId: 'u-ben', type: 'deviceCollected', occurredAtMs: day('2026-12-01') }),
    // Cal: two different violations; one more was undone.
    incident({ studentId: '1500103', type: 'tardy', occurredAtMs: day('2026-11-30') }),
    incident({ studentId: '1500103', type: 'dressCode', occurredAtMs: day('2026-12-01') }),
    incident({ studentId: '1500103', type: 'dressCode', occurredAtMs: day('2026-12-01', '09:00'), voidedAt: 'x' }),
    // Dee: the same violation twice, but the first was 6 school days ago.
    incident({ studentId: 'u-dee', type: 'tardy', occurredAtMs: day('2026-11-17') }),
    incident({ studentId: 'u-dee', type: 'tardy', occurredAtMs: day('2026-12-01') }),
  ];
  const offenders = repeatOffenders({ incidents: list, asOfDateKey: '2026-12-01' });
  assert.deepEqual(offenders.map((entry) => entry.studentId), ['u-ada', 'u-ben']);
  assert.deepEqual(offenders[0].reasons, ['3 violations in 10 school days']);
  assert.deepEqual(offenders[1].reasons, ['Device Collected 2 times in 5 school days']);
  assert.deepEqual(offenders[0].incidents.map((entry) => entry.dateKey), ['2026-11-18', '2026-11-20', '2026-12-01'], 'oldest first');
});

test('the family message is factual, courteous, about one student, and covers the whole day', () => {
  const message = parentMessage({
    student: { id: 'u-ada', firstName: 'Ada', lastName: 'Lovelace' },
    dateKey: '2026-11-30',
    teacherName: 'Mr. Hawkins',
    classLabel: 'Algebra I',
    incidents: [
      incident({ type: 'idViolation', detail: 'noLanyard', occurredAtMs: at('08:30') }),
      incident({ type: 'tardy', occurredAtMs: at('08:05') }),
      incident({ type: 'tardy', occurredAtMs: at('08:06'), voidedAt: 'x' }),
    ],
  });
  assert.equal(message.subject, 'Ada: Tardy and ID Violation on Mon, 11/30');
  assert.equal(message.body, [
    "Hello, this is Mr. Hawkins, Ada's Algebra I teacher.",
    'I want to let you know that on Monday, November 30, Ada arrived late to class at 8:05 AM and was not displaying their student ID on a lanyard at 8:30 AM.',
    'Students are expected to be in the classroom when the bell rings so they do not miss the start of the lesson.',
    'Students are expected to wear their student ID on a lanyard, visible, for the entire school day.',
    'Thank you for reviewing this with Ada. Please reply to this message if you have any questions.',
    'Mr. Hawkins',
  ].join('\n\n'));
  assert.doesNotMatch(message.body, /Lovelace|1500101/, 'a first name only, no ID');
  const swapping = parentMessage({ student: { firstName: 'Cal', lastName: 'Reyes' }, dateKey: '2026-11-30', incidents: [incident({ type: 'dressCode', detail: 'swapping', occurredAtMs: at('11:00') })] });
  assert.match(swapping.body, /Cal was changing in and out of dress code during the school day at 11:00 AM\./);
  assert.match(swapping.body, /remain in dress code for the entire school day/);
});

test('the principal report lists each repeat offender with ID, every date and time, and the family contact', () => {
  const submitted = { form: { state: 'submitted' } };
  const list = [
    incident({ type: 'tardy', occurredAtMs: at('08:05', '2026-11-18'), ...submitted }),
    incident({ type: 'dressCode', occurredAtMs: at('08:10', '2026-11-20'), ...submitted }),
    incident({ type: 'idViolation', detail: 'idRemoved', occurredAtMs: at('10:15', '2026-12-01'), ...submitted }),
  ];
  const offenders = repeatOffenders({ incidents: list, asOfDateKey: '2026-12-01' });
  const report = principalReport({
    offenders,
    studentsById: students,
    classLabelsById: new Map([['alg1-p1', 'Algebra I (Period 1)']]),
    contactsByStudentId: new Map([['u-ada', [{ method: 'text', occurredAt: '2026-11-20T21:40:00Z', outcome: 'Sent through SchoolStatus' }]]]),
    asOfDateKey: '2026-12-01',
    teacherName: 'Mr. Hawkins',
    principalName: 'Dr. Smith',
  });
  assert.equal(report.subject, 'Repeat student violations: Wed, 11/11 to Tue, 12/1 (Mr. Hawkins)', 'ten school days back, skipping Thanksgiving week');
  assert.match(report.body, /^Dr\. Smith,/);
  assert.match(report.body, /1\. Ada Lovelace \(ID 1500101\), Algebra I \(Period 1\): 3 violations in 10 school days/);
  assert.match(report.body, /- Wed, 11\/18 8:05 AM: Tardy\n {3}- Fri, 11\/20 8:10 AM: Dress Code\n {3}- Tue, 12\/1 10:15 AM: ID Violation · ID removed/);
  assert.match(report.body, /Parent contact: Text message on Fri, 11\/20 3:40 PM \(Sent through SchoolStatus\)/);
  assert.match(report.body, /Each was also submitted to the Campus Violation Tracker form\./, 'every one was');
  const none = principalReport({ offenders: [], asOfDateKey: '2026-12-01' });
  assert.match(none.body, /No student has repeated violations/);
});

test('the principal report says which violations are not on the district form yet, and never claims they all are', () => {
  const list = [
    incident({ type: 'tardy', occurredAtMs: at('08:05', '2026-11-30'), form: { state: 'submitted' } }),
    incident({ type: 'dressCode', occurredAtMs: at('08:10', '2026-11-30'), form: { state: 'unknown' } }),
    incident({ type: 'deviceCollected', occurredAtMs: at('09:15', '2026-12-01'), form: { state: 'failed', reason: 'No district ID on file' } }),
    incident({ type: 'tardy', occurredAtMs: at('10:15', '2026-12-01'), form: { state: 'pending' } }),
  ];
  const report = principalReport({ offenders: repeatOffenders({ incidents: list, asOfDateKey: '2026-12-01' }), studentsById: students, asOfDateKey: '2026-12-01' });
  assert.doesNotMatch(report.body, /Each was also submitted/);
  assert.match(report.body, /Each violation was submitted to the Campus Violation Tracker form unless its line says otherwise\./);
  assert.match(report.body, /- Mon, 11\/30 8:05 AM: Tardy\n/, 'a submitted one has no note');
  assert.match(report.body, /- Mon, 11\/30 8:10 AM: Dress Code \(may not be on the district form: its send got no answer\)/);
  assert.match(report.body, /- Tue, 12\/1 9:15 AM: Device Collected \(not on the district form: the send failed\)/);
  assert.match(report.body, /- Tue, 12\/1 10:15 AM: Tardy \(not yet on the district form\)/);
});

test('the Outlook link opens a filled-in message for the teacher to review and send', () => {
  const url = outlookComposeUrl({ to: 'principal@desotoisd.org', subject: 'Repeat violations', body: 'Line one\nLine two' });
  assert.equal(url, 'https://outlook.office.com/mail/deeplink/compose?to=principal%40desotoisd.org&subject=Repeat%20violations&body=Line%20one%0ALine%20two');
});

test('a tap undone the way the backend marks it (voidedAtMs) is gone everywhere', () => {
  const undone = incident({ type: 'dressCode', voidedAtMs: at('08:06') });
  assert.equal(pendingFormSubmissions({ incidents: [undone], studentsById: students }).submissions.length, 0, 'not sent');
  assert.deepEqual(repeatOffenders({
    incidents: [undone, incident({ type: 'dressCode', occurredAtMs: at('09:00') })],
    asOfDateKey: '2026-11-30',
  }), [], 'not counted');
  assert.doesNotMatch(parentMessage({ student: { firstName: 'Ada' }, dateKey: '2026-11-30', incidents: [undone, incident()] }).body, /dress code/, 'not written to the family');
});
