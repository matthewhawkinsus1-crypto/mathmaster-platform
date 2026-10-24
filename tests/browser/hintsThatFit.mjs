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
// At 1366×900 and 390×844. Exits non-zero on any failure.

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

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} hint failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nhints that fit: the teacher\'s quoted hint is shown, the fallback fits and points to the teacher, and a DOL offers neither.');
