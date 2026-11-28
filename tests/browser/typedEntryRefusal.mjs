// AN UNFINISHED OR OVER-LONG ENTRY CANNOT BE SUBMITTED, AND THE BOX SAYS WHY
// (#557, #558; the owner, 2026-11-19).
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/typedEntryRefusal.mjs
//
// A student, on a Chromebook and by touch on a phone, types into the real
// math editor on every typed-field surface (tests/browser/typedEntryRefusalMain.jsx):
// the assignment engine (a multi-answer box and a literal equation), My Math
// Path's own renderer, Test Cycle Corrections, a secure test, and a Live
// Challenge round (where a lock-in cannot be taken back).
//
//   `12 +`, `12·` (the × key)   the box says the answer is not finished, Submit
//                               (or Check) is held, Enter does nothing, and
//                               nothing is recorded: no try is used
//   more than 240 characters    the box says how long an answer may be; held
//                               the same way
//   `12`, `-12`                 nothing is said, and it submits
//   while typing                `12 +` on the way to `12 + 3` shows no warning
//
// In a secure test there is no per-question Submit: the draft is still saved
// as typed, and the box says the entry cannot be marked right as it stands.
//
// Two more, on the same page as the student meets them:
//
//   Live Challenge, a box that builds on an earlier one (SP-3): its label says
//   "your slope of the boundary line" before the slope has an answer, the
//   student's own slope once it has, and never a raw {slope}
//   a secure test, part by part ("Review all parts, then submit"): `12 +` in
//   a text box that names a number format keeps its part open (it is not an
//   answered line) and says it is not finished; an "Explain" box of words
//   takes `12 +` as written words, and says nothing
//
// Exits non-zero on any failure.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const DEVICES = [
  { name: 'Chromebook', options: { viewport: { width: 1366, height: 768 } }, touch: false },
  { name: 'phone', options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, touch: true },
];

// The action that records an answer on each surface, and what it costs.
const SURFACES = [
  { id: 'engine', name: 'assignment engine (multi-answer)', action: /^Submit — /, tries: true, right: '12' },
  // (`A/l+` would put the sign in the stacked fraction's denominator: the box is typed `Al+`.)
  { id: 'literal', name: 'assignment engine (literal)', action: /^Submit — /, tries: true, right: 'Al', unfinished: 'Al+' },
  { id: 'path', name: 'My Math Path', action: /^Check my answer$/, tries: true, right: '12' },
  { id: 'corrections', name: 'Corrections', action: /^Submit — /, tries: true, right: '12' },
  { id: 'secure', name: 'secure test', action: null, tries: false, right: '12' },
  // A lock-in is the round's one answer, not a try: the box says it cannot be locked in.
  { id: 'challenge', name: 'Live Challenge', action: /^Lock In Answer$/, tries: true, cost: /It cannot be locked in as it is\./, right: '12' },
];

const NOT_FINISHED = /This answer is not finished/;
const TOO_LONG = /longer than the 240 characters an answer box can keep/;
const NO_TRY = /It is not submitted, and no try is used\./;
const run = Date.now();
let pages = 0;

