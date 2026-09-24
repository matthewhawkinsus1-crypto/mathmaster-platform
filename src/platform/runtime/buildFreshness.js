/*
 * IS THIS TAB RUNNING THE BUILD THE SITE IS SERVING?
 *
 * A deploy reaches a browser only when the page reloads. A Chromebook left on
 * an assignment all day keeps yesterday's bundle, so a teacher reports that a
 * shipped fix "disappeared" when the tab simply never received it. Worse, once
 * Hosting replaces the hashed asset files, that old tab can no longer load the
 * lazy chunks of the tools it has not opened yet.
 *
 * And a copy of MathMaster served from somewhere other than Firebase Hosting
 * (the retired Vercel project) never receives a Firebase deploy at all.
 *
 * This module is the pure comparison; `useBuildFreshness` polls and
 * `BuildFreshnessNotice` tells the person. Nothing here reloads the page on its
 * own — a reload can interrupt a student mid-step, so the choice stays theirs.
 */

const clean = (value) => String(value ?? '').trim();

// Hosts known to serve a copy that Firebase deploys never update.
export const RETIRED_HOST_PATTERNS = Object.freeze([/\.vercel\.app$/i]);
export const CANONICAL_ORIGIN = 'https://mathmaster-aleks.web.app';

export const BUILD_FRESHNESS_STATUS = Object.freeze({
  CURRENT: 'current',
  NEWER_BUILD_AVAILABLE: 'newerBuildAvailable',
  RETIRED_HOST: 'retiredHost',
  UNKNOWN: 'unknown',
});

const knownSha = (value) => {
  const sha = clean(value);
  return sha && sha !== 'unknown' ? sha : '';
};

const sameCommit = (a, b) => {
  const left = knownSha(a);
  const right = knownSha(b);
  if (!left || !right) return null;
  const length = Math.min(left.length, right.length);
  return left.slice(0, length) === right.slice(0, length);
};

/**
 * @param {object} input
 * @param {object} input.running  window.__MATHMASTER_BUILD__ ({ gitSha, builtAt })
 * @param {object|null} input.live the served mathmaster-build.json, or null
 * @param {string} input.hostname  location.hostname
 */
export const compareRunningBuild = ({ running = {}, live = null, hostname = '' } = {}) => {
  const host = clean(hostname).toLowerCase();
  if (host && RETIRED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return {
      status: BUILD_FRESHNESS_STATUS.RETIRED_HOST,
      message: `This copy of MathMaster (${host}) no longer receives updates. Open ${CANONICAL_ORIGIN.replace('https://', '')} instead.`,
      canonicalOrigin: CANONICAL_ORIGIN,
    };
  }
  // A dev or harness build has no sha. Say nothing rather than guess.
  if (!knownSha(running?.gitSha) || !live) {
    return { status: BUILD_FRESHNESS_STATUS.UNKNOWN, message: '' };
  }
  const same = sameCommit(running.gitSha, live.gitSha);
  if (same === false) {
    return {
      status: BUILD_FRESHNESS_STATUS.NEWER_BUILD_AVAILABLE,
      message: 'MathMaster has been updated. Reload when you reach a stopping point to get the newest version.',
      runningSha: knownSha(running.gitSha).slice(0, 7),
      liveSha: knownSha(live.gitSha).slice(0, 7),
    };
  }
  return { status: same ? BUILD_FRESHNESS_STATUS.CURRENT : BUILD_FRESHNESS_STATUS.UNKNOWN, message: '' };
};

export default compareRunningBuild;
