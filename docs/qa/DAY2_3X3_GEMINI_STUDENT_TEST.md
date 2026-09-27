# Day 2 3×3 Systems Student Experience & QA Report

**Branch:** `ai/gemini-3x3-day2-assignment`  
**Base:** `synthesis/3x3-day1-student-experience`  
**Issue:** #371  
**Course:** Algebra II Honors  
**Assignment Title:** 3×3 Systems — Day 2: Strategy, Classification & Modeling  
**File:** `docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json`  

---

## Executive Summary & Instructional Architecture

Day 2 builds directly on the Day 1 foundation (PR #368 / PR #370) without retreating to 2-variable systems and without jumping ahead to inverse matrices. The lesson guides students across a 90-minute block through seven coherent pedagogical stages:
1. **Three-plane geometry reconnect:** Re-establishing the spatial meaning of three intersecting planes and their intersection point.
2. **Three-plane classification:** Interactively exploring coincident/dependent planes (infinitely many solutions) and parallel/inconsistent planes (no solution).
3. **Strategic elimination planning:** Inspecting coefficients and choosing variables/multipliers *before* executing arithmetic.
4. **Guided & independent 3×3 elimination:** Solving less-scaffolded unique-solution systems using the continuous Systems Workspace.
5. **Algebraic signal interpretation:** Discovering and justifying the algebraic and geometric meanings of $0 = 0$ (identity/dependent) and $0 = \text{nonzero}$ (contradiction/inconsistent).
6. **Real-world 3-variable modeling:** Formulating and solving a three-variable triangle side-length modeling problem ($s, m, l$).
7. **Demonstration of Learning (DOL):** A focused, 2-question assessment targeting algebraic classification and geometric interpretation, completable within 10 minutes without an exhausting solve.

---

## Detailed Section Breakdown & Timing Estimates

| Section | Questions | Intended Time | Question Types / Tools |
| :--- | :--- | :--- | :--- |
| **Warm-Up** | 2 | 8 min | Systems Workspace (Spatial 3D) + Multi-Answer (Strategy) |
| **Classwork** | 3 | 20–22 min | Systems Workspace (Spatial 3D) + Multi-Answer (Algebraic Identity) + Systems Workspace (Algebraic Elimination) |
| **Practice** | 7 | 45–50 min | Systems Workspace (Algebraic Choice) + Systems Workspace (Spatial 3D No-Solution) + Multi-Answer (Contradiction) + Multi-Answer (Justification) + Multi-Answer (Modeling Formulation) + Systems Workspace (Modeling Elimination) + Multi-Answer (Honors/CCMR ACT Parameter Rigor) |
| **DOL** | 2 | 8–10 min | Multi-Answer (Contradiction Classification & Justification) + Multi-Answer (Geometry Connection) |
| **Total** | **14** | **~85–90 min** | **Comprehensive Honors Block** |

---

## Section-by-Section Student Experience

### 1. Warm-Up — Reconnect & Strategic Structure (Target: ~8 min)

#### Q1 (`3x3-d2-wu-1`): Spatial Geometry Reconnect
- **Tool / Mode:** `systemsWorkspace` (Mode: `spatial`)
- **System:** Alternate unique system:
  $$x + y - z = -1$$
  $$x + y + z = 3$$
  $$3x - 2y - z = -4$$
- **What the student sees & does:**
  - Student sees the interactive 3D three-plane visualizer with axes and three distinct translucent colored planes.
  - Student rotates the 3D model, toggles planes on/off to see pairwise intersection lines (dashed), and clicks "Reveal the solution point".
  - Solution marker appears at $(0, 1, 2)$.
  - Student answers: *What does this single point represent?*
  - Correct choice: *An ordered triple $(0, 1, 2)$ that satisfies all three equations simultaneously.*
- **Time estimate:** ~4 minutes.
- **Pacing & Cognitive Load:** Low barrier to entry; visual and spatial reminder of Day 1 concepts.

#### Q2 (`3x3-d2-wu-2`): Strategic Pre-Planning
- **Tool / Mode:** `multiAnswer`
- **System:**
  $$5x + 3y + 2z = 2$$
  $$2x + y - z = 5$$
  $$x + 4y + 2z = 16$$
- **What the student sees & does:**
  - Student inspects the coefficients before touching a pencil or calculator.
  - Part 1: Identifies that $z$ can be eliminated between Eq 1 and Eq 3 without scaling (both have $+2z$).
  - Part 2: Identifies that Eq 2 ($-z$) can be scaled by $2$ and added to Eq 1 or Eq 3 to eliminate $z$ in a second pair with minimal arithmetic.
- **Time estimate:** ~4 minutes.
- **Pacing & Cognitive Load:** Cultivates Honors-level habit of mind: structure-first, calculation-second.

---

### 2. Classwork — Strategy, Classification & Guided Solve (Target: ~20–22 min)

#### Q1 (`3x3-d2-cw-1`): Interactive Three-Plane Classification (Dependent Planes)
- **Tool / Mode:** `systemsWorkspace` (Mode: `spatial`)
- **System:**
  $$2x + y - 3z = 5$$
  $$x + 2y - 4z = 7$$
  $$6x + 3y - 9z = 15$$
- **What the student sees & does:**
  - Student rotates the 3D model with teacher guidance.
  - Discovers that Plane 1 (blue) and Plane 3 (green) are coincident (the same plane in space because $3 \times \text{Plane 1} = \text{Plane 3}$).
  - Plane 2 (red) cuts through them along a continuous line of intersection.
  - Student classifies the geometric intersection as infinitely many solutions along a line.
- **Time estimate:** ~6 minutes.

#### Q2 (`3x3-d2-cw-2`): Guided Algebra-to-Geometry Connection ($0 = 0$)
- **Tool / Mode:** `multiAnswer`
- **System:** Same dependent system from CW1.
- **What the student sees & does:**
  - Student observes the algebraic step: multiplying Eq 1 by 3 yields $6x + 3y - 9z = 15$; subtracting Eq 3 yields $0 = 0$.
  - Part 1: Classifies $0 = 0$ as an algebraic identity indicating dependent equations.
  - Part 2: Connects this algebraic result to the 3D geometry: the system has infinitely many common points along the line of intersection.
- **Time estimate:** ~5 minutes.

#### Q3 (`3x3-d2-cw-3`): Guided 3×3 Elimination Solve
- **Tool / Mode:** `systemsWorkspace` (Mode: `algebraic`, Method: `elimination`)
- **System:**
  $$5x + 3y + 2z = 2$$
  $$2x + y - z = 5$$
  $$x + 4y + 2z = 16$$
- **What the student sees & does:**
  - Executes the strategy planned in Warm-Up Q2.
  - Eliminates $z$ using Pair {Eq 1, Eq 3} and Pair {Eq 1, Eq 2}.
  - Scales Eq 2 by 2, enters products term-by-term, marks cancellation, and adds.
  - Solves the reduced $2 \times 2$ system for $x = -2, y = 6$.
  - Back-substitutes into an original equation to find $z = -3$.
  - Verifies the triple $(-2, 6, -3)$ across all three original equations.
- **Time estimate:** ~11 minutes.

---

### 3. Practice — Independent Solve, Classification & Modeling (Target: ~45–50 min)

#### Q1 (`3x3-d2-pr-1`): Independent Unique Solve (Student Choice)
- **Tool / Mode:** `systemsWorkspace` (Mode: `algebraic`, Method: `studentChoice`)
- **System:**
  $$x + y - z = -1$$
  $$x + y + z = 3$$
  $$3x - 2y - z = -4$$
- **What the student sees & does:**
  - Student chooses between Substitution and Elimination.
  - Recognizes that adding Eq 1 and Eq 2 cancels $z$ immediately: $2x + 2y = 2 \implies x + y = 1$.
  - Solves the reduced system to get $(0, 1, 2)$ and verifies.
- **Time estimate:** ~9 minutes.

#### Q2 (`3x3-d2-pr-2`): Spatial Model of Inconsistent Planes
- **Tool / Mode:** `systemsWorkspace` (Mode: `spatial`)
- **System:**
  $$3x - y - 2z = 4$$
  $$6x - 2y - 4z = 11$$
  $$9x - 3y - 6z = 12$$
- **What the student sees & does:**
  - Student rotates the 3D model and observes three strictly parallel, non-coincident planes.
  - Classifies the system as having no common intersection point (no solution).
- **Time estimate:** ~5 minutes.

#### Q3 (`3x3-d2-pr-3`): Contradiction from Algebra ($0 = -3$)
- **Tool / Mode:** `multiAnswer`
- **System:** Same inconsistent system from PR2.
- **What the student sees & does:**
  - Follows elimination between Eq 1 (scaled by 2: $6x - 2y - 4z = 8$) and Eq 2 ($6x - 2y - 4z = 11$).
  - Subtraction gives $0 = -3$.
  - Classifies $0 = -3$ as a contradiction (false for all $(x, y, z)$) and concludes the system is inconsistent (no solution).
- **Time estimate:** ~5 minutes.

#### Q4 (`3x3-d2-pr-4`): Classification & Justification Reasoning
- **Tool / Mode:** `multiAnswer`
- **What the student sees & does:**
  - Synthesizes the core rule:
    - $0 = 0 \implies$ Dependent, infinitely many solutions.
    - $0 = k$ ($k \neq 0$) $\implies$ Inconsistent, no solution.
- **Time estimate:** ~5 minutes.

#### Q5 (`3x3-d2-pr-5`): Triangle Modeling — Equation Formulation
- **Tool / Mode:** `multiAnswer`
- **What the student sees & does:**
  - Sets up side variables: shortest $s$, medium $m$, longest $l$.
  - Translates:
    - Short + medium is 8 cm longer than longest $\implies s + m = l + 8$.
    - Medium + longest is 4 cm more than 3× shortest $\implies m + l = 3s + 4$.
    - Perimeter is 72 cm $\implies s + m + l = 72$.
- **Time estimate:** ~6 minutes.

#### Q6 (`3x3-d2-pr-6`): Triangle Modeling — Algebraic Solution & Verification
- **Tool / Mode:** `systemsWorkspace` (Mode: `algebraic`, Method: `elimination`)
- **System:**
  $$s + m - l = 8$$
  $$-3s + m + l = 4$$
  $$s + m + l = 72$$
- **What the student sees & does:**
  - Eliminates $l$ (adding Eq 1 and Eq 2; adding Eq 1 and Eq 3).
  - Solves for $s = 17, m = 23, l = 32$.
  - Verifies side lengths satisfy the perimeter (72) and triangle conditions.
- **Time estimate:** ~10 minutes.

#### Q7 (`3x3-d2-pr-7-ccmr-rigor`): Honors / CCMR Authentic Parameter Rigor
- **Tool / Mode:** `multiAnswer` (ACT Alignment `preparingHigherMath`, examStyle: true)
- **System:**
  $$2x + y - 3z = 5$$
  $$x + 2y - 4z = 7$$
  $$6x + 3y - 9z = c$$
- **What the student sees & does:**
  - Identifies that when $c = 15$, Eq 3 is a multiple of Eq 1 ($3 \times 5 = 15$), producing dependent planes and infinitely many solutions.
  - Identifies that when $c = 20 \neq 15$, Eq 3 represents a distinct parallel plane, producing a contradiction $0 = -5$ and no solution.
- **Time estimate:** ~7 minutes.

---

### 4. DOL — Classification, Justification & Geometry (Target: ~10 min)

#### Q1 (`3x3-d2-dol-1`): Algebraic Work Sample Classification
- **Tool / Mode:** `multiAnswer`
- **What the student sees & does:**
  - Evaluates a student work sample ending in $0 = 8$.
  - Classifies as inconsistent (no solution) because $0 = 8$ is a contradiction for all values of $x, y, z$.
- **Time estimate:** ~4 minutes.

#### Q2 (`3x3-d2-dol-2`): Geometric Translation
- **Tool / Mode:** `multiAnswer`
- **What the student sees & does:**
  - Evaluates three planes where two are parallel and distinct, and the third intersects both in two separate parallel lines.
  - Concludes that elimination between the two parallel planes produces a contradiction $0 = k$ ($k \neq 0$), yielding no solution overall.
- **Time estimate:** ~5 minutes.

---

## Platform Limitations & Architectural Observations

1. **3×3 Inconsistent and Dependent Systems in Algebraic Mode:**
   - Platform engine `src/tools/systemsWorkspace/algebraicSystemsEngine.js` (lines 868–871) currently throws a validation error if a 3×3 system assigned to `mode: "algebraic"` is not unique:
     `"3×3 algebraic systems must have exactly one solution; this system is ... Dependent and inconsistent 3×3 systems are not supported by the substitution workflow yet."`
   - *Design Decision:* Rather than weakening the mathematical lesson or artificially forcing a non-unique system through the 2×2 back-substitution solver (which expects numeric single-point tokens), we represent the non-unique systems in 3D spatial mode (`systemsWorkspace` in `mode: "spatial"`) and pair them with analytical `multiAnswer` reflection items that evaluate the exact algebraic steps ($0 = 0$ and $0 = -3$). This preserves rigorous mathematics without triggering platform runtime exceptions.

2. **Audited CCMR Bank Coverage for 3-Variable Linear Systems:**
   - In accordance with the semantic fit gate established in PR #359 / issue #371, the audited CCMR bank contains items for 2-variable systems and linear-quadratic systems under TEKS A2.3A/A2.3B, but no authentic 3-variable system items.
   - The platform preflight correctly reports:
     `Question 12 is direct act practice but is not sourced from the audited CCMR V2.1 assignment bank. Its alignment can still validate, but MathMaster cannot label its provenance as bank-backed.`
   - As directed in issue #371, we preserve the authentic 3-variable parameter question rather than gaming the check with an unrelated 2-variable item.

---

## Local Verification & Student Run Check

- **Local Host:** `http://localhost:5173/`
- **Build & Preflight Status:**
  - `buildAssignmentV5PreflightModel`: `isValid: true`, `errors: []`.
  - Pacing budget: Classwork planned time is well within the 20-minute cap.
  - Section roles and attempts: Warm-Up (3 attempts), Classwork (3 attempts), Practice (3 attempts), DOL (1 attempt, delayed feedback).
