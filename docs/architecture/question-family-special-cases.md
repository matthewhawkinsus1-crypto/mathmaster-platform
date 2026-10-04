# Question Families: equation special cases and algebraic 2×2 systems

Phase 1 of the Question Family capability work that #429's Honors audit asked
for: generated equations that may have one solution, no solution or every real
number, with distribution and exact fractions, and generated 2×2 systems with
one, none or infinitely many solutions, answered in the Systems Workspace. The
general engine is described in
[question-families-and-practice-recovery.md](question-families-and-practice-recovery.md);
what each family version can do is in the generated
[Question Family capability report](../question-families/QUESTION_FAMILY_CAPABILITIES.md).

## Versions: nothing that has shipped moves

| Family | Version | Status |
| --- | --- | --- |
| `linear.multiStepEquation` | v1 | Unchanged. What an unpinned reference means. |
| `linear.multiStepEquation` | **v2** | New: `solutionCase`, `distribute`, `solutionForm`, `coefficientForm`. Only a slot that says `"version": 2` gets it. |
| `linear.twoStepEquation` | v1 | Unchanged. What an unpinned reference means. |
| `linear.twoStepEquation` | **v2** | New: `distribute`, `solutionForm`, `coefficientForm` (always one solution, so no `solutionCase`). Pinned only. |
| `systems.algebraic2x2` | **v1** | New family, `systemsWorkspace` mode `algebraic`. |

