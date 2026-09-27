# Day 1 3×3 synthesis — Claude review (#369)

Branch `ai/claude-3x3-synthesis-review` · base `2ebc5c01` (head of synthesis PR #368) · draft PR targets
`synthesis/3x3-day1-student-experience` · 2026-09-26/27.

**Test target: the local branch build at `http://localhost:5173/`** (Vite from `~/mathmaster-platform`), never
production. Production still runs `main`.

> Status: in progress. Sections marked *pending* are still being worked.

## Environment and how the lesson was taken

| Check | Result |
| --- | --- |
| `pwd` | `/home/matthewhawkinsus1/mathmaster-platform` |
| Branch actually checked out at start | `qa/student-workspace-visibility-round-2` — **not** the branch the brief named |
| Its commit | `2ebc5c01`, identical to `origin/ai/claude-3x3-synthesis-review` and `origin/synthesis/3x3-day1-student-experience` (`git rev-list --left-right --count` = `0 0` for both) |
| Action | `git checkout -b ai/claude-3x3-synthesis-review --track origin/…` — same commit, no file changed, Vite did not reload |
| Vite | PID cwd `~/mathmaster-platform`, `vite --host 0.0.0.0`, `:5173` → 200 |

**Sign-in.** `localhost:5173/` shows the student sign-in page; this session has no QA-student credentials. The whole
Day 1 lesson was therefore taken on the same local build through the lesson harness
`localhost:5173/tests/browser/day1SystemsJourney.html` — the thirteen Day 1 questions mounted through
`QuestionEngine` with each section's real activity role, a real per-question draft key and DOL rules. It writes
nothing to production. Dashboard-only items (Warm-Up banner, resume target, Finished vs Practice) need a signed-in
student — see *Not verified live* below.

Viewports: 1366×768 (Chromebook/laptop), page mode and Work View; 390×844 and 360×740 (phones) — *pending*.
Input: mouse clicks, select-then-place, real HTML5 drag (`dragTo`), keyboard typing into MathLive fields.

## Priority 1 — the synthesized core, end to end

| Question | Route | Result |
| --- | --- | --- |
| CW2 guided 3×3 (by hand) | eliminate y: E1 + E2 → R₁ x + 3z = 18; E2 + E3 → R₂ 2x + 3z = 21 → reduced 2×2 by elimination (R₁ − R₂, −x = −3, Step Algebra ÷ −1) → back-substitute z in R₁ (Step Algebra) → back-substitute x, z in E2 (one select-then-place, one real drag) → y = 1 → verify all three | Correct |
| WU1 2×2 (by hand) | eliminate x by subtracting → 6y = −24 → Step Algebra; reload mid-solve | Resumed at the same Step Algebra stage; Undo walks back out of an extra move |
| CW2, PR3, DOL1 (driver) | `tests/browser/day1SystemsJourney.mjs` against `localhost:5173`: CW2 with a reload in round 2, PR3 ("requires thoughtful scaling", non-identity factors in both rounds), DOL1 under DOL rules | All graded correct, before and after every change here |

Confirmed on the synthesized build:

- Equations are on screen before the method choice (PR2 studentChoice).
- Every elimination round is stacked and column-aligned; the student marks the cancelling terms and types the
  combined row; finished rounds stay on the page.
- R₁/R₂ are named as such in the round boards, the reference column and the reduced 2×2, and the 2×2 has no
  Verify step of its own.
- Back-substitution renders `2(3) − 1 + 2(5) = 15` — classroom notation, exact values.
- Reusable verification values do not break select-then-place or drag.
- No student-facing "token" in any screen visited.

## Priority 2 — continuity

### 2a. Embedded Step Algebra chrome — **fixed** (`660d6072`)

What a student saw inside the Systems Workspace, for `−x = −3`:

- a centred grey "Solve for x" heading, then a purple **"Support 3 · Standard"** pill and a green
  **"Target: isolate x in simplified final form"** pill — three labels for one step;
- a nested bordered card inside the round's card;
- under the board, **"Nothing is simplified for the student. Hints are available on request. Attempts remaining: 3.
  A longer route still counts as correct algebra, but it uses an attempt at this level."** — a teacher-facing policy
  line, and a false one: the embed passes `onStepGrade={null}`, so `saveStep` returns before counting anything. The
  count never moves, and it sits under a question that already says "3 of 3 tries left";
- a 286px board floor for a one-line equation.

At 1366×768 the embedded solver for `6y = −24` was **585px** tall: heading 26, badge row 50, board 286, idle hint 26,
strategic hint 26, policy footnote 52, plus card padding.

Change: `StepByStepAlgebraCore` gains an `embedded` presentation role, set only by `EmbeddedStepAlgebra`.

- The step name and target share the solver's tool row ("**Solve for y** · Target: isolate y").
- No support badge, no policy footnote, and no attempt count in any in-flight message.
- The host is a worksheet step (top rule), not a card in a card.
- Board floor 212px; rail tiles 46px above phone width (≥ 44px targets; phone tap layout and Work View focus mode keep
  their own sizing).
- Unchanged: the engine, Rewrite / Simplify, Combine like terms, Distribute / Factor, cancellation, required
  simplification, the strategic hint, Reset work, Undo, draft persistence.

After: **368px** for the same step. Standalone Step Algebra questions are not affected (`embedded` defaults to false).

Coverage: `tests/platform/embeddedStepAlgebraIntegration369.test.mjs`. Each assertion was mutation-checked: switching
`embedded` off, moving the badge into the embedded branch, un-gating either attempt message, or restoring the card box
turns it red. `studentWorkspaceVisibility` "phone Work View trims nested padding" was rewritten to assert side padding ≤
8px (the rule is now top-only), and mutation-checked.

### 2b. Verification busywork — **fixed** (`66fb441d`)

CW2 verification took **21 actions**: 12 to place three values into three cards (select + three places, per value),
6 typed sides, 3 checks. Three typed sides were the numbers already printed on the right (15, 3, 18). Eight of the
placements repeated a decision already made.

Change (3×3 substitution and elimination; shared state in `substitutionReduction.js`):

- A value placed on its variable goes into **every original equation that has that variable**. A wrong variable is
  still refused and fills nothing; an equation without the variable receives nothing.
- A side with no variables is **shown as given**, not retyped; `checkVerification` uses its value.
- Each original equation still shows its own substituted line, still has its own simplified side typed by the
  student, and is still checked on its own. All three must pass before *Check my work* appears.
- Both 3×3 screens now use one component, `OriginalEquationsVerification.jsx`, instead of two copies.
- `verificationTokenNeeded` (from the Gemini synthesis) waited on every equation, including ones without the
  variable, so a value could stay selected forever. It now waits only on equations that have the variable.

After: **3 placements, 3 typed left sides, 3 checks** (9 actions).

Coverage: new cases in `systemsWorkspaceSubstitutionReduction.test.mjs` (fill, refusal, no reset of a checked
equation, a given side on the left, both sides with variables) and `synthesis3x3StudentExperience.test.mjs` (token and
an equation without the variable). Each was mutation-checked. The Day 1 journey driver now asserts three placements
substitute into all three equations and that no number side asks for input.

Not changed: the 2×2 workspace (Warm-Up, PR6) keeps its own verification with a typed right side. See *Open*.

### 2c. Narrow-screen progress trail — *pending*

## Priority 3 — PR #368 CI

Three jobs fail on PR #368 (`2ebc5c01`): `work-view-matrix`, `certify (iphone-landscape)`, `certify (android-narrow)`.
**None is caused by the 3×3 synthesis.**

| Job | Finding on #368 | Same finding before the synthesis |
| --- | --- | --- |
| work-view-matrix | iphone-landscape · `transformations-plot`: `clear-points` clipped @683,375 155×44; `graphing2-construct`: `start-over` clipped @683,375 155×44 | Identical on `fix-3x3-systems-ccmr` @ `1379318c` (PR #360, the code merged into main as `dd930ce`), job 108482533948 |
| certify (iphone-landscape) | `transformationsLab`, `graphing2`: 1 control clipped each | Identical on `1379318c` (job 108482534141) and on `claude/intelligent-allen-ykxphs` @ `e13c2df5`, 2026-09-24 (job 107792324441) |
| certify (android-narrow) | `representationBridge`: 2 controls clipped | `1379318c`: 2 clipped (job 108482534198); `e13c2df5`: 7 clipped (job 107792324495) |

Both workflows have failed on every branch run since at least 2026-09-24. The three tools are graphing /
representation tools this PR does not touch (`git diff --stat origin/main...HEAD` has no file under them), and
`certify (…) · systemsWorkspace` passes on every device. Per the brief, no unrelated tool was changed.

## Found, not changed here

| # | Where | What | Why not here |
| --- | --- | --- | --- |
| N1 | `QuestionEngine.jsx:1370` | `inert={locked … ? '' : undefined}` — React 19.2.8 treats `''` as false and logs "Received an empty string for a boolean attribute `inert`" (seen on *Check my work*). Locked and submitting questions are never actually inert, only `pointer-events: none`. | Pre-existing (from the ROOT_ADMIN import). Making them inert also removes locked review content from the accessibility tree; a platform decision. |
| N2 | `RewriteLinearForm.jsx` | Also mounts Step Algebra with `onStepGrade={null}`, so the same false "Attempts remaining" footnote shows there. | Different tool; the `embedded` role or an `onStepGrade`-aware footnote would fix it. |
| N3 | Step Algebra term names | Cancellation targets are announced "+ 3 * z, select to cancel" (parser syntax read aloud). | Engine labelling; outside the 3×3 synthesis. |
| N4 | Reduced 2×2 by elimination | Uses the 2×2 "Prepare the equations" cards and a separate *Confirm marked cancellation* press, while the 3×3 rounds above it are stacked boards with no confirm; the prepared equations are shown twice. | A larger interaction change to the mature 2×2 workspace. |
| N5 | 2×2 trail inside the 3×3 | Chip "✓ R₁ · 1 R₂ · 1" (scale factors of 1) is cryptic. | Minor; see 2c. |
| N6 | Local test run | `classroomScheduledPublication.test.mjs` fails locally: `Cannot find module 'googleapis'` (a `functions/` dependency, not installed in this checkout). | Environmental; CI installs it (`full-platform` green on #368). |

## Not verified live (need a signed-in student on `localhost:5173`)

- Warm-Up banner disappears once Warm-Up is complete (`App.jsx`; covered by `synthesis3x3StudentExperience`).
- Resume skips closed Warm-Up / DOL questions (`studentDashboardModel.js`; covered by `studentDashboardModel.test`).
- Incomplete closed assignments stay under Practice, not Finished (same).

## Open

- 2×2 verification (Warm-Up, PR6) still asks for the right side as typed. Same rule would apply; left for a
  follow-up so the mature 2×2 workspace is changed deliberately, not in passing.
