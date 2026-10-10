// Question family: function features, graphs and relations: functionGraph, functionInvestigation, functionInvestigation2, graphAnalysis, functionCharacteristics, relationMapping, relationshipModel, sequenceExplorer, table.
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (sixth in the index order; the five families before it
// own equations, systems, lines/slope, fractions and points/intervals, and none
// of them claims these types):
//
//   graph        the interactive graph workspace — `graphAnalysis` (Analyze
//                only), `functionGraph` and `functionInvestigation`
//                (construct, then any analysis requests) — read from the same
//                model the shared grader marks with (graphWorkspaceModelFor):
//                every analysis part's accepted answers, every feature point,
//                every fixed construction point.
//   composed     a recipe or hand-written workflow on those types and on
//                `functionCharacteristics`, `relationshipModel` (the
//                functionModeling recipe) and `relationMapping` with a recipe:
//                readComposedQuestion — the reading WorkflowRunner and the
//                composedWorkflow grader share — gives the stages and the key.
//                A standalone `relationshipModel` (RelationshipModel.jsx:
//                quantities, axes, discrete/continuous, starting point) is
//                read through relationshipModelRequirements the same way.
//   relation     the `relationMapping` registry tool: the authored pairs, the
//                `ask` list, the grader's own relation helpers.
//   table        the legacy function `table` (question.table.answers, rule).
//   sequence     `sequenceExplorer`, every mode, through sequenceMath.mjs.
//   investigation `functionInvestigation2`, every mode, through
//                functionInvestigationMath.mjs.
//   attributes   multiAnswer items whose EVERY field is a function attribute
//                (domain, range, discrete/continuous, parent family, an
//                asymptote, a y-intercept beside them, "which is true") on a
//                prompt or label about those attributes — and none that is a
//                vertex, a transformation, an inverse, a composition, a slope,
//                a zero or an x-intercept (those belong to later families or to
//                linesAndSlope). A platform family instance is never claimed:
//                no platform family id is a function-attribute family.
//
// HOW IT STAYS SAFE.
//   - expectedValues lists what the student must FIND, in every spelling a hint
//     could use: interval, inequality and set notation, ∞/inf, Unicode and ASCII
//     minus, each piece of a union, ordered pairs, "x = 2" equations, a
//     function rule and its right-hand side, the correct verdict word or choice
//     label, table cells. For a graph-reading item whose equation the student
//     cannot see (functionCharacteristics), the nonzero coordinates of every
//     key point are listed too.
//   - Hints are written so they never NEED a guard: the generic ones carry no
//     digits and no verdict word (minimum, increasing everywhere, discrete,
//     arithmetic, "is a function", yes / no, none, all real numbers). The only
//     numbers a hint quotes are the problem's givens (its equation, its pairs,
//     its x-values, its scenario); each of those hints also has a plain
//     spelling, used whenever the quoting one would contain an answer
//     (hintRevealsAnswer against expectedValues plus the plain keys). A hint
//     never states a computed value, a turning point, an interval, a zero.
//   - The worked sibling is the same task on new numbers, drawn from a fixed
//     candidate list in an order set by the seed and the PROMPT (never the
//     key), and offered only when its prompt, every step and its answer avoid
//     this question's answers (the platform's own checks, run here first). Its
//     steps never use a verdict word either, so whether a sibling is offered
//     never depends on this question's verdict. A graph sibling that answers
//     interval questions is always drawn on a closed interval (as is an
//     attribute sibling of a line, a cubic or a cube root), so "every real
//     number" — shared by every shifted parabola — is never its answer, and
//     its look depends on the question's shape, not its key. A sibling that
//     would still share an answer is not offered: null.
//   - backUpQuestion asks about the first MOVE (which axis, which coordinate,
//     which number in a pair is the input), never a feature's value.
//
// Pure: no React, no I/O.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import { readComposedQuestion } from '../../../../functions/shared/toolMath/workflow/questionWorkflow.mjs';
import { graphWorkspaceModelFor } from '../../../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import {
  evaluateGraphFunction,
  getEffectiveDomain,
  xIsInFunctionDomain,
} from '../../../../functions/shared/toolMath/graphWorkspace/functionGraphUtils.mjs';
import {
  relationAskOf,
  relationIsFunction,
  relationPairsOf,
  uniqueSorted,
} from '../../../../functions/shared/serverGrading/tools/relationMapping.mjs';
import { FUNCTION_CHOICES, correctFunctionChoice } from '../../../../functions/shared/relationFunctionChoice.mjs';
import { relationshipModelRequirements } from '../../../../functions/shared/toolMath/scenario/relationshipModelMath.mjs';
import {
  compareSequencesAt,
  compareSpecsFromQuestion,
  normalizeSequenceSpec,
  sequenceChange,
  sequencePartialSum,
  sequenceSpecFromQuestion,
  sequenceTerm,
} from '../../../../functions/shared/toolMath/sequenceExplorer/sequenceMath.mjs';
import {
  FUNCTION_FAMILY_LABELS,
  behaviorForSpec,
  behaviorLabel,
  compareFunctionValues,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  normalizeInvestigationSpec,
  relationLabel,
} from '../../../../functions/shared/toolMath/functionInvestigation2/functionInvestigationMath.mjs';

export const family = 'functionFeatures';
export const implemented = true;

export const GRAPH_WORKSPACE_TYPES = Object.freeze(['graphAnalysis', 'functionGraph', 'functionInvestigation']);
export const COMPOSED_TYPES = Object.freeze([...GRAPH_WORKSPACE_TYPES, 'functionCharacteristics', 'relationshipModel', 'relationMapping']);

/* ---------------------------------------------------------------------------
 * Small helpers.
 * ------------------------------------------------------------------------- */

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const ascii = (value) => String(value ?? '').replace(/[−–—]/g, '-');
const typeOf = (question) => text(question?.type) || text(question?.toolId);
const same = (a, b) => a === b || Math.abs(a - b) <= 1e-9;
const finiteNumber = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const range = (low, high) => Array.from({ length: high - low + 1 }, (_, index) => low + index);
const capitalize = (value) => (value ? value[0].toUpperCase() + value.slice(1) : value);
const lowerFirst = (value) => (value ? value[0].toLowerCase() + value.slice(1) : value);
const withArticle = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) {
    h ^= character.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** A number as the family writes it: ASCII minus, at most six decimals, ∞. */
const dec = (value) => {
  const number = Number(value);
  if (number === Infinity) return '∞';
  if (number === -Infinity) return '-∞';
  if (!Number.isFinite(number)) return '';
  const rounded = Math.round(number * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

const joinWords = (words) => {
  const items = words.filter(Boolean);
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};
// "it is never increasing and decreasing on (-2, 5)" reads as one claim about
// both words, and so does "never increasing, decreasing on …": once a "never …"
// clause is in the list, every clause after the first gets its own "it is".
const joinClauses = (clauses) => {
  const items = clauses.filter(Boolean);
  if (items.length <= 1 || !items.slice(0, -1).some((item) => item.startsWith('never'))) return joinWords(items);
  const [first, ...rest] = items;
  const owned = rest.map((item) => `it is ${item}`);
  return `${[first, ...owned.slice(0, -1)].join(', ')}, and ${owned[owned.length - 1]}`;
};

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const ordinal = (n) => ORDINALS[n] || `number ${n}`;

/* ---------------------------------------------------------------------------
 * Every spelling of an answer.
 * ------------------------------------------------------------------------- */

const NONE_CANON = new Set(['none', 'doesnotexist', 'dne', 'emptyset', '∅', '{}']);
const NONE_FORMS = Object.freeze(['none', 'does not exist', 'empty set', '∅', 'dne']);
const ALL_REALS_CANON = new Set(['allrealnumbers', '(-inf,inf)', '-inf<x<inf', '-inf<y<inf', 'r', 'ℝ', 'allreals']);
const ALL_REALS_FORMS = Object.freeze(['all real numbers', 'all reals', '(-∞, ∞)', '(−∞, ∞)', '(-inf, inf)', '-∞ < x < ∞', '−∞ < x < ∞', '-∞ < y < ∞', 'ℝ']);

const canonicalAnswer = (value) => ascii(value)
  .replace(/\$/g, '')
  .replace(/\\infty/g, 'inf')
  .replace(/∞/g, 'inf')
  .replace(/infinity/gi, 'inf')
  .replace(/≤|\\leq?(?![a-z])/g, '<=')
  .replace(/≥|\\geq?(?![a-z])/g, '>=')
  .replace(/≠|\\neq?(?![a-z])/g, '!=')
  .replace(/…/g, '...')
  .replace(/\s+/g, '')
  .replace(/([)\]])(?:∪|u|U|\\cup)([([])/g, '$1u$2')
  .toLowerCase();

const renderCanonical = (canon, { minus, inf, spaced, symbols, union }) => {
  let out = canon.replace(/([)\]])u([([])/g, `$1¦$2`);
  out = out.replace(/inf/g, inf);
  if (symbols) out = out.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠');
  if (spaced) {
    out = out.replace(/,/g, ', ').replace(/(<=|>=|!=|≤|≥|≠|<|>|=)/g, ' $1 ').replace(/\s+/g, ' ').trim();
  }
  out = out.replace(/¦/g, spaced ? ` ${union} ` : union);
  if (minus !== '-') out = out.replace(/-/g, minus);
  return out;
};

const intervalToInequalities = (canon) => {
  const match = /^([[(])([^,()[\]]+),([^,()[\]]+)([\])])$/.exec(canon);
  if (!match) return [];
  const [, open, low, high, close] = match;
  if (low === '-inf' && high === 'inf') return [];
  return ['x', 'y'].map((variable) => {
    if (low === '-inf') return `${variable}${close === ']' ? '<=' : '<'}${high}`;
    if (high === 'inf') return `${variable}${open === '[' ? '>=' : '>'}${low}`;
    return `${low}${open === '[' ? '<=' : '<'}${variable}${close === ']' ? '<=' : '<'}${high}`;
  });
};

const inequalityToInterval = (canon) => {
  let match = /^([^<>=!a-z]+)(<=|<)([xy])(<=|<)([^<>=!a-z]+)$/.exec(canon);
  if (match) return `${match[2] === '<=' ? '[' : '('}${match[1]},${match[5]}${match[4] === '<=' ? ']' : ')'}`;
  match = /^([xy])(>=|>)([^<>=!]+)$/.exec(canon);
  if (match) return `${match[2] === '>=' ? '[' : '('}${match[3]},inf)`;
  match = /^([xy])(<=|<)([^<>=!]+)$/.exec(canon);
  if (match) return `(-inf,${match[3]}${match[2] === '<=' ? ']' : ')'}`;
  match = /^([xy])!=([^<>=!]+)$/.exec(canon);
  if (match) return `(-inf,${match[2]})u(${match[2]},inf)`;
  return '';
};

/** Every spelling of one answer a hint (or a sibling's step) could contain. */
export const answerForms = (value) => {
  const raw = text(value);
  if (!raw) return [];
  const forms = new Set([raw, ascii(raw), raw.replace(/-/g, '−')]);
  const canon = canonicalAnswer(raw);
  const add = (form) => {
    if (!form) return;
    forms.add(form);
    for (const minus of ['-', '−']) {
      for (const inf of ['∞', 'inf']) {
        for (const spaced of [true, false]) {
          for (const symbols of [true, false]) {
            for (const union of ['∪', 'U']) forms.add(renderCanonical(form, { minus, inf, spaced, symbols, union }));
          }
        }
      }
    }
  };
  add(canon);
  if (NONE_CANON.has(canon)) NONE_FORMS.forEach((form) => forms.add(form));
  if (ALL_REALS_CANON.has(canon)) ALL_REALS_FORMS.forEach((form) => forms.add(form));
  const pieces = canon.replace(/([)\]])u([([])/g, '$1¦$2').split('¦');
  if (pieces.length > 1) pieces.forEach(add);
  intervalToInequalities(canon).forEach(add);
  add(inequalityToInterval(canon));
  const set = /^\{(.+)\}$/.exec(canon);
  if (set) add(set[1]);
  const rule = /^[a-z]\(([a-z])\)=(.+)$/.exec(canon);
  if (rule) {
    add(rule[2]);
    add(`y=${rule[2]}`);
    add(rule[2].replace(/(\d)([a-z])/g, '$1*$2'));
    add(rule[2].replace(/(\d)([a-z])/g, '$1·$2'));
  }
  return [...forms].map(text).filter(Boolean);
};

const numberForms = (value) => {
  const number = finiteNumber(value);
  return number === null ? [] : answerForms(dec(number));
};
const pointForms = (point) => (Array.isArray(point) && point.length === 2 && point.every((entry) => finiteNumber(entry) !== null)
  ? answerForms(`(${dec(point[0])}, ${dec(point[1])})`)
  : []);
const setForms = (values) => answerForms(`{${values.map(dec).join(', ')}}`);

/* ---------------------------------------------------------------------------
 * The guard: this question's answers (expectedValues) and its plain keys.
 * ------------------------------------------------------------------------- */

const plainKeys = (question = {}) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value === 'object') return;
    const valueText = text(value);
    if (valueText) values.push(valueText);
  };
  try {
    list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
    push(question.answer);
    push(question.solution);
    push(question.target);
    push(question.generatedAnswer);
    list(question.acceptedAnswers).forEach(push);
    if (isObject(question.solutionKey)) push(question.solutionKey.value);
  } catch { /* the guard reads what it can */ }
  return values;
};

const leaks = (value, guard) => hintRevealsAnswer(value, guard);
/** The first spelling that names none of this question's answers, else ''. */
const firstSafe = (guard, ...candidates) => candidates
  .filter((candidate) => typeof candidate === 'string')
  .map(text)
  .find((candidate) => candidate && !leaks(candidate, guard)) || '';

const numericValue = (value) => {
  const cleaned = text(value).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const fraction = cleaned.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

/** The platform's similarExampleIsSafe checks, against this family's wider guard. */
const siblingIsSafe = (question, guard, example) => {
  if (!example) return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = list(example.steps).map(text).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const answerValue = numericValue(answer);
  if (answerValue !== null && guard.some((value) => numericValue(value) !== null && Math.abs(numericValue(value) - answerValue) < 1e-9)) return false;
  if (steps.some((step) => leaks(step, guard))) return false;
  if (leaks(prompt, guard.filter((value) => numericValue(value) === null))) return false;
  return true;
};

/** Walk a fixed candidate list from a start set by the seed and the prompt (never the key). */
const fromCandidates = (candidates, seed, salt, build) => {
  if (!candidates.length) return null;
  const start = (hash(salt) + Math.abs(Math.trunc(Number(seed) || 0)) * 7919) % candidates.length;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const built = build(candidates[(start + offset) % candidates.length]);
    if (built) return built;
  }
  return null;
};

/** The two-choice back-up step, its buttons ordered by the prompt (not the key). */
const twoChoice = (guard, prompt, correct, wrong) => {
  if ([prompt, correct, wrong].some((value) => !text(value) || leaks(value, guard))) return null;
  const options = hash(prompt) % 2 ? [wrong, correct] : [correct, wrong];
  return { prompt, options, correct };
};

/* ---------------------------------------------------------------------------
 * Function specs (the graph workspace's format: linear {m, b}, every other
 * family {a, h, k, base}, an optional domain {min, max, minClosed, maxClosed}).
 * ------------------------------------------------------------------------- */

const SPEC_TYPES = Object.freeze(['linear', 'absolute', 'quadratic', 'squareRoot', 'cubic', 'cubeRoot', 'exponential', 'logarithmic', 'rational']);
const specType = (spec) => (spec?.type === 'line' ? 'linear' : text(spec?.type));
const readSpec = (raw) => (isObject(raw) && SPEC_TYPES.includes(specType(raw)) ? raw : null);
const paramA = (spec) => Number(spec.a ?? 1);
const paramH = (spec) => Number(spec.h ?? 0);
const paramK = (spec) => Number(spec.k ?? 0);
const slopeOf = (spec) => Number(spec.m ?? spec.a ?? 1);
const interceptOf = (spec) => (spec.b !== undefined ? Number(spec.b) : paramK(spec));
const baseOf = (spec) => Number(spec.base ?? (specType(spec) === 'linear' ? 2 : spec.b ?? 2));
const directionSign = (spec) => Math.sign(specType(spec) === 'linear' ? slopeOf(spec) : paramA(spec)) || 1;
const isRestricted = (spec) => isObject(spec?.domain) || isObject(spec?.restrictedDomain);

const insideText = (h) => (same(h, 0) ? 'x' : `x ${h > 0 ? '-' : '+'} ${dec(Math.abs(h))}`);
const plusConstant = (k) => (same(k, 0) ? '' : ` ${k > 0 ? '+' : '-'} ${dec(Math.abs(k))}`);
const withCoefficient = (a, body) => (same(a, 1) ? body : same(a, -1) ? `-${body}` : `${dec(a)}${body}`);
const withDotCoefficient = (a, body) => (same(a, 1) ? body : same(a, -1) ? `-(${body})` : `${dec(a)}·${body}`);
// A fractional base is written as a decimal (0.5^x): "(1/2)^x" would put a
// stray 1 and 2 into every sentence that quotes the equation.
const baseText = (base) => (Number.isInteger(base) ? String(base) : dec(base));

