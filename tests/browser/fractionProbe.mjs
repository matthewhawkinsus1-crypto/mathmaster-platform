// Measure whether a division renders stacked or as a slash.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/fractionProbe.mjs
//
// A stacked fraction is roughly twice the height of a line of type. That ratio,
// measured against a sample with no division in it at all, is what separates
// "stacked" from "slash" — reading CSS classes inside MathLive's layout is
// guesswork, and the two markups look alike.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
page.on('pageerror', (error) => console.error('page error:', error.message));
await page.goto(`${ORIGIN}/tests/browser/fractionProbe.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const rows = await page.evaluate(() => [...document.querySelectorAll('[data-probe]')].map((node) => ({
  probe: node.getAttribute('data-probe'),
  height: Number(node.getBoundingClientRect().height.toFixed(1)),
})));

const baseline = rows.filter((row) => row.probe.startsWith('baseline-no-division'))
  .reduce((total, row) => Math.max(total, row.height), 0);
console.log(`baseline single-line height: ${baseline}px\n`);
console.log('probe'.padEnd(40), 'height', ' ratio', ' verdict');
rows.forEach((row) => {
  const ratio = baseline ? row.height / baseline : 0;
  const verdict = row.probe.startsWith('baseline') ? '—' : ratio >= 1.1 ? 'stacked' : 'flat';
  console.log(row.probe.padEnd(40), String(row.height).padStart(6), ratio.toFixed(2).padStart(6), ' ', verdict);
});

// Type a division the way a student would. MathLive keeps its editor in a
// shadow root, so focus has to be given to the element itself.
await page.evaluate(() => document.querySelector('math-field')?.focus());
await page.keyboard.type('3/4x+2');
await page.waitForTimeout(500);
const typed = await page.evaluate(() => {
  const node = document.querySelector('math-field');
  return { value: node?.value ?? '', height: Number((node?.getBoundingClientRect().height ?? 0).toFixed(1)) };
});
console.log('\nTyped "3/4x+2" into MathInput:');
console.log('  serialized value :', JSON.stringify(typed.value));
console.log('  field height     :', typed.height);

await page.screenshot({ path: process.env.PROBE_SCREENSHOT || '/tmp/fractionProbe.png', fullPage: true });
await browser.close();
