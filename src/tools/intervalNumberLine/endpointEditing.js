/*
 * ENDPOINT EDITS, ONE CODE PATH FOR THE POINTER AND THE KEYBOARD.
 *
 * IntervalNumberLine lets a student move a placed endpoint by dragging it and
 * switch it open/closed by clicking it. The keyboard does the same two things
 * on a focused endpoint: Enter/Space switch it, ArrowLeft/ArrowRight move it.
 *
 * Both routes go through these pure functions, so a keyboard-moved endpoint
 * lands on a value a drag could have produced (the same snap grid, the same
 * clamp to the drawn line, the same "a bounded piece keeps at least one snap
 * step of width" rule) and is stored as exactly the same record. That is what
 * makes it grade exactly like a dragged one — tests/tools/
 * intervalNumberLineKeyboard.test.mjs proves it on the shared grader.
 *
 * Nothing in here knows the answer key.
 */

export const NUMBER_LINE_GEOMETRY = Object.freeze({ WIDTH: 620, HEIGHT: 138, PAD: 42 });

// Shift + arrow moves this many snap steps at once.
export const ENDPOINT_BIG_STEP_COUNT = 5;

const tidyNumber = (value) => Number(Number(value).toFixed(10));

/** Snap a raw line value to the snap grid and clamp it to the drawn line. */
export const snapToLine = (raw, { min, max, snapStep }) => {
  const snapped = tidyNumber(Math.round(raw / snapStep) * snapStep);
  return Number.isFinite(snapped)
    ? Math.max(min, Math.min(max, snapped))
    : null;
};

/** The value under viewBox x — what a click or a drag at x records. */
export const lineValueAtViewBoxX = (x, { min, max, snapStep }) => {
  const { WIDTH, PAD } = NUMBER_LINE_GEOMETRY;
  const span = max - min || 1;
  const raw = min + ((x - PAD) / (WIDTH - PAD * 2)) * span;
  return snapToLine(raw, { min, max, snapStep });
};

/** The viewBox x where a value is drawn (clamped to the line, as drawn). */
export const viewBoxXForValue = (value, { min, max }) => {
  const { WIDTH, PAD } = NUMBER_LINE_GEOMETRY;
  const span = max - min || 1;
  return PAD + ((Math.max(min, Math.min(max, value)) - min) / span) * (WIDTH - PAD * 2);
};

const MOVE_KEYS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/*
 * The next grid value in the arrow's direction. An endpoint already on the
 * grid moves one snap step (Shift: ENDPOINT_BIG_STEP_COUNT steps); a typed
 * off-grid endpoint (−13/8 on a whole-number grid) moves to the next grid
 * value in that direction first. The result is then passed through the very
 * snap-and-clamp a drag uses, so it is always a value a drag could end on.
 */
export const keyboardEndpointValue = (current, key, { shiftKey = false, min, max, snapStep }) => {
  const direction = MOVE_KEYS[key];
  if (!direction || !Number.isFinite(current) || !(snapStep > 0)) return null;
  const steps = shiftKey ? ENDPOINT_BIG_STEP_COUNT : 1;
  const position = current / snapStep;
  const index = direction > 0
    ? Math.floor(position + 1e-9) + steps
    : Math.ceil(position - 1e-9) - steps;
  return snapToLine(index * snapStep, { min, max, snapStep });
};

/*
 * What a key on a focused endpoint means: { type: 'toggle' } exactly as a
 * click, { type: 'move', value } exactly as a drag ending at `value`, or null
 * (let the key through — Tab, Escape, …).
 */
export const endpointKeyIntent = (event, current, line) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') return { type: 'toggle' };
  const value = keyboardEndpointValue(current, event.key, { ...line, shiftKey: event.shiftKey });
  return value == null ? null : { type: 'move', value };
};

/* ----------------------------------------------------------- state edits */

/** Switch one placed endpoint open/closed (the click on an endpoint). */
export const toggleBuiltEndpoint = (built, intervalIndex, endpoint) => built.map((interval, index) => {
  if (index !== intervalIndex) return interval;
  if (endpoint === 'min' && interval.min !== Number.NEGATIVE_INFINITY) {
    return { ...interval, minClosed: !interval.minClosed };
  }
  if (endpoint === 'max' && interval.max !== Number.POSITIVE_INFINITY) {
    return { ...interval, maxClosed: !interval.maxClosed };
  }
  return interval;
});

