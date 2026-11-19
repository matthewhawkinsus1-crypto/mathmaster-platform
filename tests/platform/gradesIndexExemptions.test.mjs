// A STUDENT'S GRADE DOCUMENT NEVER RUNS OUT OF FIRESTORE INDEX ENTRIES.
//
// Nov 16, 2026: every write to one student's grades/{studentId} failed with
// "3 INVALID_ARGUMENT: too many index entries for entity /grades/…". Firestore
// indexes every field of a document by default, every nested map key included,
// and caps a document at 40,000 index entries. gradesByAssignment alone (19
// assignments of per-question response maps) held about 32,000 of them. So the
// student's submissions, step work and progress all failed, and 34 waited on
// the device. 18 of the 194 grade documents were past 30,000 that day.
//
// No query reads those maps: grades are queried by classId, classPeriod,
// assignedTeacherEmail and sisStudentId only. The maps that grow with every
// assignment are exempted from single-field indexing (firestore.indexes.json),
// which is what keeps a document far below the limit. This test holds both
// halves: every per-assignment map is exempted, and no query on grades filters
// or orders by anything but the fields that stay indexed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const indexes = JSON.parse(read('firestore.indexes.json'));

// The maps on grades/{studentId} keyed by assignment (or by date inside one): they grow without bound.
const GROWING_MAPS = [
  'gradesByAssignment',
  'classroomSectionSyncStatusByAssignment',
  'assignmentActivity',
  'classroomReleaseSignals',
  'sectionRecoveryByAssignment',
  'dolGradesByAssignment',
  'classworkGradesByAssignment',
  'supportUsageByAssignment',
  'classroomSyncStatusByAssignment',
  'teacherGradeOverridesByAssignment',
  'testCycleGrades',
];
// What grades are queried by. These must stay indexed.
const QUERIED_FIELDS = ['classId', 'classPeriod', 'assignedTeacherEmail', 'sisStudentId'];

const gradeOverrides = () => (indexes.fieldOverrides || []).filter((override) => override.collectionGroup === 'grades');

test('every map that grows with assignments is exempted from indexing on grades', () => {
  const byField = new Map(gradeOverrides().map((override) => [override.fieldPath, override]));
  for (const field of GROWING_MAPS) {
    const override = byField.get(field);
    assert.ok(override, `firestore.indexes.json must exempt grades.${field}`);
    assert.deepEqual(override.indexes, [], `grades.${field}: no single-field index at all`);
    assert.notEqual(override.ttl, true, `grades.${field} is not a TTL field`);
  }
});

test('nothing grades are queried by is exempted', () => {
  const exempted = new Set(gradeOverrides().map((override) => override.fieldPath));
  for (const field of QUERIED_FIELDS) assert.ok(!exempted.has(field), `grades.${field} is queried and must stay indexed`);
  for (const field of exempted) {
    assert.ok(!QUERIED_FIELDS.some((queried) => queried === field || queried.startsWith(`${field}.`)), `${field} covers a queried field`);
  }
});

const sourceFiles = (dir) => {
  const out = [];
  const walk = (relative) => {
    for (const name of readdirSync(path.join(root, relative))) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const child = path.join(relative, name);
      if (statSync(path.join(root, child)).isDirectory()) walk(child);
      else if (/\.(c|m)?jsx?$/.test(name)) out.push(child);
    }
  };
  walk(dir);
  return out;
};
const FILES = [
  ...readdirSync(path.join(root, 'functions')).filter((name) => /\.(c|m)?js$/.test(name)).map((name) => path.join('functions', name)),
  ...sourceFiles('functions/lib'),
  ...sourceFiles('functions/shared'),
  ...sourceFiles('src'),
  ...sourceFiles('scripts'),
];

// The text of each query started on the grades collection itself: from the
// collection reference to the end of the statement, stopping at .doc( (a
// document or a subcollection under it is not a query on grades).
const gradeQueries = () => {
  const found = [];
  const start = /collection\(\s*(?:db\s*,\s*)?["']grades["']\s*\)/g;
  for (const file of FILES) {
    const source = read(file);
    for (const match of source.matchAll(start)) {
      const rest = source.slice(match.index + match[0].length, match.index + match[0].length + 600);
      if (/^\s*\.doc\(/.test(rest)) continue;
      const end = rest.search(/;|\.get\(|\.doc\(|onSnapshot\(|\n\s*\n/);
      found.push({ file, text: end === -1 ? rest : rest.slice(0, end) });
    }
  }
  return found;
};

test('every query on grades filters and orders only by fields that stay indexed', () => {
  const queries = gradeQueries();
  assert.ok(queries.length >= 15, `the scan finds the grades queries (found ${queries.length})`);
  const exempted = new Set(gradeOverrides().map((override) => override.fieldPath));
  let constrained = 0;
  for (const { file, text } of queries) {
    for (const clause of text.matchAll(/\b(where|orderBy)\(\s*([^,)]+)/g)) {
      constrained += 1;
      const argument = clause[2].trim();
      const literal = argument.match(/^["']([^"']+)["']$/);
      if (!literal) {
        // A non-literal is allowed only for the document id.
        assert.match(argument, /documentId/i, `${file}: grades ${clause[1]}(${argument}) must name its field`);
        continue;
      }
      const field = literal[1];
      assert.ok(QUERIED_FIELDS.includes(field), `${file}: grades ${clause[1]}("${field}") is not a known indexed field; add it to QUERIED_FIELDS only if it is not exempted`);
      assert.ok(![...exempted].some((map) => field === map || field.startsWith(`${map}.`)), `${file}: grades ${clause[1]}("${field}") reads an exempted map`);
    }
  }
  assert.ok(constrained >= 15, `the scan reads the where/orderBy clauses (read ${constrained})`);
});

test('every per-assignment map the code writes is in the exempted list', () => {
  const written = new Set();
  for (const file of FILES.filter((name) => !name.startsWith('scripts'))) {
    const source = read(file);
    for (const match of source.matchAll(/new FieldPath\(\s*["']([A-Za-z]+ByAssignment)["']|["'`]([A-Za-z]+ByAssignment)\.(?:\$\{|["'])/g)) {
      written.add(match[1] || match[2]);
    }
  }
  assert.ok(written.has('gradesByAssignment'), 'the scan finds the writers');
  for (const map of written) assert.ok(GROWING_MAPS.includes(map), `${map} grows with assignments and must be exempted on grades`);
});

test('the ingestion error log keeps the cause', () => {
  const source = functionsBackendSource();
  const start = source.indexOf('exports.ingestStudentSubmissions = onCall(');
  const body = source.slice(start, source.indexOf('\n});', start));
  const logs = [...body.matchAll(/logger\.error\(([^;]+?)\}\);/gs)].map((match) => match[1]);
  assert.equal(logs.length, 2, 'both ingestion error logs');
  for (const log of logs) {
    assert.match(log, /errorMessage: error\?\.message/, 'the cause goes in errorMessage');
    assert.doesNotMatch(log, /\bmessage: error/, 'a `message` field is overwritten by the logger');
  }
});
