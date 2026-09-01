# MathMaster Attempt and Graphing Architecture

## Why these features are centralized

Attempt limits, replacement-question rules, deadline behavior, and question-card colors are assignment-wide policies. Keeping them inside each grader would duplicate code and eventually create inconsistent behavior. They now live in `src/attemptPolicy.js` and are applied by `QuestionEngine.jsx` and `App.jsx` to every question type.

The graph-construction interface is also shared. `src/FunctionGraphBuilder.jsx` handles all supported transformed parent functions while `src/functionGraphUtils.js` contains the safe numeric function definitions, key points, suggested points, graph windows, equation formatting, and grading rules.

## Attempt lifecycle

Attempt count is resolved from both the activity role and the response interaction.

- Constructed instructional work in Warm-Up/Classwork/Practice normally keeps the section policy of three attempts so feedback and revision are meaningful.
- A **pure finite-choice question gets exactly one attempt per issued/generated version**, regardless of section. Repeated guesses on four choices are not useful evidence.
- Mixed questions such as "choose a classification, then justify it" are not treated as pure multiple choice and keep the normal instructional attempt policy.
- DOL, quiz, test, diagnostics, and retention probes remain one-attempt checks under their own role policies.
- For classroom Warm-Up/Classwork/Practice, **Request New Question** is offered after a missed choice item only when the blueprint can genuinely change the mathematics through a generator or multiple authored variants. MathMaster never resets the same static choices and calls them a fresh question.
- My Math Path applies the same one-attempt finite-choice rule on the server and then routes a finalized miss to a fresh bank question.
- Generated replacement cycles remain unlimited before the assignment deadline where the activity policy permits replacement.
- After the deadline, assignment work remains available in Practice Mode without changing Firestore grades.

Only these compact values are stored for each question:

- status
- attempts used on the current variant
- total attempts
- current variant index
- time spent
- question details

The platform does not store a full generated question copy or a growing answer-history array for every attempt.

## Interactive graphing workflow

The `functionGraph` question type supports:

- absolute value
- quadratic
- square root
- cubic
- cube root
- logarithmic
- exponential
- rational

Students:

1. Plot the center or key point.
2. Plot four additional points.
3. Press **Connect Graph**.
4. Submit the completed graph.

For rational functions, the first marker is the intersection of the vertical and horizontal asymptotes. It is not treated as a point on the function, and the four graph points must cover both branches.

## JSON example

```json
{
  "type": "functionGraph",
  "prompt": "Plot the center or key point and four additional points. Then connect the graph.",
  "showEquation": true,
  "generator": {
    "kind": "parentFunctionGraph",
    "functionTypes": [
      "absolute",
      "quadratic",
      "squareRoot",
      "cubic",
      "cubeRoot",
      "logarithmic",
      "exponential",
      "rational"
    ],
    "coefficientChoices": [-2, -1, 1, 2],
    "hRange": [-3, 3],
    "kRange": [-3, 3],
    "baseChoices": [2]
  }
}
```
