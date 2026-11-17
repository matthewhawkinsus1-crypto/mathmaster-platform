/*
 * TOLD APART WITHOUT COLOUR (WCAG 1.4.1), IN THE BROWSER.
 *
 *   npx vite --config tests/browser/forcedColors.vite.config.mjs --host 127.0.0.1 --port 5198 --strictPort &
 *   node tests/browser/colourAloneCues.mjs      # exits 1 on any finding
 *
 *   AUDIT_ORIGIN (default http://127.0.0.1:5198; the page needs no stubbed
 *   service, so any server of the repository serves it), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH, COLOUR_ALONE_ARTIFACTS for report.json and the pictures
 *   (default tests/browser/artifacts/colourAlone, git-ignored).
 *
 * WHY. My Math Path's mastery wheel and the CCMR readiness wheel told a level
 * apart on the wheel by colour alone in the app's own themes, the mastery
 * wheel's two kinds of round done were a green and a purple dot, and some
 * planes drew two lines alike but for their colour (and a system of equations
 * paired each equation with its line by a swatch of its colour). Each now has
 * a cue that is not colour (src/components/student/wheelFills.js, the round
 * marks in MyMathPathWheel.jsx, src/platform/graph/curveLabels.js and
 * systemLineNames.js, Graph the Line's method badge). The unit tests pin each cue in the markup
 * (tests/platform/wheelFills.test.mjs, planeLineNames.test.mjs, curveLabels.test.mjs,
 * systemLineNames.test.mjs);
 * this reads them as a student's browser lays them out.
 *
 * WHAT. Every scene of colourAloneCues.html (the two wheels and the mastery
 * key, and each plane) in the app's light and dark themes, at 1440×900,
 * 1366×768 and 390×844 (a touch phone), read with the page's colour taken away
 * (filter: grayscale(1)), and the key and the readiness list again at 200%
 * text. It fails:
 *   - a wheel with two levels drawn alike once colour is gone (their fill, a
 *     hatch's lines, an empty level's edge and its dash), or a level not drawn;
 *   - the two round-done marks not a ring and a dot, or not visible;
 *   - a key's swatch not drawn as its level's fill (a hatch, an empty edge, a
 *     dashed one), at either text size;
 *   - a plane missing a name it should carry, or a name not visible (no box,
 *     outside its plane, or under something drawn over it, Work View's opener
 *     included), or covering a point or another word on its plane (a point's
 *     name, an axis number, another curve's name);
 *   - the Transformations Lab's source points not squares beside the student's
 *     dots, and Graph the Line's line drawn without the method without its badge.
 * A picture of each scene, grey, is kept for each reading.
 *
 * NOTHING LEAVES LOCALHOST: every context aborts non-local requests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

export const CUES_PAGE = '/tests/browser/colourAloneCues.html';
export const CUE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ id: 'chromebook', width: 1366, height: 768 }),
  Object.freeze({ id: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true }),
]);
export const CUE_THEMES = Object.freeze(['light', 'dark']);
// The names each plane carries on its lines.
export const PLANE_NAMES = Object.freeze({
  'inverse-lab': ['f', 'f⁻¹', 'y = x'],
  'exp-log': ['f', 'f⁻¹', 'y = x'],
  systems: ['1', '2'],
  'systems-build': ['1', '2'],
  'workspace-inverse': ['f', 'f⁻¹'],
  'static-figure': ['f', 'g'],
  // The page's generated system (its key is fixed): each line named by the equation listed for it.
  'system-equations': ['y = 2x − 1', 'y = −x + 8'],
});

/**
 * The page open, every scene drawn, in `theme` (the app's own theme follows <html data-theme>; null leaves it to
 * the caller, as the forced-colours walk sets it from the device).
 */
