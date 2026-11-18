/*
 * WHAT A QUESTION MEASURES IS WRITTEN AFTER EVERYTHING HAS BEEN MEASURED.
 *
 * As a question opens, the identity bar, the sticky task card, the navigator,
 * the action bar and the Work View button each measure themselves and write
 * what they find onto the page: a CSS variable, an attribute. One after
 * another, each measurement after another's write made the browser lay the
 * page out again before its first frame: 9 forced layouts opening an
 * assignment, 4 to 10 on Next (the runtime driver's trace mode,
 * tests/browser/teacherWorkflow/studentRuntimePerformance.mjs).
 *
 * So each measures at once, where it always has, and hands its writes here.
 * They are made together in a microtask, once the work that measured has
 * finished: still before the browser runs anything for the next frame (an
 * animation frame, a ResizeObserver) and before it draws it, so the first
 * frame shows them as it did.
 *
 * Writes are keyed. A later write under a key replaces one not yet made (a
 * bar that leaves and comes back in one commit, as the next question's does,
 * writes once), and cancelLayoutWrite drops one.
 */
const pending = new Map();
let scheduled = false;

// Each write is made on its own: one that throws still reaches the page as an
// error, and the bars written after it are written.
export const flushLayoutWrites = () => {
  scheduled = false;
  const writes = [...pending.values()];
  pending.clear();
  writes.forEach((write) => {
    try {
      write();
    } catch (error) {
      queueMicrotask(() => { throw error; });
    }
  });
};

export const deferLayoutWrite = (key, write) => {
  pending.delete(key);
  pending.set(key, write);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(flushLayoutWrites);
};

export const cancelLayoutWrite = (key) => {
  pending.delete(key);
};

// A variable is set only when its value changes, and removed only when it is there.
export const writeStyleVariable = (style, name, value) => {
  if (value == null) {
    if (style.getPropertyValue(name)) style.removeProperty(name);
  } else if (style.getPropertyValue(name) !== value) {
    style.setProperty(name, value);
  }
};
