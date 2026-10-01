# MathMaster platform engineering deep dive — 2026-10-01

A record of what one platform hardening pass found and measured, and what it
changed. It also records what it deliberately did not change, and why. Branch
`claude/funny-johnson-5wqu2w`; everything here was measured on that branch
merged with `main` at `a7a3b4e9` (after #404).

The aim was a faster, more reliable platform that is harder to lose work in,
easier to diagnose and safer to deploy. Concurrent feature work was protected
throughout: Live Challenge, rewards, new Challenge modes, IEP/student support,
Support Evidence reports, make-up Warm-Up/DOL, recovery eligibility, and
question generation for those systems. Where a fix belonged in one of those
areas, it is written up below as a handoff instead.

---

## 1. What changed, in one table

| Area | Problem found (measured) | Change | Proof |
| --- | --- | --- | --- |
| Lint | `_oxlintrc.json` was never loaded (oxlint reads `.oxlintrc.json`), so the React rules were off. Turning them on found 57 conditional hook calls and a `<React.Fragment>` with no `React` import, which crashed a relation solve at its exact-values summary | Config renamed and extended (`rules-of-hooks`, `jsx-no-undef`, `no-undef` as errors); mode dispatchers split into components that own their hooks | `lintConfigLoaded.test.mjs` |
| Path grading | `submitPathResponse` read a block-scoped `activeSkillCode` outside its block. Every finalized SAT/ACT/TSIA-style Path question failed with "internal" | Value computed once before the routing block | `tests/integration/pathExamStyleFinalize.test.mjs` (emulator) |
| Math entry (PQ-040) | `y=-2/3x+4` typed on a keyboard became `−2/(3x+4)`; calculator `6/3+1 = 1.5` | `typedFractionEntry.js` state machine in MathInput and the calculator | `tests/browser/mathEntryContract.mjs` (10 of 16 failed before) |
| Model grading | `2^{x+1}` read as `2^x+1` (f(3)=9, not 16); compact `\frac23` not parseable | One shared `latexToExpression.js`; bounded compiled-model cache | 4 new `modelExpression` cases |
| Render loops | "Maximum update depth exceeded": 500–900 commits in 1.5 s with no input, e.g. a Live Challenge round, or a system/multi-answer/graph question with a missing optional field | `reportAnswerState` is structurally idempotent; the host callback is read through a ref; frozen fallback constants | `tests/browser/renderStability.mjs` (5 scenes) |
| Lost work | A composed question's balance-workspace step was erased by any host re-render (App's 30 s clock) | Algebra cores key on question content (`useContentStableValue`) | renderStability "composedAlgebraStage" |
| Calculator | After a drag, the open calculator re-rendered at ~60 Hz for the rest of the session | `settleCalculatorPosition` keeps the same position object when nothing moved | `calculatorPanelGeometry.test.mjs` |
| Stale tabs after a deploy | A tab opened before a deploy failed its next lazy import. It said "MathMaster could not start" with a raw stack, or blamed the question's content | Chunk-aware boundaries ("MathMaster was just updated"), a reload with a loop guard, and a scrubbed client-diagnostics ring | `chunkLoadRecovery.test.mjs`, `tests/browser/errorRecovery.mjs` |
| First load | Sign-in downloaded MathLive and the PDF engine, and after #404 also QuestionEngine | `TestCycleCard`, `SectionRecoveryRunner` and the PDF renderers load lazily | `initialBundleBoundary.test.mjs` (it caught #404's regression on merge) |
| Release | The grouped functions deploy found 145 of 153 functions by grep, missing 8 entirely; the emergency Hosting script deployed Hosting raw | `release-firebase.mjs`: scoped, ordered and paced; classified retries; bisects a broken group; JSON report. **Dry-run by default; nothing was deployed** | `releasePlan.test.mjs` |
| Fan-out | Any assignment write anywhere rebuilt every student's grades listener and re-read their draft. It also rebuilt every teacher's gradebook listener, which flipped to loading and re-read all grades | Both effects read `assignmentsRef`; the draft sync depends on a yes/no flag | `enduranceJourneys.mjs`: student 50 reads/rebuilds per 9 edits → 0; teacher 9 → 0 |
| Resources | A walkthrough beep leaked an `AudioContext`; MobileViewportContainer retained detached inputs across Path questions | The context closes when the tone ends; inputs no longer on the page are pruned | `longSessionResources.test.mjs` |
| Duplicate tabs | Same question in two tabs: the older tab overwrote newer work ("12345" saved as "19") | `activeWorkTab.js`: the newest tab owns the question, others pause with "Continue here" | `tests/browser/duplicateTabs.mjs` |
| Assessment integrity (PQ-036) | On a DOL, quiz or test, "Check Point Placements" named the wrong points, as often as the student liked | Point plots have no check there; the curve and reflection checks name nothing and teach nothing; no jump to step 2 | `tests/browser/graphPointCheck.mjs` (12 failures before) |
| Undo (PQ-009) | Undo took back one typed character per press (eight for "-2, 1, 3"); a math field's Ctrl+Z replayed what Undo removed | A run of typing is one step; `resetUndo()` after an external write | `mathUndoTyping.test.mjs`, `tests/browser/undoTyping.mjs` |

