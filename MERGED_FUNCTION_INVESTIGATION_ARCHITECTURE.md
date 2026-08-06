# MathMaster Merged Function Investigation Architecture

## 1. One shared function workflow

`InteractiveGraphWorkspace.jsx` now owns the complete function workflow instead of separating graph construction and graph analysis into different tools.

The recommended question type is:

```json
"type": "functionInvestigation"
```

A question may enable any combination of these stages:

1. Select or receive x-values.
2. Place the graph points.
3. Validate point placement.
4. Draw and snap the function curve.
5. Add end-behavior markers.
6. Analyze the completed graph.

The same deterministic generator still creates a stable version from the assignment, student, question, and replacement-variant identifiers. The JSON stores the compact blueprint rather than a full copy of every student's generated graph.

## 2. Precision placement assistance

While a point is over the coordinate plane, the workspace displays:

- A high-contrast vertical guide line.
- A high-contrast horizontal guide line.
- A visible point halo.
- A translucent coordinate label when coordinate scaffolding is enabled.
- A highlighted graph border when releasing the point will place it.

Point cards remain neutral before validation. Their color no longer implies that the answer has already been checked.

## 3. Curve and end-behavior grading

Function curves stop inside the coordinate-plane boundary. If a function continues, an arrow communicates continuation instead of forcing the sampled line into the edge of the drawing area.

Each end is graded as a separate multipart response. A student may submit with an incorrect arrow, open circle, or closed circle. The response earns or loses credit for that part without blocking submission.

The marker tools are described to students by purpose:

- Arrow — the function continues.
- Open circle — the endpoint is excluded.
- Closed circle — the endpoint is included.

During dragging, only a translucent symbol is shown. A larger magnetic placement radius makes the tools easier to place without covering the graph.

## 4. Restricted domains

All supported function families may carry a domain restriction in the blueprint or generated variant. The graph engine uses the restriction when it:

- Evaluates points.
- Generates suggested points.
- Auto-scales the graph window.
- Draws the visible path.
- Determines whether each finite endpoint is open or closed.
- Determines whether the function continues toward either side.
- Calculates domain, range, and monotonic intervals.

This applies to absolute-value, quadratic, square-root, cubic, cube-root, logarithmic, exponential, and rational functions.

## 5. Merged graph analysis

`analysisRequests` may ask for several pieces in the same question. Supported response families include:

- X-intercepts and y-intercepts.
- Vertex.
- Local or absolute maximum and minimum.
- Rational center.
- Domain and range.
- Increasing, decreasing, and constant intervals.
- Does-not-exist selections.
- Clicked coordinate points.
- Hand-entered ordered pairs.
- A combination of clicking and typing for the same requested feature.

Every requested item reports its own grade part. Correct responses remain preserved while feedback identifies only the parts that need revision.

## 6. Shared partial-credit model

Graph construction and analysis report separate grade parts for:

- Each chosen x-value when required.
- Each plotted point.
- Undefined classifications.
- Curve construction.
- Each end location.
- Each end-marker type.
- Each requested graph feature.
- Each interval or notation response.

The shared question engine can therefore calculate partial credit without requiring every response to be correct before submission.

## 7. Full-question correctness watermark

When every required part is correct, `QuestionEngine.jsx` renders a large translucent green check and Correct watermark centered over the question. The overlay does not intercept pointer events and therefore does not interfere with navigation or review.

## 8. Algebra cancellation and simplification

The step algebra engine distinguishes cancellation from simplification:

- The student crosses out terms only on the side containing a zero pair or identity pair.
- The opposite side receives its own simplification response when simplification is needed.
- The platform checks algebraic equivalence rather than requiring one exact string.
- Multiplication is displayed with a coefficient beside a variable or with parentheses, not with a multiplication dot.

The shared engine supports numeric equations, literal equations, and slope-intercept objectives.

## 9. Algebraic micro-prompts

A step-algebra blueprint may provide `algebraPrompts`. These accept algebraic expressions and use equivalence checking, allowing prompts involving distribution and simplification in either Exploratory or Rigorous mode.

## 10. Shared services retained

The update continues to use the existing shared services for:

- Three attempts per generated question version.
- Unlimited replacement questions before the deadline.
- Practice Mode after the deadline without grade changes.
- Shared Undo.
- Student scratchpads stored separately from compact grade records.
- Teacher access to saved student work.
