// DOES ENTER EVER SPEND AN ATTEMPT BY SURPRISE, IN ANY REGISTRY TOOL?
//
//   npx vite --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://localhost:5199 node tests/browser/enterContractSurvey.mjs          # check
//   AUDIT_ORIGIN=http://localhost:5199 node tests/browser/enterContractSurvey.mjs --write  # refresh the fixture
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed)
//
// Every registry tool is mounted (toolOpenAudit.html, its sample spec) and
// used the way a student with an Enter habit does: each typed box in turn,
// click, type a number, Enter. The survey records what each Enter did — moved
// to another box, brought a button into focus, pressed a card action, or
// SUBMITTED AN ATTEMPT — and which buttons the tool declares for Enter
// (answerEntryUx.js). The platform quirks audit found three tools whose first
// Enter spent an attempt while a choice, a plane or a second box was still
// unset; the fixture it writes is asserted by
// tests/platform/enterContractSurvey.test.mjs, which fails if any Enter
// submits an attempt from a tool that has more than one answer control.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FIXTURE = path.join(repo, 'tests/platform/fixtures/enterContractSurvey.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const WRITE = process.argv.includes('--write');
const ONLY = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.goto(`${ORIGIN}/tests/browser/toolOpenAudit.html`, { timeout: 120000 });
await page.waitForFunction(() => Array.isArray(window.__TOOL_IDS__), null, { timeout: 120000 });
const toolIds = ONLY.length ? ONLY : await page.evaluate(() => window.__TOOL_IDS__);

const focusedControl = () => {
  const element = document.activeElement;
  if (!element || element === document.body) return { kind: 'none' };
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return { kind: 'button', declared: element.getAttribute('data-mm-enter-action') || (element.getAttribute('data-primary-answer-action') ? 'submit' : null), text: element.textContent.trim().slice(0, 40) };
  if (element.getAttribute('data-enter-survey-field') !== null) return { kind: 'field', index: Number(element.getAttribute('data-enter-survey-field')) };
  return { kind: tag };
};

const rows = [];
for (const toolId of toolIds) {
  await page.goto(`${ORIGIN}/tests/browser/toolOpenAudit.html?tool=${toolId}`, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('[data-audit-root]')?.children.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  const inventory = await page.evaluate(() => {
    const root = document.querySelector('[data-audit-root]');
    const shown = (element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
    const fields = [...root.querySelectorAll('input, math-field')].filter((element) => shown(element) && !element.disabled && !element.readOnly
      && !['radio', 'checkbox', 'range', 'hidden', 'button', 'submit', 'color', 'file'].includes((element.getAttribute('type') || '').toLowerCase()));
    fields.forEach((element, index) => element.setAttribute('data-enter-survey-field', String(index)));
    const other = [...root.querySelectorAll('select, textarea, input[type="radio"], input[type="checkbox"], svg[role="application"], [role="radiogroup"], [role="slider"]')].filter(shown);
    return {
      typedFields: fields.length,
      otherAnswerControls: other.length,
      ownsEnter: fields.filter((element) => element.closest('[data-mm-enter-owner]')).length,
      declared: [...root.querySelectorAll('button[data-mm-enter-action], button[data-primary-answer-action="true"]')].filter(shown)
        .map((button) => ({ kind: button.getAttribute('data-mm-enter-action') || 'submit', text: button.textContent.trim().slice(0, 40) })),
    };
  });
  const enters = [];
  for (let index = 0; index < Math.min(inventory.typedFields, 10); index += 1) {
    const field = page.locator(`[data-enter-survey-field="${index}"]`);
    if (!(await field.isVisible().catch(() => false))) { enters.push({ field: index, result: 'field-gone' }); continue; }
    const before = await page.evaluate(() => window.__TOOL_ACTIONS__.length);
    try {
      await field.click({ timeout: 2000 });
      await page.waitForTimeout(120);
      await page.keyboard.type('3');
      await page.waitForTimeout(80);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    } catch (error) {
      enters.push({ field: index, result: `could-not-drive: ${String(error?.message || error).split('\n')[0].slice(0, 80)}` });
      continue;
    }
    const raised = await page.evaluate((from) => window.__TOOL_ACTIONS__.slice(from).map((action) => action.type), before);
    const attempt = raised.some((type) => /ATTEMPT_SUBMITTED/.test(type));
    enters.push({ field: index, submittedAttempt: attempt, actions: [...new Set(raised)], focus: await page.evaluate(focusedControl) });
  }
  rows.push({ toolId, ...inventory, enters });
  const summary = enters.map((entry) => (entry.submittedAttempt ? 'ATTEMPT' : entry.focus?.kind === 'button' ? `focus:${entry.focus.text}` : entry.focus?.kind === 'field' ? `next:#${entry.focus.index}` : entry.result || entry.focus?.kind)).join(' → ');
  console.log(`${toolId.padEnd(28)} typed=${inventory.typedFields} other=${inventory.otherAnswerControls} declared=${inventory.declared.map((entry) => entry.kind).join(',') || '—'}  ${summary}`);
}
await browser.close();

const surprises = rows.filter((row) => (row.typedFields + row.otherAnswerControls) > 1 && row.enters.some((entry) => entry.submittedAttempt));
if (WRITE) {
  writeFileSync(FIXTURE, `${JSON.stringify({ generatedAt: new Date().toISOString(), viewport: '1366x900', tools: rows }, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(repo, FIXTURE)}`);
}
if (surprises.length) {
  console.error(`\nEnter submitted an attempt from a tool with more than one answer control: ${surprises.map((row) => row.toolId).join(', ')}`);
  process.exit(1);
}
console.log('\nNo single Enter submitted an attempt from a tool with more than one answer control.');
