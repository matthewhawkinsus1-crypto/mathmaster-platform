import assert from 'node:assert/strict';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';

const standard = 'A.3C';
const q = (prompt, studentActions, extra = {}) => ({ standard, prompt, studentActions, ...extra });
const intents = [
  q('Solve x + 2 = 5.', ['solveEquation'], { equation: 'x+2=5', answer: 3 }),
  q('Give the fraction.', ['fractionAnswer'], { answer: '3/4' }),
  q('Choose the number line.', ['chooseNumberLine'], { numberLineChoices: [{ id: 'a', points: [-2] }, { id: 'b', points: [2] }], answer: 'a' }),
  q('Graph x ≥ 2.', ['constructInterval','writeInterval'], { inequality: 'x >= 2', intervals: [{ min: 2, max: null, minClosed: true, maxClosed: false }] }),
  q('Read the graph.', ['readGraph'], { function: { family: 'linear', m: 2, b: 1 }, answer: 1 }),
  q('Graph the function.', ['constructGraph'], { function: { family: 'linear', m: 2, b: 1 } }),
  q('Investigate the function.', ['investigateFunction','analyzeDomain','analyzeRange'], { function: { family: 'quadratic', a: 1, h: 0, k: -4 } }),
  q('Analyze the graph.', ['analyzeDomain','analyzeRange','findVertex'], { function: { family: 'quadratic', a: 1, h: 0, k: -4 } }),
  q('Solve step by step.', ['solveStepByStep'], { equation: '3x+6=21' }),
  q('Solve for h.', ['solveLiteral'], { equation: 'A=bh', solveFor: 'h', answer: 'A/b' }),
  q('Solve the system.', ['solveSystem'], { equations: ['y=x','y=-x+2'], answer: { x: 1, y: 1 } }),
  q('Complete the table.', ['completeTable'], { table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [{ x: 0, y: null }], answers: { '0:y': 1 } } }),
  q('State the point.', ['stateOrderedPair'], { point: [2,3] }),
  q('Complete each part.', ['multipleResponses'], { responses: [{ id: 'a', label: 'Part A', answer: '2' }, { id: 'b', label: 'Part B', answer: '3' }] }),
  q('Identify the quantities.', ['identifyQuantities'], { scenario: 'Cost depends on tickets.', quantities: [{ id: 'tickets', label: 'Tickets' }, { id: 'cost', label: 'Cost' }], correctIndependentId: 'tickets', correctDependentId: 'cost' }),
  q('Match stories and graphs.', ['matchGraphsToStories'], { stories: [{ id: 's1', description: 'Increasing.' }, { id: 's2', description: 'Decreasing.' }], candidateGraphs: [{ id: 'g1', function: { family: 'linear', m: 1, b: 0 } }, { id: 'g2', function: { family: 'linear', m: -1, b: 4 } }], matches: { s1: 'g1', s2: 'g2' } }),
  q('Compare the graphs.', ['compareGraphs'], { candidateGraphs: [{ id: 'a', function: { family: 'linear', m: 1, b: 0 } }, { id: 'b', function: { family: 'linear', m: 2, b: 0 } }], comparisonFields: [{ id: 'f', label: 'Steeper', options: ['A','B'], answer: 'B' }] }),
  q('Write a story for the graph.', ['writeGraphStory'], { function: { family: 'linear', m: -1, b: 6 } }),
  q('Interpret the point.', ['interpretPointInContext'], { scenario: 'Distance depends on time.', point: [3,45], quantityChoices: { x: ['time'], y: ['distance'] }, function: { family: 'linear', m: 15, b: 0 } }),
  q('Build a mapping.', ['buildMapping','stateDomain','stateRange','classifyFunction'], { relation: [[1,2],[2,3]] }),
  q('Model the situation.', ['modelingLab'], { labDefinition: { scenario: 'Explore growth.', parameters: [{ id: 'r', label: 'Rate', min: 1, max: 3, step: 1 }], targets: [{ id: 't', prompt: 'Predict.' }] }, dok: 3 }),
  q('Analyze the data.', ['analyzeData'], { points: [[0,1],[1,3],[2,5]] }),
  q('Find the inverse.', ['findInverse'], { function: { family: 'linear', m: 2, b: 1 } }),
  q('Solve the system graphically.', ['graphSystem'], { system: { m1: 1, b1: 0, m2: -1, b2: 2 } }),
  q('Analyze parabola geometry.', ['analyzeParabolaGeometry'], { parabola: { h: 0, k: 0, p: 2, orientation: 'vertical' } }),
  q('Factor the polynomial.', ['factorPolynomial'], { polynomial: { coefficients: [1,-5,6] } }),
  q('Solve the inequality.', ['solveInequality'], { signChart: { mode: 'polynomial', factors: [-2,3], relation: '>=' } }),
  q('Analyze the sequence.', ['analyzeSequence','findSequenceTerm'], { sequence: { kind: 'arithmetic', first: 3, difference: 2 }, targetN: 7, displayCount: 5 }),
  q('Work with complex numbers.', ['complexOperations'], { complex: { mode: 'operations', z: { re: 1, im: 2 }, w: { re: 3, im: -1 }, operation: 'add' } }),
  q('Solve the exponential equation.', ['solveExponential'], { exponentialLog: { mode: 'solveExponential', equation: { base: 2, m: 1, c: 0, rhs: 8 } } }),
  q('Describe the transformation.', ['analyzeTransformations'], { transformation: { mode: 'identify', family: 'quadratic', function: { type: 'quadratic', a: 1, h: 2, k: -3 } } }),
  q('Connect the representations.', ['connectRepresentations'], { representations: { sets: [{ id: 'a', equation: 'y=x', table: '(0,0)', context: 'One-to-one.', graphSpec: { type: 'linear', a: 1, h: 0, k: 0 } }, { id: 'b', equation: 'y=x^2', table: '(0,0)', context: 'Quadratic.', graphSpec: { type: 'quadratic', a: 1, h: 0, k: 0 } }], targetId: 'a' } }),
  q('Construct the line.', ['constructLine'], { lineIntent: { m: 2, b: 1 } }),
  q('Use the interactive algebra workspace.', ['interactiveAlgebra'], { equationModel: { a: 3, b: 6, c: 21 } }),
];

const payload = { schemaVersion: 5, assignment: { title: 'Destination coverage', courseId: 'algebra1' }, sections: [{ role: 'practice', title: 'Practice', questions: intents }] };
const parsed = parseAssignmentBlueprintText(JSON.stringify(payload));
const types = parsed.questions.map((question) => question.type || question.toolId);
assert.equal(types.length, 34);
assert.equal(types[0], 'stepAlgebra', 'solveEquation should use the balance workspace, not the retired algebra answer box');
assert.equal(types[4], 'graphAnalysis', 'readGraph should use graph analysis, not the retired line-only graphing renderer');
assert.equal(new Set(types).size, 32, `expected 32 active destinations after retiring algebra + line-only graphing; got ${types.join(', ')}`);
assert.equal(types.filter((type) => type === 'stepAlgebra').length, 2);
assert.equal(types.filter((type) => type === 'graphAnalysis').length, 2);
validateAssignmentQuestions(parsed.questions);
console.log(`authoringIntentV5Destinations.test.mjs: ${types.length} intents across 32 active destinations passed`);
