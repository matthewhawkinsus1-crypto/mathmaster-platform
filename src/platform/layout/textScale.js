/*
 * THE STUDENT'S TEXT-SIZE SETTING AS A NUMBER (WCAG 1.4.4) — student push N.
 *
 * Font sizes are written calc(N * var(--mm-px)), so they follow the browser's
 * text size. A fluid size, clamp(A, 4.2vmin, B), would not: its viewport term
 * ignores the setting, so at 200% text it grew only to its new minimum (1.3×
 * on a Chromebook). The px-to-rem codemod writes that term as
 * calc(4.2vmin * var(--mm-text-scale, 1)); this sets --mm-text-scale on the
 * root — 1 at the default text size, 2 at 200% — because CSS cannot divide
 * one length by another portably.
 *
 * Measured, not guessed: a hidden probe is calc(100 * var(--mm-px)) wide, which
 * is exactly 100px at the default size, so its width / 100 is the scale. A
 * ResizeObserver on the probe follows the setting when it changes.
 */
export const TEXT_SCALE_VAR = '--mm-text-scale';
const PROBE_UNITS = 100;

const defaultWindow = () => (typeof window === 'undefined' ? null : window);

/** The probe's width in CSS px → the text scale (1 at the default size). */
export const textScaleFromProbeWidth = (width) => {
  const scale = Number(width) / PROBE_UNITS;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  // Sub-pixel noise at the default size must leave every size exactly as it
  // was: anything within half a percent of 1 is 1.
  if (Math.abs(scale - 1) < 0.005) return 1;
  return Math.round(scale * 1000) / 1000;
};

export const installTextScale = (windowObject = defaultWindow()) => {
  const document = windowObject?.document;
  const root = document?.documentElement;
  if (!root || typeof document.createElement !== 'function') return () => {};
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('data-mm-text-scale-probe', '');
  // Fixed at the top-left, no height, invisible: it can never widen the page
  // or take a pointer, and it sits outside <body> so no body > * rule sees it.
  probe.style.cssText = `position:fixed;left:0;top:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;width:calc(${PROBE_UNITS} * var(--mm-px));`;
  root.appendChild(probe);
  let last = null;
  const update = () => {
    const scale = textScaleFromProbeWidth(probe.getBoundingClientRect().width);
    if (scale === last) return;
    last = scale;
    root.style.setProperty(TEXT_SCALE_VAR, String(scale));
  };
  update();
  const observer = typeof windowObject.ResizeObserver === 'function' ? new windowObject.ResizeObserver(update) : null;
  observer?.observe(probe);
  // The root size changes at the 1024px breakpoint too; --mm-px follows it, so
  // the scale does not move, but a resize is a cheap second signal.
  windowObject.addEventListener?.('resize', update);
  return () => {
    observer?.disconnect();
    windowObject.removeEventListener?.('resize', update);
    probe.remove();
    root.style.removeProperty(TEXT_SCALE_VAR);
  };
};
