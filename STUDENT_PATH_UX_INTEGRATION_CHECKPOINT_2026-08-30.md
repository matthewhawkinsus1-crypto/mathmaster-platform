# Student Path UX / Integration Checkpoint

Date: 2026-08-30
Branch: `audit/teks-fidelity-v2-algebra2-current`

## Locked upstream prerequisites

The student Path UX work in this checkpoint sits on top of already-certified content/runtime work:

- Algebra I core Fidelity V2: complete.
- Algebra II core Fidelity V2: complete.
- Algebra I Challenge/Extension: 49/49.
- Algebra II Challenge/Extension: 48/48.
- Preferred adaptive cells 2/2, 2/3, 2/4, 3/3, 3/4: complete for every Algebra I and Algebra II standard.
- Runtime target-aware variant selection: certified.
- Certified Fidelity V2 course banks promoted into both shipping seed mirrors:
  - promotion workflow `33341606856`: PASS;
  - promotion commit `daee909d31e7da6268f796b87cd2799201487a05`.

Do not reopen those content passes unless a named regression gate fails.

## Student Path UX findings

### Already present before this patch

1. **Clickable TEKS / CCMR alignment exists.**
   - `StandardBadge` renders a clickable `TEKS <code>` chip.
   - Its modal explains the student-facing skill and has a CCMR-connections tab.
   - Course questions are not falsely labelled as exam-style.
   - Direct SAT / ACT / TSIA2 / ASVAB questions can show their active framework/reference.

2. **CCMR is visible at the point of Path choice.**
   - Open Path skill cards already render `Practice this skill as…` through `PracticeAsMenu`.
   - Only assessment pathways with secure published coverage are offered.
   - A separate CCMR tab/search remains available for broader exploration.

3. **The full Path tab already distinguished completed passes from mastery.**
   - `Foundation` → `Deeper practice` → `Mastery challenge`.
   - A completed Path pass is explicitly not the same claim as mathematical mastery.

### Wiring defect found and fixed

`MyMathPathApp` loaded `skillProgressByTEKS` from the server and passed it to the full Path tab, but dropped it before rendering `MyMathPathDashboard`.

That caused the mastery wheel / skill-detail modal to look generic after a student completed a full Path pass.

Fixes:
- `50c4863fc415408ce56d9ae662e949993a7f8991` — pass Path completion progress to dashboard.
- `8877843ac3324e18e61bb001771a9027a7c17bc1` — route progress to wheel and selected skill modal.
- `65f19580bc32572ac7f2aabaa4840ff6782be7bb` — persistent completed-pass markers on the skills wheel.
- `672301d9c64a13033a160839368a7a62c4bb8ee3` — skill modal shows completed pass, next level, and canonical next-level button.
- `88b985054de40615db210910d1471778726c0965` — active course sessions show student-facing `Level N · Foundation / Deeper practice / Mastery challenge`.
- `face534bd7e809f39fec526656213d1408d34b0d` — skills-map legend explains completed-pass markers.

## Student-facing rigor rule

Students should **not** see raw DOK or difficulty-band numbers.

The engine/teacher may use:
- DOK;
- difficulty band;
- target cells.

The student sees the instructional meaning:
- Level 1 · Foundation;
- Level 2 · Deeper practice;
- Level 3 · Mastery challenge;
- Challenge recommendation slot where earned.

## Certification

Added:
- `tests/platform/pathPassDashboardUx.test.mjs`
- `.github/workflows/student-path-ux-certification.yml`

Student Path UX Certification run `33341870579`: **PASS**.

The gate covers:
- dashboard pass-progress wiring;
- skills-wheel completion markers;
- canonical next-level presentation in the skill modal;
- active session course-level banner;
- clickable TEKS / CCMR alignment;
- existing student Path entry/workspace tests;
- adaptive target-aware variant selection;
- student runtime build.

## Scheduler / weekly-goal / recommendation audit — LOCKED COMPLETE

Verified and repaired:

- Frozen weekly slots are server-authoritative for TEKS, assessment context, DOK and difficulty.
  - Weekly launches are resolved against the server-owned weekly-goal snapshot.
  - `intendedDok` and `intendedDifficultyBand` survive into secure question selection.
  - An unrelated free-choice Path pass level cannot overwrite assigned weekly rigor.
