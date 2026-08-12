import { buildAuthoringContract } from '../src/platform/contract/authoringContract.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../src/assignmentBlueprint.js';
import { validateQuestionsSemantics } from '../src/platform/contract/semanticValidation.js';

// This validator deliberately includes a RICH V5 question. A previous failure
// let V5 compile completeTable + constructGraph + range + continuity into one
// narrow legacy tool, then blamed the outside AI for the missing stages. Keep
// this sample here so that regression cannot return unnoticed.
const sample = {
  schemaVersion: 5,
  assignment: { title: 'Authoring Intent V5 validation', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  activities: [{
    role: 'classwork',
    title: 'Classwork',
    questions: [
      {
        standard: 'A.3C',
        prompt: 'Graph f(x) = 2x + 1.',
        studentActions: ['constructGraph'],
        function: { family: 'linear', m: 2, b: 1 },
      },
      {
        standard: 'A.12B',
        prompt: 'Complete the table, graph the discrete points, state the range, and classify the relationship.',
        studentActions: ['completeTable', 'constructGraph', 'analyzeRange', 'classifyContinuity'],
        function: { family: 'linear', m: 0.5, b: 1 },
        table: { columns: ['x', 'f(x)'], rows: [[-2, null], [0, null], [2, null], [4, null]] },
        answerModel: { range: '{0, 1, 2, 3}', continuity: 'discrete' },
      },
    ],
  }],
};

const parsed = parseAssignmentBlueprintText(JSON.stringify(sample));
validateAssignmentQuestions(parsed.questions);
const semantic = validateQuestionsSemantics(parsed.questions);
if (semantic.errors.length || semantic.warnings.length) {
  throw new Error(`V5 student-experience validation failed:\n${[...semantic.errors, ...semantic.warnings].join('\n')}`);
}

const rich = parsed.questions[1];
const kinds = rich?.workflow?.map((stage) => stage.kind) || [];
const expectedKinds = ['tableInput', 'coordinatePlot', 'rangeInput', 'classification'];
if (JSON.stringify(kinds) !== JSON.stringify(expectedKinds)) {
  throw new Error(`V5 composition regressed: expected ${expectedKinds.join(' -> ')}, got ${kinds.join(' -> ') || '(none)'}.`);
}
if (rich?.tableAnswers?.['0:y'] !== 0 || rich?.tableAnswers?.['3:y'] !== 3) {
  throw new Error('V5 compiler did not derive the table key from the supplied function.');
}

const contract = buildAuthoringContract({ courseId: 'algebra1' });
if (!contract.includes('Authoring Intent V5')) throw new Error('Teacher-facing contract is not V5.');
if (!contract.includes('KEEP schemaVersion 5')) throw new Error('V5 contract does not protect repairs from falling back to V4.');

console.log(`Authoring Intent V5: PASS (${parsed.questions.length} sample questions; rich workflow ${kinds.join(' -> ')}; contract ${contract.length} chars)`);
