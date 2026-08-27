import { buildAuthoringContract } from '../src/platform/contract/authoringContract.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../src/assignmentBlueprint.js';
import { validateQuestionsSemantics } from '../src/platform/contract/semanticValidation.js';

const sample = {
  schemaVersion: 5,
  assignment: {
    title: 'MathMaster Assignment V5 validation',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized' },
  },
  outputProfiles: {
    digital: { enabled: true },
    studentWorksheetPdf: { enabled: true, includeWorkspace: true },
    lessonNotesPdf: {
      enabled: true,
      targetPages: 2,
      learningGoal: 'Connect tables, graphs, and function behavior.',
      sections: [{ heading: 'Key Idea', bullets: ['A function can be represented in multiple connected ways.'] }],
    },
  },
  sections: [{
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
if (parsed.schemaVersion !== 5 || parsed.bundleSource?.schemaVersion !== 5) {
  throw new Error('Assignment V5 was downgraded or lost during intake.');
}
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
if (!contract.includes('MathMaster Assignment V5')) throw new Error('Teacher-facing contract is not canonical V5.');
if (!contract.includes('sections')) throw new Error('V5 contract does not require sections[].');
if (/internal V4|output V4/i.test(contract)) throw new Error('V5 contract still advertises V4 compatibility.');

let v4Rejected = false;
try {
  parseAssignmentBlueprintText(JSON.stringify({ schemaVersion: 4, assignment: { title: 'old', courseId: 'algebra1' }, questions: [] }));
} catch (error) {
  v4Rejected = /V5 is the only supported assignment format/.test(String(error?.message || error));
}
if (!v4Rejected) throw new Error('V4 assignment input is no longer supposed to be accepted.');

console.log(`MathMaster Assignment V5: PASS (${parsed.questions.length} sample questions; workflow ${kinds.join(' -> ')}; contract ${contract.length} chars)`);
