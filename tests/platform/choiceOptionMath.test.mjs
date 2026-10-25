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
 * An option the renderer does NOT typeset (it has a word in it, a LaTeX
 * command, or more than one span) is drawn as plain text, dollar signs and
 * all, and is still warned about. Pinned at the boundary the student meets:
 * the rendered field and its accessible names, and the Pre-Flight verdict.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

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

test('an option the renderer draws as plain text (a word, a LaTeX command, two spans) still shows its dollar signs, and Pre-Flight still warns', () => {
  for (const option of ['$x$ or $y$', 'Both $x$ and $y$', '$x$ is 4', '$\\frac{1}{2}$', '$4x$ + 5', '$a$']) {
    const question = choiceQuestion(['$4x-5y=19$', option]);
    const shown = visibleText(render(question));
    const warnings = rawLatexWarnings(question);
    // `$a$` is one span with no word: it IS typeset, so it is the control that is NOT warned about.
    if (option === '$a$') {
      assert.ok(!shown.includes('$'), `${option} is drawn as mathematics`);
      assert.deepEqual(warnings, [], `${option} is not raw`);
    } else {
      assert.ok(shown.includes('$'), `${option} is drawn with its dollar signs (${shown.slice(-120)})`);
      assert.ok(warnings.length > 0, `${option} is still warned about`);
    }
  }
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
