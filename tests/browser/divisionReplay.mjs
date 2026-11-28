// THE SYNTHETIC AND LONG DIVISION REPLAY, AND THE ALGEBRA II ANSWER-BOX
// GENERATORS (WE-I; docs/platform/WORKED_EXAMPLES.md).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/divisionReplay.mjs
//
// Three published Algebra II lessons (Dividing Polynomials, the Remainder and
// Factor Theorems, Rational Exponents), in the real QuestionEngine (the
// feedbackTeaches harness), through rendered controls only, at 1366×768 and
// on a 390×844 touch phone:
//
//   classwork     synthetic division had no example. A sibling now opens by
//                 itself above the student's own table, one move per slide:
//                 set up, bring down, one slide per column, read the bottom
//                 row, the answer; each with the table so far, drawn as a
//                 table with named rows, and the move in words with its why;
//   scaled        a divisor 2y − 1: the example divides through by 2 first;
//   faded         the next division on the skill: the first move only, no
//                 quotient and no remainder;
//   long          long division: divide, multiply back, subtract, per round;
//   theorems      the Remainder Theorem table: P(r) read off the remainder;
//   practice      on request only;
//   never         on the DOL there is no example and none of its words;
//   an answer box the properties of exponents: a sibling with a reason for
//                 every step;
//   keyboard, 200% text, the dark theme and forced colours.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/divisionReplay.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/divisionReplay');
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

let runs = 0;
const open = async (device, query, { contextOptions = {}, textScale = 1, theme = null } = {}) => {
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile || false,
    hasTouch: device.hasTouch || false,
    reducedMotion: 'reduce',
    ...contextOptions,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, String(error)));
  if (textScale !== 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * textScale), fixed: Math.round(13 * textScale) } });
  }
  runs += 1;
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${runs}`, { waitUntil: 'networkidle' });
  if (theme) await page.evaluate((scheme) => { document.documentElement.dataset.theme = scheme; document.documentElement.style.colorScheme = scheme; }, theme);
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(900);
  return { page, context };
};

const player = (page) => page.locator('.mathmaster-hint-panel [data-worked-example-player]');
const slideState = (page) => player(page).first().evaluate((root) => {
  const words = (element) => (element?.innerText || '').replace(/\s+/g, ' ').trim();
  const board = root.querySelector('[data-example-board]');
  const table = root.querySelector('[data-example-synthetic]');
  return {
    number: Number(root.dataset.exampleSlideNumber),
    count: Number(root.dataset.exampleSlideCount),
    kind: root.dataset.exampleSlideKind,
    format: root.dataset.exampleFormat,
    faded: root.hasAttribute('data-example-faded'),
    label: words(root.querySelector('[data-example-slide-label]')),
    text: words(root.querySelector('[data-example-slide]')),
    next: words(root.querySelector('[data-example-next]')),
    openedText: words(root.querySelector('[data-example-opened-by-itself]')),
    board: board ? {
      kind: board.dataset.exampleBoard,
      operation: board.dataset.exampleBoardOperation,
      lines: [...board.querySelectorAll('[data-example-board-line]')].map((line) => ({ id: line.dataset.exampleBoardLine, name: words(line.querySelector('p')) })),
    } : null,
    table: table ? {
      caption: words(table.querySelector('caption')),
      rows: [...table.querySelectorAll('tbody tr')].map((row) => ({ id: row.dataset.exampleSyntheticRow, header: words(row.querySelector('th')), scope: row.querySelector('th')?.getAttribute('scope') })),
      columns: [...table.querySelectorAll('thead th')].map(words),
      filled: table.querySelectorAll('[data-example-synthetic-cell="filled"]').length,
      blank: table.querySelectorAll('[data-example-synthetic-cell="blank"]').length,
      // The frame the table scrolls in, if it must, stays inside the player.
      inside: (() => { const box = (table.closest('[data-example-synthetic-frame]') || table).getBoundingClientRect(); const own = root.getBoundingClientRect(); return box.left >= own.left - 1 && box.right <= own.right + 1; })(),
    } : null,
    focusOn: document.activeElement?.hasAttribute('data-example-next') ? 'next' : 'elsewhere',
  };
});
const next = async (page) => { await player(page).locator('[data-example-next]').click(); await page.waitForTimeout(140); };
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
const documentText = (page) => page.evaluate(() => [
  document.documentElement.innerText,
  ...[...document.querySelectorAll('[aria-label], [title], [alt]')].flatMap((element) => [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')]),
].filter(Boolean).join('\n'));

const DIVISION_WORDS = ['A similar problem, worked out', 'Try a similar one', 'Set up the table', 'Bring down the first coefficient', 'Read the bottom row', 'Synthetic division by'];

// Every slide after the one showing, to the last.
const walk = async (page, where, { shots = {}, table = false } = {}) => {
  const seen = [];
  let state = await slideState(page);
  for (let guard = 0; guard < 30 && state.next !== 'Your turn'; guard += 1) {
    await next(page);
    state = await slideState(page);
    seen.push(state);
    if (state.kind === 'step') {
      check(/Why:/.test(state.text), `${where}, slide ${state.number}: the move says why`);
      if (state.format === 'replay') check(Boolean(state.board) && state.board.lines.length >= 1 && state.board.lines.every((line) => line.name), `${where}, slide ${state.number}: the move in words, each line named`, String(JSON.stringify(state.board?.lines)).slice(0, 140));
      if (table && state.table) {
        check(state.table.rows.map((row) => row.id).join(' ') === 'top middle bottom' && state.table.rows.every((row) => row.scope === 'row' && row.header), `${where}, slide ${state.number}: the table's rows are named`, state.table.rows.map((row) => row.header).join(' | '));
        check(state.table.inside, `${where}, slide ${state.number}: the table stays inside the player (it scrolls within it if it must)`);
      }
    }
    await noSidewaysScroll(page, `${where}, slide ${state.number}`);
    if (shots[state.board?.operation]) await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, shots[state.board.operation]) });
  }
  return seen;
};
const operations = (seen) => seen.filter((state) => state.board).map((state) => state.board.operation).join(' ');

