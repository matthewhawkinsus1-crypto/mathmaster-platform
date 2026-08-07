# MathMaster Texas Standards & Mastery Engine

## Purpose

The engine gives every MathMaster question a common standards-and-difficulty language and converts student attempts into useful instructional evidence. JSON is the canonical source of truth, while the Assignment Question Editor provides a no-code editor for the same metadata.

## Texas-aligned fields

MathMaster includes the current Algebra I TEKS registry from 19 TAC §111.39. Each TEKS entry includes its code, concise description, reporting category when applicable, and current STAAR Algebra I readiness/supporting classification. The seven mathematical-process standards are tracked separately as process standards.

The built-in registry contains 56 Algebra I expectations: 7 process standards, 16 readiness standards, and 33 supporting standards.

Official source references:
- Texas Education Agency, 19 TAC Chapter 111, §111.39 Algebra I.
- Texas Education Agency, STAAR Algebra I Blueprint.
- Texas Education Agency, STAAR Performance Standards.

## Question metadata

Recommended canonical question metadata:

```json
{
  "standards": {
    "primary": [{ "code": "A.2A", "level": "assessed" }],
    "secondary": [{ "code": "A.1D", "level": "practiced" }],
    "prerequisite": []
  },
  "complexity": { "framework": "DOK", "level": 2 },
  "difficulty": { "instructionalLevel": "gradeLevel", "generatorBand": 3 },
  "purpose": "independentPractice",
  "evidenceWeight": 0.75,
  "differentiation": { "mode": "recommend" }
}
```

TEKS evidence levels are `introduced`, `practiced`, `assessed`, and `masteryEvidence`. Prerequisite TEKS are stored separately.

## DOK versus difficulty

DOK is used only as a cognitive-complexity framework:
- DOK 1: Recall & Reproduction
- DOK 2: Skills & Concepts
- DOK 3: Strategic Thinking
- DOK 4: Extended Thinking

DOK is not treated as an official Texas difficulty score. Mathematical difficulty is separately controlled by MathMaster generator bands:
- Band 1: Prerequisite
- Band 2: Developing
- Band 3: Grade Level
- Band 4: Advanced
- Band 5: Extension

This separation allows a DOK 2 item to exist at multiple mathematical difficulty levels.

## Evidence purpose and weight

Defaults:
- prerequisite check: 0.60
- instruction / modeled example: 0.25
- guided practice: 0.40
- independent practice: 0.75
- formative check: 0.90
- DOL / exit ticket: 1.00
- assessment: 1.25
- intervention: 0.50
- extension: 0.75

Teachers can override the weight from 0 through 2. The mastery engine also considers readiness/supporting classification, DOK, TEKS evidence level, scaffold use, and recency.

Modified evidence is tracked separately and is excluded from the grade-level performance estimate by default. Accommodated grade-level work remains eligible evidence.

## Estimated instructional performance

MathMaster uses the familiar Texas labels for local instructional planning:
- Did Not Meet Grade Level
- Approaches Grade Level
- Meets Grade Level
- Masters Grade Level

The dashboard always labels this an **Estimated Instructional Performance Level**. It is not an official STAAR classification or scale score.

MathMaster currently uses these local instructional thresholds:
- below 55: Did Not Meet
- 55–69: Approaches
- 70–84: Meets
- 85+: candidate Masters

A Masters estimate additionally requires a broader evidence set including at least one DOK 3+ item. These thresholds and safeguards are MathMaster heuristics, not TEA cut scores.

Confidence is Low, Medium, or High based on the amount, effective weight, and DOK breadth of available evidence. Insufficient evidence defaults differentiation to Band 3 rather than assuming a student needs easier work.

## Automatic differentiation

Modes:
- `off`: no recommendation and no adaptive content change.
- `recommend`: calculate the student's suggested band but keep authored content unchanged.
- `auto`: apply the suggested band only when the question author supplies difficulty-tagged variants or `differentiation.bandProfiles`.

Per-TEKS recommendations take priority over the student's overall level. If a question targets A.2A, MathMaster first looks for the student's A.2A evidence rather than treating the student as globally high or low.

Accommodations and modifications are applied after adaptive selection so a student's saved support plan wins if it conflicts with adaptive generation.

## Analytics and exports

The TEKS & Mastery dashboard contains:
- Student standards matrix with per-TEKS scores, instructional estimates, confidence, and recommended generator band.
- Student detail view with DOK breadth and separately tracked modified evidence.
- Item analysis with response count, first-attempt correctness, eventual correctness, average attempts, intended difficulty, and observed difficulty.
- Full Algebra I TEKS registry.

Exports:
- Student TEKS CSV
- Class Standards Matrix CSV
- Item Analysis CSV
- Full Standards/Mastery JSON

## Observed item difficulty

Intended difficulty is authored before students respond. Observed difficulty is calculated later from actual first-attempt performance. MathMaster does not overwrite the authored DOK or generator band with observed difficulty.

## Backward compatibility

Older questions do not have to be rewritten immediately. Legacy `standards: ["A.2A"]` is accepted as primary assessed alignment. Questions without TEKS/DOK remain usable, but the dashboard reports metadata coverage so the teacher can see how much evidence is standards-ready.
