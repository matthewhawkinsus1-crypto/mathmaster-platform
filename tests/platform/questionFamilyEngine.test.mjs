/*
 * QUESTION FAMILY ENGINE — PROPERTY TESTS.
 *
 * A family is validated by GENERATING from it, many times, and checking every
 * instance: the answer key must satisfy its own question, the server's grading
 * contract must accept that key and reject a wrong answer, every constraint and
 * graph window must hold, and no two instances may be the same question.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILY_ISSUE,
  QuestionFamilyDefinitionError,
  defineQuestionFamily,
  intDomain,
  rangeKnob,
  resolveFamilyConstraints,
} from '../../functions/shared/questionFamilyContract.mjs';
import {
  buildFamilyQuestion,
  buildParameterSpace,
  createFamilyInstanceSequence,
  createIndexPermutation,
  evaluateFamilyCandidate,
  featuresInsideWindow,
  measureFamilyCapacity,
} from '../../functions/shared/questionFamilyEngine.mjs';
import {
  PLATFORM_FAMILY_IDS,
  allRegisteredQuestionFamilies,
  defaultFamilyVersion,
  getPlatformQuestionFamily,
} from '../../functions/shared/questionFamilyRegistry.mjs';
import { buildTemplateFamily, templateStructuralIssues } from '../../functions/shared/questionFamilyTemplate.mjs';
import { evaluateExpression } from '../../functions/shared/pathQuestionGeneration.mjs';
import { gradeOrdinaryResponse, serverGradingSupport } from '../../functions/shared/ordinaryResponseGrading.mjs';

const SAMPLE = 160;

const sampleInstances = (family, overrides = {}, seed = 'property') => {
  const { values } = resolveFamilyConstraints(family, overrides);
  const sequence = createFamilyInstanceSequence(family, values, seed);
  const instances = [];
  for (let index = 0; index < SAMPLE; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    instances.push(instance);
  }
  return { instances, values };
};

/** The response a student who solved it correctly would give, per answer kind. */
const correctFieldResponses = (question, instance) => {
  const answer = instance.answer;
  const fields = question.answerFields || [];
  if (answer.kind === 'number') return { [fields[0].id]: String(answer.display.includes('/') ? answer.display : answer.value).replace(/^.*=\s*/, '') };
  if (answer.kind === 'orderedPair') return { [fields[0].id]: `(${answer.value[0]}, ${answer.value[1]})` };
  if (answer.kind === 'set') return { [fields[0].id]: String(answer.value[0]), [fields[1].id]: String(answer.value[1]) };
  if (answer.kind === 'points') {
    return {
      xIntercept: `(${answer.value.xIntercept[0]}, ${answer.value.xIntercept[1]})`,
      yIntercept: `(${answer.value.yIntercept[0]}, ${answer.value.yIntercept[1]})`,
    };
  }
  throw new Error(`no responder for ${answer.kind}`);
};

const fieldsResponse = (responses) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(responses).map(([id, value]) => ({ id, value, isComplete: true })),
});

test('the registry holds the representative families, each defined under the contract', () => {
  for (const id of [
    'linear.twoStepEquation',
    'linear.multiStepEquation',
    'linear.slopeFromPoints',
    'functions.identifyIntercepts',
    'systems.elimination',
    'systems.substitution',
    'absoluteValue.solveEquation',
    'quadratics.identifyVertex',
    'functions.identifyZeros',
  ]) {
    assert.ok(PLATFORM_FAMILY_IDS.includes(id), `${id} is registered`);
    const family = getPlatformQuestionFamily(id);
    assert.ok(family.skill.alignments.length > 0, `${id} names what it assesses`);
    assert.ok(family.difficulty.band >= 1 && family.difficulty.dok >= 1, `${id} names its rigor`);
  }
});

test('an unpinned reference means version 1, so shipping a v2 can never move a live question', () => {
  for (const id of PLATFORM_FAMILY_IDS) {
    assert.equal(defaultFamilyVersion(id), 1);
    assert.equal(getPlatformQuestionFamily(id).version, 1);
  }
  assert.equal(getPlatformQuestionFamily('linear.twoStepEquation', 99), null, 'an unknown version is refused, not substituted');
  assert.equal(getPlatformQuestionFamily('linear.notAFamily'), null);
});

