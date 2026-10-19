// The accessibility ratchet (scripts/lib/accessibilityRatchet.mjs): what makes
// the WCAG 2.1 AA certification fail, pass, or say the baseline can be lowered.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBaseline, compare, describeFailures, mergeNormalized, normalizeViolations, ratchetFailed, ratchetKey, stableTarget,
} from '../../scripts/lib/accessibilityRatchet.mjs';

const violation = (id, targets, extra = {}) => ({
  id, impact: 'serious', help: `${id} help`, helpUrl: `https://dequeuniversity.com/rules/axe/4.11/${id}`,
  nodes: targets.map((target) => ({ target: [target], html: `<x data-t="${target}">`, failureSummary: 'Fix it' })),
  ...extra,
});

test('a new screen|viewport|rule key fails, with the rule, its help URL and the new target', () => {
  const baseline = { 'home|desktop|color-contrast': 2 };
  const current = { 'home|desktop|color-contrast': 2, 'home|desktop|button-name': 1 };
  const result = compare(baseline, current);
  assert.deepEqual(result.added, [{ key: 'home|desktop|button-name', baseline: 0, count: 1 }]);
  assert.deepEqual(result.increased, []);
  assert.deepEqual(result.reduced, []);
  assert.equal(ratchetFailed(result), true);

  const { details } = normalizeViolations({ screen: 'home', viewport: 'desktop', violations: [violation('button-name', ['.logout > button'])] });
  const lines = describeFailures(result, { details, baselineTargets: {} });
  assert.ok(lines.some((line) => line.startsWith('NEW home|desktop|button-name: 1')), lines.join('\n'));
  assert.ok(lines.some((line) => line.includes('https://dequeuniversity.com/rules/axe/4.11/button-name')), lines.join('\n'));
  assert.ok(lines.some((line) => line.trim() === 'NEW target: .logout > button'), lines.join('\n'));
});

test('a higher count on a known key fails and names only the targets the baseline lacks', () => {
  const result = compare({ 'grades|phone|color-contrast': 1 }, { 'grades|phone|color-contrast': 3 });
  assert.deepEqual(result.increased, [{ key: 'grades|phone|color-contrast', baseline: 1, count: 3 }]);
  assert.deepEqual(result.added, []);
  assert.equal(ratchetFailed(result), true);
  // One node more is already a failure.
  assert.deepEqual(compare({ 'grades|phone|label': 1 }, { 'grades|phone|label': 2 }).increased, [{ key: 'grades|phone|label', baseline: 1, count: 2 }]);
  const { details } = normalizeViolations({ screen: 'grades', viewport: 'phone', violations: [violation('color-contrast', ['.a', '.b', '.a'])] });
  const lines = describeFailures(result, { details, baselineTargets: { 'grades|phone|color-contrast': ['.a'] } });
  const newTargets = lines.filter((line) => line.includes('NEW target:')).map((line) => line.trim());
  assert.deepEqual(newTargets, ['NEW target: .a', 'NEW target: .b']);
});

test('reductions pass and are reported, including a key that no longer fails at all', () => {
  const result = compare(
    { 'home|desktop|color-contrast': 4, 'home|desktop|label': 1 },
    { 'home|desktop|color-contrast': 2 },
  );
  assert.equal(ratchetFailed(result), false);
  assert.deepEqual(result.reduced, [
    { key: 'home|desktop|color-contrast', baseline: 4, count: 2 },
    { key: 'home|desktop|label', baseline: 1, count: 0 },
  ]);
});

test('an equal count passes silently', () => {
  const result = compare({ 'a|desktop|r': 2 }, { 'a|desktop|r': 2 });
  assert.deepEqual(result, { added: [], increased: [], reduced: [] });
});

test('a scoped (partial) run judges only its own screens', () => {
  const baseline = { 'home|desktop|r': 1, 'grades|desktop|r': 5 };
  const current = { 'home|desktop|r': 1, 'path|desktop|new-rule': 2 };
  const result = compare(baseline, current, { scope: ({ screen }) => screen === 'home' });
  assert.deepEqual(result, { added: [], increased: [], reduced: [] });
});

test('stable targets strip React useId values, numeric suffixes and hashes', () => {
  assert.equal(stableTarget(['#\\:r1a\\: > input']), stableTarget(['#\\:r7\\: > input']));
  assert.equal(stableTarget(['[aria-labelledby="«r3»"]']), stableTarget(['[aria-labelledby="«r12»"]']));
  assert.equal(stableTarget(['#_r_4_']), stableTarget(['#_r_9_']));
  assert.equal(stableTarget(['#field-12']), '#field-N');
  assert.equal(stableTarget(['#choice_3d319f9d3ec3020b1d0d7b1cc9b1']), stableTarget(['#choice_55faf8070d6fd5fb1640bcc0f2a6']));
  assert.equal(stableTarget(['.question-1700000000123']), stableTarget(['.question-1700000000456']));
  // A countdown or score in an attribute value is not a different element.
  assert.equal(stableTarget(['div[aria-label="597 seconds left"]']), stableTarget(['div[aria-label="12 seconds left"]']));
  assert.equal(stableTarget(['div[aria-label="597 seconds left"]']), 'div[aria-label="N seconds left"]');
  // Through a shadow root: one selector per tree.
  assert.equal(stableTarget([['math-field', '.ML__keyboard-toggle']]), 'math-field >>> .ML__keyboard-toggle');
  // Structure is kept: a different element is a different target.
  assert.notEqual(stableTarget(['.nav > button:nth-child(2)']), stableTarget(['.nav > a']));
});

test('normalised counts are failing NODES per screen|viewport|rule, and merge by summing', () => {
  const desktop = normalizeViolations({ screen: 'home', viewport: 'desktop', violations: [violation('color-contrast', ['.a', '.b']), violation('label', ['#in-3'])] });
  assert.deepEqual(desktop.counts, { 'home|desktop|color-contrast': 2, 'home|desktop|label': 1 });
  assert.deepEqual(desktop.details['home|desktop|label'].targets, ['#in-N']);
  assert.equal(desktop.details['home|desktop|color-contrast'].helpUrl, 'https://dequeuniversity.com/rules/axe/4.11/color-contrast');
  const again = normalizeViolations({ screen: 'home', viewport: 'desktop', violations: [violation('color-contrast', ['.c'])] });
  const merged = mergeNormalized(desktop, again);
  assert.equal(merged.counts['home|desktop|color-contrast'], 3);
  assert.deepEqual(merged.details['home|desktop|color-contrast'].targets, ['.a', '.b', '.c']);
  assert.equal(ratchetKey('home', 'phone', 'label'), 'home|phone|label');
});

test('the written baseline holds counts (the ratchet) and sorted targets, and round-trips through compare', () => {
  const normalized = normalizeViolations({ screen: 's', viewport: 'phone', violations: [violation('label', ['.z', '.y'])] });
  const baseline = buildBaseline(normalized);
  assert.deepEqual(baseline.counts, { 's|phone|label': 2 });
  assert.deepEqual(baseline.targets, { 's|phone|label': ['.y', '.z'] });
  assert.deepEqual(compare(baseline.counts, normalized.counts), { added: [], increased: [], reduced: [] });
  // Order of discovery does not change the file.
  const reordered = buildBaseline(normalizeViolations({ screen: 's', viewport: 'phone', violations: [violation('label', ['.y', '.z'])] }));
  assert.equal(JSON.stringify(reordered), JSON.stringify(baseline));
});
