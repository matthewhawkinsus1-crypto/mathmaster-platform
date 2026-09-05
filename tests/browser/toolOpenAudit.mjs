// Does a tool actually OPEN ready for a student to work in it?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/toolOpenAudit.mjs
//   node tests/browser/toolOpenAudit.mjs --write   # refresh the fixture
//
// Measured in a real browser at a Chromebook viewport, because this is a
// question about pixels and scroll position that no source-inspection test can
// answer. Three things, per tool:
//
//   1. IS THE FIRST ANSWER CONTROL ON THE FIRST SCREEN? If a student has to
//      scroll before they can type, the tool did not open ready.
//   2. IS THE TOOL'S WORKING SURFACE ON THE FIRST SCREEN? An input at the top
//      with the graph below it is the same failure wearing a different hat.
//   3. HOW MUCH ROOM DO THE FOLDED DIRECTIONS TAKE? A fold that still costs a
//      third of the screen has not folded.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/toolOpenFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const write = process.argv.includes('--write');

// A Chromebook, minus browser chrome. This is the screen the tools are used on.
const VIEWPORT = { width: 1366, height: 640 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });

const idPage = await context.newPage();
await idPage.goto(`${ORIGIN}/tests/browser/toolOpenAudit.html`, { waitUntil: 'networkidle' });
const toolIds = await idPage.evaluate(() => window.__TOOL_IDS__ || []);
await idPage.close();

const findings = [];
const rows = [];
const skipped = [];

// Tools the preview bench has no sample question for. They mount their empty
// state, which is correct but not what this audit is measuring.
const specSource = readFileSync(path.join(repo, 'src/dev/MathToolsLab.jsx'), 'utf8');
const specBody = specSource.slice(specSource.indexOf('export const SAMPLE_SPECS'), specSource.indexOf('export default'));
const SPEC_KEYS = new Set([...specBody.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9]*):/gm)].map((match) => match[1]));

