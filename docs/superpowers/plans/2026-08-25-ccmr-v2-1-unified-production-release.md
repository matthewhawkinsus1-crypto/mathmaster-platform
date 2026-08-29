# CCMR V2.1 Unified Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Digital SAT, ACT, and TSIA2 V2.1 authoring banks compile deterministically into the actual deployable MathMaster Path seeds, pass one cross-framework release gate, and safely retire stale SAT/ACT/TSIA2 sessions without touching ASVAB.

**Architecture:** Keep framework-specific compilation isolated in `scripts/lib/*-production-seed.mjs`, then coordinate the three compiled packages through a pure cross-framework auditor and one release coordinator. The coordinator validates all packages in memory before writing any of the six root/Functions seed mirrors; Firebase predeploy runs the unified writer, while runtime release helpers persist and enforce `ccmrContentRelease` for SAT, ACT, and TSIA2 only.

**Tech Stack:** Node.js ESM, `node:test`, existing MathMaster assessment crosswalk/reference modules, Firebase Functions/Firestore, GitHub Actions YAML.

**Spec:** `docs/superpowers/specs/2026-08-25-ccmr-v2-1-unified-production-release-design.md`

## Global Constraints

- Release target is exactly `ccmr-fidelity-v2.1-authentic-language`.
- Coordinated frameworks are exactly `digitalSAT`, `act`, and `tsia2`.
- ASVAB is out of scope: do not read, compile, rewrite, gate, retire, or modify ASVAB content or runtime state.
- Approved SAT/ACT/TSIA2 prompts, expected answers, distractors, generators, task types, representations, difficulty bands, DOK values, and family roles must not be rewritten by production compilers.
- Native assessment source banks remain free of fabricated `texas:*` keys; routing alignments are added only by production compilation through legitimate existing references/crosswalks or explicit reviewed foundational mappings.
- Every compiled production item must be routeable by existing Path selection, carry `ccmrAuthenticLanguage.version === "2.1"`, `ccmrAuthenticLanguage.authored === true`, and `ccmrContentRelease === "ccmr-fidelity-v2.1-authentic-language"`.
- Root and `functions/seeds` copies for each framework must be generated from the same in-memory package and compare equal after canonical JSON parsing.
- `--check` never writes files. `--write` validates all three frameworks before writing any production mirror.
- CI never rewrites repository files.
- Expected answers remain server-side; existing sanitization remains authoritative.
- Stale-session handling applies only to SAT, ACT, and TSIA2. Non-CCMR and ASVAB sessions are unaffected.
- Use red-first TDD for every task and commit each independently green deliverable.

## File Structure

**New files**

- `scripts/lib/ccmr-v2-1-release-integration.mjs` — pure three-framework release auditor.
- `scripts/lib/digital-sat-production-seed.mjs` — Digital SAT V2.1 production compiler.
- `scripts/lib/act-production-seed.mjs` — ACT V2.1 production compiler.
- `scripts/lib/ccmr-v2-1-production-release.mjs` — unified in-memory coordinator, canonicalization, mirror comparison, and write plan.
- `scripts/build-ccmr-v2-1-production-release.mjs` — `--check` / `--write` CLI.
- `tests/platform/digitalSatProductionSeedContent.test.mjs` — SAT compiler contract.
- `tests/platform/actProductionSeedContent.test.mjs` — ACT compiler contract.
- `tests/platform/ccmrV21ProductionReleaseContent.test.mjs` — coordinator, determinism, mirror-drift contract.
- `tests/platform/ccmrV21PathBankReleaseContent.test.mjs` — generalized SAT/ACT/TSIA2 runtime release contract.

**Existing files modified**

- `tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs` — complete the existing red integrated-auditor contract.
- `scripts/lib/tsia2-production-seed.mjs` — expose the same deterministic package contract used by SAT/ACT.
- `scripts/build-tsia2-production-seed.mjs` — retain compatibility while delegating validation/package shaping to shared TSIA2 compiler output where practical.
- `functions/shared/pathBankRelease.mjs` — generalize release/session policy while preserving TSIA2 compatibility exports until callers migrate.
- `functions/index.js` — persist `ccmrContentRelease` on new CCMR sessions, reject/resume stale active sessions correctly, and call the generalized post-seed retirement hook.
- `firebase.json` — replace TSIA2-only predeploy writer with unified V2.1 production writer.
- `.github/workflows/ccmr-v2-1-release-integration-audit.yml` — run framework release builders, coordinator check, and committed-mirror verification.
- `seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json`
- `seed/pathQuestionBank/act_pathQuestionBank_seed.json`
- `seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/act_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/tsia2_pathQuestionBank_seed.json`

---

### Task 1: Complete the pure SAT + ACT + TSIA2 release auditor

**Files:**
- Create: `scripts/lib/ccmr-v2-1-release-integration.mjs`
- Modify: `tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs`

**Interfaces:**
- Produces: `CCMR_V21_RELEASE_TARGET: string`
- Produces: `CCMR_V21_INTEGRATED_FRAMEWORKS: readonly ['digitalSAT','act','tsia2']`
- Produces: `auditCcmrV21ReleaseIntegration(packages): { failures: string[], warnings: string[], frameworkSummaries: object, crossFrameworkClonePairs: object[] }`
- Consumes package shape: `{ releaseTarget, framework?, documents?: object[], items?: object[] }` keyed by framework name.

- [ ] **Step 1: Extend the existing red test with missing release invariants**

