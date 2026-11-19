// How a teacher-harness journey waits before a check (journeys.mjs,
// supportEvidenceJourneys.mjs, caseReviewJourneys.mjs, appUrlJourneys.mjs's U10).
//
// The checks used to follow fixed pauses (0.1–7 s); on a loaded machine the
// screen was not there yet when the pause ended, and a correct app failed.
// Before a check a driver now waits for what that check reads (its text, the
// value it compares once the screen has chosen it, the count once a list has
// filled in), and the check then reads it again itself: an app that never gets
// there still fails, with the check's own message, about `timeout` ms later.
//
// What must NOT happen (a second record, a print asked for twice, a drawer that
// closes too) cannot be waited for. The driver waits for the screen's answer
// first, then gives the thing that must not come the time the old pause gave
// it, as `settle(() => itCame, OLD_PAUSE_MS)`: it returns as soon as it comes,
// so the check is no weaker than before and fails no later.

export const SETTLE_MS = 10_000;

/**
 * Waits until `ready()` holds, for at most `timeout` ms, and returns either
 * way (true if it held): it never throws. A `ready` that throws or rejects
 * counts as not yet, and one that hangs is cut off at the deadline.
 */
export const settle = async (ready, timeout = SETTLE_MS) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    let timer;
    const outOfTime = new Promise((resolve) => { timer = setTimeout(resolve, Math.max(0, deadline - Date.now()), false); });
    const held = await Promise.race([Promise.resolve().then(ready).then(Boolean, () => false), outOfTime]);
    clearTimeout(timer);
    if (held) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
};

export default settle;
