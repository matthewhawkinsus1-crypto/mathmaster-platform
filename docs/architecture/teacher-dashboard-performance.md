# Teacher dashboard performance and memory — audit, fixes, certification

*Job 5, 2026-09-24. Builds on #313 (fast Teacher Preview / Walkthrough) and
#314 (compact roster, detail-only full histories).*

## What was measured

| Source | Finding | Status |
| --- | --- | --- |
| Firestore listeners | 26 `onSnapshot` call sites and 23 `watch*`/`subscribe*` service calls. Every one is owned: services return the unsubscribe; components open listeners only as a `useEffect` return value or into a variable/array the cleanup releases. No listener accumulates on navigation. | Verified; now enforced by `tests/platform/listenerLifecycleGuard.test.mjs` |
| Presence stream | On Home and Classes the dashboard subscribes to one `presence/{studentId}` document per rostered student (roster-scoped so rules can restrict reads). Each device heartbeats every 20 s, and **every snapshot called `setState` on the root `App`** — re-rendering the entire teacher dashboard. | **Fixed** (below) |
| Full grade histories | Only detail tabs (`students`, `grades`, `analytics`, …) hold full grade documents; Home, Assignments, Library, Classes and Pacing use the compact roster. | #314; covered by `teacherMemoryFootprint.test.mjs` |
| Teacher Preview / Live Teaching | Preview stops the per-student presence listeners and reuses the real student renderer with drafts isolated. | #313; covered by `liveTeachingIsolation`, `teacherStudentPreviewReviewWiring` |

## The presence fix — before and after

`src/platform/performance/coalescedKeyedUpdates.js` collects the latest
snapshot per student and flushes them together at most once per second
(`PRESENCE_FLUSH_MS`); the first flush is immediate, a batch that changes
nothing keeps state identity so React skips the render, and the buffer is
cancelled with the listeners.

Measured in `tests/platform/teacherPresenceCoalescing.test.mjs` on a
deterministic clock (initial snapshots, then every student heartbeating on its
own phase):

| Roster | Dashboard renders per minute, before | after |
| --- | --- | --- |
| 150 students (all classes on Home) | 600 | 61 |
| 30 students (one class) | 120 | ≤ 61 |

The room ends in exactly the same state either way — no presence update is
dropped. Presence already had 20-second resolution, so a one-second batch is
invisible to the teacher.

## Remaining hotspots (not changed here)

1. **`App.jsx` is one component holding almost all teacher state.** Any state
   change re-renders the whole tree. The presence stream was the largest
   continuous source; others (toasts, timers such as `now`) remain. The durable
   fix is moving teacher tabs into their own components with their own state —
   a large refactor that needs its own PR.
2. **The grades document is a whole-student record** (see
   `docs/handoffs/PERFORMANCE_CERTIFICATION.md`). Detail tabs still download
   full histories for every student in scope. Per-assignment documents would cut
   transfer but change Grade Center, passback and rules together.
3. **Live Class Monitor at very large rosters.** Presence listeners are one per
   student by design (rules scope); at hundreds of students the listener count
   itself, not the render rate, becomes the cost. A per-class presence summary
   written by the server would reduce that to one listener per class.

## Repeatable memory certification (manual, Chromebook profile)

1. Open DevTools → Performance monitor; show *JS heap size*, *DOM Nodes*,
   *JS event listeners*.
2. Sign in as a teacher with a full roster. Record the three numbers on Home.
3. Run this loop ten times: Home → a class → an assignment → *View as Student*
   → Next question × 3 → exit preview → another class → Home.
4. Force garbage collection (the trash-can icon) and record again.
5. Pass: DOM nodes and JS event listeners return to within 5% of step 2; heap
   growth under 50 MB across ten loops. A steady climb in listeners is a leak —
   the lifecycle guard names the unowned call site if one is introduced.
6. `window.__MATHMASTER_PERFORMANCE__.snapshot()` reports the p50/p95 spans
   (`workview_ready_ms`, navigation) for the same run.

An automated version needs the Firestore emulator with a seeded teacher, roster
and presence documents (the Test Cycle device harness is the model); it is the
next step for this certification.
