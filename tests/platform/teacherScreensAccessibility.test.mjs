// TWO SMALL FAILURES THE TEACHER SCREENS' ACCESSIBILITY AUDIT FOUND (TT27), HELD.
//
// 1. The Pre-Flight review's header subtitle (the lesson's title and file) was
//    white at 92% opacity on the header's blue: 4.06:1, and 4.5:1 is what small
//    text needs (WCAG 1.4.3). The contrast review decided it (tests/browser/
//    contrastReview.mjs over the teacher-preflight scene, which axe leaves
//    "needs review" because the text has an opacity).
// 2. The Warm-Up timer's select was named by a hidden <label for=id>, and the id
//    was built from the assignment and class, so the same control on the class
//    page behind the Assignment Hub shared it. The hub's select was announced as
//    "Warm-Up timer minutes Warm-Up timer minutes" (axe duplicate-id-aria and
//    form-field-multiple-labels, "needs review"; Chromium's name for the select).
//
// The browser proof of both is the certification's teacher scenes
// (teacher-preflight, teacher-assignment-hub) and the contrast review.
//
// THE THIRD SLICE added scenes for the rest of the teacher's screens and fixed what they found; the second
// half of this file holds each, as behaviour where a node test can render the component (Vite's SSR, and the
// shallow loader that lets a handler be called) and as source otherwise. The browser proof is the same scenes.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHexColor, relativeLuminance } from '../../src/theme/themeColorRoles.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { startShallowLoader } from './helpers/shallowComponent.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

const ratio = (a, b) => {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('the Pre-Flight header\'s small text is white on its blue at full strength, which is at least 4.5:1', () => {
  const header = region(read('src/components/teacher/LessonPreflightModal.jsx'), '<header style={{', '</header>', 'the review header');
  const background = header.match(/background: '(#[0-9a-fA-F]{6})'/)?.[1];
  const color = header.match(/color: '(#[0-9a-fA-F]{3,6})'/)?.[1];
  assert.ok(background && color, 'the header sets its own colours, so they are what is measured');
  const subtitle = region(header, '<span style={{', '</span>', 'the subtitle');
  assert.doesNotMatch(subtitle, /opacity/, 'the subtitle is not faded: white at 92% on this blue is 4.06:1');
  const white = parseHexColor(color.length === 4 ? `#${color.slice(1).split('').map((digit) => digit + digit).join('')}` : color);
  assert.ok(ratio(white, parseHexColor(background)) >= 4.5, `the subtitle's contrast on ${background} is ${ratio(white, parseHexColor(background)).toFixed(2)}:1`);
});

test('the same arithmetic fails what was shipped: white at 92% on that blue', () => {
  const blue = parseHexColor('#1a73e8');
  const faded = [0, 1, 2].map((channel) => Math.round(255 * 0.92 + blue[channel] * 0.08));
  assert.ok(ratio(faded, blue) < 4.5, `${ratio(faded, blue).toFixed(2)}:1 is below 4.5:1, which is why the check above is not satisfied by any opacity`);
});

test('the Warm-Up timer select is named on itself, with no id for a label to share with the same control elsewhere', () => {
  const row = region(read('src/components/teacher/ClassLessonControls.jsx'), 'action.timer ? (', 'TIMER_CHOICES.map', 'the timer control');
  assert.match(row, /<select aria-label="Warm-Up timer minutes" className="tw-select"/, 'its name is on the select');
  assert.doesNotMatch(row, /htmlFor=|<label/, 'no label that points at an id');
  assert.doesNotMatch(row, /\bid=/, 'and no id for one to point at: the hub and the class page behind it render the same control');
});

// ---------------------------------------------------------------------------------------------------------
// THE THIRD SLICE
// ---------------------------------------------------------------------------------------------------------

let vite = null;
let shallow = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  shallow = await startShallowLoader();
});
after(async () => { await vite?.close(); await shallow?.close(); });

const markup = async (file, props) => renderToStaticMarkup(React.createElement((await vite.ssrLoadModule(file)).default, props));
// Every element of a shallow render's tree.
const elementsOf = (node, found = []) => {
  if (Array.isArray(node)) { node.forEach((child) => elementsOf(child, found)); return found; }
  if (node && typeof node === 'object' && 'props' in node) { found.push(node); elementsOf(node.props?.children, found); }
  return found;
};

