// DOES TYPING WHILE PINCH-ZOOMED KEEP THE BOX YOU ARE TYPING IN ON SCREEN?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/pinchZoomTyping.mjs
//
// A teacher presenting to the room pinch-zooms (trackpad or touchscreen) onto
// the answer box, then types. Pinch zoom is the browser's VISUAL viewport: the
// page underneath (the layout viewport) does not move, and window.innerHeight,
// getBoundingClientRect and scrollIntoView all still describe the whole,
// un-zoomed page. Code that "keeps something in view" from those numbers moves
// the page to a place that is not on the zoomed-in screen at all.
//
// This harness performs a real pinch (CDP Input.synthesizePinchGesture onto
// each text box, 2.5x), focuses it, types, and records where the visual
// viewport is after every keystroke. A box that leaves the zoomed screen, or a
// screen that moves more than 40px, is a finding; the exit code is 1.
//
// Measured on the code before src/platform/layout/pinchZoomReveal.js (which
// names the three causes): math boxes moved 230-280px on a teacher laptop, a
// Chromebook and a phone (off screen on the phone); plain text boxes 46-110px
// on the laptop and Chromebook. After: 0px everywhere, and 0px at 1x.
//
// Knobs, for taking one fix away at a time:
//   PINCH_DEVICES=teacher-laptop,chromebook,phone   which devices
//   PINCH_SCALE=2.5          how far to zoom (1 = the unzoomed baseline)
//   PINCH_TEXT=2x+3          what to type
//   PINCH_VERBOSE=1          print the viewport after every keystroke
//   PINCH_WITHOUT_ROOT_FLAG=1  skip installPinchZoomRootFlag, as main.jsx would not
//   PINCH_INJECT_CSS / PINCH_INJECT_JS   extra CSS or script for the page
//   PINCH_EXTRA_SCENES       JSON array of more { id, question } scenes

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const ZOOM = Number(process.env.PINCH_SCALE || 2.5);
const TEXT = process.env.PINCH_TEXT || '2x+3';

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

const SCENES = [
  {
    id: 'equation-input',
    question: {
      id: 'equation-input',
      type: 'functionModeling',
      prompt: 'Write a function for the situation.',
      workflow: [{ id: 'equation', kind: 'equationInput', prompt: 'Write the function.' }],
      content: { prompt: 'Write a function for the situation.' },
      grading: {},
    },
  },
  {
    id: 'domain-input',
    question: {
      id: 'domain-input',
      type: 'relationRepresentations',
      prompt: 'Give the domain.',
      workflow: [{ id: 'domain', kind: 'domainInput', prompt: 'Describe the domain.' }],
      content: { prompt: 'Give the domain.' },
      grading: {},
    },
  },
  {
    id: 'staged-graph-analysis',
    question: {
      id: 'staged-graph-analysis',
      type: 'graphAnalysis',
      prompt: 'The table shows a function. Graph it, then describe what it does.',
      workflow: staged.workflow,
      content: { prompt: 'The table shows a function. Graph it, then describe what it does.' },
      grading: {},
    },
  },
  ...(process.env.PINCH_EXTRA_SCENES ? JSON.parse(process.env.PINCH_EXTRA_SCENES) : []),
];

const TEXT_BOXES = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]), textarea, math-field, [contenteditable="true"]';

const browser = await chromium.launch();
const findings = [];

// A presenting teacher's laptop, a student Chromebook, and a phone. Headless
// Chromium only honours a trackpad-style ('mouse') pinch, so the phone is
// pinched that way too; the zoom it produces is the same visual viewport.
const DEVICES = [
  { id: 'teacher-laptop', viewport: { width: 1280, height: 800 }, pinch: 'mouse' },
  { id: 'chromebook', viewport: { width: 1366, height: 768 }, pinch: 'mouse' },
  { id: 'phone', viewport: { width: 390, height: 844 }, pinch: 'mouse', isMobile: true },
].filter((device) => !process.env.PINCH_DEVICES || process.env.PINCH_DEVICES.split(',').includes(device.id));

