/*
 * AXE'S OWN CONTRAST VERDICTS IN THE DARK THEME, AS A RATCHET (student-keyboard-ci).
 *
 * The certification (tests/browser/accessibilityCertification.mjs) gates every axe rule, colour contrast with
 * them, in the light theme, against scripts/accessibility-baseline.json. In the dark theme only what axe could
 * not decide was read (tests/browser/contrastReview.mjs with COLOR_SCHEME=dark measures those nodes): what axe
 * itself decided fails in dark was gated nowhere, so a light-theme colour on a dark surface could ship. The dark
 * review now counts those nodes too, per `${scene}|${viewport}|color-contrast` as the certification counts its
 * own (scripts/lib/accessibilityRatchet.mjs), against scripts/accessibility-dark-contrast-baseline.json: a new
 * key or a higher count fails the run; a lower count passes and says the baseline can be lowered.
 *
 * Every key the baseline accepts says why (`reasons`), so a dark failure is in it only as something named: the
 * identity palettes that wait for the owner, say. `--write-baseline` keeps the reason of each key that still
 * fails and gives a new key none, and tests/platform/darkContrastRatchet.test.mjs fails on a key without one.
 *
 * Pure, so node can test it.
 */
import { buildBaseline, readBaselineCounts } from './accessibilityRatchet.mjs';

export const DARK_CONTRAST_RULE = 'color-contrast';

export const DARK_BASELINE_DESCRIPTION = 'axe-core color-contrast violations in the dark theme (a dark device, COLOR_SCHEME=dark) per scene|viewport|rule over the certified scenes: failing node counts, each with the reason it is accepted. Ratchet: a new key or a higher count fails the dark contrast review; counts may only go down. Regenerate with `COLOR_SCHEME=dark npm run review:contrast -- --write-baseline` after a deliberate change, and give every new key its reason.';

/** Only the rule this ratchet owns: the review asks axe for nothing else, and a stray key is not its business. */
export const darkContrastCounts = (counts = {}) => Object.fromEntries(Object.entries(counts)
  .filter(([key, count]) => key.endsWith(`|${DARK_CONTRAST_RULE}`) && count > 0));

/**
 * The baseline file: counts and targets as the certification's baseline has them, and a reason for every key.
 * A key that still fails keeps the reason it had; a new one has none (null) until someone writes it.
 */
export const buildDarkContrastBaseline = ({ counts, details = {}, reasons = {} }) => {
  const base = buildBaseline({ counts: darkContrastCounts(counts), details });
  const keys = Object.keys(base.counts);
  return {
    version: base.version,
    description: DARK_BASELINE_DESCRIPTION,
    counts: base.counts,
    targets: Object.fromEntries(keys.filter((key) => key in base.targets).map((key) => [key, base.targets[key]])),
    reasons: Object.fromEntries(keys.map((key) => [key, typeof reasons[key] === 'string' && reasons[key].trim() ? reasons[key] : null])),
  };
};

/** The keys the baseline accepts without saying why. */
export const unexplainedKeys = (baseline) => Object.keys(readBaselineCounts(baseline))
  .filter((key) => !(typeof baseline?.reasons?.[key] === 'string' && baseline.reasons[key].trim()));
