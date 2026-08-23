# MathMaster Student Journey UI QA — 2026-08-21

This pass starts from `MathMaster_Platform_UI_Standards_Honors_CCMR_2026-08-21.zip` and tests the five student journeys requested after the generative Path/CCMR build.

## Five journeys and the resulting behavior

### 1. Regular assignment
- One clickable TEKS control is shown with the question.
- A course question can show a compact `CCMR connection` chip without pretending to be an exam-style item.
- Opening the control explains the TEKS in student-facing language and shows valid SAT/ACT/TSIA2/ASVAB connections, including partial-overlap wording where applicable.

### 2. Honors assignment with CCMR Practice
- A genuinely authored assessment-style Practice question is marked in assignment navigation (for example, `Digital SAT practice`).
- A keyword such as “SAT” or a legacy `ccmr: true` flag does not create the label.
- The active question shows the TEKS plus the authored assessment/domain relationship.

### 3. Ordinary My Math Path
- The Path header owns the single standards control so interactive tools do not duplicate it.
- Course questions remain course questions even when their TEKS crosswalks to CCMR assessments.

### 4. CCMR-specific My Math Path
- Direct exam-format questions show the selected framework and the actual authored assessment domain.
- If adaptive routing must temporarily descend to a prerequisite that has no item in that assessment framework, the student receives a clearly labelled `Foundation bridge` course question rather than an error or a falsely labelled exam question.
- Direct CCMR Path evidence now feeds the CCMR readiness model. A course foundation bridge remains crosswalk evidence and cannot masquerade as direct SAT/ACT/TSIA2/ASVAB performance.

### 5. Secure mock assessment
- TEKS, family slugs, DOK, assessment domain, and other instructional topic clues are not sent in the public question payload while the student is testing.
- Math is rendered with MathText/MathDisplay rather than exposed as raw `$...$`/LaTeX.
- Tables and other Path stimuli render inside secure exam questions.
- Numeric student-produced responses use a text field with numeric-friendly input mode, so valid fractions such as `3/4` remain typeable.
- There is no dashboard exit button while an exam is live; the student can return after a terminal state.
- Secure exams now issue from the same verified generator-backed Digital SAT, ACT, TSIA2, and ASVAB banks used by CCMR Path, rather than depending on the unseeded legacy `examQuestionBank`.
- Exam domains are balanced from the published simulation policy (for example SAT approximately 35/35/15/15; ASVAB 15 Arithmetic Reasoning + 15 Mathematics Knowledge in the 30-question simulation).
- After the teacher releases feedback, the student can open a review showing correctness, their response, the original sanitized prompt, and a clickable TEKS/CCMR standards explanation. Review uses the actual authored assessment domain when a TEKS maps to more than one domain.
- Review never releases expected-answer fields, accepted-answer lists, private grading definitions, or generator parameters.

## Files with product changes

- `functions/index.js`
- `functions/lib/mathPath.js`
- `functions/lib/secureExam.js`
- `src/App.jsx`
- `src/QuestionEngine.jsx`
- `src/components/assessment/SecureExamContainer.jsx`
- `src/components/assessment/SecureExamQuestionPlayer.jsx`
- `src/components/assessment/SecureExamReview.jsx` (new)
- `src/components/assessment/StudentSecureExamDashboard.jsx`
- `src/components/common/StandardBadge.jsx`
- `src/components/student/MyMathPathApp.jsx`
- `src/components/student/PathSessionPlayer.jsx`
- `src/platform/ccmr/assessmentEvidence.js`
- `src/platform/ccmr/studentAssessmentContext.js`
- `src/platform/student/questionAlignmentInfo.js`
- `src/services/secureExamService.js`

Regression tests added/updated:
- `tests/platform/ccmrEvidenceEvents.test.mjs`
- `tests/platform/secureExamGeneratorPool.test.mjs`
- `tests/platform/secureExamReview.test.mjs`
- `tests/platform/studentJourneyUi.test.mjs`
- `tests/platform/studentQuestionAlignment.test.mjs`

## Validation

Focused student/Path/security regression suite: **110/110 passing**.

Whole `tests/platform/*.test.mjs` sweep: **1,124 passed / 1,160 total**. The remaining **36** files could not start because this extracted project does not have its npm dependencies installed:
- 35: `mathjs` unavailable
- 1: `firebase` unavailable

There were no additional assertion failures among the tests that could execute.

A final `npm ci` attempt timed out in this environment, so this pass does **not** claim a live Vite/Chromium click-through. The code-level student journeys, secure payload boundaries, generator pools, routing, evidence, and UI ownership contracts were tested. The next deployment check should be a visual browser pass in the normal repository/deployment environment where dependencies are available.

## Deployment

Use the complete ZIP as the new working copy. Because both client UI and Cloud Functions changed, deploy **both Web and Functions** from the same version.

No new Firestore client read rule is required for released secure-exam review; review is delivered through an authenticated callable function.
