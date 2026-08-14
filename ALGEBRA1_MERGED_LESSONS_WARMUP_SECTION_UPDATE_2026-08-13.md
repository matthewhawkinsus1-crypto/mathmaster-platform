# MathMaster — Algebra I merged lessons + section workflow update

Date: 2026-08-13

## New authored lesson bundles

- `content/generated/Algebra1_M1_T1_Lessons1-2_Merged_V5.json`
  - Warm-Up: 3 questions
  - Classwork: 12 questions
  - Practice: 5 questions
  - DOL: 3 questions
  - 23 total
  - Focus: independent/dependent quantities, discrete/continuous relationships, scenario-to-graph matching, axis labels/units/scale, origin meaning, domain/range, graph behavior, comparison, sorting, extrema, and justification.

- `content/generated/Algebra1_M1_T1_Lessons3-4_Merged_V5.json`
  - Warm-Up: 3 questions
  - Classwork: 13 questions
  - Practice: 6 questions
  - DOL: 4 questions
  - 26 total
  - Focus: relation/function distinction, mapping/domain/range, function notation, Vertical Line Test, multiple representations, linear/quadratic/exponential families, domain/range by family, characteristics-to-family reasoning, graph construction, non-uniqueness of characteristics, and intercept feasibility.

Both bundles use Authoring Intent V5 and include authored defaults:

```json
"warmup": { "enabled": true, "minutesBeforeStart": 7 },
"dol": { "enabled": true, "minutesBeforeEnd": 10 }
```

The teacher can review/change these dates and timing in Preflight.

## Student section behavior

- Question numbering resets visually in every section. Warm-Up Q1, Classwork Q1, Practice Q1, and DOL Q1 are independent display numbers.
- Stable underlying stored question indices remain unchanged so historical grades, scratchpads, evidence, and question records cannot shift.
- When every included question in a section is finished, the section receives a prominent `✓ SECTION COMPLETE` badge and completed styling in the top section navigation.
- Live presence reports the student's section-relative question number, so the teacher sees `CLASSWORK Q3` instead of a confusing global question number.

## Warm-Up lifecycle

- An authored Warm-Up opens by default 7 minutes before that student's scheduled class period begins.
- It opens only on the assignment's Warm-Up instructional date. Preflight supports a default date and optional per-class dates for A/B-day sections.
- Before the opening window it is locked.
- During the class period it is available unless the teacher closes it.
- Teacher controls are available in Teacher Home / Live Class Monitor and Classes Workspace.
- Closing Warm-Up is class-specific; closing Period 3 does not close Period 5.
- A teacher can reopen it during that class period.
- After teacher close or class end, saved work remains visible but Warm-Up is read-only.

## DOL section correction

The DOL timer now applies to the entire authored DOL section, not only the first DOL question. Every DOL question shares the same final-window/early-unlock gate and closes when the DOL timer expires. DOL scoring is calculated across the DOL section.

## Algebra II Lesson 1 Day 2 table-input correction

The uploaded question that asks students to complete the table for `f(x)=0.5x+1` was authored correctly. The failure was in the composed workflow renderer: the secure question reader stripped the table answer key (correct behavior), while the table component was incorrectly using the presence of that answer key to decide which cells should be editable. The result was a table with no input cells.

`src/platform/workflow/WorkflowRunner.jsx` now marks the response-column cells as editable blanks independently of the hidden grading key. The workflow grader retains the answer key and still grades the entered values securely.

## Authoring coverage correction

Authoring Intent V5 now supports `configureAxes` / `axisRequirements`, allowing AI-authored relationship-model questions to require students to:

- identify independent/dependent quantities,
- choose discrete/continuous,
- label x/y axes,
- apply units,
- choose a reasonable count-by scale,
- and have those choices appear on the graph.

This closes an important Lesson 1 fidelity gap.

## Recommended next implementations

1. **Open Sort Board** — a reusable tool where students create their own graph categories, drag graph cards into those groups, name each group, and justify the rule. The current platform can assess sorting/justification with authored categories, but this would reproduce Lesson 2's genuinely open-ended 13-graph sort more faithfully.
2. **Constraint-Based Function Builder** — grade any equation/graph that satisfies authored properties such as `quadratic + discrete + minimum`, rather than requiring one predetermined equation. This would make Lesson 4's “many possible correct functions” tasks fully auto-gradable while preserving the mathematical point that characteristics do not determine one unique graph.
3. **Section release controls** — optionally let a teacher open/close Classwork and Practice from the Live Class Hub, using the same class-specific control pattern as Warm-Up and DOL.
4. **Warm-Up participation pulse** — surface `not started / active / complete` counts plus median start delay after the Warm-Up opens, making the seven-minute early window useful as an entry-routine metric without turning it into another grade.

## Verification performed

- Both V5 lesson bundles parse as strict JSON.
- V5 compiler check: Lessons 1–2 compile to 23 runtime questions; Lessons 3–4 compile to 26 runtime questions.
- Warm-Up lifecycle focused tests pass, including 7-minute opening, class-specific teacher close, class end, wrong-day lock, and multi-question DOL index resolution.
- JSX/JavaScript syntax checks pass for every changed UI/runtime file checked.
- The Algebra II table workflow was inspected against the uploaded question and the fixed table stage now explicitly creates editable response cells while leaving grading answers outside the renderer.
- A full Vite/browser build was not run in this extracted environment because the dependency tree is incomplete (`mathjs` is not installed here). GitHub/Vercel/Firebase build remains the final deployment integration check.
