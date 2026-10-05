# Live Challenge standings at class scale — 2026-10-05

Follows #427's observation (standings delivery ≈ O(N²) per round: every
student's standings listener received every classmate's row change) and
#433's dedicated launch-certification emulator. Built on main at 96d1011
(#434, #435, #436 and #437 merged). **Not deployed** — §14 is the order.

## Result

- **Bounded per student.** A student's screen now hears the class through one
  small standings snapshot and its own row: ≈ 8.7 standings documents per
  round at 25, 64 and 96 students alike (it was N: 69.5 at 64, 105 at 96),
  and four listeners whatever the class size. Nothing a student's device does
  per round grows with the number of classmates answering.
- **Answers are as fast as with no standings at all** — 50 / 72 ms (p50 /
  p95) at 64 against 1,640 / 4,438 ms on main in the same harness — and an
  answer never reads, writes or waits on the snapshot.
- **Exact where it matters.** Each round's close and the finish write the
  snapshot in the same transaction that decides the standings, from the
  private records and the match result: the final standings and podium every
  screen shows are the match result's, seat by seat (certified at every class
  size from 5 to 64, and for Accuracy First, Grand Prix and Correct Count). A
  live snapshot can never replace them, and nothing is ever scored from a
  snapshot.
- **Live within a second.** Between milestones the host console asks for a
  fresh snapshot at most once a second while its board moves; a classmate's
  answer reaches the other screens 0.5–0.6 s after it commits (p50) and within
  1 s (p95) at every size from 15 to 96.
- **On real Chromebooks** the standings' main-thread cost per round is flat
  in the class size (606 ms at 5, 828 ms at 64; it was 3,008 ms at 64), and
  the throttled Chromebook's 27 long tasks per round at 64 are gone (0.7).
- **Billed reads** per round fall 2.7× at 64 and 3.9× at 96 (even, 0.8–1.0×,
  at 5–15 students: publishing reads every row once per snapshot).
- **No load test touched production.** One remaining question — production
  Firestore's own fan-out latency at 64 — has an operator probe and runbook
  (§15); it refuses the production project.

## 1. Current architecture (main at 96d1011)

- **Answer path.** `submitLiveChallengeResponse` runs one transaction: it reads
  the room and the student's private player, and writes the private player
  (receipts, score, `answeredRound`) and the public row
  `liveChallengeRooms/{roomId}/players/{playerKey}` (alias, score, counts,
  `answeredRound`, `updatedAt`). Progress reports (work in progress) write
  `provisional*` fields to the same public row; a Grand Prix round close
  rewrites every player's public row (placement points).
- **Student screen.** `LiveChallengeStudent.jsx` keeps three listeners:
  invite, room (with metadata) and **`watchLiveChallengePlayers(roomId)` — the
  whole players collection**. On every delivery it ranks all N rows
  (`publicLeaderboard` with the room's strategy) and re-renders the in-round
  board, the header place, the lobby count, join detection, the refresh lock
  (its own `answeredRound`) and the final standings.
- **Console.** The teacher's console listens to the same collection (one
  listener per room) and the roster callable.
- **Rules.** The room's audience (its teacher, its invited students) reads
  every player row.

## 2. Why it scales poorly

Every answer changes one row, and every one of the N screens' players
listeners receives that change: N deliveries per answer, **N² per round**
(plus progress reports, and N rows × N screens at each Grand Prix close).
Firestore bills each delivered changed document as a read, and each delivery
wakes a student's device to re-rank the class and re-render. Phase 1 measured
where that cost lands — it is not all Firestore:

- **Server:** not the bottleneck. With standings listeners switched off
  (`off`) the server's reads, writes and callable time are the same as with
  them on; callable start → commit is 28–41 ms (p50) at every size.
- **Firestore fan-out:** quadratic. 4,450 standings documents per round across
  a 64-student class (69.5 per screen), 10,074 at 96.
- **Client CPU:** per-screen work grows with the class. Ranking itself is
  cheap (≈ 11.5 ms per screen per round at 64 in node), but every delivery is a
  React commit of the student shell: ≈ 1.15 N commits per round. A real
  Chromebook spent 649 ms of main thread per round at 5 students and 3,008 ms
  at 64; a 4×-throttled Chromebook 1,823 → 6,497 ms with 27 long tasks per
  round, and showed a classmate's answer 278 ms (p50) / 568 ms (p95) after it
  committed.
- **Harness:** in node, 64 screens share 4 worker threads, so their N² work
  saturates the device farm (event-loop utilization 0.87 at 64, 0.98 at 96)
  and the emulator (80–100 % CPU delivering it). That is why the node answer
  round trip reads 1.6 s p50 / 4.4 s p95 at 64 and 9.1 s / 24.2 s at 96 —
  while the `off` control at the same sizes answers in 48 ms / 62 ms. In a
  classroom that CPU is spread over real devices, but each device's own work
  per round still grows with N.
- **Emulator artifact:** the emulator re-sends a listener's whole query result
  on each change, so its wire bytes per screen grow as N² (2.98 MB per screen
  per round at 64 in the browser). Production sends only changed documents
  (≈ 0.73 KB × N per screen per round, ≈ 47 KB at 64). Byte columns below are
  the emulator's and are marked as such.

## 3. Before measurements

Main at 96d1011, emulator only (`npm run profile:live-challenge-standings`,
`SHELL_QA_SCENARIOS=standings`). One game per class size: lobby, three rounds
in which every student answers once (spread over 6 s, as a class does), the
finish. Node: every device a real Firestore client in a 4-worker device farm,
every callable the real one, with a no-standings control (`off`) at each
size. Browser: four real screens (Chromebook, iPad, phone, and a Chromebook
at a quarter of the CPU) beside bots for the rest of the class, against the
real handlers through the bridge. Machine: 4 CPUs, 17 GB, Node 22.

