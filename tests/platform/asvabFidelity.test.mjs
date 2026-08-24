import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  ASVAB_DOMAIN_IDS, EXTREME_TOLERANCE, RANK_TOLERANCE,
  analyzeAnswerKeyBias, analyzeDistractors, analyzeFamilySet, analyzeRegister,
  isDistractorErrorCode, promptOverlap, promptSkeleton, taskFingerprint,
} from '../../functions/shared/asvabFidelity.mjs';

const draft = JSON.parse(readFileSync(new URL('../../drafts/asvab-ar.json', import.meta.url), 'utf8')).documents;

// ---------------------------------------------------------------- analyzers

const choiceItem = (labels, keyIndex) => ({
  choices: labels.map((label, index) => ({ id: `c${index}`, label })),
  responseFields: [{ id: 'answer', inputProfile: 'choice', expected: `c${keyIndex}` }],
});

test('the magnitude check catches a key that is always the smallest of four', () => {
  // The shape the previous bank shipped: distractors at correct+1/+2/+3.
  const instances = Array.from({ length: 40 }, (unused, n) => choiceItem([`$${n + 5}$`, `$${n + 6}$`, `$${n + 7}$`, `$${n + 8}$`], 0));
  const result = analyzeAnswerKeyBias(instances);
  assert.equal(result.numeric, 40);
  assert.equal(result.rank[0], 40);
  assert.ok(result.issues.some((issue) => issue.code === 'answerKeyMagnitudeBias'));
  assert.ok(result.issues.some((issue) => issue.code === 'answerKeyExtremeBias'));
});

test('money labels are parsed, so a dollar item cannot slip past the magnitude check', () => {
  const instances = Array.from({ length: 40 }, (unused, n) => choiceItem(
    [`$\\$${n + 5}$`, `$\\$${n + 6}$`, `$\\$${n + 7}$`, `$\\$${n + 8}$`], 0,
  ));
  const result = analyzeAnswerKeyBias(instances);
  assert.equal(result.numeric, 40, 'escaped dollar signs must still read as numbers');
  assert.ok(result.issues.some((issue) => issue.code === 'answerKeyExtremeBias'));
});

test('a key spread across ranks raises nothing', () => {
  // Each draw puts the key at a different rank once the four are sorted, which
  // is what an unexploitable family looks like.
  const instances = Array.from({ length: 40 }, (unused, n) => {
    const values = [10, 20, 30, 40];
    const targetRank = n % 4;
    return choiceItem(values.map((value) => `$${value}$`), targetRank);
  });
  const result = analyzeAnswerKeyBias(instances);
  assert.deepEqual(result.rank, [10, 10, 10, 10]);
  assert.deepEqual(result.issues, []);
});

test('the thresholds sit above the floor a two-quantity item can reach, and tighter on the extremes', () => {
  assert.ok(RANK_TOLERANCE > 0.5, 'a one-step proportion can only reach 0.5');
  assert.ok(EXTREME_TOLERANCE < RANK_TOLERANCE, '"always pick the smallest" is the cheap exploit and is held tighter');
});

test('the task fingerprint ignores the nouns and tracks the relation graph', () => {
  const machine = {
    prompt: 'A machine makes {{items}} parts in {{minutes}} minutes. How many per minute?',
    generator: { parameters: { rate: { type: 'int', min: 2, max: 9 }, minutes: { type: 'int', min: 2, max: 9 } }, derived: { items: 'rate*minutes' } },
    choices: [{ id: 'k', label: '{{rate}}' }],
    responseFields: [{ inputProfile: 'choice', expected: 'k' }],
  };
  const traveller = {
    prompt: 'A traveler covers {{distance}} miles in {{hours}} hours. Find the speed.',
    generator: { parameters: { speed: { type: 'int', min: 2, max: 9 }, hours: { type: 'int', min: 2, max: 9 } }, derived: { distance: 'speed*hours' } },
    choices: [{ id: 'k', label: '{{speed}}' }],
    responseFields: [{ inputProfile: 'choice', expected: 'k' }],
  };
  assert.equal(taskFingerprint(machine), taskFingerprint(traveller),
    'these are one task in two costumes and must be reported as clones');

  const twoStep = {
    prompt: 'A crew loads {{first}} then {{second}} crates. How many are left of {{total}}?',
    generator: { parameters: { first: { type: 'int', min: 2, max: 9 }, second: { type: 'int', min: 2, max: 9 }, left: { type: 'int', min: 2, max: 9 } }, derived: { total: 'first+second+left' } },
    choices: [{ id: 'k', label: '{{left}}' }],
    responseFields: [{ inputProfile: 'choice', expected: 'k' }],
  };
  assert.notEqual(taskFingerprint(machine), taskFingerprint(twoStep));
});

