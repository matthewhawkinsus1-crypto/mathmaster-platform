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

## Progress — Algebra II A2.2 adaptive batch green

- Completed **A2.2A–A2.2D** with authentic independent-axis variants while preserving the certified core and Challenge families.
- Examples of independence:
  - harder reciprocal/fractional graph construction remains DOK2/Band4;
  - simpler but still analytical inverse/logarithm claim checks supply DOK3/Band3;
  - inverse-construction and composition variants preserve secure Function Investigation contracts.
- Algebra II Fidelity V2 Certification at A2.2D batch head `8cd72edfd547053d03316f02c079d18b08137a1b` — run `33337668023`: **PASS**.
- Cross-course Challenge/DOK Difficulty Audit — run `33337667892`: **PASS**.

Current Algebra II adaptive counts after A2.2:
- Challenge-ready: **48/48**
- Full preferred five-cell target: **4/48**
- Complete DOK2 axis: **14/48**
- Complete DOK3 axis: **10/48**
- Missing 2/2: **13**
- Missing 2/3: **2**
- Missing 2/4: **30**
- Missing 3/3: **38**
- Missing 3/4: **0**
- Strict preferred-cell failures: **44/48**

Next batch: **A2.3A–A2.3G**.



## Progress — Algebra II A2.3 adaptive batch green

- Completed the independent-axis pass for **A2.3A–A2.3G**.
- Added only the missing preferred cells while preserving the certified core and all DOK3/Band4 Challenge endpoints.
- The batch deliberately separates structural difficulty from reasoning depth:
  - nonunit Gaussian elimination, nonmonic linear-quadratic systems, multi-candidate residual checks, and three-boundary inequality work supply DOK2/Band4;
  - modeling audits, row-operation repair, system-error analysis, inequality-language audits, union/intersection repair, and boundary-rule audits supply DOK3/Band3.
- Two adaptive regressions were caught by the full Fidelity gate and repaired:
  - A2.3B's DOK3/Band3 row-error variant inherited a base stimulus placeholder (`r3`) that its generator no longer bound; the variant now carries its own self-contained stimulus.
  - A2.3D's two-candidate DOK2/Band4 variant could accidentally make Candidate B another true intersection; its generator now constructs one actual line-quadratic system with Candidate A at one root and explicitly keeps Candidate B away from both intersection x-values.
- Algebra II Fidelity V2 Certification after repair — run `33337921761`: **PASS**.
- Cross-course Challenge/DOK Difficulty Audit after repair — run `33337921662`: **PASS**.

Current Algebra II adaptive counts after A2.3:
- Challenge-ready: **48/48**
- Full preferred five-cell target: **11/48**
- Complete DOK2 axis: **21/48**
- Complete DOK3 axis: **16/48**
- Missing 2/2: **13**
- Missing 2/3: **2**
- Missing 2/4: **23**
- Missing 3/3: **32**
- Missing 3/4: **0**
- Strict preferred-cell failures: **37/48**

Next batch: **A2.4A–A2.4H**.


## Progress — Algebra II A2.4 adaptive batch green

- Completed the independent-axis pass for **A2.4A–A2.4H**.
- Every A2.4 standard now contains the preferred five adaptive cells while preserving its certified DOK3/Band4 Challenge endpoint.
- The batch added:
  - routine coefficient solving, parabola-attribute inference, transformation mapping, completing-square arithmetic, regression technology, radical solving, extraneous-root verification, and quadratic-inequality work at independently varied difficulty;
  - simpler but genuine DOK3 analysis/error-repair variants where the reasoning demand needed to rise without simultaneously raising structural difficulty.
- Fidelity regressions caught and repaired during the batch:
  - A2.4C's DOK2/Band4 point-mapping variant initially changed the certified family's 0.5 vertical-scale / -4 inside-factor invariant; the variant was repaired to preserve the same transformation while adding a fourth mapped point.
  - A2.4F's DOK3/Band3 isolation-error variant inherited base stimulus placeholders that its simpler generator did not bind; the variant now carries a self-contained stimulus.
- Algebra II Fidelity V2 Certification after repairs — run `33338361051`: **PASS**.
- Cross-course Challenge/DOK Difficulty Audit after repairs — run `33338361055`: **PASS**.

Current Algebra II adaptive counts after A2.4:
- Challenge-ready: **48/48**
- Full preferred five-cell target: **19/48**
- Complete DOK2 axis: **29/48**
- Complete DOK3 axis: **21/48**
- Missing 2/2: **10**
- Missing 2/3: **1**
- Missing 2/4: **15**
- Missing 3/3: **27**
- Missing 3/4: **0**
- Strict preferred-cell failures: **29/48**

Next batch: **A2.5A–A2.5E**.


## Progress — Algebra II A2.5 and A2.6 adaptive batches green

- Algebra I remains **LOCKED COMPLETE**:
  - Challenge-ready: 49/49
  - full preferred five-cell target: 49/49
  - complete DOK2 axis: 49/49
  - complete DOK3 axis: 49/49
  - strict preferred-cell failures: 0
- Algebra II Challenge/Extension remains **48/48 ready**.
- Algebra II A2.2 through A2.6L have now completed the preferred independent-axis pass.
- A2.6 required several fidelity-preserving repairs:
  - A2.6A preserved transformation-family invariants across variants;
  - A2.6B made the DOK3/Band3 cube-root repair self-contained;
  - A2.6E moved its DOK3/Band3 reasoning variant into a two-solution family after the first placement violated the negative-isolated family invariant.
