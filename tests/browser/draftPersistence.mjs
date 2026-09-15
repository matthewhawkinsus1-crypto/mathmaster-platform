// DOES UNFINISHED WORK SURVIVE? ASKED OF A REAL BROWSER.
//
//   npm run test:draft-persistence            # starts the server, runs this
//   DRAFT_SHOTS=/tmp/shots npm run test:draft-persistence
//
// PR #247 certified a SUBMITTED answer. This certifies the state before that:
// the student typed, plotted or built something and has not pressed Submit.
// Four journeys per family, because they fail for different reasons:
//
//   NAVIGATE   question A -> question B -> question A. The remount. This is the
//              reported incident, and the only one a tool's own tests can see.
//   RELOAD     the same page, loaded again. Proves the work is in storage and
//              not merely in a module that happened to stay alive.
//   REOPEN     a NEW browser context carrying the profile's storage, which is a
//              Chromebook being closed and opened again the next period.
//   REPLACEMENT a new variant of the same question must NOT inherit the
//              previous variant's work, and must not lose it either.
//
// Every comparison is structural: the stored workspace record AND the control
// values the student can see, never a screenshot. A tool that draws the right
// picture from the wrong numbers fails here.
//
// Findings land in tests/platform/fixtures/draftPersistenceFindings.json, which
// tests/platform/draftPersistenceFindings.test.mjs asserts is empty — so a
// regression fails the ordinary suite with no browser needed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DRAFT_SCENES } from './draftPersistenceScenes.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/draftPersistenceFindings.json');
const REPORT = path.join(repo, 'tests/browser/artifacts/draftPersistence/report.json');
const SHOTS = process.env.DRAFT_SHOTS || path.join(repo, 'tests/browser/artifacts/draftPersistence');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const PAGE = `${ORIGIN}/tests/browser/draftPersistence.html`;
const WRITE = process.argv.includes('--write');

// A Chromebook is the machine this has to be fast on.
const VIEWPORT = { width: 1366, height: 768 };

const findings = [];
const rows = [];
const note = (sceneId, journey, detail) => findings.push({ sceneId, journey, detail });

/* ------------------------------------------------------------------ probes */

const ready = async (page, sceneId) => {
  await page.waitForSelector(`[data-draft-scene="${sceneId}"]`, { timeout: 15000 });
  // Lazy tool chunks and MathLive both resolve after the first paint.
  await page.waitForFunction(() => !document.body.textContent.includes('Opening Work View…'), null, { timeout: 15000 });
  await page.waitForTimeout(350);
};

const controls = (page, selector) => page.locator(`[data-draft-scene] ${selector}`);

/** Replay one scene's edits. Typing is real typing — MathLive owns its own input. */
const applyEdits = async (page, scene) => {
  for (const action of scene.edit) {
    if (action.kind === 'math') {
      const field = controls(page, 'math-field').nth(action.index);
      if (!(await field.count())) { note(scene.id, 'edit', `no math-field at index ${action.index}`); continue; }
      await field.click();
      await page.keyboard.type(action.value, { delay: 12 });
      await page.keyboard.press('Tab');
    } else if (action.kind === 'fill') {
      const input = controls(page, 'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])').nth(action.index);
      if (!(await input.count())) { note(scene.id, 'edit', `no input at index ${action.index}`); continue; }
      await input.fill(action.value);
      await input.blur();
    } else if (action.kind === 'choose') {
      const select = controls(page, 'select').nth(action.index);
      if (!(await select.count())) { note(scene.id, 'edit', `no select at index ${action.index}`); continue; }
      await select.selectOption(action.value).catch(async () => {
        // Some dropdowns are authored per question; take the second option.
        const options = await select.locator('option').all();
        if (options[1]) await select.selectOption({ index: 1 });
      });
    } else if (action.kind === 'plane') {
      /*
       * A Chromebook screen is 768px tall and a coordinate plane is often
       * below the fold, so the plane is scrolled into view first — exactly what
       * the student does. Without it the click lands on the sticky work bar,
       * the point is never plotted, and the row goes green having certified an
       * empty workspace.
       */
      const box = await page.evaluate(() => {
        const svgs = [...document.querySelectorAll('[data-draft-scene] svg')]
          .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
          .filter((entry) => entry.box.width > 120 && entry.box.height > 120)
          .sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height));
        if (!svgs[0]) return null;
        svgs[0].svg.scrollIntoView({ block: 'center', inline: 'center' });
        const { x, y, width, height } = svgs[0].svg.getBoundingClientRect();
        return { x, y, width, height };
      });
      if (!box) { note(scene.id, 'edit', 'no coordinate plane to plot on'); continue; }
      await page.waitForTimeout(150);
      const target = { x: box.x + box.width * action.fx, y: box.y + box.height * action.fy };
      const onPlane = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return Boolean(element && element.closest('svg') && !element.closest('button'));
      }, target);
      if (!onPlane) { note(scene.id, 'edit', `the plane is not clickable at (${action.fx}, ${action.fy})`); continue; }
      await page.mouse.move(target.x, target.y);
      await page.mouse.down();
      await page.mouse.up();
    } else if (action.kind === 'press') {
      const button = page.locator(`[data-draft-scene] button`, { hasText: action.label }).first();
      if (await button.count()) await button.click();
    }
    await page.waitForTimeout(90);
  }
  // Longer than the hook's coalescing window, so a drag-rate writer has landed.
  await page.waitForTimeout(300);
};

