/*
 * RUN A RELEASE PLAN: BATCHES, PAUSES, BOUNDED RETRIES, AND A STOP BEFORE
 * ANYTHING A FAILED FUNCTION WOULD BREAK.
 *
 * `runner(step)` performs one deploy step and resolves { ok, output };
 * `verifyBuildInfo(step)` asks the deployed platformBuildInfo which commit it
 * serves and resolves what it observed ({ url, reachable, status, body, error });
 * `sleep` waits. All are injected, so tests/platform/releasePlan.test.mjs drives
 * quota storms, broken functions and a wrong live commit through this exact
 * code with no Firebase and no network at all.
 *
 * For a functions group that fails:
 *   - a failure that waiting can fix (quota, a cancelled Cloud Build, a
 *     discovery timeout, the network) is retried after a growing pause;
 *   - when retries run out, or the failure is one waiting cannot fix (code,
 *     auth), the group is split in half and each half tried on its own, down
 *     to single functions — so ONE broken function is named, and the other
 *     nine in its group still ship;
 *   - a function that fails on its own is recorded with the reason.
 * After the functions steps, the verify step (scripts/lib/releasePlan.mjs)
 * requires platformBuildInfo to report this checkout's HEAD, retrying briefly.
 * A wrong commit or no answer is treated exactly like a function that did not
 * deploy.
 * If any function is left undeployed, or the live commit is not proven, the
 * path-admin codebase, rules and Hosting are NOT deployed: the new client may
 * call code that is not there. The report says exactly what to re-run.
 */

import {
  RELEASE_TARGETS,
  RETRYABLE_FAILURES,
  VERIFY_FUNCTIONS,
  assessBuildInfoResponse,
  bisect,
  classifyDeployFailure,
  retryDelaySeconds,
} from './releasePlan.mjs';

const notDeployTarget = (target) => target === RELEASE_TARGETS.FUNCTIONS || target === VERIFY_FUNCTIONS;

