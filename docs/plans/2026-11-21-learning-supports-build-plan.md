# Build plan: worked examples, showing the process, and authoring for future assignments

Written 2026-11-21, on main after #587. It covers the work the owner decided on
2026-11-20, from two specs:
- `docs/platform/WORKED_EXAMPLES.md` (WE);
- `docs/platform/SHOWING_THE_PROCESS.md` (SP).

It also covers the authoring guide that new assignments need, and lists the
other open items so nothing is lost.

Each package below has an owner, its dependencies, the files it touches, and a
"done when" line. A package in a **build session** is a separate session with
its own branch and PR. The **lead** session integrates every PR, runs the full
gate, and merges with a merge commit when CI is green.

## The rules every package follows

- **Scope.** Platform and future assignments only. No lesson or assignment JSON
  is edited (`teacher-import-jsons/`). The decisions:
  - **Examples:** never on DOL, quiz or test.
  - **Practice:** never scored lower because an example was opened.
  - **Grading:** what the grader is told stays exactly as today, unless the
    package says otherwise.
  - **Signals:** they never touch a grade.
- **Gate:**
  - `npm run test:platform`;
  - `node --test tests/tools/*.test.mjs`;
  - lint and the audits;
  - `npm run build` and `build:firebase`;
  - `check:first-load`, with student Home within its baseline;
  - the browser drivers CI runs for the changed areas (`scripts/lib/ciAreas.mjs`).

  Every new test fails before the change and passes after it. No test is
  skipped or weakened.
- **Drivers.** A driver that answers a multi-part question goes through
  `tests/browser/support/partByPart.mjs`.
- **Public repository.** No private links, personal details or model names.
  Commits end with the session trailers.
- **Release.** No deploying and no operator scripts. Each PR has a "Deploying"
  section from the release planner, run in plan mode with `--since origin/main`.

## Done

| What | Where |
|---|---|
| Worked examples spec | #585 |
| Showing the process spec | #586 |
| SP P1: part by part, Review all parts, See every part at once | #587 |
| SP P1 in Recovery | #588 |
| SP-1c: Read aloud reads only the parts on the screen | #595 |
| SP-1b: a secure Test's field item goes part by part | #596 |
| SP-2: teacher signals, "worth a conversation" | #591 |
| SP-2b: signals as evidence (assignment results, Case Review, review note, class time, supports) | #597 |
| WE-A: the example player and the section rules | #594 |
| WE-G: the teacher's view of worked examples, by skill | #599 |
| WE-C: the Step Algebra replay | #600 |

## Track SP: showing the process

| Package | Owner | Depends on | What | Done when |
|---|---|---|---|---|
| **SP-1b** Secure Test field items | lead | — | `RichQuestionRuntime` `FieldItem` (several `responseFields`) goes part by part, inside the item boundary, with Review all parts, then submit | The secure exam emulator drivers answer part by part through the helper. Item boundary and drafts tests are unchanged. |
| **SP-1c** Read aloud follows the parts | lead | — | Read aloud and Translate read the open part and the answered lines, never a part not yet shown (`questionReading.js`) | A test shows that a hidden part's label is never read. The read-aloud corpus moves only where parts are hidden. |
| **SP-2** Teacher signals | build session F | — | Per attempt: "left the page, then a burst of right parts" (`visibilitychange`), "pasted into a math box", "right first time on a hard question with no tool work", beside today's fast-and-right signal. Shown to teachers only, as "worth a conversation", in Live Classroom, in the assignment's results, and in the Student Case Review (a "Work-pattern signals" section, the case timeline and the export, with patterns over time). Stored on the server beside the attempt, as a record of its own (never a field of the attempt or the grade), at school or at home. "Dismiss" marks a signal reviewed (who, when, note) and never deletes it. In or outside class time, and the supports in effect, are recorded with each signal (owner, 2026-11-21; `SHOWING_THE_PROCESS.md` section 7). Exempt where the support profile explains the pattern. | No contents are recorded, only facts. No grade, attempt or mastery path reads the signals (a test reads every grade path). Rules and emulator tests cover the new fields. The teacher journeys pass. |
| **SP-3** Follow-through parts | lead | after session C merges (it changes `answerEquivalence.mjs`) | `followThrough` on a part: the prompt shows the student's earlier value, and the grader keys the later part to it, on the client and the server | Grader tests cover an early slip not marked wrong twice. The verdict sweep (`scripts/sweep-equivalence-verdicts.mjs`) moves nothing without `followThrough`. |
| **SP-4** Show the step | build session E (after WE-C) | WE-C | `checkpoint` kinds `pickPoints` (plane) and `stepMoves` (Step Algebra) first, then `factorPair` and `tableRow`. Checked by the tool's own engine and recorded with the attempt. | Tool tests for each kind. The teacher sees the student's points or moves. |
| **SP-5** Pre-Flight authoring rules | lead | AG-1 | Warnings on new assignments only: a box asking for what a tool produces, and three or more parts with neither `checkpoint` nor `followThrough`; `{name}` checks for `followThrough` | Existing assignments raise nothing new (a test over `teacher-import-jsons`). |

