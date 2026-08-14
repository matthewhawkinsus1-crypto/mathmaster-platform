# MathMaster Static Graph Point Contract — 2026-08-13

## Problem fixed
V5 assignment JSON could validly describe discrete static graph points as `{ "x": 1, "y": 5 }`, but the shared `GraphDisplay` expected `{ "coordinates": [1,5] }`. The result was a valid-looking empty coordinate plane with no points.

## Permanent authoring rule
For V5 JSON, prefer Firestore-safe point objects:

```json
{ "x": 1, "y": 5 }
```

MathMaster also accepts:

```json
{ "coordinates": [1, 5] }
```

Do not author `graph.points` as direct nested arrays such as `[[1,5],[2,10]]`; Firestore cannot persist arrays directly inside arrays.

## Runtime behavior
- Existing assignments with `{x,y}` render correctly without re-importing.
- V5 compiler normalizes accepted points to `{coordinates:[x,y]}` before persistence.
- Shared static graph viewport calculations understand both forms.
- Open Sort Board previews understand both forms.
- Malformed points now produce a precise semantic-validation error instead of silently rendering a blank graph.

## Regression coverage
`tests/platform/graphPointContract.test.mjs` verifies:
- `{x,y}` reading
- `{coordinates:[x,y]}` compatibility
- legacy `[x,y]` in-memory compatibility
- V5 compiler normalization
- static graph viewport validation
- malformed-point rejection

Focused authoring/graph/open-sort tests: 10/10 passed in the available test environment.
