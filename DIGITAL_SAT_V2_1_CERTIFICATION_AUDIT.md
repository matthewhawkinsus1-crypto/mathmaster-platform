# Digital SAT Mathematics V2.1 — deep certification audit

Branch `claude/digital-sat-v2-1-deep-certification`, cut from `main` at
`87ac9b32daabbf8a23845692b234421e57a9d436`.

This is an audit, not a rebuild. Nothing in the bank has been changed to produce
it. It holds the Digital SAT bank to the bar the completed ASVAB direct/challenge
rebuild established, and it separates three things that a raw tool run runs
together: defects that are real and serious, defects that are real but
mechanical, and findings that are artifacts of an auditor tuned for a different
framework.

Reproduce with:

```
node scripts/audit-digital-sat-certification.mjs --samples 400 --yield 2000 \
  --json drafts/ccmr-v2.1/audit-results/digital-sat-certification.json
```

---

## 1. What is in the bank

| | Count |
| --- | --- |
| Families | **664** |
| Direct (`ccmrFamilyRole: direct`, tier 1) | **415** |
| Challenge (`ccmrFamilyRole: challenge`, tier 2) | **249** |
| TEKS codes routed into Digital SAT | 79 |
| Standards in whole 5-direct / 3-challenge sets | **79 of 79** |

Set structure is sound. 76 codes carry one complete set, two carry two, one
carries three; no code ships a partial set. This is the one structural property
the ASVAB bank had to be rebuilt to reach, and the Digital SAT bank already has
it.

| Domain | Families | Share | Digital SAT blueprint | Gap |
| --- | ---: | ---: | ---: | ---: |
| Algebra | 200 | 30.1% | ~35% | −1.1 pts |
| Advanced Math | 328 | 49.4% | ~35% | **+18.1 pts** |
| Problem-Solving and Data Analysis | 104 | 15.7% | ~15% | +0.7 pts |
| Geometry and Trigonometry | **32** | **4.8%** | ~15% | **−10.2 pts** |

| | Direct | Challenge |
| --- | --- | --- |
| Difficulty band | 1:4, 2:71, 3:337, 4:3 | 4:166, 5:83 |
| DOK | 1:33, 2:382 | 2:149, 3:100 |

| | Count |
| --- | --- |
| Multiple choice | 498 (75.0%) |
| Student-produced response | 166 (25.0%) |
| Calculator policy `graphing` | 664 (100%) |

---

## 2. Verdicts

Family-level, worst finding wins.

| Verdict | Families | What it means |
| --- | ---: | --- |
| **REPLACE** | **179** | An answer-key, distractor or generation defect that editing prose cannot fix. 79 direct, 100 challenge. |
| **REVISE** | **320** | Sound item, mechanical defect only — currently the choice-id leak below, and in 16 cases an unreduced fraction. |
| **KEEP** | **165** | No finding at any severity. |

The raw tool prints `keep=165 revise=0 replace=499` because it scores the
choice-id leak at replace severity. That is the right severity for the *defect*
and the wrong shape for the *work*: 320 of those families need one field renamed,
not re-authoring. The table above is the actionable split.

---

## 3. The most serious finding: every Digital SAT multiple-choice item ships its answer key to the browser

All **498** Digital SAT MCQ families name the correct option with the literal
choice id `sat-correct` (five older items use bare `correct`). The other three
are `sat-d1`, `sat-d2`, `sat-d3`.

This is not theoretical. Tracing it end to end:

* The generator shuffles choice *order* — across 200 families × 3 seeds the key
  landed at index 0/1/2/3 in 184/134/139/143 draws, so position is randomized.
* The id travels with the choice through generation. A rendered instance emits
  `sat-d3, sat-d2, sat-d1, sat-correct`.
* `buildSanitizedQuestion` in `functions/lib/mathPath.js` correctly strips
  `expected` from `responseFields` — the grading answer never leaves Functions —
  but `normalizeChoices` copies `id` through verbatim: `id: String(choice.id || …)`.

So the student's browser receives four options, one of which is labelled
`sat-correct`. Any test taker who opens developer tools answers every Digital SAT
multiple-choice question correctly without doing any mathematics. Shuffling the
display order does not help, because the marker moves with the option.

This is the same defect class the ASVAB rebuild removed — that bank keyed its
answer with the literal string `asvab-correct` — and it is the reason ASVAB now
uses opaque `choice-a…choice-d` ids.

**Blast radius beyond this lane** (reported, not touched):

| Bank | Choice-bearing families | Families whose ids name the key |
| --- | ---: | ---: |
| Digital SAT | 498 | **498 (100%)** |
| ACT | 136 | **136 (100%)** |
| TSIA2 | 200 | **200 (100%)** |
| ASVAB | 1,176 | 0 |
| Course banks (grade 6/7/8) | 405 | 27 |

