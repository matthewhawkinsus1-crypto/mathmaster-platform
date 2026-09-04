// Render the Warm-Up challenge gate in a real browser and read the screen.
//
// HOW TO RUN:
//
//   npx vite --port 5198 --strictPort &
//   node tests/browser/warmupChallengeRender.mjs
//   node tests/browser/warmupChallengeRender.mjs --write   # refresh the fixture
//
// WHAT IT CHECKS that a payload test cannot:
//
//   1. WHITE SCREEN. A component that throws inside a student's assignment is a
//      blank page mid-lesson. Every scene is wrapped in an error boundary and
//      any thrown error, any console error, and any unhandled rejection is a
//      finding.
//   2. BLANK RENDER. A route that is supposed to show something and produces an
//      empty container is just as broken as a crash, and looks like "nothing
//      happened" rather than an error.
//   3. THE WRONG WORDS. An embedded game offering "Back to Dashboard" sends a
//      student somewhere they did not come from.
//   4. LEAKED CHROME. A route that is supposed to render nothing must render
//      NOTHING, not an empty bordered panel.
//
// NO PRODUCTION CONTACT. LiveChallengeStudent auto-joins on mount, and the
// Firebase config in this repo points at the live project. Every request that
// is not localhost is aborted at the browser level, so this harness cannot
// reach Firestore, cannot call joinLiveChallenge, and cannot touch a real
// student's data. That is enforced here rather than trusted.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/warmupChallengeRenderFindings.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5198';
const WRITE = process.argv.includes('--write');

const challengeAssignment = {
  id: 'assignment-a',
  warmup: { enabled: true, liveChallenge: { enabled: true, roundCount: 5, roundSeconds: 30 } },
};
const activeWarmup = { enabled: true, status: 'active' };

// Each scene is realistic INPUT. The decision is made by the real resolver in
// the page, so this file cannot accidentally assert against a fiction.
const SCENES = [
  {
    name: 'embedded-exit-label',
    direct: 'exitLabel',
    expect: 'text',
    mustContain: ['Back to Warm-Up'],
    mustNotContain: ['Back to Dashboard'],
    input: {},
  },
  {
    name: 'not-configured',
    expect: 'nothing',
    input: { assignment: { id: 'assignment-a', warmup: { enabled: true } }, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: { roomId: 'r1', status: 'running', assignmentId: 'assignment-a' } },
  },
  {
    name: 'window-closed',
    expect: 'nothing',
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: { enabled: true, status: 'closed' }, invite: { roomId: 'r1', status: 'running', assignmentId: 'assignment-a' } },
  },
  {
    // A standalone game is live. The assignment is configured for a Warm-Up
    // challenge, so the route is legitimately "waiting" — but the student must
    // NOT be told to stay put while the banner tells them to join. One
    // instruction at a time.
    name: 'standalone-invite-must-not-hijack',
    expect: 'nothing',
    expectRouteNot: 'play',
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: { roomId: 'r1', status: 'running' } },
  },
  {
    name: 'other-assignment-invite-must-not-hijack',
    expect: 'nothing',
    expectRouteNot: 'play',
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: { roomId: 'r1', status: 'running', assignmentId: 'assignment-b' } },
  },
  {
    name: 'already-played',
    expect: 'nothing',
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: { roomId: 'r1', status: 'running', assignmentId: 'assignment-a' }, playedRoomIds: ['r1'] },
  },
  {
    name: 'waiting-for-teacher',
    expect: 'text',
    mustContain: ['Warm-Up', 'teacher'],
    mustNotContain: ['undefined', 'NaN', '[object Object]', '$'],
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: null },
  },
  {
    name: 'playing-lobby',
    expect: 'text',
    mustNotContain: ['Back to Dashboard', 'undefined', 'NaN', '[object Object]'],
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: { roomId: 'r1', status: 'invited', assignmentId: 'assignment-a' } },
  },
  {
    name: 'playing-running',
    expect: 'text',
    mustNotContain: ['Back to Dashboard', 'undefined', 'NaN', '[object Object]'],
    input: { assignment: challengeAssignment, assignmentId: 'assignment-a', warmupState: activeWarmup, invite: { roomId: 'r1', status: 'running', assignmentId: 'assignment-a' } },
  },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext();