Add tests that reject duplicate `familyId`, wrong `ccmrContentRelease`, ASVAB input, and that do not flag short generic stems by themselves:

```js
test('integration gate rejects duplicate family ids and wrong content release', async () => {
  const { auditCcmrV21ReleaseIntegration } = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  const packages = validPackages();
  packages.act.documents[0].familyId = packages.digitalSAT.documents[0].familyId;
  packages.tsia2.documents[0].ccmrContentRelease = 'legacy';
  const report = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(report.failures.some((value) => /duplicate.*family/i.test(value)));
  assert.ok(report.failures.some((value) => /tsi-1.*content release/i.test(value)));
});

test('integration gate excludes ASVAB and avoids short-stem false positives', async () => {
  const { auditCcmrV21ReleaseIntegration } = await import('../../scripts/lib/ccmr-v2-1-release-integration.mjs');
  const packages = validPackages();
  packages.asvab = { releaseTarget: RELEASE_TARGET, documents: [] };
  let report = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(report.failures.some((value) => /asvab.*not.*coordinated/i.test(value)));

  delete packages.asvab;
  packages.digitalSAT.documents[0].prompt = 'What is the value of x?';
  packages.act.documents[0].prompt = 'What is the value of x?';
  report = auditCcmrV21ReleaseIntegration(packages);
  assert.ok(!report.failures.some((value) => /cross-framework.*clone/i.test(value)));
});
```

Also update the test helper `doc()` so every synthetic valid item contains the production release marker:

```js
ccmrContentRelease: RELEASE_TARGET,
```

- [ ] **Step 2: Run the auditor test and verify the intended red state**

Run:

```bash
node --test tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/ccmr-v2-1-release-integration.mjs`; no unrelated syntax/test-loader failure.

- [ ] **Step 3: Implement the minimal pure auditor**

Create `scripts/lib/ccmr-v2-1-release-integration.mjs` with this public contract and exact framework/domain policy:

```js
export const CCMR_V21_RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';
export const CCMR_V21_INTEGRATED_FRAMEWORKS = Object.freeze(['digitalSAT', 'act', 'tsia2']);

const VALID_DOMAINS = Object.freeze({
  digitalSAT: new Set(['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']),
  act: new Set(['preparingHigherMath', 'essentialSkills']),
  tsia2: new Set(['quantitativeReasoning', 'algebraicReasoning', 'geometricSpatial', 'probabilisticStatistical']),
});

const docsIn = (pkg) => Array.isArray(pkg?.documents) ? pkg.documents : Array.isArray(pkg?.items) ? pkg.items : [];
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');

export function auditCcmrV21ReleaseIntegration(packages = {}) {
  const failures = [];
  const warnings = [];
  const frameworkSummaries = {};
  const crossFrameworkClonePairs = [];
  // validate only the three allowed framework keys;
  // reject any extra key, including asvab;
  // validate releaseTarget, framework/domain, V2.1 authored/content-release markers,
  // non-empty routing, challenge provenance, global id/family uniqueness;
  // then run exact/near cross-framework clone checks.
  return { failures, warnings, frameworkSummaries, crossFrameworkClonePairs };
}
```

Implement clone normalization so generated values and numerals normalize but short generic stems are ignored:

```js
const normalizeGrammar = (text) => String(text || '')
  .toLowerCase()
  .replace(/\{\{[^}]+\}\}/g, '<value>')
  .replace(/-?\d+(?:\.\d+)?/g, '<number>')
  .replace(/\s+/g, ' ')
  .trim();

const significantTokens = (text) => normalizeGrammar(text)
  .replace(/[^a-z<>\s'-]/g, ' ')
  .split(/\s+/)
  .filter((token) => token.length > 2);
```

Exact cross-framework clone failure requires normalized grammar of at least eight significant tokens. Near-clone failure requires at least eight tokens on both items, compatible `taskType` or `representation` when those fields are present, and Jaccard similarity `>= 0.90`. Identical normalized long grammar always fails even when task metadata is absent, preserving the existing synthetic near-clone test.

- [ ] **Step 4: Run the pure auditor tests green**

Run:

```bash
node --test tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/lib/ccmr-v2-1-release-integration.mjs tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs
git commit -m "Add CCMR V2.1 cross-framework release auditor"
```

---

### Task 2: Compile Digital SAT V2.1 into a deterministic routeable production package

**Files:**
- Create: `scripts/lib/digital-sat-production-seed.mjs`
- Create: `tests/platform/digitalSatProductionSeedContent.test.mjs`
- Read-only dependency: `src/platform/ccmr/assessmentStandardReferences.js`
- Read-only dependency: `functions/shared/texasStandards.mjs`
- Read-only source: `drafts/ccmr-v2.1/digitalSAT/**`

**Interfaces:**
- Produces: `DIGITAL_SAT_PRODUCTION_RELEASE = 'ccmr-fidelity-v2.1-authentic-language'`
- Produces: `digitalSatProductionSeedPaths = { root, functions }`
- Produces: `compileDigitalSatProductionSeed(): Promise<CompiledFrameworkSeed>`
- `CompiledFrameworkSeed` shape: `{ schemaVersion, artifactType, framework, releaseTarget, sourceOfTruth, items, domains, unroutedItemIds }`.

- [ ] **Step 1: Write the failing SAT compiler contract**

