// HINTS THAT FIT (student pass 3, HELP-16 and HELP-23), in the real
// QuestionEngine on real lesson questions.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/hintsThatFit.mjs
//
// HELP-16  Algebra I M2 T2 L2, Warm-Up 2: the teacher's first hint, "The
//          x-intercept is where the output is 0: solve 0 = 3x − 8.", was
//          dropped because 3 is the slope. It is now the first hint shown.
// HELP-23  Algebra II 3×3 Systems Day 2, Warm-Up 2 (two choices, no hint of its
//          own): the fallback is about choosing, not "keep the two sides
//          equal", and the panel points to "Ask my teacher" above the button.
// Policy   The same two questions on a DOL: no hint, no fallback, no pointer —
//          only the Ask-only panel.
// At 1366×900 and 390×844.
// Timing   (hint-ladder timing) "Show a hint" pressed while a registry tool is
//          still loading (its module held): the panel says the hint is
//          loading, then shows the tool's first rung, the one a press a second
//          later opens, counted once; on the Polynomial Workshop and the
//          Systems Workspace, at 1366×768 and 390×844 by touch. A load slower
//          than the panel's wait, and one that fails, still open a hint.
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const X_INTERCEPT = 'The x-intercept is where the output is 0: solve 0 = 3x − 8.';
const CHOICE_FALLBACK = 'Read each choice all the way through before you pick one.';
const EQUATION_FALLBACK = 'keep the two sides (or the quantities) equal';
const POINTER = 'These hints are general, not written for this question. For help with this one, ask your teacher with the button below.';

const run = Date.now();
const open = async (context, lesson, q, role = '') => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${lesson}/${q}/${role}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/hintsThatFit.html?lesson=${lesson}&q=${q}${role ? `&role=${role}` : ''}&run=${run}`, { waitUntil: 'networkidle' });
  // Something the question renders in the same pass as the help controls.
  await page.locator('button', { hasText: '↺ Start question over' }).first().waitFor({ state: 'attached', timeout: 20000 });
  return page;
};
const openHints = async (page) => {
  await page.locator('button:visible', { hasText: '💡 Hint' }).first().click();
  await page.locator('[data-hint-panel]:visible').first().waitFor({ timeout: 8000 });
  return page.locator('[data-hint-panel]:visible').first();
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);

for (const [name, viewport] of [['chromebook', { width: 1366, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, ...(name === 'phone' ? { isMobile: true, hasTouch: true } : {}) });

  // ---------------------------------------------------------------- HELP-16
  {
    const page = await open(context, 'l2', 'l2-wu-2');
    const panel = await openHints(page);
    const sources = await panel.getAttribute('data-hint-sources');
    check(sources === 'authored authored authored', `${name} L2 WU 2: all three of the teacher's hints are in the ladder`, sources);
    await panel.getByRole('button', { name: /^Show a hint$/ }).click();
    const first = await panel.locator('li[data-hint-source]').first().innerText().catch(() => '');
    check(first.includes(X_INTERCEPT), `${name} L2 WU 2: the first hint is the teacher's x-intercept hint`, first.slice(0, 120));
    check(!(await panel.locator('[data-hint-fallback-ask]').count()), `${name} L2 WU 2: no "general hints" pointer where the teacher's hints fit`);
    await page.close();
  }

  // ---------------------------------------------------------------- HELP-23
  {
    const page = await open(context, 'day2', '3x3-d2-wu-2');
    const panel = await openHints(page);
    const sources = await panel.getAttribute('data-hint-sources');
    check(sources === 'generic generic', `${name} 3×3 Day 2 WU 2: only fallbacks are left`, sources);
    await panel.getByRole('button', { name: /^Show a hint$/ }).click();
    const first = await panel.locator('li[data-hint-source]').first().innerText().catch(() => '');
    check(first.includes(CHOICE_FALLBACK), `${name} 3×3 Day 2 WU 2: the fallback is about choosing`, first.slice(0, 120));
    check(!(await bodyText(page)).includes(EQUATION_FALLBACK), `${name} 3×3 Day 2 WU 2: no "keep the two sides equal"`);
    const pointer = panel.locator('[data-hint-fallback-ask]');
    check(await pointer.isVisible().catch(() => false) && (await pointer.innerText()).includes(POINTER), `${name} 3×3 Day 2 WU 2: the panel points to Ask my teacher`);
    const ask = panel.getByRole('button', { name: /Ask my teacher/ });
    const [pointerBox, askBox] = [await pointer.boundingBox(), await ask.boundingBox()];
    check(Boolean(pointerBox && askBox && pointerBox.y < askBox.y), `${name} 3×3 Day 2 WU 2: the pointer is above the button it names`, JSON.stringify({ pointer: pointerBox?.y, ask: askBox?.y }));
    await ask.click();
    check((await page.evaluate(() => window.__mmHelp)).includes(true), `${name} 3×3 Day 2 WU 2: "Ask my teacher" raises the hand`);
    await page.close();
  }

  // -------------------------------------------- the policy: nothing on a DOL
  for (const [lesson, q, hint] of [['l2', 'l2-wu-2', X_INTERCEPT], ['day2', '3x3-d2-wu-2', CHOICE_FALLBACK]]) {
    const page = await open(context, lesson, q, 'dol');
    const hintBar = page.locator('button:visible', { hasText: '💡 Hint' });
    if (await hintBar.count()) await hintBar.first().click();
    await page.waitForTimeout(300);
    const text = await bodyText(page);
    // Not vacuous: the question and its Ask-only panel are on screen.
    check((await page.getByRole('button', { name: /Ask my teacher/ }).count()) > 0, `${name} DOL ${q}: the Ask-only panel is there`);
    check(!text.includes(hint), `${name} DOL ${q}: no hint text anywhere`);
    check(!text.includes(POINTER), `${name} DOL ${q}: no "general hints" pointer`);
    check(!(await page.getByRole('button', { name: /^Show a hint$/ }).count()) && !(await page.locator('[data-hint-panel] li[data-hint-source]').count()), `${name} DOL ${q}: no hint is offered`);
    await page.close();
  }
  await context.close();
}

