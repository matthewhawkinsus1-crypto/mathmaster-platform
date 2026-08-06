# MathMaster Class, DOL, Late-Window, and Inclusion Architecture

## Shared submission lifecycle

Every question uses the same attempt policy. Students may resubmit the same response. Multipart questions show a confirmation when no value changed. Correct and exhausted question versions are read-only: text fields, graph points, scratchpads, clear controls, and Undo are frozen. Exhausted versions display a red Incorrect overlay below 50% partial credit or a yellow Almost overlay from 50% through 99%, followed by solution review and an optional replacement problem.

The last submitted response key is stored with the question record, so unchanged-response confirmation still works after moving away from the question and returning.

## Assignment lifecycle

Assignments now have four stages:

1. Scheduled, when a release time is configured.
2. On time, through the regular due date.
3. Late, from the regular due date through the final late due date.
4. Permanently closed after the late due date.

Late work remains graded and receives a visible countdown. Closed assignments remain available only for review. Activity records separate on-time and late engagement and preserve the final on-time and late activity timestamps.

## Classes and versions

Teachers configure Period 1 through Period 8, assign each assignment to selected periods, and may revise those class assignments later. Assignment generation can be personalized per student or shared so every student receives the exact same stable problem version.

## Guided notes and prerequisite gating

`notesClasswork` assignments use guided one-step directions. The platform records engagement time and completion percentage. When the configured prerequisite rule is met, it posts a daily classwork score of 100 and opens the linked practice assignment. The practice assignment also opens automatically at its configured release time even when the prerequisite has not been completed.

## DOL timing

Practice assignments may designate a DOL question. The configured class schedule opens it during the final minutes of the period, shows a countdown for standard students, and records a separate daily DOL score. A temporary schedule can override the normal bell schedule for one date. Inclusion profiles may hide countdowns. Requesting a replacement DOL problem clears the current DOL submission after an explicit warning.

## Inclusion support profile

Each student profile stores inclusion status, accommodations, and modifications. Accommodations can activate text-to-speech, one-step reveal, high contrast, 20% larger text, decluttering, and disabled idle/countdown timers. Modifications can reduce generated complexity and prefill a first step. After two unsuccessful attempts, inclusion students receive a no-penalty productive-struggle micro-question before continuing.

Modified assignment results use a purple `MOD` indicator in the teacher gradebook. The printable IEP support report separates accommodations from modifications and includes assignment score, total and late engagement, DOL evidence, and prerequisite classwork evidence.

## Storage layout

Student records retain separate maps for:

- `gradesByAssignment`
- `assignmentActivity`
- `dolGradesByAssignment`
- `classworkGradesByAssignment`
- `supportUsageByAssignment`

Question drafts remain in local browser storage by student, assignment, question, and replacement variant. Permanent assignment deletion removes linked grade, activity, DOL, classwork, support, and scratchpad records.
