// THE STEP ALGEBRA REPLAY (WE-C; docs/platform/WORKED_EXAMPLES.md).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/stepAlgebraReplay.mjs
//
// The guide's own lesson, stored as a published assignment is, in the real
// QuestionEngine (the feedbackTeaches harness), through rendered controls
// only, at 1366×768 and on a 390×844 touch phone:
//
//   classwork   CW 2 names the lesson's replay: it opens by itself, above the
//               student's own board, and plays one move of the tool per
//               slide. A move is drawn as the board's lines, each named in
//               words: the equation it starts with, the same move on both
//               sides, what cancels, the simplified line. The last move is
//               the check in the first equation, then the answer and "Your
//               turn". The student's own equation is still on their board;
//   faded       CW 3 is the next question on the skill: the example opens by
//               itself with the first move only, says so, shows no answer and
//               leaves the rest to the student. Asked for, the whole example
//               plays;
//   practice    nothing opens by itself; on request the same replay plays;
//   never       on the DOL there is no example, no board of one and none of
//               its words;
//   keyboard    Enter on Next plays a move, and the live region holds its lines;
//   supports    Read aloud is on every move, named for its slide;
//   display     nothing scrolls sideways and nothing is clipped on the phone,
//               at 200% browser text, in the dark theme and in forced colours
//               (each line of the board keeps an edge).
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/stepAlgebraReplay.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/stepAlgebraReplay');
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
      label: words(board.querySelector('[data-example-board-label]')),
      lines: [...board.querySelectorAll('[data-example-board-line]')].map((line) => ({
        id: line.dataset.exampleBoardLine,
        name: words(line.querySelector('p')),
        math: line.querySelectorAll('p')[1]?.textContent.replace(/\s+/g, ' ').trim() || '',
      })),
    } : null,
    focusOn: document.activeElement?.hasAttribute('data-example-next') ? 'next' : 'elsewhere',
  };
});
const next = async (page) => { await player(page).locator('[data-example-next]').click(); await page.waitForTimeout(140); };
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
const fitsItsBox = async (page, where) => {
  const problems = await player(page).first().evaluate((root) => {
    const found = [];
    const box = root.getBoundingClientRect();
    if (box.left < -1 || box.right > document.documentElement.clientWidth + 1) found.push(`player ${Math.round(box.left)}..${Math.round(box.right)} of ${document.documentElement.clientWidth}`);
    root.querySelectorAll('button, p, li, [data-example-progress]').forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return;
      if (rect.left < box.left - 1 || rect.right > box.right + 1) found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" leaves the player`);
      if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== 'visible') found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" is clipped`);
    });
    return found;
  });
  check(problems.length === 0, `${where}: the board's lines and the controls fit`, problems.join('; '));
};
const documentText = (page) => page.evaluate(() => [
  document.documentElement.innerText,
  ...[...document.querySelectorAll('[aria-label], [title], [alt]')].flatMap((element) => [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')]),
].filter(Boolean).join('\n'));
// The student's own board: the Step Algebra workspace under the example.
const ownBoard = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-tool-workspace')?.innerText || '').replace(/\s+/g, ' '));
const REPLAY_WORDS = ['The same move on both sides', 'Same skill as before', 'The rest is yours', 'A similar problem, worked out', 'Try a similar one', 'in the first equation'];
const MOVE_LINES = ['Start with', 'The same move on both sides', 'Simplify'];

/* ---------------------------------------------- classwork: the whole replay */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=replay&role=classwork');
  const where = `${device.name} classwork, CW 2`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the replay is open before anything is pressed`);
  if (await player(page).count() !== 1) { await context.close(); continue; }
  let state = await slideState(page);
  check(state.format === 'replay' && !state.faded, `${where}: it is the tool replay, whole`, JSON.stringify({ format: state.format, faded: state.faded }));
  check(state.kind === 'problem' && state.count === 6 && !state.board, `${where}: the problem, four moves and the answer`, JSON.stringify({ kind: state.kind, count: state.count }));
  check(/New skill/.test(state.openedText), `${where}: it says why it opened`, state.openedText);
  check(/Target: isolate x/.test(await ownBoard(page)), `${where}: the student's own board is on the same screen`);
  check(await page.locator('.mathmaster-top-panel-row .mathmaster-hint-panel [data-similar-example]').count() === 1, `${where}: the example is above the student's board`);
  const moves = [];
  for (let slide = 2; slide <= 5; slide += 1) {
    await next(page);
    state = await slideState(page);
    check(state.number === slide && state.kind === 'step' && Boolean(state.board), `${where}: slide ${slide} is a move of the board`, JSON.stringify({ number: state.number, kind: state.kind }));
    if (!state.board) continue;
    moves.push(state.board);
    const names = state.board.lines.map((line) => line.name);
    const ids = state.board.lines.map((line) => line.id);
    check(state.board.lines.every((line) => line.name && line.math), `${where}, slide ${slide}: every line has its name in words and its mathematics`, JSON.stringify(state.board.lines).slice(0, 200));
    check(ids[0] === 'before' && ids.at(-1) === 'after' && ids.includes('applied'), `${where}, slide ${slide}: it starts from a line and ends on the next`, ids.join(' '));
    if (state.board.kind === 'move') {
      check(MOVE_LINES.every((name) => names.includes(name)), `${where}, slide ${slide}: the start, the move on both sides and the simplified line`, names.join(' | '));
      check(/on both sides$/.test(state.board.label), `${where}, slide ${slide}: the move is named, on both sides`, state.board.label);
      check(names.some((name) => /^Cancel on (the left side|the right side|both sides)$/.test(name)), `${where}, slide ${slide}: what cancels is a line of its own, and says where`, names.join(' | '));
    }
    check(/Why:/.test(state.text), `${where}, slide ${slide}: the move says why`);
    await fitsItsBox(page, `${where}, slide ${slide}`);
    await noSidewaysScroll(page, `${where}, slide ${slide}`);
    if (slide === 2) await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-move.png`) });
  }
  check(moves.map((board) => board.kind).join(' ') === 'move move move check', `${where}: three moves, then the check`, moves.map((board) => board.kind).join(' '));
  check(moves.map((board) => board.operation).join(' ') === 'subtract subtract divide ', `${where}: the lesson's own moves, in order`, moves.map((board) => board.operation).join(' '));
  // Each move starts from the line the move before ended on.
  const chained = moves.slice(1, 3).every((board, index) => board.lines[0].math === moves[index].lines.at(-1).math);
  check(chained, `${where}: each move starts from the line the last one ended on`);
  const checkLines = moves.at(-1)?.lines.map((line) => line.name).join(' | ');
  check(checkLines === 'The first equation | With the value put in | Both sides', `${where}: the check goes back to the first equation`, checkLines);
  await next(page);
  state = await slideState(page);
  check(state.kind === 'answer' && /Answer:/.test(state.text) && state.next === 'Your turn', `${where}: then the answer and "Your turn"`, state.text.slice(0, 100));
  // The sibling is never the student's equation (4x + 7 = x − 8, x = −5).
  const everything = moves.flatMap((board) => board.lines.map((line) => line.math)).join(' ');
  check(!/4x\s*\+\s*7/.test(everything.replace(/\s+/g, '')), `${where}: the replay is a sibling, not the student's equation`);
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-worked-example-player]').count() === 0, `${where}: "Your turn" folds the replay away`);
  check(/Target: isolate x/.test(await ownBoard(page)), `${where}: the student's own board is there to work on`);
  await context.close();
}

/* ------------------------------------------- classwork, the next question: faded */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=replay2&role=classwork');
  const where = `${device.name} classwork, CW 3`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the faded example is open before anything is pressed`);
  if (await player(page).count() !== 1) { await context.close(); continue; }
  let state = await slideState(page);
  check(state.faded && state.format === 'replay', `${where}: it is the replay, faded`);
  check(/only the first part is worked for you/.test(state.openedText), `${where}: it says only the first part is worked`, state.openedText);
  check(state.count === 2, `${where}: the problem and the first move only`, String(state.count));
  await next(page);
  state = await slideState(page);
  check(state.board?.kind === 'move' && state.label === 'Step 1 of 4', `${where}: the first move, of four`, state.label);
  check(/The rest is yours/.test(state.text) && state.next === 'Your turn', `${where}: the rest is left to the student`, state.text.slice(-90));
  const whole = await player(page).first().innerText();
  check(!/Answer:/.test(whole), `${where}: a faded example shows no answer`);
  await fitsItsBox(page, where);
  await noSidewaysScroll(page, where);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-faded.png`) });
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-worked-example-player]').count() === 0, `${where}: "Your turn" folds it away`);
  // Asked for, the whole example plays.
  await page.locator('[data-hint-control]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' }).first().click();
  await player(page).first().waitFor();
  state = await slideState(page);
  check(!state.faded && state.count === 6 && state.openedText === '', `${where}: asked for, the whole example plays`, JSON.stringify({ faded: state.faded, count: state.count }));
  await context.close();
}

