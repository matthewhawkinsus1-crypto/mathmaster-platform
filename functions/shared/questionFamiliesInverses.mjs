/*
 * INVERSES OF RELATIONS AND LINEAR FUNCTIONS (A2.2B, A2.7I) — Recovery for
 * the typed-and-chosen boards of Algebra II Honors Module 1 Lessons 3 and 4
 * (RC01's next shapes).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). Lesson 3 ("Inverse
 * Linear Functions") had none, and Lesson 4's Warm-Up 1 reviews the same
 * inverse. Each family writes one of those boards with new numbers:
 *
 *   functions.swapPairAndEvaluate  L3 Warm-Up 1: the swapped ordered pair of
 *                                  (p, q), chosen, and f(c) for f(x)=mx+b,
 *                                  typed
 *   relations.inverseOfSet         L3 DOL 1: the inverse of a relation of
 *                                  three ordered pairs, chosen, and how an
 *                                  inverse is made
 *   functions.inverseOfLinear      L3 DOL 2 and L4 Warm-Up 1: f⁻¹(x) for
 *                                  f(x)=ax+b and one check, both chosen; the
 *                                  same board in two lessons, at two rigors
 *                                  (`task`, a strict concept)
 *   functions.inverseInContext     L3 DOL 3: C⁻¹ for a subscription C(m)=rm+f,
 *                                  chosen, and the months a total pays for,
 *                                  typed
 *
 * Every wrong choice is the lesson's own mistake for the version's numbers
 * (an inverse that undoes the multiplication but repeats the constant, one
 * that flips the constant's sign but keeps multiplying, one that changes the
 * sign of ax; a pair negated as well as swapped, the pair or relation as
 * given; a check with input and output kept or a sign changed), so a version
 * is the lesson's question with new numbers, never an easier one.
 *
 * `recognize` reads exactly those boards — the prompt as the family writes it,
 * the fields' ids and labels, the same choices and the keys the numbers give —
 * and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  CONSTRAINT_POLICY,
  FAMILY_ISSUE,
  choiceKnob,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));
const pairText = ([x, y]) => `(${shown(x)}, ${shown(y)})`;
const setText = (pairs) => `{${pairs.map(pairText).join(', ')}}`;

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

const choiceField = (id, label, options, answer, offset = 0) => ({
  id,
  label,
  type: 'choice',
  options: rotate(options, offset),
  answer,
  inputProfile: 'choice',
});
const numberField = (id, label, answer) => ({
  id,
  label,
  answer,
  inputProfile: 'number',
  answerFormat: 'number',
  inputContract: { format: 'number' },
});

/** The board's fields by id, when there are exactly `ids` of them. */
const fieldsById = (question, ids) => {
  const fields = list(question?.answerFields);
  if (fields.length !== ids.length) return null;
  const byId = new Map(fields.map((field) => [clean(field?.id), field]));
  return ids.every((id) => byId.has(id)) ? byId : null;
};
const sameMembers = (left, right) => left.length === right.length
  && [...left].map(normalizedText).sort().join('|') === [...right].map(normalizedText).sort().join('|');
/** A choice field written exactly as the family writes it: label, the same choices, the key. */
const isChoice = (field, written) => clean(field?.type) === 'choice'
  && normalizedText(field?.label) === normalizedText(written.label)
  && sameMembers(list(field?.options).map(clean), written.options)
  && normalizedText(field?.answer) === normalizedText(written.answer);
/** A number box written exactly as the family writes it: label and key. */
const isNumber = (field, written) => clean(field?.answerFormat) === 'number' && !clean(field?.type) && !Array.isArray(field?.options)
  && normalizedText(field?.label) === normalizedText(written.label)
  && Number(field?.answer) === Number(written.answer) && Number.isFinite(Number(field?.answer));

/* ---------------------------------------------------------------------------
 * The inverse of y = ax + b, and its three mistakes.
 * ------------------------------------------------------------------------- */

