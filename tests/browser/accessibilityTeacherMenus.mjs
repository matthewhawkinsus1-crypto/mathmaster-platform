/*
 * THE TEACHER'S TWO POP-UPS, BY KEYBOARD (TT27, slice 2) — the real App.jsx,
 * signed in as the accessibility certification's synthetic teacher, on the
 * Assignments screen, at Chromebook 1366×768 and phone 390×844. Presses the
 * keys a keyboard teacher presses and fails (exit 1) unless:
 *
 *   THE ⋮ MENU ON AN ASSIGNMENT CARD (WAI-ARIA Menu Button)
 *   M1  Enter on the ⋮ button opens it with focus on its first item, and the
 *       button says it has a menu and that it is open;
 *   M2  its items are not Tab stops (one Tab stop for the whole menu), and
 *       the menu is named for the assignment;
 *   M3  ArrowDown and ArrowUp move between the items, wrapping, and Home and
 *       End go to the first and the last;
 *   M4  Escape closes it and focus is on the ⋮ button (not the page);
 *   M5  ArrowUp on the button opens it on the last item, and Space on the first;
 *   M6  Tab closes it and carries on from the button, never to the page;
 *   M7  Enter and Space on "Open assignment details" open the Assignment Hub,
 *       and closing the hub puts focus back on the ⋮ button;
 *   M8  a pointer still works: a click opens it (focus goes in), a click on an
 *       item chooses it, and a press outside closes it without taking focus;
 *   M9  on a phone, where it is a bottom sheet, the same keys work and the
 *       sheet's Close button returns focus to the ⋮ button.
 *
 *   THE CLASS SELECTOR'S LIST (WAI-ARIA collapsible dropdown listbox)
 *   C1  ArrowDown on the class button opens it, named, with focus on the class
 *       that is chosen, and its options are not Tab stops;
 *   C2  the arrow keys, Home and End move focus between the options, wrapping,
 *       and moving does not choose (the button still names the same class);
 *   C3  Escape closes it, focus is on the class button and nothing was chosen;
 *   C4  Enter chooses an option: the list closes, focus is on the class button
 *       and it names the new class; the list then opens on that class, and
 *       Space chooses "All classes" again;
 *   C5  Tab closes it without choosing, and a press outside does the same.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/accessibilityTeacherMenus.mjs
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH as for the certification. Nothing leaves localhost.
 */
import { VIEWPORTS } from './accessibilityCertification.mjs';
import { TEACHER_SCREENS } from './accessibilityTeacherScreens.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';

const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
const screen = TEACHER_SCREENS.find((entry) => entry.id === 'teacher-assignments');
if (!screen) throw new Error('accessibilityTeacherScreens.mjs no longer has a teacher-assignments screen');

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