Every behavior test above was run against the code before its fix and failed.
Where an existing source-text test pinned a spelling instead of a behavior, it
was rewritten against the behavior and mutation-checked (AGENTS.md). That
happened four times: `liveChallengeTimeoutFinalization`, `studentWorkRecovery`,
`sectionRecovery` and `liveQuestionCorrectionWiring`.

---

## 2. Measurements

All performance numbers come from **production builds**. The PQ-039 numbers
were development builds, and they overstated typing latency 3–20×.

**First load**: 4× CPU, 20 Mbps, median of 5 cold loads, served like Hosting.

| | first screen | long tasks | heap | JS fetched | JS gzip (initial) |
| --- | --- | --- | --- | --- | --- |
| `main` @ a7a3b4e9 | 3659 ms | 1419 ms | 28 MB | 5097 KB | 1488 KB |
| this branch | 2842 ms | 1286 ms | 23 MB | 3386 KB | 1012 KB |

What still arrives first: the App chunk (1027 KB), mathjs (634 KB) through
`problemGenerator` → `functionGraphUtils` → `workflow/modelExpression`,
firebase (625 KB) and the teacher preflight model (205 KB).

**Typing** (key to two painted frames, production harness build):

| question | CPU | p50 | p90 |
| --- | --- | --- | --- |
| three-part answer | 4× | 32 ms | 65 ms |
| one-box answer | 4× | 32 ms | 57 ms |
| representations board | 4× | 50 ms | 70 ms |
| representations board | 6× | 88 ms | 95 ms |

**Endurance**: the real App over the in-memory Firebase harness. Six rounds of
a full period on one device, garbage collected, measured at the same screen.

| | heap | DOM | JS listeners | Firestore listeners |
| --- | --- | --- | --- | --- |
| student | 50.0 → 50.5 MB | 669 → 677 | 228 flat | 10 flat |
| teacher | 52.5 → 53.2 MB | 1477 flat | 324 flat | 32 flat |

Final run on the merged head: student heap 51.6 → 52.1 MB, teacher heap
54.2 → 55.0 MB. Listeners are flat in both, and every run since the fixes
reports 0 fan-out.

The page itself does not grow: the attached DOM was identical every round
(117 elements, 112 text nodes at the resting screen). The student's CDP node
count, which also counts detached nodes still in memory, rises by about 2
per round after round 2 (642 → 650). That is roughly a kilobyte per lesson
round with a flat heap. It is recorded rather than chased.

An earlier, much larger detached-DOM "leak" was a test artifact: Playwright
`ElementHandle`s from `waitForSelector` pinned the old trees. The driver now
uses locators.

---

## 3. What surprised me

1. **The React lint rules had never run.** One mis-named file meant
   `rules-of-hooks` was silently off. Turning it on found 57 violations, three
   of them crashes waiting for a tool to receive a question in a different
   mode. A config that fails open is worse than none, because everyone
   believes it is on. `lintConfigLoaded.test.mjs` now proves it applies.
2. **A ReferenceError in a production callable for a whole question family.**
   Course questions worked, so nobody noticed that every exam-style Path
   question failed to finalize. `no-undef` on `functions/` would have caught
   it, and now does.
3. **The most common slope-intercept answer was the one the keyboard broke.**
   `y=-2/3x+4` is what students type. MathLive's `/` keeps everything after it
   in the denominator.
4. **The render loops needed nothing but time.** App's 30-second clock
   re-renders the tree, and that was enough to start a loop in any response
   module with a per-render fallback object. Live Challenge rounds looped from
   the first frame.
5. **The fake Firestore is a better fan-out detector than production
   telemetry.** It re-emits every listener on any write, so an effect that
   depends on a collection it doesn't need shows up as dozens of reads. In
   production the same bug costs one read per edit per device, too quiet to
   notice and exactly what scales badly.
6. **Nothing coordinated tabs.** There was no `BroadcastChannel` and no
   `storage` listener anywhere in `src/`, for a local-first,
   last-write-wins draft store.