/** The right-hand side of a spec, as the family writes it. */
const renderRhs = (spec) => {
  const type = specType(spec);
  const a = paramA(spec);
  const h = paramH(spec);
  const k = paramK(spec);
  const inside = insideText(h);
  if (type === 'linear') {
    const m = slopeOf(spec);
    const b = interceptOf(spec);
    if (same(m, 0)) return dec(b);
    return `${withCoefficient(m, same(h, 0) ? 'x' : `(${inside})`)}${plusConstant(b)}`;
  }
  if (type === 'quadratic') return `${withCoefficient(a, same(h, 0) ? 'x²' : `(${inside})²`)}${plusConstant(k)}`;
  if (type === 'absolute') return `${withCoefficient(a, `|${inside}|`)}${plusConstant(k)}`;
  if (type === 'squareRoot') return `${withCoefficient(a, same(h, 0) ? '√x' : `√(${inside})`)}${plusConstant(k)}`;
  if (type === 'cubic') return `${withCoefficient(a, same(h, 0) ? 'x³' : `(${inside})³`)}${plusConstant(k)}`;
  if (type === 'cubeRoot') return `${withCoefficient(a, same(h, 0) ? '∛x' : `∛(${inside})`)}${plusConstant(k)}`;
  if (type === 'exponential') {
    const base = baseOf(spec);
    return `${withDotCoefficient(a, `${baseText(base)}^${same(h, 0) ? 'x' : `(${inside})`}`)}${plusConstant(k)}`;
  }
  if (type === 'logarithmic') {
    const base = baseOf(spec);
    const name = base === 2 ? 'log₂' : base === 10 ? 'log' : `log_${baseText(base)}`;
    const log = `${name}(${inside})`;
    return `${same(a, -1) ? `-${log}` : withDotCoefficient(a, log)}${plusConstant(k)}`;
  }
  if (type === 'rational') return `${dec(a)}/${same(h, 0) ? 'x' : `(${inside})`}${plusConstant(k)}`;
  return '';
};
const renderEquation = (spec, name = 'f') => `${name}(x) = ${renderRhs(spec)}`;
const restrictionText = (spec) => {
  const domain = spec.domain || spec.restrictedDomain;
  if (!isObject(domain)) return '';
  const low = finiteNumber(domain.min);
  const high = finiteNumber(domain.max);
  const closed = (inclusiveKey, closedKey) => (domain[inclusiveKey] !== undefined ? domain[inclusiveKey] !== false : domain[closedKey] !== false);
  if (low === null || high === null) return '';
  return `${dec(low)} ${closed('minInclusive', 'minClosed') ? '≤' : '<'} x ${closed('maxInclusive', 'maxClosed') ? '≤' : '<'} ${dec(high)}`;
};

/* ---- The analyzer (worked siblings): domain, range, monotone pieces, signs. ---- */

const withoutRestriction = (spec) => {
  const copy = { ...spec };
  delete copy.domain;
  delete copy.restrictedDomain;
  return copy;
};
const valueAt = (spec, x) => evaluateGraphFunction(withoutRestriction(spec), x);

const limitAt = (spec, x, side) => {
  const type = specType(spec);
  const sign = directionSign(spec);
  const growth = baseOf(spec) > 1;
  if (Number.isFinite(x)) {
    const value = valueAt(spec, x);
    if (Number.isFinite(value)) return value;
    if (type === 'logarithmic') return (growth ? -sign : sign) * Infinity;
    if (type === 'rational') return (side === 'left' ? sign : -sign) * Infinity;
    return Number.NaN;
  }
  const toRight = x > 0;
  if (type === 'linear' || type === 'cubic' || type === 'cubeRoot') return sign * (toRight ? 1 : -1) * Infinity;
  if (type === 'quadratic' || type === 'absolute' || type === 'squareRoot') return sign * Infinity;
  if (type === 'exponential') return growth === toRight ? sign * Infinity : paramK(spec);
  if (type === 'logarithmic') return (growth ? sign : -sign) * Infinity;
  if (type === 'rational') return paramK(spec);
  return Number.NaN;
};

const domainPieces = (spec) => {
  const domain = getEffectiveDomain(spec);
  const piece = {
    min: domain.min,
    max: domain.max,
    minIn: Number.isFinite(domain.min) && domain.minInclusive,
    maxIn: Number.isFinite(domain.max) && domain.maxInclusive,
  };
  if (specType(spec) !== 'rational') return [piece];
  const h = paramH(spec);
  if (h > piece.min && h < piece.max) return [{ ...piece, max: h, maxIn: false }, { ...piece, min: h, minIn: false }];
  if (same(h, piece.min)) return [{ ...piece, minIn: false }];
  if (same(h, piece.max)) return [{ ...piece, maxIn: false }];
  return [piece];
};

const turningOf = (spec) => (['quadratic', 'absolute'].includes(specType(spec)) ? paramH(spec) : null);

const monotonePieces = (spec) => domainPieces(spec).flatMap((piece) => {
  const turning = turningOf(spec);
  if (turning !== null && turning > piece.min && turning < piece.max) {
    return [{ ...piece, max: turning, maxIn: true }, { ...piece, min: turning, minIn: true }];
  }
  return [piece];
});

const endValue = (spec, piece, side) => {
  const x = side === 'left' ? piece.min : piece.max;
  const included = side === 'left' ? piece.minIn : piece.maxIn;
  if (Number.isFinite(x) && included) return { value: valueAt(spec, x), included: true };
  return { value: limitAt(spec, x, side), included: false };
};

const directionOf = (spec, piece) => {
  const low = Number.isFinite(piece.min) ? piece.min : (Number.isFinite(piece.max) ? piece.max - 4 : -2);
  const high = Number.isFinite(piece.max) ? piece.max : low + 4;
  const change = valueAt(spec, low + (2 * (high - low)) / 3) - valueAt(spec, low + (high - low) / 3);
  return Math.abs(change) < 1e-12 ? 0 : Math.sign(change);
};

const mergeIntervals = (parts) => {
  const sorted = parts
    .filter((part) => !Number.isNaN(part.lo) && !Number.isNaN(part.hi))
    .sort((p, q) => (p.lo - q.lo) || (Number(q.loIn) - Number(p.loIn)));
  const out = [];
  sorted.forEach((part) => {
    const last = out[out.length - 1];
    const touches = last && (part.lo < last.hi - 1e-9 || (same(part.lo, last.hi) && (part.loIn || last.hiIn)));
    if (!touches) {
      out.push({ ...part });
      return;
    }
    if (part.hi > last.hi + 1e-9) {
      last.hi = part.hi;
      last.hiIn = part.hiIn;
    } else if (same(part.hi, last.hi)) {
      last.hiIn = last.hiIn || part.hiIn;
    }
    if (same(part.lo, last.lo)) last.loIn = last.loIn || part.loIn;
  });
  return out;
};

const domainOf = (spec) => mergeIntervals(domainPieces(spec).map((piece) => ({ lo: piece.min, hi: piece.max, loIn: piece.minIn, hiIn: piece.maxIn })));

const rangeOf = (spec) => mergeIntervals(monotonePieces(spec).map((piece) => {
  const left = endValue(spec, piece, 'left');
  const right = endValue(spec, piece, 'right');
  const [low, high] = left.value <= right.value ? [left, right] : [right, left];
  return { lo: low.value, hi: high.value, loIn: low.included && Number.isFinite(low.value), hiIn: high.included && Number.isFinite(high.value) };
}));

const monotoneIntervals = (spec, wanted) => monotonePieces(spec)
  .filter((piece) => directionOf(spec, piece) === wanted)
  .map((piece) => ({ lo: piece.min, hi: piece.max, loIn: false, hiIn: false }));

const zerosOf = (spec) => {
  const type = specType(spec);
  const investigated = type === 'linear'
    ? { type: 'linear', a: slopeOf(spec), h: paramH(spec), k: interceptOf(spec) }
    : { type, a: paramA(spec), h: paramH(spec), k: paramK(spec), base: baseOf(spec) };
  let roots = [];
  try { roots = interceptsForSpec(investigated).x; } catch { roots = []; }
  return roots
    .map((x) => Math.round(x * 1e6) / 1e6)
    .filter((x) => xIsInFunctionDomain(spec, x) && Math.abs(valueAt(spec, x)) < 1e-6)
    .sort((p, q) => p - q);
};

const signIntervals = (spec, wanted) => {
  const zeros = zerosOf(spec);
  const out = [];
  domainPieces(spec).forEach((piece) => {
    const bounds = [piece.min, ...zeros.filter((zero) => zero > piece.min && zero < piece.max), piece.max];
    for (let index = 0; index < bounds.length - 1; index += 1) {
      const low = bounds[index];
      const high = bounds[index + 1];
      const probe = Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : Number.isFinite(low) ? low + 1 : Number.isFinite(high) ? high - 1 : 0;
      const value = valueAt(spec, probe);
      if (!Number.isFinite(value) || Math.abs(value) < 1e-12 || Math.sign(value) !== wanted) continue;
      out.push({
        lo: low,
        hi: high,
        loIn: index === 0 && piece.minIn && Math.abs(valueAt(spec, low)) > 1e-12,
        hiIn: index === bounds.length - 2 && piece.maxIn && Math.abs(valueAt(spec, high)) > 1e-12,
      });
    }
  });
  return out;
};

const showInterval = (part) => (same(part.lo, part.hi)
  ? `{${dec(part.lo)}}`
  : `${part.loIn ? '[' : '('}${dec(part.lo)}, ${dec(part.hi)}${part.hiIn ? ']' : ')'}`);
const showIntervals = (parts) => parts.map(showInterval).join(' ∪ ');
const showInequality = (parts, variable) => {
  if (parts.length === 1) {
    const part = parts[0];
    if (part.lo === -Infinity && part.hi === Infinity) return 'all real numbers';
    if (part.lo === -Infinity) return `${variable} ${part.hiIn ? '≤' : '<'} ${dec(part.hi)}`;
    if (part.hi === Infinity) return `${variable} ${part.loIn ? '≥' : '>'} ${dec(part.lo)}`;
    return `${dec(part.lo)} ${part.loIn ? '≤' : '<'} ${variable} ${part.hiIn ? '≤' : '<'} ${dec(part.hi)}`;
  }
  return showIntervals(parts);
};
const showPoint = (point) => `(${dec(point[0])}, ${dec(point[1])})`;

/** Every candidate sibling of one family, with whole-number features by construction. */
const siblingSpecs = (type, { restricted = true, decay = false } = {}) => {
  const out = [];
  const add = (spec, [min, max]) => out.push(restricted ? { ...spec, domain: { min, max, minClosed: true, maxClosed: true } } : spec);
  if (type === 'linear') {
    for (const m of [2, -2, 3, -3, 1, -1, 4, -4]) for (const r of range(-4, 4)) add({ type, m, b: -m * r }, [r - 2, r + 3]);
  } else if (type === 'quadratic') {
    for (const a of [1, -1, 2, -2, 3, -3]) for (const h of range(-4, 4)) for (const d of [1, 2, 3]) add({ type, a, h, k: -a * d * d }, [h - d - 1, h + d + 2]);
  } else if (type === 'absolute') {
    for (const a of [1, -1, 2, -2]) for (const h of range(-3, 3)) for (const d of [1, 2, 3]) add({ type, a, h, k: -a * d }, [h - d - 2, h + d + 1]);
  } else if (type === 'squareRoot') {
    for (const a of [1, -1, 2, -2]) for (const h of range(-4, 4)) for (const s of [1, 2]) add({ type, a, h, k: -a * s }, [h, h + 9]);
  } else if (type === 'cubic') {
    for (const a of [1, -1]) for (const h of range(-3, 3)) for (const t of [1, -1]) add({ type, a, h, k: -a * t }, [h - 2, h + 2]);
  } else if (type === 'cubeRoot') {
    for (const a of [1, -1, 2, -2]) for (const h of range(-3, 3)) for (const t of [1, -1]) add({ type, a, h, k: -a * t }, [h - 8, h + 8]);
  } else if (type === 'exponential') {
    for (const a of [1, 2, 3, -1, -2]) {
      for (const t of [1, 2, 3]) {
        if (decay) add({ type, a, h: 0, k: -a * 2 ** t, base: 0.5 }, [-4, 0]);
        else add({ type, a, h: 0, k: -a * 2 ** t, base: 2 }, [0, 4]);
      }
    }
  } else if (type === 'logarithmic') {
    for (const a of [1, -1, 2, -2]) for (const h of range(-3, 3)) for (const t of [1, 2]) add({ type, a, h, k: -a * t, base: 2 }, [h + 1, h + 8]);
  } else if (type === 'rational') {
    for (const a of [6, -6]) for (const h of range(-3, 3)) for (const side of [1, -1]) add({ type, a, h, k: (-side * a) / 2 }, side > 0 ? [h + 1, h + 3] : [h - 3, h - 1]);
  }
  return out;
};

const sameShape = (left, right) => specType(left) === specType(right)
  && ['a', 'h', 'k', 'm', 'b', 'base'].every((key) => same(Number(left[key] ?? 0), Number(right[key] ?? 0)));

/** What the family's own equation says about its shape — a worked step. */
const featureSentence = (spec) => {
  const type = specType(spec);
  const equation = renderEquation(spec);
  const a = paramA(spec);
  const h = paramH(spec);
  const k = paramK(spec);
  const goes = directionOf(spec, domainPieces(spec)[0]) > 0 ? 'rises' : 'falls';
  if (type === 'linear') return `${equation} is a line with slope ${dec(slopeOf(spec))}, so it ${goes} from left to right.`;
  if (type === 'quadratic') return `${equation} is in vertex form a(x - h)² + k with a = ${dec(a)}, h = ${dec(h)} and k = ${dec(k)}: its vertex is (${dec(h)}, ${dec(k)}) and it opens ${a > 0 ? 'upward' : 'downward'}.`;
  if (type === 'absolute') return `${equation} is in the form a|x - h| + k with a = ${dec(a)}, h = ${dec(h)} and k = ${dec(k)}: its vertex is (${dec(h)}, ${dec(k)}) and the V opens ${a > 0 ? 'upward' : 'downward'}.`;
  if (type === 'squareRoot') return `${equation} starts at its endpoint (${dec(h)}, ${dec(k)}), where the expression under the root is zero, and ${goes} to the right.`;
  if (type === 'cubic' || type === 'cubeRoot') return `${equation} has its center at (${dec(h)}, ${dec(k)}) and ${goes} from left to right.`;
  if (type === 'exponential') return `${equation} has the horizontal asymptote y = ${dec(k)} (the added constant); with base ${dec(baseOf(spec))} and a = ${dec(a)} it ${goes} from left to right.`;
  if (type === 'logarithmic') return `${equation} needs ${insideText(h)} > 0, so it has the vertical asymptote x = ${dec(h)}; it ${goes} from left to right.`;
  if (type === 'rational') return `${equation} has the vertical asymptote x = ${dec(h)} (its denominator is zero there) and the horizontal asymptote y = ${dec(k)}.`;
  return '';
};

const restrictionSentence = (spec) => {
  const restriction = restrictionText(spec);
  return restriction ? `It is drawn only for ${restriction}, with closed dots at both ends.` : '';
};

/* ---------------------------------------------------------------------------
 * Which shape is this question?
 * ------------------------------------------------------------------------- */

const equationVisible = (question) => question?.showEquation === true
  || (question?.showEquation !== false && /\b[a-z]\s*\(\s*[a-z]\s*\)\s*=|\by\s*=/i.test(text(question?.prompt)));

const graphModel = (question) => {
  const spec = readSpec(question.functionSpec);
  if (!spec) return null;
  let workspace = null;
  try {
    workspace = graphWorkspaceModelFor(question, { analysisMode: typeOf(question) === 'graphAnalysis' });
  } catch {
    return null;
  }
  const parts = list(workspace?.analysisParts).filter((part) => isObject(part) && text(part.kind));
  const construct = Boolean(workspace?.constructionEnabled);
  const tasks = construct
    ? list(workspace.tasks).filter((task) => Array.isArray(task?.expected) && task.expected.length === 2 && task.expected.every((value) => finiteNumber(value) !== null))
    : [];
  if (!parts.length && !construct) return null;
  return {
    kind: 'graph',
    spec,
    parts,
    tasks,
    construct,
    equation: equationVisible(question) ? renderEquation(spec) : '',
  };
};

const stageGroup = (stage) => {
  const id = text(stage?.id);
  const kind = text(stage?.kind);
  if (kind === 'quantityRoles') return 'quantities';
  if (kind === 'tableInput') return 'table';
  if (kind === 'coordinatePlot' || kind === 'functionGraph') return 'graph';
  if (kind === 'mappingDiagram') return 'mapping';
  if (kind === 'domainInput' || /^domain/i.test(id)) return 'domain';
  if (kind === 'rangeInput' || /^range/i.test(id)) return 'range';
  if (id === 'continuity') return 'continuity';
  if (id === 'isFunction') return 'isFunction';
  if (id === 'model') return 'model';
  if (/^xIntercept|^zeros$/.test(id) || stage?.feature === 'xIntercept') return 'xIntercept';
  if (id.startsWith('yIntercept') || stage?.feature === 'yIntercept') return 'yIntercept';
  if (id.startsWith('extreme') || stage?.feature === 'extremum') return 'extreme';
  if (id === 'axisOfSymmetry') return 'axis';
  if (id === 'asymptote') return 'asymptote';
  if (id === 'behavior') return 'behavior';
  if (kind === 'equationInput') return 'equation';
  return null;
};

const composedModel = (question, composed) => {
  const stages = list(composed?.workflow).filter(isObject);
  if (!stages.length) return null;
  const groups = [];
  stages.forEach((stage) => {
    const group = stageGroup(stage);
    if (group && !groups.includes(group)) groups.push(group);
  });
  const spec = readSpec(question.functionSpec);
  const recipe = text(composed.recipe) || text(isObject(question.recipe) ? question.recipe.name : question.recipe);
  return {
    kind: 'composed',
    type: typeOf(question),
    recipe,
    stages,
    groups,
    grading: isObject(composed.grading) ? composed.grading : {},
    spec,
    equation: spec && equationVisible(question) ? renderEquation(spec) : '',
    // A graph read with no equation in view: its key points' coordinates are answers too.
    hiddenEquation: !equationVisible(question),
    scenario: text(question.scenario),
    quantities: list(question.quantities).filter((quantity) => text(quantity?.label)),
    notation: text(question.notation),
    correctEquation: text(question.correctEquation),
    tableXValues: list(question.tableXValues).map(finiteNumber).filter((value) => value !== null),
  };
};

/*
 * A standalone relationshipModel (no recipe, no workflow): RelationshipModel.jsx
 * asks for the quantity roles, the axes, discrete or continuous, and what the
 * starting point means — relationshipModelRequirements, the reading the
 * screen and its grader share.
 */
