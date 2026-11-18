/*
 * WHAT WORK VIEW'S OPENER COVERS, ON EVERY SURFACE IT FLOATS OVER (PH01; #386 R17 and R10).
 *
 *   npx vite --config tests/browser/forcedColors.vite.config.mjs --host 127.0.0.1 --port 5198 --strictPort &   # stubbed harnesses
 *   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &                                          # the real app, in memory
 *   node tests/browser/workViewOpenerCover.mjs [--check=cover,badges,scroll,staged] [--only=<surface>,...] [--sizes=<size>,...]
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
 * WHAT. Three checks, each fails the run:
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
 *   scroll  With Work View open on a 390x844, 360x740 and 320x568 phone, a 1366x768 Chromebook and a 1920x1080
 *           desktop, for every plane tool, the table tools and the Step Algebra boards: the view itself is the one
 *           thing that scrolls up and down (no scroller inside a scroller), and the plane fits the height it is
 *           given (#386 R10). A row wider than a phone that scrolls sideways (a long formula, a source-data list)
 *           is reported, not failed: it is a region of its own the keyboard scrolls.
 *   staged  With Work View open on every step of the staged questions (WorkflowRunner's focus mode), on the three
 *           phones at 100% and 200% text, a Chromebook at both and a desktop: the step has the height to be worked
 *           in (a bounded step at least 200px, or the view scrolling as one), no scroller inside a scroller, and
 *           the step's plane fits its scroller together with the row of its own controls under it, wherever the
 *           room holds both with the plane at its 160px floor (src/platform/workflow/stepRoom.js). A step whose content is taller than its room even so (the plotting
 *           step's point cards) is reported: it scrolls, its own step or the view. And the step's heading row is whole,
 *           on the page and in Work View: its name, its kind, its review status and its counter ("3 of 17") neither
 *           run past their own box or out of the row nor are cut off at its side (STEP_HEADING_ITEMS).
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
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * size.textScale, fixed: 13 * size.textScale } });
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
  const cramped = [];
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
          m.nested.forEach((entry) => problems.push(`${where}: ${entry}`));
          if (m.plane && m.plane.height > m.plane.room + 1) problems.push(`${where}: the plane is ${m.plane.height}px tall and its step shows ${m.plane.room}px`);
          else if (m.plane && m.plane.withControls > m.plane.room + 1) {
            // Its controls with it wherever the room holds them and a plane at its floor (stepRoom.js PLANE_MIN); a view
            // shorter than that (the Work View at 320x568 with 200% text is 172px) keeps the plane whole, and says so.
            const controls = m.plane.withControls - m.plane.height;
            if (m.plane.room >= PLANE_MIN + controls) problems.push(`${where}: the plane and its controls under it are ${m.plane.withControls}px, and its step shows ${m.plane.room}px`);
            else cramped.push(`${where}: ${m.plane.room}px, the plane ${m.plane.height}px and its controls ${controls}px`);
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
  return { check: 'staged', surface: 'assignment', size: size.id, steps, scrolling, cramped, problems: [...problems, ...errors.map((message) => `page error: ${message}`)] };
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
    : result.check === 'staged'
      ? `${Object.keys(result.steps).length} steps, ${Object.values(result.steps).filter((step) => step.flow).length} in a view that scrolls as one, ${Object.values(result.steps).filter((step) => step.plane).length} with a plane, the counter under its heading (no room beside it) on ${Object.values(result.steps).filter((step) => step.headingRow?.page?.counterBelow).length} on the page and ${Object.values(result.steps).filter((step) => step.headingRow?.view?.counterBelow).length} in Work View${result.cramped?.length ? `; a view too short for a plane at its floor and its controls together (the plane whole): ${result.cramped.join(', ')}` : ''}${result.scrolling.length ? `; taller than the room it has, so it scrolls (left as it is): ${result.scrolling.join(', ')}` : ''}`
    : result.check === 'scroll'
      ? `${Object.keys(result.scenes).length} Work Views${Object.values(result.scenes).some((scene) => scene.sideways?.length) ? `; sideways: ${[...new Set(Object.values(result.scenes).flatMap((scene) => scene.sideways || []))].join(', ')}` : ''}${result.known?.length ? `; left for the owner: ${result.known.join('; ')}` : ''}`
      : `${Object.keys(result.readings).length} states${result.workRoom?.['progress shown'] != null ? `; the question's work: ${result.workRoom['progress shown']}px with progress shown, ${result.workRoom['focus view']}px in Focus view` : ''}`;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${result.check.padEnd(6)} ${result.surface.padEnd(18)} ${result.size.padEnd(13)} ${summary}`);
  problems.forEach((problem) => console.log(`       ${problem}`));
};

const main = async () => {
  const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || null;
  const checks = new Set((arg('check') || 'cover,badges,scroll,staged').split(','));
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
  if (checks.has('scroll') && (!only.size || only.has('assignment'))) {
    for (const size of sized(SCROLL_SIZES)) tasks.push(() => runScroll(browser, origins, size));
  }
  if (checks.has('staged') && (!only.size || only.has('assignment'))) {
    for (const size of sized(STAGED_SIZES)) tasks.push(() => runStaged(browser, origins, size));
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
    console.log('What Work View\'s opener covers: nothing, on every surface and size; the header\'s badges clear; one scroller in Work View; every staged step has room, its plane fits it, and its heading is whole.');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
