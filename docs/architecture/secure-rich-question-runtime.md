# Secure assessment + shared Rich Question Runtime + mode capability policy

A MathMaster question is the same question on Practice, Review, a secure Test,
Corrections and a secure Retest. What differs between those places is
**authority** (who issues the item, what the browser may hold, who grades it,
when the verdict is released) and **capability** (what the runtime is allowed
to do for the student). It is never a different, poorer renderer.

```
                 server (authority)                              browser (question)
  ┌──────────────────────────────────────────────┐      ┌───────────────────────────────────┐
  │ issue      approved family → instance (seed)  │      │ RichQuestionRuntime                │
  │ certify    secureToolCertification            │      │   tool item  → QuestionEngine      │
  │ public     Path Tool Contract allowlist        │ ───► │               + the real tool      │
  │            − assistance keys (secure modes)    │      │               (lazy, server-graded)│
  │            + forced assessment settings        │      │   field item → secure fields       │
  │            + runtimeMode                       │      │ policy = runtimeMode → activity    │
  │ private    grading definition, seed, plan      │      │          policy the engine enforces│
  │ grade      secureItems.gradeItem               │ ◄─── │ raw construction (+ tool drafts)   │
  │ release    teacher release / Corrections now   │      └───────────────────────────────────┘
  └──────────────────────────────────────────────┘
```

## The capability policy

`functions/shared/questionRuntimePolicy.mjs` (browser: `src/platform/assessment/questionRuntimePolicy.js`).

| Mode | Response tools | Hints | Verdict | Worked solution | Attempts | Grade impact |
| --- | --- | --- | --- | --- | --- | --- |
| `practice` | ✓ | ✓ | immediate | ✓ | policy | assignment |
| `review` | ✓ | ✓ | immediate | ✓ | policy | none |
| `secureTest` | ✓ | — | teacher release | — | 1 | recorded |
| `corrections` | ✓ | ✓ (2nd miss) | immediate | after the item closes | 3 | none |
| `secureRetest` | ✓ | — | teacher release | — | 1 | recorded |

**Category A — response capabilities** (`richTools`, `mathEntry`,
`interfaceValidation`, `responsePersistence`) are on in every mode. A graphing
question with no graph is a different question.

**Category B — assistance capabilities** (`hints`, `workedSolution`,
`solutionReveal`, `aiTutor`, `answerCheckBeforeSubmit`, `immediateFeedback`,
`autoSolve`, `questionReplacement`, `practiceEscape`, `externalResources`) are
all off in a secure mode.

An unknown or missing mode resolves to **Secure Test**, never to practice.

`engineActivityPolicyForMode(mode)` expresses a mode as the activity policy
QuestionEngine already enforces — `hintsAllowed` reaches every tool's hint panel
and self-check through `ToolRuntimeContext`; `feedback !== 'immediate'` hides
every verdict, correctness colour and solution review; `allowReplacement` is
"Request New Question". The engine needs no second set of switches.

**Interface validation is not correctness.** "Select two points", "Enter both
coordinates", "Use RREF technology first" stay on everywhere. "Correct", "Not
yet", a correctness colour, or which part is wrong is a verdict and waits for
release in a secure mode.

## The server: one place issues, strips and grades

`functions/lib/secureItems.js`, used by every secure surface — the Test and
Retest (`issueSecureExamQuestion` / `issueCourseTestQuestion`, `saveSecureExamDraft`,
`submitSecureExamResponse`, `finalizeSecureExam`), Corrections
(`issueTestCycleCorrectionQuestion`, `submitTestCycleCorrectionResponse`) and
the teacher preview (`previewTestCycleSecureItems`, `gradeTestCyclePreviewItem`).

- **`publicItem(item, { mode })`** — the Path Tool Contract's per-tool
  allowlist, then (secure modes) `stripAssistanceForMode` removes every
  Category B key and solution-path key (`hint`, `workedExample`,
  `operationTags`, `solutionDepth`, …) at any depth, then
  `applySecureToolSettings` forces assessment settings (the Step Algebra
  workspace at support level 5, which never does arithmetic for the student),
  then the word-problem `context` is re-sanitized field by field and its
  Problem Understanding scaffold switched off. `runtimeMode` travels on the
  payload.
- **`gradeItem(privateGrading, payload)`** — a tool item is graded by its Path
  Tool Contract grader (the one My Math Path and Live Challenge use) on the
  student's raw construction, bounded and stripped of any verdict the browser
  attached (`toolResponseContract.boundToolWork`). A field item is graded by
  the field grader exactly as before. Work that is not shaped like an answer
  (`rejected`) is refused before anything is recorded — an interface problem,
  not a wrong answer.
- **Storage.** Firestore cannot hold an array inside an array; a Rich Tool
  item's private definition and public tool config often do (data points,
  mapping arrows). `secureItemStorage.js` stores those two fields as canonical
  JSON strings on the session/plan and decodes them where they are read; raw
  work and workspace drafts are stored as JSON strings too.

## Certification: which tools may run securely

`functions/shared/secureToolCertification.mjs`. Each certified tool declares:
modes (secureTest / secureRetest / corrections / teacherPreview), response
shape, category, whether it requires graphing or provides calculation
technology, devices (Chromebook, iPad, phone — phone only where exercised),
secure settings to force, and caveats a teacher should read.