v1 resolves constraints with `fallback`: an unknown knob is reported and
ignored. A v1 slot that already asked for `solutionCase` has been handing out
one-solution equations, with pins; teaching v1 the knob would turn those pins
into different questions. So v1 is untouched and the new mathematics ships as
new versions. `tests/platform/fixtures/questionFamilyGolden.json` records what
every version that shipped before this work produces (instance lists, every
seat's delivery pins, built-question bytes, Recovery pins, capacity) and
`questionFamilyHistoricalPins.test.mjs` requires byte equality and replays every
pin through reproduction, the #430 rebuild and the server's seat-verified
grading resolver. The new versions are appended to the same record, including
every concept setting a slot can ask for, so they are frozen from now on too.

Pre-Flight **blocks** a v1 slot that uses a constraint only v2 declares (even
misspelled: `solution_case` → "looks like `solutionCase`… set `"version": 2`").

## Strict constraints

The new versions use `constraintPolicy: "strict"`: an unknown constraint, a
value the family does not list, a range outside its limits, or a
`questionFamily.tool` it cannot fill makes the slot unresolvable
(`constraint_invalid`) with a message naming what is allowed — and, for a near
miss, the constraint that was meant. Semantic validation blocks publishing it;
nothing is ever generated from a default instead.

## Construction, case by case

Every candidate is built by a **case constructor** and then **classified again,
independently and exactly, from what is displayed** (`questionFamilyExact.mjs`,
rational arithmetic on the equation or system as rendered). A candidate whose
displayed form is not the intended case is refused (`case_mismatch`); the
constructors are exported and mutation-tested — each broken constructor makes
the family generate nothing.

**Equations** (`questionFamiliesLinearCases.mjs`). The left side is one of four
shapes, each with its own simplification A·x + B: like terms
(`5x + 3 − 2x`), like constants (`4x + 9 − 2`), distribute then a constant
(`3(x + 2) + 1`), distribute then like terms (`−2(x − 3) + 5x`).
`distribute` chooses the shapes (`mixed` uses all four). The right side s·x + t:

| Case | Construction |
| --- | --- |
| one | s ≠ A. An integer answer x₀ is built in: t = B + (A − s)·x₀, so the key cannot disagree. A fraction answer comes from a free t and must be a genuine fraction with denominator ≤ 12. |
| none | s = A (the variable terms cancel), t ≠ B (the constants conflict): `a(x + b) + c = ax + d`, d ≠ ab + c. |
| infinite | s = A and t = B: the same expression after simplifying, never written the same way. |

The same shapes serve every case, so in a mixed slot the look of an equation
says nothing about its answer. Every instance keeps the variable on both sides.
Two-step v2 is `a·x + b = c` or `a(x + b) = c`, a ≠ 0, ±1.

**Systems** (`questionFamiliesSystemsAlgebraic.mjs`), integer coefficients
within ±12, constants within ±60:

| Case | Construction |
| --- | --- |
| one | Two equations through a chosen point (x₀, y₀): integers, or with `solutionForm: "fraction"` a point with halves, thirds or quarters that still gives whole-number equations. Checked: det ≠ 0 and the intersection is exactly that point. |
| none | The second equation is k × the first on the left (k ∈ ±2, ±3, ±4 — never a sign flip) with a constant that is not k × the first: parallel, distinct lines. |
| infinite | The second equation is k × the whole first: one line written two ways. |

## Mixed slots are balanced

`solutionCase: "mixed"` stratifies the instance list by (case × shape), and the
engine interleaves the strata **balanced on the case first**
(`strata.balance: "case"`): counting from the first seat, seats 1–3, 4–6, 7–9, …
each take one of each case, so a class of 30 gets exactly 10 of each — with or
without distribution mixed in. (Those aligned groups are the guarantee; three
adjacent seats that straddle two groups may repeat a case.) A student's later
variants do not keep landing on one case. A mixed equation slot
opens Step Algebra's relation workspace for every case and a mixed system shows
the same prompt for every case, so the workspace never tells a student which
case they drew.

## Exact fractions

Coefficients, constants and answers are rationals end to end. A fraction answer
is keyed `"7/3"` (`\frac{7}{3}`); there is no float key for it (`generatedAnswer`
is set only for integers). Systems declare `exactSolution: true`: the shared
2×2 grader then matches each solved value to 1e-6 relative instead of the
hand-authored 0.05, so `1.67` is not credited for `5/3`. Hand-authored systems
keep 0.05.

## Grading: the browser and the server reach the same verdict

Students answer in the existing workspaces — no free response, multiple choice
or teacher scoring:

* **Step Algebra, equation workspace** (a one-solution slot): the student
  isolates the variable; the shared grader checks the final equation against
  the original.
* **Step Algebra, relation workspace** (any slot that can be a special case):
  "No solution" / "All real numbers" are accepted only once the student's own
  algebra has left a statement with no variable (`7 = 2`, `3 = 3`, judged
  exactly — `obviousSpecialClaim`); the shared grader compares the conclusion
  with the solution set of the original equation. An "All real numbers"
  conclusion on a polynomial equation is decided by identity, exactly — the
  scan it used before probed at ±10¹¹, where a coefficient like 5/3 rounds and
  a true identity read false.
* **Systems Workspace, algebraic** (any method unless the slot authors
  `"method": "substitution"` or `"elimination"`): the solved values and both
  verifications, or the statement with no variable and its three readings
  (true/false, how many solutions, the classification).

The browser grades with the workspace's own shared grader, the server rebuilds
the instance from the delivery pin (seat-verified) and grades the same bytes.

## Supports never change the concept

`solutionCase`, `distribute`, `solutionForm` and `coefficientForm` are
**concept constraints**. A support modification may narrow number ranges only;
the contract refuses, at definition, a family whose support would override a
concept constraint. So for a student with reduced complexity:

* a "no solution" slot is still no solution, an identity still an identity;
* a fraction answer is still a fraction — making it an integer would change
  what the lesson assesses, and no support policy allows that dimension today;
* a distribution slot still distributes; a parallel system is still parallel.

Reduced complexity shrinks coefficients, constants and answer ranges (for
systems the special-case constants scale with the coefficient range, so they
shrink too) and draws from its own list, so supported students are still unique
among themselves.

## Recovery

Every new slot is Recovery-ready (generator-backed, server-graded). A Recovery
item comes from its own list and skips every fingerprint the student has seen,
so it is never the original or a practice item while the family has others; its
pin reproduces exactly; and the server grades it from the pin with the shared
grader. A no-solution slot recovers to a no-solution question. (Recovery's
scoring policy is not part of this work.)

## Authoring and Pre-Flight

The authoring contract lists each strict version with every constraint it
accepts. Pre-Flight reports, per slot, the family version, its concept settings,
the cases it delivers, its tool, its capacity and Recovery readiness, and says
how a mixed slot shares its cases out. The capability report
(`node scripts/report-question-family-capabilities.mjs --write`) is generated
from the registry; a test fails when it is stale.

## Certification

| Gate | What it proves |
| --- | --- |
| `questionFamilyEquationCases.test.mjs`, `questionFamilySystemsCases.test.mjs` | Each case is what it says, read independently (mathjs fractions) from what the student sees; exact fractions; strict rejection; mutation tests of every case constructor. |
| `questionFamilyCaseCertification.test.mjs` | 22 slot settings × 30 students seated by the real allocator: valid, unique fingerprints and equations, capacity, deterministic replay, valid keys, browser/server parity; mixed slots exactly 10/10/10. |
| `questionFamilyCaseWorkflows.test.mjs` | Every seat's version finished through the workspaces' own engines (balanced moves, rewrites, claims; elimination and substitution) and credited by both graders. |
| `questionFamilyCaseRecovery.test.mjs`, `questionFamilyCaseSupports.test.mjs`, `questionFamilyCasePreflight.test.mjs`, `questionFamilyCapabilities.test.mjs` | Recovery, reduced complexity, Pre-Flight and the capability report. |
| `tests/browser/questionFamilyCases.mjs` | The real controls in Chromium on a Chromebook, an iPad and a phone: Step Algebra (distribution, like terms, contradiction, identity, fraction answers and coefficients) and the Systems Workspace (elimination and substitution, one/none/infinite, exact fractions, student-chosen methods, wrong readings), each response re-graded on the server path. Workflow `question-family-cases-browser.yml`. |

## Known limits (pre-existing, recorded here)

* A substitution-authored system has no ±1 coefficient about one time in five
  (and more often for special cases), so the student isolates through a
  fraction. The workspace completes it (browser journeys
  `systems-*-fraction-isolation`); a "substitution-ready" option is a Phase 2
  candidate.
* The 2×2 verification step still accepts each typed side within 0.05 (the
  workspace's own "Check equation n"); the solved values themselves are exact.
* The relation grader still reads `x/x = 1` as "All real numbers" (its region
  scan, unchanged here: the new exact identity check applies to polynomial
  equations only).
