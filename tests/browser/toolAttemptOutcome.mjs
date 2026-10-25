// AFTER A TOOL'S CHECK, THE STUDENT SEES WHAT THE ATTEMPT COST — WHERE THEY ARE LOOKING.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/toolAttemptOutcome.mjs
//
// Platform quirks audit PQ-022. A registry tool's own verdict ("• Not yet")
// appears beside its Check button; QuestionEngine's authoritative outcome —
// "Not quite. You have 2 attempts remaining on this version." — was rendered
// below the whole tool, 357–403px below Check at 1366x768 and 180px below on a
// 390x844 phone: off screen every time. It now appears in the tool's result
// area, beside the verdict, when the tool has one.
//
// In the real QuestionEngine, App.jsx's wrappers and the real identity bar,
// with a record that counts attempts the way App.jsx does:
//   practice  inverse / investigation / regression / the representations
//             board: the outcome is inside the
//             tool, on screen, close below Check, in exactly one live region,
//             and the count goes down attempt by attempt; the final attempt
//             still gets QuestionEngine's closing box (the tool is read-only then).
//   revisited a question with an earlier attempt on its record keeps the
//             outcome on screen (it used to be cleared the instant it arrived).
//   server    a server-graded tool shows no verdict of its own, so the engine's
//             box stays — exactly one.
//   literal   an ordinary question keeps the engine's box — exactly one.
//   dol, quiz, test  nothing about correctness or attempts appears anywhere,
//             in the tool or below it, until feedback is released.
//   offers    (student pass 3, HELP-7 / A11Y-1) the live region also says the
//             tool's own coaching, and from the second miss offers the hint
//             the platform has ready, which opens the hint panel.
//   plotting  on Graphing, Enter on the plane says what it plotted, the count,
//             and which point a third plot replaced (since pass 3, TOOL-11, the
//             nearest one — the line is no longer restarted); Check's coaching
//             ("…other one is not…") is said with the outcome.
//   keypad    (TL23) a typed question's keypad offers π, e and logₐ only where
//             the item's math uses them, on practice; on a DOL every key stays.
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

const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const run = Date.now();
// The engine's words (student pass 3, D9): "tries", never "attempts … on this version".
const OUTCOME = /You have \d tr(?:y|ies) left|That was your (?:last|only) try|Correct! This question is complete/;

