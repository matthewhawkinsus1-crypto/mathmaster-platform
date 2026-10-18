#!/usr/bin/env node
/**
 * Equivalence verdict sweep: old code against new code, over every bank.
 *
 * WHY. A change to the shared answer-equivalence layer is allowed to do one
 * thing only: accept a right answer it used to reject. It must never turn a
 * verdict on a right answer from right to wrong, and it must never let a wrong
 * answer through. The unit tests pin the cases someone thought of; this sweep
 * checks every answer key in the repository.
 *
 * HOW. It builds one corpus from the CURRENT tree, then grades every
 * (response, field) pair with two copies of the graders: the current tree and a
 * base tree (a `git worktree` of the base commit). Corpus:
 *
 *   - every response field of every Path bank (grade 6–8, Algebra I/II, ACT,
 *     ASVAB, Digital SAT, TSIA2), drawn on fixed seeds through the production
 *     generator, plus every static key in docs/assignments, drafts and seed;
 *   - responses that should be RIGHT: the key, every accepted form, and student
 *     spellings of them (the spellings Job P's changes accept, among others);
 *   - responses that should be WRONG: every other choice label of the same
 *     field, and near misses of the key (a number moved by one, a sign
 *     flipped, a bracket or relation changed), each also in those spellings.
 *
 * Graders compared: the Path field grader (functions/lib/mathPath.js
 * valuesEquivalent, mirrored per `equivalence`), the assignment field matcher
 * (functions/shared/answerUtils.mjs matchesFieldAnswer) and sameValue.
 *
 * OUTPUT. Every pair whose verdict differs, as JSON, and a summary. Exit 1 if
 * any verdict went from right to wrong. Wrong-to-right changes are listed for
 * review; `--check-wrong` additionally fails when a response the corpus built
 * as a near miss (or another option) is now accepted.
 *
 *   git worktree add /tmp/base <base-commit> && ln -s "$PWD/node_modules" /tmp/base/node_modules
 *   node scripts/sweep-equivalence-verdicts.mjs --base /tmp/base [--draws 3] [--out sweep.json] [--check-wrong]
 *
 * Read-only: it writes only the --out file.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const BASE = argOf('--base', null);
const DRAWS = Math.max(1, Number(argOf('--draws', '3')) || 3);
const OUT = argOf('--out', null);
const CHECK_WRONG = process.argv.includes('--check-wrong');
if (!BASE) {
  console.error('usage: node scripts/sweep-equivalence-verdicts.mjs --base <worktree of the base commit> [--draws N] [--out file] [--check-wrong]');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const generation = await import(pathToFileURL(path.join(ROOT, 'functions/shared/pathQuestionGeneration.mjs')).href);
const { compilePathRecordForStorage } = require(path.join(ROOT, 'functions/lib/pathFirestoreShape.js'));

// --- the corpus ----------------------------------------------------------------

const scalar = (value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
const hasTemplate = (value) => /\{\{/.test(String(value));

const fields = [];
const seenFields = new Set();
const addField = (source, raw, questionChoices) => {
  const key = raw.expected ?? raw.answer;
  if (!scalar(key) || hasTemplate(key) || String(key).trim() === '') return;
  const accepted = [...(Array.isArray(raw.accepted) ? raw.accepted : []), ...(Array.isArray(raw.acceptedAnswers) ? raw.acceptedAnswers : [])]
    .filter((value) => scalar(value) && !hasTemplate(value));
  let options = [];
  const rawChoices = (Array.isArray(raw.choices) && raw.choices.length ? raw.choices : null)
    || (Array.isArray(raw.options) && raw.options.length ? raw.options : null)
    || questionChoices || [];
  options = rawChoices.map((choice) => (choice && typeof choice === 'object' ? choice.label ?? choice.text ?? choice.value : choice))
    .filter((value) => scalar(value) && !hasTemplate(value)).map(String);
  // A choice field graded by id keys an option id; compare labels instead.
  let keyText = String(key);
  if (rawChoices.length && rawChoices.some((choice) => choice && typeof choice === 'object' && choice.id === key)) {
    const keyed = rawChoices.find((choice) => choice.id === key);
    keyText = String(keyed.label ?? keyed.text ?? '');
    if (!keyText || hasTemplate(keyText)) return;
  }
  const field = {
    source,
    key: keyText,
    accepted: accepted.map(String),
    options: options.filter((label) => label !== keyText),
    equivalence: raw.equivalence || null,
    numericTolerance: raw.numericTolerance ?? null,
    answerFormat: raw.answerFormat || raw.inputContract?.format || null,
    inputProfile: raw.inputProfile || null,
  };
  const id = JSON.stringify([field.key, field.accepted, field.options, field.equivalence, field.numericTolerance, field.answerFormat]);
  if (seenFields.has(id)) return;
  seenFields.add(id);
  fields.push(field);
};

const visit = (node, source, questionChoices = null) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((entry) => visit(entry, source, questionChoices)); return; }
  const choices = Array.isArray(node.choices) && node.choices.length ? node.choices : questionChoices;
  if (('expected' in node || 'answer' in node) && (node.id !== undefined || node.inputProfile || node.label || node.accepted || node.acceptedAnswers)) {
    addField(source, node, choices);
  }
  for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value, source, choices);
};

const documentsIn = (parsed) => (Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || null));

let drawn = 0;
let drawFailures = 0;
const pathSeedDir = path.join(ROOT, 'functions/seeds/pathQuestionBank');
// The secure course-test families bundled beside the Path bank
// (functions/index.js resolveBlueprintFamilies) are drawn the same way.
const secureSeedDir = path.join(ROOT, 'functions/seeds/secureAssessments');
const seedFiles = [
  ...readdirSync(pathSeedDir).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).map((name) => [pathSeedDir, name]),
  ...readdirSync(secureSeedDir).filter((name) => name.endsWith('.json')).map((name) => [secureSeedDir, name]),
];
for (const [dir, file] of seedFiles) {
  const documents = documentsIn(JSON.parse(readFileSync(path.join(dir, file), 'utf8'))) || [];
  for (const item of documents) {
    if (item.active === false) continue;
    let document = item;
    try { document = compilePathRecordForStorage({ ...item, active: true }).document || item; } catch { /* keep the authored item */ }
    if (generation.hasPathGenerator(document) || generation.hasPathVariants(document)) {
      for (let draw = 0; draw < DRAWS; draw += 1) {
        try {
          const question = generation.generatePathInstanceWithRetries(document, `p-sweep-${draw}`, 4)?.question;
          if (question) { drawn += 1; visit(question, `${file} ${item.id}`); } else drawFailures += 1;
        } catch { drawFailures += 1; }
      }
    } else {
      visit(document, `${file} ${item.id}`);
    }
  }
}

