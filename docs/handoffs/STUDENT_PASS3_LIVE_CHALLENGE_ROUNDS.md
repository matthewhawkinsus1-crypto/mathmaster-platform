# Student pass 3 — Live Challenge rounds (Q-23, Q-58)

Branch `claude/pass3-live-challenge-rounds`, from `claude/modest-pasteur-xzagn7`
at `6accda1`. Evidence: `docs/qa/student-experience-pass-3/06-open-items-qa-docs.md`
rows Q-23 and Q-58, and `docs/architecture/live-challenge-shell.md` §14. Nothing
was deployed. Every test ran against the emulators only.

Both items reproduced on the base before the change. I ran the new emulator
suite against the base `functions/index.js`: 10 of its 12 cases failed. The 2
that passed are the negative cases ("another teacher's calibration is not the
host" and "a student in another live game is not pulled out of it"). Nothing on
the base closes an overdue round, and nothing invites a student added after
create.

## Q-23 (P2): an overdue round with no host screen open never closed

**What a student saw.** The teacher's console closes a round 1.5 s after its
deadline. If the console was gone (laptop asleep, tab closed), nothing closed
the round. The class sat on "Time is up! The results are coming." until the
teacher came back. If the teacher never came back, the game never finished, so
nobody's rewards, report, Warm-Up credit or evidence were written. The
teacher's next game was also blocked, because the room still held their active
pointer.

**What changed.**

- **New scheduled function `closeOverdueLiveChallengeRounds`.** It runs every
  minute with `invoker: "private"`. Its rules live in
  `functions/shared/liveChallengeServerSweep.mjs` (pure, unit-tested) and are
  applied by `sweepLiveChallengeRoom` in `functions/index.js`.
  - **Closing an overdue round.** An open round 10 s past its deadline
    (`SERVER_CLOSE_GRACE_MS`) is closed by **the console's own close**.
    `closeLiveChallengeRound`'s transaction body is now
    `closeLiveChallengeRoundForRoom`. The callable and the sweep both call it.
    The sweep never forces the close, so a student with extended time is still
    waited for: the close is refused and the round is re-checked 30 s later.
  - **Ending abandoned results.** The finish happens when a round's results
    have stood 10 minutes (`HOST_AWAY_FINISH_MS`) and no host screen has been
    heard for that long. It goes through **the console's own Finish**
    (`finalizeLiveChallengeMatch`, End Game semantics): answers already given
    count, and there is one match result with its standings, rewards and
    effects. The room records `endedBy: "hostAway"`.
- **Host heartbeat.** The console already calls `calibrateLiveChallengeClock`
  every 30 s. A teacher's call for their own room now records `hostHeardAt` on
  the room's server-only private state.
  - It writes at most once a minute per room. A per-instance memo means four of
    the five calibration samples skip even the read, so the clock estimate (a
    median of the five) is unaffected.
  - It never fails the calibration.
  - It works with the console that is already deployed, so no client release
    is needed.
- **Idempotency.** Every decision is re-checked inside the command's own
  transaction:
  - A console and the sweep closing at the same moment: one closes the round,
    and the other is told it is already closed (`alreadyApplied`).
  - Two overlapping scheduler runs, or a retry: one finish. The second run
    finds the room finished and only resumes outstanding effects.
  - A Next Round that lands just before the sweep's finish: the finish's
    `stillWanted` check (`stillAbandoned`) sees a different round version and
    writes nothing.
- **Cost.** The sweep reads only rooms whose private state is due
  (`serverSweepDueAt`). That field is set when a round opens (deadline + 10 s)
  and when a round closes (close + 10 min). It is also set when a closing
  threshold shortens a round, which is how a Pace Race round gets its first
  deadline. It is cleared at the finish.
  - The query is one single-field range with `orderBy` and `limit(25)`:
    **no composite index**, and nothing a student's screen listens to.
  - An idle minute costs one read: about 43k reads and 43k invocations a month,
    plus one Cloud Scheduler job.
  - A room that keeps failing backs off 5 minutes, so it cannot take every
    run's slots.
- **What a student sees while it closes.** The locked card ("Time is up! The
  results are coming.") is now true:
  - Results arrive within about 70 s at worst (10 s grace plus a 1-minute
    schedule), about 40 s on average, instead of whenever the teacher returns.
  - The results card then stands as it does today.
  - After 10 minutes with no host, the final card, podium and rewards follow.
  - With a console open, nothing changes: it still closes at 1.5 s, long
    before the sweep could.
- **Rooms already running at deploy** carry no due time. The sweep never sees
  them until their next round opens under the new code, so the deploy cannot
  suddenly finish an old abandoned game.

**Proof.**

- **Emulator** (`tests/integration/liveChallengeServerSweep.test.mjs`, in
  `test:challenge-finish`). The suite backdates its own rooms into 2000 and
  runs the sweep with `scheduleTime` in 2001, so no other parallel suite's room
  is ever due in it. The run takes rooms due by its `scheduleTime` (capped at
  now). Cases:
  - a round opening sets due = deadline + grace;
  - an overdue round with no client open is closed: results, `hostRounds`,
    standings snapshot `roundClosed`, scores equal to the standings, next due
    one host-away window later;
  - a run on results a moment old changes nothing and reschedules;
  - abandoned results with two overlapping runs end in one finish: same
    `finalizationId`; final ranks equal the results the class saw; final
    snapshot; every effect done, rewards included; invites `finished`; teacher
    pointer released; a third run changes nothing;
  - a console close racing two sweeps closes the round **exactly once**, with
    the same points as a round closed once;
  - a host heard via calibration keeps the game going, and the next due is
    heard + window;
  - another teacher's calibration is not this game's host;
  - Next Round racing the finish produces one consistent outcome, never both.
    In the recorded run the guard fired ("kept");
  - a finished game whose private state outlived the finish is dropped from the
    sweep without being touched.
- **Unit and wiring** (`tests/platform/liveChallengeServerSweep.test.mjs`):
  - the grace is longer than the console's close and the arrival grace;
  - grace boundaries; a paused round, a Pace Race round, a lobby, a finished or
    cancelled game, or a missing room are never acted on;
  - host-away boundaries and the in-transaction re-check;
  - the heartbeat interval;
  - the scheduler is private and every minute, uses the unforced close and the
    re-checked Finish, and runs one bounded query;
  - due times are set at opening and close and cleared at the finish;
  - calibration is wired as the heartbeat.

## Q-58 (P3): a student added to the class mid-game was not invited

**Design check first.** The existing design already allows a late join
(`live-challenge-shell.md` §10):

- `joinLiveChallenge` records `joinedAtRound`, and a closed round is not
  counted against the student.
- Grand Prix sizes each round's field from who played that round, at the close
  (`liveChallengeResults` and `fieldPlacementPoints`). Nothing is frozen at
  create.
- The standings snapshot ranks whatever entries it gets and never reads
  `eligibleCount`.

So a late joiner distorts neither scoring nor ranks, and I built it rather than
proposing a rule.

**What a student saw.** A student enrolled after the teacher created the game
sat it out until the next one. Only the roster at create time is invited.

**What changed.** New `inviteStudentToClassLiveChallenge` (in the Live
Challenge section of `functions/index.js`). It is called after the roster write
in `setStudentClass`, `createStudentAccount` and `assignStudentToTeacher` (the
legacy period roster). Through the class teacher's active-room pointer, one
transaction:

- **Matches** the room only when it is in its lobby or running and belongs to
  that teacher, using the same membership rule as `loadChallengeRoster`.
- **Gives the student** the next seat (`eligibleCount`) and the code name
  `createLiveChallenge` would have given it (same seed and index). The private
  player row is the same shape as at create.
- **Writes the invite** with `invited` in a lobby or `running` in a running
  game, and bumps `eligibleCount` so the console's "Joined X of N" and its
  roster read follow.
- **Leaves alone** a student whose invite points at another room that is still
  live; they stay in that game. A student who is already a player in the room
  is not re-seated.
- **Never fails** the roster change: the "Safely" wrapper logs and returns.

The student's screen follows the invite at once: App listens to their invite
document. Joining then follows the existing late-join rule, and they are in the
final result.

**Proof.**

- **Emulator** (same suite):
  - a student added during a running game is invited `running`, gets seat 2
    and a unique code name, `eligibleCount` becomes 3, joins at
    `joinedAtRound` 1, answers, and is in the match result;
  - a student added in the lobby is invited, joins, and is moved to `running`
    by the start; adding them again changes nothing;
  - a student in another class's live lobby who moves classes keeps that game;
    a class with no game invites nobody; an uninvited student cannot join.
- **Wiring** (unit suite): each of the three roster callables makes the call.
- `tests/platform/helpers/serverCallableHarness.mjs` now supplies the invite
  helper as a recording stub. `createStudentAccount` run as written needs it,
  and the real one runs against the emulator.

## Mutation checks (every new assertion)

Each mutation was applied alone and the suite re-run, then restored.

| Mutation | Went red |
| --- | --- |
| Heartbeat ignored when planning the finish | emulator "host still heard" |
| Finish's in-transaction re-check removed (integration) / bypassed (source) | emulator "Next Round racing"; unit wiring |
| Sweep's CLEAR does nothing | emulator "finished game never swept again" |
| Late invite overwrites another live game's invite | emulator "already in another live game" |
| Heartbeat ownership check removed | emulator "another teacher's calibration" |
| `eligibleCount` not bumped | emulator late-running and late-lobby |
| Close made non-idempotent (lifecycle) | emulator "console and server close at once" (fresh-close count) |
| Close sets no due time | emulator "overdue round … closed" |
| `setStudentClass` hook removed | emulator late-running and late-lobby |
| Grace ignored / grace shorter than the console / paused round swept | unit tests 2 / 1 / 3 |
| Re-check ignores the host / ignores the round version | unit test 5 |
| Heartbeat written on every call | unit test 6 |
| `assignStudentToTeacher` hook / calibration heartbeat unwired | unit test 9 |

Two mutations survived at first, and I fixed the tests:

- The race test compared scores only. Grand Prix rewrites the totals rather
  than adding to them, so a double close left the scores unchanged. The test
  now counts the fresh closes.
- The source order check passed on `indexOf === -1`. It now requires the check
  to be present.

The grace boundary cannot be seen in the emulator, where rooms are backdated,
so the unit tests cover it.

## Gate (at the head this report names)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11435 / 11435 pass |
| `npm run lint` | exit 0; 468 warnings, the same count as the base (none new) |
| `npm run build` | pass |
| `npm run build:firebase` | pass; no tracked file rewritten |
| `npm run test:rules` | pass (243/243 rules checks; 209/209 node rules tests) |
| `npm run test:challenge-finish` (all of `tests/integration/*.test.mjs`, incl. every `liveChallenge*` and the new suite) | 455 / 455 pass |
| `npm run test:live-challenge-launch:emulator` | 10 / 10 pass |
| `test:live-challenge-teaching-browser` (alone) | 58 / 58 checks |
| `test:live-challenge-projector-privacy-browser` (alone) | 86 checks, no findings |
| `tests/browser/liveChallengeChoiceKeyboard.mjs` (alone, with the a11y workflow's two Vite servers) | pass at both viewports |

The browser drivers used `playwright@1.55.0` (`--no-save`, as the workflows
do) against this container's Chromium build. Nothing in the repo changed for
that.

## Deploy targets and order

No Firestore index and no rules change. No client change, so **no Hosting is
needed** for these fixes. `release-firebase.mjs` will still list Hosting and
path-admin, because a shared module changed.

Deploy functions only, by exact name, in one release. Any order works:

- `closeOverdueLiveChallengeRounds` (**new** scheduled function; ships with
  its code, and creates a Cloud Scheduler job)
- `closeLiveChallengeRound`, `advanceLiveChallenge`, `startLiveChallenge`
  (round opening and close set the due time)
- `finishLiveChallenge`, `cancelLiveChallenge` (the finish clears it; the
  re-check option)
- `submitLiveChallengeResponse`, `updateLiveChallengePacing` (a closing
  threshold sets the new due time)
- `calibrateLiveChallengeClock` (host heartbeat)
- `setStudentClass`, `createStudentAccount`, `assignStudentToTeacher` (late
  invite)

Mixed old and new instances during the roll-out are safe:

- An old close leaves no due time, so those results are simply never
  auto-finished.
- A sweep that ships first finds nothing due.

Run `node scripts/verify-callable-access.mjs --fix` after, as every functions
release does.

## Decisions for the owner

1. **Ending an abandoned game.** The server **finishes** the game (End Game:
   rewards and report as earned so far) after 10 minutes of results with no
   host heard. The alternatives are cancel (nothing recorded) or only close the
   round and never finish. A teacher who comes back after 11 minutes finds the
   final standings and can Play Again. `HOST_AWAY_FINISH_MS` is one constant.
2. **The windows.** 10 s close grace, 10 min host-away window, 1-minute
   schedule (the minimum).
3. **Teacher-facing wording.** The room records `endedBy: "hostAway"`, but the
   console and recap do not yet say "This game ended because no host screen
   was open for 10 minutes". That is a client change; say if you want it.
4. **Late invite and another live game.** A student moved between classes
   while each has a live game stays in the game they were invited to first.
   The alternative is to move them to the new class's game.
5. **Late invite sources.** I hooked the three single-student roster writes.
   `migrateClassesFromPeriods` (bulk) and `saveClass` (a teacher change)
   invite nobody mid-game.

## Not done

- A lobby nobody starts, and a Pace Race round before any closing threshold
  gives it a deadline, are not ended by the server. They wait for the teacher.
- Results the console closed and then left (the teacher's screen closed after
  closing the round) are ended by the same 10-minute rule. That works because
  the close sets the due time; I am listing it so it is known.
- No copy change for the up-to-70 s wait on the locked card.
- `tests/browser/liveChallengeShellQa.mjs` (a QA tool, not CI) was not run.
- QA report rows Q-23 and Q-58 are not edited here; that is for the
  integrator. `live-challenge-shell.md` §4, §10 and §14 are updated.