// The guarantee, enforced: nothing but the local dev server is reachable.
const blocked = [];
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('ws://localhost')) {
    return route.continue();
  }
  blocked.push(url);
  return route.abort();
});

const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

await page.goto(`${ORIGIN}/tests/browser/warmupChallengeRender.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__mmWarmupRender === 'function', { timeout: 30000 });

const findings = [];
const report = [];

for (const scene of SCENES) {
  consoleErrors.length = 0;
  pageErrors.length = 0;

  // eslint-disable-next-line no-await-in-loop
  const decision = await page.evaluate((payload) => window.__mmWarmupDecision(payload), scene);
  // eslint-disable-next-line no-await-in-loop
  await page.evaluate((payload) => window.__mmWarmupRender(payload), scene);
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(400);

  // eslint-disable-next-line no-await-in-loop
  const seen = await page.evaluate(() => {
    const root = document.getElementById('root');
    const scoped = root?.querySelector('[data-mm-scene]');
    return {
      crashed: Boolean(root?.querySelector('[data-mm-crashed]')),
      crashText: root?.querySelector('[data-mm-crashed]')?.textContent || '',
      html: (scoped?.innerHTML || '').trim(),
      text: (scoped?.innerText || '').replace(/\s+/g, ' ').trim(),
      elements: scoped ? scoped.querySelectorAll('*').length : 0,
      buttons: [...(scoped?.querySelectorAll('button') || [])].map((b) => b.innerText.trim()),
    };
  });

  const problems = [];
  if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText}`);
  if (pageErrors.length) problems.push(`uncaught error: ${pageErrors.join(' | ')}`);
  for (const error of consoleErrors) {
    // Network failures are the point of the block above, not a defect.
    if (/ERR_FAILED|net::|Failed to fetch|FirebaseError|WebChannel|transport errored/i.test(error)) continue;
    problems.push(`console error: ${error}`);
  }

  if (scene.expect === 'nothing') {
    if (seen.html !== '') problems.push(`expected to render nothing, rendered ${seen.elements} element(s): ${seen.html.slice(0, 160)}`);
  } else {
    if (seen.elements === 0 || seen.text === '') problems.push('rendered blank');
    for (const needle of scene.mustContain || []) {
      if (!seen.text.includes(needle)) problems.push(`missing expected text: ${needle}`);
    }
  }
  for (const needle of scene.mustNotContain || []) {
    if (seen.text.includes(needle)) problems.push(`showed forbidden text: ${needle}`);
  }
  if (scene.expectRouteNot && decision.route === scene.expectRouteNot) {
    problems.push(`route must never be ${scene.expectRouteNot} here`);
  }

  report.push({
    scene: scene.name,
    route: decision.route,
    roomId: decision.roomId,
    bannerVisible: decision.bannerVisible,
    elements: seen.elements,
    buttons: seen.buttons,
    text: seen.text.slice(0, 120),
    problems,
  });
  if (problems.length) findings.push({ scene: scene.name, route: decision.route, problems });
}

await browser.close();

for (const row of report) {
  const status = row.problems.length ? 'FAIL' : 'ok';
  console.log(`${status.padEnd(4)} ${row.scene.padEnd(38)} route=${String(row.route).padEnd(18)} els=${String(row.elements).padEnd(4)} banner=${row.bannerVisible}`);
  if (row.text) console.log(`       "${row.text}"`);
  if (row.buttons.length) console.log(`       buttons: ${row.buttons.join(' | ')}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nblocked ${blocked.length} non-local request(s) — no production contact`);

if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`wrote ${FINDINGS}`);
} else {
  let recorded = [];
  try { recorded = JSON.parse(readFileSync(FINDINGS, 'utf8')); } catch { recorded = []; }
  if (JSON.stringify(recorded) !== JSON.stringify(findings)) {
    console.log('\nFindings differ from the recorded fixture. Re-run with --write if this is intended.');
  }
}

process.exit(findings.length ? 1 : 0);
