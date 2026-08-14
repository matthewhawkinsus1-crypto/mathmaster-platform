import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8');

test('relation mapping always surfaces the source ordered pairs by default', () => {
  assert.match(source, /<Panel title="Given relation">/);
  assert.match(source, /questionData\.showGivenRelation !== false/);
  assert.match(source, /<MathDisplay value=\{`\(\$\{x\}, \$\{y\}\)`\}/);
});
