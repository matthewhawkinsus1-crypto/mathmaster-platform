# MathMaster Platform

This release centralizes assignment attempts, deterministic personalized questions,
Practice Mode, interactive parent-function graphing, multipart graph analysis,
step-by-step balance algebra, partial credit, shared Undo, and a full-screen student
scratchpad with teacher work review.

## Start locally

```bash
npm install
npm run dev
```

Firebase configuration remains in `.env`. Before production use, configure Firebase
Authentication and Firestore rules for assignments, grades, and the new scratchpad path:

```text
grades/{studentId}/scratchpads/{assignmentId}__question_{questionIndex}
```

## Ready-to-paste QA assignment

Use `SAMPLE_SCRATCHPAD_UNDO_MULTIPART_QA_ASSIGNMENT.json` in the teacher assignment
blueprint field. It tests numeric balance algebra, literal equations, slope-intercept
form, student-selected graph x-values, undefined inputs, rational branches, multipart
graph analysis, partial-credit fields, systems, global Undo, and the scratchpad.

See `SCRATCHPAD_MULTIPART_UNDO_ARCHITECTURE.md` for the complete design and
`VALIDATION_REPORT_SCRATCHPAD_MULTIPART_UNDO.txt` for test results.
