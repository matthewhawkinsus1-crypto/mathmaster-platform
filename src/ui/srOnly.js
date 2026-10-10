/*
 * Visually hidden, still read by screen readers. Inline rather than the
 * .mm-sr-only class because some surfaces that need it (MathDisplay inside a
 * standalone tool, a harness) load none of the UI kit CSS.
 */
export const SR_ONLY_STYLE = Object.freeze({
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0,
});