// ------------------------------------- a press as the tool mounts (hint-ladder timing)
// A registry tool's chunk loads after the question, and it hands its rungs to
// the ladder once it has mounted. Pressed before then, "Show a hint" opened the
// generic first rung. Here each tool's module is held until the press is made:
// the panel says the hint is loading (never a fallback), and once the tool is
// there the hint is the one a press a second later opens, counted once, with
// the same help remembered for the attempt (supportUseMemory.js). Two tools,
// each item with no hints of its own: a Recovery version of Operations on
// Polynomials' exit ticket (the Polynomial Workshop) and 3×3 Systems Day 1
// CW 1 (the Systems Workspace). A load slower than the panel's wait, and one
// that fails, still open a hint for the press.
const FAST_TOOLS = [
  { name: 'Polynomial Workshop', lesson: 'recovery', q: 'polynomials.subtractMissingTerm', module: /\/src\/tools\/polynomialWorkshop\/PolynomialWorkshop\.jsx(\?|$)/ },
  { name: 'Systems Workspace', lesson: 'day1', q: '3x3-d1-cw-1', module: /\/src\/tools\/systemsWorkspace\/SystemsWorkspace\.jsx(\?|$)/ },
];
const FALLBACK_TEXTS = Object.values((await import('../../src/platform/supports/hints/questionHints.js')).FALLBACK_HINTS).flat();
const { PENDING_RUNG_TEXT: LOADING } = await import('../../src/platform/supports/hints/hintCopy.js');
// The panel on screen (Work View's Help holds a hidden copy of it), and each
// rung's own words: its first child (the hint, or the loading line), not the
// Read aloud and Translate buttons after it.
const rungs = (page) => page.evaluate(() => [...document.querySelectorAll('[data-hint-panel]')]
  .filter((panel) => panel.offsetWidth || panel.offsetHeight)
  .flatMap((panel) => [...panel.querySelectorAll('li[data-hint-source]')])
  .map((item) => ({ source: item.dataset.hintSource, text: (item.firstElementChild || item).textContent.trim() })));
