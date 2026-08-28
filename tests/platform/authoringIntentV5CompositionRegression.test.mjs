import assert from 'node:assert/strict';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { validateQuestionsSemantics } from '../../src/platform/contract/semanticValidation.js';
import { buildFixRequest } from '../../src/platform/contract/authoringContract.js';

const payload = {
  schemaVersion: 5,
  assignment: {
    title: 'Attributes and Relations of Functions',
    courseId: 'algebra1',
    assignmentType: 'notesClasswork',
    folder: 'Algebra I/Module 1/Functions',
  },
  sections: [
    {
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        {
          standard: 'A.2A',
          prompt: 'Convert the bounded inequality -3 ≤ x < 5 into interval notation and select the corresponding graph on the number line.',
          studentActions: ['writeInterval', 'chooseNumberLine'],
          inequality: '-3 ≤ x < 5',
          intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
          responses: [{ id: 'interval', label: 'Interval Notation', answer: '[-3, 5)' }],
        },
        {
          standard: 'A.2A',
          prompt: 'Write the unbounded compound inequality x ≤ -4 or x > 2 in interval notation.',
          studentActions: ['writeInterval'],
          inequality: 'x ≤ -4 or x > 2',
          intervals: [
            { min: null, max: -4, minClosed: false, maxClosed: true },
            { min: 2, max: null, minClosed: false, maxClosed: false },
          ],
          responses: [{ id: 'interval', label: 'Interval Notation', answer: '(-∞, -4] ∪ (2, ∞)' }],
        },
      ],
    },
    {
      role: 'classwork',
      title: 'Classwork',
      questions: [
        {
          standard: 'A.2A',
          prompt: 'Analyze the given graph to determine its domain and range in interval notation.',
          studentActions: ['readGraph', 'analyzeDomain', 'analyzeRange'],
          function: { family: 'quadratic', a: -0.5, h: 1.5, k: 6 },
          // Common V5 authoring shape: the restriction is mathematical intent,
          // not a renderer viewport. The compiler should attach it to the function.
          domain: { min: -2, max: 5, minClosed: true, maxClosed: false },
          // V4 plumbing accidentally added by a repair AI must not override
          // studentActions or poison compilation.
          analysisRequests: [{ id: 'wrong', kind: 'point', feature: 'vertex' }],
          graph: { family: 'quadratic' },
        },
        {
          standard: 'A.2A',
          prompt: 'For the function shown on the graph, determine the intervals where the function is increasing, decreasing, positive, and negative.',
          studentActions: ['readGraph', 'analyzeIncreasing', 'analyzeDecreasing', 'analyzePositive', 'analyzeNegative'],
          function: { family: 'quadratic', a: 1, h: 2.5, k: -1 },
          // V5 may contain prose response keys from an outside AI, but graph
          // analysis is derived from the function rather than trusting them.
          responses: [
            { id: 'positive', answer: '(wrong interval)' },
            { id: 'negative', answer: '(wrong interval)' },
          ],
        },
        {
          standard: 'A.12A',
          prompt: 'Given the relation {(-2, 3), (1, 2), (3, -1), (-4, -3)}, identify the domain and range, construct a mapping diagram, plot the points on a coordinate plane, and classify whether the relation is a function.',
          studentActions: ['analyzeDomain', 'analyzeRange', 'buildMapping', 'plotRelation', 'classifyFunction'],
          relation: [[-2, 3], [1, 2], [3, -1], [-4, -3]],
        },
        {
          standard: 'A.12B',
          prompt: 'For the function f(x) = 0.5x + 1 with discrete domain {-2, 0, 2, 4}, complete the table of values, graph the points, state the range, and classify the function as discrete or continuous.',
          studentActions: ['completeTable', 'constructGraph', 'analyzeRange', 'classifyContinuity'],
          function: { family: 'linear', m: 0.5, b: 1 },
          table: {
            columns: ['x', 'f(x)'],
            rows: [[-2, null], [0, null], [2, null], [4, null]],
            // Deliberately wrong authored key: the given function is the mathematical source of truth.
            answers: [99, 99, 99, 99],
          },
          answerModel: { range: '{0, 1, 2, 3}', continuity: 'discrete' },
        },
        {
          // A repair AI adding an internal renderer type must not bypass V5 compilation.
          type: 'graphing',
          standard: 'A.2A',
          prompt: 'Graph the function f(x) = 0.5x + 1 for the domain x ≥ -3. Complete the table, graph the continuous ray, state the range in interval notation, and classify the function continuity.',
          studentActions: ['completeTable', 'constructGraph', 'stateRange', 'classifyContinuity'],
          function: { family: 'linear', m: 0.5, b: 1, domain: { min: -3 } },
          table: {
            columns: ['x', 'f(x)'],
            rows: [[-3, null], [-1, null], [1, null], [3, null]],
            // Deliberately omitted: MathMaster can derive this key from the function.
          },
          answerModel: { range: '[-0.5, ∞)', continuity: 'continuous' },
        },
      ],
    },
    {
      role: 'practice',
      title: 'Practice',
      questions: [
        {
          standard: 'A.2A',
          prompt: 'Build a model for the situation from quantities through the graph, state the domain and range, and determine whether the function is discrete or continuous.',
          scenario: 'A student group is selling chocolate bars for $2 each.',
          studentActions: ['identifyQuantities', 'writeEquation', 'completeTable', 'constructGraph', 'stateDomain', 'stateRange', 'classifyContinuity'],
          quantities: [{ id: 'bars', label: 'Chocolate Bars Sold' }, { id: 'money', label: 'Money Collected' }],
          correctIndependentId: 'bars',
          correctDependentId: 'money',
          answerModel: {
            equation: 'f(x)=2x',
            tableXValues: [0, 1, 2, 3],
            domain: '{0, 1, 2, ...}',
            range: '{0, 2, 4, ...}',
            continuity: 'discrete',
          },
        },
        {
          standard: 'A.2A',
          prompt: 'Build a model for the situation from quantities through the graph, state the domain and range, and determine whether the function is discrete or continuous.',
          scenario: 'A low-flow shower head releases 1.8 gallons of water per minute.',
          studentActions: ['identifyQuantities', 'writeEquation', 'completeTable', 'constructGraph', 'stateDomain', 'stateRange', 'classifyContinuity'],
          quantities: [{ id: 'time', label: 'Time' }, { id: 'volume', label: 'Volume of Water' }],
          correctIndependentId: 'time',
          correctDependentId: 'volume',
          answerModel: {
            equation: 'V(x)=1.8x',
            tableXValues: [0, 0.5, 2.5, 5],
            domain: 'x ≥ 0',
            range: 'V ≥ 0',
            continuity: 'continuous',
          },
        },
      ],
    },
  ],
};

