# Student pass 3, wave 6 (W6-3): hints that fit

Branch `claude/pass3-hints-that-fit`, from `claude/modest-pasteur-xzagn7` at `5062cba5`; the base at `3cb782a9` is merged in (review round 1). IDs come from
[03-help-and-self-correction.md](../qa/student-experience-pass-3/03-help-and-self-correction.md) (HELP-16, HELP-23,
"Also noted") and [04-tools-and-accessibility.md](../qa/student-experience-pass-3/04-tools-and-accessibility.md)
(TOOL-5).

This branch changes browser code and tests only. It does not re-grade anything, write to production or deploy. No Cloud
Function, Firestore rule, index or stored shape changes. On an exit ticket, quiz or test nothing changes: hints are not
offered there, and every new sentence is on the secure-surface leak list.

## Reproduced first, on the base

The report's probe was not in the repo, so I rebuilt it (scratchpad `probes/hintdrop-probe.mjs`). It compiles the 17
real lesson files with `compileAuthoringIntentV5` and runs `buildQuestionHints`. On `5062cba5` it gives the report's
numbers exactly: **32 of 200** teacher-written hints dropped, and **50 of 265** Warm-Up/Classwork/Practice items with
only the generic fallbacks (20 of them systemsWorkspace).

In the browser, on the base, in the real QuestionEngine:

- **HELP-16.** On Algebra I M2 T2 L2, WU 2, the Hint panel's `data-hint-sources` was `authored authored`. Only 2 of
  the teacher's 3 hints were in the ladder, and the x-intercept hint was missing.
- **TOOL-5.** Most of it was already fixed by Batch 4's HELP-10 (and by W4-1's Work View Help):
  - On L2 PR 1 (Transformations Lab, practice) there is no "Stuck? Show a hint". The tool's rungs feed the platform
    ladder.
  - A hint revealed inline shows as revealed in Work View Help, because both are the same panel and the same state.
  - **What was still there:** the legacy step solvers' **"Need a strategic hint?"** (the `toolPolicyGates` step fixture,
    practice). It was a second hint control beside the work bar's Hint. It opened with no try at all, was recorded
    only as "a hint was used", and never went through the leak guard.
- **W5-4's graph opt-in** ("Which way is each point off?") is a check that is recorded like a hint, not a hint ladder.
  I left it as it is.

## HELP-16: the leak guard drops only hints that state an answer

**What a student saw.** On L2 WU 2 the teacher's first hint, "The x-intercept is where the output is 0: solve
0 = 3x − 8.", never appeared, because 3 is the answer to the slope field. Nothing told the teacher.

**What changed.**

- `src/platform/supports/hints/hintLeakGuard.js` (new). It refines the old rule only in places where the shared
  `hintRevealsAnswer` already matched, so it can never drop fewer leaks than before for a non-number answer.
  - A **number** answer (3, −2, 4/3) does not count when **every** place the hint writes it is inside something the
    student already reads, quoted whole:
    - an expression with a variable whose text is in the prompt or a field label ("3x − 8" in "g(x) = 3x − 8");
    - a point that is in the prompt or a field label ("(−2, 9)").
  - "Quoted whole" means a whole token, and the expression must be mathematics (review B1):
    - "3x − 8" is not quoted by "13x − 8", and "2x + 1" is not quoted by "12x + 1";
    - an expression needs an operator, a bracket or a number against a letter, so "a 3" (the word "a") is prose.
  - Numbers are read **by value**:
    - "12", "1/2", "2.5" and "−2" do not write 2;
    - "3/1" writes 3;
    - "x/2" writes 2;
    - "−1/n" (a numerator over a variable) does not write −1;
    - a minus after an operand is subtraction, so "x − 2" writes 2;
    - "3/(1)" writes 3: only a numerator over a letter is skipped, not one over a bracket;
    - a minus glued to its number with a space before it is a sign, even after a one-letter word or ")" ("is a -2",
      "(m) -2"; review round 2, R1). "3x − 8", spaced on both sides, stays subtraction. The one side effect is that
      "x -5 = 0" against −5 is dropped, which is fail closed and the same as on the base.
  - **Never excepted:**
    - a point, an expression, an equation or a word answer;
    - a number stated on its own: "the slope is 3", "multiply by −2", "= −8/5";
    - a coefficient the problem does not show: "7 = −2(−2) + b" names the slope −2.
  - When unsure, the value counts (fail closed). An empty list of matches is never "quoted". If the shared guard matched
    and no number in the hint could be the value as text, the value counts ("4/3" inside "14/3"). It is "not written"
    only when every textual match is shown to be a different number (a sign, a fraction, a numerator over a variable).
