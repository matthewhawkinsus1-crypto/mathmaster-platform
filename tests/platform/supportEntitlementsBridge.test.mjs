// ONE EFFECTIVE SUPPORT PROFILE, EVERY SURFACE.
//
// Two generations of support code meet here: the versioned profile
// (supportProfileModel.mjs, read by the student runtime through
// src/studentSupport.js normalizeStudentProfile) and the entitlement adapter
// My Math Path's server uses (supportEntitlements.mjs). Both now read the same
// function — effectiveFlatSupportProfile — so the same student resolves the
// same way on an assignment, in a rich tool or Work View, and on the Path, on
// the same day. Synthetic profiles only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSupportProjection, effectiveFlatSupportProfile } from '../../functions/shared/supportProfileModel.mjs';
import {
  CATALOG_ID_FOR_SUPPORT, SUPPORT, SUPPORT_FOR_CATALOG_ID, applicableSupports, resolveSupportEntitlements,
} from '../../functions/shared/supportEntitlements.mjs';
import { supportById } from '../../functions/shared/supportCatalog.mjs';
import { getStudentSupportPresentation, normalizeStudentProfile } from '../../src/studentSupport.js';
import { toolsEntitlementFromPath, toolsEntitlementFromProfile } from '../../src/platform/language/supportToolsEntitlement.js';

const revision = (id, number, start, accommodations, extra = {}) => ({
  id, revisionId: id, revision: number, status: 'active', effectiveStart: start,
  accommodations: accommodations.map((supportId) => ({ id: supportId, params: {}, appliesTo: [] })), modifications: [], ...extra,
});
const dayMs = (dateKey) => Date.parse(`${dateKey}T17:00:00Z`);

test('a future-dated revision switches on, on the Path and on assignments, the same day', () => {
  // Saved on Oct 1 (current: read aloud only); Oct 10 adds vocabulary, steps and Spanish.
  const profile = buildSupportProjection({
    revisions: [
      revision('r1', 1, '2026-08-17', ['text-to-speech']),
      revision('r2', 2, '2026-10-10', ['text-to-speech', 'glossary-lookup', 'chunked-directions'], { translationLanguage: 'es' }),
    ],
    todayKey: '2026-10-01',
  });
  // The flat keys stored beside the plan still describe Oct 1.
  assert.deepEqual(profile.accommodations, ['text-to-speech']);
  for (const [day, expectTools] of [['2026-10-09', false], ['2026-10-10', true]]) {
    const nowValue = dayMs(day);
    const student = normalizeStudentProfile(profile, { nowValue });
    const path = resolveSupportEntitlements(profile, { nowValue });
    assert.equal(path.granted[SUPPORT.GLOSSARY], expectTools, `Path glossary on ${day}`);
    assert.equal(path.granted[SUPPORT.CHUNKED_DIRECTIONS], expectTools, `Path steps on ${day}`);
    assert.equal(path.granted[SUPPORT.TRANSLATION], expectTools, `Path translation on ${day}`);
    assert.equal(student.accommodations.includes('glossary-lookup'), expectTools, `assignment glossary on ${day}`);
    assert.equal(student.translationLanguage, expectTools ? 'es' : null);
    // The language tray agrees, from either side.
    const fromProfile = toolsEntitlementFromProfile(profile, { nowValue }).tools;
    const fromPath = toolsEntitlementFromPath({
      applicableSupports: applicableSupports(path, { prompt: 'Explain.' }),
      translationLanguage: path.translationLanguage,
    }).tools;
    assert.deepEqual(fromPath, fromProfile, `tray on ${day}`);
  }
});

test('an inactive revision switches every support off everywhere', () => {
  const profile = buildSupportProjection({
    revisions: [revision('r1', 1, '2026-08-17', ['text-to-speech', 'glossary-lookup']), { ...revision('r2', 2, '2026-10-01', []), status: 'inactive' }],
    todayKey: '2026-10-05',
  });
  const nowValue = dayMs('2026-10-05');
  assert.deepEqual(resolveSupportEntitlements(profile, { nowValue }).authorized, []);
  assert.deepEqual(normalizeStudentProfile(profile, { nowValue }).accommodations, []);
  assert.deepEqual(toolsEntitlementFromProfile(profile, { nowValue }).tools, []);
});

