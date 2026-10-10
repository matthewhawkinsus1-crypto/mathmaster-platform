import { derivative, parse, simplify } from './platform/math/mathjs.js';
import MathDisplay from './MathDisplay';
import GraphDisplay from './GraphDisplay';
import {
  buildInteractiveGraphWindow,
  getDefaultEndpointRequirements,
  getDomainRangeAcceptedAnswers,
  getGraphFeaturePoints,
  getMonotonicAcceptedAnswers,
  sampleVisibleFunctionPaths,
} from './interactiveGraphEngine';
import { formatGraphEquationLatex, getSuggestedGraphPoints } from './functionGraphUtils';
import { normalizeInterpretationConfig } from './contextInterpretationUtils';
import { getStage } from './platform/workflow/interactionStages';
import { readComposedQuestion } from './platform/workflow/questionWorkflow';
import { buildExpressionFunctionSpec, evaluateModelAt, parseIntervalDomainRestriction } from './platform/workflow/modelExpression';
import { fractionSolutionRepresentations } from './fractionQuestionDisplay.js';

const asText = (value) => String(value ?? '').trim();
const pointText = (point) => `(${point[0]}, ${point[1]})`;

const unique = (values) => [...new Set(values.filter((value) => asText(value) !== '').map(asText))];
const isProseRepresentation = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (/\b(?:check|point|sample|form|variable|decimal|solution is|selected number|intersection)\b/i.test(text)) return true;
  // Student-facing explanatory sentences must never be sent through the math
  // parser. ASCII-math interprets English words as variables/operators (for
  // example, "and" becomes ∧), which produced the garbled solution-review
  // text seen in practice.
  const words = text.match(/[A-Za-z]{2,}/g) || [];
  const hasStrongMathSyntax = /\\(?:frac|sqrt|pi|infty|quad)|[=<>≤≥≠^]/.test(text);
  return words.length >= 3 && !hasStrongMathSyntax;
};

const solveLinearSymbolically = (question) => {
  try {
    const variable = String(question.objective?.variable || question.variable || question.solveFor || 'x');
    const left = String(question.leftExpression || String(question.equation || '').split('=')[0] || '').trim();
    const right = String(question.rightExpression || String(question.equation || '').split('=')[1] || '').trim();
    if (!left || !right) return null;
    const difference = `(${left})-(${right})`;
    const coefficient = simplify(derivative(difference, variable)).toString({ parenthesis: 'auto', implicit: 'hide' });
    const remainder = simplify(`(${difference})-(${coefficient})*${variable}`).toString({ parenthesis: 'auto', implicit: 'hide' });
    const solution = simplify(`-(${remainder})/(${coefficient})`).toString({ parenthesis: 'auto', implicit: 'hide' });
    const solutionLatex = parse(solution).toTex({ parenthesis: 'keep', implicit: 'hide' });
    return { variable, solution, solutionLatex };
  } catch {
    return null;
  }
};

