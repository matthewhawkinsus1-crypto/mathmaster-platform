import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('graph feature marking consumes canonical structured graph functions', async () => {
  const source = await readFile(
    new URL('../../src/platform/workflow/GraphFeatureSelectStage.jsx', import.meta.url),
    'utf8',
  );

  // Canonical V5 graph questions store the drawable curve in graph.functions.
  // The mark-a-feature stage must consume that same evidence instead of only
  // understanding the older graph.model shape; otherwise the grid renders but
  // the function disappears exactly when the student is asked to click it.
  assert.match(source, /graph\.functions/);
  assert.match(source, /evaluateGraphFunction/);

  // Point-only figures may still fall back to a polyline, but not when a real
  // function evaluator is available. This prevents a structured graph from
  // being replaced by an unrelated point-connection fallback.
  assert.match(source, /functions\.length === 0/);
});
