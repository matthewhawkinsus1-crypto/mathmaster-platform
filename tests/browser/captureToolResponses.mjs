// Capture what each Path tool really sends, from a real browser.
//
// HOW TO RUN (manually — this is not part of `node --test`):
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/captureToolResponses.mjs             # every tool
//   node tests/browser/captureToolResponses.mjs graphing2   # one tool
//   node tests/browser/captureToolResponses.mjs --debug     # list the controls of a tool it cannot drive
//
// AUDIT_ORIGIN points it at a dev server on another origin.
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
// HOW THE SCRIPTS FIND THINGS. By role and accessible name — what a student
// sees and a screen reader announces — never by position. Position is how
// these scripts rotted unnoticed: "the first button that says Submit Answer"
// became the Work View rail's hidden copy of the question's actions, and "the
// last input" became a checkbox once the algebra answer box was retired. A
// renamed control should fail here by name, not drive the wrong one.
//
// The browser binary is the one this environment ships; override with
// CHROMIUM_PATH and PLAYWRIGHT_MODULE if yours live elsewhere.

const playwrightModule = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(playwrightModule);
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// The tool to capture is the first argument that is not a flag: `--debug` on
// its own used to be read as a tool name, which captured nothing.
const only = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || null;
const DEBUG = process.argv.includes('--debug');

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// --- helpers ------------------------------------------------------------------

// A button the student can see, by its accessible name (exact for a string).
// A role locator skips the Work View rail's hidden "Submit Answer".
const btn = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });

// MathLive fields are set through the element's own value API: what the
// student enters is serialized as LaTeX, and that LaTeX is what the tool sends.
const setMathField = async (field, value) => {
  await field.evaluate(async (element, val) => {
    await customElements.whenDefined('math-field');
    element.setValue(val);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await field.page().waitForTimeout(150);
};

const typeMathField = (page, label, value) => setMathField(page.locator(`math-field[aria-label="${label}"]`), value);

// The balance workspace (`algebra` and `stepAlgebra`). The student chooses an
// operation on the rail, types its value, picks the tile up and places it on
// each side in turn; the equation only changes once both sides have it.
const balanceMove = async (page, operation, operand) => {
  await btn(page, `Choose ${operation} operation`).first().click();
  await setMathField(page.locator('math-field[aria-label$="what to both sides"]'), operand);
  await btn(page, /^Pick up /).click();
  await btn(page, /on the left side$/).click();
  await page.waitForTimeout(150);
  await btn(page, /on the right side$/).click();
  await page.waitForTimeout(600);
};

// After a move's terms are crossed out, the student writes the side that is
// left over in its simplest form and checks it.
const simplifySide = async (page, side, value) => {
  await setMathField(page.locator(`math-field[aria-label="${side}: enter your simplification"]`), value);
  await btn(page, 'Check my simplification').click();
  await page.waitForTimeout(600);
};

// The number line takes an endpoint typed exactly, beside the line: choose
// closed or open, type the value, place it.
const placeEndpoint = async (page, value, closed) => {
  await btn(page, closed ? '● Closed' : '○ Open').click();
  await page.getByRole('textbox', { name: 'Exact endpoint value' }).fill(String(value));
  await btn(page, 'Place endpoint').click();
  await page.waitForTimeout(100);
};

// --- one script per tool: what a student who knows the answer would do --------

const SCRIPTS = {
  // 2x + 5 = 13. `algebra` is the balance workspace now (the answer box was
  // retired), so the student solves it there: subtract 5 from both sides,
  // cross out the zero pair, write 13 - 5 as 8; divide both sides by 2, cross
  // out the 2s, write 8 / 2 as 4. It sends the equation it ended on,
  // { finalEquation: " x = 4" }.
  algebra: async (page) => {
    await balanceMove(page, 'Subtract', '5');
    await page.locator('[data-term-text="+ 5"][aria-label$="select to cancel"]').first().click();
    await simplifySide(page, 'Right side', '8');
    await balanceMove(page, 'Divide by', '2');
    await btn(page, '2, mark this factor for cancellation').first().click();
    await simplifySide(page, 'Right side', '4');
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
      await btn(page, `Domain value ${from}`).click();
      await btn(page, `Range value ${to}`).click();
      await page.waitForTimeout(80);
    }
    await page.getByRole('textbox', { name: /^Domain/ }).fill('-2, 1, 3');
    await page.getByRole('textbox', { name: /^Range/ }).fill('-1, 2, 3');
    // "Is this relation a function?" is answered with its reason, and the tool
    // sends that reason's id: isFunction: "yes-definition".
    await page.getByRole('radio', { name: 'Yes — every input has exactly one output.' }).click();
    await btn(page, 'Check').click();
  },

  intervalNumberLine: async (page) => {
    // -3 is included and 5 is not.
    await placeEndpoint(page, -3, true);
    await placeEndpoint(page, 5, false);
    // The notation box is a MathLive field, not a plain input: what the student
    // types is serialized as LaTeX, which is the whole reason this capture has
    // to come from the browser rather than from a hand-written string.
    await typeMathField(page, 'Interval notation', '[-3, 5)');
    await btn(page, 'Check').click();
  },

  // Deliberately drawn right-ray first, so the capture proves union order does
  // not decide the verdict.
  intervalNumberLineRays: async (page) => {
    await placeEndpoint(page, 2, false);
    await btn(page, 'Shade right →').click();
    await placeEndpoint(page, -3, true);
    await btn(page, '← Shade left').click();
    await typeMathField(page, 'Interval notation', '(-\\infty, -3] \\cup (2, \\infty)');
    await btn(page, 'Check').click();
  },

  dataModelingLab: async (page) => {
    await page.getByRole('spinbutton', { name: 'Correlation coefficient r' }).fill('1');
    await page.getByRole('combobox', { name: 'Direction' }).selectOption({ label: 'Positive' });
    await page.getByRole('combobox', { name: 'Strength' }).selectOption({ label: 'Strong' });
    await btn(page, 'Check data model').click();
  },

  regressionCalculator: async (page) => {
    // Regression Calculator 2.0 intentionally opens blank. A student must
    // enter an ordered pair, discover the context-sensitive table conversion,
    // finish the x₁/y₁ table, then evaluate a regression expression.
    await page.getByLabel('Expression 1').fill('(1,2)');
    await btn(page, 'Settings and edit').click();
    await page.getByRole('menuitem', { name: 'Convert ordered pair to table' }).click();

    // Row 1 is the ordered pair; the student types the other three.
    for (const [row, x, y] of [[2, '2', '4'], [3, '3', '5'], [4, '4', '8']]) {
      await page.getByLabel(`x row ${row}`, { exact: true }).fill(x);
      await page.getByLabel(`y row ${row}`, { exact: true }).fill(y);
    }

    await btn(page, 'Add Regression').click();
    await page.waitForTimeout(150);

    await page.getByRole('combobox', { name: 'Direction' }).selectOption({ label: 'Positive' });
    await page.getByRole('combobox', { name: 'Strength' }).selectOption({ label: 'Strong' });
    await btn(page, 'Submit my regression').click();
  },

  systemsWorkspace: async (page) => {
    await page.getByRole('combobox', { name: 'How many solutions does this system have?' })
      .selectOption({ label: 'Exactly one solution' });
    await page.getByRole('spinbutton', { name: 'x', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: 'y', exact: true }).fill('5');
    await btn(page, 'Check system').click();
  },

  // x = 1, y = 2, z = 3. The RREF technology first (the work does not count
  // without it), then the classification, then x, y and z read off the RREF.
  systemsWorkspaceMatrix3: async (page) => {
    await btn(page, 'Use matrix technology · Compute RREF').click();
    await page.getByRole('combobox', { name: 'How many solutions does this system have?' })
      .selectOption({ label: 'Exactly one solution' });
    for (const [name, value] of [['x', 1], ['y', 2], ['z', 3]]) {
      await page.getByRole('spinbutton', { name, exact: true }).fill(String(value));
    }
    await btn(page, 'Check matrix solution').click();
  },

  // (5, 1) is not in the region; (0, 2) is.
  systemsWorkspaceInequalities: async (page) => {
    await page.getByRole('group', { name: 'Is the purple point (5, 1) in the feasible region?' })
      .getByRole('button', { name: 'No', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Your own feasible x', exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: 'Your own feasible y', exact: true }).fill('2');
    await btn(page, 'Check feasible region').click();
  },

  // y ≥ x through (0, 0) and (1, 1), solid, shaded above; y < -x + 4 through
  // (0, 4) and (1, 3), dashed, shaded below.
  systemsWorkspaceInequalityConstruct: async (page) => {
    const boundaries = [
      { points: [[0, 0], [1, 1]], style: 'Solid', shade: 'Above the boundary' },
      { points: [[0, 4], [1, 3]], style: 'Dashed', shade: 'Below the boundary' },
    ];
    for (const [index, { points: [[x1, y1], [x2, y2]], style, shade }] of boundaries.entries()) {
      for (const [name, value] of [['Boundary point 1: x', x1], ['Boundary point 1: y', y1], ['Boundary point 2: x', x2], ['Boundary point 2: y', y2]]) {
        await page.getByRole('spinbutton', { name, exact: true }).nth(index).fill(String(value));
      }
      // One-tap choices, one group per inequality.
      await page.getByRole('group', { name: 'Boundary style', exact: true }).nth(index).getByRole('button', { name: style, exact: true }).click();
      await page.getByRole('group', { name: 'Shade', exact: true }).nth(index).getByRole('button', { name: shade, exact: true }).click();
    }
    await btn(page, 'Check inequality graph').click();
  },

  // y = 2x + 1 through (0, 1) and (2, 5), plotted from the keyboard: the
  // crosshair starts at the origin, an arrow key moves it one unit, Enter plots.
  graphing2: async (page) => {
    await page.getByRole('application', { name: /^Coordinate plane for constructing your line/ }).focus();
    for (const keys of [['ArrowUp'], ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']]) {
      for (const key of keys) await page.keyboard.press(key);
      await page.keyboard.press('Enter');
    }
    await btn(page, 'Check construction').click();
  },

  // x - 6 = 9 → add 6 to both sides, cross out the zero pair, write 9 + 6 as 15.
  // The support level changes how much the workspace does for the student;
  // it does not change the shape of what it submits.
  stepAlgebra: async (page) => {
    await balanceMove(page, 'Add', '6');
    await page.locator('[data-term-text="+ 6"][aria-label$="select to cancel"]').first().click();
    await simplifySide(page, 'Right side', '15');
    await btn(page, 'Submit Solved Equation').click();
  },

  functionInvestigation: async (page) => {
    const plane = page.getByRole('application', { name: /^Coordinate plane\. / });

    // Each point by its exact coordinate: choose the point task, type x and y.
    for (const [label, x, y] of [['x = 0', 0, 1], ['x = 2', 2, 5]]) {
      await btn(page, `Plot the point where ${label}`).click();
      await page.getByRole('spinbutton', { name: 'x', exact: true }).fill(String(x));
      await page.getByRole('spinbutton', { name: 'y', exact: true }).fill(String(y));
      await btn(page, 'Place at this coordinate').click();
      await page.waitForTimeout(150);
    }
    await btn(page, 'Check Point Placements').click();
    await page.waitForTimeout(400);

    // The sketch is freehand, so it needs screen positions. The plane's own
    // axis labels give the mapping: the x labels share one row, and the y
    // labels are the rest.
    const fit = await plane.evaluate((svg) => {
      const marks = [...svg.querySelectorAll('text')]
        .filter((t) => /^[-−]?\d+$/.test(t.textContent.trim()))
        .map((t) => {
          const r = t.getBoundingClientRect();
          return { value: Number(t.textContent.trim().replace('−', '-')), cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
        });
      const rows = {};
      marks.forEach((m) => { const k = Math.round(m.cy); (rows[k] = rows[k] || []).push(m); });
      const xRow = Object.values(rows).sort((a, b) => b.length - a.length)[0];
      const line = (list, key) => {
        const sorted = [...list].sort((a, b) => a.value - b.value);
        const [a, b] = [sorted[0], sorted[sorted.length - 1]];
        const scale = (b[key] - a[key]) / (b.value - a.value);
        return { zero: a[key] - a.value * scale, scale };
      };
      return { x: line(xRow, 'cx'), y: line(marks.filter((m) => !xRow.includes(m)), 'cy') };
    });
    const at = (x, y) => ({ x: fit.x.zero + x * fit.x.scale, y: fit.y.zero + y * fit.y.scale });

    // Sketch the line through the two validated points so the curve snaps.
    const path = [];
    for (let x = -2.5; x <= 2.51; x += 0.25) path.push(at(x, 2 * x + 1));
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const point of path.slice(1)) await page.mouse.move(point.x, point.y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // A linear graph continues at both ends, so both ends take an arrow. The
    // workspace rings each graph end it expects one at; the student drops the
    // arrow on the ring.
    for (const end of ['Graph end 1', 'Graph end 2']) {
      await btn(page, /^➤ Arrow/).click();
      const ring = await plane.locator(`g:has(> text:text-is("${end}")) > circle`).boundingBox();
      await page.mouse.click(ring.x + ring.width / 2, ring.y + ring.height / 2);
      await page.waitForTimeout(300);
    }
    await btn(page, '2. Analyze Function').click();
    await page.waitForTimeout(400);
    const analysis = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Analysis Parts' }) });
    await setMathField(analysis.locator('math-field'), '(-\\infty, \\infty)');
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
  await page.goto(`${process.env.AUDIT_ORIGIN || 'http://localhost:5199'}/tests/browser/captureToolResponses.html?tool=${toolId}`, { waitUntil: 'networkidle' });
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

const fixturePath = new URL('../platform/fixtures/capturedToolResponses.json', import.meta.url);
const previous = JSON.parse(await readFile(fixturePath, 'utf8').catch(() => '{}'));

// A tool this run could not drive keeps its previous capture rather than
// disappearing: a missing entry fails the contract test outright, which would
// read as "this tool has no server grader" instead of "the harness script is
// out of date". Losing a capture must be a decision, not a side effect.
const missing = Object.entries(results).filter(([, entry]) => !entry.captured).map(([id]) => id);
const merged = { ...previous };
Object.entries(results).forEach(([id, entry]) => {
  if (entry.captured) merged[id] = { pathToolId: entry.captured.pathToolId, rawWork: entry.captured.rawWork };
});

writeFileSync(fixturePath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(results).length - missing.length} fresh captures.`);
if (missing.length) {
  console.error(`KEPT THE PREVIOUS CAPTURE for: ${missing.join(', ')} — the harness could not drive ${missing.length === 1 ? 'it' : 'them'}.`);
  console.error('Confirm the wire format by hand, or fix the script, before trusting those entries.');
  process.exitCode = 1;
}
