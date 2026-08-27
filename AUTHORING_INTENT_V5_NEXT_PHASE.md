# Assignment V5 — Next Build Phase

The compatibility/migration phase has been cancelled. No V4 migration layer is required.

## Next priorities

1. Make the teacher Assignment Creator a no-code V5 editor rather than a JSON-first workflow.
2. Replace remaining legacy metadata helpers with native V5 policy editors.
3. Make Preflight consume V5 sections/policies directly instead of adapting them to the older activity-view model.
4. Complete teacher-solution and answer-key PDF renderers using the same canonical questions as digital/student PDF.
5. Add interaction-contract/input-profile preflight checks so required notation is always enterable on mobile.
6. Add stronger DOK 3/4 response-structure checks for justification/comparison/explanation tasks.
7. Surface assessment-fidelity controls and audit results for CCMR items.
8. Retire `runtimeProjectionVersion: 1` only after all student, server-grading, analytics, and export readers consume V5 sections directly.
9. Add a one-click pre-production reset utility for test assignments/student evidence before the first real rollout.

## Non-goals

- Do not import or migrate V4 assignments.
- Do not preserve Bundle V3 assignment authoring.
- Do not add compatibility aliases merely to make old test fixtures pass.
- Do not duplicate content into separate digital and PDF question banks.
