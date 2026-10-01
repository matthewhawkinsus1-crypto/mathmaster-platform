// TEACHER SURFACES NAME STUDENTS, NEVER BY THEIR ID.
//
// The gradebook, Grade Export, weekly Path, Classroom linking, case review,
// support evidence, parent contacts, admin roster screens and the student
// pickers all used to build a name with an ad-hoc chain that ended in the
// student's id ("displayName || name || id"). For a Classroom-linked legacy
// student whose only name is googleName — or a student with no name at all —
// that chain printed '900103' where a child's name belonged, and some of those
// strings were persisted.
//
// Every surface now resolves names through src/platform/studentName.js:
//   a real name (first/last, displayName, googleName, legacy fields), or
//   "Name unavailable" with the id beside it, labelled "ID 900103".
//
// The roster below is synthetic: invented names only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource, assertCapability } from './helpers/sourceContract.mjs';

import { STUDENT_NAME_UNAVAILABLE } from '../../src/platform/studentName.js';
import {
  buildTransferUnit,
  createExportSnapshot,
  packageManifest,
  teamsCsv,
  transferStudentLabel,
} from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { weeklyPathGradebookRows } from '../../src/platform/path/weeklyPathGradebook.js';
import { classGradeProgress, classLiveProgress } from '../../src/platform/teacher/assignmentProgress.js';
import {
  buildStudentProgressBrief,
  contactsCsv,
  groupContactsByStudent,
  progressBriefText,
} from '../../src/platform/teacher/parentContactCenter.js';
import { buildRosterMatchPlan, mathMasterStudentLabel } from '../../src/classroomRosterMatching.js';
import { gradeSyncStudentDisplay } from '../../src/classroomGradeSyncUi.js';
import { buildSupportEvidenceReport } from '../../src/platform/supportEvidence/supportEvidenceReport.js';
import { searchTeacherWorkspace } from '../../src/platform/teacher/teacherSearch.js';
import { buildInstructionalGroups } from '../../src/platform/teacher/instructionalGroups.js';
import { bandDistribution } from '../../src/platform/teacher/classOverview.js';
import { buildTeacherTierGroupings } from '../../src/platform/analytics/multiStakeholderAnalytics.js';
import {
  detectGradebookLayout,
  extractStudentGradebook,
  parseDelimitedText,
} from '../../src/platform/caseReview/sisGradebookImport.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// --- The synthetic roster -------------------------------------------------------------------

const STRUCTURED = { id: '900101', firstName: 'Rowan', lastName: 'Exampleton', classId: 'class-a', classPeriod: 'Period 1' };
const GOOGLE_ONLY = { id: '900102', googleName: 'Quinn Samplewood', classId: 'class-a', classPeriod: 'Period 1' };
const NAMELESS = { id: '900103', classId: 'class-a', classPeriod: 'Period 1' };
const ID_AS_NAME = { id: '900104', displayName: '900104', classId: 'class-a', classPeriod: 'Period 1' };
const TWIN_A = { id: '900105', firstName: 'Avery', lastName: 'Testerly', classId: 'class-a', classPeriod: 'Period 1' };
const TWIN_B = { id: '900106', firstName: 'Avery', lastName: 'Testerly', classId: 'class-a', classPeriod: 'Period 1' };
const ROSTER = [NAMELESS, TWIN_B, GOOGLE_ONLY, ID_AS_NAME, STRUCTURED, TWIN_A];
const IDS = ROSTER.map((student) => student.id);

/** A displayed name must never be (or merely wrap) a bare student id. */
const assertNotAnId = (value, context) => {
  const text = String(value ?? '');
  assert.ok(!IDS.includes(text.trim()), `${context}: "${text}" is a bare student id`);
  assert.doesNotMatch(text, /^(?:Student\s*)?\d+$/, `${context}: "${text}" reads as an id, not a name`);
};

// --- Grade Export ---------------------------------------------------------------------------

const assignment = { id: 'a1', title: 'Synthetic Practice', lateDueAt: '2026-09-16T23:00:00Z' };
const klass = { classId: 'class-a', name: 'Algebra 1', period: 'Period 1' };
const AFTER_DUE = Date.parse('2026-09-17T12:00:00Z');

