# Student pass 3 — wave 6 on the integration branch (2026-10-18)

`claude/modest-pasteur-xzagn7` moves from `3cb782a` to this merge. It holds wave 6: seven sessions. One of them, W6-5,
merges Batch 3 and main's thousands separators into the pass-3 line.

Each session's handoff holds the detail. This note covers:
- what the reviews and the merge changed;
- how the merged tree was checked;
- how it ships.

**This branch is release 2 of W5-5's two releases, and it ships after Batch 3. Read
[Deploying](#deploying-not-done) before releasing anything from it.**

## What merged

| Session | Branch | Merged at | Handoff |
| --- | --- | --- | --- |
| W6-6 · grader gaps: negative exponents, refused spellings, exact radical pairs | `claude/pass3-grader-gaps` | `639ec6a` | [STUDENT_PASS3_GRADER_GAPS.md](STUDENT_PASS3_GRADER_GAPS.md) |
| W6-3 · hints that fit (HELP-16, HELP-23, TOOL-5) | `claude/pass3-hints-that-fit` | `21d5cfd` | [STUDENT_PASS3_HINTS_THAT_FIT.md](STUDENT_PASS3_HINTS_THAT_FIT.md) |
| W6-5 · Batch 3 into pass 3 | `claude/pass3-batch3-into-pass3` | `85abaee` | [STUDENT_PASS3_BATCH3_INTO_PASS3.md](STUDENT_PASS3_BATCH3_INTO_PASS3.md) |
| W6-4 · tool directions on assessments, the graphing calculator's reasons | `claude/pass3-tool-directions` | `b22f16b` | [STUDENT_PASS3_TOOL_DIRECTIONS.md](STUDENT_PASS3_TOOL_DIRECTIONS.md) |
| W6-7 · first load 2: teacher-only code off the student's first load | `claude/pass3-first-load-2` | `d693fe8` | [STUDENT_PASS3_FIRST_LOAD_2.md](STUDENT_PASS3_FIRST_LOAD_2.md) |
| W6-1 · one student word list (D9, NAV-16/17/18/26, HELP-17/24/25) | `claude/pass3-student-words` | `fc4e116` | [STUDENT_PASS3_STUDENT_WORDS.md](STUDENT_PASS3_STUDENT_WORDS.md) |
| W6-2 · getting around, part 2 (NAV-19 … NAV-25, TOOL-13) | `claude/pass3-getting-around-2` | `1f4f1ec` | [STUDENT_PASS3_GETTING_AROUND_2.md](STUDENT_PASS3_GETTING_AROUND_2.md) |

They merged in that order.
- Each had an independent review and merged after its reviewer's last look found nothing blocking.
- Each merged the base `3cb782a` on its own branch first, except W6-7, which started from it.
- W6-2 also merged W6-5.
- Nothing was rebased.

## What the reviews changed

Every branch changed after its review. These are the fixes a student or the owner would notice; each handoff has
the full list.

- **W6-6:**
  - an ASCII negative power in a denominator (`3/x^-2`) was newly refused, and is right again;
  - mixed numbers and unworked arithmetic in an ordered pair (`(1\frac{1}{2},4)`, `(1+2,4)`) were newly accepted on Path
    and secure tests, and are wrong again;
  - the quadratic-formula family was unanswerable on about a quarter of its draws. Its key is rewritten, and the old
    spelling stays accepted, so no re-grade can lower a verdict. The Path release was rebuilt for it.
- **W6-3:**
  - the new hint guard's "quoted from the problem" exception let through hints that state an answer: substring
    matches, an English "a" read as a variable, a glued minus, and an empty match list read as safe. It now compares
    whole tokens and fails closed;
  - moving the solvers' "Need a strategic hint?" onto the ladder had put it out of reach on real practice items. It is
    now a standing rung, open from the start, which takes no other hint's place;
  - the assessment leak gate now also catches a bare method line.
- **W6-5:**
  - a Digital SAT box accepts `1,280` for 1280, as live does (decision 1, below), so no release turns a right answer
    wrong;
  - Path list and set fields keep `1,250` as two values: the stored private grading now keeps the field's kind;
  - Batch 3's "Some work needs attention" no longer outlives the problem;
  - the release order gained its last step.
- **W6-4:**
  - the session found that Data Modeling's error readouts (RMSE · MAE beside each candidate model, and the live MAE ·
    RMSE) nearly answered "Select the best model" on a test. They are now withheld wherever verdicts are;
  - the Representation Bridge's screen-reader names no longer say the withheld "c is the zero";
  - the inequality builder's plotting sentence stays on assessments because its grader requires that route (decision
    below).
