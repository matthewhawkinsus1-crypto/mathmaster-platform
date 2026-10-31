# Live Challenge shell: host console, projector and student screens

Every Live Challenge game mode — Standard Challenge, Solver Race, Graph
Feature Rush — runs inside one **shell**: the lobby, the countdown, the round's
frame, the results moment, the final standings, rewards and Play Again. The
game mode owns only the round itself (a question; a student's own graphs).
This document is the map of the shell: what each screen shows at each stage,
where every number comes from, and the rules the screens keep so they agree
with each other and with the server.

The engine underneath (lifecycle, timer, scoring, ranking, results, rewards)
is described in `live-challenge-engine.md`; Graph Feature Rush's own round in
`graph-feature-rush.md`; rewards in `rewards.md`.

```
lobby ──Start──► countdown ──startsAt──► round ──deadline / everyone answered──► results ──Next Round──► countdown …
                    3 · 2 · 1 · GO        (the mode's)     host closes it once        (round + standings)
                                                                                         └─Finish──► final ──Play Again──► new lobby
```

---

## 1. Modules

| Module | Owns | Pure? |
| --- | --- | --- |
| `src/platform/liveChallenge/challengeShellModel.js` | the stage and clock at a calibrated server time (3-2-1, GO, time left, open-ended Pace Race), the next clock boundary, when the host closes a round, the host's one primary control per stage, a student's guidance in words, which round's provisional points a board may show, cue timing for host audio | yes |
| `…/challengeStandingsModel.js` | labels for engine ranks (T-2, competition ranking), what a board's numbers mean per strategy, movement between two engine standings, large-class windows, one round's results view (and its order), placement rewards as delivered | yes |
| `…/challengePresenceModel.js` | presence from what the server last heard, the console roster by name, a student's own connection state | yes |
| `…/challengeReplayModel.js` | Play Again: the create request that replays a room as a fresh match | yes |
| `…/challengeRecapModel.js`, `…/challengeOwnAnswers.js` | the end-of-game recap as the server sent it, and the copy of the student's own answers their device keeps and sets beside its rounds (LC19) | yes (storage is passed in) |
| `…/challengeHooks.js` | the boundary-timed clock hook, a ticker for digits, round result watchers | React |
| `functions/shared/liveChallengePresence.mjs` | the heartbeat a game screen's calibration writes (sessions, reconnects) | yes |
| `src/components/liveChallenge/ChallengeShellParts.jsx` | shared pieces: countdown, self-ticking clock, standings board, round results table, confirmation dialog, confetti, connection pill | — |
| `…/ChallengeHostConsole.jsx` | the console's stage pill, primary control bar, named roster, round results panel | — |
| `…/ChallengeStudentShell.jsx` | a student's lobby, guidance, results and final cards | — |
| `…/LiveChallengeTeacher.jsx` | the console; host commands, pacing, recovery, Play Again | — |
| `…/LiveChallengeArenaProjector.jsx` | the projector, one view per stage | presentation only |
| `…/LiveChallengeStudent.jsx` | a student's screen, one card per stage; the classic round | — |

The models are tested as functions (`tests/platform/liveChallengeShellModel`,
`liveChallengeStandingsModel`, `liveChallengePresenceReplay`), the screens'
wiring by source contracts (`liveChallengeShellWiring` and the suites they
replaced), the server seams against the emulator
(`tests/integration/liveChallengeShell.test.mjs`), and whole games in real
browsers (`tests/browser/liveChallengeShellQa.mjs`, a QA tool, not CI).

---

## 2. The stage is derived, never stored

Every screen reads the match's stage from the authoritative room at its own
calibrated server time — `deriveMatchState` (lifecycle) through
`challengeClock`:

| Stage | Room | What each screen shows |
| --- | --- | --- |
| `lobby` | `status: lobby` | console: roster by name, settings, rewards, Start; projector: joined count, aliases; student: "You are in as …", players in, what the game is, what placement earns |
| `countdown` | round open, before `startsAt` | 3 · 2 · 1 everywhere, in step; the question is mounted but hidden; nothing can be answered (the server refuses arrivals before `startsAt`) |
| `roundActive` | open, `startsAt ≤ now < endsAt` | the mode's round; console: who is working / done; projector: the question (classic) or the race (rush), the clock, locked-in count, live board |
| `roundPaused` | `pausedAt` set | modelled; no control sends it (see §11) |
| `roundLocked` | open, past `endsAt` | "Time's up — your work is locked in, the results are coming"; the host closes the round in a moment |
| `roundResults` | `roundState: closed` | the round's results and the standings it left; the teacher's Next Round |
| `completed` | `status: finished` | podium, final standings, rewards; Play Again |
| `cancelled` | `status: cancelled` | "This challenge was cancelled. Nothing from it is recorded." |

There are no local `started`/`expired` flags deciding what a screen is; a
local flag is used only where the round's own pinned logic needs it (a
student's submit lock and buzzer, described in `live-challenge-engine.md` §11).

**Re-render at boundaries, not on a timer.** `useChallengeClock` re-derives
the stage exactly at each countdown step, the start, the end of GO and the
deadline (`nextClockBoundaryMs`), and when a hidden tab becomes visible. The
time-left digits tick in their own small component (`ChallengeClockText`) and
redraw nothing else. The console and projector used to re-render their whole
trees — question engine and every board row included — four times a second.

---

## 3. The countdown

A round the lifecycle opens starts `ROUND_COUNTDOWN_LEAD_MS` (3.5 s) after the
server's now (`liveChallengeTimer.mjs`, through `buildRoundTimer`'s existing
`syncLeadMs`). Every screen shows the same 3 · 2 · 1 off the round's own
`startsAt`: the number changes on the server's second, a device that opens
mid-countdown shows the step the server is on, and a refresh never restarts
it. Elapsed time, speed scoring and the arrival window all count from
`startsAt`, so the lead never shortens a round.

