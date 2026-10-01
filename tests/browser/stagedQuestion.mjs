// Drive the staged function-characteristics question in a real browser, step
// by step, the way a student meets each step.
//
// HOW TO RUN (needs a dev server):
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/stagedQuestion.mjs
//   node tests/browser/stagedQuestion.mjs --write   # refresh the fixture
//   (PLAYWRIGHT_MODULE=<playwright/index.mjs> and CHROMIUM_PATH=<chrome> when
//    the defaults are not installed; ARTIFACTS_DIR=<folder> saves a screenshot
//    of every step; STAGED_QUESTION_DEVICES=phone-portrait,chromebook runs
//    only those screens.)
//
// Run in CI by .github/workflows/student-runtime-browser-gates.yml. Its first
// version mounted WorkflowRunner alone in a bare div and measured "the first
// math-field, input, svg or button" in it, which had become the zero-size
// button in the closed Work View header. It reported 54 findings, nine on
// every screen, against a fixture of none, and nothing ran it.
//
// HOW EACH STEP IS MET. stagedQuestionMain.jsx mounts the WHOLE question in the
// real QuestionEngine, inside the screen App.jsx gives a signed-in student
// (identity bar, assignment navigator, question stage). On a phone that is
// MobileViewportContainer's one-viewport layout, with the work in its own
// scroller between the task and the action bar. Step 1 is what the question
// opens on. Every later step is reached the way a student reaches it: "Next
// step" on the step before, with the answers to the earlier steps already in
// the question's draft. The plot's five points are placed through the plot
// step's own controls (select a point, type its y, Place, Check), because the
// live plotting tool reports its own state.
//
// WHAT IT CHECKS, per step and per device:
//   ARRIVE   the step counter reads the step the harness meant to open.
//   FIT      the step's question ("Current question") and the control the
//            student answers with are on screen together, with no scrolling:
//            at least 44px of the control (all of it, if it is smaller) inside
//            the window and every scroller around it, and not under the task
//            card, the action bar or anything else. The control is the plane
//            on a plot or mark step, the choices on a choice step, the field
//            otherwise — rendered elements inside the active step only. Step 1
//            is checked for its heading instead: a question opens at its task,
//            and its first step has to start on screen.
//   PLANE    a plane the student marks is at least 240px wide (a bare mount
//            outside the phone container drew it 98×70px beside the point
//            cards) and no taller than App.css lets it be: 70% of the screen,
//            or the screen less 240px, whichever is smaller (floor 140px).
//   ZOOM     a plane the student marks offers zoom in, zoom out and reset.
//   LEAK     no coordinate readout appears on a stage that asks the student to
//            MARK a feature they are later asked to write down. This is the
//            requirement the whole slice exists for, and it is the one thing a
//            payload test cannot see.
//   COVER    when the question opens, nothing pinned sits on its top edge.
//   ERRORS   no uncaught page error.
//
// Noted, not failed: how much of a marking plane is on screen when its step
// opens. The plane honours its cap, but under the pinned task card and above
// the action bar a 1366×640 Chromebook shows 254px of its 400px.
//
// Exit code 1 on any finding. `--write` records them into
// tests/platform/fixtures/stagedQuestionFindings.json, which
// tests/platform/stagedQuestionFindings.test.mjs asserts is empty — so a
// recorded regression also fails the ordinary suite with no browser needed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/stagedQuestionFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const WRITE = process.argv.includes('--write');
const SHOTS = process.env.ARTIFACTS_DIR || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const ALL_DEVICES = [
  { id: 'phone-portrait', width: 390, height: 664, mobile: true },
  { id: 'phone-landscape', width: 664, height: 390, mobile: true },
  { id: 'foldable-closed', width: 344, height: 882, mobile: true },
  { id: 'tablet', width: 820, height: 1180, mobile: true },
  { id: 'chromebook', width: 1366, height: 640, mobile: false },
  { id: 'desktop', width: 1920, height: 1080, mobile: false },
];
// STAGED_QUESTION_DEVICES=phone-portrait,chromebook runs only those.
const only = (process.env.STAGED_QUESTION_DEVICES || '').split(',').map((id) => id.trim()).filter(Boolean);
const DEVICES = only.length ? ALL_DEVICES.filter((device) => only.includes(device.id)) : ALL_DEVICES;