/* ----------------------------------------------------- practice: on request */
{
  const { page, context } = await open(DESKTOP, 'q=replaypr&role=practice');
  const where = 'desktop practice';
  check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, `${where}: nothing opens by itself`);
  await page.locator('[data-hint-control]').first().click();
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  check(await offer.count() >= 1, `${where}: the example is there on request`);
  if (await offer.count()) {
    await offer.first().click();
    await player(page).first().waitFor();
    const state = await slideState(page);
    check(state.format === 'replay' && !state.faded && state.openedText === '', `${where}: on request it is the whole replay`, JSON.stringify({ format: state.format, faded: state.faded, count: state.count }));
    await next(page);
    check(Boolean((await slideState(page)).board), `${where}: its moves are drawn as the board's lines`);
  }
  await context.close();
}

/* ---------------------------------------------------------- the DOL: never */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=replaydol&role=dol');
  const where = `${device.name} DOL`;
  check(await page.locator('[data-worked-example-player], [data-similar-example], [data-example-board], [data-example-whole]').count() === 0, `${where}: no example and no board of one`);
  const text = await documentText(page);
  const leaked = REPLAY_WORDS.filter((word) => text.includes(word));
  check(leaked.length === 0, `${where}: none of the replay's words in the document`, leaked.join(' | '));
  await context.close();
}

