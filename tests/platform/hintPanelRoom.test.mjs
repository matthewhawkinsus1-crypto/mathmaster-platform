/*
 * STUDENT PASS 3, HELP-21: THE HELP PANEL KEEPS CLEAR OF "⤢ ENLARGE QUESTION",
 * AND A HINT PLUS THE WORKED EXAMPLE NO LONGER PUSH THE QUESTION OFF SCREEN.
 *
 * Live walkthrough LIVE-4: opened at the top of the work, the help panel's
 * first line ran under the Enlarge button ("…noted with your attem|p") at
 * 1366x768. LIVE-5: a hint and then "Try a similar one" put the answer box at
 * y≈916 on a 768px screen. The panel (and the "open in another tab" notice)
 * now stop short of the button when they start the work, or on a phone start
 * below it; with the example open, the hints read before it fold to one line,
 * and the example folds away once read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a panel that starts the work stops short of the Enlarge button, or on a phone starts below it', () => {
  const css = executableSource(read('src/components/common/WorkViewShell.css'));
  const lead = '.mathmaster-work-view-surface[data-enlarged="false"] > .mathmaster-question-tool-workspace > .mathmaster-top-panel-row:first-child';
  const desktop = region(css, `${lead} > .mathmaster-hint-panel,\n${lead} > .mathmaster-paused-panel {`, '}', 'the desktop reservation');
  assert.match(desktop, /max-width:\s*min\(860px, calc\(100% - 2 \* var\(--mm-work-view-opener-space, 176px\)\)\);/, 'centred, and short of the button on both sides');
  assert.match(desktop, /box-sizing:\s*border-box;/);
  const phone = region(css, '@media (max-width: 600px) {\n  .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-multipart-heading', '\n}\n', 'the phone reservations');
  const row = region(phone, `${lead} {`, '}', 'the phone row');
  // Padding on the row: a margin on the panel collapses through the work area
  // and the surface, and moves the button down with it.
  assert.match(row, /padding-top:\s*var\(--mm-work-view-opener-bottom, 52px\);/);
  assert.doesNotMatch(phone, /mathmaster-(hint|paused)-panel[^{]*\{[^}]*margin-top/, 'never a top margin on the panel itself');
  assert.match(region(phone, `${lead} > .mathmaster-hint-panel,`, '}', 'the phone panel'), /max-width:\s*none;/, 'the full width on a phone');
  // The base size lives in the stylesheet, where these rules can reach it.
  assert.match(region(css, '.mathmaster-hint-panel,\n.mathmaster-paused-panel {', '}', 'the panel size'), /margin:\s*0 auto 12px;[\s\S]*max-width:\s*860px;/);

  // Each panel is a row of its own, directly in the work area, with no
  // inline size for the rules to fight.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // The top placement of the panel (FB10: under a miss it is drawn in the
  // results area instead, never both; hintPanelPlace decides).
  const hint = region(engine, "{hintPanelOpen && hintPanelPlace === 'top' && hintPanel ? (", ') : null}', 'the hint panel');
  assert.match(hint, /<div className="mathmaster-top-panel-row">\s*<div ref=\{hintPanelRef\} className="mathmaster-hint-panel" style=\{\{([^}]*)\}\}>/);
  const paused = region(engine, '{pausedByAnotherTab ? (', 'Continue here', 'the paused notice');
  assert.match(paused, /<div className="mathmaster-top-panel-row">\s*<div\s+role="status"\s+data-active-work-paused="true"\s+className="mathmaster-paused-panel"/);
  for (const [label, block] of [['hint', hint], ['paused', paused]]) {
    const style = block.match(/style=\{\{([^}]*)\}\}/)[1];
    assert.doesNotMatch(style, /maxWidth|margin:/, `the ${label} panel carries no inline width or margin`);
  }
  const workspace = region(engine, 'className="mathmaster-question-tool-workspace"', '{resolutionFailurePanel ||', 'the start of the work area');
  assert.ok(workspace.includes("{hintPanelOpen && hintPanelPlace === 'top' && hintPanel ? ("), 'the help panel is a direct child of the work area');
});

const withHintPanel = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run((await server.ssrLoadModule('/src/platform/supports/hints/HintPanel.jsx')).default);
  } finally {
    await server.close();
  }
};

const HINTS = [{ text: 'Find a number that divides 6 and 8.', source: 'authored' }, { text: 'Divide the top and the bottom by 2.', source: 'authored' }];
const SIMILAR = { prompt: 'Write 10/15 in lowest terms.', steps: ['5 divides 10 and 15.', '10 ÷ 5 = 2 and 15 ÷ 5 = 3.'], answer: '2/3' };
const RELEASE = { canRevealNext: true, waitingForAttempt: false };

test('with the worked example open, the hints read before it fold to one line', async () => {
  await withHintPanel((HintPanel) => {
    const render = (props) => renderToStaticMarkup(React.createElement(HintPanel, { hints: HINTS, release: RELEASE, similar: SIMILAR, onReveal: () => {}, onOpenSimilar: () => {}, ...props }));
    // The example closed: the hints read are shown, and the example offered.
    const before = render({ revealed: 1, similarOpen: false });
    assert.match(before, /<ol start="1"[^>]*><li data-hint-source="authored"[^>]*>/);
    assert.doesNotMatch(before, /data-hints-folded/);
    assert.match(before, />Try a similar one<\/button>/);
    // The example open: the hint read before it is one line, folded; the
    // example is open and can be folded once read.
    const after = render({ revealed: 1, similarOpen: true });
    assert.match(after, /<details data-hints-folded=""><summary[^>]*>The hint you read<\/summary>/);
    assert.doesNotMatch(after, /<details data-hints-folded="" open/, 'folded, not open');
    assert.match(after, /<details open="" data-similar-example=""[^>]*><summary[^>]*>A similar problem, worked out<\/summary>/);
    assert.doesNotMatch(after, />Try a similar one<\/button>/);
    assert.match(render({ revealed: 2, similarOpen: true }), /<summary[^>]*>The 2 hints you read<\/summary>/);
    // Nothing to fold, nothing folded.
    assert.doesNotMatch(render({ revealed: 0, similarOpen: true }), /data-hints-folded/);
  });
  // A hint revealed after the example opened is new: it shows, numbered on.
  const panel = executableSource(read('src/platform/supports/hints/HintPanel.jsx'));
  assert.match(panel, /if \(fold\.exampleOpen !== exampleOpen\) setFold\(\{ exampleOpen, before: exampleOpen \? revealed : 0 \}\);/);
  assert.match(panel, /const folded = exampleOpen \? shown\.slice\(0, fold\.before\) : \[\];/);
  assert.match(panel, /const fresh = shown\.slice\(folded\.length\);/);
  assert.match(panel, /\{fresh\.length \? hintList\(fresh, folded\.length\) : null\}/);
  assert.match(panel, /<ol start=\{start \+ 1\}/);
});
