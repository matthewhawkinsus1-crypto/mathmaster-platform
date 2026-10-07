import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { preflightTestCycle, unavailableBlueprintFamilies } from '../../functions/shared/testCyclePreflight.mjs';
import { declaresTestCycle } from '../../functions/shared/testCyclePolicy.mjs';
import {
  familyDocumentsToRegister,
  registrableTestCycleFamilies,
  unavailableTestCycleFamilies,
} from '../../src/platform/teacher/testCycleFamilyRegistration.js';
import { testCycleCandidateContract } from '../../src/platform/teacher/testCyclePreviewModel.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const lessonPreflight = componentSource('src/components/teacher/LessonPreflightModal.jsx');
const preview = componentSource('src/components/teacher/TestCyclePreview.jsx');
const app = componentSource('src/App.jsx');

/*
 * A TEST CYCLE BLOCKED BECAUSE ONE OF ITS FAMILIES WAS NEVER IMPORTED.
 *
 * The Algebra II Systems Test was imported with its V5 assignment, but its new
 * Question 8 family (a Systems Workspace construction) was never imported into
 * the secure bank while the other nine had been, long before. Preflight said
 * "Target systems-q08 (texas:A2.3F) names no approved, validated generator
 * family." — true, but it named no family and no fix, and the teacher could not
 * save the Test, so could not reach the preview of its Test, Corrections and
 * Retest either.
 *
 * These tests pin the recovery: preflight names the missing family and how to
 * register it; the review screen can import exactly that family; and the
 * secure stages can be previewed before the Test Cycle is saved.
 */

// Shaped like real bank questions: a document id AND a descriptive familyId.
const bankFamily = (id, extra = {}) => ({
  id,
  active: true,
  validated: true,
  courseId: 'algebra2',
  alignmentKeys: ['texas:A2.3F'],
  familyId: `mathmaster:hawkins:${id}`,
  familyVersion: 1,
  questionType: 'response',
  dok: 2,
  difficultyBand: 3,
  representation: 'symbolic',
  prompt: 'Solve {{a}}x = {{b}}.',
  responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: '{{x}}' }],
  generator: { parameters: { a: { type: 'int', min: 2, max: 9 } }, derived: { x: 'b/a' } },
  ...extra,
});
const issuable = (ids) => Object.fromEntries(ids.map((id) => [id, { issuable: true, reason: null }]));

// Ten one-question targets, one family each; q08 is the one never imported.
const TARGETS = Array.from({ length: 10 }, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    targetId: `systems-q${n}`,
    alignmentKey: 'texas:A2.3F',
    label: `Question ${index + 1}`,
    questionCount: 1,
    anchor: index % 2 === 0,
    familyIds: [index === 7 ? 'fam_v2_q08_rich' : `fam_v1_q${n}`],
  };
});
const blueprint = { blueprintId: 'systems-unit-test', title: 'Systems Unit Test', targets: TARGETS };
const assignment = {
  schemaVersion: 5,
  assignment: { title: 'Systems Unit Review and Test', courseId: 'algebra2', gradingPurpose: 'test' },
  assessmentPolicy: { mode: 'testCycle', passingScore: 70 },
  testBlueprint: blueprint,
  deliveryPolicy: { sectionGating: 'rolePolicy' },
  sections: [{ id: 'review', role: 'review', questions: [{ questionId: 'r1', prompt: 'Review', answerFields: [{ id: 'a', answer: '4' }] }] }],
};
const registered = TARGETS.flatMap((target) => target.familyIds).filter((id) => id !== 'fam_v2_q08_rich').map((id) => bankFamily(id));

test('preflight names the unregistered family and the import that fixes it, instead of only "no approved family"', () => {
  const result = preflightTestCycle({ assignment, families: registered, familyIssuability: issuable(registered.map((family) => family.id)) });
  assert.equal(result.blocked, true);
  assert.equal(result.errors.length, 1, result.errors.join('\n'));
  const [error] = result.errors;
  // Still says what is wrong with the target…
  assert.match(error, /^Target systems-q08 \(texas:A2\.3F\) names no approved, validated generator family\./);
  // …and now which family, and where it is fixed.
  assert.match(error, /Not in the secure question bank: fam_v2_q08_rich/);
  assert.match(error, /secure-families file \(Administration → Path content coverage → Import a different seed package\)/);
  assert.deepEqual(result.unavailableFamilies, [{
    familyId: 'fam_v2_q08_rich', targetId: 'systems-q08', alignmentKey: 'texas:A2.3F', label: 'Question 8', status: 'unregistered',
  }]);
  // The family was never checked because there is nothing to check; saying
  // "not checked against the grading gate" as well only buried the cause.
  assert.ok(!result.warnings.some((warning) => /fam_v2_q08_rich was not checked/.test(warning)), result.warnings.join('\n'));
});