// y = -(x - 2)^2 + 9. Zeros at -1 and 5, y-intercept (0, 5), maximum (2, 9) —
// and the vertex IS in the table, which is the authoring rule that makes
// "click the maximum" answerable.
const QUESTION = {
  id: 'staged-audit',
  questionId: 'staged-audit',
  type: 'graphAnalysis',
  recipe: 'functionCharacteristics',
  prompt: 'The table shows a function. Graph it, then describe what it does.',
  pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
  functionFamily: 'Quadratic',
  correctEquation: '-(x - 2)^2 + 9',
  extreme: { kind: 'maximum' },
  correctDomain: 'all real numbers',
  correctRange: 'y <= 9',
};

// What a student who understands this graph answers, in the shape each step
// stores (tests/platform/graphFeatureStages.test.mjs grades the same answers).
const marked = (points) => ({
  __mathmasterWorkflowArtifact: 'featureSelection', selections: points, none: false, isComplete: true,
});
const ANSWERS = {
  plot: { __mathmasterWorkflowArtifact: 'graph', isComplete: true, isCorrect: true },
  model: 'Quadratic',
  xInterceptExists: 'Yes',
  xIntercept: marked([[-1, 0], [5, 0]]),
  xInterceptValue: '(-1, 0), (5, 0)',
  zeros: '{-1, 5}',
  yInterceptExists: 'Yes',
  yIntercept: marked([[0, 5]]),
  yInterceptValue: '(0, 5)',
  extremeKind: 'Maximum',
  extremePoint: marked([[2, 9]]),
  extremeValue: '(2, 9)',
  axisOfSymmetry: 'x = 2',
  asymptote: 'none',
  behavior: 'Increasing, then decreasing',
  domain: 'all real numbers',
  range: 'y <= 9',
};

// Stages where a printed coordinate would answer a later stage for the student.
const MUST_NOT_LEAK = new Set(['xIntercept', 'yIntercept', 'extremePoint']);

// Stages where the student's answer is a POINT they put on the plane. On a
// phone the plane is about 320px and enlarging it wins twelve percent, so
// zooming is what makes a lattice point the size of a fingertip reachable —
// and the buttons are the only path for a student who cannot pinch.
const MUST_OFFER_ZOOM = new Set(['plot', 'xIntercept', 'yIntercept', 'extremePoint']);

// What the student answers WITH, by stage kind.
const PLANE_KINDS = new Set(['coordinatePlot', 'graphFeatureSelect']);
const controlKind = (kind) => (PLANE_KINDS.has(kind) ? 'plane' : kind === 'classification' ? 'choice' : 'field');

const findings = [];
const notes = [];
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const { expandRecipe } = await import(`${repo}/src/platform/workflow/questionRecipes.js`);
const expanded = expandRecipe(QUESTION, { label: 'audit' });
if (expanded.errors.length) {
  findings.push({ device: '(all)', stage: '(recipe)', issue: expanded.errors.join('; ') });
}
const missing = expanded.workflow.filter((stage) => !(stage.id in ANSWERS)).map((stage) => stage.id);
if (missing.length) {
  findings.push({ device: '(all)', stage: '(answers)', issue: `no answer to put in the draft for: ${missing.join(', ')}` });
}

const press = (device, locator) => (device.mobile ? locator.tap() : locator.click());

// The plot step, done as a student does it without a mouse: select a point
// card, type its y, Place; then Check Point Placements.
const plotThePoints = async (page, device) => {
  const stage = page.locator('.workflow-focus__active-stage');
  for (const [index, [, y]] of QUESTION.pairs.entries()) {
    const card = stage.locator('button[aria-pressed]').nth(index);
    await card.scrollIntoViewIfNeeded();
    await press(device, card);
    const yBox = stage.locator('input[type="number"]').nth(1);
    await yBox.scrollIntoViewIfNeeded();
    await yBox.fill(String(y));
    // A phone's number keypad covers the bottom of the screen until Done.
    const done = page.locator('.mathmaster-mobile-numeric-keypad').getByRole('button', { name: /done/i });
    if (await done.count()) await press(device, done);
    const place = stage.getByRole('button', { name: /place at this coordinate/i });
    await place.scrollIntoViewIfNeeded();
    await press(device, place);
  }
  const check = stage.getByRole('button', { name: /check point placements/i });
  await check.scrollIntoViewIfNeeded();
  await press(device, check);
};

