/*
 * WHAT WORK VIEW'S OPENER COVERS, ON EVERY SURFACE IT FLOATS OVER (PH01; #386 R17 and R10).
 *
 *   npx vite --config tests/browser/forcedColors.vite.config.mjs --host 127.0.0.1 --port 5198 --strictPort &   # stubbed harnesses
 *   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &                                          # the real app, in memory
 *   node tests/browser/workViewOpenerCover.mjs [--check=cover,badges,room,scroll,staged,settle,hint] [--only=<surface>,...] [--sizes=<size>,...]
 *
 *   AUDIT_ORIGIN (default http://127.0.0.1:5198: any server of the repository with its services stubbed, as the
 *   accessibility certification serves them), TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188),
 *   PLAYWRIGHT_MODULE / CHROMIUM_PATH, OPENER_COVER_ARTIFACTS for report.json (default
 *   tests/browser/artifacts/workViewOpenerCover, git-ignored). On a machine whose system-ui is not DejaVu Sans, run
 *   with FONTCONFIG_FILE="$PWD/tests/browser/support/ciFonts.conf" (an absolute path) to measure what CI measures.
 *
 * WHY. "⤢ Open Work View" floats over the top right corner of the work it opens (EnlargeableFigure.jsx), and on a
 * phone that corner is most of a row. A question's own work starts below it there (WorkViewShell.css, PH01), and a
 * curve's name keeps clear of it (curveLabels.js); nothing looked at the other surfaces it floats over. A figure that
 * is its own Work View (My Math Path's question with a graph, the session recap, a secure Test's field item) drew its
 * y-axis under the button on a 360-390 px phone, and the colour-alone page's figures on their own drew a point and
 * its name, and a system's first equation, under it.
 *
 * WHAT. Six checks, each fails the run:
 *
 *   cover   Every opener on every surface (SURFACES), on a 390x844, 360x740 and 320x568 touch phone at 100% and
 *           200% text, and on a 1366x768 Chromebook as the control: everything a student needs whose box meets the
 *           opener's, the button drawn over it (support/openerCover.mjs readOpenerCoverage): words, a point or its
 *           name, an axis number or name, an equation (in a list), a control, a tries or completion badge.
 *   badges  The real assignment screen (the app in memory, a lesson with a finished section) at the same sizes: the
 *           section's "Complete" and its medallion, each section's progress, the question numbers, the tries line
 *           ("3 of 3 tries left", "Question complete"), the grade weight, the closed verdict and the opener overlap
 *           neither each other nor any other control of the header, and none is cut off by its own box (#386 R17);
 *           on a phone with "Show progress" open the question keeps room for its work (PROGRESS_WORK_MIN).
 *   room    The real assignment screen at a large text size (ROOM_SIZES: the five phones at 200%, the smallest at
 *           150%, and at 100% as the control), on a typed answer, a choice, a graph a student draws and a staged
 *           question (the app in memory, ?questions=room: teacherWorkflow/textRoomLesson.js), in Focus view and with
 *           "Show progress" open: the question keeps a fifth of the screen for its work (WORK_ROOM_SHARE; it had
 *           16px), and its tries, Work View's opener, Submit and Next can each be reached by scrolling what a finger
 *           scrolls, whole and on top. Work View on the graph and the staged question is tall enough for a plane at
 *           its 160px floor and its zoom row together. At 100% Focus view stays one screen with no page scroll. At
 *           every size, 100% included, the question's action bar (and Work View's controls while it is open) fits
 *           the screen: within it and not scrolled sideways, each control within it too, its words inside its own
 *           box and its target 24x24 or more (ACTION_BARS), keeping one layout for 1.5s once settled (BAR_WATCH_MS);
 *           and so on a phone on its side at 200% text, read for its bars alone (ROOM_SIDE_SIZES).
 *   scroll  With Work View open on a 390x844, 360x740 and 320x568 phone, a 1366x768 Chromebook and a 1920x1080
 *           desktop, for every plane tool, the table tools and the Step Algebra boards: the view itself is the one
 *           thing that scrolls up and down (no scroller inside a scroller), and the plane fits the height it is
 *           given (#386 R10). A row wider than a phone that scrolls sideways (a long formula, a source-data list)
 *           is reported, not failed: it is a region of its own the keyboard scrolls.
 *   settle  On a 360x640 and a 412x915 phone, and at 1920x970 and 1920x1080, with Work View open on every step of the
 *           staged questions and of the harness's staged table (?staged=1, with the identity bar): after the step has
 *           settled, its layout (bounded or flowing) and its plane's cap (--mm-step-plane-max) do not change again
 *           for 1.5s, and on a phone neither do they once the number keypad is up for a row of the table, where the
 *           box typed into stays in sight above the keys (stepRoom.js measures what its own cap changes).
 *   staged  With Work View open on every step of the staged questions (WorkflowRunner's focus mode), on the three
 *           phones at 100% and 200% text, a Chromebook at both and a desktop: the step has the height to be worked
 *           in (a bounded step at least 200px, or the view scrolling as one), no scroller inside a scroller, and
 *           the step's plane fits its scroller together with the row of its own controls under it, with the plane
 *           at its 160px floor at least (src/platform/workflow/stepRoom.js). A step whose content is taller than its room even so (the plotting
 *           step's point cards) is reported: it scrolls, its own step or the view. And the step's heading row is whole,
 *           on the page and in Work View: its name, its kind, its review status and its counter ("3 of 17") neither
 *           run past their own box or out of the row nor are cut off at its side (STEP_HEADING_ITEMS).
 *   hint    On a 1366x768 and a 1366x657 Chromebook (its shelf shown), a 1280x689 laptop and a 390x844, 360x740 and
 *           412x915 touch phone, with Work View open on every step of the staged questions and the staged table:
 *           "Show a hint" under the step pressed (tapped on a phone), and once the step has settled the newest hint
 *           whole in the view where it fits, and focus on it or in its panel. The panel takes the step's room, and a
 *           step left too little flows (stepRoom.js), the hint with the results after its Previous/Next: on the base it
 *           was out of sight, and focus on <body> (hintPanelReveal.js).
 *
 * NOTHING LEAVES LOCALHOST: every context aborts non-local requests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readOpenerCoverage } from './support/openerCover.mjs';
import { openCues } from './colourAloneCues.mjs';
import { openCompletedSection } from './accessibilityCertification.mjs';
import { MATH_TOOLS_LAB_SCREEN } from './accessibilityTeacherScreens.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';
import { PLANE_MIN, STEP_MIN_ROOM } from '../../src/platform/workflow/stepRoom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// The phones at the browser's default text size and at 200% (Chromium's default font size 16 -> 32, what the
// text-size setting changes), and a Chromebook as the control: a fix for the phone moves nothing there unless the
// same thing is covered there too.
export const SIZES = Object.freeze([
  { id: '390x844', width: 390, height: 844, phone: true, textScale: 1 },
  { id: '360x740', width: 360, height: 740, phone: true, textScale: 1 },
  { id: '320x568', width: 320, height: 568, phone: true, textScale: 1 },
  { id: '390x844@200%', width: 390, height: 844, phone: true, textScale: 2 },
  { id: '360x740@200%', width: 360, height: 740, phone: true, textScale: 2 },
  { id: '320x568@200%', width: 320, height: 568, phone: true, textScale: 2 },
  { id: '1366x768', width: 1366, height: 768, phone: false, textScale: 1 },
].map(Object.freeze));
// R10's sizes: the phones held upright, a Chromebook and a desktop.
export const SCROLL_SIZES = Object.freeze([
  { id: '390x844', width: 390, height: 844, phone: true, textScale: 1 },
  { id: '360x740', width: 360, height: 740, phone: true, textScale: 1 },
  { id: '320x568', width: 320, height: 568, phone: true, textScale: 1 },
  { id: '1366x768', width: 1366, height: 768, phone: false, textScale: 1 },
  { id: '1920x1080', width: 1920, height: 1080, phone: false, textScale: 1 },
].map(Object.freeze));

const UX_PAGE = '/tests/browser/studentUxPlatform.html';
const HOST_PAGE = '/tests/browser/hostAccessibility.html';

const settled = async (page, ms = 600) => {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(ms);
};

// The assignment harness with every question the sweep reads: the pass's own, one per registry tool (its preview
// sample), one per Path tool as My Math Path delivers it (its public payload), one per legacy question type (the
// authoring catalog's example), and a type this build does not know.
const openAssignment = async (page, origin) => {
  await page.goto(`${origin}${UX_PAGE}?tools=1&legacy=1&path=1&run=opener-cover-${Date.now()}`, { timeout: 180_000 });
  await page.waitForFunction(() => window.__ux && document.querySelector('[data-question-id]'), null, { timeout: 180_000 });
  return page.evaluate(() => window.__ux.ids());
};
const goToQuestion = async (page, id) => {
  await page.evaluate((qid) => window.__ux.go(qid), id);
  // Mounted, its tool loaded (the "Opening Work View…" line gone) and its opener drawn.
  await page.waitForFunction((qid) => {
    const question = document.querySelector(`[data-question-id="${qid}"]`);
    return Boolean(question?.querySelector('button.mathmaster-work-view-opener')) && !question.querySelector('.mathmaster-work-view-loading');
  }, id, { timeout: 60_000 });
  await settled(page, 700);
};

/*
 * THE SURFACES. Each is opened once per size, and each of its scenes read.
 *
 *   assignment  the assignment screen's wrappers around the real QuestionEngine (studentUxPlatform.html): every
 *               registry tool, every Path tool, every legacy question type. The question's own opener.
 *   hosts       the figures that are their own Work View in the hosts that are not the assignment screen
 *               (hostAccessibility.html): My Math Path's own question with a graph, the session recap's graph, and a
 *               secure Test's field item and its graph. PathQuestionStimulus draws each plane with an opener of its own.
 *   lab         the Math Tools Lab (the real app in memory): every tool as the teacher's preview bench mounts it,
 *               with its own opener, or the Work View it registers.
 *   cues        the colour-alone page (colourAloneCues.html), where each plane and the system of equations are
 *               mounted on their own, each its own Work View: where the two cases this sweep was written for were seen
 *               (the Inverse & Composition Lab's (x, f(x)) and "swapped", a system's first equation). On a phone only:
 *               at a Chromebook's width each of these is inside its host in the app (a question, the Lab's tool) and is
 *               read there, under `assignment` and `lab`.
 */
