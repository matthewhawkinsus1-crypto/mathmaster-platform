# DOL #2 validation

Verified against base commit `96d10114f7672323973835eca3f5f8e4e3ff785d` on 2026-10-05.

| Check | Result |
| --- | --- |
| `npm run test:platform`, using Node 22 | 8,720 passed, 0 failed |
| `npm run test:authoring-v5`, using Node 22 | 686 passed, 0 failed |
| `npm run test:rules` | Passed; existing legacy checks and 146 rules tests |
| `npm run lint` | Passed; repository warnings remain |
| `npm run build` | Passed |
| `npm run build:firebase` | Passed; build manifest generated |
| `node --test tests/platform/districtDOL2*.test.mjs` | 18 passed, 0 failed after restoring the rendering mutation |
| `git diff --check` | Passed |

The content tests independently check the mathematics and private grading for all 832 secure variants, public-payload answer stripping, native review grading, assignment size, class capacity, stable 35-student forms, and secure preflight. Policy tests cover original-score validation, below-70 eligibility, participation and exact 80% mastery, forged client credit, score release, replacement-grade precision, and Firestore-safe calculator draft/resume.

The React rendering test verifies that the actual renderer includes text-only scenarios, the recursive rule, rental durations, and all three function-classification panels. Mutation checks confirmed that removing note rendering fails that test and removing the server-grading requirement fails the forged-review-submission test. Both changes were restored and their tests passed again.

The checkout's default Node 24 previously produced two baseline failures in the unrelated failure-explainer CLI tests. The complete final suite passes on Node 22, the declared Functions runtime; no changes were made to those CLI tests.

## Limits and release status

No production data was written. The assignment has not been imported into a live class, and the frontend/Functions have not been deployed. Firebase authentication is unavailable in this execution environment. Browser pixel QA and a production teacher/student end-to-end run were not performed; the available browser binary could not be installed. Run the authenticated setup and smoke test described in `README.md` before student use.
