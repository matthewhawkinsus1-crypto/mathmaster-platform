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
// `--limit` takes the first N, which after the bank grew to nine seed files
// means "audit the alphabetically first file". `--stride` walks the whole bank
// instead, so a sample covers every file and every question shape.
const stride = Number(argOf('--stride', '0')) || 0;
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
  // A placeholder on screen means a template reached a student unfilled.
  { id: 'unsubstituted-placeholder', pattern: /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:\|[a-z]+)?\s*\}\}/g },
];

/*
 * TWO PRICES IN A SENTENCE ARE NOT A LATEX SPAN.
 *
 * "You start with $22 plus $8 each week" contains a matched pair of dollar
 * signs, so the span rule flags it — but the dollars are IN the text because
 * they belong there, and the student is seeing exactly what was authored.
 *
 * The tell is what follows the closing delimiter. A price is followed by its
 * digits; a closed LaTeX span is followed by a space, a full stop or the end of
 * the string. Narrow on purpose: `$x$`, `$\frac{1}{2}$` and `$7(x-9)=63$` are
 * all still leaks, and this rule has caught a real one on a live screen.
 */
const isCurrencyPair = (text, match) => {
  const at = String(text).indexOf(match);
  if (at < 0) return false;
  const after = String(text)[at + match.length];
  return /[0-9]/.test(after || '');
};

const findLeaks = (text) => {
  const found = [];
  for (const { id, pattern } of LEAK_PATTERNS) {
    pattern.lastIndex = 0;
    let matches = String(text).match(pattern);
    if (matches && id === 'dollar-delimited-latex') {
      matches = matches.filter((match) => !isCurrencyPair(text, match));
      if (!matches.length) matches = null;
    }
    if (matches) found.push({ rule: id, samples: [...new Set(matches)].slice(0, 4) });
  }
  return found;
};

// --- run -----------------------------------------------------------------------

const items = loadSeedItems();
// `--only a,b` narrows to named ids, for chasing one crash without a full sweep.
const only = String(argOf('--only', '')).split(',').map((id) => id.trim()).filter(Boolean);
const selected = only.length
  ? items.filter((item) => only.includes(item.id))
  : stride
    ? items.filter((unused, index) => index % stride === 0)
    : (limit ? items.slice(0, limit) : items);
console.log(`Auditing ${selected.length} of ${items.length} seed questions against ${ORIGIN}`);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// WHICH question crashed matters more than that one did. A bare message left
// a 3337-question sweep reporting "a page error" with no way to reproduce it.
let currentQuestionId = null;
const crashes = [];
page.on('pageerror', (error) => {
  crashes.push({ id: currentQuestionId, message: error.message });
  console.error(`  page error on ${currentQuestionId}: ${error.message}`);
});
await page.goto(`${ORIGIN}/tests/browser/renderAudit.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__mmRenderAudit === 'function');

const findings = [];
let rendered = 0;
let skipped = 0;

for (const item of selected) {
  // A TEMPLATE IS NOT WHAT A STUDENT SEES. Once the bank became generative,
  // rendering the stored record meant rendering `{{m}}` — and finding nothing
  // wrong with it, because the leak patterns look for LaTeX, not placeholders.
  // Generate first, exactly as `issueNextQuestion` does, so the audit is
  // looking at the question rather than the recipe.
  // eslint-disable-next-line no-await-in-loop
  const instantiated = await mathPath.instantiateQuestion(item, `audit|${item.id}`);
  if (!instantiated.question) { skipped += 1; continue; }
  const issued = instantiated.question;

  // The production issuability gate, applied to the INSTANCE. Checking the
  // template instead skipped questions that generate perfectly well, because a
  // template's `expected` is a placeholder and the gate reads answers.
  // eslint-disable-next-line no-await-in-loop
  const issuedPlan = await mathPath.buildIssuePlan(issued);
  if (!issuedPlan.issuable) { skipped += 1; continue; }

  const questionInstance = mathPath.buildSanitizedQuestion(issued, {
    questionInstanceId: `audit-${item.id}`,
    attemptsAllowed: 3,
    attemptsUsed: 0,
    toolPayload: issuedPlan.toolPayload,
  });

  // Read the review, feedback and hint off the GENERATED question too. Taking
  // them from the stored record put `{{rate}}` on the audit's screen and
  // reported it as a content defect, when it was the harness reading the recipe
  // for three fields and the question for the rest.
  const scene = {
    id: item.id,
    questionInstance,
    solutionReview: issued.solutionReview || null,
    feedback: Array.isArray(issued.attemptFeedback) ? issued.attemptFeedback[0] || null : null,
    hint: Array.isArray(issued.supportHints) ? issued.supportHints[0] || null : null,
  };

  currentQuestionId = item.id;
  // eslint-disable-next-line no-await-in-loop
  await page.evaluate((payload) => window.__mmRenderAudit(payload), scene);
  try {
    // eslint-disable-next-line no-await-in-loop
    await page.waitForFunction((id) => document.querySelector(`[data-audit-id="${id}"]`) !== null, item.id, { timeout: 5000 });
  } catch {
    // A question that never mounts is a finding, not a reason to abandon the
    // remaining three thousand. Record it and carry on.
    findings.push({ id: item.id, leaks: [{ rule: 'did-not-render', samples: ['component threw before mounting'] }] });
    // eslint-disable-next-line no-await-in-loop
    await page.reload({ waitUntil: 'domcontentloaded' });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForFunction(() => typeof window.__mmRenderAudit === 'function');
    continue;
  }

  // Open the hint panel if this question has one — a student can, so the audit
  // must. It is a button, not a prop, so it cannot be forced from the scene.
  // eslint-disable-next-line no-await-in-loop
  const hintButton = page.locator('button', { hasText: 'Show me something to think about' }).first();
  // eslint-disable-next-line no-await-in-loop
  if (await hintButton.count()) await hintButton.click().catch(() => {});

  // THE SCRATCHPAD RE-STATES THE QUESTION, so it is a second surface the same
  // markup can leak onto — and the one a student is looking at precisely when
  // they cannot see the original. Open it, let it audit, close it again.
  const scratchpadButton = page.locator('button', { hasText: 'Scratchpad' }).first();
  // eslint-disable-next-line no-await-in-loop
  if (await scratchpadButton.count()) {
    // eslint-disable-next-line no-await-in-loop
    await scratchpadButton.click().catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(120);
  }

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
