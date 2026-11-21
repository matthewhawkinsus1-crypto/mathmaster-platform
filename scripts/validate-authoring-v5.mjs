import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuthoringContract } from '../src/platform/contract/authoringContract.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../src/assignmentBlueprint.js';
import { validateQuestionsSemantics } from '../src/platform/contract/semanticValidation.js';
import { buildAssignmentV5PreflightModel } from '../src/platform/preflight/assignmentV5PreflightModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * An author's own file: `npm run validate:authoring-v5 -- my-lesson.json`.
 * It is compiled as the Assignment Creator compiles it and judged by the
 * compiler, the question validator and Pre-Flight; errors fail the run and
 * warnings are listed. (docs/assignments/AUTHORING_LEARNING_SUPPORTS.md)
 */
const authorFiles = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (authorFiles.length) {
  let failed = 0;
  authorFiles.forEach((file) => {
    let errors = [];
    let warnings = [];
    try {
      const parsed = parseAssignmentBlueprintText(readFileSync(path.resolve(file), 'utf8'));
      validateAssignmentQuestions(parsed.questions);
      const semantic = validateQuestionsSemantics(parsed.questions);
      const preflight = buildAssignmentV5PreflightModel(parsed.assignmentV5);
      errors = [...new Set([...semantic.errors, ...preflight.errors])];
      warnings = [...new Set([...parsed.warnings, ...semantic.warnings, ...preflight.warnings])];
    } catch (error) {
      errors = [String(error?.message || error)];
    }
    if (errors.length) failed += 1;
    console.log(`${errors.length ? 'FAIL' : 'PASS'} ${file}`);
    errors.forEach((error) => console.log(`  error: ${error}`));
    warnings.forEach((warning) => console.log(`  warning: ${warning}`));
  });
  process.exit(failed ? 1 : 0);
}

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
        prompt: 'Complete the table, graph the points, state the range, and classify the relationship.',
        studentActions: ['completeTable', 'constructGraph', 'analyzeRange', 'classifyContinuity'],
        function: { family: 'linear', m: 0.5, b: 1 },
        table: { columns: ['x', 'f(x)'], rows: [[-2, null], [0, null], [2, null], [4, null]] },
        answerModel: { range: '{0, 1, 2, 3}', continuity: 'discrete' },
      },
    ],
  }],
};

const parsed = parseAssignmentBlueprintText(JSON.stringify(sample));
if (parsed.assignmentV5?.schemaVersion !== 5) {
  throw new Error('Assignment V5 was downgraded or lost during intake.');
}
validateAssignmentQuestions(parsed.questions);
const semantic = validateQuestionsSemantics(parsed.questions);
if (semantic.errors.length || semantic.warnings.length) {
  throw new Error(`V5 student-experience validation failed:\n${[...semantic.errors, ...semantic.warnings].join('\n')}`);
}

const rich = parsed.questions[1];
const kinds = rich?.workflow?.map((stage) => stage.kind) || [];
// Continuity is a student decision that changes how range must be entered. The
// compiler therefore keeps one conditional range stage for the discrete branch
// and one for the continuous branch; only the branch matching the student's
// classification is presented at runtime.
const expectedKinds = ['tableInput', 'classification', 'functionGraph', 'rangeInput', 'rangeInput'];
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

// Learning supports (AG-1): the guide's example lesson is accepted with every
// field carried through, and an example on a DOL question is refused.
const fragmentText = readFileSync(path.join(ROOT, 'tests/platform/fixtures/learningSupportsLessonFragment.json'), 'utf8');
const fragment = parseAssignmentBlueprintText(fragmentText);
const fragmentSemantic = validateQuestionsSemantics(fragment.questions);
const fragmentPreflight = buildAssignmentV5PreflightModel(fragment.assignmentV5);
if (fragmentSemantic.errors.length || fragmentPreflight.errors.length) {
  throw new Error(`The learning-supports example lesson was refused:\n${[...fragmentSemantic.errors, ...fragmentPreflight.errors].join('\n')}`);
}
if (!fragment.assignmentV5.lessonSupports?.examples?.length || !fragment.questions.some((question) => question.example)) {
  throw new Error('V5 compiler dropped lessonSupports or a question\'s example.');
}
const onDol = JSON.parse(fragmentText);
onDol.sections.find((section) => section.role === 'dol').questions[0].example = 'ex-both-sides';
let dolExampleRefused = false;
try {
  parseAssignmentBlueprintText(JSON.stringify(onDol));
} catch (error) {
  dolExampleRefused = /Examples are never shown on a DOL, quiz or test/.test(String(error?.message || error));
}
if (!dolExampleRefused) throw new Error('An example on a DOL question is supposed to be refused.');

console.log(`MathMaster Assignment V5: PASS (${parsed.questions.length} sample questions; workflow ${kinds.join(' -> ')}; contract ${contract.length} chars; learning supports: ${fragment.questions.length}-question example lesson accepted, an example on DOL refused)`);