// 1. The Library's rows answer a click (they open Assignments on the folder) and a drag (they move to a folder), and
//    nothing else reached them: six pointer-only rows in the Tab walk. Each row's title is now a button that does what
//    the click does; the move to a folder has its keyboard route on the Assignments screen's card menu.
const LIBRARY_ASSIGNMENTS = [
  { id: 'a1', title: 'Quadratics — Lesson 1', folder: 'Algebra II', schemaVersion: 5 },
  { id: 'a2', title: 'Linear Equations — Lesson 5', folder: 'Algebra I', schemaVersion: 5 },
  { id: 'a3', title: 'Linear Functions — Review', folder: '', schemaVersion: 5, assignedClassIds: ['c1'] },
];
const libraryProps = (extra = {}) => ({
  assignments: LIBRARY_ASSIGNMENTS, folderPaths: ['Algebra I', 'Algebra II'], onAssignAssignment() {}, onMoveAssignment() {}, onCreateFolder() {}, onRenameFolder() {}, onDeleteFolder() {},
  onNavigateToAssignments() {}, ...extra,
});

test('each row of the Library has a button named for its assignment, inside the row that can be dragged', async () => {
  const html = await markup('/src/AssignmentLibraryBase.jsx', libraryProps());
  const rows = html.split('draggable="true"').slice(1);
  assert.equal(rows.length, LIBRARY_ASSIGNMENTS.length, 'a draggable row for each assignment');
  const titles = LIBRARY_ASSIGNMENTS.map((assignment) => assignment.title).sort((a, b) => a.localeCompare(b));
  // Each chunk runs from one row to the next, so a row's own controls are in its own chunk (the list is sorted by title).
  rows.forEach((row, index) => {
    assert.match(row, new RegExp(`<button type="button" aria-label="Open ${titles[index]} in Assignments"`), `${titles[index]}: a button that names it`);
  });
  // The title the button holds is the title the row showed: the page reads as it did.
  assert.match(html, /aria-label="Open Quadratics — Lesson 1 in Assignments"[^>]*>Quadratics — Lesson 1<\/button>/);
});

test('pressing a row\'s button opens Assignments on the same folder and view as clicking the row, once', async () => {
  const Library = (await shallow.ssrLoadModule('/src/AssignmentLibraryBase.jsx')).default;
  const opened = [];
  const tree = Library(libraryProps({ onNavigateToAssignments: (navigation) => opened.push(navigation) }));
  const button = elementsOf(tree).find((element) => element.type === 'button' && element.props['aria-label'] === 'Open Linear Equations — Lesson 5 in Assignments');
  assert.ok(button, 'the shallow render has the row\'s button');
  let stopped = 0;
  button.props.onClick({ stopPropagation: () => { stopped += 1; } });
  assert.deepEqual(opened, [{ folder: '', smartView: '' }], 'the same call the row\'s own click makes');
  assert.equal(stopped, 1, 'and the row, which answers the same click, is not asked twice');
  const row = elementsOf(tree).find((element) => element.props?.draggable === true && typeof element.props.onClick === 'function');
  assert.ok(row, 'the row still answers a click, for a pointer');
  row.props.onClick({});
  assert.deepEqual(opened[1], opened[0], 'and does the same thing');
});

// 2. The Class & Bell Schedule screen's two selects for each class period had no name: sixteen unnamed Tab stops.
test('each class period\'s course and level selects are named for the period', async () => {
  const html = await markup('/src/components/teacher/ClassCourseSettings.jsx', { classPeriods: ['Period 1', 'Period 2'], courseProfiles: {}, assignments: [] });
  for (const period of ['Period 1', 'Period 2']) {
    assert.match(html, new RegExp(`<select aria-label="${period} course" `));
    assert.match(html, new RegExp(`<select aria-label="${period} course level" `));
  }
  assert.equal((html.match(/<select /g) || []).length, 4, 'and no select without one');
});