const buildRepresentations = (question) => {
  if (Array.isArray(question.solutionRepresentations) && question.solutionRepresentations.length) {
    return unique(question.solutionRepresentations).slice(0, 3);
  }

  switch (question.type) {
    case 'algebra': {
      const answer = question.generatedAnswer ?? question.answer;
      return unique([
        `x = ${answer}`,
        Number.isFinite(Number(answer)) ? `Ordered pair on y = x: (${answer}, ${answer})` : '',
        Number.isFinite(Number(answer)) ? `Decimal form: ${Number(answer).toFixed(2).replace(/\.00$/, '')}` : '',
      ]).slice(0, 3);
    }
    case 'numberLine':
      return unique([
        `x=${question.target}`,
        `Point: (${question.target},0)`,
        `The selected number is ${question.target}.`,
      ]).slice(0, 3);
    case 'fraction':
      // An authored answer is shown as the author wrote it, stacked, and
      // nothing they did not write; a drill keeps its fraction/decimal lines.
      return fractionSolutionRepresentations(question);
    case 'literal':
      return unique(question.acceptedAnswers || []).slice(0, 3);
    case 'system': {
      const pair = question.solution || question.answer;
      if (!Array.isArray(pair)) return [];
      return unique([
        pointText(pair),
        `x = ${pair[0]},\\quad y = ${pair[1]}`,
        'The solution is the intersection of the two lines.',
      ]).slice(0, 3);
    }
    case 'orderedPair': {
      const pair = question.answer || question.solution;
      return Array.isArray(pair) ? unique([pointText(pair), `x=${pair[0]},\\quad y=${pair[1]}`]).slice(0, 3) : [];
    }
    case 'graphing':
      return unique([
        question.equationLatex || `y=${question.m}x${Number(question.b) >= 0 ? '+' : ''}${question.b}`,
        `m=${question.m},\\quad b=${question.b}`,
        `(0,${question.b})`,
      ]).slice(0, 3);
    case 'functionGraph':
    case 'functionInvestigation':
    case 'graphAnalysis': {
      const spec = question.functionSpec;
      if (!spec) return [];
      const points = getSuggestedGraphPoints(spec);
      return unique([
        question.equationLatex || formatGraphEquationLatex(spec),
        points[2] ? `Key point: ${pointText(points[2])}` : '',
        points.length ? `Sample points: ${points.slice(0, 5).map(pointText).join(', ')}` : '',
      ]).slice(0, 3);
    }
    case 'table':
      return ['The completed table values are listed below.'];
    case 'multiAnswer':
      // The answer-detail cards below already list each field and its accepted
      // response. A generic 'Representation 1' note is redundant and was also
      // vulnerable to being rendered as math.
      return [];
    case 'relationshipModel': {
      const quantities = Object.fromEntries((question.quantities || []).map((item) => [item.id, item.label]));
      return unique([
        `Independent quantity: ${quantities[question.correctIndependentId] || question.correctIndependentId || ''}`,
        `Dependent quantity: ${quantities[question.correctDependentId] || question.correctDependentId || ''}`,
        question.relationshipType ? `The relationship is ${question.relationshipType}.` : '',
      ]).slice(0, 3);
    }
    case 'graphScenarioMatch':
      return ['The correct scenario-to-graph matches are listed below.'];
    case 'graphComparison':
      return ['One accepted comparison for each required field is listed below.'];
    case 'graphStory':
      return unique([
        question.sampleScenario ? `Sample scenario: ${question.sampleScenario}` : '',
        question.sampleExplanation ? `Sample explanation: ${question.sampleExplanation}` : '',
        'A complete response includes a scenario, quantities, labeled axes, a graph sketch, and an explanation.',
      ]).slice(0, 3);
    case 'contextInterpretation': {
      const config = normalizeInterpretationConfig(question);
      const [x, y] = config.target.coordinates;
      return unique([
        Number.isFinite(x) && Number.isFinite(y) ? `Point: (${x}, ${y})` : '',
        config.sampleAnswer,
        Number.isFinite(x) && Number.isFinite(y)
          ? `When ${config.x.name || 'the x-quantity'} is ${x} ${config.x.unit || ''}, ${config.y.name || 'the y-quantity'} is ${y} ${config.y.unit || ''}.`
          : '',
      ]).slice(0, 3);
    }
    case 'stepAlgebra': {
      // A Question Family instance with an exact key (linear equations v2):
      // a special outcome is never "x = …", and a fraction stays a fraction.
      // Each line is either plain prose or plain LaTeX (isProseRepresentation
      // decides how a line is drawn).
      const key = question.solutionKey;
      const letter = asText(question.variable) || 'x';
      if (key?.outcome === 'noSolution') {
        return [
          'No solution: no value of the variable makes the equation true.',
          `${letter} \\in \\varnothing`,
          'The variable terms cancel and the constants that remain are not equal.',
        ];
      }
      if (key?.outcome === 'allReals') {
        return [
          'All real numbers: every value of the variable makes the equation true.',
          `${letter} \\in \\mathbb{R}`,
          'Both sides simplify to the same expression, so the equation is an identity.',
        ];
      }
      if (key?.outcome === 'value' && question.generatedAnswer === undefined && asText(key.latex || key.value)) {
        const value = asText(key.latex || key.value);
        return unique([
          `${question.variable || 'x'}=${value}`,
          `Solution set: \\{${value}\\}`,
          `Check: substitute ${value} into both sides.`,
        ]).slice(0, 3);
      }
      if (question.generatedAnswer !== undefined) {
        return unique([
          `${question.variable || 'x'}=${question.generatedAnswer}`,
          `Solution set: \\{${question.generatedAnswer}\\}`,
          `Check: substitute ${question.generatedAnswer} into both sides.`,
        ]).slice(0, 3);
      }
      const symbolic = solveLinearSymbolically(question);
      if (symbolic) {
        const finalEquation = `${symbolic.variable}=${symbolic.solutionLatex}`;
        return unique([
          finalEquation,
          `${symbolic.variable}=(${symbolic.solution})`,
          question.objective?.kind === 'slopeIntercept'
            ? `Slope-intercept form: ${finalEquation}`
            : `Isolated variable: ${finalEquation}`,
        ]).slice(0, 3);
      }
      return unique([
        ...(question.acceptedAnswers || []),
        question.solutionLatex,
        question.targetExpression,
        question.objective?.targetForm,
      ]).slice(0, 3);
    }
    default:
      return unique([question.answer, question.solution, ...(question.acceptedAnswers || [])]).slice(0, 3);
  }
};

