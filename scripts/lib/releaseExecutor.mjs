/*
 * RUN A RELEASE PLAN: BATCHES, PAUSES, BOUNDED RETRIES, AND A STOP BEFORE
 * ANYTHING A FAILED FUNCTION WOULD BREAK.
 *
 * `runner(step)` performs one deploy step and resolves { ok, output }; `sleep`
 * waits. Both are injected, so tests/platform/releasePlan.test.mjs drives quota
 * storms and broken functions through this exact code with no Firebase at all.
 *
 * For a functions group that fails:
 *   - a failure that waiting can fix (quota, a cancelled Cloud Build, a
 *     discovery timeout, the network) is retried after a growing pause;
 *   - when retries run out, or the failure is one waiting cannot fix (code,
 *     auth), the group is split in half and each half tried on its own, down
 *     to single functions — so ONE broken function is named, and the other
 *     nine in its group still ship;
 *   - a function that fails on its own is recorded with the reason.
 * If any function is left undeployed, rules and Hosting are NOT deployed: the
 * new client may call it. The report says exactly what to re-run.
 */

import { RELEASE_TARGETS, RETRYABLE_FAILURES, bisect, classifyDeployFailure, retryDelaySeconds } from './releasePlan.mjs';

export const executeReleasePlan = async ({
  steps,
  runner,
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

  while (queue.length) {
    const step = queue.shift();
    const isFunctions = step.target === RELEASE_TARGETS.FUNCTIONS;

    if (!isFunctions && failedFunctions.length && !continueAfterFunctionFailure) {
      stoppedBeforeTargets = [step.target, ...queue.filter((next) => next.target !== RELEASE_TARGETS.FUNCTIONS).map((next) => next.target)];
      log(`Stopping before ${stoppedBeforeTargets.join(', ')}: ${failedFunctions.length} function(s) did not deploy.`);
      break;
    }
    if (isFunctions && previousWasFunctions && pauseSecondsBetweenGroups > 0) {
      log(`Pausing ${pauseSecondsBetweenGroups}s so the per-minute function quota refills.`);
      await sleep(pauseSecondsBetweenGroups);
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
    stoppedBeforeTargets = queue.map((next) => next.target);
    log(`${step.label} failed (${lastFailure}); stopping.`);
    return { ok: false, results, failedFunctions, failedStep: step.target, stoppedBeforeTargets };
  }

  return {
    ok: failedFunctions.length === 0 && !stoppedBeforeTargets,
    results,
    failedFunctions,
    failedStep: null,
    stoppedBeforeTargets,
  };
};
