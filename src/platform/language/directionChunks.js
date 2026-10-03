/*
 * BREAK IT DOWN — an item's directions as short numbered steps.
 *
 * Support `chunked-directions` (functions/shared/supportCatalog.mjs). This is
 * LINGUISTIC chunking: the same task, asked the same way, in smaller pieces.
 * It is neither `visual-chunking` (one step of a multi-step task on screen at a
 * time) nor `directions-multiple-ways` (an adult re-presenting directions).
 *
 * Deterministic and curated, never generated at runtime:
 *
 *   1. authored  `question.directionSteps` — steps written with the item;
 *   2. curated   a small library of reviewed restatements for recurring
 *                direction shapes (the brief's correlation example);
 *   3. rules     the item's own sentences, with a joined second instruction
 *                ("… and justify your conclusion") split into its own step and
 *                a list of choices ("positive, negative, or no correlation")
 *                shown as bullets — the original words, never new ones.
 *
 * Every result is checked: the mathematics must be carried exactly
 * (mathSafeText.js preservesMath), a step may not introduce a number or an
 * expression the item does not contain, and the rule-based steps must use the
 * item's words in the item's order. Anything that fails is not shown. One
 * short sentence is already one step: `null` (not applicable).
 */
import { maskMath, mathTokensOf, preservesMath, splitSentences } from './mathSafeText.js';

const MAX_STEPS = 6;

// Verbs that start a separate instruction when joined by "and"/", then".
const DIRECTIVE = [
  'justify', 'explain', 'show', 'write', 'describe', 'identify', 'find', 'solve', 'graph', 'enter', 'use', 'check',
  'interpret', 'compare', 'determine', 'select', 'choose', 'name', 'plot', 'round', 'state', 'label', 'compute',
  'calculate', 'evaluate', 'simplify', 'factor', 'decide', 'predict', 'tell', 'give', 'classify', 'build', 'complete',
  'create', 'draw', 'list', 'sketch', 'rewrite', 'substitute', 'verify', 'record', 'type', 'mark', 'shade', 'support',
];
const DIRECTIVE_PATTERN = DIRECTIVE.join('|');
const JOIN = new RegExp(`(?:,\\s*and\\s+then|,\\s*then|;\\s*then|\\s+and\\s+then|,\\s*and|\\s+and|;)\\s+(?=(?:${DIRECTIVE_PATTERN})\\b)`, 'i');

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const endSentence = (text) => (/[.?!:]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const words = (text) => String(text || '').toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) || [];
const JOINERS = new Set(['and', 'then']);

/** A list of 3+ short prose options: "positive, negative, or no correlation". */
// Single-word options, the last one with up to two more words for its noun.
const OPTIONS = /(?:^|\s)([A-Za-z-]+),\s+([A-Za-z-]+),?\s+(?:or|and)\s+((?:[A-Za-z-]+\s){0,2}[A-Za-z-]+)(?=[.?!,;]|\s*$)/;
const LEADING_ARTICLE = /^(?:a|an|the)\s+/i;

const optionsIn = (sentence) => {
  const { masked } = maskMath(sentence);
  const match = masked.match(OPTIONS);
  if (!match || /⟦\d+⟧/.test(match[0])) return null;
  const options = [match[1], match[2], match[3]].map((option) => option.replace(LEADING_ARTICLE, '').trim()).filter(Boolean);
  return options.length === 3 && options.every((option) => option.split(/\s+/).length <= 3) ? options : null;
};

/** Curated restatements, reviewed by hand; matched on the masked prompt. */
const CURATED = [
  {
    id: 'correlation-type-justify',
    match: /\bcorrelation\b/i,
    requires: /\b(justify|explain)\b/i,
    asks: /\bpositive\b.*\bnegative\b.*\b(no|none)\b/i,
    steps: [
      { text: 'Look at the data.' },
      { text: 'Decide the type of correlation:', options: ['positive', 'negative', 'none'] },
      { text: 'Explain how you know.' },
    ],
  },
];

const curatedSteps = (prompt) => {
  const { masked } = maskMath(prompt);
  const entry = CURATED.find((item) => item.match.test(masked) && (!item.requires || item.requires.test(masked)) && (!item.asks || item.asks.test(masked)));
  return entry ? { source: 'curated', id: entry.id, steps: entry.steps.map((step) => ({ ...step })) } : null;
};

const isChoiceLine = (sentence) => /^\s*\(?[A-Ea-e][).:]\s+/.test(sentence);

/** Rule-based steps from the item's own sentences. */
const ruleSteps = (prompt) => {
  const lines = String(prompt || '').split('\n').filter((line) => line.trim() && !isChoiceLine(line));
  const steps = [];
  lines.forEach((line) => {
    splitSentences(line).forEach((sentence) => {
      // Split only in prose, never inside mathematics.
      const { masked, tokens } = maskMath(sentence);
      const parts = masked.split(JOIN).map((part) => part.trim()).filter(Boolean);
      parts.forEach((part, index) => {
        const restored = part.replace(/⟦(\d+)⟧/g, (whole, slot) => tokens[Number(slot)] ?? whole);
        const text = index === 0 ? endSentence(restored) : endSentence(capitalize(restored));
        const options = optionsIn(text);
        steps.push(options ? { text, options } : { text });
      });
    });
  });
  return steps;
};

/**
 * Does every step keep to the item's own mathematics — no number, variable or
 * expression the item does not already contain?
 */
const keepsToTheItem = (prompt, steps) => {
  const allowed = mathTokensOf(prompt);
  return steps.every((step) => mathTokensOf(step.text).every((token) => allowed.some((source) => source.includes(token))));
};

/**
 * The steps for one item, or null when breaking it down is not applicable.
 * `{ source: 'authored' | 'curated' | 'rules', steps: [{ text, options? }] }`.
 */
export const chunkDirections = (prompt, { authoredSteps = null } = {}) => {
  const text = String(prompt ?? '').trim();
  if (!text) return null;

  const authored = (Array.isArray(authoredSteps) ? authoredSteps : [])
    .map((step) => (typeof step === 'string' ? { text: step.trim() } : { text: String(step?.text || '').trim(), options: step?.options }))
    .filter((step) => step.text);
  if (authored.length >= 2 && keepsToTheItem(text, authored)) {
    return { source: 'authored', steps: authored.slice(0, MAX_STEPS) };
  }

  const curated = curatedSteps(text);
  if (curated && keepsToTheItem(text, curated.steps)) return curated;

  const steps = ruleSteps(text);
  if (steps.length < 2 && !(steps.length === 1 && steps[0].options)) return null;
  // The rule-based steps are the item's own words, in order (only "and" /
  // "then" joiners may drop out), and its mathematics, exactly.
  const original = words(text.split('\n').filter((line) => !isChoiceLine(line)).join(' ')).filter((word) => !JOINERS.has(word));
  const rebuilt = words(steps.map((step) => step.text).join(' ')).filter((word) => !JOINERS.has(word));
  if (original.join(' ') !== rebuilt.join(' ')) return null;
  const promptWithoutChoices = text.split('\n').filter((line) => !isChoiceLine(line)).join('\n');
  if (!preservesMath(promptWithoutChoices, steps.map((step) => step.text).join(' '))) return null;
  return { source: 'rules', steps: steps.slice(0, MAX_STEPS) };
};

export default chunkDirections;
