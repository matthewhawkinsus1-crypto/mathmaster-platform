/*
 * THE STUDENT SCREENS AT LARGE TEXT AND NARROW WIDTH, AND THE APP HOSTS BY
 * KEYBOARD — job H. Reuses the accessibility certification's scenes
 * (accessibilityCertification.mjs SCREENS: the real app in memory, the
 * assignment tools, the secure exam, Live Challenge).
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/studentShellLargeText.mjs [--check=targets,s5,text,default,targetsize,workviewheader,obscured] [--only=<screen id,…>] [--teacher] [--shard=<i>/<n>]
 *
 * targets  The identity bar's Log Out is at least 44px tall (WCAG 2.5.5).
 * s5       Live Challenge round (1366×768): Tab from the top of the round to
 *          the end, no focused control under the sticky action bar (2.4.11).
 * obscured WCAG 2.2 2.4.11 (Focus Not Obscured, Minimum) on every student
 *          scene below, at 1366×768 and 390×844 (a touch phone), and in Work
 *          View with each of its drawers open in turn, My Math Path's session
 *          and a DOL Recovery assessment (hostAccessibility.html): the Tab walk
 *          of the teacher screens (accessibilityKeyboardReach.mjs) goes through
 *          each, then Shift+Tab walks it back, and a stop with 3 or more of its
 *          5 sample points under something the page drew fails. Its own job in
 *          CI. Not in the default set.
 * text     WCAG 1.4.4 / 1.4.10 / 1.4.12: every scene at 200% browser text size
 *          (Chromium's default font size 16 → 32, what the text-size setting
 *          changes) at 1366×768 and 390×844, and at 320 CSS px wide: no
 *          horizontal page scroll, and no text clipped by its own box (also
 *          with the 1.4.12 text-spacing override at both viewports) —
 *          graphs, tables and canvases excepted, as 1.4.10 exempts them.
 *          Scenes: the certification's student screens, plus (job N, the
 *          px→rem sweep) more assignment tools, Recovery on Home and in the
 *          Assignments Center, and the teacher workspace (Home, a class), plus
 *          (CI01, VH-29) the registry-tools screen: all 21 registry tools
 *          (LARGE_TEXT_REGISTRY_TOOLS=<a list of ids> for some of them).
 * default  The sweep must not change the default size: every scene at 100%
 *          text, both viewports, screenshotted to --shots=<dir>; with
 *          --compare=<dir> (shots taken before the change) each pair is
 *          diffed pixel by pixel and any difference fails.
 * workviewheader  The Work View header at large text on a phone (task text, Task, Help,
 *          Close): at 150-200% text on 360 and 390 px the buttons no longer sit on
 *          each other. Below 22em the buttons wrap onto their own row under the
 *          whole task, each at least 44 px; on a laptop, and on a phone at 100%,
 *          the header is one row, as it was. Not in the default set.
 * Fonts: CI draws system-ui in DejaVu Sans, wider than Inter. Where system-ui is Inter, run with
 *          FONTCONFIG_FILE="$PWD/tests/browser/support/ciFonts.conf" (an absolute path) to measure what CI measures.
 * --teacher  (TT27) Run the text and targetsize checks over every TEACHER_SCREENS scene of the accessibility
 *          certification (48 scenes: the real app signed in as the synthetic teacher, on the school's clock)
 *          instead of the student scenes. CI runs it in jobs of its own (browser-teacher-large-text (1/3) to (3/3)).
 * --shard=i/n  Only the i-th of n slices of the screens a check walks (after --only): whole screens, since a screen's
 *          scenes share a page and each starts where the last one left it, cut so the slices are about even
 *          (support/sceneShards.mjs). The checks that walk no list (targets, s5, workviewheader) run in the first
 *          slice, so the n slices together run what one run does. Not with --compare.
 * targetsize  WCAG 2.2 2.5.8 (Target Size, Minimum): every pointer target on
 *          every student scene (not the teacher's), at 1366×768 and 390×844,
 *          is 24×24 CSS px or more, or has the room the spacing exception asks
 *          for (support/targetSize.mjs). Not in the default set; writes
 *          artifacts/large-text/target-size.json.
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { SCREENS, sceneLabel, newScreenContext } from './accessibilityCertification.mjs';
import { TEACHER_SCREENS } from './accessibilityTeacherScreens.mjs';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';
import { collectTargetBoxes, smallTargetsOf } from './support/targetSize.mjs';
import { parseShard, shardOf } from './support/sceneShards.mjs';
import { auditKeyboardReach } from './accessibilityKeyboardReach.mjs';
import { hiddenUnderOverlay } from '../../scripts/lib/keyboardReach.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, 'artifacts/large-text');
mkdirSync(artifacts, { recursive: true });
const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || null;
const CHECKS = new Set((arg('check') || 'targets,s5,text').split(','));
// --teacher: run the sweep over every teacher screen of the accessibility certification (TT27) instead of the
// student scenes. The text and targetsize checks both honour it.
const TEACHER_SWEEP = process.argv.includes('--teacher');
const ONLY = new Set((arg('only') || '').split(',').filter(Boolean));
// --shard=i/n: CI's teacher sweep runs in three jobs, each a third of the screens (runScenes, below).
const SHARD = parseShard(arg('shard'));
if (SHARD && SHARD.index > 1) ['targets', 's5', 'workviewheader'].forEach((check) => CHECKS.delete(check));
// --compare reads every shot of the list, and a slice takes only its own.
if (SHARD && arg('compare')) throw new Error('--compare needs the shots of the whole list: run it without --shard');
const origins = {
  app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
  audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199',
};
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const failures = [];
const SHOTS = arg('shots');
const COMPARE = arg('compare');
const report = [];

const applyTextScale = async (page) => {
  if (!page.__cdp || page.__textScale === 1) return;
  await page.__cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * page.__textScale, fixed: Math.round(13 * page.__textScale) } });
};

const newPage = async ({ width, height, mobile = false, textScale = 1, fixedTime = null }, screen = null) => {
  const contextOptions = { viewport: { width, height }, isMobile: mobile, hasTouch: mobile, colorScheme: 'light', reducedMotion: 'reduce' };
  const context = await (screen ? newScreenContext(browser, screen, contextOptions) : browser.newContext(contextOptions));
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  // The teacher harness writes its schedule from the clock ("closes 2:44
  // PM"): screenshots compared across runs need one fixed time.
  if (fixedTime) await page.clock.setFixedTime(fixedTime);
  page.__textScale = textScale;
  if (textScale !== 1) {
    // The browser text-size setting: Chromium's default font sizes. A
    // renderer swap on navigation can drop it, so it is re-applied before
    // every measurement (applyTextScale) and the root size is checked.
    page.__cdp = await context.newCDPSession(page);
    await page.__cdp.send('Page.enable');
    await applyTextScale(page);
  }
  return { context, page };
};

// What 1.4.10 / 1.4.4 failures look like, measured in the page.
const MEASURE = (rootSelector) => {
  const root = (rootSelector && document.querySelector(rootSelector)) || document.body;
  const EXEMPT = 'svg, canvas, table, [role="img"], [role="grid"], [role="table"], math-field, .ML__container, [data-reflow-exempt], [aria-hidden="true"], .mathmaster-responsive-canvas, pre, code';
  const exempt = (element) => Boolean(element.closest(EXEMPT));
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    // What a closed <details> holds is not on screen, though Chromium still reports a box for it
    // (the schedule's "Special bell schedule" read as text cut by its card). Its summary is.
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (node.tagName === 'SUMMARY') break;
      if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  // Visually hidden text (sr-only) is clipped on purpose.
  const srOnly = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      // A `display: contents` wrapper has no box of its own, so it reads 0×0
      // without hiding anything. Work View's body is one when a tool sits in the
      // page: until this skip, every text box of a tool read as visually hidden
      // and was never measured (CI01, VH-29).
      if (style.display === 'contents') continue;
      const rect = node.getBoundingClientRect();
      if ((style.clip && style.clip !== 'auto') || style.clipPath === 'inset(50%)' || (rect.width <= 1 && rect.height <= 1)) return true;
    }
    return false;
  };
  const ownText = (element) => [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
  const scrollX = document.documentElement.scrollWidth - window.innerWidth;
  // A horizontal page scroll: who sticks out past the right edge?
  const wide = [];
  if (scrollX > 1) {
    for (const element of root.querySelectorAll('*')) {
      if (exempt(element) || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.right > window.innerWidth + 1 && rect.left < window.innerWidth) {
        const parentRect = element.parentElement?.getBoundingClientRect();
        if (!parentRect || parentRect.right <= window.innerWidth + 1) wide.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} "${(element.textContent || '').trim().slice(0, 30)}" right=${Math.round(rect.right)}`);
      }
    }
  }
  // Text cut off by a clipping box: a text element that lies (partly) outside
  // an ancestor with overflow hidden/clip, and that the student cannot scroll
  // to — no scrollable box between the two.
  const clipped = [];
  const scrollable = (node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY + getComputedStyle(node).overflowX);
  for (const element of root.querySelectorAll('*')) {
    if (exempt(element) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    // The skip link waits off screen until it is focused (accessiblePrimitives
    // checks it on focus).
    if (element.matches('.mm-skip-link:not(:focus)')) continue;
    const rect = element.getBoundingClientRect();
    // A position: fixed box (Graph Feature Rush's full-screen round) escapes
    // the overflow of everything above it.
    let escaped = getComputedStyle(element).position === 'fixed';
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      if (escaped) break;
      if (getComputedStyle(node).position === 'fixed') escaped = true;
      if (scrollable(node)) break;
      const style = getComputedStyle(node);
      if (!/hidden|clip/.test(style.overflowX + style.overflowY) || node === document.body) continue;
      const box = node.getBoundingClientRect();
      const outY = /hidden|clip/.test(style.overflowY) && (rect.bottom > box.bottom + 2 || rect.top < box.top - 2);
      const outX = /hidden|clip/.test(style.overflowX) && (rect.right > box.right + 2 || rect.left < box.left - 2) && style.textOverflow !== 'ellipsis' && getComputedStyle(element).textOverflow !== 'ellipsis';
      if (outY || outX) {
        clipped.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0] || ''} "${ownText(element).slice(0, 30)}" cut by ${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0] || ''}${outX ? ' x' : ''}${outY ? ' y' : ''}`);
        break;
      }
    }
  }
  // Content pushed past the right edge (html clips overflow-x, so this is the
  // reflow failure that shows no scrollbar): any non-exempt text box whose
  // right edge is beyond the viewport.
  // Text in a sideways-scrolling box that is itself on screen (the teacher's
  // nav strip on a phone) is reached by scrolling that box, as the clipped
  // check above allows; the box sticking out is still caught.
  const inScroller = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (!/(auto|scroll)/.test(getComputedStyle(node).overflowX)) continue;
      const box = node.getBoundingClientRect();
      return box.left >= -1 && box.right <= window.innerWidth + 1;
    }
    return false;
  };
  const offscreen = [];
  for (const element of root.querySelectorAll('*')) {
    if (exempt(element) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    const rect = element.getBoundingClientRect();
    if ((rect.right > window.innerWidth + 1 || rect.left < -1) && !inScroller(element)) offscreen.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0] || ''} "${ownText(element).slice(0, 30)}" ${Math.round(rect.left)}..${Math.round(rect.right)}`);
  }
  // Every text box's font size, in document order: compared with the same
  // scene at 100% to find text that did not grow (1.4.4).
  const sizes = [];
  for (const element of root.querySelectorAll('*')) {
    if (exempt(element) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    sizes.push({ size: parseFloat(getComputedStyle(element).fontSize), what: `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0] || ''} "${ownText(element).slice(0, 24)}"` });
  }
  return {
    rootFont: getComputedStyle(document.documentElement).fontSize,
    scrollX, wide: wide.slice(0, 8), clipped: [...new Set(clipped)].slice(0, 12), clippedCount: clipped.length,
    offscreen: [...new Set(offscreen)].slice(0, 12), offscreenCount: offscreen.length, sizes,
  };
};

// Job N: the surfaces the px→rem sweep reached that the certification's
// screens do not show.
const toolQuestion = (questionId, extraQuery = '') => async (page, origins, { first }) => {
  if (first) {
    await page.goto(`${origins.audit}/tests/browser/studentUxPlatform.html?q=${questionId}&run=a11y${extraQuery}`, { timeout: 180_000 });
    await page.waitForFunction((qid) => window.__ux && document.querySelector(`[data-question-id="${qid}"]`), questionId, { timeout: 180_000 });
  } else {
    await page.evaluate((qid) => window.__ux.go(qid), questionId);
    await page.waitForFunction((qid) => document.querySelector(`[data-question-id="${qid}"]`), questionId, { timeout: 60_000 });
  }
  await page.waitForTimeout(2500);
};
const recoveryScene = (view, ready) => async (page, origins) => {
  await page.goto(`${origins.audit}/tests/browser/recoveryDiscovery.html?scene=available&view=${view}`, { timeout: 180_000 });
  await page.locator(ready).first().waitFor({ timeout: 180_000 });
  await page.waitForTimeout(600);
};
// The teacher's sidebar, clicked programmatically (on a phone it can sit
// under a sticky bar or a closed drawer).
const teacherNav = (name, ready) => async (page) => {
  await page.locator('nav button, aside button').filter({ hasText: new RegExp(`${name}$`) }).first().evaluate((button) => button.click());
  await page.getByText(ready).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};
// A Graph Feature Rush round (student push N, review of #487): its sizes are
// fluid — clamp(28px, 7vmin, 56px) is 54px on a Chromebook, so a viewport term
// that ignored the text setting grew only to the new minimum. The round opens
// on its "Loading…" card (this harness serves no rush graphs), which carries
// that size. A Graph the Line round (student-a11y-2, which no scene had
// reached) is the same kind of round, staged the same way: it opens on its own
// "Loading…" card, since the harness serves no lines either.
const liveChallenge = SCREENS.find((screen) => screen.id === 'live-challenge');
const questionSetRound = ({ challengeMode, token, prompt, shell: shellSelector, bar, ready, name }) => async (page, origins, context) => {
  await liveChallenge.scenes[0].run(page, origins, context);
  const question = { questionInstanceId: 'challenge_a11y-room_r1', prompt, challengeRound: 0 };
  await page.evaluate(({ currentQuestion, mode, roundToken }) => {
    const startsAt = Date.now() - 2000;
    window.__mmHarnessStore.update('liveChallengeRooms/a11y-room', {
      challengeMode: mode, status: 'running', currentRound: 0, currentQuestion, roundVersion: 1,
      roundToken, roundState: 'open', phase: 'answering', startsAt, endsAt: startsAt + 600_000,
      roundStartedAt: startsAt, roundEndsAt: startsAt + 600_000,
    });
  }, { currentQuestion: question, mode: challengeMode, roundToken: token });
  await page.locator(ready).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  // The round's top row (alias, round, count, clock) must not sit under
  // anything outside the round. The student identity bar draws on top of
  // everything (z-index 21000), so the round starts at the bar's height.
  const covered = await page.evaluate(({ shellAt, barAt }) => {
    const shell = document.querySelector(shellAt);
    const row = shell?.querySelector(barAt);
    if (!row) return [`the round has no top row (${barAt})`];
    return [...row.children].flatMap((item) => {
      const box = item.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top && !shell.contains(top) ? [`"${item.textContent.trim().slice(0, 24)}" is under ${top.tagName.toLowerCase()}${top.className ? `.${String(top.className).split(' ')[0]}` : ''}`] : [];
    });
  }, { shellAt: shellSelector, barAt: bar });
  if (covered.length) throw new Error(`the ${name} round's top row is covered: ${covered.join('; ')}`);
};
const rushRound = questionSetRound({ challengeMode: 'graphFeatureRush', token: 'a11y-rush-1', prompt: 'Tap each feature you are asked for.', shell: '.mm-rush-shell', bar: '.mm-rush-bar', ready: '.mm-rush-overlay strong', name: 'Rush' });
const lineRound = questionSetRound({ challengeMode: 'lineGraphClassic', token: 'a11y-line-1', prompt: 'Graph the line.', shell: '.mm-line-shell', bar: '.mm-line-bar', ready: '.mm-line-overlay strong', name: 'Graph the Line' });

// CI01 (VH-29): registry tools the scenes above never showed, each its own
// sample spec in the real QuestionEngine (the UX harness' ?tools=1 section, as
// the Work View certification mounts them). All 21 below pass 200% text, 320 px,
// text spacing and target size (measured 2026-10-25 with the sr-only fix above:
// 12.6 minutes for the 21 on a loaded machine, so about 0.6 per tool). CI
// carried only the eight with the most layout to lose until student-a11y-2; it
// carries all 21 now (about 9 minutes by hand), in the text job, the target
// size step and the 2.4.11 walk. LARGE_TEXT_REGISTRY_TOOLS, a comma list of
// ids, measures some of them by hand ('all' is every one, as in CI).
const ALL_REGISTRY_TOOLS = [
  'dataModelingLab', 'regressionCalculator', 'inverseCompositionLab', 'functionOperationsLab', 'systemsWorkspace',
  'parabolaGeometryLab', 'polynomialWorkshop', 'signSolutionAnalyzer', 'sequenceExplorer', 'complexPlaneLab',
  'exponentialLogBridge', 'transformationsLab', 'functionInvestigation2', 'solutionReview2', 'intervalNumberLine',
  'relationMapping', 'openSortBoard', 'constraintFunctionBuilder', 'expressionMeaning', 'representationBridge', 'matrixLab',
];
const CI_REGISTRY_TOOLS = ALL_REGISTRY_TOOLS;
const REGISTRY_TOOLS = (() => {
  const asked = process.env.LARGE_TEXT_REGISTRY_TOOLS;
  if (asked === 'all') return ALL_REGISTRY_TOOLS;
  return asked ? asked.split(',').filter(Boolean) : CI_REGISTRY_TOOLS;
})();

// A tool whose sample spec names its own question id keeps it in the harness' list.
const REGISTRY_QUESTION_IDS = { expressionMeaning: 'preview-expression-meaning', matrixLab: 'preview-matrix-lab' };

export const LARGE_TEXT_SCREENS = [
  ...SCREENS,
  { id: 'graph-feature-rush', open: liveChallenge.open, scenes: [{ id: 'round', run: rushRound }] },
  { id: 'graph-the-line', open: liveChallenge.open, scenes: [{ id: 'round', run: lineRound }] },
  {
    id: 'more-tools',
    include: '.mathmaster-question-stage',
    scenes: [
      { id: 'multiple-responses', run: toolQuestion('ux-multi') },
      { id: 'representation-match', run: toolQuestion('ux-rm-table') },
    ],
  },
  {
    id: 'registry-tools',
    include: '.mathmaster-question-stage',
    scenes: REGISTRY_TOOLS.map((toolId) => ({ id: toolId, run: toolQuestion(REGISTRY_QUESTION_IDS[toolId] || `tool-${toolId}`, '&tools=1') })),
  },
  {
    id: 'recovery',
    scenes: [
      { id: 'home', run: recoveryScene('home', '[data-recovery-home]') },
      { id: 'assignments', run: recoveryScene('center', '[data-recovery-inline]') },
    ],
  },
  {
    id: 'teacher',
    open: async (page, origins) => {
      await page.goto(`${origins.app}/tests/browser/teacherWorkflow/index.html?reset=1`, { timeout: 180_000 });
      await page.getByText('IN SESSION NOW').first().waitFor({ timeout: 180_000 });
      await page.waitForTimeout(900);
    },
    scenes: [
      { id: 'home', run: async () => {} },
      { id: 'class', run: async (page) => {
        await teacherNav('Classes', /Algebra II — Period 3/)(page);
        await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().evaluate((button) => button.click());
        await page.getByText("Today's lessons").first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(900);
      } },
    ],
  },
];

// 2.4.11 where the screens above do not go (--check=obscured). Work View on
// three tools whose work outgrows the view (a plane, a table, Step Algebra):
// the check walks the view, then each drawer its header offers, one at a time.
// And the QuestionEngine hosts that are not the assignment screen, as
// hostAccessibility.mjs opens them: My Math Path's session (a tool question,
// one with number boxes, and its own renderer) and a DOL Recovery assessment.
const workViewQuestion = (questionId) => async (page, origins, state) => {
  // The scenes share a page: the last one's view is closed first.
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-modal="true"] .mathmaster-work-view-header > button')]
    .find((button) => button.textContent.trim().startsWith('Close'))?.click());
  await toolQuestion(questionId)(page, origins, state);
  await page.locator('button:visible', { hasText: /Open Work View/ }).first().click();
  await page.waitForSelector('[role="dialog"][aria-modal="true"] .mathmaster-work-view-header', { timeout: 30_000 });
  await page.waitForTimeout(800);
};
const sessionHost = (query) => async (page, origins) => {
  await page.goto(`${origins.audit}/tests/browser/hostAccessibility.html?${query}`, { waitUntil: 'networkidle', timeout: 180_000 });
  await page.waitForSelector('[data-host-sentinel="end"]', { timeout: 60_000 });
  // The harness's own two buttons around the session are not the student's.
  await page.evaluate(() => document.querySelectorAll('[data-host-sentinel]').forEach((button) => { button.tabIndex = -1; }));
  await page.waitForTimeout(900);
};
// THE SCRATCHPAD over a question (student-a11y-2): a modal, so the walk goes
// round inside it. The work bar's calculator, a panel on the page the student
// can move, was walked the same way and is not here: on a phone 11 of its
// question's stops sat under it, on a laptop 2 (the VPAT's 2.4.11 row).
const scratchpadOverQuestion = async (page, origins, state) => {
  await toolQuestion('ux-multi')(page, origins, state);
  await page.locator('button.mathmaster-work-bar-tool[aria-label="Scratchpad"]').first().click();
  await page.locator('[role="dialog"][aria-label="Full-screen scratchpad"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
};
export const FOCUS_SCREENS = [
  {
    id: 'work-view',
    workView: true,
    scenes: [
      { id: 'graphing', run: workViewQuestion('ux-graph2') },
      { id: 'table-workbench', run: workViewQuestion('ux-ltw') },
      { id: 'step-algebra', run: workViewQuestion('ux-step') },
    ],
  },
  {
    id: 'session-hosts',
    scenes: [
      { id: 'path-data-modeling', run: sessionHost('scene=path-tool&tool=dataModelingLab') },
      { id: 'path-step-algebra', run: sessionHost('scene=path-tool&tool=stepAlgebra2') },
      { id: 'path-choices', run: sessionHost('scene=path-generic&kind=practice') },
      { id: 'recovery', run: sessionHost('scene=recovery') },
    ],
  },
  {
    id: 'work-bar-tools',
    include: '.mathmaster-question-stage',
    scenes: [{ id: 'scratchpad', run: scratchpadOverQuestion }],
  },
];

// With --shard, the screens of this run's slice of whichever list a check walks, said once per list.
const slices = new Map();
const inShard = (screens, screen) => {
  const listed = screens.filter((entry) => !ONLY.size || ONLY.has(entry.id));
  const key = listed.map((entry) => entry.id).join(',');
  if (!slices.has(key)) {
    const slice = shardOf(listed, SHARD);
    const scenes = (list) => list.reduce((sum, entry) => sum + entry.scenes.length, 0);
    console.log(`shard ${SHARD.index}/${SHARD.count}: ${slice.length} of ${listed.length} screens, ${scenes(slice)} of ${scenes(listed)} scenes (${slice.map((entry) => entry.id).join(', ') || 'none'})`);
    slices.set(key, new Set(slice));
  }
  return slices.get(key).has(screen);
};

const runScenes = async (setting, callback, screens = TEACHER_SWEEP ? TEACHER_SCREENS : LARGE_TEXT_SCREENS) => {
  for (const screen of screens) {
    if (ONLY.size && !ONLY.has(screen.id)) continue;
    if (SHARD && !inShard(screens, screen)) continue;
    const { context, page } = await newPage(setting, screen);
    try {
      if (screen.open) await screen.open(page, origins);
      let first = true;
      for (const scene of screen.scenes) {
        const label = sceneLabel(screen, scene);
        try {
          await scene.run(page, origins, { first });
          first = false;
        } catch (error) {
          failures.push(`${label} ${setting.id}: could not reach the scene — ${error.message.split('\n')[0]}`);
          break;
        }
        await applyTextScale(page);
        await page.waitForTimeout(700);
        await callback(page, label, screen);
      }
    } catch (error) {
      failures.push(`${screen.id} ${setting.id}: could not open — ${error.message.split('\n')[0]}`);
    }
    await context.close();
  }
};

const repo = path.resolve(here, '../..');
// The tools whose controls the bar covered on the bare host (KEYBOARD_SWEEP
// S5), first; any tool question otherwise.
const PREFERRED_TOOLS = ['dataModelingLab', 'functionOperationsLab', 'expressionMeaning', 'linearTableWorkbench'];
async function toolChallengeQuestion() {
  let fallback = null;
  const require = createRequire(import.meta.url);
  const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
  const seedDir = path.join(repo, 'functions/seeds/pathQuestionBank');
  for (const file of readdirSync(seedDir).filter((name) => name.endsWith('.json')).sort()) {
    const parsed = JSON.parse(readFileSync(path.join(seedDir, file), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const instantiated = await mathPath.instantiateQuestion(item, `large-text|${item.id}`);
      if (!instantiated?.question || mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (!plan?.issuable || !plan.toolPayload) continue;
      const question = mathPath.buildSanitizedQuestion(instantiated.question, {
        questionInstanceId: 'challenge_a11y-room_r1', attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload,
      });
      if (!question.pathToolId) continue;
      question.challengeRound = 0;
      if (PREFERRED_TOOLS.includes(question.pathToolId)) return question;
      fallback = fallback || question;
    }
  }
  if (fallback) return fallback;
  throw new Error('No issuable tool question in the Path seed bank');
}

if (CHECKS.has('targets')) {
  for (const setting of [{ id: 'chromebook', width: 1366, height: 768 }, { id: 'phone', width: 390, height: 844, mobile: true }]) {
    const { context, page } = await newPage(setting);
    await SCREENS[0].open(page, origins);
    const box = await page.getByRole('button', { name: 'Log Out' }).first().boundingBox();
    const bar = await page.locator('aside.mm-identity-bar').first().boundingBox();
    console.log(`targets ${setting.id}: Log Out ${Math.round(box?.width)}×${Math.round(box?.height)}, identity bar ${Math.round(bar?.height)}px`);
    if (!box || box.height < 44 || box.width < 44) failures.push(`${setting.id}: Log Out is ${box?.width}×${box?.height}, under 44px`);
    if (bar && bar.height > 40) failures.push(`${setting.id}: the identity bar grew to ${bar.height}px (PQ-021: one line, at most 40px)`);
    await context.close();
  }
}

if (CHECKS.has('s5')) {
  const { context, page } = await newPage({ id: 'chromebook', width: 1366, height: 768 });
  const live = SCREENS.find((screen) => screen.id === 'live-challenge');
  await live.open(page, origins);
  await live.scenes[0].run(page, origins, { first: true });
  // A Solver-Race-style round: a tool question (the engine and its sticky
  // action bar), built as issueNextQuestion builds one. The certification's
  // own round is a choice question, which has no action bar.
  const question = await toolChallengeQuestion();
  await page.evaluate(({ currentQuestion }) => {
    const startsAt = Date.now() - 2000;
    window.__mmHarnessStore.update('liveChallengeRooms/a11y-room', {
      status: 'running', currentRound: 0, currentQuestion, roundVersion: 1, roundToken: 'a11y-round-1',
      phase: 'answering', startsAt, endsAt: startsAt + 600_000, roundStartedAt: startsAt, roundEndsAt: startsAt + 600_000,
    });
  }, { currentQuestion: question });
  await page.waitForTimeout(2500);
  const pinned = await page.evaluate(() => {
    const bar = document.querySelector('[data-live-challenge-engine] .mathmaster-desktop-action-bar');
    return bar ? getComputedStyle(bar).position : 'none';
  });
  console.log(`s5 live-challenge: tool ${question.pathToolId}, action bar ${pinned}`);
  await page.locator('[data-live-challenge-engine]').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  const covered = [];
  let stops = 0;
  for (let i = 0; i < 120; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { done: true };
      if (!el.closest('[data-live-challenge-engine]')) return { outside: true };
      const found = document.querySelector('[data-live-challenge-engine] .mathmaster-desktop-action-bar');
      const bar = found && getComputedStyle(found).position === 'sticky' ? found : null;
      const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
      if (!bar || bar.contains(el)) return { name };
      const r = el.getBoundingClientRect();
      const hits = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]]
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
        .map(([x, y]) => document.elementFromPoint(x, y)).filter((hit) => hit && bar.contains(hit)).length;
      return { name, covered: hits >= 2 };
    });
    if (result.done) break;
    if (result.outside) continue;
    stops += 1;
    if (result.covered) covered.push(result.name);
  }
  console.log(`s5 live-challenge round: ${stops} stops, ${covered.length} covered${covered.length ? ` (${covered.join(' | ')})` : ''}`);
  if (stops < 2) failures.push(`live challenge: the walk never reached the round's controls (${stops})`);
  if (covered.length) failures.push(`live challenge: ${covered.length} focused control(s) under the action bar: ${covered.join(' | ')}`);
  await context.close();
}

// Text that did not grow at 200%: the same scene's text boxes at 100%, in
// document order, at the same viewport.
const baselineSizes = new Map();
const unscaled = (label, settingId, sizes) => {
  const base = baselineSizes.get(`${label}|${settingId.replace('-200%', '')}`);
  if (!base || base.length !== sizes.length) return { comparable: false, list: [] };
  const list = sizes.filter((entry, index) => entry.size < base[index].size * 1.5).map((entry, index) => entry.what);
  return { comparable: true, list };
};

if (CHECKS.has('default')) {
  if (!SHOTS) throw new Error('--check=default needs --shots=<dir>');
  mkdirSync(SHOTS, { recursive: true });
  for (const setting of [
    { id: 'chromebook', width: 1366, height: 768, textScale: 1, fixedTime: new Date('2026-10-15T14:30:00-05:00') },
    { id: 'phone', width: 390, height: 844, mobile: true, textScale: 1, fixedTime: new Date('2026-10-15T14:30:00-05:00') },
  ]) {
    await runScenes(setting, async (page, label) => {
      // The caret blinks and Live Challenge counts down: neither is layout.
      await page.addStyleTag({ content: '*, *::before, *::after { caret-color: transparent !important; animation: none !important; transition: none !important; }' });
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.waitForTimeout(300);
      await screenshotKeepingTouch(page, { path: path.join(SHOTS, `${label.replace(/\//g, '--')}-${setting.id}.png`), fullPage: true, animations: 'disabled' });
      console.log(`shot ${label} ${setting.id}`);
    });
  }
  if (COMPARE) {
    // Pixel by pixel, in the browser (no image library in the repository).
    const page = await (await browser.newContext()).newPage();
    for (const name of readdirSync(COMPARE).filter((file) => file.endsWith('.png')).sort()) {
      let after;
      try { after = readFileSync(path.join(SHOTS, name)); } catch { failures.push(`default size: ${name} has no shot after the change`); continue; }
      const before = readFileSync(path.join(COMPARE, name));
      if (before.equals(after)) { console.log(`same ${name}`); continue; }
      const diff = await page.evaluate(async ({ a, b }) => {
        const load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
        const [one, two] = await Promise.all([load(a), load(b)]);
        if (one.width !== two.width || one.height !== two.height) return { size: `${one.width}×${one.height} → ${two.width}×${two.height}` };
        const pixels = (image) => { const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); return context.getImageData(0, 0, image.width, image.height).data; };
        const p = pixels(one); const q = pixels(two);
        let count = 0; let box = null;
        for (let index = 0; index < p.length; index += 4) {
          if (p[index] === q[index] && p[index + 1] === q[index + 1] && p[index + 2] === q[index + 2]) continue;
          count += 1;
          const x = (index / 4) % one.width; const y = Math.floor(index / 4 / one.width);
          box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
        }
        return { count, box };
      }, { a: `data:image/png;base64,${before.toString('base64')}`, b: `data:image/png;base64,${after.toString('base64')}` });
      if (diff.size) failures.push(`default size: ${name} changed size ${diff.size}`);
      else if (diff.count) failures.push(`default size: ${name} differs in ${diff.count} pixel(s), box ${diff.box.join(',')}`);
      else console.log(`same ${name} (pixels)`);
    }
  }
}

if (CHECKS.has('text')) {
  for (const setting of [
    { id: 'chromebook', width: 1366, height: 768, textScale: 1, baseline: true },
    { id: 'phone', width: 390, height: 844, mobile: true, textScale: 1, baseline: true },
    { id: 'chromebook-200%', width: 1366, height: 768, textScale: 2 },
    { id: 'phone-200%', width: 390, height: 844, mobile: true, textScale: 2 },
    { id: 'reflow-320', width: 320, height: 640, mobile: true, textScale: 1 },
    // 1.4.12: the WCAG text-spacing override (the bookmarklet's values).
    { id: 'spacing-chromebook', width: 1366, height: 768, textScale: 1, spacing: true },
    { id: 'spacing-phone', width: 390, height: 844, mobile: true, textScale: 1, spacing: true },
  ]) {
    await runScenes(setting, async (page, label, screen) => {
      if (setting.spacing) {
        await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
        await page.waitForTimeout(400);
      }
      // A screen's `include` (the certification's: the assignment tools are
      // measured inside .mathmaster-question-stage, not the harness's
      // stand-in navigator).
      const result = await page.evaluate(MEASURE, screen.include || null);
      if (setting.baseline) { baselineSizes.set(`${label}|${setting.id}`, result.sizes); return; }
      if (setting.textScale > 1 && parseFloat(result.rootFont) < 16 * 1.9) failures.push(`${label} ${setting.id}: the text-size setting did not apply (root ${result.rootFont}); the measurement is void`);
      const grow = setting.textScale > 1 ? unscaled(label, setting.id, result.sizes) : { comparable: true, list: [] };
      const { sizes, ...kept } = result;
      report.push({ label, setting: setting.id, ...kept, unscaled: grow.list, unscaledComparable: grow.comparable, textBoxes: sizes.length });
      const fine = result.scrollX <= 1 && result.clippedCount === 0 && result.offscreenCount === 0 && grow.list.length === 0;
      console.log(`${fine ? 'ok  ' : 'FAIL'} text ${label.padEnd(30)} ${setting.id.padEnd(16)} root=${result.rootFont} scrollX=${result.scrollX} clipped=${result.clippedCount} offscreen=${result.offscreenCount} unscaled=${grow.comparable ? `${grow.list.length}/${sizes.length}` : 'n/a'}`);
      if (result.scrollX > 1) failures.push(`${label} ${setting.id}: horizontal scroll ${result.scrollX}px (${result.wide.join('; ')})`);
      if (result.clippedCount) failures.push(`${label} ${setting.id}: ${result.clippedCount} clipped text box(es): ${result.clipped.join('; ')}`);
      if (result.offscreenCount) failures.push(`${label} ${setting.id}: ${result.offscreenCount} text box(es) past the viewport edge: ${result.offscreen.join('; ')}`);
      if (grow.list.length) failures.push(`${label} ${setting.id}: ${grow.list.length} text box(es) did not grow at 200%: ${[...new Set(grow.list)].slice(0, 10).join('; ')}`);
      await screenshotKeepingTouch(page, { path: path.join(artifacts, `${label.replace(/\//g, '--')}-${setting.id}.png`), fullPage: true }).catch(() => {});
    });
  }
  writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
}

// WCAG 2.2 2.5.8 (Target Size, Minimum): on every student scene, at both
// viewports, each pointer target is 24x24 CSS px or more, or has the room the
// criterion's spacing exception asks for. tests/browser/support/targetSize.mjs
// says what is read and what is not (an equivalent control elsewhere and an
// essential size still excuse a target this lists). The teacher's screens are
// not student-facing and are skipped.
if (CHECKS.has('targetsize')) {
  const sizeReport = [];
  for (const setting of [{ id: 'chromebook', width: 1366, height: 768 }, { id: 'phone', width: 390, height: 844, mobile: true }]) {
    await runScenes(setting, async (page, label, screen) => {
      if (screen.id === 'teacher') return; // the two older teacher scenes; the --teacher sweep measures all of them
      const result = smallTargetsOf(await page.evaluate(collectTargetBoxes, { rootSelector: 'body' }));
      sizeReport.push({ label, setting: setting.id, ...result });
      console.log(`${result.failing.length || !result.measured ? 'FAIL' : 'ok  '} targets ${label.padEnd(30)} ${setting.id.padEnd(10)} measured=${result.measured} under24=${result.undersized} bySpacing=${result.bySpacing} crowded=${result.failing.length}`);
      if (!result.measured) failures.push(`${label} ${setting.id}: no pointer target was measured, so the check is void`);
      if (result.failing.length) {
        const named = result.failing.slice(0, 8).map((target) => `${target.tag}${target.roleAttr ? `[${target.roleAttr}]` : ''} "${target.name}" ${target.w}×${target.h} (${target.className.split(' ')[0] || '-'})`);
        failures.push(`${label} ${setting.id}: ${result.failing.length} pointer target(s) under 24×24 CSS px with no room around them: ${named.join('; ')}`);
      }
    });
  }
  writeFileSync(path.join(artifacts, 'target-size.json'), JSON.stringify(sizeReport, null, 2));
}

// WCAG 2.2 2.4.11 (Focus Not Obscured, Minimum) on the student's screens: the
// teacher screens' Tab walk (accessibilityKeyboardReach.mjs, its rule
// mm-focus-obscured: 3 or more of a stop's 5 sample points under something
// that is neither the control, inside it nor around it) through every scene
// at both sizes. Work View is walked as it opens and then with each drawer of
// its header open in turn. The walk's other rules are the certification's
// business and are not judged here. The teacher's screens are walked there.
if (CHECKS.has('obscured')) {
  const focusReport = [];
  const walk = async (page, label, settingId, include) => {
    const result = await auditKeyboardReach(page, { name: label, viewport: settingId, include });
    const entries = Object.entries(result.details).filter(([key]) => key.endsWith('|mm-focus-obscured'));
    const count = entries.reduce((sum, [key]) => sum + (result.counts[key] || 0), 0);
    const covered = entries.flatMap(([, entry]) => entry.examples.map((example) => `${example.target} (${example.summary})`));
    const back = await walkBack(page);
    // What the walk's other rules find there too, by rule: not judged here (the
    // certification's business), recorded so a run says what each walk finds.
    const findings = Object.fromEntries(Object.entries(result.counts).map(([key, found]) => [key.slice(key.lastIndexOf('|') + 1), found]));
    focusReport.push({ label, setting: settingId, stops: result.summary.stops, stopNames: result.summary.stopNames, covered, findings, backStops: back.stops, backCovered: back.hidden });
    console.log(`${count || back.hidden.length ? 'FAIL' : 'ok  '} obscured ${label.padEnd(40)} ${settingId.padEnd(10)} stops=${result.summary.stops} covered=${count} back=${back.stops} coveredBack=${back.hidden.length}`);
    if (count) failures.push(`${label} ${settingId}: ${count} focused control(s) under something the page drew (WCAG 2.4.11): ${covered.join('; ')}`);
    if (back.hidden.length) failures.push(`${label} ${settingId}: walking back with Shift+Tab, ${back.hidden.length} focused control(s) under something the page drew (WCAG 2.4.11): ${back.hidden.join('; ')}`);
    if (!back.stops) failures.push(`${label} ${settingId}: walking back with Shift+Tab reached no control, so nothing was measured`);
  };
  // The walk goes forward only, and a bar at the top of a screen hides what
  // focus scrolls UP into view: Shift+Tab up Grades left "See results" under
  // the identity bar. So each scene is walked back too, from its end to its
  // start (round a dialog, or round an exam that keeps focus in itself, until
  // a stop comes again), sampled at the walk's five points and judged by its
  // own rule (scripts/lib/keyboardReach.mjs, hiddenUnderOverlay).
  const BACK_STOP = () => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement || 'mmBackSentinel' in el.dataset) return { done: true };
    if ('mmBackSeen' in el.dataset) return { done: true };
    el.dataset.mmBackSeen = '';
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return { name: el.tagName, sampled: 0, covered: 0 };
    const inset = Math.min(6, rect.width / 4, rect.height / 4);
    const round = el instanceof SVGElement && el.localName !== 'svg';
    const points = (round
      ? [[rect.left + rect.width / 2, rect.top + rect.height / 2]]
      : [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + inset, rect.top + inset], [rect.right - inset, rect.top + inset], [rect.left + inset, rect.bottom - inset], [rect.right - inset, rect.bottom - inset]])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    let covered = 0;
    let by = null;
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      covered += 1;
      by = by || `${hit.localName}${hit.classList?.[0] ? `.${hit.classList[0]}` : ''}`;
    }
    return { name: (el.getAttribute('aria-label') || el.textContent || el.localName).replace(/\s+/g, ' ').trim().slice(0, 40), sampled: points.length, covered, by };
  };
  const walkBack = async (page) => {
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      const modal = [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter((node) => node.getClientRects().length).pop();
      const end = document.createElement('button');
      end.type = 'button';
      end.dataset.mmBackSentinel = '';
      end.setAttribute('aria-hidden', 'true');
      end.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
      (modal || document.body).appendChild(end);
      end.focus({ preventScroll: true });
    });
    const hidden = [];
    let stops = 0;
    for (let index = 0; index < 400; index += 1) {
      await page.keyboard.press('Shift+Tab');
      // After the app's own reveals, which run a frame after focus moves.
      await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
      const stop = await page.evaluate(BACK_STOP);
      if (stop.done) break;
      stops += 1;
      if (hiddenUnderOverlay(stop)) hidden.push(`${stop.name} (under ${stop.by})`);
    }
    await page.evaluate(() => {
      document.querySelectorAll('[data-mm-back-sentinel]').forEach((node) => node.remove());
      document.querySelectorAll('[data-mm-back-seen]').forEach((node) => { delete node.dataset.mmBackSeen; });
      document.activeElement?.blur?.();
    });
    return { stops, hidden };
  };
  const DRAWER_BUTTONS = '[role="dialog"][aria-modal="true"] .mathmaster-work-view-header > button[aria-expanded]';
  for (const setting of [{ id: 'chromebook', width: 1366, height: 768 }, { id: 'phone', width: 390, height: 844, mobile: true }]) {
    await runScenes(setting, async (page, label, screen) => {
      if (screen.id === 'teacher') return;
      if (!screen.workView) { await walk(page, label, setting.id, [].concat(screen.include || [])[0] || null); return; }
      await walk(page, label, setting.id, null);
      const drawers = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((button) => button.textContent.trim()), DRAWER_BUTTONS);
      if (!drawers.length) failures.push(`${label} ${setting.id}: Work View's header offers no drawer, so none was walked`);
      for (const [index, name] of drawers.entries()) {
        const toggle = (at) => page.evaluate(({ selector, at: which }) => document.querySelectorAll(selector)[which].click(), { selector: DRAWER_BUTTONS, at });
        await toggle(index);
        await page.waitForTimeout(600);
        await walk(page, `${label}/${name}`, setting.id, null);
        await toggle(index);
        await page.waitForTimeout(300);
      }
    }, [...LARGE_TEXT_SCREENS, ...FOCUS_SCREENS]);
  }
  writeFileSync(path.join(artifacts, 'focus-obscured.json'), JSON.stringify(focusReport, null, 2));
}

// The Work View header's buttons never collide with each other or the task
// (student walkthrough, large text on a phone). Measured in the Work View
// harness's real QuestionEngine, with a task long enough to want the room.
if (CHECKS.has('workviewheader')) {
  const sortTask = {
    id: 'wv-header-sort', type: 'openSortBoard', mode: 'controlled',
    prompt: 'Real nth roots. Sort each set of roots by how many REAL roots it has. Use the index (even or odd) and the sign of the radicand. Then give a reason for each group.',
    categories: [{ id: 'even', label: 'Even' }, { id: 'odd', label: 'Odd' }],
    items: [{ id: 'a', label: 'Card A', text: 'The number 2' }, { id: 'b', label: 'Card B', text: 'The number 3' }, { id: 'c', label: 'Card C', text: 'The number 4' }],
    validSchemes: [{ id: 'answer', groups: [{ id: 'even', itemIds: ['a', 'c'] }, { id: 'odd', itemIds: ['b'] }] }],
  };
  const measureHeader = () => {
    const header = document.querySelector('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header');
    if (!header) return null;
    const box = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, w: rect.width, h: rect.height }; };
    const heading = header.querySelector('.mathmaster-work-view-heading');
    return {
      viewport: window.innerWidth,
      emPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      header: box(header),
      heading: box(heading),
      buttons: [...header.querySelectorAll(':scope > button')].map((button) => ({ name: button.textContent.trim(), ...box(button), clippedX: button.scrollWidth - button.clientWidth })),
    };
  };
  const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  for (const setting of [
    { id: 'laptop-100%', width: 1366, height: 768, textScale: 1, expect: 'row' },
    { id: 'laptop-200%', width: 1366, height: 768, textScale: 2, expect: 'row' },
    { id: 'phone-360-100%', width: 360, height: 640, mobile: true, textScale: 1, expect: 'row' },
    { id: 'phone-390-100%', width: 390, height: 844, mobile: true, textScale: 1, expect: 'row' },
    { id: 'phone-360-150%', width: 360, height: 640, mobile: true, textScale: 1.5, expect: 'wrapped' },
    { id: 'phone-360-200%', width: 360, height: 640, mobile: true, textScale: 2, expect: 'wrapped' },
    { id: 'phone-390-150%', width: 390, height: 844, mobile: true, textScale: 1.5, expect: 'wrapped' },
    { id: 'phone-390-200%', width: 390, height: 844, mobile: true, textScale: 2, expect: 'wrapped' },
  ]) {
    if (ONLY.size && !ONLY.has('workviewheader')) continue;
    const { context, page } = await newPage(setting);
    const label = `work view header ${setting.id}`;
    try {
      await page.goto(`${origins.audit}/tests/browser/workViewMatrix.html`, { waitUntil: 'load', timeout: 180_000 });
      await page.waitForFunction(() => typeof window.__mmWorkView === 'function', null, { timeout: 180_000 });
      await page.evaluate((question) => window.__mmWorkView({ id: question.id, question }), sortTask);
      await page.waitForSelector(`[data-scene-id="${sortTask.id}"]`, { timeout: 60_000 });
      await page.waitForTimeout(800);
      await applyTextScale(page);
      await page.evaluate(() => {
        if (document.querySelector('.mathmaster-work-view-host[data-open="true"]')) return;
        [...document.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().width > 0).find((button) => /enlarge|work view/i.test(button.textContent || ''))?.click();
      });
      await page.waitForSelector('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-header', { timeout: 30_000 });
      await page.waitForTimeout(800);
      const view = await page.evaluate(measureHeader);
      const problems = [];
      if (!view.buttons.some((button) => /^Task$/.test(button.name)) || !view.buttons.some((button) => /^Help$/.test(button.name)) || !view.buttons.some((button) => /^Close/.test(button.name))) {
        problems.push(`the header lacks Task, Help or Close (${view.buttons.map((button) => button.name).join(', ')})`);
      }
      if (setting.textScale > 1 && view.emPx < 16 * setting.textScale - 1) problems.push(`the text-size setting did not apply (root ${view.emPx}px); the measurement is void`);
      const parts = [{ name: 'task', ...view.heading }, ...view.buttons];
      parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => { if (overlaps(a, b)) problems.push(`"${a.name}" and "${b.name}" overlap`); }));
      view.buttons.forEach((button) => {
        if (button.h < 43.5 || button.w < 43.5) problems.push(`"${button.name}" is ${Math.round(button.w)}x${Math.round(button.h)}, under 44`);
        // Only where the buttons have their own row. Beside the task, as on a
        // laptop and a 100% phone, they keep the squeeze they always had (a
        // label can run a few px past its box at 200% on a laptop): that row is
        // held to "nothing overlaps and nothing moved", not made roomier.
        if (setting.expect === 'wrapped' && button.clippedX > 1) problems.push(`"${button.name}" label runs ${Math.round(button.clippedX)}px past its button`);
        if (button.right > view.viewport + 0.5 || button.left < -0.5) problems.push(`"${button.name}" is past the screen edge`);
      });
      const under = view.buttons.every((button) => button.top >= view.heading.bottom - 1);
      const beside = view.buttons.every((button) => button.left >= view.heading.right - 1);
      if (setting.expect === 'wrapped' && !under) problems.push('the buttons are not on their own row under the task');
      if (setting.expect === 'wrapped' && view.heading.w < view.viewport * 0.85) problems.push(`the task has ${Math.round(view.heading.w)}px of ${view.viewport}px: it should have the whole row`);
      if (setting.expect === 'row' && !beside) problems.push('the buttons left the task\'s row, where they have always been');
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${label.padEnd(36)} ${setting.expect.padEnd(8)} task ${Math.round(view.heading.w)}px wide, header ${Math.round(view.header.h)}px tall, buttons ${view.buttons.map((button) => `${button.name.replace(/ ✕/, '')} ${Math.round(button.w)}x${Math.round(button.h)}`).join(', ')}`);
      problems.forEach((problem) => failures.push(`${label}: ${problem}`));
    } catch (error) {
      failures.push(`${label}: could not measure — ${error.message.split('\n')[0]}`);
    }
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(`studentShellLargeText: ${failures.length} failure(s)\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('studentShellLargeText: all checks passed');
