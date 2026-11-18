/*
 * A STAGED STEP'S ROOM IN WORK VIEW, MEASURED.
 *
 * In Work View a staged question (WorkflowRunner's focus mode) keeps the step's
 * instruction and heading above the step and its Previous/Next footer below it,
 * and the step between them is the one thing that scrolls (WorkViewShell.css).
 * The step's plane was capped at the view's height less 280px, an estimate of
 * that chrome made before the first-hint offer took a row under the footer, and
 * a plane a step marks or reads was capped at 88% of the screen:
 *
 *   1366x768   the step showed 430px: the plotting step's plane was 488px, and a
 *              "decide" step's 676px, with its Yes and No 750px down
 *   1920x1080  the plotting step's plane 765px in a 742px step
 *   320x568, and every phone at 200% text: the chrome took the whole height,
 *              and the step had none at all
 *
 * Measured instead, as the step is laid out (useStepRoom.js):
 *
 *   room    the step's own height. Where the chrome would leave it less than
 *           STEP_MIN_ROOM, the view scrolls as one instead ("flow"): the step
 *           takes its content's height, Previous/Next follow it, and the
 *           step's room is the view's height.
 *   plane   as tall as lets the step's whole content (what the step stacks
 *           above and below it: its controls, its Yes and No, its inputs) fit
 *           the room, so the step does not scroll inside itself. Where that
 *           would take the plane under PLANE_MIN, or where a column beside it
 *           is taller than the step (the plotting step's point cards), the
 *           step scrolls regardless and the plane is as tall as the room less
 *           its own frame, so it is whole when the step shows it.
 *
 * NOTHING HERE MAY DEPEND ON THE PLANE'S OWN HEIGHT. The cap sets that height,
 * and the page is read again once it has: a decision that turns on it is
 * undone by its own result. Asked "is a column beside the plane lower than
 * the plane's?", the plotting step at 1920x1080 answered yes with a 374px
 * plane (whole: 731px) and no with a 731px one (fit: 374px), and its plane
 * changed size nine times a second. Whether the step fits, and how tall the
 * plane is when it does, are worked out from what the plane does not set:
 * the content beside and around it (planeColumn's slack).
 *
 * Pure geometry, so node can test it; the DOM is read by readStepRoom below.
 */

// The least height a step can be worked in: the plane's floor before this.
export const STEP_MIN_ROOM = 200;
// No plane smaller than this to make room for what is under it.
export const PLANE_MIN = 160;
// Back to a bounded step only with this much to spare, so a view on the edge
// does not switch at every frame.
export const FLOW_HYSTERESIS = 24;

/** Whether the view scrolls as one: the bounded step would have too little height. */
export const stepFlows = ({ boundedRoom, flowing = false }) => (
  flowing ? boundedRoom < STEP_MIN_ROOM + FLOW_HYSTERESIS : boundedRoom < STEP_MIN_ROOM
);

/**
 * The tallest the step's plane may be, in CSS pixels, or null where the step
 * draws no plane.
 *   room     the step's height (bounded) or the view's (flow)
 *   content  the step's content height with the plane as it is now
 *   plane    the plane's height now
 *   frame    what must be on screen with it: its box above it, and the row of
 *            its own controls under it (planeColumn)
 *   slack    how much lower the plane's column reaches than the lowest column
 *            beside it (planeColumn): negative where one beside reaches lower,
 *            Infinity where nothing is beside it
 *
 * The same for any height the plane has now: with the plane `d` shorter, the
 * content is `d` less while its column is the lower (to `slack`), and the same
 * once a column beside is. So the step fits exactly when the content the plane
 * does not set fits, `overflow <= max(0, slack)`, and then the plane fits it at
 * `plane - overflow + max(0, -slack)`, which is `room` less everything but the
 * plane, whatever `plane` was.
 */
