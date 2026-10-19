// The wave-7 regrade count (student pass 3, grader gaps 2), run as the CLI
// against a seeded Firestore emulator (never a real project).
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-regrade-count \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/graderGaps2RegradeReport.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// Proven here: the CLI reads the three surfaces through the Admin SDK (a
// collection-group query on responseInspectionEvidence, exam sessions with
// their items subcollection, Path submissions), prints counts only, writes one
// JSON file under release-reports/, and changes none of this suite's
// documents. Other suites share the emulator, so this asserts on its own
// documents' entries, not on totals. The rules are proven in
// tests/platform/studentPass3GraderGaps2Reports.test.mjs.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const { storableItem } = require(path.join(repo, 'functions/lib/secureItemStorage.js'));
const PROJECT = process.env.GCLOUD_PROJECT || 'mathmaster-regrade-count';
const app = admin.initializeApp({ projectId: PROJECT }, 'grader-gaps-2-regrade-report-test');
const db = app.firestore();

const PREFIX = 'gg2-';
const grading = mathPath.privateGradingDefinition({ responseFields: [{ id: 'answer', inputProfile: 'number', expected: 'sqrt(8)/2' }] });
const recap = (value, key, isCorrect) => JSON.stringify({ grading: { isCorrect }, response: { kind: 'fields', entries: [{ label: 'Answer', value, format: 'math' }] }, correctAnswer: [{ label: 'Answer', value: key, format: 'rich' }] });
const SEED = {
  [`assignments/${PREFIX}a`]: {
    title: 'Fractions', schemaVersion: 5,
    sections: [{ role: 'practice', questions: [
      { type: 'multiAnswer', questionId: 'q0', answerFields: [{ id: 'v', label: 'Value', answer: '7/2', inputProfile: 'number' }] },
      { type: 'orderedPair', questionId: 'q1', prompt: 'Where?', answer: '(2,3)' },
    ] }],
  },
  [`grades/${PREFIX}s`]: { displayName: 'never read' },
  [`grades/${PREFIX}s/responseInspectionEvidence/${PREFIX}a__q0`]: {
    evidence: { submittedResponse: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'v', value: '3\\frac{1}{2}', isComplete: true }] }, automaticResult: { graded: true, isCorrect: false } },
  },
  [`grades/${PREFIX}s/responseInspectionEvidence/${PREFIX}a__q1`]: {
    evidence: { submittedResponse: { kind: 'scalar', type: 'orderedPair', value: '(2,3)', fields: [] }, automaticResult: { graded: true, isCorrect: false } },
  },
  [`examSessions/${PREFIX}e`]: { studentId: `${PREFIX}s`, responses: { i1: { grading: { isCorrect: false }, responsePayload: { responses: { answer: '\\sqrt{2}' } } } } },
  [`examSessions/${PREFIX}e/items/i1`]: { item: storableItem({ questionInstanceId: 'i1', privateGrading: grading }) },
  [`pathSubmissions/${PREFIX}p`]: { studentId: `${PREFIX}s`, createdAt: 1, recapJson: recap('\\frac{1}{2}\\pi', 'pi/2', false) },
};
const written = [];

const snapshotOwn = async () => {
  const rows = {};
  for (const docPath of Object.keys(SEED)) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.doc(docPath).get();
    rows[docPath] = snapshot.exists ? snapshot.data() : null;
  }
  return rows;
};

after(async () => {
  written.forEach((file) => rmSync(file, { force: true }));
  const batch = db.batch();
  Object.keys(SEED).forEach((docPath) => batch.delete(db.doc(docPath)));
  await batch.commit();
  await app.delete();
});

test('as the CLI on a seeded emulator: each surface counted, counts on stdout, one JSON file, nothing written to Firestore', async () => {
  const batch = db.batch();
  Object.entries(SEED).forEach(([docPath, data]) => batch.set(db.doc(docPath), data));
  await batch.commit();
  const before = await snapshotOwn();

  const { stdout } = await promisify(execFile)(process.execPath, [
    path.join(repo, 'scripts/report-grader-gaps-2-regrade.mjs'),
    '--project', PROJECT,
  ], { cwd: repo, env: process.env, maxBuffer: 1 << 24 });

  assert.match(stdout, /READ ONLY/);
  assert.match(stdout, /liveChallenge\s+not countable/);
  assert.doesNotMatch(stdout, /never read|\\frac|sqrt/, 'standard output is counts only');
  const relative = stdout.match(/^Detail \(student ids, responses and keys\): (.+)$/m)?.[1];
  assert.ok(relative, stdout);
  const file = path.resolve(repo, relative);
  written.push(file);
  assert.equal(path.relative(path.join(repo, 'release-reports'), file).includes(path.sep), false, 'the file is directly under release-reports/');

  const detail = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(detail.readOnly, true);
  assert.equal(detail.emulator, process.env.FIRESTORE_EMULATOR_HOST);
  const own = detail.changes
    .filter((change) => change.studentId === `${PREFIX}s`)
    .map(({ surface, direction, rule }) => `${surface} ${direction} ${rule}`)
    .sort();
  assert.deepEqual(own, ['assignments up mixedNumber', 'assignments up textPairKey', 'path up halfPi', 'secure up exactNumber']);
  assert.doesNotMatch(JSON.stringify(detail), /never read/);

  assert.deepEqual(await snapshotOwn(), before, 'this suite\'s documents are exactly as they were');
});
