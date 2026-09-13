# Platform performance certification

## Architecture and targets

The browser records bounded, in-memory p50/p95 diagnostics at
`window.__MATHMASTER_PERFORMANCE__.snapshot()`. Only allow-listed operational
dimensions enter the channel; answers, prompts, keys, seeds, and student ids are
discarded. Ordinary assignment submission updates React state before assignment
revalidation, activity aggregation, evidence append, and the canonical
Firestore write. Firestore's persistent multi-tab cache supplies the local
durability boundary and reconnect queue. Secure Test Cycle grading remains on
its existing server-authoritative path and secure assignments are excluded from
question prefetch.

Targets are `<100 ms` local submit acknowledgement, `<150 ms` prefetched Next,
and zero awaited secondary writes. Server and startup targets are reported as
p50/p95 rather than treated as flaky unit-test timers.

## Baseline and build evidence

The baseline production build at `3888d86` emitted 5 JavaScript chunks,
5,568,905 bytes total. Its largest `LiveChallengeStudent` chunk was 3,313,163
bytes because the eager tool registry travelled with that route. This change
emits 45 intentional feature chunks, 5,653,608 bytes total, and reduces that
largest route chunk to 1,452,440 bytes (56.2%). Total bytes are not presented as
an improvement: shared chunk boundaries add about 1.5%, while basic student
routes stop downloading every registered Work View implementation. The core
entry remains about 2.18 MB and is an explicit follow-up bottleneck.

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
