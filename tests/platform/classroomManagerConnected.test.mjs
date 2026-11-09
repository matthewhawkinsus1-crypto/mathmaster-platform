/*
 * GOOGLE CLASSROOM, CONNECTED: EVERY FIELD HAS A NAME, AND EVERY ROW FITS A PHONE (the November build's section 6).
 *
 * Once a teacher has connected Google Classroom, the screen lists the courses they teach and what those lead to: a
 * MathMaster class to map each course to, the course whose roster to link, the assignment to publish, how its notes
 * go, the students' instructions. No scene had seen it, because the harness could not answer listGoogleCourses. The
 * first audit (accessibilityTeacherScreens.mjs, teacher-classroom/connected) found six choosers and the instructions
 * box with no name: a screen reader said "combo box" or "edit text" and nothing more, though five of them sat under a
 * visible label (axe's select-name and label, and the Tab walk's unnamed stops, at both sizes). It also left fields
 * named only by their placeholders: the standalone post's two, each link's two, the identity list's (by its example
 * rows) and, after Import Roster, each row's ID box. A placeholder is a name axe accepts, but not a label: it is gone
 * once the field holds text, and the standalone post's title always holds some (WCAG 1.3.1, 2.5.3, 3.3.2). Now:
 *   - every field is named by a label a teacher can see: the label that points at it, the label around it, or the
 *     words on screen its aria-labelledby names; the one other name is a course's chooser, named by the course it
 *     maps (aria-label, below). A placeholder no longer counts;
 *   - each of those labels is the wording a teacher already read there: "Title", the description's own words, the
 *     list's title, a row's column and student; a placeholder that stays is an example ("https://…"), never the label
 *     said twice;
 *   - every label names the field under it, or holds its field (a label tied to nothing names nothing);
 *   - a course's chooser is named by the course it maps, and the links' fields sit in a group named by their heading.
 * Its eight sections were titled in bold text, so a screen reader could neither list them nor move from one to the next
 * (WCAG 1.3.1, 2.4.6). Each title is a heading now, one level under the screen's own, and looks as it did.
 * What the last batch left (the November build's section 6), closed:
 *   - "Google Classroom grade represents" is the name of its checkboxes' group (1.3.1), as "Links / notes / resources"
 *     is of its fields';
 *   - a bold line inside a section that titles a box of controls is a heading one level under the section's, in the
 *     screen's order, or the name of the box's group, and looks as it did;
 *   - every roster row's button is named by its row ("Confirm link for <the student>"), its visible words first and
 *     unchanged (2.4.6, 2.5.3): every row's was "Confirm link";
 *   - at 320px the "Topic names" box narrowed to about 45px beside its button: their row wraps where the box would be
 *     narrower than the 220px the screen's other fields keep, and is as it was on a laptop.
 * Nothing a teacher can do changes: the same buttons, the same calls to the server, in the same order.
 * Its contrast review found one more thing: on a phone a label lay across its card's border. Three rows of the screen
 * kept their laptop columns at any width: each course's class chooser and its pill ran 167 and 242px past the card at
 * 390px, the second column of "Publish a MathMaster assignment" 147px, and at 320px the courses to publish to 11px.
 * Each row now fits the width it has, and is as it was on a laptop:
 *   - no two columns with minimum widths sit side by side unless they fit (a grid of them is auto-fit);
 *   - a course's row wraps, its parts at most as wide as the row, and a course to publish to never wider than the card.
 *
 * Node cannot render the screen past "Not connected" (its courses arrive from a callable once it has mounted), so its
 * source is read, element by element. The browser proof is the scenes, at 0 in the ratchet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = executableSource(readFileSync(new URL('../../src/ClassroomManagerV2.jsx', import.meta.url), 'utf8'));

// From `start` (just past an opening character) to the index of the `close` that balances it: not one inside a
// string or a template.
const balanced = (start, open, close) => {
  let depth = 0;
  let quote = null;
  for (let at = start; at < source.length; at += 1) {
    const char = source[at];
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === close) {
      if (depth === 0) return at;
      depth -= 1;
    }
  }
  throw new Error(`no ${close} to balance the ${open} before ${start}`);
};
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
// An attribute of an opening tag: its quoted value, or the source of its expression (id={`link-${index}`} reads
// "`link-${index}`"), so that a label and the field it names are matched by the one id they share. Null: none.
const attribute = (tag, name) => {
  const match = new RegExp(`\\s${name}=(?:"([^"]*)"|\\{)`).exec(tag);
  if (!match) return null;
  if (match[1] !== undefined) return match[1];
  const at = source.indexOf(tag) + match.index + match[0].length;
  return source.slice(at, balanced(at, '{', '}')).trim();
};
// What an element says on screen: its own words, without its tags or the expressions between them.
const text = (inner) => {
  let words = '';
  let depth = 0;
  let quote = null;
  let inTag = false;
  for (let at = 0; at < inner.length; at += 1) {
    const char = inner[at];
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = null;
    } else if (depth > 0) {
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
    } else if (char === '{') {
      depth = 1;
      words += ' ';
    } else if (inTag) {
      if (char === '"') quote = char;
      else if (char === '>') {
        inTag = false;
        words += ' ';
      }
    } else if (char === '<') inTag = true;
    else words += char;
  }
  return words.replace(/\s+/g, ' ').trim();
};

const labels = elements('label').map(({ at, tag }) => ({ at, tag, end: source.indexOf('</label>', at) }))
  .map((entry) => ({ ...entry, words: text(source.slice(entry.at + entry.tag.length, entry.end)) }));
const ids = new Set([...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const fields = ['select', 'textarea', 'input'].flatMap((name) => elements(name).map((field) => ({ ...field, name })))
  .filter(({ tag }) => !/\stype="hidden"/.test(tag));
const describe = ({ name, tag }) => `<${name}${tag.slice(name.length + 1, 90).replace(/\s+/g, ' ')}…`;
// The label that names a field: the one that points at its id (the same id, written the same way), or the one around it.
const labelOf = ({ at, tag }) => {
  const id = attribute(tag, 'id');
  return (id && labels.find((label) => attribute(label.tag, 'htmlFor') === id))
    || labels.find((label) => label.at < at && at < label.end)
    || null;
};
const fieldShowing = (value) => {
  const field = fields.find(({ tag }) => attribute(tag, 'value') === value);
  assert.ok(field, `the field that shows ${value}`);
  return field;
};

test('every field of the Classroom screen is named by a label a teacher can see, and never by its placeholder alone', () => {
  assert.ok(fields.filter(({ name }) => name === 'select').length >= 5, 'the screen\'s choosers are all read');
  assert.ok(fields.filter(({ name }) => name !== 'select').length >= 9, 'and its text fields and boxes');
  const unlabelled = fields.filter((field) => {
    if (labelOf(field)) return false;
    // Named by words the screen draws (which, the next tests).
    if (attribute(field.tag, 'aria-labelledby')) return false;
    // The one name that is no element's words: a course's chooser, named by the course on its row (tested below).
    if (attribute(field.tag, 'aria-label') === '`MathMaster class for ${courseLabel(course)}`') return false;
    return true;
  });
  assert.deepEqual(unlabelled.map(describe), [], 'a field with no visible label: a placeholder is not one, it goes once the field holds text');
});

test('the standalone post, each link and the identity list are named by the words a teacher already reads there', () => {
  const named = (value, words, message) => {
    const label = labelOf(fieldShowing(value));
    assert.ok(label, `${message}: a label names it`);
    assert.equal(label.words, words, message);
  };
  named('materialTitle', 'Title', 'the standalone post\'s title');
  named('materialDescription', 'What students should know about these resources', 'its description, by the words its placeholder held');
  named('material.title', 'Title', 'a link\'s title, by the word its placeholder held');
  named('material.url', 'Link', 'a link\'s address');
  named('identityText', 'ID-only students: paste an identity list (optional)', 'the identity list, by its title');
  // A placeholder that stays is an example of what goes in the field, and never says its label again.
  assert.equal(attribute(fieldShowing('material.url').tag, 'placeholder'), 'https://…', 'a link keeps its example');
  assert.equal(attribute(fieldShowing('materialTitle').tag, 'placeholder'), 'Lesson 3 — Notes & Resources', 'and the title its own');
  for (const field of fields) {
    const placeholder = attribute(field.tag, 'placeholder');
    const label = labelOf(field);
    if (placeholder && label) assert.notEqual(placeholder.replace(/…$/, ''), label.words, `${describe(field)} says its label twice`);
  }
  // Each link's labels name that link's fields: one id per row, written once for the label and once for the field.
  const links = region(source, 'materials.map((material, index) => (', '+ Add resource link', 'one row per link');
  for (const value of ['material.title', 'material.url']) {
    const id = attribute(fieldShowing(value).tag, 'id');
    assert.ok(links.includes(fieldShowing(value).tag), `${value}: the field is the link row's`);
    assert.match(id, /^`[^`]*\$\{index\}[^`]*`$/, `${value}: its id is the row's own (${id})`);
  }
});

test('a roster row\'s ID box is named by its column and its Classroom student, as the row shows them', () => {
  const table = region(source, 'aria-label="Google Classroom roster matches"', '</table>', 'the roster table');
  const column = elements('th').find(({ tag }) => attribute(tag, 'id') === 'classroom-roster-match-column');
  assert.ok(column && table.includes(column.tag), 'the column has an id');
  assert.equal(text(source.slice(column.at + column.tag.length, source.indexOf('</th>', column.at))), 'MathMaster match', 'the column it heads');
  const box = fields.find(({ tag }) => attribute(tag, 'list') === 'mathmaster-roster-id-options');
  assert.ok(box && table.includes(box.tag), 'the row\'s ID box');
  assert.equal(attribute(box.tag, 'aria-labelledby'), "`classroom-roster-match-column ${rowId}-${google.name ? 'name' : 'email'}`", 'named by its column, then its student: the name, or the email where Google has none');
  // The row draws the student's name and email under the ids the box names, and the row's ids are its own.
  const row = region(source, 'matchPlan.map((item, index) => {', '</tr>', 'one roster row');
  assert.match(row, /const rowId = `classroom-roster-\$\{index\}`;/, 'a row\'s ids are its own');
  assert.match(row, /<strong id=\{`\$\{rowId\}-name`\}>\{google\.name\}<\/strong>/, 'the name the row shows');
  assert.match(row, /<div id=\{`\$\{rowId\}-email`\} style=\{[^>]*\}>\{google\.email\}<\/div>/, 'and its email');
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
    if (named && !named.startsWith('`')) assert.ok(ids.has(named), `aria-labelledby="${named}" names an element the screen draws`);
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
  for (const value of ['material.title', 'material.url']) assert.ok(group.includes(fieldShowing(value).tag), `and ${value}, a field of every link`);
});

test('each section is headed by its title, one level under the screen\'s own, and drawn as the bold line it was', () => {
  // The screen's own heading, the workspace's (h1) being above it, and no other at its level or above.
  const headings = [...source.matchAll(/<h([1-6])\b[^>]*>([^<]*)<\/h\1>/g)].map(([tag, level, words]) => ({ tag, level: Number(level), words: words.trim() }));
  assert.deepEqual(headings.filter(({ level }) => level <= 2).map(({ tag }) => tag), ['<h2 style={{ margin: 0 }}>Google Classroom Manager</h2>']);
  // Each section's first words are its title, a heading one level under the screen's: 1. to 8., in order.
  const sections = elements('section').map(({ at, tag }) => source.slice(at + tag.length, closing(at, 'section')));
  assert.equal(sections.length, 8, 'the screen\'s eight sections');
  sections.forEach((inner, index) => {
    const first = /<(h[1-6]|strong|b|div|span|p|label)\b[^>]*>([^<{]*[^<{\s][^<{]*)</.exec(inner);
    assert.ok(first, `section ${index + 1} has words`);
    assert.match(first[2].trim(), new RegExp(`^${index + 1}\\. `), `section ${index + 1} starts with its numbered title`);
    assert.equal(first[1], 'h3', `"${first[2].trim()}" is a heading under the screen's h2, not bold text`);
  });
  assert.deepEqual(headings.filter(({ level }) => level === 3).map(({ words }) => words.replace(/ .*/, '')), ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.'], 'the sections\' headings, and no other at their level');
  // In the screen's heading order: under the workspace's h1 its h2, and no heading more than one level under the last.
  headings.reduce((previous, heading) => {
    assert.ok(heading.level <= previous.level + 1, `"${heading.words}" (h${heading.level}) after an h${previous.level}: no level skipped`);
    return heading;
  }, { level: 1 });
  // Drawn as the bold line it was: a heading's own margins and larger size are taken off, so on screen nothing moves.
  for (const { tag } of headings.filter(({ level }) => level === 3)) assert.match(tag, /^<h3 style=\{sectionTitle\}>/);
  assert.match(source, /const sectionTitle = \{ margin: 0, fontSize: 'inherit' \};/);
  assert.doesNotMatch(source, /<strong>\d\. /, 'no section is titled in bold text');
});