export const executeReleasePlan = async ({
  steps,
  runner,
  verifyBuildInfo = async () => ({ reachable: false, error: 'no platformBuildInfo caller was provided' }),
  sleep = async () => {},
  log = () => {},
  maxAttempts = 3,
  pauseSecondsBetweenGroups = 45,
  continueAfterFunctionFailure = false,
  now = () => Date.now(),
}) => {
  const results = [];
  const failedFunctions = [];
  const queue = steps.map((step) => ({ ...step }));
  let stoppedBeforeTargets = null;
  let previousWasFunctions = false;
  // null when the plan has no verify step; otherwise passed | failed | skipped.
  let verification = null;
  const skipVerification = (reason) => {
    const pending = queue.find((next) => next.target === VERIFY_FUNCTIONS);
    if (pending && !verification) {
      verification = { status: 'skipped', function: pending.function, expectedGitSha: pending.expectedGitSha || null, reason };
    }
  };

  while (queue.length) {
    const step = queue.shift();
    const isFunctions = step.target === RELEASE_TARGETS.FUNCTIONS;
    const isVerify = step.target === VERIFY_FUNCTIONS;
    const functionsUnproven = failedFunctions.length > 0 || verification?.status === 'failed';

    if (!isFunctions && functionsUnproven && !continueAfterFunctionFailure) {
      queue.unshift(step);
      skipVerification(`${failedFunctions.length} function(s) did not deploy`);
      const held = queue.map((next) => next.target).filter((target) => !notDeployTarget(target));
      stoppedBeforeTargets = held.length ? held : null;
      log(failedFunctions.length
        ? `Stopping${held.length ? ` before ${held.join(', ')}` : ''}: ${failedFunctions.length} function(s) did not deploy.`
        : `Stopping${held.length ? ` before ${held.join(', ')}` : ''}: the deployed functions are not proven to serve this commit.`);
      break;
    }
    if (isFunctions && previousWasFunctions && pauseSecondsBetweenGroups > 0) {
      log(`Pausing ${pauseSecondsBetweenGroups}s so the per-minute function quota refills.`);
      await sleep(pauseSecondsBetweenGroups);
    }

    if (isVerify) {
      const record = { label: step.label, target: step.target, group: null, attempts: [], ok: false };
      let verdict = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const startedAt = now();
        log(`${step.label}: attempt ${attempt}/${maxAttempts} (expects ${step.expectedGitSha ? step.expectedGitSha.slice(0, 12) : 'an unknown HEAD'})`);
        let observed;
        try {
          observed = await verifyBuildInfo(step);
        } catch (error) {
          observed = { reachable: false, error: String(error?.message || error) };
        }
        verdict = assessBuildInfoResponse(observed, { expectedGitSha: step.expectedGitSha });
        record.attempts.push({
          attempt,
          ok: verdict.ok,
          failure: verdict.failure,
          liveGitSha: verdict.liveGitSha,
          detail: verdict.detail,
          seconds: Math.round((now() - startedAt) / 1000),
        });
        if (verdict.ok || attempt === maxAttempts) break;
        const wait = retryDelaySeconds(verdict.failure, attempt);
        log(`${step.label}: ${verdict.failure} (${verdict.detail}); asking again in ${wait}s.`);
        await sleep(wait);
      }
      record.ok = Boolean(verdict?.ok);
      results.push(record);
      previousWasFunctions = false;
      verification = {
        status: record.ok ? 'passed' : 'failed',
        function: step.function,
        url: verdict?.url || null,
        expectedGitSha: verdict?.expectedGitSha || null,
        liveGitSha: verdict?.liveGitSha || null,
        liveTreeClean: verdict?.liveTreeClean ?? null,
        liveWrittenAt: verdict?.liveWrittenAt || null,
        failure: verdict?.failure || null,
        detail: verdict?.detail || null,
        warning: verdict?.warning || null,
        attempts: record.attempts.length,
      };
      if (record.ok) {
        log(`${step.label}: ${verdict.detail}${verdict.warning ? ` — WARNING: ${verdict.warning}` : ''}.`);
      } else {
        log(`${step.label} FAILED (${verdict.failure}): ${verdict.detail}. Treated like a function that did not deploy.`);
      }
      continue;
    }

    const record = { label: step.label, target: step.target, group: step.group || null, attempts: [], ok: false };
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = now();
      log(`${step.label}: attempt ${attempt}/${maxAttempts}${step.group ? ` (${step.group.join(', ')})` : ''}`);
      const outcome = await runner(step);
      const failure = outcome.ok ? null : classifyDeployFailure(outcome.output);
      record.attempts.push({ attempt, ok: Boolean(outcome.ok), failure, seconds: Math.round((now() - startedAt) / 1000) });
      if (outcome.ok) { record.ok = true; break; }
      if (!RETRYABLE_FAILURES.has(failure) || attempt === maxAttempts) break;
      const wait = retryDelaySeconds(failure, attempt);
      log(`${step.label}: ${failure} failure; waiting ${wait}s before retrying.`);
      await sleep(wait);
    }
    results.push(record);
    previousWasFunctions = isFunctions;

    if (record.ok) continue;
    const lastFailure = record.attempts.at(-1)?.failure || 'unknown';
    if (isFunctions && step.group.length > 1) {
      const halves = bisect(step.group);
      log(`${step.label}: still failing (${lastFailure}); splitting into ${halves.map((half) => half.length).join(' + ')} to find the function that is really broken.`);
      queue.unshift(...halves.map((group, index) => ({ target: step.target, group, label: `${step.label}.${index + 1}` })));
      continue;
    }
    if (isFunctions) {
      failedFunctions.push({ name: step.group[0], failure: lastFailure });
      continue;
    }
    // A rules / index / Hosting step that will not deploy ends the release.
    skipVerification(`${step.target} failed`);
    stoppedBeforeTargets = queue.map((next) => next.target).filter((target) => target !== VERIFY_FUNCTIONS);
    log(`${step.label} failed (${lastFailure}); stopping.`);
    return { ok: false, results, failedFunctions, verification, failedStep: step.target, stoppedBeforeTargets };
  }

  return {
    ok: failedFunctions.length === 0 && verification?.status !== 'failed' && !stoppedBeforeTargets,
    results,
    failedFunctions,
    verification,
    failedStep: null,
    stoppedBeforeTargets,
  };
};