| students | standings docs / screen / round | standings docs / round, class | answer round trip p50 / p95 ms | control (off) p50 / p95 | classmate's answer shown p50 / p95 ms | worker load (ELU) | emulator CPU % |
|---|---|---|---|---|---|---|---|
| 5 | 5 | 25 | 82 / 94 | 61 / 69 | 23 / 30 | 0.02 | 14 |
| 15 | 15 | 225 | 80 / 122 | 52 / 61 | 34 / 48 | 0.06 | 18 |
| 25 | 25 | 625 | 88 / 129 | 47 / 57 | 44 / 73 | 0.10 | 20 |
| 35 | 35 | 1,225 | 122 / 180 | 50 / 62 | 71 / 112 | 0.25 | 27 |
| 45 | 45 | 2,038 | 180 / 262 | 49 / 73 | 105 / 156 | 0.52 | 39 |
| 64 | 69.5 | 4,450 | 1,640 / 4,438 | 48 / 62 | 2,857 / 4,331 | 0.87 | 80 |
| 96 (headroom) | 105 | 10,074 | 9,149 / 24,201 | 49 / 94 | 6,329 / 9,577 | 0.98 | 102 |

In real browsers at 64 students, per screen per round: 64 standings
documents, 73 React commits within 50 ms of a standings delivery, 3,008 ms of
main thread on a Chromebook (649 ms at 5 students) and 6,497 ms with 27 long
tasks on the throttled Chromebook (1,823 ms and 0.3 at 5). Heap stayed flat
(≈ 50 → 53 MB lobby → final screen) and listeners were constant at three per
screen (room, players, invite) — the cost was work per delivery, not leaks.
Full per-screen tables are in §7 and §9.

## 4. Architecture chosen

**One small, server-written standings snapshot per room, paced by the host,
exact at every milestone.**

- `liveChallengeRooms/{roomId}/standings/current`
  (`functions/shared/liveChallengeStandingsProjection.mjs`): the top five rows
  a screen shows (alias, rank, shared rank, score, seat) and every joined
  player's rank and score in two compact comma-separated lists indexed by seat
  (`slot` — the player's position in the room's shuffled alias order, fixed at
  creation). 1.6 KB at 64 players, 2.1 KB at 128 (its digest is a 53-bit
  hash, not a second copy of itself). Replaced whole, never patched.
- **Live snapshots** are written by `publishLiveChallengeStandings`, which the
  host console's pacer (`standingsPublishPacer.js`, `useStandingsPublisher`)
  calls when the board it already ranks changes: a 150 ms coalescing window,
  then at most one request per second, a trailing request so the last change
  of a burst is never left behind, and the server's `retryAfterMs` honoured
  (a refused request does not start a new interval). The server reads the
  room and every public row in **one read-only transaction** (lock-free: an
  answer never waits on it — verified on the emulator, where a read-only
  transaction left a concurrent answer write unblocked at 52 ms while a
  read-write one held it 1.3 s), ranks them with the same `publicLeaderboard`
  the boards always used, and writes only if what a screen would show changed
  (digest) and no sooner than 750 ms after its last write. That floor sits
  below the host's second on purpose: the server measures from its write,
  which trails the host's send by the publish's own duration, and a floor
  equal to the host's interval refused 3 of every 7–8 requests in the first
  measurement — a 2 s effective cadence, classmates' answers shown 1.9 s late
  at p95. With the floor at 750 ms no request is refused (7 of 7 per round at
  every size) and the p95 is under a second.
