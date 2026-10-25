/*
 * THE TEST-PREP DISPLAY AUDIT (CT12; the classes of CT14 and A2-109).
 *
 * The Digital SAT, ACT and TSIA2 banks are the automated half of the final
 * qualitative parity review. O2 (#492) fixed the display faults it found in 74
 * templates and listed what it left: an exponent of 1 (x^{ 1 }), a denominator of
 * 1 (\frac{\sqrt{11}}{1}), a gradient written "-7/1", and a fixed factor that
 * collapses to "(x)" when its shift is 0. This reads every string a student can
 * see in every draw of every template, in the same segments the renderer uses,
 * and counts those classes and the O2 classes in the surfaces O2's own test does
 * not cover (keys, worked solutions, hints).
 *
 * It only reports. Whether a form is acceptable ("(x)" reads correctly) is the
 * owner's, and "unsimplified" is a matter of judgement that two classes below
 * mark as needing a person.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FRAMEWORKS = Object.freeze(['digitalSAT', 'act', 'tsia2']);
export const SURFACES = Object.freeze(['prompt', 'choice', 'key', 'review', 'hint']);

/* ------------------------------------------------------------------ reading text */

/** The mathematics inside one renderer math segment, without its delimiters. */
const innerMath = (segment) => {
  const match = /^(\$\$|\$|\\\(|\\\[)([\s\S]*?)(\$\$|\$|\\\)|\\\])$/.exec(segment);
  return match ? match[2] : segment;
};

/** Every piece of a student-visible string: { math: boolean, text } (math without its delimiters). */
export const piecesOf = (value) => splitMathSegments(String(value ?? '')).map((segment) => (
  isMathSegment(segment) ? { math: true, text: innerMath(segment) } : { math: false, text: segment }
));

const readGroup = (text, start) => {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return [text.slice(start + 1, index), index + 1];
    }
  }
  return null;
};

