#!/usr/bin/env node
/*
 * THE LIVE PATH BANK AGAINST THE REPOSITORY. A READ-ONLY REPORT (GR25).
 *
 * The equivalence sweep, the answer-acceptance audit and the key-shape counts
 * in the pass-3 handoffs read the repository's seeds only. The live
 * `pathQuestionBank` collection can also hold a family an admin imported that
 * the repository never had, or a document changed after a release wrote it,
 * and none of those checks can see it (docs/handoffs/STUDENT_PASS3_GRADER_GAPS.md
 * § Not done). This report finds them. It has no write mode: no --execute,
 * no repair, and no Firestore write anywhere in this file
 * (tests/platform/livePathBankDriftReport.test.mjs runs it against a database
 * that throws on any write).
 *
 *   node scripts/report-live-path-bank-drift.mjs --project <id> [--page-size <n>] [--draws <n>]
 *
 * Every live document is one of:
 *   - same:      its id is a repository item's and so is its content, as a
 *                release or a seed import stores it (release bookkeeping, the
 *                built-in marker and `active` set aside: a withdrawn family
 *                is still the repository's content);
 *   - drifted:   its id is a repository item's and its content is not (the
 *                top-level fields that differ are listed);
 *   - live-only: no repository item has its id.
 * Repository items with no live document are counted as repo-only.
 *
 * It counts the ASCII `B^(E)/N` key shape (a `^( … )` group followed by `/`,
 * which the renderer draws as B^(E/N): item 4 of the grader-gaps handoff) in
 * every live document's stored keys and generated instances. And it copies
 * the drifted and live-only documents, the ones no repository check has seen,
 * into the report's `documents`, the shape of a seed file, so the sweep and
 * the audit can grade them:
 *
 *   node scripts/sweep-equivalence-verdicts.mjs --base <base worktree> --check-wrong --extra-bank <this report>
 *   node scripts/audit-correct-answer-acceptance.mjs --samples 12 --extra-bank <this report>
 *
 * READS. `pathQuestionBank` only, paged by id. A bank document is content and
 * holds no student data. No other collection is read.
 * WRITES. One local file, release-reports/live-path-bank-drift-<time>.json
 * (gitignored). It holds the drifted and live-only documents with their
 * answer keys: keep it out of the repository. Standard output is counts and
 * document ids only.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generatePathInstanceWithRetries, hasPathGenerator, hasPathVariants } from '../functions/shared/pathQuestionGeneration.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { VOLATILE_DOCUMENT_FIELDS, canonicalJson, compilePathQuestionDocument, pathContentHash, pathDocumentContentHash } = require('../functions/lib/pathContentCompiler.js');
// firebase-admin lives in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
export const BANK_COLLECTION = 'pathQuestionBank';
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 100;
export const DRAWS = 2;
// Where the repository's bank items live: every Path bank seed, and the
// secure-assessment seed course tests draw from (resolveBlueprintFamilies).
export const SEED_SOURCES = Object.freeze([
  { dir: 'functions/seeds/pathQuestionBank', match: /_pathQuestionBank_seed\.json$/ },
  { dir: 'functions/seeds/secureAssessments', match: /\.json$/ },
]);
/*
 * Not content: the release machinery's bookkeeping (VOLATILE_DOCUMENT_FIELDS),
 * the built-in marker a course release adds and the older seeding's
 * `seedMetadata`, and `active`, which an admin's withdrawal changes.
 */
export const NOT_CONTENT_FIELDS = Object.freeze([...VOLATILE_DOCUMENT_FIELDS, 'builtInPathSeed', 'seedMetadata', 'active']);
export const STATUS = Object.freeze({ SAME: 'same', DRIFTED: 'drifted', LIVE_ONLY: 'live-only' });

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const documentsIn = (parsed) => (Array.isArray(parsed) ? parsed : (parsed?.documents || parsed?.items || parsed?.questions || []));

