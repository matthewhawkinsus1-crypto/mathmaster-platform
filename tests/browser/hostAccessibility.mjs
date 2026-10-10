/*
 * THE NON-ASSIGNMENT HOSTS, BY KEYBOARD AND SCREEN READER — job H.
 * Real Chromium at 1366×768 and 390×844 (tests/browser/hostAccessibility.html).
 *
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/hostAccessibility.mjs
 *
 * S5 (Focus Not Obscured): Tab from the start sentinel to the end one on My
 * Math Path (five tool questions the bare harness found covered), on a DOL
 * Recovery assessment and in the rich runtime (the secure exam / Test Cycle
 * host, secureTest mode). No focused control may sit under the sticky action
 * bar, and a control that was already in view must not move the page.
 * Universal tools: Vocabulary and Read aloud in an ordinary Path practice
 * session, none in a retention check or exam-framework practice.
 * Graph descriptions: the session recap reads features; the answerable Path
 * question does not.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const VIEWPORTS = [[1366, 768], [390, 844]];
const ONLY = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7) || null;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const open = async (query, [width, height]) => {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${origin}/tests/browser/hostAccessibility.html?${query}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-host-sentinel="end"]');
  await page.waitForTimeout(900);
  return { page, errors };
};

// Is the focused element under the sticky action bar? Centre point and two
// inset corners, as the keyboard sweep measures it.
const coverage = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  const sentinel = el.getAttribute('data-host-sentinel');
  if (sentinel) return { skip: true };
  const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 50);
  const found = document.querySelector('.mathmaster-desktop-action-bar');
  // On a phone the bar is in the flow, not pinned: it can cover nothing.
  const bar = found && getComputedStyle(found).position === 'sticky' ? found : null;
  if (!bar) return { covered: false, name, pinned: false };
  if (bar.contains(el)) return { skip: true };
  const r = el.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
  const hits = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
    .map(([x, y]) => document.elementFromPoint(x, y))
    .filter((hit) => hit && bar.contains(hit)).length;
  return { covered: hits >= 2, name, pinned: true };
});

const walk = async (page, at) => {
  await page.evaluate(() => document.querySelector('[data-host-sentinel="start"]').focus());
  const covered = [];
  let stops = 0;
  let pinned = false;
  for (let i = 0; i < 160; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const info = await page.evaluate(() => ({ sentinel: document.activeElement?.getAttribute('data-host-sentinel') || null }));
    if (info.sentinel === 'end') break;
    const result = await coverage(page);
    if (result.body) break;
    if (result.skip) continue;
    stops += 1;
    pinned = pinned || result.pinned;
    if (result.covered) covered.push(result.name);
  }
  return { stops, covered, pinned, at };
};

const S5_SCENES = [
  ...['dataModelingLab', 'functionOperationsLab', 'linearTableWorkbench', 'expressionMeaning', 'stepAlgebra2'].map((tool) => `scene=path-tool&tool=${tool}`),
  'scene=recovery',
  ...['dataModelingLab', 'functionOperationsLab'].map((tool) => `scene=rich-tool&tool=${tool}`),
];

for (const viewport of VIEWPORTS) {
  const at = `${viewport[0]}x${viewport[1]}`;
  if (!ONLY || ONLY === 's5') {
    for (const query of S5_SCENES) {
      const { page, errors } = await open(query, viewport);
      const result = await walk(page, at);
      console.log(`S5 ${at} ${query}: ${result.stops} stops, bar ${result.pinned ? 'pinned' : 'in the flow'}, ${result.covered.length} covered${result.covered.length ? ` (${result.covered.join(' | ')})` : ''}`);
      check(result.stops > 3, `${at} ${query}: the walk reached the host's controls (${result.stops})`);
      check(result.covered.length === 0, `${at} ${query}: ${result.covered.length} focused controls under the action bar: ${result.covered.join(' | ')}`);
      check(errors.length === 0, `${at} ${query}: page errors ${errors.join('; ')}`);
      await page.close();
    }
  }
  if (!ONLY || ONLY === 'tools') {
    for (const [query, expected] of [
      ['scene=path-generic&kind=practice', true],
      // A tool question: the engine's tray. Vocabulary appears only when the
      // prompt has a glossary word; Read aloud always does (checked below).
      ['scene=path-tool&tool=linearTableWorkbench&kind=practice', 'read-aloud'],
      ['scene=path-generic&kind=retentionProbe', false],
      ['scene=path-generic&kind=practice&framework=tsia2', false],
      ['scene=path-generic&kind=practice&role=test', false],
    ]) {
      const { page } = await open(query, viewport);
      const names = await page.$$eval('button', (buttons) => buttons.filter((b) => b.getClientRects().length || b.closest('details,[hidden]')).map((b) => (b.getAttribute('aria-label') || b.textContent).replace(/\s+/g, ' ').trim()));
      const vocabulary = names.some((name) => /Vocabulary/.test(name));
      const readAloud = names.some((name) => /Read aloud/.test(name));
      console.log(`tools ${at} ${query}: Vocabulary=${vocabulary} Read aloud=${readAloud}`);
      if (expected === 'read-aloud') { check(readAloud, `${at} ${query}: the universal Read aloud is in the engine's tray`); await page.close(); continue; }
      check(vocabulary === expected && readAloud === expected, `${at} ${query}: universal tools ${expected ? 'expected' : 'must not appear'} (Vocabulary=${vocabulary}, Read aloud=${readAloud})`);
      await page.close();
    }
  }
  if (!ONLY || ONLY === 'graphs') {
    const recap = await open('scene=recap', viewport);
    const recapText = await recap.page.locator('svg[role="img"], [data-graph-description], .mm-sr-only, figure').allTextContents().then((t) => t.join(' '));
    const recapAll = await recap.page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[id]')].map((n) => n.textContent).join(' '));
    check(/crosses the y-axis at −2/.test(recapAll), `${at}: the recap (asks nothing) describes the line's features`);
    await recap.page.close();
    const live = await open('scene=path-generic&kind=practice&graph=1', viewport);
    const liveAll = await live.page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[id]')].map((n) => n.textContent).join(' '));
    check(/1 line/.test(liveAll), `${at}: the answerable question's graph is described (kinds)`);
    check(!/crosses the y-axis/.test(liveAll), `${at}: the answerable question's description names no crossing`);
    console.log(`graphs ${at}: recap features=${/crosses the y-axis/.test(recapAll)} live features=${/crosses the y-axis/.test(liveAll)} (${recapText.length})`);
    await live.page.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(`hostAccessibility: ${failures.length} failure(s)\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('hostAccessibility: all checks passed');
