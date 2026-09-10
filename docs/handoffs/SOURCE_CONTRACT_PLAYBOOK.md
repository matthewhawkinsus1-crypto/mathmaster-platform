# When a source-inspection test fails after a refactor

Roughly a quarter of `tests/platform` — 139 files, several thousand
`assert.match` calls — inspects component source as text. They exist because
nothing in this repo renders React: node cannot import `.jsx`, so reading the
source is the only way to assert that a screen is wired to the logic behind it.

They are worth keeping. They also fail constantly for a reason that is **not** a
regression: the behaviour is intact and the text moved.

Every instance in PRs #152 and #155–#165 was one of three shapes.

| Shape | Example | What actually happened |
| --- | --- | --- |
| Component split | `AssignmentQuestionEditor.jsx` → `+ …EditorBase.jsx` | 10 assertions across 9 files read a wrapper instead of the screen |
| Label reworded | `Copy AI Fix Package` → `Copy All Flagged AI Fix Package` | button renamed, handler unchanged |
| Expression rewritten | `!String(note \|\| '').trim()` → `!clean(note)` | identical rule, tidier spelling |

None was a regression. Reverting the code to satisfy the assertion would have
been the wrong fix every time — and in one case would have **reintroduced a
bug** (see "the trap" below).

## The decision procedure

Run this before changing either the test or the code.

**1. Find the behaviour the assertion is protecting.** It is almost always in
the comment above it, not in the regex. `showFigure={focusMode || …}` is not a
behaviour; "stacked steps about the same graph draw it once" is.

**2. Ask whether that behaviour still holds** — by reading the new code, or by
running it. Not by whether the regex matches.

**3a. Behaviour intact → rewrite the assertion against the behaviour.** Match
the capability, not the wording. Bind it to the region that must do the work.
Then **mutate the code to break the behaviour and confirm the new assertion
fails.** An assertion that cannot fail is worse than no assertion, because it
reads as coverage.

**3b. Behaviour genuinely lost → fix the code.** The test was right.

## The trap: the old expression can become the bug

In #165 the assertion pinned:

```js
showFigure={focusMode || figureStageIds.has(stage.id)}
```

Focus mode later grew a persistent graph reference rendered beside the active
stage. With `focusMode || …`, the stage then drew **its own figure on top of
it** — the same graph twice, which is exactly what that test's comment exists to
prevent. The expression that satisfied the assertion had become the defect.

Restoring it to make CI green would have shipped the bug the test was written to
catch. This is why step 2 is read-the-behaviour, never match-the-regex.

## The defective one: forbidden identifiers matched in comments

There are **381 `assert.doesNotMatch` assertions across 140 files** that read a
source file. Each means *"this code must not touch X"* — and each runs over the
whole file, comments included.

So writing a comment that explains the boundary fails the build.

PR #167 hit it exactly. The persistence store's only occurrence of `evidence`
was this line:

```js
 * stamp — and never student attempts, grades, evidence, or Classroom identity.
```

A comment stating the safety property the test enforces. The test failed, and
the obvious way to green it was to **delete the explanation**. That is a test
working against the codebase.

**This one is the test's fault, not the code's.** Fix it:

```js
import { executableSource } from './helpers/sourceContract.mjs';
const code = executableSource(source);   // comments stripped
assert.doesNotMatch(code, /studentAttempts|evidence|gradesByAssignment/, '...');
```

Then confirm it still bites — add a real reference to the forbidden field in
code and check it fails. `executableSource` removes comments only; it does not
parse the language, which is fine for a haystack.

If you are writing a new forbidden-identifier check, use `executableSource` from
the start.

## The self-detonating one: constants that are meant to change

PR #169 advanced `ASSIGNMENT_RUNTIME_REPAIR_VERSION` from 1 to 2 — which is the
entire point of that constant: when a release adds a repair, assignments stamped
by an earlier release must be re-evaluated. Three tests failed at once.

All three hardcoded `1`, and all three *meant* "current":

```js
test('... when build is current', ...)        // fixture: assignmentRuntimeRepairVersion: 1
test('a current compatibility stamp ...', ...) // fixture: repairVersion: 1
assert.equal(patch.runtimeCompatibility.repairVersion, 1);
```

The literal said "current" only while 1 happened to be current. After the bump
each fixture silently became a **stale** stamp, so the tests asserted the
opposite of their own names — and the implementation was correct the whole time.

Fix: import the constant.

```js
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION } from '.../assignmentRuntimeRepair.js';
repairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION,          // means "current"
repairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION - 1,      // means "stale"
```

**Then check the counterpart exists.** Making these version-agnostic is correct,
but it removes the only thing that referenced the bump — so nothing proved the
bump did its job. #169 added the missing half: an assignment stamped at
`CURRENT - 1` must be re-evaluated. Without it, reverting the bump left the
suite green while the new repair reached nothing already stamped.

## The quieter failure: assertions that cannot fail

The opposite mistake, and the one that produces false confidence. Nine of these
were found by mutation testing across #152–#156. They share one shape:

> the contract asserts a **name** exists somewhere in a large file, the name is
> already present for an unrelated reason, and the behaviour it stands for can
> be deleted with the suite still green.

Real examples:

- `assert.match(panelSource, /createPortal/)` — also matched the **import**, so
  the panel could stop portalling and render inline, green.
- `assert.match(branch, /setFailure\(/)` — also matched `void 0 && setFailure(`,
  so the error list could be disabled, green.
- A test named *"student runtime never mounts teacher review controls"* passed
  with the panel rendering for **every student**.
- An App-side assertion anchored on `const generationStudentKey` matched an
  earlier non-interactive code path, so folding a preview flag into the real
  expression left it green.

Fixes: anchor to a statement (`/\n\s*setFailure\(\{/`), to the return
(`/return createPortal\(/`), or to the region that must contain it
(`region(source, 'const handleX', '};')`).

## Use the helpers

`tests/platform/helpers/sourceContract.mjs`:

```js
import { componentSource, assertCapability, region } from './helpers/sourceContract.mjs';

// Reads Thing.jsx + ThingBase.jsx, and asserts the wrapper actually renders the
// base — so a split cannot silently orphan every assertion below.
const source = componentSource('src/AssignmentQuestionEditor.jsx');

// A rename is not a removal; losing the control still fails.
assertCapability(source, [/Copy All Flagged AI Fix Package/, /Copy AI Fix Package/],
  'the Repair Center must offer a one-click package for every flagged question');

// Bind the assertion to the code that must do the work.
const handler = region(source, 'const copyAiFixPackage', '};');
assert.match(handler, /buildAllOpenTeacherFlagRepairRequest/);
```

## Two more things that waste a CI cycle

**Tests in a directory nothing runs.** CI globs `tests/platform/*.test.mjs` and
`tests/tools/*.test.mjs`. Coverage written to `tests/preflight/` in #156 had
never executed in any workflow or npm script — it passed, and it was invisible.
New test directories need a workflow entry or they are decoration.

**A call with no import.** `App.jsx` is `.jsx`, so no test imports it, the build
does not resolve free identifiers, and lint here has no `no-undef`. A function
called without importing it is a `ReferenceError` at runtime that the whole gate
misses. When wiring a module into `App.jsx`, assert the import alongside the
call.

## Local gate

Run these before pushing; they are what CI runs.

```
node --test tests/platform/*.test.mjs
npm run test:authoring-v5
npm run test:rules          # needs the Firestore emulator
npm run lint
npm run build
npm run build:firebase
```