/** Firestore values as plain JSON: a Timestamp becomes its ISO time. */
export const plainValue = (value) => {
  if (Array.isArray(value)) return value.map(plainValue);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try { return value.toDate().toISOString(); } catch { return null; }
    }
    if (!isObject(value)) return String(value);
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, plainValue(entry)]));
  }
  return value;
};

const contentOf = (document) => Object.fromEntries(Object.entries(isObject(document) ? document : {})
  .filter(([key, value]) => !NOT_CONTENT_FIELDS.includes(key) && value !== undefined));
/** One document's content, as a hash: equal for equal content however it was stored. */
export const contentKey = (document) => pathContentHash(contentOf(document));

/** Index bank items by id: each compiled as a release or a seed import stores it. */
export const indexRepoItems = (items, file, index = new Map()) => {
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = clean(item?.id);
    if (!id) return;
    const compiled = compilePathQuestionDocument({ ...item, id, active: item.active !== false });
    const document = compiled.ok ? compiled.document : { ...item, id };
    const entry = index.get(id) || { files: [], document, keys: new Set() };
    entry.files.push(file);
    entry.keys.add(contentKey(document));
    index.set(id, entry);
  });
  return index;
};

/** Every bank item in the repository, by id. */
export const repoBankIndex = (root = repoRoot) => {
  const index = new Map();
  SEED_SOURCES.forEach((source) => {
    const dir = path.join(root, source.dir);
    readdirSync(dir).filter((name) => source.match.test(name)).sort().forEach((name) => {
      indexRepoItems(documentsIn(JSON.parse(readFileSync(path.join(dir, name), 'utf8'))), `${source.dir}/${name}`, index);
    });
  });
  return index;
};

/** same / drifted / live-only, and for a drifted document the fields that differ. Pure. */
export const classifyLiveDocument = (live, repoEntry) => {
  if (!repoEntry) return { status: STATUS.LIVE_ONLY, differingFields: [] };
  if (repoEntry.keys.has(contentKey(live))) return { status: STATUS.SAME, differingFields: [] };
  const stored = contentOf(live);
  const authored = contentOf(repoEntry.document);
  const differingFields = [...new Set([...Object.keys(stored), ...Object.keys(authored)])]
    .filter((key) => canonicalJson(stored[key]) !== canonicalJson(authored[key]))
    .sort();
  return { status: STATUS.DRIFTED, differingFields };
};