test('Grade Export problem rows carry studentId plus a real name or null — never the id as the name', () => {
  // No finalized grade for anyone: every student becomes a problem row.
  const unit = buildTransferUnit({
    classRecord: klass, assignment, students: ROSTER, now: AFTER_DUE, projectCanonicalGrade: () => null,
  });
  const byId = new Map(unit.problems.map((row) => [row.studentId, row]));
  assert.equal(unit.problems.length, ROSTER.length, 'two students with the same name stay two rows');
  assert.equal(byId.get('900101').name, 'Rowan Exampleton');
  assert.equal(byId.get('900102').name, 'Quinn Samplewood', 'googleName is a name');
  assert.equal(byId.get('900103').name, null, 'a nameless student stores no name');
  assert.equal(byId.get('900104').name, null, 'a displayName equal to the id is not a name');
  assert.equal(byId.get('900105').name, 'Avery Testerly');
  assert.equal(byId.get('900106').name, 'Avery Testerly');
  unit.problems.forEach((row) => assertNotAnId(row.name ?? '', 'problem row name'));

  assert.equal(transferStudentLabel(byId.get('900103')), `${STUDENT_NAME_UNAVAILABLE} · ID 900103`);
  assert.equal(transferStudentLabel(byId.get('900102')), 'Quinn Samplewood');
});

