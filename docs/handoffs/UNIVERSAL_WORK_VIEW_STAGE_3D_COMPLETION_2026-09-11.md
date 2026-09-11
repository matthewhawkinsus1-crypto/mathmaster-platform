# Universal Work View Stage 3D completion

The machine-readable source of truth is `src/tools/workViewInventory.js`. It
accounts for all 20 catalogued student tools. Stages 1–3C own the eight earlier
migrations; Stage 3D routes inverse/composition, function operations, parabola
geometry, polynomial, sign/solution, complex-plane, exponential/log,
representation matching, interval/number-line, relation mapping, and open-sort
activities through the same in-place `EnlargeableFigure` architecture.

`solutionReview2` is the only exemption: it is a read-only post-submission
review with no editable mathematical workspace, so enlargement and Undo would
be inert controls rather than capabilities.

## Undo and enlargement audit

The registry wrapper moves the existing component instance; it neither clones
nor portals another state owner. A coordinate plane detects a parent Work View
and automatically defers enlargement to it, preventing graph-only nested Work
Views. Number-line and mapping workspaces register their complete answer state
with Universal Undo and no longer render local mathematical Undo.

Scratchpad registers as a temporary high-priority editing surface. While open,
the one shared Universal Undo button moves into the overlay above its backdrop,
and sequential Undo targets its stroke/clear history. The covered work-bar copy
is hidden. Closing Scratchpad unregisters that owner and reveals the still-live
base mathematical tool controller, including legacy tools that register through
`onUndoStateChange`. Page
position, open/closed state, and overlay presentation never enter either
history. Clear remains one undoable scratchpad edit; Clear All remains visible
because its reset semantics differ from one-step Undo.

Stage 3D Universal Undo is declared only by `intervalNumberLine` and
`relationMapping`, the two migrated families that register complete snapshots
with `useMathUndoHistory`. The other Stage 3D tools retain Work View but no
longer advertise Undo: registry wrapping is presentation and cannot manufacture
a mathematical history.

The Stage 3D completeness contract rejects an unclassified catalog entry,
unknown capability, nested state-copy architecture, local Undo in the migrated
number-line/mapping surfaces, and browser fullscreen APIs. Coordinate renderers
continue through the shared `CoordinatePlane` scale policy and its bounded major
ticks. The browser-matrix workflow now triggers for every Stage 3D family and
Scratchpad.
