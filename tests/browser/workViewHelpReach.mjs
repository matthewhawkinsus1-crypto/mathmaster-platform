// ON A PHONE, WORK VIEW'S HELP HOLDS THE STEPS, THE HINTS AND "ASK MY TEACHER";
// ON A DOL IT HOLDS NO HINT AND NO METHOD.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/workViewHelpReach.mjs
//
// Student pass 3, TOOL-3: on a 390x844 phone a student enlarged Matrix Lab and
// pressed Help. The drawer said "Use the directions and controls in this
// workspace…" — but Work View hides the TaskCard with those directions, the
// phone hides the tool header with "About this tool", and that sentence had
// replaced the platform's Help, "Ask my teacher" included.
//
// R-10: an exit ticket showed Matrix Lab's "How to do this" card, which states
// the rule that tells "no solution" from "infinitely many" — the thing the
// item measures — and Transformations Lab kept its mapping rule open beside
// the graph.
//
// Checks, in the real QuestionEngine at 390x844 (tests/browser/workViewHelpReach.html):
//   matrix practice   Help = the steps, then "Show a hint" (which opens a
//                     hint), then "✋ Ask my teacher" (which raises the hand)
//   matrix DOL        the card offers no steps; Help = "Ask my teacher" and
//                     nothing else: no hint, no step, no decision rule
//   transform practice  Help keeps the platform's hint and Ask above the
//                     tool's own bridge
//   transform DOL     no bridge anywhere, no first-step banner, no hint; Ask
//   graphing DOL      steps that only say how to plot stay, with Ask; the snap
//                     note does not say how far between gridlines the line runs
//   matrixSolve DOL   neither the tool's description nor its directions
//                     ("X = A⁻¹B") in the card or in Help (review B3)
//   balance DOL       a tool's own Help that states the method ("inverse
//                     operations in reverse order") is not in Help (review B1)
//   graphing, server-graded practice  no "Hints are not part of this
//                     activity"; the tool's own "Stuck? Show a hint" is the
//                     Help (review B2)
// "Show a hint", the tool's hint and "Ask my teacher" are checked on the
// drawer's FIRST screen, without scrolling (review S1): the directions arrive
// folded above them.
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

// Matrix Lab's method step and decision rule (MatrixLab.jsx, completeSystem).
const MATRIX_STEP = 'is a multiple of another row has no inverse';
const MATRIX_RULE = 'the equations agree: infinitely many solutions';
// Transformations Lab's bridge and pointMap's first step.
const BRIDGE = 'Y’s tell the truth';
const BRIDGE_PLAIN = "Y's tell the truth";
const POINT_MAP_STEP = 'undo the inside multiplier b';
// Graphing2's control steps.
const PLOT_STEP = 'Click the grid to plot a point';

