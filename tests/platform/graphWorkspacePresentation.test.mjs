import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  figureDismissalKey,
  isDomainRangeQuestion,
  shouldOpenFigureEnlarged,
} from '../../src/platform/student/figurePresentation.js';
import { describeAnswerFormat } from '../../src/platform/interaction/answerFormatHints.js';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const domainRange = { analysisRequests: [{ kind: 'domain' }, { kind: 'range' }] };

test('the example is no longer the part that gets cut off', () => {
  // The placeholder read "for example x ≥ 2" inside a field in a 220px rail, so
  // the student saw the words "for example" and nothing after them: the prefix
  // survived and the example, the only informative part, was clipped.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.doesNotMatch(source, /for example x ≥ 2|for example \[2, ∞\)|analysisPlaceholderFor/);
  assert.match(source, /placeholder=\{answerShape\.example\}/);
  // The words move above the field, where they can wrap.
  assert.match(source, /answerShape\.hint &&/);
  assert.match(source, /For example <strong/);
});

test('the graph workspace and the multi-answer fields describe a format the same way', () => {
  // Two implementations of "what shape does this field want" drift, and the
  // graph workspace was the one that never gained the format sentence.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /import \{ describeAnswerFormat \}/);
  assert.match(source, /const analysisAnswerShape = \(part\) => describeAnswerFormat/);

  for (const format of ['inequality', 'interval', 'set', 'orderedPair']) {
    const shape = describeAnswerFormat({ answerFormat: format });
    assert.ok(shape.hint, format);
    assert.ok(shape.example, format);
  }
});

test('the legacy format inference still decides the format', () => {
  // Older Path questions carry no answerFormat. The shared module only decides
  // how to DESCRIBE a format; losing the inference would change grading input.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /analysisAnswerFormatFor\(part\) \|\| analysisKeypadProfile\(part\)/);
  assert.match(source, /answerFormat=\{analysisAnswerFormatFor\(part\)\}/);
});

test('the exit key appears only on keypads that can open a group', () => {
  // It was appended to every profile, which put a button labelled "out" on the
  // inequality keypad — where < ≤ > ≥ are single characters and the cursor
  // never goes anywhere it needs rescuing from. That keypad is the one domain
  // and range questions use.
  const source = codeOf('src/MathInput.jsx');
  assert.match(source, /const opensAGroup = \(key\)/);
  assert.match(source, /keys\.some\(opensAGroup\) \? \[\.\.\.keys, EXIT_GROUP_KEY\] : \[\.\.\.keys\]/);

  // Derived from the keys themselves, so a pad that later gains a root or an
  // exponent gets the way out along with it.
  const opensAGroup = (command) => /#0|#\?|#@/.test(command);
  assert.equal(opensAGroup('\\sqrt{#0}'), true);
  assert.equal(opensAGroup('#@^{2}'), true);
  assert.equal(opensAGroup('\\left|#0\\right|'), true);
  assert.equal(opensAGroup('≤'), false);
  assert.equal(opensAGroup('['), false);
  assert.equal(opensAGroup('\\infty'), false);
});

test('a domain-and-range question opens in the layout written for it', () => {
  assert.equal(isDomainRangeQuestion(domainRange), true);
  assert.equal(shouldOpenFigureEnlarged({ question: domainRange, viewportWidth: 1400 }), true);
});

test('it does not open where the enlarged layout would not reshape', () => {
  // Below 1050px the three-column rule does not apply, so the panel would be a
  // full-window interruption showing the same single column.
  assert.equal(shouldOpenFigureEnlarged({ question: domainRange, viewportWidth: 900 }), false);
  assert.equal(shouldOpenFigureEnlarged({ question: domainRange, viewportWidth: 0 }), false);
  assert.equal(shouldOpenFigureEnlarged({ question: domainRange }), false);
});

test('question shapes that gain nothing are left alone', () => {
  for (const question of [
    { analysisRequests: [{ kind: 'point' }] },
    { analysisRequests: [{ kind: 'domain' }] },
    { analysisRequests: [{ kind: 'domain' }, { kind: 'range' }, { kind: 'point' }] },
    {},
  ]) {
    assert.equal(shouldOpenFigureEnlarged({ question, viewportWidth: 1400 }), false);
  }
});

test('closing an auto-opened figure is remembered, once, for that shape', () => {
  // Otherwise a student who prefers the embedded layout dismisses the same
  // panel on all thirteen questions of an assignment.
  assert.equal(shouldOpenFigureEnlarged({ question: domainRange, viewportWidth: 1400, dismissed: true }), false);
  assert.equal(figureDismissalKey(domainRange), 'mm.figure.enlarged.domainRange');
  assert.equal(figureDismissalKey({ presentEnlarged: true }), 'mm.figure.enlarged.authored');
  assert.equal(figureDismissalKey({ analysisRequests: [{ kind: 'point' }] }), null);
});

test('an author can put any question in the big layout, or keep any out', () => {
  assert.equal(shouldOpenFigureEnlarged({ question: { presentEnlarged: true }, viewportWidth: 1400 }), true);
  assert.equal(
    shouldOpenFigureEnlarged({ question: { ...domainRange, presentEnlarged: false }, viewportWidth: 1400 }),
    false,
  );
});

test('opening a figure by itself never removes a way out of it', () => {
  // A panel a student did not ask for has to be at least as easy to leave as
  // one they opened.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.target === event\.currentTarget/);
  assert.match(source, /role="dialog"/);
  // And the way out is named in full rather than shown as a bare glyph.
  assert.match(source, /Close full screen ✕/);
  assert.match(source, /openEnlarged\s*\?\s*\{ \.\.\.CONTROL, minHeight: 44/);
});

test('a dismissal that cannot be read leaves the default in place', () => {
  // A private window or blocked site data makes the read throw. The safe answer
  // to "has this been dismissed" when we cannot tell is no: the student can
  // always close the panel again, but a swallowed preference that defaults to
  // "dismissed" would silently disable the feature for them.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  const reader = source.slice(source.indexOf('const readDismissed'));
  assert.match(reader.slice(0, 320), /catch \{[\s\S]*?return false;/);
});

test('a new question decides its own presentation', () => {
  // Without this the panel keeps whatever state the previous question left it
  // in, so a student who closed one figure finds the next one embedded even
  // where it should have opened.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  assert.match(source, /setEnlarged\(openEnlarged && !readDismissed\(dismissKey\)\);/);
  assert.match(source, /\}, \[openEnlarged, dismissKey\]\);/);
});

test('the workspace re-measures rather than reading the width once', () => {
  // A Chromebook gets rotated and a window gets resized mid-question.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /addEventListener\('resize', measure\)/);
  assert.match(source, /addEventListener\('orientationchange', measure\)/);
  assert.match(source, /removeEventListener\('resize', measure\)/);
});

test('the always-open keypads stay open', () => {
  // A deliberate call: the tools are needed on every question, and on mobile
  // leaving them open saves a tap. This test exists so a later tidy-up does not
  // quietly reverse it.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /showToolsInitially/);
  assert.doesNotMatch(source, /showToolsInitially=\{activeAnalysisPartId/);
});