Create `tests/platform/digitalSatProductionSeedContent.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

test('Digital SAT production compiler emits only routeable authored V2.1 content', async () => {
  const { compileDigitalSatProductionSeed } = await import('../../scripts/lib/digital-sat-production-seed.mjs');
  const compiled = await compileDigitalSatProductionSeed();
  assert.equal(compiled.framework, 'digitalSAT');
  assert.equal(compiled.releaseTarget, RELEASE);
  assert.ok(compiled.items.length > 0);
  assert.deepEqual(new Set(compiled.items.map((item) => item.assessmentContext.domainId)),
    new Set(['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']));
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
```

- [ ] **Step 2: Run the SAT test red**

```bash
node --test tests/platform/digitalSatProductionSeedContent.test.mjs
```

Expected: FAIL because `digital-sat-production-seed.mjs` does not exist.

- [ ] **Step 3: Implement source discovery and immutable document selection**

Create `scripts/lib/digital-sat-production-seed.mjs`. Walk `drafts/ccmr-v2.1/digitalSAT`, parse only `.v2.1.json`, and select objects where `framework === 'digitalSAT'` and `documents` is an array. Apply the same anti-clone override patches used by `scripts/build-digital-sat-v2-1.mjs` before production routing so production output matches the audited authoring release.

Use `structuredClone` before adding routing fields; never mutate parsed source objects.

- [ ] **Step 4: Implement legitimate SAT routing**

For documents that already carry `texas:*` alignment keys from TEKS-backed authored banks, preserve, deduplicate, and sort those keys.

For native SAT documents with empty routing, resolve the official SAT skill by `assessmentContext.nativeSkillId` when it equals a `DIGITAL_SAT_REFERENCES` id, otherwise by exact normalized `ccmrAuthenticLanguage.officialSkillFamily` / reference `title`. Require exactly one official reference match. Then derive Texas routes through the existing matcher:

```js
import { ALL_TEXAS_MATH_STANDARDS } from '../../functions/shared/texasStandards.mjs';
import { DIGITAL_SAT_REFERENCES, getAssessmentStandardReferences } from '../../src/platform/ccmr/assessmentStandardReferences.js';

const routeReferenceId = (referenceId) => ALL_TEXAS_MATH_STANDARDS
  .filter((standard) => standard.classification !== 'process')
  .filter((standard) => getAssessmentStandardReferences(standard.code, 'digitalSAT')
    .some((reference) => reference.id === referenceId))
  .map((standard) => standard.code)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
```

Add routing only to the compiled copy:

```js
const compileItem = (sourceItem, routingCodes) => ({
  ...sourceItem,
  alignmentKeys: routingCodes.map((code) => `texas:${code}`),
  alignments: addTexasCrosswalkAlignments(sourceItem.alignments, routingCodes),
  ccmrContentRelease: DIGITAL_SAT_PRODUCTION_RELEASE,
  routingAlignmentProvenance: {
    framework: 'digitalSAT',
    derivation: 'assessmentStandardReferences',
  },
});
```

Fail closed by adding the item id to `unroutedItemIds` when no legitimate Texas route exists.

- [ ] **Step 5: Sort and shape deterministic SAT output**

Sort `items` by `id`; sort every `alignmentKeys` array; return stable domain counts and no timestamps:

```js
return {
  schemaVersion: 2,
  artifactType: 'pathQuestionBankSeed',
  framework: 'digitalSAT',
  releaseTarget: DIGITAL_SAT_PRODUCTION_RELEASE,
  sourceOfTruth: 'drafts/ccmr-v2.1/digitalSAT',
  items: items.sort((a, b) => a.id.localeCompare(b.id)),
  domains,
  unroutedItemIds: [...new Set(unroutedItemIds)].sort(),
};
```

- [ ] **Step 6: Verify SAT compiler and SAT authoring release together**

```bash
node --test tests/platform/digitalSatProductionSeedContent.test.mjs
node scripts/build-digital-sat-v2-1.mjs --release --check
```