## Track WE: worked examples

| Package | Owner | Depends on | What | Done when |
|---|---|---|---|---|
| **WE-B** Coverage report | lead (first) | — | A read-only Pre-Flight panel and a script. For each classwork question: covered by its own example, by an earlier question on the same skill, by a built-in generator, or not covered (with the generator or authored example that would cover it). New assignments get a warning; existing ones get information only. | It reproduces today's measurement (137 of 496 covered, 14 of 41 lessons with none) and runs in the Pre-Flight modal. |
| **WE-A** The player and the section rules | build session E | — | "See a similar problem worked" becomes a step-through player (Next and Back, a "why" per step, Your turn):<ul><li>it opens by itself before the first Classwork question on a new skill;</li><li>on Practice it plays only on request;</li><li>it never appears on DOL, quiz or test.</li></ul>`workedExampleUsed` is recorded and the score never changes. The safety checks stay (`similarExampleIsSafe`). | Leak guards on DOL, quiz and test (extend the assessment leak gates). A test shows the Practice score unchanged after opening an example. Keyboard, Read aloud, Translate, phone width, 200% text, dark mode and forced colours all work. |
| **WE-C** Step Algebra replay | build session E | WE-A | The example plays as the tool's own moves on the same board. Variables on both sides first. A faded hand-over (`handOverAfter`). | Every replayed line comes from the tool engine. An authored script that does not reach its answer is refused. |
| **WE-D** Radical replay with factoring slides | build session E | WE-C | Square, collect to zero, factor, zero product, check each root. The factor step opens the factoring skill's slides from `factoringVariant`: 4 for x² + bx + c and 6 for ax² + bx + c (a·c, pairs, split, group, factor, zero). On Practice the factor step is one line with **Show how**. | Extraneous roots are rejected on a slide of their own. The factoring slides are tested for both shapes. |
| **WE-E** Plane and inequality replay | build session E | WE-A | `graphSystem`, `constructLine`, `solveInequalitySystem`: intercept, rise and run, the line, solid or dashed, a test point, the shading, the check | The example draws what the student's tool records. |
| **WE-F** Spot the mistake, model answers, why this step? | lead | WE-A | Spot the mistake from `solutionReview.commonError`. A model answer and checklist for explain questions. One "why this step?" choice per Classwork example. | Each reads existing fields, except the model answer, which is authored (AG-1). |
| **WE-G** The teacher's view of examples | build session F | WE-A, SP-2 | Per skill: which students opened examples, and whether the next question then went right. Shown with the SP-2 signals. | It is shown in the teacher's results and appears in the teacher journeys. |
| **WE-H** Reference cards | lead | AG-1 | `lessonSupports.referenceCards`, pinned on Classwork and Practice, absent on DOL, quiz and test | Leak guards. Read aloud reads them. |
| **WE-I** More built-in generators | lead and helpers | WE-B | Sibling generators for the skills the coverage report ranks highest among answer-box questions (247 uncovered today) | Each generator passes `similarExampleIsSafe` over the real questions it claims. |

