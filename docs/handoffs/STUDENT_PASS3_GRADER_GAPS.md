# Student pass 3, wave 6 — grader gaps (N2, four refused spellings, exact radical pairs, `B^(E)/N`)

Branch `claude/pass3-grader-gaps`, from the integration base `claude/modest-pasteur-xzagn7` at `5062cba5`.

The W5-6 reviews ([STUDENT_PASS3_SECURE_ENTRY.md](STUDENT_PASS3_SECURE_ENTRY.md), review rounds 2 and 3) found these on
the integration base. W5-6 did not cause any of them. Every change is to grading only, in `functions/shared`. So it
applies to every grader on every surface:

- the secure and Path field grader (`functions/lib/mathPath.js` → `sameValue`, used by `secureItems.gradeItem`);
- the assignment matcher (`answerUtils.matchesFieldAnswer`);
- the browser, which imports the same modules.

Nothing a student sees changed. The renderer (`stackDivisions` without `constantOperands`) is untouched, and so are
the editor, the hints and the results page.

## Each item still reproduced on the base

I graded each case with `sameValue` and `matchesFieldAnswer` on a worktree of `5062cba5`. All of them reproduced.

| Item | Case on `5062cba5` | Verdict on the base |
| --- | --- | --- |
| 1 N2 | `10^-\frac{3}{2}` (≈ 0.0316) for the key `10^{-3}/2` (0.0005); `e^-\frac{x}{2}` for `e^{-x}/2`; `2^-\frac{n}{3}` for `2^{-n}/3` | **right** (a wrong answer passes) |
| 1 N2 | `\frac{e^{-x}}{2}` for `e^{-x}/2`; `\frac{10^{-3}}{2}` for `10^{-3}/2` | wrong (a right answer refused) |
| 2 | `x^{\sqrt[3]{2}}` / `x^(root(3)(2))`; `\frac{x_2^3}{4}` / `x_2^3/4`; `x^{2}_{1}/3` / `x_1^2/3`; `\left(\frac12\right)^{\pi}` / `1/2^pi`; `\frac{1}{2^{\pi}}` / `(1/2)^pi` | wrong, all five |
| 3 | `(1-sqrt(2),5-2sqrt(2))`, `(1-\sqrt{2},5-2\sqrt{2})` for `((-(-2)-sqrt(8))/2,2*((-(-2)-sqrt(8))/2)+3)` | wrong |

These are grading verdicts, not something drawn on the page, so the reproduction is the grader's own output. For the
only visual part, item 4's drawing, the evidence is the renderer's own function: `stackDivisions('2^(x-1)/3')` returns
`2^\frac{x-1}{3}`. I did not take a browser screenshot of it.

## What changed, item by item

### 1 · N2: a braced negative exponent stays one group

**What a student saw.** Take a key `10^{-3}/2`, which is 0.0005. The answer `10^-\frac{3}{2}`, which is about 0.0316,
was marked right. The editor's own right answer, `\frac{10^{-3}}{2}`, was marked wrong. Nobody saw either verdict on a
test before release.

**Why.** `expandLatexShorthand` unbraced every single-token group, including a negative one. So `^{-3}` became `^-3`
before the divisions were stacked, and the stacker then read `10^-3/2` as `10^-(3/2)`.

**The fix.**

- `expandLatexShorthand(value, { keepNegativeExponentGroups })`: `normalizeStructuralMathLive` passes the option, so
  `^{-3}` stays braced. Every other caller (the polynomial and radical parsers) reads what it read before.
