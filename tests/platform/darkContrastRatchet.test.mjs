// AXE'S OWN CONTRAST VERDICTS IN THE DARK THEME, AS A RATCHET (student-keyboard-ci).
//
// The certification gates every axe rule in the light theme; in the dark theme only the nodes axe could not decide
// were read (the contrast review's dark job measures those). What axe itself decides fails in dark was gated nowhere.
// The dark review now counts those nodes per scene|viewport too, against a checked-in baseline of today's dark
// failures (scripts/accessibility-dark-contrast-baseline.json), so a new dark failure fails CI. Every key the baseline
// accepts says why; the identity palettes that wait for the owner are named there.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compare, normalizeViolations, ratchetFailed } from '../../scripts/lib/accessibilityRatchet.mjs';
import {
  DARK_CONTRAST_RULE, buildDarkContrastBaseline, darkContrastCounts, unexplainedKeys,
} from '../../scripts/lib/darkContrastRatchet.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const BASELINE = JSON.parse(readFileSync(new URL('../../scripts/accessibility-dark-contrast-baseline.json', import.meta.url), 'utf8'));
const review = executableSource(readFileSync(new URL('../browser/contrastReview.mjs', import.meta.url), 'utf8'));

// What axe returns for a scene with failing nodes, as the review collects it (collectViolationsInPage).
const axeSays = (screen, viewport, targets) => normalizeViolations({
  screen, viewport, violations: [{ id: 'color-contrast', impact: 'serious', help: 'Elements must meet minimum color contrast ratio thresholds', helpUrl: 'https://example.invalid/color-contrast', nodes: targets.map((target) => ({ target: [target], html: `<span class="${target}">x</span>`, failureSummary: 'contrast 2.6' })) }],
});

/* --- the ratchet's own rules ------------------------------------------------- */

test('a new dark failure fails; one more than the baseline fails; fewer passes and says the baseline can be lowered', () => {
  const baseline = { 'a/b|desktop|color-contrast': 2 };
  const same = axeSays('a/b', 'desktop', ['.x', '.y']);
  assert.equal(ratchetFailed(compare(baseline, darkContrastCounts(same.counts))), false, 'today\'s failures pass');
  const more = axeSays('a/b', 'desktop', ['.x', '.y', '.z']);
  assert.equal(ratchetFailed(compare(baseline, darkContrastCounts(more.counts))), true, 'a third node fails');
  const elsewhere = axeSays('c', 'phone', ['.w']);
  const verdict = compare(baseline, darkContrastCounts({ ...same.counts, ...elsewhere.counts }));
  assert.deepEqual(verdict.added.map((row) => row.key), ['c|phone|color-contrast'], 'a scene with no key fails');
  const fewer = compare(baseline, darkContrastCounts(axeSays('a/b', 'desktop', ['.x']).counts));
  assert.equal(ratchetFailed(fewer), false);
  assert.deepEqual(fewer.reduced.map((row) => [row.key, row.count]), [['a/b|desktop|color-contrast', 1]]);
});

test('the baseline counts only colour contrast, keeps each reason a key still has, and gives a new key none', () => {
  const run = axeSays('lab/match', 'desktop', ['.label-a', '.label-b']);
  const other = normalizeViolations({ screen: 'lab/match', viewport: 'desktop', violations: [{ id: 'button-name', nodes: [{ target: ['button'] }] }] });
  const counts = { ...run.counts, ...other.counts, 'gone|phone|color-contrast': 0 };
  const built = buildDarkContrastBaseline({ counts, details: run.details, reasons: { 'lab/match|desktop|color-contrast': 'Owner item: the identity palette.', 'gone|phone|color-contrast': 'fixed since' } });
  assert.deepEqual(built.counts, { 'lab/match|desktop|color-contrast': 2 }, 'another rule, and a key with nothing failing, are not this baseline\'s');
  assert.deepEqual(built.targets, { 'lab/match|desktop|color-contrast': ['.label-a', '.label-b'] });
  assert.deepEqual(built.reasons, { 'lab/match|desktop|color-contrast': 'Owner item: the identity palette.' }, 'a reason only for a key still in it');
  const fresh = buildDarkContrastBaseline({ counts: axeSays('new/scene', 'phone', ['.n']).counts, details: {}, reasons: {} });
  assert.deepEqual(fresh.reasons, { 'new/scene|phone|color-contrast': null });
  assert.deepEqual(unexplainedKeys(fresh), ['new/scene|phone|color-contrast'], 'a key without a reason is named');
  assert.deepEqual(unexplainedKeys({ counts: { k: 1 }, reasons: { k: '   ' } }), ['k'], 'blank is no reason');
  assert.deepEqual(unexplainedKeys(built), []);
});