export const SURFACES = Object.freeze([
  {
    id: 'assignment',
    server: 'audit',
    sizes: SIZES,
    read: async (page, origins, record) => {
      const ids = await openAssignment(page, origins.audit);
      for (const id of ids) {
        await goToQuestion(page, id);
        record(id, await readOpenerCoverage(page));
      }
      return ids.length;
    },
  },
  {
    id: 'hosts',
    server: 'audit',
    sizes: SIZES,
    scenes: Object.freeze([
      { id: 'path-question-graph', query: 'scene=path-generic&graph=1' },
      { id: 'path-recap', query: 'scene=recap' },
      { id: 'secure-field', query: 'scene=secure-field&profile=english' },
    ]),
    read: async (page, origins, record, surface) => {
      for (const scene of surface.scenes) {
        await page.goto(`${origins.audit}${HOST_PAGE}?${scene.query}`, { timeout: 180_000 });
        await page.locator('[data-host-sentinel="end"]').waitFor({ timeout: 120_000 });
        await page.locator('button.mathmaster-work-view-opener').first().waitFor({ timeout: 60_000 });
        await settled(page, 900);
        record(scene.id, await readOpenerCoverage(page));
      }
      return surface.scenes.length;
    },
  },
  {
    id: 'lab',
    server: 'app',
    sizes: SIZES,
    // Solution Review has no Work View (WORK_VIEW_INVENTORY: exempt, read-only).
    noOpener: Object.freeze(['solutionReview2']),
    read: async (page, origins, record, surface) => {
      await MATH_TOOLS_LAB_SCREEN.open(page, origins);
      const closeWorkView = async () => {
        const close = page.locator('[role="dialog"][aria-modal="true"] .mathmaster-work-view-header > button', { hasText: /^Close/ });
        if (await close.count()) await close.first().evaluate((button) => button.click());
        await settled(page, 600);
      };
      // The Lab opens on its first tool, the Transformations Lab (and in its Work View where that opens on its own).
      const scenes = [{ id: 'transformationsLab', run: closeWorkView }, ...MATH_TOOLS_LAB_SCREEN.scenes];
      for (const scene of scenes) {
        await scene.run(page, origins, { first: false });
        let readings = await readOpenerCoverage(page);
        // No opener yet: a tool that opens its Work View on its own on a short phone can do so after the scene closed
        // it, and on a loaded machine a tool can draw its opener after the scene's wait for its first controls. Its
        // Work View closed again, and its opener waited for (30s at most), it is read once more.
        if (!readings.length && !surface.noOpener.includes(scene.id)) {
          await closeWorkView();
          await page.waitForFunction((selector) => [...document.querySelectorAll(selector)].some((button) => button.getBoundingClientRect().width > 0), 'button.mathmaster-work-view-opener', { timeout: 30_000 }).catch(() => {});
          await settled(page, 600);
          readings = await readOpenerCoverage(page);
        }
        record(scene.id, readings);
      }
      return scenes.length;
    },
  },
  {
    id: 'cues',
    server: 'audit',
    sizes: SIZES.filter((size) => size.phone),
    // The page's figures that are each their own Work View.
    expects: Object.freeze(['inverse-lab', 'exp-log', 'systems', 'systems-build', 'transformations', 'workspace-inverse', 'static-figure', 'system-equations']),
    read: async (page, origins, record) => {
      await openCues(page, origins.audit, 'light');
      await settled(page, 900);
      // One opener per scene, each named by its scene.
      const readings = await readOpenerCoverage(page);
      const byScene = {};
      readings.forEach((reading) => { (byScene[reading.scene || 'page'] ||= []).push(reading); });
      Object.entries(byScene).forEach(([scene, sceneReadings]) => record(scene, sceneReadings));
      return Object.keys(byScene).length;
    },
  },
].map(Object.freeze));

const newPage = async (browser, size, { school = false } = {}) => {
  const options = {
    viewport: { width: size.width, height: size.height },
    isMobile: size.phone,
    hasTouch: size.phone,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  };
  const context = await (school ? newSchoolContext(browser, options) : browser.newContext(options));
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || /^(data|blob):/.test(url)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error).split('\n')[0]));
  if (size.textScale !== 1) {
    // The browser's text-size setting, before the page loads.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * size.textScale), fixed: Math.round(13 * size.textScale) } });
  }
  return { context, page, errors };
};

// The text-size setting reached the page: the measurement is void without it.
const textScaleApplied = (page, size) => page.evaluate((scale) => parseFloat(getComputedStyle(document.documentElement).fontSize) >= 16 * scale * 0.95, size.textScale);