const scenarioModel = (question) => {
  const quantities = list(question.quantities).filter((quantity) => text(quantity?.label));
  let requirements;
  try { requirements = relationshipModelRequirements(question); } catch { return null; }
  const groups = [];
  if (requirements.quantities && quantities.length >= 2) groups.push('quantities');
  if (requirements.axes || requirements.scale) groups.push('axes');
  if (requirements.continuity) groups.push('continuity');
  if (requirements.origin) groups.push('origin');
  if (!groups.length) return null;
  const origin = isObject(question.origin) ? question.origin : {};
  const target = list(origin.target?.coordinates || origin.coordinates || origin.point);
  return {
    kind: 'composed',
    type: typeOf(question),
    recipe: 'functionModeling',
    standalone: true,
    stages: [],
    groups,
    grading: text(question.relationshipType) ? { continuity: text(question.relationshipType) } : {},
    originPoint: target.length === 2 ? target : null,
    spec: null,
    equation: '',
    hiddenEquation: false,
    scenario: text(question.scenario),
    quantities,
    notation: '',
    correctEquation: '',
    tableXValues: [],
  };
};

const relationModel = (question) => {
  const pairs = relationPairsOf(question.pairs);
  if (!pairs.length) return null;
  return { kind: 'relation', pairs, ask: relationAskOf(question.ask), fields: list(question.answerFields).filter((field) => text(field?.id)) };
};

const readRule = (rule) => {
  if (!isObject(rule)) return null;
  if (rule.type === 'quadratic' && ['a', 'b', 'c'].every((key) => finiteNumber(rule[key]) !== null)) return { type: 'quadratic', a: Number(rule.a), b: Number(rule.b), c: Number(rule.c) };
  if (rule.type === 'linear' && ['m', 'b'].every((key) => finiteNumber(rule[key]) !== null)) return { type: 'linear', m: Number(rule.m), b: Number(rule.b) };
  return null;
};
const ruleValue = (rule, x) => (rule.type === 'quadratic' ? rule.a * x * x + rule.b * x + rule.c : rule.m * x + rule.b);
const ruleRhs = (rule) => {
  if (rule.type === 'quadratic') {
    const linear = same(rule.b, 0) ? '' : ` ${rule.b > 0 ? '+' : '-'} ${withCoefficient(Math.abs(rule.b), 'x')}`;
    return `${withCoefficient(rule.a, 'x²')}${linear}${plusConstant(rule.c)}`;
  }
  return renderRhs({ type: 'linear', m: rule.m, b: rule.b });
};

const tableModel = (question) => {
  const table = question.table;
  if (!isObject(table) || !isObject(table.answers)) return null;
  const rows = list(table.rows);
  const blanks = Object.entries(table.answers)
    .map(([key, value]) => {
      const row = Number(String(key).split(':')[0]);
      return { row, value: finiteNumber(value), x: finiteNumber(rows[row]?.x) };
    })
    .filter((blank) => blank.value !== null)
    .sort((p, q) => p.row - q.row);
  if (!blanks.length) return null;
  const rule = readRule(question.rule);
  return { kind: 'table', rule, ruleVisible: question.showRule !== false && Boolean(rule), blanks, rows };
};

const SEQUENCE_ALIASES = Object.freeze({ difference: ['commonDifference', 'd'], ratio: ['commonRatio', 'r'] });

/** The sequence an author MEANT, when they used names the tool does not read. */
const authoredSequence = (question) => {
  const raw = isObject(question?.sequence) ? question.sequence : null;
  if (!raw) return null;
  const kind = text(raw.kind || question.kind) || 'arithmetic';
  const field = kind === 'geometric' ? 'ratio' : 'difference';
  if (raw[field] !== undefined || raw.change !== undefined) return null;
  const alias = SEQUENCE_ALIASES[field].find((name) => finiteNumber(raw[name]) !== null);
  if (!alias) return null;
  try {
    return normalizeSequenceSpec({ kind, first: raw.first, [field]: Number(raw[alias]) }, kind);
  } catch {
    return null;
  }
};

const sequenceModel = (question) => {
  const mode = ['analyze', 'ruleBridge', 'fullBridge', 'missingTerm', 'partialSum', 'compare'].includes(question?.mode) ? question.mode : 'analyze';
  try {
    if (mode === 'compare') {
      const { left, right } = compareSpecsFromQuestion(question);
      return {
        kind: 'sequence',
        mode,
        left,
        right,
        compareN: Number(question.compareN ?? 7),
        leftLabel: text(question.leftLabel) || 'Sequence A',
        rightLabel: text(question.rightLabel) || 'Sequence B',
      };
    }
    return {
      kind: 'sequence',
      mode,
      spec: sequenceSpecFromQuestion(question),
      authored: authoredSequence(question),
      targetN: Number(question.targetN ?? 8),
      missingIndex: Number(question.missingIndex ?? 4),
      sumN: Number(question.sumN ?? 6),
      actions: list(question.studentActions).map(text),
    };
  } catch {
    return null;
  }
};

const investigationModel = (question) => {
  const mode = ['features', 'domainRange', 'intercepts', 'behavior', 'compare'].includes(question?.mode) ? question.mode : (question?.mode ? 'compare' : 'features');
  if (mode === 'compare') {
    return {
      kind: 'investigation',
      mode,
      left: normalizeInvestigationSpec(question.left || { type: 'linear', a: 1, h: 0, k: 0 }),
      right: normalizeInvestigationSpec(question.right || { type: 'quadratic', a: 1, h: 0, k: 0 }),
      x: Number(question.x ?? 2),
    };
  }
  return { kind: 'investigation', mode, spec: normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...(isObject(question.function) ? question.function : {}) }) };
};

/* ---- multiAnswer: function attributes, claimed by content alone. ---- */