/* ------------------------------------------------------- the keyboard only */
{
  const { page, context } = await open(DESKTOP, 'q=replay&role=classwork');
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
  check(state.number === 2 && state.focusOn === 'next' && Boolean(state.board), `${where}: Enter plays the first move, and focus stays on Next`, JSON.stringify({ number: state.number, focusOn: state.focusOn }));
  const live = await player(page).locator('[data-example-slide]').evaluate((region) => ({ live: region.getAttribute('aria-live'), atomic: region.getAttribute('aria-atomic'), holdsBoard: Boolean(region.querySelector('[data-example-board]')) }));
  check(live.live === 'polite' && live.atomic === 'true' && live.holdsBoard, `${where}: the move's lines are in the polite live region, read whole`, JSON.stringify(live));
  await context.close();
}

/* ------------------------------------------------------------- Read aloud */
{
  const { page, context } = await open(DESKTOP, 'q=replay&role=classwork&support=read');
  const where = 'desktop Read aloud';
  await player(page).first().waitFor();
  await page.evaluate(() => {
    window.__mmSpoken = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (utterance) => { window.__mmSpoken.push(utterance.text); };
  });
  await next(page);
  const read = player(page).locator('button', { hasText: 'Read' });
  check(await read.count() === 1, `${where}: a move has Read aloud`);
  const name = await read.first().getAttribute('aria-label').catch(() => null);
  check(name === 'Read the worked example, step 1 of 4 aloud', `${where}: its name says which move`, String(name));
  if (await read.count()) {
    await read.first().click();
    await page.waitForTimeout(250);
    const spoken = (await page.evaluate(() => window.__mmSpoken)).join(' ').replace(/\s+/g, ' ');
    if (spoken) check(/Step 1 of 4/.test(spoken) && /on both sides/.test(spoken) && /Why:/.test(spoken), `${where}: it reads the move as a sentence, then its why`, spoken.slice(0, 140));
  }
  await context.close();
}

/* ------------------------------- 200% text, the dark theme, forced colours */
for (const device of [DESKTOP, PHONE, { name: 'narrow', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]) {
  const { page, context } = await open(device, 'q=replay&role=classwork', { textScale: 2 });
  const where = `${device.name} at 200% text`;
  await player(page).first().waitFor();
  const rootFont = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(rootFont >= 31, `${where}: the browser's text did grow`, `${rootFont}px`);
  for (let slide = 2; slide <= 5; slide += 1) {
    await next(page);
    await noSidewaysScroll(page, `${where}, slide ${slide}`);
    await fitsItsBox(page, `${where}, slide ${slide}`);
  }
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-200-text.png`) });
  await context.close();
}
// Contrast of the board's text against what is painted behind it.
const contrastProblems = (page) => player(page).first().evaluate((root) => {
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
  root.querySelectorAll('[data-example-board] p').forEach((element) => {
    if (!element.textContent.trim()) return;
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
    const { page, context } = await open(device, 'q=replay&role=classwork', { contextOptions: { colorScheme: theme }, theme });
    const where = `${device.name} ${theme} theme`;
    await player(page).first().waitFor();
    await next(page);
    const problems = await contrastProblems(page);
    check(problems.length === 0, `${where}: the board's names and lines have 4.5:1 contrast`, problems.join('; '));
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-${theme}.png`) });
    await context.close();
  }
}
for (const scheme of ['light', 'dark']) {
  const { page, context } = await open(DESKTOP, 'q=replay&role=classwork', { contextOptions: { colorScheme: scheme, forcedColors: 'active' } });
  const where = `desktop forced colours (${scheme})`;
  await player(page).first().waitFor();
  check(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), `${where}: forced colours are on`);
  await next(page);
  const edges = await player(page).first().evaluate((root) => [...root.querySelectorAll('[data-example-board-line]')].map((line) => {
    const style = getComputedStyle(line);
    return { id: line.dataset.exampleBoardLine, style: style.borderLeftStyle, width: parseFloat(style.borderLeftWidth), named: Boolean(line.querySelector('p')?.textContent.trim()) };
  }));
  check(edges.length >= 3 && edges.every((edge) => edge.style !== 'none' && edge.width >= 1), `${where}: each line of the board keeps an edge`, JSON.stringify(edges));
  check(edges.every((edge) => edge.named), `${where}: each line is named in words, so nothing rests on colour`);
  check(edges.at(-1).style === 'solid' && edges.slice(0, -1).every((edge) => edge.style === 'dashed'), `${where}: the line the move ends on has a solid edge, the others dashed`, edges.map((edge) => edge.style).join(' '));
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `forced-colours-${scheme}.png`) });
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nThe Step Algebra replay: every check passed.');
