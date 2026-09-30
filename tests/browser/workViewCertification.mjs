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
const requestedDevice = String(process.env.WORK_VIEW_CERTIFICATION_DEVICE || '').trim();
const certificationDevices = requestedDevice
  ? WORK_VIEW_CERTIFICATION_DEVICES.filter((device) => device.id === requestedDevice)
  : WORK_VIEW_CERTIFICATION_DEVICES;
if (requestedDevice && certificationDevices.length !== 1) {
  throw new Error(`Unknown Stage 4 certification device: ${requestedDevice}`);
}

const requestedTool = String(process.env.WORK_VIEW_CERTIFICATION_TOOL || '').trim();
if (requestedTool && !WORK_VIEW_CERTIFICATION[requestedTool]) {
  throw new Error(`Unknown Stage 4 certification tool: ${requestedTool}`);
}

/*
 * WHY THIS RUN USED TO "TIME OUT".
 *
 * Investigated for the platform quirks audit (docs/qa/platform-quirks-audit.md).
 * On a warm dev server all 161 scenes (23 tools x 7 devices) certify in ~9
 * minutes, about 3.3 s a scene, and the JS heap stays flat — the application
 * is not slow. What failed was the FIRST scene of a fresh page on a cold,
 * memory-starved machine: the harness called __mmStage4 as soon as the page
 * reached network idle and then gave the first tool Playwright's default 30 s
 * to render, while Vite was still transforming the tool's module graph. The
 * TimeoutError was uncaught, so it ended the whole run and reported nothing.
 *
 * So: wait for the harness itself to be ready, give only the first scene of a
 * page the cold budget, isolate each scene (a failure is that scene's finding
 * and the page is reloaded for the next), and print per-scene time, heap and
 * DOM size so the next "it hangs" names the tool.
 *
 * Batch by device with WORK_VIEW_CERTIFICATION_DEVICE, or by tool with
 * WORK_VIEW_CERTIFICATION_TOOL. Do not edit src/ while it runs: the Vite dev
 * server hot-reloads the harness mid-scene.
 */
const COLD_SCENE_TIMEOUT = Number(process.env.WORK_VIEW_CERTIFICATION_COLD_TIMEOUT_MS || 120000);
const SCENE_TIMEOUT = 30000;
const timings = [];

const openHarness = async (page) => {
  await page.goto(`${origin}/tests/browser/workViewCertification.html`, { waitUntil: 'networkidle', timeout: COLD_SCENE_TIMEOUT });
  await page.waitForFunction(() => typeof window.__mmStage4 === 'function', null, { timeout: COLD_SCENE_TIMEOUT });
};

// Chromium-only heap figure; null elsewhere. DOM size catches a scene that
// leaves the previous tool's nodes behind.
const samplePage = (page) => page.evaluate(() => ({
  heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null,
  domNodes: document.getElementsByTagName('*').length,
})).catch(() => ({ heapMB: null, domNodes: null }));

const printTimings = () => {
  if (!timings.length) return;
  const total = timings.reduce((sum, entry) => sum + entry.ms, 0);
  console.log(`\nStage 4 timing: ${timings.length} scenes in ${(total / 1000).toFixed(1)} s (mean ${(total / timings.length / 1000).toFixed(2)} s)`);
  [...timings].sort((a, b) => b.ms - a.ms).slice(0, 8)
    .forEach((entry) => console.log(`  ${(entry.ms / 1000).toFixed(1).padStart(6)} s  ${entry.device.padEnd(17)} ${entry.toolId.padEnd(26)} heap ${entry.heapMB ?? '—'} MB  dom ${entry.domNodes ?? '—'}`));
  const byDevice = new Map();
  timings.forEach((entry) => byDevice.set(entry.device, [...(byDevice.get(entry.device) || []), entry]));
  byDevice.forEach((entries, device) => {
    const heaps = entries.map((entry) => entry.heapMB).filter((value) => value != null);
    if (heaps.length) console.log(`  heap ${device}: first ${heaps[0]} MB, last ${heaps[heaps.length - 1]} MB, max ${Math.max(...heaps)} MB`);
  });
};

const visible = (locator) => locator.count().then(async (count) => count > 0 && locator.first().isVisible());
const shortError = (error) => String(error?.message || error).split('\n')[0].slice(0, 180);

