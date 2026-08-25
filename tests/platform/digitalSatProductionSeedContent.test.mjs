import test from 'node:test';
import assert from 'node:assert/strict';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';
const EXPECTED_RESPONSE_ECOLOGY = Object.freeze({
  total: 664,
  mcq: 498,
  spr: 166,
  byDomain: Object.freeze({
    advancedMath: Object.freeze({ total: 328, mcq: 246, spr: 82 }),
    algebra: Object.freeze({ total: 200, mcq: 150, spr: 50 }),
    geometryTrigonometry: Object.freeze({ total: 32, mcq: 24, spr: 8 }),
    problemSolvingData: Object.freeze({ total: 104, mcq: 78, spr: 26 }),
  }),
});

const formatOf = (item) => String(item?.assessmentItemFormat || '').toLowerCase();

test('Digital SAT production compiler emits only routeable authored V2.1 content', async () => {
  const { compileDigitalSatProductionSeed } = await import('../../scripts/lib/digital-sat-production-seed.mjs');
  const compiled = await compileDigitalSatProductionSeed();
  assert.equal(compiled.framework, 'digitalSAT');
  assert.equal(compiled.releaseTarget, RELEASE);
  assert.ok(compiled.items.length > 0);
  assert.deepEqual(
    new Set(compiled.items.map((item) => item.assessmentContext.domainId)),
    new Set(['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']),
  );
  assert.deepEqual(compiled.unroutedItemIds, []);
  for (const item of compiled.items) {
    assert.equal(item.ccmrAuthenticLanguage?.version, '2.1');
    assert.equal(item.ccmrAuthenticLanguage?.authored, true);
    assert.equal(item.ccmrContentRelease, RELEASE);
    assert.equal(item.assessmentContext?.framework, 'digitalSAT');
    assert.ok(item.alignmentKeys?.some((key) => String(key).startsWith('texas:')));
  }
});

test('Digital SAT production response ecology is 75 percent MCQ in every domain', async () => {
  const { compileDigitalSatProductionSeed } = await import('../../scripts/lib/digital-sat-production-seed.mjs');
  const { items } = await compileDigitalSatProductionSeed();

  const mcq = items.filter((item) => formatOf(item) === 'multiplechoice');
  const spr = items.filter((item) => formatOf(item) === 'studentproducedresponse');
  assert.equal(items.length, EXPECTED_RESPONSE_ECOLOGY.total);
  assert.equal(mcq.length, EXPECTED_RESPONSE_ECOLOGY.mcq);
  assert.equal(spr.length, EXPECTED_RESPONSE_ECOLOGY.spr);

  for (const [domainId, expected] of Object.entries(EXPECTED_RESPONSE_ECOLOGY.byDomain)) {
    const domainItems = items.filter((item) => item?.assessmentContext?.domainId === domainId);
    assert.equal(domainItems.length, expected.total, `${domainId}: unexpected total item count`);
    assert.equal(
      domainItems.filter((item) => formatOf(item) === 'multiplechoice').length,
      expected.mcq,
      `${domainId}: unexpected MCQ count`,
    );
    assert.equal(
      domainItems.filter((item) => formatOf(item) === 'studentproducedresponse').length,
      expected.spr,
      `${domainId}: unexpected SPR count`,
    );
  }
});

test('every Digital SAT MCQ has four distinct keyed choices', async () => {
  const { compileDigitalSatProductionSeed } = await import('../../scripts/lib/digital-sat-production-seed.mjs');
  const { items } = await compileDigitalSatProductionSeed();

  for (const item of items.filter((candidate) => formatOf(candidate) === 'multiplechoice')) {
    assert.equal(item.choices?.length, 4, `${item.id}: expected exactly four choices`);
    const ids = (item.choices || []).map((choice) => String(choice?.id || ''));
    const labels = (item.choices || []).map((choice) => String(choice?.label || '').trim());
    assert.equal(new Set(ids).size, 4, `${item.id}: choice ids must be unique`);
    assert.equal(new Set(labels).size, 4, `${item.id}: authored choice labels must be distinct`);
    assert.ok(ids.every(Boolean), `${item.id}: every choice needs an id`);
    assert.ok(labels.every(Boolean), `${item.id}: every choice needs a label`);

    const choiceField = (item.responseFields || []).find((field) => field?.inputProfile === 'choice');
    assert.ok(choiceField, `${item.id}: MCQ needs a choice response field`);
    assert.ok(ids.includes(String(choiceField.expected || '')), `${item.id}: expected choice must reference one authored choice`);
  }
});

test('Digital SAT production compiler is deterministic', async () => {
  const { compileDigitalSatProductionSeed } = await import('../../scripts/lib/digital-sat-production-seed.mjs');
  assert.deepEqual(await compileDigitalSatProductionSeed(), await compileDigitalSatProductionSeed());
});