- Challenge/Extension requests the certified DOK 3 / Band 4 course content when earned.
- Free-choice Level 2 / Level 3 passes continue to request their intended adaptive cells through target-aware variant selection.
- Honors compressed weeks preserve course Challenge instead of trimming it behind CCMR Transfer.
- Honors 4-session weeks can carry both Challenge and CCMR Transfer.
- When CCMR is disabled for the week, Transfer is excluded during planning and the planner backfills with course work rather than creating fewer cards than the weekly goal.
- Weekly CCMR cards name the actual framework instead of showing a generic Transfer label.
- Weekly sessions and numbered free-choice Path passes are now separate:
  - weekly work still contributes mastery evidence and weekly completion;
  - weekly sessions do not advance the Foundation → Deeper practice → Mastery challenge pass counter;
  - issued weekly questions carry no course-pass level;
  - active/completed weekly sessions show the frozen weekly purpose instead of a contradictory free-choice level.
- Retention and repair routing remain separate purposes/actions; only genuine enrichment uses the student-facing Challenge language.

Key commits include:
- `eaa89b8a126b9b4edb8f56109a878376ae9d7fb0` — frozen weekly rigor authority.
- `9d93aaf98d9a129d8c113713093510e8d2111169` — compressed Honors Challenge preservation.
- `861a1158462edc84eea3885f7ef7677c9940fc18`, `3c90975f678c1672d1dc60215517e2390ec2c1f5`, `61f56e842c9454bc7e04915058c048698f06126a` — full CCMR-disabled course weeks.
- `fdd934f152e762285a3d26bfce13a8b9d62a3a52` — weekly sessions separated from numbered Path passes.
- `cc3235c1517bb4c4f6d1fabba8ef39062474f586`, `3fcf759eddd447c02454f51a430e08355e400c29` — weekly-purpose presentation.
- `93ee40556dd146fc481f394c5a6efaa3cd73dfea` — server regression certification.

Final routing/integration gates:
- Student Path UX Certification `33342328598`: **PASS**.
- Algebra I II Challenge DOK Difficulty Audit `33342328600`: **PASS**.

Do not reopen this scheduler phase unless a named regression gate fails.

## Current next active audit

Run an end-to-end Path scenario matrix across the same production/shared engines used by students and the Teacher Path Simulator. Verify complete journeys, not isolated helpers:

- fresh regular student;
- below-level student with a real foundation bridge and return;
- on-level Honors student with course Challenge + CCMR Transfer;
- above-level regular student receiving Challenge;
- CCMR-disabled week retaining its full session count;
- retention-due student receiving a retention check without being relabelled Challenge;
- Band-4 miss reducing complexity on the same TEKS rather than causing prerequisite descent;
- repeated misses causing diagnose → bounded repair excursion → bridge/return or teacher support;
- free-choice Level 1 → Level 2 → Level 3 progression;
- weekly assigned work remaining separate from that free-choice pass progression.

The Teacher Path Simulator and live student route must consume the same recommendation/routing decisions and present the same purpose/next-step explanation for each scenario.

## 2026-08-30 — semantic grading / pre-launch alignment / acceptance checkpoint

Completed after the scheduler phase:

- Teacher Path Simulator field grading now preserves the same semantic-equivalence metadata as production.
  - Shared `legacyFieldGrading.mjs` now retains:
    - primary `expected` / legacy `answer`;
    - `accepted` plus legacy `acceptedAnswers`;
    - field `equivalence`.
  - This closes simulator parity for set-builder, rational-expression, nonnegative-radical and other opt-in semantic comparators.
- Weekly/free-choice pass presentation certification was aligned with the current compound separation rule:
  - weekly assigned work;
  - free-choice Challenge;
  - direct assessment practice;
  - retention;
  - numbered Foundation/Deeper/Mastery-challenge passes
  remain visually distinct.
- The skill/topic detail modal now shows the same clickable `StandardBadge` used during active questions.
  - Students can inspect the TEKS learning target **before** launching.
  - Students can inspect legitimate CCMR connections **before** launching.
  - Existing `PracticeAsMenu` still controls which direct assessment pathways can actually be launched from secure published coverage.
- Mass Correct Answer Acceptance exposed a real Algebra I student-input false negative:
  - authored geometric sequence key: `5*(4)^(n-1)`;
  - ordinary student form: `5(4)^(n-1)`.
  - The shared form-preserving normalizer now handles implicit multiplication before a parenthesized powered numeric base without broadening function-call or algebraic-group semantics.
  - The mass audit's 48 false negatives are resolved.
