/*
 * THE ATTRIBUTES OF A FUNCTION THAT MODELS A SITUATION (A2.7I) — Recovery
 * for Algebra II Honors Module 1 Lesson 1 Day 2's exit-ticket Q3 (RC01's next
 * shapes).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). Day 2's exit ticket
 * asks for the attributes of a tank filled at a steady rate for a set time, a
 * typed-and-chosen board of three choices:
 *
 *   functions.fillingTankAttributes   "A tank is filled at 4 gallons per minute
 *                                     for exactly 12 minutes. Let V(t)=4t for
 *                                     0 ≤ t ≤ 12." Discrete or continuous; the
 *                                     domain [0, 12]; the range [0, 48]
 *
 * Each version is a new rate and a new time, and every wrong choice is the
 * lesson's own mistake with those numbers: whole minutes only, every real
 * number, the range started at the rate, whole-minute volumes only. Time runs
 * through every value, so the first part is always "continuous"; the domain
 * and range are what change.
 *
 * `recognize` reads exactly that board — the prompt as the family writes it,
 * the three fields' ids and labels, the same choices and the keys the numbers
 * give — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');
const sameMembers = (left, right) => left.length === right.length
  && [...left].map(normalizedText).sort().join('|') === [...right].map(normalizedText).sort().join('|');

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

const tankPrompt = ({ rate, minutes }) => `A tank is filled at ${rate} gallons per minute for exactly ${minutes} minutes. Let V(t)=${rate}t for 0 ≤ t ≤ ${minutes}. Complete the attributes.`;
// The three parts, key first: the lesson's labels and its kinds of mistake.
const tankParts = ({ rate, minutes }) => {
  const full = rate * minutes;
  return [
    { id: 'continuity', label: 'Discrete or continuous?', options: ['continuous', 'discrete'] },
    { id: 'domain', label: 'Domain', options: [`[0, ${minutes}]`, `{0, 1, 2, …, ${minutes}}`, '(−∞, ∞)'] },
    { id: 'range', label: 'Range', options: [`[0, ${full}]`, `[${rate}, ${full}]`, `{0, ${rate}, ${2 * rate}, …, ${full}}`] },
  ].map((part) => ({ ...part, answer: part.options[0] }));
};

export const fillingTankAttributesFamily = defineQuestionFamily({
  id: 'functions.fillingTankAttributes',
  version: 1,
  title: 'The attributes of a tank filled at a steady rate',
  skill: {
    objective: 'Decide whether a function that models a tank filling at a steady rate for a set time is discrete or continuous, and state its domain and range from the situation.',
    alignments: ['A2.7I'],
    strand: 'functions',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => ({ rate: intDomain(2, 9), minutes: intDomain(5, 20) }),
  derive: () => ({}),
  // The rate and the time differ, so no choice reads like another.
  rules: ({ rate, minutes }) => (rate === minutes ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : []),
  fingerprint: ({ rate, minutes }) => fingerprintOf('functions.fillingTankAttributes', [rate, minutes]),
  answer: (values) => {
    const value = Object.fromEntries(tankParts(values).map((part) => [part.id, part.answer]));
    return { kind: 'fields', value, display: Object.values(value).join('; ') };
  },
  tools: {
    multiAnswer: (values) => ({
      type: 'multiAnswer',
      prompt: tankPrompt(values),
      answerFields: tankParts(values).map((part, index) => ({
        id: part.id,
        label: part.label,
        type: 'choice',
        options: rotate(part.options, values.rate + values.minutes + index),
        answer: part.answer,
        inputProfile: 'choice',
      })),
    }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^A tank is filled at (\d+) gallons per minute for exactly (\d+) minutes\. Let V\(t\)=(\d+)t for 0 ≤ t ≤ (\d+)\. Complete the attributes\.$/.exec(normalizedText(question?.prompt));
    if (!match || match[1] !== match[3] || match[2] !== match[4]) return null;
    const values = { rate: Number(match[1]), minutes: Number(match[2]) };
    if (values.rate < 2 || values.rate > 9 || values.minutes < 5 || values.minutes > 20 || values.rate === values.minutes) return null;
    const fields = list(question?.answerFields);
    const parts = tankParts(values);
    if (fields.length !== parts.length) return null;
    const same = parts.every((part) => {
      const field = fields.find((entry) => clean(entry?.id) === part.id);
      return Boolean(field) && clean(field.type) === 'choice' && normalizedText(field.label) === part.label
        && sameMembers(list(field.options).map(clean), part.options) && normalizedText(field.answer) === normalizedText(part.answer);
    });
    return same ? { params: values, constraints: {} } : null;
  },
  recovery: { eligible: true },
});

export const FUNCTION_CONTEXT_FAMILIES = Object.freeze([fillingTankAttributesFamily]);
