import test from 'node:test';
import assert from 'node:assert/strict';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

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

test('Digital SAT production compiler is deterministic', async () => {
  const { compileDigitalSatProductionSeed } = await import('../../scripts/lib/digital-sat-production-seed.mjs');
  assert.deepEqual(await compileDigitalSatProductionSeed(), await compileDigitalSatProductionSeed());
});
