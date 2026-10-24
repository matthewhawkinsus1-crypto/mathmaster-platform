// WHAT MAKES A KEYBOARD-SWEEP SCENE FAIL WHEN THE SWEEP IS RUN AS A GATE.
//
// tests/browser/keyboardSweep.mjs is an audit: it measures a great deal and
// exits 0. With `--gate` it also judges its own report with this file (a pure
// function of one scene's entry, so tests/platform/keyboardSweepGate.test.mjs
// can feed it a made-up entry and see each criterion fail).
//
// A criterion is a hard failure of a WCAG success criterion the sweep measures
// directly: a keyboard trap, a control the keyboard cannot reach or operate, a
// stop with no visible focus or no name, focus thrown to <body>, a dialog or
// panel that will not close. Everything else the sweep reports stays a number
// to read, never a failure:
//   - a plain disclosure that stays open and has no control that closes it
//     (Read aloud's "Read a part" panel does this): it traps nobody, and the
//     sweep's own rule is that a disclosure need not close on Escape;
//   - a Check that gave the generic probe no response: the probe does not know
//     the answers, so a Check it cannot satisfy is not evidence;
//   - stops outside the viewport, and the like.
//
// TWO WAYS A GATE GOES QUIETLY GREEN, AND WHAT STOPS EACH.
//   - An empty run: no scene measured is not a pass.
//   - A field the sweep stopped writing: reading `undefined` as "none found"
//     would pass every scene. A field a criterion reads that the report does
//     not carry is an error, and the test reads the sweep's source for each.

const field = (summary, name) => {
  if (!summary || !(name in summary)) {
    throw new Error(`keyboard sweep gate: the report's summary has no "${name}" (the sweep and tests/browser/support/keyboardSweepGate.mjs are out of step)`);
  }
  return summary[name];
};
const list = (summary, name) => {
  const value = field(summary, name);
  if (!Array.isArray(value)) throw new Error(`keyboard sweep gate: summary.${name} is not a list`);
  return value;
};
const checks = (summary, result) => list(summary, 'checks').filter((entry) => entry.result === result).length;

/**
 * id, the success criterion it stands for, what it says, the summary fields it
 * reads, and how many times a scene breaks it.
 */
export const GATE_CRITERIA = Object.freeze([
  { id: 'ran', wcag: '-', says: 'the scene ran to the end without an exception', reads: [], failures: (entry) => (entry.error ? 1 : 0) },
  { id: 'rendered', wcag: '-', says: 'the question mounted (no "could not be displayed" or "did not load" panel)', reads: [], failures: (entry) => (entry.renderFailure ? 1 : 0) },
  { id: 'pageErrors', wcag: '-', says: 'no uncaught exception on the page', reads: [], failures: (entry) => (Array.isArray(entry.pageErrors) ? entry.pageErrors.length : 0) },
  {
    id: 'forwardTrap', wcag: '2.1.2',
    says: 'Tab reaches the end of the page from the start (no trap, no loop, no focus lost to <body>)',
    reads: ['reachedEnd', 'trap'],
    failures: ({ summary }) => (field(summary, 'reachedEnd') && !field(summary, 'trap') ? 0 : 1),
  },
  {
    id: 'reverseTrap', wcag: '2.1.2',
    says: 'Shift+Tab reaches the start of the page from the end',
    reads: ['reverseReachedStart', 'reverseTrap'],
    failures: ({ summary }) => (field(summary, 'reverseReachedStart') && !field(summary, 'reverseTrap') ? 0 : 1),
  },
  { id: 'noVisibleFocus', wcag: '2.4.7', says: 'every Tab stop in the tool shows where focus is', reads: ['noVisibleFocus'], failures: ({ summary }) => list(summary, 'noVisibleFocus').length },
  { id: 'focusHidden', wcag: '2.4.11', says: 'no focused control is under a sticky bar or another layer', reads: ['focusHiddenUnderOverlay'], failures: ({ summary }) => list(summary, 'focusHiddenUnderOverlay').length },
  { id: 'unnamed', wcag: '4.1.2', says: 'every Tab stop has an accessible name', reads: ['unnamed'], failures: ({ summary }) => list(summary, 'unnamed').length },
  {
    id: 'mouseOnly', wcag: '2.1.1',
    says: 'nothing with a click, pointer or drag handler is out of the keyboard\'s reach, and an enabled Check is reached by Tab',
    reads: ['pointerNotReachable', 'dragOnly', 'checks'],
    // A draggable card that holds the buttons that do the same by key (Graph
    // Scenario Match's "Select this graph") is a wrapper, and a wrapper is
    // judged by what is inside it, as pointerNotReachable already does.
    failures: ({ summary }) => list(summary, 'pointerNotReachable').length
      + list(summary, 'dragOnly').filter((handler) => handler.verdict !== 'wrapper').length
      + checks(summary, 'enabled-but-not-reached-by-Tab'),
  },
  { id: 'notActivatable', wcag: '2.1.1', says: 'every Tab stop with a pointer handler also answers Enter or Space', reads: ['pointerNotActivatable'], failures: ({ summary }) => list(summary, 'pointerNotActivatable').length },
  {
    id: 'cannotClose', wcag: '2.1.2',
    says: 'a dialog, menu or floating panel closes on Escape; one that does not has a control that closes it; focus stays inside a modal',
    reads: ['escapeFailures', 'keyboardUncloseable', 'dialogFocusLeaks'],
    failures: ({ summary }) => list(summary, 'escapeFailures').length
      + list(summary, 'keyboardUncloseable').filter((popup) => popup.kind !== 'disclosure').length
      + list(summary, 'dialogFocusLeaks').length,
  },
  {
    id: 'focusLost', wcag: '2.4.3',
    says: 'focus does not fall to <body> on its own after load, after a keyboard Check, or after an action that removes its button',
    reads: ['focusDroppedAfterLoadMs', 'focusLostAfterCheck', 'focusLostAfterAction'],
    failures: ({ summary }) => (field(summary, 'focusDroppedAfterLoadMs') != null ? 1 : 0)
      + list(summary, 'focusLostAfterCheck').length
      + (field(summary, 'focusLostAfterAction') || 0),
  },
]);

