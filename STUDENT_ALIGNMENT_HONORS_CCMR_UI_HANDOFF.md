# MathMaster — Student Alignment + Honors CCMR UI Handoff

Build date: 2026-08-21

This update sits on top of the completed 5,150-template generative Path/CCMR bank.

## What changed for students

### Every instructional question can explain what it is building

For ordinary assignments and course My Math Path questions, the student sees a compact clickable alignment row:

- `TEKS <code>`
- when the TEKS overlaps a CCMR assessment: `CCMR connection · <N> assessments`

Clicking opens **What this question is building**, which shows:

- the TEKS code;
- course and strand;
- the full student-readable TEKS description;
- Digital SAT / ACT / TSIA2 / ASVAB connections that are actually in the authored crosswalk;
- the assessment domain for each connection;
- whether the mapping is full or partial;
- for a partial mapping, the overlapping aspect that legitimately appears on the assessment.

An ordinary course problem is explicitly described as a **course question**. It does not become exam evidence merely because the same mathematics appears on an exam.

### Authentic CCMR questions look different

A directly authored assessment-format question shows the active framework explicitly, for example:

- `TEKS A.2B`
- `Digital SAT style · Algebra`
- optionally `Also connects to 3`

The details panel explains that the item was deliberately written in that assessment's format.

The visible label is intentionally stricter than a tag. It requires:

1. `assessmentContext.framework` to be Digital SAT, ACT, TSIA2, or ASVAB;
2. `assessmentContext.examStyle: true`;
3. an explicit matching assessment alignment with a real `domainId`;
4. the question's TEKS to actually crosswalk to that assessment/domain.

### No repeated standards clutter

Before this pass, interactive Path questions could show alignment/skill information in the Path header, QuestionEngine, and again inside the tool card. The ownership is now consistent:

- ordinary assignments: QuestionEngine owns the alignment control;
- My Math Path: the session header owns it;
- interactive tools do not repeat it internally.

### Secure exam simulations are the deliberate exception

During a secure SAT/ACT/TSIA2/ASVAB simulation, the student is **not** shown the TEKS/domain panel while answering. Naming the tested topic can itself provide a clue and makes the simulation less authentic. The old student-facing `DOK` label was also removed from the secure exam question screen.

## Honors assignment rule

A full Honors assignment with independent Practice now requires **authentic CCMR transfer practice**.

A question counts toward that Honors requirement only when it is:

- in the `practice` activity role;
- directly authored in Digital SAT, ACT, TSIA2, or ASVAB style;
- explicitly aligned to a real domain for that framework;
- crosswalk-valid for its TEKS;
- transferring a TEKS that is taught/reviewed elsewhere in the same assignment.

The following do **not** satisfy the requirement:

- putting `SAT` or `ACT` in the prompt;
- a legacy `ccmr: true` flag;
- an informational TEKS crosswalk alone;
- a valid exam domain that is unrelated to the question's TEKS;
- an exam-style question about a TEKS not taught/reviewed in that assignment.

Short Warm-Ups/DOLs of three or fewer questions remain exempt. The current rolling Honors mix target remains approximately **75% core / 10% prerequisite / 15% CCMR**. For a normal full Practice section, the outside-AI contract recommends about one authentic CCMR item in 5–8 Practice questions or one to two in 9–12.

MathMaster's deterministic Honors depth extension still strengthens modeling, representations, justification, and DOK, but it is no longer allowed to masquerade as CCMR practice.

## Outside-AI / assignment JSON contract

`src/platform/contract/authoringContract.js` now tells outside AIs to author authentic Honors CCMR Practice and supplies the TEKS → exam-domain crosswalk. Partial mappings include the allowed overlap.

Direct V5 metadata follows this pattern:

```json
{
  "standard": "A.2B",
  "activityRole": "practice",
  "alignments": [
    { "framework": "teks", "code": "A.2B", "role": "primary", "evidenceLevel": "assessed" },
    { "framework": "digitalSAT", "domainId": "algebra", "role": "primary", "evidenceMode": "direct" }
  ],
  "assessmentContext": { "framework": "digitalSAT", "examStyle": true }
}
```

The V5 compiler preserves this metadata. The alignment validator now rejects a direct exam claim with no explicit domain alignment or a domain that the TEKS does not actually map to.

## Student-experience defect found during QA

The broad UI/content pass caught one Algebra II generator family whose analysis label said `domain` while its response kind was `value`. That could route the student to the wrong response keypad. The A2.4C square-root transformation family now asks for the **x-coordinate of the endpoint**, matching the `value` response kind, and its family version was incremented.

Updated copies:

- `functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json`
- `seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json`
- `drafts/algebra2.json`

## Validation completed

- **5,150 / 5,150** generator records pass the stricter alignment-metadata audit.
- Focused Path/bank/security/CCMR/UI regression: **171 / 171 passed**.
- Student UI/Path regression group: **108 / 108 passed**.
- Honors CCMR V5 compile/validation tests: **3 / 3 passed**.
- Algebra II analysis-kind + bank quality follow-up: **43 / 43 passed**.
- Full `tests/platform/*.test.mjs` discovery: **1,107 / 1,143 passed**. The remaining **36** failures are all environment dependency imports in this extracted ZIP: **35 missing `mathjs`** and **1 missing `firebase`**. No additional product assertion failure remained after the A2.4C fix.

This environment could not retrieve npm packages from the registry, so a Vite browser build could not be launched here. The source-level, compiler, seed, security, routing, authoring, and student-experience tests above are the completed validation for this handoff.

## Main source files changed

- `src/components/common/StandardBadge.jsx`
- `src/platform/student/questionAlignmentInfo.js`
- `src/QuestionEngine.jsx`
- `src/components/student/PathSessionPlayer.jsx`
- `src/tools/shared/ToolShell.jsx`
- `src/components/assessment/SecureExamQuestionPlayer.jsx`
- `src/platform/rigor/courseRigor.js`
- `src/components/teacher/LessonPreflightModal.jsx`
- `src/App.jsx`
- `src/platform/contract/authoringContract.js`
- `src/platform/contract/alignments.js`
- `src/platform/ccmr/assessmentCrosswalk.js`

The full platform ZIP already has these files in the correct locations; manual replacement is not necessary when using that ZIP.
