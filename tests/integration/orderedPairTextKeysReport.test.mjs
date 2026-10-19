// The ordered-pair text-key count (student pass 3, wave 7), run as the CLI
// against a seeded Firestore emulator (never a real project).
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-pair-keys \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/orderedPairTextKeysReport.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// Proven here: the CLI reads the seeded assignments through the Admin SDK,
// prints counts only, writes exactly one JSON file under release-reports/, and
// changes none of this suite's documents. The classification itself is proven
// in tests/platform/studentPass3GraderGaps2Reports.test.mjs.

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
const PROJECT = process.env.GCLOUD_PROJECT || 'mathmaster-pair-keys';
const app = admin.initializeApp({ projectId: PROJECT }, 'ordered-pair-text-keys-report-test');
const db = app.firestore();

const PREFIX = 'opk-';
const SEED = {
  [`${PREFIX}systems`]: {
    title: 'Systems', schemaVersion: 5, assignedClassIds: [`${PREFIX}class`],
    sections: [{ id: 'pr', role: 'practice', title: 'Practice', questions: [
      // The teacher harness's fixture shape (tests/browser/teacherWorkflow/fixture.js).
      { type: 'orderedPair', questionId: 'p2', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' },
      { type: 'orderedPair', questionId: 'p3', prompt: 'Where?', answer: 'none' },
      { type: 'orderedPair', questionId: 'p4', prompt: 'Where?', answer: [2, 5] },
    ] }],
  },
  [`${PREFIX}clean`]: { title: 'Clean', schemaVersion: 5, sections: [{ role: 'dol', questions: [{ type: 'orderedPair', answer: [0, 0] }] }] },
};
const written = [];

// Only this suite's own documents: CI runs every integration file in parallel
// against one emulator project, so other suites' documents come and go.
const snapshotOwn = async () => {
  const rows = {};
  for (const name of ['assignments', 'grades']) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    snapshot.docs.filter((doc) => doc.id.startsWith(PREFIX)).forEach((doc) => { rows[`${name}/${doc.id}`] = doc.data(); });
  }
  return rows;
};

after(async () => {
  written.forEach((file) => rmSync(file, { force: true }));
  const batch = db.batch();
  Object.keys(SEED).forEach((id) => batch.delete(db.collection('assignments').doc(id)));
  batch.delete(db.collection('grades').doc(`${PREFIX}student`));
  await batch.commit();
  await app.delete();
});

test('as the CLI on a seeded emulator: counts on stdout, one JSON file in release-reports/, nothing written to Firestore', async () => {
  const batch = db.batch();
  Object.entries(SEED).forEach(([id, data]) => batch.set(db.collection('assignments').doc(id), data));
  batch.set(db.collection('grades').doc(`${PREFIX}student`), { displayName: 'never read', classId: `${PREFIX}class`, gradesByAssignment: {} });
  await batch.commit();
  const before = await snapshotOwn();

  const { stdout } = await promisify(execFile)(process.execPath, [
    path.join(repo, 'scripts/report-ordered-pair-text-keys.mjs'),
    '--project', PROJECT,
    '--assignment', `${PREFIX}systems`,
    '--assignment', `${PREFIX}clean`,
    '--assignment', `${PREFIX}gone`,
  ], { cwd: repo, env: process.env });

  assert.match(stdout, /READ ONLY/);
  assert.match(stdout, /assignments read\s+2$/m);
  assert.match(stdout, /named assignments not found\s+1$/m);
  assert.match(stdout, /orderedPair keys stored as pair text \(now graded\)\s+1$/m);
  assert.match(stdout, /orderedPair keys stored as text that is not a pair\s+1$/m);
  assert.match(stdout, /orderedPair keys stored as a point \(unaffected\)\s+2$/m);
  assert.doesNotMatch(stdout, /never read|\(2,3\)/, 'standard output is counts only');
  const relative = stdout.match(/^Detail \(assignment and question ids, key text\): (.+)$/m)?.[1];
  assert.ok(relative, stdout);
  const file = path.resolve(repo, relative);
  written.push(file);
  assert.equal(path.relative(path.join(repo, 'release-reports'), file).includes(path.sep), false, 'the file is directly under release-reports/');
  assert.match(path.basename(file), /^ordered-pair-text-keys-.+\.json$/);

  const detail = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(detail.readOnly, true);
  assert.equal(detail.emulator, process.env.FIRESTORE_EMULATOR_HOST);
  assert.deepEqual(detail.missingAssignments, [`${PREFIX}gone`]);
  assert.deepEqual(detail.assignments.map((entry) => entry.assignmentId), [`${PREFIX}systems`]);
  assert.deepEqual(detail.assignments[0].questions.map(({ questionId, kind }) => [questionId, kind]), [['p2', 'textPairNowGraded'], ['p3', 'textNotAPair']]);
  assert.doesNotMatch(JSON.stringify(detail), /never read/);

  assert.deepEqual(await snapshotOwn(), before, 'this suite\'s documents are exactly as they were, and no new opk- document appeared');
});