// ------------------------------------------------------------------------------------------------ cover
const runCover = async (browser, origins, surface, size) => {
  const { context, page, errors } = await newPage(browser, size, { school: surface.server === 'app' });
  const scenes = {};
  const problems = [];
  try {
    const count = await surface.read(page, origins, (scene, readings) => { scenes[scene] = readings; }, surface);
    if (size.textScale !== 1 && !(await textScaleApplied(page, size))) problems.push('the text-size setting did not apply');
    if (!count) problems.push('no scene was read');
    // A scene whose opener was not on the page was not read: it fails rather than passing as clear.
    const unread = [
      ...Object.entries(scenes).filter(([scene, readings]) => !readings.length && !(surface.noOpener || []).includes(scene)).map(([scene]) => scene),
      ...(surface.expects || []).filter((scene) => !scenes[scene]),
    ];
    if (unread.length) problems.push(`no opener to read on ${unread.join(', ')}`);
  } catch (error) {
    problems.push(`could not read the surface: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  const covered = Object.entries(scenes).flatMap(([scene, readings]) => readings.flatMap((reading) => reading.covered.map((hit) => ({ scene, ...hit }))));
  const over = Object.entries(scenes).flatMap(([scene, readings]) => readings.flatMap((reading) => reading.over.map((hit) => ({ scene, ...hit }))));
  return {
    check: 'cover',
    surface: surface.id,
    size: size.id,
    scenes: Object.keys(scenes).length,
    openers: Object.values(scenes).reduce((sum, readings) => sum + readings.length, 0),
    stacked: Object.values(scenes).reduce((sum, readings) => sum + readings.filter((reading) => reading.stacked).length, 0),
    // Each scene's openers, and how many had a row of their own: what the report's counts are made of.
    byScene: Object.fromEntries(Object.entries(scenes).map(([scene, readings]) => [scene, { openers: readings.length, stacked: readings.filter((reading) => reading.stacked).length }])),
    covered,
    over,
    problems: [...problems, ...errors.map((message) => `page error: ${message}`)],
  };
};

// ------------------------------------------------------------------------------------------------ badges (R17)
// Still the default lesson, whose questions are `freeResponse`: the question under the header is QuestionEngine's
// "This question could not be displayed", and the room for its work is the box around that panel. With
// `?questions=real` (a real Classwork Q1, "Write 6/8 in lowest terms.") a 360x740 phone at 100% text leaves it 149px
// with progress shown, under PROGRESS_WORK_MIN: its task panel is 51px taller ("Read a part" takes a row of its own
// under Vocabulary, and 6/8 is set as a stacked fraction). It moves once that has room.
const STUDENT_APP = '/tests/browser/teacherWorkflow/index.html?reset=1&as=student&studentId=910002';
// The header of the assignment screen, and what the question shows of its tries and its completion.
export const HEADER_ITEMS = Object.freeze({
  back: '.mathmaster-unified-nav-back',
  'section tab': '.mathmaster-section-tab',
  'completion medallion': '.mathmaster-section-complete-medallion',
  'section progress': '.mathmaster-section-tab small',
  'status chip': '.mathmaster-assignment-status-chip',
  'time left': '.mathmaster-section-time-left',
  overview: '.mathmaster-overview-button',
  'focus view': '.mathmaster-focus-view-button',
  'section summary': '.mathmaster-current-section-summary > *',
  'question number': '.mathmaster-question-number',
  'task heading': '.question-prompt-heading > *',
  tries: '.mathmaster-question-attempt-strip',
  'grade weight': '[data-grade-weight]',
  'one try': '[data-one-try-notice]',
  'closed verdict': '.mathmaster-closed-verdict',
  opener: 'button.mathmaster-work-view-opener',
});
const BADGE_KINDS = new Set(['completion medallion', 'section progress', 'tries', 'grade weight', 'one try', 'closed verdict', 'opener']);
// The least room a question's work has on a phone with progress shown: a 360x740 phone at 100% text gives it 201px.
export const PROGRESS_WORK_MIN = 160;

const READ_HEADER = (items) => {
  const shown = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  };
  // What can be seen of a box, and whether a box that does not scroll is what cuts it. Something cut by a scroller
  // (a page part scrolled out of view, a tab scrolled out of a strip) is reached by scrolling it; a badge cut by a
  // box that does not scroll is not reached at all.
  const scrolls = (node, axis) => {
    const style = getComputedStyle(node);
    return axis === 'x'
      ? /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1
      : /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
  };
  const seen = (element) => {
    const box = element.getBoundingClientRect();
    const rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    const fixed = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const b = node.getBoundingClientRect();
      if (style.overflowX !== 'visible') {
        rect.left = Math.max(rect.left, b.left); rect.right = Math.min(rect.right, b.right);
        if (!scrolls(node, 'x')) { fixed.left = Math.max(fixed.left, b.left); fixed.right = Math.min(fixed.right, b.right); }
      }
      if (style.overflowY !== 'visible') {
        rect.top = Math.max(rect.top, b.top); rect.bottom = Math.min(rect.bottom, b.bottom);
        if (!scrolls(node, 'y')) { fixed.top = Math.max(fixed.top, b.top); fixed.bottom = Math.min(fixed.bottom, b.bottom); }
      }
    }
    return { box, rect, fixed };
  };
  const found = [];
  Object.entries(items).forEach(([kind, selector]) => document.querySelectorAll(selector).forEach((element) => {
    if (!shown(element)) return;
    const { box, rect, fixed } = seen(element);
    const visible = rect.right - rect.left > 0 && rect.bottom - rect.top > 0;
    const cut = fixed.right - fixed.left < box.width - 1 || fixed.bottom - fixed.top < box.height - 1;
    found.push({ kind, element, text: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32), rect, visible, cut });
  }));
  const overlaps = [];
  found.forEach((a, i) => found.slice(i + 1).forEach((b) => {
    if (!a.visible || !b.visible || a.element.contains(b.element) || b.element.contains(a.element)) return;
    const across = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
    const down = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
    if (across > 1 && down > 1) overlaps.push(`${a.kind} "${a.text}" and ${b.kind} "${b.text}" overlap by ${Math.round(across)}x${Math.round(down)}px`);
  }));
  return {
    items: found.map(({ kind, text, rect, cut }) => ({ kind, text, box: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round), cut })),
    overlaps,
  };
};

const runBadges = async (browser, origins, size) => {
  const { context, page, errors } = await newPage(browser, size, { school: true });
  const problems = [];
  const readings = {};
  const workRoom = {};
  try {
    await page.goto(`${origins.app}${STUDENT_APP}`, { timeout: 180_000 });
    await page.locator('nav[aria-label="Student navigation"]').first().waitFor({ timeout: 180_000 });
    await page.locator('nav[aria-label="Student navigation"] a').filter({ hasText: 'Assignments' }).first().evaluate((link) => link.click());
    await page.getByText('My Assignments').first().waitFor({ timeout: 60_000 });
    await settled(page, 900);
    // The lesson with "Show progress" open: its finished section's "Complete" among the tabs, on its current
    // question ("3 of 3 tries left").
    await openCompletedSection(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settled(page, 600);
    readings['progress shown'] = await page.evaluate(READ_HEADER, HEADER_ITEMS);
    // The question's room for its work with progress shown, the page scrolled as far as it goes (a phone).
    if (size.phone) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await settled(page, 400);
      workRoom['progress shown'] = await page.evaluate(() => document.querySelector('.math-tool-workspace')?.clientHeight ?? null);
      await page.evaluate(() => window.scrollTo(0, 0));
      await settled(page, 300);
    }
    // The finished section's first question: "Question complete" (and, in a Warm-Up's time, its time left).
    await page.locator('.mathmaster-section-tab.is-complete').first().evaluate((tab) => tab.click());
    await page.waitForFunction(() => /Question complete/.test(document.querySelector('.mathmaster-question-attempt-strip')?.textContent || ''), null, { timeout: 60_000 });
    await settled(page, 900);
    readings['progress shown, a finished question'] = await page.evaluate(READ_HEADER, HEADER_ITEMS);
    // The navigator as a phone opens it (Focus view): the question has the screen, and its tries, its completion
    // and its opener are whole.
    await page.locator('.mathmaster-focus-view-button').first().evaluate((button) => button.click());
    await page.locator('.mathmaster-assignment-unified-nav.is-collapsed').waitFor({ timeout: 30_000 });
    await settled(page, 700);
    readings['focus view, a finished question'] = await page.evaluate(READ_HEADER, HEADER_ITEMS);
    if (size.phone) workRoom['focus view'] = await page.evaluate(() => document.querySelector('.math-tool-workspace')?.clientHeight ?? null);
    await page.evaluate(() => document.querySelector('button.mathmaster-work-view-opener')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await settled(page, 500);
    readings['focus view, opener in view'] = await page.evaluate(READ_HEADER, HEADER_ITEMS);
    if (size.textScale !== 1 && !(await textScaleApplied(page, size))) problems.push('the text-size setting did not apply');
  } catch (error) {
    problems.push(`could not read the header: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  for (const [state, reading] of Object.entries(readings)) {
    reading.overlaps.forEach((overlap) => problems.push(`${state}: ${overlap}`));
    // Whole, with progress shown too: on a narrow screen the page scrolls past the navigator to the question
    // (App.css), where the navigator once took a screen that did not scroll and cut the question under it.
    reading.items.filter((item) => item.cut && BADGE_KINDS.has(item.kind)).forEach((item) => problems.push(`${state}: ${item.kind} "${item.text}" is cut off by a box that does not scroll`));
  }
  // And room for its work: 16px of it, or none, on a narrow phone with progress shown before.
  if (workRoom['progress shown'] != null && workRoom['progress shown'] < PROGRESS_WORK_MIN) {
    problems.push(`progress shown: the question has ${workRoom['progress shown']}px for its work (${workRoom['focus view'] ?? '?'}px in Focus view)`);
  }
  const kinds = (state) => [...new Set((readings[state]?.items || []).map((item) => item.kind))];
  // The scenes must show what they are for, or they prove nothing.
  if (readings['progress shown'] && !kinds('progress shown').includes('completion medallion')) problems.push('the finished section\'s "Complete" is not on screen');
  if (readings['progress shown'] && !kinds('progress shown').includes('tries')) problems.push('the question\'s tries are not on screen');
  for (const state of ['progress shown, a finished question', 'focus view, a finished question']) {
    if (readings[state] && !(readings[state].items || []).some((item) => item.kind === 'tries' && /Question complete/.test(item.text))) problems.push(`${state}: "Question complete" is not on screen`);
  }
  if (readings['focus view, opener in view'] && !kinds('focus view, opener in view').includes('opener')) problems.push('the opener is not on screen');
  return { check: 'badges', surface: 'assignment-screen', size: size.id, readings, workRoom, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
};

// ------------------------------------------------------------------------------------------------ room
// A phone question's room for its work at a large text size, in the real App. On the base, Focus view gave a phone's
// question 16 to 242px at 200% text (the folded navigator and the identity bar 174 to 220px of a screen that did not
// scroll), a question of choices 16px on every phone (its one-try line and hint offer 382 to 522px) with its tries
// and Submit below the screen at 320x568, 360x740 and 375x667, and Work View on a staged question at 320x568 was 172px.
const ROOM_APP = '/tests/browser/teacherWorkflow/index.html?reset=1&as=student&studentId=910002&questions=room';
// The five phones at 200% text, the smallest at 150%, and the smallest at 100% as the control: there a phone is one
// screen in Focus view, with no page scroll, as it was.
export const ROOM_SIZES = Object.freeze([
  { id: '320x568', width: 320, height: 568, phone: true, textScale: 1 },
  { id: '320x568@150%', width: 320, height: 568, phone: true, textScale: 1.5 },
  { id: '320x568@200%', width: 320, height: 568, phone: true, textScale: 2 },
  { id: '360x740@200%', width: 360, height: 740, phone: true, textScale: 2 },
  { id: '375x667@200%', width: 375, height: 667, phone: true, textScale: 2 },
  { id: '390x844@200%', width: 390, height: 844, phone: true, textScale: 2 },
  { id: '412x915@200%', width: 412, height: 915, phone: true, textScale: 2 },
].map(Object.freeze));
// A phone on its side at 200% text, read for its bars alone (ACTION_BARS, below): there the question is two columns,
// its action bar in the left one, a column that scrolls, and the identity bar and the navigator take most of the
// screen's 360 to 375px; its room for its work is not this check's.
export const ROOM_SIDE_SIZES = Object.freeze([
  { id: '667x375@200%', width: 667, height: 375, phone: true, textScale: 2, side: true },
  { id: '740x360@200%', width: 740, height: 360, phone: true, textScale: 2, side: true },
].map(Object.freeze));
// The lesson's Classwork (textRoomLesson.js), each question with what shows it is that kind of question.
export const ROOM_SCENES = Object.freeze([
  { kind: 'typed', question: 'Classwork Q1', shows: 'math-field' },
  { kind: 'choice', question: 'Classwork Q2', shows: '[role="radio"]' },
  { kind: 'graph', question: 'Classwork Q3', shows: 'svg.mathmaster-responsive-canvas, svg[data-mm-plane]', workView: true },
  { kind: 'staged', question: 'Classwork Q4', shows: '.workflow-focus', workView: true },
].map(Object.freeze));
// The least of the screen a question keeps for its work at a large text size: a fifth (114px at 320x568, 169px at
// 390x844). After the fix the least is 140px, a choice at 320x568 with 200% text.
export const WORK_ROOM_SHARE = 0.2;
// What a student must be able to reach on the question: its tries, Work View's opener, Submit and the navigator's Next.
export const ROOM_REACH = Object.freeze({
  tries: '.mathmaster-question-stage .mathmaster-question-attempt-strip',
  opener: '.mathmaster-question-stage .mathmaster-work-view-host[data-open="false"] button.mathmaster-work-view-opener',
  submit: 'name:Submit',
  next: '.mathmaster-assignment-unified-nav button[aria-label="Next question"]',
});

// The question's work: its box, and how much of it is on the screen with the page scrolled as far as it goes, below
// the identity bar (which stays) and above the screen's foot.
const READ_WORK_ROOM = () => {
  const work = document.querySelector('.mathmaster-question-stage .math-tool-workspace');
  if (!work) return null;
  const box = work.getBoundingClientRect();
  const top = Math.max(box.top, document.querySelector('.mm-identity-bar')?.getBoundingClientRect().bottom || 0);
  return {
    box: Math.round(box.height),
    seen: Math.max(0, Math.round(Math.min(box.bottom, window.innerHeight) - top)),
    pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
  };
};

// A target brought into view as a finger brings it: by scrolling a box that scrolls (overflow auto or scroll, up and
// down or sideways) and the page, never a box that clips (overflow hidden: scrollIntoView and focus move one, a finger
// does not). In the middle of the screen, else at its foot (a bar at the top can cover the middle). Then it must be
// whole on the screen, cut by no box on any side, and the thing a tap at its centre reaches.
const READ_REACH = (selector) => {
  const candidates = selector.startsWith('name:')
    ? [...document.querySelectorAll('.mathmaster-question-stage button')].filter((button) => (button.getAttribute('aria-label') || button.textContent).trim().startsWith(selector.slice(5)))
    : [...document.querySelectorAll(selector)];
  const element = candidates.find((candidate) => {
    const box = candidate.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(candidate).visibility !== 'hidden';
  });
  if (!element) return { found: false };
  const fingerScrolls = (node, axis) => (axis === 'y'
    ? /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1
    : /(auto|scroll)/.test(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1);
  for (let node = element.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const box = element.getBoundingClientRect();
    const scroller = node.getBoundingClientRect();
    if (fingerScrolls(node, 'y')) node.scrollTop += (box.top + box.height / 2) - (scroller.top + scroller.height / 2);
    if (fingerScrolls(node, 'x')) node.scrollLeft += (box.left + box.width / 2) - (scroller.left + scroller.width / 2);
  }
  const judge = () => {
    const box = element.getBoundingClientRect();
    const seen = { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    let cutBy = null;
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clip = node.getBoundingClientRect();
      const before = { ...seen };
      if (style.overflowY !== 'visible') { seen.top = Math.max(seen.top, clip.top); seen.bottom = Math.min(seen.bottom, clip.bottom); }
      if (style.overflowX !== 'visible') { seen.left = Math.max(seen.left, clip.left); seen.right = Math.min(seen.right, clip.right); }
      if (Object.keys(seen).some((side) => Math.abs(seen[side] - before[side]) > 0.5)) cutBy ||= `${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]}`;
    }
    const onScreen = box.top >= -1 && box.bottom <= window.innerHeight + 1 && box.left >= -1 && box.right <= document.documentElement.clientWidth + 1;
    const cut = seen.bottom - seen.top < box.height - 1 || seen.right - seen.left < box.width - 1;
    const hit = document.elementFromPoint(
      Math.min(document.documentElement.clientWidth - 1, Math.max(0, (Math.max(seen.left, 0) + Math.min(seen.right, document.documentElement.clientWidth)) / 2)),
      Math.min(window.innerHeight - 1, Math.max(0, (Math.max(seen.top, 0) + Math.min(seen.bottom, window.innerHeight)) / 2)),
    );
    const onTop = Boolean(hit && (hit === element || element.contains(hit) || hit.contains(element)));
    return { found: true, reached: onScreen && !cut && onTop, onScreen, cutBy: cut ? cutBy : null, under: onTop || !hit ? null : `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}` };
  };
  const middle = element.getBoundingClientRect();
  window.scrollBy(0, (middle.top + middle.height / 2) - window.innerHeight / 2);
  const inMiddle = judge();
  if (inMiddle.reached) return inMiddle;
  window.scrollBy(0, element.getBoundingClientRect().bottom - (window.innerHeight - 4));
  const atFoot = judge();
  return atFoot.reached ? atFoot : inMiddle;
};

// Work View's own height, and a plane in it with the row of its own controls under it (its zoom row).
const READ_ROOM_VIEW = () => {
  const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  const surface = host?.querySelector('.mathmaster-work-view-surface');
  if (!surface) return null;
  const planes = [...surface.querySelectorAll('svg[data-mm-plane], svg.mathmaster-responsive-canvas')]
    .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 80 && box.height > 80)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  let zoomRow = null;
  if (planes[0]) {
    const { svg, box } = planes[0];
    let own = svg.parentElement;
    while (own && own !== surface && own.getBoundingClientRect().height <= box.height + 1) own = own.parentElement;
    const bottom = [...(own || surface).querySelectorAll('button')].map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0 && rect.top >= box.bottom - 1 && rect.top <= box.bottom + 32)
      .reduce((lowest, rect) => Math.max(lowest, rect.bottom), box.bottom);
    zoomRow = Math.round(bottom - box.bottom);
  }
  return { view: surface.clientHeight, zoomRow, short: host.getAttribute('data-height') === 'short' };
};

// THE ACTION BAR FITS THE SCREEN (WCAG 1.4.10, 1.4.4, 2.5.8). At 200% text on a 320 to 375px phone the question's
// action bar was wider than the screen: beside six tools at their narrowest, Submit ran 25px past the right edge at
// 320x568 and the bar scrolled sideways to show it, and the words Undo and Start over keep under their icons ran 10
// and 31px past their own buttons, into the tools beside them (6px at 100% text on a 320px phone). In Work View, its
// "Submit — uses 1 of 3 tries" ran 72px past its button. Every bar the question shows (its own, or Work View's
// controls while the view is open), read with nothing scrolled sideways: the bar within the screen and as wide as
// what it holds, and each control within the screen, its words inside its own box and a target of 24x24 or more
// (2.5.8). A bar may wrap onto rows of its own: the question's room for its work is read beside it.
export const ACTION_BARS = '.mathmaster-question-stage .portrait-action-bar, .mathmaster-question-stage .landscape-action-bar, .mathmaster-question-stage .mathmaster-desktop-action-bar, .mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-actions';
export const TARGET_MIN = 24;
const READ_BARS = (selector) => {
  const screen = document.documentElement.clientWidth;
  const shown = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  };
  // A word hidden to the eye on purpose (a tool's name kept for a screen reader, clipped to 1px) is not drawn.
  const drawn = (text, control) => {
    for (let node = text.parentElement; node && node !== control.parentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || (style.clip && style.clip !== 'auto') || (style.position === 'absolute' && box.width <= 1 && box.height <= 1)) return false;
    }
    return true;
  };
  const round = (value) => Math.round(value * 10) / 10;
  return [...document.querySelectorAll(selector)].filter(shown).map((bar) => {
    bar.scrollLeft = 0;
    const box = bar.getBoundingClientRect();
    const controls = [...bar.querySelectorAll('button, [role="button"], a[href], input, select')].filter(shown).map((control) => {
      const rect = control.getBoundingClientRect();
      // How far its words (and the icons drawn as text) reach past its own box, on any side.
      let wordsPast = 0;
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent.trim() || !drawn(text, control)) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const ink of range.getClientRects()) {
          if (!ink.width) continue;
          wordsPast = Math.max(wordsPast, ink.right - rect.right, rect.left - ink.left, ink.bottom - rect.bottom, rect.top - ink.top);
        }
      }
      return {
        name: (control.getAttribute('aria-label') || control.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        left: round(rect.left), right: round(rect.right), top: round(rect.top), width: round(rect.width), height: round(rect.height), wordsPast: round(wordsPast),
      };
    });
    return {
      name: bar.matches('.mathmaster-work-view-actions') ? 'Work View\'s action area' : 'action bar',
      screen, left: round(box.left), right: round(box.right), width: bar.clientWidth, content: bar.scrollWidth,
      rows: new Set(controls.map((control) => Math.round(control.top))).size, height: round(box.height), controls,
    };
  });
};
// ...AND IT SETTLES. A layout that measures itself can switch back and forth (a staged step did, 58 times in 2s); the
// bar is laid out by its stylesheet alone, and this holds it so: once the question has settled, every bar and each of
// its controls keep one size and one place in it, read every frame for BAR_WATCH_MS.
export const BAR_WATCH_MS = 1500;
const WATCH_BARS = ({ selector, ms }) => new Promise((resolve) => {
  const shape = () => [...document.querySelectorAll(selector)].map((bar) => {
    const box = bar.getBoundingClientRect();
    return [bar.clientWidth, bar.scrollWidth, Math.round(box.height), ...[...bar.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return `${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left - box.left)},${Math.round(rect.top - box.top)}`;
    })].join(' ');
  }).join(' | ');
  const started = performance.now();
  let last = shape();
  let frames = 0;
  let changes = 0;
  const tick = () => {
    const now = shape();
    frames += 1;
    if (now !== last) { changes += 1; last = now; }
    if (performance.now() - started < ms) requestAnimationFrame(tick);
    else resolve({ frames, changes });
  };
  requestAnimationFrame(tick);
});
// What a bar reading fails on, said where it was read.
export const barProblems = (bars, where) => bars.flatMap((bar) => [
  ...(bar.right > bar.screen + 1 || bar.left < -1 ? [`${where}: the ${bar.name} runs ${Math.round(Math.max(bar.right - bar.screen, -bar.left))}px past the screen`] : []),
  ...(bar.content > bar.width + 1 ? [`${where}: the ${bar.name} holds ${bar.content}px in ${bar.width}px and scrolls sideways`] : []),
  ...bar.controls.flatMap((control) => [
    ...(control.right > bar.screen + 1 || control.left < -1 ? [`${where}: "${control.name}" in the ${bar.name} runs past the screen (${Math.round(control.left)} to ${Math.round(control.right)} of ${bar.screen}px)`] : []),
    ...(control.wordsPast > 1 ? [`${where}: the words of "${control.name}" in the ${bar.name} run ${Math.round(control.wordsPast)}px past its own box`] : []),
    ...(control.width < TARGET_MIN || control.height < TARGET_MIN ? [`${where}: "${control.name}" in the ${bar.name} is ${Math.round(control.width)}x${Math.round(control.height)}, under ${TARGET_MIN}x${TARGET_MIN}`] : []),
  ]),
]);

