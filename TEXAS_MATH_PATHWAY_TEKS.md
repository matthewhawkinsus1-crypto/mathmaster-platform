# MathMaster Texas Math Pathway — Grade 6 through Algebra II

## Purpose

MathMaster now treats TEKS as a course-aware pathway instead of a single Algebra I list. The goal is to keep a student's current instructional target intact while giving teachers and the differentiation engine a transparent way to identify prior-course support standards.

## Active TEKS registries

The built-in active registries are:

- Grade 6 — 59 expectations (7 mathematical process + 52 content)
- Grade 7 — 50 expectations (7 mathematical process + 43 content)
- Grade 8 — 52 expectations (7 mathematical process + 45 content)
- Algebra I — 56 expectations (7 mathematical process + 49 content); existing Algebra I readiness/supporting metadata remains available
- Algebra II — 55 expectations (7 mathematical process + 48 content)

Total loaded expectations: **272**.

Geometry and Precalculus remain organized as course slots but are marked `planned` until their complete registries are loaded. MathMaster does not present an incomplete registry as complete.

## Course-aware TEKS codes

Examples:

- `6.6A`
- `7.7`
- `8.5I`
- `A.2A`
- `A2.4F`

The normalizer accepts common parenthesized variants such as `8.5(I)` and `A2.4(F)` and converts them to the canonical code.

## Current target vs prerequisite support

A question can separately identify:

```json
{
  "standards": {
    "primary": [
      { "code": "A2.3A", "level": "assessed" }
    ],
    "secondary": [
      { "code": "A2.1D", "level": "practiced" }
    ],
    "prerequisite": [
      { "code": "A.2I", "level": "prerequisite" },
      { "code": "A.5C", "level": "prerequisite" }
    ]
  },
  "complexity": { "framework": "DOK", "level": 2 },
  "difficulty": { "instructionalLevel": "gradeLevel", "generatorBand": 3 },
  "purpose": "independentPractice",
  "evidenceWeight": 0.75,
  "differentiation": { "mode": "recommend" }
}
```

The **primary TEKS always remains the evidence target** unless the teacher explicitly changes it. Prerequisite work is recorded as support/intervention evidence and cannot silently count as mastery of the current-course target.

## Vertical support ladder

MathMaster has a recursive support-path function that can trace a TEKS through loaded prior-course standards. Example:

`A2.3A` → Algebra I (`A.2I`, `A.5C`) → Grade 8 (`8.5I`, `8.9`) → Grade 7 (`7.4A`, `7.7`, `7.11A`) → Grade 6 linked foundations.

These individual TEKS links are **MathMaster instructional support mappings**, not a claim that TEA has designated each listed TEKS as the exclusive prerequisite for another TEKS.

### Stepwise movement rule

The engine does not automatically drop a student multiple grade levels.

1. **Insufficient evidence:** remain on current-course Grade Level / Band 3.
2. **Did Not Meet or Approaches evidence on the target:** recommend the immediate prior-course linked TEKS.
3. **If evidence also shows weakness on that prerequisite level:** the teacher/engine can move one level deeper using the pathway roadmap.
4. **Successful prerequisite work:** records intervention progress but does not replace current-course mastery evidence.
5. **Return upward:** as the prerequisite evidence stabilizes, the student returns to the original current-course target rather than remaining permanently tracked below course level.

This keeps differentiation responsive and reversible.

## Teacher workflow

### Standards & Difficulty editor

Each question can now browse all loaded registries:

- Grade 6
- Grade 7
- Grade 8
- Algebra I
- Algebra II

The teacher can assign Primary TEKS, Secondary/process TEKS, Prerequisite TEKS, DOK, difficulty band, purpose, evidence weight, and differentiation mode. `Add prior` inserts the immediate MathMaster prerequisite-support links for the selected primary TEKS.

### TEKS & Mastery dashboard

The dashboard includes:

- **Student Matrix** — course-specific mastery estimates and TEKS evidence
- **Item Analysis** — question performance by course, TEKS, DOK, difficulty, and observed difficulty
- **TEKS Registry** — switch among Grade 6, Grade 7, Grade 8, Algebra I, and Algebra II
- **TEKS Pathway** — prior support, current target, next connections, and a multi-level prerequisite support ladder

Clicking a linked TEKS changes the active registry/course automatically, so a teacher can move through the pathway without searching codes manually.

## Course prerequisites vs TEKS support links

MathMaster stores these as separate concepts.

`prerequisiteCourseIds` is for course-level prerequisites:

- Algebra I ← Grade 8 Mathematics or equivalent
- Geometry ← Algebra I
- Algebra II ← Algebra I
- Precalculus ← Algebra I + Geometry + Algebra II

`TEXAS_VERTICAL_ALIGNMENT` is MathMaster's instructional mapping between individual TEKS for diagnostic support.

A course prerequisite does not mean every TEKS in the prior course is a prerequisite for every TEKS in the next course.

## Mastery data stays course-aware

A student's profile can contain Grade 8, Algebra I, and Algebra II evidence at the same time:

```json
{
  "courses": {
    "grade8": { "overall": {}, "teks": {} },
    "algebra1": { "overall": {}, "teks": {} },
    "algebra2": { "overall": {}, "teks": {} }
  }
}
```

The platform does not blend those into a misleading single course score. The top-level overall view remains available for backward compatibility, while the teacher dashboard uses course-specific summaries.

## Exports

Exports preserve course identity for every standard and evidence row:

- Student Texas Math TEKS CSV
- Selected-course Standards Matrix CSV
- Selected-course Item Analysis CSV
- Full JSON mastery/evidence export

This makes prerequisite evidence portable without confusing it with the student's current-course evidence.

## Future registry expansion

The same architecture is ready for complete Geometry and Precalculus registries and could later extend below Grade 6 if needed. Adding a complete registry activates that course in the same selector without changing historical question metadata or student evidence.