ACT, TSIA2 and the 27 course items are outside this branch's scope and were not
modified. They need the same fix.

---

## 4. Distractor quality — 177 families answerable by magnitude

| Finding | Findings | Distinct families |
| --- | ---: | ---: |
| `answerKeyMagnitudeBias` (key at one rank ≥60% of draws) | 149 | — |
| `answerKeyExtremeBias` (key smallest or largest ≥45% of draws) | 99 | — |
| `answerKeyPositionBias` | 9 | — |
| `arithmeticLadderChoices` (all four options equally spaced) | 11 | — |
| `fixedOffsetDistractors` (every distractor within 3 of the key) | 2 | — |
| **Union** | | **177** (78 direct, 99 challenge) |

By domain: Advanced Math 91, Algebra 37, PSDA 28, Geometry/Trig 21.

### The mechanism

87 of the 177 use a shared authoring convention in which the three distractors
are derived values named `satDistractor1/2/3`. A representative case,
`mm_sat_A_10A_3_missing-linear-coefficient_v21`:

```
B              : p+q          <- the key
satDistractor1 : p-q
satDistractor2 : p
satDistractor3 : q
```

with `p` and `q` both drawn positive. Every distractor is therefore strictly
below the key, and **the key is the largest of the four in 100% of draws**. A
test taker who reads nothing and picks the biggest number is right every time.

The misconceptions themselves are legitimate — `p−q` is "subtracted instead of
added", `p` and `q` are "reported one factor's constant". The defect is that all
three sit on the same side of the key. The fix is the bracket the ASVAB rebuild
settled on: one distractor that always overshoots, one that always undershoots,
and one drawn so that it crosses roughly half the time.

The other 90 families use hand-named misconception distractors and still land on
one side of the key for the same structural reason.

---

## 5. Generation reliability

| Check | Result |
| --- | --- |
| Families failing to generate on some seeds (2,000 draws each) | **1** |
| Unresolved `{{placeholder}}` in a rendered instance | 0 |
| Duplicate choice labels in a rendered instance | **1** |
| Expected answer naming a non-existent choice | 0 |

* `mm_sat_A_5C_challenge_2_mixture_v21` — **1.75%** of 400 seeds produce no
  instance. Rejection sampling against constraints it cannot always satisfy. A
  student who draws one of those seeds gets no question.
* `mm_sat_A_2B_2_two_points_equation_v21` — renders two identical options. Its
  choices are `y=mx+b`, `y=(−m)x+b`, `y=mx+b_alt`, `y=(dx)x+b`; the constraints
  include `m!=dx` but not `−m!=dx`, so options 2 and 4 collide whenever
  `dx = −m`.

Otherwise generation is solid: 663 of 664 families produce an instance on every
one of 2,000 seeds.

---

## 6. Language and authenticity — clean

Zero findings. The prompts were screened for coaching verbs (`demonstrate`,
`practice`), DOK labels, TEKS references, objective language (`students will`),
classroom framing, wrapper preambles (`rework`, `a test taker chose`,
`harder version`), tier labels, inline hints, and directions text leaking into
stems. Nothing matched, in either tier.

Read by hand, the register is right. Representative rendered items:

> A rectangular solid measuring 7 by 8 by 3 units has a rectangular opening
> measuring 4 by 3 units cut completely through its height. What is the volume of
> the remaining solid?

> A sector has central angle $90^\circ$ in a circle with radius 20 units. The area
> of the sector is $n\pi$ square units. What is the value of $n$?

These read as Digital SAT questions. There is no wrapper layer anywhere in this
bank — the defect that forced the ASVAB challenge tier to be rebuilt outright
does not exist here.

### One authenticity defect found by reading, not by tooling

16 families render an unreduced fraction. Most are idiomatic and should be left
alone — `\dfrac{86}{100}` in a percent-decay model, `\dfrac{16}{46}` as a
probability read off a two-way table. Three are genuine:

* `mm_sat_native_rightTrig_5_complementary-sine-cosine_v21` scales an 8-15-17
  triple by `k = 1…9` and prints the stem as `\sin A = \dfrac{64}{136}` while
  every answer choice is in lowest terms. Besides being wrong for the register,
  it makes the item answerable by noticing which option is reduced.
* `mm_sat_A2_6I_4_ratio-structure_v21` prints a ratio as `\dfrac{6}{9}`.
* `mm_sat_native_areaVolume_ch1_area-ratio-length_v21` prints `\dfrac{6}{2}`.

---

## 7. Challenge authenticity — sound, with a caveat

**The challenge tier is independently authored.** It is not the ASVAB pattern.

* `generatorClone`: **0**. No challenge family reuses a direct family's generator.
* No wrapper language anywhere.
* Band and DOK separate cleanly: direct sits at bands 1–4 and DOK 1–2, challenge
  at bands 4–5 and DOK 2–3.
