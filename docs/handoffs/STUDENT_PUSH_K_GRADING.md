# Student push — Job K: grades students can trust

Branch `claude/student-push-k-grading` (draft PR #465), merged with main at b027eb4 (#461, #468). Job K covers four things:

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
| 8de804c, ASVAB parity commit | CCMR: ACT, ASVAB, Digital SAT, TSIA2, 2,176 families | Six ASVAB families could draw a second right answer; each is now constrained out. The constraints live in `drafts/asvab-{ar,mk}.json`, the sources `scripts/build-asvab-bank.mjs` builds from. `--check` and `tests/platform/kSweep_asvabSourceParity.test.mjs` pin that the committed seeds are exactly what the drafts build. |

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

### Follow-ups: defects the audit found outside its files

| Commit | Area | Fix |
| --- | --- | --- |
| a3edcf0 | Compiler | Student graded on the tool's *default* problem: it now keeps parabolaGeometryLab's `point` / `offset`; polynomialWorkshop's `candidateRoot`, `numeratorRoots`, `targetValue`, `leadingCoefficient` and `targetRoot`; and a sign chart's `numeratorFactors`. A sign chart with `denominatorFactors` and no mode compiles as rational. A `{{name}}` key no longer makes a set box. |
| 400d4df | Tool graders | **graphing2:** a line through a point one snap step off the target was accepted; both points must now be on the line. A target the grid cannot reach (y = 2.3 on a 0.5 grid) keeps the line rule, so it still has a right answer. **complexPlaneLab:** 'divide' was graded as multiply; it is now an invalid question. **stepAlgebra2:** `-(x+1)` and `x*2 - 6` left unchanged are no longer "finished". **regressionCalculator:** the run's r, m and b are checked against its own table, as on the Path. |
| e488cdd | Path | **pathQuadraticRegression:** centred and scaled, the same fix as the lab grader. **Digital SAT union-overlap:** accepts the SAT's four-place decimal. Two CCMR prompts fixed at the source (`drafts/ccmr-v2.1`) and regenerated. |
| fb0bbbe | Re-grade report | Covers every K grading change above, each attributed separately. |

### QA m9: worked solutions that were only the answer

| Commit | Change |
| --- | --- |
| cf2e281 | **Contract.** A family may export `workedSolution(question)`: the steps for that item, ending on its key. `closedQuestionReview.js` uses them as the authored-shaped review only when the item has no authored steps and no tool review with steps. The review stays behind the closed-question gate, and nothing else calls `workedSolution`. **The QA case:** "A line passes through (0, 4) and (3, 2)" now shows: change in y, change in x, slope −2/3, b = 4, y = (−2/3)x + 4. **Recognition:** linesAndSlope now recognises two-point slope/intercept items, with hints, back-up step and sibling under the existing leak guards. |
| 95dcf19 | The other six families have `workedSolution` for the shapes they recognise. |
| e00162f | **Tool reviews.** toolSolutionReview's own reviews returned items with no steps for computed answers: sequenceExplorer in every mode, relationMapping, functionInvestigation2 compare and intercepts, and representationMatch tableAudit. They now derive the answers. The systems spatial and representation-bridge reviews derive what they used to assert. |
| 63f83ef | **Inventory test.** Classifies every bank item as STEPS or ANSWER-ONLY and pins the STEPS count from below. |

**Still answer-only** (from `tests/platform/kSteps_answerOnlyInventory.test.mjs`):

| Source | Items | Why |
| --- | --- | --- |
| DOL2 review draft, multiAnswer tasks | 336 | No family matches them. Their authored `explanation` is never read by the review model. |
| Secure DOL2 retest seed: number, set, choice and orderedPair responses | 832 | No family covers these shapes, and there is no authored solutionReview. |
| Demo bank `literal` items | 44 | No family matches the generated type. |
| Digital SAT native families | 32 | Authored without reasoning. |
| Algebra 2 Honors transformations / absolute-value lessons | 16 | J's stub families. |
| DOL1 `relationshipModel`, `figureMatch`, `graphChoicePreview` and sequence-field items, and one transformationsLab item with an empty review | 13 | No family or builder covers them. |

The fix for most of these is authored `solutionReview` steps in the content, or J's three families.


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
   **Deploy functions and Hosting back to back, outside class hours.** The page never reloads itself
   (`buildFreshness.js`), and the screen draws from the same code the server grades with. So a tab opened before the
   deploy can be graded on a different problem than it shows:
   - it draws a sequence with difference 1 while the server grades `commonDifference` 3;
   - it hides the inverse box of a question-level-branch parabola while the server now requires it, and expects
     restriction `right` where `required` was right before.
4. **Admin actions after Hosting: these put the bank fixes in front of students.** My Math Path serves from the
   Firestore `pathQuestionBank` collection, and bundled seeds reach it only through these root-admin actions. Without
   them, students keep getting the old items; for example, the ASVAB item that can draw a second right answer keeps
   marking that answer wrong.
   - **School Path banks** (grades 6–8, Algebra I and II): "Publish certified course Path release" in the Path admin
     (`publishCoursePathReleaseV2`, docs/PATH_RELEASE_V2.md step 6). Publish the release id that
     `npm run release:path:build` reports on the merged commit. J's #469 publishes `course-path-v2-485a9d98e2287892`,
     and K's content changes that id again once main is merged.
   - **Digital SAT and TSIA2:** the union-overlap answers and the two prompt fixes need `refreshReleasedCcmrPathBanks`
     (docs/ccmr-v2-1-release-runbook.md step 4).
   - **ASVAB, the six second-right-answer families:** `refreshReleasedAsvabPathBank`, the "Refresh ASVAB release"
     button in Path coverage.
5. **No firestore:rules change, no indexes, no migration.** The two reports are one-off, read-only scripts for the
   owner (above).

### What students and teachers will notice after deploy

- **An already-graded '≥' sign-chart item.** Its closed review now shows the corrected solution, while the stored
  verdict still says "You got this one", until a teacher re-grades. The classroom re-grade report lists those attempts.
- **Representation Bridge general form.** It now rejects `y = x*2 - 4`, `y = (x)(2) - 4`, `y = -(x - 4)` and
  `y = x*(-1) + 4`, which were accepted before, as stepAlgebra2's rewrite does. These are not written as mx + b. This
  is deliberate, and the re-grade report covers it.
- **Re-importing District DOL1.** The weight of its 3 sequence items changes from 1.5 to 1.75 (workload units
  2.5 → 3), because they are now answer-field items.
- **complexPlaneLab.** Legacy spellings of multiplication (`multiplication`, `product`, `Multiply`, `times`) grade as
  multiplication, as the screen shows them. Any other unknown operation, such as `divide`, is an invalid question,
  never a verdict.
- **graphing2.** Both plotted points must be on the target line. The exception is a target that no snapped point
  inside the question's own window reaches: there the line rule is kept, so the question still has a right answer.

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

## What is left, and why

The coordinator's usage stop (2026-10-10) ended new work. Everything below was found and verified, but not built.

### Grading

- **Typed exponential with the base written as `b`.** It grades as base 2. One meaning for `b` has to be chosen across
  the compiler, the exponentialLog grader and the review.
- **intervalNumberLine inequality stage.** It compares the student's text literally against 4-place decimal
  endpoints, so `x > 1/3` is rejected and `x > 0.3333` accepted. Fix: compare parsed endpoints numerically.
- **Digital SAT 3-place decimals.** The SAT's own rules also accept a 3-place decimal with a leading zero (0.781 for
  57/73); the Path still rejects it.
