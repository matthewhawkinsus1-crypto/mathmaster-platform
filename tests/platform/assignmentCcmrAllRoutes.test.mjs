import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const service = fs.readFileSync('src/services/assignmentCcmrService.js', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');

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


test('Honors destination creation requests the audited Practice target without changing Standard variants', () => {
  const start = app.indexOf('const destinationGroups = buildDestinationGroups');
  const end = app.indexOf('const createdAssignments = []', start);
  const block = app.slice(start, end);
  assert.match(block, /hasHonorsDestination/);
  assert.match(block, /hydrateAssignmentCcmr\(reviewedV5, \{ ensurePracticeTarget: true \}\)/);
  assert.match(block, /let honorsParsedQuestions = parsedQuestions/);
  assert.match(block, /if \(destination\.courseLevel === 'honors'\)[\s\S]*destinationQuestions = honorsParsedQuestions/);
  assert.match(block, /let destinationQuestions = parsedQuestions/);

  const honorsStart = block.indexOf("if (destination.courseLevel === 'honors')");
  const honorsEnd = block.indexOf('return { destination, questions: destinationQuestions };', honorsStart);
  const honorsBlock = block.slice(honorsStart, honorsEnd);
  assert.match(
    honorsBlock,
    /normalizeAssignmentQuestions\(\[\s*\.\.\.honorsParsedQuestions,/,
    'adding Honors depth must preserve the audited CCMR-hydrated Practice questions',
  );
  assert.doesNotMatch(
    honorsBlock,
    /normalizeAssignmentQuestions\(\[\s*\.\.\.parsedQuestions,/,
    'Honors depth must never rebuild from the pre-hydration Standard question list',
  );
});


test('Honors creation honors the server short-Practice CCMR exemption', () => {
  const start = app.indexOf('const destinationGroups = buildDestinationGroups');
  const end = app.indexOf('const createdAssignments = []', start);
  const block = app.slice(start, end);

  assert.match(block, /let honorsCcmrTargetRequired = true/);
  assert.match(block, /hydratedHonors\.audit\.targetCount/);
  assert.match(block, /ccmrTargetRequired: honorsCcmrTargetRequired/);
  assert.match(block, /sourceHonorsReport\.ccmrTargetRequired && !sourceHonorsReport\.checks\.ccmrEnrichment/);
});
