/*
 * WHAT IS ABOUT TO BE DEPLOYED, AND IS IT CURRENT MAIN?
 *
 * The resilient Hosting wrapper already refuses a stale dist/ (#337) and checks
 * the public site serves the commit it built (#348). Neither asks whether that
 * commit is current main. A Cloud Shell checkout left on a PR branch — or on a
 * main that was never pulled — builds, uploads and verifies perfectly, and
 * production silently loses every PR merged since that branch was cut.
 *
 * That is how merged work "disappears after a deploy": PRs #345 (elimination)
 * and #346 (factoring, fraction splitting) were developed in parallel from the
 * same base, so a deploy from either branch ships without the other. Nothing in
 * the source tree is lost; the build simply never contained it.
 *
 * This module is the pure decision. `scripts/check-deploy-provenance.mjs`
 * gathers the git facts and exits non-zero when the decision is to refuse.
 *
 * Containing main is not enough if main is red: the browser gates failed on
 * the merged head of #510, #511 and #513, and any of them could have been
 * deployed. So the commit must also have passed .github/workflows/ci.yml on its
 * push to main, which runs every workflow (scripts/lib/ciGateStatus.mjs reads
 * that run from GitHub).
 */

export const DEPLOY_OVERRIDE_ENV = Object.freeze({
  behindMain: 'MATHMASTER_DEPLOY_ALLOW_BEHIND_MAIN',
  dirty: 'MATHMASTER_DEPLOY_ALLOW_DIRTY',
  unverifiedMain: 'MATHMASTER_DEPLOY_ALLOW_UNVERIFIED_MAIN',
  unverifiedCi: 'MATHMASTER_DEPLOY_ALLOW_UNVERIFIED_CI',
});

/** Why a CI gate that did not pass refuses the deploy. */
const ciProblem = (ci = {}) => {
  const where = ci.url ? `: ${ci.url}` : '';
  switch (ci.state) {
    case 'passed': return null;
    case 'running': return { code: 'ciRunning', message: `CI is still checking this commit${ci.startedAt ? ` (started ${ci.startedAt})` : ''}. Deploy once its CI gate passes${where}` };
    case 'failed': return { code: 'ciFailed', message: `The CI gate failed on this commit (${ci.conclusion || 'failed'})${where}. Fix main first.` };
    case 'missing': return { code: 'ciMissing', message: 'CI has not run on this commit as a push to main. Merge it to main and let CI pass before deploying it.' };
    default: return { code: 'ciUnverifiable', message: `Could not read this commit's CI result${ci.error ? ` (${ci.error})` : ''}.` };
  }
};

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/**
 * @param {object} facts
 * @param {string} facts.headSha           commit being built
 * @param {string} facts.branch            checked-out branch ('' when detached)
 * @param {boolean} facts.mainFetched      `git fetch origin main` succeeded
 * @param {string} facts.originMainSha     origin/main after the fetch
 * @param {boolean} facts.headContainsMain origin/main is an ancestor of HEAD
 * @param {string[]} facts.missingFromBuild `git log --oneline HEAD..origin/main`
 * @param {string[]} facts.dirtyFiles      tracked files with uncommitted changes
 * @param {object} [facts.ci]              the commit's CI run on main: { state: passed | failed | running | missing | unknown, url, ... }
 * @param {object} overrides               { behindMain, dirty, unverifiedMain, unverifiedCi } booleans
 */
