/*
 * CODE A TEACHER'S SCREEN DRAWS ONLY ONCE SOMETHING OPENS IT (the teacher's
 * first load, second pass).
 *
 * Home drew the prompts of Ask my teacher's questions through MathText,
 * folded away twice, and the live monitor drew the Spotlight's projector view
 * with it: their code, MathLive among it, was downloaded, parsed and run
 * before Home's heading, for what a teacher sees only once they open
 * something (./teacherPanels.js names each). Two shapes:
 *
 *   onDemandCode(load)   one request per page, shared by every caller (the
 *                        idle prefetch and whatever needs the code first).
 *                        Once here, `loaded()` hands it out with no wait. A
 *                        failed request is kept: a browser keeps a failed
 *                        module URL for the life of the page, so asking again
 *                        would fail the same way. What needs the code hands
 *                        the failure to AppErrorBoundary ("MathMaster was just
 *                        updated"), as a teacher screen's chunk does.
 *   drawnPanel(load)     code drawn only while something holds it on screen
 *                        (the Spotlight's projector view): mounted when drawn,
 *                        as app/lazyScreens.js's teacherPanel.
 *
 * A panel whose code is here is drawn at once, in the same render (after the
 * prefetch nothing waits a frame). Before that it is React.lazy inside a
 * Suspense of its own with nothing as its fallback, as every teacher panel:
 * one on its way never suspends up to AppShell's boundary, which would hide
 * the whole workspace, and one that cannot load reaches AppErrorBoundary. It
 * has `prefetch()`, for the workspace's idle prefetch.
 *
 *   useOnDemandCode(code, wanted)
 *                        for a screen that holds what it draws until the code
 *                        is here (Ask my teacher's questions, whose prompts
 *                        MathText draws): `module` once it is here, else null.
 *                        Asked for while `wanted`, but not while the device is
 *                        offline: nothing the teacher did asked for it, and the
 *                        browser would remember the failure for the life of the
 *                        page. It asks once the device is back online. A failed
 *                        request is handed back as `failure`, for the screen to
 *                        throw (to AppErrorBoundary) where it needs the code,
 *                        and only there.
 *
 * Plain JS (createElement, no JSX), so node tests drive it.
 */
import { Suspense, createElement, lazy, useEffect, useState } from 'react';

export const onDemandCode = (load) => {
  let loaded = null;
  let pending = null;
  const code = {
    loaded: () => loaded,
    load: () => {
      if (loaded) return Promise.resolve(loaded);
      if (!pending) pending = load().then((module) => { loaded = module; return module; });
      return pending;
    },
    prefetch: () => { code.load().catch(() => { /* reported by what needs it */ }); },
  };
  return code;
};

// One mount of a panel. What it draws is chosen once, as it mounts, above its
// Suspense boundary (as the student screens' visit, app/lazyScreens.js): the
// panel itself when its code is here, else a lazy of its own, which keeps a
// rejected import and throws it on to AppErrorBoundary.
const drawWhenHere = (code) => function OnDemandPanel(props) {
  const [Panel] = useState(() => code.loaded()?.default || lazy(code.load));
  return createElement(Suspense, { fallback: null }, createElement(Panel, props));
};

export const drawnPanel = (load) => {
  const code = onDemandCode(load);
  const DrawnPanel = drawWhenHere(code);
  DrawnPanel.prefetch = code.prefetch;
  return DrawnPanel;
};

const browserWindow = () => (typeof window !== 'undefined' ? window : null);

export const useOnDemandCode = (code, wanted, win = browserWindow()) => {
  const [arrived, setArrived] = useState(code.loaded);
  const [failure, setFailure] = useState(null);
  // Here already (the prefetch, or another screen asked): drawn in this render.
  const ready = arrived || code.loaded();
  useEffect(() => {
    if (ready || !wanted) return undefined;
    let live = true;
    const ask = () => {
      code.load().then(
        (module) => { if (live) setArrived(module); },
        (error) => { if (live) setFailure(error); },
      );
    };
    if (win?.navigator?.onLine === false) {
      win.addEventListener('online', ask, { once: true });
      return () => { live = false; win.removeEventListener('online', ask); };
    }
    ask();
    return () => { live = false; };
  }, [code, ready, wanted, win]);
  return { module: ready, failure: ready ? null : failure };
};
