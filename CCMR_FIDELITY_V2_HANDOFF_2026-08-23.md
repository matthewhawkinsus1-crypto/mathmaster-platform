# MathMaster — CCMR Fidelity V2 Handoff

Date: 2026-08-23
Release: `path-bank-2026-08-23-r11-ccmr-fidelity-v2`

## Purpose

CCMR practice had two real defects: SAT/ACT/TSIA2/ASVAB banks were largely parallel conversions of the same course families, and a student who earned strong direct assessment evidence could return to the same five-family level indefinitely. The UI also made an assessment session look too much like ordinary Path practice.

This release changes the assessment content layer, progression logic, student presentation, and teacher evidence together. The ordinary 1,161-template course bank and the core TEKS routing model remain intact.

## What changed

### 1. Assessment bank: 5 direct + 3 challenge families per assessment-standard mapping

Every assessment-standard mapping now has:

- 5 direct/foundation assessment families (the first direct-practice session)
- 3 separate challenge families selected from the stronger/more varied authored families
- challenge families at difficulty band 4–5 and DOK 2+ while preserving the authored mathematical construct
- explicit `ccmrChallengeTier`, `ccmrFamilyRole`, and `ccmrFidelity` metadata
- official-reference IDs from the CCMR standards-reference layer

Counts:

| Framework | Direct | Challenge | Total |
| --- | ---: | ---: | ---: |
| Digital SAT | 1,045 | 627 | 1,672 |
| ACT | 1,125 | 675 | 1,800 |
| TSIA2 | 1,125 | 675 | 1,800 |
| ASVAB | 730 | 438 | 1,168 |
| **Assessment total** | **4,025** | **2,415** | **6,440** |

Course templates remain 1,161, producing **7,601 total generator-backed templates**.

The framework differences are not fabricated into one fake common standards system. Digital SAT preserves MCQ + student-produced response; ACT/TSIA2/ASVAB remain 4-choice; ASVAB remains no-calculator; each item records its real framework reference(s).

The direct families can still share a mathematical core when the assessments genuinely test the same mathematics. Fidelity V2 no longer treats identical wording/metadata as sufficient differentiation: the shipped prompt, response mode, calculator conditions, official reference, and challenge behavior are assessment-specific, and repeat practice uses a separate challenge pool.

### 2. Repeat practice now progresses instead of looping

Server-owned progression:

1. **Direct practice** — normally 5 questions.
2. If direct evidence is strong (passed session or 5+ direct items at 80%+), the next visit becomes **Harder challenge**.
3. **Harder challenge** — 3 questions from challenge families; server prefers band 4–5 and DOK 2+.
4. Passing it opens **Advanced challenge** — 3 questions, server strongly prefers band 5 / DOK 3 when available.
5. Passing advanced challenge moves the skill to **Maintenance / challenge complete** so it cools down in recommendations instead of occupying the student's screen forever.

A failed challenge stays at the same level rather than falsely advancing.

### 3. Existing students are not reset

The new private progress record lives under:

`grades/{studentId}/ccmrProgress/{opaque skill+framework id}`

If it does not exist, `startMyMathPathSession` reconstructs enough progress from immutable `evidenceEvents`. A student who already earned 5/5 or comparable strong direct evidence therefore enters the challenge tier instead of repeating introductory practice.

### 4. Student question screen clearly identifies CCMR practice

Direct assessment questions now have a prominent assessment banner showing:

- Digital SAT / ACT Math / TSIA2 Math / ASVAB Math
- Direct practice / Harder challenge / Advanced challenge
- response format (including SAT student-produced response)
- official assessment standard/skill reference when available
- calculator condition
- explanation of why the current tier is being served

DOK and raw difficulty-band metadata remain teacher-only; students see the meaningful challenge stage instead.

### 5. Completion is visible

At the end of an assessment session the student sees whether they completed:

- direct practice,
- harder challenge, or
- advanced challenge,

and the next step is stated explicitly. The CCMR hub and the Path skill cards use labels such as:

- Not started
- In progress
- Direct practice complete — Take a harder challenge
- Challenge passed — Take advanced challenge
- Challenge complete — Practice again (maintenance)

Completed challenge work is cooled down rather than continually recommended.

### 6. Teacher evidence

The teacher assessment-skill inspector now includes:

- progression stage and next action
- direct/challenge/advanced item counts
- tier accuracy
- completed/passed session counts
- assessment-format proficiency and underlying course mastery

Teacher read-only student inspection keeps the CCMR tab visible but does not allow the teacher to practice or alter student goals.

### 7. Anti-clone/fidelity authoring gate

New scripts:

- `scripts/build-ccmr-fidelity-v2.mjs`
- `scripts/audit-ccmr-fidelity-v2.mjs`

The builder is idempotent and regenerates the assessment Fidelity V2 layer from the five-family assessment foundations.

The audit requires:

- 5 direct + 3 challenge families for every mapped assessment-standard pair
- Fidelity V2 metadata and official/framework references
- challenge floor of band 4 / DOK 2
- Digital SAT corpus contains MCQ and SPR
- ACT/TSIA2/ASVAB remain MCQ
- ASVAB remains no-calculator
- cross-framework exact prompt overlap under the configured 10% ceiling

Current exact normalized prompt overlap across all framework pairs is 0%. This is a structural anti-clone check, not a claim that every shared mathematical construct is unrelated; assessments legitimately overlap in mathematics.

## Validation

- **7,601 / 7,601** bundled templates pass the production template issuer.
- Both deployable Path-bank copies are byte-identical.
- CCMR fidelity audit: **0 failures**.
- `pathBankSeed.test.mjs`: **21/21 passed**.
- Targeted CCMR/student-path suite: **70/70 passed**.
- Critical bank/progression suite: **8/8 passed**.
- Whole test discovery: **1,801 tests; 1,759 passed; 42 environment-blocked; 0 runnable assertion failures.**
  - 37 blocked by the incomplete local `mathjs` installation
  - 3 blocked by the incomplete local `firebase/firestore` installation
  - 2 blocked by the incomplete local `@firebase/rules-unit-testing` installation
- Native JS/MJS syntax: **525/525 passed**.
- JSX/TSX parse sweep: **157/157 passed**.

The local artifact workspace has an incomplete `node_modules`, so `npm run build` cannot be meaningfully certified here (`vite` is absent). Cloud Shell should run a fresh `npm install` and `npm run build` before any commit/deploy; the deployment command below stops if that build fails.

## Deployment order

This release changes Cloud Functions, the bundled bank, and web UI. Firestore rules do not change.

1. Apply the replacement ZIP to a fresh/current `main` checkout.
2. `npm install`, run critical tests, and `npm run build`.
3. Commit/push to `main`.
4. Deploy these Functions as one small batch:
   - `getPathRuntimeStatus`
   - `initializeStarterPathQuestionBank`
   - `seedPathQuestionBank`
   - `startMyMathPathSession`
   - `issueNextQuestion`
   - `submitPathResponse`
5. Re-assert public Cloud Run transport invocation for those callable functions. Firebase Auth/MathMaster authorization remains enforced inside the callables.
6. Deploy Firebase Hosting.
7. Root Admin → Administration → My Math Path content coverage → **Initialize / refresh built-in starter bank** once.
8. Confirm web/server release both show `path-bank-2026-08-23-r11-ccmr-fidelity-v2` and secure bank reports 7,601 built-in templates.

## Live checks after refresh

Use a student who already has a 100% CCMR result:

1. Open that same framework/skill again.
2. It should say **Take a harder challenge**, not ordinary Start practice.
3. Session should contain 3 questions and display **CHALLENGE** prominently.
4. At completion, a passing set should say the advanced challenge is unlocked.
5. Teacher read-only view should show the tier item/session evidence.
6. A new framework for the same TEKS should still begin at direct practice because SAT evidence is not ACT evidence.

