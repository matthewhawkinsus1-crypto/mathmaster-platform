# MathMaster Teacher Experience V2 — Final Completion Handoff

**Release date:** 2026-08-23  
**Source archive:** `MathMaster_TeacherExperienceV2_20260823(1).zip`  
**Status:** COMPLETE FOR THE AVAILABLE SOURCE/TEST ENVIRONMENT

## What this final pass completed

This package finishes the Teacher Experience V2 completion work and the final class-identity boundary sweep. It does not add a second architecture beside the existing platform; it finishes and hardens the existing class-first, Weekly Path, teacher, student, simulator, Classroom, and Path-bank flows.

### 1. Weekly Path commitments are now stable and server-owned

- Added server-owned `weeklyPathGoalSnapshots/{studentId}__{weekKey}` documents.
- A student's assigned weekly commitment freezes when first resolved for that week.
- New mastery/evidence can change future recommendations without silently rewriting the current graded commitment.
- Direct client reads/writes to the snapshot collection are denied by Firestore rules.
- Current frozen goals use strict slot identity; historical/non-snapshot weeks retain the legacy completion fallback so old grades do not suddenly become zero.

### 2. Weekly slots preserve the rigor that Recommendation V2 selected

The secure Path launch now carries and validates the full weekly slot identity, including:

- TEKS / alignment target
- purpose
- context / assessment framework
- DOK
- difficulty band
- stable weekly slot key

Cloud Functions resolves a weekly launch against the student's frozen snapshot before issuing the question.

### 3. Same-TEKS slots require separate work

Weekly completion matching is one-to-one. One completed Path session cannot satisfy two assigned weekly slots just because the TEKS code is the same. Extra voluntary Path practice can still contribute evidence/mastery, but it does not replace an assigned weekly session in the Weekly Path grade.

### 4. Teacher and student Weekly Path views use the same commitment

`getTeacherWeeklyPathCompletions` now returns the frozen goal snapshot with completion data. Teacher Weekly Path, Gradebook, and the student Weekly Path therefore use the same assigned slots. Gradebook is included in the Weekly Path progress refresh lifecycle.

### 5. Class ID is now the primary classroom boundary

The final pass audited the remaining places where a bell-period label could incorrectly act like a class identity. When a real MathMaster class exists, `classId` is now authoritative. Period remains only for bell schedules and backward compatibility.

This pass includes class-ID-first behavior for:

- assignment audience checks;
- assignment authoring / Dates & Classes editing;
- Warm-Up, Classwork, Practice, and DOL live controls;
- Classroom launch authorization and Classroom publishing destinations;
- automatic Classroom publishing;
- teacher Home and Classes workspace counts/filters;
- gradebook / roster / pacing assignment filtering;
- class join codes, teacher-scoped Student Access data, and first-time student class-code claims;
- Texas Standards class filtering;
- Live Challenge roster creation and class selection;
- Assignment Library DOL smart-view resolution;
- student dashboard assignment visibility;
- Path course/context resolution.

**Important compatibility rule:** if a modern `assignedClassIds` audience or class-ID override map exists, a matching period must not widen access to another class that happens to share the same period label. Legacy period-only records continue to work when no class identity exists.

### 6. Grade 6–8 are real class entities

The shared class model now supports all five active generative course banks:

- Grade 6
- Grade 7
- Grade 8
- Algebra I
- Algebra II

Geometry and Precalculus remain rejected until their content is activated.

### 7. Simulator and parent summary use the centralized student profile

- Path Simulator derives the same centralized Student Learning Profile used by the rest of the teacher experience while preserving its legacy mastery object for routing compatibility.
- The simulator displays the centralized performance badge.
- Parent summaries now expose centralized instructional/performance/engagement dimensions, DOK, difficulty, CCMR transfer, and supported-gap diagnostics.
- Parent summaries use the actual course label instead of hard-coding Algebra I.

### 8. Production Path bank mirror is synchronized at 5,186 generators

The deployable bank/manifest files in these two locations are byte-for-byte identical:

- `seed/pathQuestionBank`
- `functions/seeds/pathQuestionBank`

Verified active bank:

