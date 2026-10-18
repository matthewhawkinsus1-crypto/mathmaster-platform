/*
 * STUDENT PASS 3, TOOL-12: "INFORMATION YOU NEED" IN WORK VIEW.
 *
 * The question's reference card sat inside the task card, which Work View
 * hides, so a student who enlarged the work lost the numbers the question
 * gives (QuestionEngine renders it only through `taskContextPanel`). It is now
 * a Work View capability, `reference`, built on W4-1's drawer: its own header
 * button and drawer, or on a phone a labelled group inside the Task drawer.
 * It is the question's content, so no activity withholds it.
 *
 * tests/browser/workViewReference.mjs reads it from the accessibility tree at
 * 1366x768 and 390x844, on practice and on a DOL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { mergeWorkViewCapabilities, workViewCapabilitySummary, WORK_VIEW_CAPABILITIES } from '../../src/platform/workView/workViewCapabilities.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const code = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the reference is a capability the platform owns', () => {
  assert.ok(WORK_VIEW_CAPABILITIES.includes('reference'));
  const card = { content: 'A taxi charges a $3 pickup fee.', authoritative: true };
  // A tool below cannot replace the question's reference…
  assert.equal(mergeWorkViewCapabilities({ reference: card }, { reference: { content: 'tool text' } }).reference, card);
  // …it survives an authoritative Help that withholds the method (a DOL)…
  const dol = mergeWorkViewCapabilities({ reference: card, help: { authoritative: true, withholdsMethod: true } }, { help: { text: 'Use inverse operations.' } });
  assert.equal(dol.reference, card);
  assert.equal(dol.toolHelp, undefined, 'while the tool\'s method stays out (W4-1)');
  // …and no reference means none.
  assert.equal(mergeWorkViewCapabilities({}, {}).reference, undefined);
  // PLATFORM ONLY (W5-2 review N3): nothing withholds the reference on an
  // assessment, so a tool's own text can never become "Information you need" —
  // not beside the platform's, not where the platform has none, not through
  // the published port. Only QuestionEngine's (authoritative) is kept.
  const method = { content: 'Use inverse operations in reverse order.' };
  assert.equal(mergeWorkViewCapabilities({}, { reference: method }).reference, undefined);
  assert.equal(mergeWorkViewCapabilities({ reference: method }, {}).reference, undefined);
  assert.equal(mergeWorkViewCapabilities({}, { reference: card }).reference, card, 'QuestionEngine, the top provider');
  assert.equal(mergeWorkViewCapabilities(mergeWorkViewCapabilities({}, { reference: card }), { reference: method }).reference, card);
  assert.ok(workViewCapabilitySummary({ reference: card }).includes('reference'));
});

test('QuestionEngine publishes "Information you need" to Work View whenever the question has one', () => {
  const engine = code('src/QuestionEngine.jsx');
  const capabilities = region(engine, '<WorkViewCapabilityProvider capabilities={{', '}}>', 'the Work View capabilities');
  assert.match(capabilities, /reference: referenceInfo \? \{ content: <ReferenceInfoCard referenceInfo=\{referenceInfo\} \/>, authoritative: true \} : null,/);
  // The same card, from the same resolved info, as the page shows.
  assert.match(engine, /const questionReferencePanel = referenceInfo\s*\? <ReferenceInfoCard referenceInfo=\{referenceInfo\} \/>/);
  assert.match(engine, /^import ReferenceInfoCard from '\.\/ReferenceInfoCard';$/m);
});

const renderShell = async (capabilities) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { WorkViewCapabilityProvider } = await server.ssrLoadModule('/src/platform/workView/workViewCapabilities.js');
    const { default: EnlargeableFigure } = await server.ssrLoadModule('/src/components/common/EnlargeableFigure.jsx');
    return renderToStaticMarkup(React.createElement(WorkViewCapabilityProvider, { capabilities },
      React.createElement(EnlargeableFigure, { label: 'Question Work View', openEnlarged: true }, React.createElement('p', null, 'the work'))));
  } finally {
    await server.close();
  }
};

test('enlarged, the shell has a Reference button and drawer holding the card as a labelled group', async () => {
  const card = React.createElement('aside', { 'data-card': '' }, 'A taxi charges a $3 pickup fee.');
  const html = await renderShell({ task: { text: 'Graph the cost.', authoritative: true }, reference: { content: card, authoritative: true } });
  assert.match(html, /<button type="button" data-work-view-reference="" aria-expanded="false">Reference<\/button>/);
  const drawer = html.slice(html.indexOf('aria-label="Reference"'));
  assert.ok(html.includes('aria-label="Reference"'), 'a drawer named Reference');
  assert.match(drawer, /^aria-label="Reference"><div role="group" aria-label="Information you need" data-work-view-reference=""><aside data-card="">A taxi charges a \$3 pickup fee\.<\/aside><\/div><\/section>/);
  // Nothing when the question has no reference card.
  const none = await renderShell({ task: { text: 'Graph the cost.', authoritative: true } });
  assert.doesNotMatch(none, /Reference|Information you need/);
});

test('on a phone the card opens inside the Task drawer, with no fourth header button', () => {
  const figure = code('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /const referenceInTask = Boolean\(reference && task && viewport\.mode === 'mobile'\);/);
  assert.match(figure, /\{reference && !referenceInTask \? <button type="button" data-work-view-reference="" aria-expanded=\{drawer === 'reference'\}/);
  const taskDrawer = region(figure, 'aria-label="Original task">', '</section>', 'the Task drawer');
  assert.match(taskDrawer, /\{referenceInTask \? referenceNode : null\}/);
  // Rendered only while enlarged: the page under Work View already shows it.
  assert.match(figure, /const referenceNode = reference && enlarged\s*\?/);
  // Not one of the "In this view" caption words.
  assert.match(figure, /\.filter\(\(name\) => name !== 'reference'\)/);
});
