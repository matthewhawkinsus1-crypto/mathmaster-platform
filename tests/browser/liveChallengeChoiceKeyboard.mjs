/*
 * LIVE CHALLENGE CHOICES ARE A REAL RADIO GROUP — browser proof (QA m4).
 *
 * The bug: answer choices were role="radio" buttons with no arrow keys. A
 * student pressed ArrowDown (nothing happened) then Space, which locked in
 * choice 1 when they meant choice 2; after Lock In, focus fell to <body>.
 *
 * Drives the REAL Live Challenge round in the real App.jsx (the accessibility
 * certification's in-memory harness and its live-challenge lobby + round
 * scenes, whose question is a real multiple-choice Path item) at 1366x768 and
 * 390x844, and asserts:
 *
 *   - one tab stop (the first option while nothing is checked);
 *   - ArrowDown moves focus to choice 2 AND checks it; Up/Down wrap;
 *   - no arrow, Space or Enter on the group ever locks an answer in (no
 *     pending submission is written, Lock In Answer stays enabled);
 *   - after Lock In, the submitted response is choice 2's id;
 *   - focus after Lock In is the "locked in" note, never <body>.
 *
 *   TEACHER_HARNESS_PORT=5541 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5541 node tests/browser/liveChallengeChoiceKeyboard.mjs
 *
 * PLAYWRIGHT_MODULE / CHROMIUM_PATH as in accessibilityCertification.mjs.
 * Exits non-zero on any failed check. Nothing leaves localhost.
 */
import { SCREENS, VIEWPORTS } from './accessibilityCertification.mjs';

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PENDING_KEY = 'live-challenge-pending-a11y-room-0-1';

const screen = SCREENS.find((entry) => entry.id === 'live-challenge');
if (!screen) throw new Error('accessibilityCertification no longer has the live-challenge screen.');

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const failures = [];
const check = (viewport, label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${viewport}] ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(`[${viewport}] ${label}: ${detail}`);
};

