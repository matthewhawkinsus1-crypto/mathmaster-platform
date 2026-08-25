import test from 'node:test';
import assert from 'node:assert/strict';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

const EXPECTED_NATIVE_SKILLS = new Set([
  'numberQuantity',
  'algebra',
  'functions',
  'geometry',
  'statisticsProbability',
  'realNumberProperties',
  'realNumberProblemSolving',
  'ratioProportionPercent',
  'writingAlgebraicExpressions',
  'simpleEquationsInequalities',
  'measurementUnitsConversion',
  'linesAnglesShapes',
  'perimeterCircumferenceArea',
  'surfaceAreaVolume',
  'coordinatePlane',
  'pythagoreanTheorem',
  'scatterplots',
]);

test('ACT compiler emits the completed 136-family V2.1 release with routing', async () => {
  const {
    ACT_NATIVE_ROUTING_PREDICATES,
    compileActProductionSeed,
  } = await import('../../scripts/lib/act-production-seed.mjs');
  const compiled = await compileActProductionSeed();

  assert.equal(compiled.framework, 'act');
  assert.equal(compiled.releaseTarget, RELEASE);
  assert.equal(compiled.items.length, 136);
  assert.deepEqual(
    new Set(compiled.items.map((item) => item.assessmentContext.domainId)),
    new Set(['preparingHigherMath', 'essentialSkills']),
  );
  assert.deepEqual(new Set(Object.keys(ACT_NATIVE_ROUTING_PREDICATES)), EXPECTED_NATIVE_SKILLS);
  assert.deepEqual(compiled.unroutedItemIds, []);

  for (const item of compiled.items) {
    assert.equal(item.assessmentItemFormat, 'multipleChoice');
    assert.equal(item.choices?.length, 4);
    assert.equal(item.ccmrAuthenticLanguage?.answerChoiceCount, 4);
    assert.equal(item.ccmrAuthenticLanguage?.version, '2.1');
    assert.equal(item.ccmrAuthenticLanguage?.authored, true);
    assert.equal(item.ccmrContentRelease, RELEASE);
    assert.equal(item.assessmentContext?.framework, 'act');
    assert.ok(item.alignmentKeys?.some((key) => String(key).startsWith('texas:')));
    assert.equal(item.routingAlignmentProvenance?.framework, 'act');
    assert.ok(EXPECTED_NATIVE_SKILLS.has(item.routingAlignmentProvenance?.nativeSkillId));
  }
});

test('ACT production compiler is deterministic', async () => {
  const { compileActProductionSeed } = await import('../../scripts/lib/act-production-seed.mjs');
  assert.deepEqual(await compileActProductionSeed(), await compileActProductionSeed());
});
