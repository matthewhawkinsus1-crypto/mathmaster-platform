import fs from 'node:fs';
import path from 'node:path';
import { compileDigitalSatProductionSeed, digitalSatProductionSeedPaths } from './digital-sat-production-seed.mjs';
import { compileActProductionSeed, actProductionSeedPaths } from './act-production-seed.mjs';
import { compileTsia2ProductionSeed, tsia2ProductionSeedPaths } from './tsia2-production-seed.mjs';
import {
  auditCcmrV21ReleaseIntegration,
  CCMR_V21_INTEGRATED_FRAMEWORKS,
  CCMR_V21_RELEASE_TARGET,
} from './ccmr-v2-1-release-integration.mjs';

const EXPECTED_FRAMEWORK_KEYS = [...CCMR_V21_INTEGRATED_FRAMEWORKS].sort();

export const productionSeedPathsByFramework = Object.freeze({
  digitalSAT: digitalSatProductionSeedPaths,
  act: actProductionSeedPaths,
  tsia2: tsia2ProductionSeedPaths,
});

const roleOf = (item) => item?.ccmrFamilyRole
  || (Number(item?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');

const assertCoordinatedPackageKeys = (packages = {}) => {
  const actual = Object.keys(packages).sort();
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_FRAMEWORK_KEYS)) {
    throw new Error(`CCMR V2.1 production release must contain exactly digitalSAT, act, and tsia2; received ${actual.join(', ') || '(none)'}. ASVAB is not coordinated by this release.`);
  }
};

const formatAuditFailures = (failures) => failures
  .map((failure, index) => `${index + 1}. ${typeof failure === 'string' ? failure : JSON.stringify(failure)}`)
  .join('\n');

const buildReleaseSummary = (packages, audit) => ({
  releaseTarget: CCMR_V21_RELEASE_TARGET,
  frameworks: Object.fromEntries(CCMR_V21_INTEGRATED_FRAMEWORKS.map((framework) => {
    const pkg = packages[framework];
    return [framework, {
      documents: pkg.items.length,
      direct: pkg.items.filter((item) => roleOf(item) === 'direct').length,
      challenge: pkg.items.filter((item) => roleOf(item) === 'challenge').length,
      domains: pkg.domains,
      routeable: audit.frameworkSummaries?.[framework]?.routeable ?? 0,
    }];
  })),
  totalDocuments: CCMR_V21_INTEGRATED_FRAMEWORKS
    .reduce((sum, framework) => sum + packages[framework].items.length, 0),
  crossFrameworkClonePairs: audit.crossFrameworkClonePairs.length,
});

export const diskPackageFor = (compiled) => {
  if (!compiled || !CCMR_V21_INTEGRATED_FRAMEWORKS.includes(compiled.framework)) {
    throw new Error(`Cannot shape unsupported production package ${String(compiled?.framework || '(missing)')}.`);
  }
  if (compiled.releaseTarget !== CCMR_V21_RELEASE_TARGET) {
    throw new Error(`${compiled.framework}: wrong release target ${String(compiled.releaseTarget || '(missing)')}.`);
  }
  if (!Array.isArray(compiled.items) || compiled.items.length === 0) {
    throw new Error(`${compiled.framework}: production compiler returned no items.`);
  }

  return {
    schemaVersion: 2,
    artifactType: 'pathQuestionBankSeed',
    framework: compiled.framework,
    releaseTarget: compiled.releaseTarget,
    sourceOfTruth: compiled.sourceOfTruth,
    generatedBy: 'scripts/build-ccmr-v2-1-production-release.mjs',
    documents: compiled.items,
    releaseSummary: {
      domains: compiled.domains,
      documents: compiled.items.length,
    },
  };
};

export const canonicalPackageJson = (packageValue) => `${JSON.stringify(packageValue, null, 2)}\n`;

