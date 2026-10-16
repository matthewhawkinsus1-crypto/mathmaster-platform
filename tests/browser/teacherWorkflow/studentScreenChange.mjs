// SCREEN CHANGES, LANDMARKS AND THE PHONE NAV (student pass 3, NAV-3, NAV-13, NAV-15).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/studentScreenChange.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE / CHROMIUM_PATH as for the other journeys;
//    VIEWPORTS=1366x768,390x844.)
//
// The real App.jsx with `firebase/*` replaced by the in-memory fakes — nothing
// can reach a Firebase project. At each viewport, signed in as Harper:
//
//   S1  Every nav destination, pressed with the keyboard (Enter), moves focus
//       to that screen's h1 (inside its one main landmark, or its only h1) and says the screen's
//       name in the shell's live region. On a phone the folded places are
//       reached through "More".
//   S2  View Results → the result page, then browser Back → Assignments: the
//       same, both ways.
//   S3  The nav is one row (≤ 52px) on Home, Assignments and Grades at both
//       sizes; on a phone "More" unfolds the rest and Escape folds them.
//       Prints the heights and where the first assignment starts.
//   S4  No screen scrolls sideways.
//   S5  Home → "See results": the result page's Back reads "← Home" and goes
//       Home (NAV-9), where browser Back would have gone.
//   S6  Assignments: a search survives View Results → browser Back.
//
// Exit code 1 on any finding.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));
const asStudent = 'as=student&studentId=910001';

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const expect = (step, condition, detail) => {
  if (!condition) findings.push(`${step}: ${detail}`);
  return condition;
};

const NAV = 'nav[aria-label="Student navigation"]';
// Destination label → the screen's name as said (the document title without the suffix).
const DESTINATIONS = [
  { label: 'Grades', said: 'Grades' },
  { label: 'Assignments', said: 'Assignments' },
  { label: 'My Rewards', said: 'My Rewards' },
  { label: 'My Math Path', said: 'My Math Path' },
  { label: 'Tests & Exams', said: 'Tests & Exams' },
  { label: 'Home', said: 'Home' },
];