/** Every \frac{…}{…} in a piece of LaTeX, with balanced braces: { numerator, denominator, source }. */
export const fractionsIn = (text) => {
  const found = [];
  for (const match of String(text).matchAll(/\\[dt]?frac\s*(?=\{)/g)) {
    const first = readGroup(text, match.index + match[0].length);
    if (!first) continue;
    let at = first[1];
    while (text[at] === ' ') at += 1;
    if (text[at] !== '{') continue;
    const second = readGroup(text, at);
    if (!second) continue;
    found.push({ numerator: first[0].trim(), denominator: second[0].trim(), source: text.slice(match.index, second[1]) });
  }
  return found;
};

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const INTEGER = /^[-−]?\d+$/;
const integerOf = (value) => Number(String(value).replace('−', '-'));
const squareFactor = (n) => [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144].some((square) => n % square === 0);

const all = (pattern, text) => [...String(text).matchAll(pattern)].map((match) => match[0].trim());

/** A bracket group whose content has a sign after its first character: "x + 3", "x - 4". */
const signed = (content) => /[+-]/.test(String(content).trim().slice(1));

/*
 * A bracket that holds only a variable, which is what a shifted factor
 * "(x {{shift|term}})" becomes when its shift is 0. A bare "(x)" is also the
 * ordinary way to write a function applied ("f(x)", "f^{-1}(y)") and a product of
 * single terms ("(3x)(x) = 3x^2"), so a hit needs a sign that it collapsed:
 * a space left where the term was ("(x )"), a power ("(x)^2"), a neighbouring
 * bracket with a sign ("(x)(x+3)"), a number in front ("2(x)"), or the whole
 * right side ("y+3=(x)").
 */
export const findCollapsedFactors = (text) => {
  const t = String(text).replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
  const hits = [];
  for (const match of t.matchAll(/\(\s*[A-Za-z]\s*\)/g)) {
    const before = t.slice(0, match.index);
    const after = t.slice(match.index + match[0].length);
    if (/[A-Za-z]\s*$/.test(before) || /\^\s*\{\s*-1\s*\}$/.test(before) || /['_^]$/.test(before)) continue;
    const before_ = /\(([^()]*)\)\s*$/.exec(before);
    const after_ = /^\s*\(([^()]*)\)/.exec(after);
    const collapsed = /\s\)$/.test(match[0])
      || /^\s*\^/.test(after)
      || (before_ && signed(before_[1]))
      || (after_ && signed(after_[1]))
      || /\d\s*$/.test(before)
      || (/=\s*$/.test(before) && /^\s*$/.test(after));
    if (collapsed) hits.push(match[0]);
  }
  return hits;
};

/* -------------------------------------------------------------------- the classes */

/*
 * Each class: where it looks ('math' = inside $…$ only, 'any' = math and prose),
 * and `find(text)` → the snippets that show it in one piece. `certain: false`
 * marks a form that may be on purpose ("simplify 6/8").
 */
export const DISPLAY_CLASSES = Object.freeze([
  {
    id: 'exponentOne',
    label: 'an exponent of 1 ("x^{ 1 }")',
    source: 'CT14 G-16, A1-64, A2-109',
    certain: true,
    scope: 'any',
    find: (text) => all(/\^\s*(?:\{\s*1\s*\}|1(?![\d./]))/g, text),
  },
  {
    id: 'denominatorOne',
    label: 'a denominator of 1 ("\\frac{\\sqrt{11}}{1}", "-7/1")',
    source: 'CT14 G-16, A1-64, A2-109',
    certain: true,
    scope: 'any',
    find: (text) => [
      ...fractionsIn(text).filter((fraction) => fraction.denominator === '1').map((fraction) => fraction.source),
      // A gradient or a ratio written over 1 in running text or math: -7/1, 3/1, x/1.
      ...all(/(?<![\w.\\/])[-−]?(?:\d+(?:\.\d+)?|[a-z])\s*\/\s*1(?![\d.\w])/g, text),
    ],
  },
  {
    id: 'collapsedFactor',
    label: 'a lone variable in brackets, a factor that collapsed ("(x )^2", "(x)(x+3)", "2(x)")',
    source: 'CT14 G-16, A1-64, A2-109',
    certain: true,
    scope: 'math',
    find: findCollapsedFactors,
  },
  // The O2 classes, which O2's own test holds to zero in prompts and choices; here in every other surface too.
  {
    id: 'coefficientOne',
    label: 'a coefficient of 1 ("1x", "1(x-4)^2", "1\\sqrt{8}")',
    source: 'O2',
    certain: true,
    scope: 'math',
    find: (text) => all(/(?:^|[^\d.\\a-zA-Z_{])1\s*(?:[a-z](?![a-z])|\\(?:sqrt|pi)(?![a-zA-Z])|\((?=\s*[a-z]))/g, text),
  },
  {
    id: 'zeroTerm',
    label: 'a zero added to a variable term ("x + 0")',
    source: 'O2, CT03',
    certain: true,
    scope: 'math',
    find: (text) => all(/[a-zA-Z]\s*[+-]\s*0(?![\d.])/g, text),
  },
  {
    id: 'doubledSign',
    label: 'a doubled sign ("+ -3")',
    source: 'O2',
    certain: true,
    scope: 'math',
    find: (text) => all(/[+-]\s*[+-]\s*\d/g, text),
  },
  {
    id: 'floatArtefact',
    label: 'a floating-point artefact ("102.40000000000002")',
    source: 'O2',
    certain: true,
    scope: 'any',
    find: (text) => all(/\d+\.\d*?(\d)\1{5,}\d*/g, text),
  },
  {
    id: 'dollarsAfterDollar',
    label: 'a dollar sign and the word "dollars" ("$3 dollars")',
    source: 'O2',
    certain: true,
    scope: 'prose',
    find: (text) => all(/\$\s*\d[\d.,]*\s+dollars/g, text),
  },
  {
    id: 'pluralOne',
    label: 'a plural unit after 1 ("1 millimeters")',
    source: 'CT03 D-78',
    certain: true,
    scope: 'prose',
    find: (text) => all(/(?<![\d./])\b1\s+(?:millimeters|centimeters|meters|kilometers|inches|feet|yards|miles|dollars|cents|hours|minutes|seconds|days|weeks|months|years|units|items|students|people|points|degrees|pounds|ounces|grams|kilograms|liters|gallons)\b/gi, text),
  },
  // Judgement calls: shown, not counted as defects.
  {
    id: 'reducibleFraction',
    label: 'a fraction that reduces ("\\frac{6}{4}", "6/4"); may be on purpose',
    source: 'CT14 "unsimplified forms"',
    certain: false,
    scope: 'math',
    find: (text) => [
      ...fractionsIn(text)
        .filter((fraction) => INTEGER.test(fraction.numerator) && INTEGER.test(fraction.denominator) && Number(fraction.denominator) !== 1
          && gcd(integerOf(fraction.numerator), integerOf(fraction.denominator)) > 1)
        .map((fraction) => fraction.source),
      ...[...String(text).matchAll(/(?<![\w.\\/])([-−]?\d+)\s*\/\s*(\d+)(?![\d.\w])/g)]
        .filter((match) => integerOf(match[2]) > 1 && gcd(integerOf(match[1]), integerOf(match[2])) > 1)
        .map((match) => match[0]),
    ],
  },
  {
    id: 'unsimplifiedRadical',
    label: 'a radical with a square factor ("\\sqrt{8}", "\\sqrt{16}"); may be on purpose',
    source: 'CT14 "unsimplified forms"',
    certain: false,
    scope: 'math',
    find: (text) => [...String(text).matchAll(/\\sqrt\s*\{\s*(\d+)\s*\}/g)].filter((match) => squareFactor(Number(match[1]))).map((match) => match[0]),
  },
]);

/** The snippets of every class in one student-visible string: { classId: [snippet, …] }. */
export const findDisplayProblems = (value) => {
  const out = {};
  const pieces = piecesOf(value);
  for (const displayClass of DISPLAY_CLASSES) {
    const hits = pieces.flatMap((piece) => {
      if (displayClass.scope === 'math' && !piece.math) return [];
      if (displayClass.scope === 'prose' && piece.math) return [];
      return displayClass.find(piece.text);
    });
    if (hits.length) out[displayClass.id] = hits;
  }
  return out;
};

/* ------------------------------------------------------------------- the surfaces */

const list = (value) => (Array.isArray(value) ? value : []);

/** Every string a student can read in one drawn question: [[surface, text], …]. */
export const surfacesOf = (question) => {
  const review = question.solutionReview && typeof question.solutionReview === 'object' ? question.solutionReview : {};
  return [
    ['prompt', question.prompt],
    ...list(question.choices).map((choice) => ['choice', choice?.label]),
    // The key of a typed field is shown as the answer; a choice field's key is a choice id, whose text is the choice.
    ...list(question.responseFields).filter((field) => field?.inputProfile !== 'choice').map((field) => ['key', field?.expected]),
    ...[review.headline, ...list(review.reasoning), review.commonError, review.connection, review.answerSummary].map((text) => ['review', text]),
    ...list(question.supportHints).map((text) => ['hint', text]),
    ...list(question.attemptFeedback).map((text) => ['hint', text]),
  ].filter(([, text]) => typeof text === 'string' && text.trim());
};

/* ---------------------------------------------------------------------- the scan */

export const loadBank = (root = REPO) => Object.fromEntries(FRAMEWORKS.map((framework) => [
  framework,
  JSON.parse(readFileSync(path.join(root, `functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`), 'utf8')).documents,
]));

/**
 * Draws every template `draws` times and records, per class, which templates show
 * it, in which surface, on how many draws, with an example.
 */
export const scanBank = ({ draws = 60, bank = loadBank(), seedPrefix = 'ct12' } = {}) => {
  const classes = Object.fromEntries(DISPLAY_CLASSES.map((displayClass) => [displayClass.id, { ...displayClass, find: undefined, templates: new Map() }]));
  let templates = 0;
  let drawn = 0;
  for (const framework of FRAMEWORKS) {
    for (const doc of bank[framework]) {
      if (doc.active === false) continue;
      templates += 1;
      for (let draw = 0; draw < draws; draw += 1) {
        const { question } = generatePathInstance(doc, `${seedPrefix}|${doc.id}|${draw}`);
        if (!question) continue;
        drawn += 1;
        const seen = new Set();
        for (const [surface, text] of surfacesOf(question)) {
          const problems = findDisplayProblems(text);
          for (const [classId, snippets] of Object.entries(problems)) {
            const entry = classes[classId].templates.get(doc.id) || { id: doc.id, framework, draws: 0, surfaces: {}, example: null };
            classes[classId].templates.set(doc.id, entry);
            if (!seen.has(`${classId}|${surface}`)) {
              seen.add(`${classId}|${surface}`);
              entry.surfaces[surface] = (entry.surfaces[surface] || 0) + 1;
            }
            if (!seen.has(classId)) { seen.add(classId); entry.draws += 1; }
            if (!entry.example) entry.example = { surface, snippet: snippets[0], text: String(text).slice(0, 160) };
          }
        }
      }
    }
  }
  return summarise({ classes, templates, drawn, draws });
};

const bump = (table, key, entry) => {
  const row = table[key] || { templates: 0, draws: 0 };
  row.templates += 1;
  row.draws += entry.draws;
  table[key] = row;
};

const summarise = ({ classes, templates, drawn, draws }) => ({
  templates,
  drawsPerTemplate: draws,
  draws: drawn,
  classes: Object.fromEntries(Object.entries(classes).map(([id, displayClass]) => {
    const entries = [...displayClass.templates.values()].sort((a, b) => a.id.localeCompare(b.id));
    const byFramework = Object.fromEntries(FRAMEWORKS.map((framework) => [framework, { templates: 0, draws: 0 }]));
    const bySurface = Object.fromEntries(SURFACES.map((surface) => [surface, { templates: 0, draws: 0 }]));
    entries.forEach((entry) => {
      bump(byFramework, entry.framework, entry);
      Object.entries(entry.surfaces).forEach(([surface, count]) => {
        bySurface[surface].templates += 1;
        bySurface[surface].draws += count;
      });
    });
    return [id, {
      label: displayClass.label,
      source: displayClass.source,
      certain: displayClass.certain,
      templates: entries.length,
      draws: entries.reduce((sum, entry) => sum + entry.draws, 0),
      byFramework,
      bySurface,
      items: entries.map(({ id: itemId, framework, draws: count, surfaces, example }) => ({ id: itemId, framework, draws: count, surfaces, example })),
    }];
  })),
});
