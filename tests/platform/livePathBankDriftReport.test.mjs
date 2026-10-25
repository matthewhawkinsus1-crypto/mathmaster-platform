import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANK_COLLECTION, REPORT_DIR, STATUS, asciiPowerOverDivisorKeys, classifyLiveDocument, hasAsciiPowerOverDivisor,
  indexRepoItems, parseReportArgs, plainValue, repoBankIndex, reportFilePath, runLivePathBankDriftReport,
} from '../../scripts/report-live-path-bank-drift.mjs';
import { extraBankDocuments, extraBankPaths } from '../../scripts/lib/extraPathBanks.mjs';
import { readOnlyStore } from './helpers/readOnlyFirestore.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * GR25: the live pathQuestionBank can hold families the repository never had,
 * or a document changed after its release, and the sweep, the audit and the
 * key-shape counts read the repository only. The read-only report
 * (scripts/report-live-path-bank-drift.mjs) sorts every live document into
 * same / drifted / live-only, counts the ASCII B^(E)/N key shape, and hands
 * the documents no repository check has seen to the sweep and the audit
 * (--extra-bank). Proven here: each status on real bank items stored the ways
 * production stores them, the shape rule, the report against a database that
 * refuses every write, and that the script has no write mode.
 */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { compilePathQuestionDocument } = require('../../functions/lib/pathContentCompiler.js');

const seedItems = (file) => JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8')).documents;
const ALGEBRA1 = 'algebra1_pathQuestionBank_seed.json';
const itemById = new Map(seedItems(ALGEBRA1).map((item) => [item.id, item]));
const GEOMETRIC = 'mm_A_12D_v2_geometric-table-to-formula';
const ARITHMETIC = 'mm_A_12D_v2_arithmetic-table-to-formula';
const EDITED = 'mm_A_2D_v2_point-to-direct-variation';
const NOT_LIVE = 'mm_A_2B_v2_point-slope-form';
const smallIndex = () => indexRepoItems([GEOMETRIC, ARITHMETIC, EDITED, NOT_LIVE].map((id) => itemById.get(id)), `functions/seeds/pathQuestionBank/${ALGEBRA1}`);

// As a course release stores it (functions-path-admin releaseService): the
// compiled document with the built-in marker, and the release's bookkeeping.
const asReleased = (id) => {
  const compiled = compilePathQuestionDocument(itemById.get(id), { defaults: { builtInPathSeed: 'mathmaster-built-in-path-bank' } });
  const { id: unused, ...fields } = compiled.document;
  void unused;
  return { ...fields, pathReleaseId: 'course-path-v2-test', pathReleaseSchemaVersion: 2, pathContentHash: compiled.contentHash, seededAt: '2026-10-01T00:00:00.000Z', seededBy: 'admin' };
};
// As the admin seed import stores it (functions/index.js): no marker.
const asImported = (id) => {
  const { id: unused, ...fields } = compilePathQuestionDocument({ ...itemById.get(id), active: true }).document;
  void unused;
  return { ...fields, seededAt: '2026-10-01T00:00:00.000Z', seededBy: 'admin' };
};

test('same, drifted and live-only, on real bank items stored the ways production stores them', () => {
  const index = smallIndex();
  const live = (id, data) => plainValue({ ...data, id });
  assert.deepEqual(classifyLiveDocument(live(GEOMETRIC, asReleased(GEOMETRIC)), index.get(GEOMETRIC)), { status: STATUS.SAME, differingFields: [] }, 'a course release');
  assert.equal(classifyLiveDocument(live(ARITHMETIC, asImported(ARITHMETIC)), index.get(ARITHMETIC)).status, STATUS.SAME, 'a seed import');
  const withdrawn = { ...asImported(ARITHMETIC), active: false, withdrawnAt: 1760000000000 };
  assert.equal(classifyLiveDocument(live(ARITHMETIC, withdrawn), index.get(ARITHMETIC)).status, STATUS.SAME, 'withdrawn is still the repository\'s content');
  const edited = asReleased(EDITED);
  edited.responseFields = edited.responseFields.map((field) => ({ ...field, expected: 'y=-5x+1' }));
  edited.prompt = `${edited.prompt} (edited)`;
  assert.deepEqual(classifyLiveDocument(live(EDITED, edited), index.get(EDITED)), { status: STATUS.DRIFTED, differingFields: ['prompt', 'responseFields'] });
  assert.deepEqual(classifyLiveDocument(live('imported-elsewhere', asImported(GEOMETRIC)), index.get('imported-elsewhere')), { status: STATUS.LIVE_ONLY, differingFields: [] });
  // A Firestore Timestamp is read as its time.
  assert.deepEqual(plainValue({ at: { toDate: () => new Date(Date.UTC(2026, 9, 1)) }, rows: [{ n: 1 }] }), { at: '2026-10-01T00:00:00.000Z', rows: [{ n: 1 }] });
});