const walkJson = (dir, skip = () => false) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (skip(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walkJson(full, skip);
    else if (name.endsWith('.json') && stat.size < 40e6) {
      try { visit(JSON.parse(readFileSync(full, 'utf8')), path.relative(ROOT, full)); } catch { /* not JSON data */ }
    }
  }
};
walkJson(path.join(ROOT, 'docs/assignments'));
walkJson(path.join(ROOT, 'drafts'));
walkJson(path.join(ROOT, 'seed'), (full) => full.includes(`${path.sep}pathQuestionBank`));

/*
 * Π AND ROOT KEYS THE BANK BARELY HAS (student pass 3, H-13 review). The math
 * editor writes a typed `/` around π or a root as a stacked fraction, and the
 * grader reads it (stackDivisions `constantOperands`). Only a handful of bank
 * keys put π or a root beside a slash, so these keys exercise that rule: each
 * gets its stacked spellings as right answers (spellingsOf) and the stacked
 * spellings that mean something else as wrong ones (nearMissesOf: a power on
 * the denominator, a power whose exponent is a fraction, numerator and
 * denominator swapped).
 */
const constantKeys = [];
for (const a of [1, 2, 3, 5]) {
  for (const b of [2, 3, 4, 6]) {
    if (a === b) continue;
    constantKeys.push(
      [`${a}pi/${b}`.replace(/^1pi/, 'pi'), 'number'], [`${a}/pi`, 'number'], [`${a}/pi^2`, 'number'],
      [`sqrt(${a + 1})/${b}`, 'number'], [`${b}/sqrt(${a + 1})`, 'number'], [`${a}sqrt(${b + 1})/${b}`, 'number'],
      [`x^pi/${b}`, 'expression'], [`e^sqrt(${a + 1})/${b}`, 'expression'],
      [`x^{pi}/${b}`, 'expression'], [`${a + 1}^{pi}/${b}`, 'number'], [`e^(sqrt(${a + 1})/${b})`, 'expression'],
      // A braced exponent that is not a single symbol comes along as one
      // operand (N1): x^{2t}/b is (x^{2t})/b, never x^(2t/b).
      [`x^{${a + 1}t}/${b}`, 'expression'], [`x^{\\alpha}/${b}`, 'expression'],
      // ASCII B^(E)/N keeps the reading the renderer shows, B^(E/N).
      [`${a + 1}^(x-1)/${b}`, 'expression'],
      [`(sqrt(${a + 1})/${b},1/${b})`, 'orderedPair'], [`x<=${a}pi/${b}`.replace(/=1pi/, '=pi'), 'inequality'],
    );
  }
}
constantKeys.forEach(([key, inputProfile]) => addField('synthetic: π and root keys', { expected: key, inputProfile }));

/*
 * THE GRADER GAPS OF STUDENT PASS 3 WAVE 6. Each key shape below gets right
 * spellings that must be accepted outright (`gapSpellingsRefused` must be 0)
 * and wrong ones that must be refused outright (`gapWrongAccepted` must be 0):
 *
 *   B^{-E}/N        a braced negative exponent is one group (N2): right
 *                   \frac{B^{-E}}{N}; wrong B^-\frac{E}{N}, B^{-\frac{E}{N}};
 *   x^(root(n)(m))  the editor's x^{\sqrt[n]{m}};
 *   L_S^P/N         a subscripted name is one operand, and x^{2}_{1} is x_1^2;
 *   1/N^E, (1/N)^E  (1/N)^E is 1/N^E for a positive number N; (2/3)^E is not
 *                   2/3^E;
 *   pairs           Algebra II quadratic-formula-exact keys, unsimplified
 *                   generator text: the simplified exact pair is right, the
 *                   other root, swapped coordinates and decimals are wrong.
 */
