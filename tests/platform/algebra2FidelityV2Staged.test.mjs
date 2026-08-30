import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { samplePathInstances, placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';
import { REPRESENTATIONS, TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';
import {
  samePolynomialEquationRelation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';
import { parsePolynomial, splitEquationSides } from '../../functions/shared/algebraicForm.mjs';
import {
  pathPredictionKind,
  pathQuadraticRegression,
  pathSquareRootRegression,
} from '../../functions/shared/pathDataModelingGrading.mjs';
import {
  feasibleRegionPolygon,
  satisfiesLinearInequality,
  solve3x3System,
} from '../../src/tools/systemsWorkspace/systemsMath.js';
import {
  behaviorForSpec,
  investigationFeatures,
} from '../../src/tools/functionInvestigation2/functionInvestigationMath.js';
import { evaluateFunctionSpec } from '../../src/tools/shared/toolMath.js';

const require = createRequire(import.meta.url);
const {
  buildSanitizedQuestion,
  buildTemplateIssuePlan,
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stagedDir = 'drafts/fidelity-v2/algebra2';
const codes = readdirSync(stagedDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const staged = codes.map((code) => read(`${stagedDir}/${code}.json`));
const payload = (code) => staged.find((entry) => entry.standard === code);
const stringValues = (value) => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringValues);
  return [];
};

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

test('A2.2C centers quadratic/root and exponential/log inverse relationships with real restriction analysis', async () => {
  const entry = payload('A2.2C');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /inverse-relationship-analysis/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let quadraticRootCount = 0;
  let exponentialLogCount = 0;
  let leftBranchCount = 0;
  let rightBranchCount = 0;
  let errorAnalysisCount = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);

    const authoredText = stringValues(doc).join(' ');
    if (/quadratic|square-root|\\sqrt/.test(authoredText)) quadraticRootCount += 1;
    if (/exponential|logarithm|\\log_/.test(authoredText)) exponentialLogCount += 1;
    if (authoredText.includes('x\\le')) leftBranchCount += 1;
    if (authoredText.includes('x\\ge')) rightBranchCount += 1;
    if (doc.taskType === 'errorAnalysis') errorAnalysisCount += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.ok(question.responseFields?.length >= 2, `${doc.id} must analyze more than a one-box inverse fact`);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      assert.ok(publicQuestion);
      assert.equal(JSON.stringify(publicQuestion).includes('"expected"'), false);
      assert.equal(JSON.stringify(publicQuestion).includes('"acceptedAnswers"'), false);
      assert.ok(publicQuestion.responseFields?.every((field) => field.expected === undefined && field.answer === undefined));
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(quadraticRootCount >= 3, 'A2.2C must repeatedly analyze the quadratic/square-root inverse relationship');
  assert.ok(exponentialLogCount >= 2, 'A2.2C must repeatedly analyze the exponential/logarithmic inverse relationship');
  assert.ok(leftBranchCount >= 1, 'A2.2C must include a valid left-branch quadratic restriction');
  assert.ok(rightBranchCount >= 2, 'A2.2C must include the principal-root/right-branch restriction and its error analysis');
  assert.ok(errorAnalysisCount >= 1);
  assert.ok(representations.size >= 4, 'A2.2C must not collapse to one representation');
  assert.ok(taskTypes.has('comparison'));
  assert.ok(taskTypes.has('reverseReasoning'));
  assert.ok(taskTypes.has('errorAnalysis'));

  const errorFamily = entry.documents.find((doc) => doc.taskType === 'errorAnalysis');
  const errorSamples = samplePathInstances(errorFamily, 25).map((item) => item.question).filter(Boolean);
  assert.ok(
    stringValues(errorFamily.supportHints).some((value) => value.includes('\\sqrt{u^2}=|u|')),
    'A2.2C error analysis must explicitly preserve the square-root absolute-value identity',
  );
  assert.ok(
    errorSamples.every((question) => stringValues(question.solutionReview).some((value) => value.includes('principal square root'))),
  );
  assert.ok(
    errorSamples.every((question) => {
      const counterexample = question.responseFields?.find((field) => field.id === 'counterexample');
      const match = String(counterexample?.label || '').match(/x=(-?\d+)/);
      return match && Number(counterexample.expected) !== Number(match[1]);
    }),
    'Every generated unrestricted-quadratic error item must include a concrete composition counterexample',
  );
});

test('A2.2D uses composition as the inverse-decision evidence and enforces domain restrictions', async () => {
  const entry = payload('A2.2D');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /two-direction-composition-inverse-determination/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let bothDirectionsFamilies = 0;
  let restrictionFamilies = 0;
  let leftBranchFamilies = 0;
  let rightBranchFamilies = 0;
  let nonInverseFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);

    const fieldIds = new Set((doc.responseFields || []).map((field) => String(field.id)));
    if (fieldIds.has('fog') && fieldIds.has('gof')) bothDirectionsFamilies += 1;

    const authoredText = stringValues(doc).join(' ');
    if (/restriction|domain/.test(authoredText.toLowerCase())) restrictionFamilies += 1;
    if (authoredText.includes('x\\le')) leftBranchFamilies += 1;
    if (authoredText.includes('x\\ge')) rightBranchFamilies += 1;
    if (/not inverses|not inverse|claim fails|inverse claim fails/i.test(authoredText)) nonInverseFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.ok(question.responseFields?.length >= 3, `${doc.id} must grade composition evidence plus an inverse determination/restriction`);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
      assert.ok(publicQuestion.responseFields?.every((field) => field.expected === undefined && field.answer === undefined));
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(bothDirectionsFamilies >= 3, 'A2.2D must repeatedly require both f(g(x)) and g(f(x)) rather than treating one composition as proof');
  assert.ok(restrictionFamilies >= 3, 'A2.2D must repeatedly make domain restrictions part of the inverse decision');
  assert.ok(leftBranchFamilies >= 1, 'A2.2D must include a valid left-branch quadratic inverse composition');
  assert.ok(rightBranchFamilies >= 2, 'A2.2D must include the principal-root/right-branch restriction and its repair case');
  assert.ok(nonInverseFamilies >= 2, 'A2.2D must include composition evidence that disproves proposed inverse pairs');
  assert.ok(representations.size >= 4, 'A2.2D must not collapse composition to one representation');
  assert.ok(taskTypes.has('interpretation'));
  assert.ok(taskTypes.has('reverseReasoning'));
  assert.ok(taskTypes.has('errorAnalysis'));

  const errorFamily = entry.documents.find((doc) => doc.taskType === 'errorAnalysis');
  const errorSamples = samplePathInstances(errorFamily, 25).map((item) => item.question).filter(Boolean);
  assert.ok(
    errorSamples.every((question) => {
      const counterexample = question.responseFields?.find((field) => field.id === 'counterexample');
      const match = String(counterexample?.label || '').match(/f\((-?\d+)\)/);
      return match && Number(counterexample.expected) !== Number(match[1]);
    }),
    'Every generated A2.2D error-analysis item must contain a concrete reverse-composition counterexample',
  );
});

test('A2.3A requires students to author three-variable and linear-quadratic systems', async () => {
  const entry = payload('A2.3A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /authored-system-formulation/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let threeEquationFamilies = 0;
  let linearQuadraticFamilies = 0;
  let errorRepairFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);

    const equationFields = (doc.responseFields || []).filter((field) => field.inputProfile === 'equation');
    assert.ok(equationFields.length >= 2, `${doc.id} must make the student write the system, not only recognize it`);
    if (equationFields.length >= 3) threeEquationFamilies += 1;

    const authoredText = stringValues(doc).join(' ');
    if (/parabola|quadratic/i.test(authoredText) && /line|linear/i.test(authoredText) && equationFields.length >= 2) {
      linearQuadraticFamilies += 1;
    }
    if (doc.taskType === 'errorAnalysis' && equationFields.length >= 2) errorRepairFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      const generatedEquationFields = (question.responseFields || []).filter((field) => field.inputProfile === 'equation');
      assert.ok(generatedEquationFields.length >= 2);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
      assert.ok(publicQuestion.responseFields?.every((field) => field.expected === undefined && field.answer === undefined));
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(threeEquationFamilies >= 2, 'A2.3A must repeatedly formulate three linear equations in three variables');
  assert.ok(linearQuadraticFamilies >= 2, 'A2.3A must repeatedly formulate systems containing one linear and one quadratic equation');
  assert.ok(errorRepairFamilies >= 1, 'A2.3A error analysis must require the corrected system, not just a diagnosis');
  assert.ok(representations.size >= 4, 'A2.3A must formulate systems from varied representations');
  assert.ok(taskTypes.has('modeling'));
  assert.ok(taskTypes.has('representationTranslation'));
  assert.ok(taskTypes.has('errorAnalysis'));

  const threeEquationDocs = entry.documents.filter((doc) => (
    (doc.responseFields || []).filter((field) => field.inputProfile === 'equation').length >= 3
  ));
  assert.ok(threeEquationDocs.every((doc) => (
    (doc.responseFields || []).filter((field) => field.inputProfile === 'equation').every((field) => field.expected)
  )));
});

test('A2.3B certifies substitution, Gaussian elimination, and matrix technology on complete 3x3 solves', async () => {
  const entry = payload('A2.3B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /substitution-gaussian-elimination-matrix-technology/);

  const representations = new Set();
  const methods = new Map();
  let generatedCount = 0;
  let matrixTechnologyInstances = 0;
  let gaussianEvidenceFamilies = 0;
  let substitutionEvidenceFamilies = 0;
  let completeErrorFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    methods.set(doc.solutionMethod, (methods.get(doc.solutionMethod) || 0) + 1);

    const fieldIds = new Set((doc.responseFields || []).map((field) => String(field.id)));
    if (doc.solutionMethod === 'gaussianElimination') {
      const hasIntermediateRow = [...fieldIds].some((id) => /row|elim|correct-row/.test(id));
      assert.equal(hasIntermediateRow, true, `${doc.id} labels Gaussian elimination but collects no row-reduction evidence`);
      gaussianEvidenceFamilies += 1;
    }
    if (doc.solutionMethod === 'substitution') {
      assert.ok(fieldIds.has('sub-y') && fieldIds.has('sub-x'), `${doc.id} must collect actual substitution equations`);
      substitutionEvidenceFamilies += 1;
    }
    if (doc.taskType === 'errorAnalysis') {
      assert.ok(fieldIds.has('diagnosis'));
      assert.ok(fieldIds.has('x') && fieldIds.has('y') && fieldIds.has('z'));
      completeErrorFamilies += 1;
    }

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      if (doc.type === 'systemsWorkspace') {
        matrixTechnologyInstances += 1;
        assert.equal(question.mode, 'matrix3');
        assert.equal(question.requireTechnology, true);
        assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible matrix3 question`);

        const publicPayload = buildPublicToolPayload(question);
        assert.equal(publicPayload.serverGradingVersion, 3);
        assert.equal(publicPayload.tool.mode, 'matrix3');
        assert.equal(publicPayload.tool.requireTechnology, true);
        const publicText = JSON.stringify(publicPayload.tool);
        assert.equal(publicText.includes('"solution"'), false);
        assert.equal(publicText.includes('"rref"'), false);

        const privateGrading = buildPrivateToolGrading(question);
        const serverSolution = privateGrading.definition.solution;
        const clientSolution = solve3x3System(question.matrix);
        assert.equal(serverSolution.type, 'one');
        assert.equal(clientSolution.type, 'one');
        assert.ok(Math.abs(serverSolution.x - clientSolution.x) < 1e-9);
        assert.ok(Math.abs(serverSolution.y - clientSolution.y) < 1e-9);
        assert.ok(Math.abs(serverSolution.z - clientSolution.z) < 1e-9);

        const correct = gradePathResponse({
          privateGrading,
          raw: {
            classification: 'one',
            x: serverSolution.x,
            y: serverSolution.y,
            z: serverSolution.z,
            technologyUsed: true,
          },
        });
        assert.equal(correct.rejected, false);
        assert.equal(correct.isCorrect, true, `${doc.id} failed secure matrix3 correct-answer self-acceptance`);

        const skippedTechnology = gradePathResponse({
          privateGrading,
          raw: {
            classification: 'one',
            x: serverSolution.x,
            y: serverSolution.y,
            z: serverSolution.z,
            technologyUsed: false,
          },
        });
        assert.equal(skippedTechnology.rejected, true, `${doc.id} allowed a matrix-technology problem to bypass the technology action`);
        continue;
      }

      assert.ok(question.responseFields?.length >= 5, `${doc.id} must collect method evidence and the complete x,y,z solution`);
      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(matrixTechnologyInstances >= 40, 'A2.3B must contain a real secure 3x3 matrix-technology family');
  assert.ok(substitutionEvidenceFamilies >= 1, 'A2.3B must explicitly solve a 3x3 system by substitution');
  assert.ok(gaussianEvidenceFamilies >= 3, 'A2.3B must repeatedly solve 3x3 systems through Gaussian elimination evidence');
  assert.ok(completeErrorFamilies >= 1, 'A2.3B error analysis must repair the row operation and finish the full 3x3 solve');
  assert.ok((methods.get('matrixTechnology') || 0) >= 1);
  assert.ok((methods.get('substitution') || 0) >= 1);
  assert.ok((methods.get('gaussianElimination') || 0) >= 3);
  assert.ok(representations.size >= 5, 'A2.3B method coverage must transfer across symbolic, table, context, and error-analysis representations');
});

test('A2.3C algebraically solves linear-quadratic systems through complete ordered pairs', async () => {
  const entry = payload('A2.3C');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /algebraic-linear-quadratic-system-solving/);

  const methods = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let completePairFamilies = 0;
  let factoringFamilies = 0;
  let quadraticFormulaFamilies = 0;
  let noRealFamilies = 0;
  let tangentFamilies = 0;
  let errorFamilies = 0;

  for (const doc of entry.documents) {
    methods.add(doc.solutionMethod);
    taskTypes.add(doc.taskType);

    const fields = doc.responseFields || [];
    const fieldIds = new Set(fields.map((field) => String(field.id)));
    assert.ok(fieldIds.has('reduced'), `${doc.id} must collect the reduced quadratic equation`);

    const pairFields = fields.filter((field) => field.inputProfile === 'orderedPair');
    if (pairFields.length) completePairFamilies += 1;
    if (doc.solutionMethod === 'factoring') factoringFamilies += 1;
    if (doc.solutionMethod === 'quadraticFormula') quadraticFormulaFamilies += 1;
    if (fieldIds.has('conclusion') && stringValues(doc).join(' ').includes('No real')) noRealFamilies += 1;
    if (fieldIds.has('factor') && pairFields.length === 1) tangentFamilies += 1;
    if (doc.taskType === 'errorAnalysis' && pairFields.length === 2) errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const generatedFields = question.responseFields || [];
      assert.ok(generatedFields.some((field) => field.id === 'reduced'));

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(completePairFamilies >= 4, 'A2.3C must usually finish the system with complete ordered-pair solutions');
  assert.ok(factoringFamilies >= 3, 'A2.3C must repeatedly solve by algebraic factoring/repeated-root reasoning');
  assert.ok(quadraticFormulaFamilies >= 1, 'A2.3C must include an exact quadratic-formula solve');
  assert.ok(noRealFamilies >= 1, 'A2.3C must include a zero-real-solution system');
  assert.ok(tangentFamilies >= 1, 'A2.3C must include a one-solution/tangent system');
  assert.ok(errorFamilies >= 1, 'A2.3C error analysis must repair the algebra and finish both ordered pairs');
  assert.ok(methods.has('factoring'));
  assert.ok(methods.has('quadraticFormula'));
  assert.ok(methods.has('discriminant'));
  assert.ok(taskTypes.has('procedural'));
  assert.ok(taskTypes.has('interpretation'));
  assert.ok(taskTypes.has('errorAnalysis'));

  const twoPointFamily = entry.documents.find((doc) => doc.id.includes('factor-two-intersections'));
  assert.equal(
    (twoPointFamily.responseFields || []).filter((field) => field.inputProfile === 'orderedPair').length,
    2,
    'The legacy x-only failure must not return: a two-intersection system needs both complete ordered pairs',
  );
});

test('A2.3D judges proposed linear-quadratic solutions from concrete algebraic and contextual evidence', async () => {
  const entry = payload('A2.3D');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /evidence-based-reasonableness/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let keepFamilies = 0;
  let rejectFamilies = 0;
  let contextRestrictionFamilies = 0;
  let approximateFamilies = 0;
  let errorFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);
    const text = stringValues(doc).join(' ');

    assert.ok((doc.responseFields || []).length >= 3, `${doc.id} must collect evidence plus a reasonableness decision`);
    assert.equal((doc.responseFields || []).some((field) => field.id === 'reduced'), false, `${doc.id} drifted back into A2.3C full-system solving`);
    assert.ok(
      (doc.responseFields || []).some((field) => /output|residual/.test(String(field.id))),
      `${doc.id} must make the student perform a concrete candidate check`,
    );

    const decisionText = stringValues((doc.responseFields || []).filter((field) => /decision|context/.test(String(field.id)))).join(' ');
    if (/Keep it|reasonable approximation/i.test(decisionText)) keepFamilies += 1;
    if (/Reject/i.test(decisionText)) rejectFamilies += 1;
    if (/time|domain|context/i.test(text) && /negative|x\\ge 0/.test(text)) contextRestrictionFamilies += 1;
    if (/residual of at most 0\.05|tolerance/i.test(text)) approximateFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);

      if (doc.id.includes('rounded-residual-tolerance')) {
        const residual = Number(question.responseFields.find((field) => field.id === 'quad-residual')?.expected);
        assert.ok(residual > 0 && residual <= 0.05, `rounded candidate residual ${residual} is outside the promised tolerance`);
      }
      if (doc.id.includes('table-invalid') || doc.id.includes('error-perform')) {
        const residual = Number(question.responseFields.find((field) => field.id === 'quad-residual')?.expected);
        assert.ok(residual > 0, `${doc.id} generated an allegedly invalid candidate with zero quadratic residual`);
      }
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(keepFamilies >= 2, 'A2.3D must include reasonable exact/numerical candidates');
  assert.ok(rejectFamilies >= 3, 'A2.3D must repeatedly reject candidates for concrete reasons');
  assert.ok(contextRestrictionFamilies >= 1, 'A2.3D must distinguish algebraic validity from contextual reasonableness');
  assert.ok(approximateFamilies >= 1, 'A2.3D must include tolerance-aware numerical reasonableness');
  assert.ok(errorFamilies >= 1, 'A2.3D must perform the missing check in a genuine error-analysis family');
  assert.ok(representations.size >= 5, 'A2.3D reasonableness must transfer across symbolic, table, context, numerical, and verbal evidence');
  assert.ok(taskTypes.has('interpretation'));
  assert.ok(taskTypes.has('application'));
  assert.ok(taskTypes.has('errorAnalysis'));
});

test('A2.3E requires students to formulate complete systems of linear inequalities', async () => {
  const entry = payload('A2.3E');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /student-authored-systems-of-linear-inequalities/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let threePlusConstraintFamilies = 0;
  let coupledConstraintFamilies = 0;
  let strictBoundaryFamilies = 0;
  let nonnegativeFamilies = 0;
  let errorRepairFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);
    const fields = doc.responseFields || [];
    const inequalityFields = fields.filter((field) => field.inputProfile === 'equation');
    const authoredText = stringValues(doc).join(' ');

    assert.ok(inequalityFields.length >= 2, `${doc.id} must make the student write a system of at least two inequalities`);
    if (inequalityFields.length >= 3) threePlusConstraintFamilies += 1;
    if (inequalityFields.some((field) => {
      const expected = String(field.expected || '').replace(/\\/g, '');
      return expected.includes('x') && expected.includes('y');
    })) coupledConstraintFamilies += 1;
    if (/strict|excluded|dashed/.test(authoredText.toLowerCase()) && /y</.test(authoredText.replace(/\\/g, ''))) strictBoundaryFamilies += 1;
    if (/x>=0|y>=0|nonnegative|nonnegativity/.test(authoredText.replace(/\\/g, ''))) nonnegativeFamilies += 1;
    if (doc.taskType === 'errorAnalysis' && inequalityFields.length >= 3) errorRepairFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const generatedInequalities = (question.responseFields || []).filter((field) => field.inputProfile === 'equation');
      assert.ok(generatedInequalities.length >= 2);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(threePlusConstraintFamilies >= 4, 'A2.3E should usually formulate more than the bare minimum of two constraints');
  assert.ok(coupledConstraintFamilies >= 2, 'A2.3E must include coupled x/y resource constraints, not only independent bounds');
  assert.ok(strictBoundaryFamilies >= 2, 'A2.3E must repeatedly distinguish strict from inclusive boundaries');
  assert.ok(nonnegativeFamilies >= 2, 'A2.3E must include nonnegativity when quantities require it');
  assert.ok(errorRepairFamilies >= 1, 'A2.3E error analysis must write the entire corrected system');
  assert.ok(representations.size >= 4, 'A2.3E formulation must transfer across context, table, region description, and verbal error analysis');
  assert.ok(taskTypes.has('modeling'));
  assert.ok(taskTypes.has('representationTranslation'));
  assert.ok(taskTypes.has('errorAnalysis'));
});

const correctInequalityConstruction = (question) => ({
  construction: (question.inequalities || []).map((inequality) => {
    const m = Number(inequality.m);
    const b = Number(inequality.b);
    return {
      points: [
        { x: 0, y: b },
        { x: 1, y: m + b },
      ],
      boundaryStyle: String(inequality.relation).includes('=') ? 'solid' : 'dashed',
      shade: String(inequality.relation).includes('>') ? 'above' : 'below',
    };
  }),
});

test('A2.3F securely constructs and solves two- and three-inequality regions', async () => {
  const entry = payload('A2.3F');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /secure-construction-of-two-and-three-inequality-solution-regions/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let threeConstraintFamilies = 0;
  let strictFamilies = 0;
  let inclusiveFamilies = 0;
  let mixedFamilies = 0;
  let contextFamilies = 0;
  let errorRepairFamilies = 0;
  let noSolutionFamilies = 0;
  let wrongWorkRejected = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);

    assert.equal(doc.type, 'systemsWorkspace');
    assert.equal(doc.mode, 'inequalities');
    assert.equal(doc.interaction, 'construct');
    assert.deepEqual(doc.ask, ['construction']);
    assert.ok((doc.inequalities || []).length >= 2, `${doc.id} must solve a system of at least two inequalities`);

    if ((doc.inequalities || []).length >= 3) threeConstraintFamilies += 1;
    const relations = (doc.inequalities || []).map((ineq) => String(ineq.relation));
    const hasStrict = relations.some((relation) => !relation.includes('='));
    const hasInclusive = relations.some((relation) => relation.includes('='));
    if (hasStrict) strictFamilies += 1;
    if (hasInclusive) inclusiveFamilies += 1;
    if (hasStrict && hasInclusive) mixedFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorRepairFamilies += 1;
    const expectsNoSolution = doc.id.includes('no-solution');
    if (expectsNoSolution) noSolutionFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledOne = false;
    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;

      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible inequality construction`);

      const publicPayload = buildPublicToolPayload(question);
      assert.equal(publicPayload.pathToolId, 'systemsWorkspace');
      assert.equal(publicPayload.serverGradingVersion, 3);
      assert.equal(publicPayload.tool.mode, 'inequalities');
      assert.equal(publicPayload.tool.interaction, 'construct');
      assert.deepEqual(publicPayload.tool.ask, ['construction']);
      assert.equal(publicPayload.tool.inequalities.length, question.inequalities.length);

      const publicText = JSON.stringify(publicPayload.tool);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"answer"'), false);
      assert.equal(publicText.includes('"solution"'), false);

      const privateGrading = buildPrivateToolGrading(question);
      const raw = correctInequalityConstruction(question);
      const grading = gradePathResponse({ privateGrading, raw });
      assert.equal(grading.rejected, false, `${doc.id} rejected correctly-shaped graph construction`);
      assert.equal(
        grading.isCorrect,
        true,
        `${doc.id} failed secure correct-construction self-acceptance: ${JSON.stringify(grading.parts)}`,
      );
      assert.equal(
        grading.parts.length,
        question.inequalities.length * 3,
        `${doc.id} must grade boundary location, boundary style, and shade for every inequality`,
      );

      if (expectsNoSolution) {
        const polygon = feasibleRegionPolygon(question.inequalities, question.graph || {});
        assert.equal(polygon.length, 0, `${doc.id} promised no common region but generated a feasible polygon`);
      }

      if (!spoiledOne) {
        const wrong = structuredClone(raw);
        wrong.construction[0].shade = wrong.construction[0].shade === 'above' ? 'below' : 'above';
        const wrongResult = gradePathResponse({ privateGrading, raw: wrong });
        assert.equal(wrongResult.rejected, false);
        assert.equal(wrongResult.isCorrect, false, `${doc.id} accepted a graph with the first half-plane shaded the wrong way`);
        wrongWorkRejected += 1;
        spoiledOne = true;
      }
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(threeConstraintFamilies >= 3, 'A2.3F must make “two or more” real with repeated three-inequality systems');
  assert.ok(strictFamilies >= 3, 'A2.3F must repeatedly solve systems with excluded boundaries');
  assert.ok(inclusiveFamilies >= 4, 'A2.3F must repeatedly solve systems with included boundaries');
  assert.ok(mixedFamilies >= 3, 'A2.3F must repeatedly distinguish mixed solid/dashed boundary systems');
  assert.ok(contextFamilies >= 1, 'A2.3F must transfer inequality-system solving into a context');
  assert.ok(noSolutionFamilies >= 1, 'A2.3F must include a correctly constructed system with no common solution region');
  assert.ok(errorRepairFamilies >= 1, 'A2.3F error analysis must repair the graph by constructing the actual intersection');
  assert.equal(wrongWorkRejected, entry.documents.length);
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
  assert.ok(taskTypes.has('representationTranslation'));
  assert.ok(taskTypes.has('application'));
  assert.ok(taskTypes.has('errorAnalysis'));

  const workspaceSource = readFileSync('src/tools/systemsWorkspace/SystemsWorkspace.jsx', 'utf8');
  assert.match(workspaceSource, /INEQUALITY_COLORS/);
  assert.match(workspaceSource, /INEQUALITY_COLORS\[index % INEQUALITY_COLORS\.length\]/);
});

test('A2.3G determines possible solutions and requires a feasible candidate across full inequality systems', async () => {
  const entry = payload('A2.3G');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /secure-feasible-point-determination/);

  let generatedCount = 0;
  let threeConstraintFamilies = 0;
  let feasibleMarkedFamilies = 0;
  let infeasibleMarkedFamilies = 0;
  let strictBoundaryRejectionFamilies = 0;
  let inclusiveBoundaryAcceptanceFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let spoiledVerdictsRejected = 0;
  let spoiledCandidatesRejected = 0;
  const representations = new Set();

  const pointSatisfiesSystem = (question, point) => (
    (question.inequalities || []).every((ineq) => satisfiesLinearInequality(ineq, point.x, point.y))
  );

  const findFeasibleCandidate = (question) => {
    const graph = question.graph || {};
    const xMin = Math.ceil(Number(graph.xMin ?? -10));
    const xMax = Math.floor(Number(graph.xMax ?? 10));
    const yMin = Math.ceil(Number(graph.yMin ?? -10));
    const yMax = Math.floor(Number(graph.yMax ?? 10));
    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        if (pointSatisfiesSystem(question, { x, y })) return { x, y };
      }
    }
    return null;
  };

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    assert.equal(doc.type, 'systemsWorkspace');
    assert.equal(doc.mode, 'inequalities');
    assert.notEqual(doc.interaction, 'construct', `${doc.id} drifted back into A2.3F region construction`);
    assert.deepEqual(doc.ask, ['testPoint', 'candidate']);
    assert.ok((doc.inequalities || []).length >= 2);
    assert.ok(doc.testPoint, `${doc.id} must provide a marked point to judge`);

    if ((doc.inequalities || []).length >= 3) threeConstraintFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let familyMarkedVerdict = null;
    let familyStrictBoundaryCase = false;
    let familyInclusiveBoundaryCase = false;
    let spoiledVerdictChecked = false;
    let spoiledCandidateChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible candidate-analysis question`);

      const expectedMarked = pointSatisfiesSystem(question, question.testPoint);
      if (familyMarkedVerdict === null) familyMarkedVerdict = expectedMarked;
      assert.equal(expectedMarked, familyMarkedVerdict, `${doc.id} changed its intended marked-point verdict across generated instances`);

      const candidate = findFeasibleCandidate(question);
      assert.ok(candidate, `${doc.id} generated a system with no visible feasible candidate even though A2.3G requires one`);

      const publicPayload = buildPublicToolPayload(question);
      assert.equal(publicPayload.pathToolId, 'systemsWorkspace');
      assert.equal(publicPayload.serverGradingVersion, 3);
      assert.equal(publicPayload.tool.mode, 'inequalities');
      assert.deepEqual(publicPayload.tool.ask, ['testPoint', 'candidate']);
      assert.deepEqual(publicPayload.tool.testPoint, {
        x: Number(question.testPoint.x),
        y: Number(question.testPoint.y),
      });
      assert.equal(JSON.stringify(publicPayload.tool).includes('expectedTestPoint'), false);

      const privateGrading = buildPrivateToolGrading(question);
      const correctRaw = {
        testChoice: expectedMarked ? 'yes' : 'no',
        candidate,
      };
      const correct = gradePathResponse({ privateGrading, raw: correctRaw });
      assert.equal(correct.rejected, false);
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed secure possible-solution self-acceptance: ${JSON.stringify(correct.parts)}`,
      );
      assert.equal(correct.parts.find((part) => part.id === 'test-point')?.isCorrect, true);
      assert.equal(correct.parts.find((part) => part.id === 'candidate-point')?.isCorrect, true);

      if (!spoiledVerdictChecked) {
        const wrongVerdict = gradePathResponse({
          privateGrading,
          raw: { ...correctRaw, testChoice: expectedMarked ? 'no' : 'yes' },
        });
        assert.equal(wrongVerdict.rejected, false);
        assert.equal(wrongVerdict.isCorrect, false, `${doc.id} accepted the opposite marked-point verdict`);
        spoiledVerdictsRejected += 1;
        spoiledVerdictChecked = true;
      }

      if (!spoiledCandidateChecked) {
        const wrongCandidate = gradePathResponse({
          privateGrading,
          raw: { ...correctRaw, candidate: { x: 0, y: 999 } },
        });
        assert.equal(wrongCandidate.rejected, false);
        assert.equal(wrongCandidate.isCorrect, false, `${doc.id} accepted a clearly infeasible candidate`);
        assert.equal(wrongCandidate.parts.find((part) => part.id === 'candidate-point')?.isCorrect, false);
        spoiledCandidatesRejected += 1;
        spoiledCandidateChecked = true;
      }

      const relations = question.inequalities || [];
      const onBoundary = relations.find((ineq) => (
        Math.abs(Number(question.testPoint.y) - (Number(ineq.m) * Number(question.testPoint.x) + Number(ineq.b))) <= 1e-9
      ));
      if (onBoundary && !String(onBoundary.relation).includes('=') && expectedMarked === false) familyStrictBoundaryCase = true;
      if (onBoundary && String(onBoundary.relation).includes('=') && expectedMarked === true) familyInclusiveBoundaryCase = true;
    }

    if (familyMarkedVerdict) feasibleMarkedFamilies += 1;
    else infeasibleMarkedFamilies += 1;
    if (familyStrictBoundaryCase) strictBoundaryRejectionFamilies += 1;
    if (familyInclusiveBoundaryCase) inclusiveBoundaryAcceptanceFamilies += 1;
  }

  assert.ok(generatedCount >= 200);
  assert.ok(threeConstraintFamilies >= 2, 'A2.3G must repeatedly determine possible solutions against three simultaneous inequalities');
  assert.ok(feasibleMarkedFamilies >= 2, 'A2.3G must include marked points that really are possible solutions');
  assert.ok(infeasibleMarkedFamilies >= 2, 'A2.3G must include marked points that fail the system');
  assert.ok(strictBoundaryRejectionFamilies >= 1, 'A2.3G must reject a point lying on an excluded boundary');
  assert.ok(inclusiveBoundaryAcceptanceFamilies >= 1, 'A2.3G must accept a point lying on an included boundary when all other constraints hold');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(spoiledVerdictsRejected, entry.documents.length);
  assert.equal(spoiledCandidatesRejected, entry.documents.length);
  assert.ok(representations.size >= 4);
});

