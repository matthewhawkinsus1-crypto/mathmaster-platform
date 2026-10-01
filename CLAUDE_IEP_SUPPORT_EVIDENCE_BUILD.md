# MathMaster — IEP / Student Support Evidence System
## Claude Code Master Build Mission — September 30, 2026

### Mission
Build a complete, production-ready Student Support / IEP Evidence System into MathMaster in one coordinated implementation effort.

The system must do two things equally well:

1. Provide supports to students reliably and automatically where the platform can do so.
2. Create defensible, human-readable evidence of what was required, what was available, what was actually provided, what the student actually used, what the student did, and the resulting academic performance.

This is not merely a report redesign. It is a new cross-cutting subsystem spanning student support profiles, assignment delivery, individualized deadlines, telemetry, teacher actions, service/support logging, grade contribution evidence, reporting, permissions, persistence, QA, and the teacher workflow.

The immediate operational goal is that a teacher can select one student and one grading period and produce a useful administrative/parent-facing factual report without reconstructing events from memory.

### Repository and current baseline
Repository: `matthewhawkinsus1-crypto/mathmaster-platform`

Start from the latest `origin/main`. PR #400 has already been merged and redesigned the teacher workflow around an assignment hub, live/class views, DOL controls, student drawers, and repeatable grade export. This build must integrate with that architecture rather than creating another disconnected area.

Read before changing code:
- `AGENTS.md`
- `docs/TEACHER_UX_AUDIT.md`
- the assignment hub / student drawer / grade export implementation from PR #400
- existing accommodation/modification/support-profile code
- existing IEP Support Report code
- existing attendance extension/deadline code
- attempt/progress persistence and telemetry code
- Firestore rules and rule tests
- browser harness patterns used for the teacher workflow

Do not deploy production. Finish with a reviewable PR.

### Safety / privacy / evidence integrity
MathMaster contains real student data.

Never place a real student name, email, ID, IEP text, parent information, screenshot, or identifiable production data in source, tests, docs, commits, screenshots, PR descriptions, or fixtures.

Use made-up students/schools in tests and browser harnesses.

Never fabricate historical evidence. If past actions cannot be proven from stored data, report `Not recorded` / `Unknown from platform records`, not `Not provided`.

Differentiate:
- Required/configured
- Applicable
- Available to student
- Actually provided/activated
- Student accessed/used
- Teacher/provider documented
- Derived/inferred from existing system events
- Not recorded

Every reportable fact needs provenance.

### Non-negotiable conceptual boundary: accommodations vs modifications
The platform must preserve a first-class distinction between accommodations and modifications.

An accommodation changes access, presentation, timing, response mode, organization, or support while preserving the intended grade-level learning expectation.

A modification changes the academic expectation itself: content, complexity, standard, rigor, or what the student is expected to learn/demonstrate.

The platform must never silently combine these conditions.

`reduce-complexity` is a MODIFICATION and must remain visibly classified as such to teachers/reports.

A reduced number of items is context-dependent:
- if the student completes fewer representative items while the same TEKS, rigor, and expected mastery remain, record this as an accommodation/access support such as `reduced-item-count-same-rigor`;
- if reducing the work changes content coverage, rigor, or the learning expectation, record it as a modification.

Student-facing UI should not stigmatize the student with labels such as IEP or MOD. Use neutral wording such as **Support tools**. Teacher/admin evidence can show the formal classification.

### Build a versioned Student Support Profile
Create or extend the student support profile so it is a versioned, effective-dated record. Changing the profile later must not rewrite the historical instructional condition of prior work.

Support profile records should include:
- effective start/end dates
- source/document label and optional note
- inclusion/support status
- accommodations
- modifications
- service expectations where entered
- version/revision metadata
- created/updated by and timestamp
- active/inactive status

Assignments/attempts/support events must be able to reference the effective support-profile revision that governed them.

The support catalog must be extensible. Cover at minimum the supports currently needed by MathMaster workflows.

Automatable / measurable where possible:
- calculator access / computation override
- decluttered UI
- countdown hidden / no countdown
- individualized extra time, including “up to the next day”
- reduced item count while preserving rigor
- text-to-speech / read-aloud technology
- chunked assignment presentation
- reteach/resource materials
- extra time for written response
- Chromebook/word-processor response support
- highlighted/emphasized materials
- study aids/manipulatives
- supplemental aids / graph paper for multi-step math
- study sheet / preview / summary resources