const runRoom = async (browser, origins, size) => {
  const { context, page, errors } = await newPage(browser, size, { school: true });
  const problems = [];
  const scenes = {};
  const large = size.textScale > 1;
  const least = Math.round(size.height * WORK_ROOM_SHARE);
  try {
    await page.goto(`${origins.app}${ROOM_APP}`, { timeout: 180_000 });
    await page.locator('nav[aria-label="Student navigation"]').first().waitFor({ timeout: 180_000 });
    await settled(page, 600);
    await page.getByRole('button', { name: /^(Continue|Start Warm-Up)/ }).first().evaluate((button) => button.click());
    const choose = page.locator('select[aria-label="Choose a question"]').first();
    await choose.waitFor({ state: 'attached', timeout: 60_000 });
    if (size.textScale !== 1 && !(await textScaleApplied(page, size))) problems.push('the text-size setting did not apply');
    let zoomRow = null;
    for (const scene of ROOM_SCENES) {
      const value = await choose.evaluate((select, label) => [...select.options].find((option) => option.textContent.trim().startsWith(label))?.value ?? null, scene.question);
      if (value == null) { problems.push(`${scene.kind}: no ${scene.question} in the navigator`); continue; }
      await choose.evaluate((select, next) => { select.value = next; select.dispatchEvent(new Event('change', { bubbles: true })); }, value);
      await page.waitForFunction((shows) => Boolean(document.querySelector('.mathmaster-question-stage .math-tool-workspace')?.querySelector(shows)), scene.shows, { timeout: 60_000 })
        .catch(() => problems.push(`${scene.kind}: ${scene.question} does not show its ${scene.kind} work (${scene.shows})`));
      await settled(page, 900);
      const reading = {};
      for (const state of ['focus view', 'progress shown']) {
        const folded = state === 'focus view';
        if (await page.locator('.mathmaster-assignment-unified-nav.is-collapsed').count() !== (folded ? 1 : 0)) {
          await page.locator('.mathmaster-focus-view-button').first().evaluate((button) => button.click());
          await page.locator(`.mathmaster-assignment-unified-nav${folded ? '.is-collapsed' : ':not(.is-collapsed)'}`).waitFor({ timeout: 30_000 });
        }
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await settled(page, 500);
        const room = await page.evaluate(READ_WORK_ROOM);
        // Before the reach below, which scrolls a box that scrolls sideways (the bar did) to bring Submit in.
        const bars = await page.evaluate(READ_BARS, ACTION_BARS);
        const reach = {};
        for (const [name, selector] of Object.entries(size.side ? {} : ROOM_REACH)) {
          reach[name] = await page.evaluate(READ_REACH, selector);
          await page.waitForTimeout(100);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        reading[state] = { room, reach, bars };
        const where = `${scene.kind}, ${state}`;
        if (!room) problems.push(`${where}: no work to measure`);
        // The bar fits the screen at every text size, 100% included, and settles there.
        if (!bars.length) problems.push(`${where}: no action bar to read`);
        problems.push(...barProblems(bars, where));
        if (folded) {
          const watch = await page.evaluate(WATCH_BARS, { selector: ACTION_BARS, ms: BAR_WATCH_MS });
          reading[state].barWatch = watch;
          if (watch.changes || watch.frames < 10) problems.push(`${where}: the action bar changed its layout ${watch.changes} times in ${BAR_WATCH_MS}ms (${watch.frames} frames read)`);
        }
        if (size.side) continue;
        // At 100% text the phone is the baseline, one screen in Focus view, and nothing more is asked of it here: a
        // choice at 320x568 has 40px for its work there, its opener cut, as before this check.
        if (!large) {
          if (folded && room?.pageScrolls) problems.push(`${where}: at 100% text the page scrolls; a phone is one screen per question`);
          continue;
        }
        if (room && room.seen < least) problems.push(`${where}: the question has ${room.seen}px of the screen for its work, under a fifth of it (${least}px)`);
        Object.entries(reach).forEach(([name, target]) => {
          if (!target.found) problems.push(`${where}: no ${name} to reach`);
          else if (!target.reached) problems.push(`${where}: its ${name} cannot be reached (${!target.onScreen ? 'off the screen' : target.cutBy ? `cut by ${target.cutBy}` : `under ${target.under}`})`);
        });
      }
      // Focus view again, and Work View on the graph and the staged question.
      await page.locator('.mathmaster-focus-view-button').first().evaluate((button) => button.click());
      await page.locator('.mathmaster-assignment-unified-nav.is-collapsed').waitFor({ timeout: 30_000 });
      if (scene.workView) {
        await page.locator(ROOM_REACH.opener).first().evaluate((button) => button.click());
        await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ timeout: 30_000 });
        await settled(page, 1200);
        reading['work view'] = await page.evaluate(READ_ROOM_VIEW);
        // The question's bar is put away while Work View is open, and Work View's controls carry its actions.
        const viewBars = await page.evaluate(READ_BARS, ACTION_BARS);
        if (reading['work view']) reading['work view'].bars = viewBars;
        problems.push(...barProblems(viewBars, `${scene.kind}, work view`));
        const viewWatch = await page.evaluate(WATCH_BARS, { selector: ACTION_BARS, ms: BAR_WATCH_MS });
        if (viewWatch.changes || viewWatch.frames < 10) problems.push(`${scene.kind}, work view: Work View's action area changed its layout ${viewWatch.changes} times in ${BAR_WATCH_MS}ms (${viewWatch.frames} frames read)`);
        if (reading['work view']?.zoomRow != null) zoomRow = reading['work view'].zoomRow;
        await page.evaluate(() => [...document.querySelectorAll('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header button')].find((button) => button.textContent.trim().startsWith('Close'))?.click());
        await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
        await settled(page, 300);
      }
      scenes[scene.kind] = reading;
    }
    // A plane at its floor and its zoom row together (the graph's plane shows the row), in each Work View.
    if (zoomRow == null && !size.side) problems.push('Work View on the graph shows no plane with its zoom row');
    for (const scene of ROOM_SCENES.filter((entry) => entry.workView)) {
      const view = scenes[scene.kind]?.['work view'];
      if (!view) problems.push(`${scene.kind}: Work View did not open`);
      else if (zoomRow != null && !size.side && view.view < PLANE_MIN + zoomRow) problems.push(`${scene.kind}: Work View is ${view.view}px tall, too short for a plane at its ${PLANE_MIN}px floor and its ${zoomRow}px zoom row together`);
    }
  } catch (error) {
    problems.push(`could not read the room: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return { check: 'room', surface: 'assignment-screen', size: size.id, scenes, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
};

// ------------------------------------------------------------------------------------------------ scroll (R10)
// Every plane tool (registry and legacy, and the Path's inequality systems), the table tools and the Step Algebra
// boards, as the assignment harness mounts them.
export const SCROLL_SCENES = Object.freeze([
  'ux-graph2', 'tool-graphing2', 'tool-transformationsLab', 'tool-systemsWorkspace', 'tool-sequenceExplorer',
  'tool-functionInvestigation2', 'tool-constraintFunctionBuilder', 'tool-inverseCompositionLab', 'tool-exponentialLogBridge',
  'tool-parabolaGeometryLab', 'tool-polynomialWorkshop', 'tool-complexPlaneLab', 'tool-dataModelingLab', 'tool-intervalNumberLine',
  'legacy-graphing', 'legacy-functionGraph', 'legacy-graphAnalysis', 'legacy-functionCharacteristics', 'path-systemsWorkspaceInequalities',
  'path-graphing2',
  'tool-linearTableWorkbench', 'tool-regressionCalculator', 'legacy-table',
  'tool-stepAlgebra2', 'legacy-stepAlgebra', 'ux-step',
]);

/*
 * LEFT FOR THE OWNER, AND SAID SO ON EVERY RUN: nothing now.
 *
 * A staged question's plane did not fit its step (the plane capped at the view less 280px, an estimate: 488px in a
 * 430px step at 1366x768, 765px in 742px at 1920x1080, and on a 320x568 phone no step at all). The step is measured
 * now (src/platform/workflow/stepRoom.js) and the three entries are gone, so the run fails on each again. An entry
 * here is reported instead of failed, and fails the run once it no longer happens.
 */
export const KNOWN_SCROLL = Object.freeze({});

const MEASURE_SCROLL = () => {
  const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  if (!host) return { open: false };
  const surface = host.querySelector('.mathmaster-work-view-surface');
  const scrolls = (element, axis) => {
    const style = getComputedStyle(element);
    return axis === 'y'
      ? /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1
      : /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
  };
  const name = (element) => (element.matches('math-div, math-span') ? `the formula "${element.textContent.trim().slice(0, 30)}"` : element.getAttribute('aria-label'))
    || `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''}`;
  const nested = [];
  const sideways = [];
  for (const element of surface ? surface.querySelectorAll('*') : []) {
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) continue;
    if (scrolls(element, 'x')) sideways.push(name(element));
    if (!scrolls(element, 'y')) continue;
    // A scroller inside a scroller: an ancestor inside the view that scrolls up and down too.
    for (let node = element.parentElement; node && node !== host; node = node.parentElement) {
      if (scrolls(node, 'y')) { nested.push(`${name(element)} (${element.clientHeight} of ${element.scrollHeight}px) inside ${name(node)}`); break; }
    }
  }
  // The plane: the largest drawing in the view. It fits when its scroller shows all of its height at once.
  const planes = [...(surface?.querySelectorAll('svg[data-mm-plane], svg.mathmaster-responsive-canvas') || [])]
    .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 80 && box.height > 80)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  let plane = null;
  if (planes[0]) {
    let scroller = planes[0].svg.parentElement;
    while (scroller && scroller !== host && !scrolls(scroller, 'y')) scroller = scroller.parentElement;
    const room = scroller && scroller !== host ? scroller.clientHeight : surface.clientHeight;
    plane = { height: Math.round(planes[0].box.height), room: Math.round(room), fits: planes[0].box.height <= room + 1 };
  }
  return { open: true, nested, sideways, plane, surface: surface ? [surface.clientHeight, surface.scrollHeight] : null };
};

const runScroll = async (browser, origins, size) => {
  const { context, page, errors } = await newPage(browser, size);
  const problems = [];
  const known = [];
  const scenes = {};
  try {
    await openAssignment(page, origins.audit);
    for (const id of SCROLL_SCENES) {
      await goToQuestion(page, id);
      await page.locator(`[data-question-id="${id}"] .mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button.mathmaster-work-view-opener`).first()
        .evaluate((button) => button.click());
      await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ timeout: 30_000 });
      await settled(page, 1200);
      const measured = await page.evaluate(MEASURE_SCROLL);
      scenes[id] = measured;
      measured.nested.forEach((entry) => problems.push(`${id}: ${entry}`));
      if (measured.plane && !measured.plane.fits) {
        const finding = `${id}: the plane is ${measured.plane.height}px tall and the view shows ${measured.plane.room}px of it`;
        if ((KNOWN_SCROLL[id] || []).includes(size.id)) known.push(finding);
        else problems.push(finding);
      } else if ((KNOWN_SCROLL[id] || []).includes(size.id)) problems.push(`${id}: the plane fits now; take ${size.id} out of KNOWN_SCROLL`);
      await page.evaluate(() => [...document.querySelectorAll('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header button')].find((button) => button.textContent.trim().startsWith('Close'))?.click());
      await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
      await settled(page, 300);
    }
  } catch (error) {
    problems.push(`could not open Work View: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return { check: 'scroll', surface: 'assignment', size: size.id, scenes, known, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
};

// ------------------------------------------------------------------------------------------------ staged steps
// The staged questions the harness mounts (the authoring catalog's examples), every step of each, opened on that step
// through its draft (window.__ux.atStep): a step shows whether or not the steps before it are answered.
export const STAGED_SCENES = Object.freeze(['legacy-functionCharacteristics', 'legacy-relationshipModel']);
// The phones at 100% and 200% text, a Chromebook at both, and a desktop.
export const STAGED_SIZES = Object.freeze([
  ...SIZES,
  Object.freeze({ id: '1366x768@200%', width: 1366, height: 768, phone: false, textScale: 2 }),
  Object.freeze({ id: '1920x1080', width: 1920, height: 1080, phone: false, textScale: 1 }),
]);

const MEASURE_STEP = () => {
  const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  const root = host?.querySelector('.workflow-focus');
  if (!root) return { open: Boolean(host), staged: false };
  const surface = host.querySelector('.mathmaster-work-view-surface');
  const body = root.querySelector('.workflow-focus__workspace-body');
  const stage = root.querySelector('.workflow-focus__active-stage');
  const scrolls = (element) => /(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1;
  const name = (element) => element.getAttribute('aria-label')
    || `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''}`;
  const nested = [];
  for (const element of surface.querySelectorAll('*')) {
    if (!scrolls(element)) continue;
    for (let node = element.parentElement; node && node !== host; node = node.parentElement) {
      if (scrolls(node)) { nested.push(`${name(element)} (${element.clientHeight} of ${element.scrollHeight}px) inside ${name(node)}`); break; }
    }
  }
  const flow = root.getAttribute('data-step-room') === 'flow';
  const heading = (root.querySelector('.workflow-focus__workspace-heading h4') || root.querySelector('h4'))?.textContent.trim() || '';
  const step = { heading, flow, body: [body.clientHeight, body.scrollHeight], nested, plane: null };
  // The results under the question's work (the hint offer; after a Submit the outcome, Continue): after the step, never
  // drawn over it. In a flowing view they were laid out at the view's height, inside the step, and painted under it.
  const results = host.querySelector('.mathmaster-attempt-results');
  const resultsBox = results?.getBoundingClientRect();
  if (resultsBox && resultsBox.height > 0) {
    const stepBox = root.getBoundingClientRect();
    step.results = [Math.round(resultsBox.top), Math.round(resultsBox.bottom)];
    step.stepBox = [Math.round(stepBox.top), Math.round(stepBox.bottom)];
    step.resultsOverStep = resultsBox.top < stepBox.bottom - 1 && resultsBox.bottom > stepBox.top + 1;
  }
  // The step scrolls inside itself (bounded), or is taller than the view (flow).
  step.scrollsBy = flow ? Math.max(0, stage.offsetHeight - surface.clientHeight) : Math.max(0, body.scrollHeight - body.clientHeight);
  const planes = [...stage.querySelectorAll('.mathmaster-function-workspace-graph svg, svg.mathmaster-responsive-canvas')]
    .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 80 && box.height > 80)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  if (planes[0]) {
    const { svg, box } = planes[0];
    let scroller = svg.parentElement;
    while (scroller && scroller !== host && !scrolls(scroller)) scroller = scroller.parentElement;
    const room = scroller && scroller !== host ? scroller.clientHeight : surface.clientHeight;
    // Its own controls: the first row of buttons right under it, in the first box above it that is taller.
    let own = svg.parentElement;
    while (own && own !== stage && own.getBoundingClientRect().height <= box.height + 1) own = own.parentElement;
    const controls = [...(own || stage).querySelectorAll('button')].map((button) => button.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.top >= box.bottom - 1 && r.top <= box.bottom + 32)
      .reduce((bottom, r) => Math.max(bottom, r.bottom), box.bottom);
    step.plane = {
      width: Math.round(box.width),
      height: Math.round(box.height),
      room: Math.round(room),
      withControls: Math.round(controls - box.top),
    };
  }
  return { open: true, staged: true, ...step };
};

/*
 * THE STEP'S HEADING ROW, WHOLE: its name, its kind ("Decide"), its review status and its counter ("3 of 17"), read
 * on the page before Work View opens and again in Work View. In a question every box may shrink to nothing
 * (MathToolMobileLayout.css), and in this row the counter did: at 200% text on a 390px phone 45px of "3 of 17" ran
 * past the right edge on every step, "3 of" left on screen, and at 320x568 its last 11 to 13px. Each item fails when
 * its words run past its own box, out of the row, or are cut off by a box that does not scroll. Read sideways: that
 * is where a row is cut, and what a scroller cuts up or down is reached by scrolling it. A box clips only what it
 * contains (an open Work View is a fixed layer the question's boxes do not clip), and the page clips at its sides. A
 * name the short Work View ellipsizes on purpose (WorkViewShell.css) is its box, not its words.
 */
export const STEP_HEADING_ITEMS = Object.freeze({
  'step name': 'h4',
  'step kind': '.workflow-focus__family',
  'review status': '.workflow-focus__review-status',
  counter: '.workflow-focus__counter',
});

export const READ_STEP_HEADING = ([scope, items]) => {
  const row = document.querySelector(scope)?.querySelector('.workflow-focus__workspace-heading');
  if (!row) return null;
  const name = (element) => (element === document.documentElement ? 'the page'
    : `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''}`);
  const fixedBlock = (style) => style.transform !== 'none' || style.perspective !== 'none' || style.filter !== 'none'
    || /paint|layout|strict|content/.test(style.contain || '') || /transform|perspective|filter/.test(style.willChange || '');
  // The element's containing blocks, up to the page: the only boxes whose overflow can clip it.
  const blocks = (element) => {
    const list = [];
    for (let node = element; node && node !== document.documentElement;) {
      const { position } = getComputedStyle(node);
      let next = node.parentElement;
      const skip = position === 'fixed' ? (style) => !fixedBlock(style) : position === 'absolute' ? (style) => style.position === 'static' && !fixedBlock(style) : null;
      if (skip) while (next && next !== document.documentElement && skip(getComputedStyle(next))) next = next.parentElement;
      if (!next) break;
      list.push(next);
      node = next;
    }
    return list;
  };
  const scrollsSideways = (node) => /(auto|scroll)/.test(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth + 1;
  const rowBox = row.getBoundingClientRect();
  const found = [];
  Object.entries(items).forEach(([kind, selector]) => row.querySelectorAll(selector).forEach((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0) || style.visibility === 'hidden') return;
    const ellipsis = style.textOverflow === 'ellipsis' && style.overflowX !== 'visible';
    // Its words, where they run out of its box (nowrap words in a box that shrank, a word wider than its line).
    const range = document.createRange();
    range.selectNodeContents(element);
    const words = range.getBoundingClientRect();
    const left = ellipsis || !words.width ? box.left : Math.min(box.left, words.left);
    const right = ellipsis || !words.width ? box.right : Math.max(box.right, words.right);
    let seenLeft = left;
    let seenRight = right;
    let cutBy = null;
    for (const node of blocks(element)) {
      if (getComputedStyle(node).overflowX === 'visible' || scrollsSideways(node)) continue;
      const edge = node === document.documentElement ? { left: 0, right: document.documentElement.clientWidth } : node.getBoundingClientRect();
      if (edge.left > seenLeft + 0.5 || edge.right < seenRight - 0.5) cutBy ||= name(node);
      seenLeft = Math.max(seenLeft, edge.left);
      seenRight = Math.min(seenRight, edge.right);
    }
    found.push({
      kind,
      text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
      overflow: ellipsis ? 0 : Math.max(0, element.scrollWidth - element.clientWidth),
      outOfRow: Math.round(Math.max(0, right - rowBox.right, rowBox.left - left)),
      cut: Math.round(Math.max(0, (right - left) - Math.max(0, seenRight - seenLeft))),
      cutBy,
      box: [box.left, box.top, box.right, box.bottom].map(Math.round),
    });
  }));
  const heading = found.find((item) => item.kind === 'step name');
  const counter = found.find((item) => item.kind === 'counter');
  return {
    row: [rowBox.left, rowBox.top, rowBox.right, rowBox.bottom].map(Math.round),
    items: found,
    // Beside the heading's first line, or on a line under it (no room beside it).
    counterBelow: Boolean(heading && counter) && counter.box[1] >= heading.box[1] + Math.min(heading.box[3] - heading.box[1], 40),
  };
};