7. **A "check" button bypassed the feedback policy.** The self-check beside
   it was carefully policy-gated, but the main check was not. Policy is
   applied per tool, so each new affordance has to remember it.

## 4. What is stronger than expected

- **The student-work pipeline.** Local-first drafts with a sanitizer and size
  caps, a durable IndexedDB outbox with per-question streams, server
  dispositions and retained evidence. It has its own Chromebook certification
  (rapid typing: 18 writes, worst 0.2 ms). Nothing in this pass found a path
  where captured work is silently discarded. The duplicate-tab hole was
  upstream of it: the stale tab wrote stale work *into* it.
- **Shared client/server modules** (`functions/shared/`): grading contracts,
  activity policies and disposition rules have one source of truth. This is
  why the PQ-036 fix could key off the same `feedback` policy the server
  enforces.
- **The harnesses.** In-memory Firebase fakes that run the real App, the
  student UX platform harness built through the teacher import chain, and the
  draft and outbox certifications. They made every fix here reproducible
  before it was written.
- **Mutation-checked contract tests.** The culture of "prove the test fails"
  is already there; this pass extended it to browser gates.
- **Typing performance in production** is fine; nothing needed memoizing.

## 5. What is weaker than expected

- **`App.jsx` is 11,861 lines with 135 `useState` calls.** Every feature
  branch edits it, which is why collision reconnaissance mattered so much.
  Every student and teacher effect shares one render scope, and it is the
  root of the first-load bundle.
- **Whole-collection reads.** Students subscribe to all of `assignments`
  (see §9). Fan-out cost and privacy exposure have the same root cause.
- **Inline objects across component boundaries.** Hosts pass `question={{…}}`,
  `serverGrading={{…}}` and inline callbacks. Each consumer must defend
  itself, and the ones that didn't produced the render loops and the erased
  algebra step.
- **Source-text contracts.** Many tests assert the *spelling* of a line
  (`persistCurrentGraderCreditRepairs(studentData, assignments)`). They
  resist correct refactors and miss behavior changes that keep the spelling.
- **Deploys are manual and unrecorded.** Functions carry no record of the
  commit they came from, and every release is assembled by hand in Cloud
  Shell (§8).

## 6. Architecture to preserve, and to replace

**Preserve**
- The durable outbox and server-side dispositions, and the rule that a
  submission leaves the queue only on proof.
- `functions/shared/` as the single definition of grading and policy.
- QuestionEngine as the one runtime host for every question surface. The
  render-loop and duplicate-tab fixes landed once because of it.
- The Work View undo-owner registry and the camera-free
  `mathematicalSnapshot`. Typing grouping slotted into it without touching a
  tool.
- `scripts/lib/releasePlan.mjs` as a pure, tested planner. Keep releases
  flowing through it.

**Replace, gradually**
- **`App.jsx` → `StudentShell` / `TeacherShell` lazy roots**, each owning
  its listeners. This is the single biggest lever for bundle size, render
  scope, fan-out isolation and merge conflicts.
- **The whole-collection `assignments` listener** → class-scoped queries
  (§9).
- **Per-tool feedback policy** → one `ToolRuntimeContext.feedbackPolicy`
  ("may this affordance reveal correctness?") that every check, hint and
  verdict reads. PQ-036 is the third instance of a policy bypass.
- **Source-text contracts** → behavior tests, one at a time, whenever a
  regex blocks a correct change.

## 7. Where the next bugs will come from

- **A new static import in `App.jsx`** pulling the question runtime into the
  first load. #404 did exactly this. `initialBundleBoundary.test.mjs` now
  fails with the chain.
- **A host passing a new inline object** into QuestionEngine or an algebra
  core. The engine is now idempotent, but a module that stores props in state
  without an equality check can still loop. `renderStability.mjs` is the
  place to add the scene.
- **A new check, hint or "verify" button in a tool** that doesn't consult the
  feedback policy (see §6).
- **MathLive upgrades.** The typed-fraction rule relies on MathLive applying
  a key synchronously and batching `input` events, and on `resetUndo()` and
  `moveAfterParent`. The math-entry and undo gates exercise all three; run
  them on every MathLive bump.