/* -------------------------------- classwork: synthetic division, the whole replay */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=division&role=classwork');
  const where = `${device.name} classwork, synthetic division`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the replay is open before anything is pressed`);
  if (await player(page).count() !== 1) { await context.close(); continue; }
  const first = await slideState(page);
  check(first.format === 'replay' && !first.faded && first.kind === 'problem', `${where}: a replay, whole`, JSON.stringify({ format: first.format, kind: first.kind, count: first.count }));
  check(/New skill/.test(first.openedText), `${where}: it says why it opened`, first.openedText);
  check(/Use synthetic division/.test(first.text) && !first.text.replace(/\s+/g, '').includes('x^3-4x^2+6x-4') && !/x3−4x2\+6x−4/.test(first.text.replace(/\s+/g, '')), `${where}: the problem is a sibling, not the student's division`, first.text.slice(0, 90));
  const seen = await walk(page, where, { table: true, shots: { column: `${device.name}-column.png`, read: `${device.name}-read.png` } });
  check(/^setUp bringDown (column )+remainder read answer$/.test(operations(seen)), `${where}: set up, bring down, a slide per column, the remainder, read the row, the answer`, operations(seen));
  const tables = seen.filter((state) => state.table);
  check(tables.length >= 4 && tables.every((state, index) => index === 0 || state.table.filled >= tables[index - 1].table.filled), `${where}: the table fills one column at a time`, tables.map((state) => state.table.filled).join(' '));
  check(tables[0].table.blank > 0 && tables.at(-1).table.blank === 0, `${where}: blank cells say "not yet" until they are filled`, `${tables[0].table.blank} → ${tables.at(-1).table.blank}`);
  check(/Synthetic division by r (=|equals) /.test(tables[0].table.caption), `${where}: the table has a caption naming r`, tables[0].table.caption);
  const last = seen.at(-1);
  check(last.kind === 'answer' && /Answer:/.test(last.text) && last.next === 'Your turn', `${where}: then the answer and "Your turn"`, last.text.slice(0, 80));
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(400);
  check(await player(page).count() === 0, `${where}: "Your turn" hands the student their own table`);
  await context.close();
}

