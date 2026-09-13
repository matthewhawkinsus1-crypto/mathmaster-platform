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
   offline/reconnect.
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
