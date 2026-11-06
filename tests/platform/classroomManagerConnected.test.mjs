/*
 * GOOGLE CLASSROOM, CONNECTED: EVERY FIELD HAS A NAME, AND EVERY ROW FITS A PHONE (the November build's section 6).
 *
 * Once a teacher has connected Google Classroom, the screen lists the courses they teach and what those lead to: a
 * MathMaster class to map each course to, the course whose roster to link, the assignment to publish, how its notes
 * go, the students' instructions. No scene had seen it, because the harness could not answer listGoogleCourses. The
 * first audit (accessibilityTeacherScreens.mjs, teacher-classroom/connected) found six choosers and the instructions
 * box with no name: a screen reader said "combo box" or "edit text" and nothing more, though five of them sat under a
 * visible label (axe's select-name and label, and the Tab walk's unnamed stops, at both sizes). Now:
 *   - every field is named: by the label that points at it, by aria-label or aria-labelledby, by the label around it,
 *     or, a text field, by its placeholder, as axe allows;
 *   - every label names the field under it, or holds its field (a label tied to nothing names nothing);
 *   - a course's chooser is named by the course it maps, and the links' fields sit in a group named by their heading.
 * Its contrast review found one more thing: on a phone a label lay across its card's border. Three rows of the screen
 * kept their laptop columns at any width: each course's class chooser and its pill ran 167 and 242px past the card at
 * 390px, the second column of "Publish a MathMaster assignment" 147px, and at 320px the courses to publish to 11px.
 * Each row now fits the width it has, and is as it was on a laptop:
 *   - no two columns with minimum widths sit side by side unless they fit (a grid of them is auto-fit);
 *   - a course's row wraps, its parts at most as wide as the row, and a course to publish to never wider than the card.
 *
 * Node cannot render the screen past "Not connected" (its courses arrive from a callable once it has mounted), so its
 * source is read, element by element. The browser proof is the scene, at 0 in the ratchet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = executableSource(readFileSync(new URL('../../src/ClassroomManagerV2.jsx', import.meta.url), 'utf8'));

// The opening tag that starts at `start`, to the `>` that ends it: not one inside an expression or a string.
const openingTag = (start) => {
  let depth = 0;
  let quote = null;
  for (let at = start + 1; at < source.length; at += 1) {
    const char = source[at];
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return source.slice(start, at + 1);
  }
  throw new Error(`no end to the tag at ${start}`);
};
// Where the element that opens at `at` closes: its own </name>, past any of the same name inside it.
const closing = (at, name) => {
  const pattern = new RegExp(`<${name}\\b|</${name}>`, 'g');
  pattern.lastIndex = at;
  let depth = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else if (!openingTag(match.index).endsWith('/>')) depth += 1;
  }
  throw new Error(`no end to the <${name}> at ${at}`);
};
const elements = (name) => [...source.matchAll(new RegExp(`<${name}\\b`, 'g'))].map((match) => ({ at: match.index, tag: openingTag(match.index) }));
const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|\\{)`))?.[1] ?? (new RegExp(`\\s${name}=\\{`).test(tag) ? '{expression}' : null);

const labels = elements('label').map(({ at, tag }) => ({ at, tag, end: source.indexOf('</label>', at) }));
const ids = new Set([...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const pointedAt = new Set(labels.map(({ tag }) => attribute(tag, 'htmlFor')).filter(Boolean));
const fields = ['select', 'textarea', 'input'].flatMap((name) => elements(name).map((field) => ({ ...field, name })))
  .filter(({ tag }) => !/\stype="hidden"/.test(tag));
const describe = ({ name, tag }) => `<${name}${tag.slice(name.length + 1, 90).replace(/\s+/g, ' ')}…`;

test('every field of the Classroom screen has a name a screen reader can say', () => {
  assert.ok(fields.filter(({ name }) => name === 'select').length >= 5, 'the screen\'s choosers are all read');
  const unnamed = fields.filter((field) => {
    const { at, tag, name } = field;
    if (attribute(tag, 'aria-label') || attribute(tag, 'aria-labelledby')) return false;
    const id = attribute(tag, 'id');
    if (id && pointedAt.has(id)) return false;
    if (labels.some((label) => label.at < at && at < label.end)) return false;
    // A text field's placeholder names it, as axe allows; a chooser has none.
    if (name !== 'select' && attribute(tag, 'placeholder')) return false;
    return true;
  });
  assert.deepEqual(unnamed.map(describe), [], 'a field with no name');
});

test('every label names the field under it, or holds its field', () => {
  const loose = labels.filter(({ at, tag, end }) => {
    const inner = source.slice(at + tag.length, end);
    if (/<(input|select|textarea)\b/.test(inner)) return false;
    const target = attribute(tag, 'htmlFor');
    return !target || !fields.some((field) => attribute(field.tag, 'id') === target);
  });
  assert.deepEqual(loose.map(({ tag }) => tag.slice(0, 80)), [], 'a label tied to no field');
  // A name taken from elsewhere is taken from something on the screen.
  for (const { tag } of [...fields, ...elements('div')]) {
    const named = attribute(tag, 'aria-labelledby');
    if (named && named !== '{expression}') assert.ok(ids.has(named), `aria-labelledby="${named}" names an element the screen draws`);
  }
});

test('a course\'s chooser is named by the course it maps, and the links\' fields by their heading', () => {
  const rows = region(source, 'mappedCourseCards.map(({ course, mapping }) => (', '))}', 'one row per course');
  const chooser = openingTag(source.indexOf('<select', source.indexOf('mappedCourseCards.map(({ course, mapping }) => (')));
  assert.ok(rows.includes(chooser), 'the chooser is the course row\'s');
  assert.match(chooser, /aria-label=\{`MathMaster class for \$\{courseLabel\(course\)\}`\}/, 'its name says which course it maps');
  const links = elements('div').find(({ tag }) => /role="group"/.test(tag) && /aria-labelledby="classroom-resource-links"/.test(tag));
  assert.ok(links, 'the links are a group named by their heading');
  const group = source.slice(links.at, closing(links.at, 'div'));
  assert.match(group, /<div id="classroom-resource-links" style=\{label\}>Links \/ notes \/ resources<\/div>/, 'the heading they always had, inside it');
  assert.ok(group.includes('placeholder="Title"') && group.includes('placeholder="https://…"'), 'and both fields of every link');
});

test('on a phone every row of the connected screen fits its card, and on a laptop it is as it was', () => {
  // Two tracks with minimum widths, side by side in every width, run past a narrow card: a grid of them is auto-fit.
  for (const [, tracks] of source.matchAll(/gridTemplateColumns: '([^']+)'/g)) {
    const minimums = (tracks.match(/minmax\(min\(100%, \d+px\)/g) || []).length;
    assert.ok(minimums <= 1 || /^repeat\(auto-fit, minmax\(min\(100%, \d+px\), 1fr\)\)$/.test(tracks), `columns "${tracks}" sit side by side only where they fit`);
  }
  // "Publish a MathMaster assignment": the topic and the delivery side by side, in two equal columns where two fit.
  const publish = region(source, '<strong>5. Publish a MathMaster assignment</strong>', '</section>', 'the publish card');
  assert.match(publish, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)'/);
  // A course's row: the course, its class and its pill side by side where they fit, the course and its class sharing
  // the row equally as the two equal columns did, and wrapping on a phone.
  const rows = region(source, 'mappedCourseCards.map(({ course, mapping }) => (', '))}', 'one row per course');
  assert.match(rows, /<div key=\{course\.id\} style=\{\{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' \}\}>/);
  assert.match(rows, /<div style=\{\{ flex: '1 1 0', minWidth: 'min\(100%, 220px\)' \}\}>/, 'the course');
  assert.match(rows, /<div style=\{\{ flex: '1 1 0', minWidth: 'min\(100%, 240px\)' \}\}>\s*<select\s+style=\{\{ \.\.\.input, display: 'block' \}\}/, 'its class, in a box without padding, as the course is');
  // A course to publish to: 220px of course where there is room, as always, and never past the card.
  const courses = region(source, '<strong>4. Classroom destinations and organization</strong>', '</section>', 'the destinations card');
  assert.match(courses, /<label key=\{course\.id\} style=\{\{[^}]*minWidth: 'min\(220px, 100% - 26px\)' \}\}>/);
  assert.doesNotMatch(courses, /minWidth: \d/, 'no fixed minimum left');
});