* Escalation is real where it was inspected by hand — the A.12E challenge
  rearranges $A=P(1+rt)$ for $r$ (two inverse steps, three variables) against a
  direct item rearranging $d=rt$ for $t$; the A2.6J challenge asks which value
  actually solves an equation after an illegitimate cancellation against a direct
  item asking why a proposed solution is invalid.

### The 17 `crossTierTaskClone` findings are largely false positives

`taskFingerprint` is imported from the shared fidelity module, where it was
tuned to the ASVAB register — short, symbolic Mathematics Knowledge stems. On
Digital SAT items it collapses distinct mathematics into one bucket. Four pairs
were read by hand; in three the underlying mathematics plainly differs
(formula rearrangement with one versus two inverse steps; observational study
versus random-sample-and-random-assignment; removable-discontinuity trap versus
domain-exclusion reasoning). Reporting these as replace-severity would be wrong,
and none is counted in the 179 REPLACE families above.

What the fingerprint is correctly pointing at is the **stem frame**, not the
task: A.10D's direct and challenge items both open "Which expression is
equivalent to …?". That is a frame concern, counted in §8, not a task clone.

**Caveat.** Escalation in several Advanced Math challenge families is modest —
one extra algebraic step rather than synthesis, inversion or judgement. Combined
with §4 (99 of the 177 magnitude-answerable families are challenge families),
the challenge tier is the weaker half of this bank even though it is honestly
authored.

---

## 8. Clones within a standard

| Finding | Count | Standards affected |
| --- | ---: | ---: |
| `taskClone` | 33 | 28 |
| `frameClone` | 87 | 23 |
| `promptOverlap` (>50% of 4-grams) | 46 | 23 |
| `crossTierTaskClone` | 17 | see §7 — largely false positives |
| `generatorClone` | 0 | — |

The heaviest concentration is A.10A, where three direct items and one challenge
item all open "Which expression is equivalent to $(\ldots)+(\ldots)$?" and reach
100% 4-gram overlap. The mathematics differs (addition, subtraction, mixed
signs); the wording does not.

---

## 9. Cross-framework contamination — clean

**0 matches.** No Digital SAT family shares both a task structure and more than
60% of its 4-grams with any ACT, TSIA2 or ASVAB family. The Digital SAT bank has
its own voice.

---

## 10. Assessment fidelity

| Property | Finding |
| --- | --- |
| Calculator policy | All 664 declare `graphing`. Correct — the Digital SAT permits a calculator on every math question. 0 findings. |
| MCQ / SPR split | 498 / 166 = exactly 75% / 25%, matching the real test. |
| Difficulty progression | Direct concentrated at band 3, challenge at bands 4–5. Sound. |
| Domain weighting | **Off blueprint.** Advanced Math +18 points, Geometry and Trigonometry −10 points. |
| Representation breadth | Recorded in the JSON report; no domain is single-representation. |

Geometry and Trigonometry is the real coverage gap: 32 families across 4
standards, where a blueprint-weighted bank would carry roughly 100. A student
routed into Geometry and Trigonometry exhausts the pool quickly and sees far
less of that domain than the test actually weights it.

---

## 11. Files that would need work

| Path | Why |
| --- | --- |
| `drafts/ccmr-v2.1/digitalSAT/**` — **83 of 92 files** contain `sat-correct` | The choice-id leak is authored into the drafts, not injected by the compiler. This is where it is fixed. |
| `drafts/ccmr-v2.1/digitalSAT/advancedMath/**` | 91 of the 177 magnitude-answerable families; the `satDistractor1/2/3` convention is densest here. |
| `drafts/ccmr-v2.1/digitalSAT/algebra/**` | 37 magnitude-answerable families; `mm_sat_A_2B_2_two_points_equation_v21` duplicate choices; `mm_sat_A_5C_challenge_2_mixture_v21` generation failure; A.10A frame clones. |
| `drafts/ccmr-v2.1/digitalSAT/problemSolvingData/**` | 28 magnitude-answerable families; `native/percentages`, `native/probabilityConditionalProbability` unreduced-fraction judgement calls. |
| `drafts/ccmr-v2.1/digitalSAT/geometryTrigonometry/**` | 21 magnitude-answerable families; `SAT_NATIVE_rightTrianglesTrigonometry` unreduced stem; the domain is 10 points under blueprint weight. |
| `scripts/audit-digital-sat-certification.mjs` | New. Needs a Digital-SAT-specific task fingerprint so §7 stops producing false positives. |
| `tests/platform/digitalSat*.test.mjs` | No current test asserts opaque choice ids or answer-key rank balance. Both gaps let the §3 and §4 defects ship. |

### Explicitly not touched, and not to be touched here

`drafts/fidelity-v2/algebra2/**`, `TEKS_FIDELITY_V2_ALGEBRA2_CHECKPOINT.md`,
`functions/shared/**`, `functions/index.js`, `src/platform/path/pathRelease.js`,
production seed mirrors, the Path bank coverage manifests, student
tools/workspaces, and Firebase/Firestore configuration.

