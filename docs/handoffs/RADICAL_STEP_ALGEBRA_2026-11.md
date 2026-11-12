# Radical equations on Step Algebra (2026-11)

Single-radical equations are solved on the **Step Algebra relation workspace**
(`MultiRelationAlgebra`) — the one students already use for absolute value and
completing the square — with the algebra and the final answer judged **exactly,
on the server**, from the assigned (or generated) item.

`solveStepByStep` stays the one way to author it. The Sign & Solution Analyzer's
`radicalSolve` still imports, renders and grades as before.

## What a student does

1. **Isolate the radical** with the ordinary +, −, ×, ÷ moves.
2. **Raise both sides to a power** (Other operations → *Raise both sides to a
   power*): choose Square / Cube / 4th / 5th, then type what each side becomes.
   Only an *isolated* radical, and only the power that matches its index, is
   accepted; the line typed must follow (`(√P)ⁿ → P`, other side → its own nth
   power). Anything else is refused with a sentence and nothing is committed.
3. **Solve** the linear equation, or — for a square root with a variable on the
   other side — the quadratic: standard form, **Factor**, **Zero-product
   property** (one equation per distinct factor; a repeated factor once), then
   each branch.
4. **Check every candidate in the ORIGINAL equation**: substitute into BOTH
   sides, enter what each side equals, decide *Valid solution* / *Extraneous*,
   and **Record this check**.
5. **State the final solution set** (values, unordered, a repeated root once) or
   **No real solution**, and **Record solution set**.

An isolated even root equal to a negative number is "no real solution" with no
algebra (Other operations → *No solution*); only that shape is accepted.

## Scope (verified, not guessed)

`functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs` parses an
equation into an exact rational model (no mathjs) and says "not in scope" for
everything else:

| index | other side after isolating | notes |
| --- | --- | --- |
| 2 | linear (or constant) | the raised quadratic must have **rational roots** (perfect-square discriminant) |
| 3, 4, 5 | constant | a variable beside a cube/4th/5th root gives a cubic+: out of scope |

Out of scope (kept as scaffolded responses, never silently routed): two
radicals, nested radicals, nonlinear radicands, irrational candidates, a raised
quadratic with no real roots, general rational exponents, the quadratic formula.

Real-domain restrictions are kept: a candidate is checked in the original, an
even root needs a radicand ≥ 0, and the panel states it.

## Routing — explicit, never sniffed

`stepAlgebraRouting.mjs` is unchanged: a Step Algebra item opens the relation
workspace when it carries `relationWorkspace: true`. The **V5 compiler sets that
flag** for a `solveStepByStep` equation the model verifies
(`src/platform/contract/radicalEquationIntent.js`; a family slot's
`{{placeholders}}` are judged on a sample fill). It is deliberately **not**
derived from the equation text at runtime: a stored radical `stepAlgebra`
question would otherwise change engine *and* grader silently. An author's own
`"relationWorkspace": false` is honoured.

Pre-Flight (`semanticValidation.js`) refuses a radical that was told to open
there but is outside scope — for the item, a family preview, and every version
Pre-Flight samples.

## Grading (server-authoritative)

`stepAlgebraRadicalGrading.mjs` — parts `relation-work`, `candidate-verification`,
`solution-set`:

- the algebra must reach **exactly the candidates** raising both sides produces;
- each candidate: both side values (exact — `1/4`, `0.25`, `\frac{1}{4}` and
  `sqrt(9)+2` for 5 are all read) and the decision;
- the final set: unordered, duplicates collapse, "no real solution" only when
  every candidate fails.

