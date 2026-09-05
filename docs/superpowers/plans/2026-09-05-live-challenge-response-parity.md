# Live Challenge response parity implementation plan

## Task 1 — Lock the response contract with tests

**Files**
- Create `tests/platform/liveChallengeResponseParity.test.mjs`

Add failing tests for a pure Live Challenge readiness/classification helper:
- expression/radical field => eligible math response;
- interval field requiring infinity => eligible math response;
- valid four-choice field => eligible choice response and correct label;
- question-level choices may satisfy a choice field;
- choice field without choices => ineligible;
- choose/select instruction without choices => ineligible;
- numeric free response => eligible;
- declared Path tool => eligible tool.

Add source-wiring assertions that the student renderer imports/uses `MathInput`, renders runtime choices, and that the shared candidate predicate includes response readiness.

## Task 2 — Add shared fail-closed readiness rules

**Files**
- Modify `functions/shared/liveChallenge.mjs`

Implement `liveChallengeResponseReadiness(question)` returning:
`{ eligible, mode, label, reason }`.

The helper must use only public/presentation fields. It must prefer field-level choices over question-level choices, recognize the platform's supported math profiles, allow genuine text responses, and reject malformed/unknown response contracts.

Make `matchesQuestionStyle` return false when readiness is ineligible. `functions/index.js` already calls this predicate before Path issuability planning, so create and swap flows inherit the gate without adding a competing selection path.

## Task 3 — Restore response renderer parity

**Files**
- Modify `src/components/liveChallenge/LiveChallengeStudent.jsx`
- Reuse `src/MathInput.jsx` without duplicating keypad logic

Update the non-tool `FieldQuestion` renderer:
- choice fields: render sanitized choice id/label buttons and store the runtime id;
- math profiles: render `MathInput` with the field's `inputProfile`, `answerFormat`, `requiredSymbols`, placeholder, response hint, and Enter-to-submit behavior;
- text fields: retain a native input;
- keep the submitted shape `{ responses }` unchanged;
- never grade locally.

Render a response-mode badge and a clear invalid state. Lock/expired state must prevent edits and submission.

## Task 4 — Keep dry run and student view identical

**Files**
- Verify `src/components/liveChallenge/ChallengeDryRun.jsx`

Dry run already delegates to `ChallengeRound`; do not fork a teacher-only renderer. Ensure the new response badge/invalid state appears automatically in the rehearsal. Only add DryRun-specific code if launch controls need to react to an invalid current payload.

## Task 5 — Verify

Run/confirm through CI:
- `npm run unit`
- `npm run build`
- security workflow status

Then inspect the branch diff for answer leakage and scope. Confirm no expected/accepted/grading data was added to the public payload.

Manual regression targets in dry run:
- A2.7G radical rationalization: math keypad includes radical/fraction entry;
- A2.7D polynomial factor: actual choices render when authored as choice;
- A2.7E difference of cubes: either actual choices render or a genuine expression field gets math entry; malformed choose-without-options content is excluded;
- A2.6I rational-equation numeric response: numeric entry submits and server grading remains authoritative;
- interval question: interval profile exposes ±infinity, brackets, comma, and union.