export async function compileCcmrV21ProductionRelease() {
  const [digitalSAT, act, tsia2] = await Promise.all([
    compileDigitalSatProductionSeed(),
    compileActProductionSeed(),
    compileTsia2ProductionSeed(),
  ]);
  const packages = { digitalSAT, act, tsia2 };
  assertCoordinatedPackageKeys(packages);

  for (const framework of CCMR_V21_INTEGRATED_FRAMEWORKS) {
    const pkg = packages[framework];
    if (pkg.releaseTarget !== CCMR_V21_RELEASE_TARGET) {
      throw new Error(`${framework}: compiler release target mismatch.`);
    }
    if (Array.isArray(pkg.unroutedItemIds) && pkg.unroutedItemIds.length) {
      throw new Error(`${framework}: unrouted production items: ${pkg.unroutedItemIds.join(', ')}`);
    }
  }

  const audit = auditCcmrV21ReleaseIntegration(packages);
  if (audit.failures.length) {
    throw new Error(`CCMR V2.1 integrated production audit failed:\n${formatAuditFailures(audit.failures)}`);
  }

  return {
    packages,
    audit,
    summary: buildReleaseSummary(packages, audit),
  };
}

export function buildCcmrV21ProductionWritePlan(packages) {
  assertCoordinatedPackageKeys(packages);
  const audit = auditCcmrV21ReleaseIntegration(packages);
  if (audit.failures.length) {
    throw new Error(`Refusing to build CCMR V2.1 write plan because integration audit failed:\n${formatAuditFailures(audit.failures)}`);
  }

  const plan = [];
  for (const framework of CCMR_V21_INTEGRATED_FRAMEWORKS) {
    const compiled = packages[framework];
    const content = canonicalPackageJson(diskPackageFor(compiled));
    const destinations = productionSeedPathsByFramework[framework];
    for (const destination of [destinations.root, destinations.functions]) {
      plan.push({
        framework,
        path: destination,
        content,
      });
    }
  }
  return plan;
}

const parsedCanonicalFile = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return canonicalPackageJson(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error) };
  }
};

export function compareCommittedProductionMirrors(compiledPackages) {
  assertCoordinatedPackageKeys(compiledPackages);
  const failures = [];
  const statusByFramework = {};

  for (const framework of CCMR_V21_INTEGRATED_FRAMEWORKS) {
    const expected = canonicalPackageJson(diskPackageFor(compiledPackages[framework]));
    const paths = productionSeedPathsByFramework[framework];
    const rootCanonical = parsedCanonicalFile(paths.root);
    const functionsCanonical = parsedCanonicalFile(paths.functions);

    const rootExistsAndParses = typeof rootCanonical === 'string';
    const functionsExistsAndParses = typeof functionsCanonical === 'string';
    const rootMirrorMatch = rootExistsAndParses && rootCanonical === expected;
    const functionsMirrorMatch = functionsExistsAndParses && functionsCanonical === expected;
    const mirrorsEquivalent = rootExistsAndParses
      && functionsExistsAndParses
      && rootCanonical === functionsCanonical;
    const committedMatchesRegenerated = rootMirrorMatch && functionsMirrorMatch;

    if (!rootMirrorMatch) {
      failures.push({
        framework,
        kind: 'root-drift',
        path: paths.root,
        detail: rootCanonical === null
          ? 'missing file'
          : typeof rootCanonical === 'object'
            ? `invalid JSON: ${rootCanonical.parseError}`
            : 'committed root seed differs from regenerated V2.1 package',
      });
    }
    if (!functionsMirrorMatch) {
      failures.push({
        framework,
        kind: 'functions-drift',
        path: paths.functions,
        detail: functionsCanonical === null
          ? 'missing file'
          : typeof functionsCanonical === 'object'
            ? `invalid JSON: ${functionsCanonical.parseError}`
            : 'committed Functions seed differs from regenerated V2.1 package',
      });
    }
    if (!mirrorsEquivalent) {
      failures.push({
        framework,
        kind: 'mirror-divergence',
        detail: 'root and Functions committed seed mirrors differ',
      });
    }

    statusByFramework[framework] = {
      rootMirrorMatch,
      functionsMirrorMatch,
      mirrorsEquivalent,
      committedMatchesRegenerated,
    };
  }

  return { failures, statusByFramework };
}

const atomicWriteText = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
};

export function writeCcmrV21ProductionRelease(compiledPackages) {
  const plan = buildCcmrV21ProductionWritePlan(compiledPackages);
  // All package validation and all six destination strings exist before the
  // first filesystem mutation. This prevents a failed framework compile/audit
  // from producing a partial multi-framework release.
  for (const entry of plan) atomicWriteText(entry.path, entry.content);
  return {
    writtenFiles: plan.map((entry) => entry.path),
    frameworks: [...CCMR_V21_INTEGRATED_FRAMEWORKS],
  };
}