Expected: both PASS; compiler reports zero unrouted items.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/lib/digital-sat-production-seed.mjs tests/platform/digitalSatProductionSeedContent.test.mjs
git commit -m "Compile Digital SAT V2.1 production seed"
```

---

### Task 3: Compile ACT V2.1 into a deterministic routeable production package

**Files:**
- Create: `scripts/lib/act-production-seed.mjs`
- Create: `tests/platform/actProductionSeedContent.test.mjs`
- Read-only dependency: `src/platform/ccmr/assessmentStandardReferences.js`
- Read-only dependency: `functions/shared/texasStandards.mjs`
- Read-only source: `drafts/ccmr-v2.1/act/**`

**Interfaces:**
- Produces: `ACT_PRODUCTION_RELEASE = 'ccmr-fidelity-v2.1-authentic-language'`
- Produces: `actProductionSeedPaths = { root, functions }`
- Produces: `compileActProductionSeed(): Promise<CompiledFrameworkSeed>`

- [ ] **Step 1: Write the failing ACT compiler contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';

test('ACT compiler emits the completed 136-family V2.1 release with routing', async () => {
  const { compileActProductionSeed } = await import('../../scripts/lib/act-production-seed.mjs');
  const compiled = await compileActProductionSeed();
  assert.equal(compiled.framework, 'act');
  assert.equal(compiled.releaseTarget, RELEASE);
  assert.equal(compiled.items.length, 136);
  assert.deepEqual(new Set(compiled.items.map((item) => item.assessmentContext.domainId)),
    new Set(['preparingHigherMath', 'essentialSkills']));
  assert.deepEqual(compiled.unroutedItemIds, []);
  for (const item of compiled.items) {
    assert.equal(item.assessmentItemFormat, 'multipleChoice');
    assert.equal(item.choices?.length, 4);
    assert.equal(item.ccmrAuthenticLanguage?.answerChoiceCount, 4);
    assert.equal(item.ccmrContentRelease, RELEASE);
    assert.ok(item.alignmentKeys?.length > 0);
  }
});
```

Also add deterministic double-compile equality.

- [ ] **Step 2: Run ACT compiler test red**

```bash
node --test tests/platform/actProductionSeedContent.test.mjs
```

Expected: module-not-found failure only.

- [ ] **Step 3: Implement ACT source loading and immutable copy behavior**

Walk `drafts/ccmr-v2.1/act`, select authored bank files with `framework === 'act'` and `documents` arrays, skip mapping/completion metadata, deep-clone each document, and sort by stable `id`.

- [ ] **Step 4: Implement ACT routing by existing ACT references plus explicit native-category predicates**

Keep legitimate existing `texas:*` routes on any TEKS-backed bank. For ACT-native banks, map their official native skill areas to the existing ACT reference layer using the ACT reference `topic`, `title`, `officialCode`, and score-band descriptors already returned by `getAssessmentStandardReferences(code, 'act')`.

Use explicit predicates keyed by the actual authored `nativeSkillId` values rather than keyword-matching prompts. The required native ids are the completed mapping-ledger keys under `preparingHigherMath` and `essentialSkills`; the compiler loads those keys from the ledgers and must have exactly one reviewed predicate for every key. Example structure:

```js
const ACT_NATIVE_ROUTING_PREDICATES = Object.freeze({
  algebra: (reference) => /algebra|equation|expression|polynomial|radical|exponential/i.test(`${reference.title} ${reference.topic || ''}`),
  functions: (reference) => /function|graph/i.test(`${reference.title} ${reference.topic || ''}`),
  geometry: (reference) => /geometry|triangle|circle|angle|area|volume|trigon/i.test(`${reference.title} ${reference.topic || ''}`),
  statisticsProbability: (reference) => /statistic|data|probability|scatter/i.test(`${reference.title} ${reference.topic || ''}`),
  // add the remaining completed ledger ids explicitly in this object during implementation;
  // the compiler test requires Object.keys(ACT_NATIVE_ROUTING_PREDICATES) to equal the completed ledger ids.
});
```

The implementation step is not complete until the predicate-key set equals the completed native-skill set loaded from both ACT mapping ledgers. This avoids silent fallback or fabricated alignment.

Derive routes only from Texas standards whose existing ACT references satisfy that native-skill predicate. Sort and deduplicate resulting Texas codes. If none exist, record the item as unrouted and fail the compiler test.

- [ ] **Step 5: Preserve ACT-specific production invariants**

For every compiled item preserve `assessmentContext.modeling`; force no new modeling tags. Validate 4-choice enhanced ACT rules, direct/challenge provenance, framework/domain identity, and add only:

```js
ccmrContentRelease: ACT_PRODUCTION_RELEASE,
routingAlignmentProvenance: {
  framework: 'act',
  nativeSkillId,
  derivation: 'assessmentStandardReferences',
},
```

- [ ] **Step 6: Run ACT compiler and ACT authoring release green**

```bash
node --test tests/platform/actProductionSeedContent.test.mjs
node scripts/build-act-v2-1.mjs --release --check
```

Expected: PASS, 136 compiled families, zero unrouted items.

- [ ] **Step 7: Commit Task 3**

```bash
git add scripts/lib/act-production-seed.mjs tests/platform/actProductionSeedContent.test.mjs
git commit -m "Compile ACT V2.1 production seed"
```

---

### Task 4: Standardize TSIA2 on the same production-package contract

**Files:**
- Modify: `scripts/lib/tsia2-production-seed.mjs`
- Modify: `scripts/build-tsia2-production-seed.mjs`
- Test: existing TSIA2 production tests under `tests/platform/tsia2*Production*` plus add assertions to `tests/platform/ccmrV21ProductionReleaseContent.test.mjs` in Task 5.

**Interfaces:**
- Preserve: `compileTsia2ProductionSeed()`
- Preserve: `tsia2ProductionSeedPaths`
- Return keys standardized with SAT/ACT: `{ schemaVersion, artifactType, framework, releaseTarget, sourceOfTruth, items, domains, unroutedItemIds, ...tsia2Metadata }`.

- [ ] **Step 1: Add a failing compatibility assertion**

In the existing TSIA2 production test, require:

```js
assert.equal(compiled.artifactType, 'pathQuestionBankSeed');
assert.deepEqual(compiled.unroutedItemIds, []);
assert.deepEqual(new Set(Object.keys(compiled.domains)), new Set([
  'quantitativeReasoning',
  'algebraicReasoning',
  'geometricSpatial',
  'probabilisticStatistical',
]));
```

- [ ] **Step 2: Run TSIA2 production tests red**

```bash
node --test tests/platform/tsia2*Production*.test.mjs
```

Expected: fail only on the new standardized contract keys.

- [ ] **Step 3: Add standardized aliases without changing TSIA2 routing behavior**

Modify the return object from `compileTsia2ProductionSeed()`:

```js
return {
  schemaVersion: 2,
  artifactType: 'pathQuestionBankSeed',
  framework: 'tsia2',
  releaseTarget: TSIA2_PRODUCTION_RELEASE,
  sourceOfTruth: 'drafts/ccmr-v2.1/tsia2',
  items: items.sort((a, b) => a.id.localeCompare(b.id)),
  domains,
  unroutedItemIds: [...new Set(unroutedNativeSkills.flatMap((skillId) =>
    items.filter((item) => item.assessmentContext?.nativeSkillId === skillId).map((item) => item.id)))].sort(),
  nativeSkills: nativeSkills.sort((a, b) => a.nativeSkillId.localeCompare(b.nativeSkillId)),
  unroutedNativeSkills: [...new Set(unroutedNativeSkills)].sort(),
  diagnosticOnlyFamilies,
  crcAndDiagnosticFamilies,
};
```

Do not change the existing explicit Diagnostic-only mappings or CRC routing logic.

- [ ] **Step 4: Keep legacy TSIA2 CLI working**

Update `scripts/build-tsia2-production-seed.mjs` to consume the standardized keys while retaining its existing `--check` / `--write` behavior for compatibility until the unified CLI replaces Firebase predeploy.

- [ ] **Step 5: Verify TSIA2 exact release remains green**

```bash
node --test tests/platform/tsia2*Production*.test.mjs
node scripts/build-tsia2-v2-1.mjs --release --check
node scripts/build-tsia2-production-seed.mjs --check
```

Expected: all PASS; 200 items, 25 native skills, zero unrouted skills/items.

- [ ] **Step 6: Commit Task 4**

```bash
git add scripts/lib/tsia2-production-seed.mjs scripts/build-tsia2-production-seed.mjs tests/platform
git commit -m "Standardize TSIA2 production compiler contract"
```

---

### Task 5: Add the unified production coordinator and CLI

**Files:**
- Create: `scripts/lib/ccmr-v2-1-production-release.mjs`
- Create: `scripts/build-ccmr-v2-1-production-release.mjs`
- Create: `tests/platform/ccmrV21ProductionReleaseContent.test.mjs`
- Consume: the three compiler modules and `scripts/lib/ccmr-v2-1-release-integration.mjs`.

**Interfaces:**
- Produces: `compileCcmrV21ProductionRelease(): Promise<{ packages, audit, summary }>`
- Produces: `canonicalPackageJson(packageValue): string`
- Produces: `productionSeedPathsByFramework`
- Produces: `compareCommittedProductionMirrors(compiledPackages): { failures, statusByFramework }`
- Produces: `writeCcmrV21ProductionRelease(compiledPackages): void`
- CLI: `node scripts/build-ccmr-v2-1-production-release.mjs --check|--write`.

- [ ] **Step 1: Write coordinator red tests**

Create tests that require all three compilers, integrated audit success, deterministic canonical serialization, and fail-before-write behavior:

```js
test('coordinator compiles exactly SAT ACT TSIA2 and passes integration audit', async () => {
  const { compileCcmrV21ProductionRelease } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const release = await compileCcmrV21ProductionRelease();
  assert.deepEqual(Object.keys(release.packages).sort(), ['act', 'digitalSAT', 'tsia2']);
  assert.deepEqual(release.audit.failures, []);
});

test('canonical package JSON is deterministic and ends with newline', async () => {
  const { compileCcmrV21ProductionRelease, canonicalPackageJson } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const { packages } = await compileCcmrV21ProductionRelease();
  const first = canonicalPackageJson(packages.tsia2);
  const second = canonicalPackageJson(packages.tsia2);
  assert.equal(first, second);
  assert.ok(first.endsWith('\n'));
});
```

- [ ] **Step 2: Run coordinator test red**

```bash
node --test tests/platform/ccmrV21ProductionReleaseContent.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement in-memory compile and audit**

```js
import { compileDigitalSatProductionSeed, digitalSatProductionSeedPaths } from './digital-sat-production-seed.mjs';
import { compileActProductionSeed, actProductionSeedPaths } from './act-production-seed.mjs';
import { compileTsia2ProductionSeed, tsia2ProductionSeedPaths } from './tsia2-production-seed.mjs';
import { auditCcmrV21ReleaseIntegration } from './ccmr-v2-1-release-integration.mjs';

export async function compileCcmrV21ProductionRelease() {
  const [digitalSAT, act, tsia2] = await Promise.all([
    compileDigitalSatProductionSeed(),
    compileActProductionSeed(),
    compileTsia2ProductionSeed(),
  ]);
  const packages = { digitalSAT, act, tsia2 };
  const audit = auditCcmrV21ReleaseIntegration(packages);
  if (audit.failures.length) throw new Error(formatReleaseFailures(audit.failures));
  return { packages, audit, summary: buildReleaseSummary(packages, audit) };
}
```

- [ ] **Step 4: Implement canonical seed package shaping**

The on-disk object for every framework must use the same top-level shape:

```js
const diskPackage = (compiled) => ({
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
});
```

`canonicalPackageJson()` uses `JSON.stringify(value, null, 2) + '\n'`; upstream arrays are already stably sorted.

- [ ] **Step 5: Implement mirror comparison without writes**

`compareCommittedProductionMirrors()` must compare:

1. compiled canonical output vs root committed seed;
2. compiled canonical output vs Functions committed seed;
3. root parsed canonical output vs Functions parsed canonical output.

Return failures labeled `framework`, `root-drift`, `functions-drift`, or `mirror-divergence`. Missing files are failures.

- [ ] **Step 6: Implement all-framework write only after successful compilation/audit**

Build every destination string before touching disk, then use temp-file + rename per path:

```js
export function writeCcmrV21ProductionRelease(packages) {
  const writePlan = buildWritePlan(packages); // six { path, content } entries
  for (const entry of writePlan) atomicWriteText(entry.path, entry.content);
}
```

No file writes occur inside `compileCcmrV21ProductionRelease()`.

- [ ] **Step 7: Implement CLI modes**

`--check` compiles, audits, compares committed mirrors, prints JSON summary, and exits nonzero on drift. `--write` compiles/audits first, writes all six mirrors, then immediately re-runs mirror comparison and fails if any written mirror differs.

Reject simultaneous flags with exit code 2:

```js
if (writeMode && checkModeExplicit) {
  console.error('Choose either --check or --write, not both.');
  process.exit(2);
}
```

- [ ] **Step 8: Run coordinator unit tests green before generating files**

```bash
node --test tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs tests/platform/ccmrV21ProductionReleaseContent.test.mjs
```

Expected: unit/pure integration tests PASS. The CLI `--check` is expected to remain red at this point because committed seeds are still legacy.

- [ ] **Step 9: Commit Task 5**

```bash
git add scripts/lib/ccmr-v2-1-production-release.mjs scripts/build-ccmr-v2-1-production-release.mjs tests/platform/ccmrV21ProductionReleaseContent.test.mjs
git commit -m "Coordinate CCMR V2.1 production release"
```

---

### Task 6: Replace the six legacy SAT/ACT/TSIA2 seed mirrors with generated V2.1 packages

**Files:**
- Modify all six production seed files listed in File Structure.
- No ASVAB seed file may change.

**Interfaces:**
- Consumes: `node scripts/build-ccmr-v2-1-production-release.mjs --write`
- Produces: six deterministic generated JSON artifacts.

- [ ] **Step 1: Record the expected pre-generation red state**

Run:

```bash
node scripts/build-ccmr-v2-1-production-release.mjs --check
```

Expected: nonzero because committed Digital SAT, ACT, and TSIA2 mirrors differ from regenerated V2.1 output. Output must identify mirror drift, not content/audit failure.

- [ ] **Step 2: Generate all six mirrors in one coordinator run**

```bash
node scripts/build-ccmr-v2-1-production-release.mjs --write
```

Expected: success summary for exactly `digitalSAT`, `act`, `tsia2`; no ASVAB path in write plan.

- [ ] **Step 3: Verify the generated artifacts are V2.1-only and mirrored**

```bash
node scripts/build-ccmr-v2-1-production-release.mjs --check
```

Expected: PASS with `rootMirrorMatch: true`, `functionsMirrorMatch: true`, and `committedMatchesRegenerated: true` for each framework.

- [ ] **Step 4: Verify individual framework release builders remain green**

```bash
node scripts/build-digital-sat-v2-1.mjs --release --check
node scripts/build-act-v2-1.mjs --release --check
node scripts/build-tsia2-v2-1.mjs --release --check
```

Expected: all PASS.

- [ ] **Step 5: Verify ASVAB seed files are byte-identical to Task 5 parent commit**

Run:

```bash
git diff --exit-code HEAD^ -- seed/pathQuestionBank/asvab_pathQuestionBank_seed.json functions/seeds/pathQuestionBank/asvab_pathQuestionBank_seed.json
```

Expected: exit 0 / no diff.

- [ ] **Step 6: Commit generated production artifacts**

```bash
git add seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json \
  seed/pathQuestionBank/act_pathQuestionBank_seed.json \
  seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json \
  functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json \
  functions/seeds/pathQuestionBank/act_pathQuestionBank_seed.json \
  functions/seeds/pathQuestionBank/tsia2_pathQuestionBank_seed.json
git commit -m "Publish generated CCMR V2.1 production seeds"
```

---

### Task 7: Generalize CCMR session release/version retirement for SAT, ACT, and TSIA2

**Files:**
- Modify: `functions/shared/pathBankRelease.mjs`
- Modify: `functions/index.js`
- Create: `tests/platform/ccmrV21PathBankReleaseContent.test.mjs`
- Preserve existing TSIA2 release tests.

**Interfaces:**
- Produces: `CCMR_V21_PATH_BANK_RELEASE = 'ccmr-fidelity-v2.1-authentic-language'`
- Produces: `CCMR_V21_PATH_FRAMEWORKS = ['digitalSAT','act','tsia2']`
- Produces: `isCcmrV21Framework(value): boolean`
- Produces: `shouldRetireCcmrSessionForRelease(session, currentRelease?): boolean`
- Produces: `planCcmrV21PathBankReleaseMigration({ storedReleasesByFramework, sessions, locks, currentRelease }): plan`
- Produces: `retireStaleCcmrPathStateForRelease(db, { now, currentRelease }): Promise<summary>`
- Keep compatibility exports `TSIA2_PATH_BANK_RELEASE`, `planTsia2PathBankReleaseMigration`, and `retireStaleTsia2PathStateForRelease` as wrappers until all callers/tests are migrated.

- [ ] **Step 1: Write red runtime-policy tests**

Create `tests/platform/ccmrV21PathBankReleaseContent.test.mjs` with synthetic records:

```js
test('stale active SAT ACT TSIA2 sessions retire but ASVAB and course sessions do not', async () => {
  const { shouldRetireCcmrSessionForRelease } = await import('../../functions/shared/pathBankRelease.mjs');
  const stale = (assessmentFramework) => ({ status: 'active', assessmentFramework, ccmrContentRelease: 'legacy' });
  assert.equal(shouldRetireCcmrSessionForRelease(stale('digitalSAT')), true);
  assert.equal(shouldRetireCcmrSessionForRelease(stale('act')), true);
  assert.equal(shouldRetireCcmrSessionForRelease(stale('tsia2')), true);
  assert.equal(shouldRetireCcmrSessionForRelease(stale('asvab')), false);
  assert.equal(shouldRetireCcmrSessionForRelease({ status: 'active', courseId: 'algebra1' }), false);
});

test('current-release and completed CCMR sessions remain history', async () => {
  const { shouldRetireCcmrSessionForRelease, CCMR_V21_PATH_BANK_RELEASE } = await import('../../functions/shared/pathBankRelease.mjs');
  assert.equal(shouldRetireCcmrSessionForRelease({ status: 'active', assessmentFramework: 'act', ccmrContentRelease: CCMR_V21_PATH_BANK_RELEASE }), false);
  assert.equal(shouldRetireCcmrSessionForRelease({ status: 'completed', assessmentFramework: 'act', ccmrContentRelease: 'legacy' }), false);
});
```

Add Firestore-fake tests mirroring the existing TSIA2 helper contract: retire active stale SAT/ACT/TSIA2 sessions, delete only matching locks, preserve completed history, write framework release markers last, and become idempotent after markers are current.

- [ ] **Step 2: Run the new runtime test red**

```bash
node --test tests/platform/ccmrV21PathBankReleaseContent.test.mjs
```

Expected: missing export failures, with existing TSIA2 tests still green.

- [ ] **Step 3: Generalize the pure release policy in `pathBankRelease.mjs`**

Add:

```js
export const CCMR_V21_PATH_BANK_RELEASE = 'ccmr-fidelity-v2.1-authentic-language';
export const CCMR_V21_PATH_FRAMEWORKS = Object.freeze(['digitalSAT', 'act', 'tsia2']);

export const isCcmrV21Framework = (value) => CCMR_V21_PATH_FRAMEWORKS.includes(String(value || '').trim());

export function shouldRetireCcmrSessionForRelease(session = {}, currentRelease = CCMR_V21_PATH_BANK_RELEASE) {
  return session?.status === 'active'
    && isCcmrV21Framework(session?.assessmentFramework)
    && String(session?.ccmrContentRelease || '').trim() !== currentRelease;
}
```

Treat a missing release marker as stale for the three coordinated frameworks; this is how pre-V2.1 active sessions are retired.

- [ ] **Step 4: Generalize Firestore retirement without broad queries**

Query each coordinated framework independently with the existing single-field automatic index pattern, build operations only for stale active sessions and their framework locks, commit in chunks, and write `pathBankReleases/<framework>` marker last for each framework. Do not query or mutate ASVAB.

Retired session fields:

```js
{
  status: 'retired',
  retirementReason: 'ccmr-path-bank-release',
  retiredForPathBankRelease: CCMR_V21_PATH_BANK_RELEASE,
  retiredAt: now,
  updatedAt: now,
}
```

- [ ] **Step 5: Persist release on newly created CCMR sessions/locks in `functions/index.js`**

At the existing session creation object, add only for coordinated frameworks:

```js
const currentCcmrRelease = isCcmrV21Framework(assessmentFramework)
  ? CCMR_V21_PATH_BANK_RELEASE
  : null;

// in session data
...(currentCcmrRelease ? { ccmrContentRelease: currentCcmrRelease } : {}),

// in active lock data
...(currentCcmrRelease ? { ccmrContentRelease: currentCcmrRelease } : {}),
```

Do not attach the unified release to ASVAB.

- [ ] **Step 6: Prevent stale lock/session resume**

At the existing active-lock resume branch, before returning the prior session, call `shouldRetireCcmrSessionForRelease(existingSessionData)`. If stale, mark that session retired, delete its lock in the same transaction/batch boundary already used by session creation, then continue the normal fresh-session creation path. Do not expose the internal release string to the student response.

- [ ] **Step 7: Replace the TSIA2-only post-seed retirement call with generalized retirement**

After built-in seed replacement, superseded-record cleanup, and coverage rebuild succeed, call:

```js
await retireStaleCcmrPathStateForRelease(db);
```

Keep the marker write last inside the helper.

- [ ] **Step 8: Run runtime tests green**

```bash
node --test tests/platform/ccmrV21PathBankReleaseContent.test.mjs tests/platform/*PathBankRelease*.test.mjs
```

Expected: all PASS; TSIA2 compatibility remains green.

- [ ] **Step 9: Commit Task 7**

```bash
git add functions/shared/pathBankRelease.mjs functions/index.js tests/platform/ccmrV21PathBankReleaseContent.test.mjs
git commit -m "Version and retire stale CCMR V2.1 sessions"
```

---

### Task 8: Wire unified release generation into Firebase and CI

**Files:**
- Modify: `firebase.json`
- Modify: `.github/workflows/ccmr-v2-1-release-integration-audit.yml`
- Test: `tests/platform/ccmrV21ProductionReleaseContent.test.mjs` and source-wiring assertions if needed.

**Interfaces:**
- Firebase predeploy command becomes exactly `node scripts/build-ccmr-v2-1-production-release.mjs --write`.
- CI invokes framework release checks and unified `--check`; CI never invokes `--write`.

- [ ] **Step 1: Add red source-wiring assertions**

Add to coordinator tests:

```js
import fs from 'node:fs';

test('Firebase predeploy uses the unified writer and not the TSIA2-only writer', () => {
  const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const predeploy = firebase.functions?.[0]?.predeploy || [];
  assert.ok(predeploy.includes('node scripts/build-ccmr-v2-1-production-release.mjs --write'));
  assert.ok(!predeploy.some((value) => value.includes('build-tsia2-production-seed.mjs --write')));
});
```

Add a workflow-text assertion that `--check` is present and `--write` is absent from `.github/workflows/ccmr-v2-1-release-integration-audit.yml`.

- [ ] **Step 2: Run wiring tests red**

```bash
node --test tests/platform/ccmrV21ProductionReleaseContent.test.mjs
```

Expected: fail on Firebase/workflow wiring only.

- [ ] **Step 3: Replace Firebase predeploy**

Change:

```json
"predeploy": [
  "node scripts/build-ccmr-v2-1-production-release.mjs --write"
]
```

- [ ] **Step 4: Finish the release integration workflow**

Update path triggers to include:

```yaml
- 'functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json'
- 'functions/seeds/pathQuestionBank/act_pathQuestionBank_seed.json'
- 'functions/seeds/pathQuestionBank/tsia2_pathQuestionBank_seed.json'
- 'scripts/lib/digital-sat-production-seed.mjs'
- 'scripts/lib/act-production-seed.mjs'
- 'scripts/lib/tsia2-production-seed.mjs'
- 'scripts/lib/ccmr-v2-1-production-release.mjs'
- 'scripts/build-ccmr-v2-1-production-release.mjs'
- 'functions/shared/pathBankRelease.mjs'
- 'functions/index.js'
- 'firebase.json'
```

Replace the temporary inventory-only sequence with explicit checks:

```yaml
- name: Check Digital SAT V2.1 release
  run: node scripts/build-digital-sat-v2-1.mjs --release --check
- name: Check ACT V2.1 release
  run: node scripts/build-act-v2-1.mjs --release --check
- name: Check TSIA2 V2.1 release
  run: node scripts/build-tsia2-v2-1.mjs --release --check
- name: Check unified production release and committed mirrors
  run: node scripts/build-ccmr-v2-1-production-release.mjs --check
```

Keep the pure auditor/coordinator tests before the release checks. Remove any workflow call to a non-existent obsolete audit CLI once the coordinator is authoritative.

- [ ] **Step 5: Run local-equivalent wiring/release tests**

```bash
node --test tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs \
  tests/platform/digitalSatProductionSeedContent.test.mjs \
  tests/platform/actProductionSeedContent.test.mjs \
  tests/platform/ccmrV21ProductionReleaseContent.test.mjs \
  tests/platform/ccmrV21PathBankReleaseContent.test.mjs
node scripts/build-ccmr-v2-1-production-release.mjs --check
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add firebase.json .github/workflows/ccmr-v2-1-release-integration-audit.yml tests/platform/ccmrV21ProductionReleaseContent.test.mjs
git commit -m "Gate Firebase on unified CCMR V2.1 release"
```

---

### Task 9: Exact-completion verification and release evidence

**Files:**
- No feature code should be added in this task.
- Modify the plan checkbox state only if the implementation workflow tracks it in-repo; otherwise leave the plan as historical instructions.

**Interfaces:**
- Consumes all prior tasks.
- Produces exact commit SHA + GitHub Actions run proving release completion.

- [ ] **Step 1: Run all focused Node tests on the exact candidate commit**

```bash
node --test tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs \
  tests/platform/digitalSatProductionSeedContent.test.mjs \
  tests/platform/actProductionSeedContent.test.mjs \
  tests/platform/ccmrV21ProductionReleaseContent.test.mjs \
  tests/platform/ccmrV21PathBankReleaseContent.test.mjs \
  tests/platform/tsia2*Production*.test.mjs \
  tests/platform/*PathBankRelease*.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run all three authoring release builders**

```bash
node scripts/build-digital-sat-v2-1.mjs --release --check
node scripts/build-act-v2-1.mjs --release --check
node scripts/build-tsia2-v2-1.mjs --release --check
```

Expected: zero failures/warnings that block release.

- [ ] **Step 3: Run the unified production release check**

```bash
node scripts/build-ccmr-v2-1-production-release.mjs --check
```

Expected summary:

```json
{
  "frameworks": ["digitalSAT", "act", "tsia2"],
  "failures": [],
  "mirrorDrift": 0,
  "unrouted": 0,
  "crossFrameworkCloneFailures": 0
}
```

The exact numeric per-framework family/domain counts may include additional summary keys, but the failure/drift/unrouted/clone values above must be zero.

- [ ] **Step 4: Confirm ASVAB remained untouched throughout the implementation range**

Compare the implementation starting commit (the commit containing this plan) to candidate HEAD:

```bash
git diff --exit-code <PLAN_COMMIT_SHA>..HEAD -- \
  drafts/ccmr-v2.1/asvab \
  seed/pathQuestionBank/asvab_pathQuestionBank_seed.json \
  functions/seeds/pathQuestionBank/asvab_pathQuestionBank_seed.json
```

Expected: no diff.

- [ ] **Step 5: Push the exact candidate commit and inspect `CCMR V2.1 Release Integration Audit`**

Expected workflow steps all green:

1. pure integration contract;
2. Digital SAT full V2.1 release;
3. ACT full V2.1 release;
4. TSIA2 full V2.1 release;
5. unified production release/mirror check.

Do not claim completion from an earlier commit's green run.

- [ ] **Step 6: Record the final exact commit/run in the handoff response**

Report the exact branch commit SHA, workflow run id, compiled family counts by framework, zero unrouted items, mirror equality, zero cross-framework clone failures, and confirmation that ASVAB was untouched. Mention unrelated Vercel/build-rate-limit statuses separately and do not classify them as CCMR content failures.
