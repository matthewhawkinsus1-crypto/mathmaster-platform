// Capture what each Path tool really sends, from a real browser.
//
// HOW TO RUN (manually — this is not part of `node --test`):
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/captureToolResponses.mjs
//
// It drives Chromium through each tool as a student who knows the answer, and
// rewrites tests/platform/fixtures/capturedToolResponses.json with the exact
// objects QuestionEngine handed to `serverGrading.submit`. Those captures are
// then graded by tests/platform/toolResponseContracts.test.mjs on every run.
//
// WHY IT IS NOT AUTOMATIC. It needs a dev server and a browser, which the unit
// suite does not. Recapture after changing what a tool submits, or after adding
// a tool to the Path Tool Contract — the contract test fails loudly if a tool
// has no capture, so a new tool cannot quietly go unchecked.
//
// The browser binary is the one this environment ships; override with
// CHROMIUM_PATH and PLAYWRIGHT_MODULE if yours live elsewhere.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
import { writeFileSync } from 'node:fs';

const only = process.argv[2] || null;
const DEBUG = process.argv.includes('--debug');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});

// --- helpers ------------------------------------------------------------------

const btn = (page, text) => page.locator('button', { hasText: text }).first();

const typeMathField = async (page, label, value) => {
  await page.evaluate(([lbl, val]) => {
    const field = [...document.querySelectorAll('math-field')]
      .find((el) => (el.getAttribute('aria-label') || '') === lbl);
    if (!field) throw new Error(`no math-field labelled ${lbl}`);
    field.setValue(val);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, [label, value]);
  await page.waitForTimeout(150);
};

// The number line's own screen mapping: sx() inside IntervalNumberLine.
const numberLinePoint = (box, value, { min, max, WIDTH = 620, PAD = 36 }) => {
  const span = max - min;
  const viewBoxX = PAD + ((value - min) / span) * (WIDTH - PAD * 2);
  return { x: box.x + (viewBoxX / WIDTH) * box.width, y: box.y + box.height / 2 };
};

// --- one script per tool: what a student who knows the answer would do --------

const SCRIPTS = {
  algebra: async (page) => {
    await page.locator('input[placeholder="Value of x"], input').last().fill('4');
    await btn(page, 'Submit Answer').click();
  },

  system: async (page) => {
    await typeMathField(page, 'Solution to the system as an ordered pair', '(1,3)');
    await btn(page, 'Submit Answer').click();
  },

  multiAnswer: async (page) => {
    await typeMathField(page, 'Slope', '3');
    await typeMathField(page, 'y-intercept', '-2');
    await btn(page, 'Submit Answer').click();
  },

  relationMapping: async (page) => {
    // Click a domain value, then the range value it maps to: (-2,3), (1,2), (3,-1).
    for (const [from, to] of [[-2, 3], [1, 2], [3, -1]]) {
      await page.locator(`[aria-label="Domain value ${from}"]`).click();
      await page.locator(`[aria-label="Range value ${to}"]`).click();
      await page.waitForTimeout(80);
    }
    const inputs = page.locator('input[type="text"], input:not([type])');
    await inputs.nth(0).fill('-2, 1, 3');
    await inputs.nth(1).fill('-1, 2, 3');
    await page.locator('select').selectOption({ label: 'Yes' });
    await btn(page, 'Check').click();
  },

  intervalNumberLine: async (page) => {
    const box = await page.locator('svg').first().boundingBox();
    const at = (v) => numberLinePoint(box, v, { min: -8, max: 8 });
    // -3 is included, so place it while the closed switch is on.
    await btn(page, 'Closed (included)').click();
    const left = at(-3);
    await page.mouse.click(left.x, left.y);
    // 5 is not included, so switch to open before placing it.
    await btn(page, 'Open (not included)').click();
    const right = at(5);
    await page.mouse.click(right.x, right.y);
    await page.locator('input[placeholder="e.g. [-3, 5)"]').fill('[-3, 5)');
    await btn(page, 'Check').click();
  },

  // Deliberately drawn right-ray first, so the capture proves union order does
  // not decide the verdict.
  intervalNumberLineRays: async (page) => {
    const box = await page.locator('svg').first().boundingBox();
    const at = (v) => numberLinePoint(box, v, { min: -8, max: 8 });
    await btn(page, 'Open (not included)').click();
    const right = at(2);
    await page.mouse.click(right.x, right.y);
    await btn(page, /Shade right from/).click();
    await btn(page, 'Closed (included)').click();
    const left = at(-3);
    await page.mouse.click(left.x, left.y);
    await btn(page, /Shade left from/).click();
    await page.locator('input[placeholder="e.g. [-3, 5)"]').fill('(-∞, -3] U (2, ∞)');
    await btn(page, 'Check').click();
  },

  systemsWorkspace: async (page) => {
    await page.locator('select').selectOption({ index: 0 });
    const inputs = page.locator('input');
    await inputs.nth(0).fill('2');
    await inputs.nth(1).fill('5');
    await btn(page, 'Check system').click();
  },

  stepAlgebra: async (page) => {
    // x - 6 = 9 → add 6 to both sides → the -6 and +6 cancel → x = 15.
    // At every support level the student applies the operation, cancels the
    // zero pair by selecting both terms, and types the simplified side.
    const setField = async (label, value) => {
      await page.evaluate(([lbl, val]) => {
        const field = [...document.querySelectorAll('math-field')]
          .find((el) => (el.getAttribute('aria-label') || '') === lbl) || document.querySelector('math-field');
        field.setValue(val);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }, [label, value]);
      await page.waitForTimeout(200);
    };
    const step = async (symbol, operand, cancelPair, simplified) => {
      await page.locator('button', { hasText: new RegExp(`^\\${symbol}$`) }).first().click();
      await page.waitForTimeout(300);
      await setField('Operation value', operand);
      await page.locator('button', { hasText: /^Apply / }).first().click();
      await page.waitForTimeout(600);
      for (const term of cancelPair) {
        await page.locator(`[aria-label="${term}, select to cancel"]`).first().click();
        await page.waitForTimeout(150);
      }
      await setField('Simplified expression', simplified);
      await page.locator('button', { hasText: /Check Simplification/ }).first().click();
      await page.waitForTimeout(700);
    };
    await step('+', '6', ['- 6', '+ 6'], '15');
    await btn(page, 'Submit Solved Equation').click();
  },

  functionInvestigation: async (page) => {
    // The grid's own axis labels give the screen mapping, so the student's
    // clicks land on real coordinates rather than on guessed pixels.
    const fit = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const texts = [...svg.querySelectorAll('text')].filter((t) => /^-?\d+$/.test(t.textContent.trim()));
      const marks = texts.map((t) => {
        const r = t.getBoundingClientRect();
        return { value: Number(t.textContent), cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      });
      const line = (key, other) => {
        const rows = {};
        marks.forEach((m) => { const k = Math.round(m[other]); (rows[k] = rows[k] || []).push(m); });
        const best = Object.values(rows).sort((a, b) => b.length - a.length)[0];
        const [a, b] = [best[0], best[best.length - 1]];
        const scale = (b[key] - a[key]) / (b.value - a.value);
        return { zero: a[key] - a.value * scale, scale, fixed: a[other] };
      };
      return { x: line('cx', 'cy'), y: line('cy', 'cx') };
    });
    const at = (x, y) => ({ x: fit.x.zero + x * fit.x.scale, y: fit.y.zero + y * fit.y.scale });

    for (const [label, x, y] of [['x = 0', 0, 1], ['x = 2', 2, 5]]) {
      await page.locator('button', { hasText: new RegExp(`Plot the point where ${label}`) }).first().click();
      await page.waitForTimeout(150);
      const point = at(x, y);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(250);
    }
    await btn(page, 'Check Point Placements').click();
    await page.waitForTimeout(400);

    // Sketch the line through the two validated points so the curve snaps.
    const path = [];
    for (let x = -2.5; x <= 2.01; x += 0.25) path.push(at(x, 2 * x + 1));
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const point of path.slice(1)) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // A linear graph continues at both ends, so both ends take an arrow.
    for (const [x, y] of [[-3, -5], [2, 5]]) {
      await page.locator('button', { hasText: /^➤/ }).first().click();
      await page.waitForTimeout(150);
      const end = at(x, y);
      await page.mouse.click(end.x, end.y);
      await page.waitForTimeout(300);
    }
    await btn(page, 'Analyze Function').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const field = document.querySelector('math-field');
      if (field) { field.setValue('(-\\infty, \\infty)'); field.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(300);
    await btn(page, 'Submit Answer').click();
  },
};

