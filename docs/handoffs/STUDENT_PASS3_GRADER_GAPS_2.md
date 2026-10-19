# Student pass 3, wave 7 — grader gaps 2 (mixed numbers, text pair keys, three refused right answers, old keys)

Branch `claude/pass3-grader-gaps-2`, from the integration base `claude/modest-pasteur-xzagn7` at `530ac3cf`, which
is `origin/main` today. W7-1 of wave 7.

Most changes are to grading in `functions/shared`, so they reach every grader on every surface:

- the assignment matcher (`answerUtils.matchesFieldAnswer`, and `ordinaryResponseGrading` for whole questions);
- the Path, secure-test and Live Challenge field grader (`functions/lib/mathPath.js` `valuesEquivalent`, which
  `secureItems.gradeItem` and `gradePathToolResponse` call);
- the teacher's Path simulation (`src/platform/simulation/teacherPathRuntime.js`, a browser copy of mathPath's);
- the browser, which imports the same modules.

Two screen changes go with them:

- a fraction question that asks for lowest terms now says why a mixed number is not taken (item 1);
- Solution Review and Pre-Flight now read an ordered-pair key written as text (item 2).

## Each item on the base

I graded every case on a worktree of `530ac3cf` before changing anything. Item 1 is the visual one, so I also checked
it in a browser on the base: the same driver as the proof below, served from the base worktree.

| Item | Case on `530ac3cf` | Verdict on the base |
| --- | --- | --- |
| 1 | `3\frac{1}{2}` (or typed `3 1/2`) for `7/2`, `\frac{7}{2}`, `3.5`; `-3\frac{1}{2}` for `-7/2` | wrong on all three graders |
| 1 | `3\frac{1}{2}` for `1.5` (3·½) | **right** on all three graders |
| 1, browser | 3½ built with the a/b template on "3/2 + 2" | graded wrong (Chromebook and phone) |
| 1, browser | 3½ on "Simplify 14/4." (key 7/2, lowest terms) | a try spent; no reason shown |
| 2 | `orderedPair` question, `answer: '(2,3)'`, response `(2,3)` | wrong. The server's key check (`serverGradingSupport`) says `no-answer-key`; Pre-Flight shows no key |
| 3 | `\frac{1}{2}\pi` for `pi/2` | wrong |
| 3 | `\sqrt{2}` in a number field keyed `sqrt(8)/2` | wrong |
| 3 | `0.0005` and `\frac{1}{2000}` for `10^{-3}/2` (number field) | wrong |
| 4 | The sweep never tried an old key's text | (the sweep's own gap) |

**What the live site does today:** `origin/main` is `530ac3cf`, so the live site behaves as in the table if releases
#498 and #499 are what is deployed. On every surface, 3½ is wrong for 7/2 and right for 1.5. I could not read the
live build's `gitSha` from here, so I have not verified that it is `530ac3cf`.

## What changed, item by item

### 1 · A mixed number where the key is a number

**What a student saw.** Take a key of 7/2. A student who built 3½ with the fraction template was marked wrong, and
the same 3½ was marked right where the key was 1.5. On "Simplify 14/4." it cost a try, with nothing on screen to say
why.

**The fix** (`answerEquivalence.mjs`, `sameMixedNumber`, called from `sameValue` before any other comparison):

- A whole number followed directly by a number fraction is a mixed number: `3\frac{1}{2}`, MathLive's `3\frac12`,
  and typed `3 1/2`, which normalizes to the same text.
- When the other side is a number, that side's value is whole + fraction, and the sign covers both parts
  (−3½ = −7/2).
- The result is final there: the product reading (3·½) never reaches a number key.
- Only a proper fraction part counts. `3\frac{5}{2}` is neither reading, so it is wrong for 5.5 and for 7.5.
- A key written as a mixed number reads the same way: `3.5` is right for a key `3 1/2`.
- `31/2` typed without a space is still 31 halves.

What it leaves alone:

- **An expression key keeps today's reading.** `3\frac{x}{2}` is still (3x)/2, and a mixed number inside an
  expression is not read (see the owner's list below).
- **Ordered pairs keep wave 6's rule** (review B2): `(1\frac{1}{2},4)` stays wrong.
- **The equivalent-expression grading mode** (`gradingMode: 'equivalentExpression'`) asks `sameMixedNumber` first,
  so it agrees with the others.

**In the real editor, `3 1/2` is not a mixed number.** The driver found this. Typing 3, a space, 1, `/`, 2 into
MathLive gives `\frac{31}{2}`: the space is dropped, the slash takes 31 as its numerator, and the student sees 31/2
stacked on screen. That is graded as 31/2, as before. A student gets 3½ only with the a/b template, which gives
`3\frac12`. Typed `3 1/2` does reach the grader in plain-text fields and saved drafts, and is read as 3½ there.

**A form rule keeps its form, and says why.** The only machine-readable form rule on a number is the `fraction`
type's "a fraction in lowest terms" (`ordinaryResponseGrading.matchesAuthoredFractionAnswer`). That rule is unchanged,
so a mixed number is still not one fraction. The student now reads the reason before a try is spent:

- `answerShapeGuard.fractionFormProblemForResponse` returns "Write your answer as one fraction in lowest terms, not as
  a whole number and a fraction."
- It fires for **any** mixed number, right or wrong, and contains no number, so it says nothing about the key.
- It steps aside where the rule does not apply: on a drill or an authored sum (any answer worth the sum), and when the
  author listed a mixed number among the answers.
- `FractionGrader` holds Submit while the reason shows, the way `MultiAnswerGrader` does for a shape. The reason sits
  under the box. On a phone the floating "Open Work View" button covered it when it was above the box (first
  screenshot), so it moved.
- The sentence is a shape-guard line, like the existing "Write only the number…". Read aloud and Translate do not
  cover those lines, so it needs no Spanish entry.

No other surface states a form rule a mixed number could break. A number field accepts any spelling of the value
today: `0.75` is already right for `3/4`. Digital SAT number boxes are covered under the decisions below.

**Proof.**

- `tests/platform/studentPass3GraderGaps2.test.mjs` grades each case on the secure close (`secureItems.gradeItem`),
  on Path / Live Challenge (`mathPath.gradeResponse`) and on the assignment matcher. It also covers the form rule and
  the reason.
- `tests/browser/fractionTemplateGrading.mjs` (extended) runs on a Chromebook and on a phone by touch. In the real
  QuestionEngine and MathLive:
  - 3½ built with the a/b template is right for 3/2 + 2;
  - on "Simplify 14/4." it shows the reason with Submit held and no try spent;
  - 7/2 is right with no reason shown;
  - a typed "3 1/2" is 31/2 on screen and wrong.
- On the base, the same driver fails these checks, as the table shows.
- Screenshots: `docs/qa/student-experience-pass-3/screenshots/mixed-number-reason-{chromebook,phone}.png`.

### 2 · An `orderedPair` question keyed as text

**What a student saw.** On a question keyed `answer: '(2,3)'`, typing `(2,3)` was wrong. It could never be right:
the grader compared the student's coordinates with `answer[0]` and `answer[1]`, the characters "(" and "2". The
teacher harness's fixture has one (Practice Q2), which is how it was found.

**The fix.** `answerUtils.orderedPairKey` reads a key in either shape:

- an array of two coordinates;
- pair text: `(2, 3)`, `\left(2,3\right)`, `[2, 3]`, or a bare `2, 3`.

A coordinate is a plain number, which becomes a number, or exact text the graders read as one value (`1/2`,
`\frac{1}{2}`, `1-\sqrt{2}`), which is kept as written. Anything else returns null: a letter, a third coordinate, or
words.

| Where | Change |
| --- | --- |
| Grader | `compareOrderedPair` and `gradeOrderedPairResponse` grade against `orderedPairKey`. A plain key is compared by value as before. A key with a root is compared by exact value with W6-6's rules (a decimal stays wrong). Each part's mark is per coordinate (`sameOrderedPairCoordinate`). |
| Server | `serverGradingSupport` counts text that is a pair as a key, so ingestion and the deadline finalizer mark these questions. Text that is not a pair is still `no-answer-key`. |
| V5 compile | `authoringIntentV5Core` stores a text key as `[x, y]`. |
| JSON import | `assignmentBlueprint.normalizeQuestionStorageShapes` stores a text key as `[x, y]`, with a repair line. It also runs for a portable export, which the compile never sees. |
| Pre-Flight | `answerKeyResponse` shows the key. The `orderedPair` catalog entry, in the browser copy and the server copy (`functions/shared/questionTypeCatalog.mjs`), refuses a key that is not a pair: `answer "none" is not an ordered pair the grader can read: write the point as [x, y] or "(x, y)" with two numbers, for example [2, 5]`. A generated question has no key until it is drawn, so a missing key is not judged. |
| Readers of the key | `SolutionReview`, `missDiagnosis.expectedForPart` and `OrderedPairGrader`'s details line read `orderedPairKey`. `OrderedPairGrader` passes a string to its effect, not a new array, so the effect does not re-run on every render. |

**Proof.** In `studentPass3GraderGaps2.test.mjs`: the harness fixture's key, every spelling, a fraction coordinate, a
root, the server's key check, the compile, the import of a portable export, Pre-Flight (both catalogs), and the miss
checks.

**The read-only count** is `scripts/report-ordered-pair-text-keys.mjs`.

- It reads `assignments` only, field-masked, including variants and legacy root lists.
- It counts text pair keys (now graded), text keys that are not a pair (still never right), array keys, and missing
  keys.
- Standard output is counts only. The detail goes to the gitignored `release-reports/`.
- Tests: `tests/platform/studentPass3GraderGaps2Reports.test.mjs` runs it against a store that refuses every write and
  checks the source. `tests/integration/orderedPairTextKeysReport.test.mjs` runs the CLI on the Firestore emulator.

### 3 · Three right answers that were refused

I checked that each pair is the same value first: ½π = π/2, √8/2 = √2, and 10⁻³/2 = 0.0005 = 1/2000.

**`\frac{1}{2}\pi` for `pi/2`.**

- `normalizeAnswer` rewrites a number fraction directly before π as π over the denominator: `\frac{1}{2}π` becomes
  `\frac{π}{2}`, and `\frac{3}{4}π` becomes `\frac{3π}{4}`.
- It runs once spaces are gone, so it never fires after a digit or a name: 2½π is not 2·π/2, and `x\frac{1}{2}\pi`
  is left as written.
- It never fires when something binds to π (`^`, `_`, a letter, a digit, a group), so ½π² is not (π/2)².
- It is notation, so it applies in every field.
- A decimal for π/2 stays wrong.
- `secureMathAnswerRoundTrip.test.mjs` pinned the old refusal ("½π … is not read as the key"). That assertion is
  rewritten to the new behaviour, with wrong neighbours that must stay wrong.

**A number field keyed with an exact constant** (`sqrt(8)/2`, `10^{-3}/2`) is compared by value
(`answerEquivalence` `sameExactNumber`).

- It applies only in a box declared a number (`fieldIsNumberBox`). Every field grader passes
  `fieldValueOptions(field)`, so the Path / secure / Live Challenge grader, the simulation and the assignment matcher
  read a number box alike.
- An expression field keyed `11sqrt(5)` is a "simplify" item, so `\sqrt{605}` stays wrong there.

W6-6's rules hold:

| Key | Answer | Verdict |
| --- | --- | --- |
| a root (`sqrt(8)/2`) | `\sqrt{2}`, `\frac{\sqrt{8}}{2}` | right |
| a root | `1.41421356` (a decimal) | wrong |
| a root | `\sqrt{3}` | wrong |
| a simplified root (`2sqrt(2)`) | `\sqrt{8}` | wrong: the key asks for that form |
| a simplified root (`sqrt(2)/2`) | `\frac{1}{\sqrt{2}}` | wrong: a root in the denominator is not simplified |
| no root (`10^{-3}/2`) | `0.0005`, `\frac{1}{2000}` | right: one plain number |
| no root (`10^{-3}/2`) | `0.005` | wrong |
| no root (`(-(-4))/2`) | `\sqrt{4}` | wrong: a root for a plain number, as S4 ruled |
| no root (`10^{-3}/2`) | `10^-\frac{3}{2}` | wrong (N2) |

**Proof.** `studentPass3GraderGaps2.test.mjs` checks each case on all three graders. The sweep's wave-7 block checks
each case outright (below).

### 4 · The sweep tries every old key

`scripts/sweep-equivalence-verdicts.mjs`:

- **Old keys.** The sweep reads every committed version of every seed file from git (`git log --follow`,
  `git show`). Where a field's key template differs from today's at the same `familyVersion` and is not already among
  today's accepted forms, it fills the old template with the parameters of today's draw (same seeds). Today's key must
  then accept that text outright: `oldKeySpellingsRefused` must be 0, and `--check-wrong` fails otherwise.
  - A family drawn through variants, or whose parameters no longer fill the old template, is counted, not guessed
    (`oldKeysNotAligned`).
  - **A field re-asked as another kind of answer** (its `inputProfile`, `answerFormat` or `equivalence` changed) is
    listed for the owner, not graded (`oldKeysReasked`). The first run found 10 of these (below). Interval notation is
    not a spelling of an inequality, so failing them would have been wrong.
  - Proof that the check can fail: I dropped S1's accepted old key and changed today's key so that it refuses the old
    spelling. The sweep exited 1 with `oldKeySpellingsRefused` 10. The seed file was restored.
- **The sweep mirrors production's field options.** Its Path grader passes `fieldValueOptions` (the base tree passes
  its own thousands-separator option), and its assignment grader passes the field's `inputProfile`. Before this, the
  sweep could not see any profile-dependent rule.
