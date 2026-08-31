import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { REPRESENTATIONS, TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stagedDir = 'drafts/fidelity-v2/algebra1';
const codes = readdirSync(stagedDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const staged = codes.map((code) => read(`${stagedDir}/${code}.json`));
const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '').replace(/^texas:/, '');
const allStrings = (node, out = []) => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((value) => allStrings(value, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((value) => allStrings(value, out));
  return out;
};
const payload = (code) => staged.find((entry) => entry.standard === code);

test('each staged Algebra I Fidelity V2 standard contains five new complete families', () => {
  const ids = new Set();
  const familyIds = new Set();
  assert.deepEqual(staged.map((entry) => entry.standard), codes);
  for (const entry of staged) {
    assert.equal(entry.documents.length, 5, `${entry.standard} must contain exactly five replacements`);
    for (const doc of entry.documents) {
      assert.equal(codeOf(doc), entry.standard);
      assert.ok(doc.id.includes('_v2_'), `${doc.id} needs a new Fidelity V2 id`);
      assert.equal(ids.has(doc.id), false, `duplicate staged id ${doc.id}`);
      ids.add(doc.id);
      assert.ok(doc.familyId.includes(':v2-'), `${doc.id} needs a new Fidelity V2 family id`);
      assert.equal(familyIds.has(doc.familyId), false, `duplicate staged familyId ${doc.familyId}`);
      familyIds.add(doc.familyId);
      assert.ok(REPRESENTATIONS.includes(doc.representation), `${doc.id} has unsupported representation ${doc.representation}`);
      assert.ok(TASK_TYPES.includes(doc.taskType), `${doc.id} has unsupported task type ${doc.taskType}`);
      assert.ok(Number.isInteger(doc.dok) && doc.dok >= 1 && doc.dok <= 4);
      assert.ok(Number.isInteger(doc.difficultyBand) && doc.difficultyBand >= 1 && doc.difficultyBand <= 5);
      assert.ok(doc.generator?.parameters && Object.keys(doc.generator.parameters).length, `${doc.id} needs a real generator`);
      assert.ok(doc.solutionReview?.reasoning?.length >= 2, `${doc.id} needs a meaningful solution review`);
      assert.ok(doc.attemptFeedback?.length, `${doc.id} needs attempt feedback`);
      assert.ok(doc.supportHints?.length, `${doc.id} needs support hints`);
      assert.equal(allStrings(doc).join(' ').includes('$$'), false, `${doc.id} contains a double math delimiter`);
      if (doc.representation === 'table') assert.ok(doc.stimulus?.table?.rows?.length >= 2, `${doc.id} declares table but supplies no table`);
      if (doc.taskType === 'errorAnalysis') assert.match(String(doc.prompt), /student|error|mistake|incorrect|correct|claims?|headline|flaw/i, `${doc.id} must present an error to analyze`);
    }
  }
});

test('A.2C makes students write a complete linear equation in every family', () => {
  for (const doc of payload('A.2C').documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'equation');
    assert.match(String(doc.responseFields[0].expected), /=/);
  }
  assert.ok(payload('A.2C').documents.some((doc) => doc.representation === 'table'));
  assert.ok(payload('A.2C').documents.some((doc) => doc.representation === 'graph' && doc.stimulus?.graph?.lines?.length === 1));
  assert.ok(payload('A.2C').documents.some((doc) => doc.taskType === 'errorAnalysis'));
});

test('A.2H makes students write a two-variable inequality in every family', () => {
  const entry = payload('A.2H');
  assert.match(entry.certificationStatus, /table-graph-verbal-two-variable-inequality-writing/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'inequality');
    const expected = String(doc.responseFields[0].expected);
    assert.match(expected, /x|y/);
    assert.match(expected, /<=|>=|<|>/);
  }
  const graphFamily = entry.documents.find((doc) => doc.representation === 'graph');
  assert.equal(graphFamily?.stimulus?.graph?.lines?.length, 1);
  assert.equal(graphFamily?.stimulus?.graph?.shading?.length, 1);
});

test('A.2I requires both equations of the system in every family', () => {
  const entry = payload('A.2I');
  assert.match(entry.certificationStatus, /table-graph-verbal-system-writing/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 2);
    assert.ok(doc.responseFields.every((field) => field.inputProfile === 'equation' && String(field.expected).includes('=')));
  }
  const graphFamily = entry.documents.find((doc) => doc.representation === 'graph');
  assert.equal(graphFamily?.stimulus?.graph?.lines?.length, 2);
});