- **Exact snapshots** are written inside the transactions that already decide
  the standings: a round close (Close Round and Next Round) writes the round's
  `standingsAfterRound`; the finish writes the **match result's** standings —
  so the final standings and podium a student sees are the match result's by
  construction. A finished room without one (it finished before this deploy)
  gets it from its match result on first view
  (`ensureLiveChallengeFinalStandings`, once, for the room's own audience).
- **Ordering** (`projectionMayReplace`): a final is never replaced; an
  earlier moment of the match (round version, then lobby < open < closed <
  final) never replaces a later one; at the same moment exact beats live; live
  against live, the later read wins (Firestore's read time).
- **Authority.** The answer path never reads or writes the snapshot. Points,
  placements, rewards and the match result come from the private records only;
  the snapshot is display.
- **Student listeners:** room, the snapshot, the student's own public row
  (their score and `answeredRound`; no classmate's answer touches it), invite —
  four, whatever the class size. Both standings listeners pause during an open
  Graph Feature Rush round, as the players listener did.
- **A quiet host** (closed, asleep, offline) leaves the live board stale and
  nothing else: answers, the exact close snapshots and the final are written by
  the server regardless (certified: "the host console stops publishing").

## 5. Alternatives rejected

- **One aggregate document rewritten by each answer.** A hot document (≈ 1
  sustained write/s per document), contention in the answer transaction, and
  an answer that waits on — or fails because of — the board. Ruled out by the
  brief, and by the design goal that answers never touch it.
- **A Firestore trigger on player rows rebuilding the snapshot.** N trigger
  invocations per round, each reading N rows (N² server reads), at-least-once
  and out-of-order delivery, cold starts, and its own debounce state to
  maintain.
- **A scheduled function.** Cloud Scheduler's floor is one minute; a
  per-room loop inside a function is fragile and bills for idle time.
- **Throttling the players listener on the client.** Fewer renders, but the
  same N² deliveries, reads and bytes: Firestore delivers every change to an
  open listener regardless.
- **A top-five query** (`orderBy(score).limit(5)`). The ranking is the
  strategy's (ties, correct counts, provisional points) and cannot be
  expressed as a Firestore order; a student still needs their own place; and
  changes inside the top five still fan out to everyone.
- **Per-rank or per-opponent documents and listeners.** More listeners per
  student, not fewer — excluded by the brief.
- **The host writing the snapshot itself.** Fast, but then a client decides
  what every student sees, and the rules would need a client write path. Here
  the host only says *when*; the server reads, ranks and writes.

## 6. Reads and writes, before / after

Main (legacy client) against this PR (projection client): same harness,
machine and game at every size. "Billed reads" adds what listeners were
delivered — each delivered document is a read — to the callables' own reads;
room-listener deliveries are the same in both designs and left out.

**Reads and writes per round (one class, every student answering once; emulator, counted the way Firestore bills)**

| students | before: server reads | before: standings docs delivered | before: billed reads | before: server writes | after: server reads | …of which publishing | after: standings docs delivered | after: billed reads | after: server writes | reads before ÷ after |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 95.3 | 25 | 120 | 38.7 | 131 | 36 | 25 | 156 | 46 | 0.8× |
| 15 | 253 | 225 | 478 | 92 | 373 | 120 | 118 | 491 | 98.7 | 1.0× |
| 25 | 409 | 625 | 1,034 | 143 | 612 | 203 | 217 | 828 | 152 | 1.2× |
| 35 | 566 | 1,225 | 1,791 | 195 | 839 | 273 | 303 | 1,142 | 204 | 1.6× |
| 45 | 722 | 2,038 | 2,760 | 271 | 1,065 | 343 | 390 | 1,455 | 254 | 1.9× |
| 64 | 986 | 4,450 | 5,437 | 366 | 1,479 | 476 | 555 | 2,033 | 322 | 2.7× |
| 96 | 1,538 | 10,074 | 11,612 | 604 | 2,133 | 700 | 832 | 2,965 | 441 | 3.9× |

- Publishing costs one read per player per snapshot (476 of the 1,479 server
  reads per round at 64). In a class of 5–15 the total is even or slightly
  higher (0.8–1.0×); from 25 students up it falls, 2.7× at 64 and 3.9× at 96:
  a fixed cost per snapshot instead of a cost per answer per screen.
- Writes change only by the snapshot itself (≈ 7 per round while answers
  arrive, plus one per close and one at the finish).

## 7. Deliveries, before / after

**Standings deliveries per round**

| students | before: docs / screen | before: callbacks / screen | before: docs, class | after: docs / screen (snapshot + own row) | after: callbacks / screen | after: docs, class | after: live snapshots written | before: rank+render ms / screen (node) | after: ms / screen (node) |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 5 | 5 | 25 | 5 (4 + 1) | 5 | 25 | 4 | 0.7 | 0.7 |
| 15 | 15 | 15 | 225 | 7.9 (6.9 + 1) | 7.9 | 118 | 6.3 | 2.1 | 1 |
| 25 | 25 | 24.1 | 625 | 8.7 (7.7 + 1) | 8.7 | 217 | 7 | 3.5 | 0.8 |
| 35 | 35 | 30.3 | 1,225 | 8.7 (7.7 + 1) | 8.7 | 303 | 7 | 4.8 | 0.8 |
| 45 | 45.3 | 36.2 | 2,038 | 8.7 (7.7 + 1) | 8.7 | 390 | 7 | 5.5 | 0.7 |
| 64 | 69.5 | 35.1 | 4,450 | 8.7 (7.7 + 1) | 8.7 | 555 | 7 | 11.5 | 0.8 |
| 96 | 105 | 27.1 | 10,074 | 8.7 (7.7 + 1) | 8.7 | 832 | 7 | 12.5 | 0.8 |

A screen now receives about one snapshot per second of answering plus its own
row: 8.7 documents per round at 25, 64 and 96 students alike; seven live
snapshots are written per round at every size from 25 up (requests: 7, none
refused).

**In real browsers** (Chromebook, iPad, phone, and a Chromebook at a quarter
of the CPU; before → after; heap is lobby → final screen, before ; after):

| students | screen | standings docs / round | React commits after standings / round | main-thread ms / round | long tasks / round | Firestore KB / round (emulator) | classmate answer shown p50 / p95 ms | heap lobby → final MB |
|---|---|---|---|---|---|---|---|---|
| 5 | chromebook | 5 → 6 | 7.3 → 9 | 649 → 606 | 0 → 0 | 37.7 → 30.6 | 52 / 57 → 252 / 1251 | 49.5 → 52.4 ; 49.6 → 52.5 |
| 5 | ipad | 5 → 6 | 8.7 → 8 | 605 → 626 | 0 → 0 | 37.7 → 30.6 | 43 / 62 → 261 / 1252 | 49.5 → 52.4 ; 49.6 → 52.5 |
| 5 | phone | 5 → 6 | 8 → 8.3 | 599 → 632 | 0 → 0 | 37.7 → 30.6 | 49 / 62 → 263 / 1253 | 49.5 → 52.4 ; 49.6 → 52.5 |
| 5 | throttled | 5 → 6 | 5 → 6.7 | 1,823 → 1,752 | 0.3 → 0 | 37.7 → 30.6 | 57 / 71 → 265 / 274 | 49.3 → 52.3 ; 49.3 → 52.4 |
| 15 | chromebook | 15 → 9 | 18.7 → 10 | 837 → 668 | 0 → 0 | 193.4 → 50.3 | 38 / 70 → 745 / 971 | 49.7 → 52.8 ; 49.6 → 52.5 |
| 15 | ipad | 15 → 9 | 18 → 10.3 | 816 → 676 | 0 → 0 | 193.4 → 50.3 | 39 / 75 → 548 / 969 | 49.7 → 52.8 ; 49.7 → 52.6 |
| 15 | phone | 15 → 9 | 17.7 → 10 | 813 → 663 | 0 → 0 | 193.3 → 50.3 | 37 / 74 → 738 / 972 | 49.7 → 52.8 ; 49.6 → 52.6 |
| 15 | throttled | 15 → 9 | 16.7 → 9.3 | 2,334 → 1,952 | 1 → 0 | 193.4 → 50.3 | 63 / 114 → 563 / 964 | 49.3 → 52.7 ; 49.4 → 52.5 |
| 25 | chromebook | 25 → 9 | 32 → 14.3 | 1,137 → 673 | 0 → 0 | 489.3 → 62.7 | 39 / 70 → 563 / 989 | 49.9 → 52.8 ; 49.6 → 52.5 |
| 25 | ipad | 25 → 9 | 31.7 → 15.3 | 1,131 → 720 | 0 → 0 | 489.2 → 62.7 | 36 / 70 → 549 / 994 | 49.9 → 53 ; 49.7 → 52.6 |
| 25 | phone | 25 → 9 | 31 → 13 | 1,114 → 645 | 0 → 0 | 489.3 → 62.7 | 42 / 75 → 524 / 989 | 49.9 → 52.9 ; 49.6 → 52.6 |
| 25 | throttled | 25 → 9 | 29 → 11.7 | 2,936 → 1,968 | 0 → 0.3 | 489.3 → 62.7 | 70 / 120 → 582 / 1013 | 49.4 → 52.7 ; 49.3 → 52.5 |
| 35 | chromebook | 35 → 9 | 40.7 → 9.7 | 1,415 → 709 | 0 → 0 | 925.2 → 75.4 | 44 / 75 → 564 / 966 | 50 → 52.4 ; 49.6 → 52.6 |
| 35 | ipad | 35 → 9 | 41.7 → 13.7 | 1,430 → 662 | 0.3 → 0 | 924.8 → 75.4 | 40 / 74 → 565 / 967 | 50 → 53 ; 49.7 → 52.7 |
| 35 | phone | 35 → 9 | 42 → 12.7 | 1,373 → 669 | 0 → 0 | 925.7 → 75.4 | 49 / 89 → 553 / 967 | 50 → 52.9 ; 49.6 → 52.6 |
| 35 | throttled | 35 → 9 | 39.3 → 9.3 | 3,999 → 1,952 | 1.3 → 0 | 924.2 → 75.4 | 103 / 194 → 571 / 978 | 49.5 → 52.8 ; 49.4 → 52.5 |
| 45 | chromebook | 45 → 9 | 54.3 → 12.3 | 1,689 → 716 | 0 → 0 | 1,499.9 → 87.9 | 49 / 84 → 575 / 972 | 50 → 53 ; 49.6 → 52.5 |
| 45 | ipad | 45 → 9 | 53.3 → 13.3 | 1,700 → 722 | 0.3 → 0 | 1,500.4 → 87.9 | 51 / 95 → 571 / 968 | 50.1 → 53.1 ; 49.7 → 52.7 |
| 45 | phone | 45 → 9 | 56 → 17.3 | 1,775 → 699 | 0 → 0 | 1,499.7 → 87.9 | 42 / 71 → 532 / 951 | 50 → 53.1 ; 49.6 → 52.6 |
| 45 | throttled | 45 → 9 | 49.7 → 9.7 | 4,377 → 2,107 | 0.3 → 0 | 1,500.3 → 87.9 | 86 / 191 → 548 / 991 | 49.5 → 53 ; 49.3 → 52.5 |
| 64 | chromebook | 64 → 9 | 72.7 → 11.7 | 3,008 → 828 | 0.3 → 0 | 2,981.6 → 111.8 | 70 / 123 → 560 / 985 | 50.1 → 53.3 ; 49.6 → 52.6 |
| 64 | ipad | 64 → 9 | 73 → 13.7 | 2,912 → 713 | 0 → 0 | 2,982.9 → 111.8 | 77 / 126 → 567 / 996 | 50.1 → 53.2 ; 49.7 → 52.7 |
| 64 | phone | 64 → 9 | 71.7 → 13 | 2,972 → 750 | 0 → 0 | 2,982.2 → 111.8 | 78 / 135 → 561 / 993 | 50.1 → 53.3 ; 49.6 → 52.7 |
| 64 | throttled | 64 → 9 | 38.3 → 9.7 | 6,497 → 2,296 | 27.3 → 0.7 | 2,973.0 → 112.3 | 278 / 568 → 613 / 1043 | 49.6 → 53.1 ; 49.4 → 52.6 |

- The standings' main-thread cost per round on a Chromebook is flat in the
  class size (606 ms at 5 students, 828 ms at 64; it was 649 → 3,008 ms), the
  throttled Chromebook's long tasks are gone (27.3 → 0.7 per round at 64;
  main thread 6,497 → 2,296 ms), and React commits attributable to standings
  fall 73 → 12 per round at 64.
- "Firestore KB" is what the browser received from the emulator. Before, the
  emulator re-sent the whole players query result on every change (2.98 MB
  per screen per round at 64 — an emulator artifact; production would have
  sent ≈ 47 KB). The snapshot is a document listener, so after this change the
  emulator and production agree: 112 KB per screen per round at 64, room
  snapshots included.

## 8. Answer latency, before / after

**Answer latency (ms): Lock In → callable sent → commit → the student's accepted state**

| students | before: sent → reply p50 / p95 / max | after: sent → reply p50 / p95 / max | control (no standings): p50 / p95 | Lock In → sent p50 | callable start → commit p50 | commit → accepted p50 / p95 | harness worker load (ELU max) | emulator CPU % |
|---|---|---|---|---|---|---|---|---|
| 5 | 81.7 / 94.3 / 106 | 84.7 / 90.3 / 102 | 63.3 / 67.7 | 15.3 → 15.7 | 45.7 → 57.3 | 37.7 / 43.7 → 25.7 / 28.3 | 0.021 → 0.04 | 14.4 → 13.8 |
| 15 | 80.3 / 122 / 194 | 58 / 86.7 / 118 | 55.3 / 64.7 | 15 → 15 | 31.7 → 35.3 | 47.3 / 65.7 → 21.3 / 26.7 | 0.056 → 0.032 | 17.8 → 14 |
| 25 | 87.7 / 129 / 165 | 53.7 / 71 / 114 | 51.3 / 67 | 15.3 → 15 | 30.7 → 33.3 | 57.7 / 88.7 → 20 / 30.3 | 0.096 → 0.049 | 20.2 → 13.4 |
| 35 | 122 / 180 / 268 | 51.7 / 67 / 80 | 51.3 / 61.7 | 15.3 → 15 | 30 → 31 | 87.3 / 136 → 20 / 27.3 | 0.249 → 0.051 | 27.1 → 11.5 |
| 45 | 180 / 262 / 445 | 51 / 75.7 / 111 | 51 / 70.7 | 15.7 → 15 | 34 → 30 | 128 / 177 → 20.7 / 26.3 | 0.524 → 0.058 | 38.9 → 12 |
| 64 | 1,640 / 4,438 / 5,640 | 49.7 / 72 / 118 | 49 / 63 | 27.3 → 15 | 353 → 29 | 1,270 / 4,109 → 20.7 / 26 | 0.869 → 0.066 | 79.9 → 16.2 |
| 96 | 9,149 / 24,201 / 28,882 | 50.3 / 85 / 219 | 47.7 / 69 | 31 → 15.3 | 366 → 27.7 | 8,840 / 23,786 → 21.7 / 31 | 0.981 → 0.094 | 102 → 21 |

Answers are as fast as with no standings at all: 50 / 72 ms at 64 against the
no-standings control's 49 / 63 (it was 1,640 / 4,438). Callable start →
commit is unchanged; the old latency was the device farm drowning in fan-out
(worker load 0.87 → 0.07, emulator CPU 80 % → 16 % at 64) — in a classroom,
each device's own CPU, which §7's browser rows show directly. In the launch
certification's own games (disruptions included) the answer round trip at 64
went from 3,507 / 7,561 ms to 92 / 170 ms (§10).

## 9. Standings-display latency, before / after

**Commit → the answer is in the standings a classmate's screen shows (ms, every answer × every other screen)**

| students | before p50 / p95 / max | after p50 / p95 / max | after: pairs shown |
|---|---|---|---|
| 5 | 23 / 30 / 37 | 223 / 1,355 / 1,489 | 60 of 60 |
| 15 | 33.7 / 48 / 91 | 615 / 1,014 / 1,053 | 630 of 630 |
| 25 | 44 / 72.7 / 95 | 540 / 978 / 1,024 | 1800 of 1800 |
| 35 | 70.7 / 112 / 160 | 509 / 958 / 1,019 | 3570 of 3570 |
| 45 | 105 / 156 / 250 | 525 / 998 / 1,046 | 5940 of 5940 |
| 64 | 2,857 / 4,331 / 4,744 | 562 / 978 / 1,045 | 12096 of 12096 |
| 96 | 6,329 / 9,577 / 14,194 | 542 / 964 / 1,103 | 27360 of 27360 |

Bounded, not instant: 0.5–0.6 s at the median and within 1 s at p95 at every
size from 15 to 96 (max 1.1 s), because live snapshots come at most once a
second. Before, it was faster in small classes (30–100 ms, every row
delivered directly) and collapsed at 64 (2.9 s / 4.3 s) and 96 (6.3 s /
9.6 s). In the browser the same shape: 560 / 985 ms on a Chromebook at 64
(it was 70 / 123), and 613 / 1,043 ms on the throttled Chromebook (it was
278 / 568 — bought, before, with 6.5 s of main thread and 27 long tasks per
round while its student was trying to answer). Round results, the round's
standings and the final podium are not live: they are exact, written in the
closing and finishing commits.

A first measurement showed 1 s / 1.9 s (p50 / p95): the server's floor equal
to the host's interval refused every other request (§4). The table is after
that fix.

## 10. The 64-student result

- **Launch certification at 64** (dedicated emulator, real callables, every
  device a real Firestore client; offline-at-zero, frozen Chromebook, late
  listener, mid-round refresh, lost reply, forged second answer in every
  game): every device played every round; every answer accepted exactly once;
  scores, placements, final standings and podium seat-by-seat equal to the
  match result; no duplicate players or rewards; one room, one snapshot and
  one own-row listener per screen and no player-row listener; all listeners
  closed at the end. Answer round trip 92 / 170 ms (p50 / p95; main
  3,507 / 7,561); the late listener on screen 1.7 s after zero (main 4.6 s),
  the refreshed page 1.3 s (main 4.9 s). The game takes ≈ 25 s instead of 60 s
  on main, and the whole certification 4 m 8 s instead of 4 m 39 s, with one
  more game in it.
- **Profile at 64:** 8.7 standings documents per screen per round (was 69.5);
  555 per round for the class (was 4,450); answer round trip 50 / 72 ms (was
  1,640 / 4,438); classmates' answers shown 562 / 978 ms (was 2,857 / 4,331).
- **Browser at 64:** 9 standings documents per screen per round (was 64);
  Chromebook main thread 828 ms per round (was 3,008); throttled Chromebook
  2,296 ms and 0.7 long tasks (was 6,497 ms and 27.3).


**The launch certification, main → this PR, at every size:**

| students | answer round trip p50 / p95 / max ms (main) | (this PR) | late listener on screen after zero (main → PR) | refreshed page on screen after zero (main → PR) | standings snapshots per screen per game, max (bound) | live snapshots written | listeners per screen |
|---|---|---|---|---|---|---|---|
| 5 | 86 / 376 / 376 | 82 / 385 / 385 | 1672 → 1682 ms | 1325 → 1308 ms | 18 (36) | 12 | 3 |
| 15 | 153 / 362 / 406 | 109 / 336 / 351 | 1914 → 1916 ms | 1413 → 1415 ms | 15 (36) | 10 | 3 |
| 25 | 204 / 447 / 547 | 88 / 128 / 337 | 1924 → 1812 ms | 1827 → 1412 ms | 18 (37) | 13 | 3 |
| 35 | 528 / 1035 / 1258 | 84 / 154 / 364 | 2584 → 1911 ms | 2244 → 1342 ms | 17 (37) | 12 | 3 |
| 45 | 1304 / 2541 / 3035 | 82 / 167 / 337 | 2075 → 1626 ms | 2232 → 1258 ms | 18 (36) | 13 | 3 |
| 64 | 3507 / 7561 / 9604 | 92 / 170 / 357 | 4617 → 1713 ms | 4864 → 1295 ms | 17 (37) | 12 | 3 |

## 11. Reconnect and offline (cases 1–9)

Certified in every game of the launch certification at 5, 15, 25, 35, 45 and
64 students, and in the browser shell QA:

| # | Case | Where it is certified | Result |
|---|---|---|---|
| 1 | online through the countdown | every lobby device, every size | played every round; final snapshot exact |
| 2 | offline at zero | `offlineAtZero` (offline 400 ms before zero, back 2.5 s after) | round 1 on screen at once; answered; its diagnostics show the loss and return |
| 3 | reconnect mid-round | endurance: two devices drop around every round's start and return 1.2–2.2 s later, 4 matches × 3 rounds; shell QA `reconnect` | every answer counted once; the snapshot after reconnect is the latest one |
| 4 | refresh after running | `refreshesAfterRunning` (new page 1 s after zero, same tab storage) | back on round 1 (1.4 s after zero at 64; 4.9 s on main) |
| 5 | frozen / backgrounded Chromebook | `backgrounded` (frozen through zero, 1 s ticks, slow link); the 4×-throttled Chromebook in the browser | played round 1; no long tasks from standings |
| 6 | late listener, first state running | `lateListener` (attaches 1.5 s after zero) | played round 1 from the running room (1.7 s after zero at 64; 4.6 s on main); a late listener on a finished match reads its final snapshot and its own place |
| 7 | missed snapshots | a snapshot is replaced whole, so a screen that missed any (offline, frozen, or a host that went quiet mid-game) holds the next one complete; the "host stops publishing" game: no live snapshot after round 1, every screen still ends exact | exact at every close and the finish |
| 8 | reconnect after a round closed | shell QA `reconnect`: offline through the close, then back | catches up to the results; standings exact |
| 9 | reconnect during the next-round transition | endurance drops start 300 ms before each later round's zero | played the round; no stale standings across rounds or matches |

## 12. Memory and listeners

- **Per screen, constant:** room, standings snapshot, own row, invite — four
  whatever the class size (three on main: room, players, invite — but the
  players listener carried N rows). Certified after every endurance match and
  at every size; zero after cleanup. Both standings listeners pause during an
  open Graph Feature Rush round (certified: 0 open during the round, 30
  students).
- **Repeated matches:** endurance (4 matches, 20 students, strategies rotated
  Accuracy First → Grand Prix → Correct Count → Accuracy First, unrefreshed
  screens, two devices dropping around every round): heap 207.8 → 210.2 MB
  across the farm, −0.9 MB after warm-up (main: 210.9 → 221.6, +6.9 MB); four
  listeners per device after every match. Profile (25 students × 4 matches):
  heap growth −9 MB after warm-up, 100 listeners after the last match
  (4 × 25), 0 after cleanup.
- **Browser:** heap after a forced GC 49.6 → 52.6 MB lobby → final screen at
  every size on every device, as before.

**Repeated matches on the same open screens (25 students, 4 matches)**

| design | heap MB after each match (all devices) | growth after warm-up | listeners after the last match | after cleanup |
|---|---|---|---|---|
| before | 141.1 → 219.2 → 225.3 → 217.3 → 219 | -6.3 MB | {"room": 25, "players": 25, "invite": 25, "total": 75} | {"room": 0, "players": 0, "invite": 0, "total": 0} |
| after | 137.5 → 213.7 → 217.2 → 219.4 → 208.2 | -9 MB | {"room": 25, "standings": 25, "self": 25, "players": 0, "invite": 25, "total": 100} | {"room": 0, "standings": 0, "self": 0, "players": 0, "invite": 0, "total": 0} |

## 13. Security model

- **Who writes the snapshot:** only the server, in three places — the live
  publish (the room's own teacher or a root admin may ask; the server reads,
  ranks and decides), the round-close and finish transactions, and the
  one-time repair of a finished room's final from its match result. Rules:
  no client creates, updates or deletes `standings/*` (tested).
- **Who reads it:** exactly the room's audience — its teacher, its invited
  students, a root admin — the same audience as the room and its round
  results (tested: another room's student, another teacher and a stranger are
  refused).
- **What it holds:** what every student in the room is already shown — game
  alias, rank, whether it is shared, score, seat, how many are playing, the
  round and the strategy. Never a student id, email, name, answer or answer
  content, per-player timestamp, provisional-progress time, diagnostic,
  connection state, or anything about supports and accommodations: the
  builder copies an allow-list of fields, so a field added to a player row
  can never leak into it (unit test feeds it all of those and finds none; the
  integration suite checks every snapshot it sees). The seat is the player's
  index in the room's already-shuffled alias order, so it says nothing about
  the roster.
- **Authority:** nothing is scored from it. Answers never read or write it
  (the accounting test proves zero standings reads or writes in the answer
  callable); a lying or deleted snapshot changes no score, placement, reward or
  final standing (tested); the round's exact snapshot and the final are
  written from the private records and the match result inside the
  transactions that compute them, and a final is never replaced.
- **Player rows:** unchanged in this release — the room's audience reads them.
  The new student screen listens only to its own row, but a screen loaded
  before this release still lists every row until it reloads (the build
  freshness notice never forces a reload), so tightening students to their
  own row is a separate, later rules deploy (§14). That removes the one
  remaining classmate-visible timing surface (each row's `updatedAt`,
  `provisionalAt`, `answeredRound`), which this release does not widen.
- **Abuse bounds:** a publish is written at most once every 750 ms per room
  and only for the room's teacher; a repair is idempotent and only for a finished
  room's own audience; a running match can never be given a final snapshot
  (tested — it would freeze every board).

## 14. Deployment requirements

1. **Order: Functions, then Rules, then Hosting**, through
   `node scripts/release-firebase.mjs` (which already deploys in that order and
   stops before Rules and Hosting if a function did not ship), outside a live
   game.
   - Functions first: the new callables (`publishLiveChallengeStandings`,
     `ensureLiveChallengeFinalStandings`) must exist before a new screen calls
     them, and rooms created from then on carry seats. Old screens are
     unaffected: every new field is additive and they never read the
     snapshot.
   - Rules before Hosting: a new screen reads `standings/current`, which the
     current rules deny.
   - Hosting last, with `npm run deploy:hosting` (never a raw `firebase deploy
     --only hosting`).
2. **No index, no backfill.** The snapshot is one document; the publish reads
   one collection with no filter or order. Rooms created before the deploy
   have no seats and are seated by player key (`slotKeys`); a finished room
   without a final snapshot gets one from its match result the first time a
   screen opens it.
3. **Reload the teacher console after Hosting.** A console from before the
   release never asks for live snapshots: students then see the exact
   standings at each round close and at the finish, and a lobby count of
   their own until the first close — correct, but not live. The build
   freshness notice offers the reload.
4. **Later, separately — tighten player rows** (once no student page from
   before this release can still be open, e.g. a week after Hosting): in
   `firestore.rules`, add
   `&& get(/databases/$(database)/documents/liveChallengeInvites/$(request.auth.token.studentId)).data.playerKey == playerKey`
   to the student clause of `match /players/{playerKey}`, and make the rules
   test assert that a student is refused a classmate's row and the whole
   collection. Rules only; no client or function change.
5. **Rollback.** Hosting can roll back alone (old screens work with the new
   functions and rules). Rolling functions back leaves new screens without
   live publishes and without exact snapshots for new rooms — roll Hosting
   back first.

## 15. The remaining real-Firestore question, and the runbook

**What the emulator cannot answer.** Everything about correctness, listener
counts and how many standings documents each screen receives is certified on
the emulator. What it cannot tell us is how the **production backend**
delivers fan-out: the emulator re-sends a whole query result per change (so
its "before" bytes are inflated) and shares one machine with the harness (so
its latencies include the harness). The open question is therefore narrow:
*at 64 students on real Firestore, how long does a classmate's answer take to
reach the other screens, and how many documents are delivered (billed), in the
old pattern and in the new one?*

**This PR does not run that test**, and nothing here touches
`mathmaster-aleks`. It ships an operator probe instead:
`scripts/probe-live-challenge-standings-fanout.mjs`.

- It refuses the production project id outright, refuses to start unless the
  project is named twice (`--project X --confirm-non-production X`), and
  refuses an emulator address unless asked for an emulator dry run.
- It deploys nothing, calls no Cloud Function and touches no MathMaster
  collection: it writes only under `standingsFanoutProbe/{runId}` with the
  Admin SDK (so no rules are involved) and deletes that tree at the end, even
  after a failure.
- It runs the two patterns on the same class and the same answers: `legacy`
  (every screen lists every player row) and `projection` (every screen listens
  to one snapshot and its own row; one publisher reads every row in a
  read-only transaction at most once a second while rows change). Each screen
  is its own Admin SDK client and connection.
- It reports, per round: documents delivered per screen and in total, each
  answer's commit → each other screen's first delivery reflecting it (p50 /
  p95 / max, with the local clock's measured offset from Firestore), and the
  publisher's reads and writes.

**Runbook (an operator with a non-production project).**

1. Create or pick an isolated Firebase project (for example
   `mathmaster-loadtest`) with Firestore in Native mode, in the same region as
   production. Nothing else needs deploying.
2. Create a service account in that project with the *Cloud Datastore User*
   role and download its key; nothing in production needs to change.
3. From a machine with a stable network (Cloud Shell is fine):
   ```bash
   npm --prefix functions ci   # the probe uses functions' firebase-admin
   GOOGLE_APPLICATION_CREDENTIALS=$HOME/loadtest-sa.json \
   node scripts/probe-live-challenge-standings-fanout.mjs \
     --project mathmaster-loadtest --confirm-non-production mathmaster-loadtest \
     --students 64 --rounds 3 --out probe-64.json
   ```
   Optionally repeat with `--students 35` and `--students 96`.
4. Read the summary table it prints (and `probe-64.json`). Expect `legacy` to
   deliver ≈ N documents per screen per round (≈ N² per class) and
   `projection` ≈ one snapshot per second of answering plus one own-row
   update per screen; compare their commit → shown latencies.
5. Cost: at 64 students × 3 rounds the run is ≈ 12k listener reads for
   `legacy` and ≈ 4k for `projection`, plus ≈ 400 writes — well under a dollar.
   The probe deletes its data; the project can be deleted afterwards.

An emulator dry run checks the probe itself (its numbers are the
emulator's):
```bash
npx firebase emulators:exec --only firestore --project demo-standings-probe \
  --config tests/browser/emulator/firebase.json \
  "node scripts/probe-live-challenge-standings-fanout.mjs --emulator --students 8 --rounds 2"
```

## Mutation testing (the projection / finality boundary)

Every mutant was applied, the relevant suite run, and the file restored
(`node mutate.mjs`, scratch runner; counts are mutants killed / applied):

| Surface | Suite | Killed |
|---|---|---|
| projection module: finality and ordering (a live snapshot over the final, an earlier moment over a later one, live over exact at the same moment, an equal read replacing), exactness flag, top-row and class-size bounds, work in progress past the deadline, an unjoined player ranked, another room's snapshot shown, shared places, legacy seating, digest blind below the top rows, control characters in aliases, private fields passing through, ranking without the room's strategy | `tests/platform/liveChallengeStandingsProjection.test.mjs` | 16 / 16 |
| server: the finish writes no final / writes it live / builds it from the private records; Close Round and Next Round write no exact snapshot; a close drops a player; anyone may publish; no interval; unchanged boards rewritten; live over exact; open rush rounds publish; the answer path reads / writes the snapshot; a stranger repairs; a running match gets a final; a repair overwrites a final | `tests/integration/liveChallengeStandings.test.mjs` (emulator) | 16 / 16 |
| an answer that depends on the publisher's read | same, with the database refusing the publisher | 1 / 1 |
| pacer: no trailing edge, too-soon not retried / retried at once / starting a new interval, failures retried without back-off / never, stop not stopping, signature blind to scores or ranks, rush / lobby / finished rooms, the interval ignored everywhere, the server's wait ignored everywhere, the server floor back at the host's interval | `tests/platform/liveChallengeStandingsPacer.test.mjs` | 15 / 17 — the two survivors each remove one of two places that enforce the interval (the slot computation, the fire-time check); either alone still enforces it, and removing both is killed |
| certification integrity under a placement strategy (a Grand Prix score that is not its championship total) | the launch certification's endurance games | 1 / 1 |
| host-console mirror: the console stops publishing, publishes when not live, keeps asking after the end; the simulated host without work in progress, publishing in a rush round, after the end | `tests/platform/liveChallengeStandingsWiring.test.mjs` | 6 / 6 |
| emulator-only guard (below) | `tests/platform/liveChallengeEmulatorOnlyClient.test.mjs` | 5 / 5 |
| client contracts (screen ↔ simulated device; final only from the FINAL snapshot; own-row lock; both listeners paused in a rush) | the rewritten shell, rush, question-style, repeated-match and mirror contracts | 9 / 9 |

## Harness defects found and fixed on the way

- **The simulated host console loaded the production Firebase config.** The
  certification's main thread never registered the module hook that points
  the client service at the emulator, so the host's
  `liveChallengeService.js` resolved `src/firebase.js` (project
  `mathmaster-aleks`). The first certification run showed it: no live
  snapshot ever reached a screen. At most, the host's two listeners could
  have sent unauthenticated listen requests to the production project for room
  ids that exist only in the emulator (the rules refuse unauthenticated reads);
  nothing was written — every callable runs in-process against the emulator.
  Fixed for good: every thread that loads the client service now goes through
  `tests/integration/support/registerClientFirebase.mjs`, which installs the
  hook and then refuses to continue if any non-emulator Firebase app is
  loaded; the hook itself refuses to resolve `src/firebase.js` at all. Pinned
  by `tests/platform/liveChallengeEmulatorOnlyClient.test.mjs` (5 / 5 mutants
  killed).
- **A paused simulated host still sent the request it owed.** Pausing now
  stops its pacer's timers, as a closed or asleep console's are.
- **One 64-student game timed out once** (round 3 waited 25 s for one
  1.5-s-jitter device) in a full run, and never again in eight more
  64-student games (three full runs, four repeats of 35/45/64, one alone).
  Not explained by contention: a read-only transaction holds no lock on the
  emulator (measured). The timeout message now dumps the devices being waited
  on first, with their answer records, so a recurrence names its cause.

## Verification

All on this branch, on the emulator only (no real project was used):

| Gate | Command | Result |
|---|---|---|
| platform suite | `npm run test:platform` | 8,733 / 8,733 |
| tool tests | `node --test tests/tools/*.test.mjs` | 1,176 / 1,176 |
| security rules | `npm run test:rules` | 225 / 225 and 148 / 148 |
| integration (Live Challenge finish, engine, hardening, shell, GFR, rewards, the new standings suite, …) | `npm run test:challenge-finish` | 304 / 304 |
| launch certification, dedicated emulator (#427 launch, #433 isolation) | `npm run test:live-challenge-launch:emulator` | 10 / 10 (5, 15, 25, 35, 45, 64 students; quiet host; Graph Feature Rush 30; endurance × 4 with three strategies; report) |
| browser shell QA (classic, scoring, rush, reconnect, launch, big-class, repeat, endurance, adversarial) | `node tests/browser/liveChallengeShellQa.mjs` | no findings |
| browser standings profile (Chromebook, iPad, phone, throttled Chromebook; 5–64 students) | `SHELL_QA_SCENARIOS=standings node tests/browser/liveChallengeShellQa.mjs` | no findings (§7, §9) |
| Graph Feature Rush in the browser | `node tests/browser/graphFeatureRushGame.mjs` | 5 / 5 scenarios, no findings |
| a whole game in the browser | `node tests/browser/liveChallengeGame.mjs` | 10 / 10 steps, no production contact |
| repeated matches in the browser | `node tests/browser/liveChallengeRepeatedMatches.mjs` | 18 / 18 |
| rewards in the browser | `node tests/browser/rewardsQa.mjs` | 28 / 28 |
| profile, node (5–64 + 96, repeat × 4) | `npm run profile:live-challenge-standings` | §6–§9, §12 |
| operator probe, emulator dry run | `scripts/probe-live-challenge-standings-fanout.mjs --emulator` | runs both patterns, cleans up |
| lint | `npm run lint` | clean (no finding on any added line) |
| builds | `npm run build`, `npm run build:firebase` | both build |

Countdown timeouts, answer timeouts and diagnostic budgets are unchanged. The
launch certification's own per-screen standings bound is computed from the
server's write floor and the game's length, so it is independent of class
size (observed 15–18 snapshots per screen per game against a bound of 36–37);
its match-integrity check now applies each strategy's own scoring rule
(points per answer, or placement points per round), which the endurance
games' strategy rotation needed.
