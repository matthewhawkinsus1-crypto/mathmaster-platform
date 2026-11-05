# The November 2026 build

Built 2026-11-04 and 05 on `claude/nifty-turing-bv1gqg`, after [REMAINING_WORK_2026-10.md](REMAINING_WORK_2026-10.md). It
picks up what that list left and the suggestions from the pull requests merged since (#525–#540). It also takes in
the 2026-11-03 student walkthrough of #537's lessons
([findings](../qa/2026-11-03-pr537-walkthrough/findings.md)). The order was by impact:
- wrong keys and grading;
- then what students meet every day;
- then teacher screens;
- then the rest.

Nothing here has been deployed, and no operator script has been run.

## 1. The owner's decisions (2026-11-04), and what happened

| Decision | Outcome |
|---|---|
| **Secure fields (TS05, next slice).** The editor's stacked product before a slash is read the way typed text binds it, inside a sum or on an equation's side, keeping GR35a's monomial-quotient rule. Secure phone fields get letter keys: the prompt's letters, x and y, set notation, and ln. | **Built in part.** The grader reads `\frac{2A}{h}-b_2` as `2A/h-b_2` and `h=\frac{2A}{b}` as `h=2A/b`. A lone `\frac{3b^2}{a^3}` keeps GR35a's reading. Verdict sweep: 300,855 gradings, 0 right to wrong, 3 wrong to right (the editor's spelling of `P=100(2)^{-t}/5`). The secure expression and equation keypads have the decided keys. **The fields stay plain text on secure Tests.** With these keys, 4 expression and 14 equation families still cannot be typed on a phone: they need a multiplication sign, letters named only in the prompt's words, a subscript, or ⁿ√. A test pins each family, and so says when the switch can happen. |
| **PF01.** Lazy Grades, Assignments Center, Rewards and Result screens, with an idle prefetch and an offline fallback. The response checkpoint's grading imports stay. | **Built.** studentHome is down from 763.9 KB to 747.9 KB gzip. The four screens are prefetched once Home has rendered (29 KB; skipped when the device saves data). A screen whose code cannot load shows "Try again" inside the student shell, not the app-wide crash panel. |
| **Algebra I M3 T2 L4 and L5:** the classwork (70 and 95 minutes) split over two days. | **Not built: it needs the owner again** (section 5). The platform merges sections that share a role on purpose: live content corrections are stored that way. A Day 2 Classwork section would show students one 17-item Classwork tab, with no finish line for Day 1. The pacing fixes from the same walkthrough are built. |
| **Worked steps for the Operations on Polynomials and Dividing Polynomials exit tickets** (opp-dol-3, dp-dol-1). | **Built.** Each item has its own steps, a one-line answer summary and its common error. Every "=" is a checked claim. The steps are shown only after the ticket is submitted. Like the item's key, they ride in the assignment a student's device reads until SI01 is on. |

## 2. What was built

