import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTsia2ProductionSeed } from '../../scripts/lib/tsia2-production-seed.mjs';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';
const REQUIRED_DOMAINS = [
  'quantitativeReasoning',
  'algebraicReasoning',
  'geometricSpatial',
  'probabilisticStatistical',
];
const isLowerGradeRoutingKey = (key) => /^texas:(?:6|7|8)\./.test(String(key));

test('TSIA2 V2.1 production compiler emits the complete native bank with legitimate routing alignments', async () => {
  const result = await compileTsia2ProductionSeed();
  const items = result.items;

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.artifactType, 'pathQuestionBankSeed');
  assert.equal(result.framework, 'tsia2');
  assert.equal(result.releaseTarget, RELEASE);
  assert.equal(result.sourceOfTruth, 'drafts/ccmr-v2.1/tsia2');
  assert.equal(items.length, 200);
  assert.equal(new Set(items.map((item) => item.id)).size, 200);
  assert.equal(items.filter((item) => item.ccmrFamilyRole === 'direct').length, 125);
  assert.equal(items.filter((item) => item.ccmrFamilyRole === 'challenge').length, 75);
  assert.equal(new Set(items.map((item) => item.assessmentContext?.nativeSkillId)).size, 25);

  for (const item of items) {
    assert.equal(item.assessmentContext?.framework, 'tsia2', `${item.id}: wrong framework`);
    assert.equal(item.assessmentContext?.examStyle, true, `${item.id}: examStyle must remain true`);
    assert.ok(['crcAndDiagnostic', 'diagnosticOnly'].includes(item.assessmentContext?.tsia2TestScope), `${item.id}: missing TSIA2 scope`);
    assert.ok(Array.isArray(item.alignmentKeys) && item.alignmentKeys.length > 0, `${item.id}: production record needs routing alignments`);
    assert.ok(item.alignmentKeys.every((key) => /^texas:/.test(String(key))), `${item.id}: routing alignments must be Texas crosswalk keys`);
    assert.equal(item.routingAlignmentProvenance?.framework, 'tsia2', `${item.id}: missing routing provenance`);
    assert.equal(item.routingAlignmentProvenance?.derivation, 'official-reference-crosswalk', `${item.id}: routing must come from the official reference crosswalk`);
    assert.equal(item.routingAlignmentProvenance?.nativeSkillId, item.assessmentContext.nativeSkillId, `${item.id}: provenance/native skill mismatch`);
    assert.equal(item.ccmrAuthenticLanguage?.version, '2.1', `${item.id}: wrong authentic-language version`);
    assert.equal(item.ccmrAuthenticLanguage?.authored, true, `${item.id}: item must remain authored V2.1 content`);
    assert.equal(item.ccmrContentRelease, RELEASE, `${item.id}: wrong production content release`);
    assert.doesNotMatch(item.id, /^mm_tsi_(?!a2)/i, `${item.id}: legacy TEKS-first ID survived`);
    assert.doesNotMatch(String(item.prompt || ''), /placement-level mathematics|best demonstrates the required/i, `${item.id}: legacy meta wording survived`);

    if (item.assessmentContext.tsia2TestScope === 'diagnosticOnly') {
      assert.ok(item.alignmentKeys.every(isLowerGradeRoutingKey), `${item.id}: Diagnostic-only content must route only through Grade 6-8 foundations`);
    }
  }
});

test('TSIA2 production compiler covers every official native skill with at least one routing standard', async () => {
  const result = await compileTsia2ProductionSeed();
  assert.equal(result.nativeSkills.length, 25);
  assert.deepEqual(result.unroutedNativeSkills, []);
  assert.ok(result.nativeSkills.every((skill) => skill.routingAlignmentKeys.length > 0));
  assert.equal(result.diagnosticOnlyFamilies, 56);
  assert.equal(result.crcAndDiagnosticFamilies, 144);
});

test('TSIA2 production compiler exposes the standardized deterministic release package contract', async () => {
  const result = await compileTsia2ProductionSeed();
  const itemIds = result.items.map((item) => item.id);

  assert.deepEqual(result.unroutedItemIds, []);
  assert.deepEqual(new Set(Object.keys(result.domains)), new Set(REQUIRED_DOMAINS));
  assert.deepEqual(itemIds, [...itemIds].sort((a, b) => String(a).localeCompare(String(b))));
  assert.deepEqual(result, await compileTsia2ProductionSeed(), 'production compilation must be deterministic');

  assert.equal(result.summary.items, 200);
  assert.equal(result.summary.direct, 125);
  assert.equal(result.summary.challenge, 75);
  assert.equal(result.summary.crcAndDiagnostic, 144);
  assert.equal(result.summary.diagnosticOnly, 56);

  const domainTotal = Object.values(result.domains).reduce((sum, domain) => sum + domain.items, 0);
  assert.equal(domainTotal, 200);
  for (const domainId of REQUIRED_DOMAINS) {
    const summary = result.domains[domainId];
    assert.ok(summary.items > 0, `${domainId}: expected production families`);
    assert.equal(summary.items, summary.direct + summary.challenge, `${domainId}: direct/challenge total mismatch`);
    assert.equal(summary.items, summary.crcAndDiagnostic + summary.diagnosticOnly, `${domainId}: scope total mismatch`);
  }
});
