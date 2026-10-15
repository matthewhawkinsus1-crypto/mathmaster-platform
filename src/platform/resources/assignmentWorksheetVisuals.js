import {
  evaluateStaticGraphFunction,
  fitStaticGraphViewport,
} from '../../graphSpecUtils.js';
import { readGraphPointCoordinates } from '../../graphPointUtils.js';
import { normalizeIntervals } from '../../tools/intervalNumberLine/intervalMath.js';

const make = (tag, styles = {}, text = null) => {
  const node = document.createElement(tag);
  Object.assign(node.style, styles);
  if (text != null) node.textContent = text;
  return node;
};

const svgNode = (width, height, label) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || 'Math visual');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.maxWidth = `${width}px`;
  return svg;
};

const addSvg = (svg, tag, attrs = {}, text = null) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value != null) node.setAttribute(key, String(value));
  });
  if (text != null) node.textContent = text;
  svg.appendChild(node);
  return node;
};

const finite = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const stepForSpan = (span) => {
  if (span <= 12) return 1;
  if (span <= 30) return 2;
  if (span <= 60) return 5;
  return 10;
};

const ticks = (min, max, requested) => {
  let step = finite(requested, stepForSpan(max - min));
  if (!(step > 0)) step = stepForSpan(max - min);
  if ((max - min) / step > 24) step = (max - min) / 12;
  const values = [];
  const first = Math.ceil(min / step) * step;
  for (let value = first; value <= max + step * 0.001 && values.length < 30; value += step) {
    values.push(Number(value.toFixed(6)));
  }
  return values;
};

const normalizeGraph = (source = {}) => {
  const graph = {
    ...source,
    functions: Array.isArray(source.functions)
      ? source.functions.map((spec) => ({
          ...spec,
          type: spec?.type === 'linear' ? 'line' : spec?.type,
        }))
      : [],
  };
  if (source.line) graph.functions.push({ type: 'line', ...source.line });
  if (Number.isFinite(Number(source.m)) || Number.isFinite(Number(source.b))) {
    graph.functions.push({ type: 'line', m: Number(source.m || 0), b: Number(source.b || 0) });
  }
  return fitStaticGraphViewport(graph);
};