const ATTRIBUTE_FIELD = /domain|range|continu|discrete|famil|asymptot|attribute|intercept/i;
const ASYMPTOTE_FIELD_IDS = /^(reciprocal|exponential|logarithmic|exp|log|rational|radical)$/i;
const NOT_ATTRIBUTE = /vertex|reflect|shift|translat|scale|stretch|compress|dilat|inverse|compos|slope|sum|difference|product|quotient|restriction|zero|solution|transform|^fog$|^gof$|evaluat|maximum|minimum/i;
const NOT_ATTRIBUTE_PROMPT = /inverse|f⁻¹|f\^\{?-1|compos|transform|translat|reflect|g\s*\(\s*x\s*\)\s*=\s*[-−]?\s*\d*\.?\d*\s*f\s*\(/i;
const ATTRIBUTE_TOPIC = /domain|range|attribute|asymptot|parent function|discrete|continuous|intercept/i;

const fieldText = (field) => `${text(field?.id)} ${text(field?.label)}`;

const attributeKindOf = (field, prompt) => {
  const id = text(field?.id);
  const label = text(field?.label);
  const both = `${id} ${label}`;
  if (/^(horizontal|vertical)$/i.test(id) || NOT_ATTRIBUTE.test(id) || NOT_ATTRIBUTE.test(label)) return null;
  if (/asymptot/i.test(both) || (ASYMPTOTE_FIELD_IDS.test(id) && /asymptot/i.test(prompt))) return 'asymptote';
  if (/continu|discrete/i.test(both)) return 'continuity';
  if (/domain/i.test(both)) return 'domain';
  if (/range/i.test(both)) return 'range';
  if (/famil/i.test(both)) return 'family';
  // A y-intercept beside other attributes only: x- and y-intercept pairs belong
  // to linesAndSlope, zeros to quadraticsAbsoluteValue.
  if (/intercept/i.test(both)) return /x\W{0,3}-?\s*intercept|zero/i.test(both) ? null : 'intercept';
  if (/attribute|which is true/i.test(both)) return 'attribute';
  return ATTRIBUTE_FIELD.test(both) ? 'attribute' : null;
};

/** The one function a prompt or label is about, when it is a parent or a simple linear rule. */
const PARENT_PATTERNS = Object.freeze([
  [/∛\s*\(?\s*x/, 'cubeRoot'],
  [/√\s*\(?\s*x/, 'squareRoot'],
  [/1\s*\/\s*x(?![\w^²³])/, 'rational'],
  [/log/i, 'logarithmic'],
  [/\d\s*(?:ˣ|\^\s*\(?\s*x)/, 'exponential'],
  [/\|\s*x\s*\|/, 'absolute'],
  [/x\s*(?:²|\^\s*2)/, 'quadratic'],
  [/x\s*(?:³|\^\s*3)/, 'cubic'],
]);

const parseLinearRhs = (rhs, variable) => {
  const cleaned = ascii(rhs).replace(/\s+/g, '').replace(/\*/g, '');
  if (!cleaned || !/^[-+0-9.a-z]+$/i.test(cleaned)) return null;
  const terms = cleaned.match(/[+-]?[^+-]+/g) || [];
  let m = 0;
  let b = 0;
  for (const term of terms) {
    if (term.endsWith(variable)) {
      const coefficient = term.slice(0, -variable.length);
      const value = coefficient === '' || coefficient === '+' ? 1 : coefficient === '-' ? -1 : Number(coefficient);
      if (!Number.isFinite(value)) return null;
      m += value;
    } else {
      const value = Number(term);
      if (!Number.isFinite(value)) return null;
      b += value;
    }
  }
  return { m, b };
};

const parseFunctionText = (value) => {
  const source = text(value);
  if (!source) return null;
  const linear = /([A-Za-z])\s*\(\s*([a-z])\s*\)\s*=\s*([-−+0-9.\s]*[a-z]?(?:\s*[-−+]\s*[0-9.]+)?)/.exec(source);
  if (linear && linear[3].includes(linear[2])) {
    const parsed = parseLinearRhs(linear[3], linear[2]);
    if (parsed && !same(parsed.m, 0)) {
      const restriction = /(-?[−]?\d+(?:\.\d+)?)\s*(?:≤|<=)\s*[a-z]\s*(?:≤|<=)\s*(-?[−]?\d+(?:\.\d+)?)/.exec(source)
        || /from\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)/i.exec(source);
      return {
        type: 'linear',
        name: linear[1],
        variable: linear[2],
        m: parsed.m,
        b: parsed.b,
        restriction: restriction ? [Number(ascii(restriction[1])), Number(ascii(restriction[2]))] : null,
        equation: `${linear[1]}(${linear[2]}) = ${linear[3].trim()}`,
      };
    }
  }
  const found = PARENT_PATTERNS.find(([pattern]) => pattern.test(source));
  if (!found) return null;
  const equation = /([a-z]\s*\(\s*x\s*\)\s*=\s*[^,;.]+?)(?=[,;.]|\s+(?:and|identify|state|is|to)\b|$)/i.exec(source);
  return { type: found[1], equation: equation ? equation[1].trim() : '' };
};

const familyIdOf = (question) => text(question?.familyInstance?.familyId) || text(question?.questionFamily?.id) || text(question?.familyId);

const attributesModel = (question) => {
  // A platform family instance belongs to the family module that owns its id;
  // none of those ids is a function-attribute family.
  if (familyIdOf(question)) return null;
  const fields = list(question.answerFields).filter(isObject);
  if (!fields.length) return null;
  const prompt = text(question.prompt);
  if (NOT_ATTRIBUTE_PROMPT.test(prompt)) return null;
  const kinds = fields.map((field) => attributeKindOf(field, prompt));
  if (kinds.some((kind) => !kind) || kinds.every((kind) => kind === 'intercept')) return null;
  if (!ATTRIBUTE_TOPIC.test(prompt) && !fields.some((field) => ATTRIBUTE_TOPIC.test(fieldText(field)))) return null;
  if (!fields.every((field) => answerCandidatesForField(field).length)) return null;
  return {
    kind: 'attributes',
    fields: fields.map((field, index) => ({ field, kind: kinds[index], fn: parseFunctionText(field.label) })),
    fn: parseFunctionText(prompt),
    prompt,
  };
};

const MODEL_CACHE = new WeakMap();

const buildModel = (question) => {
  if (!isObject(question)) return null;
  const type = typeOf(question);
  if (type === 'multiAnswer') return attributesModel(question);
  if (type === 'sequenceExplorer') return sequenceModel(question);
  if (type === 'functionInvestigation2') return investigationModel(question);
  if (type === 'table') return tableModel(question);
  if (!COMPOSED_TYPES.includes(type)) return null;
  let composed = null;
  try { composed = readComposedQuestion(question); } catch { composed = null; }
  if (composed?.composed) return composedModel(question, composed);
  if (type === 'relationMapping') return relationModel(question);
  if (type === 'relationshipModel') return scenarioModel(question);
  if (GRAPH_WORKSPACE_TYPES.includes(type)) return graphModel(question);
  return null;
};

const modelFor = (question) => {
  if (!isObject(question)) return null;
  const fingerprint = (() => {
    try { return JSON.stringify(question); } catch { return null; }
  })();
  const cached = MODEL_CACHE.get(question);
  if (cached && fingerprint !== null && cached.fingerprint === fingerprint) return cached.model;
  let model = null;
  try { model = buildModel(question); } catch { model = null; }
  if (fingerprint !== null) MODEL_CACHE.set(question, { fingerprint, model });
  return model;
};

export const matches = (question) => Boolean(modelFor(question));

/* ---------------------------------------------------------------------------
 * expectedValues: everything the student must find, in every spelling.
 * ------------------------------------------------------------------------- */

const graphExpected = (model) => {
  const values = [];
  model.parts.forEach((part) => {
    if (part.kind === 'point' || part.kind === 'inversePoint') {
      const points = list(part.expected);
      if (!points.length) values.push(...NONE_FORMS);
      points.forEach((point) => values.push(...pointForms(point)));
    }
    list(part.acceptedAnswers).forEach((answer) => values.push(...answerForms(answer)));
  });
  model.tasks.forEach((task) => values.push(...pointForms(task.expected)));
  return values;
};

const linearRuleOf = (equation) => {
  const match = /^\s*[A-Za-z]\s*\(\s*([a-z])\s*\)\s*=\s*(.+)$/.exec(ascii(equation));
  if (!match) return null;
  const parsed = parseLinearRhs(match[2], match[1]);
  return parsed ? { ...parsed, variable: match[1] } : null;
};

const ruleValues = (rule, { bare = false, elements = false } = {}) => {
  if (rule === null || rule === undefined || typeof rule === 'boolean') return [];
  if (typeof rule === 'number') return numberForms(rule);
  if (typeof rule === 'string') {
    const forms = answerForms(rule);
    if (elements) {
      const inner = /^\{(.*)\}$/.exec(canonicalAnswer(rule));
      if (inner) inner[1].split(',').forEach((entry) => forms.push(...numberForms(entry)));
    }
    return forms;
  }
  if (Array.isArray(rule)) return rule.flatMap((entry) => ruleValues(entry, { bare, elements }));
  if (!isObject(rule)) return [];
  const out = [];
  if (rule.none === true) out.push(...NONE_FORMS);
  list(rule.points).forEach((point) => {
    out.push(...pointForms(point));
    if (bare && Array.isArray(point)) point.filter((value) => finiteNumber(value) !== null && Number(value) !== 0).forEach((value) => out.push(...numberForms(value)));
  });
  if (isObject(rule.values)) Object.values(rule.values).forEach((value) => out.push(...ruleValues(value)));
  if (Array.isArray(rule.set)) out.push(...setForms(rule.set));
  ['answer', 'value', 'expected', 'accepted', 'acceptedAnswers'].forEach((key) => out.push(...ruleValues(rule[key])));
  return out;
};

const composedExpected = (model) => {
  const values = [];
  if (model.standalone) {
    values.push(...ruleValues(model.grading.continuity));
    if (model.originPoint) values.push(...pointForms(model.originPoint));
  }
  model.stages.forEach((stage) => {
    const rule = model.grading[stage.id];
    const group = stageGroup(stage);
    values.push(...ruleValues(rule, { bare: model.hiddenEquation, elements: group === 'xIntercept' }));
    if (group === 'table' && isObject(rule) && rule.consistentWith === 'equation') {
      const linear = linearRuleOf(model.correctEquation);
      const xs = list(stage.xValues).map(finiteNumber).filter((value) => value !== null);
      if (linear) (xs.length ? xs : model.tableXValues).forEach((x) => values.push(...numberForms(linear.m * x + linear.b)));
    }
  });
  return values;
};

const relationDomain = (model) => uniqueSorted(model.pairs.map(([x]) => x));
const relationRange = (model) => uniqueSorted(model.pairs.map(([, y]) => y));
const relationVerdict = (model) => {
  const isFunction = relationIsFunction(model.pairs);
  const value = correctFunctionChoice(isFunction);
  const label = FUNCTION_CHOICES.find((choice) => choice.value === value)?.label || '';
  return { isFunction, value, label, phrases: isFunction ? ['is a function', 'yes'] : ['is not a function', 'not a function', 'no'] };
};

const relationExpected = (model) => {
  const values = [];
  if (model.ask.includes('domain')) values.push(...setForms(relationDomain(model)));
  if (model.ask.includes('range')) values.push(...setForms(relationRange(model)));
  if (model.ask.includes('isFunction')) {
    const verdict = relationVerdict(model);
    values.push(verdict.value, verdict.label, ...verdict.phrases);
  }
  model.fields.forEach((field) => answerCandidatesForField(field).forEach((answer) => values.push(...answerForms(answer))));
  return values;
};

const explicitRuleForms = (spec) => {
  if (spec.kind === 'arithmetic') {
    const constant = spec.first - spec.difference;
    const simplified = `${withCoefficient(spec.difference, 'n')}${plusConstant(constant)}`;
    return [simplified, `${dec(spec.first)} + (n - 1)${dec(spec.difference)}`, `${dec(spec.first)} + ${dec(spec.difference)}(n - 1)`, `a_n = ${simplified}`, `aₙ = ${simplified}`];
  }
  const power = `${dec(spec.ratio)}^(n - 1)`;
  return [`${dec(spec.first)}·${power}`, `${dec(spec.first)}(${dec(spec.ratio)})^(n - 1)`, `${dec(spec.first)}*${power}`, `a_n = ${dec(spec.first)}·${power}`];
};
const recursiveRuleForms = (spec) => (spec.kind === 'arithmetic'
  ? [`a_(n-1) + ${dec(spec.difference)}`, `a_{n-1} + ${dec(spec.difference)}`, `aₙ₋₁ + ${dec(spec.difference)}`, `aₙ₋₁ ${spec.difference < 0 ? '-' : '+'} ${dec(Math.abs(spec.difference))}`]
  : [`${dec(spec.ratio)}a_(n-1)`, `${dec(spec.ratio)}·aₙ₋₁`, `${dec(spec.ratio)}aₙ₋₁`, `${dec(spec.ratio)}a_{n-1}`]);

const sequenceExpected = (model) => {
  const values = [];
  const term = (spec, n) => {
    try { return sequenceTerm(spec, n); } catch { return null; }
  };
  if (model.mode === 'compare') {
    const result = compareSequencesAt(model.left, model.right, model.compareN);
    values.push(result.relation === 'left' ? model.leftLabel : result.relation === 'right' ? model.rightLabel : 'They are equal');
    values.push(...numberForms(result.difference), ...numberForms(result.left), ...numberForms(result.right));
    return values;
  }
  const readings = [model.spec, model.authored].filter(Boolean);
  readings.forEach((spec) => {
    const kindAsked = ['analyze', 'missingTerm'].includes(model.mode) || (model.mode === 'fullBridge' && model.actions.includes('analyzeSequence'));
    if (kindAsked) values.push(spec.kind);
    if (model.mode === 'analyze' || (model.mode === 'fullBridge' && model.actions.includes('analyzeSequence'))) values.push(...numberForms(sequenceChange(spec)));
    if (model.mode === 'analyze') values.push(...numberForms(term(spec, model.targetN)));
    if (model.mode === 'missingTerm') values.push(...numberForms(term(spec, model.missingIndex)));
    if (model.mode === 'partialSum') {
      values.push(...numberForms(term(spec, model.sumN)));
      try { values.push(...numberForms(sequencePartialSum(spec, model.sumN))); } catch { /* not a sum */ }
    }
    if (model.mode === 'ruleBridge' || model.mode === 'fullBridge') {
      values.push(...explicitRuleForms(spec), ...recursiveRuleForms(spec));
      if (model.mode === 'ruleBridge' || model.actions.includes('writeRecursive')) values.push(...numberForms(spec.first));
    }
    if (model.mode === 'fullBridge') {
      for (let n = 2; n <= 8; n += 1) values.push(...numberForms(term(spec, n)));
      if (model.targetN > 0) values.push(...numberForms(term(spec, model.targetN)));
    }
  });
  // An author who named the change commonDifference / commonRatio meant the
  // terms after the first: every one of them is an answer to that prompt.
  if (model.authored) for (let n = 2; n <= 10; n += 1) values.push(...numberForms(term(model.authored, n)));
  return values;
};

const investigationExpected = (model) => {
  const values = [];
  if (model.mode === 'compare') {
    const result = compareFunctionValues(model.left, model.right, model.x);
    const labels = { left: 'f(x) — the solid blue curve', right: 'g(x) — the dashed red curve', equal: 'They are equal', undefined: 'At least one is undefined here' };
    values.push(result.relation, labels[result.relation] || '', ...numberForms(result.leftValue), ...numberForms(result.rightValue));
    return values;
  }
  const spec = model.spec;
  if (model.mode === 'features') {
    const features = investigationFeatures(spec);
    values.push(...pointForms(features.anchor.point), ...features.anchor.point.flatMap((value) => numberForms(value)));
    features.verticalAsymptotes.forEach((x) => values.push(...numberForms(x), ...answerForms(`x = ${dec(x)}`)));
    features.horizontalAsymptotes.forEach((y) => values.push(...numberForms(y), ...answerForms(`y = ${dec(y)}`)));
  } else if (model.mode === 'domainRange') {
    const key = domainRangeForSpec(spec);
    [key.domainCode, key.rangeCode].forEach((code) => values.push(...answerForms(relationLabel(code, spec))));
  } else if (model.mode === 'intercepts') {
    const key = interceptsForSpec(spec);
    if (!key.x.length) values.push(...NONE_FORMS);
    else values.push(...answerForms(key.x.map(dec).join(', ')), ...key.x.flatMap((x) => [...numberForms(x), ...pointForms([x, 0])]));
    if (key.y !== null) values.push(...numberForms(key.y), ...pointForms([0, key.y]));
  } else if (model.mode === 'behavior') {
    const code = behaviorForSpec(spec);
    values.push(code, behaviorLabel(code));
  }
  return values;
};

const attributesExpected = (model) => model.fields.flatMap(({ field }) => answerCandidatesForField(field).flatMap((answer) => answerForms(answer)));

const tableExpected = (model) => model.blanks.flatMap((blank) => numberForms(blank.value));

const EXPECTED = { graph: graphExpected, composed: composedExpected, relation: relationExpected, sequence: sequenceExpected, investigation: investigationExpected, attributes: attributesExpected, table: tableExpected };

export const expectedValues = (question) => {
  try {
    const model = modelFor(question);
    if (!model) return [];
    return unique(EXPECTED[model.kind](model));
  } catch {
    return [];
  }
};

const guardFor = (question) => unique([...expectedValues(question), ...plainKeys(question)]);

/* ---------------------------------------------------------------------------
 * Hints: least to most specific, at most four.
 * ------------------------------------------------------------------------- */

const FAMILY_SHAPE = Object.freeze({
  linear: 'line',
  quadratic: 'parabola',
  absolute: 'V-shaped graph',
  squareRoot: 'square root curve',
  cubic: 'cubic curve',
  cubeRoot: 'cube root curve',
  exponential: 'exponential curve',
  logarithmic: 'logarithmic curve',
  rational: 'two-branch reciprocal graph',
});

const featureHint = (spec, equation) => {
  const type = specType(spec);
  const inside = insideText(paramH(spec));
  const plain = {
    linear: 'This graph is a line: check whether it keeps going (arrows) or stops at endpoints (dots), and whether it rises or falls from left to right.',
    quadratic: 'Compare the equation with vertex form a(x - h)² + k: the vertex (h, k) is the turning point, and the sign of a tells you whether the parabola opens up or down.',
    absolute: 'Compare the equation with a|x - h| + k: the vertex (h, k) is the corner of the V, and the sign of a tells you whether the V opens up or down.',
    squareRoot: 'Which x-values keep the expression under the square root from being negative? The graph exists only for those x-values; where is that expression exactly zero?',
    cubic: 'Compare the equation with a(x - h)³ + k: the point (h, k) is the center of the curve, and the sign of a tells you whether it rises or falls from left to right.',
    cubeRoot: 'Compare the equation with a∛(x - h) + k: the point (h, k) is the center of the curve, and the sign of a tells you whether it rises or falls from left to right.',
    exponential: 'Far to one side the power term gets very close to zero: what are the outputs close to there? The base and the sign in front decide whether the graph rises or falls.',
    logarithmic: 'Which x-values can go into the logarithm? Look for the vertical asymptote the graph gets close to but never touches.',
    rational: 'Which x-value would make the denominator zero, and what does the graph do near it? What value do the outputs get close to far to the left and right?',
  }[type] || 'Find the feature that organizes this graph (a turning point, an endpoint, a center or an asymptote) before reading anything else.';
  if (!equation) return [plain];
  const numbered = {
    linear: `${equation} is a line: check whether its graph keeps going (arrows) or stops at endpoints (dots), and whether it rises or falls from left to right.`,
    quadratic: `Compare ${equation} with vertex form a(x - h)² + k: which numbers play the roles of h and k? The vertex (h, k) is the turning point, and the sign of a tells you whether the parabola opens up or down.`,
    absolute: `Compare ${equation} with a|x - h| + k: which numbers play the roles of h and k? The vertex (h, k) is the corner of the V, and the sign of a tells you whether it opens up or down.`,
    squareRoot: `In ${equation}, which x-values keep the expression under the square root, ${inside}, from being negative? The graph exists only for those x-values; where is ${inside} exactly zero?`,
    cubic: `Compare ${equation} with a(x - h)³ + k: which numbers play the roles of h and k? (h, k) is the center of the curve, and the sign of a tells you whether it rises or falls.`,
    cubeRoot: `Compare ${equation} with a∛(x - h) + k: which numbers play the roles of h and k? (h, k) is the center of the curve, and the sign of a tells you whether it rises or falls.`,
    exponential: `In ${equation}, far to one side the power term gets very close to zero: what are the outputs close to there? The base and the sign in front decide whether the graph rises or falls.`,
    logarithmic: `In ${equation}, which values of ${inside} can a logarithm accept, and so which x-values can the graph use? Look for the vertical asymptote the graph gets close to but never touches.`,
    rational: `In ${equation}, which x-value would make the denominator ${inside} zero, and what does the graph do near it? What value do the outputs get close to far to the left and right?`,
  }[type];
  return [numbered, plain];
};

const NOTATION_HINT = Object.freeze({
  interval: 'Write each answer in interval notation: a square bracket where an endpoint is included, a parenthesis where it is not and always next to ∞; join separate pieces with ∪.',
  inequality: 'Write each answer as an inequality: ≤ or ≥ where an endpoint is included, < or > where it is not.',
  set: 'Write the answer as a set: list each value once inside braces, from least to greatest.',
});

const graphHints = (model, guard) => {
  const equation = model.equation;
  const kinds = new Set(model.parts.map((part) => (part.kind === 'point' ? `point:${part.feature}` : part.kind)));
  const has = (...names) => names.some((name) => kinds.has(name));
  const points = [...kinds].filter((kind) => kind.startsWith('point:'));
  const out = [];

  if (!model.parts.length) {
    const key = {
      linear: 'its y-intercept',
      quadratic: 'its vertex',
      absolute: 'its vertex',
      squareRoot: 'the endpoint where the graph starts',
      cubic: 'its center point',
      cubeRoot: 'its center point',
      exponential: 'its horizontal asymptote and the point where the curve crosses the y-axis',
      logarithmic: 'its vertical asymptote',
      rational: 'the point where its two asymptotes cross',
    }[specType(model.spec)] || 'its key point';
    out.push(firstSafe(guard, equation && `Start with the key feature of ${equation}: ${key}.`, `Start with the key feature of this function: ${key}.`));
    const [feature, plainFeature] = featureHint(model.spec, equation);
    out.push(firstSafe(guard, feature, plainFeature));
    out.push(firstSafe(guard,
      equation && `Choose x-values on both sides of the key point and compute f(x) for each one with ${equation} before you plot it.`,
      'Choose x-values on both sides of the key point and compute f(x) for each one before you plot it.'));
    out.push('Connect the points with the shape of this family, then mark each end: an arrow where the graph keeps going, a closed or open dot where it stops.');
    return out;
  }

  const orientation = [];
  if (has('domain', 'range')) orientation.push('the domain is read along the x-axis (left to right) and the range along the y-axis (bottom to top)');
  if (has('increasing', 'decreasing', 'constant')) orientation.push('increasing and decreasing describe the graph as you move from left to right, and are written with x-values only');
  if (has('positive', 'negative')) orientation.push('positive means the graph is above the x-axis and negative means below it, written with x-values');
  if (points.length) orientation.push('each point you mark is a feature of the graph: read its x-coordinate first, then its y-coordinate');
  const lead = capitalize(orientation.slice(0, 2).join('; '));
  out.push(firstSafe(guard, equation && `Work from the graph of ${equation}: ${orientation.slice(0, 2).join('; ')}.`, `${lead}.`));

  const [feature, plainFeature] = featureHint(model.spec, equation);
  const restricted = isRestricted(model.spec)
    ? ' The graph is restricted: at each end, a closed dot means that endpoint is included and an open dot means it is not.'
    : '';
  out.push(firstSafe(guard, `${feature}${restricted}`, `${plainFeature || feature}${restricted}`, plainFeature, feature));

  const procedure = [];
  const procedurePlain = [];
  if (has('increasing', 'decreasing', 'constant')) {
    const type = specType(model.spec);
    const text1 = turningOf(model.spec) !== null
      ? 'Find the x-value where the graph turns around; on each side of it, decide whether the graph rises or falls as x increases. The turning x-value itself belongs to neither open interval.'
      : type === 'rational'
        ? 'Treat each branch on its own side of the vertical asymptote: does each one rise or fall as x increases? The asymptote splits the intervals.'
        : 'Decide whether the graph rises or falls as you move from left to right everywhere it is drawn, and use the x-values where it is drawn for the interval.';
    procedure.push(text1);
    procedurePlain.push(text1);
  }
  if (has('positive', 'negative')) {
    procedure.push(equation
      ? `Solve ${renderRhs(model.spec)} = 0 to find where the graph meets the x-axis; then test one x-value in each piece to see whether the graph is above or below the axis there.`
      : 'Find where the graph meets the x-axis; then test one x-value in each piece to see whether the graph is above or below the axis there.');
    procedurePlain.push('Find where the graph meets the x-axis; then test one x-value in each piece to see whether the graph is above or below the axis there.');
  }
  if (points.length) {
    const words = [];
    if (points.includes('point:xIntercepts')) words.push('an x-intercept has y-coordinate zero, so set f(x) equal to zero');
    if (points.includes('point:yIntercept')) words.push('the y-intercept is the output when x is zero');
    if (points.some((kind) => /vertex|localMinimum|localMaximum/.test(kind))) words.push('the vertex, minimum or maximum is the turning point of the graph');
    if (points.includes('point:center')) words.push('the center is where the two asymptotes cross');
    const sentence = `${capitalize(words.join('; '))}.`;
    procedure.push(sentence);
    procedurePlain.push(sentence);
  }
  if (procedure.length) out.push(firstSafe(guard, procedure.slice(0, 2).join(' '), procedurePlain.slice(0, 2).join(' ')));

  const notations = new Set(model.parts.map((part) => text(part.notation)).filter(Boolean));
  const notation = notations.has('interval') ? 'interval' : notations.has('inequality') ? 'inequality' : '';
  if (notation) out.push(NOTATION_HINT[notation]);
  return out;
};

const GROUP_WORDS = Object.freeze({
  quantities: 'which quantity is the input',
  equation: 'the rule',
  table: 'the table',
  graph: 'the graph',
  mapping: 'the mapping diagram',
  domain: 'the domain',
  range: 'the range',
  continuity: 'how the graph should be drawn',
  isFunction: 'whether the relation passes the function test',
  model: 'the kind of function',
  xIntercept: 'the x-intercepts',
  yIntercept: 'the y-intercept',
  extreme: 'the turning point',
  axis: 'the axis of symmetry',
  asymptote: 'the asymptote',
  behavior: 'how the graph behaves from left to right',
  axes: 'the axis labels and scale',
  origin: 'what the starting point means',
});

const sortedQuantityLabels = (model) => model.quantities.map((quantity) => text(quantity.label)).sort((p, q) => p.localeCompare(q));

const composedGroupHint = (model, group, guard) => {
  const firstStage = model.stages.find((stage) => stageGroup(stage) === group) || {};
  const equation = model.equation;
  const situation = model.scenario;
  switch (group) {
    case 'xIntercept':
      return firstSafe(guard,
        equation && `To find where the graph of ${equation} meets the x-axis, solve ${renderRhs(model.spec)} = 0.`,
        'An x-intercept is a point on the x-axis, so its y-coordinate is zero: look for every place the graph meets that axis and write each as an ordered pair. The zeros are just the x-values of those points.');
    case 'yIntercept':
      return firstSafe(guard,
        'The y-intercept is the point where the graph meets the y-axis, where x is zero; write it as an ordered pair with x-coordinate zero.');
    case 'extreme':
      // Worded so it holds for a graph that never turns (a cubic, an
      // exponential) as well as for a parabola.
      return 'Look for a turning point: a single highest or lowest point where the graph changes direction. Check first whether the graph ever changes direction; if it does, decide from the shape which kind of point it is, then read its x-coordinate before its y-coordinate.';
    case 'axis':
      return 'The axis of symmetry is the vertical line through the turning point: write it as an equation that starts with x =.';
    case 'asymptote':
      // A logarithm's asymptote is vertical, not horizontal.
      if (specType(model.spec) === 'logarithmic') {
        return 'Follow the graph down (or up) along its left edge: the vertical line it gets closer and closer to without touching is the asymptote. Write it as an equation that starts with x =.';
      }
      return 'Follow the graph far to one side: the horizontal line it gets closer and closer to without touching is the asymptote. Write it as an equation that starts with y =.';
    case 'behavior':
      return 'Trace the graph from left to right with your finger: are the y-values going up, going down, or changing direction partway? If it changes, note where.';
    case 'model':
      return 'Look at how the y-values change each time x goes up by the same step: do they change by equal differences, by equal ratios, or in some other way?';
    case 'domain':
      if (model.recipe === 'functionModeling') {
        return firstSafe(guard,
          situation && `Reread the situation: “${situation}” What is the smallest input that makes sense, and what is the largest the situation allows?`,
          'Use only the inputs that make sense in the situation: the smallest sensible input and the largest the situation allows.');
      }
      if (firstStage.source || model.groups.includes('table')) {
        return 'The domain is every x-value your graph uses; for separate points, list those x-values once each.';
      }
      return 'For the domain, scan the graph from left to right: where does it start and stop along the x-axis? A closed dot is included, an open dot is not, and an arrow means the graph keeps going.';
    case 'range':
      if (model.recipe === 'functionModeling') return 'Put the smallest and largest sensible inputs into the rule to get the smallest and largest outputs; the range runs between them.';
      if (firstStage.source || model.groups.includes('table')) return 'The range is every y-value your graph uses; for separate points, list those y-values once each.';
      return 'For the range, scan the graph from bottom to top: what is the lowest y-value it reaches, and the highest? A turning point, a dot or an asymptote can limit it.';
    case 'continuity':
      return 'Decide whether an input in between makes sense here, for example one and a half of the input. If only whole-number inputs make sense, the graph is separate points; if every value in between makes sense, it is one connected piece.';
    case 'quantities': {
      const labels = sortedQuantityLabels(model);
      return firstSafe(guard,
        labels.length === 2 && `The output (dependent) quantity depends on the input (independent) one: does “${labels[0]}” depend on “${labels[1]}”, or the other way around?`,
        'The output (dependent) quantity is the result: it depends on the input (independent) quantity, which you choose or which changes on its own.');
    }
    case 'equation':
      return 'Find the rate (how much the output changes each time the input goes up by one) and the starting value (the output when the input is zero); a linear model is output = rate · input + starting value.';
    case 'table': {
      const xs = list(firstStage.xValues).map(finiteNumber).filter((value) => value !== null);
      return firstSafe(guard,
        equation && xs.length && `Substitute each x-value into ${equation}, one row at a time: start with x = ${dec(xs[0])}.`,
        equation && `Substitute each x-value into ${equation}, one row at a time.`,
        'Substitute each x-value into the rule, one row at a time, and keep the order of operations: multiply before you add.');
    }
    case 'graph':
      return 'Plot each (x, y) pair from your table; connect the points only if every input in between makes sense.';
    case 'mapping':
      return 'Draw one arrow for each ordered pair, from its first number (the input) to its second number (the output).';
    case 'axes':
      return 'Put the input (independent) quantity on the horizontal axis and the output (dependent) quantity on the vertical axis, each with its unit; choose a scale step that lets the largest value in the situation fit on the grid.';
    case 'origin':
      return 'The starting point is where the input is zero: say what the output is at that moment, in the words and units of the situation.';
    case 'isFunction':
      return 'A relation counts as a function when each input is paired with exactly one output. Check whether any input appears in two pairs with different outputs (a repeated output is allowed).';
    default:
      return '';
  }
};

const composedHints = (model, guard) => {
  const out = [];
  const words = model.groups.map((group) => GROUP_WORDS[group]).filter(Boolean);
  if (model.recipe === 'functionModeling' || model.groups[0] === 'quantities') {
    out.push('Start by naming the input and the output quantities; every later step (rule, table, graph, domain, range) builds on that choice.');
  } else if (words.length) {
    out.push(`This question asks about ${joinWords(words.slice(0, 5))}${words.length > 5 ? ', and more' : ''}. Take them one at a time, in that order: each one reads a different feature of the same relationship.`);
  }
  model.groups.forEach((group) => {
    if (out.length >= 4) return;
    const hint = composedGroupHint(model, group, guard);
    if (hint) out.push(hint);
  });
  return out;
};

const pairsText = (pairs) => pairs.map(([x, y]) => `(${dec(x)}, ${dec(y)})`).join(', ');

const relationHints = (model, guard) => {
  const out = [];
  const arrows = new Set(model.pairs.map(([x, y]) => `${x}|${y}`)).size;
  out.push(firstSafe(guard,
    `Each ordered pair in {${pairsText(model.pairs)}} is one input and its output: the first number is the input, the second is the output.`,
    'Each ordered pair is one input and its output: the first number is the input, the second is the output.'));
  if (model.ask.includes('mapping') || model.ask.includes('plot')) {
    out.push(firstSafe(guard,
      model.ask.includes('mapping') && `Draw exactly one arrow per pair (${arrows} pairs, so ${arrows} arrows), from the input column to the output column.`,
      model.ask.includes('mapping') ? 'Draw exactly one arrow per pair, from the input column to the output column.' : 'Plot exactly one point per ordered pair.'));
  }
  if (model.ask.includes('domain') || model.ask.includes('range')) {
    out.push('The domain is the list of first numbers and the range is the list of second numbers; write each value only once, from least to greatest.');
  }
  if (model.ask.includes('isFunction')) {
    out.push('A relation counts as a function when each input is paired with exactly one output. Look down the inputs: does any input appear in two pairs with different outputs? A repeated output is allowed.');
  }
  model.fields.slice(0, 1).forEach((field) => out.push(firstSafe(guard, `For “${text(field.label || field.id)}”, use the same pairs: read each one as input first, output second.`)));
  return out;
};

const tableHints = (model, guard) => {
  const out = [];
  const rhs = model.rule ? ruleRhs(model.rule) : '';
  out.push(firstSafe(guard,
    model.ruleVisible && `Each blank is the output y for the x-value in its row: use y = ${rhs} for every row.`,
    'Each blank is the output for the x-value in its row: put that x-value into the rule.'));
  const first = model.blanks.find((blank) => blank.x !== null);
  out.push(firstSafe(guard,
    first && model.ruleVisible && `Start with the row x = ${dec(first.x)}: replace x with (${dec(first.x)}) in ${rhs} and evaluate step by step.`,
    'Start with the first blank row: replace x with that row’s x-value, in parentheses, and evaluate step by step.'));
  if (model.rule?.type === 'quadratic') {
    out.push('Square the x-value first (a negative number squared is positive), multiply by its coefficient, then add or subtract the other terms.');
    out.push('Check the column: in a quadratic table the differences of the outputs change by the same amount each time x goes up by the same step.');
  } else if (model.rule?.type === 'linear') {
    out.push('Multiply the x-value by the slope first, then add or subtract the constant term.');
    out.push('Check the column: for a linear rule the outputs change by the same amount each time x goes up by the same step.');
  } else {
    out.push('Follow the order of operations in the rule: powers first, then multiplication and division, then addition and subtraction.');
  }
  return out;
};

const shownTerms = (spec, count = 3) => {
  try { return Array.from({ length: count }, (_, index) => sequenceTerm(spec, index + 1)); } catch { return []; }
};

const sequenceHints = (model, guard) => {
  const out = [];
  if (model.mode === 'compare') {
    out.push(firstSafe(guard,
      `Find term ${model.compareN} of each sequence separately, using each sequence's own first term and its own step.`,
      'Find the requested term of each sequence separately, using each sequence’s own first term and its own step.'));
    out.push('Then compare the two values: which one is larger? The difference is the larger value minus the smaller one.');
    out.push('Check one value by listing the terms of that sequence one at a time up to the requested position.');
    return out;
  }
  const spec = model.authored || model.spec;
  const terms = model.authored ? [] : shownTerms(spec);
  const stepHint = 'Look at how each term is made from the one before it: subtract each term from the next, and also divide each term by the one before. Which of the two stays the same every time?';
  if (model.mode === 'analyze' || model.mode === 'missingTerm') {
    out.push(stepHint);
    out.push(firstSafe(guard,
      terms.length === 3 && `The sequence starts ${terms.map(dec).join(', ')}: use two neighbouring terms to find the step, then check it on a third.`,
      'Use two neighbouring terms to find the step, then check it on another pair.'));
    out.push(model.mode === 'analyze'
      ? firstSafe(guard,
        `To reach term ${model.targetN} from the first term you take ${model.targetN - 1} equal steps: apply the step that many times, or use the explicit rule.`,
        'Count how many equal steps lie between the first term and the term you need, then apply the step that many times, or use the explicit rule.')
      : firstSafe(guard,
        `Find the step from two neighbouring terms you can see, then step forward or back to fill position ${model.missingIndex}.`,
        'Find the step from two neighbouring terms you can see, then step forward or back to fill the gap.'));
    return out;
  }
  if (model.mode === 'partialSum') {
    out.push('A partial sum adds the terms from the first term up to the position you are told.');
    out.push(stepHint);
    out.push(firstSafe(guard,
      `Write out the first ${model.sumN} terms (or find the last one with the rule), then add them carefully.`,
      'Write out the terms up to the position you are told (or find the last one with the rule), then add them carefully.'));
    return out;
  }
  out.push('An explicit rule gives any term straight from its position n; a recursive rule gives each term from the one before it, together with the first term.');
  out.push(stepHint);
  out.push(firstSafe(guard,
    terms.length === 3 && `The sequence starts ${terms.map(dec).join(', ')}: what do you do to one term to get the next? That operation is the recursive rule.`,
    'What do you do to one term to get the next? That operation is the recursive rule.'));
  out.push('For a constant difference, start at the first term and add the difference once for each step after the first; for a constant ratio, multiply by the ratio once for each step after the first.');
  return out;
};

const INVESTIGATION_DOMAIN_HINT = Object.freeze({
  squareRoot: 'Does a square root graph cover the page from left to right, or does it start somewhere? Is that starting point on the graph?',
  logarithmic: 'Does a logarithmic graph reach every x-value, or is there a vertical asymptote on one side that it never crosses?',
  rational: 'Is there an x-value the graph never reaches, and a y-value it never reaches? Look at the dashed asymptotes.',
  exponential: 'Does an exponential graph reach every y-value, or does it stay on one side of its horizontal asymptote?',
  quadratic: 'How far left and right does the parabola go? How low (or how high) does it go: does its turning point limit the y-values?',
  absolute: 'How far left and right does the V go? How low (or how high) does it go: does its corner limit the y-values?',
});

const investigationHints = (model, guard) => {
  const out = [];
  if (model.mode === 'compare') {
    out.push(firstSafe(guard,
      `Both functions are compared at x = ${dec(model.x)}: follow the vertical line at that input up or down to each curve.`,
      'Both functions are compared at the same input: follow the marked vertical line up or down to each curve.'));
    out.push('Whichever curve the line meets higher has the greater value; if the line misses a curve entirely, that function is undefined there.');
    return out;
  }
  const label = FUNCTION_FAMILY_LABELS[model.spec.type] || 'function';
  if (model.mode === 'features') {
    const anchor = investigationFeatures(model.spec).anchor.label;
    out.push(`Every ${label.toLowerCase()} graph is organized around one defining feature, its ${anchor}: find it on the graph before typing anything.`);
    out.push('Read the x-coordinate by counting gridlines across from the origin, then the y-coordinate by counting up or down.');
    if (['rational', 'exponential', 'logarithmic'].includes(model.spec.type)) {
      out.push('Asymptotes are drawn as dashed lines: a vertical one is a line x = (a number) and a horizontal one is y = (a number); read where each one crosses its axis.');
    }
    return out;
  }
  if (model.mode === 'domainRange') {
    out.push('Domain: the x-values the graph reaches, read left to right. Range: the y-values it reaches, read bottom to top.');
    out.push(INVESTIGATION_DOMAIN_HINT[model.spec.type] || `Look for anything that stops this ${label.toLowerCase()} graph: an endpoint, an asymptote or a turning point.`);
    out.push('Pick the choice that describes exactly those values: watch whether a boundary value itself is reached.');
    return out;
  }
  if (model.mode === 'intercepts') {
    out.push('An x-intercept is where the graph meets the x-axis (where y is zero); the y-intercept is where it meets the y-axis (where x is zero).');
    out.push('Some graphs never meet an axis: look for an asymptote or a starting point that keeps the graph away from it.');
    out.push('Type the x-values of the x-intercepts only, separated by commas, and the y-value of the y-intercept.');
    return out;
  }
  out.push('Read the graph from left to right: does it turn around at a single highest or lowest point, or does it keep going the same way?');
  out.push(`For ${withArticle(label.toLowerCase())} graph, the sign of a (and, for an exponential or logarithmic graph, whether the base is above or below one) decides its direction.`);
  if (model.spec.type === 'rational') out.push('A rational graph has two branches: look at each branch separately, on each side of its vertical asymptote.');
  return out;
};

const ATTRIBUTE_DOMAIN_HINT = Object.freeze({
  squareRoot: 'Which inputs can go under the square root and give a real output? Try a negative input, zero and a positive input.',
  cubeRoot: 'Can you take the cube root of a negative number? Of zero? Of a positive number?',
  rational: 'Which input would make the denominator zero, and can that input be used?',
  logarithmic: 'A logarithm only accepts certain inputs: can you take the logarithm of a negative number, or of zero?',
});
const ATTRIBUTE_RANGE_HINT = Object.freeze({
  squareRoot: 'Can a square root ever be negative? What is the smallest output it can give?',
  cubeRoot: 'How large and how small can a cube root get as the input runs through every number?',
  rational: 'Is there an output a reciprocal can never equal, however large or small the input gets?',
  exponential: 'Can a positive base raised to a power ever give zero, or a negative number?',
  logarithmic: 'How large and how small can a logarithm get as its input runs through the allowed values?',
  absolute: 'Can an absolute value ever be negative? What is the smallest output it can give?',
  quadratic: 'Can a square ever be negative? What is the smallest output it can give?',
  cubic: 'How large and how small can a cube get as the input runs through every number?',
});

const attributeHint = (model, kind, guard, fn) => {
  const equation = text(fn?.equation);
  switch (kind) {
    case 'domain': {
      if (fn?.type === 'linear' && fn.restriction) {
        return firstSafe(guard,
          `The situation limits the input ${fn.variable}: reread where it starts and where it stops (${dec(fn.restriction[0])} and ${dec(fn.restriction[1])}), and decide whether every value in between makes sense or only whole numbers.`,
          'The situation limits the input: reread where it starts and where it stops, and decide whether every value in between makes sense or only whole numbers.');
      }
      const specific = ATTRIBUTE_DOMAIN_HINT[fn?.type];
      return firstSafe(guard,
        specific && equation && `For ${equation}: ${lowerFirst(specific)}`,
        specific,
        equation && `For ${equation}: is there any input you could not substitute into the rule?`,
        'Is there any input you could not substitute into the rule, or does the situation limit the inputs?');
    }
    case 'range': {
      if (fn?.type === 'linear' && fn.restriction) {
        return firstSafe(guard,
          `Evaluate the rule at the smallest and largest inputs, ${fn.name}(${dec(fn.restriction[0])}) and ${fn.name}(${dec(fn.restriction[1])}): those give the smallest and largest outputs.`,
          'Evaluate the rule at the smallest and largest inputs: those give the smallest and largest outputs.');
      }
      const specific = ATTRIBUTE_RANGE_HINT[fn?.type];
      return firstSafe(guard,
        specific && equation && `For ${equation}: ${lowerFirst(specific)}`,
        specific,
        'Think about the outputs: as the input runs through the domain, which output values can the rule actually give?');
    }
    case 'continuity':
      return 'Could the input be any value in between, such as a fraction of a minute, or only whole numbers? That decides whether the graph is one connected piece or separate points.';
    case 'family':
      return firstSafe(guard,
        equation && `In ${equation}, what is done to x: is it raised to a power, under a root sign, inside vertical bars, in an exponent, inside a logarithm, or in a denominator?`,
        'Look at what is done to x: is it raised to a power, under a root sign, inside vertical bars, in an exponent, inside a logarithm, or in a denominator?');
    case 'asymptote':
      return 'An asymptote is a line the graph approaches but never reaches. A vertical one comes from an input that is not allowed; a horizontal one from an output the function approaches far to the left or right. Check each function separately.';
    case 'intercept':
      return firstSafe(guard,
        equation && `The y-intercept is the output when the input is zero: evaluate ${equation} there and write the point as an ordered pair.`,
        'The y-intercept is the output when the input is zero: evaluate the function there and write the point as an ordered pair.');
    case 'attribute':
      return firstSafe(guard,
        equation && `Check each statement against ${equation} one at a time: substitute a negative input, zero and a positive input, and look at the outputs.`,
        'Check each statement one at a time: substitute a negative input, zero and a positive input, and look at the outputs.');
    default:
      return '';
  }
};

const attributesHints = (model, guard) => {
  const out = [];
  const kinds = unique(model.fields.map((entry) => entry.kind));
  if (kinds.includes('domain') || kinds.includes('range')) {
    out.push('The domain is every input (x-value) the function accepts; the range is every output (y-value) it actually produces.');
  } else {
    out.push('Answer one part at a time, and check each choice against the function itself rather than against the other choices.');
  }
  kinds.forEach((kind) => {
    if (out.length >= 4) return;
    const fn = model.fields.find((entry) => entry.kind === kind)?.fn || model.fn;
    const hint = attributeHint(model, kind, guard, fn);
    if (hint) out.push(hint);
  });
  return out;
};

const HINTS = { graph: graphHints, composed: composedHints, relation: relationHints, table: tableHints, sequence: sequenceHints, investigation: investigationHints, attributes: attributesHints };

export const hints = (question) => {
  try {
    const model = modelFor(question);
    if (!model) return [];
    const guard = guardFor(question);
    const seen = new Set();
    return HINTS[model.kind](model, guard)
      .map(text)
      .filter((hint) => {
        const key = hint.toLowerCase();
        if (!hint || seen.has(key) || leaks(hint, guard)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: the first move, never a value.
 * ------------------------------------------------------------------------- */

const AXIS_STEP = Object.freeze({
  domain: ['Let’s back up. Which axis do you read the domain along?', 'The x-axis, from left to right', 'The y-axis, from bottom to top'],
  range: ['Let’s back up. Which axis do you read the range along?', 'The y-axis, from bottom to top', 'The x-axis, from left to right'],
  monotone: ['Let’s back up. Increasing and decreasing intervals are written with which values?', 'The x-values where it happens', 'The y-values the graph reaches'],
  sign: ['Let’s back up. Where is a function positive?', 'Where its graph is above the x-axis', 'Where its graph is to the right of the y-axis'],
  xIntercept: ['Let’s back up. An x-intercept is where the graph meets which axis?', 'The x-axis', 'The y-axis'],
  yIntercept: ['Let’s back up. The y-intercept is where the graph meets which axis?', 'The y-axis', 'The x-axis'],
  point: ['Let’s back up. When you read a point from a graph, which coordinate comes first?', 'The x-coordinate (across)', 'The y-coordinate (up or down)'],
  extreme: ['Let’s back up. What does a graph do at a turning point?', 'It changes direction', 'It keeps going the same way'],
  construct: ['Let’s back up. What should you plot first?', 'The key point of the function family', 'Any point far from the center of the graph'],
  behavior: ['Let’s back up. Which way do you read a graph’s behavior?', 'From left to right', 'From right to left'],
  pair: ['Let’s back up. In an ordered pair (x, y), which number is the input?', 'The first number', 'The second number'],
  quantities: ['Let’s back up. Where does the input quantity go on a graph?', 'On the horizontal axis', 'On the vertical axis'],
  table: ['Let’s back up. To fill a row of the table, what do you do with its x-value?', 'Substitute it into the rule', 'Add it to the output above'],
  sequence: ['Let’s back up. In aₙ, what does n stand for?', 'The position of the term', 'The value of the term'],
  compare: ['Let’s back up. To compare two functions at one input, what do you compare?', 'Their outputs at that same input', 'Their equations’ first numbers'],
  asymptote: ['Let’s back up. Does a graph ever reach its asymptote?', 'It gets closer and closer but never reaches it', 'It crosses it at the origin'],
});

const stepFor = (guard, key) => {
  const step = AXIS_STEP[key];
  return step ? twoChoice(guard, step[0], step[1], step[2]) : null;
};

const firstStep = (guard, keys) => {
  for (const key of keys) {
    const step = stepFor(guard, key);
    if (step) return step;
  }
  return null;
};

const graphStepKeys = (model) => {
  if (!model.parts.length) return ['construct', 'point'];
  const kind = text(model.parts[0].kind);
  if (kind === 'domain') return ['domain', 'point'];
  if (kind === 'range') return ['range', 'point'];
  if (['increasing', 'decreasing', 'constant'].includes(kind)) return ['monotone', 'behavior'];
  if (['positive', 'negative'].includes(kind)) return ['sign', 'xIntercept'];
  if (model.parts[0].feature === 'xIntercepts') return ['xIntercept', 'point'];
  if (model.parts[0].feature === 'yIntercept') return ['yIntercept', 'point'];
  return ['point'];
};

const COMPOSED_STEP = Object.freeze({
  quantities: 'quantities', table: 'table', graph: 'pair', mapping: 'pair', domain: 'domain', range: 'range',
  continuity: 'quantities', isFunction: 'pair', model: 'behavior', xIntercept: 'xIntercept', yIntercept: 'yIntercept',
  extreme: 'extreme', axis: 'extreme', asymptote: 'asymptote', behavior: 'behavior', equation: 'quantities',
  axes: 'quantities', origin: 'quantities',
});

export const backUpQuestion = (question) => {
  try {
    const model = modelFor(question);
    if (!model) return null;
    const guard = guardFor(question);
    if (model.kind === 'graph') return firstStep(guard, graphStepKeys(model));
    if (model.kind === 'composed') return firstStep(guard, [COMPOSED_STEP[model.groups[0]], 'point'].filter(Boolean));
    if (model.kind === 'relation') return firstStep(guard, ['pair']);
    if (model.kind === 'table') return firstStep(guard, ['table']);
    if (model.kind === 'sequence') return firstStep(guard, ['sequence']);
    if (model.kind === 'investigation') {
      const key = { features: 'point', domainRange: 'domain', intercepts: 'xIntercept', behavior: 'behavior', compare: 'compare' }[model.mode];
      return firstStep(guard, [key, 'point']);
    }
    if (model.kind === 'attributes') {
      const kind = model.fields[0]?.kind;
      return firstStep(guard, [{ domain: 'domain', range: 'range', asymptote: 'asymptote', intercept: 'yIntercept', continuity: 'quantities' }[kind] || 'pair']);
    }
    return null;
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * similarProblem: a worked sibling on new numbers.
 * ------------------------------------------------------------------------- */

const ANALYSIS_WORDS = Object.freeze({
  domain: 'the domain',
  range: 'the range',
  increasing: 'where it is increasing',
  decreasing: 'where it is decreasing',
  constant: 'where it is constant',
  positive: 'where it is positive',
  negative: 'where it is negative',
});
const FEATURE_WORDS = Object.freeze({
  vertex: 'its vertex',
  localMinimum: 'its local minimum',
  localMaximum: 'its local maximum',
  xIntercepts: 'its x-intercepts',
  yIntercept: 'its y-intercept',
  center: 'its center',
});

/** "f(-1) = 5, f(2) = -4 and f(6) = 12": the values a closed graph's range is read from. */
const rangeEvidence = (spec) => {
  const pieces = domainPieces(spec);
  if (pieces.length !== 1 || !Number.isFinite(pieces[0].min) || !Number.isFinite(pieces[0].max)) return '';
  const { min, max } = pieces[0];
  const turning = turningOf(spec);
  const xs = [min, ...(turning !== null && turning > min && turning < max ? [turning] : []), max];
  return joinWords(xs.map((x) => `f(${dec(x)}) = ${dec(valueAt(spec, x))}${x === turning ? ' at the vertex' : ''}`));
};

const rangeStep = (spec, shown) => {
  const evidence = rangeEvidence(spec);
  return evidence
    ? `Range: check the ends${turningOf(spec) !== null ? ' and the vertex' : ''}: ${evidence}. The smallest and largest of these bound the y-values, so the range is ${shown}.`
    : `Range: the y-values the graph reaches are ${shown}.`;
};

/** The families whose (h, k) is the vertex, and those whose (h, k) is the center. */
const VERTEX_TYPES = Object.freeze(['quadratic', 'absolute']);
const CENTER_TYPES = Object.freeze(['cubic', 'cubeRoot', 'rational']);

/** The worked steps of a graph sibling, one per kind of part: [[step, short answer], …]. */
const workGraph = (spec, parts) => {
  const out = [];
  const kinds = new Set(parts.map((part) => text(part.kind)));
  const restriction = restrictionText(spec);
  if (kinds.has('domain')) {
    const shown = showIntervals(domainOf(spec));
    out.push([`Domain: ${restriction ? `the graph uses exactly the x-values ${restriction}` : 'the x-values the graph uses'}, so the domain is ${shown}.`, `domain ${shown}`]);
  }
  if (kinds.has('range')) {
    const shown = showIntervals(rangeOf(spec));
    out.push([rangeStep(spec, shown), `range ${shown}`]);
  }
  const monotone = ['increasing', 'decreasing'].filter((kind) => kinds.has(kind));
  if (monotone.length || kinds.has('constant')) {
    const turning = turningOf(spec);
    const described = monotone.map((kind) => {
      const intervals = monotoneIntervals(spec, kind === 'increasing' ? 1 : -1);
      return intervals.length ? [`${kind} on ${showIntervals(intervals)}`, `${kind} ${showIntervals(intervals)}`] : [`never ${kind}`, `${kind} never`];
    });
    if (kinds.has('constant')) described.push(['never flat (constant) on any interval', 'constant never']);
    const lead = turning !== null
      ? `Reading left to right, the graph turns around at x = ${dec(turning)}, so it is`
      : `Reading left to right, the graph ${directionOf(spec, domainPieces(spec)[0]) > 0 ? 'rises' : 'falls'} the whole way, so it is`;
    out.push([`${lead} ${joinClauses(described.map(([step]) => step))}.`, described.map(([, answer]) => answer).join('; ')]);
  }
  const signs = ['positive', 'negative'].filter((kind) => kinds.has(kind));
  if (signs.length) {
    const zeros = zerosOf(spec);
    const solve = zeros.length
      ? `Solving ${renderRhs(spec)} = 0 gives x = ${zeros.map(dec).join(' or x = ')}`
      : `${renderRhs(spec)} never equals zero where the graph is drawn`;
    const described = signs.map((kind) => {
      const intervals = signIntervals(spec, kind === 'positive' ? 1 : -1);
      return intervals.length ? [`${kind} on ${showIntervals(intervals)}`, `${kind} ${showIntervals(intervals)}`] : [`never ${kind}`, `${kind} never`];
    });
    out.push([`${solve}; testing one x-value in each piece between them, the function is ${joinClauses(described.map(([step]) => step))}.`, described.map(([, answer]) => answer).join('; ')]);
  }
  parts.filter((part) => text(part.kind) === 'point').forEach((part) => {
    const feature = text(part.feature) || 'vertex';
    const vertex = [paramH(spec), paramK(spec)];
    if (feature === 'xIntercepts') {
      const zeros = zerosOf(spec);
      const points = zeros.map((zero) => showPoint([zero, 0])).join(' and ');
      out.push([zeros.length ? `x-intercepts: solving ${renderRhs(spec)} = 0 gives ${points}.` : 'x-intercepts: the graph never meets the x-axis.', `x-intercepts ${points || 'never'}`]);
    } else if (feature === 'yIntercept') {
      if (!xIsInFunctionDomain(spec, 0)) {
        out.push(['y-intercept: the graph never reaches x = 0, so it never meets the y-axis.', 'y-intercept never']);
      } else {
        const y = valueAt(spec, 0);
        out.push([`y-intercept: f(0) = ${dec(y)}, the point ${showPoint([0, y])}.`, `y-intercept ${showPoint([0, y])}`]);
      }
    } else if (feature === 'localMinimum' || feature === 'localMaximum') {
      const wantMin = feature === 'localMinimum';
      const turns = turningOf(spec) !== null;
      const has = turns && (paramA(spec) > 0) === wantMin;
      const word = wantMin ? 'local minimum' : 'local maximum';
      // A line, cubic, root, exponential, logarithm or reciprocal never turns
      // around: "its only turning point is a highest point" was false there.
      const none = turns
        ? `There is not a ${word}: the graph's only turning point is a ${wantMin ? 'highest' : 'lowest'} point.`
        : `There is not a ${word}: reading left to right, the graph never turns around.`;
      out.push([has
        ? `The turning point ${showPoint(vertex)} is the ${wantMin ? 'lowest' : 'highest'} point nearby, so it is the ${word}.`
        : none, `${word} ${has ? showPoint(vertex) : 'never'}`]);
    } else if (feature === 'center') {
      // (h, k) is a center only of a cubic, a cube root (its point of symmetry)
      // or a reciprocal (where its asymptotes cross); a log's (h, k) is not
      // even on its graph. Anything else is not explained here.
      out.push(CENTER_TYPES.includes(specType(spec)) ? [`The center is (h, k) = ${showPoint(vertex)}.`, `center ${showPoint(vertex)}`] : null);
    } else {
      out.push(VERTEX_TYPES.includes(specType(spec)) ? [`The vertex is (h, k) = ${showPoint(vertex)}.`, `vertex ${showPoint(vertex)}`] : null);
    }
  });
  return out;
};

const graphSibling = (question, model, guard, seed) => {
  const type = specType(model.spec);
  const salt = `${typeOf(question)}|${text(question.prompt)}|${type}`;
  const decay = baseOf(model.spec) < 1;
  if (!model.parts.length) {
    const candidates = siblingSpecs(type, { restricted: false, decay }).filter((spec) => !sameShape(spec, model.spec));
    return fromCandidates(candidates, seed, salt, (spec) => {
      const xs = [-2, -1, 0, 1, 2].map((offset) => paramH(spec) + offset).filter((x) => Number.isFinite(valueAt(spec, x)));
      if (xs.length < 3) return null;
      const points = xs.map((x) => [x, valueAt(spec, x)]);
      if (points.some(([, y]) => !Number.isInteger(Math.round(y * 1e6) / 1e6))) return null;
      const example = {
        prompt: `Graph ${renderEquation(spec)}.`,
        steps: [
          featureSentence(spec),
          `Choose x-values around the key point and compute each output: ${points.map(([x, y]) => `f(${dec(x)}) = ${dec(y)}`).join(', ')}.`,
          `Plot ${points.map(showPoint).join(', ')} and join them in the shape of a ${FAMILY_SHAPE[type] || 'curve'}, marking how each end continues.`,
        ],
        answer: `The graph through ${points.map(showPoint).join(', ')}`,
      };
      return siblingIsSafe(question, guard, example) ? example : null;
    });
  }
  const needsZeros = model.parts.some((part) => ['positive', 'negative'].includes(part.kind) || part.feature === 'xIntercepts');
  const needsY = model.parts.some((part) => part.feature === 'yIntercept');
  const candidates = siblingSpecs(type, { restricted: true, decay })
    .filter((spec) => !sameShape(spec, model.spec))
    .filter((spec) => (!needsZeros || zerosOf(spec).some((zero) => zero > spec.domain.min && zero < spec.domain.max)))
    .filter((spec) => (!needsY || (xIsInFunctionDomain(spec, 0) && Number.isInteger(Math.round(valueAt(spec, 0) * 1e6) / 1e6))));
  const asked = model.parts.map((part) => (part.kind === 'point' ? FEATURE_WORDS[part.feature] || 'its key point' : ANALYSIS_WORDS[part.kind])).filter(Boolean);
  // Only a part answered with an interval takes the notation note: "State its
  // vertex (intervals in interval notation)" asked for no interval at all.
  const intervalParts = model.parts.filter((part) => ANALYSIS_WORDS[part.kind]);
  const notation = intervalParts.some((part) => part.notation === 'inequality') ? 'inequality' : 'interval';
  return fromCandidates(candidates, seed, salt, (spec) => {
    const worked = workGraph(spec, model.parts);
    if (!worked.length || worked.some((entry) => !entry)) return null;
    const example = {
      prompt: `Use the graph of ${renderEquation(spec)} for ${restrictionText(spec)}. State ${joinWords(unique(asked))}${intervalParts.length && notation === 'interval' ? ' (intervals in interval notation)' : ''}.`,
      steps: [featureSentence(spec), restrictionSentence(spec), ...worked.map(([step]) => step)].filter(Boolean),
      answer: worked.map(([, answer]) => answer).join('; '),
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a composed graph-reading sibling (functionCharacteristics) ---- */

const characteristicsWork = (spec, group, stage) => {
  const zeros = zerosOf(spec);
  const turning = turningOf(spec);
  const type = specType(spec);
  if (group === 'xIntercept') {
    if (!zeros.length) {
      const reason = type === 'exponential'
        ? `it stays on one side of its asymptote y = ${dec(paramK(spec))}`
        : turning !== null ? `its vertex ${showPoint([paramH(spec), paramK(spec)])} is on the far side of the x-axis from where it opens` : 'it never reaches height zero';
      return [`x-intercepts: the graph never meets the x-axis, because ${reason}.`, 'x-intercepts never'];
    }
    const points = zeros.map((zero) => showPoint([zero, 0])).join(' and ');
    return [`x-intercepts: solving ${renderRhs(spec)} = 0 gives x = ${zeros.map(dec).join(' or x = ')}, so the graph meets the x-axis at ${points} and the zeros are {${zeros.map(dec).join(', ')}}.`, `x-intercepts ${points}, zeros {${zeros.map(dec).join(', ')}}`];
  }
  if (group === 'yIntercept') {
    if (!xIsInFunctionDomain(spec, 0)) return ['y-intercept: the graph never reaches x = 0.', 'y-intercept never'];
    const y = valueAt(spec, 0);
    return [`y-intercept: f(0) = ${dec(y)}, so the graph meets the y-axis at ${showPoint([0, y])}.`, `y-intercept ${showPoint([0, y])}`];
  }
  if (group === 'extreme') {
    if (turning === null) return ['Turning point: the graph never turns around, so it has no single highest or lowest point.', 'turning point never'];
    const vertex = showPoint([paramH(spec), paramK(spec)]);
    return [`Turning point: the vertex ${vertex} is the ${paramA(spec) > 0 ? 'lowest' : 'highest'} point of the graph.`, `${paramA(spec) > 0 ? 'lowest' : 'highest'} point ${vertex}`];
  }
  if (group === 'axis') {
    if (turning === null) return null;
    return [`Axis of symmetry: the vertical line through the vertex, x = ${dec(paramH(spec))}.`, `axis x = ${dec(paramH(spec))}`];
  }
  if (group === 'asymptote') {
    if (type !== 'exponential' && type !== 'rational') return null;
    // A reciprocal has no power term: what shrinks toward zero is its fraction.
    const shrinking = type === 'rational'
      ? `as x moves far from ${dec(paramH(spec))}, the fraction ${renderRhs({ ...withoutRestriction(spec), k: 0 })} gets close to zero`
      : 'far to one side the power term gets close to zero';
    return [`Asymptote: ${shrinking}, so the outputs get close to ${dec(paramK(spec))}: the horizontal asymptote is y = ${dec(paramK(spec))}.`, `asymptote y = ${dec(paramK(spec))}`];
  }
  if (group === 'behavior') {
    if (turning !== null) {
      const first = paramA(spec) > 0 ? 'falls' : 'rises';
      const second = paramA(spec) > 0 ? 'rises' : 'falls';
      return [`Behavior: reading left to right, it ${first} until x = ${dec(paramH(spec))}, then ${second}.`, `${first}, then ${second}`];
    }
    if (domainPieces(spec).length > 1) {
      // Two branches: each one falls (or rises), but the graph jumps at the
      // asymptote, so it does not fall "the whole way".
      const each = directionOf(spec, domainPieces(spec)[0]) > 0 ? 'rises' : 'falls';
      return [`Behavior: each branch ${each} from left to right, on both sides of the vertical asymptote x = ${dec(paramH(spec))}; the graph jumps there.`, `each branch ${each}`];
    }
    const goes = directionOf(spec, domainPieces(spec)[0]) > 0 ? 'rises' : 'falls';
    const how = type === 'exponential' ? (goes === 'rises' ? ', more and more steeply' : ', leveling off toward its asymptote') : '';
    return [`Behavior: reading left to right, it ${goes} the whole way${how}.`, `${goes} everywhere`];
  }
  if (group === 'domain' || group === 'range') {
    const parts = group === 'domain' ? domainOf(spec) : rangeOf(spec);
    const notation = text(stage?.notation) || 'inequality';
    const shown = notation === 'interval' ? showIntervals(parts) : showInequality(parts, group === 'domain' ? 'x' : 'y');
    if (group === 'range') return [rangeStep(spec, shown), `range ${shown}`];
    return [`Domain: the graph is drawn from x = ${dec(spec.domain?.min)} to x = ${dec(spec.domain?.max)} with closed dots, so the domain is ${shown}.`, `domain ${shown}`];
  }
  return null;
};

const CHARACTERISTIC_GROUPS = Object.freeze(['xIntercept', 'yIntercept', 'extreme', 'axis', 'asymptote', 'behavior', 'domain', 'range']);

const characteristicsSibling = (question, model, guard, seed) => {
  const groups = model.groups.filter((group) => CHARACTERISTIC_GROUPS.includes(group));
  if (!groups.length || model.groups.some((group) => !CHARACTERISTIC_GROUPS.includes(group))) return null;
  const type = specType(model.spec);
  const restricted = groups.includes('domain') || groups.includes('range');
  // A y-intercept the sibling states must be exact: ∛(-2) + 1 is not
  // "-0.259921", so a candidate whose f(0) is not whole is skipped.
  const candidates = siblingSpecs(type, { restricted, decay: baseOf(model.spec) < 1 })
    .filter((spec) => !sameShape(spec, model.spec))
    .filter((spec) => !groups.includes('yIntercept') || !xIsInFunctionDomain(spec, 0) || Number.isInteger(Math.round(valueAt(spec, 0) * 1e6) / 1e6));
  const salt = `${typeOf(question)}|${text(question.prompt)}|${type}`;
  return fromCandidates(candidates, seed, salt, (spec) => {
    const worked = groups.map((group) => characteristicsWork(spec, group, model.stages.find((stage) => stageGroup(stage) === group)));
    if (worked.some((entry) => !entry)) return null;
    const example = {
      prompt: `The graph of ${renderEquation(spec)}${restricted ? ` for ${restrictionText(spec)}` : ''} is shown. Describe ${joinWords(groups.map((group) => GROUP_WORDS[group]))}.`,
      steps: [featureSentence(spec), ...worked.map(([step]) => step)],
      answer: worked.map(([, answer]) => answer).join('; '),
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a table-then-graph sibling (functionGraph workflow) ---- */

const tableGraphSibling = (question, model, guard, seed) => {
  if (!model.spec || specType(model.spec) !== 'linear') return null;
  const supported = new Set(['table', 'continuity', 'graph', 'domain', 'range']);
  if (!model.groups.includes('table') || model.groups.some((group) => !supported.has(group))) return null;
  const tableStage = model.stages.find((stage) => stageGroup(stage) === 'table');
  const count = Math.max(3, Math.min(6, list(tableStage?.xValues).length || 4));
  const candidates = [];
  for (const m of [2, 3, 4, -2, -3, 5, 6]) for (const b of [5, 7, -4, 9, 6, -5, 8, 11]) for (const start of [4, 5, 6, 8, 10, 12, -6, -9]) candidates.push({ m, b, start });
  const salt = `${typeOf(question)}|${text(question.prompt)}`;
  return fromCandidates(candidates, seed, salt, ({ m, b, start }) => {
    const spec = { type: 'linear', m, b };
    const xs = Array.from({ length: count }, (_, index) => start + index);
    const rows = xs.map((x) => [x, m * x + b]);
    const equation = renderEquation(spec, 'g');
    const steps = [`Substitute each input into ${equation}: ${rows.map(([x, y]) => `g(${dec(x)}) = ${dec(m)}(${dec(x)})${plusConstant(b)} = ${dec(y)}`).join('; ')}.`];
    const answers = [`table ${rows.map(showPoint).join(', ')}`];
    if (model.groups.includes('continuity') || model.groups.includes('graph')) {
      steps.push(`Only the listed inputs are used, so plot ${rows.map(showPoint).join(', ')} as separate points without connecting them.`);
      answers.push('separate points');
    }
    if (model.groups.includes('domain')) {
      steps.push(`The domain is the set of inputs used: {${xs.map(dec).join(', ')}}.`);
      answers.push(`domain {${xs.map(dec).join(', ')}}`);
    }
    if (model.groups.includes('range')) {
      const ys = [...new Set(rows.map(([, y]) => y))].sort((p, q) => p - q);
      steps.push(`The range is the set of outputs, each listed once from least to greatest: {${ys.map(dec).join(', ')}}.`);
      answers.push(`range {${ys.map(dec).join(', ')}}`);
    }
    const stated = ['domain', 'range'].filter((group) => model.groups.includes(group));
    const example = {
      prompt: `Complete the table for ${equation} over x ∈ {${xs.map(dec).join(', ')}}, plot only those points${stated.length ? `, and state the ${stated.join(' and ')}` : ''}.`,
      steps,
      answer: answers.join('; '),
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a modeling sibling (relationshipModel) ---- */

const MODELING_TEMPLATES = Object.freeze([
  {
    connected: false,
    scenario: (rate, max) => `A club sells raffle tickets for $${rate} each and has at most ${max} tickets to sell. Let x be the number of tickets sold and T(x) the money collected in dollars.`,
    name: 'T', variable: 'x', input: 'Tickets sold', output: 'Money collected in dollars', unit: 'ticket',
    whole: 'only a whole number of tickets can be sold',
    start: 'before any ticket is sold, no money has been collected',
  },
  {
    connected: true,
    scenario: (rate, max) => `A hose fills a tub at a steady ${rate} gallons per minute for up to ${max} minutes. Let t be the time in minutes and W(t) the gallons of water in the tub.`,
    name: 'W', variable: 't', input: 'Time in minutes', output: 'Gallons of water in the tub', unit: 'minute',
    whole: 'time can be any value in between, such as one and a half minutes',
    start: 'before the hose has run at all, the tub holds no water',
  },
  {
    connected: false,
    scenario: (rate, max) => `A bakery packs ${rate} muffins in each box and fills at most ${max} boxes. Let x be the number of boxes and M(x) the number of muffins packed.`,
    name: 'M', variable: 'x', input: 'Number of boxes', output: 'Number of muffins packed', unit: 'box',
    whole: 'only a whole number of boxes can be filled',
    start: 'before any box is filled, no muffins are packed',
  },
  {
    connected: true,
    scenario: (rate, max) => `A cyclist rides at a steady ${rate} miles per hour for up to ${max} hours. Let t be the time in hours and D(t) the distance in miles.`,
    name: 'D', variable: 't', input: 'Time in hours', output: 'Distance in miles', unit: 'hour',
    whole: 'time can be any value in between, such as half an hour',
    start: 'before the ride starts, no distance has been covered',
  },
]);

const MODELING_GROUPS = new Set(['quantities', 'equation', 'table', 'continuity', 'graph', 'domain', 'range', 'axes', 'origin']);

const modelingSibling = (question, model, guard, seed) => {
  if (model.groups.some((group) => !MODELING_GROUPS.has(group))) return null;
  const template = MODELING_TEMPLATES[Math.abs(Math.trunc(Number(seed) || 0)) % MODELING_TEMPLATES.length];
  const tableStage = model.stages.find((stage) => stageGroup(stage) === 'table');
  const count = Math.max(3, Math.min(5, list(tableStage?.xValues).length || 4));
  const candidates = [];
  for (const rate of [5, 6, 7, 8, 9, 12, 15]) for (const max of [25, 35, 40, 45, 50, 60]) for (const first of [7, 11, 13, 16, 21]) candidates.push({ rate, max, first });
  const salt = `${typeOf(question)}|${text(question.prompt)}`;
  return fromCandidates(candidates, seed, salt, ({ rate, max, first }) => {
    const { name, variable: v } = template;
    const steps = [];
    const answers = [];
    const groups = model.groups;
    if (groups.includes('quantities')) {
      steps.push(`The input (independent quantity) is ${template.input.toLowerCase()}; the output (dependent quantity) is ${template.output.toLowerCase()}, because it depends on the input.`);
      answers.push(`input ${template.input.toLowerCase()}, output ${template.output.toLowerCase()}`);
    }
    if (groups.includes('equation')) {
      steps.push(`Each ${template.unit} adds ${rate}, starting from zero, so ${name}(${v}) = ${rate}${v}.`);
      answers.push(`${name}(${v}) = ${rate}${v}`);
    }
    // Rows start past the small numbers, and the sets are described in words in
    // the steps: "zero" and "1, 2, 3" are table cells of nearly every model, and
    // a step that printed them would quote this question's own key.
    if (groups.includes('table')) {
      const xs = Array.from({ length: count }, (_, index) => index + first);
      steps.push(`Table: ${xs.map((x) => `${name}(${x}) = ${rate} · ${x} = ${rate * x}`).join('; ')}.`);
      answers.push(`table ${xs.map((x) => `(${x}, ${rate * x})`).join(', ')}`);
    }
    if (groups.includes('continuity') || groups.includes('graph')) {
      steps.push(template.connected
        ? `Because ${template.whole}, the graph is one connected segment.`
        : `Because ${template.whole}, the graph is separate points, not a connected line.`);
      answers.push(template.connected ? 'a connected graph' : 'separate points');
    }
    const top = rate * max;
    const interval = model.notation === 'interval';
    if (groups.includes('domain')) {
      const shown = template.connected ? (interval ? `[0, ${max}]` : `0 ≤ ${v} ≤ ${max}`) : `{0, 1, 2, ..., ${max}}`;
      steps.push(template.connected
        ? `Domain: every ${template.unit === 'minute' ? 'time' : 'value'} from zero up to ${max}, both ends included.`
        : `Domain: the whole numbers from zero up to ${max}.`);
      answers.push(`domain ${shown}`);
    }
    if (groups.includes('range')) {
      const shown = template.connected ? (interval ? `[0, ${top}]` : `0 ≤ ${name}(${v}) ≤ ${top}`) : `{0, ${rate}, ${2 * rate}, ..., ${top}}`;
      steps.push(template.connected
        ? `Range: the output starts at zero and ends at ${name}(${max}) = ${rate} · ${max} = ${top}, with every value in between.`
        : `Range: the multiples of ${rate} from zero up to ${name}(${max}) = ${rate} · ${max} = ${top}.`);
      answers.push(`range ${shown}`);
    }
    if (groups.includes('axes')) {
      steps.push(`Axes: label the horizontal axis “${template.input}” and the vertical axis “${template.output}”, with scale steps that reach ${max} across and ${top} up.`);
      answers.push(`x-axis ${template.input.toLowerCase()}, y-axis ${template.output.toLowerCase()}`);
    }
    if (groups.includes('origin')) {
      steps.push(`Starting point: when the input is zero the output is zero as well: ${template.start}.`);
      answers.push('the start is (0, 0): no input, no output');
    }
    if (!steps.length) return null;
    const example = {
      prompt: `${template.scenario(rate, max)} Build a model for this situation.`,
      steps,
      answer: answers.join('; '),
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a relation sibling (mapping, domain, range, function test) ---- */

const RELATION_SETS = Object.freeze([
  [[-4, 6], [1, 8], [3, 6], [7, -5]],
  [[-6, 9], [-1, 4], [5, 9], [8, -7]],
  [[-5, 7], [2, -6], [6, 7], [9, 4]],
  [[-7, 5], [-3, 8], [4, -9], [6, 8]],
  [[-4, 6], [1, 8], [1, -5], [7, 6]],
  [[-6, 9], [5, 4], [5, -7], [8, 9]],
  [[-5, 7], [2, -6], [9, 7], [9, 4]],
  [[-7, 5], [-3, 8], [-3, -9], [6, 8]],
]);

const relationSibling = (question, model, guard, seed) => {
  const ask = model.ask;
  if (!ask.some((part) => ['mapping', 'domain', 'range', 'isFunction', 'plot'].includes(part))) return null;
  const salt = `${typeOf(question)}|${text(question.prompt)}`;
  return fromCandidates([...RELATION_SETS], seed, salt, (pairs) => {
    const steps = [];
    const answers = [];
    const shown = pairsText(pairs);
    steps.push(`Read each pair as input first, output second: ${pairs.map(([x, y]) => `${dec(x)} → ${dec(y)}`).join(', ')}.`);
    if (ask.includes('mapping')) answers.push(`arrows ${pairs.map(([x, y]) => `${dec(x)} → ${dec(y)}`).join(', ')}`);
    if (ask.includes('plot')) answers.push(`points ${shown}`);
    const xs = uniqueSorted(pairs.map(([x]) => x));
    const ys = uniqueSorted(pairs.map(([, y]) => y));
    if (ask.includes('domain')) {
      steps.push(`Domain: the first numbers, each listed once from least to greatest: {${xs.map(dec).join(', ')}}.`);
      answers.push(`domain {${xs.map(dec).join(', ')}}`);
    }
    if (ask.includes('range')) {
      steps.push(`Range: the second numbers, each listed once from least to greatest: {${ys.map(dec).join(', ')}}.`);
      answers.push(`range {${ys.map(dec).join(', ')}}`);
    }
    if (ask.includes('isFunction')) {
      const passes = relationIsFunction(pairs);
      const repeated = pairs.find(([x], index) => pairs.findIndex(([other]) => other === x) !== index);
      steps.push(passes
        ? 'Function test: every input appears in exactly one pair, so each input has exactly one output; the relation passes the function test (a repeated output is allowed).'
        : `Function test: the input ${dec(repeated[0])} is paired with two different outputs, so the relation fails the function test.`);
      answers.push(passes ? 'passes the function test' : 'fails the function test');
    }
    // The prompt asks for exactly what the answer gives: "{…} and range." (range
    // without domain) and a plot answered under "Build the mapping" did not.
    const shows = [ask.includes('mapping') && 'a mapping diagram', ask.includes('plot') && 'a coordinate plot'].filter(Boolean);
    const states = [ask.includes('domain') && 'domain', ask.includes('range') && 'range'].filter(Boolean);
    const tasks = [
      shows.length ? `represent it with ${joinWords(shows)}` : 'read its pairs',
      states.length && `state its ${joinWords(states)}`,
      ask.includes('isFunction') && 'decide whether every input has exactly one output',
    ].filter(Boolean);
    const example = {
      prompt: `For the relation {${shown}}, ${joinWords(tasks)}.`,
      steps,
      answer: answers.join('; '),
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a legacy table sibling ---- */

const tableSibling = (question, model, guard, seed) => {
  if (!model.rule) return null;
  const candidates = [];
  if (model.rule.type === 'quadratic') {
    for (const a of [3, 5, -3, 7]) for (const b of [5, -5, 9, -7]) for (const c of [7, -9, 11, 13]) for (const start of [5, 7, 11, 15, 21, -9]) candidates.push({ rule: { type: 'quadratic', a, b, c }, start });
  } else {
    for (const m of [4, 5, 6, -4, -5, 7, 9]) for (const b of [9, -7, 11, 13, -8]) for (const start of [5, 7, 11, 15, 21, -9]) candidates.push({ rule: { type: 'linear', m, b }, start });
  }
  const count = Math.max(3, Math.min(5, model.blanks.length));
  const salt = `${typeOf(question)}|${text(question.prompt)}`;
  const sameRule = (rule) => ['type', 'a', 'b', 'c', 'm'].every((key) => rule[key] === model.rule[key]);
  return fromCandidates(candidates, seed, salt, ({ rule, start }) => {
    if (sameRule(rule)) return null;
    const xs = Array.from({ length: count }, (_, index) => index + start);
    const rhs = ruleRhs(rule);
    const rows = xs.map((x) => {
      const shown = rule.type === 'quadratic'
        ? `${dec(rule.a)}(${x})² ${rule.b < 0 ? '-' : '+'} ${dec(Math.abs(rule.b))}(${x})${plusConstant(rule.c)}`
        : `${dec(rule.m)}(${x})${plusConstant(rule.b)}`;
      return { x, y: ruleValue(rule, x), shown };
    });
    const example = {
      prompt: `Complete the table for y = ${rhs} at x = ${xs.join(', ')}.`,
      steps: rows.map(({ x, y, shown }) => `x = ${x}: y = ${shown} = ${dec(y)}.`),
      answer: `y-values ${rows.map(({ y }) => dec(y)).join(', ')}`,
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a sequence sibling ---- */

const listTerms = (spec, count) => Array.from({ length: count }, (_, index) => sequenceTerm(spec, index + 1));
/** A factor as written in a product: a negative one in parentheses. */
const signed = (value) => (Number(value) < 0 ? `(${dec(value)})` : dec(value));

const sequenceSibling = (question, model, guard, seed) => {
  const salt = `${typeOf(question)}|${text(question.prompt)}|${model.mode}`;
  if (model.mode === 'compare') {
    const candidates = [];
    for (const first of [6, 9, 11]) for (const difference of [5, 7]) for (const firstB of [3, 5]) for (const n of [5, 6]) candidates.push({ first, difference, firstB, n });
    return fromCandidates(candidates, seed, salt, ({ first, difference, firstB, n }) => {
      const left = { kind: 'arithmetic', first, difference };
      const right = { kind: 'geometric', first: firstB, ratio: 2 };
      const result = compareSequencesAt(left, right, n);
      const bigger = result.relation === 'left' ? 'the first' : result.relation === 'right' ? 'the second' : 'neither';
      const example = {
        prompt: `Sequence P starts at ${first} and adds ${difference} each time; sequence Q starts at ${firstB} and doubles each time. Which has the larger ${ordinal(n)} term, and by how much?`,
        steps: [
          `P: ${listTerms(left, n).map(dec).join(', ')}, so its ${ordinal(n)} term is ${dec(result.left)}.`,
          `Q: ${listTerms(right, n).map(dec).join(', ')}, so its ${ordinal(n)} term is ${dec(result.right)}.`,
          `${bigger === 'neither' ? 'They are equal' : `${capitalize(bigger)} sequence is larger`}; the difference is ${dec(Math.max(result.left, result.right))} - ${dec(Math.min(result.left, result.right))} = ${dec(result.difference)}.`,
        ],
        answer: `${result.relation === 'left' ? 'P' : result.relation === 'right' ? 'Q' : 'equal'}, by ${dec(result.difference)}`,
      };
      return siblingIsSafe(question, guard, example) ? example : null;
    });
  }
  const sameKind = model.spec.kind;
  const kind = ['analyze', 'missingTerm'].includes(model.mode)
    ? (Math.abs(Math.trunc(Number(seed) || 0)) % 2 ? 'geometric' : 'arithmetic')
    : sameKind;
  const candidates = [];
  if (kind === 'arithmetic') {
    for (const first of [5, 6, 9, 11, -7]) for (const difference of [4, 6, 7, -5]) for (const n of [9, 10, 12]) candidates.push({ kind, first, difference, n });
  } else {
    for (const first of [5, 6, 7]) for (const ratio of [3, -2, 4]) for (const n of [5, 6]) candidates.push({ kind, first, ratio, n });
  }
  return fromCandidates(candidates, seed, salt, (candidate) => {
    const spec = normalizeSequenceSpec(candidate, candidate.kind);
    const change = sequenceChange(spec);
    const terms = listTerms(spec, 4);
    const arithmetic = spec.kind === 'arithmetic';
    const n = candidate.n;
    const stepWord = arithmetic ? `a common difference of ${dec(change)}` : `a common ratio of ${dec(change)}`;
    const differences = terms.slice(1).map((value, index) => value - terms[index]);
    const ratios = terms.slice(1).map((value, index) => value / terms[index]);
    const test = arithmetic
      ? `Differences: ${differences.map(dec).join(', ')} are all equal, while the ratios are not, so the terms have ${stepWord}.`
      : `Ratios: ${ratios.map(dec).join(', ')} are all equal, while the differences are not, so the terms have ${stepWord}.`;
    const steps = [`The terms are ${terms.map(dec).join(', ')}, …`, test];
    let prompt = '';
    let answer = '';
    if (model.mode === 'analyze') {
      const value = sequenceTerm(spec, n);
      steps.push(arithmetic
        ? `From the first term to the ${ordinal(n)} there are ${n - 1} steps of ${dec(change)}: ${dec(spec.first)} + ${n - 1} · ${signed(change)} = ${dec(value)}.`
        : `From the first term to the ${ordinal(n)} there are ${n - 1} steps of × ${signed(change)}: ${dec(spec.first)} · ${signed(change)}^${n - 1} = ${dec(value)}.`);
      prompt = `A sequence begins ${terms.map(dec).join(', ')}, … Describe how the terms change and find the ${ordinal(n)} term.`;
      answer = `${stepWord}; ${ordinal(n)} term ${dec(value)}`;
    } else if (model.mode === 'missingTerm') {
      const gap = 3;
      const shown = listTerms(spec, 5).map((value, index) => (index === gap - 1 ? '__' : dec(value)));
      const value = sequenceTerm(spec, gap);
      const visible = listTerms(spec, 5);
      steps[0] = `The terms shown are ${shown.join(', ')}.`;
      // The step is read from neighbours the student can SEE: the differences
      // or ratios through the blank need the very term being asked for.
      steps[1] = arithmetic
        ? `Neighbours you can see: ${dec(visible[1])} - ${signed(visible[0])} = ${dec(change)} and ${dec(visible[4])} - ${signed(visible[3])} = ${dec(change)}, the same difference (their ratios differ), so the terms have ${stepWord}.`
        : `Neighbours you can see: ${dec(visible[1])} ÷ ${signed(visible[0])} = ${dec(change)} and ${dec(visible[4])} ÷ ${signed(visible[3])} = ${dec(change)}, the same ratio (their differences differ), so the terms have ${stepWord}.`;
      steps.push(arithmetic
        ? `The missing ${ordinal(gap)} term is the second term plus the step: ${dec(terms[1])} + ${signed(change)} = ${dec(value)}.`
        : `The missing ${ordinal(gap)} term is the second term times the ratio: ${dec(terms[1])} · ${signed(change)} = ${dec(value)}.`);
      prompt = `Find the missing term: ${shown.join(', ')}.`;
      answer = `${ordinal(gap)} term ${dec(value)} (${stepWord})`;
    } else if (model.mode === 'partialSum') {
      const count = Math.min(n, 6);
      const all = listTerms(spec, count);
      const sum = sequencePartialSum(spec, count);
      steps.push(`The first ${count} terms are ${all.map(dec).join(', ')}; the ${ordinal(count)} term is ${dec(all[count - 1])}.`);
      steps.push(`Adding them: ${all.map((value, index) => (index ? signed(value) : dec(value))).join(' + ')} = ${dec(sum)}.`);
      prompt = `For the sequence ${terms.map(dec).join(', ')}, …, find the ${ordinal(count)} term and the sum of the first ${count} terms.`;
      answer = `${ordinal(count)} term ${dec(all[count - 1])}; sum ${dec(sum)}`;
    } else {
      const explicit = arithmetic ? `aₙ = ${dec(spec.first)} + (n - 1)·${signed(change)}` : `aₙ = ${dec(spec.first)} · ${signed(change)}^(n - 1)`;
      const recursive = arithmetic ? `aₙ = aₙ₋₁ ${change < 0 ? '-' : '+'} ${dec(Math.abs(change))}` : `aₙ = ${signed(change)} · aₙ₋₁`;
      steps.push(`Explicit rule: start at the first term and apply the step once for each position after the first: ${explicit}.`);
      steps.push(`Recursive rule: the first term is ${dec(spec.first)}, and each term comes from the one before: ${recursive}.`);
      prompt = `Write an explicit rule and a recursive rule for the sequence ${terms.map(dec).join(', ')}, …`;
      answer = `${explicit}; first term ${dec(spec.first)}, ${recursive}`;
    }
    const example = { prompt, steps, answer };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a functionInvestigation2 sibling ---- */

const investigationRhs = (spec) => {
  if (spec.type === 'linear') return renderRhs({ type: 'linear', m: spec.a, b: spec.k - spec.a * spec.h });
  return renderRhs({ ...spec });
};

const investigationSibling = (question, model, guard, seed) => {
  const salt = `${typeOf(question)}|${text(question.prompt)}|${model.mode}`;
  if (model.mode === 'compare') {
    const candidates = [];
    for (const m of [2, 3]) for (const b of [4, 5, -3]) for (const x of [3, 4, -3]) candidates.push({ m, b, x });
    return fromCandidates(candidates, seed, salt, ({ m, b, x }) => {
      const left = { type: 'linear', a: m, h: 0, k: b };
      const right = { type: 'quadratic', a: 1, h: 0, k: 0 };
      const result = compareFunctionValues(left, right, x);
      if (result.relation === 'undefined') return null;
      const example = {
        prompt: `Compare f(x) = ${investigationRhs(normalizeInvestigationSpec(left))} and g(x) = x² at x = ${dec(x)}: which function has the greater value?`,
        steps: [
          `f(${dec(x)}) = ${dec(m)}(${dec(x)})${plusConstant(b)} = ${dec(result.leftValue)}.`,
          `g(${dec(x)}) = (${dec(x)})² = ${dec(result.rightValue)}.`,
          result.relation === 'equal' ? 'The two outputs are equal.' : `${result.relation === 'left' ? 'f' : 'g'} gives the larger output at this input.`,
        ],
        answer: result.relation === 'equal' ? 'They are equal' : `${result.relation === 'left' ? 'f' : 'g'} is greater (${dec(result.leftValue)} vs ${dec(result.rightValue)})`,
      };
      return siblingIsSafe(question, guard, example) ? example : null;
    });
  }
  const type = model.spec.type;
  const candidates = [];
  for (const a of [2, -2, 1, -1, 3]) for (const h of [-3, -2, 2, 3, 4]) for (const k of [-4, -3, 3, 5, 6]) candidates.push(normalizeInvestigationSpec({ type, a, h, k, base: model.spec.base }));
  return fromCandidates(candidates, seed, salt, (spec) => {
    if (sameShape(spec, model.spec)) return null;
    const equation = `f(x) = ${investigationRhs(spec)}`;
    const label = FUNCTION_FAMILY_LABELS[type] || 'function';
    let steps = [];
    let answer = '';
    if (model.mode === 'features') {
      const features = investigationFeatures(spec);
      steps = [`${equation} is ${withArticle(label.toLowerCase())} function: its defining feature is its ${features.anchor.label}.`, `With a = ${dec(spec.a)}, h = ${dec(spec.h)} and k = ${dec(spec.k)}, the ${features.anchor.label} is ${showPoint(features.anchor.point)}.`];
      const extra = [];
      features.verticalAsymptotes.forEach((x) => { steps.push(`The vertical asymptote is x = ${dec(x)}.`); extra.push(`x = ${dec(x)}`); });
      features.horizontalAsymptotes.forEach((y) => { steps.push(`The horizontal asymptote is y = ${dec(y)}.`); extra.push(`y = ${dec(y)}`); });
      answer = `${features.anchor.label} ${showPoint(features.anchor.point)}${extra.length ? `; ${extra.join(', ')}` : ''}`;
    } else if (model.mode === 'domainRange') {
      const key = domainRangeForSpec(spec);
      steps = [
        `${equation} is ${withArticle(label.toLowerCase())} function with h = ${dec(spec.h)} and k = ${dec(spec.k)}.`,
        `Domain: the x-values it accepts are ${relationLabel(key.domainCode, spec)}.`,
        `Range: the y-values it produces are ${relationLabel(key.rangeCode, spec)}.`,
      ];
      answer = `domain ${relationLabel(key.domainCode, spec)}; range ${relationLabel(key.rangeCode, spec)}`;
    } else if (model.mode === 'intercepts') {
      const key = interceptsForSpec(spec);
      if (!key.x.length || key.y === null || key.x.some((x) => !Number.isInteger(x)) || !Number.isInteger(key.y)) return null;
      steps = [
        `x-intercepts: set ${investigationRhs(spec)} = 0 and solve: x = ${key.x.map(dec).join(' or x = ')}.`,
        `y-intercept: f(0) = ${dec(key.y)}.`,
      ];
      answer = `x-intercepts ${key.x.map(dec).join(', ')}; y-intercept ${dec(key.y)}`;
    } else {
      const code = behaviorForSpec(spec);
      const turning = code === 'minimum' || code === 'maximum';
      steps = [
        `${equation} is ${withArticle(label.toLowerCase())} function with a = ${dec(spec.a)}${['exponential', 'logarithmic'].includes(type) ? ` and base ${dec(spec.base)}` : ''}.`,
        turning
          ? `Since a is ${spec.a > 0 ? 'positive' : 'negative'}, the graph turns at (${dec(spec.h)}, ${dec(spec.k)}), which is its ${code === 'minimum' ? 'lowest' : 'highest'} point.`
          : code.endsWith('Branches')
            ? `Each branch ${code.startsWith('increasing') ? 'rises' : 'falls'} from left to right, on both sides of the vertical asymptote x = ${dec(spec.h)}.`
            : `Reading left to right, the graph ${code === 'increasing' ? 'rises' : 'falls'} the whole way.`,
      ];
      answer = turning ? `${code === 'minimum' ? 'lowest' : 'highest'} point at (${dec(spec.h)}, ${dec(spec.k)})` : code.endsWith('Branches') ? `each branch ${code.startsWith('increasing') ? 'rises' : 'falls'}` : `${code === 'increasing' ? 'rises' : 'falls'} everywhere`;
    }
    const example = { prompt: `Investigate ${equation}: find ${{ features: 'its defining feature', domainRange: 'its domain and range', intercepts: 'its intercepts', behavior: 'how it behaves from left to right' }[model.mode]}.`, steps, answer };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

/* ---- a multiAnswer attributes sibling ---- */

const FAMILY_NAMES = Object.freeze({
  linear: 'linear', quadratic: 'quadratic', absolute: 'absolute value', squareRoot: 'square root', cubic: 'cubic',
  cubeRoot: 'cube root', exponential: 'exponential', logarithmic: 'logarithmic', rational: 'reciprocal',
});
const FIELD_ID_FAMILY = Object.freeze({ reciprocal: 'rational', rational: 'rational', exponential: 'exponential', exp: 'exponential', logarithmic: 'logarithmic', log: 'logarithmic' });
const SIBLING_FAMILIES = Object.freeze(['squareRoot', 'rational', 'logarithmic', 'absolute', 'quadratic', 'exponential', 'cubeRoot', 'cubic']);

const attributeSpecs = (type) => {
  const out = [];
  for (const h of [-3, -2, 2, 3, 4]) {
    for (const k of [-4, -1, 2, 5]) {
      if (type === 'exponential') out.push({ type, a: 1, h: 0, k, base: 2 });
      else if (type === 'linear') out.push({ type, m: h > 0 ? h : -h + 1, b: k, domain: { min: -h - 1, max: h + 6, minClosed: true, maxClosed: true } });
      else if (['cubic', 'cubeRoot'].includes(type)) out.push({ type, a: 1, h, k, domain: { min: h - 1, max: h + 1, minClosed: true, maxClosed: true } });
      else out.push({ type, a: 1, h, k, ...(type === 'logarithmic' ? { base: 2 } : {}) });
    }
  }
  return out;
};

const attributeStep = (spec, kind) => {
  const type = specType(spec);
  if (kind === 'family') return [`The x is ${{ squareRoot: 'under a square root', cubeRoot: 'under a cube root', rational: 'in the denominator', logarithmic: 'inside a logarithm', exponential: 'in the exponent', absolute: 'inside absolute value bars', quadratic: 'squared', cubic: 'cubed', linear: 'only multiplied and added to' }[type]}, so this is the ${FAMILY_NAMES[type]} family.`, `family ${FAMILY_NAMES[type]}`];
  if (kind === 'domain' || kind === 'attribute') {
    const shown = showIntervals(domainOf(spec));
    const reason = isRestricted(spec) ? `it is used only for ${restrictionText(spec)}` : { squareRoot: 'the expression under the root must be at least zero', rational: 'the denominator cannot be zero', logarithmic: 'the input of the logarithm must be positive' }[type] || 'every input can be substituted';
    return [`Domain: ${reason}, so the domain is ${shown}.`, `domain ${shown}`];
  }
  if (kind === 'range') {
    const shown = showIntervals(rangeOf(spec));
    return [`Range: the outputs it actually produces are ${shown}.`, `range ${shown}`];
  }
  if (kind === 'asymptote') {
    const lines = [];
    if (type === 'rational' || type === 'logarithmic') lines.push(`vertical x = ${dec(paramH(spec))}`);
    if (type === 'rational' || type === 'exponential') lines.push(`horizontal y = ${dec(paramK(spec))}`);
    if (!lines.length) return null;
    return [`Asymptotes: ${lines.join(' and ')}.`, `asymptotes ${lines.join(', ')}`];
  }
  if (kind === 'intercept') {
    if (!xIsInFunctionDomain(spec, 0)) return null;
    const y = valueAt(spec, 0);
    return [`y-intercept: the output at x = 0 is ${dec(y)}, the point ${showPoint([0, y])}.`, `y-intercept ${showPoint([0, y])}`];
  }
  if (kind === 'continuity') {
    // A reciprocal's two branches are not one connected piece.
    if (domainOf(spec).length > 1) return null;
    return ['Every input in the interval makes sense, so the graph is one connected piece.', 'connected'];
  }
  return null;
};

const attributesSibling = (question, model, guard, seed) => {
  const kinds = unique(model.fields.map((entry) => entry.kind));
  const salt0 = `${typeOf(question)}|${text(question.prompt)}`;
  // Several parent functions, one asymptote question each: shift every one of them.
  const families = model.fields.map(({ field, fn }) => fn?.type || FIELD_ID_FAMILY[text(field.id).toLowerCase()] || '');
  if (kinds.length === 1 && kinds[0] === 'asymptote' && model.fields.length > 1 && families.every((type) => ['rational', 'exponential', 'logarithmic'].includes(type))) {
    const names = ['g', 'h', 'p', 'q'];
    return fromCandidates(range(0, 19), seed, salt0, (index) => {
      const specs = families.map((type, position) => {
        const options = attributeSpecs(type);
        return options[(index + position * 7) % options.length];
      });
      const worked = specs.map((spec) => attributeStep(spec, 'asymptote'));
      if (worked.some((entry) => !entry)) return null;
      const example = {
        prompt: `Identify the asymptotes of ${joinWords(specs.map((spec, position) => renderEquation(spec, names[position])))}.`,
        steps: worked.map(([step], position) => `${names[position]}: ${lowerFirst(step)}`),
        answer: worked.map(([, answer], position) => `${names[position]}: ${answer}`).join('; '),
      };
      return siblingIsSafe(question, guard, example) ? example : null;
    });
  }
  const fn = model.fn || model.fields.find((entry) => entry.fn)?.fn;
  if (!fn) return null;
  const salt = `${typeOf(question)}|${text(question.prompt)}`;
  let types = [fn.type];
  if (kinds.includes('family')) {
    const start = (hash(salt) + Math.abs(Math.trunc(Number(seed) || 0))) % SIBLING_FAMILIES.length;
    types = SIBLING_FAMILIES.map((_, index) => SIBLING_FAMILIES[(start + index) % SIBLING_FAMILIES.length]);
  } else if (kinds.includes('asymptote') && !['rational', 'exponential', 'logarithmic'].includes(fn.type)) {
    types = ['rational'];
  }
  if (fn.type === 'linear' && kinds.includes('continuity')) {
    // A context with a restricted, real-valued input: a new context, new numbers.
    const candidates = [];
    for (const rate of [2, 6, 7]) for (const start of [4, 9, 12]) for (const max of [15, 25, 30]) candidates.push({ rate, start, max });
    return fromCandidates(candidates, seed, salt, ({ rate, start, max }) => {
      const steps = [];
      const answers = [];
      kinds.forEach((kind) => {
        if (kind === 'continuity') { steps.push(`Riding time can be any value from 0 to ${max} minutes, such as two and a half minutes, so the graph is one connected segment.`); answers.push('connected'); }
        if (kind === 'domain') { steps.push(`Domain: t runs from 0 to ${max}, both ends allowed: [0, ${max}].`); answers.push(`domain [0, ${max}]`); }
        if (kind === 'range') { steps.push(`Range: C(0) = ${start} and C(${max}) = ${rate}(${max}) + ${start} = ${rate * max + start}, so the range is [${start}, ${rate * max + start}].`); answers.push(`range [${start}, ${rate * max + start}]`); }
      });
      if (!steps.length) return null;
      const example = {
        prompt: `A scooter rental costs C(t) = ${rate}t + ${start} dollars for any real riding time t from 0 to ${max} minutes. Describe the graph, its domain and its range.`,
        steps,
        answer: answers.join('; '),
      };
      return siblingIsSafe(question, guard, example) ? example : null;
    });
  }
  const candidates = types.flatMap((type) => attributeSpecs(type));
  return fromCandidates(candidates, seed, salt, (spec) => {
    const worked = kinds.map((kind) => attributeStep(spec, kind));
    if (worked.some((entry) => !entry)) return null;
    const equation = renderEquation(spec, 'g');
    const restriction = isRestricted(spec) ? ` for ${restrictionText(spec)}` : '';
    const example = {
      prompt: `For ${equation}${restriction}, identify ${joinWords(kinds.map((kind) => ({ family: 'its parent family', domain: 'its domain', range: 'its range', asymptote: 'its asymptotes', intercept: 'its y-intercept', attribute: 'its domain', continuity: 'whether its graph is connected' }[kind])))}.`,
      steps: worked.map(([step]) => step),
      answer: worked.map(([, answer]) => answer).join('; '),
    };
    return siblingIsSafe(question, guard, example) ? example : null;
  });
};

export const similarProblem = (question, { seed = 0 } = {}) => {
  try {
    const model = modelFor(question);
    if (!model) return null;
    const guard = guardFor(question);
    if (model.kind === 'graph') return graphSibling(question, model, guard, seed);
    if (model.kind === 'composed') {
      if (model.recipe === 'functionModeling') return modelingSibling(question, model, guard, seed);
      if (model.recipe === 'relationRepresentations') {
        const pairs = relationPairsOf(question.pairs);
        const ask = model.groups.flatMap((group) => ({ mapping: ['mapping'], domain: ['domain'], range: ['range'], isFunction: ['isFunction'], graph: ['plot'] }[group] || []));
        return pairs.length ? relationSibling(question, { kind: 'relation', pairs, ask, fields: [] }, guard, seed) : null;
      }
      if (model.groups.includes('table')) return tableGraphSibling(question, model, guard, seed);
      if (model.spec) return characteristicsSibling(question, model, guard, seed);
      return null;
    }
    if (model.kind === 'relation') return relationSibling(question, model, guard, seed);
    if (model.kind === 'table') return tableSibling(question, model, guard, seed);
    if (model.kind === 'sequence') return sequenceSibling(question, model, guard, seed);
    if (model.kind === 'investigation') return investigationSibling(question, model, guard, seed);
    if (model.kind === 'attributes') return attributesSibling(question, model, guard, seed);
    return null;
  } catch {
    return null;
  }
};
