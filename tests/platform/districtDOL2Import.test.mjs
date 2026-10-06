import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch, testCycleContractFields } from '../../src/platform/contract/storedAssignmentV5.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { validateAlignments } from '../../src/platform/contract/alignments.js';
import { getQuestionRepresentation } from '../../src/platform/contract/questionTypeCatalog.js';

const raw = readFileSync(new URL('../../drafts/district-dol2/assignment.json', import.meta.url), 'utf8');
const assignment = JSON.parse(raw);

// These cover the actual import/save boundary, not just the V5 schema. The
// previous generator emitted renderer contracts without the portable marker
// and invalid uppercase framework names; both escaped the schema-only test.
test('DOL2 imports without recompiling or losing coordinated review variants', () => {
  const imported = parseAssignmentBlueprintText(raw);
  assert.equal(imported.questions.length, 7);
  for (const question of imported.questions) {
    assert.equal(question.type, 'multiAnswer');
    assert.equal(question.variants.length, 48);
    assert.ok(question.answerFields.length > 0);
    assert.deepEqual(question.stimulus, assignment.sections[0].questions.find(q => q.questionId === question.questionId).stimulus);
  }
  assert.equal(imported.assignmentV5.testBlueprint.totalQuestions, 13);
});

test('the full teacher Preflight approves DOL2 for a class of 35 and the save retains its secure contract', () => {
  const model = buildAssignmentV5PreflightModel(assignment, { classSize: 35 });
  assert.deepEqual(model.errors, []);
  assert.equal(model.isValid, true);
  // Binary function/causation checks carry advisory authoring notes. Those
  // must not disable Save to Library or Create & Assign, unlike the errors
  // from the original export. Use the same readiness function as the modal.
  for (const draft of [
    { title: assignment.assignment.title, assignedClassIds: [] },
    { title: assignment.assignment.title, assignedClassIds: ['class-1'], dueAt: '2099-01-01T12:00:00Z' },
  ]) {
    const readiness = summarizePreflightReadiness({ blockers: collectReviewBlockers({ draft }), validationErrors: model.errors, bundleIsValid: model.isValid });
    assert.equal(readiness.canCreate, true);
  }
  assert.ok(!model.warnings.some(warning => /no primary alignment/.test(warning)));
  // App creation carries the contract through testCycleContractFields beside
  // the ordinary persistence fields, as required by the assessment update.
  const saved = { ...canonicalV5PersistencePatch(model.assignmentV5), ...testCycleContractFields(model.assignmentV5) };
  assert.equal(saved.assessmentPolicy.externalAssessment.source, 'Eduphoria');
  assert.equal(saved.assessmentPolicy.review.minimumMastery, 80);
  assert.equal(saved.assessmentPolicy.retest.maxRecordedGrade, 70);
  assert.equal(saved.testBlueprint.totalQuestions, 13);
  assert.equal(saved.testBlueprint.timeLimitSeconds, null);
  assert.deepEqual(saved.sections.map(s => s.role), ['review']);
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 1_000_000);
});

test('every delivered review variant has a valid mastery-producing alignment', () => {
  for (const question of assignment.sections[0].questions) {
    for (const variant of [question, ...question.variants]) {
      const result = validateAlignments(variant);
      assert.deepEqual(result.errors, []);
      assert.ok(!result.warnings.some(warning => /no primary alignment/.test(warning)));
    }
  }
});

test('the teacher representation audit renders the real nested graphs and tables', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Audit, summarizeRepresentations } = await server.ssrLoadModule('/src/components/teacher/RepresentationAudit.jsx');
    const questions = assignment.sections[0].questions;
    assert.deepEqual(questions.map(getQuestionRepresentation), ['symbolic', 'symbolic', 'graph', 'graph', 'graph', 'graph', 'table']);
    const summary = summarizeRepresentations(questions);
    assert.equal(summary.visualCount, 5);
    const html = renderToStaticMarkup(React.createElement(Audit, { questions }));
    assert.doesNotMatch(html, /No visual questions|Mostly text/);
    assert.match(html, /Graphs/);
    assert.match(html, /Tables/);
  } finally { await server.close(); }
});

test('native stimulus classification recognizes tables in nested panels without calling note-only tasks visual', () => {
  assert.equal(getQuestionRepresentation({ type: 'multiAnswer', stimulus: { panels: [{ panels: [{ table: { rows: [{ cells: [1, 2] }] } }] }] } }), 'table');
  assert.equal(getQuestionRepresentation({ type: 'multiAnswer', stimulus: { panels: [{ note: 'Read this scenario.' }] } }), 'symbolic');
  assert.equal(getQuestionRepresentation(null), 'text');
});