const parsed = parseAssignmentBlueprintText(JSON.stringify(payload));
assert.equal(parsed.sourceSchemaVersion, 5);
assert.equal(parsed.assignmentV5.schemaVersion, 5);
assert.equal(parsed.questions.length, 9);
validateAssignmentQuestions(parsed.questions);

const semantic = validateQuestionsSemantics(parsed.questions);
assert.deepEqual(semantic.errors, [], semantic.errors.join('\n'));
assert.deepEqual(semantic.warnings, [], semantic.warnings.join('\n'));

const [boundedInterval, unboundedInterval, graphDomainRange, graphBehavior, relation, discrete, continuous, chocolate, shower] = parsed.questions;
assert.equal(boundedInterval.type, 'intervalNumberLine');
assert.equal(unboundedInterval.type, 'intervalNumberLine');
assert.equal(graphDomainRange.type, 'graphAnalysis');
assert.equal(graphDomainRange.functionSpec.type, 'quadratic');
assert.equal(graphDomainRange.functionSpec.domain.min, -2, 'structured V5 domain intent should restrict the compiled function');
assert.ok(!graphDomainRange.graph, 'renderer graph plumbing should not survive V5 graph-analysis compilation');
assert.deepEqual(graphDomainRange.analysisRequests.map((request) => request.kind), ['domain', 'range']);
assert.equal(graphBehavior.type, 'graphAnalysis');
assert.deepEqual(graphBehavior.analysisRequests.map((request) => request.kind), ['increasing', 'decreasing', 'positive', 'negative']);
assert.ok(!graphBehavior.responses, 'derived graph analysis must not trust an AI-authored answer key');

assert.equal(relation.type, 'relationMapping');
assert.deepEqual(relation.ask, ['mapping', 'plot', 'domain', 'range', 'isFunction']);

