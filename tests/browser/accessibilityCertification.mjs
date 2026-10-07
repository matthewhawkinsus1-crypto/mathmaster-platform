/*
 * ACCESSIBILITY CERTIFICATION — WCAG 2.1 AA (axe-core), student screens,
 * Chromebook 1366×768 and phone 390×844, light theme, with a ratchet.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &   # the real app, in memory
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &   # standalone harnesses
 *   npm run certify:accessibility                      # fail on any new / increased violation
 *   npm run certify:accessibility -- --write-baseline  # after a deliberate reduction
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), AUDIT_ORIGIN
 *   (default http://127.0.0.1:5199), PLAYWRIGHT_MODULE / CHROMIUM_PATH,
 *   ONLY=<screen id>[,<screen id>] to run some screens (the ratchet then
 *   judges only those), ACCESSIBILITY_ARTIFACTS for the report and
 *   screenshots (default tests/browser/artifacts/accessibility, git-ignored).
 *
 * THE SCREENS (SCREENS below; tests/platform/accessibilityCertificationContract
 * pins all seven and both viewports):
 *
 *   student-home, student-assignments, student-grades, my-math-path
 *       the REAL App.jsx signed in as a synthetic student (the teacher-workflow
 *       in-memory harness; firebase/* faked), opened from the student nav.
 *   live-challenge
 *       the same app; the invite, room and player are written into the
 *       in-memory store, the student joins from Home: the lobby, then a round
 *       whose question is built by the real Path pipeline (as
 *       liveChallengeGame.mjs builds it).
 *   assignment-tools
 *       studentUxPlatform.html: one assignment compiled through the teacher
 *       import chain, in App.jsx's assignment wrappers — Step Algebra,
 *       Graphing 2 and the Linear Table Workbench open. The harness's own
 *       stand-in navigator is excluded; the question stage is audited.
 *   secure-exam
 *       accessibilitySecureExam.html: the Test Cycle card at its Test stage,
 *       then the REAL SecureExamContainer's start screen and a secure question
 *       (stubbed callables).
 *
 * THE RATCHET (scripts/lib/accessibilityRatchet.mjs): failing-node counts per
 * `${screen}|${viewport}|${ruleId}` against scripts/accessibility-baseline.json.
 * A new key or a higher count fails and names the rule, axe's help URL and the
 * targets the baseline does not list; a lower count passes with "baseline can
 * be lowered". A screen that cannot be reached fails the run.
 *
 * NOTHING LEAVES LOCALHOST: every context aborts non-local requests.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditAccessibility, AXE_VERSION, settleForAudit } from './accessibilityAudit.mjs';
import {
  buildBaseline, compare, describeFailures, mergeNormalized, ratchetFailed, readBaselineCounts, WCAG_TAGS,
} from '../../scripts/lib/accessibilityRatchet.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
export const BASELINE_PATH = path.join(repo, 'scripts/accessibility-baseline.json');

export const VIEWPORTS = [
  { id: 'desktop', width: 1366, height: 768 },
  { id: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
];

const STUDENT_ID = '910002';
const ROOM_ID = 'a11y-room';
const PLAYER_KEY = 'a11y-player';

// ------------------------------------------------------------------ drivers
const appUrl = (origins) => `${origins.app}/tests/browser/teacherWorkflow/index.html?reset=1&as=student&studentId=${STUDENT_ID}`;

const openStudentApp = async (page, origins) => {
  await page.goto(appUrl(origins), { timeout: 180_000 });
  await page.locator('nav[aria-label="Student navigation"]').first().waitFor({ timeout: 180_000 });
};

// The student nav, clicked programmatically as darkModeCertification does
// (on a phone the nav can sit under a sticky bar).
const studentTab = (name, ready) => async (page) => {
  await page.locator('nav[aria-label="Student navigation"] button').filter({ hasText: name }).first().evaluate((button) => button.click());
  await page.getByText(ready).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

const studentAppScreen = (id, tab, ready) => ({
  id,
  harness: 'app',
  open: openStudentApp,
  scenes: [{ id: null, run: studentTab(tab, ready) }],
});

// One real choice question, built the way issueNextQuestion builds it (and
// liveChallengeGame.mjs does): a seed-bank item, instantiated, gated as
// issuable, sanitized. Deterministic: the first such item in file order.
let challengeQuestion = null;
const buildChallengeQuestion = async () => {
  if (challengeQuestion) return challengeQuestion;
  const require = createRequire(import.meta.url);
  const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
  const seedDir = path.join(repo, 'functions/seeds/pathQuestionBank');
  for (const file of readdirSync(seedDir).filter((name) => name.endsWith('.json')).sort()) {
    const parsed = JSON.parse(readFileSync(path.join(seedDir, file), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const instantiated = await mathPath.instantiateQuestion(item, `accessibility|${item.id}`);
      if (!instantiated?.question || !mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (!plan?.issuable) continue;
      challengeQuestion = mathPath.buildSanitizedQuestion(instantiated.question, {
        questionInstanceId: `challenge_${ROOM_ID}_r1`, attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload,
      });
      challengeQuestion.challengeRound = 0;
      return challengeQuestion;
    }
  }
  throw new Error('No issuable multiple-choice question in functions/seeds/pathQuestionBank for the Live Challenge round.');
};

const uxQuestion = (questionId, ready) => async (page, origins, { first }) => {
  if (first) {
    await page.goto(`${origins.audit}/tests/browser/studentUxPlatform.html?q=${questionId}&run=a11y`, { timeout: 180_000 });
    await page.waitForFunction((qid) => window.__ux && document.querySelector(`[data-question-id="${qid}"]`), questionId, { timeout: 180_000 });
  } else {
    await page.evaluate((qid) => window.__ux.go(qid), questionId);
    await page.waitForFunction((qid) => document.querySelector(`[data-question-id="${qid}"]`), questionId, { timeout: 60_000 });
  }
  await page.locator(ready).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
};

export const SCREENS = [
  studentAppScreen('student-home', 'Home', /^Welcome, /),
  studentAppScreen('student-assignments', 'Assignments', 'My Assignments'),
  studentAppScreen('student-grades', 'Grades', 'My Grades'),
  {
    id: 'assignment-tools',
    harness: 'audit',
    // The harness's stand-in question navigator is not App.jsx's.
    include: '.mathmaster-question-stage',
    scenes: [
      { id: 'step-algebra', run: uxQuestion('ux-step', '.mathmaster-question-engine') },
      { id: 'graphing', run: uxQuestion('ux-graph2', 'svg.mathmaster-responsive-canvas') },
      { id: 'table-workbench', run: uxQuestion('ux-ltw', '.mathmaster-question-engine') },
    ],
  },
  studentAppScreen('my-math-path', 'My Math Path', 'Your Weekly Math Path'),
  {
    id: 'secure-exam',
    harness: 'audit',
    scenes: [
      { id: 'start', run: async (page, origins) => {
        await page.goto(`${origins.audit}/tests/browser/accessibilitySecureExam.html?stage=test`, { timeout: 180_000 });
        await page.locator('[data-test-cycle-stage="test"]').waitFor({ timeout: 180_000 });
        await page.getByRole('button', { name: /Start Test/ }).first().click();
        await page.getByText('One attempt per question').first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(600);
      } },
      { id: 'question', run: async (page) => {
        await page.getByRole('button', { name: /Start Test/ }).first().click();
        await page.getByText(/slope-intercept form/).first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(1200);
      } },
    ],
  },
  {
    id: 'live-challenge',
    harness: 'app',
    open: openStudentApp,
    scenes: [
      { id: 'lobby', run: async (page) => {
        await page.evaluate(({ roomId, playerKey, studentId }) => {
          const store = window.__mmHarnessStore;
          store.set(`liveChallengeRooms/${roomId}`, {
            schemaVersion: 2, roomId, title: 'Period 3 Warm-Up Challenge', status: 'lobby',
            roundCount: 2, roundSeconds: 30, currentRound: -1, currentQuestion: null,
            roundStartedAt: null, roundEndsAt: null, assignmentId: 'accessibility-warmup',
          });
          store.set(`liveChallengeRooms/${roomId}/players/${playerKey}`, {
            playerKey, alias: 'Swift Otter', joined: true, score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
          });
          store.set(`liveChallengeInvites/${studentId}`, {
            roomId, title: 'Period 3 Warm-Up Challenge', alias: 'Swift Otter', playerKey, status: 'running', assignmentId: 'accessibility-warmup',
          });
        }, { roomId: ROOM_ID, playerKey: PLAYER_KEY, studentId: STUDENT_ID });
        await page.getByRole('button', { name: /Join Challenge Now/ }).first().click();
        await page.getByText('Waiting for your teacher to start').first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(900);
      } },
      { id: 'round', run: async (page) => {
        const question = await buildChallengeQuestion();
        await page.evaluate(({ roomId, currentQuestion }) => {
          // Started two seconds ago, ten minutes left: the answering screen,
          // not a countdown and never "Time is up".
          const startsAt = Date.now() - 2000;
          window.__mmHarnessStore.update(`liveChallengeRooms/${roomId}`, {
            status: 'running', currentRound: 0, currentQuestion, roundVersion: 1, roundToken: 'a11y-round-1',
            phase: 'answering', startsAt, endsAt: startsAt + 600_000, roundStartedAt: startsAt, roundEndsAt: startsAt + 600_000,
          });
        }, { roomId: ROOM_ID, currentQuestion: question });
        await page.getByText('Round 1 of 2').first().waitFor({ timeout: 30_000 });
        await page.locator('[role="radio"], input[type="radio"]').first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(1200);
      } },
    ],
  },
];

export const sceneLabel = (screen, scene) => (scene.id ? `${screen.id}/${scene.id}` : screen.id);

// ------------------------------------------------------------------ main
const readBaseline = () => { try { return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch { return { counts: {}, targets: {} }; } };

const main = async () => {
  const WRITE = process.argv.includes('--write-baseline');
  const ONLY = new Set(String(process.env.ONLY || '').split(',').map((entry) => entry.trim()).filter(Boolean));
  const unknown = [...ONLY].filter((id) => !SCREENS.some((screen) => screen.id === id));
  if (unknown.length) throw new Error(`ONLY names unknown screen(s): ${unknown.join(', ')} (known: ${SCREENS.map((screen) => screen.id).join(', ')})`);
  const screens = SCREENS.filter((screen) => !ONLY.size || ONLY.has(screen.id));
  const origins = {
    app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188',
    audit: process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199',
  };
  const artifacts = process.env.ACCESSIBILITY_ARTIFACTS || path.join(repo, 'tests/browser/artifacts/accessibility');
  mkdirSync(artifacts, { recursive: true });

  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);

  const baseline = readBaseline();
  const baselineCounts = readBaselineCounts(baseline);
  const results = [];
  const unreachable = [];
  let blocked = 0;

  for (const viewport of VIEWPORTS) {
    for (const screen of screens) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.isMobile),
        hasTouch: Boolean(viewport.hasTouch),
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        blocked += 1;
        return route.abort();
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      let first = true;
      try {
        if (screen.open) await screen.open(page, origins);
      } catch (error) {
        unreachable.push(`${screen.id}|${viewport.id}: could not open — ${error.message.split('\n')[0]}`);
        await page.screenshot({ path: path.join(artifacts, `FAIL-${screen.id}-${viewport.id}-open.png`), fullPage: true }).catch(() => {});
        await context.close();
        continue;
      }
      for (const scene of screen.scenes) {
        const label = sceneLabel(screen, scene);
        const shot = path.join(artifacts, `FAIL-${label.replace(/\//g, '--')}-${viewport.id}.png`);
        try {
          await scene.run(page, origins, { first });
          first = false;
          await settleForAudit(page);
        } catch (error) {
          unreachable.push(`${label}|${viewport.id}: could not reach the screen — ${error.message.split('\n')[0]}`);
          await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
          break;
        }
        const audit = await auditAccessibility(page, { name: label, viewport: viewport.id, include: screen.include, exclude: screen.exclude });
        const verdict = compare(baselineCounts, audit.counts, { scope: (key) => key.screen === label && key.viewport === viewport.id });
        if (!WRITE && ratchetFailed(verdict)) await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        else await page.screenshot({ path: path.join(artifacts, `${label.replace(/\//g, '--')}-${viewport.id}.png`) }).catch(() => {});
        results.push({ screen: screen.id, scene: scene.id, label, viewport: viewport.id, counts: audit.counts, details: audit.details, needsReview: audit.needsReview });
        const total = Object.values(audit.counts).reduce((sum, count) => sum + count, 0);
        console.log(`${ratchetFailed(verdict) && !WRITE ? 'FAIL' : 'ok  '} ${label.padEnd(32)} ${viewport.id.padEnd(8)} ${Object.keys(audit.counts).length} rule(s), ${total} node(s)`);
      }
      if (pageErrors.length) console.log(`     page errors on ${screen.id}|${viewport.id}: ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}`);
      await context.close();
    }
  }
  await browser.close();

  const current = mergeNormalized(...results);
  const labels = new Set(results.map((result) => result.label));
  // A partial run judges only the screens it ran.
  const scope = ONLY.size ? (key) => [...ONLY].some((id) => key.screen === id || key.screen.startsWith(`${id}/`)) : null;
  const comparison = compare(baselineCounts, current.counts, { scope });
  const report = {
    axeVersion: AXE_VERSION,
    tags: WCAG_TAGS,
    viewports: VIEWPORTS,
    screens: SCREENS.map((screen) => ({ id: screen.id, scenes: screen.scenes.map((scene) => sceneLabel(screen, scene)) })),
    unreachable,
    comparison,
    totals: current.counts,
    details: current.details,
    // axe "incomplete": not decidable automatically; reported, not ratcheted.
    needsReview: results.filter((result) => result.needsReview.length).map((result) => ({ label: result.label, viewport: result.viewport, rules: result.needsReview })),
    blockedNonLocalRequests: blocked,
  };
  writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${labels.size} screen(s) × ${VIEWPORTS.length} viewport(s) audited with axe-core ${AXE_VERSION} (${WCAG_TAGS.join(', ')}); blocked ${blocked} non-local request(s).`);

  if (WRITE) {
    if (unreachable.length) {
      console.error(`Not writing the baseline: ${unreachable.length} screen(s) could not be reached:\n  ${unreachable.join('\n  ')}`);
      process.exitCode = 1;
      return;
    }
    // A partial run replaces only its own screens' keys.
    const keep = (key) => scope && !scope({ screen: key.split('|')[0] });
    const keptCounts = Object.fromEntries(Object.entries(baselineCounts).filter(([key]) => keep(key)));
    const keptTargets = Object.fromEntries(Object.entries(baseline.targets || {}).filter(([key]) => keep(key)));
    const next = buildBaseline({ counts: { ...keptCounts, ...current.counts }, details: current.details });
    next.targets = Object.fromEntries(Object.entries({ ...keptTargets, ...next.targets }).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Wrote ${path.relative(repo, BASELINE_PATH)}: ${Object.keys(next.counts).length} screen|viewport|rule key(s), ${Object.values(next.counts).reduce((sum, count) => sum + count, 0)} failing node(s).`);
    return;
  }

  const failed = ratchetFailed(comparison);
  if (failed) {
    console.error('\nNew WCAG 2.1 AA violations (axe-core). Fix them, or — only for a deliberate, reviewed exception — run with --write-baseline:');
    describeFailures(comparison, { details: current.details, baselineTargets: baseline.targets || {} }).forEach((line) => console.error(`  ${line}`));
  }
  if (unreachable.length) {
    console.error(`\n${unreachable.length} screen(s) could not be reached (screenshots in ${path.relative(repo, artifacts)}):`);
    unreachable.forEach((line) => console.error(`  - ${line}`));
  }
  if (comparison.reduced.length) {
    console.log(`\n${comparison.reduced.length} count(s) below the baseline — baseline can be lowered: run with --write-baseline`);
    comparison.reduced.forEach((row) => console.log(`  ${row.key}: ${row.count} (baseline ${row.baseline})`));
  }
  if (failed || unreachable.length) {
    console.error(`\nAccessibility certification FAILED. Report: ${path.relative(repo, path.join(artifacts, 'report.json'))}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAccessibility certification passed (no new or increased violations). Report: ${path.relative(repo, path.join(artifacts, 'report.json'))}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