const open = async (context, surface) => {
  pages += 1;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/typedEntryRefusal.html?surface=${surface.id}&run=${run}-${pages}`, { waitUntil: 'networkidle' });
  const field = page.locator('math-field').first();
  await field.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => customElements.get('math-field'));
  return { page, field, errors };
};

const focus = async (device, field, page) => {
  if (device.touch) await field.tap(); else await field.click();
  await page.waitForTimeout(150);
};

const notices = (page) => page.evaluate(() => [...document.querySelectorAll('[data-typed-entry-notice]')].map((node) => node.textContent.trim()));
const state = async (page, surface) => {
  const action = surface.action ? page.getByRole('button', { name: surface.action }).first() : null;
  return {
    notices: await notices(page),
    typed: await page.locator('math-field').first().evaluate((element) => element.value),
    held: action ? await action.isDisabled() : null,
    submits: await page.evaluate(() => window.__mmSubmits.length),
    drafts: await page.evaluate(() => window.__mmDrafts.map((draft) => draft?.responses?.answer)),
  };
};

/** Type `keys` as a student does, wait for the entry to stand, and read the screen. */
const typeAndRead = async (context, device, surface, keys, { enter = true, value = null } = {}) => {
  const { page, field, errors } = await open(context, surface);
  await focus(device, field, page);
  if (value !== null) {
    // A paste: the editor takes the text whole (241 characters are not typed key by key).
    await field.evaluate((element, text) => { element.value = text; element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  } else {
    await page.keyboard.type(keys, { delay: 30 });
  }
  // Before the entry has stood: nothing is said yet (the sentence waits).
  const early = await notices(page);
  await page.waitForTimeout(1300);
  if (enter) {
    await focus(device, field, page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }
  const read = await state(page, surface);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return { page, early, errors, overflow, ...read };
};

for (const device of DEVICES) {
  const context = await browser.newContext(device.options);
  for (const surface of SURFACES) {
    const label = `${device.name}, ${surface.name}`;
    const unfinishedKeys = surface.unfinished || '12+';

    // 1. A sign left dangling.
    const unfinished = await typeAndRead(context, device, surface, unfinishedKeys);
    check(unfinished.typed.endsWith('+'), `${label}: the box holds ${JSON.stringify(unfinishedKeys)}`, JSON.stringify(unfinished.typed));
    check(unfinished.early.length === 0, `${label}: nothing is said while the entry is still being typed`, JSON.stringify(unfinished.early));
    check(unfinished.notices.length === 1 && NOT_FINISHED.test(unfinished.notices[0]), `${label}: the box says the answer is not finished`, JSON.stringify(unfinished.notices));
    if (surface.tries) {
      check((surface.cost || NO_TRY).test(unfinished.notices[0] || ''), `${label}: …and what that means here (${surface.cost ? 'it cannot be locked in' : 'no try is used'})`, JSON.stringify(unfinished.notices));
      check(unfinished.held === true, `${label}: the action that records an answer is held`, `disabled ${unfinished.held}`);
      check(unfinished.submits === 0, `${label}: nothing was submitted, by the button or by Enter`, `${unfinished.submits} submit(s)`);
    } else {
      check(/cannot be marked right/.test(unfinished.notices[0] || '') && !/try/.test(unfinished.notices[0] || ''), `${label}: the box says it cannot be marked right as it stands, and names no try`, JSON.stringify(unfinished.notices));
      check(unfinished.drafts.length > 0 && String(unfinished.drafts.at(-1)).endsWith('+'), `${label}: the draft is still saved as typed (nothing is lost)`, JSON.stringify(unfinished.drafts.slice(-1)));
      check(unfinished.submits === 0, `${label}: nothing is recorded per question`, `${unfinished.submits}`);
    }
    check(!unfinished.errors.length, `${label}: no page errors`, unfinished.errors.slice(0, 2).join(' | '));
    if (device.touch) check(unfinished.overflow <= 1, `${label}: the sentence causes no sideways scroll`, `${unfinished.overflow}px`);
    if (process.env.SCREENSHOT_DIR) await unfinished.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/typed-entry-unfinished-${surface.id}-${device.name.toLowerCase()}.png` });

    // …and finishing it clears the sentence and frees the action, on the same page.
    const { page } = unfinished;
    await focus(device, page.locator('math-field').first(), page);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
    const finished = await state(page, surface);
    check(finished.notices.length === 0, `${label}: the sentence goes once the sign is removed`, JSON.stringify(finished.notices));
    if (surface.action) {
      check(finished.held === false, `${label}: the finished answer can be submitted`, `disabled ${finished.held}`);
      const action = page.getByRole('button', { name: surface.action }).first();
      if (!finished.held) { if (device.touch) await action.tap(); else await action.click(); }
      await page.waitForFunction(() => window.__mmSubmits.length === 1, null, { timeout: 8000 }).catch(() => {});
      check((await page.evaluate(() => window.__mmSubmits.length)) === 1, `${label}: …and it is, once`);
    }
    await page.close();

    // 2. A product sign with nothing after it, from the editor's own × key (\cdot).
    if (surface.id !== 'literal') {
      const product = await typeAndRead(context, device, surface, '12*');
      check(product.notices.length === 1 && NOT_FINISHED.test(product.notices[0]), `${label}: 12× with nothing after it is not finished`, `typed ${JSON.stringify(product.typed)}, notices ${JSON.stringify(product.notices)}`);
      if (surface.tries) check(product.held === true && product.submits === 0, `${label}: …and is not submitted`, `disabled ${product.held}, ${product.submits} submit(s)`);
      await product.page.close();
    }

    // 3. Longer than an answer may be.
    const long = await typeAndRead(context, device, surface, null, { value: `${'1+'.repeat(120)}1` });
    check(long.typed.length > 240, `${label}: the box holds ${long.typed.length} characters`);
    check(long.notices.length === 1 && TOO_LONG.test(long.notices[0]), `${label}: the box says an answer keeps 240 characters`, JSON.stringify(long.notices));
    if (surface.tries) check(long.held === true && long.submits === 0 && (surface.cost || NO_TRY).test(long.notices[0] || ''), `${label}: …and it is not submitted; no try is used`, `disabled ${long.held}, ${long.submits} submit(s)`);
    if (device.touch) check(long.overflow <= 1, `${label}: a long entry's sentence causes no sideways scroll`, `${long.overflow}px`);
    await long.page.close();

    // 4. A finished answer is never held: a sign that opens it is no dangling sign.
    for (const keys of [surface.right, surface.id === 'literal' ? null : '-12'].filter(Boolean)) {
      const fine = await typeAndRead(context, device, surface, keys, { enter: false });
      check(fine.notices.length === 0, `${label}: ${keys} is said nothing about`, JSON.stringify(fine.notices));
      if (surface.action) check(fine.held === false, `${label}: ${keys} can be submitted`, `disabled ${fine.held}`);
      await fine.page.close();
    }
  }
  await context.close();
}

