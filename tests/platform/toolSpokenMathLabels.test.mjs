/*
 * A11Y-3 (pass 3, 04-tools-and-accessibility.md): a control whose name carries
 * math says it in words.
 *
 * The Systems substitution token was announced "Pick up the expression
 * ((12-3x)/(2)) from the isolated equation", Step Algebra's distribution token
 * "Pick up the factor -3" / "Apply the factor to 2*x", and the matrix
 * calculator's keys bracket by bracket ("[A]⁻¹·[B]"). Labels now go through
 * spokenMathValue (src/tools/shared/spokenMathValue.js), which speaks the value
 * the way MathDisplay speaks the same value on screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spokenMathValue, tidyMathForSpeech } from '../../src/tools/shared/spokenMathValue.js';
import { executableSource } from './helpers/sourceContract.mjs';

const PROGRAM_SYNTAX = /[()*/~^[\]·⁻¹]/;

test('the expressions the tools really produce are spoken in words', () => {
  // What latexToExpression hands the substitution token (doubled parentheses).
  assert.equal(spokenMathValue('((12-3x)/(2))'), 'the fraction 12 minus 3x over 2 end fraction');
  // The Classwork Q2 token as persisted (tests/platform/fixtures/classworkQ2RuntimeCapture.json).
  assert.equal(spokenMathValue('-(3)+(2~ y)'), 'negative 3 plus 2 y');
  // Solved values and terms.
  assert.equal(spokenMathValue('x = 20/9'), 'x equals 20 over 9');
  assert.equal(spokenMathValue('-3'), 'negative 3');
  assert.equal(spokenMathValue('-4x+12'), 'negative 4x plus 12');
  assert.equal(spokenMathValue('(1/2)x+3'), '1 over 2 x plus 3');
  // The matrix calculator's keys.
  assert.equal(spokenMathValue('[A]⁻¹·[B]'), 'A inverse times B');
  assert.equal(spokenMathValue('[A]⁻¹'), 'A inverse');
  assert.equal(spokenMathValue('[A]+[B]'), 'A plus B');
  for (const value of ['((12-3x)/(2))', '-(3)+(2~ y)', 'x = 20/9', '[A]⁻¹·[B]', '2*x', '3x - 2y = 6']) {
    assert.doesNotMatch(spokenMathValue(value), PROGRAM_SYNTAX, `${value} is spoken without program syntax`);
  }
  assert.equal(spokenMathValue(''), '');
  assert.equal(spokenMathValue(null), '');
});

test('tidying only removes grouping a reader never sees', () => {
  // A lone term in brackets, and brackets around the whole value.
  assert.equal(tidyMathForSpeech('-(3)'), '-3');
  assert.equal(tidyMathForSpeech('x = (4)'), 'x = 4');
  assert.equal(tidyMathForSpeech('((12-3x)/(2))'), '(12-3x)/(2)');
  // A group after / or ^ keeps its brackets: 2/(3x) is 2 over 3x, not (2/3)x.
  assert.equal(tidyMathForSpeech('2/(3x)'), '2/(3x)');
  assert.equal(tidyMathForSpeech('2^(3)'), '2^(3)');
  assert.equal(spokenMathValue('2/(3x)'), 'the fraction 2 over 3x end fraction');
  // Brackets that carry meaning stay: a product, a quantity, a group of a sum.
  assert.equal(tidyMathForSpeech('2(3)'), '2(3)');
  assert.equal(tidyMathForSpeech('(2)3'), '(2)3');
  assert.equal(tidyMathForSpeech('(x+1)(x-1)'), '(x+1)(x-1)');
  assert.equal(tidyMathForSpeech('-(x+2)'), '-(x+2)');
  assert.equal(spokenMathValue('2(3)'), '2 times the quantity 3');
});

// Every component under src/. The scan began as six folders and files of the
// algebra tools (A11Y-3); a new component anywhere now has its control names
// read too, and a file that is known to break the rule is listed below with its
// reason instead of being left out of the scan (CI01, VH-23).
const ROOT = new URL('../../', import.meta.url).pathname;
const jsxUnder = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return jsxUnder(path);
  return entry.name.endsWith('.jsx') ? [path] : [];
});
const SCANNED_FILES = jsxUnder('src').sort();