test('the surface check separates a shared sentence frame from a shared task', () => {
  assert.equal(
    promptSkeleton('A car travels 40 miles in 2 hours. How many miles per hour?'),
    promptSkeleton('A bus travels 90 miles in 3 hours. How many miles per hour?'),
  );
  assert.ok(promptOverlap(
    'A car travels 40 miles in 2 hours at a constant speed',
    'A bus travels 90 miles in 3 hours at a constant speed',
  ) > 0.5);
  assert.ok(promptOverlap(
    'A car travels 40 miles in 2 hours',
    'Simplify the expression and give the coefficient of x',
  ) < 0.1);
});

test('register rejects a prompt that hands over the procedure or borrows another exam voice', () => {
  const base = { assessmentContext: { domainId: 'arithmeticReasoning' } };
  const told = analyzeRegister({ ...base, prompt: 'Use the percent decrease formula to find the new value. What is it?' });
  assert.ok(told.issues.some((issue) => issue.code === 'procedureTold'));

  const satVoice = analyzeRegister({ ...base, prompt: 'A researcher collected a data set. Which of the following best describes it?' });
  assert.ok(satVoice.issues.some((issue) => issue.code === 'foreignRegister'));

  const clean = analyzeRegister({ ...base, prompt: 'A machine originally cost $4,000. Its value dropped by 15%. What is it worth now?' });
  assert.deepEqual(clean.issues, []);
});

test('a distractor that names no misconception, or repeats one, is rejected', () => {
  const item = (errors) => ({
    choices: [{ id: 'k', label: '$5$' }, ...errors.map((error, index) => ({ id: `d${index}`, label: `$${index + 6}$`, ...(error ? { error } : {}) }))],
    responseFields: [{ inputProfile: 'choice', expected: 'k' }],
  });
  assert.ok(analyzeDistractors(item(['ratioReversed', null, 'signError'])).issues.some((i) => i.code === 'distractorUnexplained'));
  assert.ok(analyzeDistractors(item(['signError', 'signError', 'ratioReversed'])).issues.some((i) => i.code === 'distractorErrorsRepeat'));
  assert.deepEqual(analyzeDistractors(item(['ratioReversed', 'signError', 'unitConversion'])).issues, []);
  assert.equal(isDistractorErrorCode('notARealCode'), false);
});

// ---------------------------------------------------------------- the bank

test('every rebuilt Arithmetic Reasoning family carries canonical ASVAB identifiers', () => {
  assert.ok(draft.length > 0);
  for (const question of draft) {
    assert.equal(question.assessmentContext.framework, 'asvab', question.id);
    assert.ok(ASVAB_DOMAIN_IDS.includes(question.assessmentContext.domainId), `${question.id} domainId`);
    assert.equal(question.assessmentContext.domainId, question.assessmentContext.subtest,
      `${question.id}: domainId and the legacy subtest name must not drift apart`);
    assert.equal(question.assessmentContext.examStyle, true, question.id);
    // The ASVAB permits no calculator; the canonical policy carries it.
    assert.equal(question.calculatorPolicy, 'none', question.id);
    assert.equal(question.examCalculatorMode, 'none', question.id);
    const direct = question.alignments.find((entry) => entry.framework === 'asvab');
    assert.equal(direct.domainId, question.assessmentContext.domainId, question.id);
    assert.ok(question.alignmentKeys[0].startsWith('texas:'), `${question.id} needs a TEKS key for the coverage manifest`);
  }
});