const open = async (device, role, tool, prior = 0) => {
  const context = await browser.newContext(DEVICES[device]);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${device}/${role}/${tool}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/toolAttemptOutcome.html?role=${role}&tool=${tool}&prior=${prior}&run=${run}-${device}-${role}-${tool}-${prior}`, { waitUntil: 'networkidle' });
  await page.locator(tool.startsWith('literal') ? '.mathmaster-question-tool-workspace' : '.mathmaster-tool-shell').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  return { context, page };
};

// A wrong attempt, the way a student makes one.
const attemptWrong = async (page, tool) => {
  if (tool === 'board') {
    // Submit the board with its parts still empty; it asks first.
    // The board's Submit says its cost (student pass 3, D9): "Submit — uses 1 of 3 tries".
    const submitBoard = page.getByRole('button', { name: /^Submit — / }).first();
    await submitBoard.scrollIntoViewIfNeeded();
    await submitBoard.click();
    const anyway = page.getByRole('button', { name: 'Submit anyway' });
    if (await anyway.count()) await anyway.first().click();
    return;
  }
  if (tool === 'literal') {
    const field = page.locator('.mathmaster-question-tool-workspace').locator('math-field, input').first();
    await field.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('8');
    await page.waitForTimeout(200);
    const submit = page.locator('button.mathmaster-bar-submit');
    await submit.click();
    return;
  }
  if (tool !== 'regression') {
    await page.evaluate(() => {
      const shell = document.querySelector('.mathmaster-tool-shell');
      const setValue = (element, value) => {
        const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };
      shell.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox])').forEach((element) => setValue(element, '99'));
      shell.querySelectorAll('select').forEach((element) => {
        const options = [...element.options].filter((option) => option.value);
        if (options.length) setValue(element, options[options.length - 1].value);
      });
    });
    await page.waitForTimeout(150);
  }
  const button = page.locator('.mathmaster-tool-shell button[data-mm-enter-action="submit"], .mathmaster-tool-shell button[data-primary-answer-action="true"]').first();
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await button.click();
};

// Where the outcome sentence is, and how many live regions carry it.
const outcomeState = (page) => page.evaluate((source) => {
  const pattern = new RegExp(source);
  const shell = document.querySelector('.mathmaster-tool-shell');
  const submit = shell?.querySelector('button[data-mm-enter-action="submit"], button[data-primary-answer-action="true"]')
    || [...(shell?.querySelectorAll('button') || [])].find((button) => /^Submit — /.test((button.textContent || '').trim()))
    || document.querySelector('button.mathmaster-bar-submit');
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const holders = [...document.querySelectorAll('div, p, span')].filter((element) => pattern.test(element.textContent || '') && visible(element));
  const innermost = holders.filter((element) => !holders.some((other) => other !== element && element.contains(other)));
  const live = [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')]
    .filter((element) => pattern.test(element.textContent || ''))
    .filter((element) => !element.parentElement?.closest('[role="status"], [role="alert"], [aria-live]'));
  const bar = document.querySelector('.portrait-action-bar, .mathmaster-desktop-action-bar, .landscape-action-bar');
  const barRect = bar?.getBoundingClientRect();
  const visibleBottom = barRect && barRect.height ? Math.min(window.innerHeight, barRect.top) : window.innerHeight;
  const first = innermost[0] || null;
  const rect = first?.getBoundingClientRect();
  const submitRect = submit?.getBoundingClientRect();
  return {
    count: innermost.length,
    text: (first?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 600),
    liveText: (live[0]?.textContent || '').trim().replace(/\s+/g, ' '),
    // The offer line also carries "See a similar problem worked" (HELP-9):
    // the hint offer is its "Show a hint" button.
    hintOffer: [...(shell?.querySelectorAll('.mathmaster-tool-attempt-outcome .mathmaster-tool-attempt-hint button') || [])].some((button) => button.textContent.trim() === 'Show a hint'),
    similarOffer: Boolean(shell?.querySelector('.mathmaster-tool-attempt-outcome .mathmaster-tool-attempt-hint button[data-similar-offer]')),
    inTool: Boolean(first && shell?.contains(first)),
    top: rect ? Math.round(rect.top) : null,
    bottom: rect ? Math.round(rect.bottom) : null,
    belowCheck: rect && submitRect ? Math.round(rect.top - submitRect.bottom) : null,
    onScreen: Boolean(rect && rect.top >= 0 && rect.bottom <= visibleBottom),
    visibleBottom: Math.round(visibleBottom),
    liveRegions: live.length,
    verdictPill: Boolean(shell && [...shell.querySelectorAll('.mathmaster-result-pill, span')].some((span) => /^(✓|•)\s/.test((span.textContent || '').trim()))),
    pageText: document.body.innerText,
  };
}, OUTCOME.source);

const waitForOutcome = (page) => page.waitForFunction((source) => new RegExp(source).test(document.body.innerText), OUTCOME.source, { timeout: 8000 }).catch(() => {});

// ------------------------------------------------------------------ practice
for (const device of ['chromebook', 'phone']) {
  const { context, page } = await open(device, 'practice', 'inverse');
  for (const [attempt, left] of [[1, '2 tries left.'], [2, '1 try left — your last one.']]) {
    await attemptWrong(page, 'inverse');
    await waitForOutcome(page);
    await page.waitForTimeout(300);
    const state = await outcomeState(page);
    check(state.text.includes(`You have ${left}`), `${device} practice inverse, wrong attempt ${attempt}: the outcome counts the attempt`, state.text);
    check(state.inTool, `${device} practice inverse, wrong attempt ${attempt}: the outcome is in the tool's result area`, `in tool: ${state.inTool}`);
    check(state.onScreen && state.belowCheck !== null && state.belowCheck <= 260, `${device} practice inverse, wrong attempt ${attempt}: on screen, close below Check`, `${state.belowCheck}px below Check, top ${state.top}, bottom ${state.bottom}, visible to ${state.visibleBottom}`);
    check(state.count === 1 && state.liveRegions === 1, `${device} practice inverse, wrong attempt ${attempt}: shown once, announced once`, `${state.count} shown, ${state.liveRegions} live`);
    // The tool knows four parts but this question asks two: only those are
    // named, and by names a student reads (toolSubmissionParts.js).
    check(/Focus on: [^.]*Domain restriction/.test(state.text) && !/\b(fog|gof)\b|∘/.test(state.text),
      `${device} practice inverse, wrong attempt ${attempt}: "Focus on" names only the asked parts, readably`, state.text);
    // The tool's own words are said with the outcome (A11Y-1).
    check(/tr(?:y|ies) left(?: — your last one)?\. (Neither composition|The arithmetic is right|The inverse value is off|\(g ∘ f\) is right|\(f ∘ g\) is right)/.test(state.liveText),
      `${device} practice inverse, wrong attempt ${attempt}: the live region says the tool's coaching with the outcome`, state.liveText.slice(0, 220));
    // From the second miss the hint the platform has ready is offered here (HELP-7).
    check(state.hintOffer === (attempt >= 2), `${device} practice inverse, wrong attempt ${attempt}: the hint offer ${attempt >= 2 ? 'is' : 'is not yet'} in the tool`, `offer: ${state.hintOffer}`);
    // Beside it on every miss, the worked sibling (HELP-9): this item has one.
    check(state.similarOffer, `${device} practice inverse, wrong attempt ${attempt}: "See a similar problem worked" is offered in the tool`);
    if (attempt === 2) {
      await page.locator('.mathmaster-tool-attempt-hint').getByRole('button', { name: 'Show a hint' }).click();
      await page.waitForTimeout(500);
      const panelOpen = await page.evaluate(() => [...document.querySelectorAll('[data-hint-panel] li[data-hint-source]')]
        .some((element) => element.getBoundingClientRect().height > 0));
      check(panelOpen, `${device} practice inverse, wrong attempt 2: "Show a hint" opens the first hint`);
    }
  }
  await attemptWrong(page, 'inverse');
  await waitForOutcome(page);
  await page.waitForTimeout(300);
  const closed = await outcomeState(page);
  check(/That was your last try \(3 in all\)/.test(closed.text) && closed.count === 1 && closed.liveRegions === 1, `${device} practice inverse, final attempt: the engine's closing box, once`, `${closed.text} (${closed.count} shown, ${closed.liveRegions} live)`);
  check(!/tr(?:y|ies) left/.test(closed.pageText), `${device} practice inverse, final attempt: no stale "remaining" sentence is left in the tool`);
  await context.close();
}