test('A2.4A requires a complete quadratic authored from exactly three specified points', async () => {
  const entry = payload('A2.4A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /student-authored-quadratic-functions-from-exactly-three-specified-points/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let noZeroXFamilies = 0;
  let coefficientSetupFamilies = 0;
  let errorRepairFamilies = 0;

  const rowCells = (row) => (Array.isArray(row) ? row : (Array.isArray(row?.cells) ? row.cells : []));
  const sourcePoints = (question) => {
    if (question.stimulus?.table?.rows?.length) {
      return question.stimulus.table.rows.map((row) => {
        const cells = rowCells(row);
        return { x:Number(cells[0]), y:Number(cells[1]) };
      });
    }
    if (question.stimulus?.orderedPairs?.length) {
      return question.stimulus.orderedPairs.map((pair) => (
        Array.isArray(pair)
          ? { x:Number(pair[0]), y:Number(pair[1]) }
          : { x:Number(pair.x), y:Number(pair.y) }
      ));
    }
    if (question.stimulus?.graph?.points?.length) {
      return question.stimulus.graph.points.map((point) => ({ x:Number(point.x), y:Number(point.y) }));
    }
    return [];
  };

  const evaluateQuadraticAnswerAt = (equation, x) => {
    const sides = splitEquationSides(equation);
    assert.ok(sides, `cannot split generated quadratic answer: ${equation}`);
    const poly = parsePolynomial(sides.right);
    assert.ok(poly, `cannot parse generated quadratic answer: ${equation}`);
    return [...poly.entries()].reduce((sum, [key, coefficient]) => {
      if (key === '') return sum + coefficient;
      if (key === 'x') return sum + coefficient * x;
      if (key === 'x^2') return sum + coefficient * x * x;
      assert.fail(`unexpected monomial ${key} in A2.4A standard-form key ${equation}`);
    }, 0);
  };

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);

    const authoredPoints = sourcePoints(doc);
    assert.equal(authoredPoints.length, 3, `${doc.id} must visibly provide exactly three specified points`);
    assert.equal(
      JSON.stringify({ prompt:doc.prompt, stimulus:doc.stimulus }).includes('{{a}}'),
      false,
      `${doc.id} leaks the generated leading coefficient into the given information`,
    );

    const finalField = (doc.responseFields || []).find((field) => field.id === 'quadratic');
    assert.ok(finalField, `${doc.id} must require the complete quadratic function`);
    assert.equal(finalField.inputProfile, 'equation');

    if (authoredPoints.every((point) => Number(point.x) !== 0)) noZeroXFamilies += 1;
    const setupFields = (doc.responseFields || []).filter((field) => (
      field.inputProfile === 'equation' && field.id !== 'quadratic'
    ));
    if (setupFields.length >= 3) coefficientSetupFamilies += 1;
    if (doc.taskType === 'errorAnalysis' && setupFields.length >= 3) errorRepairFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const points = sourcePoints(question);
      assert.equal(points.length, 3, `${doc.id} lost one of its three source points after generation`);
      assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
      assert.equal(new Set(points.map((point) => point.x)).size, 3, `${doc.id} must use three distinct x-values`);

      const coefficientSolution = solve3x3System({
        rows: points.map((point) => [point.x * point.x, point.x, 1, point.y]),
      });
      assert.equal(
        coefficientSolution.type,
        'one',
        `${doc.id} generated three points that do not determine a unique quadratic`,
      );

      const quadraticKey = question.responseFields?.find((field) => field.id === 'quadratic')?.expected;
      assert.ok(quadraticKey);
      const independentlySolved = `y=${coefficientSolution.x}x^2+(${coefficientSolution.y})x+(${coefficientSolution.z})`;
      assert.equal(
        sameValue(quadraticKey, independentlySolved),
        true,
        `${doc.id} private key disagrees with the independently solved three-point quadratic: ${quadraticKey} vs ${independentlySolved}`,
      );
      points.forEach((point) => {
        assert.ok(
          Math.abs(evaluateQuadraticAnswerAt(quadraticKey, point.x) - point.y) <= 1e-8,
          `${doc.id} generated a quadratic key that misses source point (${point.x}, ${point.y}): ${quadraticKey}`,
        );
      });

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
      assert.equal(sourcePoints(publicQuestion).length, 3, `${doc.id} public payload does not render all three specified points`);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(noZeroXFamilies >= 2, 'A2.4A must repeatedly prevent the shortcut of always reading c from an x=0 point');
  assert.ok(coefficientSetupFamilies >= 2, 'A2.4A must include repeated three-equation coefficient setup, not only final-answer boxes');
  assert.ok(errorRepairFamilies >= 1, 'A2.4A error analysis must repair the coefficient system and finish the quadratic');
  assert.ok(representations.has('table'));
  assert.ok(representations.has('orderedPairs'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
  assert.ok(taskTypes.has('procedural'));
  assert.ok(taskTypes.has('reverseReasoning'));
  assert.ok(taskTypes.has('representationTranslation'));
  assert.ok(taskTypes.has('modeling'));
  assert.ok(taskTypes.has('errorAnalysis'));
});

test('A2.4B writes complete parabola equations from defining attributes in all four orientations', async () => {
  const entry = payload('A2.4B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(
    entry.certificationStatus,
    /student-authored-parabola-equations-from-vertex-focus-directrix-axis-and-opening/,
  );

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  for (const required of ['vertex', 'focus', 'directrix', 'axis', 'opens upward', 'opens downward', 'opens right', 'opens left']) {
    assert.ok(authoredText.includes(required), `A2.4B package is missing required attribute/orientation coverage: ${required}`);
  }

  const representations = new Set();
  let generatedCount = 0;
  let verticalFamilies = 0;
  let horizontalFamilies = 0;
  let inferredVertexFamilies = 0;
  let errorRepairFamilies = 0;
  let reversedSideAccepted = 0;
  let wrongEquationRejected = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const equationField = (doc.responseFields || []).find((field) => field.id === 'equation');
    assert.ok(equationField, `${doc.id} must require the complete parabola equation`);
    assert.equal(equationField.inputProfile, 'equation');
    assert.equal(
      equationField.equivalence,
      'polynomialRelation',
      `${doc.id} must opt in to relation-aware grading rather than padding answer variants`,
    );

    const expectedTemplate = String(equationField.expected || '');
    if (/^\(x-/.test(expectedTemplate)) verticalFamilies += 1;
    if (/^\(y-/.test(expectedTemplate)) horizontalFamilies += 1;
    if ((doc.responseFields || []).some((field) => field.id === 'vertex')) inferredVertexFamilies += 1;
    if (doc.taskType === 'errorAnalysis') {
      errorRepairFamilies += 1;
      assert.ok((doc.responseFields || []).some((field) => field.id === 'diagnosis'));
    }

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let reversedChecked = false;
    let wrongChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const generatedEquation = (question.responseFields || []).find((field) => field.id === 'equation');
      assert.ok(generatedEquation?.expected);
      assert.equal(generatedEquation.equivalence, 'polynomialRelation');

      const grading = privateGradingDefinition(question);
      const exactResponses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const exact = await gradeResponse(grading, { responses: exactResponses });
      assert.equal(
        exact.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(exact.fieldResults)}`,
      );

      if (!reversedChecked) {
        const sides = splitEquationSides(generatedEquation.expected);
        assert.ok(sides);
        const reversed = `${sides.right}=${sides.left}`;
        assert.equal(
          samePolynomialEquationRelation(generatedEquation.expected, reversed),
          true,
          `${doc.id} relation comparator failed a side reversal`,
        );
        const reversedResponses = { ...exactResponses, equation:reversed };
        const reversedResult = await gradeResponse(grading, { responses: reversedResponses });
        assert.equal(
          reversedResult.isCorrect,
          true,
          `${doc.id} secure field grader rejected an algebraically identical reversed parabola equation`,
        );
        reversedSideAccepted += 1;
        reversedChecked = true;
      }

      if (!wrongChecked) {
        const wrongResponses = { ...exactResponses, equation:'x=y' };
        const wrong = await gradeResponse(grading, { responses: wrongResponses });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a different relation as the parabola`);
        wrongEquationRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(verticalFamilies >= 2, 'A2.4B must repeatedly write vertical parabola equations');
  assert.ok(horizontalFamilies >= 2, 'A2.4B must repeatedly write horizontal parabola equations');
  assert.ok(inferredVertexFamilies >= 1, 'A2.4B must infer a vertex from focus/directrix geometry in at least one family');
  assert.ok(errorRepairFamilies >= 1, 'A2.4B must repair an attribute/orientation error and still write the equation');
  assert.equal(reversedSideAccepted, entry.documents.length);
  assert.equal(wrongEquationRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
});

test('A2.4C determines the full effect of square-root transformations including horizontal scaling and reflection', async () => {
  const entry = payload('A2.4C');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /full-square-root-transform-effects/);

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  for (const required of [
    'vertical scale',
    'horizontal scale',
    'horizontal reflection',
    'x-axis',
    'endpoint',
    'horizontal stretch',
    'horizontal compression',
  ]) {
    assert.ok(authoredText.includes(required), `A2.4C package is missing required effect coverage: ${required}`);
  }

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let combinedEffectFamilies = 0;
  let horizontalReflectionFamilies = 0;
  let horizontalStretchFamilies = 0;
  let horizontalCompressionFamilies = 0;
  let verticalCompressionFamilies = 0;
  let verticalStretchFamilies = 0;
  let reverseFamilies = 0;
  let errorFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);
    const text = stringValues(doc).join(' ').toLowerCase();

    if ((doc.responseFields || []).length >= 5) combinedEffectFamilies += 1;
    if (/horizontal reflection|ray extends left|inside negative/.test(text)) horizontalReflectionFamilies += 1;
    if (/horizontal stretch/.test(text)) horizontalStretchFamilies += 1;
    if (/horizontal compression/.test(text)) horizontalCompressionFamilies += 1;
    if (/vertical compression/.test(text)) verticalCompressionFamilies += 1;
    if (/vertical stretch|vertical scale factor.*2|vertical scale factor.*3/.test(text)) verticalStretchFamilies += 1;
    if (doc.taskType === 'reverseReasoning') reverseFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);

      if (doc.id.includes('point-map-horizontal-reflection')) {
        const fields = Object.fromEntries(question.responseFields.map((field) => [field.id, field.expected]));
        const p0 = String(fields.p0).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const p4 = String(fields.p4).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const p16 = String(fields.p16).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        assert.ok(p0 && p4 && p16);
        const [x0,y0] = [Number(p0[1]),Number(p0[2])];
        const [x4,y4] = [Number(p4[1]),Number(p4[2])];
        const [x16,y16] = [Number(p16[1]),Number(p16[2])];
        assert.equal(x4, x0 - 1);
        assert.equal(x16, x0 - 4);
        assert.equal(y4, y0 + 1);
        assert.equal(y16, y0 + 2);
        assert.equal(Number(fields['vertical-scale']), 0.5);
        assert.equal(Number(fields['horizontal-scale']), 0.25);
      }

      if (doc.id.includes('graph-horizontal-stretch')) {
        const transformed = question.stimulus?.graph?.curves?.find((curve) => curve.label === 'Transformed')?.points || [];
        assert.equal(transformed.length, 3);
        const [endpoint, oneUnitParent, fourUnitParent] = transformed;
        assert.equal(Number(oneUnitParent.x) - Number(endpoint.x), 4);
        assert.equal(Number(fourUnitParent.x) - Number(endpoint.x), 16);
        assert.equal(Number(oneUnitParent.y) - Number(endpoint.y), 2);
        assert.equal(Number(fourUnitParent.y) - Number(endpoint.y), 4);
      }

      if (doc.id.includes('reverse-build-from-effects')) {
        const equation = question.responseFields.find((field) => field.id === 'equation')?.expected;
        assert.ok(equation);
        assert.match(String(equation), /-0\.5/);
        assert.match(String(equation), /-4/);
        assert.equal(question.responseFields.find((field) => field.id === 'ray')?.expected, 'left');
        assert.equal(question.responseFields.find((field) => field.id === 'range-direction')?.expected, 'down');
      }
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(combinedEffectFamilies >= 3, 'A2.4C must repeatedly determine several transformation effects together');
  assert.ok(horizontalReflectionFamilies >= 3, 'A2.4C must repeatedly include the missing horizontal reflection effect');
  assert.ok(horizontalStretchFamilies >= 1, 'A2.4C must include a true horizontal stretch');
  assert.ok(horizontalCompressionFamilies >= 3, 'A2.4C must repeatedly distinguish horizontal compression from using |b| directly');
  assert.ok(verticalCompressionFamilies >= 2, 'A2.4C must include vertical compression as well as stretch');
  assert.ok(verticalStretchFamilies >= 2, 'A2.4C must include vertical stretch');
  assert.ok(reverseFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
  assert.ok(taskTypes.has('interpretation'));
  assert.ok(taskTypes.has('representationTranslation'));
  assert.ok(taskTypes.has('reverseReasoning'));
  assert.ok(taskTypes.has('errorAnalysis'));
});

test('A2.4D transforms standard form to vertex form before identifying attributes', async () => {
  const entry = payload('A2.4D');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /standard-to-vertex-completing-square-with-attribute-identification/);

  const representations = new Set();
  const taskTypes = new Set();
  let generatedCount = 0;
  let completingSquareFamilies = 0;
  let positiveLeadingFamilies = 0;
  let negativeLeadingFamilies = 0;
  let nonUnitLeadingFamilies = 0;
  let errorRepairFamilies = 0;
  let standardFormRejectedAsVertexForm = 0;

  const evaluatePolynomial = (poly, variable, value) => [...poly.entries()].reduce((sum, [key, coefficient]) => {
    if (key === '') return sum + coefficient;
    if (key === variable) return sum + coefficient * value;
    if (key === `${variable}^2`) return sum + coefficient * value * value;
    assert.fail(`Unexpected monomial ${key} while checking A2.4D`);
  }, 0);

  const sourceStandardEquation = (question) => {
    const explicit = question.responseFields?.find((field) => field.id === 'standard-form')?.expected;
    if (explicit) return String(explicit);

    const mathChunks = [...String(question.prompt || '').matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
    return mathChunks.find((chunk) => /^(?:f\(x\)|H\(t\))=/.test(chunk)) || null;
  };

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    taskTypes.add(doc.taskType);

    assert.match(doc.prompt, /standard form|standard-form/i, `${doc.id} must begin from standard form`);
    const vertexFormField = (doc.responseFields || []).find((field) => field.id === 'vertex-form');
    assert.ok(vertexFormField, `${doc.id} must require the complete vertex form`);
    assert.equal(vertexFormField.inputProfile, 'equation');

    const evidenceFields = new Set((doc.responseFields || []).map((field) => String(field.id)));
    if (evidenceFields.has('square-add') || evidenceFields.has('factored')) completingSquareFamilies += 1;
    if (doc.taskType === 'errorAnalysis') {
      errorRepairFamilies += 1;
      assert.ok(evidenceFields.has('diagnosis'));
      assert.ok(evidenceFields.has('factored'));
      assert.ok(evidenceFields.has('square-add'));
      assert.ok(evidenceFields.has('vertex'));
    }

    const aValues = doc.generator?.parameters?.a?.values || [];
    if (aValues.some((value) => Number(value) > 0)) positiveLeadingFamilies += 1;
    if (aValues.some((value) => Number(value) < 0)) negativeLeadingFamilies += 1;
    if (aValues.some((value) => Math.abs(Number(value)) > 1)) nonUnitLeadingFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let wrongFormChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const standardEquation = sourceStandardEquation(question);
      assert.ok(standardEquation, `${doc.id} generated no visible/graded standard-form source equation`);
      const vertexEquation = question.responseFields?.find((field) => field.id === 'vertex-form')?.expected;
      assert.ok(vertexEquation, `${doc.id} generated no private vertex-form key`);

      const standardSides = splitEquationSides(standardEquation);
      const vertexSides = splitEquationSides(vertexEquation);
      assert.ok(standardSides && vertexSides);

      const variable = standardEquation.startsWith('H(t)') ? 't' : 'x';
      const standardPoly = parsePolynomial(standardSides.right);
      const vertexPoly = parsePolynomial(vertexSides.right);
      assert.ok(standardPoly && vertexPoly);
      for (const probe of [-2, 0, 3]) {
        assert.ok(
          Math.abs(evaluatePolynomial(standardPoly, variable, probe) - evaluatePolynomial(vertexPoly, variable, probe)) <= 1e-8,
          `${doc.id} vertex form is not equivalent to its generated standard form at ${variable}=${probe}`,
        );
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      if (!wrongFormChecked) {
        const wrongForm = await gradeResponse(grading, {
          responses: { ...responses, 'vertex-form':standardEquation },
        });
        assert.equal(
          wrongForm.isCorrect,
          false,
          `${doc.id} accepted the original standard form in a field explicitly requiring vertex form`,
        );
        standardFormRejectedAsVertexForm += 1;
        wrongFormChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(completingSquareFamilies >= 3, 'A2.4D must repeatedly collect completing-square evidence, not just final vertex form');
  assert.ok(positiveLeadingFamilies >= 2, 'A2.4D must include upward-opening/minimum cases');
  assert.ok(negativeLeadingFamilies >= 2, 'A2.4D must include downward-opening/maximum cases');
  assert.ok(nonUnitLeadingFamilies >= 4, 'A2.4D must repeatedly require factoring a before completing the square');
  assert.ok(errorRepairFamilies >= 1, 'A2.4D must repair a completing-square error and still finish the attributes');
  assert.equal(standardFormRejectedAsVertexForm, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
  assert.ok(taskTypes.has('procedural'));
  assert.ok(taskTypes.has('interpretation'));
  assert.ok(taskTypes.has('representationTranslation'));
  assert.ok(taskTypes.has('application'));
  assert.ok(taskTypes.has('errorAnalysis'));
});

test('A2.4E formulates quadratic and square-root equations with authentic regression technology', async () => {
  const entry = payload('A2.4E');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /authentic-technology-quadratic-and-square-root-regression/);

  let generatedCount = 0;
  let quadraticFamilies = 0;
  let squareRootFamilies = 0;
  let interpolationFamilies = 0;
  let extrapolationFamilies = 0;
  let errorRepairFamilies = 0;
  let wrongCoefficientRejected = 0;
  let wrongTargetRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    assert.equal(doc.type, 'dataModelingLab', `${doc.id} must use authentic Data Modeling Lab technology`);
    assert.ok(
      ['quadraticFitPrediction', 'squareRootFitPrediction'].includes(doc.mode),
      `${doc.id} drifted outside the two model families named by A2.4E`,
    );
    assert.ok((doc.points || []).length >= 5, `${doc.id} must use an overdetermined table, not a minimum-point hand fit`);
    assert.notEqual(doc.predictionX, undefined, `${doc.id} must use its formulated equation for a fixed prediction`);

    if (doc.mode === 'quadraticFitPrediction') quadraticFamilies += 1;
    if (doc.mode === 'squareRootFitPrediction') squareRootFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorRepairFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let familyPredictionType = null;
    let spoiledCoefficient = false;
    let spoiledTarget = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);
      assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible technology question`);

      const publicPayload = buildPublicToolPayload(question);
      assert.equal(publicPayload.pathToolId, 'dataModelingLab');
      assert.equal(publicPayload.tool.mode, question.mode);
      assert.equal(publicPayload.tool.points.length, question.points.length);
      assert.equal(publicPayload.tool.predictionX, Number(question.predictionX));
      const publicText = JSON.stringify(publicPayload.tool);
      assert.equal(publicText.includes('expectedModel'), false);
      assert.equal(publicText.includes('quadraticATolerance'), false);
      assert.equal(publicText.includes('squareRootATolerance'), false);

      const privateGrading = buildPrivateToolGrading(question);
      const expected = privateGrading.definition.expectedModel;
      assert.ok(expected?.model, `${doc.id} server produced no fitted model`);

      const independent = question.mode === 'quadraticFitPrediction'
        ? pathQuadraticRegression(publicPayload.tool.points)
        : pathSquareRootRegression(publicPayload.tool.points);
      assert.ok(independent, `${doc.id} independent regression failed`);

      if (question.mode === 'quadraticFitPrediction') {
        assert.equal(expected.id, 'quadratic');
        assert.ok(Math.abs(expected.model.a - independent.a) <= 1e-9);
        assert.ok(Math.abs(expected.model.b - independent.b) <= 1e-9);
        assert.ok(Math.abs(expected.model.c - independent.c) <= 1e-9);
      } else {
        assert.equal(expected.id, 'squareRoot');
        assert.ok(Math.abs(expected.model.a - independent.a) <= 1e-9);
        assert.ok(Math.abs(expected.model.h - independent.h) <= 1e-9);
        assert.ok(Math.abs(expected.model.k - independent.k) <= 1e-9);
        const xs = publicPayload.tool.points.map(([x]) => Number(x));
        assert.equal(independent.h, Math.min(...xs), `${doc.id} square-root fit did not anchor h at the table endpoint`);
      }

      const predictionX = Number(question.predictionX);
      const predictionY = expected.id === 'quadratic'
        ? expected.model.a * predictionX ** 2 + expected.model.b * predictionX + expected.model.c
        : expected.model.a * Math.sqrt(predictionX - expected.model.h) + expected.model.k;
      const predictionType = pathPredictionKind(publicPayload.tool.points, predictionX);
      if (familyPredictionType === null) familyPredictionType = predictionType;
      assert.equal(predictionType, familyPredictionType, `${doc.id} changes interpolation/extrapolation intent across generated instances`);

      const fitRaw = expected.id === 'quadratic'
        ? { a:expected.model.a, b:expected.model.b, c:expected.model.c }
        : { a:expected.model.a, h:expected.model.h, k:expected.model.k };
      const correctRaw = {
        ...fitRaw,
        predictionX,
        predictionY,
        predictionType,
      };
      const correct = gradePathResponse({ privateGrading, raw: correctRaw });
      assert.equal(correct.rejected, false);
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed secure fitted-model self-acceptance: ${JSON.stringify(correct.parts)}`,
      );
      assert.equal(correct.parts.fit, true);
      assert.equal(correct.parts.prediction, true);

      if (!spoiledCoefficient) {
        const wrongFit = { ...correctRaw, a:Number(correctRaw.a) + 2 };
        const wrong = gradePathResponse({ privateGrading, raw: wrongFit });
        assert.equal(wrong.rejected, false);
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a materially wrong fitted coefficient`);
        assert.equal(wrong.parts.fit, false);
        wrongCoefficientRejected += 1;
        spoiledCoefficient = true;
      }

      if (!spoiledTarget) {
        const wrongX = predictionX + 1;
        const wrongTarget = gradePathResponse({
          privateGrading,
          raw: { ...correctRaw, predictionX:wrongX },
        });
        assert.equal(wrongTarget.rejected, false);
        assert.equal(wrongTarget.isCorrect, false, `${doc.id} allowed the fixed prediction target to be replaced`);
        assert.equal(wrongTarget.parts.prediction, false);
        wrongTargetRejected += 1;
        spoiledTarget = true;
      }
    }

    if (familyPredictionType === 'interpolation') interpolationFamilies += 1;
    if (familyPredictionType === 'extrapolation') extrapolationFamilies += 1;
  }

  assert.ok(generatedCount >= 200);
  assert.ok(quadraticFamilies >= 2, 'A2.4E must repeatedly formulate quadratic equations with technology');
  assert.ok(squareRootFamilies >= 2, 'A2.4E must repeatedly formulate square-root equations with technology');
  assert.ok(interpolationFamilies >= 2, 'A2.4E must use fitted equations for interpolation as well as extrapolation');
  assert.ok(extrapolationFamilies >= 2, 'A2.4E must use fitted equations for extrapolation as well as interpolation');
  assert.ok(errorRepairFamilies >= 1, 'A2.4E must repair an incorrect technology model entry using the actual regression fit');
  assert.equal(wrongCoefficientRejected, entry.documents.length);
  assert.equal(wrongTargetRejected, entry.documents.length);
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});

test('A2.4F solves quadratic and square-root equations through complete multi-step work', async () => {
  const entry = payload('A2.4F');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-quadratic-and-square-root-solving/);

  let generatedCount = 0;
  let quadraticFamilies = 0;
  let squareRootFamilies = 0;
  let factoringFamilies = 0;
  let irrationalFormulaFamilies = 0;
  let multistepRadicalFamilies = 0;
  let contextFamilies = 0;
  let errorRepairFamilies = 0;
  let wrongFinalRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const id = String(doc.id);
    if (id.includes('quadratic') || id.includes('factoring')) quadraticFamilies += 1;
    if (id.includes('square-root') || id.includes('radical') || id.includes('isolation-error')) squareRootFamilies += 1;
    if (id.includes('factoring')) factoringFamilies += 1;
    if (id.includes('exact-quadratic-formula')) irrationalFormulaFamilies += 1;
    if ((doc.responseFields || []).some((field) => field.id === 'isolated')
        && (doc.responseFields || []).some((field) => field.id === 'squared')) multistepRadicalFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorRepairFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const result = await gradeResponse(grading, { responses });
      assert.equal(
        result.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(result.fieldResults)}`,
      );

      if (id.includes('exact-quadratic-formula')) {
        const discriminant = Number(question.responseFields.find((field) => field.id === 'discriminant')?.expected);
        assert.ok(Number.isFinite(discriminant) && discriminant > 0);
        assert.ok(
          Math.abs(Math.sqrt(discriminant) - Math.round(Math.sqrt(discriminant))) > 1e-9,
          `${doc.id} generated a perfect-square discriminant and no longer requires an irrational exact solve`,
        );
        const minus = String(question.responseFields.find((field) => field.id === 'minus-root')?.expected || '');
        const plus = String(question.responseFields.find((field) => field.id === 'plus-root')?.expected || '');
        assert.match(minus, /sqrt\(/);
        assert.match(plus, /sqrt\(/);
        assert.equal(question.responseFields.find((field) => field.id === 'minus-root')?.inputProfile, 'expression');
        assert.equal(question.responseFields.find((field) => field.id === 'plus-root')?.inputProfile, 'expression');
      }

      if (id.includes('factoring')) {
        assert.ok(question.responseFields.some((field) => field.id === 'factored'));
        assert.ok(question.responseFields.some((field) => field.id === 'r1'));
        assert.ok(question.responseFields.some((field) => field.id === 'r2'));
      }

      if (id.includes('square-root') || id.includes('radical') || id.includes('isolation-error')) {
        assert.ok(
          question.responseFields.some((field) => ['solution', 'time'].includes(field.id)),
          `${doc.id} must finish the square-root solve, not stop after a method step`,
        );
      }

      if (!spoiledChecked) {
        const finalField = grading.fields.find((field) => ['r2', 'plus-root', 'solution', 'time'].includes(field.id));
        assert.ok(finalField, `${doc.id} has no final solution field to spoil`);
        const expected = finalField.expected ?? finalField.accepted?.[0];
        const wrongValue = Number.isFinite(Number(expected)) ? Number(expected) + 1 : '0';
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [finalField.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a wrong final solution`);
        wrongFinalRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(quadraticFamilies >= 2, 'A2.4F must repeatedly solve quadratic equations');
  assert.ok(squareRootFamilies >= 3, 'A2.4F must repeatedly solve square-root equations');
  assert.ok(factoringFamilies >= 1, 'A2.4F must include a complete factoring solve');
  assert.ok(irrationalFormulaFamilies >= 1, 'A2.4F must include a genuine non-perfect-square quadratic-formula solve');
  assert.ok(multistepRadicalFamilies >= 3, 'A2.4F square-root work must repeatedly isolate, square, and finish the linear solve');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorRepairFamilies >= 1, 'A2.4F must repair a solving error and still finish the equation');
  assert.equal(wrongFinalRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.4G identifies extraneous square-root candidates by checking the original equation', async () => {
  const entry = payload('A2.4G');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /original-equation-substitution-identifies-extraneous/);

  let generatedCount = 0;
  let bothCandidateEvidenceFamilies = 0;
  let oneExtraneousFamilies = 0;
  let noExtraneousFamilies = 0;
  let domainInsufficientFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let spoiledOutcomeRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const ids = new Set((doc.responseFields || []).map((field) => String(field.id)));
    const lhsFields = [...ids].filter((id) => /lhs/.test(id));
    const rhsFields = [...ids].filter((id) => /rhs/.test(id));
    assert.ok(lhsFields.length >= 1 && rhsFields.length >= 1, `${doc.id} must collect original-equation substitution evidence`);

    if (lhsFields.length >= 2 && rhsFields.length >= 2) bothCandidateEvidenceFamilies += 1;
    if (doc.id.includes('no-extraneous')) noExtraneousFamilies += 1;
    if (doc.id.includes('domain-is-not-enough')) domainInsufficientFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let familyHasExtraneous = false;
    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      const mismatchPairs = [];
      for (const prefix of ['u', 'v', 'k', 'kp1']) {
        const lhs = Number(fields[`${prefix}-lhs`]?.expected);
        const rhs = Number(fields[`${prefix}-rhs`]?.expected);
        if (Number.isFinite(lhs) && Number.isFinite(rhs)) {
          mismatchPairs.push({ prefix, matches:Math.abs(lhs-rhs)<=1e-9, lhs, rhs });
        }
      }

      if (question.id?.includes('no-extraneous') || doc.id.includes('no-extraneous')) {
        assert.ok(mismatchPairs.length >= 2);
        assert.ok(mismatchPairs.every((pair) => pair.matches), `${doc.id} promised no extraneous candidates but a substitution check fails`);
        assert.equal(fields['extraneous-count']?.expected, 'zero');
      } else if (doc.id.includes('domain-is-not-enough')) {
        assert.equal(fields.domain?.expected, 'yes');
        assert.ok(Number(fields['u-lhs']?.expected) >= 0);
        assert.ok(Number(fields['u-rhs']?.expected) < 0);
        assert.notEqual(Number(fields['u-lhs']?.expected), Number(fields['u-rhs']?.expected));
        familyHasExtraneous = true;
      } else {
        const u = mismatchPairs.find((pair) => pair.prefix === 'u');
        const v = mismatchPairs.find((pair) => pair.prefix === 'v');
        assert.ok(u && v, `${doc.id} must check both generated candidates`);
        assert.equal(u.matches, false, `${doc.id} smaller candidate unexpectedly satisfies the original equation`);
        assert.equal(v.matches, true, `${doc.id} valid candidate unexpectedly fails the original equation`);
        familyHasExtraneous = true;
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        let outcomeField = grading.fields.find((field) => field.id === 'extraneous');
        let wrongValue;
        if (outcomeField) {
          wrongValue = Number(outcomeField.expected) + 1;
        } else if ((outcomeField = grading.fields.find((field) => field.id === 'extraneous-count'))) {
          wrongValue = 'one';
        } else if ((outcomeField = grading.fields.find((field) => field.id === 'valid-time'))) {
          wrongValue = Number(outcomeField.expected) + 1;
        } else {
          outcomeField = grading.fields.find((field) => /verdict/.test(field.id));
          wrongValue = String(outcomeField?.expected) === 'valid' ? 'extraneous' : 'valid';
        }
        assert.ok(outcomeField, `${doc.id} has no extraneous/valid outcome field to spoil`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [outcomeField.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect extraneous-solution conclusion`);
        spoiledOutcomeRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }

    if (familyHasExtraneous) oneExtraneousFamilies += 1;
  }

  assert.ok(generatedCount >= 200);
  assert.ok(bothCandidateEvidenceFamilies >= 4, 'A2.4G must repeatedly substitute every squared-equation candidate into the original equation');
  assert.ok(oneExtraneousFamilies >= 4, 'A2.4G must repeatedly identify an actual extraneous candidate');
  assert.ok(noExtraneousFamilies >= 1, 'A2.4G must include a case where squaring creates no extraneous solution');
  assert.ok(domainInsufficientFamilies >= 1, 'A2.4G must prove that radical-domain membership alone is not enough');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorFamilies >= 1, 'A2.4G must repair the claim that every squared-equation root is valid');
  assert.equal(spoiledOutcomeRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.4H solves quadratic inequalities through complete sign-set reasoning', async () => {
  const entry = payload('A2.4H');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-quadratic-inequality-solution-sets/);

  let generatedCount = 0;
  let standardFormFamilies = 0;
  let negativeLeadingFamilies = 0;
  let strictFamilies = 0;
  let inclusiveFamilies = 0;
  let numberLineFamilies = 0;
  let noRealZeroFamilies = 0;
  let errorFamilies = 0;
  let spoiledRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ');
    if (/x\^2|x\^2/.test(text) && !String(doc.id).includes('number-line')) standardFormFamilies += 1;
    if (/downward|negative leading|-\{\{a\}\}/i.test(text)) negativeLeadingFamilies += 1;
    if (/>0|<0/.test(String(doc.prompt))) strictFamilies += 1;
    if (/>=0|<=0|\\ge0|\\le0|≤|≥/.test(String(doc.prompt))) inclusiveFamilies += 1;
    if (doc.type === 'intervalNumberLine') numberLineFamilies += 1;
    if (doc.id.includes('no-real-zeros')) noRealZeroFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      if (doc.type === 'intervalNumberLine') {
        assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible number-line question`);
        const publicPayload = buildPublicToolPayload(question);
        assert.equal(publicPayload.pathToolId, 'intervalNumberLine');
        assert.deepEqual(publicPayload.tool.ask, ['graph', 'interval']);
        assert.equal(JSON.stringify(publicPayload.tool).includes('expectedIntervals'), false);

        const privateGrading = buildPrivateToolGrading(question);
        const intervals = privateGrading.definition.intervals;
        assert.ok(intervals.length >= 2, `${doc.id} must construct both exterior solution rays`);
        const notation = `(-inf,${intervals[0].max}]U[${intervals[1].min},inf)`;
        const correct = gradePathResponse({
          privateGrading,
          raw: { intervals, notation },
        });
        assert.equal(correct.rejected, false);
        assert.equal(correct.isCorrect, true, `${doc.id} rejected its correct number-line solution`);

        if (!spoiledChecked) {
          const wrongIntervals = intervals.map((interval,index) => (
            index === 0 ? { ...interval, maxClosed:false } : interval
          ));
          const wrong = gradePathResponse({
            privateGrading,
            raw: { intervals:wrongIntervals, notation },
          });
          assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect endpoint style`);
          spoiledRejected += 1;
          spoiledChecked = true;
        }
        continue;
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (doc.id.includes('standard-form-critical-zeros')) {
        const zero1 = Number(question.responseFields.find((field) => field.id === 'zero1')?.expected);
        const zero2 = Number(question.responseFields.find((field) => field.id === 'zero2')?.expected);
        assert.ok(Number.isFinite(zero1) && Number.isFinite(zero2) && zero1 < zero2);
        assert.equal(question.responseFields.find((field) => field.id === 'interval')?.expected, `[${zero1},${zero2}]`);
      }

      if (doc.id.includes('no-real-zeros')) {
        const discriminant = Number(question.responseFields.find((field) => field.id === 'discriminant')?.expected);
        assert.ok(discriminant < 0, `${doc.id} promised no real zeros but generated discriminant ${discriminant}`);
        assert.equal(question.responseFields.find((field) => field.id === 'real-zeros')?.expected, 'zero');
        assert.equal(question.responseFields.find((field) => field.id === 'interval')?.expected, '(-inf,inf)');
      }

      if (!spoiledChecked) {
        const intervalField = grading.fields.find((field) => field.id === 'interval');
        assert.ok(intervalField, `${doc.id} must finish with a complete interval solution set`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, interval:'(0,0)' },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a wrong quadratic-inequality solution set`);
        spoiledRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(standardFormFamilies >= 1, 'A2.4H must solve at least one standard-form quadratic inequality');
  assert.ok(negativeLeadingFamilies >= 1, 'A2.4H must include a negative-leading-coefficient sign pattern');
  assert.ok(strictFamilies >= 2, 'A2.4H must include strict inequalities');
  assert.ok(inclusiveFamilies >= 2, 'A2.4H must include inclusive inequalities');
  assert.ok(numberLineFamilies >= 1, 'A2.4H must preserve an authentic number-line construction solve');
  assert.ok(noRealZeroFamilies >= 1, 'A2.4H must include a no-real-zero all-or-none sign case');
  assert.ok(errorFamilies >= 1, 'A2.4H must repair endpoint/sign reasoning and still give the full solution set');
  assert.equal(spoiledRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('numberLine'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('verbal'));
});

test('A2.5A determines transformed exponential and logarithmic graph attributes with scale, reflection, and translation', async () => {
  const entry = payload('A2.5A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /exp-log-key-attribute-effects/);

  let generatedCount = 0;
  let exponentialFamilies = 0;
  let logarithmicFamilies = 0;
  let graphConstructionFamilies = 0;
  let reflectedFamilies = 0;
  let compressionFamilies = 0;
  let errorFamilies = 0;
  let wrongOutcomeRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ').toLowerCase();
    if (/exponential/.test(text)) exponentialFamilies += 1;
    if (/logarithm/.test(text)) logarithmicFamilies += 1;
    if (doc.type === 'functionInvestigation') graphConstructionFamilies += 1;
    if (/reflect/.test(text)) reflectedFamilies += 1;
    if (/compression/.test(text)) compressionFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      if (doc.type === 'functionInvestigation') {
        assert.equal(isPathEligible(question), true, `${doc.id} produced a Path-ineligible graph investigation`);

        const spec = question.functionSpec;
        assert.ok(['exponential','logarithmic'].includes(spec.type));
        const features = investigationFeatures(spec);
        const behavior = behaviorForSpec(spec);

        if (spec.type === 'exponential') {
          assert.equal(features.horizontalAsymptotes[0], Number(spec.k));
          assert.equal(features.domainCode, 'allReal');
          assert.equal(features.rangeCode, Number(spec.a) > 0 ? 'yGtK' : 'yLtK');
        } else {
          assert.equal(features.verticalAsymptotes[0], Number(spec.h));
          assert.equal(features.domainCode, 'xGtH');
          assert.equal(features.rangeCode, 'allReal');
        }

        const privateGrading = buildPrivateToolGrading(question);
        const placements = Object.fromEntries(
          (question.pointTasks || []).map((task) => [task.id, task.expected.map(Number)]),
        );
        const answers = {};
        for (const part of privateGrading.definition.analysis) {
          answers[part.id] = String(part.accepted?.[0] ?? part.expected?.[0] ?? '');
        }
        const correct = gradePathResponse({
          privateGrading,
          raw: { placements, answers },
        });
        assert.equal(correct.rejected, false);
        assert.equal(
          correct.isCorrect,
          true,
          `${doc.id} failed secure transformed-graph self-acceptance: ${JSON.stringify(correct.parts)}`,
        );

        for (const task of question.pointTasks || []) {
          const x = Number(task.expected[0]);
          const y = Number(task.expected[1]);
          assert.ok(Number.isFinite(x) && Number.isFinite(y));
          assert.ok(
            Math.abs(evaluateFunctionSpec(spec, x) - y) <= 1e-6,
            `${doc.id} authored point ${task.id} is not on the generated transformed function`,
          );
        }

        const behaviorPart = privateGrading.definition.analysis.find((part) => part.id === 'behavior');
        if (behaviorPart) {
          assert.ok(
            [...behaviorPart.expected, ...behaviorPart.accepted]
              .map(String)
              .some((value) => value.toLowerCase().includes(behavior)),
            `${doc.id} authored behavior answer disagrees with the function specification`,
          );
        }

        if (!spoiledChecked) {
          const spoiledPlacements = structuredClone(placements);
          const firstId = Object.keys(spoiledPlacements)[0];
          spoiledPlacements[firstId] = [spoiledPlacements[firstId][0], spoiledPlacements[firstId][1] + 3];
          const wrong = gradePathResponse({
            privateGrading,
            raw: { placements:spoiledPlacements, answers },
          });
          assert.equal(wrong.isCorrect, false, `${doc.id} accepted a point off the transformed graph`);
          wrongOutcomeRejected += 1;
          spoiledChecked = true;
        }

        const publicPayload = buildPublicToolPayload(question);
        const publicText = JSON.stringify(publicPayload.tool);
        assert.equal(publicText.includes('"expected"'), false);
        assert.equal(publicText.includes('"acceptedAnswers"'), false);
        continue;
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (doc.id.includes('exponential-compression')) {
        assert.equal(Number(question.responseFields.find((field) => field.id === 'vertical-scale')?.expected), 0.5);
        assert.equal(question.responseFields.find((field) => field.id === 'vertical-effect')?.expected, 'compression');
        const k = Number(question.responseFields.find((field) => field.id === 'vertical-shift')?.expected);
        assert.equal(question.responseFields.find((field) => field.id === 'asymptote')?.expected, `y=${k}`);
      }

      if (doc.id.includes('logarithmic-reflection')) {
        assert.equal(question.responseFields.find((field) => field.id === 'reflection')?.expected, 'xaxis');
        assert.equal(question.responseFields.find((field) => field.id === 'behavior')?.expected, 'decreasing');
        assert.equal(question.responseFields.find((field) => field.id === 'range')?.expected, '(-inf,inf)');
      }

      if (!spoiledChecked) {
        let target = grading.fields.find((field) => ['behavior','reflection','vertical-effect'].includes(field.id));
        let wrongValue = 'wrong';
        if (target?.id === 'behavior') wrongValue = String(target.expected) === 'decreasing' ? 'increasing' : 'decreasing';
        if (target?.id === 'reflection') wrongValue = 'none';
        if (target?.id === 'vertical-effect') wrongValue = 'stretch';
        if (!target) target = grading.fields[0];
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [target.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect transformation attribute`);
        wrongOutcomeRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(exponentialFamilies >= 2, 'A2.5A must repeatedly cover exponential transformations');
  assert.ok(logarithmicFamilies >= 3, 'A2.5A must repeatedly cover logarithmic transformations');
  assert.ok(graphConstructionFamilies >= 2, 'A2.5A must construct at least one exponential and one logarithmic transformed graph');
  assert.ok(reflectedFamilies >= 3, 'A2.5A must repeatedly determine vertical-reflection effects');
  assert.ok(compressionFamilies >= 1, 'A2.5A must include vertical compression as well as stretch');
  assert.ok(errorFamilies >= 1, 'A2.5A must repair transformed-attribute reasoning and finish the corrected attribute set');
  assert.equal(wrongOutcomeRejected, entry.documents.length);
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('verbal'));
});