const graphVisual = (visual = {}, { blank = false, compact = false } = {}) => {
  const wrap = make('div', {
    marginTop: '11px',
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
  });
  if (visual.label) {
    wrap.appendChild(make('div', {
      fontSize: '11px',
      fontWeight: '800',
      color: '#5f6368',
      textTransform: 'uppercase',
      letterSpacing: '.04em',
    }, visual.label));
  }

  const source = blank ? { ...(visual.bounds || {}) } : (visual.graph || {});
  const graph = normalizeGraph(source);
  let xMin = finite(graph.xMin, -10);
  let xMax = finite(graph.xMax, 10);
  let yMin = finite(graph.yMin, -10);
  let yMax = finite(graph.yMax, 10);
  if (xMin >= xMax) [xMin, xMax] = [-10, 10];
  if (yMin >= yMax) [yMin, yMax] = [-10, 10];

  const width = compact ? 280 : 430;
  const height = compact ? 210 : 300;
  const pad = compact ? 30 : 38;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const xTo = (x) => pad + ((x - xMin) / (xMax - xMin)) * plotW;
  const yTo = (y) => pad + ((yMax - y) / (yMax - yMin)) * plotH;
  const svg = svgNode(width, height, visual.label || (blank ? 'Graphing workspace' : 'Graph'));

  addSvg(svg, 'rect', { x: pad, y: pad, width: plotW, height: plotH, fill: '#fff', stroke: '#b9c0c8' });
  const xTicks = ticks(xMin, xMax, graph.xStep);
  const yTicks = ticks(yMin, yMax, graph.yStep);

  xTicks.forEach((tick) => {
    const x = xTo(tick);
    addSvg(svg, 'line', { x1: x, y1: pad, x2: x, y2: pad + plotH, stroke: '#e8eaed', 'stroke-width': 1 });
  });
  yTicks.forEach((tick) => {
    const y = yTo(tick);
    addSvg(svg, 'line', { x1: pad, y1: y, x2: pad + plotW, y2: y, stroke: '#e8eaed', 'stroke-width': 1 });
  });

  const axisX = yMin <= 0 && yMax >= 0 ? yTo(0) : pad + plotH;
  const axisY = xMin <= 0 && xMax >= 0 ? xTo(0) : pad;
  addSvg(svg, 'line', { x1: pad, y1: axisX, x2: pad + plotW, y2: axisX, stroke: '#5f6368', 'stroke-width': 2 });
  addSvg(svg, 'line', { x1: axisY, y1: pad, x2: axisY, y2: pad + plotH, stroke: '#5f6368', 'stroke-width': 2 });

  xTicks.forEach((tick) => {
    if (Math.abs(tick) < 1e-9) return;
    addSvg(svg, 'text', {
      x: xTo(tick), y: Math.min(height - 5, axisX + 16),
      'text-anchor': 'middle', 'font-size': compact ? 8 : 9, fill: '#5f6368',
    }, tick);
  });
  yTicks.forEach((tick) => {
    if (Math.abs(tick) < 1e-9) return;
    addSvg(svg, 'text', {
      x: Math.max(8, axisY - 6), y: yTo(tick) + 3,
      'text-anchor': 'end', 'font-size': compact ? 8 : 9, fill: '#5f6368',
    }, tick);
  });

  if (!blank) {
    (graph.functions || []).forEach((spec) => {
      const sampleCount = compact ? 120 : 220;
      let path = '';
      let drawing = false;
      let previousY = null;
      for (let index = 0; index <= sampleCount; index += 1) {
        const x = xMin + ((xMax - xMin) * index) / sampleCount;
        const y = evaluateStaticGraphFunction(spec, x);
        const invalid = !Number.isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin);
        const jump = previousY != null && Number.isFinite(y) && Math.abs(y - previousY) > (yMax - yMin) * 0.7;
        if (invalid || jump) {
          drawing = false;
          previousY = null;
          continue;
        }
        const command = drawing ? 'L' : 'M';
        path += `${command} ${xTo(x).toFixed(2)} ${yTo(y).toFixed(2)} `;
        drawing = true;
        previousY = y;
      }
      if (path) addSvg(svg, 'path', { d: path.trim(), fill: 'none', stroke: '#1a73e8', 'stroke-width': compact ? 2 : 2.5 });
    });

    (graph.segments || []).forEach((segment) => {
      const from = segment?.from || segment?.start;
      const to = segment?.to || segment?.end;
      if (!Array.isArray(from) || !Array.isArray(to)) return;
      addSvg(svg, 'line', {
        x1: xTo(Number(from[0])), y1: yTo(Number(from[1])),
        x2: xTo(Number(to[0])), y2: yTo(Number(to[1])),
        stroke: '#6f42c1', 'stroke-width': 2.5,
      });
    });

    (graph.points || []).forEach((point) => {
      const coordinates = readGraphPointCoordinates(point);
      if (!coordinates) return;
      addSvg(svg, 'circle', {
        cx: xTo(coordinates[0]), cy: yTo(coordinates[1]), r: compact ? 3.5 : 4.5,
        fill: '#d93025', stroke: '#fff', 'stroke-width': 1.5,
      });
    });
  }

  addSvg(svg, 'text', { x: width - pad + 9, y: axisX + 4, 'font-size': 10, 'font-weight': 700, fill: '#3c4043' }, 'x');
  addSvg(svg, 'text', { x: axisY + 7, y: pad - 8, 'font-size': 10, 'font-weight': 700, fill: '#3c4043' }, 'y');
  wrap.appendChild(svg);
  return wrap;
};

