/*
 * LIVE CLASS'S TABS, BY KEYBOARD (TT27, slice 2) — the real App.jsx, signed in
 * as the accessibility certification's synthetic teacher, on Teacher Home, where
 * Live Class lives, at Chromebook 1366×768 and phone 390×844. Presses the keys a
 * keyboard teacher presses and fails (exit 1) unless:
 *
 *   T1  Room, Walkthrough and Attention are tabs in one tab list, exactly one
 *       of them is in the Tab order, and it is the selected one (tabindex 0, the
 *       others -1);
 *   T2  each tab says which panel it controls, that panel exists and has the
 *       tab panel role, and it is named by the selected tab (Chromium's own
 *       accessible name for it starts with the tab's);
 *   T3  Tab from the selected tab leaves the list, into the panel, and
 *       Shift+Tab comes back to it: it is one stop, not three;
 *   T4  Right and Left move focus to the next and the previous tab, wrapping;
 *       Home and End go to the first and the last; Up and Down do not move it
 *       (the page scrolls on them);
 *   T5  moving does not select: after all of that, the selected tab, the panel's
 *       name and the assignment chosen in the room are exactly as they were;
 *   T6  Enter on a tab selects it: aria-selected, the one Tab stop and the
 *       panel's name all follow, and the panel shows that view;
 *   T7  Space on a tab selects it too, and a click still does;
 *   T8  focus is where the keys left it (on the tab that was selected), not
 *       lost to the page, after each selection.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/accessibilityTeacherLiveClassTabs.mjs
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH as for the certification. Nothing leaves localhost.
 */
import { VIEWPORTS } from './accessibilityCertification.mjs';
import { TEACHER_SCREENS } from './accessibilityTeacherScreens.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';

const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
const screen = TEACHER_SCREENS.find((entry) => entry.id === 'teacher-home');
if (!screen) throw new Error('accessibilityTeacherScreens.mjs no longer has a teacher-home screen');

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

const LIST = '[role="tablist"][aria-label="Live monitoring mode"]';
const NAMES = ['Room', 'Walkthrough', 'Attention'];

// The tabs as the page has them now, and what each says about itself.
const readTabs = (page) => page.evaluate((list) => {
  const tabs = [...document.querySelectorAll(`${list} [role="tab"]`)];
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls') || '');
  return tabs.map((tab) => {
    const panel = panelOf(tab);
    return {
      name: tab.textContent.replace(/\s+/g, ' ').trim(),
      selected: tab.getAttribute('aria-selected') === 'true',
      tabindex: tab.tabIndex,
      controls: tab.getAttribute('aria-controls'),
      id: tab.id,
      panelRole: panel?.getAttribute('role') || null,
      panelLabelledBy: panel?.getAttribute('aria-labelledby') || null,
      focused: document.activeElement === tab,
    };
  });
}, LIST);

const focusedTabName = async (page) => (await readTabs(page)).find((tab) => tab.focused)?.name.split(' ·')[0] ?? null;
const selectedName = async (page) => (await readTabs(page)).find((tab) => tab.selected)?.name.split(' ·')[0] ?? null;
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(120); };

