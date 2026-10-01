# Adding server grading to a tool

Every grade-bearing tool, tool mode and question type makes an explicit grading
decision. This guide shows how to give a new tool (or a new mode of an existing
one) a shared grader that the browser runs for feedback and the server runs as
the authority. The reasons behind the design are in
[SERVER_GRADING_COVERAGE.md](SERVER_GRADING_COVERAGE.md).

If you add a tool to `TOOL_CATALOG`, a case to QuestionEngine's type switch, or
a type to the question-type catalog and do nothing else,
`tests/platform/serverGradingCoverageGate.test.mjs` fails. That is intended.

The reference implementation is Complex Plane Lab:
`functions/shared/serverGrading/declarations/complexPlaneLab.mjs`,
`functions/shared/serverGrading/tools/complexPlaneLab.mjs` and
`src/tools/complexPlane/ComplexPlaneLab.jsx`.

## 1. Decide, per mode, who grades it

| Choose | When |
| --- | --- |
| `SHARED` | The verdict is a pure function of the question the student saw and the work the student did. This should be almost every mode. |
| `clientGraded('…')` | The work genuinely cannot be reproduced on the server: it depends on the student's screen (zoom, pixels), on state the tool does not submit, or on a delivered question the server cannot rebuild. Write the specific reason (at least 40 characters, no TODO). It is shown in the coverage document and to Pre-Flight. |
| `nonGraded('…')` | The mode produces no academic result (a read-only review, an instructional display). |

"Hard to port" is not a blocker. If the mathematics is pure, move it.

## 2. Declare the tool

Create `functions/shared/serverGrading/declarations/<toolId>.mjs`. Declarations
are light: no grading mathematics, no `mathjs`, because the student app's main
bundle imports them.

```js
import { SHARED, clientGraded, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // The tool's WORK shape. Bump it when the shape changes (see §7).
  contractVersion: 1,
  // What the component renders for a missing or unknown mode.
  defaultMode: 'build',
  // Only when the component does not simply read `question.mode`:
  resolveMode: (question) => question.mode || 'build',
  // Optional per-question gate, for a question this grader cannot mark:
  supports: (question) => (question.target ? { supported: true } : { supported: false, reason: 'no-target' }),
  modes: {
    build: SHARED,
    sketch: clientGraded('Strokes are judged in screen space against the student\'s current zoom, so the same work can pass on one screen and fail on another.'),
  },
});
```

Add it to `TOOL_GRADING_DECLARATIONS` in `gradingManifest.mjs`. For a question
type QuestionEngine renders itself, use `STRUCTURED_TYPE_DECLARATIONS` (a
structured response, like the graph workspace) or `declarations/questionTypes.mjs`
(`declareQuestionGrader`, `declareClientGraded`, `declareNonGraded`,
`declareSubsystem` from `surfaceDeclarations.mjs`).

## 3. Put the mathematics where both sides can import it

Pure tool mathematics lives in `functions/shared/toolMath/<tool>/`. It must not
import React, the DOM, Firestore, `window`, the clock or anything under `src/`.
`mathjs` is allowed (Cloud Functions depend on the same version). If the
mathematics is in `src/tools/<tool>/<tool>Math.js` today, move it and leave the
old file as a re-export so component imports keep working:

```js
export * from '../../../functions/shared/toolMath/<tool>/<tool>Math.mjs';
```

## 4. Write the grader

Create `functions/shared/serverGrading/tools/<toolId>.mjs`:

```js
import declaration from '../declarations/<toolId>.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';

const build = (question, work) => gradedResult({
  parts: [
    { id: 'slope', label: 'Slope', isComplete: filled(work.slope), isCorrect: sameNumber(work.slope, slopeOf(question)), response: String(work.slope ?? '') },
    // …one part per thing the student is graded on
  ],
});

export default bindToolGrader(declaration, '<toolId>', { build });
```

Then add it to `TOOL_GRADERS` in `toolGraders.mjs`.

Rules a grader follows:

* **Pure.** `(question, work) → result`. Same input, same output, on every
  machine. No `Date.now()`, no randomness, no network.
