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
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { parsePolynomial, splitEquationSides } from '../../functions/shared/algebraicForm.mjs';
import {
  feasibleRegionPolygon,
  satisfiesLinearInequality,
  solve3x3System,
} from '../../src/tools/systemsWorkspace/systemsMath.js';

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

      const quadraticKey = question.responseFields?.find((field) => field.id === 'quadratic')?.expected;
      assert.ok(quadraticKey);
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

const a24aSpecifiedPoints = (question) => {
  const stimulus = question.stimulus || {};
  if (Array.isArray(stimulus.orderedPairs)) {
    return stimulus.orderedPairs.map((point) => ({ x:Number(point.x), y:Number(point.y) }));
  }
  if (Array.isArray(stimulus.graph?.points)) {
    return stimulus.graph.points.map((point) => ({ x:Number(point.x), y:Number(point.y) }));
  }
  if (Array.isArray(stimulus.table?.rows) && stimulus.table.rows.length) {
    return stimulus.table.rows.map((row) => ({ x:Number(row[0]), y:Number(row[1]) }));
  }
  return [];
};

test('A2.4A writes the unique quadratic determined by exactly three specified points', async () => {
  const entry = payload('A2.4A');
  assert.ok(entry);
  assert.equal(entry.verdict, 'REBUILD');
  assert.match(entry.certificationStatus, /student-authored-quadratic-functions-from-exactly-three-specified-points/);

  const representations = new Set();
  let generatedCount = 0;
  let nonzeroXFamilies = 0;
  let coefficientSystemFamilies = 0;
  let errorRepairFamilies = 0;

  for (const doc of entry.documents) {
    representations.add(doc.representation);
    const publicEvidence = JSON.stringify({ prompt:doc.prompt, stimulus:doc.stimulus });
    assert.equal(
      publicEvidence.includes('{{a}}'),
      false,
      `${doc.id} gives away the generated leading coefficient in the three-point data`,
    );

    const quadraticFields = (doc.responseFields || []).filter((field) => (
      field.inputProfile === 'equation' && String(field.id).includes('quadratic')
    ));
    assert.equal(quadraticFields.length, 1, `${doc.id} must require one complete authored quadratic function`);

    const setupFields = (doc.responseFields || []).filter((field) => (
      field.inputProfile === 'equation' && !String(field.id).includes('quadratic')
    ));
    if (setupFields.length >= 3) coefficientSystemFamilies += 1;
    if (doc.taskType === 'errorAnalysis' && setupFields.length >= 3) errorRepairFamilies += 1;

    const issuePlan = await buildTemplateIssuePlan(doc, { samples: 24 });
    assert.equal(issuePlan.issuable, true, `${doc.id} is not production-issuable: ${issuePlan.reason}`);

    let familyHasOnlyNonzeroX = true;

    for (const generated of samplePathInstances(doc, 40)) {
      assert.ok(generated.question, `${doc.id} failed generation: ${generated.reason}`);
      const question = generated.question;
      generatedCount += 1;
      assert.deepEqual([...placeholdersUsed(question)], []);

      const points = a24aSpecifiedPoints(question);
      assert.equal(points.length, 3, `${doc.id} must expose exactly three specified points`);
      assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
      assert.equal(new Set(points.map((point) => point.x)).size, 3, `${doc.id} must use three distinct x-values`);
      if (points.some((point) => Math.abs(point.x) <= 1e-9)) familyHasOnlyNonzeroX = false;

      const solved = solve3x3System({
        rows: points.map((point) => [point.x * point.x, point.x, 1, point.y]),
      });
      assert.equal(solved.type, 'one', `${doc.id} generated three points that do not determine a unique quadratic`);

      const quadratic = (question.responseFields || []).find((field) => String(field.id).includes('quadratic'));
      assert.ok(quadratic?.expected, `${doc.id} generated no private quadratic key`);
      const independentlySolved = `y=${solved.x}x^2+(${solved.y})x+(${solved.z})`;
      assert.equal(
        sameValue(quadratic.expected, independentlySolved),
        true,
        `${doc.id} private quadratic key does not fit the independently solved three-point coefficients: ${quadratic.expected} vs ${independentlySolved}`,
      );

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

    if (familyHasOnlyNonzeroX) nonzeroXFamilies += 1;
  }

  assert.ok(generatedCount >= 200);
  assert.ok(nonzeroXFamilies >= 2, 'A2.4A must repeatedly require solving c rather than always reading it from x=0');
  assert.ok(coefficientSystemFamilies >= 2, 'A2.4A must repeatedly expose the three substitution equations for a, b, and c');
  assert.ok(errorRepairFamilies >= 1, 'A2.4A error analysis must repair the coefficient system and still finish the quadratic');
  assert.ok(representations.has('table'));
  assert.ok(representations.has('orderedPairs'));
  assert.ok(representations.has('graph'));
  assert.ok(representations.has('context'));
  assert.ok(representations.has('verbal'));
});

