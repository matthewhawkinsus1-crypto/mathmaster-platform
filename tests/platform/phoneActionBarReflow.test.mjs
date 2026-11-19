/*
 * THE QUESTION'S ACTION BAR FITS A PHONE AT ANY TEXT SIZE (WCAG 1.4.10 Reflow, 1.4.4 Resize Text, 2.5.8).
 *
 * At 200% text on a 320 to 375px phone held upright the action bar was wider than the screen: beside six tools at
 * their narrowest, Submit ran 25px past the right edge at 320x568 and 15px at 360x740, and the bar scrolled sideways
 * to show it. On every phone at 150% and 200%, and on a 320px phone at 100%, the words Undo and Start over keep under
 * their icons ran past their own buttons into the tools beside them (6px at 100%, 31px at 200%). In Work View
 * "Submit — uses 1 of 3 tries" ran 72px past its button; on a phone on its side the bar and Work View's rail scrolled
 * sideways, and the rail squeezed its buttons until their labels were drawn over each other.
 *
 * The geometry is proved in a browser by the opener sweep's room check (tests/browser/workViewOpenerCover.mjs
 * --check=room, ACTION_BARS: the real App on five phones held upright at 100% to 200% text and two on their side at
 * 200%) and, at 100% text, by tests/browser/workBarPrimaryLabel.mjs. Nothing here lays a page out, so this binds the
 * rules that geometry depends on, as a phone's browser resolves them (helpers/cssCascade.mjs). Each assertion was
 * broken once to see it go red (see the commit).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss, declared, rulesFor } from './helpers/cssRules.mjs';
import { atRuleHolds, winning } from './helpers/cssCascade.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const layout = { name: 'MathToolMobileLayout.css', rules: parseCss(read('src/components/student/MathToolMobileLayout.css')) };
const submitCost = { name: 'SubmitCost.css', rules: parseCss(read('src/components/student/SubmitCost.css')) };
const shell = { name: 'WorkViewShell.css', rules: parseCss(read('src/components/common/WorkViewShell.css')) };
const ORDERS = { 'SubmitCost.css first': [submitCost, layout], 'SubmitCost.css last': [layout, submitCost] };

const phone = (width, height, scale = 1) => ({ width, height, fontSize: 16 * scale, pointer: 'coarse' });
const named = (device) => `${device.width}x${device.height} at ${device.fontSize / 16 * 100}%`;
const UPRIGHT = [[320, 568], [360, 740], [375, 667], [390, 844], [412, 915]];
// Every phone held upright at 150% and 200% text, and the 320 to 380px phones at 125%.
const LARGE = [...UPRIGHT.flatMap(([width, height]) => [phone(width, height, 1.5), phone(width, height, 2)]), phone(320, 568, 1.25), phone(375, 667, 1.25)];
const DEFAULT = UPRIGHT.map(([width, height]) => phone(width, height));

const CONTAINER = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div', classes: ['mathmaster-question-container', 'mode-portrait', 'mathmaster-mobile-interaction-root'] }];
const barPath = (primary) => [...CONTAINER, { tag: 'div', classes: ['portrait-action-bar'], attrs: primary ? { 'data-has-primary': 'true' } : {} }];
const toolPath = (primary) => [...barPath(primary), { tag: 'button', classes: ['mm-button-neutral', 'mathmaster-work-bar-tool'] }];
const SUBMIT_PATH = [...barPath(true), { tag: 'button', classes: ['mathmaster-bar-submit', 'has-try-cost'] }];
const won = (path, property, device, sheets = [submitCost, layout]) => winning({ sheets, path, property, device })?.value ?? null;

const BAR = '.mathmaster-question-container.mode-portrait .portrait-action-bar';
const PRIMARY = `${BAR}[data-has-primary="true"]`;
const CROWDED = `${BAR}:not([data-has-primary="true"]):has(> .mathmaster-work-bar-tool:nth-child(5))`;
const FORM = '(max-width: 19em)';

test('below 19em a phone\'s action bar wraps onto the rows its controls need; at 100% text it is one row as before', () => {
  // An em in a media query is the browser's own text size: every phone at 150% and 200%, the 320 to 380px phones at
  // 125%, and no phone 320px or wider at 100% (20em), the line below which App.css lets the page scroll.
  for (const device of LARGE) assert.ok(atRuleHolds(`@media ${FORM}`, device), named(device));
  for (const device of [...DEFAULT, phone(390, 844, 1.25), phone(412, 915, 1.25)]) assert.ok(!atRuleHolds(`@media ${FORM}`, device), named(device));
  for (const device of LARGE) {
    for (const primary of [true, false]) {
      const at = `${named(device)}, ${primary ? 'with Submit' : 'tools alone'}`;
      assert.equal(won(barPath(primary), 'flex-wrap', device), 'wrap', at);
      assert.equal(won(barPath(primary), 'justify-content', device), 'center', `${at}: a row of tools on its own is centred`);
      // Each tool at what it shows or 28px, up to 44px where its row has room.
      assert.equal(won(toolPath(primary), 'flex', device), '1000 0 28px', at);
      assert.equal(won(toolPath(primary), 'min-width', device), 'min-content', at);
      assert.equal(won(toolPath(primary), 'max-width', device), '44px', at);
    }
  }
  // The bar of five tools or more and no Submit is one row of 44px tools at 100% (PH03), and wraps too below 19em: its
  // own rule, after the rules that make it one row, in its own query.
  assert.equal(declared(layout.rules, CROWDED, 'flex-wrap', { media: '(max-width: 600px)' })?.value, 'wrap');
  const crowdedTools = rulesFor(layout.rules, `${CROWDED} > .mathmaster-work-bar-tool`, { media: FORM });
  assert.equal(crowdedTools.length, 1);
  assert.equal(crowdedTools[0].declarations['min-width'].value, 'min-content');
  assert.ok(crowdedTools[0].atRules.some((atRule) => atRule.includes('(max-width: 600px)')), 'where the crowded rule is');
  const lastCrowded = layout.rules.findLastIndex((rule) => rule.selectors.includes(`${CROWDED} > .mathmaster-work-bar-tool`) && 'min-width' in rule.declarations);
  assert.equal(layout.rules[lastCrowded], crowdedTools[0], 'it outranks the 44px floor by coming after it at equal weight');
  // At 100% text: the bar with Submit may wrap, but only where its controls cannot all fit at their narrowest, which no
  // phone from 320px meets (workBarPrimaryLabel.test.mjs does the arithmetic); a bar of tools alone is as it was.
  for (const device of DEFAULT) {
    assert.equal(won(barPath(true), 'flex-wrap', device), 'wrap', named(device));
    assert.equal(won(toolPath(true), 'flex', device), '1000 0 28px', named(device));
    assert.equal(won(toolPath(true), 'min-width', device), 'min-content', named(device));
  }
  assert.equal(won(barPath(false), 'flex-wrap', phone(320, 568)), 'nowrap', 'tools alone below 385px, one row as before');
  assert.equal(won(toolPath(false), 'min-width', phone(320, 568)), '44px');
  assert.equal(won(barPath(false), 'flex-wrap', phone(390, 844)), 'wrap', 'four tools with their words, as before');
});

test('a tool is never narrower than what it shows, nor under the 24px target, and the row wraps rather than squeeze it', () => {
  for (const device of [...DEFAULT, ...LARGE]) {
    const [grow, shrink, basis] = won(toolPath(true), 'flex', device).split(' ');
    assert.equal(won(toolPath(true), 'min-width', device), 'min-content', named(device));
    assert.ok(Number.parseFloat(basis) >= 24, `${named(device)}: it comes into the row at ${basis}, a target WCAG 2.5.8 counts`);
    assert.equal(shrink, '0', `${named(device)}: never squeezed below that`);
    // The room a row has goes to the tools first, up to 44px each; Submit takes the rest.
    assert.ok(Number(grow) >= 100 * Number(won(SUBMIT_PATH, 'flex', device).split(' ')[0]), named(device));
  }
  // The 320px phone's own query no longer sets a floor of its own: what a tool shows, or its basis, is its floor.
  const narrow = rulesFor(layout.rules, `${PRIMARY} > .mathmaster-work-bar-tool`, { media: '(max-width: 339.98px)' });
  assert.ok(narrow.length && narrow.every((rule) => !('min-width' in rule.declarations)), 'no fixed floor below 340px');
  // Undo and Start over keep their word under the icon (A11Y-10), so their word is what they show.
  assert.equal(declared(layout.rules, `${PRIMARY} .mathmaster-action-label.mathmaster-action-label--kept`, 'position')?.value, 'static');
});

test('Submit keeps its words: over its cost where it shares a row, both on one line where its row is its own', () => {
  for (const [order, sheets] of Object.entries(ORDERS)) {
    for (const device of LARGE) {
      const at = `${order}, ${named(device)}`;
      // Its narrowest is the wider of "Submit" and "1 of 3"; a row of its own lets it lay them side by side.
      assert.equal(won(SUBMIT_PATH, 'width', device, sheets), 'min-content', at);
      assert.equal(won(SUBMIT_PATH, 'min-width', device, sheets), 'min-content', at);
      assert.equal(won(SUBMIT_PATH, 'flex-direction', device, sheets), 'row', at);
      assert.equal(won(SUBMIT_PATH, 'flex-wrap', device, sheets), 'wrap', at);
      assert.equal(won(SUBMIT_PATH, 'flex', device, sheets), '1 0 auto', `${at}: it grows into what is left of its row`);
    }
    for (const device of DEFAULT) {
      // At 100% text it is as it was: never narrower than its words, "Submit" over "1 of 3".
      assert.equal(won(SUBMIT_PATH, 'min-width', device, sheets), 'max-content', `${order}, ${named(device)}`);
      assert.equal(won(SUBMIT_PATH, 'flex-direction', device, sheets), 'column', `${order}, ${named(device)}`);
    }
  }
  // Next and Continue are one line of their own words.
  assert.equal(declared(layout.rules, `${PRIMARY} > .mathmaster-bar-continue`, 'min-width', { media: FORM })?.value, 'min-content');
  assert.match(read('src/QuestionEngine.jsx'), /className="mathmaster-bar-continue"[\s\S]{0,700}?whiteSpace: 'nowrap'/);
  // Never an ellipsis, never clipped.
  for (const rule of layout.rules.filter((entry) => entry.selectors.some((selector) => /mathmaster-bar-(submit|continue)/.test(selector)))) {
    assert.ok(!('text-overflow' in rule.declarations) && !('overflow' in rule.declarations), rule.selectors.join(', '));
  }
});

test('the bar\'s rows are short at a large text size, and every control is still 44px tall', () => {
  for (const device of LARGE) {
    for (const primary of [true, false]) {
      assert.equal(won(barPath(primary), 'padding-top', device), '4px', named(device));
      assert.equal(won(barPath(primary), 'padding-bottom', device), 'max(4px, env(safe-area-inset-bottom))', named(device));
      assert.equal(won(barPath(primary), 'gap', device), '4px', named(device));
      assert.deepEqual(winning({ sheets: [layout], path: toolPath(primary), property: 'padding-top', device })?.important, true, `${named(device)}: over the inline 9px`);
      assert.equal(won(toolPath(primary), 'padding-top', device), '2px', named(device));
      assert.equal(won(toolPath(primary), 'padding-bottom', device), '2px', named(device));
    }
    assert.equal(won(SUBMIT_PATH, 'padding-top', device), '2px', named(device));
  }
  // At 100% the bar keeps its own padding (8px above, the safe area below).
  assert.equal(won(barPath(true), 'padding-top', phone(390, 844)), '8px');
  // The 44px tap height is each control's own: every tool and Submit, inline in the engine.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const bar = region(engine, 'const questionWorkBar = (', '\n  );\n', 'the work bar');
  assert.ok((bar.match(/minHeight: '44px'/g) || []).length >= 6, 'six tools, each 44px tall at least');
  const submit = region(engine, 'className={`mathmaster-bar-submit', '</button>', 'Submit');
  assert.match(submit, /minHeight: '44px',/);
});

test('nothing reorders the bar: its controls, and Tab, keep the page\'s order', () => {
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  assert.match(container, /<div className="portrait-action-bar" data-has-primary=\{actionButtons \? 'true' : undefined\}>\{workBar\}\{actionButtons\}<\/div>/);
  assert.match(container, /<div className="landscape-action-bar">\{workBar\}\{actionButtons\}<\/div>/);
  const bars = /portrait-action-bar|landscape-action-bar|mathmaster-desktop-action-bar|mathmaster-work-view-actions >? ?button/;
  for (const sheet of [layout, shell, { name: 'App.css', rules: parseCss(read('src/App.css')) }]) {
    for (const rule of sheet.rules.filter((entry) => entry.selectors.some((selector) => bars.test(selector)))) {
      const at = `${sheet.name}: ${rule.selectors[0]}`;
      if (rule.selectors.some((selector) => /(>|\s)(button|\.mathmaster-work-bar-tool|\.mathmaster-bar-submit|\.mathmaster-bar-continue)\b/.test(selector))) assert.ok(!('order' in rule.declarations), at);
      assert.doesNotMatch(rule.declarations['flex-direction']?.value || '', /reverse/, at);
      assert.doesNotMatch(rule.declarations['flex-wrap']?.value || '', /reverse/, at);
      assert.doesNotMatch(rule.declarations['flex-flow']?.value || '', /reverse/, at);
    }
  }
});

test('on a phone on its side, and in Work View, a word longer than its button breaks inside it and the rail gives a button its lines', () => {
  const SIDE = '(orientation: landscape) and (max-height: 500px)';
  assert.equal(declared(layout.rules, '.mathmaster-question-container.mode-landscape .landscape-action-bar > button', 'overflow-wrap', { media: SIDE })?.value, 'anywhere');
  assert.equal(declared(layout.rules, '.mathmaster-question-container.mode-landscape .landscape-action-bar .mathmaster-submit-cost', 'white-space', { media: SIDE })?.value, 'normal', '"uses 1 of 3 tries" wraps between its words');
  // Work View: as wide as its row or rail at most, its words wrapping inside it.
  const host = (controls) => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div', classes: ['mathmaster-work-view-host'], attrs: { 'data-open': 'true', 'data-controls': controls, 'data-layout': 'mobile' } }, { tag: 'div', classes: ['mathmaster-work-view-body'] }, { tag: 'aside', classes: ['mathmaster-work-view-actions'] }, { tag: 'button', classes: ['mm-button-neutral'] }];
  const device = phone(320, 568, 2);
  for (const controls of ['bottom', 'side']) {
    assert.equal(winning({ sheets: [shell], path: host(controls), property: 'max-width', device })?.value, '100%', controls);
    assert.equal(winning({ sheets: [shell], path: host(controls), property: 'overflow-wrap', device })?.value, 'anywhere', controls);
  }
  // Held upright, a label wider than the row takes two lines, where the row kept every label to one.
  assert.equal(winning({ sheets: [shell], path: host('bottom'), property: 'white-space', device })?.value, 'normal');
  assert.equal(winning({ sheets: [shell], path: host('bottom'), property: 'flex', device })?.value, '1 1 auto', 'it narrows to the row');
  // On its side, the rail scrolls rather than squeeze a button below its lines.
  assert.equal(winning({ sheets: [shell], path: host('side'), property: 'flex-shrink', device })?.value, '0');
  assert.equal(winning({ sheets: [shell], path: host('side'), property: 'flex-shrink', device: phone(1366, 768) })?.value, '0', 'and so on a laptop');
  assert.equal(declared(shell.rules, '[data-open="true"] .mathmaster-work-view-actions', 'overflow', { media: null })?.value, 'auto');
});