test('withheld rows persisted in an export snapshot never store the id as a name, and the MANIFEST labels it', () => {
  const extended = (student) => ({ ...student, gradesByAssignment: { a1: { score: 90 } }, extendTo: '2026-09-20T23:00:00Z' });
  const unit = buildTransferUnit({
    classRecord: klass,
    assignment,
    students: [extended(NAMELESS), extended(ID_AS_NAME), extended(GOOGLE_ONLY), { ...STRUCTURED, sisStudentId: '900101', gradesByAssignment: { a1: { score: 88 } } }],
    now: AFTER_DUE,
    projectCanonicalGrade: ({ student }) => student.gradesByAssignment.a1.score,
    resolveStudentFinalDeadline: ({ student }) => student.extendTo || null,
  });
  assert.equal(unit.withheld.length, 3);
  const snapshot = createExportSnapshot({ unit, transferId: 't1', teacherUid: 'u1', teacherEmail: 't@example.test', packageId: 'p1' });
  snapshot.withheld.forEach((row) => {
    assert.ok(row.name === null || !IDS.includes(row.name), `persisted withheld name must not be an id: ${row.name}`);
  });
  const manifest = packageManifest([unit]);
  assert.match(manifest, /Name unavailable · ID 900103/);
  assert.match(manifest, /Name unavailable · ID 900104/);
  assert.match(manifest, /Quinn Samplewood/);
  assert.doesNotMatch(manifest, /\(900103|, 900103\b|\(900104|, 900104\b/, 'no id is listed as a name');
  // The TEAMS file itself stays name-free.
  assert.doesNotMatch(teamsCsv(unit.rows), /Rowan|Exampleton|Name unavailable/);
});

test('a legacy snapshot that stored the id as the name reads as unavailable; a current roster name wins', () => {
  const legacyRow = { studentId: '900103', name: '900103', reason: 'Active individual extension' };
  assert.equal(transferStudentLabel(legacyRow), `${STUDENT_NAME_UNAVAILABLE} · ID 900103`);
  const corrected = new Map([['900103', { id: '900103', firstName: 'Sage', lastName: 'Fixtureton' }]]);
  assert.equal(transferStudentLabel(legacyRow, corrected), 'Sage Fixtureton');
});

// --- Weekly Path gradebook --------------------------------------------------------------------

test('weekly Path gradebook rows name every student, including googleName-only ones', () => {
  const rows = weeklyPathGradebookRows({ students: ROSTER, now: AFTER_DUE });
  const nameOf = (id) => rows.find((row) => row.studentId === id).studentName;
  assert.equal(nameOf('900101'), 'Rowan Exampleton');
  assert.equal(nameOf('900102'), 'Quinn Samplewood');
  assert.equal(nameOf('900103'), STUDENT_NAME_UNAVAILABLE);
  assert.equal(nameOf('900104'), STUDENT_NAME_UNAVAILABLE);
  rows.forEach((row) => assertNotAnId(row.studentName, 'weekly Path row'));
  assert.equal(rows.length, ROSTER.length);
});

// --- Assignment progress (Assignment Hub) -------------------------------------------------------

test('assignment progress lists name each student, label the nameless by id, and keep duplicates apart', () => {
  const live = classLiveProgress({ assignment: { id: 'a1' }, roster: ROSTER, presenceById: {}, nowValue: AFTER_DUE });
  const names = live.notConnected.map((row) => row.name);
  assert.deepEqual(names, [
    'Exampleton, Rowan',
    'Samplewood, Quinn',
    'Testerly, Avery',
    'Testerly, Avery',
    `${STUDENT_NAME_UNAVAILABLE} · ID 900103`,
    `${STUDENT_NAME_UNAVAILABLE} · ID 900104`,
  ], 'named students first, then the nameless — each labelled with its id');
  assert.deepEqual(live.notConnected.slice(2, 4).map((row) => row.id), ['900105', '900106'], 'same-name students stay two rows, by id');
  names.forEach((name) => assertNotAnId(name, 'live progress row'));

  const grades = classGradeProgress({ assignment: { id: 'a1', sections: [] }, roster: ROSTER, hasGradeRecords: true });
  grades.rows.forEach((row) => assertNotAnId(row.name, 'grade progress row'));
  assert.equal(grades.rows.find((row) => row.id === '900102').name, 'Samplewood, Quinn');
});

// --- Parent contacts ----------------------------------------------------------------------------

test('parent contact history resolves names from the roster, never from an id stored as studentName', () => {
  const contacts = [
    { id: 'c1', studentId: '900103', studentName: '900103', occurredAt: '2026-09-02T10:00:00Z', method: 'phone' },
    { id: 'c2', studentId: '900102', studentName: '', occurredAt: '2026-09-03T10:00:00Z', method: 'email' },
    { id: 'c3', studentId: '900105', studentName: 'Avery Testerly', occurredAt: '2026-09-04T10:00:00Z', method: 'phone' },
    { id: 'c4', studentId: '900106', studentName: 'Avery Testerly', occurredAt: '2026-09-05T10:00:00Z', method: 'phone' },
    { id: 'c5', studentId: '900199', studentName: 'Morgan Oldrecord', occurredAt: '2026-09-06T10:00:00Z', method: 'phone' },
  ];
  const groups = groupContactsByStudent({ contacts, students: ROSTER });
  const group = (id) => groups.find((entry) => entry.studentId === id);
  assert.equal(group('900102').studentName, 'Quinn Samplewood', 'googleName from the roster');
  assert.equal(group('900103').studentName, STUDENT_NAME_UNAVAILABLE, 'a stored id is not a name');
  assert.equal(group('900103').nameMissing, true);
  assert.equal(group('900199').studentName, 'Morgan Oldrecord', 'a real stored name survives when the roster has none');
  assert.equal(groups.length, 5, 'same-name students are two groups');
  assert.equal(groups.at(-1).studentId, '900103', 'students with no name sort last');
  groups.forEach((entry) => assertNotAnId(entry.studentName, 'contact group'));

  const csv = contactsCsv({ contacts, students: ROSTER, classes: [klass] });
  assert.match(csv, /"Name unavailable","900103"/, 'the id is its own column, the name column says it is missing');
  assert.doesNotMatch(csv, /"900103","900103"/);
});

test('a progress brief for a nameless student says so and shows the id labelled', () => {
  const brief = buildStudentProgressBrief({ student: NAMELESS });
  assert.equal(brief.studentName, STUDENT_NAME_UNAVAILABLE);
  assert.match(progressBriefText(brief), /^Student Progress Brief — Name unavailable \(ID 900103\)/);
  assert.equal(buildStudentProgressBrief({ student: GOOGLE_ONLY }).studentName, 'Quinn Samplewood');
});

// --- Classroom roster linking and grade passback ---------------------------------------------

test('the Classroom linking label is a name or "Name unavailable" — never the id', () => {
  assert.equal(mathMasterStudentLabel(STRUCTURED), 'Exampleton, Rowan');
  assert.equal(mathMasterStudentLabel(GOOGLE_ONLY), 'Quinn Samplewood');
  assert.equal(mathMasterStudentLabel(NAMELESS), STUDENT_NAME_UNAVAILABLE);
  assert.equal(mathMasterStudentLabel(ID_AS_NAME), STUDENT_NAME_UNAVAILABLE);
  assert.equal(mathMasterStudentLabel({ id: '900107', profile: { firstName: 'Ellis', lastName: 'Mockford' } }), 'Mockford, Ellis');
  ROSTER.forEach((student) => assertNotAnId(mathMasterStudentLabel(student), 'roster link label'));
});

test('Classroom name matching uses real names only, and never merges two same-name students', () => {
  const plan = buildRosterMatchPlan({
    mathMasterStudents: ROSTER,
    classroomStudents: [
      { googleUserId: 'g1', name: 'Quinn Samplewood', email: '' },
      { googleUserId: 'g2', name: '900104', email: '' },
      { googleUserId: 'g3', name: 'Avery Testerly', email: '' },
    ],
  });
  assert.equal(plan[0].status, 'exact-name');
  assert.equal(plan[0].suggestedStudent.id, '900102', 'a googleName is a name to match on');
  assert.equal(plan[1].status, 'unmatched', 'an id stored as displayName is not a name to match on');
  assert.equal(plan[2].status, 'ambiguous', 'two students with the same name are never merged');
  assert.deepEqual(plan[2].candidates.map((student) => student.id).sort(), ['900105', '900106']);
});

test('grade passback rows show the roster name, and "Name unavailable" with the id kept separate', () => {
  assert.deepEqual(gradeSyncStudentDisplay({ studentId: '900102' }, ROSTER), { name: 'Quinn Samplewood', studentId: '900102' });
  assert.deepEqual(gradeSyncStudentDisplay({ studentId: '900103', studentName: '900103' }, ROSTER), { name: STUDENT_NAME_UNAVAILABLE, studentId: '900103' });
  assert.equal(gradeSyncStudentDisplay({ studentId: '900104' }, ROSTER).name, STUDENT_NAME_UNAVAILABLE);
});

// --- Case review / support evidence ------------------------------------------------------------

test('the support evidence report never puts the id in meta.studentName', () => {
  const report = (student, studentName = '') => buildSupportEvidenceReport({
    student, studentName, assignments: [], nowValue: Date.parse('2026-10-01T12:00:00Z'),
  });
  assert.equal(report(NAMELESS).meta.studentName, STUDENT_NAME_UNAVAILABLE);
  assert.equal(report(NAMELESS).meta.studentId, '900103');
  assert.equal(report(ID_AS_NAME, '900104').meta.studentName, STUDENT_NAME_UNAVAILABLE, 'an id passed in as the name is refused');
  assert.equal(report(GOOGLE_ONLY).meta.studentName, 'Quinn Samplewood');
  assert.equal(report(STRUCTURED, 'Rowan Exampleton').meta.studentName, 'Rowan Exampleton');
});

test('an SIS gradebook offers a googleName student\'s row as a name candidate, and a nameless student none', () => {
  const rows = parseDelimitedText('Student,Lesson 1\n"Samplewood, Quinn",90\n"900104",80\n').rows;
  const layout = detectGradebookLayout(rows);
  const googleOnly = extractStudentGradebook({ rows, layout, student: { ...GOOGLE_ONLY, id: 'S900102' } });
  assert.equal(googleOnly.nameCandidates.length, 1);
  const idAsName = extractStudentGradebook({ rows, layout, student: { ...ID_AS_NAME, id: 'S900104' } });
  assert.equal(idAsName.nameCandidates.length, 0, 'an id stored as displayName is not a name to match on');
});

// --- Search, groups, overview, analytics --------------------------------------------------------

test('teacher search finds students by first, last, display name and id, and never titles one with its id', () => {
  const titles = (query) => searchTeacherWorkspace({ query, students: ROSTER, limit: 20 })
    .filter((result) => result.kind === 'student')
    .map((result) => [result.id, result.title, result.subtitle]);
  assert.deepEqual(titles('rowan').map(([id]) => id), ['900101'], 'first name');
  assert.deepEqual(titles('exampleton').map(([id]) => id), ['900101'], 'last name');
  assert.deepEqual(titles('samplewood').map(([id]) => id), ['900102'], 'googleName');
  assert.deepEqual(titles('testerly').map(([id]) => id).sort(), ['900105', '900106'], 'both same-name students');
  const byId = titles('900103');
  assert.deepEqual(byId.map(([id]) => id), ['900103'], 'search by id still works');
  assert.equal(byId[0][1], STUDENT_NAME_UNAVAILABLE, 'the title says the name is missing');
  assert.match(byId[0][2], /^ID 900103/, 'the id is the labelled subtitle');
  ['rowan', 'samplewood', '900103', '900104', 'testerly'].flatMap(titles).forEach(([, title]) => assertNotAnId(title, 'search title'));
});

test('instructional groups, class bands and tier groupings name students and sort the nameless last', () => {
  const groups = buildInstructionalGroups({ students: ROSTER, profilesByStudentId: {} });
  const members = groups.flatMap((group) => group.students);
  assert.equal(members.length, ROSTER.length);
  members.forEach((member) => assertNotAnId(member.studentName, 'instructional group member'));
  const baseline = groups.find((group) => group.students.length === ROSTER.length).students;
  assert.deepEqual(baseline.slice(-2).map((member) => member.studentId), ['900103', '900104']);

  const bands = bandDistribution(ROSTER, {});
  assert.deepEqual(bands.unclassified.map((entry) => entry.studentName), [
    'Avery Testerly', 'Avery Testerly', 'Quinn Samplewood', 'Rowan Exampleton', STUDENT_NAME_UNAVAILABLE, STUDENT_NAME_UNAVAILABLE,
  ]);
  assert.deepEqual(bands.unclassified.slice(0, 2).map((entry) => entry.studentId), ['900105', '900106']);

  const tiers = buildTeacherTierGroupings(ROSTER.map((student) => ({ ...student, studentId: student.id })));
  const tierRows = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
  assert.equal(tierRows.find((row) => row.id === '900102').name, 'Quinn Samplewood');
  assert.equal(tierRows.find((row) => row.id === '900103').name, STUDENT_NAME_UNAVAILABLE);
  tierRows.forEach((row) => assertNotAnId(row.name, 'tier grouping row'));
});

// --- Source contracts for the .jsx surfaces ---------------------------------------------------
//
// node cannot import .jsx, so these read the source. Each is bound to the
// statement that does the work, and every function a screen newly calls is
// asserted to be imported (lint has no no-undef here).

const importsFrom = (source, name, modulePattern) => new RegExp(
  `import \\{[^}]*\\b${name}\\b[^}]*\\} from '${modulePattern}'`,
).test(source);
const assertImported = (source, names, modulePattern, file) => names.forEach((name) => {
  assert.ok(importsFrom(source, name, modulePattern), `${file} calls ${name} and must import it`);
});
const STUDENT_NAME_MODULE = '[./]*platform/studentName(?:\\.js)?';

test('Texas Standards renders the student name with the id as a secondary line, not the id as the name', () => {
  const file = 'src/TexasStandardsDashboard.jsx';
  const source = read(file);
  const row = region(source, '{students.map((student) => {', '</tr>', 'standards student row');
  assert.doesNotMatch(executableSource(row), /fontWeight: 800 \}\}>\{student\.id\}/, 'the name cell must not render the bare id');
  assert.match(row, /\{formatStudentName\(student\)\}<div[^>]*>\{studentIdLabel\(student\)\}/);
  const aside = region(source, '{selectedStudent ? (', ') : <p', 'selected student panel');
  assert.doesNotMatch(executableSource(aside), /<h3[^>]*>\{selectedStudent\.id\}<\/h3>/);
  assert.match(aside, /<h3[^>]*>\{formatStudentName\(selectedStudent\)\}<\/h3>/);
  assertImported(source, ['formatStudentName', 'studentIdLabel', 'compareStudentsByName'], STUDENT_NAME_MODULE, file);
});

