/*
 * ISSUE #359, PART D — HONORS / CCMR SEMANTIC-FIT GATE.
 *
 * Same-TEKS is necessary but not sufficient. The audited bank carries the
 * TEKS code A2.3A on both a genuine 3-variable linear-system lesson's
 * neighbor content and an unrelated 2-variable linear–quadratic
 * break-even item ("formulateLinearQuadraticSystem"); it also carries the
 * broader TEKS code A2.3B on ACT/TSIA2 "native" single-equation items
 * (linearEquation, quadraticEquation, radicalEquation — none of them a
 * system at all). Auto-sourcing must reject those before ranking by
 * DOK/difficulty, keep the teacher's authored question when nothing
 * compatible exists, and report a diagnosable reason instead of silently
 * forcing in an unrelated question to hit the 15% Practice target.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  chooseAuditedBankDocument,
  chooseAuditedBankDocumentAnyFramework,
  isSemanticallyCompatible,
  deriveSourceSemanticProfile,
  explainAuditedBankMatch,
  ensureAuditedCcmrPractice,
  replaceDirectCcmrQuestionsWithAuditedBank,
} = require('../../functions/lib/ccmrAssignmentBank.js');

const DAY1_SYSTEM = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'];

const day1EliminationQuestion = (overrides = {}) => ({
  questionId: 'day1-elimination',
  standard: 'A2.3A',
  prompt: 'Eliminate one variable from two pairs of equations to reduce the system, then solve.',
  studentActions: ['solveSystem'],
  type: 'systemsWorkspace',
  mode: 'algebraic',
  method: 'elimination',
  equations: DAY1_SYSTEM,
  variables: ['x', 'y', 'z'],
  dok: 2,
  difficultyBand: 3,
  alignments: [{ framework: 'teks', code: 'A2.3A', role: 'primary', evidenceLevel: 'assessed' }],
  ...overrides,
});

test('deriveSourceSemanticProfile reads a 3×3 elimination question as a pure (non-linear-quadratic) system', () => {
  const profile = deriveSourceSemanticProfile(day1EliminationQuestion());
  assert.equal(profile.isSystem, true);
  assert.equal(profile.isLinearQuadratic, false);
  assert.equal(profile.dimension, 3);
  assert.equal(profile.method, 'elimination');
});

test('a linear-quadratic bank item is never semantically compatible with a pure linear system source', () => {
  const linearQuadraticDocument = { taskType: 'formulateLinearQuadraticSystem', assessedConstruct: 'A2.3A' };
  const profile = deriveSourceSemanticProfile(day1EliminationQuestion());
  assert.equal(isSemanticallyCompatible(profile, linearQuadraticDocument), false);
});

test('a single-equation "native" item never satisfies a system source despite a shared TEKS code', () => {
  const singleEquationDocument = { taskType: 'solveTwoStepLinearEquation', assessedConstruct: 'TSIA2-native:linearEquationsInequalitiesSystems' };
  const profile = deriveSourceSemanticProfile(day1EliminationQuestion());
  assert.equal(isSemanticallyCompatible(profile, singleEquationDocument), false);
});

test('a genuine three-variable system-family bank item is semantically compatible', () => {
  const threeVariableSystemDocument = { taskType: 'solveThreeVariableLinearSystemElimination', assessedConstruct: 'A2.3B' };
  const profile = deriveSourceSemanticProfile(day1EliminationQuestion());
  assert.equal(isSemanticallyCompatible(profile, threeVariableSystemDocument), true);
});

test('a system-family bank item with no dimension signal is NOT assumed compatible with a 3-variable source (#359: system dimension matters)', () => {
  // This is the exact real-bank shape discovered while building this gate:
  // the ACT "two-equation-system" family (taskType "linearSystem") is a
  // genuine, non-quadratic system item, broadly crosswalked onto A2.3A/
  // A2.3B — but it is 2-variable, not 3-variable, and must not silently
  // stand in for a 3×3 elimination question.
  const twoVariableSystemDocument = { taskType: 'linearSystem', familyId: 'mathmaster:act:native:algebra:two-equation-system', prompt: 'The system $x+y=S$ and $2x-y=D$ has a solution $(x,y)$. What is the value of $x$?' };
  const profile = deriveSourceSemanticProfile(day1EliminationQuestion());
  assert.equal(isSemanticallyCompatible(profile, twoVariableSystemDocument), false);
});

test('a non-system source is never gated by the semantic-fit check (nothing to compare against)', () => {
  const profile = deriveSourceSemanticProfile({ studentActions: ['solveEquation'], equation: '3x+4=40' });
  assert.equal(profile.isSystem, false);
  assert.equal(isSemanticallyCompatible(profile, { taskType: 'anything at all' }), true);
});

test('HARD RULE (#359): chooseAuditedBankDocument never returns the A2.3A linear-quadratic item for the Day 1 3×3 elimination question', () => {
  const source = day1EliminationQuestion();
  const document = chooseAuditedBankDocument({
    framework: 'digitalSAT',
    domainId: 'advancedMath',
    teksCodes: ['A2.3A'],
    dok: source.dok,
    difficultyBand: source.difficultyBand,
    seed: 'day1-elimination-hard-rule',
    sourceQuestion: source,
  });
  // The A2.3A digitalSAT family is exclusively the linear-quadratic
  // break-even/arch items (see functions/seeds/pathQuestionBank), so a real
  // semantic gate must return null here rather than substitute one in.
  assert.equal(document, null, document && `unexpectedly matched ${document.id} (taskType: ${document.taskType})`);

  const anyFramework = chooseAuditedBankDocumentAnyFramework({
    teksCodes: ['A2.3A'],
    dok: source.dok,
    difficultyBand: source.difficultyBand,
    seed: 'day1-elimination-hard-rule-any-framework',
    sourceQuestion: source,
  });
  assert.equal(anyFramework, null, anyFramework && `unexpectedly matched ${anyFramework.id}`);
});

test('explainAuditedBankMatch distinguishes "no compatible item" from "no same-TEKS item at all"', () => {
  const source = day1EliminationQuestion();
  const noCompatible = explainAuditedBankMatch(source, { teksCodes: ['A2.3A'] });
  assert.equal(noCompatible.reason, 'no_semantically_compatible_audited_item');
  assert.ok(noCompatible.sameTeksCount > 0, 'A2.3A same-TEKS candidates do exist (the linear-quadratic family)');
  assert.equal(noCompatible.semanticallyCompatibleCount, 0);
  assert.equal(noCompatible.rejectedForConstructMismatch, noCompatible.sameTeksCount);

  const noSameTeks = explainAuditedBankMatch(source, { teksCodes: ['Z9.9Z'] });
  assert.equal(noSameTeks.reason, 'no_same_teks_audited_item');
  assert.equal(noSameTeks.sameTeksCount, 0);
});

test('ensureAuditedCcmrPractice keeps the authored 3×3 elimination question and reports the semantic gap instead of inserting an unrelated item', () => {
  const otherQuestions = Array.from({ length: 7 }, (unused, index) => ({
    questionId: `other-${index + 1}`,
    prompt: `Solve the linear equation for x, version ${index + 1}.`,
    studentActions: ['solveEquation'],
    equation: `${index + 2}x+4=${(index + 2) * 6 + 4}`,
    answer: '6',
    standard: 'A.5A',
    dok: 1,
    difficultyBand: 2,
    alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
  }));
  const source = {
    schemaVersion: 5,
    assignment: { title: '3×3 elimination Day 1 Practice', courseId: 'algebra2' },
    sections: [{ role: 'practice', title: 'Practice', questions: [day1EliminationQuestion(), ...otherQuestions] }],
  };

  const result = ensureAuditedCcmrPractice(source);
  const questions = result.assignment.sections[0].questions;
  // The 3×3 elimination question must survive untouched: no bank swap.
  assert.deepEqual(questions[0].equations, DAY1_SYSTEM);
  assert.equal(questions[0].ccmrSource, undefined);
  assert.equal(questions.length, 8, 'sourcing must replace, not append or drop questions');
  // The 15% target (1 of 8) is still met by an ordinary A.5A question instead.
  assert.equal(result.audit.autoSourced, 1);
  const banked = questions.filter((question) => question.ccmrSource?.source === 'auditedBank');
  assert.equal(banked.length, 1);
  assert.notDeepEqual(banked[0].equations, DAY1_SYSTEM);
});

test('replaceDirectCcmrQuestionsWithAuditedBank records a semantic-gap miss with provenance, and never swaps the elimination question for the linear-quadratic family', () => {
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Direct CCMR claim, semantic gap', courseId: 'algebra2' },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [day1EliminationQuestion({
        alignments: [
          { framework: 'teks', code: 'A2.3A', role: 'primary', evidenceLevel: 'assessed' },
          { framework: 'digitalSAT', domainId: 'advancedMath', role: 'primary', evidenceMode: 'direct' },
        ],
        assessmentContext: { framework: 'digitalSAT', examStyle: true, domainId: 'advancedMath' },
      })],
    }],
  };

  const result = replaceDirectCcmrQuestionsWithAuditedBank(source);
  const question = result.assignment.sections[0].questions[0];
  assert.deepEqual(question.equations, DAY1_SYSTEM, 'the authored 3×3 elimination question must be preserved unchanged');
  assert.equal(result.audit.replaced, 0);
  assert.equal(result.audit.misses.length, 1);
  assert.equal(result.audit.misses[0].reason, 'no_semantically_compatible_audited_item');
  assert.ok(result.audit.misses[0].sameTeksCount > 0);
  assert.equal(result.audit.misses[0].semanticallyCompatibleCount, 0);
});

test('a genuinely compatible match carries match provenance for teacher visibility', () => {
  const source = {
    schemaVersion: 5,
    assignment: { title: 'Compatible transfer', courseId: 'algebra1' },
    sections: [{
      role: 'practice',
      title: 'Practice',
      questions: [{
        questionId: 'linear-solve',
        prompt: 'Solve for x.',
        studentActions: ['solveEquation'],
        equation: '3x+4=40',
        answer: '12',
        standard: 'A.5A',
        dok: 2,
        difficultyBand: 3,
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
          { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
        ],
        assessmentContext: { framework: 'digitalSAT', examStyle: true, domainId: 'algebra' },
      }],
    }],
  };
  const result = replaceDirectCcmrQuestionsWithAuditedBank(source);
  const question = result.assignment.sections[0].questions[0];
  assert.equal(result.audit.replaced, 1);
  assert.equal(question.ccmrSource?.source, 'auditedBank');
  assert.ok(question.ccmrSource?.matchProvenance, 'a successful match should carry provenance for teacher review');
  assert.deepEqual(question.ccmrSource.matchProvenance.teksCodes, ['A.5A']);
  assert.ok(question.ccmrSource.matchProvenance.sameTeksCount >= 1);
  assert.ok(question.ccmrSource.matchProvenance.semanticallyCompatibleCount >= 1);
});
