/*
 * ACCESSIBILITY RATCHET — the pure half of the WCAG 2.1 AA certification
 * (tests/browser/accessibilityCertification.mjs).
 *
 * axe-core reports violations per rule, each with the DOM nodes that fail it.
 * The ratchet unit is the number of failing nodes per
 *
 *     `${screen}|${viewport}|${ruleId}`
 *
 * checked in as scripts/accessibility-baseline.json, the way the theme audit
 * counts literals per file:token. A count above its baseline, or a key the
 * baseline has never seen, fails; a count below it passes and says the
 * baseline can be lowered (`--write-baseline`).
 *
 * Node targets are normalised to a STABLE selector (stableTarget) so the
 * examples in the report and the baseline read the same run after run: React
 * useId values (`:r1:`, `«r1»`, `_r_1_`), numeric suffixes and content hashes
 * in ids and classes are replaced by placeholders.
 */

export const WCAG_TAGS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
export const BASELINE_VERSION = 1;

/** The ratchet key. */
export const ratchetKey = (screen, viewport, ruleId) => `${screen}|${viewport}|${ruleId}`;

export const parseRatchetKey = (key) => {
  const [screen, viewport, ruleId] = String(key).split('|');
  return { screen, viewport, ruleId };
};

/*
 * One axe target (a selector, or an array of selectors through iframes /
 * shadow roots) as a selector that does not change between runs.
 */
