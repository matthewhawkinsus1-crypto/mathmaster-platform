# Student push — Job P: no right answer marked wrong

Branch `claude/student-push-p-grading-edges`, from main @ 59e526e. Job P finishes the grading list Job K
verified and left ("What is left, and why" → Grading in `STUDENT_PUSH_K_GRADING.md`), plus job B's grader
notes (`STUDENT_PUSH_B_TESTS.md` → Follow-ups). Job A's "Findings for other owners" were all fixed by K
(2a–2f); nothing from that list was still broken on main.

Nothing here re-grades, writes to production or deploys. Every grader change is in `functions/shared` or
`functions/lib`, which the browser imports too, so the server and the screen agree by construction.

## What shipped

| # | Item | Fix | Proof (each test fails on main) |
| --- | --- | --- | --- |
| 6 | **CCMR requiredSymbols.** A `{{a}}` key asked for the `{`, `}` and `a` keys. | `inferRequiredAnswerSymbols` reads a whole `{{name}}` placeholder as a number; the symbols round it are still inferred. K's skipped test is un-skipped. | `kSweep_ccmrBanks` (un-skipped), `pGrading_requiredSymbols` |
| 2 | **Interval answers with fraction endpoints** were unreadable, even typed exactly as the key. | `parseCanonicalIntervalNotation` reads `1/2`, `-3/4` and `\frac{1}{2}` endpoints. The Path's tolerance still decides: `(0.3333, 3]` is not `(1/3, 3]`. | `pGrading_answerEquivalence` |
| 5 | **Keypad and form variants** (answerEquivalence, every field grader: Path, assignments, secure tests). | Accepted now: keypad radicals (`2\sqrt{3}`, `2\sqrt3`, `2√3` for `2sqrt(3)`); exponent groups (`^{n-1}` = `^(n-1)`); `abs(x)`, `\lvert x\rvert` = `\|x\|`; `\pi`, `π`, `pi`; ordered pairs compared coordinate by coordinate (`(1/2, 3)` = `(0.5, 3)`); `25%` and `$12.50` in a number box; `x = 5` for a number key; an equation with its sides swapped; vertex form with the constant first; `\lor` / `\land`, "or" clauses in either order, and chained = "and" compound inequalities. Already right on main: `x≠−5`, `x^1`, `x^{2}`. | `pGrading_answerEquivalence` (every acceptance has near misses beside it), the bank sweep below |
| 1 | **intervalNumberLine inequality stage.** `x > 1/3` wrong, `x > 0.3333` right. | Each endpoint is also read as a number (fractions, `\frac`, `sqrt`, `pi`) and compared with the expected endpoint. The sentence keeps the tool's own shape, clause order and relations, so nothing else is loosened. | `pGrading_intervalNumberLine`, including every number-line item in the banks (tool sentence and exact endpoints right, near misses wrong) |
| 3 | **Digital SAT decimals.** | The College Board rule, exactly, only on Digital SAT items: a decimal that fills the space (5 characters, 6 if negative, leading zero optional) and is the key truncated or rounded. 2/3: `.6666 .6667 0.666 0.667` right, `0.66 .66 0.67 .67` wrong; −1/3: `-.3333 -0.333` right. `0.780` is right for 57/73 and `0.78` is not: the typed text decides. The Path marks the field at issue time (`numberRules: 'digitalSAT'` in the private grading); the CCMR assignment hydration marks the field. Other frameworks keep their verdicts. | `pGrading_digitalSatDecimals` (the CB examples; the union-overlap item issued and graded on the Path; hydrated as an assignment; the same item under ACT unchanged) |
| 4 | **Monotone keys had no linear branch; a horizontal line's range.** | A line is increasing or decreasing on its whole domain; a horizontal one is constant. A horizontal line's range is `{k}` / `[k, k]` / `y = k` (it was keyed as every real number). | `pGrading_graphFeatures`, through `gradeAnalysisPart` |
| 7 | **A typed exponential with the base written as `b`** graded base 2. | **The call: `b` is the base** when `base` is not written, f(x) = a·b^(x − h) + k. Survey below. Applied in `normalizeExponentialSpec` (the bridge's grader, its screen and its review all read it), in the V5 compiler (a typed exponential with `b` compiles to `base`), and the review no longer refuses `b`. K's compile warning "grades it with base 2" is gone; a `b` that is not a valid base still warns. | `pGrading_exponentialBase`, K's `kGrading_v5CompilerStandardAndExpLog` (its base-2 pin rewritten) |
| 8 | **graphWorkspace vertex/center keyed for every function type.** | **Not changed — listed for the owner** (conservative call below). The re-grade report lists every attempt on such a question as needs-teacher. | `pGrading_classroomRegradePlan` |

### Item 7, the survey

Every exponential function spec in the repository that writes `b` without `base`:

- `seed/pathQuestionBank/authoring/algebra1Exponentials.mjs`, A.9D "Graph $y = 2^{x}$", keyed
  `{ type: 'exponential', a: 1, b: 2 }`: b is the base.
- `tests/tools/kGrading_v5CompilerStandardAndExpLog.test.mjs` (`a: 3, b: 5`, "3·5^(x − 1) + 4"): b is the base.
- The graph engine (`functionGraphUtils.mjs`) has always read `spec.base ?? spec.b`, and K's compiler fix reads a
  typeless bridge function's `b` as the base.

No prompt uses `b` for a horizontal scale on an exponential (transformationsLab's `b` is its own tool and is not
touched). No key was wrong, so no bank content changed.

### The bank sweep for every equivalence change

`scripts/sweep-equivalence-verdicts.mjs` (new, read-only) grades every answer key in the repository with main's
code and with this branch's, side by side: the Path field grader, the assignment field matcher and `sameValue`.

- **Corpus:** every response field of every Path bank (grade 6–8, Algebra I/II, ACT, ASVAB, Digital SAT, TSIA2)
  drawn three times through the production generator, plus every static key in `docs/assignments`, `drafts` and
  `seed`.
- **Right responses:** the key, every accepted form, and student spellings of them.
- **Wrong responses:** every other option of the same field, and near misses of the key (a number moved, a sign
  flipped, a bracket or relation changed, and/or swapped), each also in those spellings.

Result on the final code (three draws per family):

| | |
| --- | --- |
| Fields | 9,330 (10,011 drawn instances, 0 draw failures) |
| Responses graded, per grader | 20,482 right, 63,477 wrong; 251,877 verdicts in all |
| **Right → wrong** | **0** |
| **Another option or a near miss → right** | **0** |
| Right spellings newly accepted (Path grader) | 4,622: % or $ on a number 2,044; equation sides swapped or constant first 1,173; `x =` before a number 1,087; π 119; compound inequality 80; keypad radical 48; abs / bars 39; exponent group 32 (13,607 over the three graders) |

Run it (the base is a `git worktree` of main; nothing is written but `--out`):

```bash
git worktree add /tmp/p-base 59e526e && ln -s "$PWD/node_modules" /tmp/p-base/node_modules
node scripts/sweep-equivalence-verdicts.mjs --base /tmp/p-base --draws 3 --check-wrong --out /tmp/p-sweep.json
```

`--check-wrong` exits 1 if any wrong response is now accepted; it exits 0 on this branch. A near-miss spelling
whose root the field's own tolerance already accepts (155 for 154 with a tolerance of 1) is not counted as let
through: the bare root was right on main too.

**What the sweep did not catch, and what did.** The corpus only holds spellings someone thought to generate, so two
other checks ran:

- A pinned platform test caught the first over-reach: reordering every term commuted `1/4 + 1/6 = 1/t`, a
  modelling equation whose term order is opt-in. Only a constant term moves now.
- An independent adversarial verifier on the final diff found six wrong answers let through, each fixed and pinned
  as a negative in `pGrading_answerEquivalence` / `pGrading_digitalSatDecimals` ("verifier counterexamples"):
  1. the SAT rule took padded zeros (`00.67` for 2/3), `0.000` for a nonzero key, and `1.000` for a key that fits
     exactly (`0.9999`);
  2. a constant moved out of nested bars (`|1-|x+5-2||` for `5+|1-|x-2||`): no term moves when bars nest;
  3. unwrapping `^(-2)` exposed its minus to `modelEquation`'s term sort (`x^(-2)+y^(-1)` for `x^(-1)+y^(-2)`): a
     negative exponent keeps its brackets;
  4. `%` and `$` accepted each other (`5%` for `$5`): a sign must match when both have one;
  5. `p i` read as π: ASCII `pi` is read only while spaces still separate letters;
  6. a constant moved past a plain-text quotient (`1+x-1/x` for `x-1/x+1`), which would change rule 3's verdicts:
     no term moves on a side with a typed `/`.
  The verifier found no right answer turned wrong. Its fix for (5) made the sweep find 69 (`\pir^2`, a
  whitespace-stripped `\pi r^2`, right on main): `\pi` is now the constant whatever letter follows, and the sweep
  is back to 0. K's pinned school-bank sweep then caught one more (`sqrt(5)` for the key `1sqrt(5)`): the
  pre-pass is now π only, and the sweep generates "a coefficient of 1 dropped" spellings too.

### Tests that pinned the old limitations

These assertions described exactly what item 5 fixes; each now pins the new verdict and a near miss beside it.
The behaviour the comment protected is kept where it still applies.

- `algebraicForm.test.mjs` "a different FORM of the same line is still wrong": `2x=y` for `y=2x` (sides swapped)
  is now right; point-slope and standard form with their sides swapped stay wrong.
- `polynomialRelationAnswerEquivalence.test.mjs`: the parabola relation with its sides swapped is right in
  generic `sameValue`; solving for y still needs the opt-in relation equivalence.
- `responseKeypadProfile.test.mjs`: the grader reads `m=-2/3` as the number; the "write only the number" guard is
  unchanged.
- `secureMathAnswerRoundTrip.test.mjs`: `x=4` for 4, `\land`, a fraction in a pair, and the editor's `\pi`,
  `\sqrt`, `\%`, `\$` now grade right. **The secure editor guards stay** (inequality and orderedPair on the text
  box; π, √, %, $ fields on typed text): moving them to the math editor needs the browser capture
  (`tests/browser/secureAccessParity.mjs --write`), which is a screen change outside this job.
- `kGrading_v5CompilerStandardAndExpLog.test.mjs`: the "grades base 2" warning test now pins b as the base.

## Calls I made (conservative, recorded here)

- **Sides swapped is right everywhere** (item 5, as K listed it). An existing pin called it a different form.
  Each side is still compared in its own form, so point-slope or standard form written the other way round stays
  wrong. If the owner wants a "write it as y = …" question to refuse `2x + 1 = y`, that needs a field opt-out.
- **Only a constant term may move** ("vertex form with the constant first"). Reordering terms that hold a variable
  stays the opt-in `modelEquation` comparison's job.
- **`x = 5` in a number box**: any one-letter name, a number key only. A key that is an equation is not read the
  other way round (`5` is not right for `x = 5` in an equation box, as before).
- **`%` is not "divide by 100"**: `25%` is right for 25, not for 0.25. `$` only before a plain number.
- **Digital SAT**: the SAT's rule reads the typed text, so `0.780` is right and `0.78` is not for 57/73. Mixed
  numbers stay wrong, as on the SAT. The rule applies only where the item's framework is `digitalSAT`.
- **Item 8 is not changed.** No bank item asks for a vertex or center on an exponential, a logarithm or a line,
  but a teacher-authored graph-analysis question with no requests defaults to "vertex", so production attempts
  that clicked (h, k) and were marked right may exist, and changing the key would flip them. The re-grade report
  lists them (needs-teacher, `vertex-or-center-keyed-on-a-function-without-one-owner-decides`). The fix, once the
  owner has seen the list: `getGraphFeaturePoints` keys vertex only for quadratic/absolute and center only for
  rational/cubic/cubeRoot, and the default request picks a feature the function has.
- **Plain-text quotients with ambiguous precedence** (`x^2-1/x^2+x`) keep their old verdict (pinned).
- **`b` beside `base`** is not the base: the grader reads `base`, and the review refuses (a horizontal scale the
  bridge does not draw), as before.
- **The number line**: the inequality must still be written the tool's way round (`x > a`, `a < x < b`, the tool's
  clause order). `1/3 < x` was wrong before and is still wrong.

