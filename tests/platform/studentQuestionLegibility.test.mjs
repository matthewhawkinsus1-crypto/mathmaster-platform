import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These assertions are about what the code DOES. A comment explaining why a
// mistake was fixed necessarily restates the mistake, so scanning raw source
// makes every such comment fail its own test.
const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

import { resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';
import { graphAsymptoteLines, staticGraphAsymptotes } from '../../src/graphSpecUtils.js';
import {
  answerFormatOf,
  describeAnswerFormat,
  exampleFor,
  formatHintForField,
  placeholderForField,
} from '../../src/platform/interaction/answerFormatHints.js';

test('an inequality in a prompt typesets instead of printing command text', () => {
  // "restricted to \(-3\le x<4\)" carries no \frac and no \sqrt, so the old
  // signal list called it ASCIIMath and MathLive rendered the raw command
  // joined to the next token: students read "\lex" in red, mid-sentence, in the
  // line telling them what the question wants. Every domain and range prompt on
  // the platform is written this way.
  assert.equal(resolveMathDisplayFormat('-3\\le x<4', 'auto'), 'latex');
  assert.equal(resolveMathDisplayFormat('x \\ge 2', 'auto'), 'latex');
  assert.equal(resolveMathDisplayFormat('x \\ne 0', 'auto'), 'latex');
  assert.equal(resolveMathDisplayFormat('[2, \\infty)', 'auto'), 'latex');

  // An explicit ASCIIMath request cannot override a value that is plainly LaTeX,
  // because honoring it would print the command text.
  assert.equal(resolveMathDisplayFormat('-3\\le x<4', 'ascii-math'), 'latex');
});

test('ordinary ASCIIMath is still ASCIIMath', () => {
  // The fix must not sweep every expression into the LaTeX parser: ASCIIMath is
  // what makes `x^2` and `2x-1` typeset from plain authored text.
  for (const value of ['f(x)=2x-1', 'y=0', '(f+g)(x)', '2x-1', 'x^2', '(3,0)']) {
    assert.equal(resolveMathDisplayFormat(value, 'auto'), 'ascii-math', value);
  }
});

test('an exponential graph draws the boundary its range question depends on', () => {
  // A student asked for the range of f(x)=5(3^x)-4 has to see where the curve
  // stops. Without the asymptote the graph merely looks like it flattens.
  assert.deepEqual(
    staticGraphAsymptotes({ type: 'exponential', a: 5, base: 3, k: -4 }),
    [{ axis: 'horizontal', value: -4 }],
  );
  assert.deepEqual(
    staticGraphAsymptotes({ type: 'exponential', a: 3, base: 2 }),
    [{ axis: 'horizontal', value: 0 }],
  );
  // Families with no asymptote get no phantom line.
  assert.deepEqual(staticGraphAsymptotes({ type: 'line', m: 2, b: -6 }), []);
  assert.deepEqual(staticGraphAsymptotes({ type: 'quadratic', a: 1, h: 2, k: -9 }), []);

  assert.deepEqual(staticGraphAsymptotes({ type: 'logarithmic', h: 3 }), [{ axis: 'vertical', value: 3 }]);
  assert.deepEqual(
    staticGraphAsymptotes({ type: 'rational', h: 1, k: 3 }),
    [{ axis: 'vertical', value: 1 }, { axis: 'horizontal', value: 3 }],
  );
});

test('overlapping asymptotes draw once and a teacher can switch them off', () => {
  const graph = {
    functions: [
      { type: 'exponential', a: 2, base: 2, k: 0 },
      { type: 'exponential', a: 9, base: 3, k: 0 },
    ],
  };
  assert.equal(graphAsymptoteLines(graph).length, 1);
  assert.deepEqual(graphAsymptoteLines({ ...graph, showAsymptotes: false }), []);
  assert.deepEqual(graphAsymptoteLines({}), []);
});

test('the asymptote is drawn but never labelled with its own equation', () => {
  // Several questions ask for the horizontal asymptote as a response field.
  // Drawing the boundary is reading the graph; printing "y = -4" beside it is
  // handing over the answer.
  const source = codeOf('src/GraphDisplay.jsx');
  const start = source.indexOf('graphAsymptoteLines(graph).map');
  assert.ok(start > 0, 'asymptote rendering must exist');
  const block = source.slice(start, start + 1400);
  assert.doesNotMatch(block, /<text/, 'asymptote lines must carry no text label');
  assert.match(block, /strokeDasharray/);
});

test('a response field states the shape it will accept', () => {
  // The x-intercept box already required parentheses and a comma; the zero box
  // beside it already rejected them. Neither said so, so a student who knows
  // the mathematics was marked wrong for punctuation.
  const xIntercept = describeAnswerFormat({ id: 'xint', label: 'x-intercept', answerFormat: 'orderedPair' });
  assert.equal(xIntercept.formatId, 'orderedPair');
  assert.match(xIntercept.hint, /ordered pair/i);
  assert.match(xIntercept.placeholder, /\(2, -5\)/);

  const zero = describeAnswerFormat({ id: 'zero', label: 'Zero', answerFormat: 'number' });
  assert.equal(zero.formatId, 'number');
  assert.match(zero.hint, /single number/i);

  const zeros = describeAnswerFormat({ id: 'zeros', label: 'Zeros', type: 'set', answerFormat: 'set' });
  assert.match(zeros.hint, /braces/i);
  assert.match(zeros.placeholder, /\{1, 2, 3\}/);

  assert.match(describeAnswerFormat({ answerFormat: 'equation' }).hint, /equals sign/i);
  assert.match(describeAnswerFormat({ answerFormat: 'inequality' }).hint, /inequality/i);
  assert.match(describeAnswerFormat({ answerFormat: 'interval' }).hint, /interval/i);
});

test('the hint is never derived from the expected answer', () => {
  // A hint built from the real value would be an answer leak wearing the
  // clothes of help. exampleFor takes a format id, so an answer has nowhere to
  // enter, and the example for a format never changes.
  const field = { id: 'xint', label: 'x-intercept', answerFormat: 'orderedPair', answer: '(3,0)' };
  const described = describeAnswerFormat(field);
  assert.doesNotMatch(described.placeholder, /3/);
  assert.doesNotMatch(described.hint, /3/);
  assert.equal(described.example, exampleFor('orderedPair'));

  const source = codeOf('src/platform/interaction/answerFormatHints.js');
  assert.doesNotMatch(source, /field\?\.answer\b|field\.answer\b|acceptedAnswers|expected/);
});

test('choice and free-text fields get no format sentence', () => {
  assert.equal(formatHintForField({ type: 'choice', options: ['growth', 'decay'] }), '');
  assert.equal(formatHintForField({ inputProfile: 'choice' }), '');
  assert.equal(formatHintForField({ type: 'text' }), '');
});

test('a field that declares no format is left alone rather than guessed at', () => {
  // A wrong instruction is worse than silence: the student would follow it and
  // the grader would disagree.
  assert.equal(answerFormatOf({ id: 'mystery', label: 'Something' }), '');
  assert.equal(formatHintForField({ id: 'mystery' }), '');
  assert.equal(placeholderForField({ id: 'mystery' }), 'Type your answer');
});

test('an authored placeholder outranks the generic example', () => {
  assert.equal(
    placeholderForField({ answerFormat: 'number', placeholder: 'minutes' }),
    'minutes',
  );
});

test('the several spellings the content uses all resolve to one format', () => {
  for (const spelling of ['orderedPair', 'ordered pair', 'coordinate', 'point', 'Coordinates']) {
    assert.equal(answerFormatOf({ answerFormat: spelling }), 'orderedPair', spelling);
  }
  assert.equal(answerFormatOf({ inputProfile: 'set' }), 'set');
  assert.equal(answerFormatOf({ inputContract: { format: 'inequality' } }), 'inequality');
  assert.equal(answerFormatOf({ notation: 'interval' }), 'interval');
});

test('multi-answer fields show the format they enforce', () => {
  const source = readFileSync('src/MultiAnswerGrader.jsx', 'utf8');
  assert.match(source, /describeAnswerFormat/);
  assert.match(source, /answerShape\.hint/);
  assert.match(source, /answerShape\.placeholder/);
  // The bare word "answer" as a placeholder told a student nothing about shape.
  assert.doesNotMatch(source, /placeholder=\{[^}]*'answer'\}/);
});