- Latest A2.6L green gates:
  - Algebra II Fidelity V2 Certification `33340350773`: **PASS**
  - Algebra I II Challenge DOK Difficulty Audit `33340350745`: **PASS**
  - Algebra Challenge DOK Difficulty Audit `33340350753`: **PASS**
- Machine audit at the A2.6L checkpoint:
  - Algebra II challenge-ready: 48/48
  - full preferred five-cell target: **36/48**
  - complete DOK2 axis: **44/48**
  - complete DOK3 axis: **36/48**
  - missing preferred cells: DOK2/Band2 = 4; DOK2/Band3 = 0; DOK2/Band4 = 1; DOK3/Band3 = 12; DOK3/Band4 = 0
  - strict preferred-cell failures: **12**
- The only Algebra II standards remaining at that checkpoint are:
  - A2.7A–A2.7I
  - A2.8A–A2.8C
- A2.7A has since received its DOK3/Band3 complex-number repair.
- A2.7B has since received DOK2/Band2 and DOK3/Band3 polynomial-operation variants.
- A2.7C has since received its DOK3/Band3 polynomial-division repair and is the current active certification gate.
- Do not reopen A2.2A–A2.6L unless a named regression gate implicates them.

## FINAL STATUS — Algebra I / Algebra II adaptive depth COMPLETE

This section supersedes every earlier in-progress count in this file.

### Algebra I
- Standards: **49**
- Families: **245**
- Challenge/Extension-ready (DOK3/Band4): **49/49**
- Full preferred five-cell target: **49/49**
- Complete DOK2 axis (2/2, 2/3, 2/4): **49/49**
- Complete DOK3 axis (3/3, 3/4): **49/49**
- Missing preferred cells: **0**
- Strict adaptive failures: **0**
- Qualitatively authentic Challenge-ready: **49/49**
- Procedural-only DOK3/Band4 alternates: **0**

### Algebra II
- Standards: **48**
- Families: **240**
- Challenge/Extension-ready (DOK3/Band4): **48/48**
- Full preferred five-cell target: **48/48**
- Complete DOK2 axis (2/2, 2/3, 2/4): **48/48**
- Complete DOK3 axis (3/3, 3/4): **48/48**
- Missing preferred cells: **0**
- Strict adaptive failures: **0**
- Qualitatively authentic Challenge-ready: **48/48**
- Four procedural DOK3/Band4 rows remain only as alternate content; every affected standard also has at least one qualifying non-procedural Challenge option.

### Final certification
- Algebra II Fidelity V2 Certification after the final A2.7F adaptive-test repair — run `33340622790`: **PASS**.
- Completed strict cross-course adaptive-coverage audit — run `33340615841`: **PASS**.
- Final strict metadata + qualitative Challenge audit — run `33340705020`: **PASS**.
- The final Challenge workflow now enforces both:
  - `scripts/audit-challenge-dok-difficulty-v2.mjs --strict`
  - `scripts/audit-challenge-quality-v2.mjs --strict`

### Lock rule
**Algebra I and Algebra II Challenge/Extension plus independent DOK/difficulty coverage are now LOCKED COMPLETE.**

Do not reopen this pass merely because an older snapshot above shows missing cells. Reopen only when:
1. a named fidelity/adaptive/Challenge-quality regression test fails; or
2. the Path target architecture is intentionally changed beyond the preferred five cells.

### Important distinction
- **Path Challenge / Extension** is the adaptive DOK3/Band4 course-content endpoint certified here.
- **Live Challenge** is the separate teacher-led synchronous competition feature.
- CCMR transfer is also separate and should not substitute for course-TEKS Challenge content.



## SHIPPING STATUS — Certified Fidelity V2 seeds promoted

Date: 2026-08-30

The adaptive-content work is no longer staged-only.

- Added deterministic production builder:
  - `scripts/build-algebra-fidelity-v2-production-seeds.mjs`
- Added guarded promotion workflow:
  - `.github/workflows/promote-algebra-fidelity-v2-seeds.yml`
- Promotion workflow run `33341606856`: **PASS**.
- Auto-commit produced:
  - `daee909d31e7da6268f796b87cd2799201487a05` — **Promote certified Algebra I II Fidelity V2 Path seeds**
- The workflow passed, in order:
  1. certified Algebra I/II seed generation;
  2. Path coverage manifest rebuild;
  3. generated seed parity check;
  4. strict DOK/difficulty metadata audit;
  5. strict qualitative Challenge audit;
  6. runtime adaptive-variant targeting tests;
  7. shipping-seed commit.
- Algebra I shipping seed now contains **245/245 Fidelity V2 families**.
- Algebra I shipping seed has **88 variant-bearing families / 210 authored variants** at this checkpoint.
- Algebra II shipping seed was rebuilt from all **48 certified Fidelity V2 standard packages / 240 families**; workflow parity passed before commit.
- Both `seed/pathQuestionBank` and `functions/seeds/pathQuestionBank` mirrors are generated from the certified Fidelity V2 source.

### Lock rule

Algebra I / Algebra II core fidelity, Challenge/Extension, independent DOK/difficulty coverage, runtime target-aware variant selection, and shipping seed promotion are now **LOCKED COMPLETE**.

Do not return to course-content authoring unless a named fidelity/adaptive/seed-parity regression fails.

### Next active phase

Resume the previously planned **student Path experience / integration** work:
- make TEKS / CCMR context visibly useful to students;
- verify Challenge/Extension and higher-pass states are understandable in the UI;
- make completion and repeat/higher-level passes visually distinct;
- verify topic/path navigation does not hide available course or CCMR work;
- ensure the newly targeted DOK/difficulty variant metadata reaches the student-facing task context without exposing answer keys or internal scoring machinery.
