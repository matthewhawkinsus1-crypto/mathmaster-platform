/*
 * THE ADMINISTRATOR'S SECTION TABS, BY KEYBOARD (TT27) — the real App.jsx, signed
 * in as the harness's root-admin teacher, on the Administration view, at
 * Chromebook 1366×768, phone 390×844 and tablet 768×1024. Fails (exit 1) unless:
 *
 *   A1  five tabs, exactly one in the Tab order, and it is the selected one;
 *   A2  each tab controls a tab panel, and the panel is named by the selected tab;
 *   A3  Tab from the selected tab leaves the list (one stop, not five);
 *   A4  Right / Left wrap, Home / End jump, Up / Down do not move focus;
 *   A5  moving does not select (the Pre-production reset must not open on the way past);
 *   A6  Enter and Space select, and the Tab stop and the panel's name follow;
 *   A7  the five tabs are one row, on a phone and a tablet too (where it
 *       scrolls sideways instead of stacking 246px tall, or wrapping onto two
 *       rows between 641 and 860px), every tab at least 24px each way, and
 *       End and Home bring the tab they reach into view with room for its
 *       focus ring (teacher features walk, item 1);
 *   A8  at the edges of that range, 641 and 860px wide, the row scrolls
 *       sideways;
 *   A9  from 861 to 976px (a half-screen window on a 1920px display), where
 *       a laptop's row wrapped its fifth tab onto a second row, the five are
 *       one row by tighter spacing: at 861, 920 and 976px one row, nothing
 *       scrolling (the row or the page), 4px between tabs, 8px a tab's sides,
 *       14px the row's ends, and every tab at least 24px each way;
 *   A10 from 977px a laptop's row, as it was: one row with the laptop's
 *       spacing (8px, 16px, 28px), at 977 and 1366px.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/accessibilityTeacherAdminTabs.mjs
 */
import { VIEWPORTS } from './accessibilityCertification.mjs';
import { openTeacherApp } from './accessibilityTeacherScreens.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';

const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// The certification's two sizes, and a tablet's inside the range (641 to 860px) where the tabs wrapped onto two
// rows and now scroll sideways as they do on a phone.
const SIZES = [...VIEWPORTS, { id: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true }];

