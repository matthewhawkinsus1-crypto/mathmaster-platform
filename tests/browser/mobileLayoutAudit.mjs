// What a student on a PHONE actually gets, through the real assignment path.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/mobileLayoutAudit.mjs
//   node tests/browser/mobileLayoutAudit.mjs --write
//
// WHY THIS AND NOT toolOpenAudit. That one mounts a tool component on its own,
// which is fine for measuring the shared shell but WRONG for mobile: the mobile
// stylesheet is imported by MobileViewportContainer, which lives inside
// QuestionEngine. Mount the tool alone and you measure desktop styling squeezed
// into a phone-width window — numbers that look real and describe nothing.
//
// So this drives PathSessionPlayer, the same surface an assignment renders, with
// real sanitized bank questions. What it asks is what a student asks:
//
//   1. Can I see what I was asked?
//   2. Can I reach the answer box without hunting for it?
//   3. Can I reach the submit control?
//   4. Does the page shove sideways?

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const SEED_DIR = path.join(repo, 'functions/seeds/pathQuestionBank');
const ORIENTATION = process.env.AUDIT_ORIENTATION === 'landscape' ? 'landscape' : 'portrait';
const VIEWPORT = ORIENTATION === 'landscape' ? { width: 664, height: 390 } : { width: 390, height: 664 };
const FINDINGS = path.join(repo, `tests/platform/fixtures/mobileLayout${ORIENTATION === 'landscape' ? 'Landscape' : ''}Findings.json`);
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const write = process.argv.includes('--write');
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const perTool = Number(argOf('--per-tool', '2')) || 2;

// A mid-range phone in portrait. Not the smallest possible screen — the point is
// the common case, not a worst case nobody has.

const items = readdirSync(SEED_DIR)
  .filter((name) => name.endsWith('.json') && name.includes('pathQuestionBank'))
  .flatMap((name) => {
    const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  });