const buildCompleteAnswerDetails = (question) => {
  if (question.type === 'table') {
    return Object.entries(question.table?.answers || {}).map(([cell, value]) => `${cell}: ${value}`);
  }
  if (question.type === 'multiAnswer') {
    return (question.answerFields || []).map((field) => `${field.label}: ${(field.acceptedAnswers || [field.answer]).filter((value) => value !== undefined && value !== null && String(value).trim() !== '')[0] ?? ''}`);
  }
  if (question.type === 'relationshipModel') {
    const quantities = Object.fromEntries((question.quantities || []).map((item) => [item.id, item.label]));
    return [
      `Independent quantity: ${quantities[question.correctIndependentId] || question.correctIndependentId || ''}`,
      `Dependent quantity: ${quantities[question.correctDependentId] || question.correctDependentId || ''}`,
      question.origin?.sampleAnswer ? `Starting point: ${question.origin.sampleAnswer}` : '',
    ].filter(Boolean);
  }
  if (question.type === 'contextInterpretation') {
    const config = normalizeInterpretationConfig(question);
    const [x, y] = config.target.coordinates;
    return [
      `X-coordinate: ${config.x.name || 'x'} = ${Number.isFinite(x) ? x : ''} ${config.x.unit || ''}`.trim(),
      `Y-coordinate: ${config.y.name || 'y'} = ${Number.isFinite(y) ? y : ''} ${config.y.unit || ''}`.trim(),
      config.sampleAnswer ? `In context: ${config.sampleAnswer}` : '',
    ].filter(Boolean);
  }
  if (question.type === 'graphScenarioMatch') {
    const graphLabels = Object.fromEntries((question.graphs || []).map((item) => [item.id, item.label || item.id]));
    return (question.scenarios || []).map((scenario) => `${scenario.title || scenario.id}: ${graphLabels[(question.correctMatches || {})[scenario.id] || scenario.graphId] || ''}`);
  }
  if (question.type === 'graphComparison') {
    return (question.fields || []).map((field) => `${field.label || field.id}: ${(field.acceptedAnswers || [field.answer]).filter(Boolean)[0] || (field.sampleAnswer || 'Review the graph characteristics.')}`);
  }
  return [];
};


const firstRuleValue = (rule) => {
  if (rule === undefined || rule === null) return null;
  if (Array.isArray(rule)) return rule[0] ?? null;
  if (typeof rule === 'object') {
    if (Array.isArray(rule.anyOf)) return rule.anyOf[0] ?? null;
    if (rule.equals !== undefined) return rule.equals;
  }
  return rule;
};

const workflowIncorrectMatch = (entry, incorrectParts = []) => {
  const prompt = String(entry.prompt || '').trim().replace(/[.]+$/, '').toLowerCase();
  const title = String(entry.title || '').trim().toLowerCase();
  return (Array.isArray(incorrectParts) ? incorrectParts : []).some((part) => {
    const normalized = String(part || '').trim().replace(/[.]+$/, '').toLowerCase();
    if (!normalized) return false;
    return normalized === prompt || normalized === title || prompt.includes(normalized) || normalized.includes(prompt);
  });
};