// --- run ----------------------------------------------------------------------

const results = {};
for (const toolId of Object.keys(SCRIPTS)) {
  if (only && toolId !== only) continue;
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:5199/tests/browser/captureToolResponses.html?tool=${toolId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  let scriptError = null;
  try {
    await SCRIPTS[toolId](page);
    await page.waitForTimeout(600);
  } catch (error) {
    scriptError = error.message.split('\n')[0];
  }
  const captured = await page.evaluate(() => window.__mmCaptured);
  const payload = await page.evaluate(() => window.__mmPublicPayload);
  results[toolId] = { captured, payload, scriptError, errors };
  console.log(`=== ${toolId} ${captured ? 'CAPTURED' : 'NOTHING'} ${scriptError ? `script: ${scriptError}` : ''}`);
  if (captured) console.log(JSON.stringify(captured.rawWork));
  if (errors.length) console.log('  pageerrors:', errors.slice(0, 2));
  if (DEBUG && !captured) {
    console.log(await page.evaluate(() => [...document.querySelectorAll('button,input,select')]
      .map((el, i) => `${i} <${el.tagName.toLowerCase()}> "${(el.innerText || el.value || el.placeholder || '').slice(0, 40)}" disabled=${el.disabled === true}`).join('\n')));
    console.log(await page.evaluate(() => document.body.innerText.slice(0, 1200)));
  }
  await page.close();
}

await browser.close();

const missing = Object.entries(results).filter(([, entry]) => !entry.captured);
if (missing.length) {
  console.error(`\nNOTHING CAPTURED for: ${missing.map(([id]) => id).join(', ')}`);
  console.error('The fixture was left untouched rather than written half-empty.');
  process.exit(1);
}

writeFileSync(
  new URL('../platform/fixtures/capturedToolResponses.json', import.meta.url),
  `${JSON.stringify(
    Object.fromEntries(Object.entries(results)
      .map(([id, entry]) => [id, { pathToolId: entry.captured.pathToolId, rawWork: entry.captured.rawWork }])),
    null,
    2,
  )}\n`,
);
console.log(`\nWrote ${Object.keys(results).length} captures.`);
