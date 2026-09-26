/*
 * ISSUE #359, PART E — DAY 1 ASSIGNMENT ACCEPTANCE SCENARIO.
 *
 * The browser-level acceptance case named in the issue, compiled end to end
 * through the production V5 pipeline:
 *   - Warm-Up: 2×2 review.
 *   - Classwork: three-plane exploration + one full guided 3×3 elimination
 *     solve + return to the 3D model.
 *   - Practice: multiple valid 3×3 elimination routes, multipliers,
 *     modeling, and 3D connection.
 *   - DOL: independent 3×3 solve + geometry interpretation.
 *
 * The system 2x - y + 2z = 15, -x + y + z = 3, 3x - y + 2z = 18 has solution
 * (3, 1, 5) and must work algebraically and visually.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { resolveSystemsWorkspaceMode } from '../../src/tools/systemsWorkspace/systemsWorkspaceMode.js';
import { algebraicSystemDimension, normalizeAlgebraicSystemConfig, validateAlgebraicSystemAuthoring } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import { reductionAnswerKey, buildReductionSystem } from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import { analyzeSectionBalanceRigor } from '../../src/platform/quality/sectionBalanceRigor.js';

const DAY1_SYSTEM = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'];
const XYZ = ['x', 'y', 'z'];
const SOLUTION = { x: 3, y: 1, z: 5 };

const day1Lesson = () => ({
  schemaVersion: 5,
  assignment: {
    title: '3×3 Systems: Elimination and the Three-Plane Model',
    courseId: 'algebra2',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    {
      id: 'warmup',
      role: 'classwork',
      title: 'Warm-Up',
      questions: [{
        standard: 'A.3C',
        prompt: 'Review: solve the 2×2 system.',
        studentActions: ['solveSystem'],
        equations: ['x + y = 5', 'x - y = 1'],
        variables: ['x', 'y'],
        method: 'studentChoice',
      }],
    },
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [
        {
          standard: 'A2.3B',
          prompt: 'Explore the three planes for this system before solving it.',
          studentActions: ['connectRepresentations'],
          equations: DAY1_SYSTEM,
          variables: XYZ,
          spatialModel: { kind: 'threePlanes' },
        },
        {
          standard: 'A2.3B',
          prompt: 'Solve the system by elimination, showing every step.',
          studentActions: ['solveSystem'],
          method: 'elimination',
          equations: DAY1_SYSTEM,
          variables: XYZ,
          requireVerification: true,
        },
        {
          standard: 'A2.3B',
          prompt: 'Now return to the 3D model: does the ordered triple you found match what the model shows?',
          studentActions: ['connectRepresentations'],
          equations: DAY1_SYSTEM,
          variables: XYZ,
          spatialModel: { kind: 'threePlanes', allowSolutionReveal: true },
          answerFields: [{ id: 'match', label: 'Does the algebraic solution match the model?', answer: 'yes' }],
        },
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [
        {
          standard: 'A2.3B',
          prompt: 'Solve by elimination, using any valid pair of equations first.',
          studentActions: ['solveSystem'],
          method: 'elimination',
          equations: ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'],
          variables: XYZ,
        },
        {
          standard: 'A2.3B',
          prompt: 'Choose substitution or elimination to solve this system.',
          studentActions: ['solveSystem'],
          method: 'studentChoice',
          equations: ['x - y + z = 2', '2x + y - z = 5', 'x + 2y + z = 8'],
          variables: XYZ,
        },
        {
          standard: 'A2.3B',
          prompt: 'Set up and solve a 3-variable model from the scenario: three funds must add to $100, and two more relationships hold between them.',
          studentActions: ['solveSystem'],
          method: 'elimination',
          equations: ['a + b + c = 100', '2a - b = 10', 'a - c = -5'],
          variables: ['a', 'b', 'c'],
        },
        {
          standard: 'A2.3B',
          prompt: 'Connect this solved system back to its three-plane model.',
          studentActions: ['connectRepresentations'],
          equations: DAY1_SYSTEM,
          variables: XYZ,
          spatialModel: { kind: 'threePlanes' },
        },
      ],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [
        {
          standard: 'A2.3B',
          prompt: 'Independently solve the system, then interpret it geometrically.',
          studentActions: ['solveSystem'],
          method: 'studentChoice',
          equations: ['x + y + z = 12', 'x - y + z = 4', '2x + y - z = 7'],
          variables: XYZ,
          requireVerification: true,
        },
      ],
    },
  ],
});

let compiledSections;

test('the full Day 1 lesson compiles through the production V5 pipeline without manual renderer plumbing', () => {
  const compiled = compileAuthoringIntentV5(day1Lesson());
  compiledSections = compiled.package.sections;
  assert.equal(compiledSections.length, 4);
});

test('Warm-Up stays a plain 2×2 systemsWorkspace question', () => {
  const question = compiledSections[0].questions[0];
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(algebraicSystemDimension(question), 2);
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('Classwork Q1 is the three-plane exploration, not text-only or a card sort', () => {
  const question = compiledSections[1].questions[0];
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(resolveSystemsWorkspaceMode(question), 'spatial');
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('Classwork Q2 is the guided 3×3 elimination solve, algebraically correct with solution (3,1,5)', () => {
  const question = compiledSections[1].questions[1];
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(resolveSystemsWorkspaceMode(question), 'algebraic');
  assert.equal(algebraicSystemDimension(question), 3);
  const config = normalizeAlgebraicSystemConfig(question);
  assert.equal(config.method, 'elimination');
  const key = reductionAnswerKey(buildReductionSystem({ variables: config.variables, equations: config.equations }));
  assert.equal(key.type, 'unique');
  assert.deepEqual(key.solution, SOLUTION);
  assert.deepEqual(validateAlgebraicSystemAuthoring(question).errors, []);
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('Classwork Q3 returns to the 3D model and preserves its interpretation answerFields', () => {
  const question = compiledSections[1].questions[2];
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(resolveSystemsWorkspaceMode(question), 'spatial');
  assert.equal(question.spatialModel?.allowSolutionReveal, true);
  assert.ok(Array.isArray(question.answerFields) && question.answerFields.length === 1);
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('Practice offers multiple valid 3×3 elimination routes, a studentChoice question, modeling, and a 3D connection question', () => {
  const [elimination, choice, modeling, spatial] = compiledSections[2].questions;
  assert.equal(normalizeAlgebraicSystemConfig(elimination).method, 'elimination');
  assert.equal(algebraicSystemDimension(elimination), 3);
  assert.equal(validateToolQuestion(elimination).isValid, true);

  assert.equal(normalizeAlgebraicSystemConfig(choice).method, 'studentChoice');
  assert.equal(validateToolQuestion(choice).isValid, true);

  assert.equal(algebraicSystemDimension(modeling), 3);
  assert.deepEqual(modeling.variables, ['a', 'b', 'c']);
  assert.equal(validateToolQuestion(modeling).isValid, true);

  assert.equal(resolveSystemsWorkspaceMode(spatial), 'spatial');
  assert.equal(validateToolQuestion(spatial).isValid, true);
});

test('DOL is an independent 3×3 solve with studentChoice method and verification required', () => {
  const question = compiledSections[3].questions[0];
  assert.equal(algebraicSystemDimension(question), 3);
  assert.equal(normalizeAlgebraicSystemConfig(question).method, 'studentChoice');
  assert.equal(question.requireVerification, true);
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('Classwork stays at 3 questions (~20 teacher-led minutes is a pacing decision, not a question-count one this test can pin)', () => {
  assert.equal(compiledSections[1].questions.length, 3);
});

test('Section-balance richness recognizes the mixed spatial + algebraic Classwork as fully rich, none plain', () => {
  const audit = analyzeSectionBalanceRigor({ sections: compiledSections });
  assert.equal(audit.classwork.richShare, 1);
  assert.ok(audit.classwork.families.includes('three-plane spatial model'));
  assert.ok(audit.classwork.families.includes('systems'));
});

test('every compiled question across the whole Day 1 lesson passes tool validation (no regressions in the existing modes it touches)', () => {
  const allQuestions = compiledSections.flatMap((section) => section.questions);
  allQuestions.forEach((question, index) => {
    const result = validateToolQuestion(question);
    assert.equal(result.isValid, true, `question ${index} (${question.type}) failed: ${result.errors?.join(' | ')}`);
  });
});
