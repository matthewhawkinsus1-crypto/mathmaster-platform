/*
 * WHERE THE HINT PANEL OPENS, AND WHAT THE PAGE MOVES TO WHEN IT GROWS (FB10).
 *
 * "Show a hint" under a miss used to open the panel at the TOP of the work
 * area and scroll the page up to it: the hint appeared far from the button the
 * student pressed, and a tool's own Check left the screen (Matrix Lab CW 2,
 * measured on the base: on a laptop the page jumped 941px up and Check moved
 * 1157px further down the page; on a phone Check moved 1496px). The panel is
 * one component with one state, so it can be drawn in either of two places,
 * one at a time:
 *
 *   'results'  directly under the miss that offered the hint (the outcome box,
 *              "Your last try", a tool's own result area), and
 *   'top'      the top of the work area, where the work bar's Hint control and
 *              the one-try notice open it (the work bar is at the bottom of
 *              the screen; the top is where a panel opened from it was always
 *              read).
 *
 * In 'results' the page then moves only as far as the hint just revealed
 * needs, not as far as the whole panel (its cost note and buttons) would. The
 * app's scroll padding and the phone's work area keep a scrolled-to element
 * clear of the sticky action bar, as for the outcome itself
 * (attemptResultsReveal.js).
 *
 * Plain DOM logic in a .js module so node tests can run it.
 */
export const HINT_PANEL_PLACES = Object.freeze({ TOP: 'top', RESULTS: 'results' });

/**
 * The place a caller asked for, or null. Only the two names count: several
 * handlers receive a click event as their first argument, and an event must
 * never move the panel (the panel's own "Show the next hint" is one).
 */
export const requestedHintPanelPlace = (value) => (
  value === HINT_PANEL_PLACES.TOP || value === HINT_PANEL_PLACES.RESULTS ? value : null
);

/**
 * What to bring into view: at the top, the whole panel, as it always was;
 * under a miss, the newest thing in it — the open worked example, else the
 * last hint read — and the panel itself when it holds neither.
 */
export const hintPanelRevealTarget = (panel, { place = HINT_PANEL_PLACES.TOP, similarOpen = false } = {}) => {
  if (!panel || typeof panel.querySelector !== 'function') return null;
  if (place !== HINT_PANEL_PLACES.RESULTS) return panel;
  const example = similarOpen ? panel.querySelector('[data-similar-example]') : null;
  if (example) return example;
  const hints = typeof panel.querySelectorAll === 'function' ? panel.querySelectorAll('li[data-hint-source]') : [];
  return (hints.length ? hints[hints.length - 1] : null) || panel;
};

/** Scrolls it into view, only as far as needed. Returns whether it could. */
export const revealHintPanel = (panel, { place, similarOpen = false, behavior = 'auto' } = {}) => {
  const target = hintPanelRevealTarget(panel, { place, similarOpen });
  if (!target || typeof target.scrollIntoView !== 'function') return false;
  target.scrollIntoView({ block: 'nearest', behavior });
  return true;
};

/*
 * AND THE PAGE KEEPS IT IN SIGHT UNTIL IT SETTLES (Work View's staged steps).
 *
 * The reveal ran once, as the panel opened, and in Work View the page was not
 * done moving. A staged step there is bounded: it takes what the view leaves
 * it, and the question's results sit under it. The panel takes room from the
 * step, and where that leaves the step too little (stepRoom.js) the step flows
 * a frame or two later: it takes its content's height, and the results, the
 * hint with them, move below the step and its Previous/Next, while the view
 * stayed where it was. At 1366x768 the staged table's hint was in view for two
 * frames, then 873px down a 709px view; of the 23 staged steps the harness
 * mounts, 10 had none or part of their hint in sight at 1366x657 (a Chromebook
 * with its shelf), 8 at 1280x689 and on a 390x844 phone, 9 on a 360x740 one.
 *
 * So the target is watched once a frame after the reveal and brought into view
 * again whenever the layout moves it, until it has stayed where it is for
 * SETTLE_QUIET_FRAMES frames in a row (SETTLE_LIMIT_MS at most). Where it is
 * is its place in the layout (laidOutAt), which no scroll changes: the reveal's
 * own scrolling, or a glide still under way, is not a move. The student's own
 * press, tap, key or wheel ends it at once: the view is then theirs.
 */
