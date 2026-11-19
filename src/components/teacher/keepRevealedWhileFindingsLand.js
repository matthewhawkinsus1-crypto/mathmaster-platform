/*
 * KEEP A NOTICE IN VIEW WHILE PRE-FLIGHT'S FINDINGS LAND.
 *
 * The Question Editor explains a refused Include on the card where it was
 * pressed, and scrolls the explanation into view. Pre-Flight's findings can
 * land after the press: each card above then grows (78px a card on a phone),
 * and a teacher who pressed in the editor's first second or two saw the
 * explanation pushed 480px back under the dialog's footer.
 *
 * So the notice is revealed at once, with the teacher's motion preference, and
 * again, instantly, two frames after new findings are published (once the
 * regions they re-draw have been laid out). It stops as soon as the teacher
 * scrolls, taps, clicks or types anywhere in the editor's scroll area: from
 * then on where the view is, is theirs. `scrollIntoView` with `nearest` leaves
 * a notice that is already in full view where it is.
 *
 * Returns the cleanup, for the effect that called it.
 */

export const TEACHER_MOVE_EVENTS = Object.freeze(['wheel', 'touchmove', 'pointerdown', 'keydown']);

const requestFrame = (run) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16));
const cancelRequestedFrame = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

export const keepRevealedWhileFindingsLand = ({
  target,
  area = null,
  store = null,
  motion = 'auto',
  nextFrame = requestFrame,
  cancelFrame = cancelRequestedFrame,
} = {}) => {
  const reveal = (behavior) => target?.()?.scrollIntoView?.({ block: 'nearest', behavior });
  reveal(motion);
  let teacherMoved = false;
  let frame = null;
  const moved = () => { teacherMoved = true; };
  TEACHER_MOVE_EVENTS.forEach((type) => area?.addEventListener?.(type, moved, { passive: true }));
  const unsubscribe = store?.subscribe?.(() => {
    if (teacherMoved) return;
    if (frame !== null) cancelFrame(frame);
    frame = nextFrame(() => {
      frame = nextFrame(() => {
        frame = null;
        if (!teacherMoved) reveal('auto');
      });
    });
  }) || (() => {});
  return () => {
    unsubscribe();
    if (frame !== null) cancelFrame(frame);
    frame = null;
    TEACHER_MOVE_EVENTS.forEach((type) => area?.removeEventListener?.(type, moved));
  };
};
