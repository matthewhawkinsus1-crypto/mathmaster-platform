# Teacher features walk, 2026-11-06

The teacher features this pull request added were used as a teacher would use them, in the real app: the
teacher harness (`tests/browser/teacherWorkflow/`) and, where the server's part matters, the Live Challenge
emulator journeys (`tests/browser/liveChallengeShellQa.mjs`). At 1366×768 and 390×844, by keyboard and by pointer,
with a wrong or impatient teacher (double clicks, Back, a reload mid-flow, leaving and coming back) and with a
student's screen open at the same time.

## Fixed

| Feature | What a teacher or student met | Now | Commit |
|---|---|---|---|
| Ask my teacher, after a class changes teachers | On Teacher Home the new teacher read the former teacher's answer labelled "Your earlier answer:". | It reads "Earlier answer from another teacher:" when someone else answered (compared without case). The teacher who wrote it still sees "Your earlier answer:". | `e20e2cb8` |
| Prepare Recovery | After Approve, Done left keyboard and screen-reader focus on the page: the "Prepare Recovery…" button that opened the dialog is gone by then. | Focus lands on the drawer's "Warm-Up & DOL Recovery" heading. Cancel still returns focus to the button. | `676ad759` |
| Live Challenge, the student's screen | A student looking at an open round when the game ended (the teacher's End Game, or the server finishing a Pace Race round nobody came back to, N73) was told "Round 1 closed while you were away, so no answer was recorded for it." | A screen that stayed visible and online sees no such notice. A hidden tab, a sleeping phone or a reload still gets it, and the final recap still says "No answer". | `44c0d09a` |

## Works as described

- **Where wrong rush taps land (N42).** In a real rush where 27 wrong taps landed on other features of the graph, "Where wrong taps landed" showed the five pairs and the counts the server stored. "Off screen right 86% of 7 presses" sat beside "Does Not Exist right 100% of 6". The report fits at 390 px, and a reload on the podium shows it at once.
- **The report on the console.** "After the game" appeared without a refresh after a rush, after a Graph the Line game, and after a game the server finished.
- **Class memory (N80).** Graph the Line: the card appeared 0.5 s after New Challenge ("33% accuracy → try Easy"), and the server created the suggested game exactly as shown. Solver Race: "→ try Foundation". "Use last settings" and "Use suggestion" fill every field.
- **The server ending games (N73).** An abandoned lobby was cancelled and a Pace Race round finished. The console says why each ended, and the report follows.
- **Prepare Recovery.** On a live copy of the matrices lesson, Not ready becomes Ready and Warm-Up 1 binds version 2 of `matrices.arrayRecordTotals`; the dialog survives double clicks, Escape while saving and a plan changed under it. The dry run for every lesson with RC01 Recovery matches the handoff's coverage.
- **The administrator's tabs (TT27).** They work by keyboard, click and touch, and their regions are named.
- **Ask my teacher after a handover (dc16bfa9).** The follow-up reaches the current teacher, at both sizes.

## Logged, not changed (design)

1. On a phone the administrator's tabs stack 246 px tall.
2. Prepare Recovery prints raw counts ("31717993 fresh versions").
3. Lesson 3's Warm-Up reads "Ready" while Q2 and Q3 sit under "Still not ready". That is by design (they are fixed-answer questions the owner decides on), but it looks contradictory.
4. After "assignment changed", Approve stays enabled and the alert repeats itself.
5. The rush report says "of 1 presses".
6. The class memory buttons fill the setup without telling a screen reader.
7. Students are not told why the server ended their game.
8. The report's arrival on the console is not announced.
9. After a handover the new teacher sees no class memory card: the rules let only the game's teacher read it.
10. A student signed in across a handover follows up to the former teacher until they reload.
11. The rush report has no headings or table semantics.

Items 3 and 7 are wording the owner may want to choose.

## Not run

The machine's load sat above 6 for most of the session, so these were not run: the shell driver's launch,
big-class and endurance scenarios, `graphFeatureRushGame`, and the 50-minute teacher large-text sweep. CI runs them.

## Checks

New assertions in `askTeacherFollowUp`, `recoveryV2Visibility`, `liveChallengeStudentModels` and
`liveChallengeStudentScreen`, each seen red when its behaviour was broken and green again. The covering tests pass
(109 hub, 281 shell-model and 574 student-screen tests), lint and the theme audit pass, and these drivers pass:
`accessibilityTeacherAdminTabs`, `askMyTeacherJourneys` (76 checks), `teacherWorkflow/journeys`,
`liveChallengeChoiceKeyboard`, and `liveChallengeShellQa` (classic, reconnect and adversarial).

The release needs Hosting only: no Functions, no rules, no re-import.
