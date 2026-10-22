/*
 * DID CI PASS ON THE COMMIT ABOUT TO BE DEPLOYED?
 *
 * The provenance check proves a build contains current main; it could not say
 * whether main was green. The browser gates were red on the merged head of
 * #510, #511 and #513, and each of those commits could have been deployed. Now
 * .github/workflows/ci.yml runs every workflow on each push to main and ends in
 * one check, "CI gate". This reads that run for a commit from GitHub, and
 * deployProvenance.mjs refuses anything but a pass.
 *
 * Only ci.yml's run for a push to main counts, not any check named "CI gate".
 * A pull request's run reports that check on the pull request's head commit
 * after skipping every workflow whose area the pull request did not change. If
 * that commit reaches main as it is (a fast-forward push), its pull request
 * check would pass the deploy while main's full run was still going, or red.
 *
 * The repository is public, so reading needs no token; GITHUB_TOKEN (or
 * GH_TOKEN) is used when set, for the higher rate limit.
 */

export const CI_WORKFLOW = '.github/workflows/ci.yml';

/** The owner/repo of a GitHub remote URL (https, ssh, or a proxy path ending in owner/repo). */
export const repoFromRemote = (url) => {
  const match = String(url || '').trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return match ? `${match[1]}/${match[2]}` : null;
};

/**
 * The state of the latest ci.yml run for a push of `sha` to main, from
 * GitHub's workflow-runs response: passed | failed | running | missing.
 */
export const ciGateFromWorkflowRuns = (response, sha) => {
  const runs = Array.isArray(response?.workflow_runs) ? response.workflow_runs : [];
  const run = runs
    .filter((entry) => entry?.path === CI_WORKFLOW && entry.event === 'push' && entry.head_branch === 'main' && entry.head_sha === sha)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  if (!run) return { state: 'missing' };
  const facts = { url: run.html_url || null, startedAt: run.run_started_at || null, conclusion: run.conclusion || null };
  if (run.status !== 'completed') return { state: 'running', ...facts };
  return { state: run.conclusion === 'success' ? 'passed' : 'failed', ...facts };
};

/** Reads the CI result for `sha` from GitHub; any error is state `unknown`, never a pass. */
export const fetchCiGate = async ({ repo, sha, token = null, fetchImpl = globalThis.fetch, timeoutMs = 20_000 }) => {
  if (!repo || !sha) return { state: 'unknown', error: 'no repository or commit to look up' };
  const workflow = CI_WORKFLOW.split('/').pop();
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?event=push&branch=main&head_sha=${sha}&per_page=100`;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { state: 'unknown', error: `GitHub answered HTTP ${response.status} for ${url}` };
    return ciGateFromWorkflowRuns(await response.json(), sha);
  } catch (error) {
    return { state: 'unknown', error: `could not reach GitHub: ${error?.message || error}` };
  }
};