- **Seat writes on assignment documents** (#404's `generationSeats`). These
  are new, frequent writes to a collection every device listens to. The
  student and teacher fan-out fixes make them cheap per device, but they are
  still delivered to every device (§9).
- **Mode dispatchers.** Now a lint error, but any `if (mode) return <Other/>`
  above hooks will reappear in new tools; keep `rules-of-hooks` at error.

## 8. Deploy risks

- **No record of which commit the deployed Functions came from (F-REL-3).**
  Hosting has `mathmaster-build.json`; Functions has nothing. When a callable
  misbehaves, nobody can say which code is live. Recommendation: the release
  tool writes `{gitSha, functions, deployedAt}` to a `deployments/` document
  (Admin SDK) after each functions step. The report file it already writes is
  local to the operator.
- **`deploy:path-admin`'s predeploy rewrites a tracked manifest (F-REL-6),**
  which dirties the tree. The Hosting wrapper's provenance gate then refuses
  the next step in the same release. The release tool checks provenance
  before it starts and runs Hosting last through that wrapper, so the release
  stops there with the reason in its report, not silently. The real fix is to
  write that manifest to an ignored path.
- **The release tool has never run against production.** It is dry-run by
  default and every decision is unit-tested, but the first `--execute` should
  be a small functions-only release, watched.
- **The SPA rewrite answers a missing chunk with `index.html` (200).** The
  client now recognizes that and recovers. A Hosting rule returning 404 for
  `/assets/**` misses would make the failure faster and unambiguous. Verify
  Firebase's glob support before changing `firebase.json`.
- **Rules deploy timing.** Rules go just before Hosting, so the window where
  old clients meet new rules is short. A rules change that *removes* access
  still breaks old tabs until they reload; pair such changes with a client
  release that no longer needs the access, one release earlier.

## 9. Security and privacy observations

- **F-PRIV-1 (high) — `assignments/*` is readable by every signed-in user,
  and students subscribe to the whole collection.** These documents carry
  `studentOverrides[studentId].extension`, including `sourceAbsenceDates` and
  `grantedByEmail`. Any student can therefore read classmates' absence dates
  and extension grants. The IEP work already avoided storing accommodations
  there for this reason. Ordinary-assignment answer keys are client-readable
  by design (client-side grading); Path questions are not (public payloads
  strip them, and a test enforces it). `classes/*` and `settings/*` are also
  readable by any signed-in user.
  *Not fixed here:* it needs a data migration and coordinated rules,
  client and Functions changes. Doing it alone would break old clients
  mid-day.
  *Recommended fix:*
  1. Move overrides to `assignments/{id}/studentOverrides/{studentId}`,
     readable by that student and the teacher of record and written by the
     server.
  2. Scope the student listener by class
     (`where('audience.classIds', 'array-contains', classId)`).
  3. Then tighten the rule to class membership.

  Step 2 alone also removes most of the fan-out cost.
- **Client diagnostics** (new) store only scrubbed messages on the device: no
  emails, no long digit runs, no query strings, no stacks, 240 characters at
  most. They leave the device only when a student presses "Copy details for
  your teacher".
- **Cross-tab messages** (new) carry the question's draft scope and a random
  tab id, same-origin only.
- **The release report** records commands and function names, never
  credentials. The project id is typed at the prompt, not stored.

## 10. Performance and reliability risks, ranked

1. **Student fan-out from `assignments`.** Fixed per device for the two
   effects that churned. Every device still receives every write to the
   collection, and seat allocation adds writes. Class scoping (§9) fixes the
   delivery.
2. **The durable outbox's `retired` store is never pruned, and every device
   report reads it whole** (`summarizeDurableOutbox` → `getAll`). Reports run
   after each drain. Over a semester that is O(submissions) deserialization
   per submit on a Chromebook. Pruning is a retention decision, because it is
   recovery evidence. The safe fix keeps a per-disposition counter, updated in
   the retire transaction, so the summary never reads the store. This needs an
   IndexedDB version bump, so it belongs in its own change with the outbox
   certification.
3. **mathjs (634 KB) in the first load** through `problemGenerator`. That
   chain dissolves once the shells split.
4. **Teacher session summaries.** `studentSupportStore.js` opens one
   `limit(1000)` listener per class. A six-class teacher can hold 6000
   documents live on Home. Bounded, but a paged read would serve the
   dashboard.
5. **Practice and preview scratchpad images** (~700 KB each) are held in
   App state all day.
6. **ThreePlaneWorkspace** animates its idle rotation at 60 fps until first
   interaction.

## 11. Student experience opportunities

- ~~Finish whole-board Undo for the representations board (PQ-009 items 3 and
  4): exclude verdict fields, then announce and reveal the card each Undo
  changed. The platform pieces it needed are in.~~ Done: see PQ-009 in
  `platform-quirks-audit.md`.
- PQ-022: after a tool's Check, the attempt outcome is off-screen. Bring it
  into the tool's result area.
- PQ-020/021: landscape phone Work View gives the stage 120–150 px; the
  identity bar is always pinned.
- PQ-023: tool chrome and folded help sit between the task and the math;
  merge "About this tool" into "How to do this".
- PQ-024: point cards say "P1: x = −1" but x isn't locked; lock it, or say
  "suggested".
- A legacy `fraction` question with missing operands shows a default problem
  (1/8 + 1/3) that contradicts its prompt. It should refuse to render and
  tell the teacher, not invent a problem.

## 12. Teacher workflow opportunities

- The gradebook no longer flickers to "loading" when anything in the school
  changes. Next, show *why* a student has no attempt: the device queue report
  (`reportStudentDeviceQueue`) already knows when work exists on a device but
  hasn't arrived.
- "Copy details for your teacher" gives a student something to send. Give the
  teacher somewhere to paste it, such as a support-request field that routes
  to whoever maintains the platform.
- The release tool removes most deploy toil. A short "release checklist" in
  the teacher-facing changelog would make releases predictable for staff.

## 13. Testing gaps

- **Most browser suites are manual.** CI now runs math entry, render
  stability, error recovery, duplicate tabs, graph point check and undo typing
  (`student-runtime-browser-gates.yml`, read-only). These suites still run
  only by hand:
  - the student UX platform journeys,
  - the representations board,
  - the Work View certification,
  - the teacher and support-evidence journeys,
  - endurance.

  Each passes today. Adding them to CI, or a nightly job, is the cheapest
  reliability investment left.
- **`exhaustive-deps` is off** (180 warnings). Most are deliberate, but this
  pass's two fan-out bugs were in that list. Turning it on for `src/platform/`
  first would be manageable.
- **The fake Firestore notifies every listener on any write.** That makes it
  strict for fan-out but blind to query scoping and rules. Pair it with the
  emulator for any change to listener queries.
- **No post-deploy smoke test** beyond the Hosting manifest SHA. A
  read-only callable ping per codebase after the functions steps would catch
  a broken deploy before students do.
- **No load test for the hot callables** (`submitPathResponse`, ingestion,
  Live Challenge answers) at class scale.

## 14. Handoffs to the owners of protected areas

| Owner | Observation | Suggested change |
| --- | --- | --- |
| Live Challenge (`LiveChallengeStudent.jsx`) | `ChallengeRound` still passes inline `serverGrading` and an inline `onResponseStateChange` to QuestionEngine. The loop it caused is fixed on the engine side | Memoize both; then the engine's defense is belt-and-braces |
| Live Challenge | (Resolved upstream) the room watcher no longer resubscribes with the clock offset; it depends on `[roomId]` | — |
| Question families (#404, merged) | Seat allocation writes to `assignments/*`, which every device receives | Covered by §9's class scoping. Until then the fan-out fixes keep it cheap per device |
| Recovery (#404, merged) | `SectionRecoveryRunner` was statically imported into App, putting QuestionEngine and MathLive in the first load | Made lazy on this branch; keep new runners lazy |
| Assessment owner | PQ-036: a curve's point check is still a yes/no a student can repeat on a DOL | Count each failed check as an attempt, or let the curve snap through the student's own points and grade at submission |

## 15. Highest-leverage investments, in order

1. **Scope student reads to their classes** (§9). This fixes privacy,
   per-device cost and delivery fan-out at once.
2. **Split `App.jsx` into lazy Student and Teacher shells.** This cuts the
   first load, render scope and merge conflicts on every branch.
3. **Put the existing browser suites in CI.** They exist and pass; they just
   don't run unless someone remembers.
4. **One feedback-policy context** that every check and hint reads.
5. **Record deployed Functions' commit and use the release tool every time.**
6. **Retire source-text contracts as they block correct changes.**

---

### Appendix: how to reproduce

```
npx vite --port 5199 --strictPort &
node tests/browser/mathEntryContract.mjs
node tests/browser/renderStability.mjs
node tests/browser/errorRecovery.mjs
node tests/browser/duplicateTabs.mjs
node tests/browser/graphPointCheck.mjs
node tests/browser/undoTyping.mjs

npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &   # port 5188
node tests/browser/teacherWorkflow/enduranceJourneys.mjs            # ROUNDS=6, ONLY=student|teacher

HARNESS=tests/browser/studentUxPlatform.html npx vite build --config tests/browser/harnessProduction.config.mjs
node scripts/serve-static-spa.mjs dist-harness 5303                 # production timing

node scripts/release-firebase.mjs                                    # dry-run plan; nothing deploys
```
