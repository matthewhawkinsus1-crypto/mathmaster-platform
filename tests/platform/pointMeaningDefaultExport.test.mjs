import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/PointMeaningBuilder.jsx', import.meta.url), 'utf8');
assert.match(source, /export\s+default\s+function\s+PointMeaningBuilder\s*\(/, 'PointMeaningBuilder must retain its default export');
console.log('pointMeaningDefaultExport: ok');