test('Student Access adds or edits a name through teacherAdmin.setStudentName, reloads, and tells the app', () => {
  const file = 'src/SignInAccess.jsx';
  const source = read(file);
  const save = region(source, 'const saveStudentName = async', '\n  };', 'saveStudentName');
  assert.match(save, /validateStudentNameInput\(/, 'the name is checked before it is sent');
  assert.match(save, /teacherAdmin\.setStudentName\(\{ studentId, firstName: checked\.firstName, lastName: checked\.lastName \}\)/);
  // After a successful save: reload this screen's listSignInAccess, then the app.
  const afterSave = save.slice(save.indexOf('teacherAdmin.setStudentName'));
  assert.ok(afterSave.indexOf('await refresh()') > 0, 'the screen reloads listSignInAccess after saving');
  assert.ok(afterSave.indexOf('onStudentIdentityChanged?.()') > afterSave.indexOf('await refresh()'), 'the app is told after the reload');
  assert.match(source, /export default function SignInAccess\(\{[^)]*onStudentIdentityChanged = null[^)]*\}\)/);
  assert.match(source, /refresh = useCallback\(async \(\) => \{[\s\S]*?teacherAdmin\.listSignInAccess\(\)/, 'refresh is the listSignInAccess reload');

  // The editor is labelled, and the per-row action says what it does.
  assert.match(source, /<label[^>]*>First name<input required autoFocus value=\{nameEditor\.firstName\}/);
  assert.match(source, /<label[^>]*>Last name<input required value=\{nameEditor\.lastName\}/);
  assert.match(source, /\{nameMissing \? 'Add name' : 'Edit name'\}/);
  assert.match(source, /onSubmit=\{saveStudentName\}/);

  // The diagnostic count comes from the rows' nameMissing flag.
  assert.match(source, /const isNameMissing = \(student\) => student\?\.nameMissing === true \|\| !hasStudentName\(student\);/);
  assert.match(source, /const namelessCount = useMemo\(\(\) => access\.students\.filter\(isNameMissing\)\.length/);
  const diagnostic = region(source, '{!loading && namelessCount > 0 && (', '</p>', 'nameless diagnostic');
  assert.match(diagnostic, /\{namelessCount\} student\{namelessCount === 1 \? ' has' : 's have'\} no name on file\./);

  // Toasts and the delete dialog name the student, with the id labelled.
  const code = executableSource(source);
  assert.doesNotMatch(code, /`\$\{student\.studentId\} (can now|is no longer)/);
  assert.doesNotMatch(code, /`\$\{studentId\} and its MathMaster data/);
  assert.doesNotMatch(code, /Permanently delete \{deleteTarget\.studentId\}\?/);
  assert.match(source, /const studentLabel = formatStudentLabel\(student, \{ includeId: true \}\);/);
  assert.match(source, /`\$\{studentLabel\} can now set a new PIN/);

  assertImported(source, ['formatStudentLabel', 'formatStudentName', 'hasStudentName', 'studentNameParts', 'studentSearchText', 'compareStudentsByName'], STUDENT_NAME_MODULE, file);
  assert.ok(importsFrom(source, 'validateStudentNameInput', '\\.\\./functions/shared/studentIdentity\\.mjs'), `${file} must import validateStudentNameInput`);
  assert.ok(importsFrom(source, 'teacherAdmin', '\\./auth/authService'), `${file} must import teacherAdmin`);
});

test('authService exposes setStudentName as the setStudentName callable', () => {
  const service = read('src/auth/authService.js');
  const wrapper = region(service, 'setStudentName: (', '.then((result) => result.data || {}),', 'setStudentName wrapper');
  assert.match(wrapper, /callable\('setStudentName'\)\(\{\s*studentId: [^,]+,\s*firstName: [^,]+,\s*lastName: [^,]+,?\s*\}\)/);
  assert.match(region(service, 'export const teacherAdmin = {', '\n};', 'teacherAdmin'), /setStudentName: \(/);
});

test('StudentNameLink has no id fallback: a missing name reads "Name unavailable" with a labelled id', () => {
  const file = 'src/components/common/StudentNameLink.jsx';
  const source = read(file);
  const code = executableSource(source);
  assert.doesNotMatch(code, /studentName \|\| String\(studentId/);
  assert.doesNotMatch(code, /\|\| String\(studentId/);
  assert.match(source, /const name = acceptStudentName\(studentName, \{ studentId \}\) \|\| STUDENT_NAME_UNAVAILABLE;/);
  assert.match(source, /const idLabel = name === STUDENT_NAME_UNAVAILABLE \? studentIdLabel\(studentId\) : '';/);
  assertImported(source, ['acceptStudentName', 'STUDENT_NAME_UNAVAILABLE', 'studentIdLabel'], STUDENT_NAME_MODULE, file);
});

test('no surface owned here builds a name with a chain that ends in the id', () => {
  const files = [
    'src/platform/gradeTransfer/gradeTransferModel.js',
    'src/components/teacher/GradeTransferCenter.jsx',
    'src/platform/path/weeklyPathGradebook.js',
    'src/platform/teacher/assignmentProgress.js',
    'src/components/teacher/AssignmentSupportLayer.jsx',
    'src/platform/teacher/parentContactCenter.js',
    'src/platform/analytics/multiStakeholderAnalytics.js',
    'src/platform/resources/teacherAssignmentWorksheetExport.js',
    'src/classroomRosterMatching.js',
    'src/classroomGradeSyncUi.js',
    'src/components/teacher/caseReview/StudentCaseReviewView.jsx',
    'src/components/teacher/SupportEvidenceReportView.jsx',
    'src/platform/supportEvidence/supportEvidenceReport.js',
  ];
  const ID_ENDING_CHAIN = /(?:displayName|\.name|studentName)\b[^;\n]{0,80}\|\|\s*(?:String\()?(?:clean\()?(?:student\??\.)?(?:id|studentId)\b(?!:)/;
  files.forEach((file) => {
    assert.doesNotMatch(executableSource(read(file)), ID_ENDING_CHAIN, `${file} still names a student with a chain ending in the id`);
  });
});

test('Grade Export names SIS-fix rows and held-back students with labels, from the roster it already holds', () => {
  const file = 'src/components/teacher/GradeTransferCenter.jsx';
  const source = read(file);
  const sis = region(source, 'const sisProblems = useMemo(', '}, [authorizedClassIds', 'SIS problem list');
  assert.match(sis, /\.sort\(compareStudentsByName\)/);
  assert.match(sis, /name: formatStudentLabel\(student\)/);
  assert.match(source, /aria-label=\{`District student ID for \$\{problem\.name\}`\}/);
  assert.match(source, /const identityIndex = useMemo\(\(\) => studentIdentityIndexFor\(students \|\| \[\]\), \[students\]\);/);
  assert.match(source, /\{personLabel\(item\)\}: \{item\.reason\}/);
  assert.match(source, /plan\.withheld\.map\(personLabel\)/);
  assertImported(source, ['compareStudentsByName', 'formatStudentLabel', 'studentIdentityIndexFor'], STUDENT_NAME_MODULE, file);
  assert.ok(importsFrom(source, 'transferStudentLabel', '\\.\\./\\.\\./platform/gradeTransfer/gradeTransferModel\\.js'));
});

test('weekly auto-publish preview rows are named from the roster the grade panel passes in', () => {
  const file = 'src/components/teacher/WeeklyPathAutoPublish.jsx';
  const source = read(file);
  const list = region(source, 'preview.results.slice(0, 40).map((row) => (', '</li>', 'preview row');
  assert.doesNotMatch(executableSource(list), /\{row\.studentId\}:/);
  assert.match(list, /\{previewStudentLabel\(row\.studentId, identityIndex\)\}:/);
  assert.match(source, /export default function WeeklyPathAutoPublish\(\{ classId = null, weekKey = null, students = \[\] \}\)/);
  assert.match(source, /const identityIndex = studentIdentityIndexFor\(students\);/);
  assertImported(source, ['STUDENT_NAME_UNAVAILABLE', 'formatStudentLabel', 'resolveRosterStudentName', 'studentIdentityIndexFor'], STUDENT_NAME_MODULE, file);
  assert.match(read('src/components/teacher/WeeklyPathGradePanel.jsx'), /<WeeklyPathAutoPublish classId=\{classId\} weekKey=\{weekKey\} students=\{students\} \/>/);
});

test('case review and the support report headers never print the id where the name belongs', () => {
  const caseFile = 'src/components/teacher/caseReview/StudentCaseReviewView.jsx';
  const caseView = read(caseFile);
  assert.doesNotMatch(executableSource(caseView), /studentName \|\| student\.id/);
  assert.match(caseView, /\{resolvedStudentName\} · ID \{student\.id\}/);
  assert.match(caseView, /acceptStudentName\(studentName, student \|\| \{\}\) \|\| formatStudentName\(student \|\| \{\}, \{ lastFirst: false \}\)/);
  assertImported(caseView, ['acceptStudentName', 'formatStudentName'], '[./]*platform/studentName\\.js', caseFile);

  const reportFile = 'src/components/teacher/SupportEvidenceReportView.jsx';
  const reportView = read(reportFile);
  assert.doesNotMatch(executableSource(reportView), /studentName \|\| student\.id/);
  assert.match(reportView, /\{acceptStudentName\(studentName, student\) \|\| formatStudentName\(student, \{ lastFirst: false \}\)\} · ID \{student\.id\}/);
  assertImported(reportView, ['acceptStudentName', 'formatStudentName'], STUDENT_NAME_MODULE, reportFile);
});

test('student pickers show the name, or "Name unavailable · ID x", so two nameless students differ', () => {
  const pickers = [
    ['src/components/teacher/TeacherAssignmentPdfDialog.jsx', /<option key=\{student\.id\} value=\{student\.id\}>\s*\{formatStudentLabel\(student\)\}/],
    ['src/components/assessment/TeacherSecureExamDashboard.jsx', /<option value=\{student\.id\} key=\{student\.id\}>\{formatStudentLabel\(student\)\}/],
    ['src/components/teacher/ParentContactCenter.jsx', /<option key=\{entry\.id\} value=\{entry\.id\}>\{formatStudentLabel\(entry\)\}/],
    ['src/ClassroomManagerV2.jsx', /<option key=\{student\.id\} value=\{student\.id\}>\{mathMasterStudentLabel\(student\)\} · ID \{student\.id\}<\/option>/],
  ];
  pickers.forEach(([file, option]) => {
    const source = read(file);
    assert.match(source, option, `${file} option text`);
    if (/formatStudentLabel/.test(option.source)) assertImported(source, ['formatStudentLabel'], STUDENT_NAME_MODULE, file);
  });
});

test('a parent contact stores a real name or nothing — never "Name unavailable" or the id', () => {
  const file = 'src/components/teacher/ParentContactCenter.jsx';
  const source = read(file);
  const save = region(source, 'const save = async (event) => {', '\n  };', 'save contact');
  assert.match(save, /studentName: student \? studentNameForStorage\(student\) \|\| '' : ''/);
  assert.doesNotMatch(save, /studentName: student \? formatStudentName/);
  assert.ok(importsFrom(source, 'studentNameForStorage', '\\.\\./\\.\\./\\.\\./functions/shared/studentIdentity\\.mjs'));
});

test('admin roster toasts name the student with a labelled id, not the bare id', () => {
  const file = 'src/components/admin/ClassesAdmin.jsx';
  const source = read(file);
  const code = executableSource(source);
  assert.doesNotMatch(code, /`\$\{student\.studentId\} (is now in|was removed|can sign in|is deactivated|added to)/);
  assertCapability(code, [/`\$\{formatStudentLabel\(student, \{ includeId: true \}\)\} is now in/], 'move toast names the student');
  assertImported(source, ['formatStudentLabel', 'studentIdentityIndexFor'], STUDENT_NAME_MODULE, file);
});

test('a personalized worksheet names its student, or labels the id — the id is never printed as the name', () => {
  const source = read('src/platform/resources/teacherAssignmentWorksheetExport.js');
  const helper = region(source, 'const displayNameFor = (student) => {', '\n};', 'displayNameFor');
  assert.match(helper, /return formatStudentLabel\(student, \{ lastFirst: false \}\);/);
  assert.doesNotMatch(executableSource(helper), /student\.id/);
});
