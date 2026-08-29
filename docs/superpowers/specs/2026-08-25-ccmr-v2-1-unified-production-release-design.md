# CCMR Fidelity V2.1 — Unified Production Release Design

Date: 2026-08-25
Branch: `ccmr-fidelity-v2-1-authentic-language`
Release target: `ccmr-fidelity-v2.1-authentic-language`

## Purpose

Digital SAT, ACT, and TSIA2 now have verified V2.1 authoring banks, but the committed production seed files used by MathMaster are still legacy packages. The current Firebase predeploy step recompiles TSIA2 only, leaving Digital SAT and ACT without an equivalent production promotion path. This design establishes one coordinated release pipeline for the three completed frameworks so that the content validated in authoring is the same content that can actually be deployed and routed by My Math Path.

ASVAB is explicitly out of scope. It remains on its separate workstream and must not be read, compiled, rewritten, or blocked by this release pipeline.

## Problem Statement

The repository currently has two different truths:

1. V2.1 authoring banks under `drafts/ccmr-v2.1/` contain the approved authentic-language content and have passed framework-specific content audits.
2. Production seed mirrors under `seed/pathQuestionBank/` and `functions/seeds/pathQuestionBank/` still contain legacy assessment packages.

A read-only CI inventory on 2026-08-25 confirmed:

- Digital SAT production seed: 1,672 routeable documents, 0 with the V2.1 authored marker.
- ACT production seed: 1,800 routeable documents, 0 with the V2.1 authored marker.
- TSIA2 production seed: 1,800 routeable documents, 0 with the V2.1 authored marker in the committed file.

TSIA2 already has a compiler that can construct the correct 200-family V2.1 production package during Firebase predeploy, but the committed seed is not itself verified against that compiler output. Digital SAT and ACT have no equivalent production compiler wired into Firebase.

This means a green authoring audit does not currently prove that a deployment will publish the same verified V2.1 content.

## Goals

The unified production release pipeline must guarantee all of the following before a deployable CCMR V2.1 seed can be accepted:

- Digital SAT, ACT, and TSIA2 each compile from their approved V2.1 authoring source of truth.
- Every compiled production item carries the V2.1 release marker and correct framework metadata.
- Every compiled production item is routeable by My Math Path.
- Native assessment source banks remain free of fabricated Texas alignment keys; Texas routing is added only by the production compiler using explicit or existing crosswalk logic.
- Framework domain identities remain valid and framework-specific.
- IDs and family IDs are unique within and across all three production packages.
- Direct/challenge provenance remains intact.
- Cross-framework exact clones and high-confidence near-clones are rejected at release time.
- Root and Functions seed mirrors are identical representations of the same compiled package.
- A partial release cannot update one framework while leaving another completed framework on legacy content.
- Stale active sessions issued from an older CCMR content release are retired safely after the bank upgrade.
- ASVAB remains untouched and excluded from all three-framework release checks.

## Non-Goals

This work will not:

- Rewrite approved Digital SAT, ACT, or TSIA2 question families.
- Change the mathematical content, vocabulary, challenge design, or weighting of completed authoring banks.
- Modify ASVAB content, routing, seed files, CI, or its branch.
- Rework general TEKS Path authoring or non-CCMR course banks.
- Introduce a new database or replace the existing `pathQuestionBank` collection.
- Change the student recommendation model beyond what is necessary to prevent stale CCMR sessions from continuing after a release upgrade.

## Selected Architecture

Use one release coordinator with three framework-specific production compilers.

The architecture is:

`Verified V2.1 authoring banks -> framework compiler -> unified release coordinator -> integrated release audit -> mirrored production seeds -> Firebase predeploy -> deployment -> stale-session retirement`

Framework-specific compilers remain responsible for framework-specific knowledge. The coordinator owns only cross-framework release invariants and atomic generation of the deployable outputs.

### Why this architecture

Separate independent predeploy scripts would be simpler initially, but they would permit partial releases and duplicate cross-framework validation logic. A single monolithic compiler would centralize too much assessment-specific behavior and make future maintenance risky. The selected hybrid keeps each assessment isolated while providing one release boundary for deployment.

## Components

### 1. Digital SAT production compiler

Create a focused library module that reads the completed Digital SAT V2.1 authoring banks and emits the production seed shape expected by MathMaster.

Responsibilities:

- Read only `drafts/ccmr-v2.1/digitalSAT/` V2.1 banks and completion metadata.
- Require the existing Digital SAT release builder to be green before compilation.
- Preserve Digital SAT assessment metadata, item format, family metadata, and V2.1 authentic-language metadata.
- Derive routeable Texas alignment keys through the existing Digital SAT assessment-to-TEKS reference/crosswalk system rather than inserting Texas keys into native source banks.
- Preserve any authored TEKS-backed SAT items that already have legitimate Texas alignment provenance.
- Emit a deterministic package sorted by stable identifiers.
- Mark every item with `ccmrContentRelease: "ccmr-fidelity-v2.1-authentic-language"`.
- Report any unrouted item as a release failure.

