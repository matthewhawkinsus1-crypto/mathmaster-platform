// A QUESTION CLOSED FROM ANOTHER TAB SHOWS THE ANSWER THAT WAS RECORDED.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/staleTabRecord.mjs
//
// QA round 2 (R2-m3), on the real QuestionEngine and its real draft storage,
// two tabs of one browser (one localStorage), with the question record shared
// between them the way App.jsx's snapshot listener shares it
// (staleTabRecordMain.jsx). The steps:
//
//   1. open DOL "Solve 5x − 5 = 20" in tab 1, then in tab 2 — tab 1 pauses;
//   2. type 7 in tab 2 and do NOT submit;
//   3. in tab 1 press "Continue here", replace the answer with 5, Submit.
//
// Tab 2 is now paused, holding its own unsubmitted 7, and receives a record
// that says the question is closed. It used to go on showing 7 under
// "✓ CORRECT / Question complete" (a reload showed 5). The closed view must
// show the RECORDED answer (5), and 7 must never be written back to storage.
// Checked at a desktop (1366x768) and a phone (390x844) viewport. Exits
// non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== '' ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail !== '' ? `: ${detail}` : ''}`);
};

const field = (page) => page.locator('math-field').first();
const value = (page) => page.evaluate(() => document.querySelector('math-field')?.value ?? null);
const paused = (page) => page.locator('[data-active-work-paused]').isVisible().catch(() => false);
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const stored = (page) => page.evaluate(() => window.__staleTab.drafts());
const draftLog = (page) => page.evaluate(() => window.__staleTab.draftLog());
const record = (page) => page.evaluate(() => window.__staleTab.record());
const grades = (page) => page.evaluate(() => window.__staleTab.grades());

// Whether any stored draft value of this question carries `answer` as the
// student's response. Drafts hold the answer in assorted envelopes, so this
// looks for the value as a JSON string or a bare string anywhere in it.
const draftHolds = (raw, answer) => {
  const text = String(raw ?? '');
  return text.includes(`"${answer}"`) || text.includes(`\\"${answer}\\"`) || text === answer;
};

const runViewport = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport });
  const url = `${ORIGIN}/tests/browser/staleTabRecord.html?run=stale-${tag}-${Date.now()}`;
  const open = async () => {
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      // Pre-existing and outside this check: MathLive's own blur handler reads
      // a model whose math field "Continue here" has just unmounted
      // (atomToString -> options). Reported, not counted; any other error fails.
      const stack = String(error.stack || '');
      if (/reading 'options'/.test(error.message) && /mathlive/i.test(stack) && /onBlur/.test(stack)) {
        console.log(`note [${tag}] known MathLive blur-after-unmount error (not counted)`);
        return;
      }
      check(false, `[${tag}] no page error`, `${error.message} ${stack.slice(0, 600)}`);
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await field(page).waitFor();
    await page.waitForTimeout(800);
    return page;
  };
  const replaceWith = async (page, text) => {
    await field(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text);
    await page.waitForTimeout(700);
  };

  const tab1 = await open();
  const tab2 = await open();
  await tab1.bringToFront();
  await tab1.locator('[data-active-work-paused]').waitFor({ timeout: 10000 }).catch(() => {});
  check(await paused(tab1), `[${tag}] tab 1 pauses when tab 2 opens the question`);
  check(!(await paused(tab2)), `[${tag}] tab 2 works on it`);

  await tab2.bringToFront();
  await replaceWith(tab2, '7');
  check(await value(tab2) === '7', `[${tag}] tab 2 holds its unsubmitted 7`, await value(tab2));

  await tab1.bringToFront();
  await tab1.getByRole('button', { name: 'Continue here' }).click();
  await field(tab1).waitFor();
  await tab1.waitForTimeout(800);
  check(!(await paused(tab1)), `[${tag}] tab 1 continues`);
  await replaceWith(tab1, '5');
  check(await value(tab1) === '5', `[${tag}] tab 1 answers 5`, await value(tab1));
  // Every write from here on is watched: 7 must never be stored again.
  const logBefore = (await draftLog(tab1)).length;
  await tab1.getByRole('button', { name: /^submit/i }).first().click();
  await tab1.waitForFunction(() => window.__staleTab.record()?.status === 'correct', null, { timeout: 10000 }).catch(() => {});
  const closed = await record(tab1);
  check(closed?.status === 'correct', `[${tag}] the record closes as correct`, closed?.status);
  const graded = await grades(tab1);
  check(graded.length === 1 && graded[0].isCorrect === true, `[${tag}] exactly one attempt was graded, correct`, JSON.stringify(graded.map((g) => g.isCorrect)));

  // Tab 2 receives the closed record while still paused with 7 on screen.
  // Wait for the outcome, not a clock (review of #463): the closed view and a
  // settled math field, or the 10 s budget.
  await tab2.bringToFront();
  await tab2.waitForFunction(() => /question complete|correct/i.test(document.body.innerText)
    && document.querySelector('math-field')?.value === '5', null, { timeout: 10000 }).catch(() => {});
  const tab2Text = await bodyText(tab2);
  check(/question complete|correct/i.test(tab2Text), `[${tag}] tab 2 shows the question closed`);
  check(await value(tab2) === '5', `[${tag}] tab 2's closed view shows the RECORDED answer, 5`, await value(tab2));
  check(await value(tab2) !== '7', `[${tag}] tab 2 no longer shows its unsubmitted 7 under the verdict`, await value(tab2));

  // Storage: nothing written after the submit carries 7, and what is stored now is 5.
  // Give a late draft write (debounced) its chance to happen before reading.
  await tab2.waitForTimeout(800);
  const later = (await draftLog(tab2)).slice(logBefore);
  const rewrites = later.filter((entry) => draftHolds(entry.value, '7'));
  check(rewrites.length === 0, `[${tag}] storage is never rewritten with 7 after the submit`, rewrites.map((entry) => entry.key).join(', '));
  const now = await stored(tab2);
  const holding7 = Object.entries(now).filter(([key, raw]) => !key.includes(':draft-log') && draftHolds(raw, '7'));
  check(holding7.length === 0, `[${tag}] no stored draft holds 7`, holding7.map(([key]) => key).join(', '));
  check((await record(tab2))?.status === 'correct' && (await grades(tab2)).length === 1, `[${tag}] the record and the grade are unchanged`);

  // A reload agrees with what tab 2 now shows.
  const reloaded = await open();
  check(await value(reloaded) === '5', `[${tag}] a reload shows 5 too`, await value(reloaded));
  await context.close();
};

await runViewport({ width: 1366, height: 768 });
await runViewport({ width: 390, height: 844 });

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} stale-tab failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nstale tab: a question closed from another tab shows the answer that was recorded.');