| Bank | Generators |
|---|---:|
| Grade 6 | 237 |
| Grade 7 | 212 |
| Grade 8 | 227 |
| Algebra I | 245 |
| Algebra II | 240 |
| Digital SAT | 1,045 |
| ACT | 1,125 |
| TSIA2 | 1,125 |
| ASVAB | 730 |
| **Total** | **5,186** |

All 5,186 active records are generator-backed.

## Validation completed

### Whole-source syntax parse

Parsed every `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, and `.tsx` file under `src` and `functions` with the TypeScript parser:

- **392 files parsed**
- **392 clean**
- **0 parse diagnostics**

`node --check` also passed for **240/240** non-JSX JavaScript modules, and `git diff --check` completed with no patch/whitespace errors.

### Full available regression sweep

Command shape:

`node --test $(find tests -name '*.test.mjs' | sort)`

Final result:

- **1,776 tests discovered**
- **1,734 passed**
- **42 could not start because dependencies are not installed in this extracted environment**
  - 37 require `mathjs`
  - 3 require `firebase`
  - 2 require `@firebase/rules-unit-testing`
- **0 runnable assertion failures**

The 42 dependency-load failures are not counted as passes. There is no `node_modules` directory in this extracted source package, so those suites cannot execute here without installing the project dependencies.

### Final bank verification

- 10/10 deployable bank/manifest files match byte-for-byte between the primary and Cloud Functions copies.
- 5,186/5,186 records are generator-backed.
- The final mirror regression test is included so future drift fails CI/test execution.

## Regression coverage added/updated in this pass

New completion regressions:

- `tests/platform/weeklyGoalSnapshot.test.mjs`
- `tests/platform/teacherWeeklySnapshotWiring.test.mjs`
- `tests/platform/centralProfileConsumers.test.mjs`
- `tests/platform/classCourseCoverage.test.mjs`
- `tests/platform/pathSeedMirrorSync.test.mjs`
- `tests/platform/classIdBoundaryFinalPass.test.mjs`

Existing Classroom and Phase 8 wiring regressions were updated to require the new class-ID-aware behavior instead of obsolete period-only fields.

## Deployment

Deploy **all three targets from this same completed version**:

1. Cloud Functions
2. Firestore rules
3. Web/Vercel build

After Cloud Functions are deployed, sign in as Root Admin and run **Initialize / refresh built-in starter bank** once. This installs the synchronized 5,186 built-in generator bank, including the middle-school additions. Do not delete custom or teacher-promoted Path-bank content.

## Which ZIP to use

### Complete master ZIP

Use `MathMaster_TeacherExperienceV2_Completed_2026-08-23.zip` when you want the entire completed project source in one archive.

### Replacement-files ZIP

Use `MathMaster_TeacherExperienceV2_Completion_Replacement_Files_2026-08-23.zip` when you already have the uploaded base project checked out.

**Where to put it:** place the replacement ZIP in the **root of the MathMaster project — the same folder that contains `package.json` — and extract/overwrite using the included relative paths.** Do not flatten the folders.

The replacement ZIP includes a README and manifest showing every replacement path.

## Live verification after deployment

The highest-value live checks are:

1. Create or use two real MathMaster classes that share the same period label and confirm their assignment audience/live controls remain isolated.
2. Confirm each class has its own join code and a student's first-time claim rejects the other class's code.
3. Give a student an autonomous Weekly Path goal and confirm it remains unchanged after new mastery evidence is recorded.
4. Create two assigned weekly slots using the same TEKS and confirm two separate sessions are required.
5. Confirm extra voluntary Path practice does not inflate the assigned Weekly Path completion grade.
6. Compare the student's Weekly Path card with Teacher Weekly Path and Gradebook; the assigned slots should match exactly.
7. Create Grade 6, Grade 7, and Grade 8 classes and confirm Path course context follows the class entity.
8. Run Root Admin's built-in-bank refresh and confirm the deployed built-in bank reports 5,186 generators.

## Security / architecture note kept visible

Secure answer generation and grading remain server-owned. The initial Weekly Recommendation V2 proposal is still produced from the student application's recommendation/profile data and then validated/frozen by Cloud Functions. A later hardening pass can move the entire initial candidate-selection calculation into shared/server code if Weekly Path becomes a high-stakes assessment grade. That is not required for this release to preserve answer-key security, but it remains the clearest next security hardening opportunity.
