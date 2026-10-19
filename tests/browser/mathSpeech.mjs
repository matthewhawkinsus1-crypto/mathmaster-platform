/*
 * MATH SPEAKS — what a screen reader hears for rendered mathematics.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/mathSpeech.mjs
 *
 *   AUDIT_ORIGIN (default http://127.0.0.1:5199), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH as in the other harnesses.
 *
 * Reads Chromium's accessibility tree (what NVDA/JAWS/VoiceOver are given),
 * not the DOM, at 1366×768 and 390×844, and asserts for every sample in
 * mathSpeechMain.jsx — block, inline and inside MathText prose:
 *
 *   - the expression is announced ONCE, in words ("y equals negative 2 over 3
 *     x plus 4"), read in line with the sentence around it;
 *   - no LaTeX source (backslash commands) and no MathML glyph run reaches the
 *     tree, and the old placeholder "Mathematical expression" is gone;
 *   - an authored label is still what is read.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const EXPECTED = {
  frac: '1 over 2 bh',
  slope: 'y equals negative 2 over 3 x plus 4',
  quadratic: 'x squared minus 5x plus 6 equals 0',
  ascii: '3 over 4',
  degrees: 'm angle A equals 30 degrees',
};

const failures = [];
for (const [width, height] of [[1366, 768], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${origin}/tests/browser/mathSpeech.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-sample="degrees"] math-span').first().waitFor({ state: 'attached' });
  // MathLive renders on intersection; scroll everything through once.
  await page.evaluate(async () => {
    for (const el of document.querySelectorAll('math-span, math-div')) { el.scrollIntoView(); await new Promise((r) => requestAnimationFrame(r)); }
  });
  await page.waitForFunction(() => [...document.querySelectorAll('math-span, math-div')]
    .every((el) => el.shadowRoot?.querySelector('[part="render"]')?.innerHTML));
  for (const [id, spoken] of Object.entries(EXPECTED)) {
    const section = page.locator(`[data-sample="${id}"]`);
    const tree = await section.ariaSnapshot();
    const at = `${width}x${height} ${id}`;
    try {
      assert.doesNotMatch(tree, /Mathematical expression/, `${at}: placeholder label`);
      assert.doesNotMatch(tree, /\\[a-z]+/, `${at}: LaTeX source reaches the accessibility tree`);
      assert.equal(await section.locator('[data-kind="block"]').ariaSnapshot(), `- text: ${spoken}`, `${at}: block`);
      assert.equal(await section.locator('[data-kind="inline"]').ariaSnapshot(), `- paragraph: Solve ${spoken} now.`, `${at}: inline`);
      assert.equal(await section.locator('[data-kind="prose"]').ariaSnapshot(), `- paragraph: Find ${spoken} today.`, `${at}: prose`);
      // Once: the spoken words appear a single time in the whole section.
      assert.equal(tree.split(spoken).length - 1, 3, `${at}: announced more than once per rendering`);
    } catch (error) { failures.push(error.message); }
  }
  const authored = await page.locator('[data-sample="authored"]').ariaSnapshot();
  if (authored !== '- text: x squared, authored') failures.push(`${width}x${height}: authored label not read (${authored})`);
  await page.close();
}
await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('math speech: every expression announced once, in words, at 1366x768 and 390x844');
