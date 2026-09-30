# MathMaster Teacher Experience Redesign

You are performing a major teacher-side UX, workflow, information-architecture, and efficiency audit of the MathMaster / My Math Path platform.

This is NOT merely a bug-fixing pass.

Use the actual teacher experience to understand how MathMaster currently works, then make high-confidence improvements that organize the platform around the way a real classroom teacher actually works.

The teacher using this platform teaches real classes and uses MathMaster during live instruction. The platform needs to account for real classroom interruptions, schedule changes, grade entry, student monitoring, assignment management, and the fact that teachers often need information immediately while class is happening.

START BY OBSERVING THE REAL PLATFORM.

The production site is:

https://mathmaster-aleks.web.app/

Use the configured Playwright browser named playwright-teacher.

IMPORTANT LOGIN PROCEDURE:

1. Navigate to the MathMaster site in the VISIBLE headed browser.
2. When authentication is required, STOP.
3. Tell the human user to sign in manually in the browser.
4. DO NOT request, read, capture, store, paste, or type the user's password.
5. Wait until the human says: "I am signed in. Continue."
6. Only then begin the teacher-side observation.

The persistent browser profile is specifically intended to retain this authenticated session.

==================================================
CRITICAL PRODUCTION SAFETY
==================================================

The real teacher account contains real classes, assignments, grades, and student data.

PRODUCTION IS OBSERVATION-ONLY.

You may navigate, inspect, open screens, examine layouts, inspect menus, filters, grades, assignment information, Live View, Grade Export, settings displays, and other non-destructive views.

DO NOT:

- change a real grade
- launch a DOL for real students
- open or close real student work
- change due dates
- modify assignment availability
- publish/unpublish assignments
- modify students
- modify rosters
- submit student work
- reset attempts
- send notifications
- alter accommodations
- delete anything
- modify a live class
- perform test exports that alter application state
- perform any action that could affect real students

When an interaction could modify production state, STOP and reproduce/test it locally instead.

Do not include student names, IDs, emails, grades, or personally identifiable student information in commits, PRs, documentation, or screenshots.

Sanitize all examples.

==================================================
CORE DESIGN GOAL
==================================================

MathMaster currently has teacher information and controls distributed across too many locations.

Reorganize the experience around the major things a teacher actually works with:

CLASS
ASSIGNMENT
STUDENT
GRADE
LIVE CLASSROOM ACTIVITY

A teacher should not have to remember which unrelated section of MathMaster contains a particular action.

Wherever an object appears, the teacher should have a natural path into the relevant information and controls for that object.

==================================================
1. ASSIGNMENT-CENTERED TEACHER EXPERIENCE
==================================================

This is a major priority.

Currently an assignment may appear in:

- dashboard
- class
- assignment library
- grades
- Live View
- reports
- student information
- other locations

But the teacher frequently has to hunt elsewhere for information related to that same assignment.

Study this problem carefully.

The desired principle is:

WHEREVER A TEACHER ENCOUNTERS AN ASSIGNMENT, THE TEACHER SHOULD BE ABLE TO CLICK INTO THAT ASSIGNMENT'S WORLD.

Determine the best UI architecture after seeing the existing platform.

Possibilities could include an Assignment Control Center, assignment details page, contextual drawer, improved menu, or combination.

Do NOT blindly create another huge modal.

From an assignment, the teacher should be able to efficiently reach information such as:

- assignment overview
- assigned class/classes
- assignment type
- assigned date
- due date
- availability
- current section/status
- student progress
- students not started
- students working
- students complete
- students needing attention
- grade summary
- individual grades
- student work
- attempts
- Live View
- question analysis
- Warm-Up
- Classwork
- Practice
- DOL
- assignment settings
- exceptions/extensions
- grade export
- other existing assignment actions

This does NOT mean displaying all of this simultaneously.

Use progressive disclosure and strong information architecture.

==================================================
2. REAL CLASSROOM TIMING + DOL CONTROL
==================================================

Automation should help teachers.

Automation must NOT trap teachers.

Real classroom schedules are interrupted by:

- fire drills
- assemblies
- pep rallies
- announcements
- testing
- shortened periods
- technology problems
- reteaching
- activities taking longer than expected
- teachers choosing a different DOL
- students being ready earlier or later than expected

Audit the automated Warm-Up/DOL/availability behavior.

A teacher needs the ability to MANUALLY LAUNCH/OPEN A DOL when appropriate.

Consider clean controls for:

- Open now
- Close now
- Reopen
- Extend
- Return to automatic schedule
- temporary custom availability where useful

Do not overcomplicate the UI.