/** A `^(` group, its matching `)`, then `/`: 2^(x-1)/3, never (2^(x-1))/3 or 2^{x-1}/3. */
export const hasAsciiPowerOverDivisor = (text) => {
  const value = String(text ?? '');
  for (let start = value.indexOf('^('); start >= 0; start = value.indexOf('^(', start + 1)) {
    let depth = 0;
    for (let index = start + 1; index < value.length; index += 1) {
      if (value[index] === '(') depth += 1;
      if (value[index] !== ')') continue;
      depth -= 1;
      if (depth === 0) {
        if (/^\s*\//.test(value.slice(index + 1))) return true;
        break;
      }
    }
  }
  return false;
};

// The keys of a document's response fields, as the sweep finds them: a node
// with `expected` or `answer` that is a field (an id, a profile, a label or
// accepted forms), with its accepted forms.
const keyTexts = (node, found = []) => {
  if (Array.isArray(node)) { node.forEach((entry) => keyTexts(entry, found)); return found; }
  if (!isObject(node)) return found;
  if (('expected' in node || 'answer' in node) && (node.id !== undefined || node.inputProfile || node.label || node.accepted || node.acceptedAnswers)) {
    const fieldId = clean(node.id) || null;
    [node.expected ?? node.answer, ...(Array.isArray(node.accepted) ? node.accepted : []), ...(Array.isArray(node.acceptedAnswers) ? node.acceptedAnswers : [])]
      .filter((value) => typeof value === 'string' || typeof value === 'number')
      .forEach((value) => found.push({ fieldId, text: String(value) }));
  }
  Object.values(node).forEach((value) => { if (value && typeof value === 'object') keyTexts(value, found); });
  return found;
};

/** The ASCII B^(E)/N keys of one document: as stored (templates too) and in `draws` generated instances. */
export const asciiPowerOverDivisorKeys = (document, { draws = DRAWS } = {}) => {
  const found = [];
  const scan = (root, where) => keyTexts(root).forEach(({ fieldId, text }) => {
    if (hasAsciiPowerOverDivisor(text)) found.push({ where, fieldId, text });
  });
  scan(document, 'stored');
  if (hasPathGenerator(document) || hasPathVariants(document)) {
    for (let draw = 0; draw < draws; draw += 1) {
      let question = null;
      try { question = generatePathInstanceWithRetries(document, `gr25-${draw}`, 4)?.question || null; } catch { question = null; }
      if (question) scan(question, `draw ${draw}`);
    }
  }
  return found;
};

async function* pagedDocuments(collection, pageSize) {
  let last = null;
  for (;;) {
    let page = collection.limit(pageSize);
    if (last) page = page.startAfter(last);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await page.get();
    for (const doc of snapshot.docs) yield doc;
    if (snapshot.docs.length < pageSize) return;
    last = snapshot.docs[snapshot.docs.length - 1];
  }
}

/**
 * Reads and returns the report object. `db` is a Firestore (Admin SDK); only
 * collection/orderBy/limit/startAfter/get are used. `repoIndex` defaults to
 * every bank item in the repository (repoBankIndex).
 */
export const runLivePathBankDriftReport = async ({
  db, repoIndex = null, pageSize = PAGE_SIZE, draws = DRAWS, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const index = repoIndex || repoBankIndex();
  const counts = { live: 0, same: 0, drifted: 0, liveOnly: 0, repoOnly: 0, inactive: 0, editedAfterRelease: 0 };
  const byFramework = {};
  const rows = [];
  const documents = [];
  const shaped = [];
  const seen = new Set();
  const ordered = db.collection(BANK_COLLECTION).orderBy(documentIdField);
  for await (const doc of pagedDocuments(ordered, pageSize)) {
    const live = plainValue({ ...doc.data(), id: doc.id });
    seen.add(doc.id);
    counts.live += 1;
    if (live.active === false) counts.inactive += 1;
    // A release writes the document's hash beside it; a different hash now
    // means the document was changed after that release.
    const editedAfterRelease = typeof live.pathContentHash === 'string' && live.pathContentHash !== pathDocumentContentHash(live);
    if (editedAfterRelease) counts.editedAfterRelease += 1;
    const repoEntry = index.get(doc.id) || null;
    const { status, differingFields } = classifyLiveDocument(live, repoEntry);
    const framework = clean(live.assessmentContext?.framework) || 'course';
    byFramework[framework] ??= { live: 0, same: 0, drifted: 0, liveOnly: 0 };
    byFramework[framework].live += 1;
    const key = status === STATUS.SAME ? 'same' : status === STATUS.DRIFTED ? 'drifted' : 'liveOnly';
    counts[key] += 1;
    byFramework[framework][key] += 1;
    // Counted over every live document: the handoff could count only the
    // repository's (none).
    const shapes = asciiPowerOverDivisorKeys(live, { draws });
    if (shapes.length) shaped.push({ id: doc.id, status, keys: shapes.length });
    if (status === STATUS.SAME) continue;
    rows.push({
      id: doc.id,
      status,
      courseId: clean(live.courseId) || null,
      framework,
      active: live.active !== false,
      editedAfterRelease,
      repoFiles: repoEntry ? [...repoEntry.files] : [],
      differingFields,
      asciiPowerOverDivisor: shapes,
    });
    documents.push(live);
  }
  const repoOnly = [...index.keys()].filter((id) => !seen.has(id)).sort();
  counts.repoOnly = repoOnly.length;

  return {
    tool: 'report-live-path-bank-drift',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    collection: BANK_COLLECTION,
    repoItems: index.size,
    notes: [
      `same: the repository item with that id, compiled as stored; ${NOT_CONTENT_FIELDS.join(', ')} are not content.`,
      'drifted / live-only: no repository check has graded these. Their documents are under `documents`; pass this file to the sweep or the audit with --extra-bank.',
      'asciiPowerOverDivisor: keys with an ASCII ^( … ) group followed by /, which the renderer draws as B^(E/N) (STUDENT_PASS3_GRADER_GAPS.md item 4), over every live document, stored and drawn. The repository has none.',
      'editedAfterRelease: the stored pathContentHash is not the hash of the stored content.',
      'This file holds answer keys. It is written under release-reports/ (gitignored); keep it out of the repository.',
    ],
    counts,
    byFramework,
    asciiPowerOverDivisor: {
      documents: shaped.length,
      keys: shaped.reduce((total, entry) => total + entry.keys, 0),
      byDocument: shaped,
    },
    rows,
    repoOnly,
    documents,
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-live-path-bank-drift.mjs --project <id> [options]

Read-only. Compares every live pathQuestionBank document with the repository's
bank items (same / drifted / live-only, and repo-only), counts the ASCII
B^(E)/N key shape in the drifted and live-only ones, and copies those into the
report so the sweep and the audit can grade them (--extra-bank <report>).
Writes one JSON file to ${REPORT_DIR}/ (gitignored; it holds answer keys).

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --page-size <n>       documents per read (default ${PAGE_SIZE})
  --draws <n>           generated instances per family for the key-shape count (default ${DRAWS})`;

export const parseReportArgs = (argv) => {
  const options = {};
  const known = ['--project', '--page-size', '--draws'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  const draws = options.draws ? Number(options.draws) : DRAWS;
  if (!Number.isInteger(draws) || draws < 0 || draws > 20) throw new Error('--draws must be 0–20');
  return { help: false, project: options.project, pageSize, draws };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `live-path-bank-drift-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(44)} ${value}`);
  add('repository bank items', report.repoItems);
  add('live documents', `${report.counts.live} (${report.counts.inactive} withdrawn or inactive)`);
  add('same as the repository', report.counts.same);
  add('drifted (same id, other content)', report.counts.drifted);
  add('live-only (no repository item)', report.counts.liveOnly);
  add('repo-only (not live)', report.counts.repoOnly);
  add('changed after their release', report.counts.editedAfterRelease);
  Object.entries(report.byFramework).sort(([a], [b]) => a.localeCompare(b)).forEach(([framework, counts]) => {
    add(`  ${framework}`, `live ${counts.live} · same ${counts.same} · drifted ${counts.drifted} · live-only ${counts.liveOnly}`);
  });
  add('ASCII B^(E)/N keys (every live document)', `${report.asciiPowerOverDivisor.keys} in ${report.asciiPowerOverDivisor.documents} documents`);
  report.asciiPowerOverDivisor.byDocument.slice(0, 20).forEach((entry) => add(`    ${entry.status} ${entry.id}`, `${entry.keys} keys`));
  report.rows.slice(0, 40).forEach((row) => add(`    ${row.status} ${row.id}`, row.differingFields.join(', ')));
  if (report.rows.length > 40) add('    …', `${report.rows.length - 40} more in the file`);
  console.log(lines.join('\n'));
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-live-path-bank-drift: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  let admin;
  try {
    admin = functionsRequire('firebase-admin');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error('report-live-path-bank-drift: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-live-path-bank-drift');
  console.log('Live Path bank against the repository (GR25) — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runLivePathBankDriftReport({
      db: app.firestore(),
      pageSize: options.pageSize,
      draws: options.draws,
      documentIdField: admin.firestore.FieldPath.documentId(),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;
  const reportPath = reportFilePath(report.startedAt);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  printCounts(report);
  console.log(`\nDetail and documents: ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-live-path-bank-drift: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