export const evaluateDeployProvenance = (facts = {}, overrides = {}) => {
  const missingFromBuild = list(facts.missingFromBuild).map(clean).filter(Boolean);
  const dirtyFiles = list(facts.dirtyFiles).map(clean).filter(Boolean);
  const problems = [];
  const warnings = [];

  const push = (overridden, entry) => (overridden ? warnings : problems).push({ ...entry, overridden: Boolean(overridden) });

  if (facts.mainFetched !== true) {
    push(overrides.unverifiedMain, {
      code: 'mainUnverifiable',
      override: DEPLOY_OVERRIDE_ENV.unverifiedMain,
      message: 'Could not fetch origin/main, so this deploy cannot prove it contains every merged PR.',
    });
  } else if (facts.headContainsMain !== true) {
    push(overrides.behindMain, {
      code: 'behindMain',
      override: DEPLOY_OVERRIDE_ENV.behindMain,
      message: `This build does not contain current main (${clean(facts.originMainSha).slice(0, 12) || 'unknown'}). `
        + `Deploying it would remove ${missingFromBuild.length} merged commit(s) from production.`,
      missingFromBuild,
    });
  }

  // Allowed — a hotfix is built on top of main — but never silent: whatever
  // is ahead of main is going to students without having been merged.
  const aheadOfMain = Number(facts.aheadOfMain) || 0;
  if (facts.mainFetched === true && facts.headContainsMain === true && aheadOfMain > 0) {
    warnings.push({
      code: 'aheadOfMain',
      overridden: false,
      message: `This build contains ${aheadOfMain} commit(s) that are not merged to main. They will go live with this deploy.`,
    });
  }

  if (dirtyFiles.length) {
    push(overrides.dirty, {
      code: 'dirtyWorkingTree',
      override: DEPLOY_OVERRIDE_ENV.dirty,
      message: `${dirtyFiles.length} tracked file(s) have uncommitted changes, so the deployed build would not match any commit.`,
      dirtyFiles,
    });
  }

  if (facts.ci !== undefined) {
    const problem = ciProblem(facts.ci);
    if (problem) push(overrides.unverifiedCi, { ...problem, override: DEPLOY_OVERRIDE_ENV.unverifiedCi });
  }

  return {
    ok: problems.length === 0,
    headSha: clean(facts.headSha),
    branch: clean(facts.branch) || '(detached)',
    originMainSha: clean(facts.originMainSha),
    headContainsMain: facts.headContainsMain === true,
    ci: facts.ci === undefined ? 'not checked' : clean(facts.ci?.state) || 'unknown',
    problems,
    warnings,
  };
};

export const formatDeployProvenanceReport = (decision) => {
  const lines = [];
  lines.push('=== MathMaster deploy provenance ===');
  lines.push(`Building:     ${decision.headSha.slice(0, 12) || 'unknown'} on ${decision.branch}`);
  lines.push(`origin/main:  ${decision.originMainSha.slice(0, 12) || 'unknown'}`);
  lines.push(`Contains main: ${decision.headContainsMain ? 'yes' : 'NO'}`);
  if (decision.ci) lines.push(`CI gate:      ${decision.ci === 'passed' ? 'passed' : decision.ci.toUpperCase()}`);
  const describe = (entry, label) => {
    if (entry.code === 'aheadOfMain') {
      lines.push('');
      lines.push(`NOTE: ${entry.message}`);
      return;
    }
    lines.push('');
    lines.push(`${label}: ${entry.message}`);
    list(entry.missingFromBuild).slice(0, 40).forEach((line) => lines.push(`    missing  ${line}`));
    if (list(entry.missingFromBuild).length > 40) lines.push(`    … and ${entry.missingFromBuild.length - 40} more`);
    list(entry.dirtyFiles).slice(0, 20).forEach((file) => lines.push(`    modified ${file}`));
    if (!entry.overridden) lines.push(`    Only for a deliberate hotfix, override with: ${entry.override}=1`);
  };
  decision.problems.forEach((entry) => describe(entry, 'REFUSED'));
  decision.warnings.forEach((entry) => describe(entry, 'OVERRIDDEN'));
  lines.push('');
  const onlyCi = decision.problems.length > 0 && decision.problems.every((entry) => entry.code.startsWith('ci'));
  lines.push(decision.ok
    ? `Provenance OK — this build contains every commit on origin/main${decision.ci === 'passed' ? ' and passed CI' : ''}.`
    : onlyCi
      ? 'Deploy refused: this commit has not passed CI. Wait for its CI gate, or fix main.'
      : 'Deploy refused. Run: git checkout main && git pull --ff-only origin main');
  return lines.join('\n');
};

/**
 * Compare the live manifest with origin/main for `npm run verify:deployed-build`.
 */
export const evaluateLiveBuild = ({ liveSha, originMainSha, liveKnownLocally, liveContainsMain, missingFromLive = [] } = {}) => {
  const live = clean(liveSha);
  const main = clean(originMainSha);
  if (!live || live === 'unknown') {
    return { status: 'unknownLiveBuild', ok: false, message: 'The live site did not report a build commit (mathmaster-build.json missing or unreadable).' };
  }
  if (main && main.startsWith(live)) {
    return { status: 'current', ok: true, message: `Production serves current main (${live}).` };
  }
  if (!liveKnownLocally) {
    return {
      status: 'unknownCommit',
      ok: false,
      message: `Production serves ${live}, a commit that is not on any fetched branch — a local or unpushed build.`,
    };
  }
  if (liveContainsMain) {
    return { status: 'aheadOfMain', ok: true, message: `Production serves ${live}, which contains current main plus unmerged commits.` };
  }
  return {
    status: 'behindMain',
    ok: false,
    message: `Production serves ${live}, which is missing ${list(missingFromLive).length} commit(s) from main.`,
    missingFromLive: list(missingFromLive),
  };
};

export default evaluateDeployProvenance;
