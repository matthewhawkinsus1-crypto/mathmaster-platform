# MathMaster certification lab — what "it works" means before a release

*Job 7, 2026-09-24. Source of truth:
`src/platform/certification/interactiveCapabilityManifest.js`. Runner:
`scripts/certify-interactive-capabilities.mjs`.*

## Why this exists

Between #336 and #346 every capability that teachers later reported "missing"
still existed as a component, and every component had passing tests. What
failed was the path a student takes to reach it: a question compiled to the
wrong tool, a host that skipped runtime repair, a build deployed from a branch
that did not contain `main`. So the lab does not certify components. Each
capability is certified **from a question as a teacher authors it, through
the real compiler and runtime repair, to the tool that renders, to the student
doing the math** in Chromium.

## What one certified capability means

Each entry in `INTERACTIVE_CAPABILITIES` names a fixture (V5 authoring JSON,
or a raw stored record for legacy content), the route it must reach, the
engine capability it requires, the wiring anchors in the source, and a browser
journey. `tests/platform/interactiveCapabilityCertification.test.mjs` fails
when any of these is untrue:

1. The fixture compiles through `compileAuthoringIntentV5` and
   `getRuntimeAssignmentQuestions`, and `resolveAlgebraWorkspaceRoute` sends it
   to the expected route. This is the route `QuestionEngine` renders, the same
   in every host.
2. The engine on that route declares the capability
   (`ALGEBRA_ENGINE_CAPABILITIES`).
3. Every wiring anchor is still in the named file.
4. The shared model performs the operation correctly on the fixture (for
   example, dividing by −2 requires the symbol to reverse, and a wrong
   like-term sum is not an equivalent rewrite).
5. The browser harness still contains the journey.
6. A CI workflow runs that harness.

The browser journey then performs the capability as a student would, from the
compiled question (see the comment at the top of
`tests/browser/capabilityCertification.mjs` for all 17).

## Tiers

| Tier | What runs | Where and when | Time |
| --- | --- | --- | --- |
| **pr** | Node gate for every capability (route, engine, wiring, model), plus the node suites for TEACHER EXPERIENCE, ASSESSMENTS and PERSISTENCE | Every PR, inside the Full Platform Test Suite; locally `npm run certify:capabilities -- --tier pr` | seconds |
| **merge** | pr + the interactive capability journeys, factoring/fraction/slope-intercept, systems substitution/elimination, 3×3 | `Interactive Capability Certification` workflow on every PR to `main` that touches runtime code (`src/**`, harnesses, Vite, dependencies) | about 10 min |
| **release** | merge + draft persistence (navigate/reload/reopen, 14 families), durable outbox, Test Cycle on Chromebook and phone, regression calculator at 390px, Work View certification, Work View graphing matrix | Push to `main`, nightly at 09:17 UTC, manual dispatch; run locally before every production deploy | under an hour |

The PR path filter is deliberately broad: a capability disappears as easily
through a routing, compiler or runtime-repair change as through the tool
itself.

## The report

```
MathMaster Interactive Capability Certification
Tier: merge · Commit: cd9d2adfb36d

STEPALGEBRA
PASS Distribution
PASS Inequality Sign Reversal
FAIL Combine Like Terms in Inequalities
     ↳ journey inequality-like-terms (tests/browser/capabilityCertification.mjs) at "5x is accepted with Enter": 2x + 3x became 5x: 2 x + 3 x - 4 <= 11
     ↳ screenshot tests/browser/artifacts/capabilityCertification/inequality-like-terms.png; route relation; console errors 0
...
GRAPHING
NOT COVERED at tier merge
```

Sections: CORE STUDENT FLOW, STEPALGEBRA, SYSTEMS, GRAPHING, STATISTICS,
PERSISTENCE, ASSESSMENTS, TEACHER EXPERIENCE, MOBILE/WORK VIEW. A section with
nothing run at the chosen tier prints **NOT COVERED**; it is never left out.
The node gate also fails if any section has nothing certifying it at any tier.

The report goes to the console, to
`tests/browser/artifacts/capability-certification-report.{md,json}`, and in
GitHub Actions to the job summary. The workflow uploads the report and every
suite's artifacts as `capability-certification` (14 days).

## Failure artifacts

A failed capability journey records, in
`tests/browser/artifacts/capabilityCertification/results.json`:

| Field | What it answers |
| --- | --- |
| `failedStep` | Which student action failed (for example "commit" or "a wrong sum is refused") |
| `error` | The assertion, with the actual math state |
| `screenshot` | A full-page PNG of what the student saw |
| `route` | Which workspace rendered (`data-algebra-route`) — a misroute shows here first |
| `mathState` | The relation or equation at the moment of failure |
| `question` | The question the engine received after compile and repair |
| `consoleErrors` / `failedRequests` | Page errors, console errors, failed network requests |
| `fixture` | The authoring fixture to reproduce with |

To reproduce one journey:

```
npx vite --host 127.0.0.1 --port 5199 --strictPort &
open http://127.0.0.1:5199/tests/browser/capabilityCertification.html?fixture=<fixture>
```

## Running it

```
npm run certify:capabilities                     # merge tier; starts Vite if needed
npm run certify:capabilities -- --tier pr        # node only
npm run certify:capabilities -- --tier release   # before any production deploy
npm run certify:capabilities -- --origin http://127.0.0.1:5199   # reuse a running Vite
```

Needs Playwright and Chromium (`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` if they
are not the defaults). A suite that reports `SKIPPED:` (the draft-persistence
runner does when no browser is installed) shows as SKIP, never PASS.

Do not edit `src/` while a browser tier is running. Vite reloads the harness
page and a journey fails with a missing `window.__mm*` hook. That is not a
product failure; rerun the suite.

## Release order (with the deploy guard from Job 1)

1. `npm run certify:capabilities -- --tier release` — all PASS.
2. `npm run check:deploy-provenance` — the build contains `origin/main`
   (enforced again inside `npm run deploy:hosting`).
3. Deploy Functions that the browser build depends on first (for the DOL
   recovery work: `ingestStudentSubmissions`,
   `finalizeStudentResponseCheckpoints`).
4. `npm run deploy:hosting`.
5. `npm run verify:deployed-build` — production serves this commit and no
   `main` commit is missing.

## Adding a capability

1. Add an authoring fixture to `INTERACTIVE_CAPABILITY_FIXTURES`, written the
   way a teacher or the assignment AI writes it (not pre-routed).
2. Add the capability: `subsystem`, `fixture`, `expectedRoute`, `requires` (declared in
   `ALGEBRA_ENGINE_CAPABILITIES`), `wiring` anchors, and
   `browser: { harness, journey }`.
3. Add the model check to `BEHAVIOUR` in the node gate.
4. Write the journey. It must change the math state and assert the result, so
   a journey whose clicks did nothing fails instead of passing vacuously.
5. Mutation-check: revert the fix or unwire the tool, and confirm that both
   the node gate and the journey fail.

## Known gaps

- **The release tier is red today, for a pre-existing reason.** In the Work
  View graphing matrix, on an iPhone held sideways (844×390) the side rail has
  seven controls and only six fit. Transformations Lab's *Clear* and Graphing
  2's *Start over* sit below the screen edge (`@683,375 155x44`). The rail
  scrolls, so a student can still reach them, but the Work View standard
  requires every control on screen. This fails identically on `origin/main`
  and in the existing *Work View Browser Matrix* workflow. The fix belongs in
  the shared Work View layout (`WorkViewShell.css`, side rail), not in this
  runner.
- The Work View certification (Stage 4) has the same pre-existing failures in
  CI: *Representation Bridge* on Android narrow ("7 controls are clipped") and
  the two iPhone-landscape scenes above.
- In a Claude Code cloud sandbox, the Work View certification also hits
  `page.screenshot` timeouts on phone and tablet profiles for eight tools with
  inputs. `origin/main` hits the identical timeouts there, and they do not
  occur on GitHub runners, so treat them as a sandbox limitation.
- A suite that exceeds its `timeoutMinutes` is stopped and reported as
  **TIMED OUT**. Locally, running other heavy jobs at the same time can push the
  Work View suites past their limit.

- **GRAPHING and STATISTICS** are certified only at the release tier (Work
  View graphing matrix, regression calculator). A PR that breaks a graph tool
  is caught on `main` or nightly, not on the PR.
- **TEACHER EXPERIENCE** is certified at node level: listener ownership,
  presence batching, memory footprint, preflight question/tool check, and DOL
  controls. A browser journey needs the Firestore emulator seeded with a teacher, roster and
  presence documents (the Test Cycle device harness is the model to copy).
- **Firestore rules** (`npm run test:rules`) need the emulator and are not
  part of this runner.
- Implicit −1 groups (`-(x − 5)`) are not offered by Distribute. This is a
  limitation of the shared distribution model, so it affects equations as
  well as inequalities. Students use Rewrite for these.
