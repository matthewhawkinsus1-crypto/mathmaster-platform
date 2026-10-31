/*
 * AX03 (G-4): THE GRAPH READ-OUT, A SUPPORT-PLAN ACCOMMODATION.
 *
 * While a question can be answered a graph's screen-reader description names
 * only the kinds of marks it draws, so a blind student on a graph-reading item
 * (the district DOL 2 test has seven) had nothing to answer from. A student
 * whose plan gives them `graph-read-out` hears the full reading instead,
 * wherever the plan applies; it is recorded as provided where a graph was read
 * out in full. Defined in the support catalog like every support, offered in
 * the plan editor, and applied by the question hosts
 * (src/platform/supports/graphReadOut.js).
 *
 * Browser proof (Chromium accessibility tree and the recorded evidence):
 * tests/browser/figureDescriptions.mjs ("graph read-out").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUPPORT_AUTOMATION, SUPPORT_CATEGORY, SUPPORT_CLASSIFICATION, studentFacingLabel, supportById, supportShortLabel,
} from '../../functions/shared/supportCatalog.mjs';
import { editorGroups } from '../../src/platform/supportEvidence/supportProfileDraft.js';
import { launchSupportRecords } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { GRAPH_READ_OUT_SUPPORT_ID, graphReadOutApplies, graphReadOutEntitled } from '../../src/platform/supports/graphReadOut.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const plan = (accommodations, status = 'active') => ({
  supportPlan: { windows: [{ effectiveStart: '2026-01-01', status, revision: 1, translationLanguage: null, accommodations }] },
});

test('it is an automatic presentation accommodation, recorded as provided, never a student tool', () => {
  const entry = supportById(GRAPH_READ_OUT_SUPPORT_ID);
  assert.ok(entry, 'in the support catalog');
  assert.equal(entry.classification, SUPPORT_CLASSIFICATION.ACCOMMODATION, 'access, never a modification');
  assert.equal(entry.category, SUPPORT_CATEGORY.PRESENTATION);
  assert.equal(entry.automation, SUPPORT_AUTOMATION.AUTOMATIC, 'it is in the graph\'s own description: nothing to open');
  assert.deepEqual([...entry.evidence], ['provided']);
  assert.equal(studentFacingLabel(GRAPH_READ_OUT_SUPPORT_ID), null);
  assert.equal(supportShortLabel(GRAPH_READ_OUT_SUPPORT_ID), 'Graph read-out');
  assert.equal(entry.affectsIndependence, false, 'reading the graph is not doing the mathematics');
  // Offered to the teacher in the plan editor, with the other automatic presentation supports.
  const presentation = editorGroups().platformAccommodations.find((group) => group.label === 'Presentation');
  assert.ok(presentation?.items.some((item) => item.id === GRAPH_READ_OUT_SUPPORT_ID), 'the editor offers it');
});

test('a student has it from their own plan, in the activities the plan limits it to', () => {
  assert.equal(graphReadOutEntitled({ accommodations: [GRAPH_READ_OUT_SUPPORT_ID] }), true, 'a profile saved before versioning');
  assert.equal(graphReadOutEntitled({ accommodations: [GRAPH_READ_OUT_SUPPORT_ID] }, { activityRole: 'test' }), true);
  assert.equal(graphReadOutEntitled({ accommodations: ['text-to-speech'] }), false);
  assert.equal(graphReadOutEntitled(null), false);
  const testsOnly = plan([{ id: GRAPH_READ_OUT_SUPPORT_ID, appliesTo: ['test', 'quiz'] }]);
  assert.equal(graphReadOutEntitled(testsOnly, { activityRole: 'test' }), true);
  assert.equal(graphReadOutEntitled(testsOnly, { activityRole: 'practice' }), false, 'limited to tests and quizzes');
  assert.equal(graphReadOutEntitled(plan([{ id: GRAPH_READ_OUT_SUPPORT_ID }]), { activityRole: 'practice' }), true, 'no limit: every activity');
  assert.equal(graphReadOutEntitled(plan([{ id: GRAPH_READ_OUT_SUPPORT_ID }], 'inactive'), { activityRole: 'test' }), false, 'an inactive plan gives nothing');
});

test('it adds the full reading only while the question can be answered, and never over a caller\'s choice', () => {
  assert.equal(graphReadOutApplies({ enabled: true }), true);
  assert.equal(graphReadOutApplies({ enabled: false }), false);
  assert.equal(graphReadOutApplies({ enabled: true, closed: true }), false, 'a finished question reads positions anyway');
  assert.equal(graphReadOutApplies({ enabled: true, explicit: false }), false, 'a screen that never states positions');
  assert.equal(graphReadOutApplies({ enabled: true, explicit: true }), false, 'a screen that already states them');
  assert.equal(graphReadOutApplies({ enabled: 'yes' }), false, 'only an explicit true');
});

test('it is recorded where a graph was read out, never because an assignment opened', () => {
  const { records } = launchSupportRecords({
    profile: { accommodations: [GRAPH_READ_OUT_SUPPORT_ID, 'declutter-ui'] },
    assignment: { id: 'a1' },
    roles: ['test'],
    questions: [{ type: 'multiAnswer' }],
  });
  assert.ok(records.some((record) => record.supportId === 'declutter-ui'), 'an automatic support applied on opening is recorded at launch');
  assert.equal(records.some((record) => record.supportId === GRAPH_READ_OUT_SUPPORT_ID), false);
});

/*
 * The real figures, server-rendered: the static question graph (GraphDisplay)
 * and a Path or secure stimulus graph (PathQuestionStimulus → CoordinatePlane),
 * as the district DOL 2 items draw it (readCoordinates, no description).
 */
