/*
 * LOADING THE TEACHER KIT (./teacherKit.js).
 *
 * One request per page, shared by every caller: StrictMode's second effect
 * run, or a teacher signing in again over the same page, gets the same
 * promise, and once it has arrived `loadedTeacherKit()` hands it out with no
 * wait at all. A failed load is forgotten so the next attempt asks again; the
 * caller reports it (App.jsx sends it to AppErrorBoundary, as a failed
 * TeacherWorkspace chunk is).
 */
let loaded = null;
let pending = null;

export const loadedTeacherKit = () => loaded;

export const loadTeacherKit = () => {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import('./teacherKit.js').then(
      (kit) => { loaded = kit; return kit; },
      (error) => { pending = null; throw error; },
    );
  }
  return pending;
};

// The teacher's screen is the next chunk a teacher needs: fetch it alongside
// the kit, not after it. A failure here is left to the screen's own lazy load,
// which retries it and reports it.
export const prefetchTeacherWorkspace = () => {
  import('./TeacherWorkspace.jsx').catch(() => { /* retried by the real load */ });
};
