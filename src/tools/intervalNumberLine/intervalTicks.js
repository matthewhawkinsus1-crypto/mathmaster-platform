/*
 * WHERE THE NUMBER LINE PUTS ITS TICKS.
 *
 * A "nice" step (1, 2, 2.5, 5 × 10ⁿ) labels about six intervals, with a minor
 * tick halfway. An item can also author the step a click or drag moves by.
 * When that step does not fall on those ticks — 0 to 600 by 60 drew ticks at
 * every 50 and labels at every 100, so a click landed on 60, 120, … 420 with
 * no tick under any of them (walkthrough 2026-10-23, Modeling and Solving
 * Linear Inequalities CW 5) — the ticks follow the step instead: one at every
 * step, labelled at a multiple of it that fits.
 */
const tidy = (value) => Number(Number(value).toFixed(10));

export const niceTickStep = (span, targetIntervals = 6) => {
  const safeSpan = Math.max(Math.abs(span), 1e-9);
  const rough = safeSpan / Math.max(1, targetIntervals);
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return tidy(factor * power);
};

const isMultiple = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;

/** { major, minor } for a line of this span; `snapStep` only when the item authored one. */
export const intervalTickSteps = (span, snapStep = null) => {
  const major = niceTickStep(span);
  const nice = { major, minor: tidy(major / 2) };
  if (!(snapStep > 0) || !(span > 0) || isMultiple(nice.minor, snapStep)) return nice;
  const count = span / snapStep;
  // Too fine to tick every step (more than 40 on the line): keep the nice ticks.
  if (count > 40) return nice;
  const factor = [1, 2, 5, 10].find((candidate) => count / candidate <= 12) ?? 10;
  const labelled = tidy(snapStep * factor);
  return { major: labelled, minor: factor > 1 ? tidy(snapStep) : labelled };
};