- **CCMR requiredSymbols.** A `{{a}}` key still asks for `{`, `}` and `a` keys
  (`inferRequiredAnswerSymbols`, the interaction layer). The test is `skip` in `kSweep_ccmrBanks.test.mjs`.
- **graphWorkspace feature keys.** A "vertex" or "center" is keyed at (h, k) for every function type, including
  exponential and log, where no such feature exists (`interactiveGraphEngine.mjs:328`). This is an authoring and grader
  owner decision.
- **Monotone keys have no linear branch.** For y = 2x + 1, "increasing on (−∞, ∞)" is marked wrong, and a horizontal
  line's range `{3}` is mishandled. Found by the functions-family verifier; owned by the graph-features grader.
- **Path, other graders' keypad and form variants** (job I's `functions/shared/answerEquivalence.mjs`): keypad
  radicals, exponent braces, `|x|` vs `abs`, `x≠−5`, `x^1`, fractions in ordered pairs, `%`, `x=` in a number box,
  sides swapped, vertex form with the constant first.
- **Plain-text quotients with ambiguous precedence** (`x^2-1/x^2+x`). They keep their old verdict (accepted); changing
  that would flip stored right answers.

### Worked solutions

- **Answer-only groups:** listed in the m9 section above.
- **Wording and coverage the m9 verifiers left as minor:**
  - systems siblings and solutions for two single-variable equations under elimination, and many fractional-coefficient
    systems, return null;
  - odd term order in literal-equation steps;
  - `(g ∘ f)(x) = x+0.3333333333333333` echoed from an authored choice;
  - "never/neither" wording edges.
