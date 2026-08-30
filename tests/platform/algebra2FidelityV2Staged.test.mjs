import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { samplePathInstances, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';
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

const correctRawWork = (privateGrading) => {
  const definition = privateGrading?.definition || {};
  return {
    placements: Object.fromEntries(
      (definition.points || []).map((part) => [part.id, part.expected]),
    ),
    markerPlacements: Object.fromEntries(
      (definition.markers || []).map((part) => [part.id, part.marker]),
    ),
    selections: Object.fromEntries(
      (definition.analysis || [])
        .filter((part) => ['point', 'inversePoint'].includes(part.kind))
        .map((part) => [part.id, part.expected]),
    ),
    answers: Object.fromEntries(
      (definition.analysis || [])
        .filter((part) => !['point', 'inversePoint'].includes(part.kind))
        .map((part) => [part.id, (part.accepted?.length ? part.accepted : part.expected)?.[0] ?? '']),
    ),
  };
};

test('A2.2B repeatedly requires graph-reflect-write inverse evidence across representations', () => {
  const entry = payload('A2.2B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /graph-reflect-write-inverse/);

  const functionTypes = new Set();
  const representations = new Set();
  let generatedCount = 0;
  let nonlinearCount = 0;
  let tableInstances = 0;

  for (const doc of entry.documents) {
    assert.equal(doc.type, 'functionInvestigation');
    assert.equal(doc.inverseReflection?.enabled, true);
    assert.equal(doc.inverseReflection?.requireInverseSketch, true);
    assert.equal(doc.inverseReflection?.requireInverseEquation, true);
    assert.ok(doc.pointTasks?.length >= 2, `${doc.id} must require original graph construction`);

    representations.add(doc.representation);
    if (doc.functionSpec?.type) functionTypes.add(doc.functionSpec.type);
    if (doc.functionSpec?.type !== 'linear') nonlinearCount += 1;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible inverse question`);

      const publicPayload = buildPublicToolPayload(question);
      assert.equal(publicPayload.serverGradingVersion, 2);
      assert.equal(publicPayload.tool.inverseReflection?.enabled, true);
      assert.equal(publicPayload.tool.inverseReflection?.requireInverseSketch, true);
      assert.equal(publicPayload.tool.inverseReflection?.requireInverseEquation, true);
      assert.ok(publicPayload.tool.analysisRequests?.filter((part) => part.kind === 'inversePoint').length >= 2);
      assert.ok(publicPayload.tool.analysisRequests?.some((part) => part.notation === 'equation'));

      // The equation key belongs to the server. The public payload carries only
      // the instruction and equation response field, never the expected inverse.
      const expectedEquation = String(question.inverseReflection?.expectedEquation || '');
      assert.ok(expectedEquation);
      assert.equal(JSON.stringify(publicPayload.tool).includes(expectedEquation), false);

      if (doc.representation === 'table') {
        tableInstances += 1;
        assert.equal(publicPayload.tool.stimulus?.kind, 'table');
        assert.ok(publicPayload.tool.stimulus?.table?.headers?.length >= 2);
        assert.ok(publicPayload.tool.stimulus?.table?.rows?.length >= 3);
        assert.ok(publicPayload.tool.stimulus.table.rows.every((row) => Array.isArray(row?.cells)));
      }

      // Self-grade the exact generated answer through the same private contract
      // the Path server uses. A generated key that cannot accept itself is a
      // release blocker, even if the authored JSON looks mathematically right.
      const privateGrading = buildPrivateToolGrading(question);
      const grading = gradePathResponse({
        privateGrading,
        raw: correctRawWork(privateGrading),
      });
      assert.equal(grading.rejected, false, `${doc.id} rejected correctly-shaped generated work`);
      assert.equal(
        grading.isCorrect,
        true,
        `${doc.id} failed secure correct-answer self-acceptance: ${JSON.stringify(grading.parts)}`,
      );
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(tableInstances >= 40, 'A2.2B must preserve an authentic table-to-graph inverse family in secure Path');
  assert.ok(representations.has('table'));
  assert.ok(representations.has('graph'));
  assert.deepEqual(
    [...functionTypes].sort(),
    ['linear', 'quadratic', 'rational', 'squareRoot'].sort(),
  );
  assert.ok(nonlinearCount >= 3, 'A2.2B must not collapse inverse mastery to linear functions only');
});