Teacher/provider actions that usually require manual evidence:
- repeat/explain instructions
- directions presented in multiple ways / simplified vocabulary
- teacher check for understanding
- frequent feedback
- on-task focusing prompt/reminder
- reminder of rules/expectations
- student verbalizes steps / self-talk opportunity
- independent read-aloud/whisper opportunity where relevant
- planner/folder/teacher-signature communication support
- reteaching delivered by adult
- inclusion/provider support present

Do not assume every support applies to every math task. Store applicability at the assignment/student level where necessary.

### Automatic support application
When a student launches an assignment, the platform should apply applicable automatic supports from the effective profile without requiring the student to request them first.

Examples:
- extra-time student deadline calculated and displayed correctly
- hidden countdown while server timing still works
- declutter mode
- calculator/tool availability
- chunked delivery
- TTS control
- configured support resources
- reduced item count where this is an accommodation
- modified assignment/version where a true modification has been explicitly configured

Preserve existing classwide scheduling, teacher overrides, attendance extensions, warm-up/DOL rules, retest rules, Practice Mode, and grade logic.

Individual support deadlines must coexist cleanly with classwide teacher deadline overrides.

### Evidence event model
Implement a durable support/evidence event model with server timestamps and provenance.

At minimum support events need:
- student
- class
- assignment instance
- section/question when relevant
- support type
- classification: accommodation | modification | service/support
- event type: available | provided | activated | used | teacher-documented | provider-documented | declined/not-used where appropriate
- actor type/id when appropriate
- support-profile revision
- timestamp/start/end/duration when relevant
- source: automatic telemetry | teacher click | provider entry | existing platform event | derived
- optional concise note
- immutable audit metadata

Avoid free-form notes for facts the system can represent structurally.

### Provision vs use
Do not treat “configured” as equivalent to “provided” or “used.”

Examples:
- Calculator: configured/available may be automatic; opening or performing calculator interactions can demonstrate use.
- TTS: available is different from student activating it.
- Reteach resource: assigned/provided is different from student opening it.
- Chunking: system can show that content was delivered in defined chunks and which chunks were completed.
- Extra time: evidence is the general due date, individualized due date, teacher overrides, and submission/completion timestamps.
- Check for understanding: manual teacher/provider event unless the system has a real equivalent.
- Inclusion support: a service/support log, not student screen time.

### Teacher workflow: integrate with PR #400 assignment hub
Do not build a separate scattered compliance dashboard.

Add a **Support / Evidence** area into the assignment hub and student drawer established by PR #400.

For an assignment + student, a teacher should immediately see:
- effective support profile
- applicable accommodations
- applicable modifications
- what the platform automatically applied
- what was available
- student usage
- manual teacher/provider events
- deadlines/extensions
- engagement/attempt evidence
- performance by section/DOL
- assignment condition: Standard or Modified
- unresolved evidence gaps

Provide extremely fast one-click evidence actions for classroom use, e.g.:
- Checked understanding
- Re-explained directions
- Provided reteach
- Gave feedback
- On-task prompt
- Provided supplemental aid
- Inclusion/provider support present

A one-click action should record the timestamp immediately. Optional notes can be added after; a note must not be required for common actions.

Support events should be visible from the student drawer across assignments and from the assignment hub for all students.

### Inclusion / service logging
Create a simple service/support log suitable for documenting support presence without pretending to be the district’s official service-delivery system.

Allow authorized staff to record:
- provider/teacher
- student
- class
- date
- start/end or minutes
- support/service type
- assignment/topic
- optional note

Summarize recorded minutes by week and grading period.

If an expected service frequency is configured in the support profile (example: 100 minutes/week), show:
- configured expectation
- platform-recorded minutes
- date range
- a clear warning that MathMaster is reporting only events recorded in MathMaster and is not independently determining legal compliance.

Never infer unrecorded minutes.

### Reliable engagement telemetry
The current IEP report has scored assignments that display `0 min`, so engagement telemetry must be audited and repaired.

Implement a defensible active-engagement metric. Prefer existing reliable attempt/action timestamps where possible and add heartbeat/visibility/activity tracking if needed.

Requirements:
- server timestamps where possible
- idle cutoff
- do not count a tab left open as engaged indefinitely
- distinguish active time from elapsed assignment window
- preserve existing progress persistence
- no countdown accommodation must not disable evidence timing
- historical time should be reconstructed only where existing events support it; otherwise display `Unknown/Not recorded`

Add tests for refresh, reconnect, multiple tabs, idle periods, late work, and progress recovery.

### Assignment-instance cleanup / deduplication
The current support report shows numerous duplicated/unrelated library rows.

