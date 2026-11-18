/*
 * CODE A TEACHER'S SCREEN DRAWS ONLY ONCE SOMETHING OPENS IT (the teacher's
 * first load, second pass).
 *
 * The workspace drew five panels closed on every screen, and Home drew the
 * prompts of Ask my teacher's questions through MathText, folded away twice:
 * their code, MathLive among it, was downloaded, parsed and run before Home's
 * heading, for what a teacher sees only once they open something
 * (./teacherPanels.js names each). Three shapes:
 *
 *   onDemandCode(load)   one request per page, shared by every caller (the
 *                        idle prefetch and whatever needs the code first).
 *                        Once here, `loaded()` hands it out with no wait. A
 *                        failed request is kept: a browser keeps a failed
 *                        module URL for the life of the page, so asking again
 *                        would fail the same way. What needs the code hands
 *                        the failure to AppErrorBoundary ("MathMaster was just
 *                        updated"), as a teacher screen's chunk does.
 *   closedPanel(load, isOpen, offlineNote)
 *                        a panel drawn closed: nothing at all, and nothing
 *                        asked for, until `isOpen(props)` is first true; then
 *                        the panel itself, kept mounted from then on, so it
 *                        closes and opens again exactly as when it was mounted
 *                        closed from the start (its state, and its effects as
 *                        it opens: focus on Close, a fresh query, a fresh read).
 *   drawnPanel(load, offlineNote)
 *                        code drawn only while something holds it on screen
 *                        (the Spotlight's projector view, Submission recovery's
 *                        panel): mounted when drawn, as app/lazyScreens.js's
 *                        teacherPanel.
 *
 * A panel whose code is here is drawn at once, in the same render (after the
 * prefetch nothing waits a frame). Before that it is React.lazy inside a
 * Suspense of its own with nothing as its fallback, as every teacher panel:
 * one on its way never suspends up to AppShell's boundary, which would hide
 * the whole workspace, and one that cannot load reaches AppErrorBoundary.
 * Opened while the device is offline before anything asked for its code, it
 * asks for nothing (the request would fail, and the browser would keep the
 * failure for the life of the page): `offlineNote` says it opens once the
 * device is back online, and it asks then. Before these panels loaded on
 * demand they opened from memory offline; a request that failed there showed
 * "MathMaster was just updated", whose button reloaded into the browser's own
 * error page. Code asked for already (the idle prefetch cut off as the Wi-Fi
 * dropped) promises nothing: only a new page can bring code whose request
 * failed, so the panel goes through its lazy as online, and the failure
 * reaches AppErrorBoundary, which offline says to check the connection and
 * loads the page again only once the device is back online. Each has
 * `prefetch()`, for the workspace's idle prefetch.
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
 *   whenOnline(win, run)
 *                        `run` now, or, while `win` says the device is
 *                        offline, once it is back online; returns a cancel.
 *
 * Plain JS (createElement, no JSX), so node tests drive it.
 */
import { Suspense, createElement, lazy, useEffect, useState } from 'react';

const browserWindow = () => (typeof window !== 'undefined' ? window : null);
const offline = (win) => win?.navigator?.onLine === false;

export const whenOnline = (win, run) => {
  if (!offline(win)) {
    run();
    return () => {};
  }
  win.addEventListener('online', run, { once: true });
  return () => win.removeEventListener('online', run);
};

export const onDemandCode = (load) => {
  let loaded = null;
  let pending = null;
  const code = {
    loaded: () => loaded,
    // Here, on its way, or failed (and failed for the life of the page).
    asked: () => Boolean(pending),
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
// rejected import and throws it on to AppErrorBoundary. Offline with its code
// never asked for, neither yet: its note, until the device is back online.
const choose = (code) => code.loaded()?.default || lazy(code.load);
const drawWhenHere = (code, offlineNote) => function OnDemandPanel(props) {
  const win = browserWindow();
  const [Panel, setPanel] = useState(() => (code.asked() || !offline(win) ? choose(code) : null));
  useEffect(() => {
    if (Panel) return undefined;
    return whenOnline(win, () => setPanel(() => choose(code)));
  }, [Panel, win]);
  if (!Panel) return offlineNote(props);
  return createElement(Suspense, { fallback: null }, createElement(Panel, props));
};

// What a panel opened offline shows in its place: a closed panel floats over
// the page, as the panel itself would; a drawn panel stands in its own place.
const NOTE = { margin: 0, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 700 };
const FLOATING_NOTE = { ...NOTE, position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 11000, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', boxShadow: '0 8px 24px rgba(0, 0, 0, .18)' };
const note = (text, style) => createElement('p', { role: 'status', 'data-panel-offline': '', style }, text);

export const closedPanel = (load, isOpen, offlineNote) => {
  const code = onDemandCode(load);
  // Only while it is open: closed again while it waits, it says nothing.
  const Draw = drawWhenHere(code, (props) => (isOpen(props) ? note(offlineNote, FLOATING_NOTE) : null));
  function ClosedPanel(props) {
    const open = Boolean(isOpen(props));
    const [opened, setOpened] = useState(open);
    // The render that first finds it open: React draws again at once, opened.
    if (open && !opened) setOpened(true);
    return opened || open ? createElement(Draw, props) : null;
  }
  ClosedPanel.prefetch = code.prefetch;
  return ClosedPanel;
};

export const drawnPanel = (load, offlineNote) => {
  const code = onDemandCode(load);
  const DrawnPanel = drawWhenHere(code, () => note(offlineNote, NOTE));
  DrawnPanel.prefetch = code.prefetch;
  return DrawnPanel;
};

export const useOnDemandCode = (code, wanted, win = browserWindow()) => {
  const [arrived, setArrived] = useState(code.loaded);
  const [failure, setFailure] = useState(null);
  // Here already (the prefetch, or another screen asked): drawn in this render.
  const ready = arrived || code.loaded();
  useEffect(() => {
    if (ready || !wanted) return undefined;
    let live = true;
    const cancel = whenOnline(win, () => {
      code.load().then(
        (module) => { if (live) setArrived(module); },
        (error) => { if (live) setFailure(error); },
      );
    });
    return () => { live = false; cancel(); };
  }, [code, ready, wanted, win]);
  return { module: ready, failure: ready ? null : failure };
};