test('on a phone every row of the connected screen fits its card, and on a laptop it is as it was', () => {
  // Two tracks with minimum widths, side by side in every width, run past a narrow card: a grid of them is auto-fit.
  for (const [, tracks] of source.matchAll(/gridTemplateColumns: '([^']+)'/g)) {
    const minimums = (tracks.match(/minmax\(min\(100%, \d+px\)/g) || []).length;
    assert.ok(minimums <= 1 || /^repeat\(auto-fit, minmax\(min\(100%, \d+px\), 1fr\)\)$/.test(tracks), `columns "${tracks}" sit side by side only where they fit`);
  }
  // "Publish a MathMaster assignment": the topic and the delivery side by side, in two equal columns where two fit.
  const publish = region(source, '5. Publish a MathMaster assignment', '</section>', 'the publish card');
  assert.match(publish, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)'/);
  // A course's row: the course, its class and its pill side by side where they fit, the course and its class sharing
  // the row equally as the two equal columns did, and wrapping on a phone.
  const rows = region(source, 'mappedCourseCards.map(({ course, mapping }) => (', '))}', 'one row per course');
  assert.match(rows, /<div key=\{course\.id\} style=\{\{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' \}\}>/);
  assert.match(rows, /<div style=\{\{ flex: '1 1 0', minWidth: 'min\(100%, 220px\)' \}\}>/, 'the course');
  assert.match(rows, /<div style=\{\{ flex: '1 1 0', minWidth: 'min\(100%, 240px\)' \}\}>\s*<select\s+style=\{\{ \.\.\.input, display: 'block' \}\}/, 'its class, in a box without padding, as the course is');
  // A course to publish to: 220px of course where there is room, as always, and never past the card.
  const courses = region(source, '4. Classroom destinations and organization', '</section>', 'the destinations card');
  assert.match(courses, /<label key=\{course\.id\} style=\{\{[^}]*minWidth: 'min\(220px, 100% - 26px\)' \}\}>/);
  assert.doesNotMatch(courses, /minWidth: \d/, 'no fixed minimum left');
});

// The element `name` that opens nearest before `at` and closes after it (-1: none).
const enclosing = (at, name) => {
  for (let open = source.lastIndexOf(`<${name}`, at); open !== -1; open = source.lastIndexOf(`<${name}`, open - 1)) {
    if (/^<\w+[\s>]/.test(source.slice(open, open + name.length + 2)) && closing(open, name) > at) return open;
  }
  return -1;
};
// The first element inside the one whose opening tag is `tag` at `at`, past white space and emptied comments.
const firstChild = (at, tag) => {
  const match = /^(?:\s|\{\s*\})*<([A-Za-z][\w.]*)\b/.exec(source.slice(at + tag.length));
  if (!match) return null;
  const start = at + tag.length + match[0].length - match[1].length - 1;
  return { name: match[1], at: start, tag: openingTag(start) };
};

test('the grade\'s checkboxes are a group named by "Google Classroom grade represents", the title above them', () => {
  const group = elements('div').find(({ tag }) => /\srole="group"/.test(tag) && attribute(tag, 'aria-labelledby') === 'classroom-grade-represents');
  assert.ok(group, 'the box is a group, named by its title');
  const inner = source.slice(group.at, closing(group.at, 'div'));
  const title = firstChild(group.at, group.tag);
  assert.equal(attribute(title.tag, 'id'), 'classroom-grade-represents', 'its title, first in the box, is what names it');
  assert.match(inner, /<div id="classroom-grade-represents" style=\{\{ \.\.\.label, marginBottom: 8 \}\}>Google Classroom grade represents<\/div>/, 'the words and the look it always had');
  assert.match(inner, /<ClassroomSectionGradeSelector\b/, 'and the checkboxes are inside it');
});

test('a bold line that titled a box of controls is a heading under its section\'s, in the screen\'s order, drawn as it was', () => {
  const sections = elements('section').map(({ at }) => ({ at, end: closing(at, 'section') }));
  const titles = ['ID-only students: paste an identity list (optional)', 'Post missing but MathMaster says it exists?', 'can be retried now.', 'Regrade an assignment that is already closed'];
  for (const words of titles) {
    const at = source.indexOf(words);
    assert.notEqual(at, -1, `"${words}" is on the screen`);
    const heading = enclosing(at, 'h4');
    assert.notEqual(heading, -1, `"${words}" is a heading, one level under its section's`);
    assert.match(openingTag(heading), /^<h4 style=\{(?:boxTitle|\{ \.\.\.boxTitle, [^{}]*\})\}>$/, `"${words}" keeps its own look, with no margin of its own`);
    // In the screen's order: inside a section, after the section's own heading.
    const section = sections.find(({ at: start, end }) => start < heading && heading < end);
    assert.ok(section && source.indexOf('<h3 style={sectionTitle}>', section.at) < heading, `"${words}" comes after its section's heading`);
    // It titles a box of controls: the first thing in that box, which holds a button.
    const box = enclosing(heading, 'div');
    assert.equal(firstChild(box, openingTag(box))?.at, heading, `"${words}" opens its box`);
    assert.match(source.slice(box, closing(box, 'div')), /<button\b/, `"${words}" titles controls`);
  }
  assert.match(source, /const boxTitle = \{ margin: 0, fontSize: 'inherit' \};/, 'a heading\'s own margins and size are taken off');
  // The identity list's title is also its field's label, as it was.
  assert.equal(attribute(labels.find(({ words }) => words === titles[0]).tag, 'htmlFor'), 'classroom-identity-list');
});

test('no box of controls is titled by bold text alone: its title is a heading, or the name of the group it is in', () => {
  const controlsIn = (inner) => (inner.match(/<(?:button|input|select|textarea)\b/g) || []).length
    + 2 * (inner.match(/<ClassroomSectionGradeSelector\b/g) || []).length;
  const boldText = ({ name, tag }) => ['strong', 'b'].includes(name)
    || (['div', 'span', 'p'].includes(name) && /fontWeight: (?:700|800|900)\b|style=\{label\}|\.\.\.label\b/.test(tag));
  const groups = elements('div').filter(({ tag }) => /\srole="group"/.test(tag)).map(({ at, tag }) => ({ at, end: closing(at, 'div'), name: attribute(tag, 'aria-labelledby') }));
  const titled = new Set();
  for (const { at, tag } of elements('div')) {
    const end = closing(at, 'div');
    if (controlsIn(source.slice(at, end)) < 2) continue;
    // The box's first words, down through the wrappers it opens with (a row, a span).
    let first = firstChild(at, tag);
    while (first && ['div', 'span'].includes(first.name) && !boldText(first)) first = firstChild(first.at, first.tag);
    if (!first || !boldText(first)) continue;
    const id = attribute(first.tag, 'id');
    const group = groups.find((entry) => entry.at <= at && end <= entry.end && entry.name === id);
    assert.ok(id && group, `a box of controls titled in bold text that names nothing: ${first.tag.slice(0, 80)}`);
    titled.add(id);
  }
  // The links' fields, the grade's checkboxes and each published assignment's buttons, each named by its title.
  assert.deepEqual([...titled].sort(), ['classroom-grade-represents', 'classroom-resource-links', '`classroom-health-${assignment.id}`'].sort());
  const health = region(source, 'syncByAssignment.map(({ assignment, sync }) => (', 'Check / repost missing assignment', 'a published assignment\'s row');
  assert.match(health, /<strong id=\{`classroom-health-\$\{assignment\.id\}`\}>\{assignment\.title\}<\/strong>/, 'an assignment\'s row is named by its title');
});

test('every roster row\'s button is named by its row: the words on it first, then the Classroom student it links', () => {
  const row = region(source, 'matchPlan.map((item, index) => {', '</tr>', 'one roster row');
  // The row's own two lines: the words its button shows, and its name. Run here on the cases a row can be in.
  const words = /const linkWords = [^;]+;/.exec(row)?.[0];
  const name = /const linkName = [^;]+;/.exec(row)?.[0];
  assert.ok(words && name, 'the row works out its button\'s words and its name');
  const button = new Function('linked', 'alreadyLinked', 'google', `${words}\n${name}\nreturn { linkWords, linkName };`);
  const ana = { name: 'Ana Diaz', email: 'ana.diaz@students.example' };
  assert.deepEqual(button(undefined, false, ana), { linkWords: 'Confirm link', linkName: 'Confirm link for Ana Diaz' });
  assert.deepEqual(button({ studentId: '7' }, false, ana), { linkWords: 'Change link', linkName: 'Change link for Ana Diaz' });
  assert.deepEqual(button({ studentId: '7' }, true, ana), { linkWords: 'Linked', linkName: 'Linked for Ana Diaz' });
  // A student Google gives no name is named by their email, as the row shows them; one with neither, as the status does.
  assert.equal(button(undefined, false, { name: '', email: 'x.y@students.example' }).linkName, 'Confirm link for x.y@students.example');
  assert.equal(button(undefined, false, {}).linkName, 'Confirm link for this Classroom student');
  // Two rows' buttons no longer share a name; the status after a link names the student the same way.
  assert.notEqual(button(undefined, false, ana).linkName, button(undefined, false, { name: 'Noor Abernathy' }).linkName);
  assert.match(source, /const googleLabel = item\.classroomStudent\.name \|\| item\.classroomStudent\.email \|\| 'this Classroom student';/);
  // The button shows those words and has that name; what it does is what it did.
  const tag = openingTag(row.indexOf('<button') + source.indexOf(row));
  assert.match(tag, /\saria-label=\{linkName\}/);
  assert.match(tag, /\sdisabled=\{busy \|\| !selected \|\| alreadyLinked\}/);
  assert.match(tag, /\sonClick=\{\(\) => handleLinkOne\(item\)\}/);
  assert.match(row, /onClick=\{\(\) => handleLinkOne\(item\)\}\s*>\s*\{linkWords\}\s*<\/button>/, 'its visible words, unchanged');
});

test('the "Topic names" box keeps a usable width: its row wraps on a phone, and is as it was on a laptop', () => {
  const card = region(source, '4. Classroom destinations and organization', '</section>', 'the destinations card');
  const area = card.indexOf('<textarea id="classroom-topic-names"');
  assert.notEqual(area, -1, 'the topics\' box');
  const at = source.indexOf(card);
  const box = enclosing(at + area, 'div');
  const row = enclosing(box - 1, 'div');
  assert.match(openingTag(row), /^<div style=\{\{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' \}\}>$/, 'a row that wraps, its button at the box\'s foot as it was');
  // The box takes what the button leaves, as the column did, and never less than 220px or more than the card: where both
  // do not fit, the button goes under it.
  assert.match(openingTag(box), /^<div style=\{\{ flex: '1 1 0', minWidth: 'min\(100%, 220px\)' \}\}>$/);
  const button = source.slice(closing(box, 'div'), closing(row, 'div'));
  assert.match(button, /^<\/div>\s*<button style=\{secondary\} disabled=\{busy\} onClick=\{handleCreateTopics\}>Create \/ ensure topics<\/button>\s*$/, 'the same button, beside or under the box, doing what it did');
  assert.doesNotMatch(card, /gridTemplateColumns: '1fr auto'/, 'no column that leaves the box what a phone has left');
});
