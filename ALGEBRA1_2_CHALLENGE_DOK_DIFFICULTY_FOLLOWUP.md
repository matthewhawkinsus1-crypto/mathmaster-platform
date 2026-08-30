# Algebra I / Algebra II Challenge + DOK/Difficulty Follow-up

Date: 2026-08-30

This file is the durable post-core-fidelity checkpoint for adaptive depth. Core Algebra I and Algebra II TEKS fidelity can be green while this work is still incomplete.

## Path Challenge behavior

The recommendation engine already has a student-facing **Challenge** purpose:
- internal purpose: `EXTENSION`;
- mastered standards and above-level students may receive it;
- Honors weekly mixes explicitly include extension work;
- the current authored ceiling is **DOK 3 / difficulty band 4**;
- extension raises cognitive demand first and then difficulty, capped at the authored ceiling.

This is **not** a separately authored Algebra I/II Challenge Tier. It reuses the highest-demand content actually available for the selected standard.

Do not confuse this with **Live Challenge**, the teacher-led synchronous competition game.

## Decision: do not fill a Cartesian DOK × difficulty grid blindly

DOK and difficulty are separate axes, but every mathematical pairing is not automatically instructionally useful.

Do **not** manufacture:
- DOK 1 / Band 4 items that are only ugly arithmetic;
- routine one-question DOK 4 labels;
- off-construct “challenge” items whose only purpose is to fill a cell.

Instead, use this preferred five-cell adaptive architecture where the TEKS supports it:

1. **DOK 2 / Band 2** — accessible same-construct work
2. **DOK 2 / Band 3** — core course expectation
3. **DOK 2 / Band 4** — harder structure at the same reasoning depth
4. **DOK 3 / Band 3** — deeper reasoning without also increasing structural difficulty
5. **DOK 3 / Band 4** — true Challenge / Extension

Optional:
- DOK 1 / Band 2 for authentic fluency, recognition, or prerequisite checks.

## Actual Fidelity V2 audit — 2026-08-30

This section supersedes the older seed-bank snapshot below. It was audited from the **actual Fidelity V2 staged source**:
- `drafts/fidelity-v2/algebra1/*.json` — 49 standards
- `drafts/fidelity-v2/algebra2/*.json` — 48 standards

Variant-level DOK and difficulty overrides are included in these counts.

### Algebra I Fidelity V2

- **49 standards**
- **14/49 Challenge-ready** with at least one authentic DOK 3 / Band 4 family or variant.
- **35/49 still need Challenge/Extension coverage.**
- **0/49** currently contain all five preferred adaptive cells.
- DOK 2 / Band 3 is present in all 49.
- Missing-cell counts:
  - DOK 2 / Band 2: **27**
  - DOK 2 / Band 3: **0**
  - DOK 2 / Band 4: **20**
  - DOK 3 / Band 3: **40**
  - DOK 3 / Band 4: **35**
- Standards with a complete DOK 2 difficulty ladder (2/2, 2/3, 2/4): **9**
  - A.12D, A.2C, A.2D, A.2I, A.3F, A.4B, A.5A, A.5C, A.9C
- Standards with both DOK 3 cells (3/3 and 3/4): **7**
  - A.3H, A.4A, A.4C, A.7A, A.8B, A.9D, A.9E

#### Algebra I Challenge-ready standards — 14
A.10B, A.2H, A.3D, A.3G, A.3H, A.4A, A.4C, A.6A, A.6B, A.7A, A.8B, A.9A, A.9D, A.9E.

#### Algebra I standards still missing DOK 3 / Band 4 Challenge — 35
A.10A, A.10C, A.10D, A.10E, A.10F, A.11A, A.11B, A.12A, A.12B, A.12C, A.12D, A.12E, A.2A, A.2B, A.2C, A.2D, A.2E, A.2F, A.2G, A.2I, A.3A, A.3B, A.3C, A.3E, A.3F, A.4B, A.5A, A.5B, A.5C, A.6C, A.7B, A.7C, A.8A, A.9B, A.9C.

### Algebra II Fidelity V2

- **48 standards**
- **48/48 Challenge-ready** with at least one DOK 3 / Band 4 family or variant.
- **0 Challenge gaps.**
- **0/48** currently contain all five preferred adaptive cells.
- Missing-cell counts:
  - DOK 2 / Band 2: **14**
  - DOK 2 / Band 3: **2**
  - DOK 2 / Band 4: **34**
  - DOK 3 / Band 3: **42**
  - DOK 3 / Band 4: **0**
- Standards with a complete DOK 2 difficulty ladder (2/2, 2/3, 2/4): **10**
  - A2.6I, A2.6L, A2.7A, A2.7C, A2.7E, A2.7F, A2.7G, A2.7H, A2.7I, A2.8A
- Standards with both DOK 3 cells (3/3 and 3/4): **6**
  - A2.3D, A2.4A, A2.4B, A2.4D, A2.5B, A2.5C

### What this means