A student report must show the actual assignment instances assigned to the selected class/student/grading period, not every similarly titled library object.

Use stable assignment-instance identifiers.

Clearly distinguish:
- assigned/not started
- in progress
- submitted/completed
- missing/late
- excused/not applicable
- not assigned
- historical duplicate/library copy (which should normally not appear)

### Grade-impact evidence
Add a grade-impact view so a teacher can answer what MathMaster work is contributing to performance.

For each relevant assignment include where available:
- assignment title
- assigned/due/completed date
- assignment type/category
- score / points
- weight used by MathMaster/export policy
- Standard vs Modified instructional condition
- late/missing/excused status
- section scores (Warm-Up / Classwork / Practice / DOL)
- attempts
- current export status
- changed-since-export status
- grade contribution inside MathMaster’s known grade calculation

Do not claim the platform has calculated the official SIS grading-cycle average unless the platform genuinely has all required SIS categories/weights/grades.

Use wording such as “MathMaster grade contribution” when appropriate.

### Evidence quality / provenance
For every material report field, make it possible to identify whether the value is:
- directly recorded by the platform
- manually documented by staff
- derived from other stored events
- configured only
- unknown/not recorded

Do not overstate certainty.

### Student-facing Support Tools
Students should receive applicable supports without needing to diagnose their own IEP.

Where appropriate provide a neutral **Support tools** area:
- TTS
- calculator
- reteach/resource material
- chunk navigation
- supplemental aid access
- written response tools

Keep UI simple and non-stigmatizing.

If a support is automatically active, the student should not have to turn it on merely to qualify for it, though usage controls such as “Read aloud” may naturally require interaction.

### Modified work
Preserve the existing visible teacher/report distinction between Standard and MOD.

A modified assignment/attempt must record:
- which modification(s) changed the condition
- profile revision
- assignment/version
- standards/expectation metadata where available

Do not silently compare modified performance to grade-level performance as if conditions were identical.

Reports may show both, but clearly separated/labeled.

### New Student Support Evidence Report
Replace/upgrade the current IEP Support Report into a focused report generator.

Teacher chooses:
- student
- class
- grading period/date range
- optionally specific assignments

Report should have:

#### 1. Student support profile
- inclusion/support status
- effective profile dates/revision
- accommodations
- modifications
- configured service expectations
- warning for expired/out-of-range support profile

#### 2. Executive evidence summary
For the selected period:
- assignments assigned
- attempted/completed/missing
- Standard vs Modified counts
- support availability/provision/usage counts
- teacher/provider documented events
- platform-recorded inclusion/support minutes
- performance summary
- evidence gaps / `Not recorded` items

This is a factual summary, not a legal compliance verdict.

#### 3. Assignment evidence
One row/card per real assignment instance:
- score
- grade condition Standard/MOD
- dates
- individualized deadline/extension
- active engagement
- attempts
- accommodations applicable/available/provided/used
- modifications applied
- teacher/provider support events
- section scores
- DOL
- MathMaster grade contribution where available

#### 4. Support timeline
Chronological timeline of platform and human support evidence.

#### 5. Service/support summary
Recorded inclusion/provider minutes by week/grading period.

#### 6. Evidence legend
Define exactly what Available, Provided, Used, Teacher documented, Derived, and Not recorded mean.

#### 7. Report limitations
State clearly that absence of a MathMaster record is not proof a support was not provided outside the platform.

Make the report print/PDF friendly and concise. The current ten-page sparse table should be replaced by a useful summary-first report with expandable/printable detail.

Add CSV/JSON export if it is low-risk and naturally follows the report model, but the printable report is the priority.

### Historical data / immediate usefulness
We need the upgraded report to be useful immediately after deployment.

Audit existing data sources and safely backfill/derive only what can be proven:
- assignment instances
- scores
- attempts
- existing section results
- submission/completion timestamps
- existing individualized deadlines/extensions
- support configuration snapshots if historically stored
- existing calculator/TTS/tool interactions if stored
- existing teacher/provider events if stored

For anything not historically available, mark `Not recorded` instead of manufacturing evidence.

If a migration is needed, make it idempotent, dry-run capable, scoped, documented, and safe for production data. Prefer lazy/backward-compatible reads over a destructive migration.

### Permissions and Firestore
Follow the repository’s existing authorization model.

