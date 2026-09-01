# Authoring My Math Path questions

A self-contained brief. Hand this to whoever is drafting — including Claude
Cowork — and they should not need anything else from the codebase.

Everything drafted comes back as JSON and goes through
`node scripts/verify-path-drafts.mjs <file>`, which runs the same checks the
production importer runs. **"It passed" means the runtime will really issue and
grade it**, not that it looked right. Nothing gets published until it passes.

---

## 1. Write templates, not fixed questions

The bank used to hold exactly five fixed questions per standard. A five-question
session used all five; practising again gave the same five, so retention checks
re-asked memorised items.

A **template** declares parameters and uses them in the document. One template
becomes unlimited real questions, generated on the server at issue time.

```jsonc
{
  "id": "mm_6_4B_unit-rate",
  "active": true,
  "alignmentKeys": ["texas:6.4B"],
  "courseId": "grade6",
  "familyId": "mathmaster:6.4B:unit-rate",
  "familyVersion": 1,
  "questionType": "response",
  "activityRole": "practice",
  "difficultyBand": 2,
  "dok": 1,

  "prompt": "A machine fills {{bottles}} bottles in {{minutes}} minutes. How many bottles does it fill each minute?",

  "responseFields": [
    { "id": "answer", "label": "Bottles per minute", "inputProfile": "number", "expected": "{{rate}}" }
  ],

  "solutionReview": {
    "headline": "A unit rate is a division.",
    "reasoning": ["Divide the total by the time: $({{bottles}}) \\div ({{minutes}}) = {{rate}}$."],
    "answerSummary": "${{rate}}$ bottles per minute"
  },
  "attemptFeedback": ["Divide the number of bottles by the number of minutes."],
  "supportHints": ["What does each single minute account for?"],

  "generator": {
    "parameters": {
      "minutes": { "type": "int", "min": 2, "max": 9 },
      "rate":    { "type": "int", "min": 2, "max": 12 }
    },
    "derived":     { "bottles": "minutes * rate" },
    "constraints": ["bottles <= 100"]
  }
}
```

**Aim for at least 8 genuinely different questions per template.** The verifier
reports a template that produces fewer than 4 and refuses one that produces 1.

### The generator block

| Field | Meaning |
|---|---|
| `parameters` | What gets drawn. `{"type":"int","min":,"max":,"step":,"exclude":[]}`, `{"type":"decimal","min":,"max":,"places":}`, `{"type":"choice","values":[...]}` |
| `derived` | Values computed from parameters, as expressions |
| `constraints` | Expressions that must all be true, else redraw |
| `attempts` | Redraw budget, default 120 |

**Expression language** — a closed grammar, not JavaScript. Numbers, parameter
names, `+ - * / % ^`, comparisons `< <= > >= == !=`, `&&`, `||`, brackets, and
these functions only: `abs min max round floor ceil sign sqrt pow gcd`.
Anything else is refused rather than guessed at, as is division by zero or an
unbound name.

**Placeholders** — `{{name}}` anywhere in any string, at any depth. Filters:

| Written | With `b = -4` | Use it for |
|---|---|---|
| `{{b}}` | `-4` | plain substitution |
| `{{b\|signed}}` | `- 4` | `y = 3x {{b\|signed}}` → `y = 3x - 4`, never `+ -4` |
| `{{b\|abs}}` | `4` | when the sign is written separately |
| `{{b\|paren}}` | `(-4)` | `3 \times {{b\|paren}}` → `3 × (-4)` |

A string that is **only** a placeholder keeps the value's type, so
`"expected": "{{rate}}"` is the number `7`, not the string `"7"`.

### Rules that matter

- **Generate the answer with the question.** `expected` must be built from the
  same parameters. A template whose `expected` is a fixed number is wrong for
  every draw but one, and the verifier will not catch that — it is on the author.
- **Constrain to keep the mathematics sane.** Exclude the degenerate draws
  (`"exclude": [0]` on a slope), bound the ugly ones (`abs(b) <= 20`), and keep
  answers in a range a student can write.
- **Substitute everywhere the number appears** — prompt, `expected`, `accepted`,
  every line of `solutionReview`, hints, feedback. A number left hard-coded in
  the worked solution contradicts the question.
- **A fixed question is still allowed.** Omit `generator` entirely. Use this only
  where varying the numbers would change what is being assessed.

---

## 2. Writing mathematics

Mathematics goes in `$…$`. It is rendered; text outside is not.

- `"Solve $-3x + 4 > 13$ and graph the solution."` ✅
- `"Solve -3x + 4 > 13"` — renders as typed, no proper minus or spacing ❌
- `"The value is \\frac{3}{4}"` — **outside `$…$` the student sees `\frac{3}{4}`** ❌

Every `$` needs its partner. For a literal dollar sign write `\$` —
`"$\\$18.25$"` is money inside mathematics. A lone `$` with no partner is read
as a currency symbol and left alone, so `"Plan A total ($)"` is fine.

Divisions render as stacked fractions automatically: `$3/4$` and
`$\frac{3}{4}$` both stack. Write whichever is clearer.

