// A STUDENT'S SCREEN INSIDE A TEACHER'S PAGE IS NOT A SECOND MAIN (TT27, third slice).
//
// Slice 2 gave the teacher workspace one <main> and found three states that still drew a second:
// the Test Cycle's student preview, which runs the shared RichQuestionRuntime, and a running Demo
// Experience session and a running Path Simulator session, which run PathSessionPlayer. Both are
// the student's own components, and a student's page has no other main, so each draws one.
//
// They now take `mainLandmark`. Its default is true, which draws the <main> they have always
// drawn, so every student surface is as it was; the three teacher contexts pass false, which draws
// the same box as a <div>. What holds each part:
//
//   the student default   the real components are rendered here (Vite's SSR, as the tests of the
//                         action bar and the worked solutions do): left alone, the markup is the
//                         <main> it was, and the same with the prop true; with it false it is the
//                         same markup with the one tag changed;
//   who passes it         only the three teacher contexts: the source is scanned, so a student
//                         surface that starts passing it, or a teacher context that stops, is red;
//   the page's count      tests/browser/accessibilityTeacherLandmarks.mjs (L6) opens each state in the
//                         real app, at both sizes, and counts the main landmarks.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { pathSessionIsMain } from '../../src/components/student/myMathPathLandmarks.js';

const root = new URL('../../', import.meta.url);
const read = (file) => executableSource(readFileSync(new URL(file, root), 'utf8'));

// ------------------------------------------------------------ the markup, rendered for real

let vite = null;
const components = {};
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  components.rich = (await vite.ssrLoadModule('/src/components/question/RichQuestionRuntime.jsx')).default;
  components.secure = (await vite.ssrLoadModule('/src/components/assessment/SecureExamQuestionPlayer.jsx')).default;
  components.path = (await vite.ssrLoadModule('/src/components/student/PathSessionPlayer.jsx')).default;
});
after(async () => { await vite?.close(); });

const memoryStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};
// What a question's work area reads from the page while it is drawn (QuestionEngine, as the action bar's tests give it).
const render = (element) => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage(), addEventListener() {}, removeEventListener() {} };
  try {
    return renderToStaticMarkup(element);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

const FIELD_ITEM = {
  questionInstanceId: 'landmark-field', questionType: 'response', prompt: 'Solve $3x + 4 = 19$ for $x$.',
  responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number' }], choices: [], runtimeMode: 'secureTest',
};
const TOOL_ITEM = {
  questionInstanceId: 'landmark-tool', pathToolId: 'intervalNumberLine', runtimeMode: 'secureTest', prompt: 'Graph the interval.',
  tool: { prompt: 'Graph the interval.', min: -8, max: 8, step: 1, variable: 'x', ask: ['graph', 'interval'] },
};
const SESSION = { sessionKind: 'practice', requiredQuestions: 5, summary: { completedQuestions: 0 }, target: { alignmentKey: 'texas:A.5A' } };
const pathProps = (questionInstance) => ({
  session: SESSION, questionInstance, lastGradingResult: null, isSubmitting: false, studentProfile: {}, onSubmitAnswer: async () => null,
});
const LITERAL = { id: 'landmark-literal', questionId: 'landmark-literal', type: 'literal', prompt: 'Write 6/8 in lowest terms.', answer: '3/4' };

// Each draws a wrapper of its own: the rich runtime's field item and tool item, the secure player's
// pass-through to them, and the Path session's two renderers (a typed answer, and a tool question).
const WRAPPERS = {
  'a field item of the rich runtime (a secure Test, Corrections)': (extra) => React.createElement(components.rich, { question: FIELD_ITEM, mode: 'secureTest', ...extra }),
  'a tool item of the rich runtime': (extra) => React.createElement(components.rich, { question: TOOL_ITEM, mode: 'secureTest', draftKey: 'landmark-tool', attempt: { used: 0, allowed: 1 }, ...extra }),
  'the secure exam player, which hands it on': (extra) => React.createElement(components.secure, { examType: 'courseTest', question: FIELD_ITEM, studentSupportProfile: null, accommodationConfirmed: true, draftKey: 'landmark-secure', ...extra }),
  'a Path session, a typed answer': (extra) => React.createElement(components.path, {
    ...pathProps({ questionInstanceId: 'landmark-path', prompt: 'Solve 3x + 4 = 40.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }], attemptsAllowed: 3, attemptsUsed: 0 }),
    ...extra,
  }),
  'a Path session, a tool question': (extra) => React.createElement(components.path, {
    ...pathProps({ questionInstanceId: 'landmark-literal', prompt: LITERAL.prompt, canonicalQuestion: LITERAL, attemptsAllowed: 3, attemptsUsed: 0 }),
    ...extra,
  }),
};

for (const [name, make] of Object.entries(WRAPPERS)) {
  test(`${name}: left alone it is a <main>, and the same with the prop true`, () => {
    const html = render(make({}));
    assert.match(html, /^<main[ >]/, 'a student surface passes nothing, and gets the main it always had');
    assert.ok(html.endsWith('</main>'), 'whose last tag closes it');
    assert.equal(render(make({ mainLandmark: true })), html, 'the default is true: explicit or not, the same bytes');
  });

  test(`${name}: with the prop false it is the same markup with the one tag a <div>`, () => {
    const html = render(make({}));
    const plain = render(make({ mainLandmark: false }));
    assert.match(plain, /^<div[ >]/, 'not a main');
    assert.ok(plain.endsWith('</div>'));
    assert.equal(plain, `<div${html.slice('<main'.length, -'</main>'.length)}</div>`, 'nothing else about the item differs: its attributes, its style and everything in it');
  });
}

// ------------------------------------------------------------ who passes it

const walk = (directory) => readdirSync(directory).flatMap((entry) => {
  const file = path.join(directory, entry);
  return statSync(file).isDirectory() ? walk(file) : [file];
});
const SRC = new URL('src', root).pathname;
const REPO = new URL('.', root).pathname;

// Every `mainLandmark={…}` an element is given, by file, in source order.
const passes = () => Object.fromEntries(walk(SRC)
  .filter((file) => file.endsWith('.jsx'))
  .map((file) => [path.relative(REPO, file), [...executableSource(readFileSync(file, 'utf8')).matchAll(/^\s*mainLandmark=\{(.*)\}\s*$/gm)].map((match) => match[1])])
  .filter(([, expressions]) => expressions.length));

test('only the three teacher contexts pass false: the Test Cycle preview, Demo Experience and the Path Simulator (which is a Path embedded in a teacher\'s page)', () => {
  assert.deepEqual(passes(), {
    // The teacher's contexts.
    'src/components/teacher/TestCyclePreview.jsx': ['false', 'false'],
    'src/components/demo/DemoExperience.jsx': ['false'],
    'src/components/student/MyMathPathApp.jsx': ['pathSessionIsMain({ embedded: embeddedInTeacherPage })'],
    // What hands it on, from the one that was given it to the one that draws.
    'src/components/assessment/SecureExamQuestionPlayer.jsx': ['mainLandmark'],
    'src/components/question/RichQuestionRuntime.jsx': ['mainLandmark', 'mainLandmark'],
    'src/components/student/MyMathPathProductionContainer.jsx': ['mainLandmark'],
  }, 'a student surface that passes it would lose its main; one of these that does not leaves a second main in a teacher\'s page');
});

test('the Test Cycle preview opts out for both ways it draws an item: Corrections\' runtime and the Test\'s secure player', () => {
  const preview = read('src/components/teacher/TestCyclePreview.jsx');
  assert.match(region(preview, '<RichQuestionRuntime', '/>', 'the Corrections item'), /mainLandmark=\{false\}/);
  assert.match(region(preview, '<SecureExamQuestionPlayer', '/>', 'the Test item'), /mainLandmark=\{false\}/);
  assert.equal(preview.split('<RichQuestionRuntime').length - 1, 1, 'the one place it draws the runtime itself');
  assert.equal(preview.split('<SecureExamQuestionPlayer').length - 1, 1, 'and the one place it draws the secure player');
});

test('Demo Experience\'s Path session opts out, and so does a session in a Path a teacher\'s page embeds (the simulator, a student read-only)', () => {
  assert.match(region(read('src/components/demo/DemoExperience.jsx'), '<PathSessionPlayer', '/>', 'the demo session'), /mainLandmark=\{false\}/);
  const app = read('src/components/student/MyMathPathApp.jsx');
  assert.match(app, /const embeddedInTeacherPage = Boolean\(readOnly \|\| sessionProvider\);/, 'a teacher\'s page embeds it for a simulation or a read-only look at a student');
  assert.match(region(app, '<MyMathPathProductionContainer', '/>}', 'the session container'), /mainLandmark=\{pathSessionIsMain\(\{ embedded: embeddedInTeacherPage \}\)\}/);
  assert.match(region(read('src/components/student/MyMathPathProductionContainer.jsx'), '<PathSessionPlayer', '/>', 'the container\'s session player'), /mainLandmark=\{mainLandmark\}/, 'handed on to the player');
});

test('a Path session is its own main in a student\'s page and a plain element in a teacher\'s', () => {
  assert.equal(pathSessionIsMain(), true, 'nothing said: a student\'s');
  assert.equal(pathSessionIsMain({}), true);
  assert.equal(pathSessionIsMain({ embedded: false }), true);
  assert.equal(pathSessionIsMain({ embedded: true }), false, 'embedded in a teacher\'s page, which has its main');
});

// ------------------------------------------------------------ the source of the two components

test('the two components draw every wrapper as the landmark element, which is a main unless the prop is false, and none escapes as a literal main', () => {
  for (const [file, wrappers] of [['src/components/question/RichQuestionRuntime.jsx', 2], ['src/components/student/PathSessionPlayer.jsx', 2]]) {
    const source = read(file);
    assert.doesNotMatch(source, /<main[\s>]|<\/main>|role="main"/, `${file}: a literal main would ignore the opt-out`);
    assert.equal((source.match(/<Landmark[\s>]/g) || []).length, wrappers, `${file}: its wrappers`);
    assert.equal((source.match(/<\/Landmark>/g) || []).length, wrappers);
    assert.ok((source.match(/const Landmark = mainLandmark \? 'main' : 'div';/g) || []).length >= 1, `${file}: the element is a main unless told otherwise`);
  }
  // The rich runtime's two renderers each choose it, for the prop each is handed.
  assert.equal((read('src/components/question/RichQuestionRuntime.jsx').match(/const Landmark = mainLandmark \? 'main' : 'div';/g) || []).length, 2);
});

test('and each declares the prop with the default that keeps a student\'s main', () => {
  const declared = {
    'src/components/question/RichQuestionRuntime.jsx': 3,
    'src/components/assessment/SecureExamQuestionPlayer.jsx': 1,
    'src/components/student/PathSessionPlayer.jsx': 1,
    'src/components/student/MyMathPathProductionContainer.jsx': 1,
  };
  for (const [file, count] of Object.entries(declared)) {
    assert.equal((read(file).match(/\bmainLandmark = true\b/g) || []).length, count, `${file}: every place that takes it defaults it to true`);
    assert.doesNotMatch(read(file), /\bmainLandmark = false\b/);
  }
});