/* ------------------------------------------- scaled: divide through by a first */
{
  const { page, context } = await open(DESKTOP, 'q=divisionscale&role=classwork&newskill=1');
  const where = 'desktop classwork, a divisor 2y − 1';
  await page.locator('[data-hint-control]').first().click().catch(() => {});
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  if (!await player(page).count() && await offer.count()) await offer.first().click();
  await player(page).first().waitFor();
  const seen = await walk(page, where);
  check(operations(seen).startsWith('scale setUp'), `${where}: it divides the dividend and the divisor by the leading coefficient first`, operations(seen));
  check(operations(seen).includes('read unscale answer'), `${where}: and multiplies the table's remainder back`, operations(seen));
  await context.close();
}

/* ------------------------------------------- faded: the next division on the skill */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=division2&role=classwork');
  const where = `${device.name} classwork, the next division on the skill`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the faded example opens by itself`);
  if (await player(page).count()) {
    let state = await slideState(page);
    check(state.faded && state.count === 2, `${where}: the problem and one move`, JSON.stringify({ faded: state.faded, count: state.count }));
    await next(page);
    state = await slideState(page);
    check(state.board?.operation === 'setUp' && /The rest is yours/.test(state.text) && state.next === 'Your turn', `${where}: the set-up, and the rest is the student's`, state.label);
    const whole = await player(page).first().innerText();
    check(!/Answer:|the quotient is|is the remainder/.test(whole), `${where}: a faded example shows no quotient and no remainder`);
  }
  await context.close();
}

/* ------------------------------------------------------- long division */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=divisionlong&role=classwork');
  const where = `${device.name} classwork, long division`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the replay opens by itself`);
  if (await player(page).count()) {
    const seen = await walk(page, where, { shots: { multiplyBack: `${device.name}-long.png` } });
    check(/^(divide multiplyBack subtract )+read answer$/.test(operations(seen)), `${where}: divide, multiply back, subtract and bring down, each round, then the quotient and the answer`, operations(seen));
  }
  await context.close();
}

/* -------------------------------------------- the Remainder Theorem table */
{
  const { page, context } = await open(DESKTOP, 'q=divisionthm&role=classwork');
  const where = 'desktop classwork, the Remainder Theorem';
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the replay opens by itself`);
  if (await player(page).count()) {
    const seen = await walk(page, where, { table: true });
    check(/remainderTheorem depressed$/.test(operations(seen)), `${where}: P(r) is read off the remainder, then the quotient`, operations(seen));
  }
  await context.close();
}

/* ------------------------------------------------- practice: on request */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=divisionpr&role=practice');
  const where = `${device.name} practice`;
  check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, `${where}: nothing opens by itself`);
  await page.locator('[data-hint-control]').first().click();
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  check(await offer.count() >= 1, `${where}: the example is there on request`);
  if (await offer.count()) {
    await offer.first().click();
    await player(page).first().waitFor();
    const state = await slideState(page);
    check(state.format === 'replay' && state.openedText === '', `${where}: on request it is the replay`, JSON.stringify({ format: state.format }));
  }
  await context.close();
}

/* ---------------------------------------------------------- the DOL: never */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=divisiondol&role=dol');
  const where = `${device.name} DOL`;
  check(await page.locator('[data-worked-example-player], [data-similar-example], [data-example-board], [data-example-synthetic]').count() === 0, `${where}: no example, no board and no table of one`);
  const text = await documentText(page);
  const leaked = DIVISION_WORDS.filter((word) => text.includes(word));
  check(leaked.length === 0, `${where}: none of the replay's words in the document`, leaked.join(' | '));
  await context.close();
}