- **W6-7:** moving the support-evidence store off the first load dropped evidence written offline or after a deploy:
  Chromium caches a failed dynamic import per URL, and the base queued those writes durably. That move was reverted.
  The rest, 16.7 KB, stands.
- **W6-2:**
  - the Live Challenge lobby invite showed on an open exit ticket, quiz or test, with a button that left it. It is now
    held for the whole open section;
  - "Finish up — your work is saved." showed while work was not saved. The pack-up line now reads Batch 3's save status,
    the same one Home uses;
  - a closed question's Work View no longer shows a live-looking Check;
  - notices no longer show over Home on a cold load;
  - the Spotlight request is not spoken during a secure exam;
  - Export PDF moved to the result page instead of being lost for finished work;
  - a lazy split of the pack-up line and the lobby invite was reverted: a safety notice must not depend on a chunk
    that can fail to load offline.
- **W6-1:**
  - "Closed — no credit" sat beside a real grade. The state is now "Closed", and "no credit" is on trying it again;
  - a Recovery runner's tool box said "Hints never lower your score" against Recovery's own rule;
  - Ask My Teacher lost an exit ticket's place on the teacher's side;
  - two drivers still read the old held-feedback line.

## What the merge changed

- **Conflicts.**
  - W6-1 with W6-2:
    - App.jsx's sticky "←": W6-2's line, which adds `title=` to the same label;
    - StudentDashboardView.jsx's imports: both sides plus W6-2's `whenDateTimeText`, without `formatDateTime`,
      which nothing uses after the merge;
    - lessonSections.js's imports: both.
  - W6-7 and W6-1 both changed App.jsx's import block. Once W6-7 reverted its support-evidence import to the base's,
    they merged with no conflict.