const measure = (page, { kind, firstStep, stageId }) => page.evaluate(({ kind, firstStep, stageId, leakIds }) => {
  const rendered = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  // How much of `el` a student can SEE: clipped by the window and by every
  // scroller around it, and not under anything drawn on top of it (the
  // sticky task card, the action bar, a keypad). Sampled down its middle.
  const seen = (el) => {
    if (!rendered(el)) return { height: 0, width: 0, seen: 0, top: null };
    const r = el.getBoundingClientRect();
    let top = Math.max(r.top, 0);
    let bottom = Math.min(r.bottom, window.innerHeight);
    let left = Math.max(r.left, 0);
    let right = Math.min(r.right, window.innerWidth);
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowY === 'visible' && s.overflowX === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (s.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
      if (s.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
    }
    let rows = 0;
    if (bottom > top && right > left) {
      const x = (left + right) / 2;
      for (let y = top + 1; y < bottom; y += 2) {
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) rows += 1;
      }
    }
    return { height: Math.round(r.height), width: Math.round(r.width), seen: rows * 2, top: Math.round(r.top) };
  };
  const enough = (box, need = 44) => box.seen >= Math.min(need, box.height - 2);

  const root = document.querySelector('[data-staged-id]');
  const active = root?.querySelector('.workflow-focus__active-stage');
  const controls = {
    plane: 'svg.mathmaster-responsive-canvas',
    choice: 'button, [role="radio"], input[type="radio"]',
    field: 'math-field, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
  };
  const control = active ? [...active.querySelectorAll(controls[kind])].find(rendered) || null : null;
  const plane = active ? [...active.querySelectorAll(controls.plane)].find(rendered) || null : null;
  const prompt = [...root.querySelectorAll('.mathmaster-current-question')].find(rendered) || null;
  const heading = root.querySelector('.workflow-focus__workspace-heading');
  const controlBox = seen(control);
  const promptBox = seen(prompt);
  const headingBox = seen(heading);
  const planeRect = plane?.getBoundingClientRect();
  const viewport = window.innerHeight;
  const capHeight = Math.max(140, Math.min(0.7 * viewport, viewport - 240));
  const svgPairs = leakIds.includes(stageId)
    ? [...root.querySelectorAll('svg text')].filter(rendered).map((t) => t.textContent.trim()).filter((t) => /^\(\s*-?\d/.test(t))
    : [];
  const zoomButtons = [...(active?.querySelectorAll('button') || [])].filter(rendered)
    .map((el) => `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase());
  // When the question opens, nothing pinned may sit on its top edge (a
  // navigator held sticky inside a screen that does not scroll did).
  const stageBox = root.querySelector('main.mathmaster-question-stage')?.getBoundingClientRect();
  const coverOfTop = firstStep && stageBox
    ? [0.25, 0.5, 0.75].map((share) => document.elementFromPoint(stageBox.left + stageBox.width * share, Math.max(0, stageBox.top) + 6))
      .find((hit) => hit && !hit.closest('main.mathmaster-question-stage'))
    : null;
  return {
    covered: coverOfTop ? String(coverOfTop.closest('[class]')?.className || coverOfTop.tagName).split(/\s+/)[0] : '',
    counter: root.querySelector('.workflow-focus__counter')?.textContent?.trim() || '',
    container: root.querySelector('.mathmaster-mobile-interaction-root')?.className || '',
    controlFound: Boolean(control),
    controlInStep: Boolean(control && active?.contains(control)),
    controlBox,
    controlOk: Boolean(control) && enough(controlBox),
    promptOk: Boolean(prompt) && enough(promptBox, 18),
    headingOk: Boolean(heading) && enough(headingBox, 18),
    firstStep,
    planeWidth: planeRect ? Math.round(planeRect.width) : 0,
    planeHeight: planeRect ? Math.round(planeRect.height) : 0,
    capHeight: Math.round(capHeight),
    svgPairs: svgPairs.slice(0, 6),
    zoomControls: ['zoom in', 'zoom out', 'reset view'].every((wanted) => zoomButtons.some((name) => name.includes(wanted))),
  };
}, { kind, firstStep, stageId, leakIds: [...MUST_NOT_LEAK] });

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${ORIGIN}/tests/browser/stagedQuestion.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__mmStaged === 'function');
  const run = `${device.id}-${Date.now()}`;

  for (const [index, stage] of expanded.workflow.entries()) {
    const note = (issue) => findings.push({ device: device.id, stage: stage.id, issue });
    // Steps 1 and 2 start from a fresh question; every later step from the
    // step before it, with everything up to it answered.
    const fromStep = index >= 2 ? expanded.workflow[index - 1].id : 'plot';
    const answered = index >= 2 ? expanded.workflow.slice(0, index) : [];
    const responses = Object.fromEntries(answered.map((entry) => [entry.id, ANSWERS[entry.id]]));
    const expected = await page.evaluate((scene) => window.__mmStaged(scene), {
      id: stage.id, run, question: QUESTION, responses, stageId: stage.id, openAt: fromStep,
    });
    await page.waitForSelector(`[data-staged-id="${stage.id}"] .workflow-focus__counter`);
    await page.waitForTimeout(350);
    try {
      if (index === 1) await plotThePoints(page, device);
      if (index >= 1) {
        const next = page.locator('.workflow-focus__nav-button--primary');
        await next.scrollIntoViewIfNeeded();
        await press(device, next);
        await page.waitForTimeout(350);
      }
    } catch (error) {
      note(`could not reach this step the way a student does: ${String(error.message || error).split('\n')[0]}`);
      continue;
    }

    const measured = await measure(page, { kind: controlKind(stage.kind), firstStep: index === 0, stageId: stage.id });
    const want = `${expected.stageIndex + 1} of ${expected.total}`;
    if (measured.counter !== want) note(`opened "${measured.counter}", not step ${want}`);
    if (measured.covered) note(`the top of the question opens under ${measured.covered}`);
    if (!measured.promptOk) note('the step\'s question is not on screen');
    if (!measured.controlFound) note(`no ${controlKind(stage.kind)} rendered in the step`);
    else if (!measured.controlInStep) note('the measured control is not part of this step');
    else if (index === 0 ? !measured.headingOk : !measured.controlOk) {
      note(index === 0
        ? 'the first step does not start on screen when the question opens'
        : `answer control not on screen on arriving (${measured.controlBox.seen}px of ${measured.controlBox.height}px seen)`);
    }
    if (PLANE_KINDS.has(stage.kind) && measured.planeWidth < 240) {
      note(`a ${measured.planeWidth}×${measured.planeHeight}px plane is too small to mark`);
    }
    if (measured.planeHeight > measured.capHeight + 1) {
      note(`the plane is ${measured.planeHeight}px tall, over its ${measured.capHeight}px cap`);
    }
    if (MUST_OFFER_ZOOM.has(stage.id) && !measured.zoomControls) note('a plane the student marks, with no zoom buttons');
    // Reported, not failed: how much of a marking plane is on screen when the
    // step opens. Below the pinned task card and above the action bar, a 640px
    // Chromebook shows 254 of a 400px plane (its x-axis below the fold).
    if (index > 0 && PLANE_KINDS.has(stage.kind) && measured.controlBox.seen < measured.controlBox.height - 2) {
      notes.push(`[${device.id}] ${stage.id}: ${measured.controlBox.seen} of the plane's ${measured.controlBox.height}px on screen on arriving`);
    }
    if (MUST_NOT_LEAK.has(stage.id) && measured.svgPairs.length) note(`plane printed coordinates: ${measured.svgPairs.join(' ')}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device.id}-${String(index + 1).padStart(2, '0')}-${stage.id}.png`) });

    const box = measured.controlBox;
    console.log(
      `${device.id.padEnd(16)} ${stage.id.padEnd(16)} ${stage.kind.padEnd(19)}`
      + ` ${measured.counter.padEnd(8)} prompt=${measured.promptOk ? 'y' : 'N'}`
      + ` control=${index === 0 ? (measured.headingOk ? 'heading' : 'N') : measured.controlOk ? 'y' : 'N'}`
      + ` seen=${String(box.seen).padStart(3)}/${String(box.height).padStart(3)}px`
      + ` plane=${measured.planeWidth}×${measured.planeHeight}`
      + ` pairsOnPlane=${measured.svgPairs.length} zoom=${measured.zoomControls ? 'y' : 'N'}`,
    );
  }

  errors.forEach((error) => findings.push({ device: device.id, stage: '(page)', issue: error }));
  await context.close();
  console.log('');
}

await browser.close();

if (notes.length) {
  console.log(`Plane not wholly on screen on arriving (noted, not failed): ${notes.length}`);
  notes.forEach((line) => console.log(`  ${line}`));
}
console.log(findings.length ? `FINDINGS (${findings.length}):` : 'No findings.');
findings.forEach((f) => console.log(`  [${f.device}] ${f.stage}: ${f.issue}`));
if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`\nwrote ${FINDINGS}`);
}
process.exitCode = findings.length ? 1 : 0;
