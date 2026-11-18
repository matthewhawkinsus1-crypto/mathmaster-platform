/*
 * WHAT A STUDENT READS ON ONE QUESTION'S SCREEN, IN ORDER — the words the
 * Pre-Flight notes about a question's own wording read
 * (otherQuestionReferencePreflight.js, graphingCalculatorPromptPreflight.js).
 *
 *   questionScreenVersions(question)
 *     The versions a student can be given: a Question Family slot's first
 *     generated version (a family may write the words; semanticValidation.js
 *     judges the same preview), each static variant over the question as the
 *     runtime picks one (problemGenerator.js selectVariant), else the question.
 *
 *   questionScreenText(question) → { stem: [segment], parts: [segment] }
 *     stem   what sets the question up: its scenario, its prompt and the notes
 *            of the panels drawn with it (a review task's stimulus);
 *     parts  what it asks, in screen order: a composed question's steps, the
 *            answer boxes' labels, a tool's own prompts ("equationPrompt"),
 *            then the "Break it down" directions.
 *   A segment is { field, text }. A {{placeholder}} reads as a value ("1").
 *
 *   sentenceClauses(text) → [{ text, start }]
 *     Sentences, cut again where a new instruction starts ("Find m, then use
 *     m to …"): what an earlier instruction on the same screen is read from.
 *   asksSomething(clause) — the clause asks the student for something: a
 *     question, an instruction ("Find …", "Step 2: …").
 *
 * Hints, worked solutions, feedback and "Let's back up" are not read: they
 * come during the question, and say "the point you found" about its own work.
 *
 * Pure and light: no mathjs, no React. Not in a student's first load.
 */
import { isFamilyBackedQuestion, resolveFamilyPreviewInstance } from '../../../functions/shared/questionFamilyInstance.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);

// A template's {{b|signed}} is a number when a student reads it.
const asRead = (value) => String(value ?? '').replace(/\{\{[^{}]*\}\}/g, '1').replace(/\s+/g, ' ').trim();

const STEM_FIELDS = Object.freeze(['scenario', 'stem', 'question', 'prompt']);
// A tool's own prompts (relationshipModel: equationPrompt, domainPrompt, …).
const isToolPrompt = (key) => key.endsWith('Prompt');

const stimulusNotes = (stimulus) => {
  if (typeof stimulus === 'string') return [{ field: 'stimulus', text: stimulus }];
  if (!isObject(stimulus)) return [];
  return asArray(stimulus.panels).flatMap((panel, index) => (isObject(panel)
    ? ['title', 'note', 'text', 'caption']
      .filter((key) => typeof panel[key] === 'string')
      .map((key) => ({ field: `stimulus.panels[${index}].${key}`, text: panel[key] }))
    : []));
};

const directionText = (step) => (typeof step === 'string' ? step : isObject(step) ? step.text ?? step.instruction ?? step.label : '');

export const questionScreenText = (question = {}) => {
  if (!isObject(question)) return { stem: [], parts: [] };
  const segment = (field, text) => ({ field, text: asRead(text) });
  const stem = [
    ...STEM_FIELDS.filter((key) => typeof question[key] === 'string').map((key) => segment(key, question[key])),
    ...stimulusNotes(question.stimulus).map((entry) => segment(entry.field, entry.text)),
  ];
  const parts = [
    ...asArray(question.workflow).map((stage, index) => (isObject(stage) ? segment(`workflow[${index}].prompt`, stage.prompt ?? stage.label) : null)),
    ...asArray(question.answerFields).map((field, index) => (isObject(field) ? segment(`answerFields[${index}].label`, field.label) : null)),
    ...Object.keys(question).filter((key) => isToolPrompt(key) && typeof question[key] === 'string').map((key) => segment(key, question[key])),
    ...asArray(question.directionSteps).map((step, index) => segment(`directionSteps[${index}]`, directionText(step))),
  ];
  return { stem: stem.filter((entry) => entry.text), parts: parts.filter((entry) => entry?.text) };
};

export const questionScreenVersions = (question = {}) => {
  if (!isObject(question)) return [];
  if (isFamilyBackedQuestion(question)) {
    let preview = null;
    try {
      preview = resolveFamilyPreviewInstance(question);
    } catch {
      preview = null;
    }
    // A slot that cannot generate is refused elsewhere (semanticValidation.js);
    // its own words are still what the teacher wrote.
    return [isObject(preview?.question) ? preview.question : question];
  }
  const variants = asArray(question.variants).filter(isObject);
  if (!variants.length) return [question];
  const base = { ...question };
  delete base.variants;
  return variants.map((variant) => ({ ...base, ...variant }));
};

