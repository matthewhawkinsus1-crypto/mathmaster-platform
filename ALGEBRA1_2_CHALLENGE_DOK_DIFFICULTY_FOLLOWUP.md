# Algebra I / Algebra II Challenge + DOK/Difficulty Follow-up

Date: 2026-08-30

This file is a durable post-core-fidelity checkpoint. Do not treat the items below as completed merely because the TEKS Fidelity V2 pass is green.

## What exists now

### Path Challenge behavior

The recommendation engine already has a student-facing **Challenge** purpose:
- internal purpose: `EXTENSION`;
- mastered standards and above-level students may receive it;
- Honors weekly mixes explicitly include extension work;
- the current authored ceiling is **DOK 3 / difficulty band 4**;
- extension raises cognitive demand first and then difficulty, capped at the authored ceiling.

This is **not a separately authored Algebra I/II Challenge Tier**. It reuses whatever DOK 3 / higher-band content is available for the selected standard.

Do not confuse this with **Live Challenge**, which is the teacher-led synchronous competition game and is unrelated to Path extension-tier content.

## Published Algebra I / Algebra II DOK and difficulty coverage

Audited directly from:
- `seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json`
- `seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json`

### Algebra I
- 49 standards
- 245 active templates (5 per standard)
- every standard has at least one DOK 1, DOK 2, and DOK 3 template
- every standard has difficulty bands 2, 3, and 4
- no standard currently has a complete difficulty-band 1-4 set
- no standard has a full DOK × difficulty matrix
- the common authored pairs are:
  - DOK 1 / Band 2
  - DOK 2 / Band 3
  - DOK 3 / Band 3
  - DOK 3 / Band 4

### Algebra II
- 48 standards
- 240 active templates (5 per standard)
- every standard has at least one DOK 1, DOK 2, and DOK 3 template
- every standard has difficulty bands 2, 3, and 4
- no standard currently has a complete difficulty-band 1-4 set
- no standard has a full DOK × difficulty matrix
- the common authored pairs are:
  - DOK 1 / Band 2
  - DOK 2 / Band 3
  - DOK 3 / Band 4
- a small number have an additional independent pair such as DOK 2 / Band 4.

The older seed therefore has broad labels but often moves DOK and difficulty together. That is precisely what `scripts/audit-dok-difficulty.mjs` was written to detect.

## Decision: do NOT fill every mathematical matrix cell blindly

A full Cartesian matrix is not instructionally sound. Some combinations are artificial:
- DOK 1 / Band 4 can become “hard numbers but shallow thinking” rather than useful adaptation.
- DOK 4 is extended reasoning over time and generally does not belong in a single ordinary Path question.
- forcing every TEKS into every pair would create filler and reduce fidelity.

Instead, after core Algebra I and Algebra II TEKS fidelity is complete, run a **Challenge + Independent-Axis Coverage Pass**.

## Minimum adaptive cells to target where the TEKS supports them

The preferred five-cell architecture is:

1. **DOK 2 / Band 2** — same standard, accessible complexity
2. **DOK 2 / Band 3** — core grade-course expectation
3. **DOK 2 / Band 4** — same reasoning demand, harder structural complexity
4. **DOK 3 / Band 3** — deeper reasoning without also raising structural complexity
5. **DOK 3 / Band 4** — Challenge / extension

Optional:
- DOK 1 / Band 2 for fluency, recognition, or prerequisite checks when it genuinely fits the standard.

This architecture lets the recommendation engine change DOK and difficulty independently and gives mastered/above-level students a real challenge target without inventing Band 5 or routine DOK 4 questions.

## Challenge-tier authoring rule

For every Algebra I and Algebra II TEKS:
- verify whether an authentic DOK 3 / Band 4 extension family exists;
- if the standard can support a meaningful extension, author/upgrade one;
- challenge must go **deeper**, not merely use uglier numbers;
- prefer transfer, justification, multi-representation reasoning, error repair, model comparison, or reverse reasoning;
- do not change the assessed TEKS construct just to make an item harder;
- do not use CCMR exam content as a substitute for a course-TEKS challenge family; CCMR transfer remains its own Path purpose.

If a TEKS genuinely cannot support a standalone DOK 3 / Band 4 item without construct drift, document that exception instead of manufacturing one.

## Required certification after core fidelity

Create a cross-course audit/certification that reports, per TEKS:
- available DOKs;
- available difficulty bands;
- available DOK:Band pairs;
- presence of DOK 2/Band 2, DOK 2/Band 3, DOK 2/Band 4, DOK 3/Band 3, DOK 3/Band 4;
- Challenge-ready yes/no;
- whether DOK and difficulty are moving in lockstep;
- any documented exception.

Do not mark the Algebra I/II adaptive-content project complete until this pass is finished.

## Current order of operations

1. Finish Algebra II TEKS Fidelity V2 (current first unfinished standard: A2.7F).
2. Complete remaining Algebra II standards and certify.
3. Run the Algebra I + Algebra II Challenge/Independent-Axis pass described above.
4. Promote/update the production seed only after the audited Fidelity V2 families and post-core adaptive coverage are certified.
