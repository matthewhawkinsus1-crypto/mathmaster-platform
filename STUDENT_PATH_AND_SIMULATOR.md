# The student path, CCMR, and the Teacher Path Simulator

What exists now, and the four rules that keep it coherent.

## One engine, every screen

`buildStudentPathOptions` is evaluated **once** per student and passed to every
surface that shows a recommendation:

```
App.jsx  ──▶ studentPathOptions ──┬──▶ RecommendedSkills   (Best Next Step, Strengthen, …)
                                  ├──▶ StudentLearningPath (the branching map)
                                  └──▶ CCMRHub             (assessment pathways)
```

None of them rank, re-check a prerequisite, or compute a date. `pathMap.js`
selects and arranges; the components draw. A test walks the panel's cards and
asserts every one has the same status the engine gave it, so "Available in
Recommended for You but locked on the Path" cannot happen quietly.

## Two clocks, on purpose

| surface | clock | why |
|---|---|---|
| student path, dashboard, CCMR | the real calendar at `nowValue` | timing is part of the answer |
| simulator's student experience | the teacher's simulated date | so a term can be walked through |
| graph inspector | **neutral** pacing | "what mathematically blocks this?" must not be answered with "because it is March" |

The real clock is never modified. A simulated date is passed as the same
`nowValue` the live app passes, so the calendar provider, the assignment
lifecycle and the path engine move together.

## Live data and simulated data share components

```
                    ┌── MyMathPathApp (fetches) ──┐
real student ───────┤                             ├──▶ MyMathPathExperience
                    │                             │        StudentDashboardView
simulated learner ──┴── SimulatedStudentExperience┘        StudentLearningPath
                                                           CCMRHub / wheels
```

`studentDashboardModel.js` computes the dashboard from injected providers and an
explicit clock, so the same buckets, resume point and DOL banners are produced
for a real student and a synthetic one. The simulator writes nothing to
Firestore: its learner id is namespaced `teacherSimulation:<teacher>:<slot>` and
its assignments are `sim-seed:` documents that exist only in memory.

## Two kinds of prerequisite, kept apart

- **Assignment prerequisite** — finish the notes before the practice opens.
  Computed in `studentDashboardModel` from `prerequisiteAccess`, and it locks a
  card.
- **Skill prerequisite** — the mathematics this skill is built on. Computed by
  the path engine, and it decides status on the Path.

A teacher-required practice can stay locked by classwork while the same skill is
mathematically available on the student's own Path. Both survive, and there is a
test that says so.

## What each status means to a student

| mark | status | student sees |
|---|---|---|
| ★ | recommended / priority / required | the thing to do next |
| ● | available | open, choose freely |
| ↑ | remediation | the repair that opens something else |
| ◆ | extension | ahead of the class, and earned |
| ○ | future / ready early | "your class reaches this in N days" |
| 🔒 | locked | with "Why is this locked?" answering in one sentence |
| ✓ | mastered | counted, not listed |

A blocked skill is always shown **with** its repair, and the other branches stay
open beside it: one weakness does not shut down the course.

## CCMR readiness is not course mastery

The mastery wheel answers *how well do I know the mathematics*. The CCMR wheel
answers *how well am I transferring it into this test's format*. A student can be
strong on one and weak on the other — that is a **transfer gap**, and it has a
colour of its own.

No evidence is never zero. An unpractised domain reads "ready — not yet
practised". A domain waiting on the mathematics says so rather than blaming the
format. A domain with no aligned skill is greyed, not hidden.

Domains and their weights come from the exam registry. There is no second CCMR
taxonomy.

## The simulator

Opens on the student's own screens for an isolated synthetic learner, with
teacher controls beside them, and keeps the question bench one click away for
single-item QA.

- **Slots** — several named simulations at once; duplicate to test both branches
  of one decision. The last slot cannot be deleted away.
- **Snapshots** — save, change, restore. A snapshot carries the CCMR evidence
  too, because a restored route that loses the assessment evidence is not the
  same state.
- **Rewind** — restores the nearest snapshot at or before a timeline point and
  says so. Attempts are recorded by the real attempt policy and cannot be
  un-recorded, so a rewind that only trimmed the list would be a lie.
