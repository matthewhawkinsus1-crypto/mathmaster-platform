// WHAT HOME DOES NOT DRAW IS NOT IN A TEACHER'S FIRST LOAD (the teacher's
// first load, second pass).
//
// After the authoring code left it (firstLoadTeacherWorkspace.test.mjs), a
// teacher still downloaded, before Home's heading, what Home's first screen
// never draws:
//
//   - MathText, for the prompts of Ask my teacher's questions, inside two
//     folds (components/teacher/StudentQuestionsPanel.jsx), and for the
//     Spotlight's projector view: with it MathLive, whose <math-span> renders
//     a prompt as static markup, and the spoken copies MathDisplay adds;
//   - the five panels the workspace draws closed on every screen (Find, the
//     Classroom sync review, an assignment's details, a student's drawer and
//     the support report), with the question family registry an assignment's
//     details reaches through its Recovery plan;
//   - Submission recovery's panel, drawn inside Home's fold of that name once
//     a class and an assignment are chosen there.
//
// Each now arrives when it is first needed (src/app/teacher/onDemandCode.js,
// named in src/app/teacher/teacherPanels.js), and the workspace fetches it all
// while the browser is idle once it has drawn (teacherPanelPrefetch.js). The
// questions panel draws its questions once the prompts' math is here, so it
// appears whole: no prompt, and no LaTeX, arrives after it.
//
// The walk: tests/platform/helpers/firstLoadGraph.mjs's teacherFirstLoadGraph
// (the budget's teacherHome path, static imports only). The helpers and the
// questions panel are driven through Vite with the rerendering hook shim
// (helpers/rerenderingHookShim.mjs), and with React itself for what a panel
// draws.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { chainTo, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';
import { importsComponent } from './helpers/componentImport.mjs';
import { RERENDERING_SHIM, findElement } from './helpers/rerenderingComponent.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const graph = teacherFirstLoadGraph();

