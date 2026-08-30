# Algebra I TEKS Fidelity V2 — First Findings

## Current conclusion
The compiled Algebra I bank is structurally much healthier than the retired ASVAB bank. It already contains parameterized generators, multiple task types, DOK/difficulty metadata, solution review, and representation metadata. This makes a blanket replacement unjustified.

The correct strategy is KEEP / ENHANCE / REBUILD by standard.

## Confirmed strengths
- Compiled course families can derive expected answers from the same generated parameters shown to the student.
- The existing Path quality layer already distinguishes mere coverage from a production-quality five-question session.
- Algebra I authoring is organized by mathematical strands rather than one generic question generator.
- Several standards already span procedural, interpretation/application, reverse reasoning, and error-analysis tasks.

## Confirmed weaknesses / new audit dimensions
### 1. Repeat-session durability is not currently a first-class release gate
A standard can provide five varied families yet still become predictable after repeated sessions. Fidelity V2 measures generator coverage and repeated task-shape signatures separately.

### 2. Generic coaching is overused in at least some compiled families
Repeated text such as "Use the given information to identify the relationship before computing" and "Name what each number represents" is mathematically harmless but weakens the adaptive feel and does not diagnose the student's likely misconception.

### 3. Structural diversity does not guarantee conceptual progression
A.12C/A.12D sequences contain legitimate different tasks, but they do not yet fully support the connected progression:
term number/input -> term/value table -> ordered pairs -> discrete graph -> recursive rule -> explicit rule -> application.
This is currently an ENHANCE signal, not evidence for a wholesale rebuild.

### 4. DOK and difficulty require continued independence checks
The repository already has a bank-wide DOK/difficulty audit. Fidelity V2 keeps that gate and adds human review of whether the claimed DOK is justified by the actual student reasoning.

### 5. Compiled bank must remain source of truth for audit
Some authoring-source snippets look fixed while the generated seed is parameterized. Fidelity decisions therefore inspect the compiled student-facing bank and use source files only to repair confirmed problems.

## Immediate review order
1. A.12C / A.12D sequences — representation progression and connected learning.
2. Function strand A.12A-E — repeated-session durability and task differentiation.
3. Linear writing/graphing — graph/table/equation translation and tool use.
4. Systems/data — misconception quality and DOK progression.
5. Quadratics/exponentials — generator robustness and higher-DOK transfer.

Do not modify student-facing content until the relevant standard has a human verdict and a written repair target.
