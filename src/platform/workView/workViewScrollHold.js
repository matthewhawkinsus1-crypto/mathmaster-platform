/*
 * KEEP THE PAGE WHERE THE STUDENT LEFT IT WHILE WORK VIEW IS OPEN.
 *
 * Opening Work View pins the tool to the viewport, which takes it out of the
 * page flow. The document shrinks by the tool's height and the browser clamps
 * the window scroll to what is left — live QA at 1536×900 measured scrollY
 * 294 → 0. Closing (or a correct answer closing it for the student) then left
 * the student at the top of the assignment header with the feedback and the
 * Next Question button ~1600px below.
 *
 * `captureWorkViewScrollHold` runs before the tool leaves the flow: it records
 * the scroll position and the tool's height so a placeholder can keep the
 * document the same size. `restoreWorkViewScrollHold` puts the scroll back on
 * close, for anything that moved it while the page was locked.
 */
export function captureWorkViewScrollHold(host, win = globalThis.window) {
  if (!win) return null;
  const height = host?.getBoundingClientRect?.().height || 0;
  return {
    scrollX: Number(win.scrollX || win.pageXOffset || 0),
    scrollY: Number(win.scrollY || win.pageYOffset || 0),
    height: Math.max(0, Math.round(height)),
  };
}

export function restoreWorkViewScrollHold(hold, win = globalThis.window) {
  if (!hold || !win?.scrollTo) return false;
  const currentY = Number(win.scrollY || win.pageYOffset || 0);
  if (Math.abs(currentY - hold.scrollY) < 1) return false;
  win.scrollTo({ left: hold.scrollX, top: hold.scrollY, behavior: 'auto' });
  return true;
}
