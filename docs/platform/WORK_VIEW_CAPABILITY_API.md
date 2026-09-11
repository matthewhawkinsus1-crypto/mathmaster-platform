# Work View capability API

`EnlargeableFigure` is the single Work View entry point. A tool passes a
`capabilities` object; `QuestionEngine` contributes platform actions through
`WorkViewCapabilityProvider`. Nested values merge, with the tool's more
specific descriptor winning and action lists appended.

```jsx
<EnlargeableFigure
  label="Coordinate construction"
  capabilities={{
    fitView: { label: 'Fit View', onAction: resetCamera, cameraOnly: true },
    panZoom: { label: 'Pan and zoom', cameraOnly: true },
    pointEditing: { label: 'Edit points', studentState: true },
    numericControls: { label: 'Model controls', studentState: true },
    equationInput: { label: 'Equation', studentState: true },
    tableData: { label: 'Data table' },
    instruction: { text: currentInstruction },
    task: { text: originalTask },
    help: { content: helpPanel },
    primaryActions: [{ id: 'check', label: 'Check', onAction: check }],
    secondaryActions: [{ id: 'clear', label: 'Clear', onAction: clear }],
  }}
>
  {existingToolInstance}
</EnlargeableFigure>
```

Supported keys are `undo`, `redo`, `fitView`, `panZoom`, `pointEditing`,
`numericControls`, `equationInput`, `tableData`, `instruction`, `task`, `help`,
`primaryActions`, and `secondaryActions`. Actions accept `id`, `label`,
`onAction` (or legacy `onClick`), `disabled`, and `title`.

## State rules

* The child is the existing tool instance. Never pass a factory and never mount
  a second copy for Work View.
* `cameraOnly: true` marks Fit/pan/zoom. Camera changes do not register with
  Universal Undo.
* `studentState: true` describes mathematical edits. Their tool-owned state may
  register Undo through `QuestionEngine`; the shell never snapshots it.
* Task/help drawers and viewport/orientation values are presentation state and
  never enter response payloads.

The shell maintains one stable figure position across embedded and enlarged
layouts. Desktop uses a compact side action rail. At 720px and below the rail
moves to the bottom, secondary capability labels disappear, Task/Help use thin
header drawers, and `visualViewport.height` plus safe-area insets determine the
usable workspace.
