# October 2026 build-out: what was done

On 2026-10-23 the owner reviewed everything the two weeks of student-experience passes, reviews and handoffs
(9–23 October) had left open, and chose "Do it" for each of the 273 smaller items (P3), the 53 fixes and the nine
"Do these first" items. This note records what happened to each one, so a later audit does not raise it again.
The 36 decisions and the 7 decided-but-unfinished items are in
[OWNER_DECISIONS_2026-10.md](OWNER_DECISIONS_2026-10.md).

How to read the outcome column:

- **Built**: changed, with tests; the commit is on `claude/nifty-turing-bv1gqg`.
- **Built (part)**: the smallest useful part was built; the row says what remains.
- **Confirmed**: the behaviour was already right for students; the decision is now written where the code is.
- **Decided**: a choice was made and recorded; nothing (or nothing more) was built.
- **Needs a person**: only the owner, a teacher, a screen-reader user or production data can finish it.
- **Script (not run)**: a read-only report (and, where it applies, an upward-only fix) exists; the owner runs it.
- **Not reproduced**: measured and could not be made to happen; nothing was changed.

Nothing here is deployed. The order to deploy it in, and what only the owner can do, is at the end.

## Fixed first

The owner marked nine items "Do these first": seven defects, built first, and two steps only the owner can take.

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| GR06 | A multiple-choice answer is right only for the key's own option, not for any option whose value equals the key (an unsimplified distractor, and five live lesson fields with a wrong option the value reader could not tell apart). Pre-Flight lists, as advice, any option written as mathematics with the key's value. | Built | `ce6ab2aa` |
| GR10 | Five Path families' keys carried generator text on some draws (x^1, 1x, + 0), so the natural simplified answer was refused on Path and secure tests; the keys are now written simplified, and each old form stays accepted. | Built | `f97a41ae` |
| GR19 | Point-slope answers are read from their full y − y1 = m(x − x1) structure, within the field's own tolerance: y − 0 and any point on the line are accepted, and the right line written in another form is no longer accepted where point-slope form is asked. | Built | `a89459e3` |
| GR28 | Simplest radical form refuses a letter written both as a whole and as a fractional power (x·x^(1/12) for x^(13/12)); every lesson key reads as before. | Built | `76f65afe` |
| RC03 | A content upgrade that changes a question bound to a Recovery proposes and certifies the Recovery binding again, instead of leaving it stale. | Built | `4a33e853` |
| TC09 | A Test Cycle sitting counted while a teacher's extension ran closes with the extension, not the bell (students still inside are no longer marked missed). | Built | `fecd2952` |
| TL46 | On the Module 3 exit ticket (one try), Check waits until every coordinate the classification asks for is typed, and says what is missing. | Built | `332c6547` |
| OP01 | Confirm what is live, then deploy what is not: the #479 memory fix, release 3 and the 20–23 October work, Functions before Hosting. This needs the owner's Firebase credentials. The deploy order for everything since is in the deploy section below. | Needs a person | |
| SI01 | In Administration → Classes, turn on the class-scoped assignment read switches, then run the key-exposure report (`node scripts/report-assignment-key-exposure.mjs --project <id>`). Both need the owner's Firebase project. | Needs a person | |

# Smaller items (P3)

## Accessibility (AX)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| AX12 | A closed question's inequality region reads its corners. | Built | `f5a43e76` |
| AX13 | A composed step's graph is no longer named by the step's prompt. | Built | `1bc83e23` |
| AX15 | A hidden grade is read as "grade hidden", not "bullet bullet". | Built | `5b69082a` |
| AX16 | Read aloud says `\leqslant`, `\geqslant` and `\neg`. | Built | `e0787033` |
| AX21 | Live Challenge says "locked in" once, not twice. | Built | `8e3ee2ba` |
| AX22 | The Live Challenge round banner's faint text stays above 4.5:1 at every stop. | Built | `ec3f7fcd` |
| AX23 | Price choices ("$3 or $4") keep their dollar signs in Figure Match, Live Challenge and the Path. | Built | `41bdf590` |
| AX24 | Bank items with raw LaTeX read aloud as code. | Not reproduced | |
| AX25 | Enter on a closed question with a way on continues, after a final miss too. | Confirmed | |
| AX26 | Pressing the chosen figure-sort chip again clears it (a phone student must be able to unsay an answer). | Confirmed | |
| AX27 | "Place at this coordinate" says what it needs; a curve drawn in pieces reads as one path. The point-chip part did not reproduce. | Built (part) | `1f3e2edb` |
| AX28 | Whether the question or the answer box is heard first depends on the screen reader; the VPAT's human-pass item 13 says what to listen for. | Needs a person | `0369abc5` |
| AX29 | The mapping diagram's column outlines reach 3:1 in both themes. | Built | `f1391be1` |
| AX30 | A matrix's dimensions are "2 by 3" to a screen reader too. | Built | `f76967fe` |
| AX31 | The plane's keyboard sentence stays once shown; the ÷ key is named "Divide". | Confirmed | |
| AX32 | Eleven tools now name the keyboard route wherever a direction says click or tap: Representation Match and Relation Mapping ("select, click or tap, or use Tab, the arrow keys and Enter"), Graphing 2 and Open Sort (already reworded), and now Linear Intercepts, the Linear Table Workbench, Matrix Lab, Expression Meaning, the Interval Number Line, the Representation Bridge and the Sign Solution Analyzer; the shared plane names its route before a student reaches it. Every route named was driven with keys only in a browser; none was invented. The Linear Table Workbench's repair view had promised a tap that did nothing and now points to the list that does it. Still pointer-only: the systems workspace's inequality panels and construct steps, and two authored lines in the Algebra II Honors matrices lesson. | Built (part) | `6e38bbdb`, `44be0859` |
| AX33 | Whether the Regression Calculator announces a result twice needs a real screen reader. | Needs a person | |
| AX34 | Relation Mapping keeps its keyboard sentence after the plot loses focus. | Built | `65fff13e` |
| AX36 | A self-labelled point is read once in figure descriptions. | Built | `ec6944b6` |
| AX38 | Section-tab counts are 12 px on a laptop too. | Built | `e2c95a29` |
| AX39 | The composed question's step strip follows reduced motion. | Built | `10fbddff` |
| AX40 | Step Algebra's cancellation area and micro-question boxes say what they are. | Built | `61505e65` |
| AX41 | Student navigation destinations are real links (new tab, links list); "More" still folds on a phone. | Built | `03e8241d`, `bbe5219b` |
| AX42 | A released Test's results follow the plan for practice too (Read aloud, Translate). | Built | `adfa3bca` |
| AX43 | Vocabulary also explains words in the hints and feedback a student has seen (never a closed hint). | Built | `9fd85bef` |
| AX44 | The VPAT has WCAG 2.2 rows with honest evidence, with a target-size measurement behind 2.5.8. | Built | `70ecf1bb` |
| AX45 | The assignment workspace has one `main` landmark. | Built | `0d2a19b7` |
| AX46 | Figure descriptions name only the kinds of marks while a question is open; on a phone the reference opens in the Task drawer. | Confirmed | |

## Content (CT)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| CT01 | Of 1,000 eligible audited bank items, 164 failed a check (8 table items had already been fixed). 38 were item defects (31 graph, 6 table, 1 ordered pair); all 38 are repaired and none retired. 37 prompts were reworded: "the graph of y = …" became the line, parabola or curve, and "the table" became the counts. The ordered-pair item's 32 versions had all been refused: the conversion lowercased its profile name. The x-intercept item printed its own answer in the stem; that is fixed too. The other 128 are TEKS-domain alignment questions, already skipped at selection, and are recorded unchanged. They reach Path, Live Challenge and Honors selection on the next bank deploy. | Built | `eab8d55b` |
| CT03 | The 3×3 solve family (`matrices.solveSystem3x3`, now version 2) no longer writes "+ 0": 4,612 of 60,694 draws did, now 0. Version 1 is kept for students who started on it. The tolerance item no longer says "at most 1 millimeters" (71 of 568 draws did). DOL #2's Practice 17 and DOL 7 use version 2. Anything that names the family without a version, including the matrices lesson and its Recovery, still gets version 1; moving it takes a version pin and a re-import. | Built | `279a3551` |
| CT04 | Algebra I M2 T2 L2: the CW 9 header says "new input for d", the reused letters are renamed, seven Simplify boxes take math, and two Warm-Ups draw with equal units. The matrices lesson's CW 3 notes no longer repeat the "How to do this" card. Two figure items need code: PR 10's dashed g(x), and a reference line in the L3 PR 9 sort. | Built (part) | `fe3f6609`, `fb8f0efb` |
| CT09 | A read-only script counts the systems-shape items stored only in Firestore: `node scripts/audit-systems-shapes.mjs --project <id>`, which the owner runs with their credentials. | Script (not run) | `2329f1b5` |
| CT10 | Day 2 Practice 1 is a new 3×3 of the same shape and difficulty (x + y + z = 5, x − y + z = 9, 2x + 3y − z = −4; unique solution (3, −2, 4)). A test fails if any Practice system repeats a Warm-Up system or its solution. The live assignment changes on re-import. | Built | `9aa847ae` |
| CT11 | DOL #3 Q4 names its axes ("Length of the ride (miles)", "Total cost of the ride (dollars)") and shows the first quadrant. Q6's four points sit on gridline crossings. The Honors copy is regenerated. | Built | `d5723bea` |
| CT12 | The qualitative parity review needs a person. The automated half is a read-only audit (`scripts/audit-testprep-display-leftovers.mjs`) that counts the SAT/ACT/TSIA2 display leftovers: an exponent of 1 (5 templates), a denominator of 1 (27, 4 of them in choices), a collapsed "(x)" (3), and a new class, "1 units" (21 templates). Its counts are CT14's worklist. | Built (part) | `ec55dee2` |
| CT13 | "Practise one like this" now checks the last six items that had nothing to check: mapping arrows, "x = −5 or x = −3", asymptotes, "4 units to the right" and a line through collinear points. A verdict needs a complete reading; anything unreadable is "compare", never "wrong". DOL #1's "passes the function test" stays words, because a verdict on it would be a guess. | Built | `b86941ca` |
| CT14 | The SAT, ACT and TSIA2 banks no longer print an exponent of 1, a denominator of 1, a collapsed "(x )", "1 units" or "where 14>0 and 2>1": 60 templates edited, in the drafts, the aggregate and both seed mirrors. CT12's audit counts went 3, 27, 3, 7 and 21 to 0, and a walk of every parameter combination of 913 templates (2.28 million draws) found three more, now fixed. Worked steps that divided by a coefficient that can be 1 now name the coefficient instead of writing a fraction over 1. Reducible fractions and unsimplified radicals that are the problem's own numbers are left as they are. The live banks change at the next bank refresh, after the Functions deploy (see the deploy notes). | Built | `3fbd92a6` |
| CT15 | A fractional answer now stays inside both ends of solutionRange, as version 3 of the two linear families; version 2 is kept for students who started on it, and a slot opts in with "version": 3. Symmetric ranges move nothing; an asymmetric range such as [2, 6] moves about 81% of two-step and 82% of multi-step draws. No authored lesson uses an asymmetric range, so no lesson changes. | Built | `bf354a2c` |
| CT16 | The "[College-Readiness — SAT style]" and similar authoring tags are gone from four lesson task texts, and a test keeps bracketed tags out. The live assignments change on re-import. | Built | `238027f6` |
| CT17 | `node scripts/audit-authored-wording.mjs` reads 54 files (320,536 strings) for colour-only wording, positions that name a control or figure, other-language text outside a translation, and other scripts. It found none; 57 strings that use colours as word-problem data are counted apart. A test stops new cases. A Pre-Flight warning for a teacher's imported lesson is not built: it needs teacher-facing wording. VPAT rows 1.3.3 and 3.1.2 are updated. | Built | `a3481962` |
| CT18 | The bank has three A2.7G SAT items a Honors lesson can carry. The radical-exponent item now has 40 versions, not 21 (every old version is still dealt with the same key, and all 40 keys were checked), and Rational Exponents Honors uses it in place of the quotient item, so the two Honors lessons now share one item, not two. Separating them fully needs a fourth clean A2.7G item: SAT bank growth comes in blocks of four to keep its pinned split, so it was not authored. 150 test-prep templates still have fewer than 32 versions. | Built (part) | `4c46d3db` |
| CT20 | The 62 Path seed hints say "Combine like terms, distribute, factor…": the maths move, not a button's name. No change. | Confirmed | |
| CT21 | The eight DOL #2 cards that said only "Solve the equation." (Warm-Up 3, Practice 7–10 and 18, DOL 4 and 5) now carry the equation in the task, so Read aloud says it; the builder and the lesson file match, and a test sweeps every card. A class that already has the review re-imports it. | Built | `3b51aa15` |

