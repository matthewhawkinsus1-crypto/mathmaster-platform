/*
 * WHERE A NEW POINT GOES ONCE THE CONSTRUCTION IS FULL.
 *
 * Plotting a third point used to start the line over: both earlier points
 * vanished. On a phone the usual cause was a missed drag — a press just
 * outside P2 meant to move it plotted a new point instead and silently wiped
 * the line (pass 3, TOOL-11). A new point now takes the place of the plotted
 * point nearest to it, so the line survives and the miss reads as a move.
 * "Start over" is the way to clear everything.
 *
 * KEPT AS BUILT (TL19, owner decision). No "which point should go?" dialog:
 * the replacement is said — the plane's live region reads "Plotted (3, 4).
 * It replaced (4, 0)." (plotAnnouncement.js) — and one platform Undo puts the
 * replaced point back (Graphing's universal Undo records every placement).
 * And no wider pick-up radius for a finger: a press is snapped to the grid
 * before the pick-up check, so a wider radius would change nothing; the snap
 * stays. Browser proof: tests/browser/planePhoneReach.mjs, phone and Chromebook.
 */
const distance = (a, b) => Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1]));

export const placePoint = (current = [], point, requiredCount = 2) => {
  const points = Array.isArray(current) ? current : [];
  if (points.length < requiredCount) return [...points, point];
  let nearest = 0;
  points.forEach((existing, index) => {
    // On a tie the later point is replaced: it is the one most recently placed.
    if (distance(existing, point) <= distance(points[nearest], point)) nearest = index;
  });
  return points.map((existing, index) => (index === nearest ? point : existing));
};
