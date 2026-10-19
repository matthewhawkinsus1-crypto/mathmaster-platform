// READ ALOUD AND TRANSLATE, HEARD AND SEEN THROUGH THE REAL QUESTION ENGINE
// (student pass 3, batch 6: HELP-6 / H-115 and HELP-3).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/readAloudTranslate.mjs
//
// The page's speech engine is replaced by a recorder (window.__mmSpoken), so
// the driver checks what a student would HEAR. At 1366×768 and 390×844:
//
//   read aloud   the work bar's Read (a plan's text-to-speech) says the whole
//                real matrices item: the prompt, both matrices row by row and
//                every part with its choices in the order they are drawn;
//                the Support tools tray offers "Read a part", and one part
//                can be heard again on its own.
//   universal    a student with no plan, in practice: the tray's Read aloud
//                says the same whole question and opens the parts.
//   translate    a platform hint is shown in Spanish (lang="es") and Read
//                then speaks the Spanish; a teacher-written hint says plainly
//                that it has no Spanish translation — no dead button.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/readAloudTranslate.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/readAloudTranslate');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const DEVICES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

// A speech engine that records instead of speaking.
const SPEECH_RECORDER = () => {
  window.__mmSpoken = [];
  class Utterance { constructor(text) { this.text = text; this.lang = ''; } }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (utterance) => window.__mmSpoken.push({ text: utterance.text, lang: utterance.lang || '' }), cancel() {}, getVoices: () => [] },
  });
};

let run = 0;
const open = async (device, query) => {
  run += 1;
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false });
  await context.addInitScript(SPEECH_RECORDER);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${run}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(700);
  return { page, context };
};
const lastSpoken = (page) => page.evaluate(() => window.__mmSpoken[window.__mmSpoken.length - 1] || null);
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
// The visible text of every choice button, in the order the screen draws them.
const drawnChoices = (page) => page.locator('[role="radio"]').evaluateAll((buttons) => buttons.map((button) => {
  const copy = button.cloneNode(true);
  copy.querySelectorAll('[style*="position: absolute"], [style*="position:absolute"]').forEach((node) => node.remove());
  return copy.textContent.trim();
}));
// What the drawn choice says aloud: "−6" is "negative 6", and in a question
// about dimensions "3 × 4" is "3 by 4".
const spokenChoice = (choice) => choice.replace(/−/g, 'negative ').replace(/ × /g, ' by ');

for (const device of DEVICES) {
  /* ------------------------------------- a plan's Read aloud, work bar + parts */
  {
    const { page, context } = await open(device, 'q=matrices&role=practice&support=read');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    check(await read.isVisible(), `${device.name}: the work bar carries Read aloud`);
    await read.click();
    const whole = await lastSpoken(page);
    const said = whole?.text || '';
    check(/Matrices A and B are shown\. Matrix C has dimensions 3 by 2/.test(said), `${device.name}: the prompt is read, "3 × 2" as "3 by 2"`, said.slice(0, 120));
    check(/Matrix A, 2 by 2\. Row 1: 2, negative 1\. Row 2: 0, 3\. Matrix B, 2 by 2\. Row 1: 4, 1\. Row 2: negative 2, 5\./.test(said), `${device.name}: both matrices are read row by row`);
    const choices = await drawnChoices(page);
    let cursor = 0;
    const inOrder = choices.every((choice) => {
      const at = said.indexOf(spokenChoice(choice), cursor);
      if (at < 0) return false;
      cursor = at;
      return true;
    });
    check(choices.length === 12 && inOrder, `${device.name}: every choice is read, in the order it is drawn`, choices.join(' | '));
    check(/What are the dimensions of DC\? Choices: /.test(said), `${device.name}: each part's question is read before its choices`);

    const partsButton = page.locator('[data-support-tool="read-parts"]').first();
    check(await partsButton.isVisible(), `${device.name}: the tray offers "Read a part" beside the work bar's Read`);
    await partsButton.click();
    const part = page.locator('[data-read-part="part"]').nth(1);
    check(await part.isVisible(), `${device.name}: the parts are listed`);
    await part.click();
    const again = (await lastSpoken(page))?.text || '';
    check(/^What are the dimensions of CD\? Choices: .*\.$/.test(again) && !/Matrix A/.test(again), `${device.name}: one part is heard again, on its own`, again);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-read-parts.png`) });
    await noSidewaysScroll(page, `${device.name} read aloud`);
    await context.close();
  }

  /* ----------------------------------------- universal design: the tray's Read */
  {
    const { page, context } = await open(device, 'q=matrices&role=practice');
    check(await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').count() === 0, `${device.name}: no plan, no work-bar Read`);
    const trayRead = page.locator('[data-support-tool="read-aloud"]').first();
    check(await trayRead.isVisible(), `${device.name}: the tray offers Read aloud to every student in practice`);
    await trayRead.click();
    const said = (await lastSpoken(page))?.text || '';
    check(/Row 2: negative 2, 5\..*Choices: /.test(said), `${device.name}: the tray reads the whole question too`);
    check(await trayRead.getAttribute('aria-expanded') === 'true' && await page.locator('[data-read-part]').count() >= 5, `${device.name}: the parts open under it`);
    await context.close();
  }

  /* ------------------------------------------------------------- Translate */
  {
    // A platform hint (the question family's own words).
    const { page, context } = await open(device, 'q=family&role=practice&support=translate');
    await page.locator('[data-hint-control]').click();
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
    const actions = page.locator('.mathmaster-hint-panel [data-supported-text-actions]').first();
    const translate = actions.getByRole('button', { name: /Translate/ });
    check(await translate.isVisible(), `${device.name}: a platform hint offers Translate`);
    await translate.click();
    const spanish = actions.locator('[data-translated-text][lang="es"]');
    await spanish.waitFor();
    const text = await spanish.textContent();
    check(/[áéíóúñ¿¡]|\b(la|el|los|las|de|en|para)\b/i.test(text), `${device.name}: the hint is shown in Spanish`, text.slice(0, 140));
    check(await actions.getByRole('button', { name: /Translate/ }).getAttribute('aria-pressed') === 'true', `${device.name}: the button says it is showing the translation`);
    await actions.getByRole('button', { name: /Read hint 1 aloud/ }).click();
    const heard = await lastSpoken(page);
    check(heard?.lang === 'es' && /[a-záéíóúñ]/i.test(heard?.text || ''), `${device.name}: Read then speaks the Spanish, in a Spanish voice`, JSON.stringify(heard).slice(0, 140));
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-translated-hint.png`) });
    await noSidewaysScroll(page, `${device.name} translate`);
    await context.close();
  }
  {
    // A teacher-written hint: honest, and no dead button.
    const { page, context } = await open(device, 'q=multi&role=practice&support=translate');
    await page.locator('[data-hint-control]').click();
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
    const actions = page.locator('.mathmaster-hint-panel [data-supported-text-actions]').first();
    await page.waitForTimeout(400);
    check(await actions.getByRole('button', { name: /Translate/ }).count() === 0, `${device.name}: no Translate button that cannot translate`);
    check(await actions.getByText('No Spanish translation for this text yet.').isVisible(), `${device.name}: the student is told there is no Spanish for this text`);
    check(await actions.getByRole('button', { name: /Read hint 1 aloud/ }).isVisible(), `${device.name}: Read aloud is still there`);
    await context.close();
  }
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