// Interpolations that are math values: expressions, terms, solved values,
// equations, matrix operation labels, and any name ending in Text or containing
// Latex (denominatorText, factorText: the scan once missed the first). Names
// (Equation 1, x, R₁) are words.
const MATH_VALUE = /expression|Expression|\boperand|\btext\b|\.text\b|\w+Text\b|factorText|placedValues|exactNumberText|\bdisplay\(|\bvalue\b|formatStandardEquation|formatLinearEquation|result\.label|OPERATION_LABEL|solutionExpressions|[Ll]atex/;
// Already words: a spoken value; a helper that makes plain language
// (termPlainText, exactPolynomialPlainText); the size of a matrix ("2 by 3");
// a value that is spoken first and only falls back to text (equation.speech ||
// equation.text).
const SPOKEN = /^\s*spoken(MathValue|MathLabel|Operation)\(|PlainText\(|^\s*dimensionsText\s*$|\.speech\s*\|\|/;

// Each `aria-label={…}` / `ariaLabel={…}` expression, braces balanced, with the
// tag it belongs to and the prop it is.
const labelExpressions = (source) => {
  const found = [];
  const pattern = /(?:aria-label|ariaLabel)=\{/g;
  let match;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      index += 1;
    }
    const tags = [...source.slice(Math.max(0, match.index - 600), match.index).matchAll(/<([A-Za-z][\w.]*)(?=[\s>/])/g)];
    found.push({
      expression: source.slice(match.index + match[0].length, index - 1),
      tag: tags.length ? tags[tags.length - 1][1] : null,
      prop: match[0].startsWith('ariaLabel') ? 'ariaLabel' : 'aria-label',
    });
  }
  return found;
};

// The `${…}` interpolations of the template literals inside one expression.
const interpolations = (expression) => {
  const found = [];
  const pattern = /\$\{/g;
  let match;
  while ((match = pattern.exec(expression))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < expression.length && depth > 0) {
      if (expression[index] === '{') depth += 1;
      else if (expression[index] === '}') depth -= 1;
      index += 1;
    }
    found.push(expression.slice(match.index + match[0].length, index - 1));
  }
  return found;
};

// MathDisplay's own ariaLabel prop is spoken by MathDisplay (mathSpeechLabel.js:
// "an authored label still wins, but it is spoken the same way"), so a raw value
// there is not read raw. Every other aria-label and ariaLabel is the name.
export const rawMathInLabels = (source) => labelExpressions(executableSource(source))
  .filter(({ tag, prop }) => !(tag === 'MathDisplay' && prop === 'ariaLabel'))
  .flatMap(({ expression }) => interpolations(expression))
  .filter((inner) => MATH_VALUE.test(inner) && !SPOKEN.test(inner));

// The control names that still interpolate a math value without speaking it,
// found by the scan and not fixed yet. Each is a real finding or a plain false
// alarm, with the reason; none is added without one, and an entry that is no
// longer an offender must go (the next test says so). The two in
// RelationStructureTools are matched by their raw text in
// tests/browser/capabilityCertification.mjs, so the fix carries a driver edit.
// The tool files are the tools work in flight's to change.
const KNOWN_RAW_LABELS = [
  { file: 'src/RelationStructureTools.jsx', inner: 'distribution.factorText', why: 'a button name that capabilityCertification.mjs finds by its raw text ("Pick up the multiplier -3"): change both' },
  { file: 'src/RelationStructureTools.jsx', inner: "term.text.replace(/^\\+\\s*/, '')", why: 'a button name that capabilityCertification.mjs finds by its raw text ("Place the multiplier on - 4"): change both' },
  { file: 'src/tools/expressionMeaning/ExpressionMeaning.jsx', inner: 'expr.expression', why: '"Edit the meaning of …" names an expression raw (a tool file)' },
  { file: 'src/tools/intervalNumberLine/IntervalNumberLine.jsx', inner: 'rationalLabel(pending.value)', why: 'a number such as 3/2 is read "3 slash 2" (a tool file)' },
  { file: 'src/tools/representationBridge/process/ProcessBoardParts.jsx', inner: "pointLatex(record.point).replace(/\\\\frac\\{(-?\\d+)\\}\\{(\\d+)\\}/g, '$1/$2')", why: 'a point such as (1/2, 3) is read raw (a tool file)' },
  { file: 'src/components/student/SectionRecoveryPanel.jsx', inner: 'value', why: 'a percentage ("mastery 80%"), not mathematics: a false alarm of the word "value"' },
];
const offendersIn = (file) => rawMathInLabels(readFileSync(join(ROOT, file), 'utf8')).map((inner) => ({ file, inner }));

test('no control name in the student app interpolates a math value without speaking it', () => {
  const known = (offender) => KNOWN_RAW_LABELS.some((entry) => entry.file === offender.file && entry.inner === offender.inner);
  const offenders = SCANNED_FILES.flatMap(offendersIn).filter((offender) => !known(offender)).map(({ file, inner }) => `${file}: \${${inner}}`);
  assert.ok(SCANNED_FILES.length > 250, `${SCANNED_FILES.length} files under src/ are read`);
  assert.deepEqual(offenders, [], 'pass math values through spokenMathValue (src/tools/shared/spokenMathValue.js)');
});

test('KNOWN_RAW_LABELS stays true: every entry is still an offender, and says why in one line', () => {
  const found = new Set(SCANNED_FILES.flatMap(offendersIn).map(({ file, inner }) => `${file}|${inner}`));
  for (const { file, inner, why } of KNOWN_RAW_LABELS) {
    assert.ok(found.has(`${file}|${inner}`), `${file}: \${${inner}} is no longer an offender (fixed, or moved): delete its entry`);
    assert.match(why, /^[^\n]{12,}$/, `${file}: give the reason in one line`);
  }
});

test('the scan sees the shapes it guards (it can fail)', () => {
  // The old substitution token, the old distribution target, and a ternary.
  assert.equal(rawMathInLabels('<b aria-label={`Pick up the expression ${expression} from the isolated equation`} />').length, 1);
  assert.equal(rawMathInLabels('<b aria-label={placed ? `Factor applied to ${term.text}` : `Apply the factor to ${term.text}`} />').length, 2);
  assert.equal(rawMathInLabels('<T ariaLabel={`Pick up solved value ${exactNumberText(v)} for ${name}`} />').length, 1);
  // Spoken values and plain names pass.
  assert.equal(rawMathInLabels('<b aria-label={`Pick up the factor ${spokenMathValue(state.factorText)}`} />').length, 0);
  assert.equal(rawMathInLabels('<b aria-label={`Isolate ${v} in ${equationName(index)}`} />').length, 0);
});

test('the scan also sees a name ending in Text, and lets through what is already words (CI01, VH-23)', () => {
  // denominatorText (StepAlgebraStructureTools) was missed: it is neither "text" nor "expression".
  assert.equal(rawMathInLabels('<button aria-label={`Pick up the denominator ${active.denominatorText}`} />').length, 1);
  assert.equal(rawMathInLabels('<button aria-label={`Pick up the denominator ${spokenMathValue(active.denominatorText)}`} />').length, 0);
  // Plain-language helpers, a matrix size, and a spoken value with a text fallback are words.
  assert.equal(rawMathInLabels('<b aria-label={`Row ${termPlainText(row)} by ${termPlainText(column)}`} />').length, 0);
  assert.equal(rawMathInLabels('<b aria-label={`${spokenName}, ${dimensionsText}`} />').length, 0);
  assert.equal(rawMathInLabels('<b aria-label={`The line ${equation?.speech || equation?.text || \'\'}`} />').length, 0);
  // MathDisplay speaks its own ariaLabel; the same raw value on a button's name is read raw.
  assert.equal(rawMathInLabels('<MathDisplay value={latex} ariaLabel={`Given point ${point.latex}`} />').length, 0);
  assert.equal(rawMathInLabels('<button aria-label={`Given point ${point.latex}`}><MathDisplay value={latex} /></button>').length, 1);
  assert.equal(rawMathInLabels('<Chip ariaLabel={`Given point ${point.latex}`} />').length, 1, 'another component\'s ariaLabel is a name');
});

// AX40: Step Algebra's cancellation area was the same "Cancellation
// workspace" on every step, and a micro-question's box was named only by its
// placeholder, "Algebraic expression". Each now says what it is about.
test('Step Algebra names its cancellation area by the side it cancels, and each micro-question box by its question', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  assert.match(core, /role="group"\s*aria-label=\{`Cancellation on the \$\{side\} side: \$\{spokenMathValue\(sideExpression\(side\)\)\}\. Draw through matching factors\.`\}/);
  assert.doesNotMatch(core, /aria-label="Cancellation workspace\./);
  assert.match(core, /const heading = prompt\.prompt \|\| prompt\.label \|\| `Simplify expression \$\{index \+ 1\}`;/);
  assert.match(core, /placeholder="Algebraic expression" ariaLabel=\{`Answer to \$\{spokenMathValue\(heading\)\}`\}/);
  // What those names say, for the shapes they carry.
  assert.equal(`Answer to ${spokenMathValue('Expand $2(x+1)$.')}`, 'Answer to Expand 2 times the quantity x plus 1.');
  assert.equal(`Cancellation on the left side: ${spokenMathValue('6x/3')}. Draw through matching factors.`, 'Cancellation on the left side: 6 x over 3. Draw through matching factors.');
});
