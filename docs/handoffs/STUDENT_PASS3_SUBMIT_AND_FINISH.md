# Student pass 3, Batch 5 (session B): the button that spends a try, and how a question ends

Branch `claude/pass3-b5-submit-and-finish`, from `claude/modest-pasteur-xzagn7` at `a7dddc7`. IDs are the
[report](../qa/student-experience-pass-3.md)'s summary-table IDs (RUN-4, RUN-11, RUN-12, RUN-13, RUN-16 and the
"Inside an assignment" polish). The detail file [02-assignment-runtime.md](../qa/student-experience-pass-3/02-assignment-runtime.md)
numbers the same findings RUN-5/6, RUN-14, RUN-15/16, RUN-17, RUN-19, RUN-21, RUN-23 and RUN-12 ("Focus and Enter").
Decision D9 (one student word list) applies to every string added or changed here.

Nothing here re-grades, writes to production or deploys. No Cloud Function, Firestore rule, index or stored shape
changes: this is browser code only.

## What changed, item by item

### RUN-4 — the button that spends a try (D9)

| What a student saw | What changed | Proof |
| --- | --- | --- |
| "Submit Answer", then "Submit Another Attempt"; "Submit Solved Equation", "Submit Intercepts"; in tools "Check construction", "Check my sort", "Submit my regression"… — all spending a try, while "Check this stage" was free. Nothing said what a press cost. | One verb, **Submit**, with its cost: "Submit — uses 1 of 3 tries", "Submit — uses 1 of 2 tries left", **"Submit — last try"**, "Submit — your only try"; plain "Submit" where tries never run out (Live Challenge). The rules are one pure module, `src/platform/student/submitCost.js`. The action bar shows "Submit" over its cost on two short lines (`SubmitCost.css`): a phone shows "1 of 3" / "last try" / "only try" under the verb — each part of the accessible name (label in name) and narrow enough for the one-row bar at 320px. While a submit is in flight: "Submitting…" (never "Checking…"). | `submitAndFinish` (every activity policy × literal and choice items; teacher-granted DOL tries; Live Challenge; the rendered action bar through Vite SSR); browser `workBarPrimaryLabel` (320, 344, 390, 1366; DejaVu stress font) and `submitAndFinishJourneys` |
| The last try looked like any other. | The last try is its own state: the button turns amber (`--mm-warning-bg` / `--mm-warning-text`, a #f9ab00 border) and says "last try"; the tries strip reads "Last try · 1 of 3 left" with a heavier border; the miss says "Not quite. You have 1 try left — your last one." | `submitAndFinish`; `submitAndFinishJourneys` (amber, not the blue of every other Submit, at both sizes); screenshots `chromebook-last-try.png`, `phone-last-try.png` |
| A one-try item (multiple choice in a 3-try section, every DOL, quiz and test item) said nothing before the try was spent. | The button says "Submit — your only try" before the press, and the strip "One try on this question". Batch 4's notice for choice-only items (`oneTryNotice`) is kept and not duplicated — the rendered test counts it once. | `submitAndFinish` ("a choice item in a 3-try section", DOL/quiz/test) |
| Registry tools named their own final action. | `ToolRuntimeContext` carries `submitCost`; `useSubmitLabel(own)` returns "Submit — <cost>" when it is set, and a new `<SubmitText>` does the same for a JSX label. QuestionEngine sets the cost **only** for a standalone registry tool, whose final action records an attempt. A composed question's stage and the relation solver's stage get no cost and keep their free "Check …". 63 final buttons in 25 tool files now go through it (one-line label changes; the 9 that already used `useSubmitLabel` needed none). The Work View rail's copy of a tool's final action (`primaryActions`) is relabelled the same way in `EnlargeableFigure` (`relabelToolPrimaryActions`); an action that records nothing opts out with `spendsTry: false` (Linear Intercepts' stage check). "Check this stage", "Check my combination", the board's card checks and every other free check keep "Check". The board's "Submit anyway" confirmation keeps its own words. | `submitAndFinish` (the hook rendered through Vite SSR; the rail; the sweep of the 25 files; composed and solver providers carry no cost) |
| Secure tests: "1 of 1 try left" over a free "Save answer". | `RichQuestionRuntime` passes `showTriesCount={!navigationMode}`; the strip then shows only what is not a count (a lock, "Response submitted"). The host's words ("Save answer", "Record answer") still win over Submit. | `submitAndFinish` (rendered, incl. a paused test still saying so) |
| The outcome said "You have 2 attempts remaining on this version"; the closed sentence "That was the final allowed attempt (3 total). This response is locked." | "Not quite. You have 2 tries left." · "That was your last try (3 in all). Your answer is locked." · "That was your only try. Your answer is locked." | `submitAndFinish`, `feedbackThatTeaches`, browser `toolAttemptOutcome`, `feedbackTeaches`, `afterLastMiss`, `warmupReopenJourneys` |

### RUN-11 — the save line says what was saved

| What a student saw | What changed | Proof |
| --- | --- | --- |
| Moving between questions showed "Syncing · 1 change saved on this device…" and then "Recorded by MathMaster." beside an answer never submitted. | The line knows its **subject** (`saveStatusModel.js`: `nextSaveSubject`, `describeRuntimeSaveLine`). It is "answer" from the moment the student submits (App wraps `onGrade` / `onStepGrade` to say so) until the queue next drains with nothing owed; "draft" otherwise. Draft: "Saving your draft…", "Draft saved on this device. You may keep working.", "Draft saved." Answer: "Saving your answer…", "Answer saved on this device · sending it to MathMaster. You may keep working.", **"Answer recorded by MathMaster."** — reachable only from a drain that left nothing owed after an answer was sent. An answer the device could not store, or that was refused, is never called recorded. Offline and "needs review" name answers and items in the student's words. | `submitAndFinish` (state sequences, incl. the two cases the mutation checks found missing); `submitAndFinishJourneys` |
| The line was a live region, a second announcement of every result. | It is announced only when the student must act: offline, needs review, refused, not stored. | `submitAndFinish` |

**Batch 3 merges beside this cleanly.** The "volatile" case is not described by the model (`null`) and App keeps the
existing chain's last two branches (`'rejected'`, then the volatile sentence) untouched, so Batch 3's rewrite of that
last line lands without a conflict. On that branch the volatile line reads "Not saved · this device could not store your
last change…"; this branch did not touch it. The new subject state sits after `drainStudentOutbox`, away from Batch 3's
hunks.

### RUN-12 — finishing lands on the summary; a skipped question is a way back

| What a student saw | What changed | Proof |
| --- | --- | --- |
| The last button read "Continue to <next lesson> →" and opened the next lesson: this lesson's results were never seen. | `resolveAssignmentHandoff` hands off to the next section with work, else **this assignment's results page** ("Continue to your results →"). Up next is the results page's own second action (StudentAssignmentResult already shows it); the hand-off no longer computes it. | `submitAndFinish`, rewritten `studentAssignmentHandoff`; `submitAndFinishJourneys` lands on the results page at both sizes (`*-results.png`) |
| A section that ended on a miss had no complete card. | The completion card shows at any accuracy, after the closed card's worked solution. | `submitAndFinish` (rendered: expired + section complete); `submitAndFinishJourneys` |
| A skipped earlier question left no Next, no Continue, no Enter. | `resolveSkippedQuestion` (pure): when nothing workable lies ahead and the section is not done, the earliest question still to do — this section's first — as **"Go back to Practice Q1 (not answered)"** ("not finished" when it has tries spent). It is the bar's action ("← Back to Q1" on a phone), a card where Next would be, and the Enter shortcut. The DOL is called "Exit ticket (DOL)" there. | `submitAndFinish`; `submitAndFinishJourneys` (`phone-skipped.png`) |

### RUN-13 — "Start this question fresh" on a closed question

`QuestionModuleBoundary` tells the engine when the module failed (`onFailureChange`); the work area's disabled/inert gate
is one value, `workAreaClosed`, which lifts only while the module's failure panel is all that is there. So the button
can be pressed on a closed question — the lmr-wu-1 case it was built for. It now asks first, as Reset does ("Start this
question fresh?… Your recorded tries and grade history do not change"), and never touches the attempt record (asserted).
Proof: `submitAndFinish` (the boundary driven directly; the engine's gate and confirmation), `accessibleDialog` (rewritten).

### RUN-16 — program words inside the question (the engine's; session A has the chrome's)

- The scaffold's screen-reader name "Productive struggle scaffold" → "Let's back up", the heading it shows.
- "Details for your teacher: <type> — <error.message>" (module failure) → no raw error; a "Copy details for your
  teacher" button copies the scrubbed device diagnostic, as the other recovery panels do. The unsupported-type panel no
  longer prints its type (kept in a `data-question-type` attribute for support).
- "Complete Each Part" over a single box → "Your answer" (more than one box keeps "Complete Each Part").
- "on this version" — gone from the engine (see RUN-4's outcome sentence).

### Polish

- **One live region per result.** The tries strip, the Correct watermark (now `aria-hidden`), the closed verdict chip and
  the section completion card are no longer live regions; "<Section> complete." is said inside the result's own region
  (outcome, closed card or held-feedback note). Batch 1's tool outcome slot is untouched. Proof: `submitAndFinish`
  (rendered: one `role="status"` on a final miss), `submitAndFinishJourneys` (one non-empty region in the real App).
- **The keypad closes with the question.** `MathInput` hides its tools when the question is terminal
  (`QuestionLifecycleContext`); "Practise one like this" beside a closed question gets `terminal={false}`, so its boxes
  keep theirs. Proof: `submitAndFinish` (rendered MathInput both ways), `submitAndFinishJourneys`.
- **Focus and Enter after a correct or final answer.** One rule for the way on (`closedQuestionWayOn`: Continue, Next or
  the way back) drives the bar, the cards and Enter. Enter is live on every locked question with a way on — not only
  after a correct answer — and never takes a press meant for another control (Request New Question, a practice box,
  Read aloud). When a submit closes the question, focus moves to the closed card (after a final miss with its review)
  or to Next / Continue, two frames later so the lock's own focus return does not cancel it; a press, a key or focus
  the student moved elsewhere wins. Proof: `submitAndFinish`, `submitAndFinishJourneys` (focus on the card; Enter to
  Q2 at both sizes), `workViewTerminalTransition`.

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

Each pinned a spelling of behaviour that still holds; each now asserts the behaviour and was mutation-checked.

| Test | Pinned | Now |
| --- | --- | --- |
| `accessibleDialog` | `aria-label="Productive struggle scaffold"`; `inert={locked \|\| scaffoldRequired` | the region named "Let's back up"; the inert gate is `workAreaClosed` and includes the scaffold |
| `attemptFeedbackAnnounced` | the template `Not quite. You have ${remainingAttempts}` | the outcome reads `missOutcomeText(remainingAttempts)` |
| `attemptResultsInWorkArea`, `closedQuestionReview` | region start `<section className="mathmaster-closed-question-card"` | `className="mathmaster-closed-question-card"` (the card gained a ref and tabIndex); the completion card's focus marker is now conditional |
| `closedVerdictChipPlacement` | the chip's `aria-label` and `role="status"` | the chip by its class; it is **not** a live region (one announcement per result) |
| `enterContract`, `secureRichToolRuntimeWiring` | `<button ref={submitButtonRef}`; `className="mathmaster-bar-submit"` | the same button, now multi-line JSX with a computed class |
| `feedbackThatTeaches` | "final allowed attempt (3 total)…" | "That was your last try (3 in all). Your answer is locked. The worked solution is below." |
| `gradeDocumentAuthority` | (region overlap) | the save-subject state moved after `drainStudentOutbox`, out of the dispatcher's region |
| `mathInputToolsToggle` | `toolsVisible = isMobile ? …` | the same rule, with the question's terminal state in front |
| `representationBridgeOutcomePolicy`, `systemsInterpretationOutcomePolicy` | an import line naming one symbol | the import includes `useToolRuntimeContext` |
| `studentAssignmentHandoff` | "hand off to Up next" | the results page, Up next riding along (decision adopted for RUN-12) |
| `studentJourneyDol2Final` | "Submit Intercepts" before "Submit Solved Equation" | the label names no route at all (`submitActionLabel`); the inert region by `workAreaClosed` |
| `studentQuestionLegibility`, `studentWorkspaceVisibility` | `tries'} left`; the old `barContinueAction` ternary | `triesLeftText(...)`; `closedQuestionWayOn` with the same labels |
| `studentTodayAppWiring` | `import { describeSaveStatus }` alone | any import list naming `describeSaveStatus` |
| `systemsWorkspace3x3Mode` | `>Check my work</button>` | `<SubmitText>Check my work</SubmitText>` |
| `workBarPrimaryLabel` | `{ label: 'Next question →', … }` | `{ kind: 'next', label: 'Next question →', … }`, plus the way back's phone words |
| `workViewTerminalLifecycle` | the first `<QuestionLifecycleProvider` | the question's `terminal={locked}` provider; the only other is the practice's `terminal={false}` |
| `transformationsLabSharedGrading` (tools) | `>Check defining feature</button>` | the same label, bare or inside `<SubmitText>` |

Browser drivers updated for the new words (behaviour unchanged): `toolAttemptOutcome`, `feedbackTeaches`,
`assessmentLeakGates`, `toolPolicyGates`, `unansweredChoiceGates`, `closedVerdictChip` (one-box heading "Your answer";
the verdict announced once), `workBarPrimaryLabel` (two-line Submit; label-in-name), `systemsWorkspaceStudio`,
`phoneToolPanelReach`, `linearMultipleRepresentations`, `lmrProcessMode`, `studentUxPlatform`,
`regressionCalculatorPhone`, `algebraicSystems3x3`, the five `toolKeyboard*` drivers, `captureToolResponses`,
`relationPlotGrading`, `fractionTemplateGrading`, `stepAlgebraStructureTools`, `warmupReopenDraft`,
`teacherWorkflow/warmupReopenJourneys`, `teacherWorkflow/draftCrossDeviceJourneys`. And `workViewTerminalTransition`:
"focus in Work View" now means an **open** Work View (the host element also wraps the question in the page, and focus
now deliberately moves to Next or the closed card), plus a check that focus is on a visible control; its expired step
waited for "response is closed after", a sentence Batch 1 replaced — it was not in the base commit either
(`git grep` on `a7dddc7`), so that step failed on the base too.

## Merged with the updated base (after the first push)

At the launching session's request, `origin/claude/modest-pasteur-xzagn7` (6accda1, including 8e51f65: Batch 4's hint
ladder, the fix for Ask my teacher's "Maximum update depth exceeded" loop, and the workViewTerminalTransition wait) was
merged into this branch (merge commit `578cc84`). Conflicts, each resolved keeping both sides: `ToolRuntimeContext.jsx`
(`publishHints` and `submitCost`), the imports of `ConstraintFunctionBuilder.jsx` and `FunctionInvestigation2.jsx`
(`useOwnHintLadder` and `SubmitText`), QuestionEngine's constants (`HINT_OFFER_BUTTON_STYLE` beside `VISUALLY_HIDDEN` and
`WAY_ON_SELECTOR`), `toolPolicyGates.mjs` (the ladder checks and the Submit-named mapping action), and
`workViewTerminalTransition.mjs` (the base's wait for the closed sentence). The gate was rerun on the merged tree:

| Check (merged tree) | Result |
| --- | --- |
| `test:platform` | 11,444 / 11,444 |
| `tests/tools` | 1,643 pass, 0 fail |
| lint, build, build:firebase | pass; no tracked file rewritten |
| `certify:accessibility`, `certify:dark-mode` | both pass |
| The 43 student / tool browser drivers listed below | all pass except **hostAccessibility**, which times out loading `?scene=recovery` ("networkidle" never reached). It fails identically on the base alone (6accda1 served from its own worktree), so it came in with the base — likely Batch 4's Recovery changes — not with this merge |
| Teacher-harness journeys + `submitAndFinishJourneys` | 15 of 16 pass. The Recovery, focus-race and Warm-Up journeys that tripped on the update-depth loop before now pass. **enduranceJourneys** still stops at a "Back to Dashboard" button that does not exist on the base either (checked on 6accda1 too) |

The gate table below is from before the merge (base `a7dddc7`), kept for the record.

## Merging beside the parallel branches

Checked with `git merge-tree` (nothing written):

- **Batch 3 persistence** (`claude/pass3-b3-persistence-client`): merges with **no conflict**, the volatile save line
  included.
- **Batch 4 hints**: now merged through the base (above). Before that, on the older base `37ec6ce`, it conflicted with this branch's base already
  (QuestionEngine, SectionRecoveryRunner, Pre-Flight, HintPanel). This branch adds four small ones, each "both sides
  added": `ToolRuntimeContext.jsx` (hints adds `publishHints`, this adds `submitCost` — keep both fields, both provider
  props and both hooks); the import lines of `ConstraintFunctionBuilder.jsx` and `FunctionInvestigation2.jsx` (keep
  `useOwnHintLadder` from hints **and** `SubmitText` from here); `tests/browser/toolPolicyGates.mjs` (keep hints' new
  checks and this branch's `/^Submit — /` names).

## Mutation checks

Every new assertion and every rewritten contract was broken once against the code
(a scratchpad script: one mutation per behaviour, the named test run after each, the code restored), 64 scripted and
one by hand, plus one on the rewritten tools contract. Final run against the pushed code: **63 of the 64 scripted mutations red**, the by-hand and tools ones red too; the one green is explained below. Along the way two
first stayed green and found missing cases, now covered: an answer sent while the line still reads the last drain's
"durable" is not recorded by it; a skipped question in this section comes before an earlier section's. One scripted
mutation (swapping the closed card's option reasons and its worked solution) stays green because no contract asserts
that order — it is not one this batch changed; the order the rewritten contract does protect (verdict, your answer,
the solution) was mutated by hand and goes red. The browser drivers caught two real defects during the work, both fixed: "1 of 3 tries" under Submit
overflowed the phone bar at 320/344px in a wide font, and a shorter "3 left" was not part of the accessible name.

## Gate

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | ok |
| `npm run test:platform` | **11,424 / 11,424** (base `a7dddc7`: 11,406 / 11,406). The first run on this branch had 26 failures, all contracts pinned to old spellings; each rewritten above |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail (1,644 tests) — one contract rewritten (`transformationsLabSharedGrading`, below) |
| `npm run lint` | exit 0 (warnings only; those on touched files are pre-existing per `git blame`) |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `npm run test:authoring-v5`, `npm run test:rules` | not run: no authoring, compiler or rules change |
| `npm run certify:accessibility` | passed — 11 screens × 2 viewports, 0 rules / 0 nodes, no new or increased violations |
| `npm run certify:dark-mode` | passed — 192 surfaces, light and dark |
| Student runtime browser gates (`student-runtime-browser-gates.yml` and the student/tool drivers of the other workflows, one at a time on a quiet harness) | all pass: mathEntryContract, renderStability, errorRecovery, duplicateTabs, graphPointCheck, phoneToolPanelReach, undoTyping, composedOutcomePolicy, toolPolicyGates, relationPlotGrading, toolAttemptOutcome, assessmentLeakGates, systemsWorkspaceStudio, clickMapLetterbox, stagedQuestion, unansweredChoiceGates, graphKeyboardRoute, composedDraftRestore, draftEditTime, fractionTemplateGrading, studentUxPlatform, feedbackTeaches, closedVerdictChip, dolCloseCopy, unchangedConfirmWorkView, afterLastMiss, workBarPrimaryLabel, workViewTerminalTransition, linearMultipleRepresentations, lmrProcessMode, regressionCalculatorPhone, algebraicSystems3x3, the five toolKeyboard drivers, captureToolResponses (dataModelingLab, regressionCalculator), hostAccessibility, studentAccessibleNames, warmupReopenDraft (both modes) |
| New: `tests/browser/teacherWorkflow/submitAndFinishJourneys.mjs` (real App, 1366×768 and 390×844) | all checks pass |
| Teacher-harness journeys (`student-teacher-journeys.yml`, one at a time) | pass: journeys, appUrl, draftCrossDevice, prerequisiteEarly, supportEvidence, walkthrough, caseReview, districtId, privateControls, askMyTeacher. **Fail on the base commit too, identically:** recoveryDraftCrossDevice (12), recoveryHold (24), restoredDraftFocusRace (1) and warmupReopen (26) — every failure is the "no page errors" check tripping on React's "Maximum update depth exceeded", with the same counts on `a7dddc7` served from a separate worktree; every behaviour check in them passes here. enduranceJourneys stops at a "Back to Dashboard" button that does not exist on the base either. Not investigated (outside this batch). |

## Deploying (not done)

```bash
node scripts/release-firebase.mjs --since a7dddc7   # plan only (run here): hosting
node scripts/release-firebase.mjs --execute         # deploy (asks for the project id)
```

The plan for this branch alone is one step, `hosting` (`npm run deploy:hosting`, the resilient wrapper). **No
functions, rules or indexes change**; `functions/shared/attemptPolicy.mjs` was deliberately not touched (the labels
live in the browser module `submitCost.js`). Never a raw `firebase deploy --only hosting…`.

## Decisions for the owner

1. **The first-try label says the total** ("uses 1 of 3 tries"); after a miss it counts what is left ("uses 1 of 2
   tries left"). The phone shows "1 of 3" / "1 of 2" under Submit. Say if you would rather always count what is left.
2. **A secure test keeps its host words.** "Save answer" (navigation mode, free) and "Record answer" are the host's;
   D9's "Submit always spends a try" holds because neither is called Submit. Corrections' field items keep "Check my
   answer" (RichQuestionRuntime's own button, outside this batch's tool sweep) — it does spend a try; renaming it is a
   one-line follow-up if you want it in the word list now.
3. **"Draft saved." after moving between questions.** The navigation save is the student's time on the question, not
   their typed work; it is called a draft. If you want no line at all for navigation (the prior R-5 "draft silence"),
   that is a one-line change in `describeRuntimeSaveLine`.
4. **"Go back" picks this section's earliest open question**, else the earliest anywhere. Questions in later sections
   are never "behind" and are reached by Next as before.
5. **Enter on a closed question with a way on** now continues — after a final miss too. A student reading the worked
   solution with focus on the closed card presses Enter to go on; Tab still walks through the solution first.

## Not done

- Five tool step texts still say "Press Check equation" / "press Check" next to a button that now says Submit
  (`RewriteLinearForm`, `StepAlgebra2`, the Sign Solution Analyzer's review lines, one Transformations step). They are
  sessions D/E's files beyond the label; the platform-wide string pass should take them.
- Up next did not appear on the harness's results page because the synthetic school has nothing up next for this
  student; the page's own Up next rule (session C) is unchanged.
- The harness's ordered-pair fixture (`questions=real`, Practice Q2, key `'(2,3)'`) grades a typed "(2,3)" as wrong in
  the real App. Not investigated (outside this batch, and the journey closes questions by using up tries); worth a look
  in case it is the grader and not the fixture's shape.
- A real screen-reader pass of the single live region and the new focus moves.
- `submitAndFinishJourneys` is not in a CI workflow yet (the student-teacher journeys workflow is the natural home).
