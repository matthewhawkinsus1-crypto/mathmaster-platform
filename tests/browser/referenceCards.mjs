// THE PINNED REFERENCE CARDS (WE-H; WORKED_EXAMPLES.md sections 4 and 5).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/referenceCards.mjs
//
// In the real QuestionEngine (the feedbackTeaches harness, ?card=), through
// rendered controls only, at 1366×768 and on a 390×844 touch phone:
//
//   pinned      on Classwork and Practice the lesson's cards are above the
//               work, before anything is pressed: each card's title, its
//               formulas and its parts named (open on a laptop, one tap away
//               on a phone). A card's `sections` decide which sections, by
//               role or id; a skill with no built-in card shows nothing;
//   score       a right answer with a card is graded right with the same
//               credit as without one, and the card is recorded only as a
//               fact (referenceCardShown): never help, never independence;
//   never       on a DOL, quiz or test, on a DOL practised after its due date,
//               and on a card forged to name a DOL, no part of a card, none of
//               its words, and its chunk is never fetched;
//   keyboard    Tab reaches the parts' disclosure, Enter opens and closes it,
//               and Read and Translate are reached in order;
//   supports    Read aloud reads the whole card (title, formulas, parts);
//               Translate shows it in Spanish (lang="es", the same formulas),
//               and Read aloud then reads the Spanish;
//   display     nothing scrolls sideways and nothing leaves the card on the
//               phone, at 200% browser text, in the dark theme (text contrast
//               4.5:1) and in forced colours (the card and its controls keep
//               their edges).
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/referenceCards.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';
import { REFERENCE_CARD_SELECTORS } from './support/assessmentLadderWords.mjs';
import { REFERENCE_CARD_TEXT } from '../../src/platform/supports/referenceCards/referenceCardLibrary.js';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/referenceCards');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${String(detail).replace(/\s+/g, ' ')}` : ''}`);
  if (!ok) failures.push(label);
};

const DESKTOP = { name: 'desktop', viewport: { width: 1366, height: 768 } };
const PHONE = { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DEVICES = [DESKTOP, PHONE];
// Two cards: the cubes (two formulas, four parts) and the slope formula.
const CARDS = 'card=factor.sumDifferenceOfCubes,lines.slopeFormula';
const CARD_CHUNK = /ReferenceCards\.jsx|referenceCardLibrary\.js/;

// A speech engine that records instead of speaking (readAloudTranslate.mjs).
const SPEECH_RECORDER = () => {
  window.__mmSpoken = [];
  class Utterance { constructor(text) { this.text = text; this.lang = ''; } }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (utterance) => window.__mmSpoken.push({ text: utterance.text, lang: utterance.lang || '' }), cancel() {}, getVoices: () => [] },
  });
};

