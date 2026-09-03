import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { canonicalizeFunctionExpression } from '../../src/platform/workflow/modelExpression.js';
import resolveReferenceInfo from '../../src/referenceInfo.js';
import {
  normalizeBuilderModel,
  scoreConstraintModel,
} from '../../src/tools/constraintFunctionBuilder/constraintFunctionMath.js';
import {
  choiceSeed,
  stableShuffleChoices,
  strengthenTwoChoiceSet,
} from '../../src/platform/interaction/choiceOptions.js';

test('finite choices are strengthened and keep a stable shuffled order', () => {
  const strengthened = strengthenTwoChoiceSet(['discrete', 'continuous']);
  assert.equal(strengthened.length, 4);
  assert.ok(strengthened.includes('both discrete and continuous'));
  assert.ok(strengthened.includes('neither discrete nor continuous'));

  const first = stableShuffleChoices(strengthened, choiceSeed('question-1', 'continuity'));
  const second = stableShuffleChoices(strengthened, choiceSeed('question-1', 'continuity'));
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, strengthened, 'runtime should not preserve authored answer order');
});

test('three authored choices become four so three attempts cannot guarantee a correct guess', () => {
  const strengthened = strengthenTwoChoiceSet(['A', 'B', 'C']);
  assert.equal(strengthened.length, 4);
  assert.ok(strengthened.includes('None of these'));
});

test('Algebra I contextual domain and range preserve words plus inequality notation', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Algebra I domain range',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [{
        standard: 'A.2A',
        prompt: 'A ride lasts 3 minutes and reaches 75 miles per hour. Identify the domain and range in words and using inequalities.',
        scenario: 'A ride lasts 3 minutes and reaches 75 miles per hour.',
        studentActions: ['identifyQuantities', 'stateDomain', 'stateRange'],
        quantities: [
          { id: 'time', label: 'Time (minutes)' },
          { id: 'speed', label: 'Speed (miles per hour)' },
        ],
        correctIndependentId: 'time',
        correctDependentId: 'speed',
        responses: [
          { id: 'domainWords', label: 'Domain in words', acceptedAnswers: ['time from 0 through 3 minutes'] },
          { id: 'domainInequalities', label: 'Domain using inequalities', acceptedAnswers: ['0 ≤ x ≤ 3'] },
          { id: 'rangeWords', label: 'Range in words', acceptedAnswers: ['speed from 0 through 75 miles per hour'] },
          { id: 'rangeInequalities', label: 'Range using inequalities', acceptedAnswers: ['0 ≤ y ≤ 75'] },
        ],
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'relationshipModel');
  assert.equal(question.notation, 'inequality');
  assert.deepEqual(question.recipe.ask, [
    'quantities',
    'domainInequality',
    'domainWords',
    'rangeInequality',
    'rangeWords',
  ]);

  const composed = readComposedQuestion(question);
  assert.deepEqual(composed.workflow.map((stage) => stage.kind), [
    'quantityRoles',
    'domainInput',
    'shortResponse',
    'rangeInput',
    'shortResponse',
  ]);
  assert.equal(composed.workflow.find((stage) => stage.id === 'domainInequality').notation, 'inequality');
  assert.equal(composed.workflow.find((stage) => stage.id === 'rangeInequality').notation, 'inequality');
  assert.deepEqual(composed.grading.domainInequality, ['0 ≤ x ≤ 3']);
  assert.deepEqual(composed.grading.rangeInequality, ['0 ≤ y ≤ 75']);
});

test('identifyQuantities cannot compile into an empty independent/dependent interaction', () => {
  assert.throws(
    () => compileAuthoringIntentV5({
      schemaVersion: 5,
      assignment: {
        title: 'Broken quantity-role task',
        courseId: 'algebra1',
        instructionalPurpose: 'review',
        gradingPurpose: 'classwork',
      },
      sections: [{
        role: 'classwork',
        title: 'Classwork',
        questions: [{
          standard: 'A.2A',
          prompt: 'A school bus can carry at most 48 students. Identify the input and output.',
          studentActions: ['identifyQuantities', 'classifyContinuity'],
          scenario: 'A school bus can carry at most 48 students.',
          relationshipType: 'discrete',
        }],
      }],
    }),
    /fewer than two selectable quantities/i,
  );
});

test('modeling equations accept V(t) and V as equivalent dependent-variable notation', () => {
  assert.equal(
    canonicalizeFunctionExpression('V = 12t'),
    canonicalizeFunctionExpression('V(t) = 12t'),
  );

  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Function notation keypad',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A.3C',
        prompt: 'Natalia fills a tub at 12 gallons per minute. Let t represent time in minutes and V represent the amount of water added in gallons. Write an equation for V in terms of t, complete the table, graph the relationship, and state the domain and range.',
        studentActions: ['writeEquation', 'completeTable', 'constructGraph', 'stateDomain', 'stateRange'],
        function: { family: 'linear', m: 12, b: 0, domain: { min: 0, max: 4, minClosed: true, maxClosed: true } },
        table: {
          columns: [{ key: 't', label: 't' }, { key: 'V', label: 'V(t)' }],
          rows: [{ t: 0 }, { t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }],
        },
        answerModel: {
          equation: 'V = 12t',
          domain: '0 ≤ t ≤ 4',
          range: '0 ≤ V ≤ 48',
        },
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  const composed = readComposedQuestion(question);
  const equationStage = composed.workflow.find((stage) => stage.kind === 'equationInput');
  assert.deepEqual(equationStage.functionNotationKeys, [{
    label: 'V(t)',
    command: 'V(t)',
    ariaLabel: 'Insert V of t',
  }]);
});