The ACT and TSIA2 choice-id leak is recorded in §3 and left alone.

---

## 12. Recommendation

1. **Fix the choice-id leak across all 498 Digital SAT MCQ families.** Mechanical,
   low-risk, and it closes a live answer leak. Add a test that fails on any
   choice id matching `/correct|answer|key/`.
2. **Re-author the distractor sets in the 177 magnitude-answerable families** to
   the overshoot/undershoot/crossing bracket, keeping the misconceptions that are
   already there. Add a rank-balance gate so the pattern cannot return.
3. **Repair the two generation defects** — one rejection-sampling family, one
   duplicate-choice constraint.
4. **Fix the three genuine unreduced-fraction items**; leave the 13 idiomatic ones.
5. **Reword the A.10A frame cluster** and the other heaviest overlaps. The
   mathematics is fine; only the stems repeat.
6. **Raise Geometry and Trigonometry toward blueprint weight** — the largest
   piece of work, and the one most worth doing deliberately rather than quickly.
7. **Escalate the ACT and TSIA2 choice-id leak** as separate work in their own
   lanes.

Items 1–5 are repairs to existing content and are in scope for this branch.
Item 6 is new authoring at a scale that deserves its own decision. Item 7 is out
of scope here.


---

# Part II — repairs made on this branch

Everything below was done after the audit above, on
`claude/digital-sat-v2-1-deep-certification`. Repairs touch the Digital SAT
drafts under `drafts/ccmr-v2.1/digitalSAT/**` and Digital-SAT-specific tooling
and tests only. **The production seed mirrors, the coverage manifests and the
release constants are deliberately untouched**, so every measurement below is
taken against the compiled draft:

```
node scripts/build-digital-sat-v2-1.mjs --release          # -> drafts/digitalSAT.v2.1.json
node scripts/audit-digital-sat-certification.mjs --source drafts/digitalSAT.v2.1.json \
  --samples 400 --yield 2000
```

## Verdicts, before and after

| Verdict | Audited | After repairs |
| --- | ---: | ---: |
| KEEP | 165 | **664** |
| REVISE | 320 | **0** |
| REPLACE | 179 | **0** |

Every one of the 664 families is defensible on its own: no family leaks its key,
none is answerable without doing the mathematics, none fails to generate, and
no challenge family repeats a direct family's task.

## What is fixed

| Defect | Before | After |
| --- | ---: | ---: |
| Multiple-choice families leaking the key through `sat-correct` | 498 | **0** |
| Static families rendering the answer in position A every time | 9 | **0** |
| Families whose correct answer never changed across draws | 8 | **0** |
| Magnitude-answerable families | 177 | **0** |
| Families rendering `1x`, `+ 0`, or an unresolved placeholder | 244 | **0** |
| Families failing to generate on some seeds | 1 | **0** |
| Families rendering duplicate options | 1 | **0** |
| Challenge families repeating a direct family's task | 2 | **0** |
| Challenge families reusing a direct family's generator | 0 | 0 |
| Cross-framework contamination | 0 | 0 |

The answer key is spread across choice ids — a 121, b 131, c 120, d 126 —
rather than sitting on one, and every multiple-choice family still keys a choice
that exists and carries its answer variable.

### The two answer leaks

Both were readable from the browser with no mathematics at all.

Every multiple-choice family keyed its correct option with the literal id
`sat-correct`, and `buildSanitizedQuestion` strips `expected`, not `id` — so the
key travelled to the DOM on all 498 of them. The ids are opaque letters now,
rotated per family by a hash of the family id so the letter itself carries
nothing.

Nine families had no generator at all. `generatePathInstance` returns before the
option shuffle when a template has no parameters, so those nine rendered their
key at index 0 in 45 draws out of 45 — while generated families spread across
all four positions. They now draw a `variant` parameter whose only job is to
seed the shuffle. Digital SAT was the only bank with static multiple-choice
families, so nothing else was affected.

### Eight items whose answer never changed

Separate from the position leak, eight families constructed their parameters so
the correct answer was the same in every draw: "how many distinct real
solutions" was always 2, "how many points of intersection" always 2, "how many
solutions does the original equation have" always 1, "how many points do the
graphs have in common" always 0. A student who never read the equation scored
every time. Each now draws which case it presents — a negative, zero or positive
discriminant; a line above, through or below the vertex; a denominator that does
or does not cancel a numerator factor — and derives the three wrong counts
around whichever came up.

### 177 magnitude-answerable families

The single largest body of work. Three shapes of defect, and the fix in each
case is that at least one option now crosses the key as the parameters move:

* **Ordered offset sets.** Distractors built as `answer-1`, `answer+1`,
  `answer+2` put the key on a fixed rung of a ladder. Replaced with real
  misconceptions.
