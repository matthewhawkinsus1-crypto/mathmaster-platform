/*
 * THE TEACHER WORKSPACE'S MAIN LANDMARK AND SKIP LINK (TT27, slice 2) — the real
 * App.jsx, signed in as the accessibility certification's synthetic teacher, at
 * Chromebook 1366×768 and phone 390×844. It counts the main landmarks of every
 * screen and of the dialogs on top of them (the way
 * tests/browser/teacherWorkflow/studentScreenChange.mjs counts the student's),
 * and fails (exit 1) unless:
 *
 *   L1  every one of the 22 destinations in the teacher's navigation has exactly
 *       one main landmark, it is the workspace's own (#mm-main-content), and it
 *       holds the screen's content, not the navigation or the header;
 *   L2  the dialogs and drawers a teacher opens on top of a screen leave it at
 *       one: the Assignment Hub, the Pre-Flight review with its student preview
 *       open (which drew its own <main> beside the review's controls, and whose
 *       work area draws one of its own where no host has one), the Find palette
 *       and a student's drawer;
 *   L3  the first Tab stop on a screen is "Skip to main content", it shows itself
 *       when it has focus, and Enter puts focus on the main landmark, from which
 *       the next Tab goes into the screen's content, past the navigation (22 links
 *       and the sidebar's collapse button) and the header's Find and Log Out;
 *   L4  the navigation and the header stay landmarks of their own, outside the
 *       main: one banner (the header) and the teacher dashboard navigation;
 *   L5  the administrator's workspace (the harness's ?rootAdmin=1 teacher, and its
 *       Administration view) has one main, the link as its first Tab stop, and the
 *       link goes to the main.
 *
 * It also prints how many Tab stops stand between the top of a screen and its
 * content without the link (the number the link saves a keyboard teacher on every
 * screen), which is a measurement, not a verdict.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/accessibilityTeacherLandmarks.mjs
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH as for the certification. Nothing leaves localhost.
 *
 * For working on it: ONLY_VIEWPORT=desktop (or phone) runs one size, DEBUG_DRIVER=1
 * prints the first lines of the error when a step cannot be driven, and DEBUG_SHOT=<file>
 * saves the page as it was then. None of them changes what is checked.
 */
import { VIEWPORTS } from './accessibilityCertification.mjs';
import { TEACHER_SCREENS } from './accessibilityTeacherScreens.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';

const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
const screenNamed = (id) => {
  const screen = TEACHER_SCREENS.find((entry) => entry.id === id);
  if (!screen) throw new Error(`accessibilityTeacherScreens.mjs no longer has a ${id} screen`);
  return screen;
};

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

const NAV = 'nav[aria-label="Teacher dashboard navigation"]';

// A dialog or drawer one step has left open is closed the way a teacher closes it, so the next starts from the screen.
const closeDialogs = async (page) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const open = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((element) => element.getClientRects().length > 0).length);
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
};