test('every family: each instance obeys its rules, its window and its constraints', () => {
  for (const family of allRegisteredQuestionFamilies()) {
    const { instances, values } = sampleInstances(family);
    assert.ok(instances.length >= 40, `${family.id} produced ${instances.length} instances`);
    const space = buildParameterSpace(family, values);
    instances.forEach((instance) => {
      const replay = evaluateFamilyCandidate(family, values, instance.params);
      assert.equal(replay.valid, true, `${family.id} instance re-validates`);
      space.names.forEach((name, position) => {
        assert.ok(space.values[position].includes(instance.params[name]), `${family.id}.${name} stays inside its constrained domain`);
      });
      if (family.graphWindow) {
        const { window, features } = family.graphWindow(instance.values, values);
        assert.equal(featuresInsideWindow(window, features), true, `${family.id} keeps every feature on the graph`);
      }
    });
  }
});

test('every family: no two instances are the same question', () => {
  for (const family of allRegisteredQuestionFamilies()) {
    const { instances } = sampleInstances(family);
    const fingerprints = instances.map((instance) => instance.fingerprint);
    assert.equal(new Set(fingerprints).size, fingerprints.length, `${family.id} fingerprints are unique`);
  }
});

test('every family: the answer key is correct for its own question, on the server grading contract too', () => {
  for (const family of allRegisteredQuestionFamilies()) {
    const { instances, values } = sampleInstances(family);
    for (const toolType of Object.keys(family.tools)) {
      instances.slice(0, 40).forEach((instance) => {
        const question = buildFamilyQuestion({ family, instance, constraintValues: values, authored: { questionId: 'q' }, tool: toolType });
        assert.equal(question.generator, undefined, 'a built instance never carries its template generator');
        assert.equal(question.questionFamily, undefined);
        if (question.type === 'stepAlgebra') {
          const x = instance.answer.value;
          const scope = { [question.variable]: x };
          assert.equal(question.generatedAnswer, x);
          assert.equal(
            evaluateExpression(question.leftExpression, scope),
            evaluateExpression(question.rightExpression, scope),
            `${family.id}: ${question.equation} holds at ${question.variable} = ${x}`,
          );
          // Exactly one solution: one more than the answer must not satisfy it.
          assert.notEqual(
            evaluateExpression(question.leftExpression, { [question.variable]: x + 1 }),
            evaluateExpression(question.rightExpression, { [question.variable]: x + 1 }),
          );
          return;
        }
        assert.equal(serverGradingSupport(question).supported, true, `${family.id}/${toolType} is server-gradable`);
        if (question.type === 'system') {
          const [x, y] = instance.answer.value;
          const graded = gradeOrdinaryResponse({ question, response: { kind: 'scalar', type: 'system', value: `(${x}, ${y})`, fields: [] } });
          assert.equal(graded.isCorrect, true, `${family.id}: the solution solves the system`);
          const wrong = gradeOrdinaryResponse({ question, response: { kind: 'scalar', type: 'system', value: `(${x + 1}, ${y})`, fields: [] } });
          assert.equal(wrong.isCorrect, false);
          return;
        }
        const responses = correctFieldResponses(question, instance);
        assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(responses) }).isCorrect, true, `${family.id}: key accepted`);
        const wrongResponses = Object.fromEntries(Object.entries(responses).map(([id, value]) => [id, value.startsWith('(') ? '(99, 99)' : '9999']));
        assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse(wrongResponses) }).isCorrect, false, `${family.id}: wrong answer rejected`);
      });
    }
  }
});