The compiler must not alter prompt wording, expected answers, distractors, generator definitions, task type, representation, difficulty, DOK, or challenge role.

### 2. ACT production compiler

Create a parallel focused library module for ACT.

Responsibilities mirror the SAT compiler, with ACT-specific source roots, domains, and routing references.

The compiler must:

- Read only `drafts/ccmr-v2.1/act/` V2.1 banks and completion metadata.
- Require the ACT release builder to be green.
- Preserve ACT 4-choice enhanced-item rules and modeling metadata.
- Add only legitimate production routing alignments derived from the existing ACT crosswalk/reference system.
- Reject any unrouted item.
- Emit deterministic output with the V2.1 content release marker.

### 3. TSIA2 production compiler

Retain the existing `scripts/lib/tsia2-production-seed.mjs` as the TSIA2 framework compiler, but tighten it to participate in the same coordinator contract.

The current useful behavior remains:

- Native source files remain Texas-key-free.
- CRC-capable skills route through the existing assessment reference matcher.
- Diagnostic-only skills use an explicit foundational Texas crosswalk.
- Production routing alignments are added only at compile time.
- All compiled items receive the V2.1 content release marker.

The compiler will additionally expose deterministic metadata needed by the coordinator and fail if output cannot be reproduced exactly.

### 4. Unified release coordinator

Add a release library and CLI that calls the three framework compilers in memory first.

The coordinator must not write any seed until all three compiled packages pass their individual compiler checks and the integrated release audit.

Responsibilities:

- Compile Digital SAT, ACT, and TSIA2 in memory.
- Validate framework names, domains, release target, source-of-truth metadata, and document counts.
- Validate global document ID uniqueness.
- Validate global family ID uniqueness.
- Validate V2.1 authentic-language marker on every item.
- Validate `ccmrContentRelease` on every item.
- Validate every item has at least one production routing key accepted by Path selection.
- Validate direct/challenge metadata and independently-authored challenge provenance.
- Run cross-framework prompt/task clone checks using the same or stricter normalization rules already used by the framework builders.
- Reject any ASVAB document, ASVAB path, or `framework: "asvab"` input from the coordinated release set.
- Produce a stable summary describing frameworks, counts, domains, routing coverage, and clone results.

Two CLI modes are required:

- `--check`: compile and validate without writing files.
- `--write`: compile, validate, then replace both production mirrors for all three frameworks.

`--write` is all-or-nothing at the process level: no file is written until every compiled framework and integrated invariant is green.

### 5. Production seed mirrors

The authoritative generated outputs remain in both locations already expected by repository tooling:

- `seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json`
- `seed/pathQuestionBank/act_pathQuestionBank_seed.json`
- `seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/act_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/tsia2_pathQuestionBank_seed.json`

For each framework, the root and Functions copy must be generated from the same in-memory object in the same coordinator run. CI will compare their parsed canonical content and fail on divergence.

The generated package must include top-level metadata sufficient to prove provenance:

- `artifactType: "pathQuestionBankSeed"`
- `framework`
- `releaseTarget`
- `sourceOfTruth`
- deterministic item array
- framework-specific release summary metadata

Generated seeds are deployment artifacts. The authoring banks remain the editable source of truth.

### 6. Integrated release auditor

Complete the red-first integration contract already introduced by `tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs`.

The auditor is a reusable pure module so unit tests can pass synthetic packages without touching repository files.

It will reject:

- unsupported frameworks in the coordinated set;
- missing or wrong release marker;
- invalid framework domains;
- duplicate document IDs across frameworks;
- duplicate family IDs across frameworks;
- missing routing keys;
- challenge items without independent-authorship provenance;
- exact cross-framework prompt/task clones;
- high-confidence cross-framework near-clones when task/representation evidence indicates the same underlying item;
- legacy items mixed into a V2.1 package.

Near-clone logic must avoid false positives from short generic exam stems. It should require both strong lexical/grammar similarity and compatible task/representation evidence before failing.

### 7. Firebase predeploy

Replace the TSIA2-only predeploy command with the unified coordinator.

Current behavior:

`node scripts/build-tsia2-production-seed.mjs --write`

Target behavior:

`node scripts/build-ccmr-v2-1-production-release.mjs --write`

This guarantees that Firebase Functions is never deployed with a freshly compiled TSIA2 bank beside stale SAT/ACT banks.

### 8. CI release workflow

