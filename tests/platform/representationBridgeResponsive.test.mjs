import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/tools/representationBridge/RepresentationBridge.jsx', import.meta.url), 'utf8');

// Android narrow, 360×800: the Work View surface is narrower than the raw
// viewport after its insets. The bridge may prefer 360px panels, but that
// preference cannot become a hard track minimum that clips panel controls.
test('Representation Bridge panel tracks can contract to the Work View surface', () => {
  assert.match(source, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(min\(360px, 100%\), 1fr\)\)'/);
  assert.doesNotMatch(source, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(360px, 1fr\)\)'/);
});
