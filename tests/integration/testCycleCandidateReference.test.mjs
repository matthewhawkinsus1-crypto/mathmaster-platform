// TEST CYCLE CANDIDATES: A SECURE TEST REFERENCE COMES FROM THE CALLER'S OWN
// SAVED ASSIGNMENT, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-candidate-ref \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/testCycleCandidateReference.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The real `preflightTestCycleCandidate` and `previewTestCycleSecureItems`
// callables prove:
//   * a candidate's `secureTestReference` is accepted only with the
//     `sourceAssignmentId` of a saved assignment the caller manages that
//     carries the same manifest id (the review screen's update mode), or from
//     the root administrator;
//   * a manifest id must be one document id;
//   * a candidate's blueprint names a bounded number of families.
//
// Every id starts with `tcref_`.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { certAssessmentPolicy, certFamilies, CERT_TARGETS } from '../fixtures/testCycleCertificationFixture.mjs';
import {
  db, fns, refusal, repo, teacherRequest, OTHER_TEACHER_EMAIL, TEACHER_EMAIL,
} from './testCycleCertificationHarness.mjs';

const require = createRequire(import.meta.url);
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));

const PREFIX = 'tcref_';
const CLASS_ID = 'tcref-class-1';
const OTHER_CLASS_ID = 'tcref-class-2';
const MANIFEST_ID = `${PREFIX}manifest`;
const OTHER_MANIFEST_ID = `${PREFIX}manifest-other`;
const SAVED = `${PREFIX}saved`;

const families = () => certFamilies().map((family) => ({
  ...family,
  id: family.id.replace(/^cert_/, PREFIX),
  familyId: String(family.familyId).replace(/^cert_/, PREFIX),
}));
const familyIdsFor = (targetId) => families().filter((family) => family.id.startsWith(`${PREFIX}${targetId}-`)).map((family) => family.id);
const blueprint = () => ({
  blueprintId: `${PREFIX}blueprint`,
  version: 1,
  title: 'Reference Unit Test',
  courseId: 'algebra1',
  calculatorMode: 'questionSpecific',
  targets: CERT_TARGETS.map((target) => ({
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    anchor: target.anchor,
    weight: 1,
    questionCount: target.questionCount,
    familyIds: familyIdsFor(target.targetId),
  })),
});

/** What the review screen sends (testCycleCandidateContract): no id, no Review answers. */
const candidate = (overrides = {}) => ({
  schemaVersion: 5,
  title: 'Reference candidate',
  assignment: { title: 'Reference candidate', courseId: 'algebra1', gradingPurpose: null },
  assessmentPolicy: certAssessmentPolicy(),
  testBlueprint: null,
  secureTestReference: { manifestId: MANIFEST_ID },
  deliveryPolicy: { sectionGating: null },
  sections: [{ role: 'review' }],
  ...overrides,
});

before(async () => {
  await Promise.all(families().map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('classes').doc(CLASS_ID).set({ name: 'Ref 1', course: 'algebra1', period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active' });
  await db.collection('classes').doc(OTHER_CLASS_ID).set({ name: 'Ref 2', course: 'algebra1', period: 'Period 2', teacherOfRecord: OTHER_TEACHER_EMAIL, status: 'active' });
  await db.collection('secureTestManifests').doc(MANIFEST_ID).set({ testBlueprint: blueprint() });
  await db.collection('secureTestManifests').doc(OTHER_MANIFEST_ID).set({ testBlueprint: blueprint() });
  await db.collection('assignments').doc(SAVED).set({
    schemaVersion: 5,
    title: 'Saved reference cycle',
    courseId: 'algebra1',
    assignedClassIds: [CLASS_ID],
    dueAt: '2099-01-01T00:00:00.000Z',
    assignment: { title: 'Saved reference cycle', courseId: 'algebra1' },
    assessmentPolicy: certAssessmentPolicy(),
    secureTestReference: { manifestId: MANIFEST_ID },
    sections: [{ id: 'review', role: 'review', title: 'Review', questions: [{ questionId: `${PREFIX}r1`, type: 'response', prompt: 'R1' }] }],
  });
});

const preflight = (data, email = TEACHER_EMAIL) => fns.preflightTestCycleCandidate.run(teacherRequest(data, email));
const preview = (data, email = TEACHER_EMAIL) => fns.previewTestCycleSecureItems.run(teacherRequest(data, email));

test('a candidate carrying a secure test reference with no saved assignment behind it is refused', async () => {
  assert.equal((await refusal(preflight({ assignment: candidate() })))?.code, 'permission-denied');
  assert.equal((await refusal(preview({ assignment: candidate() })))?.code, 'permission-denied');
});

test('the reference of the caller\'s own saved assignment is accepted, as the review screen sends it', async () => {
  const checked = await preflight({ assignment: candidate(), sourceAssignmentId: SAVED });
  assert.equal(checked.success, true);
  assert.equal(checked.testCycle, true);
  const shown = await preview({ assignment: candidate(), sourceAssignmentId: SAVED });
  assert.equal(shown.candidate, true);
  assert.ok(shown.shown > 0, 'the manifest\'s items are previewed');
});

test('another teacher\'s saved assignment, or a different manifest, is refused', async () => {
  assert.equal((await refusal(preflight({ assignment: candidate(), sourceAssignmentId: SAVED }, OTHER_TEACHER_EMAIL)))?.code, 'permission-denied');
  assert.equal((await refusal(preflight({
    assignment: candidate({ secureTestReference: { manifestId: OTHER_MANIFEST_ID } }), sourceAssignmentId: SAVED,
  })))?.code, 'permission-denied');
});

test('the root administrator may preflight any manifest', async () => {
  const checked = await preflight({ assignment: candidate({ secureTestReference: { manifestId: OTHER_MANIFEST_ID } }) }, ROOT_ADMIN_EMAIL);
  assert.equal(checked.success, true);
});

test('a manifest id must be one document id', async () => {
  const outcome = await refusal(preflight({ assignment: candidate({ secureTestReference: { manifestId: `${MANIFEST_ID}/x/y` } }) }, ROOT_ADMIN_EMAIL));
  assert.equal(outcome?.code, 'invalid-argument');
});

test('a candidate blueprint naming too many families is refused', async () => {
  const wide = blueprint();
  wide.targets[0] = { ...wide.targets[0], familyIds: Array.from({ length: 500 }, (_, index) => `${PREFIX}missing-${index}`) };
  const outcome = await refusal(preflight({ assignment: candidate({ secureTestReference: null, testBlueprint: wide }) }));
  assert.equal(outcome?.code, 'invalid-argument');
  // An ordinary blueprint is still checked.
  const ordinary = await preflight({ assignment: candidate({ secureTestReference: null, testBlueprint: blueprint() }) });
  assert.equal(ordinary.success, true);
});
