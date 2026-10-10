# Student push — Job K: grades students can trust

Branch `claude/student-push-k-grading` (draft PR #465). Job K covers four things:

- the independent mathematics review that Job A's worked solutions shipped without;
- the grading and compiler defects A found (2a–2f);
- a sweep of every authored bank for keys that do not grade correct, and for equivalent forms that are rejected;
- read-only reports, so the owner can decide on re-grading.

Nothing here re-grades, writes to production or deploys.

**How the work was organised.** It ran as multi-agent workflows. Every piece had an implementer and then an independent
adversarial verifier. A fix round ran wherever the verifier found a blocking issue. The lead re-ran the tests and
committed each lane separately. Every new assertion was mutation-checked: the fix was undone by editing, the test went
red, and the file was restored byte-for-byte. Expected values are recomputed with mathjs or fraction.js, never with the
module under test.

## What shipped

### Item 2: the grading and compiler defects A found

| Commit | Defect | Fix |
| --- | --- | --- |
| 505d9e8 | 2a, 2b | **graphing2 standard form.** A curriculum code in `standard` no longer overwrites `{A, B, C}`; the code moves to primaryStandard / secondaryStandards. On the blueprint import path the stored question used to have *no* `standard` at all, so every answer graded 0. **exponentialLogBridge.** A typeless `function` compiles to `{type:'exponential', a, base (or b), h, k}`, not to linear with k taken from b. An invalid base warns at import. |
| 488bbad, d05e4bc | 2c | The question-level `inverseBranch` is honoured; f's own branch still wins. Off a one-branch parabola's kept branch, f⁻¹(f(x)) = 2h − x is graded right and x is graded wrong; the grader used to accept x. A vertex bound written as text picks the same branch everywhere. The authoring check reads the question-level branch. The family's leak guard also holds the mirror value. |
| 61c6eae, 4785d5b | 2d | The quotient is compared as a rational function on its domain. (x−1)/x is right for (x²−1)/(x²+x), and the excluded x = −1 is still required where that field is graded. When g divides f exactly, the unreduced fraction is accepted too. These stay wrong: a tiny-constant denominator, a pole shifted by 1e-7, plain text `x-1/x` (which means x − 1/x), and an extra hole. |
| 2ca3737 | 2e | **identify:** any a, b, h, k whose function, rewritten exactly in the question's form, is within 0.01 of every one of the question's parameters is right in every part. The tolerance never widens on the student's a. **describe:** a full description of the same function in describe's own units is right in every part. A blank box is never read as 0. |
| 283b29b, 4785d5b | 2f | Sequence Explorer reads `commonDifference` / `commonRatio`. The DOL1 term items are authored as answer-field items for exactly the terms they ask for. The compiler routes any item of that shape to multiAnswer: only findSequenceTerm / analyzeSequence, labelled fields, and no targetN / missingIndex / sumN. It used to drop the fields and grade a₈. |

### Item 1: independent mathematics audit

**Tool builders: all 17 audited.** Each was audited over hundreds of seeded draws per mode plus edge cases. Every
displayed step was parsed back out and recomputed, and the stated answer was graded with the shared grader.

| Commit | Tool | Result |
| --- | --- | --- |
| 7bf3a4b | graphing2, representationBridge | display fixes |
| 7bf3a4b | linearTableWorkbench | clean |
| a653c4a | systemsWorkspace, stepAlgebra2 | display and wording fixes, plus a grader fix (below) |
| a653c4a | expressionMeaning | clean |
| 864c3cc | exponentialLogBridge | rounded values were written with '='; tiny values were shown as 0 and put under a log |
| 864c3cc | polynomialWorkshop | display fixes |
| 864c3cc | parabolaGeometryLab | clean |
| 1dabf19 | dataModelingLab, regressionCalculator | rounded values with '='; checks that did not evaluate to what they stated; a = 0 on year data. Also a grader fix (below) |
| 468fe06 | signSolutionAnalyzer | grader fix (below) |
| 468fe06 | complexPlaneLab, intervalNumberLine | clean |
| 61c6eae, 488bbad, 2ca3737 | functionOperations, inverseComposition, transformations | builders audited alongside their defect fixes |

**Grader defects the audit found and fixed.** Each one marked a right answer wrong:

- **Sign analyzer '≥'** (468fe06). It was read as '<': for (x+2)(x−3) ≥ 0 the right intervals were marked wrong and
  the negative ones right.
- **Systems 2×2 with no variable left and a nonzero constant** (a653c4a). It was classified "infinitely many"; it now
  has no solution. This applies in matrix and algebraic modes.
- **Data-modeling quadratic fit** (1dabf19). On calendar-year x it returned a wrong fit, or none for 88% of random sets.
  x is now centred and scaled.

**Question families: all 7 audited** (ec8eb7e, f90132e, 2714f9c), over about 12,000 seeded instances.

- **The main finding:** a negative answer written "- 5" slipped past the hint leak guard in three families.
- The guard itself, `hintRevealsAnswer`, now also reads a spaced or U+2212 minus (4785d5b). It only ever drops more
  hints.
- Other fixes, from more than 30:
  - a sibling showing this item's answer unreduced;
  - vertex/center stated for exponential and log graphs;
  - a rounded f(0) stated as equal;
  - "multiply 1";
  - "x − 0".

**Calculator exact fractions** (06c45a9), checked with a 4,000-case fraction.js fuzz:

- literals are read exactly;
- the fraction must round to the 12 digits shown;
- nested powers can no longer freeze the page.

### Item 3: bank sweep

| Commit | Banks | Fixes |
| --- | --- | --- |
| d18fc0e | V5 assignments: DOL1, Algebra 2 Honors module 1, DOL2 draft and secure seed, the demo bank, six docs/assignments lessons. About 13,900 spellings. | 15 demo "Solve ax + b = c" items re-drew a, b and c at runtime and graded an equation the student never saw. The DOL2 review's intercepts compared text, so `(-3.0, 0)` was wrong. |
| 669ff02, 3ce25e0 | School Path banks: grade 6–8, Algebra I and II, 1,161 families | Generated choice items could serve two identical options, or a distractor worth exactly the key, so the right answer was graded wrong. The exhaustive parameter scan found 10 families. Commuted factors, chained compound inequalities and reordered formulas are now accepted alternates. The fixes went into the certified sources (`drafts/fidelity-v2`, `drafts/grade{6,7,8}.json`). The mirrors and the course Path release were regenerated with the repo's builders. |
| 8de804c | CCMR: ACT, ASVAB, Digital SAT, TSIA2, 2,176 families | Six ASVAB families could draw a second right answer; each is now constrained out. |

### Items 2 and 4: read-only reports

Neither script has a write mode, and none can be added by a flag. The tests run each against handles that throw on
every write. Each is proved on emulator fixtures that reproduce the old and new outcomes, in its own CI step.

- **`scripts/report-classroom-regrade-candidates.mjs`** (f08e62e).
  - It replays each in-scope stored classroom attempt with the platform's own replay (the same one "Apply Corrected
    Grade" uses).
  - It lists:
    - **re-grade candidates;**
    - **now-lower attempts:** old right, new wrong, for example 2c's wrong-side x and 2d's extra hole;
    - **attempts that need a teacher:**
      - 2a/2b questions that lost their data with no matching V5 source;
      - 2c attempts that never showed an inverse box (void or excuse candidates, never re-grade);
      - stored DOL1 analyze copies (the item must be replaced).
  - Proof: 19 fixtures recorded through the real `ingestStudentSubmissions`.
- **`scripts/report-path-choice-id-regrade.mjs`** (1329105, 3d725c3).
  - **The option a pre-#456 student picked was never stored.** So "would have been right" cannot be decided for any
    answer.
  - The report lists every multiple-choice answer recorded wrong inside the bug window as *undeterminable*. Each entry
    has student id, skill, item, date, session, evidence event, mastery-application marker and mastery profile, so the
    owner can choose to void them rather than re-grade.
  - It checks both edges of the window and warns when the window looks wrong.

### CI fixes on #465

- c7a181d: the Path report's emulator test ran inside `test:challenge-finish`'s shared emulator and read other suites'
  submissions. It now has its own directory and CI step. The classroom report test follows the same pattern.
- c5ecf53: `scripts/explain-test-failures.mjs` counts a failing `todo` as a failure, so two `todo` tests are `skip`.

<!-- K-STATUS: m9 and follow-ups sections are filled in when those workflows land. -->

## Owner: running the reports (read-only, from Cloud Shell)

Read-only credentials are enough: Application Default Credentials for an account with `roles/datastore.viewer`.

```bash
cd ~/mathmaster-platform && git fetch origin && git checkout <the merged commit>
npm ci && npm --prefix functions ci
gcloud auth application-default login

# Classroom attempts whose verdict changes under K's fixes. Counts only on stdout;
# detail in classroom-regrade-reports/ (gitignored, student ids, no names).
node scripts/report-classroom-regrade-candidates.mjs --project mathmaster-aleks
#   add --v5-sources <folder of the V5 blueprints teachers imported> to rebuild 2a/2b questions

# My Math Path multiple-choice answers recorded wrong before #456.
# 1) When did the double-hashing code serve, and when did the fix first serve?
gcloud run revisions list --service issuenextquestion --region us-central1 --project mathmaster-aleks \
  --format="table(metadata.name,metadata.creationTimestamp,metadata.labels.mm-git-sha)"
# 2) Report on that window (revision times, not commit times):
node scripts/report-path-choice-id-regrade.mjs --project mathmaster-aleks \
  --since <first revision serving the double sanitize> --until <first revision at or after e5513ba>
#   Read the 'Window edge' and 'window does not hold' lines before using the JSON in path-choice-reports/.
```

Whether to re-grade, void or excuse is the owner's decision. No script here writes.

## Deploy targets

Let `node scripts/release-firebase.mjs` (plan only, no `--execute`) list the exact function names: it reads the real
entry point. The targets this branch needs:

1. **Functions.** These change the server's grading:
   - the tool graders under `functions/shared/toolMath/**` and `functions/shared/serverGrading/tools/**` (graphing2
     via the compiler, inverseComposition, functionOperations, transformations, sequenceExplorer, signSolutionAnalyzer,
     systemsWorkspace, dataModeling, and the follow-ups below);
   - `functions/shared/pathSolutionSupport.mjs`.

   Expect at least these, plus `platformBuildInfo` as the release process does:
   - `ingestStudentSubmissions`
   - `sweepStudentResponseCheckpoints`
   - `expediteCheckpointsOnSectionClose`
   - the Recovery / Test Cycle / Live Challenge graders
   - `submitPathResponse` and `issueNextQuestion`

   Grading changes apply to answers graded after deploy only.
2. **path-admin, the course Path release.** The Path bank content changed and the release manifest was regenerated
   (3ce25e0). `release-firebase.mjs` handles path-admin after functions. The new item constraints apply to newly
   issued items only.
3. **Hosting**, through the resilient wrapper: the compiler, builders, families and calculator are client code.
4. **No firestore:rules change, no indexes, no migration.** The two reports are one-off, read-only scripts for the
   owner (above).

## Files outside lane K (each a small, local edit)

- `functions/shared/serverGrading/tools/{inverseCompositionLab,transformationsLab,functionOperationsLab}.mjs`: tool
  grader entry points, which are I's directory.
- `functions/shared/pathSolutionSupport.mjs`, `hintRevealsAnswer` only: the guard now drops more hints, never fewer.
- `src/tools/toolSchemas.js`: one authoring warning reads the question-level inverseBranch.
- `src/platform/rigor/courseRigor.js` and `src/platform/quality/sectionBalanceRigor.js`: `standard` is read only when
  it is a string.
- `.github/workflows/full-platform-suite.yml`: two emulator steps for the report tests. These are ordinary CI steps,
  not patch runners.
- `package.json` and `.gitignore`: two `test:*:emulator` scripts and two report output directories.
- Generated: `drafts/algebra{1,2}.json`, `seed/pathQuestionBank/*`, `functions-path-admin/release/coursePathReleaseV2.manifest.json`,
  `src/platform/path/pathReleaseManifest.generated.js`.

## Calls I made (conservative, recorded here)

- **2c attempts that never showed an inverse box** (the question-level branch was ignored, so the box was hidden) are
  listed for void or excuse, never re-grade.
- **2b.** A typeless bridge function's `b` is read as the base when `base` is missing. A typed exponential that writes
  the base as `b` still grades as base 2: the review reads `b` as a horizontal scale, and that convention has to be
  chosen once, across the compiler, grader and review. That choice is left open.
- **2d.** Plain text with the key's degrees and ambiguous precedence (`x^2-1/x^2+x`) keeps its old verdict (accepted),
  so that no stored right answer would turn wrong.
- **2e.** Equivalence is decided on the whole domain, not the graph window. It errs on the strict side.
- **Hint guard.** A minus after an operand is read as subtraction, so `y = -2x − 5` is still not caught for the answer
  −5. No hint is dropped less often than before.
- **Path report.** It never claims "would be correct", because the stored records cannot decide it.
