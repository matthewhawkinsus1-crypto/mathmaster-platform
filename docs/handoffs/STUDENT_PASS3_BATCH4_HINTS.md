# Student pass 3 — Batch 4, the hint system ("learn from the mistake")

Branch `claude/pass3-b4-hints`, on `claude/modest-pasteur-xzagn7` at `37ec6ce` (Batches 1 and 2). IDs are from
[03-help-and-self-correction.md](../qa/student-experience-pass-3/03-help-and-self-correction.md); the decisions (D2, D5)
were adopted on 2026-10-16. Nothing here re-grades anything, writes to production or deploys.

Out of scope, and not touched, because other sessions own it: the closed card and anything under the worked solution,
Review My Work, choice items, Test Cycle corrections, the Recovery "N of N tries left" line, Ask my teacher (the button
and status line in HintPanel), and Batch 3 persistence (`questionDraftStorage`, App.jsx save paths).

## What changed

| ID | What a student saw | What changed |
| --- | --- | --- |
| HELP-2 / D2 | While a question was open, a sign slip got only "Not quite… Focus on: Slope". The specific message waited until the item locked. | After a miss, the Hint panel offers **"What might have gone wrong?"**. On request it shows the diagnosis the open box holds back: the generic checks run as if the item had closed, plus the classifiers. It is recorded as hint use (`recordHintUse`). It exists only where the hint ladder does (`hintControlAllowed`: never a DOL, quiz, test or server-graded host) and only while outcome feedback for the item is open. It goes through the leak guard and is not offered when the box already shows the same words (`questionHints.js diagnosisHint`). It stays available through editing until the next submit. The open box itself is unchanged: it still names no move (QA M1). |
| HELP-2 (Pre-Flight) | — | A Practice item with no `attemptFeedback` gets a warning in its own Pre-Flight panel, "Feedback while students can still fix it" (`attemptFeedbackPreflight.js`, `LessonPreflightModal.jsx`). See the readiness decision below. |
| HELP-9 | "Try a similar one" existed only inside the Hint panel. | After a miss, **"See a similar problem worked"** appears beside "Show a hint" in three places: the miss box, "Your last try", and a tool's in-tool outcome (`onShowSimilar`). It opens the same worked sibling (`openSimilarExample`, which now also opens the panel) and is recorded as a worked example. When the tool outcome offers both, it shows the two buttons without the lead-in sentence; with the sentence the box no longer fitted a 390×844 phone. |
| HELP-10 | Registry tools had a second ladder, "Stuck? Show a hint", that could be tapped through to the end with no attempt, plus a third copy in Work View. Graphing 2's last rung said "Plot (0, 3) and (2, 3)". | A tool's `HintPanel` now **publishes** its rungs (`toolHintChannel.js`, `ToolRuntimeContext.publishHints`). QuestionEngine adds them to its own ladder in the order authored → family → tool, so the release rule (one more per attempt) and the leak guard apply to them. The tool then renders no ladder of its own, and the Work View Help copies step aside, so the platform panel becomes the Help (`useOwnHintLadder`, `RegisteredToolWorkView`). A hint already read stays exactly as it was read; the next one is the first unread rung of the *current* ladder (`hintLadderView`, for tools whose rungs change with the stage). Rungs that named the answer were rewritten: Graphing 2 (every mode), Function Investigation 2 (hidden h, k and a, the intercept count, "the answer is none"), Systems linear mode ("they differ/are equal"), Step Algebra 2 (the intermediate equation), and the Exponential/Log composition rungs. A subagent audited every call site; the borderline cases are listed below. Where there is no platform ladder (the tools lab, server-graded hosts) a tool keeps its own panel. |
| HELP-17 / D5 | "Using one is noted with your attempt", "Recorded for your teacher", "Recorded for your teacher, like a hint". | One sentence, in `hintCopy.js`: **"Hints never lower your score. Your teacher can see you used one."** It appears in the Hint panel, the first-hint offer, the tools-lab tool panel, the graph's "Check my points" ("This counts as a hint. …") and Step Algebra's "Need a strategic hint?". On Classwork and Practice, before the first try, hint 1 is **offered in words** under the work ("💡 A hint is ready if you want one. … [Show a hint]"). It is only offered, never revealed, so nothing is recorded until the student asks. |
| HELP-4 | In Recovery practice a hint silently stopped the item counting, and the screen still said "Correct! Nice work." | Every hint offer in Recovery practice says **"Hints help you learn, but this question then won't count toward unlocking."** (`hintCostNote` prop: SectionRecoveryRunner → QuestionEngine → Hint panel, first-hint offer, graph check, solver). The meter carries its rule: "Get 7 of your last 8 practice questions right to unlock it. A question counts only when you answer it without a hint or a worked example." A correct answer given with help says "Correct! You used help on this one, so it does not count toward unlocking." This uses the server's own `attemptWasIndependent` (`recoveryPracticeCopy.js`). |