/* --------------------------------------------- an answer box: exponent rules */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=a2box&role=classwork');
  const where = `${device.name} classwork, the properties of exponents`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the built-in example opens by itself`);
  if (await player(page).count()) {
    const first = await slideState(page);
    check(first.format === 'steps' && /Simplify/.test(first.text) && !/a⁻³|\(a\^\{-3\}\)/.test(first.text), `${where}: a sibling with other numbers and letters`, first.text.slice(0, 90));
    const seen = await walk(page, where);
    const steps = seen.filter((state) => state.kind === 'step');
    check(steps.length >= 3 && steps.every((state) => /Why:/.test(state.text)), `${where}: every step says why`, String(steps.length));
    check(seen.at(-1).kind === 'answer', `${where}: it ends on the answer`);
  }
  await context.close();
}

/* ------------------------------------------------------- the keyboard only */
{
  const { page, context } = await open(DESKTOP, 'q=division&role=classwork');
  const where = 'desktop keyboard';
  await player(page).first().waitFor();
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  let reached = false;
  for (let presses = 0; presses < 60 && !reached; presses += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => Boolean(document.activeElement?.hasAttribute('data-example-next')));
  }
  check(reached, `${where}: Tab reaches Next`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const state = await slideState(page);
  check(state.number === 2 && state.focusOn === 'next' && Boolean(state.table), `${where}: Enter plays the set-up, its table drawn, and focus stays on Next`, JSON.stringify({ number: state.number, focusOn: state.focusOn }));
  const live = await player(page).locator('[data-example-slide]').evaluate((region) => ({ live: region.getAttribute('aria-live'), holdsTable: Boolean(region.querySelector('[data-example-synthetic]')) }));
  check(live.live === 'polite' && live.holdsTable, `${where}: the move and its table are in the polite live region`, JSON.stringify(live));
  await context.close();
}

/* ------------------------------- 200% text, the dark theme, forced colours */
for (const device of [DESKTOP, PHONE, { name: 'narrow', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]) {
  const { page, context } = await open(device, 'q=division&role=classwork', { textScale: 2 });
  const where = `${device.name} at 200% text`;
  await player(page).first().waitFor();
  for (let slide = 2; slide <= 7; slide += 1) {
    await next(page);
    await noSidewaysScroll(page, `${where}, slide ${slide}`);
    const state = await slideState(page);
    if (state.table) check(state.table.inside, `${where}, slide ${slide}: the table stays inside the player`);
  }
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-200-text.png`) });
  await context.close();
}
for (const theme of ['light', 'dark']) {
  const { page, context } = await open(PHONE, 'q=division&role=classwork', { contextOptions: { colorScheme: theme }, theme });
  await player(page).first().waitFor();
  await next(page);
  await next(page);
  await next(page);
  const contrast = await player(page).first().evaluate((root) => {
    const parse = (value) => { const match = value.match(/rgba?\(([^)]+)\)/); if (!match) return null; const [r, g, b, a = '1'] = match[1].split(/[,/ ]+/).filter(Boolean); return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }; };
    const luminance = ({ r, g, b }) => { const channel = (value) => { const s = value / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
    const backgroundOf = (element) => { for (let node = element; node; node = node.parentElement) { const colour = parse(getComputedStyle(node).backgroundColor); if (colour && colour.a >= 1) return colour; } return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 }; };
    return [...root.querySelectorAll('[data-example-synthetic] th, [data-example-synthetic] td, [data-example-synthetic] caption')].filter((cell) => cell.textContent.trim()).map((cell) => {
      const [light, dark] = [luminance(parse(getComputedStyle(cell).color)), luminance(backgroundOf(cell))].sort((a, b) => b - a);
      return { text: cell.textContent.trim().slice(0, 20), ratio: (light + 0.05) / (dark + 0.05) };
    }).filter((cell) => cell.ratio < 4.5);
  });
  check(contrast.length === 0, `phone ${theme} theme: the table's text has 4.5:1 contrast`, JSON.stringify(contrast.slice(0, 3)));
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `phone-${theme}.png`) });
  await context.close();
}
{
  const { page, context } = await open(DESKTOP, 'q=division&role=classwork', { contextOptions: { forcedColors: 'active' } });
  await player(page).first().waitFor();
  await next(page);
  await next(page);
  await next(page);
  const ruled = await player(page).first().evaluate((root) => [...root.querySelectorAll('[data-example-synthetic] td')].map((cell) => getComputedStyle(cell).borderBottomStyle));
  check(ruled.length > 0 && ruled.every((style) => style !== 'none'), 'desktop forced colours: every cell of the table keeps its rule', ruled.slice(0, 4).join(' '));
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nThe division replay and the Algebra II answer-box examples: every check passed.');
