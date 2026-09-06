// CAN A STUDENT DO THIS ASSIGNMENT ON A PHONE?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/assignmentMobile.mjs
//   node tests/browser/assignmentMobile.mjs --write   # refresh the fixture
//
// The complaint this answers was blunt: "most of the assignment is almost
// impossible to complete on mobile", with an acceptance standard of a phone
// 360-390px wide. So the standard is written down here as rules, and each one
// is a thing a student cannot work around:
//
//   SIDEWAYS      the page shoves horizontally. Nothing else matters if the
//                 student is dragging the whole document to read a prompt.
//   PROMPT        what they were asked is on screen with the answer control.
//   REACH         the control they answer with can be brought on screen by
//                 scrolling — including scrolling an inner pane, which is what
//                 a thumb does and what window.scrollTo does not.
//   TAP           every control is at least 44px tall. Below that a finger
//                 misses, and on a matching question a mis-tap is a wrong
//                 answer.
//   PLANE         a stage that shows a graph shows enough of it to tell a line
//                 from a curve without opening anything.
//   ENLARGE       a stage where the student MARKS the plane can reach a full
//                 window one — actually covering the viewport, not merely
//                 claiming `position: fixed` — with the graph visible in it and
//                 the response controls and a way out inside, so nobody has to
//                 close it to answer.
//   PRECISION     that stage offers a way to place a point that does NOT
//                 require landing a fingertip on a lattice point. On a 390px
//                 phone the embedded plane is already 322px of a 390px screen,
//                 so enlarging wins about twelve percent and the target is no
//                 easier to hit — the measurement is written up in
//                 CoordinatePlane.jsx. Two different affordances satisfy this
//                 and the platform uses both: zoom BUTTONS (click-the-feature
//                 stages) and typed exact coordinates (the plotting
//                 workspace). Buttons and typing rather than pinch, because a
//                 student on a bus with one hand, on a trackpad, or using a
//                 switch cannot make a two-finger gesture.
//
// Findings are recorded into tests/platform/fixtures/assignmentMobileFindings.json,
// which tests/platform/assignmentMobileFindings.test.mjs asserts is empty — so a
// regression fails the ordinary suite with no browser needed.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/assignmentMobileFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const WRITE = process.argv.includes('--write');

// The stated acceptance standard is 360-390px. The foldable is 344 and is
// already claimed as supported by the staged-question audit, so it is held to
// the same standard rather than quietly exempted.
const DEVICES = [
  { id: 'phone-360', width: 360, height: 740 },
  { id: 'phone-390', width: 390, height: 664 },
  { id: 'foldable-344', width: 344, height: 882 },
];

const MIN_TAP = 44;
// Enough of a graph to read its shape at a glance. Below this a parabola and a
// line stop being distinguishable, which is the whole task on a matching
// question. It is NOT the size needed to mark a point — see ENLARGE above.
const MIN_PLANE_READ = 180;

const { expandRecipe } = await import(`${repo}/src/platform/workflow/questionRecipes.js`);

const staged = expandRecipe({
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
}, { label: 'audit' });

const GRAPH = { xMin: -6, xMax: 6, yMin: -8, yMax: 8 };

