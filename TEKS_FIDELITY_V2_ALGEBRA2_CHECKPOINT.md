# Algebra II Fidelity V2 — Continuation Checkpoint

Last updated: 2026-08-30

## Branch

`audit/teks-fidelity-v2-algebra2-current`

This branch starts from the certified Algebra I checkpoint. Do not use the older `audit/teks-fidelity-v2-algebra2` branch because it predates the completed Algebra I Path adapter work.

## Durable resume anchor

- Certified Algebra I base: `780b9e6fbf5cf6d7bdfba8417a1fb392b4369572`
- Algebra I release checkpoint branch head that locked certification: `ddef6dc1260dd718f41e5a4ddad55714fbbb319e`
- Current Algebra II branch head before this logging update: `a3e9dc13b9036cb81bcf674936e114aa4f516fab`
- Current source bank: `drafts/algebra2.json`
- Standards: **48**
- Legacy families: **240** (5 per standard)
- Frozen whole-course decision matrix from the certified Algebra I base: **15 KEEP · 15 ENHANCE · 18 REBUILD**
- No bulk Algebra II promotion or Firestore deployment has started.

## Progress discipline — mandatory

The purpose of this file is to prevent chat interruptions from causing repeated audits.

1. Update this checkpoint **after every completed standard** before opening the next standard.
2. Also update it immediately after any branch-level architecture discovery that changes the plan.
3. A completed standard is not reopened unless a named certification/regression test fails.
4. The **FIRST UNFINISHED STANDARD** section is authoritative for every new chat.
5. When a standard is completed, record:
   - verdict,
   - exact staged file,
   - student action now measured,
   - secure/runtime dependency used or added,
   - certification gate added/extended,
   - next unfinished standard.
6. Do not spend a new chat reconstructing old work. Read this file first, then only the current unfinished standard's source/staged package/tests.

---

## Completed standards

### A2.2A — REBUILD — STAGED

Official construct: graph the required Algebra II parent functions and, when applicable, analyze key attributes.

Fidelity V2 status:
- 5 Path families
- deterministic sub-variants supported server-side
- covers all seven required parent types:
  - square root
  - reciprocal
  - cubic
  - cube root
  - exponential
  - absolute value
  - logarithmic
- logarithmic coverage includes bases 2, 10, and e
- student must construct graphs, not merely recognize attributes
- graph work is connected to domain/range/intercept/symmetry/asymptote analysis
- secure Path eligibility is checked on generated instances

Files:
- `drafts/fidelity-v2/algebra2/A2.2A.json`
- `tests/platform/algebra2FidelityV2Staged.test.mjs`
- deterministic Path sub-variant support in `functions/shared/pathQuestionGeneration.mjs`
- sub-variant regression coverage in `tests/platform/pathQuestionGeneration.test.mjs`

Do **not** re-audit A2.2A unless its certification test fails.

---

## Active standard

### A2.2B — ENHANCE — IN PROGRESS

Official construct: **Graph and write the inverse of a function using inverse-function notation.**

Known starting evidence:
- the existing linear inverse-reflection Path workflow is strong and server graded;
- the legacy table item now has a real table stimulus;
- the remaining weakness is breadth: only one family performs the complete graph → reflect across `y=x` → inverse graph → inverse equation chain;
- the staged upgrade must preserve the secure inverse-reflection contract rather than replace it with answer-box recognition.

Immediate implementation target:
- stage exactly 5 Fidelity V2 families;
- make graph-and-write the dominant student action;
- include at least one nonlinear invertible family and one authentic table-to-inverse construction family;
- keep domain-restriction reasoning only as supporting evidence, not a substitute for graphing/writing the inverse;
- extend `tests/platform/algebra2FidelityV2Staged.test.mjs` to certify generated secure instances and the complete inverse-action chain.

## FIRST UNFINISHED STANDARD

### A2.2B

Resume here until its staged package and certification gate are committed.

After A2.2B passes, advance immediately to **A2.2C** and update this file first.

---

## Standard-by-standard working rules

For each standard:
1. Read the exact TEKS verb/construct.
2. Compare only that standard's five legacy families.
3. Use the frozen KEEP / ENHANCE / REBUILD verdict unless new evidence proves the verdict wrong.
4. Fix the student action, representation, DOK/difficulty truthfulness, generator integrity, and secure grading.
5. Stage exactly five Fidelity V2 families.
6. Add/extend the generated-instance certification gate.
7. Update this checkpoint.
8. Advance immediately to the next standard.

## Master sequence

1. Complete all 48 Algebra II standards.
2. Finish remaining Grade 8, Grade 7, and Grade 6 TEKS Fidelity V2 banks.
3. Audit/upgrade remaining CCMR banks.
4. Upgrade Path student experience, access, navigation, and visual progression.

## Rolling work log

### 2026-08-30 — continuity repair
- Confirmed the stale `audit/teks-fidelity-v2-algebra2` branch is not the working branch.
- Confirmed the certified Algebra I base and the current Algebra II continuation branch.
- Confirmed A2.2A is staged and the first unfinished standard is A2.2B.
- Added the mandatory per-standard logging rule so a streaming/chat interruption cannot send the audit back to A2.2A.

### 2026-08-30 — A2.2B architecture discovery
- The secure `functionInvestigation` contract can grade the full inverse reflection chain and its sketch validator already reflects the actual sampled curve, so nonlinear inverse graphs are supported.
- The current secure sanitizer does **not** pass a question `stimulus` into `functionInvestigation`, and `InteractiveGraphWorkspace` does not render one. Therefore a true table → graph → reflect → write-inverse family would silently lose its table in Path.
- Required fix before A2.2B certification: add a safe public table-stimulus projection to the secure function-investigation payload and render that stimulus inside the graph workspace.
- Also replace the remaining UI copy that says “inverse line” with “inverse graph”; nonlinear inverse families make “line” mathematically false.
- This is an A2.2B capability dependency, not a reason to reopen A2.2A.
