# Student push — Job O: test-prep worked solutions from the draw's own numbers

Branch `claude/student-push-o-testprep-solutions`. No PR opened (the coordinator opens it).

Every Digital SAT, ACT and TSIA2 Path template is also a Live Challenge question. Before this job, each one published a
single generic sentence as its worked solution ("Preserve equivalence.", "Use the model and the data.",
"Use the guaranteed geometric relationship."), and 16 Digital SAT templates published nothing. This job gives each
of them a worked solution of **the draw**, built from its own placeholders. It uses #469's method: only the review
and new derived values change, a derived value never touches the random stream, and every draw is checked against
an independent oracle. ASVAB's 44 reviews were already specific and are out of scope.

## Status by slice

| Slice | Templates | State |
| --- | --- | --- |
| Digital SAT | 465 | **Done.** 465 of 465 authored, none declined, pending 0 (`tests/platform/ccmrSolutionReviews_digitalSAT.test.mjs`) |
| ACT | 136 | **Done.** 136 of 136 authored, none declined, pending 0 (`tests/platform/ccmrSolutionReviews_act.test.mjs`) |
| TSIA2 | 167 | Not started (see "What is left") |

## How it is built

- **Source of truth.** `drafts/ccmr-v2.1/{digitalSAT,act,tsia2}/**/*.v2.1.json`, compiled with the repo tool
  `node scripts/build-ccmr-v2-1-production-release.mjs --write`. That tool regenerates
  `seed/pathQuestionBank/<exam>_pathQuestionBank_seed.json` and its `functions/seeds/` mirror. `--check` confirms
  that drafts, seed and mirror agree, and it exits 0 on this branch. No PSDA anti-clone override carries a
  `solutionReview`, so the reviews live in the drafts and nothing is overridden.
- **What changed per template.** `solutionReview` (headline, reasoning steps, common error, answer summary), plus
  new `generator.derived` values where a step needs an intermediate number, such as `bk: 'b+k'` or `sq: 'a*a+b*b'`.
  Derived values are evaluated after the parameters are drawn and consume no randomness. The tests prove that a
  draw is unchanged by them.
- **Clamps respected.** Headline ≤ 160 characters, each step ≤ 400, at most 5 steps (the projector shows 5),
  common error ≤ 400 and summary ≤ 240. These are the limits `roundSolutionRecord` / `buildPrivateSupport` apply.

## Verification (pinned in CI)

`tests/platform/ccmrSolutionReviews_digitalSAT.test.mjs` and `ccmrSolutionReviews_act.test.mjs` run the shared checks in
`tests/platform/helpers/ccmrSolutionReviewOracle.mjs` on 24 draws per template, from the production seed:

1. **Digest pin.** For every template, everything except `solutionReview` and `generator.derived` hashes to the
   value recorded on main before this job (`tests/platform/fixtures/ccmrSolutionReviewPins.json`), and every
   committed derived expression is unchanged. Prompts, choices, keys, response fields, grading, parameters and
   constraints therefore cannot have moved.
2. **A new derived value never changes a draw.** Each seed is generated twice, once from the template as shipped
   and once from the template stripped back to its committed derived block. The parameters, prompt and choice
   order must be identical.
3. **Pending count.** The number of templates whose review still hashes to the pinned generic text must equal
   `EXPECTED_PENDING`, which is now 0. `DECLINED` is empty: no template needed to keep its generic text.
4. **Each review solves its own draw.** On every draw:
   - **Shape.** The clamps above.
   - **Display.** No `1x`, `−1x`, `+ 0`, `^1`, doubled sign, leftover `{{ }}`, NaN, Infinity or float artefact.
     One exemption: math that restates the keyed option exactly as the question prints it. The ACT complex-sum
     key prints `6 - 1i` for some draws, and a review cannot state that key any other way.
   - **Relations.** Every equation in the headline, steps and summary is recomputed with mathjs. Numeric chains
     must hold exactly, or within the tolerance a shown `\approx` allows. Symbolic identities are checked at four
     sample points. An equation in one variable is checked at the review's own stated value, unless it restates
     the prompt.
   - **Key.** The summary, and the last step or the headline, reach the key. No losing option appears in the
     headline or the summary.
   - **Uses the draw.** The review mentions a value from its own prompt.
   - **Transport.** The Path support bundle and the Live Challenge round record carry the review intact.
   - **Grading.** For number fields, the production grader (`mathPath.buildIssuePlan` / `gradeResponse`) accepts
     the stated answer.
   - A template must have at least one relation the oracle verified, unless it is listed as `VERBAL` with a reason.
     These are 34 SAT and 4 ACT definitions or interpretations, such as "which criterion is SAS" or "what the intersection
     means". A `VERBAL` template that states a checkable relation fails.
