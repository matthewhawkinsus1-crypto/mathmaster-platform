// What a worked sibling ("See a similar problem worked") must avoid, and the
// seeded draw it is generated with: shared by the families that work siblings
// for multi-part answer-box items (linearReasoning, perpendicularLines; WE-I).
//
//   siblingGuardOf(question)              → every answer of the item, in each
//                                           spelling a step could use
//   siblingIsSafe(question, guard, example) → true when the sibling's prompt,
//                                           steps and answer state none of them,
//                                           and its prompt states no equation or
//                                           inequality the item itself states
//   statedEquations(text)                 → those equations and inequalities, one
//                                           key each ("y = 3x + 1" is "y=3x+1")
//   seededRandom(seed, question)          → a draw in [0, 1) that the seed and
//                                           the item's visible text fix
//
// The platform runs its own check after these (similarExampleIsSafe); this one
// is stricter, because it also reads the answers as a step would write them:
// ≤ for <=, − for -, spaces around signs and after commas, (1/2)x for 1/2x.
//
// Pure: no React, no I/O.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';

const MINUS = '−';
const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isScalar = (value) => typeof value === 'string' || typeof value === 'number';

/** One answer in the spellings a worked step could write it in. */
export const answerSpellings = (value) => {
  const raw = text(value);
  if (!raw) return [];
  const out = new Set([raw]);
  const symbols = raw.replace(/<=/g, '≤').replace(/>=/g, '≥');
  out.add(symbols);
  const spaced = symbols
    .replace(/\s*([<>≤≥=+])\s*/g, ' $1 ')
    .replace(/(\S)\s*-\s*/g, '$1 - ')
    .replace(/\s+/g, ' ')
    .trim();
  out.add(spaced);
  out.add(spaced.replace(/,\s*/g, ', '));
  out.add(symbols.replace(/,\s*/g, ', '));
  [...out].forEach((entry) => {
    out.add(entry.replace(/(^|[^\d)])(\d+\/\d+)([a-z])/g, '$1($2)$3'));
    out.add(entry.replace(/-/g, MINUS));
    out.add(entry.replace(/−/g, '-'));
  });
  return [...out];
};

/** Every answer of the item (each field's key and accepted answers), in every spelling. */
export const siblingGuardOf = (question) => {
  const values = list(question?.answerFields).filter(isObject).flatMap((field) => answerCandidatesForField(field));
  values.push(...list(question?.acceptedAnswers));
  if (isScalar(question?.answer)) values.push(question.answer);
  return [...new Set(values.filter(isScalar).flatMap(answerSpellings).map(text).filter(Boolean))];
};

const numericValue = (raw) => {
  const value = text(raw).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const fraction = value.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

const mathKey = (value) => text(value).toLowerCase().replace(/[−–]/g, '-').replace(/[()\s$]/g, '').replace(/≤/g, '<=').replace(/≥/g, '>=');

// LaTeX as a student reads it: \frac{4}{3} is (4)/(3); \left( and \right) are brackets; $ is not mathematics.
const fromLatex = (value) => {
  let out = text(value).replace(/\$/g, '').replace(/\\(?:left|right)\s*/g, '').replace(/\\cdot/g, '*');
  for (let pass = 0; pass < 4; pass += 1) out = out.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  return out;
};
const WORD_BREAK = '\u0001';

/** The equations and inequalities a text states. A word (two letters or more) ends one; a lone letter is a variable. */
export const statedEquations = (value) => new Set(fromLatex(value).replace(/[A-Za-z]{2,}/g, WORD_BREAK).split(/[\u0001,;:?\n]|\.\s|\.$/)
  .map((piece) => piece.trim())
  .filter((piece) => /[=<>≤≥]/.test(piece) && /[a-z]/i.test(piece) && /\d/.test(piece))
  .map(mathKey)
  .filter((key) => key.length >= 3));

// "k = 0", "t = 3" or "n ≥ 2" alone is a value or a condition on a letter, not
// a problem. "y = −2" and "x = 5" are lines, so they still count.
const BARE_VALUE = /^[a-wz](?:=|<|>|<=|>=)-?[\d./]+$/;
const itemShows = (question) => [text(question?.prompt), ...list(question?.answerFields).filter(isObject).map((field) => text(field.label))].join('\n');

/** A sibling prompt that states an equation or inequality the item itself states (not a bare value such as k = 0). */
export const sharesItemEquation = (question, prompt) => {
  const itemEquations = statedEquations(itemShows(question));
  return [...statedEquations(prompt)].some((key) => itemEquations.has(key) && !BARE_VALUE.test(key));
};

/** The sibling names none of the item's answers, and is not the item: not its prompt, nor any equation it states. */
export const siblingIsSafe = (question, guard, example) => {
  if (!isObject(example)) return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = list(example.steps).map(text).filter(Boolean);
  if (!prompt || !answer || steps.length < 2 || prompt === text(question?.prompt)) return false;
  if (sharesItemEquation(question, prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const own = numericValue(answer);
  if (own !== null && guard.some((value) => numericValue(value) !== null && Math.abs(numericValue(value) - own) < 1e-9)) return false;
  return ![prompt, ...steps, answer].some((piece) => hintRevealsAnswer(piece, guard));
};

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** A seeded draw (mulberry32) from the seed and what the item shows: its prompt and field labels. */
export const seededRandom = (seed, question) => {
  const labels = list(question?.answerFields).filter(isObject).map((field) => text(field.label || field.id));
  let state = hashText(`${Number(seed) || 0}|${JSON.stringify([text(question?.prompt), labels])}`) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The first sibling of `attempts` draws that passes siblingIsSafe, as { prompt, steps, answer, asks? }; null when none does. */
export const firstSafeSibling = (question, seed, generate, attempts = 200) => {
  const guard = siblingGuardOf(question);
  const random = seededRandom(seed, question);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const example = generate(random);
    if (siblingIsSafe(question, guard, example)) {
      const sibling = { prompt: text(example.prompt), steps: example.steps.map(text).filter(Boolean), answer: text(example.answer) };
      // What the prompt asks for, one entry per part of the answer (tests/platform/weI_algebra1Siblings.test.mjs).
      if (Array.isArray(example.asks)) sibling.asks = example.asks.map(text);
      return sibling;
    }
  }
  return null;
};