## Track AG: authoring for future assignments

| Package | Owner | What | Done when |
|---|---|---|---|
| **AG-1** The authoring guide and contract | lead (early, so authors can start) | <ul><li>A guide for new assignments: `lessonSupports` (referenceCards, examples), a question's `example` (or `{ "none": "setup" \| "explain" }`), `followThrough`, `checkpoint`, tool first, and the coverage rule.</li><li>The V5 compiler (`authoringIntentV5Core.js`) passes the new fields through, and the validator accepts them with clear errors.</li><li>An example lesson fragment.</li></ul> | `validate:authoring-v5` accepts the fragment and refuses malformed fields. No existing assignment changes. |

## Already queued, or waiting on the owner

- **Starting 2026-11-21 at 13:05 UTC (scheduled):**
  - **Session C:** unfinished and over-long answers (#557, #558).
  - **Session D:** Classroom Reconcile and its run report (#545).
- **Owner only:**
  - the release and its deploy window;
  - SI01 (class-scoped assignment reads) right after it;
  - N05 (re-grade);
  - N34 and N53;
  - the Live Challenge pause;
  - the two-day classwork option;
  - Systems Workspace practice credit;
  - TS05's remaining keys;
  - the g(x) line in point maps;
  - the Spanish wording review (handoff section 5).
- **Open defects:**
  - #177, the Live Challenge endurance invite race. A diagnostic is in place; it waits for a recurrence.
  - #183, the `questionEditorSupersession` driver on ipad-820. It waits for a recurrence.

## Order

1. **Now, lead:** this PR (Recovery), then AG-1 and WE-B. Authors can then
   write examples, and the gaps are known.
2. **From 13:05 UTC, sessions C and D** (scheduled). Then the lead merges each
   when it is green.
3. **Build session E**, worked examples: WE-A, then WE-C, then WE-D, then WE-E
   (one PR each), then SP-4.
4. **Build session F**, the teacher's view: SP-2, then WE-G.
5. **Lead, alongside:**
   - SP-1b and SP-1c;
   - SP-3, after session C merges;
   - SP-5 and WE-H, after AG-1;
   - WE-F, after WE-A;
   - WE-I, ranked by WE-B.

**Shared files.** WE-A and SP-2 both touch `QuestionEngine.jsx`, which
sessions E and F should rebase onto as each merges. SP-3 waits for session C,
which changes the grader's equivalence code.

## Brief for build session E (worked examples)

Implement WE-A, then WE-C, WE-D and WE-E, one PR each, from
`docs/platform/WORKED_EXAMPLES.md` and this plan. Read both, AGENTS.md and the
existing worked-example code (`src/platform/supports/workedExample/`) first.
Build on "See a similar problem worked" and the sibling builders; do not write
a second version.
- **Section rules:** Classwork opens the example before the first question on
  a new skill; Practice plays it only on request; DOL, quiz and test never
  show it.
- **Score:** opening an example never lowers a score; record
  `workedExampleUsed` as today.
- **Replays:** each replay drives the tool's own engine, so a slide cannot
  show a line the engine would not produce.
- **Factoring:** opens its own slides, never a single line.

Follow "The rules every package follows". Do not deploy, run no operator
script, and post nothing on issues.

## Brief for build session F (teacher's view)

Implement SP-2, then WE-G, one PR each, from
`docs/platform/SHOWING_THE_PROCESS.md` section 7, `WORKED_EXAMPLES.md` section
9 (slice G) and this plan. Read AGENTS.md and
`src/platform/teacher/rapidCorrectness.js` first.
- **What is recorded:** facts only, never contents, keystrokes or anything
  pasted.
- **Effect:** no grade, attempt or mastery path may read the signals, and a
  test proves it.
- **Exemptions:** students whose support profile explains the pattern raise
  none.
- **Firestore:** new fields need rules and emulator tests.

Follow "The rules every package follows". Do not deploy, run no operator
script, and post nothing on issues.
