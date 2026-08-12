# MathMaster finite-set grading fix — 2026-08-11

## Failure reproduced

The student-facing answer `{-4, -3, -2, -1, 0, 1, 2}` was visibly identical to the authored answer but could be rejected because MultiAnswer used generic string/math normalization. MathLive can serialize visible set braces as `\\{...\\}`, `\\left\\{...\\right\\}`, or `\\lbrace...\\rbrace`, while the JSON key used literal `{...}`.

That was only the first failure. Finite sets were being graded as strings, so a mathematically identical roster written in a different element order could also be rejected.

The supplied Lesson 1 JSON contains three fields affected by this same class of problem:
- Question 1 roster form.
- Question 8 domain.
- Question 8 range.

Question 8 also has a deterministic yes/no field that should be a selector rather than a typed magic word.

## Platform solution

MathMaster now has shared finite-set answer semantics used by the classroom client and Path server contracts.

- MathLive brace forms and literal braces normalize to the same set delimiters.
- Finite roster sets compare by mathematical elements rather than string order.
- Repeated roster elements do not change the set.
- A roster answer still has to be written as a set; a bare comma list does not silently pass.
- Empty-set notation is recognized.
- Existing numeric, fraction, inequality, infinity and union normalization remains supported.
- V4/V5 intake automatically recognizes authored answers such as `{-4, -3, -2}` as set fields. AI authors do not need another special rule to remember.
- Existing saved assignments are protected at runtime because MultiAnswer also detects set semantics from the accepted answer.
- Set fields now receive a set-specific math toolbar with `{`, `}`, comma and `∅` controls.
- Common binary labels such as `(yes/no)`, `true/false`, `discrete/continuous`, and `finite/infinite` are promoted to selectors when the correct answer makes the choice unambiguous.
- Secure Path multiAnswer payloads preserve safe input metadata (`type`, `options`, `toolProfile`) while keeping expected answers private.

## Exact supplied JSON check

The 12-question Lesson 1 JSON was run through the updated intake and semantic checks.

MathMaster automatically compiled:
- Question 1 roster field -> `type: set`, set toolbar.
- Question 8 domain -> `type: set`, set toolbar.
- Question 8 range -> `type: set`, set toolbar.
- Question 8 yes/no field -> `type: choice`, options `yes` and `no`.

Result: 0 structural errors, 0 semantic errors, 0 semantic warnings.

The exact visible roster answer was tested against these MathLive serializations and all grade correct:
- `{-4,-3,-2,-1,0,1,2}`
- `\\{-4,-3,-2,-1,0,1,2\\}`
- `\\left\\{-4,-3,-2,-1,0,1,2\\right\\}`
- `\\left\\lbrace -4,-3,-2,-1,0,1,2 \\right\\rbrace`

A reordered roster such as `{2,1,0,-1,-2,-3,-4}` also grades correct. A roster with the wrong member still grades incorrect.

## Validation

Focused answer-equivalence and Path response-contract tests pass. Authoring compiler, V5, and semantic tests also pass in the isolated test harness. JSX syntax/transpilation and changed JS syntax checks pass.

A full Vite production build was not run in this sandbox because the complete npm dependency installation is not present. Run `npm ci`, then `npm run build` in Cloud Shell before deployment.
