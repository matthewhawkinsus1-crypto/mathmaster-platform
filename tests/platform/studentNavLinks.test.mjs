/*
 * AX41: STUDENT NAV DESTINATIONS ARE LINKS.
 *
 * Every student screen has an address, but the destinations were buttons: no
 * open-in-new-tab and nothing in a screen reader's links list. Each is now a
 * link to its screen's address; a plain click stays in the tab through the
 * same onNavigate call, and a new-tab click is left to the browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { executableSource } from './helpers/sourceContract.mjs';
import { STUDENT_DESTINATION, STUDENT_DESTINATION_DASHBOARD_MODE, STUDENT_DESTINATION_ORDER } from '../../src/platform/student/navigationModel.js';
import { parseAppPath } from '../../src/app/routes/appUrl.js';

test('each destination is a link to its screen, the current one marked, More still a button (rendered)', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: StudentGlobalNav } = await server.ssrLoadModule('/src/components/student/StudentGlobalNav.jsx');
    const html = renderToStaticMarkup(React.createElement(StudentGlobalNav, { current: STUDENT_DESTINATION.GRADES, onNavigate: () => {} }));
    const links = [...html.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map(([, attributes, label]) => ({
      label, href: /href="([^"]*)"/.exec(attributes)?.[1], current: /aria-current="page"/.test(attributes),
    }));
    assert.deepEqual(links.map(({ label, href }) => [label, href]), [
      ['Home', '/'], ['Assignments', '/assignments'], ['Grades', '/grades'],
      ['My Rewards', '/rewards'], ['My Math Path', '/path'], ['Tests &amp; Exams', '/tests'],
    ]);
    assert.deepEqual(links.filter((link) => link.current).map((link) => link.label), ['Grades']);
    assert.match(html, /<button type="button" class="mm-student-nav__more"/);
    assert.equal((html.match(/<button/g) || []).length, 1, 'only More is a button');
  } finally {
    await server.close();
  }
});

test('every destination\'s address opens that destination\'s screen', () => {
  STUDENT_DESTINATION_ORDER.forEach((destination) => {
    const mode = STUDENT_DESTINATION_DASHBOARD_MODE[destination];
    assert.ok(mode, destination);
  });
  const parsed = (path) => parseAppPath(path).route?.dashboardMode;
  assert.equal(parsed('/'), STUDENT_DESTINATION_DASHBOARD_MODE[STUDENT_DESTINATION.HOME]);
  assert.equal(parsed('/assignments'), STUDENT_DESTINATION_DASHBOARD_MODE[STUDENT_DESTINATION.ASSIGNMENTS]);
  assert.equal(parsed('/grades'), STUDENT_DESTINATION_DASHBOARD_MODE[STUDENT_DESTINATION.GRADES]);
  assert.equal(parsed('/rewards'), STUDENT_DESTINATION_DASHBOARD_MODE[STUDENT_DESTINATION.REWARDS]);
  assert.equal(parsed('/path'), STUDENT_DESTINATION_DASHBOARD_MODE[STUDENT_DESTINATION.MATH_PATH]);
  assert.equal(parsed('/tests'), STUDENT_DESTINATION_DASHBOARD_MODE[STUDENT_DESTINATION.SECURE_EXAMS]);
  // App's navigateStudent opens the same screens.
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /const openStudentAssignmentsCenter = \(\) => openStudentDashboardMode\('assignmentsCenter'\);/);
  assert.match(app, /if \(destination === STUDENT_DESTINATION\.SECURE_EXAMS\) return openStudentDashboardMode\('secureExams'\);/);
});

test('a plain click stays in the tab; a new-tab click is the browser\'s', () => {
  const nav = executableSource(readFileSync(new URL('../../src/components/student/StudentGlobalNav.jsx', import.meta.url), 'utf8'));
  assert.match(nav, /const opensElsewhere = \(event\) => event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey;/);
  assert.match(nav, /onClick=\{\(event\) => \{\s*if \(opensElsewhere\(event\)\) return;\s*event\.preventDefault\(\);\s*if \(!active\) onNavigate\?\.\(destination\);\s*\}\}/);
});

// The phone folds destinations behind "More" with a stylesheet rule
// (index.css); an inline display on a link would beat it, and the nav wrapped
// to three rows on a 390px phone (caught by studentScreenChange S3).
test('the links take their layout from the stylesheet, so the phone fold still hides them', () => {
  const nav = executableSource(readFileSync(new URL('../../src/components/student/StudentGlobalNav.jsx', import.meta.url), 'utf8'));
  const link = nav.slice(nav.indexOf('<a'), nav.indexOf('</a>'));
  assert.doesNotMatch(link, /display:/, 'no inline display on a destination link');
  const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.mm-student-nav > a \{ display: inline-flex; align-items: center; \}/);
  assert.match(css, /\.mm-student-nav\[data-more-open="false"\] \.mm-student-nav__folded \{ display: none; \}/);
});
