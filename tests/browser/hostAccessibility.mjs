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
 * Secure figures (AX05, slice 3): a secure Test field item's graph, for a
 * student whose plan gives Translate in Spanish on an item with an authored
 * Spanish prompt, describes itself in Spanish, marked lang="es", with no
 * position while it can be answered (in full only with the graph read-out);
 * the prompt on screen stays as authored; anyone else hears it in English.
 * Its name is Spanish too, on the same element, marked lang="es", with the
 * item's axis titles as the axes show them (slice 4); in English, as before.
 * It draws no curve, so neither language says it shows marks drawn by the
 * activity (slice 4).
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

// The accessible description Chromium computes for an element: what a screen reader reads.
const axDescription = async (page, selector) => {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return null;
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return nodes[0]?.description?.value || '';
  } finally {
    await cdp.detach();
  }
};

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
  if (!ONLY || ONLY === 's5') {
    // Review of #463: inside Work View the page's bar is still laid out but
    // covered by the modal; Tab must never scroll the page beneath it.
    for (const tool of ['dataModelingLab', 'linearTableWorkbench']) {
      const { page } = await open(`scene=path-tool&tool=${tool}`, viewport);
      const enlarge = page.locator('button:visible', { hasText: /Open Work View/ }).first();
      if (!(await enlarge.count())) { check(false, `${at} ${tool}: no Open Work View button`); await page.close(); continue; }
      await enlarge.click();
      await page.waitForFunction(() => document.documentElement.getAttribute('data-work-view-open') === 'true');
      const startY = await page.evaluate(() => window.scrollY);
      let moved = 0;
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(40);
        if (await page.evaluate((y) => window.scrollY !== y, startY)) moved += 1;
      }
      console.log(`S5 ${at} ${tool} in Work View: the page beneath scrolled on ${moved} of 40 Tabs`);
      check(moved === 0, `${at} ${tool}: Tab inside Work View scrolled the page beneath ${moved} time(s)`);
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
  if (!ONLY || ONLY === 'pathChoices') {
    // My Math Path's choice cards are one radio group (choiceGroup.js): they
    // were a Tab stop each with no arrow keys, the chosen one shown by colour
    // alone. One Tab stop, arrows move AND choose, Home / End, a ✓ on the
    // chosen card, and no key checks the answer (selecting is not answering).
    const { page, errors } = await open('scene=path-generic&kind=practice', viewport);
    const cards = page.locator('[role="radiogroup"] [role="radio"]');
    const count = await cards.count();
    check(count >= 3, `${at} path choices: the cards are radios (found ${count})`);
    const state = () => page.evaluate(() => {
      const radios = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')];
      return {
        tabIndexes: radios.map((radio) => radio.tabIndex),
        checked: radios.map((radio) => radio.getAttribute('aria-checked')),
        marked: radios.map((radio) => Boolean(radio.querySelector('[data-choice-mark]'))),
        focused: radios.findIndex((radio) => radio === document.activeElement),
        submits: (window.__hostSubmits || []).length,
      };
    });
    let now = await state();
    check(now.tabIndexes.filter((index) => index === 0).length === 1 && now.tabIndexes[0] === 0, `${at} path choices: one Tab stop, the first card, while none is chosen ${JSON.stringify(now.tabIndexes)}`);
    check(now.checked.every((value) => value === 'false') && now.marked.every((mark) => !mark), `${at} path choices: nothing is chosen or marked at the start`);
    await cards.first().focus();
    await page.keyboard.press('ArrowDown');
    now = await state();
    check(now.focused === 1 && now.checked[1] === 'true' && now.checked.filter((value) => value === 'true').length === 1, `${at} path choices: ArrowDown moves to the second card and chooses it ${JSON.stringify(now)}`);
    check(now.marked[1] && now.marked.filter(Boolean).length === 1, `${at} path choices: the chosen card carries a ✓`);
    check(now.tabIndexes[1] === 0 && now.tabIndexes.filter((index) => index === 0).length === 1, `${at} path choices: the Tab stop follows the chosen card`);
    await page.keyboard.press('End');
    now = await state();
    check(now.focused === count - 1 && now.checked[count - 1] === 'true', `${at} path choices: End goes to the last card and chooses it`);
    await page.keyboard.press('ArrowDown');
    now = await state();
    check(now.focused === 0 && now.checked[0] === 'true', `${at} path choices: ArrowDown from the last card wraps to the first`);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    now = await state();
    check(now.focused === count - 1 && now.checked[count - 1] === 'true', `${at} path choices: ArrowUp from the first card wraps to the last`);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    now = await state();
    check(now.focused === count - 2 && now.checked[count - 2] === 'true', `${at} path choices: Space keeps the focused card chosen`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    now = await state();
    check(now.submits === 0, `${at} path choices: no key checked the answer (${now.submits} submit(s))`);
    check(errors.length === 0, `${at} path choices: page errors ${errors.join(' | ')}`);
    console.log(`pathChoices ${at}: ${count} cards, focus ${now.focused}, checked ${JSON.stringify(now.checked)}`);
    await page.close();
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
  if (!ONLY || ONLY === 'secureFigures') {
    const POSITION = /\(\s*[−-]?\d|\bcruza\b|\bpasa por\b|\bentre\b|\besquinas?\b|\bcrosses\b|\bthrough\b|\bbetween\b/;
    // The graph's hidden description ({ text, lang }) and the svg's accessible description.
    const described = async (page) => {
      const hidden = page.locator('p[id^="mm-plane-desc-"]').first();
      const id = await hidden.getAttribute('id');
      return { text: (await hidden.textContent()) || '', lang: await hidden.getAttribute('lang'), ax: await axDescription(page, `svg[aria-describedby~="${id}"]`) };
    };
    // The graph's name ({ label, lang }): its aria-label and the language marked on it.
    const named = async (page) => {
      const id = await page.locator('p[id^="mm-plane-desc-"]').first().getAttribute('id');
      const svg = page.locator(`svg[aria-describedby~="${id}"]`).first();
      return { label: await svg.getAttribute('aria-label'), lang: await svg.getAttribute('lang') };
    };
    for (const [query, expected] of [
      ['profile=spanish', 'es'],
      ['profile=readout', 'es-full'],
      ['profile=spanish&translated=0', 'en'],
      ['profile=english', 'en'],
      ['', 'en'],
    ]) {
      const { page, errors } = await open(`scene=secure-field&${query}`, viewport);
      if (expected !== 'en') await page.locator('p[id^="mm-plane-desc-"][lang="es"]').first().waitFor({ timeout: 8000 }).catch(() => {});
      const said = await described(page);
      const where = `${at} secure field ${query || 'no profile'}`;
      console.log(`secureFigures ${where}: ${JSON.stringify(said)}`);
      check(said.ax === said.text, `${where}: the graph's accessible description is its description (${said.ax})`);
      const name = await named(page);
      check(expected === 'en'
        ? name.label === 'Graph with horizontal axis x and vertical axis y' && name.lang === null
        : name.label === 'Gráfica con el eje horizontal x y el eje vertical y' && name.lang === 'es', `${where}: the graph's name (${JSON.stringify(name)})`);
      if (expected === 'en') {
        check(said.lang === null && said.text.startsWith('x from −10 to 10, y from −10 to 10.') && !POSITION.test(said.text), `${where}: English, unmarked, no position (${JSON.stringify(said)})`);
        // It draws no curve: no "marks drawn by the activity" (AX05, slice 4).
        check(!/marks drawn by the activity/.test(said.text), `${where}: no marks the activity did not draw (${said.text})`);
      } else if (expected === 'es') {
        // No curve is drawn, so no "marcas que dibuja la actividad" (slice 4).
        check(said.lang === 'es' && said.text === 'El eje x va de −10 a 10 y el eje y, de −10 a 10. 1 recta. Las posiciones no se leen mientras se pueda responder esta pregunta.', `${where}: Spanish, marked lang="es", no position (${JSON.stringify(said)})`);
      } else {
        check(said.lang === 'es' && said.text.startsWith('El eje x va de −10 a 10 y el eje y, de −10 a 10. 1 recta. La recta 1 baja de izquierda a derecha, cruza el eje y ') && !/no se leen/.test(said.text), `${where}: the read-out reads it in full, in Spanish (${JSON.stringify(said)})`);
        check(!/marcas que dibuja la actividad/.test(said.text), `${where}: and says no marks the activity did not draw (${said.text})`);
      }
      const prompt = (await page.locator('h1').first().textContent()) || '';
      check(prompt.includes('Identify the x-intercept and y-intercept'), `${where}: the prompt on screen stays as authored (${prompt.slice(0, 80)})`);
      if (query === 'profile=spanish') check(await page.locator('[data-support-tool="translate"]').count() === 1, `${where}: the item offers Translate, which shows the authored Spanish`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `${where}: nothing scrolls sideways (${overflow}px)`);
      check(errors.length === 0, `${where}: page errors ${errors.join(' | ')}`);
      await page.close();
    }
  }
}

await browser.close();
if (failures.length) {
  console.error(`hostAccessibility: ${failures.length} failure(s)\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('hostAccessibility: all checks passed');
