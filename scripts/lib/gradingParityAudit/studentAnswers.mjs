/*
 * WHAT A STUDENT TYPES INTO ONE BOX OF A REAL ITEM, AND WHAT IT SHOULD EARN.
 *
 *   studentAnswersFor({ key, accepted, field, question, seed })
 *     -> [{ text, category, spellingClass, expect, firm }]
 *
 * category / expect:
 *
 *   right         the key in another spelling (the equivalence sweep's typed
 *                 spellings, scripts/lib/typedAnswerSpellings.mjs; the math
 *                 editor's LaTeX, scripts/lib/editorTypedSpelling.mjs; a
 *                 Unicode minus; no spaces; a pair with spaces; an inequality
 *                 read from the other side)               expect 'right'
 *   wrong         one slip away: the sweep's near misses, and a sign error,
 *                 off by one, coordinates swapped, the reciprocal, a term
 *                 left out, a relation's strictness changed, a set element
 *                 left out                                expect 'wrong'
 *   unsimplified  the key's value not in the form the field asks for
 *                 (factoredForm, simplestRadicalForm, simplifiedPolynomial)
 *                                                         expect 'wrong'
 *   edge          blank, unfinished, over-long, a lone operator, an empty
 *                 LaTeX placeholder, words                expect 'not-right'
 *
 * Every right and wrong answer is checked against the key with the
 * independent reading (mathOracle.mjs): a "right" spelling it reads as
 * another value, or a "wrong" one it reads as the same value, is dropped
 * (the generator was wrong, not the grader). Where it cannot read one side
 * the answer is kept with `firm: false`, and a surprising verdict on it is
 * listed for review, never as a confirmed bug.
 *
 * Pure; seeded only through the oracle's sample points.
 */
import { editorTypedSpellings } from '../editorTypedSpelling.mjs';
import { typedNearMissesOf, typedSpellingsOf } from '../typedAnswerSpellings.mjs';
import { MAX_TYPED_ANSWER_LENGTH } from '../../../functions/shared/typedEntryGuard.mjs';
import { compareToKey, expandedPolynomial, relationParts } from './mathOracle.mjs';

const text = (value) => String(value ?? '').trim();

/** The box's kind, as the oracle reads it. */
export const fieldKind = (field = {}) => {
  const profile = text(field.inputProfile || field.answerFormat || field.inputContract?.format).toLowerCase();
  if (['number', 'expression', 'equation', 'inequality', 'set', 'interval'].includes(profile)) return profile;
  if (['orderedpair', 'ordered-pair', 'point'].includes(profile)) return 'orderedPair';
  const key = text(field.answer);
  if (/^\(.*,.*\)$/.test(key)) return 'orderedPair';
  if (/^\{.*\}$/.test(key)) return 'set';
  if (/[<>≤≥]/.test(key)) return 'inequality';
  if (key.includes('=')) return 'equation';
  return /[A-Za-z]/.test(key) ? 'expression' : 'number';
};

/** The form the field asks for, or null. */
export const formRuleOf = (field = {}) => {
  if (['factoredForm', 'simplestRadicalForm'].includes(field.gradingMode)) return field.gradingMode;
  if (field.answerForm === 'simplifiedPolynomial') return 'simplifiedPolynomial';
  return null;
};

/* ------------------------------------------------------------------ the slips */

const NUMBER = /(?<![\w.^])(\d+(?:\.\d+)?)(?![\w.])/g;

/** Every way of moving one number of the key by one. */
const offByOne = (key) => {
  const out = [];
  for (const match of key.matchAll(NUMBER)) {
    const value = Number(match[1]);
    const decimals = (match[1].split('.')[1] || '').length;
    for (const step of [1, -1]) {
      const moved = (value + step * 10 ** -decimals).toFixed(decimals);
      if (Number(moved) < 0) continue;
      out.push(`${key.slice(0, match.index)}${moved}${key.slice(match.index + match[1].length)}`);
    }
    if (out.length >= 2) break;
  }
  return out;
};