// Tool-bearing questions first — they are the ones with a working surface
// competing with the answer boxes — plus a couple of plain ones for contrast.
// Bank records name their tool in four different places depending on vintage,
// and `type` is one of them — but `type` also holds non-tool kinds like
// "multipleChoice", so it only counts when it names a tool the registry knows.
const TOOL_IDS = new Set(
  [...readFileSync(path.join(repo, 'src/tools/toolRegistry.js'), 'utf8').matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9]*):\s*\{/gm)]
    .map((match) => match[1]),
);
const toolOf = (item) => {
  const direct = item?.pathToolId || item?.toolId || item?.tool?.id;
  if (direct) return String(direct);
  const type = String(item?.type || '');
  return TOOL_IDS.has(type) || /Lab$|Workspace$|Explorer$|Builder$|Board$|[0-9]$/.test(type) ? type : null;
};
const byTool = new Map();
const plain = [];
items.forEach((item) => {
  const tool = toolOf(item);
  if (!tool) { if (plain.length < 4) plain.push(item); return; }
  const bucket = byTool.get(tool) || [];
  if (bucket.length < perTool) { bucket.push(item); byTool.set(tool, bucket); }
});
const sample = [...[...byTool.values()].flat(), ...plain];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
await page.goto(`${ORIGIN}/tests/browser/renderAudit.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__mmRenderAudit === 'function');

const findings = [];
const rows = [];

for (const item of sample) {
  // eslint-disable-next-line no-await-in-loop
  const instantiated = await mathPath.instantiateQuestion(item, `mobile|${item.id}`);
  if (!instantiated.question) continue;
  const issued = { ...instantiated.question, activityRole: 'classwork' };
  // eslint-disable-next-line no-await-in-loop
  const plan = await mathPath.buildIssuePlan(issued);
  if (!plan.issuable) continue;
  const questionInstance = mathPath.buildSanitizedQuestion(issued, {
    questionInstanceId: `mobile-${item.id}`, attemptsAllowed: 3, attemptsUsed: 0, toolPayload: plan.toolPayload,
  });

  // eslint-disable-next-line no-await-in-loop
  await page.evaluate((payload) => window.__mmRenderAudit(payload), { id: item.id, questionInstance });
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(320);

  // eslint-disable-next-line no-await-in-loop
  const m = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const ANSWER = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, math-field, [contenteditable="true"]';
    const answers = [...document.querySelectorAll(ANSWER)].filter(vis);
    const choice = [...document.querySelectorAll('input[type=radio], input[type=checkbox], [role=radio], [role=option]')].filter(vis);
    const submit = [...document.querySelectorAll('button')].filter((el) => vis(el)
      && /submit|check|lock in|answer|continue|done/i.test(el.textContent || ''))[0] || null;
    // A PLOTTING TOOL IS ANSWERED BY PLOTTING. graphing2 has no text box on
    // purpose — the student drags points on the plane — so "no input" is the
    // design there, not a defect. Count a real working surface as the answer
    // affordance when there is no field.
    const surface = [...document.querySelectorAll('svg, canvas')].filter(vis)
      .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || null;
    const prompt = document.querySelector('.mathmaster-question-prompt, [data-mm-prompt], h2, h3');
    const doc = document.documentElement;

    const topOf = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
    return {
      promptTop: topOf(prompt),
      promptText: (prompt?.innerText || '').trim().slice(0, 60),
      firstAnswerTop: topOf(answers[0] || choice[0] || surface),
      answeredBySurface: !answers.length && !choice.length && Boolean(surface),
      submitTop: topOf(submit),
      submitLabel: (submit?.textContent || '').trim().slice(0, 30),
      submitInActionBar: Boolean(submit?.closest('.portrait-action-bar')),
      surfaceTop: surface ? Math.round(surface.getBoundingClientRect().top) : null,
      surfaceOnScreen: surface ? (surface.getBoundingClientRect().top < window.innerHeight
        && surface.getBoundingClientRect().bottom > 0) : null,
      pageHeight: doc.scrollHeight,
      widthOverflow: Math.max(0, doc.scrollWidth - window.innerWidth),
      answerCount: answers.length + choice.length,
    };
  });

  // eslint-disable-next-line no-await-in-loop
  const reach = await page.evaluate(() => {
    // PORTRAIT MODE SCROLLS THE WORKSPACE, NOT THE PAGE. The container is a
    // three-row grid whose middle row scrolls internally, so scrolling the
    // window moves almost nothing and tells you nothing. scrollIntoView walks
    // every scrollable ancestor, which is what a student's thumb does.
    const target = [...document.querySelectorAll('button')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /submit|check|lock in|answer|continue|done/i.test(el.textContent || '');
    })[0];
    target?.scrollIntoView({ block: 'end', inline: 'nearest' });
    return new Promise((resolve) => setTimeout(() => {
      const submit = [...document.querySelectorAll('button')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && /submit|check|lock in|answer|continue|done/i.test(el.textContent || '');
      })[0] || null;
      const r = submit?.getBoundingClientRect();
      resolve({
        submitOnScreenAfterScroll: Boolean(r && r.top >= 0 && r.bottom <= window.innerHeight + 1),
        submitViewportTop: r ? Math.round(r.top) : null,
      });
    }, 160));
  });
  // eslint-disable-next-line no-await-in-loop
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) el.scrollTop = 0; });
  });

  const problems = [];
  const screen = VIEWPORT.height;
  if (m.widthOverflow > 4) problems.push({ rule: 'scrolls-sideways', detail: `${m.widthOverflow}px` });
  // A TOOL WHOSE WORKING SURFACE OPENS OFF SCREEN IS UNUSABLE, not merely
  // awkward — a student cannot tell there is a graph to work in at all. This is
  // what landscape was doing to a plotting tool before the column split.
  if (m.surfaceOnScreen === false) {
    problems.push({ rule: 'working-surface-off-screen', detail: `surface at ${m.surfaceTop}px on a ${VIEWPORT.height}px screen` });
  }
  if (m.firstAnswerTop === null) problems.push({ rule: 'no-answer-control', detail: 'nothing to answer with' });
  // More than one full screen of scrolling between the question and the box you
  // answer it in is the thing this audit exists to catch.
  else if (m.firstAnswerTop > screen * 1.5) {
    problems.push({ rule: 'answer-far-below-question', detail: `answer box at ${m.firstAnswerTop}px on a ${screen}px screen` });
  }
  // The submit control is the one thing that must never require hunting: a
  // student who has done the work should not have to scroll to hand it in.
  // Sticky means the document position is irrelevant — what matters is that a
  // student who has scrolled to their work can still see the button.
  if (m.submitTop !== null && !reach.submitOnScreenAfterScroll) {
    problems.push({ rule: 'submit-not-reachable', detail: `submit off screen at ${reach.submitViewportTop}px after scrolling to the work` });
  }

  rows.push({
    id: String(item.id).slice(-22), tool: toolOf(item) || '—',
    prompt: m.promptTop, answer: m.firstAnswerTop, submit: m.submitTop, page: m.pageHeight,
    reachable: reach.submitOnScreenAfterScroll, inBar: m.submitInActionBar,
  });
  if (problems.length) findings.push({ id: item.id, tool: toolOf(item) || null, problems });
}

await browser.close();

console.log(`\nMeasured ${rows.length} real bank questions through PathSessionPlayer at ${VIEWPORT.width}x${VIEWPORT.height} (${ORIENTATION})\n`);
console.log('tool'.padEnd(22), 'prompt'.padStart(7), 'answer'.padStart(7), 'page'.padStart(6), 'submitReachable'.padStart(16), 'inBar'.padStart(6));
rows.forEach((r) => console.log(
  String(r.tool).padEnd(22),
  String(r.prompt ?? '—').padStart(7),
  String(r.answer ?? '—').padStart(7),
  String(r.page).padStart(6),
  String(r.reachable).padStart(16),
  String(r.inBar).padStart(6),
));
if (pageErrors.length) console.log(`\npage errors: ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}`);
if (findings.length) {
  console.log(`\n${findings.length} question(s) with layout problems:`);
  findings.forEach(({ id, tool, problems }) => {
    console.log(`  ${tool || 'plain'} · ${id}`);
    problems.forEach((p) => console.log(`    ${p.rule}: ${p.detail}`));
  });
} else {
  console.log('\nEvery sampled question keeps its answer control within reach on a phone.');
}
if (write) {
  writeFileSync(FINDINGS, `${JSON.stringify({ generatedAt: new Date().toISOString(), orientation: ORIENTATION, viewport: VIEWPORT, measured: rows.length, findings }, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(repo, FINDINGS)}`);
}
process.exit(findings.length ? 1 : 0);