## A decision made here that you may want to revisit

**The Pre-Flight warning is advisory.** Any readiness warning turns an assignment "Needs Review"
(`assignmentAuthoringState.js`), and that also takes it out of the normal Assignment Library. The pass-3 sample found
0 of 310 real items with attempt feedback, so a readiness warning would have demoted almost every assignment with a
Practice section the next time it was saved. The warning therefore has its own Pre-Flight panel and is not one of the
readiness diagnostics; a test pins that it stays out of `diagnosticGroups`. If you want it to count toward readiness,
move it into `diagnosticGroups`, which is one line in `assignmentV5PreflightModel.js`.

## Borderline rungs left as they are (the audit's list)

- Graphing 2 point-slope: "use a run of R and a rise of S" (the step, not the point). Graphing 2 now only restates the
  given point.
- Step Algebra 2: "subtracting 5 from both sides" names the first move of a step tool.
- Data Modeling square-root fit: rung 3 maps h and k to table values.
- Inverse Composition, inverse mode: "Start with x = …" (the task already says "recover the original input").
- Sequence Explorer, compare mode: "geometric growth overtakes arithmetic growth eventually".
- Interval Number Line: the static example `[-13/8, 13/8)`. This is a leak only if an item's answer is that interval;
  the bank was not checked.

Authored hints in the question bank were not audited. The platform leak guard covers them at runtime.

## Proof

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,380 / 11,380 |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail, 1 skipped (pre-existing) |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run lint`, `npm run build`, `npm run build:firebase` | pass |
| `tests/browser/toolAttemptOutcome.mjs` | pass (Chromebook and phone; adds checks that "See a similar problem worked" appears in the tool and the hint offer comes from attempt 2) |
| `tests/browser/toolPolicyGates.mjs` | pass: no tool ladder anywhere; on Practice the first hint is offered with the sentence and the tool's rungs are in the platform ladder (`data-hint-sources` … `tool`); on a DOL nothing |
| `tests/browser/assessmentLeakGates.mjs` | pass: the new words are added to the secure-surface leak list ("See a similar problem worked", "What might have gone wrong", "Hints never lower your score", "won't count toward unlocking"). Mutation: rendering the sentence on every question fails the DOL and test gates. |
| `tests/browser/composedOutcomePolicy.mjs` | pass |
| `tests/browser/feedbackTeaches.mjs` | one failure, "phone: the worked solution can be reached". It fails the same way on the base `37ec6ce` (run twice) and belongs to the closed card, which is not this session's |

New tests are in `tests/platform/learnFromTheMistakeHints.test.mjs` (17 tests) and `toolAttemptOutcomeOffers` (HELP-9).
I mutation-checked 53 new or rewritten assertions; every mutation turned the suite red. The scripts are in the session
scratchpad.

Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK): in each, the behaviour was intact and the text had moved.

- `secureRichToolRuntimeWiring`: the registry provider is now found by its mount and its `attemptOutcome`, because a
  new attribute broke the pinned line order.
- `toolAttemptOutcomeOffers`: the box's hint offer sits beside the sibling offer.
- `toolHintPolicy`: the three tools' Help is gated by `useOwnHintLadder`, and the solver props gained `hintCostNote`.
- `toolPanelCollapse`: the cost is still stated before use, now in the platform sentence.
- `tests/tools/graphing2SolutionReview`: the snap rule is read up to its own closing line.

## Deploying (not done)

**Hosting only.** No file under `functions/` changed. The browser imports `attemptWasIndependent` from
`functions/shared/sectionRecoveryService.mjs` unchanged.

```bash
node scripts/release-firebase.mjs            # the plan
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

## Merge notes for the parallel sessions

- `QuestionEngine.jsx`: this branch touches the hint block (≈1530–1620), the miss box and "Your last try" offer lines,
  the start of `attemptResults` (the first-hint offer), the providers' `publishHints`, and the new state and reset
  lines. It does not touch the closed card section.
- `HintPanel.jsx`: the intro and cost line, the diagnosis rung and button, and `data-hint-sources` on the section. The
  Ask button and its status line are untouched.
- `SectionRecoveryRunner.jsx`: the meter rule under the meter, the practice outcome message, and the `hintCostNote`
  prop. The tries-left line is untouched.
