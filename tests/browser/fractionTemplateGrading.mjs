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
const answerOnce = async (context, device, { kind, seat }, answer) => {
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
    copy.querySelectorAll('math-span, math-div').forEach((node) => node.replaceWith(`⟨${node.textContent.trim()}⟩`));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  });
  if (device.touch) await field.tap();
  else await field.click();
  await page.waitForTimeout(150);
  await page.keyboard.type(answer, { delay: 30 });
  await page.waitForTimeout(250);
  const typed = await field.evaluate((element) => element.value);
  const submit = page.getByRole('button', { name: 'Submit Answer' }).first();
  if (device.touch) await submit.tap();
  else await submit.click();
  await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 8000 }).catch(() => {});
  const graded = await page.evaluate(() => window.__mmGraded);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.close();
  return { prompt, typed, graded, errors, overflow };
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
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll fraction template checks passed.');
process.exit(failures.length ? 1 : 0);
