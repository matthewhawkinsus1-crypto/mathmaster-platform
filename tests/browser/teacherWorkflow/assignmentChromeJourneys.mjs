// Student pass 3, Batches 5 and 7 — "where you stand, and room to work":
// the assignment screen's chrome in the REAL App (in-memory Firebase).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs
//   node tests/browser/teacherWorkflow/assignmentChromeJourneys.mjs
//
// Each journey is a student, 910002 (synthetic), on today's lesson
// (`?questions=real`), at 1366×768 and/or 390×844:
//
//   room        the navigator starts as one compact row on both sizes; the
//               sticky chrome ends by y=240 on a Chromebook (y=301 before),
//               and a phone question gets at least 480px (373px before).
//   phoneRow    phone: back, Previous and Next are 44px; no text in the
//               navigator under 12px; with "Show progress" open the question
//               numbers are 44px too (RUN-15).
//   focusView   "Show progress" and "Focus view", pressed with a real pointer,
//               leave the work where it was on screen (RUN-7).
//   warmup      phone, Warm-Up open: no banner over the task card, the time is
//               in the section pill, no toast over Submit, Submit can be
//               tapped; from Classwork the status chip offers the Warm-Up (RUN-14).
//   statusChip  phone: a late lesson and a closed one say so in the chip, and
//               the chip opens the full line (NAV-5).
//   sections    Classwork the teacher closed reads "Closed by your teacher"
//               and still opens, read-only; the Exit ticket (DOL) tab is
//               focusable, says when it opens, and pressing it shows why (RUN-8).
//   dolTimer    an open Exit ticket (DOL) warns at 2:00 and 0:30 in an
//               assertive region, shows seconds in its last minute and says
//               unfinished answers are not turned in (RUN-10).
//
// ONLY=room,warmup runs some. Exit code 1 on any failure.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const STUDENT = '910002';
const LESSON = 'a-today';
const CLASS_IDS = ['c-alg2-p3', 'c-lab-p3'];
const CHROMEBOOK = { name: 'Chromebook 1366×768', viewport: { width: 1366, height: 768 } };
const PHONE = { name: 'phone 390×844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);

/**
 * Signs the student in on a fresh school, applies `prepare` to the harness
 * database (before the lesson opens), and opens today's lesson.
 */
const openLesson = async (device, { params = {}, prepare = null, prepareArgs = {}, button = /^(Continue|Resume Question|Start)/, group = null } = {}) => {
  const context = await newSchoolContext(browser, { viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${device.name}: page error ${error.message}`));
  const search = new URLSearchParams({ reset: '1', as: 'student', studentId: STUDENT, questions: 'real', ...params });
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  if (prepare) {
    await page.evaluate(prepare, { lesson: LESSON, student: STUDENT, classIds: CLASS_IDS, ...prepareArgs });
    await page.waitForTimeout(600);
  }
  if (group) { await page.getByRole('button', { name: group }).first().click(); await page.waitForTimeout(400); }
  await page.getByRole('button', { name: button }).first().click();
  await page.locator('.mathmaster-question-stage').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  return { context, page };
};

const workTop = (page) => page.evaluate(() => {
  const stage = document.querySelector('.mathmaster-question-stage');
  const work = stage?.querySelector('[data-work-view-focus="true"]') || stage?.querySelector('.math-tool-workspace') || stage;
  return work.getBoundingClientRect().top;
});
// A real pointer, where the button is: no scroll-into-view first.
const pointerClick = async (page, locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const tapReaches = (page, selector) => page.evaluate((target) => {
  const element = [...document.querySelectorAll(target)].find((candidate) => candidate.getBoundingClientRect().height > 0);
  if (!element) return false;
  const box = element.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return Boolean(hit && (hit === element || element.contains(hit)));
}, selector);
const clearLesson = ({ lesson, student }) => {
  const grades = window.__mmHarnessStore.get(`grades/${student}`) || {};
  window.__mmHarnessStore.update(`grades/${student}`, { gradesByAssignment: { ...(grades.gradesByAssignment || {}), [lesson]: {} } });
};

/* ---------------------------------------------------------------- room */
if (wanted('room')) {
  for (const device of [CHROMEBOOK, PHONE]) {
    const { context, page } = await openLesson(device);
    const nav = await page.evaluate(() => {
      const element = document.querySelector('.mathmaster-assignment-unified-nav');
      const anchor = document.querySelector('.mathmaster-desktop-question-anchor');
      const stage = document.querySelector('.mathmaster-question-stage');
      const work = stage?.querySelector('[data-work-view-focus="true"]') || stage?.querySelector('.math-tool-workspace');
      const bar = [...document.querySelectorAll('.mathmaster-desktop-action-bar, .portrait-action-bar')].find((candidate) => candidate.getBoundingClientRect().height > 0);
      return {
        compact: element.classList.contains('is-collapsed'),
        height: element.getBoundingClientRect().height,
        chromeEnd: anchor?.getBoundingClientRect().height ? anchor.getBoundingClientRect().bottom : null,
        workTop: work?.getBoundingClientRect().top,
        barTop: bar?.getBoundingClientRect().top,
        text: element.innerText.replace(/\s+/g, ' '),
      };
    });
    check(nav.compact, `${device.name}: the navigator opens as one compact row`);
    check(!/if submitted now|on-time access|personalized versions/i.test(nav.text), `${device.name}: no grade projection or program words in the navigator`, nav.text.slice(0, 120));
    if (device === PHONE) {
      check(nav.height <= 64, `${device.name}: the navigator is one row`, `${Math.round(nav.height)}px (179px before)`);
      const room = nav.barTop - nav.workTop;
      check(room >= 480, `${device.name}: the question gets at least 480px`, `${Math.round(room)}px, work y=${Math.round(nav.workTop)} (373px at y=410 before)`);
    } else {
      check(nav.chromeEnd != null && nav.chromeEnd <= 240, `${device.name}: the sticky chrome ends by y=240`, `y=${Math.round(nav.chromeEnd)} (y=301 before)`);
    }
    await context.close();
  }
}

/* ------------------------------------------------------------ phoneRow */
if (wanted('phoneRow')) {
  const { context, page } = await openLesson(PHONE);
  const sizes = await page.evaluate(() => {
    const nav = document.querySelector('.mathmaster-assignment-unified-nav');
    const size = (selector) => {
      const element = [...nav.querySelectorAll(selector)].find((candidate) => candidate.getBoundingClientRect().height > 0);
      const box = element?.getBoundingClientRect();
      return box ? [Math.round(box.width), Math.round(box.height)] : null;
    };
    return { back: size('.mathmaster-unified-nav-back'), previous: size('button[aria-label="Previous question"]'), next: size('button[aria-label="Next question"]'), place: nav.querySelector('.mathmaster-collapsed-current-location')?.innerText.replace(/\s+/g, ' ') };
  });
  for (const [name, box] of Object.entries({ back: sizes.back, Previous: sizes.previous, Next: sizes.next })) {
    check(box && box[0] >= 44 && box[1] >= 44, `${PHONE.name}: ${name} is at least 44×44`, JSON.stringify(box));
  }
  check(/Classwork\s*Q1 of 2/.test(sizes.place || ''), `${PHONE.name}: the row says the section and "Q1 of 2"`, sizes.place);
  const smallText = (await page.evaluate(() => {
    const nav = document.querySelector('.mathmaster-assignment-unified-nav');
    return [...nav.querySelectorAll('*')]
      .filter((element) => element.getBoundingClientRect().height > 0 && [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()))
      .map((element) => [element.textContent.trim().slice(0, 20), parseFloat(getComputedStyle(element).fontSize)]);
  })).filter(([, px]) => px < 12);
  check(!smallText.length, `${PHONE.name}: no navigator text under 12px`, JSON.stringify(smallText));
  await page.locator('.mathmaster-focus-view-button').click();
  await page.waitForTimeout(500);
  const numbers = await page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-number')].map((button) => {
    const box = button.getBoundingClientRect();
    return [Math.round(box.width), Math.round(box.height)];
  }));
  check(numbers.length > 0 && numbers.every(([width, height]) => width >= 44 && height >= 44), `${PHONE.name}: with progress shown, question numbers are 44px`, JSON.stringify(numbers));
  const smallExpanded = (await page.evaluate(() => {
    const nav = document.querySelector('.mathmaster-assignment-unified-nav');
    return [...nav.querySelectorAll('.mathmaster-section-tab small, .mathmaster-current-section-summary span, .mathmaster-section-tab-label')]
      .map((element) => [element.textContent.trim().slice(0, 20), parseFloat(getComputedStyle(element).fontSize)]);
  })).filter(([, px]) => px < 12);
  check(!smallExpanded.length, `${PHONE.name}: tab and progress text at least 12px`, JSON.stringify(smallExpanded));
  await context.close();
}

/* ----------------------------------------------------------- focusView */
if (wanted('focusView')) {
  for (const questions of ['real', 'systems']) {
    const { context, page } = await openLesson(CHROMEBOOK, { params: { questions } });
    const toggle = page.locator('.mathmaster-focus-view-button');
    const before = await workTop(page);
    await pointerClick(page, toggle);
    await page.waitForTimeout(600);
    const shown = await workTop(page);
    check(Math.abs(shown - before) <= 2, `${CHROMEBOOK.name} (${questions}): "Show progress" leaves the work in place`, `${Math.round(before)} → ${Math.round(shown)}`);
    await pointerClick(page, toggle);
    await page.waitForTimeout(600);
    const focused = await workTop(page);
    check(Math.abs(focused - before) <= 2, `${CHROMEBOOK.name} (${questions}): "Focus view" leaves the work in place`, `${Math.round(before)} → ${Math.round(focused)}`);
    await context.close();
  }
}

/* -------------------------------------------------------------- warmup */
if (wanted('warmup')) {
  // Class started five minutes ago: the Warm-Up is open, and this student
  // has not done it.
  const { context, page } = await openLesson(PHONE, { params: { p3StartMin: '5' }, prepare: clearLesson });
  // The lesson resumes in Classwork; the chip there offers the Warm-Up.
  const chip = page.locator('.mathmaster-assignment-status-chip');
  check(/Warm-Up open/.test(await chip.innerText().catch(() => '')), `${PHONE.name}: from Classwork, the status chip says the Warm-Up is open`);
  await chip.click();
  await page.waitForTimeout(300);
  const go = page.getByRole('button', { name: 'Go to the Warm-Up' });
  check(await go.isVisible(), `${PHONE.name}: the chip opens a line that goes to the Warm-Up`);
  await go.click();
  await page.waitForTimeout(1200);
  const prompt = await page.evaluate(() => document.querySelector('.mathmaster-question-stage')?.innerText || '');
  check(/Solve 2y = 10/.test(prompt), `${PHONE.name}: it opens the Warm-Up`, prompt.slice(0, 60));
  const banner = await page.evaluate(() => {
    const element = document.querySelector('.mathmaster-warmup-banner');
    return element ? element.getBoundingClientRect().height : 0;
  });
  check(banner === 0, `${PHONE.name}: no Warm-Up banner over the task card`, `${banner}px`);
  const pill = await page.locator('.mathmaster-assignment-unified-nav [data-section-time-left]').first().innerText().catch(() => '');
  check(/⏱\s*(\d+ min|0:\d\d)/.test(pill), `${PHONE.name}: the Warm-Up's time is in the section pill`, pill);
  await page.waitForTimeout(2500);
  const toast = await page.getByText(/Warm-Up is active|Warm-Up reminder/).count();
  check(toast === 0, `${PHONE.name}: no Warm-Up toast inside the lesson`);
  check(await tapReaches(page, '.portrait-action-bar'), `${PHONE.name}: the Submit bar can be tapped`);
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/warmup-phone.png` });
  await context.close();
}

/* ---------------------------------------------------------- statusChip */
if (wanted('statusChip')) {
  const late = await openLesson(PHONE, {
    prepare: ({ lesson }) => {
      // Dates are Timestamps in the harness database ({ __ts } serialized).
      const stored = window.__mmHarnessStore.exportDoc(`assignments/${lesson}`);
      window.__mmHarnessStore.importDoc(`assignments/${lesson}`, { ...stored, dueAt: { __ts: Date.now() - 3 * 86400_000 } });
    },
  });
  const chip = late.page.locator('.mathmaster-assignment-status-chip');
  const chipText = await chip.innerText().catch(() => '');
  check(/^Late · closes/.test(chipText), `${PHONE.name}: a late lesson says so in the status chip`, chipText);
  check(await chip.getAttribute('aria-expanded') === 'false', `${PHONE.name}: the chip says it opens something`);
  await chip.click();
  await late.page.waitForTimeout(300);
  const panel = await late.page.locator('#mathmaster-assignment-status-panel').innerText().catch(() => '');
  check(/before this assignment closes/.test(panel), `${PHONE.name}: the chip opens the full late line`, panel.slice(0, 120));
  await late.context.close();

  const closed = await openLesson(PHONE, {
    prepare: ({ lesson }) => {
      const stored = window.__mmHarnessStore.exportDoc(`assignments/${lesson}`);
      window.__mmHarnessStore.importDoc(`assignments/${lesson}`, { ...stored, dueAt: { __ts: Date.now() - 6 * 86400_000 }, lateDueAt: { __ts: Date.now() - 4 * 86400_000 } });
    },
    // Home offers a closed lesson as practice, in its own group.
    group: /Closed — try again/,
    button: /Try it again/i,
  });
  const closedChip = await closed.page.locator('.mathmaster-assignment-status-chip').innerText().catch(() => '');
  check(/No credit · practice/.test(closedChip), `${PHONE.name}: a closed lesson's practice says "no credit" in the chip`, closedChip);
  await closed.context.close();

  const desktop = await openLesson(CHROMEBOOK, {
    prepare: ({ lesson }) => {
      const stored = window.__mmHarnessStore.exportDoc(`assignments/${lesson}`);
      window.__mmHarnessStore.importDoc(`assignments/${lesson}`, { ...stored, dueAt: { __ts: Date.now() - 3 * 86400_000 } });
    },
  });
  check(!(await desktop.page.locator('.mathmaster-assignment-status-chip').isVisible()), `${CHROMEBOOK.name}: no chip beside the banners`);
  await desktop.context.close();
}

/* ------------------------------------------------------------ sections */
if (wanted('sections')) {
  const { context, page } = await openLesson(CHROMEBOOK, {
    prepare: ({ lesson, classIds }) => window.__mmHarnessStore.update(`assignments/${lesson}`, {
      sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: Object.fromEntries(classIds.map((classId) => [classId, { state: 'closed' }])) } },
    }),
  });
  await page.locator('.mathmaster-focus-view-button').click();
  await page.waitForTimeout(500);
  const classwork = page.locator('.mathmaster-section-tab', { hasText: 'Classwork' });
  const classworkText = (await classwork.innerText()).replace(/\s+/g, ' ');
  check(/Closed by your teacher/.test(classworkText), `${CHROMEBOOK.name}: the Classwork tab says the teacher closed it`, classworkText);
  check(await classwork.getAttribute('aria-disabled') !== 'true', `${CHROMEBOOK.name}: teacher-closed Classwork still opens`);
  await classwork.click();
  await page.waitForTimeout(800);
  const stage = await page.evaluate(() => document.querySelector('.mathmaster-question-stage')?.innerText.replace(/\s+/g, ' ') || '');
  check(/lowest terms/.test(stage) && /closed the Classwork section/.test(stage), `${CHROMEBOOK.name}: it opens read-only, with its saved work`, stage.slice(0, 160));

  const dol = page.locator('.mathmaster-section-tab', { hasText: 'Exit ticket (DOL)' });
  // (Playwright's isDisabled() counts aria-disabled; the DOM property is what keeps it focusable.)
  const dolTab = await dol.evaluate((button) => ({ ariaDisabled: button.getAttribute('aria-disabled'), disabled: button.disabled, tabIndex: button.tabIndex }));
  check(dolTab.ariaDisabled === 'true' && !dolTab.disabled && dolTab.tabIndex >= 0, `${CHROMEBOOK.name}: the DOL tab is focusable, marked unavailable`, JSON.stringify(dolTab));
  check(/Opens \d{1,2}:\d\d/.test(await dol.innerText()), `${CHROMEBOOK.name}: the DOL tab says when it opens`, (await dol.innerText()).replace(/\s+/g, ' '));
  const description = await dol.evaluate((button) => document.getElementById(button.getAttribute('aria-describedby'))?.textContent || '');
  check(/opens at/.test(description), `${CHROMEBOOK.name}: a screen reader hears why`, description);
  await dol.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const note = await page.locator('.mathmaster-section-lock-note').innerText().catch(() => '');
  check(/opens at/.test(note), `${CHROMEBOOK.name}: pressing it shows the reason on screen`, note);
  await context.close();
}

/* ------------------------------------------------------------ dolTimer */
if (wanted('dolTimer')) {
  for (const device of [CHROMEBOOK, PHONE]) {
    // A teacher's recovery window that closes `seconds` from now.
    const openDolFor = ({ lesson, classIds, seconds }) => {
      const now = Date.now();
      const stored = window.__mmHarnessStore.exportDoc(`assignments/${lesson}`);
      window.__mmHarnessStore.importDoc(`assignments/${lesson}`, {
        ...stored,
        dol: {
          ...(stored.dol || {}),
          recoveryByClassId: Object.fromEntries(classIds.map((classId) => [classId, { openedAt: new Date(now - 60_000).toISOString(), closesAt: new Date(now + seconds * 1000).toISOString(), openedBy: 'harness-teacher', reason: 'teacher-extend' }])),
        },
      });
    };
    const { context, page } = await openLesson(device, { prepare: openDolFor, prepareArgs: { seconds: 126 } });
    const alertText = () => page.evaluate(() => [...document.querySelectorAll('[data-section-time-left] [role="alert"]')].map((region) => region.textContent).join(' | '));
    const pill = () => page.locator('.mathmaster-unified-nav-alert [data-section-time-left]').first().innerText().catch(() => '');
    check(/Exit ticket \(DOL\) open · 2 min/.test(await pill()), `${device.name}: the DOL pill shows the time left`, await pill());
    let said = '';
    for (let waited = 0; waited < 15 && !/2 minutes left/.test(said); waited += 1) { await page.waitForTimeout(1000); said = await alertText(); }
    check(/^2 minutes left on the Exit ticket \(DOL\)\. When time ends, only completed answers are turned in/.test(said), `${device.name}: at 2:00 an assertive region says so`, said);
    check(/only completed answers are turned in/.test(await pill()), `${device.name}: the unfinished-work line is on screen`);
    await page.evaluate(openDolFor, { lesson: LESSON, classIds: CLASS_IDS, seconds: 36 });
    for (let waited = 0; waited < 15 && !/30 seconds left/.test(said); waited += 1) { await page.waitForTimeout(1000); said = await alertText(); }
    check(/30 seconds left on the Exit ticket \(DOL\)/.test(said), `${device.name}: at 0:30 it says so again`, said);
    check(/· 0:[0-3]\d/.test(await pill()), `${device.name}: seconds in the last minute`, await pill());
    if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/dol-${device === PHONE ? 'phone' : 'chromebook'}.png` });
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll assignment chrome journeys passed.');
