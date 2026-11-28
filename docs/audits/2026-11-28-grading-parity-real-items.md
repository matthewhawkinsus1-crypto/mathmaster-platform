# Grading parity on real lesson items — audit of 2026-11-28

**What was asked.** A grade must be the same whether the browser or the server
computes it, and it must be right. The grader fuzz harness
(`docs/architecture/GRADER_FUZZ.md`) types generated input into bank and
family questions. It had never typed student-like answers into every real
lesson item. This audit does that, for every gradable question in
`teacher-import-jsons/`.

**How to run it.**

```
node scripts/audit-grading-parity-real-items.mjs                 # the whole run, ~50 s
node scripts/audit-grading-parity-real-items.mjs --out r.json --markdown r.md
node --test tests/platform/gradingParityRealItems.test.mjs       # the seeded PR slice, ~15 s
```

Code: `scripts/lib/gradingParityAudit/` (`realItems.mjs` compiles the lessons,
`studentAnswers.mjs` builds the answers, `mathOracle.mjs` is the independent
reading of the key, `audit.mjs` grades them both ways).

## What was graded

| | Count |
| --- | --- |
| Lessons (every file in `teacher-import-jsons/`, every section) | 46, all compiled |
| Item instances (a Question Family slot drawn on 2 seats) | 1,811 from 1,488 authored items |
| Items the server grades | 1,811 (all) |
| Items with typed boxes (multiAnswer 995, table 1) | 903 |
| Typed boxes | 2,076 |
| **Typed answers graded, screen and server** | **45,219** |
| — right answers in another spelling | 10,070 |
| — one-slip wrong answers | 7,928 |
| — the key's value, not in the form the box asks for | 225 |
| — follow-through (a wrong earlier part carried forward) | 8 |
| — edge input | 26,988 |
| Rich-tool items (Step Algebra 162, systems 184, composed workflows 75, polynomial workshop 79, …: 19 surfaces) | 815 |
| **Pieces of tool work graded, device and server** | **9,780** |

**The answers.** Right: the key and its accepted answers; the verdict sweep's
typed spellings (`scripts/lib/typedAnswerSpellings.mjs`: spaces, a leading +,
superscripts, `·` `×` `*`, implicit products, redundant brackets, `\frac` and
`\dfrac`, relation keys, reordered terms where nothing asks for a form, a
decimal where nothing asks for a fraction); the math editor's LaTeX
(`scripts/lib/editorTypedSpelling.mjs`); a Unicode minus; no spaces; an
ordered pair with spaces; an inequality read from the other side. Wrong: the
sweep's near misses, a sign error, off by one, coordinates swapped, the
reciprocal, a term left out, strict and non-strict swapped, a set element
missing or extra. Unsimplified (only where the box states a form): a
`factoredForm` key expanded, a `simplestRadicalForm` radical not simplified or
left in the denominator, a `simplifiedPolynomial` like term split. Edge: blank,
unfinished (`key +`, `key*`), over 240 characters, a lone operator, an empty
LaTeX placeholder, words.

