#!/usr/bin/env node
/*
 * MATHMASTER INTERACTIVE CAPABILITY CERTIFICATION — THE REPORT.
 *
 *   npm run certify:capabilities                      (tier: merge)
 *   npm run certify:capabilities -- --tier pr         node gates only, seconds
 *   npm run certify:capabilities -- --tier release    everything, before a deploy
 *   npm run certify:capabilities -- --origin http://127.0.0.1:5199   reuse a running harness
 *
 * Reads src/platform/certification/interactiveCapabilityManifest.js, runs the
 * node gate and the browser suites for the tier, and prints one report grouped
 * by subsystem. Each failing line names the journey, the step, the error and
 * the screenshot. The report is also written to
 * tests/browser/artifacts/capability-certification-report.{md,json} and, in
 * GitHub Actions, to the job summary. Exit 1 on any failure.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CERTIFICATION_SUBSYSTEMS,
  CERTIFICATION_TIERS,
  INTERACTIVE_CAPABILITIES,
  suitesForTier,
} from '../src/platform/certification/interactiveCapabilityManifest.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const tier = arg('tier', process.env.CERTIFICATION_TIER || 'merge');
if (!CERTIFICATION_TIERS.includes(tier)) {
  console.error(`Unknown tier ${tier}. Use one of: ${CERTIFICATION_TIERS.join(', ')}`);
  process.exit(2);
}
const reportDir = path.resolve(arg('report-dir', 'tests/browser/artifacts'));
mkdirSync(reportDir, { recursive: true });
const PORT = Number(process.env.CERTIFICATION_PORT || 5199);
let origin = arg('origin', process.env.AUDIT_ORIGIN || '');
const commit = String(spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout || '').trim() || 'unknown';

const tail = (text, lines = 25) => String(text || '').trim().split('\n').slice(-lines).join('\n');

const run = (command, env = {}, timeoutMs = 20 * 60 * 1000) => new Promise((resolve) => {
  const started = Date.now();
  const child = spawn(command[0], command.slice(1), { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ code: code ?? 1, output, ms: Date.now() - started });
  });
});

// ------------------------------------------------------------- 1. node gate
console.log(`\n=== Capability certification · tier ${tier} · ${commit} ===\n`);
const nodeGate = await run(['node', '--test', 'tests/platform/interactiveCapabilityCertification.test.mjs', 'tests/platform/algebraWorkspaceRoute.test.mjs']);
const nodeStatus = new Map();
for (const capability of INTERACTIVE_CAPABILITIES) {
  const name = `${capability.label}: a student can reach it and use it`;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^not ok \\d+ - ${escaped}$`, 'm').test(nodeGate.output)) nodeStatus.set(capability.id, 'fail');
  else if (new RegExp(`^ok \\d+ - ${escaped}$`, 'm').test(nodeGate.output)) nodeStatus.set(capability.id, 'pass');
  else nodeStatus.set(capability.id, nodeGate.code === 0 ? 'pass' : 'fail');
}

// ---------------------------------------------------------- 2. browser suites
const suites = suitesForTier(tier);
const suiteResults = [];
let server = null;
if (suites.some((suite) => suite.server) && !origin) {
  origin = `http://127.0.0.1:${PORT}`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  for (let attempt = 0; attempt < 90 && !ready; attempt += 1) {
    try {
      ready = (await fetch(`${origin}/tests/browser/capabilityCertification.html`)).ok;
    } catch { /* still starting */ }
    if (!ready) await sleep(1000);
  }
  if (!ready) {
    console.error(`The Vite harness did not start on ${origin}.`);
    server.kill('SIGTERM');
    process.exit(1);
  }
}

for (const suite of suites) {
  console.log(`\n--- ${suite.label} (${suite.command.join(' ')}) ---`);
  if (suite.results && existsSync(suite.results)) rmSync(suite.results);
  const result = await run(suite.command, suite.server ? { AUDIT_ORIGIN: origin } : {});
  let journeys = null;
  if (suite.results && existsSync(suite.results)) {
    try { journeys = JSON.parse(readFileSync(suite.results, 'utf8')).results || null; } catch { journeys = null; }
  }
  const skipped = /^SKIPPED:/m.test(result.output);
  suiteResults.push({
    id: suite.id,
    label: suite.label,
    subsystem: suite.subsystem || null,
    command: suite.command.join(' '),
    status: skipped ? 'skipped' : result.code === 0 ? 'pass' : 'fail',
    ms: result.ms,
    journeys,
    outputTail: result.code === 0 ? '' : tail(result.output),
    artifacts: suite.artifacts || null,
  });
}
if (server) server.kill('SIGTERM');

