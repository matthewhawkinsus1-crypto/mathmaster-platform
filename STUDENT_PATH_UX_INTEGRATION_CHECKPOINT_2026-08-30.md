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

## Current next active audit

Verify the scheduler / weekly-goal / recommendation side of the integration:
- Challenge/Extension should request DOK3/Band4 content when earned;
- Deeper-practice passes should request the intended independent adaptive cells rather than only relabeling the UI;
- weekly Honors/above-level mixes should include CCMR transfer without replacing course-TEKS Challenge work;
- remediation / retention should not be mislabeled as Challenge;
- the student-facing level should agree with the server-issued target purpose and course pass level.

Do not make additional visual labels until this routing audit identifies a real mismatch.