/** "4x−9", "2x+5" */
const linearText = (a, b, variable = 'x') => `${a}${variable}${b < 0 ? MINUS : '+'}${Math.abs(b)}`;

/**
 * The key first: swap x and y and undo both steps. Then the lesson's three
 * mistakes: undo the multiplication but repeat the constant; flip the
 * constant's sign but keep multiplying; change the sign of ax.
 */
const inverseChoices = (a, b) => {
  const size = Math.abs(b);
  const undo = b < 0 ? '+' : MINUS;
  const repeat = b < 0 ? MINUS : '+';
  return [`(x${undo}${size})/${a}`, `(x${repeat}${size})/${a}`, `${a}x${undo}${size}`, `${size}${MINUS}${a}x`];
};

/* ---------------------------------------------------------------------------
 * functions.inverseOfLinear
 * ------------------------------------------------------------------------- */

export const INVERSE_TASKS = Object.freeze(['find', 'review']);
// The rigor each lesson asks it at: L3's exit ticket, L4's Warm-Up review.
const TASK_DIFFICULTY = Object.freeze({
  find: Object.freeze({ band: 3, dok: 2 }),
  review: Object.freeze({ band: 2, dok: 2 }),
});
const INVERSE_PROMPTS = Object.freeze({
  find: ({ a, b }) => `Find the inverse of f(x)=${linearText(a, b)}.`,
  review: ({ a, b }) => `Review inverses. For f(x)=${linearText(a, b)}, identify f⁻¹(x) and one check.`,
});
const INVERSE_PROMPT_PATTERNS = Object.freeze({
  find: /^Find the inverse of f\(x\)=(\d)x([+-])(\d)\.$/,
  review: /^Review inverses\. For f\(x\)=(\d)x([+-])(\d), identify f⁻¹\(x\) and one check\.$/,
});

const inverseOfLinearParts = ({ a, b, c }) => {
  const d = a * c + b;
  const options = inverseChoices(a, b);
  return {
    inverse: { label: 'f⁻¹(x)', options, answer: options[0] },
    check: {
      label: `If f(${c})=${shown(d)}, then`,
      options: [`f⁻¹(${shown(d)})=${c}`, `f⁻¹(${c})=${shown(d)}`, `f⁻¹(${shown(d)})=${MINUS}${c}`],
      answer: `f⁻¹(${shown(d)})=${c}`,
    },
  };
};