const run = Date.now();
const open = async (role, tool, grading = '') => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${role}/${tool}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/workViewHelpReach.html?role=${role}&tool=${tool}&run=${run}${grading ? `&grading=${grading}` : ''}`, { waitUntil: 'networkidle' });
  // Something the TOOL renders, so absence checks below are not vacuous.
  // Attached, not visible: on an assessment the card is the authored prompt
  // alone, which the question already shows, so the card draws nothing.
  await page.locator('.mathmaster-tool-task-card').first().waitFor({ state: 'attached', timeout: 20000 });
  return page;
};
const taskCardSummary = (page) => page.locator('.mathmaster-tool-task-card button[aria-expanded]').first().innerText().catch(() => '');
const openWorkView = async (page) => {
  await page.getByRole('button', { name: /Enlarge question|Open Work View/ }).first().click();
  await page.locator('.mathmaster-work-view-header').first().waitFor({ state: 'visible', timeout: 8000 });
};
const helpDrawer = (page) => page.locator('section[aria-label="Help and instructions"][data-open="true"]');
const openHelp = async (page) => {
  await page.locator('.mathmaster-work-view-header button:visible', { hasText: /^Help$/ }).first().click();
  await helpDrawer(page).waitFor({ state: 'visible', timeout: 8000 });
};
// Work View capabilities are published from effects after the tool renders.
const drawerShows = (page, needle) => page.waitForFunction(
  (text) => (document.querySelector('section[aria-label="Help and instructions"][data-open="true"]')?.textContent || '').includes(text),
  needle,
  { timeout: 8000 },
).then(() => true, () => false);
const drawerText = (page) => helpDrawer(page).evaluate((section) => section.textContent || '');
// A control a student can press: inside the drawer, scrolled to, on screen.
const reachable = async (locator) => {
  if (!(await locator.count())) return false;
  await locator.first().scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.first().boundingBox();
  return Boolean(box && box.width > 0 && box.y >= 0 && box.y + box.height <= 844 && box.x >= 0 && box.x + box.width <= 390);
};
// On the drawer's first screen: the drawer unscrolled, the control inside its
// visible box and inside the phone's viewport.
const onFirstScreen = async (page, locator) => {
  if (!(await locator.count())) return false;
  return locator.first().evaluate((control) => {
    const drawer = control.closest('section[aria-label="Help and instructions"]');
    if (!drawer) return false;
    drawer.scrollTop = 0;
    const box = control.getBoundingClientRect();
    const frame = drawer.getBoundingClientRect();
    return box.height > 0 && box.top >= frame.top && box.bottom <= frame.bottom && box.bottom <= window.innerHeight;
  });
};
const openDirections = async (page) => {
  const fold = helpDrawer(page).locator('[data-task-card-directions] > summary').first();
  if (await fold.count()) await fold.click();
};
const ask = (page) => helpDrawer(page).getByRole('button', { name: /Ask my teacher/ });
const showHint = (page) => helpDrawer(page).getByRole('button', { name: /^Show a hint$/ });

// ---------------------------------------------------------------- Matrix Lab
{
  const page = await open('practice', 'matrix');
  check(/How to do this \(4 steps\)/.test(await taskCardSummary(page)), 'matrix practice: the card offers its 4 steps', await taskCardSummary(page));
  await openWorkView(page);
  check(!(await page.locator('.mathmaster-tool-task-card').first().isVisible()), 'matrix practice: Work View hides the task card (the reason Help must carry it)');
  await openHelp(page);
  await helpDrawer(page).locator('[data-task-card-directions]').first().waitFor({ timeout: 8000 });
  check(await onFirstScreen(page, showHint(page)), 'matrix practice: "Show a hint" is on the drawer\'s first screen');
  check(await onFirstScreen(page, ask(page)), 'matrix practice: "Ask my teacher" is on the drawer\'s first screen');
  await openDirections(page);
  check(await drawerShows(page, MATRIX_STEP), 'matrix practice: Help shows the steps (one tap on "How to do this")');
  const text = await drawerText(page);
  check(await reachable(showHint(page)), 'matrix practice: "Show a hint" is in Help, on screen');
  check(await reachable(ask(page)), 'matrix practice: "Ask my teacher" is in Help, on screen');
  const order = await helpDrawer(page).evaluate((section) => {
    const at = (node) => (node ? [...section.querySelectorAll('*')].indexOf(node) : -1);
    return { steps: at(section.querySelector('[data-work-view-directions]')), hints: at(section.querySelector('[data-hint-panel]')) };
  });
  check(order.steps > -1 && order.hints > order.steps, 'matrix practice: the steps come first, then the hint panel', JSON.stringify(order));
  check(!/Use the directions and controls in this workspace/.test(text), 'matrix practice: no generic directions sentence');
  await showHint(page).click();
  check(await drawerShows(page, 'every coefficient times 2'), 'matrix practice: "Show a hint" opens the first hint in Help');
  await ask(page).first().click();
  const asked = await page.evaluate(() => window.__mmAsked);
  check(asked.includes(true), 'matrix practice: "Ask my teacher" in Help raises the hand', JSON.stringify(asked));
  await page.close();
}
{
  const page = await open('dol', 'matrix');
  const summary = await taskCardSummary(page);
  check(!/step/i.test(summary), 'matrix DOL: the card offers no steps', summary);
  check(!(await page.evaluate((rule) => document.body.textContent.includes(rule), MATRIX_RULE)), 'matrix DOL: the decision rule is nowhere on the page');
  await openWorkView(page);
  await openHelp(page);
  check(await drawerShows(page, 'Ask my teacher'), 'matrix DOL: Help keeps "Ask my teacher"');
  check(await reachable(ask(page)), 'matrix DOL: "Ask my teacher" is on screen');
  const text = await drawerText(page);
  check(!text.includes(MATRIX_STEP) && !text.includes(MATRIX_RULE), 'matrix DOL: Help shows no method step', text.slice(0, 200));
  check(!(await showHint(page).count()) && !(await helpDrawer(page).locator('[data-hint-panel] ol').count()), 'matrix DOL: Help offers no hint');
  check(!/every coefficient times 2/.test(text), 'matrix DOL: the authored hint is not in Help');
  check(!/Use the directions and controls in this workspace/.test(text), 'matrix DOL: the generic sentence no longer replaces the platform Help');
  await page.close();
}

// ------------------------------------------------------- Transformations Lab
{
  const page = await open('practice', 'transform');
  await openWorkView(page);
  await openHelp(page);
  check(await drawerShows(page, 'X’s lie') || await drawerShows(page, "X's lie"), 'transform practice: the tool\'s bridge is in Help');
  check(await onFirstScreen(page, showHint(page)), 'transform practice: the platform "Show a hint" is on the drawer\'s first screen');
  check(await onFirstScreen(page, ask(page)), 'transform practice: "Ask my teacher" is on the drawer\'s first screen');
  const order = await helpDrawer(page).evaluate((section) => {
    const all = [...section.querySelectorAll('*')];
    return { hints: all.indexOf(section.querySelector('[data-hint-panel]')), tool: all.indexOf(section.querySelector('[data-work-view-tool-help]')) };
  });
  check(order.hints > -1 && order.tool > order.hints, 'transform practice: the platform Help comes before the tool\'s own', JSON.stringify(order));
  await page.close();
}
{
  const page = await open('dol', 'transform');
  const bodyHas = (needle) => page.evaluate((text) => document.body.textContent.includes(text), needle);
  check(!(await bodyHas('Transformation bridge')) && !(await bodyHas(BRIDGE)) && !(await bodyHas(BRIDGE_PLAIN)), 'transform DOL: no bridge on the page');
  await openWorkView(page);
  check(!(await bodyHas(POINT_MAP_STEP)), 'transform DOL: no first-step banner in Work View');
  await openHelp(page);
  check(await drawerShows(page, 'Ask my teacher'), 'transform DOL: Help keeps "Ask my teacher"');
  const text = await drawerText(page);
  check(!text.includes(BRIDGE) && !text.includes(BRIDGE_PLAIN) && !text.includes(POINT_MAP_STEP), 'transform DOL: Help holds no bridge and no step', text.slice(0, 200));
  check(!(await showHint(page).count()), 'transform DOL: Help offers no hint');
  await page.close();
}

// ----------------------------------------------------------------- Graphing2
{
  const page = await open('dol', 'graphing');
  check(/How to do this \(3 steps\)/.test(await taskCardSummary(page)), 'graphing DOL: the plotting directions stay on the card', await taskCardSummary(page));
  await openWorkView(page);
  await openHelp(page);
  check(await onFirstScreen(page, ask(page)), 'graphing DOL: "Ask my teacher" is on the drawer\'s first screen');
  await openDirections(page);
  check(await drawerShows(page, PLOT_STEP), 'graphing DOL: Help shows how to plot');
  check(!(await showHint(page).count()), 'graphing DOL: Help offers no hint');
  check(!/nearest|whole numbers/.test(await drawerText(page)), 'graphing DOL: the snap note does not hint at the line', (await drawerText(page)).slice(0, 200));
  await page.close();
}
{
  const page = await open('practice', 'graphing', 'server');
  await openWorkView(page);
  await openHelp(page);
  const toolHint = helpDrawer(page).getByRole('button', { name: /Stuck\? Show a hint/ });
  check(await drawerShows(page, 'Stuck? Show a hint'), 'graphing server-graded practice: the tool\'s own hints are the Help');
  check(!/Hints are not part of this activity/.test(await drawerText(page)), 'graphing server-graded practice: no "Hints are not part of this activity"', (await drawerText(page)).slice(0, 200));
  check(await onFirstScreen(page, toolHint), 'graphing server-graded practice: "Stuck? Show a hint" is on the drawer\'s first screen');
  await page.close();
}

// ------------------------------------------------- Matrix solve, Step Algebra
{
  const page = await open('dol', 'matrixSolve');
  const card = await page.locator('.mathmaster-tool-task-card').first().evaluate((node) => node.textContent || '');
  check(!/A⁻¹|How to do this/.test(card), 'matrixSolve DOL: the card names no route', card);
  await openWorkView(page);
  await openHelp(page);
  check(await drawerShows(page, 'Ask my teacher'), 'matrixSolve DOL: Help keeps "Ask my teacher"');
  const text = await drawerText(page);
  check(!/A⁻¹|matrix technology|About this tool|How to do this/.test(text), 'matrixSolve DOL: Help holds no description and no directions', text.slice(0, 200));
  await page.close();
}
{
  const page = await open('dol', 'balance', 'server');
  await openWorkView(page);
  await openHelp(page);
  // A server-graded host has no "Ask my teacher"; the platform's Help is its
  // DOL sentence, and the drawer is open on something.
  check(await drawerShows(page, 'Hints are not part of this activity'), 'balance DOL (server-graded): Help holds the platform\'s sentence');
  const text = await drawerText(page);
  check(!/inverse operations in reverse order/.test(text), 'balance DOL: the tool\'s method Help is not in Help', text.slice(0, 200));
  await page.close();
}
{
  const page = await open('practice', 'balance', 'server');
  await openWorkView(page);
  await openHelp(page);
  check(await drawerShows(page, 'inverse operations in reverse order'), 'balance practice: the tool\'s own Help stays, below the platform\'s');
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nWork View Help reaches the steps, the hints and Ask on a phone; a DOL shows no hint and no method.');