- **Wave-7 shapes, outright**, checked by `gapSpellingsRefused` and `gapWrongAccepted`:
  - mixed numbers, signed, and against the product reading;
  - ½π;
  - the number-box value rule and everything it must still refuse.
  - Every number key with a fractional part also gets a mixed-number spelling, and so do its near misses.
- A field's identity in the corpus now includes its profile, and gap checks are kept per key and profile. Without
  this, a number box and an expression field with the same key (`10^{-3}/2`) collapsed into one.
- Mutation checks: turning the number-box rule off makes `gapSpellingsRefused` 10. Turning the mixed-number rule off
  makes `gapSpellingsRefused` 75 and `gapWrongAccepted` 9.

## The sweep against the base

`node scripts/sweep-equivalence-verdicts.mjs --base <worktree of 530ac3cf> --draws 3 --check-wrong` (exit 0):

```
fields 10012, drawn 10050, graded 289824
rightToWrong 0, nearMissNowRight 0, stackedWrongAccepted 0, editorSpellingsRefused 0
gapSpellingsRefused 0, gapWrongAccepted 0   (on the base: 94 and 9)
oldKeySnapshotsRead 134, oldKeyTemplatesFound 10, oldKeySpellingsRefused 0, oldKeysNotAligned 0, oldKeysReasked 10
wrongToRight 1009    nearMissNowRefused 66
```