test('every catalog id the adapter knows maps both ways, and each grants the same thing on both sides', () => {
  Object.entries(CATALOG_ID_FOR_SUPPORT).forEach(([canonical, catalogId]) => {
    assert.ok(supportById(catalogId), `${catalogId} is in the catalog`);
    assert.equal(SUPPORT_FOR_CATALOG_ID[catalogId], canonical);
  });
  const presentation = (ids) => getStudentSupportPresentation({ accommodations: ids });
  [
    ['text-to-speech', SUPPORT.TEXT_TO_SPEECH, 'textToSpeech'],
    ['high-contrast', SUPPORT.HIGH_CONTRAST, 'highContrast'],
    ['large-text', SUPPORT.LARGE_TEXT, 'largeText'],
    ['visual-chunking', SUPPORT.VISUAL_CHUNKING, 'visualChunking'],
    ['declutter-ui', SUPPORT.DECLUTTER, 'declutter'],
    ['algebra-auto-apply', SUPPORT.ALGEBRA_AUTO_APPLY, 'algebraAutoApply'],
  ].forEach(([catalogId, canonical, presentationKey]) => {
    const profile = buildSupportProjection({ revisions: [revision('r1', 1, '2026-08-17', [catalogId])], todayKey: '2026-10-01' });
    const nowValue = dayMs('2026-10-01');
    assert.equal(resolveSupportEntitlements(profile, { nowValue }).granted[canonical], true, `Path: ${catalogId}`);
    assert.equal(presentation(normalizeStudentProfile(profile, { nowValue }).accommodations)[presentationKey], true, `assignment: ${catalogId}`);
  });
});

test('translation is derived from the language — configured once, recorded like any other support', () => {
  const profile = buildSupportProjection({ revisions: [revision('r1', 1, '2026-08-17', [], { translationLanguage: 'es' })], todayKey: '2026-10-01' });
  assert.ok(profile.supportPlan.entitledIds.includes('translation'), 'the rules see it');
  assert.ok(!profile.accommodations.includes('translation'), 'never a ticked support');
  const english = buildSupportProjection({ revisions: [revision('r1', 1, '2026-08-17', [], { translationLanguage: 'en' })], todayKey: '2026-10-01' });
  assert.ok(!english.supportPlan.entitledIds.includes('translation'));
  assert.equal(resolveSupportEntitlements({ translationLanguage: 'es' }).granted[SUPPORT.TRANSLATION], true, 'legacy flat profile');
  assert.equal(resolveSupportEntitlements({ translationLanguage: 'en-US' }).granted[SUPPORT.TRANSLATION], false);
  // The flat view both resolvers share.
  assert.equal(effectiveFlatSupportProfile(profile, { nowValue: dayMs('2026-10-01') }).translationLanguage, 'es');
});

test('the Path server and the student runtime read the one shared resolver — no third copy', () => {
  const entitlements = readFileSync(new URL('../../functions/shared/supportEntitlements.mjs', import.meta.url), 'utf8');
  assert.match(entitlements, /import \{ effectiveFlatSupportProfile, translationLanguageOf \} from '\.\/supportProfileModel\.mjs';/);
  assert.match(entitlements, /const profile = structured \? stored : effectiveFlatSupportProfile\(stored, \{ nowValue \}\);/);
  const runtime = readFileSync(new URL('../../src/studentSupport.js', import.meta.url), 'utf8');
  assert.match(runtime, /const flat = effectiveFlatSupportProfile\(safeProfile, \{ nowValue \}\);/);
  // The Path client receives the student's own applicable supports.
  const mathPath = readFileSync(new URL('../../functions/lib/mathPath.js', import.meta.url), 'utf8');
  assert.match(mathPath, /applicableSupports: \(Array\.isArray\(question\.applicableSupports\) \? question\.applicableSupports : \[\]\)/);
  assert.match(mathPath, /supportLanguage: /);
});
