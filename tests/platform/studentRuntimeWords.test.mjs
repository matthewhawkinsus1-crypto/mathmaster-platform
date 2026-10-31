/*
 * THE WORDS A STUDENT READS INSIDE A QUESTION (student pass 3, RUN-16 and
 * RUN-22; findings A3-51, A3-53, VH-32).
 *
 *   A3-51   the step-by-step solver's "could not be loaded" panel printed the
 *           parser's own message ("Details for your teacher: …") to a student
 *   A3-53   two different sets of tools were both called "Support tools"
 *   VH-32   Work View's "In this view: …" caption was built from capability
 *           keys ("Numeric controls", "Edit mathematical objects")
 *
 * Every rule is held to what a student is shown: the real components are
 * rendered through Vite (the way the engine tests are) and their markup read.
 * The words themselves are src/platform/student/studentWords.js.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { buttonsOf, render, text, withBrowser } from './helpers/studentToolRender.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { WORK_VIEW_CAPABILITIES } from '../../src/platform/workView/workViewCapabilities.js';
import {
  LANGUAGE_TOOLS, SUPPORT_TOOLS, WORK_VIEW_CAPABILITY_WORDS, workViewCapabilityWord,
} from '../../src/platform/student/studentWords.js';

after(closeEngine);

/* ------------------------------------------------------------------ A3-51 */

test('A3-51: a student never reads the parser\'s message on the solver\'s "could not be loaded" panel; a teacher\'s preview does', async () => {
  const { server } = await loadEngine();
  const { UnreadableEquationPanel, getInitialEquation } = await server.ssrLoadModule('/src/StepByStepAlgebraCore.jsx');
  // The real message the parser gives for an equation it cannot read.
  const { equation, error } = getInitialEquation({ id: 'bad', type: 'stepAlgebra', equation: '3x + 4 = 10 = 7' }, null);
  assert.equal(equation, null);
  assert.match(error, /one equals sign/, 'the parser\'s own developer sentence');

  const student = text(renderToStaticMarkup(React.createElement(UnreadableEquationPanel, { parseError: error })));
  assert.match(student, /This question could not be loaded/);
  assert.match(student, /Nothing you did caused this and your grade is not affected\. Let your teacher know/);
  assert.doesNotMatch(student, /equals sign|Details for your teacher|require one equation/i, 'nothing from the parser reaches a student');

  const teacher = text(renderToStaticMarkup(React.createElement(UnreadableEquationPanel, { parseError: error, teacherView: true })));
  assert.match(teacher, /This question could not be loaded/);
  assert.ok(teacher.includes(`Details for your teacher: ${error}`), 'the person who can fix the question gets the details');

  // No details to give: nothing is added, for either audience.
  assert.doesNotMatch(text(renderToStaticMarkup(React.createElement(UnreadableEquationPanel, { teacherView: true }))), /Details for your teacher/);
});

/* ------------------------------------------------------------------ A3-53 */

test('A3-53: the header\'s "Support tools" and the tray under a question are told apart by name', async () => {
  const { server } = await loadEngine();
  const { default: StudentSupportTools } = await server.ssrLoadModule('/src/components/student/StudentSupportTools.jsx');
  const { default: SupportToolsTray } = await server.ssrLoadModule('/src/components/student/supportTools/SupportToolsTray.jsx');
  const { default: SecureSupportToolsTray } = await server.ssrLoadModule('/src/components/assessment/SecureSupportToolsTray.jsx');

  const profile = buildSupportProjection({
    revisions: [{
      id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', inclusionStatus: false, modifications: [],
      accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }, { id: 'calculator', params: {}, appliesTo: [] }],
    }],
    todayKey: '2026-09-30',
  });
  const header = await withBrowser(() => render(React.createElement(StudentSupportTools, { profile, nowValue: Date.parse('2026-09-30T15:00:00Z') })));
  const headerName = buttonsOf(header)[0]?.text.replace(/\s*[▴▾]\s*$/, '');
  assert.equal(headerName, SUPPORT_TOOLS, 'the header list: the student\'s supports and their teacher\'s materials');

  const entitlement = { tools: ['read-aloud'], language: null, universal: [] };
  const tray = await withBrowser(() => render(React.createElement(SupportToolsTray, { entitlement, prompt: 'Find the value of x.' })));
  const trayName = /role="group" aria-label="([^"]*)"/.exec(tray)?.[1];
  assert.equal(trayName, LANGUAGE_TOOLS, 'the tray under a question');
  assert.ok(text(tray).startsWith(LANGUAGE_TOOLS), `the caption above its buttons says the same: ${text(tray)}`);

  const secure = await withBrowser(() => render(React.createElement(SecureSupportToolsTray, { entitlement, prompt: 'Find the value of x.', itemKey: 'item-1' })));
  assert.equal(/role="group" aria-label="([^"]*)"/.exec(secure)?.[1], LANGUAGE_TOOLS, 'the same tray on a secure test');
  assert.ok(text(secure).startsWith(LANGUAGE_TOOLS));

  // Two names, neither inside the other: a screen reader hears two things.
  assert.notEqual(headerName, trayName);
  assert.ok(!headerName.includes(trayName) && !trayName.includes(headerName));
});