**Deciding right and wrong from the item's own key.** Every right and wrong
answer is checked against the key by an independent reading
(`mathOracle.mjs`, mathjs only, nothing of the platform's answer layer): same
value at seeded sample points, an equation as a non-zero multiple of the
key's, an inequality by its truth set, pairs, sets and intervals by their
numbers. An inequality is also checked on its boundary (found by a sign change of L − R, then bisected), where strict and non-strict differ. A generated "right" answer it reads as another value, or a "wrong"
one it reads as the same value, is dropped as a generator error. A wrong
number inside the item's own `numericTolerance` is right by its key and is not
built as wrong. Where the reading cannot read an answer, a surprising verdict
on it is listed as **needs review**, never as a confirmed bug.

**The two paths.** Screen: the shared grader the screen calls
(`gradeMultiAnswerResponse` with the follow-through rules, as
`src/MultiAnswerGrader.jsx` calls it; `gradeTableResponse` as
`src/TableGrader.jsx` does) plus what keeps the box from submitting
(`answerShapeGuard.formatProblemForResponse`,
`typedEntryGuard.typedEntryNotice`). Server: `gradeServerResponse` on
`normalizeOrdinaryResponse` of the screen's answer state, through JSON. Both
on the delivered question (`deliveredQuestionForGrading`). The other boxes
hold their keys, and both the box and the whole item are compared. Tool work
is built from the names each tool's grader reads, holding the item's own
numbers and edge input, and run through the fuzz harness's `structuredWork`
check (device against server, never throws, stable).

## Disagreements between the screen and the server

**None.** 0 of 45,219 typed answers, 0 of 9,780 pieces of tool work.

| Type | Count |
| --- | --- |
| screen right / server wrong | 0 |
| screen wrong / server right | 0 |
| screen refuses the box / server marks it right | 0 |
| screen graded / server ungraded | 0 |
| same part verdict, whole item differs | 0 |
| either side threw | 0 |
| tool: device and server differ | 0 |

## Wrong verdicts (both paths agree, the verdict is wrong)

Before this change: 141 (78 firm right answers marked wrong, the rest below).
After: 63, 58 of them one documented rule left for the owner. **No wrong
answer and no edge input was marked right**, on either path, in any lesson:
of 7,928 one-slip wrong answers, 225 unsimplified forms and 26,988 edge inputs,
none earned credit. Every item's own key is right on both paths.

### Fixed: a typed `·`, `×` or `²` refused by two grading modes (78 answers)

`gradingMode: equivalentExpression` (33 boxes in these lessons) and
`gradingMode: simplestRadicalForm` (259 boxes) refused a right answer typed
with `·`, `×` or a superscript digit: `2·x+3` for `2x+3`, `x²-64` for
`x^2-64`, `2·|x|y^2` for `2|x|y^2`. They did that on the screen and on the
server alike. The editor's own spelling of the same answer (`2\cdot x+3`,
`x^{2}-64`) was right. Every other reader of the mathematics already reads
these characters as the editor writes them (`answerEquivalence.mjs`
`typedAsEditorSpelling`, GR35c). These two branches of
`answerUtils.matchesFieldAnswer` did not.

Fix (`functions/shared/answerUtils.mjs`, shared by the browser and Cloud
Functions): the student's answer, never the key, goes through
`typedAsEditorSpelling` before the `equivalentExpression` comparison and the
form-specific comparator. A form the mode refuses is still refused: `√98`,
`1·√98` and `7·√2·1·1+0` are not simplest radical form for `7√2`.

Test: `tests/platform/typedCharactersInFormModes.test.mjs` (red before the fix,
on 3 of its 4 cases), and the slice in
`tests/platform/gradingParityRealItems.test.mjs`, which goes red on these
items with the fix reverted.

Verdict sweep (`node scripts/sweep-equivalence-verdicts.mjs --base <main>
--check-wrong`): exit 0. 797,193 graded pairs over 10,017 fields; right→wrong
0, wrong→right 0, a near miss now right 0, editor spellings refused 0. The
sweep's field corpus is the banks, docs and drafts, where no box with these two
modes holds such a key spelling, so it moves nothing there. The intended
moves are the 78 below, measured by running this audit on main's code and on
this branch's code. All 78 go from wrong to right. Each is a right answer, and
no verdict moves the other way.