The existing red workflow `.github/workflows/ccmr-v2-1-release-integration-audit.yml` becomes the release gate for the three completed frameworks.

Its final responsibilities are:

1. Run the integration module tests.
2. Run each framework's full release builder in check mode.
3. Run the unified production release coordinator in `--check` mode.
4. Verify committed root and Functions seeds match what the coordinator would generate.
5. Verify root and Functions mirrors match each other.
6. Print a compact release inventory.

CI must never rewrite repository files.

Framework-specific content workflows remain in place; the integrated workflow is an additional release-level gate, not a replacement for authoring tests.

### 9. Stale CCMR session retirement

A student may have an active assessment Path session created before the bank upgrade. Continuing that session after replacement can mix question contracts or leave the student on obsolete content.

The runtime must therefore compare an active CCMR session's content release against the current release.

Behavior:

- Newly issued SAT, ACT, and TSIA2 questions carry `ccmrContentRelease`.
- Session records persist the release used when the session was created.
- When loading an active CCMR session, if its release differs from the current release, mark it retired/stale and issue a fresh session from the current bank.
- Preserve prior evidence/history; do not delete past student results.
- Do not apply this rule to non-CCMR Path sessions.
- Do not apply it to ASVAB until ASVAB joins the V2.1 release architecture in a separately approved change.

The student-facing result should be a clean restart into current content rather than an error message about an internal content version.

## Data Flow

### Authoring to production

1. Authoring JSON remains under `drafts/ccmr-v2.1/<framework>/`.
2. Existing framework builders validate authoring completeness and fidelity.
3. Framework production compiler loads the validated source.
4. Compiler adds legitimate production routing metadata without mutating source files.
5. Coordinator receives all three in-memory packages.
6. Integrated audit checks cross-framework invariants.
7. In `--check`, the process exits with a summary and writes nothing.
8. In `--write`, only after all checks pass, the coordinator writes all six production mirror files.
9. Firebase packages the Functions mirror files.

### Runtime issuance

1. My Math Path requests a CCMR assessment family for a Texas skill/recommendation target.
2. Existing routing logic matches the production alignment keys.
3. The issuer returns an unused family from the selected framework and appropriate difficulty policy.
4. The session records the framework and `ccmrContentRelease`.
5. Subsequent session loads verify that release is still current.

## Determinism

Production compilation must be deterministic so CI can prove the committed artifact is reproducible.

Requirements:

- Stable sort framework documents by `id` or another fixed stable key.
- Stable sort routing keys and generated alignment arrays.
- No timestamps in generated seed content.
- No random shuffling in the compiler.
- Canonical JSON serialization with a final newline.
- The same source commit must produce identical parsed seed content on every run.

## Error Handling

The coordinator is fail-closed.

If any framework compiler fails, no production files are written. If the integrated auditor fails, no production files are written. If one root/Functions destination is unavailable during a local write operation, the command exits nonzero and identifies the destination; CI still detects any resulting divergence on the next run.

Error summaries should identify framework, item/family ID when applicable, invariant violated, and source path when available.

Warnings are permitted only for informational conditions that cannot alter routing or grading correctness. A routing gap, release mismatch, clone violation, invalid answer contract, or mirror mismatch is always a failure.

## Release Counts and Guardrails

The coordinator should not hard-code every document count as the primary proof of completeness because future approved V2.1 extensions may legitimately change counts. Completeness comes from the framework builders and completion manifests.

However, the first integrated V2.1 release should record observed counts in its summary and tests may assert known minimums to catch catastrophic omissions.

Expected current authored-family totals at the time of this design:

- Digital SAT: completed V2.1 release from its four PSDA domains.
- ACT: 136 completed V2.1 families across Preparing for Higher Math and Essential Skills.
- TSIA2: 200 completed V2.1 families across 25 native skills.

The release auditor must fail if a framework unexpectedly compiles zero content or omits a required framework domain.

## Security and Grading

This design does not move expected answers into the client. Existing server sanitization remains authoritative.

Generated production seeds may contain secure grading fields because they are server seed artifacts, not browser payloads. The existing `buildSanitizedQuestion`/server issuance path must continue stripping secure answers before sending questions to students.

The compiler must not weaken Firestore permissions or broaden teacher/student access.

## Testing Strategy

Implementation follows red-first TDD.

### Unit tests

Pure tests for the integrated auditor will cover:

- accepted three-framework package;
- duplicate global IDs;
- duplicate family IDs;
- invalid framework/domain pairing;
- legacy release marker;
- missing routing keys;
- invalid challenge provenance;
- exact cross-framework clone;
- high-similarity cross-framework clone;
- short generic stems that should not false-positive;
- ASVAB exclusion.

Each framework production compiler receives focused tests for routing, provenance, determinism, and source immutability.