assert.equal(discrete.type, 'functionGraph');
assert.deepEqual(discrete.workflow.map((stage) => stage.kind), ['tableInput', 'classification', 'functionGraph', 'rangeInput']);
assert.equal(discrete.workflow[1].id, 'continuity');
assert.equal(discrete.workflow[2].graphMode, 'studentSelected');
assert.equal(discrete.workflow[2].continuityStageId, 'continuity');
assert.equal(discrete.grading.table.values['3:y'], 3);
assert.equal(discrete.tableAnswers['0:y'], 0, 'runtime table key must use the function-derived answer, not an AI-authored conflicting key');
assert.equal(discrete.grading.range, '{0, 1, 2, 3}');

assert.equal(continuous.type, 'functionGraph', 'stray renderer type hint must be ignored in V5');
assert.deepEqual(continuous.workflow.map((stage) => stage.kind), ['tableInput', 'classification', 'functionGraph', 'rangeInput']);
assert.equal(continuous.workflow[1].id, 'continuity');
assert.equal(continuous.workflow[2].graphMode, 'studentSelected');
assert.equal(continuous.grading.table.values['0:y'], -0.5, 'table key should be derived from the supplied function');
assert.equal(continuous.functionSpec.domain.min, -3);

assert.equal(chocolate.type, 'relationshipModel');
assert.equal(chocolate.recipe.name, 'functionModeling');
assert.equal(chocolate.notation, 'set');
assert.equal(shower.type, 'relationshipModel');
assert.equal(shower.notation, 'inequality', 'Algebra I contextual domain/range should use inequalities by default');

const axisPayload = {
  schemaVersion: 5,
  assignment: { title: 'Axis Workflow', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [{
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      standard: 'A.3C',
      prompt: 'Natalia fills a tub at 12 gallons per minute. Identify the quantities, label a physical graph, write the equation, complete the table, graph the relationship, state the domain and range, and classify continuity.',
      studentActions: ['identifyQuantities', 'configureAxes', 'writeEquation', 'completeTable', 'constructGraph', 'stateDomain', 'stateRange', 'classifyContinuity'],
      quantities: [
        { id: 'time', label: 'Time (minutes)' },
        { id: 'waterAdded', label: 'Amount of water added (gallons)' },
      ],
      correctIndependentId: 'time',
      correctDependentId: 'waterAdded',
      axisRequirements: {
        x: { label: 'Time', unit: 'minutes', countBy: 1 },
        y: { label: 'Amount of water added', unit: 'gallons', countBy: 12 },
      },
      function: { family: 'linear', m: 12, b: 0, domain: { min: 0, max: 4 } },
      table: {
        columns: [{ key: 't', label: 't' }, { key: 'V', label: 'V(t)' }],
        rows: [{ t: 0 }, { t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }],
      },
      answerModel: {
        equation: 'f(x)=12x',
        domain: '[0,4]',
        range: '[0,48]',
        continuity: 'continuous',
      },
    }],
  }],
};
const axisParsed = parseAssignmentBlueprintText(JSON.stringify(axisPayload));
validateAssignmentQuestions(axisParsed.questions);
const axisSemantic = validateQuestionsSemantics(axisParsed.questions);
assert.deepEqual(axisSemantic.errors, [], axisSemantic.errors.join('\n'));
const axisQuestion = axisParsed.questions[0];
assert.deepEqual(axisQuestion.workflow.map((stage) => stage.kind), [
  'quantityRoles', 'axisSetup', 'equationInput', 'tableInput',
  'functionGraph', 'domainInput', 'rangeInput', 'classification',
]);
const axisStage = axisQuestion.workflow.find((stage) => stage.kind === 'axisSetup');
assert.ok(axisStage.graph, 'axis labeling must render a physical graph');
assert.equal(axisStage.graph.xMin, 0);
assert.equal(axisStage.graph.xMax, 4);
assert.equal(axisStage.graph.yMin, 0);
assert.equal(axisStage.graph.yMax, 48);
assert.deepEqual(axisQuestion.grading.axes.xLabel, ['Time']);
assert.deepEqual(axisQuestion.grading.axes.yUnit, ['gallons']);

const fix = buildFixRequest({ rawJson: JSON.stringify(payload), errors: ['A genuine content field is missing.'], sourceSchemaVersion: 5 });
assert.match(fix, /MathMaster Assignment V5/);
assert.match(fix, /KEEP schemaVersion 5/);
assert.doesNotMatch(fix, /Valid question types:/);
assert.doesNotMatch(fix, /schemaVersion 4|Schema version is 4/);

console.log('authoringIntentV5CompositionRegression.test.mjs: all assertions passed');