for (const tool of ['investigation', 'regression', 'board']) {
  for (const device of ['chromebook', 'phone']) {
    const { context, page } = await open(device, 'practice', tool);
    await attemptWrong(page, tool);
    await waitForOutcome(page);
    await page.waitForTimeout(300);
    const state = await outcomeState(page);
    check(state.text.includes('Not quite. You have 2 tries left.') && state.inTool && state.onScreen,
      `${device} practice ${tool}: the outcome is in the tool, on screen`, `${state.text} — in tool ${state.inTool}, ${state.belowCheck}px below Check, top ${state.top}/${state.visibleBottom}`);
    check(state.count === 1 && state.liveRegions === 1, `${device} practice ${tool}: shown once, announced once`, `${state.count} shown, ${state.liveRegions} live`);
    if (tool === 'board') check(!/Focus on/.test(state.text), `${device} practice board: the parts to revisit are not listed twice`, state.text);
    await context.close();
  }
}

// ------------------------------------------------------------------ plotting
for (const device of ['chromebook', 'phone']) {
  const { context, page } = await open(device, 'practice', 'graphing');
  const plane = page.locator('svg[role="application"]').first();
  await plane.scrollIntoViewIfNeeded();
  await plane.focus();
  const said = () => page.evaluate(() => (document.querySelector('.mathmaster-tool-shell p[aria-live="polite"].mm-sr-only')?.textContent || '').trim());
  // The crosshair starts at the origin: Enter plots (0, 0).
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  let words = await said();
  check(words === 'Plotted (0, 0). 1 of 2 points plotted.', `${device} graphing: Enter says what it plotted`, words);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  words = await said();
  check(/^Plot \(1, 0\)/.test(words), `${device} graphing: moving the crosshair reads its position again`, words);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  words = await said();
  check(words === 'Plotted (1, 0). 2 of 2 points plotted.', `${device} graphing: the second point is counted`, words);
  // y = 0 is not 2x + y = 4: Check, and the coaching is said with the outcome.
  // The construction's final action: "Submit — uses 1 of 3 tries" (D9).
  const checkButton = page.locator('.mathmaster-tool-shell button', { hasText: /^Submit — / }).first();
  await checkButton.scrollIntoViewIfNeeded();
  await checkButton.click();
  await waitForOutcome(page);
  await page.waitForTimeout(300);
  const state = await outcomeState(page);
  check(state.inTool && state.liveRegions === 1 && /tr(?:y|ies) left(?: — your last one)?\. \S/.test(state.liveText) && !/tr(?:y|ies) left(?: — your last one)?\.\s*$/.test(state.liveText),
    `${device} graphing, a wrong line: the live region says the tool's coaching with the outcome`, state.liveText.slice(0, 220));
  // A third plot replaces the nearest point, keeps the other, and says which went.
  await plane.focus();
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  words = await said();
  check(words === 'Plotted (0, 4). It replaced (0, 0). 2 of 2 points plotted.', `${device} graphing: a third point replaces the nearest one and says so`, words);
  await context.close();
}

