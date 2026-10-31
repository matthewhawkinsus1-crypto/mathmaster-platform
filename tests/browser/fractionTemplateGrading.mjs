// A FRACTION KEY DRAWN FROM A TEMPLATE IS GRADED BY ONE RULE (B-57).
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/fractionTemplateGrading.mjs
//
// "Simplify {{an}}/{{bn}}." with the key {{a}}/{{b}} draws 2/4 for one student
// and 1/2 for another. An authored key asks for lowest terms only when the
// author wrote it in lowest terms, and that rule used to read the draw as the
// author's choice: a student whose key came out 2/4 could type the 4/8 they
// were shown and be marked right, while a classmate was held to lowest terms.
// tests/platform/fractionQuestion.test.mjs covers the rule; this is a student
// in the real QuestionEngine and MathLive: it reads the question on screen,
// types into the math field, presses Submit Answer and reads what the engine
// graded. For a Question Family version, a Path-style template's version, and
// a question the author wrote (whose own rule is unchanged); on a Chromebook
// and by touch on a phone. It reads the prompt as the student does, too: the
// fraction stacked and the sentence's full stop after it, not in the
// denominator (B-58).
//
// Exits non-zero on any failure.
import { generateQuestion } from '../../src/problemGenerator.js';
import { familyContextFor, generationKeyFor, questionFor } from './fractionTemplateGradingFixture.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fractionOf = (text) => String(text).split('/').map(Number);
const lowest = (text) => {
  const [numerator, denominator] = fractionOf(text);
  const divisor = gcd(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
};

// The version a seat draws, exactly as QuestionEngine draws it.
const versionFor = (kind, seat) => generateQuestion(questionFor(kind), generationKeyFor(seat), null, null, familyContextFor(kind));
// The first seat whose key comes out reduced, and the first whose key does not.
const seatsFor = (kind) => {
  let reduced = null;
  let unreduced = null;
  for (let seat = 0; seat < 200 && (reduced === null || unreduced === null); seat += 1) {
    const version = versionFor(kind, seat);
    const isReduced = version.answer === lowest(version.answer);
    if (isReduced && reduced === null) reduced = seat;
    if (!isReduced && unreduced === null) unreduced = seat;
  }
  return { reduced, unreduced };
};

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const DEVICES = [
  { name: 'Chromebook', options: { viewport: { width: 1366, height: 768 } }, touch: false },
  { name: 'phone', options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, touch: true },
];

const run = Date.now();
let pageCount = 0;

/**
 * One student answer, on a fresh page: type `answer` into the math field the
 * way a student does and submit it. Returns what was on screen and what the
 * engine graded.
 */
const answerOnce = async (context, device, { kind, seat }, answer, { screenshot = null } = {}) => {
  pageCount += 1;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/fractionTemplateGrading.html?kind=${kind}&seat=${seat}&run=${run}-${pageCount}`, { waitUntil: 'networkidle' });
  const field = page.locator('math-field').first();
  await field.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => customElements.get('math-field'));
  // The prompt as the student reads it: its prose, with each math element as
  // ⟨latex⟩ where it sits in the sentence.
  const prompt = await page.evaluate(() => {
    const card = document.querySelector('.mathmaster-question-prompt');
    if (!card) return '';
    const copy = card.cloneNode(true);
    // What the eye reads: MathDisplay's visually hidden spoken copy ("9 over
    // 18", for screen readers) is not on the screen.
    copy.querySelectorAll('.mm-math-spoken').forEach((node) => node.remove());
    copy.querySelectorAll('math-span, math-div').forEach((node) => node.replaceWith(`⟨${node.textContent.trim()}⟩`));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  });
  if (device.touch) await field.tap();
  else await field.click();
  await page.waitForTimeout(150);
  if (typeof answer === 'string') {
    await page.keyboard.type(answer, { delay: 30 });
  } else {
    // A mixed number as a student builds it: the whole number, then the a/b
    // fraction template (the keypad key when the screen shows one, else the
    // same insert the key runs), the numerator, then the denominator.
    await page.keyboard.type(answer.whole, { delay: 30 });
    const key = page.getByRole('button', { name: 'Insert stacked fraction' }).first();
    if (await key.isVisible().catch(() => false)) {
      if (device.touch) await key.tap(); else await key.click();
    } else {
      await field.evaluate((element) => element.executeCommand(['insert', '\\frac{#0}{#?}']));
    }
    await page.keyboard.type(answer.numerator, { delay: 30 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type(answer.denominator, { delay: 30 });
  }
  await page.waitForTimeout(250);
  const typed = await field.evaluate((element) => element.value);
  // What the screen says about the answer before it is submitted (a shape
  // or form reason, answerShapeGuard).
  const notice = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent.trim()).filter(Boolean).join(' | '));
  if (screenshot && process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${screenshot}`, fullPage: false });
  const submit = page.getByRole('button', { name: /^Submit — / }).first();
  // A response that is not ready keeps Submit disabled: pressing it spends nothing.
  const submitDisabled = await submit.isDisabled();
  if (!submitDisabled) {
    if (device.touch) await submit.tap();
    else await submit.click();
    await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 8000 }).catch(() => {});
  }
  const graded = await page.evaluate(() => window.__mmGraded);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.close();
  return { prompt, typed, notice, graded, submitDisabled, errors, overflow };
};