// 3. A table that scrolls sideways and holds no control is a box Chromium makes a Tab stop with no name (and axe wants
//    focusable). It is a named region the keyboard can scroll, as the residual table in the Data Modeling Lab already is.
test('the district analytics table scrolls in a named, focusable region', async () => {
  const analytics = {
    totalStudents: 3,
    collegeReadiness: { digitalSAT: { readyRate: 50, sampleSize: 2 }, act: { readyRate: null, sampleSize: 0 }, tsia2: { readyRate: 10, sampleSize: 1 }, note: 'A note.' },
    specialPrograms: { supportedPercentage: 10, supportedUniqueCount: 1 },
    strandAverages: { linear: { title: 'Linear', estimatedMastery: 50, evidencePoints: 3 } },
  };
  const html = await markup('/src/components/analytics/DistrictAnalyticsView.jsx', { analytics });
  assert.match(html, /<div role="region" aria-label="Estimated mastery by Algebra I strand" tabindex="0" style="overflow-x:auto"><table/);
});

const SCROLL_REGIONS = [
  ['src/components/assessment/ProctorLiveMonitor.jsx', 'Live proctor monitor sessions', "marginTop: 18"],
  ['src/components/teacher/PathCoverageAudit.jsx', 'Accommodation delivery by tool', "overflowX: 'auto'"],
  ['src/TexasStandardsDashboard.jsx', 'Question item analysis', "overflowX: 'auto'"],
  ['src/TexasStandardsDashboard.jsx', 'Prerequisite support levels', "overflowX: 'auto'"],
  // Found when Accounts & sign-in had its audit log to show (fakeAdminScreens.js): on a phone the table overflows.
  ['src/SignInAccess.jsx', 'Administrative audit log entries', "overflowX: 'auto'"],
];
test('the other tables and lists that scroll sideways without a control in them are regions too', () => {
  for (const [file, label, style] of SCROLL_REGIONS) {
    const source = read(file);
    const at = source.indexOf(`role="region" aria-label="${label}" tabIndex={0}`);
    assert.ok(at > 0, `${file}: "${label}" is a region the keyboard can focus`);
    assert.ok(source.slice(at, at + 220).includes(style), `${file}: and it is the box that scrolls`);
  }
});

// 4. TEKS & Mastery: the class select had no name (a Tab stop announced as nothing), its student matrix answered a click on
//    the row and nothing else (28 pointer-only rows), and the pathway's select had no name either.
test('the TEKS screen\'s two selects are named, and each student row has the name as a button that selects it', () => {
  const source = read('src/TexasStandardsDashboard.jsx');
  assert.match(source, /<select value=\{classId\} onChange=\{\(event\) => setClassId\(event\.target\.value\)\} aria-label="Class"/);
  assert.match(source, /<select value=\{pathwayStandard\?\.code \|\| ''\} onChange=\{\(event\) => setSelectedPathwayCode\(event\.target\.value\)\} aria-label="TEKS to trace"/);
  const row = region(source, '<tr key={student.id} onClick={() => setSelectedStudentId(student.id)}', '</td>', 'a student row\'s name cell');
  assert.match(row, /<button type="button" aria-current=\{selectedStudent\?\.id === student\.id \? 'true' : undefined\} onClick=\{\(event\) => \{ event\.stopPropagation\(\); setSelectedStudentId\(student\.id\); \}\}/, 'the name: current when chosen, and it chooses');
  assert.match(row, /\{formatStudentName\(student\)\}<\/button>/, 'and it is the name');
  // A button does not inherit the page's letter spacing or text rendering: the name reads as it did.
  assert.match(row, /letterSpacing: 'inherit', textRendering: 'inherit'/);
});

// 5. The Find palette: its list of results had no name, its list items sat between the listbox and its options (so no
//    option had the listbox for a parent), and Tab on the one control of a dialog was read as a keyboard trap by the walk.
test('the Find palette\'s results are a named listbox whose options are its own', () => {
  const source = read('src/components/teacher/TeacherQuickSearch.jsx');
  assert.match(source, /<ul role="listbox" aria-label="Results"/);
  assert.match(source, /<li key=\{`\$\{result\.kind\}:\$\{result\.id\}`\} role="presentation">\s*<button\s+type="button"\s+role="option"/, 'each item is not a list item, so its option belongs to the listbox');
});