## Continuous integration and tests (CI)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| CI01 | The spoken-label scan reads every component (one real miss fixed: Step Algebra's "Pick up the denominator" says the denominator in words); a scan fails a file that starts motion without naming the reduced-motion preference; the large-text run now measures tool bodies, not only their chrome, and covers 8 registry tools in CI. Found by it and fixed: teacher screens' smooth scrolls now follow the reduced-motion preference, and the graphing plane's hover readout and the two progress wheels' hover detail close on Escape without taking the key (WCAG 1.4.13; Work View still closes on the first Escape; browser drivers run in CI). The VPAT rows say what is verified. Left: the wheels' hover detail is not hoverable (selecting the slice keeps it). | Built (part) | `53be7f88`, `caa8ba89`, `65a9d554`, `e7027140`, `68033157`, `c7648c96` |
| CI02 | Linear Intercepts and multi-answer choice groups are driven in a real browser. Left: two messages no student scene reaches, a tool-question scene for dataAndModels, and four capture drivers whose data feeds grading round-trip tests. | Built (part) | `f784040d` |
| CI05 | A platform test fails for any firestore.rules collection that no rules test names; the 16 that had none are covered. | Built | `0878bd8a` |
| CI06 | The Graph Feature Rush game driver runs in CI, and a key pressed as the next graph appeared is no longer swallowed (a product fix). | Built | `51605af5`, `999d3739` |
| CI07 | No workflow holds a write token it is not listed for. | Built | `d40ab088` |
| CI08 | Two integration files no longer share the Test Cycle certification fixture; the Live Challenge certification closes its workers and pages; the DOL #2 review journey waits for its pre-flight; Graph the Line's quiet-round check waits for a just-joined device. Four reported flakes were not reproduced (counts in the commits). A suspected second shared fixture ('canonpersist') is not shared: its second user runs in an emulator project of its own, and a check now keeps every such file in its own project. | Built | `3dd828b0`, `c95df952`, `3e90eb74`, `40b26950`, `40e4866b` |
| CI10 | The M2 T2 harness keeps question records, and an "attempts" journey checks tries, the Submit label and a DOL's single submission. | Built | `7e9b5c04` |
| CI13 | The phone save-line journey shows the app's real failed-save line. | Built | `70e99bcb` |
| CI14 | The strict Spanish-support test stays (decision written in the test); its failure names what to add and where. | Decided | `acf0072a` |
| CI15 | A failing todo test is not counted as a failure; the K step tests read the mid-chain values; dolCloseCopy's test, red at the base, is fixed; the accessibility harness uses the one shared fake Firestore. | Built | `9c424b91`, `0b641d98`, `41a31cf5`, `54300078` |
| CI16 | The Test Cycle lifecycle QA driver runs in CI. | Built | `22b93d2a` |
| CI17 | The harness's p3StartMin stays 0 (40 would close the Warm-Up for 23 of 29 journeys); counting the teachers' Firestore-only systems items is a read-only script the owner runs. | Script (not run) | `2329f1b5` |
| CI18 | actions/checkout and actions/setup-node move to v6. | Built | `68c6e1d5` |

## Feedback (FB)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| FB02 | The 46 regular Algebra II items now have a "Watch out" line in the only copy of the five lessons (teacher-import-jsons/algebra2-polynomials-radicals/). Each line names the usual slip for its question, and the 14 template lines use the version's own numbers. Pre-Flight finds none missing. The lines were drafted for this pass, so a maths teacher should skim them. They reach a class only when the lessons are re-imported. | Built | `b7be071e` |
| FB03 | The hint guard now catches the same value in another spelling (0.5, 6/2, \frac{1}{2}, "one half"), but only where the hint itself states it. A scan of the whole bank (11,814 questions × 3 draws, family hints included) found it hides 2 more hints, both l3-pr-4 in Algebra I M2 T2 L3. Both were reworded to teach without stating the slope. The shared Path publish gate is unchanged. | Built | `a1067114` |
| FB06 | After Submit, a composed mapping step shows only the grader's reason. Changing the arrows withdraws it and brings the coaching back. | Built | `f23071a3` |
| FB07 | "Practise one like this" stays unscored. It checks values, expressions, equations and a line named by two points. A part said in words, a roster with an ellipsis or a mapping stays compare-with-the-solution, because a verdict there would be a guess. The decision is recorded in the module header. | Confirmed | `5a172095` |
| FB08 | Equation steps in composed questions get a form-aware reason ("Right line, wrong form: write it as y = mx + b."), built from the form only, never the answer. | Built | `58a77be8` |
| FB09 | The graph self-check keeps its shape (W5-4); recorded at graphSelfCheck.js. | Confirmed | `16560d85` |
| FB10 | After a miss, "Show a hint" opens the hint under the miss in one click, and the page moves only as far as the newest hint needs. Before, Matrix Lab CW 2 jumped 941 px and left Check 1,157 px below. A new browser driver (feedbackTeachesHintPlace) checks 1366×768 and 390×844; it is not in a workflow yet. | Built | `af33af72` |
| FB12 | How much a composed step's miss reason may say stays the allow-list (W7 decision 14); Data Modeling names which half held. Recorded at composedWorkflow.mjs. | Confirmed | `16560d85` |
| FB13 | "Extra attempts" stays a My Math Path support. A classroom attempt limit is worked out at fifteen places that must agree. On a DOL the outcome is withheld, so a standing extra try would leave the first miss unannounced. The gradebook's DOL row now tells the teacher when a plan lists extra attempts, and that the DOL try is theirs to give. Building it would take a profile-aware attempt resolver at 2 server and 13 app sites, plus a product decision for DOL, quiz and test. | Decided | `3366ba11` |
| FB14 | The inverse-composition lab refuses a function it would draw and grade as a different one: a line written with m and b, or a horizontal scale b. It says how to write the function instead. No lesson uses the lab today. | Built | `0b35bb17` |
| FB15 | Fixes to worked solutions: literal-equation steps keep the formula's order; a power on a run of letters binds to the last letter (E = mc² had no solution, and ½at² showed a²t²); two one-variable equations "by substitution" get steps, hints and a similar problem; a float key reads as a fraction (x + 1/3); "is never included" reads correctly. The fractional-coefficient systems gap did not reproduce: 0 gaps in 396 random cases, and a seeded sweep now keeps it that way. | Built | `6841fec4` |
| FB16 | "Focus on:" after a miss reads as one sentence, and a figure sort whose cards are all text calls them "Card N". In narrow answer boxes, the example placeholder now sits above the box: 56 of 180 M2 T2 boxes were clipped at 1366 wide, and 0 are at either width. On the lab grid, point names step clear of their dots and of the origin's 0. The CORRECT watermark no longer covers math tools. | Built | `76749997`, `a00bf8db` |
| FB17 | A figure sort names the misplaced figures from the first miss; recorded at figureMatch.mjs. | Confirmed | `16560d85` |
| FB18 | A raised hand shows on the work bar ("Hand up", named "Hint, your hand is raised") when the hint panel is closed, and clears when the hand comes down. | Built | `44da587d`, `f871f3fe` |
| FB21 | Review My Work shows the mark for each part of a multi-part answer, beside its answer. The words come first; a symbol is a second cue, and colour is never the only one. No expected answer, weight or credit is sent. Parts are not shown beside a teacher-changed grade, an excused or never-tried row, or an integrity zero. An older server shows the answers as before. | Built | `41ba4cbf` |
| FB22 | Feedback names a form miss while tries are left: a point where one number is asked, one number where a point is, an inequality where interval notation is asked. A vertical line drawn for y = −2 is told its direction. The Transformations Lab no longer quotes letters its mode never defines. "Your table is right" appears only when a table part was graded right. | Built | `d14145ab` |

