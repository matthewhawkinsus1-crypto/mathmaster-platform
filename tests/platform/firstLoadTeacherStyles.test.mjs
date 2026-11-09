// THE TEACHER'S STYLESHEETS ARE NOT IN A STUDENT'S FIRST LOAD, AND A TEACHER'S
// TOUCH SCREEN LOOKS AS IT DID (PF01).
//
// teacherWorkspace.css (2.2 KB gzip) and supportEvidence.css (1.7 KB) reached
// every student's first load through src/app/shell/leadingStyles.js, which
// linked them before App.css on purpose (the G2 fix, df7556c8): four of
// App.css's touch rules set what teacher rules of the same specificity set,
// and won only by coming after them. They are the 22px checkboxes of the
// support options (.se-option) and of Grade Export's rows (.tw-export-row),
// the 12px cells of the support evidence report's tables (.se-table) and, on a
// classroom display, the report's headings (.se-report). App.css now names
// those classes and wins by weight, so the two sheets load with the teacher's
// workspace (src/app/teacher/TeacherWorkspace.jsx), after App.css, and a
// teacher sees what they saw whichever order the sheets come in. The report's
// print rules reach every page, so they stay before App.css in a sheet of
// their own (supportEvidencePrint.css): printing is what it was.
//
// The walk is tests/platform/initialBundleBoundary.test.mjs's (static imports
// from main.jsx, then App.jsx: tests/platform/helpers/firstLoadGraph.mjs); the
// cascade is tests/platform/helpers/cssCascade.mjs's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import { parseCss } from './helpers/cssRules.mjs';
import { winning } from './helpers/cssCascade.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const graph = firstLoadGraph();
const file = (name) => path.join(repo, name);
const read = (name) => readFileSync(file(name), 'utf8');
const SUPPORT_SHEET = 'src/components/teacher/supportEvidence.css';
const WORKSPACE_SHEET = 'src/components/teacher/teacherWorkspace.css';
const PRINT_SHEET = 'src/components/teacher/supportEvidencePrint.css';