* **Symmetric quartets.** Options of the form `{x, -x, y, -y}` make the key an
  extreme by construction. Each gains a value outside that symmetry.
* **One-sided scaling.** Every distractor below the key because scaling only
  ever grows from positive parameters. Signed parameters — which is how the exam
  writes coefficients anyway — put options on both sides.

A generic distractor template had also leaked into eleven families: for a key of
`2h` the options were literally `2+h`, `2`, and `h`. Those carry no
misconception at all and are replaced throughout.

Where the mathematics resisted, the item changed rather than the options.
A.10C's challenge asked for the constant of a quadratic dividend, which is the
product of the two divisor constants and therefore dwarfs every honest
distractor; it asks for the linear coefficient now. A.6C's y-intercept is the
product of the roots, so it gains a leading coefficient, which puts the same
product at two other scales, one either side of the key. A2.7G's exponent item
had a single parameter, so all four options were built from it; it carries a
second exponent under the radical now.

### 244 rendering warts

Rendering every family and reading the output turned up text the exam never
prints: `y > 1x + 4`, `y = 6x + 0`, `$5(x + 0)=-40$`, `x^{2/4}`, `x^{-4/2}`,
`x^12` rendering as `x¹` followed by a loose `2`, and one placeholder
(`{{2*x0}}`) that the renderer passed through verbatim because the expression
grammar is not available inside review text. Every one comes from a parameter
range that admits 0 or ±1 in a coefficient or constant slot, so every repair is
an exclude on a parameter or a constraint on a derived value. No renderer and no
shared code is touched.

## What is not fixed

**156 clone findings remain**, all of them same-tier similarity inside a single
standard: 87 shared sentence frames, 44 prompt overlaps, 25 shared task
structures. These are `revise`-severity and largely inherent to a bank organised
five-direct-plus-three-challenge per standard — A.10A's "add these two
quadratics" and "subtract these two quadratics" families are word-identical
apart from the operator, and that contrast is the point of the pair. They were
not churned, per the instruction not to rewrite good material.

One cross-tier pair is accepted with a reason rather than repaired.
`taskFingerprint` reads generator structure, so A.10D's challenge ("factor
`-Ax² - Bx`", which needs the negative and the variable factor together)
fingerprints the same as the direct family's "factor `Ax + B`". The challenge
does strictly more work; distorting the item to satisfy a fingerprint would make
it worse, not better.

**Domain weighting is unchanged and still off blueprint** — Advanced Math +18
points, Geometry and Trigonometry −10. Raising Geometry and Trigonometry toward
its real weight is new authoring at a scale that deserves its own decision, as
section 12 said.

## One expected test failure

`tests/platform/ccmrV21ProductionReleaseContent.test.mjs` fails with exactly two
entries, both Digital SAT:

```
root-drift       seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json
functions-drift  functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json
```

This is the instructed state, not a defect. The drafts are repaired and the
production mirrors are not, because refreshing them was explicitly out of scope.
The test goes green the moment a seed regeneration is authorised. ACT, TSIA2 and
the three course banks show no drift.

The test was not modified to accommodate this. Fixtures in
`digitalSatDistractorQualityRegression.test.mjs` were re-pointed, and only for
families rebuilt here. Most are renames — `satDistractor3: 'r*r'` became
`dWhole: '4*k*k'`, the same quantity under a name that says which misconception
it encodes. Six are genuine replacements, and each carries a comment saying what
the old option was and why it had to go: in every case the pinned option was
itself part of what kept the key at a fixed rank.

## Verification

| Check | Result |
| --- | --- |
| `node --test "tests/platform/*.test.mjs"` | 2,660 tests, 2,659 pass, **1 fail** (the mirror drift above) |
| `node --test "tests/platform/digitalSat*.test.mjs"` | 19 tests, **19 pass** |
| `npm run build` | clean |
| `npm run lint` | **0 errors** |
| Compiled draft | 664 documents, 415 direct / 249 challenge, 498 MCQ / 166 SPR |
| Generation yield | **0 failures** across 664 families at 2,000 draws |
| Answer-key spread | a 121, b 131, c 120, d 126 |
| Cross-framework contamination | **0** |
| Cross-tier and generator clones | **0** |

The 19 Digital SAT tests live in six files, three of them written or extended
by this sweep:

| Test file | Holds |
| --- | --- |
| `digitalSatAnswerKeyIntegrity.test.mjs` (new) | no choice id names the key; the key is spread across ids; every key names a real choice; **no family is answerable by magnitude, asserted at zero in all four domains**; every family generates on every seed; no duplicate options |
| `digitalSatRenderQuality.test.mjs` (new) | no family renders `1x`, `+ 0`, doubled signs, an empty group, or an unresolved placeholder |
| `digitalSatDistractorQualityRegression.test.mjs` (extended) | 30 named families keep their intentional misconception distractors |
| `digitalSatProductionSeedContent.test.mjs` | the compiler emits only routeable authored V2.1 content; 75% MCQ in every domain; four distinct keyed choices per MCQ |
| `digitalSatRuntimeIssuability.test.mjs` | every compiled family is issuable by the production runtime |
| `digitalSatV21AuthoringGate.test.mjs` | underlying-task clones stay blocked, and static items are allowed to omit generators |