const DOL2_GRAPH = {
  xMin: -2, xMax: 6, yMin: -4, yMax: 4, xTickStep: 1, yTickStep: 1, readCoordinates: true,
  ariaLabel: 'Graph of the line', lines: [{ points: [[0, -2], [1, 0]] }],
};
const withFigures = async (run) => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: GraphDisplay } = await server.ssrLoadModule('/src/GraphDisplay.jsx');
    const { default: PathQuestionStimulus } = await server.ssrLoadModule('/src/components/student/PathQuestionStimulus.jsx');
    const { GraphReadOutProvider } = await server.ssrLoadModule('/src/platform/supports/graphReadOut.js');
    const { QuestionLifecycleProvider } = await server.ssrLoadModule('/src/platform/question/QuestionLifecycleContext.jsx');
    const { default: React } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const render = (element, { readOut = false, lifecycle = null } = {}) => {
      let tree = React.createElement(GraphReadOutProvider, { enabled: readOut }, element);
      if (lifecycle) tree = React.createElement(QuestionLifecycleProvider, lifecycle, tree);
      return renderToStaticMarkup(tree).replace(/&#x27;/g, "'");
    };
    const staticGraph = (graph, options) => {
      const html = render(React.createElement(GraphDisplay, { graph, enlargeable: false }), options);
      return html.match(/<p id="[^"]*" data-graph-description=""[^>]*>([^<]*)<\/p>/)?.[1] || '';
    };
    const stimulus = (graph, options) => {
      const html = render(React.createElement(PathQuestionStimulus, { stimulus: { graph } }), options);
      return { html, description: html.match(/<p id="mm-plane-desc-[^"]*"[^>]*>([^<]*)<\/p>/)?.[1] || '' };
    };
    return await run({ staticGraph, stimulus });
  } finally {
    await server.close();
  }
};

test('the static question graph is read in full while open, for the read-out only', async () => {
  await withFigures(({ staticGraph }) => {
    const graph = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, points: [{ x: 2, y: 3, label: 'A' }] };
    assert.match(staticGraph(graph), /Positions are not read out while this question can be answered\./, 'everyone else: kinds');
    const readOut = staticGraph(graph, { readOut: true });
    assert.match(readOut, /A at \(2, 3\)/, readOut);
    assert.doesNotMatch(readOut, /Positions are not read out/);
    // An axis whose numbers the graph hides is read by nobody.
    const hidden = staticGraph({ ...graph, axisDisplay: { showXTickLabels: false, showYTickLabels: false } }, { readOut: true });
    assert.doesNotMatch(hidden, /\(2, 3\)|\b5\b/, hidden);
    // An author's description stays, and the full reading follows it.
    const authored = { ...graph, accessibleDescription: 'One labelled point in the first quadrant.' };
    assert.equal(staticGraph(authored), 'One labelled point in the first quadrant.');
    assert.match(staticGraph(authored, { readOut: true }), /^One labelled point in the first quadrant\. x from −5 to 5, y from −5 to 5\. .*A at \(2, 3\)/);
  });
});

test('a DOL 2-style stimulus graph is read in full for the read-out, with no data table', async () => {
  await withFigures(({ stimulus }) => {
    const open = stimulus(DOL2_GRAPH);
    assert.match(open.description, /Positions are not read out while this question can be answered\./, open.description);
    assert.doesNotMatch(open.description, /crosses/);
    const readOut = stimulus(DOL2_GRAPH, { readOut: true });
    assert.match(readOut.description, /crosses the y-axis at −2/, readOut.description);
    assert.match(readOut.description, /crosses the x-axis at 1/, readOut.description);
    // The data table is shown only after the plane measures itself (a layout
    // effect a server render never runs), so "words, not a table" is checked in
    // Chromium (tests/browser/figureDescriptions.mjs) and by the gate below.
    // A finished question still reads in full, with or without the support.
    assert.match(stimulus(DOL2_GRAPH, { lifecycle: { terminal: true, positionsReadable: true } }).description, /crosses the y-axis at −2/);
  });
});

