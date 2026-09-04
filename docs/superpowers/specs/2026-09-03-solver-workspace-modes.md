# Solver Workspace Modes Design

## Goal
Give students three interchangeable views of the same live algebra solver: Normal, Enlarge Tool, and Focus Workspace.

## Requirements
- Normal keeps the existing solver unchanged.
- Enlarge Tool preserves the current layout and controls while using nearly the full viewport.
- Focus Workspace maximizes equation space, keeps controls available, adds a collapsible work-history rail, and provides workspace zoom/Fit controls.
- Students can switch Normal → Enlarge → Focus → Normal without losing equation state, pending operations, cancellations, Guided Notes, attempts, grading, Undo, or Scratchpad state.
- The step-by-step literal/equation solver and the multi-relation/absolute-value solver use the same workspace shell.
- Escape exits an enlarged/focus workspace; keyboard focus returns to the control that opened it; background page scrolling is locked while open.
- Chromebook/desktop is the primary large-screen layout; phone/tablet collapses the Focus layout to one column.
- No duplicate solver instance or second grading state may be created.
