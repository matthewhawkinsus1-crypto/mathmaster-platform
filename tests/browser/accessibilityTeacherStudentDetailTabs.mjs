/*
 * A STUDENT'S DETAIL PAGE, ITS VIEWS BY KEYBOARD (TT27, fifth slice) — the real App.jsx, signed in as the
 * synthetic teacher, Students -> "Open" on a student, at Chromebook 1366×768 and phone 390×844. The seven views were
 * plain buttons whose selected one was shown by colour alone; they are a tab list, as the administrator's sections
 * are (accessibilityTeacherAdminTabs.mjs). Fails (exit 1) unless:
 *
 *   D1  seven tabs in order, exactly one in the Tab order, and it is the selected one (Overview, as the page opens);
 *   D2  each tab controls the tab panel, and the panel is named by the selected tab;
 *   D3  Tab from the selected tab leaves the list (one stop, not seven), and Shift+Tab comes back to it; with a view
 *       that holds controls (Assignments), Tab goes from its tab into the panel;
 *   D4  Right / Left wrap, Home / End jump, Up / Down do not move focus;
 *   D5  moving selects nothing;
 *   D6  Enter and Space select, and the Tab stop, the panel's name and the view under it follow.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/accessibilityTeacherStudentDetailTabs.mjs
 */
import { VIEWPORTS } from './accessibilityCertification.mjs';
import { openStudentDetailView, openTeacherApp } from './accessibilityTeacherScreens.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';

const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
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
const LIST = '[role="tablist"][aria-label="Student details"]';
const NAMES = ['Overview', 'Learning Profile', 'Progress', 'Assignments', 'My Math Path', 'Supports', 'Account'];
// Each view's own heading, which the panel shows when its tab is chosen.
const VIEW_HEADING = { Overview: 'Overview', Progress: 'Domain readiness', Account: 'Account' };
const readTabs = (page) => page.evaluate((list) => [...document.querySelectorAll(`${list} [role="tab"]`)].map((tab) => {
  const panel = document.getElementById(tab.getAttribute('aria-controls') || '');
  return { name: tab.textContent.trim(), selected: tab.getAttribute('aria-selected') === 'true', tabindex: tab.tabIndex, id: tab.id, panelRole: panel?.getAttribute('role') || null, panelLabelledBy: panel?.getAttribute('aria-labelledby') || null, focused: document.activeElement === tab };
}), LIST);
const focused = async (page) => (await readTabs(page)).find((tab) => tab.focused)?.name ?? null;
const selected = async (page) => (await readTabs(page)).find((tab) => tab.selected)?.name ?? null;
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(150); };
const panelShows = async (page, name) => (await page.getByRole('tabpanel', { name, exact: true }).count()) === 1
  && (await page.getByRole('tabpanel', { name, exact: true }).getByRole('heading', { name: VIEW_HEADING[name], exact: true }).count()) === 1;

try {
  for (const viewport of VIEWPORTS) {
    const tag = viewport.id;
    const context = await newSchoolContext(browser, { viewport: { width: viewport.width, height: viewport.height }, isMobile: Boolean(viewport.isMobile), hasTouch: Boolean(viewport.hasTouch), colorScheme: 'light', reducedMotion: 'reduce' });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      await openTeacherApp(page, origins);
      await openStudentDetailView('Overview')(page);
      await page.locator(LIST).waitFor({ timeout: 30_000 });

      let tabs = await readTabs(page);
      check(tag, tabs.length === 7 && tabs.every((tab, i) => tab.name === NAMES[i]), 'D1 seven tabs in order');
      check(tag, tabs.filter((tab) => tab.tabindex >= 0).length === 1 && tabs.find((tab) => tab.tabindex >= 0)?.name === 'Overview' && (await selected(page)) === 'Overview', 'D1 one Tab stop, the selected tab (Overview)');
      const sel = tabs.find((tab) => tab.selected);
      check(tag, tabs.every((tab) => tab.panelRole === 'tabpanel') && sel?.panelLabelledBy === sel?.id, 'D2 each tab controls the tabpanel, labelled by the selected tab');
      check(tag, await panelShows(page, 'Overview'), 'D2 Chromium names the panel "Overview", and it holds the overview');

      // The overview holds no control, so what follows the list may be the end of the page: off the list is the point.
      await page.locator(`${LIST} [role="tab"][aria-selected="true"]`).focus();
      await press(page, 'Tab');
      check(tag, await page.evaluate((list) => !document.activeElement?.closest(list), LIST), 'D3 Tab leaves the tab list');
      await press(page, 'Shift+Tab');
      check(tag, (await focused(page)) === 'Overview', 'D3 Shift+Tab comes back to the selected tab');

      await press(page, 'ArrowRight');
      check(tag, (await focused(page)) === NAMES[1], 'D4 Right moves to the next tab');
      await press(page, 'ArrowLeft'); await press(page, 'ArrowLeft');
      check(tag, (await focused(page)) === NAMES[6], 'D4 Left wraps first to last');
      await press(page, 'ArrowRight');
      check(tag, (await focused(page)) === NAMES[0], 'D4 Right wraps last to first');
      await press(page, 'End');
      check(tag, (await focused(page)) === NAMES[6], 'D4 End goes to the last');
      await press(page, 'Home');
      check(tag, (await focused(page)) === NAMES[0], 'D4 Home goes to the first');
      await press(page, 'ArrowDown'); await press(page, 'ArrowUp');
      check(tag, (await focused(page)) === NAMES[0], 'D4 Up and Down leave focus');
      await press(page, 'End');
      check(tag, (await selected(page)) === 'Overview' && (await panelShows(page, 'Overview')), 'D5 moving selected nothing');

      await press(page, 'Enter');
      tabs = await readTabs(page);
      check(tag, (await selected(page)) === 'Account' && tabs.find((tab) => tab.tabindex >= 0)?.name === 'Account' && (await panelShows(page, 'Account')), 'D6 Enter selects; Tab stop, panel name and view follow');
      check(tag, (await focused(page)) === 'Account', 'D6 focus stays on the tab');
      await press(page, 'Home'); await press(page, 'ArrowRight'); await press(page, 'ArrowRight'); await press(page, ' ');
      check(tag, (await selected(page)) === 'Progress' && (await panelShows(page, 'Progress')), 'D6 Space selects');
      await press(page, 'ArrowRight'); await press(page, 'Enter');
      check(tag, (await selected(page)) === 'Assignments', 'D6 Enter selects Assignments');
      await press(page, 'Tab');
      check(tag, await page.evaluate(() => Boolean(document.activeElement?.closest('[role="tabpanel"]')) && document.activeElement?.getAttribute('role') !== 'tab'), 'D3 Tab goes from the selected tab into its panel');
      check(tag, pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
    } catch (error) {
      check(tag, false, `could not drive the tabs: ${error.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failures.length) { console.error(`\nA student's detail views by keyboard FAILED (${failures.length}).`); process.exitCode = 1; } else console.log('\nA student\'s detail views by keyboard passed at both viewports.');
