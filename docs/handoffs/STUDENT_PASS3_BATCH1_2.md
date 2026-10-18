# Student pass 3 — Batches 1 and 2: see the result, and right answers count

Branch `claude/modest-pasteur-xzagn7`, on top of the pass-3 report (`476054a`,
[docs/qa/student-experience-pass-3.md](../qa/student-experience-pass-3.md)). The decision on 2026-10-16 was
"go with the recommendations": D1–D10 as recommended, and Batches 1 and 2 built. Batch 1 was built here.
Batch 2 was built in five parallel sessions, each on its own branch from `476054a`, then reviewed and merged
here. IDs are the report's summary-table IDs (see the numbering note in
[03-help-and-self-correction.md](../qa/student-experience-pass-3/03-help-and-self-correction.md)).

Nothing here re-grades, writes to production or deploys.

## Batch 1 — see the result (commit `d454cca`)

| ID | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| RUN-1 | Phone: after a wrong Submit, "Not quite…" sat at y=869 of an 844px screen, unreachable; the worked solution at y=1244. Chromebook: under the sticky action bar. | Everything a submit produces (outcome, last try, "See why it works", closed card, section milestone, Next card, held-feedback note) renders in `attemptResults`, inside the Work View figure right after the work area, which scrolls on a phone. The element carrying the result is brought into view once per submit, `nearest`, with no motion under reduced motion (`src/platform/student/attemptResultsReveal.js`). A tool that shows the outcome in its own result area is not scrolled twice. | `attemptResultsInWorkArea` (reveal, placement); live: phone miss box at y=664–783, final-try card and worked solution reachable by scrolling |
| RUN-6 | A final miss stacked five "closed" messages, and the Next card came before the worked solution. | One closed card (`mathmaster-closed-question-card`): the verdict once (a live region), the specific message with Read/Translate, "Your answer" with ✓/✗ per part (from the device's own grading), the worked solution, Request New Question where allowed — and only then the milestone and Next. The red miss box steps aside for a closed question. | `attemptResultsInWorkArea` (order), `closedQuestionReview`, `attemptFeedbackAnnounced` (both rewritten, below) |
| HELP-8 | The first keystroke after a miss cleared everything the student was reading. | "Your last try", dimmed, keeps the words that were shown (outcome, specific message, focus line, hint offer) until the next submit. Not a live region: it was announced when it was new. Cleared on a new question and on Reset. | `attemptResultsInWorkArea` |
| HELP-15 | The device's grading result never named its surface, so `surfaceId/mode` classifiers (`graphing/lineFeatures`, `relationshipModel/standalone`) never ran on the device: a slope/intercept swap got "Focus on: Slope". | `displayGradingSurface(question)` adds `{ surfaceId, mode }` from the grading manifest to the device-graded result (own-property lookup; `resolveMode` first). | `attemptResultsInWorkArea`: y = 2x − 3 graded through GraphLine's real path (shared grader → answer state) gets "It looks like the slope and the y-intercept traded places…" |
| HELP-7 | On registry tools (42% of items) the in-tool outcome had no hint offer and no Read/Translate. | The engine hands the tool what its own box offers: `readAloud`, `translation`, `onEvidence`, and `onShowHint` under the same rule as the box (`attemptHintOffered`: a miss, an open question, hints ready, attempt ≥ 2). `AttemptOutcomeWords` renders them. | `toolAttemptOutcomeOffers` (rendered through Vite SSR); browser: hint offer from the second miss, and "Show a hint" opens the first hint |
| A11Y-1 | A screen-reader student heard "Not quite. You have 2 attempts remaining" and never the tool's coaching; Enter on a coordinate plane plotted silently. | `ResultPill` takes the coaching as `message`, shows it under the pill and hands verdict and coaching to the slot, whose live region says them (visually hidden) with the outcome — not again when the verdict area is itself a live region. Eleven tools moved their coaching paragraph into `message` (Graphing 2, Step Algebra 2, Relation Mapping, Interval Number Line, Transformations, Representation Match, Sign Solution ×2, Inverse Composition, Inverse Derivation, Systems ×3, Rewrite Linear Form, Function Investigation 2, Data Modeling, Open Sort). `CoordinatePlane` says what a plot did (`plotAnnouncement.js`): "Plotted (3, -2)." plus "It replaced (1, 1) and (2, 2)." when the plot took points away, and the tool's count when given (Graphing 2: "2 of 2 points plotted."). | `toolAttemptOutcomeOffers` (incl. a sweep: no tool keeps a coaching `<p>` after a pill); browser: the region reads "…remaining on this version. The arithmetic is right, but the domain restriction is not…", and Enter on Graphing says "Plotted (0, 0). 1 of 2 points plotted." … "Plotted (0, 4). It replaced (0, 0) and (1, 0). 1 of 2 points plotted." |
| HELP-21 | The help panel's first line ran under "⤢ Enlarge question" (LIVE-4); a hint plus the worked example put the answer box at y≈916 of 768 (LIVE-5). | The help panel and the "open in another tab" notice are each a `mathmaster-top-panel-row`. When one starts the work it stays centred and stops short of the button (`max-width: min(860px, 100% − 2 × opener space)`); on a phone the row is padded below the button (padding, because a margin collapsed through the surface and took the button down with it). With the example open, hints read before it fold to "The hint you read"; a hint revealed later shows; the example is a `<details open>` that folds once read. | `hintPanelRoom`; live: panel 322–1044 beside the button at 1052 (1366×768), panel top = button bottom (390×844); folding the example brings the answer box from y=910 to 601 |

Also: the phone section-completion card's actions span the card (`App.css`, `mathmaster-section-completion-actions`).

### Found later: the `feedbackTeaches` phone check (commit `bcee8d4`)

The CI driver `tests/browser/feedbackTeaches.mjs` (student-teacher journeys workflow) was not among the 33 drivers
run for this gate, and its check "phone: the worked solution can be reached" has failed since RUN-1. Not the app: the
harness mounted the stage straight under `.mathmaster-assignment-screen`, without App.jsx's `.mathmaster-assignment-shell`.
On a phone that shell is the two-row grid that gives the question the rest of the screen; without it the stage took
its content's height and the work area collapsed to a 16px strip, which hid what RUN-1 now renders inside it. The
harness now renders the shell and navigator as App.jsx does, and `reachable` also requires 40px of the element to show
through every clipping box around it (a box clipped to a strip still has an on-screen position — which is how the phone
hint checks had "passed" in the same strip). All checks pass at 1366×768 and 390×844; without the shell, or with the
app's portrait work area squeezed to 24px, the phone checks go red.

## Batch 2 — right answers count (five merges)

| Item | What changed | Proof | Branch |
| --- | --- | --- | --- |
| Thousands separators | `8,050` for a key of 8050, and the reverse, wherever one number is expected: multiAnswer fields, literal answers, table cells. Exact grouping only (`8,05`, `80,50`, `1,2345`, `0,500` stay wrong); `$` and `%` keep their meaning. Lists, pairs, intervals, sets, element partial credit and Digital SAT boxes keep commas as separators. | `thousandsSeparatorGrading` | `pass3-b2-thousands-separators` |
| Equivalent function rules (P1) | The equation stage of a compiled function workflow accepts `g(n)=2n`, `2x`, `y=2x` for `f(x)=2x` (`acceptEquivalentFunctionRule`), except when the prompt asks for a form (slope-intercept, vertex, "simplify", …); an authored boolean wins. The grader now refuses a rule that swaps the axes (`x=2y`, or `x=3` for `y=3`), which the flag used to accept. No repo assignment compiles differently. | `compiledFunctionWorkflowEquivalence` | `pass3-b2-compiler-equivalence-feedback` |
| Teacher feedback (HELP-14) | `misconceptions` survives compilation for every question kind, so `missFeedback` shows the teacher's message for the matching wrong answer. | `compilerKeepsMisconceptions` | same |
| −1/2(x−6) (RUN-2, R-11) | A bracket after a numeric denominator ends a typed fraction: `y-2=-1/2(x-6)` builds −(1/2)(x − 6). `1/(x-6)` still groups on purpose. | `typedFractionEntry`, `tests/browser/mathEntryContract.mjs` | `pass3-b2-fraction-entry-vertical-boundary` |
| Solid vertical boundaries | An authored vertical boundary keeps its style (`verticalLineStyle.js`): x = 5 of x ≤ 5 is solid, in the drawing and in the screen-reader description. Bare numbers stay dashed guides. | `verticalBoundaryStyle` | same |
| Step Algebra tries (D1) | No support level spends a try on a valid longer move or a slip (wrong-side cancellation tap, wrong intermediate simplification); only the submitted answer does. The shorter-route coaching stays, and the step still records the move as not efficient; Standard and Independent still record slips for the teacher. The server agrees and does not re-charge a step an older browser charged. | `stepAlgebraValidMovesSpendNoTries` + rewritten level/server/credit tests | `pass3-b2-step-algebra-tries` |
| Secure items with nested arrays (A2.3B) | Any top-level field of a secure item that nests arrays is stored as `<field>Json` and listed in `jsonEncodedFields`; it was wider than the matrix item: 292 table-stimulus and 11 regression families could not be issued on a Test either. Items stored before read back unchanged. | `secureItemNestedArrays`, emulator `secureItemNestedArraysStorage` (all seven emulator suites pass run singly) | `pass3-b2-secure-item-nested-arrays` |

### Found while merging: the calculator computes the fraction it shows (commit `64f5073`)

The bracket rule made typing `6/2(1+2)` in the calculator build six-halves times (1 + 2), but MathLive's ASCII is
`(6)/(2)(1+2)`, which mathjs reads as 6/(2·3): the screen showed 9 and the calculator answered 1 (`3/4(8)` answered
0.09375; `\frac{1}{2}\pi` was already read as 1/(2π)). `groupBuiltFractions` wraps each built fraction once before
evaluating; typed text is unchanged. Proof: `calculatorBuiltFractions` (mutation-checked) and the real calculator in
`mathEntryContract` (6/2(1+2) = 9, 3/4(8) = 6; 1 and 0.09375 without the fix).

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

Each one pinned the old spelling of behaviour that is intact; each now asserts the behaviour and was
mutation-checked.

- `attemptFeedbackAnnounced`: the outcome box's gate by its parts (`showOutcomeFeedback`, `!outcomeInTool`), and the
  closed card's announcement in the same words.
- `closedQuestionReview`: the closed panel is the closed card section; the review and Request New Question are in it.
- `toolAttemptOutcome`: every pill but a stage check offers the slot (it now also passes its words).
- `accessiblePlatformWiring`, `plotGestureContract`: Enter elsewhere and a pointer lift still plot, now through
  `commitPlot`, which hands the point to `onPlot` (asserted) and then announces it; a press still never plots.
- `graphFeatureStages`: the plane's live region is still never gated by `revealCoordinates`; it now also carries
  the plot sentence, in the same words as the readout.
- `calculatorExactFractions`: the panel still imports `evaluateCalculatorExpressionExact` (now beside
  `groupBuiltFractions`).
- `warmupReopenServerLifecycle` (its render probe): a closed question still shows its closed notice — now the closed
  card's "This question is closed after N tries", in place of the panel it replaced.
- `toolDraftPersistenceContract`: the plane's `plotAnnouncement` and the slot's `insideLiveRegion` are declared as
  presentation in `toolStatePersistence.js`.
- From Batch 2: `coordinatePlaneClipAndHelp` (vertical lines still drawn inside the clip), the `typedFractionEntry`
  assertion that pinned the bracket bug, and the Step Algebra level/server/credit tests (D1).

## Checks

| Check | Result |
| --- | --- |
| `npm run test:platform` (functions dependencies installed) | 11,361 tests, 11,361 pass (`37ec6ce`). The first run had 6 failures, all pinned to old spellings or missing a declaration; each was rewritten or added as described above |
| `node --test tests/tools/*.test.mjs` | 1,644 tests, 1,643 pass, 0 fail |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run lint` | exit 0 (warnings only, none in changed files) |
| `npm run build`, `npm run build:firebase`, `check-first-load-budget` | pass; first load within baseline |
| `npm run audit:theme-colors` + theme and dark-mode contract tests | pass |
| `npm run certify:accessibility` (axe, 11 screens × desktop and phone) | 0 violations, nothing new or increased |
| `npm run certify:dark-mode` | pass (192 surfaces, light and dark) |
| `tests/browser/workViewMatrix.mjs` | every Stage 3A family keeps its controls, state and Undo |
| The student-runtime and accessibility browser gates CI runs on a PR (33 drivers, incl. toolAttemptOutcome, mathEntryContract, assessmentLeakGates, graphKeyboardRoute, closedVerdictChip, dolCloseCopy, graphDescription, calculatorKeyboard and the tool keyboard drivers) | all 33 pass |
| `tests/browser/toolAttemptOutcome.mjs` (the new cases) | the new offers and the Graphing plotting journey pass on Chromebook and phone; DOL, quiz and test still show nothing |
| Live harness walk, 1366×768 and 390×844 | see RUN-1 and HELP-21 rows above |

New assertions were mutation-checked: Batch 1 — 19 (tool outcome and plotting), 8 (help panel), 13 (results area);
the calculator — 4; the rewritten contracts — 10. Batch 2's sessions report the same for their own tests.

## Deploying (not done)

Hosting and Cloud Functions both change: Batch 1, the entry and boundary fixes and the calculator are browser code;
the graders (`functions/shared`) and secure storage (`functions/lib`) are server code the browser also imports.

```bash
node scripts/release-firebase.mjs            # the plan: targets from the diff since the live build
node scripts/release-firebase.mjs --execute  # deploy it (asks for the project id)
```

Never a raw `firebase deploy --only hosting…`. Ship the functions together; at minimum the release must include
the secure-exam issue/submit/save/finalize callables, `issueTestCycleCorrectionQuestion`,
`submitTestCycleCorrectionResponse`, `issueNextQuestion`, `submitPathResponse`, the review callables that call
`publicReview`, the step-submission ingestion, and every grader that reads `functions/shared` (including the
deadline finalizer). Until the functions ship, the server still marks `8,050` wrong and still charges for Step
Algebra slips while the browser does not. During the deploy window a function on the old code reading a newly
stored nested-array item sees it without its table or matrix; its answer key is intact, so grading is unaffected.

## D8: answers recorded under the old graders

`8,050`-style answers recorded before this are still marked wrong. Per D8, run the read-only report first
(`scripts/report-classroom-regrade-candidates.mjs`), then re-grade upward only; never lower a recorded grade.
Not done here.

## What comes next

Launched on 2026-10-16 from `37ec6ce`, each on its own branch:

| Part | Branch | State |
| --- | --- | --- |
| Batch 3, finishing abandoned timed tests | `claude/pass3-b3-abandoned-test-finalizer` | Built and reviewed; ships on its own, with the persistence half (its handoff is on that branch) |
| Batch 3, client persistence | `claude/pass3-b3-persistence-client` | Built; an independent review found a blocker and four data problems in the answer-by-answer merge, all fixed and re-verified (the single-device path proven unchanged against `37ec6ce`); a last should-fix and four rollout-window notes are being finished. Ships on its own (its handoff is on that branch) |
| Batch 4, corrections and Recovery practice | `claude/pass3-b4-corrections-recovery` | Merged — [STUDENT_PASS3_B4_CORRECTIONS_RECOVERY.md](STUDENT_PASS3_B4_CORRECTIONS_RECOVERY.md) (changed at integration: every Recovery practice item has one answer) |
| Batch 4, after the last miss | `claude/pass3-b4-after-last-miss` | Merged — [STUDENT_PASS3_BATCH4_AFTER_LAST_MISS.md](STUDENT_PASS3_BATCH4_AFTER_LAST_MISS.md) |
| Batch 4, the hint ladder (D2, D5) | `claude/pass3-b4-hints` | Merged — [STUDENT_PASS3_BATCH4_HINTS.md](STUDENT_PASS3_BATCH4_HINTS.md) |
| Batch 8, Ask my teacher | `claude/pass3-b8-ask-my-teacher` | Merged, with the security review's fixes — [STUDENT_PASS3_BATCH8.md](STUDENT_PASS3_BATCH8.md) |
| D10 design | `claude/pass3-d10-answer-key-design` | Merged — [ANSWER_KEY_SERVER_SIDE_DESIGN.md](ANSWER_KEY_SERVER_SIDE_DESIGN.md) |

Wave 3, launched on 2026-10-16 from `a7dddc7`: seven of its eight sessions are merged (the assignment chrome, getting
around, the keyboard tools, what tools say and show, Read aloud and Translate, extra time on the exit ticket, D10 Phase 0);
see [STUDENT_PASS3_WAVE3_INTEGRATION.md](STUDENT_PASS3_WAVE3_INTEGRATION.md) for what the merge changed, its gate, and how
it ships. Submit and finishing merged with wave 4.

Wave 4 is merged, with Submit and finishing and wave 5's first-load session: Work View help on phones and exit tickets
that keep the method to themselves, Test Cycle dates, Live Challenge rounds that always finish, Systems tools that never
strand a student, and the student first load back within its budget. See
[STUDENT_PASS3_WAVE4_INTEGRATION.md](STUDENT_PASS3_WAVE4_INTEGRATION.md).

Wave 5 is merged: descriptions for non-graph figures and the VPAT, Matrix Lab feedback, reasons that name the fix, Step
Algebra's board and equal-unit planes, secure-test answer entry, and the assignment's calculator setting. See
[STUDENT_PASS3_WAVE5_INTEGRATION.md](STUDENT_PASS3_WAVE5_INTEGRATION.md); its step-key change ships in two releases.
Wave 6 follows on this base: the D9 word pass, getting around (NAV-19 to NAV-25), hints that fit, tool directions on exit
tickets, Batch 3 merged into this line, and the grader gaps the secure-entry reviews found.

## Left for later

- The Path V2 field grader (`functions/lib/mathPath.js`, mirrored in `teacherPathRuntime.js`) and tool workflow
  grading still read a thousands separator as wrong.
- The Path stimulus still cannot shade beside a vertical boundary (only above/below).
- The new vertical-boundary drawing is covered by unit and source tests, not yet seen in a browser.
- A real screen-reader pass of the new announcements (Batch 6 asks for one across the platform).
- Very old browsers that send Step Algebra steps without move details still go through the older path, where the
  server takes the browser's attempt count.
