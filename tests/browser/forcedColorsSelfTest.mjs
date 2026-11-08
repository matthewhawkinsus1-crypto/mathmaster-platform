/*
 * THE FORCED-COLOURS WALK, ON PAGES WHOSE ANSWER IS KNOWN.
 *
 *   node tests/browser/forcedColorsSelfTest.mjs     # no server: the pages are written here
 *
 * forcedColorsCertification.mjs passes when the certified scenes give it
 * nothing to report. That means something only if the walk can be seen finding
 * each thing it is there to find, on pages written to have it, and passing the
 * same page fixed. Each defect below is planted once, beside its fixed twin, and
 * each page is read under forced colours in a dark contrast theme and a light
 * one by the walk itself (forcedColorsAudit.mjs). A planted page must report
 * exactly its rule, on the planted control; a fixed one, nothing.
 *
 *   focus-shadow         a focus ring drawn as a box-shadow, outline none, on a
 *                        text-styled button (a bordered one is not a defect:
 *                        under forced colours Chromium draws a focused control's
 *                        border in Highlight, which the walk counts)
 *   focus-background     a focus shown only by a background, outline none
 *   focus-outline        fixed: an outline ring
 *   focus-transparent    fixed: the shadow ring kept, and a transparent outline
 *                        that only forced colours draw
 *   focus-sibling-line   fixed: focus drawn by a line beside the control, which
 *                        no style the walk reads changes: only its picture of
 *                        the control focused and blurred sees it
 *   state-background     a selected tab shown only by its fill and text colour
 *   state-bold-border    fixed: the selected tab is bold with a heavier edge
 *   state-choice-card    a chosen answer (a label around a hidden radio) shown
 *                        only by its fill
 *   state-choice-edge    fixed: the chosen card's edge is heavier
 *   edge-fill            a button whose edge is its fill, border none
 *   edge-transparent     fixed: the same with a transparent border
 *   edge-text-button     a text-styled button: it had no edge to lose
 *   edge-wrapped-field   a field drawn by the pill around it, as a search box is
 *   math-fixed-colour    MathLive's own <math-span> in words of a colour the page
 *                        fixed (white, as the Live Challenge projector writes its
 *                        question), on a page that themes itself as the app does;
 *                        opened in the dark contrast theme, typeset, and switched
 *                        to the light one as the walk switches a standalone page
 *                        (drawn in the new theme, then renamed, as the app follows
 *                        the device): the formula stays white on the white page
 *                        while the words are black
 *   math-canvastext      fixed: the same, the math element given the theme's
 *                        text colour under forced colours
 *   math-theme-colour    fixed: words in the theme's own colour, which the switch
 *                        changes, and the formula follows them
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { auditForcedColors, waitForFormulas } from './forcedColorsAudit.mjs';
import { CONTRAST_THEMES, useContrastTheme } from './forcedColorsCertification.mjs';

const BASE = 'body { margin: 0; font: 16px/1.4 sans-serif; background: #fff; color: #202124; } main { padding: 24px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; } button { font: inherit; padding: 8px 14px; }';
// A button styled as a link: no fill and no border, so it has no edge to lose and
// nothing of its own that forced colours recolour on focus.
const TEXT_BUTTON = 'button { border: 0; background: transparent; color: #1a73e8; text-decoration: underline; }';
const TAB = '[role="tab"] { border: 1px solid #5f6368; border-radius: 8px; background: #fff; color: #202124; font-weight: 400; } [role="tab"]:focus-visible { outline: 3px solid #1a73e8; }';
// A page that themes itself as the app does (src/theme/mathMasterTheme.js): its colours are variables of the theme its
// root names, and a switch of contrast theme renames it (useContrastTheme). MathLive is the installed one.
const THEMED = ':root[data-theme="dark"] { --page-text: #e8eaed; --page-bg: #111318; } :root[data-theme="light"] { --page-text: #202124; --page-bg: #fff; } body { color: var(--page-text); background: var(--page-bg); } math-span { color: inherit; }';
const MATHLIVE = readFileSync(createRequire(import.meta.url).resolve('mathlive'), 'utf8');
const CARD = '.card { display: inline-block; padding: 10px 18px; border: 1px solid #5f6368; border-radius: 10px; } .card input { position: absolute; opacity: 0; width: 1px; height: 1px; } .card:has(input:checked) { background: #1a73e8; color: #fff; }';

export const PAGES = {
  'focus-shadow': {
    css: `${TEXT_BUTTON} button:focus { outline: none; box-shadow: 0 0 0 3px #1a73e8; }`,
    html: '<button id="planted" type="button">Save</button>',
    expect: ['mm-forced-focus-not-drawn'],
  },
  'focus-background': {
    css: '.card { padding: 10px; border: 1px solid #5f6368; outline: none; } .card:focus { outline: none; background: #e8f0fe; }',
    html: '<div id="planted" class="card" role="button" tabindex="0">Open the lesson</div>',
    expect: ['mm-forced-focus-not-drawn'],
  },
  'focus-outline': {
    css: `${TEXT_BUTTON} button:focus { outline: none; } button:focus-visible { outline: 3px solid #1a73e8; outline-offset: 2px; }`,
    html: '<button id="planted" type="button">Save</button>',
    expect: [],
  },
  'focus-transparent': {
    css: `${TEXT_BUTTON} button:focus { outline: 2px solid transparent; box-shadow: 0 0 0 3px #1a73e8; }`,
    html: '<button id="planted" type="button">Save</button>',
    expect: [],
  },
  'focus-sibling-line': {
    css: `${TEXT_BUTTON} button:focus { outline: none; } .wrap { position: relative; display: inline-block; } .line { display: none; position: absolute; left: 0; right: 0; bottom: -4px; border-top: 3px solid #1a73e8; } button:focus-visible + .line { display: block; }`,
    html: '<span class="wrap"><button id="planted" type="button">Save</button><span class="line" aria-hidden="true"></span></span>',
    expect: [],
  },
  'state-background': {
    css: `${TAB} [role="tab"][aria-selected="true"] { background: #1a73e8; color: #fff; }`,
    html: '<div role="tablist" aria-label="Views"><button id="planted" role="tab" aria-selected="true" type="button">Overview</button><button role="tab" aria-selected="false" type="button" tabindex="-1">Progress</button></div>',
    expect: ['mm-forced-state-colour-only'],
  },
  'state-bold-border': {
    css: `${TAB} [role="tab"][aria-selected="true"] { background: #1a73e8; color: #fff; font-weight: 700; border-bottom-width: 4px; }`,
    html: '<div role="tablist" aria-label="Views"><button id="planted" role="tab" aria-selected="true" type="button">Overview</button><button role="tab" aria-selected="false" type="button" tabindex="-1">Progress</button></div>',
    expect: [],
  },
  'state-choice-card': {
    css: CARD,
    html: '<fieldset><legend>2 + 2</legend><label id="planted" class="card"><input type="radio" name="answer" checked> 4</label> <label class="card"><input type="radio" name="answer"> 5</label></fieldset>',
    expect: ['mm-forced-state-colour-only'],
  },
  'state-choice-edge': {
    css: `${CARD} .card:has(input:checked) { border-width: 3px; }`,
    html: '<fieldset><legend>2 + 2</legend><label id="planted" class="card"><input type="radio" name="answer" checked> 4</label> <label class="card"><input type="radio" name="answer"> 5</label></fieldset>',
    expect: [],
  },
  'edge-fill': {
    css: 'button { border: none; border-radius: 8px; background: #1a73e8; color: #fff; }',
    html: '<button id="planted" type="button">Continue</button>',
    expect: ['mm-forced-edge-lost'],
  },
  'edge-transparent': {
    css: 'button { border: 1px solid transparent; border-radius: 8px; background: #1a73e8; color: #fff; }',
    html: '<button id="planted" type="button">Continue</button>',
    expect: [],
  },
  'edge-text-button': {
    css: TEXT_BUTTON,
    html: '<button id="planted" type="button">Log Out</button>',
    expect: [],
  },
  'edge-wrapped-field': {
    css: '.pill { display: flex; gap: 6px; align-items: center; padding: 0 10px; border: 1px solid #5f6368; border-radius: 999px; } .pill input { border: none; background: #f1f3f4; padding: 8px; font: inherit; outline: none; } .pill input:focus-visible { outline: 2px solid #1a73e8; }',
    html: '<div class="pill"><span aria-hidden="true">?</span><input id="planted" aria-label="Search" placeholder="Search"></div>',
    expect: [],
  },
  // Opened in the dark contrast theme, where white is the theme's text colour too, and read in the light one after the
  // walk's switch.
  'math-fixed-colour': {
    css: THEMED,
    html: '<p style="color: #fff">Solve <math-span id="planted">2x+5=17</math-span>.</p>',
    math: true,
    expect: { dark: [], light: ['mm-forced-math-colour-kept'] },
  },
  'math-canvastext': {
    css: `${THEMED} @media (forced-colors: active) { math-span { color: CanvasText; } }`,
    html: '<p style="color: #fff">Solve <math-span id="planted">2x+5=17</math-span>.</p>',
    math: true,
    expect: [],
  },
  'math-theme-colour': {
    css: THEMED,
    html: '<p>Solve <math-span id="planted">2x+5=17</math-span>.</p>',
    math: true,
    expect: [],
  },
};

// A page of formulas opens as every scene does, in the walk's first contrast theme, and is switched to the other.
const SELF_TEST_PAGE = { id: 'self-test', harness: 'self-test' };
const expectedFor = (name, scheme) => [...(Array.isArray(PAGES[name].expect) ? PAGES[name].expect : PAGES[name].expect[scheme])].sort();

const THEMES = CONTRAST_THEMES;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const walk = async (name, scheme) => {
  const spec = PAGES[name];
  const opens = spec.math ? THEMES[0] : scheme;
  const context = await browser.newContext({ viewport: { width: 900, height: 400 }, colorScheme: opens, forcedColors: 'active', reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.setContent(`<!doctype html><html lang="en" data-theme="${opens}"><head><style>${BASE} ${spec.css}</style></head><body><main id="fixture">${spec.html}</main></body></html>`);
    if (spec.math) {
      await page.addScriptTag({ content: MATHLIVE });
      // Typeset before the switch, as the walk has every formula on screen: one typeset after it is drawn afresh in
      // the new theme, and the planted page has no defect left to find. One never typeset fails the page by name.
      await waitForFormulas(page, { include: '#fixture' });
    }
    if (scheme !== opens) await useContrastTheme(page, SELF_TEST_PAGE, scheme);
    const result = await auditForcedColors(page, { name, viewport: scheme, include: '#fixture' });
    return result;
  } finally {
    await context.close();
  }
};

const failures = [];
try {
  for (const name of Object.keys(PAGES)) {
    for (const scheme of THEMES) {
      let result;
      try {
        // eslint-disable-next-line no-await-in-loop
        result = await walk(name, scheme);
      } catch (error) {
        // A page the walk could not read (a formula never typeset) is its own failure, never "found nothing".
        console.log(`FAIL ${name.padEnd(20)} ${scheme.padEnd(6)} not read: ${error.message.split('\n')[0]}`);
        failures.push(`${name} (${scheme}): not read: ${error.message.split('\n')[0]}`);
        continue;
      }
      const found = result.violations.map((violation) => violation.id).sort();
      const targets = result.violations.flatMap((violation) => violation.nodes.map((node) => node.target[0]));
      const expected = expectedFor(name, scheme);
      // A page of mathematics whose formula was not read says so, never "found nothing".
      const unread = PAGES[name].math && result.summary.formulas !== 1;
      const line = unread
        ? `${name.padEnd(20)} ${scheme.padEnd(6)} read ${result.summary.formulas} formula(s), not the 1 on the page`
        : `${name.padEnd(20)} ${scheme.padEnd(6)} found ${found.length ? found.join(', ') : 'nothing'}${targets.length ? ` on ${targets.join(' | ')}` : ''}`;
      console.log(`${!unread && JSON.stringify(found) === JSON.stringify(expected) ? 'ok  ' : 'FAIL'} ${line}`);
      try {
        // The walk read what it judges, first: a control, and a Tab stop; a page of mathematics, its formula.
        if (PAGES[name].math) assert.equal(result.summary.formulas, 1, `${name} (${scheme}): the formula was not read`);
        else assert.ok(result.summary.controls > 0 || name.startsWith('state-choice'), `${name} (${scheme}): no control was read`);
        assert.deepEqual(found, expected, `${name} (${scheme}): expected ${expected.join(', ') || 'nothing'}`);
        // A planted defect is found on the planted control, not somewhere near it.
        if (expected.length) assert.ok(targets.every((target) => /#planted\b/.test(target)), `${name} (${scheme}): reported on ${targets.join(' | ')}, not on #planted`);
      } catch (error) {
        failures.push(error.message);
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nThe forced-colours walk did not find what was planted, or found what was not:\n  ${failures.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nThe forced-colours walk found every planted defect and passed every fixed twin (${Object.keys(PAGES).length} pages, ${THEMES.length} contrast themes).`);
}
