import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';

const v5 = {
  schemaVersion: 5,
  assignment: { title: 'V5 smoke', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [
    { role: 'classwork', questions: [
      {
        standard: 'A.3C', prompt: 'Graph f(x) = 2x + 1 for x ≥ 0.',
        studentActions: ['constructGraph'],
        function: { family: 'linear', m: 2, b: 1, domain: { min: 0 } },
      },
      {
        standard: 'A.12A', prompt: 'Build the mapping, state domain and range, and decide whether it is a function.',
        studentActions: ['buildMapping','stateDomain','stateRange','classifyFunction'],
        relation: [[-2,3],[1,2],[3,-1]],
      },
      {
        standard: 'A.3C', prompt: 'Build one model from the situation.',
        scenario: 'Water enters an empty container at 5 liters per minute.',
        studentActions: ['identifyQuantities','writeEquation','completeTable','constructGraph','stateDomain','stateRange','classifyContinuity'],
        quantities: [{ id: 'time', label: 'Time' }, { id: 'water', label: 'Water' }],
        correctIndependentId: 'time', correctDependentId: 'water',
        answerModel: { equation: 'W(t)=5t', tableXValues: [0,1,2,3], domain: 't>=0', range: 'W>=0', continuity: 'continuous' },
      },
      {
        standard: 'A.12C', prompt: 'Write both rules.',
        studentActions: ['writeRecursive','writeExplicit'],
        sequence: { kind: 'arithmetic', first: 7, difference: 4 }, displayCount: 5,
      },
      {
        standard: 'A.3C', prompt: 'Compare the graphs.',
        studentActions: ['compareGraphs'],
        candidateGraphs: [
          { id: 'a', label: 'Graph A', function: { family: 'linear', m: 1, b: 0 } },
          { id: 'b', label: 'Graph B', function: { family: 'linear', m: 2, b: 1 } },
        ],
        comparisonFields: [{ id: 'slope', label: 'Which is steeper?', options: ['Graph A','Graph B'], answer: 'Graph B' }],
      },
    ] },
  ],
};

const direct = compileAuthoringIntentV5(v5);
assert.equal(direct.package.schemaVersion, 5);
assert.deepEqual(direct.package.sections[0].questions.map((q) => q.type), ['functionGraph','relationMapping','relationshipModel','sequenceExplorer','graphComparison']);
assert.deepEqual(direct.package.sections[0].questions[2].recipe.ask, ['quantities','equation','table','graph','domain','range','continuity']);
assert.equal(direct.package.sections[0].questions[3].mode, 'ruleBridge');

const parsed = parseAssignmentBlueprintText(JSON.stringify(v5));
assert.equal(parsed.assignmentV5.schemaVersion, 5, 'V5 remains canonical through runtime validation');
assert.equal(parsed.questions.length, 5);
assert.deepEqual(parsed.questions[1].pairs, [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }]);
assert.equal(parsed.questions[0].alignments[0].code, 'A.3C');
validateAssignmentQuestions(parsed.questions);
assert.ok(parsed.repairs.some((r) => r.includes('canonical V5')));

console.log('authoringIntentV5.test.mjs: all assertions passed');