const firstSourceIs = (page, test) => page.waitForFunction(
  (wanted) => {
    const panel = [...document.querySelectorAll('[data-hint-panel]')].find((candidate) => candidate.offsetWidth || candidate.offsetHeight);
    const source = panel?.querySelector('li[data-hint-source]')?.dataset.hintSource;
    return Boolean(source) && (wanted.not ? source !== wanted.not : source === wanted.is);
  },
  test,
  { timeout: 15000 },
).catch(() => {});
const remembered = (page) => page.evaluate(() => {
  const draft = document.querySelector('[data-hints-draft]')?.dataset.hintsDraft;
  try { return JSON.parse(localStorage.getItem(`mathmaster:support-use:${draft}`) || 'null'); } catch { return null; }
});
const toolMounted = (page) => page.waitForFunction(() => !document.querySelector('.mathmaster-work-view-loading') && document.querySelector('[data-work-view-area]'), null, { timeout: 30000 });
const offerButton = (page) => page.locator('[data-first-hint-offer]').getByRole('button', { name: /^Show a hint$/ });
const press = (page, touch) => (touch ? offerButton(page).tap() : offerButton(page).click());
const firstRung = async (page) => {
  await firstSourceIs(page, { not: '' });
  return (await rungs(page))[0] || { source: '', text: '' };
};
const pageFor = async (context, tool, label, hold = null) => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${label}: page error ${error.message}`));
  if (hold) await page.route(tool.module, hold);
  await page.goto(`${ORIGIN}/tests/browser/hintsThatFit.html?lesson=${tool.lesson}&q=${tool.q}&role=practice&run=${run}-${label.replace(/\W+/g, '-')}`, { waitUntil: hold ? 'domcontentloaded' : 'networkidle' });
  await offerButton(page).waitFor({ timeout: 30000 });
  return page;
};
// The module is answered only when `release` is called, or aborted.
const held = () => {
  let release;
  let abort = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const state = { requested: false };
  return {
    state,
    release: () => release(),
    abort: () => { abort = true; release(); },
    hold: async (route) => { state.requested = true; await gate; await (abort ? route.abort() : route.continue()); },
  };
};

for (const [size, viewport] of [['laptop', { width: 1366, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  const touch = size === 'phone';
  const context = await browser.newContext({ viewport, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  for (const tool of FAST_TOOLS) {
    const label = `${size} ${tool.name}`;
    // A second later: the tool has mounted, and the press opens its first rung.
    const late = await pageFor(context, tool, `${label} late`);
    await toolMounted(late);
    await late.waitForTimeout(300);
    await press(late, touch);
    const lateRung = await firstRung(late);
    const lateUse = await remembered(late);
    check(lateRung.source === 'tool' && !FALLBACK_TEXTS.includes(lateRung.text), `${label}: a press after the tool has mounted opens the tool's own first rung`, JSON.stringify(lateRung).slice(0, 160));
    await late.close();

    // As it mounts: the press is made while the tool's module is held.
    const gate = held();
    const fast = await pageFor(context, tool, `${label} fast`, gate.hold);
    check(gate.state.requested && await fast.locator('.mathmaster-work-view-loading').count() > 0, `${label}: the press is made before the tool has mounted`);
    await press(fast, touch);
    await fast.waitForTimeout(250);
    const during = await rungs(fast);
    check(during.length === 1 && during[0].source === 'pending' && during[0].text === LOADING, `${label}: while it loads, the hint pressed for says it is loading`, JSON.stringify(during).slice(0, 200));
    check(!FALLBACK_TEXTS.some((text) => during.some((rung) => rung.text.includes(text))) && !(await fast.locator('[data-hint-fallback-ask]').count()), `${label}: no general hint and no "general hints" pointer while the tool's rungs are on their way`);
    gate.release();
    await toolMounted(fast);
    await firstSourceIs(fast, { not: 'pending' });
    const after = await rungs(fast);
    check(after.length === 1 && after[0].source === 'tool' && after[0].text === lateRung.text, `${label}: once the tool is there, the hint is the one a press a second later opens`, JSON.stringify({ after, late: lateRung.text }).slice(0, 240));
    const fastUse = await remembered(fast);
    check(fastUse?.hintUsed === true && fastUse?.hintsRevealed === 1 && JSON.stringify(fastUse) === JSON.stringify(lateUse), `${label}: the press is counted once, the same help remembered as for a later press`, JSON.stringify({ fastUse, lateUse }));
    check(await fast.locator('[data-hint-panel]:visible [data-hint-cost-note]').first().innerText().catch(() => '') === 'Hints never lower your grade. Your teacher can see you used one.', `${label}: the cost is said as for every hint`);
    await fast.close();
  }

  // Slower than the panel's wait: the fallback is shown then, and read again
  // as the tool's rung once the tool arrives; the press is not lost.
  const workshop = FAST_TOOLS[0];
  const slowGate = held();
  const slow = await pageFor(context, workshop, `${size} slow`, slowGate.hold);
  await press(slow, touch);
  await slow.waitForTimeout(4600);
  const waited = await rungs(slow);
  check(waited.length === 1 && waited[0].source === 'generic' && FALLBACK_TEXTS.includes(waited[0].text), `${size} slow load: after the wait, the panel shows the hint the ladder has`, JSON.stringify(waited).slice(0, 200));
  slowGate.release();
  await toolMounted(slow);
  await firstSourceIs(slow, { is: 'tool' });
  const reread = await rungs(slow);
  check(reread.length === 1 && reread[0].source === 'tool', `${size} slow load: once the tool arrives, the hint is read again as its first rung`, JSON.stringify(reread).slice(0, 200));
  await slow.close();

  // A tool that fails to load has no rungs to wait for: the press opens the fallback.
  const failGate = held();
  const failing = await pageFor(context, workshop, `${size} failing`, failGate.hold);
  await press(failing, touch);
  failGate.abort();
  await firstSourceIs(failing, { is: 'generic' });
  const failed = await rungs(failing);
  check(failed.length === 1 && failed[0].source === 'generic', `${size} failed load: the press still opens a hint`, JSON.stringify(failed).slice(0, 200));
  await failing.close();
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} hint failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nhints that fit: the teacher\'s quoted hint is shown, the fallback fits and points to the teacher, and a DOL offers neither.');