const buildWorkflowSolution = (question) => {
  const composed = readComposedQuestion(question);
  if (!composed.composed || !composed.workflow.length) return null;
  const grading = composed.grading || {};
  const quantities = Object.fromEntries((question.quantities || composed.content?.quantities || []).map((item) => [item.id, item.label || item.id]));
  const equationRule = firstRuleValue(grading.equation);
  const domainRule = firstRuleValue(grading.domain);
  const domainRestriction = parseIntervalDomainRestriction(domainRule);
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  const tableXs = Array.isArray(tableStage?.xValues) ? tableStage.xValues : [];
  const tableRows = equationRule && tableXs.length
    ? tableXs.map((x) => [x, evaluateModelAt(equationRule, Number(x))]).filter((row) => Number.isFinite(Number(row[1])))
    : [];
  const graphSpec = equationRule
    ? buildExpressionFunctionSpec(equationRule, { referencePoints: tableRows, domain: domainRestriction })
    : null;
  const graphTasks = tableRows.map((point, index) => ({ id: `solution-point-${index}`, expected: point }));
  const graphWindow = graphSpec ? buildInteractiveGraphWindow(graphSpec, graphTasks, question.graph || {}) : null;
  const graphPaths = graphSpec && graphWindow ? sampleVisibleFunctionPaths(graphSpec, graphWindow) : [];
  const endpointRequirements = graphSpec && graphWindow
    ? getDefaultEndpointRequirements(graphSpec, graphPaths, { requireEndpointMarkers: true, graph: graphWindow })
    : [];
  const graph = graphSpec && graphWindow ? {
    ...graphWindow,
    functions: [graphSpec],
    points: tableRows.map((coordinates) => ({ coordinates })),
    endpointRequirements,
    ariaLabel: `Correct model graph for ${equationRule}`,
  } : null;

  const entries = composed.workflow.map((stage, index) => {
    const definition = getStage(stage.kind);
    const title = `Step ${index + 1} — ${definition?.label || stage.kind}`;
    const base = { id: stage.id, title, prompt: stage.prompt || '', kind: stage.kind };
    const rule = grading[stage.id];

    if (stage.kind === 'quantityRoles') {
      return {
        ...base,
        lines: [
          `Independent quantity: ${quantities[rule?.independent] || rule?.independent || 'Not provided'}`,
          `Dependent quantity: ${quantities[rule?.dependent] || rule?.dependent || 'Not provided'}`,
        ],
      };
    }
    if (stage.kind === 'equationInput') {
      return {
        ...base,
        math: firstRuleValue(rule),
        note: 'Equivalent function names and input-variable letters are accepted unless the prompt explicitly requires particular symbols.',
      };
    }
    if (stage.kind === 'tableInput') {
      if (tableRows.length) return { ...base, table: { headers: ['Input', 'Output'], rows: tableRows } };
      if (rule?.values) return { ...base, lines: Object.entries(rule.values).map(([cell, value]) => `${cell}: ${value}`) };
      return { ...base, lines: ['Use the correct function model to generate each table value.'] };
    }
    if (stage.kind === 'functionGraph' || stage.kind === 'coordinatePlot') {
      const boundaryNote = endpointRequirements.length
        ? endpointRequirements.map((requirement, endpointIndex) => `${requirement.marker === 'closed' ? '●' : requirement.marker === 'open' ? '○' : '➤'} ${requirement.marker === 'arrow' ? `End ${endpointIndex + 1} continues` : `Boundary ${endpointIndex + 1} is ${requirement.marker}`}`).join(' · ')
        : '';
      return {
        ...base,
        lines: [
          equationRule ? `Graph the same relationship represented by ${equationRule}.` : 'Graph the relationship consistently with the earlier stages.',
          boundaryNote,
        ].filter(Boolean),
        showsGraph: Boolean(graph),
      };
    }
    if (stage.kind === 'domainInput' || stage.kind === 'rangeInput' || stage.kind === 'intervalInput') {
      return { ...base, math: firstRuleValue(rule) };
    }
    if (stage.kind === 'classification' || stage.kind === 'multipleChoice') {
      return { ...base, lines: [String(firstRuleValue(rule) ?? 'Not provided')] };
    }
    if (rule !== undefined) return { ...base, lines: [String(firstRuleValue(rule) ?? '')].filter(Boolean) };
    return { ...base, lines: ['This part is reviewed from the completed mathematical work.'] };
  });

  return { entries, graph };
};

