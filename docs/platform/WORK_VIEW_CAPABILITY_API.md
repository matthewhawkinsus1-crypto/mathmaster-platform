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
layouts. Desktop uses a compact side action rail; compact screens move it to a
bottom row, drop secondary capability labels, put Task/Help in thin header
drawers, and take the usable workspace from `visualViewport` plus safe-area
insets. **Responsive behaviour** below has the full rules, including the short
landscape phone that keeps a rail.

## Universal Undo for tool-registry tools

`QuestionEngine` has owned one shared Undo controller since before Work View,
and the older modules register with it through an `onUndoStateChange` prop. A
registry tool is mounted with `questionData` and `onAction` and nothing else,
which is why each of them grew an Undo button of its own and no two of them
took back the same amount of work. The channel is opened once at the call site
and a tool joins it with one hook:

```jsx
const mathState = useMemo(() => ({ points, a, b, h, k }), [points, a, b, h, k]);
const restore = useCallback((previous) => { setPoints(previous.points); /* … */ }, []);
const undo = useMathUndoHistory({ label: 'Undo the last point', state: mathState, onRestore: restore });

<EnlargeableFigure capabilities={{ undo: undo.capability, /* … */ }}>
```

* The tool keeps its own `useState`. The hook holds previous states for the
  stack and reads the live one from the render it is called in; nothing is
  copied into a second owner.
* `mathematicalSnapshot` strips camera and presentation keys before two states
  are compared, so Fit, pan, zoom, opening Work View, opening a drawer and
  rotating the device record nothing. Camera exclusion is a property of the
  data, not a rule each tool has to remember.
* Several sequential undos walk back through several edits. History survives
  Work View open/close because the shell is a CSS change around a child that is
  never remounted.
* Remove a tool's local Undo only once those tests pass for that tool.

## Capabilities published upward

Fit View, pan/zoom and point editing belong to `CoordinatePlane` — it owns the
camera and converts every click. A tool whose plane is interactive wraps its
whole split and passes `enlargeable={false}` to the plane, so the plane renders
no shell of its own to register with. It publishes instead:

```jsx
usePublishWorkViewCapabilities(`coordinate-plane:${ariaLabel}`, capabilities);
```

The nearest enclosing `EnlargeableFigure` merges what its descendants publish.
Precedence is platform < published < the tool's own `capabilities` prop. A plane
that renders its own shell publishes nothing, because the port above it belongs
to an outer figure.

## Never nest a Work View

A tool that wraps its split must pass `enlargeable={false}` to every
`CoordinatePlane` inside it. A shell inside a shell puts the inner backdrop over
the Check button the outer one was opened to reach.
`tests/platform/workViewStage3A.test.mjs` counts planes against opt-outs.

## Responsive behaviour

`resolveWorkViewLayout` decides placement once and the shell stamps it as
`data-layout`, `data-controls`, `data-orientation` and `data-keyboard`; the CSS
keys off those attributes rather than a second set of breakpoints.

* A phone in landscape is still a phone: the layout is compact when the window
  is 720px or narrower **or** 460px or shorter. Width alone called an 844x390
  iPhone a desktop.
* Compact and tall gets a bottom action row; compact and short keeps a side
  rail, because height is the scarce dimension there.
* The compact layout drops the tool's own header, drops capability chips and
  drops any panel marked `mathmaster-work-view-secondary` — that content is
  registered as Help and reached from the header drawer instead.
* Assignment chrome — section tabs, question-number bubbles, the TEKS/CCMR
  badge, the attempt strip, the task card — is hidden by
  `html[data-work-view-open="true"]` on compact screens. Not merely covered:
  `position: fixed` degrades under any ancestor transform, and that is exactly
  when the chrome would be around and over the tool.
* The shell claims its grid rows by name. A closed drawer is `display: none` and
  therefore not a grid item, so positional rows left the body in an auto row
  with a strip of empty panel beneath it.
* Anything else pinned to the bottom of the window clears the controls: the
  shell publishes `--mm-work-view-actions`, and MathMaster's numeric keypad
  publishes `--mm-mobile-keypad` and `data-mobile-keypad-open` so the action
  region moves above it — to the other side of the workspace in landscape,
  where the keypad docks right.

## The browser gate

`tests/browser/workViewMatrix.mjs` drives the migrated families through the real
`QuestionEngine` on a Chromebook and an iPhone in both orientations, captures a
screenshot at every step, and records findings into
`tests/platform/fixtures/workViewMatrixFindings.json`, which
`tests/platform/workViewMatrixFindings.test.mjs` asserts is empty. Screenshots
are CI artifacts, never committed.