### Integration tests

Repository-level tests will prove:

- Digital SAT full authoring release check is green.
- ACT full authoring release check is green.
- TSIA2 full authoring release check is green.
- Unified compiler produces all three V2.1 packages in memory.
- Every compiled item routes.
- Root and Functions mirrors are equivalent.
- Committed mirrors equal regenerated output.
- No stale legacy items remain in the three coordinated production seeds.

### Runtime tests

Session tests will prove:

- current-release CCMR sessions continue normally;
- stale SAT/ACT/TSIA2 sessions retire and restart;
- historical evidence remains intact;
- non-CCMR sessions are unaffected;
- ASVAB sessions are unaffected by this release gate.

## Migration and Deployment Sequence

The safe sequence is:

1. Add the integrated auditor and make its synthetic tests green.
2. Add Digital SAT production compiler and tests.
3. Add ACT production compiler and tests.
4. Adapt TSIA2 compiler to the shared coordinator contract.
5. Add unified coordinator in check mode.
6. Run full repository integration audit without writing production files.
7. Generate all six SAT/ACT/TSIA2 production seed mirrors in one coordinated write.
8. Re-run integrated CI against the exact generated commit.
9. Add/verify stale CCMR session retirement behavior.
10. Replace Firebase's TSIA2-only predeploy command with the unified release writer.
11. Run the exact final branch CI and deployment-preflight checks.
12. Only after all gates are green, deploy Functions/hosting as appropriate and allow the server-side seed/import path to publish the new bank.

The Firestore production collection should not be mutated merely by committing the generated files. Existing admin/server promotion remains the controlled database-write boundary.

## Rollback

Rollback is content-release based.

- Keep the previous production seed commit available in Git history.
- If a release defect is found before database promotion, revert the seed/compiler commit and redeploy.
- If a defect is found after promotion, restore the prior known-good seed package through the same server-controlled import path and set the active release accordingly.
- Stale-session handling ensures sessions from the failed release do not continue once the active content release changes again.

No rollback path should require editing individual Firestore question documents manually.

## Observability

The unified coordinator and CI summary should report at least:

- framework;
- document/family count;
- direct/challenge count;
- domain counts;
- routeable item count;
- release-marker count;
- unrouted item count;
- duplicate ID/family count;
- cross-framework clone count;
- root/Functions mirror status;
- committed-vs-regenerated status.

This is intended to make future GitHub Actions emails understandable: a release failure should state whether the problem is authoring, routing, compilation, clone safety, mirror drift, or stale generated output.

## File-Level Boundaries

Expected new or modified implementation areas:

- `scripts/lib/digital-sat-production-seed.mjs` — new framework compiler.
- `scripts/lib/act-production-seed.mjs` — new framework compiler.
- `scripts/lib/tsia2-production-seed.mjs` — adapt existing compiler contract.
- `scripts/lib/ccmr-v2-1-release-integration.mjs` — reusable cross-framework auditor.
- `scripts/lib/ccmr-v2-1-production-release.mjs` — release coordinator library.
- `scripts/build-ccmr-v2-1-production-release.mjs` — CLI.
- `tests/platform/ccmrV21ReleaseIntegrationContent.test.mjs` — complete existing red contract.
- Additional compiler and runtime tests under `tests/platform/`.
- `.github/workflows/ccmr-v2-1-release-integration-audit.yml` — finish release workflow.
- `firebase.json` — replace TSIA2-only predeploy with unified release writer.
- The six SAT/ACT/TSIA2 production seed mirror files.
- Existing CCMR session issuance/loading code only where required to persist and enforce `ccmrContentRelease`.

No ASVAB files are in scope.

## Acceptance Criteria

The architecture is complete only when all of these are true on the same exact branch commit:

- Digital SAT full V2.1 authoring release check passes.
- ACT full V2.1 authoring release check passes.
- TSIA2 full V2.1 authoring release check passes.
- Unified production release `--check` passes.
- All three compiled production packages contain only V2.1 authored content.
- Every compiled item is routeable.
- No duplicate document IDs or family IDs exist across the three frameworks.
- No prohibited cross-framework clones remain.
- Root and Functions seed mirrors match.
- Committed seeds match deterministic regenerated output.
- Firebase predeploy uses the unified release command.
- Stale SAT/ACT/TSIA2 sessions retire safely without deleting historical evidence.
- Non-CCMR and ASVAB sessions are unaffected.
- The integrated GitHub Actions release workflow is green on the exact completion commit.

## Future Extension

When ASVAB V2.1 is separately completed and approved, it can join this architecture by implementing the same framework-compiler interface and adding ASVAB-specific domains/routing checks. That future addition is deliberately not part of this design or its acceptance criteria.
