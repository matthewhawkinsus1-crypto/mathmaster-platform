/*
 * THE FIRST SCREEN OF A QUESTION IS THE QUESTION, NOT ITS HEADER (PH03;
 * findings D-11, D-51, C1-59, P2-7).
 *
 * At 390x844 the work started 331 to 381px down (233px under a Warm-Up bar):
 * "YOUR TASK", the task, "Learning goal" on a row of its own, the tries in a
 * full-width pill, the grade weight under it, then the work, then a work bar
 * that wrapped to two rows when it held six tools. At 1366x768 the tool started
 * 432 to 481px down. Each of those rows is a short phrase or a chip, so they
 * now share rows:
 *
 *   - "Learning goal" sits in the heading's row on an upright phone, and in the
 *     task body where the panel is a narrow column (landscape);
 *   - the tries and the grade weight share one row;
 *   - a work bar of five tools or more is one row of icons;
 *   - on a laptop "Learning goal" and the Support tools share a row, and so do
 *     the tries and the grade weight.
 *
 * The geometry is proved in a browser, in the real App
 * (tests/browser/teacherWorkflow/matrixLabPhoneJourneys.mjs). Nothing here
 * renders CSS, so this binds what the geometry depends on: which layout draws
 * the chip (the conditions in the source, evaluated over every layout), and what
 * the stylesheet declares for each row (helpers/cssRules.mjs). Each assertion was
 * broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor, declared } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
const phoneRules = parseCss(read('src/components/student/MathToolMobileLayout.css'));
const appRules = parseCss(read('src/App.css'));

// A JSX condition from the source, as a function of the names it reads.
const condition = (source, pattern, label) => {
  const found = source.match(pattern);
  assert.ok(found, `could not find ${label}`);
  return new Function('isLandscape', 'isPromptCollapsed', 'taskMeta', 'supportTray', 'supportTrayAfterWork', 'workspaceActive', `return Boolean(${found[1]});`);
};

test('"Learning goal" is on a phone once, in the row that has room for it, and never when the task is hidden', () => {
  const heading = condition(container, /\{([^{}]*?)\s*&&\s*<div className="mathmaster-question-task-meta mathmaster-heading-meta">\{taskMeta\}<\/div>\s*\}/, 'the chip in the task panel\'s heading row');
  const bodyWrapper = condition(container, /\{([^{}]*?)\s*&&\s*\(\s*<div className="prompt-body">/, 'the task body\'s own condition');
  const body = condition(container, /\{([^{}]*?)\s*&&\s*<div className="mathmaster-question-task-meta">\{taskMeta\}<\/div>\s*\}/, 'the chip in the task body');

  for (const isLandscape of [false, true]) {
    for (const isPromptCollapsed of [false, true]) {
      const where = `${isLandscape ? 'landscape' : 'upright'}, task ${isPromptCollapsed ? 'hidden' : 'shown'}`;
      const args = (taskMeta) => [isLandscape, isPromptCollapsed, taskMeta, null, false, false];
      const inHeading = heading(...args({}));
      const inBody = bodyWrapper(...args({})) && body(...args({}));
      assert.equal(Number(inHeading) + Number(inBody), isPromptCollapsed ? 0 : 1, `${where}: the chip is drawn ${isPromptCollapsed ? 'nowhere' : 'once'} (heading ${inHeading}, body ${inBody})`);
      if (!isPromptCollapsed) assert.equal(inHeading, !isLandscape, `${where}: the heading's row on an upright phone, the task body in landscape`);
      // Nothing to show, nothing drawn: no empty chip taking a row.
      assert.equal(heading(...args(null)) || (bodyWrapper(...args(null)) && body(...args(null))), false, `${where}: no chip without a Learning goal`);
    }
  }

  // Between the label and Minimize, so it reads "YOUR TASK  Learning goal  Minimize".
  const label = container.indexOf('<span>YOUR TASK</span>');
  const chip = container.indexOf('mathmaster-heading-meta');
  const minimize = container.indexOf("'Minimize ▲'");
  assert.ok(label !== -1 && label < chip && chip < minimize, 'the chip sits between the label and the Minimize button');
});

test('on a laptop "Learning goal" and the Support tools share one row that stays while either shows', () => {
  const wrapper = condition(container, /\{([^{}]*?)\s*&&\s*\(\s*<div className="mathmaster-desktop-task-extras">/, 'the desktop row for the chip and the tray');
  const chip = condition(container, /\{\s*([^{}?]*?)\s*\?\s*<div className="mathmaster-question-task-meta mathmaster-desktop-task-meta">\{taskMeta\}<\/div>\s*:\s*null\s*\}/, 'the chip in that row');
  const tray = condition(container, /\{\s*([^{}?]*?)\s*\?\s*<div className="mathmaster-question-support-tray">\{supportTray\}<\/div>\s*:\s*null\s*\}/, 'the tray in that row');

  for (const isPromptCollapsed of [false, true]) {
    for (const hasMeta of [false, true]) {
      for (const hasTray of [false, true]) {
        for (const supportTrayAfterWork of [false, true]) {
          for (const workspaceActive of [false, true]) {
            const args = [false, isPromptCollapsed, hasMeta ? {} : null, hasTray ? {} : null, supportTrayAfterWork, workspaceActive];
            const where = `task ${isPromptCollapsed ? 'hidden' : 'shown'}, chip ${hasMeta}, tray ${hasTray}${supportTrayAfterWork ? ' (after the work)' : ''}${workspaceActive ? ', workspace open' : ''}`;
            const shows = chip(...args) || tray(...args);
            // The row is there while either shows, and not as an empty box; the tray keeps its
            // place when the task is hidden and shown, so its open panel is not lost.
            assert.equal(wrapper(...args), !workspaceActive && shows, `${where}: the row is there exactly while the chip or the tray is`);
            assert.equal(tray(...args), hasTray && !supportTrayAfterWork, `${where}: the tray is in the row unless it follows the work`);
            assert.equal(chip(...args), hasMeta && !isPromptCollapsed, `${where}: the chip is in the row while the task is shown`);
          }
        }
      }
    }
  }
  // The chip no longer rides in the sticky task anchor (live QA: it floated over the tool's buttons).
  const wrapperAt = container.search(/\{[^{}]*?&&\s*\(\s*<div className="mathmaster-desktop-task-extras">/);
  const anchorAt = container.indexOf('mathmaster-desktop-question-anchor');
  assert.ok(anchorAt !== -1 && anchorAt < wrapperAt, 'the sticky anchor is drawn before the row');
  assert.doesNotMatch(container.slice(anchorAt, wrapperAt), /taskMeta/, 'the chip is outside the sticky anchor');

  assert.equal(declared(appRules, '.mathmaster-desktop-task-extras', 'display', { media: null })?.value, 'flex');
  assert.equal(declared(appRules, '.mathmaster-desktop-task-extras', 'flex-wrap', { media: null })?.value, 'wrap', 'a row too short for both wraps the second below, as before');
});

const PHONE_PANEL = '.mathmaster-question-container.mode-portrait .mathmaster-question-context-panel';
const DESK_PANEL = '.mathmaster-desktop-question-content .mathmaster-question-context-panel';

for (const [name, rules, panel, media] of [
  ['an upright phone', phoneRules, PHONE_PANEL, '(orientation: portrait)'],
  ['a laptop', appRules, DESK_PANEL, null],
]) {
  test(`${name}: the tries and the grade weight share a row; anything else the panel holds keeps its own`, () => {
    const options = { media };
    const open = `${panel}:has(> *)`;
    assert.equal(declared(rules, open, 'display', options)?.value, 'flex', 'a panel with something in it is a wrapping row');
    assert.equal(declared(rules, open, 'flex-wrap', options)?.value, 'wrap');
    // An empty panel stays the empty block it was: no padding, no gap, no height.
    for (const property of ['display', 'padding', 'gap']) {
      assert.equal(declared(rules, panel, property, options), null, `an empty panel has no ${property} of its own`);
    }
    // Every child takes a whole row unless a rule below says it may share it...
    assert.equal(declared(rules, `${panel} > *`, 'flex', options)?.value, '1 1 100%');
    // ...and these two may: their own width, and shrinking before overflowing.
    for (const chip of ['.mathmaster-question-attempt-strip', '[data-grade-weight]']) {
      assert.equal(declared(rules, `${panel} > ${chip}`, 'flex', options)?.value, '0 1 auto', `${chip} takes its own width`);
      // The weight's own margin is inline style ("0 auto 12px"), which only !important overrides.
      assert.deepEqual(declared(rules, `${panel} > ${chip}`, 'margin', options)?.important, true, `${chip}'s margin is set past its inline style`);
    }
  });
}

test('the phone\'s compact rows reach an upright phone only, never the landscape grid or a laptop', () => {
  for (const rule of phoneRules) {
    for (const selector of rule.selectors) {
      if (!selector.includes('.mathmaster-question-context-panel')) continue;
      if (selector.includes('.mode-landscape')) continue;
      assert.ok(selector.startsWith('.mathmaster-question-container.mode-portrait '), `${selector} is for the upright phone`);
      assert.ok(rule.atRules.some((atRule) => atRule.includes('orientation: portrait')), `${selector} is inside the portrait media query`);
    }
  }
  const desktop = appRules.filter((rule) => rule.selectors.some((selector) => selector.includes('.mathmaster-question-context-panel') && selector.includes('.mathmaster-desktop-question-content')));
  assert.ok(desktop.length >= 3, 'the laptop rules are found');
  for (const rule of desktop) {
    for (const selector of rule.selectors) assert.ok(selector.startsWith('.mathmaster-desktop-question-content '), `${selector} is for the laptop layout`);
  }
});

// The bar of five tools or more, without Submit or Next.
const CROWDED = '.mathmaster-question-container.mode-portrait .portrait-action-bar:not([data-has-primary="true"]):has(> .mathmaster-work-bar-tool:nth-child(5))';
const NARROW = { media: '(max-width: 600px)' };

test('a work bar of five tools or more is one row of icons on a phone, each still named', () => {
  assert.equal(declared(phoneRules, CROWDED, 'flex-wrap', NARROW)?.value, 'nowrap', 'one row');
  assert.equal(declared(phoneRules, `${CROWDED} > .mathmaster-work-bar-tool`, 'min-width', NARROW)?.value, '44px', 'each target 44px wide');
  const label = `${CROWDED} .mathmaster-action-label`;
  // Hidden to the eye only: still in the accessibility tree as the tool's name.
  assert.equal(declared(phoneRules, label, 'position', NARROW)?.value, 'absolute');
  assert.equal(declared(phoneRules, label, 'clip', NARROW)?.value, 'rect(0 0 0 0)');
  assert.equal(declared(phoneRules, label, 'display', NARROW), null, 'never display: none, which would take the name away');
  assert.equal(declared(phoneRules, label, 'visibility', NARROW), null);
  // Undo and Reset keep their word under the icon (A11Y-10): two near-identical arrows, one throws work away.
  const kept = `${CROWDED} .mathmaster-action-label.mathmaster-action-label--kept`;
  assert.equal(declared(phoneRules, kept, 'position', NARROW)?.value, 'static');
  assert.equal(declared(phoneRules, kept, 'clip', NARROW)?.value, 'auto');
  assert.equal(declared(phoneRules, `${CROWDED} .mathmaster-work-bar-tool:has(> .mathmaster-action-label--kept)`, 'flex-direction', NARROW)?.value, 'column');
  assert.equal(declared(phoneRules, `${CROWDED} .mathmaster-universal-undo`, 'flex-direction', NARROW)?.value, 'column');
});

test('the crowded-bar rule leaves a bar with Submit or Next, and a bar of four, as they were', () => {
  const crowded = phoneRules.filter((rule) => rule.selectors.some((selector) => selector.includes('nth-child(5)')));
  assert.ok(crowded.length >= 5, `the crowded-bar rules are found (${crowded.length})`);
  for (const rule of crowded) {
    for (const selector of rule.selectors) {
      // With Submit the tools narrow to 36px so it keeps its words; a 44px floor here would take that back.
      assert.match(selector, /:not\(\[data-has-primary="true"\]\)/, `${selector} is for a bar with no Submit`);
      assert.match(selector, /^\.mathmaster-question-container\.mode-portrait /, `${selector} is for the upright phone`);
      assert.match(selector, /:has\(> \.mathmaster-work-bar-tool:nth-child\(5\)\)/, `${selector} counts the tools: five or more, never four (four keep their words and fit one row)`);
    }
    assert.ok(rule.atRules.some((atRule) => atRule.includes('(max-width: 600px)')), 'only on a phone-width screen');
  }
  // A bar with Submit still has the tools giving way to it: 36px, in the portrait query itself
  // (the 32px a 320px phone gets is in a query nested inside it).
  const withSubmit = '.mathmaster-question-container.mode-portrait .portrait-action-bar[data-has-primary="true"] > .mathmaster-work-bar-tool';
  const own = rulesFor(phoneRules, withSubmit).find((rule) => rule.atRules.length === 1 && 'min-width' in rule.declarations);
  assert.equal(own?.declarations['min-width'].value, '36px');
});
