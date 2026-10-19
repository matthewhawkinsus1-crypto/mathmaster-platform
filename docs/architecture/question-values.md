# Question values (grade weighting)

What a question is worth in the grade is decided once, when the question is
created, by one module: `functions/shared/questionValue.mjs`. This page is the
rule set; the module's header is the long version.

## 1. The contract

There is one grade-value field, and it predates this work:

| Field | Meaning |
| --- | --- |
| `questionWeight` | A relative value on one absolute scale: ×1 is one standard single-response question. Valid 0.25–20. A question without one counts ×1, as it always has. |
| `questionWeightBasis` | New. Who set the value: `{ source, rule, units }`, where `source` is `author` (written in the JSON), `teacher` (the value control or an approved weight review), `auto` (measured) or `default` (could not be measured, ×1). Provenance only — no grade calculation reads it. |

Every grade calculation already reads `questionWeight` through
`normalizeQuestionWeight` (browser `src/platform/grading/questionWeights.js`,
server `functions/lib/questionWeights.js`, identical by test): the assignment
and section splits (`splitGrade`, `splitGradesBySection`), Grade Transfer's
section columns, Classroom passback and Recovery
(`sectionRecoveryService.recoveryQuestionWeight`). Nothing in that path
changed. There is no second system.

## 2. The automatic value (`workload-v1`)

Values are measured from **structure**, never from the numbers in a question:

1. **What is graded.** The question is resolved to the grading surface and mode
   the server grades it as (`resolveGradingSurfaceId`, each tool's
   `resolveMode`), so the allocator and the grader cannot disagree about which
   tool a question is.
2. **How much work.** Each surface has a profile that lists the independently
   assessed pieces of work, each of one kind:

   | Kind | What the student does | Units |
   | --- | --- | --- |
   | select | choose, match, place or sort | 0.5 |
   | respond | type a value: number, point, slope | 1 |
   | construct | build a representation: an equation in a named form, a table, a graph, a solved equation | 2 |
   | explain | write an interpretation | 2 |
   | connect | a graded check that the student's own representations agree | 0.5 |

3. **The value.** `value = √units`, to the nearest 0.25, never below ×1 and never
   above ×8. Diminishing returns are deliberate: one large item cannot swamp an
   assignment.

| Question | Units | Value |
| --- | --- | --- |
| One typed answer | 1 | ×1 |
| Two-line card sort, 5 card kinds (10 cards) | 5 | ×2.25 |
| DOL board: 6 cards + 3 meanings | 11 | ×3.25 |
| Full Multiple Representations board | 17.5 | ×4.25 |
| Full board + a story's six meanings | 22.5 | ×4.75 |

Deterministic: no AI call, no randomness, no clock. A question the profiles
cannot measure counts ×1 with source `default`, and Pre-Flight says so.

## 3. Precedence and partial values

1. **An explicit value wins.** A valid value written by the author (JSON) or set
   by the teacher (value control, approved weight review) is kept exactly. A
   value with no basis is treated as the author's.
2. **Missing values are filled.** The allocator fills only questions with no
   value. In an assignment where some questions have written values and others
   do not, the written ones are kept and the rest get automatic values on the
   same ×1 scale. Pre-Flight warns when the written values look like points on a
   larger scale (their median is at least 4× the work they assess) so the
   automatic ones would count too little.
3. **An unusable explicit value is refused, never replaced.** Zero, negative,
   non-numeric or templated (`"{{m}}"`) values are blocked by the schema with a
   teacher-facing message; MathMaster never substitutes its own.
4. **Content changes never move a value.** Every repair path carries the value
   and its basis (`carryQuestionValue`; `questionWeight`/`questionWeightBasis`
   are platform-owned fields). A different question swapped into the same place
   (an audited CCMR item for Honors) keeps a written value and re-measures an
   automatic one (`keepExplicitQuestionValue`). A value changes only through the
   value control or an approved weight review.

## 4. Question Families

The value is the **slot's**. `buildFamilyQuestion` writes the slot's
`questionWeight` and basis onto every instance and strips any a builder or
template produced, so every student's version — first delivery, Practice "New
Question", Warm-Up or DOL Recovery, a server regrade — counts the same. A
family slot is measured on its fixed preview instance. Pre-Flight blocks a slot
whose versions lose the slot's value, and warns when sampled versions do not
all need the same work.

### Process Mode boards