test('A.2A connects symbolic, context, mapping and real-table domain/range evidence', () => {
  const entry = payload('A.2A');
  assert.match(entry.certificationStatus, /connected-(?:table-graph-)?domain-range-representations/);
  assert.ok(entry.documents.some((doc) => doc.type === 'relationMapping'));
  const table = entry.documents.find((doc) => doc.stimulus?.table?.rows?.length >= 3);
  assert.ok(table, 'A.2A needs an actual table even when it is paired with a graph');
  assert.equal(table.responseFields?.length, 2);
  assert.ok(table.responseFields.every((field) => field.inputProfile === 'set'));
  const context = entry.documents.find((doc) => doc.representation === 'context');
  assert.equal(context?.responseFields?.length, 2);
  const decreasingError = entry.documents.find((doc) => doc.taskType === 'errorAnalysis');
  assert.ok(decreasingError, 'A.2A needs a genuine endpoint-order misconception task');
  assert.match(
    JSON.stringify({ prompt: decreasingError.prompt, review: decreasingError.solutionReview || {} }),
    /-\{\{mag\}\}|decreasing|smaller output|endpoint/i,
    'A.2A error analysis must actually depend on decreasing-function endpoint order',
  );
});

test('A.2G gives vertical and horizontal lines authentic graph construction plus slope meaning', () => {
  const entry = payload('A.2G');
  assert.match(entry.certificationStatus, /vertical-horizontal-graph-and-slope-classification/);
  const graphDocs = entry.documents.filter((doc) => doc.type === 'graphing2');
  assert.equal(graphDocs.length, 2);
  assert.deepEqual(new Set(graphDocs.map((doc) => doc.orientation)), new Set(['vertical', 'horizontal']));
  assert.ok(graphDocs.every((doc) => doc.mode === 'verticalHorizontal'));
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /undefined/);
  assert.match(text, /slope 0|slope.*0/);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /slope 0/i.test(doc.prompt)));
});

test('A.3A measures slope from a real graph, real table, and multiple equation forms', () => {
  const entry = payload('A.3A');
  assert.match(entry.certificationStatus, /slope-across-graph-table-and-equation-forms/);
  assert.ok(entry.documents.some((doc) => doc.type === 'functionInvestigation' && doc.representation === 'graph'));
  const table = entry.documents.find((doc) => doc.representation === 'table');
  assert.ok(table?.stimulus?.table?.rows?.length >= 3);
  const prompts = entry.documents.map((doc) => String(doc.prompt).toLowerCase()).join(' ');
  assert.ok(entry.documents.some((doc) => doc.id.includes('standard-form-slope')
    && /\{\{A\}\}x\+\{\{B\}\}y=\{\{C\}\}/.test(String(doc.prompt))),
    'A.3A needs slope extraction from a standard-form equation');
  assert.match(prompts, /point-slope/);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /run by the rise/i.test(doc.prompt)));
});

test('A.3C makes graph construction the dominant act across linear forms and connects graph features', () => {
  const entry = payload('A.3C');
  assert.match(entry.certificationStatus, /multiple-line-graph-constructions-and-features/);
  const graphing = entry.documents.filter((doc) => doc.type === 'graphing2');
  assert.equal(graphing.length, 3);
  assert.deepEqual(new Set(graphing.map((doc) => doc.mode)), new Set(['slopeIntercept', 'pointSlope', 'standardForm']));
  const features = entry.documents.find((doc) => doc.type === 'functionInvestigation');
  assert.equal(features?.pointTasks?.length, 2);
  assert.ok(features.pointTasks.some((task) => task.id === 'xint'));
  assert.ok(features.pointTasks.some((task) => task.id === 'yint'));
  assert.ok(features.analysisRequests?.some((part) => part.id === 'slope'));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /zero/i.test(doc.prompt)));
});

test('A.3G makes graphical estimation the primary act in real-world system families', () => {
  const entry = payload('A.3G');
  assert.match(entry.certificationStatus, /graphical-estimation-primary-act/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'systemsWorkspace');
    assert.equal(doc.mode, 'linear');
    assert.match(String(doc.prompt), /graph|estimate|workspace/i);
    assert.ok(Number(doc.numericTolerance) >= 0.1 && Number(doc.numericTolerance) <= 0.2);
    assert.ok(doc.generator?.parameters?.xstar?.values?.some((value) => !Number.isInteger(value)));
  }
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(entry.documents.some((doc) => doc.dok === 3));
});

