# Platform performance certification

## Architecture and targets

The browser records bounded, in-memory p50/p95 diagnostics at
`window.__MATHMASTER_PERFORMANCE__.snapshot()`. Only allow-listed operational
dimensions enter the channel; answers, prompts, keys, seeds, and student ids are
discarded. Ordinary assignment submission commits an immutable action envelope
to the IndexedDB outbox before updating React state; assignment revalidation,
evidence append, and the canonical Firestore write then reconcile in capture
order. The envelope remains queued until the complete authoritative operation
succeeds. Secure Test Cycle grading remains on its existing server-authoritative
path and secure assignments are excluded from question prefetch and the outbox.

Targets are `<100 ms` local submit acknowledgement, `<150 ms` prefetched Next,
and zero awaited secondary writes. Server and startup targets are reported as
p50/p95 rather than treated as flaky unit-test timers.

## Baseline and build evidence

The baseline production build at `3888d86` emitted 5 JavaScript chunks,
5,568,905 bytes total. Its largest `LiveChallengeStudent` chunk was 3,313,163
bytes because the eager tool registry travelled with that route. The first PR
pass emitted 45 intentional feature chunks, 5,653,608 bytes total, and reduced that
largest route chunk to 1,452,440 bytes (56.2%). Total bytes are not presented as
an improvement: shared chunk boundaries add about 1.5%, while basic student
routes stopped downloading every registered Work View implementation. The final
follow-up measurements and further core split are recorded below.

Timing baselines were previously unavailable because no structured student-flow
instrumentation existed. The first post-deploy samples therefore establish the
honest p50/p95 baseline; this PR does not invent browser numbers from unit-test
timers. Locally, architecture certification verifies that acknowledgement is a
microtask after capture and that Next changes React state before any network
request. Real server p95, cold-start, and 30-client emulator latency must be
recorded by the device/emulator harness described below.

## Repeatable checks

1. Run `npm run build` and `npm run certify:performance` for event and bundle
   reporting.
2. In DevTools, call `window.__MATHMASTER_PERFORMANCE__.snapshot()` after the
   representative flow.
3. Certify Chromebook `1366x768` and phone `390x844`: dashboard, assignment,
   basic/choice/expression/tool questions, Submit, Next, Work View reopen, and
   offline/reconnect. Since November 2026 this flow is a driver,
   `tests/browser/teacherWorkflow/studentRuntimePerformance.mjs`; see the last
   section for how to run it and what it found.
4. For class-size load, run 30 isolated emulator clients with distinct student
   identities and submission ids. Never reuse production student accounts.

## Deliberately deferred risk

The grades document remains a large whole-student record. Splitting it into
per-assignment documents could reduce transfer and write contention, but is not
safe in this PR because Grade Center, Classroom passback, rules, and historical
records share that schema. Cloud Function `minInstances` is also not enabled
without production traffic/cost evidence; keeping every endpoint warm would
create an open-ended bill. The next audit should use production-safe traces to
choose only latency-critical callables.

## Deployment

No rules or Functions contract changed. Deploy with
`npm run build && npm run build:firebase`, then
`firebase deploy --only hosting,firestore:rules`.

## Durable outbox and recovery

Ordinary Submit, Step Algebra step submission, Next, and eligible personalized
question replacement now cross an IndexedDB durability boundary before React
moves forward. Each immutable envelope has a UUID action id, student/assignment/
question identity, a creation time, and only the student's ordinary response or
progress payload. Secure Test Cycle responses never enter this outbox.

Reconciliation is globally serialized in capture order. A Firestore transaction
re-reads assignment authority and the latest question record. Deleted, closed,
or audience-revoked assignments reject and remove stale queued work. Submission
records store `lastSubmissionId`; the expected prior attempt count prevents an
old action overwriting a legitimate later attempt. Recovery can therefore repeat
the grade transaction and deterministic evidence `setDoc` without adding an
attempt or evidence event. Progress envelopes merge only maximum elapsed time
into the newest canonical record and cannot replace an answer.

Step submissions retain the complete result produced by the existing
`recordQuestionStep` grading engine, so partial credit, attempt policy, equation
splits, inequalities, sign changes, extraneous-solution state, Undo state, and
support usage are unchanged. Rapid steps and a following Next share the same
ordered queue. Question replacement keeps the existing choice-only prohibition,
practice behavior, DOL-history clearing, and server lifecycle revalidation, but
no longer performs a redundant pre-interaction assignment read.

All dynamic paths use explicit Firestore `FieldPath` segments, so assignment ids
containing periods or backticks cannot be parsed as nested paths. Classwork and
DOL entries are written only when the envelope explicitly says they exist;
zero-valued grades remain values and are never converted to `deleteField()`.
The non-blocking status distinguishes device capture, queued server saving, and
server durability.

## Firestore audit findings

The audit inspected every `onSnapshot`, `getDoc/getDocs`, and write call under
`src`, with focused review of App student hydration, assignment runtime,
presence/Live View, Grade Center, and evidence persistence.