/*
 * The cursor is not part of the student's work. CoordinatePlane draws a live
 * coordinate label under the pointer, and a snapshot taken with the mouse still
 * over the plane would compare that hover against a restored page where no
 * mouse has moved at all.
 */
const snapshot = async (page) => {
  await page.mouse.move(2, 2, { steps: 8 });
  await page.waitForTimeout(120);
  return page.evaluate(() => window.__mmDraft.snapshot());
};

/*
 * Did the student's work come back?
 *
 * Empty work is not evidence. A scene whose scripted edit did nothing — a
 * button that moved, a plane click that missed — would "survive" navigation
 * perfectly, and the row would go green having certified nothing. So the edit
 * is required to have CHANGED the workspace first, measured against a snapshot
 * taken before it ran. That is what makes every row below able to fail.
 */
const COACH_KEYS = [':guided-step', ':guided-collapsed'];

/*
 * Compared BOTH ways, unlike `difference`. A scene whose only evidence is a
 * workspace record that did not exist before — a graph tool writes nothing
 * until the first point is plotted — would pass a one-way "nothing was lost"
 * check while having plotted nothing at all.
 *
 * The guided-notes coach records its own collapsed state on mount, which is
 * platform chrome rather than anything the scripted edit did, so it is excluded
 * on both sides.
 */
const withoutCoachState = (state) => ({
  controls: state.controls,
  svgText: state.svgText,
  readouts: state.readouts,
  drafts: Object.fromEntries(Object.entries(state.drafts).filter(([suffix]) => !COACH_KEYS.includes(suffix))),
});

const changedSomething = (baseline, edited) => (
  JSON.stringify(withoutCoachState(baseline)) !== JSON.stringify(withoutCoachState(edited))
);

/*
 * WHAT COUNTS AS THE WORK NOT COMING BACK.
 *
 * Every value the student put in has to return unchanged. The reverse is not
 * required: a workspace may legitimately CREATE state on mount that was not
 * there when the student first arrived — the guided-notes coach records that
 * its panel is collapsed, a tool writes its starting parameters — and demanding
 * byte-equality would report those as lost work. So this is a one-way check:
 * nothing the student had may be missing or different.
 */
const difference = (before, after) => {
  const drift = [];
  const byOrder = new Map(after.controls.map((control) => [control.order, control]));
  before.controls.forEach((control) => {
    const now = byOrder.get(control.order);
    if (!now) {
      if (control.value.trim() !== '' && control.value !== 'false') {
        drift.push(`the control holding "${control.value}" (${control.name}) is gone`);
      }
      return;
    }
    if (now.value !== control.value) {
      drift.push(`${control.name || `control ${control.order}`}: "${control.value}" came back as "${now.value}"`);
    }
  });
  Object.entries(before.drafts).forEach(([suffix, value]) => {
    const now = JSON.stringify(after.drafts[suffix]);
    const was = JSON.stringify(value);
    if (now !== was) drift.push(`stored workspace "${suffix}"\n    was ${was}\n    now ${now}`);
  });
  // Point labels, plotted terms and constructed coordinates are drawn as SVG
  // text; a construction that failed to restore loses them. Only losses count —
  // a restored workspace has no pointer preview under a mouse that never moved.
  const missing = before.svgText.filter((text) => !after.svgText.includes(text));
  if (missing.length) drift.push(`the drawn workspace lost ${JSON.stringify(missing)}`);
  const lostReadouts = before.readouts.filter((text) => !after.readouts.includes(text));
  if (lostReadouts.length) drift.push(`a control readout changed: ${JSON.stringify(lostReadouts)}`);
  return drift;
};

