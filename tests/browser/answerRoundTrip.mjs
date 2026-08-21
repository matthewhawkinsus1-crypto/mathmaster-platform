// Type every Path answer key into the math editor and grade what comes out.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/answerRoundTrip.mjs
//   node tests/browser/answerRoundTrip.mjs --write     # record the result
//
// WHY. Swapping the Path's plain answer boxes for the platform's math editor is
// what makes a typed fraction look like a fraction, but it changes what the
// browser submits: MathLive serializes to LaTeX. A grader that only understood
// `3/4` would start marking correct answers wrong — which is the exact class of
// bug this whole round of work is about.
//
// So this proves it instead of assuming it. Each answer key from the seed bank
// is TYPED into a real MathInput, the serialized value is read back out, and
// that string is graded by functions/lib/mathPath.js. A key that no longer
// grades correct is a blocker, not a detail.

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
const RESULT = path.join(repo, 'tests/platform/fixtures/answerRoundTrip.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const limit = Number(argOf('--limit', '0')) || 0;
const write = process.argv.includes('--write');

const questions = readdirSync(SEED_DIR).filter((name) => name.endsWith('.json')).sort()
  .flatMap((name) => {
    const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
    return (Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []))
      .map((document) => ({ ...document, __seedFile: name }));
  });

// One trial per typed answer field: the profile decides which editor a student
// gets, the expected value is what they are aiming for.
const trials = [];
for (const question of questions) {
  for (const field of question.responseFields || []) {
    const profile = String(field.inputProfile || 'text');
    if (profile === 'choice' || profile === 'text') continue;
    if (field.expected === undefined || field.expected === null) continue;
    trials.push({ id: question.id, seedFile: question.__seedFile, fieldId: field.id, profile, expected: String(field.expected), question });
  }
}
const selected = limit ? trials.slice(0, limit) : trials;
console.log(`Typing ${selected.length} answer keys into a real math editor\n`);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (error) => console.error('  page error:', error.message));
await page.goto(`${ORIGIN}/tests/browser/answerRoundTrip.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__mmSetProfile === 'function');

const failures = [];
const serializations = [];
let currentProfile = null;

for (const trial of selected) {
  if (trial.profile !== currentProfile) {
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((profile) => window.__mmSetProfile(profile), trial.profile);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForFunction((profile) => document.querySelector(`[data-profile="${profile}"]`) !== null, trial.profile);
    currentProfile = trial.profile;
  }

  // A fresh field, then click and type the way a person does. Setting `.value`
  // from script and focusing programmatically silently loses keystrokes, and
  // clearing by Ctrl+A does not empty a MathLive field — the first two attempts
  // at this harness reported dozens of failures that were entirely its own.
  // eslint-disable-next-line no-await-in-loop
  const nonce = await page.evaluate(() => {
    window.__mmReset();
    return Number(document.querySelector('[data-nonce]')?.getAttribute('data-nonce') || 0);
  });
  // eslint-disable-next-line no-await-in-loop
  await page.waitForFunction((was) => Number(document.querySelector('[data-nonce]')?.getAttribute('data-nonce') || 0) > was, nonce);
  // A freshly mounted MathLive element drops keystrokes until it has finished
  // upgrading, which loses the first characters of the answer. Wait for it to
  // take focus before typing, and re-type once if it still came back short —
  // silently accepting a truncated answer would report a grading failure that
  // is really a timing failure.
  let serialized = '';
  for (let attempt = 0; attempt < 3 && !serialized; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const box = await page.locator('math-field').first().boundingBox();
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.click(box.x + 30, box.y + box.height / 2);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', null, { timeout: 4000 }).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(80);
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.type(trial.expected, { delay: 12 });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(120);
    // eslint-disable-next-line no-await-in-loop
    serialized = await page.evaluate(() => document.querySelector('math-field')?.value ?? '');
    // A short read means keystrokes were lost; start the field over.
    if (serialized && serialized.length < Math.min(3, trial.expected.length)) serialized = '';
    if (!serialized) {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate(() => window.__mmReset());
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(150);
    }
  }

  const grading = mathPath.privateGradingDefinition(trial.question);
  // eslint-disable-next-line no-await-in-loop
  const verdict = await mathPath.gradeResponse(grading, { responses: { [trial.fieldId]: serialized } });
  const fieldVerdict = verdict.fieldResults.find((entry) => entry.id === trial.fieldId);

  serializations.push({ profile: trial.profile, typed: trial.expected, serialized });
  if (!fieldVerdict?.isCorrect) {
    failures.push({ ...trial, question: undefined, serialized });
  }
  if (serializations.length % 50 === 0) console.log(`  ${serializations.length} typed, ${failures.length} no longer grade correct`);
}

await browser.close();

console.log(`\nTyped ${serializations.length} answer keys. ${failures.length} no longer grade as correct.`);
const byProfile = {};
selected.forEach((trial) => { byProfile[trial.profile] = byProfile[trial.profile] || { total: 0, failed: 0 }; byProfile[trial.profile].total += 1; });
failures.forEach((failure) => { byProfile[failure.profile].failed += 1; });
Object.entries(byProfile).forEach(([profile, counts]) => {
  console.log(`  ${profile.padEnd(12)} ${counts.total - counts.failed}/${counts.total} still correct`);
});
failures.slice(0, 25).forEach((failure) => {
  console.log(`\n  ${failure.id} (${failure.profile})`);
  console.log(`    key        ${JSON.stringify(failure.expected)}`);
  console.log(`    serialized ${JSON.stringify(failure.serialized)}`);
});

if (write) {
  writeFileSync(RESULT, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    typed: serializations.length,
    failures,
    samples: serializations.slice(0, 40),
  }, null, 2)}\n`);
  console.log(`\nWrote ${RESULT}`);
}

process.exit(failures.length ? 1 : 0);
