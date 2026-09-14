import { staticGraphAsymptotes } from '../../graphSpecUtils.js';
import { parseIntervalDomainRestriction } from './modelExpression.js';

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const normalizeWorkflowDomain = (domain = null) => {
  const source = domain && typeof domain === 'object' ? domain : {};
  return {
    min: finiteNumber(source.min),
    max: finiteNumber(source.max),
    minClosed: source.minClosed !== false && source.minInclusive !== false,
    maxClosed: source.maxClosed !== false && source.maxInclusive !== false,
  };
};

export const restrictEvaluatorToDomain = (evaluate, domain = null) => {
  if (typeof evaluate !== 'function') return () => Number.NaN;
  const bounds = normalizeWorkflowDomain(domain);
  if (bounds.min === null && bounds.max === null) return evaluate;

  return (rawX) => {
    const x = Number(rawX);
    if (!Number.isFinite(x)) return Number.NaN;
    if (bounds.min !== null) {
      if (x < bounds.min || (!bounds.minClosed && x <= bounds.min)) return Number.NaN;
    }
    if (bounds.max !== null) {
      if (x > bounds.max || (!bounds.maxClosed && x >= bounds.max)) return Number.NaN;
    }
    const y = evaluate(x);
    return Number.isFinite(y) ? y : Number.NaN;
  };
};

const inView = (point, view) => (
  point
  && Number.isFinite(point[0])
  && Number.isFinite(point[1])
  && point[0] >= view.xMin - 1e-9
  && point[0] <= view.xMax + 1e-9
  && point[1] >= view.yMin - 1e-9
  && point[1] <= view.yMax + 1e-9
);

const sampledVisiblePoints = (evaluate, view, domain) => {
  const bounds = normalizeWorkflowDomain(domain);
  const low = bounds.min === null ? view.xMin : Math.max(view.xMin, bounds.min);
  const high = bounds.max === null ? view.xMax : Math.min(view.xMax, bounds.max);
  if (!(high > low)) return [];

  const samples = 320;
  const rows = [];
  for (let index = 0; index <= samples; index += 1) {
    const x = low + ((high - low) * index) / samples;
    const y = evaluate(x);
    if (Number.isFinite(y) && y >= view.yMin && y <= view.yMax) rows.push([x, y]);
  }
  return rows;
};

export const workflowRequiresEndpointMarkers = ({ pointOnly = false, authored, domain = null } = {}) => {
  if (pointOnly) return false;
  if (typeof authored === 'boolean') return authored;
  const bounds = normalizeWorkflowDomain(domain);
  return bounds.min !== null || bounds.max !== null;
};

const restrictionFromGradingRule = (rule) => {
  const options = Array.isArray(rule)
    ? rule
    : (rule && typeof rule === 'object' && !Array.isArray(rule))
      ? (Array.isArray(rule.anyOf) ? rule.anyOf : [rule.equals ?? rule])
      : [rule];
  for (const option of options) {
    const parsed = parseIntervalDomainRestriction(option);
    if (parsed) return parsed;
  }
  return null;
};

/**
 * Resolve the finite domain a student-built graph must honor.
 *
 * A simple workflow historically stored its key at grading.domain. Branched
 * continuity workflows store one key per visible branch instead
 * (domain-continuous / domain-discrete, or any authored stage id). The graph
 * runtime used to look only at grading.domain, so a correct continuous
 * real-world model silently became an unbounded function and demanded arrows.
 *
 * Read the ACTIVE workflow, never a hidden branch. That preserves the
 * assessment: the student's discrete/continuous choice decides which domain
 * stage exists, and only then does the graph receive the matching boundary
 * semantics.
 */
export const workflowGraphDomainRestriction = ({
  graphStage = null,
  workflow = [],
  grading = null,
} = {}) => {
  const authored = parseIntervalDomainRestriction(graphStage?.domainRestriction);
  if (authored) return authored;

  const rules = grading && typeof grading === 'object' && !Array.isArray(grading) ? grading : {};
  const direct = restrictionFromGradingRule(rules.domain);
  if (direct) return direct;

  for (const stage of Array.isArray(workflow) ? workflow : []) {
    if (stage?.kind !== 'domainInput') continue;
    const parsed = restrictionFromGradingRule(rules[stage.id]);
    if (parsed) return parsed;
  }
  return null;
};

export const workflowEndpointMarkers = ({ evaluate, domain = null, viewWindow = {} } = {}) => {
  if (typeof evaluate !== 'function') return [];
  const view = {
    xMin: finiteNumber(viewWindow.xMin) ?? -10,
    xMax: finiteNumber(viewWindow.xMax) ?? 10,
    yMin: finiteNumber(viewWindow.yMin) ?? -10,
    yMax: finiteNumber(viewWindow.yMax) ?? 10,
  };
  const bounds = normalizeWorkflowDomain(domain);
  const markers = [];

  const boundary = (side, x, closed) => {
    if (x === null) return;
    const y = evaluate(x);
    const point = [x, y];
    if (!inView(point, view)) return;
    markers.push({
      x,
      y,
      marker: closed ? 'closed' : 'open',
      movable: false,
      r: 7,
      ariaLabel: `${closed ? 'Closed' : 'Open'} endpoint`,
      endpointSide: side,
    });
  };

  boundary('min', bounds.min, bounds.minClosed);
  boundary('max', bounds.max, bounds.maxClosed);

  const visible = sampledVisiblePoints(evaluate, view, domain);
  if (visible.length >= 2) {
    if (bounds.min === null) {
      const point = visible[0];
      const inner = visible[1];
      markers.push({
        x: point[0], y: point[1], marker: 'arrow', movable: false,
        vector: [point[0] - inner[0], point[1] - inner[1]],
        r: 8, ariaLabel: 'Function continues', endpointSide: 'min',
      });
    }
    if (bounds.max === null) {
      const point = visible[visible.length - 1];
      const inner = visible[visible.length - 2];
      markers.push({
        x: point[0], y: point[1], marker: 'arrow', movable: false,
        vector: [point[0] - inner[0], point[1] - inner[1]],
        r: 8, ariaLabel: 'Function continues', endpointSide: 'max',
      });
    }
  }

  return markers;
};

export const workflowHorizontalAsymptotes = (functionSpec = null) => {
  if (!functionSpec || typeof functionSpec !== 'object') return [];
  return staticGraphAsymptotes(functionSpec)
    .filter((line) => line?.axis === 'horizontal' && Number.isFinite(Number(line.value)))
    .map((line) => Number(line.value));
};