| Item | What changed | Commits |
|---|---|---|
| Radicals keys (#537 review) | L3 CW 6 keyed 168^(8/5) as 3638 (it is 3635). L1 PR 1 called b·x^h the positive root for odd h. | `eeb112f1` |
| Clock changes | "Tomorrow" was 24 hours later, so the day the clocks change gave the wrong date in four tests and the service log. | `04e8e082` |
| Ask my teacher | A follow-up after a class changes teachers goes to the current teacher. **Rules change.** | `dc16bfa9` |
| Live Challenge class memory | The card follows the memory while setup is open, instead of reading it once before finalization writes it. | `b5dadd46`, `849433ab` |
| Review panel | A choice part's sentence shows as text, not math italics. | `4a6c825a` |
| Exit-ticket steps | Decision 4 above. | `00aff89b` |
| F-L1-EXIT-SPREAD | nth Roots Exit Ticket 1 is a fourth root, as its practice is. It has 36 versions, and its largest coefficient is 625. | `2b9a9f89` |
| L3 practice order | PR 14–15 (band 3) come before the Honors extension and the CCMR items. | `b16f29d4` |
| Choices with $…$ (N27) | A choice that mixes words and mathematics ("$y\ge 2x+1$ and $y\le -x+3$"), or holds LaTeX, is drawn as words and typeset mathematics. It is named without dollar signs, and Pre-Flight no longer calls it raw. 466 CCMR bank options were affected, the audited SAT inequality items among them. | `17fdf6e4` |
| Sort boards | A missed fixed-category sort marks the cards in the wrong category. It never does this on an exit ticket, quiz or test before release. A controlled sort asks for reasons only when the author says so (radicals L1 CW 2, L2 CW 1). | `6476314b`, `6497afc8`, `6862431f` |
| Work View header | At 150–200% text on a phone, Task, Help and Close wrap under the task. | `2effb22b` |
| Typed radicals | A typed `sqrt(…)` closes at its bracket. Grading reads `3/(x+1)^2`, `sin(x)/cos(x)` and `/ln(2)^2` by the order of operations. Sweep: 300,855 gradings, 0 moved. | `22f59b9e`, `7721458e` |
| Graph Feature Rush report | "Off screen" presses are counted beside "Does Not Exist". | `5a621f47` |
| N05 | A test proves the owner's re-grade run reaches answers refused before #536 (section 3). | `61e8cb38` |
| A1 M3 T2 L4/L5 pacing | L5 builds a plain system first (new `m3t2l5-cw-17`, Honors `m3t2l5h-cw-17`). Activity 5.2 comes next, then Noah's items together. L4's bare graph is now second. Noah's hint asks instead of giving the intercepts. L4's graph boxes show an example in the right shape. | `5968750e`, `49645aa2` |
| Systems Workspace | On practice, "Graph these constraints" checks the model against the situation and says why a row is wrong ("'At least 20' means 20 or more: ≥"). A test point's value is worked out before Yes / No. One inequality is "Check your region", not a system. The Rewrite step says how to place an operation, keys included. | `c3eec8d1`, `571cd29f`, `bd1aa658`, `3bfa09e0`, `30b1af7c` |
| TS05 | Decision 1 above. | `d81bec6c`, `96b86de3`, `ce1a1e57` |
| Radicals pacing | "Check Your Progress" halves are typed, not picked; a ± is two boxes. L1 does √63 and 3√12 before the variable work. L2 gets a Check Your Progress like Example B, the four simplest-form rules before they are used, the hard fourth root as a later extension, and an easier Practice opener. | `c1728d39`, `548e9bea`, `2534f513` |
| PF01 | Decision 2 above. | `7b24304f` |
| Radicals feedback | Hint 1 is a question and only the last hint shows the step. 59 predictable slips are named on a miss while tries are left ("Your answer is right when x ≥ 0. Try x = −1."), never on an exit ticket. Reasoning choices no longer give the answer away by length: across L1–L3 the key is now the single longest in 6 of 27 prose choices, down from 18 of 26. A repo-wide ratchet holds the 138 offenders in 26 other files. | `c97597b6`, `6f60d429`, `40538695` |
| Figures (N38, CT04) | The static graph draws dashed lines, vertical lines and shaded half-planes. It is read aloud, in English and Spanish, and printed. The nine "write the inequality for a graph" items in L4/L5 draw their graphs from their own keys. CT04's two items are done. | `b7731372`, `2de53535`, `94a4eb3a` |
| AX10 slice 2 | Read aloud reads the Regression Calculator's tables and the LMR board's process-mode pickers. | `2ca1cc7b` |
| AX32 slice 4 | The last pointer-only directions name the keyboard route: Step Algebra's cancellation and placement, the rewrite tools, the graph workspace, the Graph Axis Editor, Graph Scenario Match, the Sequence Explorer and the rush. | `fa23f19c` |
| A1 M3 T2 L4/L5 feedback | Reasoning choices no longer give the answer away by length: 0 offenders in the four files, down from 44. On all 133 Warm-Up, Classwork and Practice questions hint 1 is a question, and no hint hands over a boundary's two points. 172 slips are named on a miss, in practice only: the symbol turned round, < for ≤, a wrong intercept sign. Two Honors back-up steps no longer offer a box's own answer. | `81e1c05a`, `965f3e75`, `185a494e` |
| AX05 slice 2 | Under an authored Spanish translation, every figure is read in Spanish: a closed question's graph and the graph read-out, the 3D model (each plane by its colour, its equation in Spanish words), the graph workspace's points and strokes, and process mode's row chooser and table to extend. The six figures' hidden screen-reader descriptions are in Spanish, marked `lang="es"`. The English readings are unchanged, checked on 17,000 random graphs. | `cb375b69`, `adda4b0c`, `1f7ef20f`, `20c8b906` |
| Review My Work offline (PF01) | Offline, the result page stays: the grade, section scores, Up next and the buttons. Only Review My Work's place says it needs a connection, with Try again; back online it loads and moves focus to its heading. | `e8865b72`, `9dccffeb` |
| Inequality example | An inequality box's example is `y ≥ mx + b` where the student reads both x and y, and `a ≤ x ≤ b` elsewhere. Neither is a key in any version of any lesson, and the old example, `0 ≤ x ≤ 4`, can be one (a Path family draws it). Secure fields still show none. | `75c7bc4a` |
| Keypad on one-try sections (N56) | On an exit ticket, quiz or test before release, the keypad has no "Needed for this answer" row, every box of a type gets the same keys, and the letters come from what the student reads, plus x and y. The import read a template filter (`{{m|pow}}`) as the letters m, p, o and w; it no longer does. Practice and classwork keep their scaffold, and grading is unchanged. | `456c405a` |
| Systems Workspace, one inequality | The model step, the graph's name and the closed review say "the inequality", not "the system". | `53e27452` |
| Radicals: the last choices typed | Ten more Check Your Progress values are typed: L1 CW 7, L2 CW 8, 10 and 11, and L3 CW 3, 4, 6, 7, 8 and 9. Example D gives each root its own box, so the order is never a guess. 21 more slips are named, 80 in the three lessons. | `24b2fac1` |

## 3. Checked, with no change needed

- **N05: re-grading answers refused before #536.** The owner's run reaches them. That run is `report-classroom-regrade-candidates`, then `apply-upward-regrade`. The report lists a pasted `x²+3x+2` recorded wrong as a change outside K's and P's defects, "higher", and the upward re-grade raises that class. A test holds it.
- **N66: a 400 from racing Start presses in CI.** Start is idempotent on the server. The daily emulator journeys play that scenario, and they have passed every day since.
- **N64: the one mutation #533's tests miss.** It changes only which piecewise graphs are drawn, never an answer. The oracle re-derives every answer from the curve.

## 4. Releasing this work

1. **Firestore rules** (`dc16bfa9`, Ask my teacher).
2. **Cloud Functions**, planned with `node scripts/release-firebase.mjs`. The shared grader changed (`stackDivisions.mjs`, `answerEquivalence.mjs`), so every grading function needs a deploy. Match finalization changed too (the rush report). Deploy outside class hours and outside Sunday 6 pm to midnight Central.
3. **Hosting.**
4. **Then the re-imports.** A changed lesson reaches a class only when its teacher imports it again:
   - Algebra II Honors module 2: Operations on Polynomials, Dividing Polynomials.
   - **Algebra II Honors radicals L1, L2, L3, only after Hosting is live.** An older client reads the new slips against every box, right ones included.
   - **Algebra I M3 T2: L4 and L5, regular and Honors, only after Hosting is live**, for the same reason.
   - Algebra I M2 T2: L2 and L3 (regular).
   - Any lesson imported again also takes the keypad fix: 35 keys in 13 lesson files lose the stray letters m, p, o and w. Until then, an assignment already imported keeps them in practice.

## 5. Waiting on the owner

- **The two-day classwork (decision 3).** The options:
  - **(a)** Real day sections in one assignment. The authored sections would be kept apart from correction storage, with navigation, Home and score lines per day. This is the largest change.
  - **(b)** Two lesson files per lesson (Day 1, Day 2), as the Algebra II Honors module 1 Day 2 files are. No platform change.
  - **(c)** A day break inside one Classwork section. Items are tagged by day, and a student sees "Day 1 done" at the break; the teacher's lock stays per section.

  Recommended: (c), unless teachers must open each day separately, which would mean (a). Split points: L5 after CW 8 (9 items, then 8) and L4 after CW 8 (8, then 9).
- **Systems Workspace practice credit.** On practice, a wrong model can no longer be graphed, so a student who submits without fixing it loses the follow-through credit for graphing their own model. That credit is still reachable on an exit ticket, quiz or test, where nothing is checked early. Keep the walkthrough's fix, or let the model be graphed as written?
- **TS05's remaining keys.** Add a multiplication key, subscripts and ⁿ√ to the phone pads, and take letters from the prompt's words. Then the secure fields can move to the editor.
- **The g(x) line in point maps.** CT04 removed the dashed g(x) from Algebra I M2 T2 L2 PR 10, because students could read y off it. The Algebra II Honors point maps (L2 Day 2, DOL #2 WU 2) still draw it.
- **The Spanish wording (AX05 slice 2), for a Spanish-speaking teacher to read.** The new phrases:
  - "fuera de la ventana" for off the graph; "esquinas", not "vértices"; "punto alto" and "punto bajo", not "máximo" and "mínimo";
  - "La región por debajo de la recta 1 está sombreada"; "Recta vertical discontinua que pasa por 3 en el eje x"; "recta discontinua" where two planes cross;
  - "La línea poligonal 1 pasa por…"; "punta de flecha … que apunta hacia arriba y a la izquierda"; "Modelo 3D con los ejes x, y, z"; "oculto";
  - "Colocaste", "Dibujaste", "Seleccionaste"; "Tu curva está dibujada a través de tus puntos";
  - "Elige dos filas: primero la fila 1 y luego la fila 2"; "elegida como fila 2"; "Filas para elegir"; "Tabla para continuar".
  - The reader says "entre negativo 4 y menos 2": a sign after "y" or "o" is read as a subtraction. Choose "negativo" or "menos" for a sign, and the reader can follow.
- **Live Challenge pause and auto-end (LC17).** In October the decision was "Not now" for pause/resume and a server-side round close. Both are built and tested, but they are not on this branch until you say so:
  - **N43, pause:** the host's Pause and Resume, honoured by every screen and the server. Answers sent during a pause are kept and sent on resume, and the clock gives back exactly the time that was left.
  - **N73, auto-end:** after 30 minutes with no teacher screen, the server cancels a lobby nobody started (the students' banner goes away) and finishes a Pace Race round as End Game would.
- **Only the owner can:**
  - **SI01 (N04).** Turn on the class-scoped assignment reads (Administration → Classes), then run `node scripts/report-assignment-key-exposure.mjs --project <id>`. Until then the answer-key split runs in shadow, and a student's device can read each item's key and worked steps.
  - **N05.** Run the re-grade report, read it, then run `apply-upward-regrade`, dry run first.
  - **N14.** Delete the deployed legacy function `adjustLiveChallengeExperienceScore`.
  - **N32.** Run `scripts/report-legacy-step-queue.mjs` read-only.
  - **#540.** Merge it (Dividing Polynomials Honors, the depth-rule message). N20, N36 and N58 build on it.

## 6. What remains

- **Platform:**
  - Nine boxes in A1 M3 T2 L4/L5 still show the one-variable example, though their answers use x and y: five whose labels say "With y alone", and L5 PR 10's four, whose prompt names neither letter. An authored example fixes them, as L4's graph boxes have (1 hour).
  - In practice, a key with ≥ also puts = in the "Needed for this answer" row (1 hour).
- **Content:**
  - Prose choices in 22 other lesson files hold the answer by length: 94 choices, listed by the ratchet (1 day).
  - Personal Check Your Progress per student, N34 (1 day).
- **Live Challenge:**
  - Group where wrong rush taps land, N42 (1–2 days).
  - Remove a student from a running game, N53 (3–5 days).
  - Class memory for the other games, N80 (1 day).
- **Accessibility:**
  - AX05: under a Spanish translation a tool's own sentences (the Systems Workspace's region corners, the parabola) and an author's description are still English, with the note. Figure names (`aria-label`) stay English, English words inside a Spanish description are not marked `lang="en"`, and a secure Test field's figures are not covered.
  - TT27: the administrator tab list, and teacher screens at 200% text and 320 px.
  - The four pointer-only places the VPAT lists.
- Everything else in REMAINING_WORK_2026-10.md section 3 not named above.
