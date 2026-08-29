# CCMR ASVAB Fidelity V2.1 — AR/MK Rebuild Handoff

**Scope owned:** ASVAB Arithmetic Reasoning and Mathematics Knowledge.
**Not touched:** Digital SAT, ACT, TSIA2 (ChatGPT's lanes).

## Status in one line

**Complete, and merged with `main`.** All 146 ASVAB standards are rebuilt — 735
families across 147 standard-subtest pairs — and the shipping bank has been
swapped to them. `main` has been merged in, and the bank now ships as 735
authored direct families plus the 438 challenge families that arrived on `main`
while this rebuild was in progress: **1,173 documents**. Nothing has been
deployed: refreshing the production bank is still a manual step for the
operator. Read §6 before running it, and §11 before trusting the challenge tier.

Sections 1 and 2 are the audit that led to the rebuild and are kept as the
record of why the old bank was replaced rather than repaired. Section 11 is the
merge, and it carries one finding the operator has to decide about.

---

## 1. The finding that governs everything else

The existing 730-record ASVAB bank is **not a fidelity problem. It is a validity
problem.**

`scripts/build-asvab-drafts.mjs` generated all 730 records by transforming
TEKS-aligned course questions into four-option multiple choice. Its distractor
rule was mechanical: for a key of `n`, the three distractors were `n+1`, `n+2`,
`n+3`. **476 of the 730 families use that rule literally.**

Choices *are* shuffled per instance by the runtime, so there is no position bias.
That hides the problem without fixing it. Measured over 2,550 generated numeric
instances:

| Measurement | Result | Chance |
|---|---:|---:|
| Key is the **smallest** of the four | **99.8%** | 25% |
| Key is the smallest, **Arithmetic Reasoning only** | **100.0%** | 25% |
| Key is the largest | 0.2% | 25% |

A student who never reads a single question and always picks the smallest number
scores approximately **100% on ASVAB Arithmetic Reasoning** and ~99.8% overall.
The bank therefore measures nothing, and any ASVAB readiness figure derived from
it is meaningless — this matters beyond authenticity, because those numbers feed
the CCMR readiness surfaces.

Two further defects found:

- **The answer key was readable in the browser payload.** Choices reach the
  client as `{id, label}`, and the key's id was the literal string
  `asvab-correct`. No mathematics required — just devtools. (Pre-existing; the
  rebuild kit fixes it, see §3.)
- **Boilerplate coaching.** All 730 families draw their hints from 16 generic
  strings and their feedback from 12; 146 share a single `solutionReview`
  headline. None is specific to the mathematics.

### Verdict on the existing bank

Run `node scripts/audit-asvab-fidelity.mjs --samples 60`:

```
families=730  standards=146  AR=151  MK=579
verdicts: keep=0  revise=0  replace=730

  2190  distractorUnexplained
   730  distractorErrorsRepeat
   425  answerKeyMagnitudeBias
    73  answerKeyPositionBias
    67  taskClone            (across 60 of 146 standards)
    59  mkTooManySentences
    54  frameClone
    21  promptOverlap
    15  arNoQuestion
     3  mkTooLong
     1  procedureTold
```

**KEEP 0 / REVISE 0 / REPLACE 730.** Nothing is salvageable by editing prose:
the distractor construction has to be redone family by family, which is a
rebuild.

On cloning specifically, `A.3B` families 1 and 3 are "a machine makes *n* parts
in *m* minutes" and "a traveler covers *d* miles in *h* hours" — identical
computation, different nouns. That is the anti-pattern the brief names, and it
occurs in 60 of 146 standards.

---

## 2. What was found (inventory)

| Concern | Location |
|---|---|
| ASVAB records (730) | `drafts/asvab.json` → copied byte-identical to `seed/pathQuestionBank/asvab_pathQuestionBank_seed.json` and `functions/seeds/pathQuestionBank/asvab_pathQuestionBank_seed.json` |
| Old builder (relabel pipeline) | `scripts/build-asvab-drafts.mjs` — since deleted, see §3 |
| Existing generate/grade gate | `scripts/audit-asvab-drafts.mjs` |
| Blueprint: which TEKS → AR or MK | `src/platform/assessment/teksExamCrosswalk.js` |
| Domain registry + weights (AR .5 / MK .5) | `src/platform/assessment/examDomainRegistry.js` |
| Calculator policy (`asvab` → `none`, no accommodation override) | `src/platform/policies/calculatorPolicy.js` |
| Generation engine | `functions/shared/pathQuestionGeneration.mjs` |
| Standard-level quality gate | `functions/shared/pathStandardQuality.mjs` |
| Server sanitizer (strips author-private fields) | `functions/lib/mathPath.js` → `normalizeChoices` |
| Release handshake | `src/platform/path/pathRelease.js` + `PATH_RUNTIME_RELEASE` in `functions/index.js` |
| Coverage manifest builder | `scripts/rebuild-path-manifest.mjs` |

**The AR/MK split is the reviewed blueprint, not an accident.** The crosswalk
maps 30 codes to AR only, 115 to MK only, and `A2.6L` to both — exactly matching
the bank's 151/579 split. It was left alone; re-mapping standards would be
redesigning the blueprint the brief said to use.

Two constraints discovered that any rebuild must respect:

1. `rebuild-path-manifest.mjs` throws on any document without a `texas:`
   alignment key, so ASVAB items keep a TEKS key alongside their ASVAB domain.
2. `pathStandardQuality.mjs` will not call a standard production-ready until its
   five families span **3 representations, 3 task types, 2 DOK levels and 2
   difficulty bands**. That is the platform's own operational definition of the
   brief's "five useful ways of measuring the skill".

---


## 3. What was built

### The bank

| | Families | Standards |
|---|---:|---:|
| Arithmetic Reasoning | 155 | 31 |
| Mathematics Knowledge | 580 | 116 |
| **Total** | **735** | **146 codes / 147 code-subtest pairs** |

`A2.6L` is assessed in both subtests and carries five families in each, which is
why the pair count is one higher than the code count.

Authored by `scripts/author-asvab-ar.mjs` and `scripts/author-asvab-mk.mjs`,
assembled by `scripts/build-asvab-bank.mjs` into `drafts/asvab.json` and both
seed mirrors. `scripts/build-asvab-drafts.mjs`, the relabel pipeline that
produced the old bank, is deleted: there is no longer a course bank to convert
from.

Every family carries `familyVersion: 2`, which travels into evidence through
`questionSnapshot.familyVersion`, so answers to old and new content stay
distinguishable in the record.

### `functions/shared/asvabFidelity.mjs` — the analyzer

Pure and dependency-free. Nothing in `src/` or `functions/` imports it at
runtime; it is used by the audit scripts and the tests. It measures four things
the mathematical validators are blind to:

1. **Answer-key magnitude bias.** The rank the key actually lands on across many
   draws. `RANK_TOLERANCE = 0.6` (no single rank above that share) and
   `EXTREME_TOLERANCE = 0.45` (the cheap "always pick the smallest" exploit).
2. **Underlying-task cloning**, fingerprinted from the generator's relation
   graph, so renaming the nouns does not change it.
3. **Surface-language cloning**, the complement: two items computing different
   things through one sentence frame.
4. **Register.** Arithmetic Reasoning is practical prose under 48 words and 3
   sentences; Mathematics Knowledge is direct symbolic mathematics under 34 words
   and 2 sentences. Neither may tell the student which procedure to run.

`numericLabel` is exported so the diagnostic scripts read labels exactly as the
gate does. Every private copy of it drifted; one read `\frac{1}{5}` as fifteen.

### `scripts/lib/asvabAuthoring.mjs` — the authoring kit

Enforces at build time: exactly one key, four choices, distinct misconception
codes, the five-family variety floor, and opaque choice ids permuted per family.
It also documents the six rules the rebuild had to learn the hard way, each
written where the next author will hit it:

1. Distractors are errors, not neighbours.
2. Correctness by construction — derive the key from the drawn parameters.
3. Constraint skew — a redraw is free, a failed constraint costs an attempt.
4. Drawn context words draw independently of the mathematics.
5. The crossing distractor must be independent of the key, not merely overlapping
   in range. Anything that divides the key, or that the key is a fixed multiple
   of, can never cross it.
6. Where the crossing threshold falls, **after** the automatic distinctness
   constraints have taken their bites.

Ids and family ids both name the subtest (`mm_asvab_mk_…`,
`mathmaster:asvab:mk:…`). `A2.6L` is authored in both subtests and both used the
slug `constant-of-inverse-variation`; without the subtest they collided. The
family id matters more than the document id — it travels into evidence and is
what repeat-avoidance and mastery attribution key on.

### Diagnostics

| Script | Answers |
|---|---|
| `scripts/audit-asvab-drafts.mjs` | Does it generate, grade, and stay in format? |
| `scripts/audit-asvab-fidelity.mjs` | KEEP / REVISE / REPLACE, clones, register, bank voice |
| `scripts/asvab-rank-probe.mjs` | Which rank does the key land on? |
| `scripts/asvab-distractor-profile.mjs` | *Why* — healthy is one near 0%, one near 100%, one near 50% |
| `scripts/asvab-read-prompts.mjs` | One generated prompt per family — the only check that reads what a student reads |

### `tests/platform/asvabFidelity.test.mjs` — 21 tests

Run over **both** banks. Three are worth naming because nothing else in the
suite would catch what they catch:

- **A "lies between" item has its key strictly between the bounds it names**, and
  no distractor that also satisfies the prompt. Added after every automated gate
  passed a family whose key was wrong in 30 of 45 parameter combinations.
- **An item that shows points or an x/y table and offers a linear equation has a
  key those points satisfy.** Re-derives the mathematics from what the student is
  shown rather than trusting the generator.
- **An expand, factor or divide family has a key algebraically identical to its
  prompt**, checked by substituting numbers into both sides. The families are
  listed rather than detected, because most items are not meant to have a key
  equal to their prompt — reading a slope out of an expression is not rewriting
  it.

---

## 4. Kept / revised / replaced

| | Count |
|---|---:|
| Kept from the old bank | **0** |
| Revised | **0** |
| Replaced | **730** |

Nothing was salvageable. 476 of 730 families used `key + 1 / + 2 / + 3`
distractors; the key was the smallest of four in 99.8% of numeric draws; the
key's choice id was the literal string `asvab-correct`. The replacement is 735
families because the blueprint asks for five per standard-subtest pair, and there
are 147 pairs.

---

## 5. What the verification actually caught

The gates are worth trusting because they kept finding things. A representative
list, all fixed:

**Keys that were simply wrong.** A "lies between" family whose midpoint fell
below the root in two draws of three. A Grade 6 family with two correct answers.
A context family whose depth was set to `kt` rather than `√(kt)`.

**Second correct answers.** Two radical families offered the key left
unsimplified — `√(k²s)` and `k√s` are the same number.

**Choices that could coincide.** Eight families could draw two identical options,
every one a pair of coefficients that had never been constrained apart. A one-off
sweep at 3,000 draws per family now reports none in either bank.

**Answers detectable without reading.** Around fifty families put the key at one
rank too often — twelve of them only after the id change re-rolled every draw,
having sat just inside the tolerances until then. Most were fixed by drawing the crossing choice over a range that
overlaps the key's. Five could not be fixed that way at all and were rebuilt:
cubing a negative gives the most negative value on offer; the constant of an
inverse variation is the product of the two givens and so larger than either;
"which value does an upward parabola never take" is by definition the smallest
number shown. Those now ask a question with the same content and choices that
carry no ranking.

**Content only reading catches.** Unreduced fractions and unreduced standard
form; `$5.3` as a money value; a ten-hour rest before a four-hour drive; "a 11-day
hire"; a prompt telling the student to read a line off a graph the platform never
draws; `4^{4/2}`, which is just `4^2`.

**Blind spots in the checkers themselves.** `numericLabel` could not read escaped
dollars, then percents, then degrees, then multiples of π, then negative
fractions. Each fix immediately exposed families that had been exempt rather than
passing — the π fix alone flagged seven, six of them already committed.

---

## 6. The swap, and what is deliberately not done

**Done here:** `drafts/asvab.json` and both seed mirrors hold the new bank, the
coverage manifest is rebuilt, and the release handshake moved to
`path-bank-2026-08-29-r10-asvab-rebuild` on both sides
(`src/platform/path/pathRelease.js`, `PATH_RUNTIME_RELEASE` in
`functions/index.js`).

**Not done, on purpose:** nothing was written to Firestore and no production bank
was refreshed. That is the operator's step, and it needs the deploy to go out
first so the two releases match.

### What a refresh does to work already in flight

The existing mechanism tags each bundled question with `builtInPathSeedRelease`
and `removeSupersededBuiltInPathSeedRecords` deletes bank records from older
releases. Every old ASVAB id disappears, because the new ids are all different.

- **My Math Path sessions are safe.** `submitPathResponse` grades from
  `session.currentQuestion.privateGrading` — the instance stored in the session
  document — and never re-reads the bank. An open question still grades correctly
  after its bank record is gone. The next question simply comes from the new
  bank, which is the point.
- **Live Challenge is not.** `buildLiveChallengePublicQuestion` and the submit
  path both re-read `pathQuestionBank.doc(questionId)` and throw
  "This round's secure question is unavailable" if it is missing. A room running
  on old ASVAB questions at the moment of a refresh would break.

Rounds are 15–120 seconds, so the window is seconds wide, and this is a
pre-existing property of the refresh mechanism for every framework, not something
this rebuild introduces. It is left as it is rather than changed, because fixing
it means altering shared Live Challenge code that no ASVAB requirement depends
on. **Refresh the bank when no Live Challenge is running.**

---

## 7. Test commands and results

```
node scripts/author-asvab-ar.mjs          # 155 families across 31 standards
node scripts/author-asvab-mk.mjs          # 580 families across 116 standards
node scripts/build-asvab-bank.mjs         # 735 families → 3 files

node scripts/audit-asvab-drafts.mjs   drafts/asvab-ar.json    # all counters 0
node scripts/audit-asvab-drafts.mjs   drafts/asvab-mk.json    # all counters 0
node scripts/audit-asvab-fidelity.mjs drafts/asvab-ar.json    # keep 155 / 0 / 0, 0 clones
node scripts/audit-asvab-fidelity.mjs drafts/asvab-mk.json    # keep 580 / 0 / 0, 0 clones
node scripts/asvab-rank-probe.mjs     drafts/asvab-ar.json    # 0 of 155 flagged
node scripts/asvab-rank-probe.mjs     drafts/asvab-mk.json    # 0 of 580 flagged
node scripts/verify-path-drafts.mjs   drafts/asvab.json       # only id_already_published,
                                                              # expected once the draft IS the seed

node --test "tests/platform/*.test.mjs"   # 2043 pass, 0 fail
node scripts/audits.mjs                   # all three audits pass
npm run build                             # clean
```

A one-off sweep at 3,000 draws per family (rather than the audit's 200) reports
**0 collisions in 155 AR and 0 in 580 MK**.

---

## 8. Shared files touched, and why

| File | Change | Why it could not be avoided |
|---|---|---|
| `functions/index.js` | one line: `PATH_RUNTIME_RELEASE` | The release handshake has to move with the bank, or the client and backend disagree |
| `src/platform/path/pathRelease.js` | one line: `PATH_WEB_RELEASE` | The other half of the same handshake |
| `scripts/verify-path-drafts.mjs` | variety measured over the whole question, not the prompt alone | It reported 156 families as producing one question; all 156 vary their choices or table every draw. Verified no other framework's draft changes verdict either way |
| `scripts/audit-asvab-drafts.mjs` | context-word list completed | Two AR items were flagged as contextless only when their worker parameter drew "technician" or "mechanic", which were missing while "welder" and "driver" were present |
| `tests/platform/pathBankSeed.test.mjs` | five-families check groups by standard **and subtest**; count 730 → 735 | A2.6L carries five families in each subtest; grouping by code alone counted ten and failed correct content |
| `tests/platform/pathSeedMirrorSync.test.mjs` | count 5,186 → 5,191 | Follows the bank size |

`functions/shared/asvabFidelity.mjs` is new and imported only by scripts and
tests — it is not on any runtime path.

No change was made to the generation engine, the server sanitizer, the grader,
the calculator policy, the domain registry, the crosswalk, or the ASVAB
weighted-domain predictor.

---

## 9. SAT / ACT / TSIA2 confirmation

Not modified, intentionally or otherwise. Across the whole rebuild the only
non-ASVAB files that changed are the two one-line release constants, the two
shared scripts and three test files listed in §8. Specifically unchanged:

```
seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json
seed/pathQuestionBank/act_pathQuestionBank_seed.json
seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json
functions/seeds/pathQuestionBank/{digitalSAT,act,tsia2}_pathQuestionBank_seed.json
drafts/{digitalSAT,act,tsia2}.json
```

The coverage manifest changed only in its `asvab` block and totals.

---

## 10. Unresolved

1. **The bank has not been read end to end by a person.** Every family passed the
   automated gates and one generated instance of each was read during authoring,
   but 735 families × many draws is more than was read. The gates catch structure;
   they do not catch a scenario that is merely odd.
2. **Live Challenge during a refresh**, §6. Left alone deliberately.
3. **The AR/MK split was not re-examined.** 30 codes to AR, 115 to MK, `A2.6L` to
   both, taken from the crosswalk as the reviewed blueprint.
4. **No item was checked against a real ASVAB form.** No official question was
   copied, and none was consulted; authenticity here means the register, the
   structure and the distractor discipline, judged against the published
   description of the subtests.

---

## 11. The merge with `main`, and the challenge tier

### What arrived on `main` while this rebuild was running

`main` advanced 675 commits. One of them, `f5a429a` "Add CCMR Fidelity V2
challenge progression", added a second tier to all four assessment banks. ASVAB
went from 730 to 1,168 documents: the original 730 became `ccmrFamilyRole:
'direct'` / `ccmrChallengeTier: 1`, and 438 new `challenge` families at tier 2
were added on top.

The runtime reads this. `functions/index.js` raises a student's
`ccmrChallengeTier` after strong direct evidence, and once at tier ≥ 2 it filters
candidates to challenge families, falling back to direct families at
`difficultyBand >= 4` if there are fewer than two. **Every family in this rebuild
is band 1–3**, so deleting the challenge tier outright would have left an ASVAB
repeat session with an empty candidate pool. The challenge tier was therefore
kept, not dropped.

### How the merge was resolved

Eight files conflicted. Nothing was resolved by picking a side blindly:

| File | Resolution |
| --- | --- |
| `functions/index.js` | `main`'s version in full (it gained 1,379 lines of progression runtime); the release constant re-bumped. |
| `src/platform/path/pathRelease.js` | Same release constant. |
| `seed/…/asvab_…_seed.json` + mirror | Regenerated: 735 authored direct + 438 carried-through challenge. |
| `seed/…/PATH_BANK_COVERAGE_MANIFEST.json` + mirror | Regenerated from the seed directory by `scripts/rebuild-path-manifest.mjs`. |
| `tests/platform/pathBankSeed.test.mjs` | `main`'s direct/challenge structure, with the direct tier counted per subtest. |
| `tests/platform/pathSeedMirrorSync.test.mjs` | Total moved 7,601 → 7,606 (the +5 ASVAB delta). |

The release is now `path-bank-2026-08-29-r12-asvab-rebuild` in both places —
above `main`'s `r11`, so a refresh still retires older sessions in order.

`scripts/build-asvab-bank.mjs` now stamps the Fidelity V2 direct metadata
(`ccmrChallengeTier`, `ccmrFamilyRole`, `ccmrFidelity`) onto every authored
family and carries any existing challenge families through untouched, so
rebuilding the authored bank no longer deletes the challenge tier.

It deliberately does **not** hand the bank to `scripts/build-ccmr-fidelity-v2.mjs`,
which is what stamped the same fields on `main`. That script also rewrites
`prompt`, appending *"Work without a calculator and select the best answer."* to
every ASVAB item. These families are register-controlled — Mathematics Knowledge
is capped at 34 words and two sentences — so running it over them would push a
large share of the bank past its own fidelity gate. The metadata written here is
field-for-field identical; only the prompt rewrite is skipped.

Two shared test files needed one ASVAB-specific branch each. ASVAB's two domains
are two separate tests a recruit sits, not two reporting categories inside one
test, so `A2.6L` — assessed in both — carries five direct families in each.
Grouping by code alone counts ten and fails on correct content. Both tests now
count the direct tier per subtest for ASVAB only and per code for every other
framework; the challenge tier is still counted per code everywhere. No other
framework's assertion changed.

### `main` was already red before this merge

Measured on a clean `origin/main` checkout, not inferred:

```
node --test "tests/platform/*.test.mjs"
main:   2559 tests, 2463 pass, 96 fail
merged: 2580 tests, 2484 pass, 96 fail
```

The failing-test *names* differ by exactly one entry, and that one is the mirror
count test renamed from 7,601 to 7,606 — the same pre-existing failure under a
new name. **This merge introduces no new failure and silences none.**

The 96 pre-existing failures span ~44 files and are mostly unrelated to the Path
bank (`studentDashboardModel` 11, `blueprintTextRepair` 9, `taskFidelity` 6,
`instructionalScope` 6, `assignmentLibrary` 6, `gradeEvidence` 5, …). The bank-
related ones are all SAT/ACT/TSIA2:

- `digitalSAT_pathQuestionBank_seed.json` wraps its payload in `items`, not
  `documents`. Three tests read `.documents` directly and throw on it.
- `pathBankSeed.test.mjs` expects SAT 1,672 / ACT 1,800 / TSIA2 1,800 documents.
  Those files hold **664 / 136 / 200**. Their challenge tiers are described by
  the tests and the manifest but are not in the repository.
- The coverage manifest on `main` claimed 7,601 documents; the seed directory
  holds 3,329. Regenerating it fixes the total. It still fails on per-standard
  counts, because `rebuild-path-manifest.mjs` credits a document to its *first*
  `texas:` alignment key while the test credits it to *all* of them, and 384
  documents carry more than one. All 384 are in the SAT, ACT and TSIA2 banks;
  **zero are ASVAB.**

None of that is in this lane and none of it was touched. It is written down here
because "get ASVAB onto `main`" and "`main` is green" are separate jobs, and the
second one is not this one.

### The finding the operator has to decide about

The 438 challenge families are not independent content. Each one carries
`ccmrFidelity.sourceFamilyId` pointing at one of the **730 original families this
rebuild replaced** — 438 distinct sources, all resolving into the old bank — and
its prompt is that old prompt with a sentence glued to the front.

Running this rebuild's own auditor over the merged bank:

```
node scripts/audit-asvab-fidelity.mjs
verdicts: keep=735  revise=0  replace=438
```

Every issue it reports belongs to the challenge tier:

| Issue | Count | Reading |
| --- | --- | --- |
| `answerKeyExtremeBias` / `answerKeyMagnitudeBias` | 242 | The key sits at one extreme in 100% of draws. |
| `mkTooManySentences` / `mkTooLong` | 347 / 157 | Past the Mathematics Knowledge register cap. |
| `arTooManySentences` / `arTooLong` | 88 / 8 | Past the Arithmetic Reasoning cap. |
| `taskClone` / `frameClone` / `promptOverlap` | 24 / 14 / 24 | Challenge families of one standard duplicating each other. |

Structurally: **287 of the 438 build their three distractors as key + 1, key + 2,
key + 3**, which makes the key the smallest of four every time — the same defect
class §1 documents in the original bank, reproduced. And 438 of 1,173 prompts
(37.3%) open with the same five words, 244 of them with the identical sentence
*"Without using a calculator, a test taker chose X."*

Two counts in that audit should **not** be held against them:
`distractorUnexplained` (1,314) and `distractorErrorsRepeat` (438) fire because
the 438 carry no misconception codes at all. That is a convention mismatch with
this rebuild's authoring kit, not evidence about the distractors themselves.

**What this means.** Merging as resolved is the only option that keeps `main`'s
progression runtime working and loses nobody's work, and it is what is committed.
But a student who reaches ASVAB tier 2 is served items that inherit the validity
defect the direct rebuild exists to remove. The direct tier — what a student
meets first, and for most of their practice — is clean.

**Recommended next job:** author 441 real ASVAB challenge families (147
code-subtest pairs × 3) at band ≥ 4 / DOK ≥ 2 through
`scripts/lib/asvabAuthoring.mjs`, and retire the 438. The authoring kit, the
fidelity gates and the tests all exist now; this is content work, not
infrastructure work. Until then the challenge tier is inherited, not owned.

**Not recommended:** dropping the 438 without replacing them. That empties the
tier-2 candidate pool for ASVAB, and the runtime's fallback needs direct families
at band ≥ 4, which this bank has none of.

