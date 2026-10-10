/*
 * Release-candidate QA m13: accessible names on the student Home and Grades.
 *
 *   Home    the collapsible assignment groups ("Finished 3") put an <h2>
 *           INSIDE their <button>. A heading is not valid button content —
 *           a button's children are presentational — so the group lost its
 *           heading and the button's name ran label and count together. The
 *           heading now contains the button (the disclosure pattern).
 *   Grades  "🙈 Hide grade" carried the emoji into its accessible name (read
 *           as "see-no-evil monkey Hide grade"). The emoji is aria-hidden;
 *           the name is "Hide grade" / "Show grade".
 *
 * These render the real components (vite ssrLoadModule + renderToStaticMarkup)
 * and check the markup a browser would build its accessibility tree from. The
 * browser proof, reading Chromium's own tree in both toggle states at both
 * viewports, is tests/browser/studentAccessibleNames.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// The accessible name of a simple subtree: its text, minus anything inside
// an aria-hidden="true" element (none of these subtrees nest aria-hidden),
// element boundaries read as a space (the flex items here do in Chromium).
const accessibleText = (html) => html
  .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const EMOJI = /\p{Extended_Pictographic}/u;
const HEADING = /<h[1-6][\s>]|role="heading"/;

// Every <button>…</button> in the markup (buttons never nest).
const buttons = (html) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => ({ outer: match[0], inner: match[1] }));

let server;
const load = async (file) => (await server.ssrLoadModule(file)).default;

test.before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
});
test.after(async () => { await server?.close(); });

test('a Home assignment group: the heading contains the disclosure button, never the reverse', async () => {
  const AssignmentGroup = await load('/src/components/student/AssignmentGroup.jsx');
  const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  for (const defaultOpen of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(AssignmentGroup, {
      bucket: 'completed', label: 'Finished', entries, defaultOpen,
      renderEntry: (entry) => React.createElement('article', { key: entry.id }, `Row ${entry.id}`),
    }));
    const found = buttons(html);
    assert.equal(found.length, 1, 'one disclosure button per group');
    const [button] = found;
    assert.doesNotMatch(button.inner, HEADING, `open=${defaultOpen}: no heading inside the button`);
    assert.equal(accessibleText(button.inner), 'Finished 3', `open=${defaultOpen}: the button is named by its label and count`);
    assert.match(button.outer, new RegExp(`aria-expanded="${defaultOpen}"`), `open=${defaultOpen}: the button reports its state`);

    // The group still HAS its level-2 heading, and the button is inside it.
    const heading = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/);
    assert.ok(heading, `open=${defaultOpen}: the group keeps its <h2>`);
    assert.ok(heading[1].includes(button.outer), `open=${defaultOpen}: the <h2> contains the disclosure button`);

    // The section is named by the label alone ("Finished"), not "Finished 3".
    const labelledBy = html.match(/<section[^>]*aria-labelledby="([^"]+)"/)?.[1];
    assert.equal(labelledBy, 'group-completed');
    const labelEl = html.match(new RegExp(`<(\\w+)[^>]*id="${labelledBy}"[^>]*>([\\s\\S]*?)</\\1>`));
    assert.ok(labelEl, 'the element the section is labelled by exists');
    assert.equal(accessibleText(labelEl[2]), 'Finished');

    assert.equal((html.match(/Row [abc]/g) || []).length, defaultOpen ? 3 : 0, 'the entries show only when open');
  }
});

test('the Grades hide-grade toggle is named "Hide grade" — the emoji is drawn, not spoken', async () => {
  const StudentGradeCenter = await load('/src/components/student/StudentGradeCenter.jsx');
  const html = renderToStaticMarkup(React.createElement(StudentGradeCenter, { gradeCenter: null }));
  const all = buttons(html);
  const toggle = all.find((button) => /grade/i.test(accessibleText(button.inner)) && /hide|show/i.test(accessibleText(button.inner)));
  assert.ok(toggle, 'the grade toggle is on the screen');
  assert.equal(accessibleText(toggle.inner), 'Hide grade');
  assert.match(toggle.inner, EMOJI, 'the emoji is still drawn');
  // The label says what pressing does, so a pressed state would contradict it
  // ("Show grade, pressed").
  assert.doesNotMatch(toggle.outer, /aria-pressed/);
  // No button on the Grades screen speaks an emoji.
  const spoken = all.map((button) => accessibleText(button.inner)).filter((name) => EMOJI.test(name));
  assert.deepEqual(spoken, []);
  for (const button of all) assert.doesNotMatch(button.inner, HEADING, `no heading inside "${accessibleText(button.inner)}"`);
});
