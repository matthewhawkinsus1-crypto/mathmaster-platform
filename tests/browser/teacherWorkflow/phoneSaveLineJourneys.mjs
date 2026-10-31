// THE SAVE LINE IS SEEN ON A PHONE (pass 3, wave 7, W7-8).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/teacherWorkflow/phoneSaveLineJourneys.mjs
//
// The real App, signed in as a student, in an assignment. On a phone the
// question stage clips (overflow: hidden) and the question was as tall as the
// stage, so the lines App.jsx puts after it — "Draft saved.", "Not saved ·
// this device could not store your last change…", and the draft-save problem
// notice — sat below the stage's box: at 390×844 "Draft saved." was drawn at
// 851–874, and no sighted student ever saw it.
//
// For every phone layout — upright 390×844, on its side 844×390 and 664×390,
// 320px reflow, 200% browser text (at 390×844, 375×667, 360×640, 320×568 and
// 844×390), and the WCAG 1.4.12 text-spacing override — and a Chromebook for
// reference:
//
//   R  on a phone, after the student types, the routine save line ("Draft
//      saved." and its kind) is not drawn, and the lines under the question
//      take no height: the question keeps its work area (the owner,
//      2026-10-20). On the Chromebook it is drawn as before;
//   L  a save line that needs the student is inside the screen, inside every
//      box that clips it, and nothing (the action bar, a toast) is drawn over
//      it. The line is the real one: the device refuses the write
//      (deviceStorageFault.mjs, the harness switch that aborts every
//      IndexedDB write as a full disk does), the app's own failure path runs,
//      and its longest line that needs the student is drawn ("Not saved ·
//      this device could not store your last change…"). The journey checks
//      that the sentence is the app's, not only where it sits (CI13: it used
//      to type that sentence into the line, because this harness's server
//      accepts every write, offline too). On the Chromebook the routine line
//      is measured first, as before, and then the same real failure;
//   N  with a draft the backup refused (planted the way
//      draftSaveNoticeReloadJourneys.mjs does), the problem notice is the same;
//   B  and upright, the question keeps its whole action bar beside either: at
//      200% text the notice once took the question's room and cut it in half,
//      and on a 320×568 or 360×640 phone even "Draft saved." or the notice
//      left no button of it reachable (W7-8 review, B1).
//
// At 200% text the lines under the question may be taller than the 30% of
// the stage they get; there the notice may scroll in place with its start in
// view: two lines upright, one on its side, where the whole stage is 177px
// and a second line would leave the question nothing (W7-8 review, S1).
//
// PHONE_SAVE_LINE_SHOTS=<dir> also saves a screenshot of each.
// PHONE_SAVE_LINE_ONLY="phone 390×844,Chromebook 1366×768" runs only the layouts
// whose id starts with one of those (all of them when it is not set).
// Exit code 1 on any failure.
import { mkdirSync } from 'node:fs';
import { installDeviceStorageFault, setDeviceStorageFull } from './deviceStorageFault.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const STUDENT = '910002';
const ASSIGNMENT = 'a-today';
const KEPT = 'mathmaster:draft-save-health:v1';
const REFUSED = /can only be saved on this device, not backed up/;
// The longest save line, and one that needs the student (App.jsx, the
// device queue could not be written). What the app says when the device
// refuses a write: the journey checks the line it measures is this one.
const NEEDS_STUDENT_LINE = 'Not saved · this device could not store your last change. Keep this tab open and try it again.';
// studentShellLargeText.mjs's text-spacing override (the bookmarklet's values).
const SPACING = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';

