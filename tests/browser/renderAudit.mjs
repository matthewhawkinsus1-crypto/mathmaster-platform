// Render every seed-bank question as a student sees it, and read the screen.
//
// HOW TO RUN (manually — needs a dev server and a browser):
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/renderAudit.mjs                 # all questions
//   node tests/browser/renderAudit.mjs --limit 40      # a quick pass
//   node tests/browser/renderAudit.mjs --write         # refresh the fixture
//
// WHAT IT CHECKS. Two things a payload test cannot see:
//
//   1. LATEX LEAK — `$x$` reaching the DOM as literal characters. Any field
//      rendered without MathText/QuestionPrompt/MathDisplay shows its markup to
//      the student. The bank is full of `$…$`, so this is not hypothetical.
//   2. AUTHOR MARKUP — `\frac`, `^2`, `\left` and friends surviving as text.
//
// The question objects are built by the REAL server sanitizer
// (functions/lib/mathPath.js), so what gets rendered is what a student's
// browser is actually handed.
//
// `--write` records the surviving offenders into
// tests/platform/fixtures/renderAuditFindings.json, which
// tests/platform/studentRenderAudit.test.mjs asserts is empty on every run — so
// a regression fails the normal suite without needing a browser.

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
const FINDINGS = path.join(repo, 'tests/platform/fixtures/renderAuditFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const limit = Number(argOf('--limit', '0')) || 0;
const write = process.argv.includes('--write');

// --- the seed bank -------------------------------------------------------------

const loadSeedItems = () => readdirSync(SEED_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .flatMap((name) => {
    const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
    const documents = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    return documents.map((document) => ({ ...document, __seedFile: name }));
  });

// --- what counts as leaked markup ----------------------------------------------

// Deliberately narrow. `$5.00` in a word problem is money, not math, so a lone
// dollar sign is not a finding; a matched pair around a short span is.
const LEAK_PATTERNS = [
  { id: 'dollar-delimited-latex', pattern: /\$[^$\n]{1,160}\$/g },
  { id: 'latex-command', pattern: /\\(?:frac|dfrac|sqrt|left|right|cdot|times|le|ge|infty|cup|text|begin|end|mathrm)\b/g },
  { id: 'paren-delimited-latex', pattern: /\\\([^\n]{1,160}\\\)/g },
];

const findLeaks = (text) => {
  const found = [];
  for (const { id, pattern } of LEAK_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = String(text).match(pattern);
    if (matches) found.push({ rule: id, samples: [...new Set(matches)].slice(0, 4) });
  }
  return found;
};

// --- run -----------------------------------------------------------------------

const items = loadSeedItems();
const selected = limit ? items.slice(0, limit) : items;
console.log(`Auditing ${selected.length} of ${items.length} seed questions against ${ORIGIN}`);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (error) => console.error('  page error:', error.message));
await page.goto(`${ORIGIN}/tests/browser/renderAudit.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__mmRenderAudit === 'function');

const findings = [];
let rendered = 0;
let skipped = 0;

for (const item of selected) {
  // The production issuability gate. A question the server would refuse to
  // issue is not one a student can see, so auditing its rendering would be
  // auditing something that never reaches a screen.
  // eslint-disable-next-line no-await-in-loop
  const plan = await mathPath.buildIssuePlan(item);
  if (!plan.issuable) { skipped += 1; continue; }

  const questionInstance = mathPath.buildSanitizedQuestion(item, {
    questionInstanceId: `audit-${item.id}`,
    attemptsAllowed: 3,
    attemptsUsed: 0,
    toolPayload: plan.toolPayload,
  });

  const scene = {
    id: item.id,
    questionInstance,
    solutionReview: item.solutionReview || null,
    feedback: Array.isArray(item.attemptFeedback) ? item.attemptFeedback[0] || null : null,
    hint: Array.isArray(item.supportHints) ? item.supportHints[0] || null : null,
  };

  // eslint-disable-next-line no-await-in-loop
  await page.evaluate((payload) => window.__mmRenderAudit(payload), scene);
  // eslint-disable-next-line no-await-in-loop
  await page.waitForFunction((id) => document.querySelector(`[data-audit-id="${id}"]`) !== null, item.id, { timeout: 5000 });

  // Open the hint panel if this question has one — a student can, so the audit
  // must. It is a button, not a prop, so it cannot be forced from the scene.
  // eslint-disable-next-line no-await-in-loop
  const hintButton = page.locator('button', { hasText: 'Show me something to think about' }).first();
  // eslint-disable-next-line no-await-in-loop
  if (await hintButton.count()) await hintButton.click().catch(() => {});

  // The text a student can actually read, with rendered mathematics removed.
  //
  // NOT `document.body.innerText`. KaTeX keeps the TeX source in a hidden
  // MathML `<annotation>` node, and that node is clipped rather than
  // `display:none`, so innerText can include it — which would report every
  // correctly rendered `\frac` as a leak. Walking text nodes and skipping the
  // `.katex` subtree is the difference between auditing the screen and
  // auditing the markup behind it.
  // eslint-disable-next-line no-await-in-loop
  const visible = await page.evaluate(() => {
    const chunks = [];
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      // Everything inside a math element IS mathematics — MathLive's
      // `<math-span>`/`<math-div>` take LaTeX as their text content and render
      // it, and KaTeX keeps the TeX source in a clipped MathML `<annotation>`.
      // Text found there is the source of rendered notation, not markup shown
      // to a student, and counting it would drown the real findings.
      if (!element || element.closest('.katex, annotation, math-span, math-div, math-field, script, style')) continue;
      const value = node.nodeValue || '';
      if (!value.trim()) continue;
      chunks.push(value);
      nodes.push({ value, element });
    }
    const trailOf = (element) => {
      const trail = [];
      for (let step = element; step && step !== document.body && trail.length < 5; step = step.parentElement) {
        trail.push(step.tagName.toLowerCase());
      }
      return trail.join(' < ');
    };
    const suspicious = /\$[^$\n]{1,160}\$|\\(?:frac|dfrac|sqrt|left|right|cdot|times|le|ge|infty|cup|text|begin|end|mathrm)\b/;
    return {
      text: chunks.join('\n'),
      origin: nodes
        .filter(({ value }) => suspicious.test(value))
        .slice(0, 6)
        .map(({ value, element }) => ({ text: value.trim().slice(0, 120), trail: trailOf(element) })),
    };
  });
  const leaks = findLeaks(visible.text);
  if (leaks.length) {
    findings.push({
      id: item.id,
      seedFile: item.__seedFile,
      pathToolId: questionInstance.pathToolId || null,
      standards: item.alignmentKeys || [],
      leaks,
      origin: visible.origin,
    });
  }
  rendered += 1;
  if (rendered % 50 === 0) console.log(`  ${rendered} rendered, ${findings.length} with leaks`);
}

await browser.close();

console.log(`\nRendered ${rendered}, skipped ${skipped} (not issuable).`);
console.log(`Questions showing raw markup to a student: ${findings.length}`);

const byRule = {};
findings.forEach((entry) => entry.leaks.forEach(({ rule, samples }) => {
  byRule[rule] = byRule[rule] || { count: 0, samples: new Set() };
  byRule[rule].count += 1;
  samples.forEach((sample) => byRule[rule].samples.add(sample));
}));
Object.entries(byRule).forEach(([rule, data]) => {
  console.log(`\n  ${rule}: ${data.count} question(s)`);
  [...data.samples].slice(0, 8).forEach((sample) => console.log(`    ${JSON.stringify(sample)}`));
});

if (write) {
  writeFileSync(FINDINGS, `${JSON.stringify({ generatedAt: new Date().toISOString(), rendered, skipped, findings }, null, 2)}\n`);
  console.log(`\nWrote ${FINDINGS}`);
}

process.exit(findings.length ? 1 : 0);
