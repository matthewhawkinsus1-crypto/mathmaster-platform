# Sequence comparison plotting fix — 2026-08-30

## Problem observed

Assignment V5 sequence questions could show an empty coordinate plane even when the sequence renderer had valid values. The sequence renderer was sending point objects as numeric-key objects such as `{0: 1, 1: 2}`, while the shared graph-point contract accepts arrays, `{x,y}`, or canonical `{coordinates:[x,y]}` objects.

Comparison questions were also read-only even when V5 authoring intent included both `plotSequence` and `compareSequences`.

## Fix

Branch: `fix/sequence-compare-plotting`

### Shared coordinate plane

`src/tools/shared/CoordinatePlane.jsx`

- Uses `readGraphPointCoordinates` from the shared graph-point contract.
- Accepts all canonical point forms consistently.
- Invalid point data remains non-renderable instead of creating a second private point contract.

### Sequence Explorer

`src/tools/sequenceExplorer/SequenceExplorer.jsx`

- Static sequence evidence now sends `{x,y}` points.
- Full integrated sequence plotting now sends `{x,y}` points, so newly clicked points are visible.
- Sequence comparison recognizes `studentActions: ["plotSequence", "compareSequences"]`.
- In plot-required comparison mode:
  - the graph starts empty;
  - students choose Sequence A or Sequence B before plotting;
  - each sequence is kept as a separately graded point set;
  - Sequence A is rendered blue and Sequence B red;
  - overlapping points remain visible by using different point radii;
  - term number is enforced as a whole-number domain input;
  - the graph expands to include the authored comparison window, up to the existing eight-term interaction cap;
  - graphing evidence is graded before the comparison can be fully correct.
- `compareSequences` without `plotSequence` keeps the existing read-and-compare behavior.

## Regression coverage

Updated:

- `tests/platform/sequenceIntegratedWorkflow.test.mjs`
  - dual-sequence plot requirement;
  - separate left/right plotted evidence;
  - V5 `plotSequence + compareSequences` compiler preservation.
- `tests/platform/graphPointContract.test.mjs`
  - shared CoordinatePlane uses the canonical point reader.

## Expected authoring intent for the reported question

```json
{
  "studentActions": ["plotSequence", "compareSequences"],
  "left": { "kind": "arithmetic", "first": 2, "difference": 5 },
  "right": { "kind": "geometric", "first": 2, "ratio": 2 },
  "displayCount": 7,
  "compareN": 7
}
```

This keeps assignment JSON responsible for the requested student work while the platform chooses and configures the interaction.

## Next gate

Open a pull request to `main` and require the Full Platform Test Suite to pass before merge.
