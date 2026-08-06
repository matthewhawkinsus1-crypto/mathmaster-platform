# MathMaster Scratchpad, Undo, Multipart Grading, Graph, and Algebra Architecture

## 1. Full-screen scratchpad

`ScratchpadOverlay.jsx` uses the native HTML5 canvas and pointer events. No new drawing dependency was added. This keeps the student bundle smaller and avoids loading a second canvas framework.

The overlay provides:

- Black, blue, and red pen colors
- Eraser
- Stroke-level Undo
- Clear All with one-step restoration
- Save and Close
- Current-question directions in a translucent floating panel
- Mouse, stylus, and touch support

The canvas is compressed before saving. The export is resized to a practical maximum and encoded as WebP when supported, with JPEG fallback.

## 2. Firebase student-work storage

Scratchpad images are not placed inside `gradesByAssignment`. Each question uses a separate document:

```text
grades/{studentId}/scratchpads/{assignmentId}__question_{questionIndex}
```

That document contains the Base64 data URL, assignment/question identifiers, variant number, dimensions, MIME type, approximate byte size, and update time. Separating the image from the grade tracker prevents every grade update from rewriting a large image string.

The teacher question-detail card contains **View Student Work**, which reads that document and reconstructs the image. Permanent assignment deletion now removes linked scratchpad documents as well as grade data.

## 3. Shared Undo service

`useUndoHistory.js` is the common bounded-history hook. `QuestionEngine.jsx` exposes one **Undo Last Action** control and lets the active question module register the appropriate undo operation.

The shared control supports:

- Standard answer fields
- Multiple-answer fields
- Tables
- Number lines
- Ordered pairs and systems
- Graph point placement, chosen x-values, sketches, endpoints, and analysis selections
- Pending algebra operations and cancellation marks

The scratchpad keeps a separate stroke history because its drawing actions should not overwrite the question-response history.

## 4. Multipart grading and feedback

Every grader can return a `parts` array:

```json
{
  "id": "range",
  "label": "Range in inequality notation",
  "isComplete": true,
  "isCorrect": false,
  "response": "y>2"
}
```

`attemptPolicy.js` stores a compact `partGrades` array, calculates proportional partial credit, preserves the best partial credit, and caps incomplete-question credit below full mastery. After submission, the student sees the exact incorrect fields. Correct fields remain highlighted and do not need to be re-entered.

Graph construction records each point, curve snap, and endpoint marker as a separate graded part. Graph analysis records each feature, domain, and range request separately.

## 5. Graph construction improvements

`InteractiveGraphWorkspace.jsx` and `interactiveGraphEngine.js` now provide:

- Curves sampled inside the graph boundary instead of clipping at the outer edge
- Dense path segments that prevent steep arms from bending sideways
- Continuation arrows at visible path ends
- High-contrast teal plotted points
- Translucent coordinate labels
- A highlighted drop halo and graph border while dragging
- Neutral dispenser cards before validation
- Undo for incorrect placements
- Explicit Arrow, Open Circle, and Closed Circle descriptions
- Student-selected outer x-values with the key point fixed in the middle
- Duplicate-x protection
- Two x-values on each side of the center for two-sided families
- Domain validation for square-root and logarithmic points
- Two-branch validation for rational functions

## 6. Multipart graph analysis

A graph-analysis blueprint may combine coordinate selections and set-notation answers:

```json
"analysisRequests": [
  {
    "id": "roots",
    "kind": "point",
    "feature": "xIntercepts",
    "label": "Select both x-intercepts"
  },
  {
    "id": "domain",
    "kind": "domain",
    "notation": "interval",
    "label": "Domain in interval notation"
  },
  {
    "id": "range",
    "kind": "range",
    "notation": "inequality",
    "label": "Range in inequality notation"
  }
]
```

The math toolbar changes contextually. Interval and inequality questions expose only parentheses, brackets, inequalities, union, intersection, and positive/negative infinity.

## 7. Interactive algebra upgrades

The shared algebra AST engine supports numeric equations, literal equations, and slope-intercept transformations.

When a student applies an operation:

1. The unsimplified operation appears immediately on both sides.
2. A mirrored operation chip animates onto the opposite side.
3. The student draws a line through the inverse pair that cancels.
4. A brief strike-through animation plays.
5. Both sides simplify and the balanced equation state is preserved.

Multiplication is presented by juxtaposition or a coefficient beside parentheses rather than a multiplication dot. Symbolic operations may include terms such as `2x`, `b`, or `a-c`. Division by a symbolic expression shows the required nonzero assumption.

Objectives are configured centrally:

```json
"objective": {
  "kind": "isolate",
  "variable": "h",
  "simplifyRequired": true
}
```

or:

```json
"objective": {
  "kind": "slopeIntercept",
  "variable": "y",
  "simplifyRequired": true,
  "targetForm": "y=mx+b"
}
```

Exploratory mode allows safe but inefficient balanced moves. Rigorous mode rejects unproductive moves, shakes the workspace, and uses the shared three-attempt policy.

## 8. Performance choices

- No new runtime dependency was added.
- Scratchpad images are compressed and isolated from normal grade writes.
- Undo histories are bounded.
- Student problems remain deterministic local variants generated from the compact JSON blueprint.
- Dense graph samples, canvas strokes, and generated question copies are not stored in the main grade record.
- `stepGrades` and `partGrades` remain compact and bounded.