// ------------------------------------------------------------ a right answer
{
  // The sample is f(x) = (x − 2)² − 1 restricted to its right branch, at x = 5:
  // f⁻¹(8) = 5. A correct attempt locks the tool (read-only), so the engine's
  // "Correct!" box announces it, exactly as before.
  const { context, page } = await open('chromebook', 'practice', 'inverse');
  await page.evaluate(() => {
    const shell = document.querySelector('.mathmaster-tool-shell');
    const setValue = (element, value) => {
      const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    shell.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox])').forEach((element) => setValue(element, '5'));
    shell.querySelectorAll('select').forEach((element) => setValue(element, 'right'));
  });
  await page.waitForTimeout(150);
  await page.locator('.mathmaster-tool-shell button[data-mm-enter-action="submit"]').first().click();
  await waitForOutcome(page);
  await page.waitForTimeout(400);
  const state = await outcomeState(page);
  check(/Correct! This question is complete/.test(state.text) && !state.inTool && state.count === 1 && state.liveRegions === 1,
    'chromebook practice inverse, a right answer: the engine\'s Correct box, once', `${state.text || '(nothing)'} — in tool ${state.inTool}, ${state.count} shown, ${state.liveRegions} live`);
  await context.close();
}

// ----------------------------------------------------------------- revisited
{
  const { context, page } = await open('chromebook', 'practice', 'inverse', 1);
  await attemptWrong(page, 'inverse');
  await waitForOutcome(page);
  await page.waitForTimeout(1500);
  const state = await outcomeState(page);
  check(state.text.includes('You have 1 try left — your last one.') && state.inTool && state.count === 1,
    'chromebook practice inverse, a question with an earlier attempt: the outcome arrives and stays', `${state.text || '(nothing)'} — ${state.count} shown`);
  await context.close();
}

