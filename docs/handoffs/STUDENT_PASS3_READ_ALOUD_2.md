# Student pass 3, wave 7 (W7-5): Read aloud reads what the question shows; "Let's back up" only where written

Branch `claude/pass3-read-aloud-2`, cut from `claude/modest-pasteur-xzagn7` at `530ac3cf` (`main`).
Nothing here deploys, writes to a production project, sends text to an outside service or re-grades.
Student words follow D9 and wave 6's word list; no string outside this scope was swept.

Each item was first reproduced on the base: item 1 and 3 in Chromium through the real QuestionEngine
(`feedbackTeaches.html`, the speech engine recorded), item 2 by counting over every real lesson.

## 1. Read aloud skipped tables, graphs and what a tool draws

**Saw (base `530ac3cf`).** Read aloud (the work bar's Read, the tray's Read aloud and "Hear one part again") said
the prompt, "Information you need", the matrices, a step and the fields — and nothing of the figure the question is
about. On the real District DOL #1 graph item (`q_section-4_4_1`) a read-aloud student heard "The graph shows a
function over a restricted set of inputs … State the domain. Step 1 of 2: State the domain." — no graph. On the real
fillable table (`l2-cw-9`) they heard "Complete the table." and none of its rows.
Source: `STUDENT_PASS3_READ_ALOUD_TRANSLATE.md` "Not done".

**Changed.**

- **One table, for the screen and the reader** — `src/platform/question/displayTable.js` (new, pure):
  `displayTableFor(question, { editable })`. QuestionVisual draws its read-only table from it (its old private
  `normalizeDisplayTable` moved here unchanged), and TableGrader's fillable table is read from it. A cell the student
  fills in (`table.answers` / `table.blanks`) is `null` — never its value, even when the row data holds the answer.
  The one visible change: a read-only table whose `answers` key names a cell now shows "—" there instead of that
  cell's value (no real item has this; it would have shown an answer key).
- **Figures say what they already say** — `src/platform/language/figureReadings.js` (new): a small port, the same
  shape as Work View's capability port. A figure renders `<PublishFigureReading entry={…} />` beside the description
  it already gives a screen reader; QuestionEngine collects the entries (`FigureReadingPortProvider` around
  `renderModule()` only, so a "Practice like this" item or a review beside the question is not read as part of it).
  An update keeps its place; an unchanged entry returns the same state (nothing re-renders); the enlarged Work View
  copy of a figure is read once. Publishing figures: GraphDisplay (its description and its visible caption), the
  shared CoordinatePlane (every tool plane), the interval number line, the legacy pick-a-point line, the 3D
  three-plane model, the legacy graph workspace; QuestionVisual and TableGrader publish their tables.
- **The reader** — `questionReading.js`: `tableReading` reads by rows with headers ("A table, 5 rows. Columns: x;
  f of x; c of x; input of d; d of x. Row 1: x, negative 2; f of x, negative 2; c of x, blank; …"). A comma between
  header and value ("x −2" was heard "x minus 2"); a column headed `c(x)` is "c of x", never "c times the quantity
  x"; a unit "($)" is "(dollars)" (two of them paired as formula delimiters). Tables and figures come after the
  question's own material and before the step and the fields, and each is a part the tray lists ("The table",
  "Question graph", …). Spanish for the reader's own words ("Una tabla, de 5 filas.", "Columnas", "en blanco").
