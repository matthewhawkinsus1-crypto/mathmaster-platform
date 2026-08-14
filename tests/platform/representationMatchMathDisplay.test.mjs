import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/tools/representationMatch/RepresentationMatch.jsx', import.meta.url), 'utf8');

test('representation match renders equation choices with MathDisplay rather than native option text', () => {
  assert.match(source, /import MathDisplay from ['"]\.\.\/\.\.\/MathDisplay['"]/);
  assert.match(source, /aria-label="Equation choices"/);
  assert.match(source, /<MathDisplay value=\{item\.equation/);
  assert.match(source, /format="ascii-math"/);
});
