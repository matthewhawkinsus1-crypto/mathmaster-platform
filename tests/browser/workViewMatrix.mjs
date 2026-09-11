// CAN A STUDENT DO THE ACTIVITY IN WORK VIEW — AND COME BACK OUT WITH IT?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/workViewMatrix.mjs
//   node tests/browser/workViewMatrix.mjs --write    # refresh the fixture
//   WORK_VIEW_SHOTS=/tmp/shots node tests/browser/workViewMatrix.mjs
//
// Stage 3A moved four tool families onto the shared Work View shell. Enlarging
// used to mean a bigger graph with the controls left behind the backdrop, so
// the rules below are about the ACTIVITY reaching the enlarged view, not about
// the picture:
//
//   CONTROLS   every capability the tool registered is on screen and pressable.
//              A Fit View button that rendered below the fold is not a control
//              the student has.
//   CLIPPED    no registered control is cut off by the edge of the viewport or
//              by its own scroll container.
//   COVER      nothing floats over the workspace. The action region is a grid
//              row, so it takes height from the graph rather than sitting on
//              top of it — the failure the brief names outright.
//   MAJORITY   on a phone the mathematics gets most of the usable viewport.
//              A Work View that spends half a 390px screen on chrome has not
//              enlarged anything.
//   CHROME     no section tabs, question bubbles or TEKS badges over the tool
//              on a narrow screen.
//   AXIS       no more major tick labels than the shared scale service allows.
//              200 numbers along an axis is a grey band, not a readable scale.
//   UNDO       after one edit the platform Undo is enabled, and pressing it
//              takes the edit back.
//   CAMERA     Fit View changes the camera and NOTHING else: not the plotted
//              points, not the undo depth.
//   STATE      entering and leaving Work View, opening drawers and rotating the
//              phone leave the mathematics exactly as it was. This is the #185
//              class of bug — display fitting rewriting `predictionX` — and it
//              is the one rule here that is about correctness rather than
//              layout.
//
// Findings land in tests/platform/fixtures/workViewMatrixFindings.json, which
// tests/platform/workViewMatrixFindings.test.mjs asserts is empty — so a
// regression fails the ordinary suite with no browser needed. Screenshots are
// written beside them for the CI artifact.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/workViewMatrixFindings.json');
const SHOTS = process.env.WORK_VIEW_SHOTS || path.join(repo, 'tests/browser/artifacts/workView');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const WRITE = process.argv.includes('--write');

// The shared scale service caps major labels at 12. Asserted here against the
// rendered axis rather than against the service, because a tool with its own
// renderer can bypass the service and only the DOM says whether it did.
const MAX_AXIS_LABELS = 12;
// What fraction of the usable viewport the mathematics gets on a phone. The
// rest is the thin header, the drawers when open, and the action row.
const MIN_MOBILE_WORKSPACE_SHARE = 0.55;

const DEVICES = [
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
  { id: 'iphone-portrait', width: 390, height: 844, mobile: true },
  { id: 'iphone-landscape', width: 844, height: 390, mobile: true },
];

/*
 * One question per family, authored the way the bank authors them.
 *
 * `edit` is how a student makes a mathematical change on that tool, and
 * `readState` is what must survive Work View opening, closing, rotating and
 * both drawers. They are different per tool because the answer is: points on
 * one, parameters on another, a dropdown on a third.
 */
