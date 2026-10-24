# Owner decisions, October 2026

On 2026-10-23 the owner reviewed the decisions left open by two weeks of student-experience passes, reviews and
handoffs (9–23 October). For each one the owner took the suggested answer ("Go with suggestion"). For seven items
that had already been decided but not finished, the answer was "Do it". This note records each answer and where it
stands, so a later audit does not raise it again.

"Not now" and "later" are decisions too. Those rows record the reason, and nothing was built for them.

## Built

| Id | Question | Decision | Commit |
| --- | --- | --- | --- |
| AX01 | Screen readers cannot review a finished question: its work area is hidden from them. | Keep the answer area locked, but show finished work as read-only content, not inert. | `059f392c` |
| AX03 | Blind students on graph-reading test items. | A "graph read-out" support-plan accommodation, recorded as provided, and a Pre-Flight warning on graph-reading test items with no description. | `ebb328ad` |
| AX14 | Graph Story sketch is pointer-only. | Build a keyboard route (points joined in order). | `b303105b` |
| CI03 | Main CI takes about 45 minutes. | Split the release-tier certification job first; consider GitHub Pro only if queues stay long. | `e274e7ff` |
| CT23 | A TSIA2 item shared an ACT prompt, so the TSIA2 release check was red. | Reword the TSIA2 item. | `c8eeb34d` |
| FB11 | Hint rules (W6 decision 9) and 28 hidden teacher hints. | Accept the rules as built; reword the hidden hints. All 31 the guard hid are reworded. | `c74cd4a6` |
| FB20 | Recovery practice try count; Guided Notes default for Practice. | The real try count was already built. Guided Notes stays off by default in Practice. | `872d92c6` |
| FB23 | Say "not in lowest terms" while a fraction item is open? | Yes: it names the form, not a move. | `3de6afa2` |
| GR01 | Number boxes accepted arithmetic ("64 − 6" for 58). | Refuse arithmetic unless the item opts in. | `61d29a2e`, `4aa10f68` |
| GR13 | Mixed numbers like 3½. | Keep accepting them; a mixed number with a reduced fraction is in lowest terms; a mixed-number key asks for one. | `93890e34` |
| GR18 | Vertex and center keyed for every function type. | Key "vertex" only for quadratics and absolute value, "center" only for rational, cubic and cube-root graphs. | `98918b7f` |
| GR29 | Standard-form multiples of the key were graded wrong. | Accept the multiple, and tell the student to divide out the common factor. | `82080274`, `2febe06b` |
| LC05 | Should the server end abandoned Live Challenge games? | Yes, for games that write no grade, after 30 minutes with no host heard. | `b7015ddb` |
| MP19 | Path choice answers marked wrong before hotfix #456. | Remove them from mastery as not attempted, after the read-only report. An operator script does this; it has not been run. | `97716273` |
| NV02 | Classroom showed a returned grade while a student was still on extended time. | Hold the Classroom return until the student's own close. | `7afd298c` |
| NV08 | What "Reopened" means to a student. | Students no longer see the word; they see the state they can act on. | `bd339eb0` |
| RT03 | After a content upgrade, a pinned question blocked. | A student who started keeps the version they started; a student who had not started gets the new one. | `b55e2c98` |
| RT05 | Exit-ticket extra-time rules. | Confirm as built, but "Close now" spares students on extra time. | `b59d127a` |
| SI05 | Honors SAT items Pre-Flight adds were graded on the device. | Route them through server grading. | `22e4bd67` |
| TC01 | A Test day marked A/B after its period ended marked the class as missing it. | Warn in the day picker, and do not mark a class missed for a day set after the fact. | `9f21105f` |
| TC07 | Should a student's own extension move the Corrections/Retest close? | Yes. | `32c7b780` |
| TL01 | The assignment's graphing setting widened exit tickets, quizzes and tests. | There, the assignment setting may only narrow an item's calculator. | `adce28fa` |
| TL25 | Matrix Lab singular systems. | The "why no / many solutions" reason is the default on singular items; the decision weighs more on DOL 3. | `d81b11c4` |
| TL37 | Which tool steps count as "method" on assessments. | A route sentence shows on an assessment only when the grader requires that route. | `be3b8488` |
| TS02 | "Connect my points" on exit tickets. | Offer it on exit tickets, quizzes and tests only to students with a keyboard-access accommodation. | `2e155960`, `85f40b70` |
| TT15 | The Honors auto-swap replaced blueprint items with off-topic SAT/ACT items. | Match swaps on task type, not only TEKS. | `2110f95d` |

## Recorded, not built

| Id | Question | Decision |
| --- | --- | --- |
| AX07 | Rich tools' own buttons, hints and coaching are English only. | Later, after the Spanish review, starting with the most-used tools' coaching. Recorded in the VPAT (row 3.1.2). |
| AX08 | Translate offers Spanish only. | Keep Spanish only unless students need another language now; a machine-translation service is a privacy and cost decision. Recorded in the VPAT. |
| AX19 | Math speech is linear only. | Not now: it is large. Recorded as a known limit in the VPAT (row 1.1.1). |
| CT05 | No built-in Honors extensions for Algebra II and the perpendicular-lines topics. | Later. Honors classes get the SAT/ACT swap meanwhile, with TT15 fixed first. |
| LC17 | Live Challenge pause/resume and a server-side round close. | Not now. Keep the real-time exception; the round clock already closes on the server sweep. |
| MP15 | My Math Path has no Spanish content. | Later; it depends on how many emergent bilingual students use the Path. |
| PH04 | Phone save lines and notices squeeze the work area at 200% text. | Accept the current cap; revisit if students on 200% text report trouble. |
| RC04 | Extend Recovery credit-back to Classwork and Practice? | Not now. Recovery credit stays with Warm-Up and DOL; Classwork has "practise one like this". |

## In progress at the time of writing

| Id | Question | Decision |
| --- | --- | --- |
| FB01 | 23 tool items have no "Let's back up" step. | Do it. |
| FB05 | One-try choice items: say "one try" and author a reason for each option. | Do it. |
| GR03 | Accept any equation of the line when the field names no form. | Yes for any field that names no form; change older lessons only after an equivalence report. |
| GR21 | Ten Algebra I fields re-asked at `dc2ae1ad` never moved `familyVersion`. | Do it. |
| GR22 | Re-grade answers marked wrong under the old graders. | Run the read-only count, then re-grade upward only. |
| TC15 | The "fewer items" accommodation is not applied on secure Test Cycles. | A teacher-chosen subset is the simplest version. |

## Needs the owner

| Id | What is needed |
| --- | --- |
| OP07 | A staging Firebase project: the owner creates the project and sends its config. |
| FB19, SI02 | Large builds (practice where a family has no sibling; answer keys off students' devices). Scheduled after the items above. |