const gapKeys = [];
for (const [base, power, divisor] of [['10', '3', '2'], ['e', 'x', '2'], ['2', 'n', '3'], ['x', '2', '5'], ['3', 't', '4']]) {
  gapKeys.push([`${base}^{-${power}}/${divisor}`, 'expression', {
    right: [`\\frac{${base}^{-${power}}}{${divisor}}`, `${base}^{-${power}}/${divisor}`],
    wrong: [`${base}^-\\frac{${power}}{${divisor}}`, `${base}^{-\\frac{${power}}{${divisor}}}`, `${base}^{\\frac{-${power}}{${divisor}}}`, `\\frac{${base}^{${power}}}{${divisor}}`],
  }]);
}
for (const [index, radicand] of [['3', '2'], ['4', '5'], ['3', '7']]) {
  gapKeys.push([`x^(root(${index})(${radicand}))`, 'expression', {
    right: [`x^{\\sqrt[${index}]{${radicand}}}`],
    wrong: [`x^{\\sqrt{${radicand}}}`, `x^{\\sqrt[${index}]{${Number(radicand) + 1}}}`, `x^{\\sqrt[${Number(index) + 1}]{${radicand}}}`],
  }]);
}
for (const [name, subscript, power, divisor] of [['x', '2', '3', '4'], ['x', '1', '2', '3'], ['y', '0', '2', '5']]) {
  gapKeys.push([`${name}_${subscript}^${power}/${divisor}`, 'expression', {
    right: [`\\frac{${name}_${subscript}^${power}}{${divisor}}`, `\\frac{${name}_{${subscript}}^{${power}}}{${divisor}}`, `${name}^{${power}}_{${subscript}}/${divisor}`, `\\frac{${name}^{${power}}_{${subscript}}}{${divisor}}`],
    wrong: [`${name}_${subscript}^{\\frac{${power}}{${divisor}}}`, `${name}_{\\frac{${subscript}}{${divisor}}}^${power}`, `\\frac{${name}_${subscript}^${divisor}}{${power}}`, `${name}^{${power}_{${subscript}}}/${divisor}`],
  }]);
}
for (const [denominator, power] of [['2', 'pi'], ['3', 'x'], ['5', '2'], ['4', 'n']]) {
  const latexPower = power === 'pi' ? '\\pi' : power;
  gapKeys.push([`1/${denominator}^${power}`, 'expression', {
    right: [`\\left(\\frac1${denominator}\\right)^{${latexPower}}`, `\\frac{1}{${denominator}^{${latexPower}}}`, `(1/${denominator})^${power}`],
    wrong: [`\\left(\\frac{1}{${denominator}}\\right)^{-${latexPower}}`, `\\frac{${denominator}}{1^{${latexPower}}}`, `\\left(\\frac{1}{${Number(denominator) + 1}}\\right)^{${latexPower}}`, `\\frac{${latexPower}}{${denominator}}`],
  }]);
  gapKeys.push([`(1/${denominator})^${power}`, 'expression', {
    right: [`\\frac{1}{${denominator}^{${latexPower}}}`, `1/${denominator}^${power}`, `\\left(\\frac{1}{${denominator}}\\right)^{${latexPower}}`],
    wrong: [`\\left(\\frac{1}{${denominator}}\\right)^{-${latexPower}}`, `\\frac{${denominator}}{1^{${latexPower}}}`, `\\frac{1}{${denominator}}${latexPower}`],
  }]);
  // Not a unit fraction: (2/3)^E is 2^E/3^E, never 2/3^E.
  gapKeys.push([`2/${Number(denominator) + 1}^${power}`, 'expression', {
    right: [`\\frac{2}{${Number(denominator) + 1}^{${latexPower}}}`],
    wrong: [`\\left(\\frac{2}{${Number(denominator) + 1}}\\right)^{${latexPower}}`, `(2/${Number(denominator) + 1})^${power}`],
  }]);
}
// The review of wave 6 (B1, B2, S2, S3, N3):
//   a negative power in a denominator is the same number however it is read;
//   a pair with no root keeps its old reading (no mixed numbers, no
//   unsimplified arithmetic, no root against a plain number);
//   a pair key that is not two constants matches its own text;
//   (1/2)^x^2 is not (1/2^x)^2;
//   an ASCII B^-E/N is read as drawn, B^(-E/N): a lowered verdict against a
//   braced key, kept until the owner decides the B^(E)/N reading.
for (const [numerator, base, power] of [['3', 'x', '2'], ['1', 'x', '2'], ['3', '2', 'x'], ['5', 'y', '3']]) {
  gapKeys.push([`${numerator}/${base}^{-${power}}`, 'expression', {
    right: [`${numerator}/${base}^-${power}`, `\\frac{${numerator}}{${base}^{-${power}}}`],
    wrong: [`\\frac{${numerator}}{${base}^{${power}}}`, `\\frac{${numerator}}{${base}}^{-${power}}`, `${numerator}/${base}^-${power}1`],
  }]);
}
gapKeys.push(['3/x^{-2}y', 'expression', { right: ['3/x^-2y'], wrong: ['3/x^-2'] }]);
for (const [key, wrongPairs, rightPairs] of [
  ['(\\frac{1}{2},4)', ['(1\\frac{1}{2},4)'], ['(0.5,4)', '(1/2,4)']],
  ['(\\frac{3}{2},1)', ['(3\\frac{1}{2},1)'], ['(1.5,1)']],
  ['(-1,4)', ['(-2\\frac{1}{2},4)'], []],
  ['(1,4)', ['(2 1/2,4)'], []],
  ['(3,4)', ['(1+2,4)'], []],
  ['(2,3)', ['(6/2,8-4)', '(-(-2),3)'], []],
  ['(8,1)', ['(2^3,1)'], []],
  ['(2,1)', ['(\\sqrt{4},1)'], []],
  ['(\\pi,\\sqrt{2})', ['(\\pi,\\sqrt{3})'], ['(π,\\sqrt{2})']],
  ['(x+\\sqrt{2},1)', ['(x+\\sqrt{3},1)'], ['(x+\\sqrt{2},1)', '(x+sqrt(2),1)']],
  ['(1,root(3)(2))', ['(1,\\sqrt[3]{3})', '(1,\\sqrt{2})'], ['(1,\\sqrt[3]{2})']],
]) gapKeys.push([key, 'orderedPair', { right: rightPairs, wrong: wrongPairs }]);
gapKeys.push(['(1/2)^x^2', 'expression', { right: [], wrong: ['\\frac{1}{2^x}^2'] }]);
for (const [key, drawn] of [['10^{-3}/2', '10^-3/2'], ['2x^{-1}/5', '2x^-1/5'], ['y=2^{-x}/3', 'y=2^-x/3'], ['P=100(2)^{-t}/5', 'P=100(2)^-t/5'], ['x^{-a}/b', 'x^-a/b']]) {
  gapKeys.push([key, key.includes('=') ? 'equation' : 'expression', { right: [], wrong: [drawn] }]);
}
// mm_A2_3C_v2_quadratic-formula-exact: x = (-P ± sqrt(D))/2 with D = 4t, so
// x = h ± sqrt(t) and y = Mx + B = (Mh + B) ± M sqrt(t).
const signed = (value) => (value < 0 ? `-${-value}` : `+${value}`);
const radicalTerm = (constant, coefficient, t) => {
  const magnitude = Math.abs(coefficient) === 1 ? `sqrt(${t})` : `${Math.abs(coefficient)}sqrt(${t})`;
  const sign = coefficient < 0 ? '-' : '+';
  return constant === 0 ? `${coefficient < 0 ? '-' : ''}${magnitude}` : `${constant}${sign}${magnitude}`;
};
for (const p of [-4, -2, 0, 2, 4]) {
  for (const d of [8, 12, 20]) {
    for (const m of [-2, 1, 3]) {
      for (const b of [-5, 0, 3]) {
        const t = d / 4;
        const h = -p / 2;
        for (const sign of [-1, 1]) {
          const op = sign < 0 ? '-' : '+';
          const x = `(-(${p})${op}sqrt(${d}))/2`;
          const key = `(${x},${m}*(${x})+${b})`;
          const exactX = radicalTerm(h, sign, t);
          const exactY = radicalTerm(m * h + b, sign * m, t);
          const other = `(${radicalTerm(h, -sign, t)},${radicalTerm(m * h + b, -sign * m, t)})`;
          const xValue = h + sign * Math.sqrt(t);
          const yValue = m * xValue + b;
          const asLatex = (text) => text.replace(/sqrt\((\d+)\)/g, '\\sqrt{$1}');
          gapKeys.push([key, 'orderedPair', {
            right: [`(${exactX},${exactY})`, asLatex(`(${exactX},${exactY})`), `\\left(${asLatex(exactX)},${asLatex(exactY)}\\right)`,
              `(\\frac{${-p}${op}\\sqrt{${d}}}{2},${asLatex(exactY)})`],
            // (Swapped coordinates are the same point when y = x.)
            wrong: [other, asLatex(other), ...(exactX === exactY ? [] : [`(${exactY},${exactX})`]), `(${xValue.toFixed(3)},${yValue.toFixed(3)})`,
              `(${xValue},${yValue})`, `(${exactX},${exactY}${signed(1)})`],
          }]);
        }
      }
    }
  }
}
const gapChecks = new Map();
gapKeys.forEach(([key, inputProfile, checks]) => {
  addField('synthetic: wave-6 grader gaps', { expected: key, inputProfile });
  // A key listed twice (N2's `10^{-3}/2` and S2's) keeps both lists.
  const known = gapChecks.get(key);
  gapChecks.set(key, known ? { right: [...known.right, ...checks.right], wrong: [...known.wrong, ...checks.wrong] } : checks);
});