test('a retired family is reported as retired, not as something to import', () => {
  const families = [...registered, bankFamily('fam_v2_q08_rich', { active: false })];
  const result = preflightTestCycle({ assignment, families, familyIssuability: issuable(families.map((family) => family.id)) });
  assert.equal(result.blocked, true);
  const error = result.errors.find((entry) => entry.startsWith('Target systems-q08'));
  assert.match(error, /Retired or not validated in the bank: fam_v2_q08_rich\./);
  assert.doesNotMatch(error, /Not in the secure question bank/);
  assert.equal(result.unavailableFamilies[0].status, 'retired');
});

test('an unregistered alternate on a target that is otherwise covered warns, and does not block', () => {
  const covered = { ...blueprint, targets: TARGETS.map((target) => (target.targetId === 'systems-q08' ? { ...target, familyIds: ['fam_v2_q08_rich', 'fam_v1_q08'] } : target)) };
  const families = [...registered, bankFamily('fam_v1_q08')];
  const result = preflightTestCycle({ assignment: { ...assignment, testBlueprint: covered }, families, familyIssuability: issuable(families.map((family) => family.id)) });
  assert.equal(result.blocked, false, result.errors.join('\n'));
  assert.ok(result.warnings.some((warning) => /systems-q08.*draws only on its other families.*fam_v2_q08_rich/.test(warning)), result.warnings.join('\n'));
});

test('unavailableBlueprintFamilies keys families by the bank document id the blueprint uses', () => {
  // A family present under its descriptive familyId only is still absent: the
  // issuing server fetches by document id.
  const rows = unavailableBlueprintFamilies(blueprint, [...registered, { familyId: 'fam_v2_q08_rich', id: 'other-doc' }]);
  assert.deepEqual(rows.map((row) => [row.familyId, row.status]), [['fam_v2_q08_rich', 'unregistered']]);
});

test('the review screen reads the server\'s list, and derives it from coverage on an older server', () => {
  const current = preflightTestCycle({ assignment, families: registered, familyIssuability: issuable(registered.map((family) => family.id)) });
  assert.deepEqual(unavailableTestCycleFamilies({ preflight: current, blueprint }).map((row) => row.familyId), ['fam_v2_q08_rich']);

  // A server deployed before `unavailableFamilies` existed returns coverage only.
  const { unavailableFamilies: _dropped, ...older } = current;
  const derived = unavailableTestCycleFamilies({ preflight: older, blueprint });
  assert.deepEqual(derived.map((row) => [row.familyId, row.targetId, row.status]), [['fam_v2_q08_rich', 'systems-q08', 'unknown']]);
  assert.deepEqual(unavailableTestCycleFamilies({ preflight: null, blueprint }), []);
});

test('only unregistered (or unknown) families are offered for import; a retired one is left to Administration', () => {
  const rows = registrableTestCycleFamilies([
    { familyId: 'a', status: 'unregistered' },
    { familyId: 'a', status: 'unregistered' },
    { familyId: 'b', status: 'retired' },
    { familyId: 'c', status: 'unknown' },
  ]);
  assert.deepEqual(rows.map((row) => row.familyId), ['a', 'c']);
});

test('importing from a families file takes exactly the missing families and nothing else', () => {
  const file = { targetCollection: 'pathQuestionBank', documents: [...registered, bankFamily('fam_v2_q08_rich')] };
  const picked = familyDocumentsToRegister({ parsed: file, familyIds: ['fam_v2_q08_rich'] });
  assert.deepEqual(picked.documents.map((document) => document.id), ['fam_v2_q08_rich']);
  assert.deepEqual(picked.missingFromFile, []);
  assert.equal(picked.otherDocuments, registered.length, 'the nine families already registered are not rewritten');

  // A bare array works too, and a file without the family says so.
  const absent = familyDocumentsToRegister({ parsed: registered, familyIds: ['fam_v2_q08_rich'] });
  assert.deepEqual(absent.documents, []);
  assert.deepEqual(absent.missingFromFile, ['fam_v2_q08_rich']);
});