A Multiple Representations board in Process Mode (`interactionMode:
"process"`, see `multiple-representations-process-mode.md`) counts its key
facts as the work they are: a fact the GIVEN **shows** (the slope of
y = 2x − 3, a situation's rate) is read — `respond`, worth what typing it was;
a fact the GIVEN **hides** (the slope of 2x − 4y = 12, a table's intercepts) is
derived with shown work — `construct`, the size of a solved equation. Which is
which follows from the GIVEN's kind and the methods the board offers
(`lmrFactWorkKind`), never its numbers, so every family version is worth the
same. Everything else on the board counts exactly as in Worksheet Mode. In
practice a board moves by at most ×0.25 (the family DOL: ×3.25 → ×3.5); a
y = mx + b board does not move at all. Pre-Flight warns — and changes nothing —
when a stored automatic value was measured before a board became a Process
Mode board.

## 5. No double weighting

- No section multiplier. Warm-Up, Classwork, Practice and DOL already reach the
  SIS as separate Grade Transfer columns that the teacher weights in the
  gradebook; a "DOL counts more" factor here would weight the DOL twice.
- `scoreWeight` splits a question's own credit among its parts; it never
  changes the question's value.
- A section's grade is computed within the section: re-valuing Classwork never
  moves the DOL column.
- A value therefore counts first inside its own section. A ×5 Practice question
  answered right beside two ×1 answered wrong exports Practice as 71, not 33,
  in Grade Transfer's TEAMS row and in Classroom's section column
  (`tests/platform/sectionQuestionWeights.test.mjs`). The question editor shows
  each value as its share of its section's grade and of the whole assignment's
  (`questionWeightShares`), and the AI weight review is told the same.

## 6. Pre-Flight (`src/platform/preflight/questionValuePreflight.js`)

| Level | Check |
| --- | --- |
| Blocking | A family whose versions do not carry the slot's value. A DOL in which nothing can earn credit. An unusable written value (schema). |
| Warning | A value MathMaster could not measure (×1). One question deciding more than half of the grade (4+ questions). A written value ≥4× or ≤¼ of the work it assesses (likely a typo). Written values on a larger scale than ×1. Family versions needing different work. A non-DOL section in which nothing can earn credit. |
| Note | Questions created before values existed (×1, unchanged). Section totals, e.g. `Warm-Up ×4.5 (15.3%) · Classwork ×12.75 (43.2%) · …`. |

The audit is read-only: opening an old assignment reports, it does not rewrite.

## 7. Where values are set — every creation path

| Path | Mechanism |
| --- | --- |
| JSON import, V5 authoring intent (teacher- or AI-written) | `compileAuthoringIntentV5` → `allocateAssignmentQuestionValues` |
| Portable V5 re-import / export round trip | `parseAssignmentBlueprintText` canonical branch → `allocateAssignmentQuestionValues` (fills only missing values) |
| Question editor: typed value / "Suggest" | `teacherQuestionValue` (teacher) / `estimateQuestionValue` (auto) |
| Question editor: duplicate | copies the value (same work) |
| AI repair in the editor, Pre-Flight repair, live repair pack, server retire-and-replace, full repair / content release | `carryQuestionValue` (and its CJS mirror in `functions/lib/fullAssignmentRepair.js`) |
| AI weight review pack | changed values recorded as the teacher's |
| Honors depth: AI extension, `buildHonorsEnrichmentQuestion` | compiled / `allocateQuestionValue` |
| Honors CCMR audited swap | compiled (auto) + `keepExplicitQuestionValue` |
| Duplicate assignment, library reuse, add a class | copy stored values; never re-allocated, so every copy grades identically |
| Family instance, Practice "New Question", Recovery items | the slot's value (`buildFamilyQuestion`, `recoveryQuestionWeight`) |

## 8. Backward compatibility and migration

- **Existing assignments are not rewritten.** A stored question without a value
  still counts ×1 everywhere; Pre-Flight adds a note. Opening, previewing,
  repairing or assigning an old assignment never adds values.
- **To adopt automatic values**, re-import the assignment's JSON (import
  allocates) or set values in the question editor. Values change the relative
  weight of questions inside a section's grade, so do it before students start.
- **Content upgrades** never treat a difference in `questionWeightBasis` alone
  as a change to the question (`assignmentContentUpgradePolicy` ignores the
  provenance field); `questionWeight` itself is compared as before.
- **Weight review packs** created before this change still import; their
  fingerprint ignores the basis field.
