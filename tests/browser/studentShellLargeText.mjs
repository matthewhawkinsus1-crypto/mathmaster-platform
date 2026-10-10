/*
 * THE STUDENT SCREENS AT LARGE TEXT AND NARROW WIDTH, AND THE APP HOSTS BY
 * KEYBOARD — job H. Reuses the accessibility certification's scenes
 * (accessibilityCertification.mjs SCREENS: the real app in memory, the
 * assignment tools, the secure exam, Live Challenge).
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/studentShellLargeText.mjs [--check=targets,s5,text] [--only=<screen id,…>]
 *
 * targets  The identity bar's Log Out is at least 44px tall (WCAG 2.5.5).
 * s5       Live Challenge round (1366×768): Tab from the top of the round to
 *          the end, no focused control under the sticky action bar (2.4.11).
 * text     WCAG 1.4.4 / 1.4.10 / 1.4.12: every scene at 200% browser text size
 *          (Chromium's default font size 16 → 32, what the text-size setting
 *          changes) at 1366×768 and 390×844, and at 320 CSS px wide: no
 *          horizontal page scroll, and no text clipped by its own box (also
 *          with the 1.4.12 text-spacing override at both viewports) —
 *          graphs, tables and canvases excepted, as 1.4.10 exempts them.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { SCREENS, sceneLabel } from './accessibilityCertification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, 'artifacts/large-text');
mkdirSync(artifacts, { recursive: true });
const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || null;
const CHECKS = new Set((arg('check') || 'targets,s5,text').split(','));
const ONLY = new Set((arg('only') || '').split(',').filter(Boolean));
const origins = {
  app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
  audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199',
};
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const failures = [];
const report = [];

const applyTextScale = async (page) => {
  if (!page.__cdp || page.__textScale === 1) return;
  await page.__cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * page.__textScale, fixed: 13 * page.__textScale } });
};

const newPage = async ({ width, height, mobile = false, textScale = 1 }) => {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, colorScheme: 'light', reducedMotion: 'reduce' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.__textScale = textScale;
  if (textScale !== 1) {
    // The browser text-size setting: Chromium's default font sizes. A
    // renderer swap on navigation can drop it, so it is re-applied before
    // every measurement (applyTextScale) and the root size is checked.
    page.__cdp = await context.newCDPSession(page);
    await page.__cdp.send('Page.enable');
    await applyTextScale(page);
  }
  return { context, page };
};

// What 1.4.10 / 1.4.4 failures look like, measured in the page.
const MEASURE = (rootSelector) => {
  const root = (rootSelector && document.querySelector(rootSelector)) || document.body;
  const EXEMPT = 'svg, canvas, table, [role="img"], [role="grid"], [role="table"], math-field, .ML__container, [data-reflow-exempt], [aria-hidden="true"], .mathmaster-responsive-canvas, pre, code';
  const exempt = (element) => Boolean(element.closest(EXEMPT));
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  // Visually hidden text (sr-only) is clipped on purpose.
  const srOnly = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if ((style.clip && style.clip !== 'auto') || style.clipPath === 'inset(50%)' || (rect.width <= 1 && rect.height <= 1)) return true;
    }
    return false;
  };
  const ownText = (element) => [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
  const scrollX = document.documentElement.scrollWidth - window.innerWidth;
  // A horizontal page scroll: who sticks out past the right edge?
  const wide = [];
  if (scrollX > 1) {
    for (const element of root.querySelectorAll('*')) {
      if (exempt(element) || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.right > window.innerWidth + 1 && rect.left < window.innerWidth) {
        const parentRect = element.parentElement?.getBoundingClientRect();
        if (!parentRect || parentRect.right <= window.innerWidth + 1) wide.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} "${(element.textContent || '').trim().slice(0, 30)}" right=${Math.round(rect.right)}`);
      }
    }
  }
  // Text cut off by a clipping box: a text element that lies (partly) outside
  // an ancestor with overflow hidden/clip, and that the student cannot scroll
  // to — no scrollable box between the two.
  const clipped = [];
  const scrollable = (node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY + getComputedStyle(node).overflowX);
  for (const element of root.querySelectorAll('*')) {
    if (exempt(element) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    const rect = element.getBoundingClientRect();
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      if (scrollable(node)) break;
      const style = getComputedStyle(node);
      if (!/hidden|clip/.test(style.overflowX + style.overflowY) || node === document.body) continue;
      const box = node.getBoundingClientRect();
      const outY = /hidden|clip/.test(style.overflowY) && (rect.bottom > box.bottom + 2 || rect.top < box.top - 2);
      const outX = /hidden|clip/.test(style.overflowX) && (rect.right > box.right + 2 || rect.left < box.left - 2) && style.textOverflow !== 'ellipsis' && getComputedStyle(element).textOverflow !== 'ellipsis';
      if (outY || outX) {
        clipped.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0] || ''} "${ownText(element).slice(0, 30)}" cut by ${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0] || ''}${outX ? ' x' : ''}${outY ? ' y' : ''}`);
        break;
      }
    }
  }
  // Content pushed past the right edge (html clips overflow-x, so this is the
  // reflow failure that shows no scrollbar): any non-exempt text box whose
  // right edge is beyond the viewport.
  const offscreen = [];
  for (const element of root.querySelectorAll('*')) {
    if (exempt(element) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1 || rect.left < -1) offscreen.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0] || ''} "${ownText(element).slice(0, 30)}" ${Math.round(rect.left)}..${Math.round(rect.right)}`);
  }
  // Every text box's font size, in document order: compared with the same
  // scene at 100% to find text that did not grow (1.4.4).
  const sizes = [];
  for (const element of root.querySelectorAll('*')) {
    if (exempt(element) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    sizes.push({ size: parseFloat(getComputedStyle(element).fontSize), what: `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0] || ''} "${ownText(element).slice(0, 24)}"` });
  }
  return {
    rootFont: getComputedStyle(document.documentElement).fontSize,
    scrollX, wide: wide.slice(0, 8), clipped: [...new Set(clipped)].slice(0, 12), clippedCount: clipped.length,
    offscreen: [...new Set(offscreen)].slice(0, 12), offscreenCount: offscreen.length, sizes,
  };
};

const runScenes = async (setting, callback) => {
  for (const screen of SCREENS) {
    if (ONLY.size && !ONLY.has(screen.id)) continue;
    const { context, page } = await newPage(setting);
    try {
      if (screen.open) await screen.open(page, origins);
      let first = true;
      for (const scene of screen.scenes) {
        const label = sceneLabel(screen, scene);
        try {
          await scene.run(page, origins, { first });
          first = false;
        } catch (error) {
          failures.push(`${label} ${setting.id}: could not reach the scene — ${error.message.split('\n')[0]}`);
          break;
        }
        await applyTextScale(page);
        await page.waitForTimeout(700);
        await callback(page, label, screen);
      }
    } catch (error) {
      failures.push(`${screen.id} ${setting.id}: could not open — ${error.message.split('\n')[0]}`);
    }
    await context.close();
  }
};

const repo = path.resolve(here, '../..');
// The tools whose controls the bar covered on the bare host (KEYBOARD_SWEEP
// S5), first; any tool question otherwise.
const PREFERRED_TOOLS = ['dataModelingLab', 'functionOperationsLab', 'expressionMeaning', 'linearTableWorkbench'];
async function toolChallengeQuestion() {
  let fallback = null;
  const require = createRequire(import.meta.url);
  const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
  const seedDir = path.join(repo, 'functions/seeds/pathQuestionBank');
  for (const file of readdirSync(seedDir).filter((name) => name.endsWith('.json')).sort()) {
    const parsed = JSON.parse(readFileSync(path.join(seedDir, file), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const instantiated = await mathPath.instantiateQuestion(item, `large-text|${item.id}`);
      if (!instantiated?.question || mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (!plan?.issuable || !plan.toolPayload) continue;
      const question = mathPath.buildSanitizedQuestion(instantiated.question, {
        questionInstanceId: 'challenge_a11y-room_r1', attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload,
      });
      if (!question.pathToolId) continue;
      question.challengeRound = 0;
      if (PREFERRED_TOOLS.includes(question.pathToolId)) return question;
      fallback = fallback || question;
    }
  }
  if (fallback) return fallback;
  throw new Error('No issuable tool question in the Path seed bank');
}

if (CHECKS.has('targets')) {
  for (const setting of [{ id: 'chromebook', width: 1366, height: 768 }, { id: 'phone', width: 390, height: 844, mobile: true }]) {
    const { context, page } = await newPage(setting);
    await SCREENS[0].open(page, origins);
    const box = await page.getByRole('button', { name: 'Log Out' }).first().boundingBox();
    const bar = await page.locator('aside.mm-identity-bar').first().boundingBox();
    console.log(`targets ${setting.id}: Log Out ${Math.round(box?.width)}×${Math.round(box?.height)}, identity bar ${Math.round(bar?.height)}px`);
    if (!box || box.height < 44 || box.width < 44) failures.push(`${setting.id}: Log Out is ${box?.width}×${box?.height}, under 44px`);
    if (bar && bar.height > 46) failures.push(`${setting.id}: the identity bar grew to ${bar.height}px`);
    await context.close();
  }
}

if (CHECKS.has('s5')) {
  const { context, page } = await newPage({ id: 'chromebook', width: 1366, height: 768 });
  const live = SCREENS.find((screen) => screen.id === 'live-challenge');
  await live.open(page, origins);
  await live.scenes[0].run(page, origins, { first: true });
  // A Solver-Race-style round: a tool question (the engine and its sticky
  // action bar), built as issueNextQuestion builds one. The certification's
  // own round is a choice question, which has no action bar.
  const question = await toolChallengeQuestion();
  await page.evaluate(({ currentQuestion }) => {
    const startsAt = Date.now() - 2000;
    window.__mmHarnessStore.update('liveChallengeRooms/a11y-room', {
      status: 'running', currentRound: 0, currentQuestion, roundVersion: 1, roundToken: 'a11y-round-1',
      phase: 'answering', startsAt, endsAt: startsAt + 600_000, roundStartedAt: startsAt, roundEndsAt: startsAt + 600_000,
    });
  }, { currentQuestion: question });
  await page.waitForTimeout(2500);
  const pinned = await page.evaluate(() => {
    const bar = document.querySelector('[data-live-challenge-engine] .mathmaster-desktop-action-bar');
    return bar ? getComputedStyle(bar).position : 'none';
  });
  console.log(`s5 live-challenge: tool ${question.pathToolId}, action bar ${pinned}`);
  await page.locator('[data-live-challenge-engine]').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  const covered = [];
  let stops = 0;
  for (let i = 0; i < 120; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { done: true };
      if (!el.closest('[data-live-challenge-engine]')) return { outside: true };
      const found = document.querySelector('[data-live-challenge-engine] .mathmaster-desktop-action-bar');
      const bar = found && getComputedStyle(found).position === 'sticky' ? found : null;
      const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
      if (!bar || bar.contains(el)) return { name };
      const r = el.getBoundingClientRect();
      const hits = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]]
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
        .map(([x, y]) => document.elementFromPoint(x, y)).filter((hit) => hit && bar.contains(hit)).length;
      return { name, covered: hits >= 2 };
    });
    if (result.done) break;
    if (result.outside) continue;
    stops += 1;
    if (result.covered) covered.push(result.name);
  }
  console.log(`s5 live-challenge round: ${stops} stops, ${covered.length} covered${covered.length ? ` (${covered.join(' | ')})` : ''}`);
  if (stops < 2) failures.push(`live challenge: the walk never reached the round's controls (${stops})`);
  if (covered.length) failures.push(`live challenge: ${covered.length} focused control(s) under the action bar: ${covered.join(' | ')}`);
  await context.close();
}

// Text that did not grow at 200%: the same scene's text boxes at 100%, in
// document order, at the same viewport.
const baselineSizes = new Map();
const unscaled = (label, settingId, sizes) => {
  const base = baselineSizes.get(`${label}|${settingId.replace('-200%', '')}`);
  if (!base || base.length !== sizes.length) return { comparable: false, list: [] };
  const list = sizes.filter((entry, index) => entry.size < base[index].size * 1.5).map((entry, index) => entry.what);
  return { comparable: true, list };
};

if (CHECKS.has('text')) {
  for (const setting of [
    { id: 'chromebook', width: 1366, height: 768, textScale: 1, baseline: true },
    { id: 'phone', width: 390, height: 844, mobile: true, textScale: 1, baseline: true },
    { id: 'chromebook-200%', width: 1366, height: 768, textScale: 2 },
    { id: 'phone-200%', width: 390, height: 844, mobile: true, textScale: 2 },
    { id: 'reflow-320', width: 320, height: 640, mobile: true, textScale: 1 },
    // 1.4.12: the WCAG text-spacing override (the bookmarklet's values).
    { id: 'spacing-chromebook', width: 1366, height: 768, textScale: 1, spacing: true },
    { id: 'spacing-phone', width: 390, height: 844, mobile: true, textScale: 1, spacing: true },
  ]) {
    await runScenes(setting, async (page, label, screen) => {
      if (setting.spacing) {
        await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
        await page.waitForTimeout(400);
      }
      // A screen's `include` (the certification's: the assignment tools are
      // measured inside .mathmaster-question-stage, not the harness's
      // stand-in navigator).
      const result = await page.evaluate(MEASURE, screen.include || null);
      if (setting.baseline) { baselineSizes.set(`${label}|${setting.id}`, result.sizes); return; }
      if (setting.textScale > 1 && parseFloat(result.rootFont) < 16 * 1.9) failures.push(`${label} ${setting.id}: the text-size setting did not apply (root ${result.rootFont}); the measurement is void`);
      const grow = setting.textScale > 1 ? unscaled(label, setting.id, result.sizes) : { comparable: true, list: [] };
      const { sizes, ...kept } = result;
      report.push({ label, setting: setting.id, ...kept, unscaled: grow.list, unscaledComparable: grow.comparable, textBoxes: sizes.length });
      const fine = result.scrollX <= 1 && result.clippedCount === 0 && result.offscreenCount === 0 && grow.list.length === 0;
      console.log(`${fine ? 'ok  ' : 'FAIL'} text ${label.padEnd(30)} ${setting.id.padEnd(16)} root=${result.rootFont} scrollX=${result.scrollX} clipped=${result.clippedCount} offscreen=${result.offscreenCount} unscaled=${grow.comparable ? `${grow.list.length}/${sizes.length}` : 'n/a'}`);
      if (result.scrollX > 1) failures.push(`${label} ${setting.id}: horizontal scroll ${result.scrollX}px (${result.wide.join('; ')})`);
      if (result.clippedCount) failures.push(`${label} ${setting.id}: ${result.clippedCount} clipped text box(es): ${result.clipped.join('; ')}`);
      if (result.offscreenCount) failures.push(`${label} ${setting.id}: ${result.offscreenCount} text box(es) past the viewport edge: ${result.offscreen.join('; ')}`);
      if (grow.list.length) failures.push(`${label} ${setting.id}: ${grow.list.length} text box(es) did not grow at 200%: ${[...new Set(grow.list)].slice(0, 10).join('; ')}`);
      await page.screenshot({ path: path.join(artifacts, `${label.replace(/\//g, '--')}-${setting.id}.png`), fullPage: true }).catch(() => {});
    });
  }
  writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
}

await browser.close();
if (failures.length) {
  console.error(`studentShellLargeText: ${failures.length} failure(s)\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('studentShellLargeText: all checks passed');