## Bugs found in the audit tooling, and fixed

Recorded because they changed reported numbers:

* Choice labels arrive as numbers as often as strings, and the local numeric
  parser returned null for every numeric label — which silently reduced the
  ladder and fixed-offset checks to LaTeX-labelled families only. The ladder
  count moved 11 → 13 once fixed. The shared rank analyzer was never affected.
* The distractor profile mistook the `--draws` value for a family filter and
  profiled nothing.
* `generatorClone` compared any two generators, including the ones whose only
  parameter is the `variant` shuffle seed. Those carry no mathematics, so the
  check fired on every pair of static families in a standard — three false
  positives, now excluded.
* `crossTierTaskClone` compared task fingerprints alone, which collapsed prose
  items that merely share a sentence shape: a random-assignment inference item
  and an observational-study item, with different scenarios and different
  correct answers, counted as clones. The check now requires the wording to
  overlap as well — 17 findings became 2, both of which were real and are
  repaired.
* The arithmetic-ladder rule flagged `0, 1, 2, 3` on eight counting items. That
  is the only honest option set for "how many solutions does this have", so the
  rule gains one narrow exemption: the run must start at zero and step by one,
  which cannot cover a `key+1`/`key+2`/`key+3` set.

Defects I introduced while repairing, all caught by the verification loop that
is committed as `scripts/digital-sat-verify-file.mjs` and
`scripts/digital-sat-render-lint.mjs`: reordering a choices array without moving
`expected` left five families grading the wrong option; one retuned family
rendered `1:4` twice; a first pass at the rendering fixer used a regex that
could run from the end of one text field into the start of the next, which added
one bogus constraint and pinned a family's answer.

## Files changed

95 files. No shared runtime, no production seed, no manifest, no Firebase or
deployment configuration, and nothing under `drafts/fidelity-v2/algebra2/**`.

| Area | Files |
| --- | ---: |
| `drafts/ccmr-v2.1/digitalSAT/advancedMath/**` | 41 |
| `drafts/ccmr-v2.1/digitalSAT/algebra/**` | 25 |
| `drafts/ccmr-v2.1/digitalSAT/problemSolvingData/**` | 13 |
| `drafts/ccmr-v2.1/digitalSAT/geometryTrigonometry/**` | 4 |
| `drafts/digitalSAT.v2.1.json` (compiled draft) + audit results | 2 |
| `scripts/` — Digital-SAT-specific audit and repair tooling | 6 |
| `tests/platform/digitalSat*.test.mjs` | 3 |
| This report | 1 |

# Part III — production seed regeneration and skeptical validation

Part II measured everything against the compiled draft, because the production
mirrors were out of scope at the time. They are in scope now. This part covers
the regeneration, and a deliberate attempt to break the tooling the KEEP=664
verdict rests on.

## Seed regeneration

Both Digital SAT mirrors were regenerated from the repaired drafts by the
coordinator, not patched by hand:

```
node scripts/build-ccmr-v2-1-production-release.mjs --write
```

| | |
| --- | --- |
| Command | the repo's own unified writer, no manual edits |
| Files written | `seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json`, `functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json` |
| Both mirrors identical | yes — `sha256 a8506ac3e9f6fab11f45ab92c2180ec5d6207b61a9949f9ee738c4463be9ba21` |
| Documents changed vs main | 580 of 664 |
| Root drift / Functions drift | **0 / 0** |
| ACT and TSIA2 mirrors | untouched, still matching |

`ccmrV21ProductionReleaseContent.test.mjs` is green, 7 of 7. The regenerated
seed agrees with the compiled draft on every field the sweep touched — prompt,
generator, choices, responseFields, solutionReview — across all 664 families,
with zero mismatches.

## Counts verified against the authored sources

Counted straight from `drafts/ccmr-v2.1/digitalSAT/**` by a script sharing no
code with the compiler or the audit, then compared to the compiled draft and to
the shipping seed.

| Measure | Authored source | Compiled draft | Shipping seed |
| --- | --- | --- | --- |
| Active documents | 664 | 664 | 664 |
| Duplicate ids | 0 | 0 | 0 |
| Direct / challenge | 415 / 249 | 415 / 249 | 415 / 249 |
| Advanced Math / Algebra / PSDA / Geometry & Trig | 328 / 200 / 104 / 32 | same | same |
| DOK, direct | 1:33, 2:382 | same | same |
| DOK, challenge | 2:149, 3:100 | same | same |
| Band, direct | 1:4, 2:71, 3:337, 4:3 | same | same |
| Band, challenge | 4:166, 5:83 | same | same |
| Calculator policy | graphing ×664 | same | same |
| Item format | **502 / 162** | 498 / 166 | 498 / 166 |

