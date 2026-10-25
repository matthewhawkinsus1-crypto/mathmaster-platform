/*
 * A PRICE CHOICE KEEPS ITS DOLLAR SIGN IN EVERY CHOICE RENDERER (AX23).
 *
 * Oct 2026, matrices walkthrough: the choice "$20 grocery cards" was announced
 * "20 grocery cards" by the multi-answer grader, which built its own accessible
 * name and stripped the "$" as if it were a TeX delimiter (choiceAccessibleLabel
 * fixed it, choiceAccessibleLabel.test.mjs). This is the audit of the other
 * places a student picks one choice from a row of cards: Figure Match's
 * categories, a Live Challenge field question, and My Math Path's response
 * fields. Each is rendered for real and read the way a screen reader names a
 * radio, so the test fails for any renderer that drops, or mis-typesets, a
 * price. Two prices with a short word between ("$20 or $30") were the one that
 * did, in the shared splitter (mathSegmentsCurrency.test.mjs).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { namesOfRole } from './helpers/accessibleNames.mjs';

const PRICES = [
  '$20 grocery cards',
  '$4.50 each',
  '$25',
  '$20 or $30',
  '$20 - $30',
  'between $20 and $30',
];
const choices = PRICES.map((label, index) => ({ id: `choice-${index + 1}`, label }));

let vite;
after(async () => { await vite?.close(); });
const load = async (file, exportName = 'default') => {
  if (!vite) {
    const { createServer } = await import('vite');
    vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  }
  return (await vite.ssrLoadModule(file))[exportName];
};
const sorted = (names) => [...names].sort();

test('Figure Match names each category as written, price and all', async () => {
  const FigureMatchStage = await load('/src/platform/workflow/FigureMatchStage.jsx');
  const markup = renderToStaticMarkup(React.createElement(FigureMatchStage, {
    stage: {
      items: [{ id: 'a', text: 'A card' }, { id: 'b', text: 'Another card' }],
      categories: choices.map(({ id, label }) => ({ id, label })),
    },
    value: {},
    onChange: () => {},
  }));
  const names = namesOfRole(markup, 'radio');
  assert.equal(names.length, PRICES.length * 2, 'every figure offers every category');
  assert.deepEqual(sorted(names.slice(0, PRICES.length)), sorted(PRICES));
  assert.deepEqual(sorted(names.slice(PRICES.length)), sorted(PRICES));
});

test('a Live Challenge field question names each choice as written, price and all', async () => {
  const LiveChallengeFieldQuestion = await load('/src/components/liveChallenge/LiveChallengeFieldQuestion.jsx');
  const markup = renderToStaticMarkup(React.createElement(LiveChallengeFieldQuestion, {
    question: {
      questionInstanceId: 'ax23',
      prompt: 'Which price is the bundle?',
      responseFields: [{ id: 'price', label: 'Choose the price', inputProfile: 'choice', choices }],
    },
    disabled: false,
    onSubmit: () => {},
  }));
  assert.deepEqual(sorted(namesOfRole(markup, 'radio')), sorted(PRICES));
});

test('My Math Path\'s choice cards name each choice as written, price and all', async () => {
  const PathResponseFields = await load('/src/components/student/PathResponseFields.jsx');
  const markup = renderToStaticMarkup(React.createElement(PathResponseFields, {
    fields: [{ id: 'price', label: 'Choose the price', inputProfile: 'choice', choices }],
    values: {},
    onChangeField: () => {},
  }));
  // The A, B, C badge is decoration (aria-hidden): the name is the choice.
  assert.deepEqual(namesOfRole(markup, 'radio'), PRICES);
});

test('the multi-answer grader still does (the fix this audit was written from)', async () => {
  const MultiAnswerGrader = await load('/src/MultiAnswerGrader.jsx');
  const markup = renderToStaticMarkup(React.createElement(MultiAnswerGrader, {
    question: {
      type: 'multiAnswer',
      questionId: 'ax23',
      prompt: 'Which price is the bundle?',
      answerFields: [{ id: 'price', label: 'Price', answer: PRICES[0], options: PRICES }],
    },
    onStateChange: () => {},
  }));
  assert.deepEqual(sorted(namesOfRole(markup, 'radio')), sorted(PRICES));
});