## Past answers: the read-only report

K's `scripts/report-classroom-regrade-candidates.mjs` now covers Job P. Its default scope adds `multiAnswer`,
`orderedPair`, `intervalNumberLine`, `graphAnalysis` and `functionGraph`. P's defects are recognised in the
question and the typed work, never from the verdict change:

- `p-answer-equivalence-keypad-and-form-spelling`: an answer typed in a spelling P reads (only wrong → right);
- `p-number-line-inequality-exact-endpoint`: only wrong → right;
- `p-graph-line-monotone-and-horizontal-range`: **both ways** — "none" for a rising line's increasing intervals,
  and (−∞, ∞) for a horizontal line's range, were right on main and are listed as now-lower;
- `p-exponential-bridge-b-is-the-base`: **both ways** — the base-2 answer main accepted is now-lower;
- item 8: needs-teacher, verdict unchanged.

Proved in `tests/platform/pGrading_classroomRegradePlan.test.mjs` on attempts stored through K's
`storedAttempt` (ingestion's own record and evidence), with the attribution mutation-checked.

**Owner, from Cloud Shell** (read-only; a viewer role is enough):

```bash
cd ~/mathmaster-platform && git fetch origin && git checkout <the merged commit>
npm ci && npm --prefix functions ci
gcloud auth application-default login
node scripts/report-classroom-regrade-candidates.mjs --project mathmaster-aleks
#   counts on stdout; detail in classroom-regrade-reports/ (gitignored, student ids, no names)
#   --tools multiAnswer,intervalNumberLine,graphAnalysis,functionGraph,exponentialLogBridge  narrows it to Job P's surfaces
```

My Math Path is not read: P's equivalence changes only accept more, and the Digital SAT rule applies to sessions
issued after deploy. Whether to re-grade, void or excuse is the owner's decision (D2). No script here writes.

## Deploy targets

Let `node scripts/release-firebase.mjs` (plan only) list the exact function names from the real entry point. This
branch changes:

1. **Functions** — `functions/shared/answerEquivalence.mjs`, `answerUtils.mjs`,
   `toolMath/intervalNumberLine/intervalMath.mjs`, `toolMath/graphWorkspace/interactiveGraphEngine.mjs`,
   `toolMath/exponentialLog/exponentialLogMath.mjs`, `functions/lib/mathPath.js`,
   `functions/lib/ccmrAssignmentBank.js`. Every grader imports the equivalence layer, so expect the grading
   functions K listed: `ingestStudentSubmissions`, `sweepStudentResponseCheckpoints`,
   `expediteCheckpointsOnSectionClose`, the Recovery / Test Cycle / Live Challenge / secure-test graders,
   `submitPathResponse`, `issueNextQuestion` (writes `numberRules` into new Path private grading), the CCMR
   assignment hydration callables, and `platformBuildInfo` as the release process does.
2. **path-admin** — it vendors `functions/shared` at deploy (`scripts/sync-path-admin-runtime.mjs`);
   `release-firebase.mjs` handles it after functions.
3. **Hosting**, through the resilient wrapper: the browser runs the same graders, the compiler (item 7) and the
   keypad inference (item 6). Deploy functions and Hosting back to back, outside class hours (K's reasoning: a
   tab opened before the deploy grades its own feedback with the old code).
4. **No bank refresh, no Path release, no rules, no indexes, no migration.** No bank content changed. The Digital
   SAT rule is decided from the item's framework at issue time, so the CCMR banks need no refresh.

## Files outside lane P

- `src/platform/interaction/answerEntryTools.js` (item 6, one function) — the interaction layer.
- `scripts/report-classroom-regrade-candidates.mjs`, `scripts/lib/classroomRegradePlan.mjs` — K's report,
  extended as the brief asked.
- Tests owned by other jobs, assertions updated as described above: `algebraicForm`,
  `polynomialRelationAnswerEquivalence`, `responseKeypadProfile`, `secureMathAnswerRoundTrip`, `kSweep_ccmrBanks`,
  `tests/tools/kGrading_v5CompilerStandardAndExpLog`.
- No file in jobs N's or O's lanes (no inline font sizes, no test-prep content).

## What is left, and why

- **`pi/2` against `\frac{\pi}{2}`.** `stackDivisions` does not stack a division with a letter in it, so the two
  spellings stay apart; `π/2` against `pi/2` is fine.
- **The secure editor guards** (above): inequality and orderedPair could move to the math editor, and the π, √,
  %, $ guard could go, once the browser capture shows the editor's form for each.
- **Item 8** (above): the owner's decision, then a two-line grader change.
- **The Path's own choice ids, field-level choices** and the other platform items K listed are untouched.

### Noticed, not in scope (K's worked-solution and authoring items)

- An authoring warning for a graph-analysis question that asks for a vertex or center the function lacks.
- `inverseCompositionLabSolutionReview` treats a linear `b` as a horizontal scale (a different tool; consistent
  with its own grader).

## Verification

Final gate on HEAD:

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,174 pass, 0 fail (after merging main at 891811f) |
| `node --test tests/tools/*.test.mjs` | 1,627 pass, 0 fail |
| `npm run test:authoring-v5` | 686 pass, 0 fail |
| `npm run lint` | 0 errors (pre-existing warnings only) |
| `npm run build`, `npm run build:firebase` | pass |
| `npm run release:path:verify` | pass |
| `npm run test:classroom-regrade-report:emulator` | 5 pass, 0 fail (K's report on the emulator, with the widened scope) |
| `scripts/sweep-equivalence-verdicts.mjs --draws 3 --check-wrong` | 0 right → wrong, 0 wrong let through |

- **Failing first.** Every `pGrading_*` test was copied into a worktree of main and run there: each fails on
  main (the bank-wide number-line sweep passes on main because every bank endpoint is an integer; its exact-endpoint
  test fails). The report attribution was mutation-checked (5 of 6 tests go red without it).
- **Real browser (Chromium, Playwright).**
  - Item 6: the Digital SAT number box, compiled from the bank, rendered in the real `MathInput` at 1366×768 and
    390×844. On main's compiled field the keypad offers "Insert opening set brace", "Insert closing set brace" and
    "Insert a"; on this branch's it offers none of them, at both sizes (the phone checked with its tools opened).
  - Items 2 and 5: `tests/browser/answerRoundTrip.mjs` typed all 1,433 Path keys into the real MathLive editor; every
    serialization was graded with main's grader and this branch's. 1,123 right on both, 0 lost. (The other 310 are
    `{{template}}` keys the harness types literally; wrong on both.)
  - No CI step was added: both checks ran ad hoc (the item 6 harness was scratch and is not committed), and every
    grading rule is pinned in `tests/platform`.
- **Independent verifier.** One adversarial agent on the final diff; its six findings are above, each fixed and
  pinned.
- **Not run:** `npm run test:rules` (no rules changed); the long Playwright suites, left to CI.
