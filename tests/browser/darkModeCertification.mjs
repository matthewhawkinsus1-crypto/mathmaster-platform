import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const shots = process.env.DARK_MODE_CERTIFICATION_SHOTS || path.join(repo, 'tests/browser/artifacts/darkMode');
mkdirSync(shots, { recursive: true });

const devices = [
  ['chromebook', 1366, 768], ['phone-portrait', 390, 844],
  ['phone-landscape', 844, 390], ['tablet', 768, 1024],
];
const tools = ['graphing2', 'stepAlgebra2', 'dataModelingLab'];
const browser = await chromium.launch();

for (const [device, width, height] of devices) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
    const page = await context.newPage();
    await page.goto(`${origin}/tests/browser/workViewCertification.html`, { waitUntil: 'networkidle' });
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
    for (const tool of tools) {
      await page.evaluate((id) => window.__mmStage4(id), tool);
      await page.locator(`[data-stage4-tool="${tool}"]`).waitFor();
      await page.waitForTimeout(300);
      const failures = await page.locator(`[data-stage4-tool="${tool}"]`).evaluate((root) => {
        const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = (value) => {
          const channels = rgb(value).map((entry) => { const n = entry / 255; return n <= .03928 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
          return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
        };
        const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const background = (node) => {
          for (let current = node; current; current = current.parentElement) {
            const value = getComputedStyle(current).backgroundColor;
            if (rgb(value)[3] !== 0 && value !== 'rgba(0, 0, 0, 0)') return value;
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        return [...root.querySelectorAll('p,label,button,input,select,textarea,math-field,th,td,svg text')]
          .filter((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; })
          .map((node) => ({ node, style: getComputedStyle(node) }))
          .filter(({ node }) => (node.matches('input,select,textarea,math-field') && !['checkbox', 'radio', 'range', 'color'].includes(node.type)) || (node.textContent || '').trim())
          .filter(({ node, style }) => ratio(style.color, background(node)) < (Number.parseFloat(style.fontSize) >= 24 ? 3 : 4.5))
          .slice(0, 12).map(({ node }) => node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.tagName);
      });
      assert.deepEqual(failures, [], `${device}/${theme}/${tool} has low-contrast foreground/background pairs`);
      const graph = page.locator(`[data-stage4-tool="${tool}"] svg`).first();
      if (tool === 'graphing2' && await graph.count()) {
        const colors = await graph.evaluate((svg) => ({ bg: getComputedStyle(svg.querySelector('rect')).fill, labels: getComputedStyle(svg.querySelector('text')).fill }));
        assert.notEqual(colors.bg, colors.labels, `${device}/${theme} graph labels must differ from graph background`);
      }
      await page.screenshot({ path: path.join(shots, `${device}-${theme}-${tool}.png`), fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
console.log('Certified assignment controls, Work View, MathLive, tables, feedback, locked states and representative tools in light and dark themes.');