- The promoted Algebra II A2.2B inverse-reflection seed made an old single-ID certification stale.
  - The gate now certifies all five promoted A2.2B function-investigation families in both seed mirrors instead of looking for the removed legacy ID.

Green gates:
- Student Path UX Certification `33342904029`: **PASS**.
- Correct Answer Acceptance Audit `33342976132`: **PASS**.
- Algebra II Fidelity V2 Certification `33343023335`: **PASS**.
- Algebra I / II Challenge DOK Difficulty Audit remains green from `33342756717`.

### Exact next work

Proceed with the end-to-end Path scenario matrix already identified below. Do not reopen certified Algebra I/II content.

The matrix must test complete journeys through shared production/simulator logic for:
1. fresh regular student;
2. below-level prerequisite bridge and return;
3. Honors course Challenge + CCMR Transfer;
4. above-level regular student receiving earned Challenge;
5. CCMR-disabled week retaining full session count;
6. retention-due student receiving retention without Challenge relabeling;
7. Band-4 miss reducing complexity on the same TEKS;
8. repeated misses causing diagnose → bounded repair → bridge/return or teacher support;
9. free-choice Level 1 → Level 2 → Level 3 progression;
10. weekly assigned work staying separate from numbered free-choice pass progression.

## 2026-08-30 — end-to-end Path journey matrix LOCKED

Added:
- `tests/platform/pathJourneyScenarioMatrix.test.mjs`
- Student Path UX workflow coverage for the matrix.

The matrix binds the real weekly planner, adaptive target resolver, secure Teacher Simulator runtime, server routing engine, pass presentation, and weekly/pass bookkeeping across ten complete learner journeys:

1. fresh regular student;
2. below-level foundation bridge and return;
3. Honors Challenge + CCMR Transfer as distinct journeys;
4. above-level regular Challenge;
5. CCMR-disabled week retaining its full session count;
6. retention remaining retention rather than being relabelled Challenge;
7. Band-4 miss lowering complexity on the same TEKS first;
8. repeated misses entering diagnosis/bounded repair rather than looping;
9. free-choice Foundation → Deeper practice → Mastery challenge progression;
10. weekly assigned work remaining separate from numbered free-choice pass progression.

First matrix run `33343181375` found one real simulator initialization defect:
- JavaScript `Number(null)` was treated as 0 when no explicit DOK/difficulty target was supplied;
- selection later recovered through `0 || default`, so the issued question looked correct while the session metadata was wrong;
- fixed in `src/platform/simulation/teacherPathRuntime.js` by distinguishing absent targets from numeric targets — commit `ee5bbbbd9267f45e88f7970144fd70c6efb14b22`.

Replacement Student Path UX Certification `33343254847`: **PASS**.
- all ten journey scenarios passed;
- all existing student Path UX/parity tests passed;
- student runtime build passed.

This scenario-matrix phase is now locked. Do not reopen it unless a named journey regression fails.

### Next active audit

Audit navigation/completion recovery end to end:
- browser/platform Back from active Path work;
- leave and resume without losing current work;
- completed Path session returns to a visibly completed skill rather than requesting another question;
- next-level unavailable states preserve prior completion and provide an exit;
- no stale-session or infinite-loop behavior after a completed skill;
- Teacher Simulator and live student container present the same completion/recovery semantics.



## 2026-08-30 — navigation/completion recovery LOCKED

The post-journey recovery audit is complete. Certified behavior now covers:
- browser Back restoring the prior internal My Math Path route instead of abandoning the app;
- an always-available in-platform exit from active Path work;
- leaving and resuming an open session without skipping the current question;
- completed sessions returning a visible saved-completion state instead of requesting another question;
- unavailable next-level states preserving the earlier completed pass and providing a safe exit;
- closed-question and exhausted-attempt behavior terminating without loops;
- Teacher Path Simulator using the same `MyMathPathExperience` and production completion/recovery UI as the live student Path.

### Student solution-review defect found and repaired

The first expanded recovery gate, Student Path UX run `33343326855`, exposed a real completion defect:
- 41 raw Algebra II shipping families appeared to lack post-attempt review reasoning.
- 11 were family-shell false positives: every effective variant already contained a review.
- 30 were genuine effective-row gaps: all five Fidelity V2 families in each of A2.6C, A2.6D, A2.6E, A2.6F, A2.6G, and A2.6H.

