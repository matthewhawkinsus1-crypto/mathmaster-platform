/*
 * DOES THE "OPEN WORK VIEW" BUTTON HAVE A ROW TO SHARE, OR DOES IT TAKE ONE (PH01).
 *
 * The button floats over the top-right corner of the work, and the first row of
 * the work (a heading, a tool's title) keeps clear of its width. That holds
 * while the row has room for both. It stops holding when the text grows: the
 * button is 160px wide at 100% text and 257px at 200%, on a 322px-wide work
 * area, and nothing readable fits in the 49px that is left.
 *
 * "Room" is measured in ems of the button's own text, so it grows with the text
 * the way the rows beside the button do: seven ems is about 90px at 100% and
 * 180px at 200%, enough for a short heading or the start of a title.
 *
 *   surfaceWidth   the width of the work area the button floats over
 *   openerWidth    the button's own width, without the gap kept beside it
 *   fontSize       the button's font size in px
 */
export const OPENER_MIN_ROOM_EM = 7;
// What the rows beside the button keep between them and it.
export const OPENER_GAP = 16;

export const openerSharesRow = ({ surfaceWidth, openerWidth, fontSize }) => {
  const room = Number(surfaceWidth) - (Number(openerWidth) + OPENER_GAP);
  const em = Number(fontSize) > 0 ? Number(fontSize) : 13;
  // A work area that has no width yet (not laid out) is not a reason to move the button.
  if (!(Number(surfaceWidth) > 0)) return true;
  return room >= OPENER_MIN_ROOM_EM * em;
};

/*
 * THE BUTTON'S ROOM IS PUBLISHED AFTER THE OBSERVER HAS DELIVERED, NEVER
 * INSIDE ITS CALLBACK (P-5).
 *
 * EnlargeableFigure measures the button and the work area it floats over and
 * writes what it finds on that work area (`data-opener-stacked`, and the space
 * and height the rows beside the button keep clear). Those writes resize the
 * work area: a stacked button joins the flow and adds a row, and the published
 * space re-wraps the rows beside it. Written from inside the ResizeObserver
 * that watches the work area, that resize could not be delivered in the same
 * pass, and the browser reported "ResizeObserver loop completed with
 * undelivered notifications" as a page error: on Algebra I M3 T1 L1 DOL 2 and
 * its Honors twin (the relation workspace on an exit ticket), on a phone at
 * 200% text, whenever the phone was turned or the text size changed, the
 * moments the button moves between the corner and a row of its own.
 *
 * So the first measurement is made at once, before the first paint, and an
 * observed change is published in the next animation frame, once however many
 * changes arrive before it. The callback cannot re-enter itself, and the
 * resize its writes cause is observed in the next pass like any other change.
 *
 *   opener, surface   the button and the work area it floats over
 *   publish           measures both and writes the result
 * Returns the function that stops observing (and drops a pending frame).
 */
export const observeOpenerRoom = ({
  opener,
  surface,
  publish,
  ResizeObserverClass = typeof ResizeObserver === 'function' ? ResizeObserver : null,
  requestFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (callback) => setTimeout(callback, 16),
  cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout,
} = {}) => {
  publish();
  if (typeof ResizeObserverClass !== 'function') return () => {};
  let frame = null;
  const observer = new ResizeObserverClass(() => {
    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      publish();
    });
  });
  observer.observe(opener);
  // The room beside the button changes with the screen as well as with the button.
  observer.observe(surface);
  return () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    observer.disconnect();
  };
};

export default openerSharesRow;