const shoot = async (page, name) => {
  try {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  } catch { /* screenshots are an artifact, never the verdict */ }
};

/* ------------------------------------------------------------------- run */

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();
page.on('pageerror', (error) => note('page', 'runtime', String(error)));

await page.goto(PAGE);
await page.waitForSelector('[data-draft-scene]', { timeout: 30000 });
await page.evaluate(() => window.__mmDraft.clearStorage());

const timings = [];
// What each scene looked like with the student's work in it, so the reopened
// browser can be asked for the same thing rather than merely for "something".
const reopenedBaselines = {};

for (let index = 0; index < DRAFT_SCENES.length; index += 1) {
  const scene = DRAFT_SCENES[index];
  const row = { id: scene.id, label: scene.label, family: scene.family, navigate: 'n/a', reload: 'n/a', reopen: 'n/a', replacement: 'n/a' };

  await page.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(page, scene.id);
  await page.evaluate(() => window.__mmDraft.resetAttempts());

  const baseline = await snapshot(page);
  const typingStart = Date.now();
  await applyEdits(page, scene);
  timings.push({ id: scene.id, editMs: Date.now() - typingStart, actions: scene.edit.length });

  const before = await snapshot(page);
  if (!changedSomething(baseline, before)) {
    note(scene.id, 'edit', 'the scripted edit left no mathematical state, so nothing was certified');
    row.navigate = row.reload = row.reopen = 'NO WORK';
    rows.push(row);
    await shoot(page, `${scene.id}-no-work`);
    continue;
  }

  /* NAVIGATE: away to another question, and back. */
  await page.evaluate((target) => window.__mmDraft.go(target === 0 ? 1 : 0), index);
  await page.waitForTimeout(400);
  await page.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(page, scene.id);
  const afterNavigate = await snapshot(page);
  const navigateDrift = difference(before, afterNavigate);
  row.navigate = navigateDrift.length ? 'FAIL' : 'pass';
  navigateDrift.forEach((detail) => note(scene.id, 'navigate', detail));
  if (navigateDrift.length) await shoot(page, `${scene.id}-navigate`);

  /* RELOAD: the same page again, every module re-evaluated. */
  await page.reload();
  await page.waitForSelector('[data-draft-scene]', { timeout: 30000 });
  await page.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(page, scene.id);
  const afterReload = await snapshot(page);
  const reloadDrift = difference(before, afterReload);
  row.reload = reloadDrift.length ? 'FAIL' : 'pass';
  reloadDrift.forEach((detail) => note(scene.id, 'reload', detail));
  if (reloadDrift.length) await shoot(page, `${scene.id}-reload`);

  /* RESTORING IS NOT SUBMITTING. */
  const attempts = await page.evaluate(() => window.__mmDraft.attempts());
  if (attempts.length) {
    note(scene.id, 'draft-vs-submission', `restoring the workspace produced ${attempts.length} attempt(s)`);
    row.navigate = 'FAIL';
  }

  reopenedBaselines[scene.id] = before;
  rows.push(row);
}

/* REOPEN: close the browser and open it again on the same profile. */
const profile = await context.storageState();
await context.close();
const reopened = await browser.newContext({ viewport: VIEWPORT, storageState: profile });
const reopenedPage = await reopened.newPage();
reopenedPage.on('pageerror', (error) => note('page', 'runtime', String(error)));
await reopenedPage.goto(PAGE);
await reopenedPage.waitForSelector('[data-draft-scene]', { timeout: 30000 });

for (let index = 0; index < DRAFT_SCENES.length; index += 1) {
  const scene = DRAFT_SCENES[index];
  const row = rows.find((entry) => entry.id === scene.id);
  if (!row || row.reload === 'NO WORK') continue;
  await reopenedPage.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(reopenedPage, scene.id);
  const state = await snapshot(reopenedPage);
  const lost = reopenedBaselines[scene.id] ? difference(reopenedBaselines[scene.id], state) : [];
  if (lost.length) {
    lost.forEach((detail) => note(scene.id, 'reopen', detail));
    row.reopen = 'FAIL';
  } else {
    row.reopen = 'pass';
  }
}