test('candidate graph questions retain the actual graph choices', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Graph choice',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [{
        standard: 'A.7A',
        prompt: 'Choose the candidate representation that matches f(x) = −x² + 3x.',
        studentActions: ['multipleResponses'],
        candidateGraphs: [
          { id: 'A', function: { family: 'linear', m: 2, b: -1 } },
          { id: 'B', function: { family: 'exponential', base: 2 } },
          { id: 'C', function: { family: 'quadratic', a: -1, h: 1.5, k: 2.25 } },
        ],
        responses: [{
          id: 'selectedGraph',
          label: 'Which candidate matches f(x) = −x² + 3x?',
          options: ['A', 'B', 'C'],
          answer: 'C',
        }],
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'multiAnswer');
  assert.equal(question.candidateGraphs.length, 3);
  assert.deepEqual(question.candidateGraphs.map((candidate) => candidate.id), ['A', 'B', 'C']);
  assert.ok(question.candidateGraphs.every((candidate) => candidate.graph));
  assert.ok(question.candidateGraphs.every((candidate) => !Object.hasOwn(candidate, 'label')), 'missing optional labels must not become Firestore-unsafe undefined fields');
});

test('solveEquation infers the actual single variable instead of defaulting to x', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Solve y',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      role: 'warmup',
      title: 'Warm-Up',
      questions: [{
        standard: 'A.5A',
        prompt: 'Solve the equation 8y + 13 = 29 − 3y.',
        studentActions: ['solveEquation'],
        equation: '8y + 13 = 29 - 3y',
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.solveFor, 'y');
});

test('readGraph with a continuous function stays a graph instead of becoming a mapping diagram', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Continuous exponential',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A.9D',
        prompt: 'Use the displayed graph of f(x)=2^x. Classify the family, behavior, and continuity.',
        studentActions: ['readGraph', 'classifyFunction', 'analyzeIncreasing', 'classifyContinuity'],
        function: { family: 'exponential', base: 2 },
        pairs: [{ x: -1, y: 0.5 }, { x: 0, y: 1 }, { x: 1, y: 2 }],
        responses: [
          { id: 'family', label: 'Family', options: ['linear', 'quadratic', 'exponential', 'absolute value'], answer: 'exponential' },
          { id: 'behavior', label: 'Behavior', options: ['increasing', 'decreasing', 'constant', 'both'], answer: 'increasing' },
          { id: 'continuity', label: 'Continuity', options: ['discrete', 'continuous', 'both', 'cannot be determined'], answer: 'continuous' },
        ],
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'multiAnswer');
  assert.ok(question.graph?.functions?.length, 'the displayed function must compile to a graph');
  assert.equal(question.type === 'relationMapping', false);
});

test('quadrant-only builder prompts do not hide one exact vertex', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Builder quadrant',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [{
        standard: 'A.7A',
        prompt: 'Create a continuous linear absolute value function with a minimum in Quadrant IV.',
        studentActions: ['buildFunctionFromConstraints'],
        allowedFamilies: ['absolute'],
        constraints: [
          { kind: 'family', value: 'absolute' },
          { kind: 'continuity', value: 'continuous' },
          { kind: 'extremum', value: 'minimum' },
          { kind: 'vertex', value: { x: 4, y: -3 } },
          { kind: 'isFunction', value: true },
        ],
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  const quadrant = question.constraints.find((constraint) => constraint.kind === 'vertexQuadrant');
  assert.ok(quadrant);
  assert.equal(quadrant.value, 'IV');
  assert.equal(question.constraints.some((constraint) => constraint.kind === 'vertex'), false);

  const untouchedDefault = normalizeBuilderModel({ family: 'absolute', a: 0, h: 0, k: 0 });
  assert.equal(scoreConstraintModel(untouchedDefault, question.constraints).isCorrect, false);
});

test('a repeated string reference card is suppressed when the sticky task already contains it', () => {
  const info = resolveReferenceInfo({
    prompt: 'A roller coaster ride lasts 3 minutes and reaches a maximum speed of 75 miles per hour. Identify the domain and range.',
    referenceInfo: 'A roller coaster ride lasts 3 minutes and reaches a maximum speed of 75 miles per hour.',
  });
  assert.equal(info, null);
});