/* --- the checked-in baseline -------------------------------------------------- */

test('every dark failure the baseline accepts is colour contrast, and says why', () => {
  assert.equal(BASELINE.version, 1);
  const keys = Object.keys(BASELINE.counts);
  assert.ok(keys.every((key) => key.endsWith(`|${DARK_CONTRAST_RULE}`)), 'colour contrast only');
  assert.ok(keys.every((key) => BASELINE.counts[key] > 0 && BASELINE.targets[key]?.length === BASELINE.counts[key]), 'a count and its targets for each key');
  assert.deepEqual(unexplainedKeys(BASELINE), [], 'a reason for each key');
});

// The identity palettes wait for the owner (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 5, "Identity colours in
// dark"): a key accepted for one says so, by the item's name and the palettes it names. Today's are the Complex Plane
// Lab's readouts; neither of the two the item names is drawn in a certified scene (no scene opens a student's skill
// card, and Representation Match colours its group labels only once a card is placed).
test('a dark failure accepted as an identity palette names the owner item it waits on', () => {
  const identity = Object.entries(BASELINE.reasons).filter(([, why]) => /identity colours in dark/i.test(why || ''));
  assert.ok(identity.length > 0, 'the baseline holds the identity palettes by name');
  for (const [key, why] of identity) {
    assert.match(why, /^Owner item: identity colours in dark \(docs\/handoffs\/NOVEMBER_BUILD_2026-11\.md, section 5\)\./, `${key}: the item it waits on`);
    assert.match(why, /SkillDetailCardModal\.jsx/, `${key}: and the palettes that item names`);
    assert.match(why, /Representation Match/, key);
  }
  const handoff = readFileSync(new URL('../../docs/handoffs/NOVEMBER_BUILD_2026-11.md', import.meta.url), 'utf8');
  assert.match(handoff, /\*\*Identity colours in dark\.\*\*/, 'the owner item is where the reason says it is');
});

/* --- the review ---------------------------------------------------------------- */

test('the dark review asks axe for its verdicts before it touches the page, and fails on more than the baseline accepts', () => {
  const loop = region(review, 'const scope = sceneScope(screen, scene);', 'const described = await page.evaluate(collectInPage,', 'a scene of the review');
  assert.match(loop, /const decided = darkRatchet\s*\? normalizeViolations\(\{ screen: label, viewport: viewport\.id, violations: await page\.evaluate\(collectViolationsInPage, \{ include: asList\(scope\.include\), exclude: asList\(scope\.exclude\) \}\) \}\)/,
    'axe\'s own verdicts, on the scene\'s own region, before the pixel step hides text');
  assert.match(review, /const darkRatchet = colorScheme === 'dark';/, 'in the dark theme only: the light theme\'s are the certification\'s');
  const verdict = region(review, 'if (darkRatchet) {\n    const current = mergeNormalized(...verdicts);', "writeFileSync(path.join(artifacts, 'contrast-review.json')", 'the dark verdict');
  assert.match(verdict, /const comparison = compare\(readBaselineCounts\(baseline\), counts, \{ scope: inRun \}\);/);
  assert.match(verdict, /\} else if \(ratchetFailed\(comparison\)\) \{\s*darkFailed = true;/, 'more than the baseline fails the run');
  assert.match(review, /if \(failing\.length \|\| unreachable\.length \|\| darkFailed\) process\.exitCode = 1;/);
  const collect = region(review, 'export const collectViolationsInPage = async', '\n};', 'what axe is asked');
  assert.match(collect, /runOnly: \{ type: 'rule', values: \['color-contrast'\] \}, resultTypes: \['violations'\]/);
});