const tableVisual = (visual = {}) => {
  const table = visual.table || {};
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const wrap = make('div', { marginTop: '11px', overflow: 'hidden', border: '1px solid #c7cdd4', borderRadius: '7px' });
  const node = make('table', { borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '12px' });
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = make('th', {
      padding: '7px 6px', borderBottom: '1px solid #c7cdd4', borderRight: '1px solid #e2e6ea',
      background: '#f3f6fa', textAlign: 'center', fontWeight: '800',
    }, column.label || column.key);
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  node.appendChild(head);

  const body = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column, index) => {
      const value = Array.isArray(row) ? row[index] : row?.[column.key];
      const td = make('td', {
        minHeight: '32px', height: '32px', padding: '6px', textAlign: 'center',
        borderBottom: '1px solid #e2e6ea', borderRight: '1px solid #e2e6ea',
        fontWeight: value === '' || value == null ? '400' : '600',
      }, value === '' || value == null ? '' : String(value));
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  node.appendChild(body);
  wrap.appendChild(node);
  return wrap;
};

const numberLineVisual = (visual = {}) => {
  let min = finite(visual.min, -10);
  let max = finite(visual.max, 10);
  if (min >= max) [min, max] = [-10, 10];
  let step = finite(visual.step, 1);
  if (!(step > 0)) step = 1;
  const width = 560;
  const height = 105;
  const pad = 34;
  const lineY = 48;
  const toX = (x) => pad + ((x - min) / (max - min)) * (width - pad * 2);
  const svg = svgNode(width, height, 'Number line');
  addSvg(svg, 'line', { x1: pad, y1: lineY, x2: width - pad, y2: lineY, stroke: '#3c4043', 'stroke-width': 2 });

  const count = Math.min(30, Math.floor((max - min) / step) + 1);
  for (let index = 0; index < count; index += 1) {
    const value = min + index * step;
    if (value > max + 1e-9) break;
    const x = toX(value);
    addSvg(svg, 'line', { x1: x, y1: lineY - 7, x2: x, y2: lineY + 7, stroke: '#5f6368', 'stroke-width': 1.5 });
    addSvg(svg, 'text', { x, y: lineY + 22, 'text-anchor': 'middle', 'font-size': 9, fill: '#5f6368' }, Number(value.toFixed(4)));
  }

  if (visual.showAnswer) {
    normalizeIntervals(visual.intervals || []).forEach((interval) => {
      const left = Number.isFinite(interval.min) ? toX(Math.max(min, interval.min)) : pad;
      const right = Number.isFinite(interval.max) ? toX(Math.min(max, interval.max)) : width - pad;
      addSvg(svg, 'line', { x1: left, y1: lineY, x2: right, y2: lineY, stroke: '#1a73e8', 'stroke-width': 5 });
      if (Number.isFinite(interval.min) && interval.min >= min && interval.min <= max) {
        addSvg(svg, 'circle', {
          cx: toX(interval.min), cy: lineY, r: 6,
          fill: interval.minClosed ? '#1a73e8' : '#fff', stroke: '#1a73e8', 'stroke-width': 2,
        });
      } else if (!Number.isFinite(interval.min)) {
        addSvg(svg, 'polygon', { points: `${pad-8},${lineY} ${pad+4},${lineY-6} ${pad+4},${lineY+6}`, fill: '#1a73e8' });
      }
      if (Number.isFinite(interval.max) && interval.max >= min && interval.max <= max) {
        addSvg(svg, 'circle', {
          cx: toX(interval.max), cy: lineY, r: 6,
          fill: interval.maxClosed ? '#1a73e8' : '#fff', stroke: '#1a73e8', 'stroke-width': 2,
        });
      } else if (!Number.isFinite(interval.max)) {
        addSvg(svg, 'polygon', { points: `${width-pad+8},${lineY} ${width-pad-4},${lineY-6} ${width-pad-4},${lineY+6}`, fill: '#1a73e8' });
      }
    });
  }

  const wrap = make('div', { marginTop: '11px', display: 'flex', justifyContent: 'center' });
  wrap.appendChild(svg);
  return wrap;
};

const uniqueValues = (pairs, index) => [...new Set(pairs.map((pair) => pair[index]))];