/** Every summary field the criteria read: the sweep must write each one. */
export const GATE_SUMMARY_FIELDS = Object.freeze([...new Set(GATE_CRITERIA.flatMap((criterion) => criterion.reads))]);

/** What one scene breaks: [{ id, wcag, says, count }], empty for a scene that passes. */
export const sceneFailures = (entry) => GATE_CRITERIA
  .map((criterion) => ({ id: criterion.id, wcag: criterion.wcag, says: criterion.says, count: criterion.failures(entry || {}) }))
  .filter((failure) => failure.count > 0);

/**
 * The gate's verdict on a run: ok only if it measured at least one scene and
 * none broke a criterion. `failing` names each scene that did, and `counts`
 * totals the failures by criterion.
 */
export const gateVerdict = (entries) => {
  const scenes = Array.isArray(entries) ? entries : [];
  const failing = scenes
    .map((entry) => ({ scene: entry?.sceneKey || '(unnamed scene)', failures: sceneFailures(entry) }))
    .filter((scene) => scene.failures.length > 0);
  const counts = {};
  failing.forEach((scene) => scene.failures.forEach((failure) => { counts[failure.id] = (counts[failure.id] || 0) + failure.count; }));
  return { ok: scenes.length > 0 && failing.length === 0, scenes: scenes.length, failing, counts };
};

/** The lines the sweep prints for a verdict. */
export const gateLines = (verdict) => {
  if (verdict.scenes === 0) return ['KEYBOARD GATE: FAILED - no scene was measured, so nothing was checked.'];
  if (verdict.ok) return [`KEYBOARD GATE: passed - ${verdict.scenes} scenes, no criterion broken.`];
  const lines = [`KEYBOARD GATE: FAILED - ${verdict.failing.length} of ${verdict.scenes} scenes break a criterion.`];
  Object.entries(verdict.counts).forEach(([id, total]) => {
    const criterion = GATE_CRITERIA.find((entry) => entry.id === id);
    lines.push(`  ${id} (${criterion.wcag}): ${total} - ${criterion.says}`);
  });
  verdict.failing.forEach((scene) => {
    lines.push(`  ${scene.scene}: ${scene.failures.map((failure) => `${failure.id} ${failure.count}`).join(', ')}`);
  });
  return lines;
};