for (const toolId of toolIds) {
  const hasSpec = SPEC_KEYS.has(toolId);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/toolOpenAudit.html?tool=${encodeURIComponent(toolId)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);

  const measured = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const ANSWER = 'input:not([type=hidden]), textarea, select, math-field, [contenteditable="true"]';
    const SURFACE = 'canvas, svg, [data-tool-surface], .mathmaster-tool-panel';

    const firstOf = (selector) => [...document.querySelectorAll(selector)].filter(visible)[0] || null;
    const answer = firstOf(ANSWER);
    const surface = firstOf(SURFACE);
    // Any control a student could act on, if the tool has no typed input at all
    // (drag-and-drop and card-sorting tools are legitimately like this).
    const actionable = answer || [...document.querySelectorAll('button')].filter((el) => visible(el)
      && !/hint|about this tool|how to do this/i.test(el.textContent || ''))[0] || null;

    // A tool's WORKING panels are collapsible too ("Transformation bridge",
    // "Representation reasoning"), and those are supposed to be open — they are
    // where the student works. Only the two direction blocks are in scope here.
    const isDirections = (label) => /how to do this|about this tool/i.test(label);
    const folded = [...document.querySelectorAll('.mathmaster-quiet-disclosure')].map((el) => {
      const label = (el.querySelector('button')?.textContent || '').trim().slice(0, 48);
      return {
        open: el.getAttribute('data-open') === 'true',
        height: Math.round(el.getBoundingClientRect().height),
        label,
        directions: isDirections(label),
      };
    });

    return {
      hasAnswer: Boolean(answer),
      answerTop: answer ? Math.round(answer.getBoundingClientRect().top) : null,
      actionableTop: actionable ? Math.round(actionable.getBoundingClientRect().top) : null,
      surfaceTop: surface ? Math.round(surface.getBoundingClientRect().top) : null,
      focusedTag: (document.activeElement?.tagName || '').toLowerCase(),
      focusedIsAnswer: Boolean(document.activeElement && document.activeElement.matches?.(ANSWER)),
      scrollHeight: document.documentElement.scrollHeight,
      folded,
      openDirections: folded.filter((entry) => entry.open && entry.directions).map((entry) => entry.label),
      foldedHeight: folded.filter((entry) => !entry.open).reduce((total, entry) => total + entry.height, 0),
      bodyText: (document.body.innerText || '').slice(0, 400),
    };
  });

  /*
   * CAN THE STUDENT STILL SEE WHAT THEY WERE ASKED, ONCE THEY ARE WORKING?
   *
   * Opening ready is only half of it. A student scrolls down to the boxes, the
   * process unfolds and the page grows, and the question that started at the top
   * is gone. They then answer from memory, or scroll back and lose their place.
   * So this scrolls to where the student would actually be working and asks
   * whether the task is still on screen.
   */
  const promptCheck = await page.evaluate(() => {
    const card = document.querySelector('.mathmaster-tool-task-card');
    const promptEl = card?.querySelector('.mathmaster-tool-task-prompt, .mathmaster-tool-task-directions');
    if (!promptEl) return { hasPrompt: false };

    const text = (promptEl.innerText || '').trim();
    // Markup that reached the screen instead of being rendered as mathematics.
    const asCode = /\$[^$\n]{1,160}\$|\\(?:frac|sqrt|left|right|cdot|times|le|ge|text|begin)\b|\{\{\s*[A-Za-z_]/.test(text);
    const mathNodes = promptEl.querySelectorAll('math-span, math-div, .katex, mjx-container').length;

    const ANSWER = 'input:not([type=hidden]), textarea, select, math-field, [contenteditable="true"]';
    const target = [...document.querySelectorAll(ANSWER)].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).pop() || document.body;
    target.scrollIntoView({ block: 'center' });

    const rect = promptEl.getBoundingClientRect();
    const visibleAfterScroll = rect.bottom > 0 && rect.top < window.innerHeight;
    return {
      hasPrompt: true,
      text: text.slice(0, 90),
      asCode,
      mathNodes,
      visibleAfterScroll,
      promptTopAfterScroll: Math.round(rect.top),
      pageGrew: document.documentElement.scrollHeight > window.innerHeight,
    };
  });

  const problems = [];
  if (errors.length) problems.push({ rule: 'page-error', detail: errors.slice(0, 2) });
  if (!hasSpec) {
    // No sample data to mount. The tool renders its empty state, which is the
    // right behaviour but tells us nothing about how it opens with a question.
    skipped.push(toolId);
  } else if (measured.actionableTop === null && measured.surfaceTop === null) {
    problems.push({ rule: 'nothing-on-screen', detail: 'no visible control and no working surface' });
  } else {
    // A GRAPH-FIRST TOOL LEGITIMATELY PUTS ITS INPUTS BELOW ITS GRAPH. You have
    // to see the curve to answer questions about it, and shrinking the graph to
    // fit both would undo a fix a teacher already asked for. What must be on the
    // first screen is the tool — its surface OR its controls — not both.
    const onFirstScreen = [measured.surfaceTop, measured.actionableTop]
      .filter((value) => value !== null)
      .some((value) => value < VIEWPORT.height);
    if (!onFirstScreen) {
      problems.push({ rule: 'tool-below-the-fold', detail: `surface ${measured.surfaceTop}px, first control ${measured.actionableTop}px` });
    }
  }
  if (measured.openDirections.length) problems.push({ rule: 'directions-open-on-arrival', detail: measured.openDirections });
  if (hasSpec && promptCheck.hasPrompt) {
    if (promptCheck.asCode) problems.push({ rule: 'task-shown-as-code', detail: promptCheck.text });
    if (promptCheck.pageGrew && !promptCheck.visibleAfterScroll) {
      problems.push({ rule: 'task-scrolls-away-while-working', detail: `prompt at ${promptCheck.promptTopAfterScroll}px once the student is at the answer boxes` });
    }
  }
  // A folded disclosure should read as one row. Two folds is the most any tool
  // has, so anything past ~130px means a fold is still carrying a body.
  if (measured.foldedHeight > 130) problems.push({ rule: 'folded-panel-too-tall', detail: `${measured.foldedHeight}px folded` });

  rows.push({
    toolId,
    firstControl: measured.actionableTop,
    surface: measured.surfaceTop,
    foldedPx: measured.foldedHeight,
    taskVisible: promptCheck.hasPrompt ? promptCheck.visibleAfterScroll : null,
    taskAsCode: promptCheck.hasPrompt ? promptCheck.asCode : null,
    openFolds: measured.openDirections.length,
    focusedAnswer: measured.focusedIsAnswer,
  });
  if (problems.length) findings.push({ toolId, problems });
  await page.close();
}

await browser.close();

console.log(`\nMeasured ${toolIds.length} tools at ${VIEWPORT.width}x${VIEWPORT.height}\n`);
console.log('tool'.padEnd(28), 'control'.padStart(8), 'foldedPx'.padStart(9), 'taskVisible'.padStart(12), 'taskAsCode'.padStart(11));
rows.forEach((row) => console.log(
  row.toolId.padEnd(28),
  String(row.firstControl ?? '—').padStart(8),
  String(row.foldedPx).padStart(9),
  String(row.taskVisible ?? '—').padStart(12),
  String(row.taskAsCode ?? '—').padStart(11),
));

if (findings.length) {
  console.log(`\n${findings.length} tool(s) with problems:`);
  findings.forEach(({ toolId, problems }) => {
    console.log(`  ${toolId}`);
    problems.forEach((problem) => console.log(`    ${problem.rule}: ${JSON.stringify(problem.detail)}`));
  });
} else {
  console.log('\nEvery tool opens with the tool on the first screen and its directions folded.');
}
if (skipped.length) console.log(`\nNo sample question on the preview bench (empty state only): ${skipped.join(', ')}`);

if (write) {
  writeFileSync(FINDINGS, `${JSON.stringify({ generatedAt: new Date().toISOString(), viewport: VIEWPORT, measured: toolIds.length, findings }, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(repo, FINDINGS)}`);
}
process.exit(findings.length ? 1 : 0);
