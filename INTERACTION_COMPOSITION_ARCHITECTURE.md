# Interaction composition — the architecture behind rich question types

## The decision

A new word problem must almost never require a new React component. It should
require a different JSON composition of interactions that already exist.

This supersedes an earlier decision to build `relationshipModel` as a fixed
staged "Context Function Model" with the sequence
`quantities → equation → table → graph → domain → range → continuity`.

That earlier version was wrong in a way that is easy to miss: it would have been
a large hard-coded worksheet template. Every contextual problem would have
become the same question with different nouns, and the first lesson that wanted
`equation → graph → maximum → contextual domain` would have needed either a new
tool or a pile of `if` statements inside the old one.

## Why a fixed sequence fails

Four real problems, four different shapes:

| problem | what the student should do |
|---|---|
| chocolate bars | equation → table → discrete graph → domain → range → discrete/continuous |
| shower water | equation → continuous graph → domain → range → interpretation |
| taxi fare | quantities → equation → interpret slope → interpret intercept |
| projectile | equation supplied → graph → maximum → contextual domain |

None of these is a subset of one canonical order. They are different
compositions of overlapping pieces. A tool per shape gives you
`LineOfBestFitWordProblemWithTableTool.jsx`, and eventually 150 "tools" that are
really slightly different worksheets.

## The three levels

```
  interaction primitive     graph, table, equation box, number line, …
          ↓                 a finite, schema-validated whitelist
  question recipe           which interactions happen, in what order
          ↓                 the `workflow` array in the question JSON
  problem parameters        numbers, functions, contexts, labels, units
```

A question chooses primitives; a recipe fixes the choice so variants can share
it; parameters vary the mathematics without touching either.

## Three sections per question

The other failure this prevents is answers living in the same fields that
describe what the student sees.

```json
{
  "content":  { "scenario": "…", "equation": "f(x)=2x", "domain": {…} },
  "workflow": [ { "kind": "equationInput" }, { "kind": "graphConstruction" } ],
  "grading":  { … }
}
```

- **content** — what mathematics exists.
- **workflow** — what the student is asked to do.
- **grading** — what counts as correct.

The renderer never hard-codes "chocolate-bar questions display a table". It sees
that *this question requested a table*.

## Stages may consume earlier stages

This is the part that makes it a workspace rather than a sequence of isolated
questions.

```json
{ "kind": "tableInput",       "source": { "fromStage": "equation" } }
{ "kind": "graphConstruction", "source": { "fromStage": "table" } }
```

A student who writes `f(x) = x + 2` for the chocolate-bar problem should fill
their table from *their* function, and graph *their* table. MathMaster can then
say something far more useful than "wrong":

> Your table is consistent with the function you wrote, but your function does
> not model the situation.

Every stage independently checking against the answer key cannot produce that
sentence.

## The boundary that is deliberately kept

The JSON is **not** an unrestricted UI language. An authoring AI composes from a
finite whitelist and cannot invent components. Every primitive has a strict
schema, and an unknown `kind` fails Preflight rather than rendering nothing.

That is what makes the flexibility safe: freedom of arrangement, no freedom of
invention.

## What the public types become

`relationshipModel` and `relationMapping` stay as public concepts — a teacher
and an authoring AI still think in terms of "Function Modeling" and "Relation
Representations". Underneath, each is a configuration of the same primitives,
which is why a relation question can ask for a plot, a mapping diagram, both, or
neither without three relation tools existing.

## Grading rules

`grading` is keyed by stage id, and every rule is one of a small set:

| rule | means |
|---|---|
| `"f(x)=2x"` | compare with this answer |
| `["[0,10]", "0 \\le x \\le 10"]` | any of these |
| `{ "values": { "0:y": "0" } }` | a table with its own key, cell by cell |
| `{ "consistentWith": "equation" }` | check against the student's own earlier answer |
| `{ "manual": true }` | written work, reviewed by the teacher |
| *(absent)* | not machine-marked |

Two properties matter more than the list:

**A stage that was not checked is never reported as wrong.** Written
interpretation, and a table whose model cannot be evaluated, come back
`graded: false`. `partialCreditPercent` is computed over the stages that *were*
marked, so an unmarkable stage neither helps nor hurts.

**One mistake is counted once.** With `consistentWith`, a student who writes
`f(x) = x + 2` and then fills the table from *that* is marked wrong on the model
and right on the table — 67%, not 0%. The alternative, grading every stage
against the key, charges them for the same error four times.

`equationInput` compares function definitions by their rule, so `f(x)=2x`,
`y=2x` and `f(x)=x+x` are one answer. An equation the student *solved*
(`x = 3`) keeps its left side, because which variable was isolated is part of
that answer.

## What exists now

| file | role |
|---|---|
| `src/platform/workflow/interactionStages.js` | the whitelist: 15 primitives, each declaring `produces` / `consumes` |
| `src/platform/workflow/questionWorkflow.js` | normalise, validate, resolve stage inputs, progress |
| `src/platform/workflow/workflowGrading.js` | mark a composed question, stage by stage |
| `src/platform/workflow/WorkflowRunner.jsx` | render it, delegating every stage to the component that already draws it |

The runner draws no mathematics of its own. It owns stage order, the responses,
and threading one stage's output into the next; a table stage renders
`TableGrader`, a graph stage renders `InteractiveGraphWorkspace`.

`TableGrader` gained `table.blanks` for this: a cell can now be **editable
without being graded there**. Previously only a cell with an answer key was
editable, which made a table built from the student's own function render as
nothing at all.
