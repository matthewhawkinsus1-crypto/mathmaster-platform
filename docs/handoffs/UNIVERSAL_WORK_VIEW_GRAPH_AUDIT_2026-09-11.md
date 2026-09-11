# Universal Work View and graph hardening audit

This is the implementation map for a staged migration. It deliberately does
not propose an assignment-specific modal or a second copy of student state.

## Extend, do not replace

* `EnlargeableFigure` already renders children in place, preserves React state,
  handles Escape/focus return, and uses dynamic viewport units. It is the safe
  base for Work View while its API grows from `children` to named capabilities.
* `CoordinatePlane` already owns camera-only zoom/reset and converts pointer
  geometry at event time. Its view state is correctly separate from authored
  bounds and student points; reset is the basis of universal Fit View.
* `QuestionEngine` already owns the active shared Undo controller. Tools using
  `onUndoStateChange` are migrated; retain local Undo in the tools listed below
  until equivalent regression coverage exists.
* `WorkflowFocusMode` already moves an entire interactive stage rather than a
  graph-only copy. Its responsive CSS and current-instruction treatment should
  be reused by the Work View shell.

## Legacy implementations requiring migration

* `DataModelingLab` enlarged only each `CoordinatePlane`, leaving coefficient
  inputs, equations, residual tables, and context behind. Stage 1 moves the
  scatter/model controls and residual evidence into in-place Work Views.
* `TransformationsLab`, `Graphing2`, and several Batch A-D tools wrap their own
  split layouts. They should register capabilities with the shell rather than
  inventing placement, but must continue rendering their existing state owner.
* `TransformationsLab`, `StepAlgebra2`, and `ScratchpadOverlay` still show local
  Undo. They remain until Universal Undo tests cover point edits, algebra steps,
  drawing strokes, and clear restoration respectively.
* `GraphDisplay` and `CoordinatePlane` formerly maintained independent tick
  loops with a readability ceiling of 200. Stage 1 routes both through the
  shared scale service and lowers the major-label hard guard to 12.

## Staged delivery

1. **Scale foundation and modeling containment (this change):** shared nice
   ticks, fitting, residual policy, health diagnostics, scale-aware increments,
   and complete modeling/residual Work Views.
2. **Capability registry and shell:** typed capability descriptors for Undo,
   Redo, Fit, pan/zoom, point editing, numeric/equation/table/instruction/help,
   and primary/secondary actions; responsive placement driven by usable visual
   viewport and safe-area measurements.
3. **Tool migrations:** graph construction, transformations, Graphing2 and the
   remaining interactive tools, one family at a time with state-integrity and
   Universal Undo regression tests before removing local controls.
4. **Browser visual gate:** standard/Work View matrices for regression,
   residuals, transformations, construction, portrait and landscape. Store the
   population-scale regression screenshot artifact and fail on excessive major
   ticks, clipped controls, overflow, or missing registered capabilities.

## Stage 2 registry status

`QuestionEngine` now supplies Universal Undo, task, current instruction, Help,
submit, and scratchpad capabilities to every nested Work View. `CoordinatePlane`
registers Fit View, pan/zoom, and point editing. `DataModelingLab` additionally
registers model controls, equation entry, source/residual data, task, and help.

Stage 3 still needs family migrations for `TransformationsLab`, `Graphing2`,
graph construction/function builders, graph analysis/comparison/story tools,
relation mapping and representation matching, geometry/measurement canvases,
number-line tools, algebra workspaces, and `ScratchpadOverlay`. Local Undo stays
in transformations, Step Algebra 2, and Scratchpad until each family has a
passing Universal Undo regression contract.

## State boundary

Work View is presentation state. Fit/pan/zoom remain camera state. Neither may
enter answer payloads, grading records, mathematical Undo, or authored-bound
semantics. Every migration must render the existing tool instance in place;
mounting a second interactive copy is prohibited.

## Stage 3A status

Migrated onto the shared shell, each registering the capabilities its activity
actually needs rather than "a graph":

* `TransformationsLab` — Universal Undo across all six modes, mode-specific
  primary action, Clear as a secondary, the transformation bridge moved to Help
  on a phone. Its local "Undo point" is gone.