| Item | Box | Input | Expected | Screen (main) | Server (main) | Screen / server now |
| --- | --- | --- | --- | --- | --- | --- |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-5 | qSimplified | `2·x+3` | right (key `2x+3`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-5 | qSimplified | `2×x+3` | right (key `2x+3`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-5 | rSimplified | `2·x+7` | right (key `2x+7`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-5 | rSimplified | `2×x+7` | right (key `2x+7`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-6 | uSimplified | `2·x-5` | right (key `2x-5`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-6 | uSimplified | `2×x-5` | right (key `2x-5`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-6 | vSimplified | `2·x-3` | right (key `2x-3`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-6 | vSimplified | `2×x-3` | right (key `2x-3`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-10 | twoJ | `4·x-2` | right (key `4x-2`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-10 | twoJ | `4×x-2` | right (key `4x-2`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-10 | jTwoX | `4·x-1` | right (key `4x-1`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#classwork/l2-cw-10 | jTwoX | `4×x-1` | right (key `4x-1`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#practice/l2-pr-12 | hSimplified | `3·x-2` | right (key `3x-2`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#practice/l2-pr-12 | hSimplified | `3×x-2` | right (key `3x-2`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#dol/l2-dol-2 | simplified | `3·x-5` | right (key `3x-5`) | wrong | wrong | right / right |
| algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json#dol/l2-dol-2 | simplified | `3×x-5` | right (key `3x-5`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations.json#classwork/m3l1-cw-16 | areaA | `6·(5+2·x)` | right (key `6(5+2x)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations.json#classwork/m3l1-cw-16 | areaA | `6×(5+2×x)` | right (key `6(5+2x)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations.json#classwork/m3l1-cw-16 | areaB | `8·(x+5)` | right (key `8(x+5)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations.json#classwork/m3l1-cw-16 | areaB | `8×(x+5)` | right (key `8(x+5)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#classwork/m3l1h-cw-16 | areaA | `6·(5+2·x)` | right (key `6(5+2x)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#classwork/m3l1h-cw-16 | areaA | `6×(5+2×x)` | right (key `6(5+2x)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#classwork/m3l1h-cw-16 | areaB | `8·(x+5)` | right (key `8(x+5)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#classwork/m3l1h-cw-16 | areaB | `8×(x+5)` | right (key `8(x+5)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-11 | a | `65 + 45·h` | right (key `65 + 45h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-11 | a | `65 + 45×h` | right (key `65 + 45h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-11 | b | `35 + 52.5·h` | right (key `35 + 52.5h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-11 | b | `35 + 52.5×h` | right (key `35 + 52.5h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-13 | tri | `6·x + 4` | right (key `6x + 4`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-13 | tri | `6×x + 4` | right (key `6x + 4`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-13 | sq | `4·(x + 3)` | right (key `4(x + 3)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-13 | sq | `4×(x + 3)` | right (key `4(x + 3)`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-14 | sum | `3·n + 6` | right (key `3n + 6`) | wrong | wrong | right / right |
| algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json#practice/m3l1h-pr-14 | sum | `3×n + 6` | right (key `3n + 6`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-11 | a | `30 + 25·m` | right (key `30 + 25m`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-11 | a | `30 + 25×m` | right (key `30 + 25m`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-11 | b | `40·m` | right (key `40m`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-11 | b | `40×m` | right (key `40m`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-12 | p | `2·(2·x + 3) + 2·x` | right (key `2(2x + 3) + 2x`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-12 | p | `2×(2×x + 3) + 2×x` | right (key `2(2x + 3) + 2x`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-14 | tablet | `100 - 6·h` | right (key `100 - 6h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-14 | tablet | `100 - 6×h` | right (key `100 - 6h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-14 | phone | `80 - 4·h` | right (key `80 - 4h`) | wrong | wrong | right / right |
| algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json#practice/m3l3h-pr-14 | phone | `80 - 4×h` | right (key `80 - 4h`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#classwork/a2r1-cw-7 | mixed | `2·\|x\|y^2` | right (key `2\|x\|y^2`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#classwork/a2r1-cw-7 | mixed | `2×\|x\|y^2` | right (key `2\|x\|y^2`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#practice/a2r1-p-3@0 | simplified | `3·\|x^5\|y^6` | right (key `3\|x^5\|y^6`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#practice/a2r1-p-3@0 | simplified | `3×\|x^5\|y^6` | right (key `3\|x^5\|y^6`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#practice/a2r1-p-3@1 | simplified | `4·\|x\|y^4` | right (key `4\|x\|y^4`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#practice/a2r1-p-3@1 | simplified | `4×\|x\|y^4` | right (key `4\|x\|y^4`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#dol/a2r1-dol-1@0 | simplified | `5·\|x^5\|y^2` | right (key `5\|x^5\|y^2`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#dol/a2r1-dol-1@0 | simplified | `5×\|x^5\|y^2` | right (key `5\|x^5\|y^2`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#dol/a2r1-dol-1@1 | simplified | `2·\|x^3\|y^2` | right (key `2\|x^3\|y^2`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L1_nth_Roots.json#dol/a2r1-dol-1@1 | simplified | `2×\|x^3\|y^2` | right (key `2\|x^3\|y^2`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json#warmup/a2r2-wu-3@0 | binomials | `x²-64` | right (key `x^2-64`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json#warmup/a2r2-wu-3@1 | binomials | `x²-36` | right (key `x^2-36`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json#classwork/a2r2-cw-3 | second | `5·\|b^7\|k^5∜(k^3)` | right (key `5\|b^7\|k^5∜(k^3)`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json#classwork/a2r2-cw-3 | second | `5×\|b^7\|k^5∜(k^3)` | right (key `5\|b^7\|k^5∜(k^3)`) | wrong | wrong | right / right |
| algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json#classwork/a2r2-cw-11 | denominator | `a²` | right (key `a^2`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/1_Factoring_Polynomials.json#classwork/fp-cw-8 | trinomial | `4x²-2xy+y²` | right (key `4x^2-2xy+y^2`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/1_Factoring_Polynomials.json#classwork/fp-cw-8 | trinomial | `4·x^2-2xy+y^2` | right (key `4x^2-2xy+y^2`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/1_Factoring_Polynomials.json#classwork/fp-cw-8 | trinomial | `4×x^2-2xy+y^2` | right (key `4x^2-2xy+y^2`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json#classwork/rf-cw-8 | quotient | `x²-x-6` | right (key `x^2-x-6`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json#practice/rf-p-5 | quotient | `x²-2x-3` | right (key `x^2-2x-3`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json#practice/rf-p-5 | quotient | `x^2-2·x-3` | right (key `x^2-2x-3`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json#practice/rf-p-5 | quotient | `x^2-2×x-3` | right (key `x^2-2x-3`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/3_Radical_Expressions.json#classwork/rx-cw-3 | simplified | `5·\|b^7\|k^5∜(k^3)` | right (key `5\|b^7\|k^5∜(k^3)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/3_Radical_Expressions.json#classwork/rx-cw-3 | simplified | `5×\|b^7\|k^5∜(k^3)` | right (key `5\|b^7\|k^5∜(k^3)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/3_Radical_Expressions.json#practice/rx-p-3 | simplified | `10·\|x\|y√(3·y)` | right (key `10\|x\|y√(3y)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals/3_Radical_Expressions.json#practice/rx-p-3 | simplified | `10×\|x\|y√(3×y)` | right (key `10\|x\|y√(3y)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#practice/rxh-p-1@0 | simplified | `6·\|x^5\|y^2√(3·y)` | right (key `6\|x^5\|y^2√(3y)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#practice/rxh-p-1@0 | simplified | `6×\|x^5\|y^2√(3×y)` | right (key `6\|x^5\|y^2√(3y)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#practice/rxh-p-1@1 | simplified | `3·\|x^3\|y^3√(6·y)` | right (key `3\|x^3\|y^3√(6y)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#practice/rxh-p-1@1 | simplified | `3×\|x^3\|y^3√(6×y)` | right (key `3\|x^3\|y^3√(6y)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#dol/rxh-dol-1@0 | simplified | `8·\|m^3\|n^2√(10·n)` | right (key `8\|m^3\|n^2√(10n)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#dol/rxh-dol-1@0 | simplified | `8×\|m^3\|n^2√(10×n)` | right (key `8\|m^3\|n^2√(10n)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#dol/rxh-dol-1@1 | simplified | `8·\|m^5\|n^3√(3·n)` | right (key `8\|m^5\|n^3√(3n)`) | wrong | wrong | right / right |
| algebra2-polynomials-radicals-honors/3_Radical_Expressions_Honors.json#dol/rxh-dol-1@1 | simplified | `8×\|m^5\|n^3√(3×n)` | right (key `8\|m^5\|n^3√(3n)`) | wrong | wrong | right / right |

### Left for the owner (firm): a simplified polynomial in brackets (58 answers)

A box with `answerForm: simplifiedPolynomial` refuses the right polynomial
with brackets round the whole answer: `(3a^2-2a)` for `3a^2-2a`, `(-12x^7)`
for `-12x^7`. It also refuses a negative constant written `+(-63)`.
`simplifiedPolynomialForm.mjs` documents this rule ("grouping: no brackets
around letters"), and the Simplify control holds the same one. Brackets round
the whole answer leave nothing to do, so the rule may be stricter than meant
there. Whether that counts as simplest form is a ruling for the owner, not a
bug to change in an audit, so it is **not changed**. It is listed in
`scripts/grading-parity-real-items-review.json`, so the audit stays green on it
and goes red on anything new.

| Item | Box | Input | Expected | Screen | Server | Status |
| --- | --- | --- | --- | --- | --- | --- |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#warmup/opp-wu-1 | single | `(-12x^7)` | right (key `-12x^7`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#warmup/opp-wu-1 | double | `(-10a^4b^3)` | right (key `-10a^4b^3`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#warmup/opp-wu-2 | opposite | `(-a^3+3a-2)` | right (key `-a^3+3a-2`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#warmup/opp-wu-2 | opposite | `-a^3+3a+(-2)` | right (key `-a^3+3a-2`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#warmup/opp-wu-2 | combine | `(3a^2-2a)` | right (key `3a^2-2a`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-5 | cypA | `(-x^2+x+2)` | right (key `-x^2+x+2`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-5 | cypB | `(-7x^2-5x+6)` | right (key `-7x^2-5x+6`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-6 | fixed | `(3y^2+4y+3)` | right (key `3y^2+4y+3`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-8 | cyp | `(-3x^4+2x^2-5x)` | right (key `-3x^4+2x^2-5x`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-8 | twoLetters | `(6x^3y-9x^3y^2+12x^4y^3)` | right (key `6x^3y-9x^3y^2+12x^4y^3`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-9 | profit | `(-0.001x^2+5x-500)` | right (key `-0.001x^2+5x-500`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-9 | profit | `-0.001x^2+5x+(-500)` | right (key `-0.001x^2+5x-500`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-11 | product | `(x^3+7x^2+10x-8)` | right (key `x^3+7x^2+10x-8`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#classwork/opp-cw-11 | product | `x^3+7x^2+10x+(-8)` | right (key `x^3+7x^2+10x-8`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-1 | p9 | `(-2x^2-6x+3)` | right (key `-2x^2-6x+3`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-1 | p29 | `(3b^2+6b-5)` | right (key `3b^2+6b-5`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-1 | p29 | `3b^2+6b+(-5)` | right (key `3b^2+6b-5`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-2 | p34 | `(-6a^3+4a^2+8a-9)` | right (key `-6a^3+4a^2+8a-9`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-2 | p34 | `-6a^3+4a^2+8a+(-9)` | right (key `-6a^3+4a^2+8a-9`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-3 | p13 | `(n^2-2n-63)` | right (key `n^2-2n-63`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-3 | p13 | `n^2-2n+(-63)` | right (key `n^2-2n-63`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-3 | p11 | `(8ab+10a)` | right (key `8ab+10a`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-3 | p30 | `(3np^2-3pz)` | right (key `3np^2-3pz`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-4 | p35 | `(10c^3-c^2+4c)` | right (key `10c^3-c^2+4c`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-8 | first | `(x+165)` | right (key `x+165`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-8 | second | `(180-y)` | right (key `180-y`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-9 | interest | `(0.003x+24.7)` | right (key `0.003x+24.7`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-10 | total | `(0.155x^2+8.818x+835.8)` | right (key `0.155x^2+8.818x+835.8`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-10 | difference | `(0.061x^2-10.57x+112.4)` | right (key `0.061x^2-10.57x+112.4`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-12 | square | `(16n^2-40n+25)` | right (key `16n^2-40n+25`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-12 | cube | `(64n^3-240n^2+300n-125)` | right (key `64n^3-240n^2+300n-125`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#practice/opp-pr-12 | cube | `64n^3-240n^2+300n+(-125)` | right (key `64n^3-240n^2+300n-125`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#dol/opp-dol-3 | profit | `(-0.002x^2+8x-350)` | right (key `-0.002x^2+8x-350`) | wrong | wrong | firm |
| algebra2-honors-module2/L1_Operations_on_Polynomials.json#dol/opp-dol-3 | profit | `-0.002x^2+8x+(-350)` | right (key `-0.002x^2+8x-350`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#warmup/dp-wu-1 | single | `(6x^3)` | right (key `6x^3`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#warmup/dp-wu-1 | double | `(-4m^2n^2)` | right (key `-4m^2n^2`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#warmup/dp-wu-2 | trinomial | `(14w^3+56w^2-35w)` | right (key `14w^3+56w^2-35w`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#warmup/dp-wu-2 | binomial | `(-3x^2-9x)` | right (key `-3x^2-9x`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#warmup/dp-wu-3 | general | `(5a^2-6ab+3b^2)` | right (key `5a^2-6ab+3b^2`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#warmup/dp-wu-3 | division | `(5x)` | right (key `5x`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#classwork/dp-cw-1 | t2 | `(-3b^2)` | right (key `-3b^2`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#classwork/dp-cw-1 | t3 | `(2a^2b^3)` | right (key `2a^2b^3`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#classwork/dp-cw-1 | quotient | `(a-3b^2+2a^2b^3)` | right (key `a-3b^2+2a^2b^3`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#classwork/dp-cw-2 | quotient | `(1+2x^3y-3x^5y^2)` | right (key `1+2x^3y-3x^5y^2`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-1 | p12 | `(3a^2b-2ab^2)` | right (key `3a^2b-2ab^2`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-1 | p15 | `(2a^2-3+b)` | right (key `2a^2-3+b`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-1 | p15 | `2a^2+(-3)+b` | right (key `2a^2-3+b`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-2 | energy | `(-b-600)` | right (key `-b-600`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-2 | energy | `-b+(-600)` | right (key `-b-600`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-2 | polynomialPart | `(-w+16)` | right (key `-w+16`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-8 | base | `(6x^2+19x+15)` | right (key `6x^2+19x+15`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-8 | other | `(3x+5)` | right (key `3x+5`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-10 | expression | `(8x+40)` | right (key `8x+40`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-16 | p36 | `(x^3+x^2y+xy^2+y^3)` | right (key `x^3+x^2y+xy^2+y^3`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#practice/dp-pr-16 | p41quotient | `(3z^4-z^3+2z^2-4z+9)` | right (key `3z^4-z^3+2z^2-4z+9`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#dol/dp-dol-1 | t1 | `(2x^2y)` | right (key `2x^2y`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#dol/dp-dol-1 | t2 | `(-3x)` | right (key `-3x`) | wrong | wrong | firm |
| algebra2-honors-module2/L2_Dividing_Polynomials.json#dol/dp-dol-1 | quotient | `(2x^2y-3x+1)` | right (key `2x^2y-3x+1`) | wrong | wrong | firm |

### Needs review (the independent reading could not confirm the answer, 5)

- `y^(0.5)+1` for `y^(1/2)+1`, `3x^(0.75)` for `3x^(3/4)` and two more
  (Rational Exponents lessons): a decimal exponent where the lesson is about
  rational exponents. Probably the form the item asks for, so probably
  right to refuse. Not changed.
- `x√\frac{\left(xy\right)}{y^4}` for `x√(xy)/y^4`: the editor-spelling
  generator's reading of an ASCII key whose radical's extent is ambiguous.
  Likely a generator artefact, not a student's answer.

| Item | Box | Input | Expected | Screen | Server | Status |
| --- | --- | --- | --- | --- | --- | --- |
| algebra2-polynomials-radicals/3_Radical_Expressions.json#practice/rx-p-4 | first | `x√\frac{\left(xy\right)}{y^4}` | right (key `x√(xy)/y^4`) | wrong | wrong | needs review |
| algebra2-polynomials-radicals/4_Rational_Exponents.json#classwork/re-cw-8 | conjugate | `y^(0.5)+1` | right (key `y^(1/2)+1`) | wrong | wrong | needs review |
| algebra2-polynomials-radicals-honors/4_Rational_Exponents_Honors.json#practice/reh-p-3 | g | `3x^(0.75)` | right (key `3x^(3/4)`) | wrong | wrong | needs review |
| algebra2-polynomials-radicals-honors/4_Rational_Exponents_Honors.json#dol/reh-dol-3@0 | gcf | `5x^(0.25)` | right (key `5x^(1/4)`) | wrong | wrong | needs review |
| algebra2-polynomials-radicals-honors/4_Rational_Exponents_Honors.json#dol/reh-dol-3@1 | gcf | `x^(0.2)` | right (key `x^(1/5)`) | wrong | wrong | needs review |

## Content issues for the owner

**None found.** Every item's own key is right on both paths. Three
follow-through boxes (Thanksgiving packets: `tg-u5-h1` intercept,
`tgp-u10-2` and `tgp-u11-6` value) write their follow-through rule as a
calculation (`1 - 4*{slope}`, `{root}^2`) in a number box. The audit checked
these. The box's own value key (`-5`) is right, a value carried from a wrong
earlier part (`-7` after a slope of `2`) earns follow-through credit, and the
same value off by one does not. They work as intended and are listed here
only because a calculation in a number box's key looks like a mistake.

## What this audit does not cover

- Tool items get the parity half only. An item holds no worked key the audit
  could spell, so a tool verdict is compared device against server, not
  against the key. The fuzz harness's `structuredWork` target and the tool
  contract tests hold tool correctness.
- The screen's "words" box (`shouldUsePlainTextInput`, inside
  `MultiAnswerGrader.jsx`, which node cannot import) is read from the field's
  declared `type`/`inputMode` only. No typed box in these lessons is a words
  box.
- Both paths run in one process, so the form comparators
  (`formSpecificFieldGrading.mjs`) are loaded for both. That every screen
  loads them is held by its import in `MultiAnswerGrader.jsx` and by the
  existing contract tests, not by this audit.