export const stableTarget = (target) => {
  const parts = Array.isArray(target) ? target.flat(Infinity) : [target];
  return parts.map((selector) => String(selector)
    // React useId: `:r1:` (React 18, CSS-escaped as `\:r1\:`), `«r1»` (19.0),
    // `_r_1_` (19.1+).
    .replace(/\\?:r[0-9a-z]+\\?:/gi, ':r:')
    .replace(/«r[0-9a-z]+»/gi, '«r»')
    .replace(/_r_[0-9a-z]+_/gi, '_r_')
    // CSS-escaped leading digits in ids (`#\31 23`).
    .replace(/\\3\d\s?/g, 'N')
    // Content hashes (choice ids, generated keys).
    .replace(/[0-9a-f]{10,}/gi, 'H')
    // Numeric suffixes / segments in identifiers: `q-12`, `field_3`, `x12`.
    .replace(/([-_])\d+(?=[^0-9]|$)/g, '$1N')
    .replace(/(#[A-Za-z][\w-]*?)\d+(?=[^\w-]|$)/g, '$1N')
    // Numbers inside attribute values (`[aria-label="597 seconds left"]`, a
    // countdown or a score) change while the screen does not.
    .replace(/(\[[\w:-]+[~|^$*]?=")([^"]*)(")/g, (_match, open, value, close) => `${open}${value.replace(/\d+/g, 'N')}${close}`)
    // Long numbers anywhere else (timestamps).
    .replace(/\d{4,}/g, 'N'))
    .join(' >>> ');
};

const sortedObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

/*
 * axe results for one screen at one viewport -> ratchet counts plus the
 * details a report needs (impact, help, helpUrl, stable targets).
 */
export const normalizeViolations = ({ screen, viewport, violations = [] }) => {
  const counts = {};
  const details = {};
  for (const violation of violations) {
    const key = ratchetKey(screen, viewport, violation.id);
    const targets = (violation.nodes || []).map((node) => stableTarget(node.target));
    counts[key] = (counts[key] || 0) + targets.length;
    const entry = details[key] || {
      screen, viewport, ruleId: violation.id, impact: violation.impact || null,
      help: violation.help || '', helpUrl: violation.helpUrl || '', targets: [],
      examples: [],
    };
    entry.targets.push(...targets);
    for (const node of violation.nodes || []) {
      if (entry.examples.length >= 5) break;
      entry.examples.push({
        target: stableTarget(node.target),
        html: String(node.html || '').slice(0, 240),
        summary: String(node.failureSummary || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      });
    }
    details[key] = entry;
  }
  for (const entry of Object.values(details)) entry.targets.sort();
  return { counts: sortedObject(counts), details: sortedObject(details) };
};

/** Several normalised results into one. */
export const mergeNormalized = (...results) => {
  const counts = {};
  const details = {};
  for (const result of results) {
    for (const [key, count] of Object.entries(result.counts || {})) counts[key] = (counts[key] || 0) + count;
    for (const [key, entry] of Object.entries(result.details || {})) {
      if (!details[key]) details[key] = { ...entry, targets: [...entry.targets], examples: [...entry.examples] };
      else {
        details[key].targets.push(...entry.targets);
        details[key].targets.sort();
        details[key].examples.push(...entry.examples.slice(0, Math.max(0, 5 - details[key].examples.length)));
      }
    }
  }
  return { counts: sortedObject(counts), details: sortedObject(details) };
};

/*
 * THE RATCHET. `baseline` and `current` map key -> count.
 *   added      a key the baseline does not have (a rule newly failing there)
 *   increased  a key whose count went up
 *   reduced    a key whose count went down, or that no longer fails at all
 * `scope` (optional) limits the comparison to keys whose screen it accepts —
 * a partial run (ONLY=...) must not report every other screen as fixed.
 */
export const compare = (baseline = {}, current = {}, { scope = null } = {}) => {
  const inScope = (key) => !scope || scope(parseRatchetKey(key));
  const added = [];
  const increased = [];
  const reduced = [];
  for (const [key, count] of Object.entries(current)) {
    if (!inScope(key) || !(count > 0)) continue;
    if (!Object.hasOwn(baseline, key)) added.push({ key, baseline: 0, count });
    else if (count > baseline[key]) increased.push({ key, baseline: baseline[key], count });
  }
  for (const [key, count] of Object.entries(baseline)) {
    if (!inScope(key)) continue;
    const now = Object.hasOwn(current, key) ? current[key] : 0;
    if (now < count) reduced.push({ key, baseline: count, count: now });
  }
  const byKey = (a, b) => a.key.localeCompare(b.key);
  return { added: added.sort(byKey), increased: increased.sort(byKey), reduced: reduced.sort(byKey) };
};

export const ratchetFailed = ({ added, increased }) => added.length + increased.length > 0;

/** The baseline file's shape: counts (the ratchet) and targets (for diffs). */
export const buildBaseline = ({ counts, details }) => ({
  version: BASELINE_VERSION,
  description: 'WCAG 2.1 AA violations (axe-core) per screen|viewport|rule — failing node counts. Ratchet: counts may only go down. Regenerate with `npm run certify:accessibility -- --write-baseline` after a deliberate reduction.',
  counts: sortedObject(Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0))),
  targets: sortedObject(Object.fromEntries(Object.entries(details).map(([key, entry]) => [key, [...entry.targets].sort()]))),
});

export const readBaselineCounts = (baseline) => (baseline && typeof baseline.counts === 'object' ? baseline.counts : {});

/*
 * Human-readable lines for a failing comparison: each new / increased
 * screen|viewport|rule with axe's help, its URL, and the targets the baseline
 * does not list (marked NEW), so a reviewer can see exactly what appeared.
 */
export const describeFailures = (comparison, { details = {}, baselineTargets = {} } = {}) => {
  const lines = [];
  for (const [label, rows] of [['NEW', comparison.added], ['INCREASED', comparison.increased]]) {
    for (const row of rows) {
      const entry = details[row.key] || {};
      lines.push(`${label} ${row.key}: ${row.count} node(s) (baseline ${row.baseline})${entry.impact ? ` [${entry.impact}]` : ''}`);
      if (entry.help) lines.push(`    ${entry.help}`);
      if (entry.helpUrl) lines.push(`    ${entry.helpUrl}`);
      const known = new Map();
      for (const target of baselineTargets[row.key] || []) known.set(target, (known.get(target) || 0) + 1);
      for (const target of entry.targets || []) {
        const left = known.get(target) || 0;
        if (left > 0) known.set(target, left - 1);
        else lines.push(`    NEW target: ${target}`);
      }
    }
  }
  return lines;
};
