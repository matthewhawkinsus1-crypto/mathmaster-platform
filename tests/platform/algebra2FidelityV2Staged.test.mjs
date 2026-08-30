import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { samplePathInstances, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import { isPathEligible } from '../../functions/shared/pathToolContracts.mjs';
import { REPRESENTATIONS, TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stagedDir = 'drafts/fidelity-v2/algebra2';
const codes = readdirSync(stagedDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const staged = codes.map((code) => read(`${stagedDir}/${code}.json`));
const payload = (code) => staged.find((entry) => entry.standard === code);

test('every staged Algebra II Fidelity V2 package has five new families', () => {
  const ids = new Set();
  const familyIds = new Set();
  for (const entry of staged) {
    assert.equal(entry.documents.length, 5, `${entry.standard} must contain exactly five families`);
    for (const doc of entry.documents) {
      assert.equal(doc.assessedConstruct, entry.standard);
      assert.ok(doc.alignmentKeys?.includes(`texas:${entry.standard}`));
      assert.ok(doc.id.includes('_v2_'));
      assert.ok(doc.familyId.includes(':v2-'));
      assert.equal(ids.has(doc.id), false, `duplicate id ${doc.id}`);
      assert.equal(familyIds.has(doc.familyId), false, `duplicate familyId ${doc.familyId}`);
      ids.add(doc.id);
      familyIds.add(doc.familyId);
      assert.ok(REPRESENTATIONS.includes(doc.representation), `${doc.id} has invalid representation`);
      assert.ok(TASK_TYPES.includes(doc.taskType), `${doc.id} has invalid taskType`);
      assert.ok(Number(doc.dok) >= 1 && Number(doc.dok) <= 4);
      assert.ok(Number(doc.difficultyBand) >= 1 && Number(doc.difficultyBand) <= 5);
    }
  }
});

test('A2.2A covers every required parent family through authentic secure graph construction', () => {
  const entry = payload('A2.2A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /seven-parent-functions-authentic-graph-construction-and-attributes/);

  const types = new Set();
  const logBases = new Set();
  let generatedCount = 0;

  for (const doc of entry.documents) {
    assert.equal(doc.type, 'functionInvestigation');
    assert.equal(doc.representation, 'graph');

    for (const generated of samplePathInstances(doc, 80)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible graph question`);
      assert.ok(question.pointTasks?.length >= 3, `${doc.id} must require plotted evidence`);
      assert.ok(question.analysisRequests?.length >= 2, `${doc.id} must connect graphing to attribute analysis`);
      assert.ok(question.pointTasks.every((task) => task.expected !== undefined), `${doc.id} has an ungraded plotted point`);
      assert.ok(question.analysisRequests.every((part) => part.expected !== undefined || part.acceptedAnswers !== undefined), `${doc.id} has an ungraded analysis part`);

      const type = question.functionSpec?.type;
      if (type) types.add(type);
      if (type === 'logarithmic') logBases.add(Number(question.functionSpec.base).toFixed(6));
    }
  }

  assert.ok(generatedCount >= 400);
  assert.deepEqual(
    [...types].sort(),
    ['absolute', 'cubeRoot', 'cubic', 'exponential', 'logarithmic', 'rational', 'squareRoot'].sort(),
  );
  assert.ok(logBases.has((2).toFixed(6)), 'A2.2A must graph log base 2');
  assert.ok(logBases.has((10).toFixed(6)), 'A2.2A must graph log base 10');
  assert.ok(logBases.has((Math.E).toFixed(6)) || logBases.has((2.718281828).toFixed(6)), 'A2.2A must graph natural log / base e');

  const allGenerated = entry.documents.flatMap((doc) => samplePathInstances(doc, 40).map((entry) => entry.question).filter(Boolean));
  assert.ok(allGenerated.some((q) => q.functionSpec?.type === 'rational' && q.analysisRequests?.some((p) => /asymptote/i.test(p.label || ''))));
  assert.ok(allGenerated.some((q) => q.functionSpec?.type === 'absolute' && q.analysisRequests?.some((p) => /symmetry/i.test(p.label || ''))));
  assert.ok(allGenerated.some((q) => q.functionSpec?.type === 'logarithmic' && q.taskType === 'errorAnalysis'));
});


test('A2.2B makes complete inverse writing the dominant evidence across five representations', () => {
  const entry = payload('A2.2B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /inverse-equation-writing-graph-reflection-table-and-domain-restriction/);
  assert.equal(entry.documents.length, 5);

  let generatedCount = 0;
  let sawGraphReflection = false;
  let sawTable = false;
  let sawCubic = false;
  let sawCubeRoot = false;
  let sawRestriction = false;

  for (const doc of entry.documents) {
    for (const generated of samplePathInstances(doc, 80)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible inverse question`);

      if (question.type === 'functionInvestigation' && question.inverseReflection?.enabled) {
        sawGraphReflection = true;
        assert.equal(question.inverseReflection.requireInverseSketch, true);
        assert.equal(question.inverseReflection.requireInverseEquation, true);
        assert.ok(question.pointTasks?.length >= 2);
      }

      if (question.table?.rows?.length >= 3) sawTable = true;

      const prompt = String(question.prompt || '').toLowerCase();
      if (prompt.includes(')^3') || prompt.includes(')^3')) sawCubic = true;
      if (prompt.includes('cube-root') || prompt.includes('\\sqrt[3]')) sawCubeRoot = true;

      const fields = question.answerFields || [];
      if (fields.some((field) => field.id === 'restriction')) {
        sawRestriction = true;
        assert.ok(fields.some((field) => field.id === 'inverseEquation'));
      }

      if (question.type === 'multiAnswer') {
        assert.ok(fields.length >= 1);
        assert.ok(fields.some((field) => /inverse/i.test(field.id || field.label || '')));
      }
    }
  }

  assert.ok(generatedCount >= 400);
  assert.equal(sawGraphReflection, true);
  assert.equal(sawTable, true);
  assert.equal(sawCubic, true);
  assert.equal(sawCubeRoot, true);
  assert.equal(sawRestriction, true);

  const legacyChoiceOnly = entry.documents.some((doc) => Array.isArray(doc.choices) && doc.choices.length > 0);
  assert.equal(legacyChoiceOnly, false, 'A2.2B V2 must not fall back to inverse-equation multiple choice');
});