The one difference is explained and is not a defect. Four Problem-Solving and
Data Analysis families are authored as multiple choice and ship as
student-produced response, because `DIGITAL_SAT_PSDA_ANTI_CLONE_OVERRIDES.v2.1.json`
patches them. That override file predates this branch (commit `2d44f16`) and the
compiler deep-merges it by design; 502 − 4 = 498 and 162 + 4 = 166 exactly. It
does mean "the authored source" is the draft files *plus* an override layer, and
a count taken from the files alone will disagree by four.

## The five tooling fixes, inspected

Three of the five narrow what the audit reports, so each is a place a real
defect could hide. Every one is now asserted in both directions.

| Fix | What it changed | Could it hide a defect? |
| --- | --- | --- |
| Numeric label parser returned null for numeric labels | Ladder and fixed-offset checks had been reduced to LaTeX-labelled families only | It *had been* hiding defects; the fix widens coverage. Unit-tested against integers, negatives, thousands separators and `\frac{a}{b}` |
| Distractor profile read `--draws` as a family filter | The script profiled nothing | Diagnostic only, never fed a verdict |
| `generatorClone` compared variant-only generators | Skips generators whose only parameter is the shuffle seed | **Narrowed.** Verified: a direct/challenge pair with an identical *real* generator is still caught; same-tier clone detection still covers static families |
| `crossTierTaskClone` compared fingerprints alone | Now also requires >25% prompt overlap | **Narrowed.** Verified: a pair with the same task *and* the same wording is still caught |
| Ladder rule flagged 0,1,2,3 on counting items | Exempts a run starting at 0 stepping by 1 | **Narrowed.** Verified: `key-1, key, key+1, key+2` is still caught; so are runs around zero, steps of two, and gaps |

`scripts/digital-sat-audit-selftest.mjs` appends six deliberately defective
families to the real bank and runs the shipped audit against it. All six behave
as intended, against both the draft and the shipping seed:

```
  ok  an arithmetic ladder that does not start at zero            -> arithmeticLadderChoices
  ok  a count item offering 0, 1, 2, 3                            -> silent (the exemption)
  ok  a challenge reusing a direct family's real generator        -> generatorClone + crossTierTaskClone
  ok  two static families sharing the variant shuffle seed        -> silent on clone rules, still flagged same-tier
  ok  a key that is the largest of four in every draw             -> answerKeyMagnitudeBias + ExtremeBias
  ok  a choice id that names the answer                           -> transparentChoiceId
```

Note the fourth line: the variant-only exemption silences only the cross-tier
and generator checks. Same-tier `taskClone` and `frameClone` still fire on those
families, which is the narrowness the exemption needs to have.

## A sixth tooling defect, found during this validation

The audit grouped families by their TEKS alignment key. The 80 native SAT
families carry no TEKS key in the drafts, so `codeOf` returned an empty string
for every one of them and dropped all 80 into a single bucket — area and volume
compared against percentages, circles against inference. It also meant the
reported "standards" figure counted only TEKS codes.

Grouping too coarsely produces *more* comparisons, not fewer, so this inflated
clone counts rather than hiding anything: 25 task clones became 24 once fixed.
But the figure was wrong and the comparisons were meaningless, so `codeOf` now
falls back to `assessedConstruct`.

Two consequences worth stating, because the audit reports different numbers
depending on what it is pointed at:

* Against the **compiled draft**, standards = 80 (71 TEKS codes plus 9 native
  SAT skills).
* Against the **shipping seed**, standards = 79, because the production
  compiler attaches real TEKS alignment keys to the native families — area and
  volume becomes 6.8B, circles becomes 7.5B — and a few native skills share a
  code. The seed's grouping is the better one, and the seed is what students
  get, so the certification numbers below are the seed run.

## Independent re-derivation of the verdict

A second checker was written from the definitions rather than copied: its own
numeric parser, its own rank computation, the same published thresholds. It
shares nothing with the audit or with `asvabFidelity.mjs` except the generator.

| Bank | magnitude | extreme | key-naming ids | duplicate options | generation failures | orphan keys |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shipping seed, this branch | **0** | **0** | **0** | **0** | **0** | **0** |
| Compiled draft, this branch | **0** | **0** | **0** | **0** | **0** | **0** |
| `main`'s seed (control) | 145 | 91 | 498 | 1 | 1 | 0 |

The control matters: a checker that finds nothing everywhere is worthless. This
one finds 145 magnitude-biased families and 498 leaked keys on the pre-repair
bank and none on the repaired one.

