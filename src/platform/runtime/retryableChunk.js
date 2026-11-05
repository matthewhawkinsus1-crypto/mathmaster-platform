/*
 * A SCREEN'S CODE THAT "TRY AGAIN" CAN REALLY ASK FOR AGAIN (PF01).
 *
 * The rest of chunkLoadRecovery.js's story, for a screen that loads on demand.
 * A student's Grades, Assignments, Rewards and result screens do
 * (app/lazyScreens.js), so their code can fail to arrive: the Chromebook went
 * offline before Home's idle prefetch had fetched it, or a deploy replaced the
 * chunk. Two things remember that failure, and a Try again that ignored either
 * would be a button that does nothing:
 *
 *   - React.lazy keeps a rejected import for good. Each attempt mounts a lazy
 *     of its own (lazyScreens.js), and this loader forgets a failed request.
 *   - The browser keeps a failed module URL for the life of the page
 *     (chunkLoadRecovery.js; in Chromium the same import() fails again without
 *     a request, even once the device is back online). So while the device
 *     says it is offline the loader does not ask at all: nothing is
 *     remembered, and Try again asks once the device is back online. Once a
 *     request has failed in this page, Try again loads the page again
 *     (reloadForCurrentBuild), which also brings a tab that outlived a deploy
 *     onto the new build.
 *
 * Its own module, not part of chunkLoadRecovery.js: that one loads before the
 * sign-in screen (AppErrorBoundary), and this is needed only once App is here.
 */
export const CHUNK_RETRY = Object.freeze({
  LOAD: 'load', // mount the screen again: its code is here, or nothing remembers a failure
  RELOAD: 'reload', // the browser remembers the failure: only a new page asks again
  OFFLINE: 'offline', // nothing would arrive: the device is offline
});

const deviceOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * `load` is the screen's `() => import(…)`. One request at a time, shared by
 * every caller (Home's prefetch and the screen itself); once the module has
 * arrived, `loaded()` hands it out with no wait, so a screen opened after the
 * prefetch draws at once.
 */
export const retryableChunk = (load, { online = deviceOnline } = {}) => {
  let loaded = null;
  let pending = null;
  let failedInPage = false;
  // The failures this loader handed out, so Try again knows whether the code
  // that did not load was the screen's own or something the screen loads.
  const ownFailures = new WeakSet();
  const own = (error) => {
    if (error && typeof error === 'object') ownFailures.add(error);
    return error;
  };
  return {
    loaded: () => loaded,
    load: () => {
      if (loaded) return Promise.resolve(loaded);
      if (pending) return pending;
      if (!online()) {
        // A chunk-load error (isChunkLoadError), which the screen's boundary shows.
        const offline = new Error('This device is offline, so the screen was not requested.');
        offline.mmChunkLoad = true;
        return Promise.reject(own(offline));
      }
      pending = load().then(
        (module) => { loaded = module; return module; },
        (error) => { pending = null; failedInPage = true; throw own(error); },
      );
      return pending;
    },
    /**
     * What Try again can do about `error`, the failure the screen's boundary
     * caught (CHUNK_RETRY). Never a reload offline: that trades MathMaster for
     * the browser's own error page.
     *
     *   - The screen's own code, refused offline: ask again. If Home's prefetch
     *     fetched it once the device was back, the screen draws at once.
     *   - The screen's own code, after a request for it failed: a new page.
     *   - Code the screen loads itself, with no boundary of its own: React and
     *     the browser both keep that failure, so only a new page helps. (The
     *     result page's Review My Work has its own since it failed this way
     *     offline: lazyScreens.js studentPanel.)
     */
    retry: (error) => {
      if (!online()) return CHUNK_RETRY.OFFLINE;
      if (!ownFailures.has(error)) return CHUNK_RETRY.RELOAD;
      return loaded || !failedInPage ? CHUNK_RETRY.LOAD : CHUNK_RETRY.RELOAD;
    },
  };
};
