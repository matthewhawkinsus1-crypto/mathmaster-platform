import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { appAndTeacherWorkspaceSource } from './helpers/appScreens.mjs';
import { region } from './helpers/sourceContract.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { buildHonorsCcmrCandidate } from '../../src/platform/assignments/canonicalCcmrHydration.js';

const { replaceDirectCcmrQuestionsWithAuditedBank } = createRequire(import.meta.url)('../../functions/lib/ccmrAssignmentBank.js');

const app = appAndTeacherWorkspaceSource();
const service = fs.readFileSync('src/services/assignmentCcmrService.js', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
const canonicalHydration = fs.readFileSync('src/platform/assignments/canonicalCcmrHydration.js', 'utf8');
const bankSource = fs.readFileSync('functions/lib/ccmrAssignmentBank.js', 'utf8');

test('pasted and uploaded Assignment V5 JSON is bank-hydrated before local compilation', () => {
  const start = app.indexOf('const handleAssignmentJsonReady');
  const end = app.indexOf('const handleCreateAssignment', start);
  const block = app.slice(start, end);
  assert.match(block, /JSON\.parse\(String\(text \|\| ''\)\)/);
  assert.match(block, /await hydrateAssignmentCcmr\(raw, \{ ensurePracticeTarget: false \}\)/);
  assert.match(block, /sourceText = JSON\.stringify\(hydrated\.assignment\)/);
  assert.ok(
    block.indexOf('await hydrateAssignmentCcmr(raw, { ensurePracticeTarget: false })') < block.indexOf('readAssignmentJson(sourceText)'),
    'bank hydration must happen before V5 compilation and Preflight',
  );
});

test('the client uses a dedicated authenticated callable for bank hydration', () => {
  assert.match(service, /httpsCallable\(functions, 'hydrateAssignmentCcmr'/);
  assert.match(service, /ensurePracticeTarget = false/);
  assert.match(service, /ensurePracticeTarget: ensurePracticeTarget === true/);
  assert.match(service, /Number\(assignment\.schemaVersion\) !== 5/);
  assert.match(service, /return \{[\s\S]*assignment:[\s\S]*audit:/);
});

test('the server callable requires a teacher and returns audited bank hydration', () => {
  const start = functionsIndex.indexOf('exports.hydrateAssignmentCcmr');
  const end = functionsIndex.indexOf('exports.authorAssignmentWithAI', start);
  const block = functionsIndex.slice(start, end);
  assert.match(block, /await requireTeacher\(request\)/);
  assert.match(block, /replaceDirectCcmrQuestionsWithAuditedBank\(assignment, \{[\s\S]*ensurePracticeTarget/);
  assert.match(block, /assignmentCcmrHydrationAudit/);
  assert.match(block, /return result/);
});

test('bank hydration is resilient: an unavailable callable does not destroy an otherwise valid import', () => {
  const start = app.indexOf('const handleAssignmentJsonReady');
  const end = app.indexOf('const handleCreateAssignment', start);
  const block = app.slice(start, end);
  assert.match(block, /catch \(error\) \{[\s\S]*CCMR assignment hydration was skipped/);
  assert.match(block, /const result = readAssignmentJson\(sourceText\)/);
});


test('an Honors destination asks for the audited Practice target in Pre-Flight; Standard destinations keep the reviewed lesson', () => {
  // The target is requested where its items can still be checked, shown and
  // replaced — Assignment Review — never for the first time at Create.
  const request = region(modal, 'const ccmrRequestKey = useMemo', 'const honorsSelectionKey', 'Honors plan request');
  assert.match(request, /hydrateAssignmentCcmr\(requested, \{ ensurePracticeTarget: true, includeCandidates: true/);
  assert.match(modal, /const honorsVersionNeeded = reviewMode !== 'update' && honorsSelected;/);
  assert.match(modal, /const honorsCcmrNeeded = honorsVersionNeeded && !honorsReport\.isNarrowCheckpoint;/);

  const block = region(app, 'const destinationGroups = buildDestinationGroups', 'const createdAssignments', 'destination split');
  assert.doesNotMatch(block, /hydrateAssignmentCcmr\(/, 'Create never sources an audited item');
  assert.match(block, /hasHonorsDestination[\s\S]*?confirmHonorsCandidateForCreate\(/);
  const split = region(block, 'const destinationVariants = destinationGroups.map', 'const plannedWrites', 'per-destination questions');
  assert.match(split, /if \(destination\.courseLevel !== 'honors'\) \{\s*return \{ destination, questions: parsedQuestions, sectionsSource: reviewedV5 \};/);
  assert.match(split, /return \{ destination, questions: honorsParsedQuestions, sectionsSource: honorsVersion\.assignmentV5 \};/);
});

test('adding Honors depth preserves the audited CCMR Practice: the extension joins the audited version, never the pre-hydration lesson', () => {
  const compose = region(canonicalHydration, 'export const composeHonorsCcmrCandidate', 'const ccmrTargetRequired', 'composeHonorsCcmrCandidate');
  const placementsAt = compose.indexOf('working = replaceAt(working');
  const extensionAt = compose.indexOf('placeHonorsExtension(working, honorsEnrichmentQuestion)');
  assert.ok(placementsAt > 0 && extensionAt > placementsAt, 'the extension is placed on the copy that already holds the audited items');
  const day1 = buildAssignmentV5PreflightModel(parseAssignmentBlueprintText(fs.readFileSync('docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json', 'utf8')).assignmentV5);
  const hydration = JSON.parse(JSON.stringify(replaceDirectCcmrQuestionsWithAuditedBank(JSON.parse(JSON.stringify(day1.assignmentV5)), { ensurePracticeTarget: true, includeCandidates: true })));
  const extension = { ...day1.questions.find((question) => question.activityRole === 'classwork'), questionId: 'honors-extension-copy' };
  delete extension.sectionId;
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: day1.assignmentV5, hydration, honorsEnrichmentQuestion: extension });
  const published = candidate.assignmentV5.sections.flatMap((section) => section.questions);
  assert.ok(candidate.sourced.length > 0);
  candidate.sourced.forEach((entry) => assert.ok(published.some((question) => question?.ccmrSource?.documentId === entry.documentId), `${entry.documentId} is still there`));
  assert.ok(published.some((question) => question.questionId === 'honors-extension-copy'));
});

test('a short Practice section is exempt from the CCMR target, by the server’s count, all the way to Create', () => {
  // ensureAuditedCcmrPractice sets no target below five Practice questions.
  assert.match(bankSource, /if \(positions\.length < 5\) \{\s*resultAudit\.targetCount = 0;/);
  // The certified Multiple Representations lesson: two Practice questions.
  const short = buildAssignmentV5PreflightModel(parseAssignmentBlueprintText(fs.readFileSync('docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json', 'utf8')).assignmentV5).assignmentV5;
  const { audit } = replaceDirectCcmrQuestionsWithAuditedBank(JSON.parse(JSON.stringify(short)), { ensurePracticeTarget: true, includeCandidates: true });
  assert.equal(audit.targetCount, 0);
  const candidate = buildHonorsCcmrCandidate({ baseAssignmentV5: short, hydration: { audit } });
  assert.equal(candidate.status, 'notRequired');
  assert.equal(candidate.ccmrTargetRequired, false);
  assert.equal(candidate.honorsReport.ccmrTargetRequired, false);
  // Create checks the Honors contract with the same requirement.
  const confirm = region(canonicalHydration, 'export const confirmHonorsCandidateForCreate', 'export const honorsCcmrRecord', 'confirmHonorsCandidateForCreate');
  assert.match(confirm, /ccmrTargetRequired: honorsCandidate\.ccmrTargetRequired !== false/);
});