export const stepPlaneCap = ({ room, content, plane, frame = 0, slack = Number.POSITIVE_INFINITY }) => {
  if (![room, content, plane].every(Number.isFinite) || !(plane > 0) || Number.isNaN(slack)) return null;
  const whole = Math.max(PLANE_MIN, Math.floor(room - Math.max(0, frame)));
  const overflow = content - room;
  // A column beside the plane is the step's height, or will be once the plane
  // has given its own column's lead: the plane cannot make the step fit.
  if (overflow > Math.max(0, slack)) return whole;
  // The plane fills what the rest of the step leaves: grows into room to spare,
  // or gives the step what it needs. Under its floor the step scrolls anyway,
  // and the plane is whole in it.
  const fitted = Math.floor(plane - overflow + Math.max(0, -slack));
  return fitted >= PLANE_MIN ? fitted : whole;
};

const PLANES = '.mathmaster-function-workspace-graph svg, svg.mathmaster-responsive-canvas';

const shown = (box) => box.width > 0 && box.height > 0;

/**
 * How the plane sits in its step, from the plane up to `stop`:
 *   slack  how much lower the plane's column reaches than the lowest box
 *          beside it, at the level where that is least (negative where one
 *          beside reaches lower: the plotting step's point cards beside its
 *          plane, on a wide screen); Infinity where nothing is beside it
 *   frame  what has to be on screen with it: its own box's room above it,
 *          and the row of its own controls directly under it (+, -, Reset
 *          view). Not a caption or a note further down its box.
 */
export const planeColumn = (plane, stop) => {
  const p = plane.getBoundingClientRect();
  let box = null;
  let slack = Number.POSITIVE_INFINITY;
  for (let child = plane, parent = plane.parentElement; parent && parent !== stop; child = parent, parent = parent.parentElement) {
    const c = child.getBoundingClientRect();
    for (const sibling of parent.children) {
      if (sibling === child) continue;
      const s = sibling.getBoundingClientRect();
      if (!shown(s)) continue;
      const beside = s.right <= c.left + 1 || s.left >= c.right - 1;
      const level = s.top < c.bottom - 1 && s.bottom > c.top + 1;
      if (beside && level) slack = Math.min(slack, c.bottom - s.bottom);
    }
    if (!box && parent.getBoundingClientRect().height > p.height + 1) box = parent;
  }
  if (!box) return { slack, frame: 0 };
  const b = box.getBoundingClientRect();
  // Its controls: the first row after the plane in its box that has a button,
  // where it starts right under the plane.
  const controls = [...box.querySelectorAll('button')]
    .map((button) => button.getBoundingClientRect())
    .filter((r) => shown(r) && r.top >= p.bottom - 1 && r.top <= p.bottom + 32)
    .reduce((bottom, r) => Math.max(bottom, r.bottom), p.bottom);
  return { slack, frame: Math.max(0, p.top - b.top) + Math.max(0, controls - p.bottom) };
};

export const IDLE_STEP_ROOM = Object.freeze({ flow: false, planeMax: null });

/**
 * What the step in an open Work View has, read from the page: whether the view
 * scrolls as one, and the plane's cap (null for none). `flowing` is the mode
 * the page is laid out in now.
 */
export const readStepRoom = (root, flowing = false) => {
  const surface = root?.closest?.('.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-surface');
  const body = root?.querySelector?.('.workflow-focus__workspace-body');
  if (!surface || !body) return IDLE_STEP_ROOM;
  // The step's height in a bounded layout, whichever layout is on screen: the
  // view less everything in it but the step (the step's own height is all of
  // its content in flow, and its box in a bounded step).
  const boundedRoom = surface.clientHeight - (surface.scrollHeight - body.offsetHeight);
  const flow = stepFlows({ boundedRoom, flowing });
  // Laid out the other way: read again once it is.
  if (flow !== flowing) return { flow, planeMax: null };
  const stage = body.querySelector('.workflow-focus__active-stage');
  const planes = [...(stage?.querySelectorAll(PLANES) || [])]
    .map((svg) => ({ svg, box: svg.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 80 && box.height > 80)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  if (!planes.length) return { flow, planeMax: null };
  const { svg, box } = planes[0];
  const { slack, frame } = planeColumn(svg, stage);
  const room = flow ? surface.clientHeight : body.clientHeight;
  const content = flow ? stage.offsetHeight : body.scrollHeight;
  const planeMax = stepPlaneCap({ room, content, plane: box.height, frame, slack });
  return { flow, planeMax };
};
