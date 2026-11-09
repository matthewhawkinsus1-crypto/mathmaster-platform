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
 *   plane-own-paint      a coordinate plane as the app draws it: an SVG drawing,
 *                        whose paint forced colours leave alone, so its board,
 *                        grid, axes, words, lines, points and shaded region keep
 *                        the app theme's colours, and its focus ring the app's
 *   plane-tinted-region  the plane in the theme's colours, its region shaded by a
 *                        translucent tint (which a contrast theme does not draw
 *                        reliably) instead of hatched
 *   plane-focus-ring     the plane in the theme's colours, its focus ring the app's
 *   plane-theme          fixed: the plane under src/theme/forcedColors.css itself
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
// A coordinate plane marked up as the app's planes are (data-mm-plane, data-mm-plane-part), painted as the app paints
// one: its tokens per theme (src/theme/tokens.css), fixed colours for its marks, a translucent region, the page's own
// focus ring. `PLANE_FIXED` is the platform's stylesheet for forced colours, read from src/theme/forcedColors.css.
const PLANE_CSS = ':root { --mm-graph-bg: #ffffff; --mm-graph-axis: #5f6368; --mm-graph-grid: #dfe3e7; --mm-graph-label: #3c4043; --mm-focus: #1a73e8; } :root[data-theme="dark"] { --mm-graph-bg: #171a20; --mm-graph-axis: #d3d9e3; --mm-graph-grid: #4a5260; --mm-graph-label: #f1f4f9; --mm-focus: #a8c7fa; } :root[data-theme="dark"] body { background: #111318; color: #f3f5f9; } #planted { display: block; width: 360px; height: 240px; background: #fff; border: 1px solid #d9e2f1; border-radius: 12px; } :root[data-theme="dark"] #planted { background: #1b1e25; border-color: #2e3a50; } #planted:focus { outline: none; } #planted:focus-visible { outline: 3px solid var(--mm-focus); outline-offset: 2px; }';
const PLANE_FIXED = readFileSync(new URL('../../src/theme/forcedColors.css', import.meta.url), 'utf8');
const PLANE = `<svg id="planted" data-mm-plane="" role="application" tabindex="0" aria-label="Coordinate plane" viewBox="0 0 360 240">
  <rect data-mm-plane-part="paper" x="20" y="20" width="320" height="200" style="fill: var(--mm-graph-bg)" />
  ${[60, 100, 140, 220, 260, 300].map((x) => `<line data-mm-plane-part="grid" x1="${x}" y1="20" x2="${x}" y2="220" style="stroke: var(--mm-graph-grid)" />`).join('')}
  ${[60, 160, 200].map((y) => `<line data-mm-plane-part="grid" x1="20" y1="${y}" x2="340" y2="${y}" style="stroke: var(--mm-graph-grid)" />`).join('')}
  <polygon data-mm-plane-part="shade" points="20,220 340,220 340,60 20,180" fill="#1a73e8" fill-opacity="0.2" stroke="none" />
  <line data-mm-plane-part="axis" x1="20" y1="120" x2="340" y2="120" style="stroke: var(--mm-graph-axis)" stroke-width="2" />
  <line data-mm-plane-part="axis" x1="180" y1="20" x2="180" y2="220" style="stroke: var(--mm-graph-axis)" stroke-width="2" />
  <text x="300" y="136" font-size="12" style="fill: var(--mm-graph-label)">3</text><text x="186" y="64" font-size="12" style="fill: var(--mm-graph-label)">2</text>
  <line data-mm-plane-part="line" x1="20" y1="180" x2="340" y2="60" stroke="#1a73e8" stroke-width="3" />
  <line data-mm-plane-part="line" x1="20" y1="40" x2="340" y2="200" stroke="#d93025" stroke-width="3" stroke-dasharray="10 6" />
  <circle data-mm-plane-part="point" cx="260" cy="90" r="6" fill="#1a73e8" stroke="#fff" stroke-width="2" />
  <circle data-mm-plane-part="open" cx="100" cy="80" r="7" fill="#fff" stroke="#d93025" stroke-width="3" />
</svg>`;
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
  'plane-own-paint': {
    css: PLANE_CSS,
    html: PLANE,
    plane: true,
    expect: ['mm-forced-plane-paint'],
  },
  'plane-tinted-region': {
    css: `${PLANE_CSS} ${PLANE_FIXED} @media (forced-colors: active) { #planted [data-mm-plane-part="shade"] { fill-opacity: 0.25 !important; mask-image: none !important; } }`,
    html: PLANE,
    plane: true,
    expect: ['mm-forced-plane-paint'],
  },
  'plane-focus-ring': {
    css: `${PLANE_CSS} ${PLANE_FIXED} @media (forced-colors: active) { #planted:focus-visible { outline-color: #1a73e8 !important; } }`,
    html: PLANE,
    plane: true,
    expect: ['mm-forced-plane-paint'],
  },
  'plane-theme': {
    css: `${PLANE_CSS} ${PLANE_FIXED}`,
    html: PLANE,
    plane: true,
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
      const unread = (PAGES[name].math && result.summary.formulas !== 1) || (PAGES[name].plane && result.summary.planes !== 1);
      const line = unread
        ? `${name.padEnd(20)} ${scheme.padEnd(6)} read ${PAGES[name].plane ? `${result.summary.planes} plane(s)` : `${result.summary.formulas} formula(s)`}, not the 1 on the page`
        : `${name.padEnd(20)} ${scheme.padEnd(6)} found ${found.length ? found.join(', ') : 'nothing'}${targets.length ? ` on ${targets.join(' | ')}` : ''}`;
      console.log(`${!unread && JSON.stringify(found) === JSON.stringify(expected) ? 'ok  ' : 'FAIL'} ${line}`);
      try {
        // The walk read what it judges, first: a control, and a Tab stop; a page of mathematics, its formula; a page
        // with a plane, the plane, its parts, and the plane focused.
        if (PAGES[name].math) assert.equal(result.summary.formulas, 1, `${name} (${scheme}): the formula was not read`);
        else if (PAGES[name].plane) {
          assert.equal(result.summary.planes, 1, `${name} (${scheme}): the plane was not read`);
          assert.ok(result.summary.planeParts >= 10, `${name} (${scheme}): ${result.summary.planeParts} of the plane's parts read`);
          assert.ok(result.readings.focus.some((entry) => entry.plane), `${name} (${scheme}): the plane was not read focused`);
        } else assert.ok(result.summary.controls > 0 || name.startsWith('state-choice'), `${name} (${scheme}): no control was read`);
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
