> Investigator report for [student-experience-pass-3.md](../student-experience-pass-3.md): Help and self-correction (HELP findings and coverage matrix).
> Read-only review of main at `25250b4` on 2026-10-16; rows were spot-checked before they went into the report.

# MathMaster student audit: assistance, self-learning and self-correction

Slice: what helps a student who is stuck or wrong, and what lets them learn from a mistake on their own.
Out of scope: My Math Path (and Path-only code), teacher screens except where they decide what a student sees.
Repo state audited: `claude/modest-pasteur-xzagn7` at `25250b4` (clean tree). Read-only; nothing in the repo was changed.

## How this was checked

1. Read the support stack end to end: `src/platform/supports/**`, `QuestionEngine.jsx` wiring, `SolutionReview*.jsx`,
   `GuidedClassworkCoach.jsx`, `guidedNotes.js`, `ReferenceInfoCard.jsx`, the language stack (`src/platform/language/**`,
   Support tools tray), Recovery (`SectionRecovery*`, `src/platform/recovery/**`, `functions/shared/*recovery*`,
   `practiceMastery.mjs`), Test Cycle corrections, Review My Work, graph self-check, help requests (student and teacher side).
2. Ran the real support functions in Node against **every real lesson in the repo**: the 11 teacher import files in
   `teacher-import-jsons/**`, the 5 lessons in `docs/assignments/`, and `SAMPLE_AUTHORING_INTENT_V5.json`, compiled through
   the production compiler (`compileAuthoringIntentV5`). That is **310 compiled questions; 265 in Warm-Up/Classwork/Practice**
   (where help is allowed). The legacy solution renderer (`SolutionReview.jsx`) was bundled with rolldown (DOM libraries
   stubbed) so `legacySolutionReviewContent` could be evaluated too. Caveat: the 9 Question Family slots are measured at
   template level, not per rendered instance.
   Probe scripts and outputs (outside the repo):
   `(session scratchpad, not committed) probes/`
   (`coverage-probe.mjs`, `matrix-probe.mjs` → `matrix-output.md`, `miss-sim.mjs`, `translate-probe.mjs`,
   `classifier-probe.mjs`, `hintdrop-probe.mjs`, `personalized-probe2.mjs`, `choice-probe.mjs`, `guided-probe.mjs`,
   `compile-probe.mjs`, `classic-probe.mjs`).
3. Cross-checked prior work: `docs/handoffs/STUDENT_PUSH_A_FEEDBACK.md`, `_K_GRADING`, `_M_RECOVERY_DRAFTS`,
   `_O_TESTPREP_SOLUTIONS`, `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md` §12.11, `docs/qa/algebra1-m2t2-student-walkthrough.md`,
   `docs/qa/algebra2-matrices-student-walkthrough.md`. Each finding says whether it is NEW or already listed.

---

## 1. What a student actually sees after a wrong answer

### 1a. The most common real item: a teacher-written multi-part question (90 of 265 practice-like items)

Simulated with the real functions on L3 "Write the equation of the line perpendicular to y = 2x + 1 through (6, 2)"
(`teacher-import-jsons/algebra1-module2-topic2/L3_…json`), student answers slope 2, b −10, y = 2x − 10 (`probes/miss-sim.mjs`):

| | What is on screen | Source |
|---|---|---|
| Before trying | 💡 Hint in the work bar (icon only on a phone). Hint 1 is already available; hints 2–3 open one per attempt. | `questionHints.js:98-107`, `QuestionEngine.jsx:2124-2136`, `MathToolMobileLayout.css:371-378` |
| Attempt 1 | "Not quite. You have 2 attempts remaining on this version." + "Focus on: Slope of the perpendicular line, Its y-intercept, b, Equation in slope-intercept form." + red borders. Specific message: **none** (probe returned `null`). Strip: "2 of 3 tries left · N% partial credit so far · last attempt: … still to fix: …" (hidden for inclusion/declutter students). | `QuestionEngine.jsx:1645-1654, 2181-2218`, `attemptFeedbackPlan.js:55-73` |
| Attempt 2 | Same, plus "A hint is ready if you want one. [Show a hint]". Inclusion students: a "Let's back up" overlay covers the work: "Before continuing, should you revise the specific parts identified in the feedback? Yes / No". | `QuestionEngine.jsx:2588-2593, 828, 2490-2501`, `backUpStep.js:42` |
| Final attempt | "That was the final allowed attempt (3 total). This response is locked. The worked solution is below." Pill "Incorrect — review below". Box "This response is closed after 3 attempts." Worked solution: "This question is closed. Compare your answer with the correct one below." then cards "Slope of the perpendicular line: -1/2 · Its y-intercept, b: 5 · Equation…: y=-1/2x+5". No steps. No "Request New Question" (the item is static). Only a sign slip (1/2 for −1/2) would add "Your answer has the right size but the opposite sign…" — and only now, when it can no longer be used. | `attemptFeedbackPlan.js:81-87`, `QuestionEngine.jsx:2387-2416, 2682-2699`, `closedQuestionReview.js:110-118`, `SolutionReview.jsx:212-214`, `genericMissChecks.js:82-85` |

If the student types one character after a miss, the whole outcome box (including any specific message and the hint offer)
disappears (`QuestionEngine.jsx:663-668`). If they leave and come back, it is gone too (`QuestionEngine.jsx:445, 621`).

