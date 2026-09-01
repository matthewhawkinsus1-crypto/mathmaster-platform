import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeExternalAiMathEscapes,
  parseExternalAiJson,
} from '../../src/platform/contract/externalAiJson.js';

test('outside AI parser repairs unescaped LaTeX inequality commands inside JSON strings', () => {
  const slash = '\\';
  const raw = `{"schemaVersion":5,"assignment":{"title":"Honors","courseId":"algebra2"},"sections":[{"id":"practice","role":"practice","questions":[{"type":"multiAnswer","prompt":"For p(x)=|x|, use -4${slash}le x${slash}le 7."}]}]}`;
  const parsed = parseExternalAiJson(raw);
  assert.equal(parsed.sections[0].questions[0].prompt, `For p(x)=|x|, use -4${slash}le x${slash}le 7.`);
});

test('outside AI parser protects LaTeX commands that JSON would otherwise treat as control escapes', () => {
  const slash = '\\';
  const raw = `{"prompt":"Rewrite ${slash}frac{1}{2}x using ${slash}text{equivalent form}, then ${slash}right-align it."}`;
  const parsed = parseExternalAiJson(raw);
  assert.equal(
    parsed.prompt,
    `Rewrite ${slash}frac{1}{2}x using ${slash}text{equivalent form}, then ${slash}right-align it.`,
  );
  assert.equal(parsed.prompt.includes('\f'), false, 'LaTeX frac must not become a form-feed escape');
  assert.equal(parsed.prompt.includes('\t'), false, 'LaTeX text must not become a tab escape');
  assert.equal(parsed.prompt.includes('\r'), false, 'LaTeX right must not become a carriage-return escape');
});

test('outside AI parser preserves already valid JSON escapes and unicode escapes', () => {
  const raw = '{"prompt":"Line 1\\nLine 2","quote":"\\\"yes\\\"","symbol":"\\u2264","latex":"\\\\sqrt{x}"}';
  const normalized = normalizeExternalAiMathEscapes(raw);
  assert.equal(normalized, raw);
  const parsed = parseExternalAiJson(raw);
  assert.equal(parsed.prompt, 'Line 1\nLine 2');
  assert.equal(parsed.quote, '"yes"');
  assert.equal(parsed.symbol, '≤');
  assert.equal(parsed.latex, '\\sqrt{x}');
});

test('outside AI parser accepts fenced JSON and surrounding AI prose', () => {
  const fenced = '```json\n{"schemaVersion":5,"assignment":{"title":"A","courseId":"algebra2"},"sections":[]}\n```';
  assert.equal(parseExternalAiJson(fenced).schemaVersion, 5);

  const prose = 'Here is the JSON you requested:\n{"schemaVersion":5,"assignment":{"title":"A","courseId":"algebra2"},"sections":[]}\nDone.';
  assert.equal(parseExternalAiJson(prose).assignment.courseId, 'algebra2');
});

test('outside AI parser does not hide malformed JSON structure', () => {
  assert.throws(
    () => parseExternalAiJson('{"schemaVersion":5,"sections":[}'),
    /not valid JSON/,
  );
});
