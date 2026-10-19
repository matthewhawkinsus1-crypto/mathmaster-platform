# Student pass 3 — Batch 6, session F: Read aloud and Translate that work (HELP-3, HELP-6 / H-115, speech)

Branch `claude/pass3-b6-read-aloud-translate`, on `claude/modest-pasteur-xzagn7` at `a7dddc7`.
Nothing here deploys, writes to a production project, sends text to an outside service or re-grades.
Student words follow D9 ("tries", "Work View"); no string outside this scope was swept.

## Per item: what a student saw → what changed → proof

### 1. HELP-3 — Translate was a dead button for every language

**Saw.** A Spanish-speaking student tapped Translate beside a miss message, a hint, the "Let's back up" step or a worked
example and read "A translation is not available for this text yet." Every time: the Spanish pack held only ~120
prompt-direction sentences, and none of MathMaster's own support sentences. In any of the other 17 languages nothing
ever translated. The failure was not recorded.

**Why.** `SupportedText.jsx` offered Translate to every entitled student and only looked up a translation after the tap.
The lookup (`translationProviders.js`) has two providers — an authored translation on the item (prompts only) and the
curated pack (`packs/es.js`, the only pack). There is deliberately no machine-translation provider: AGENTS.md and the
provider's own header make sending student items to an outside service a privacy and cost decision for the owner. So
the platform had nothing to translate support text *with*.

**Changed.**

- **Spanish content** — `src/platform/language/packs/esSupport.js` (new, loaded with `es.js`, still its own lazy chunk:
  37.6 KB gzipped, only for students entitled to Translate). Curated templates for the platform's own support sentences:
  every misconception message and generic miss message, the generic hints, the attempt outcome ("Not quite.", the
  tries-left sentence in both the "attempts" and "tries" wording, the closed-question sentences), every "Let's back up"
  step and its choices, the question families' hints and worked examples ("Try a similar one"), and the plain spellings
  the families use when a numbered hint would show an answer. Mathematics stays in slots and is never translated.
- **Coverage over real content** (before → after, all 0 before):
  real lessons' family hints 594 of 602 texts full (the other 8 quote a lesson's own story, which is the lesson's text,
  not the platform's); back-up steps 168/168 + 86/86; worked examples 155/155; misconception and generic messages
  27/27; and every hint, back-up step and worked example of all 12 platform question families over 128 generated
  instances. Teacher-written hints: 4 of 168 (the rest honestly stay English).