**`wrongToRight` 1,009 (327 distinct response/key pairs).** Every one is the mixed-number spelling of the key's own
value: `-1\frac{1}{2}` and `-1 1/2` for `-1.5`, `3 14/100` for 3.14. They are right because 3½ is 7/2 (item 1).
Grouped list: `docs/qa/student-experience-pass-3/grader-gaps-2-sweep.json`.

**`nearMissNowRefused` 66 (21 distinct pairs). The brief asks for 0; this is the fix item 1 asks for.**

- Every one is a mixed-number spelling of a near miss that the base accepted through the product reading: `1\frac{1}{2}`
  for `0.5`, `2 1/20` for `1.05`.
- Each is a wrong answer the base let through (1½ is not ½), and is now refused. That is exactly "3½ is accepted where
  the key is 1.5".
- The counter is non-zero only because the sweep now builds mixed-number spellings.
- No right answer moved to wrong (`rightToWrong` 0).

**`oldKeysReasked` 10.** All 10 are at Algebra I commit `dc2ae1ad`, "Promote certified Algebra I II Fidelity V2 Path
seeds". The fields went from `interval` to `inequality` with no `familyVersion` move. For example,
`mm_A_2A_v2_bounded-range` changed from `[{{ylo}},{{yhi}}]` to `{{ylo}}<=y and y<={{yhi}}`, and its prompt changed with
it. The others: `context-domain-range` (×2), `decreasing-range-error`, `projectile-context-domain-range` (×2),
`restricted-domain-range` (×2), `downward-range-error`, `context-restricted-domain`.

A session issued before the change keeps the key it was issued with, so no recorded verdict moves. But a question was
rewritten at the same version, which is what the version is meant to signal. This is a content-versioning question for
the owner.

## The read-only count of recorded answers whose verdict would change

`scripts/report-grader-gaps-2-regrade.mjs --project <id> [--surface assignments|secure|path]`. It has no write mode.

It grades recorded answers again with this tree's grader and counts the changes:

- by surface;
- by direction: **up** is recorded wrong and now right; **down** is recorded right and now wrong;
- by the wave-7 rule that explains each change: `mixedNumber`, `halfPi`, `exactNumber`, `textPairKey`, or `other`.

D8 stands: a re-grade moves a verdict up only. The `down` rows are listed for the owner and never applied. They are
mostly 3½ recorded right for a key of 1.5.

What each surface keeps decides what can be counted:

| Surface | Read | Limits |
| --- | --- | --- |
| Assignments | `grades/*/responseInspectionEvidence/{assignment}__q{i}` (collection group, field-masked), against the delivered question or the stored one | The last counted attempt only. A family, generated or variant question without the delivered copy is not re-gradable. A fraction drill is not re-gradable. |
| Secure tests | `examSessions/{id}.responses`, against `items/{id}.item`'s private grading (the same `gradeItem`) | Rich-tool items are skipped |
| Path | `pathSubmissions.recapJson` of the attempt that closed a question, against the key's display value | A lower bound: accepted forms and the field's profile are not stored, so `exactNumber` cannot be seen |
| Live Challenge | — | **Not countable:** no response is stored, only receipts with the verdict |

Standard output is counts only. The detail (student ids, the response and the key) goes to the gitignored
`release-reports/`. The collection-group query has no `orderBy`, so it needs no index.

Tests:

- `studentPass3GraderGaps2Reports.test.mjs` uses a store that refuses every write, applies field masks and supports
  collection groups (`tests/platform/helpers/readOnlyFirestore.mjs`). Each surface's up / down / not-re-gradable path
  is covered, and the source is checked for writes.
- `tests/integration/graderGaps2RegradeReport.test.mjs` runs the CLI on the emulator.

**For the owner to run** (read-only; a viewer role is enough):

```bash
node scripts/report-ordered-pair-text-keys.mjs --project mathmaster-aleks
node scripts/report-grader-gaps-2-regrade.mjs --project mathmaster-aleks
```

I have not run either against production.

## Mutation checks

Every new assertion was broken at least once and went red, then the code was restored (a script applied each break,
ran the suites and restored the file). These are the breaks that went green at first, and the assertion each needed:

| Break | Was green because | Assertion added |
| --- | --- | --- |
| ½π rewrite fires after a digit | the text verdict did not change | 2½π stays `2\frac{1}{2}π` |
| ½π rewrite binds a power | same | ½π² is not `\frac{π}{2}^…` |
| a rational key takes a root | no case had one | `\sqrt{4}` for `(-(-4))/2` |
| the grader's key not normalized | `compareOrderedPair` already read text | `expectedPair` is `[2, 3]` |
| per-coordinate marks by `Number()` | no root key had part marks | parts for a root key |
| a root pair incomplete | `isCorrect` did not need it | `isComplete` for a root pair |
| the compile not normalizing | the import's storage pass also did it | the compile alone |
| a missing key judged | only the server catalog was checked | the browser catalog too |
| a fraction drill re-graded | not seeded | seeded |
| a Path recap with unpaired labels | not seeded | seeded |

One guard turned out redundant and stays documented as defensive: the regrade count refuses family, generated and
variant questions, which the shared support check already refuses.

The sweep's new checks were mutation-checked as described in item 4.