5. **Mutation check (scratch, not committed).** The test was pointed with `MM_CCMR_REVIEW_SEED` at mutated copies of
   the seed, and each mutation was caught:
   - a wrong arithmetic result;
   - a distractor in the headline;
   - a `1x` display;
   - an answer summary naming a distractor.
   The ACT copy also caught:
   - a changed committed derived value (pin, draw and arithmetic checks);
   - a wrong new derived value (arithmetic check);
   - a `+ 0` display.

**Assessment safety.** No prompt, choice, key, response field or grader changed, and the digest pin proves it. The
review is published only where it was before: the Path recap after the item is answered, and the Live Challenge
round record after the round closes. This job did not touch the reveal timing.

**Gate.** `npm run test:platform` passed 11152 tests with 0 failures at the ACT boundary (after `npm ci` in
`functions/`, which this container lacked). `npm run lint` raised no new findings. `npm run build` passed.
`node scripts/build-ccmr-v2-1-production-release.mjs --check` reported 0 failures.

## Bank defects found (not in this lane; for P / content owners)

These are key or distractor problems in the committed content. They are not review problems, so they are reported
here and not fixed (no choice or key may change in this job):

- `mm_sat_A2_7D_factor_from_roots_cubic_v21`. When `r1=4` and `r2=5`, the distractor `x-(r1+1)` is also a true
  factor, so two choices are correct.
- `mm_sat_A2_7D_challenge_quartic_factor_structure_v21`. The distractor `x+(a+1)` is a true factor whenever
  `x^2+bx+c` has the zero `-(a+1)`.
- **ACT display (prompt or choice text, not the review):**
  - `mm_act_fn_1_polynomial-evaluation` prints `1x^2`, `+ 1x`, `+ 0x` and `+ 0`.
  - `mm_act_fn_2_piecewise-evaluation` prints `1x`.
  - `mm_act_fn_3_greater-zero`, `mm_act_geo_3_ellipse-vertex`, `mm_act_geo_ch2_hyperbola-vertices-distance` and
    `mm_act_fn_ch3_radical-rational-domain` print `(x + 0)`.
  - `mm_act_fn_ch1_composition` prints `+ 0`.
  - `mm_act_nq_3_complex-addition` and `mm_act_nq_ch1_complex-conjugates` print `1i`.
  - Distractor labels with float artefacts, such as `16.666666666666668\%`:
    - `mm_act_ies_rpp_5_percent-change`
    - `mm_act_ies_rpp_ch2_ratio-partition-percent`
    - `mm_act_ies_measurementunitsconversion_4_map-scale-distance`
    - `mm_act_fn_ch2_inverse-linear`
  The reviews avoid all of these forms.

The two SAT factor reviews explain the intended key correctly. Neither review names the distractor as wrong, so neither review
is ever false.

## Deploy targets (owner, Cloud Shell; dry-run first)

Only `functions/seeds/pathQuestionBank/*_pathQuestionBank_seed.json` changed among the deployed files. The rest of
the diff is `drafts/`, `seed/` and `tests/`, which deploy nothing (`scripts/lib/releasePlan.mjs`). So:

1. **Plan (dry run).** `node scripts/release-firebase.mjs` with no flag. It plans only and deploys nothing. Expect
   the target **functions** (the default codebase, because its bundled seeds changed) and nothing else: no
   path-admin, no rules, no indexes, no Hosting.
2. **Functions.** `node scripts/release-firebase.mjs --execute`. No function code changed, so this ships only the
   new bundled seed files, plus `platformBuildInfo` as every release does.
3. **Bank refresh (root admin, after step 2).** Open Administration → My Math Path content coverage → **Refresh
   SAT / ACT / TSIA2 release** (`refreshReleasedCcmrPathBanks`):
   - It validates all assessment documents read-only before it writes anything. If any are rejected, it returns
     `phase: "validation"` and writes nothing.
   - It then rewrites the `pathQuestionBank` documents from the deployed seed.
   - The content release id does not change (`ccmr-fidelity-v2.1-authentic-language` for all three exams).
     Sessions in progress therefore keep their release, and the TSIA2 one-time retirement is a no-op once its
     release is already stored.
   - Order on the panel, as it states: course Path release → ASVAB → SAT/ACT/TSIA2. Only the last is needed here.
4. **No migration, no rules, no indexes, no Hosting.**

Until the refresh runs, students keep seeing the generic solutions. Nothing breaks.

## What is left

- **TSIA2 (167).** Use the same method: copy the ACT test with `EXAM` changed (the pins are already in the fixture)
  and author the reviews in batches.

## Files outside the lane

None. Every change is in `drafts/ccmr-v2.1/`, the two compiled seed files, the new tests and helper, and this
handoff.