const failures = [];
const check = (viewport, ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${viewport}] ${message}`);
  if (!ok) failures.push(`[${viewport}] ${message}`);
};
const LIST = '[role="tablist"][aria-label="Administration sections"]';
const NAMES = ['Classes & rosters', 'Accounts & sign-in', 'Path content coverage', 'Assignment AI health', 'Pre-production reset'];
const readTabs = (page) => page.evaluate((list) => [...document.querySelectorAll(`${list} [role="tab"]`)].map((tab) => {
  const panel = document.getElementById(tab.getAttribute('aria-controls') || '');
  return { name: tab.textContent.trim(), selected: tab.getAttribute('aria-selected') === 'true', tabindex: tab.tabIndex, id: tab.id, panelRole: panel?.getAttribute('role') || null, panelLabelledBy: panel?.getAttribute('aria-labelledby') || null, focused: document.activeElement === tab };
}), LIST);
const focused = async (page) => (await readTabs(page)).find((tab) => tab.focused)?.name ?? null;
const selected = async (page) => (await readTabs(page)).find((tab) => tab.selected)?.name ?? null;
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(150); };

try {
  for (const viewport of SIZES) {
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
      await openTeacherApp(page, origins, '&rootAdmin=1');
      await page.getByRole('button', { name: 'Administration', exact: true }).first().evaluate((button) => button.click());
      await page.locator(LIST).waitFor({ timeout: 60_000 });
      await page.waitForTimeout(800);

      let tabs = await readTabs(page);
      const first = tabs.find((tab) => tab.selected)?.name;
      check(tag, tabs.length === 5 && tabs.every((tab, i) => tab.name === NAMES[i]), 'A1 five tabs in order');
      check(tag, tabs.filter((tab) => tab.tabindex >= 0).length === 1 && tabs.find((tab) => tab.tabindex >= 0)?.selected === true, 'A1 one Tab stop, the selected tab');
      const sel = tabs.find((tab) => tab.selected);
      check(tag, tabs.every((tab) => tab.panelRole === 'tabpanel') && sel?.panelLabelledBy === sel?.id, 'A2 each tab controls a tabpanel, labelled by the selected tab');
      check(tag, (await page.getByRole('tabpanel', { name: first, exact: true }).count()) === 1, `A2 Chromium names the panel "${first}"`);

      await page.locator(`${LIST} [role="tab"][aria-selected="true"]`).focus();
      await press(page, 'Tab');
      check(tag, await page.evaluate((list) => !document.activeElement?.closest(list) && document.activeElement !== document.body, LIST), 'A3 Tab leaves the tab list');
      await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(150);
      check(tag, (await focused(page)) === first, 'A3 Shift+Tab comes back to the selected tab');

      await press(page, 'ArrowRight');
      check(tag, (await focused(page)) === NAMES[1], 'A4 Right moves to the next tab');
      await press(page, 'ArrowLeft'); await press(page, 'ArrowLeft');
      check(tag, (await focused(page)) === NAMES[4], 'A4 Left wraps first to last');
      await press(page, 'ArrowRight');
      check(tag, (await focused(page)) === NAMES[0], 'A4 Right wraps last to first');
      await press(page, 'End');
      check(tag, (await focused(page)) === NAMES[4], 'A4 End goes to the last');
      await press(page, 'Home');
      check(tag, (await focused(page)) === NAMES[0], 'A4 Home goes to the first');
      await press(page, 'ArrowDown'); await press(page, 'ArrowUp');
      check(tag, (await focused(page)) === NAMES[0], 'A4 Up and Down leave focus');
      await press(page, 'End');
      check(tag, (await selected(page)) === first && (await page.getByRole('tabpanel', { name: first, exact: true }).count()) === 1, 'A5 moving selected nothing (the reset section did not open)');

      await press(page, 'Enter');
      tabs = await readTabs(page);
      check(tag, (await selected(page)) === NAMES[4] && tabs.find((tab) => tab.tabindex >= 0)?.name === NAMES[4] && (await page.getByRole('tabpanel', { name: NAMES[4], exact: true }).count()) === 1, 'A6 Enter selects; Tab stop and panel name follow');
      check(tag, (await focused(page)) === NAMES[4], 'A6 focus stays on the tab');
      await press(page, 'Home'); await press(page, ' ');
      check(tag, (await selected(page)) === NAMES[0] && (await page.getByRole('tabpanel', { name: NAMES[0], exact: true }).count()) === 1, 'A6 Space selects');

      const layout = await page.evaluate((list) => {
        const box = document.querySelector(list).getBoundingClientRect();
        const tabs = [...document.querySelectorAll(`${list} [role="tab"]`)].map((tab) => tab.getBoundingClientRect());
        return { height: box.height, tops: [...new Set(tabs.map((tab) => Math.round(tab.top)))], sizes: tabs.map((tab) => [tab.width, tab.height]) };
      }, LIST);
      check(tag, layout.tops.length === 1 && layout.height <= 80, `A7 one row (${Math.round(layout.height)}px tall, ${layout.tops.length} row(s))`);
      check(tag, layout.sizes.every(([width, height]) => width >= 24 && height >= 24), 'A7 every tab is at least 24px each way');
      // The focused tab is inside the row's box, and where the row clips (a phone's scrolling row), so is its ring.
      const shown = () => page.evaluate((list) => {
        const row = document.querySelector(list);
        const box = row.getBoundingClientRect();
        const tab = document.activeElement.getBoundingClientRect();
        const ring = getComputedStyle(row).overflowX === 'visible' ? 0 : 5;
        return tab.left - ring >= box.left - 0.5 && tab.right + ring <= box.right + 0.5 && tab.bottom + ring <= box.bottom + 0.5;
      }, LIST);
      await press(page, 'End');
      check(tag, (await focused(page)) === NAMES[4] && await shown(), 'A7 End brings the last tab, and its focus ring, into view');
      await press(page, 'Home');
      check(tag, (await focused(page)) === NAMES[0] && await shown(), 'A7 Home brings the first tab back into view');
      if (tag === 'desktop') {
        // A8: the row at the edges of the tablet range, and a laptop's from the next pixel.
        const rowAt = async (width) => {
          await page.setViewportSize({ width, height: viewport.height });
          await page.waitForTimeout(300);
          return page.evaluate((list) => {
            const row = document.querySelector(list);
            const style = getComputedStyle(row);
            const tabs = [...row.querySelectorAll('[role="tab"]')];
            const tops = new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
            const tab = getComputedStyle(tabs[0]);
            return {
              rows: tops.size, wrap: style.flexWrap, overflowX: style.overflowX,
              scrolls: row.scrollWidth > row.clientWidth + 0.5 || document.documentElement.scrollWidth > window.innerWidth,
              spacing: [style.columnGap, style.paddingLeft, style.paddingRight, tab.paddingLeft, tab.paddingRight].join(' '),
              smallest: Math.min(...tabs.map((entry) => Math.min(entry.getBoundingClientRect().width, entry.getBoundingClientRect().height))),
            };
          }, LIST);
        };
        for (const width of [641, 860]) {
          const row = await rowAt(width);
          check(tag, row.rows === 1 && row.wrap === 'nowrap' && row.overflowX === 'auto', `A8 at ${width}px one row that scrolls sideways (${JSON.stringify(row)})`);
        }
        for (const width of [861, 920, 976]) {
          const row = await rowAt(width);
          check(tag, row.rows === 1 && !row.scrolls && row.overflowX === 'visible' && row.spacing === '4px 14px 14px 8px 8px' && row.smallest >= 24, `A9 at ${width}px one row by tighter spacing, nothing scrolling (${JSON.stringify(row)})`);
        }
        for (const width of [977, 1366]) {
          const row = await rowAt(width);
          check(tag, row.rows === 1 && !row.scrolls && row.wrap === 'wrap' && row.overflowX === 'visible' && row.spacing === '8px 28px 28px 16px 16px', `A10 at ${width}px a laptop's row, as it was (${JSON.stringify(row)})`);
        }
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
      }
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
if (failures.length) { console.error(`\nAdministrator tabs by keyboard FAILED (${failures.length}).`); process.exitCode = 1; } else console.log('\nAdministrator tabs by keyboard passed at every size.');
