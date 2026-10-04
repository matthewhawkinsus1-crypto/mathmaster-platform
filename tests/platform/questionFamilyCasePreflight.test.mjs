/*
 * PRE-FLIGHT AND AUTHORING FOR THE SPECIAL-CASE FAMILIES.
 *
 * Accepts: a lesson whose slots use the new constraints passes Pre-Flight,
 * each slot reports its version, its concept settings, the cases it
 * delivers, its capacity and its tool, and a DOL of them is Recovery-ready.
 *
 * Rejects, clearly, and never silently:
 *   - a value a strict family does not allow (solutionCase "two");
 *   - a misspelled constraint (solutioncase, solution_case) — naming the one
 *     that was probably meant;
 *   - a constraint only a newer version has, on an unpinned (version 1) slot;
 *   - a tool the family cannot fill;
 *   - solutionCase on linear.twoStepEquation, which always has one solution.
 *
 * Capacity: every new setting gives an ordinary class its own question.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { CAPACITY_BUDGET, REFERENCE_CLASS_SIZE, auditAssignmentQuestionGeneration } from '../../src/platform/preflight/questionGenerationPreflight.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { CAPABILITY_CAPACITY_BUDGET } from '../../functions/shared/questionFamilyCapabilities.mjs';

const alignment = (code) => [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }];
const equation = (questionId, family, constraints, extra = {}) => ({
  questionId,
  type: 'stepAlgebra',
  prompt: 'Solve {{equation}}.',
  questionFamily: { ...family, constraints },
  alignments: alignment('A.5A'),
  ...extra,
});
const V2 = { id: 'linear.multiStepEquation', version: 2 };
const V1 = { id: 'linear.multiStepEquation' };
const TWO = { id: 'linear.twoStepEquation', version: 2 };
const system = (questionId, constraints, extra = {}) => ({
  questionId,
  type: 'systemsWorkspace',
  prompt: '',
  questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints },
  alignments: alignment('A.5C'),
  ...extra,
});

const lesson = (dol, classwork = []) => ({
  schemaVersion: 5,
  assignment: { title: 'Special cases', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  variantPolicy: { mode: 'personalized', sectionModes: { dol: 'personalized' } },
  sections: [
    ...(classwork.length ? [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions: classwork }] : []),
    { id: 'dol', role: 'dol', title: 'DOL', questions: dol },
  ],
});

const VALID_DOL = [
  equation('d1', V2, { solutionCase: 'none', distribute: true }),
  equation('d2', V2, { solutionCase: 'mixed', coefficientForm: 'fraction' }),
  equation('d3', TWO, { solutionForm: 'fraction' }),
  system('d4', { solutionCase: 'infinite' }, { method: 'substitution' }),
  system('d5', { solutionCase: 'mixed', solutionForm: 'fraction' }),
];

test('Pre-Flight accepts valid special-case slots and reports what each one delivers', () => {
  const model = buildAssignmentV5PreflightModel(lesson(VALID_DOL), { classSize: 30 });
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const generation = model.questionGeneration;
  assert.deepEqual(generation.errors, []);
  assert.deepEqual(generation.warnings, [], generation.warnings.join('\n'));
  assert.equal(generation.recovery.dol.status, 'ready', 'a DOL of these slots is Recovery-ready');

  const slots = generation.slots.filter((slot) => slot.familyBacked);
  assert.equal(slots.length, VALID_DOL.length);
  slots.forEach((slot) => {
    assert.equal(slot.ready, true, slot.label);
    assert.equal(slot.constraintPolicy, 'strict');
    assert.ok(slot.capacity >= REFERENCE_CLASS_SIZE, `${slot.label}: capacity ${slot.capacity}`);
  });
  const [none, mixed, twoStep, sysInfinite, sysMixed] = slots;
  assert.deepEqual([none.familyId, none.familyVersion, none.tool], ['linear.multiStepEquation', 2, 'stepAlgebra']);
  assert.deepEqual(none.concepts, { solutionCase: 'none', distribute: true, solutionForm: 'integer', coefficientForm: 'integer' });
  assert.deepEqual(none.solutionCases, ['none']);
  assert.deepEqual(mixed.solutionCases, ['one', 'none', 'infinite']);
  assert.deepEqual(twoStep.concepts, { distribute: false, solutionForm: 'fraction', coefficientForm: 'integer' });
  assert.deepEqual([sysInfinite.familyId, sysInfinite.tool, sysInfinite.solutionCases], ['systems.algebraic2x2', 'systemsWorkspace', ['infinite']]);
  assert.deepEqual(sysMixed.solutionCases, ['one', 'none', 'infinite']);
  // A mixed slot says how it shares the cases out.
  assert.ok(generation.notes.some((note) => /Question 2 \(DOL Q2\) mixes one solution, no solution, infinitely many solutions in equal shares/.test(note)), generation.notes.join('\n'));
  assert.ok(generation.notes.some((note) => /Question 5 \(DOL Q5\) mixes one solution, no solution, infinitely many solutions in equal shares/.test(note)));
  // And the generated answer key of every sampled version grades as correct
  // through the workspace's own grader against the shown equation.
  VALID_DOL.forEach((question) => assert.deepEqual(validateQuestionSemantics(question, { label: question.questionId }).errors, []));
});

test('Pre-Flight rejects a value, a misspelling or a tool a strict family cannot honour — and names the fix', () => {
  const cases = [
    [equation('x1', V2, { solutionCase: 'two' }), /"solutionCase": "two" is not allowed by linear\.multiStepEquation v2; use one of "one", "none", "infinite", "mixed"/],
    [equation('x2', V2, { solutioncase: 'none' }), /"solutioncase" is not a constraint of linear\.multiStepEquation v2 \(did you mean "solutionCase"\?/],
    [equation('x3', V2, { solution_case: 'infinite' }), /did you mean "solutionCase"/],
    [equation('x4', TWO, { solutionCase: 'none' }), /"solutionCase" is not a constraint of linear\.twoStepEquation v2/],
    [equation('x5', { ...V2, tool: 'multiAnswer' }, { solutionCase: 'none' }), /cannot be answered in the "multiAnswer" tool; use one of "stepAlgebra"/],
    [system('x6', { solutionForm: 'decimal' }), /"solutionForm": "decimal" is not allowed by systems\.algebraic2x2 v1/],
    [system('x7', { solutionCase: 'one', method: 'elimination' }), /"method" is not a constraint of systems\.algebraic2x2 v1/],
  ];
  for (const [question, message] of cases) {
    // Blocking wherever semantic validation runs (import, publish, Pre-Flight).
    const semantic = validateQuestionSemantics(question, { label: 'Question 1' });
    assert.equal(semantic.errors.length, 1, `${question.questionId}: ${semantic.errors.join(' | ')}`);
    assert.match(semantic.errors[0], /cannot generate questions \(constraint_invalid/);
    assert.match(semantic.errors[0], message);
    const model = buildAssignmentV5PreflightModel(lesson([question]));
    assert.equal(model.isValid, false, `${question.questionId} must not publish`);
    // Nothing is generated for it, so no student could be given a default.
    const slot = model.questionGeneration.slots.find((entry) => entry.familyBacked);
    assert.equal(slot.ready, false);
    assert.equal(slot.error, 'constraint_invalid');
  }
});

test('a constraint only version 2 understands, on an unpinned slot, blocks — even misspelled', () => {
  for (const [constraints, message] of [
    [{ solutionCase: 'none' }, /"solutionCase" is a constraint of linear\.multiStepEquation version 2, but this question uses version 1, which ignores it .* Set "version": 2 in its questionFamily\./],
    [{ distribute: true }, /"distribute" is a constraint of linear\.multiStepEquation version 2/],
    [{ solution_case: 'none' }, /"solution_case" looks like "solutionCase", a constraint of linear\.multiStepEquation version 2, .* Set "version": 2 in its questionFamily and spell the constraint "solutionCase"\./],
  ]) {
    const generation = auditAssignmentQuestionGeneration({ id: 'pf' }, [equation('v1', V1, constraints)], { classSize: 30 });
    assert.equal(generation.errors.length, 1, JSON.stringify(constraints));
    assert.match(generation.errors[0], message);
    const model = buildAssignmentV5PreflightModel(lesson([equation('v1', V1, constraints)]));
    assert.equal(model.isValid, false, 'blocking, not a warning');
  }
  // A version 1 constraint it really has is still fine on v1.
  const fine = auditAssignmentQuestionGeneration({ id: 'pf' }, [equation('v1', V1, { solutionRange: [-5, 5] })], { classSize: 30 });
  assert.deepEqual(fine.errors, []);
});

test('capacity: every new setting gives an ordinary class its own question, measured as Pre-Flight measures it', () => {
  assert.equal(CAPABILITY_CAPACITY_BUDGET, CAPACITY_BUDGET, 'the capability report and Pre-Flight measure the same way');
  const settings = [
    equation('c1', V2, { solutionCase: 'one' }),
    equation('c2', V2, { solutionCase: 'none' }),
    equation('c3', V2, { solutionCase: 'infinite' }),
    equation('c4', V2, { solutionCase: 'mixed', distribute: 'mixed' }),
    equation('c5', V2, { solutionCase: 'infinite', distribute: true }),
    equation('c6', V2, { solutionForm: 'fraction', coefficientForm: 'fraction' }),
    equation('c7', TWO, { distribute: true, coefficientForm: 'fraction' }),
    system('c8', { solutionCase: 'infinite' }),
    system('c9', { solutionCase: 'mixed', solutionForm: 'fraction' }),
  ];
  const generation = auditAssignmentQuestionGeneration({ id: 'capacity' }, settings, { classSize: 36 });
  assert.deepEqual(generation.warnings, [], generation.warnings.join('\n'));
  generation.slots.forEach((slot) => {
    // Every student's first version and two more "New Question" versions, many times over.
    assert.ok(slot.capacity >= 36 * 3 * 10, `${slot.label}: ${slot.capacity}`);
  });
});

test('the authoring contract lists each strict version\'s constraints and how to pin it', () => {
  const contract = buildAuthoringContract({ generatedAt: new Date('2026-10-04T00:00:00Z') });
  const section = contract.slice(contract.indexOf('## Question Families'), contract.indexOf('## Multiple Representations'));
  assert.match(section, /`linear\.multiStepEquation` \(v2\) .*strict constraints: solutionCase \("one" \| "none" \| "infinite" \| "mixed"\), distribute \(false \| true \| "mixed"\)/);
  assert.match(section, /`linear\.twoStepEquation` \(v2\) .*strict constraints: distribute/);
  assert.doesNotMatch(section.split('\n').find((line) => line.includes('`linear.twoStepEquation` (v2)')), /solutionCase/);
  assert.match(section, /`systems\.algebraic2x2` \(v1\) .*tools: systemsWorkspace; strict constraints: solutionCase/);
  assert.match(section, /An unpinned reference always means version 1/);
  assert.match(section, /"method": "substitution"/);
  // Version 1 lines carry no strict list: their constraints still fall back.
  assert.doesNotMatch(section.split('\n').find((line) => line.includes('`linear.multiStepEquation` (v1)')), /strict constraints/);
});