Support profiles and evidence are sensitive educational records:
- students may receive the resulting support behavior but must not be able to enumerate privileged support-profile metadata they do not need
- teachers should only see students/classes they are authorized to teach
- providers/admin roles should follow existing access patterns
- writes must validate ownership/role and immutable audit fields
- new collections require Firestore rule tests
- report access must be authorized server-side/data-layer-side, not only hidden in UI

No security-through-obscurity.

### Architecture expectations
Do not create one giant component or one giant Firestore document.

Prefer focused units such as:
- support profile/domain normalization
- assignment support resolution
- support event writer
- engagement telemetry
- service/support log
- evidence aggregation
- grade-impact aggregation
- report model/renderer
- teacher Support/Evidence UI
- student Support tools UI

Follow existing repository patterns and naming where they already solve the problem.

### One-session execution strategy and checkpointing
This task is intentionally large. Work continuously, but never make completion depend on one terminal tab or one context window.

At the start:
1. Inspect the repo and existing implementation.
2. Write `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md` with the architecture/data flow and concrete file plan.
3. Write/update `docs/handoffs/IEP_SUPPORT_EVIDENCE_STATUS.md` with a checklist and current status.
4. Commit and push the design/checkpoint before major implementation.

Then implement in coherent phases. At every stable phase:
- run targeted tests
- commit
- push the branch
- update the status document

Suggested checkpoints:
- architecture + schemas + rules/tests
- support application/resolution
- telemetry/evidence logging
- teacher UI/service logging
- student support tools
- report/grade-impact aggregation
- browser QA + final hardening

Do not wait until the end to make the first commit.

If the session is interrupted or usage is exhausted, the branch must already contain the latest stable work and the status doc must say exactly what remains.

### Use subagents carefully
You may use parallel subagents for independent read-only reconnaissance, test review, security review, or final code review.

Do not let multiple agents edit overlapping files concurrently.

The main agent owns architecture and integration.

### Testing / QA
Use TDD for new behavior where practical.

Follow `AGENTS.md` exactly.

At minimum run:
- `npm run test:platform`
- `npm run test:authoring-v5`
- `npm run test:rules`
- `npm run lint`
- `npm run build`
- `npm run build:firebase`
- relevant `tests/tools`
- new browser journeys in the existing in-memory/fake-school harness

If source-contract tests fail, determine the behavior they protect before changing code or assertions. Mutation-check new/changed assertions as required by `AGENTS.md`.

Browser QA should cover teacher and student paths at desktop/tablet widths and include:
- support profile display
- automatic support behavior
- extra-time deadline
- TTS/tool usage evidence
- manual teacher event
- inclusion/service entry
- engagement timing
- assignment hub Support/Evidence view
- student drawer view
- report generation
- print layout
- no duplicate assignments
- Standard vs MOD separation
- unavailable historical evidence shown as `Not recorded`
- permissions

### Real-account observation
If the teacher signs into a browser profile for you, production observation is READ-ONLY unless the human explicitly directs otherwise.

Do not create, edit, submit, grade, unlock, extend, or otherwise mutate real student/teacher production data merely for QA.

Use the fake/in-memory harness for write-path testing.

### Deliverables
Finish with one reviewable PR from a dedicated branch.

PR must include:
- what changed
- architecture/data model summary
- privacy/security notes
- screenshots from fake data only if useful
- tests and exact results
- migration/backfill behavior
- Firestore rule/index changes
- exact Cloud Functions requiring deployment
- Hosting deployment requirement
- rollback considerations
- known limitations
- any historical evidence that cannot be reconstructed
- exact steps for the teacher to generate a student report after deployment

Do not deploy.

Do not merge the PR yourself.

### Definition of done
This mission is done only when:

A teacher can open a student/assignment from the normal teacher workflow, see the effective supports and evidence, add a classroom support event with one click, see individualized deadline/support state, review engagement/attempt/performance evidence, inspect recorded service/support minutes, and generate a concise support-evidence report for a selected grading period.

The student receives applicable automatic platform supports without first having to request them.

Standard and modified instructional conditions remain clearly distinguishable.

The report never turns “no platform record” into a claim that support was not provided.

The implementation is backward-compatible, permission-tested, browser-tested, production-build clean, checkpointed/pushed, and presented in one PR.

### Final instruction
Do not stop after an audit or recommendations. The purpose of this session is to **implement the system**.

If you uncover an adjacent defect that directly blocks reliable support/evidence reporting, fix it in this PR when low-risk and document it. Put unrelated improvements in the final backlog rather than expanding scope indefinitely.

Use judgment, preserve current MathMaster behavior, and favor evidence integrity over cleverness.
