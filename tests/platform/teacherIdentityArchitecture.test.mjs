// HOW TEACHER SCREENS GET STUDENT NAMES: one projected roster, one index, no id.
//
// The fix for the numeric-id-as-name defect (PR #314's compact roster dropped
// googleName, and Live View fell back to the id) has two halves that can each
// regress quietly:
//
//   PERFORMANCE  Names come from the lightweight listSignInAccess roster and an
//                identity index built from it once per refetch. Nothing reads a
//                student's grades document, or opens a listener, to learn a
//                name, and the one full-data listener does not churn.
//   PRESENTATION No screen promotes the id to the name. A student with no name
//                on file reads "Name unavailable", with the id beside it and
//                labelled as an id.
//
// Node cannot import .jsx, so the screen-side half is asserted on source text,
// bound to the statement that does the work (see AGENTS.md and
// tests/platform/helpers/sourceContract.mjs). The behaviour behind these
// contracts — the real callable, normaliser, index and Live classifier run
// together — is in studentIdentityContract.test.mjs (Tests A-E, H).
//
// Acceptance tests here: F (performance architecture), G (listener
// stability), I (major teacher surfaces). Synthetic names only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as identity from '../../functions/shared/studentIdentity.mjs';
import * as studentNameModule from '../../src/platform/studentName.js';
import * as rosterSummaryModule from '../../src/platform/teacher/teacherRosterSummary.js';
import {
  buildStudentIdentityIndex,
  formatStudentName,
  studentIdentityIndexFor,
} from '../../src/platform/studentName.js';
import { normalizeTeacherRosterSummary } from '../../src/platform/teacher/teacherRosterSummary.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const code = (path) => executableSource(read(path));

const walk = (directory) => readdirSync(join(ROOT, directory)).flatMap((entry) => {
  const path = join(directory, entry);
  return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
});
const SRC_FILES = walk('src').filter((path) => /\.(?:jsx?|mjs)$/.test(path) && !/\.test\./.test(path)).sort();

const APP = code('src/App.jsx');
const SERVER = code('functions/index.js');

/** Every `import ... from '...'` in a module: [{ specifier, names }] (local names). */
const importsOf = (source) => [...source.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)]
  .map(([, clause, specifier]) => {
    const names = [];
    const defaultName = clause.match(/^([\w$]+)/);
    if (defaultName) names.push(defaultName[1]);
    const namespace = clause.match(/\*\s+as\s+([\w$]+)/);
    if (namespace) names.push(namespace[1]);
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      braces[1].split(',').map((part) => part.trim()).filter(Boolean)
        .forEach((part) => names.push(part.split(/\s+as\s+/).at(-1).trim()));
    }
    return { specifier, names };
  });
const withoutImports = (source) => source.replace(/\bimport\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '');

const NAME_MODULE_SPECIFIER = /(?:^|\/)(?:platform\/studentName|platform\/teacher\/teacherRosterSummary|teacherRosterSummary|studentName)(?:\.js)?$|functions\/shared\/studentIdentity\.mjs$/;
const importedFromNameModules = (source) => importsOf(source)
  .filter(({ specifier }) => NAME_MODULE_SPECIFIER.test(specifier))
  .flatMap(({ names }) => names);

/** Is `name` referenced as a value (a call, an argument, a prop value) outside the imports? */
const references = (source, name) => new RegExp(String.raw`(?<![\w$.'"])${name}\b(?!\s*:)(?!\s*=[^=>])`)
  .test(withoutImports(source));

// ===========================================================================
// Test F — performance architecture.
// ===========================================================================

// The tabs that may hold full grades documents. Everything else — Home,
// Classes, Live, Attendance, Assignments, Library, Pacing, Student Access —
// runs on the compact roster. Pinned exactly: adding a tab here re-subscribes
// that screen to every student's whole grades document.
const FULL_STUDENT_DATA_TABS = Object.freeze([
  'students', 'weeklyPath', 'actionCenter', 'parentContacts', 'grades', 'gradeTransfer',
  'standards', 'analytics', 'exams',
]);