The teacher should clearly see:

- automatic schedule
- current actual state
- whether a manual override is active

Teacher overrides must not unexpectedly destroy the underlying normal schedule.

==================================================
3. CURRENT INFORMATION VS HISTORICAL CLUTTER
==================================================

Inspect:

- Grades
- Live View
- class dashboards
- assignment lists
- reporting
- other teacher screens

Old assignments and previous marking-period information currently remain too visible and compete with information the teacher needs right now.

Current instruction should dominate the default interface.

Evaluate concepts such as:

- Today
- Current Week
- Current Marking Period
- Upcoming
- Needs Attention
- Recently Closed
- Previous Marking Periods
- Archive

Historical information MUST remain accessible.

It simply should not clutter normal day-to-day workflows.

==================================================
4. LIVE VIEW
==================================================

Evaluate Live View as a tool a teacher uses WHILE TEACHING.

Ask:

What does the teacher need to know in the next 30 seconds?

Prioritize:

- current class
- current assignment
- students not started
- students actively working
- students stuck
- repeated incorrect attempts
- students complete
- intervention needs

Old assignments should not compete visually with live classroom information.

Do not turn Live View into a giant historical analytics dashboard.

Detailed reporting belongs elsewhere.

==================================================
5. GRADES
==================================================

Audit teacher grade workflows.

A teacher should quickly be able to answer:

- How did this class do?
- What happened on today's assignment?
- Who is missing work?
- Who needs intervention?
- What is currently relevant?
- What belongs to a previous marking period?
- What is ready to export?
- What assignment produced this grade?
- Can I reach the student's underlying work?

Create natural connections:

Assignment -> Grades -> Student Work

Grade -> Assignment -> Student Work

Student -> Assignment -> Work/Attempts

Reduce screens that force the teacher to mentally join disconnected information.

==================================================
6. GRADE EXPORT / GRADE EXPORT HUB
==================================================

Perform a COMPLETE audit of the grade export workflow.

Do not merely check whether a file can technically be generated.

Evaluate the workflow from the teacher perspective.

Known concerns include:

- exporting only ONE class
- exporting selected classes
- exporting multiple classes
- avoiding being forced to export all classes
- exporting one assignment
- exporting selected assignments
- re-exporting grades
- regenerating exports after grades change
- exporting again after a previous export
- re-downloading/recreating a lost export
- late work
- retest grade changes
- grade corrections
- absence extensions
- marking-period organization
- historical clutter
- useful file names
- useful ZIP organization
- Skyward efficiency
- errors/timeouts
- partial failures

IMPORTANT:

EXPORTING GRADES SHOULD BE NON-DESTRUCTIVE.

A teacher must normally be able to export the same grades again.

Investigate whether the current implementation uses an "exported" flag that suppresses grades/assignments after they have been exported.

If so, determine WHY before changing it.

There may be value in remembering whether something has been exported.

But:

"Previously exported"

MUST NOT mean:

"Not allowed to export again."

Consider whether a stronger model would be something similar to:

Not exported

Exported [date/time]

Changed since export

Export again

Only implement that architecture if it works safely with the current data model.

A teacher may need to re-export because:

- late work was completed
- a grade changed
- a retest replaced a grade
- Skyward rejected an import
- the file was lost
- the wrong class was selected
- an absence extension changed a score
- additional students completed the assignment

Audit existing functionality involving:

- Skyward
- Teams if still supported
- student IDs
- numeric ID validation
- absent students
- extensions
- retest replacement
- grade rounding
- category mapping
- missing work
- assignment splitting into multiple gradebook items
- ZIP/file organization
- per-class export
- multi-class export
- assignment export

Look for duplicate code paths and conflicting assumptions.

The natural workflow should support things such as:

Class -> Grades -> Export

Assignment -> Grades -> Export

Gradebook -> Select assignments -> Export

These should lead into ONE coherent export engine rather than duplicated systems.

Before export, the teacher should clearly understand the export scope:

- class/classes
- assignment/assignments
- students
- marking period
- grade format

Do not add unnecessary filters merely because they are technically possible.

==================================================
7. TEACHER DASHBOARD AND NAVIGATION
==================================================

Audit the complete teacher-side experience including:

- dashboard
- class dashboard
- assignment library
- assignment creation
- assignment scheduling
- assigning workflow
- Live View
- grades
- reports
- exports
- student details
- teacher preview / As Student
- lesson launching
- search
- filtering
- responsive layout
- terminology
- status indicators
- empty states
- loading states
- excessive scrolling
- duplicated information
- duplicated actions
- unnecessary pages
- inconsistent workflows