// Everything the checks read, in one round trip.
// It waits first: a key that locked an answer in asynchronously (a deferred
// click, a state update) must be visible to the check that says it did not.
const snapshot = async (page, pendingKey) => { await page.waitForTimeout(300); return page.evaluate((key) => {
  const group = document.querySelector('[role="radiogroup"]');
  const radios = [...(group?.querySelectorAll('[role="radio"]') || [])];
  const active = document.activeElement;
  const lockButton = [...document.querySelectorAll('button')].find((button) => /Lock In Answer|Checking/.test(button.textContent || ''));
  let pending = null;
  try { pending = JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { pending = null; }
  const labelId = group?.getAttribute('aria-labelledby');
  return {
    groupName: (group?.getAttribute('aria-label') || (labelId && document.getElementById(labelId)?.textContent) || '').trim(),
    ids: radios.map((radio) => radio.getAttribute('data-choice-id')),
    checked: radios.map((radio) => radio.getAttribute('aria-checked')),
    tabIndexes: radios.map((radio) => radio.tabIndex),
    allDisabled: radios.length > 0 && radios.every((radio) => radio.disabled),
    focusedIndex: radios.indexOf(active),
    activeTag: active?.tagName || null,
    activeIsBody: active === document.body || active == null,
    activeIsLockStatus: Boolean(active?.matches?.('[data-mm-lock-status]')),
    activeText: (active?.textContent || '').trim().slice(0, 80),
    lockButtonText: (lockButton?.textContent || '').trim(),
    lockButtonDisabled: lockButton ? lockButton.disabled : null,
    pending,
  };
}, pendingKey); };

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
  const vp = viewport.id;
  try {
    await screen.open(page, { app: ORIGIN });
    for (const scene of screen.scenes) await scene.run(page, { app: ORIGIN }, { first: false });

    let state = await snapshot(page, PENDING_KEY);
    check(vp, 'the round shows at least three choices', state.ids.length >= 3, JSON.stringify(state.ids));
    check(vp, 'the radiogroup has an accessible name', state.groupName.length > 0, 'empty name');
    check(vp, 'nothing is checked or pending at the start', state.checked.every((value) => value === 'false') && !state.pending, JSON.stringify(state));
    check(vp, 'one tab stop, on the first option', state.tabIndexes.filter((value) => value === 0).length === 1 && state.tabIndexes[0] === 0, JSON.stringify(state.tabIndexes));

    const radios = page.locator('[role="radiogroup"] [role="radio"]');
    await radios.first().focus();
    const last = state.ids.length - 1;
    const notLocked = (s) => !s.pending && s.lockButtonText === 'Lock In Answer' && s.lockButtonDisabled === false;

    await page.keyboard.press('ArrowDown');
    state = await snapshot(page, PENDING_KEY);
    check(vp, 'ArrowDown moves focus to choice 2', state.focusedIndex === 1, `focused ${state.focusedIndex}`);
    check(vp, 'ArrowDown checks choice 2 (and only choice 2)', state.checked[1] === 'true' && state.checked.filter((v) => v === 'true').length === 1, JSON.stringify(state.checked));
    check(vp, 'ArrowDown does not lock an answer in', notLocked(state), JSON.stringify({ pending: state.pending, button: state.lockButtonText, disabled: state.lockButtonDisabled }));
    check(vp, 'the tab stop follows the checked option', state.tabIndexes[1] === 0 && state.tabIndexes.filter((v) => v === 0).length === 1, JSON.stringify(state.tabIndexes));

    await page.keyboard.press('Space');
    state = await snapshot(page, PENDING_KEY);
    check(vp, 'Space keeps choice 2 checked and focused', state.checked[1] === 'true' && state.focusedIndex === 1, JSON.stringify(state));
    check(vp, 'Space does not lock an answer in', notLocked(state), JSON.stringify({ pending: state.pending, button: state.lockButtonText }));

    // Wrap both ways, then come back to choice 2. Never a lock on the way.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    state = await snapshot(page, PENDING_KEY);
    check(vp, 'ArrowUp from the first option wraps to the last', state.focusedIndex === last && state.checked[last] === 'true', JSON.stringify(state));
    await page.keyboard.press('ArrowRight');
    state = await snapshot(page, PENDING_KEY);
    check(vp, 'ArrowRight from the last option wraps to the first', state.focusedIndex === 0 && state.checked[0] === 'true', JSON.stringify(state));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    state = await snapshot(page, PENDING_KEY);
    check(vp, 'back on choice 2 after Left, Down, Down', state.focusedIndex === 1 && state.checked[1] === 'true', JSON.stringify(state));
    check(vp, 'no arrow or Enter on the group locked anything in', notLocked(state), JSON.stringify({ pending: state.pending, button: state.lockButtonText }));

    // The explicit Lock In press, from the keyboard.
    await page.getByRole('button', { name: 'Lock In Answer' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction((key) => Boolean(window.localStorage.getItem(key)), PENDING_KEY, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    state = await snapshot(page, PENDING_KEY);
    const submitted = state.pending?.responsePayload?.responses ? Object.values(state.pending.responsePayload.responses) : [];
    check(vp, 'Lock In submitted choice 2', submitted.length === 1 && submitted[0] === state.ids[1], JSON.stringify({ submitted, choice2: state.ids[1], choice1: state.ids[0] }));
    check(vp, 'focus after Lock In is not <body>', !state.activeIsBody, `active ${state.activeTag}`);
    check(vp, 'focus after Lock In is the "locked in" note', state.activeIsLockStatus, `active ${state.activeTag} "${state.activeText}"`);
    check(vp, 'the choices are locked after Lock In, choice 2 still checked', state.allDisabled && state.checked[1] === 'true', JSON.stringify({ disabled: state.allDisabled, checked: state.checked }));
    check(vp, 'no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } catch (error) {
    check(vp, 'the round could be driven', false, error?.stack || String(error));
  } finally {
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  failures.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}
console.log('\nLive Challenge choices: radio group keyboard proof passed at both viewports.');