### 1b. Other kinds

| Kind | Attempt 1–2 | Final |
|---|---|---|
| Choice-only multi-part (50 of 265 practice-like items) | **One try only** (`attemptPolicy.mjs:97`). No diagnosis on a choice field, ever (`missDiagnosis.js:115-121`). No hint offer (it needs attempt 2). | Answer card only; no new version. |
| Generated classic types (stepAlgebra, algebra, literal, fraction, system, graphing, numberLine) | Family hints built from the problem's own numbers, "Try a similar one", family back-up step. A misconception message only for platform Question Family *instances* whose wrong value matches one modelled error. | Family worked solution (steps) for most; numberLine / orderedPair get answer-only. |
| Registry tools (130 of 310 real items) | Tool pill ("Not yet", or a fixed rule sentence) + the platform sentence inside the tool. **No hint offer, no Read/Translate on the miss message.** A second, in-tool "Stuck? Show a hint" ladder with different rules. Classifier messages only for graphing2 (2 modes), intervalNumberLine, relationMapping, inverseCompositionLab (composition), linearTableWorkbench, dataModelingLab, systemsWorkspace inequalities. | Tool worked-solution builder (steps) for most. |
| DOL / quiz / test | Nothing beyond "recorded" until release; no hints; DOL keeps "✋ Ask". | Review after assignment-level release. |
| Recovery practice | One answer per item, though the strip says "3 of 3 tries left". Hints and "Try a similar one" offered — and silently stop the item counting toward the unlock. | "Not quite. That one still counts as practice — review it, then try a fresh question." + review. |
| Test Cycle corrections | Server message: authored, else "Not yet. Look again at what the question is asking you to find, then check each step of your work." Hint "Something to think about" from the 2nd miss, only if the bank item authored one. | Authored review only. |

---

## 2. Coverage matrix

### 2a. Real lessons (Warm-Up/Classwork/Practice, 265 items, from `probes/matrix-output.md`)

Columns: platform hint sources (authored / family / generic-only), "Try a similar one" available, worked solution with steps /
answer-only / none, Read aloud on the review (non-empty `speechText`), Guided Notes content exists, one-try choice items,
new version possible after close (personalized), platform-generic back-up step.

| Kind | n | Hints A / F / generic-only | Similar | Review steps / answer / none | Review read-aloud | Guided Notes | 1-try | New version | Generic back-up |
|---|---|---|---|---|---|---|---|---|---|
| multiAnswer | 90 | 32 / 46 / 12 | 37 | 35 / 55 / 0 | 35 | 4 | 50 | 1 | 44 |
| transformationsLab (tool) | 31 | 13 / 23 / 2 | 22 | 30 / 0 / 1 | 30 | 4 | 0 | 0 | 8 |
| graphAnalysis | 23 | 0 / 23 / 0 | 23 | 23 / 0 / 0 | 23 | 23 | 0 | 0 | 0 |
| systemsWorkspace (tool) | 23 | 0 / 3 / 20 | 3 | 23 / 0 / 0 | 23 | 0 | 0 | 0 | 20 |
| matrixLab (tool) | 21 | 21 / 0 / 0 | 0 | 21 / 0 / 0 | 21 | 6 | 0 | 0 | 21 |
| composed functionCharacteristics | 16 | 0 / 16 / 0 | 16 | 16 / 0 / 0 | 16 | 1 | 0 | 0 | 0 |
| representationBridge (tool)* | 10 | 0 / 5 / 5 | 5 | 5 / 0 / 5 | 5 | 0 | 0 | 5 | 5 |
| relationMapping (tool) | 8 | 0 / 8 / 0 | 8 | 8 / 0 / 0 | 8 | 8 | 0 | 0 | 0 |
| intervalNumberLine (tool) | 8 | 0 / 8 / 0 | 8 | 8 / 0 / 0 | 8 | 8 | 0 | 0 | 0 |
| composed figureMatch | 7 | 4 / 0 / 3 | 0 | 7 / 0 / 0 | **0** | 0 | 0 | 0 | 7 |
| composed relationshipModel | 6 | 0 / 6 / 0 | 6 | 6 / 0 / 0 | **0** | 6 | 0 | 0 | 0 |
| composed graphChoicePreview | 4 | 0 / 0 / 4 | 0 | 4 / 0 / 0 | **0** | 0 | 0 | 0 | 4 |
| graphing2 (tool) | 4 | 1 / 4 / 0 | 4 | 4 / 0 / 0 | 4 | 0 | 0 | 0 | 0 |
| inverseCompositionLab (tool) | 4 | 0 / 4 / 0 | 4 | 4 / 0 / 0 | 4 | 0 | 0 | 0 | 0 |
| representationMatch (tool) | 4 | 0 / 0 / 4 | 0 | 0 / 4 / 0 | 4 | 0 | 0 | 2 | 4 |
| composed functionGraph | 2 | 0 / 2 / 0 | 2 | 2 / 0 / 0 | 2 | 2 | 0 | 0 | 0 |
| polynomialWorkshop (tool) | 2 | 0 / 2 / 0 | 2 | 2 / 0 / 0 | 2 | 0 | 0 | 0 | 0 |
| table | 1 | 1 / 1 / 0 | 0 | 0 / 1 / 0 | 0 | 1 | 0 | 0 | 0 |
| functionGraph | 1 | 0 / 1 / 0 | 1 | 1 / 0 / 0 | 1 | 1 | 0 | 0 | 0 |
| **All** | **265** | **72 / 152 / 50** | **141** | **199 / 60 / 6** | **186** | **64** | **50** | **8** | **113** |

