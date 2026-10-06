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
  Problem Understanding scaffold switched off. A tool may also declare a
  `secureTransform`: Function Investigation's removes the x from point cards
  that locate a feature (vertex, intercept, zero, maximum, a point placed by
  the axis), so a card does not state where the feature is — except a card an
  inverse reflection or analysis request names, whose x the reflected point is
  derived from. Nothing else changes: across the bank a secure Function
  Investigation item differs from practice only in those x values. Where the
  payload itself would locate the answer — a spec carrying the vertex an item
  asks for, beside an equation not shown in vertex form — the tool's
  `secureExposure` refuses the item for a secure Test and Retest instead
  (certification, below). `runtimeMode` travels on the payload.
- **`gradeItem(privateGrading, payload)`** — a tool item is graded by its Path
  Tool Contract grader (the one My Math Path and Live Challenge use) on the
  student's raw construction, bounded and stripped of any verdict the browser
  attached (`toolResponseContract.boundToolWork`). A field item is graded by
  the field grader exactly as before. Work that is not shaped like an answer
  (`rejected`) is refused before anything is recorded — an interface problem,
  not a wrong answer — and whether work is refused depends on the work alone,
  never on the key (a refusal that read the key would tell the student the
  answer). Grading never throws: a grader that fails on work it was never
  meant to see refuses it, so every way of closing a session (submit, the
  timer, the proctor's force-submit) always completes.
- **Storage.** Firestore cannot hold an array inside an array; a Rich Tool
  item's private definition and public tool config often do (data points,
  mapping arrows). `secureItemStorage.js` stores such a field as a canonical
  JSON string and decodes it where it is read — ONLY a field that nests
  arrays, so every other item is stored exactly as before and an older
  function instance (a deploy window, a rollback) reads what it always could.
  An encoded `privateGrading` leaves a stand-in in its place
  (`{ pathToolId: '__stored_as_json__', fields: [null] }`) that a grader
  without the codec refuses — the Path grader has no tool by that id and the
  field grader throws on it — so an older instance never scores the item 0.
  Raw work and workspace drafts are stored as JSON strings too. My Math Path
  stores its open question through the same codec.

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
actually generates — four random draws and one instance of every variant,
because issue time picks the variant ranked for the target and a generator
can change the tool between variants.
A tool may also declare `secureExposure(question)`: a reason this one item
would state its answer in a secure mode, which refuses it there with that
reason (Function Investigation: one standard-form "find the vertex" family).
Issuance fails closed on an uncertified item; Corrections skips to the next
parallel family; preview shows the teacher the error a student would meet.

## Preflight and the blueprint

`testCyclePreflight` check 6, fed by the server's issuability gate (which now
certifies generated instances), judging the approved families coverage and
issuance draw from — a retired family a blueprint still names never blocks:

- `✓ All 18 secure questions can render using their required MathMaster tools`
- `TEST_CYCLE_TOOL_NOT_CERTIFIED: Target A.5C contains a Transformations Lab family (…) that has not been certified for Secure Test, Secure Retest or Corrections mode: …`
- `TEST_CYCLE_TOOL_REQUIREMENT_MISMATCH: Target A.3C requires Graphing, but family F renders with response fields.`
- warnings: a target whose families mix tools (set the target's tool to make it
  part of equivalence); technology on a no-calculator Test; a mapping diagram
  that asks for the domain/range it shows as nodes; a Step Algebra item, whose
  workspace refuses a non-equivalent rewrite (so it measures choosing and
  completing the moves, not error-free arithmetic).

`preflight.secureRendering[]` is the per-target contract (standard, DOK,
difficulty, representation, required tool, the tools families render with,
certified modes, devices), shown in the teacher's results panel.

A target's `toolId` is part of `blueprintEquivalenceSignature`, and preflight
holds every family of a target that names a tool to that tool
(`TOOL_REQUIREMENT_MISMATCH`); `retestRigorIsPreserved` reports `tool_changed`
for a retest blueprint that drops it. A target that names no tool may mix
families on different tools (preflight warns), so the tool is kept one level
down as well: the student's Test responses record the tool they answered with
(`pathToolId`, or response fields; a response recorded before responses
carried it says nothing), the performance profile carries it per target, and
the Retest's family choice and Corrections' practice families take a family
on that tool first — a missed graphing skill is retested and corrected on the
graphing tool wherever the target has one. The Retest renames its targets
(`targeted-A.2G`), so `retestToolPreferences` keys the preference by each
Retest target's `sourceTargetId`. Never at the cost of the item itself: the
Retest takes an unseen family on the tool, then a seen one only if it draws
fresh parameters (`parameterGenerator`), then its ordinary tiers.
Corrections order their families with `orderCorrectionFamilies`: approved
families only, the Test tool's first, each list rotating per item.
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
- `ToolRuntimeContext` carries two different "no verdict" facts apart:
  `showImmediateFeedback` is false where the tool cannot judge (server
  grading: no key in its payload) or the activity withholds verdicts;
  `verdictsWithheld` is the activity's policy alone. A tool that judges from
  the student's own work — Step Algebra checking a move against the equation
  it was applied to — reads `verdictsWithheld`, so Corrections and practice
  keep its move coaching and a secure Test does not show it.
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
  (`handleToolWork` → `onResponseStateChange`) to a host that asks for it
  (`serverGrading.publishToolWork`, the secure runtime), so a half-built graph
  autosaves; Live Challenge, which submits what it is given at the buzzer, is
  never sent it.
- Raw work is sent when it is the student's (`toolWorkGate.js`): a tool's
  first report is its mounted state — a default, the prompt's own equation,
  or work restored on this device — and the input mark is taken there, after
  the lazy engine and tool have loaded; a later report that follows the
  student's input is their work. Work that differs from the server's copy (a
  reload that restored newer work from this device) is sent without waiting,
  and a reload resends the answer together with the tool drafts it restored —
  a save replaces the server's draft whole.
- Finalizing (student submit or time) records an autosaved construction and
  grades it — when it is an answer (`payloadHasWork`); a half-built one (a
  single endpoint, no direction) records nothing, like a blank. Recording an
  item removes its device drafts; finishing the Test removes the session's,
  and again once the finished view is up, after the tool's own unmount writes.
  Each clear also drops the tools' in-memory copy (`forgetToolDraftFamily`),
  which would otherwise write the cleared work straight back.

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