test('Test F: TEACHER_FULL_STUDENT_DATA_TABS is unchanged, and only ever consulted', () => {
  const declaration = region(APP, 'const TEACHER_FULL_STUDENT_DATA_TABS = new Set([', ']);', 'full-data tab list');
  const tabs = [...declaration.matchAll(/'([^']+)'/g)].map(([, tab]) => tab);
  assert.deepEqual([...tabs].sort(), [...FULL_STUDENT_DATA_TABS].sort(), 'the full-data tab list changed');
  for (const lightTab of ['home', 'classesWorkspace', 'assignments', 'library', 'pacing', 'attendanceHistory', 'access']) {
    assert.ok(!tabs.includes(lightTab), `${lightTab} must stay on the compact roster`);
  }
  assert.equal((APP.match(/\bTEACHER_FULL_STUDENT_DATA_TABS\s*=/g) || []).length, 1);
  assert.doesNotMatch(APP, /TEACHER_FULL_STUDENT_DATA_TABS\.(?:add|delete|clear)\(/);
});

test('Test F: teacher sign-in loads names from the compact roster callable, resolved by the shared normaliser', () => {
  const teacherBranch = region(APP, "if (session.role === 'teacher') {", "if (session.role !== 'student' || !session.studentId)", 'teacher hydration');
  assert.match(teacherBranch, /\bfetchTeacherRosterSummaries\(\)/);
  assert.doesNotMatch(teacherBranch, /\b(?:getDocs?|onSnapshot)\(|['"]grades['"]/, 'teacher sign-in must not read grades documents');

  // The client roster: the callable, then the shared normaliser — the steps
  // studentIdentityContract.test.mjs runs as `clientRoster`.
  const fetchRoster = region(APP, 'const fetchTeacherRosterSummaries = async () => {', '\n  };', 'fetchTeacherRosterSummaries');
  assert.match(fetchRoster, /await teacherAdmin\.listSignInAccess\(\)/);
  assert.match(fetchRoster, /\.map\(normalizeTeacherRosterSummary\)\s*\.filter\(\(student\) => student\.id\)\s*\.sort\(compareStudentsByName\)/);
  assert.match(fetchRoster, /setTeacherRosterSummaries\(summaries\)/);
  assert.doesNotMatch(fetchRoster, /\b(?:getDocs?|onSnapshot)\(|['"]grades['"]/);
  const imports = importsOf(APP);
  const from = (name) => imports.find(({ names }) => names.includes(name))?.specifier;
  assert.match(String(from('normalizeTeacherRosterSummary')), /platform\/teacher\/teacherRosterSummary(?:\.js)?$/, 'App.jsx must import the normaliser it calls');
  assert.match(String(from('compareStudentsByName')), /platform\/studentName(?:\.js)?$/);
  assert.match(String(from('teacherAdmin')), /auth\/authService/);
  assert.doesNotMatch(APP, /const normalizeTeacherRosterSummary\s*=/, 'no second, local allow-list of name fields');
});

// Grades fields that are a student's history. The roster must never carry them.
const HISTORY_FIELDS = Object.freeze([
  'gradesByAssignment', 'assignmentActivity', 'supportUsageByAssignment', 'dolGradesByAssignment',
  'classworkGradesByAssignment', 'teacherGradeOverridesByAssignment', 'testCycleGrades',
  'sectionRecoveryByAssignment', 'classroomSyncStatusByAssignment', 'warmupChallengeByAssignment',
]);

test('Test F: listSignInAccess selects exactly the shared roster fields — every name source, no history', () => {
  const callable = region(SERVER, 'exports.listSignInAccess = onCall(', '\n});\n', 'listSignInAccess');
  const gradesReads = callable.match(/collection\("grades"\)/g) || [];
  assert.equal(gradesReads.length, 1, 'listSignInAccess reads the grades collection once');
  const select = callable.match(/collection\("grades"\)\.select\(([^)]*)\)\.get\(\)/);
  assert.ok(select, 'the grades read must be a projection');
  assert.equal(select[1].replace(/\s+/g, '').replace(/,$/, ''), '...identity.TEACHER_ROSTER_SELECT_FIELDS');
  assert.doesNotMatch(callable, /\.getAll\(|\.doc\([^)]*\)\.get\(\)/, 'no per-student document reads in the roster callable');

  HISTORY_FIELDS.forEach((field) => assert.ok(!identity.TEACHER_ROSTER_SELECT_FIELDS.includes(field), `the roster must not select ${field}`));
  identity.STUDENT_IDENTITY_FIELDS.forEach((field) => assert.ok(identity.TEACHER_ROSTER_SELECT_FIELDS.includes(field), `the roster must select ${field}`));

  // The projection loses nothing the row builder or the client normaliser
  // uses: a projected document yields the same row as the whole document.
  const project = (data) => Object.fromEntries(identity.TEACHER_ROSTER_SELECT_FIELDS
    .filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]]));
  const fullDocuments = {
    740101: { firstName: 'Rhea', lastName: 'Mockwood', displayName: 'Rhea Mockwood', sisStudentId: '5550701' },
    740102: { googleName: 'Ivo Samplecroft', googleUserId: '115500660077' },
    740103: { name: 'Fenn Fixturing' },
    740104: { studentName: 'Testard, Lumi' },
    740105: { profile: { displayName: 'Oona Draftsby' } },
    740106: { displayName: '740106', googleName: 'learner@example.test' },
  };
  Object.entries(fullDocuments).forEach(([id, names]) => {
    const document = {
      ...names, classId: 'class-f', classPeriod: 'Period 6', status: 'active', assignedTeacherEmail: 'teacher@example.test',
      gradesByAssignment: { a: { 0: { status: 'correct' } } }, assignmentActivity: { a: { totalTimeSeconds: 30 } },
    };
    const fromFull = identity.buildTeacherRosterSummaryRow(id, document);
    const fromProjection = identity.buildTeacherRosterSummaryRow(id, project(document));
    assert.deepEqual(fromProjection, fromFull, `${id}: the roster projection dropped something the row needs`);
    assert.deepEqual(normalizeTeacherRosterSummary(fromProjection), normalizeTeacherRosterSummary(fromFull));
  });
});

// Every place src/ makes a reference to a TOP-LEVEL grades document or the
// grades collection — the only way to read or listen to one. Subcollections
// (grades/{id}/scratchpads...) are not student names and are not counted.
const GRADES_REFERENCE = /\b(?:doc|collection)\(\s*db\s*,\s*['"]grades['"]\s*(?:,\s*[^,()]+(?:\([^()]*\))?\s*)?\)/g;
// Helpers that read one student's whole grades document.
const FULL_RECORD_HELPER_CALL = /\b(?:fetchStudentGradeRecord|fetchStudentMasteryState)\s*\(/g;

// The enclosing declaration of a match: a module-level function/const, or,
// in App.jsx, the App() body member (`const x =` or the effect's first line).
const MODULE_ANCHOR = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([\w$]+)|^(?:export\s+)?(?:const|let)\s+([\w$]+)\s*=/gm;
const APP_BODY_ANCHOR = /^ {2}(?:const\s+([\w$]+)\s*=|useEffect\(\(\)\s*=>\s*\{\s*\n\s*([^\n]+))/gm;
const anchorOf = (source, index, path) => {
  const patterns = path === 'src/App.jsx' ? [MODULE_ANCHOR, APP_BODY_ANCHOR] : [MODULE_ANCHOR];
  let best = null;
  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      if (match.index > index) break;
      if (!best || match.index > best.index) best = match;
    }
  });
  if (!best) return '(module scope)';
  if (best[0].includes('useEffect(')) return `useEffect: ${best[2].trim()}`;
  return best[1] || best[2];
};
const census = (pattern) => {
  const found = {};
  SRC_FILES.forEach((path) => {
    const source = code(path);
    for (const match of source.matchAll(pattern)) {
      const label = anchorOf(source, match.index, path);
      found[path] ??= {};
      found[path][label] = (found[path][label] || 0) + 1;
    }
  });
  return found;
};

// The grades-document access that exists, and why. None of it is for names.
const KNOWN_GRADES_DOCUMENT_ACCESS = {
  'src/App.jsx': {
    // Gradebook only (a full-data tab): the one-time deferred credit repair writes back.
    persistCurrentGraderCreditRepairs: 1,
    // THE one full-data listener's source: the teacher's whole class, one query.
    studentGradeSourceForViewer: 2,
    // The signed-in STUDENT's own record: queued action reconciliation…
    reconcileThroughClientTransaction: 1,
    // …session hydration (read, and its credit-repair write)…
    'useEffect: let cancelled = false;': 2,
    // …engagement time…
    flushAssignmentActivity: 1,
    // …the receipt listener on their own document…
    "useEffect: if (user?.role !== 'student' || !user.id) {": 1,
    // …and closing their own DOL entry.
    "useEffect: if (user?.role !== 'student' || !user.classPeriod) return;": 1,
    // A teacher saving a question-weight change migrates the affected grades in one transaction.
    saveQuestionEditor: 1,
    // The profile drawer: ONE student, when a teacher opens them.
    "useEffect: if (user?.role !== 'teacher' || !profileDrawerStudentId) {": 1,
    // Assignment Hub "who has finished?": one class, on request.
    loadClassGradeRecords: 1,
    // Repair-from-Library writes corrected grades.
    handleRepairAssignmentFromLibrary: 1,
    // Permanent assignment deletion cleans up every grades document.
    deleteAssignmentPermanently: 1,
  },
  'src/platform/supportEvidence/supportEvidenceStore.js': {
    // Writes the support profile projection.
    saveSupportProfileRevision: 1,
    // One student's record for the evidence views, on request.
    fetchStudentGradeRecord: 1,
  },
  // The signed-in student's own Path.
  'src/services/masteryStateService.js': { fetchStudentMasteryState: 1 },
};
const KNOWN_FULL_RECORD_HELPER_CALLS = {
  'src/components/student/MyMathPathApp.jsx': { MyMathPathApp: 1 },
  'src/components/teacher/AssignmentSupportLayer.jsx': { AssignmentSupportLayer: 1 },
  'src/components/teacher/SupportEvidenceReportView.jsx': { SupportEvidenceReportView: 1 },
  'src/platform/caseReview/caseReviewStore.js': { loadStudentCaseRecords: 1 },
};

test('Test F: no screen reads or listens to grades documents to learn a name — the access that exists is inventoried', () => {
  const guidance = 'A student\'s name comes from the compact roster (teacherRosterSummaries) through the identity index '
    + '(teacherStudentIdentityIndex / resolveRosterStudentName). Never read or subscribe to grades/{studentId} for it. '
    + 'If a NEW grades read is needed for another reason, justify it and add it here; if an existing one only moved, update its label.';
  assert.deepEqual(census(GRADES_REFERENCE), KNOWN_GRADES_DOCUMENT_ACCESS, guidance);
  assert.deepEqual(census(FULL_RECORD_HELPER_CALL), KNOWN_FULL_RECORD_HELPER_CALLS, guidance);
});

// The name modules are pure: a lookup can never turn into a Firestore read.
const relativeImports = (path) => importsOf(code(path)).map(({ specifier }) => specifier);
const resolveImport = (from, specifier) => {
  const base = normalize(join(dirname(from), specifier));
  return [base, `${base}.js`, `${base}.mjs`, `${base}.jsx`].find((candidate) => {
    try { return statSync(join(ROOT, candidate)).isFile(); } catch { return false; }
  });
};

test('Test F: name resolution is pure — the name modules never reach Firebase, React or a service', () => {
  const roots = [
    'functions/shared/studentIdentity.mjs',
    'src/platform/studentName.js',
    'src/platform/teacher/teacherRosterSummary.js',
    'src/livePresence.js',
  ];
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    relativeImports(path).forEach((specifier) => {
      assert.ok(specifier.startsWith('.'), `${path} imports the package "${specifier}"; name resolution must stay pure`);
      assert.doesNotMatch(specifier, /firebase|services\/|authService/i, `${path} imports ${specifier}`);
      const target = resolveImport(path, specifier);
      assert.ok(target, `${path}: cannot resolve ${specifier}`);
      queue.push(relative(ROOT, join(ROOT, target)));
    });
  }
  assert.ok(seen.size >= roots.length);
});

test('Test F: a corrected name reaches every screen through one roster callable — no listener, no grades read', () => {
  // Student Access saves through the callable and asks App for one roster refetch.
  const access = code('src/SignInAccess.jsx');
  assert.doesNotMatch(access, /\b(?:getDocs?|onSnapshot)\(|firebase/, 'Student Access works through callables only');
  const save = region(access, 'const saveStudentName = async', '\n  };', 'saveStudentName');
  const call = save.indexOf('teacherAdmin.setStudentName(');
  const notify = save.indexOf('onStudentIdentityChanged?.()');
  assert.ok(call > 0 && notify > call, 'the app is told only after the server saved the name');
  assert.ok(importsOf(access).some(({ names, specifier }) => names.includes('teacherAdmin') && /authService/.test(specifier)));
  assert.match(code('src/auth/authService.js'), /setStudentName:\s*\(\{[^)]*\}\)\s*=>\s*callable\('setStudentName'\)/);

  // Both Student Access mounts are wired to the refetch, and the refetch is the roster callable.
  const mounts = APP.match(/<SignInAccess\b[^>]*\/>/g) || [];
  assert.equal(mounts.length, 2, 'teacher Student Access and the admin accounts screen');
  mounts.forEach((mount) => assert.match(mount, /onStudentIdentityChanged=\{refreshTeacherRosterAfterNameChange\}/));
  const refresh = region(APP, 'const refreshTeacherRosterAfterNameChange = ', ';\n', 'refreshTeacherRosterAfterNameChange');
  assert.match(refresh, /^const refreshTeacherRosterAfterNameChange = \(\) => fetchTeacherRosterSummaries\(\)\s*\.catch\(/);
});

// ===========================================================================
// Test G — listener stability.
// ===========================================================================

/** The App.jsx effect around `anchor` (a RegExp): its body and its dependency list. */
const effectAround = (anchor, label) => {
  const match = anchor.exec(APP);
  assert.ok(match, `could not find ${label}`);
  const start = APP.lastIndexOf('useEffect(', match.index);
  const deps = /\n {2}\}, \[([\s\S]*?)\]\);/.exec(APP.slice(match.index));
  assert.ok(start !== -1 && deps, `could not find the effect and dependency list of ${label}`);
  return {
    body: APP.slice(start, match.index + deps.index),
    deps: deps[1].split(',').map((dep) => dep.trim()).filter(Boolean),
  };
};

test('Test G: the full-data grades listener does not resubscribe on assignment edits or identity changes', () => {
  assert.equal((APP.match(/onSnapshot\(\s*studentGradeSourceForViewer\(/g) || []).length, 1, 'one full-data listener');
  const { body, deps } = effectAround(/onSnapshot\(\s*studentGradeSourceForViewer\(/, 'the full-data grades listener');
  // What the listener is allowed to depend on: who the teacher is, which tab
  // is open, and the compact roster it falls back to.
  const allowed = new Set([
    'user?.role', 'user?.email', 'user?.isRootAdmin', 'teacherTab', 'teacherWorkspaceMode',
    'teacherPreviewRuntimeActive', 'teacherRosterSummaries',
  ]);
  assert.ok(deps.includes('teacherTab'), `unexpected dependency list: ${deps.join(', ')}`);
  deps.forEach((dep) => assert.ok(allowed.has(dep), `the full-data grades listener must not depend on ${dep}: every change re-reads every student's grades document`));
  // It reads assignments through the ref, which is why `assignments` can stay out of the list.
  assert.doesNotMatch(body, /\bassignments\b/);
  assert.match(body, /assignmentsRef\.current/);
  // Grade snapshots never feed the roster the identity index is built from.
  assert.doesNotMatch(body, /teacherStudentIdentityIndex|setTeacherRosterSummaries\(/);
});

test('Test G: the identity index is a memo of the compact roster alone', () => {
  const memo = region(APP, 'const teacherStudentIdentityIndex = useMemo(', ');', 'teacherStudentIdentityIndex');
  assert.match(memo, /useMemo\(\s*\(\) => buildStudentIdentityIndex\(teacherRosterSummaries\),\s*\[teacherRosterSummaries\],?\s*$/);
  assert.ok(importsOf(APP).some(({ names, specifier }) => names.includes('buildStudentIdentityIndex') && /platform\/studentName/.test(specifier)));
  // The roster (and so the index) changes only on a refetch, on sign-out, or
  // when a teacher's own save patches one row — never from a data listener.
  const writers = [...APP.matchAll(/setTeacherRosterSummaries\(/g)].map((match) => anchorOf(APP, match.index, 'src/App.jsx'));
  assert.deepEqual(writers.sort(), [
    'fetchTeacherRosterSummaries', // the listSignInAccess refetch
    'handleSupportProfileSaved', // one row's profile after the teacher saves it
    'useEffect: let cancelled = false;', // sign-out clears it
  ], 'a new writer of the compact roster rebuilds the identity index on every call');

  // Per-student presence listeners do not resubscribe when a name changes.
  const presence = effectAround(/onSnapshot\(\s*doc\(db, 'presence', studentId\)/, 'the presence listeners');
  assert.ok(presence.deps.length > 0);
  presence.deps.forEach((dep) => assert.doesNotMatch(dep, /Identity|RosterSummaries/, `presence listeners must not depend on ${dep}`));
});

test('Test G: the index is rebuilt only for a new roster array, and holds the roster rows themselves', () => {
  const roster = ['740201', '740202'].map((studentId, index) => normalizeTeacherRosterSummary({
    studentId, firstName: ['Kit', 'Nell'][index], lastName: 'Stubbington', classId: 'class-g',
  }));
  const index = buildStudentIdentityIndex(roster);
  assert.equal(index.get('740201'), roster[0], 'references, not copies');
  assert.equal(studentIdentityIndexFor(roster), studentIdentityIndexFor(roster), 'cached per roster array');
  assert.equal(studentIdentityIndexFor(index), index, 'a Map passes straight through');

  // A refetch after a name change is a new array, so the index follows it.
  const refetched = roster.map((row) => (row.id === '740202' ? normalizeTeacherRosterSummary({ ...row, firstName: 'Nella' }) : row));
  assert.notEqual(studentIdentityIndexFor(refetched), studentIdentityIndexFor(roster));
  assert.equal(formatStudentName(studentIdentityIndexFor(refetched).get('740202'), { lastFirst: false }), 'Nella Stubbington');
});

// ===========================================================================
// Test I — major teacher surfaces.
// ===========================================================================

const PATH = String.raw`(?:[\w$]+(?:\?\.|\.))*`;
// A student's id: `studentId` (bare or a property) or `.id` of something named for a student.
const STUDENT_ID = String.raw`(?:String\(\s*)?(?:${PATH}studentId|${PATH}[\w$]*[Ss]tudent[\w$]*(?:\?\.|\.)id)\b(?!\s*(?:\(|\[|\.\w))`;
const ANY_ID = String.raw`(?:String\(\s*)?${PATH}(?:studentId|id)\b(?!\s*(?:\(|\[|\.\w))`;
const OR = String.raw`\s*(?:\|\||\?\?)\s*`;
const CHAIN = String.raw`(?:[\w$?.]+${OR})*`;
const NAME_HELPER_CALL = String.raw`\b(?:formatStudentName|resolveRosterStudentName|studentNameForStorage|acceptStudentName|rosterStudentNameForStorage)\([^()]*(?:\([^()]*\)[^()]*)*\)`;

// Each shape the defect took. Comments are stripped before matching, so a
// comment explaining the rule never trips it.
const ID_AS_NAME_PATTERNS = Object.freeze({
  'the removed fallbackToId option': /\bfallbackToId\b/g,
  // Any name/label/title value (displayName, studentName, resolvedName, tileLabel…).
  'a name chain that ends in the student id': new RegExp(String.raw`\b[\w$]*(?:[Nn]ame|[Ll]abel|[Tt]itle)${OR}${CHAIN}${STUDENT_ID}`, 'g'),
  // A value named for a student's name (studentName, storedStudentName, studentLabel…) is
  // unambiguous, so ANY id at the end of its chain is the defect.
  'a student-name value that falls back to an id': new RegExp(String.raw`\b[\w$]*[Ss]tudent(?:Name|Label|DisplayName)${OR}${CHAIN}${ANY_ID}`, 'g'),
  'a name helper whose result falls back to an id': new RegExp(String.raw`${NAME_HELPER_CALL}${OR}${ANY_ID}`, 'g'),
  'a stored studentName set to an id': new RegExp(String.raw`\bstudentName\s*:\s*(?:[^,\n{}]*?(?:\|\||\?\?|\?|:)\s*)?${ANY_ID}\s*[,}\n)]`, 'g'),
  'a stored displayName set to the student id': new RegExp(String.raw`\bdisplayName\s*:\s*(?:[^,\n{}]*?(?:\|\||\?\?|\?|:)\s*)?${STUDENT_ID}\s*[,}\n)]`, 'g'),
  'an id label used as a name ("Student 101410")': new RegExp(String.raw`\bStudent #?\$\{\s*${STUDENT_ID}\s*\}|['"]Student #?['"]\s*\+\s*${STUDENT_ID}`, 'g'),
  'the student id rendered as an element\'s leading text': new RegExp(String.raw`(?<![=\-])>\s*\{\s*${STUDENT_ID}\s*\}`, 'g'),
});

// Matches that are legitimate, each with the check that keeps it legitimate.
const ID_AS_NAME_ALLOWED = Object.freeze([
  {
    file: 'src/components/teacher/StudentPersistenceRecoveryPanel.jsx',
    match: '>{proposal.studentId}',
    why: 'the cell under the table\'s own "Student ID" column; the name is the cell before it',
    stillTrue: (source) => /'Student', 'Student ID'/.test(source) && /\{nameOf\(proposal\)\}<\/td><td style=\{CELL\}>\{proposal\.studentId\}/.test(source),
  },
]);

const idAsNameFindings = (source) => Object.entries(ID_AS_NAME_PATTERNS).flatMap(([shape, pattern]) => (
  [...source.matchAll(pattern)].map((match) => ({ shape, match: match[0].replace(/\s+/g, ' ').trim() }))
));

test('Test I: the id-as-name sweep recognises every historical shape of the defect, and leaves real id uses alone', () => {
  // Paraphrases of code this defect actually shipped (identifiers only).
  const shipped = [
    "formatStudentName(student, { lastFirst: false, fallbackToId: true })",
    "toastSuccess('Cleared', `${studentName || id} is back to the normal adaptive Path priorities.`);",
    'const event = { studentName: studentName || studentId, kind };',
    'const nameOf = (student) => student?.displayName || student?.id;',
    'name: student.displayName || student.name || student.id,',
    "studentName: clean(event.studentName) || studentId,",
    "const display = student.displayName || student.name || String(student.id);",
    "name: studentName || fallbackName || (studentId ? `Student ${studentId}` : 'Unknown student'),",
    "const label = studentName || String(studentId || '');",
    'const label = formatStudentName(student, { fallbackToNeutral: false }) || student.id;',
    'name: resolvedName || student?.id || STUDENT_NAME_UNAVAILABLE,',
    'const tileLabel = row.studentName ?? row.studentId;',
    'const event = { studentId: id, studentName: storedStudentName || id };',
    'const payload = { studentName: hasName ? name : id, kind };',
    'displayName: firebaseUser.displayName || claims.studentId,',
    "<td style={{ padding: '10px' }}>{student.id}<div>{student.classPeriod}</div></td>",
    '<h3 style={{ margin: 0 }}>{selectedStudent.id}</h3>',
    '<option value={student.id}>{student.id}</option>',
    '<li key={row.studentId}>\n  {row.studentId}\n</li>',
  ];
  shipped.forEach((line) => assert.ok(idAsNameFindings(line).length > 0, `the sweep must catch: ${line}`));

  const legitimate = [
    '<tr key={student.id} onClick={() => setSelectedStudentId(student.id)}>',
    'teacherAdmin.setStudentClass({ studentId: student.studentId, classId })',
    "<strong>{formatStudentName(student)}</strong><span> · ID {student.studentId}</span>",
    'const subtitle = `ID ${student.id}${student.classPeriod ? ` · ${student.classPeriod}` : ""}`;',
    "const id = String(student.id || student.studentId || '');",
    'const label = catalog?.label || entry.id;',
    "String(item?.label || item?.name || item?.id || '')",
    'disabled={deleteConfirmation !== `DELETE ${deleteTarget.studentId}`}',
    'studentName: rosterStudentNameForStorage({ studentId: id, index }),',
    'name: resolvedName || STUDENT_NAME_UNAVAILABLE,',
    '<option value={student.id}>{formatStudentLabel(student)}</option>',
    'studentId: student.id || student.studentId,',
    'aria-label={`Open ${formatStudentLabel(student)}`}',
  ];
  legitimate.forEach((line) => assert.deepEqual(idAsNameFindings(line), [], `false positive on: ${line}`));
});

test('Test I: no file in src/ presents a student id as the student\'s name', () => {
  const findings = SRC_FILES.flatMap((path) => idAsNameFindings(code(path)).map((finding) => ({ path, ...finding })))
    .filter(({ path, match }) => !ID_AS_NAME_ALLOWED.some((allowed) => allowed.file === path && allowed.match === match));
  assert.deepEqual(findings, [], 'Use formatStudentName / formatStudentLabel (the id shown as "ID x"), '
    + 'resolveRosterStudentName for a stored studentId, and studentNameForStorage (a name or null) for anything persisted.');
  ID_AS_NAME_ALLOWED.forEach((allowed) => {
    assert.ok(allowed.stillTrue(read(allowed.file)), `${allowed.file}: the allowance "${allowed.match}" no longer holds (${allowed.why})`);
  });
});

const NAME_HELPERS = [...new Set([
  ...Object.keys(studentNameModule), ...Object.keys(rosterSummaryModule), ...Object.keys(identity),
])].filter((name) => name !== 'default');

// Node cannot import .jsx, so no test executes these screens: a helper called
// without its import is a ReferenceError only a teacher would find. `npm run
// lint` (oxlint no-undef on src/**) also reports it; this keeps the guard in
// the platform test gate too, scoped to the name helpers this fix spread.
test('Test I: every name helper a src file uses is imported — a call without an import is a runtime ReferenceError', () => {
  assert.ok(NAME_HELPERS.includes('formatStudentName') && NAME_HELPERS.includes('rosterStudentLabel'));
  const missing = SRC_FILES.flatMap((path) => {
    const source = code(path);
    const imported = new Set(importsOf(source).flatMap(({ names }) => names));
    return NAME_HELPERS
      .filter((name) => references(source, name))
      .filter((name) => !imported.has(name) && !new RegExp(String.raw`(?:const|let|var|function|class)\s+${name}\b`).test(source))
      .map((name) => `${path}: ${name}`);
  });
  assert.deepEqual(missing, [], 'add the import next to the call (node cannot import .jsx, so nothing else here would execute it)');
});

// The screens a teacher names students on, and how each gets its names.
const MAJOR_SURFACES = Object.freeze({
  'Teacher Home': 'src/TeacherHome.jsx',
  'Live Class Monitor': 'src/components/teacher/LiveClassMonitor.jsx',
  'Classes Workspace': 'src/ClassesWorkspace.jsx',
  'Assignment Hub': 'src/components/teacher/AssignmentHub.jsx',
  'Gradebook (App)': 'src/App.jsx',
  'Student Support Dashboard': 'src/components/teacher/StudentSupportDashboard.jsx',
  'Student Case Review': 'src/components/teacher/caseReview/StudentCaseReviewView.jsx',
  'Support Evidence Report': 'src/components/teacher/SupportEvidenceReportView.jsx',
  'Parent Contact Center': 'src/components/teacher/ParentContactCenter.jsx',
  'Quick search': 'src/platform/teacher/teacherSearch.js',
  'Grade Export': 'src/components/teacher/GradeTransferCenter.jsx',
  'Action Center': 'src/components/teacher/TeacherActionCenter.jsx',
  'Submission recovery': 'src/components/teacher/StudentPersistenceRecoveryPanel.jsx',
  'Attendance history': 'src/components/teacher/AttendanceHistoryPanel.jsx',
  'Student Access': 'src/SignInAccess.jsx',
  'Classes admin': 'src/components/admin/ClassesAdmin.jsx',
  'Texas standards': 'src/TexasStandardsDashboard.jsx',
  'Weekly Path auto-publish': 'src/components/teacher/WeeklyPathAutoPublish.jsx',
});

test('Test I: every major teacher surface names students through the shared name helpers', () => {
  Object.entries(MAJOR_SURFACES).forEach(([surface, path]) => {
    const source = code(path);
    const helpers = importedFromNameModules(source);
    assert.ok(helpers.length > 0, `${surface} (${path}) must import its name helpers from src/platform/studentName.js`);
    helpers.forEach((helper) => assert.ok(references(source, helper), `${surface}: ${helper} is imported but never used`));
  });

  // Live tiles are named by livePresence, which resolves through the shared helper.
  const monitor = code('src/components/teacher/LiveClassMonitor.jsx');
  assert.ok(importsOf(monitor).some(({ names, specifier }) => names.includes('summarizeLiveClass') && /livePresence/.test(specifier)));
  const classify = region(code('src/livePresence.js'), 'export const classifyLiveStudent', 'if (!live || !live.assignmentId)', 'classifyLiveStudent');
  assert.match(classify, /const resolvedName = formatStudentName\(student, \{ lastFirst: false, fallbackToNeutral: false \}\);/);
  assert.match(classify, /name: resolvedName \|\| STUDENT_NAME_UNAVAILABLE,/);

  // Teacher Home looks stored ids up in the index App builds from the roster.
  assert.match(region(APP, '<TeacherHome', '/>', 'TeacherHome mount'), /studentIdentityIndex=\{teacherStudentIdentityIndex\}/);
});

test('Test I: the profile drawer and the gradebook show the formatted name, and the id only as an id', () => {
  // The drawer is handed the name; it never derives one from the id.
  const drawerMount = region(APP, '<StudentProfileDrawer', '/>', 'StudentProfileDrawer mount');
  assert.match(drawerMount, /studentName=\{profileDrawerStudent \? formatStudentName\(profileDrawerStudent\) : ''\}/);
  const drawer = code('src/components/teacher/StudentProfileDrawer.jsx');
  assert.match(drawer, /<h2[^>]*>\{studentName\}<\/h2>/);
  assert.doesNotMatch(drawer, /<h2[^>]*>\{studentId\}/);

  // Gradebook rows: the name link, then the labelled id.
  const gradebook = region(APP, "{teacherTab === 'grades' && (", "{teacherTab === '", 'gradebook');
  assert.match(gradebook, /<StudentNameLink studentId=\{student\.id\} studentName=\{formatStudentName\(student\)\}/);
  assert.match(gradebook, />ID \{student\.id\}<\/div>/);
  assert.match(gradebook, /<h3[^>]*>\{formatStudentName\(student\)\} · \{selectedAssignment\.title\}<\/h3>/);

  // StudentNameLink itself has no id fallback (the sweep covers the chain;
  // this pins that it resolves before rendering).
  const link = code('src/components/common/StudentNameLink.jsx');
  assert.ok(importedFromNameModules(link).length > 0);
});