// Where focus is: its tag, role and name, and whether it is the probe-marked
// button, or inside the menu / list that is open.
const focus = (page) => page.evaluate(() => {
  const active = document.activeElement;
  if (!active || active === document.body) return { body: true, name: '' };
  return {
    body: false,
    tag: active.localName,
    role: active.getAttribute('role'),
    name: (active.getAttribute('aria-label') || active.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    probe: active.getAttribute('data-menu-probe'),
    tabindex: active.getAttribute('tabindex'),
    inMenu: Boolean(active.closest('[role="menu"], [role="listbox"]')),
  };
});

const itemNames = (page, role) => page.locator(`[role="${role}"]`).evaluateAll((items) => items.map((item) => (item.getAttribute('aria-label') || item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
const press = async (page, key, times = 1) => { for (let index = 0; index < times; index += 1) await page.keyboard.press(key); };
const settle = (page) => page.waitForTimeout(120);

try {
  for (const viewport of VIEWPORTS) {
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
      await screen.open(page, origins);
      await screen.scenes[0].run(page, origins);

      // -------------------------------------------------------- the ⋮ menu
      const button = page.getByRole('button', { name: /^More actions for/ }).first();
      await button.evaluate((element) => element.setAttribute('data-menu-probe', 'card'));
      const menu = page.getByRole('menu');
      const open = async () => { await button.focus(); await page.keyboard.press('Enter'); await menu.waitFor({ timeout: 10_000 }); await settle(page); };

      await button.focus();
      await page.keyboard.press('Enter');
      await menu.waitFor({ timeout: 10_000 }).catch(() => {});
      await settle(page);
      let at = await focus(page);
      const names = await itemNames(page, 'menuitem');
      check(tag, names.length >= 5 && at.role === 'menuitem' && at.name === names[0], `M1 Enter opens the menu with focus on its first item (${names.length} items; focus on ${JSON.stringify(at.name)}, first is ${JSON.stringify(names[0])})`);
      check(tag, (await button.getAttribute('aria-haspopup')) === 'menu' && (await button.getAttribute('aria-expanded')) === 'true', 'M1 the button says it has a menu, and that it is open');
      check(tag, await menu.evaluate((element) => element.getAttribute('aria-label') === document.querySelector('[data-menu-probe="card"]').getAttribute('aria-label')), 'M2 the menu is named as the button is, for the assignment');
      check(tag, await page.locator('[role="menuitem"]').evaluateAll((items) => items.length > 0 && items.every((item) => item.tabIndex === -1)), 'M2 no item is a Tab stop: the menu is one stop');

      await press(page, 'ArrowDown'); at = await focus(page);
      check(tag, at.name === names[1], `M3 ArrowDown goes to the second item (${JSON.stringify(at.name)})`);
      await press(page, 'ArrowUp'); at = await focus(page);
      check(tag, at.name === names[0], 'M3 ArrowUp goes back to the first');
      await press(page, 'ArrowUp'); at = await focus(page);
      check(tag, at.name === names.at(-1), `M3 ArrowUp from the first wraps to the last (${JSON.stringify(at.name)})`);
      await press(page, 'ArrowDown'); at = await focus(page);
      check(tag, at.name === names[0], 'M3 ArrowDown from the last wraps to the first');
      await press(page, 'End'); at = await focus(page);
      check(tag, at.name === names.at(-1), 'M3 End goes to the last item');
      await press(page, 'Home'); at = await focus(page);
      check(tag, at.name === names[0], 'M3 Home goes to the first item');

      await press(page, 'ArrowDown', 2);
      await press(page, 'Escape'); await settle(page); at = await focus(page);
      check(tag, (await menu.count()) === 0 && (await button.getAttribute('aria-expanded')) === 'false', 'M4 Escape closes the menu');
      check(tag, at.probe === 'card', `M4 and focus is on the ⋮ button, not the page (focus: ${at.body ? 'the page' : JSON.stringify(at.name)})`);

      await button.focus();
      await press(page, 'ArrowUp'); await menu.waitFor({ timeout: 10_000 }).catch(() => {}); await settle(page); at = await focus(page);
      check(tag, at.role === 'menuitem' && at.name === names.at(-1), `M5 ArrowUp on the button opens the menu on its last item (${JSON.stringify(at.name)})`);
      await press(page, 'Escape'); await settle(page);

      await button.focus();
      await press(page, ' '); await menu.waitFor({ timeout: 10_000 }).catch(() => {}); await settle(page); at = await focus(page);
      check(tag, at.role === 'menuitem' && at.name === names[0], `M5 Space on the button opens the menu on its first item too (${JSON.stringify(at.name)})`);
      await press(page, 'Escape'); await settle(page);

      await open();
      await press(page, 'ArrowDown');
      await press(page, 'Tab'); await settle(page); at = await focus(page);
      check(tag, (await menu.count()) === 0 && !at.body && !at.inMenu && at.probe !== 'card', `M6 Tab closes the menu and goes on from the button (focus: ${at.body ? 'the page' : `${at.tag} ${JSON.stringify(at.name)}`})`);

      // M7: choose by Enter, then by Space; the hub's close gives focus back to the button.
      const hub = page.locator('[data-assignment-hub]');
      for (const key of ['Enter', ' ']) {
        await open();
        await press(page, key);
        await hub.waitFor({ timeout: 30_000 }).catch(() => {});
        const opened = await hub.count();
        check(tag, opened === 1 && (await menu.count()) === 0, `M7 ${JSON.stringify(key)} on "Open assignment details" opens the Assignment Hub and closes the menu`);
        if (opened) {
          await page.keyboard.press('Escape');
          await hub.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
          await settle(page); at = await focus(page);
          check(tag, at.probe === 'card', `M7 closing the hub puts focus back on the ⋮ button (focus: ${at.body ? 'the page' : JSON.stringify(at.name)})`);
        }
      }

      // M8: a pointer. Real clicks, on the elements as they are.
      await button.click();
      await menu.waitFor({ timeout: 10_000 }).catch(() => {});
      await settle(page); at = await focus(page);
      check(tag, at.role === 'menuitem' && at.name === names[0], 'M8 a click on the ⋮ button opens the menu with focus on its first item');
      await page.mouse.click(2, 2); await settle(page); at = await focus(page);
      check(tag, (await menu.count()) === 0 && at.probe !== 'card', 'M8 a press outside closes it and does not take focus back from where the person put it');
      await button.click();
      await menu.waitFor({ timeout: 10_000 }).catch(() => {});
      await menu.getByRole('menuitem', { name: names[0], exact: true }).click();
      await hub.waitFor({ timeout: 30_000 }).catch(() => {});
      check(tag, (await hub.count()) === 1 && (await menu.count()) === 0, 'M8 a click on an item chooses it');
      await page.keyboard.press('Escape');
      await hub.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
      await settle(page);

      // M9: the phone's bottom sheet, which has a title and a Close button of its own.
      if (phone) {
        await open();
        const sheet = page.locator('.mathmaster-mobile-action-sheet');
        check(tag, (await sheet.count()) === 1 && (await sheet.locator('[role="menu"] [role="menuitem"]').count()) === names.length && (await sheet.locator('[role="menu"] button:not([role="menuitem"])').count()) === 0,
          'M9 the sheet is the menu\'s items under its title and Close button, and the Close button is not inside the menu');
        await press(page, 'ArrowDown'); at = await focus(page);
        check(tag, at.name === names[1], 'M9 the arrow keys work in the sheet');
        await sheet.getByRole('button', { name: 'Close assignment actions' }).click();
        await settle(page); at = await focus(page);
        check(tag, (await sheet.count()) === 0 && at.probe === 'card', 'M9 the sheet\'s Close button closes it and returns focus to the ⋮ button');
      }

      // --------------------------------------------------- the class list
      const classButton = page.locator('button[aria-haspopup="listbox"]').first();
      await classButton.evaluate((element) => element.setAttribute('data-menu-probe', 'class'));
      const list = page.getByRole('listbox', { name: 'Class' });
      const classText = () => classButton.evaluate((element) => element.textContent.replace(/\s+/g, ' ').trim());
      const classBefore = await classText();

      await classButton.focus();
      await page.keyboard.press('ArrowDown');
      await list.waitFor({ timeout: 10_000 }).catch(() => {});
      await settle(page); at = await focus(page);
      const options = await itemNames(page, 'option');
      const chosenName = await page.locator('[role="option"][aria-selected="true"]').evaluateAll((items) => items.map((item) => item.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
      check(tag, options.length >= 3 && at.role === 'option' && chosenName.length === 1 && at.name === chosenName[0], `C1 ArrowDown on the class button opens the list on the class that is chosen (${options.length} options; focus on ${JSON.stringify(at.name)})`);
      check(tag, (await list.count()) === 1 && (await classButton.getAttribute('aria-haspopup')) === 'listbox' && (await classButton.getAttribute('aria-expanded')) === 'true', 'C1 the list is named "Class", and the button says it is open');
      check(tag, await page.locator('[role="option"]').evaluateAll((items) => items.length > 0 && items.every((item) => item.tabIndex === -1)), 'C1 no option is a Tab stop');

      await press(page, 'End'); at = await focus(page);
      check(tag, at.name === options.at(-1), `C2 End goes to the last option (${JSON.stringify(at.name)})`);
      await press(page, 'ArrowDown'); at = await focus(page);
      check(tag, at.name === options[0], 'C2 ArrowDown from the last wraps to the first');
      await press(page, 'ArrowUp'); at = await focus(page);
      check(tag, at.name === options.at(-1), 'C2 ArrowUp from the first wraps to the last');
      await press(page, 'Home'); await press(page, 'ArrowDown'); at = await focus(page);
      check(tag, at.name === options[1], 'C2 Home, then ArrowDown, is the second option');
      check(tag, (await classText()) === classBefore, 'C2 and moving chose nothing: the button names the same class');

      await press(page, 'Escape'); await settle(page); at = await focus(page);
      check(tag, (await list.count()) === 0 && (await classButton.getAttribute('aria-expanded')) === 'false', 'C3 Escape closes the list');
      check(tag, at.probe === 'class' && (await classText()) === classBefore, `C3 focus is on the class button and nothing was chosen (focus: ${at.body ? 'the page' : JSON.stringify(at.name)})`);

      await classButton.focus();
      await press(page, 'ArrowDown'); await list.waitFor({ timeout: 10_000 }).catch(() => {}); await settle(page);
      await press(page, 'ArrowDown');
      await press(page, 'Enter'); await settle(page); at = await focus(page);
      const classAfter = await classText();
      check(tag, (await list.count()) === 0 && at.probe === 'class' && classAfter !== classBefore, `C4 Enter chooses: the list closes, focus is on the class button, and it now names another class (${JSON.stringify(classAfter)})`);
      await press(page, 'ArrowDown'); await list.waitFor({ timeout: 10_000 }).catch(() => {}); await settle(page); at = await focus(page);
      const nowChosen = await page.locator('[role="option"][aria-selected="true"]').evaluateAll((items) => items.map((item) => item.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
      check(tag, nowChosen.length === 1 && at.name === nowChosen[0] && at.name !== chosenName[0], `C4 the list now opens on the class that was chosen (${JSON.stringify(at.name)})`);
      await press(page, 'Home');
      await press(page, ' '); await settle(page); at = await focus(page);
      check(tag, (await list.count()) === 0 && at.probe === 'class' && (await classText()) === classBefore, 'C4 Space chooses "All classes" again');

      await press(page, 'ArrowDown'); await list.waitFor({ timeout: 10_000 }).catch(() => {}); await settle(page);
      await press(page, 'ArrowDown');
      await press(page, 'Tab'); await settle(page); at = await focus(page);
      check(tag, (await list.count()) === 0 && !at.body && !at.inMenu && (await classText()) === classBefore, `C5 Tab closes the list without choosing (focus: ${at.body ? 'the page' : `${at.tag} ${JSON.stringify(at.name)}`})`);
      await classButton.click();
      await list.waitFor({ timeout: 10_000 }).catch(() => {});
      await page.mouse.click(2, 2); await settle(page);
      check(tag, (await list.count()) === 0 && (await classText()) === classBefore, 'C5 a press outside closes the list without choosing');

      check(tag, pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
    } catch (error) {
      check(tag, false, `could not drive the menus: ${error.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nTeacher menus by keyboard FAILED (${failures.length}).`);
  process.exitCode = 1;
} else {
  console.log('\nTeacher menus by keyboard passed at both viewports.');
}
