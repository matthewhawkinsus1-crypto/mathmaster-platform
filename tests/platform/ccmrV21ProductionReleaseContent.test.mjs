import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';
const FRAMEWORKS = ['act', 'digitalSAT', 'tsia2'];
const UNIFIED_WRITE = 'node scripts/build-ccmr-v2-1-production-release.mjs --write';
const UNIFIED_CHECK = 'node scripts/build-ccmr-v2-1-production-release.mjs --check';

test('coordinator compiles exactly SAT ACT TSIA2 and passes integration audit', async () => {
  const { compileCcmrV21ProductionRelease } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const release = await compileCcmrV21ProductionRelease();

  assert.deepEqual(Object.keys(release.packages).sort(), FRAMEWORKS);
  assert.deepEqual(release.audit.failures, []);
  assert.deepEqual(release.audit.warnings, []);
  assert.equal(release.summary.releaseTarget, RELEASE);
  assert.deepEqual(Object.keys(release.summary.frameworks).sort(), FRAMEWORKS);

  assert.equal(release.packages.digitalSAT.releaseTarget, RELEASE);
  assert.equal(release.packages.act.releaseTarget, RELEASE);
  assert.equal(release.packages.tsia2.releaseTarget, RELEASE);
  assert.equal(release.packages.digitalSAT.unroutedItemIds.length, 0);
  assert.equal(release.packages.act.unroutedItemIds.length, 0);
  assert.equal(release.packages.tsia2.unroutedItemIds.length, 0);
});

test('canonical disk package JSON is deterministic, generated, and newline terminated', async () => {
  const {
    compileCcmrV21ProductionRelease,
    canonicalPackageJson,
    diskPackageFor,
  } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const { packages } = await compileCcmrV21ProductionRelease();

  for (const framework of FRAMEWORKS) {
    const diskPackage = diskPackageFor(packages[framework]);
    const first = canonicalPackageJson(diskPackage);
    const second = canonicalPackageJson(diskPackageFor(packages[framework]));
    assert.equal(first, second, `${framework}: canonical JSON must be deterministic`);
    assert.ok(first.endsWith('\n'), `${framework}: canonical JSON must end with newline`);
    assert.equal(diskPackage.schemaVersion, 2);
    assert.equal(diskPackage.artifactType, 'pathQuestionBankSeed');
    assert.equal(diskPackage.framework, framework);
    assert.equal(diskPackage.releaseTarget, RELEASE);
    assert.equal(diskPackage.generatedBy, 'scripts/build-ccmr-v2-1-production-release.mjs');
    assert.ok(Array.isArray(diskPackage.documents) && diskPackage.documents.length > 0);
    assert.equal(diskPackage.releaseSummary.documents, diskPackage.documents.length);
    assert.deepEqual(diskPackage.releaseSummary.domains, packages[framework].domains);
    assert.equal('items' in diskPackage, false, `${framework}: disk package uses documents, not compiler-only items`);
  }
});

test('write plan contains exactly six SAT ACT TSIA2 mirrors and never ASVAB', async () => {
  const {
    compileCcmrV21ProductionRelease,
    buildCcmrV21ProductionWritePlan,
  } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const { packages } = await compileCcmrV21ProductionRelease();
  const plan = buildCcmrV21ProductionWritePlan(packages);

  assert.equal(plan.length, 6);
  assert.equal(new Set(plan.map((entry) => entry.path)).size, 6);
  assert.equal(plan.filter((entry) => /digitalSAT_pathQuestionBank_seed\.json$/.test(entry.path)).length, 2);
  assert.equal(plan.filter((entry) => /act_pathQuestionBank_seed\.json$/.test(entry.path)).length, 2);
  assert.equal(plan.filter((entry) => /tsia2_pathQuestionBank_seed\.json$/.test(entry.path)).length, 2);
  assert.ok(plan.every((entry) => !/asvab/i.test(entry.path)));
  assert.ok(plan.every((entry) => entry.content.endsWith('\n')));
});

test('all six committed production mirrors exactly match regenerated CCMR V2.1 packages', async () => {
  const {
    compileCcmrV21ProductionRelease,
    compareCommittedProductionMirrors,
  } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const { packages } = await compileCcmrV21ProductionRelease();
  const report = compareCommittedProductionMirrors(packages);

  assert.deepEqual(report.failures, []);
  assert.deepEqual(Object.keys(report.statusByFramework).sort(), FRAMEWORKS);
  for (const framework of FRAMEWORKS) {
    const status = report.statusByFramework[framework];
    assert.equal(status.rootMirrorMatch, true, `${framework}: root production mirror drifted`);
    assert.equal(status.functionsMirrorMatch, true, `${framework}: Functions production mirror drifted`);
    assert.equal(status.mirrorsEquivalent, true, `${framework}: root and Functions mirrors diverged`);
    assert.equal(status.committedMatchesRegenerated, true, `${framework}: committed mirrors do not match regenerated V2.1 package`);
  }
});

test('coordinator rejects package sets that are not exactly the three coordinated frameworks before building a write plan', async () => {
  const {
    compileCcmrV21ProductionRelease,
    buildCcmrV21ProductionWritePlan,
  } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const { packages } = await compileCcmrV21ProductionRelease();
  const invalid = { ...packages, asvab: { framework: 'asvab', items: [] } };

  assert.throws(
    () => buildCcmrV21ProductionWritePlan(invalid),
    /exactly.*digitalSAT.*act.*tsia2|asvab.*not/i,
  );
});

test('Firebase predeploy uses the unified CCMR writer and never the TSIA2-only writer', () => {
  const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const functions = Array.isArray(firebase.functions) ? firebase.functions : [firebase.functions];
  const defaultFunctions = functions.find((entry) => entry?.source === 'functions');
  const predeploy = defaultFunctions?.predeploy || [];

  assert.ok(predeploy.includes(UNIFIED_WRITE), `functions predeploy must run: ${UNIFIED_WRITE}`);
  assert.ok(!predeploy.some((value) => value.includes('build-tsia2-production-seed.mjs --write')),
    'functions predeploy must not regenerate TSIA2 independently');
});

test('release CI checks all three authored frameworks and never rewrites production seeds', () => {
  const workflow = fs.readFileSync('.github/workflows/ccmr-v2-1-release-integration-audit.yml', 'utf8');
  const requiredChecks = [
    'node scripts/build-digital-sat-v2-1.mjs --release --check',
    'node scripts/build-act-v2-1.mjs --release --check',
    'node scripts/build-tsia2-v2-1.mjs --release --check',
    UNIFIED_CHECK,
  ];

  for (const command of requiredChecks) {
    assert.ok(workflow.includes(command), `release CI must run: ${command}`);
  }
  assert.ok(!workflow.includes(UNIFIED_WRITE), 'release CI must never rewrite coordinated production seeds');
  assert.ok(!workflow.includes('node scripts/build-tsia2-production-seed.mjs --write'),
    'release CI must never run the TSIA2-only writer');
});
