// The D10 P0-4 exposure report, run as the CLI against a seeded Firestore
// emulator (never a real project).
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-key-exposure \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/assignmentKeyExposureReport.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// Proven here: the CLI reads the seeded assignments through the Admin SDK,
// prints counts only, writes exactly one JSON file under release-reports/ with
// the documented shape, and changes nothing in Firestore. The columns
// themselves are proven in tests/platform/assignmentKeyExposureReport.test.mjs.

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
const PROJECT = process.env.GCLOUD_PROJECT || 'mathmaster-key-exposure';
const app = admin.initializeApp({ projectId: PROJECT }, 'key-exposure-report-test');
const db = app.firestore();
const { parseAssignmentBlueprintText } = await import('../../src/assignmentBlueprint.js');
const { repairKnownFirestoreNestedArrays } = await import('../../src/platform/persistence/firestoreAssignmentSafety.js');

const PREFIX = 'kx-';
// A real lesson, compiled by the real intake and made storable the way a save
// makes it (point lists as objects): the District DOL (35 questions).
const { value: dolLesson } = repairKnownFirestoreNestedArrays(parseAssignmentBlueprintText(readFileSync(path.join(repo,
  'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json'), 'utf8')).assignmentV5);
const SEED = {
  [`${PREFIX}district-dol`]: { ...dolLesson, assignedClassIds: [`${PREFIX}class`] },
  [`${PREFIX}hand`]: {
    title: 'Hand-made', schemaVersion: 5, assignedClassIds: [`${PREFIX}class`],
    variantPolicy: { mode: 'shared' },
    sections: [{ id: 'q', role: 'quiz', title: 'Quiz', questions: [
      { type: 'multiAnswer', questionId: 'q1', answerFields: [{ id: 'a', answer: 'B', options: ['A', 'B'] }] },
      { type: 'numberLine', questionId: 'q2', target: 2 },
    ] }],
  },
};
const written = [];

const snapshotAll = async () => {
  const rows = {};
  for (const name of ['assignments', 'grades', 'platformFlags']) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    snapshot.docs.forEach((doc) => { rows[`${name}/${doc.id}`] = doc.data(); });
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
  const before = await snapshotAll();

  const { stdout } = await promisify(execFile)(process.execPath, [
    path.join(repo, 'scripts/report-assignment-key-exposure.mjs'),
    '--project', PROJECT,
    '--assignment', `${PREFIX}district-dol`,
    '--assignment', `${PREFIX}hand`,
    '--assignment', `${PREFIX}gone`,
  ], { cwd: repo, env: process.env });

  assert.match(stdout, /READ ONLY/);
  assert.match(stdout, /assignments read\s+2$/m);
  assert.match(stdout, /named assignments not found\s+1$/m);
  assert.doesNotMatch(stdout, /never read/);
  const relative = stdout.match(/^Detail \(per assignment and section\): (.+)$/m)?.[1];
  assert.ok(relative, stdout);
  const file = path.resolve(repo, relative);
  written.push(file);
  assert.equal(path.relative(path.join(repo, 'release-reports'), file).includes(path.sep), false, 'the file is directly under release-reports/');
  assert.match(path.basename(file), /^assignment-key-exposure-.+\.json$/);

  const detail = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(detail.readOnly, true);
  assert.equal(detail.project, PROJECT);
  assert.equal(detail.emulator, process.env.FIRESTORE_EMULATOR_HOST);
  assert.deepEqual(detail.missingAssignments, [`${PREFIX}gone`]);
  assert.deepEqual(detail.assignments.map((entry) => entry.assignmentId), [`${PREFIX}district-dol`, `${PREFIX}hand`]);
  const [dol, hand] = detail.assignments;
  // The District DOL's sections and counts, as the platform test's fixture
  // count found them for this file (its 35 questions, 3 answer-field keys).
  assert.equal(dol.questions, 35);
  assert.ok(dol.withStoredKey >= 3, `stored keys ${dol.withStoredKey}`);
  assert.ok(dol.sections.every((section) => typeof section.role === 'string' && 'variantMode' in section));
  assert.deepEqual(
    hand.sections.map(({ role, variantMode, questions, withStoredKey, withChoiceLabelKey, deviceOnly }) => ({ role, variantMode, questions, withStoredKey, withChoiceLabelKey, deviceOnly })),
    [{ role: 'quiz', variantMode: 'shared', questions: 2, withStoredKey: 2, withChoiceLabelKey: 1, deviceOnly: 1 }],
  );
  assert.equal(detail.totals.byRole.quiz.sections, 1);
  assert.doesNotMatch(JSON.stringify(detail), /never read/);

  assert.deepEqual(await snapshotAll(), before, 'Firestore is exactly as it was');
});