test('the walk reaches Home, its questions and live monitor, and how they load the rest', () => {
  for (const file of [
    'src/TeacherHome.jsx',
    'src/components/teacher/StudentQuestionsPanel.jsx',
    'src/components/teacher/LiveClassMonitor.jsx',
    // Drawn on Home while a class is in session: it stays.
    'src/components/teacher/ClassLessonControls.jsx',
    'src/app/teacher/TeacherWorkspace.jsx',
    'src/app/teacher/teacherPanels.js',
    'src/app/teacher/onDemandCode.js',
    'src/app/teacher/teacherPanelPrefetch.js',
  ]) {
    assert.ok(graph.has(path.join(repo, file)), `${file} is no longer reached: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

for (const [file, why] of [
  ['src/components/common/MathText.jsx', 'Ask my teacher\'s prompts and the Spotlight draw with it, on demand (teacherPanels.js)'],
  ['src/MathDisplay.jsx', 'MathText\'s mathematics'],
  ['src/platform/math/mathliveRuntime.js', 'MathLive and its fonts, which <math-span> needs'],
  ['pkg:mathlive', 'MathLive itself (212 KB gzip)'],
  ['src/platform/language/speechText.js', 'the spoken copy of each formula (17 KB gzip)'],
  ['src/platform/language/mathSpeechLabel.js', 'the spoken copy\'s words'],
  ['src/components/common/mathSegments.js', 'where MathText finds the mathematics'],
  ['src/mathDisplayFormat.js', 'how MathDisplay reads a formula'],
  ['src/components/teacher/StudentSpotlightView.jsx', 'drawn only while a student presents'],
  ['src/tools/graphing2/storedLineText.js', 'the Spotlight\'s reading of a student\'s line'],
  ['src/components/teacher/TeacherQuickSearch.jsx', 'Find, mounted when it first opens'],
  ['src/platform/teacher/teacherSearch.js', 'Find\'s search'],
  ['src/components/teacher/ClassroomSyncReview.jsx', 'the Classroom sync review, mounted when a proposal first opens it'],
  ['src/components/teacher/AssignmentHub.jsx', 'an assignment\'s details, mounted when first opened'],
  ['functions/shared/questionFamilyRegistry.mjs', 'the question family registry (73 KB gzip), through an assignment\'s details and its Recovery plan'],
  ['functions/shared/recoveryContentPlan.mjs', 'an assignment\'s Recovery plan'],
  ['functions/shared/sectionRecoveryService.mjs', 'who can recover, in an assignment\'s details'],
  ['src/components/teacher/AssignmentSupportLayer.jsx', 'an assignment\'s supports and evidence'],
  ['src/components/teacher/StudentProfileDrawer.jsx', 'a student\'s drawer, mounted when first opened'],
  ['src/components/teacher/rewards/StudentRewardsPanel.jsx', 'the drawer\'s rewards'],
  ['src/components/teacher/StudentSupportEvidencePanel.jsx', 'the drawer\'s supports and evidence'],
  ['src/components/teacher/StudentAssignmentsList.jsx', 'the drawer\'s assignments'],
  ['src/components/teacher/SupportEvidenceReportView.jsx', 'the support evidence report, mounted when first opened'],
  ['src/platform/supportEvidence/supportEvidenceReport.js', 'what the report builds'],
  ['src/components/teacher/SupportProfileEditor.jsx', 'a student\'s support profile, in the drawer, the hub and the report'],
  ['src/components/teacher/StudentPersistenceRecoveryPanel.jsx', 'Submission recovery, once a class and an assignment are chosen'],
]) {
  test(`${path.basename(file)} is not in a teacher's first load: ${why}`, () => {
    const key = file.startsWith('pkg:') ? file : path.join(repo, file);
    // A renamed or deleted module is in no graph at all: say so, or the
    // absence below proves nothing about the module that took its place.
    if (!file.startsWith('pkg:')) assert.ok(existsSync(key), `${file} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${file} is in a teacher's first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

test('what Home and the workspace draw on demand comes from teacherPanels.js, each by the helper that fits it', () => {
  const panels = executableSource(read('src/app/teacher/teacherPanels.js'));
  assert.match(panels, /^export const promptMath = onDemandCode\(\(\) => import\('\.\.\/\.\.\/components\/common\/MathText\.jsx'\)\);$/m);
  assert.match(panels, /^export const StudentSpotlightView = drawnPanel\(\(\) => import\('\.\.\/\.\.\/components\/teacher\/StudentSpotlightView\.jsx'\)\);$/m);
  assert.match(panels, /^export const StudentPersistenceRecoveryPanel = drawnPanel\(\(\) => import\('\.\.\/\.\.\/components\/teacher\/StudentPersistenceRecoveryPanel\.jsx'\)\);$/m);
  // Taken from there, and from nowhere statically.
  assert.equal(importsComponent('src/components/teacher/LiveClassMonitor.jsx', 'StudentSpotlightView', 'src/components/teacher/StudentSpotlightView.jsx'), 'onDemand');
  assert.equal(importsComponent('src/TeacherHome.jsx', 'StudentPersistenceRecoveryPanel', 'src/components/teacher/StudentPersistenceRecoveryPanel.jsx'), 'onDemand');
  for (const name of ['TeacherQuickSearch', 'ClassroomSyncReview', 'AssignmentHub', 'StudentProfileDrawer', 'SupportEvidenceReportView']) {
    assert.equal(importsComponent('src/app/teacher/TeacherWorkspace.jsx', name, `src/components/teacher/${name}.jsx`), 'onDemand', `the workspace takes ${name} on demand`);
  }
  // The spotlight and the recovery panel are drawn where they were, with the same props.
  const monitor = executableSource(read('src/components/teacher/LiveClassMonitor.jsx'));
  assert.match(monitor, /\{activeSpotlight\?\.status === SPOTLIGHT_STATUS\.ACCEPTED && <StudentSpotlightView request=\{activeSpotlight\} frame=\{spotlightFrame\} onStop=\{stopSpotlight\} \/>\}/);
  const home = executableSource(read('src/TeacherHome.jsx'));
  assert.match(region(home, '{recoveryAssignmentId && (', ')}', 'Submission recovery'), /<StudentPersistenceRecoveryPanel\s+key=\{`\$\{recoveryClassId\}::\$\{recoveryAssignmentId\}`\}/);
});

/*
 * THE HELPERS, DRIVEN. React itself renders what a panel draws; the
 * rerendering shim keeps a panel's state from one render to the next.
 */
const real = await import('../../src/app/teacher/onDemandCode.js');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

test('a panel drawn closed draws and asks for nothing until it opens, then draws exactly itself once its code is here', async () => {
  const Fake = ({ label, open }) => createElement('aside', { 'data-fake': '', 'data-open': String(open) }, label);
  const code = deferred();
  let asked = 0;
  const Panel = real.closedPanel(() => { asked += 1; return code.promise; }, (props) => props.open);
  assert.equal(renderToStaticMarkup(createElement(Panel, { open: false, label: 'Find' })), '', 'closed: nothing in its place');
  assert.equal(asked, 0, 'and its code is not asked for');
  // Opened before its code is here: a Suspense of its own, nothing in its place.
  assert.equal(renderToStaticMarkup(createElement(Panel, { open: true, label: 'Find' })), '');
  assert.equal(asked, 1, 'asked for as it opens');
  code.resolve({ default: Fake });
  await settle();
  // Once here (the idle prefetch, or that first request), drawn at once and
  // exactly as the panel draws itself: nothing of the helper reaches the page.
  assert.equal(
    renderToStaticMarkup(createElement(Panel, { open: true, label: 'Find' })),
    renderToStaticMarkup(createElement(Fake, { open: true, label: 'Find' })),
  );
  Panel.prefetch();
  assert.equal(asked, 1, 'one request per page, shared by the prefetch');
});

test('a drawn panel asks for its code as it is drawn and draws exactly itself once here; the prefetch asks first', async () => {
  const Fake = ({ frame }) => createElement('section', null, frame);
  let asked = 0;
  const Spotlight = real.drawnPanel(() => { asked += 1; return Promise.resolve({ default: Fake }); });
  Spotlight.prefetch();
  assert.equal(asked, 1, 'the idle prefetch asks');
  await settle();
  assert.equal(renderToStaticMarkup(createElement(Spotlight, { frame: 'Q1' })), '<section>Q1</section>', 'drawn at once after the prefetch');
  assert.equal(asked, 1);
});

test('a failed request is kept, and handed to whoever needs the code', async () => {
  const failure = new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/AssignmentHub-abc.js');
  let asked = 0;
  const code = real.onDemandCode(() => { asked += 1; return Promise.reject(failure); });
  code.prefetch();
  await settle();
  await assert.rejects(code.load(), (error) => error === failure);
  await assert.rejects(code.load(), (error) => error === failure);
  assert.equal(asked, 1, 'not asked again: a browser keeps a failed module URL for the life of the page');
  assert.equal(code.loaded(), null);
  // A panel's lazy is given the same failure, which reaches AppErrorBoundary
  // ("MathMaster was just updated"): teacherCodeRecovery.mjs C5 and C6 show it.
  const helpers = executableSource(read('src/app/teacher/onDemandCode.js'));
  assert.match(helpers, /lazy\(code\.load\)/);
  assert.equal((helpers.match(/\bpending = /g) || []).length, 2, 'pending is declared, and set once by the request: a failed request is not forgotten');
});

// Vite, with React replaced by the rerendering shim and, for the questions
// panel, its listener and its math replaced by stubs the test drives.
const helpersDir = path.join(repo, 'tests/platform/helpers');
const STUBS = new Map([
  [path.join(repo, 'src/firebase.js'), path.join(helpersDir, 'emptyModule.mjs')],
  [path.join(repo, 'src/platform/supports/askTeacherStore.js'), path.join(helpersDir, 'askTeacherStoreStub.mjs')],
]);
let loader;
let shim;
test.before(async () => {
  loader = await createServer({
    configFile: false,
    root: repo,
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
    plugins: [{
      name: 'teacher-home-stubs',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (!importer || !source.startsWith('.')) return null;
        const resolved = await this.resolve(source, importer, { skipSelf: true });
        const id = String(resolved?.id || '').split('?')[0];
        // The questions panel's math is a stub; anything else gets the real
        // teacherPanels.js. The panel loaded as `…?mathFails` is given math
        // that cannot load.
        if (id === path.join(repo, 'src/app/teacher/teacherPanels.js')) {
          if (!importer.includes('StudentQuestionsPanel.jsx')) return null;
          return path.join(helpersDir, importer.includes('?mathFails') ? 'promptMathFailingStub.mjs' : 'promptMathStub.mjs');
        }
        return STUBS.get(id) || null;
      },
    }],
    resolve: {
      alias: [
        { find: /^react(?:\/jsx-(?:dev-)?runtime)?$/, replacement: RERENDERING_SHIM },
        { find: /^react-dom(?:\/client)?$/, replacement: RERENDERING_SHIM },
        { find: /^.*mathliveRuntime\.js$/, replacement: path.join(helpersDir, 'emptyModule.mjs') },
      ],
    },
  });
  shim = await loader.ssrLoadModule(RERENDERING_SHIM);
});
test.after(async () => { await loader?.close(); });

test('once opened, a panel stays mounted as it closes and opens again, so it behaves as when it was mounted closed', async () => {
  const { closedPanel } = await loader.ssrLoadModule('/src/app/teacher/onDemandCode.js');
  const Panel = closedPanel(() => new Promise(() => {}), (props) => props.open);
  const controls = {};
  // The panel's hooks run as part of the host's render (the shim renders one
  // component; its children are plain elements).
  const Host = () => {
    const [open, setOpen] = shim.useState(false);
    controls.setOpen = setOpen;
    return Panel({ open, label: 'details' });
  };
  const view = shim.mount(Host, {});
  assert.equal(view.output, null, 'never opened: nothing');
  controls.setOpen(true);
  const mounted = view.output;
  assert.ok(mounted && mounted.props.label === 'details' && mounted.props.open === true, 'opened: the panel, with every prop');
  controls.setOpen(false);
  assert.equal(view.output?.type, mounted.type, 'closed again: still mounted, so its state is kept');
  assert.equal(view.output.props.open, false, 'and it is told it is closed, as before');
  controls.setOpen(true);
  assert.equal(view.output.type, mounted.type);
});

// A window whose device is offline until goOnline().
const offlineWindow = () => {
  const listeners = new Map();
  return {
    navigator: { onLine: false },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    goOnline() { this.navigator.onLine = true; listeners.get('online')?.(); },
    listening: (type) => listeners.has(type),
  };
};
test('Find is asked for at once as the workspace draws, on a device that saves data too, and never while offline', async () => {
  const { prefetchTeacherPanels } = await loader.ssrLoadModule('/src/app/teacher/teacherPanelPrefetch.js');
  const { TeacherQuickSearch } = await loader.ssrLoadModule('/src/app/teacher/teacherPanels.js');
  // What an opened Find draws from the code it has now: the palette itself,
  // or the lazy that would load it (the shim draws one component at a time).
  const drawnNow = () => {
    const view = shim.mount(() => {
      const element = TeacherQuickSearch({ open: true });
      return element.type(element.props);
    }, {});
    return view.output?.props?.children?.[0]?.type?.name;
  };
  const win = offlineWindow();
  win.navigator.connection = { saveData: true };
  win.requestIdleCallback = () => { throw new Error('a device that saves data fetches nothing else ahead'); };
  const pause = () => new Promise((resolve) => { setTimeout(resolve, 50); });
  prefetchTeacherPanels(win);
  // Long enough for a request made anyway to land (Vite compiles the palette
  // on its first request).
  for (let tries = 0; tries < 60 && drawnNow() !== 'TeacherQuickSearch'; tries += 1) await pause();
  assert.notEqual(drawnNow(), 'TeacherQuickSearch', 'offline: not asked for');
  win.goOnline();
  for (let tries = 0; tries < 100 && drawnNow() !== 'TeacherQuickSearch'; tries += 1) await pause();
  assert.equal(drawnNow(), 'TeacherQuickSearch', 'back online, it is asked for, though the device saves data: Find opens with its box at once');
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  assert.match(workspace, /useEffect\(\(\) => prefetchTeacherPanels\(\), \[\]\);/, 'as the workspace draws');
});

test('useOnDemandCode: nothing until wanted; asked once, not while offline; the module once here; a failure handed back', async () => {
  const { onDemandCode, useOnDemandCode } = await loader.ssrLoadModule('/src/app/teacher/onDemandCode.js');
  const win = {
    navigator: { onLine: false },
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    removeEventListener(type) { this.listeners.delete(type); },
  };
  const code = deferred();
  let asked = 0;
  const math = onDemandCode(() => { asked += 1; return code.promise; });
  const controls = {};
  const Host = () => {
    const [wanted, setWanted] = shim.useState(false);
    controls.setWanted = setWanted;
    return { type: 'host', props: useOnDemandCode(math, wanted, win) };
  };
  const view = shim.mount(Host, {});
  assert.equal(view.output.props.module, null);
  assert.equal(asked, 0, 'not wanted: not asked for');
  controls.setWanted(true);
  assert.equal(asked, 0, 'offline: not asked for, so no failure is remembered');
  assert.ok(win.listeners.has('online'));
  win.navigator.onLine = true;
  win.listeners.get('online')();
  assert.equal(asked, 1, 'asked for once the device is back online');
  assert.equal(view.output.props.module, null, 'nothing until it lands');
  const module = { default: () => null };
  code.resolve(module);
  await settle();
  assert.equal(view.output.props.module, module, 'the module, once here');
  // Here already: the next screen has it in its first render.
  const later = shim.mount(() => ({ type: 'host', props: useOnDemandCode(math, true, win) }), {});
  assert.equal(later.output.props.module, module);
  assert.equal(asked, 1);

  const failure = new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/MathText-abc.js');
  const failing = onDemandCode(() => Promise.reject(failure));
  const broken = shim.mount(() => ({ type: 'host', props: useOnDemandCode(failing, true, { navigator: { onLine: true } }) }), {});
  await settle();
  assert.equal(broken.output.props.failure, failure, 'handed back, for the screen to throw where it needs the code');
  assert.equal(broken.output.props.module, null);
});

// Mounted closed with the workspace, an assignment's details reported no
// class as they mounted, so whatever they had reported before the workspace
// last left the page (a preview, Live Teaching) was cleared. Mounted only when
// opened, they must clear it as they leave: App's controls scope reads the
// hub's class while a target is set (App.jsx teacherControlsScope), and a
// class left over from before would start, and at once stop, a listener on
// its students' controls.
test('an assignment\'s details report no class once they leave the page', async () => {
  const { default: AssignmentHub } = await loader.ssrLoadModule('/src/components/teacher/AssignmentHub.jsx');
  const reported = [];
  const view = shim.mount(AssignmentHub, {
    open: true,
    assignment: { id: 'A1', title: 'Lesson 4: Slope', assignedClassIds: ['C1'] },
    classes: [{ classId: 'C1', name: 'Algebra I — Period 1', period: 'Period 1', status: 'active' }],
    students: [],
    onClassChange: (classId) => reported.push(classId),
    onClose: () => {},
  });
  assert.equal(reported.at(-1), 'C1', 'open, they report their class');
  view.unmount();
  assert.equal(reported.at(-1), null, 'gone, they report none');
});

test('Ask my teacher: the math is asked for as soon as a question waits, and the questions are drawn only once it is here', async () => {
  const { default: StudentQuestionsPanel, QuestionRow } = await loader.ssrLoadModule('/src/components/teacher/StudentQuestionsPanel.jsx');
  const store = await loader.ssrLoadModule('/tests/platform/helpers/askTeacherStoreStub.mjs');
  const math = await loader.ssrLoadModule('/tests/platform/helpers/promptMathStub.mjs');
  const TEACHER = 'teacher@example.org';
  const assignment = {
    id: 'A1', title: 'Lesson 4: Slope', schemaVersion: 5,
    sections: [{ id: 's1', role: 'classwork', title: 'Classwork', questions: [{ questionId: 'q1', type: 'literal', prompt: 'Write $\\frac{6}{8}$ in lowest terms.' }] }],
  };
  const question = { id: 's1__A1__0', studentId: 's1', assignmentId: 'A1', questionIndex: 0, questionLabel: 'Classwork · Question 1', text: 'How do I start?', status: 'open', createdAt: 1, teacherEmail: TEACHER };
  const props = { teacherEmail: TEACHER, students: [{ id: 's1', firstName: 'Sam', lastName: 'Student' }], assignments: [assignment], onOpenStudent: null };

  // In class (or projected): the count, at once, and the math asked for, so it is here when the class ends.
  const inClass = shim.mount(StudentQuestionsPanel, { ...props, withheld: true });
  const open = shim.mount(StudentQuestionsPanel, { ...props, withheld: false });
  assert.equal(open.output, null);
  assert.equal(math.timesAsked(), 0, 'no question waiting: nothing asked for');
  store.deliverQuestions([question]);
  assert.ok(inClass.output?.props?.['data-withheld'] === '', 'withheld: only the count, which needs no math');
  assert.equal(math.timesAsked(), 1, 'asked for as soon as a question waits, and once');
  assert.equal(open.output, null, 'held: the panel does not appear without its prompts\' math');

  const MathText = () => null;
  math.mathArrives({ default: MathText });
  await settle();
  assert.equal(open.output?.type, 'details', 'drawn once the math is here');
  const row = findElement(open.output, (node) => node.type === QuestionRow);
  assert.equal(row.props.MathText, MathText, 'each row draws its prompt with it');
  assert.equal(row.props.prompt, 'Write $\\frac{6}{8}$ in lowest terms.');
  assert.ok(inClass.output?.props?.['data-withheld'] === '', 'still only the count in class');

  // Once here, a panel drawn later has it in the render the snapshot brings.
  const later = shim.mount(StudentQuestionsPanel, { ...props, withheld: false });
  assert.equal(later.output, null);
  store.deliverQuestions([question]);
  assert.equal(later.output?.type, 'details');
  assert.equal(math.timesAsked(), 1);
});

test('Ask my teacher, when its math cannot load: the count still shows in class, and the list hands the failure to AppErrorBoundary', async () => {
  const { default: StudentQuestionsPanel } = await loader.ssrLoadModule('/src/components/teacher/StudentQuestionsPanel.jsx?mathFails');
  const store = await loader.ssrLoadModule('/tests/platform/helpers/askTeacherStoreStub.mjs');
  const { failure } = await loader.ssrLoadModule('/tests/platform/helpers/promptMathFailingStub.mjs');
  const TEACHER = 'teacher@example.org';
  const question = { id: 's1__A1__0', studentId: 's1', assignmentId: 'A1', questionIndex: 0, text: 'How do I start?', status: 'open', createdAt: 1, teacherEmail: TEACHER };
  // What the render throws is caught here, as a boundary would catch it.
  const guarded = (props) => shim.mount((given) => {
    try {
      return StudentQuestionsPanel(given);
    } catch (error) {
      return { type: 'boundary', props: { error } };
    }
  }, props);
  const props = { teacherEmail: TEACHER, students: [], assignments: [], onOpenStudent: null };
  const inClass = guarded({ ...props, withheld: true });
  const open = guarded({ ...props, withheld: false });
  store.deliverQuestions([question]);
  await settle();
  assert.equal(inClass.output?.props?.['data-withheld'], '', 'in class: the count, which draws no mathematics, and no error');
  assert.equal(open.output?.type, 'boundary', 'the list needs the math: the failure is thrown');
  assert.equal(open.output.props.error, failure, 'the request\'s own failure, a chunk-load error for "MathMaster was just updated"');
});

test('the questions panel asks before its early returns and holds only where its list is drawn', () => {
  const panel = executableSource(read('src/components/teacher/StudentQuestionsPanel.jsx'));
  const body = region(panel, 'export default function StudentQuestionsPanel(', '\n}\n', 'the panel');
  const asks = body.indexOf('const math = useOnDemandCode(promptMath, waiting.length > 0);');
  assert.ok(asks > 0 && asks < body.indexOf('if (withheld) {'), 'asked for before the withheld count returns, so a class in session fetches it too');
  const empty = body.indexOf('if (!waiting.length && !unavailable && !sentNotice) return null;');
  const hold = body.indexOf('if (waiting.length && !math.module) {');
  assert.ok(empty > 0 && hold > empty && hold < body.indexOf('<details className="tw-disclosure" data-student-questions=""'), 'held after "nothing waiting", before the panel');
  // A request that failed is thrown there, where the list needs the code
  // (AppErrorBoundary's "MathMaster was just updated"), never in the withheld
  // count, which draws no mathematics (teacherCodeRecovery.mjs C6).
  assert.match(region(body, 'if (waiting.length && !math.module) {', '\n  }\n', 'the hold'), /^if \(waiting\.length && !math\.module\) \{\s*if \(math\.failure\) throw math\.failure;\s*return null;$/);
  assert.doesNotMatch(region(body, 'if (withheld) {', '\n  }\n', 'the withheld count'), /math/);
  assert.match(body, /MathText=\{math\.module\.default\}/);
  assert.match(panel, /^import \{ promptMath \} from '\.\.\/\.\.\/app\/teacher\/teacherPanels\.js';$/m);
  assert.doesNotMatch(panel, /^import [^;]*MathText[^;]*;$/m, 'MathText is not imported statically');
});

test('the workspace fetches the closed panels and Home\'s math while the browser is idle, once it has drawn', async () => {
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  assert.match(workspace, /useEffect\(\(\) => prefetchTeacherPanels\(\), \[\]\);\s*useEffect\(\(\) => prefetchAuthoringKit\(\), \[\]\);/, 'asked before the authoring code, which is larger');
  assert.match(workspace, /^import \{ prefetchTeacherPanels \} from '\.\/teacherPanelPrefetch\.js';$/m);
  // Every member of teacherPanels.js, and nothing else.
  const panels = await import('../../src/app/teacher/teacherPanels.js');
  const { TEACHER_PANEL_PREFETCH, prefetchTeacherPanels } = await import('../../src/app/teacher/teacherPanelPrefetch.js');
  assert.deepEqual(new Set(TEACHER_PANEL_PREFETCH), new Set(Object.values(panels)));
  assert.equal(TEACHER_PANEL_PREFETCH.length, Object.keys(panels).length);
  TEACHER_PANEL_PREFETCH.forEach((member) => assert.equal(typeof member.prefetch, 'function'));
  // The student screens' rules (studentScreenPrefetch.test.mjs): never when
  // the device saves data, once per page, a cancel for the effect.
  const fakeWindow = ({ saveData = false } = {}) => {
    const idle = [];
    return {
      idle,
      navigator: { onLine: true, connection: { saveData } },
      requestIdleCallback: (callback, options) => { idle.push({ callback, options }); return idle.length; },
      cancelIdleCallback: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  };
  const saving = fakeWindow({ saveData: true });
  prefetchTeacherPanels(saving);
  assert.equal(saving.idle.length, 0, 'a device saving data fetches nothing ahead');
  const win = fakeWindow();
  const cancel = prefetchTeacherPanels(win);
  assert.equal(typeof cancel, 'function');
  assert.equal(win.idle.length, 1, 'asked for once the browser is idle');
  assert.equal(win.idle[0].options.timeout, 5000);
  // Only the workspace imports it: Home's own modules take what they draw
  // from teacherPanels.js, so the student screens' prefetch keeps the chunk
  // it shares with App.
  for (const file of ['src/TeacherHome.jsx', 'src/components/teacher/StudentQuestionsPanel.jsx', 'src/components/teacher/LiveClassMonitor.jsx', 'src/app/teacher/teacherPanels.js', 'src/app/teacher/onDemandCode.js']) {
    assert.doesNotMatch(executableSource(read(file)), /^import [^;]*from '[^']*(?:teacherPanelPrefetch|studentScreenPrefetch)\.js';$/m, `${file} imports the prefetch`);
  }
});
