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
