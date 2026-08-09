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