const buildGraphAnalysisSummary = (question) => {
  const spec = question.functionSpec;
  if (!spec) return [];
  const window = question.graph || {};
  const requests = Array.isArray(question.analysisRequests) ? question.analysisRequests : [];
  return requests.map((request) => {
    if (request.kind === 'domain' || request.kind === 'range') {
      const accepted = request.acceptedAnswers || getDomainRangeAcceptedAnswers(spec, request.kind, request.notation || 'interval');
      return `${request.label || request.kind}: ${accepted[0] || 'See graph'}`;
    }
    if (['increasing', 'decreasing', 'constant'].includes(request.kind)) {
      const accepted = request.acceptedAnswers || getMonotonicAcceptedAnswers(spec, request.kind, request.notation || 'interval');
      return `${request.label || request.kind}: ${accepted[0] || 'Does not exist'}`;
    }
    const feature = request.feature || request.kind;
    const points = request.expected || getGraphFeaturePoints(spec, feature, window);
    return `${request.label || feature}: ${points.length ? points.map(pointText).join(', ') : 'Does not exist'}`;
  });
};

/*
 * WHAT THE LEGACY REVIEW CAN SHOW FOR A QUESTION — computed once, so the
 * review panel (SolutionReviewPanel.jsx) knows whether there is anything
 * below before it says so.
 */
export const legacySolutionReviewContent = (question) => {
  if (!question) return null;
  const workflowSolution = buildWorkflowSolution(question);
  const representations = workflowSolution ? [] : buildRepresentations(question);
  const graphSpec = question.functionSpec;
  const graphWindow = question.graph || {};
  const solutionPaths = graphSpec ? sampleVisibleFunctionPaths(graphSpec, graphWindow) : [];
  const solutionEndpoints = graphSpec ? getDefaultEndpointRequirements(graphSpec, solutionPaths, { ...question, graph: graphWindow }) : [];
  const legacyGraph = graphSpec
    ? {
        ...graphWindow,
        functions: [graphSpec],
        points: getSuggestedGraphPoints(graphSpec).map((coordinates) => ({ coordinates })),
        endpointRequirements: solutionEndpoints,
        ariaLabel: `Solution graph for ${formatGraphEquationLatex(graphSpec)}`,
      }
    : question.graph && ['system', 'graphing', 'orderedPair'].includes(question.type)
      ? {
          ...question.graph,
          points: question.type === 'system' && Array.isArray(question.solution)
            ? [...(question.graph.points || []), { coordinates: question.solution, label: pointText(question.solution) }]
            : question.graph.points,
        }
      : null;
  const graph = workflowSolution?.graph || legacyGraph;
  const analysisSummary = workflowSolution ? [] : buildGraphAnalysisSummary(question);
  const completeAnswerDetails = workflowSolution ? [] : buildCompleteAnswerDetails(question);
  const hasContent = Boolean(
    workflowSolution?.entries?.length || question.equationLatex || representations.length
      || completeAnswerDetails.length || graph || analysisSummary.length,
  );
  return { workflowSolution, representations, graph, analysisSummary, completeAnswerDetails, hasContent };
};

/*
 * The legacy worked solution. `embedded` drops its own frame and heading:
 * SolutionReviewPanel puts it under one heading with the authored review. The
 * intro line promises another problem only when one can be requested
 * (`allowReplacement`).
 */
