# Student push — Job O2: test-prep bank content fixes

This is the follow-up to job O (#486). It fixes the bank defects that job O reported in its handoff,
`STUDENT_PUSH_O_TESTPREP_SOLUTIONS.md`. Branch: `claude/student-push-o-testprep-solutions`, which is the session's
designated branch, restarted from main@03f7e53 once #486 had merged. No PR has been opened; the coordinator opens
it.

## What changed

**74 templates** across Digital SAT (27), ACT (15) and TSIA2 (32). The full list is the fixture
`tests/platform/fixtures/ccmrContentFixMainTemplates.json`, which holds main's version of each one.

### 1. Two Digital SAT keys that a distractor could also match

- **`mm_sat_A2_7D_factor_from_roots_cubic_v21`**
  - When `r1=4` and `r2=5`, the distractor `x-(r1+1)` is `x-5`, which is also a true factor.
  - This affects 4 of the template's 64 parameter combinations.
  - New constraint: `r1p!=r2`.
- **`mm_sat_A2_7D_challenge_quartic_factor_structure_v21`**
  - The distractor `x+(a+1)` is a factor whenever `-(a+1)` is a zero of `x^2+bx+c`.
  - This affects 8 of 504 combinations: `(a,b,c)` = (2,4,3), (2,5,6), (2,6,9), (3,5,4), (3,6,8), (4,6,5), (5,7,6), (6,8,7).
  - New constraint: `(a+1)*(a+1)-b*(a+1)+c!=0`.

Both fixes keep the distractor and stop issuing the defective draws. The generator retries a rejected draw from
the same random stream, so every other seed produces exactly the question it produced on main.

### 2. Display faults in prompts, choices and keys (72 templates)

All fixes use the generator's own filters, or new derived display values:

- **Coefficient of 1:** `1x`, `-1(x-h)^2`, `1\sqrt{8}`, `1i`.
  - A placeholder written directly before `(`, `\sqrt`, `\pi` or a single variable letter, inside math, now uses
    the `coef` filter (1 becomes nothing, -1 becomes "-").
  - In `mm_act_nq_3_complex-addition`, the key's imaginary part is printed with `signed`, which no filter can turn
    into a bare `i`. A constraint, `abs(b-d)!=1`, takes those draws out instead.
- **Zero terms:** `x + 0`, `+ 0x`, `y-0`.
  - A `signed` placeholder after a variable now uses `term`, or `xterm` for an x-term.
  - Hand-written `+{{b}}` and `y-{{y1}}` use `term`, with a new negated derived value where needed.
- **Float artefacts:** `102.40000000000002`, `0.30000000000000004`, `16.666666666666668%`.
  - Each affected value is shown through a new derived `<name>Shown`. It is rounded to 4 decimals where the
    value is meant to be exact, and to 2 decimals for a genuinely repeating distractor (16.67%).
  - The original derived value, and every constraint that reads it, is unchanged.
- **`$3 dollars` choice labels** (TSIA2 `qr_pc_*`) and `$29 dollars` (TSIA2 `leis_6`) now read `3 dollars`.
  - Prose currency in prompts ("costs $30 and $24") is left alone. The renderer's `splitMathSegments` treats it as
    prose, and the test checks that across every prompt.

Job O's worked reviews for these templates get the same transformation, so they still restate the key as it is
printed.

### Not changed

All of the following are listed for the owner and were not changed:
- **Exponent of 1:** `x^{ 1 }` in SAT `A_11B_challenge_2`, `A2_5D` and `A2_7G_challenge_3`.
- **A denominator of 1:** `\frac{\sqrt{11}}{1}` in TSIA2 `rim_8`.
- **A gradient of `/1`:** `-7/1` in TSIA2 `gac_6`.
- **`(x)`:** a fixed factor that collapses to `(x)` when its shift is 0, as in ACT `fn_3`, `geo_3` and `geo_ch2`.
  It reads correctly but is not the simplest form.

**Done later (CT14).** Each form above is gone, with the others the CT12 audit
(`scripts/audit-testprep-display-leftovers.mjs`) and a walk over every combination of every template found: 60
templates in all, listed in `tests/platform/testPrepDisplayLeftovers.test.mjs`. An exponent of 1 uses `pow`; a
shift of 0 in a conic uses the new `xshift`/`yshift` words; a plural unit after 1 uses the new `plural` filter; a
worked step that divided by something that can be 1 says the coefficient in words instead of `\frac{n}{1}`; a
"where 14>0 and 2>1" clause over the generator's constants is gone. A draw that would still print one of them
(a rise of 1 in a choice, a point at 0) is refused by a constraint added at the end of the list, so every other
seed deals the same question, choice ids and key as before. ACT `fn_3` was already clean: its constraints never
deal a zero root. Left as they are, because they are the problem's own numbers and may be on purpose: fractions
that reduce (the audit's `reducibleFraction`, 214 templates) and radicals not in simplest form
(`unsimplifiedRadical`, 55).

**Deploy order.** The new words `plural` and `yshift` are in `functions/shared/pathQuestionGeneration.mjs`. A
generator without them prints an unknown filter as the bare number (a translated point reads "2 unit2 to the
right"), so the functions (and the path-admin runtime sync) must be deployed before the coordinated bank refresh
that writes these documents.

## Assessment safety and stored work

- **Release id: no change.** Every document keeps `ccmrContentRelease: ccmr-fidelity-v2.1-authentic-language`. The
  coordinated refresh rewrites the bank documents in place, exactly as it did for job O.
- **Issued items are not touched.** Path sessions, Live Challenge rounds and secure items store the question they
  issued, so an item already issued keeps its wording and its key.
- **No stored verdict flips.**
  - No choice id, response field, parameter range or existing derived value or constraint changed. The digest and
    structure tests enforce this.
  - For 200 seeds per template, every draw that a new constraint does not remove has the same parameters, the same
    choice ids in the same order, and the same keyed response as on main.
  - Grading uses choice ids and response fields, so every recorded verdict means what it meant before.
- **Attempts already graded on the defective key draws.** These can't be fixed here and are listed for the owner;
  nothing is migrated.
  - On a cubic draw with `r1=4, r2=5`, a student who chose `x-5` was marked wrong, although `x-5` is a factor.
  - On a quartic draw at one of the 8 combinations above, a student who chose `x+(a+1)` was marked wrong, although
    it is a factor.
  - Query: attempts on those two template ids whose stored parameters match, and whose submitted choice is the
    distractor's runtime id. The owner may choose to regrade them.
- **Nothing reveals an answer.** The only review changes are display transformations of job O's reviews, and the
  reveal timing is unchanged.

## Verification

`tests/platform/ccmrContentFixes.test.mjs` contains 7 tests. On this branch all 7 pass. On main@03f7e53, with the
same test and fixtures, the key and display tests (4, 5 and 6) fail, and the main-digest test (1) fails because
the 74 listed templates are not yet different.

1. **Main digests.** Every document in the three banks matches its digest on main
   (`fixtures/ccmrContentFixPins.json`), except the 74 listed templates, which must differ. `functions/seeds` is
   identical to `seed/`.
2. **Fixed templates.** Ignoring prompt and choice wording, the review, derived values and constraints, each fixed
   template is identical to main. Main's derived values and constraints are kept.
3. **No verdict flips.** For 200 seeds per fixed template, any draw whose parameters moved was rejected by a new
   constraint. Every other draw has the same choice ids, the same order and the same keyed response.
4. and 5. **Key fixes, exhaustively.** Every parameter combination is generated through the production generator.
   - Each defective combination was issued on main and is no longer issued.
   - On every issued draw, each choice `x±k` is tested as a factor by substituting its zero.
   - The production grader (`mathPath.buildIssuePlan`/`gradeResponse`, on the runtime choice ids a student
     submits) marks exactly the factor correct.
6. **Display scan.** No prompt or choice in any template of the three banks, over 80 draws each, shows a
   coefficient of 1, a zero term, a float artefact or "$N dollars", checked in the renderer's own math segments.
7. **Distinct choices.** No fixed template shows two choices identically, over 200 draws.

**Job O's review tests.**
- Digest pins are updated for the 71 job-O-pinned templates among the 74. The new display-derived values are added
  to their pinned derived block, so job O's "a new derived value never changes a draw" check uses them as the
  baseline.
- `ccmrSolutionReviews_{digitalSAT,act,tsia2}` pass at 200 draws per template.

**Gate.**
- `npm run test:platform`: 11205 tests pass, 0 fail.
- `npm run lint`: no new findings.
- `npm run build`: passes.
- `node scripts/build-ccmr-v2-1-production-release.mjs --check`: 0 failures.

## Deploy targets (owner, Cloud Shell; dry-run first)

This is the same path as job O. Among deployed files, only the three `functions/seeds/pathQuestionBank/*`
test-prep banks changed.

1. **Plan:** run `node scripts/release-firebase.mjs` with no flag, which plans only. It should list the
   default-codebase functions and nothing else.
2. **Deploy:** run `node scripts/release-firebase.mjs --execute`.
3. **Refresh the bank** (root admin, after step 2): Administration → My Math Path content coverage → **Refresh SAT /
   ACT / TSIA2 release** (`refreshReleasedCcmrPathBanks`). It validates read-only before it writes, and the release
   id is unchanged.
4. **Nothing else:** no migration, rules, indexes or Hosting changes.

## Files

- Drafts in `drafts/ccmr-v2.1/{digitalSAT,act,tsia2}/` and the compiled `seed/` and `functions/seeds/` banks.
- New: `tests/platform/ccmrContentFixes.test.mjs` and its two fixtures, `tests/platform/fixtures/ccmrContentFix*.json`.
- Updated: 71 lines of `tests/platform/fixtures/ccmrSolutionReviewPins.json`.
- Nothing outside the lane.
