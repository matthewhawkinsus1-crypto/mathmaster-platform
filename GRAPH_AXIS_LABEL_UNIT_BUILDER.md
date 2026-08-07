# Graph Axis Label, Unit, and Scale Builder

This update lets graph questions deliberately hide axis information when that information is itself part of the student task.

## Static graph visibility

Any `GraphDisplay` graph may use:

```json
"axisDisplay": {
  "showXTickLabels": false,
  "showYTickLabels": false,
  "showAxisTitles": false,
  "showAxisSymbols": true
}
```

Optional graph metadata:

```json
"xAxisLabel": "Time",
"xAxisUnit": "minutes",
"yAxisLabel": "Water remaining",
"yAxisUnit": "gallons"
```

## Relationship-model graph building

Use these fields inside `axisSetup`:

```json
{
  "required": true,
  "requireScale": true,
  "inputMode": "drag",
  "applyToGraph": true,
  "hideGraphLabels": true,
  "hideGraphUnits": true,
  "hideGraphScale": true
}
```

`inputMode` accepts `type` or `drag`.

- `type`: the student types labels and units. The graph updates immediately.
- `drag`: the student drags quantity and unit cards to X/Y axis targets. On touch devices the student can tap a card then tap the target.
- `applyToGraph`: student responses become the graph's live axis labels, units, and count-by scale.
- `hideGraphLabels`: supplied graph labels stay hidden until the student provides a response.
- `hideGraphUnits`: supplied graph units stay hidden until the student provides a response.
- `hideGraphScale`: numeric tick labels stay hidden independently on each axis until the student supplies a positive count-by value for that axis.

The student's own response is shown before grading. A wrong response therefore appears on the graph exactly as entered and can be revised after feedback.