// --- spellings and near misses -------------------------------------------------

const NUMBER = /-?\d+(?:\.\d+)?/;
const isPlainNumber = (text) => /^\s*-?\d+(?:\.\d+)?\s*$/.test(text);

// Keys and near misses that got a stacked π or root spelling (reported).
const stackedSpellings = new Set();

/*
 * WHAT THE MATH EDITOR HOLDS FOR A KEY WITH π, A ROOT OR AN EXPONENT (H-13
 * review): sqrt(n) is \sqrt{n}, pi is \pi, an exponent is braced (^{2},
 * ^{n-1}), and a typed `/` stacks the atom before it over the atom after it —
 * a number, π or a root with a number coefficient, a power, π with its power.
 * Conservative: a denominator followed by a letter, digit, power or bracket is
 * left as a slash (3/4x stays 3/4x).
 */
const BRACED = String.raw`\{(?:[^{}]|\{[^{}]*\})+\}`;
// The atom starts where a name or a number starts: never inside `10` or after
// a subscript mark (`x_2^3/4` is not x_ over anything).
const EDITOR_NUMERATOR = String.raw`(?<![A-Za-z0-9_.])((?:\d+|[A-Za-z])\^${BRACED}|\\pi\^${BRACED}|\d*(?:\\pi|\\sqrt\{[^{}]+\})|\d+(?:\.\d+)?)`;
const EDITOR_DENOMINATOR = String.raw`(\\pi(?:\^\{[^{}]+\})?|\\sqrt\{[^{}]+\}|\d+(?:\.\d+)?)`;
const EDITOR_STACK = new RegExp(`${EDITOR_NUMERATOR}\\/${EDITOR_DENOMINATOR}(?![\\w.^{(\\\\])`, 'g');
const editorSpellingsOf = (text) => {
  if (!/\^|(?<![A-Za-z])pi(?![A-Za-z])|π|sqrt|√/.test(text)) return [];
  // An ASCII `B^(E)/N` is drawn as B^(E/N) but reads as (B^E)/N by standard
  // precedence; which one an author means is the owner's question, so no
  // editor spelling is claimed for it (H-13 review, round 3).
  if (/\^\([^()]*\)\s*\//.test(text)) return [];
  const flat = text.replace(/\s+/g, '')
    .replace(/sqrt\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/(?<![A-Za-z\\])pi(?![A-Za-z])|π/g, '\\pi')
    .replace(/\^\(([^()]+)\)/g, '^{$1}')
    .replace(/\^(\d+|[A-Za-z]|\\pi)(?![\w{])/g, '^{$1}')
    .replace(/\^(\\sqrt\{[^{}]+\})/g, '^{$1}');
  const stacked = flat.replace(EDITOR_STACK, '\\frac{$1}{$2}');
  // MathLive leaves a one-character power unbraced when typed (\frac{2}{\pi^2}).
  return [flat, stacked, stacked.replace(/\^\{(\d|[A-Za-z]|\\pi)\}/g, '^$1')];
};
const editorSpellingKeys = new Set();
// The stacked spellings that are another number: refused outright, not only
// no worse than the base (which accepted x^\frac{\pi}{2} for x^{\pi}/2).
const stackedWrongSpellings = new Set();

/** Student spellings of a response. Each is the same mathematics written another way. */
const spellingsOf = (text) => {
  const out = new Set();
  const add = (value) => { if (value && value !== text) out.add(value); };
  // B^(E)/N as the renderer draws it: B^{\frac{E}{N}}.
  add(text.replace(/(\d|[A-Za-z])\^\(([^()]+)\)\/(\d+)(?![\w.(^])/g, '$1^{\\frac{$2}{$3}}'));
  const editor = editorSpellingsOf(text);
  if (editor.length) editorSpellingKeys.add(text);
  editor.forEach(add);
  add(text.replace(/\s+/g, ''));
  add(text.replace(/(^|[-+=(*])1(?=sqrt|[a-z(])/g, '$1'));
  add(text.replace(/-/g, '−'));
  // `^(E)` is `^{E}` — except before a `/`: an ASCII B^(E)/N is drawn as
  // B^(E/N), while LaTeX B^{E}/N is (B^E)/N, another number (round 3).
  add(text.replace(/\^\(([^()]+)\)(?!\s*\/)/g, '^{$1}'));
  add(text.replace(/\^(-?\w)(?![\w{(])/g, '^{$1}'));
  add(text.replace(/sqrt\(([^()]+)\)/g, '\\sqrt{$1}'));
  add(text.replace(/sqrt\((\w)\)/g, '\\sqrt$1'));
  add(text.replace(/\bpi\b|π/g, '\\pi'));
  add(text.replace(/\\pi|\bpi\b/g, 'π'));
  add(text.replace(/\|([^|]+)\|/g, 'abs($1)'));
  add(text.replace(/\|([^|]+)\|/g, '\\lvert $1\\rvert'));
  add(text.replace(/\s+or\s+/g, '\\lor '));
  // The secure inequality keypad's word keys, as MathLive writes them back (H-13).
  add(text.replace(/\s+(and|or)\s+/g, '\\operatorname{\\mathrm{$1}}'));
  add(text.replace(/!=|≠/g, '\\neq '));
  add(text.replace(/\((-?\d+)\/(\d+)\s*,/g, (m, n, d) => `(${Number(n) / Number(d)},`));
  add(text.replace(/\((-?\d+)\/(\d+)\s*,/g, (m, n, d) => `(${n.startsWith('-') ? '-' : ''}\\frac{${n.replace('-', '')}}{${d}},`));
  // The math editor's stacked fraction around π or a root (student pass 3,
  // H-13): a typed `/` after 3π or 2sqrt(3) builds \frac{3\pi}{4}.
  const stacked = (value) => value.replace(/(\d*(?:\\pi|π|(?<![A-Za-z])pi(?![A-Za-z])|\\sqrt\{[^{}]+\}|sqrt\([^()]+\)))\s*\/\s*(\d+(?:\.\d+)?|π|\\pi|pi(?![A-Za-z])|\\sqrt\{[^{}]+\}|sqrt\([^()]+\))(?![\w.(^])/g,
    (match, numerator, denominator) => `\\frac{${numerator}}{${denominator}}`);
  if (stacked(text) !== text) stackedSpellings.add(text);
  add(stacked(text));
  add(stacked(text).replace(/sqrt\(([^()]+)\)/g, '\\sqrt{$1}').replace(/\bpi\b|π/g, '\\pi'));
  if (isPlainNumber(text)) {
    add(`x=${text.trim()}`);
    add(`${text.trim()}%`);
    add(`\\$${text.trim()}`);
  }
  const sides = text.split('=');
  if (sides.length === 2 && sides[0].trim() && sides[1].trim()) add(`${sides[1].trim()}=${sides[0].trim()}`);
  // Chained inequality a < x < b as "x > a and x < b".
  const chained = text.replace(/\s+/g, '').match(/^(-?\d+(?:\.\d+)?)(<=|<|≤)([a-z])(<=|<|≤)(-?\d+(?:\.\d+)?)$/);
  if (chained) {
    const flip = { '<': '>', '<=': '>=', '≤': '≥' };
    add(`${chained[3]}${flip[chained[2]]}${chained[1]} and ${chained[3]}${chained[4]}${chained[5]}`);
    add(`${chained[3]}${flip[chained[2]]}${chained[1]}\\land ${chained[3]}${chained[4]}${chained[5]}`);
  }
  // Vertex form with the constant first: y=a(x-h)^2+k as y=k+a(x-h)^2.
  const vertex = text.replace(/\s+/g, '').match(/^([a-z](?:\([a-z]\))?=)(-?[\d.]*\([^()]+\)\^2)([+-]\d+(?:\.\d+)?)$/);
  if (vertex) add(`${vertex[1]}${vertex[3].replace(/^\+/, '')}${vertex[2].startsWith('-') ? '' : '+'}${vertex[2]}`);
  return [...out];
};

/** Near misses of a key: each is a different answer. */
const nearMissesOf = (text) => {
  const out = new Set();
  const add = (value) => { if (value && value !== text) out.add(value); };
  const match = text.match(NUMBER);
  if (match) {
    const value = Number(match[0]);
    const swap = (next) => `${text.slice(0, match.index)}${next}${text.slice(match.index + match[0].length)}`;
    add(swap(String(value + 1)));
    add(swap(String(-value || 1)));
    if (!Number.isInteger(value)) add(swap(String(Math.round(value * 100) / 100 + 0.01)));
  }
  if (/[[\]]/.test(text)) add(text.replace(/\[/, '(').replace(/\]/, ')'));
  else if (/^\(.*,.*\)$/.test(text.trim())) add(text.trim().replace(/^\(/, '[').replace(/\)$/, ']'));
  if (/<=|>=|≤|≥/.test(text)) add(text.replace(/<=/, '<').replace(/>=/, '>').replace(/≤/, '<').replace(/≥/, '>'));
  else if (/[<>]/.test(text)) add(text.replace(/</, '<=').replace(/>/, '>='));
  if (/\s+or\s+/.test(text)) add(text.replace(/\s+or\s+/, ' and '));
  if (/\s+and\s+/.test(text)) add(text.replace(/\s+and\s+/, ' or '));
  // Stacked spellings that are a different number (H-13 review): (a/π)² for
  // a/π², x^(π/2) for x^π/2, e^(√n/b) for e^√n/b, and b/a for a/b. (The
  // editor always braces an exponent, so an unbraced ^\frac is not written.)
  // Each must be refused outright (stackedWrongSpellings, checked below).
  const addStackedWrong = (value) => { if (value && value !== text) { out.add(value); stackedWrongSpellings.add(value); } };
  addStackedWrong(text.replace(/(\d+)\/(?:pi|π)\^(\d+)/g, '\\frac{$1}{\\pi}^$2'));
  addStackedWrong(text.replace(/(\d+)\/(?:pi|π)\^(\d+)/g, '\\frac{$1}{\\pi}^{$2}'));
  addStackedWrong(text.replace(/\^(?:pi|π)\/(\d+)/g, '^\\frac{\\pi}{$1}'));
  addStackedWrong(text.replace(/\^\{(?:pi|π)\}\/(\d+)/g, '^\\frac{\\pi}{$1}'));
  // …and as the editor writes them, braced: typing x^pi/2 without leaving the
  // exponent gives x^{\frac{\pi}{2}}, which is x^(π/2).
  addStackedWrong(text.replace(/\^\{?(?:pi|π)\}?\/(\d+)/g, '^{\\frac{\\pi}{$1}}'));
  addStackedWrong(text.replace(/\^sqrt\((\d+)\)\/(\d+)/g, '^{\\frac{\\sqrt{$1}}{$2}}'));
  addStackedWrong(text.replace(/\^\{([^{}]+)\}\/(\d+)(?![\w.(^])/g, '^\\frac{$1}{$2}'));
  // …and against an ASCII B^(E)/N key, the standard-precedence (B^E)/N, which
  // is not what the student is shown.
  addStackedWrong(text.replace(/(\d|[A-Za-z])\^\(([^()]+)\)\/(\d+)(?![\w.(^])/g, '\\frac{$1^{$2}}{$3}'));
  addStackedWrong(text.replace(/(\d|[A-Za-z])\^\(([^()]+)\)\/(\d+)(?![\w.(^])/g, '$1^{$2}/$3'));
  addStackedWrong(text.replace(/\^\{([^{}]+)\}\/(\d+)(?![\w.(^])/g, '^{\\frac{$1}{$2}}'));
  addStackedWrong(text.replace(/\^sqrt\((\d+)\)\/(\d+)/g, '^\\frac{\\sqrt{$1}}{$2}'));
  // (Not when the swap is the same number: sqrt(4)/2 and 2/sqrt(4) are both 1,
  // and a pair coordinate is compared by its exact value.)
  const swapped = text.replace(/(\d*(?:pi|sqrt\(\d+\)))\/(\d+)(?![\w.(^])/g, (match, numerator, denominator) => (
    /^sqrt\(\d+\)$/.test(numerator) && Number(numerator.slice(5, -1)) === Number(denominator) ** 2 ? match : `\\frac{${denominator}}{${numerator}}`));
  if (swapped !== text) addStackedWrong(swapped.replace(/sqrt\((\d+)\)/g, '\\sqrt{$1}').replace(/(?<![A-Za-z\\])pi/g, '\\pi'));
  return [...out];
};

// --- graders, one copy per tree ------------------------------------------------

const gradersFrom = async (root) => {
  const equivalence = await import(pathToFileURL(path.join(root, 'functions/shared/answerEquivalence.mjs')).href);
  const answerUtils = await import(pathToFileURL(path.join(root, 'functions/shared/answerUtils.mjs')).href);
  // functions/lib/mathPath.js valuesEquivalent, without the async import.
  const pathField = (actual, field) => [field.key, ...field.accepted].some((expected) => {
    const tolerance = Math.max(0, Number(field.numericTolerance) || 0);
    switch (field.equivalence) {
      case 'interval': return equivalence.sameIntervalNotation(actual, expected, tolerance);
      case 'polynomialRelation': return equivalence.samePolynomialEquationRelation(actual, expected, tolerance);
      case 'absoluteLinearRelation': return equivalence.sameAbsoluteValueLinearEquation(actual, expected, tolerance);
      case 'modelEquation': return equivalence.sameCommutativeModelEquation(actual, expected);
      case 'setBuilder': return equivalence.sameSetBuilderNotation(actual, expected, tolerance);
      case 'rationalExpression': return equivalence.sameRationalExpression(actual, expected, tolerance);
      case 'nonnegativeRadicalExpression': return equivalence.sameNonnegativeRadicalExpression(actual, expected, tolerance);
      default: return equivalence.sameValue(actual, expected, tolerance);
    }
  });
  const assignmentField = (actual, field) => answerUtils.matchesFieldAnswer(actual, {
    answer: field.key,
    acceptedAnswers: field.accepted,
    answerFormat: field.answerFormat || undefined,
  });
  const safely = (grade) => (actual, field) => { try { return Boolean(grade(actual, field)); } catch { return 'throws'; } };
  return {
    path: safely(pathField),
    assignment: safely(assignmentField),
    sameValue: safely((actual, field) => equivalence.sameValue(actual, field.key, 1e-6)),
  };
};

// --dump-fields <file>: write the corpus (every field the sweep grades) and stop.
const DUMP = argOf('--dump-fields', null);
if (DUMP) {
  writeFileSync(DUMP, `${JSON.stringify(fields, null, 1)}\n`);
  console.log(`wrote ${fields.length} fields to ${DUMP}`);
  process.exit(0);
}

const current = await gradersFrom(ROOT);
const base = await gradersFrom(path.resolve(BASE));

const changes = [];
const counts = { fields: fields.length, drawn, drawFailures, rightResponses: 0, wrongResponses: 0, graded: 0, rightToWrong: 0, wrongToRight: 0, nearMissNowRight: 0, nearMissNowRefused: 0, stackedWrongAccepted: 0 };
const stackedWrongAccepted = [];
// The editor's spelling of a key must be accepted by this tree outright, not
// only no worse than the base (H-13 review): a field the editor now collects
// would otherwise mark its own key wrong.
const editorRefused = [];
for (const field of fields) {
  for (const spelling of editorSpellingsOf(field.key)) {
    if (spelling === field.key) continue;
    if (current.path(spelling, field) !== true) editorRefused.push({ key: field.key, spelling, inputProfile: field.inputProfile, source: field.source });
  }
}
counts.editorSpellingsRefused = editorRefused.length;

// The wave-6 gap shapes, outright (not only no worse than the base).
const gapRefused = [];
const gapWrongAccepted = [];
for (const field of fields) {
  const checks = gapChecks.get(field.key);
  if (!checks || field.source !== 'synthetic: wave-6 grader gaps') continue;
  for (const grader of ['path', 'assignment', 'sameValue']) {
    const asField = grader === 'assignment' && field.inputProfile === 'orderedPair' ? { ...field, answerFormat: 'orderedPair' } : field;
    checks.right.forEach((response) => { if (current[grader](response, asField) !== true) gapRefused.push({ grader, response, key: field.key }); });
    checks.wrong.forEach((response) => { if (current[grader](response, asField) === true) gapWrongAccepted.push({ grader, response, key: field.key }); });
  }
}
counts.gapSpellingsRefused = gapRefused.length;
counts.gapWrongAccepted = gapWrongAccepted.length;
// The same checks on the base, for the record (what a student met before).
let gapBaseRefused = 0;
let gapBaseWrongAccepted = 0;
for (const field of fields) {
  const checks = gapChecks.get(field.key);
  if (!checks || field.source !== 'synthetic: wave-6 grader gaps') continue;
  for (const grader of ['path', 'assignment', 'sameValue']) {
    const asField = grader === 'assignment' && field.inputProfile === 'orderedPair' ? { ...field, answerFormat: 'orderedPair' } : field;
    checks.right.forEach((response) => { if (base[grader](response, asField) !== true) gapBaseRefused += 1; });
    checks.wrong.forEach((response) => { if (base[grader](response, asField) === true) gapBaseWrongAccepted += 1; });
  }
}
counts.gapSpellingsRefusedOnBase = gapBaseRefused;
counts.gapWrongAcceptedOnBase = gapBaseWrongAccepted;

for (const field of fields) {
  const right = new Set([field.key, ...field.accepted]);
  [...right].forEach((value) => spellingsOf(value).forEach((spelling) => right.add(spelling)));
  // Each wrong response remembers the answer it spells. A spelling of a near
  // miss that the field's own tolerance already accepts (154 vs 155 with a
  // tolerance of 1) is not a wrong answer let through.
  const wrong = new Map();
  field.options.forEach((label) => wrong.set(label, label));
  nearMissesOf(field.key).forEach((miss) => {
    wrong.set(miss, miss);
    spellingsOf(miss).forEach((spelling) => { if (!wrong.has(spelling)) wrong.set(spelling, miss); });
  });
  for (const value of right) wrong.delete(value);
  const responses = [...[...right].map((value) => [value, 'right', value]), ...[...wrong].map(([value, root]) => [value, 'wrong', root])];
  counts.rightResponses += right.size;
  counts.wrongResponses += wrong.size;
  for (const [response, built, root] of responses) {
    for (const grader of ['path', 'assignment', 'sameValue']) {
      counts.graded += 1;
      const before = base[grader](response, field);
      const after = current[grader](response, field);
      if (built === 'wrong' && after === true && stackedWrongSpellings.has(response)) {
        counts.stackedWrongAccepted += 1;
        stackedWrongAccepted.push({ grader, response, key: field.key });
      }
      if (before === after) continue;
      // A wrong response whose root answer the field already accepts is the
      // root's own spelling, not a near miss let through.
      const effectivelyRight = built === 'wrong' && root !== response && base[grader](root, field) === true;
      const change = { grader, built: effectivelyRight ? 'right' : built, root, response, key: field.key, accepted: field.accepted, equivalence: field.equivalence, numericTolerance: field.numericTolerance, source: field.source, before, after };
      changes.push(change);
      // A near miss (or a spelling of one) the base accepted and this tree
      // refuses is a wrong answer no longer let through, never a right answer
      // lost — even when the base's acceptance made it look "effectively right".
      if (before === true && built === 'wrong') { change.built = 'wrong'; counts.nearMissNowRefused += 1; }
      else if (before === true) counts.rightToWrong += 1;
      else if (after === true) {
        counts.wrongToRight += 1;
        if (change.built === 'wrong') counts.nearMissNowRight += 1;
      }
    }
  }
}

if (OUT) writeFileSync(OUT, `${JSON.stringify({ counts, changes, editorRefused }, null, 2)}\n`);
console.log(JSON.stringify({ ...counts, stackedPiOrRootSpellings: stackedSpellings.size, editorSpelledKeys: editorSpellingKeys.size }));
const show = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length})`);
  const seen = new Set();
  for (const change of list) {
    const line = `${change.grader.padEnd(10)} ${JSON.stringify(change.response)}  key ${JSON.stringify(change.key)}${change.equivalence ? ` [${change.equivalence}]` : ''}  ${change.before} → ${change.after}`;
    if (seen.has(line)) continue;
    seen.add(line);
    if (seen.size <= 400) console.log(`  ${line}`);
  }
  if (seen.size > 400) console.log(`  ... ${seen.size - 400} more (see --out)`);
};
show('RIGHT → WRONG (must be empty)', changes.filter((change) => change.before === true && change.built !== 'wrong'));
show('A NEAR MISS THE BASE ACCEPTED, NOW REFUSED (a fix; review each)', changes.filter((change) => change.before === true && change.built === 'wrong'));
show('WRONG → RIGHT, built as a near miss or another option (review each)', changes.filter((change) => change.before !== true && change.built === 'wrong'));
show('WRONG → RIGHT, built as a right spelling', changes.filter((change) => change.before !== true && change.built === 'right'));
if (editorRefused.length) {
  console.log(`\nTHE EDITOR'S SPELLING OF A KEY, REFUSED (${editorRefused.length}; must be empty)`);
  editorRefused.slice(0, 40).forEach((entry) => console.log(`  ${JSON.stringify(entry.spelling)}  key ${JSON.stringify(entry.key)} [${entry.inputProfile}]`));
}
if (stackedWrongAccepted.length) {
  console.log(`\nA STACKED SPELLING THAT IS ANOTHER NUMBER, ACCEPTED (${stackedWrongAccepted.length}; must be empty)`);
  stackedWrongAccepted.slice(0, 40).forEach((entry) => console.log(`  ${entry.grader.padEnd(10)} ${JSON.stringify(entry.response)}  key ${JSON.stringify(entry.key)}`));
}
if (gapRefused.length) {
  console.log(`\nA WAVE-6 GAP SPELLING OF A KEY, REFUSED (${gapRefused.length}; must be empty)`);
  gapRefused.slice(0, 40).forEach((entry) => console.log(`  ${entry.grader.padEnd(10)} ${JSON.stringify(entry.response)}  key ${JSON.stringify(entry.key)}`));
}
if (gapWrongAccepted.length) {
  console.log(`\nA WAVE-6 GAP WRONG ANSWER, ACCEPTED (${gapWrongAccepted.length}; must be empty)`);
  gapWrongAccepted.slice(0, 40).forEach((entry) => console.log(`  ${entry.grader.padEnd(10)} ${JSON.stringify(entry.response)}  key ${JSON.stringify(entry.key)}`));
}
if (counts.rightToWrong > 0 || (CHECK_WRONG && (counts.nearMissNowRight > 0 || editorRefused.length > 0 || stackedWrongAccepted.length > 0
  || gapRefused.length > 0 || gapWrongAccepted.length > 0))) process.exit(1);