Repairs:
- `26d35d35753b52f8e194c2d0720cb8b6eb16fa41` — review audit now checks every effective Path variant using the same family/variant merge semantics as production.
- A2.6C review source: `e37979f3733de5912441b43b3df7dd40b95e1477`.
- A2.6D review source: `35f9364e82dbf5e5b81a9915cde3ddf2067e149f`.
- A2.6E review source: `3b9c47688e257c3b065788fb26af852441613425`.
- A2.6F review source: `affc3d4d37fed3876ff245dcc0f60988ddbc6b66`.
- A2.6G review source: `f02bc723297376b5cb71a52401fbcdfdb75c0c2a`.
- A2.6H review source: `3065d5268b4700c07716203b2721643db0aa09f4`.
- `dde82fa18b7a638f8b97d7413ee4ef4afa7828bb` — certified Algebra source changes now automatically trigger deterministic shipping-seed promotion.
- Promotion run `33343679685`: **PASS**.
  - seed build PASS;
  - source/shipping parity PASS;
  - strict adaptive metadata PASS;
  - Challenge quality PASS;
  - runtime adaptive targeting PASS.
- promoted shipping seed commit: `12599e83ddf17240667799eaf53be70e8febaf12`.
- Student Path UX run after promotion `33343728528`: **PASS**.

### Explicit navigation/completion contract

Added:
- `tests/platform/pathNavigationCompletionRecovery.test.mjs` — `b113eaa86f40244fe18d926162013636f93cfa2b`;
- workflow coverage — `389b7d975647cc26ff0c00f23b90f6ca58072732`.

The contract explicitly gates:
1. active Path sessions as recoverable browser-history routes;
2. History API state preservation between outer student navigation and inner My Math Path navigation;
3. browser Back restoration of Path/session state;
4. in-platform Back from active work;
5. visible completion and prior-pass preservation when a next level is unavailable;
6. completed-session re-entry stopping cleanly rather than fetching indefinitely;
7. Teacher Simulator/live-student completion and recovery UI parity.

Final Student Path UX Certification `33343846718`: **PASS**.
- navigation/completion contract PASS;
- existing Path journey/UX/parity/recovery gates PASS;
- student runtime build PASS.

This phase is LOCKED. Do not reopen it unless a named recovery regression fails.

### Next active audit — final cross-system preproduction certification

Do not reopen certified Algebra I/II content. The remaining audit should validate the whole shipping stack together:
1. certified source ↔ web seed ↔ Functions seed parity;
2. Algebra I/II fidelity, Challenge quality, independent DOK/difficulty, semantic grading, and Path journey gates on the same candidate head;
3. live Functions/server routing and Teacher Simulator parity;
4. Firestore/security-rule and callable-contract regression coverage;
5. student web production build and any required Functions build/lint/type checks;
6. final branch/merge cleanliness and deployment-scope review.

Only after that cross-system gate is green should the branch be prepared for merge/deployment and the built-in production Path bank refreshed once.


## 2026-08-30 — final preproduction audit: Algebra release authority unified

The expanded full-platform gate exposed a historical split in Algebra I release authority:
- the certified cross-course builder used `drafts/fidelity-v2/algebra1/*.json` and `drafts/fidelity-v2/algebra2/*.json`;
- an older Algebra I builder and parity test still treated `drafts/algebra1.json` as an authoring source;
- the generic `scripts/build-path-bank.mjs` still retained the ability to compile legacy Algebra authoring modules over the certified shipping banks.

The shipping seeds were NOT rolled back. Inspection showed the shipping Algebra I seed already contained the newer V2 families while the aggregate draft contained legacy `gen*` families.

Repairs:
- `11239357b26a6fb6510a99b95fac4296a67b90b4` — certified cross-course builder now generates `drafts/algebra1.json` and `drafts/algebra2.json` as compatibility mirrors in addition to both shipping seed mirrors.
- `8668a436f851b0f13609974617a829f6798e5513` — promotion workflow includes the generated compatibility drafts in its atomic release commit.
- `e087d4d781465fa0cd4918e976c7be94fbb10184` — old Algebra-I-only build command delegates to the certified cross-course builder instead of compiling from `drafts/algebra1.json`.
- `8c6f3f9bc1dc1436d801ca6ecb91a71d0ea4bf20` — generic Path builder explicitly protects Algebra I and Algebra II from legacy overwrite and uses current certified Algebra seed documents when rebuilding its coverage manifest.
- `4626e1a184a363fdcc6a50c16135744f58284895` — Algebra I source-parity test now reads the 49 certified per-standard packages directly and treats `drafts/algebra1.json` only as a generated compatibility mirror.
- `71e83eb7da9880a4c232c143ef8b30168287ba53` — promotion workflow is concurrency-safe and rebases generated changes onto the current audit branch before push.
- `0ec0c2804987e53f311889e398d5f7d34e0f6bdf` — release-authority audit now covers both Algebra I and Algebra II and fails if compatibility drafts, web seed, Functions seed, or builder authority diverge.
- `41d5dce51613c260136cdcb983b3c90ad1f4b839` — strict release-authority audit added to the final full-platform gate.

