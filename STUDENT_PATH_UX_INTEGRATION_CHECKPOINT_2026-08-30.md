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
