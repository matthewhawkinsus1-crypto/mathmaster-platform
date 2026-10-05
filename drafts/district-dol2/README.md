# Algebra I District DOL #2 review and retest

`assignment.json` is the native V5 assignment import for the platform changes in this branch. Deploy those changes before importing it; the secure bank is delivered with the Functions code, not embedded in the student assignment.

## Teacher setup

1. Import `assignment.json` using the existing assignment JSON import workflow and select the intended class/audience.
2. In the assignment's test-cycle controls, enter each eligible student's original Eduphoria score. Students must have an original score below 70. Blank scores and scores of 70 or higher are skipped. Existing sessions retain their original score.
3. Create the sessions. Students complete all seven review tasks and earn at least 80% raw review mastery before starting the secure 13-question retest. Merely opening a task does not count as an attempt.
4. Release retest feedback/scores using the existing teacher controls after testing. Before release, student scores remain held.
5. Use the recorded replacement when updating the district grade. MathMaster does not automatically write grades back to Eduphoria.

The grade record retains the original score and raw retest score. The replacement is `max(original, min(rawRetest, 70))`, evaluated before display rounding. A retest cannot lower the original grade or raise the replacement above 70.

## Content and delivery

- Seven instructional review tasks, with 48 coordinated variants per task, cover the original assessment's 13 skills.
- Thirteen parallel secure retest questions, with 64 variants per family, emphasize entered responses rather than multiple choice. Skill areas include association/causation, sequences, intercepts, domain/range, quadratic zeros and symmetry, functions, and linear regression.
- The platform pins a student's generated form for stable resume. Secure answer keys stay on the server. Review hints remain instructional; the retest uses the existing secure delivery without hints or AI help.
- Regression questions offer a data-entry regression calculator; it does not fill in the question data or answers.
- This external retest has no watermark. It does not claim to block browser/OS screenshots or photographs from a second device.

## Maintainer notes

Regenerate both files with `python scripts/content/build_district_dol2.py`. The server-only bank is `functions/seeds/secureAssessments/algebra1_district_dol2.json`; it is resolved by ID for this blueprint and is not added to the ordinary Path curriculum bank.

Deploy the frontend and affected Functions through the repository's documented release workflow. No new Firestore collection or rules changes are introduced. This branch has not been deployed or imported into a production class; complete an authenticated teacher/student smoke test before assigning it to students.

See `VALIDATION.md` for checks and remaining verification limits.
