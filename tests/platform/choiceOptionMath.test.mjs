/*
 * A CHOICE OPTION THAT IS ONE SPAN OF TYPESET MATHEMATICS IS NOT RAW LATEX
 * (TT18).
 *
 * Every option of an audited bank item is written "$4x-5y=19$". The choice
 * renderer (MultiAnswerGrader's ChoiceFieldOptions) draws an option that holds
 * no ordinary word as typeset mathematics, after MathDisplay removes the one
 * outer $…$ pair, so the student never sees a dollar sign. Pre-Flight read the
 * same string as plain UI text and warned "raw LaTeX" on every such item, a
 * warning no teacher could act on: it showed on an Honors class's build of
 * Algebra I Lesson 3, and it would have shown on the standalone Honors file.
 *
 * An option with words and mathematics together ("$y\ge 2x+1$ and
 * $y\le -x+3$", "the observed $x$-values"), more than one span, or one span
 * of LaTeX the word test reads as words ("$\frac{1}{2}$") was drawn as plain
 * text, dollar signs and LaTeX and all: 466 options of the CCMR bank, the
 * audited SAT inequality items among them (PR #537, "Known, not changed
 * here"). It is now drawn as MathText, the words as words and each span
 * typeset, as a field label is, and named by its mathematics as characters;
 * Pre-Flight no longer calls it raw. LaTeX outside every span is still shown
 * raw and still warned about, and a price is still a price. Pinned at the
 * boundary the student meets: the rendered field and its accessible names,
 * and the Pre-Flight verdict.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { readFileSync, readdirSync } from 'node:fs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { choiceShowsMixedMath, resolveLabelFormat } from '../../src/labelFormat.js';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';

let vite = null;
let MultiAnswerGrader = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  MultiAnswerGrader = (await vite.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
});
after(async () => { await vite?.close(); });

const choiceQuestion = (options, extra = {}) => ({
  type: 'multiAnswer',
  prompt: 'Which one is it?',
  answerFields: [{ id: 'answer', label: 'Choose the correct answer', type: 'choice', inputProfile: 'choice', options, answer: options[0] }],
  ...extra,
});
const render = (question) => renderToStaticMarkup(React.createElement(MultiAnswerGrader, {
  question,
  onStateChange: () => {},
  onUndoStateChange: () => {},
  feedback: null,
  draftKey: null,
}));
const visibleText = (html) => html.replace(/<span class="mm-math-spoken"[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '');
const rawLatexWarnings = (question) => validateQuestionSemantics(question, { label: 'Question 1' }).warnings.filter((warning) => /raw LaTeX/.test(warning));

test('an option that is one $…$ span of mathematics is drawn as mathematics, never with dollar signs, and Pre-Flight does not call it raw LaTeX', () => {
  const question = choiceQuestion(['$4x-5y=19$', '$5x+4y=-7$', '$-7/2$', '$\\pi$', '$$x^2$$']);
  const html = render(question);
  assert.ok(!visibleText(html).includes('$'), 'no option shows a dollar sign');
  assert.ok(!/aria-label="[^"]*\$/.test(html), 'no accessible name carries one');
  assert.match(html, /aria-label="4x-5y=19"/, 'the option is named by its mathematics');
  assert.deepEqual(rawLatexWarnings(question), []);
});

// Each option's button in the rendered field.
const buttons = (html) => html.split('<button').slice(1).map((chunk) => `<button${chunk.split('</button>')[0]}</button>`);
const mathSpans = (button) => (button.match(/<math-span\b/g) || []).length;
const wordsOutsideMath = (button) => button.replace(/<math-span\b[\s\S]*?<\/math-span>/g, ' ').replace(/<span class="mm-math-spoken"[\s\S]*?<\/span>/g, ' ').replace(/<[^>]+>/g, ' ');

test('an option with words and mathematics, or LaTeX the word test reads as words, is drawn as words and typeset mathematics, named without dollar signs, and Pre-Flight does not warn', () => {
  const MIXED = [
    ['$x$ or $y$', 2, ['or']], ['Both $x$ and $y$', 2, ['Both', 'and']], ['$x$ is 4', 1, ['is 4']], ['$4x$ + 5', 1, ['+ 5']],
    ['$\\frac{1}{2}$', 1, []], ['$\\begin{cases}x+y=3\\\\x-y=1\\end{cases}$', 1, []],
    // The audited SAT inequality items, and a sentence from the bank.
    ['$y\\ge 2x+1$ and $y\\le -x+3$', 2, ['and']], ['It is an extrapolation beyond the observed $x$-values.', 1, ['It is an extrapolation beyond the observed', '-values.']],
  ];
  for (const [option, spans, words] of MIXED) {
    const question = choiceQuestion([option]);
    const [button] = buttons(render(question));
    assert.ok(!visibleText(button).includes('$'), `${option}: no dollar sign on the screen`);
    assert.equal(mathSpans(button), spans, `${option}: each span typeset`);
    words.forEach((word) => assert.ok(wordsOutsideMath(button).includes(word), `${option}: "${word}" stays words`));
    const name = /aria-label="([^"]*)"/.exec(button)[1];
    assert.ok(!/[$\\]/.test(name), `${option}: named "${name}", without dollar signs or backslashes`);
    assert.deepEqual(rawLatexWarnings(choiceQuestion(['$4x-5y=19$', option])), [], `${option}: not raw`);
  }
  // Named as a person reads them.
  const named = (option) => /aria-label="([^"]*)"/.exec(buttons(render(choiceQuestion([option])))[0])[1];
  assert.equal(named('$y\\ge 2x+1$ and $y\\le -x+3$'), 'y≥ 2x+1 and y≤ -x+3');
  assert.equal(named('$\\begin{cases}x+y=3\\\\x-y=1\\end{cases}$'), 'x+y=3; x-y=1');
});

test('a price is still a price, and LaTeX outside every span is still raw and still warned about', () => {
  const [price] = buttons(render(choiceQuestion(['$20 grocery cards'])));
  assert.equal(mathSpans(price), 0);
  assert.ok(visibleText(price).includes('$20 grocery cards'), 'the price keeps its dollar sign');
  assert.match(price, /aria-label="\$20 grocery cards"/);
  const stray = choiceQuestion(['$4x-5y=19$', '\\theta or $x$']);
  assert.ok(visibleText(render(stray)).includes('\\theta'), 'the command outside the span is shown as written');
  assert.ok(rawLatexWarnings(stray).length > 0, 'and Pre-Flight still warns');
});

test('every option of the CCMR bank with mathematics in it is drawn typeset, whole or as words and spans, and Pre-Flight passes it', () => {
  const root = new URL('../../drafts/ccmr-v2.1/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((file) => file.endsWith('.json') && !file.includes('audit-results'));
  let options = 0;
  for (const file of files) {
    const bank = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    for (const document of bank.documents || []) {
      // A version's numbers do not change where its mathematics is.
      const labels = (document.choices || []).map((choice) => String(typeof choice === 'string' ? choice : choice?.label ?? '').replace(/\{\{[^}]+\}\}/g, '3'));
      const withMath = labels.filter((label) => splitMathSegments(label).some(isMathSegment));
      if (!withMath.length) continue;
      options += withMath.length;
      withMath.forEach((label) => {
        const spans = splitMathSegments(label);
        const whole = spans.length === 1 && isMathSegment(spans[0]) && resolveLabelFormat(label) !== null;
        assert.ok(whole || choiceShowsMixedMath(label), `${document.id}: "${label}" is drawn typeset`);
      });
      assert.deepEqual(rawLatexWarnings(choiceQuestion(labels)), [], `${document.id}: ${labels.join(' | ')}`);
    }
  }
  assert.ok(options > 2000, `${options} options with mathematics`);
});

test('the exemption is for the options of a choice field in a multiAnswer question, not for any text that looks like math', () => {
  // Math written into a hint, or a label, is UI text and still warns.
  assert.ok(rawLatexWarnings({ ...choiceQuestion(['4', '5']), supportHints: ['Try $4x-5y=19$ first.'] }).length > 0, 'a hint with $…$ still warns');
  const label = choiceQuestion(['4', '5']);
  label.answerFields[0].label = 'Value of \\theta';
  assert.ok(rawLatexWarnings(label).length > 0, 'a label with LaTeX still warns');
  // Only multiAnswer's fields are drawn by the choice renderer that typesets them.
  assert.deepEqual(rawLatexWarnings(choiceQuestion(['$4x-5y=19$', '$5x+4y=-7$'])), [], 'in a multiAnswer question: exempt');
  assert.ok(rawLatexWarnings(choiceQuestion(['$4x-5y=19$', '$5x+4y=-7$'], { type: 'algebra' })).length > 0, 'the same fields on another question type are not');
  // A key that is not one of the options is not exempt.
  const stray = choiceQuestion(['$4x-5y=19$', '$5x+4y=-7$']);
  stray.answerFields[0].answer = '$9x-1y=3$';
  assert.ok(rawLatexWarnings(stray).length > 0, 'a key that is none of the options still warns');
});