test('families refuse the bad instances the brief names', () => {
  const elimination = getPlatformQuestionFamily('systems.elimination');
  const { values: eliminationValues } = resolveFamilyConstraints(elimination, {});
  // 1x + 2y and 2x + 4y through the same point: the same line twice.
  const coincident = evaluateFamilyCandidate(elimination, eliminationValues, { x0: 1, y0: 1, a1: 1, b1: 2, a2: 2, b2: 4 });
  assert.equal(coincident.valid, false);
  assert.ok(coincident.issues.includes(FAMILY_ISSUE.COINCIDENT_SYSTEM));

  const slope = getPlatformQuestionFamily('linear.slopeFromPoints');
  const { values: slopeValues } = resolveFamilyConstraints(slope, { slopeForm: 'integer' });
  const vertical = evaluateFamilyCandidate(slope, slopeValues, { x1: 2, y1: 1, x2: 2, y2: 5 });
  assert.deepEqual(vertical.issues, [FAMILY_ISSUE.DIVIDE_BY_ZERO]);
  const fractional = evaluateFamilyCandidate(slope, slopeValues, { x1: 0, y1: 0, x2: 3, y2: 2 });
  assert.ok(fractional.issues.includes(FAMILY_ISSUE.UNINTENDED_FRACTION), 'an integer-slope slot never gets 2/3');

  const multiStep = getPlatformQuestionFamily('linear.multiStepEquation');
  const { values: multiValues } = resolveFamilyConstraints(multiStep, {});
  const noSolution = evaluateFamilyCandidate(multiStep, multiValues, { x: 2, a: 3, cc: 3, b: 4 });
  assert.ok(noSolution.issues.includes(FAMILY_ISSUE.NO_SOLUTION), '3x + 4 = 3x + d is never handed out');

  const vertex = getPlatformQuestionFamily('quadratics.identifyVertex');
  const { values: vertexValues } = resolveFamilyConstraints(vertex, { vertexYRange: [-11, 11] });
  const offScreen = evaluateFamilyCandidate(vertex, vertexValues, { h: 0, k: 11.5, a: 1 });
  assert.ok(offScreen.issues.includes(FAMILY_ISSUE.FEATURE_OUTSIDE_WINDOW), 'a vertex on the border of the window is refused');

  const zeros = getPlatformQuestionFamily('functions.identifyZeros');
  const { values: zeroValues } = resolveFamilyConstraints(zeros, {});
  assert.ok(evaluateFamilyCandidate(zeros, zeroValues, { r1: 3, r2: 3, a: 1 }).issues.includes(FAMILY_ISSUE.DUPLICATE_ROOT));
});

test('assignment constraints are honoured, and an out-of-bounds request falls back with a reported issue', () => {
  const family = getPlatformQuestionFamily('linear.twoStepEquation');
  const narrowed = sampleInstances(family, { solutionRange: [-3, 3] }).instances;
  narrowed.forEach((instance) => assert.ok(instance.params.x >= -3 && instance.params.x <= 3));

  const resolved = resolveFamilyConstraints(family, { solutionRange: [-500, 500], coefficientRang: [1, 2] });
  assert.deepEqual([...resolved.values.solutionRange], [-10, 10], 'out of bounds falls back to the default');
  assert.deepEqual(resolved.issues.map((issue) => `${issue.constraint}:${issue.code}`).sort(), [
    'coefficientRang:constraint_unknown',
    'solutionRange:constraint_out_of_bounds',
  ], 'a misspelled constraint that did nothing is reported, never silent');
});

test('capacity is exact for enumerable families and matches a brute-force count', () => {
  const family = getPlatformQuestionFamily('functions.identifyIntercepts');
  const { values } = resolveFamilyConstraints(family, {});
  const measured = measureFamilyCapacity(family, values);
  assert.equal(measured.exact, true);
  // Brute force: every (p, q) pair of non-zero intercepts in [-9, 9] is valid
  // and distinct (the window margin excludes nothing at |9| inside [-10, 10]).
  assert.equal(measured.capacity, 18 * 18);

  const zeros = getPlatformQuestionFamily('functions.identifyZeros');
  const zeroValues = resolveFamilyConstraints(zeros, {}).values;
  let brute = 0;
  const seen = new Set();
  for (let r1 = -8; r1 <= 8; r1 += 1) {
    for (let r2 = -8; r2 <= 8; r2 += 1) {
      for (const a of [-1, 1]) {
        const evaluated = evaluateFamilyCandidate(zeros, zeroValues, { r1, r2, a });
        if (evaluated.valid && !seen.has(evaluated.instance.fingerprint)) {
          seen.add(evaluated.instance.fingerprint);
          brute += 1;
        }
      }
    }
  }
  assert.equal(measureFamilyCapacity(zeros, zeroValues).capacity, brute);
});

test('the index permutation is a true bijection, seeded and deterministic', () => {
  for (const size of [1, 2, 7, 64, 1000, 4097]) {
    const permute = createIndexPermutation(size, 'seed-a');
    const seen = new Set();
    for (let index = 0; index < size; index += 1) seen.add(permute(index));
    assert.equal(seen.size, size, `size ${size}: every index maps to a distinct position`);
    assert.ok([...seen].every((value) => value >= 0 && value < size));
  }
  const a = createIndexPermutation(1000, 'seed-a');
  const b = createIndexPermutation(1000, 'seed-b');
  const orderA = Array.from({ length: 20 }, (_, index) => a(index));
  assert.deepEqual(Array.from({ length: 20 }, (_, index) => createIndexPermutation(1000, 'seed-a')(index)), orderA);
  assert.notDeepEqual(Array.from({ length: 20 }, (_, index) => b(index)), orderA, 'a different slot walks a different order');
});