- Projector: a full-panel countdown (`CountdownView`), then the round.
- Student (classic): an overlay over the mounted, hidden question
  (`data-mm-round-countdown`); GO flashes for 0.8 s without blocking a tap.
  The round's screen gets a render at each step and at GO from its monotonic
  origin, so it lands on the server's second, not up to a tick later.
- Student (rush): the "Get ready" card shows the number (`.mm-rush-count`).
- Console: the countdown in the live status and the stage pill.

---

## 4. Round pacing: a round ends once, and every class sees its results

The host closes the open round with the ordinary, idempotent,
round-scoped close command when `roundCloseDue` says so:

- **At the deadline**, after `ROUND_CLOSE_AFTER_DEADLINE_MS` (1.5 s) — longer
  than the arrival grace (`SUBMISSION_ARRIVAL_GRACE_MS`, 0.75 s), so an answer
  sent at 0:00 is never refused by the close.
- **When every joined student has finished** (a classic round: answered),
  `ROUND_CLOSE_AFTER_ALL_DONE_MS` (1.2 s) after the console first saw it, so the
  last student sees their own answer's feedback first. The server checks
  readiness again inside the closing transaction.
- **A question-set round** (a rush) closes on its deadline only: every student
  plays their own graphs against the clock and is never "finished" before it.
- Never while paused, never twice: several open host screens all send the
  close; the first closes it, the rest are told it is already closed
  (`alreadyApplied`). A close the server refuses because the round is
  genuinely still running (`round_in_progress`) is retried a few seconds later.

**With no host screen open** (the laptop slept, the tab closed) the server
does the same through the same commands — `closeOverdueLiveChallengeRounds`,
every minute (`functions/shared/liveChallengeServerSweep.mjs`):

- an open round `SERVER_CLOSE_GRACE_MS` (10 s) past its deadline is closed by
  the console's own close transaction — never forced, so a student with
  extended time still inside their own deadline is waited for. An open
  console always closes first (1.5 s); if both arrive, one closes it and the
  other is told it is already closed. A student waits at most about 70 s on
  "Time is up! The results are coming." instead of until the teacher returns;
- **on by default since the owner's decision (LC05, 2026-10-23)**; the switch
  (`platformFlags/liveChallengeServerSweep`, `finishAbandonedGames`) turns it
  off: results that have stood
  `HOST_AWAY_FINISH_MS` (30 min) with no host screen heard for as long are
  ended by the console's own Finish (End Game: answers given count; one match
  result, its standings and rewards). Never a game that writes a grade (a
  Warm-Up), and never one whose host the server has not heard at least once.
  The console's 30-second clock calibration is its heartbeat (`hostHeardAt`,
  private state, written at most once a minute), so a teacher talking the
  round through is never ended; the finish re-checks the round, the heartbeat
  and the switch inside its transaction, so a Next Round that lands first is
  played. The room records `endedBy: "hostAway"` (readable by the class), and
  the teacher's console, reopening that game, says why it ended
  (`hostEndedNote`). With the switch off, results wait for the teacher, as
  before.