Checks are keyed by the candidate's **value**, so a change to an earlier step
leaves a stale check unread (the workspace also clears checks and the set on any
committed step, Undo, and Start over). "No candidates" (the structural claim: no
checks owed) and "every candidate failed" (a check each, then "no real
solution") are different outcomes and owe different work.

Each step's raw work is replayed by `verifyStepAlgebraStep` through the SAME
`validateRelationTransition` the workspace uses. New transition kinds
(`radicalRaise`, `factor`, `zeroProduct`) are registered in
`submissionEnvelope.mjs` — **a kind missing there makes the whole step unreadable
on the server** — and new step kinds in `RELATION_STEP_KINDS`.

`graderVersion` (`step-algebra-workspace-v2`) is intentionally unchanged: nothing
already graded changes, and regrade tooling reports on it.

## Reusable for quadratic lessons

*Factor* and *Zero-product property* are not tied to radicals. A lesson turns
them on with `"algebraTools": ["factor", "zeroProduct"]` on a `stepAlgebra` item.
No absolute-value or inequality lesson gains a button it did not have.
Authoring caveat: the shared parser reads `x(x - 5)` as a function call. The
tools insert the multiplication for what a student types; an authored *given*
equation should be written `x*(x - 5)` or `(x)(x - 5)`.

## The lesson

`teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json`
is the teacher's source with exactly Classwork #1, #2, #9, Practice #1–4 and
DOL #1, #3 converted (IDs, order, generators and everything else identical, plus
authored worked solutions the analyzer used to write itself). Practice #2 deals
4th/5th roots and DOL #3 cube/4th/5th roots, which is why the raise operation
accepts index 2–5.

All 53,496 versions of its four families are checked in
`tests/platform/algebra2RadicalStepAlgebraLesson.test.mjs`.

## Verify

```bash
node scripts/check-teacher-import.mjs teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json --verbose
node --test tests/platform/radicalEquationShape.test.mjs tests/platform/radicalEquationGrading.test.mjs \
  tests/platform/radicalStepAlgebraAuthoring.test.mjs tests/platform/algebra2RadicalStepAlgebraLesson.test.mjs

# real browser, Chromebook size: the lesson imported and mounted in the real QuestionEngine
npx vite --host 127.0.0.1 --port 5197 --strictPort &
node tests/browser/algebra2RadicalStepAlgebra.mjs            # lesson examples shapes variants misses resume undo regression dol
```

The browser journeys solve each item **only through the controls**, submit, then
re-grade the app's own tool response on the server code and replay every step it
reported (`tests/browser/radicalStepAlgebraDriver.mjs`).

## Release

Shared grading changed (`functions/shared/**`), so the Functions that bundle it
must ship **before** Hosting, which the new client needs. Nothing here touches
Firestore rules or indexes.

### Which Functions

The planner cannot read an import graph, so for any `functions/shared/**` change
it plans every function (210, in 28 groups, about an hour). The functions that
can actually load the changed modules are **18** (plus `platformBuildInfo`,
which every functions release redeploys and then calls to prove the commit):

| loads | functions |
| --- | --- |
| `submissionIngestion.mjs` — the submission grader and `normalizeStepWork` (`submissionEnvelope.mjs`) | `ingestStudentSubmissions`, `applyWorkspaceDraftRecovery`, `finalizeStudentResponseCheckpoints`, `sweepStudentResponseCheckpoints` |
| `responseCheckpointFinalizer.mjs` | `finalizeStudentResponseCheckpoints`, `sweepStudentResponseCheckpoints` |
| `responseInspector.mjs` (direct, or through `lib/reviewMyWork.js` and `lib/retroactiveAccommodation.js`) | `inspectStudentResponse`, `overrideStudentResponseGrade`, `loadMyReviewWork`, `reviewRetroactiveAccommodation`, `syncGradeToClassroom`, `syncSectionGradeToClassroom` |
| `sectionRecoveryActions.mjs` | `advanceSectionRecovery`, `resolveHeldSectionRecovery` |
| `recoveryCertificationGrading.mjs` | `previewRecoveryContentUpgrade`, `commitRecoveryContentUpgrade`, `previewAssignmentContentUpgrade`, `commitAssignmentContentUpgrade` |
| `workspaceDraftRecovery.mjs` | `applyWorkspaceDraftRecovery`, `getStudentPersistenceRecoveryReport`, `resolveStudentPersistenceHold`, `syncGradeToClassroom` |

