# Student pass 3, wave 6 (W6-3): hints that fit

Branch `claude/pass3-hints-that-fit`, from `claude/modest-pasteur-xzagn7` at `5062cba5`. IDs come from
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
  - Numbers are read **by value**:
    - "12", "1/2", "2.5" and "−2" do not write 2;
    - "3/1" writes 3;
    - "x/2" writes 2;
    - "−1/n" (a numerator over a variable) does not write −1;
    - a minus after an operand is subtraction, so "x − 2" writes 2.
  - **Never excepted:**
    - a point, an expression, an equation or a word answer;
    - a number stated on its own: "the slope is 3", "multiply by −2", "= −8/5";
    - a coefficient the problem does not show: "7 = −2(−2) + b" names the slope −2.
  - When unsure, the value counts (fail closed).
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

**Every hint whose verdict changed** (probe over the 17 files; unit test `hintsThatFit` pins the exact lists):

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
  grade (eliminate, substitute, reciprocal, slope, inverse, row operation, stretch, intercept…) and that none carries a
  number.
- When every rung is a fallback, the Hint panel says **"These hints are general, not written for this question. For
  help with this one, ask your teacher with the button below."** It appears only when Ask is wired, so it never points
  at a button that is not there.
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
- It is released one try at a time, read through the leak guard, counted with the other hints (`hintsRevealed` and
  `recordHintUse`), and shown as read in Work View Help, which is the same panel.
- It follows the equation on screen.
- The disclosure is rendered only where there is no platform ladder (the tools lab, a server-graded host), exactly as
  registry tools do.
- Nothing changes on a DOL, quiz or test: the rung exists only where hints are allowed.

The ladder's order is still B4's: authored, then family, then tool. On the policy fixture (2x + 3 = 11) the family's
second rung already says "subtract 3 from both sides", so the solver's rung comes fifth. See the owner decisions.

**Proof.** Browser `toolPolicyGates` (practice): no "Need a strategic hint?", the hint is not on screen before it is
asked for, and the ladder's sources end in `tool`. On DOL and test there is still no strategic hint. Contract
`toolHintPolicy` asserts the publisher import beside its call, the publish effect, and that the disclosure renders only
without a publisher.

## "Also noted": a slope described in words

`hintLeakGuard.js slopeParaphrases` reads hints of the form "up/down/rise/fall/drop N … for every/per/each/run of M",
and only for a field whose label names a slope or a rate of change. It compares the signed value to the field's answer.
A match is a warning in the existing "Hints that give the answer" panel (`questionHintLeaks`). The hint is still shown.

**No false alarms on the content.** Across the 17 files it flags exactly one hint: L3 Q4 hint 1 (Activity 3.1), "From
(0, 5), line B′ goes down 3 for every 1 to the right." for "Slope of line B′ = −3". The test pins that list.

## Gate

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,783 / 11,783 pass |
| `node --test tests/tools/*.test.mjs` | 1,709 pass, 0 fail, 1 skipped (pre-existing) |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run lint` | pass (no new warnings in the files I touched) |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | within baseline; **studentHome 847.2 KB gzip in 186 files** |
| Emulator suites | none touched: no rules, functions, persistence or stored shape |
| BROWSER_RESULTS |

Mutation checks (each change made once, seen red, then restored):

- **Node: 21 of 21 red.**
  - Quotations: none allowed; any point allowed; a bare number treated as an expression.
  - Number reading: non-number answers excepted; a numerator over a variable read as the number; the sign ignored.
  - Slope paraphrase: the sign ignored; any field label accepted.
  - Ladder: table cells not read; no systems fallback; repeats shown; the prompt not treated as visible text.
  - Pre-Flight: DOL hints listed; shown hints listed; the paraphrase not warned; the model drops `hiddenHints`.
  - HintPanel pointer: shown without Ask; shown on a mixed ladder.
  - Solver: the strategic hint not published; the disclosure kept beside the ladder.
  - Spanish: a fallback entry removed.
- **Browser: 5 of 5 red.**
  - `hintsThatFit`: the old guard; no pointer; the general fallback everywhere; hints on a DOL.
  - `toolPolicyGates`: the solver disclosure kept and the rung not published.

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
4. **Ladder order and the 6-rung cap (TOOL-5).** A tool's rungs come after the authored and family hints, and the
   ladder keeps 6. One more rung opens per try, so on a 3-try item only the first 3 can ever open. On L2 PR 1 (2
   authored + 4 family) the Transformations Lab's own rungs never reach the ladder, and the solver's strategic hint is
   rung 5 on a family item. That is B4's order and I did not change it. If tool rungs should come first while a tool is
   on screen, the change is one line in `questionHintAudit`.
5. **The Spanish** for the 19 new sentences needs the same review by a Spanish-speaking teacher as the rest of
   `esSupport.js`.

## Touched outside my scope

- `src/StepByStepAlgebraCore.jsx`: the strategic hint block only (TOOL-5).
- `src/components/teacher/LessonPreflightModal.jsx`: one new panel.
- `src/platform/language/packs/esSupport.js`: 19 entries in `genericHints`. W6-1 may also add entries here; keep both
  sides.
- `tests/browser/assessmentLeakGates.mjs`: the pointer and every fallback added to `LADDER_WORDS`.
- `.github/workflows/student-runtime-browser-gates.yml`: a `hintsThatFit` step after `toolPolicyGates`, and its path.
- Source contracts rewritten per the playbook (the behaviour was intact; the text had moved into `strategicHint`):
  - `toolHintPolicy`: two cases;
  - `stepAlgebraEntryUx`: the region's end anchor.

## Not done

- W5-4's "Which way is each point off?" graph check stays as it is. It is a check recorded like a hint, not a ladder.
- The family-generated and tool-written hints were not audited for paraphrases. Only teacher hints are in Pre-Flight.
- `diagnosisHint` keeps the plain text guard. Its messages are fixed text, and the stricter rule is safe there.