- The four App listener families return their unsubscribe functions; roster
  fan-out collects and tears down every per-student unsubscribe. No leaked or
  equivalent duplicate listener was found.
- Presence writes are already heartbeat-coalesced and use a mutable payload ref;
  answer keystrokes do not write Firestore. Draft keystrokes use local browser
  draft storage, not remote writes.
- Teacher evidence history is demand-loaded, bounded, and not subscribed on the
  student Work View path. Grade Center consumes the hydrated grade record rather
  than rereading an assignment per row.
- Independent critical transaction reads are issued together. The outbox removes
  the redundant pre-write assignment `getDoc` and combines assignment/grade
  authority reads in one transaction retry.
- The verified write-amplification bug was whole-map replacement during rapid
  answers. It is fixed with per-question `FieldPath` writes and serialized
  reconciliation. The large whole-student grade document remains a migration
  risk, not something to rewrite without rules/Classroom/history migration.

## React and Work View audit

QuestionEngine already deep-stabilizes authored question/profile/adaptation
objects, and its key changes only for assignment, question index, variant,
preview session, or lifecycle—not answer text, graph points, live presence, or
teacher data. Registered tools enlarge the same child instance instead of
constructing a second Work View. Tool undo/camera state remains isolated.

The diagnostics now record render, mount, and unmount counts for QuestionEngine,
Universal Work View, and every ToolShell (including Step Algebra, Graphing2,
Sequence Explorer, Systems, Data Modeling, and Regression Calculator) without
recording props. Architecture contracts protect the stable key, lazy boundary,
and same-instance Work View. Browser matrix certification remains the rendered
proof for typing/plotting/remount behavior.

## Final bundle measurements

| Build | JS chunks | Total JS | Core entry | Largest student feature |
| --- | ---: | ---: | ---: | ---: |
| Original base `3888d86` | 5 | 5,568,905 B | 2,178,610 B | Live Challenge 3,313,163 B |
| PR first pass | 45 | 5,653,608 B | 2,179,766 B | Live Challenge 1,452,440 B |
| Final follow-up | 133 | 5,691,897 B | 926,995 B | MathLive 800,602 B |

The follow-up moves QuestionEngine (423,207 B), teacher
creation/repair, Path simulator, analytics, Classroom manager, secure exam, and
admin surfaces behind coarse feature boundaries. The core entry is 57.5% below
the original. The complete initial module graph is 3,862,678 bytes across 64
requests versus the original 5,568,905-byte graph (30.7% less); question and
tool code arrives when an assignment needs it. MathLive remains in that graph
through shared dashboard math rendering and is an explicit follow-up target.
Total emitted JS is 2.2% above the original because shared modules now have
independent cacheable boundaries. The 133 chunks are build outputs, not startup
requests; route imports select only their feature dependency graph.

## Cloud Function latency audit

A clean local process required `functions/index.js` in about 456 ms and 66 MB
RSS. Critical endpoint review found:

- `submitSecureExamResponse` reads session and idempotency marker together inside
  its transaction and has no external service call.
- `submitPathResponse` parallelizes mastery, retention, and coverage reads, then
  reads session and submission marker together; adaptive routing remains
  critical and cannot be deferred.
- `submitLiveChallengeResponse` validates the server-held question before its
  transaction; this preserves fairness and is not safely movable client-side.
- server-graded Modeling Lab remains authoritative and does not call AI or
  Classroom on its response path.
- AI authoring, reports, Drive/Classroom publication, and grade passback are not
  student response dependencies. Classroom/Drive already use lazy CommonJS
  module accessors.

The local number is module-load evidence, not a production cold-start p95.
`minInstances` remains unchanged: traffic distribution and regional billing
measurements are insufficient to justify always-on instances. Callable p50/p95
telemetry now provides the evidence needed to choose only secure submission,
Path issuance, or Live Challenge endpoints if production cold starts breach the
500 ms target.

## Recovery and load certification

`tests/platform/durableActionOutbox.test.mjs` covers online save-once, same-id
double submit, offline retention, reload/recovery, reconnect, retry idempotency,
Submit+Next ordering, two rapid questions, legitimate later attempts, stale
retries, authority revocation, punctuation-safe FieldPaths, and secure-path
separation. `npm run certify:performance:load` runs 30 isolated students at once;
the final local architecture run saved 30/30 with zero duplicates (p50 7.79 ms,
p95 8.06 ms). This is not mislabeled as Firestore capacity evidence; emulator load
still belongs in CI.

The Work View browser workflow installs its pinned Chromium/Playwright driver,
runs Test Cycle at 1366×768 and 390×844, executes the rendered Work View matrix,
and reloads a real browser page between IndexedDB enqueue and reconciliation.
This keeps browser recovery executable immediately in CI even when a local
agent image does not ship Playwright.

## November 2026: what a student's interactions cost

This certification recorded no browser timings. After 3,443 commits it was
measured as a student for the first time, on a production build, with
`tests/browser/teacherWorkflow/studentRuntimePerformance.mjs`:

```
OUT_DIR=dist-harness/runtime npx vite build --config tests/browser/teacherWorkflow/vite.production.config.mjs
node scripts/serve-static-spa.mjs dist-harness/runtime 5303 &
PERF_ORIGIN=http://127.0.0.1:5303 PERF_DIST=dist-harness/runtime MODES=timing,counts RUNS=7 \
  node tests/browser/teacherWorkflow/studentRuntimePerformance.mjs
```

It builds the teacher-workflow harness (the real App over the in-memory
Firebase fakes) with `vite build`, signs in a synthetic student and works
through one question of each kind (`?questions=runtime`): Home, opening the
assignment, a basic answer, a choice, a typed expression and a Step Algebra
question, keys, Submit, Next, Work View opened twice, a hint, Read aloud,
offline and back, on a Chromebook (1366x768) and a phone (390x844, touch,
the number keypad), at 4x CPU. A `counts` run is deterministic and fails when
a key typed after the first draws QuestionEngine more than once or more than
60 components; `profile` reads a CPU profile back to source names and `trace`
counts forced layouts.

The September build (`6d49d878`) still builds with today's dependencies (its
bundle matches the table above to within 268 bytes) and runs the same flow
over today's fakes; its tool question had no hint and no Read aloud.
Medians of seven interleaved runs on a shared 4-core machine (load 12-21),
milliseconds, Chromebook / phone, each September → 2026-11-08 → with the
fixes below. Component renders are one counts run, Chromebook where one
value is given:

| Interaction | Ready (screen there) | Long tasks | Component renders (counts) |
| --- | --- | --- | --- |
| Open the assignment | 841 → 1439 → 1474 / 848 → 1362 → 1328 | 521 → 1114 → 1045 / 479 → 1022 → 1013 | – → 360 → 325 |
| A key after the first | latency 48 → 40 → 32 / 56 → 80 → 80 | none | 37 → 89 → 43 / 53 → 130 → 48 |
| Submit (expression) | 185 → 288 → 345 / 241 → 338 → 308 | 0 → 203 → 139 / 57 → 196 → 201 | 90 → 350-650 (with when the save returns) |
| Next (to the expression) | 194 → 515 → 429 / 326 → 370 → 455 | 50 → 407 → 344 / 64 → 252 → 309 | 110 → 413 → 366 |
| Next (to Step Algebra) | 428 → 884 → 1065 / 475 → 1111 → 954 | 261 → 817 → 914 / 474 → 1126 → 796 | 172 → 504 → 486 |
| Work View open | 121 → 157 → 152 / 86 → 163 → 223 | 72 → 106 → 81 / 0 → 74 → 82 | 4 → 9 → 9 |
| Hint (Step Algebra) | – → 131 → 106 / – → 144 → 95 | – → 90 → 0 / – → 71 → 51 | – → 59-128 → 59 |
| Back online | – | 0 → 71 → 0 / 0 → 56 → 0 | 0 → 138 → 138 |

Wall-clock numbers on that machine move by 100-200 ms between runs; the
render counts and the profiles are the evidence for the fixes:

- A key typed into an answer box drew the question twice (the grader handed
  QuestionEngine a new Undo on every key) and graded each box's example on
  every render: 89 → 43 component renders a key on a Chromebook, 130 → 48 on
  a phone; grading in a key's profile 18-43 ms → under 1 ms.
- Step Algebra worked out whether the equation was solved (mathjs) and its
  cancellation models on every render: in the profile of opening it,
  isSolvedEquation 182 → 58 ms and the models 162 → 36 ms (Chromebook), and
  nothing of either on a hint or back online.
- An assignment's due dates built a date formatter per call, on each of
  App's seven renders a Submit: formatDateTime 16-23 ms of a Submit → under
  1 ms.

Left open, each a decision beyond a performance pass:

- Since September, Submit, Next and opening an assignment do three to four
  times the rendering: App renders seven to ten times for each, and each of
  its renders draws the whole question again (about 45 components where
  September drew 18). QuestionEngine is not memoised, and App hands it new
  functions and objects on every render (handleGradeSubmit, inline arrows,
  askTeacherContext), so memoising it needs those made stable in App.jsx.
- Opening the first assignment of a visit hides the whole app behind
  AppShell's "Loading your MathMaster workspace…" for React's minimum
  fallback time (about 300 ms), though Home has fetched QuestionEngine's
  code: a lazy suspends on its first render however its module arrived, and
  coming back runs every layout effect on the page again. Drawing the loaded
  module at once removed the screen but moved about a second of rendering
  into the press (its Event Timing duration went from 104-192 ms to
  1.1-1.4 s at 4x), so it wants the open to become a transition, which
  changes what the student sees while it loads.
- Measuring the sticky bars and the viewport forces layouts: 9 forced
  layouts opening an assignment, 4-10 on Next (stickyHeightRef.js,
  mobileInteractionFoundation.js's viewport reads, MathLive's own), and Work
  View's open forces 4 layouts and 8 style recalculations
  (EnlargeableFigure.jsx, matrixScrollRegion.js).
