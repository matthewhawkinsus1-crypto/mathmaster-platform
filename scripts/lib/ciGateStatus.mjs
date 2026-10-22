/*
 * DID CI PASS ON THE COMMIT ABOUT TO BE DEPLOYED?
 *
 * The provenance check proves a build contains current main; it could not say
 * whether main was green. The browser gates were red on the merged head of
 * #510, #511 and #513, and each of those commits could have been deployed. Now
 * .github/workflows/ci.yml runs every workflow on each push to main and ends in
 * one check, "CI gate". This reads that check for a commit from GitHub, and
 * deployProvenance.mjs refuses anything but a pass.
 *
 * The repository is public, so reading needs no token; GITHUB_TOKEN (or
 * GH_TOKEN) is used when set, for the higher rate limit.
 */

export const CI_GATE_CHECK = 'CI gate';

/** The owner/repo of a GitHub remote URL (https, ssh, or a proxy path ending in owner/repo). */
export const repoFromRemote = (url) => {
  const match = String(url || '').trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return match ? `${match[1]}/${match[2]}` : null;
};

/**
 * The gate's state from GitHub's check-runs response for the commit:
 * passed | failed | running | missing.
 */
export const ciGateFromCheckRuns = (response) => {
  const runs = Array.isArray(response?.check_runs) ? response.check_runs : [];
  const gate = runs
    .filter((run) => run?.name === CI_GATE_CHECK)
    .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')))[0];
  if (!gate) return { state: 'missing' };
  const facts = { url: gate.html_url || null, startedAt: gate.started_at || null, conclusion: gate.conclusion || null };
  if (gate.status !== 'completed') return { state: 'running', ...facts };
  return { state: gate.conclusion === 'success' ? 'passed' : 'failed', ...facts };
};

/** Reads the gate for `sha` from GitHub; any error is state `unknown`, never a pass. */
export const fetchCiGate = async ({ repo, sha, token = null, fetchImpl = globalThis.fetch, timeoutMs = 20_000 }) => {
  if (!repo || !sha) return { state: 'unknown', error: 'no repository or commit to look up' };
  const url = `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CI_GATE_CHECK)}&filter=latest&per_page=100`;
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
    return ciGateFromCheckRuns(await response.json());
  } catch (error) {
    return { state: 'unknown', error: `could not reach GitHub: ${error?.message || error}` };
  }
};
