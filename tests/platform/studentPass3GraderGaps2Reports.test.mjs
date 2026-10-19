// The read-only counts of student pass 3, wave 7 (grader gaps 2), for the
// owner to run against production. Here they run against a database that
// throws on any write; tests/integration/orderedPairTextKeysReport.test.mjs
// runs the CLI against a seeded Firestore emulator.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSIGNMENT_FIELDS,
  orderedPairKeyKind,
  parseReportArgs,
  runOrderedPairTextKeysReport,
} from '../../scripts/report-ordered-pair-text-keys.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);

/** An in-memory Firestore that refuses every write and applies field masks as Firestore does. */
export const readOnlyStore = (documents) => {
  const attempts = [];
  const guard = (target, label) => new Proxy(target, {
    get(object, property) {
      if (WRITE_METHODS.has(property)) {
        return () => { attempts.push(`${label}.${String(property)}`); throw new Error(`write refused: ${label}.${String(property)}`); };
      }
      return object[property];
    },
  });
  const masked = (data, fields) => {
    if (!fields) return structuredClone(data);
    const out = {};
    fields.forEach((field) => {
      const parts = field.split('.');
      let source = data;
      for (const part of parts) source = source?.[part];
      if (source === undefined) return;
      let target = out;
      parts.slice(0, -1).forEach((part) => { target[part] ??= {}; target = target[part]; });
      target[parts.at(-1)] = structuredClone(source);
    });
    return out;
  };
  const reads = [];
  const masks = [];
  const snapshot = (docPath, fields = null) => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').at(-1), exists: data !== undefined, ref: { path: docPath }, data: () => (data === undefined ? undefined : masked(data, fields)) };
  };
  const query = (collectionPath, state = { limit: Infinity, after: null, fields: null }) => guard({
    orderBy: () => query(collectionPath, state),
    select: (...fields) => { masks.push(fields); return query(collectionPath, { ...state, fields }); },
    limit: (count) => query(collectionPath, { ...state, limit: count }),
    startAfter: (doc) => query(collectionPath, { ...state, after: doc }),
    get: async () => {
      reads.push(collectionPath);
      let rows = [...documents.keys()].filter((key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/')).sort();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      return { docs: rows.slice(0, state.limit).map((key) => snapshot(key, state.fields)) };
    },
  }, `query(${collectionPath})`);
  const docRef = (docPath) => guard({ id: docPath.split('/').at(-1), path: docPath, get: async () => snapshot(docPath) }, `doc(${docPath})`);
  const db = guard({
    collection: (name) => guard({ ...query(name), doc: (id) => docRef(`${name}/${id}`) }, `collection(${name})`),
    getAll: async (...args) => {
      reads.push('getAll');
      const options = args.at(-1)?.fieldMask ? args.pop() : {};
      if (options.fieldMask) masks.push(options.fieldMask);
      return args.map((ref) => snapshot(ref.path, options.fieldMask || null));
    },
  }, 'db');
  return { db, attempts, reads, masks };
};

const seeded = () => {
  const docs = new Map();
  docs.set('assignments/A-pairs', {
    title: 'Systems', schemaVersion: 5, assignedClassIds: ['c1'],
    studentOverrides: { S1: { lateDueAt: 'per-student-secret' } },
    sections: [{ id: 'pr', role: 'practice', title: 'Practice', questions: [
      { type: 'orderedPair', questionId: 'p1', prompt: 'Where?', answer: '(2,3)' },
      { type: 'orderedPair', questionId: 'p2', prompt: 'Where?', answer: [2, 5] },
      { type: 'orderedPair', questionId: 'p3', prompt: 'Where?', answer: 'none' },
      { type: 'orderedPair', questionId: 'p4', prompt: 'Name the point.', generator: { kind: 'orderedPair' } },
      { type: 'orderedPair', questionId: 'p5', prompt: 'Where?', answer: [1, 1], variants: [{ answer: '(1/2, 4)' }] },
      { type: 'literal', questionId: 'p6', acceptedAnswers: ['(2,3)'] },
    ] }],
  });
  docs.set('assignments/B-clean', { title: 'Clean', schemaVersion: 5, archived: true, sections: [{ role: 'dol', questions: [{ type: 'orderedPair', answer: [0, 0] }] }] });
  docs.set('assignments/C-legacy', { title: 'Flat', questions: [{ type: 'orderedPair', answer: '(4, -1)', activityRole: 'classwork' }] });
  docs.set('grades/S1', { displayName: 'never read', gradesByAssignment: { 'A-pairs': {} } });
  return readOnlyStore(docs);
};

test('the store refuses writes, so the report test below would catch one', () => {
  const { db, attempts } = seeded();
  assert.throws(() => db.collection('assignments').doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.equal(attempts.length, 2);
});

test('each key is classified the way the grader now reads it', () => {
  assert.equal(orderedPairKeyKind({ answer: '(2,3)' }), 'textPairNowGraded');
  assert.equal(orderedPairKeyKind({ solution: '(1/2, -3)' }), 'textPairNowGraded');
  assert.equal(orderedPairKeyKind({ answer: [2, 3] }), 'arrayKey');
  assert.equal(orderedPairKeyKind({ answer: 'none' }), 'textNotAPair');
  assert.equal(orderedPairKeyKind({ answer: '(1,2,3)' }), 'textNotAPair');
  assert.equal(orderedPairKeyKind({}), 'noKey');
});

test('the report counts text pair keys in sections, variants and legacy lists; reads assignments only, masked; never a write', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runOrderedPairTextKeysReport({ db, pageSize: 1, now: () => Date.UTC(2026, 9, 19, 12) });
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.totals, {
    assignmentsRead: 3, textPairNowGraded: 3, textNotAPair: 1, arrayKey: 3, noKey: 1, assignmentsWithTextKeys: 2, assignedWithTextKeys: 1,
  });
  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), ['A-pairs', 'C-legacy']);
  assert.deepEqual(report.assignments[0].questions.map(({ questionId, variant, kind, key }) => ({ questionId, variant, kind, key })), [
    { questionId: 'p1', variant: null, kind: 'textPairNowGraded', key: '(2,3)' },
    { questionId: 'p3', variant: null, kind: 'textNotAPair', key: 'none' },
    { questionId: 'p5', variant: 0, kind: 'textPairNowGraded', key: '(1/2, 4)' },
  ]);
  assert.deepEqual(attempts, []);
  assert.ok(reads.every((name) => name === 'assignments'), reads.join());
  assert.ok(masks.length && masks.every((fields) => JSON.stringify(fields) === JSON.stringify(ASSIGNMENT_FIELDS)));
  assert.doesNotMatch(JSON.stringify(report), /per-student-secret|never read/);
  const named = await runOrderedPairTextKeysReport({ db, assignmentIds: ['C-legacy', 'gone'] });
  assert.deepEqual(named.missingAssignments, ['gone']);
  assert.equal(named.totals.textPairNowGraded, 1);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-ordered-pair-text-keys.mjs'), 'utf8'))
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /export const REPORT_DIR = 'release-reports';/);
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports$/m);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--assignment', 'a']), /--project is required/);
});
