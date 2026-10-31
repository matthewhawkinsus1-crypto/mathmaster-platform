// THE SCREEN KEYBOARD AND THE BOX BEING TYPED INTO, IN THE REAL APP (PH05).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/teacherWorkflow/keyboardPhoneJourneys.mjs
//
// With the keyboard up at 390×480 the focused answer box showed 11 of its 70px
// (B-68, C2-76, W7 decision 29): focus revealed the box while the screen was
// whole, then the keyboard took its half and nothing looked again.
//
// Student 910002 on a 390×844 touch phone, in the App's phone shell (identity
// bar, navigator, task card, the work in its own scroller, the work bar). For a
// MathLive box (`?questions=real`, Classwork 1, 69px tall) and the plain boxes
// of a Matrix Lab (`?questions=matrices`, Practice 6, 44px): tap the box, then
// the screen shrinks to 390×480 the way a keyboard shrinks it (a layout resize,
// which is what Firefox and some Android browsers do; Android Chrome and iOS
// shrink only the visual viewport, which the platform test
// keyboardRevealsFocusedField.test.mjs runs the geometry of):
//
//   open     at least 90% of the box is on screen and nothing is drawn over it
//            (the work bar, the task card): sampled over a grid of points, the
//            top-most element at each must be the box itself;
//   typing   a character typed with the keyboard up leaves it that way;
//   closed   the screen back to 390×844, the box is on screen.
//
// Exit code 1 on any finding. KEYBOARD_SHOTS=<dir> saves a screenshot of each.
import { mkdirSync } from 'node:fs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const SHOTS = process.env.KEYBOARD_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const STUDENT = '910002';
const WIDTH = 390;
const FULL = 844;
// An on-screen keyboard is about 300-360px: 390×480 is the size the finding measured.
const WITH_KEYBOARD = 480;
const MIN_SHARE = 90;

const SCENES = [
  { lesson: 'real', section: 'Classwork', number: 1, label: 'Classwork 1 (a MathLive box)', box: 'math-field' },
  { lesson: 'matrices', section: 'Practice', number: 6, label: 'Matrix Lab Practice 6 (plain boxes)', box: 'input:not([disabled]):not([readonly])' },
];

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

const openLesson = async (lesson) => {
  const context = await newSchoolContext(browser, { viewport: { width: WIDTH, height: FULL }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`page error ${error.message}`));
  const search = new URLSearchParams({ reset: '1', as: 'student', studentId: STUDENT, questions: lesson, p3StartMin: '40' });
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1800);
  return { context, page };
};

const goTo = async (page, section, number) => {
  const progress = page.locator('.mathmaster-focus-view-button');
  if (/show progress/i.test(await progress.innerText())) {
    await progress.click();
    await page.waitForTimeout(500);
  }
  await page.locator('.mathmaster-section-tab', { hasText: section }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.mathmaster-question-number', { hasText: new RegExp(`^${number}$`) }).first().click();
  await page.waitForTimeout(1800);
  const focus = page.locator('.mathmaster-focus-view-button');
  if (/focus view/i.test(await focus.innerText())) {
    await focus.click();
    await page.waitForTimeout(500);
  }
};

// The share of the focused box a student sees: points over the box that are inside the visible
// viewport and where the top-most element is the box (or inside it).
const visibleShare = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { focused: null, share: 0, coveredBy: {} };
  const visual = window.visualViewport;
  const rect = el.getBoundingClientRect();
  let seen = 0;
  let total = 0;
  const coveredBy = {};
  for (let ix = 1; ix <= 5; ix += 1) {
    for (let iy = 1; iy <= 7; iy += 1) {
      const x = rect.left + (rect.width * ix) / 6;
      const y = rect.top + (rect.height * iy) / 8;
      total += 1;
      if (x < visual.offsetLeft || x > visual.offsetLeft + visual.width || y < visual.offsetTop || y > visual.offsetTop + visual.height) {
        coveredBy['outside the screen'] = (coveredBy['outside the screen'] || 0) + 1;
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) seen += 1;
      else {
        const name = (hit?.className && String(hit.className).split(' ')[0]) || hit?.tagName || 'nothing';
        coveredBy[name] = (coveredBy[name] || 0) + 1;
      }
    }
  }
  return {
    focused: `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}`,
    share: Math.round((seen / total) * 100),
    coveredBy,
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
  };
});

// The reveal runs two frames after the resize: give it a moment and read until the share settles.
const settledShare = async (page, wanted = MIN_SHARE) => {
  let last = await visibleShare(page);
  for (let attempt = 0; attempt < 12 && last.share < wanted; attempt += 1) {
    await page.waitForTimeout(250);
    last = await visibleShare(page);
  }
  return last;
};

for (const scene of SCENES) {
  const { context, page } = await openLesson(scene.lesson);
  await goTo(page, scene.section, scene.number);
  const box = page.locator('.mathmaster-question-stage').locator(scene.box).first();
  await box.waitFor({ timeout: 20000 });
  await box.scrollIntoViewIfNeeded();
  await box.tap();
  await page.waitForTimeout(700);
  const whole = await visibleShare(page);
  check(whole.share >= MIN_SHARE, `${scene.label}: with the screen whole the box is on screen`, `${whole.share}%`);

  await page.setViewportSize({ width: WIDTH, height: WITH_KEYBOARD });
  const open = await settledShare(page);
  check(open.share >= MIN_SHARE, `${scene.label}: with the keyboard up (390×${WITH_KEYBOARD}) the box is on screen and uncovered`, `${open.share}% of ${open.focused}, box ${open.top}-${open.bottom}, covered by ${JSON.stringify(open.coveredBy)}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${scene.lesson}-keyboard-up.png` });

  await page.keyboard.type('5');
  await page.waitForTimeout(500);
  const typed = await settledShare(page);
  check(typed.share >= MIN_SHARE, `${scene.label}: after typing with the keyboard up the box is still on screen`, `${typed.share}%, covered by ${JSON.stringify(typed.coveredBy)}`);

  await page.setViewportSize({ width: WIDTH, height: FULL });
  const closed = await settledShare(page);
  check(closed.share >= MIN_SHARE, `${scene.label}: with the keyboard closed again the box is on screen`, `${closed.share}%`);
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}` : '\nThe screen keyboard leaves the box being typed into on screen: every check passed.');
process.exit(failures.length ? 1 : 0);