test('A.3D uses real two-variable graph construction in every replacement family', () => {
  const entry = payload('A.3D');
  assert.match(entry.certificationStatus, /real-two-variable-graph-construction/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'systemsWorkspace');
    assert.equal(doc.mode, 'inequalities');
    assert.equal(doc.interaction, 'construct');
    assert.deepEqual(doc.ask, ['construction']);
    assert.equal(doc.inequalities?.length, 1);
    assert.equal(doc.representation === 'graph' || doc.representation === 'context', true);
    assert.equal(doc.responseFields, undefined, 'A.3D must not fall back to a one-variable answer box');
  }
  const relations = new Set(entry.documents.flatMap((doc) => doc.inequalities.map((ineq) => ineq.relation)));
  assert.deepEqual([...relations].sort(), ['<', '<=', '>', '>=']);
});

test('A.3H constructs every boundary and the system overlap rather than displaying it', () => {
  const entry = payload('A.3H');
  assert.match(entry.certificationStatus, /system-inequality-overlap-construction/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'systemsWorkspace');
    assert.equal(doc.mode, 'inequalities');
    assert.equal(doc.interaction, 'construct');
    assert.deepEqual(doc.ask, ['construction']);
    assert.equal(doc.inequalities?.length, 2);
    assert.match(String(doc.prompt), /system|both|constraints|overlap/i);
  }
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'context'));
});

test('A.4A calculates r with technology and interprets direction plus strength', () => {
  const entry = payload('A.4A');
  assert.match(entry.certificationStatus, /technology-calculation-and-interpretation/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'dataModelingLab');
    assert.equal(doc.mode, 'correlation');
    assert.equal(doc.calculatorPolicy, 'graphing');
    assert.ok(doc.points?.length >= 5);
    assert.ok(Number(doc.correlationTolerance) > 0);
    assert.match(String(doc.prompt), /calculate|use.*technology/i);
  }
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(entry.documents.some((doc) => doc.dok === 3));
});

test('A.4C makes students write the fitted linear function before prediction', () => {
  const entry = payload('A.4C');
  assert.match(entry.certificationStatus, /linear-regression-equation-and-prediction/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'dataModelingLab');
    assert.equal(doc.mode, 'linearFitPrediction');
    assert.equal(doc.calculatorPolicy, 'graphing');
    assert.ok(doc.points?.length >= 5);
    assert.notEqual(doc.predictionX, undefined);
    assert.match(String(doc.prompt), /write|regression/i);
  }
  assert.ok(entry.documents.some((doc) => Number(doc.predictionX) > 4));
  assert.ok(entry.documents.some((doc) => Number(doc.predictionX) > 0 && Number(doc.predictionX) < 4));
});

test('A.7A makes students construct a quadratic graph before full attribute analysis', () => {
  const entry = payload('A.7A');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /quadratic-graph-construction-and-full-attribute-analysis/);
  assert.equal(entry.documents.length, 5);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'functionInvestigation');
    assert.equal(doc.representation === 'graph' || doc.representation === 'verbal' || doc.representation === 'context', true);
    assert.ok(doc.pointTasks?.length >= 3, `${doc.id} needs enough validated points to determine a parabola`);
    assert.ok(doc.analysisRequests?.length >= 2, `${doc.id} needs connected feature analysis after construction`);
    assert.equal(doc.responseFields, undefined, `${doc.id} must not downgrade the graphing act to answer boxes`);
  }
  const allPrompts = entry.documents.map((doc) => String(doc.prompt).toLowerCase()).join(' ');
  assert.match(allPrompts, /vertex/);
  assert.match(allPrompts, /axis of symmetry/);
  assert.match(allPrompts, /zero|intercept/);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'context'));
  assert.ok(entry.documents.some((doc) => Number(doc.functionSpec?.a) < 0 || String(doc.functionSpec?.a).includes('{{')));
});

test('A.8B requires a quadratic regression equation and a model-based prediction', () => {
  const entry = payload('A.8B');
  assert.match(entry.certificationStatus, /quadratic-regression-equation-and-prediction/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'dataModelingLab');
    assert.equal(doc.mode, 'quadraticFitPrediction');
    assert.equal(doc.calculatorPolicy, 'graphing');
    assert.equal(doc.points?.length, 5);
    assert.notEqual(doc.predictionX, undefined);
    assert.match(String(doc.prompt), /quadratic.*regression|regression.*quadratic/i);
  }
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'context'));
});