/** Switch the pending (unpaired) endpoint open/closed. */
export const togglePendingEndpoint = (pending) => (
  pending == null ? pending : { ...pending, closed: !pending.closed }
);

/** Move one placed endpoint to `value` (a drag's pointermove). */
export const moveBuiltEndpoint = (built, intervalIndex, endpoint, value, snapStep) => built.map((interval, index) => {
  if (index !== intervalIndex) return interval;

  if (endpoint === 'min') {
    const ceiling = Number.isFinite(interval.max) ? interval.max - Math.max(snapStep, 1e-9) : value;
    return { ...interval, min: Math.min(value, ceiling) };
  }

  const floor = Number.isFinite(interval.min) ? interval.min + Math.max(snapStep, 1e-9) : value;
  return { ...interval, max: Math.max(value, floor) };
});

/** Move the pending endpoint to `value`. */
export const movePendingEndpoint = (pending, value) => (pending ? { ...pending, value } : pending);

/** The current value of the endpoint a target names, in the stored state. */
export const endpointValue = ({ pending, built }, target) => {
  if (target.kind === 'pending') return pending?.value ?? null;
  const value = built?.[target.intervalIndex]?.[target.endpoint];
  return Number.isFinite(value) ? value : null;
};

/*
 * PLACING AN ENDPOINT — a click on the line at a value, or Enter on the
 * focused line with its placement marker at that value. The outcome is one of
 *   { error }                         the second endpoint repeats the first
 *   { pending }                       the first endpoint of a pair
 *   { pending: null, interval }       the pair, as the bounded piece it makes
 */
export const placementOutcome = (pending, value, closed) => {
  if (!Number.isFinite(value)) return null;
  if (pending == null) return { pending: { value: tidyNumber(value), closed } };
  if (Math.abs(value - pending.value) < 1e-10) {
    return { error: 'Choose a different second endpoint, or use a ray.' };
  }
  const first = { value: pending.value, closed: pending.closed };
  const second = { value: tidyNumber(value), closed };
  const [low, high] = first.value < second.value ? [first, second] : [second, first];
  return {
    pending: null,
    interval: { min: low.value, max: high.value, minClosed: low.closed, maxClosed: high.closed },
  };
};

/** Where the line's placement marker starts: 0 when it is on the line, else the middle. */
export const initialLineCursor = ({ min, max, snapStep }) => (
  snapToLine(min <= 0 && max >= 0 ? 0 : (min + max) / 2, { min, max, snapStep })
);

/*
 * A key on the focused line itself: { type: 'cursor', value } moves the
 * placement marker (arrows by the snap step, Shift for bigger steps, Home/End
 * to the ends of the line); { type: 'place', value } places an endpoint there,
 * exactly as a click at that value does.
 */
export const lineKeyIntent = (event, cursor, line) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    return cursor == null
      ? { type: 'cursor', value: initialLineCursor(line) }
      : { type: 'place', value: cursor };
  }
  if (event.key === 'Home') return { type: 'cursor', value: snapToLine(line.min, line) };
  if (event.key === 'End') return { type: 'cursor', value: snapToLine(line.max, line) };
  const value = keyboardEndpointValue(cursor ?? initialLineCursor(line), event.key, { ...line, shiftKey: event.shiftKey });
  return value == null ? null : { type: 'cursor', value };
};

/** Apply a toggle or a move to { pending, built } — the whole edit, either route. */
export const applyEndpointEdit = (state, target, intent, snapStep) => {
  if (target.kind === 'pending') {
    return {
      ...state,
      pending: intent.type === 'toggle'
        ? togglePendingEndpoint(state.pending)
        : movePendingEndpoint(state.pending, intent.value),
    };
  }
  return {
    ...state,
    built: intent.type === 'toggle'
      ? toggleBuiltEndpoint(state.built, target.intervalIndex, target.endpoint)
      : moveBuiltEndpoint(state.built, target.intervalIndex, target.endpoint, intent.value, snapStep),
  };
};
