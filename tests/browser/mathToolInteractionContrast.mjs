import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chooseOperation, typeOperand } from './stepAlgebraDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const artifacts = 'tests/browser/artifacts/mathToolContrast';
mkdirSync(artifacts, { recursive: true });

// Read computed styles on the real MathLive element and composite translucent
// ancestor surfaces. A pale staged operation with inherited white math fails.
async function checkPreview(page, label) {
  const preview = page.locator('.algebra-live-math-preview.is-staged');
  await preview.waitFor();
  await preview.locator('math-span,math-div').first().waitFor();
  const result = await preview.evaluate((node) => {
    const parse = (value) => {
      const values = value.match(/[\d.]+/g).map(Number);
      return { rgb: values.slice(0, 3), alpha: values[3] ?? 1 };
    };
    const background = (element) => {
      if (!element) return [255, 255, 255];
      const color = parse(getComputedStyle(element).backgroundColor);
      if (color.alpha === 1) return color.rgb;
      const underneath = background(element.parentElement);
      return color.rgb.map((n, i) => n * color.alpha + underneath[i] * (1 - color.alpha));
    };
    const lum = (channels) => channels.map((n) => n / 255).map((n) => n <= .03928 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    const math = node.querySelector('math-span,math-div');
    const fg = parse(getComputedStyle(math).color).rgb;
    const bg = background(node);
    const a = lum(fg); const b = lum(bg);
    return { contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground: fg, background: bg, value: math.textContent };
  });
  assert.ok(result.contrast >= 4.5, `${label}: ${JSON.stringify(result)}`);
  return result;
}

try {
  for (const [device, width, height] of [['desktop', 1366, 900], ['phone', 390, 844], ['tablet', 820, 1180]]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      const page = await context.newPage();
      await page.goto(`${origin}/tests/browser/stepAlgebraStructureTools.html?q=4`);
      await page.waitForFunction(() => !!window.__mmStructure);
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const host = page.locator('.mathmaster-question-engine');
      await chooseOperation(page, host, 'Divide by');
      await typeOperand(page, host, '3');
      await host.locator('button.algebra-pickup-button').click();
      await host.locator('[aria-label$="on the left side"]').first().click();
      const label = `${device}-${theme}`;
      if (device === 'desktop' && theme === 'dark') {
        const mutation = await page.addStyleTag({ content: '.algebra-live-math-preview.is-staged { background: rgba(255,252,244,.98) !important; }' });
        await assert.rejects(() => checkPreview(page, 'original pale preview'), /original pale preview:/);
        await mutation.evaluate((element) => element.remove());
      }
      const result = await checkPreview(page, label);
      await page.screenshot({ path: path.join(artifacts, `${label}-staged-fraction.png`), fullPage: true });
      console.log(`${label}: staged fraction ${result.contrast.toFixed(2)}:1`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