---

## 3. Answer fields

```jsonc
{ "id": "answer", "label": "Answer", "inputProfile": "number",
  "responseHint": "Round to the nearest tenth.",
  "expected": "{{rate}}", "accepted": ["{{rate}}", "{{rate}}.0"] }
```

`inputProfile` decides the keypad the student gets:

| Profile | For |
|---|---|
| `number` | a numeric answer |
| `expression` | a symbolic answer |
| `equation` | a full equation |
| `interval` | interval notation — `∞ ∪ [ ]` on the keypad |
| `inequality` | an inequality — `< ≤ > ≥` |
| `set` | roster notation |
| `orderedPair` | a coordinate pair |
| `choice` | multiple choice; supply `choices`. Pure choice items are one attempt per issued question. |
| `text` | words are genuinely the answer |

The grader already accepts, without help: unreduced fractions, decimals for
fractions, `\frac` from the keypad, `\left[…\right)` for `[…)`, `\ge` for `>=`,
`\sqrt`/`√`, and `y=6/4x-6` for `y=1.5x-6`. **Do not pad `accepted` with
spelling variants** — list genuinely different forms only (a different but
equally valid answer, not a different way of typing the same one).

---

## 4. Every field

**Required:** `id` (globally unique, never reuse a published one),
`alignmentKeys` (`["texas:6.4B"]`, must be a real standard), `prompt`, and
either `responseFields` with an `expected`, or a tool payload.

**Expected on every question:** `courseId`, `familyId`
(`mathmaster:<standard>:<slug>` — the selector avoids repeating a family within
a session, so **give each question for a standard a different `familyId`**),
`familyVersion`, `questionType`, `activityRole`, `difficultyBand` (1–5),
`dok` (1–4), `solutionReview`, `attemptFeedback`, `supportHints`.

`solutionReview` is what a student reads when the question closes. Reasoning
first, then the answer — **not** "the answer is B". It is released by the server
after the question finalizes and never travels early.

**Choice policy.** Ordinary My Math Path practice should prefer a response the student must construct: number, expression, equation, interval/inequality, graph, table, mapping, model, or another interactive tool. Use pure multiple choice deliberately rather than as the default. A pure choice question gets exactly **one attempt**; after an incorrect response the Path closes that item and routes to a fresh question. Authentic SAT/ACT/TSIA2/ASVAB items may remain multiple choice when that matches the assessment format.

**Analysis parts on graph questions** — `kind` must say what the part asks:
`value` for a slope, rate, intercept or word answer; `domain`/`range`/
`increasing`/`decreasing`/`constant`/`positive`/`negative` when the answer
really is an interval; `point` with a `feature` when the student clicks the
graph. The keypad is chosen from the kind, so a wrong kind hands a student the
wrong keyboard. A test enforces label-to-kind agreement.

---

## 5. What to write

Run `node scripts/ccmr-gap-report.mjs --list` for the current list. As of the
last run, **99 CCMR-aligned standards have no Path content at all**:

- **grade 6** — 2 of 45 covered. Missing: 6.2A–E, 6.3A–E, 6.4A–H, 6.5A–C,
  6.6A–C, 6.7B–C, 6.8A–D, 6.9A–C, 6.10A–B, 6.11, 6.12A–D, 6.13A–B, 6.14C
- **grade 7** — 4 of 40 covered. Missing: 7.2, 7.4A–E, 7.5A–C, 7.6A–I, 7.8A–C,
  7.9A–D, 7.10A–C, 7.11B–C, 7.12A–C, 7.13A, 7.13E–F
- **grade 8** — 23 of 43 covered. Missing: 8.2A, 8.2D, 8.3A–C, 8.6A–C, 8.7A–B,
  8.7D, 8.8B, 8.8D, 8.10B, 8.10D, 8.11B–C, 8.12A–B, 8.12G
- **Algebra I and Algebra II** — complete, 49/49 and 48/48.

**Five templates per standard**, with different `familyId`s, so a five-question
session can run without repeating a family.

### Exam-style items

Separately: **no question anywhere is written in an exam's style.** Every CCMR
pathway currently serves an ordinary course question under an exam's name. An
item written in a specific assessment's style declares it:

```jsonc
"assessmentContext": { "framework": "digitalSAT", "examStyle": true }
```

Frameworks: `digitalSAT`, `act`, `tsia2`, `asvab`. Only claim one when the item
genuinely uses that assessment's format, timing pressure and answer style —
this is the difference between "the mathematics overlaps the SAT" and "this is
an SAT question", and the platform reports the two separately.

---

## 6. Handing work back

Return one JSON file per course:

```jsonc
{ "documents": [ /* question or template objects */ ] }
```

Then:

```bash
node scripts/verify-path-drafts.mjs drafts/grade6.json
```

It reports per question. Every problem it names is a real one — production
issuability, an unknown standard, a duplicate id, an unbound placeholder,
unbalanced `$…$`, LaTeX outside mathematics, a template that produces one
question. Fix and re-run until it passes; the importer runs the same gate
server-side and will refuse the package otherwise, all-or-nothing.