test('A.9E uses exponential regression for both growth and decay and requires prediction', () => {
  const entry = payload('A.9E');
  assert.match(entry.certificationStatus, /exponential-regression-growth-decay-equation-prediction/);
  for (const doc of entry.documents) {
    assert.equal(doc.type, 'dataModelingLab');
    assert.equal(doc.mode, 'exponentialFitPrediction');
    assert.equal(doc.calculatorPolicy, 'graphing');
    assert.equal(doc.points?.length, 5);
    assert.notEqual(doc.predictionX, undefined);
    assert.match(String(doc.prompt), /exponential|multiplicative/i);
  }
  const baseValues = entry.documents.flatMap((doc) => doc.generator?.parameters?.base?.values || []);
  assert.ok(baseValues.some((value) => value > 1), 'A.9E needs growth regression');
  assert.ok(baseValues.some((value) => value > 0 && value < 1), 'A.9E needs decay regression');
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
});

test('A.8A covers all four required quadratic solution methods and complete solution sets', () => {
  const entry = payload('A.8A');
  assert.match(entry.certificationStatus, /four-required-methods/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'set');
    assert.match(String(doc.responseFields[0].expected), /\{.*\}/);
  }
  const prompts = entry.documents.map((doc) => String(doc.prompt).toLowerCase()).join(' ');
  assert.match(prompts, /factor/);
  assert.match(prompts, /square-root property/);
  assert.match(prompts, /completing the square/);
  assert.match(prompts, /quadratic formula/);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /complete solution set/i.test(doc.prompt)));
});

test('A.9A connects growth and true decay graphs to asymptote, domain, and range', () => {
  const entry = payload('A.9A');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /growth-decay-domain-range-connected-to-graphs/);
  const graphDocs = entry.documents.filter((doc) => doc.type === 'functionInvestigation');
  assert.ok(graphDocs.length >= 4);
  const baseValues = entry.documents.flatMap((doc) => doc.generator?.parameters?.base?.values || []);
  assert.ok(baseValues.some((value) => Number(value) > 1), 'A.9A needs growth evidence');
  assert.ok(baseValues.some((value) => Number(value) > 0 && Number(value) < 1), 'A.9A needs genuine decay evidence');
  assert.ok(graphDocs.some((doc) => doc.analysisRequests?.some((part) => part.kind === 'domain')));
  assert.ok(graphDocs.some((doc) => doc.analysisRequests?.some((part) => part.kind === 'range')));
  assert.ok(graphDocs.some((doc) => doc.analysisRequests?.some((part) => /asymptote/i.test(part.label || ''))));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /decay/i.test(doc.prompt)));
});

test('A.9D requires growth and decay graph construction with y-intercept and asymptote evidence', () => {
  const entry = payload('A.9D');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /growth-decay-graph-construction-yintercept-asymptote/);
  assert.ok(entry.documents.filter((doc) => doc.type === 'functionInvestigation').length >= 4);
  for (const doc of entry.documents.filter((item) => item.type === 'functionInvestigation')) {
    assert.ok(doc.pointTasks?.length >= 3, `${doc.id} must require enough points to construct the exponential curve`);
    assert.ok(doc.analysisRequests?.some((part) => /y-intercept/i.test(part.label || '')));
    assert.ok(doc.analysisRequests?.some((part) => /asymptote/i.test(part.label || '')));
  }
  const baseValues = entry.documents.flatMap((doc) => doc.generator?.parameters?.base?.values || []);
  assert.ok(baseValues.some((value) => Number(value) > 1), 'A.9D needs growth graphs');
  assert.ok(baseValues.some((value) => Number(value) > 0 && Number(value) < 1), 'A.9D needs decay graphs');
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
});

test('A.9C makes students write complete exponential equations for growth and decay', () => {
  const entry = payload('A.9C');
  assert.match(entry.certificationStatus, /full-equation-writing/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'equation');
    assert.match(String(doc.responseFields[0].expected), /^y=/);
  }
  const growth = entry.documents.find((doc) => doc.id.includes('context-growth-model'));
  const decay = entry.documents.find((doc) => doc.id.includes('context-decay-model'));
  assert.ok(growth?.generator?.parameters?.base?.values?.some((value) => value > 1));
  assert.ok(decay?.generator?.parameters?.base?.values?.every((value) => value > 0 && value < 1));
  assert.ok(entry.documents.some((doc) => doc.representation === 'table' && doc.stimulus?.table?.rows?.length >= 3));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /linear model/i.test(doc.prompt)));
  const reverse = entry.documents.find((doc) => doc.taskType === 'reverseReasoning' && /y\(2\)/i.test(doc.prompt));
  assert.ok(reverse, 'A.9C needs nonconsecutive-data reverse reasoning');
  assert.equal(reverse.dok, 2, 'recovering one exponential model from two stated values is DOK 2, not inflated DOK 3');
  assert.equal(reverse.difficultyBand, 4, 'the harder arithmetic/structure belongs in difficulty, separate from DOK');
});