test('the walker reaches the first load, and the sheets that still link before App.css', () => {
  assert.ok(graph.has(file('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  for (const name of ['src/app/shell/leadingStyles.js', PRINT_SHEET, 'src/platform/mobile/MobileInteractionFoundation.css', 'src/App.css']) {
    assert.ok(graph.has(file(name)), `${name} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const name of [SUPPORT_SHEET, WORKSPACE_SHEET]) {
  test(`${path.basename(name)} is not in the first load: it styles only the teacher's screens`, () => {
    assert.ok(existsSync(file(name)), `${name} no longer exists: point this test at the sheet that holds its rules now`);
    assert.ok(!graph.has(file(name)), `${name} is in the first load: ${graph.has(file(name)) ? chainTo(graph, file(name)) : ''}`);
  });
}

test('the workspace links both, so they come before every teacher screen inside it', () => {
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  for (const sheet of ['supportEvidence.css', 'teacherWorkspace.css']) {
    assert.match(workspace, new RegExp(`^import '\\.\\./\\.\\./components/teacher/${sheet.replace('.', '\\.')}';$`, 'm'), `TeacherWorkspace.jsx imports ${sheet}`);
  }
});

test('the report\'s print rules moved, whole, to the sheet every page links', () => {
  const print = parseCss(read(PRINT_SHEET));
  assert.ok(print.length > 0 && print.every((rule) => rule.atRules.includes('@media print')), 'the print sheet holds print rules only');
  assert.ok(print.some((rule) => rule.selectors.includes('body *') && rule.declarations.visibility?.value === 'hidden'), 'it is the rule that hides the rest of a printed page');
  assert.ok(parseCss(read(SUPPORT_SHEET)).every((rule) => !rule.atRules.some((atRule) => /print/.test(atRule))), 'supportEvidence.css keeps no print rule of its own');
});

// The sheets in the order they link: the entry's (index.html), App's (the
// leading module's, then the shared rewards sheet, then App's own), and the
// teacher sheets either where leadingStyles.js put them or after App's, where
// the workspace now brings them.
const sheet = (name) => ({ name, rules: parseCss(read(name)) });
const ENTRY = ['src/index.css', 'src/LoginScreen.css', 'src/ui/uiKit.css'].map(sheet);
const [PRINT, MOBILE] = [PRINT_SHEET, 'src/platform/mobile/MobileInteractionFoundation.css'].map(sheet);
const APP = ['src/components/rewards/rewards.css', 'src/App.css', 'src/components/student/StudentIdentityBar.css'].map(sheet);
const TEACHER = [SUPPORT_SHEET, WORKSPACE_SHEET].map(sheet);
const ORDERS = {
  'teacher sheets after App.css': [...ENTRY, PRINT, MOBILE, ...APP, ...TEACHER],
  'teacher sheets before App.css': [...ENTRY, PRINT, ...TEACHER, MOBILE, ...APP],
};

const DEVICES = {
  tablet: { width: 1180, height: 820, pointer: 'coarse' },
  display: { width: 1920, height: 1080, pointer: 'coarse' },
  laptop: { width: 1366, height: 768, pointer: 'fine' },
  phone: { width: 390, height: 844, pointer: 'coarse' },
};

// Where each element sits: inside the workspace's content (TeacherWorkspace.jsx).
const SHELL = [
  { tag: 'html' }, { tag: 'body' }, { tag: 'div', id: 'root' },
  { tag: 'div', classes: ['mm-dashboard-shell'] }, { tag: 'div' }, { tag: 'div', classes: ['mm-dashboard-content'] },
];
const CHECKBOX = { tag: 'input', attrs: { type: 'checkbox' } };
const EDITOR = [...SHELL, { tag: 'section', attrs: { 'data-support-profile-editor': '' } }, { tag: 'form' }, { tag: 'fieldset', classes: ['se-fieldset'] }];
const REPORT = [...SHELL, { tag: 'div', classes: ['se-report-overlay'], attrs: { role: 'presentation' } }, { tag: 'article', classes: ['se-report'], attrs: { role: 'dialog' } }, { tag: 'section' }];
const REPORT_TABLE = [...REPORT, { tag: 'details', classes: ['se-report__card'] }, { tag: 'div', classes: ['se-scroll-x'], attrs: { role: 'region' } }, { tag: 'table', classes: ['se-table'] }];

// `touch`: App.css's value where its touch rules hold (`on`); `own`: the
// teacher sheet's value everywhere else.
const BOXES = ['tablet', 'display'];
const CASES = [
  { what: 'a support option\'s checkbox', path: [...EDITOR, { tag: 'div', classes: ['se-option'] }, CHECKBOX], properties: ['width', 'height'], touch: '22px', own: '18px', on: BOXES },
  { what: 'the inclusion status checkbox', path: [...EDITOR.slice(0, -1), { tag: 'label', classes: ['se-option'] }, CHECKBOX], properties: ['width', 'height'], touch: '22px', own: '18px', on: BOXES },
  { what: 'a Grade Export row\'s checkbox', path: [...SHELL, { tag: 'div', classes: ['tw-class-group'] }, { tag: 'div', classes: ['tw-export-row'], attrs: { 'data-export-status': 'ready' } }, CHECKBOX], properties: ['width', 'height'], touch: '22px', own: '24px', on: BOXES },
  { what: 'a cell of the report\'s tables', path: [...REPORT_TABLE, { tag: 'tbody' }, { tag: 'tr' }, { tag: 'td' }], properties: ['padding-top', 'padding-bottom'], touch: '12px', own: '6px', on: BOXES },
  { what: 'a header cell of the report\'s tables', path: [...REPORT_TABLE, { tag: 'thead' }, { tag: 'tr' }, { tag: 'th' }], properties: ['padding-top', 'padding-bottom'], touch: '12px', own: '6px', on: BOXES },
  { what: 'a section heading of the report', path: [...REPORT, { tag: 'h2' }], properties: ['font-size'], touch: '1.9rem', own: 'calc(17 * var(--mm-px))', on: ['display'] },
  { what: 'a card heading of the report', path: [...REPORT, { tag: 'details', classes: ['se-report__card'] }, { tag: 'summary' }, { tag: 'h3' }], properties: ['font-size'], touch: '1.45rem', own: 'calc(15 * var(--mm-px))', on: ['display'] },
];

for (const { what, path: elementPath, properties, touch, own, on } of CASES) {
  test(`${what}: App.css's touch size by weight, the teacher sheet's own elsewhere, in either order`, () => {
    for (const [deviceName, device] of Object.entries(DEVICES)) {
      for (const [orderName, sheets] of Object.entries(ORDERS)) {
        for (const property of properties) {
          const result = winning({ sheets, path: elementPath, property, device });
          const where = `${what}, ${property}, ${deviceName}, ${orderName}`;
          if (on.includes(deviceName)) {
            assert.equal(result?.value, touch, `${where}: ${JSON.stringify(result)}`);
            assert.equal(result.sheet, 'src/App.css', where);
          } else {
            assert.equal(result?.value, own, `${where}: ${JSON.stringify(result)}`);
          }
        }
      }
    }
  });
}
