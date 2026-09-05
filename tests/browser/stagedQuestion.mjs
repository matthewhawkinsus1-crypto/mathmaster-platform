// Drive the staged function-characteristics question in a real browser.
//
// HOW TO RUN (needs a dev server):
//   npx vite --port 5199 --strictPort &
//   node tests/browser/stagedQuestion.mjs
//   node tests/browser/stagedQuestion.mjs --write   # refresh the fixture
//
// WHAT IT CHECKS, per stage and per device:
//   FIT      the prompt and the control the student answers with are both in
//            the viewport at once, without scrolling.
//   LEAK     no coordinate readout appears on a stage that asks the student to
//            MARK a feature they are later asked to write down. This is the
//            requirement the whole slice exists for, and it is the one thing a
//            payload test cannot see.
//
// `--write` records survivors into
// tests/platform/fixtures/stagedQuestionFindings.json, which
// tests/platform/stagedQuestionFindings.test.mjs asserts is empty — so a
// regression fails the ordinary suite with no browser needed.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/stagedQuestionFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const WRITE = process.argv.includes('--write');

const DEVICES = [
  { id: 'phone-portrait', width: 390, height: 664, mobile: true },
  { id: 'phone-landscape', width: 844, height: 390, mobile: true },
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
];

// y = -(x - 2)^2 + 9. Zeros at -1 and 5, y-intercept (0, 5), maximum (2, 9) —
// and the vertex IS in the table, which is the authoring rule that makes
// "click the maximum" answerable.
const QUESTION = {
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

// Stages where a printed coordinate would answer a later stage for the student.
const MUST_NOT_LEAK = new Set(['xIntercept', 'yIntercept', 'extremePoint']);

const findings = [];
const browser = await chromium.launch();

// Each stage is mounted ON ITS OWN, as a one-stage workflow. Driving the real
// navigator would mean answering every step to unlock the next — including
// plotting five points by hand — and what is being measured here is whether a
// stage fits and whether it leaks, not whether gating works. Gating has its own
// test in tests/platform/graphFeatureStages.test.mjs.
const { expandRecipe } = await import(`${repo}/src/platform/workflow/questionRecipes.js`);
const expanded = expandRecipe(QUESTION, { label: 'audit' });
if (expanded.errors.length) {
  findings.push({ device: '(all)', stage: '(recipe)', issue: expanded.errors.join('; ') });
}

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

  for (const stage of expanded.workflow) {
    // `source` is stripped: a stage mounted alone has no upstream stage to be
    // built from, and the runner correctly refuses to render one that is
    // waiting on work that is not there ("Finish plot first"). That gating is
    // right, and it is unit-tested; keeping it here would only measure the
    // harness.
    const { source: _source, ...solo } = stage;
    await page.evaluate(({ id, one, prompt }) => window.__mmStaged({
      id,
      question: { prompt, workflow: [one], content: { prompt }, grading: {} },
    }), { id: stage.id, one: solo, prompt: QUESTION.prompt });
    await page.waitForSelector(`[data-staged-id="${stage.id}"]`);
    await page.waitForTimeout(350);

    const measured = await page.evaluate(() => {
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
      };
      const root = document.querySelector('[data-staged-id]');
      const prompt = root.querySelector('.mathmaster-question-prompt, [class*="prompt"]');
      // What the student actually answers with. A graph stage answers with the
      // plane itself, so the plane counts as the control.
      const control = root.querySelector(
        'math-field, textarea, input, svg.mathmaster-responsive-canvas, svg, button',
      );
      const plane = root.querySelector('svg.mathmaster-responsive-canvas') || root.querySelector('svg');
      const svgPairs = plane
        ? [...plane.querySelectorAll('text')].map((t) => t.textContent.trim()).filter((t) => /^\(\s*-?\d/.test(t))
        : [];
      return {
        promptVisible: visible(prompt),
        controlVisible: visible(control),
        planeHeight: plane ? Math.round(plane.getBoundingClientRect().height) : 0,
        planeBottom: plane ? Math.round(plane.getBoundingClientRect().bottom) : 0,
        docHeight: Math.round(document.documentElement.scrollHeight),
        viewport: window.innerHeight,
        svgPairs: svgPairs.slice(0, 6),
      };
    });

    if (!measured.promptVisible) {
      findings.push({ device: device.id, stage: stage.id, issue: 'prompt not visible without scrolling' });
    }
    if (!measured.controlVisible) {
      findings.push({ device: device.id, stage: stage.id, issue: 'answer control not visible without scrolling' });
    }
    if (MUST_NOT_LEAK.has(stage.id) && measured.svgPairs.length) {
      findings.push({
        device: device.id,
        stage: stage.id,
        issue: `plane printed coordinates: ${measured.svgPairs.join(' ')}`,
      });
    }
    console.log(
      `${device.id.padEnd(16)} ${stage.id.padEnd(16)} ${stage.kind.padEnd(19)}`
      + ` prompt=${measured.promptVisible ? 'y' : 'N'} control=${measured.controlVisible ? 'y' : 'N'}`
      + ` plane=${String(measured.planeHeight).padStart(3)}px`
      + ` page=${String(measured.docHeight).padStart(4)}/${measured.viewport}`
      + ` pairsOnPlane=${measured.svgPairs.length}`,
    );
  }

  errors.forEach((error) => findings.push({ device: device.id, stage: '(page)', issue: error }));
  await context.close();
  console.log('');
}

await browser.close();

console.log(findings.length ? `FINDINGS (${findings.length}):` : 'No findings.');
findings.forEach((f) => console.log(`  [${f.device}] ${f.stage}: ${f.issue}`));
if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`\nwrote ${FINDINGS}`);
}