export default function SolutionReview({ question, incorrectParts = [], embedded = false, allowReplacement = false }) {
  const content = legacySolutionReviewContent(question);
  if (!content) return null;
  if (embedded && !content.hasContent) return null;
  const { workflowSolution, representations, graph, analysisSummary, completeAnswerDetails } = content;

  return (
    <section
      aria-label="Solution review"
      style={embedded ? { textAlign: 'left' } : {
        margin: '18px auto 0',
        maxWidth: '860px',
        padding: '20px',
        borderRadius: '12px',
        border: '2px solid #5f6368',
        background: 'var(--mm-surface-sunken)',
        textAlign: 'left',
      }}
    >
      {!embedded && <h3 style={{ margin: '0 0 8px', color: 'var(--mm-text-strong)' }}>Solution review</h3>}
      {!embedded && (
        <p style={{ margin: '0 0 14px', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>
          {allowReplacement
            ? 'This question is closed. Review the solution, then you can request a new question at the same difficulty.'
            : 'This question is closed. Compare your work with the solution.'}
        </p>
      )}
      {workflowSolution?.entries?.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
          {workflowSolution.entries.map((entry) => {
            const needsReview = workflowIncorrectMatch(entry, incorrectParts);
            return (
              <section
                key={entry.id}
                style={{
                  padding: '12px 13px', borderRadius: '9px', background: needsReview ? 'var(--mm-warning-bg)' : 'var(--mm-surface)',
                  border: `2px solid ${needsReview ? '#f9ab00' : 'var(--mm-tint-border)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--mm-text-strong)' }}>{entry.title}</strong>
                  {needsReview && <span style={{ color: 'var(--mm-warning-text)', fontSize: '12px', fontWeight: 900 }}>REVIEW THIS STEP</span>}
                </div>
                {entry.prompt && <p style={{ margin: '5px 0 8px', color: 'var(--mm-text-muted)', fontSize: '13px' }}>{entry.prompt}</p>}
                {entry.math !== undefined && entry.math !== null && String(entry.math).trim() !== '' && (
                  <div style={{ padding: '9px 11px', borderRadius: '7px', background: 'var(--mm-surface-tint)', color: 'var(--mm-primary-text)', fontSize: '20px' }}>
                    <MathDisplay value={String(entry.math)} format={String(entry.math).includes('\\') ? 'latex' : 'ascii-math'} />
                  </div>
                )}
                {Array.isArray(entry.lines) && entry.lines.map((line) => <div key={line} style={{ marginTop: '6px', color: 'var(--mm-text-strong)' }}>{line}</div>)}
                {entry.table && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', background: 'var(--mm-surface)' }}>
                    <thead><tr>{entry.table.headers.map((header) => <th key={header} style={{ padding: '7px 9px', border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-sunken)' }}>{header}</th>)}</tr></thead>
                    <tbody>{entry.table.rows.map((row, rowIndex) => <tr key={`${entry.id}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} style={{ padding: '7px 9px', textAlign: 'center', border: '1px solid var(--mm-tint-border)' }}>{String(cell)}</td>)}</tr>)}</tbody>
                  </table>
                )}
                {entry.note && <p style={{ margin: '8px 0 0', color: 'var(--mm-primary-text)', fontSize: '12px', lineHeight: 1.45 }}>{entry.note}</p>}
                {entry.showsGraph && graph && <div style={{ marginTop: '10px' }}><GraphDisplay graph={graph} title="Correct graph" /></div>}
              </section>
            );
          })}
        </div>
      )}
      {question.equationLatex && (
        <div style={{ padding: '12px', borderRadius: '9px', background: 'var(--mm-surface)', marginBottom: '12px', fontSize: '23px', color: 'var(--mm-primary-text)', textAlign: 'center' }}>
          <MathDisplay value={question.equationLatex} format="latex" />
        </div>
      )}
      {representations.length > 0 && (
        <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
          {representations.map((representation, index) => {
            const prose = isProseRepresentation(representation);
            return (
              <div key={`${representation}-${index}`} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)' }}>
                <strong style={{ color: 'var(--mm-text-muted)', marginRight: '8px' }}>{prose ? 'Solution note' : `Representation ${index + 1}`}:</strong>
                {prose
                  ? <span style={{ color: 'var(--mm-text-strong)' }}>{representation}</span>
                  : <MathDisplay value={representation} format={representation.includes('\\') ? 'latex' : 'ascii-math'} inline />}
              </div>
            );
          })}
        </div>
      )}
      {completeAnswerDetails.length > 0 && (
        <div style={{ display: 'grid', gap: '7px', marginBottom: '14px' }}>
          {completeAnswerDetails.map((item) => <div key={item} style={{ padding: '9px 11px', borderRadius: '7px', background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)' }}>{item}</div>)}
        </div>
      )}
      {graph && !workflowSolution && <GraphDisplay graph={graph} title="Correct graph" />}
      {analysisSummary.length > 0 && (
        <div style={{ display: 'grid', gap: '7px', marginTop: '12px' }}>
          {analysisSummary.map((item) => <div key={item} style={{ padding: '9px 11px', borderRadius: '7px', background: 'var(--mm-surface)' }}>{item}</div>)}
        </div>
      )}
    </section>
  );
}
