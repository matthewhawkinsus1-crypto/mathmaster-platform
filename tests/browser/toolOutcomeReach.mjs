// A TOOL'S OUTCOME BOX CAN ALWAYS BE SCROLLED CLEAR OF THE ACTION BAR.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/toolOutcomeReach.mjs
//
// Student pass 3, wave 7 (STUDENT_PASS3_STUDENT_WORDS.md, review B2): with
// both offers ("Show a hint" and "See a similar problem worked") and the hint
// sentence, a tool's outcome box ended 4 px above a 390×844 phone's action bar
// after its own scroll, and the handoff feared a longer message would go
// under the bar with no way to scroll it clear.
//
// In the real QuestionEngine, App.jsx's wrappers and the real identity bar
// (the toolAttemptOutcome harness), after two wrong tries, so the box holds
// the outcome, the tool's coaching, Read, the hint sentence and both offers:
//   for 390×844 and 360×640, inline and in Work View, for three tools
//   (Inverse & Composition, Function Investigation, Regression Calculator),
//   with the box as it is, lengthened by the longest English sentence the
//   wave-7 tool messages hold (three times over), and lengthened by the
//   longest Spanish sentence of the support pack (lang="es", three times):
//     - scrolled as far as it goes, the box's bottom is above the bar (the
//       work bar inline, the Work View rail in Work View) and on screen;
//     - scrolled to its start, the box's first line is on screen and not
//       under anything (the tries strip, the Work View header).
// So every line of the box can be read, however long it is.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/toolOutcomeReach.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { supportSentences } from '../../src/platform/language/packs/esSupport.js';
import { REGRESSION_FEEDBACK } from '../../src/tools/regressionCalculator/regressionFeedback.js';
import { LINEAR_MISMATCH_FEEDBACK } from '../../src/tools/representationMatch/linearMismatchFeedback.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/toolOutcomeReach');
mkdirSync(ARTIFACTS, { recursive: true });

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const longest = (list) => [...list].sort((a, b) => b.length - a.length)[0];
const ENGLISH = longest([...Object.values(REGRESSION_FEEDBACK), ...Object.values(LINEAR_MISMATCH_FEEDBACK)]);
const SPANISH = longest(supportSentences.map(([, es]) => es));
const LENGTHS = [
  { name: 'as given', text: null },
  { name: 'longest English ×3', text: `${ENGLISH} ${ENGLISH} ${ENGLISH}`, lang: 'en' },
  { name: 'longest Spanish ×3', text: `${SPANISH} ${SPANISH} ${SPANISH}`, lang: 'es' },
];
const SIZES = [[390, 844], [360, 640]];
const TOOLS = ['inverse', 'investigation', 'regression'];
const run = Date.now();

// Two wrong tries with different answers, the way toolAttemptOutcome makes them.
const attemptWrong = async (page, value) => {
  await page.evaluate((entry) => {
    const shell = document.querySelector('.mathmaster-tool-shell');
    const setValue = (element, next) => {
      const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    shell.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox])').forEach((element) => setValue(element, entry));
  }, value);
  await page.waitForTimeout(150);
  const button = page.locator('.mathmaster-tool-shell button[data-mm-enter-action="submit"], .mathmaster-tool-shell button[data-primary-answer-action="true"]').first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(900);
};