let runs = 0;
const open = async (device, query, { contextOptions = {}, textScale = 1, theme = null, expectCard = true } = {}) => {
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile || false,
    hasTouch: device.hasTouch || false,
    reducedMotion: 'reduce',
    ...contextOptions,
  });
  await context.addInitScript(SPEECH_RECORDER);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, String(error)));
  const fetched = [];
  page.on('request', (request) => { if (CARD_CHUNK.test(request.url())) fetched.push(request.url()); });
  if (textScale !== 1) {
    // The browser's text-size setting (WCAG 1.4.4), as studentShellLargeText does it.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * textScale), fixed: Math.round(13 * textScale) } });
  }
  runs += 1;
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${runs}`, { waitUntil: 'networkidle' });
  if (theme) await page.evaluate((scheme) => { document.documentElement.dataset.theme = scheme; document.documentElement.style.colorScheme = scheme; }, theme);
  await page.locator('[data-feedback-fixture]').waitFor();
  if (expectCard) await page.locator('[data-reference-card]').first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { page, context, fetched };
};

const cardsOn = (page) => page.locator('[data-reference-card]').evaluateAll((nodes) => nodes.map((node) => ({
  id: node.getAttribute('data-reference-card'),
  title: node.querySelector('[data-reference-card-title]')?.textContent.trim() || '',
  formulas: node.querySelectorAll('[data-reference-card-formula]').length,
  parts: node.querySelectorAll('[data-reference-card-part]').length,
  partsOpen: node.querySelector('[data-reference-card-parts]')?.open === true,
})));
const answer = async (page, value) => {
  const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
  await field.waitFor();
  await field.evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await page.waitForTimeout(250);
};
const submit = async (page) => {
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForTimeout(700);
};
const grades = (page) => page.evaluate(() => window.__mmGrades.map((entry) => ({ isCorrect: entry.isCorrect, usage: entry.supportUsage })));
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
// Every line and control of each card lies inside the card, and the card inside the screen's width.
const fitsItsBox = async (page, where) => {
  const problems = await page.locator('[data-reference-card]').evaluateAll((cards) => cards.flatMap((card) => {
    const found = [];
    const box = card.getBoundingClientRect();
    if (box.left < -1 || box.right > document.documentElement.clientWidth + 1) found.push(`card ${Math.round(box.left)}..${Math.round(box.right)} of ${document.documentElement.clientWidth}`);
    card.querySelectorAll('button, p, summary, dt, dd, li, .ML__latex, math-span, [data-math-display]').forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return;
      if (rect.left < box.left - 1 || rect.right > box.right + 1) found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" leaves the card (${Math.round(rect.left)}..${Math.round(rect.right)} of ${Math.round(box.left)}..${Math.round(box.right)})`);
    });
    card.querySelectorAll('button, summary').forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.height < 43.5) found.push(`${element.tagName} "${element.textContent.trim()}" is ${Math.round(rect.height)}px tall`);
    });
    return found;
  }));
  check(problems.length === 0, `${where}: every card's lines and controls fit inside it`, problems.join('; '));
};
// The card's own words and parts. (The rest of the ladder is the assessment
// leak gate's: a DOL practised after its due date runs as practice and keeps
// its hints, so they are not a card's leak.)
const CARD_WORDS = Object.values(REFERENCE_CARD_TEXT).flatMap((words) => Object.values(words));
const leaks = async (page) => {
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const controls = await page.evaluate((selectors) => selectors.filter((selector) => document.querySelector(selector)), REFERENCE_CARD_SELECTORS);
  return [...CARD_WORDS.filter((text) => html.includes(text)), ...controls];
};

