/*
 * THE SCREENS ARE WIRED SO PRE-FLIGHT DECIDES THE HONORS VERSION AND CREATE
 * ONLY PUBLISHES IT.
 *
 * node cannot render these components, so each contract is anchored to the
 * handler, memo or call site that does the work (region(...)) and asserts
 * what it must DO. The behaviour itself is proven on the real modules in
 * honorsCcmrPreflightCandidate.test.mjs; these make sure the screens use it.
 * See docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const modalSource = read('src/components/teacher/LessonPreflightModal.jsx');
const modal = executableSource(modalSource);
const workspaceSource = read('src/app/teacher/TeacherWorkspace.jsx');
const workspace = executableSource(workspaceSource);
const functionsIndex = executableSource(read('functions/index.js'));
const service = executableSource(read('src/services/assignmentCcmrService.js'));

const createHandler = () => region(workspace, 'const handleCreateAssignment = async', 'const updateExistingAssignmentFromReview', 'handleCreateAssignment');

test('Create never sources, swaps or repairs an audited item: it confirms the Honors version Pre-Flight proved', () => {
  const create = createHandler();
  assert.doesNotMatch(create, /hydrateAssignmentCcmr\(|applyCcmrHydrationToCanonicalAssignment\(|replaceDirectCcmrQuestionsWithAuditedBank\(/);
  assert.match(create, /confirmHonorsCandidateForCreate\(\{[\s\S]*?honorsCandidate,[\s\S]*?reviewedAssignmentV5: reviewedCandidate,[\s\S]*?honorsEnrichmentQuestion: teacherReview\?\.honorsEnrichmentQuestion/);
  // Imported next to its call: TeacherWorkspace is .jsx, so a call with no
  // import passes every check and fails at runtime.
  assert.match(workspaceSource, /import \{[^}]*confirmHonorsCandidateForCreate[^}]*\} from '\.\.\/\.\.\/platform\/assignments\/canonicalCcmrHydration\.js';/);
  // The Honors destination publishes that version's sections; Standard and
  // library saves publish the reviewed assignment's.
  const split = region(create, 'const destinationVariants = destinationGroups.map', 'const plannedWrites', 'destination split');
  assert.match(split, /destination\.courseLevel !== 'honors'[\s\S]*?questions: parsedQuestions, sectionsSource: reviewedV5/);
  assert.match(split, /questions: honorsParsedQuestions, sectionsSource: honorsVersion\.assignmentV5/);
  assert.match(create, /honorsParsedQuestions = honorsVersion[\s\S]*?flattenV5Sections\(honorsVersion\.assignmentV5\)/);
  assert.match(create, /sections: rebuildV5SectionsFromQuestions\(sectionsSource, variantQuestions\)/);
  // …and the Honors record says how its CCMR was decided.
  assert.match(create, /honorsCcmr: honorsVersion\.record/);
});

test('the Honors version is confirmed before anything is written', () => {
  const create = createHandler();
  const confirmAt = create.indexOf('confirmHonorsCandidateForCreate(');
  const commitAt = create.indexOf('.commit()');
  assert.ok(confirmAt > 0 && commitAt > confirmAt, 'confirmation precedes the commit');
  assert.ok(create.indexOf('assertFirestoreSafeAssignmentPayload(payload)') < commitAt, 'every payload is checked before the commit');
});

test('every destination is written in one atomic commit, and a failure after it is never reported as "not created"', () => {
  const create = createHandler();
  assert.equal((create.match(/\.commit\(\)/g) || []).length, 1, 'one commit for the Standard and Honors versions and their labs');
  assert.equal((create.match(/writeBatch\(db\)/g) || []).length, 1);
  assert.doesNotMatch(create, /setDoc\(|addDoc\(/, 'no write outside the batch');
  const commit = region(create, 'const publishBatch = writeBatch(db);', 'const createdAssignments', 'publish batch');
  assert.match(commit, /plannedWrites\.forEach\([\s\S]*?publishBatch\.set\(assignmentRef, payload\)/);
  assert.match(commit, /publishBatch\.set\(doc\(db, 'modelingLabDefinitions', nextLabId\)/);
  assert.match(commit, /await publishBatch\.commit\(\);\s*committed = true;/);
  // Classroom posts are made only for documents that were committed.
  assert.ok(create.indexOf('committed = true') < create.indexOf('autoPublishAssignmentPackageToClassroom('));
  // The handler's own catch: the last one in it.
  const failure = create.slice(create.lastIndexOf('} catch (error) {'));
  assert.match(failure, /^\} catch \(error\) \{\s*if \(committed\) \{[\s\S]*?setAssignmentPreflight\(null\)[\s\S]*?\} else \{[\s\S]*?Nothing was created/);
  // Before the commit the review stays open: nothing closes it on failure.
  const beforeCommit = create.slice(0, create.indexOf('await publishBatch.commit()'));
  assert.doesNotMatch(beforeCommit, /setAssignmentPreflight\(null\)/);
});

test('the review passes the proven Honors version to Create, only while it is current', () => {
  const publish = region(modal, 'onConfirmPublish?.({', 'style={{ flex: isNarrow ? 2', 'publish payload');
  assert.match(publish, /honorsCandidate: honorsCandidateCurrent \? honorsCandidate : null/);
  assert.match(modal, /const honorsCandidateCurrent = Boolean\(honorsCandidate\) && honorsCandidate\.baseFingerprint === reviewedFingerprint/);
  assert.match(modal, /const reviewedFingerprint = useMemo\(\(\) => \(honorsVersionNeeded \? assignmentFingerprint\(effectiveAssignmentV5\)/);
  const confirm = region(workspace, 'const confirmAssignmentPreflight = async', 'const openQuestionEditor', 'confirmAssignmentPreflight');
  assert.match(confirm, /async \(\{ draft, assignmentV5, honorsCandidate = null \}\)/);
  assert.match(confirm, /handleCreateAssignment\(draft, assignmentV5, \{ honorsCandidate \}\)/);
});

test('Pre-Flight asks the bank for ranked alternatives and proves them, keyed to the questions it was asked about', () => {
  assert.match(modalSource, /import \{ hydrateAssignmentCcmr \} from '\.\.\/\.\.\/services\/assignmentCcmrService\.js';/);
  assert.match(modalSource, /import \{[^}]*composeHonorsCcmrCandidate[^}]*selectHonorsCcmrItems[^}]*\} from '\.\.\/\.\.\/platform\/assignments\/canonicalCcmrHydration\.js';/);
  const request = region(modal, 'const ccmrRequestKey = useMemo', 'const honorsSelectionKey', 'plan request');
  assert.match(request, /ccmrSourcingKey\(honorsBaseAssignmentV5\)/);
  assert.match(request, /hydrateAssignmentCcmr\(requested, \{ ensurePracticeTarget: true, includeCandidates: true, excludeDocumentIds \}\)/);
  assert.match(request, /active = false/, 'an answer for questions that have since changed is ignored');
  const stages = region(modal, 'const honorsSelection = useMemo', 'const reviewedFingerprint', 'selection and composition');
  assert.match(stages, /selectHonorsCcmrItems\(\{[\s\S]*?hydration: ccmrPlan\.hydration,[\s\S]*?honorsEnrichmentQuestion,[\s\S]*?excludedDocumentIds: ccmrSetAside,[\s\S]*?classSize: honorsClassSize/);
  assert.match(stages, /composeHonorsCcmrCandidate\(\{[\s\S]*?baseAssignmentV5: honorsBaseAssignmentV5,[\s\S]*?keepAuthored:/);
  // The plan is used only for the questions it was made for.
  assert.match(modal, /const ccmrPlanReady = honorsCcmrNeeded && ccmrPlan\.status === 'ready' && ccmrPlan\.key === ccmrRequestKey/);
});

test('readiness waits for the Honors version and judges the report Create will check', () => {
  const readiness = region(modal, 'const readinessHonorsReport =', 'const showingHonorsPreview', 'readiness');
  assert.match(readiness, /honorsCandidateCurrent \? honorsCandidate\.honorsReport : honorsReport/);
  assert.match(readiness, /collectReviewBlockers\(\{[^}]*honorsReport: readinessHonorsReport, honorsCcmr: honorsCcmrState \}\)/);
  const state = region(modal, 'const honorsCcmrState = useMemo', 'const honorsCcmrChip', 'Honors version state');
  assert.match(state, /if \(!honorsCandidate \|\| !honorsCandidateCurrent\) return \{ status: 'preparing' \}/);
});

test('the Honors version state blocks Create in the Classes step until it is resolved', () => {
  const draft = { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' };
  const honorsReport = { isHonorsReady: true, missing: [] };
  const readinessFor = (honorsCcmr) => summarizePreflightReadiness({
    blockers: collectReviewBlockers({ draft, honorsSelected: true, honorsReport, honorsCcmr }),
    validationErrors: [],
  });
  for (const status of ['preparing', 'error', 'needsDecision', 'invalid']) {
    const readiness = readinessFor({ status, error: 'deadline-exceeded', errors: ['Question 3 refers to a graph in its prompt, but the question contains none.'] });
    assert.equal(readiness.canCreate, false, `${status} blocks Create`);
    assert.equal(readiness.firstBlockedStep, 'classes', `${status} points to the Classes step`);
  }
  assert.match(readinessFor({ status: 'invalid', errors: ['Question 3 refers to a graph in its prompt, but the question contains none.'] }).all[0].message, /Question 3 refers to a graph/);
  assert.match(readinessFor({ status: 'error', error: 'deadline-exceeded.' }).all[0].message, /deadline-exceeded\. Use “Try again”/);
  for (const status of ['ready', 'notRequired', 'keptAuthored']) {
    assert.equal(readinessFor({ status }).canCreate, true, `${status} lets the teacher create`);
  }
  // Without an Honors class, nothing about it blocks.
  assert.equal(summarizePreflightReadiness({
    blockers: collectReviewBlockers({ draft, honorsSelected: false, honorsReport, honorsCcmr: { status: 'preparing' } }),
  }).canCreate, true);
});

test('the teacher sees the Honors version, can preview each audited item, replace it, and decide when none passes', () => {
  const panel = region(modal, 'const renderHonorsVersion = () => {', 'const renderClasses = () => (', 'Honors version panel');
  for (const label of ['Preview as a student', 'Use a different audited item', 'Keep the authored Practice for Honors', 'Check the audited bank again', 'Try again', 'Undo']) {
    assert.ok(panel.includes(label), `"${label}" is offered`);
  }
  assert.match(panel, /onClick=\{\(\) => previewHonorsQuestion\(entry\.sectionIndex, entry\.questionIndex\)\}/);
  assert.match(panel, /onClick=\{\(\) => setAuditedItemAside\(entry\.documentId\)\}/);
  assert.match(panel, /onClick=\{keepAuthoredPracticeForHonors\}/);
  // The failed questions come back with what failed.
  assert.match(panel, /skipped\.map\(\(entry\) =>[\s\S]*?entry\.prompt[\s\S]*?entry\.errors\.map/);
  // The choice is offered only once MathMaster has found that nothing passes.
  assert.match(panel, /state === HONORS_CCMR_STATUS\.NEEDS_DECISION\s*\?\s*<button type="button" onClick=\{keepAuthoredPracticeForHonors\}/);
  assert.match(modal, /const keepAuthoredPracticeForHonors = \(\) => \{\s*if \(keepAuthoredToken\) setCcmrKeepAuthoredFor\(keepAuthoredToken\);/);
  // Nothing promises the teacher that CCMR happens later, at publish.
  assert.doesNotMatch(modalSource, /at publish/);
  // Audited prompts are templates ({{m}}): the teacher reads one drawn
  // instance of each placed or failed item, rendered as mathematics.
  assert.match(panel, /<MathText as="div"[^>]*>\{auditedExamplePrompt\(candidate\.assignmentV5\.sections\[entry\.sectionIndex\]\?\.questions\?\.\[entry\.questionIndex\], entry\.prompt\)\}<\/MathText>/);
  assert.match(panel, /<MathText as="div"[^>]*>\{auditedExamplePrompt\(entry\.question, entry\.prompt\)\}<\/MathText>/);
  const example = region(modal, 'const auditedExamplePrompt = ', 'const HONORS_TONES', 'drawn example');
  assert.match(example, /hasPathGenerator\(question\)/);
  assert.match(example, /generatePathInstanceWithRetries\(question, /);
  // …imported where they are called (a .jsx call with no import passes the build).
  assert.match(modal, /^import \{ generatePathInstanceWithRetries, hasPathGenerator \} from '\.\.\/\.\.\/\.\.\/functions\/shared\/pathQuestionGeneration\.mjs';$/m);
  assert.match(modal, /^import MathText from '\.\.\/common\/MathText\.jsx';$/m);
});

test('the student preview shows either version from the object Create publishes for it', () => {
  assert.match(modal, /const previewActivities = showingHonorsPreview \? honorsCandidate\.model\.sections : activities;/);
  assert.match(modal, /const currentActivity = previewActivities\[demoActivityIndex\]/);
  const switcher = region(modal, 'role="group" aria-label="Which version to preview"', '<button\n          type="button"\n          onClick={() => setPreviewOpen', 'version switch');
  assert.match(switcher, /aria-pressed=\{previewVersion === version\}/);
  assert.match(modal, /data-preview-honors-only="true"/);
  assert.match(modal, /honorsCandidate\.sourced\.find\(here\)/);
  assert.match(modal, /here\(honorsCandidate\.extensionLocation\)/);
});

test('the new controls stay usable on phones, Chromebooks and desktops', () => {
  const panel = region(modal, 'const renderHonorsVersion = () => {', 'const renderClasses = () => (', 'Honors version panel');
  const heights = [...panel.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.ok(heights.length >= 2 && heights.every((height) => height >= 44), `touch targets (${heights})`);
  assert.match(panel, /const button = \{ minHeight: 44/);
  assert.match(panel, /flexWrap: 'wrap'/);
  assert.match(panel, /overflowWrap: 'anywhere'/, 'long audited document ids wrap instead of widening the page');
  assert.doesNotMatch(panel, /onMouseEnter|onMouseOver|:hover/);
  assert.doesNotMatch(panel, /width:\s*\d{3,}|minWidth:\s*[3-9]\d\d/, 'no fixed width wider than a phone');
  const switcher = region(modal, 'role="group" aria-label="Which version to preview"', '<button\n          type="button"\n          onClick={() => setPreviewOpen', 'version switch');
  assert.match(switcher, /minHeight: 44/);
  assert.match(switcher, /flexWrap: 'wrap'/);
});

test('the callable passes the plan request through, and the service asks for it only when told', () => {
  const callable = region(functionsIndex, 'exports.hydrateAssignmentCcmr = onCall', 'function assignmentAiModel', 'hydrateAssignmentCcmr');
  assert.match(callable, /includeCandidates: request\.data\?\.includeCandidates === true/);
  assert.match(callable, /excludeDocumentIds,/);
  assert.match(callable, /\.slice\(0, 100\)/, 'a bounded exclusion list');
  assert.match(service, /\.\.\.\(includeCandidates === true \? \{ includeCandidates: true \} : \{\}\)/);
});
