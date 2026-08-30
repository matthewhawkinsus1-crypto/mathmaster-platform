import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_TOOL_IDS,
  buildPrivateToolGrading,
  buildPublicToolPayload,
  getPathToolContract,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';

const linearSystemQuestion = {
  type: 'systemsWorkspace',
  mode: 'linear',
  prompt: 'Solve the system.',
  system: { m1: 2, b1: 1, m2: -1, b2: 7 },
};

const inequalitySystemQuestion = {
  type: 'systemsWorkspace',
  mode: 'inequalities',
  prompt: 'Use the graph to identify a feasible point.',
  inequalities: [
    { m: 1, b: 1, relation: '>=' },
    { m: -0.5, b: 6, relation: '<=' },
  ],
  testPoint: { x: 2, y: 4 },
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
};

const dataModelingQuestion = {
  // Authoring may use the semantic alias; the Path contract resolves it to the
  // registry's canonical dataModelingLab id.
  type: 'dataModeling',
  prompt: 'Calculate and interpret the correlation coefficient.',
  mode: 'correlation',
  points: [[1, 3], [2, 5], [3, 7], [4, 9]],
  correlationTolerance: 0.02,
  answer: 'must-not-leak',
};

test('Path Tool Adapter V2 makes the proved Algebra I modes securely eligible', () => {
  assert.ok(PATH_TOOL_IDS.includes('systemsWorkspace'));
  assert.ok(PATH_TOOL_IDS.includes('dataModelingLab'));
  assert.ok(getPathToolContract('systemsWorkspace'));
  assert.ok(getPathToolContract('dataModeling'));
  assert.equal(isPathEligible(linearSystemQuestion), true);
  assert.equal(isPathEligible(inequalitySystemQuestion), true);
  assert.equal(isPathEligible(dataModelingQuestion), true);
});

test('systems inequality work is graded from the server-held definition', () => {
  const privateGrading = buildPrivateToolGrading(inequalitySystemQuestion);
  const correct = gradePathResponse({
    privateGrading,
    raw: { testChoice: 'yes', candidate: { x: 2, y: 4 }, isCorrect: false, score: 0 },
  });
  assert.equal(correct.rejected, false);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 1);

  const forged = gradePathResponse({
    privateGrading,
    raw: { testChoice: 'yes', candidate: { x: -6, y: 10 }, isCorrect: true, score: 1 },
  });
  assert.equal(forged.isCorrect, false);
  assert.equal(forged.score, 0.5);
});

test('correlation mode requires the student to supply r and its interpretation', () => {
  const privateGrading = buildPrivateToolGrading(dataModelingQuestion);
  const correct = gradePathResponse({
    privateGrading,
    raw: {
      r: 1,
      direction: 'positive',
      strength: 'strong',
      causation: 'association',
      isCorrect: false,
      score: 0,
    },
  });
  assert.equal(correct.rejected, false);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 1);

  const interpretationOnly = gradePathResponse({
    privateGrading,
    raw: {
      direction: 'positive',
      strength: 'strong',
      causation: 'association',
      isCorrect: true,
      score: 1,
    },
  });
  assert.equal(interpretationOnly.isCorrect, false);
  assert.equal(interpretationOnly.score, 0.5);
});

test('the new public payloads expose the task but not the private answer data', () => {
  const inequality = buildPublicToolPayload(inequalitySystemQuestion);
  assert.equal(inequality.pathToolId, 'systemsWorkspace');
  assert.deepEqual(inequality.tool.inequalities, inequalitySystemQuestion.inequalities);
  assert.equal('expectedTestPoint' in inequality.tool, false);

  const modeling = buildPublicToolPayload(dataModelingQuestion);
  assert.equal(modeling.pathToolId, 'dataModelingLab');
  assert.equal(modeling.tool.mode, 'correlation');
  assert.deepEqual(modeling.tool.points, dataModelingQuestion.points);
  const serialized = JSON.stringify(modeling);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal(serialized.includes('correlationTolerance'), false);
  assert.equal(serialized.includes('"r"'), false);
});