On the same switch, `enabled` set to anything but the boolean `true` (`false`,
`"false"`, `0`, …) turns the whole sweep off — it fails closed — and each run
logs that it did nothing. That is the first step of a rollback
(`docs/handoffs/STUDENT_PASS3_LIVE_CHALLENGE_ROUNDS.md`). The switch is read
at the start of every run and again inside each finish's transaction.

The sweep reads only rooms whose private state is due (`serverSweepDueAt`, set
when a round opens and closes, cleared at the finish): one single-field range
query, no composite index, nothing a student listens to. A Pace Race round
has no deadline until its closing threshold sets one; a paused round and a
lobby are the host's.

Every mode then shows its **results**, and the next round starts only when the
teacher presses **Next Round** (or **Finish & Show Final Standings** after the
last; **Continue** when Second Chance may follow). Nothing auto-advances: the
teacher talks the round through first.

`End Round Now` (confirmed) force-closes a round in play; it is not offered
during the countdown or after the buzzer (that round closes itself in a
moment). `End Game` (confirmed) finishes the match from any open round or
results; answers already given count.

---

## 5. What the numbers mean

`scorePresentation` names, per room, the **match total** every board ranks by
and a player's **round performance** — never one unlabelled number that could
be either:

| Strategy | Match total | Round result |
| --- | --- | --- |
| Accuracy First | points | points this round |
| Correct Count | correct answers (rush: graphs completed) | correct this round (rush: graphs completed) |
| Grand Prix | **championship points** | round points (rush: graphs completed) → place → **+N championship points** |

Grand Prix results show both: a student can finish more graphs in a round than
the championship leader and still trail, and the screens say why ("+3
championship points", "Overall: 2nd · 18 championship points").

**Ranks are the engine's**, labelled: a shared rank reads `T-2` for everyone
sharing it, and the next place is 4th (competition ranking). Ties list in the
engine's display order (alias, then player key).

**A round's table order** follows what the scoring reads (`roundRankedByPoints`):
Grand Prix and question-set rounds keep the engine's round placement (the
place IS the score); a per-response strategy (Accuracy First, Correct Count)
never reads the round's place — its table lists what each player earned, most
first, equal points sharing a place. (The engine ranks a classic round
correct-first then fastest; with a streak bonus that put "3rd · 1,350 pts"
under "2nd · 1,200 pts".)

**Movement** (↑2, ↓1) is the difference between two standings the engine
wrote — the standings after the previous round and after this one — never a
guess from a row's position on screen.

**Every number is the real value.** Boards used to animate scores with a
`requestAnimationFrame` count-up that stalled in a throttled tab, showing a
whole board of zeros under a correct "Your score". A changed score now flashes
once in CSS; it never counts through values nobody had.

**Working points** (a student's in-progress estimate, never banked) are on a
board only while the round takes answers (`stage === roundActive`). After the
buzzer every board shows banked scores; a student who never submitted no
longer keeps phantom points until the next round opens.

---

## 6. The results moment

A closed round's anonymous result carries `standingsAfterRound`: the match
standings the closing transaction just produced (`matchStandingsAfterRound`,
the final result's own ranking). It is written in three copies, by reader, in
ONE commit: the teacher's whole table (`…/hostRounds/{n}`, the console and
projector), the class's copy (`…/rounds/{n}`: only the public rule's rows of
both lists) and each student's own entry (`…/playerSummaries/{studentId}`:
their place in the round and the match after it — `roundResultsView` adds it
to the class's rows as `ownRound`, and movement comes from their previous
round's entry). So the results moment reads documents of ONE commit:

- the round's own table (place / what each player did / championship points),
- the standings it left, with movement since the round before,
- each student's own row in both ("You placed 2nd of 24 · +3 championship
  points · Overall: 4th").

No screen pairs a round with standings from before it (a Grand Prix close
changes every total), a refresh or a reconnect reads the same thing back, and
the projector, the console and every student agree because they read the same
document. Until it arrives, screens say "Tallying the round…" — never the old
board. A round closed before this field existed falls back to the live board.

Graph Feature Rush reads its results the same way; the standings listener it
pauses during a round is no longer involved (it once showed a pre-round board
for a frame after the close).

The last round's `standingsAfterRound` are the final standings.

---

## 7. The host

**Console** (`data-mm-host-console={stage}`): a stage pill; one primary
control per stage (`hostPrimaryAction`: Start → [nothing while a round runs]
→ Next Round / Finish → Play Again; New Challenge after a cancel), with a hint
saying what happens next; End Round Now and End Game, Cancel Session in the
lobby; the live status; the roster.