const SCENES = [
  {
    id: 'transformations-plot',
    family: 'TransformationsLab',
    marksPlane: true,
    question: {
      id: 'transformations-plot',
      type: 'transformationsLab',
      prompt: 'Transform the graph by moving each defining point to its new location.',
      mode: 'plotTransform',
      family: 'linear',
      target: { a: 1, b: 1, h: 2, k: -3 },
      sourcePoints: [[-2, 1], [0, 3], [2, 5]],
      sourceLabel: 'Source graph',
      graphBounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      snapStep: 1,
    },
  },
  {
    id: 'transformations-match',
    family: 'TransformationsLab',
    marksPlane: false,
    question: {
      id: 'transformations-match',
      type: 'transformationsLab',
      prompt: 'Change a, h and k until your graph sits on the dashed target.',
      mode: 'match',
      family: 'quadratic',
      target: { a: 2, h: -1, k: 3 },
      initial: { a: 1, h: 0, k: 0 },
      graphBounds: { xMin: -7, xMax: 7, yMin: -7, yMax: 9 },
    },
  },
  {
    id: 'graphing2-construct',
    family: 'Graphing2',
    marksPlane: true,
    question: {
      id: 'graphing2-construct',
      type: 'graphing2',
      prompt: 'Graph y = 2x + 1 using two points.',
      mode: 'slopeIntercept',
      line: { m: 2, b: 1 },
      graphBounds: { xMin: -6, xMax: 6, yMin: -8, yMax: 10 },
      tolerance: 0.12,
    },
  },
  {
    id: 'function-investigation',
    family: 'FunctionInvestigation2',
    marksPlane: false,
    question: {
      id: 'function-investigation',
      type: 'functionInvestigation2',
      prompt: 'Find every point where this graph crosses an axis.',
      mode: 'intercepts',
      function: { type: 'quadratic', a: 1, h: 2, k: -4 },
      graphBounds: { xMin: -7, xMax: 9, yMin: -9, yMax: 9 },
    },
  },
  {
    id: 'constraint-builder',
    family: 'ConstraintFunctionBuilder',
    marksPlane: false,
    question: {
      id: 'constraint-builder',
      type: 'constraintFunctionBuilder',
      prompt: 'Build any relation that has a maximum and puts its vertex in Quadrant II.',
      allowedFamilies: ['quadratic', 'absolute', 'linear'],
      constraints: [
        { id: 'family', kind: 'family', value: 'quadratic', label: 'A quadratic relation' },
        { id: 'max', kind: 'extremum', value: 'maximum', label: 'Has a maximum' },
        { id: 'quadrant', kind: 'vertexQuadrant', value: 'II', label: 'Vertex in Quadrant II' },
      ],
      graph: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
    },
  },
  {
    id: 'graph-construction',
    family: 'InteractiveGraphWorkspace',
    marksPlane: true,
    question: {
      id: 'graph-construction',
      type: 'functionGraph',
      prompt: 'Graph y = 2x + 1, then give its domain.',
      functionSpec: { type: 'linear', m: 2, b: 1 },
      pointTasks: [
        { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
        { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
      ],
      analysisParts: [
        { id: 'domain', kind: 'domain', notation: 'interval', acceptedAnswers: ['(-∞, ∞)', '(-inf, inf)'] },
      ],
    },
  },
];

/* ------------------------------------------------------------------ probes */

// Serialised into the page, so everything they need has to be inside them.
const VISIBILITY_HELPERS = `
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const label = (el) => (el.getAttribute('data-work-view-action')
    || el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 32);
`;

const OPEN_WORK_VIEW = () => {
  // An aiming tool on a wide screen opens Work View for the student, so there
  // is no button left to press. Already open is the success case, not a
  // missing control.
  if (document.querySelector('.mathmaster-work-view-host[data-open="true"]')) return true;
  const opener = [...document.querySelectorAll('button')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .find((el) => /enlarge|work view/i.test(el.textContent || ''));
  if (!opener) return false;
  opener.click();
  return true;
};

const CLOSE_WORK_VIEW = () => {
  const shell = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  const close = shell && [...shell.querySelectorAll('.mathmaster-work-view-header button')]
    .find((el) => /close/i.test(el.textContent || ''));
  close?.click();
  return Boolean(close);
};

const TOGGLE_DRAWER = (name) => {
  const shell = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  const button = shell && [...shell.querySelectorAll('.mathmaster-work-view-header button')]
    .find((el) => (el.textContent || '').trim().toLowerCase() === name);
  button?.click();
  return Boolean(button);
};

// Everything the rules above need, read off the live modal in one pass.
const MEASURE_WORK_VIEW = new Function(`
  ${VISIBILITY_HELPERS}
  const shell = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
  if (!shell) return { open: false };
  const shellBox = shell.getBoundingClientRect();
  const actions = shell.querySelector('.mathmaster-work-view-actions');
  const surface = shell.querySelector('.mathmaster-work-view-surface');
  const registered = [...shell.querySelectorAll('[data-work-view-action]')];
  const viewportBox = { width: window.innerWidth, height: window.innerHeight };

  const planes = [...shell.querySelectorAll('svg')].filter(visible)
    .map((svg) => ({ box: svg.getBoundingClientRect(), labels: svg.querySelectorAll('text').length }))
    .sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height));
  const plane = planes[0] || null;

  // WHAT THE WORKSPACE ACTUALLY HAS, ONCE THE KEYPAD STANDS IN FRONT OF IT.
  //
  // MathMaster's numeric keypad is a fixed panel above everything, so while it
  // is up the panel genuinely is shorter. Measuring the workspace against the
  // whole screen would read that as the layout failing to fill the shell, and
  // measuring the plane's full box would read a scrolled surface as an overlap.
  // Both are the probe being wrong, not the layout.
  const keypad = document.querySelector('.mathmaster-mobile-numeric-keypad');
  const keypadBox = keypad && visible(keypad) ? keypad.getBoundingClientRect() : null;
  const availableBottom = keypadBox ? Math.min(shellBox.bottom, keypadBox.top) : shellBox.bottom;
  const availableHeight = Math.max(1, availableBottom - shellBox.top);
  const surfaceBox = surface ? surface.getBoundingClientRect() : null;
  // The part of the plane the surface is not clipping — what the student sees.
  const planeSeen = plane && surfaceBox ? {
    left: Math.max(plane.box.left, surfaceBox.left),
    right: Math.min(plane.box.right, surfaceBox.right),
    top: Math.max(plane.box.top, surfaceBox.top),
    bottom: Math.min(plane.box.bottom, surfaceBox.bottom),
  } : (plane ? plane.box : null);

  // A control is clipped when any edge of it falls outside the viewport, or
  // outside the scroll container it lives in. Both are ways for a registered
  // capability to be present in the DOM and unusable.
  const clipped = [];
  const offScreen = [];
  registered.concat([...shell.querySelectorAll('.mathmaster-work-view-header button')]).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!visible(el)) { offScreen.push(label(el)); return; }
    if (r.left < -1 || r.top < -1 || r.right > viewportBox.width + 1 || r.bottom > viewportBox.height + 1) {
      clipped.push(label(el) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    if (r.height < 44) clipped.push(label(el) + ' only ' + Math.round(r.height) + 'px tall');
  });

  // IS EACH REGISTERED CONTROL THE THING A FINGER ACTUALLY REACHES?
  //
  // Present, visible and unclipped is not enough. The calculator launcher is
  // fixed to the bottom-right corner with a z-index far above this panel, and
  // on a 390px phone it sat directly on the Clear button: the control was in
  // the DOM, the right size, in the viewport, and untappable. Ask the browser
  // what is on top at the middle of each one.
  const buried = [];
  registered.filter(visible).forEach((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      buried.push(label(el) + ' is under ' + (hit.className ? String(hit.className).slice(0, 40) : hit.tagName));
    }
  });

  // Does anything sit ON the graph? Sample the middle of the plane: whatever
  // the browser says is on top there is what a student's finger reaches.
  let covering = null;
  // Sampled at the middle of the VISIBLE part of the plane, not of its full box.
  // The workspace surface scrolls — focusing a parameter field scrolls the graph
  // most of the way out of view — and the full box's centre then lands below the
  // surface entirely, on whatever is painted there. That reads as an overlay and
  // is nothing of the kind. Too little left to sample means the student has
  // scrolled the graph away, which is their choice and not an occlusion.
  if (plane && planeSeen && planeSeen.bottom - planeSeen.top > 24 && planeSeen.right - planeSeen.left > 24) {
    const midX = Math.round((planeSeen.left + planeSeen.right) / 2);
    const midY = Math.round((planeSeen.top + planeSeen.bottom) / 2);
    const top = document.elementFromPoint(midX, midY);
    if (top && !top.closest('svg') && !top.classList.contains('mathmaster-work-view-surface')) {
      covering = (top.className && String(top.className).slice(0, 48)) || top.tagName;
    }
    // And does the action region overlap it?
    if (actions && planeSeen) {
      const a = actions.getBoundingClientRect();
      const overlapW = Math.min(a.right, planeSeen.right) - Math.max(a.left, planeSeen.left);
      const overlapH = Math.min(a.bottom, planeSeen.bottom) - Math.max(a.top, planeSeen.top);
      if (overlapW > 2 && overlapH > 2) covering = 'work-view-actions overlaps the plane by ' + Math.round(overlapW) + 'x' + Math.round(overlapH);
    }
  }

  return {
    open: true,
    layout: shell.getAttribute('data-layout'),
    orientation: shell.getAttribute('data-orientation'),
    controlsPlacement: shell.getAttribute('data-controls'),
    shell: { w: Math.round(shellBox.width), h: Math.round(shellBox.height) },
    coversViewport: shellBox.width >= viewportBox.width * 0.95 && shellBox.height >= viewportBox.height * 0.95,
    registeredControls: registered.filter(visible).map(label),
    cameraOnlyControls: registered.filter((el) => el.getAttribute('data-camera-only') === 'true').map(label),
    clipped,
    offScreen,
    buried,
    covering,
    plane: plane ? { w: Math.round(plane.box.width), h: Math.round(plane.box.height), labels: plane.labels } : null,
    axisLabels: plane ? plane.labels : 0,
    // The share of the shell the workspace surface actually gets.
    workspaceShare: surfaceBox ? (Math.min(surfaceBox.bottom, availableBottom) - surfaceBox.top) / availableHeight : 0,
    keypad: keypadBox ? Math.round(keypadBox.height) : 0,
    // DOES THE LAYOUT REACH THE BOTTOM OF THE PANEL?
    //
    // The shell rows are claimed by name because a closed drawer is
    // display:none and therefore not a grid item: with positional rows the
    // body landed in an auto row, sized itself to its content, and left a strip
    // of empty panel under it with the action row floating in the middle. The
    // panel still measured full-screen, so every other rule here passed.
    unusedPanel: Math.round(availableBottom - (actions ? actions.getBoundingClientRect().bottom : availableBottom)),
    instruction: (shell.querySelector('.mathmaster-work-view-instruction')?.textContent || '').trim().slice(0, 60),
    drawerOpen: shell.querySelector('.mathmaster-work-view-drawer[data-open="true"]')
      ? (shell.querySelector('.mathmaster-work-view-drawer[data-open="true"]').getAttribute('aria-label') || '')
      : null,
    undoEnabled: registered.some((el) => /undo/i.test(label(el)) && !el.disabled),
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
`);

// Assignment chrome that must not be on screen over a narrow Work View.
const MEASURE_CHROME = new Function(`
  ${VISIBILITY_HELPERS}
  const selectors = [
    '.mathmaster-section-tabs',
    '.mathmaster-question-number-strip',
    '.mathmaster-assignment-unified-nav',
    '.mathmaster-question-alignment',
    '.mathmaster-tool-task-card',
  ];
  return selectors.filter((selector) => [...document.querySelectorAll(selector)].some(visible));
`);

/*
 * WHAT THE STUDENT HAS DECIDED, READ OFF THE DOM.
 *
 * Not the React state — the point of this probe is to catch a Work View change
 * that rewrote mathematics, and reading the same state the change would have
 * corrupted proves nothing. Plotted point labels, the value of every answer
 * field, every selected option. If any of these differ before and after, a
 * presentation change touched the mathematics.
 */
const READ_MATH_STATE = new Function(`
  ${VISIBILITY_HELPERS}
  const scope = document.querySelector('[data-scene-id]') || document.body;
  // THE TOOL'S OWN DOM ONLY.
  //
  // The shell's header, drawers and action rail exist in one layout and not the
  // other, so including them would make "before" and "after" differ for a reason
  // that has nothing to do with the mathematics — and would hide the failure
  // this probe is for. The tool subtree is the same instance either way, because
  // Work View is a CSS change around a child that is never remounted.
  const chrome = (el) => el.closest && el.closest('.mathmaster-work-view-header, .mathmaster-work-view-drawer, .mathmaster-work-view-actions, .mathmaster-work-view-instruction');
  const fields = [...scope.querySelectorAll('input, select, textarea')]
    .filter((el) => el.type !== 'hidden' && !chrome(el))
    .map((el) => (el.getAttribute('aria-label') || el.name || el.placeholder || el.id || '') + '=' + String(el.value));

  // WHAT THE STUDENT HAS PLACED, NOT WHAT THE PLANE HAPPENS TO BE DRAWING.
  //
  // The first version of this read every numeric <text> in the SVG, which meant
  // the axis tick labels and — the one that actually bit — the crosshair
  // coordinate readout that follows the pointer. A mouse resting over the plane
  // after a plot made "before" and "after" differ on their own, and three real
  // rules failed for a reason that had nothing to do with any of them.
  //
  // Student marks carry a P or S label; the tools each also state their
  // placements in words beside the plane, which is the reading that survives the
  // plane being a different size in the two layouts.
  const marks = [...scope.querySelectorAll('svg text')]
    .filter((node) => !chrome(node))
    .map((node) => (node.textContent || '').trim())
    .filter((text) => /^(P|S)\\d+$/.test(text));
  const placements = [...scope.querySelectorAll('dd, span, p')]
    .filter((el) => !chrome(el) && el.children.length === 0)
    .map((el) => (el.textContent || '').trim())
    .filter((text) => /^\\(-?\\d[^)]*\\)$/.test(text)
      || /^(Not placed|None yet|Undefined)$/.test(text)
      || /defining points plotted/.test(text)
      || /^y\\s*=/.test(text));
  return { fields, marks, placements };
`);

/*
 * ONE MATHEMATICAL EDIT, MADE THE WAY A STUDENT MAKES IT.
 *
 * Real pointer gestures through Playwright, not synthetic events dispatched at
 * an element. The first version of this probe dispatched PointerEvents and
 * plotted nothing — CoordinatePlane captures the pointer and reads its geometry
 * from getBoundingClientRect at event time, so a hand-built event with the right
 * coordinates still misses the capture it expects. A gate that cannot make the
 * edit cannot check the Undo that follows it, and it said so quietly.
 *
 * Each tool is edited the way its activity is answered: points on the plotting
 * ones, a parameter on the matching one, a typed intercept on the reading one.
 */
const planeBox = async (page) => {
  const box = await page.evaluate(() => {
    const shell = document.querySelector('.mathmaster-work-view-host[data-open="true"]') || document;
    const svg = [...shell.querySelectorAll('svg')]
      .filter((el) => el.getBoundingClientRect().width > 40)
      .sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height)
        - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  return box;
};

// Press, slide, lift — the gesture a phone actually sends, and the one the
// plane grades on release rather than on touch-down.
const plotAt = async (page, fractionX, fractionY) => {
  const box = await planeBox(page);
  if (!box) return false;
  const x = box.x + box.width * fractionX;
  const y = box.y + box.height * fractionY;
  await page.mouse.move(x - 12, y - 12);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  return true;
};

const typeIntoFirstField = async (page, selector, value) => {
  const field = page.locator(`.mathmaster-work-view-host[data-open="true"] ${selector}`).first();
  if (!(await field.count())) return null;
  await field.fill(String(value));
  await field.dispatchEvent('change');
  await page.waitForTimeout(250);
  return `typed ${value}`;
};

const makeEdit = async (page, sceneId) => {
  if (sceneId === 'transformations-plot' || sceneId === 'graphing2-construct') {
    return (await plotAt(page, 0.62, 0.38)) ? 'plotted a point' : null;
  }
  if (sceneId === 'graph-construction') {
    // This workspace places a point in two moves: choose which point you are
    // being asked for, then put it somewhere. A click on the plane with nothing
    // selected is correctly ignored.
    const task = page.locator('.mathmaster-work-view-host[data-open="true"] button[aria-pressed]').first();
    if (await task.count()) await task.click();
    await page.waitForTimeout(150);
    return (await plotAt(page, 0.5, 0.45)) ? 'selected a point task and placed it' : null;
  }
  if (sceneId === 'transformations-match' || sceneId === 'constraint-builder') {
    // Both are answered by moving a coefficient. The builder opens on a
    // deliberately collapsed model (a = 0), so this is the first real
    // mathematical choice the student makes — and the one that flips its
    // submit control on.
    return await typeIntoFirstField(page, 'input[type="number"]', '3');
  }
  return await typeIntoFirstField(page, 'input:not([type="number"]):not([type="hidden"])', '2, 4');
};

/*
 * A REAL CLICK, NOT `element.click()`.
 *
 * Dispatching click on the node bypasses hit-testing, so a control buried under
 * the keypad or the calculator still "works" for the test — which is precisely
 * the regression this gate exists to catch, passing silently. Playwright's click
 * performs the actionability checks a finger does and fails when something else
 * would receive the press.
 */
const pressControl = async (page, pattern) => {
  const control = page
    .locator('.mathmaster-work-view-host[data-open="true"] [data-work-view-action]')
    .filter({ hasText: pattern })
    .first();
  if (!(await control.count()) || await control.isDisabled()) return null;
  try {
    await control.click({ timeout: 4000 });
    return 'pressed';
  } catch (error) {
    return `blocked: ${String(error?.message || error).split('\n')[0].slice(0, 120)}`;
  }
};

/* ------------------------------------------------------------------- run */

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const findings = [];
const rows = [];
const shots = [];

const shoot = async (page, name) => {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(path.relative(repo, file));
};

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: device.mobile ? 3 : 1,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/workViewMatrix.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__mmWorkView === 'function');

  for (const scene of SCENES) {
    const problems = [];
    const tag = `${device.id}__${scene.id}`;
    await page.evaluate((payload) => window.__mmWorkView(payload), { id: scene.id, question: scene.question });
    await page.waitForSelector(`[data-scene-id="${scene.id}"]`);
    await page.waitForTimeout(450);

    // 1. Standard view, before anything is enlarged.
    await shoot(page, `${tag}__1-standard`);
    // The embedded reading is the baseline for the state-integrity rule: it is
    // what the mathematics looked like before Work View existed on this
    // question, and opening the shell must not move it.
    const embedded = await page.evaluate(READ_MATH_STATE);

    // 2. Work View.
    const opened = await page.evaluate(OPEN_WORK_VIEW);
    await page.waitForTimeout(400);
    if (!opened) {
      problems.push({ rule: 'controls', detail: 'no control opens Work View on this tool' });
      rows.push({ device: device.id, scene: scene.id, opened: false });
      findings.push({ device: device.id, scene: scene.id, problems });
      continue;
    }
    await shoot(page, `${tag}__2-work-view`);
    const view = await page.evaluate(MEASURE_WORK_VIEW);
    const openedState = await page.evaluate(READ_MATH_STATE);
    if (JSON.stringify(openedState) !== JSON.stringify(embedded)) {
      // The #185 class of bug: a display change that rewrote a mathematical
      // default. Nothing a student has decided may move because a panel opened.
      problems.push({ rule: 'state', detail: 'opening Work View changed the mathematics' });
    }

    if (!view.open) {
      problems.push({ rule: 'controls', detail: 'the enlarge control did not open the Work View shell' });
    } else {
      if (!view.coversViewport) {
        problems.push({ rule: 'cover', detail: `the shell is ${view.shell.w}x${view.shell.h} on a ${device.width}x${device.height} screen — an ancestor is acting as its containing block` });
      }
      if (!view.registeredControls.length) {
        problems.push({ rule: 'controls', detail: 'no registered capability rendered a control' });
      }
      if (view.offScreen.length) {
        problems.push({ rule: 'controls', detail: `registered but not visible: ${view.offScreen.join(', ')}` });
      }
      if (view.clipped.length) {
        problems.push({ rule: 'clipped', detail: view.clipped.join(', ') });
      }
      if (view.buried.length) {
        problems.push({ rule: 'cover', detail: view.buried.join(', ') });
      }
      if (view.covering) {
        problems.push({ rule: 'cover', detail: `something sits over the workspace: ${view.covering}` });
      }
      if (view.axisLabels > MAX_AXIS_LABELS * 2 + 4) {
        // Two axes plus point labels and a caption; past that the axis is a
        // grey band rather than a scale.
        problems.push({ rule: 'axis', detail: `${view.axisLabels} text labels on the enlarged plane, over the readable ceiling` });
      }
      if (view.overflowX > 4) {
        problems.push({ rule: 'clipped', detail: `${view.overflowX}px of horizontal scroll with Work View open` });
      }
      if (!view.instruction) {
        problems.push({ rule: 'controls', detail: 'no current instruction in the enlarged view' });
      }
      if (view.unusedPanel > 8) {
        problems.push({ rule: 'majority', detail: `${view.unusedPanel}px of the panel below the controls belongs to nothing — the layout is not filling the shell` });
      }
      if (device.mobile && view.workspaceShare < MIN_MOBILE_WORKSPACE_SHARE) {
        problems.push({ rule: 'majority', detail: `the workspace gets ${Math.round(view.workspaceShare * 100)}% of the shell, under the ${Math.round(MIN_MOBILE_WORKSPACE_SHARE * 100)}% a phone owes the mathematics` });
      }
      if (device.mobile) {
        const chrome = await page.evaluate(MEASURE_CHROME);
        if (chrome.length) {
          problems.push({ rule: 'chrome', detail: `assignment chrome still on screen over the tool: ${chrome.join(', ')}` });
        }
      }
    }

    // 3 and 4. The drawers.
    if (await page.evaluate(TOGGLE_DRAWER, 'task')) {
      await page.waitForTimeout(200);
      await shoot(page, `${tag}__3-task-drawer`);
      const withTask = await page.evaluate(MEASURE_WORK_VIEW);
      if (withTask.drawerOpen !== 'Original task') {
        problems.push({ rule: 'controls', detail: 'the Task control did not open the task drawer' });
      }
      await page.evaluate(TOGGLE_DRAWER, 'task');
      await page.waitForTimeout(150);
    } else {
      problems.push({ rule: 'controls', detail: 'no Task drawer in the enlarged view' });
    }

    if (await page.evaluate(TOGGLE_DRAWER, 'help')) {
      await page.waitForTimeout(200);
      await shoot(page, `${tag}__4-help-drawer`);
      await page.evaluate(TOGGLE_DRAWER, 'help');
      await page.waitForTimeout(150);
    }

    // 5. A real edit, and the Undo that has to follow it.
    const beforeEdit = await page.evaluate(READ_MATH_STATE);
    const edit = await makeEdit(page, scene.id);
    await page.waitForTimeout(350);
    await shoot(page, `${tag}__5-after-edit`);
    const edited = await page.evaluate(READ_MATH_STATE);

    if (!edit) {
      problems.push({ rule: 'undo', detail: 'found nothing in the enlarged view to make a mathematical edit with' });
    } else if (JSON.stringify(edited) === JSON.stringify(beforeEdit)) {
      problems.push({ rule: 'undo', detail: `"${edit}" changed nothing the student can see` });
    } else {
      const afterEdit = await page.evaluate(MEASURE_WORK_VIEW);

      // THE LAYOUT RULES RUN AGAIN HERE, AND THIS IS THE PASS THAT MATTERS.
      //
      // Typing into a parameter opens the numeric keypad — a fixed panel above
      // everything — and the calculator launcher is always there. Measuring
      // occlusion only on the freshly-opened view checks the easy case and
      // misses the state a student is actually in while working.
      if (afterEdit.clipped.length) {
        problems.push({ rule: 'clipped', detail: `after "${edit}": ${afterEdit.clipped.join(', ')}` });
      }
      if (afterEdit.offScreen.length) {
        problems.push({ rule: 'controls', detail: `after "${edit}", registered but not visible: ${afterEdit.offScreen.join(', ')}` });
      }
      if (afterEdit.buried.length) {
        problems.push({ rule: 'cover', detail: `after "${edit}": ${afterEdit.buried.join(', ')}` });
      }
      if (afterEdit.covering) {
        problems.push({ rule: 'cover', detail: `after "${edit}", something sits over the workspace: ${afterEdit.covering}` });
      }
      if (device.mobile && afterEdit.workspaceShare < MIN_MOBILE_WORKSPACE_SHARE) {
        problems.push({ rule: 'majority', detail: `after "${edit}" the workspace gets ${Math.round(afterEdit.workspaceShare * 100)}% of what is left of the screen` });
      }
      await shoot(page, `${tag}__5b-after-edit-controls`);

      if (!afterEdit.undoEnabled) {
        problems.push({ rule: 'undo', detail: `Undo is still disabled after "${edit}"` });
      } else {
        await shoot(page, `${tag}__6-undo-enabled`);

        // CAMERA IS NOT AN EDIT. Fit View before the Undo: it must change
        // neither the mathematics nor what Undo is about to give back.
        if (afterEdit.cameraOnlyControls.some((name) => /fit/i.test(name))) {
          const fit = await pressControl(page, /fit/i);
          if (fit && fit !== 'pressed') problems.push({ rule: 'cover', detail: `Fit View could not be pressed — ${fit}` });
          await page.waitForTimeout(250);
          const afterFit = await page.evaluate(READ_MATH_STATE);
          if (JSON.stringify(afterFit) !== JSON.stringify(edited)) {
            problems.push({ rule: 'camera', detail: 'Fit View changed the mathematics, not just the camera' });
          }
        }

        const pressed = await pressControl(page, /undo/i);
        if (pressed !== 'pressed') {
          problems.push({ rule: 'cover', detail: `Undo could not be pressed after "${edit}" — ${pressed || 'the control was absent or disabled'}` });
        }
        await page.waitForTimeout(350);
        const undone = await page.evaluate(READ_MATH_STATE);
        if (JSON.stringify(undone) !== JSON.stringify(beforeEdit)) {
          problems.push({ rule: 'undo', detail: `Undo after "${edit}" did not restore the state before it` });
        }
        // Make the edit again, so the state checks below have student work to
        // preserve rather than an empty workspace that would survive anything.
        await makeEdit(page, scene.id);
        await page.waitForTimeout(300);
      }
    }

    // 7. Out of Work View, and back in. Nothing mathematical may move.
    const keptIn = await page.evaluate(READ_MATH_STATE);
    await page.evaluate(CLOSE_WORK_VIEW);
    await page.waitForTimeout(350);
    await shoot(page, `${tag}__7-closed`);
    const keptOut = await page.evaluate(READ_MATH_STATE);
    if (JSON.stringify(keptOut) !== JSON.stringify(keptIn)) {
      problems.push({ rule: 'state', detail: 'closing Work View changed the mathematics' });
    }

    await page.evaluate(OPEN_WORK_VIEW);
    await page.waitForTimeout(350);
    const reopened = await page.evaluate(READ_MATH_STATE);
    if (JSON.stringify(reopened) !== JSON.stringify(keptIn)) {
      problems.push({ rule: 'state', detail: 're-entering Work View changed the mathematics' });
    }
    // The undo history has to come back with it: a student who enlarges after
    // plotting must still be able to take the point back.
    const reopenedView = await page.evaluate(MEASURE_WORK_VIEW);
    if (reopenedView.open && edit && !reopenedView.undoEnabled) {
      problems.push({ rule: 'undo', detail: 'the undo history did not survive closing and reopening Work View' });
    }
    await page.evaluate(CLOSE_WORK_VIEW);
    await page.waitForTimeout(250);

    if (pageErrors.length) {
      problems.push({ rule: 'controls', detail: `page error: ${pageErrors.splice(0).join(' | ')}` });
    }

    rows.push({
      device: device.id,
      scene: scene.id,
      layout: view.layout || '—',
      controls: view.controlsPlacement || '—',
      registered: (view.registeredControls || []).length,
      plane: view.plane ? `${view.plane.w}x${view.plane.h}` : '—',
      axis: view.axisLabels || 0,
      share: view.workspaceShare ? `${Math.round(view.workspaceShare * 100)}%` : '—',
      keypad: view.keypad || 0,
      opened: true,
    });
    if (problems.length) findings.push({ device: device.id, scene: scene.id, problems });
  }
  await context.close();
}

await browser.close();

console.log(`\nStage 3A Work View matrix — ${DEVICES.map((d) => `${d.id} ${d.width}x${d.height}`).join(' / ')}\n`);
console.log('device'.padEnd(18), 'scene'.padEnd(24), 'layout'.padEnd(9), 'rail'.padEnd(7), 'ctrls'.padStart(6), 'plane'.padEnd(12), 'axis'.padStart(5), 'share'.padStart(6));
rows.forEach((r) => console.log(
  r.device.padEnd(18), r.scene.padEnd(24), String(r.layout).padEnd(9), String(r.controls).padEnd(7),
  String(r.registered).padStart(6), String(r.plane).padEnd(12), String(r.axis).padStart(5), String(r.share).padStart(6),
  String(r.keypad ? `keypad ${r.keypad}px` : '').padStart(14),
));
console.log(`\n${shots.length} screenshots in ${path.relative(repo, SHOTS)}`);

if (findings.length) {
  console.log(`\n${findings.length} scene(s) fail the Work View standard:`);
  findings.forEach(({ device, scene, problems }) => {
    console.log(`  ${device} · ${scene}`);
    problems.forEach((problem) => console.log(`    ${problem.rule}: ${problem.detail}`));
  });
} else {
  console.log('\nEvery Stage 3A family keeps its controls, its state and its Undo across the matrix.');
}

if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    devices: DEVICES,
    scenes: SCENES.map((scene) => ({ id: scene.id, family: scene.family })),
    maxAxisLabels: MAX_AXIS_LABELS,
    minMobileWorkspaceShare: MIN_MOBILE_WORKSPACE_SHARE,
    measured: rows.length,
    screenshots: shots.length,
    findings,
  }, null, 2)}\n`);
  console.log(`\nWrote ${FINDINGS}`);
}

process.exitCode = findings.length ? 1 : 0;