test('A3-53: Work View\'s drawer for the tray is named like the tray, and its button and drawer share the name', async () => {
  const { server } = await loadEngine();
  const { WorkViewCapabilityProvider } = await server.ssrLoadModule('/src/platform/workView/workViewCapabilities.js');
  const { default: EnlargeableFigure } = await server.ssrLoadModule('/src/components/common/EnlargeableFigure.jsx');
  const shell = (supports) => withBrowser(() => render(React.createElement(
    WorkViewCapabilityProvider,
    { capabilities: { task: { text: 'Graph the line.', authoritative: true }, supports } },
    React.createElement(EnlargeableFigure, { label: 'Question Work View', openEnlarged: true }, React.createElement('p', null, 'the work')),
  )));

  // QuestionEngine hands the drawer its label; without one it is the tray's name.
  for (const supports of [{ label: LANGUAGE_TOOLS, render: () => null }, { render: () => null }]) {
    const html = await shell(supports);
    assert.match(html, new RegExp(`data-work-view-supports="true" aria-expanded="false">${LANGUAGE_TOOLS}</button>`), 'the header button');
    assert.ok(html.includes(`aria-label="${LANGUAGE_TOOLS}"`), 'the drawer it opens has the same name');
    assert.ok(!html.includes('Support tools'), 'and the header list\'s name is not used for it');
  }
  // A tool may name the drawer itself: the button and the drawer still agree.
  const named = await shell({ label: 'Words and reading', render: () => null });
  assert.match(named, /data-work-view-supports="true" aria-expanded="false">Words and reading<\/button>/);
  assert.ok(named.includes('aria-label="Words and reading"'));
});

/* ----------------------------------------------------------------- VH-32 */

test('VH-32: Work View\'s caption says what the view carries in a student\'s words, never a capability key', async () => {
  // Every capability has a word, and it is not the key split into words.
  assert.deepEqual(Object.keys(WORK_VIEW_CAPABILITY_WORDS).sort(), [...WORK_VIEW_CAPABILITIES].sort(), 'a new capability cannot ship without a word');
  for (const key of WORK_VIEW_CAPABILITIES) {
    const word = workViewCapabilityWord(key);
    assert.ok(word, key);
    assert.doesNotMatch(word, /[a-z][A-Z]/, `${key}: not a camelCase key`);
  }
  // The keys the caption can show for a tool that gives no label of its own:
  // none reads as the key split into words ("Numeric controls", "Pan zoom").
  for (const key of ['pointEditing', 'numericControls', 'equationInput', 'tableData', 'panZoom']) {
    assert.notEqual(workViewCapabilityWord(key).toLowerCase(), key.replace(/([A-Z])/g, ' $1').toLowerCase(), `${key}: not the key split into words`);
  }
  assert.equal(workViewCapabilityWord('somethingNew'), '', 'an unknown key has no word, so none is printed');
  for (const developerWord of ['Numeric controls', 'Equation input', 'Table data', 'Edit mathematical objects', 'Pan zoom']) {
    assert.ok(!Object.values(WORK_VIEW_CAPABILITY_WORDS).includes(developerWord), developerWord);
  }

  const { server } = await loadEngine();
  const { WorkViewCapabilityProvider } = await server.ssrLoadModule('/src/platform/workView/workViewCapabilities.js');
  const { default: EnlargeableFigure } = await server.ssrLoadModule('/src/components/common/EnlargeableFigure.jsx');
  const caption = async (capabilities) => {
    const html = await withBrowser(() => render(React.createElement(
      WorkViewCapabilityProvider,
      { capabilities },
      React.createElement(EnlargeableFigure, { label: 'Question Work View', openEnlarged: true }, React.createElement('p', null, 'the work')),
    )));
    return text(/<p class="mathmaster-work-view-capabilities">([\s\S]*?)<\/p>/.exec(html)?.[1] || '');
  };
  // Capabilities a tool declares without a label of its own (as the registry
  // tools do): the word list speaks for them.
  assert.equal(
    await caption({ pointEditing: true, numericControls: true, equationInput: true, tableData: true }),
    'In this view: Things you can move or change · Number boxes · Equation boxes · Tables',
  );
  // A tool that has better words for what it holds says them, and they win.
  assert.equal(
    await caption({ numericControls: { label: 'Transformation descriptions' }, tableData: { label: 'Sequence table' } }),
    'In this view: Transformation descriptions · Sequence table',
  );
  // Nothing to say, no caption.
  assert.equal(await caption({}), '');
});