/* REPLACEMENT: a new variant must not inherit the old variant's work. */
const replacementScene = DRAFT_SCENES.find((scene) => scene.id === 'function-operations');
if (replacementScene) {
  const index = DRAFT_SCENES.indexOf(replacementScene);
  await reopenedPage.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(reopenedPage, replacementScene.id);
  const held = await snapshot(reopenedPage);
  await reopenedPage.evaluate(() => window.__mmDraft.replace());
  await ready(reopenedPage, replacementScene.id);
  const fresh = await snapshot(reopenedPage);
  const row = rows.find((entry) => entry.id === replacementScene.id);
  const leaked = fresh.controls.some((control, order) => (
    control.value.trim() !== '' && control.value === held.controls[order]?.value && held.controls[order]?.value.trim() !== ''
  ));
  if (leaked) {
    note(replacementScene.id, 'replacement', 'a replacement variant opened holding the previous variant’s work');
    if (row) row.replacement = 'FAIL';
  } else if (row) {
    row.replacement = 'pass';
  }
  /*
   * Back to the original variant. A replacement moves EVERY question in this
   * harness to variant 1, and the work the rest of the run left behind lives
   * under variant 0 — so anything measured after this would be looking at a
   * fresh set of empty workspaces and reporting it as lost work.
   */
  await reopenedPage.evaluate(() => window.__mmDraft.variant(0));
  await ready(reopenedPage, replacementScene.id);
  const returned = await snapshot(reopenedPage);
  const lostOriginal = difference(held, returned);
  if (lostOriginal.length) {
    lostOriginal.forEach((detail) => note(replacementScene.id, 'replacement', `the ORIGINAL variant lost work: ${detail}`));
    if (row) row.replacement = 'FAIL';
  }
}

/* --------------------------------------------------- performance envelope */

/*
 * WHAT THE DRAFT LAYER COSTS THE STUDENT.
 *
 * The rule this PR is not allowed to break is that typing, plotting and
 * dragging stay instantaneous on a Chromebook. So the cost is measured rather
 * than argued: `localStorage.setItem` is wrapped for the duration of a burst,
 * and every draft write it sees is timed. Nothing else can be on that path —
 * no Firestore call is made from the edit at all, which the platform suite
 * asserts against the source; here the question is only how long the local
 * write takes.
 *
 * The budgets are deliberately tight. A single write over 4ms, or a burst
 * where writes account for more than a tenth of the time, is a Chromebook
 * feeling the difference.
 */
const MAX_SINGLE_WRITE_MS = 4;
const MAX_WRITE_SHARE = 0.10;

const instrument = (page) => page.evaluate(() => {
  window.__mmWrites = [];
  if (window.__mmWritePatched) return true;
  window.__mmWritePatched = true;
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function timed(key, value) {
    if (!String(key).startsWith('mathmaster:draft')) return original.call(this, key, value);
    const started = performance.now();
    const result = original.call(this, key, value);
    window.__mmWrites.push(performance.now() - started);
    return result;
  };
  return true;
});

const writeStats = (page) => page.evaluate(() => {
  const writes = window.__mmWrites || [];
  return {
    count: writes.length,
    totalMs: writes.reduce((sum, value) => sum + value, 0),
    maxMs: writes.reduce((worst, value) => Math.max(worst, value), 0),
  };
});

const performance_ = [];

/* Rapid typing, on the tool the incident was reported against. */
{
  const index = DRAFT_SCENES.findIndex((scene) => scene.id === 'function-operations');
  await reopenedPage.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(reopenedPage, 'function-operations');
  const field = reopenedPage.locator('[data-draft-scene] math-field').first();
  await field.click();
  await instrument(reopenedPage);
  const started = Date.now();
  // No delay: as fast as the browser will accept keystrokes, which is faster
  // than any student types.
  await reopenedPage.keyboard.type('3x^2-12x+7-4x^2+9x-1', { delay: 0 });
  const burstMs = Date.now() - started;
  await reopenedPage.waitForTimeout(200);
  const stats = await writeStats(reopenedPage);
  performance_.push({ probe: 'rapid typing', burstMs, ...stats, share: stats.totalMs / Math.max(burstMs, 1) });
}

