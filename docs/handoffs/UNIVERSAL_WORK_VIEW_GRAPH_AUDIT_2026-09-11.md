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
