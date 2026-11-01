import { startLights } from './grandPrixTheme.js';

/*
 * THE START LIGHTS over a round's countdown (grandPrixTheme.startLights): a red
 * pod more each second of 3 · 2 · 1, all three green at GO. `step` is the step
 * the screen already shows, off the round's server-anchored clock, so the
 * lights add no timing of their own. Decoration: a screen reader hears the
 * countdown's own words, not the lights.
 */
export default function StartLights({ step = null, go = false }) {
  const pods = startLights({ step, go });
  return (
    <span className="mm-gp-lights" aria-hidden="true" data-mm-start-lights={go ? 'go' : String(step ?? 'off')}>
      <span className="mm-gp-light" data-on={pods[0] || undefined} />
      <span className="mm-gp-light" data-on={pods[1] || undefined} />
      <span className="mm-gp-light" data-on={pods[2] || undefined} />
    </span>
  );
}