How it was derived: every relative `import()` / `require()` / `from` under
`functions/` gives the module graph. The six shared files this change edits are
imported (transitively) by exactly those six shared modules plus the two `lib/`
files above, and `functions/index.js` / `classroomSectionEntry.js` reach them
only through their lazy loaders. The 18 are the exported functions that call a
loader. The weekly path planner (`lib/weeklyPathServerPlan.js`, the one
non-literal `import()`) imports none of the changed files. The planner also
lists `publishAssignmentToClassrooms`, `forceRepublishAssignmentToClassrooms` and
`drainClassroomPushQueue`; a name-based walk flags them only through
`const base = require(...)` and a `module.exports` block, and they never call a
changed module, so they are left out.

The set is for THIS change only. `main` also carries other work that touches
`functions/` (the Systems of Equations Rush PR changed `functions/index.js` and
nine shared Live Challenge modules). Unless the live build already includes it,
the plan's diff holds more than this change, and the 18 are not enough.

### Commands (Linux, Cloud Shell)

Correct for any live state, and the default:

```bash
git fetch origin && git checkout main && git pull --ff-only        # clean, current main whose CI run on main is green
npm ci && (cd functions && npm ci)
npm run build && npm run build:firebase
node scripts/release-firebase.mjs                                  # the plan: what changed since the live build, every command
node scripts/release-firebase.mjs --execute                        # asks for the project id (mathmaster-aleks)
node scripts/verify-callable-access.mjs --fix
node scripts/release-firebase.mjs --whats-live
```

`--execute` deploys, in the planner's order: indexes, the Functions in paced
groups (every function: about an hour), the `platformBuildInfo` check (must
report the commit being deployed), the callable-access check, `path-admin`,
rules, then Hosting through `npm run deploy:hosting` (the resilient wrapper;
never a raw `firebase deploy --only hosting`). If only the Hosting upload
fails, rerun just `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting`.

Faster, **only** when the plan's `diff:` shows nothing under `functions/` but
this change (no other commit since the live build touched it), replace the
`--execute` line with the exact functions (three groups, about 7 minutes; the
other steps are unchanged):

```bash
node scripts/release-firebase.mjs --execute --functions advanceSectionRecovery,applyWorkspaceDraftRecovery,commitAssignmentContentUpgrade,commitRecoveryContentUpgrade,finalizeStudentResponseCheckpoints,getStudentPersistenceRecoveryReport,ingestStudentSubmissions,inspectStudentResponse,loadMyReviewWork,overrideStudentResponseGrade,previewAssignmentContentUpgrade,previewRecoveryContentUpgrade,resolveHeldSectionRecovery,resolveStudentPersistenceHold,reviewRetroactiveAccommodation,sweepStudentResponseCheckpoints,syncGradeToClassroom,syncSectionGradeToClassroom
```

### Check it is live

**Import the lesson only after Hosting is live.** The V5 compile that opens the
new workspace runs in the teacher's browser, and the workspace and its tools run
in the student's, so an older build compiles these items to a workspace that
cannot solve them. Until the new build is live, the original
`5_Solving_Radical_Equations_Honors.json` (the Sign & Solution Analyzer version)
still imports and runs. Reload open tabs after the release (a cached tab still
runs the old bundle).

- `node scripts/release-firebase.mjs --whats-live`: Hosting and `platformBuildInfo` report the merge commit.
- In the teacher app, import `5_Solving_Radical_Equations_Honors_Step_Algebra.json`
  as a draft (assign it to no class) and open Student preview: Classwork #1 opens
  the Step Algebra workspace with *Raise both sides to a power* under Other
  operations, and an answer saves and resumes after a reload.