/* ------------------------------------- pinned on Classwork and on Practice */
for (const device of DEVICES) {
  for (const section of ['classwork', 'practice']) {
    const { page, context, fetched } = await open(device, `q=multi&role=${section}&section=${section}&${CARDS}`);
    const where = `${device.name} ${section}`;
    const cards = await cardsOn(page);
    check(cards.map((card) => card.id).join(' ') === 'card-1 card-2', `${where}: both cards are pinned before anything is pressed`, JSON.stringify(cards));
    check(cards[0]?.title === 'Sum and difference of cubes' && cards[0]?.formulas === 2 && cards[0]?.parts === 4, `${where}: the cubes card has its title, both formulas and its four parts`, JSON.stringify(cards[0]));
    check(cards[1]?.title === 'The slope formula' && cards[1]?.formulas === 1 && cards[1]?.parts === 3, `${where}: the slope card has its title, its formula and its parts`, JSON.stringify(cards[1]));
    check(cards.every((card) => card.partsOpen === !device.isMobile), `${where}: the parts are ${device.isMobile ? 'one tap away on a phone' : 'open on a laptop'}`, JSON.stringify(cards.map((card) => card.partsOpen)));
    check(fetched.length >= 1, `${where}: the card's chunk was fetched`);
    const place = await page.evaluate(() => {
      const row = document.querySelector('[data-reference-cards-row]');
      const field = document.querySelector('.mathmaster-question-tool-workspace math-field');
      return { inTopRow: Boolean(row?.classList.contains('mathmaster-top-panel-row')), above: Boolean(row && field && row.getBoundingClientRect().top < field.getBoundingClientRect().top) };
    });
    check(place.inTopRow && place.above, `${where}: the cards are pinned at the top of the work, above the answer box`, JSON.stringify(place));
    // Clear of the Open Work View button that starts the work (as the help panel is).
    const overlap = await page.evaluate(() => {
      const opener = [...document.querySelectorAll('button')].find((element) => /Open Work View/.test(element.textContent) && element.getBoundingClientRect().width > 0);
      const cards = document.querySelector('[data-reference-cards]');
      if (!opener || !cards) return 'none';
      const a = opener.getBoundingClientRect();
      return [...cards.querySelectorAll('p, li, summary, [data-reference-card]')].some((element) => {
        const b = element.getBoundingClientRect();
        return b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      }) ? 'overlaps' : 'clear';
    });
    check(overlap !== 'overlaps', `${where}: nothing of the cards is under the Open Work View button`, overlap);
    const formula = await page.locator('[data-reference-card="card-1"] [data-reference-card-formula]').first().innerText();
    check(/Sum of cubes/.test(formula), `${where}: each formula carries its name`, formula.slice(0, 80));
    await noSidewaysScroll(page, where);
    await fitsItsBox(page, where);
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-${section}.png`) });
    // The phone's parts open with one tap, and fit too.
    if (device.isMobile) {
      await page.locator('[data-reference-card="card-1"] [data-reference-card-parts] > summary').tap();
      await page.waitForTimeout(150);
      check(await page.locator('[data-reference-card="card-1"] [data-reference-card-parts]').evaluate((node) => node.open), `${where}: a tap opens the parts`);
      await fitsItsBox(page, `${where}, parts open`);
      await noSidewaysScroll(page, `${where}, parts open`);
    }
    // Graded as ever, and the card recorded only as a fact.
    await answer(page, '3/4');
    await submit(page);
    const graded = await grades(page);
    check(graded.length === 1 && graded[0].isCorrect === true, `${where}: the right answer is graded right`, JSON.stringify(graded));
    check(graded[0]?.usage?.referenceCardShown === true && graded[0]?.usage?.isMathematicallyIndependent === true && graded[0]?.usage?.hintUsed === false && graded[0]?.usage?.workedExampleUsed === false,
      `${where}: the card is recorded as a fact; the attempt is independent and nothing counts as help`, JSON.stringify(graded[0]?.usage));
    check(await page.locator('[data-reference-card]').count() === 2, `${where}: the cards stay pinned after the answer`);
    await context.close();
  }
}

/* ------------------------------ the score: the same with a card as without */
{
  const outcome = async (query) => {
    const { page, context } = await open(DESKTOP, query, { expectCard: query.includes('card=') });
    await answer(page, '1/2');
    await submit(page);
    await answer(page, '3/4');
    await submit(page);
    const result = await page.evaluate(() => window.__mmGrades.map((entry) => ({ isCorrect: entry.isCorrect, parts: entry.parts })));
    const usage = (await grades(page)).map((entry) => entry.usage);
    await context.close();
    return { result, usage };
  };
  const without = await outcome('q=multi&role=practice&section=practice');
  const withCard = await outcome(`q=multi&role=practice&section=practice&${CARDS}`);
  check(JSON.stringify(without.result) === JSON.stringify(withCard.result) && withCard.result.length === 2, 'practice: a miss and then a right answer are graded the same with a card as without', `${JSON.stringify(without.result)} vs ${JSON.stringify(withCard.result)}`);
  check(without.usage.every((usage) => !('referenceCardShown' in usage)), 'practice without a card: nothing about a card is recorded', JSON.stringify(without.usage));
  const strip = (usage) => usage.map(({ referenceCardShown, ...rest }) => rest);
  check(JSON.stringify(strip(withCard.usage)) === JSON.stringify(without.usage), 'practice: the card changes nothing else the attempt records', `${JSON.stringify(strip(withCard.usage))} vs ${JSON.stringify(without.usage)}`);
}

/* ------------------------------------------- which sections, which skills */
{
  const cases = [
    { query: `q=multi&role=classwork&section=classwork&${CARDS}&cardsections=practice`, pinned: 0, label: 'a card named for Practice is not on Classwork' },
    { query: `q=multi&role=practice&section=practice&${CARDS}&cardsections=practice`, pinned: 2, label: 'a card named for Practice is on Practice' },
    { query: 'q=multi&role=classwork&section=classwork&card=made.up.skill', pinned: 0, label: 'a skill with no built-in card shows nothing' },
    { query: 'q=multi&role=classwork&section=classwork&card=made.up.skill,lines.slopeInterceptForm', pinned: 1, label: 'only the card with a built-in card is shown' },
    { query: 'q=multi&role=practice&section=practice&card=linear.graphFromSlopeIntercept', pinned: 1, label: 'a lesson family\'s own skill id finds its card' },
  ];
  for (const { query, pinned, label } of cases) {
    const { page, context } = await open(DESKTOP, query, { expectCard: pinned > 0 });
    check(await page.locator('[data-reference-card]').count() === pinned, `desktop: ${label}`, String(await page.locator('[data-reference-card]').count()));
    if (pinned === 0) {
      await answer(page, '3/4');
      await submit(page);
      const graded = await grades(page);
      check(graded.length === 1 && !('referenceCardShown' in (graded[0]?.usage || {})), `desktop: ${label}, and none is recorded`, JSON.stringify(graded[0]?.usage));
    }
    await context.close();
  }
}

/* ------------------------------------------------------- never on assessments */
{
  const cases = [
    { query: `q=multi&role=dol&section=dol&${CARDS}`, label: 'a DOL' },
    { query: `q=multi&role=quiz&section=quiz&${CARDS}`, label: 'a quiz' },
    { query: `q=multi&role=test&section=test&${CARDS}`, label: 'a test' },
    { query: `q=multi&role=practice&section=dol&${CARDS}`, label: 'a DOL practised after its due date' },
    // A stored card forged to name the DOL (the validator refuses one; a record can still carry it).
    { query: `q=multi&role=dol&section=dol&${CARDS}&cardsections=dol`, label: 'a DOL a card is forged to name' },
    { query: `q=multi&role=test&section=test&${CARDS}&cardsections=test,classwork`, label: 'a test a card is forged to name' },
  ];
  for (const device of DEVICES) {
    for (const { query, label } of cases) {
      const { page, context, fetched } = await open(device, query, { expectCard: false });
      const where = `${device.name} ${label}`;
      const before = await leaks(page);
      check(before.length === 0, `${where}: no part of a card and none of its words, before Submit`, before.join(' | '));
      await answer(page, '1/2');
      await submit(page);
      const after = await leaks(page);
      check(after.length === 0, `${where}: and none after a submission`, after.join(' | '));
      const graded = await grades(page);
      check(graded.length === 1 && graded[0].isCorrect === false && !('referenceCardShown' in (graded[0]?.usage || {})), `${where}: a wrong answer is graded wrong, and no card is recorded`, JSON.stringify(graded));
      check(fetched.length === 0, `${where}: the card's chunk is never fetched`, fetched.join(' '));
      await context.close();
    }
  }
}

