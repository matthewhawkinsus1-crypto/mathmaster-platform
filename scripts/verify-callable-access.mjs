#!/usr/bin/env node
/*
 * CAN A BROWSER REACH EVERY CALLABLE IN PRODUCTION? IF NOT, MAKE IT SO.
 *
 *   node scripts/verify-callable-access.mjs              # check every callable
 *   node scripts/verify-callable-access.mjs --fix        # repair the ones browsers cannot reach
 *   node scripts/verify-callable-access.mjs --functions teacherTestCycleAction --probe
 *
 * A callable whose Cloud Run service does not grant `allUsers` the
 * `roles/run.invoker` role is deployed and healthy, and every browser call to
 * it fails as "internal" ("the server did not answer"). The Firebase CLI
 * grants that role only when it creates a callable, never on a later deploy,
 * so a grant that failed once stays missing. Why, and what is decided from
 * what gcloud reports: scripts/lib/callableAccess.mjs.
 *
 * Options
 *   --fix              grant `allUsers` -> `roles/run.invoker` to every callable
 *                      in the code that lacks it, the same binding the CLI
 *                      grants at create, then read it back. Nothing else
 *                      changes, and nothing is deployed: a callable that is
 *                      not deployed is named with the command that deploys it.
 *   --functions a,b    only these callables
 *   --probe            also send each named callable the CORS preflight a
 *                      browser sends. Needs no credentials; wakes the function.
 *   --codebase <name>  default | path-admin | all (default: all)
 *   --project <id>     default: FIREBASE_PROJECT or mathmaster-aleks
 *   --region <name>    default: FIREBASE_FUNCTIONS_DEFAULT_REGION or us-central1
 *   --concurrency N    IAM policies read at once (default 8)
 *
 * Needs gcloud signed in to the project (Cloud Shell is). Exit 0 when every
 * checked callable is reachable, 1 when one is not, 2 when it could not check.
 *
 * scripts/release-firebase.mjs runs ensureCallableAccess({ fix: true }) after
 * every functions deploy, before path-admin, rules and Hosting.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCESS,
  DEFAULT_REGION,
  INVOKER_ROLE,
  PUBLIC_MEMBER,
  assessPreflight,
  auditCallableAccess,
  deployedFunctionsFrom,
  expectedCallables,
  planCallableRepairs,
  preflightRequest,
  summarizeCallableAccess,
} from './lib/callableAccess.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CODEBASE_DIRS = Object.freeze({ default: 'functions', 'path-admin': 'functions-path-admin' });

/** One gcloud command. Never throws: resolves { ok, missing, stdout, stderr }. */
export const runGcloud = (args, { timeoutMs = 180_000 } = {}) => new Promise((resolve) => {
  let settled = false;
  let stdout = '';
  let stderr = '';
  let timer = null;
  const settle = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve({ missing: false, stdout, stderr, ...value });
  };
  const child = spawn('gcloud', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  timer = setTimeout(() => {
    child.kill('SIGTERM');
    settle({ ok: false, stderr: `${stderr}\ngcloud timed out after ${Math.round(timeoutMs / 1000)}s` });
  }, timeoutMs);
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => settle({ ok: false, missing: error?.code === 'ENOENT', stderr: String(error?.message || error) }));
  child.on('close', (code) => settle({ ok: code === 0, code }));
});

const lastLines = (text, count = 2) => String(text || '').trim().split('\n').filter(Boolean).slice(-count).join(' ').replace(/\s+/g, ' ');

const inPool = async (items, size, work) => {
  const results = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
  return results;
};

/**
 * The callables each codebase defines. A codebase that cannot be loaded here
 * (no node_modules) falls back to what Cloud labels as its callables, and says so.
 */
const expectedFor = async ({ codebases, region, names, deployed, inventories, log }) => {
  const expected = [];
  for (const codebase of codebases) {
    let inventory = inventories?.[codebase] || null;
    if (!inventory) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { listDeployableFunctions } = await import('./lib/functionsInventory.mjs');
        inventory = listDeployableFunctions({ codebaseDir: path.join(repoRoot, CODEBASE_DIRS[codebase]) }).functions;
      } catch (error) {
        log(`The ${codebase} codebase does not load here (${String(error?.message || error).split('\n')[0]}); checking the callables Cloud lists for it. Run \`npm ci\` in ${CODEBASE_DIRS[codebase]}/ to check against the code.`);
        inventory = deployed
          .filter((fn) => fn.callable && fn.codebase === codebase)
          .map((fn) => ({ name: fn.name, trigger: 'callable', region: fn.region }));
      }
    }
    expected.push(...expectedCallables(inventory, { codebase, region, names }));
  }
  return expected;
};