Do NOT assume the existing information architecture is correct.

Make forward-thinking decisions.

Ask whether existing screens should be consolidated.

Ask whether some always-visible information should instead become contextual.

Ask whether actions available in one location should also be naturally reachable elsewhere.

==================================================
DESIGN PRINCIPLES
==================================================

Use:

- Current information first
- Progressive disclosure
- Contextual actions
- Teacher control over automation
- Consistent assignment behavior
- Reduced cognitive load
- Reduced scrolling
- Responsive layouts
- Clear status
- Meaningful names rather than internal IDs
- Advanced functionality without permanent UI clutter

Do not solve clutter by removing important functionality.

Organize it better.

==================================================
IMPLEMENTATION APPROACH
==================================================

FIRST:

Observe the actual teacher experience.

Document what you find.

THEN:

Inspect the source architecture.

THEN:

Develop a coherent teacher UX strategy.

THEN:

Implement high-confidence improvements.

Do not begin by randomly modifying screens.

Do not undertake a dangerous wholesale rewrite simply because the UI needs organization.

Prefer reusable architecture.

Centralize assignment context/actions where appropriate.

Avoid duplicating business logic.

Preserve:

- grading rules
- assignment JSON compatibility
- student-side behavior unless legitimately required
- existing data
- permissions
- security boundaries

Do NOT silently alter grading logic.

Do NOT casually perform schema migrations.

==================================================
LOCAL TESTING
==================================================

After observing production, perform modifications and testing locally.

You may start the local application and use Playwright against localhost.

Do NOT use production to test destructive functionality.

Test realistic teacher workflows.

SCENARIO A:
Teacher opens today's class, finds today's assignment, checks progress, checks grades, enters Live View.

SCENARIO B:
Fire drill removes 20 minutes. Teacher manually controls DOL availability safely.

SCENARIO C:
Classwork takes longer. Teacher adjusts DOL timing without damaging the assignment.

SCENARIO D:
Grades/Live View default to current relevant information while previous marking periods remain intentionally accessible.

SCENARIO E:
Teacher encounters an assignment and can reach grades, student work, live information and controls without hunting through unrelated screens.

SCENARIO F:
Teacher notices a student's grade and follows it to the assignment and underlying work.

SCENARIO G:
Teacher exports ONLY one class.

SCENARIO H:
Teacher exports Monday, grades change Tuesday, teacher exports the same assignment/class again.

SCENARIO I:
Teacher loses the export and regenerates it.

SCENARIO J:
Teacher exports selected classes rather than every class.

SCENARIO K:
Teacher opens an assignment and reaches the export workflow with that assignment/class already selected.

==================================================
RESPONSIVE TESTING
==================================================

Test teacher UX at:

- normal desktop
- smaller Chromebook/laptop width
- tablet-style width where practical

Check:

- scrolling
- clipping
- hidden controls
- dialogs/drawers
- dropdowns
- filters
- layout shifts
- loading
- navigation
- assignment context
- grade export
- DOL controls

==================================================
CHECKPOINTING
==================================================

This is a long task.

DO NOT allow significant work to exist only in the working tree.

Commit coherent checkpoints regularly.

Push the branch periodically when appropriate.

Never reset/clean/discard work simply to solve a problem.

If disk space or another environmental problem occurs:

STOP,
report it,
and preserve the existing work first.

==================================================
DELIVERABLES
==================================================

Implement the highest-confidence improvements.

Create:

docs/TEACHER_UX_AUDIT.md

The audit must include:

- current-state findings from actual usage
- major teacher pain points
- architecture decisions
- improvements implemented
- grade export findings
- remaining high-priority recommendations
- medium-priority recommendations
- future/exploratory ideas
- teacher workflow map

Also provide a follow-up backlog.

For each remaining recommendation describe:

Problem
Teacher impact
Recommended solution
Complexity: small / medium / large
Whether it should be handled next

Open a GitHub PR when the implementation is ready.

DO NOT MERGE THE PR.

DO NOT DEPLOY PRODUCTION.

In the PR summary, explain changes in teacher language rather than only engineering language.

==================================================
SUCCESS STANDARD
==================================================

The teacher should feel:

"MathMaster knows what class I am teaching, what assignment I am dealing with, what my students are doing, and what I am likely to need next."

Teachers should experience:

less searching
less scrolling
less clutter
fewer disconnected screens
faster access to grades
faster access to assignment information
better live-class decisions
more control when class does not go according to schedule
a flexible, repeatable grade-export workflow

Observe first.
Think strategically.
Design coherently.
Implement carefully.
Actually use the resulting workflow before calling it finished.