test('V5 uses the balance solver, faithful graph reading, and complete relation analysis', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Tool fidelity regression',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [
        {
          standard: 'A.5A',
          prompt: 'Solve the equation 8y + 13 = 29 − 3y.',
          studentActions: ['solveEquation'],
          equation: '8y + 13 = 29 - 3y',
        },
        {
          standard: 'A.6A',
          prompt: 'The graph has closed endpoints at (0, 2) and (4, 2) and a highest point at (2, 6). Write the domain and range in words and using inequalities.',
          studentActions: ['readGraph', 'stateDomain', 'stateRange'],
          function: {
            family: 'quadratic',
            a: -1,
            h: 2,
            k: 6,
            domain: { min: 0, max: 4, minClosed: true, maxClosed: true },
          },
          responses: [
            { id: 'domainWords', label: 'Domain in words', answer: 'all real numbers from 0 through 4', type: 'text' },
            { id: 'domainInequality', label: 'Domain using inequalities', answer: '0 ≤ x ≤ 4' },
            { id: 'rangeWords', label: 'Range in words', answer: 'all real numbers from 2 through 6', type: 'text' },
            { id: 'rangeInequality', label: 'Range using inequalities', answer: '2 ≤ y ≤ 6' },
          ],
        },
        {
          standard: 'A.7A',
          prompt: 'Plot the relation. Then classify its family, behavior, and continuity.',
          studentActions: ['plotRelation', 'classifyFunction', 'analyzeIncreasing', 'analyzeDecreasing', 'classifyContinuity'],
          relation: [
            { x: -2, y: 1 },
            { x: -1, y: -2 },
            { x: 0, y: -3 },
            { x: 1, y: -2 },
            { x: 2, y: 1 },
          ],
          responses: [
            { id: 'family', label: 'Function family', type: 'choice', options: ['linear', 'quadratic', 'exponential'], answer: 'quadratic' },
            { id: 'behavior', label: 'Behavior', type: 'choice', options: ['increasing', 'decreasing', 'both increasing and decreasing'], answer: 'both increasing and decreasing' },
            { id: 'continuity', label: 'Discrete or continuous', type: 'choice', options: ['discrete', 'continuous'], answer: 'discrete' },
          ],
        },
      ],
    }],
  });

  const [solve, graphRead, relation] = compiled.package.sections[0].questions;

  assert.equal(solve.type, 'stepAlgebra');
  assert.equal(solve.equation, '8y + 13 = 29 - 3y');

  assert.equal(graphRead.type, 'multiAnswer');
  assert.equal(graphRead.answerFields.length, 4);
  assert.deepEqual(graphRead.answerFields.map((field) => field.id), [
    'domainInequality', 'domainWords', 'rangeInequality', 'rangeWords',
  ]);
  assert.equal(graphRead.graph.functions[0].type, 'quadratic');
  assert.deepEqual(graphRead.graph.functions[0].domain, {
    min: 0,
    max: 4,
    minClosed: true,
    maxClosed: true,
  });
  assert.equal(graphRead.equationLatex, undefined);

  assert.equal(relation.type, 'relationMapping');
  assert.ok(relation.ask.includes('plot'));
  assert.ok(relation.ask.includes('mapping'));
  assert.equal(relation.ask.includes('isFunction'), false, 'authored response fields own the requested classifications');
  assert.equal(relation.answerFields.length, 3);
  assert.equal(relation.plotEntryMode, 'manual');
});

test('student-facing renderers contain the fidelity safeguards', async () => {
  const [engine, graph, relation, workflow, mathInput, interactiveGraph, enlargeable, appCss] = await Promise.all([
    readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/GraphDisplay.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/InteractiveGraphWorkspace.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/common/EnlargeableFigure.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/App.css', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(engine, /import EquationGrader/);
  assert.match(engine, /Retired legacy answer-box solver/);
  assert.match(graph, /restrictedFunctionEndpoints/);
  assert.match(graph, /marker: boundary\.closed \? 'closed' : 'open'/);
  assert.match(graph, /continuationFunctionEndpoints/);
  assert.match(graph, /marker: 'arrow'/);
  assert.match(relation, /Move the pointer over the grid to see the exact coordinate/);
  assert.match(relation, /allowTypedPlot \?/);
  assert.match(relation, /analysisFields\.map/);
  assert.match(relation, /every input has exactly one output/);
  assert.match(workflow, /Your checked graph/);
  assert.match(workflow, /checkedGraphReference/);
  assert.match(workflow, /missing the quantity choices needed to identify the input and output/);
  assert.match(mathInput, /functionNotationKeys/);
  assert.match(graph, /formatGraphEquationLatex/, 'static enlarged graphs should display the graphed equation');
  assert.match(interactiveGraph, /graphEquationLatex[\s\S]*formatGraphEquationLatex/, 'interactive enlarged graphs should derive their equation from the function spec');
  assert.match(interactiveGraph, /mathmaster-domain-range-only/, 'domain-range analysis should expose the compact enlarged layout hook');
  assert.match(enlargeable, /data-enlarged=/, 'enlarged graph state should be available to responsive CSS');
  assert.match(appCss, /mathmaster-analysis-part-domain[\s\S]*grid-column:\s*1/);
  assert.match(appCss, /mathmaster-analysis-part-range[\s\S]*grid-column:\s*3/);
});