Set-compared against the audit on `main`'s seed: the audit flagged 170 families,
the independent checker 164, and **the independent checker found nothing the
audit missed**. The audit is stricter on six families, because it reads percent
labels the independent parser does not. The audit is not under-reporting
relative to a from-scratch implementation of the same rules.

## Hand spot-checks

Sixteen multiple-choice families were sampled across all four domains and both
tiers and read by hand — mathematics checked, key confirmed, distractors judged.
All correct. Examples: `A_2H_7` (boundary through (4,−30) gives p−5 = −9, and
(4,−34) below it gives `y ≤ −9x + 6`); `A_3F_challenge_2` (lines meeting at
(−5,3), p+q = −2, ranks spread 23/26/29/22); `A2_6B_challenge_1`
(∛(x+k) = 6 with x = −7 gives k = 223, ranks 26/26/24/25).

A separate stratified sample of seven families the sweep never touched was also
read. All seven are mathematically correct — but all seven turned out to be
student-produced response, which exposed a gap described next.

## Known non-blocking findings

**1. Fifteen SPR families print their own answer in the stem.**

Every strong check in the sweep — rank bias, choice-id leakage, ladders,
duplicate options — needs four options, so none of them looks at the 166
student-produced-response families. Hand-reading found this; a probe then
quantified it.

Some are the skill itself: "the zeros of $x^2-12x+32$ are $r$ and $s$; what is
$rs$?" prints 32 because Vieta's relation is the point. Others are read-offs
wearing a challenge label — `A2.3F challenge_3` states "the two non-axis
boundary lines intersect at (5,4)" and then asks for the value of $y$, at band 5
and DOK 3. Sorting the two apart is authoring work and is **not** done here:

```
band 5, DOK 3   A_7A_challenge_challenge-feature-from-expanded
band 5, DOK 3   A2_3F_challenge_3_challenge-three-constraint-vertex
band 4, DOK 2   A_12A_challenge_1_parameter-repeated-input
band 4, DOK 2   A_7A_challenge_challenge-max-value
band 4, DOK 2   A_7C_challenge_challenge-parameter-for-vertex
band 4, DOK 2   A2_6J_challenge_2_parameter-denominator
band 4, DOK 2   A2_7C_challenge_quotient_linear_coefficient
band 3, DOK 2   A_10C_4_quotient-parameter
band 3, DOK 2   A_3G_5_graph-solution-context
band 3, DOK 2   A_7B_product-of-zeros
band 3, DOK 2   A2_3C_nonzero-intersection-parabola-line
band 3, DOK 2   A2_3F_2_vertical-slice-maximum
band 2, DOK 2   A_3F_1_intersection-from-two-lines
band 2, DOK 1   A_3G_4_context-intersection-output
band 2, DOK 1   native_1vd_1_mean-symmetric-data
```

`scripts/digital-sat-spr-stem-probe.mjs` reports them and
`digitalSatSprStemLeak.test.mjs` pins the count at 15 so it can only fall.

**2. 156 same-tier clone findings** — 87 shared sentence frames, 45 prompt
overlaps, 24 shared task structures, all within one standard. Unchanged, per the
instruction not to rewrite them.

**3. Domain weighting is still off blueprint** — Advanced Math +18 points,
Geometry and Trigonometry −10. Untouched, per the instruction not to start that
expansion.

One thing *was* repaired here, because it is a voice defect rather than new
authoring: `A2.2A`'s challenge stem ended "…where $s=r+1$", but `r` and `s` are
generator variables that render as numbers everywhere else, so a reader saw
"f(25)=5, and f(36)=6, where s=r+1" with no `r` or `s` in sight. The clause is
gone.

## Final verification

All figures below are from the shipping seed and this branch's HEAD.

| Check | Result |
| --- | --- |
| `node --test "tests/platform/*.test.mjs"` | 2,666 tests, **2,666 pass, 0 fail** |
| CCMR / Path / framework-bank subset (127 files) | 864 tests, **864 pass, 0 fail** |
| `tests/platform/digitalSat*.test.mjs` (8 files) | 25 tests, **25 pass** |
| `ccmrV21ProductionReleaseContent.test.mjs` | 7 tests, **7 pass**, zero drift |
| `npm run build` | clean |
| `npm run lint` | **0 errors** |
| Certification sweep, shipping seed | **keep 664, revise 0, replace 0** |
| Generation yield, 2,000 draws per family | **0 failures** |
| Cross-tier clones / generator clones | **0 / 0** |
| Cross-framework contamination (ACT, TSIA2, ASVAB) | **0** |
| Rendering warts | **0** |
| Audit self-test | **6 / 6** |
| Independent re-derivation | **0 findings**, control finds 145 + 498 on `main` |

The bank ships 664 families: 415 direct, 249 challenge, 498 multiple choice and
166 student-produced response, 79 standards, all calculator-permitted.