test('an assignment-local template becomes a family with the same contract', () => {
  // The real generator from L1_Absolute_Value_ALEKS_Bridge (sections[2].questions[7]).
  const template = {
    questionId: 'abs-interval-max',
    type: 'multiAnswer',
    standard: 'A2.2A',
    prompt: 'For $p(x)=|x|$, the domain is restricted to $-{{a}}\\le x\\le {{b}}$. What is the maximum value of $p$ on this interval?',
    generator: {
      parameters: { a: { type: 'int', min: 2, max: 10 }, b: { type: 'int', min: 2, max: 10 } },
      derived: { ans: 'max(a,b)' },
      constraints: ['a!=b'],
    },
    answerFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', answer: '{{ans}}' }],
    questionFamily: { scope: 'assignment' },
  };
  const family = buildTemplateFamily(template, { slotKey: 'asg|abs-interval-max' });
  assert.equal(family.scope, 'assignment');
  assert.match(family.id, /^local:/);
  const capacity = measureFamilyCapacity(family, {});
  assert.equal(capacity.capacity, 72, '9 x 9 pairs minus the 9 with a = b');

  const sequence = createFamilyInstanceSequence(family, {}, 'asg|abs-interval-max');
  const all = sequence.exhaust();
  assert.equal(all.instances.length, 72);
  all.instances.slice(0, 20).forEach((instance) => {
    const question = buildFamilyQuestion({ family, instance, constraintValues: {}, authored: template });
    assert.doesNotMatch(JSON.stringify(question), /\{\{/, 'no placeholder reaches a student');
    const expected = String(Math.max(instance.params.a, instance.params.b));
    assert.equal(gradeOrdinaryResponse({ question, response: fieldsResponse({ answer: expected }) }).isCorrect, true);
  });

  assert.deepEqual(templateStructuralIssues({ ...template, prompt: 'Uses {{missing}}' }), ['unbound_placeholders:missing']);
  assert.match(templateStructuralIssues({
    ...template,
    generator: { ...template.generator, derived: { p: 'q + 1', q: 'p + 1' } },
  })[0], /^derived_cycle:/);
});

test('a family that cannot describe itself completely is refused at definition time', () => {
  assert.throws(() => defineQuestionFamily({ id: 'Bad Id', version: 1, title: 't' }), QuestionFamilyDefinitionError);
  assert.throws(() => defineQuestionFamily({
    id: 'test.missingRules',
    version: 1,
    title: 'Missing rules',
    skill: { objective: 'x' },
    difficulty: { band: 2, dok: 1 },
    tools: { multiAnswer: () => ({}) },
    parameters: () => ({ x: intDomain(1, 3) }),
    derive: () => ({}),
    fingerprint: () => 'f',
    answer: () => ({ value: 1 }),
  }), /`rules` must be a function/);
  assert.throws(() => defineQuestionFamily({
    id: 'test.badSupport',
    version: 1,
    title: 'Bad support',
    skill: { objective: 'x' },
    difficulty: { band: 2, dok: 1 },
    constraints: { range: rangeKnob([1, 3]) },
    supportConstraints: { 'reduce-complexity': { notAConstraint: [1, 2] } },
    tools: { multiAnswer: () => ({}) },
    parameters: () => ({ x: intDomain(1, 3) }),
    derive: () => ({}),
    rules: () => [],
    fingerprint: () => 'f',
    answer: () => ({ value: 1 }),
  }), /supportConstraints/);
});

test('every family, every tool: generated questions pass the platform\'s own semantic validation', async () => {
  const { validateQuestionSemantics } = await import('../../src/platform/contract/semanticValidation.js');
  for (const family of allRegisteredQuestionFamilies()) {
    const { values } = resolveFamilyConstraints(family, {});
    const sequence = createFamilyInstanceSequence(family, values, 'semantic-property');
    for (const tool of Object.keys(family.tools)) {
      const problems = new Set();
      for (let index = 0; index < 40; index += 1) {
        const instance = sequence.instanceAt(index);
        if (!instance) break;
        const question = buildFamilyQuestion({
          family,
          instance,
          constraintValues: values,
          authored: { questionId: `property-${family.id}`, type: tool, prompt: 'Answer the question.' },
          tool,
        });
        validateQuestionSemantics(question, { label: `${family.id}/${tool}` }).errors.forEach((error) => problems.add(error));
      }
      assert.deepEqual([...problems], [], `${family.id} via ${tool} produced questions the platform would refuse`);
    }
  }
});