test('every repository bank item is indexed, by id', () => {
  const index = repoBankIndex();
  const ids = new Set();
  for (const file of ['act', 'algebra1', 'algebra2', 'asvab', 'digitalSAT', 'grade6', 'grade7', 'grade8', 'tsia2']) {
    seedItems(`${file}_pathQuestionBank_seed.json`).forEach((item) => ids.add(item.id));
  }
  JSON.parse(readFileSync(path.join(repo, 'functions/seeds/secureAssessments/algebra1_district_dol2.json'), 'utf8')).documents
    .forEach((item) => ids.add(item.id));
  assert.equal(index.size, ids.size);
  assert.ok([...ids].every((id) => index.has(id)));
  assert.deepEqual(index.get(GEOMETRIC).files, [`functions/seeds/pathQuestionBank/${ALGEBRA1}`]);
});

test('the ASCII B^(E)/N shape: a ^( … ) group followed by /, in stored keys and generated instances', () => {
  for (const text of ['2^(x-1)/3', '2^(x-1) / 3', 'P=100(2)^(-t)/5', 'e^((x+1)-2)/2']) assert.equal(hasAsciiPowerOverDivisor(text), true, text);
  for (const text of ['4*(2)^(n-1)', '96/2^(n-1)', '(2^(x-1))/3', '2^{x-1}/3', '2^(x-1)', 'x^2/3', '3^(x/2)']) assert.equal(hasAsciiPowerOverDivisor(text), false, text);
  // The real geometric family keys an ASCII power, with no division after it.
  assert.deepEqual(asciiPowerOverDivisorKeys(asReleased(GEOMETRIC)), []);
  const family = {
    id: 'live-family',
    prompt: 'Write the model.',
    responseFields: [
      { id: 'model', inputProfile: 'expression', expected: '({{a}}^(x-1))/{{b}}', accepted: ['{{a}}^(x-1)/{{b}}'] },
      { id: 'safe', inputProfile: 'expression', expected: '{{a}}*(2)^(x-1)' },
    ],
    generator: { parameters: { a: { type: 'int', min: 2, max: 5 }, b: { type: 'int', min: 2, max: 9 } } },
  };
  const found = asciiPowerOverDivisorKeys(family, { draws: 2 });
  assert.deepEqual(found.map((entry) => [entry.where, entry.fieldId]), [['stored', 'model'], ['draw 0', 'model'], ['draw 1', 'model']]);
  assert.match(found[0].text, /^\{\{a\}\}\^\(x-1\)\/\{\{b\}\}$/, 'an accepted form counts, the bracketed key does not');
  assert.match(found[1].text, /^\d\^\(x-1\)\/\d$/, 'drawn');
});

// A repository family with the shape, stored as authored: same, and still counted.
const SHAPED = { id: 'zz-synthetic-power', active: true, courseId: 'algebra2', prompt: 'Write the model.', responseFields: [{ id: 'm', inputProfile: 'expression', expected: '5^(t)/2' }] };
const reportIndex = () => indexRepoItems([SHAPED], 'synthetic', smallIndex());

const seeded = () => {
  const docs = new Map();
  docs.set(`${BANK_COLLECTION}/${SHAPED.id}`, (({ id, ...fields }) => { void id; return fields; })(compilePathQuestionDocument(SHAPED).document));
  docs.set(`${BANK_COLLECTION}/${GEOMETRIC}`, asReleased(GEOMETRIC));
  docs.set(`${BANK_COLLECTION}/${ARITHMETIC}`, { ...asImported(ARITHMETIC), active: false, withdrawnAt: 1760000000000 });
  const edited = asReleased(EDITED);
  edited.responseFields = edited.responseFields.map((field) => ({ ...field, expected: 'y=-5x+1' }));
  docs.set(`${BANK_COLLECTION}/${EDITED}`, edited);
  docs.set(`${BANK_COLLECTION}/live-only-model`, {
    active: true, courseId: 'algebra2', prompt: 'Write the model.', responseFields: [{ id: 'model', inputProfile: 'expression', expected: '2^(x-1)/3' }], seededAt: '2026-10-02T00:00:00.000Z',
  });
  docs.set(`${BANK_COLLECTION}/live-only-sat`, { active: true, assessmentContext: { framework: 'digitalSAT' }, prompt: 'x?', responseFields: [{ id: 'x', inputProfile: 'number', expected: '4' }] });
  // Documents the report must never read.
  docs.set('grades/S1', { displayName: 'never read' });
  docs.set(`users/${GEOMETRIC}`, { displayName: 'never read' });
  return readOnlyStore(docs);
};

