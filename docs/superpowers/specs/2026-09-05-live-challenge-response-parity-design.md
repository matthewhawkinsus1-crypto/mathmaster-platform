# Live Challenge response parity design

## Problem

Live Challenge securely reuses Path questions and server grading, but its non-tool renderer is a separate, simplified response UI. That renderer currently falls back to a plain HTML input for every field. As a result, math-entry questions lose MathMaster notation tools (fractions, radicals, exponents, infinity, interval notation, etc.), and finite-choice questions can reach a round without their choices being rendered.

The dry-run screenshots exposed both classes of failure: valid Algebra II content became hard or impossible to enter, and prompts/field labels that instruct students to choose an answer were displayed as free-response text boxes.

## Goals

- Preserve the existing secure Path bank and server-side grading architecture.
- Render every Live Challenge field with the response surface its public contract requires.
- Reuse MathMaster's existing `MathInput` so Live Challenge inherits the same notation/keypad behavior as other student work.
- Render sanitized finite choices as selectable buttons/cards and submit the runtime choice id expected by the server grader.
- Fail closed before selection when a non-tool question cannot be answered with a supported Live Challenge response surface.
- Make the teacher dry run reveal the response mode so malformed content is obvious before students are invited.
- Apply the repair to the whole bank rather than editing individual question ids.

## Non-goals

- Do not move grading into the browser or expose expected/accepted answers.
- Do not create a second Live Challenge-specific answer-equivalence engine.
- Do not rewrite Path generation, tool grading, scoring, or the assignment engine.
- Do not hand-repair the reported Algebra II items as a substitute for fixing the renderer contract.

## Existing secure contract

`functions/lib/mathPath.js` sanitizes field presentation metadata and replaces authored choice ids with deterministic runtime ids. Private grading remaps expected choice ids to the same runtime ids. Live Challenge reconstructs the deterministic issued question server-side and grades the submitted response with the Path grader. This must remain unchanged.

The browser is therefore allowed to receive only presentation information: prompt, public response fields, runtime choice ids/labels, answer-format hints, required symbols, and supported tool payloads. Expected answers and generator parameters remain private.

## Response classification

A pure shared helper will classify a bank/public question into one of these response modes:

- `tool`: an interactive Path tool is declared. Tool issuability continues to be enforced by the Path tool contract.
- `choice`: every choice field has at least two visible choices, taken from field-level choices first and question-level choices second.
- `math`: a field declares a MathMaster math profile such as expression, equation, interval, inequality, set, function, ordered pair, number/numeric, or required mathematical notation.
- `text`: a genuine text/short-answer field that does not require the math keypad.
- `mixed`: a supported combination of multiple fields.
- `invalid`: no usable response fields, a choice field has fewer than two choices, an instruction clearly requires choosing/selecting but no selectable options exist, or an unsupported response profile is declared.

The helper returns `{ eligible, mode, label, reason }`. It must not inspect private grading values.

## Server preflight

`loadChallengeCandidates` already runs every candidate through Path issuability. Live Challenge response compatibility will be folded into the shared candidate style predicate so only questions that are both securely gradeable and renderable can survive candidate selection. This avoids a second query path and keeps create/swap behavior consistent.

A malformed question therefore never becomes a scheduled round. If filtering leaves too few candidates, the existing create-time failure is preferable to silently serving an unanswerable question.

## Student renderer

The generic Live Challenge field renderer will use the public response contract:

1. Interactive Path tool -> existing `QuestionEngine` route.
2. Choice field -> accessible button/card group. The submitted value is the sanitized runtime choice id; labels are rendered through `MathText` so algebraic choices format correctly.
3. Math field -> existing `MathInput`, preserving `inputProfile`, `answerFormat`, `requiredSymbols`, placeholder, and response hint. This supplies roots, fractions, exponents, infinity/union for interval profiles, and the rest of the platform keypad policy.
4. Genuine text field -> native text input.

The Lock In action still submits `{ responses: { [fieldId]: value } }` through the existing callable. Live Challenge never decides whether the answer is correct.

## Dry run

The teacher dry run continues to use the same `ChallengeRound` component as students. A compact response badge should identify what is being rehearsed, such as `Multiple choice · 4 choices`, `Math input`, `Interval input`, or `Interactive tool`. An invalid public payload must display an explicit `Invalid for Live Challenge` message instead of a misleading answer box.

Server filtering should make invalid rounds rare; the client check is defense in depth and a useful authoring diagnostic, not the primary gate.

## Regression coverage

Automated coverage must include:

- radical/expression entry is classified as math and uses MathInput;
- interval input supports infinity notation through the platform profile;
- ordinary four-choice items render their sanitized choices;
- a choice field with no choices fails closed;
- a question whose instruction says choose/select but has no choices fails closed;
- numeric free response remains supported;
- interactive tools remain supported and are not downgraded to generic fields;
- the compatibility gate is part of candidate filtering;
- no expected/accepted answer data is added to the public payload.