const screenState = (page) => page.evaluate((navSelector) => {
  const active = document.activeElement;
  const visible = (element) => element.getClientRects().length > 0;
  const nav = [...document.querySelectorAll(navSelector)].find(visible);
  return {
    focusTag: active?.tagName || null,
    focusText: (active?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    focusInMain: Boolean(active?.closest('main')),
    said: document.querySelector('[data-screen-announcement]')?.textContent || '',
    mains: [...document.querySelectorAll('main, [role="main"]')].length,
    h1s: [...document.querySelectorAll('h1')].filter(visible).length,
    navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : null,
    scrollWidth: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  };
}, NAV);

// The screen settles: focus on an h1 and the name said, or 4 s.
const settled = async (page, said) => {
  await page.waitForFunction((expected) => document.activeElement?.tagName === 'H1'
    && document.querySelector('[data-screen-announcement]')?.textContent === expected, said, { timeout: 4000 }).catch(() => {});
  return screenState(page);
};

const checkScreen = (step, state, said) => {
  // Inside main — or the screen's only h1 (My Math Path draws its h1 in the
  // header above its main, myMathPathLandmarks.js).
  expect(step, state.focusTag === 'H1' && (state.focusInMain || state.h1s === 1), `focus is on ${state.focusTag} "${state.focusText}", not the screen's h1`);
  expect(step, state.said === said, `the live region said "${state.said}", not "${said}"`);
  expect(step, state.mains === 1, `${state.mains} main landmarks`);
  expect(step, state.h1s >= 1, 'no visible h1');
  expect(step, state.scrollWidth <= state.width + 1, `scrolls sideways: ${state.scrollWidth} > ${state.width}`);
};

const pressDestination = async (page, label, phone) => {
  const nav = page.locator(NAV).filter({ visible: true }).first();
  let button = nav.locator('button', { hasText: label }).first();
  if (phone && !(await button.isVisible())) {
    const more = nav.locator('button.mm-student-nav__more');
    await more.focus();
    await page.keyboard.press('Enter');
    await button.waitFor({ state: 'visible', timeout: 3000 });
  }
  button = nav.locator('button', { hasText: label }).first();
  await button.focus();
  await page.keyboard.press('Enter');
};

const measures = [];
for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`;
  const phone = viewport.width <= 640;
  const context = await newSchoolContext(browser, { viewport, isMobile: phone, hasTouch: phone });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/?reset=1&${asStudent}`, { timeout: 180_000 });
  await page.getByText(/Welcome, /).first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);

  // S1 — every destination, by keyboard.
  for (const destination of DESTINATIONS) {
    await pressDestination(page, destination.label, phone);
    const state = await settled(page, destination.said);
    checkScreen(`S1 ${tag} ${destination.label}`, state, destination.said);
  }

  // S3 — one row, and More on a phone.
  const heights = {};
  for (const destination of ['Home', 'Assignments', 'Grades']) {
    await pressDestination(page, destination, phone);
    await settled(page, destination);
    const state = await screenState(page);
    heights[destination] = state.navHeight;
    expect(`S3 ${tag} ${destination}`, state.navHeight !== null && state.navHeight <= 52, `the nav is ${state.navHeight}px tall (more than one row)`);
    if (destination === 'Assignments') {
      heights.firstAssignmentTop = await page.evaluate(() => {
        const row = document.querySelector('main article');
        return row ? Math.round(row.getBoundingClientRect().top + window.scrollY) : null;
      });
    }
  }
  measures.push(`${tag}: nav ${JSON.stringify(heights)}`);
  if (phone) {
    const nav = page.locator(NAV).filter({ visible: true }).first();
    const more = nav.locator('button.mm-student-nav__more');
    expect(`S3 ${tag}`, await more.isVisible(), 'no More button on a phone');
    expect(`S3 ${tag}`, !(await nav.locator('button', { hasText: 'My Rewards' }).isVisible()), 'My Rewards is not folded on a phone');
    await more.focus();
    await page.keyboard.press('Enter');
    expect(`S3 ${tag}`, (await more.getAttribute('aria-expanded')) === 'true', 'More did not expand');
    expect(`S3 ${tag}`, await nav.locator('button', { hasText: 'My Rewards' }).isVisible(), 'More did not show My Rewards');
    await page.keyboard.press('Escape');
    expect(`S3 ${tag}`, (await more.getAttribute('aria-expanded')) === 'false', 'Escape did not fold More');
    expect(`S3 ${tag}`, await page.evaluate(() => document.activeElement?.classList.contains('mm-student-nav__more')), 'Escape did not return focus to More');
  } else {
    expect(`S3 ${tag}`, !(await page.locator(`${NAV} button.mm-student-nav__more`).first().isVisible()), 'More is drawn on a laptop');
  }

  // S2 — the result page and browser Back.
  await pressDestination(page, 'Assignments', phone);
  await settled(page, 'Assignments');
  const viewResults = page.getByRole('button', { name: 'View Results' }).filter({ visible: true }).first();
  if (expect(`S2 ${tag}`, await viewResults.count(), 'no View Results on Assignments')) {
    await viewResults.focus();
    await page.keyboard.press('Enter');
    const result = await settled(page, 'Assignment result');
    checkScreen(`S2 ${tag} result`, result, 'Assignment result');
    await page.goBack();
    const back = await settled(page, 'Assignments');
    checkScreen(`S2 ${tag} Back`, back, 'Assignments');
  }

  // S5 — a result opened from Home goes back to Home.
  await pressDestination(page, 'Home', phone);
  await settled(page, 'Home');
  const finished = page.getByRole('button', { name: /Finished/ }).filter({ visible: true }).first();
  if (expect(`S5 ${tag}`, await finished.count(), 'no Finished group on Home')) {
    if ((await finished.getAttribute('aria-expanded')) === 'false') await finished.click();
    const seeResults = page.getByRole('button', { name: 'See results' }).filter({ visible: true }).first();
    if (expect(`S5 ${tag}`, await seeResults.count(), 'no See results on Home')) {
      await seeResults.click();
      await settled(page, 'Assignment result');
      const back = page.locator('main button').filter({ hasText: /^← / }).first();
      expect(`S5 ${tag}`, (await back.innerText()).trim() === '← Home', `the result page's Back reads "${(await back.innerText()).trim()}"`);
      await back.click();
      const home = await settled(page, 'Home');
      checkScreen(`S5 ${tag} ← Home`, home, 'Home');
    }
  }

  // S6 — Assignments keeps its search across View Results and Back.
  await pressDestination(page, 'Assignments', phone);
  await settled(page, 'Assignments');
  const toggle = page.locator('button.mm-assignments-filters__toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('#assignments-search').fill('Elimination');
  await page.waitForTimeout(200);
  const resultsButton = page.getByRole('button', { name: 'View Results' }).filter({ visible: true }).first();
  if (expect(`S6 ${tag}`, await resultsButton.count(), 'no View Results after searching')) {
    await resultsButton.click();
    await settled(page, 'Assignment result');
    await page.goBack();
    await settled(page, 'Assignments');
    const kept = await page.locator('#assignments-search').inputValue().catch(() => null);
    expect(`S6 ${tag}`, kept === 'Elimination', `the search came back as ${JSON.stringify(kept)}`);
    await page.locator('#assignments-search').fill('');
  }

  expect(`${tag}`, errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await context.close();
}
await browser.close();

measures.forEach((line) => console.log(line));
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.log(`  - ${finding}`));
  process.exit(1);
}
console.log('\nScreen changes, landmarks and the phone nav: all checks passed.');