test('the store really refuses writes (so the report test below would have caught one)', () => {
  const { db, attempts } = seeded();
  assert.throws(() => db.collection(BANK_COLLECTION).doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.equal(attempts.length, 2);
});

test('the report: every live document sorted, the unseen ones handed to the sweep; reads the bank only; never a write', async () => {
  const { db, attempts, reads } = seeded();
  const report = await runLivePathBankDriftReport({ db, repoIndex: reportIndex(), pageSize: 2, now: () => Date.UTC(2026, 9, 25, 12) });
  assert.deepEqual(attempts, []);
  assert.ok(reads.length >= 3 && reads.every((label) => label === BANK_COLLECTION), `paged reads of ${BANK_COLLECTION} only: ${reads}`);
  assert.equal(report.readOnly, true);
  assert.equal(report.startedAt, '2026-10-25T12:00:00.000Z');
  assert.deepEqual(report.counts, { live: 6, same: 3, drifted: 1, liveOnly: 2, repoOnly: 1, inactive: 1, editedAfterRelease: 1 });
  assert.deepEqual(report.repoOnly, [NOT_LIVE]);
  assert.deepEqual(report.byFramework, {
    course: { live: 5, same: 3, drifted: 1, liveOnly: 1 },
    digitalSAT: { live: 1, same: 0, drifted: 0, liveOnly: 1 },
  });
  assert.deepEqual(report.rows.map((row) => [row.id, row.status, row.differingFields]), [
    ['live-only-model', STATUS.LIVE_ONLY, []],
    ['live-only-sat', STATUS.LIVE_ONLY, []],
    [EDITED, STATUS.DRIFTED, ['responseFields']],
  ]);
  assert.equal(report.rows.find((row) => row.id === EDITED).editedAfterRelease, true);
  // Over every live document, the repository's own included.
  assert.deepEqual(report.asciiPowerOverDivisor, { documents: 2, keys: 2, byDocument: [{ id: 'live-only-model', status: STATUS.LIVE_ONLY, keys: 1 }, { id: SHAPED.id, status: STATUS.SAME, keys: 1 }] });
  // The documents no repository check has seen, as a bank the sweep and the audit read.
  assert.deepEqual(report.documents.map((document) => document.id), ['live-only-model', 'live-only-sat', EDITED]);
  const file = path.join(repo, 'report.json');
  const read = (name) => (name === file ? JSON.stringify(report) : assert.fail(`read ${name}`));
  assert.deepEqual(extraBankDocuments(file, read).map((document) => document.id), ['live-only-model', 'live-only-sat', EDITED]);
});

test('--extra-bank names the files the sweep and the audit add; a seed file reads as a bank too', () => {
  assert.deepEqual(extraBankPaths(['node', 'sweep', '--base', '/b', '--extra-bank', 'a.json', '--check-wrong', '--extra-bank', '/r/b.json']), [path.resolve('a.json'), '/r/b.json']);
  assert.deepEqual(extraBankPaths(['node', 'sweep', '--base', '/b']), []);
  assert.throws(() => extraBankPaths(['node', 'sweep', '--extra-bank']), /needs a file/);
  assert.throws(() => extraBankPaths(['node', 'sweep', '--extra-bank', '--check-wrong']), /needs a file/);
  const seed = JSON.stringify({ schemaVersion: 2, documents: [{ id: 'a', prompt: 'x' }, { prompt: 'no id' }, null] });
  assert.deepEqual(extraBankDocuments('seed.json', () => seed).map((document) => document.id), ['a']);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-live-path-bank-drift.mjs'), 'utf8'))
    // Not Firestore: app.delete() closes the Admin SDK's channels.
    .replace(/\bapp\.delete\(\)/g, 'app-close()')
    // Not Firestore: the in-memory Sets and the Map of repository items.
    .replace(/\b(keys|seen)\.add\(/g, 'set-add(')
    .replace(/\bindex\.set\(/g, 'map-set(');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /writeFileSync\(reportPath, /);
  const file = reportFilePath('2026-10-25T12:00:00.000Z');
  assert.equal(path.relative(path.join(repo, REPORT_DIR), file), 'live-path-bank-drift-2026-10-25T12-00-00-000Z.json');
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^release-reports\/?$/m);
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--out', 'x']), /no write mode/);
  assert.throws(() => parseReportArgs(['--page-size', '5']), /--project is required/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--draws', '-1']), /--draws/);
  assert.deepEqual(parseReportArgs(['--project', 'p']), { help: false, project: 'p', pageSize: 100, draws: 2 });
});
