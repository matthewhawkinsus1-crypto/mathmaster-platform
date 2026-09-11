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
const shortError = (error) => String(error?.message || error).split('\n')[0].slice(0, 180);

const clickIfReachable = async (locator, label) => {
  if (!(await visible(locator))) return `${label} is not reachable`;
  try {
    await locator.first().click({ timeout: 4000 });
    return null;
  } catch (error) {
    return `${label} is blocked: ${shortError(error)}`;
  }
};

const dismissNumericKeypad = async (page) => {
  const done = page.locator('.mathmaster-mobile-numeric-keypad:visible .mathmaster-keypad-done').first();
  if (await done.count()) {
    try {
      await done.click({ timeout: 2500 });
      await page.waitForTimeout(100);
    } catch {
      // The next actionability assertion will report the blocker with the
      // current tool/device rather than aborting the complete certification.
    }
  }
};

const inputSnapshot = async (root) => root.evaluate((node) => [...node.querySelectorAll('input,select,textarea,math-field')]
  .map((element) => `${element.getAttribute('aria-label') || element.name || element.tagName}=${element.value || element.getAttribute('value') || ''}`));

for (const device of WORK_VIEW_CERTIFICATION_DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.viewportWidth, height: device.viewportHeight },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: device.mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${origin}/tests/browser/workViewCertification.html`, { waitUntil: 'networkidle' });

  for (const [toolId, certification] of Object.entries(WORK_VIEW_CERTIFICATION)) {
    if (certification.status === 'exempt') continue;
    console.log(`[stage4] ${device.id} · ${toolId}`);

    const familyDir = path.join(shotsRoot, device.id, toolId);
    mkdirSync(familyDir, { recursive: true });
    const problems = [];

    await page.evaluate((id) => window.__mmStage4(id), toolId);
    const toolRoot = page.locator(`[data-stage4-tool="${toolId}"]`);
    await toolRoot.waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(familyDir, 'standard.png') });

    // QuestionEngine may legitimately focus a numeric field on entry, which can
    // open MathMaster's mobile keypad. Finish that editing surface before asking
    // whether the separate Work View control is reachable.
    await dismissNumericKeypad(page);

    const preferredOpener = toolRoot.getByRole('button', { name: 'Open Work View', exact: true }).first();
    const fallbackOpener = toolRoot.getByRole('button', { name: /enlarge|work view/i }).first();
    const opener = await visible(preferredOpener) ? preferredOpener : fallbackOpener;
    const openerProblem = await clickIfReachable(opener, 'Work View opener');

    if (openerProblem) {
      problems.push(openerProblem);
      await page.screenshot({ path: path.join(familyDir, 'opener-blocked.png') });
    } else {
      await page.waitForTimeout(200);
      const shell = toolRoot.locator('.mathmaster-work-view-host[data-open="true"]').first();

      if (!(await visible(shell))) {
        problems.push('Work View did not open');
      } else {
        const measurement = await shell.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const controls = [...node.querySelectorAll('button, input, select, textarea, math-field')].filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          return {
            viewportCover: box.width >= innerWidth * 0.95 && box.height >= innerHeight * 0.95,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            clipped: controls.filter((element) => {
              const r = element.getBoundingClientRect();
              return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1;
            }).length,
            undoCount: [...node.querySelectorAll('.mathmaster-universal-undo')]
              .filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0).length,
          };
        });

        if (!measurement.viewportCover) problems.push('Work View does not cover the usable viewport');
        if (measurement.overflow > 4) problems.push(`${measurement.overflow}px horizontal page overflow`);
        if (measurement.clipped) problems.push(`${measurement.clipped} controls are clipped`);
        if (certification.requiredBehaviors.includes('singleOwnedUndo') && measurement.undoCount !== 1) {
          problems.push(`expected one Universal Undo, found ${measurement.undoCount}`);
        }
        await page.screenshot({ path: path.join(familyDir, 'work-view.png') });

        for (const drawerName of ['Task', 'Help']) {
          const drawer = shell.getByRole('button', { name: drawerName, exact: true }).first();
          const openProblem = await clickIfReachable(drawer, drawerName);
          if (openProblem) {
            problems.push(openProblem);
            continue;
          }
          await page.waitForTimeout(100);
          await page.screenshot({ path: path.join(familyDir, `${drawerName.toLowerCase()}.png`) });
          const closeProblem = await clickIfReachable(drawer, `${drawerName} close`);
          if (closeProblem) problems.push(closeProblem);
        }

        if (certification.requiredBehaviors.includes('inputRemainsReachable')) {
          const field = shell.locator('input:visible, textarea:visible, math-field:visible').first();
          if (!(await visible(field))) {
            problems.push('declared numeric/equation input has no reachable input in Work View');
          } else {
            try {
              await field.click({ timeout: 3000 });
              await page.waitForTimeout(150);
              const inputGeometry = await field.evaluate((element) => {
                const r = element.getBoundingClientRect();
                const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
                const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
                const top = document.elementFromPoint(x, y);
                return {
                  onScreen: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
                  hit: top === element || element.contains(top) || top?.contains?.(element),
                };
              });
              if (!inputGeometry.onScreen) problems.push('active input left the visible Work View');
              if (!inputGeometry.hit) problems.push('active input is covered by another surface');
              await page.screenshot({ path: path.join(familyDir, 'active-input.png') });
              await dismissNumericKeypad(page);
            } catch (error) {
              problems.push(`input could not be activated: ${shortError(error)}`);
            }
          }
        }

        const before = await inputSnapshot(toolRoot);
        await page.setViewportSize({ width: device.viewportHeight, height: device.viewportWidth });
        await page.waitForTimeout(150);
        const after = await inputSnapshot(toolRoot);
        if (JSON.stringify(before) !== JSON.stringify(after)) problems.push('resize/orientation changed mathematical fields');
        await page.screenshot({ path: path.join(familyDir, 'rotated.png') });

        // Return to a clean presentation state before mounting the next tool.
        const close = shell.getByRole('button', { name: /close/i }).first();
        if (await visible(close)) {
          try { await close.click({ timeout: 2500 }); } catch { /* next mount replaces this scene */ }
        }
      }
    }

    if (errors.length) problems.push(`page errors: ${errors.splice(0).join(' | ')}`);
    if (problems.length) findings.push({ device: device.id, toolId, problems });
    await page.setViewportSize({ width: device.viewportWidth, height: device.viewportHeight });
  }
  await context.close();
}

await browser.close();
if (findings.length) console.error(JSON.stringify(findings, null, 2));
else console.log(`Stage 4 certified ${Object.values(WORK_VIEW_CERTIFICATION).filter((entry) => entry.status === 'certified').length} tools on ${WORK_VIEW_CERTIFICATION_DEVICES.length} devices.`);
process.exitCode = findings.length ? 1 : 0;