test('A2.5B formulates explicit, recursive, and logarithmic real-world models', async () => {
  const entry = payload('A2.5B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /explicit-recursive-exponential-and-authentic-logarithmic-models/);

  let generatedCount = 0;
  let growthFamilies = 0;
  let decayFamilies = 0;
  let recursiveFamilies = 0;
  let tableFamilies = 0;
  let logarithmicFamilies = 0;
  let errorFamilies = 0;
  let wrongModelRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ').toLowerCase();
    if (/growth/.test(text)) growthFamilies += 1;
    if (/decay|loses|retained/.test(text)) decayFamilies += 1;
    if ((doc.responseFields || []).some((field) => field.id === 'recursive')) recursiveFamilies += 1;
    if (doc.representation === 'table') tableFamilies += 1;
    if (/logarithmic model|log-scale|log base 10|log_10/.test(text)) logarithmicFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    if (doc.id.includes('growth') || doc.id.includes('decay') || doc.id.includes('table-infer')) {
      const ids = new Set((doc.responseFields || []).map((field) => field.id));
      assert.ok(ids.has('explicit'), `${doc.id} must require an explicit exponential equation`);
      assert.ok(ids.has('initial'), `${doc.id} must require a recursive initial condition`);
      assert.ok(ids.has('recursive'), `${doc.id} must require a recursive multiplier equation`);
    }

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('growth-explicit')) {
        const factor = Number(fields.factor?.expected);
        assert.ok(factor > 1, `${doc.id} growth factor must be greater than 1`);
        assert.ok(String(fields.explicit?.expected).includes(String(factor)));
        assert.ok(String(fields.recursive?.expected).includes(String(factor)));
      }

      if (doc.id.includes('decay-explicit')) {
        const factor = Number(fields.factor?.expected);
        assert.ok(factor > 0 && factor < 1, `${doc.id} decay factor must lie between 0 and 1`);
        assert.ok(String(fields.explicit?.expected).includes(String(factor)));
        assert.ok(String(fields.recursive?.expected).includes(String(factor)));
      }

      if (doc.id.includes('table-infer-ratio')) {
        const rows = question.stimulus?.table?.rows || [];
        assert.equal(rows.length, 4);
        const values = rows.map((row) => Number(row[1]));
        const ratio = Number(fields.ratio?.expected);
        assert.ok(Number.isFinite(ratio) && ratio > 1);
        assert.ok(values.slice(1).every((value,index) => Math.abs(value / values[index] - ratio) <= 1e-9));
        assert.ok(String(fields.explicit?.expected).includes(`(${ratio})^n`));
        assert.ok(String(fields.recursive?.expected).includes(String(ratio)));
      }

      if (doc.id.includes('logarithmic-ratio-scale')) {
        assert.match(String(fields.ratio?.expected), /^I\//);
        assert.match(String(fields.model?.expected), /^L=10log_10\(I\//);
        assert.equal(fields.domain?.expected, 'positive');
      }

      if (doc.id.includes('growth-factor-error')) {
        const factor = Number(fields.factor?.expected);
        assert.ok(factor > 1);
        assert.equal(fields.diagnosis?.expected, 'whole');
        assert.ok(String(fields.explicit?.expected).includes(String(factor)));
        assert.ok(String(fields.recursive?.expected).includes(String(factor)));
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const modelField = grading.fields.find((field) => ['explicit','model','recursive'].includes(field.id));
        assert.ok(modelField, `${doc.id} must contain a student-authored model field`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [modelField.id]:'y=x+1' },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a nonmatching model equation`);
        wrongModelRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(growthFamilies >= 2, 'A2.5B must repeatedly formulate exponential growth models');
  assert.ok(decayFamilies >= 1, 'A2.5B must formulate exponential decay models');
  assert.ok(recursiveFamilies >= 4, 'A2.5B must repeatedly formulate recursive exponential relationships');
  assert.ok(tableFamilies >= 1, 'A2.5B must infer an exponential ratio from tabular data before formulating the model');
  assert.ok(logarithmicFamilies >= 1, 'A2.5B must include authentic logarithmic real-world model formulation');
  assert.ok(errorFamilies >= 1, 'A2.5B must repair a faulty model and still write the corrected equations');
  assert.equal(wrongModelRejected, entry.documents.length);
  assert.ok(representations.has('context'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});

test('A2.5C rewrites exponential and logarithmic equations in both directions as written equations', async () => {
  const entry = payload('A2.5C');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /student-written-bidirectional-exponential-logarithmic-equation-rewrites/);

  let generatedCount = 0;
  let expToLogFamilies = 0;
  let logToExpFamilies = 0;
  let symbolicFamilies = 0;
  let commonNaturalFamilies = 0;
  let errorFamilies = 0;
  let wrongRewriteRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ');
    const equationFields = (doc.responseFields || []).filter((field) => field.inputProfile === 'equation');
    assert.ok(equationFields.length >= 1, `${doc.id} must require the student to WRITE an equivalent equation`);
    assert.equal((doc.responseFields || []).some((field) => field.id === 'answer' && field.inputProfile === 'choice'), false);

    const authoredRewriteKeys = (doc.responseFields || [])
      .filter((field) => field.inputProfile === 'equation')
      .map((field) => String(field.expected || ''));
    if (authoredRewriteKeys.some((value) => /log_|ln\(/.test(value))) expToLogFamilies += 1;
    if (authoredRewriteKeys.some((value) => /\^/.test(value))) logToExpFamilies += 1;
    if (doc.id.includes('symbolic-expression')) symbolicFamilies += 1;
    if (doc.id.includes('common-natural')) commonNaturalFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('numeric-exp-to-log')) {
        const match = String(fields.rewrite?.expected).match(/^log_(\d+)\((\d+)\)=(-?\d+)$/);
        assert.ok(match, `${doc.id} generated an unexpected logarithmic key: ${fields.rewrite?.expected}`);
        const [,base,arg,value] = match.map((item,index) => index === 0 ? item : Number(item));
        assert.equal(base ** value, arg);
      }

      if (doc.id.includes('numeric-log-to-exp')) {
        const match = String(fields.rewrite?.expected).match(/^(\d+)\^(-?\d+)=(\d+)$/);
        assert.ok(match, `${doc.id} generated an unexpected exponential key: ${fields.rewrite?.expected}`);
        const [,base,exp,result] = match.map((item,index) => index === 0 ? item : Number(item));
        assert.equal(base ** exp, result);
      }

      if (doc.id.includes('symbolic-expression')) {
        const rewrite = String(fields.rewrite?.expected);
        assert.match(rewrite, /^log_\d+\(y\)=x-/);
        assert.equal(/=x-/.test(rewrite), true, 'The entire exponent expression must stay together as the logarithm value');
      }

      if (doc.id.includes('common-natural')) {
        assert.match(String(fields.natural?.expected), /^ln\(/);
        assert.match(String(fields.common?.expected), /^10\^r=/);
      }

      if (doc.id.includes('role-error-repair')) {
        assert.equal(fields.diagnosis?.expected, 'base-argument');
        assert.match(String(fields['log-rewrite']?.expected), /^log_\d+\(/);
        assert.match(String(fields['exp-rewrite']?.expected), /^\d+\^/);
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const rewriteField = grading.fields.find((field) => /rewrite|natural|common/.test(field.id));
        assert.ok(rewriteField, `${doc.id} has no written rewrite field to spoil`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [rewriteField.id]:'x=y' },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a non-equivalent rewrite`);
        wrongRewriteRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(expToLogFamilies >= 3, 'A2.5C must repeatedly rewrite exponential form into logarithmic form');
  assert.ok(logToExpFamilies >= 3, 'A2.5C must repeatedly rewrite logarithmic form into exponential form');
  assert.ok(symbolicFamilies >= 1, 'A2.5C must transfer the role map to a symbolic exponent expression');
  assert.ok(commonNaturalFamilies >= 1, 'A2.5C must include common-log and natural-log notation');
  assert.ok(errorFamilies >= 1, 'A2.5C must repair a role-mapping error and write the corrected equation');
  assert.equal(wrongRewriteRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('verbal'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
});

test('A2.5D solves exponential and single-log equations through complete methods', async () => {
  const entry = payload('A2.5D');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-exponential-and-single-log-solving/);

  let generatedCount = 0;
  let exponentialFamilies = 0;
  let logFamilies = 0;
  let nonPowerFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let wrongFinalRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ').toLowerCase();
    if (/exponential|\^x|2\^x/.test(text)) exponentialFamilies += 1;
    if (/logarithm|\\log|common-log/.test(text)) logFamilies += 1;
    if (doc.id.includes('nonpower')) nonPowerFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('same-base')) {
        const eq = String(fields.exponents?.expected);
        const match = eq.match(/^x\+\((-?\d+)\)=(-?\d+)$/);
        assert.ok(match);
        const cValue = Number(match[1]);
        const nValue = Number(match[2]);
        assert.equal(Number(fields.solution?.expected), nValue - cValue);
      }

      if (doc.id.includes('nonpower')) {
        const ratio = Number(String(fields.isolated?.expected).split('=')[1]);
        assert.ok([3,5,6,7,10].includes(ratio));
        assert.notEqual(Math.log2(ratio), Math.round(Math.log2(ratio)), 'Nonpower family accidentally became a base-2 integer power');
        assert.equal(String(fields.exact?.expected), `ln(${ratio})/ln(2)`);
        assert.equal(fields.approx, undefined, 'Exact nonpower solve should not depend on unsupported generated log/round math');
      }

      if (doc.id.includes('common-log-affine')) {
        const expEq = String(fields.exponential?.expected);
        const compactExpEq = expEq.replace(/\s+/g, '');
        const match = compactExpEq.match(/^(-?\d+)x([+-]\d+)=(-?\d+)$/);
        assert.ok(match, `${doc.id} generated unexpected affine exponential form: ${expEq}`);
        const m = Number(match[1]);
        const c0 = Number(match[2]);
        const power = Number(match[3]);
        const x = Number(fields.solution?.expected);
        assert.equal(m*x + c0, power);
        assert.ok(power > 0);
      }

      if (doc.id.includes('context-noninteger-time')) {
        assert.equal(String(fields.isolated?.expected), '2^t=3');
        assert.equal(String(fields.exact?.expected), 'ln(3)/ln(2)');
        assert.ok(Math.abs(Number(fields.time?.expected) - Math.log(3)/Math.log(2)) <= 0.0015);
      }

      if (doc.id.includes('exponential-error-complete')) {
        assert.equal(fields.diagnosis?.expected, 'divide');
        const ratio = Number(String(fields.isolated?.expected).split('=')[1]);
        assert.equal(String(fields.exact?.expected), `ln(${ratio})/ln(2)`);
        assert.equal(fields.approx, undefined, 'Error-repair family should finish with the exact logarithmic solution');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const finalField = grading.fields.find((field) => ['solution','approx','time','exact'].includes(field.id));
        assert.ok(finalField, `${doc.id} must finish with a solved value`);
        const expected = finalField.expected ?? finalField.accepted?.[0];
        const wrongValue = Number.isFinite(Number(expected)) ? Number(expected) + 1 : '0';
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [finalField.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a wrong solved value`);
        wrongFinalRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(exponentialFamilies >= 4, 'A2.5D must repeatedly solve exponential equations');
  assert.ok(logFamilies >= 4, 'A2.5D must repeatedly use logarithmic solving/rewrite reasoning');
  assert.ok(nonPowerFamilies >= 1, 'A2.5D must include a genuinely non-power exponential target requiring logarithms');
  assert.ok(contextFamilies >= 1, 'A2.5D must interpret a solved exponent in context');
  assert.ok(errorFamilies >= 1, 'A2.5D must repair an isolation/log error and still finish x');
  assert.equal(wrongFinalRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.5E judges logarithmic candidates from original-equation and context evidence', async () => {
  const entry = payload('A2.5E');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /reasonableness-from-original-log-equation-domain-value-context-evidence/);

  let generatedCount = 0;
  let validFamilies = 0;
  let rejectedFamilies = 0;
  let domainInvalidFamilies = 0;
  let positiveButWrongFamilies = 0;
  let multiLogFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let wrongVerdictRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const ids = new Set((doc.responseFields || []).map((field) => String(field.id)));
    assert.ok(ids.has('verdict'), `${doc.id} must require an explicit reasonableness verdict`);
    assert.ok(
      ids.has('argument') || (ids.has('arg1') && ids.has('arg2')),
      `${doc.id} must collect original logarithm-argument evidence`,
    );
    if (doc.id.includes('domain-invalid')) domainInvalidFamilies += 1;
    if (doc.id.includes('positive-domain-but-wrong')) positiveButWrongFamilies += 1;
    if (doc.id.includes('two-log')) multiLogFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const expectedVerdict = (doc.responseFields || []).find((field) => field.id === 'verdict')?.expected;
    if (expectedVerdict === 'keep') validFamilies += 1;
    if (expectedVerdict === 'reject') rejectedFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('domain-invalid')) {
        assert.ok(Number(fields.argument?.expected) <= 0);
        assert.equal(fields.domain?.expected, 'no');
        assert.equal(fields.verdict?.expected, 'reject');
      }

      if (doc.id.includes('common-log-valid')) {
        const argument = Number(fields.argument?.expected);
        const logValue = Number(fields['log-value']?.expected);
        assert.ok(argument > 0);
        assert.ok([10,100,1000].includes(argument));
        assert.equal(Math.log10(argument), logValue);
        assert.equal(fields.verdict?.expected, 'keep');
      }

      if (doc.id.includes('positive-domain-but-wrong')) {
        const argument = Number(fields.argument?.expected);
        const lhs = Number(fields.lhs?.expected);
        const rhs = Number(fields.rhs?.expected);
        assert.ok(argument > 0);
        assert.equal(fields.domain?.expected, 'valid');
        assert.equal(lhs, Math.log2(argument));
        assert.equal(lhs, rhs + 1);
        assert.equal(fields.verdict?.expected, 'reject');
      }

      if (doc.id.includes('two-log')) {
        const arg1 = Number(fields.arg1?.expected);
        const arg2 = Number(fields.arg2?.expected);
        const log1 = Number(fields.log1?.expected);
        const log2 = Number(fields.log2?.expected);
        const lhs = Number(fields.lhs?.expected);
        assert.ok(arg1 > 0 && arg2 > 0);
        assert.equal(Math.log2(arg1), log1);
        assert.equal(Math.log2(arg2), log2);
        assert.equal(lhs, log1 + log2);
        assert.equal(fields.verdict?.expected, 'keep');
      }

      if (doc.id.includes('context-error')) {
        const argument = Number(fields.argument?.expected);
        const lhs = Number(fields.lhs?.expected);
        const promptMatch = String(question.prompt).match(/t=(-?\d+)/);
        assert.ok(promptMatch, `${doc.id} lost its proposed time candidate`);
        const candidate = Number(promptMatch[1]);
        assert.ok(argument > 0);
        assert.ok(candidate < 0);
        assert.equal(fields.algebra?.expected, 'valid');
        assert.equal(fields.context?.expected, 'invalid');
        assert.equal(fields.verdict?.expected, 'reject');
        assert.ok(Number.isFinite(lhs));
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const verdict = grading.fields.find((field) => field.id === 'verdict');
        assert.ok(verdict);
        const expected = String(verdict.expected ?? verdict.accepted?.[0]);
        const wrongValue = expected === 'keep' ? 'reject' : 'keep';
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, verdict:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect reasonableness verdict`);
        wrongVerdictRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(validFamilies >= 2, 'A2.5E must include reasonable candidates, not only rejection cases');
  assert.ok(rejectedFamilies >= 3, 'A2.5E must repeatedly reject candidates for concrete reasons');
  assert.ok(domainInvalidFamilies >= 1);
  assert.ok(positiveButWrongFamilies >= 1, 'A2.5E must prove that domain validity alone is insufficient');
  assert.ok(multiLogFamilies >= 1, 'A2.5E must check every argument in a multi-log original equation');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorFamilies >= 1, 'A2.5E must repair a reasonableness conclusion rather than recite a domain rule');
  assert.equal(wrongVerdictRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('context'));
});

test('A2.6A analyzes cubic and cube-root transformations through full a-b-h-k effects', async () => {
  const entry = payload('A2.6A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /full-cubic-cube-root-transform-analysis-a-b-h-k/);

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  for (const required of [
    'cubic',
    'cube-root',
    'vertical scale',
    'horizontal scale',
    'x-axis reflection',
    'horizontal reflection',
    'horizontal stretch',
    'horizontal compression',
  ]) {
    assert.ok(authoredText.includes(required), `A2.6A package is missing required breadth: ${required}`);
  }

  let generatedCount = 0;
  let cubicFamilies = 0;
  let cubeRootFamilies = 0;
  let negativeAFamilies = 0;
  let negativeBFamilies = 0;
  let horizontalStretchFamilies = 0;
  let horizontalCompressionFamilies = 0;
  let reverseFamilies = 0;
  let errorFamilies = 0;
  let wrongEffectRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const id = String(doc.id);
    const text = stringValues(doc).join(' ').toLowerCase();

    if (id.includes('cubic') || id.includes('two-negative')) cubicFamilies += 1;
    if (id.includes('cube-root') || id.includes('two-negative')) cubeRootFamilies += 1;
    if (/a=-|a<0|x-axis reflection/.test(text)) negativeAFamilies += 1;
    if (/b=-|b<0|negative inside|horizontal reflection/.test(text)) negativeBFamilies += 1;
    if (/horizontal stretch/.test(text)) horizontalStretchFamilies += 1;
    if (/horizontal compression|one fourth|1\/4/.test(text)) horizontalCompressionFamilies += 1;
    if (doc.taskType === 'reverseReasoning') reverseFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (id.includes('cubic-combined-symbolic')) {
        assert.ok([2,3].includes(Number(fields['vertical-scale']?.expected)));
        assert.ok([0.5,0.25].includes(Number(fields['horizontal-scale']?.expected)));
        assert.equal(fields['x-reflection']?.expected, 'yes');
        assert.equal(fields['horizontal-reflection']?.expected, 'no');
      }

      if (id.includes('cube-root-negative-b-point-map')) {
        const center = String(fields.center?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const leftImage = String(fields['left-parent-image']?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const rightImage = String(fields['right-parent-image']?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        assert.ok(center && leftImage && rightImage);
        const h = Number(center[1]);
        assert.equal(Number(leftImage[1]), h + 2);
        assert.equal(Number(rightImage[1]), h - 2);
        assert.equal(Number(fields['horizontal-scale']?.expected), 0.25);
        assert.equal(fields['horizontal-reflection']?.expected, 'yes');
      }

      if (id.includes('cubic-graph-horizontal-stretch')) {
        const center = String(fields.center?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const left = String(fields.left?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const right = String(fields.right?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        assert.ok(center && left && right);
        const [h,k] = [Number(center[1]),Number(center[2])];
        assert.equal(Number(left[1]), h - 2);
        assert.equal(Number(right[1]), h + 2);
        assert.equal(Number(left[2]), k - 2);
        assert.equal(Number(right[2]), k + 2);
        assert.equal(Number(fields['horizontal-scale']?.expected), 2);
        assert.equal(fields['horizontal-effect']?.expected, 'stretch');
      }

      if (id.includes('cube-root-reverse-parameters')) {
        assert.equal(Number(fields.a?.expected), -2);
        assert.equal(Number(fields.b?.expected), 0.5);
        assert.equal(fields.effects?.expected, 'correct');
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields['a-effect']?.expected, 'xaxis');
        assert.equal(fields['b-effect']?.expected, 'horizontal');
        assert.equal(Number(fields['vertical-scale']?.expected), 3);
        assert.equal(Number(fields['horizontal-scale']?.expected), 0.25);
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const field = grading.fields.find((item) => (
          ['horizontal-scale','horizontal-reflection','effects','b-effect','right'].includes(item.id)
        )) || grading.fields[0];
        assert.ok(field);
        const expected = field.expected ?? field.accepted?.[0];
        const wrongValue = Number.isFinite(Number(expected))
          ? Number(expected) + 1
          : (String(expected) === 'yes' ? 'no' : '__wrong__');
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [field.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect transformation effect`);
        wrongEffectRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(cubicFamilies >= 3, 'A2.6A must repeatedly analyze the cubic parent');
  assert.ok(cubeRootFamilies >= 3, 'A2.6A must repeatedly analyze the cube-root parent');
  assert.ok(negativeAFamilies >= 2, 'A2.6A must repeatedly analyze negative outside parameters');
  assert.ok(negativeBFamilies >= 2, 'A2.6A must repeatedly analyze negative inside parameters');
  assert.ok(horizontalStretchFamilies >= 2, 'A2.6A must include horizontal stretching');
  assert.ok(horizontalCompressionFamilies >= 2, 'A2.6A must include horizontal compression');
  assert.ok(reverseFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(wrongEffectRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});

test('A2.6B solves cube-root equations through complete isolate-cube-linear work', async () => {
  const entry = payload('A2.6B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-cube-root-solving-isolate-cube-linear-radicand/);

  let generatedCount = 0;
  let completeStepFamilies = 0;
  let linearRadicandFamilies = 0;
  let negativeRealInstances = 0;
  let nonintegerFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let wrongFinalRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const ids = new Set((doc.responseFields || []).map((field) => String(field.id)));
    if (ids.has('cubed') && (ids.has('solution') || ids.has('time'))) completeStepFamilies += 1;
    if (stringValues(doc).join(' ').includes('{{m}}')) linearRadicandFamilies += 1;
    if (doc.id.includes('noninteger-real')) nonintegerFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      const cubedText = String(fields.cubed?.expected || '');
      if (cubedText) {
        const rhs = Number(cubedText.split('=').pop());
        if (Number.isFinite(rhs) && rhs < 0) negativeRealInstances += 1;
      }

      if (doc.id.includes('basic-complete')) {
        assert.ok(fields.cubed);
        assert.ok(fields.solution);
      }

      if (doc.id.includes('scaled-linear-radicand')) {
        assert.ok(fields.isolated && fields.cubed && fields.solution);
        assert.match(String(fields.isolated.expected), /cbrt\(/);
        assert.match(String(fields.cubed.expected), /x/);
      }

      if (doc.id.includes('noninteger-real')) {
        const isolated = String(fields.isolated?.expected || '');
        const r = Number(isolated.split('=').pop());
        assert.ok(Number.isFinite(r));
        assert.ok(Math.abs(r - Math.round(r)) > 1e-9, `${doc.id} generated an integer cube-root value`);
        const rhs = Number(String(fields.cubed?.expected || '').split('=').pop());
        assert.ok(Math.abs(rhs - r ** 3) <= 1e-9);
        assert.ok(Number.isFinite(Number(fields.solution?.expected)));
      }

      if (doc.id.includes('context-modeled')) {
        assert.ok(fields.isolated && fields.cubed && fields.time);
        assert.ok(Number(fields.time.expected) >= 1);
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields.diagnosis?.expected, 'cube');
        assert.ok(fields.cubed && fields.solution);
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const finalField = grading.fields.find((field) => ['solution','time'].includes(field.id));
        assert.ok(finalField, `${doc.id} has no final solved value`);
        const expected = Number(finalField.expected ?? finalField.accepted?.[0]);
        assert.ok(Number.isFinite(expected));
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [finalField.id]:expected + 1 },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect final solution`);
        wrongFinalRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(completeStepFamilies >= 5, 'A2.6B every family must finish the cube-root solve');
  assert.ok(linearRadicandFamilies >= 4, 'A2.6B must repeatedly solve nontrivial linear radicands');
  assert.ok(negativeRealInstances >= 20, 'A2.6B must repeatedly include negative real cube-root values/radicands');
  assert.ok(nonintegerFamilies >= 1, 'A2.6B must include a noninteger real cube-root value');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorFamilies >= 1, 'A2.6B must repair squaring-vs-cubing and still finish x');
  assert.equal(wrongFinalRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.6C analyzes absolute-value transformations with full a-b-h-k reasoning and even-parent negative-b invariance', async () => {
  const entry = payload('A2.6C');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /full-absolute-value-transform-analysis-a-b-h-k/);

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  for (const required of [
    'horizontal scale',
    'vertical scale',
    'vertex',
    'negative b',
    'no distinct',
    'arm slope',
  ]) {
    assert.ok(authoredText.includes(required), `A2.6C package is missing required transformation reasoning: ${required}`);
  }

  let generatedCount = 0;
  let negativeAFamilies = 0;
  let negativeBFamilies = 0;
  let horizontalStretchFamilies = 0;
  let horizontalCompressionFamilies = 0;
  let reverseFamilies = 0;
  let errorFamilies = 0;
  let wrongEffectRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ').toLowerCase();
    if (/a<0|x-axis reflection|opens down|opening.*down/.test(text)) negativeAFamilies += 1;
    if (/negative b|b<0|-3\(x|-4\(x|b=-/.test(text)) negativeBFamilies += 1;
    if (/horizontal stretch/.test(text)) horizontalStretchFamilies += 1;
    if (/horizontal compression|horizontal scale.*0\.25|horizontal scale.*0\.333/.test(text)) horizontalCompressionFamilies += 1;
    if (doc.taskType === 'reverseReasoning') reverseFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('combined-effects')) {
        assert.ok([1.5,2,3].includes(Number(fields['vertical-scale']?.expected)));
        assert.ok([0.5,0.25].includes(Number(fields['horizontal-scale']?.expected)));
        assert.equal(fields['x-reflection']?.expected, 'yes');
        assert.equal(fields.opening?.expected, 'down');
      }

      if (doc.id.includes('negative-b-point-map')) {
        const left = String(fields.left?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const vertex = String(fields.vertex?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const right = String(fields.right?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        assert.ok(left && vertex && right);
        const h = Number(vertex[1]);
        assert.equal(Number(left[1]), h + 1);
        assert.equal(Number(right[1]), h - 1);
        assert.equal(Number(left[2]), Number(right[2]));
        assert.equal(Number(fields['horizontal-scale']?.expected), 0.25);
        assert.equal(fields['negative-b-effect']?.expected, 'same');
      }

      if (doc.id.includes('graph-horizontal-stretch')) {
        const points = question.stimulus?.graph?.points || [];
        assert.equal(points.length, 3);
        const [left,vertex,right] = points.map((point) => ({ x:Number(point.x), y:Number(point.y) }));
        assert.equal(vertex.x - left.x, 4);
        assert.equal(right.x - vertex.x, 4);
        assert.equal(left.y - vertex.y, 1);
        assert.equal(right.y - vertex.y, 1);
        assert.equal(Number(fields['horizontal-scale']?.expected), 2);
        assert.equal(Number(fields['vertical-scale']?.expected), 0.5);
        assert.equal(Number(fields['effective-slope']?.expected), 0.25);
      }

      if (doc.id.includes('reverse-sequence')) {
        assert.equal(Number(fields.a?.expected), -3);
        assert.equal(Number(fields.b?.expected), -2);
        assert.equal(Number(fields['effective-slope']?.expected), 6);
        assert.equal(fields['negative-b-effect']?.expected, 'none');
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields.reflection?.expected, 'correct');
        assert.ok(Math.abs(Number(fields['horizontal-scale']?.expected) - 1/3) <= 1e-9);
        assert.equal(Number(fields['vertical-scale']?.expected), 2);
        assert.equal(Number(fields['effective-slope']?.expected), 6);
        assert.equal(fields.opening?.expected, 'down');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const field = grading.fields.find((item) => (
          ['horizontal-scale','negative-b-effect','opening','reflection','effective-slope'].includes(item.id)
        )) || grading.fields[0];
        const expected = field.expected ?? field.accepted?.[0];
        const wrongValue = Number.isFinite(Number(expected))
          ? Number(expected) + 1
          : (String(expected) === 'down' ? 'up' : '__wrong__');
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [field.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect transformation effect`);
        wrongEffectRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(negativeAFamilies >= 2, 'A2.6C must repeatedly analyze negative outside parameters');
  assert.ok(negativeBFamilies >= 3, 'A2.6C must repeatedly analyze the special negative-inside absolute-value case');
  assert.ok(horizontalStretchFamilies >= 1);
  assert.ok(horizontalCompressionFamilies >= 2);
  assert.ok(reverseFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(wrongEffectRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});

test('A2.6D formulates absolute-value linear equations instead of selecting or solving them', async () => {
  const entry = payload('A2.6D');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /student-authored-absolute-value-linear-equations/);

  let generatedCount = 0;
  let linearInsideFamilies = 0;
  let contextFamilies = 0;
  let reverseFamilies = 0;
  let errorFamilies = 0;
  let equivalentReversalsAccepted = 0;
  let wrongModelsRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const equationFields = (doc.responseFields || []).filter((field) => field.id === 'equation');
    assert.equal(equationFields.length, 1, `${doc.id} must require one authored absolute-value equation`);
    assert.equal(equationFields[0].inputProfile, 'equation');
    assert.equal(equationFields[0].equivalence, 'absoluteLinearRelation');
    assert.equal(
      (doc.responseFields || []).some((field) => /solution|root|answer-x/.test(String(field.id))),
      false,
      `${doc.id} drifted into A2.6E solving instead of A2.6D formulation`,
    );

    if (/\{\{m\}\}/.test(String(equationFields[0].expected))) linearInsideFamilies += 1;
    if (doc.representation === 'context' || doc.taskType === 'modeling') contextFamilies += 1;
    if (doc.taskType === 'reverseReasoning') reverseFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let equivalentChecked = false;
    let wrongChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const grading = privateGradingDefinition(question);
      const equationField = grading.fields.find((field) => field.id === 'equation');
      assert.ok(equationField?.expected);
      assert.equal(equationField.equivalence, 'absoluteLinearRelation');

      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!equivalentChecked) {
        const sides = splitEquationSides(equationField.expected);
        assert.ok(sides);
        const reversed = `${sides.right}=${sides.left}`;
        const equivalent = await gradeResponse(grading, {
          responses: { ...responses, equation:reversed },
        });
        assert.equal(
          equivalent.isCorrect,
          true,
          `${doc.id} rejected the same absolute-value model with equation sides reversed`,
        );
        equivalentReversalsAccepted += 1;
        equivalentChecked = true;
      }

      if (!wrongChecked) {
        const sides = splitEquationSides(equationField.expected);
        const rhs = Number(sides?.right);
        assert.ok(Number.isFinite(rhs), `${doc.id} expected model needs a numeric distance side`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, equation:`${sides.left}=${rhs + 1}` },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a model with the wrong distance`);
        wrongModelsRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(linearInsideFamilies >= 3, 'A2.6D must repeatedly formulate |mx+b|=d, not only |x-h|=d');
  assert.ok(contextFamilies >= 2, 'A2.6D must repeatedly formulate from contextual modeling evidence');
  assert.ok(reverseFamilies >= 1, 'A2.6D must reverse paired solutions into an absolute-value equation');
  assert.ok(errorFamilies >= 1, 'A2.6D must repair a one-sided linear model by authoring the complete absolute-value equation');
  assert.equal(equivalentReversalsAccepted, entry.documents.length);
  assert.equal(wrongModelsRejected, entry.documents.length);
  assert.ok(representations.has('context'));
  assert.ok(representations.has('numberLine'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('verbal'));
});

test('A2.6E solves absolute-value linear equations through isolate-case-solve evidence and all solution counts', async () => {
  const entry = payload('A2.6E');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-absolute-value-linear-solving/);

  let generatedCount = 0;
  let twoSolutionFamilies = 0;
  let oneSolutionFamilies = 0;
  let zeroSolutionFamilies = 0;
  let linearInsideFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let wrongOutcomeRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const ids = new Set((doc.responseFields || []).map((field) => String(field.id)));
    if (ids.has('case-plus') && ids.has('case-minus')) twoSolutionFamilies += 1;
    if (doc.id.includes('zero-distance-one-solution')) oneSolutionFamilies += 1;
    if (doc.id.includes('negative-isolated-error')) zeroSolutionFamilies += 1;
    if (stringValues(doc).join(' ').includes('{{m}}')) linearInsideFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('two-case-complete') || doc.id.includes('scaled-linear-inside') || doc.id.includes('context-two-times')) {
        assert.ok(fields['case-plus'] && fields['case-minus']);
      }

      if (doc.id.includes('scaled-linear-inside')) {
        assert.ok(fields.isolated);
        assert.equal(fields.isolated.equivalence, 'absoluteLinearRelation');
        assert.ok(fields.left && fields.right);
        assert.ok(Number(fields.left.expected) < Number(fields.right.expected));
      }

      if (doc.id.includes('zero-distance-one-solution')) {
        assert.equal(fields['solution-count']?.expected, 'one');
        assert.ok(fields.solution);
        assert.match(String(fields.isolated?.expected), /=0$/);
      }

      if (doc.id.includes('context-two-times')) {
        assert.equal(fields.isolated?.equivalence, 'absoluteLinearRelation');
        assert.ok(Number(fields.early?.expected) >= 1);
        assert.ok(Number(fields.early?.expected) < Number(fields.late?.expected));
      }

      if (doc.id.includes('negative-isolated-error')) {
        assert.match(String(fields.isolated?.expected), /=-/);
        assert.equal(fields.diagnosis?.expected, 'none');
        assert.equal(fields['solution-count']?.expected, 'zero');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        let field = grading.fields.find((item) => ['right','late','solution'].includes(item.id));
        let wrongValue;
        if (field) {
          wrongValue = Number(field.expected ?? field.accepted?.[0]) + 1;
        } else {
          field = grading.fields.find((item) => item.id === 'solution-count' || item.id === 'diagnosis');
          wrongValue = String(field?.expected) === 'zero' ? 'two' : '__wrong__';
        }
        assert.ok(field, `${doc.id} has no final solution/outcome field to spoil`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [field.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect final solve outcome`);
        wrongOutcomeRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(twoSolutionFamilies >= 3, 'A2.6E must repeatedly execute both linear cases');
  assert.ok(oneSolutionFamilies >= 1, 'A2.6E must explicitly solve an absolute-value equation with exactly one real solution');
  assert.ok(zeroSolutionFamilies >= 1, 'A2.6E must explicitly solve a negative-isolated-value equation with no real solution');
  assert.ok(linearInsideFamilies >= 4, 'A2.6E must repeatedly solve nontrivial linear expressions inside absolute value');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(wrongOutcomeRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.6F solves absolute-value linear inequalities through isolation, AND/OR branches, and interval unions', async () => {
  const entry = payload('A2.6F');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-absolute-value-linear-inequality-solving/);

  let generatedCount = 0;
  let nontrivialLinearFamilies = 0;
  let boundedFamilies = 0;
  let unionFamilies = 0;
  let negativeOutsideFamilies = 0;
  let edgeContrastFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let wrongOutcomeRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const ids = new Set((doc.responseFields || []).map((field) => String(field.id)));
    const text = stringValues(doc).join(' ');

    if (text.includes('{{m}}')) nontrivialLinearFamilies += 1;
    if (ids.has('lower') && ids.has('upper') && ids.has('interval')) boundedFamilies += 1;
    if (ids.has('left-case') && ids.has('right-case') && ids.has('interval')) unionFamilies += 1;
    if (doc.id.includes('negative-outside')) negativeOutsideFamilies += 1;
    if (doc.id.includes('negative-bound-contrast')) edgeContrastFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('negative-outside-and-interval')) {
        assert.match(String(fields.isolated?.expected), /<=/);
        assert.ok(fields.lower && fields.upper && fields.interval);
        assert.match(String(fields.interval.expected), /^\[/);
      }

      if (doc.id.includes('strict-or-two-rays') || doc.id.includes('and-or-error-repair')) {
        assert.ok(fields['left-case'] && fields['right-case'] && fields.interval);
        assert.match(String(fields.interval.expected), /\(-inf,/);
        assert.match(String(fields.interval.expected), /,inf\)/);
      }

      if (doc.id.includes('negative-bound-contrast')) {
        assert.equal(fields.less?.expected, 'none');
        assert.equal(fields.greater?.expected, 'all');
        assert.equal(fields['all-real-interval']?.expected, '(-inf,inf)');
      }

      if (doc.id.includes('context-linear-tolerance')) {
        assert.ok(fields.model && fields.lower && fields.upper && fields.interval);
        const interval = String(fields.interval.expected).match(/^\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]$/);
        assert.ok(interval);
        assert.ok(Number(interval[1]) >= 1);
        assert.ok(Number(interval[1]) < Number(interval[2]));
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        let field = grading.fields.find((item) => item.id === 'interval');
        let wrongValue;
        if (field) {
          wrongValue = '(-inf,inf)';
          if (String(field.expected) === wrongValue) wrongValue = '(0,1)';
        } else {
          field = grading.fields.find((item) => item.id === 'less' || item.id === 'greater');
          wrongValue = String(field?.expected) === 'none' ? 'all' : 'none';
        }
        assert.ok(field, `${doc.id} has no final inequality outcome field to spoil`);
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [field.id]:wrongValue },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect solution region`);
        wrongOutcomeRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(nontrivialLinearFamilies >= 5, 'A2.6F must move beyond |x-h| and solve nontrivial linear interiors throughout');
  assert.ok(boundedFamilies >= 2, 'A2.6F must repeatedly execute bounded AND-style inequality reasoning');
  assert.ok(unionFamilies >= 2, 'A2.6F must repeatedly execute outside OR-style inequality reasoning');
  assert.ok(negativeOutsideFamilies >= 1, 'A2.6F must include inequality reversal while isolating through a negative outside coefficient');
  assert.ok(edgeContrastFamilies >= 1, 'A2.6F must contrast impossible and automatically true negative-bound cases');
  assert.ok(contextFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(wrongOutcomeRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.6G analyzes reciprocal transformations through full a-b-h-k effects and the equivalent a/b coefficient', async () => {
  const entry = payload('A2.6G');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /full-reciprocal-transform-analysis-a-b-h-k/);

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  for (const required of ['horizontal scale','horizontal reflection','vertical asymptote','horizontal asymptote','a/b']) {
    assert.ok(authoredText.includes(required), `A2.6G package is missing required reasoning: ${required}`);
  }

  let generatedCount = 0;
  let negativeAFamilies = 0;
  let negativeBFamilies = 0;
  let stretchFamilies = 0;
  let compressionFamilies = 0;
  let reverseFamilies = 0;
  let errorFamilies = 0;
  let wrongEffectRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const text = stringValues(doc).join(' ').toLowerCase();
    if (/a=-|x-axis reflection/.test(text)) negativeAFamilies += 1;
    const authoredBValues = doc.generator?.parameters?.b?.values || [];
    const authoredBField = (doc.responseFields || []).find((field) => field.id === 'b');
    if (
      authoredBValues.some((value) => Number(value) < 0)
      || Number(authoredBField?.expected) < 0
      || /b=-|b<0|-2\(x|-4\(x/.test(text)
    ) negativeBFamilies += 1;
    if (/horizontal stretch/.test(text)) stretchFamilies += 1;
    if (/horizontal compression|horizontal scale.*0\.25|horizontal scale.*0\.5/.test(text)) compressionFamilies += 1;
    if (doc.taskType === 'reverseReasoning') reverseFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let spoiledChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );
      assert.ok(fields.va && fields.ha, `${doc.id} must preserve both reciprocal asymptotes`);

      if (doc.id.includes('combined-symbolic-effects')) {
        assert.ok([2,4].includes(Number(fields['vertical-scale']?.expected)));
        assert.ok([0.5,0.25].includes(Number(fields['horizontal-scale']?.expected)));
        assert.equal(fields['x-reflection']?.expected, 'yes');
        assert.equal(fields['horizontal-reflection']?.expected, 'yes');
        assert.ok(Number(fields.effective?.expected) > 0);
      }

      if (doc.id.includes('negative-b-point-map')) {
        const neg = String(fields['neg-image']?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        const pos = String(fields['pos-image']?.expected).match(/^\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
        assert.ok(neg && pos);
        const h = Number(fields.va.expected);
        const k = Number(fields.ha.expected);
        assert.equal(Number(neg[1]), h + 0.5);
        assert.equal(Number(pos[1]), h - 0.5);
        assert.equal(Number(neg[2]), k - 3);
        assert.equal(Number(pos[2]), k + 3);
        assert.equal(Number(fields['horizontal-scale']?.expected), 0.5);
        assert.equal(fields['horizontal-reflection']?.expected, 'yes');
        assert.equal(Number(fields.effective?.expected), -1.5);
      }

      if (doc.id.includes('graph-horizontal-stretch')) {
        const points = question.stimulus?.graph?.points || [];
        assert.equal(points.length, 2);
        const h = Number(fields.va.expected);
        const k = Number(fields.ha.expected);
        assert.equal(Number(points[0].x), h - 2);
        assert.equal(Number(points[1].x), h + 2);
        assert.equal(Number(points[0].y), k - 2);
        assert.equal(Number(points[1].y), k + 2);
        assert.equal(Number(fields['horizontal-scale']?.expected), 2);
        assert.equal(Number(fields['vertical-scale']?.expected), 2);
        assert.equal(Number(fields.effective?.expected), 4);
      }

      if (doc.id.includes('reverse-specified-sequence')) {
        assert.equal(Number(fields.a?.expected), -3);
        assert.equal(Number(fields.b?.expected), -2);
        assert.equal(Number(fields.effective?.expected), 1.5);
        assert.equal(fields.orientation?.expected, 'same');
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(Number(fields['horizontal-scale']?.expected), 0.25);
        assert.equal(fields['horizontal-reflection']?.expected, 'yes');
        assert.equal(Number(fields.effective?.expected), -0.5);
        assert.equal(fields.orientation?.expected, 'opposite');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!spoiledChecked) {
        const field = grading.fields.find((item) => ['horizontal-scale','horizontal-reflection','orientation','effective'].includes(item.id)) || grading.fields[0];
        const expected = field.expected ?? field.accepted?.[0];
        const wrongValue = Number.isFinite(Number(expected))
          ? Number(expected) + 1
          : (String(expected) === 'yes' ? 'no' : '__wrong__');
        const wrong = await gradeResponse(grading, { responses:{...responses,[field.id]:wrongValue} });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect reciprocal transformation effect`);
        wrongEffectRejected += 1;
        spoiledChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(negativeAFamilies >= 2);
  assert.ok(negativeBFamilies >= 3);
  assert.ok(stretchFamilies >= 1);
  assert.ok(compressionFamilies >= 2);
  assert.ok(reverseFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(wrongEffectRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});

test('A2.6H formulates real-world rational equations through student-authored models', async () => {
  const entry = payload('A2.6H');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /student-authored-rational-equations/);

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  assert.equal(authoredText.includes('varies inversely'), false, 'A2.6H must not substitute A2.6L inverse-variation work for rational modeling');

  let generatedCount = 0;
  let workFamilies = 0;
  let speedFamilies = 0;
  let currentFamilies = 0;
  let concentrationFamilies = 0;
  let errorFamilies = 0;
  let reversedModelsAccepted = 0;
  let wrongModelsRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const equationFields = (doc.responseFields || []).filter((field) => field.id === 'equation');
    assert.equal(equationFields.length, 1, `${doc.id} must require one authored rational equation`);
    assert.equal(equationFields[0].inputProfile, 'equation');
    assert.equal(equationFields[0].equivalence, 'modelEquation');
    assert.equal(
      (doc.responseFields || []).some((field) => /solution|root/.test(String(field.id))),
      false,
      `${doc.id} drifted into A2.6I solving instead of A2.6H formulation`,
    );

    if (doc.id.includes('work') || doc.id.includes('opposing-rates')) workFamilies += 1;
    if (doc.id.includes('average-speed')) speedFamilies += 1;
    if (doc.id.includes('current')) currentFamilies += 1;
    if (doc.id.includes('dilution')) concentrationFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let reversedChecked = false;
    let wrongChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );
      const equation = fields.equation;
      assert.ok(equation?.expected);
      assert.equal(equation.equivalence, 'modelEquation');

      if (doc.id.includes('combined-work-equation')) {
        assert.ok(fields['rate-a'] && fields['rate-b']);
        assert.match(String(equation.expected), /1\/t/);
      }
      if (doc.id.includes('average-speed-equation')) {
        assert.ok(fields.time1 && fields.time2);
        assert.match(String(equation.expected), /\/v/);
      }
      if (doc.id.includes('round-trip-current-equation')) {
        assert.match(String(equation.expected), /v-/);
        assert.match(String(equation.expected), /v\+/);
        assert.match(String(fields.restriction?.expected), /v>/);
      }
      if (doc.id.includes('dilution-equation')) {
        assert.ok(fields['new-volume']);
        assert.match(String(equation.expected), /=0\.2$/);
      }
      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields.diagnosis?.expected, 'subtract');
        assert.match(String(equation.expected), /-/);
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!reversedChecked) {
        const sides = splitEquationSides(equation.expected);
        assert.ok(sides);
        const reversed = `${sides.right}=${sides.left}`;
        const result = await gradeResponse(grading, {
          responses:{...responses,equation:reversed},
        });
        assert.equal(result.isCorrect, true, `${doc.id} rejected the same rational model with equation sides reversed`);
        reversedModelsAccepted += 1;
        reversedChecked = true;
      }

      if (!wrongChecked) {
        const wrong = await gradeResponse(grading, {
          responses:{...responses,equation:'1=1'},
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted a structurally unrelated rational model`);
        wrongModelsRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(workFamilies >= 2, 'A2.6H must include both constructive and error-repair rate modeling');
  assert.ok(speedFamilies >= 1);
  assert.ok(currentFamilies >= 1);
  assert.ok(concentrationFamilies >= 1);
  assert.ok(errorFamilies >= 1);
  assert.equal(reversedModelsAccepted, entry.documents.length);
  assert.equal(wrongModelsRejected, entry.documents.length);
  assert.ok(representations.has('context'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});

test('A2.6I solves complete real rational equations across linear quadratic context and error-repair cases', async () => {
  const entry = payload('A2.6I');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complete-rational-equation-solving/);

  const authoredText = stringValues(entry.documents).join(' ').toLowerCase();
  assert.equal(authoredText.includes('extraneous candidate'), false, 'A2.6I must not take over A2.6J reasonableness/extraneous-candidate judgment');
  assert.equal(authoredText.includes('is reasonable'), false, 'A2.6I must remain solve-focused rather than ask A2.6J reasonableness questions');

  let generatedCount = 0;
  let quadraticFamilies = 0;
  let multiDenominatorFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let wrongRootsRejected = 0;
  let reversedClearedAccepted = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const solutionFields = (doc.responseFields || []).filter((field) => /solution|root/.test(String(field.id)));
    assert.ok(solutionFields.length >= 1, `${doc.id} must finish with at least one real solution field`);

    if (doc.id.includes('quadratic')) quadraticFamilies += 1;
    if (doc.id.includes('two-denominator') || doc.id.includes('lcd-error')) {
      quadraticFamilies += 1;
      multiDenominatorFamilies += 1;
    }
    if (doc.id.includes('quadratic-proportion')) multiDenominatorFamilies += 1;
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let wrongChecked = false;
    let reversedChecked = false;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      const params = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('shifted-isolate')) {
        const x = Number(fields.solution?.expected);
        assert.equal(Number(fields.excluded?.expected), Number(params.h));
        assert.equal(Number(fields['isolated-value']?.expected), Number(params.s));
        assert.equal(Number(fields.denominator?.expected), Number(params.d));
        assert.ok(Math.abs(Number(params.a) / (x - Number(params.h)) + Number(params.k) - Number(params.r)) < 1e-9);
        assert.notEqual(x, Number(params.h));
      }

      if (doc.id.includes('quadratic-proportion')) {
        const p = Number(fields['root-1']?.expected);
        const q = Number(fields['root-2']?.expected);
        const c = Number(params.c);
        const b = Number(params.b);
        assert.ok(p < q);
        assert.ok(Math.abs(p / (p - 1) - c / (p + b)) < 1e-9);
        assert.ok(Math.abs(q / (q - 1) - c / (q + b)) < 1e-9);
        assert.notEqual(p, 1);
        assert.notEqual(q, 1);
        assert.notEqual(p, -b);
        assert.notEqual(q, -b);
      }

      if (doc.id.includes('two-denominator') || doc.id.includes('lcd-error')) {
        const p = Number(fields['root-1']?.expected);
        const q = Number(fields['root-2']?.expected);
        const a = Number(params.a);
        const b = Number(params.b);
        assert.ok(p < q);
        assert.ok(Math.abs(a / p + b / (p - 3) - 1) < 1e-9);
        assert.ok(Math.abs(a / q + b / (q - 3) - 1) < 1e-9);
        assert.ok(![0, 3].includes(p));
        assert.ok(![0, 3].includes(q));
      }

      if (doc.id.includes('combined-work')) {
        const a = Number(params.a);
        const x = Number(fields.solution?.expected);
        const t = Number(params.t);
        assert.ok(Math.abs(1 / a + 1 / x - 1 / t) < 1e-9);
        assert.ok(x > 0);
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields.diagnosis?.expected, 'missing-x');
        assert.ok(fields.cleared?.expected);
        assert.equal(fields.cleared.equivalence, 'polynomialRelation');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        `${doc.id} failed generated correct-answer self-acceptance: ${JSON.stringify(correct.fieldResults)}`,
      );

      if (!reversedChecked && fields.cleared?.expected) {
        const sides = splitEquationSides(fields.cleared.expected);
        assert.ok(sides);
        const reversed = `${sides.right}=${sides.left}`;
        const result = await gradeResponse(grading, {
          responses: { ...responses, cleared: reversed },
        });
        assert.equal(result.isCorrect, true, `${doc.id} rejected an equivalent side-reversed cleared equation`);
        reversedClearedAccepted += 1;
        reversedChecked = true;
      }

      if (!wrongChecked) {
        const target = fields.solution || fields['root-1'];
        assert.ok(target, `${doc.id} has no final numeric field for wrong-answer rejection`);
        const wrongValue = Number(target.expected) + 1;
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [target.id]: String(wrongValue) },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect final rational-equation solution`);
        wrongRootsRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(quadraticFamilies >= 3, 'A2.6I must repeatedly reach a quadratic after clearing denominators');
  assert.ok(multiDenominatorFamilies >= 3, 'A2.6I must repeatedly solve authentic multi-denominator rational equations');
  assert.equal(contextFamilies, 1);
  assert.equal(errorFamilies, 1);
  assert.equal(wrongRootsRejected, entry.documents.length);
  assert.ok(reversedClearedAccepted >= 4, 'Every nontrivial cleared-equation family must accept equivalent equation-side reversal');
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

test('A2.6J determines rational-solution reasonableness from original-equation evidence', async () => {
  const entry = payload('A2.6J');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /evidence-based-rational-solution-reasonableness/);

  let generatedCount = 0;
  let keepFamilies = 0;
  let rejectFamilies = 0;
  let contextFamilies = 0;
  let errorFamilies = 0;
  let toleranceFamilies = 0;
  let wrongVerdictsRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    assert.match(String(doc.prompt), /candidate/i, `${doc.id} must supply a candidate rather than ask students to re-solve A2.6I`);
    assert.ok((doc.responseFields || []).some((field) => field.id === 'verdict'), `${doc.id} must require a final keep/reject decision`);
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;
    if (doc.id.includes('rounded-residual')) toleranceFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let wrongChecked = false;
    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      const params = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);
      const fields = Object.fromEntries((question.responseFields || []).map((field) => [field.id, field]));
      const verdict = String(fields.verdict?.expected || '');
      if (/keep/.test(verdict)) keepFamilies += 1;
      else rejectFamilies += 1;

      if (doc.id.includes('valid-exact')) {
        const d1 = Number(params.d1);
        const d2 = Number(params.d2);
        assert.notEqual(d1, 0);
        assert.notEqual(d2, 0);
        assert.ok(Math.abs(Number(params.a) / d1 - Number(params.m)) < 1e-9);
        assert.ok(Math.abs(Number(params.b) / d2 - Number(params.m)) < 1e-9);
        assert.equal(verdict, 'keep');
      }
      if (doc.id.includes('cleared-root-excluded')) {
        assert.equal(Number(fields['cleared-value']?.expected), 0);
        assert.equal(Number(fields['original-denominator']?.expected), 0);
        assert.equal(fields['original-status']?.expected, 'undefined');
        assert.equal(verdict, 'reject');
      }
      if (doc.id.includes('context-algebra-valid')) {
        assert.ok(Number(params.candidate) < 0);
        assert.ok(Math.abs(Number(params.total) / (Number(params.candidate) + Number(params.shift)) - Number(params.rate)) < 1e-9);
        assert.equal(fields['algebra-check']?.expected, 'yes');
        assert.equal(verdict, 'reject-context');
      }
      if (doc.id.includes('rounded-residual')) {
        assert.ok(Number(params.residual) > 0);
        assert.ok(Number(params.residual) <= 0.01);
        assert.notEqual(Number(params.denom), 0);
        assert.equal(verdict, 'keep');
      }
      if (doc.id.includes('missing-substitution-error')) {
        assert.notEqual(Number(params.d), 0);
        assert.ok(Math.abs(Number(params.a) / Number(params.d) - Number(params.m)) < 1e-9);
        assert.equal(Number(params.rhs), Number(params.m) + 1);
        assert.equal(fields.diagnosis?.expected, 'substitute');
        assert.equal(verdict, 'reject');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, `${doc.id} failed secure self-acceptance: ${JSON.stringify(correct.fieldResults)}`);

      if (!wrongChecked) {
        const wrongVerdict = verdict === 'keep'
          ? (doc.id.includes('valid-exact') ? 'reject-domain' : 'reject')
          : 'keep';
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, verdict: wrongVerdict },
        });
        assert.equal(wrong.isCorrect, false, `${doc.id} accepted an incorrect reasonableness verdict`);
        wrongVerdictsRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: `qa-${doc.id}-${generatedCount}`,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(keepFamilies > 0);
  assert.ok(rejectFamilies > 0);
  assert.equal(contextFamilies, 1);
  assert.equal(errorFamilies, 1);
  assert.equal(toleranceFamilies, 1);
  assert.equal(wrongVerdictsRejected, entry.documents.length);
  assert.ok(representations.has('table'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('verbal'));
});

test('A2.6K represents rational asymptotic restrictions in interval inequality and set-builder notation', async () => {
  const entry = payload('A2.6K');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /asymptotic-domain-range-three-notations/);

  let generatedCount = 0;
  let setBuilderFields = 0;
  let intervalFields = 0;
  let inequalityFields = 0;
  let twoVerticalFamilies = 0;
  let positiveOneSidedFamilies = 0;
  let negativeOneSidedFamilies = 0;
  let errorFamilies = 0;
  let wrongSetBuildersRejected = 0;
  let equivalentSetBuildersAccepted = 0;
  const checkedSetFields = new Set();
  const wrongCheckedDocs = new Set();
  const representations = new Set();

  const alternateSetBuilder = (expected) => {
    const match = /^\{([xy])\|(.+)\}$/.exec(String(expected || ''));
    assert.ok(match, 'set-builder key is not in canonical authored form: ' + expected);
    const variable = match[1];
    const condition = match[2]
      .replace(/!=/g, '≠')
      .replace(/ and /g, ', ');
    return '{' + variable + ' ∈ ℝ : ' + condition + '}';
  };

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    if (doc.id.includes('two-vertical')) twoVerticalFamilies += 1;
    if (doc.id.includes('positive-range') || doc.id.includes('full-repair')) positiveOneSidedFamilies += 1;
    if (doc.id.includes('negative-range')) negativeOneSidedFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const authoredSetFields = (doc.responseFields || []).filter((field) => field.equivalence === 'setBuilder');
    const authoredIntervalFields = (doc.responseFields || []).filter((field) => field.inputProfile === 'interval');
    const authoredInequalityFields = (doc.responseFields || []).filter((field) => field.inputProfile === 'inequality');
    assert.ok(authoredSetFields.length >= 1, doc.id + ' must require student-authored set-builder notation');
    assert.ok(authoredIntervalFields.length >= 1, doc.id + ' must require interval notation');
    assert.ok(authoredInequalityFields.length >= 1, doc.id + ' must require inequality notation');
    assert.ok(authoredSetFields.every((field) => field.inputProfile === 'expression'));
    assert.ok(authoredSetFields.every((field) => field.answerFormat === 'set-builder'));
    setBuilderFields += authoredSetFields.length;
    intervalFields += authoredIntervalFields.length;
    inequalityFields += authoredInequalityFields.length;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, doc.id + ' is not production-issuable: ' + issuePlan.reason);

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const question = generated.question;
      const params = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const fields = Object.fromEntries(
        (question.responseFields || []).map((field) => [field.id, field]),
      );

      if (doc.id.includes('translated-reciprocal')) {
        assert.equal(Number(fields.vertical?.expected), Number(params.h));
        assert.equal(Number(fields.horizontal?.expected), Number(params.k));
        assert.equal(fields['domain-inequality']?.expected, 'x!=' + params.h);
        assert.equal(fields['range-inequality']?.expected, 'y!=' + params.k);
      }

      if (doc.id.includes('two-vertical')) {
        assert.ok(Number(params.p) < Number(params.q));
        assert.equal(Number(fields['vertical-1']?.expected), Number(params.p));
        assert.equal(Number(fields['vertical-2']?.expected), Number(params.q));
        assert.equal(fields['domain-left']?.expected, 'x<' + params.p);
        assert.equal(fields['domain-middle']?.expected, params.p + '<x<' + params.q);
        assert.equal(fields['domain-right']?.expected, 'x>' + params.q);
      }

      if (doc.id.includes('positive-range') || doc.id.includes('full-repair')) {
        assert.ok(Number(params.a) > 0);
        assert.equal(fields['range-inequality']?.expected, 'y>' + params.k);
        assert.equal(fields['range-interval']?.expected, '(' + params.k + ',inf)');
      }

      if (doc.id.includes('negative-range')) {
        assert.ok(Number(params.a) > 0);
        assert.equal(fields['range-inequality']?.expected, 'y<' + params.k);
        assert.equal(fields['range-interval']?.expected, '(-inf,' + params.k + ')');
      }

      if (doc.taskType === 'errorAnalysis') {
        assert.equal(fields.diagnosis?.expected, 'both');
        assert.equal(doc.dok, 3);
      } else {
        assert.equal(doc.dok, 2, doc.id + ' should stay DOK 2 even when difficulty is high');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(
        correct.isCorrect,
        true,
        doc.id + ' failed generated correct-answer self-acceptance: ' + JSON.stringify(correct.fieldResults),
      );

      for (const field of grading.fields.filter((candidate) => candidate.equivalence === 'setBuilder')) {
        const checkKey = doc.id + ':' + field.id;
        if (checkedSetFields.has(checkKey)) continue;
        const alternate = alternateSetBuilder(field.expected);
        const equivalent = await gradeResponse(grading, {
          responses: { ...responses, [field.id]: alternate },
        });
        assert.equal(
          equivalent.isCorrect,
          true,
          doc.id + '/' + field.id + ' rejected equivalent textbook set-builder notation ' + alternate,
        );
        equivalentSetBuildersAccepted += 1;
        checkedSetFields.add(checkKey);
      }

      if (!wrongCheckedDocs.has(doc.id)) {
        const setField = grading.fields.find((candidate) => candidate.equivalence === 'setBuilder');
        assert.ok(setField);
        const binder = /^\{([xy])\|/.exec(String(setField.expected || ''))?.[1] || 'x';
        const wrong = await gradeResponse(grading, {
          responses: { ...responses, [setField.id]: '{' + binder + '|' + binder + '!=999}' },
        });
        assert.equal(wrong.isCorrect, false, doc.id + ' accepted a wrong set-builder restriction');
        wrongSetBuildersRejected += 1;
        wrongCheckedDocs.add(doc.id);
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
      for (const field of publicQuestion.responseFields || []) {
        if (String(field.id).includes('set')) {
          assert.equal(field.answerFormat, 'set-builder');
          assert.ok(Array.isArray(field.requiredSymbols) && field.requiredSymbols.includes('{'));
        }
      }
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(setBuilderFields >= 8, 'A2.6K must repeatedly require authored set-builder domain/range notation');
  assert.ok(intervalFields >= 8, 'A2.6K must repeatedly require interval notation');
  assert.ok(inequalityFields >= 10, 'A2.6K must repeatedly require inequality notation');
  assert.equal(twoVerticalFamilies, 1);
  assert.ok(positiveOneSidedFamilies >= 2);
  assert.equal(negativeOneSidedFamilies, 1);
  assert.equal(errorFamilies, 1);
  assert.equal(wrongSetBuildersRejected, entry.documents.length);
  assert.equal(equivalentSetBuildersAccepted, setBuilderFields);
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('verbal'));
});
test('A2.6L requires inverse-variation formulation and solving in every family', async () => {
  const entry = payload('A2.6L');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /formulate-and-solve-inverse-variation/);

  let generatedCount = 0;
  let contextFamilies = 0;
  let tableFamilies = 0;
  let errorFamilies = 0;
  let reversedModelsAccepted = 0;
  let directModelsRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    if (doc.representation === 'context') contextFamilies += 1;
    if (doc.representation === 'table') tableFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;

    const fields = Object.fromEntries((doc.responseFields || []).map((field) => [field.id, field]));
    assert.ok(fields.constant, doc.id + ' must require the inverse-variation constant');
    assert.ok(fields.equation, doc.id + ' must require an authored inverse-variation equation');
    assert.ok(fields.prediction || fields['missing-y'], doc.id + ' must solve/predict a new value');
    assert.equal(fields.equation.inputProfile, 'equation');
    assert.equal(fields.equation.equivalence, 'modelEquation');

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, doc.id + ' is not production-issuable: ' + issuePlan.reason);

    let reversedChecked = false;
    let directChecked = false;
    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const question = generated.question;
      const params = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const qFields = Object.fromEntries((question.responseFields || []).map((field) => [field.id, field]));
      const k = Number(qFields.constant?.expected);
      assert.ok(Number.isFinite(k) && k > 0, doc.id + ' generated a nonpositive or invalid constant');

      if (doc.id.includes('symbolic-formulate')) {
        assert.equal(k, Number(params.x1) * Number(params.y1));
        assert.equal(Number(qFields.prediction?.expected), k / Number(params.x2));
      }
      if (doc.id.includes('table-constant-product')) {
        assert.equal(Number(qFields['product-1']?.expected), k);
        assert.equal(Number(qFields['product-2']?.expected), k);
        assert.equal(Number(qFields['product-3']?.expected), k);
        assert.equal(Number(params.x1) * Number(params.y1), k);
        assert.equal(Number(params.x2) * Number(params.y2), k);
        assert.equal(Number(params.x3) * Number(params.y3), k);
        assert.equal(Number(qFields['missing-y']?.expected), k / Number(params.x4));
      }
      if (doc.id.includes('fixed-distance')) {
        assert.equal(k, Number(params.v1) * Number(params.t1));
        assert.equal(Number(qFields.prediction?.expected), k / Number(params.v2));
      }
      if (doc.id.includes('fixed-area')) {
        assert.equal(k, Number(params.l1) * Number(params.w1));
        assert.equal(Number(qFields.prediction?.expected), k / Number(params.l2));
      }
      if (doc.id.includes('direct-variation-error')) {
        assert.equal(qFields.diagnosis?.expected, 'direct');
        assert.equal(k, Number(params.x1) * Number(params.y1));
        assert.equal(Number(qFields.prediction?.expected), k / Number(params.x2));
        assert.notEqual(Number(params.wrongK), k);
        assert.equal(doc.dok, 3);
      } else {
        assert.equal(doc.dok, 2, doc.id + ' should remain DOK 2 even at higher difficulty');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      if (!reversedChecked) {
        const equation = grading.fields.find((field) => field.id === 'equation');
        const sides = splitEquationSides(equation?.expected);
        assert.ok(sides);
        const reversed = sides.right + '=' + sides.left;
        const result = await gradeResponse(grading, { responses: { ...responses, equation: reversed } });
        assert.equal(result.isCorrect, true, doc.id + ' rejected the same inverse model with equation sides reversed');
        reversedModelsAccepted += 1;
        reversedChecked = true;
      }

      if (!directChecked) {
        const dependent = doc.id.includes('fixed-distance') ? 't'
          : (doc.id.includes('fixed-area') ? 'w' : 'y');
        const independent = doc.id.includes('fixed-distance') ? 'v'
          : (doc.id.includes('fixed-area') ? 'l' : 'x');
        const wrongModel = dependent + '=' + k + '*' + independent;
        const wrong = await gradeResponse(grading, { responses: { ...responses, equation: wrongModel } });
        assert.equal(wrong.isCorrect, false, doc.id + ' accepted a direct-variation model for inverse variation');
        directModelsRejected += 1;
        directChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(contextFamilies >= 1);
  assert.equal(tableFamilies, 1);
  assert.equal(errorFamilies, 1);
  assert.equal(reversedModelsAccepted, entry.documents.length);
  assert.equal(directModelsRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('verbal'));
});
test('A2.7A securely adds subtracts and multiplies complex numbers with standard-form edge cases', async () => {
  const entry = payload('A2.7A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /complex-add-subtract-multiply/);

  let generatedCount = 0;
  let multiplicationFamilies = 0;
  let errorFamilies = 0;
  let pureRealFamilies = 0;
  let pureImagFamilies = 0;
  let reorderedAnswersAccepted = 0;
  let wrongAnswersRejected = 0;
  const representations = new Set();

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    if (doc.id.includes('multiply') || doc.id.includes('conjugate') || doc.taskType === 'errorAnalysis') multiplicationFamilies += 1;
    if (doc.taskType === 'errorAnalysis') errorFamilies += 1;
    if (doc.id.includes('pure-real')) pureRealFamilies += 1;
    if (doc.id.includes('pure-imaginary')) pureImagFamilies += 1;

    const fields = Object.fromEntries((doc.responseFields || []).map((field) => [field.id, field]));
    assert.ok(fields['real-part'], doc.id + ' must grade the real component');
    assert.ok(fields['imag-coefficient'], doc.id + ' must grade the imaginary coefficient');
    assert.ok(fields.answer, doc.id + ' must require a final simplified complex number');

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, doc.id + ' is not production-issuable: ' + issuePlan.reason);

    let reorderChecked = false;
    let wrongChecked = false;
    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, doc.id + ' failed generation: ' + generated.reason);
      const question = generated.question;
      const params = generated.parameters || {};
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const qFields = Object.fromEntries((question.responseFields || []).map((field) => [field.id, field]));
      const re = Number(qFields['real-part']?.expected);
      const im = Number(qFields['imag-coefficient']?.expected);
      assert.ok(Number.isFinite(re));
      assert.ok(Number.isFinite(im));

      if (doc.id.includes('add-components')) {
        assert.equal(re, Number(params.a) + Number(params.c));
        assert.equal(im, Number(params.b) + Number(params.d));
      }
      if (doc.id.includes('subtract-pure-imaginary')) {
        assert.equal(re, 0);
        assert.equal(im, Number(params.b) - Number(params.d));
        assert.notEqual(im, 0);
      }
      if (doc.id.includes('multiply-general')) {
        assert.equal(re, Number(params.a) * Number(params.c) - Number(params.b) * Number(params.d));
        assert.equal(im, Number(params.a) * Number(params.d) + Number(params.b) * Number(params.c));
      }
      if (doc.id.includes('conjugate-product')) {
        const product = Number(params.a) * Number(params.a) + Number(params.b) * Number(params.b);
        assert.equal(Number(qFields['conjugate-product']?.expected), product);
        assert.equal(re, product - Number(params.c));
        assert.equal(im, 0);
      }
      if (doc.taskType === 'errorAnalysis') {
        assert.equal(qFields.diagnosis?.expected, 'i-square');
        assert.equal(Number(params.wrongRe), Number(params.a) * Number(params.c) + Number(params.b) * Number(params.d));
        assert.equal(re, Number(params.a) * Number(params.c) - Number(params.b) * Number(params.d));
        assert.equal(im, Number(params.a) * Number(params.d) + Number(params.b) * Number(params.c));
        assert.notEqual(Number(params.wrongRe), re);
        assert.equal(doc.dok, 3);
      } else {
        assert.equal(doc.dok, 2, doc.id + ' should remain DOK 2 even when computational difficulty is high');
      }

      const grading = privateGradingDefinition(question);
      const responses = Object.fromEntries(
        grading.fields.map((field) => [field.id, field.expected ?? field.accepted?.[0] ?? '']),
      );
      const correct = await gradeResponse(grading, { responses });
      assert.equal(correct.isCorrect, true, doc.id + ' failed secure self-acceptance: ' + JSON.stringify(correct.fieldResults));

      if (!reorderChecked) {
        const reordered = im + '*i+' + re;
        const result = await gradeResponse(grading, { responses: { ...responses, answer: reordered } });
        assert.equal(result.isCorrect, true, doc.id + ' rejected equivalent complex term order: ' + reordered);
        reorderedAnswersAccepted += 1;
        reorderChecked = true;
      }

      if (!wrongChecked) {
        const wrong = (re + 1) + '+(' + im + ')*i';
        const result = await gradeResponse(grading, { responses: { ...responses, answer: wrong } });
        assert.equal(result.isCorrect, false, doc.id + ' accepted a changed complex-number component');
        wrongAnswersRejected += 1;
        wrongChecked = true;
      }

      const publicQuestion = buildSanitizedQuestion(question, {
        questionInstanceId: 'qa-' + doc.id + '-' + generatedCount,
        attemptsAllowed: 3,
      });
      const publicText = JSON.stringify(publicQuestion);
      assert.equal(publicText.includes('"expected"'), false);
      assert.equal(publicText.includes('"acceptedAnswers"'), false);
    }
  }

  assert.ok(generatedCount >= 200);
  assert.ok(multiplicationFamilies >= 3, 'A2.7A must repeatedly simplify multiplication through i^2=-1');
  assert.equal(errorFamilies, 1);
  assert.equal(pureRealFamilies, 1);
  assert.equal(pureImagFamilies, 1);
  assert.equal(reorderedAnswersAccepted, entry.documents.length);
  assert.equal(wrongAnswersRejected, entry.documents.length);
  assert.ok(representations.has('symbolic'));
  assert.ok(representations.has('multipleRepresentation'));
  assert.ok(representations.has('table'));
  assert.ok(representations.has('verbal'));
});
test('A2.7B securely adds subtracts and multiplies polynomials across sparse and higher-degree cases', async () => {
  const entry = payload('A2.7B');
  assert.ok(entry);
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /polynomial-add-subtract-multiply/);
  const authored = stringValues(entry.documents).join(' ').toLowerCase();
  assert.equal(authored.includes('the degree is 3 and the leading coefficient'), false, 'A2.7B must not retain the off-standard degree/leading-coefficient family');

  let generatedCount=0, addFamilies=0, subtractFamilies=0, multiplyFamilies=0, errorFamilies=0;
  let reorderedAccepted=0, wrongRejected=0, degree5Instances=0;
  const representations=new Set();

  for(const doc of entry.documents){
    representations.add(doc.representation);
    if(doc.id.includes('add-')) addFamilies+=1;
    if(doc.id.includes('subtract-') || doc.taskType==='errorAnalysis') subtractFamilies+=1;
    if(doc.id.includes('multiply-')) multiplyFamilies+=1;
    if(doc.taskType==='errorAnalysis') errorFamilies+=1;
    assert.ok((doc.responseFields||[]).some((field)=>field.id==='answer'), doc.id+' must require a final expanded polynomial');
    const issuePlan=await buildTemplateIssuePlan(doc,{samples:24});
    assert.equal(issuePlan.issuable,true,doc.id+' is not production-issuable: '+issuePlan.reason);
    let reorderChecked=false, wrongChecked=false;

    for(const generated of samplePathInstances(doc,40)){
      assert.ok(generated.question,doc.id+' failed generation: '+generated.reason);
      const q=generated.question,p=generated.parameters||{};
      generatedCount+=1;
      assert.deepEqual([...placeholdersUsed(q)],[]);
      const fields=Object.fromEntries((q.responseFields||[]).map((field)=>[field.id,field]));

      if(doc.id.includes('add-sparse')){
        assert.equal(Number(fields['coef-4'].expected),Number(p.a));
        assert.equal(Number(fields['coef-3'].expected),Number(p.d));
        assert.equal(Number(fields['coef-2'].expected),Number(p.b)+Number(p.e));
        assert.equal(Number(fields['coef-1'].expected),Number(p.f));
        assert.equal(Number(fields['coef-0'].expected),Number(p.c)+Number(p.g));
      }
      if(doc.id.includes('subtract-sparse')){
        assert.equal(Number(fields['coef-4'].expected),Number(p.a)-Number(p.e));
        assert.equal(Number(fields['coef-3'].expected),Number(p.b));
        assert.equal(Number(fields['coef-2'].expected),-Number(p.f));
        assert.equal(Number(fields['coef-1'].expected),Number(p.c)-Number(p.g));
        assert.equal(Number(fields['coef-0'].expected),Number(p.d)-Number(p.h));
      }
      if(doc.id.includes('multiply-quadratics')){
        assert.equal(Number(fields['coef-4'].expected),Number(p.a)*Number(p.d));
        assert.equal(Number(fields['coef-3'].expected),Number(p.a)*Number(p.e)+Number(p.b)*Number(p.d));
        assert.equal(Number(fields['coef-2'].expected),Number(p.a)*Number(p.f)+Number(p.b)*Number(p.e)+Number(p.c)*Number(p.d));
        assert.equal(Number(fields['coef-1'].expected),Number(p.b)*Number(p.f)+Number(p.c)*Number(p.e));
        assert.equal(Number(fields['coef-0'].expected),Number(p.c)*Number(p.f));
      }
      if(doc.id.includes('degree5')){
        degree5Instances+=1;
        assert.equal(Number(fields['coef-5'].expected),Number(p.a)*Number(p.c));
        assert.equal(Number(fields['coef-4'].expected),Number(p.a)*Number(p.d));
        assert.equal(Number(fields['coef-3'].expected),Number(p.a)*Number(p.e));
        assert.equal(Number(fields['coef-2'].expected),Number(p.b)*Number(p.c));
        assert.equal(Number(fields['coef-1'].expected),Number(p.b)*Number(p.d));
        assert.equal(Number(fields['coef-0'].expected),Number(p.b)*Number(p.e));
      }
      if(doc.taskType==='errorAnalysis'){
        assert.equal(fields.diagnosis.expected,'all-signs');
        assert.equal(Number(fields['coef-3'].expected),Number(p.a)-Number(p.e));
        assert.equal(Number(fields['coef-2'].expected),Number(p.b)-Number(p.f));
        assert.equal(Number(fields['coef-1'].expected),Number(p.c)-Number(p.g));
        assert.equal(Number(fields['coef-0'].expected),Number(p.d)-Number(p.h));
        assert.equal(doc.dok,3);
      } else assert.equal(doc.dok,2,doc.id+' should remain DOK 2 despite computational difficulty');

      const grading=privateGradingDefinition(q);
      const responses=Object.fromEntries(grading.fields.map((field)=>[field.id,field.expected??field.accepted?.[0]??'']));
      const correct=await gradeResponse(grading,{responses});
      assert.equal(correct.isCorrect,true,doc.id+' failed secure self-acceptance: '+JSON.stringify(correct.fieldResults));

      const coefFields=grading.fields.filter((field)=>/^coef-\d+$/.test(field.id));
      const terms=coefFields.map((field)=>({degree:Number(field.id.split('-')[1]),value:Number(field.expected)})).sort((a,b)=>a.degree-b.degree);
      if(!reorderChecked){
        const reordered=terms.map((term)=>'('+term.value+')'+(term.degree===0?'':term.degree===1?'*x':'*x^'+term.degree)).join('+');
        const result=await gradeResponse(grading,{responses:{...responses,answer:reordered}});
        assert.equal(result.isCorrect,true,doc.id+' rejected an equivalent reordered expanded polynomial');
        reorderedAccepted+=1; reorderChecked=true;
      }
      if(!wrongChecked){
        const lead=terms[terms.length-1];
        const wrong=terms.map((term)=>'('+(term===lead?term.value+1:term.value)+')'+(term.degree===0?'':term.degree===1?'*x':'*x^'+term.degree)).join('+');
        const result=await gradeResponse(grading,{responses:{...responses,answer:wrong}});
        assert.equal(result.isCorrect,false,doc.id+' accepted a changed polynomial coefficient');
        wrongRejected+=1; wrongChecked=true;
      }
      const publicQ=buildSanitizedQuestion(q,{questionInstanceId:'qa-'+doc.id+'-'+generatedCount,attemptsAllowed:3});
      const publicText=JSON.stringify(publicQ);
      assert.equal(publicText.includes('"expected"'),false);
      assert.equal(publicText.includes('"acceptedAnswers"'),false);
    }
  }
  assert.ok(generatedCount>=200);
  assert.equal(addFamilies,1);
  assert.ok(subtractFamilies>=2);
  assert.equal(multiplyFamilies,2);
  assert.equal(errorFamilies,1);
  assert.ok(degree5Instances>=40);
  assert.equal(reorderedAccepted,entry.documents.length);
  assert.equal(wrongRejected,entry.documents.length);
  assert.ok(representations.has('symbolic')&&representations.has('table')&&representations.has('multipleRepresentation')&&representations.has('verbal'));
});
test('A2.7C directly certifies all four polynomial quotient degree combinations', async () => {
  const entry=payload('A2.7C');
  assert.ok(entry); assert.equal(entry.verdict,'REBUILD');
  assert.match(entry.certificationStatus,/four-degree-combinations-polynomial-quotients/);
  let generatedCount=0,c3l1=0,c3q2=0,q4l1=0,q4q2=0,errorFamilies=0,reorderedAccepted=0,wrongRejected=0,linearRemainders=0;
  const representations=new Set();
  for(const doc of entry.documents){
    representations.add(doc.representation);
    if(doc.id.includes('cubic-linear')) c3l1+=1;
    if(doc.id.includes('cubic-quadratic')) c3q2+=1;
    if(doc.id.includes('quartic-linear')) q4l1+=1;
    if(doc.id.includes('quartic-quadratic')) q4q2+=1;
    if(doc.taskType==='errorAnalysis') errorFamilies+=1;
    assert.ok((doc.responseFields||[]).some((field)=>field.id==='quotient'),doc.id+' must require the quotient');
    const plan=await buildTemplateIssuePlan(doc,{samples:24});
    assert.equal(plan.issuable,true,doc.id+' is not production-issuable: '+plan.reason);
    let reorderChecked=false,wrongChecked=false;
    for(const generated of samplePathInstances(doc,40)){
      assert.ok(generated.question,doc.id+' failed generation: '+generated.reason);
      const q=generated.question,p=generated.parameters||{}; generatedCount+=1;
      assert.deepEqual([...placeholdersUsed(q)],[]);
      const fields=Object.fromEntries((q.responseFields||[]).map((field)=>[field.id,field]));
      if(doc.id.includes('cubic-linear')){
        assert.equal(Number(p.A3),Number(p.q2));
        assert.equal(Number(p.A2),Number(p.q1)-Number(p.d)*Number(p.q2));
        assert.equal(Number(p.A1),Number(p.q0)-Number(p.d)*Number(p.q1));
        assert.equal(Number(p.A0),-Number(p.d)*Number(p.q0));
        assert.equal(Number(fields.remainder.expected),0);
      }
      if(doc.id.includes('cubic-quadratic')){
        assert.equal(Number(p.A3),Number(p.m));
        assert.equal(Number(p.A2),Number(p.n)+Number(p.p)*Number(p.m));
        assert.equal(Number(p.A1),Number(p.m)*Number(p.q)+Number(p.n)*Number(p.p));
        assert.equal(Number(p.A0),Number(p.n)*Number(p.q));
        assert.equal(Number(fields.remainder.expected),0);
      }
      if(doc.id.includes('quartic-linear')){
        assert.notEqual(Number(p.rem),0);
        assert.equal(Number(p.A4),Number(p.q3));
        assert.equal(Number(p.A3),Number(p.q2)-Number(p.d)*Number(p.q3));
        assert.equal(Number(p.A2),Number(p.q1)-Number(p.d)*Number(p.q2));
        assert.equal(Number(p.A1),Number(p.q0)-Number(p.d)*Number(p.q1));
        assert.equal(Number(p.A0),-Number(p.d)*Number(p.q0)+Number(p.rem));
        assert.equal(Number(fields.remainder.expected),Number(p.rem));
      }
      if(doc.id.includes('quartic-quadratic-linear-remainder')){
        linearRemainders+=1;
        assert.notEqual(Number(p.s),0);
        assert.equal(Number(p.A4),Number(p.m));
        assert.equal(Number(p.A3),Number(p.n)+Number(p.p)*Number(p.m));
        assert.equal(Number(p.A2),Number(p.r)+Number(p.p)*Number(p.n)+Number(p.q)*Number(p.m));
        assert.equal(Number(p.A1),Number(p.p)*Number(p.r)+Number(p.q)*Number(p.n)+Number(p.s));
        assert.equal(Number(p.A0),Number(p.q)*Number(p.r)+Number(p.t));
      }
      if(doc.id.includes('premature-stop')){
        assert.equal(fields.diagnosis.expected,'continue');
        assert.equal(Number(p.A4),Number(p.m));
        assert.equal(Number(p.A3),Number(p.n)+Number(p.p)*Number(p.m));
        assert.equal(Number(p.A2),Number(p.r)+Number(p.p)*Number(p.n)+Number(p.q)*Number(p.m));
        assert.equal(Number(p.A1),Number(p.p)*Number(p.r)+Number(p.q)*Number(p.n));
        assert.equal(Number(p.A0),Number(p.q)*Number(p.r));
        assert.equal(Number(fields.remainder.expected),0);
        assert.equal(doc.dok,3);
      } else assert.equal(doc.dok,2,doc.id+' should remain DOK 2 despite long computation');
      const grading=privateGradingDefinition(q);
      const responses=Object.fromEntries(grading.fields.map((field)=>[field.id,field.expected??field.accepted?.[0]??'']));
      const correct=await gradeResponse(grading,{responses});
      assert.equal(correct.isCorrect,true,doc.id+' failed secure self-acceptance: '+JSON.stringify(correct.fieldResults));
      if(!reorderChecked){
        const qFields=grading.fields.filter((field)=>/^q\d$/.test(field.id)).map((field)=>({degree:Number(field.id.slice(1)),value:Number(field.expected)})).sort((a,b)=>a.degree-b.degree);
        const alt=qFields.map((term)=>'('+term.value+')'+(term.degree===0?'':term.degree===1?'*x':'*x^'+term.degree)).join('+');
        const result=await gradeResponse(grading,{responses:{...responses,quotient:alt}});
        assert.equal(result.isCorrect,true,doc.id+' rejected equivalent reordered quotient');
        reorderedAccepted+=1; reorderChecked=true;
      }
      if(!wrongChecked){
        const qField=grading.fields.find((field)=>/^q\d$/.test(field.id)); assert.ok(qField);
        const wrongResponses={...responses,[qField.id]:String(Number(qField.expected)+1)};
        const result=await gradeResponse(grading,{responses:wrongResponses});
        assert.equal(result.isCorrect,false,doc.id+' accepted an incorrect quotient coefficient');
        wrongRejected+=1; wrongChecked=true;
      }
      if(fields.remainder?.inputProfile==='expression'){
        const altRem=Number(p.t)+'+('+Number(p.s)+')*x';
        const result=await gradeResponse(grading,{responses:{...responses,remainder:altRem}});
        assert.equal(result.isCorrect,true,doc.id+' rejected equivalent reordered linear remainder');
      }
      const publicQ=buildSanitizedQuestion(q,{questionInstanceId:'qa-'+doc.id+'-'+generatedCount,attemptsAllowed:3});
      const publicText=JSON.stringify(publicQ); assert.equal(publicText.includes('"expected"'),false); assert.equal(publicText.includes('"acceptedAnswers"'),false);
    }
  }
  assert.ok(generatedCount>=200); assert.equal(c3l1,1); assert.equal(c3q2,1); assert.equal(q4l1,1); assert.ok(q4q2>=2);
  assert.equal(errorFamilies,1); assert.ok(linearRemainders>=40); assert.equal(reorderedAccepted,entry.documents.length); assert.equal(wrongRejected,entry.documents.length);
  assert.ok(representations.has('symbolic')&&representations.has('table')&&representations.has('multipleRepresentation')&&representations.has('verbal'));
});
test('A2.7D algebraically determines cubic and quartic linear factors including rational roots and multiplicity', async () => {
 const entry=payload('A2.7D'); assert.ok(entry); assert.equal(entry.verdict,'REBUILD'); assert.match(entry.certificationStatus,/algebraic-linear-factors-cubic-quartic/);
 assert.equal(entry.documents.some((doc)=>doc.representation==='graph'),false,'A2.7D must use algebraic methods, not graph-only factor identification');
 let generatedCount=0,cubicFamilies=0,quarticFamilies=0,rationalInstances=0,multiplicityInstances=0,errorFamilies=0,altFactorsAccepted=0,wrongRootsRejected=0;
 const evalPoly=(coeffs,x)=>coeffs.reduce((acc,c)=>acc*x+c,0);
 for(const doc of entry.documents){
  if(doc.id.includes('cubic-')) cubicFamilies+=1; if(doc.id.includes('quartic-')||doc.taskType==='errorAnalysis') quarticFamilies+=1; if(doc.taskType==='errorAnalysis') errorFamilies+=1;
  const plan=await buildTemplateIssuePlan(doc,{samples:24}); assert.equal(plan.issuable,true,doc.id+' is not production-issuable: '+plan.reason);
  let altChecked=false,wrongChecked=false;
  for(const generated of samplePathInstances(doc,40)){
   assert.ok(generated.question,doc.id+' failed generation: '+generated.reason); const q=generated.question,p=generated.parameters||{}; generatedCount+=1; assert.deepEqual([...placeholdersUsed(q)],[]);
   const fields=Object.fromEntries((q.responseFields||[]).map((field)=>[field.id,field]));
   if(doc.id.includes('cubic-integer')){
    const coeff=[1,Number(p.A2),Number(p.A1),Number(p.A0)]; [p.r1,p.r2,p.r3].forEach((root)=>assert.ok(Math.abs(evalPoly(coeff,Number(root)))<1e-9));
    assert.equal(Number(fields['test-value'].expected),0); assert.equal(Number(p.Q1),-(Number(p.r2)+Number(p.r3))); assert.equal(Number(p.Q0),Number(p.r2)*Number(p.r3));
   }
   if(doc.id.includes('quartic-four')||doc.taskType==='errorAnalysis'){
    const coeff=[1,Number(p.A3),Number(p.A2),Number(p.A1),Number(p.A0)]; [p.r1,p.r2,p.r3,p.r4].forEach((root)=>assert.ok(Math.abs(evalPoly(coeff,Number(root)))<1e-8));
    if(fields['reduced-quotient']){ assert.equal(Number(p.Q2),-(Number(p.r2)+Number(p.r3)+Number(p.r4))); assert.equal(Number(p.Q1),Number(p.r2)*Number(p.r3)+Number(p.r2)*Number(p.r4)+Number(p.r3)*Number(p.r4)); assert.equal(Number(p.Q0),-Number(p.r2)*Number(p.r3)*Number(p.r4)); }
   }
   if(doc.id.includes('noninteger-rational')){
    rationalInstances+=1; const rr=Number(p.rr); assert.notEqual(rr,Math.trunc(rr));
    const coeff=[2,Number(p.A2),Number(p.A1),Number(p.A0)]; assert.ok(Math.abs(evalPoly(coeff,rr))<1e-8); assert.ok(Math.abs(evalPoly(coeff,Number(p.r2)))<1e-8); assert.ok(Math.abs(evalPoly(coeff,Number(p.r3)))<1e-8);
   }
   if(doc.id.includes('repeated-root')){
    multiplicityInstances+=1; const coeff=[1,Number(p.A3),Number(p.A2),Number(p.A1),Number(p.A0)]; [p.r1,p.r2,p.r3].forEach((root)=>assert.ok(Math.abs(evalPoly(coeff,Number(root)))<1e-8));
    assert.equal(Number(fields.multiplicity.expected),2);
   }
   if(doc.taskType==='errorAnalysis'){ assert.equal(fields.diagnosis.expected,'root-sign'); assert.equal(Number(fields['correct-synthetic'].expected),Number(p.r1)); assert.equal(Number(p.wrongSynthetic),-Number(p.r1)); assert.equal(doc.dok,3); } else assert.equal(doc.dok,2,doc.id+' should remain DOK 2 despite algebraic depth');
   const grading=privateGradingDefinition(q); const responses=Object.fromEntries(grading.fields.map((field)=>[field.id,field.expected??field.accepted?.[0]??'']));
   const correct=await gradeResponse(grading,{responses}); assert.equal(correct.isCorrect,true,doc.id+' failed secure self-acceptance: '+JSON.stringify(correct.fieldResults));
   if(!altChecked){ const factor=grading.fields.find((field)=>/^factor-/.test(field.id))||grading.fields.find((field)=>field.id==='rational-factor'); assert.ok(factor); const rootFieldId=factor.id==='rational-factor'?'rational-root':factor.id.replace('factor-','root-'); const root=Number(grading.fields.find((field)=>field.id===rootFieldId)?.expected); assert.ok(Number.isFinite(root)); const alt='(-'+root+')+x'; const result=await gradeResponse(grading,{responses:{...responses,[factor.id]:alt}}); assert.equal(result.isCorrect,true,doc.id+' rejected equivalent reordered linear factor '+alt); altFactorsAccepted+=1; altChecked=true; }
   if(!wrongChecked){ const rootField=grading.fields.find((field)=>/^root-/.test(field.id))||grading.fields.find((field)=>field.id==='rational-root'); assert.ok(rootField); const result=await gradeResponse(grading,{responses:{...responses,[rootField.id]:String(Number(rootField.expected)+1)}}); assert.equal(result.isCorrect,false,doc.id+' accepted a changed root'); wrongRootsRejected+=1; wrongChecked=true; }
   const publicQ=buildSanitizedQuestion(q,{questionInstanceId:'qa-'+doc.id+'-'+generatedCount,attemptsAllowed:3}); const publicText=JSON.stringify(publicQ); assert.equal(publicText.includes('"expected"'),false); assert.equal(publicText.includes('"acceptedAnswers"'),false);
  }
 }
 assert.ok(generatedCount>=200); assert.equal(cubicFamilies,2); assert.ok(quarticFamilies>=3); assert.ok(rationalInstances>=40); assert.ok(multiplicityInstances>=40); assert.equal(errorFamilies,1); assert.equal(altFactorsAccepted,entry.documents.length); assert.equal(wrongRootsRejected,entry.documents.length);
});
test('A2.7E certifies linear and quadratic factors from cubes and grouping', async () => {
  const entry=payload('A2.7E'); assert.ok(entry); assert.equal(entry.verdict,'ENHANCE'); assert.match(entry.certificationStatus,/linear-quadratic-factors-cubes/);
  let generatedCount=0,diffCube=0,sumCube=0,cubicGrouping=0,quarticGrouping=0,errorFamilies=0,altAccepted=0,wrongRejected=0;
  const representations=new Set();
  for(const doc of entry.documents){
    representations.add(doc.representation);
    if(doc.id.includes('difference-cubes')) diffCube+=1;
    if(doc.id.includes('sum-cubes')) sumCube+=1;
    if(doc.id.includes('cubic-grouping')) cubicGrouping+=1;
    if(doc.id.includes('quartic-grouping')) quarticGrouping+=1;
    if(doc.taskType==='errorAnalysis') errorFamilies+=1;
    const factorFields=(doc.responseFields||[]).filter((field)=>field.id.includes('linear-factor'));
    const quadraticFields=(doc.responseFields||[]).filter((field)=>field.id.includes('quadratic-factor'));
    assert.ok(factorFields.length>=1,doc.id+' must grade at least one linear factor');
    assert.ok(quadraticFields.length>=1,doc.id+' must grade a quadratic factor');
    const plan=await buildTemplateIssuePlan(doc,{samples:24}); assert.equal(plan.issuable,true,doc.id+' is not production-issuable: '+plan.reason);
    let altChecked=false,wrongChecked=false;
    for(const generated of samplePathInstances(doc,40)){
      assert.ok(generated.question,doc.id+' failed generation: '+generated.reason); const q=generated.question,p=generated.parameters||{}; generatedCount+=1; assert.deepEqual([...placeholdersUsed(q)],[]);
      const fields=Object.fromEntries((q.responseFields||[]).map((field)=>[field.id,field]));
      if(doc.id.includes('difference-cubes')){
        assert.equal(Number(p.m2),Number(p.m)*Number(p.m)); assert.equal(Number(p.m3),Number(p.m2)*Number(p.m)); assert.equal(Number(p.n2),Number(p.n)*Number(p.n)); assert.equal(Number(p.n3),Number(p.n2)*Number(p.n)); assert.equal(Number(p.mn),Number(p.m)*Number(p.n));
      }
      if(doc.id.includes('sum-cubes')){
        assert.equal(Number(p.m3),Number(p.m)*Number(p.m)*Number(p.m)); assert.equal(Number(p.n3),Number(p.n)*Number(p.n)*Number(p.n)); assert.equal(Number(p.mn),Number(p.m)*Number(p.n));
      }
      if(doc.id.includes('cubic-grouping')){
        assert.equal(Number(p.ac),Number(p.a)*Number(p.c)); assert.equal(Number(p.bc),Number(p.b)*Number(p.c)); assert.equal(fields['common-binomial'].expected,'x+'+p.c);
      }
      if(doc.id.includes('quartic-grouping')){
        assert.equal(Number(p.n2),Number(p.n)*Number(p.n)); assert.equal(Number(p.n3),Number(p.n)*Number(p.n)*Number(p.n)); assert.equal(Number(p.cn3),Number(p.c)*Number(p.n3)); assert.equal(fields['group-factor'].expected,'x+'+p.c);
        if(doc.id.includes('difference-cubes')) assert.equal(fields['cubic-after-grouping'].expected,'x^3-'+p.n3);
        if(doc.taskType==='errorAnalysis'){ assert.equal(fields.diagnosis.expected,'sign'); assert.equal(fields['cubic-after-grouping'].expected,'x^3+'+p.n3); assert.equal(doc.dok,3); }
      }
      if(doc.taskType!=='errorAnalysis') assert.equal(doc.dok,2,doc.id+' should remain DOK 2 despite factoring length');
      const grading=privateGradingDefinition(q); const responses=Object.fromEntries(grading.fields.map((field)=>[field.id,field.expected??field.accepted?.[0]??'']));
      const correct=await gradeResponse(grading,{responses}); assert.equal(correct.isCorrect,true,doc.id+' failed secure self-acceptance: '+JSON.stringify(correct.fieldResults));
      if(!altChecked){ const lf=grading.fields.find((field)=>field.id.includes('linear-factor')); assert.ok(lf); const expected=String(lf.expected); const m=/^([0-9-]+)\*x([+-])([0-9-]+)$/.exec(expected); let alt=null; if(m){ alt=(m[2]==='+'?m[3]:'-'+m[3])+'+'+m[1]+'*x'; } else { const sm=/^x([+-])([0-9-]+)$/.exec(expected); if(sm) alt=(sm[1]==='+'?sm[2]:'-'+sm[2])+'+x'; } if(alt){ const result=await gradeResponse(grading,{responses:{...responses,[lf.id]:alt}}); assert.equal(result.isCorrect,true,doc.id+' rejected equivalent reordered linear factor '+alt); altAccepted+=1; } else altAccepted+=1; altChecked=true; }
      if(!wrongChecked){ const qf=grading.fields.find((field)=>field.id.includes('quadratic-factor')); assert.ok(qf); const wrong=String(qf.expected)+'+1'; const result=await gradeResponse(grading,{responses:{...responses,[qf.id]:wrong}}); assert.equal(result.isCorrect,false,doc.id+' accepted a changed quadratic factor'); wrongRejected+=1; wrongChecked=true; }
      const publicQ=buildSanitizedQuestion(q,{questionInstanceId:'qa-'+doc.id+'-'+generatedCount,attemptsAllowed:3}); const publicText=JSON.stringify(publicQ); assert.equal(publicText.includes('"expected"'),false); assert.equal(publicText.includes('"acceptedAnswers"'),false);
    }
  }
  assert.ok(generatedCount>=200); assert.equal(diffCube,1); assert.equal(sumCube,1); assert.equal(cubicGrouping,1); assert.equal(quarticGrouping,2); assert.equal(errorFamilies,1); assert.equal(altAccepted,entry.documents.length); assert.equal(wrongRejected,entry.documents.length);
  assert.ok(representations.has('symbolic')&&representations.has('multipleRepresentation')&&representations.has('table')&&representations.has('verbal'));
});
