# CCMR ASVAB Fidelity V2.1 — AR/MK Rebuild Handoff

**Scope owned:** ASVAB Arithmetic Reasoning and Mathematics Knowledge.
**Not touched:** Digital SAT, ACT, TSIA2 (ChatGPT's lanes).

## Status in one line

The audit infrastructure, the authoring kit and one fully authentic standard are
**done and verified**. The remaining **145 of 146 standards are not rebuilt**,
and the shipping bank is deliberately unchanged. Read "What is not done" before
planning around this.

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
| Old builder (relabel pipeline) | `scripts/build-asvab-drafts.mjs` |
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

### New: `functions/shared/asvabFidelity.mjs`
Pure, dependency-free analysis shared by the audit script and the tests.

- `analyzeAnswerKeyBias` — rank *and* position histograms of the key across many
  draws. Rank is the channel shuffling cannot touch and is where the old bank
  leaked.
- `taskFingerprint` — structural signature built from the generator's relation
  graph, so renaming every noun does not change it. This is what catches
  "car/truck/bus" clones.
- `promptSkeleton` / `promptOverlap` — surface-language clone detection,
  independent of the above.
- `analyzeRegister` — AR vs MK word/sentence limits, plus rejection of prompts
  that name the procedure ("use the percent decrease formula") or borrow SAT
  voice ("a researcher collected a data set…").
- `analyzeDistractors` — every distractor must name a misconception from
  `DISTRACTOR_ERRORS`, and the three must be different.
- `analyzeFamilySet` — the five-family check.

**On thresholds, honestly:** `RANK_TOLERANCE` is 0.55, not 0.25. A one-step
proportion draws only two independent quantities, so every distractor built from
them moves with one of those two and the key can occupy at most two ranks — 0.5
is the floor the mathematics allows. `EXTREME_TOLERANCE` is 0.45 and guards the
cheap exploit ("always pick the smallest"). This is documented in the module
rather than presented as if 0.25 were achieved.

### New: `scripts/lib/asvabAuthoring.mjs` (authoring kit)
Refuses at build time to emit a bad item. It:

- rejects any distractor without a named misconception, or repeated misconceptions;
- **auto-derives pairwise-distinct constraints from the choice labels** — a
  hand-written constraint list had missed one pair and shipped a draw reading
  `17, 16, 16, 15`, which is unanswerable rather than hard;
- assigns **opaque choice ids** (`choice-a`…`choice-d`) and decides which id holds
  the key by hashing the family id, closing the `asvab-correct` leak;
- writes canonical `assessmentContext.domainId` (keeping `subtest` alongside it
  with the same value so teacher screens built on the old name cannot drift);
- pins `calculatorPolicy: 'none'` / `examCalculatorMode: 'none'`;
- stamps `familyVersion: 2`, which is the existing per-item version the evidence
  pipeline already records in `questionSnapshot`;
- `assertStandardVariety` enforces the 3/3/2/2 spread before anything is written.

### New: `scripts/audit-asvab-fidelity.mjs`, `scripts/asvab-rank-probe.mjs`
The audit gives KEEP/REVISE/REPLACE verdicts and exits non-zero on any REPLACE.
The rank probe is the tuning tool used while authoring.

### New: `scripts/author-asvab-ar.mjs` → `drafts/asvab-ar.json`
The rebuilt content. **Currently one standard: `6.4B`, five families.**

### New: `tests/platform/asvabFidelity.test.mjs` — 15 tests
Covers the analyzers themselves (including a regression test that the old
`+1/+2/+3` shape is detected, and that money labels do not slip past the check),
plus gates on the rebuilt content: canonical identifiers, no key-revealing choice
ids, clean generation over 80 draws, four distinct choices, exactly one key, no
unbound placeholders, no bias over 120 draws, register, distractors, five distinct
task structures, and **independent re-derivation of generated answers** — the
test recomputes the mathematics itself rather than trusting the generator.

---

## 4. The one rebuilt standard (`6.4B`), for calibration

Five families, five task structures: proportional scale, better-buy-then-scale,
ratio partition, produce-then-compare, two-rate total. Representations span
context / verbal / table; task types span application / interpretation /
reverseReasoning / procedural; DOK 2–3; bands 2–3.

Sample draw:

> A supply depot sells panels at 3 for $30 or 5 for $35. At the lower price per
> item, what do 8 panels cost?
> **$80  $56  $35  $30**  (key: $56)

Distractors are the price at the *worse* unit rate, the package price, and the
other package price — real quantities from the situation, which is both how ASVAB
distractors behave and why they straddle the key.

Measured (`scripts/asvab-rank-probe.mjs`, 60 draws each):

```
ok  scale_prediction          ranks=[23,5,22,10]  worst=38%
ok  better_buy_then_scale     ranks=[14,29,17,0]  worst=48%
ok  part_from_ratio_and_total ranks=[18,15,8,19]  worst=32%
ok  shortfall_after_run       ranks=[14,14,26,6]  worst=43%
ok  two_rate_shift_total      ranks=[0,19,29,12]  worst=48%
```

Both gates clean:
```
audit-asvab-fidelity : keep=5 revise=0 replace=0, zero issues
audit-asvab-drafts   : badFormat 0, thin 0, duplicateChoices 0, generationFailures 0,
                       qualityFailures 0, badStandards 0, suspiciousArithmeticPrompts 0
```
`badStandards: 0` means 6.4B reaches PRODUCTION_READY, not "candidate".

---

## 5. What is NOT done

**145 of 146 standards are not rebuilt.** Concretely:

| | Standards | Families | Rebuilt |
|---|---:|---:|---:|
| Arithmetic Reasoning | 31 | 155 | 5 (1 standard) |
| Mathematics Knowledge | 116 | 575 | 0 |

**The shipping bank was not modified.** `drafts/asvab.json` and both seed mirrors
are byte-identical to `HEAD`. This is deliberate: swapping 730 families for 5
would destroy ASVAB coverage across 145 standards and break the coverage
manifest. The new content sits in `drafts/asvab-ar.json` until it is complete
enough to replace the old bank wholesale.

**Consequence to be explicit about:** the validity defect in §1 is *diagnosed and
measurable, not yet fixed in production*. Students practising ASVAB on the live
site today still get the exploitable bank.

**Also not done:**
- No content release bump. `PATH_WEB_RELEASE` is still
  `path-bank-2026-08-21-r9-asvab`; it should move with the content, not ahead of it.
- **In-flight session retirement is an open gap.** `familyVersion` is recorded per
  evidence event (`questionSnapshot.familyVersion`), and
  `removeSupersededBuiltInPathSeedRecords` retires superseded bundled questions on
  refresh — but `issueNextQuestion` instantiates from the bank at issue time, so a
  session started before a bank swap would draw new-bank questions mid-session.
  Nothing was invented to paper over this; it needs a decision on the existing
  mechanism before content ships.
- `scripts/build-asvab-drafts.mjs` (the old relabel pipeline) is still present and
  still regenerates the old bank. It must not be run after the rebuild lands.
- Assessment-simulation scaffold suppression was not exercised; the rebuilt items
  carry no baked-in scaffolds, but that was not tested against the assessment-mode
  architecture.

---

## 6. Tests run

| Command | Result |
|---|---|
| `node --test tests/platform/asvabFidelity.test.mjs` | **15 / 15 pass** |
| `node --test "tests/platform/*.test.mjs"` | **2037 / 2037 pass** |
| `node --test "tests/tools/*.test.mjs"` | **67 / 67 pass** |
| `node scripts/audits.mjs` | all three audits pass |
| `npm run build` | succeeds |
| `npx oxlint` on changed files | clean (pre-existing warnings in untouched files only) |
| `node scripts/audit-asvab-fidelity.mjs drafts/asvab-ar.json --samples 60` | keep=5 replace=0 |
| `node scripts/audit-asvab-drafts.mjs drafts/asvab-ar.json` | all counters 0 |

`npm run test:rules` was **not** run — it needs the Firestore emulator and no
rules file changed in this work.

---

## 7. Shared runtime files touched

**None.** Every file added is new, and nothing in `src/` or `functions/` imports
`asvabFidelity.mjs` at runtime — it is used only by scripts and tests. There is
therefore no code path by which this work can alter SAT, ACT, TSIA2 or course
behaviour.

## 8. SAT / ACT / TSIA2 confirmation

Byte-identical to `HEAD`, verified by checksum:

```
digitalSAT  b867a85ac686ee90fae415515c851251  (unchanged)
act         5a86ea3a173bb71a1a420964af87441c  (unchanged)
tsia2       90e27201760796e43b68afa2f68dd19d  (unchanged)
asvab       c802f080f36cc02d58f169af50427072  (unchanged — see §5)
```

`git status` shows only additions; no existing file was modified.

---

## 9. Recommended next steps

1. **Decide whether the live bank should stay up.** Given §1, serving it is
   arguably worse than serving nothing, because it produces confident-looking
   readiness numbers from an instrument that measures nothing.
2. Rebuild AR standard by standard (30 remain), running
   `asvab-rank-probe` while tuning and both audits after each standard.
3. Then MK (116 standards). MK is more tractable per family — most items are
   direct and symbolic — but it is the larger half by count.
4. Resolve the session-retirement gap, then bump `PATH_WEB_RELEASE` and swap the
   seeds in one release.
5. Delete or clearly retire `scripts/build-asvab-drafts.mjs` at that point.

The per-standard loop is:

```
node scripts/author-asvab-ar.mjs
node scripts/asvab-rank-probe.mjs
node scripts/audit-asvab-fidelity.mjs drafts/asvab-ar.json --samples 60
node scripts/audit-asvab-drafts.mjs   drafts/asvab-ar.json
node --test tests/platform/asvabFidelity.test.mjs
```
