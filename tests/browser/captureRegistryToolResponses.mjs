// Capture what four registry tools really send, from a real browser (CI02).
//
// HOW TO RUN (the Path Tool Browser Contract workflow runs it too):
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   node tests/browser/captureRegistryToolResponses.mjs                 # every tool
//   node tests/browser/captureRegistryToolResponses.mjs matrixLab       # one tool
//
// AUDIT_ORIGIN points it at a dev server on another origin.
//
// captureToolResponses.mjs captures the Path tools. Polynomial Workshop,
// Representation Bridge, Representation Match and Matrix Lab are not Path
// tools, so it had no script for them (finding C2-58) and nothing checked that
// the server grades what they really send. This drives each one through its
// rendered controls as a student who knows the answer
// (tests/platform/fixtures/registryToolQuestions.mjs) and rewrites
// tests/platform/fixtures/capturedRegistryToolResponses.json with the verdict
// the browser reached and the structured response QuestionEngine recorded with
// the attempt. tests/platform/registryToolCapturedResponses.test.mjs grades
// those captures on the server's contract on every run.
//
// Controls are found by accessible name, never by position, as in
// captureToolResponses.mjs. Exits non-zero when a tool could not be driven; its
// previous capture is kept, so the fixture never silently loses one.

import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const only = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || null;
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// The tool's own final button, not the Work View rail's hidden copy.
const toolSubmit = async (page) => {
  const button = page.locator('.mathmaster-tool-shell button[data-mm-enter-action="submit"], .mathmaster-tool-shell button[data-primary-answer-action="true"], .mathmaster-tool-shell button[data-work-view-check="true"]').first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(900);
};
const box = (page, name) => page.getByRole('textbox', { name, exact: true });

const SCRIPTS = {
  // x² − 5x + 6 = (x + p)(x + q): p = −2, q = −3.
  polynomialWorkshop: async (page) => {
    await box(page, 'p').fill('-2');
    await box(page, 'q').fill('-3');
    await toolSubmit(page);
  },

  // y = 5x − 20 and y = 5(x − 4), each written in its own boxes.
  representationBridge: async (page) => {
    for (const [name, value] of [
      ['Slope m in general form', '5'],
      ['y-intercept b in general form', '-20'],
      ['Equation in general/slope-intercept form', 'y = 5x - 20'],
      ['Coefficient a in factored form', '5'],
      ['Zero c in factored form', '4'],
      ['Equation in factored linear form', 'y = 5(x - 4)'],
    ]) await box(page, name).fill(value);
    await toolSubmit(page);
  },

  // The point-slope card is the one that does not match; its correction is y − 1 = −2(x − 2).
  representationMatch: async (page) => {
    await page.getByRole('radiogroup', { name: 'Which card does not describe the same line?' }).getByRole('radio', { name: /^Point-slope equation/ }).first().click();
    await page.locator('.mathmaster-tool-shell select').first().selectOption('minus');
    await toolSubmit(page);
  },

  // A and B read off the three equations.
  matrixLab: async (page) => {
    const rows = [[2, -3, 1, 7], [1, 1, 1, -5], [1, 2, 4, -17]];
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = 0; j < 3; j += 1) await page.getByLabel(`Coefficient matrix A, row ${i + 1}, coefficient of ${'xyz'[j]}`, { exact: true }).fill(String(rows[i][j]));
      await page.getByLabel(`Constant matrix B, row ${i + 1}`, { exact: true }).fill(String(rows[i][3]));
    }
    await toolSubmit(page);
  },
};

const results = {};
for (const toolId of Object.keys(SCRIPTS)) {
  if (only && toolId !== only) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/captureRegistryToolResponses.html?tool=${toolId}`, { waitUntil: 'networkidle' });
  await page.locator('.mathmaster-tool-shell').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
  let scriptError = null;
  try {
    await SCRIPTS[toolId](page);
  } catch (error) {
    scriptError = error.message.split('\n')[0];
  }
  const captured = await page.evaluate(() => window.__mmCaptured);
  results[toolId] = { captured, scriptError, errors };
  console.log(`=== ${toolId} ${captured?.toolResponse ? `CAPTURED (browser: ${captured.browserIsCorrect ? 'correct' : 'NOT correct'})` : 'NOTHING'} ${scriptError ? `script: ${scriptError}` : ''}`);
  if (captured?.toolResponse) console.log(JSON.stringify(captured.toolResponse).slice(0, 400));
  if (errors.length) console.log('  page errors:', errors.slice(0, 2));
  await page.close();
}
await browser.close();

const fixturePath = new URL('../platform/fixtures/capturedRegistryToolResponses.json', import.meta.url);
const previous = JSON.parse(await readFile(fixturePath, 'utf8').catch(() => '{}'));
// A tool this run could not drive, or that the browser itself did not mark
// right, keeps its previous capture: losing one must be a decision.
const failed = Object.entries(results).filter(([, entry]) => !entry.captured?.toolResponse || entry.captured.browserIsCorrect !== true).map(([id]) => id);
const merged = { ...previous };
Object.entries(results).forEach(([id, entry]) => {
  if (!failed.includes(id)) merged[id] = { toolId: id, browserIsCorrect: true, toolResponse: entry.captured.toolResponse };
});
const ordered = Object.fromEntries(Object.keys(merged).sort().map((id) => [id, merged[id]]));
writeFileSync(fixturePath, `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(results).length - failed.length} fresh captures.`);
if (failed.length) {
  console.error(`KEPT THE PREVIOUS CAPTURE for: ${failed.join(', ')} — the harness could not drive ${failed.length === 1 ? 'it' : 'them'} to a right answer.`);
  process.exitCode = 1;
}
