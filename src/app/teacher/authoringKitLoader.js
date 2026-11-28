/*
 * LOADING THE AUTHORING CODE (./teacherAuthoringKit.js).
 *
 * About 1 MB gzip that no teacher screen draws with: Pre-Flight's model, the
 * compiler and its checks, live corrections, Library reuse, Honors CCMR and
 * Recovery planning, which an action runs. The workspace (TeacherWorkspace.jsx)
 * asks for it three ways, and all three share one request per page:
 *
 *   - once the workspace has drawn, `prefetchAuthoringKit()` asks the next time
 *     the browser is idle, so an action finds the code here and runs at once.
 *     Once per page, never when the device asks to save data, and not while it
 *     is offline (the student screens' idle prefetch,
 *     app/student/studentScreenPrefetch.js);
 *   - an action that comes first asks at once, and waits for it;
 *   - so does a screen that reads it as it draws (the Assignments list): the
 *     screen the teacher reopens on loads it first, not after the prefetch.
 *
 * Once it has arrived, `loadedAuthoringKit()` hands it out with no wait. A
 * failed request is kept: a browser keeps a failed module URL for the life of
 * the page, so asking again would fail the same way. The workspace hands the
 * failure to AppErrorBoundary, whose "Load the new version" loads a new page,
 * as for a teacher screen's chunk that cannot load. A failed idle prefetch is
 * left to the action or screen that needs the code to report.
 *
 * The workspace's assignment actions (./workspaceAssignmentActions.js), which
 * run this code, load the same way: their own small chunk, prefetched first,
 * so the workspace does not carry them before Home draws.
 *
 * Plain JS, no React, so node tests drive it.
 */
import { createIdlePrefetch } from '../student/studentScreenPrefetch.js';

let loaded = null;
let pending = null;

export const loadedAuthoringKit = () => loaded;

export const loadAuthoringKit = () => {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) pending = import('./teacherAuthoringKit.js').then((kit) => { loaded = kit; return kit; });
  return pending;
};

let actionsLoaded = null;
let actionsPending = null;

export const loadedAssignmentActions = () => actionsLoaded;

export const loadAssignmentActions = () => {
  if (actionsLoaded) return Promise.resolve(actionsLoaded);
  if (!actionsPending) actionsPending = import('./workspaceAssignmentActions.js').then((actions) => { actionsLoaded = actions; return actions; });
  return actionsPending;
};

const prefetchOnce = createIdlePrefetch();
const actionsCode = {
  prefetch: () => { loadAssignmentActions().catch(() => { /* reported by the action that needs it */ }); },
};
const authoringCode = {
  prefetch: () => { loadAuthoringKit().catch(() => { /* reported by what needs it */ }); },
};

/** Ask for the code when the browser is next idle; returns a cancel for the effect that asked. */
export const prefetchAuthoringKit = (win) => prefetchOnce([actionsCode, authoringCode], win);
