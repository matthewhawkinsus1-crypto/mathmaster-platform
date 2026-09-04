# Solver Workspace Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add student-selectable Enlarge Tool and Focus Workspace modes to both algebra solvers without remounting or duplicating solver state.

**Architecture:** Preserve each current solver as a `*Core.jsx` module and keep the public file name as a thin wrapper. A shared `SolverWorkspaceFrame` changes layout by setting a mode attribute on the existing `.mathmaster-question-engine`, making the entire live question runtime fullscreen so task text, Guided Notes, attempts, Undo, and Scratchpad remain in the same React tree. Focus mode adds a collapsible history rail populated by the solver's existing `onStateChange` payload.

**Tech Stack:** React 19, Vite 8, CSS, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-solver-workspace-modes.md`

## Global Constraints
- Do not duplicate or remount the solver when switching views.
- Keep existing grading, attempts, algebra engines, scratchpad persistence, and question-state contracts unchanged.
- Enlarge Tool must preserve the current solver layout.
- Focus Workspace may reflow layout but must keep every existing operation available.
- Escape closes the workspace and background page scrolling is locked while open.
- Responsive behavior must remain usable below 780px.

---

### Task 1: Protect the workspace-mode contract with a regression test

**Files:**
- Create: `tests/platform/solverWorkspaceModes.test.mjs`

**Interfaces:**
- Consumes: source files for the shared frame and both public solver entries.
- Produces: static regression checks that guarantee both solver entry points use one shared shell and that Focus CSS keeps operation controls.

- [x] **Step 1: Write the failing test**

```js
const source = await read('src/components/common/SolverWorkspaceFrame.jsx');
assert.match(source, /openMode\('enlarged'/);
assert.match(source, /openMode\('focus'/);
assert.equal((source.match(/\{children\}/g) || []).length, 1);
```

- [x] **Step 2: Run the test and verify RED**

Run: `node --test tests/platform/solverWorkspaceModes.test.mjs`
Expected: FAIL because `SolverWorkspaceFrame.jsx` and the solver wrappers do not exist yet.

### Task 2: Build the shared workspace shell

**Files:**
- Create: `src/components/common/SolverWorkspaceFrame.jsx`
- Create: `src/components/common/SolverWorkspaceFrame.css`

**Interfaces:**
- Consumes: one already-mounted solver child, task text, workspace identity, workspace kind, optional Focus side panel.
- Produces: `<SolverWorkspaceFrame children label taskText workspaceKey workspaceKind focusPanel />` with modes `normal | enlarged | focus`.

- [x] **Step 1: Keep the solver child in one stable React position**

```jsx
<div className="solver-workspace-layout">
  <div className="solver-workspace-main">{children}</div>
  <aside className="solver-workspace-focus-panel">{focusPanel}</aside>
</div>
```

- [x] **Step 2: Apply fullscreen mode to the existing QuestionEngine ancestor**

```js
const host = frameRef.current?.closest('.mathmaster-question-engine');
host.dataset.solverWorkspaceMode = mode;
document.body.style.overflow = 'hidden';
```

- [x] **Step 3: Add keyboard safety and zoom controls**

```js
if (event.key === 'Escape') closeWorkspace();
setZoom((current) => clampZoom(current + 0.1));
```

- [x] **Step 4: Add responsive Enlarge and Focus CSS**

```css
.mathmaster-question-engine[data-solver-workspace-mode="focus"] {
  position: fixed !important;
}

@media (max-width: 780px) {
  .solver-workspace-frame[data-workspace-mode="focus"] .solver-workspace-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

### Task 3: Preserve solver APIs and add Focus work history

**Files:**
- Create from existing blob: `src/StepByStepAlgebraCore.jsx`
- Replace public entry: `src/StepByStepAlgebra.jsx`
- Create from existing blob: `src/MultiRelationAlgebraCore.jsx`
- Replace public entry: `src/MultiRelationAlgebra.jsx`

**Interfaces:**
- Consumes: current public solver props and existing `onStateChange` payloads.
- Produces: the same default exports and named exports as before, wrapped in `SolverWorkspaceFrame`.

- [x] **Step 1: Preserve named exports**

```js
export * from './StepByStepAlgebraCore';
export * from './MultiRelationAlgebraCore';
```

- [x] **Step 2: Capture only unique committed/current equation states**

```js
const handleStateChange = useCallback((payload) => {
  const equation = payload?.parts?.find((part) => part?.id === 'algebra-objective')?.response;
  if (equation) setWorkHistory((current) => appendHistory(current, equation));
  onStateChange?.(payload);
}, [onStateChange]);
```

- [x] **Step 3: Render the existing core once inside the shared shell**

```jsx
<SolverWorkspaceFrame focusPanel={focusPanel}>
  <StepByStepAlgebraCore {...props} onStateChange={handleStateChange} />
</SolverWorkspaceFrame>
```

### Task 4: Verify the feature before integration

**Files:**
- Test: `tests/platform/solverWorkspaceModes.test.mjs`
- Build: project root

**Interfaces:**
- Consumes: completed branch.
- Produces: evidence that the regression test, build, and branch diff are clean.

- [x] **Step 1: Run the focused regression test**

Run: `node --test tests/platform/solverWorkspaceModes.test.mjs`
Expected: 3 passing tests.

- [ ] **Step 2: Run repository build in CI or an equivalent complete checkout**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Review the feature-branch diff**

Run: compare `main...feature/solver-enlarge-focus-workspace` and confirm only the solver shell, solver wrappers/core copies, test, and documentation changed.