**The roster is by name** — the console's only. The public player rows are
anonymous by design, so `getLiveChallengeHostRoster` (the room's own teacher
only) returns player key → student name. The roster shows who has not joined
("Not joined yet: …"), who is connected, who has had **no signal** for how
long (what the server last heard — a browser cannot report that it closed),
who **reconnected**, who is on **two devices**, and during a round who is done
and who is still working. A "show game names" switch (off by default; keep it
off while the console is projected) adds each alias. Names never reach the
projector: it is not handed the roster and never asks for it. The roster
outlives the game: after the end (and after a refresh on the podium, once the
room's private state is gone) the callable answers from the match result, and
the console's final standings can show each name beside its game name, behind
the same switch — so the teacher can see who won and who earned what.

**What the hint says** during a round depends on how the round ends: a
classic round "ends when time runs out or everyone has answered"; a Graph
Feature Rush round has more graphs than anyone can finish and ends on the
clock only, and says so.

**One command at a time.** Every lifecycle control — console and projector,
primary and secondary, and the confirmation's own button — is disabled while
any command is in flight, and round commands carry the round on screen
(`expectedRoundIndex`/`Version`). A double-clicked Start or Next Round, or the
same button in two tabs, opens one round.

**Confirmations** for what cannot be undone, and only those: End Game, End
Round Now, and Cancel Session once anyone has joined (an empty lobby cancels
at once). Start and Next Round never ask. The dialog keeps keyboard focus
where the teacher puts it while the console updates underneath (its
handlers are read through a ref, so a student's progress arriving never
re-runs its focus effect), Tab and Shift+Tab wrap inside it, and Escape is
"Keep playing".

**Recovery.** The server's active-room pointer reopens a live game after a
refresh, on a second device, or after a dropped connection — "Reconnected to
your live game. It kept running while you were away" — never restarting it.
A finished game has no pointer, so the tab remembers the room it last hosted
(`sessionStorage`, one hour) and reopens its podium and report after a
refresh. A remembered or pointed-to room the server no longer has is dropped
once and never reopened.

**Scoring at create (LC16).** A Standard Challenge or Solver Race is created
under Accuracy First, Grand Prix or Correct Count (Solver Race has no Correct
Count: its mode does not allow it), chosen in the create panel beside the other
classic settings; Graph Feature Rush and Graph the Line keep their own Scoring
choice in their setup panels. The choices offered are the mode's own list
(`classicScoringModel.js` reads the registry), Accuracy First sends nothing so a
teacher who ignores the choice sends the request they always did, and Play Again
keeps the choice (`replayRequestFromRoom`). Speed influence belongs to Accuracy
First: Grand Prix ranks a round by how right each answer was and then by speed,
and Correct Count pays no speed, so the control is shown only for Accuracy First
and the other two send the platform default (20%), never a number a hidden
control left behind. The card under the panel says what a round pays in each
strategy, built from the engine's own placement table, and the dry run, which
checks the questions and shows Accuracy First's points, says so when the game
will be scored another way. **Second Chance is Accuracy First's**: it replays
the questions the class missed and pays the students who missed them recovery
points, which only Accuracy First pays, and no test has ever played Grand Prix
or Correct Count with replays (they would be one more ordinary round for
everyone). The console switches the control off for the other two and says why;
the server still accepts the combination from another client, which is a
reason to certify it before it is ever offered.

**Audio** is optional and mutable. Nothing is created until the teacher's
first click (Start on the projector, or Enable Audio), nothing while muted
(muting releases every sound; unmuting brings back the moment's music), and at
most a handful of sounds are held at once. The music stays down from the
buzzer through the results (`cueRemainingMs`).

---

## 8. The projector

`LiveChallengeArenaProjector` is presentation only (no Firebase, no
callables; tests hold that) and shows one view per stage: lobby (joined count,
aliases, how to join, what placement earns), countdown, the round (classic:
the question and the live board; rush: the race — graphs completed — never a
graph, a target or a coordinate), results (the round and the standings it
left), and the podium (ties share a medal; placement rewards beside the
places, from the room's reward summary). Host controls run along the bottom.

- **Legible from the back of a room**: sizes scale with the viewport
  (`clamp(…vh/vw…)`); at 1366×768 and at 125% / 150% browser zoom nothing
  scrolls sideways and the standings stay readable (QA harness).
- **Nobody is publicly last** (`functions/shared/liveChallengePrivacy.mjs`,
  `liveChallengeProjectorModel.projectorBoardLimit`): every class-wide board —
  live, round results, standings after a round, under the podium — shows the
  top five at most and stops before the last player in a small class, then
  "and N more players · everyone sees their own place on their device". It
  also never leaves one or two players unshown (LC22): the lobby listed every
  alias, so with one left a viewer names them, and with two left each of the
  two names the other, and one of them is last. (With 5 players the top three
  used to leave 4th and 5th, and the 4th, finding three aliases on the
  projector and themselves 4th, could name the 5th.) So two and three players
  project no ranking, four project 1st only, five the top two and six the
  podium; seven players on a five-row screen show four, not five. A student's
  own list is judged for that one viewer (one other player left to find is the
  leak there), and a game already finished keeps the rows the old rule
  published; only games played after the change follow the new one. A
  teacher may choose "Full standings" at create (`room.standingsDisplay`,
  kept by Play Again). Students' own cards apply the same limit. The server
  applies it too: every document a student can read (`standings/current`,
  `rounds/{n}`) holds only the default rule's rows — whatever the projector
  shows — and a student reads their own place from their own summary
  (`playerSummaries/{studentId}`); the projector, a teacher session, reads
  the whole table (`hostRounds/{n}`, the class's player rows).
- **Worked solution** at the results moment, handed to the projector by the
  console (`useRoundSolution`), never during a countdown or an open round.
  A ready solution takes the left of the screen and the round's table and the
  standings share the right-hand column, one above the other, so the class
  still reads what the round did while the solution is up (LC03; "Hide
  solution" brings back the two tables side by side). Two tables in one
  column are drawn in compact rows and each shows fewer of them. How many is
  MEASURED from the panels, not read off the screen's height (the first
  version was a table of heights, and was cut off in the font a classroom's
  machine has): both lists start at the most they may show (the top five, or
  the screen's rows for full standings) and, while either panel's content
  runs past its bottom edge, one of them gives up a row
  (`useStackedRowsThatFit`, `fitStackedStep`). The standings keep their top
  three longest: above three the two take turns, the round's table first
  (with full standings it gives all its rows but one first), and when three
  standings rows and one round row still do not fit (150% zoom on a 1366×768
  projector) the round's table steps aside, behind "Hide solution", and the
  standings have the column. In halves, as first built, 125% zoom showed two
  standings rows and 150% one, where the shell QA's big class wants three. A
  new round, a resize or a zoom starts again from the top. `publicStandingsRows` still decides which rows
  and says what is left unshown. A screen under 900 px wide stacks everything
  in one scrolling column, the plain two-table results too. A held solution
  stays a line above the two tables. `liveChallengeProjectorPrivacyQa` fails
  when either table is cut off at 1366×768, 125% zoom or 1920×1080.
- **Recognitions** under the podium (`room.recognitions`, aliases only).
- **Extended time**: after the class deadline, while a round waits for a
  student with extended time, "A few students are still finishing — results in
  a moment" (never who) — a synchronized round, or a Graph the Line Classic or
  Sprint round, whose race board does not move meanwhile.
- **Large classes**: the top of the board, then "and N more players" — never
  the bottom of the class singled out. The lobby lists every alias that fits
  (chips shrink before anyone is hidden). Under the final podium the standings
  show only the rows that fit whole in the space left (measured, not guessed
  from the viewport), with "Everyone sees their own final place on their
  device" whenever anyone is left out — moved into the podium's heading when
  not even that line fits (150% zoom).
- **Optional full screen** (a refusal leaves the CSS full-viewport view), and
  an exit back to the console.
- **Privacy**: aliases only (unless the teacher chose a name display), no
  answers, no student ids, no device health.

---

## 9. A student

`data-mm-student-stage={stage}` on the screen; one card per stage:

- **Lobby**: "You are in as Nova Panther 90", how many are in, the game and its
  settings, what placement earns, "Waiting for your teacher to start. Keep this
  screen open."
- **Countdown / round**: the mode's round. Classic: after locking in, "Round
  complete for you — waiting for the others. The results show when the round
  ends."; at the buzzer without an answer, "Time is up! The results are
  coming."
- **Results**: their place in the round, what they did, the points it earned,
  their overall place and movement, the top five (and their own row when they
  are outside it), and what comes next.
- **Final**: a podium finish leads with the place ("T-2nd of 24"); any other
  finish leads with what the student did (points, correct answers, personal
  bests, recognitions), and the place is a quiet line ("Your place: 18th of
  24 — only you see this" when no class-wide board shows it). Then their
  total and what reached their
  wallet (`renderMatchRewards(roomId, { offered })` — the app's
  `ChallengeRewardsEarned`, read from the wallet, never computed here; with
  nothing earned it says what the game offered, and a game that offered
  nothing shows no rewards card), then the top of the class. Until the
  standings arrive (a refresh on the podium) the card says "Loading your
  final place…", never "You joined after the last round". A podium finish
  gets confetti, which reduced motion turns off.
- **Header**: their live score in the room's unit — never their place.
- **No board under the question.** While a round can be answered there is no
  standings board, no rank and no "Rank #" on the answer feedback. A student
  sees their own place only on the results and final cards, which list the top
  few (the projector's rule, below) and their own row.
- **The worked solution** at the results moment, once the server has published
  it (`room.revealedSolutionRounds`; held while a Second Chance replay may come
  — "The worked solution is shown after the Second Chance rounds").
- **Missed rounds**: back from a reconnect, a reload or a sleep, rounds that
  closed meanwhile without their answer get one notice
  (`challengeMissedRounds.js`).
- **Recap**: a finished game lists the student's own rounds — result, what they
  answered and the worked solution — with private personal bests and their
  recognitions (`getLiveChallengeMatchRecap`, `challengeRecapModel.js`). The
  answer is theirs alone: the server keeps a verdict and its points, not what
  was typed, and no document a classmate can read carries an answer. So the
  device that sent an answer keeps a short readable copy of each one the
  server confirmed (`challengeOwnAnswers.js`: a typed answer, the choice in its
  own words, or what a tool says they built, as a released test reads it back),
  keyed by student, game and round, for the last eight games and a month, and
  the recap sets it beside the rounds the server says they answered. A round
  they did not answer shows none. A second device, or a browser that keeps no
  storage, shows the recap without answers (§14).
- **Honest about grades**: a Warm-Up game says "Your accuracy counts as your
  Warm-Up; game points don't."; a standalone game says game points change no
  grade.
- **Accommodations**: extended time counts down to the student's own deadline
  (invite `timeMultiplier`, `personalRoundClock`), at most 2x whatever a plan
  grants (`MAX_GAME_TIME_MULTIPLIER`, decided 2026-10-25, LC22: a game round is
  short, and 2x is the most a class waits for one player; a Warm-Up game
  included, so a teacher who needs such a plan honoured in full for that
  assignment runs its standard Warm-Up instead); a student whose plan grants
  text-to-speech gets Read aloud on the round prompt. A Warm-Up game receives
  the whole support profile and the rewards card a standalone game has. In a
  Graph the Line Classic or Sprint round the extra time comes after the
  class's buzzer, to finish the set, and the race is decided at the buzzer
  ("Your extra time…", on their screen only); a Rush has none; a plan's
  graphing aid turns on their own slope helper (`graph-the-line.md` §7).

**Plain words.** What a student reads never carries the server's vocabulary:
an answer sent before GO is told "This round has not started yet. Wait for
GO, then answer."; a late one "Time was up before your answer arrived, so it
was not counted."; a stale screen "That round has changed since your screen
loaded it…"; a locked answer "Answer locked in · checking it…"; a slow clock
"Your connection is slow right now. You can still answer…". An invite to a
room the server no longer has (its word, not a cached copy) shows "This Live
Challenge is no longer available." with the way back, never "Opening…"
forever.

**Honest connection status.** The room listener asks for metadata changes, so
the screen knows when the SDK is serving its cache because the server is
unreachable: "Reconnecting…" (and "Offline — reconnecting…" when the browser
says it is offline). A first paint from the device's own cache is not
"reconnecting". The round itself keeps its locked answer safe and resends it
on `online` (engine doc §11).

**The heartbeat.** The screen calibrates its clock against the server every
~30 s while the game can be played, and each calibration reports its quality
and a per-tab session id (`sessionStorage`, so a refresh is the same screen).
The server keeps a bounded map of recently heard sessions and marks
`reconnectedAt` when a report follows a silence longer than
`PRESENCE_FRESH_MS` (75 s) — the console's presence. A finished or cancelled
game stops calibrating.

---

## 10. Joining, leaving, coming back

- **Who can join**: the class roster at create time (`createLiveChallenge`
  invites each student; nobody else can join a room) — and a student added
  to the class while its game is in the lobby or running (and active in the
  last 12 hours)
  (`setStudentClass`, `createStudentAccount`, `assignStudentToTeacher` call
  `inviteStudentToClassLiveChallenge`): the next seat and code name, an invite
  their screen follows at once, and the late-join rule below. A student whose
  invite is for another class's game that is still live is left in it: **a
  student moved between two classes that both have a game stays in the first**
  (decided 2026-10-25, LC02; nothing invites a student out of a room, because
  leaving a game is a removal, which is not built, §14). Game names are handed
  out in a shuffled order, so a name's number says nothing about who holds
  it, and a Warm-Up link must be one of the class's own assignments.
- **A bulk roster change invites too** (LC02, `liveChallengeBulkInvite.mjs`):
  `saveClass` (an administrator editing a class restamps its students' teacher
  and period, which also repairs a student whose stored teacher had drifted
  off the class, so a game created earlier did not invite them) and
  `migrateClassesFromPeriods` hand the students they moved to the same safe
  single invite, after the change is made and audited. A teacher with no
  active game costs one read however many students moved; one with a game has
  each moved student invited in turn, within 15 seconds (the rest sit out this
  game, and the log says how many); a failure is logged and never fails the
  roster change.
- **Late join**: a rostered student who arrives after the start joins at once
  and plays from the round that is open now — the server records
  `joinedAtRound`, a round that already closed is not counted against them,
  and the screen says "You joined during round 3. You're in for the rest of the
  game." A student who arrives during a results moment plays from the next
  round ("You will play from the next round.").
- **Leaving keeps the points**: closing the tab or dropping out leaves the
  student's record as it is; they stay on the board and in the final result
  with what they earned, and the console shows them as "No signal".
- **Coming back** is the same player: same key, score and join round
  (`joinLiveChallenge` merges). A refresh during a round restores the locked
  answer or the server's result; during results it shows the same results;
  after the end, the final card.
- **Two devices**: both screens follow the game; the console shows "2
  devices". Answers are still one per round (the server's receipts).

---

## 11. Play Again and the class's next game

**Play Again** creates a **fresh room** with the finished room's settings
(`replayRequestFromRoom`: class, mode, rounds as requested, time, scoring,
question style, timing, Second Chance; a rush's families, features and
difficulty — never its seed) and the Rewards choice on this device. A new room
id is a new match: new receipts, rounds, clock, round tokens, match result
and reward identities, so nothing from the last game can be scored into this
one. A Warm-Up game's replay is standalone (a Warm-Up records one result per
assignment). Its name settings are secured the same way as a create — or the
new lobby is cancelled.

`createLiveChallenge` re-invites the class, and every student's screen follows
its invite into the new lobby (the student screen is keyed by room id, so the
new game starts from nothing). **New Challenge** returns to the setup panel
with this device's settings.

---

## 12. Who owns what

| The shell (every mode) | The game mode |
| --- | --- |
| lobby, countdown, results moment, final standings, podium, Play Again | the round's content and input |
| the stage, the clock, pacing (when a round closes) | what "finished" means for a player (classic: answered) |
| score presentation by strategy, ranks, ties, movement | its round's performance metrics (engine `roundStructure`) |
| roster, presence, reconnect status | its own in-round reconnect (a rush's tap queue) |
| confirmations, one command at a time | — |
| rewards display (summary, wallet slot) | — |

A new mode inherits the whole shell by registering its round structure and
capabilities with the engine (`live-challenge-engine.md` §3); a question-set
mode must be added to the shell's question-set list (a test holds it equal to
the registry).

---

## 13. Listeners and timers

| Screen | Listeners | Timers |
| --- | --- | --- |
| student | invite (app), room (with metadata), the standings snapshot and their own public row (both paused during a rush round), their own summary (their own place: changes only at a close and the finish), the current round's class copy (results stage only), one read of the round before — never a classmate's row (the rules refuse it) | clock calibration (30 s, live games only); boundary timeouts; the classic round's quarter-second tick; one final-standings repair request if a finished room has no final snapshot after 2.5 s |
| console | room, players, diagnostics, active-room pointer, the current round's whole result (`hostRounds`, results stage only), one read of the round before; the roster callable once per room | calibration (30 s, live games only); boundary timeouts; the close schedule; audio cues (250 ms, running only); the standings pacer (≤ 1 request/s while its board changes) |
| projector | none of its own (the console's data) | the clock digits' own ticker |

**Standings on a student's screen** come from one document,
`…/standings/current` (engine doc §12a), never from the class's rows: the
public rule's rows and the class's size — and from their own summary, the
student's own place and score. The header's place and the in-round board are the latest live snapshot
(at most about a second old while answers arrive); the results moment reads
the round's result document as before; the final card waits for the FINAL
snapshot, which the finishing transaction writes from the match result, so the
podium a student sees is the match result's. The student's own score and
"answered" state come from their own public row, which no classmate's answer
touches. A student's standings work per round is therefore bounded — about
one snapshot a second at most, whatever the class size — and the launch
certification holds every screen to that bound at 5 to 64 students.

Every listener is released by its effect (`listenerLifecycleGuard` holds it);
a round's result is watched only while its results are on screen, and the
round before is read once and cached (bounded). The shell QA's endurance run
(`SHELL_QA_SCENARIOS=endurance node tests/browser/liveChallengeShellQa.mjs`)
counts the listeners each page has open after every one of five games —
Standard, Rush (Correct Count), Rush (Grand Prix), Solver Race, Rush — and
holds the count, the event listeners, the DOM and the heap (after a forced
GC) flat across them.

---

## 14. Deferred

- **A pause control.** The timer models pause/resume and the stage exists, but
  no control sends it: a pause that only some devices honoured would be worse
  than none.
- **Teacher removal of a student** from a running game (removal happens
  through account deletion). Adding a student mid-game invites them (§10).
  Looked at for LC02 (VH-55) and not built, because it is not small and safe;
  what it needs, so the next person does not start from a grep:
  - *A callable* (`removeLiveChallengePlayer`, room owner only, lobby or
    running) doing in ONE transaction what `deleteStudentLiveChallengeFootprint`
    does for the room a deleted student is in: the private roster row, the
    public player row, diagnostics, their summary, and their invite when it
    names this room.
  - *A tombstone* (`privateState.removedStudentIds`) that `joinLiveChallenge`
    and the late invite honour, or the next roster change invites them straight
    back (with a new seat and a new code name).
  - *Seat bookkeeping.* `eligibleCount` is both the console's "N invited" and
    the next seat a late invite allocates (the code name's seed): it cannot be
    decremented. The console needs a `removedCount` to subtract.
  - *Engine effects to decide and test:* a round that closes when every joined
    player has answered (the denominator shrinks mid-round); Grand Prix's field
    size for later rounds; the public tables already published for earlier
    rounds, which keep a row for a player the final result will not have;
    reports, recognitions, class points and rewards (none for a removed
    student); a graded Warm-Up game, where a removed student has no grade for
    it, which the teacher must be told before they press the button.
  - *The student's screen:* the room listener fails once their invite is
    gone, and shows a generic error; it needs "Your teacher removed you from
    this game".
  - *The console:* a Remove control on a roster row with `ConfirmDialog`, a
    service wrapper, and the bridge and stub the browser harness swaps in
    (`tests/browser/emulator/liveChallengeBridgeService.js`,
    `liveChallengeServiceStub.js`).
  - *Certification:* emulator tests for each stage (lobby, between rounds,
    mid-round, after the student answered, a graded Warm-Up) and a browser run
    with a removed student's screen open.
  A moved student leaving the first game (C2-44) is this removal plus a late
  invite, and should wait for it; skip graded Warm-Up games and students who
  already answered.
- **A student's own answers in the recap on every device (LC19).** Built for
  the device that played: the recap shows what the student answered from the
  copy that device kept (§9). A student who played on a Chromebook and opens
  the recap on a phone sees their rounds and the worked solutions without their
  answers, and so does one whose browser keeps no storage. Showing them
  everywhere means the server keeping what each student typed, which is a
  retention decision before it is a change:
  - *Where.* Not the match result: one document that the report, Warm-Up
    credit, mastery evidence and rewards are built from, and that outlives the
    game. The student's own summary (`playerSummaries/{studentId}`, written at
    each round's close, readable by the student, the room's teacher and a root
    admin) is the document to look at.
  - *What.* The rows `challengeOwnAnswers.js` builds, and nothing else (never
    the question, never a verdict). The submit path would have to write them:
    it records only the verdict and its points today.
  - *Who sees them, and for how long.* The room's teacher could then read what
    each student typed, and the answers would outlive the private state a game
    deletes when it finishes. Decide both, and keep them inside the
    account-deletion footprint (`deleteStudentLiveChallengeFootprint` already
    removes the summaries).
  - *Then* `getLiveChallengeMatchRecap` returns them with the rounds, and the
    device copy becomes a fallback or goes.
- **A lobby, or a Pace Race round, nobody comes back to** is not ended by the
  server (§4); it waits for the teacher to finish or cancel it.
