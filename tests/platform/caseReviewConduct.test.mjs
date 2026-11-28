// The Student Case Review's conduct section: the Discipline Tracker's records
// and the family contacts in Parent Contacts, beside the academic evidence.
//
// What these pin: the server returns one student's records only, never an
// undone tap, and only the family contacts the caller may already read; the
// callable authorizes as the case review's own evidence callable does before
// it reads anything, and writes nothing; the model counts what was recorded
// over the case's window and never says "none" for a type with no record;
// nothing in the section changes a grade, a narrative fact or the attention
// summary; the screen, the print view, the timeline and the CSV carry it, the
// teacher's own words labelled as theirs. All data here is synthetic.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  CONDUCT_EVIDENCE_LIMITS, ConductEvidenceInputError, buildConductEvidenceResponse, validateConductEvidenceRequest,
} from '../../functions/shared/conductEvidence.mjs';
import {
  CONDUCT_RECORDS_NOTE, CONDUCT_RECORDS_TRUNCATED, TEACHER_AUTHORED_NOTE, buildConductRecords, conductTimelineEntries,
} from '../../src/platform/caseReview/conductRecords.js';
import { buildStudentCaseReview } from '../../src/platform/caseReview/studentCaseReview.js';
import { caseConductCsv } from '../../src/platform/caseReview/caseReviewExport.js';
import { CASE_PROVENANCE } from '../../src/platform/caseReview/caseProvenance.js';
import { caseInputs } from './helpers/caseReviewFixture.mjs';
import { functionsDeclaration } from './helpers/functionsBackendSource.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const STUDENT = 'S920001';
const TEACHER = 'teacher.case@example.test';
const at = (iso) => Date.parse(iso);

// Stored records as the callable reads them ({ id, ...data }).
const incident = (id, iso, type, extra = {}) => ({
  id,
  studentId: STUDENT,
  classId: 'class-a',
  classPeriod: '2',
  classLabel: 'Algebra I — Period 2 (synthetic)',
  type,
  detail: '',
  occurredAtMs: at(iso),
  dateKey: iso.slice(0, 10),
  teacherOfRecord: TEACHER,
  recordedByEmail: TEACHER,
  recordedByUid: 'uid-secret',
  form: { state: 'submitted', attempts: 1, submittedAtMs: at(iso) + 3600000 },
  ...extra,
});
const contact = (id, iso, extra = {}) => ({
  id,
  schemaVersion: 1,
  recordType: 'contact',
  parentContactId: null,
  studentId: STUDENT,
  studentName: 'Avery Sample',
  classId: 'class-a',
  classPeriod: '2',
  occurredAt: new Date(at(iso)).toISOString(),
  method: 'phone',
  category: 'behavior',
  notes: 'Spoke with a parent about the ID expectation.',
  outcome: 'Discipline message sent',
  followUpDate: null,
  createdByEmail: TEACHER,
  originTeacherEmail: TEACHER,
  authorizedTeacherEmails: [TEACHER],
  ...extra,
});

const INCIDENTS = [
  incident('class-a_tap1', '2026-09-08T13:05:00Z', 'tardy'),
  incident('class-a_tap2', '2026-09-08T15:10:00Z', 'idViolation', { detail: 'noLanyard', form: { state: 'pending', attempts: 0 } }),
  incident('class-a_tap3', '2026-09-21T14:00:00Z', 'idViolation', { detail: 'noLanyard', form: { state: 'unknown', attempts: 1 } }),
  incident('class-a_tap4', '2026-10-05T16:30:00Z', 'deviceCollected'),
  // Undone, both ways the backend marks one: never a record.
  incident('class-a_tap5', '2026-10-06T13:00:00Z', 'dressCode', { voidedAtMs: at('2026-10-06T13:01:00Z') }),
  incident('class-a_tap6', '2026-10-06T13:02:00Z', 'dressCode', { voidedAt: { seconds: 1 } }),
  // Another student's: never in this student's case.
  { ...incident('class-a_tap7', '2026-09-10T13:00:00Z', 'tardy'), studentId: 'S920002' },
  // Before the window.
  incident('class-a_tap8', '2026-07-01T13:00:00Z', 'tardy'),
];
const CONTACTS = [
  contact('pc1', '2026-09-08T20:00:00Z', { followUpDate: '2026-09-15' }),
  contact('pc2', '2026-09-22T20:00:00Z', { method: 'email', category: 'missingWork', notes: '=HYPERLINK("http://example.test")', outcome: 'Emailed the missing-work list' }),
  contact('pc3', '2026-10-01T20:00:00Z', { method: 'text', category: 'positiveContact', followUpDate: '2026-10-08' }),
  // pc1's follow-up was completed (an appended resolution, not a contact).
  contact('pc1-done', '2026-09-15T20:00:00Z', { recordType: 'followUpResolution', parentContactId: 'pc1', method: 'other', category: 'other', notes: '', outcome: 'Follow-up completed' }),
  // A contact this teacher cannot read in Parent Contacts.
  contact('pc4', '2026-09-23T20:00:00Z', { authorizedTeacherEmails: ['someone.else@example.test'], notes: 'NOT-FOR-THIS-TEACHER' }),
  // Another student's.
  { ...contact('pc5', '2026-09-23T20:00:00Z'), studentId: 'S920002', notes: 'OTHER-STUDENT' },
];

