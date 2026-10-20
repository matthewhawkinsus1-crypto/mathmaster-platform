# Student pass 3 — wave 7 on the integration branch (2026-10-20)

`claude/modest-pasteur-xzagn7` moves from `530ac3cf` (= `main` after releases 1 and 2) to this merge. It holds wave 7:
seven sessions, each reviewed by an independent session, and `main`'s #501 (Honors CCMR claims proved at import),
which landed while the wave was in review. It also holds W7-8, a phone fix for a live bug that the wave's own browser
gate found.

Each session's handoff holds the detail. This note covers:
- what the reviews and the merge changed;
- what changed after the release PR opened;
- how the merged tree was checked;
- how it ships;
- what waits for the owner.

**This is pass 3's third release. It deploys Firestore rules, the whole default function fleet, path-admin and
Hosting. Release it outside class time: it changes how a step is saved and what a secure test records on a miss. Read
[Deploying](#deploying-not-done) first.**

## What merged

| Session | Branch | Merged at | Handoff |
| --- | --- | --- | --- |
| W7-3 · honest failures: unqueued steps and new problems, raw error text, untrue copy, the kept save notice | `claude/pass3-honest-failures` | `3b32e1b` | [STUDENT_PASS3_HONEST_FAILURES.md](STUDENT_PASS3_HONEST_FAILURES.md) |
| W7-1 · grader gaps 2: mixed numbers, ordered pairs keyed as text, three refused right answers, the old-key sweep | `claude/pass3-grader-gaps-2` | `8566046` | [STUDENT_PASS3_GRADER_GAPS_2.md](STUDENT_PASS3_GRADER_GAPS_2.md) |
| W7-4 · feedback that names the fix, part 2 (TOOL-5, composed steps, D9 words, Data Modeling) | `claude/pass3-feedback-reasons-2` | `101f588` | [STUDENT_PASS3_FEEDBACK_REASONS_2.md](STUDENT_PASS3_FEEDBACK_REASONS_2.md) |
| W7-6 · server follow-ups: corrections that name the mistake on a real Test; class sittings recorded | `claude/pass3-server-followups` | `34bfc55` | [STUDENT_PASS3_SERVER_FOLLOWUPS.md](STUDENT_PASS3_SERVER_FOLLOWUPS.md) |
| W7-2 · math boxes and choices: box names, one choice group, the Complete badge, speech | `claude/pass3-boxes-and-choices` | `bf57d26` | [STUDENT_PASS3_BOXES_AND_CHOICES.md](STUDENT_PASS3_BOXES_AND_CHOICES.md) |
| W7-5 · Read aloud 2: tables, graphs and tool drawings; the back-up step only where written | `claude/pass3-read-aloud-2` | `494f7ce` | [STUDENT_PASS3_READ_ALOUD_2.md](STUDENT_PASS3_READ_ALOUD_2.md) |
| W7-7 · CI hygiene: pass 3's hand-run drivers into CI, known test gaps | `claude/pass3-ci-hygiene` | `f7a348a` | [STUDENT_PASS3_CI_HYGIENE.md](STUDENT_PASS3_CI_HYGIENE.md) |
| W7-8 · the phone save line: the lines under the question are seen on a phone (found by this gate) | `claude/pass3-phone-save-line` | `b191b27` | [STUDENT_PASS3_PHONE_SAVE_LINE.md](STUDENT_PASS3_PHONE_SAVE_LINE.md) |

They merged in that order, with `main` (#501) after W7-2 and W7-8 last.
- Every session started from `530ac3cf`, except W7-8. It started from the merged seven (`3cba919`) after the
  browser gate found the bug it fixes.
- None merged anything into its own branch, and nothing was rebased.
- Each had an independent review. Each merged after its reviewer's last look, or the integrator's check of a small
  last delta, found nothing blocking.

## What the reviews changed

Every branch changed after its review. These are the changes a student or the owner would notice; each handoff has
the full list.

- **W7-1:**
  - an ordered-pair question showed its key in Work View's scratchpad, under "Current question", before the student
    answered. That was live: the array key in full since before pass 3, a text key garbled. The details are now the
    prompt and the student's answer only, and a new test runs nine graders' details against a distinctive key;
  - `x = 3½` inside an equation or inequality was still read as 3·½: right for `x = 1.5`, wrong for `x = 3.5`. A whole
    side or bound written as a mixed number is now one value;
  - a Digital SAT box on an assignment now declines a mixed number at entry, with a fixed line, and spends no try (the
    SAT takes none); the grader still reads its value;
  - a number box is decided by the first of the field's stored kinds, the same on every surface.
- **W7-3:**
  - a Live Challenge answer that arrived after time was up told the student "Check the Wi-Fi and try again". The
    server's own sentence ("Time was up before your answer arrived, so it was not counted.") is shown again;
  - an inequality flip (dividing by a negative) that the device could not save was applied with no notice. It is now
    held like every other step;
  - "Apply the step again" could apply an old step over new staging. Any change of staging now retires it;
  - the session's gate claim was wrong (one source contract still pinned the old account cleanup); the contract now runs
    the account rule through one tab's life;
  - *integrator's decision:* "extra time" is said on the exit-ticket pill and Home only once the class's own window has
    ended, so a neighbour does not read a student's accommodation for the whole period (decision 12).
- **W7-4:** a composed step's new "why it missed" line could answer another step. A feature step said "This graph does
  not have one", which answers "Does it have an x-intercept?" on real district Classwork with tries left. Reasons now
  come from a per-kind allowlist: feature and point steps say nothing, roles and axes one fixed sentence, and anything
  unlisted says nothing. The Path retry line names no button (most Path questions say "Check my answer").
- **W7-6:**
  - *integrator's decision:* class sittings ship **record-only**. As built, one student starting a Test from home on a
    snow day would have made the day count as sat, marked every absent classmate missed (their stand-in Retest is capped
    at 70) and stopped the teacher being told. Nothing reads a sitting now; a day that stops resolving behaves as before
    (decision 18);
  - the miss-diagnosis code loaded cold inside the submit transaction, holding the session about a second. It now
    starts loading at entry and is awaited before the transaction.
- **W7-2:**
  - in Figure Match, Home, End or Space on the chip already chosen cleared that figure's category, so an exit ticket
    would submit it unanswered. A key now selects only when it lands on a different option;
  - moving through Process Mode's "Which variable is 0" wiped the point typed under it; each choice keeps its own;
  - a signed denominator that is a word was spelled out ("1 over negative s in"). Known names and words are read whole;
    a product of variables is still said letter by letter ("V over l w").
- **W7-5:**
  - in Focus Mode a lesson's later steps stay on the page, hidden. Their graphs were read on step 1, named by a later
    step's prompt: on the DOL item `q_section-4_4_4`, "Does this graph have an x-intercept?" was followed by step 7's
    "Mark the maximum or minimum…". Only the step on screen hands its figures to Read aloud now;
  - two different graph cards with the same words were read once. Both are read;
  - "Graph 1 · Intercept method" was read "Graph 1 times Intercept method" (seven items, a DOL among them). A " · "
    before a word is said as a comma; "2 · x" is still "times";
  - a table cell the student had filled was read "blank". It is read as what they wrote ("c of x, you wrote 8 over
    5"), with no verdict;
  - the "Let's back up" count took two lessons twice. Of 248 items, 152 keep a back-up step and 96 lose the generic one
    (decision 15).
- **W7-7:**
  - the new Live Challenge lobby-invite journey passed with every join refused. It now checks that the student is in;
  - a guarded step could skip forever if its driver were renamed. The pin test now fails once a guarded driver exists,
    and this merge turned the five guards into plain steps (below);
  - *integrator's decision:* the two long emulator journeys (the Test Cycle rich tools and the Live Challenge shell)
    run in their own workflow, `student-pass3-emulator-journeys.yml`: on pull requests that touch what they load,
    nightly and on demand. The gates no longer run on every `functions/**` change (decision 22);
  - those paths first missed 326 files the drivers load. They are now `src/**` less 29 whole directories, and
    `scripts/check-emulator-journey-paths.mjs` finds none missed;
  - found on the way: studentHomeToday and dolCloseCopy failed near midnight UTC (dolCloseCopy on the base too). Both
    now hold the page's clock at noon. A race in liveChallengeShellQa's adversarial scene is fixed: the driver waits for
    the console's own count before Cancel Session.
- **W7-8:** its first version made the lines under the question visible on a phone, but took their height from the
  question's action bar on short phones at 200% text. At 320×568 with the warning showing, no action-bar button,
  Submit included, could be pressed; at 360×640 every button was cut through. The task panel now gives way first
  and scrolls. The bar is whole at every size the reviewer measured, and those sizes, landscape at 200% and 664×390
  among them, are in the new check.

## What the merge changed

- **Conflicts.** One, as each review predicted: `src/tools/matrixLab/matrixLabUi.jsx`'s imports (W7-2's choice group
  beside W7-4's `useSubmitActionName`). Both kept.
- **`main` (#501).** Merged after W7-2, with no conflict. It touches `functions/index.js`, `App.jsx`, the teacher
  harness's fakes and fixture, and `student-teacher-journeys.yml` (a new honors-ccmr job). W7-7 checked its pins and
  journeys against it.
- **`dfa91b7`**: a test header (W7-1's `questionDetailsNeverShowKey`) said it checks a second render it does not make.
- **`3cba919`, the guarded CI steps.** Five steps skipped while their drivers were on other branches: stepNotQueued
  (W7-3), toolOutcomeReach and feedbackReasons2 (W7-4) and toolChoiceGroups (W7-2) in pass3-student-screens, and the
  draft-save notice reload journey (W7-3) in pass3-student-journeys. With every branch merged they are plain steps,
  pinned in `pass3BrowserDriversInCi`. Putting a guard back turns it red.
- **W7-8** (`c821835`), last, with no conflict: it started from the merged seven, so the merged tree is the tree its
  reviewer checked.

## After the release PR opened (#502)

Three fixes, each from a finding on the PR:
- **`9de24ee`, from Codex's review.** An ordered pair whose key has a root marked a right answer in square brackets
  (`[1-\sqrt{2},3]`) wrong, though both coordinate marks said right: W7-1's root branch read only round brackets. It
  now reads the pair with the brackets a plain key takes. `studentPass3GraderGaps2` covers it, and reverting the fix
  turns it red. test:platform (12,315), tools, lint, both builds and first load (842.8 KB) pass, and the grading sweep
  against `530ac3c` gives the same verdicts as before the fix.
- **`9115c49`, from CI.** `askMyTeacherJourneys` counted the teacher's list the moment "Answer sent" appeared, a task
  before the snapshot that drops the answered question, and CI's runner lost that race. It now waits for the row to
  go. Delaying the harness's snapshots reproduces CI's two findings with the old check; a panel that keeps the
  answered question still turns the new one red.
- **`6a8f0b6`, from CI.** liveChallengeShellQa's adversarial scene presses Start three times across two tabs, and it
  waited for all three presses before its countdown checks. A press that lost the race waited 30 s for a Start button
  that was gone, so "an answer during the countdown" went after GO and was accepted. The countdown checks no longer
  wait for the presses, and the early answer must be refused as early (`round_not_started`). Making one press lose the
  race reproduces CI's findings with the old scene and passes with the new one; a server that accepts early answers
  still turns it red.

## Checks

| Check | On | Result |
| --- | --- | --- |
| `npm run test:platform` | `3cba919` (all seven and #501) | 12,309 of 12,309 |
| `node --test tests/tools/*.test.mjs` | `3cba919` | 1,743 of 1,743 |
| `npm run lint` | `3cba919` | exit 0 (warnings only) |
| `npm run build` · `npm run build:firebase` | `3cba919` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | `3cba919` | studentHome 842.7 KB (limit 847.3), signIn 292.6 KB (limit 298.3) |
| The grading sweep (`scripts/sweep-equivalence-verdicts.mjs --base 530ac3c --draws 3 --check-wrong`, on a full clone) | `3cba919` | Exit 0 over 10,018 fields and 289,977 verdicts. None of these moved: right → wrong, near miss → right, stacked or gap wrong answers accepted, editor spellings refused. The only changes are W7-1's own sets: 1,009 verdicts newly right (327 response and key pairs) and 66 near misses newly refused (21 pairs). So no other part of the wave moves a verdict. Old keys: 134 snapshots read, 10 fields re-asked as another kind of answer (decision 5), no old spelling refused |
| `audit:answer-acceptance` · `release:path:verify` | `3cba919` | 27,257 known-correct spellings, 0 refused · the committed release manifest matches the course content |
| The emulator suites: `test:rules` (both runners), `test:challenge-finish`, `test:canonical-persistence`, `test:test-cycle-certification`, `test:secure-exam-navigation`, `test:grade-authority`, `test:secure-exam-auto-finalize`, `test:authoring-v5`, `test:classroom-regrade-report:emulator` | `e033cc8` (all but W7-7 and W7-8, which change no function, rule or emulator suite) | 248 and 224 · 492 · 35 · 40 · 25 · 14 · 11 · 687 · 5, all pass |
| The rest of the full-platform suite: six emulator suites (classroom regrade report, identity repair, Live Challenge launch, path choice report, path release, Warm-Up reopen) and the audits (authoring boundary, legacy source, authoring v5 and its validation, release authority, challenge DOK and quality, fidelity seeds) | `3cba919` | all pass; no tracked file rewritten |
| The release plan (`node scripts/release-firebase.mjs --since 530ac3c`, plan only) | `3cba919` | Firestore rules, the whole default fleet (28 groups, about 63 minutes), path-admin and Hosting; no indexes |
| The browser gate, in nine cloud sessions (below) | `3cba919` | every driver, journey and suite passes but one check, which found a live phone bug (below) |
| W7-8 merged: `npm run test:platform` · tools · lint · build · build:firebase · first load | `c821835` (all eight and #501) | 12,315 of 12,315 · 1,743 of 1,743 · exit 0 · pass · pass, no tracked file rewritten · studentHome 842.8 KB, signIn 292.6 KB |
| The browser gate again, nine cloud sessions (below) | `c821835` | everything passes, the large-text check included, except one intermittent cold-start failure that `main` before the wave has too (below) |

Each session's own gate is in its handoff. Every branch also ran its own browser drivers, and its reviewer reran the
ones in its area.

### The browser gate

Run on `3cba919` by nine cloud sessions, one part each, each failure re-run alone and then compared on `main` before
the wave. Two parts now run as CI runs them: the lobby invite and Ask my teacher on the accessibility App harness
(5189), and secureAccessParity on the stubbed server as well as the plain one.

Everything below passed on its first run:
- **Student drivers:** 27 in 2a, 17 in 2b, and 19 in 2c and 2w. `workViewMatrix --write` changed only its
  timestamp.
- **Wave 7's own drivers (2x):** stepNotQueued (85 checks), toolOutcomeReach, feedbackReasons2, toolChoiceGroups,
  studentWhatChanged and toolDraftSyncSweep.
- **Journeys:**
  - the 22 real-App journeys (3a, 3b);
  - the slow Warm-Up reopen journeys (3c);
  - the rest of the journeys job (6a, 6b), recovery hold's 450 checks among them.
- **Suites that start their own servers:**
  - draft persistence;
  - Test Cycle devices (12 of 12, no production contact);
  - the load test (30 students, 0 duplicates);
  - class rewards (22 of 22);
  - Live Challenge teaching (58 of 58) and projector privacy (86 checks);
  - the Test Cycle rich tools (490 checks);
  - the Live Challenge shell, every scene.
- **Dark mode and the capabilities certification (4).**
- **Accessibility (5):** `certify:accessibility`, and 21 of the part's 22 other checks.

**The one failure: the large-text check found a live phone bug.** `studentShellLargeText --check=text` failed on the
scene W7-2 added, a lesson opened in the real App. At phone 200%, 320 px reflow and phone text spacing, "Draft saved."
is cut off by the question stage.
- It fails the same on W7-2's branch alone, and on `530ac3c` with only that scene added. So it is neither the merge
  nor new.
- On a phone in portrait the stage clips (`overflow: hidden`) and the question fills it. The save line, and the
  draft-save problem notice after it, sit below the stage, and a sighted student never sees either.
- Measured on `530ac3c` at 390×844 with normal text: the stage ends at 843 px, and the line starts at 851.
- CI would fail on this release, so W7-8 fixes the layout, not the check.

**W7-8, and the gate run again on `c821835`.**
- What it changes: on a phone, upright and on its side, the question stage is a column. The question takes what the
  lines under it leave, and those lines may take at most 30% of the stage, scrolling in place past that. On a small
  phone at 200% text the task panel gives way before the action bar does (see W7-8's handoff).
- Its new journey, `phoneSaveLineJourneys`, runs in CI's pass3-student-journeys at eleven settings: phones upright
  and on their side, 320 px, 200% text, text spacing and a Chromebook. It checks that the save line and the warning
  are seen and that the action bar is whole. Putting the old CSS back turns it red.
- Chromebook and desktop are unchanged: the default-size scenes are pixel-identical before and after.
- W7-8 changes how every assignment screen lays out on a phone, so all nine parts ran again on the merged head.
  - All nine parts passed on `c821835`, every driver on its first run:
    - the student drivers (27 in 2a, 17 in 2b, and all but one of 2c and 2w's 19);
    - wave 7's own six;
    - the 23 real-App journeys, `phoneSaveLineJourneys` among them;
    - the slow journeys, recovery hold's 450 checks among them;
    - the suites that start their own servers;
    - dark mode, the capabilities certification, and the whole accessibility part, large text included.
  - The one exception is not this release's. `secureExamNavigation` failed 2 of its checks in one cloud session three
    times in a row, on `main` before the wave as well, then passed twice there. In this container it passed warm,
    failed the same way once on a cold start, and passed on the next cold start. It is a cold-start race, recorded
    under "Found here, left for later".

### The first-load budget

| Branch, alone on `530ac3cf` | studentHome |
| --- | --- |
| base `530ac3cf` | 839.4 KB |
| W7-1 grader gaps 2 | +1.4 |
| W7-2 boxes and choices | +0.3 |
| W7-3 honest failures | +1.4 (signIn +0.8: the error words are on the entry chunk, for SessionGate) |
| W7-4 feedback reasons 2 | +0.1 |
| W7-5 read aloud 2 | +0.2 |
| W7-6 server follow-ups | +0.1 |
| W7-7 CI hygiene | +0.1 |
| **All seven and #501** (`3cba919`) | **842.7 KB** (184 files) |
| W7-8 phone save line, on `3cba919` | +0.1 to +0.3 (CSS and one wrapper) |
| **This tree, all eight and #501** (`c821835`) | **842.8 KB** (184 files) |

The limit is 847.3 KB; 4.5 KB is left. signIn is 292.6 KB (27 files) against 298.3 KB. Neither is a reduction, so
the baselines stay as wave 6 left them.

## Deploying (not done)

Nothing here is deployed.

Releases 1 and 2 (#498, #499) are in `main`, and the owner reports release 2 is live. #501 merged into `main` after
release 2 and may not be live yet; this release carries it either way. This container cannot reach the live site, so
step 1 is the owner's.

1. **What is live.** From `main`, before merging: `node scripts/release-firebase.mjs --whats-live`. Hosting and every
   function, path-admin included, should be on release 2's commit or later. If any part is older, finish release 2
   first, as `STUDENT_PASS3_RELEASE_RUNBOOK.md` says.
2. **Merge this line's PR into `main`,** so `main` stays what is live.
3. **Plan** from `main`: `node scripts/release-firebase.mjs` (it diffs against the live build). Expect:
   - Firestore rules (W7-6's deny-all `testCycleClassSittings`);
   - the whole default function fleet, in 28 groups, with `platformBuildInfo` verified first;
   - path-admin;
   - Hosting, through `npm run deploy:hosting`;
   - no indexes, and no Path content release.
4. **Execute outside class time:** `node scripts/release-firebase.mjs --execute`. It changes how a step is saved and
   applied (W7-3) and what a secure Test records on a miss (W7-6). A tab on an older build keeps the old behaviour
   until it reloads, and nothing it writes conflicts. The order inside the plan is safe: the new collection is written
   only by the Admin SDK, so functions before rules is harmless.
5. **After Hosting,** students reload.

Release with `node scripts/release-firebase.mjs` (plan, then `--execute`), never a raw `firebase deploy --only hosting`.

### What each session ships

- **Hosting only:** W7-2, W7-3, W7-5, W7-7, W7-8.
- **W7-4:** Hosting. The planner also lists functions and path-admin, because two `functions/shared` files changed; the
  server grades identically, and W7-1 and W7-6 deploy the fleet anyway.
- **W7-1:** the whole default codebase (the shared graders reach every surface), path-admin, Hosting.
- **W7-6:** Firestore rules (the deny-all `testCycleClassSittings`), the whole default codebase, path-admin, Hosting.
  Nothing is backfilled: a Test response names a mistake only when graded after the deploy, and sittings are recorded
  from the deploy on.
- **#501** (already in `main`): functions and Hosting, if not deployed yet.

## Decisions waiting for the owner

Each handoff lists its own, in full. Grouped here:

**Grading**
1. A mixed number is accepted for a number key (W7-1 1, recommended and built). Follow-ups: the secure number hint's
   words; Path's SAT boxes and secure tests do not yet decline 3½ at entry.
2. A lowest-terms fraction question refuses 3½ and says why (W7-1 2). Should a mixed number in lowest terms count?
3. Should a key written as a mixed number ask for a mixed number (W7-1 3)?
4. Mixed numbers inside expressions, intervals, sets and pairs stay refused (W7-1 4, its table).
5. Ten Algebra I fields re-asked without a version move at `dc2ae1ad` (W7-1 5).
6. Run the two read-only counts; re-grade up only (W7-1 6, D8).
7. Point-slope through another point of the same line is graded wrong (found in W7-6's review; older than pass 3).

**What a student is told**
8. A slip the device could not save is not announced (W7-3 1).
9. A checked intercept's step credit that could not be queued is not announced (W7-3 3).
10. The account-load fallback's words (W7-3 4).
11. Device-full is not kept across a reload (W7-3 5).
12. "extra time" only after the class's own end (W7-3 6, decided by the integrator). Say it from the start?
13. A server sentence that comes with an "unreachable" code shows no Try again unless the server allows it (W7-3 7).
14. How much a step's reason may say, tool coaching staying English, and a nested number line's label (W7-4 1–3).

**Read aloud**
15. The generic "Let's back up" step is gone from 96 of 248 items (W7-5 1): Matrix Lab, Systems Workspace and plain
    multi-answer items with no family. An inclusion student there goes straight to the next try, with the hints and
    miss messages the platform already gives. Writing steps for those types (an authored `scaffold`, or a family that
    reads their structure) would give them one back.
16. A figure is read in English even under an authored Spanish translation (W7-5 2). The reader's own words are
    Spanish ("Una tabla", "Fila", "en blanco").
17. A composed graph is named by its step's label (W7-5 3), so a DOL item reads "State the domain. x from …" before
    "Step 1 of 2: State the domain." Renaming it is WorkflowRunner's call.

**Test Cycle**
18. Should a recorded sitting ever mark absent students missed: (a) evidence, (b) the teacher decides, (c) any sitting
    (W7-6 1; shipped record-only).
19. A Retest's recorded mistakes have no reader (W7-6 2).
20. Sittings are never cleaned up (W7-6 3).
21. While classmates still test, "the mistake to watch for" with a student's own released answer gives that student
    their own correct answer, never a classmate's (W7-6, review note).

**CI**
22. *Decided by the integrator (W7-7's review):* the two long emulator journeys run on pull requests that touch what
    they load, nightly and on demand, not on every pull request. Runner minutes are in W7-7's handoff.
23. Who watches the nightly? GitHub mails a scheduled run's failure only to whoever last edited its schedule line
    (W7-7's re-review).
24. In a championship game, the projector shows the round table and "championship points" only after Hide solution: a
    ready worked solution takes the table's place, by design (W7-7 2h). Should the table stay in view beside it?
25. The teacher harness's `p3StartMin` stays 0, and the bank count does not see Firestore-only teacher items (W7-7 2
    and 3).

**Phones (W7-8)**
26. The lines under the question take their height from a phone's work area while they show (W7-8 1, its table).
    - With "Draft saved." a 390×844 phone keeps 471 of its 498 px; with the backup notice, 407.
    - At 200% text on a small phone no work area is left while a line shows. The task panel scrolls and the bar stays
      whole. At 320×568 the task panel is a 59 px window with its heading cut in half, and the task needs a scroll
      inside it. Minimize does not help at 200%, the same as on the base.
    - The lines may take at most 30% of the stage.
    - *An option the integrator adds:* on a phone, show only the lines that need the student, not the routine "Draft
      saved.". That would give the room back most of the time.
27. The save line itself costs 27 px of phone work area (W7-8 5).
28. On its side at 200% text, one line of the warning is in view and the rest scrolls in place (W7-8 6).
29. With the screen keyboard open, the focused field shows less on a tall phone: 11 of 70 px, against 38 on the base,
    at 390×480 (W7-8 7). Worth its own item.
30. The status area has no tab stop of its own, and the things above the question are not capped (W7-8 2 and 3).

## Found here, left for later

- **Error text a student reads (after W7-3).**
  - MyMathPath's submission error still appends the raw `${caught.message}` (older than this wave). It belongs in
    `studentErrorSentence`.
  - The Live Challenge lobby shows the raw "permission-denied: …" text when a join is refused (older; W7-7's review).
  - A server error coded internal, unavailable or aborted offers Try again unless the server sends `retry: false`. No
    server path sends those codes with a sentence today.
  - The SDK's own "Data cannot be decoded from JSON" error passes as a sentence (older).
- **Grading (W7-1).**
  - MathLive turns a typed `3 1/2` into `\frac{31}{2}`.
  - A system keyed `{x, y}` cannot be answered.
  - `1+2` is accepted for 3, on the base too.
  - Mixed numbers, the edges its reviewer named:
    - an "or" bound is not read as one value;
    - `3.5` against `7/2` in chained bounds;
    - an improper mixed side in an equation keeps the 3·5/2 reading;
    - the surfaces' tolerances (1e-6 and 1e-9) can now give different verdicts;
    - `inputContract.format` alone does not make a number box;
    - a Digital SAT box gives no entry line when its own key is a mixed number.
- **Read aloud (W7-5, W7-2).**
  - Tables a tool draws itself are not read: Sequence Explorer, Representation Match, Data Modeling, the Regression
    Calculator and the Linear Multiple Representations board. Their planes are.
  - A closed question's inequality region does not read its corners.
  - MathText's hidden formula speech stays English inside a Spanish translation.
  - A filled math box's content is not read when it takes focus, on the base too (W7-2's review). Its spoken content
    could go in `aria-description`.
- **Layout (W7-7, from a screenshot).**
  - On a phone, the Path stimulus with a vertical boundary: "Open Work View" covers the stimulus title, the placeholder
    is cut off, and the "−1" and "0" ticks touch.
  - The stimulus still cannot shade beside a vertical boundary. That is a feature (Batch 1/2), not a test gap.
- **CI (W7-7).** graphFeatureRushGame stays out of CI.
- **Phones (W7-8).** In the completed-section scene, the phone's "Open Work View" button overlaps the heading of the
  "could not be displayed" card (the base too).
- **Secure tests (found by the gate; older than wave 7).** `secureExamNavigation` sometimes fails "Escape inside the
  list closes it" on a Chromebook, just after its test server builds its cache cold. In the failing runs the
  question list is open but the answer box has keyboard focus, so Escape goes to the box.
  - It fails the same way on `main` before the wave.
  - It passes with a warm server, and passed in the run on `3cba919`. Here it failed once on a cold start and passed
    on the next.
  - Not settled: whether a student on a slow first load can hit it (focus moving to the answer box after the list has
    opened).
  - Two fixes are possible. The driver could wait for focus inside the list before pressing Escape. Or the answer box
    could stop taking focus once the student has moved it somewhere else.
- **The calculator setting's driver (found by CI on #502; older than wave 7).** `assignmentGraphingCalculator`'s
  closed-question check clicks the page as soon as the calculator has closed, then presses Enter. `close()` hands
  focus back to the work bar's control on the next frame. When that frame lands after the click, Enter presses the
  control and the calculator opens again: "closed question: the calculator does not reopen" (`student-runtime` on
  `9115c49`).
  - The driver, the panel and the CI step are on `main`, unchanged here. `4f1dbb7` (release 2) fixed the same race in
    the driver's other two Close checks; this one was missed.
  - A student cannot hit it: it needs a click within one frame of Close.
  - The fix is the wait `4f1dbb7` added, for the focus to reach the control before the click (the patch is in a
    comment on #502). A hand-back that lands after the click reproduces CI's failure with the old driver. The patched
    driver passes, and still fails when Enter really brings the calculator back.
