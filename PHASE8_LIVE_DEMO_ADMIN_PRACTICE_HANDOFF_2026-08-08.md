# MathMaster Phase 8 — Live Demo, Practice-After-Deadline, and Administration

This build continues directly from `MathMaster_FULL_PLATFORM_PHASE_7A-7D_COMPLETE_2026-08-08.zip`.

## Live Demo Experience

- Synthetic demo teacher account: Avery Daniels (`avery.daniels@demo.mathmaster.local`).
- Four demo courses: Algebra I Standard/Honors and Algebra II Standard/Honors.
- Fourteen live assignment JSON definitions with five questions each.
- Seeded historical scores are derived from per-question synthetic correct/incorrect responses rather than stored as unexplained percentages.
- Every demo assignment can be opened. Expired assignments run in no-credit Practice Mode.
- `New Student (Blank)` has no prior grade/mastery history and starts with a current live assignment waiting.
- Every demo student has a live My Math Path question set. Demo path attempts are handled in client-only state and never use the production path-session service.
- Reset Demo Classroom restores the synthetic seed.
- Guided Presentation now has four steps and direct actions into the blank-student assignment, live path, and differentiation examples.

## Post-deadline Practice Mode

- Existing regular-due/late-due semantics are preserved.
- Credit remains possible through the configured final late cutoff.
- After the final cutoff (`lateDueAt`, or `dueAt` when no late cutoff exists), the assignment remains interactive as Practice Mode.
- The frozen grade remains visible.
- Practice attempts are kept only in React memory for the signed-in browser session.
- No post-cutoff practice writes are made to grade records, assignment activity, classwork/DOL grades, immutable mastery evidence, Math Path recommendations, or server scratchpads.
- Modeling-lab evaluation in post-cutoff practice is local/provisional rather than server-submitted.

## Root Administration

- Protected root identity remains `matthew.hawkins@desotoisd.org`.
- The root email always sees the Teacher View / Administration entry. This is UI discoverability only; privileged calls still require the server root claim.
- If the root token is stale, Administration opens with an authorization/deployment warning instead of silently disappearing.
- Root admin can create student account shells, choose student ID/name/class, and assign a teacher.
- Root admin can reassign/unassign students to teachers and class periods.
- Existing reset PIN, unlink Google, permanent student deletion, teacher grant/revoke/restore, and administrative audit controls remain available.
- First-time PIN setup for a pre-created student must use a class code matching the student's assigned class period.

## Validation

- 142/142 cumulative platform/tool Node tests passing.
- Production Vite build passing.
- Functions syntax checks passing.
- Firebase Functions runtime module loads after locked dependency install.
- `npm run lint` exits successfully with zero errors. Existing project warning backlog remains warning-only.
- Build retains the existing large-bundle advisory.

## Deployment

Use the full-platform replacement because this release changes frontend source and Cloud Functions. Keep production deployment secrets/.env files; they are intentionally not packaged. Deploy Functions and Hosting together. Firestore rules are included unchanged from the corrected Phase 7 security build.