**Algebra II Challenge is done at the standard level.** Every Algebra II TEKS has a DOK 3 / Band 4 endpoint that the Path `EXTENSION` purpose can select.

**Algebra I Challenge is not done.** Thirty-five Algebra I TEKS do not yet have a DOK 3 / Band 4 endpoint.

**Independent-axis adaptation is not done in either course.** The next work is not to create arbitrary extra families; it is to create authentic coverage for the missing preferred cells so the engine can:
- increase difficulty without automatically increasing DOK;
- increase DOK without automatically increasing difficulty;
- give mastered students a real Challenge endpoint;
- move a struggling student to an accessible same-construct version rather than changing the construct.

## Challenge-tier authoring rule

For every Algebra I and Algebra II TEKS:
- verify whether an authentic DOK 3 / Band 4 extension exists;
- challenge must go **deeper**, not merely use uglier numbers;
- prefer transfer, justification, multi-representation reasoning, error repair, model comparison, reverse reasoning, or authentic modeling;
- do not change the assessed TEKS construct just to make an item harder;
- do not use CCMR exam content as a substitute for course-TEKS challenge content;
- if a TEKS truly cannot support a preferred cell without construct drift, document the exception instead of manufacturing filler.

## Five-family constraint

Fidelity V2 uses **exactly five families per standard**. Do not solve adaptive coverage by blindly creating sixth/seventh families.

Preferred upgrade methods:
1. add authentic generated **variants** inside an existing family;
2. revise the DOK/difficulty/content of an existing family when the current label is not the best fit;
3. replace a redundant family with an adaptive cell that the standard genuinely needs.

Metadata-only relabeling is prohibited unless the task itself already matches the target DOK and difficulty.

## Required machine certification

The post-core audit must report, per standard:
- available DOKs;
- available difficulty bands;
- available DOK:Band pairs;
- presence of 2/2, 2/3, 2/4, 3/3, 3/4;
- Challenge-ready yes/no;
- whether DOK and difficulty are moving in lockstep;
- documented exceptions.

The audit should support:
- report mode while upgrades are in progress;
- strict mode once the expected adaptive cells/exceptions are complete.

## Work order

1. **Algebra I Challenge pass first:** close the 35 missing DOK 3 / Band 4 endpoints.
2. **Algebra I independent-axis pass:** close authentic 2/2, 2/4, and 3/3 gaps.
3. **Algebra II independent-axis pass:** Challenge is already complete; focus on the 3/3 and 2/4 gaps, then remaining 2/2 or 2/3 gaps.
4. Add/enable strict cross-course certification.
5. Promote/update production seeds only after the adaptive-content audit is green.

## Historical seed-bank snapshot

The older production seeds had broad DOK 1/2/3 and bands 2/3/4 labels but frequently moved DOK and difficulty together. Those historical counts are useful for comparison but are **not** the source of truth for this follow-up. The Fidelity V2 files above are the source of truth.


## Progress — Algebra I Challenge complete and A.2 adaptive batch green

### Challenge pass
- Algebra I Challenge/Extension readiness is now **49/49**.
- Algebra II Challenge/Extension readiness remains **48/48**.
- The final Algebra I Challenge head passed both:
  - Algebra I Fidelity V2 Certification — run `33335277250`;
  - Algebra I II Challenge DOK Difficulty Audit — run `33335277259`.
- The earlier "14/49 Challenge-ready" snapshot above is historical; the current source-of-truth challenge count is **49/49**.

### Algebra I independent-axis pass — A.2A through A.2I
- Added authentic missing 2/2, 2/4, and/or 3/3 variants across A.2A–A.2I while preserving exactly five families per standard.
- No metadata-only relabeling was used; the variants change the actual task evidence, representation, or reasoning demand.
- A variant-inheritance issue was caught by the full Fidelity gate: shallow variant merging inherited base solution/stimulus placeholders. All A.2 variants were repaired to be self-contained.
- Structural placeholder audit after repair: **0 unbound placeholders** across A.2A–A.2I variants.
- Full Algebra I Fidelity V2 Certification — run `33336037685`: **PASS**.
- Cross-course Challenge/DOK audit — run `33336037655`: **PASS**.

Current Algebra I adaptive counts after the A.2 batch:
- Challenge-ready: **49/49**
- Complete DOK2 axis (2/2 + 2/3 + 2/4): **15/49**
- Complete DOK3 axis (3/3 + 3/4): **18/49**
- Missing 2/2: **22**
- Missing 2/3: **0**
- Missing 2/4: **17**
- Missing 3/3: **31**
- Missing 3/4: **0**
- Standards still failing strict preferred-cell readiness: **40/49**

Next batch: **A.3A–A.3H**.


## Progress — Algebra I A.3 adaptive batch green