* `Graphing2` — Universal Undo over the plotted construction, Check and Start
  over registered, the current instruction shared with the progress pill. Its
  local "Undo last point" is gone.
* `FunctionInvestigation2` — wraps its whole split for the first time; the only
  Work View here used to be the plane's own, which left every answer field
  behind the backdrop. Universal Undo across all five modes.
* `ConstraintFunctionBuilder` — wraps its split, registers the family and
  parameter controls, Universal Undo over the constructed model including the
  `hasEdited` gate.
* `InteractiveGraphWorkspace` (`FunctionGraphBuilder`, `GraphAnalysis`) —
  registers Fit View as camera-only, pan/zoom, point editing and the current
  instruction; its own tick loop and the readability ceiling of 200 are gone,
  replaced by the shared `majorTicks`.

New platform pieces, all extensions of the #186 registry:

* `mathUndoStack.js` / `useMathUndoHistory.js` — one mathematical undo stack,
  camera-free by construction, reaching `QuestionEngine`'s existing controller
  through `WorkViewUndoProvider`.
* A capability port, so `CoordinatePlane` keeps owning Fit View and point
  editing when a tool wraps its whole split and the plane renders no shell.
* `tests/browser/workViewMatrix.mjs` — the rendered gate, with findings asserted
  by the ordinary suite and screenshots uploaded by
  `.github/workflows/work-view-browser-matrix.yml`.

Three defects the rendered gate found that no source contract would have:

* the shell's grid rows were positional, and a closed drawer is `display: none`
  and therefore not a grid item — the body sat in an auto row with 197px of
  empty panel beneath it and the action row floating mid-screen;
* the calculator launcher and the mobile numeric keypad are fixed above
  everything and landed on the registered controls, leaving four buttons present,
  correctly sized, on screen and untappable;
* the embedded phone rule that pins a graph panel at 46dvh cut a 680px Work View
  workspace down to 388 and clipped the zoom row half-way through itself.

## Remaining Stage 3 work

3C covers Step Algebra, the algebra workspaces and the rest of the Universal
Undo consolidation (`StepAlgebra2` and `MultiRelationAlgebra`
keep their local controls until their histories are covered); 3D number
lines, relation mapping, representation matching, the remaining geometry and
measurement canvases, and `ScratchpadOverlay`.

`DataModelingLab` was migrated in Stage 1/2 and is held to the nesting contract
here. `GraphDisplay` still has a renderer of its own that has not been routed
through the shared scale policy.

## Stage 3B status

The complete sequence and systems inventory now uses the Universal Work View:

* `SequenceExplorer` — analyze, integrated table/plot/rule (`fullBridge`), rule
  bridge, missing term, partial sum, and two-sequence comparison modes. Every
  mode registers its answer controls and Check action; the two plotting modes
  also register point editing, and all modes register mathematical Undo.
* `SystemsWorkspace` — linear, inequality/inequality-construction,
  linear–quadratic, 2×2 matrix, and 3×3 RREF modes. Each Work View retains all
  equations or inequalities, the graph or matrix workspace, classification and
  solution controls, Check, and mathematical Undo.
* `SystemGrader` — the legacy ordered-pair systems path now enlarges its two
  equations, static graph, and ordered-pair entry as one activity. Its existing
  `MathInput` registration remains the Universal Undo owner.

Every nested `CoordinatePlane`, and the `GraphDisplay` used by `SystemGrader`,
opts out of its own enlarge shell. The graph renderers already reach the shared
scale policy through `CoordinatePlane`; `GraphDisplay` continues to use
`majorTicks` and authored bounds.

Mobile Work View now has a reusable keyboard-context rule: while a numeric,
equation, or select control is focused, the first mathematical reference panel
in a split remains sticky within a viewport-derived bounded region. This fixes
the Stage 3A graph-scrolled-away defect without adding family-specific state or
a second fullscreen architecture, and is available to Stage 3C parameter tools.

The Stage 3A portrait-phone interaction question is resolved by the reusable
keyboard-context rule above; Stage 3C parameter tools should use the same split
layout rather than adding family-specific focus behavior.