const response = (overrides = {}) => buildConductEvidenceResponse({
  studentId: STUDENT,
  incidents: INCIDENTS,
  contacts: CONTACTS,
  fromDateKey: '2026-08-01',
  toDateKey: '2026-10-12',
  callerEmail: 'Teacher.Case@Example.test',
  ...overrides,
});

/* ------------------------------------------------------------ the server */

test('the request is one student and a range of school days, at most the case review\'s longest window', () => {
  assert.deepEqual(validateConductEvidenceRequest({ studentId: ` ${STUDENT} `, fromDateKey: '2026-08-01', toDateKey: '2026-10-12' }), { studentId: STUDENT, fromDateKey: '2026-08-01', toDateKey: '2026-10-12' });
  const refused = [
    {}, { studentId: '', fromDateKey: '2026-08-01', toDateKey: '2026-10-12' },
    { studentId: 'a/b', fromDateKey: '2026-08-01', toDateKey: '2026-10-12' },
    { studentId: STUDENT, fromDateKey: '2026-8-1', toDateKey: '2026-10-12' },
    { studentId: STUDENT, fromDateKey: '2026-10-13', toDateKey: '2026-10-12' },
    { studentId: STUDENT, fromDateKey: '2025-09-06', toDateKey: '2026-10-12' },
  ];
  refused.forEach((request) => assert.throws(() => validateConductEvidenceRequest(request), ConductEvidenceInputError, JSON.stringify(request)));
  // The longest the case review asks for is accepted (caseReviewStore.js caseReviewWindow).
  assert.equal(CONDUCT_EVIDENCE_LIMITS.maxRangeDays, 400);
  assert.doesNotThrow(() => validateConductEvidenceRequest({ studentId: STUDENT, fromDateKey: '2025-09-07', toDateKey: '2026-10-12' }));
});

test('the server returns this student\'s records in the window, never an undone tap, in time order', () => {
  const result = response();
  assert.deepEqual(result.incidents.map((row) => row.id), ['class-a_tap1', 'class-a_tap2', 'class-a_tap3', 'class-a_tap4']);
  // Only what the case review shows: who recorded it and the class's owner stay on the server.
  assert.deepEqual(Object.keys(result.incidents[1]).sort(), [
    'classId', 'classLabel', 'classPeriod', 'dateKey', 'detail', 'detailLabel', 'formState', 'formSubmittedAtMs', 'id', 'occurredAtMs', 'type', 'typeLabel',
  ]);
  assert.deepEqual([result.incidents[1].typeLabel, result.incidents[1].detailLabel, result.incidents[1].formState], ['ID Violation', 'ID not displayed (no lanyard)', 'pending']);
  assert.equal(result.incidents[0].formSubmittedAtMs, at('2026-09-08T13:05:00Z') + 3600000);
  assert.doesNotMatch(JSON.stringify(result), /uid-secret|teacherOfRecord|recordedBy/);
  // The window is the request's.
  assert.deepEqual(response({ fromDateKey: '2026-09-21', toDateKey: '2026-09-21' }).incidents.map((row) => row.id), ['class-a_tap3']);
});