- **Coverage gaps in the new step tests:** a few steps are checked only at their final value.
  - Graphing Lines mid-chain steps.
  - The 'and' interval step.
  - The quadratic `x − h = ±√R` radicand.
  - The arithmetic missing-term-at-a₁ branch.

### Content and authoring

- **Graphing2 targets the grid cannot reach.** `toolSchemas.js` could warn about them at authoring time.
- **Algebraic 2×2 authoring with no variable.** `['0 = 5', '0 = 3']` is graded correctly now, but authoring could warn.
- **Compile warnings may never reach the teacher.** Whether the import and preflight screens show
  `parseAssignmentBlueprintText().warnings` was not checked.

### Platform

- **Path should keep the submitted choice id.** `submitPathResponse` could store the raw submitted choice id, so a
  future incident like #456 can be re-graded. Today the picked option is not stored anywhere.
- **Field-level choices are not remapped.** A Path field with field-level choices and a non-'choice' inputProfile is
  served runtime ids, but its expected value is not remapped (`functions/lib/mathPath.js`). This is job I's.
- **D's handoff needs a correction.** `docs/handoffs/STUDENT_PUSH_D_PATH.md` says pre-#456 grades "could be re-graded
  from pathSubmissions". They cannot; that doc should point to the Path report.
- **Test wrapper.** `scripts/explain-test-failures.mjs` counts a failing `todo` as a failure, so this branch uses
  `skip`.

## Verification

- **Final gate on HEAD, after the merge with main:**

  | Check | Result |
  | --- | --- |
  | `npm run test:platform` | 10,534 pass, 0 fail |
  | `node --test tests/tools/*.test.mjs` | 1,587 pass, 0 fail |
  | `npm run test:authoring-v5` | 686 pass, 0 fail |
  | `npm run lint` | 0 errors |
  | `npm run build` | passes |
  | `npm run build:firebase` | passes |

- **Release and seed checks:** `npm run release:path:verify`, `node scripts/build-algebra-fidelity-v2-production-seeds.mjs --check`
  and `node scripts/audit-algebra1-path-release-authority.mjs --strict` pass. `npm run audit:answer-acceptance`
  reports 0 false negatives.
- **Emulator tests:** `npm run test:path-choice-report:emulator` (5) and `npm run test:classroom-regrade-report:emulator`
  (5) pass. Both are CI steps.
- **Not run:** `npm run test:rules`, because no rules changed. Playwright browser suites were left to CI, per the
  coordinator.