test('QuestionEngine gives the read-out from the student\'s plan, records it once per item, and not on My Math Path', () => {
  const engine = read('src/QuestionEngine.jsx');
  assert.match(engine, /^import \{ GRAPH_READ_OUT_SUPPORT_ID, GraphReadOutProvider, graphReadOutEntitled \} from '\.\/platform\/supports\/graphReadOut\.js';$/m);
  assert.match(engine, /graphReadOut: graphReadOutChoice = null,/);
  // A host's own choice first; the Path server's list (supportEntitlement) does not carry it.
  assert.match(engine, /\(\) => graphReadOutChoice \?\? \(supportEntitlement \? false : graphReadOutEntitled\(stableStudentProfile, \{ activityRole \}\)\),/);
  const report = region(engine, 'const reportGraphReadOut = useCallback(() => {', '}, [supportItemKey]);', 'the record');
  assert.match(report, /if \(graphReadOutReportedRef\.current === supportItemKey\) return;\s*graphReadOutReportedRef\.current = supportItemKey;/);
  assert.match(report, /onSupportEvidenceRef\.current\?\.\(\{ supportId: GRAPH_READ_OUT_SUPPORT_ID, eventType: 'provided' \}\);/);
  // Around the whole question: its own graphs, its tools' planes, Work View.
  const opening = '<QuestionLifecycleProvider terminal={locked} positionsReadable={positionsReadable}>';
  const body = region(engine, opening, '</QuestionLifecycleProvider>', 'the question').slice(opening.length);
  assert.match(body, /^\s*<GraphReadOutProvider enabled=\{graphReadOut\} onReadOut=\{reportGraphReadOut\}>/);
  assert.match(body, /<\/GraphReadOutProvider>\s*$/);
});

test('a secure item decides it from the student\'s own plan for a test, field items and tool items alike', () => {
  const runtime = read('src/components/question/RichQuestionRuntime.jsx');
  const decided = region(runtime, 'const graphReadOut = useMemo(', ');', 'the decision');
  assert.match(decided, /graphReadOutEntitled\(studentSupportProfile, \{ activityRole: policy\.secure \? SECURE_ACTIVITY_ROLE : policy\.activityRole \|\| null \}\)/, 'the raw profile: the flattened one has lost its limits');
  const field = region(runtime, 'const FieldItem = (', '\nconst ', 'the field item');
  assert.match(field, /<GraphReadOutProvider enabled=\{graphReadOut\}>\s*<PathQuestionStimulus stimulus=\{question\.stimulus\} \/>\s*<\/GraphReadOutProvider>/);
  assert.match(region(runtime, '<QuestionEngine', '/>', 'the tool item\'s engine'), /graphReadOut=\{graphReadOut\}/);
  for (const item of ['<ToolItem', '<FieldItem']) {
    assert.match(region(runtime, item, '/>', item), /graphReadOut=\{graphReadOut\}/, `${item} is given it`);
  }
});

test('each figure that reads positions takes the read-out from its host and says when it was used', () => {
  const plane = read('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /const readOut = graphReadOutApplies\(\{ enabled: graphReadOut\.enabled, closed: questionClosed, explicit: describeFeatures \}\);/);
  assert.match(plane, /const descriptionDetail = \(describeFeatures == null \? questionClosed \|\| readOut : describeFeatures === true\) \? 'features' : 'kinds';/);
  assert.match(plane, /useReportGraphReadOut\(Boolean\(readOutReading\)\);/);
  assert.match(region(plane, 'const showDataTable =', ';', 'the data table'), /&& !readOut &&/);
  const display = read('src/GraphDisplay.jsx');
  assert.match(display, /const readOut = graphReadOutApplies\(\{ enabled: graphReadOut\.enabled, closed: questionClosed \}\);/);
  assert.match(display, /useReportGraphReadOut\(Boolean\(graph\) && readOut && axesShown\);/);
});

// The secure field item, server-rendered: a real district DOL 2 item (q03, a
// readCoordinates graph with no description) as a secure Test issues it.
test('a secure DOL 2 item: the read-out reads the graph in full, by the student\'s plan for a test', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: RichQuestionRuntime } = await server.ssrLoadModule('/src/components/question/RichQuestionRuntime.jsx');
    const { default: React } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const family = JSON.parse(readFileSync(new URL('../../functions/seeds/secureAssessments/algebra1_district_dol2.json', import.meta.url), 'utf8'))
      .documents.find((doc) => doc.id === 'mm_district_dol2_q03');
    const variant = family.variants[0];
    // What a student's browser is given: no expected answers.
    const question = { questionInstanceId: 'qi-1', prompt: variant.prompt, responseFields: variant.responseFields.map(({ expected: _expected, ...field }) => field), stimulus: variant.stimulus };
    const described = (studentSupportProfile) => {
      const html = renderToStaticMarkup(React.createElement(RichQuestionRuntime, { question, mode: 'secureTest', studentSupportProfile, onSubmit: () => {} }));
      return html.match(/<p id="mm-plane-desc-[^"]*"[^>]*>([^<]*)<\/p>/)?.[1] || '';
    };
    assert.match(described(null), /Positions are not read out while this question can be answered\./);
    const readOut = described({ accommodations: [GRAPH_READ_OUT_SUPPORT_ID] });
    assert.match(readOut, /crosses the (x|y)-axis at /, readOut);
    assert.doesNotMatch(readOut, /Positions are not read out/);
    // A plan that limits it to practice gives nothing on a test.
    assert.match(described(plan([{ id: GRAPH_READ_OUT_SUPPORT_ID, appliesTo: ['practice'] }])), /Positions are not read out while this question can be answered\./);
  } finally {
    await server.close();
  }
});
