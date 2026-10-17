# Student pass 3 — Live Challenge rounds (Q-23, Q-58)

Branch `claude/pass3-live-challenge-rounds`, from `claude/modest-pasteur-xzagn7`
at `6accda1`. Evidence: `docs/qa/student-experience-pass-3/06-open-items-qa-docs.md`
rows Q-23 and Q-58, and `docs/architecture/live-challenge-shell.md` §14. Nothing
was deployed. Every test ran against the emulators only.

**Revision 3** addresses the integrator's round-2 review of `bc78055` (see
"Round-2 review of bc78055" at the end). **Revision 2** addresses the
integrator's review of `777b952`. It adds a kill
switch, makes ending abandoned games off by default, refuses to end a game
whose host was never heard or that writes a grade, gives a safe deploy and
rollback order, and adds the tests the review asked for (see "Review of
777b952" at the end).

Both items reproduced on the base before the change. I ran the new emulator
suite against the base `functions/index.js`: every positive case failed, and
only the negative cases passed. Nothing on the base closes an overdue round,
and nothing invites a student added after create.

## Q-23 (P2): an overdue round with no host screen open never closed

**What a student saw.** The teacher's console closes a round 1.5 s after its
deadline. If the console was gone (laptop asleep, tab closed), nothing closed
the round. The class sat on "Time is up! The results are coming." until the
teacher came back. If the teacher never came back, the game never finished.

**What changed.**

- **New scheduled function `closeOverdueLiveChallengeRounds`.** It runs every
  minute with `invoker: "private"`, `maxInstances: 1` and
  `timeoutSeconds: 300`. Its rules live in
  `functions/shared/liveChallengeServerSweep.mjs` (pure, unit-tested) and are
  applied by `sweepLiveChallengeRoom` in `functions/index.js`.
- **The switch.** `platformFlags/liveChallengeServerSweep` is read on every
  run. The rules already make `platformFlags` server-written only, and a rules
  test now covers this document. It has two fields:
  - `enabled` (default **true** when the field is absent). It fails
    **closed**: any value but the boolean `true` (`false`, `"false"`, `0`,
    `null`, `"off"`) turns the run off, with no query and no writes, and the
    run logs `liveChallenge.serverSweep.disabled`. This is a rollback's first
    step. The Firebase console's Add-field dialog defaults to a string, and a
    string still takes.
  - `finishAbandonedGames` (default **false**; only a real `true` turns it on).
    Ending abandoned games is the owner's decision (decision 1). It is read at
    the start of each run **and again inside each finish's transaction**, so
    a flip during a run (up to 300 s) is honoured by the very next finish.
- **Closing an overdue round** (on by default; this is the student-facing
  fix). An open round 10 s past its deadline (`SERVER_CLOSE_GRACE_MS`) is
  closed by **the console's own close**. `closeLiveChallengeRound`'s
  transaction body is now `closeLiveChallengeRoundForRoom`, and the callable
  and the sweep both call it. The sweep never forces the close, so a student
  with extended time is still waited for: the close is refused and the round
  is re-checked 30 s later.
- **Ending abandoned results** (only with `finishAbandonedGames: true`).
  Results that have stood 30 minutes (`HOST_AWAY_FINISH_MS`) with no host
  screen heard for as long are ended by **the console's own Finish**
  (`finalizeLiveChallengeMatch`, End Game semantics). Never, whatever the
  switch says, for:
  - a room whose host the server never heard (no `hostHeardAt`: its console,
    or the calibration code, is older than the sweep);
  - a game that writes a grade (`assignmentId`: a Warm-Up's result *is* the
    student's Warm-Up grade and enters the section grade Classroom receives).

  Those results stay with the teacher, as today, and the room is not looked at
  again. The finish re-checks all of this (round version, heartbeat, switch)
  inside its transaction, at the real now (`stillWanted` → `stillAbandoned`).
  The room records `endedBy: "hostAway"`. The public room carries it, so
  invited students can read it, and no client can write it.
- **Host heartbeat.** The console already calls `calibrateLiveChallengeClock`
  every 30 s while its game is live. A teacher's call for their own room
  records `hostHeardAt` on the server-only private state.
  - It writes at most once a minute per room and instance. The memo lets go
    after the minute, and a test covers that.
  - The clock estimate (a median of five samples) is unaffected.
  - It never fails the calibration, and it works with the deployed console.
- **Idempotency.** Every decision is re-checked in the command's own
  transaction:
  - A console close and the sweep's close: exactly one closes the round.
  - Two runs, or a retry: one finish.
  - A Next Round or a heartbeat landing between the sweep's decision and its
    transaction: no finish.
- **Cost.** The sweep reads only rooms whose private state is due
  (`serverSweepDueAt`, set at round open, at close and when a closing
  threshold shortens a round; cleared at the finish).
  - The query is one single-field range with `orderBy`, `.select()` of the two
    fields it reads, and `limit(25)`: **no composite index**, and nothing a
    student listens to.
  - Idle cost is about 43k reads and 43k invocations a month, plus one Cloud
    Scheduler job, plus the switch read (one more read a minute).
  - A transient close or finish failure is retried after 5 minutes. A room
    whose due time cannot even be moved backs off 15 minutes, as a
    compare-and-set against the version this run's query read, so a fresh due
    time an opening just set is never overwritten; the run reports that room
    as `backedOff`.
- **What a student sees.** Results arrive within about 70 s at worst instead
  of whenever the teacher returns. With the finish off (the default), the
  results then wait for the teacher, as today. With a console open nothing
  changes: it closes at 1.5 s.
- Rooms already running at deploy carry no due time and are never swept until
  their next round opens under the new code.

**Proof** (`tests/integration/liveChallengeServerSweep.test.mjs`, in
`test:challenge-finish`; the suite backdates its rooms into 2000 and runs the
sweep with `scheduleTime` in 2001, so no parallel suite's room is ever due in
it):

- a round opening sets due = deadline + grace;
- an overdue round with no client open is closed, with results, standings and
  the next due;
- a run on results a moment old changes nothing;
- abandoned results with two overlapping runs end in one finish, with ranks
  equal to the results seen, every effect done (rewards included) and the
  pointer released;
- a console close racing two sweeps produces exactly one fresh close;
- a host heard keeps the game;
- another teacher's calibration is not the host;
- the suite and the functions share one Firestore (asserted), so a gate on the
  next transaction makes both races deterministic:
  - **a Next Round between the decision and the transaction is played**;
  - **a heartbeat between them keeps the game**;
- the heartbeat memo releases after a minute;
- **unheard results and Warm-Up results are left to the teacher**;
- **the switch**: with no document, closing is on and ending is off;
  `enabled: "false"` (a string) scans and writes nothing; **a switch flipped
  off between the sweep's decision and its finish transaction stops that
  finish** (gated);
- a finished game is dropped from the sweep without being touched.

Unit and wiring tests are in `tests/platform/liveChallengeServerSweep.test.mjs`
(11 tests; the switch's fail-closed values are among them). Rules are in `tests/rules/liveChallengeServerSweepRules.test.mjs`:
no teacher, root admin, student or anonymous user can read `liveChallengePrivate`,
run the sweep's range query, forge a heartbeat or move a due time; the switch
is readable when signed in and writable by no client.

## Q-58 (P3): a student added to the class mid-game was not invited

**Design check.** The existing design allows a late join (§10): `joinedAtRound`,
Grand Prix field size per round, and standings that ignore `eligibleCount`. So
a late joiner distorts neither scoring nor ranks, and I built it.

**What changed.** `inviteStudentToClassLiveChallenge` runs after
`setStudentClass` and `assignStudentToTeacher` (in both, **after** the admin
audit) and after `createStudentAccount`'s commit. Through the teacher's
active-room pointer, in one transaction, it acts only for a room that is:

- in its lobby or running;
- **active in the last 12 hours**, measured from the latest of its creation,
  last change, round start and round close: a lobby left open since yesterday
  invites nobody, but a game created last night and started this morning is
  today's;
- in the student's class, by `loadChallengeRoster`'s membership rule.

For such a room it writes the next seat and code name, an invite (`running`
or `invited`), and `eligibleCount + 1`. An invite to another live room is
never overwritten, and the roster change itself never fails.

The console now re-reads names when the room's invited count changes
(`LiveChallengeTeacher.jsx`, `invitedCount` in the roster effect's deps). A
late joiner is named, and counted as not joined, at once. **This is the one
client change, and it needs Hosting.**

**Proof** (emulator):

- running game: invited `running`, seat 2, unique code name, joins at round 1,
  and is in the result;
- lobby: invited, start moves the invite, adding twice is idempotent;
- another live game is kept;
- no game means no invite;
- **a teacher's other class: not pulled into this class's game**;
- **a stale lobby: no invite**;
- **a game created 13 h ago and started now: invited `running`**.

Wiring for the three hooks and for the roster deps is covered by the unit and
shell-wiring tests.

## Mutation checks (every new assertion; each applied alone and restored)

| Mutation | Went red |
| --- | --- |
| Late invite ignores class membership (review M3) | emulator "a teacher's other class" |
| Heartbeat memo never releases (review M5) | emulator "heartbeat refreshed", "host still heard", both gated races |
| Re-check fed a wrong now (review M2a) | emulator "console heard after the decision" |
| Re-check removed | emulator gated Next Round and heartbeat races; unit wiring |
| Finish without a recorded heartbeat / for a Warm-Up | emulator "left to the teacher"; unit 2 (and 7) |
| Switch `enabled` ignored / finish on by default / truthy switch | emulator "the switch"; unit 1 and 9 |
| Plan or re-check ignores `finishAllowed` | unit 2 / unit 7 |
| Window back to 10 min | unit 1 |
| `maxInstances` / `.select()` / the "off does nothing" return removed | unit 9 |
| Stale-lobby bound removed | emulator "stale lobby" |
| Rules: `liveChallengePrivate` readable by teachers / `platformFlags` writable by root | rules suite tests 1 / 2 |
| Console roster deps without `invitedCount` | shell wiring |
| Switch fails open again (`!== false`) (round 2, fix 1) | emulator "the switch"; unit 1 |
| Switch not re-read in the finish transaction (fix 2) | emulator "switch turned off while a run is under way"; unit 9 |
| Invite bound from `createdAt` only / removed (fix 3) | emulator "created last night, started this morning" / "stale lobby" |
| The disabled run's log line removed | unit 9 |
| Earlier: heartbeat ignored, CLEAR no-op, other live invite overwritten, heartbeat ownership, `eligibleCount` not bumped, close not idempotent, close sets no due, hook removed, grace and paused boundaries, heartbeat interval | as in revision 1 |

## Gate (at the head this report names)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11437 / 11437 pass |
| `npm run lint` | exit 0; 468 warnings, the same count as the base (none new) |
| `npm run build` | pass |
| `npm run build:firebase` | pass; no tracked file rewritten |
| `npm run test:rules` | pass (243/243; 211/211 node rules tests, incl. the new suite) |
| `npm run test:challenge-finish` (all of `tests/integration/*.test.mjs`) | GATE_FINISH |
| `npm run test:live-challenge-launch:emulator` | 10 / 10 pass |
| `test:live-challenge-teaching-browser` (alone) | 58 / 58 checks |
| `test:live-challenge-projector-privacy-browser` (alone) | 86 checks, no findings |
| `tests/browser/liveChallengeChoiceKeyboard.mjs` (alone, with the a11y workflow's two Vite servers) | pass at both viewports |

## Deploy — targets, order, rollback

No index. No rules change (`platformFlags` and `liveChallengePrivate` are
already server-only). **Release by exact name, in this order, each step after
the previous one has shipped:**

1. `calibrateLiveChallengeClock` first, alone. The heartbeat must be live
   before anything can act on it.
2. The callables:
   - `closeLiveChallengeRound`, `advanceLiveChallenge`, `startLiveChallenge`
   - `finishLiveChallenge`, `cancelLiveChallenge`
   - `submitLiveChallengeResponse`, `updateLiveChallengePacing`
   - `setStudentClass`, `createStudentAccount`, `assignStudentToTeacher`
3. `platformBuildInfo`, then verify it reports the new commit, then
   `node scripts/verify-callable-access.mjs --fix`.
4. `closeOverdueLiveChallengeRounds` **last and alone** (new; creates the
   Cloud Scheduler job).
5. Hosting through `npm run deploy:hosting`, for the console's roster re-read
   only. It is independent of steps 1–4.

`release-firebase.mjs` passed names keeps list order and keeps deploying after
a failed group, so do not hand it the whole list as one call. Run the steps
above as separate releases, stopping if one fails.

Ending abandoned games stays off after the deploy. The owner turns it on by
writing `platformFlags/liveChallengeServerSweep`
`{ enabled: true, finishAbandonedGames: true }` with the Admin SDK or the
Firebase console.

**Rollback**, in this order:

1. Set `platformFlags/liveChallengeServerSweep` `enabled` to `false` (any
   value but the boolean `true` works, a string included). It takes effect on
   the next run (within a minute; a finish already under way re-reads it in
   its own transaction), and the logs show `liveChallenge.serverSweep.disabled`.
   **Or** pause or delete the Cloud Scheduler job for
   `closeOverdueLiveChallengeRounds`.
2. Then redeploy the old callables by name. The generated rollback ("redeploy
   previous code by name") does not delete the new scheduled function. The
   switch is what stops it.
3. Optionally delete the function:
   `firebase functions:delete closeOverdueLiveChallengeRounds`.

## Decisions for the owner

1. **Ending an abandoned game** (switch `finishAbandonedGames`). Default:
   **off**. Only overdue rounds are closed, and results then wait for the
   teacher, as today. The options when the owner decides:
   - (a) keep off;
   - (b) on, for games that write no grade, after 30 min with no host heard.
     That writes class points, passes, badges and mastery evidence with no
     teacher action, possibly from one round;
   - (c) cancel instead of finish.

   Warm-Up and assignment-linked games are never ended by the server under any
   option. "Away" includes a teacher who switched to another workspace tab
   (that unmounts the console), an iPad switching apps, a sleeping laptop or a
   discarded tab. A heartbeat from the whole teacher workspace, sent while the
   active pointer names the room, would narrow this. It is not built (a client
   change).
2. **The windows.** 10 s close grace, 30 min host-away window, 1-minute
   schedule.
3. **Teacher wording** for `endedBy: "hostAway"` (a client change), if (b) or
   (c) is chosen.
4. **A student moved between two classes with live games** stays in the first
   game.
5. **Bulk roster paths** (`migrateClassesFromPeriods`, `saveClass`) do not
   late-invite.

## Not done, and known limits

- A lobby nobody starts, and a Pace Race round before a closing threshold gives
  it a deadline, wait for the teacher.
- `eligibleCount` can drift +1 if a roster change lands between
  `createLiveChallenge`'s pointer claim and its player batch, because create's
  non-merge batch overwrites the late row. Only displays read the count
  ("Joined X/N", projector lobby, roster retry), and seats are never reused.
- No copy change for the up-to-70 s wait on the locked card.
- `tests/browser/liveChallengeShellQa.mjs` (a QA tool, not CI) was not run.
- QA report rows Q-23 and Q-58 are left for the integrator.
  `live-challenge-shell.md` §4, §10 and §14 are updated.

## Review of 777b952: what changed in revision 2

- **Blocker** (a sweep finishing a present teacher's game in a mixed or
  rolled-back deploy):
  - a finish requires a recorded heartbeat;
  - the server-side switch is read on every run;
  - the deploy order puts the heartbeat first and the sweep last and alone;
  - the rollback turns the switch off first.

  Tests cover the heartbeat requirement and the switch.
- **Should-fix 2** (auto-finish writes grades, and "away" includes present
  teachers):
  - the finish is off by default;
  - never for a game that writes a grade;
  - the window is now 30 min;
  - the options are written up as owner decision 1.
- **Should-fix 3** (test gaps): new tests for class membership, the memo
  releasing and the re-check's now. The Next Round race is deterministic
  (gated transaction). Each named mutation now goes red.
- **Should-fix 4** (ops): `maxInstances: 1`, `timeoutSeconds: 300`,
  `.select()`, and a 15-min backoff for any failing room, including a failed
  reschedule.
- **Notes**:
  - roster re-read fixed;
  - `eligibleCount` drift documented;
  - invite moved after the audit;
  - `endedBy` visibility stated;
  - stale lobbies bounded at 12 h;
  - the `liveChallengePrivate` rules test added.

## Round-2 review of bc78055: what changed in revision 3

1. **The switch fails closed.** Only the boolean `true` (or an absent field)
   leaves the sweep on; `"false"`, `0`, `null` and `"off"` turn it off. A
   disabled run logs one line.
2. **The finish re-reads the switch inside its own transaction** (one extra
   read per finish), so a flip during a long run stops the next finish. The
   docs now say exactly that.
3. **The late-invite bound counts from the room's latest activity** (created,
   changed, round started or closed), not from creation alone.

Notes taken:
- The backoff fallback is a compare-and-set (`lastUpdateTime` of the query's
  read) and reports `backedOff`.
- A transient close failure waits 5 minutes again; only a room whose due time
  cannot be moved waits 15.

Notes left as they are: `maxInstances: 1` makes a Scheduler call that lands
during a long run get a 429 (log noise only). The console roster re-read is
one callable fetch per change of the invited count.