// ------------------------------------------------- where the engine keeps its box
for (const tool of ['server', 'literal']) {
  const { context, page } = await open('chromebook', 'practice', tool);
  await attemptWrong(page, tool);
  await waitForOutcome(page);
  await page.waitForTimeout(400);
  const state = await outcomeState(page);
  check(/Not quite\. You have \d tr(?:y|ies) left/.test(state.text) && !state.inTool && state.count === 1 && state.liveRegions === 1,
    `chromebook practice ${tool}: the engine's own box, once`, `${state.text || '(nothing)'} — in tool ${state.inTool}, ${state.count} shown, ${state.liveRegions} live`);
  if (tool === 'server') check(!state.verdictPill, 'chromebook practice server: the tool shows no verdict of its own');
  await context.close();
}

// ------------------------------------------------------- outcomes withheld
for (const role of ['dol', 'quiz', 'test']) {
  const { context, page } = await open('chromebook', role, 'inverse');
  await attemptWrong(page, 'inverse');
  await page.waitForFunction(() => /Your answer is saved\. You will see whether it is right when /.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const state = await outcomeState(page);
  check(state.count === 0 && !/Not quite|attempts? remaining|Not yet|Correct!/.test(state.pageText) && !state.verdictPill,
    `chromebook ${role} inverse: nothing about correctness or attempts left, in the tool or below it`, state.count ? state.text : '');
  check(/Your answer is saved\. You will see whether it is right when /.test(state.pageText), `chromebook ${role} inverse: the submission is acknowledged`);
  await context.close();
}
{
  const { context, page } = await open('chromebook', 'dol', 'board');
  await attemptWrong(page, 'board');
  await page.waitForFunction(() => /Your answer is saved\. You will see whether it is right when /.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const state = await outcomeState(page);
  check(state.count === 0 && !/Not quite|attempts? remaining|Correct!/.test(state.pageText),
    'chromebook dol board: no attempt outcome, in the board or below it', state.count ? state.text : '');
  await context.close();
}

// ------------------------------------------------- π, e and logₐ (TL23)
// A keypad offers π, e and logₐ only where the item's math uses them — on
// practice. An assessment item keeps every key: its keypad says nothing about
// the form of the answer.
const keypadKeys = async (page) => {
  await page.locator('.mathmaster-question-tool-workspace math-field').first().click();
  await page.waitForTimeout(250);
  const keypad = page.locator('[role="toolbar"][aria-label="Math tools"]').first();
  if (!(await keypad.count())) {
    await page.locator('.mathmaster-math-tools-toggle').first().click();
    await keypad.waitFor({ timeout: 5000 });
  }
  return keypad.locator('button').evaluateAll((buttons) => buttons.map((button) => button.textContent.trim()));
};
const CONSTANT_KEYS = ['π', 'e', 'logₐ'];
for (const device of ['chromebook', 'phone']) {
  for (const [role, tool, expected] of [['practice', 'literal', []], ['practice', 'literalPi', ['π']], ['dol', 'literal', CONSTANT_KEYS]]) {
    const { context, page } = await open(device, role, tool);
    const keys = await keypadKeys(page);
    const shown = CONSTANT_KEYS.filter((key) => keys.includes(key));
    check(JSON.stringify(shown) === JSON.stringify(expected) && keys.includes('√') && keys.includes('a⁄b'),
      `${device} ${role} ${tool}: the keypad offers ${expected.length ? expected.join(', ') : 'none of π, e, logₐ'} (and keeps √ and a⁄b)`, keys.join(' '));
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nEvery attempt outcome is shown once, where the student is looking, and only where the activity allows it.');
