/*
 * THE CONTRAST REVIEW'S PIXEL STEP, ON PAGES WHOSE ANSWER IS KNOWN.
 *
 *   node tests/browser/contrastReviewSelfTest.mjs     # no server: the pages are written here
 *
 * The pixel step (contrastReview.mjs, measurePixels) reads a node's text boxes
 * with the text hidden. A text box is the font's whole height, so where a line
 * is shorter than the font it reaches across the node's padding into the
 * node's own border: the Live Challenge lobby's name plate (white 34px text on
 * red, under the root's 26.1px line, in a white border) read 1.30:1 against
 * its own border, where its text is 4.80:1. The step now leaves the node's own
 * border out. These pages hold it to that, and to nothing more:
 *
 *   plate          the lobby's plate, its text box across its own white border,
 *                  on a skewed box as the lobby draws it: it passes.
 *   lightPlate     the same plate on a light image its stops cannot read (they
 *                  see the dark colour beneath): only the pixels find the light
 *                  behind the text, and it must still fail.
 *   ancestorBorder white text that runs up over its card's white top border:
 *                  that border is not the text's own, and it must still fail.
 *   fraction       a stacked fraction's numerator, as MathLive draws "6 over 8":
 *                  its box, the font's whole height, reaches over the fraction's
 *                  bar, drawn in the text's own colour, and read as its
 *                  background it was 1.00:1. The box stops at the bar: it passes.
 *   darkFraction   the same numerator on a dark ground: it must still fail.
 *
 * Each page's verdict is the review's own: its steps run as the review runs
 * them (axe's undecided nodes, the stops, the pixels, the worst of both).
 */
import assert from 'node:assert/strict';
import { AXE_PATH } from './accessibilityAudit.mjs';
import { collectInPage, judge, measurePixels } from './contrastReview.mjs';
import { backgroundLayersInPage } from './support/backgroundLayers.mjs';

// The plate's shape (grandPrixTheme.js .mm-gp-plate), with a line shorter
// than any font's height, so its text box reaches its border in every font.
const PLATE = 'display: inline-block; padding: 4px 18px; border: 4px solid rgba(255, 255, 255, .85); border-radius: 10px; transform: skewX(-8deg); color: #fff; font: italic 900 34px/22px sans-serif;';
const CARD = '.card { padding: 40px; background: linear-gradient(160deg, rgba(42, 15, 92, .92), rgba(8, 12, 42, .96)), #080c2a; }';
// "6 over 8" as MathLive lays it out: each part in a box shorter than its font (0.65em), so the numerator's text box
// reaches down over the bar, which is drawn in the text's own colour under the glyph (in CI's DejaVu Serif at 32px,
// 3px under its baseline and 3px inside its text box). On the task panel's gradient (#ffffff to #f8f9fa), which axe
// cannot place, as the assignment screen draws it.
const FRACTION_CSS = `.ground { padding: 40px; color: #202124; font: 700 32px/1.45 serif; background: linear-gradient(180deg, #ffffff, #f8f9fa); }
  .ML__mfrac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; }
  .ML__mfrac > .part { display: inline-block; height: 0.65em; line-height: 0.65em; }
  .ML__frac-line { display: block; align-self: stretch; height: 1px; margin: 3px 0 5px; background: currentColor; }`;
const FRACTION = '<span class="ML__mfrac"><span class="part"><span id="fixture" class="ML__cmr">6</span></span>'
  + '<span class="ML__frac-line"></span><span class="part"><span class="ML__cmr">8</span></span></span>';
// A light image (a pale square, stretched over the box) over a dark colour.
const LIGHT_IMAGE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23f1f3f4'/%3E%3C/svg%3E\") 0 0 / 100% 100% no-repeat";
const PAGES = {
  plate: {
    css: `${CARD} #fixture { ${PLATE} background: linear-gradient(180deg, #d92a48 0%, #c8102e 100%); }`,
    html: '<div class="card"><span id="fixture">Swift Otter</span></div>',
  },
  lightPlate: {
    css: `${CARD} #fixture { ${PLATE} background: ${LIGHT_IMAGE}, #0c1443; }`,
    html: '<div class="card"><span id="fixture">Swift Otter</span></div>',
  },
  ancestorBorder: {
    css: '.page { padding: 40px; background: #080c2a; } .card { border-top: 14px solid #fff; padding: 0 16px 16px; background: linear-gradient(#16144e, #0c1443); } #fixture { margin: -12px 0 0; color: #fff; font: 700 22px/26px sans-serif; }',
    html: '<div class="page"><div class="card"><p id="fixture">Waiting for your teacher</p></div></div>',
  },
  fraction: {
    css: FRACTION_CSS,
    html: `<p class="ground">Write ${FRACTION} in lowest terms.</p>`,
  },
  darkFraction: {
    css: `${FRACTION_CSS} .ground { background: linear-gradient(180deg, #3c4043, #303134); }`,
    html: `<p class="ground">Write ${FRACTION} in lowest terms.</p>`,
  },
};
const EXPECTED = { plate: 'pass', lightPlate: 'fail', ancestorBorder: 'fail', fraction: 'pass', darkFraction: 'fail' };

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const review = async (name) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.setContent(`<!doctype html><html lang="en"><head><style>:root { font: 112.5%/145% sans-serif; } body { margin: 0; } ${PAGES[name].css}</style></head><body><main>${PAGES[name].html}</main></body></html>`);
    await page.addScriptTag({ path: AXE_PATH });
    await page.evaluate(backgroundLayersInPage);
    const described = await page.evaluate(collectInPage, { include: ['#fixture'], exclude: [] });
    assert.equal(described.length, 1, `${name}: axe leaves the fixture's text undecided, so the review decides it (${described.length} node(s))`);
    const [info] = described;
    const pixels = await measurePixels(page, info.index);
    const worst = judge(info, pixels);
    const required = info.large ? 3 : 4.5;
    return { name, ratio: worst.ratio, required, verdict: worst.ratio >= required ? 'pass' : 'fail', pixels, stops: info.stopCandidates };
  } finally {
    await context.close();
  }
};

const hex = (c) => (c ? `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` : null);
const results = [];
try {
  for (const name of Object.keys(PAGES)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await review(name);
    results.push(result);
    console.log(`${result.verdict.padEnd(5)} ${name.padEnd(15)} ${result.ratio.toFixed(2)} / ${result.required}   pixels ${hex(result.pixels?.dark)} … ${hex(result.pixels?.light)}   stops ${result.stops.map(hex).join(' ')}`);
  }
} finally {
  await browser.close();
}
for (const result of results) assert.equal(result.verdict, EXPECTED[result.name], `${result.name}: ${result.ratio.toFixed(2)}:1 should ${EXPECTED[result.name]}`);
// The plate passes on its own colours, not by luck: the light behind it is its red.
const plate = results.find((r) => r.name === 'plate');
assert.ok(plate.ratio >= 4.5, `the plate's white on red is 4.80:1 (${plate.ratio.toFixed(2)})`);
// The numerator passes on the white it is drawn on, not on a ground the step stopped reading.
const fraction = results.find((r) => r.name === 'fraction');
assert.ok(fraction.ratio >= 15, `the numerator's #202124 on its near-white ground is about 15.7:1 (${fraction.ratio.toFixed(2)})`);
console.log('\nThe pixel step leaves out the node\'s own border and a fraction\'s bar, and still finds the light behind a light plate, under an ancestor\'s border and the dark under a fraction.');