export const inverseOfLinearFamily = defineQuestionFamily({
  id: 'functions.inverseOfLinear',
  version: 1,
  title: 'Find the inverse of a linear function and check it with one value',
  skill: {
    objective: 'Find the inverse of f(x) = ax + b by swapping x and y and undoing each step, and use an inverse to send an output back to its input.',
    alignments: ['A2.2B'],
    strand: 'functions',
  },
  difficulty: { ...TASK_DIFFICULTY.find },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: { task: choiceKnob('find', INVERSE_TASKS, { label: 'Find it (an exit ticket) or review it (a Warm-Up)' }) },
  conceptConstraints: ['task'],
  parameters: () => ({ a: intDomain(2, 9), b: intDomain(-9, 9, { exclude: [0] }), c: intDomain(1, 9) }),
  derive: ({ a, b, c }) => ({ d: a * c + b }),
  // The check's output is a positive whole number, as in both lessons, and
  // is not its own input (or the check's first two choices would agree).
  rules: ({ c, d }) => (d < 1 || d === c ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : []),
  // The function and the check are the question; how it is asked is not.
  fingerprint: ({ a, b, c }) => fingerprintOf('functions.inverseOfLinear', [a, b, c]),
  answer: (values) => {
    const parts = inverseOfLinearParts(values);
    return { kind: 'fields', value: { inverse: parts.inverse.answer, check: parts.check.answer }, display: `${parts.inverse.answer}; ${parts.check.answer}` };
  },
  tools: {
    multiAnswer: (values, { constraints: c }) => {
      const parts = inverseOfLinearParts(values);
      return {
        type: 'multiAnswer',
        prompt: (INVERSE_PROMPTS[c?.task] || INVERSE_PROMPTS.find)(values),
        answerFields: [
          choiceField('inverse', parts.inverse.label, parts.inverse.options, parts.inverse.answer, values.a + values.b),
          choiceField('check', parts.check.label, parts.check.options, parts.check.answer, values.c),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  difficultyFor: (c) => ({ ...(TASK_DIFFICULTY[c?.task] || TASK_DIFFICULTY.find) }),
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const prompt = normalizedText(question?.prompt);
    const task = INVERSE_TASKS.find((name) => INVERSE_PROMPT_PATTERNS[name].test(prompt));
    if (!task) return null;
    const [, a, sign, size] = INVERSE_PROMPT_PATTERNS[task].exec(prompt);
    const byId = fieldsById(question, ['inverse', 'check']);
    const check = /^If f\((\d)\)=(-?\d+), then$/.exec(normalizedText(byId?.get('check')?.label));
    if (!byId || !check) return null;
    const values = { a: Number(a), b: sign === '-' ? -Number(size) : Number(size), c: Number(check[1]) };
    if (values.a < 2 || values.b === 0 || values.c < 1) return null;
    const d = values.a * values.c + values.b;
    if (d < 1 || d === values.c || Number(check[2]) !== d) return null;
    const parts = inverseOfLinearParts(values);
    if (!isChoice(byId.get('inverse'), parts.inverse) || !isChoice(byId.get('check'), parts.check)) return null;
    return { params: values, constraints: { task } };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.inverseInContext
 * ------------------------------------------------------------------------- */

const contextPrompt = ({ rate, fee }) => `A subscription cost is C(m)=${rate}m+${fee}, where m is months and C is total dollars. Use the inverse relationship.`;
const contextParts = ({ rate, fee, months }) => {
  const options = inverseChoices(rate, fee);
  return {
    inverse: { label: 'm=C⁻¹(x)', options, answer: options[0] },
    months: { label: `Months represented by a total cost of $${rate * months + fee}`, answer: months },
  };
};

export const inverseInContextFamily = defineQuestionFamily({
  id: 'functions.inverseInContext',
  version: 1,
  title: 'Use the inverse of a linear cost function to find the input for a total',
  skill: {
    objective: 'Write the inverse of a linear cost function C(m) = rm + f and use it to find the number of months a total cost represents.',
    alignments: ['A2.2B'],
    strand: 'functions',
  },
  difficulty: { band: 3, dok: 3 },
  constraints: {},
  parameters: () => ({ rate: intDomain(5, 30), fee: intDomain(5, 60), months: intDomain(2, 24) }),
  derive: () => ({}),
  // The rate and the fee differ, so the inverse's two numbers never read alike.
  rules: ({ rate, fee }) => (rate === fee ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : []),
  fingerprint: ({ rate, fee, months }) => fingerprintOf('functions.inverseInContext', [rate, fee, months]),
  answer: (values) => {
    const parts = contextParts(values);
    return { kind: 'fields', value: { inverse: parts.inverse.answer, months: values.months }, display: `${parts.inverse.answer}; ${values.months}` };
  },
  tools: {
    multiAnswer: (values) => {
      const parts = contextParts(values);
      return {
        type: 'multiAnswer',
        prompt: contextPrompt(values),
        answerFields: [
          choiceField('inverse', parts.inverse.label, parts.inverse.options, parts.inverse.answer, values.rate + values.months),
          numberField('months', parts.months.label, parts.months.answer),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^A subscription cost is C\(m\)=(\d+)m\+(\d+), where m is months and C is total dollars\. Use the inverse relationship\.$/.exec(normalizedText(question?.prompt));
    const byId = fieldsById(question, ['inverse', 'months']);
    if (!match || !byId) return null;
    const rate = Number(match[1]);
    const fee = Number(match[2]);
    const total = /^Months represented by a total cost of \$(\d+)$/.exec(normalizedText(byId.get('months')?.label));
    if (!total) return null;
    const months = (Number(total[1]) - fee) / rate;
    const values = { rate, fee, months };
    if (rate < 5 || rate > 30 || fee < 5 || fee > 60 || rate === fee || !Number.isInteger(months) || months < 2 || months > 24) return null;
    const parts = contextParts(values);
    if (!isChoice(byId.get('inverse'), parts.inverse) || !isNumber(byId.get('months'), parts.months)) return null;
    return { params: values, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * relations.inverseOfSet
 * ------------------------------------------------------------------------- */

const SET_RULE = Object.freeze({
  label: 'Inverse relations are made by',
  options: Object.freeze(['swapping x and y', 'negating x and y', 'adding x and y']),
  answer: 'swapping x and y',
});

const setPairs = ({ x1, g1, g2, y1, y2, y3 }) => [[x1, y1], [x1 + g1, y2], [x1 + g1 + g2, y3]];
const setParts = (pairs) => {
  const swapped = setText(pairs.map(([x, y]) => [y, x]));
  // A pair negated as well as swapped: −0 is written 0.
  const negated = setText(pairs.map(([x, y]) => [0 - y || 0, 0 - x || 0]));
  return {
    inverse: { label: 'Inverse relation', options: [swapped, negated, setText(pairs)], answer: swapped },
    rule: SET_RULE,
  };
};

export const inverseOfSetFamily = defineQuestionFamily({
  id: 'relations.inverseOfSet',
  version: 1,
  title: 'Find the inverse of a relation given as ordered pairs',
  skill: {
    objective: 'Find the inverse of a relation given as a set of ordered pairs by swapping each pair\'s coordinates, and say how an inverse relation is made.',
    alignments: ['A2.2B'],
    strand: 'functions',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  // Three pairs listed by input, as the lesson lists them.
  parameters: () => ({
    x1: intDomain(-6, 4),
    g1: intDomain(1, 4),
    g2: intDomain(1, 4),
    y1: intDomain(-9, 9),
    y2: intDomain(-9, 9),
    y3: intDomain(-9, 9),
  }),
  derive: (params) => ({ pairs: setPairs(params) }),
  // A pair (a, a) swaps to itself and a pair (a, −a) negates back to itself,
  // so neither may appear; the outputs differ, so the inverse is a function too.
  rules: ({ pairs }) => {
    const issues = [];
    if (pairs.some(([x, y]) => x === y || x === -y)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (new Set(pairs.map(([, y]) => y)).size !== pairs.length) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    return issues;
  },
  fingerprint: ({ pairs }) => fingerprintOf('relations.inverseOfSet', pairs.map(([x, y]) => `${x},${y}`)),
  answer: ({ pairs }) => {
    const parts = setParts(pairs);
    return { kind: 'fields', value: { inverse: parts.inverse.answer, rule: SET_RULE.answer }, display: parts.inverse.answer };
  },
  tools: {
    multiAnswer: ({ pairs }) => {
      const parts = setParts(pairs);
      return {
        type: 'multiAnswer',
        prompt: `Find the inverse relation of ${setText(pairs)}.`,
        answerFields: [
          choiceField('inverse', parts.inverse.label, parts.inverse.options, parts.inverse.answer, pairs[0][0] + pairs[2][1]),
          choiceField('rule', SET_RULE.label, [...SET_RULE.options], SET_RULE.answer, pairs[1][1]),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^Find the inverse relation of \{\((-?\d+), (-?\d+)\), \((-?\d+), (-?\d+)\), \((-?\d+), (-?\d+)\)\}\.$/.exec(normalizedText(question?.prompt));
    const byId = fieldsById(question, ['inverse', 'rule']);
    if (!match || !byId) return null;
    const [x1, y1, x2, y2, x3, y3] = match.slice(1).map(Number);
    const params = { x1, g1: x2 - x1, g2: x3 - x2, y1, y2, y3 };
    if (x1 < -6 || x1 > 4 || params.g1 < 1 || params.g1 > 4 || params.g2 < 1 || params.g2 > 4) return null;
    if ([y1, y2, y3].some((y) => y < -9 || y > 9)) return null;
    const pairs = setPairs(params);
    if (pairs.some(([x, y]) => x === y || x === -y) || new Set([y1, y2, y3]).size !== 3) return null;
    const parts = setParts(pairs);
    if (!isChoice(byId.get('inverse'), parts.inverse) || !isChoice(byId.get('rule'), SET_RULE)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.swapPairAndEvaluate
 * ------------------------------------------------------------------------- */

const SWAP_PROMPT = 'Review ordered pairs and function notation.';
const swapParts = ({ p, q, m, b, c }) => ({
  swap: {
    label: `If ${pairText([p, q])} is in a relation, the swapped ordered pair is`,
    options: [pairText([q, p]), pairText([-q, -p]), pairText([p, q])],
    answer: pairText([q, p]),
  },
  eval: { label: `If f(x)=${linearText(m, b)}, then f(${c})=`, answer: m * c + b },
});

export const swapPairAndEvaluateFamily = defineQuestionFamily({
  id: 'functions.swapPairAndEvaluate',
  version: 1,
  title: 'Swap an ordered pair and evaluate a linear function',
  skill: {
    objective: 'Swap the coordinates of an ordered pair in a relation, and evaluate a linear function written in function notation.',
    alignments: ['A2.7I'],
    strand: 'functions',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  // The pair (negative, positive), as the lesson's is; f(x) = mx + b at a small input.
  parameters: () => ({
    p: intDomain(-9, -1),
    q: intDomain(1, 9),
    m: intDomain(2, 5),
    b: intDomain(-9, 9, { exclude: [0] }),
    c: intDomain(1, 6),
  }),
  derive: () => ({}),
  // (−3, 3) would negate and swap back to itself.
  rules: ({ p, q }) => (-p === q ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : []),
  fingerprint: ({ p, q, m, b, c }) => fingerprintOf('functions.swapPairAndEvaluate', [p, q, m, b, c]),
  answer: (values) => {
    const parts = swapParts(values);
    return { kind: 'fields', value: { swap: parts.swap.answer, eval: parts.eval.answer }, display: `${parts.swap.answer}; ${parts.eval.answer}` };
  },
  tools: {
    multiAnswer: (values) => {
      const parts = swapParts(values);
      return {
        type: 'multiAnswer',
        prompt: SWAP_PROMPT,
        answerFields: [
          choiceField('swap', parts.swap.label, parts.swap.options, parts.swap.answer, values.q - values.p),
          numberField('eval', parts.eval.label, parts.eval.answer),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer' || normalizedText(question?.prompt) !== normalizedText(SWAP_PROMPT)) return null;
    const byId = fieldsById(question, ['swap', 'eval']);
    if (!byId) return null;
    const pair = /^If \((-?\d+), (-?\d+)\) is in a relation, the swapped ordered pair is$/.exec(normalizedText(byId.get('swap')?.label));
    const rule = /^If f\(x\)=(\d)x([+-])(\d), then f\((\d)\)=$/.exec(normalizedText(byId.get('eval')?.label));
    if (!pair || !rule) return null;
    const values = {
      p: Number(pair[1]),
      q: Number(pair[2]),
      m: Number(rule[1]),
      b: rule[2] === '-' ? -Number(rule[3]) : Number(rule[3]),
      c: Number(rule[4]),
    };
    if (values.p < -9 || values.p > -1 || values.q < 1 || values.q > 9 || -values.p === values.q) return null;
    if (values.m < 2 || values.m > 5 || values.b === 0 || values.c < 1 || values.c > 6) return null;
    const parts = swapParts(values);
    if (!isChoice(byId.get('swap'), parts.swap) || !isNumber(byId.get('eval'), parts.eval)) return null;
    return { params: values, constraints: {} };
  },
  recovery: { eligible: true },
});

export const INVERSE_FAMILIES = Object.freeze([
  swapPairAndEvaluateFamily,
  inverseOfSetFamily,
  inverseOfLinearFamily,
  inverseInContextFamily,
]);