export const SETTLE_QUIET_FRAMES = 12;
export const SETTLE_LIMIT_MS = 2500;
const STUDENT_MOVES = Object.freeze(['pointerdown', 'touchstart', 'keydown', 'wheel']);

/**
 * The element's place in the layout: its offsets up to the page or to the
 * fixed layer it is in (an open Work View). A scroll changes none of them.
 */
export const laidOutAt = (element) => {
  let top = 0;
  for (let node = element; node; node = node.offsetParent) top += Number(node.offsetTop) || 0;
  return { top, bottom: top + (Number(element?.offsetHeight) || 0) };
};

/**
 * revealHintPanel, and again each time the layout moves the target, until it
 * settles. Returns the function that stops watching (the caller's cleanup).
 */
export const keepHintPanelInView = (panel, {
  place,
  similarOpen = false,
  behavior = 'auto',
  win = typeof window !== 'undefined' ? window : null,
  quietFrames = SETTLE_QUIET_FRAMES,
  limitMs = SETTLE_LIMIT_MS,
} = {}) => {
  const idle = () => {};
  if (!revealHintPanel(panel, { place, similarOpen, behavior })) return idle;
  if (typeof win?.requestAnimationFrame !== 'function') return idle;
  const doc = win.document || null;
  const now = () => (typeof win.performance?.now === 'function' ? win.performance.now() : Date.now());
  const started = now();
  let target = hintPanelRevealTarget(panel, { place, similarOpen });
  let at = laidOutAt(target);
  let quiet = 0;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame);
    frame = 0;
    STUDENT_MOVES.forEach((type) => doc?.removeEventListener?.(type, onStudent, true));
  };
  // The app's own synthetic events are not the student.
  const onStudent = (event) => { if (event?.isTrusted !== false) stop(); };
  const tick = () => {
    frame = 0;
    if (stopped) return;
    const current = hintPanelRevealTarget(panel, { place, similarOpen });
    if (!current || current.isConnected === false) { stop(); return; }
    const moved = laidOutAt(current);
    if (current !== target || Math.abs(moved.top - at.top) > 0.5 || Math.abs(moved.bottom - at.bottom) > 0.5) {
      target = current;
      at = moved;
      quiet = 0;
      revealHintPanel(panel, { place, similarOpen, behavior });
    } else {
      quiet += 1;
    }
    if (quiet >= quietFrames || now() - started >= limitMs) { stop(); return; }
    frame = win.requestAnimationFrame(tick);
  };
  STUDENT_MOVES.forEach((type) => doc?.addEventListener?.(type, onStudent, { capture: true, passive: true }));
  frame = win.requestAnimationFrame(tick);
  return stop;
};

/*
 * FOCUS GOES TO WHAT THE PRESS ASKED FOR.
 *
 * The button pressed is usually gone once the panel opens — the first-hint
 * offer goes with the first hint, and "Show a hint" under a miss and "Show
 * the next hint" go while the next one waits for a try — and focus fell to
 * <body>: nothing showed where the keyboard was, and a screen reader said
 * nothing of the hint. Hints are not live regions (only the line a rung shows
 * while its tool loads is), so focus is how the hint is read, once:
 *
 *   'hint'     the newest hint (tabIndex -1 in HintPanel), or, while that rung
 *              is still loading, the panel ("Hints"): the loading line is a
 *              status that says itself, and the hint takes focus when it is
 *              here;
 *   'example'  the open worked example's heading (its summary).
 *
 * The panel itself when it holds neither.
 */
export const hintPanelFocusTarget = (panel, { asked = 'hint' } = {}) => {
  if (!panel || typeof panel.querySelector !== 'function') return null;
  const own = panel.querySelector('[data-hint-panel]') || panel;
  if (asked === 'example') return panel.querySelector('[data-similar-example] > summary') || own;
  const hints = typeof panel.querySelectorAll === 'function' ? panel.querySelectorAll('li[data-hint-source]') : [];
  const newest = hints.length ? hints[hints.length - 1] : null;
  return newest && newest.getAttribute?.('data-hint-source') !== 'pending' ? newest : own;
};