- **Never a dead button** — `SupportedTextActions` looks the translation up as soon as the text is shown
  (synchronously once the student's pack is loaded: `resolveTranslationNow`). Translate appears only when it will show
  the student's language; partial coverage says "Some sentences are still in English." Otherwise, one plain line in
  its place: "No Spanish translation for this text yet." (a sentence the pack does not know, such as a teacher's hint),
  "Translate isn’t available in Vietnamese yet." (no pack), or "Spanish could not load right now, so this stays in
  English." The unavailability is recorded as `translation` / `unavailable` evidence with `{ language, reason }` (only
  fields firestore.rules accepts).
- **The math guard** — `translateWithPack` still re-reads the output for the source's mathematics; for a curated
  template it also accepts the proof the slots give (every source token exactly once, `unmaskMath`) together with a
  template whose own words carry no mathematics (`templateWordsCarryNoMath`). Re-reading Spanish could not tell the
  conjunctions "y"/"o" from a variable beside a symbol ("< y >", "el cambio en y") and refused correct sentences.
  `mathSafeText.js`: in Spanish "eje x", "coordenada y", "valores de x", "términos en x" are vocabulary (as English
  "x-axis" is one word) — never the singular "valor de x", which is the variable; and a hyphen joining a math span to a
  word ("$x$-terms") is part of the word, so it is no longer read "x minus terms" or carried into a slot as "x-".
- Read aloud of a translated support text speaks the Spanish with a Spanish voice (unchanged path, now reachable).

**Proof.** `tests/platform/readAloudAndTranslate.test.mjs` (miss messages full and math intact; real-lesson and
platform-family coverage; the honest line and no button for a teacher's hint and for Vietnamese; the recorded
evidence passes `normalizeEvidenceDetails` unchanged; nothing calls an outside service). `tests/browser/readAloudTranslate.mjs`:
a family hint shows in Spanish (`lang="es"`), Read then speaks it in Spanish; a teacher-written hint shows the honest
line and no Translate button — at 1366×768 and 390×844. `feedbackTeaches.mjs`'s Translate case now requires Spanish
(it used to accept "not available").

### 2. HELP-6 / H-115 — Read aloud read the prompt only

**Saw.** The work bar's Read said the prompt and "Information you need"; the tray's Read (every student in
Warm-Up/Classwork/Practice) said the prompt only. A read-aloud student never heard the answer choices, the field labels
("Slope of the perpendicular line"), a composed question's current step, the matrices or the system the question is
about, Guided Notes, or the "Let's back up" question that blocks the work.

**Changed.**

- **One reader** — `src/platform/language/questionReading.js` (new, pure): `questionReadingParts(question, context)`
  gives the parts in screen order: the back-up question (first, while it blocks the work, with its choices); the prompt;
  "Information you need"; each matrix the question shows, row by row with its row/column labels ("Matrix A, 2 by 2. Row 1:
  2, −1."); the system Matrix Lab shows but the prompt does not write out; a composed question's current step ("Step 2
  of 5: …" with that step's choices); every field — "Answer box: Slope of the perpendicular line." or the question with
  "Choices: 0; 6; −2; or −6." Choices are said **in the order drawn**: the multi-answer shuffle moved from
  `MultiAnswerGrader.jsx` into `choiceOptions.js` (`choiceOptionsForField`, `multiAnswerChoiceSeed`) so the screen and
  the reader share one function; a composed step uses the stage shuffle. No letters, because the screen shows none.
  Spanish words for the reader's own words when the screen is in Spanish.
- **QuestionEngine** (speech text only, plus two one-line additions) — `referenceSpeechText` is now
  `questionReadingText(readingParts)`; the memo moved below the back-up step so it can include it. The work-bar Read is
  unchanged in code and now says the whole question. The tray receives `readingParts`. Small additions outside the
  speech text, said here as asked: a `SupportedTextActions` (Read / Translate) inside the "Let's back up" overlay, and
  `readAloud`/`translation` props on `GuidedClassworkCoach` (which now renders Read / Translate for the note on screen);
  `reportSupportedTextUse` forwards evidence details.
- **Hear one part again** — the Support tools tray: Read aloud says the whole question and opens "Hear one part again"
  (one button per part: The question, Matrix A, Part 2, …). A student whose Read is on the work bar (a plan's
  text-to-speech) gets a "Read a part" button in the tray instead, so the work bar keeps the single whole-question Read.
  A part heard on its own still says the functions the question defines ("c of 4").

**Proof.** Unit tests over the real lessons: every field label and every choice of all 306 real fields is read; the ACT
matrices item (l3m-pr-12-ccmr) reads both matrices row by row and its 12 choices **equal the radio buttons
MultiAnswerGrader renders, in order** (server-rendered, not a copy of the shuffle); "Slope of the perpendicular line"
(l3-pr-1); a composed step and its choices (l3-cw-6); "Information you need" right after the prompt; the Matrix Lab
system (l3m-pr-5, and not when the tool hides it); the back-up question first while it blocks. Browser
(`readAloudTranslate.mjs`, speech engine recorded): the whole matrices item is heard with every choice in drawn order,
"3 × 2" as "3 by 2"; "Read a part" → Part 2 is heard alone; a student with no plan gets the same from the tray — at
1366×768 and 390×844, no sideways scroll.

### 3. Speech the report names: prices, c(x), matrices (Q-21, PR-4, PR-29, PR-30)

| Text | Before | Now |
| --- | --- | --- |
| `$4.50` | 4.50 dollars | 4 dollars and 50 cents |
| `$1`, `$0.99` | 1 dollars, 0.99 dollars | 1 dollar, 99 cents |
| `$7$` (LaTeX number) | 7 dollars $ | 7 |
| `\$4.50` in prose | \ 4.50 dollars | 4 dollars and 50 cents |
| `c(x) = 2x + 1` | c times the quantity x … | c of x equals 2x plus 1 |
| `c(d(2))` (c, d defined) | c times the quantity d times the quantity 2 | c of d of 2 |
| `(m + n)(x)` | the quantity m plus n times the quantity x | m plus n of x |
| `(f \circ g)(x)` | the quantity f degrees g … | f composed with g of x |
| `\begin{bmatrix}1&2\\3&-4\end{bmatrix}` | bmatrix 1 & 2 \ 3 & minus 4 bmatrix | a 2 by 2 matrix: row 1: 1, 2; row 2: 3, negative 4; end matrix |
| `\begin{vmatrix}…` / `\det` | … | the determinant of a 2 by 2 matrix: … |
| "dimensions 3 × 2" | 3 times 2 | 3 by 2 |
| `$x$-terms` | x - terms | x terms |

A one-letter function is any letter the text **defines** (`c(x) = …`, a letter applied to one other letter followed by
"="), anywhere in the text — so `y − 2 = m(x − 6)` and `x(x + 1) = 6` stay products. Spanish: "4 dólares con 50
centavos", "compuesta con", "una matriz de 2 por 2", "fila". Files: `speechText.js` (`definedFunctionNames`,
`priceSpeech`, `matrixSpeech`, `speakAloud(…, { functionNames })`), `mathSafeText.js` (the `$7$` span rule, the hyphen).

**For session E** (spokenMathLabel in tool labels): its existing outputs are unchanged except where a label holds a
price (now dollars and cents), a LaTeX matrix, a function the label itself defines, `(f ∘ g)(x)`, a nested
application, or `$x$-word`. `tests/platform/readAloudAndTranslate.test.mjs` pins four of E's representative labels.

## Rewritten contracts (playbook)

- `accessibleMathSpeech.test.mjs` (`\$4.50`, the basket prices) and `languageSupports.test.mjs` (`$4.50, about 25%
  off`): value assertions of the old price speech; the behaviour changed on purpose (item 3) — new expectations,
  mutation-checked (reverting `priceSpeech` turns them red).
- `languageSupports.test.mjs` "the curated pack…": it checked only `es.js`'s named exports, so the support sentences
  were unchecked; it now checks the pack the provider loads (`esPack.default`) and that it holds more than the
  directions. Mutation: dropping a slot from a support template, or the support sentences from the pack, turns it red.
- `toolAttemptOutcomeOffers.test.mjs` "the region…": asserted a Translate button on a tool's own English coaching (H-114).
  Behaviour now: that text says "No Spanish translation for this text yet."; a platform miss message offers Translate;
  Vietnamese says it is not available. The pack is loaded first in its server (the real path). Mutation-checked
  (dead button back → red; the miss message's Spanish removed → red).
- `feedbackTeaches.mjs` Translate case: from "Show English **or** not available" to Spanish shown (`lang="es"`).
  Mutation: the hint's template removed → FAIL.

## Mutation checks (each broke the code once, saw red, restored)

21 on the new unit tests — price speech, the `$7$` span rule, defined names, nested reading, LaTeX matrices, "by",
field choices dropped, choice order (authored instead of drawn), matrices, back-up, information, step, system,
function names per part, QuestionEngine speech text, the back-up wiring, the dead button, a misconception template,
the family hints, the tray's parts button, the tray's parts panel — plus 7 on the rewritten/related ones (tool-region
Translate ×2, pack loading, slot dropped, axis vocabulary, the literal-template proof, a literal that adds a variable),
the platform-family coverage (one template removed), the evidence fields (a `surface` added back), and the
feedbackTeaches browser case.

## Merge of the moved base

The base `claude/modest-pasteur-xzagn7` moved from `a7dddc7` to `c803501` (Batch 4's hint ladder, Batch 8's render-loop
fix). It was merged into this branch as a merge commit (`ee90d59`, no conflicts; QuestionEngine.jsx and
toolAttemptOutcomeOffers.test.mjs merged cleanly, both sides kept). Batch 4's new "What might have gone wrong?" rung
shows the misconception / generic miss messages through `SupportedTextActions`, so its Read and Translate are covered
by the Spanish pack with no HintPanel edit. The tool hints that now join the ladder are a tool's own English text
(H-114): they show the honest "No Spanish translation" line. HintPanel's new chrome (hintCopy.js) is not translated
(Batch 4's file). **The gate below was rerun on the merged result.**

## Gate (on the merge, `ee90d59`)

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | ok |
| `npm run test:platform` | 11448 / 11448 pass |
| `node --test tests/tools/*.test.mjs` | 1643 pass, 1 skipped, 0 fail |
| `npm run test:authoring-v5` | not run: authoring and the compiler are untouched |
| `npm run lint` | 0 errors (warnings only, none in changed files) |
| `npm run build` | ok |
| `npm run build:firebase` | ok, no tracked file rewritten |
| `tests/browser/readAloudTranslate.mjs` (new) | all checks passed, 1366×768 and 390×844 |
| `tests/browser/feedbackTeaches.mjs` | all checks passed |
| `tests/browser/toolAttemptOutcome.mjs` | passed |
| `tests/browser/mathSpeech.mjs` | passed |
| `tests/browser/studentAccessibleNames.mjs` | passed |
| `npm run certify:accessibility` | passed, 11 screens × 2 viewports, no new violations |

Browser drivers were run one at a time, no edits in flight. The new driver runs in `student-teacher-journeys.yml` next
to feedbackTeaches. Note: these drivers use the real QuestionEngine in its harness (`feedbackTeaches.html`); the whole
in-memory App (port 5188) was exercised by studentAccessibleNames and certify:accessibility, not by a Read-aloud script.

## Deploying (not done)

My own diff (excluding the merged base) touches only `src/**`, `tests/**` and one workflow: no `functions/`, no `firestore.rules`, no
Firebase config. So this is **Hosting only**: `npm run build && npm run build:firebase`, then
`FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting` (or the release script). No functions, no rules, no
indexes. I did **not** run `node scripts/release-firebase.mjs` (even in plan mode): the session's permission check
refused it as a production action. The owner should run `node scripts/release-firebase.mjs --since a7dddc7` to see the
plan; expected targets: Hosting.

## Decisions for the owner

1. **A Spanish-speaking math teacher should review `packs/esSupport.js`** (974 templates) before students rely on it.
   It was written for this pack from the English the platform generates, not by a machine-translation service, but no
   native reviewer has read it. Choices made: "tú" register, "intersección con el eje x/y", "pendiente-intersección",
   "función madre" (parent function), "rango" (range), "intentos" (tries), "Retrocedamos un paso" (Let's back up).
2. **Other languages need a provider the platform does not have.** 17 of 18 listed languages have no pack. Options: more
   curated packs (Spanish now has 1,141 templates), a reviewed vendor/district provider behind `registerTranslationProvider`
   (it already enforces the math guard), or an approved machine-translation service. The last sends student-visible
   item text off-platform: a privacy and cost decision. Until then the student is told plainly.
3. **Teacher-written text** (authored hints, feedback, worked solutions — 160 of 168 real hints) can be translated only
   by an authored translation. Pre-Flight could ask for `translations.es` on hints and `solutionReview`; not built.
4. **The pack follows the families' wording.** A family sentence reworded in English falls back to English until its
   Spanish is updated; `readAloudAndTranslate.test.mjs` fails on any platform-family sentence without Spanish, which is
   the prompt to update it. If that is too strict for family authors, relax it to a coverage threshold.

## Not done / noticed

- Tables (`question.table`), graphs and a tool's own drawn content are not read by the question reader (only matrices,
  the Matrix Lab system and text); a graph description exists (`graphDescription.js`) and could be a part.
- The tool-UI and a tool's own coaching remain English (H-114); its feedback now says so instead of a dead button.
- Inside a Spanish translation the hidden spoken copy of each formula (MathText) is English ("y equals x plus 1") under
  `lang="es"`; MathText is outside this lane.
- MultiAnswerGrader's choices read "2 times 2" to a screen reader where Read aloud now says "2 by 2" (dimension
  context); MathDisplay labels are outside this lane.
- HintPanel's own chrome ("Show a hint", "the next one opens after your next try") is not translated (HintPanel is
  Batch 4's); only the hint text is.
- H-95 (`\leqslant`, `\geqslant`, `\neg`) not touched.
