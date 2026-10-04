# Live Challenge launch investigation — 2026-10-03

> **Follow-up:** the launch path is now certified against the real server and
> real listeners at 5–64 students, in real browsers, and over repeated
> matches — see `LIVE_CHALLENGE_LAUNCH_CERTIFICATION_2026-10-04.md`. The
> deterministic simulation below remains as a unit-level check.

## Finding

The reported split launch could not be reproduced from the implementation or
the deterministic 5–64-client simulation. No countdown patch or arbitrary
retry was made. The implementation is state-based: the host makes one
transactional room update and every already-open student screen listens to the
same `liveChallengeRooms/{roomId}` document. A late or reconnected listener is
given the document's current `status: running`, round, question, `startsAt`, and
`endsAt`; it does not need to witness a transient start event.

The remaining plausible explanation is a temporary client connectivity or
hosting problem, but today's evidence cannot distinguish that from a browser
that never attached its room listener. The focused telemetry added by this
change makes that distinction observable next time without claiming it as the
root cause.

## Launch path and scaling

1. The teacher calls the `startLiveChallenge` callable.
2. The callable prepares round zero, then a Firestore transaction changes the
   public room and private room to `running`, stores the sanitized question,
   and stores one server-derived future `startsAt` used for 3–2–1. This is the
   authoritative launch and is O(1) with class size.
3. The callable updates per-student invite pointers after the room commit. That
   fan-out changes dashboard/banner wording; it does **not** launch students
   already in the lobby, who are listening directly to the room.
4. A student game screen has one Firestore `onSnapshot` room listener with
   metadata events enabled. The current room snapshot is accepted even when the
   listener attaches after launch or returns from cache. No Realtime Database,
   polling, client start write, per-player host start, or start Cloud Function
   fan-out is involved.
5. UI stage is derived from durable room state plus calibrated server time.
   Local boundary timers only cause a re-render at `startsAt`; they are not the
   authority. Visibility changes re-derive the stage, covering background timer
   throttling. Graph Feature Rush retries its per-player round fetch with
   exponential backoff and uses the same room timer.
6. Join/rejoin is transactional and uses the preallocated player key. A retry
   merges the same public/private player documents, so recovery cannot create a
   second player. Submission guards use round version/token and existing
   receipts, preventing duplicate score credit.

At countdown zero there is no database write or broadcast burst: clients
independently cross the already-stored `startsAt`. The only class-wide listener
notification is the room transaction before the countdown. The post-commit
invite update is chunked and therefore grows with roster size, but is outside
the lobby client's launch path. Nothing in the inspected path provides evidence
for a 20–50-student Firestore fan-out threshold.

## Simulation evidence

`tests/platform/liveChallengeLaunchScale.test.mjs` exercises 5, 10, 20, 30,
40, 50, and 64 listeners against one authoritative revision. Every client
reaches the mounted milestone; each simulation has one room write and one
current-state delivery per listener. The 60-client recovery case disconnects
three clients at zero and attaches three after `running`; all six recover from
the current room state. Player sets remain singular and no score record is
created by recovery. This is a deterministic architecture simulation, not a
claim to benchmark Google's production network.

## Added evidence for the next classroom session

Each student screen now folds a bounded set of server-received milestones into
its existing teacher-only diagnostics row: listener attached, countdown room
received, running room received, active game mounted, first connection loss and
restore, and listener error. First milestone times are preserved; duplicate
snapshots cannot grow the fixed seven-key summary. No
student-visible name or answer is logged. The existing teacher roster joins
these rows to student names, so support can compare a stuck student's last
milestone without exposing IDs to the teacher.

### Telemetry load review

The first implementation sent four independent requests in an ordinary launch
(`listener_attached`, `countdown_received`, `running_received`, and
`game_mounted`): 40/80/120/160/200/256 additional callable requests and
diagnostic writes for 10/20/30/40/50/64 students. Connectivity and error events
could add more.

The revised client keeps at most one in-memory/session-storage entry for each of
the seven event types, preserving its client timestamp and observed room state.
Events collected during calibration ride on its existing presence heartbeat at
no additional request cost. After the active UI mounts, any remaining events
are sent as one best-effort batch. Thus the conservative ordinary-launch
maximum is one **additional** callable and one per-player diagnostic write per
student: 10/20/30/40/50/64 at those class sizes (50 requests + 50 writes for 50;
64 + 64 for 64). Usually the earlier milestones are already piggybacked, but the
bound does not depend on that optimization. An actual failed request may retry
after connectivity returns; retries are not launch traffic and are required to
recover the evidence.

No render, countdown, question fetch, join, score, or recovery path awaits this
report. Failed reports retain the bounded local summary and are retried by a
later normal heartbeat, listener-error recovery, or `online` event. Launch-only
reports write launch timestamps only: they do **not** update
`connectionUpdatedAt`, whose existing meaning remains the last successful
presence/quality heartbeat.

Interpretation:

- no `launchMilestones.listener_attached`: the game bundle/screen never initialized (hosting,
  routing, authentication, or content filtering);
- attached but no `launchMilestones.running_received`: Firestore delivery/connectivity failed;
- running received but no `launchMilestones.game_mounted`: client rendering/clock logic failed;
- mounted with later connection loss: launch succeeded and a subsequent network
  failure is the issue.

## Next live-session checks

Keep the teacher console open and record the approximate zero time. For any
stuck named student, compare their milestone fields and connection state with a
successful neighbor, note device/browser and whether the `.app` host and
Firestore endpoints load, then allow connectivity to recover without refreshing.
The student should enter from the current `running` snapshot. A production
browser/network load test remains necessary to measure real Firestore delivery
latency under the school's filter; the local simulation cannot reproduce that
infrastructure.