export const openCues = async (page, origin, theme = 'light') => {
  await page.goto(`${origin}${CUES_PAGE}`, { timeout: 180_000 });
  if (theme) await page.evaluate((scheme) => { document.documentElement.dataset.theme = scheme; document.documentElement.style.colorScheme = scheme; }, theme);
  await page.locator('[data-cue-scene="line-method"] svg').waitFor({ timeout: 180_000 });
  // Every plane drawn (its names are drawn with it, or not at all).
  for (const scene of Object.keys(PLANE_NAMES)) await page.locator(`[data-cue-scene="${scene}"] svg[data-mm-plane]`).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
};

/**
 * Graph the Line: two points placed by a press and a lift each, as a student
 * places them; the page judges the line as the right one drawn without the
 * method. Resolves once the line's badge is drawn (or after 5 s).
 */
export const drawLineWithoutMethod = async (page) => {
  const grid = page.locator('[data-cue-scene="line-method"] svg.mm-line-graph');
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  // (−4, −2) and (4, 2): grid points of the page's −10…10 view.
  for (const [ux, uy] of [[0.3, 0.6], [0.7, 0.4]]) {
    await page.mouse.move(box.x + box.width * ux, box.y + box.height * uy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  await page.locator('[data-cue-scene="line-method"] [data-verdict-mark]').first().waitFor({ timeout: 5_000 }).catch(() => {});
};

// ------------------------------------------------------------------ in the page
// Every check runs in the page, on what is laid out and painted now.
const READ = ({ planeNames }) => {
  const problems = [];
  const facts = {};
  const sceneOf = (id) => document.querySelector(`[data-cue-scene="${id}"]`);
  const box = (el) => el.getBoundingClientRect();
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const style = (el) => getComputedStyle(el);
  // A part as it would look with no colour at all: what fills it (a pattern by its hatch, the card, a colour), and its edge.
  const patternOf = (svg, fill) => {
    const id = /url\("?#([^")]+)"?\)/.exec(fill)?.[1];
    return id ? svg.querySelector(`pattern#${CSS.escape(id)}`) : null;
  };
  const surfaceOf = (el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--mm-surface)';
    el.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  };

  // ---------------------------------------------------------------- the wheels
  for (const id of ['mastery-wheel', 'readiness-wheel']) {
    const scene = sceneOf(id);
    const svg = scene?.querySelector('svg[data-mm-drawing]');
    if (!svg) { problems.push(`${id}: no wheel`); continue; }
    const card = surfaceOf(svg.parentElement);
    const looks = new Map();
    for (const wedge of svg.querySelectorAll('path[data-wheel-fill]')) {
      const level = wedge.getAttribute('data-wheel-fill');
      if (looks.has(level)) continue;
      const s = style(wedge);
      if (!area(box(wedge))) { problems.push(`${id}: a ${level} wedge is not drawn`); continue; }
      const pattern = patternOf(svg, s.fill);
      const lines = pattern ? [...pattern.querySelectorAll('line')].map((line) => (line.getAttribute('x1') === line.getAttribute('x2') ? 'upright' : 'level')).join('+') : '';
      const filled = pattern ? `hatch ${pattern.getAttribute('patternTransform')} ${lines}` : s.fill === card ? 'empty' : 'colour';
      const edged = pattern || filled === 'colour' ? '' : `edge ${s.strokeDasharray === 'none' ? 'solid' : 'dashed'}`;
      looks.set(level, `${filled} ${edged}`.trim());
    }
    facts[id] = Object.fromEntries(looks);
    if (looks.size < (id === 'mastery-wheel' ? 5 : 7)) problems.push(`${id}: ${looks.size} levels drawn (${[...looks.keys()]})`);
    const distinct = new Set(looks.values());
    if (distinct.size !== looks.size) problems.push(`${id}: two levels look alike without colour: ${JSON.stringify(facts[id])}`);
  }
  // The two kinds of round done: a ring and a dot, each visible, on its plate.
  const wheel = sceneOf('mastery-wheel')?.querySelector('svg[data-mm-drawing]');
  const rounds = {};
  for (const shape of ['ring', 'dot']) {
    const mark = wheel?.querySelector(`[data-round-mark="${shape}"]`);
    const inner = mark?.querySelector('circle:not([data-mm-plane-part="plate"])');
    if (!mark || !inner || !area(box(inner))) { problems.push(`mastery-wheel: no ${shape} for a round done`); continue; }
    const s = style(inner);
    rounds[shape] = { hollow: s.fill === surfaceOf(wheel.parentElement), edged: s.stroke !== 'none' && parseFloat(s.strokeWidth) > 0, size: Math.round(box(inner).width * 10) / 10 };
  }
  facts.rounds = rounds;
  if (rounds.ring && rounds.dot && !(rounds.ring.hollow && rounds.ring.edged && !rounds.dot.hollow)) {
    problems.push(`mastery-wheel: a practice round and a Level 3 round are not a ring and a dot: ${JSON.stringify(rounds)}`);
  }

  // ---------------------------------------------------------------- the keys
  const swatchLooks = (swatches) => swatches.map((swatch) => {
    const s = style(swatch);
    const fill = swatch.getAttribute('data-mm-swatch');
    const hatch = /repeating-linear-gradient/.test(s.backgroundImage);
    const empty = s.backgroundImage === 'none' && s.backgroundColor === surfaceOf(swatch.parentElement);
    return { fill, look: hatch ? `hatch ${(s.backgroundImage.match(/-?\d+deg/g) || []).join(',')}` : empty ? `empty ${s.borderTopStyle}` : 'colour' };
  });
  const keys = {
    mastery: swatchLooks([...(sceneOf('mastery-wheel')?.querySelectorAll('[data-mastery-key] [data-mm-swatch]') || [])]),
    readiness: swatchLooks([...(sceneOf('readiness-wheel')?.querySelectorAll('li [data-mm-swatch]') || [])]),
  };
  facts.keys = keys;
  for (const [key, swatches] of Object.entries(keys)) {
    if (swatches.length < (key === 'mastery' ? 5 : 7)) problems.push(`${key} key: ${swatches.length} swatches`);
    if (new Set(swatches.map((swatch) => swatch.look)).size !== swatches.length) problems.push(`${key} key: two swatches look alike without colour: ${JSON.stringify(swatches)}`);
    for (const swatch of swatches) {
      if (swatch.fill.startsWith('hatch') && !swatch.look.startsWith('hatch')) problems.push(`${key} key: the ${swatch.fill} swatch is not hatched (${swatch.look})`);
      if (swatch.fill === 'muted' && swatch.look !== 'empty dashed') problems.push(`${key} key: the muted swatch is not an empty dashed box (${swatch.look})`);
    }
  }
  const ring = [...(sceneOf('mastery-wheel')?.querySelectorAll('[data-mm-swatch="ring"]') || [])].map((el) => el.textContent.trim());
  if (ring.join('') !== '○') problems.push(`mastery key: the practice round's mark is ${JSON.stringify(ring)}, not a ring`);

  // ---------------------------------------------------------------- the planes' names
  const POINT_PARTS = new Set(['point', 'closed', 'open', 'held', 'held-open']);
  // CSS px kept clear round a name.
  const CLEAR = 2;
  facts.names = {};
  for (const [id, expected] of Object.entries(planeNames)) {
    const scene = sceneOf(id);
    const names = [...(scene?.querySelectorAll('[data-curve-label]') || [])];
    const found = names.map((el) => el.getAttribute('data-curve-label'));
    facts.names[id] = found;
    if (JSON.stringify([...found].sort()) !== JSON.stringify([...expected].sort())) problems.push(`${id}: names ${JSON.stringify(found)}, not ${JSON.stringify(expected)}`);
    for (const name of names) {
      const label = name.getAttribute('data-curve-label');
      const text = name.matches('text') ? name : name.querySelector('text');
      const svg = name.closest('svg');
      // In the viewport, where what is drawn at a point can be asked.
      text.scrollIntoView({ block: 'center', inline: 'center' });
      const r = box(text);
      if (!area(r)) { problems.push(`${id}: "${label}" has no box`); continue; }
      const plane = box(svg);
      if (r.left < plane.left - 1 || r.right > plane.right + 1 || r.top < plane.top - 1 || r.bottom > plane.bottom + 1) problems.push(`${id}: "${label}" is outside its plane`);
      // Visible: what is drawn at its middle is the name (its text, or its ring). A name answers no pointer
      // (pointer-events: none), so it is made to answer one for the moment it is asked.
      const answering = name.style.pointerEvents;
      name.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      name.style.pointerEvents = answering;
      if (!hit || !(hit === text || name.contains(hit))) problems.push(`${id}: "${label}" is under ${hit ? `${hit.tagName.toLowerCase()}${hit.className && typeof hit.className === 'string' ? `.${hit.className.split(' ')[0]}` : ''}` : 'nothing drawn'}`);
      // Clear of every point and every other word on the plane.
      for (const other of svg.querySelectorAll('circle, rect, polygon, text')) {
        if (other === text || name.contains(other) || other.closest('defs, clipPath, mask, pattern')) continue;
        const part = other.getAttribute('data-mm-plane-part');
        const isPoint = POINT_PARTS.has(part) || other.hasAttribute('data-point-shape');
        const isWord = other.tagName.toLowerCase() === 'text' && other.textContent.trim() !== '';
        if (!isPoint && !isWord) continue;
        const o = box(other);
        if (!area(o) || style(other).visibility === 'hidden' || style(other).display === 'none') continue;
        // Not on it, and not against it either: a name flush with a word reads as part of it.
        const near = overlap({ left: r.left - CLEAR, right: r.right + CLEAR, top: r.top - CLEAR, bottom: r.bottom + CLEAR }, o);
        if (near > 1) problems.push(`${id}: "${label}" ${overlap(r, o) > 1 ? 'covers' : 'touches'} ${isPoint ? 'a point' : `"${other.textContent.trim().slice(0, 24)}"`} (${near.toFixed(1)} px²)`);
      }
    }
  }

  // ---------------------------------------------------------------- the Transformations Lab and Graph the Line
  const transform = sceneOf('transformations')?.querySelector('svg[data-mm-plane]');
  const squares = transform ? transform.querySelectorAll('[data-point-shape="square"]').length : 0;
  const dots = transform ? [...transform.querySelectorAll('circle[data-mm-plane-part="point"]')].filter((dot) => area(box(dot))).length : 0;
  facts.transformations = { squares, dots };
  if (squares !== 3) problems.push(`transformations: ${squares} source points drawn as squares, not 3`);
  if (dots < 2) problems.push(`transformations: ${dots} of the student's points drawn as dots`);
  const badge = sceneOf('line-method')?.querySelector('[data-verdict-mark]');
  facts.method = badge ? badge.getAttribute('data-verdict-mark') : null;
  if (!badge || badge.getAttribute('data-verdict-mark') !== 'bang' || !area(box(badge))) problems.push(`line-method: the line drawn without the method has ${badge ? `a "${badge.getAttribute('data-verdict-mark')}" badge` : 'no badge'}`);

  return { problems, facts };
};