for (const device of DEVICES) {
  const context = await browser.newContext(device.options);

  // Live Challenge: the later box's label, before and after the slope.
  {
    const label = `${device.name}, Live Challenge follow-through`;
    const { page, field, errors } = await open(context, { id: 'challenge-follow' });
    // The later box's label as drawn: the innermost element that holds all of it.
    const later = () => page.evaluate(() => {
      const whole = (node) => /Using your slope of[\s\S]*write the inequality/.test(node.textContent || '');
      const holders = [...document.querySelectorAll('section *')].filter((node) => whole(node) && ![...node.children].some(whole));
      const node = holders[0];
      if (!node) return '';
      // Mathematics drawn by KaTeX keeps a hidden copy of its source: read the drawn text only.
      const copy = node.cloneNode(true);
      copy.querySelectorAll('.katex-mathml, annotation').forEach((hidden) => hidden.remove());
      return (copy.textContent || '').replace(/\s+/g, ' ').trim();
    });
    const before = await later();
    check(/Using your slope of your slope of the boundary line, write the inequality/.test(before), `${label}: before the slope has an answer the label says "your slope of the boundary line"`, JSON.stringify(before));
    await focus(device, field, page);
    await page.keyboard.type('-3', { delay: 30 });
    await page.waitForFunction(() => !/your slope of the boundary/.test(document.body.textContent), null, { timeout: 8000 }).catch(() => {});
    const after = await later();
    check(/Using your slope of\s*[-−]\s*3(?:\s*negative 3)?\s*,\s*write the inequality/.test(after), `${label}: once it has one the label carries the student's slope`, JSON.stringify(after));
    for (const [when, text] of [['before', before], ['after', after]]) {
      check(!/\{slope\}|\{|y\s*>/.test(text), `${label}: never a raw {slope} or a key (${when})`, JSON.stringify(text));
    }
    check(!errors.length, `${label}: no page errors`, errors.slice(0, 2).join(' | '));
    await page.close();
  }

  // A secure test, part by part.
  {
    const label = `${device.name}, secure test part by part`;
    pages += 1;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${ORIGIN}/tests/browser/typedEntryRefusal.html?surface=secure-parts&run=${run}-${pages}`, { waitUntil: 'networkidle' });
    const openPart = () => page.locator('[data-part-state="open"]').first();
    await openPart().waitFor({ timeout: 30000 });
    const box = () => openPart().locator('input[type="text"], textarea, math-field').first();
    const nextButton = () => openPart().getByRole('button', { name: /^(Next part|Review all parts)$/ });
    const fill = async (text) => {
      const input = box();
      if (device.touch) await input.tap(); else await input.click();
      await input.fill(text);
      await page.waitForTimeout(1300);
    };
    await fill('12 +');
    check((await openPart().getAttribute('data-part-id')) === 'total', `${label}: the number part is open`);
    check(await nextButton().isDisabled(), `${label}: \`12 +\` in a text box that names a number format does not let the part be passed`);
    const said = await notices(page);
    check(said.length === 1 && NOT_FINISHED.test(said[0]), `${label}: …and the box says it is not finished`, JSON.stringify(said));
    check((await page.locator('[data-part-state="answered"]').count()) === 0, `${label}: …and it is no answered line`);
    await fill('15');
    check(!(await nextButton().isDisabled()), `${label}: a finished number lets the part be passed`);
    if (device.touch) await nextButton().tap(); else await nextButton().click();
    await page.waitForFunction(() => document.querySelector('[data-part-state="open"]')?.getAttribute('data-part-id') === 'explain', null, { timeout: 8000 }).catch(() => {});
    await fill('12 +');
    check((await notices(page)).length === 0, `${label}: an "Explain" box of words takes \`12 +\` as written, and says nothing`, JSON.stringify(await notices(page)));
    check(!(await nextButton().isDisabled()), `${label}: …and lets its part be passed`);
    if (device.touch) await nextButton().tap(); else await nextButton().click();
    await page.getByRole('heading', { name: 'Review all parts, then submit' }).waitFor({ timeout: 8000 }).catch(() => {});
    const lines = await page.locator('[data-part-state="answered"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-part-value')));
    check(JSON.stringify(lines) === JSON.stringify(['15', '12 +']), `${label}: Review all parts, then submit lists both parts as answered`, JSON.stringify(lines));
    check(!errors.length, `${label}: no page errors`, errors.slice(0, 2).join(' | '));
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll typed entry refusal checks passed.');
process.exit(failures.length ? 1 : 0);