/* --------------------------------------------------------- the keyboard only */
{
  const { page, context } = await open(DESKTOP, `q=multi&role=classwork&section=classwork&${CARDS}&support=translate`);
  const where = 'desktop keyboard';
  await page.locator('[data-reference-card] [data-translate-ready]').first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const order = [];
  for (let presses = 0; presses < 40 && order.length < 3; presses += 1) {
    await page.keyboard.press('Tab');
    const on = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active?.closest('[data-reference-card="card-1"]')) return null;
      if (active.matches('[data-reference-card-parts] > summary')) return 'parts';
      if (/^Read /.test(active.getAttribute('aria-label') || '')) return 'read';
      if (active.hasAttribute('data-translate-ready')) return 'translate';
      return active.tagName.toLowerCase();
    });
    if (on && !order.includes(on)) order.push(on);
  }
  check(order.join(' ') === 'parts read translate', `${where}: Tab reaches the parts, then Read, then Translate`, order.join(' '));
  // Back to the parts, by keyboard, and Enter folds them and opens them again.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  const onParts = await page.evaluate(() => document.activeElement?.matches('[data-reference-card="card-1"] [data-reference-card-parts] > summary'));
  check(onParts, `${where}: Shift+Tab comes back to the parts`);
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; });
  check(ring, `${where}: the focused disclosure shows a focus ring`);
  const parts = page.locator('[data-reference-card="card-1"] [data-reference-card-parts]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check(await parts.evaluate((node) => node.open) === false, `${where}: Enter folds the parts away`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check(await parts.evaluate((node) => node.open) === true, `${where}: Enter opens them again`);
  await context.close();
}