/** The first sign of the key changed (a leading minus dropped, or one added). */
const signError = (key, kind) => {
  if (kind === 'orderedPair') {
    const body = key.replace(/^\(|\)$/g, '');
    const [x, ...rest] = body.split(',');
    const flipped = x.trim().startsWith('-') ? x.trim().slice(1) : `-${x.trim()}`;
    return [`(${flipped},${rest.join(',')})`];
  }
  const { parts, signs } = relationParts(key);
  if (signs.length > 1) return [];
  const side = parts.length === 2 ? 1 : 0;
  const target = parts[side].trim();
  if (!target) return [];
  // The first inner + or − of the side, else its leading sign.
  const inner = /(?<=[\w)\]}√])\s*([+-])\s*/.exec(target);
  let next;
  if (inner) next = `${target.slice(0, inner.index)}${inner[1] === '+' ? '-' : '+'}${target.slice(inner.index + inner[0].length)}`;
  else next = target.startsWith('-') ? target.slice(1) : `-${target}`;
  const rebuilt = [...parts];
  rebuilt[side] = next;
  return [signs.length ? `${rebuilt[0].trim()}${signs[0]}${rebuilt[1]}` : next];
};

const swappedPair = (key) => {
  const match = /^\(([^,]+),([^,]+)\)$/.exec(key.replace(/\s+/g, ''));
  return match && match[1] !== match[2] ? [`(${match[2]},${match[1]})`] : [];
};

const reciprocal = (key) => {
  const fraction = /^(-?)(\d+)\/(\d+)$/.exec(key.replace(/\s+/g, ''));
  if (fraction) return fraction[2] === fraction[3] ? [] : [`${fraction[1]}${fraction[3]}/${fraction[2]}`];
  const whole = /^(-?)(\d+)$/.exec(key.replace(/\s+/g, ''));
  if (whole && !['0', '1'].includes(whole[2])) return [`${whole[1]}1/${whole[2]}`];
  return [];
};

/** The last term of a sum left out (one side of a relation too). */
const missingTerm = (key) => {
  const { parts, signs } = relationParts(key);
  if (signs.length > 1) return [];
  const out = [];
  parts.forEach((part, index) => {
    let depth = 0;
    let cut = -1;
    for (let at = part.length - 1; at > 0; at -= 1) {
      if (')]}'.includes(part[at])) depth += 1;
      else if ('([{'.includes(part[at])) depth -= 1;
      else if (depth === 0 && '+-'.includes(part[at]) && /[\w)\]}√|]/.test(part.slice(0, at).trim().slice(-1))) { cut = at; break; }
    }
    if (cut <= 0) return;
    const rebuilt = [...parts];
    rebuilt[index] = part.slice(0, cut).trim();
    out.push(signs.length ? `${rebuilt[0].trim()}${signs[0]}${rebuilt[1].trim()}` : rebuilt[0]);
  });
  return out;
};

const strictness = (key) => {
  const swap = { '<': '<=', '<=': '<', '>': '>=', '>=': '>', '≤': '<', '≥': '>' };
  const match = /<=|>=|≤|≥|<|>/.exec(key);
  return match ? [`${key.slice(0, match.index)}${swap[match[0]]}${key.slice(match.index + match[0].length)}`] : [];
};

const setSlips = (key) => {
  const body = /^\{(.*)\}$/.exec(key.trim());
  if (!body) return [];
  const items = body[1].split(',').map((item) => item.trim()).filter(Boolean);
  const out = [];
  if (items.length > 1) out.push(`{${items.slice(0, -1).join(', ')}}`);
  if (items.length && !/±/.test(items[0])) out.push(`{${[...items, items[0].startsWith('-') ? items[0].slice(1) : `-${items[0]}`].join(', ')}}`);
  return out;
};

/* ------------------------------------------------------------------ the spellings */

const flippedInequality = (key) => {
  const { parts, signs } = relationParts(key);
  if (signs.length !== 1 || signs[0] === '=') return [];
  const turned = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[signs[0]];
  return turned ? [`${parts[1].trim()} ${turned} ${parts[0].trim()}`] : [];
};

const pairSpaces = (key) => {
  const match = /^\((.+),(.+)\)$/.exec(key.replace(/\s+/g, ''));
  return match ? [`( ${match[1]} , ${match[2]} )`, `(${match[1]}, ${match[2]})`] : [];
};

/* ------------------------------------------------------------------ not in the form asked */