/**
 * Check every callable and, with `fix`, grant the binding where it is missing.
 *
 * Resolves { ok, checked, reason, results, grants, redeploy, summary }.
 * `checked` is false when gcloud could not say (not installed, not signed in);
 * that is never reported as ok. `inventories` ({ codebase: functions[] }) and
 * `gcloud` are injectable; the release passes the inventory it already loaded.
 */
export const ensureCallableAccess = async ({
  project,
  region = DEFAULT_REGION,
  codebases = ['default'],
  names = null,
  fix = false,
  inventories = null,
  concurrency = 8,
  log = () => {},
  gcloud = runGcloud,
} = {}) => {
  const notChecked = (reason) => ({ ok: false, checked: false, reason, results: [], grants: [], redeploy: [], summary: null });
  const listed = await gcloud(['functions', 'list', '--project', project, '--format=json', '--quiet']);
  if (!listed.ok) {
    return notChecked(listed.missing
      ? 'gcloud is not on PATH (Cloud Shell has it)'
      : `\`gcloud functions list\` failed: ${lastLines(listed.stderr) || `exit ${listed.code}`}`);
  }
  let deployed;
  try {
    deployed = deployedFunctionsFrom(JSON.parse(listed.stdout || '[]'));
  } catch (error) {
    return notChecked(`unreadable \`gcloud functions list\` output: ${error.message}`);
  }

  const expected = await expectedFor({ codebases, region, names, deployed, inventories, log });
  const missingNames = (names || []).filter((name) => !expected.some((fn) => fn.name === name));
  if (missingNames.length) log(`Not a callable in the ${codebases.join('/')} code: ${missingNames.join(', ')}`);

  const readPolicies = async (targets) => Object.fromEntries(await inPool(targets, concurrency, async ({ service, region: serviceRegion }) => {
    const read = await gcloud(['run', 'services', 'get-iam-policy', service, '--project', project, '--region', serviceRegion, '--format=json']);
    if (!read.ok) {
      log(`Could not read the IAM policy of ${service}: ${lastLines(read.stderr) || `exit ${read.code}`}`);
      return [service, null];
    }
    try {
      return [service, JSON.parse(read.stdout || '{}')];
    } catch {
      return [service, null];
    }
  }));

  const servicesOf = (results) => [...new Map(results
    .filter((result) => result.service)
    .map((result) => [result.service, { service: result.service, region: result.region }])).values()];

  // Audited once without policies only to learn each callable's service.
  let policies = await readPolicies(servicesOf(auditCallableAccess({ expected, deployed, policies: {} })));
  let results = auditCallableAccess({ expected, deployed, policies });
  // A read that failed is asked once more before it counts against anyone: a
  // release checks ~160 of them, and one network blip should not hold it back.
  const unread = results.filter((result) => result.status === ACCESS.UNREADABLE);
  if (unread.length) {
    policies = { ...policies, ...(await readPolicies(servicesOf(unread))) };
    results = auditCallableAccess({ expected, deployed, policies });
  }

  const grants = [];
  if (fix) {
    const planned = planCallableRepairs(results, { project }).grants;
    // One at a time: IAM writes to one project are throttled.
    for (const grant of planned) {
      log(`Granting ${PUBLIC_MEMBER} ${INVOKER_ROLE} on Cloud Run service ${grant.service} (${grant.name})`);
      // eslint-disable-next-line no-await-in-loop
      const outcome = await gcloud(grant.args);
      grants.push({ name: grant.name, service: grant.service, ok: outcome.ok, error: outcome.ok ? null : (lastLines(outcome.stderr) || `exit ${outcome.code}`) });
      if (!outcome.ok) log(`  failed: ${grants.at(-1).error}`);
    }
    if (planned.length) {
      // Read back: the verdict is what the policy now says, not what was asked.
      policies = { ...policies, ...(await readPolicies(planned.map(({ service, region: grantRegion }) => ({ service, region: grantRegion })))) };
      results = auditCallableAccess({ expected, deployed, policies });
    }
  }

  const summary = summarizeCallableAccess(results);
  return {
    ok: summary.ok && missingNames.length === 0,
    checked: true,
    reason: null,
    results,
    grants,
    redeploy: planCallableRepairs(results, { project }).redeploy,
    summary,
  };
};