/* ------------------------------------------------------ Read aloud, Translate */
for (const device of DEVICES) {
  const { page, context } = await open(device, `q=multi&role=practice&section=practice&${CARDS}&support=translate`);
  const where = `${device.name} Read aloud and Translate`;
  const card = page.locator('[data-reference-card="card-1"]');
  const read = card.getByRole('button', { name: 'Read the reference card aloud' });
  check(await read.count() === 1, `${where}: the card has Read aloud`);
  await read.click();
  await page.waitForTimeout(150);
  let spoken = await page.evaluate(() => window.__mmSpoken.at(-1) || null);
  check(/Reference card: Sum and difference of cubes/.test(spoken?.text || '') && /a cubed plus b cubed equals/.test(spoken?.text || '') && /the cube root of the first term/.test(spoken?.text || ''),
    `${where}: Read aloud reads the title, the formulas as words and the parts`, (spoken?.text || '').slice(0, 200));
  check(!/\$|\\frac|\^/.test(spoken?.text || ''), `${where}: no markup is read out`, (spoken?.text || '').slice(0, 120));
  const translate = card.locator('[data-translate-ready]');
  await translate.waitFor({ timeout: 8000 }).catch(() => {});
  check(await translate.count() === 1, `${where}: Translate is ready, with no language pack needed for the card`);
  await translate.click();
  await page.waitForTimeout(200);
  const translated = card.locator('[data-translated-text]');
  const spanish = await translated.innerText().catch(() => '');
  check(await translated.getAttribute('lang') === 'es' && /Tarjeta de referencia: Suma y diferencia de cubos/.test(spanish) && /la raíz cúbica del primer término/.test(spanish),
    `${where}: Translate shows the card in Spanish, marked lang="es"`, spanish.slice(0, 160));
  await read.click();
  await page.waitForTimeout(150);
  spoken = await page.evaluate(() => window.__mmSpoken.at(-1) || null);
  check(spoken?.lang === 'es' && /Suma de cubos/.test(spoken?.text || '') && /al cubo/.test(spoken?.text || ''), `${where}: with the Spanish shown, Read aloud reads it in Spanish`, JSON.stringify(spoken).slice(0, 200));
  await noSidewaysScroll(page, `${where}, translated`);
  await fitsItsBox(page, `${where}, translated`);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-translated.png`) });
  await context.close();
}

/* --------------------------------------------------- the phone at 200% text */
{
  const { page, context } = await open(PHONE, `q=multi&role=classwork&section=classwork&${CARDS}&support=translate`, { textScale: 2 });
  const where = 'phone at 200% text';
  check(await page.locator('[data-reference-card]').count() === 2, `${where}: both cards are pinned`);
  for (const summary of await page.locator('[data-reference-card-parts] > summary').all()) { await summary.tap(); await page.waitForTimeout(80); }
  await page.locator('[data-reference-card="card-1"] [data-translate-ready]').tap().catch(() => {});
  await page.waitForTimeout(200);
  await noSidewaysScroll(page, where);
  await fitsItsBox(page, where);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, 'phone-200-percent.png'), fullPage: true });
  await context.close();
}

/* ------------------------------------------------ dark theme, forced colours */
const contrastProblems = (page) => page.locator('[data-reference-cards]').first().evaluate((root) => {
  const parse = (value) => { const match = value.match(/rgba?\(([^)]+)\)/); if (!match) return null; const [r, g, b, a = '1'] = match[1].split(/[,/ ]+/).filter(Boolean); return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }; };
  const luminance = ({ r, g, b }) => { const channel = (value) => { const s = value / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const backgroundOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) { const colour = parse(getComputedStyle(node).backgroundColor); if (colour && colour.a > 0) { layers.push(colour); if (colour.a >= 1) break; } }
    const base = parse(getComputedStyle(document.documentElement).backgroundColor);
    return layers.reverse().reduce((under, top) => over(top, under), base && base.a > 0 ? { ...base, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  };
  const found = [];
  root.querySelectorAll('p, span, summary, dt, dd, button').forEach((element) => {
    if (!element.textContent.trim() || element.closest('.mm-math-spoken') || [...element.childNodes].every((node) => node.nodeType !== 3 || !node.textContent.trim())) return;
    const style = getComputedStyle(element);
    const background = backgroundOf(element);
    const colour = over({ ...parse(style.color), a: (parse(style.color)?.a ?? 1) * Number(style.opacity || 1) }, background);
    const [light, dark] = [luminance(colour), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    if (ratio < 4.5) found.push(`"${element.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
  });
  return found;
});
for (const theme of ['light', 'dark']) {
  for (const device of DEVICES) {
    const { page, context } = await open(device, `q=multi&role=classwork&section=classwork&${CARDS}&support=translate`, { contextOptions: { colorScheme: theme }, theme });
    const where = `${device.name} ${theme} theme`;
    await page.locator('[data-reference-card-parts]').evaluateAll((nodes) => nodes.forEach((node) => { node.open = true; }));
    await page.waitForTimeout(100);
    const problems = await contrastProblems(page);
    check(problems.length === 0, `${where}: the card's text has 4.5:1 contrast`, problems.join('; '));
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-${theme}.png`) });
    await context.close();
  }
}
for (const scheme of ['light', 'dark']) {
  const { page, context } = await open(DESKTOP, `q=multi&role=classwork&section=classwork&${CARDS}&support=translate`, { contextOptions: { colorScheme: scheme, forcedColors: 'active' } });
  const where = `desktop forced colours (${scheme})`;
  check(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), `${where}: forced colours are on`);
  await page.locator('[data-reference-card] [data-translate-ready]').first().waitFor({ timeout: 8000 }).catch(() => {});
  const edges = await page.locator('[data-reference-card]').evaluateAll((cards) => cards.map((card) => {
    const edge = (element) => { const style = getComputedStyle(element); return { style: style.borderTopStyle, width: parseFloat(style.borderTopWidth), colour: style.borderTopColor, background: style.backgroundColor, text: element.textContent.trim().slice(0, 20) }; };
    return { card: edge(card), buttons: [...card.querySelectorAll('button')].map(edge) };
  }));
  check(edges.length === 2 && edges.every(({ card }) => card.style !== 'none' && card.width >= 1 && card.colour !== card.background), `${where}: each card keeps a visible edge`, JSON.stringify(edges.map(({ card }) => card)));
  check(edges.every(({ buttons }) => buttons.length >= 2 && buttons.every((entry) => entry.style !== 'none' && entry.width >= 1 && entry.colour !== entry.background)), `${where}: Read and Translate keep their edges`, JSON.stringify(edges.map(({ buttons }) => buttons)));
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `forced-colours-${scheme}.png`) });
  await context.close();
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nReference cards: pinned on Classwork and Practice, read and translated, never on a DOL, quiz or test, and the score is the score.');