## Grading (GR)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| GR02 | "1, 250" (a comma then a space) stays refused as one number; the decision is written at the code. | Confirmed | `0c733cd0` |
| GR04 | The drawn reading of a key like 2^(x-1)/3 stays as graded; Pre-Flight's advisory "Answer keys to check" panel lists typed keys with a bracketed or negative power right before "/", with both readings. | Built | `694a7379` |
| GR05 | Assignment fields compare numbers to 1e-6, as My Math Path and secure tests do (a key that states a nonzero number below 0.001 keeps 1e-9). | Built (part) | `a1e40bfb` |
| GR07 | A content upgrade re-marks multi-answer parts with the server grader; it never lowers a stored record. | Built (part) | `06ea50a0` |
| GR08 | Exact radical pairs refuse decimal coordinates (the prompt asks for exact solutions). | Confirmed | `8760ea1c` |
| GR09 | Digital SAT number boxes accept 1,280, as the live test does. | Confirmed | `52b409f9` |
| GR11 | Follow-through credit for a graph drawn under a wrong "continuous" stays: withdrawing it would lower grades, which needs the owner's explicit say. | Decided | `1c1c5d63` |
| GR12 | An inferred Yes/No choice keeps the screen's distractors for lessons compiled or imported from now on; stored ones keep two choices. | Built | `17876173` |
| GR14 | Pre-Flight's advisory panel lists a typed field that asks for lowest terms but whose grader accepts unreduced values. | Built | `2352854c` |
| GR16 | Open Sort group names and explanations are marked "(for your teacher)" and never show a check mark; the score never counted them, so no stored score changes. | Built | `c6979206` |
| GR17 | An opt-in field grading mode, `sidesAsKeyed`, refuses swapped sides; no field uses it yet (candidate fields are listed in the owner notes), and Path grading does not read it. | Built (part) | `078064aa` |
| GR23 | A read-only report finds attempts marked wrong for a true factor on the two defective Digital SAT factor templates, and the upward-only re-grade step can raise the classroom ones; raising My Math Path answers needs a mastery rescore and is not built. | Script (not run) | `acf80264`, `f90f421b` |
| GR25 | A read-only report compares the live Path bank with the repository and counts the `B^(E)/N` key shape live; the verdict sweep and answer audit can read its output. | Script (not run) | `012de78a`, `b5c6a534` |
| GR26 | Rewrite steps are recorded in One Simplify's words ("Simplified the left side"). | Built | `a5383f5e` |
| GR27 | x·1 is drawn x(1); padded and long decimals stay accepted as simplest. | Built | `2defedd9` |
| GR30 | A stored Graphing line reads y = x (not y = 1x + 0) wherever a teacher reads it; stored text is unchanged. | Built | `3e9795b2` |
| GR32 | A Transformations Lab answer with every image right but plotted in the wrong order earns half per misplaced image; no score is lowered. | Built | `72affcde` |
| GR34 | A typed \log or \ln grades as log and ln. A stacked \frac{\ln 3}{\ln 2} is still refused (it was before). | Built | `e7dea03e` |
| GR36 | In One Simplify a typed 5xy reads as 5·x·y when the board's letters are x and y. | Built | `a3b51e75` |

## Live Challenge (LC)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| LC01 | In-progress points on the live board follow one shared rule, used by the server and the student's screen: never more than the round pays for that credit, and none in Correct Count or Second Chance replays. Steep Rush curves are clipped to the plot. A scripted client can still claim up to the base share in a first-time Accuracy First round, which the server cannot cheaply check. | Built | `1e32c7ee` |
| LC02 | Bulk roster changes (saving a class, moving periods) invite the students they move into their class's game through the same safe single invite. It runs after the change, never fails it, and stops after 15 seconds. A student moved between two classes that both have a game stays in the first. Removing a student from a game in progress is not built: it needs its own callable, a block on re-inviting, seat bookkeeping and certification, all written down in the Live Challenge design. | Built (part) | `b24e802c` |
| LC03 | The projector keeps the round table and standings beside the worked solution; narrow screens stack them in one column. The number of rows is measured, not guessed. Nothing is cut off at 1366×768, 125% zoom, 1920×1080 and five other sizes. A follow-up keeps the standings' top three in view: the first version left two rows at 125% zoom and one at 150% on a 1366×768 projector. Now at 125% the round table shows its winner beside them, and at 150%, where both cannot fit, the round table waits behind Hide solution, as before. | Built | `5d9e74f9`, `afdac449` |
| LC04 | A class reward cannot change a grade, kept three ways. No grading, assignment or deadline code reads rewards, and a test fails the day one does. An item has exactly six fields, and any other is refused. Free text is screened for academic promises, in English and Spanish, with look-alike spellings caught. A word list still cannot catch paraphrase or slang; the first two layers are why that cannot move a grade. | Built | `7e66af0a` |
| LC07 | A Graph Feature Rush round ends with a "How to read the features" card: one line per feature, when to choose Does Not Exist, and two slips to watch for. It is the same for every student and names no graph. The wording is new student-facing maths, which the content owner should read. | Built | `787639c0` |
| LC08 | Graph the Line's later features (inequalities, systems, contexts, self-practice) are each larger than a day. What each needs is written down (rules, scoring, privacy, data, UI, certification); none is built. | Decided | `83ecff43` |
| LC13 | Live Challenge opts out of the graphing calculator: a graphing item there gets the keypad, which says it cannot draw graphs. My Math Path and Recovery keep it. | Built | `a3dc8995` |
| LC14 | A Live Challenge slice of the authoring contract, with a round-timing validator. Its reading-speed assumptions should be adjusted from real rounds. Importing exported round sets, and round sources beyond the bank, remain; the backlog says what they need. | Built (part) | `2620cf0b` |
| LC15 | Teams, class-vs-class, co-op and handicap formats are each larger than a day. What each needs is written down; none is built. | Decided | `83ecff43` |
| LC16 | The host's 3-2-1 sound follows the round's start: three ticks on the screens' 3-2-1 and GO as the round opens; the buzzer stays the lock-in sound. The console offers a Scoring choice for Standard Challenge (Accuracy First, Grand Prix, Correct Count) and Solver Race (Accuracy First, Grand Prix). Speed influence and Second Chance stay with Accuracy First, the only scoring ever tested with replays. Removing a student from a game in progress, or re-inviting one, is not built: it needs its own callable and certification (live-challenge-shell.md §14). | Built (part) | `53be2ed8`, `90dd8d09` |
| LC18 | The console's "Joined X / N" counts invited players from the host roster once it has loaded; it could run one ahead. | Built | `a1a7d371` |
| LC19 | The match recap shows the student's own answer under each round they answered: what they typed, the choice in its own words, or a tool's summary. It comes from a copy the playing device keeps for that student (the last 8 games, 30 days); another student signing in on the same browser sees none of it. A second device or a private window shows the recap without answers: keeping a copy on the server is a retention decision, written down in live-challenge-shell.md §14. | Built (part) | `2bf889a2` |
| LC20 | When the server's sweep closes a round up to about 70 seconds late (no teacher screen open), the student's card says after ten seconds that answers are still being counted and it can take up to a minute. A round that closes on time reads as before. | Built | `7931ff10` |
| LC22 | A list the whole class reads (projector, podium, class standings) now leaves at least three players unshown, so the 4th of five can no longer name the 5th. Two or three players show no ranking, four show the winner, five the top two, six the podium; a student's own device still shows their own row. The reward amounts (a retest pass pays 20), personal bests staying on when recognitions are off, and the 2× cap on game time are recorded as decided. | Built | `8dae7562` |
| LC23 | Expired passes are recorded, as of their end date, when a teacher opens a student's rewards or the student uses another pass; nothing sweeps on a schedule (that would be a new function). Assignment Review's Delivery step has "Students can use a Practice Pass on this assignment" on any assignment with Practice that is not a quiz, a test or a Test Cycle; it stores only the teacher's "no", which the server and the wallet already enforce. The unused `adjustLiveChallengeExperienceScore` trigger is out of the source; the deployed copy stays until the owner deletes it (see the deploy notes). A class-wide rewards overview and a free-form reward rule editor are not built (docs/BACKLOG.md). | Built (part) | `6f8862c5` |
| LC24 | A Live Challenge is not run as a graded, timed DOL: that puts speed pressure on a graded exit ticket, and a race cannot give extended time. Recorded. | Decided | `9dbd1178` |
| LC25 | A student who never joined a Warm-Up game gets no record, never 0%. Recorded in the backlog and at the code. | Confirmed | `9dbd1178` |

Found by the CI batch and fixed in this area: Graph the Line's canvas reset its keyboard cursor in a passive effect, so a key pressed as a new item appeared could be undone. It now resets before paint (`e9640410`).

