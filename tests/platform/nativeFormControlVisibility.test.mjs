import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

assert.match(css, /#root input:not\(\[type='checkbox'\]\)/, 'native text-like inputs should receive the semantic control contract');
assert.match(css, /#root select,\s*\n#root textarea/, 'selects and textareas should receive the semantic control contract');
assert.match(css, /color-scheme:\s*inherit;/, 'student form controls should follow the resolved theme');
assert.match(css, /-webkit-text-fill-color:\s*var\(--mm-input-text\);/, 'Chromium/WebKit text fill should match the input surface');
assert.match(css, /background-color:\s*var\(--mm-input-bg\);/, 'control foreground and background should be a semantic pair');
assert.match(css, /#root select option/, 'dropdown options should use explicit readable colors');
assert.match(css, /::placeholder/, 'placeholders should remain visible');

console.log('nativeFormControlVisibility: ok');
