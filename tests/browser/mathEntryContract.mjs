// THE MATH-ENTRY CONTRACT, TYPED ON A REAL KEYBOARD INTO REAL MATHLIVE.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/mathEntryContract.mjs
//
// Characters typed into a math field build the expression the same characters
// mean as written text — the reading every MathMaster grader applies
// (src/platform/math/typedFractionEntry.js). PQ-040: `y=-2/3x+4` used to
// become −2/(3x + 4). The unit tests drive the state machine against a model
// of MathLive; this proves the real MathLive 0.110 agrees, through the real
// MathInput and the real calculator. Exits non-zero on any mismatch.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

// [typed, latex MathInput must hold]
const ANSWER_CASES = [
  // PQ-040 and its family: a term after a numeric denominator starts after it.
  ['y=-2/3x+4', 'y=-\\frac23x+4'],
  ['3/4x+2', '\\frac34x+2'],
  ['y<2/3x-1', 'y<\\frac23x-1'],
  ['(1/2,3)', '\\left(\\frac12,3\\right)'],
  ['12/0.5x', '\\frac{12}{0.5}x'],
  ['1/-2x', '\\frac{1}{-2}x'],
  ['y=-2/3x+4/5', 'y=-\\frac23x+\\frac45'],
  // A denominator the student is building on purpose is untouched.
  ['1/x-2', '\\frac{1}{x-2}'],
  ['1/(2x)', '\\frac{1}{\\left(2x\\right)}'],
  ['1/2^3', '\\frac{1}{2^3}'],
  ['a/b+c', '\\frac{a}{b+c}'],
  // Nothing before the slash: the caret is in the numerator, never rewritten.
  ['/2x', '\\frac{2x}{\\placeholder{}}'],
  // A second slash nests rather than leaving an empty fraction.
  ['2/3/4', '\\frac{2}{\\frac34}'],
];

// [typed then Enter, displayed result]
const CALCULATOR_CASES = [
  ['6/3+1', '3'],
  ['1/2+1/4', '0.75'],
  ['8/(2+2)', '2'],
];

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.goto(`${ORIGIN}/tests/browser/mathEntryContract.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('math-field').length >= 2 && customElements.get('math-field'));

const failures = [];

const typeInto = async (selector, text) => {
  await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, selector);
  await page.click(selector);
  await page.waitForTimeout(120);
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(80);
};

for (const [typed, expected] of ANSWER_CASES) {
  await typeInto('[data-entry="answer"] math-field', typed);
  const actual = await page.evaluate(() => document.querySelector('[data-entry="answer"] math-field').value);
  const verdict = actual === expected ? 'ok  ' : 'FAIL';
  if (verdict === 'FAIL') failures.push(`answer "${typed}": expected ${expected}, got ${actual}`);
  console.log(`${verdict} answer      ${typed.padEnd(14)} -> ${actual}`);
}

// The parent receives what the field holds (the value a grader reads).
await typeInto('[data-entry="answer"] math-field', 'y=-2/3x+4');
await page.waitForTimeout(200);
const reported = await page.textContent('[data-entry="reported"]');
if (reported !== 'y=-\\frac23x+4') failures.push(`reported value: expected y=-\\frac23x+4, got ${reported}`);
console.log(`${reported === 'y=-\\frac23x+4' ? 'ok  ' : 'FAIL'} reported    ${reported}`);

for (const [typed, expected] of CALCULATOR_CASES) {
  await typeInto('[data-entry="calculator"] math-field', typed);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const actual = await page.evaluate(() => document.querySelector('[data-entry="calculator"] math-field').value);
  const verdict = actual === expected ? 'ok  ' : 'FAIL';
  if (verdict === 'FAIL') failures.push(`calculator "${typed}": expected ${expected}, got ${actual}`);
  console.log(`${verdict} calculator  ${typed.padEnd(14)} = ${actual}`);
}

pageErrors.forEach((message) => failures.push(`page error: ${message}`));
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} math-entry contract failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nmath-entry contract: every case holds.');