- Completed the independent-axis pass for **A.3A–A.3H**.
- Added authentic missing DOK2/Band2, DOK2/Band4, and DOK3/Band3 variants while retaining DOK3/Band4 Challenge content.
- Added secure combined graph-construction + test-point reasoning for A.3D.
- Preserved graphical-system solving in A.3G; harder arithmetic stayed DOK 2 while equation cross-check reasoning received DOK 3.
- Added accessible horizontal-strip and harder fractional mixed-boundary system constructions in A.3H.
- Merged-variant placeholder audit: **0 unbound placeholders** across A.3A–A.3H.
- A runtime-selection regression was discovered: once a family has a variants array, the base is not issued automatically. Every modified A.2/A.3 family now has an explicit `core-*` variant preserving its original DOK/difficulty cell.
- Full Algebra I Fidelity V2 Certification — run `33336455813`: **PASS**.
- Cross-course Challenge/DOK Difficulty Audit — run `33336455790`: **PASS**.

Current Algebra I adaptive counts after the A.3 batch:
- Challenge-ready: **49/49**
- Complete DOK2 axis: **22/49**
- Complete DOK3 axis: **25/49**
- Missing 2/2: **18**
- Missing 2/3: **0**
- Missing 2/4: **12**
- Missing 3/3: **24**
- Missing 3/4: **0**
- Standards still failing strict preferred-cell readiness: **32/49**

Next batch: **A.4A–A.4C**.

## Progress — Algebra I A.4 through A.9 adaptive batches green

- Continued the Algebra I independent-axis pass through **A.4A–A.9E**.
- Latest completed A.9 batch added only the missing preferred cells:
  - A.9A: DOK2/Band4 and DOK3/Band3;
  - A.9B: DOK2/Band2 and DOK3/Band3;
  - A.9C: DOK3/Band3;
  - A.9D: DOK2/Band4;
  - A.9E: DOK2/Band2 and DOK2/Band4.
- A.9 variants change the actual task evidence (graph complexity, contextual-vs-algebraic domain judgment, parameter interpretation, model verification, and clean/noisy regression) rather than only changing metadata.
- Full Algebra I Fidelity V2 Certification at A.9E head — run `33337146177`: **PASS**.
- Cross-course Challenge/DOK Difficulty Audit at A.9E head — run `33337146091`: **PASS**.

Current Algebra I adaptive counts after A.9:
- Challenge-ready: **49/49**
- Full preferred five-cell target: **36/49**
- Complete DOK2 axis: **37/49**
- Complete DOK3 axis: **37/49**
- Missing 2/2: **10**
- Missing 2/3: **0**
- Missing 2/4: **3**
- Missing 3/3: **12**
- Missing 3/4: **0**
- Standards still failing strict preferred-cell readiness: **13/49**

Next batch: **A.10A–A.10F**.

## Progress — Algebra I A.10 adaptive batch green

- Completed **A.10A–A.10F** with authentic independent-axis variants while preserving five families per standard and all Challenge endpoints.
- The batch deliberately separates computational difficulty from reasoning depth: harder polynomial arithmetic is DOK2/Band4; verification and error analysis are DOK3/Band3.
- Algebra I Fidelity V2 Certification at A.10F head — run `33337284407`: **PASS**.
- Cross-course Challenge/DOK Difficulty Audit at A.10F head — run `33337284376`: **PASS**.

Current Algebra I adaptive counts after A.10:
- Challenge-ready: **49/49**
- Full preferred five-cell target: **42/49**
- Complete DOK2 axis: **43/49**
- Complete DOK3 axis: **43/49**
- Missing 2/2: **4**
- Missing 2/3: **0**
- Missing 2/4: **2**
- Missing 3/3: **6**
- Missing 3/4: **0**
- Standards still failing strict preferred-cell readiness: **7/49**

Final Algebra I batch: **A.11A, A.11B, A.12A–A.12E**.

## Progress — Algebra I adaptive coverage COMPLETE

- Algebra I Challenge/Extension readiness: **49/49**.
- Algebra I full preferred adaptive five-cell target: **49/49**.
- Algebra I complete DOK2 axis: **49/49**.
- Algebra I complete DOK3 axis: **49/49**.
- Missing preferred cells: **0**.
- Strict preferred-cell failures: **0**.
- Final Algebra I Fidelity V2 Certification at content head `7210746e22cb945c5183536091210a075a19b8a0` — run `33337433315`: **PASS**.
- The cross-course audit initially failed only because its test still expected Algebra I to be unfinished; the actual content audit had already reached strictFailureCount=0.
- Updated the audit guardrail to require Algebra I to remain strictly complete while Algebra II remains in-progress — commit `781eab1ff5b05a35d28b4d05d19b662ca05c4863`.
- Updated Challenge/DOK Difficulty Audit — run `33337475746`: **PASS**.

### Course status now

**Algebra I adaptive-content pass is locked complete.** Do not reopen Algebra I unless a named fidelity/adaptive regression gate fails.

**Algebra II Challenge is already 48/48**, but its independent-axis preferred cells remain incomplete. Continue with Algebra II in batches, beginning with **A2.2A–A2.2D**.