// Where the box can be brought: its bottom with every scroller at its end,
// and its first line with the box scrolled to its start.
const reach = (page, { workView, text, lang }) => page.evaluate(({ workView: inWorkView, text: extra, lang: language }) => {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.height > 2 && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  };
  const box = [...document.querySelectorAll('.mathmaster-tool-attempt-outcome[data-attempt-outcome="shown"]')].filter(visible).pop();
  if (!box) return { error: 'no outcome box on screen' };
  document.querySelectorAll('[data-reach-extra]').forEach((element) => element.remove());
  // The worst case: nothing of the engine's below the tool. ("This is the
  // same answer as your last try…" follows it only after a repeated answer.)
  [...document.querySelectorAll('p')].filter((element) => /^This is the same answer as your last try/.test((element.textContent || '').trim())).forEach((element) => element.remove());
  if (extra) {
    const line = document.createElement('span');
    line.dataset.reachExtra = '';
    line.lang = language;
    line.style.display = 'block';
    line.textContent = extra;
    box.appendChild(line);
  }
  const bar = inWorkView
    ? document.querySelector('.mathmaster-work-view-actions')
    : document.querySelector('.portrait-action-bar, .mathmaster-desktop-action-bar, .landscape-action-bar');
  const barTop = bar && visible(bar) ? bar.getBoundingClientRect().top : window.innerHeight;
  const scrollers = [];
  for (let element = box.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) scrollers.push(element);
  }
  scrollers.forEach((element) => { element.scrollTop = element.scrollHeight; });
  window.scrollTo(0, document.documentElement.scrollHeight);
  const end = box.getBoundingClientRect();
  // Its start: the first line must be where a finger can read it.
  box.scrollIntoView({ block: 'start', inline: 'nearest' });
  const start = box.getBoundingClientRect();
  const probeX = Math.round(start.left + Math.min(24, start.width / 2));
  const probeY = Math.round(start.top + 6);
  const atStart = document.elementFromPoint(probeX, probeY);
  // Regression's box is an inline run inside its verdict's live region: the
  // point may land on that region's own text, the line the box continues.
  const holder = box.parentElement?.closest('[role="status"]') || box;
  const ours = (element) => Boolean(element) && (holder === element || holder.contains(element));
  return {
    hint: [...box.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Show a hint'),
    similar: Boolean(box.querySelector('button[data-similar-offer]')),
    height: Math.round(end.height),
    bottom: Math.round(end.bottom),
    barTop: Math.round(barTop),
    innerHeight: window.innerHeight,
    top: Math.round(start.top),
    topCovered: !ours(atStart),
    coveredBy: atStart && !ours(atStart) ? `${atStart.tagName}.${String(atStart.className).slice(0, 50)}` : '',
  };
}, { workView, text, lang });

for (const [width, height] of SIZES) {
  for (const tool of TOOLS) {
    for (const workView of [false, true]) {
      const where = `${width}×${height} ${tool} ${workView ? 'Work View' : 'inline'}`;
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on('pageerror', (error) => failures.push(`${where}: page error ${error.message}`));
      await page.goto(`${ORIGIN}/tests/browser/toolAttemptOutcome.html?role=practice&tool=${tool}&prior=0&run=${run}-${width}-${tool}-${workView}`, { waitUntil: 'networkidle' });
      await page.locator('.mathmaster-tool-shell').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(600);
      await attemptWrong(page, '99');
      await attemptWrong(page, '98');
      if (workView) {
        await page.getByRole('button', { name: /Open Work View/ }).first().click();
        await page.waitForTimeout(900);
      }
      for (const length of LENGTHS) {
        const state = await reach(page, { workView, text: length.text, lang: length.lang });
        const label = `${where}, ${length.name}`;
        if (state.error) { check(false, label, state.error); continue; }
        if (length.text === null) check(state.hint && state.similar, `${label}: the box holds both offers`, `hint ${state.hint}, similar ${state.similar}`);
        check(state.bottom <= state.barTop && state.bottom <= state.innerHeight, `${label}: scrolled to the end, the whole box is above the bar`, `box ${state.height}px ends at ${state.bottom}, bar at ${state.barTop}`);
        check(!state.topCovered && state.top >= 0, `${label}: scrolled to its start, the first line is on screen and uncovered`, `top ${state.top}${state.coveredBy ? `, under ${state.coveredBy}` : ''}`);
        if (length.name !== 'as given' && width === 390) {
          await page.screenshot({ path: path.join(ARTIFACTS, `${width}-${tool}-${workView ? 'workview' : 'inline'}-${length.lang}.png`) });
        }
      }
      await context.close();
    }
  }
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} outcome-reach failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nEvery line of a tool\'s outcome box can be scrolled clear of the action bar, inline and in Work View, at 390×844 and 360×640.');