test('family contacts are only those the caller may read in Parent Contacts, with follow-ups resolved', () => {
  const result = response();
  assert.deepEqual(result.contacts.map((row) => row.id), ['pc1', 'pc2', 'pc3']);
  assert.deepEqual(result.contacts.map((row) => row.followUpCompleted), [true, false, false]);
  assert.doesNotMatch(JSON.stringify(result), /NOT-FOR-THIS-TEACHER|OTHER-STUDENT|authorizedTeacherEmails|studentName/);
  assert.deepEqual(Object.keys(result.contacts[0]).sort(), ['category', 'classId', 'followUpCompleted', 'followUpDate', 'id', 'method', 'notes', 'occurredAt', 'outcome']);
  // The root administrator reads every contact, as the rules allow.
  assert.deepEqual(response({ isRootAdmin: true }).contacts.map((row) => row.id), ['pc1', 'pc2', 'pc4', 'pc3']);
  // Another teacher reads none of them.
  assert.deepEqual(response({ callerEmail: 'stranger@example.test' }).contacts, []);
  assert.deepEqual(response({ truncated: { incidents: true } }).truncated, { incidents: true, contacts: false });
});

test('the callable authorizes as the case review\'s evidence does, before it reads, and writes nothing', () => {
  const source = executableSource(functionsDeclaration('loadStudentConductEvidence'));
  const teacher = source.indexOf('await requireTeacher(request)');
  const validate = source.indexOf('conduct.validateConductEvidenceRequest(request.data || {})');
  const decision = source.indexOf('const decision = authorizeCaseEvidenceCaller({');
  const refused = source.indexOf('if (!decision.allowed) {');
  const firstRead = source.search(/collection\("disciplineIncidents"\)|collection\("parentContactLogs"\)/);
  assert.ok(teacher > 0 && validate > teacher && decision > validate && refused > decision && firstRead > refused, 'teacher, request, decision, then the reads');
  // The root administrator is the one the discipline callables recognise: the claim and the address.
  assert.match(source, /const isRootAdmin = request\.auth\?\.token\?\.rootAdmin === true && authLib\.isRootAdminEmail\(email\);/);
  assert.match(source, /callerRole: request\.auth\?\.token\?\.role,\s*isRootAdmin,\s*student,/);
  // Only the two fields the decision needs are read from the grade record.
  assert.match(source, /db\.getAll\(db\.collection\("grades"\)\.doc\(studentId\), \{ fieldMask: \["classId", "assignedTeacherEmail"\] \}\)/);
  // One student, single-field queries, each with its limit and its truncation flag.
  assert.match(source, /collection\("disciplineIncidents"\)\.where\("studentId", "==", studentId\)\.limit\(limits\.maxIncidents\)\.get\(\)/);
  assert.match(source, /collection\("parentContactLogs"\)\.where\("studentId", "==", studentId\)\.limit\(limits\.maxContacts\)\.get\(\)/);
  assert.match(source, /truncated: \{ incidents: incidentSnapshot\.size >= limits\.maxIncidents, contacts: contactSnapshot\.size >= limits\.maxContacts \}/);
  assert.match(source, /callerEmail: email,\s*isRootAdmin,/);
  assert.doesNotMatch(source, /\.(set|update|add|create|delete)\(|runTransaction|batch\(/, 'read-only');
});

/* ------------------------------------------------------------ the model */

test('not loaded is said as not loaded, never as no records', () => {
  const section = buildConductRecords({ conductEvidence: undefined });
  assert.deepEqual([section.loaded, section.total, section.lines], [false, 0, []]);
  assert.equal(buildConductRecords({ conductEvidence: undefined, error: 'internal' }).error, 'internal');
  const model = buildStudentCaseReview(caseInputs());
  assert.equal(model.conduct.loaded, false);
  assert.equal(model.dataSources.conductRecords.loaded, false);
  assert.equal(model.dataSources.familyContacts.count, null);
  assert.ok(model.evidenceGaps.includes('Conduct records and family contacts could not be loaded.'));
  assert.ok(buildStudentCaseReview(caseInputs({ conductEvidenceError: 'permission-denied' })).evidenceGaps.includes('Conduct records and family contacts could not be loaded (permission-denied).'));
  // Loaded, the gap is gone.
  assert.ok(!buildStudentCaseReview(caseInputs({ conductEvidence: response() })).evidenceGaps.some((line) => /^Conduct records/.test(line)));
});

test('the section counts what was recorded over the case\'s window, type by type, and names no type it has no record of', () => {
  const model = buildStudentCaseReview(caseInputs({ conductEvidence: response() }));
  const section = model.conduct;
  assert.equal(section.loaded, true);
  // The server's window starts earlier; the case's own (Sep 1 to Oct 12) bounds the section.
  assert.deepEqual([model.meta.fromDateKey, model.meta.toDateKey], ['2026-09-01', '2026-10-12']);
  assert.equal(buildConductRecords({ conductEvidence: response(), fromDateKey: '2026-09-21', toDateKey: '2026-10-12' }).total, 2);
  assert.deepEqual(section.incidents.map((row) => row.label), ['Tardy', 'ID Violation · ID not displayed (no lanyard)', 'ID Violation · ID not displayed (no lanyard)', 'Device Collected']);
  // Catalog order; Dress Code has no record (both of its taps were undone), so it is not listed at all.
  assert.deepEqual(section.byType.map((entry) => [entry.type, entry.count, entry.days]), [['tardy', 1, 1], ['idViolation', 2, 2], ['deviceCollected', 1, 1]]);
  assert.deepEqual(section.byType[1].details, [{ id: 'noLanyard', label: 'ID not displayed (no lanyard)', count: 2 }]);
  assert.deepEqual(section.form, { submitted: 2, waiting: 1, needsCheck: 1 });
  assert.equal(section.days, 3);
  assert.deepEqual(section.lines, [
    '4 conduct records on 3 school days: Tardy 1 · ID Violation 2 · Device Collected 1.',
    'District form: 2 of 4 sent, 1 waiting to send, 1 to check.',
    '3 family contacts logged: Missing work 1 · Behavior 1 · Positive contact 1; 1 follow-up still open.',
  ]);
  assert.equal(section.note, CONDUCT_RECORDS_NOTE);
  assert.match(section.note, /not evidence that it did not happen/);
  assert.ok(section.incidents.every((row) => row.provenance === CASE_PROVENANCE.STAFF));
  assert.ok(section.contacts.every((row) => row.provenance === CASE_PROVENANCE.STAFF));
  assert.deepEqual([model.dataSources.conductRecords.count, model.dataSources.familyContacts.count], [4, 3]);
  // Loaded with nothing recorded: said once, plainly, for each kind.
  assert.deepEqual(buildConductRecords({ conductEvidence: { incidents: [], contacts: [] } }).lines, [
    'No conduct records in the Discipline Tracker for this window.',
    'No family contacts logged in Parent Contacts for this window.',
  ]);
  // More on the server than was read: a gap, and the source says so.
  const cut = buildStudentCaseReview(caseInputs({ conductEvidence: response({ truncated: { incidents: true } }) }));
  assert.ok(cut.evidenceGaps.includes(CONDUCT_RECORDS_TRUNCATED));
  assert.equal(cut.dataSources.conductRecords.note, CONDUCT_RECORDS_TRUNCATED);
});

test('no conduct record changes a grade, a narrative fact or the attention summary', () => {
  const without = buildStudentCaseReview(caseInputs({ conductEvidence: { incidents: [], contacts: [] } }));
  const withRecords = buildStudentCaseReview(caseInputs({ conductEvidence: response() }));
  assert.ok(withRecords.conduct.total > 0 && without.conduct.total === 0);
  assert.deepEqual(withRecords.narrativeFacts, without.narrativeFacts);
  assert.deepEqual(withRecords.attention, without.attention);
  assert.deepEqual(withRecords.assignments.map((row) => row.gradeItems), without.assignments.map((row) => row.gradeItems));
  assert.deepEqual(withRecords.summary, without.summary);
});

test('the timeline carries each record and each contact, staff documented, the teacher\'s note labelled as theirs', () => {
  const model = buildStudentCaseReview(caseInputs({ conductEvidence: response() }));
  const conduct = model.timeline.entries.filter((entry) => entry.group === 'conduct');
  assert.deepEqual(conduct.map((entry) => entry.kind), ['conduct-record', 'conduct-record', 'family-contact', 'conduct-record', 'family-contact', 'family-contact', 'conduct-record']);
  assert.ok(conduct.every((entry) => entry.provenance === CASE_PROVENANCE.STAFF));
  const first = conduct[0];
  assert.equal(first.label, 'Conduct record: Tardy');
  assert.equal(first.detail, '8:05 AM · Algebra I — Period 2 (synthetic) · Sent to the district form');
  const call = conduct.find((entry) => entry.kind === 'family-contact');
  assert.equal(call.label, 'Family contact (phone call): Behavior');
  assert.equal(call.detail, 'Discipline message sent · Follow-up 2026-09-15 (completed)');
  assert.deepEqual(call.details, [{ label: TEACHER_AUTHORED_NOTE, value: 'Spoke with a parent about the ID expectation.' }]);
  assert.deepEqual(conductTimelineEntries(buildConductRecords({ conductEvidence: undefined })), []);
});

test('the conduct CSV has a row per record and per contact, formula-safe, the teacher\'s words in their own columns', () => {
  const model = buildStudentCaseReview(caseInputs({ conductEvidence: response() }));
  const lines = caseConductCsv(model).trim().split('\r\n');
  assert.equal(lines.length, 1 + 4 + 3);
  assert.equal(lines[0], 'Record,School day,Recorded at,What,Class,District form,Contact method,Outcome (teacher-authored),Follow-up,"Notes (teacher-authored: the teacher\'s own words, not a recorded fact)",How known');
  assert.match(lines[1], /^Conduct record,2026-09-08,2026-09-08T13:05:00\.000Z,Tardy,Algebra I — Period 2 \(synthetic\),Sent to the district form,,,,,Staff documented$/);
  assert.ok(lines.some((line) => line.startsWith('Family contact,2026-09-08,') && line.includes('Phone call') && line.includes('2026-09-15 (completed)')));
  // A note that looks like a formula is written as text.
  const formula = lines.find((line) => line.includes('HYPERLINK'));
  assert.doesNotMatch(formula, /,"?=HYPERLINK/);
  // Not loaded: the header only.
  assert.equal(caseConductCsv(buildStudentCaseReview(caseInputs())).trim().split('\r\n').length, 1);
});

/* ------------------------------------------------------------ the screen */

test('the case review loads the section, shows it, prints it and exports it', () => {
  const store = readFileSync('src/platform/caseReview/caseReviewStore.js', 'utf8');
  assert.match(store, /export const CONDUCT_EVIDENCE_CALLABLE = 'loadStudentConductEvidence';/);
  assert.match(store, /loadConductEvidence\(\{ functions, studentId, fromDateKey: window\.fromDateKey, toDateKey: window\.toDateKey \}\)/);
  // An optional source: a failed read is "not loaded", never a failed case review.
  assert.match(store, /const \[history, transfer, evidence, saved, grants, signals, conduct\] = await Promise\.allSettled\(\[/);
  assert.match(store, /conductEvidence: settledValue\(conduct\) \|\| undefined,\s*conductEvidenceError: settledError\(conduct\),/);

  const view = executableSource(readFileSync('src/components/teacher/caseReview/StudentCaseReviewView.jsx', 'utf8'));
  assert.match(view, /\{ key: 'conduct', label: 'Conduct & family contact' \}/);
  assert.match(view, /conductEvidence: records\.conductEvidence,\s*conductEvidenceError: records\.conductEvidenceError,/);
  assert.match(view, /case 'conduct': return <CaseConductTab model=\{model\} \/>;/);
  assert.match(view, /if \(kind === 'conduct'\) download\(caseConductCsv\(model\), caseReviewFileName\(model, 'conduct-and-family-contact', 'csv'\), 'text\/csv'\);/);
  assert.match(view, /onClick=\{\(\) => exportsFor\('conduct'\)\}>Conduct CSV<\/button>/);

  const tab = executableSource(readFileSync('src/components/teacher/caseReview/CaseConductTab.jsx', 'utf8'));
  assert.match(tab, /if \(!conduct\?\.loaded\) \{/);
  assert.match(tab, /That is a missing read, not an absence of records\./);
  assert.match(tab, /<th>Outcome \(teacher-written\)<\/th>/);
  assert.match(tab, /<th>Notes \(teacher-written\)<\/th>/);

  const print = executableSource(readFileSync('src/components/teacher/caseReview/CasePrintView.jsx', 'utf8'));
  assert.match(print, /<section data-print-conduct>\s*<h2>\{title\('conduct'\)\}<\/h2>/);
  assert.match(print, /The conduct records and family contacts were not loaded for this case review\./);

  const summary = executableSource(readFileSync('src/components/teacher/caseReview/CaseSummaryTab.jsx', 'utf8'));
  assert.match(summary, /onClick=\{\(\) => onOpenTab\('conduct'\)\}/);

  const timeline = executableSource(readFileSync('src/components/teacher/caseReview/CaseTimelineTab.jsx', 'utf8'));
  assert.match(timeline, /\{ key: 'conduct', label: 'Conduct & family contact' \}/);
});
