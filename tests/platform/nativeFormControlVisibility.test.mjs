import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

assert.match(css, /#root input:not\(\[type='checkbox'\]\)/, 'native text-like inputs should receive the light control contract');
assert.match(css, /#root select,\s*\n#root textarea/, 'selects and textareas should receive the light control contract');
assert.match(css, /color-scheme:\s*light;/, 'student form controls should force light native control rendering');
assert.match(css, /-webkit-text-fill-color:\s*#202124;/, 'Chromium/WebKit text fill should remain visible');
assert.match(css, /#root select option/, 'dropdown options should use explicit readable colors');
assert.match(css, /::placeholder/, 'placeholders should remain visible');

console.log('nativeFormControlVisibility: ok');
