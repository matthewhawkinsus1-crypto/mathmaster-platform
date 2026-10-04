# Live Challenge launch certification — 2026-10-04

Follows `LIVE_CHALLENGE_LAUNCH_INVESTIGATION_2026-10-03.md` (PR #417) and
closes PR #415's open QA item I-11. Test-only: no application file changed.

## Result

**No production launch defect was found.** Every authorized, connected
device — in the lobby, opening during the countdown, offline at zero, frozen
through zero on a slow Chromebook, attaching its listener after the round was
already running, or refreshing mid-round — derived the round from the durable
room and played it, at every class size from 5 to 64, and in real browsers.
The countdown is animation: a device that never saw it still played (its own
diagnostics say so). Two QA-harness races and one harness capacity limit were
found and fixed; each is described below with its evidence.

## 1. The `reconnect` QA race (PR #415, I-11)

**Race.** `answerInBrowser` returns when the "Lock In Answer" click lands; the
answer is sent afterwards. The scenario force-closed round 1 on the next line.
When the answer reached the server second, `submitLiveChallengeResponse`
refused it — correctly, "That Live Challenge round is no longer active" — the
bridge answered 400, Chrome logged "Failed to load resource … 400", and the
console check failed while every functional check passed.

**Reproduction.** The scenario gives that student a 400 ms link
(`window.__mmBridgeDelayMs`, the bridge's existing knob). On the old ordering:
2 of 2 runs failed with exactly the I-11 signature.

**Fix (test-only).** `tests/browser/support/submissionSettled.mjs`: before the
forced close, wait until that click's own `submitLiveChallengeResponse` has
settled and the server accepted it. It still fails the QA when the answer is
**never sent**, **hangs**, is **refused while the round is open**, or settles
without a **server record**; the scenario then also checks the server holds
the answer and the screen reaches the results. No status code or console
message is newly ignored (a platform test asserts the QA's ignore list has no
400 / "Failed to load resource").

**Repeated.** 20 of 20 runs clean after the fix, 7 of them with two of four
cores pinned busy (the load under which #415 saw 3 of 9 fail).

## 2. Class-scale certification (emulator, CI)

`tests/integration/liveChallengeLaunchCertification.test.mjs`, in
`npm run test:challenge-finish` (so in CI's full-platform suite), using the
#422 transaction-retry layer and nothing new.

**What is real.** Every callable, under each student's own identity. Every
listener: each device loads the production `liveChallengeService.js` with its
own Firebase app and Firestore connection (`support/clientFirebase.mjs`), so
its snapshot stream, cache, `disableNetwork` and reconnect are the SDK's own.
Every decision goes through the modules the student screen uses
(`acceptChallengeSnapshot`, `challengePhaseAt`, `challengeClock`,
`calibrateChallengeClock`, `publicLeaderboard`, `studentConnectionState`).
What the device mirrors from `LiveChallengeStudent.jsx` (join, calibration,
mount, telemetry batching, resend) is held to the screen by
`tests/platform/liveChallengeLaunchCertificationMirror.test.mjs`.

**Per class size (5, 15, 25, 35, 45, 64), one full 3-round game:** all students
already in the lobby except: ~10 % opening during the countdown, one offline
from 400 ms before zero to 2.5 s after, one backgrounded slow Chromebook
(renders once a second, 150 ms link, every snapshot 700 ms late, frozen from
1.5 s before zero to 2 s after), one listener attaching 1.5 s after zero, one
refresh 1 s after zero, ~10 % with snapshots delayed up to 1.5 s (so out of
order), one whose first reply is lost and who resends the same envelope, and
who then forges a second answer. Every round is closed by the host **without
force**, which itself proves every joined student's answer reached the server.

**Graph-rich launch:** Graph Feature Rush, 30 students, graphs generated per
player and fetched at launch; offline-at-zero and late listener included.

**Endurance:** 4 consecutive matches, 20 students, screens never refreshed
(they follow their invite into each new lobby), 400 ms snapshot jitter, up to
60 ms request latency, two devices dropped and restored around every round
start.

### Stress summary (final CI-equivalent run, 246/246 integration tests)

| Class | Lobby screens on round 1 after zero (max) | Offline-at-zero | Frozen slow Chromebook | Late listener | Refreshed | Answers scored | Answer round trip p50 / p95 |
|---|---|---|---|---|---|---|---|
| 5 | n/a (all 5 disrupted) | +92 ms | +2.0 s (woke) | +1.7 s | +1.3 s | 15 | 77 ms / 2.0 s |
| 15 | 85 ms | +48 ms | +2.0 s | +1.9 s | +1.4 s | 45 | 151 / 361 ms |
| 25 | 80 ms | +66 ms | +2.0 s | +1.8 s | +1.8 s | 75 | 295 / 626 ms |
| 35 | 61 ms | +14 ms | +2.0 s | +2.3 s | +2.1 s | 105 | 749 ms / 1.5 s |
| 45 | 93 ms | +35 ms | +2.0 s | +2.8 s | +1.6 s | 135 | 2.6 / 3.2 s |
| **64** | **80 ms** | +10 ms | +2.0 s | +5.8 s | +8.0 s | 192 | 7.7 / 8.3 s |

Times are from the server's `startsAt`. The frozen device shows the round the
moment it wakes (2.0 s is when it was thawed). The offline device shows it
from its cache the moment zero passes. The late listener and refreshed page
cannot show it before they exist (+1.5 s, +1.0 s).

**Why answer latency (and the late/refresh column) climbs at 45–64.** Not the
server: same server, emulator and 64 students, with the per-device standings
listener switched off, answer p50 was **152 ms**; on, **6.6 s**. One 4-core
machine hosts the emulator, the callables and 64 Firestore SDKs, each keeping
its own 64-player standings view — work a classroom spreads over 64
Chromebooks. Before the devices were moved into worker threads, that load made
room snapshots arrive up to 24 s late at 64 (the test process at 100–280 % CPU,
the emulator not among the busiest processes), which is why the suite uses a
device farm.

**Largest simulated concurrent class: 64**, every device on real listeners
with standings on.

### Recovery

- **Offline at zero.** The SDK keeps serving the cached `running` room, so the
  stage derives to roundActive on time; the locked answer waits as a pending
  envelope and is sent on reconnect with its original submission id. Evidence
  rows show `connection_lost` and `connection_restored`.
- **Late listener.** Its first snapshot is the running room; it derives
  roundActive directly and plays. Its evidence has `running_received` for
  round 1 and no round-1 `countdown_received` (the first countdown it saw was a
  later round's).
- **Reconnect / refresh after `running`.** A new page with the same tab
  storage: one rejoin (same player key, `rejoined: true`), the round from the
  current room, no second answer.
- **Backgrounded slow device.** Frozen through zero: nothing runs, then the
  queued snapshot and the visibility re-derive put it straight on the round.

### Duplicate, submission and scoring results (every size, every match)

- One private and one public player per student; unique keys; the device
  played under the key the room minted.
- Exactly one scored answer per student per round (one receipt per round on
  the server); the lost-reply resend came back `duplicate: true` (3 per game)
  and the forged second answer was refused (3 per game), never scored.
- Each board score equals the sum of the points that student's accepted
  answers earned; private and public scores agree; correct counts match.
- The leaderboard every screen shows equals the match result's standings, in
  rank order, for everyone.

### Endurance / memory

- 4 matches, 20 devices: listeners after every match exactly 20 room + 20
  standings + 20 invite (one of each per device); 0 after shutdown.
- Farm heap after a forced GC: 212.0 → 216.2 → 216.3 → 216.8 MB
  (+0.6 MB after warm-up).
- No stale state: after each match every screen holds that match's room; a
  late listener on the last, finished match reads it as completed.
- Browser (shell QA `repeat`): student-page heap 51.1 → 52.2 MB and event
  listeners 209 → 205 over four games on one unrefreshed page; the five-game
  `endurance` scenario passes its listener, heap and DOM checks.

## 3. Diagnostics validation (#417)

| Property | Evidence |
|---|---|
| Bounded | ≤ 7 milestone keys per player, from the fixed vocabulary; largest diagnostics row 1,066 bytes at every class size, after 3 rounds, refreshes and reconnects |
| Idempotent | First observation kept; a refreshed page (same tab storage) never re-reports a sent milestone; #417's duplicate-batch unit test unchanged |
| Teacher-only | Not on the room or any public player row (asserted every game); `npm run test:rules` 225/225 incl. student/other-teacher denied |
| Best-effort, non-blocking | Browser `launch` scenario: a screen whose launch-only batches are all aborted at the network still reaches the round, answers and finishes |
| Low write volume | Launch-only (extra) requests per game: 6 / 16 / 26 / 36 / 46 / 65 for 5 / 15 / 25 / 35 / 45 / 64 students — ≤ 1 per ordinary device across all 3 rounds, ≤ 3 for a disrupted one. Each is one write to that player's own diagnostics row: no shared document, nothing per frame or per snapshot |

Diagnostics cannot create a class-size hot spot: every write is to the
writer's own row, the extra volume is linear (≈ 1 per student per game), and
the row size is constant.

## 4. Real-browser launch (shell QA `launch` scenario)

40 players: 6 real screens + 34 bots. A 6× CPU-throttled Chromebook, a tab
frozen through zero (`Page.setWebLifecycleState`), a phone offline at zero, a
screen opened during the countdown, one opened after the round was running,
and one whose diagnostics never get through. All six reach the round, answer
(each through the settle gate), reach the results and the finished game; the
console stays clean. 8 of 8 runs clean, 4 with two cores pinned busy.

An earlier version answered one screen after another in a 17 s paced round
and, under load, overran it — the choices were correctly disabled at the
deadline. It now answers on all six at once in a 50 s paced round and reports
a disabled-choices screen as a finding with its stage, clock and overlay.

## 5. Observations, not defects

- **Standings fan-out is O(N²) per round.** Every student screen listens to
  every player row (except during a rush round, where it is paused), so a
  64-student round delivers ≈ 64 × 64 × 2 player-row changes. Correct, and
  each device only processes its own 64; but it is the dominant read volume at
  class scale. A production load test against real Firestore remains the only
  way to measure its latency on a school network.
- **`adversarial` assumes its countdown answer lands inside 3.5 s.** It failed
  once in this work, only after the old `launch` scenario had thrown and left
  a 6×-throttled page running; 3 of 3 clean in isolation, and `launch` now
  closes its pages whatever happens.
- **`liveChallengeGame.mjs` can leave its Vite and emulator running** after it
  exits, holding port 8182 for the next emulator run. Not touched here.

## 6. Shared Warm-Up / lifecycle

Nothing found needs the Warm-Up timeout/reopen branch. No shared lifecycle,
deadline, reopen, `src/App.jsx` or PR #423 file was changed.

## Running it

```
npm run test:challenge-finish                                   # includes the certification
LAUNCH_CERT_SIZES=64 LAUNCH_CERT_REPORT=/tmp/r.json npm run test:challenge-finish
SHELL_QA_SCENARIOS=reconnect,launch node tests/browser/liveChallengeShellQa.mjs
```