export const stepHeadingProblems = (reading) => {
  if (!reading) return ['no step heading to read'];
  return reading.items.flatMap((item) => {
    const parts = [];
    if (item.overflow > 1) parts.push(`runs ${item.overflow}px past its own box`);
    if (item.outOfRow > 1) parts.push(`is ${item.outOfRow}px out of the heading's row`);
    if (item.cut > 1) parts.push(`has ${item.cut}px cut off by ${item.cutBy}`);
    return parts.length ? [`the ${item.kind} "${item.text}" ${parts.join(', ')}`] : [];
  });
};

const runStaged = async (browser, origins, size) => {
  const { context, page, errors } = await newPage(browser, size);
  const problems = [];
  const steps = {};
  const scrolling = [];
  try {
    const ids = await openAssignment(page, origins.audit);
    if (size.textScale !== 1 && !(await textScaleApplied(page, size))) problems.push('the text-size setting did not apply');
    const elsewhere = ids.find((id) => !STAGED_SCENES.includes(id));
    for (const id of STAGED_SCENES) {
      await goToQuestion(page, id);
      const count = await page.evaluate((qid) => document.querySelectorAll(`[data-question-id="${qid}"] .workflow-focus__active-stage > *`).length, id);
      if (!count) { problems.push(`${id}: no staged steps to read`); continue; }
      for (let index = 0; index < count; index += 1) {
        // Mounted again on this step.
        await goToQuestion(page, elsewhere);
        await page.evaluate(([qid, at]) => window.__ux.atStep(qid, at), [id, index]);
        await goToQuestion(page, id);
        // Its heading on the page, as the question shows it before Work View opens.
        const headingOnPage = await page.evaluate(READ_STEP_HEADING, [`[data-question-id="${id}"] .mathmaster-work-view-host[data-open="false"]`, STEP_HEADING_ITEMS]);
        await page.locator(`[data-question-id="${id}"] .mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button.mathmaster-work-view-opener`).first()
          .evaluate((button) => button.click());
        await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ timeout: 30_000 });
        await settled(page, 1200);
        const m = await page.evaluate(MEASURE_STEP);
        const where = `${id} step ${index + 1}${m.heading ? ` (${m.heading.replace(/^Step \d+\.\s*/, '')})` : ''}`;
        m.headingRow = { page: headingOnPage, view: await page.evaluate(READ_STEP_HEADING, ['.mathmaster-work-view-host[data-open="true"]', STEP_HEADING_ITEMS]) };
        steps[`${id}#${index + 1}`] = m;
        stepHeadingProblems(m.headingRow.page).forEach((problem) => problems.push(`${where}, on the page: ${problem}`));
        stepHeadingProblems(m.headingRow.view).forEach((problem) => problems.push(`${where}, in Work View: ${problem}`));
        if (!m.staged) problems.push(`${where}: Work View did not open on the staged step`);
        else {
          if (!m.flow && m.body[0] < STEP_MIN_ROOM) problems.push(`${where}: the step has ${m.body[0]}px of the view, and the view does not scroll as one`);
          if (m.resultsOverStep) problems.push(`${where}: the question's results (${m.results.join(' to ')}px) are drawn over the step (${m.stepBox.join(' to ')}px)${m.flow ? ', the view scrolling as one' : ''}`);
          m.nested.forEach((entry) => problems.push(`${where}: ${entry}`));
          if (m.plane && m.plane.height > m.plane.room + 1) problems.push(`${where}: the plane is ${m.plane.height}px tall and its step shows ${m.plane.room}px`);
          else if (m.plane && m.plane.withControls > m.plane.room + 1) {
            // Its controls with it wherever the room holds them and a plane at its floor (stepRoom.js PLANE_MIN). A view
            // shorter than that kept the plane whole and was reported, not failed: at 320x568 with 200% text Work View
            // was 172px, its task four lines in the header. It is two there now (WorkViewShell.css), the view 240px,
            // and a view too short for both fails.
            const controls = m.plane.withControls - m.plane.height;
            if (m.plane.room >= PLANE_MIN + controls) problems.push(`${where}: the plane and its controls under it are ${m.plane.withControls}px, and its step shows ${m.plane.room}px`);
            else problems.push(`${where}: the view is ${m.plane.room}px, too short for a plane at its ${PLANE_MIN}px floor and its ${controls}px of controls together`);
          }
          if (m.scrollsBy > 1) scrolling.push(`${where} by ${m.scrollsBy}px`);
        }
        await page.evaluate(() => [...document.querySelectorAll('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header button')].find((button) => button.textContent.trim().startsWith('Close'))?.click());
        await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
        await settled(page, 200);
      }
    }
  } catch (error) {
    problems.push(`could not read the staged steps: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return { check: 'staged', surface: 'assignment', size: size.id, steps, scrolling, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
};

// ------------------------------------------------------------------------------------------------ settle
// The step's room is measured from the page, and the cap it sets changes the page: a reading that turns on what the
// cap changes undoes itself (the review of 2026-11-18 found two: a flowing step whose tool workspace kept the view's
// height, and the plotting step's "is a column beside the plane lower?"). One snapshot per step does not see that;
// this watches each step after it has settled, and with the number keypad up for a row of the staged table.
export const SETTLE_SIZES = Object.freeze([
  Object.freeze({ id: '360x640', width: 360, height: 640, phone: true, textScale: 1 }),
  Object.freeze({ id: '412x915', width: 412, height: 915, phone: true, textScale: 1 }),
  Object.freeze({ id: '1920x970', width: 1920, height: 970, phone: false, textScale: 1 }),
  Object.freeze({ id: '1920x1080', width: 1920, height: 1080, phone: false, textScale: 1 }),
]);
export const SETTLE_SCENES = Object.freeze(['ux-staged-table', ...STAGED_SCENES]);
export const SETTLE_WATCH_MS = 1500;

// Every write of the step's layout and cap for `watchMs`, and on each frame whether the box being typed into (if any)
// is in sight: inside the step's scroller (the view when it flows) and above the keypad.
const WATCH_STEP = (watchMs) => new Promise((resolve) => {
  const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  const root = host?.querySelector('.workflow-focus');
  if (!root) { resolve(null); return; }
  const surface = host.querySelector('.mathmaster-work-view-surface');
  const body = host.querySelector('.workflow-focus__workspace-body');
  const read = () => `${root.getAttribute('data-step-room') || 'bounded'} ${root.style.getPropertyValue('--mm-step-plane-max').trim() || 'no cap'}`;
  const seen = [read()];
  let changes = 0;
  const observer = new MutationObserver(() => {
    const now = read();
    if (now !== seen[seen.length - 1]) { changes += 1; seen.push(now); }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-step-room', 'style'] });
  const typing = document.activeElement?.matches?.('input') ? document.activeElement : null;
  let frames = 0;
  let hidden = 0;
  const started = performance.now();
  const tick = () => {
    frames += 1;
    if (typing) {
      const keys = document.querySelector('.mathmaster-mobile-numeric-keypad')?.getBoundingClientRect();
      const scroller = (root.getAttribute('data-step-room') === 'flow' ? surface : body).getBoundingClientRect();
      const box = typing.getBoundingClientRect();
      if (!(box.top >= scroller.top - 1 && box.bottom <= scroller.bottom + 1 && (!keys || box.bottom <= keys.top + 1))) hidden += 1;
    }
    if (performance.now() - started < watchMs) requestAnimationFrame(tick);
    else {
      observer.disconnect();
      resolve({ changes, values: [...new Set(seen)].slice(0, 4), frames, hidden, typing: Boolean(typing), keypad: Boolean(document.querySelector('.mathmaster-mobile-numeric-keypad')) });
    }
  };
  requestAnimationFrame(tick);
});

const runSettle = async (browser, origins, size) => {
  const { context, page, errors } = await newPage(browser, size);
  const problems = [];
  const readings = {};
  try {
    await page.goto(`${origins.audit}${UX_PAGE}?legacy=1&staged=1&identity=1&run=opener-settle-${Date.now()}`, { timeout: 180_000 });
    await page.waitForFunction(() => window.__ux && document.querySelector('[data-question-id]'), null, { timeout: 180_000 });
    const ids = await page.evaluate(() => window.__ux.ids());
    const elsewhere = ids.find((id) => !SETTLE_SCENES.includes(id));
    for (const id of SETTLE_SCENES) {
      if (!ids.includes(id)) { problems.push(`${id}: not in the harness`); continue; }
      await goToQuestion(page, id);
      const count = await page.evaluate((qid) => document.querySelectorAll(`[data-question-id="${qid}"] .workflow-focus__active-stage > *`).length, id);
      if (!count) { problems.push(`${id}: no staged steps to read`); continue; }
      for (let index = 0; index < count; index += 1) {
        await goToQuestion(page, elsewhere);
        await page.evaluate(([qid, at]) => window.__ux.atStep(qid, at), [id, index]);
        await goToQuestion(page, id);
        await page.locator(`[data-question-id="${id}"] .mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button.mathmaster-work-view-opener`).first()
          .evaluate((button) => button.click());
        await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ timeout: 30_000 });
        await settled(page, 1500);
        const heading = await page.evaluate(() => document.querySelector('.mathmaster-work-view-host[data-open="true"] .workflow-focus__workspace-heading h4')?.textContent.trim() || '');
        const where = `${id} step ${index + 1}${heading ? ` (${heading.replace(/^Step \d+\.\s*/, '')})` : ''}`;
        const opened = await page.evaluate(WATCH_STEP, SETTLE_WATCH_MS);
        readings[`${id}#${index + 1}`] = { opened };
        if (!opened) problems.push(`${where}: Work View did not open on the staged step`);
        else if (opened.changes) problems.push(`${where}: after settling, the step's layout and cap changed ${opened.changes} times in ${SETTLE_WATCH_MS}ms (${opened.values.join(', ')})`);
        // A row of the table, typed into with the number keypad up (a phone).
        const rows = page.locator('.mathmaster-work-view-host[data-open="true"] .workflow-focus__active-stage input[aria-label^="Row "]');
        if (size.phone && opened && await rows.count()) {
          const last = rows.nth((await rows.count()) - 1);
          await last.evaluate((element) => element.scrollIntoView({ block: 'end' }));
          await page.waitForTimeout(150);
          await last.tap();
          await page.waitForSelector('.mathmaster-mobile-numeric-keypad', { timeout: 10_000 }).catch(() => {});
          await settled(page, 900);
          const typing = await page.evaluate(WATCH_STEP, SETTLE_WATCH_MS);
          readings[`${id}#${index + 1}`].typing = typing;
          if (!typing?.keypad) problems.push(`${where}: the number keypad did not come up for a row of the table`);
          else {
            if (typing.changes) problems.push(`${where}, the keypad up: the step's layout and cap changed ${typing.changes} times in ${SETTLE_WATCH_MS}ms (${typing.values.join(', ')})`);
            if (typing.hidden) problems.push(`${where}, the keypad up: the box typed into was out of sight in ${typing.hidden} of ${typing.frames} frames`);
          }
          await page.locator('.mathmaster-keypad-done').first().tap().catch(() => {});
          await settled(page, 300);
        }
        await page.evaluate(() => [...document.querySelectorAll('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header button')].find((button) => button.textContent.trim().startsWith('Close'))?.click());
        await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
        await settled(page, 200);
      }
    }
  } catch (error) {
    problems.push(`could not watch the staged steps: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return { check: 'settle', surface: 'assignment', size: size.id, readings, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
};

// ------------------------------------------------------------------------------------------------ hint
// "Show a hint" under a staged step opens the hint panel in the question's results, under the step, and the panel
// takes the step's room: where that leaves the step too little (stepRoom.js), the step flows a frame or two later and
// the results, the hint with them, follow the step and its Previous/Next. The hint was brought into view once, as it
// opened, while the step was still bounded: at 1366x768 the staged table's hint was in view for two frames and then
// 873px down a 709px view, and the button pressed was gone, so focus was on <body> (the review of 2026-11-18). The
// staged and settle checks only open and watch a step; this one presses. On every step of the harness's staged
// questions, at the sizes where a step switched (a Chromebook with and without its shelf, a 1280x689 laptop, three
// phones by touch): once the step has settled, the newest hint whole in the view where it fits, and focus on it or in
// its panel.
export const HINT_SIZES = Object.freeze([
  Object.freeze({ id: '1366x768', width: 1366, height: 768, phone: false, textScale: 1 }),
  Object.freeze({ id: '1366x657', width: 1366, height: 657, phone: false, textScale: 1 }),
  Object.freeze({ id: '1280x689', width: 1280, height: 689, phone: false, textScale: 1 }),
  Object.freeze({ id: '390x844', width: 390, height: 844, phone: true, textScale: 1 }),
  Object.freeze({ id: '360x740', width: 360, height: 740, phone: true, textScale: 1 }),
  Object.freeze({ id: '412x915', width: 412, height: 915, phone: true, textScale: 1 }),
]);
export const HINT_SCENES = SETTLE_SCENES;
export const HINT_SETTLE_MS = 1500;

// The newest hint (what the reveal brings into view: li[data-hint-source]) against the view (the surface's padding
// box, inside the window), the step's layout, and where focus is.
export const READ_HINT = () => {
  const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  const root = host?.querySelector('.workflow-focus');
  const surface = host?.querySelector('.mathmaster-work-view-surface');
  if (!root || !surface) return null;
  const s = surface.getBoundingClientRect();
  const top = Math.max(0, s.top + surface.clientTop);
  const bottom = Math.min(window.innerHeight, s.top + surface.clientTop + surface.clientHeight);
  const panel = host.querySelector('.mathmaster-hint-panel');
  const hints = panel ? [...panel.querySelectorAll('li[data-hint-source]')] : [];
  const hint = hints[hints.length - 1] || null;
  const box = hint?.getBoundingClientRect();
  const active = document.activeElement;
  const name = (element) => (!element || element === document.body ? 'body'
    : `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''}${element.textContent ? ` "${element.textContent.replace(/\s+/g, ' ').trim().slice(0, 24)}"` : ''}`);
  return {
    flow: root.getAttribute('data-step-room') === 'flow',
    view: [Math.round(top), Math.round(bottom)],
    scrollTop: Math.round(surface.scrollTop),
    hint: box ? {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      height: Math.round(box.height),
      seen: Math.round(Math.max(0, Math.min(bottom, box.bottom) - Math.max(top, box.top))),
    } : null,
    focus: { on: name(active), hint: Boolean(hint) && active === hint, panel: Boolean(panel?.contains(active)) },
  };
};

export const hintProblems = (reading) => {
  if (!reading) return ['Work View did not stay open on the staged step'];
  if (!reading.hint) return ['"Show a hint" opened no hint'];
  const problems = [];
  // Whole where it fits; a hint taller than the view fills it.
  const whole = Math.min(reading.hint.height, reading.view[1] - reading.view[0]);
  if (reading.hint.seen < whole - 1) {
    problems.push(`the newest hint has ${reading.hint.seen} of its ${reading.hint.height}px in sight once the step has settled (${reading.flow ? 'the view scrolling as one' : 'a bounded step'}, scrolled ${reading.scrollTop}px)`);
  }
  if (!reading.focus.panel) problems.push(`focus is on ${reading.focus.on}, not on the hint or its panel`);
  return problems;
};

const runHint = async (browser, origins, size) => {
  const { context, page, errors } = await newPage(browser, size);
  const problems = [];
  const readings = {};
  const OPEN = '.mathmaster-work-view-host[data-open="true"]';
  try {
    await page.goto(`${origins.audit}${UX_PAGE}?legacy=1&staged=1&identity=1&run=opener-hint-${Date.now()}`, { timeout: 180_000 });
    await page.waitForFunction(() => window.__ux && document.querySelector('[data-question-id]'), null, { timeout: 180_000 });
    const ids = await page.evaluate(() => window.__ux.ids());
    const elsewhere = ids.find((id) => !HINT_SCENES.includes(id));
    for (const id of HINT_SCENES) {
      if (!ids.includes(id)) { problems.push(`${id}: not in the harness`); continue; }
      await goToQuestion(page, id);
      const count = await page.evaluate((qid) => document.querySelectorAll(`[data-question-id="${qid}"] .workflow-focus__active-stage > *`).length, id);
      if (!count) { problems.push(`${id}: no staged steps to read`); continue; }
      for (let index = 0; index < count; index += 1) {
        // Mounted again on this step, the hint read on the step before forgotten: the first hint is offered again.
        await goToQuestion(page, elsewhere);
        await page.evaluate(([qid, at]) => window.__ux.forgetHelp(qid) && window.__ux.atStep(qid, at), [id, index]);
        await goToQuestion(page, id);
        await page.locator(`[data-question-id="${id}"] .mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button.mathmaster-work-view-opener`).first()
          .evaluate((button) => button.click());
        await page.locator(OPEN).waitFor({ timeout: 30_000 });
        await settled(page, 1200);
        const heading = await page.evaluate((open) => document.querySelector(`${open} .workflow-focus__workspace-heading h4`)?.textContent.trim() || '', OPEN);
        const where = `${id} step ${index + 1}${heading ? ` (${heading.replace(/^Step \d+\.\s*/, '')})` : ''}`;
        // The first-hint offer under the work, pressed as a student presses it: a tap on a phone, a click elsewhere.
        const offer = page.locator(`${OPEN} .mathmaster-attempt-results [data-first-hint-offer] button`, { hasText: 'Show a hint' }).first();
        if (!(await offer.count())) {
          problems.push(`${where}: no "Show a hint" offered under the step`);
        } else {
          const before = await page.evaluate((open) => document.querySelector(`${open} .workflow-focus`)?.getAttribute('data-step-room') === 'flow', OPEN);
          if (size.phone) await offer.tap();
          else await offer.click();
          await settled(page, HINT_SETTLE_MS);
          const reading = await page.evaluate(READ_HINT);
          readings[`${id}#${index + 1}`] = { before: { flow: before }, after: reading };
          hintProblems(reading).forEach((problem) => problems.push(`${where}: ${problem}`));
        }
        await page.evaluate(() => [...document.querySelectorAll('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header button')].find((button) => button.textContent.trim().startsWith('Close'))?.click());
        await page.locator(OPEN).waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
        await settled(page, 200);
      }
    }
  } catch (error) {
    problems.push(`could not press "Show a hint" on the staged steps: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return { check: 'hint', surface: 'assignment', size: size.id, readings, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
};

// ------------------------------------------------------------------------------------------------ the run
const KIND_WORDS = {
  text: 'text', point: 'a point', 'point-name': 'a point\'s name', 'axis-label': 'an axis label', 'curve-name': 'a curve\'s name',
  equation: 'an equation', 'equation-in-list': 'an equation in a list', control: 'a control', badge: 'a tries or completion badge',
};
export const describeCovered = (hit) => `${hit.scene}: ${KIND_WORDS[hit.kind] || hit.kind} "${hit.what}"`;

// At most `limit` tasks at a time: the surfaces and sizes are independent pages. Each result is said as it lands.
const pool = async (tasks, limit, onResult) => {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
      onResult(results[index]);
    }
  }));
  return results;
};

const problemsOf = (result) => (result.check === 'cover' ? [...result.covered.map(describeCovered), ...result.problems] : result.problems);
const say = (result) => {
  const problems = problemsOf(result);
  const summary = result.check === 'cover'
    ? `${result.scenes} scenes, ${result.openers} openers (${result.stacked} on a row of their own): ${result.covered.length} covered${result.over.length ? `, ${result.over.length} drawn over the opener while it scrolls under a bar` : ''}`
    : result.check === 'settle'
      ? `${Object.keys(result.readings).length} steps watched for ${SETTLE_WATCH_MS}ms after settling, ${Object.values(result.readings).filter((reading) => reading.typing).length} with the keypad up`
    : result.check === 'hint'
      ? `${Object.keys(result.readings).length} steps, "Show a hint" pressed on each: the newest hint whole in sight on ${Object.values(result.readings).filter(({ after }) => after?.hint && !hintProblems({ ...after, focus: { panel: true } }).length).length}, focus on it or in its panel on ${Object.values(result.readings).filter(({ after }) => after?.focus?.panel).length}; flowing before ${Object.values(result.readings).filter(({ before }) => before.flow).length}, after ${Object.values(result.readings).filter(({ after }) => after?.flow).length}`
    : result.check === 'staged'
      ? `${Object.keys(result.steps).length} steps, ${Object.values(result.steps).filter((step) => step.flow).length} in a view that scrolls as one, ${Object.values(result.steps).filter((step) => step.plane).length} with a plane, the counter under its heading (no room beside it) on ${Object.values(result.steps).filter((step) => step.headingRow?.page?.counterBelow).length} on the page and ${Object.values(result.steps).filter((step) => step.headingRow?.view?.counterBelow).length} in Work View${result.scrolling.length ? `; taller than the room it has, so it scrolls (left as it is): ${result.scrolling.join(', ')}` : ''}`
    : result.check === 'room'
      ? `the question's work: ${Object.entries(result.scenes).map(([kind, scene]) => `${kind} ${scene['focus view']?.room?.seen ?? '?'}px in Focus view (its bar ${scene['focus view']?.bars?.map((bar) => `${bar.rows} row${bar.rows === 1 ? '' : 's'}, ${Math.round(bar.height)}px`).join(' + ') || 'none'}), ${scene['progress shown']?.room?.seen ?? '?'}px with progress shown${scene['work view'] ? `, Work View ${scene['work view'].view}px` : ''}`).join('; ')}`
    : result.check === 'scroll'
      ? `${Object.keys(result.scenes).length} Work Views${Object.values(result.scenes).some((scene) => scene.sideways?.length) ? `; sideways: ${[...new Set(Object.values(result.scenes).flatMap((scene) => scene.sideways || []))].join(', ')}` : ''}${result.known?.length ? `; left for the owner: ${result.known.join('; ')}` : ''}`
      : `${Object.keys(result.readings).length} states${result.workRoom?.['progress shown'] != null ? `; the question's work: ${result.workRoom['progress shown']}px with progress shown, ${result.workRoom['focus view']}px in Focus view` : ''}`;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${result.check.padEnd(6)} ${result.surface.padEnd(18)} ${result.size.padEnd(13)} ${summary}`);
  problems.forEach((problem) => console.log(`       ${problem}`));
};

const main = async () => {
  const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || null;
  const checks = new Set((arg('check') || 'cover,badges,room,scroll,staged,settle,hint').split(','));
  const only = new Set((arg('only') || '').split(',').filter(Boolean));
  const sizesWanted = new Set((arg('sizes') || '').split(',').filter(Boolean));
  const sized = (list) => list.filter((size) => !sizesWanted.size || sizesWanted.has(size.id));
  const origins = {
    audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5198',
    app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
  };
  const artifacts = process.env.OPENER_COVER_ARTIFACTS || path.join(repo, 'tests/browser/artifacts/workViewOpenerCover');
  mkdirSync(artifacts, { recursive: true });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);
  const started = Date.now();
  const tasks = [];
  if (checks.has('cover')) {
    for (const surface of SURFACES.filter((entry) => !only.size || only.has(entry.id))) {
      for (const size of sized(surface.sizes)) tasks.push(() => runCover(browser, origins, surface, size));
    }
  }
  if (checks.has('badges') && (!only.size || only.has('assignment-screen'))) {
    for (const size of sized(SIZES)) tasks.push(() => runBadges(browser, origins, size));
  }
  if (checks.has('room') && (!only.size || only.has('assignment-screen'))) {
    for (const size of sized([...ROOM_SIZES, ...ROOM_SIDE_SIZES])) tasks.push(() => runRoom(browser, origins, size));
  }
  if (checks.has('scroll') && (!only.size || only.has('assignment'))) {
    for (const size of sized(SCROLL_SIZES)) tasks.push(() => runScroll(browser, origins, size));
  }
  if (checks.has('staged') && (!only.size || only.has('assignment'))) {
    for (const size of sized(STAGED_SIZES)) tasks.push(() => runStaged(browser, origins, size));
  }
  if (checks.has('settle') && (!only.size || only.has('assignment'))) {
    for (const size of sized(SETTLE_SIZES)) tasks.push(() => runSettle(browser, origins, size));
  }
  if (checks.has('hint') && (!only.size || only.has('assignment'))) {
    for (const size of sized(HINT_SIZES)) tasks.push(() => runHint(browser, origins, size));
  }
  let results = [];
  try {
    results = await pool(tasks, Number(process.env.OPENER_COVER_CONCURRENCY) || 3, say);
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify({ origins, results }, null, 2)}\n`);
  const failed = results.filter((result) => problemsOf(result).length).length;
  console.log(`\n${results.length} reading(s) in ${Math.round((Date.now() - started) / 1000)}s. Report: ${path.relative(process.cwd(), path.join(artifacts, 'report.json'))}`);
  if (failed) {
    console.log(`What Work View's opener covers: ${failed} reading(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('What Work View\'s opener covers: nothing, on every surface and size; the header\'s badges clear; a phone question keeps room for its work at any text size, and its action bar fits the screen and settles; one scroller in Work View; every staged step has room, its plane fits it, its heading is whole, it settles, and a hint asked for on it is in sight with focus.');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