test('the controls a student uses while working sit with the submit button', () => {
  // Undo above a graph the student has scrolled past is undo they cannot reach,
  // and a Check button appended after a tall tool is a button they have to go
  // looking for.
  const engine = readFileSync('src/QuestionEngine.jsx', 'utf8');
  assert.match(engine, /questionWorkBar/);
  assert.match(engine, /workBar=\{questionWorkBar\}/);

  const layout = readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
  assert.match(layout, /workBar = null/);
  assert.match(layout, /mathmaster-desktop-action-bar/);
  // Mobile keeps one bar carrying both.
  assert.match(layout, /portrait-action-bar">\{workBar\}\{actionButtons\}/);
  assert.match(layout, /landscape-action-bar">\{workBar\}\{actionButtons\}/);

  const css = readFileSync('src/App.css', 'utf8');
  const bar = css.slice(css.indexOf('.mathmaster-desktop-action-bar {'));
  assert.match(bar.slice(0, 400), /position: sticky/);
  assert.match(bar.slice(0, 400), /bottom: 0/);
});

test('the attempt strip states one fact once', () => {
  // It used to read "3 attempts on this question" beside "Variant 1 · 3 of 3
  // attempts remaining" — the same number twice, plus a variant index no
  // student can act on.
  const source = codeOf('src/QuestionEngine.jsx');
  assert.doesNotMatch(source, /attempts on this question/);
  assert.doesNotMatch(source, /Variant \{record\.variantIndex/);
  assert.match(source, /mathmaster-question-attempt-strip/);
  assert.match(source, /tries'\} left/);
});

test('every control in the work bar clears the Chromebook touch minimum', () => {
  const source = readFileSync('src/QuestionEngine.jsx', 'utf8');
  const start = source.indexOf('const questionWorkBar');
  const block = source.slice(start, source.indexOf('const questionContextPanel', start));
  const buttons = block.match(/<button/g) || [];
  const heights = block.match(/minHeight: '44px'/g) || [];
  assert.equal(buttons.length, heights.length, 'each work bar button needs a 44px target');
  assert.ok(buttons.length >= 2);
});
