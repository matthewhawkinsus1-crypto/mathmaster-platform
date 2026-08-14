# MathMaster — Question-First Assignment View + Guided Notes Upgrade

Date: 2026-08-13
Base: MathMaster current-main Live Challenge v5 magnetic graph snapping build

## Student assignment layout

- The large Warm-Up/Classwork/Practice/DOL question-card map is collapsed by default.
- A compact Assignment Overview row remains visible on desktop and shows per-section completion counts.
- Students can expand the full card map when they want the visual overview.
- The existing sticky Previous / question picker / Next navigation remains the primary navigation.
- Opening an assignment or changing questions automatically scrolls the active question workspace below the sticky navigator.
- Selecting a question from the expanded overview collapses the overview again.
- Phone portrait mode continues to hide the large overview entirely.

## Guided Notes behavior

Guided Notes now follows a strict rule: meaningful mathematical instruction or no panel.

### Quality gate
The runtime rejects generic filler such as:
- Read the question.
- Identify what is being asked.
- Complete the response field.
- Solve the problem.
- Think carefully.
- Check your answer.

### Sources, in priority order
1. Meaningful `guidedNotes.steps` authored in V5 JSON.
2. MathMaster-derived, tool/workflow-aware guidance.
3. Nothing — the panel is suppressed rather than showing filler.

### Workflow synchronization
For composed questions, Guided Notes follows the first unfinished workflow stage. For example:
- equationInput → write the mathematical relationship and check units;
- tableInput → substitute displayed inputs and preserve exact values;
- functionGraph / coordinatePlot → graph from the student's established equation/table;
- domainInput / rangeInput → choose notation appropriate to continuous/discrete relationships;
- classification → reason from the context about discrete versus continuous.

The Guided Notes panel is compact/collapsible. When a composed workflow is complete it collapses to a completed state, but the student may reopen it for review.

## Teacher Preflight control

Classwork and Practice each receive a Guided Notes setting:
- Automatic — use authored notes, otherwise derive meaningful notes.
- Authored only — show the panel only when meaningful notes were included in the JSON.
- Off.

Defaults:
- Classwork: Automatic
- Practice: Off

Older assignments without this setting automatically use the same defaults.

## V5 authoring contract

The AI authoring contract now accepts optional:

```json
"guidedNotes": {
  "steps": [
    {
      "title": "Use the unit rate",
      "instruction": "Substitute each time input into V(t)=1.8t and keep exact decimal outputs."
    }
  ]
}
```

The contract explicitly forbids generic interface narration and tells authors not to reveal a value the student has not yet established.

## Validation performed

- 274 source JS/JSX/MJS files parsed with TypeScript parser: 0 syntax failures.
- 29 focused regression tests passed across Guided Notes, section access, Warm-Up lifecycle, Live Challenge, magnetic graph snapping, and student-experience logic.
- Dedicated Guided Notes tests confirm filler suppression, authored-note priority, workflow-stage mapping, authored-only/off behavior, and V5 compiler preservation.

A complete Vite production build was not run in the artifact environment because project `node_modules` are intentionally not packaged in the project ZIP. Run `npm install` / `npm run build` in Cloud Shell before pushing to main.
