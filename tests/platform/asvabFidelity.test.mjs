import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../../functions/shared/pathQuestionGeneration.mjs';
import { AR, asvabItem } from '../../scripts/lib/asvabAuthoring.mjs';
import {
  ASVAB_DOMAIN_IDS, EXTREME_TOLERANCE, RANK_TOLERANCE,
  analyzeAnswerKeyBias, analyzeDistractors, analyzeFamilySet, analyzeRegister,
  isDistractorErrorCode, numericLabel, promptOverlap, promptSkeleton, taskFingerprint,
} from '../../functions/shared/asvabFidelity.mjs';

// Both rebuilt subtests. The gates below are the production gates, so a family
// is only finished once it passes them in whichever bank it lives in — running
// them over Arithmetic Reasoning alone let a Mathematics Knowledge regression
// through unnoticed.
const load = (name) => JSON.parse(readFileSync(new URL(`../../drafts/asvab-${name}.json`, import.meta.url), 'utf8')).documents;
const draft = [...load('ar'), ...load('mk')];

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

test('unit-marked choices still get their distinctness constraints', () => {
  // Each of these markups defeated the constraint parser once. `$\\${{a}}$`
  // leaves a stray backslash when only the delimiters are stripped; `${{a}}\\%$`
  // leaves a trailing percent sign; `${{a}}^\\circ$` leaves a degree marker.
  // Every time the anchored match failed, no constraint was emitted, and the
  // bank shipped duplicate choices: $8, $64, $8, $8 — then 20%, 160%, 20%, 80%
  // — then a repeated angle, then 8pi, 4pi, 16pi, 16pi. Any new unit markup
  // belongs in UNIT_SUFFIXES and in this list.
  const build = (label) => asvabItem({
    code: '6.4E', slug: 'constraint-probe', domain: AR, courseId: 'grade6',
    prompt: 'What is the value?',
    generator: {
      parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 }, c: { type: 'int', min: 1, max: 9 }, d: { type: 'int', min: 1, max: 9 } },
      derived: {}, constraints: [],
    },
    choices: [
      { label: label('a'), correct: true },
      { label: label('b'), error: 'signError' },
      { label: label('c'), error: 'partialTotal' },
      { label: label('d'), error: 'arithmeticSlip' },
    ],
    reasoning: ['one', 'two'],
    answerSummary: { headline: 'headline', text: 'text' },
    hint: 'hint', feedback: 'feedback',
  });
  for (const [name, label] of [
    ['plain', (n) => `$\{\{${n}\}\}$`],
    ['money', (n) => `$\\$\{\{${n}\}\}$`],
    ['percent', (n) => `$\{\{${n}\}\}\\%$`],
    ['degrees', (n) => `$\{\{${n}\}\}^\\circ$`],
    ['pi', (n) => `$\{\{${n}\}\}\\pi$`],
  ]) {
    const built = build(label);
    assert.equal(built.generator.constraints.length, 6, `${name} labels lost their pairwise distinctness constraints`);
    for (const { question: instance } of samplePathInstances(built, 120)) {
      const labels = instance.choices.map((choice) => String(choice.label));
      assert.equal(new Set(labels).size, 4, `${name}: a draw produced duplicate choices — ${labels.join(', ')}`);
    }
  }
});

// A percentage is not the same displayed value as a bare number, so the two
// must not be constrained against each other — that would reject draws for no
// reason and skew the ones that survive.
test('a percentage and a plain number are not forced apart', () => {
  const built = asvabItem({
    code: '6.4E', slug: 'mixed-unit-probe', domain: AR, courseId: 'grade6',
    prompt: 'What is the value?',
    generator: {
      parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } },
      derived: {}, constraints: [],
    },
    choices: [
      { label: '$\{\{a\}\}\\%$', correct: true },
      { label: '$\{\{b\}\}\\%$', error: 'signError' },
      { label: 'None of these', error: 'partialTotal' },
      { label: 'Cannot be determined', error: 'arithmeticSlip' },
    ],
    reasoning: ['one', 'two'],
    answerSummary: { headline: 'headline', text: 'text' },
    hint: 'hint', feedback: 'feedback',
  });
  assert.deepEqual(built.generator.constraints, ['a!=b']);
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