for (const device of DEVICES) {
  const context = await browser.newContext(device.options);
  for (const kind of ['family', 'template']) {
    const seats = seatsFor(kind);
    check(seats.reduced !== null && seats.unreduced !== null, `${device.name} ${kind}: the template draws both a reduced and an unreduced key`, JSON.stringify(seats));
    for (const seat of [seats.unreduced, seats.reduced]) {
      if (seat === null) continue;
      const version = versionFor(kind, seat);
      const shown = version.prompt.match(/^Simplify (\d+\/\d+)\.$/)?.[1];
      const shownPrompt = `Simplify ⟨\\frac{${shown.replace('/', '}{')}}⟩.`;
      const label = `${device.name} ${kind} "${version.prompt}" (key ${version.answer})`;
      const cases = [
        [shown, false, 'the fraction it asked to simplify is not an answer'],
        [lowest(version.answer), true, 'lowest terms is right'],
      ];
      if (version.answer !== lowest(version.answer)) cases.push([version.answer, true, 'its own key is right']);
      for (const [answer, expected, meaning] of cases) {
        const result = await answerOnce(context, device, { kind, seat }, answer);
        check(result.prompt.endsWith(shownPrompt), `${label}: the student is shown this version, the fraction stacked and the full stop after it (B-58)`, result.prompt);
        check(result.graded?.isCorrect === expected, `${label}: ${answer} — ${meaning}`, `graded ${JSON.stringify(result.graded?.isCorrect)}, typed ${JSON.stringify(result.typed)}`);
        check(!result.errors.length, `${label}: ${answer} — no page errors`, result.errors.slice(0, 2).join(' | '));
        if (device.touch) check(result.overflow <= 1, `${label}: ${answer} — no sideways scroll`, `${result.overflow}px`);
      }
    }
  }
  // A key the author wrote keeps the author's rule: 2/4 asked for no lowest terms.
  for (const [answer, expected] of [['4/8', true], ['1/2', true], ['3/8', false]]) {
    const result = await answerOnce(context, device, { kind: 'authored', seat: 0 }, answer);
    check(result.prompt.endsWith('Simplify ⟨\\frac{4}{8}⟩.'), `${device.name} authored: the prompt reads "Simplify 4/8." with the full stop after the fraction`, result.prompt);
    check(result.graded?.isCorrect === expected, `${device.name} authored "Simplify 4/8." (key 2/4): ${answer} is ${expected ? 'right' : 'wrong'}`, `graded ${JSON.stringify(result.graded?.isCorrect)}, typed ${JSON.stringify(result.typed)}`);
  }
  // A mixed number, typed as a student types 3½ with the fraction template
  // (student pass 3, wave 7). "Simplify 14/4." asks for lowest terms, and a
  // mixed number whose fraction part is reduced and less than one is in lowest
  // terms (GR13, the owner's wave-7 decisions): 3½ is right and nothing holds
  // it. Only a mixed number that is not in lowest terms (3 2/4) is held, with
  // the reason, before a try is spent. An authored sum takes 3½.
  const REASON = 'In a mixed number, the fraction part must be in lowest terms and less than one.';
  // Typed `3 1/2` is the mixed number 3½ in the editor (GR33): the space after
  // the whole number is remembered, so the slash takes 1 alone as its numerator.
  const spaced = await answerOnce(context, device, { kind: 'sum', seat: 0 }, '3 1/2');
  check(/^3\\frac\{?1\}?\{?2\}?$/.test(spaced.typed) && spaced.graded?.isCorrect === true, `${device.name} 3/2 + 2: "3 1/2" typed with a space is the mixed number 3½, and right`, `typed ${JSON.stringify(spaced.typed)}, graded ${JSON.stringify(spaced.graded?.isCorrect)}`);
  const THREE_AND_A_HALF = { whole: '3', numerator: '1', denominator: '2' };
  const mixed = await answerOnce(context, device, { kind: 'lowest', seat: 0 }, THREE_AND_A_HALF, { screenshot: `mixed-number-lowest-${device.name.toLowerCase()}.png` });
  check(/^3\\frac\{?1\}?\{?2\}?$/.test(mixed.typed), `${device.name} "Simplify 14/4.": the editor holds 3½ as a whole number and a fraction`, JSON.stringify(mixed.typed));
  check(!mixed.notice.includes(REASON) && !mixed.submitDisabled && mixed.graded?.isCorrect === true, `${device.name} "Simplify 14/4.": 3½ is in lowest terms, and right`, `notice ${JSON.stringify(mixed.notice)}, disabled ${mixed.submitDisabled}, graded ${JSON.stringify(mixed.graded?.isCorrect)}`);
  check(!mixed.errors.length, `${device.name} "Simplify 14/4.": no page errors`, mixed.errors.slice(0, 2).join(' | '));
  const unreduced = await answerOnce(context, device, { kind: 'lowest', seat: 0 }, { whole: '3', numerator: '2', denominator: '4' }, { screenshot: `mixed-number-reason-${device.name.toLowerCase()}.png` });
  check(unreduced.notice.includes(REASON), `${device.name} "Simplify 14/4.": 3 2/4 shows why before a try is spent`, JSON.stringify(unreduced.notice));
  check(unreduced.submitDisabled && unreduced.graded === null, `${device.name} "Simplify 14/4.": Submit is held, so no try is spent on 3 2/4`, `disabled ${unreduced.submitDisabled}, graded ${JSON.stringify(unreduced.graded)}`);
  const improper = await answerOnce(context, device, { kind: 'lowest', seat: 0 }, '7/2');
  check(improper.graded?.isCorrect === true && !improper.notice.includes(REASON), `${device.name} "Simplify 14/4.": 7/2 is right, with no reason shown`, `graded ${JSON.stringify(improper.graded?.isCorrect)}`);
  const sum = await answerOnce(context, device, { kind: 'sum', seat: 0 }, THREE_AND_A_HALF);
  check(sum.graded?.isCorrect === true, `${device.name} 3/2 + 2: 3½ is 7/2`, `graded ${JSON.stringify(sum.graded?.isCorrect)}, typed ${JSON.stringify(sum.typed)}`);
  check(!sum.notice.includes(REASON), `${device.name} 3/2 + 2: no form reason where any answer worth the sum is right`, JSON.stringify(sum.notice));
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll fraction template checks passed.');
process.exit(failures.length ? 1 : 0);