// One scene per shape the assignment actually uses. `wantsPlane` says the
// student has to read a graph to answer, so a collapsed plane is a failure
// rather than a stage that simply has no graph.
const SCENES = [
  {
    id: 'staged-graph-analysis',
    wantsPlane: true,
    marksPlane: true,
    question: {
      id: 'staged-graph-analysis',
      type: 'graphAnalysis',
      prompt: 'The table shows a function. Graph it, then describe what it does.',
      workflow: staged.workflow,
      content: { prompt: 'The table shows a function. Graph it, then describe what it does.' },
      grading: {},
    },
  },
  {
    id: 'figure-match',
    wantsPlane: true,
    question: {
      id: 'figure-match',
      type: 'relationRepresentations',
      prompt: 'Sort each graph into the family it belongs to.',
      workflow: [{
        id: 'sort',
        kind: 'figureMatch',
        prompt: 'Which family does each graph belong to?',
        items: [
          { id: 'k1', graph: { ...GRAPH, model: '2*x+1' } },
          { id: 'k2', graph: { ...GRAPH, yMax: 14, model: '2^x' } },
          { id: 'k3', graph: { ...GRAPH, model: '-x+4' } },
          { id: 'k4', graph: { ...GRAPH, yMax: 14, model: '3*2^x' } },
        ],
        categories: [{ id: 'linear', label: 'Linear' }, { id: 'exponential', label: 'Exponential' }],
      }],
      content: { prompt: 'Sort each graph into the family it belongs to.' },
      grading: { sort: { match: { k1: 'linear', k2: 'exponential', k3: 'linear', k4: 'exponential' } } },
    },
  },
  {
    id: 'choice-with-preview',
    wantsPlane: true,
    question: {
      id: 'choice-with-preview',
      type: 'relationRepresentations',
      prompt: 'Which equation describes this line?',
      workflow: [{
        id: 'pick',
        kind: 'multipleChoice',
        prompt: 'Which equation describes the line?',
        choices: [
          { id: 'a', label: 'y=2x-1' }, { id: 'b', label: 'y=-x' },
          { id: 'c', label: 'x=-2' }, { id: 'd', label: 'y=5' },
        ],
        previewOnGraph: { graph: GRAPH },
      }],
      content: { prompt: 'Which equation describes this line?' },
      grading: { pick: 'a' },
    },
  },
  {
    id: 'branching-discrete',
    wantsPlane: false,
    question: {
      id: 'branching-discrete',
      type: 'relationRepresentations',
      prompt: 'Decide whether the situation is discrete or continuous, then give its domain.',
      workflow: [
        {
          id: 'kind',
          kind: 'classification',
          prompt: 'Is this relationship discrete or continuous?',
          choices: [{ id: 'discrete', label: 'Discrete' }, { id: 'continuous', label: 'Continuous' }],
        },
        {
          id: 'discreteDomain',
          kind: 'domainInput',
          prompt: 'List the domain.',
          showWhen: { stage: 'kind', is: 'discrete' },
        },
        {
          id: 'continuousDomain',
          kind: 'domainInput',
          prompt: 'Describe the domain.',
          showWhen: { stage: 'kind', is: 'continuous' },
        },
      ],
      content: { prompt: 'Decide whether the situation is discrete or continuous, then give its domain.' },
      grading: {},
    },
  },
  {
    id: 'equation-input',
    wantsPlane: false,
    question: {
      id: 'equation-input',
      type: 'functionModeling',
      prompt: 'Write a function for the situation.',
      workflow: [{ id: 'equation', kind: 'equationInput', prompt: 'Write the function.' }],
      content: { prompt: 'Write a function for the situation.' },
      grading: {},
    },
  },
];

if (staged.errors.length) {
  console.log(`recipe errors: ${staged.errors.join('; ')}`);
}

const browser = await chromium.launch();
const findings = [];
const rows = [];