test('the unsaved Test Cycle is previewed from its contract: still a Test Cycle, and no Review answers', () => {
  const contract = testCycleCandidateContract(assignment);
  assert.equal(declaresTestCycle(contract), true);
  assert.deepEqual(contract.testBlueprint, blueprint);
  assert.deepEqual(contract.assessmentPolicy, assignment.assessmentPolicy);
  assert.deepEqual(contract.sections, [{ role: 'review' }]);
  assert.doesNotMatch(JSON.stringify(contract), /answerFields|"answer"|questions/);

  // A cycle declared by purpose, gating and a Review section, with no policy
  // block, is still recognised from the contract alone.
  const { assessmentPolicy: _policy, ...declaredByRoles } = assignment;
  assert.equal(declaresTestCycle(declaredByRoles), true);
  assert.equal(declaresTestCycle(testCycleCandidateContract(declaredByRoles)), true);
});

test('the review screen imports the missing families through the validated importer, then asks the server again', () => {
  const register = region(lessonPreflight, 'const registerSecureFamilies = async (file) => {', 'const publishingValidation = useMemo(', 'in-place family import');
  // Exactly the missing documents, from the file the teacher chose…
  assert.match(register, /familyDocumentsToRegister\(\{ parsed, familyIds: wanted \}\)/);
  // …through the same two-pass, all-or-nothing importer Administration uses…
  assert.match(register, /await seedPathQuestionBank\(documents,/);
  // …and the authoritative preflight runs again afterwards.
  assert.match(register, /setServerCyclePreflightRun\(\(run\) => run \+ 1\)/);
  const effect = region(lessonPreflight, 'preflightTestCycleCandidate({ assignment: effectiveAssignmentV5 })', 'const testCycleCandidate = useMemo(', 'server preflight effect');
  assert.match(effect, /\}, \[effectiveAssignmentV5, serverCyclePreflightRun\]\);/);
  // Offered to the root administrator; App says who that is.
  assert.match(executableSource(lessonPreflight), /\{canManageSecureBank \? \(/);
  assert.match(region(app, '<LessonPreflightModal', '/>', 'review modal'), /canManageSecureBank=\{rootAdminUiEligible\}/);
});

test('the review screen opens the full Test, Corrections and Retest preview for the unsaved cycle', () => {
  assert.match(lessonPreflight, /const TestCyclePreview = lazy\(\(\) => import\('\.\/TestCyclePreview\.jsx'\)\);/);
  const overlay = region(lessonPreflight, '{cyclePreviewOpen && testCycleCandidate && (', '</Suspense>', 'candidate preview');
  assert.match(overlay, /<TestCyclePreview[\s\S]*assignment=\{effectiveAssignmentV5\}[\s\S]*candidate=\{testCycleCandidate\}/);
  assert.match(executableSource(lessonPreflight), /onClick=\{\(\) => setCyclePreviewOpen\(true\)\}/);
  // The preview checks a candidate's answers against the same candidate.
  const graders = [...preview.matchAll(/gradeTestCyclePreviewItem\(\{([^}]*)\}\)/g)].map((match) => match[1]);
  assert.equal(graders.length, 2, 'the Test and Corrections graders');
  graders.forEach((args) => assert.match(args, /\bcandidate\b/));
});

test('the server previews and grades a candidate behind the teacher check, inside the blueprint and preview seed', () => {
  const issue = region(functionsIndex, 'exports.previewTestCycleSecureItems = onCall(', 'exports.gradeTestCyclePreviewItem', 'preview issue');
  assert.match(issue, /teacherUid = await requireTeacher\(request\);\s*loaded = \{ \.\.\.\(await loadTestCycleCandidate\(db, request\.data\?\.assignment\)\), candidate: true \};/);
  assert.match(issue, /\.\.\.\(loaded\.candidate \? \{ c: 1 \} : \{ a: assignmentId \}\)/);
  const grade = region(functionsIndex, 'exports.gradeTestCyclePreviewItem = onCall(', 'const ASSIGNMENT_EVIDENCE_GRADE_MAPS', 'preview grade');
  const candidateBranch = region(grade, 'if (decoded.c === 1) {', '} else {', 'candidate branch');
  assert.match(candidateBranch, /teacherUid = await requireTeacher\(request\);[\s\S]*loadTestCycleCandidate\(db, request\.data\?\.assignment\)/);
  // Both branches then meet the same two checks before anything is graded.
  const afterBranches = grade.slice(grade.indexOf('if (!blueprintFamilyIds(blueprint).includes(String(decoded.f)))'));
  assert.ok(afterBranches.length < grade.length, 'the family check follows the branches');
  assert.ok(afterBranches.indexOf('preview:${teacherUid}') > 0, 'and so does the preview-seed check');
  assert.ok(afterBranches.indexOf('preview:${teacherUid}') < afterBranches.indexOf('secureItems.gradeItem('), 'both before grading');
});
