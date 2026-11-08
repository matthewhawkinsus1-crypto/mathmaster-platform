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
 */
import assert from 'node:assert/strict';
import { auditForcedColors } from './forcedColorsAudit.mjs';

const BASE = 'body { margin: 0; font: 16px/1.4 sans-serif; background: #fff; color: #202124; } main { padding: 24px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; } button { font: inherit; padding: 8px 14px; }';
// A button styled as a link: no fill and no border, so it has no edge to lose and
// nothing of its own that forced colours recolour on focus.
const TEXT_BUTTON = 'button { border: 0; background: transparent; color: #1a73e8; text-decoration: underline; }';
const TAB = '[role="tab"] { border: 1px solid #5f6368; border-radius: 8px; background: #fff; color: #202124; font-weight: 400; } [role="tab"]:focus-visible { outline: 3px solid #1a73e8; }';
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
};

const THEMES = ['dark', 'light'];

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const walk = async (name, scheme) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 400 }, colorScheme: scheme, forcedColors: 'active', reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${BASE} ${PAGES[name].css}</style></head><body><main id="fixture">${PAGES[name].html}</main></body></html>`);
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
      // eslint-disable-next-line no-await-in-loop
      const result = await walk(name, scheme);
      const found = result.violations.map((violation) => violation.id).sort();
      const targets = result.violations.flatMap((violation) => violation.nodes.map((node) => node.target[0]));
      const expected = [...PAGES[name].expect].sort();
      const line = `${name.padEnd(20)} ${scheme.padEnd(6)} found ${found.length ? found.join(', ') : 'nothing'}${targets.length ? ` on ${targets.join(' | ')}` : ''}`;
      console.log(`${JSON.stringify(found) === JSON.stringify(expected) ? 'ok  ' : 'FAIL'} ${line}`);
      try {
        assert.deepEqual(found, expected, `${name} (${scheme}): expected ${expected.join(', ') || 'nothing'}`);
        // A planted defect is found on the planted control, not somewhere near it.
        if (expected.length) assert.ok(targets.every((target) => /#planted\b/.test(target)), `${name} (${scheme}): reported on ${targets.join(' | ')}, not on #planted`);
        // The walk read what it judges: a control, and a Tab stop.
        assert.ok(result.summary.controls > 0 || name.startsWith('state-choice'), `${name} (${scheme}): no control was read`);
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