// What an instruction starts with ("Find", "Step 2:", "(b)", "Then use").
// Generous on purpose: an earlier instruction on the screen is what excuses a
// later "the slope you found", and excusing too much only misses a note.
export const INSTRUCTION_VERBS = Object.freeze([
  'add', 'analyze', 'answer', 'apply', 'approximate', 'build', 'calculate', 'check', 'choose', 'circle', 'classify',
  'combine', 'compare', 'complete', 'compute', 'connect', 'construct', 'convert', 'count', 'create', 'decide', 'define',
  'describe', 'determine', 'divide', 'draw', 'enter', 'estimate', 'evaluate', 'expand', 'explain', 'explore', 'express',
  'factor', 'fill', 'find', 'finish', 'give', 'graph', 'identify', 'interpret', 'isolate', 'justify', 'label', 'list',
  'locate', 'look', 'make', 'mark', 'match', 'measure', 'model', 'move', 'multiply', 'name', 'order', 'organize', 'pick',
  'place', 'plot', 'predict', 'prove', 'put', 'rank', 'read', 'record', 'reflect', 'rewrite', 'round', 'select', 'set',
  'shade', 'show', 'simplify', 'sketch', 'solve', 'sort', 'state', 'substitute', 'subtract', 'summarize', 'tell', 'test',
  'trace', 'transform', 'translate', 'try', 'type', 'use', 'verify', 'work', 'write',
]);
const VERBS = INSTRUCTION_VERBS.join('|');
// "Step 2:", "Part B.", "(b)", "b)", "2." — the marks of a numbered instruction.
const STEP_MARK = String.raw`(?:(?:step|part)\s*[a-z0-9]+\s*[:.)\-–—]|\(?[a-z0-9]\)|\d+\.)`;
const LEAD_WORD = String.raw`(?:then|now|first|next|finally|also|lastly|and|so)`;
const INSTRUCTION = new RegExp(String.raw`^(?:${STEP_MARK}\s*)?(?:${LEAD_WORD}\s*,?\s+)?(?:${VERBS})\b`, 'i');
const STEP_ONLY = new RegExp(String.raw`^${STEP_MARK}\s*$|^(?:step|part)\s*(?:\d+|[a-z])\b`, 'i');
const INTERROGATIVE = /^(?:how|what|which|who|whom|whose|when|where|why|is|are|does|do|did|can|could|would|will|should)\b/i;

export const asksSomething = (clause) => {
  const text = String(clause ?? '').trim().replace(/^["“'‘(]+/, '');
  if (!text) return false;
  return text.includes('?') || INSTRUCTION.test(text) || STEP_ONLY.test(text) || INTERROGATIVE.test(text);
};

// Where a new instruction starts inside a sentence: after ";" or ":", at
// ", then" / "then", and at "and" / "but" before an instruction verb.
const CLAUSE_BREAK = new RegExp(String.raw`;\s*|:\s+|,\s*(?:and\s+)?then\s+|\s+then\s+|,?\s+(?:and|but|or)\s+(?=(?:then\s+)?(?:${VERBS})\b)`, 'gi');

/** The clauses of a text, each with where it starts. */
export const sentenceClauses = (text) => {
  const value = String(text ?? '');
  const clauses = [];
  // A sentence ends at . ? or ! before a space (not inside 286.67 or e.g. 2.5x).
  const sentences = [];
  let start = 0;
  const ends = /[.?!]+(?=\s|$)/g;
  let match;
  while ((match = ends.exec(value))) {
    sentences.push({ text: value.slice(start, match.index + match[0].length), start });
    start = match.index + match[0].length;
  }
  if (start < value.length) sentences.push({ text: value.slice(start), start });
  sentences.forEach((sentence) => {
    let from = 0;
    const breaks = new RegExp(CLAUSE_BREAK.source, 'gi');
    let cut;
    while ((cut = breaks.exec(sentence.text))) {
      if (cut.index > from) clauses.push({ text: sentence.text.slice(from, cut.index), start: sentence.start + from });
      from = cut.index + cut[0].length;
    }
    if (from < sentence.text.length) clauses.push({ text: sentence.text.slice(from), start: sentence.start + from });
  });
  return clauses.map((clause) => {
    const lead = clause.text.length - clause.text.trimStart().length;
    return { text: clause.text.trim(), start: clause.start + lead };
  }).filter((clause) => clause.text);
};

/** The sentence of `text` that holds `index`, and where it starts. */
export const sentenceAt = (text, index) => {
  const value = String(text ?? '');
  let start = 0;
  const ends = /[.?!]+(?=\s|$)/g;
  let match;
  while ((match = ends.exec(value))) {
    const end = match.index + match[0].length;
    if (index < end) return { text: value.slice(start, end), start };
    start = end;
  }
  return { text: value.slice(start), start };
};
