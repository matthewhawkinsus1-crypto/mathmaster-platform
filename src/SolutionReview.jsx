import { derivative, parse, simplify } from 'mathjs';
import MathDisplay from './MathDisplay';
import GraphDisplay from './GraphDisplay';
import {
  getDefaultEndpointRequirements,
  getDomainRangeAcceptedAnswers,
  getGraphFeaturePoints,
  getMonotonicAcceptedAnswers,
  sampleVisibleFunctionPaths,
} from './interactiveGraphEngine';
import { formatGraphEquationLatex, getSuggestedGraphPoints } from './functionGraphUtils';
import { normalizeInterpretationConfig } from './contextInterpretationUtils';

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
    case 'fraction': {
      const numerator = Number(question.ansNum);
      const denominator = Number(question.ansDen);
      const decimal = denominator ? numerator / denominator : null;
      return unique([
        `\\frac{${numerator}}{${denominator}}`,
        Number.isFinite(decimal) ? `Decimal: ${Number(decimal.toFixed(6))}` : '',
        `${numerator}/${denominator}`,
      ]).slice(0, 3);
    }
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

export default function SolutionReview({ question }) {
  if (!question) return null;
  const representations = buildRepresentations(question);
  const graphSpec = question.functionSpec;
  const graphWindow = question.graph || {};
  const solutionPaths = graphSpec ? sampleVisibleFunctionPaths(graphSpec, graphWindow) : [];
  const solutionEndpoints = graphSpec ? getDefaultEndpointRequirements(graphSpec, solutionPaths, { ...question, graph: graphWindow }) : [];
  const graph = graphSpec
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
  const analysisSummary = buildGraphAnalysisSummary(question);
  const completeAnswerDetails = buildCompleteAnswerDetails(question);

  return (
    <section
      aria-label="Solution review"
      style={{
        margin: '18px auto 0',
        maxWidth: '860px',
        padding: '20px',
        borderRadius: '12px',
        border: '2px solid #5f6368',
        background: '#f8f9fa',
        textAlign: 'left',
      }}
    >
      <h3 style={{ margin: '0 0 8px', color: '#202124' }}>Solution review</h3>
      <p style={{ margin: '0 0 14px', color: '#5f6368', lineHeight: 1.5 }}>
        This problem version is closed. Review the solution before requesting another problem at the same difficulty.
      </p>
      {question.equationLatex && (
        <div style={{ padding: '12px', borderRadius: '9px', background: '#fff', marginBottom: '12px', fontSize: '23px', color: '#174ea6', textAlign: 'center' }}>
          <MathDisplay value={question.equationLatex} format="latex" />
        </div>
      )}
      {representations.length > 0 && (
        <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
          {representations.map((representation, index) => {
            const prose = isProseRepresentation(representation);
            return (
              <div key={`${representation}-${index}`} style={{ padding: '10px 12px', borderRadius: '8px', background: '#fff', border: '1px solid #d9e2f1' }}>
                <strong style={{ color: '#5f6368', marginRight: '8px' }}>{prose ? 'Solution note' : `Representation ${index + 1}`}:</strong>
                {prose
                  ? <span style={{ color: '#202124' }}>{representation}</span>
                  : <MathDisplay value={representation} format={representation.includes('\\') ? 'latex' : 'ascii-math'} inline />}
              </div>
            );
          })}
        </div>
      )}
      {completeAnswerDetails.length > 0 && (
        <div style={{ display: 'grid', gap: '7px', marginBottom: '14px' }}>
          {completeAnswerDetails.map((item) => <div key={item} style={{ padding: '9px 11px', borderRadius: '7px', background: '#fff', border: '1px solid #d9e2f1' }}>{item}</div>)}
        </div>
      )}
      {graph && <GraphDisplay graph={graph} title="Correct graph" />}
      {analysisSummary.length > 0 && (
        <div style={{ display: 'grid', gap: '7px', marginTop: '12px' }}>
          {analysisSummary.map((item) => <div key={item} style={{ padding: '9px 11px', borderRadius: '7px', background: '#fff' }}>{item}</div>)}
        </div>
      )}
    </section>
  );
}
