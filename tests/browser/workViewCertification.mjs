// Stage 4 renders every inventory implementation through the student
// QuestionEngine and assignment chrome. It complements (rather than replaces)
// workViewMatrix.mjs, whose deeper gesture/Undo probes remain the family gate.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORK_VIEW_CERTIFICATION, WORK_VIEW_CERTIFICATION_DEVICES } from '../../src/tools/workViewCertificationManifest.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const shotsRoot = process.env.WORK_VIEW_CERTIFICATION_SHOTS || path.join(repo, 'tests/browser/artifacts/workViewStage4');
mkdirSync(shotsRoot, { recursive: true });
const browser = await chromium.launch();
const findings = [];

const visible = (locator) => locator.count().then(async (count) => count > 0 && locator.first().isVisible());
for (const device of WORK_VIEW_CERTIFICATION_DEVICES) {
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.mobile, hasTouch: device.mobile, deviceScaleFactor: device.mobile ? 2 : 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${origin}/tests/browser/workViewCertification.html`, { waitUntil: 'networkidle' });
  for (const [toolId, certification] of Object.entries(WORK_VIEW_CERTIFICATION)) {
    if (certification.status === 'exempt') continue;
    const familyDir = path.join(shotsRoot, device.id, toolId);
    mkdirSync(familyDir, { recursive: true });
    const problems = [];
    await page.evaluate((id) => window.__mmStage4(id), toolId);
    await page.waitForSelector(`[data-stage4-tool="${toolId}"]`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(familyDir, 'standard.png') });

    const opener = page.getByRole('button', { name: /enlarge|work view/i }).first();
    if (!(await visible(opener))) {
      problems.push('Work View opener is not reachable');
    } else {
      await opener.click();
      await page.waitForTimeout(200);
      const shell = page.locator('.mathmaster-work-view-host[data-open="true"]');
      if (!(await visible(shell))) problems.push('Work View did not open');
      else {
        const measurement = await shell.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const controls = [...node.querySelectorAll('button, input, select, textarea, math-field')].filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          return {
            viewportCover: box.width >= innerWidth * 0.95 && box.height >= innerHeight * 0.95,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            clipped: controls.filter((element) => { const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1; }).length,
            undoCount: [...node.querySelectorAll('.mathmaster-universal-undo')].filter((element) => element.getBoundingClientRect().width > 0).length,
          };
        });
        if (!measurement.viewportCover) problems.push('Work View does not cover the usable viewport');
        if (measurement.overflow > 4) problems.push(`${measurement.overflow}px horizontal page overflow`);
        if (measurement.clipped) problems.push(`${measurement.clipped} controls are clipped`);
        if (certification.requiredBehaviors.includes('singleOwnedUndo') && measurement.undoCount !== 1) problems.push(`expected one Universal Undo, found ${measurement.undoCount}`);
        await page.screenshot({ path: path.join(familyDir, 'work-view.png') });
        for (const drawerName of ['Task', 'Help']) {
          const drawer = shell.getByRole('button', { name: drawerName, exact: true });
          if (!(await visible(drawer))) problems.push(`${drawerName} is not reachable`);
          else { await drawer.click(); await page.waitForTimeout(100); await page.screenshot({ path: path.join(familyDir, `${drawerName.toLowerCase()}.png`) }); await drawer.click(); }
        }
        const before = await page.locator('[data-stage4-tool]').evaluate((node) => [...node.querySelectorAll('input,select,textarea,math-field')].map((element) => `${element.getAttribute('aria-label') || element.name || ''}=${element.value || ''}`));
        await page.setViewportSize({ width: device.height, height: device.width });
        await page.waitForTimeout(150);
        const after = await page.locator('[data-stage4-tool]').evaluate((node) => [...node.querySelectorAll('input,select,textarea,math-field')].map((element) => `${element.getAttribute('aria-label') || element.name || ''}=${element.value || ''}`));
        if (JSON.stringify(before) !== JSON.stringify(after)) problems.push('resize/orientation changed mathematical fields');
        await page.screenshot({ path: path.join(familyDir, 'rotated.png') });
      }
    }
    if (errors.length) problems.push(`page errors: ${errors.splice(0).join(' | ')}`);
    if (problems.length) findings.push({ device: device.id, toolId, problems });
    await page.setViewportSize({ width: device.width, height: device.height });
  }
  await context.close();
}
await browser.close();
if (findings.length) console.error(JSON.stringify(findings, null, 2));
else console.log(`Stage 4 certified ${Object.values(WORK_VIEW_CERTIFICATION).filter((entry) => entry.status === 'certified').length} tools on ${WORK_VIEW_CERTIFICATION_DEVICES.length} devices.`);
process.exitCode = findings.length ? 1 : 0;

