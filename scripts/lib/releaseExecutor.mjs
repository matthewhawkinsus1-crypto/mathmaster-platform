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
 * deploy. Then the access step (`ensureCallableAccess`, injected) checks that
 * a browser can reach every callable and grants the Cloud Run invoker binding
 * the Firebase CLI only grants at create; a callable still unreachable, or a
 * check that could not run, is treated the same way.
 * If any function is left undeployed, the live commit is not proven, or a
 * callable is not proven reachable, the path-admin codebase, rules and Hosting
 * are NOT deployed: the new client may call code that is not there, or that it
 * cannot reach. The report says exactly what to re-run.
 */

import {
  ACCESS_FUNCTIONS,
  RELEASE_TARGETS,
  RETRYABLE_FAILURES,
  VERIFY_FUNCTIONS,
  assessBuildInfoResponse,
  bisect,
  classifyDeployFailure,
  retryDelaySeconds,
} from './releasePlan.mjs';

const notDeployTarget = (target) => target === RELEASE_TARGETS.FUNCTIONS || target === VERIFY_FUNCTIONS || target === ACCESS_FUNCTIONS;

export const executeReleasePlan = async ({
  steps,
  runner,
  verifyBuildInfo = async () => ({ reachable: false, error: 'no platformBuildInfo caller was provided' }),
  // The access step (scripts/verify-callable-access.mjs#ensureCallableAccess):
  // resolves { ok, checked, reason, summary, grants, redeploy }. Not provided
  // means not checked, which is never a pass.
  ensureCallableAccess = async () => ({ ok: false, checked: false, reason: 'no callable access checker was provided' }),
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
  // The same, for the browser-access step.
  let access = null;
  const skipVerification = (reason) => {
    const pending = queue.find((next) => next.target === VERIFY_FUNCTIONS);
    if (pending && !verification) {
      verification = { status: 'skipped', function: pending.function, expectedGitSha: pending.expectedGitSha || null, reason };
    }
    if (queue.some((next) => next.target === ACCESS_FUNCTIONS) && !access) access = { status: 'skipped', reason };
  };

  while (queue.length) {
    const step = queue.shift();
    const isFunctions = step.target === RELEASE_TARGETS.FUNCTIONS;
    const isVerify = step.target === VERIFY_FUNCTIONS;
    const isAccess = step.target === ACCESS_FUNCTIONS;
    const functionsUnproven = failedFunctions.length > 0 || verification?.status === 'failed' || access?.status === 'failed';

    if (!isFunctions && functionsUnproven && !continueAfterFunctionFailure) {
      queue.unshift(step);
      skipVerification(`${failedFunctions.length} function(s) did not deploy`);
      const held = queue.map((next) => next.target).filter((target) => !notDeployTarget(target));
      stoppedBeforeTargets = held.length ? held : null;
      const before = held.length ? ` before ${held.join(', ')}` : '';
      log(failedFunctions.length
        ? `Stopping${before}: ${failedFunctions.length} function(s) did not deploy.`
        : verification?.status === 'failed'
          ? `Stopping${before}: the deployed functions are not proven to serve this commit.`
          : `Stopping${before}: browsers are not proven able to reach every callable.`);
      break;
    }

    if (isAccess) {
      const startedAt = now();
      log(`${step.label}: checking every callable's Cloud Run invoker binding, granting it where it is missing.`);
      let observed;
      try {
        observed = await ensureCallableAccess(step);
      } catch (error) {
        observed = { ok: false, checked: false, reason: String(error?.message || error) };
      }
      const failing = observed?.summary?.failing || [];
      const granted = (observed?.grants || []).filter((grant) => grant.ok).map((grant) => grant.name);
      const ok = observed?.ok === true && observed?.checked !== false;
      const detail = observed?.checked === false
        ? `not checked: ${observed?.reason || 'unknown reason'}`
        : `${observed?.summary?.total ?? 0} callable(s)${granted.length ? `, granted browser access to ${granted.join(', ')}` : ''}${failing.length ? `; still unreachable: ${failing.join(', ')}` : ''}`;
      results.push({
        label: step.label, target: step.target, group: null, ok, attempts: [{ attempt: 1, ok, failure: ok ? null : 'unreachable', seconds: Math.round((now() - startedAt) / 1000) }],
      });
      access = { status: ok ? 'passed' : 'failed', detail, granted, failing, redeploy: observed?.redeploy || [] };
      previousWasFunctions = false;
      log(ok ? `${step.label}: ${detail}.` : `${step.label} FAILED: ${detail}. Treated like a function that did not deploy.`);
      continue;
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
    stoppedBeforeTargets = queue.map((next) => next.target).filter((target) => target !== VERIFY_FUNCTIONS && target !== ACCESS_FUNCTIONS);
    log(`${step.label} failed (${lastFailure}); stopping.`);
    return { ok: false, results, failedFunctions, verification, access, failedStep: step.target, stoppedBeforeTargets };
  }

  return {
    ok: failedFunctions.length === 0 && verification?.status !== 'failed' && access?.status !== 'failed' && !stoppedBeforeTargets,
    results,
    failedFunctions,
    verification,
    access,
    failedStep: null,
    stoppedBeforeTargets,
  };
};