try {
  for (const viewport of VIEWPORTS) {
    const tag = viewport.id;
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
      await screen.open(page, origins);
      await screen.scenes[0].run(page, origins);
      await page.locator(LIST).waitFor({ timeout: 30_000 });

      // The assignment chosen in the room: what "moving does not select" is read against.
      const roomChoice = () => page.locator('#home-live-class select[aria-label="Assignment"]').inputValue();
      const choiceAtStart = await roomChoice();

      // T1, T2: what the page says about its tabs.
      let tabs = await readTabs(page);
      const first = tabs.find((tab) => tab.selected)?.name.split(' ·')[0];
      check(tag, tabs.length === 3 && tabs.every((tab, index) => tab.name.startsWith(NAMES[index])), `T1 three tabs, Room, Walkthrough and Attention (${tabs.map((tab) => tab.name).join(' | ')})`);
      check(tag, tabs.filter((tab) => tab.tabindex >= 0).length === 1 && tabs.find((tab) => tab.tabindex >= 0)?.selected === true, 'T1 exactly one tab is in the Tab order, and it is the selected one');
      check(tag, tabs.every((tab) => tab.controls && tab.panelRole === 'tabpanel'), `T2 each tab controls an element that has the tabpanel role (${tabs.map((tab) => tab.controls).join(', ')})`);
      check(tag, new Set(tabs.map((tab) => tab.id)).size === 3 && tabs.every((tab) => tab.id) && tabs.find((tab) => tab.selected)?.panelLabelledBy === tabs.find((tab) => tab.selected)?.id, 'T2 the panel is labelled by the selected tab, by id');
      check(tag, (await page.getByRole('tabpanel', { name: new RegExp(`^${first}`) }).count()) === 1, `T2 Chromium names the panel after the selected tab ("${first}")`);

      // T3: one stop.
      await page.locator(`${LIST} [role="tab"][aria-selected="true"]`).focus();
      await press(page, 'Tab');
      const afterTab = await page.evaluate((list) => ({ inList: Boolean(document.activeElement?.closest(list)), inPanel: Boolean(document.activeElement?.closest('[role="tabpanel"]')), body: document.activeElement === document.body }), LIST);
      check(tag, !afterTab.inList && !afterTab.body && afterTab.inPanel, `T3 Tab leaves the tab list, into the panel (in the list: ${afterTab.inList}, in the panel: ${afterTab.inPanel})`);
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(120);
      check(tag, (await focusedTabName(page)) === first, 'T3 Shift+Tab comes back to the selected tab');

      // T4: the keys, from the selected tab (Room at the start).
      const at = async () => focusedTabName(page);
      const i = NAMES.indexOf(first);
      await press(page, 'ArrowRight');
      check(tag, (await at()) === NAMES[(i + 1) % 3], `T4 ArrowRight moves focus to ${NAMES[(i + 1) % 3]} (${await at()})`);
      await press(page, 'ArrowRight'); await press(page, 'ArrowRight');
      check(tag, (await at()) === NAMES[(i + 3) % 3], 'T4 and wraps from the last to the first');
      await press(page, 'ArrowLeft');
      check(tag, (await at()) === NAMES[(i + 2) % 3], 'T4 ArrowLeft wraps from the first to the last');
      await press(page, 'Home');
      check(tag, (await at()) === 'Room', 'T4 Home goes to the first tab');
      await press(page, 'End');
      check(tag, (await at()) === 'Attention', 'T4 End goes to the last tab');
      await press(page, 'ArrowDown'); const afterDown = await at();
      await press(page, 'ArrowUp'); const afterUp = await at();
      check(tag, afterDown === 'Attention' && afterUp === 'Attention', 'T4 Up and Down leave focus where it is');

      // T5: none of it selected anything.
      tabs = await readTabs(page);
      check(tag, (await selectedName(page)) === first && tabs.find((tab) => tab.selected)?.tabindex === 0, `T5 moving selected nothing: ${first} is still the selected tab and the one Tab stop`);
      check(tag, (await page.getByRole('tabpanel', { name: new RegExp(`^${first}`) }).count()) === 1, 'T5 and the panel is still named after it');
      check(tag, (await roomChoice()) === choiceAtStart, `T5 and the assignment chosen in the room is as it was (${JSON.stringify(choiceAtStart)})`);

      // T6: Enter selects. (Focus is on Attention.)
      await press(page, 'Home'); await press(page, 'ArrowRight'); // Walkthrough
      await press(page, 'Enter');
      check(tag, (await selectedName(page)) === 'Walkthrough', `T6 Enter on Walkthrough selects it (${await selectedName(page)})`);
      tabs = await readTabs(page);
      check(tag, tabs.filter((tab) => tab.tabindex >= 0).length === 1 && tabs.find((tab) => tab.tabindex >= 0)?.name.startsWith('Walkthrough') && tabs.find((tab) => tab.selected)?.panelLabelledBy === tabs.find((tab) => tab.selected)?.id, 'T6 the one Tab stop and the panel\'s label followed the selection');
      check(tag, (await page.getByRole('tabpanel', { name: /^Walkthrough/ }).count()) === 1, 'T6 Chromium names the panel "Walkthrough"');
      check(tag, (await page.locator('[role="tabpanel"] [data-walkthrough-empty], [role="tabpanel"]:has-text("Teacher is on Classwork")').count()) > 0, 'T6 and the panel shows the Walkthrough view');
      check(tag, (await focusedTabName(page)) === 'Walkthrough', 'T8 focus is on the tab that was selected');

      // T7: Space selects, and so does a click.
      await press(page, 'End');
      await press(page, ' ');
      check(tag, (await selectedName(page)) === 'Attention' && (await page.getByRole('tabpanel', { name: /^Attention/ }).count()) === 1, 'T7 Space on Attention selects it, and names the panel');
      check(tag, (await focusedTabName(page)) === 'Attention', 'T8 focus is on the tab that was selected');
      await page.getByRole('tab', { name: /^Room/ }).evaluate((tab) => tab.click());
      await page.waitForTimeout(200);
      tabs = await readTabs(page);
      check(tag, (await selectedName(page)) === 'Room' && tabs.find((tab) => tab.tabindex >= 0)?.name.startsWith('Room') && (await page.getByRole('tabpanel', { name: /^Room/ }).count()) === 1, 'T7 a click on Room selects it, with the Tab stop and the panel\'s name');

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

if (failures.length) {
  console.error(`\nLive Class tabs by keyboard FAILED (${failures.length}).`);
  process.exitCode = 1;
} else {
  console.log('\nLive Class tabs by keyboard passed at both viewports.');
}