/** The preflight a browser sends, and what came back. Never throws. */
export const probeCallable = async ({ project, region = DEFAULT_REGION, name, timeoutMs = 20_000 }) => {
  const { url, init } = preflightRequest({ project, region, name });
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    return {
      url,
      reachable: true,
      status: response.status,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      // Who answered: Google's front end, or something in between.
      server: response.headers.get('server'),
      denyReason: response.headers.get('x-deny-reason'),
      error: null,
    };
  } catch (error) {
    return { url, reachable: false, status: null, allowOrigin: null, server: null, denyReason: null, error: String(error?.cause?.code || error?.message || error) };
  }
};

const main = async () => {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(`--${name}`);
  const option = (name, fallback = null) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
  };
  const project = option('project', process.env.FIREBASE_PROJECT || 'mathmaster-aleks');
  const region = option('region', process.env.FIREBASE_FUNCTIONS_DEFAULT_REGION || DEFAULT_REGION);
  const names = option('functions') ? option('functions').split(',').map((name) => name.trim()).filter(Boolean) : null;
  const codebase = option('codebase', 'all');
  const fix = flag('fix');
  const probe = flag('probe');
  if (codebase !== 'all' && !CODEBASE_DIRS[codebase]) {
    console.error(`Unknown --codebase ${codebase}: use default, path-admin or all.`);
    process.exit(2);
  }
  const codebases = codebase === 'all' ? Object.keys(CODEBASE_DIRS) : [codebase];

  console.log(`Callable access on ${project} (${region})${fix ? ', repairing' : ''}`);
  const outcome = await ensureCallableAccess({
    project, region, codebases, names, fix, concurrency: Number(option('concurrency', 8)) || 8, log: (line) => console.log(`  ${line}`),
  });

  let exitCode = 0;
  if (!outcome.checked) {
    console.log(`  Could not check IAM: ${outcome.reason}`);
    exitCode = 2;
  } else {
    outcome.grants.forEach((grant) => console.log(`  ${grant.ok ? 'GRANTED' : 'GRANT FAILED'} ${grant.name} (${grant.service})${grant.error ? `: ${grant.error}` : ''}`));
    outcome.results
      .filter((result) => names?.length || result.status !== ACCESS.OK)
      .forEach((result) => console.log(`  ${result.status === ACCESS.OK ? 'PASS' : 'FAIL'} ${result.name}${result.codebase === 'default' ? '' : ` [${result.codebase}]`}: ${result.status} — ${result.detail}`));
    const { counts, total } = outcome.summary;
    console.log(`  ${total} callable(s): ${Object.entries(counts).filter(([, count]) => count).map(([status, count]) => `${count} ${status}`).join(', ') || 'none'}`);
    if (!outcome.ok) exitCode = 1;

    const stillPrivate = outcome.results.filter((result) => result.status === ACCESS.PRIVATE);
    if (stillPrivate.length && !fix) {
      console.log('\nRepair (grants exactly the binding the Firebase CLI grants when it creates a callable):');
      console.log(`  node scripts/verify-callable-access.mjs --fix${names?.length ? ` --functions ${names.join(',')}` : ''}`);
    }
    if (outcome.redeploy.length) {
      console.log('\nNot deployed, or the last deploy did not finish. Deploy (a create grants browser access itself):');
      outcome.redeploy.forEach((command) => console.log(`  ${command}`));
    }
  }

  if (probe) {
    const targets = names?.length ? names : outcome.results.filter((result) => result.status !== ACCESS.OK).map((result) => result.name);
    if (!targets.length) console.log('\n--probe: name the callables to probe with --functions.');
    for (const name of targets) {
      const regionOf = outcome.results.find((result) => result.name === name)?.region || region;
      // eslint-disable-next-line no-await-in-loop
      const verdict = assessPreflight(await probeCallable({ project, region: regionOf, name }));
      console.log(`  PROBE ${verdict.ok ? 'PASS' : 'FAIL'} ${name}: ${verdict.detail}`);
      if (!verdict.ok) exitCode = Math.max(exitCode, 1);
    }
  }

  if (names?.length && outcome.checked && outcome.ok) {
    console.log('\nA browser can reach these. If one still fails, read its log:');
    names.forEach((name) => console.log(`  gcloud functions logs read ${name} --gen2 --region ${region} --project ${project} --limit 50`));
  }
  process.exit(exitCode);
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