- `questionHints.js`:
  - The guard now reads a **table's answer cells** (`question.table.answers`). L2 CW 9's third hint, "(4/5)(−2) = −8/5
    and (5/4)(−2) = −5/2", states two of the cells the student fills in, and the base showed it.
  - `questionHintAudit()` returns every hint with its verdict and reason. `buildQuestionHints` is now just the shown
    hints from that audit.
- **Pre-Flight**: a new advisory panel, **"Hints students will not see"** (`hintAnswerPreflight.js`
  `auditAssignmentHiddenHints`, `assignmentV5PreflightModel` `hiddenHints`, `LessonPreflightModal`).
  - It has one line per dropped teacher hint, with the hint, the reason ("it names “4/3”, which is an answer to this
    question or part of one", or "it repeats an earlier hint") and how to reword it.
  - It lists hints only on activities that offer hints. A DOL, quiz or test offers none, so nothing is listed there.
  - Like the panels beside it, it is not a readiness diagnostic. Pinned: it is not in `diagnostics` or `warnings`.

**Every hint whose verdict changed.** The sweep (scratchpad `probes/verdict-sweep.mjs`) reads the 17 lesson files and every
bank (`drafts/*.json` and `functions/seeds/pathQuestionBank/*_seed.json`). That is 10,773 documents; 66 do not compile.
Each bank document goes through `bankDocumentToV5Intent` and is generated 3 times, as the K sweep does: 32,121
instances and 31,961 teacher hints. Comparing the base `3cb782a9` with the new head gives **11 changes**: 5 in the
lessons (below; the unit test pins them) and one bank item, `mm_A2_7C_v2_cubic-quadratic-exact`. That item is in
`drafts/algebra2.json` and in the seed, 3 draws each, so 6 instances:

- The hint is "Divide leading terms first: 3x^3 ÷ x^2 gives the first quotient term." → **shown**.
- "3x^3" is quoted from the prompt. The hint never writes the coefficient 3, the constant or the quotient; it is the
  method, which practice allows.

Base totals: 31,800 shown and 161 dropped. Head: 31,807 shown and 154 dropped.

| Question | Hint | Before → after | Why |
| --- | --- | --- | --- |
| L2 WU 2 | "The x-intercept is where the output is 0: solve 0 = 3x − 8." | dropped → **shown** | The 3 is only in "3x − 8", quoted from the prompt. No answer is stated: the x-intercept (8/3, 0) and the slope are not written. |
| L3 CW 2 | "Line C: from (−2, 9) to (6, 5). Line C′: from (0, −7) to (6, 5)." | dropped → **shown** | It holds only the prompt's own points. "−2" is not the answer 2 (the slope of C′). None of the slopes, the product or the equations is written. |
| L3 CW 4 | "A whole number n is n/1, so its negative reciprocal is −1/n." | dropped → **shown** | "−1/n" is a rule, not the number −1. None of the six slopes is written (practice/classwork, where the method is allowed). |
| L2 CW 9 | "(4/5)(−2) = −8/5 and (5/4)(−2) = −5/2." | shown → **dropped** | A real leak: it fills two table cells. |
| L2 CW 9 | "For c(x), multiply each output f(x) by 4/5." | shown → **dropped** | 4/5 is also a cell (row x = 1). This is the cost of reading the table, and the item now has no teacher hint left. Pre-Flight tells the author. |

**The bar holds:** none of the three newly shown hints gives an answer. Across all 169 shown teacher hints, no point,
expression or word answer appears; the unit test asserts this for every real lesson. **After: 31 of 200 dropped**, all
listed in Pre-Flight (31 lines over the 17 files). The 28 that stay dropped are left to the author, not the guard:

- 15 state an answer outright, for example "The negative reciprocal of −3/4 is 4/3." and "S1 = (−2, −2) lands at
  (−2, 4).".
- Some are harmless but cannot be told apart from a leak by reading text. The author can reword each one, and Pre-Flight
  says how:
  - the general rule "…x + 5 moves left, (1/2)x stretches by 2" on L2 PR 1–6 (2 is a coordinate to plot);
  - "Multiply each y-coordinate by −2." on L2 PR 9;
  - "Pick two points on y = −2, like (0, −2)…" on L3 CW 10.

**Proof.**

- `tests/platform/hintsThatFit.test.mjs`:
  - the quoting rule;
  - the stated cases still dropped (8 real hints and synthetic points, values and fractions);
  - table cells;
  - the exact list of changed verdicts, with the 32 base drops pinned as a fixture;
  - Pre-Flight's wording, its count (31) and its roles.
- Browser `tests/browser/hintsThatFit.mjs`: on L2 WU 2 the ladder is `authored authored authored` and the first hint
  revealed is the x-intercept hint, at 1366×900 and 390×844.

## HELP-23: fallbacks that fit, and Ask my teacher where nothing fits

**What a student saw.** On a systems, matrix, sort, graph or choice item with no hint of its own, the student read
"Underline what the question asks…" and "…does each step keep the two sides equal?".

**What changed.**

- `FALLBACK_HINTS` / `fallbackKind()` in `questionHints.js` pick two rungs by what the student does on the item:
  systems (systemsWorkspace), matrix (Matrix Lab), sort (figureMatch, representationMatch, OpenSortBoard), graph choice,
  graph (graphing, transformations, plane tools), build (representationBridge), choice (multipleChoice, or every field
  a choice), and general (the old two, kept for numeric and equation items).
- Each rung is about reading or checking the student's own work. A test asserts that no rung names a method these items
  grade (eliminate, substitute, reciprocal, slope, inverse, row operation, stretch, intercept…), in English or in its
  Spanish (review N3: the matrix rung's "sustitúyela" became "vuelve a ponerla"), and that none carries a number.
- When every rung is a fallback, the Hint panel says **"These hints are general, not written for this question. For
  help with this one, ask your teacher with the button below."** It appears only when Ask is wired, so it never points
  at a button that is not there. It is also hidden while the hand is up, because the button below then reads "Cancel my
  help request" (review N4).
- Spanish for every new rung is in `packs/esSupport.js`. `readAloudAndTranslate` now requires full coverage of every
  kind.

**A finding.** The probe's "20 systemsWorkspace items with only fallbacks" is a static count. In the browser, the 3×3
items publish their own rungs (Day 1 CW 1: `tool tool tool`; Day 2 CW 1: four), so a student meets the systems fallback
only where a stage has no HintPanel. The real lessons now get these fallbacks: choice 10, sort 7, build 5, graph
choice 4, graph 2, general 2, and systems 20 (statically).

**Proof.**

- `hintsThatFit.test.mjs`:
  - the 50 items' kinds;
  - the method-word check;
  - an SSR render of HintPanel: the pointer shows with Ask, and not without Ask, not with an authored hint and not on
    the Ask-only panel.
- Browser `hintsThatFit.mjs`, 3×3 Day 2 WU 2 (two choices): the ladder is `generic generic`, the first rung is "Read
  each choice all the way through before you pick one.", there is no "keep the two sides equal", the pointer sits above
  "Ask my teacher", and Ask raises the hand. Both sizes.

## TOOL-5: one ladder, the solver's hint included

**What a student saw.** HELP-10 had already made registry tools hand their rungs to the platform ladder, but the legacy
step solvers still showed "Need a strategic hint?" beside the work bar's Hint. It opened with no try and showed the
exact next move.

**What changed.** `StepByStepAlgebraCore.jsx`:

- Inside a question (a host with the platform ladder, `useToolHintPublisher`), the strategic hint is **published as the
  solver's rung** (`toolHintChannel`), like a registry tool's HintPanel.
- It is a **standing** rung (review S1): `{ text, standing: true }` through `toolHintChannel.publishableHints`.
  - It comes first in the ladder and is open from the start, as "Need a strategic hint?" was.
  - It takes no other rung's place: `hintRelease` opens `standing + 1 + tries` rungs, so the k-th family rung still
    opens after try k − 1, exactly as on the base.
  - What is new: it is read through the leak guard, recorded like every hint (`hintsRevealed` and `recordHintUse`),
    and shown as read in Work View Help, which is the same panel.
  - A plain tool rung keeps the one-per-try rule (HELP-10).
  - It sits outside the 6-rung cap. Where it is the only other rung (a systems stage with no tool HintPanel), the two
    fallbacks stay beside it and open as before (review round 2, R2).
- It follows the equation on screen.
- The disclosure is rendered only where there is no platform ladder (the tools lab, a server-graded host), exactly as
  registry tools do.
- Nothing changes on a DOL, quiz or test: the rung exists only where hints are allowed.

**Why not simply put it last or first.** In the first version it came fifth, after four family rungs, so on a 3-try
item it never opened (review S1: LMR CW 1–3 and PR 1–2, 3×3 Day 1 WU 1–2 and PR 6). Putting it first without its own
place would push family rung 3 out of reach. The standing place meets the bar: no practice or classwork student loses
help they had.

**Proof.**

- `hintsThatFit.test` runs over those 8 real items:
  - the solver's rung is first and open before the first try;
  - after 0, 1, 2 and 3 tries the family rungs that open are exactly the base's;
  - nothing opens on an assessment;
  - a plain tool rung is not open early.
- Browser `toolPolicyGates`, practice:
  - there is no "Need a strategic hint?";
  - before any try, "Show a hint" opens the strategic hint, the family's first hint still opens, and its second waits
    for a try.
  - On DOL and test there is still no strategic hint.
- Browser `assessmentLeakGates` composed-algebra (review S2): on DOL and test the move "Look for a move that cancels a
  term" is nowhere in the document, in any element, not only in the disclosure's summary.
- Contract `toolHintPolicy` asserts:
  - the publisher import beside its call;
  - the standing publish;
  - the disclosure renders only without a publisher.

## "Also noted": a slope described in words

`hintLeakGuard.js slopeParaphrases` reads hints of the form "up/down/rise/fall/drop N … for every/per/each/run of M",
and only for a field whose label names a slope or a rate of change. It compares the signed value to the field's answer.
A match is a warning in the existing "Hints that give the answer" panel (`questionHintLeaks`). The hint is still shown.

**No false alarms on the content.** Across the 17 files it flags exactly one hint: L3 Q4 hint 1 (Activity 3.1), "From
(0, 5), line B′ goes down 3 for every 1 to the right." for "Slope of line B′ = −3". The test pins that list.

## Gate

| Check | Result |
| --- | --- |
Round 1 (on the merged head, after the review fixes):

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,784 / 11,784 pass |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail, 1 skipped (pre-existing) |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run lint`, `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline; **studentHome 847.2 KB gzip in 186 files** |
| Browser, plain Vite on 5199, one at a time | `hintsThatFit`, `assessmentLeakGates` (all surfaces), `toolPolicyGates`, `feedbackTeaches`, `afterLastMiss`, `composedOutcomePolicy`, `workViewHelpReach`, `readAloudTranslate`: all pass, 0 failures |
| Browser, teacher harness on 5188 | `teacherWorkflow/askMyTeacherJourneys`: 58 checks passed |
| Content sweep, base `3cb782a9` against the head | 11 verdict changes (above); none of the newly shown hints states an answer |

Before the review (at `dde646de`):

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,783 / 11,783 pass |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail, 1 skipped (pre-existing) |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run lint` | pass (no new warnings in the files I touched) |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline; **studentHome 847.2 KB gzip in 186 files** |
| Emulator suites | none touched: no rules, functions, persistence or stored shape |
| Browser, plain Vite on 5199, one at a time | `hintsThatFit` (new), `toolPolicyGates`, `assessmentLeakGates`, `feedbackTeaches`, `afterLastMiss`, `toolAttemptOutcome`, `composedOutcomePolicy`, `graphPointCheck`, `workViewHelpReach`, `readAloudTranslate`: all pass |
| Browser, teacher harness on 5188 | `teacherWorkflow/askMyTeacherJourneys`: 58 checks passed |
| First `assessmentLeakGates` run | one failure, caused by this branch: "practice composed-algebra: the algebra step still offers its strategic hint". The behaviour changed on purpose (TOOL-5). The case now asserts no disclosure on any role, the rung in the platform ladder on practice, and no hint on DOL or test. Whole driver re-run: 0 failures |

Mutation checks (each change made once, seen red, then restored).

**Round 1:**

- **Node: 14 of 14 red.**
  - B1: a substring quotation; prose counted as mathematics; the "/(" skip; an empty list fails open; an empty list
    always stated (which loses CW 2 and CW 4).
  - S1: the standing rung takes a place; it comes last; every rung is standing; the channel drops standing rungs; any
    object counts as standing; the solver's rung is not standing.
  - N4: the pointer shown with the hand up.
  - N3: the Spanish method word.
- **Browser: 2 of 2 red.**
  - S2: the method line rendered on every role turns DOL and test red.
  - S1: with the standing place removed, the family's first hint before any try goes red.
- Two round-1 assertions were first green under their mutation and were tightened, then seen red:
  - the "a 3" case: the whole-token rule alone caught it;
  - the Spanish pattern `sustitu`, which misses "sustitú".

**Round 2:** 3 of 3 red.

- R1: the glued minus read as subtraction.
- R2: the fallbacks dropped beside the standing rung.
- The pin: the standing rung moved inside the 6 cap.

**First version:**

- **Node: 21 of 21 red.**
  - Quotations: none allowed; any point allowed; a bare number treated as an expression.
  - Number reading: non-number answers excepted; a numerator over a variable read as the number; the sign ignored.
  - Slope paraphrase: the sign ignored; any field label accepted.
  - Ladder: table cells not read; no systems fallback; repeats shown; the prompt not treated as visible text.
  - Pre-Flight: DOL hints listed; shown hints listed; the paraphrase not warned; the model drops `hiddenHints`.
  - HintPanel pointer: shown without Ask; shown on a mixed ladder.
  - Solver: the strategic hint not published; the disclosure kept beside the ladder.
  - Spanish: a fallback entry removed.
- **Browser: 6 of 6 red.**
  - `hintsThatFit`: the old guard; no pointer; the general fallback everywhere; hints on a DOL.
  - `toolPolicyGates` and `assessmentLeakGates` composed-algebra: the solver disclosure kept and the rung not
    published (red in each).

## Deploy targets

**Hosting only.** No file under `functions/`, no rules, no indexes.

```bash
node scripts/release-firebase.mjs            # the plan
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

## Decisions for the owner

1. **The hidden-hint panel is advisory.** It follows the pattern of the panels beside it, because a readiness warning
   would demote the L2 and L3 lessons to "Needs Review". Moving it into `diagnosticGroups` is one line.
2. **The table's cells are now answers.** This hides L2 CW 9's harmless first hint along with the leaky third one. The
   item now falls back to the general rungs until the author rewords it ("multiply each output by the factor in the
   question"). Keeping the old behaviour would mean showing a hint that fills two cells.
3. **The 28 hints still hidden** are the author's to reword. The guard does not try to tell "stretches by 2" in a
   general rule from "stretches by 2" as an answer. The L2 Practice rule hint (PR 1–6) is the biggest group: 6 items.
4. **Ladder order and the 6-rung cap (TOOL-5).**
   - A registry tool's rungs come after the authored and family hints, and the ladder keeps 6.
   - One more rung opens per try, so on a 3-try item only the first 3 can ever open. On L2 PR 1 (2 authored + 4 family)
     the Transformations Lab's own rungs never reach the ladder. That is B4's order and I did not change it.
   - The one exception is the step solver's strategic hint. It is a **standing** rung: first, open from the start, and
     taking no other rung's place, because it was open from the start before it joined the ladder (review S1).
   - If other tool rungs should also be standing while their tool is on screen, a tool marks a rung
     `{ text, standing: true }` when it publishes it. Doing that for many rungs would reopen HELP-10 (a ladder tapped
     through with no try), so it is a per-rung decision.
5. **The Spanish** for the 19 new sentences needs the same review by a Spanish-speaking teacher as the rest of
   `esSupport.js`.

## Touched outside my scope

- `src/StepByStepAlgebraCore.jsx`: the strategic hint block only (TOOL-5).
- `src/tools/shared/toolHintChannel.js`: standing rungs (S1).
- `src/components/teacher/LessonPreflightModal.jsx`: one new panel.
- `src/platform/language/packs/esSupport.js`: 19 entries in `genericHints`. W6-1 may also add entries here; keep both
  sides.
- `tests/browser/assessmentLeakGates.mjs`:
  - the pointer and every fallback added to `LADDER_WORDS`;
  - the composed-algebra case rewritten for TOOL-5 (see the gate table), and on DOL and test it now also asserts the
    method line is nowhere in the document (review S2; the gap was on the base too).
- `.github/workflows/student-runtime-browser-gates.yml`: a `hintsThatFit` step after `toolPolicyGates`, and its path.
- Source contracts rewritten per the playbook (the behaviour was intact; the text had moved into `strategicHint`):
  - `toolHintPolicy`: two cases;
  - `stepAlgebraEntryUx`: the region's end anchor.

## Noted by the review, not changed

- N1, gaps in the base guard's value reading: 0.5 vs 1/2, "4 / 3", a sign after ")", "4/2" vs 2. These are not
  regressions; this branch only refines the shared guard where it already matched.
- N7: 22 of the reviewer's 8,939 bank intents do not compile. My own sweep counts 66 of 10,773 documents across
  `drafts/` and the seed banks.

## Not done

- W5-4's "Which way is each point off?" graph check stays as it is. It is a check recorded like a hint, not a ladder.
- The family-generated and tool-written hints were not audited for paraphrases. Only teacher hints are in Pre-Flight.
- `diagnosisHint` keeps the plain text guard. Its messages are fixed text, and the stricter rule is safe there.
