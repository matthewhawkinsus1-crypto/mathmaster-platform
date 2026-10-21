/*
 * LOADING THE STUDENT'S RECOVERY KIT (./studentRecoveryKit.js).
 *
 * The teacher kit's loader, for a student: one request per page, shared by
 * every caller (StrictMode's second effect run, a student signing in again
 * over the same page), and once it has arrived `loadedStudentRecoveryKit()`
 * hands it out with no wait at all. A failed load is forgotten so a later
 * render may ask again; until it arrives no surface offers a Recovery, and
 * the server still decides every Practice answer and every start.
 */
let loaded = null;
let pending = null;

export const loadedStudentRecoveryKit = () => loaded;

export const loadStudentRecoveryKit = () => {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import('./studentRecoveryKit.js').then(
      (kit) => { loaded = kit; return kit; },
      (error) => { pending = null; throw error; },
    );
  }
  return pending;
};