// The key and the readiness list at 200% text: each swatch still drawn as its level.
const READ_LARGE_TEXT = () => {
  const problems = [];
  const swatches = [...document.querySelectorAll('[data-cue-scene="mastery-wheel"] [data-mastery-key] [data-mm-swatch], [data-cue-scene="readiness-wheel"] li [data-mm-swatch]')];
  for (const swatch of swatches) {
    const fill = swatch.getAttribute('data-mm-swatch');
    const s = getComputedStyle(swatch);
    const r = swatch.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) problems.push(`200% text: the ${fill} swatch is not drawn`);
    // It grows with the words beside it (11 and 12 px at the default size).
    else if (r.width < 18) problems.push(`200% text: the ${fill} swatch stays ${r.width.toFixed(1)} px beside text twice the size`);
    if (fill.startsWith('hatch') && !/repeating-linear-gradient/.test(s.backgroundImage)) problems.push(`200% text: the ${fill} swatch is not hatched`);
    if (fill === 'muted' && s.borderTopStyle !== 'dashed') problems.push('200% text: the muted swatch has no dashed edge');
  }
  if (swatches.length < 12) problems.push(`200% text: ${swatches.length} swatches`);
  return problems;
};

const main = async () => {
  const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5198';
  const artifacts = process.env.COLOUR_ALONE_ARTIFACTS || path.join(repo, 'tests/browser/artifacts/colourAlone');
  mkdirSync(artifacts, { recursive: true });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);
  const results = [];
  const started = Date.now();
  try {
    for (const viewport of CUE_VIEWPORTS) {
      for (const theme of CUE_THEMES) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: Boolean(viewport.isMobile),
          hasTouch: Boolean(viewport.hasTouch),
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await context.route(/^(?!http:\/\/(127\.0\.0\.1|localhost)[:/])/, (route) => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        try {
          await openCues(page, origin, theme);
          await drawLineWithoutMethod(page);
          // Colour taken away: what is left must still tell each thing apart.
          await page.evaluate(() => { document.documentElement.style.filter = 'grayscale(1)'; });
          const reading = await page.evaluate(READ, { planeNames: PLANE_NAMES });
          for (const scene of await page.locator('[data-cue-scene]').evaluateAll((els) => els.map((el) => el.dataset.cueScene))) {
            await screenshotKeepingTouch(page.locator(`[data-cue-scene="${scene}"]`), { path: path.join(artifacts, `${scene}-${theme}-${viewport.id}-grey.png`) });
          }
          const problems = [...reading.problems, ...errors.map((message) => `page error: ${message}`)];
          results.push({ viewport: viewport.id, theme, problems, facts: reading.facts });
          console.log(`${problems.length ? 'FAIL' : 'ok  '} ${viewport.id.padEnd(10)} ${theme.padEnd(5)} names ${Object.values(reading.facts.names || {}).flat().length}, wheels ${Object.keys(reading.facts['mastery-wheel'] || {}).length}+${Object.keys(reading.facts['readiness-wheel'] || {}).length} levels, rounds ${Object.keys(reading.facts.rounds || {}).join('/')}, method ${reading.facts.method}`);
          problems.forEach((problem) => console.log(`       ${problem}`));
          // 200% text (the browser's default size 16 → 32), where the screen follows it: the key and the list.
          if (theme === 'light') {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
            await page.waitForTimeout(600);
            const large = await page.evaluate(READ_LARGE_TEXT);
            results.push({ viewport: viewport.id, theme, textScale: 2, problems: large });
            console.log(`${large.length ? 'FAIL' : 'ok  '} ${viewport.id.padEnd(10)} ${theme.padEnd(5)} 200% text: the keys' swatches`);
            large.forEach((problem) => console.log(`       ${problem}`));
            await screenshotKeepingTouch(page.locator('[data-cue-scene="mastery-wheel"] [data-mastery-key]').locator('xpath=..'), { path: path.join(artifacts, `mastery-key-${viewport.id}-200pct-grey.png`) });
          }
        } catch (error) {
          results.push({ viewport: viewport.id, theme, problems: [`could not read the page: ${error.message.split('\n')[0]}`] });
          console.log(`FAIL ${viewport.id} ${theme}: ${error.message.split('\n')[0]}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  const failing = results.filter((result) => result.problems.length);
  writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify({ origin, results }, null, 2)}\n`);
  console.log(`\n${results.length} reading(s) at ${CUE_VIEWPORTS.length} viewport(s) in ${CUE_THEMES.length} themes, ${Math.round((Date.now() - started) / 1000)}s.`);
  if (failing.length) {
    console.log(`Told apart without colour: ${failing.length} reading(s) failed. Report: ${path.relative(process.cwd(), path.join(artifacts, 'report.json'))}`);
    process.exitCode = 1;
  } else {
    console.log(`Told apart without colour: passed. Report: ${path.relative(process.cwd(), path.join(artifacts, 'report.json'))}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