\* representationBridge family slots measured at template level; rendered instances may build a review.

Cross-cutting, for all 310 real items:
- **Authored `attemptFeedback`: 0 of 310.** Authored `misconceptions`: dropped by the compiler (HELP-14).
- **Specific misconception message possible while attempts remain: ≈ 32 of 310 (~10%)** — family instances (9) and the
  tool modes with a client-visible classifier (graphing2 slopeIntercept/pointSlope, intervalNumberLine, relationMapping,
  inverseCompositionLab composition). And then only when the wrong value matches one modelled error.
- **Generic diagnosis after close** (sign / swapped pair / reciprocal / unreduced fraction): numeric or pair fields only;
  never choice fields, equations, graphs or tools (`missDiagnosis.js:64-82` expectedForPart).
- **Read/Translate on the miss message:** only in the box below the question; none for registry tools (HELP-7).
- **Translate that actually returns text** on any feedback / hint / example / review string: **0** (HELP-3).
- **Help request reply to the student:** none anywhere (HELP-5).

### 2b. Classic generated types (synthetic items, `probes/classic-probe.mjs`)

| Type | Family | Hints | Similar | Back-up | Review | Review read-aloud | Guided Notes | After-close generic check |
|---|---|---|---|---|---|---|---|---|
| stepAlgebra | linearEquations | family | yes | family | family steps | yes | 2 | no (no comparable key) |
| algebra | linearEquations | family | yes | family | family steps | yes | 1 | no |
| literal | linearEquations | family | yes | family | family steps | yes | 1 | no |
| fraction | fractions | family | yes | family | family steps | yes | 0 | yes |
| system | systems | family | yes | family | family steps | yes | 0 | yes (pair) |
| graphing | linesAndSlope | family | yes | family | family steps | yes | 0 | no — and its classifier is never shown (HELP-15) |
| numberLine | pointsAndIntervals | family | yes | family | answer only | **no** | 1 | yes |
| orderedPair | pointsAndIntervals | family | **no** | family | answer only | **no** | 0 | yes (pair) |
| multiAnswer, teacher-written | none | **generic** | **no** | **generic** | answer only | **no** | 0 | numeric fields only |

### 2c. Read aloud / Translate by text surface

| Text | Read aloud | Translate |
|---|---|---|
| Prompt | Plan TTS: work-bar Read (prompt + "Information you need"). Everyone in WU/CW/PR: tray Read (prompt only) | Authored translation, or the Spanish pack's ~120 direction sentences |
| Answer choices, field labels, current stage of a composed question | no | no |
| "Information you need" / scenario | plan TTS only | no |
| "Not quite…", "Focus on…", closed-attempt sentence | no | no |
| Specific miss message | yes (box only; not in tools) | button shown, always "not available" |
| Hints, worked sibling | yes | button shown, always "not available" |
| Worked solution | only when authored/tool/family text exists (186 of 265) | button shown, always "not available" |
| Guided Notes, "Let's back up" step | no | no |
| Review My Work | no | no |

---

## 3. Findings (ranked, most impactful first)

Severity: P0 breaks learning / loses work; P1 major confusion or accessibility barrier; P2 moderate; P3 polish.
Effort: S ≤ half day, M ≤ 2 days, L > 2 days. No P0 found in this slice: nothing here loses work.

### HELP-1 — After the last miss, almost every classwork/practice item is a permanent dead end
- **Scenario.** A student misses "perpendicular line through (6, 2)" three times. The item locks at 33%. There is no "Request New Question" (the item is static), no Recovery (that exists for Warm-Up/DOL only), and "Try a similar one" has gone with the Hint panel. Until the assignment's final deadline passes ("Try it again — no credit"), nothing they do can change or practise that item.
- **Evidence.** A replacement is offered only for a personalized blueprint: `App.jsx:9438-9445`, `App.jsx:7088-7090`, `attemptPolicy.mjs:117-123`. Real lessons: **8 of 265** Warm-Up/Classwork/Practice items can generate a new version; 3 of 108 Classwork and 3 of 110 Practice (`probes/personalized-probe2.mjs`). Recovery is Warm-Up/DOL only (`recoveryStates.js:15-16`, `studentRecoveryModel.js:117`). The Hint panel and its similar example are removed on lock (`QuestionEngine.jsx:1504, 1534`). Credit is `bestPartialCredit` for good (`attemptPolicy.mjs:596-600`). No-credit retry only after the deadline (`studentResultNextStep.js:38, 115`).
- **Severity / effort.** P1 / L.
- **Recommendation.** On every closed item, offer unscored "Practise one like this" from the family sibling (it already exists for 141/265 items). Decide product-wise whether classwork/practice get a re-earn path (family-backed replacement, or Recovery-style mastery for practice).
- **Source / confidence.** NEW / high.