## Gate (on `HEAD`, all run here)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 12,137 pass, 0 fail |
| `node --test tests/tools/*.test.mjs` | 1,710 pass, 0 fail |
| `npm run lint` | exit 0, 0 errors. A needless escape I added was fixed; I did not compare the other warnings with the base |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs --report` | **studentHome 840.7 KB** gzip (base 839.3, so **+1.4 KB**, inside this branch's 1.5 KB); **signIn 291.9 KB**; within baseline. Baseline file not touched |
| `npm run test:authoring-v5` | 686 pass |
| `npm run test:challenge-finish` (every `tests/integration/*.test.mjs`, including my two) | 490 pass |
| `npm run test:canonical-persistence` | 35 pass |
| `npm run test:secure-exam-navigation` | 25 pass |
| `npm run test:grade-authority` | 14 pass |
| `npm run test:classroom-regrade-report:emulator` | 5 pass |
| `npm run audit:answer-acceptance` | 27,257 known-correct variants, 0 false negatives |
| Sweep against the base | exit 0; counts above |
| Grader unit suites (`answerEquivalence`, `stackDivisions`, `secureMathAnswerRoundTrip`, `thousandsSeparatorGrading`, every `*Equivalence*`) | in `test:platform`, all pass |
| Driver `fractionTemplateGrading` (Chromebook, phone) | pass (extended for item 1) |
| Driver `mathEntryContract` | pass |
| Driver `relationPlotGrading` | pass |
| Drivers `questionFamilyCases`, `secureAccessParity`, `submitAndFinishJourneys` | see the last section |

## Deploy targets

`node scripts/release-firebase.mjs --since 530ac3cf` (plan only):

- **functions: the whole default fleet.** `functions/shared` and `functions/lib/mathPath.js` changed, and every
  function bundles them. The planner sends 28 groups, with `platformBuildInfo` verified before anything later.
- **`functions:path-admin`.**
- **Hosting**, through `npm run deploy:hosting`.
- **No rules and no indexes.**

Through the planner (`--execute`), never a raw `firebase deploy`. I deployed nothing.

## Decisions for the owner

1. **Accept a mixed number for a number key** (the integrator's recommendation, implemented). Say if you want it
   refused instead. If you keep it, two follow-ups:
   - the secure number hint ("write a mixed number as a fraction or a decimal", `SECURE_ENTRY_HINTS.number`) is now
     stricter than the grader. It is still safe advice. Change its words only with a Spanish entry.
   - **Digital SAT number boxes accept it too.** The SAT itself refuses mixed numbers. I followed #496's precedent for
     thousands separators: an SAT entry rule belongs at entry (the box declining the keystroke), never as a right value
     graded wrong. Say if you want the SAT rule at entry.
2. **A lowest-terms `fraction` question refuses 3½** and says why. Many middle-school teachers accept 3½ as simplest
   form. Say if a mixed number with a reduced fraction part should count as lowest terms.
3. **Expression shapes where a mixed number could be meant.** All of these are refused today, and none is read as a
   product either:

   | Field | Answer | Key |
   | --- | --- | --- |
   | expression | `2\frac{1}{2}x` (coefficient) | `5x/2` |
   | expression | `2\frac{1}{2}\pi` | `5pi/2` |
   | number | `x=3\frac{1}{2}` | `7/2` |
   | equation | `x=3\frac{1}{2}` | `x=7/2` |
   | equation | `y=2\frac{1}{2}x+1` | `y=5/2x+1` |
   | inequality | `x<3\frac{1}{2}` | `x<7/2` |
   | interval | `[1\frac{1}{2},3)` | `[3/2,3)` |
   | set | `\{1\frac{1}{2},2\}` | `{3/2,2}` |
   | ordered pair | `(1\frac{1}{2},4)` | `(3/2,4)` (wave 6 ruled this one wrong) |
   | number | `3\frac{1}{2}\%` | `3.5%` |

   Each would need its own rule if you want it read.
4. **The 10 Algebra I fields re-asked without a version move** at `dc2ae1ad` (interval → inequality). Decide whether
   content changes like this must move `familyVersion`. The sweep now lists them.
5. **The recorded-answer count:** run the two read-only scripts and decide whether to re-grade the `up` rows (D8: up
   only).

## Outside my scope (touched, minimal)

- `src/FractionGrader.jsx`, `src/OrderedPairGrader.jsx`, `src/SolutionReview.jsx`: the reason line, and the key
  readers.
- `src/platform/supports/feedback/missDiagnosis.js`: one line. The key reader; W7-4 owns feedback reasons.
- `src/platform/interaction/answerShapeGuard.js`: a new export.
- `src/assignmentBlueprint.js`, `src/platform/contract/authoringIntentV5Core.js`,
  `src/platform/contract/questionTypeCatalog.js` and its server copy, and
  `src/platform/preflight/questionGenerationPreflight.js`: item 2.
- `src/platform/simulation/teacherPathRuntime.js`: the options call.
- `tests/browser/fractionTemplateGrading.mjs` and its fixture: item 1's browser proof.
- `tests/platform/secureMathAnswerRoundTrip.test.mjs`: one rewritten assertion (½π).
- **No change to `src/App.jsx`.**

## Not done, and found here

- **A typed `3 1/2` in the math editor becomes 31/2** (MathLive drops the space). The student sees 31/2 stacked, so it
  is not silent, but a student who types it that way is marked wrong. An editor rule (a space after a whole number,
  then `/`, starts a mixed number) would be MathInput's. W7-2 owns MathInput naming this wave. **For the owner.**
- On a phone, the floating "Open Work View" button covers the fraction question's "Fractions" heading and the top
  edge of its answer box. This is the same on the base. My reason line sits below the box, clear of it.
- **System questions keyed `{x, y}`.** The teacher harness's Practice Q1 has `solution: { x: 3, y: 2 }`, and
  `gradeSystemResponse` reads `solution[0]` and `solution[1]`, so that question is unanswerable in the same way.
  `orderedPairKey` could read it. Item 2 named `orderedPair` only, so I left it.
- **The count of recorded answers cannot see** Live Challenge (no response is stored), earlier assignment attempts
  (only the last counted one is stored), or Path's accepted forms and number boxes.
- `1+2` for a number key of 3 is right, on the base and here (the expanded-polynomial comparator). Wave 6 ruled
  unworked arithmetic wrong in pairs only.