for (const device of DEVICES) {
  const { viewport } = device;
  console.log(`\n## ${device.id} ${viewport.width}x${viewport.height}`);
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: Boolean(device.isMobile) });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('pageerror', (error) => console.log(`  pageerror: ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/pinchZoomTyping.html${process.env.PINCH_WITHOUT_ROOT_FLAG ? '?withoutRootFlag' : ''}`);
  if (process.env.PINCH_INJECT_CSS) await page.addStyleTag({ content: process.env.PINCH_INJECT_CSS });
  if (process.env.PINCH_INJECT_JS) await page.addScriptTag({ content: process.env.PINCH_INJECT_JS });

  for (const scene of SCENES) {
    await page.evaluate((s) => window.__mmPinchZoom(s), scene);
    await page.waitForSelector(`[data-assignment-id="${scene.id}"]`);
    await page.waitForTimeout(600);

    const boxCount = await page.evaluate((selector) => (
      [...document.querySelectorAll(`[data-assignment-id] ${selector}`)]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length
    ), TEXT_BOXES);
    if (!boxCount) {
      console.log(`${scene.id}: no text box on the first stage`);
      continue;
    }

    for (let boxIndex = 0; boxIndex < Math.min(boxCount, 3); boxIndex += 1) {
      // Back to 1x, then put the box in the middle of the layout viewport and
      // pinch onto it, as a teacher would.
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await page.waitForTimeout(200);
      await page.evaluate(() => window.scrollTo(0, 0));
      const target = await page.evaluate(({ selector, boxIndex: i }) => {
        const boxes = [...document.querySelectorAll(`[data-assignment-id] ${selector}`)]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const box = boxes[i];
        box.setAttribute('data-pinch-target', '1');
        // scrollIntoView walks every scrollable ancestor: the phone layout
        // scrolls an inner pane, which window.scrollTo does not move. This is
        // setup at 1x, before the pinch — not part of what is measured.
        box.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = box.getBoundingClientRect();
        return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2, tag: box.tagName.toLowerCase(), label: box.getAttribute('aria-label') || box.getAttribute('placeholder') || '' };
      }, { selector: TEXT_BOXES, boxIndex });
      await cdp.send('Input.synthesizePinchGesture', {
        x: Math.round(target.x), y: Math.round(target.y), scaleFactor: ZOOM, relativeSpeed: 800, gestureSourceType: device.pinch,
      });
      await page.waitForTimeout(400);

      const where = () => page.evaluate(() => {
        const vv = window.visualViewport;
        const box = document.querySelector('[data-pinch-target]');
        const r = box?.getBoundingClientRect();
        // Box position inside the visual viewport, in CSS px of the page.
        const top = r ? r.top - vv.offsetTop : null;
        const left = r ? r.left - vv.offsetLeft : null;
        return {
          scale: Math.round(vv.scale * 100) / 100,
          pageTop: Math.round(vv.pageTop),
          pageLeft: Math.round(vv.pageLeft),
          scrollY: Math.round(window.scrollY),
          boxTop: top === null ? null : Math.round(top),
          boxLeft: left === null ? null : Math.round(left),
          boxVisible: r ? (top + r.height > 0 && top < vv.height && left + Math.min(r.width, 40) > 0 && left < vv.width) : false,
          vvHeight: Math.round(vv.height),
          vvWidth: Math.round(vv.width),
          focused: document.activeElement === box || box?.contains(document.activeElement),
        };
      });

      const before = await where();
      await page.evaluate(() => {
        const box = document.querySelector('[data-pinch-target]');
        box.focus({ preventScroll: true });
      });
      await page.waitForTimeout(150);
      const afterFocus = await where();
      const steps = [];
      for (const ch of TEXT) {
        await page.keyboard.type(ch);
        await page.waitForTimeout(120);
        steps.push(await where());
      }
      await page.waitForTimeout(500);
      const settled = await where();
      const all = [afterFocus, ...steps, settled];
      const maxJump = Math.max(...all.map((s) => Math.abs(s.pageTop - before.pageTop) + Math.abs(s.pageLeft - before.pageLeft)));
      const lost = all.some((s) => !s.boxVisible);
      const label = `${device.id} ${scene.id} #${boxIndex} <${target.tag}> ${target.label}`.trim();
      if (process.env.PINCH_VERBOSE) steps.forEach((step, i) => console.log(`  key ${JSON.stringify(TEXT[i])} -> pageTop ${step.pageTop} pageLeft ${step.pageLeft} scrollY ${step.scrollY} boxTop ${step.boxTop}`));
      console.log(`${label}\n  before   ${JSON.stringify(before)}\n  focused  ${JSON.stringify(afterFocus)}\n  settled  ${JSON.stringify(settled)}\n  maxJump=${maxJump}px lostBox=${lost}`);
      if (lost || maxJump > 40) findings.push({ scene: label, maxJump, lost, before, settled });
      await page.evaluate(() => document.querySelector('[data-pinch-target]')?.removeAttribute('data-pinch-target'));
    }
  }
  await context.close();
}

await browser.close();
console.log(`\n${findings.length} finding(s)`);
if (findings.length) {
  findings.forEach((f) => console.log(`  ${f.scene}: jump ${f.maxJump}px, box off screen: ${f.lost}`));
  process.exitCode = 1;
}
