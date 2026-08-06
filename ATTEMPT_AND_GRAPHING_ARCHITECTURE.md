# MathMaster Attempt and Graphing Architecture

## Why these features are centralized

Attempt limits, replacement-question rules, deadline behavior, and question-card colors are assignment-wide policies. Keeping them inside each grader would duplicate code and eventually create inconsistent behavior. They now live in `src/attemptPolicy.js` and are applied by `QuestionEngine.jsx` and `App.jsx` to every question type.

The graph-construction interface is also shared. `src/FunctionGraphBuilder.jsx` handles all supported transformed parent functions while `src/functionGraphUtils.js` contains the safe numeric function definitions, key points, suggested points, graph windows, equation formatting, and grading rules.

## Attempt lifecycle

1. A generated problem starts with three attempts.
2. The first or second unsuccessful submission changes the question card to amber and shows the remaining attempts.
3. The third unsuccessful submission marks that generated version expired.
4. The student presses **Request New Question**.
5. The stored `variantIndex` increases by one and a new deterministic problem is generated at the same difficulty.
6. This cycle is unlimited before the assignment deadline.
7. After the deadline, it remains available in Practice Mode without changing Firestore grades.

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