- With the option on, `normalizeAnswer` keeps the braced negative exponent as one group through the stacking. The
  grading-only stacker then reads `B^{-E}/N` as `(B^{-E})/N` (W5-6's braced-exponent rule).
- After stacking, `^{-3}` is unbraced to `^-3` (`NEGATED_TOKEN`). That is the spelling every comparison read before,
  so a negative exponent with no division normalises exactly as it did.
- Side effect: `f^{−1}` written with a Unicode minus now meets the key `f^{-1}`. The sweep counts it as a newly accepted
  right spelling.

**Left as it is, deliberately: `e^(-x)/2` against `e^{-x}/2`.** The review lists this pair among the refused right
answers, but it is the ASCII `B^(E)/N` shape in item 4. The renderer draws `e^(-x)/2` as e^((−x)/2), and W5-6 grades
it the way it is drawn. Under that reading it is another number from e^(−x)/2. The pair becomes right only if the owner
picks standard precedence in item 4. It is pinned that way: `e^(-x)/2` stays wrong for `e^{-x}/2`, and `e^\frac{-x}{2}`
stays right for `e^(-x)/2`.

### 2 · Four right answers that were refused

The review asked me to check which pairs are really equal first. All five are the same number under the precedence
each spelling states:

- x^∛2 is x^∛2;
- (x₂³)/4 is (x₂³)/4;
- x^2_1 is x_1^2 (LaTeX puts both scripts on the same base);
- (1/2)^π is 1/2^π, because (1/b)^e = 1/b^e for every b > 0.

| Pair | Fix (all in grading) |
| --- | --- |
| `x^{\sqrt[3]{2}}` / `x^(root(3)(2))` | `canonicalSymbolSpellings`: ASCIIMath `root(n)(m)` is `\sqrt[n]{m}` |
| `\frac{x_2^3}{4}` / `x_2^3/4` | `stackDivisions` with `constantOperands` only: a one-letter name and its subscript (`x_2`, `x_{12}`) form one operand, also as the base of a power. A command's letter (`\alpha_1`) or a word (`log_4`) does not, and neither does an unbraced multi-digit subscript |
| `x^{2}_{1}/3` / `x_1^2/3` | `canonicalSymbolSpellings`: `^P_S` is `_S^P` when P is a number (one digit, or a braced group of digits); `e^x_1` is left as written |
| `\left(\frac12\right)^{\pi}` / `1/2^pi`, `\frac{1}{2^{\pi}}` / `(1/2)^pi` | `normalizeAnswer`: `(\frac{1}{N})^E` is `\frac{1}{N^E}` when N is a positive number. `(2/3)^π` is not `2/3^π`, and `(1/x)^2` is left as written |

### 3 · Algebra II `mm_A2_3C_v2_quadratic-formula-exact`: the grader was wrong

**What a student saw.** "Give both exact ordered-pair solutions." The minus and plus fields are keyed with the
generator's own text, for example `((-(-2)-sqrt(8))/2,2*((-(-2)-sqrt(8))/2)+3)`. Only that exact text passed.
`(1-\sqrt{2},5-2\sqrt{2})` was wrong whether it was typed or keyed, on Path and on a secure Test. No student can be
expected to write the generator's text, so the item could not be answered right.

**Grader or content.** The key is correct mathematics. What is wrong is the grader: an ordered pair is a point, and
the pair grader already compares plain coordinates by value (`(1/2, 3)` is `(0.5, 3)`, Job P). A coordinate with a root
was the one case it compared as text. Fixing the grader also covers any other pair key with a root. A content fix
would need a new family version, three seed copies and a bank release, and would still refuse `(2-\sqrt{8})/2`.

**The fix.**

- New `functions/shared/exactConstantValue.mjs` reads an exact constant:
  - it reads integers, `+ − × ÷`, brackets, integer powers up to 12, `\frac` and square roots;
  - it refuses a decimal point, a letter, π, an nth root, a negative radicand, a zero denominator, and a `\frac`
    right after a number (`1\frac{1}{2}` is a mixed number to a student, never a product).
- `sameNumericPair` falls back to it only when a coordinate is not a plain number **and each side has a coordinate
  with a root**. A pair of plain numbers keeps its old reading, so `(1+2,4)` is still not `(3,4)` (review B2). Then:
  - a coordinate with a root must meet one with a root (never a decimal);
  - the values must agree to 1e-9 relative.
  So the other root, swapped coordinates, decimals (short or long), a long fraction, and `1-\sqrt{2}+\frac{1}{10000}`
  all stay wrong. `(\sqrt{4},1)` against `(2,1)` stays wrong too, as on the base (review S4).
- `matchesFieldAnswer`'s `answerFormat: 'orderedPair'` branch returned false for any key it could not read as two
  plain numbers. It now falls back to `sameNumericPair`, and, for a key written as a pair that is not two constants
  (`(\pi,\sqrt{2})`, `(x+\sqrt{2},1)`), to the same text (review S3). A key not written as a pair (`none`) is still
  refused there, as before.

**Decimals stay wrong.** The prompt asks for exact pairs. A decimal for an irrational coordinate is refused, even one
written to eleven places. If the owner wants decimals accepted, that is a separate decision (below).

**Other families whose keys are unsimplified generator text.** Method:

- I scanned every drawn key in the sweep corpus (Path bank, 3 draws, plus the secure-assessment seed) for generator
  bookkeeping: `-(-a)`, `+(-a)`, `(a)`, `1*x`, `x^1`, `*`.
- For each one, I wrote the natural simplified spelling and graded it on the base.

Most families accept the simplified spelling already, through the form-preserving comparator (75 families in the scan, for
example `f(x)=4(x-(-0.5))^2+(-8)`). The ones that refuse it, i.e. where only the verbatim key passes (or the verbatim
key and spellings close to it):

| Family | Key (drawn) | Natural right answer refused | When |
| --- | --- | --- | --- |
| `mm_A2_3C_v2_quadratic-formula-exact` (Algebra II) | `((-(-2)-sqrt(8))/2,…)` | `(1-\sqrt{2},5-2\sqrt{2})` | every draw — **fixed here** (grader) |
| `mm_A2_3C_v2_quadratic-formula-exact`, the `reduced` field | `x^2+ 0x- 5=0` | `x^2-5=0` | draws with p = 0, about a fifth — **fixed here** (content, review S1) |
| `mm_A2_7G_v2_square-root-variable-power` (Algebra II, expression) | `6*x^1*sqrt(x)` | `6x\sqrt{x}` | draws with power 1 (`6x^3\sqrt{x}` for `6*x^3*sqrt(x)` passes) |
| `mm_A2_7G_v2_cube-root-variable-power` (Algebra II, expression) | `4*x^1*\sqrt[3]{x^1}` | `4x\sqrt[3]{x}` | draws with power 1 |
| `mm_A2_3A_v2_graph-linear-quadratic-system` (Algebra II, equation) | `y=(x-(0))^2- 2` | `y=x^2-2` | draws with h = 0 |
| `mm_A2_3C_v2_tangent-repeated-root` (Algebra II, equation) | `(x-(0))^2=0` | `x^2=0` | draws with root 0 |
| `mm_A_10D_v2_reverse-factor-from-expanded` (Algebra I, expression) | `4*x*(1*x+(-2))` | `4x(x-2)` | draws with inner coefficient 1 |

I did not change these five here, because each is form-sensitive:

- `x^1` → `x`, `(x-0)` → `x` and an inner `1x` are simplifications;
- a "simplify" or "factor" item is graded on form.

The safe fix is in the content: have the generator write the simplified text, as `{{b|signed}}` already does for signs.
An alternative is a grader rule limited to these exact bookkeeping shapes. That is for the owner to choose.

`mm_A2_5C_v2_symbolic-expression-role-map` refuses `\log_4(y)=x+2` for `log_4(y)=x-(-2)`, but `log_4(y)=x+2` passes.
That is a `\log` spelling gap, not generator text, and the field is typed text, so I am noting it and nothing more.

### 4 · For the owner: an ASCII `B^(E)/N` key (nothing changed)

**What happens today.**

- `stackDivisions` (the renderer) draws `2^(x-1)/3` as `2^\frac{x-1}{3}`, which is 2^((x−1)/3).
- W5-6 round 3 grades it the way it is drawn: `2^\frac{x-1}{3}` is right.
- `\frac{2^{x-1}}{3}`, `(2^(x-1))/3` and `2^{x-1}/3` are wrong.
- Standard precedence would read the key as (2^(x−1))/3.

**How many authored keys have this shape: none that I can see.** In the sweep corpus, 9,349 real fields (every Path
bank on 3 draws, the secure-assessment seed, `docs/assignments`, `drafts`, `seed`), no key or accepted form holds
`^(…)/`. A text search of every JSON or JS content file outside the code finds none either. Eight keys use an ASCII
`^(` group, and none of them is followed by a division:

- `mm_A_12D_v2_geometric-*` (Algebra I): `4*(2)^(n-1)`, `96*(0.5)^(n-1)` with the accepted forms `96*(1/2)^(n-1)` and
  `96/2^(n-1)`;
- `mm_A2_5B_v2_decay-explicit-and-recursive` (Algebra II): `V=1800(0.85)^(4t)`.

The live `pathQuestionBank` collection can hold families that are not in the repository. I have no production access,
so those are not counted.

**The two choices.**

1. **Make the renderer follow precedence.** `stackDivisions` would draw `B^(E)/N` as `\frac{B^{E}}{N}`, and the grader
   would grade it that way.
   - This matches how the key reads to anyone who writes ASCII math, and how a calculator or a CAS reads it. It also
     makes `e^(-x)/2` right for `e^{-x}/2` (item 1).
   - It changes what students see for any such key: Path, assignments and the results page would all draw it
     differently.
   - Any verdict already recorded for the drawn reading would differ on regrade. There are none in the repository.
2. **Keep the grader following the renderer** (today).
   - What a student is shown and how it is graded stay the same.
   - An author who means (2^(x−1))/3 has to write `(2^(x-1))/3` or `2^(x-1)/3` with braces. Until then:
     - the editor's spelling of the drawn number, `2^{\frac{x-1}{3}}`, stays refused (W5-6);
     - so does `e^(-x)/2` against `e^{-x}/2`.

Either way, an authoring lint that flags `^(…)/` in a key would stop new ambiguity. No key has the shape today.

## The sweep

`node scripts/sweep-equivalence-verdicts.mjs --base <worktree of 5062cba5> --draws 3 --check-wrong`:

```
fields 9816, graded 280704
rightToWrong 0, nearMissNowRight 0, nearMissNowRefused 0
stackedWrongAccepted 0, editorSpellingsRefused 0
gapSpellingsRefused 0, gapWrongAccepted 0
gapSpellingsRefusedOnBase 3340, gapWrongAcceptedOnBase 15
wrongToRight 33 (all built as right spellings)
exit 0
```

**What the 33 are.**

- 30 are the braced negative exponent: `\frac{B^{-E}}{N}` and Unicode-minus spellings of `B^{-E}/N`.
- 3 are `f^{−1}` with a Unicode minus.

**What I added to the sweep** (`scripts/sweep-equivalence-verdicts.mjs`): 293 synthetic keys for the wave-6 shapes,
each with right spellings that must be accepted outright and wrong ones that must be refused outright. Two new
counters cover them, `gapSpellingsRefused` and `gapWrongAccepted`, and the sweep exits 1 if either is non-zero. The
same checks run on the base too (`…OnBase`), for the record. The shapes:

- `B^{-E}/N`, against `B^-\frac{E}{N}`, `B^{-\frac{E}{N}}`, `B^{\frac{-E}{N}}` and `\frac{B^E}{N}`;
- `x^(root(n)(m))`, against a square root, another radicand and another index;
- `L_S^P/N`, against the power over N, the subscript over N, and the swapped fraction;
- `1/N^E` and `(1/N)^E`, against a negated power and another denominator, plus the non-unit guard `2/3^E` against
  `(2/3)^E`;
- the quadratic-formula-exact pairs for every p the family draws and a grid of m, b, D. They are checked against the
  other root, swapped coordinates, decimals (rounded and full) and a wrong y.

**Two fixes to the sweep's own spelling.**

- Its editor-numerator pattern started an atom in the middle of a number or after `_`. That built `1\frac{0^{-3}}{2}`
  out of `10^{-3}/2`, which the editor never writes.
- The swapped-fraction near miss is skipped when it is the same number (`2/\sqrt{4}` for `\sqrt{4}/2`, both 1).

**The sweep goes red when a fix is undone** (exit 1 each time):

| Fix undone | Counter |
| --- | --- |
| N2 | 15 gap wrong accepted, 15 gap refused, 10 editor spellings refused |
| `root()` | 9 refused |
| subscripted names | 27 refused |
| unit-fraction powers | 40 refused |
| the root-against-root guard on a coordinate | 810 wrong accepted |
| the exact pair | 3,240 refused |

## Proof beyond the sweep

- **`tests/platform/pass3GraderGaps.test.mjs`** (new, 8 tests).
  - Every case goes through the three graders a student meets:
    - `secureItems.gradeItem` over `mathPath.privateGradingDefinition`;
    - `matchesFieldAnswer`, with the `orderedPair` format for pairs;
    - `sameValue`.
  - It asserts the three agree.
  - Each right answer stands beside a wrong one, and the normalised text is pinned where it carries the rule.
  - The last test draws `mm_A2_3C_v2_quadratic-formula-exact` from the real Algebra II seed three times and grades the
    simplified exact pair (right) and the other root (wrong) through the secure grader.
- **Mutation checks**, each red when the code is broken and green when it is restored. There are 12, one for each new
  rule and guard:
  - the N2 brace;
  - the `NEGATED_TOKEN` unbrace;
  - `root()`;
  - the script order;
  - subscripted names;
  - a command letter taken as a name;
  - unit-fraction powers;
  - a non-unit fraction power;
  - the root-against-root guard;
  - a loose root tolerance;
  - the assignment `orderedPair` fallback;
  - the exact pair.

  Two mutations were green on the first try, a loose tolerance and a weak non-unit mutation. I added the near-root
  wrong answer and rewrote the mutation, and both went red.
- **The editor's own spelling, captured in a browser.** `tests/browser/secureAccessParity.mjs --write` now enters the
  quadratic-formula pair two ways:
  - on a Chromebook: typed, with the √ key and the arrow out of the root;
  - on a 390×844 phone: keypad only.

  Both send `(1-\sqrt2,5-2\sqrt2)`. Both are recorded in `tests/platform/fixtures/secureAnswerRoundTrip.json` and
  graded right by `secureMathAnswerRoundTrip` in CI. With this fixture, the round-trip test fails on `5062cba5` (that
  capture) and passes here.

  Typing `sqrt2,` straight through keeps the caret inside the root: MathLive builds √(2,5−2…), and the student sees it
  on the screen. So that entry is not a right answer and is not recorded.
- **Nothing tells the student the answer before release.** No student-facing code, hint or result changed.
  `secureAccessParity` checks for evaluated values and verdicts on the page, and it passes (26 of 26).

## Gate (first round, on `096311e8`; the re-gate after the review is in the last section)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,782 pass, 0 fail |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail, 1 skipped (`composedWorkflowGraphStages`: no merge-base history in a shallow clone) |
| `npm run lint` | exit 0, no errors; warnings only, none on a changed line |
| `npm run build` | pass |
| `npm run build:firebase` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline. studentHome **848.1 KB** gzip, 186 files (847.1 KB on the base; +1.0 KB is the exact-value reader in the shared grader); signIn 291.3 KB. Baseline file not touched |
| Grader unit suites: `*Equivalence*`, `stackDivisions`, `secureMathAnswerRoundTrip`, `orderedPairSemanticGrading`, `pass3GraderGaps` | all pass |
| The sweep, all counters | above; exit 0 |
| `npm run test:challenge-finish` | 477 pass |
| `npm run test:canonical-persistence` | 35 pass |
| `npm run test:secure-exam-navigation` | 25 pass |
| `npm run test:grade-authority` | 14 pass |
| `npm run audit:answer-acceptance` | PASS: 27,257 known-correct variants, 0 false negatives, 0 unexpected findings |
| `tests/browser/secureAccessParity.mjs` (emulator Vite, 5203) | 26 / 26, with `--write` and without |
| `tests/browser/mathEntryContract.mjs` (plain Vite, 5199) | every case holds |
| `tests/browser/fractionTemplateGrading.mjs` (5199) | all checks pass |
| `tests/browser/questionFamilyCases.mjs` (5199) | all 36 journeys pass |

No Firestore rules changed, so I did not run `test:rules`. No other emulator suite reads the changed modules beyond
those listed.

## Deploy targets

`node scripts/release-firebase.mjs --since 5062cba5`:

- **Functions, the default codebase.** The changed modules are shared by the field graders behind `submitPathResponse`,
  `submitSecureExamResponse`, `finalizeSecureExam`, `gradeTestCyclePreviewItem`, `submitTestCycleCorrectionResponse`,
  `gradeChallengeDryRunResponse`, the assignment grading paths and more. The release plan deploys the whole default
  codebase in 27 paced groups. Prefer that to hand-picking names: answerEquivalence is loaded too widely.
- **`functions:path-admin`.** It vendors `functions/shared` (gitignored, written at predeploy).
- **Hosting**, through `npm run deploy:hosting`. The browser grades Check and practice with the same modules.
- **The course Path release** (review S1 changed one family's content): the release is now
  **`course-path-v2-01d45bb15d913284`** (was `course-path-v2-11197c7a838bb8a3`; see the last section). It reaches students only after a root
  admin publishes it (Administration → My Math Path content coverage, `publishCoursePathReleaseV2`), after Hosting.
- No rules, no indexes.

**Order.** Default-codebase functions, then `functions:path-admin`, then Hosting, then the admin publish of the new
release id. Hosting must not carry a grader the server does not have, and Publish is disabled until Hosting names the
same release.

**Release note: one lowered verdict.** An ASCII `B^-E/N` answer against a braced key, for example `10^-3/2` for
`10^{-3}/2` (also `2x^-1/5`, `y=2^-x/3`, `P=100(2)^-t/5`, `x^-a/b`), was right on the base and is wrong now. The
renderer draws `10^-3/2` as 10^(−3/2), and the grader now reads it as drawn (decision 1). No key in the repository has
the shape.

## Decisions for the owner

1. **Item 4, the ASCII `B^(E)/N` reading:** the renderer follows standard precedence, or the grader keeps following the
   renderer (today). No authored key in the repository has the shape. The choice also decides `e^(-x)/2` against
   `e^{-x}/2`, and the one verdict this branch lowers: an ASCII `B^-E/N` (`10^-3/2`) against a braced key
   (`10^{-3}/2`), right on the base, is wrong now because it is graded as it is drawn, 10^(−3/2).
2. **Decimals for an exact radical pair** (quadratic-formula-exact): refused, because the prompt asks for exact pairs.
   Accepting a decimal to some number of places would be a new, per-family rule.
3. **The five other families** whose generator text refuses a simplified answer on some draws (table in item 3): fix
   the content (generator writes simplified text), or add a narrow grader rule. My recommendation is the content.

## Outside my scope

- `tests/browser/secureAccessParity.mjs` (W5-6's driver) gains the two quadratic-formula pair trials and the
  `QUADRATIC_FORMULA_PAIR` constant.
- `tests/platform/fixtures/secureAnswerRoundTrip.json` is re-recorded by that driver. It gains those two captures and a
  new `generatedAt`; every other trial is byte-identical.
- `functions/shared/algebraicForm.mjs`: `expandLatexShorthand` takes an option. With the default it behaves exactly as
  before.
- Content (review S1): `mm_A2_3C_v2_quadratic-formula-exact`'s reduced-equation key and its worked step use
  `{{p|xterm}}` instead of `{{p|signed}}x`, in all four copies (`functions/seeds`, `seed`, `drafts/algebra2.json`,
  `drafts/fidelity-v2/algebra2/A2.3C.json`). `familyVersion` is unchanged: the served item differs only in the p = 0
  key's spelling, and misconception evidence is keyed by family version. The course release manifest and the
  browser release identity are rebuilt (`npm run release:path:build`); only this family's hash moved.

## Not done

- The five other unsimplified-generator-text families (decision 3).
- The live `pathQuestionBank` collection may hold families that are not in the repository. Neither the shape counts
  nor the sweep can see them.
- A browser screenshot of the renderer's `B^(E)/N` drawing (item 4). The evidence is the renderer function's own
  output.
- Number fields: an unsimplified radical number key (for example `sqrt(8)/2`) is still compared as text, and
  `0.0005` is not read as `10^{-3}/2`. Both are outside these items. Comparing a number field by exact value would
  have to respect "simplify" items, the way pairs do not need to.

## Review of `096311e8`: the fixes

The review is by session_01AsRTxk1SsUyxHkNuS5Sv9j, relayed by the integrator. I merged the new base `3cb782a9`
first (a merge commit). Verdicts are written as server / assignment / sameValue.

| Finding | Fix | Proof |
| --- | --- | --- |
| **B1** Right answers newly refused: an ASCII negative power in a denominator, `3/x^-2` for `3/x^{-2}`, `1/x^-2`, `3/2^-x` (RRR on the base, www at `096311e8`) | Two parts. (1) The reviewer's fix: `normalizeStructuralMathLive` keeps `^{-T}` braced only when a `/` follows it (`algebraicForm.mjs`). (2) The fuller one: in grading, the stacker reads a denominator's `^-T` (one number or letter, nothing binding after it) as its power (`stackDivisions.mjs`). So `\frac{3}{x^{-2}}` is now right for `3/x^{-2}` and `3/x^-2` as well (www on the base) | The three pairs are back to RRR; `\frac{3}{x^{2}}` and `\frac{3}{x}^{-2}` stay wrong. `3/x^-2y` for `3/x^{-2}y` stays right, which only (1) keeps. Each part's mutation is red |
| **B2** Wrong answers newly accepted in pairs: mixed numbers (`(1\frac{1}{2},4)` for `(\frac{1}{2},4)`, `(2 1/2,4)` for `(1,4)`), unsimplified arithmetic (`(1+2,4)` for `(3,4)`, `(6/2,8-4)`, `(-(-2),3)`, `(2^3,1)`) | The reviewer's (a) and (b): the exact reading runs only when each side has a coordinate with a root, and `exactConstantValue` never reads a `\frac` after a number. `(2*(3)+1,5)` is no longer read as `(7,5)`: no corpus key has that shape | Every case is back to its base verdict (wrong on all three graders, and in an expression field). Both mutations red |
| **S1** The family was still unanswerable when p = 0: the `reduced` key `x^2+ 0x- 5=0` refused `x^2-5=0` | Content: `{{p|xterm}}` (the zero-aware filter the bank already uses) in the key and the worked step, all four copies. Release rebuilt: `course-path-v2-fdcfdcd711e6401f` | 200 draws, natural answers in all four fields: **200 of 200 right** through `mathPath.gradeResponse` and through `secureItems.gradeItem` (0 of 200 on `3cb782a9`); 800 wrong variants (a pair twice, another reduced equation, another discriminant, a wrong y), 0 accepted. Pinned over 60 draws including p = 0; reverting the key is red |
| **S2** A lowered verdict the handoff did not name: ASCII `B^-E/N` against a braced key (`10^-3/2` for `10^{-3}/2`) | Kept: it is graded as drawn. Named under decision 1, in Deploy (release note) | Pinned wrong for `10^-3/2`, `2x^-1/5`, `y=2^-x/3`, `x^-a/b`; in the sweep with `P=100(2)^-t/5` too |
| **S3** The assignment matcher refused identical text for a pair key that is not two constants (`(\pi,\sqrt{2})`, `(x+\sqrt{2},1)`, `(1,root(3)(2))`) | The orderedPair fallback also takes the same normalised text, for a key written as a pair. A key that is not a pair (`none`) is still refused there, as `kSteps_linesAndSlope` requires | RRR now; `(1,\sqrt[3]{3})` stays wrong; `none` pinned refused. Two mutations red (no fallback; fallback for any key) |
| **S4** `(\sqrt{4},1)` vs `(2,1)` (www on base and head) | Left as it is, with B2(a): a root is read only against a root | Pinned wrong |
| **S5** Three mutations stayed green | `x^{n}_{1}` vs `x_1^n` pinned wrong (the script order moves only a number power); `(1/0)^2` pinned unchanged; the decimal-point check was dead (a `.` is not a token anyway): removed, with a comment, and `1.5` pinned refused. The `decimal` guard on a coordinate was dead too: removed | All red when broken |
| **N3** `(1/2)^x^2` equalled `\frac{1}{2^x}^2` | `(?!\^)` after the exponent in `unitFractionPowers`; `root(2)(m)` is `\sqrt{m}` | Both pinned, both mutations red |

**Sweep against `3cb782a9`** (`--draws 3 --check-wrong`), with the review's shapes added (denominators, the B2 pairs,
the S3 text pairs, N3, the S2 lowered spellings):

```
fields 9833, graded 281097
rightToWrong 0, nearMissNowRight 0, nearMissNowRefused 0
stackedWrongAccepted 0, editorSpellingsRefused 0
gapSpellingsRefused 0, gapWrongAccepted 0
gapSpellingsRefusedOnBase 3358, gapWrongAcceptedOnBase 30
wrongToRight 60 (all built as right spellings: the editor's stacked negative power, Unicode minus)
exit 0
```

**Re-gate on the merged head:**

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,787 pass, 0 fail |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail, 1 skipped (as before) |
| `npm run lint` | exit 0 |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `npm run release:path:verify` | the committed manifest matches the content |
| first-load budget | within baseline; studentHome **848.2 KB** |
| grader suites (`*Equivalence*`, `stackDivisions`, `secureMathAnswerRoundTrip`, `orderedPairSemanticGrading`, `pass3GraderGaps`) | 130 pass, 0 fail |
| `test:challenge-finish` · `test:canonical-persistence` · `test:secure-exam-navigation` · `test:grade-authority` | 477 · 35 · 25 · 14 pass |
| `npm run audit:answer-acceptance` | PASS, 0 false negatives, 0 unexpected |
| `secureAccessParity` (no `--write`) | 26 / 26 |
| `mathEntryContract` · `fractionTemplateGrading` | pass · pass |
| `questionFamilyCases` | all 36 journeys pass |
| quadratic probe (Path and secure, 200 draws) | 200 / 200 right, 0 wrong accepted |

## The old key's form stays right (integrator, after `94a27828`)

**Question.** S1 keeps `familyVersion`. A p = 0 attempt that typed the old key's own form, `x^2+0x-5=0`, is wrong
against the new key `x^2- 5=0` on every grader. Would a re-grade lower it?

**Recorded attempts keep their key.** Path and secure tests grade against the private grading stored with the issued
question, never against the template:

- Path: `functions/index.js:16595`, `mathPath.gradePathToolResponse(currentQuestion.privateGrading, …)`, the session's
  stored current question;
- secure: `functions/lib/secureItems.js:342`, `gradeItem(readStoredItem(storedItem)?.privateGrading …)`, the stored
  item (`secureItemStorage.js`).

So an attempt already recorded is re-graded against `x^2+ 0x- 5=0`, its own key. The one place I found that
regenerates from the template is the Test Cycle preview regrade (`functions/index.js` ~24860). It is limited to a
teacher's preview seed, not a student record.

**The belt anyway.** The old spelling is an accepted form beside the new key, in all four copies:
`"accepted": ["x^2{{p|signed}}x{{q|signed}}=0"]`. A regeneration from the template keeps the base verdicts. For p ≠ 0
it is the key itself. It is content, not a grader `0x` rule.

- The release is now **`course-path-v2-01d45bb15d913284`** (it replaces `course-path-v2-fdcfdcd711e6401f` in Deploy).
  `release:path:verify` passes, and only this family's hash moved.
- Probe, 200 draws, through `mathPath.gradeResponse` and `secureItems.gradeItem`:

  | Draws | Old form right | New form right |
  | --- | --- | --- |
  | p = 0 (38) | 38 / 38 on both graders | 38 / 38 on both graders |
  | p ≠ 0 (162) | 162 / 162 on both graders | 162 / 162 on both graders |

  - Natural answers in all four fields: 200 / 200 right on both graders.
  - 600 wrong reduced forms were accepted 0 times: the old form with another constant, another x-coefficient, and
    another constant without the x-term.
  - 800 other wrong variants were accepted 0 times.
- Pinned in `pass3GraderGaps` over 60 draws: the old form is right, and the old form with another constant is wrong.
  Removing the accepted form turns it red.