// 6. The Math Tools Lab's tool list sticks beside the tool. Stacked above it on a phone, it stuck over the tool as the page
//    scrolled, and covered the control Tab had reached (mm-focus-obscured). One rule unsticks it where it is stacked.
test('the Math Tools Lab\'s tool list is not sticky where the dashboard stacks it above the tool', () => {
  const lab = read('src/dev/MathToolsLab.jsx');
  assert.match(lab, /<aside className="mm-tools-lab-list" style=\{\{[^}]*position:'sticky'/, 'sticky inline, as it is beside the tool');
  const css = readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');
  const phone = region(css, '@media (max-width: 860px) {', '@media (max-width: 560px) {', 'the dashboard\'s narrow-screen rules');
  assert.match(phone, /\.mm-dashboard-content \.mm-tools-lab-list \{\s*position: static !important;\s*\}/, 'static, and !important because the inline style is the stronger');
  // It is not stated for wide screens, where the list sticks as it did.
  assert.doesNotMatch(css.replace(phone, ''), /\.mm-tools-lab-list/);
});

// 7. The Math Tools Lab's header: white text dimmed to 85-90% on the gradient's lighter end measured 4.1-4.4:1, and the
//    "Teacher preview" pill, lightened by a white wash, 3.9:1. The text is opaque white and the pill is washed dark.
test('the Math Tools Lab\'s header text is opaque white, which is at least 4.5:1 on both ends of its gradient, and so is the pill\'s', () => {
  const lab = read('src/dev/MathToolsLab.jsx');
  const header = region(lab, '<header style={{', '</header>', 'the Lab\'s header');
  const stops = header.match(/linear-gradient\(135deg,(#[0-9a-fA-F]{6}),(#[0-9a-fA-F]{6})\)/)?.slice(1);
  assert.equal(stops?.length, 2, 'the header\'s gradient is two plain colours, so they are what is measured');
  assert.match(header, /color:\s*'#fff'/, 'white');
  const text = region(header, '<div><div style={{', '</p></div>', 'the title block');
  assert.doesNotMatch(text, /opacity/, 'none of the header\'s text is faded');
  const white = parseHexColor('#ffffff');
  for (const stop of stops) assert.ok(ratio(white, parseHexColor(stop)) >= 4.5, `white on ${stop} is ${ratio(white, parseHexColor(stop)).toFixed(2)}:1`);
  // The pill's wash, composited over each end, with white text over it.
  const wash = header.match(/<div style=\{\{background:'rgba\(0,0,0,\.(\d+)\)'[^}]*\}\}>Teacher preview<\/div>/);
  assert.ok(wash, 'the pill is washed with black, which can only darken what the text sits on');
  const alpha = Number(`0.${wash[1]}`);
  for (const stop of stops) {
    const under = parseHexColor(stop);
    const washed = [0, 1, 2].map((channel) => under[channel] * (1 - alpha));
    assert.ok(ratio(white, washed) >= 4.5, `the pill's white text over ${stop} is ${ratio(white, washed).toFixed(2)}:1`);
  }
});

// 8. A pressed chip's count ("All 7" on Grade Export) is the info colour at 80% on the info tint: 4.41:1. Pressed, it is not dimmed.
test('a pressed filter chip\'s count is not dimmed, so it reads as the label does (at least 4.5:1)', () => {
  const css = readFileSync(new URL('../../src/components/teacher/teacherWorkspace.css', import.meta.url), 'utf8');
  assert.match(css, /\.tw-chip__count \{ font-weight: 900; opacity: 0\.8; \}/, 'an unpressed count is still dimmed, as it was');
  assert.match(css, /\.tw-chip\[aria-pressed='true'\] \.tw-chip__count \{ opacity: 1; \}/, 'a pressed one is not');
  const tokens = readFileSync(new URL('../../src/theme/tokens.css', import.meta.url), 'utf8');
  const light = tokens.match(/--mm-info-bg: (#[0-9a-fA-F]{6}); --mm-info-text: (#[0-9a-fA-F]{6});/);
  assert.ok(light, 'the light theme\'s info colours');
  assert.ok(ratio(parseHexColor(light[2]), parseHexColor(light[1])) >= 4.5, `a pressed chip's text on its tint is ${ratio(parseHexColor(light[2]), parseHexColor(light[1])).toFixed(2)}:1`);
});
