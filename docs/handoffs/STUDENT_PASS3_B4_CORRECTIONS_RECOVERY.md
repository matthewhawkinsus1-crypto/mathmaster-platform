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

`maximumAttempts` came from the Practice policy (3) while the first graded answer closes the item. Now
`recoveryPracticeMaximumAttempts` (`src/platform/recovery/recoveryPracticeAttempts.js`) gives the engine **1** unless
the item has step work: the step workspace types (`stepAlgebra`, `stepAlgebra2`, `algebra`, a workspace `literal`) or
any item that has already recorded a step (a registry tool's algebra mode). Step bookkeeping (`recordQuestionStep`)
always keeps the Practice policy's count, as before. The header now reads "Show what you know. One answer per
practice question. Each fresh question counts once." Only those lines of `SectionRecoveryRunner.jsx` changed (the hint
notice and meter rule there belong to another session).

Proof: `recoveryPracticeAttempts`; `sectionRecovery` (the practice step-bookkeeping contract rewritten, below).

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

- `sectionRecovery`, "the Recovery runner requires the pinned question…": pinned
  `recordQuestionStep({ …, maximumAttempts })` in Practice. The behaviour — rejected steps spend tries with the
  Practice policy's limits — holds; it now reads `maximumAttempts: stepMaximumAttempts` and asserts that
  `stepMaximumAttempts` is the Practice policy's resolution. Mutation-checked.
- `tests/browser/testCycleLifecycleQa.mjs` now answers the reflection on the first skill (checks 2–3 options, a frame
  with a blank and no number, the plan line) and skips it on the others.

## Mutation checks

Every new assertion was broken once against the code: HELP-19 5/5, HELP-13 (a) 4/4, (b) 14 (four first survived — two
were dead guards, removed; two got biting cases), (c) 15 (one survivor, given a case). Each now goes red.

## Deploying (not done)

```bash
node scripts/release-firebase.mjs --since 37ec6ce   # the plan for this branch alone
node scripts/release-firebase.mjs --execute         # deploy (asks for the project id)
```

Cloud Functions: `getStudentTestCycle` (the student plan now carries the code) and
`submitTestCycleCorrectionResponse` (the diagnosis). `functions/shared/pathSolutionSupport.mjs` and
`misconceptionClassifiers.mjs` also changed (an optional parameter; an added `export`) — behaviour for every other
caller is unchanged, but the planner will list the functions that load them; ship what it lists. No Firestore rules
change. Hosting: the corrections screen and the Recovery runner. Never a raw `firebase deploy --only hosting…`.