- **Semantic.**
  - The pack-up line reads W6-5's save status, so it can no longer say "saved" while Batch 3's alert stands. That was
    done on W6-2's branch, which merged W6-5.
  - `09b1fdd`: W6-2's detour toast and Live Challenge exit labels now use W6-1's words (`EXIT_TICKET_SPELLED_OUT`
    for the toast's title, `exitTicketInSentence` in its sentence, `BACK_TO_HOME`).
  - `a93eeb0` corrects W6-7's loader comment: a failed teacher-kit load is recovered by a reload, not a retry.
- **The Path release.** W6-6 rebuilt it as `course-path-v2-01d45bb15d913284`. No other branch touches the release files.
- **The first-load baseline** is lowered after W6-7's deliberate reduction (below).

## Checks

| Check | On | Result |
| --- | --- | --- |
| `npm run test:platform` | `09b1fdd` (all seven merged) | 11,962 of 11,962 |
| `node --test tests/tools/*.test.mjs` | `09b1fdd` | 1,710 of 1,710 |
| `npm run lint` | `09b1fdd` | exit 0 (warnings only) |
| `npm run build` · `npm run build:firebase` | `09b1fdd` | pass; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` · `firstLoadBudget` and `firstLoadTeacherCode` tests | `c9a8c31` | pass: studentHome 839.3 KB, signIn 291.9 KB (see below) · 18 of 18 |
| The same unit checks on the way: three branches (`1bfe8bc`), four (`31fd190`), six (`8914799`) | each | all pass: 11,877 · 11,893 · 11,927 platform tests; studentHome 852.3 · 852.4 · 836.6 KB |
| The grader suites (pass3GraderGaps, every `*Equivalence*`, stackDivisions, secureMathAnswerRoundTrip, orderedPairSemanticGrading and the thousands tests, 21 files) · `release:path:verify` | `0bd2f3b` (W6-6 merged) | 136 of 136 · the committed release manifest matches the course content |
| The hint suites (hintsThatFit, toolHintPolicy and the rest) | `c1495c2` (W6-3 merged) | 59 of 59 |
| The grading sweep (`scripts/sweep-equivalence-verdicts.mjs --base 3cb782a --draws 3 --check-wrong`) | `c9a8c31` | exit 0. 9,833 fields and 281,133 verdicts: 0 right → wrong, 0 near miss → right, 0 near miss refused, 0 stacked wrong accepted, 0 editor or gap spellings refused, 0 gap wrong accepted (the base refuses 3,358 gap spellings and accepts 30 gap wrong answers). 60 right answers newly accepted: W6-6's 20 spellings on the three graders, each checked equal by its reviewer. These are W6-6's own numbers on its branch, so nothing else in the wave moves a sweep verdict. The corpus has no grouped spellings; W6-5's four-tree thousands probe covers those |
| The emulator suites: `test:rules` (both runners), `test:challenge-finish`, `test:canonical-persistence`, `test:test-cycle-certification`, `test:secure-exam-navigation`, `test:grade-authority`, `test:secure-exam-auto-finalize` (Batch 3's finalizer) | `c9a8c31` | 248 and 221 · 477 · 35 · 38 · 25 · 14 · 11, all pass |
| The rest of the full-platform suite: six emulator suites (Classroom regrade report, identity repair, Live Challenge launch, path choice report, path release, Warm-Up reopen) and the audits (answer acceptance, path release verify, authoring boundary, legacy source, authoring v5 and its validation, release authority, challenge DOK and quality, fidelity seeds) | `c9a8c31` | all pass; no tracked file rewritten |
| The browser gate: student drivers (2a, 2b, 2c), waves 5 and 6's own drivers (2w, now with hintsThatFit, submitNotQueued, studentHomeToday and pathRetention), the real-App journeys (3a, 3b), the slow journeys (3c, 6a, 6b), the self-starting suites (7a, 7b, and 7c: testCycleRichToolQa and liveChallengeShellQa), dark mode and capabilities (4), accessibility (5) | the pushed head | running after the push, in eight cloud sessions (below) |

Each session's own gate is in its handoff. Every branch also ran its own browser drivers on its merged head, and its
reviewer reran the ones in its area.

### The first-load budget

Without W6-7, the six other branches came to 855.8 KB against an 855.1 KB limit. The growth was real student
work: Batch 3's draft safety, the getting-around changes, the grader and the word list. W6-7 took teacher-only code
off the student's first load: the teacher kit (needs-attention, the Action Center, publishing, worksheets), question
alignment and the authoring states.

| Branch, alone on `3cb782a` | studentHome |
| --- | --- |
| base `3cb782a` | 847.1 KB |
| W6-6 grader gaps | +0.9 (the exact-value pair check; Check needs it synchronously) |
| W6-3 hints that fit | +0.1 |
| W6-5 Batch 3 into pass 3 | +4.2 (Batch 3's draft merging and save health) |
| W6-4 tool directions | 0 |
| W6-7 first load 2 | −16.7 |
| W6-2 getting around 2 (with W6-5) | +2.5 |
| W6-1 student words | +0.9 (the word list is on the entry chunk, so sign-in +0.6) |
| **This tree, all seven** (`09b1fdd`) | **839.2 KB** (184 files) |

Combined, the seven are 839.2 KB: 7.9 KB under the old baseline. W6-7's reduction is deliberate, so `c9a8c31` lowers
the baseline as the ratchet's rule says:

| Path | Baseline before | Measured (`npm run build`, this tree) | Baseline now | Limit (+8 KB) |
| --- | --- | --- | --- | --- |
| studentHome | 847.1 KB (867,397 B), 186 files | 839.3 KB, 184 files | 839.3 KB (859,470 B) | 847.3 KB |
| signIn | 290.3 KB (297,277 B), 27 files | 291.9 KB, 27 files | unchanged | 298.3 KB |

signIn keeps its baseline: it grew by 1.6 KB (W6-1's word list is on the entry chunk), inside its allowance, and
that is not a reduction. `--write-baseline` would have raised it.

## Deploying (not done)

Nothing here is deployed.

### The order

W6-5's handoff ([section 6](STUDENT_PASS3_BATCH3_INTO_PASS3.md#6-the-release-order)) has the commands. W6-6 adds a last
step.

0. **Batch 3 from main** (PR #497, head `7bb74f8`), as [STUDENT_PASS3_BATCH3_RELEASE.md](STUDENT_PASS3_BATCH3_RELEASE.md)
   says.
   - *Optional, before merging #497:* `8c4c18d` fixes a false alarm in Batch 3. "Your work is not being saved…" stays
     after a failed save has been followed by New problem, Start over or a submit.
   - It cherry-picks cleanly onto `7bb74f8`, and the platform suite passes there (11,381 of 11,381).
   - Without it the alarm errs toward caution and loses nothing.
1. **W5-5's step 0**: the owner's read-only count (its decision 7).
2. **Release 1: the step key on main with Batch 3.** That is main once #497 is merged, plus one commit holding only the
   three key hunks, put on main first.
3. **Wait** until `--whats-live` shows every function on release 1's commit, path-admin included. Then wait 10 to 15
   minutes more.
4. **Release 2: this branch**, planned with `node scripts/release-firebase.mjs --since <release 1's commit>`, then
   `--execute`. It deploys:
   - Firestore rules (pass 3's);
   - the whole default fleet, including Batch 3's new scheduled `finalizeAbandonedSecureExams` and every function
     that loads the shared graders;
   - path-admin;
   - Hosting.

   No indexes.
5. **After Hosting:** a root admin publishes the Path release `course-path-v2-01d45bb15d913284` (Administration → My
   Math Path content coverage). It needs no new code: `{{p|xterm}}` is already in the live generator.
6. Ask teachers to have students reload after each Hosting release.
7. **After release 2 the live build is a pass-3 commit that is not on main.** Until this branch is merged to main,
   release only from it. A hotfix goes here.

Release with `node scripts/release-firebase.mjs` (plan, then `--execute`), never a raw `firebase deploy --only hosting`.

### What each session ships

- **Hosting only:** W6-1, W6-2, W6-3, W6-4 and W6-7.
- **W6-5:**
  - Firestore rules (pass 3's, not from this merge);
  - the default functions, including `finalizeAbandonedSecureExams`;
  - path-admin;
  - Hosting.
- **W6-6:**
  - the whole default codebase (the shared graders reach every surface);
  - path-admin;
  - Hosting;
  - the Path content release.

## Decisions waiting for the owner

Each handoff lists its own, in full. Grouped here:

**Grading**
1. Digital SAT boxes accept `1,280` as live does (W6-5 1; the integrator decided this after the review). If the SAT's
   own no-comma rule is wanted, it belongs at entry, never as a right value graded wrong.
2. `1, 250` (comma and space) is no longer one number in assignments, as on main (W6-5 2). Pass 3 had accepted it
   since batch 2; it was never live.
3. The ASCII `B^(E)/N` reading, `e^(-x)/2` against `e^{-x}/2` (W6-6 1). This includes the one verdict W6-6 lowers:
   `10^-3/2` against a braced `10^{-3}/2`, now graded as it is drawn. No authored key has the shape.
4. Decimals stay refused for an exact radical pair (W6-6 2).
5. Five families whose generator text refuses a simplified answer: fix the content (W6-6 3, recommended).

**What an assessment shows**
6. A sentence that names a route is shown on an assessment only when the grader requires that route, and then it says
   what will be checked (W6-4, review S2/N2). This covers the inequality builder's slope-intercept sentence, Graphing 2's
   anchor note and the Bridge's x-intercept line.
7. W6-4's control/method splits, the kept banners, the Bridge's highlight buttons as method, and the graphing
   calculator's "undefined" wording (W6-4 1–5).
8. A closed question opens in Work View to review on every activity, assessments included, inert (W6-2 4; Q-97 is
   still open).

**Hints**
9. Hidden-hint panel advisory; table cells count as answers; 28 hidden hints to reword; the ladder order with the
   solver's standing rung; the Spanish review (W6-3 1–5).
10. "Hints never lower your score": true of the grade, but hints weigh against Mastered and a CCMR session pass. Say
    "grade"? (W6-1 5)

**Words and getting around**
11. Rename "DOL Recovery"? (W6-1 1)
12. What "reopened" means (W6-1 2).
13. Closed work's words (W6-1 3).
14. A past-date Test Cycle (W6-1 6).
15. Export PDF on the result page (W6-2 1).
16. Grades' "← Home" removed (W6-2 2).
17. Nav destinations stay buttons (W6-2 3).
18. A quieter pack-up line (W6-2 5).
19. The game's exit returns to where the student joined (W6-2 6).

**Release**
20. The order above; whether to fold Batch 3 into release 1 (W6-5 3); the optional `8c4c18d` for #497.

## Found here, left for later

- **Hints (W6-3).**
  - Reword A2.7C's hint "Divide leading terms first: −5x^3 ÷ x^2 gives the first quotient term" for the author: it is
    one mental step from the "x coefficient of quotient" field. Suggested: "Divide the leading term of the dividend by
    the leading term of the divisor." It is practice-only and not a leak.
  - The base guard's value gaps, unchanged: `0.5` vs `1/2`, `4 / 3` with spaces, a sign after `)`, `4/2` vs 2.
  - 22 of 8,939 bank intents fail to compile.
- **Grading (W6-6).**
  - The sweep builds right spellings from the current key, so it never tries an old key's spelling. Add the old key
    whenever a family's key text changes without a version move.
  - A typed `3\frac{1}{2}` reads as 3·½ in a plain number field (older than this wave).
- **Batch 3 (W6-5).**
  - A Step Algebra step, and a replacement the device cannot queue, still use toasts (App.jsx ~7400, ~7497).
  - The draft-save problem registry is in memory and per tab.
  - toolDraftSyncSweep's `[expressionMeaning]` click timeout is pre-existing.
  - submitNotQueued is in no workflow.
- **Tools (W6-4).** testCycleRichToolQa's two "questionInstanceId" findings on chromebook and ipad, the same on the base.
- **Getting around (W6-2).**
  - Graphing 2's practice rail has 8 actions at 740×360, with no spare row: a ninth will clip.
  - Dates follow the device's time zone, as before.
  - A queued arrival notice is not cleared if the workspace never commits.
  - In dev, a notice can show 2–3 times at once (React StrictMode). Check once on a production build.
- **Words (W6-1).**
  - Worksheet PDF titles still say "DOL".
  - At 390×844 the tool outcome box with both offers ends 4 px above the action bar, and the phone work area cannot
    scroll it above the bar.
  - An expired extension is still listed "now due <past date>".
- **First load (W6-7).**
  - studentSupportSignals and the two teacher stylesheets stay on the student's first load.
  - pathToolContracts is the best next lead.
  - certify:accessibility cannot reach secure-exam/start in some containers, on base and branch alike.
