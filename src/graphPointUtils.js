/**
 * MathMaster static-graph point contract.
 *
 * Authoring JSON may use the human-friendly Firestore-safe shape:
 *   { x: 2, y: 5, label: 'A' }
 *
 * Canonical runtime graph JSON stores the coordinate pair inside an object:
 *   { coordinates: [2, 5], label: 'A' }
 *
 * Legacy in-memory callers may still provide [2, 5]. We accept it at render
 * time, but the V5 compiler converts it before persistence so Firestore never
 * receives an array directly inside graph.points (nested arrays are invalid).
 */
export const readGraphPointCoordinates = (point) => {
  let raw = null;
  if (Array.isArray(point)) raw = point;
  else if (point && typeof point === 'object' && Array.isArray(point.coordinates)) raw = point.coordinates;
  else if (point && typeof point === 'object' && ('x' in point || 'y' in point)) raw = [point.x, point.y];

  if (!Array.isArray(raw) || raw.length < 2) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

export const normalizeGraphPointForRuntime = (point) => {
  const coordinates = readGraphPointCoordinates(point);
  if (!coordinates) return point;

  if (Array.isArray(point)) return { coordinates };

  const out = { ...point, coordinates };
  delete out.x;
  delete out.y;
  return out;
};

export const normalizeStaticGraphPoints = (graph) => {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return graph;
  if (!Array.isArray(graph.points)) return graph;
  return {
    ...graph,
    points: graph.points.map(normalizeGraphPointForRuntime),
  };
};

export const validateGraphPoint = (point, { label = 'point' } = {}) => {
  const coordinates = readGraphPointCoordinates(point);
  if (coordinates) return [];
  return [
    `${label} must use {x, y} or {coordinates:[x,y]} with two finite numeric coordinates. ` +
    'V5 authors should prefer the Firestore-safe {x,y} form.',
  ];
};
