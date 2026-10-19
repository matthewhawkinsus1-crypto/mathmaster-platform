# DOL #2 validation

Verified on 2026-10-05 against main commit `4868312ba2fbc105ba7a5084d279f01294033b7f`, including the merged PR #443 assessment lifecycle update.

## Import repair

The original PR #439 checks validated content and schema but missed the complete teacher import/save path. The original export used uppercase `TEKS` and omitted the portable canonical-contract marker. Import attempted to recompile renderer contracts as authoring intent; full preflight also rejected eight alignments. The representation audit counted nested graph/table stimuli as symbolic even though students could render them.

The generator and export now emit valid assessed primary TEKS alignments and the canonical portable marker. The full import, preflight, modal readiness, and persisted test-cycle contract pass. The shared client/server representation catalog recognizes nested graphs and tables. Secure bank content and question mathematics are unchanged.

| Check | Result |
| --- | --- |
| `npm run test:platform`, using Node 22 | 8,859 passed, 0 failed |
| `npm run test:authoring-v5`, using Node 22 | 686 passed, 0 failed |
| `npm run test:rules` | Passed; existing legacy checks and 150 rules tests |
| `npm run lint` | Passed; existing repository warnings remain |
| `npm run build` | Passed |
| `npm run build:firebase` | Passed; build manifest generated |
| DOL #2 tests plus client/server catalog parity | 27 passed, 0 failed; includes 23 DOL #2 tests |
| Existing assessment certification and lifecycle security suites with Firestore emulator | 56 passed, 0 failed |
| One-off corrected JSON smoke test with real callable execution and Firestore emulator | All five checks passed |
| `git diff --check` | Passed |

The new import regression tests cover the actual parser, complete teacher preflight for 35 students, Save/Create readiness, persisted external-assessment contract, every review variant's assessed alignments, and the rendered teacher representation audit. They failed against the original export and catalog before the fixes. A null-input regression was also demonstrated failing and then passing after restoration of null-safe classification.

The corrected file passes server `preflightTestCycleCandidate`, and its App-style persisted payload stores successfully in Firestore in the emulator. Real callables create sessions only for original scores below 70; require participation and exact 80% review mastery; issue untimed, answer-stripped questions; preserve the same question on resume; hold scores until teacher release; preserve the original grade when retest performance is lower; and honor the teacher review waiver. The one-off smoke test supplies canonical review credit directly in the emulator; native review grading is covered by the existing content/policy tests.

Existing content tests independently check all 832 secure variants, private grading, public-payload answer stripping, native review grading, assignment size, class capacity, and stable 35-student forms. Policy tests cover eligibility, forged client credit, replacement-grade precision, release, and calculator resume.

Independent review verified actual student rendering: four tasks contain graphs, and a fifth contains a table; mixed graph/table panels and the function-classification panels render. The teacher audit now reports five visual tasks. Seven legitimate binary-choice advisory notes remain; there are zero blocking preflight errors and the modal permits Save/Create.

## Release status and limits

No production data was written and this follow-up branch has not been deployed. Authenticated production teacher/student end-to-end testing and browser pixel QA were not performed. Tests use the declared Node 22 Functions runtime. Confirm the deployed flow described in `README.md` before assigning student sessions. The corrected JSON clears the import/save blockers on the PR #443 platform; the frontend representation-audit correction requires deployment of this follow-up change.