const unsimplifiedForms = (key, rule) => {
  if (rule === 'factoredForm') {
    const expanded = expandedPolynomial(key);
    return expanded && expanded !== key.replace(/\s+/g, '') ? [{ value: expanded, spellingClass: 'expanded (not factored)' }] : [];
  }
  if (rule === 'simplestRadicalForm') {
    const out = [];
    const multiple = /(\d+)\s*√\s*\(?(\d+)\)?/.exec(key);
    if (multiple && Number(multiple[1]) > 1) {
      out.push({ value: `${key.slice(0, multiple.index)}√${Number(multiple[1]) ** 2 * Number(multiple[2])}${key.slice(multiple.index + multiple[0].length)}`, spellingClass: 'radical not simplified' });
    }
    // (a√b)/b → a/√b: the radical left in the denominator.
    const rationalized = /^\((\d+)√(\d+)\)\/(\d+)$/.exec(key.replace(/\s+/g, ''));
    if (rationalized && rationalized[2] === rationalized[3]) out.push({ value: `${rationalized[1]}/√${rationalized[2]}`, spellingClass: 'radical in the denominator' });
    return out;
  }
  if (rule === 'simplifiedPolynomial') {
    // One like term split in two: 5x → 4x + x.
    const term = /(?<![\w^.])(\d+)([a-z])(\^\d+)?(?![\w(])/.exec(key);
    if (term && Number(term[1]) >= 2) {
      const [, coefficient, letter, power = ''] = term;
      return [{ value: `${key.slice(0, term.index)}${Number(coefficient) - 1}${letter}${power}+${letter}${power}${key.slice(term.index + term[0].length)}`, spellingClass: 'like terms not combined' }];
    }
  }
  return [];
};

/* ------------------------------------------------------------------ edge input */

const edgeInputs = (key) => [
  { value: '', spellingClass: 'blank' },
  { value: '   ', spellingClass: 'blank (spaces)' },
  { value: `${key} +`, spellingClass: 'unfinished (trailing +)' },
  { value: `${key}*`, spellingClass: 'unfinished (trailing ×)' },
  { value: `${'+'.repeat(Math.max(1, MAX_TYPED_ANSWER_LENGTH + 1 - key.length))}${key}`, spellingClass: 'over-long' },
  { value: `${key}${'+0'.repeat(Math.ceil((MAX_TYPED_ANSWER_LENGTH + 1 - key.length) / 2) + 1)}`, spellingClass: 'over-long (+0 padding)' },
  { value: '+', spellingClass: 'lone operator' },
  { value: '-', spellingClass: 'lone operator' },
  { value: '=', spellingClass: 'lone operator' },
  { value: '<', spellingClass: 'lone operator' },
  { value: '\\placeholder{}', spellingClass: 'empty LaTeX' },
  { value: '\\frac{}{}', spellingClass: 'empty LaTeX' },
  { value: 'idk', spellingClass: 'words' },
];

/**
 * The answers to type into one box. `field` is the box as the grader reads it;
 * `fieldFacts` says whether what the student reads asks for a form or a
 * fraction (the sweep's own reading: formAsked, fractionAsked).
 */
export const studentAnswersFor = ({ key, accepted = [], field = {}, fieldFacts = {}, seed = 'audit' }) => {
  const source = text(key);
  if (!source) return [];
  const kind = fieldKind(field);
  const rule = formRuleOf(field);
  const sweepField = { inputProfile: field.inputProfile || null, equivalence: field.equivalence || null, formAsked: Boolean(fieldFacts.formAsked || rule), fractionAsked: Boolean(fieldFacts.fractionAsked), answerFormat: field.answerFormat || null };
  const out = [];
  const seen = new Set();
  const add = (value, category, spellingClass, expect, firm = true) => {
    const typed = String(value ?? '');
    if (seen.has(typed)) return;
    seen.add(typed);
    out.push({ text: typed, category, spellingClass, expect, firm });
  };
  const keys = [source, ...accepted.map(text).filter(Boolean)];
  const sameAsAKey = (candidate) => {
    const verdicts = keys.map((one) => compareToKey(one, candidate, kind, seed));
    if (verdicts.includes('same')) return 'same';
    if (verdicts.every((verdict) => verdict === 'different')) return 'different';
    return 'unknown';
  };

  add(source, 'right', 'key', 'right');
  accepted.forEach((value) => add(text(value), 'right', 'accepted answer', 'right'));

  // RIGHT: spellings of the key, confirmed the same value.
  const spellings = [
    ...typedSpellingsOf(source, sweepField).map(({ spelling, spellingClass }) => [spelling, spellingClass]),
    ...editorTypedSpellings(source).map((spelling) => [spelling, 'math editor LaTeX']),
    [source.replace(/-/g, '−'), 'Unicode minus'],
    [source.replace(/\s+/g, ''), 'no spaces'],
    ...(kind === 'orderedPair' ? pairSpaces(source).map((spelling) => [spelling, 'pair with spaces']) : []),
    ...(kind === 'inequality' ? flippedInequality(source).map((spelling) => [spelling, 'inequality read from the other side']) : []),
  ];
  // Whether the independent reading can read the key at all: where it can, a
  // spelling it cannot read is a broken spelling (the generator's), not a
  // student's answer.
  const keyReadable = compareToKey(source, source, kind, seed) === 'same';
  for (const [spelling, spellingClass] of spellings) {
    if (!spelling || spelling === source) continue;
    // A decimal is not the form a form rule asks for (simplest radical form
    // takes no decimal; a rational exponent is written as a fraction).
    if (spellingClass === 'decimals' && rule) continue;
    // A rewrite of the order or sides is the same mathematics but may be the
    // question's form: only the oracle's 'same' keeps it, and as firm only
    // where nothing asks for a form.
    const verdict = sameAsAKey(spelling);
    if (verdict === 'different' || (verdict === 'unknown' && keyReadable)) continue;
    const formSensitive = /reordered|other side/.test(spellingClass) || (spellingClass === 'decimals' && /\^/.test(spelling));
    add(spelling, 'right', spellingClass, 'right', verdict === 'same' && !(formSensitive && sweepField.formAsked) && !(spellingClass === 'decimals' && /\^/.test(spelling)));
  }

  // WRONG: one slip away, confirmed another value.
  const slips = [
    ...typedNearMissesOf(source, sweepField).filter(({ spellingClass }) => !['unfinished', 'over the length'].includes(spellingClass)).map(({ miss, spellingClass }) => [miss, `near miss: ${spellingClass}`]),
    ...signError(source, kind).map((miss) => [miss, 'sign error']),
    ...offByOne(source).map((miss) => [miss, 'off by one']),
    ...(kind === 'orderedPair' ? swappedPair(source).map((miss) => [miss, 'coordinates swapped']) : []),
    ...(kind === 'number' ? reciprocal(source).map((miss) => [miss, 'reciprocal']) : []),
    ...(['expression', 'equation', 'inequality'].includes(kind) ? missingTerm(source).map((miss) => [miss, 'missing term']) : []),
    ...(kind === 'inequality' ? strictness(source).map((miss) => [miss, 'strict and non-strict swapped']) : []),
    ...(kind === 'set' ? setSlips(source).map((miss) => [miss, 'set element missing or extra']) : []),
  ];
  for (const [miss, spellingClass] of slips) {
    if (!miss || miss === source) continue;
    const verdict = sameAsAKey(miss);
    if (verdict === 'same') continue;
    // Within the tolerance the item states, a number is right by the item's own key.
    const tolerance = Number(field.numericTolerance);
    if (kind === 'number' && Number.isFinite(tolerance) && tolerance > 0 && Number.isFinite(Number(miss)) && keys.some((one) => Number.isFinite(Number(one)) && Math.abs(Number(miss) - Number(one)) <= tolerance + 1e-9)) continue;
    add(miss, 'wrong', spellingClass, 'wrong', verdict === 'different');
  }

  // UNSIMPLIFIED: the value, not in the form the field asks for.
  for (const { value, spellingClass } of unsimplifiedForms(source, rule)) {
    if (sameAsAKey(value) !== 'same' || keys.includes(value)) continue;
    add(value, 'unsimplified', `${spellingClass} (${rule})`, 'wrong');
  }

  for (const { value, spellingClass } of edgeInputs(source)) add(value, 'edge', spellingClass, 'not-right');
  return out;
};