// ------------------------------------------------------------- 3. verdicts
const suiteByHarness = new Map(suites.map((suite) => [suite.command[1], suiteResults.find((result) => result.id === suite.id)]));
const capabilityResults = INTERACTIVE_CAPABILITIES.map((capability) => {
  const node = nodeStatus.get(capability.id);
  const suite = suiteByHarness.get(capability.browser.harness);
  let browser = 'not run';
  let failure = null;
  if (suite) {
    const journey = suite.journeys?.find((entry) => entry.journey === capability.browser.journey);
    if (journey) {
      browser = journey.status;
      if (journey.status !== 'pass') failure = journey;
    } else {
      browser = suite.status;
      if (suite.status === 'fail') failure = { journey: capability.browser.journey, error: `${suite.label} failed`, outputTail: suite.outputTail };
    }
  }
  const status = node === 'fail' || browser === 'fail' ? 'FAIL' : 'PASS';
  return { ...capability, wiring: undefined, nodeStatus: node, browserStatus: browser, status, failure };
});

// --------------------------------------------------------------- 4. report
const lines = [];
const md = [];
lines.push('MathMaster Interactive Capability Certification');
lines.push(`Tier: ${tier} · Commit: ${commit}${tier === 'pr' ? ' · browser journeys not run at this tier' : ''}`);
md.push('## MathMaster Interactive Capability Certification', '', `Tier **${tier}** · commit \`${commit}\``, '');
for (const subsystem of CERTIFICATION_SUBSYSTEMS) {
  const capabilities = capabilityResults.filter((entry) => entry.subsystem === subsystem);
  const extraSuites = suiteResults.filter((entry) => entry.subsystem === subsystem);
  if (!capabilities.length && !extraSuites.length) continue;
  lines.push('', subsystem);
  md.push(`### ${subsystem}`, '', '| | Capability | Node | Browser |', '|---|---|---|---|');
  for (const entry of capabilities) {
    lines.push(`${entry.status} ${entry.label}${entry.browserStatus === 'not run' ? ' (browser not run)' : ''}`);
    md.push(`| ${entry.status === 'PASS' ? '✅' : '❌'} ${entry.status} | ${entry.label} | ${entry.nodeStatus} | ${entry.browserStatus} |`);
    if (entry.failure) {
      const where = entry.failure.failedStep ? ` at "${entry.failure.failedStep}"` : '';
      lines.push(`     ↳ journey ${entry.browser.journey} (${entry.browser.harness})${where}: ${String(entry.failure.error || '').split('\n')[0]}`);
      if (entry.failure.screenshot) lines.push(`     ↳ screenshot ${entry.failure.screenshot}; route ${entry.failure.route || '?'}; console errors ${entry.failure.consoleErrors?.length || 0}`);
    }
  }
  for (const entry of extraSuites) {
    const status = entry.status === 'pass' ? 'PASS' : entry.status === 'skipped' ? 'SKIP' : 'FAIL';
    lines.push(`${status} ${entry.label}`);
    md.push(`| ${status === 'PASS' ? '✅' : status === 'SKIP' ? '⚪' : '❌'} ${status} | ${entry.label} | — | ${entry.status} |`);
    if (status === 'FAIL') lines.push(`     ↳ ${entry.command}\n${entry.outputTail.split('\n').map((line) => `       ${line}`).join('\n')}`);
  }
  md.push('');
}
const failures = capabilityResults.filter((entry) => entry.status === 'FAIL').length
  + suiteResults.filter((entry) => entry.status === 'fail').length;
lines.push('', failures ? `${failures} failure(s). Certification FAILED.` : 'All certified capabilities PASS.');
md.push(failures ? `**${failures} failure(s).** Screenshots are in the \`capability-certification\` artifact.` : '**All certified capabilities pass.**');

const report = lines.join('\n');
console.log(`\n${report}\n`);
writeFileSync(path.join(reportDir, 'capability-certification-report.md'), `${md.join('\n')}\n`);
writeFileSync(path.join(reportDir, 'capability-certification-report.json'), `${JSON.stringify({ tier, commit, capabilities: capabilityResults, suites: suiteResults }, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`);

process.exit(failures || nodeGate.code !== 0 ? 1 : 0);
