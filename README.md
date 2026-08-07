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

## Signing in

Teachers sign in with Google (the same account used for Google Classroom) or
with an email and password. Students sign in with a school Google account, or
with their student ID and a 4–8 digit PIN they choose once using their class
join code. Roles come from Firebase custom claims written only by Cloud
Functions, and Firestore rules are keyed on them, so a student can reach their
own record and nothing else.

Read [`docs/authentication.md`](docs/authentication.md) before deploying — the
order of the steps matters, and there is a one-time bootstrap for the first
teacher account.

```bash
npm run test:rules   # asserts the Firestore rules against the emulator (needs Java)
```

## Ready-to-paste QA assignment

Use `SAMPLE_SCRATCHPAD_UNDO_MULTIPART_QA_ASSIGNMENT.json` in the teacher assignment
blueprint field. It tests numeric balance algebra, literal equations, slope-intercept
form, student-selected graph x-values, undefined inputs, rational branches, multipart
graph analysis, partial-credit fields, systems, global Undo, and the scratchpad.

See `SCRATCHPAD_MULTIPART_UNDO_ARCHITECTURE.md` for the complete design and
`VALIDATION_REPORT_SCRATCHPAD_MULTIPART_UNDO.txt` for test results.

## Google Classroom sync

See [`docs/google-classroom-multi-course-setup.md`](docs/google-classroom-multi-course-setup.md) for the complete connection and testing guide. The integration can publish one MathMaster assignment to several Classroom courses, stores a separate publication and roster mapping per course, prevents duplicate re-publishing, and routes grade passback independently to each destination.