// The workspace has drawn (its h1 is there: a screen's code may load after a click, and the whole
// page waits for it), and what it loaded has had a moment to settle.
const drawn = async (page) => {
  await page.getByRole('heading', { name: 'Instructor Dashboard', level: 1 }).waitFor({ timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
};

// The main landmarks on screen now, named, and where focus is. A main is an element the browser
// takes for one: <main>, or role="main". Hidden ones are not counted (a person cannot reach them).
const landmarks = (page) => page.evaluate((navSelector) => {
  const drawn = (element) => element.getClientRects().length > 0 && (typeof element.checkVisibility !== 'function' || element.checkVisibility());
  const name = (element) => `${element.localName}${element.id ? `#${element.id}` : ''}${element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.split(' ')[0]}` : ''}`;
  const mains = [...document.querySelectorAll('main, [role="main"]')].filter(drawn);
  const nav = document.querySelector(navSelector);
  const banners = [...document.querySelectorAll('header, [role="banner"]')].filter((header) => drawn(header) && !header.closest('main, article, aside, section, nav, [role="main"], [role="dialog"]'));
  return {
    mains: mains.map(name),
    mainCount: mains.length,
    isWorkspaceMain: mains.length === 1 && mains[0].id === 'mm-main-content',
    mainHoldsNav: Boolean(nav && mains[0]?.contains(nav)),
    mainHoldsHeader: banners.some((header) => mains[0]?.contains(header)),
    banners: banners.length,
    navs: [...document.querySelectorAll('nav')].filter(drawn).map((element) => element.getAttribute('aria-label')),
    h1: [...document.querySelectorAll('h1')].filter(drawn).map((element) => element.textContent.trim().slice(0, 30)),
  };
}, NAV);

try {
  for (const viewport of VIEWPORTS.filter((entry) => !process.env.ONLY_VIEWPORT || entry.id === process.env.ONLY_VIEWPORT)) {
    const tag = viewport.id;
    const phone = Boolean(viewport.isMobile);
    const context = await newSchoolContext(browser, {
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
      const home = screenNamed('teacher-home');
      await home.open(page, origins);
      await home.scenes[0].run(page, origins);

      // What the link saves: the Tab stops from the top of a fresh screen to its first control, without it.
      let before = 0;
      for (let stop = 0; stop < 60; stop += 1) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => ({ link: document.activeElement?.classList.contains('mm-skip-link') || false, inMain: Boolean(document.activeElement?.closest('main')) }));
        if (where.inMain) break;
        if (!where.link) before += 1;
      }
      console.log(`info [${tag}] without the link, ${before} Tab stops come before the first control of Home's content (the link makes it one stop)`);

      // ----------------------------------------------- L3, from a fresh Home
      await home.open(page, origins);
      await home.scenes[0].run(page, origins);
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const first = await page.evaluate(() => {
        const active = document.activeElement;
        const rect = active?.getBoundingClientRect();
        return {
          text: (active?.textContent || '').trim(),
          isLink: active?.localName === 'a',
          onScreen: Boolean(rect && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth && rect.width > 20),
        };
      });
      check(tag, first.isLink && first.text === 'Skip to main content', `L3 the first Tab stop is the "Skip to main content" link (${JSON.stringify(first.text)})`);
      check(tag, first.onScreen, 'L3 and it is on screen while it has focus');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const landed = await page.evaluate(() => ({ id: document.activeElement?.id || '', tag: document.activeElement?.localName || '', insideMain: Boolean(document.activeElement?.closest('main')) }));
      check(tag, landed.id === 'mm-main-content' && landed.tag === 'main', `L3 Enter puts focus on the main landmark (focus: <${landed.tag}${landed.id ? `#${landed.id}` : ''}>)`);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const next = await page.evaluate(() => {
        const active = document.activeElement;
        return { insideMain: Boolean(active?.closest('main')), inNav: Boolean(active?.closest('nav[aria-label="Teacher dashboard navigation"]')), inHeader: Boolean(active?.closest('header')), name: (active?.getAttribute('aria-label') || active?.textContent || '').trim().slice(0, 40) };
      });
      check(tag, next.insideMain && !next.inNav && !next.inHeader, `L3 the next Tab goes into the screen's content, past the navigation and the header (focus: ${JSON.stringify(next.name)})`);

      // ----------------------------------------------- L1, every destination
      const titles = await page.locator(`${NAV} button[title]`).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title')).filter((title) => !/sidebar$/i.test(title)));
      check(tag, titles.length === 22, `L1 the navigation has 22 destinations (${titles.length})`);
      for (const title of titles) {
        await page.locator(NAV).locator(`button[title="${title}"]`).evaluate((button) => button.click());
        await drawn(page);
        const seen = await landmarks(page);
        check(tag, seen.mainCount === 1 && seen.isWorkspaceMain && !seen.mainHoldsNav && !seen.mainHoldsHeader, `L1 ${title}: one main landmark, the workspace's (${seen.mains.join(', ') || 'none'})`);
        check(tag, seen.banners === 1 && seen.navs.includes('Teacher dashboard navigation') && seen.h1.includes('Instructor Dashboard'), `L4 ${title}: one banner, the teacher navigation, and the dashboard's h1 (banners ${seen.banners}, h1 ${JSON.stringify(seen.h1)})`);
      }

      // ----------------------------------------------- L2, dialogs on top
      // Each starts from a fresh page, as the certification's scenes do: they find their class by its name,
      // and a class the walk above has chosen would put another button first.
      const dialogsOpen = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((element) => element.getClientRects().length > 0).length);
      const hub = screenNamed('teacher-assignment-hub');
      await hub.open(page, origins);
      await hub.scenes[0].run(page, origins);
      let seen = await landmarks(page);
      check(tag, seen.mainCount === 1 && (await dialogsOpen()) >= 1, `L2 the Assignment Hub (a dialog is open) leaves one main (${seen.mains.join(', ')})`);
      await closeDialogs(page);

      await page.getByRole('button', { name: /Find/ }).first().evaluate((button) => button.click());
      await page.getByLabel('Find a student, class, assignment or standard').waitFor({ timeout: 15_000 }).catch(() => {});
      seen = await landmarks(page);
      check(tag, seen.mainCount === 1 && (await dialogsOpen()) >= 1, `L2 the Find palette (a dialog is open) leaves one main (${seen.mains.join(', ')})`);
      await closeDialogs(page);

      await home.open(page, origins);
      await home.scenes[0].run(page, origins);
      const student = page.locator('#home-live-class [data-live-tile] button').first();
      if (await student.count()) {
        await student.evaluate((button) => button.click());
        await page.waitForTimeout(1500);
        seen = await landmarks(page);
        check(tag, seen.mainCount === 1 && (await dialogsOpen()) >= 1, `L2 a student's drawer (a dialog is open) leaves one main (${seen.mains.join(', ')})`);
        await closeDialogs(page);
      } else {
        check(tag, false, 'L2 Teacher Home has a student tile to open the drawer from');
      }

      // Pre-Flight with its student preview open: the review's own <main> (wide) or the work area's (narrow).
      const preflight = screenNamed('teacher-preflight');
      await preflight.open(page, origins);
      await preflight.scenes[0].run(page, origins);
      // The preview is on the first step on a laptop, and on the last, Check, on a phone, which has a step to a screen.
      const showPreview = page.getByRole('button', { name: /Open the student preview/ });
      if (!(await showPreview.count())) await preflight.scenes.find((scene) => scene.id === 'check').run(page, origins);
      await showPreview.waitFor({ timeout: 30_000 }).catch(() => {});
      if (await showPreview.count()) {
        await showPreview.evaluate((button) => button.click());
        await page.waitForTimeout(2500);
        seen = await landmarks(page);
        check(tag, seen.mainCount === 1 && (await dialogsOpen()) >= 1, `L2 the Pre-Flight review (a dialog is open) with its student preview open leaves one main (${seen.mains.join(', ')})`);
        check(tag, (await page.getByRole('button', { name: /Hide the student preview/ }).count()) === 1, 'L2 and the preview is open (the check is of that state)');
      } else {
        check(tag, false, 'L2 the Pre-Flight review offers its student preview');
      }

      // L5: the administrator's workspace.
      await page.goto(`${origins.app}/tests/browser/teacherWorkflow/index.html?reset=1&rootAdmin=1`, { timeout: 180_000 });
      await page.getByRole('heading', { name: 'Live Class', exact: true }).waitFor({ timeout: 180_000 });
      await page.getByRole('button', { name: 'Administration', exact: true }).first().evaluate((button) => button.click());
      await page.getByRole('heading', { name: 'MathMaster Administration' }).waitFor({ timeout: 60_000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const adminFirst = await page.evaluate(() => ({ text: (document.activeElement?.textContent || '').trim(), link: document.activeElement?.localName === 'a' }));
      seen = await landmarks(page);
      check(tag, seen.mainCount === 1 && seen.isWorkspaceMain, `L5 the administrator workspace has one main, the workspace's (${seen.mains.join(', ') || 'none'})`);
      check(tag, adminFirst.link && adminFirst.text === 'Skip to main content', `L5 and its first Tab stop is the skip link (${JSON.stringify(adminFirst.text)})`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      check(tag, await page.evaluate(() => document.activeElement?.id === 'mm-main-content' && document.activeElement.localName === 'main'), 'L5 and it puts focus on the main');

      check(tag, pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
    } catch (error) {
      if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT }).catch(() => {});
      check(tag, false, `could not drive the landmarks (${phone ? 'phone' : 'desktop'}): ${error.message.split('\n').slice(0, process.env.DEBUG_DRIVER ? 12 : 1).join(' | ')}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nTeacher landmarks FAILED (${failures.length}).`);
  process.exitCode = 1;
} else {
  console.log('\nTeacher landmarks passed at both viewports.');
}