Promotion run `33344256502`: **PASS**.
Generated compatibility/seed commit: `d5c03626e4573b12a1f99f576041cf8a62c3ec78`.

Post-promotion verification:
- `drafts/algebra1.json`: 245 certified V2 families; starts with `mm_A_2A_v2_*`.
- `drafts/algebra2.json`: 240 certified V2 families; starts with `mm_A2_2A_v2_*`.
- certified adaptive metadata, Challenge quality, runtime targeting, and seed build/parity all passed during promotion.

The next required evidence is one complete expanded Full Platform Test Suite run on a commit that includes `d5c03626`.


## 2026-08-30 — expanded full-suite regression repairs

Expanded Full Platform Test Suite run `33344324191` reached 2,925 platform subtests and exposed eight failures. The failures separated into three categories.

### 1. Real session-family repeat defect — repaired

The selector ranked exact quality tier before unused-family status. This allowed a used Production family to repeat while an unused Candidate family still existed.

Repairs:
- `5fd28e171ccd1e2696f762cc67790887b5deb98c` — Production and Candidate are treated as one teachable safety tier for no-repeat purposes; unused teachable families now beat repeats. Operational placeholders and Blocked items still stay behind polished repeats.
- `d3a047ae76d5ad98a6e1eee8854a15f2a379f985` — direct regressions certify both boundaries.

Expected student behavior:
- exhaust five real teachable families before repeating;
- never choose a placeholder merely to avoid a repeat.

### 2. Raw-family-shell tests were inspecting the wrong object — repaired

Three failures came from tests inspecting raw family shells even though production issues effective variants:
- A2.7F variant-only response fields;
- A2.2C response-field-local choice options;
- A2.2A logarithm variants supplying the generator that resolves base placeholders.

Repairs:
- `81a6f43634a0a4f1b09222e27a065e821e0f96ec` — secure-grading audit inspects the concrete issued question and recognizes response-field-local choice options.
- `e04eed16757c770ca8483cf06733234bda511f1e` — renderability audit checks every effective variant using production family/variant merge semantics.
- `943435e45497f8daf8092dc410320d7567febc34` — obsolete pre-promotion “V2 ids must not already be published” assertion replaced with V2 identity/uniqueness certification.

### 3. Eleven Algebra II Band-5 labels contradicted the locked adaptive architecture — normalized

The locked Path architecture is:
- preferred cells: 2/2, 2/3, 2/4, 3/3, 3/4;
- Challenge/Extension endpoint: DOK 3 / Band 4.

The full-suite ceiling tests correctly found 11 certified Algebra II base families at Band 5, plus four explicit Band-5 variants. These were out-of-policy difficulty labels, not a new target architecture.

Normalized to Band 4 without changing prompts, answers, generators, DOK, task type, representations, or assessed mathematics:
- A2.2B, A2.2D;
- A2.4C, A2.4D, A2.4E, A2.4G;
- A2.5A, A2.5E;
- A2.6A, A2.6C, A2.6G.

Post-normalization evidence:
- Algebra I II Challenge DOK Difficulty Audit `33344757114`: **PASS**.
- Algebra Challenge DOK Difficulty Audit `33344757111`: **PASS**.
- Certified promotion run `33344757148`: **PASS**.
  - seed build PASS;
  - source/shipping parity PASS;
  - strict adaptive metadata PASS;
  - strict Challenge quality PASS;
  - runtime adaptive targeting PASS.
- promoted compatibility/seed commit: `13cf652b4c9ba4a2f5659dfed22ef781048eed45`.
- promoted Algebra II shipping seed: 240 families; **0 Band-5 base or variant rows**.

The next required evidence is a complete expanded Full Platform Test Suite run on a normal commit after `13cf652b`, so CI evaluates the post-promotion seed state together with the selector/test repairs.
