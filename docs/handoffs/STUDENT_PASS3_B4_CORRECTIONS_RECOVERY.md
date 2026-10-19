# Student pass 3 — Batch 4 (part): corrections that name the mistake, and one answer in Recovery

Branch `claude/pass3-b4-corrections-recovery`, from `claude/modest-pasteur-xzagn7` at `37ec6ce` (Batches 1 and 2,
[STUDENT_PASS3_BATCH1_2.md](STUDENT_PASS3_BATCH1_2.md)). Findings: [03-help-and-self-correction.md](../qa/student-experience-pass-3/03-help-and-self-correction.md)
HELP-13 and HELP-19 (the detail file's numbering; the report's summary table calls the Recovery item part of HELP-20).
Nothing here re-grades, writes to production or deploys.

## HELP-13 — Test Cycle Corrections

| Part | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| (a) name the pattern | "Your answers showed a specific mistake pattern, and these questions practise exactly that." Which one was never said. | `studentVisibleCorrectionPlan` (functions/index.js, read by `getStudentTestCycle`) now carries the target's canonical code (`misconception`, only for a `misconception` diagnosis). `correctionTargetMistakePattern` (`src/platform/student/testCycleDiscovery.js`) turns it into its student message (`misconceptionStudentMessages.mjs`); the header says "showed the mistake named below" and shows it under **The mistake to watch for**. A standard diagnosis, or a legacy free-text code with no message, names nothing and keeps the old sentence. | `correctionsNameTheMistake` (a), incl. a plan built from real server provenance (`buildMisconceptionEvidence`) through `buildCorrectionPlan` to the screen text |
| (b) a specific miss message | Every miss: "Not yet. Look again at what the question is asking you to find…" | `functions/shared/correctionMissDiagnosis.mjs`: after grading, the callable reads the same server-held definition and the bounded raw work and names a registry code where the work pins one down — `system`: the point with x and y exchanged → *ordered-pair-reversed*; `intervalNumberLine`: the key's endpoints with an endpoint wrongly included/excluded, or the key's ray reversed → *endpoint-inclusion-error* / *inequality-direction-reversed* (the classifier's own `intervalMistake`, now exported). `buildAttemptSupportPayload` (pathSolutionSupport.mjs) takes an optional `diagnosis`: the item's message for that answer first, then the diagnosis, then authored per-attempt feedback, then the generic line — the order `missFeedback` uses on assignments. On the last miss the diagnosis comes before "That is the last attempt…". The text is fixed (no item value can reach it); nothing is stored or graded; the worked review still waits for the item to close. Path callers pass no diagnosis and are unchanged. | `correctionsNameTheMistake` (b): real `buildIssuePlan` → `storableItem` → `gradeIssuedItem` → diagnosis, near-misses that name nothing, precedence, wiring |
| (c) reflection | Re-answering only. | Each skill starts with **Before you start: what went wrong?** — pick one of 2–3 options (the recorded pattern first only when one is named; otherwise misread / slip in a step / not sure how to start), then an optional "How will you fix it?" with **💬 Help me say it**, which shows a frame with a blank (English, Spanish beneath) and starts the sentence with it. **Start practising** or **Skip for now**; the question loads behind it. A skill already under way is not asked. "Your plan: …" stays above the question. `src/platform/student/correctionReflection.js`, `TestCycleCorrections.jsx`. | `correctionsReflection` (model; the real screen rendered through Vite SSR) |

**Where the reflection is kept: on this device only.** Every corrections record (`testCycleCorrectionPlans`,
`testCycleRecords`) is `allow read, write: if false`; a student writes none of them, so there is no existing record to
add it to. The pick (and "done") is in localStorage under a key carrying the plan id (which names the student), so
another student on the same Chromebook is asked their own; the sentence is in sessionStorage only and ends with the
tab. No rules change, no new collection, nothing sent. **Decision for you:** to keep it server-side, the smallest
path is to carry it on the existing `submitTestCycleCorrectionResponse` write into the (still server-only) plan
document — no rules change — plus a teacher view if teachers should read it.

**Note on (a) in production today.** The plan names a pattern only from trusted server findings on the Test's
responses (`misconceptionEvidence`). The secure exam grading does not write those yet (`functions/lib/testCycle.js`
reads them; nothing sets them), so every live plan is `diagnosis: 'standard'` and (a) shows nothing until secure
grading classifies — that is in the secure exam code another session owns. (b) and (c) apply now.

**(b) coverage.** Diagnosed on `system` and `intervalNumberLine` items only. Plain field items, `multiAnswer`, and the
other Path tools keep their authored feedback or the generic line: their Path shapes do not match the platform
classifiers' inputs, and an adapter that mis-maps would name the wrong error.

## HELP-19 — Recovery practice: one answer

`maximumAttempts` came from the Practice policy (3) while the first graded answer closes the item. Now the engine is
told **1** (`RECOVERY_PRACTICE_ANSWERS`, `src/platform/recovery/recoveryPracticeAttempts.js`) for every practice item,
step items included. The header reads "Show what you know. One answer per practice question. Each fresh question
counts once." Step bookkeeping (`recordQuestionStep`) keeps the Practice policy's count, as before. Only those lines
of `SectionRecoveryRunner.jsx` changed (the hint notice and meter rule there belong to another session).

**Changed at integration.** As built, a step item (the step workspace types, a workspace `literal`, or an item that
had recorded a step) kept the Practice policy's three tries, on the premise that rejected moves spend tries. Under
decision D1 (Batch 2, already in this branch's base) no step spends a try (`stepActionCountsAttempt` is always false),
so the submitted answer is a step item's only try too, and "3 of 3 tries left" was the HELP-19 defect again. The
exception was removed; `recoveryPracticeAttempts.test.mjs` now proves the premise (every step action is free, and a
run of rejected moves leaves the record unexpired) and the runner wiring. Mutation-checked 5/5.

Proof: `recoveryPracticeAttempts`; `sectionRecovery` (the practice step-bookkeeping contract rewritten, below).

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

- `sectionRecovery`, "the Recovery runner requires the pinned question…": pinned
  `recordQuestionStep({ …, maximumAttempts })` in Practice. The behaviour — rejected steps spend tries with the
  Practice policy's limits — holds; it now reads `maximumAttempts: stepMaximumAttempts` and asserts that
  `stepMaximumAttempts` is the Practice policy's resolution. Mutation-checked.
- `testCycleServerWiring`, "a student is never handed the families or seeds…": its region ran from
  `studentVisibleCorrectionPlan` to the next export, so it took in the new server-side helper that reads
  `privateGrading` to diagnose a miss. The behaviour (the student payload carries no families, seeds or private
  grading) holds; the region is now the function itself. Mutation-checked (adding `privateGrading` or
  `practiceFamilyIds` to the payload goes red).
- `secureRichToolRuntimeWiring`, "no second field renderer": the corrections screen must not render answer
  fields itself. The reflection's radios are not answer fields, but rather than weaken the check the step lives in
  its own component (`CorrectionReflectionStep.jsx`), so the screen still renders no input.
- `tests/browser/testCycleLifecycleQa.mjs` now answers the reflection on the first skill (checks 2–3 options, a frame
  with a blank and no number, the plan line) and skips it on the others.

## Mutation checks

Every new assertion was broken once against the code: HELP-19 5/5, HELP-13 (a) 4/4, (b) 14 (four first survived — two
were dead guards, removed; two got biting cases), (c) 15 (one survivor, given a case). Each now goes red.

## Checks

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | ok |
| `npm run test:platform` | 11,378 of 11,378 (the first run had 2 failures — the two contracts rewritten above) |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail |
| `npm run lint`, `npm run build`, `npm run build:firebase` | ok (no tracked file rewritten) |
| `npm run test:rules` | ok (200 + rules script) |
| `npm run test:test-cycle-certification` | 35 pass |
| `npm run test:test-cycle-lifecycle` | 71 checks, 0 findings — incl. the reflection (2–3 choices, frame with a blank, plan line) |
| `npm run test:test-cycle-device` | 12 of 12 device/stage combinations |
| `tests/browser/familyPinContainment.mjs` (Recovery assessment/practice) | 77 checks, 0 findings |
| `tests/browser/hostAccessibility.mjs` (Recovery assessment host) | all checks passed |
| Recovery practice in Chromium (temporary harness, not committed) | non-step item: "1 of 1 try left" and "One answer per practice question." (base `37ec6ce`: "3 of 3 tries left"); step item: "3 of 3 tries left" as built, one answer after the integration change above |

## Deploying (not done)

```bash
node scripts/release-firebase.mjs --since 37ec6ce   # the plan for this branch alone
node scripts/release-firebase.mjs --execute         # deploy (asks for the project id)
```

The functions whose behaviour changes are `getStudentTestCycle` (the student plan carries the code) and
`submitTestCycleCorrectionResponse` (the diagnosis). Because `functions/index.js` and `functions/shared` changed, the
planner (`--since 37ec6ce`) ships the whole default-codebase fleet (25 groups of 8, `platformBuildInfo` last and
verified), then `functions:path-admin` (it loads the changed shared modules), then Hosting through the wrapper. Every
other caller of `pathSolutionSupport.mjs` passes no diagnosis and is unchanged; `misconceptionClassifiers.mjs` only
gained an `export`. **No Firestore rules change** and no index. Never a raw `firebase deploy --only hosting…`.
