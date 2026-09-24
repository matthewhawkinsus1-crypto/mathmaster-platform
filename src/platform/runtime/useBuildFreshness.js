import { useEffect, useState } from 'react';
import { BUILD_FRESHNESS_STATUS, compareRunningBuild } from './buildFreshness.js';
import { getMathMasterBuildInfo } from './buildInfo.js';

// Often enough that a tab open all class period learns about a lunchtime
// deploy; rare enough to be free (one small uncached JSON file, same origin).
export const BUILD_FRESHNESS_INTERVAL_MS = 15 * 60 * 1000;

const readLiveManifest = async () => {
  try {
    const response = await fetch(`/mathmaster-build.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Watches for a newer deployed build (or a retired host) and reports it.
 * Checks on mount, whenever the tab becomes visible again, every 15 minutes,
 * and immediately when Vite fails to load a lazy chunk — the moment an old tab
 * first finds out Hosting has moved on.
 */
export default function useBuildFreshness() {
  const [freshness, setFreshness] = useState({ status: BUILD_FRESHNESS_STATUS.UNKNOWN, message: '' });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const running = window.__MATHMASTER_BUILD__ || getMathMasterBuildInfo();
    const hostname = window.location?.hostname || '';
    let cancelled = false;

    const check = async () => {
      const immediate = compareRunningBuild({ running, live: null, hostname });
      if (immediate.status === BUILD_FRESHNESS_STATUS.RETIRED_HOST) {
        if (!cancelled) setFreshness(immediate);
        return;
      }
      // A build with no sha (dev server, test harness) has nothing to compare.
      if (!running?.gitSha || running.gitSha === 'unknown') return;
      const live = await readLiveManifest();
      if (cancelled) return;
      const next = compareRunningBuild({ running, live, hostname });
      if (next.status !== BUILD_FRESHNESS_STATUS.UNKNOWN) setFreshness(next);
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const onPreloadError = () => { check(); };

    check();
    const timer = window.setInterval(check, BUILD_FRESHNESS_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('vite:preloadError', onPreloadError);
    };
  }, []);

  return freshness;
}