const clickIfReachable = async (locator, label) => {
  if (!(await visible(locator))) return `${label} is not reachable`;
  const target = locator.first();
  if (await target.isDisabled().catch(() => false)) return `${label} is disabled`;
  try {
    await target.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await target.click({ timeout: 4000 });
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

const mathStateSnapshot = async (toolRoot) => toolRoot.evaluate((node) => {
  const chrome = (element) => element.closest?.('.mathmaster-work-view-header, .mathmaster-work-view-drawer, .mathmaster-work-view-actions, .mathmaster-work-view-instruction');
  const visibleElement = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const label = (element) => element.getAttribute('aria-label')
    || element.name
    || element.placeholder
    || element.id
    || element.textContent?.trim()
    || element.tagName;
  const fields = [...node.querySelectorAll('input,select,textarea,math-field')]
    .filter((element) => !chrome(element) && element.type !== 'hidden')
    .map((element) => `${label(element)}=${element.value ?? element.getAttribute('value') ?? ''}`);
  const pressed = [...node.querySelectorAll('button[aria-pressed="true"], [aria-selected="true"], input:checked')]
    .filter((element) => !chrome(element))
    .map((element) => label(element));
  const mathState = [...node.querySelectorAll('[data-math-state]')]
    .filter((element) => !chrome(element))
    .map((element) => element.getAttribute('data-math-state'));
  const marks = [...node.querySelectorAll('svg text')]
    .filter((element) => !chrome(element) && visibleElement(element))
    .map((element) => (element.textContent || '').trim())
    .filter((text) => /^(P|S)\d+$/.test(text));
  const placedCards = [...node.querySelectorAll('button[title*="move this card" i]')]
    .filter((element) => !chrome(element) && visibleElement(element))
    .map((element) => (element.textContent || '').trim());
  const placements = [...node.querySelectorAll('dd')]
    .filter((element) => !chrome(element))
    .map((element) => (element.textContent || '').trim())
    .filter(Boolean);
  // Some graph-construction tools expose their committed state as progress text
  // even when the plotted marker's SVG label is outside the current camera.
  // This is mathematical/student state, not presentation, and gives the browser
  // gate a stable way to observe plotTransform edits and Undo.
  const progress = [...node.querySelectorAll('p, [data-progress]')]
    .filter((element) => !chrome(element) && visibleElement(element))
    .map((element) => (element.textContent || '').trim())
    .filter((text) => /^\d+\s+of\s+\d+\b.*\bplotted\.?$/i.test(text));
  return { fields, pressed, mathState, marks, placedCards, placements, progress };
});

const makeStatefulEdit = async (page, shell, toolId, toolRoot) => {
  const baseline = await mathStateSnapshot(toolRoot);
  const changed = async (description) => {
    await page.waitForTimeout(160);
    const state = await mathStateSnapshot(toolRoot);
    return JSON.stringify(state) !== JSON.stringify(baseline) ? { description, state } : null;
  };

  const surface = shell.locator('.mathmaster-work-view-surface');

  if (toolId === 'graphing2') {
    // Graphing2 has no text field to mutate: the answer is the plotted line.
    // Use the actual interactive SVG so both the first edit and the post-Undo
    // recreation are deterministic in short landscape viewports.
    const plane = surface.locator('svg[role="application"]:visible').first();
    if (await plane.count()) {
      try {
        await plane.focus();
        await plane.press('Enter');
        const keyboardResult = await changed('plotted a graphing point with the keyboard');
        if (keyboardResult) return keyboardResult;

        const box = await plane.boundingBox();
        if (box && box.width > 80 && box.height > 80) {
          await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.38);
          const result = await changed('plotted a graphing point');
          if (result) return result;
        }
      } catch { /* continue through generic strategies */ }
    }
  }

  if (toolId === 'expressionMeaning') {
    // The first aria-pressed control is the already-active expression row, so
    // the generic button probe would click it and observe no change. Exercise
    // an actual answer choice instead: those buttons write draft-backed
    // mathematical state and expose aria-pressed after selection.
    const choice = surface.locator('[role="group"] button:visible:not([disabled])').first();
    if (await choice.count()) {
      try {
        await choice.click({ timeout: 2500 });
        const result = await changed('assigned an expression meaning choice');
        if (result) return result;
      } catch { /* continue through generic strategies */ }
    }
  }

  if (toolId === 'stepAlgebra2') {
    const operand = surface.locator('input[type="number"]:visible').first();
    const apply = surface.getByRole('button', { name: 'Apply to both sides', exact: true }).first();
    if (await operand.count() && await apply.count()) {
      try {
        await operand.fill('6');
        await operand.dispatchEvent('change');
        await apply.click({ timeout: 2500 });
        const result = await changed('committed a balanced equation step');
        if (result) return result;
      } catch { /* continue through the generic strategies */ }
    }
  }

  const select = surface.locator('select:visible:not([disabled])').first();
  if (await select.count()) {
    const options = await select.locator('option:not([disabled])').evaluateAll((nodes) => nodes.map((node) => node.value));
    const current = await select.inputValue();
    const next = options.find((value) => value !== current);
    if (next !== undefined) {
      try {
        await select.selectOption(next);
        const result = await changed('changed a selection');
        if (result) return result;
      } catch { /* try another interaction below */ }
    }
  }

  const field = surface.locator('input:visible:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([readonly]), textarea:visible:not([readonly])').first();
  if (await field.count()) {
    try {
      const type = (await field.getAttribute('type')) || 'text';
      const current = await field.inputValue().catch(() => '');
      let value;
      if (type === 'number') {
        const numeric = Number(current);
        value = String(Number.isFinite(numeric) ? numeric + 1 : 2);
        const max = Number(await field.getAttribute('max'));
        const min = Number(await field.getAttribute('min'));
        if (Number.isFinite(max) && Number(value) > max) value = String(Number.isFinite(min) ? min : max);
        if (Number.isFinite(min) && Number(value) < min) value = String(min);
      } else {
        value = current ? `${current} stage4` : 'stage4';
      }
      await field.fill(value);
      await field.dispatchEvent('change');
      const result = await changed(`edited ${type} input`);
      if (result) return result;
    } catch { /* try another interaction below */ }
  }

  const mathField = surface.locator('math-field:visible').first();
  if (await mathField.count()) {
    try {
      await mathField.evaluate((element) => {
        const current = String(element.value || '');
        element.focus?.({ preventScroll: true });
        element.value = current === '3' ? '4' : '3';
        const event = typeof InputEvent === 'function'
          ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: element.value })
          : new Event('input', { bubbles: true });
        element.dispatchEvent(event);
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const result = await changed('edited equation input');
      if (result) return result;
    } catch { /* try another interaction below */ }
  }

  const pressedButton = surface.locator('button[aria-pressed]:visible:not([disabled])').first();
  if (await pressedButton.count()) {
    try {
      await pressedButton.click({ timeout: 2500 });
      const result = await changed('changed a mathematical selection');
      if (result) return result;
    } catch { /* try graph interaction below */ }
  }

  const interactivePlane = surface.locator('svg[role="application"]:visible').first();
  if (await interactivePlane.count()) {
    try {
      await interactivePlane.focus();
      await interactivePlane.press('Enter');
      const result = await changed('edited the interactive graph with the keyboard');
      if (result) return result;
    } catch { /* fall through to pointer probing */ }
  }

  const svgs = surface.locator('svg:visible');
  const count = await svgs.count();
  if (count) {
    let target = null;
    let area = 0;
    for (let index = 0; index < count; index += 1) {
      const box = await svgs.nth(index).boundingBox();
      if (box && box.width * box.height > area) {
        target = box;
        area = box.width * box.height;
      }
    }
    if (target && target.width > 80 && target.height > 80) {
      try {
        const x = target.x + target.width * 0.62;
        const y = target.y + target.height * 0.38;
        await page.mouse.move(x - 8, y - 8);
        await page.mouse.down();
        await page.mouse.move(x, y, { steps: 6 });
        await page.mouse.up();
        const result = await changed('edited the graphical workspace');
        if (result) return result;
      } catch { /* final fallback below */ }
    }
  }

  const action = surface.locator('button:visible:not([disabled])').filter({
    hasNotText: /Task|Help|Close|Undo|Hint|Check|Submit|Scratchpad|Add page|Save/i,
  }).first();
  if (await action.count()) {
    try {
      await action.click({ timeout: 2500 });
      const result = await changed('used a mathematical control');
      if (result) return result;
    } catch { /* reported by the caller */ }
  }

  return null;
};

for (const device of certificationDevices) {
  const context = await browser.newContext({
    viewport: { width: device.viewportWidth, height: device.viewportHeight },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: device.mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await openHarness(page);
  let firstScene = true;

  for (const [toolId, certification] of Object.entries(WORK_VIEW_CERTIFICATION)) {
    if (certification.status === 'exempt') continue;
    if (requestedTool && toolId !== requestedTool) continue;
    console.log(`[stage4] ${device.id} · ${toolId}`);

    const familyDir = path.join(shotsRoot, device.id, toolId);
    mkdirSync(familyDir, { recursive: true });
    const problems = [];

    const started = Date.now();
    try {
      await page.evaluate((id) => window.__mmStage4(id), toolId);
      const toolRoot = page.locator(`[data-stage4-tool="${toolId}"]`);
      await toolRoot.waitFor({ state: 'visible', timeout: firstScene ? COLD_SCENE_TIMEOUT : SCENE_TIMEOUT });

      // The harness renders the tool ROOT; the tool itself renders the Work View
      // host a few React commits later, once its lazily loaded chunk resolves —
      // measured at 282-478 ms after the root becomes visible. Everything below
      // samples the DOM instantaneously (`count()` and `isVisible()` do not
      // auto-wait), so the fixed sleep alone was racing that render: on a loaded
      // runner a varying subset of tools reported "Work View opener is not
      // reachable", and none ever did on a warm machine. Wait for the host the
      // openers are read from. A tool that genuinely renders none still falls
      // through to exactly the same report.
      await toolRoot.locator('.mathmaster-work-view-host').first()
        .waitFor({ state: 'attached', timeout: 15000 })
        .catch(() => {});
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(familyDir, 'standard.png') });

      // QuestionEngine may legitimately focus a numeric field on entry, which can
      // open MathMaster's mobile keypad. Finish that editing surface before asking
      // whether the separate Work View control is reachable.
      await dismissNumericKeypad(page);

      // Prefer the activity-level shell. A graph nested inside an already
      // enlargeable activity can contain its own historical "Enlarge" text; using
      // the first regex match can certify/click the wrong shell.
      const activityHost = toolRoot.locator('.mathmaster-work-view-host[data-open="false"]').first();
      const directOpeners = activityHost
        .locator(':scope > .mathmaster-work-view-body > .mathmaster-work-view-surface > button')
        .filter({ hasText: /enlarge|work view/i });
      const preferredOpener = directOpeners.filter({ hasText: /open work view/i }).first();
      const fallbackOpener = directOpeners.first();
      const opener = await visible(preferredOpener) ? preferredOpener : fallbackOpener;
      const alreadyOpen = toolRoot.locator('.mathmaster-work-view-host[data-open="true"]').first();
      const openerProblem = await visible(alreadyOpen)
        ? null
        : await clickIfReachable(opener, 'Work View opener');

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
                const fixedChrome = Boolean(element.closest('.mathmaster-work-view-header, .mathmaster-work-view-actions'));
                // Work View surfaces intentionally scroll vertically for long
                // activities. A response field below the fold is not clipped; it
                // is clipped only if horizontal layout loses it, or if shell
                // chrome that must remain reachable leaves the viewport.
                return r.left < -1
                  || r.right > innerWidth + 1
                  || (fixedChrome && (r.top < -1 || r.bottom > innerHeight + 1));
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
            const field = shell.locator('input:visible:not([type="hidden"]), textarea:visible, select:visible, math-field:visible, [contenteditable="true"]:visible').first();
            if (!(await visible(field))) {
              problems.push('declared numeric/equation input has no reachable input in Work View');
            } else {
              try {
                await field.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
                await field.click({ timeout: 3000 });
                await page.waitForTimeout(150);
                const inputGeometry = await field.evaluate((element) => {
                  const r = element.getBoundingClientRect();
                  const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
                  const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
                  const top = document.elementFromPoint(x, y);
                  const blocker = top && !(top === element || element.contains(top) || top?.contains?.(element))
                    ? {
                      tag: top.tagName,
                      className: typeof top.className === 'string' ? top.className : '',
                      ariaLabel: top.getAttribute?.('aria-label') || '',
                    }
                    : null;
                  return {
                    onScreen: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
                    hit: blocker == null,
                    blocker,
                  };
                });
                if (!inputGeometry.onScreen) problems.push('active input left the visible Work View');
                if (!inputGeometry.hit) {
                  const blocker = inputGeometry.blocker || {};
                  problems.push(`active input is covered by ${blocker.tag || 'another surface'}${blocker.className ? `.${String(blocker.className).trim().replace(/\s+/g, '.')}` : ''}${blocker.ariaLabel ? ` [${blocker.ariaLabel}]` : ''}`);
                }
                await page.screenshot({ path: path.join(familyDir, 'active-input.png') });
                await dismissNumericKeypad(page);
              } catch (error) {
                problems.push(`input could not be activated: ${shortError(error)}`);
              }
            }
          }

          // State preservation is meaningful only after the student has actually
          // changed the mathematics. A pristine fixture would look identical after
          // an accidental remount/reset and falsely certify the regression.
          const baselineState = await mathStateSnapshot(toolRoot);
          let edit = await makeStatefulEdit(page, shell, toolId, toolRoot);
          if (!edit) {
            problems.push('could not make a stateful student edit before resize/orientation certification');
          } else {
            await dismissNumericKeypad(page);
            await page.screenshot({ path: path.join(familyDir, 'student-edit.png') });
            let editedState = await mathStateSnapshot(toolRoot);

            if (certification.requiredBehaviors.includes('fitIsPresentationOnly')) {
              const fit = shell.locator('[data-work-view-action]').filter({ hasText: /fit/i }).first();

              // Fit is correctly disabled while the camera already matches the
              // authored/default frame. First create a camera-only deviation using
              // the tool's visible zoom control, then require Fit to become
              // actionable and prove it leaves mathematical state untouched.
              if (await fit.count() && await fit.isDisabled().catch(() => false)) {
                const zoomIn = shell.getByRole('button', { name: /zoom in/i }).first();
                if (await visible(zoomIn)) {
                  const zoomProblem = await clickIfReachable(zoomIn, 'Zoom in');
                  if (zoomProblem) problems.push(zoomProblem);
                  else await page.waitForTimeout(140);
                }
              }

              const beforeFit = await mathStateSnapshot(toolRoot);
              const fitProblem = await clickIfReachable(fit, 'Fit View');
              if (fitProblem) {
                problems.push(fitProblem);
              } else {
                await page.waitForTimeout(120);
                const afterFit = await mathStateSnapshot(toolRoot);
                if (JSON.stringify(afterFit) !== JSON.stringify(beforeFit)) {
                  problems.push('Fit View changed mathematical state instead of camera state only');
                }
              }
            }

            if (certification.requiredBehaviors.includes('singleOwnedUndo')) {
              const undo = shell.locator('.mathmaster-universal-undo:visible').first();
              if (!(await visible(undo)) || await undo.isDisabled()) {
                problems.push('Universal Undo is not enabled after a real mathematical edit');
              } else {
                const undoProblem = await clickIfReachable(undo, 'Universal Undo');
                if (undoProblem) {
                  problems.push(undoProblem);
                } else {
                  await page.waitForTimeout(160);
                  const undoneState = await mathStateSnapshot(toolRoot);
                  if (JSON.stringify(undoneState) !== JSON.stringify(baselineState)) {
                    problems.push('Universal Undo did not restore the mathematical state before the edit');
                  }
                  edit = await makeStatefulEdit(page, shell, toolId, toolRoot);
                  if (!edit) problems.push('could not recreate mathematical work after Undo for resize certification');
                  else {
                    await dismissNumericKeypad(page);
                    editedState = await mathStateSnapshot(toolRoot);
                  }
                }
              }
            }

            if (edit) {
              const beforeResize = editedState;
              await page.setViewportSize({ width: device.viewportHeight, height: device.viewportWidth });
              await page.waitForTimeout(180);
              const afterResize = await mathStateSnapshot(toolRoot);
              if (JSON.stringify(beforeResize) !== JSON.stringify(afterResize)) {
                problems.push(`resize/orientation changed mathematical state after ${edit.description}`);
              }
              const resizedShell = toolRoot.locator('.mathmaster-work-view-host[data-open="true"]').first();
              if (!(await visible(resizedShell))) {
                problems.push('Work View closed during resize/orientation change');
              }
            }
          }
          await page.screenshot({ path: path.join(familyDir, 'rotated.png') });

          // Return to a clean presentation state before mounting the next tool.
          const close = shell.getByRole('button', { name: /close/i }).first();
          if (await visible(close)) {
            try { await close.click({ timeout: 2500 }); } catch { /* next mount replaces this scene */ }
          }
        }
      }
    } catch (error) {
      // One scene that cannot be driven is a finding about that scene. It
      // used to be an uncaught exception that ended the whole run, so a single
      // slow first render reported nothing about the other 160 scenes.
      problems.push(`certification step failed: ${shortError(error)}`);
      await page.screenshot({ path: path.join(familyDir, 'failed.png') }).catch(() => {});
      await openHarness(page).catch((reloadError) => problems.push(`harness did not reload: ${shortError(reloadError)}`));
    }
    firstScene = false;
    timings.push({ device: device.id, toolId, ms: Date.now() - started, ...(await samplePage(page)) });

    if (errors.length) problems.push(`page errors: ${errors.splice(0).join(' | ')}`);
    if (problems.length) findings.push({ device: device.id, toolId, problems });
    await page.setViewportSize({ width: device.viewportWidth, height: device.viewportHeight });
  }
  await context.close();
}

await browser.close();
printTimings();
if (findings.length) console.error(JSON.stringify(findings, null, 2));
else console.log(`Stage 4 certified ${new Set(timings.map((entry) => entry.toolId)).size} tools on ${certificationDevices.length} device${certificationDevices.length === 1 ? '' : 's'}.`);
process.exitCode = findings.length ? 1 : 0;