const SETTINGS = [
  { id: 'phone 390×844', width: 390, height: 844, mobile: true },
  { id: 'phone on its side 844×390', width: 844, height: 390, mobile: true },
  { id: 'reflow 320×640', width: 320, height: 640, mobile: true },
  { id: 'phone 390×844 at 200% text', width: 390, height: 844, mobile: true, textScale: 2 },
  { id: 'phone 375×667 at 200% text', width: 375, height: 667, mobile: true, textScale: 2 },
  { id: 'phone 360×640 at 200% text', width: 360, height: 640, mobile: true, textScale: 2 },
  { id: 'phone 320×568 at 200% text', width: 320, height: 568, mobile: true, textScale: 2 },
  { id: 'phone on its side 844×390 at 200% text', width: 844, height: 390, mobile: true, textScale: 2, minLines: 1 },
  { id: 'phone on its side 664×390', width: 664, height: 390, mobile: true },
  { id: 'phone 390×844 with text spacing', width: 390, height: 844, mobile: true, spacing: true },
  { id: 'Chromebook 1366×768', width: 1366, height: 768 },
];
// PHONE_SAVE_LINE_ONLY names layouts by their exact id, to run a few of them.
const ONLY = (process.env.PHONE_SAVE_LINE_ONLY || '').split(',').map((id) => id.trim()).filter(Boolean);
const CHOSEN = ONLY.length ? SETTINGS.filter((setting) => ONLY.includes(setting.id)) : SETTINGS;
if (ONLY.length && CHOSEN.length !== ONLY.length) {
  console.error(`PHONE_SAVE_LINE_ONLY names a layout that does not exist: ${ONLY.filter((id) => !SETTINGS.some((setting) => setting.id === id)).join(', ')}`);
  process.exit(2);
}

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);
const SHOTS = process.env.PHONE_SAVE_LINE_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, '-')}.png` }) : null);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

// Everything a sighted student needs to see the element, measured in the
// page: the part of it left after the screen and every box that clips or
// scrolls it (its visible part), and what is drawn on top of that part. A
// Chromebook page scrolls, so there the element is first brought into view,
// as the student would.
const SEEN = ([selector, minLines = 2]) => {
  const element = document.querySelector(selector);
  if (!element) return { cutBy: ['not on the page'], covered: [], full: false, startSeen: false };
  const lineHeight = (node) => {
    const style = getComputedStyle(node);
    return parseFloat(style.lineHeight) || 1.2 * parseFloat(style.fontSize);
  };
  const name = (node) => `${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]}`;
  // The rectangle of `node` left after the screen and every ancestor whose
  // overflow is not visible; `cutBy` collects those that took something.
  const visiblePart = (node, cutBy = null) => {
    const rect = node.getBoundingClientRect();
    let part = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    const clip = (box, by) => {
      const next = { top: Math.max(part.top, box.top), bottom: Math.min(part.bottom, box.bottom), left: Math.max(part.left, box.left), right: Math.min(part.right, box.right) };
      if (cutBy && (next.top > part.top + 0.5 || next.bottom < part.bottom - 0.5 || next.left > part.left + 0.5 || next.right < part.right - 0.5)) cutBy.push(by);
      part = next;
    };
    for (let parent = node.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/hidden|clip|auto|scroll/.test(style.overflowX + style.overflowY)) {
        clip(parent.getBoundingClientRect(), `${name(parent)} (${Math.round(parent.getBoundingClientRect().top)}–${Math.round(parent.getBoundingClientRect().bottom)}, overflow ${style.overflowY})`);
      }
    }
    clip({ top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }, `the screen (${window.innerHeight}px)`);
    return { ...part, rect };
  };
  const cutBy = [];
  const part = visiblePart(element, cutBy);
  const { rect } = part;
  const visibleHeight = Math.max(0, part.bottom - part.top);
  const covered = [];
  if (visibleHeight > 6 && part.right - part.left > 6) {
    const inset = 3;
    [[part.left + inset, part.top + inset], [part.right - inset, part.top + inset],
      [part.left + inset, part.bottom - inset], [part.right - inset, part.bottom - inset],
      [(part.left + part.right) / 2, (part.top + part.bottom) / 2]].forEach(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      if (hit && !element.contains(hit)) covered.push(`covered at (${Math.round(x)}, ${Math.round(y)}) by ${name(hit)}`);
    });
  }
  // The action bar where it is drawn: in landscape it scrolls inside the
  // prompt's column, and most of its box is outside that column.
  const bar = [...document.querySelectorAll('.portrait-action-bar, .landscape-action-bar, .mathmaster-desktop-action-bar')]
    .find((candidate) => candidate.getBoundingClientRect().height > 0);
  if (bar && bar !== element) {
    const barPart = visiblePart(bar);
    if (barPart.left < part.right && part.left < barPart.right && barPart.top < part.bottom - 1 && part.top < barPart.bottom - 1) {
      covered.push(`under the action bar (${Math.round(barPart.top)}–${Math.round(barPart.bottom)})`);
    }
  }
  return {
    cutBy,
    covered: [...new Set(covered)],
    full: cutBy.length === 0 && rect.height >= 1,
    // Its start is on screen, uncut, with at least `minLines` lines of it.
    startSeen: part.top <= rect.top + 1 && visibleHeight >= Math.min(rect.height, minLines * lineHeight(element) - 2),
    // Cut only by the lines' own scrolling area under the question.
    onlyByStatus: cutBy.length > 0 && cutBy.every((by) => by.startsWith('div.mathmaster-question-stage-status')),
    text: element.textContent.trim().slice(0, 60),
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    shown: `${Math.round(part.top)}–${Math.round(part.bottom)}`,
  };
};

const settle = async (page, setting) => {
  if (setting.textScale) {
    await page.__cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * setting.textScale, fixed: 13 * setting.textScale } });
  }
  if (setting.spacing) await page.addStyleTag({ content: SPACING });
  await page.waitForTimeout(500);
};
const signedIn = async (page, setting, { reset = false } = {}) => {
  const search = new URLSearchParams({ as: 'student', studentId: STUDENT, questions: 'real', ...(reset ? { reset: '1' } : {}) });
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await settle(page, setting);
};
const openAssignment = async (page, setting) => {
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await settle(page, setting);
};
const typeIntoFirst = async (page, text) => {
  const field = page.locator('.mathmaster-question-stage math-field').first();
  await field.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 25 });
  await page.keyboard.press('Tab');
};
// The device refuses what the student types next (deviceStorageFault.mjs), and
// the app's own line for it is waited for: the first save line that needs the
// student. The switch stays on until the page is reloaded, so nothing later
// can save and bring the routine line back while it is being measured.
const failASave = async (page) => {
  await setDeviceStorageFull(page, true);
  await typeIntoFirst(page, '8');
  const line = page.locator('[data-save-line]:not([data-save-line-routine])').first();
  try {
    await line.waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    const now = await page.locator('[data-save-line]').first().textContent({ timeout: 1000 }).catch(() => null);
    throw new Error(`the device refused a write, but the app showed no save line that needs the student (the line reads ${JSON.stringify(now && now.trim())})`);
  }
  return (await line.textContent()).trim();
};
const draftKeys = (page) => page.evaluate((prefix) => Object.keys(window.localStorage).filter((key) => key.startsWith(prefix)), `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:`);
const plant = (page, keys) => page.evaluate(([name, value]) => window.sessionStorage.setItem(name, value), [KEPT, JSON.stringify({ 'backup-refused': keys })]);
const seen = async (page, selector, setting) => {
  // The Chromebook page scrolls; a phone's assignment screen does not.
  if (!setting.mobile) await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  return page.evaluate(SEEN, [selector, setting.minLines]);
};
// Whole and uncovered. At 200% text the lines under the question may be
// taller than the 30% of the stage they are given; there they scroll in place,
// and the notice's start must be in view.
const report = (label, result, { mayScroll = false } = {}) => {
  const scrolls = mayScroll && !result.full && result.onlyByStatus && result.startSeen;
  const problems = [...(result.full || scrolls ? [] : result.cutBy.map((by) => `cut by ${by}`)), ...result.covered];
  if (!result.full && !scrolls && !result.cutBy.length) problems.push('has no size');
  return check(problems.length === 0, label, problems.length
    ? `${problems.join('; ')}${result.text ? ` ("${result.text}")` : ''}`
    : `${result.top}–${result.bottom}${scrolls ? `, its start in view (${result.shown}), the rest scrolls in place` : ''}`);
};

for (const setting of CHOSEN) {
  console.log(`\n${setting.id}`);
  const context = await newSchoolContext(browser, {
    viewport: { width: setting.width, height: setting.height },
    isMobile: Boolean(setting.mobile),
    hasTouch: Boolean(setting.mobile),
  });
  await installDeviceStorageFault(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${setting.id}: page error ${error.message}`));
  if (setting.textScale) {
    page.__cdp = await context.newCDPSession(page);
    await page.__cdp.send('Page.enable');
  }
  try {
    await signedIn(page, setting, { reset: true });
    await openAssignment(page, setting);
    await typeIntoFirst(page, '7');
    await page.locator('[data-save-line]').first().waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForTimeout(2500);
    const barWhole = async (what) => {
      if (!setting.mobile || setting.width > setting.height) return;
      report(`B  the action bar is whole beside the ${what} (${setting.id})`, await seen(page, '.portrait-action-bar', setting));
    };
    if (setting.mobile) {
      const routine = await page.evaluate(() => {
        const line = document.querySelector('[data-save-line]');
        const status = document.querySelector('.mathmaster-question-stage-status');
        return {
          text: line?.textContent.trim() || '',
          routine: line?.hasAttribute('data-save-line-routine') || false,
          drawn: Boolean(line && line.getClientRects().length),
          statusHeight: status ? status.getBoundingClientRect().height : null,
        };
      });
      check(routine.routine && !routine.drawn && routine.statusHeight === 0,
        `R  the routine save line is not drawn on a phone, and the question keeps the room (${setting.id})`,
        `"${routine.text}" ${routine.routine ? 'routine' : 'not marked routine'}, ${routine.drawn ? 'drawn' : 'not drawn'}, the lines take ${routine.statusHeight}px`);
      await shot(page, `routine ${setting.id}`);
      // A line that needs the student is drawn: the device refuses the next
      // write and the app says so in its own words (see L above).
      const refusedLine = await failASave(page);
      check(refusedLine === NEEDS_STUDENT_LINE, `L  the line is the app's own words for a write the device refused (${setting.id})`, `"${refusedLine}"`);
      // At 200% text the longest line is taller than the 30% cap and scrolls
      // in place, its start in view, as the problem notice does (W7-8).
      report(`L  a save line that needs the student is seen (the real "Not saved" line; ${setting.id})`, await seen(page, '[data-save-line]', setting), { mayScroll: setting.textScale === 2 });
      await shot(page, `line ${setting.id}`);
      await barWhole('offline save line');
    } else {
      report(`L  the save line is seen (${setting.id})`, await seen(page, '[data-save-line]', setting));
      await shot(page, `line ${setting.id}`);
      // And the same real failure: a Chromebook draws every line.
      const refusedLine = await failASave(page);
      check(refusedLine === NEEDS_STUDENT_LINE, `L  the line is the app's own words for a write the device refused (${setting.id})`, `"${refusedLine}"`);
      report(`L  a save line that needs the student is seen (the real "Not saved" line; ${setting.id})`, await seen(page, '[data-save-line]', setting));
      await shot(page, `line refused ${setting.id}`);
    }

    const keys = await draftKeys(page);
    const draft = keys.find((key) => !key.includes(':ui') && !key.endsWith(':resume')) || keys[0];
    check(Boolean(draft), `the question has a draft on this device (${setting.id})`, JSON.stringify(keys));
    await plant(page, [draft]);
    await signedIn(page, setting);
    await openAssignment(page, setting);
    await page.locator('[data-draft-save-problem]').first().waitFor({ timeout: 15000 });
    const notice = await seen(page, '[data-draft-save-problem]', setting);
    check(REFUSED.test(await page.locator('[data-draft-save-problem]').first().innerText()), `the notice is the backup's (${setting.id})`);
    report(`N  the draft-save problem notice is seen (${setting.id})`, notice, { mayScroll: setting.textScale === 2 });
    await shot(page, `notice ${setting.id}`);
    await barWhole('notice');
  } catch (error) {
    check(false, `${setting.id} ran to the end`, error.message.split('\n')[0]);
  }
  await context.close();
}

await browser.close();
console.log(`\n${failures.length ? `${failures.length} failure(s)` : 'all passed'}`);
process.exit(failures.length ? 1 : 0);