* **Read the question the student saw.** The server hands the grader the
  delivered question: runtime repair applied, a Question Family instance
  rebuilt from its pin. Recompute every expected value from it. Never read a
  key the browser computed.
* **Read named fields of the work.** Do not name a work field after a verdict
  or an answer key (`isCorrect`, `score`, `checks`, `expected`, `solution`,
  `answerKey`, `acceptedAnswers`, …): `toolResponseContract.mjs`
  `NON_WORK_KEYS` strips those at every depth on both sides, so a grader that
  read one would see nothing.
* **Blank is incomplete, not a valid answer.** `Number('')` is `0`; an untouched
  select may default to a valid option. Decide explicitly and mark the part
  `isComplete: false`.
* **Parts carry the evidence.** One part per graded thing, with `id`, `label`,
  `isComplete`, `isCorrect`, and the student's `response` (bounded). Use
  `weight` and `credit` for legitimate partial credit. `gradedResult` derives
  `isCorrect`, `isComplete` and `score` from the parts; pass them explicitly
  only when the tool's real contract differs (for example all-or-nothing).
* **Hostile input is not an error.** Arrays may be short, numbers may be
  strings, fields may be missing. If you throw, `bindToolGrader` returns
  `malformed-response` and the submission keeps the bounded legacy path; it
  never crashes ingestion. Prefer returning an incomplete part.

## 5. Wire the component

The component never computes a verdict of its own. In each Check handler:

```js
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import grader from '../../../functions/shared/serverGrading/tools/<toolId>.mjs';

const work = { slope, intercept, points };          // render scope
useReportToolWork(work);                            // live work, for deadline checkpoints

const check = () => {
  const result = gradeToolCheck(grader, questionData, work);
  submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode, parts: result.parts });
};
```

* `gradeToolCheck` grades the same bounded, serialized bytes the server will
  read, so what the student sees is what the gradebook records.
* `useReportToolWork` hands the same `work` object to QuestionEngine as the
  student works, so a deadline can finalize an unsubmitted answer.
* Import only your own grader. Importing `toolGraders.mjs` or
  `serverResponseGrading.mjs` from a component pulls every tool's mathematics
  into that chunk; `tests/platform/sharedGradersStayOutOfStartupBundle.test.mjs`
  fails if the startup path reaches them.
* Do not put answer-key material in `submit` metadata. It is stripped, but it
  should never be there.

## 6. Prove browser and server agree

Add `tests/tools/<toolId>SharedGrading.test.mjs` (the coverage gate requires a
suite that imports `serverGrading/tools/<toolId>.mjs` and checks it against
`gradeServerResponse`). Cover, per mode:

* fully correct, incorrect, and partially complete work;
* blank work;
* equivalent mathematical forms the tool accepts (and ones it must reject);
* tampered work: verdict keys injected (they must change nothing), a response
  claiming another tool, a newer contract version, garbage values;
* a Question Family instance graded through its pin, and a wrong or forged pin;
* the attempt record a server-graded attempt produces (`attemptInputsFromGrading`
  into `recordQuestionAttempt`), including partial credit and attempt exhaustion.

For graphical tools assert on coordinates and constructed objects, not
screenshots. For multi-stage tools assert on a correct final state and on
meaningful invalid intermediate states.

Then mutation-check: break an expected value, the mode dispatch, and the work
normalization in turn, and confirm a test fails each time.

## 7. Changing a work shape later

A student's work can sit in an offline queue for days, so the server will see
responses in the old shape after you ship a new one.

* Prefer additive changes: a new optional field, read with a default.
* If the shape must change incompatibly, bump `contractVersion` and keep the
  grader able to read the old shape. A response that claims a **newer** version
  than the server knows is refused (`response-contract-newer-than-server`) and
  keeps the bounded legacy path, which is why the server must deploy before, or
  together with, the client.

## 8. Before you open the PR

```sh
node --test tests/platform/serverGradingCoverageGate.test.mjs \
  tests/platform/sharedGradersStayOutOfStartupBundle.test.mjs \
  tests/tools/<toolId>SharedGrading.test.mjs
node scripts/report-server-grading-coverage.mjs --write   # refresh the coverage document
```

The coverage document's "after" matrix is generated from the manifest; the gate
fails if it is stale.