test('every rebuilt family carries canonical ASVAB identifiers', () => {
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
  // 400, matching the audit and the probe. A family that genuinely splits 50/50
  // across the two middle ranks reads 62.5% at 120 draws and 50.7% at 3000, so
  // a smaller sample makes this gate fail on noise rather than on content.
  for (const question of draft) {
    const instances = samplePathInstances(question, 400).map((entry) => entry.question).filter(Boolean);
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

// A "lies between" item is only correct when the key really does lie between
// the two bounds the prompt names, and nothing else in this file can tell.
// Every automated gate passed a family whose key was the midpoint a + 1/2 while
// the upper bound was a square root that fell short of it in two draws out of
// three: distinct choices, clean ranks, purposeful distractors, and a key that
// was simply wrong. This evaluates both bounds and the key from the generated
// text and checks the ordering directly.
const numericValue = (text) => {
  const bare = String(text).replace(/\$/g, '').replace(/\s+/g, '');
  const root = /^\\sqrt\{(\d+)\}$/.exec(bare);
  if (root) return Math.sqrt(Number(root[1]));
  const fraction = /^(-?)\\d?frac\{(-?\d+)\}\{(-?\d+)\}$/.exec(bare);
  if (fraction) {
    const value = Number(fraction[2]) / Number(fraction[3]);
    return fraction[1] === '-' ? -value : value;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(bare)) return Number(bare);
  return null;
};

test('a "lies between" item has its key strictly between the two bounds it names', () => {
  const between = draft.filter((question) => /\blies between\b/i.test(String(question.prompt)));
  assert.ok(between.length >= 3, 'expected the between-style families to be found');
  for (const question of between) {
    for (const { question: instance } of samplePathInstances(question, 200)) {
      const bounds = [...String(instance.prompt).matchAll(/\$([^$]+)\$/g)]
        .map((match) => numericValue(`$${match[1]}$`))
        .filter((value) => value !== null);
      assert.equal(bounds.length, 2, `${question.id}: expected two readable bounds in "${instance.prompt}"`);
      const [lowRaw, highRaw] = bounds;
      const low = Math.min(lowRaw, highRaw);
      const high = Math.max(lowRaw, highRaw);
      const keyChoice = instance.choices.find((choice) => choice.id === instance.responseFields[0].expected);
      const key = numericValue(keyChoice.label);
      assert.notEqual(key, null, `${question.id}: could not read the key "${keyChoice.label}"`);
      assert.ok(key > low && key < high,
        `${question.id}: key ${key} is not strictly between ${low} and ${high} — "${instance.prompt}"`);
      // And no distractor may accidentally also satisfy the prompt.
      for (const choice of instance.choices) {
        if (choice.id === keyChoice.id) continue;
        const value = numericValue(choice.label);
        if (value === null) continue;
        assert.ok(!(value > low && value < high),
          `${question.id}: the distractor "${choice.label}" also lies between ${low} and ${high}`);
      }
    }
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

/**
 * A linear equation label, read back as `ax + by = c`.
 *
 * Handles both forms the bank writes, and the ` -5` spacing that collapseSigns
 * produces from `+ {{b}}` when the constant is negative.
 */
const linearEquation = (label) => {
  const raw = String(label).replace(/\$/g, '').replace(/\s+/g, '');
  const coefficient = (digits) => (digits === '' ? 1 : digits === '-' ? -1 : Number(digits));
  const slopeIntercept = /^y=(-?\d*)x([+-]\d+)?$/.exec(raw);
  if (slopeIntercept) {
    return { a: -coefficient(slopeIntercept[1]), b: 1, c: slopeIntercept[2] ? Number(slopeIntercept[2]) : 0 };
  }
  const standard = /^(-?\d*)x([+-]\d*)y=(-?\d+)$/.exec(raw);
  if (standard) {
    const sign = standard[2][0] === '-' ? -1 : 1;
    const magnitude = standard[2].slice(1);
    return { a: coefficient(standard[1]), b: sign * (magnitude === '' ? 1 : Number(magnitude)), c: Number(standard[3]) };
  }
  return null;
};

/** The (x, y) pairs an instance actually puts in front of the student. */
const shownPoints = (instance) => {
  const stimulus = instance.stimulus;
  if (!stimulus) return [];
  if (stimulus.orderedPairs?.length) {
    return stimulus.orderedPairs.map((pair) => ({ x: Number(pair.x), y: Number(pair.y) }));
  }
  const headers = (stimulus.table?.headers || []).map((h) => String(h).replace(/\$/g, '').trim());
  if (headers.length !== 2 || headers[0] !== 'x' || headers[1] !== 'y') return [];
  return (stimulus.table.rows || []).map((row) => {
    const cells = Array.isArray(row) ? row : row.cells;
    return { x: Number(cells[0]), y: Number(cells[1]) };
  });
};

test('an item that shows points and offers a linear equation has a key those points satisfy', () => {
  // The generator agreeing with itself proves nothing: this reads the numbers
  // the student is shown and substitutes them into the equation the item calls
  // correct. An item whose key misses its own data is unanswerable, and no
  // count-based or bias-based check can see it.
  let checked = 0;
  for (const question of draft) {
    for (const { question: instance } of samplePathInstances(question, 60)) {
      const points = shownPoints(instance).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (points.length < 2) continue;
      const keyChoice = instance.choices?.find((choice) => choice.id === instance.responseFields[0].expected);
      const key = keyChoice && linearEquation(keyChoice.label);
      if (!key) continue;
      const satisfies = (line) => points.every((p) => line.a * p.x + line.b * p.y === line.c);
      assert.ok(satisfies(key),
        `${question.id}: the key "${keyChoice.label}" does not pass through every point shown ${JSON.stringify(points)}`);
      for (const choice of instance.choices) {
        if (choice.id === keyChoice.id) continue;
        const line = linearEquation(choice.label);
        if (!line) continue;
        assert.ok(!satisfies(line),
          `${question.id}: the distractor "${choice.label}" also passes through every point shown ${JSON.stringify(points)}`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'no item pairs shown points with a linear-equation key — the check is not reaching anything');
});

test('a negative fraction is read as a number, so a slope item cannot skip the bias check', () => {
  // A leading minus once made the whole label unreadable, and an unreadable
  // choice list is exempt from the magnitude check rather than failing it. Two
  // families offering negative slopes were sitting at a single rank in every
  // draw, invisible, until the parser learned to read them.
  assert.equal(numericLabel('$-\\frac{1}{7}$'), -1 / 7);
  assert.equal(numericLabel('$\\frac{1}{7}$'), 1 / 7);
  assert.equal(numericLabel('$-\\frac{3}{4}$'), -0.75);
  assert.equal(numericLabel('$\\frac{-3}{4}$'), -0.75);
  assert.equal(numericLabel('$-\\frac{5}{0}$'), null);
  assert.equal(numericLabel('$-12$'), -12);

  // And the check it feeds must actually reject a key pinned below every
  // negative-fraction distractor.
  const biased = Array.from({ length: 40 }, (_, index) => choiceItem(
    [`$-\\frac{${index + 9}}{2}$`, `$-\\frac{1}{${index + 2}}$`, `$\\frac{1}{${index + 2}}$`, `$${index + 3}$`],
    0,
  ));
  assert.ok(analyzeAnswerKeyBias(biased).issues.length > 0,
    'a key that is the smallest of four negative-leaning choices must be flagged');
});