const mappingVisual = (visual = {}) => {
  const publicPairs = Array.isArray(visual.pairs) ? visual.pairs : [];
  const solvedPairs = Array.isArray(visual.expectedPairs) ? visual.expectedPairs : [];
  const pairSource = publicPairs.length ? publicPairs : solvedPairs;
  const domain = uniqueValues(pairSource, 0);
  const range = uniqueValues(pairSource, 1);
  const wrap = make('div', { marginTop: '11px' });

  if (publicPairs.length) {
    const given = make('div', {
      marginBottom: '7px', fontSize: '11px', color: '#5f6368', lineHeight: '1.35',
    }, `Given relation: ${publicPairs.map(([x, y]) => `(${x}, ${y})`).join(', ')}`);
    wrap.appendChild(given);
  }

  const width = 430;
  const height = Math.max(150, Math.max(domain.length, range.length, 3) * 34 + 50);
  const svg = svgNode(width, height, 'Mapping diagram workspace');
  const leftX = 115;
  const rightX = 315;
  const padY = 45;
  const row = (height - padY * 2) / Math.max(domain.length, range.length, 1);
  const yFor = (index, count) => padY + row * (index + 0.5) + (Math.max(domain.length, range.length) - count) * row / 2;

  addSvg(svg, 'ellipse', { cx: leftX, cy: height / 2, rx: 66, ry: Math.max(48, height / 2 - 22), fill: '#f7faff', stroke: '#a8b9d6', 'stroke-width': 2 });
  addSvg(svg, 'ellipse', { cx: rightX, cy: height / 2, rx: 66, ry: Math.max(48, height / 2 - 22), fill: '#faf7ff', stroke: '#baa9d6', 'stroke-width': 2 });
  addSvg(svg, 'text', { x: leftX, y: 20, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#5f6368' }, visual.domainLabel || 'Domain');
  addSvg(svg, 'text', { x: rightX, y: 20, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#5f6368' }, visual.rangeLabel || 'Range');

  domain.forEach((value, index) => {
    addSvg(svg, 'circle', { cx: leftX, cy: yFor(index, domain.length), r: 14, fill: '#fff', stroke: '#1a73e8', 'stroke-width': 1.5 });
    addSvg(svg, 'text', { x: leftX, y: yFor(index, domain.length) + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#174ea6' }, value);
  });
  range.forEach((value, index) => {
    addSvg(svg, 'circle', { cx: rightX, cy: yFor(index, range.length), r: 14, fill: '#fff', stroke: '#7b45a6', 'stroke-width': 1.5 });
    addSvg(svg, 'text', { x: rightX, y: yFor(index, range.length) + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#6f2da8' }, value);
  });

  solvedPairs.forEach(([x, y]) => {
    const from = domain.indexOf(x);
    const to = range.indexOf(y);
    if (from < 0 || to < 0) return;
    addSvg(svg, 'line', {
      x1: leftX + 16, y1: yFor(from, domain.length),
      x2: rightX - 16, y2: yFor(to, range.length),
      stroke: '#1a73e8', 'stroke-width': 2,
    });
  });

  wrap.appendChild(svg);
  return wrap;
};

const graphChoicesVisual = (visual = {}) => {
  const wrap = make('div', {
    marginTop: '11px',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '9px',
    alignItems: 'start',
  });
  (visual.graphs || []).forEach((entry) => {
    const card = make('div', { border: '1px solid #d7dce2', borderRadius: '7px', padding: '6px' });
    card.appendChild(graphVisual({ kind: 'graph', graph: entry.graph, label: entry.label }, { compact: true }));
    wrap.appendChild(card);
  });
  return wrap;
};

export const renderWorksheetVisual = (visual = {}) => {
  if (!visual || typeof visual !== 'object') return null;
  if (visual.kind === 'graph') return graphVisual(visual);
  if (visual.kind === 'blankGraph') return graphVisual(visual, { blank: true });
  if (visual.kind === 'table') return tableVisual(visual);
  if (visual.kind === 'numberLine') return numberLineVisual(visual);
  if (visual.kind === 'mapping') return mappingVisual(visual);
  if (visual.kind === 'graphChoices') return graphChoicesVisual(visual);
  return null;
};

export const SUPPORTED_WORKSHEET_VISUAL_KINDS = Object.freeze([
  'graph',
  'blankGraph',
  'table',
  'numberLine',
  'mapping',
  'graphChoices',
]);