**Only a tool with a public/private Path Tool Contract can be certified.**
Without the per-tool allowlist the secure runtime could only send the whole
question, answer included — that is the one concrete security reason a tool is
not available on a Test. Certified today: Graphing, Function Investigation
(coordinate plane), Systems Workspace, Step Algebra, Algebra balance, Number
Line, Mapping Diagram, Data Modeling Lab, Regression Calculator, Systems
(ordered pair), structured multi-part responses. The other registry tools
(Transformations Lab, Sequence Explorer, Representation Match, …) are named
with that reason by preflight. **Certifying another tool = write its
public/private contract and add it to this table; never a branch in Test
Cycle code.**

`certifySecureItem(question, { mode })` answers for one item;
`certifySecureFamily(family, { instances })` for a family from the instances it
actually generates (a generator can change the tool between variants).
Issuance fails closed on an uncertified item; Corrections skips to the next
parallel family; preview shows the teacher the error a student would meet.

## Preflight and the blueprint

`testCyclePreflight` check 6, fed by the server's issuability gate (which now
certifies sampled instances):

- `✓ All 18 secure questions can render using their required MathMaster tools`
- `TEST_CYCLE_TOOL_NOT_CERTIFIED: Target A.5C contains a Transformations Lab family (…) that has not been certified for Secure Test, Secure Retest or Corrections mode: …`
- `TEST_CYCLE_TOOL_REQUIREMENT_MISMATCH: Target A.3C requires Graphing, but family F renders with response fields.`
- warnings: a target whose families mix tools (set the target's tool to make it
  part of equivalence); technology on a no-calculator Test; a mapping diagram
  that asks for the domain/range it shows as nodes.

`preflight.secureRendering[]` is the per-target contract (standard, DOK,
difficulty, representation, required tool, the tools families render with,
certified modes, devices), shown in the teacher's results panel.

A target's `toolId` is part of `blueprintEquivalenceSignature`, and
`retestRigorIsPreserved` reports `tool_changed`: a missed graphing skill is
retested on the graphing tool, never collapsed into a text box.
`describeFamily` reads a family's tool the way the server does (`pathToolId`,
`toolId` or `type` — the bank uses `type`).

## The browser: one runtime

`src/components/question/RichQuestionRuntime.jsx`.

- **Tool item** (`pathToolId` + `tool`) → `QuestionEngine` (lazy — a field-only
  Test never downloads it; each registry tool is its own chunk) in
  server-grading mode, with `activityPolicy = engineActivityPolicyForMode(mode)`,
  `showStandardBadge={false}`, the assessment calculator as `assessmentContext`,
  and `submitLabel="Record answer"` on a secure item (`ToolRuntimeContext`
  carries it to every certified tool's final action, so nothing called "Check"
  records the student's one answer).
- **Field item** → the secure response fields (choices as cards, every typed
  answer a text input so `3/4` is legal), unchanged.
- Corrections' hints, verdicts and worked review render under the corrections
  policy.
- On a secure item the student keeps every access accommodation and loses
  construct changes (`assessmentSupportProfile`: no modifications, no algebra
  auto-apply).

Used by `SecureExamQuestionPlayer` (now an adapter, secure modes only —
`secureShellRuntimeMode(question)`: the payload's secure mode, else Secure
Test, including while the first item is still being issued),
`TestCycleCorrections` and `TestCyclePreview` (Test, Retest and Corrections
legs).

## Work survives

- The tool persists its own state under `secureItemDraftKey({ surface: 'exam',
  sessionId, questionInstanceId })` — ordinary question draft storage, so a
  refresh, Chromebook sleep, dropped connection, proctor lock or route change
  keeps it on the device. The key deliberately does not match the ordinary
  `mathmaster:draft:v2:` format, so assignment draft sync never copies secure
  work.
- Every autosave carries the raw construction **and** the tool's own drafts;
  the server accepts drafts only inside that item's key family, bounded and
  verdict-free, and only on the open item. A reload on another device restores
  them before the engine mounts (newest per key wins).
- `QuestionEngine` publishes a registry tool's live work under server grading
  (`handleToolWork` → `onResponseStateChange`), so a half-built graph autosaves.
- Finalizing (student submit or time) records an autosaved construction and
  grades it — when it is an answer (`payloadHasWork`); a half-built one (a
  single endpoint, no direction) records nothing, like a blank. Recording an
  item removes its device drafts; finishing the Test removes the session's,
  and again once the finished view is up, after the tool's own unmount writes.

## Integrity

Rich Tools run inside `SecureExamContainer`'s shell unchanged — fullscreen,
focus/visibility, copy/paste, restricted shortcuts, the threshold lock and the
proctor unlock. One refinement: a `contextmenu` the page already suppressed (the
math editor and calculator cancel it — on a touch device a long press is how a
student places the caret) opened no menu and is not counted; any other context
menu is still cancelled and recorded. Tools in secure mode render no external
links.

## What stays exam-specific

SAT, ACT, TSIA2 and ASVAB simulations keep their item selection, domain
weights, timing, calculator regulation and answered-mean scoring. They render
through the same runtime; none of their bank items names a tool, so what a
student sees is unchanged. A simulation item that ever names a tool must be a
certified one.
