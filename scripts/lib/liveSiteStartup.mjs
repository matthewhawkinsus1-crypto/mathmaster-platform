/*
 * DID THE LIVE SITE START? (OP02)
 *
 * The release script proves the functions serve the commit and that every
 * callable is reachable, but nothing loaded the site itself after Hosting: a
 * bundle that throws on start, a chunk that 404s, or a stale build would ship
 * green. scripts/check-live-site.mjs loads the page in a headless browser and
 * reports what it saw; this decides. Pure, so it is tested without a browser.
 *
 * Started cleanly means: the page answered 200; the boot fallback in
 * index.html ("Opening MathMaster…") was replaced by the app; its own
 * recovery card ("MathMaster did not finish loading") never appeared; no
 * uncaught error; no script, style or module of the site's own origin failed;
 * and, when a commit is expected, the served build manifest names it.
 */

const sameCommit = (served, expected) => {
  const a = String(served || '').trim().toLowerCase();
  const b = String(expected || '').trim().toLowerCase();
  return Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
};

export const liveSiteStartupVerdict = ({
  status = null,
  bootFallbackGone = false,
  recoveryShown = false,
  pageErrors = [],
  failedAssets = [],
  servedSha = null,
  expectedSha = null,
} = {}) => {
  const problems = [];
  if (Number(status) !== 200) problems.push(`the page answered HTTP ${status ?? 'nothing'}`);
  if (recoveryShown) problems.push('the page showed "MathMaster did not finish loading"');
  else if (!bootFallbackGone) problems.push('the app never replaced "Opening MathMaster…"');
  (Array.isArray(pageErrors) ? pageErrors : []).slice(0, 5)
    .forEach((message) => problems.push(`uncaught error: ${String(message).slice(0, 200)}`));
  (Array.isArray(failedAssets) ? failedAssets : []).slice(0, 5)
    .forEach(({ url, status: assetStatus }) => problems.push(`asset failed (${assetStatus ?? 'no response'}): ${url}`));
  if (expectedSha && !sameCommit(servedSha, expectedSha)) {
    problems.push(`the served build is ${servedSha || 'unreadable'}, not ${String(expectedSha).slice(0, 12)}`);
  }
  return { ok: problems.length === 0, problems };
};
