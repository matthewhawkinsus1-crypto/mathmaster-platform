# The grader fuzz and parity harness

The bugs that hurt students most in November 2026 were input edge cases that
people found before tests did: the math editor's `\frac12` in a box whose
reader took plain text (PR #553), `Pr` and `2πr` read as one name (PR #551), an
authored `x(x - 5) = 0` read as a function call, a half-written equation that
crashed in place of its "cannot read" panel. Each was fixed with a test for
that one value. This harness types the whole class.

It builds seeded cases (a question a student can be given, and a value a
student can type) and runs each through every grader that reads it, holding
them to what the platform promises.

## What it promises

| Property | Meaning |
| --- | --- |
| `never-throws` | No grader, reader or draft step throws, whatever was typed. |
| `device-server-parity` | The verdict on the screen is the verdict the server gives the bytes the screen sent. An entry the box refuses (unfinished, or over 240 characters: `functions/shared/typedEntryGuard.mjs`) is never sent, so there is none to agree on; a tab on an older build still sends it, and no grader may mark it right. |
| `path-secure-parity` | My Math Path and a secure test's close give one stored grading definition one verdict. |
| `key-is-right` | A question answered with its own keys is right, everywhere. |
| `unfinished-not-right` | The key left unfinished (`12 +`, `(x`) is not a right answer. |
| `key-is-right` (the box) | The key itself is never refused by its box as unfinished or too long. |
| `typed-value-readable` | A typed value in a tool's box never makes its grader give up (`malformed-response`). |
| `round-trips`, `recovered-verdict`, `reopens-the-same` | A saved draft reads back as saved, is marked as it would have been had it been submitted, and reopens unchanged. |
| `answers-in-time`, `reopen-time-grows-with-length` | One verdict takes under two seconds, and cost grows with length, not exponentially. |
| `stable`, `padding` | The same value, asked again or with spaces round it, gets the same verdict. |

Two more are listed and never fail a run, because the difference may be by
design: `graders-agree` (the assignment matcher, the Path grader and
Pre-Flight's self-check are separate graders) and `parser-refuses` (which
kinds of input each throwing parser refuses: a map of where a render path
needs a catch).

## What it types

`scripts/lib/graderFuzz/inputs.mjs`, each value labelled with its class:

| Class | Examples |
| --- | --- |
| `latex` | `\frac12`, `\sqrt[3]{x}`, `\left(x-5\right)`, `\pi`, `x\le 3`, `x^{2}`, an empty `\placeholder{}` |
| `unicode` | `√2`, `−3`, `2×3`, `π`, `x²`, `x ≤ 3` |
| `partial` | `2x +`, `(`, `1/`, `=`, `\frac{1}{` |
| `blank` | nothing, spaces, a tab, a zero-width space |
| `long` | one token repeated to 241, 300, 1,001 or more characters |
| `manyTerms` | many short terms inside the 240 characters a box may hold: 48 like terms with varied coefficients, a chain of divisions, a run of brackets. A length limit bounds characters, and a comparison's cost is set by its terms (#558) |
| `oddNumber` | `1e999`, `0x10`, `1,000`, `1/0`, `.5`, `5.`, digits of another script |
| `implicit` | `Pr`, `x(x-5)`, `2πr`, `xy`, `sin x` |
| `hostile` | markup, JSON, `__proto__`, control characters |
| `key`, `keySpelling`, `nearMiss` | the bank's key; a right spelling of it; a wrong answer one slip away |
| `keyMutation`, `brokenKey`, `paddedKey` | the key with a character changed; left unfinished; made longer than a response may travel |

## What it asks

`scripts/lib/graderFuzz/corpus.mjs`: every typed field of every My Math Path
and CCMR bank (drawn by the production generator), an instance of every
Question Family, and the questions the captured browser responses were
recorded against. Five targets (`scripts/lib/graderFuzz/targets`):

| Target | Graders |
| --- | --- |
| `typedFields` | One box, through `sameValue`, `matchesFieldAnswer`, `gradeMultiAnswerResponse`, `gradeServerResponse`, `mathPath.gradeResponse`, `secureItems.gradeItem` and Pre-Flight's `gradeResponseField`. |
| `questionResponses` | A whole ordinary question (multiAnswer, literal, ordered pair, system, table, fraction, number line): its screen grader against the server on the response as sent. |
| `structuredWork` | Every registry tool and structured type, the Step Algebra and literal workspaces, composed workflows, and the My Math Path tool contracts: right work with one value changed, work built from the names a grader reads, and questions whose authored given was changed. |
| `drafts` | An ordinary response through the draft store and the server's deadline recovery; a Step Algebra draft reopened; a radical solve's recorded check and solution set. |
| `readers` | The readers and display helpers a value passes through before it is graded or drawn. |

## Running it

```
npm run fuzz:graders                                   # the pull-request slice
node scripts/fuzz-graders.mjs --seed 2026-11-16 --count 30000 --max-length 1000
node scripts/fuzz-graders.mjs --target typedFields --count 5000
node scripts/fuzz-graders.mjs --replay case.json       # one finding's repro, again
```

- **Every pull request**: `tests/platform/graderFuzzParity.test.mjs` runs a
  fixed seed, about six thousand cases, in about ten seconds, inside the
  platform tests CI already runs.
- **Every night**: `.github/workflows/grader-fuzz-nightly.yml` runs a new seed
  (the date) and about twenty times the cases. `nightly-failure-issue.yml`
  opens an issue when it fails. A night is rerun with `--seed <its date>`.

A case is plain JSON holding its own question and value, so a finding's
`repro` runs again on any checkout with no seed and no corpus.

## When it finds something

A finding has a **signature**: its target, its property and what tells one
cause from another (the grader, the kind of input), never the value. A run
fails on any `fail` finding whose signature is not in
`scripts/grader-fuzz-known-findings.json`.

1. Run it again: save the `repro` JSON from the log to a file and pass
   `--replay`.
2. **Fix the grader**, with a test that fails before the fix. A grading change
   needs a sweep that shows which verdicts move
   (`scripts/sweep-equivalence-verdicts.mjs`; for the simplify budget,
   `scripts/sweep-algebraic-equivalence-budget.mjs`).
3. Only where it cannot be fixed safely in that change, list the signature in
   the known-findings file with what it is, why it is left, the issue that
   tracks it, and its repro. The pull-request test replays every listed repro
   and fails once one stops reproducing, so an entry is deleted with its fix
   and the list only shrinks.

## Adding a target, a class or a question

- A **target** is a module with `id`, `cases({ rng, count })` (a generator of
  plain-JSON cases drawn from `rng` alone) and `check(case)` (its findings).
  Add it to `TARGET_LOADERS` in `scripts/lib/graderFuzz/index.mjs` and give it
  a count in the test's `SLICE`.
- An **input class** goes in `inputs.mjs` and `INPUT_CLASSES`; every target
  picks it up.
- A **new tool or Question Family** needs nothing: `structuredWork` reads the
  grading manifest and the family registry.

## What it does not do

- It does not render. A screen that parses a typed or saved value to draw it
  is covered by the render-path work (PR #552's branch) and its Vite SSR tests;
  `readers` only lists what each parser refuses.
- It has no oracle for "this wrong answer is wrong" beyond the banks' own near
  misses: `scripts/sweep-equivalence-verdicts.mjs` and
  `npm run audit:answer-acceptance` hold those.
- A tool's work is fuzzed from captured or key-built work where there is some,
  and from the names its grader reads where there is none. A tool with no
  captured work has its typed boxes exercised less precisely.
- A Step Algebra draft's own text is drawn from every class but `long` and
  `manyTerms` (`targets/drafts.mjs`). A saved operand of many like terms
  takes minutes to reopen (mathjs's rule matcher; the November handoff,
  section 6, "A long side"), and a run that does not end reports nothing. The
  operation box refuses such an operand when it is typed; a saved draft is
  not read through that budget.
