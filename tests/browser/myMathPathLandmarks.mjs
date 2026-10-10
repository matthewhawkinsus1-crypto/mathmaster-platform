/*
 * MY MATH PATH LANDMARKS (release-candidate QA m11) — the real App.jsx, signed
 * in as the accessibility certification's synthetic student, opened on My
 * Math Path exactly as the certification's my-math-path scene opens it, at
 * Chromebook 1366×768 and phone 390×844. Fails (exit 1) unless:
 *
 *   1. the screen has exactly one h1, and it names the screen;
 *   2. its global nav is "Student navigation", like every student screen;
 *   3. activating the skip link puts focus on a non-empty element inside the
 *      main landmark (not the shell's empty #mm-main-content);
 *   4. "Start session 1 of 4" is the accessible name of exactly one
 *      button/link, and no weekly Start/Resume name occurs twice.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/myMathPathLandmarks.mjs
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH as for the certification. Nothing leaves localhost.
 */
import { SCREENS, VIEWPORTS } from './accessibilityCertification.mjs';

const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
const screen = SCREENS.find((entry) => entry.id === 'my-math-path');
if (!screen) throw new Error('accessibilityCertification.mjs no longer has a my-math-path screen');

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const failures = [];
const check = (viewport, ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${viewport}] ${message}`);
  if (!ok) failures.push(`[${viewport}] ${message}`);
};

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: Boolean(viewport.isMobile),
      hasTouch: Boolean(viewport.hasTouch),
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      await screen.open(page, origins);
      for (const scene of screen.scenes) await scene.run(page, origins);

      // 1. One h1, naming the screen.
      const h1s = await page.locator('h1').allInnerTexts();
      check(viewport.id, h1s.length === 1 && h1s[0].trim() === 'My Math Path', `exactly one h1 "My Math Path" (found ${JSON.stringify(h1s)})`);

      // 2. The nav's name.
      const navNames = await page.locator('nav').evaluateAll((navs) => navs.map((nav) => nav.getAttribute('aria-label')));
      check(viewport.id, navNames.filter((name) => name === 'Student navigation').length === 1, `one "Student navigation" (navs: ${JSON.stringify(navNames)})`);
      check(viewport.id, !navNames.includes('MathMaster navigation'), 'no "MathMaster navigation"');

      // 3. The skip link, from the keyboard.
      await page.locator('a.mm-skip-link').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      const landed = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName || null,
          id: active?.id || '',
          text: (active?.textContent || '').trim().slice(0, 80),
          insideMain: Boolean(active?.closest('main, [role="main"]')),
        };
      });
      check(viewport.id, landed.insideMain && landed.text.length > 0 && landed.id !== 'mm-main-content',
        `skip link lands on non-empty content inside main (landed on <${landed.tag?.toLowerCase()}${landed.id ? `#${landed.id}` : ''}> "${landed.text}")`);

      // 4. One control per weekly session.
      const start1 = await page.getByRole('button', { name: 'Start session 1 of 4', exact: true }).count()
        + await page.getByRole('link', { name: 'Start session 1 of 4', exact: true }).count();
      check(viewport.id, start1 === 1, `"Start session 1 of 4" is one control's name (found ${start1})`);
      const names = await page.locator('button, a[href]').evaluateAll((controls) => controls
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => (control.getAttribute('aria-label') || control.innerText || '').replace(/\s+/g, ' ').trim())
        .filter((name) => /^(Start|Resume) session \d/.test(name)));
      const repeated = names.filter((name, index) => names.indexOf(name) !== index);
      check(viewport.id, names.length >= 1 && repeated.length === 0, `weekly launch names are unique (${JSON.stringify(names)})`);

      // 5. The removed "Do this next" card lives on as a marker on the next
      //    session's own card: once, and on the card that holds Start 1 of 4.
      const doNext = page.getByText('Do this next', { exact: true });
      check(viewport.id, await doNext.count() === 1, `"Do this next" appears once (found ${await doNext.count()})`);
      const markedCardHoldsStart1 = await doNext.first().evaluate((marker) => {
        const card = marker.closest('li');
        return Boolean(card && [...card.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Start session 1 of 4'));
      }).catch(() => false);
      check(viewport.id, markedCardHoldsStart1, '"Do this next" marks the card whose button is "Start session 1 of 4"');

      // 6. Becoming an h1 did not restyle the title: it reads exactly like the
      //    <strong> title on a tab that keeps its own h1 (Mastery Overview).
      const titleLook = () => page.locator('header').first().evaluate((header) => {
        const strong = [...header.querySelectorAll('strong')].find((node) => node.textContent.trim() === 'My Math Path');
        if (!strong) return null;
        const style = getComputedStyle(strong);
        // The header row's item: the h1 on Path, the bare <strong> elsewhere.
        const box = (strong.closest('h1') || strong).getBoundingClientRect();
        return {
          inH1: Boolean(strong.closest('h1')),
          letterSpacing: style.letterSpacing,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          color: style.color,
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
        };
      });
      const pathTitle = await titleLook();
      await page.getByRole('navigation', { name: 'My Math Path navigation' }).getByRole('button', { name: 'Mastery Overview' }).click();
      await page.getByRole('heading', { level: 1 }).filter({ hasNotText: 'My Math Path' }).first().waitFor({ timeout: 30_000 });
      const overviewTitle = await titleLook();
      check(viewport.id, pathTitle?.inH1 === true && overviewTitle?.inH1 === false,
        `the title is the h1 on Path and a plain <strong> on Mastery Overview (${pathTitle?.inH1} / ${overviewTitle?.inH1})`);
      const { inH1: _a, ...pathLook } = pathTitle || {};
      const { inH1: _b, ...overviewLook } = overviewTitle || {};
      check(viewport.id, pathTitle && overviewTitle && JSON.stringify(pathLook) === JSON.stringify(overviewLook),
        `the h1 title looks the same as the <strong> title (path ${JSON.stringify(pathLook)} vs overview ${JSON.stringify(overviewLook)})`);

      check(viewport.id, pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
    } catch (error) {
      check(viewport.id, false, `could not reach My Math Path: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nMy Math Path landmarks FAILED (${failures.length}).`);
  process.exitCode = 1;
} else {
  console.log('\nMy Math Path landmarks passed at both viewports.');
}
