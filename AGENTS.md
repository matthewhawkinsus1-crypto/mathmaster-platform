# Working in this repository

MathMaster is a live platform with real student data. Assignments, grades,
attempt history and Google Classroom grade columns are all production state.
Prefer being slow and correct.

## Run the suite this way

```
npm run test:platform
```

Same tests, same exit code as `node --test tests/platform/*.test.mjs` — but when
something fails it tells you **what kind** of failure it is and what to do. Use
it instead of the raw command; CI does.

## The failure that will most likely stop you

**Across PRs #152 and #155–#166, 26 of 27 failures in this suite were not
regressions.** They were assertions pinned to a *representation* — the text of a
file, a value a normaliser rewrites, a frozen object shape — that a correct
refactor had moved. Exactly one was a real bug.

That base rate is the trap. A red suite looks identical either way, so reverting
your change until the assertion matches *looks* like the careful option. It is
usually wrong, and it can be actively harmful: on PR #165 the pinned expression
had itself become the double-draw bug the test existed to prevent.

Three shapes account for nearly all of it:

| Shape | Example | Fix |
| --- | --- | --- |
| Source text | component split, button renamed, expression rewritten | assert the capability, not the wording |
| Canonicalised value | `graphConstruction` → `functionGraph` via `normalizeWorkflow` | assert what survives normalisation — an id, a role |
| Frozen object shape | `deepEqual` on a record that gained a field | add the field, with a comment saying why |

About a quarter of `tests/platform` reads component source as **text**. Nothing
here renders React — node cannot import `.jsx` — so this is the only way to
assert a screen is wired to its logic. It is worth keeping, and it is why these
tests are fragile.

When one fails, do not revert the code to make the regex match. Run this:

1. **Find the behaviour the assertion protects** — it is in the comment above
   it, not in the regex. `showFigure={focusMode || …}` is not a behaviour;
   "stacked steps about the same graph draw it once" is.
2. **Check whether that behaviour still holds**, by reading or running the new
   code.
3. **Intact** → rewrite the assertion against the behaviour (match the
   capability, bind it to the region that does the work), then **mutate the code
   to break the behaviour and confirm the new assertion fails**.
   **Genuinely lost** → fix the code.

Restoring the old text can ship a bug: in PR #165 the pinned expression had
become the double-draw defect the test existed to prevent.

Full decision procedure, worked examples, and helpers:
**`docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md`**
Helpers: `tests/platform/helpers/sourceContract.mjs`

## Verify with the gate CI runs

```
node --test tests/platform/*.test.mjs
npm run test:authoring-v5
npm run test:rules          # Firestore emulator
npm run lint
npm run build
npm run build:firebase
```

CI globs `tests/platform/*.test.mjs` and `tests/tools/*.test.mjs` only. A test
written anywhere else never runs — check your new file is inside one of them.

## Assertions must be able to fail

A contract that asserts a **name** appears somewhere in a large file usually
passes for an unrelated reason, while the behaviour it stands for can be
deleted. Anchor to a statement, a return, or a `region(...)` slice. If you add
or change an assertion, break the behaviour once and confirm it goes red.

## Two things the whole gate misses

- **A call with no import.** `App.jsx` is `.jsx`: no test imports it, the build
  does not resolve free identifiers, and lint has no `no-undef` here. Wiring a
  module into `App.jsx` without importing it is a runtime `ReferenceError` that
  passes every check. Assert the import next to the call.
- **Firestore rules for a new collection.** Rules are only covered by
  `npm run test:rules` against the emulator. A new collection needs cases there,
  and its deploy needs `firestore:rules`, not hosting alone.

## Scaffolding must not merge

One-shot `.github/workflows/*.yml` patch runners that hold `contents: write` and
push to their own branch have reached three PRs. Delete them before the PR is
ready.

## Deploy

Hosting plus rules; add `functions` when anything under `functions/` changed.

```
npm run build && npm run build:firebase
firebase deploy --only hosting,firestore:rules[,functions]
```