/* Dragging an endpoint, which is the one display-rate writer in the registry. */
{
  const index = DRAFT_SCENES.findIndex((scene) => scene.id === 'interval-number-line');
  await reopenedPage.evaluate((target) => window.__mmDraft.go(target), index);
  await ready(reopenedPage, 'interval-number-line');
  // The endpoint handle itself, not a guess at where it is: a drag that starts
  // one pixel off it produces no pointermove writes at all, and the probe would
  // then report a suspiciously cheap drag that never happened.
  const HANDLE = '[data-draft-scene] svg g[role="button"][aria-label*="endpoint"]';
  // The workspace is restored from storage on mount, so the handle appears a
  // render after the scene does.
  await reopenedPage.waitForSelector(HANDLE, { timeout: 8000 }).catch(() => null);
  const handle = await reopenedPage.evaluate((selector) => {
    const target = document.querySelector(selector);
    if (!target) return null;
    target.closest('svg').scrollIntoView({ block: 'center' });
    const box = target.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: target.closest('svg').getBoundingClientRect().width };
  }, HANDLE);
  if (!handle) {
    note('performance', 'endpoint drag', 'no endpoint handle to drag, so the coalescing path was not measured');
  } else {
    await instrument(reopenedPage);
    const started = Date.now();
    await reopenedPage.mouse.move(handle.x, handle.y);
    await reopenedPage.mouse.down();
    // 60 moves is a real drag across the line, reported one event per step.
    await reopenedPage.mouse.move(handle.x - handle.width * 0.25, handle.y, { steps: 60 });
    await reopenedPage.mouse.up();
    const dragMs = Date.now() - started;
    await reopenedPage.waitForTimeout(300);
    const stats = await writeStats(reopenedPage);
    performance_.push({ probe: 'endpoint drag', burstMs: dragMs, ...stats, share: stats.totalMs / Math.max(dragMs, 1) });
    // A coalesced drag writes a handful of times, not once per frame and not
    // once in total. Both extremes mean the probe measured the wrong thing.
    if (stats.count < 2) note('performance', 'endpoint drag', `only ${stats.count} write(s): the drag did not move the endpoint`);
    if (stats.count > 30) note('performance', 'endpoint drag', `${stats.count} writes for one drag: the coalescing window is not holding`);
  }
}

performance_.forEach((probe) => {
  if (probe.maxMs > MAX_SINGLE_WRITE_MS) {
    note('performance', probe.probe, `a single draft write took ${probe.maxMs.toFixed(2)}ms (budget ${MAX_SINGLE_WRITE_MS}ms)`);
  }
  if (probe.share > MAX_WRITE_SHARE) {
    note('performance', probe.probe, `draft writes were ${(probe.share * 100).toFixed(1)}% of the burst (budget ${MAX_WRITE_SHARE * 100}%)`);
  }
});

/* ---------------------------------------------------------------- report */

await reopened.close();
await browser.close();

const report = { generatedAt: new Date().toISOString(), origin: ORIGIN, rows, timings, performance: performance_, findings };
mkdirSync(path.dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

const width = Math.max(...rows.map((row) => row.label.length), 10);
console.log('\nDRAFT PERSISTENCE — unfinished work, no Submit pressed\n');
console.log(`${'family'.padEnd(width)}  navigate  reload    reopen    replacement`);
rows.forEach((row) => {
  console.log(`${row.label.padEnd(width)}  ${row.navigate.padEnd(8)}  ${row.reload.padEnd(8)}  ${row.reopen.padEnd(8)}  ${row.replacement}`);
});

console.log('\nPERFORMANCE — what the local draft write costs\n');
performance_.forEach((probe) => {
  console.log(
    `${probe.probe.padEnd(16)}  ${probe.count} writes, ${probe.totalMs.toFixed(1)}ms total, `
    + `worst ${probe.maxMs.toFixed(2)}ms, ${(probe.share * 100).toFixed(1)}% of a ${probe.burstMs}ms burst`,
  );
});

if (WRITE) {
  /*
   * The fixture carries the WHOLE run, not only its findings. An empty findings
   * list proves nothing about a family the run never mounted, so the node-side
   * gate reads the rows and the performance probes too and can say "this gate
   * stopped covering Sequence Explorer" without a browser.
   */
  mkdirSync(path.dirname(FINDINGS), { recursive: true });
  writeFileSync(FINDINGS, `${JSON.stringify({
    generatedAt: report.generatedAt,
    journeys: ['navigate', 'reload', 'reopen', 'replacement'],
    budgets: { maxSingleWriteMs: MAX_SINGLE_WRITE_MS, maxWriteShare: MAX_WRITE_SHARE },
    families: rows,
    performance: performance_,
    findings,
  }, null, 2)}\n`);
  console.log(`\nwrote ${findings.length} finding(s) to ${path.relative(repo, FINDINGS)}`);
}

if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.sceneId}/${finding.journey}] ${finding.detail}`));
  process.exit(1);
}
console.log('\nEvery certified family kept the student’s unfinished work.');
