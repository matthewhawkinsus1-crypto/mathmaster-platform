// Every lesson's words, drawn the way a student's screen draws them.
//
// Prose goes through MathText (splitProseFractionRuns) and labels through
// MathDisplay (stackDivisions, then braceScriptGroups when the value is
// LaTeX). The Algebra II Rational Exponents lessons, regular and Honors, put
// about 370 strings through a path that broke them: "x^(1/3)" read as "x^("
// then a stacked ⅓ then ")", a label drew y^(1/7) with only the bracket
// raised, a fraction inside a fraction showed its LaTeX ("\frac{2}{y + " in
// Dividing Polynomials), and x^(1/3)/x was drawn as x to the power (1/3)/x,
// stackDivisions' reading of B^(E)/N (GR04), where the lesson meant
// (x^(1/3))/x. None of those may come back in any lesson file.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
import { isMathSegment, splitMathSegments, splitProseFractionRuns, unwrapMathSegment } from '../../src/components/common/mathSegments.js';
import { braceScriptGroups, resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LESSON_DIRS = ['teacher-import-jsons', 'docs/assignments', 'seed', 'functions/seeds'];
// Never on a student's screen: generator formulas and constraints, other
// accepted keys, ids.
const NOT_SHOWN = /\/(generator|derived|constraints|accepted|acceptedAnswers|id|questionId|validSchemes)(\/|$)/;

const jsonFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return jsonFiles(full);
  return name.endsWith('.json') ? [full] : [];
});

const shownStrings = () => {
  const strings = new Map();
  const collect = (value, where) => {
    if (typeof value === 'string') {
      if (NOT_SHOWN.test(where)) return;
      // A template is shown with its numbers filled in.
      const shown = value.replace(/\{\{\s*[A-Za-z_]\w*(\|[^}]*)?\s*\}\}/g, '3');
      if (/[\^/]/.test(shown) && !strings.has(shown)) strings.set(shown, where);
    } else if (Array.isArray(value)) value.forEach((item, index) => collect(item, `${where}/${index}`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => collect(item, `${where}/${key}`));
  };
  const files = [
    ...LESSON_DIRS.flatMap((dir) => jsonFiles(path.join(ROOT, dir))),
    ...readdirSync(ROOT).filter((name) => /^SAMPLE_.*\.json$/.test(name)).map((name) => path.join(ROOT, name)),
  ];
  files.forEach((file) => collect(JSON.parse(readFileSync(file, 'utf8')), path.relative(ROOT, file)));
  return strings;
};

// What MathDisplay hands MathLive for a value (MathDisplay.jsx).
const typeset = (value) => {
  const stacked = stackDivisions(value, { unicodeMath: true });
  return braceScriptGroups(stacked, resolveMathDisplayFormat(stacked, 'auto'));
};

const STRINGS = shownStrings();

const problems = () => {
  const found = { code: [], caret: [], bracket: [], tower: [], radical: [] };
  for (const [text, where] of STRINGS) {
    const pieces = splitMathSegments(text).flatMap((segment) => (isMathSegment(segment)
      ? [{ math: typeset(unwrapMathSegment(segment).value) }]
      : splitProseFractionRuns(segment).map((run) => (run.isFraction ? { math: typeset(run.text) } : { prose: run.text }))));
    const asLabel = typeset(text);
    const at = `${where}: ${text}`;
    if (pieces.some((piece) => piece.prose !== undefined && /\\[A-Za-z]/.test(piece.prose))) found.code.push(at);
    if (pieces.some((piece, index) => piece.prose !== undefined && /\^\(?\s*$/.test(piece.prose) && pieces[index + 1]?.math !== undefined)) found.caret.push(at);
    if ([asLabel, ...pieces.map((piece) => piece.math).filter(Boolean)].some((value) => resolveMathDisplayFormat(value, 'auto') === 'latex' && /[\^_]\s*\(/.test(value))) found.bracket.push(at);
    if ([asLabel, ...pieces.map((piece) => piece.math).filter(Boolean)].some((value) => /\^\\frac/.test(value))) found.tower.push(at);
    // A radical sign the fraction took its radicand from (√\frac{3}{3}), or a
    // power left outside the fraction its base is in (\frac{√(xy)}{y}⁴).
    if ([asLabel, ...pieces.map((piece) => piece.math).filter(Boolean)].some((value) => /[√∛∜]\\frac|\}[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(value))) found.radical.push(at);
  }
  return found;
};

const FOUND = problems();
// Known and left: a My Math Path key written in LaTeX with no delimiters (A2.7G,
// rational exponent to indexed radical, part 4). Path grades it as written;
// changing it needs the item's familyVersion raised and its grading proved
// unchanged. Kept in this list only while it is still there.
const KNOWN_CODE = ['seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json/documents/213/responseFields/3/expected'];
const list = (items) => `${items.length}:\n  ${items.slice(0, 6).join('\n  ')}`;

test('the sweep reads the lessons that carry these shapes', () => {
  const rational = [...STRINGS].filter(([text, where]) => /Rational_Exponents/.test(where) && /\^\(/.test(text) && text.includes('/'));
  assert.ok(STRINGS.size > 3000, `read ${STRINGS.size} strings`);
  assert.ok(rational.length >= 250, `read ${rational.length} Rational Exponents strings with a bracketed exponent`);
});

test('no prose shows LaTeX code', () => {
  const known = (at) => KNOWN_CODE.some((where) => at.startsWith(`${where}: `));
  assert.deepEqual(FOUND.code.filter((at) => !known(at)), [], `prose still holding LaTeX ${list(FOUND.code)}`);
  KNOWN_CODE.forEach((where) => assert.ok(FOUND.code.some((at) => at.startsWith(`${where}: `)), `${where} is fixed: take it off KNOWN_CODE`));
});

test('no prose leaves a caret in front of a typeset piece', () => {
  assert.deepEqual(FOUND.caret, [], `"^(" left in the prose ${list(FOUND.caret)}`);
});

test('no typeset LaTeX keeps a bracketed exponent or subscript', () => {
  assert.deepEqual(FOUND.bracket, [], `"^(" in LaTeX raises the bracket alone ${list(FOUND.bracket)}`);
});

// Radical Expressions showed √3/3 as √(3/3) and x√(xy)/y⁴ as x(√(xy)/y)⁴.
test('a radical keeps its radicand and a power its base', () => {
  assert.deepEqual(FOUND.radical, [], `drawn as different mathematics ${list(FOUND.radical)}`);
});

test('no lesson relies on the B^(E)/N reading', () => {
  // Write (B^(E))/N for a power over N, or B^((E)/N) for a fractional power.
  assert.deepEqual(FOUND.tower, [], `drawn as B^((E)/N) ${list(FOUND.tower)}`);
});
