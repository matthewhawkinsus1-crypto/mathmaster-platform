/*
 * The CSS reader the layout contracts lean on (helpers/cssRules.mjs). A reader
 * that silently finds nothing would make every "this selector sets that" test
 * either vacuous or red for no reason, so it is held to the cases the real
 * stylesheets contain: a media query inside a media query, a selector list with
 * a comma inside :has(), !important, a value with calc() and var(), a comment
 * between rules, and a later declaration that replaces an earlier one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCss, rulesFor, declared } from './helpers/cssRules.mjs';

const SHEET = `
/* a comment, { with a brace } */
.bar { display: flex; flex-wrap: wrap; gap: 6px; }
.bar { flex-wrap: nowrap }
@media (max-width: 768px) and (orientation: portrait) {
  .bar:has(> .a, > .b) , .other > * {
    margin: 0 !important;
    font-size: calc(10 * var(--mm-px));
  }
  @media (max-width: 600px) {
    .bar { min-width: 44px; }
  }
}
@keyframes spin { from { opacity: 0; } to { opacity: 1; } }
.after { color: red; }
`;

test('the reader finds every rule, whatever it is nested in', () => {
  const rules = parseCss(SHEET);
  assert.equal(rules.length, 5, '.bar twice, the pair in the media query, .bar in the inner query, .after; the keyframes are not style rules');
  assert.deepEqual(rules.find((rule) => rule.selectors.includes('.other > *')).selectors, ['.bar:has(> .a, > .b)', '.other > *'], 'a comma inside :has() does not split the selector');
});

test('what the sheet says is the last rule that sets the property, under the condition asked for', () => {
  const rules = parseCss(SHEET);
  assert.deepEqual(declared(rules, '.bar', 'flex-wrap', { media: null }), { value: 'nowrap', important: false }, 'the later rule replaces the earlier');
  assert.equal(declared(rules, '.bar', 'display', { media: null }).value, 'flex');
  assert.equal(declared(rules, '.bar', 'min-width', { media: null }), null, 'a rule inside a media query is not a rule outside it');
  assert.equal(declared(rules, '.bar', 'min-width', { media: '(max-width: 600px)' }).value, '44px');
  assert.equal(declared(rules, '.bar', 'min-width', { media: '(orientation: portrait)' }).value, '44px', 'inside both queries: the outer one counts too');
  assert.deepEqual(declared(rules, '.other > *', 'margin', { media: '(max-width: 768px)' }), { value: '0', important: true });
  assert.equal(declared(rules, '.other > *', 'font-size').value, 'calc(10 * var(--mm-px))');
  assert.equal(rulesFor(rules, '.after').length, 1, 'a rule after a keyframes block is still read');
});

test('the reader reads the stylesheets the layout contracts use', () => {
  const sheet = parseCss(readFileSync(new URL('../../src/components/student/MathToolMobileLayout.css', import.meta.url), 'utf8'));
  assert.ok(sheet.length > 100, `the phone layout sheet has ${sheet.length} rules`);
  assert.equal(declared(sheet, '.mathmaster-question-container.mode-portrait .question-prompt-panel', 'overflow-y', { media: '(orientation: portrait)' })?.value, 'auto');
});