- **The rule.** A figure's text is its own description, so it follows the figure's rule: while the question can be
  answered, the kinds of marks only ("1 curve. 1 open dot and 1 closed dot. Positions are not read out while this
  question can be answered."); positions only once the question is closed (`positionsReadable`). Read aloud cannot
  say more than the figure would.

**Proof.**

- `tests/platform/readAloudFigures.test.mjs` (new):
  - the real fillable table: every cell to fill is blank, headers and rows as above;
  - a table whose row data holds the answer still reads "blank" (fillable and read-only);
  - headers shape, caption, money and Spanish;
  - order of parts; the host's state rules (place kept, same state when unchanged, the enlarged copy read once);
  - **the leak proof over every real DOL/quiz/test item with a graph (6):** GraphDisplay is rendered (Vite SSR)
    open and closed with the graph the screen draws; open, the reading carries "Positions are not read out" and
    matches no coordinate, crossing, "through", "between", corner or turning point; closed, the same graph's
    description does match (so the check can fail);
  - the wiring: each of the 8 figures publishes the same variable it renders as its description.
- `tests/browser/readAloudTranslate.mjs` (extended), 1366×768 and 390×844: on the real DOL item, the work bar's Read
  says the graph's description, before "Step 1 of 2", with no position, and it is the text of the figure's own
  `[data-graph-description]`; on the real table, rows with headers, all 10 cells to fill "blank", and "The table"
  heard again alone from the tray. No sideways scroll.

## 2. HELP-19: the generic "Let's back up" step

**Saw.** After two misses an inclusion student's work was covered by "Before continuing, should you revise the
specific parts identified in the feedback? Yes / No" (or the type's generic step); "No" answered "Try the other
choice." On every real item no family claims. The region (renamed in an earlier wave) announced "Let's back up",
the eyebrow said it again, the heading opened "Let's back up. …" and Read aloud added it a fourth time.

**Changed.** `backUpStep.js`: `backUpStepWritten(step)` — authored, or built by the question's family from the item's
own structure. QuestionEngine shows the overlay only then (`scaffoldRequired`). The platform step is still returned
(an older attempt may have recorded it; `supportUseMemory.js` reads its source) but no longer shown. The heading and
the reader drop the family prompt's leading "Let's back up." (`backUpQuestionText`, in `questionReading.js`): region "Let's back up", heading
"Which axis do you read the domain along?", Read aloud "Let's back up. Which axis …" once.

**Count** (every real lesson: teacher-import-jsons, docs/assignments and the sample, compiled; 265 Warm-Up,
Classwork and Practice items — assessments never show it):

| | Before | After |
| --- | --- | --- |
| Step written for the problem (family) | 157 | 157 — keep it |
| Generic platform step | 108 | 0 shown — lose it |
| Authored | 0 | 0 |

Those that lose it, by type: multiAnswer 44, matrixLab 21, systemsWorkspace 20, transformationsLab 8, figureMatch 7,
graphChoicePreview 4, representationMatch 4. (teacher-import-jsons alone: 141 keep, 76 lose, of 217.)

**Proof.** `readAloudFigures.test.mjs` (the predicate; over the real lessons no shown step is the generic sentence;
the gate in QuestionEngine; the heading and the reader say it once). Browser (`readAloudTranslate.mjs`, an
inclusion student at both viewports): a family item shows the step, its heading is the question, Read aloud says
"Let's back up" once and first; an item with no written step (`?q=plain`) gets no overlay after two misses and no
generic Yes/No.

## 3. Marks a tool draws on the shared plane

**Saw.** The plane said "It also shows marks drawn by the activity that are not listed here." for the Complex Plane
segments, the sideways parabola and the inequality regions (`STUDENT_PASS3_FIGURE_DESCRIPTIONS.md` "Not done").

**Changed.** CoordinatePlane takes `toolMarks: { kinds, features }`; `describeCoordinatePlane` picks by its own
detail, so a tool cannot say more than the plane would (kinds while open; features once closed, else kinds; with no
words the old sentence stays). Now:

- Complex Plane: "A segment joins the origin to each point." (its points and their labels are already read).
- Parabola Lab, sideways: "1 curve." open; "1 curve, opening to the right." once closed. An upright parabola now
  passes no `children` (it drew nothing), so its plane no longer claims undescribed marks.
- Systems Workspace inequalities: "1 shaded region, where every inequality is true." (the legend's own words) or
  "No region is shaded yet." — no corners.
- Student-built inequality graph (`src/tools/systemsWorkspace/inequalityGraphMarks.js`, new, pure, the same rules as
  `InequalityGraphLayers`): "Boundary line 1: solid. Boundary line 2: its style is not chosen yet. One side of each
  of boundary lines 1 and 2 is shaded. The overlap of the shaded sides is hatched." — the student's own work, never
  where, never which side, never whether it is right.

Since the plane publishes its description (item 1), Read aloud says these too.

**Proof.** `readAloudFigures.test.mjs`: the selection rule, the fallback, the positions-withheld sentence when only
tool marks are drawn; the inequality text, with no position or side; the four tools' wiring; a CoordinatePlane
rendered (SSR) with a tool's children carries the words in its own description.

## Mutation checks

Each new assertion was broken once in the code, seen red, restored.

- Node, 19 of 19 red: table blanks dropped; the graph's detail forced to `features`; `figures` unwired from the
  reader; the HELP-19 gate dropped; the heading back to the full prompt; the reader's "once"; the unchanged-state
  rule; the comma; dedupe; `backUpStepWritten` true for anything; QuestionVisual's publish removed; "c of x"; the 3D
  model's published text emptied; tool marks — features while open, the kinds path dropped, the withheld sentence,
  the plane's prop, a shaded side named, the overlap dropped.
- Browser, 2 of 3 red: `figures` unwired (graph and table checks FAIL); the HELP-19 gate dropped (the plain item's
  overlay returns at both viewports). The third — TableGrader reading the raw rows — stayed green because the real
  table's row data holds no answers; that guard is proven in node (a table whose rows hold the answer, red under the
  same mutation).

## Gate

Run on the final code (`81c41f80` for the browser drivers; the node gate on `87a86cf0`, which differs only in
lint-only test edits). Browser drivers one at a time, nothing edited while they ran.

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | ok |
| `npm run test:platform` | 12127 / 12127 pass |
| `node --test tests/tools/*.test.mjs` | 1710 / 1710 pass |
| `npm run lint` | 0 errors; no warning in a file this branch touches |
| `npm run build` | ok |
| `npm run build:firebase` | ok, no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs --report` | within baseline. **studentHome 839.5 KB**, **signIn 291.9 KB** gzip. The base built on the same machine: 839.4 / 291.8. This branch adds **+0.1 KB** |
| readAloudFigures, readAloudAndTranslate (unit) | 12 / 12, 22 / 22 |
| emulator suites (`test:rules`, `test:challenge-finish`, …) | not run: no `functions/`, rules, indexes or persistence touched |
| plain Vite :5199 — readAloudTranslate, mathSpeech, graphDescription (58/58), figureDescriptions, accessiblePrimitives, assessmentLeakGates, stagedQuestion, feedbackTeaches, renderStability, systemsWorkspaceStudio, toolAttemptOutcome, composedOutcomePolicy, workViewReference, planePhoneReach, toolPolicyGates | all passed |
| emulator-config Vite :5199 — hostAccessibility | passed |
| `npm run certify:accessibility` (app harness :5188 + :5199) | passed, 11 screens × 2 viewports, no new or increased violations |
| studentAccessibleNames (app harness :5188) | passed |
| teacherWorkflow harness :5188 — warmupReopenJourneys (answers the back-up step when it appears) | passed |

**Fixed during the gate, so you know.** (1) `familyClosedRender` caught an import of mine placed inside a multi-line
import (`StudentBuildInequalityMode.jsx`): the inequality build mode could not load. Fixed in `2e996ea2`, and the
whole gate was rerun. (2) The first budget run measured +1.6 KB. `questionReading.js` imported `backUpStep.js`,
and with it the question families, for one regex, which moved shared chunks onto the first load. The helper moved
into `questionReading.js` (`a6c9a8fa`), and the cost went back to +0.1 KB. (3) That move changed one import line, which
`readAloudAndTranslate.test.mjs` pinned as text. Following the playbook, the assertion now checks for the import by name, and it
was mutation-checked (`87a86cf0`). (4) `hostAccessibility` needs the emulator Vite config (its header says so). Run
on plain Vite, it timed out on the recovery scene. On the right server it passed.

## Deploying (not done)

Only `src/**`, `tests/**` and this doc: no `functions/`, no `firestore.rules`, no indexes, no Firebase config.
**Hosting only**: `npm run build && npm run build:firebase`, then `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run
deploy:hosting` (or `node scripts/release-firebase.mjs --since 530ac3cf`; expected targets: Hosting).

## Decisions for the owner

1. **HELP-19 removes the step from 108 of 265 items** rather than writing one for them. An inclusion student on a
   Matrix Lab, Systems Workspace or plain multi-answer item without a family now goes straight to the next try with
   the hints and miss messages the platform already gives. Writing steps for those types (authored `scaffold`, or a
   family that reads their structure) is the way to give them one back.
2. **Read aloud of a figure is English** even when the screen shows an authored Spanish translation: the plane's
   description is English generated text (the reader's own words — "Una tabla", "Fila", "en blanco" — are Spanish).
3. **A composed graph's name is its step's label** (WorkflowRunner names the stage figure by the stage prompt), so the
   DOL item reads "State the domain. x from …" before "Step 1 of 2: State the domain." Renaming it is WorkflowRunner's
   call (not changed here).

## Touched outside this scope

- `src/QuestionEngine.jsx`, four small regions: the back-up memo moved up to the overlay gate (~944–949), the
  figure state and the reading memo's `figures` (~1145–1160), the port around `{renderModule()}` (3236), and the
  overlay's heading (3252). Two import lines.
  Nothing near W7-2's ~2858 or W7-4's ~2776. No `App.jsx` change.
- Figure components, one publish line each beside their description: `GraphDisplay.jsx`, `CoordinatePlane.jsx`
  (plus the `toolMarks` prop), `IntervalNumberLine.jsx`, `NumberLine.jsx`, `ThreePlaneWorkspace.jsx`,
  `InteractiveGraphWorkspace.jsx`; `QuestionVisual.jsx` and `TableGrader.jsx` (the shared table model).
- `graphDescription.js` (`toolMarks`), `ComplexPlaneLab.jsx`, `ParabolaGeometryLab.jsx`, `SystemsWorkspace.jsx`,
  `StudentBuildInequalityMode.jsx` (item 3).
- `esSupport.js`: **no entries added.** Every new student sentence here is the reader's own words, which carry their
  Spanish in `questionReading.js` (as before), or figure descriptions, which Translate does not cover.
- `tests/platform/readAloudAndTranslate.test.mjs`: one import assertion, rewritten as above.
- Test harness `tests/browser/feedbackTeachesMain.jsx`: fixtures `dolgraph`, `table`, `plain`, profile `inclusion`.

## Not done

- Tables a tool draws itself (Sequence Explorer, Representation Match, Data Modeling, the Regression Calculator, the
  Linear Multiple Representations board) are not published; their planes are.
- A closed question's inequality region does not read its corners (the plane could, from `regions`; the tool draws
  its own polygon).
- MathText's hidden English formula speech inside a Spanish translation (unchanged, outside this lane).