const MEASURE = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const root = document.querySelector('[data-assignment-id]');
  const doc = document.documentElement;

  // What the student answers with, in the ACTIVE stage only. A focus-mode
  // question has ten other stages in the DOM that are not being asked.
  const scope = root.querySelector('.workflow-focus__active-stage') || root;
  const controls = [...scope.querySelectorAll(
    'button, input:not([type=hidden]), textarea, select, math-field, [role=radio], [role=option], [contenteditable="true"]',
  )].filter(visible);
  const planes = [...scope.querySelectorAll('svg')].filter(visible)
    .map((svg) => svg.getBoundingClientRect())
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const onScreen = (r) => r.top < window.innerHeight && r.bottom > 0;
  const prompt = scope.querySelector('.mathmaster-question-prompt, [data-mm-prompt], h4, h3, h2');

  return {
    promptOnScreen: prompt ? onScreen(prompt.getBoundingClientRect()) : null,
    controlCount: controls.length,
    firstControlOnScreen: controls.length ? onScreen(controls[0].getBoundingClientRect()) : null,
    // Reported with their labels so a failure names the button to fix.
    smallTaps: controls
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => `${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 28)} @${Math.round(el.getBoundingClientRect().height)}px`)
      .slice(0, 8),
    plane: planes[0] ? { w: Math.round(planes[0].width), h: Math.round(planes[0].height) } : null,
    overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
    pageHeight: doc.scrollHeight,
    focusMode: Boolean(root.querySelector('.workflow-focus')),
    // Zoom offered as buttons, not only as a gesture.
    zoomControls: ['zoom in', 'zoom out', 'reset view'].every((wanted) => [...scope.querySelectorAll('button')]
      .filter(visible)
      .some((el) => `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.toLowerCase().includes(wanted))),
    // Or an exact coordinate typed in, which needs no aim at all.
    exactEntry: [...scope.querySelectorAll('button')].filter(visible)
      .some((el) => /place at this coordinate/i.test(el.textContent || ''))
      && [...scope.querySelectorAll('input')].filter(visible).length >= 2,
    navButtons: [...root.querySelectorAll('.workflow-focus__nav-button')].filter(visible).length,
  };
};

const REACH = () => {
  const root = document.querySelector('[data-assignment-id]');
  const scope = root.querySelector('.workflow-focus__active-stage') || root;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const last = [...scope.querySelectorAll('button, input, textarea, math-field, [role=radio]')].filter(visible).pop();
  // scrollIntoView walks every scrollable ancestor. The window does not: the
  // portrait layout scrolls an inner pane, so window.scrollTo moves nothing.
  last?.scrollIntoView({ block: 'center', inline: 'nearest' });
  return new Promise((resolve) => setTimeout(() => {
    const r = last?.getBoundingClientRect();
    resolve({
      lastControlReachable: Boolean(r && r.top >= 0 && r.bottom <= window.innerHeight + 1),
      lastControlLabel: (last?.textContent || last?.getAttribute('aria-label') || last?.tagName || '').trim().slice(0, 24),
    });
  }, 200));
};

// Open the enlarged workspace and ask the only two questions that matter about
// it: is the graph actually bigger, and can the student answer without closing
// it again. Both are measured on the live modal rather than inferred from props.
const ENLARGE = () => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const opener = [...document.querySelectorAll('button')].filter(visible)
    .find((el) => /enlarge/i.test(el.textContent || ''));
  if (!opener) return { opener: false, opened: false };
  opener.click();
  return new Promise((resolve) => setTimeout(() => {
    const modal = document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (!modal) { resolve({ opener: true, opened: false }); return; }
    const planes = [...modal.querySelectorAll('svg')].filter(visible)
      .map((svg) => svg.getBoundingClientRect())
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const controls = [...modal.querySelectorAll('button, input:not([type=hidden]), textarea, math-field, [role=radio]')]
      .filter(visible)
      .filter((el) => !/close/i.test(el.textContent || ''));
    const box = modal.getBoundingClientRect();
    resolve({
      opener: true,
      opened: true,
      // `position: fixed` is fixed to the VIEWPORT only while no ancestor has a
      // transform, filter or containment. When one does, the panel silently
      // becomes a box inside that ancestor — still fixed, still a dialog, and
      // a third of the screen. Measure the box, not the property.
      coverage: `${Math.round(box.width)}x${Math.round(box.height)}`,
      coversViewport: box.width >= window.innerWidth * 0.95 && box.height >= window.innerHeight * 0.95,
      planeSize: planes[0] ? `${Math.round(planes[0].width)}x${Math.round(planes[0].height)}` : 'none',
      // The graph has to be the thing you see when you press "enlarge graph",
      // not something below a list you have to scroll past. A sliver of it
      // poking above the fold is not seeing it, so measure the fraction.
      planeVisible: (() => {
        const r = planes[0];
        if (!r) return 0;
        const shown = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        return r.height > 0 ? Math.round((shown / r.height) * 100) : 0;
      })(),
      hasResponseControls: controls.length > 0,
      hasClose: [...modal.querySelectorAll('button')].filter(visible).some((el) => /close/i.test(el.textContent || '')),
    });
  }, 350));
};

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/assignmentMobile.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__mmAssignment === 'function');

  for (const scene of SCENES) {
    await page.evaluate((payload) => window.__mmAssignment(payload), { id: scene.id, question: scene.question });
    await page.waitForSelector(`[data-assignment-id="${scene.id}"]`);
    await page.waitForTimeout(500);

    const m = await page.evaluate(MEASURE);
    const reach = await page.evaluate(REACH);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) el.scrollTop = 0; });
    });

    const problems = [];
    if (m.overflowX > 4) problems.push({ rule: 'sideways', detail: `${m.overflowX}px of horizontal scroll` });
    if (m.promptOnScreen === false) problems.push({ rule: 'prompt', detail: 'the task is off screen when the question opens' });
    if (m.controlCount === 0) problems.push({ rule: 'reach', detail: 'the active step has nothing to answer with' });
    else if (m.firstControlOnScreen === false) problems.push({ rule: 'prompt', detail: 'no answer control on the first screen' });
    if (!reach.lastControlReachable && m.controlCount > 0) {
      problems.push({ rule: 'reach', detail: `"${reach.lastControlLabel}" cannot be scrolled into view` });
    }
    if (m.smallTaps.length) {
      problems.push({ rule: 'tap', detail: `below ${MIN_TAP}px: ${m.smallTaps.join(', ')}` });
    }
    if (scene.wantsPlane) {
      if (!m.plane) problems.push({ rule: 'plane', detail: 'the stage needs a graph and has none' });
      else if (m.plane.w < MIN_PLANE_READ || m.plane.h < MIN_PLANE_READ) {
        problems.push({ rule: 'plane', detail: `graph is ${m.plane.w}x${m.plane.h}, under ${MIN_PLANE_READ}px to read` });
      }
    }

    let enlarge = null;
    if (scene.marksPlane) {
      enlarge = await page.evaluate(ENLARGE);
      if (!enlarge.opener) problems.push({ rule: 'enlarge', detail: 'no way to enlarge a graph the student has to mark' });
      else if (!enlarge.opened) problems.push({ rule: 'enlarge', detail: 'the enlarge control did not open a full-window workspace' });
      else {
        if (!enlarge.coversViewport) {
          problems.push({ rule: 'enlarge', detail: `the enlarged panel is ${enlarge.coverage} on a ${device.width}x${device.height} screen — something above it is a containing block` });
        }
        if (enlarge.planeVisible < 80) {
          problems.push({ rule: 'enlarge', detail: `only ${enlarge.planeVisible}% of the enlarged graph is on screen when the panel opens` });
        }
        if (!enlarge.hasResponseControls) {
          problems.push({ rule: 'enlarge', detail: 'the enlarged workspace has no way to answer, so it has to be closed again' });
        }
        if (!enlarge.hasClose) problems.push({ rule: 'enlarge', detail: 'no reachable way out of the enlarged workspace' });
      }
      if (!m.zoomControls && !m.exactEntry) {
        problems.push({
          rule: 'precision',
          detail: 'a plane the student marks with neither zoom buttons nor typed coordinates, so the only way to answer is to hit a lattice point with a fingertip',
        });
      }
      await page.evaluate(() => {
        const close = [...document.querySelectorAll('button')].find((el) => /close/i.test(el.textContent || ''));
        close?.click();
      });
      await page.waitForTimeout(250);
    }

    rows.push({
      device: device.id,
      scene: scene.id,
      plane: m.plane ? `${m.plane.w}x${m.plane.h}` : '—',
      controls: m.controlCount,
      small: m.smallTaps.length,
      overflowX: m.overflowX,
      page: m.pageHeight,
      focus: m.focusMode,
    });
    if (problems.length) findings.push({ device: device.id, scene: scene.id, problems });
  }
  await context.close();
}

await browser.close();

console.log(`\nComposed assignment questions through QuestionEngine, on ${DEVICES.map((d) => `${d.width}px`).join(' / ')}\n`);
console.log('device'.padEnd(15), 'scene'.padEnd(24), 'plane'.padEnd(10), 'controls'.padStart(9), 'small'.padStart(6), 'xScroll'.padStart(8), 'page'.padStart(6), 'focus'.padStart(6));
rows.forEach((r) => console.log(
  r.device.padEnd(15), r.scene.padEnd(24), r.plane.padEnd(10),
  String(r.controls).padStart(9), String(r.small).padStart(6),
  String(r.overflowX).padStart(8), String(r.page).padStart(6), String(r.focus).padStart(6),
));

if (findings.length) {
  console.log(`\n${findings.length} scene(s) fail the phone standard:`);
  findings.forEach(({ device, scene, problems }) => {
    console.log(`  ${device} · ${scene}`);
    problems.forEach((p) => console.log(`    ${p.rule}: ${p.detail}`));
  });
} else {
  console.log('\nEvery composed question meets the phone standard at 344-390px.');
}

if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    devices: DEVICES,
    minTap: MIN_TAP,
    minPlaneRead: MIN_PLANE_READ,
    measured: rows.length,
    findings,
  }, null, 2)}\n`);
  console.log(`\nWrote ${FINDINGS}`);
}
