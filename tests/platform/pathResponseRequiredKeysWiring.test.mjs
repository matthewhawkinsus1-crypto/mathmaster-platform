import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/student/PathResponseFields.jsx', 'utf8');

test('generic Path ordered-pair fields request ordered-pair required keys', () => {
  assert.match(
    source,
    /answerFormat=\{field\.answerFormat \|\| field\.inputContract\?\.format \|\| field\.notation \|\| field\.inputMode \|\| \(profile === 'orderedPair' \? 'orderedPair' : profile\)\}/,
  );
  assert.match(
    source,
    /requiredSymbols=\{field\.requiredSymbols \|\| field\.inputContract\?\.requiredSymbols \|\| \[\]\}/,
  );
});