test('A.10A-D require complete polynomial-operation expressions rather than component answers', () => {
  for (const code of ['A.10A', 'A.10B', 'A.10C', 'A.10D']) {
    const entry = payload(code);
    assert.match(entry.certificationStatus, /expanded-polynomial-expression-grading/);
    for (const doc of entry.documents) {
      assert.equal(doc.responseFields?.length, 1);
      assert.equal(doc.responseFields[0].inputProfile, 'expression');
      assert.match(String(doc.responseFields[0].expected), /x/);
      assert.doesNotMatch(String(doc.prompt), /what is the coefficient|what is the constant term|what is the degree/i);
    }
    assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
    assert.ok(new Set(entry.documents.map((doc) => doc.dok)).size >= 2, `${code} needs honest DOK spread without forcing DOK 3`);
  }
});

test('A.10E-F require complete factored forms and preserve factor order alternatives', () => {
  for (const code of ['A.10E', 'A.10F']) {
    const entry = payload(code);
    assert.match(entry.certificationStatus, /form-preserving-factoring/);
    for (const doc of entry.documents) {
      const field = doc.responseFields?.[0];
      assert.equal(field?.inputProfile, 'expression');
      assert.match(String(doc.prompt), /factor/i);
      assert.match(String(field.expected), /\(|\^2/);
      assert.doesNotMatch(String(doc.prompt), /what is the larger zero|what positive number|what is the coefficient/i);
    }
    assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  }
});

test('A.11B includes integral and rational exponent laws with complete simplification', () => {
  const entry = payload('A.11B');
  assert.match(entry.certificationStatus, /rational-and-integral-exponent-coverage/);
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /rational exponent/);
  assert.match(text, /positive exponents/);
  assert.ok(entry.documents.some((doc) => doc.prompt.includes('{{p}}/{{q}}')));
  assert.ok(entry.documents.some((doc) => doc.responseFields?.[0]?.inputProfile === 'number'));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /adding the exponents/i.test(doc.prompt)));
});

test('A.12A classifies functions across mapping, table, graph, ordered-pair and verbal/context forms', () => {
  const entry = payload('A.12A');
  assert.match(entry.certificationStatus, /verbal-table-graph-symbolic-function-classification/);
  assert.ok(entry.documents.some((doc) => doc.type === 'relationMapping'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'table' && doc.stimulus?.table?.rows?.length >= 2));
  assert.ok(entry.documents.some((doc) => doc.representation === 'orderedPairs'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'context'));
  const graphFamily = entry.documents.find((doc) => doc.representation === 'graph');
  assert.ok(graphFamily?.stimulus?.graph?.points?.length >= 3);
  assert.match(String(graphFamily.prompt), /vertical-line test/i);
  assert.ok(entry.documents.some((doc) => doc.type === 'relationMapping' && /function/i.test(doc.prompt)));
});

test('A.12C connects recursive sequences to term-number domain, tables, and discrete graph points', () => {
  const entry = payload('A.12C');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /discrete-point-render-review/);
  assert.ok(entry.documents.filter((doc) => doc.representation === 'table').length >= 2);
  const graph = entry.documents.find((doc) => doc.representation === 'graph');
  assert.equal(graph?.type, 'functionInvestigation');
  assert.equal(graph?.pointTasks?.length, 4);
  assert.ok(graph.pointTasks.every((task, index) => task.expected?.[0] === index + 1));
  assert.match(String(graph.prompt), /term number as the x-coordinate/i);
  assert.match(String(graph.prompt), /discrete/i);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /domain/i.test(doc.prompt)));
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /arithmetic/);
  assert.match(text, /geometric/);
  assert.match(text, /input\/domain|domain\/input/);
});

test('A.12D requires nth-term formulas and covers arithmetic plus geometric growth/decay', () => {
  const entry = payload('A.12D');
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'expression');
    assert.match(String(doc.prompt), /formula/i);
    assert.match(String(doc.responseFields[0].expected), /n/);
  }
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /arithmetic/);
  assert.match(text, /geometric/);
  assert.match(text, /0\.5|1\/2/);
  assert.ok(entry.documents.filter((doc) => doc.representation === 'table').length >= 2);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  const reverse = entry.documents.find((doc) => doc.taskType === 'reverseReasoning');
  assert.ok(reverse, 'A.12D needs nonconsecutive-term reverse reasoning');
  assert.equal(reverse.dok, 2, 'recovering an explicit rule from two nonconsecutive terms is multi-step DOK 2 here');
  assert.equal(reverse.difficultyBand, 4, 'nonconsecutive-term complexity is represented by difficulty rather than false DOK inflation');
});