## My Math Path (MP)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| MP01 | A student's earlier-class work is no longer cut off at 200 assignments: it is read in pages. No rule changed. | Built | `e1cf5d33` |
| MP02 | The Challenge-card bar stays at 0.5, as a named constant with its reasons, and a test pins it. Watching how it behaves over a few weeks is a person's job, because nothing counts Challenge cards. | Confirmed | `286f0a9b` |
| MP03 | The push D handoff no longer says Path grades from before #456 can be re-graded from pathSubmissions (no record holds the option picked). It points to the MP19 report script. | Built | `6b4bc4ea` |
| MP04 | Rebuilding the Grade 6–8 Path banks to TEKS Fidelity V2 needs a content review per standard, then authoring. Measured: 45, 40 and 43 standards (237, 212 and 227 documents). Start with the 29 prerequisite standards, Grade 8 first. The banks' "answer-leakage" audit flag is only the "Choose the correct answer" label. | Needs a person | `2af08280` |
| MP05 | The automatic-publishing card names the class's own due day ("after the week closes on Friday night") instead of "midnight Sunday night" for everyone. | Built | `ae4cf6a3` |
| MP06 | The Path week turns over at midnight Monday in the school's time zone (America/Chicago, the zone due dates use), not at 7 pm Sunday. Week keys are still Mondays, so nothing migrates. Only work done between 6 pm and midnight on Sunday moves, to the week that is closing, which can only raise completion. Short weeks were already fixed. **Deploy Functions and Hosting together, outside Sunday 6 pm to midnight Central.** | Built | `5ddd1c07`, `da464f4b` |
| MP08 | My Math Path no longer draws a second "Home" beside the shared navigation. It is kept only where there is no shared navigation: a teacher viewing a student's Path, and the Teacher Path Simulator. | Built | `1c223904` |
| MP10 | Nine of the roadmap's ten section-4 items are built. Per-topic goals with their own due date and grade need the owner's design first. | Decided | `a39b223e` |
| MP11 | My Progress history starts at deploy. That is an accepted limit, written at the code; the student wording already says so. | Confirmed | `c4262c63` |
| MP12 | "Start this question fresh" (after a question's module fails to render) is offered once per question, not once per engine. | Built | `a12a6768` |
| MP13 | A Path field's choices are remapped exactly where the screen draws them. A typed field keeps its authored key, because remapping it would mark typed answers wrong. A test pins the two together. | Confirmed | `66597610` |
| MP14 | "Practise this skill" on a released practice test (SAT, ACT, TSIA2, ASVAB) starts that exam's practice on the standard the student missed. With no course standard, or no practice published for it, the student lands on the CCMR tab as before. The worked solution's heading level fits the page. | Built | `e3937908` |
| MP16 | A Path graph can shade to the left or right of a vertical boundary (x ≤ 5), clipped to the plane. No current bank item uses it yet. | Built | `c23c73ce` |
| MP17 | The verifier's minor findings, fixed and each tested by behaviour. Topics: the wheel's centre shows the wedge's status word, Mastered cards are headed "What this is based on", a unit with topics both behind and ahead of the class says it is partway through, and each repair button says how it relates to its card. CCMR: a passed test date is not flagged as invalid, a teacher-chosen test is named as such, editing waits for the server, and an unchanged plan does not rebuild the week. Retention: the module loads before the answer transaction, and the simulator freezes each week once. One minor is recorded as a product call in `topicBrowser.js`: a repair can point to a skill later in the course. | Built | `6f3bf44a`, `889bf3c9`, `bee7d638` |
| MP18 | A Path question finished without getting it right offers "See the solution", drawn from the session's own review and fetched only when asked. It is not offered in a teacher's read-only view or the simulator. "Try a similar one" is not offered: none of the 3,337 templates can build one from what the review gives this screen. | Built (part) | `ef9665bc` |
| MP20 | The A.12A mapping template now also draws functions whose outputs repeat, with its own solution text (familyVersion 4). Every draw's verdict was rechecked: 120 draws, 57 functions and 63 not. **A root admin must publish the course Path release for it to reach students.** The A2.2A log template stays withheld: its graded answers are the same for every log parent the standard names, so no wider generator can change them (recorded in `pathRecapWithheld.mjs`). | Built (part) | `0ac95dbd` |
| MP21 | An open retention check is refused when it is not due ("This check is not due yet. It will be back on your Path when it is."), and it has its own lock beside open practice, so neither blocks the other. Sessions in flight are released by the lock they took, and a check opened before the deploy is resumed, not doubled. | Built | `c300db90` |
| MP22 | The server decides Challenge and retention by the one favourable mastery rule the screens use, and so does "Skills that moved". This fixed a real bug: the server asked whether the Challenge skill itself was Mastered, which it never is, so every Challenge card was refused at its first question and left a stuck session. A Challenge that is not earned now becomes ordinary practice. In-session routing and rigor, mastery history, My Progress and growth rewards keep the server's profile on purpose, with the reasons written in the code. | Built | `c300db90` |
| MP23 | Path session locks stay keyed per student, standard, exam and slot. Re-keying would orphan in-flight sessions' locks. Recorded at the code. | Confirmed | `eb5267ed` |
| MP24 | The plan only chooses the test format of transfer slots under "Auto". The one teacher screen that already loads it, the roster's read-only My Math Path, already uses it; every other preview would need an extra read per student. Recorded, no change. Left for the teacher screens: pass the class's weekly goal settings to that read-only view. | Decided | `fc1a5961` |
| MP25 | When assignment evidence moves the Path is now written beside the rule and pinned by a test. Two weak moves are fixed. A single missed assignment question on a prerequisite no longer locks every skill built on it, or sends one to remediation, when the evidence is too thin to judge. And "not for mastery" work no longer moves the server profile; stored records are not rewritten, so a backfill would be the owner's call. | Built | `9967a2af` |

Found by this area's first batch and fixed: a hand-built request could freeze a second "week" inside one calendar week, with its own grade, streak count and rewards. The freeze now requires the class's own week-start day (`f217bc8d`; Functions deploy).

## Navigation (NV)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| NV01 | The account-load error wording (seen by teachers too) stays (W7 decision 10). | Confirmed | |
| NV03 | A section-scoped Classroom launch keeps its section on reload and Back (in the tab's history entry, not the address). | Built | `79b572c5` |
| NV04 | Closed work says "Closed", and "no credit" only when retrying (W6 decision 13). | Confirmed | |
| NV05 | The phone breakpoint, 10-second toasts and the unavailable-link wording stay. | Confirmed | |
| NV06 | The W6-2 navigation changes stay. | Confirmed | |
| NV07 | Student times still follow the device's time zone: a fix needs the whole lifecycle on the school's zone (formatting alone was built, then reverted). | Decided | |
| NV09 | An address left waiting on a signed-out page for over 10 minutes no longer opens for the next account; an arrival no longer overrides a tap on Home. | Built | `9286b2c1` |
| NV10 | Home's "Some work needs attention" names the assignments and what to do for each kind. | Built | `f6ee42b4` |
| NV11 | Started work due today says "Due today" on its card. | Built | `94454557` |
| NV13 | One meaning of "Practice"; the exit ticket spelled out on printed worksheets; a fresh copy says so. | Built | `b231057a` |
| NV14 | Recovery, Corrections and each Test review are history entries over their page or card: Back, Forward and a reload stay on the student's screen. A reload mid practice test lists that test first with Resume focused (nothing resumes by itself). | Built | `a3e80825` |
| NV15 | "What changed" says why a teacher changed a question's grade (the fixed reason label). | Built | `e849a05b` |

## Operations and other (OP, OT)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| OP03 | `node scripts/report-assignment-calculator-settings.mjs --project <id> --within-hours 24` counts live assignments whose calculator setting changes behaviour (read-only). | Script (not run) | `71bfe6a7` |
| OT01 | Docs housekeeping for fixed pass-3 items. | Built | `a8b36ad4` |
| OT02 | The push deploy page's built-in defaults are the owner's to sign off. | Needs a person | |
| OT03 | The unused assignment navigation auto-compact module is removed. | Built | `faf90b00` |
| OT05 | The Functions SDK's JSON encode/decode errors never reach a student as a sentence. | Built | `70bc38b0` |

## Performance (PF)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| PF01 | The student first load, two slices. The Path tool graders, the question-type catalog and the question family engine no longer load before a student's Home: Home used one small piece of each (which Path tool a name means; a question type's representation for the live-presence tile; one hash function), and each import carried the whole module. Those pieces now sit in small modules of their own (functions/shared/pathToolIds.mjs, questionRepresentation.mjs, hashString32.mjs) that the big ones re-export, so nothing else changed: the Path verdict sweep moved 0 of 1,155 probes, and tests compare each new piece with a verbatim copy of the old one (500+ spellings, 10,783 question shapes, 6,814 hash inputs). studentHome goes from 793 KB to about 759 KB gzip, and the budget's baseline is lowered to match. Remaining, measured: the response checkpoint's grading imports (about 51 KB; grading-authority code that saves a student's answer, so loading it later needs a verdict sweep and an owner call on what happens offline); lazy Grades, Assignments Center, Rewards and Result screens (about 18 KB, 1.5 to 2 days, and it changes when each screen's code arrives); the assignment workspace as a lazy module (up to 20 KB, 2 to 3 days); teacher stylesheets and teacher-only modules still in App (about 4 KB and 5 to 6 KB). | Built (part) | `66a8a04a`, `0f4dc0d1`, `215683cd` |
| PF02 | A cold correct secure submit pays the mistake-diagnosis import once per instance (0.4–0.9 s) before its transaction, holding no session. Waiting for it only on a miss would mean awaiting it inside the grading transaction, after its reads, holding the session lock: not done. | Decided | |
| PF03 | The open Test review's 30-second check re-reads one student's answers, not the whole cycle. | Built | `0cdee613` |

## Phone layout (PH)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| PH08 | A Work View rail that holds more than fits shows it; every Graphing 2 action is reachable on short landscape phones. | Built | `60298a81` |
| PH09 | 3×3 matrices fit 320 px phones; point dots are at least 5 px; an open Vocabulary panel is readable in the task card; a card that scrolls shows it. | Built | `0d4c51b3`, `a25d76bc`, `9b8e2a76` |
| PH10 | A real-App phone journey for Matrix Lab (Check was already reachable). | Built | `9582d74a` |
| PH11 | An upright tablet's Work View puts its actions in a row; a plane the student marks fits between the pinned task and the action bar. | Built | `f04f4f8f`, `e38c940f` |
| PH12 | The Assignments Active tab's hint names its tab. | Built | `b70194e4` |

## Recovery (RC)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| RC05 | The live lesson's DOL Q1 Recovery has 14 fresh versions (the minimum is 12): whether that is enough is the owner's call. | Needs a person | |
| RC06 | Recovery answers edited offline on two devices are ordered by each device's clock, as drafts are: kept as the accepted limit. | Decided | |
| RC07 | Perpendicular-line families keep their givens under an author's prompt. | Built | `f71fe371` |
| RC08 | Recovery follows the assignment's calculator setting. | Built | `9d4f2b71` |
| RC09 | The Recovery runner has its own error boundary; its notice is per student on a shared Chromebook. | Built | `3e25c5cd` |
| RC10 | A Recovery out of practice questions offers "Leave a question for my teacher", and Teacher Home lists it. | Built | `dfb88959`, `48bd7f82` |
| RC11 | A singular 3×3 system is classified by all its proportional rows. | Built | `e7f12a33` |
| RC12 | Targeted Recovery deals a later-reading story only where the error can show. | Built | `18bd70f5` |

## Runtime (RT)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| RT01 | An unsaved Step Algebra slip is not announced (the save line already says "Not saved"); an unqueued intercept step credit stays as built (W7 decisions 8–9). | Confirmed | |
| RT04 | Closed questions open in Work View for review, assessments included (W6 decision 8). | Confirmed | |
| RT06 | "Continue here" no longer throws a MathLive page error. | Built | `bb52326b` |
| RT07 | The "device storage full" warning is kept across a reload until that draft saves. | Built | `37cedaac` |
| RT08 | The exit-ticket receipt line appears when the ticket closes, without a reload. | Built | `7cb0f5e4` |
| RT09 | The 120-draft / 400 KB backup caps stay; device-clock ordering is the accepted limit; save problems stay per tab. | Decided | |
| RT10 | The exit-ticket "when time ends" line says the timer's rule in the timer's words. | Built | `2840c8c8` |
| RT12 | The submit label's try count, the "Go back" target, Enter on closed questions and the read-only closed sections stay as built. | Confirmed | |
| RT13 | Intermittent scroll jumps after a section switch or a division: measured at 1366×768 and 390×844, every transition landed the same. | Not reproduced | |
| RT14 | Inline math sits on the text's baseline, so a full stop after it reads as one. | Built | `c4207279` |
| RT17 | A met prerequisite opens practice work early, never an exit ticket, quiz or test. | Built | `e0c3cd93` |
| RT18 | A checkpoint with nothing to queue leaves the save line alone (no stuck "Saving…"). | Built | `29e82b07`, `adf98e71` |
| RT19 | "Extra time" is said only once the class's own window has ended (W7 decision 12). | Confirmed | |
| RT21 | A server sentence that comes with an "unreachable" code shows that sentence, and Try again only when the server says so (W7 decision 13). | Confirmed | |
| RT22 | Step Algebra prompt answers merge one by one across devices, for drafts this build alone wrote (older drafts keep the whole-set rule). | Built | `2368c488` |

## Secure tests (TS)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| TS01 | The abandoned-test finalizer's timing (2-minute grace on a 5-minute schedule), its bookmark and the exclusion of proctor-paused tests stay as built. | Confirmed | `6abcea5c` |
| TS03 | A Digital SAT practice timer shows module 1's own time, then says it is up while the test time keeps running. Not done: an adaptive module 2. | Built (part) | `289303d6` |
| TS04 | Every secure number field has √ and π keys; every secure inequality key is typeable on a phone; the mixed-number hint follows the exam; a practice test's calculator lists zeros, minimum and maximum (never a teacher's secure Test). | Built | `246db9f3`, `7dab4df4` |
| TS06 | A secure test explains the full-screen rule from the first event that counts. | Built | `dfa3bf38` |
| TS07 | A secure tool item shows the tool's own words as labels, without definitions. | Built | `db251fd7` |
| TS08 | Matrix Lab asks the reason on every "none" or "many" in solve mode, so the panel no longer hints which system is singular; where an item does not grade it, nothing is sent or scored. | Built | `3db1163d` |
| TS09 | A teacher's resume gives back the paused screen's wait (up to 5 s, once per pause). | Built | `702638cf` |
| TS10 | The VPAT says plainly who sets a timed test's limit (2.2.1). | Built | `c197d6d4` |
| TS11 | A tool's Work View task text is withheld where the method is withheld, outside a question too. | Built | `3c15f607` |

## Security and integrity (SI)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| SI03 | A Question Family pin's support must be one the student's profile grants (at the work's time or its arrival); otherwise the work is held for review, never graded as the supported version. | Built | `ada19371` |
| SI04 | An ask-my-teacher id always names one question (ids with `__` cannot collide). | Built | `6753d3c3` |
| SI06 | A deleted student's open tab re-creates nothing: rules require the roster row for the student's own writes. | Built | `9ea00673`, `4e51fce8` |
| SI07 | A Live Challenge finishing during a student's deletion never pays or reports them. | Built | `619b5259` |
| SI08 | The server holds Rush players to their device's pace (a too-fast attempt earns nothing and costs nothing); the classic question mounts at GO. | Built | `aaa29c5d` |
| SI09 | A moved student's old-class work is never creditable after the move, drafts stay in the outbox, and the cache is not cleared at sign-out: kept as built. | Decided | `ee3550da` |
| SI10 | The Recovery upgrade script refuses `--yes` outside the emulator. | Built | `2bb80453` |
| SI11 | `scripts/report-legacy-step-queue.mjs` (read-only) says whether the legacy Step Algebra step path (`requireStepWork`) can be retired; the switch is not flipped. | Script (not run) | `6de4e9b0`, `b70c206e` |
| SI12 | The submission envelope guard reads every depth, not six levels. | Built | `b250925f` |
| SI13 | Permanent deletion takes a student out of unfinished Live Challenge rooms' private round results. | Built | `defd74fd` |

## Teacher tools (TT)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| TT01 | After a teacher's answer the student may reopen the same question once (the first exchange is kept; Teacher Home lists it again). Not built: email or push notifications (a student's words would leave the app; needs a delivery service and has a running cost) and longer threads (a product call). | Built (part) | `f396447f` |
| TT02 | The Assignment Hub's Recovery readiness follows a question edit. | Built | `2f15ba90` |
| TT04 | Assignment Review lists systems and graph items that cannot work as written ("Questions to double-check"); advice only, no grading change. | Built | `04b63053` |
| TT05 | Case Review's recurring patterns are marked derived, and cut-short Recovery records are flagged. | Built | `c8798e79` |
| TT06 | Google Classroom's sign-in result leaves the address once shown. | Built | `8113469a` |
| TT07 | The Classroom topic style follows the teacher, not the browser (`teacherPreferences/{uid}`). | Built | `d15a737a` |
| TT08 | The compiler's import warnings reach the teacher. | Built | `5f0e8994` |
| TT09 | The support design's section 10 decisions are marked decided, each citing its code and test. | Confirmed | `33939c08` |
| TT10 | A reused assignmentKey is caught in Assignment Review, not first at Create. | Built | `fd889a47` |
| TT11 | An import with many exam-style questions no longer leaves the later ones unchecked: the server's own choice is checked where its 40-candidate budget ran out, and every question kept as written is named in the import warnings. | Built | `479732bb` |
| TT12 | A failed publish no longer leaves a new folder name behind. | Built | `a579e952` |
| TT13 | A held Recovery no longer offers "Issue a replacement" after the student's final submission date (the server refused it anyway); the advice says to extend the date first. | Built | `81314a55` |
| TT14 | Pre-Flight's hidden-hint and leaking-hint findings stay advisory (a readiness warning would hide the assignment from students). | Decided | `b0de3a62` |
| TT16 | TT16_ROW |
| TT17 | TT17_ROW |
| TT18 | TT18_ROW |
| TT21 | Pre-Flight counts its advisory findings for the teacher ("N suggestions below… Advice only"); readiness is unchanged. | Built | `b0de3a62` |
| TT22 | TT22_ROW |
| TT23 | TT23_ROW |
| TT24 | TT24_ROW |
| TT28 | Before release, a lesson that opens early by prerequisite shows its Classwork/Practice controls as the early students have them; opening one opens it for them now and for the class at release. Only lessons that carry a prerequisite are affected (older data: nothing sets one today). | Built | `03379041` |
| TT29 | Pre-Flight has a "Calculator for this lesson" control writing `toolPolicy.calculator`; the owner's precedence rules are unchanged. | Built | `5805219c`, `cb5b3375` |
| TT30 | The teacher's DOL control says "Still open for N students with extra time, until …"; names only behind a fold. | Built | `ac7c1792`, `475bba61` |
| TT31 | The teacher's Live Challenge console, question library and dry run show a sentence, not raw error text. | Built | `cbcb3a9e` |
| TT32 | The teacher's Path preview grades Digital SAT number boxes with the SAT decimal rules and scores with field weights and partial credit, as students' sessions do. | Built | `3bccfe9d` |
| TT34 | Printed worksheets say "Exit ticket" (done with NV13). | Built | `b231057a` |

## Test Cycle (TC)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| TC02 | A Retest's recorded mistakes are shown in the teacher's per-student view, including a Retest that stood in for a missed Test (W7 decision 19). | Built | `aa6812d8`, `e3521290` |
| TC03 | The bulk Test-day action moves a class whose day ran with nobody starting; it still refuses a class where anyone started. | Built | `f35aea4a` |
| TC04 | Deleting an assignment deletes the class sittings recorded for it (W7 decision 20). | Built | `7e51d897` |
| TC05 | Corrections name a systems-workspace point that lies on one line only. Not done: mistake detectors for algebra and Step Algebra items. | Built (part) | `63e18dd1` |
| TC06 | Corrections says Submit and what it costs, not "Check my answer". | Built | `85ebe711` |
| TC10 | `endedBeforeSet` stays for old Test-day data; the decision is written at the code. | Confirmed | `93233e21` |
| TC11 | A Corrections reflection reaches the student's teacher, and the student is told so. | Built | `2563da48` |
| TC12 | The named mistake stays visible while the class still tests (it is the student's own submitted error; instances are seeded per student) (W7 decision 21). | Confirmed | `feaa0a34` |
| TC13 | `scripts/backfill-test-cycle-evidence.mjs` gives past Tests the mistake evidence they were graded without: report first, then `--execute`. | Script (not run) | `2f1f2f47` |
| TC14 | What a past-date Test Cycle with no projection should be to a student is the owner's decision (W6 decision 14). | Needs a person | |
| TC16 | One helper says what to have for a Test (a charged device and the Test's own calculator rule) on the card, the assigned-Test row and an unfinished session. | Built | `a74701e1` |
| TC17 | A dropped connection keeps Try again however often it fails; Home's Review button no longer repeats the card. | Built | `38117f9c` |
| TC18 | A Test unlocks when every Review question is attempted and the mastery bar, if any, is reached: kept as built. | Confirmed | `de217a29` |

## Tools (TL)

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| TL02 | An author can give a static graph a different scale on each axis (`axisScale: { x: 2, y: 1 }`, as in the "Things Aren't Always What They Seem" sketch). A "Fix the scale" button redraws it on one scale, and a status line (read aloud too) says what each axis counts by. Printed worksheets draw the authored scale. Pre-Flight warns when the scale cannot be shown. No lesson uses it yet: an author adds `axisScale` to that figure and re-imports. | Built | `72807578` |
| TL03 | Matrix Lab `showExpansion: "fading"` (for Practice) shows the row-by-column terms for the first product cell, then offers "Show the multiplication for this cell" for the others. It never appears on an exit ticket, quiz or test. The finding's other Matrix Lab teaching ideas are not built. | Built (part) | `5337c5f6` |
| TL05 | Three behaviours are kept as designed: the Data Modeling Lab's estimate line starts pre-fitted, Controlled Sort says cards need to move without giving a count, and Systems substitution offers "Simplify first (optional)". | Confirmed | `fd70b609` |
| TL06 | The Undo defaults are kept: the work-bar Undo is hidden when a question has no history, ten tools' Undo history survives a reload, and Connect stays as "✓ Curve drawn". | Confirmed | `fd70b609` |
| TL07 | A question can name a reference sheet, and the work bar opens it beside the question, but no sheet is registered: the STAAR reference materials belong to TEA. The owner supplies the sheet as printed (with its edition), written clearance to reuse it, which questions get it, and how its figures are drawn. Then it takes one data file and one registry line. A sheet missing its source, clearance or screen-reader words is refused by test. | Needs a person | `38dc7c12` |
| TL09 | The V5 import keeps a Data Modeling Lab item's `causationSupported` as a real boolean. | Built | `344d0399` |
| TL10 | A full degree-6 dividend (seven terms) gets its long and synthetic division keys. A bad import such as x^100000000 is refused before anything is laid out, instead of freezing Pre-Flight or a server call for about six seconds. | Built | `f518a63f` |
| TL11 | A dependent or inconsistent 3×3 can be authored for substitution or student choice, not only elimination. The student reaches the statement with no variable and interprets it as after elimination, graded by the same rubric. A reduced 2×2 whose rows each hold a different single variable no longer strands a substitution student. **Grading change: deploy Functions before Hosting.** Left: Step Algebra has no native end state for "27 = 27", and the worked review for that path is not written. | Built | `391afdd6` |
| TL12 | Measured in a real Step Algebra at tool columns 520–1100 px: the cancellation box keeps "−9x + 21 − 21" on one line whenever its side has room for the terms. It wraps only on a side narrower than the terms, where they keep their size for slashing. The finding came from reading the width rule, not from a measurement. | Not reproduced | |
| TL13 | Desktop Work View no longer shows "About this tool" twice: Help holds the description, on phone and desktop alike. | Built | `c180ba8b`, `b8a75416` |
| TL14 | Every static graph, printed worksheet figures included, clips its curves to the plot and draws an edge arrow where a curve leaves the top or bottom; where two lines meet stays in frame. Blank graphs are unchanged. | Built | `682edab4` |
| TL15 | In a math field, Escape closes the keypad (or leaves the field); the next Escape closes Work View. Work View no longer treats a math field as an exception. The plane's hover readout still closes on Escape, and the keyboard sweep covers both orders. | Built | `8cb428a0`, `b33a4010` |
| TL17 | A flat turn on the calculator (such as (x − 3.14159)⁶ − 3) reads its minimum to its own rounding error, not the view's: it read 3.1416 or 3.142 depending on the window. Parabolas, cubics and corners take the old path unchanged; the 6,448-vertex sweep passes. | Built | `4f676949` |
| TL19 | A third point still replaces the nearest one, with no dialog and no wider pick-up radius, as decided. The student is now told which point it replaced ("It replaced (4, 0)"), and one Undo puts it back. | Built | `9a5b141b` |
| TL21 | Measured, and the "How to do this" fold stays above the first panel: it is 44 px, and moving it would bring the first control onto a phone's first screen for only 2 of 24 tools. The linear and matrix systems steps no longer tell the student how to decide the number of solutions. | Built | `846246e4` |
| TL22 | A bare group a teacher writes behind a minus, such as 5 − (x + 2), stays one term in the shared step splitter, so the student does the sign step. The verdict sweep (290,139 graded fields) and the answer-acceptance audit are identical before and after; no current item changes. | Built | `e3cb625e` |
| TL23 | The assessment keypad is titled by the keys it shows (a "graphing" setting with scientific keys says SCIENTIFIC); the √x toggle shows a keypad icon and the way-out key reads "move out →". On practice, π, e and logₐ appear only where the item's prompt, answers or worked solution use them (991 of 1,017 lesson questions drop all three); assessments keep every key. | Built | `7ce22aee` |
| TL24 | Already built: the Transformations Lab reviews and guides a line in identify and describe, and match handled it before. Putting the lesson's "left 3 lands on up 3" exploration back is lesson content. | Confirmed | `908ab6f2` |
| TL27 | On practice boards, once the student chooses which variable is 0, "Substitute 0" offers the intercept typed straight in; a wrong one sends the student to solve the substituted equation step by step. The teacher sees "set y = 0 and typed the intercept (no solve shown)". The server marks such entries, so Functions deploy with or before Hosting. | Built | `7b8df7f4` |
| TL28 | A board with one graph calls it "Graph", not "Graph 2", everywhere it is named; an empty typed pair says "Type the point first, as an ordered pair: (x, y)."; a wrong meaning shows a definition under it. The repeated locked-card buttons stay (a tested keyboard path), and snapping finer than 1/20 is not built (no board has such a point). | Built (part) | `8356667a` |
| TL29 | The number line inside the systems rewrite step says Check, never "Submit, uses 1 of 3 tries": its press only records the graph. | Built | `0db8662f` |
| TL30 | Points that lie exactly on a line read r = 1, not 0.999999. Within 1e-12 of ±1 now reads ±1; r = 0.99966 still reads 0.9997. | Built | `fdde2fcc` |
| TL31 | The Polynomial Workshop's "not simplified" message names what is left in the student's own answer, so a subtraction answer is no longer told to multiply out products (Spanish too), and the phone placeholders fit. The "duplicate" area-model message is the screen-reader copy, by design. | Built | `97e6a154` |
| TL32 | latexToExpression reads a braced power base back, so r²h survives the round trip (239 of 264 serialised powers now read back equal, 0 before). The verdict sweep (290,136 pairs) is identical before and after, and none of the repository's 23,644 TeX strings reads differently. | Built | `ca51979a` |
| TL34 | Inside the systems rewrite step the relation solver no longer shows its cancellation toggle, tooltip or "click two items" paragraph; the absolute-value lessons keep them. | Built | `91943c50` |
| TL35 | Every "Enlarge …" button now says "Open Work View", from one word, and the dialog keeps its name ("<figure>, Work View"). The Multiple Representations board's "Enlarge Graph N" and Scenario Match (a picture in a dialog, a different feature) are unchanged. | Built | `ff394a42`, `1665949b` |
| TL36 | 33 tool subtitles that named the method on practice are reworded to say what the tool does (for example "Solve A·X = B with matrix technology: X = A⁻¹B" became "Solve a matrix equation with matrix technology"); a test reads every subtitle under src/tools for the method. The other 40-odd subtitles already described the task. | Built | `550c2ce3` |
| TL38 | A point the student marks (an analysis intercept or vertex, a feature on the plane) is drawn teal, never red, by click, tap or keyboard. Identity colours that are not selections (the Sequence Explorer's second series, the plane's second line, authored default points) stay as they are. | Built | `5bec1057` |
| TL39 | A sequence question can write its terms as f(n): an authoring option, used by DOL #3 question 13 (Regular and Honors). It is a label only; grading is identical with and without it. Rule-writing questions keep aₙ, and the authoring check refuses f(n) there. The live review changes on re-import. | Built (part) | `3f337723` |
| TL40 | Reproduced: at 1366 px a six-term table was 573 px in a 472 px column, the fifth and sixth boxes behind the edge. The boxes are 56 px and the panels sit side by side only where the table fits, else they stack: no box behind the edge for 3 to 8 terms. On a 390 px phone a six-box table still scrolls inside its own box (every box can be focused into view; the page never scrolls sideways). | Built | `fb1b0066` |
| TL41 | Step Algebra's Simplify now names one slip, a sign left unchanged when removing parentheses after a minus (4x − 2(x + 3) typed as 4x − 2x + 6), only when the student's own line shows it term for term, fixing it would not put the answer on the board, and verdicts are shown (never in a quiz or exit ticket). It names the kind of slip and the rule, never a term or number. Other slips, and option 3 (support-level variants), are not built. | Built (part) | `c704cc48` |
| TL42 | A tool's Work View is named after the tool ("Matrix Lab, Work View"), not its id ("matrixLab workspace"). | Built | `90b099da` |
| TL43 | A 2×2 whose rows each hold a different single variable is solved row by row; the vertices step can be finished when the region has no corners; an all-diagonal 3×3 says at the start that it cannot be finished here, and Pre-Flight warns the teacher. Making the all-diagonal 3×3 finishable is not built (more than two hours; notes in the tests). | Built (part) | `d0cd3412` |
| TL45 | Step Algebra's absolute-value split now opens with: "Write it without the absolute value bars: pick Two branches (OR) or Three-part compound (AND), then type each number and choose each sign." It names the buttons and still never says which one fits. | Built | `cb42c253` |
| TL47 | The Undo history stays on the device. A student who moves to another Chromebook keeps the work, which rides the server backup, but starts with an empty Undo there. Carrying the history would push the synced record over its 16 KB limit. Recorded at the code. | Decided | `8962de7a` |
| TL48 | A workflow graph plots every row of its table: the 12-task cap is gone, and the server rebuilds the task list from the authored table. A grading change: a graph from a table of 13 or more rows now needs every row's point (before, rows 13 and up could not be plotted and the graph was marked right without them). Tables of 12 rows or fewer grade as before. | Built | `d3543c6e` |
| TL49 | The synthetic-division view accepts a fractional root (2x − 1 divides as x − 1/2), and the grader, solution review and Pre-Flight match. Items with a fraction root or a non-monic divisor, ungraded before, are now graded; every other item grades as before (checked over 100+ lesson versions). | Built | `9bc41ab2` |
| TL50 | 2×2 verification shows a side already written as a number (the 7 in x + y = 7) as given, as the 3×3 does, instead of asking for it again. The work still carries that number, so grading is unchanged. The systems journeys check it at Chromebook, iPad and phone sizes. | Built | `63f59047` |

# The 53 fixes


The owner chose "Do it" for 53 fixes. Seven of them are large; they are listed at the end of this section with what each needs.

| Id | Outcome | | Commit |
| --- | --- | --- | --- |
| AX04 | The accessibility report is refreshed against the code; its contact and sign-off lines stay blank for the owner. | Built (part) | `30312108` |
| AX06 | Formulas inside a Spanish translation are spoken in Spanish. | Built | `4abd8e9b` |
| AX11 | A filled math box says what it holds when focus lands on it. | Built | `49649b2d` |
| AX17 | A math box's placeholder can be read (4.8:1 light, 6.7:1 dark). | Built | `49e39031` |
| AX18 | Labels on bare spans, strongs and divs are read (40 places); the VPAT rows say so. | Built | `041e5950`, `c21d7544` |
| AX20 | Read aloud says (fg)(x) as "f times g of x". | Built | `1aabab51` |
| AX37 | Relation Mapping's choices are one radio group with a mark besides colour; My Math Path's choice cards too. | Built | `221d5f69`, `06ccde31` |
| AX47 | In Step Algebra a paired factor keeps keyboard focus. | Built | `369cc253` |
| CI04 | The family version check reads variants' own fields, notation and toolProfile. | Built | `a25128a7` |
| CI09 | The keyboard sweep covers the legacy question types (and Graph Scenario Match's scroll panes show their focus ring). | Built | `49506247`, `7d48d597`, `ba5d8579` |
| CI11 | The nightly throttled Warm-Up reopen runs as four jobs, inside its time limit. | Built | `960a4987` |
| CI12 | An emulated phone stays a phone through a full-page screenshot. | Built | `a6a95d26` |
| CT19 | Two squared-radical SAT items no longer print the undefined letters q, b and p. | Built | `89fb3f5a` |
| FB04 | The lesson's common error is said on the miss that makes it. | Built | `31a2eeb3` |
| FB24 | Workflow steps that follow a wrong choice say so, and restarted steps say why. | Built | `0d38067a` |
| GR20 | A repair gives back an attempt, never an attempt number. | Built | `69e5e8c4` |
| GR31 | System questions keyed { x, y } or by answer can be graded. | Built | `52f4af32` |
| GR33 | "3 1/2" typed with a space is the mixed number 3 1/2. | Built | `c01414af` |
| GR35 | Typed answers: quotients compared by factor, the authored tolerance used, keys with ², ³, · and × read. | Built | `6ba15028` |
| LC06 | A Live Challenge timeout or pause keeps the locked answer. | Built | `1e76c53d` |
| LC09 | Graph the Line honours a student's plan and keeps the race one race. | Built | `4f213f2b` |
| LC10 | Graph the Line keeps the last miss over a refresh, so it never reveals the answer early. | Built | `e07b3108` |
| LC12 | Graph the Line mastery evidence follows its own rules, switched off until the owner turns it on. | Built (part) | `333e7711` |
| MP09 | My Math Path and the modeling lab show students no raw error text. | Built | `bc31f0d5` |
| OP02 | A release loads the live site after Hosting and fails if it does not start. | Built | `8358df7a` |
| PH01 | At large text the Open Work View button takes a row of its own; nothing a student reads starts under it on a phone. | Built | `22d9ea28`, `36df2627` |
| PH02 | The answer box's example keeps its floor in text-size units. | Built | `22d9ea28`, `3665de45` |
| PH03 | The first screen of a question is the question, not its header. | Built | `fa3a3d87` |
| PH05 | The screen keyboard no longer hides the box being typed into. | Built | `67a53b65` |
| PH06 | Dividing Polynomials on a phone: a readable bracket, a table that fits. | Built | `d1c92f91` |
| PH07 | The 3×3 equation strip does not clip on a phone at large text. | Built | `9a97220c` |
| RT02 | A number box an older import stamped as a set box is read as a number. | Built | `a72f4ef8` |
| RT15 | A personalized question's numbers ride the workspace draft before the first Submit, so another Chromebook shows the same numbers; a question that waits for them no longer blanks the screen while its code loads. | Built | `325e43bd`, `ca0b22bf` |
| RT16 | No parser text reaches a student; the tray under a question is "Language tools"; Work View's caption is in student words. | Built | `71d7777a` |
| RT20 | After a deadline race the screen shows the attempt the server recorded. | Built | `2b9edc3b` |
| TL04 | One phrase for beginning again; every free final action says Check, not Submit. | Built | `bb3ee079` |
| TL08 | Data Modeling's final action waits for every part the question asks. | Built | `6fac8a07` |
| TL16 | The Step Algebra board is kept when the same problem is generated again. | Built | `a4ef79cf` |
| TL18 | The graphing calculator lists where two lines meet, traces by tapping, and keeps a student's lines for the whole assignment. | Built | `a83babea`, `dc24ad60` |
| TL20 | Graphing 2's reference-line mode draws the given line and never prints the slope; the Transformations Lab reviews and guides a line in identify and describe. | Built | `d377fa45`, `908ab6f2` |
| TL26 | The matrix calculator keeps its last results and reads an error once. | Built | `2a94b3c2` |
| TL33 | Relation Mapping's plot follows the theme. | Built | `84b52ed7` |
| TT03 | Absent students' weekly Path grades wait for the teacher. | Built | `43498aed` |
| TT20 | Parent Contact and the support report apply the Practice Pass waiver. | Built | `4a2f13d0` |
| TT26 | Ask my teacher follows a class handover, stays off the projector, and is kept a year. | Built | `d966c638` |
| TT33 | A teacher's lower Test Cycle grade reaches Classroom, and counts as work. | Built | `7f26582e` |
| AX05 | Figure descriptions in an authored Spanish translation. Under an authored Spanish translation, Read aloud now says the common figures in Spanish with the same numbers as the English: the coordinate plane while a question can be answered (every question graph and tool plane), and the two number lines. 87 of the 91 real items with a question graph would be read in Spanish (the other 4 have an author's English description); no exit ticket, quiz or test graph gives a position away. The Spanish is a hand-written pack loaded only when a reading is Spanish; nothing is translated on the device, and a figure without Spanish is read in English after a sentence that says so. Remaining: closed-question readings and the graph read-out (about a day), the 3D model and graph workspace (about half a day), screen-reader descriptions with lang="es" (about a day), and a Spanish-speaking teacher's review of the pack. | Built (part) | `3089f3ff` |
| AX10 | Tables a tool draws itself, published to Read aloud. Read aloud now reads the tables four tools draw: the Linear Table Workbench's rows, the Data Modeling Lab's residual table, the LMR board's given table and the student's table of values, and the Sequence Explorer's terms (DOL #3 review PR 3, 5, 11 and 13, lmr-pr-1, and 26 of the 31 Path Data Modeling families). A box the student fills in is read as what they typed, or "blank", never its answer. Remaining: Representation Match's card tables (inside buttons; needs a decision on how to read them, about half a day), the Regression Calculator's table and the LMR process-mode pickers (2 to 3 hours each). | Built (part) | `48f91067` |
| CT02 | Worked steps for the closed questions that show only the answer. Re-counted at 1,315; now 41. All 336 District DOL #2 review variants show worked steps once the task is closed, and the 832 secure District DOL #2 retest items (13 families, 64 versions each) show them in the released review: built on the server from the student's own issued item only after the results are released, each stated answer held to the key by the shared grader and by the grader that scored the student, and stored nowhere. The transformations family works its 14 description items (Algebra II Honors Module 1); a new perpendicular-lines family works 48 of Algebra I M2 T2 Lesson 3's 50 items (slopes of perpendicular, horizontal and vertical lines, every stated answer accepted by the part's own grader); and the 44 demo items have checked steps of their own. Nothing is stored, so classes that already imported a lesson get the steps with the next deploy. Remaining: 41 items in smaller groups (the L3 warm-up whose points appear only in the item before it, Corrections items drawn from the DOL #2 families, one Transformations Lab item). | Built (part) | `d6415b74`, `4969bb40`, `c9074c69`, `d0bd3f47`, `c34cbbd7` |
| MP07 | My Math Path tool contracts against the shared server graders. Parity tests now run every live Path item through both graders. The first divergence is moved: the Path reads a relation's typed domain and range as sets, as the lab and assignments do, so a range typed with a repeat ("-2, 2, -2") is right (no right answer turned wrong; stored mastery unchanged, since the Path grades only at submission). Still pinned as known, each needing a decision: systems answers' authored tolerance (the Path is the right one; the shared grader would change assignment grading), the typed line's intercept tolerance, and partial credit for relation and systems answers. | Built (part) | `42a20274` |
| RC01 | Recovery for static Warm-Up and exit-ticket questions no family recognizes. A new report counts, lesson by lesson, the Warm-Up and exit-ticket questions that have Recovery (scripts/recovery-coverage-report.mjs, pinned by a test). The most common uncovered shape (an Interval Number Line asking for the graph and the interval notation of a stated inequality, 5 questions in Algebra II Honors Module 1 Lesson 1) now has a certified Recovery family with four shapes and 76 to 1,584 versions each, graded by the server. Warm-Up questions with Recovery: 78 to 82 of 111, lessons ready 26 to 28 of 38; exit tickets 67 to 68 of 102. Live classes get it when a teacher approves Prepare Recovery. The next slices, cheapest first, are in the batch report (the baseline Multiple Representations file, about half a day; transformation-description boards, about a day). Fixed-answer conceptual multiple-choice items need an owner decision, since every fresh version would have the same answer. | Built (part) | `f83f25c9` |
| TS05 | The math editor and keypad in secure expression and equation fields. First slice: the shared grader now reads what the math editor writes for every expression and equation key a secure Test can issue, as it reads the typed key (1,008 keys typed into the real editor; the editor's spelling of 103 was refused before, 0 now). This is a grading change: 1,191 verdicts move from wrong to right, all right answers in the editor's spelling (equations with the editor's brackets and sides swapped, brackets round a fraction part or radicand, braced subscripts, log bases, the set-builder bar, ln over ln), and none from right to wrong over 300,855 graded. It already helps My Math Path, which collects these fields in the editor today. Secure Tests still show plain text fields: moving them to the editor needs a phone keypad with the letters a prompt uses and set notation (about a day and a half for expressions, about a day for equations), and an owner decision on how the editor's stacked division binds. | Built (part) | `b37c3978` |
| TT27 | Accessibility checks over the teacher screens. Twelve scenes of seven teacher screens (Home, Live Class, the Assignments list, the Assignment Hub, the Gradebook, Pre-Flight, the Live Challenge console) are now audited at 1366x768 and 390x844 by axe, the contrast review and a new keyboard Tab walk, and held at zero by the accessibility ratchet in CI. Before: 305 failing nodes (Live Class student tiles were buttons around buttons; in every dialog, Tab on a disclosure sent focus back to the top), 3 contrast failures and 8 needs-review nodes; after: 0. Four small fixes: the shared Dialog lets Tab move on from a disclosure, the Live Class tile's name row is its button, Pre-Flight's header subtitle reaches 4.5:1, and the Warm-Up timer select is named once. The VPAT's teacher row says what is covered. Slice 2: the assignment card's ⋮ menu and the class list share one keyboard behaviour (arrows, Home and End move; Escape and choosing return focus to the button), Live Class's Room, Walkthrough and Attention are tabs with arrow keys and a tab panel, and the teacher workspace has a skip link and one main landmark, so a keyboard teacher reaches a screen's content after 1 Tab stop instead of 25; two new audit scenes open the menus. Remaining: three states that still draw a second main landmark inside the workspace (the Test Cycle student preview, a running Demo Experience and a Path Simulator session; a small opt-out on two student components), the other 18 teacher screens and the administrator workspace (about 2 to 3 days), 200% text, 320 px and target size on teacher screens, and a screen-reader pass. | Built (part) | `e798fea3`, `9a9485d6`, `e0ec38de`, `39851283` |

## Found along the way

Problems the batches found while doing their items, fixed in the same pass:

| What | Fix | Commit |
| --- | --- | --- |
| The Review dialog rebuilt Pre-Flight's whole model on every edit: 5 to 8 seconds a click for a 40-question review. | A Question Family's capacity and a question's generation audit are kept per content. A rebuild on unchanged questions takes about 0.4 s, and an edited question is checked again. | `b7e3331d` |
| A literal-equation question with no `solveFor` said "Focus on: Expression for undefined." | The label falls back to "Your answer", and the grader's box name never prints "undefined". | `2254fc49` |
| Teacher screens scrolled smoothly even when the device asks for reduced motion. | They use the shared reduced-motion check. | `e7027140` |
| The Algebra I L3 Honors file (TT18) kept the two slope hints FB03 reworded. | Regenerated from the Regular file by its builder. | `f187b66d` |
| The support evidence report's test fixture assumed weekdays-only deadlines after TT17 made "next school day" skip the district's closed days. | Fixture moved, and a new check pins the calendar rule in the report. | `10b5d0b8` |
| Assignment Review's Delivery step was 654 px wide on a 390 px phone, so the whole review scrolled sideways (a fieldset is as wide as its widest content unless told otherwise, here the Adaptive preview's table). | The Review's fieldsets may shrink; the preview's table scrolls in its own box. The Practice Passes journey now checks the step on a phone and runs in CI. | `6f0de4c4` |
| Simplify's part box said "Check the sign" for a product or fraction off only by its sign, in exit tickets, quizzes and tests too; on a last step (x = (−2)(3) typed as 6) that is the answer. | Where the activity withholds verdicts, a refused part says only that it is not equal; practice keeps its coaching. | `13cbb3af` |
| The District DOL #2 builder no longer reproduced its review file: an earlier grading fix (intercepts compared as ordered pairs) had been made by hand, so a rebuild would have taken it out of 98 fields. | The builder writes it; a rebuild now reproduces the review and the secure seed byte for byte. | `b8396d19` |
| In Graphing 2 the plane jumped up 18 px after the first point, on a Chromebook and a phone: the instruction above it went from two lines (three on a phone) to one. A quick second click could land a grid step away from where it was aimed. The hand-run plotting check had gone stale and could not see it. | The instruction keeps the room of its longest wording, so the plane stays put (measured: 18 px to 0 on both devices). The plotting check was repaired, now checks that the plane stays put, and runs in CI. | `644ae36a` |
| Algebra II Rational Exponents (regular and Honors) and Dividing Polynomials drew their mathematics badly wherever a student read it: "y^(1/7)" as "y^(" then a stacked fraction then ")", part labels with only the bracket raised, a fraction inside a fraction as LaTeX code ("\frac{2}{y + ½}"), and "x^(1/3)/x" as x to the power (1/3)/x. Students who missed a question there read the worked solution this way. | Powers with fractional exponents and nested fractions are typeset whole, and typeset labels use braces; the lesson's "x^(1/3)/x" wording is now "(x^(1/3))/x" (three keys, proven to grade every answer exactly as before). Over 4,799 lesson strings: code shown 45 to 0, stray carets 318 to 0, broken superscripts 364 to 0. A sweep keeps all lesson files at zero. | `29d4e718` |
| Radical Expressions (regular and Honors) drew 42 lines as different mathematics: "√3/3" as √(3/3), "x√(xy)/y⁴" as x(√(xy)/y)⁴, "5/x²" as (5/x)², in the lesson about simplifying radicals. Its sort cards (30 across five lessons) showed keystrokes such as "1/x^(1/2)". | On screen a radical keeps its index and radicand and a superscript its base (grading unchanged; its radical-form grader already read these as written). Sort cards named by their mathematics are typeset and spoken as mathematics. | `caf21f02`, `bd09ed57` |
| The CI browser check for fraction templates still expected the behaviour two owner decisions replaced (GR33: "3 1/2" typed with a space is the mixed number 3½; GR13: a reduced mixed number is in lowest terms), so it failed six checks on this branch. | The check now tests the decided behaviour on a Chromebook and a phone, and the case the guard must still hold (3 2/4 is held, with the reason, before a try is spent). | `ffd5b154` |
| Two CI browser journeys for the Data Modeling Lab pressed Submit with judgments unanswered, which TL08 had made impossible (Submit waits for every part), so they timed out on this branch. | They check the decided behaviour: Submit waits, nothing is graded, and the lab says what is still to do; answered, each judgment is graded right. | `dce60426` |
| Three more CI browser checks still expected screens two items had changed: Matrix Lab's product sort and the choice-group keyboard check looked for "Figure 1" on text-only cards, which FB16 names "Card 1", and a feedback check pressed a button that VH-12 made a radio choice. They timed out on this branch. | Each looks for what the item built, and fails if the old wording comes back. | `e64dc060`, `b564de6f` |
| The display took a function's bracket apart: A2.5D's exact answer ln(3)/ln(2) showed as ln·(3/l)·n(2), log₂(8)/3 as log base 2 of 8/3 (a different number), 1/f(x) and y(4)/y(1) as a fraction beside a bracket, and "a/(x − h)² is positive" (A2.6K) as the whole fraction squared. Stacked, ln was also drawn as two italic letters. | On screen and in the worksheet PDF a call keeps its name (ln, log, sin, cos, tan and the rest, and one-letter functions such as f(x)), a bracketed denominator keeps its power, and function names are drawn upright. Grading unchanged. | `68fe86b1` |
| A closed question's step list printed a sort's answer as "[object Object]" and a choice step's answer as the choice's id ("a"); with Algebra I M2 T2 Lesson 3's new worked steps these sat right under the steps. | A sort lists each card or figure with its category, a choice step names the choice's words, and a sort of text cards is titled as one. | `cf353738` |

# Deploying this work, and what only the owner can do

Nothing here has been deployed. Order:

1. **Firestore rules** first. They cover SI04 (Ask my teacher assignment ids), the SI security batch, TT07's new owner-only `teacherPreferences/{uid}`, and SI02's `assignmentKeys/{assignmentId}` (teachers read; no browser writes; it must be live before the `shadowAssignmentKeys` trigger).
2. **Cloud Functions** (the whole fleet), before Hosting. Items that need the server first:
   - Grading: TL11 (dependent or inconsistent 3×3 by substitution), GR26 and GR27 (step labels and step-state keys), the GR21/GR22 regrade paths, and FB08's composed-step reasons.
   - Test Cycle: TC03 bulk Test day, `setTestCycleReducedItems` (TC15), `manageAssignmentLifecycle`, `getTeacherTestCyclePlans`, `submitTestCycleCorrectionResponse`, and the secure corrections diagnosis.
   - Security: SI03 ingestion and finalizer, SI06 deletion and presence, SI07 Live Challenge finish paths, SI08 rush attempts, SI13 deletion scrub.
   - Teacher: NV15 (the override callable writes the reason label), TT17 (calendar-aware "next school day"), TT23 (Classroom re-send after a support-profile change), `loadStudentCaseEvidence`.
   - Student: TS09 resume grace, FB21 `loadMyReviewWork` (either order is safe), PF03 (the Test review's 30-second check), the Path week-key guard.
   - TL32 (`latexToExpression`, also read by the server's tool graders): no verdict moves; any order.
   - Tools grading: TL48 (a workflow graph needs every table row: deploy Functions and Hosting together, since a new server with the old client cannot plot rows 13 and up of a long table), TL49 (fractional synthetic roots graded), TL43 and TL31's server parts (either order).
   - SI02 (answer keys in shadow): the new `shadowAssignmentKeys` trigger copies each assignment's keys into `assignmentKeys` when its sections change. Nothing reads the copy yet. Deploy it outside class hours, after the rules. Rollback: `firebase functions:delete shadowAssignmentKeys --region us-central1`, then remove the export. Backfilling existing assignments (P1-6) is a separate owner step, not built.
   - Tools: TL27 (the Multiple Representations board's typed intercept, `lmrProcessVerify`): deploy Functions with or before Hosting, or a typed intercept is refused at grading. TL22 and TL28's server parts can go in either order.
   - Content generation: CT14's two new generator words (`plural`, `yshift`) are in `functions/shared/pathQuestionGeneration.mjs`. Deploy Functions, and run the path-admin runtime sync, BEFORE the SAT/ACT/TSIA2 bank refresh that writes CT14's and CT18's templates: an older generator prints an unknown word as a bare number ("translated 2 unit2 to the right").
   - Live Challenge and rewards: LC22 (the standings every student can read leave three or more unshown), LC23 (`redeemPracticePass` and `getStudentRewards` record expired passes).
   - `adjustLiveChallengeExperienceScore` is no longer in the source (LC23). A whole-fleet `firebase deploy --only functions` offers to delete it: yes is safe, since it does nothing for any write the current code makes; no keeps it, harmlessly. To delete it on purpose, first confirm the live build carries b1296852 (`node scripts/release-firebase.mjs --whats-live`), then `firebase functions:delete adjustLiveChallengeExperienceScore --region us-central1`. Keep the `experienceSpeedAdjustedRound` write in `submitLiveChallengeResponse` until it is gone.
   - **MP06 (the Path week turns at midnight Monday Central): deploy Functions and Hosting together, outside Sunday 6 pm to midnight Central.**
   - The large items' server parts: TS05 (the secure grader reads the math editor's spelling of every expression and equation key; shared answer equivalence), RC01 (the shared family registry and the certification responder; live classes get the new Recovery only after a teacher approves Prepare Recovery) and MP07 (the Path reads a relation's domain and range as sets: Functions and the path-admin runtime sync), and CT02's released DOL #2 retest steps (`getStudentSecureExamReview`, which builds them only after results are released and stores nothing). PF01 moved small pieces of three shared modules into files of their own (`functions/shared/pathToolIds.mjs`, `questionRepresentation.mjs`, `hashString32.mjs`) with no behaviour change, so a release also plans Functions and path-admin for them; that is safe.
3. **Hosting.** It carries everything else, including the display fixes (29d4e718, caf21f02, bd09ed57, 68fe86b1), Graphing 2's steady line (644ae36a), PF01's smaller first load, Read aloud in Spanish and tool tables (AX05, AX10), the teacher-screen accessibility fixes (TT27), the District DOL #2 worked steps (CT02) and Practise one like this (FB19). `functions/shared/stackDivisions.mjs` changed only behind its display option, which no Function passes.
4. **Check before or at deploy:** `platformFlags/liveChallengeServerSweep.finishAbandonedGames` (LC05) must not hold a non-true value.

## Content that reaches students only on re-import or publish

- FB02: the five regular Algebra II lessons (46 "Watch out" lines). A maths teacher should skim the wording; the maths was checked.
- FB03: the reworded l3-pr-4 hints (Algebra I M2 T2 L3, Regular and Honors).
- FB05: two family-generated Warm-Ups.
- TT18: the Algebra I L3 Honors file is new; teachers import it.
- CT19: the live SAT squared-radical items keep their old wording until the usual bank refresh.
- GR21: students get family version 4 only after a Path release is published.
- Content batches CT01–CT21 (lessons and banks): re-import or release build as each row says.
- CT21: the Algebra II Honors DOL #2 review (its eight solving cards now carry their equations); CT18: Rational Exponents Honors (a different SAT item). Classes that already have them re-import.
- TL39: the Algebra I DOL #3 Review (Regular and Honors) writes question 13's terms as f(n) after a re-import; grading is the same either way.
- CT15: the linear families' version 3 applies only where a slot opts in with "version": 3.
- Rational Exponents (Regular and Honors, 29d4e718): the rewritten keys and lines reach classes that import the lessons after the deploy. Classes that already imported them keep their copy's wording; the renderer fixes reach them with Hosting.

## Operator scripts (read-only first; the write step is separate and not run)

- GR23 and GR25 report scripts, and GR23's upward-only re-grade step.
- MP19: removes pre-#456 Path choice misses from mastery (as not attempted).
- CI17: `node scripts/audit-systems-shapes.mjs --project <id>`.
- SI11: report of queued legacy Step Algebra steps (do not flip the switch).

## Needs the owner

- OP07: a staging Firebase project (create it and send its config).
- SI01, OP01: need the owner's Firebase credentials.
- TL07: reference sheets (`REFERENCE_SHEETS` is empty): supply each sheet and its clearance.
- TT17: later school-year calendars (2027–28 onward) for the deadline rule.
- TT22: Spanish authoring for teacher-written hints and worked solutions.
- GR17: the field-level opt-outs to turn on, if any.
- AX01, AX03, AX14: a human screen-reader pass. AX04: the VPAT's contact and sign-off are blank.
- MP04: the Grade 6–8 Path bank review and authoring.
