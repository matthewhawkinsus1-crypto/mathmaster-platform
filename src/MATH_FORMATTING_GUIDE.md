# MathMaster Personalized Questions, Math Input, and Graph Guide

## 1. How personalization stays fast

The database stores only the JSON blueprint. MathMaster combines the assignment ID, student ID, and question number to generate a stable version in the browser.

This avoids storing hundreds of duplicated question objects. A student's version remains unchanged after refresh, logout, or Practice Mode.

Every new question must contain either:

- a supported `generator` object, or
- at least two complete objects inside `variants`

## 2. Systems of equations

```json
{
  "type": "system",
  "prompt": "Solve the system. Enter the solution as an ordered pair.",
  "showEquations": true,
  "showGraph": true,
  "generator": {
    "kind": "linearSystem",
    "xRange": [-10, 10],
    "yRange": [-10, 10],
    "slopeChoices": [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]
  }
}
```

The generator chooses an integer intersection first and builds two different lines through it. Distinct slopes guarantee one solution.

## 3. Function tables with multiple blanks

```json
{
  "type": "table",
  "prompt": "Complete the missing values in the table.",
  "showRule": true,
  "generator": {
    "kind": "functionTable",
    "ruleType": "linear",
    "rowCount": 5,
    "blankCount": 3,
    "slopeRange": [-6, 6],
    "interceptRange": [-12, 12]
  }
}
```

Use `"ruleType": "quadratic"` for a quadratic input-output table.

## 4. Ordered-pair responses

```json
{
  "type": "orderedPair",
  "prompt": "Write the coordinates of the plotted point.",
  "generator": {
    "kind": "orderedPair",
    "xRange": [-99, 99],
    "yRange": [-99, 99],
    "windowRadius": 6
  }
}
```

Accepted formats include `(2, -3)`, decimals, and simple fractions such as `(1/2, -3/4)`.

## 5. Multiple required answers

Generated slope and intercept:

```json
{
  "type": "multiAnswer",
  "prompt": "Enter both the slope and y-intercept.",
  "generator": {
    "kind": "lineFeatures",
    "slopeRange": [-99, 99],
    "interceptRange": [-99, 99]
  }
}
```

Custom fields using variants:

```json
{
  "type": "multiAnswer",
  "prompt": "Enter all requested values.",
  "variants": [
    {
      "mathDisplay": { "value": "y = 2x - 3", "format": "ascii-math" },
      "answerFields": [
        { "id": "m", "label": "Slope m", "acceptedAnswers": ["2"] },
        { "id": "b", "label": "Y-intercept b", "acceptedAnswers": ["-3"] }
      ]
    },
    {
      "mathDisplay": { "value": "y = -4x + 5", "format": "ascii-math" },
      "answerFields": [
        { "id": "m", "label": "Slope m", "acceptedAnswers": ["-4"] },
        { "id": "b", "label": "Y-intercept b", "acceptedAnswers": ["5"] }
      ]
    }
  ]
}
```

## 6. Personalized literal equations

```json
{
  "type": "literal",
  "prompt": "Solve the literal equation for the indicated variable.",
  "generator": {
    "kind": "literalLinear",
    "coefficientRange": [2, 12],
    "constantRange": [-15, 15]
  }
}
```

## 7. Formatted math

Wrap inline prompt math in dollar signs:

```json
{
  "prompt": "Simplify $sqrt(x^2 + 9)$ and evaluate $log_2(x)$."
}
```

ASCII math examples:

- `sqrt(x + 4)`
- `x^2`
- `log_2(x)`
- `1/2`

Exact LaTeX requires doubled backslashes in JSON:

```json
{
  "formulaLatex": "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
}
```

## 8. Graphing more than one equation

```json
{
  "graph": {
    "xMin": -10,
    "xMax": 10,
    "yMin": -10,
    "yMax": 10,
    "functions": [
      { "type": "line", "m": 2, "b": 1 },
      { "type": "line", "m": -1, "b": 4 }
    ]
  }
}
```

Supported function types are `line`, `quadratic`, `absolute`, `squareRoot`, `exponential`, and `reciprocal`.