### HELP-2 — During attempts the feedback is generic for ~90% of real items; the useful diagnosis arrives only once it can't be used
- **Scenario.** A student types 1/2 for −1/2 twice and is told only "Not quite… Focus on: Slope". On the third miss the item locks and only then says "right size but the opposite sign".
- **Evidence.** Generic checks return null while open (`genericMissChecks.js:82-85`; `missDiagnosis.js:124`). Classifiers fire only for family instances and some tool modes (`misconceptionClassifiers.mjs:842-851`). 0 of 310 real items author `attemptFeedback`; authored `misconceptions` are dropped (HELP-14). Simulation `probes/miss-sim.mjs`: attempts 1–2 return null; attempt 3 returns the sign message.
- **Severity / effort.** P1 / M.
- **Recommendation.** Keep the no-leak rule for automatic messages, but put the diagnosis into the hint ladder as an opt-in "What might have gone wrong?" rung, recorded as help like any hint. Also warn in Pre-Flight when a practice item has no attemptFeedback.
- **Source / confidence.** NEW (the closed-only rule was a deliberate QA M1 call in PR #462; the cost to self-correction is not discussed anywhere) / high.

### HELP-3 — "Translate" beside feedback, hints, examples and solutions is a dead button for every language
- **Scenario.** A Spanish-speaking emergent bilingual student misses, taps Translate on "Check the order of your slope fraction…" and gets "A translation is not available for this text yet." The same happens on every hint and every worked solution. For the 17 other listed languages, nothing ever translates.
- **Evidence.** `SupportedText.jsx:51-66, 86-89`. Only an `es` pack exists (`translationProviders.js:76-78`). `packs/es.js` holds prompt directions only. Probe (`probes/translate-probe.mjs`): 0 of 12 platform support strings translate (es → `none/no-translation-resource`; vi → `no-language-pack`). A failure is not recorded as evidence (`SupportedText.jsx:62`), so the plan report cannot show it. The tray avoids dead buttons (`supportToolsModel.js:93-95`); this component does not.
- **Severity / effort.** P1 / M.
- **Recommendation.** The platform's own support sentences are fixed text, so add them to the Spanish pack: misconception messages, generic miss messages, generic hints, back-up steps, review intros, HintPanel copy. Pre-resolve coverage and hide Translate when it would fail. Record `unavailable`.
- **Source / confidence.** Partly prior (IEP design §12.11: "Built-in content is Spanish only"). The dead button on support text, and the missing evidence, are NEW. High.

### HELP-4 — In Recovery practice, a hint or "Try a similar one" silently stops the item counting — and can lower the meter
- **Scenario.** A student working toward "7 of your last 8" is stuck. They tap 💡 Hint, answer correctly and see "Correct! Nice work." The mastery meter does not move. The item fills one of the 8 slots as a non-success. Nothing ever said a hint would do that.
- **Evidence.** Recovery practice runs on the practice policy with hints on (`SectionRecoveryRunner.jsx:62-65, 436`). The HintPanel says only "Using one is noted with your attempt" (`HintPanel.jsx:57`). An item counts only if independent (`practiceMastery.mjs:61-67`, `sectionRecoveryService.mjs:56-62`, `sectionRecoveryActions.mjs:299`, `recoveryPolicy.mjs:34-38`). The teacher timeline then reads "Not yet" for a correct answer (`sectionRecoveryRecord.mjs:245`).
- **Severity / effort.** P1 / S.
- **Recommendation.** In Recovery practice, label the hint "Hints help you learn, but this question then won't count toward unlocking", or hold hints until after the answer. Show the meter's rule next to it.
- **Source / confidence.** NEW / high.

### HELP-5 — "Ask my teacher" is a one-way flare: no acknowledgment, no reply, gone on reload
- **Scenario.** At home at 8 pm, a student taps ✋ Ask my teacher. The screen says "Your hand is raised on your teacher's live class screen… Keep working while you wait." No teacher is watching. Nothing ever comes back. After a reload the hand is silently lowered.
- **Evidence.** The request is only presence fields (`helpRequest.js:18-27`), held in React state (`App.jsx:1793`), sent in the heartbeat (`App.jsx:4227`). The teacher sees "Hand raised" / "asked for help" with no action to answer it (`LiveClassMonitor.jsx:75, 1083`, `walkthroughMonitor.js:39, 130`). `teacherAssisted` is never set by this loop (`AttemptContext.js:6`). It is offered whatever the time of day (`App.jsx:10235-10238`). It is not offered in Recovery, corrections or post-due practice (`SectionRecoveryRunner.jsx:208-234`; it needs `!serverGrading`, `QuestionEngine.jsx:1501`).
- **Severity / effort.** P1 / M.
- **Recommendation.** A teacher "Seen / on my way" that the student sees. When no live monitor is open, say so and offer "Leave a question for my teacher" (short text + question link), answered in Review My Work.
- **Source / confidence.** NEW (PUSH_A shipped the flare by design) / high.

### HELP-6 — Read aloud reads the prompt only
- **Scenario.** A student with a read-aloud accommodation hears the prompt but not the five answer choices, the field labels ("Slope of the perpendicular line"), a composed question's current step, the Guided Notes, or the "Let's back up" question that blocks their work. A student without a plan, using the universal tray, also misses the "Information you need" scenario.
- **Evidence.** The tray speaks `prompt` (`SupportToolsTray.jsx:229-233`; prompt passed at `QuestionEngine.jsx:589-601`). The work-bar Read speaks prompt + reference statements (`QuestionEngine.jsx:380-383, 2137-2139`). The back-up overlay and Guided Notes have no read action (`QuestionEngine.jsx:2490-2501`, `GuidedClassworkCoach.jsx:55-69`). Choice buttons rely on aria-labels (`MultiAnswerGrader.jsx:230-232`).
- **Severity / effort.** P1 / M.
- **Recommendation.** One "read this question" text builder: prompt, scenario, current stage, field labels and choices (with letters). Add Read to the back-up step and Guided Notes.
- **Source / confidence.** Prompt-only was already listed (IEP design §12.11; matrices walkthrough R-6). Choices, labels, scaffold, notes, and the universal-vs-plan gap are NEW. High.

### HELP-7 — On registry tools (42% of real items), the hint offer and Read/Translate on the miss message never appear
- **Scenario.** A student on Transformations Lab misses twice. They never see "A hint is ready". The specific message has no Read button for a TTS student.
- **Evidence.** When the tool shows a verdict, the outcome moves into the tool (`QuestionEngine.jsx:1664-1674`). The box with the hint offer and `SupportedTextActions` is then skipped (`QuestionEngine.jsx:2571, 2579-2593`). `AttemptOutcome` renders text + detail only (`ToolShell.jsx:296-340`), and every non-stage `ResultPill` renders it (`ToolShell.jsx:383`).
- **Severity / effort.** P2 / S.
- **Recommendation.** Pass the hint-offer action and the read/translate actions into `AttemptOutcome`.
- **Source / confidence.** NEW / high.

### HELP-8 — Feedback vanishes at the first keystroke; inclusion students also lose "still to fix"
- **Scenario.** A student reads "Focus on: Its y-intercept, b" and starts editing. The box, the red borders and the hint offer all disappear. For an inclusion (declutter) student, nothing on screen now says which part was wrong.
- **Evidence.** Editing clears it (`QuestionEngine.jsx:663-668`); a remount does too (`445, 621`). The attempt strip, with its partial breakdown, is hidden whenever `declutter` is on (`QuestionEngine.jsx:2181, 2208-2216`), and declutter is automatic for inclusion (`studentSupport.js:106`).
- **Severity / effort.** P2 / S.
- **Recommendation.** Keep the last miss message, dimmed as "From your last try", until the next submit. Keep the "still to fix" line for declutter students.
- **Source / confidence.** NEW / high.

### HELP-9 — "Try a similar one" is buried in the Hint panel and disappears at the moment it is most useful
- **Scenario.** A student who just read a worked solution wants to try one on their own. The option is gone, and before that it was never offered after a miss.
- **Evidence.** It exists only inside the HintPanel (`HintPanel.jsx:68-70, 85-95`). After a miss the box offers only "Show a hint" (`QuestionEngine.jsx:2588-2593`). The panel is removed on close (`QuestionEngine.jsx:1504`). Available for 141 of 265 items.
- **Severity / effort.** P2 / S.
- **Recommendation.** Offer "See a similar problem worked" beside "Show a hint" after a miss, and "Try one like this (no score)" under the worked solution.
- **Source / confidence.** NEW / high.

### HELP-10 — Two hint ladders on registry tools; the in-tool one taps straight through to the answer
- **Scenario.** On Graphing 2 a student taps "Stuck? Show a hint" three times and reads "…landing on (2, 7)" (or "Plot (0, 3) and (2, 3)"), with no attempt needed. Meanwhile the work-bar 💡 says the next hint "opens after your next attempt".
- **Evidence.** `ToolShell.jsx:473-519` (tap-through, no release rule, no leak guard) versus `questionHints.js:84-90, 98-107`. `Graphing2.jsx:112-163` (final rungs state the points), 440. Authored hints are offered a third time in Work View, also tap-through (`RegisteredToolWorkView.jsx:56-65`).
- **Severity / effort.** P2 / S–M.
- **Recommendation.** One ladder per question. Feed tool hints into the platform panel so they get the release rule and the leak guard. Drop rungs that name the answer.
- **Source / confidence.** Authored hints stating answers is prior (matrices walkthrough P2-6/R-11). The dual ladder and Graphing 2's coded answer rung are NEW. High.

### HELP-11 — The worked solution is often answer-only, never shows the student's own answer, and sits in a red error box
- **Scenario.** After three misses the student reads "Slope…: -1/2 · b: 5 · Equation: y=-1/2x+5", with no reasoning and nothing tying it to their 2 / −10. A TTS student gets no Read button on it.
- **Evidence.** 60 of 265 items are answer-only (55 of them multiAnswer). 79 have no review read-aloud, because `speechText` excludes legacy content (`closedQuestionReview.js:119-122`, `SolutionReviewPanel.jsx:82-84`). The legacy multiAnswer review is `label: answer` (`SolutionReview.jsx:212-214`). Only composed workflows mark "REVIEW THIS STEP" (`SolutionReview.jsx:253-261, 448-459`). The review renders inside the red/amber expired box (`QuestionEngine.jsx:2682-2689`). The student's part responses already exist on the record (`attemptPolicy.mjs:493`).
- **Severity / effort.** P2 / M.
- **Recommendation.** Per part, "You wrote / Correct" rows, with the wrong parts first. Put legacy text into `speechText`. Use a neutral panel. Encourage an authored `solutionReview.commonError` in Pre-Flight.
- **Source / confidence.** NEW / high.

### HELP-12 — Review My Work shows the thinnest solution there is
- **Scenario.** A week later the student opens "Your answers and solutions". The step-by-step worked solution they saw in class is replaced by the bare answer or graph.
- **Evidence.** `ReviewMyWork.jsx:94` uses the legacy `SolutionReview`, or `ToolSolutionReview` without `wasCorrect` or read/translate (`ToolSolutionReview.jsx:9-10`), so correct items read "Compare each step of your work". Probe: 95 of 180 non-tool items lose their family/authored steps here.
- **Severity / effort.** P2 / S.
- **Recommendation.** Render `SolutionReviewPanel` (with outcome → `wasCorrect`, and read/translate). Add "Try one like this" on wrong rows.
- **Source / confidence.** NEW / high.

### HELP-13 — Test Cycle corrections: re-answering only; the "mistake pattern" is never named; feedback is generic
- **Scenario.** "Your answers showed a specific mistake pattern, and these questions practise exactly that." Which pattern? The student is never told. A miss returns "Not yet. Look again at what the question is asking you to find…". There is no reflection step.
- **Evidence.** `testCycleDiscovery.js:297-300`; `TestCycleCorrections.jsx:141-144, 184, 223-237`. The server uses only the bank's authored support (`functions/index.js:19384-19402`, `pathSolutionSupport.mjs:148-151, 194-205`), with no family hints or tool reviews. There is no reflection prompt anywhere in the component.
- **Severity / effort.** P2 / S (name the pattern), M (reflection).
- **Recommendation.** Show the student message for the recorded code (`MISCONCEPTION_STUDENT_MESSAGES`). Start each skill with one short reflection: pick the error from 2–3 options, then a "Help me say it" frame for the fix.
- **Source / confidence.** NEW / high.

### HELP-14 — The V5 compiler drops authored per-answer feedback (`misconceptions`)
- **Scenario.** A teacher writes "if they enter −5, say: check the sign". The student never sees it.
- **Evidence.** `copyCommon` lists `solutionReview`, `attemptFeedback`, `supportHints`, `hints`, but not `misconceptions` (`authoringIntentV5Core.js:156-160`). Probe (`compile-probe.mjs`): `misconceptions: false`, the others `true`. Consumer: `attemptFeedbackPlan.js:63-65`.
- **Severity / effort.** P2 / S.
- **Recommendation.** Add it to `copyCommon`, plus a Pre-Flight shape check.
- **Source / confidence.** NEW / high.

### HELP-15 — Classifier messages for GraphLine and RelationshipModel never reach the screen
- **Scenario.** On "Identify the slope and y-intercept of y = 2x + 5" a student swaps them (5, 2). The server records `slope-intercept-swapped`. The student sees only "Not quite".
- **Evidence.** Display grading is built without `surfaceId`/`mode` (`QuestionEngine.jsx:1086-1090`). Tool classifiers are keyed on them (`misconceptionClassifiers.mjs:842-851`, `:413`). Probe (`classifier-probe.mjs`): client `null`; with the surface supplied, the message appears.
- **Severity / effort.** P2 / S.
- **Recommendation.** Carry `surfaceId`/`mode` from the shared grading into `gradedForDisplay` for shared-graded ordinary graders.
- **Source / confidence.** NEW / high.

### HELP-16 — The hint leak guard silently drops 16% of teacher-written hints, many of them harmless
- **Scenario.** The teacher wrote "The x-intercept is where the output is 0: solve 0 = 3x − 8." The student never sees it, because "3" is the answer to another field.
- **Evidence.** `questionHints.js:84-90` filters with `hintRevealsAnswer`, numeric boundary matching (`pathSolutionSupport.mjs:81-100`). Probe (`hintdrop-probe.mjs`): 32 of 200 authored hints dropped. Others: "…multiply each input by 5/4" (answer "0"); "x − 7 moves right, x + 5 moves left" (answer "5"). There is no teacher-facing warning; `buildQuestionHints` is used only in `QuestionEngine.jsx:1495`.
- **Severity / effort.** P2 / S.
- **Recommendation.** Show dropped hints in Pre-Flight with the reason. Ignore numbers that appear in the prompt's own expressions or as coefficients.
- **Source / confidence.** NEW (prior R-11 asked for the opposite lint) / high.

### HELP-17 — Whether a hint "costs" anything is never said, and the wording differs by place
- **Scenario.** Afraid of losing points, a student avoids the hint. Hints never change the score; only "Ask" says so.
- **Evidence.** The panel says "Using one is noted with your attempt" (`HintPanel.jsx:57`) and "Asking does not change your score" (`:55`). Tools say "Recorded for your teacher" (`ToolShell.jsx:501, 510`). The graph check says "Recorded for your teacher, like a hint" (`InteractiveGraphWorkspace.jsx:1220, 1225`). Grade = status/bestPartialCredit only (`attemptPolicy.mjs:596-600`).
- **Severity / effort.** P2 / S.
- **Recommendation.** One sentence everywhere: "Hints never lower your score. Your teacher can see you used one." Add the Recovery exception (HELP-4).
- **Source / confidence.** NEW / high.

### HELP-18 — Choice-only items: one try, no hint offer, no explanation
- **Scenario.** "Are lines B and B′ perpendicular?" A wrong tap locks it. The review shows "Yes — they meet at a right angle." with no reason. One in five practice-like items works this way.
- **Evidence.** One attempt (`attemptPolicy.mjs:97`); no diagnosis for a choice (`missDiagnosis.js:115-121`); the offer needs attempt 2 (`attemptFeedbackPlan.js:76-78`). 50 of 265 items, all multiAnswer.
- **Severity / effort.** P2 / S.
- **Recommendation.** Before the single try, "This has one try — a hint is available." After it, a one-line authored rationale per option, plus a similar item.
- **Source / confidence.** NEW / high.

### HELP-19 — Recovery practice says "3 of 3 tries left" but takes one answer
- **Scenario.** The student expects two more tries. The first wrong answer closes the item.
- **Evidence.** `maximumAttempts` comes from the practice policy (`SectionRecoveryRunner.jsx:293`). Any graded answer returns `expired` / `remainingAttempts: 0` (`:324-334`). The header says only "Each fresh question counts once" (`:406`).
- **Severity / effort.** P2 / S.
- **Recommendation.** Pass 1 for non-step items and say "One answer per practice question".
- **Source / confidence.** NEW / high.

### HELP-20 — The inclusion "Let's back up" step is mostly generic, a little patronizing, and blocks the work
- **Scenario.** After two misses, the work is covered by "Before continuing, should you revise the specific parts identified in the feedback? Yes / No". "No" answers "Try the other choice." A screen reader announces "Productive struggle scaffold".
- **Evidence.** `backUpStep.js:35-42`; `QuestionEngine.jsx:828, 2490-2499`. Generic on 113 of 265 items.
- **Severity / effort.** P2 / S.
- **Recommendation.** Show it only when an authored or family step exists. Rename the region "Quick check before your next try".
- **Source / confidence.** NEW / high.

### HELP-21 — Guided Notes exist for a quarter of items, are off by default in Practice, and cannot be read aloud
- **Evidence.** `guidedNotes.js:93-146` (no multiAnswer or most tools); `App.jsx:9547-9548` (Practice `off`); probe: 64 of 265 have notes (4 of 90 multiAnswer, 0 of 23 systemsWorkspace); `GuidedClassworkCoach.jsx` has no read action.
- **Severity / effort.** P2 / M.
- **Recommendation.** Derive notes from the family hints and worked steps, turn them on in Practice, and add Read/Translate.
- **Source / confidence.** NEW / high.

### HELP-22 — "Check my points" hands over the correction
- **Scenario.** "(3, 4) — 2 units below the function". The student moves the point up 2 and learns nothing about f(3). It can be pressed without limit, it sits next to a second button, "Check Point Placements", and its text is 11–11.5px.
- **Evidence.** `graphSelfCheck.js:36-46`; `InteractiveGraphWorkspace.jsx:871-879, 1214-1236, 1248`.
- **Severity / effort.** P2 / S.
- **Recommendation.** Say "too high / too low — find f(3) and compare". Merge the two buttons. Use body-size text.
- **Source / confidence.** NEW / medium (a deliberate design, but it contradicts its own "not where to click" goal).

### HELP-23 — The generic fallback hints don't fit most of the items that get them
- **Evidence.** "Underline what the question asks…" and "…keep the two sides equal?" (`questionHints.js:63-66`) on systems, matrix and graph items. 50 of 265 items have only these, 20 of them 3×3 systemsWorkspace.
- **Severity / effort.** P3 / S.
- **Recommendation.** Fallbacks by type; point to Ask my teacher.
- **Source / confidence.** NEW / high.

### HELP-24 — Copy that misleads, or uses system language
- After a miss on a single-box item: "You may submit the same response again. No answer change is required." (`QuestionEngine.jsx:695-698, 2553-2555`).
- "on this version" (`:1650`); "This response is locked" (`attemptFeedbackPlan.js:86`); "activity feedback window" (`QuestionEngine.jsx:1967`); "Formula anchor" (`:2233`); "tries" in the strip but "attempts" in the box (`:2205` vs `:1650`); the item called closed four times (`:2205, 2414, 2648-2658, 2684`).
- "A worked solution is not available… Ask your teacher to go over it with you." — shown after Ask has been removed (`closedQuestionReview.js:111`; `QuestionEngine.jsx:1501, 1508-1510`).
- **Severity / effort.** P3 / S. **Source.** Triple-listed parts already in the matrices walkthrough; the rest NEW. High.

### HELP-25 (file only) — Dead component
`src/components/supports/MultilingualSupportOverlay.jsx` (its own 10-term Spanish glossary) is imported nowhere. Delete it so
two glossaries cannot drift. P3 / S / NEW / high.

### Also noted (not ranked)
- IEP "extra attempts" is not applied to classroom assignments. The catalog labels it "Extra attempts (My Math Path)"
  (`supportCatalog.mjs:233-235`; `attemptPolicy.mjs:86-100` reads no profile). This is honest labelling, but a case manager may
  expect it everywhere.
- Vocabulary terms are detected from the prompt only (`supportToolsModel.js:52-54`), not from hints or feedback that use
  "negative reciprocal", etc.
- A raised hand has no indicator once the Hint panel is closed (the work-bar button shows no state, `QuestionEngine.jsx:2124-2136`).
- Authored hints can paraphrase the answer past the literal guard: L3 Activity 3.1 says "line B′ goes down 3 for every 1 to
  the right" for the field "Slope of line B′ = −3" (prior: matrices P2-6).

---

## 4. The owner's questions, answered

1. **Attempt 1 / 2 / final, and is it specific enough?** See §1. For ~90% of real items, attempts 1–2 give "which parts", not
   "why". A why-message appears on the final attempt only for numeric sign/swap/reciprocal/simplify slips (HELP-2).
2. **Specific vs generic by type?** Specific during attempts: family instances and seven tool modes, ≈10% of real items.
   Generic after close: numeric/pair fields. Everything else gets "Not quite" + "Focus on". GraphLine and RelationshipModel have
   classifiers that are never shown (HELP-15).
3. **Hints on every type?** Yes, in Warm-Up/Classwork/Practice: at least two generic hints everywhere. 50 of 265 items have
   only generic hints. None on DOL/quiz/test (by design), nor on server-graded hosts other than corrections (server hint).
4. **Do students know hints exist, and the cost?** 💡 sits in the work bar (icon only on phones). The offer comes from the 2nd
   miss, but not on tools (HELP-7) and not on one-try items (HELP-18). Cost is ambiguous (HELP-17), and in Recovery practice
   there is a real, unstated cost (HELP-4).
5. **Similar problem / worked example?** Only "Try a similar one" in the Hint panel, while the item is open, for 141 of 265 items
   (HELP-9). It is not in the closed review, Review My Work, Recovery results or corrections.
6. **Solution review readable and connected?** Steps for 199 of 265; answer-only for 60; none for 6. Never shows the student's own
   answer (except composed "REVIEW THIS STEP"). Review My Work is thinner still (HELP-11, HELP-12).
7. **Redo / recover credit?** Warm-Up/DOL: Recovery, well surfaced. Classwork/Practice: a replacement only for personalized items
   (8 of 265), otherwise never. "Try it again — no credit" only after the deadline (HELP-1).
8. **Reflection in corrections?** No. Re-answering only, and the diagnosed pattern is not named (HELP-13).
9. **Ask my teacher discoverable, and does the student see a reply?** Inside the Hint panel (✋ in the work bar only on a DOL).
   No reply or acknowledgment, ever (HELP-5).
10. **Read aloud / Translate everywhere?** No (§2c; HELP-3, HELP-6).
11. **Dead ends?**
    - Static items after the last miss (HELP-1).
    - One-try choice items (HELP-18).
    - Ask at home (HELP-5).
    - Translate on every support string (HELP-3).
    - "No worked solution — ask your teacher", with no Ask control left (HELP-24).
    - "There are no new practice questions left for this Recovery" — points to a person, but there is no in-app way to reach them (`SectionRecoveryRunner.jsx:449`).
12. **Leaks, condescension, jargon?**
    - Leaks: Graphing 2 in-tool hint rungs (HELP-10); "N units below the function" (HELP-22); authored paraphrases (prior P2-6).
    - Condescension: the generic back-up step ("Try the other choice.") (HELP-20).
    - Jargon: "Productive struggle scaffold", "activity feedback window", "on this version", "Formula anchor" (HELP-20, HELP-24).

## 5. Strengths (keep these)
- One gate (`feedbackOpenForItem`, `attemptFeedbackPlan.js:33-45`) keeps every assessment clean. The leak guards on hints and siblings are real and tested.
- The question families give problem-specific hints, a worked sibling, a back-up check and a worked solution for every generated classic type and for 152 of 265 real items.
- Misconception messages are well written: they name the error as something to check, never blame the student, and never contain the answer (`misconceptionStudentMessages.mjs:21-45`).
- The hint release rule (one more per attempt) and "Try again with that hint…" copy model productive struggle. Help use never lowers a grade.
- The partial-credit breakdown and "Focus on" name parts, not answers.
- Recovery for Warm-Up/DOL is surfaced on Home, in the Assignments Center and in the header, in plain words ("can only raise your score"). Answers follow the student across devices.
- Review My Work puts the student's own answer beside the solution and shows the teacher's reason for a changed grade.
- Read aloud is math-aware (`speechText.js`) and universal in Warm-Up, Classwork and Practice. Read/Translate are wired onto feedback, hints, examples and reviews; they only need content (HELP-3) and coverage (HELP-6/7/11).

## 6. Prior-doc cross-reference
| Topic | Prior doc | This audit |
|---|---|---|
| Read aloud reads the prompt only | IEP design §12.11; matrices walkthrough R-6 | HELP-6 adds choices, labels, scaffold, notes, and the universal-vs-plan gap |
| Spanish-only built-in content | IEP design §12.11 | HELP-3 adds: every support-text Translate fails; no evidence |
| Hints state answers (authored) | matrices walkthrough P2-6 / R-11 | HELP-10 (tool-coded ladders); HELP-16 (the opposite: guard over-drops) |
| Triple-listed "what to fix" | matrices walkthrough P3 / R-10 | HELP-24 (still open) |
| Families transformations / quadratics / dataAndModels missing | PUSH_A | Resolved: all 10 families are `implemented: true` (`families/index.js:15`) |
| Hint panel pushes the tool off screen | matrices walkthrough P2-13 | not re-tested |