test('no choice id tells the student which option is the key', () => {
  for (const question of draft) {
    for (const choice of question.choices) {
      assert.doesNotMatch(String(choice.id), /correct|key|answer|right/i,
        `${question.id}: choice ids reach the browser, so they must not name the key`);
    }
  }
  // And the key does not always land on the same id across families.
  assert.ok(new Set(draft.map((q) => q.responseFields[0].expected)).size > 1);
});

test('rebuilt families generate cleanly, keep four distinct choices, and keep exactly one key', () => {
  for (const question of draft) {
    const samples = samplePathInstances(question, 80);
    const generated = samples.filter((entry) => entry.question);
    assert.equal(generated.length, samples.length, `${question.id} failed to generate: ${samples.find((s) => !s.question)?.reason}`);
    for (const { question: instance } of generated) {
      const labels = instance.choices.map((choice) => String(choice.label).trim());
      assert.equal(labels.length, 4, question.id);
      assert.equal(new Set(labels).size, 4, `${question.id}: a draw produced duplicate choices — ${labels.join(', ')}`);
      const keys = instance.choices.filter((choice) => choice.id === instance.responseFields[0].expected);
      assert.equal(keys.length, 1, `${question.id}: exactly one choice must be the key`);
      assert.doesNotMatch(JSON.stringify(instance), /\{\{/, `${question.id}: an unbound placeholder reached the instance`);
    }
  }
});

test('rebuilt families are free of answer-key bias across many draws', () => {
  for (const question of draft) {
    const instances = samplePathInstances(question, 120).map((entry) => entry.question).filter(Boolean);
    const bias = analyzeAnswerKeyBias(instances);
    assert.deepEqual(bias.issues, [], `${question.id}: ${bias.issues.map((i) => i.detail).join('; ')}`);
  }
});

test('rebuilt families use ASVAB register and purposeful distractors', () => {
  for (const question of draft) {
    assert.deepEqual(analyzeRegister(question).issues, [], question.id);
    assert.deepEqual(analyzeDistractors(question).issues, [], question.id);
  }
});

test('the five families of a rebuilt standard are five different tasks', () => {
  const byCode = new Map();
  for (const question of draft) {
    const code = question.assessedConstruct;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(question);
  }
  for (const [code, questions] of byCode) {
    const analysis = analyzeFamilySet(code, questions);
    assert.equal(analysis.families, 5, `${code} must offer five families`);
    assert.equal(analysis.distinctTasks, 5, `${code}: only ${analysis.distinctTasks} distinct task structures`);
    assert.deepEqual(analysis.issues, [], `${code}: ${analysis.issues.map((i) => i.detail).join('; ')}`);
    // The platform's own session-variety floor.
    assert.ok(new Set(questions.map((q) => q.representation)).size >= 3, `${code} representations`);
    assert.ok(new Set(questions.map((q) => q.taskType)).size >= 3, `${code} task types`);
    assert.ok(new Set(questions.map((q) => q.dok)).size >= 2, `${code} DOK levels`);
  }
});

test('generated answers are re-derived independently and match the key', () => {
  // Re-computing the mathematics here rather than trusting the generator is the
  // point: a generator that agrees with itself proves nothing.
  const byId = Object.fromEntries(draft.map((q) => [q.id, q]));
  const scale = byId.mm_asvab_6_4B_scale_prediction;
  for (const { question: instance, parameters } of samplePathInstances(scale, 40)) {
    if (!instance) continue;
    const perGallon = parameters.m1 / parameters.g1;
    const expected = parameters.m2 / perGallon;
    const key = instance.choices.find((c) => c.id === instance.responseFields[0].expected);
    assert.equal(Number(String(key.label).replace(/\$/g, '')), expected);
  }
  const shift = byId.mm_asvab_6_4B_two_rate_shift_total;
  for (const { question: instance, parameters } of samplePathInstances(shift, 40)) {
    if (!instance) continue;
    const expected = parameters.r1 * parameters.h1 + parameters.r2 * parameters.h2;
    const key = instance.choices.find((c) => c.id === instance.responseFields[0].expected);
    assert.equal(Number(String(key.label).replace(/\$/g, '')), expected);
  }
});
