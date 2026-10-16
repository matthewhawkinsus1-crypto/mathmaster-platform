const FIRESTORE_COORDINATE_LIST_KEYS = new Set([
  'xIntercepts',
  'points',
  'pairs',
  'orderedPairs',
  'relation',
  'sourcePoints',
  'sourceData',
  'givenPoints',
  'dataPoints',
  'intercepts',
  'vertices',
  'endpoints',
]);

const isPlainScalar = (value) => (
  !Array.isArray(value)
  && (value == null || typeof value !== 'object')
);

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isCoordinatePair = (value) => (
  Array.isArray(value)
  && value.length === 2
  && value.every(isPlainScalar)
);

const childPath = (path, key) => (
  /^[A-Za-z_$][\w$]*$/.test(String(key))
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(String(key))}]`
);

const isScalarRow = (value) => Array.isArray(value) && value.every(isPlainScalar);

/*
 * A MATRIX ROW IS A KNOWN SHAPE TOO. The Matrix Lab's contract names its
 * matrices — `matrices: { A: { rows: [[2, -1, -2], …] } }` — and a starting
 * matrix — `startFrom: { A: [[…], …] }` — so a row there is not a guess at
 * table semantics: it becomes `{ cells: [...] }`, the row shape the Systems
 * Workspace's 3×4 matrices already store and every matrix reader accepts.
 * `ancestors` is the key path from the root, so only those two places match.
 */
const isMatrixRowList = (ancestors) => {
  const [grand, parent, key] = [null, null, ...ancestors].slice(-3);
  return (grand === 'matrices' && key === 'rows' && parent != null) || (parent === 'startFrom' && key === 'A');
};

/**
 * Firestore rejects an array that directly contains another array. Assignment
 * authoring commonly expresses coordinate lists as [[x, y], ...], however, so
 * repair only fields whose contract is explicitly point-list shaped, and the
 * Matrix Lab's matrix rows. Unknown nested arrays are intentionally left
 * untouched for Preflight to block rather than guessing at table semantics.
 */
export const repairKnownFirestoreNestedArrays = (input) => {
  const repairedPaths = [];
  // Matrix rows are the Matrix Lab's own storage shape, not a repair of an
  // authoring mistake, so they are reported apart from the coordinate pairs
  // (and Pre-Flight does not warn about them).
  const matrixRowPaths = [];

  const visit = (value, path = '$', parentKey = null, ancestors = []) => {
    if (Array.isArray(value)) {
      const matrixRows = isMatrixRowList(ancestors);
      return value.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (FIRESTORE_COORDINATE_LIST_KEYS.has(parentKey) && isCoordinatePair(item)) {
          repairedPaths.push(itemPath);
          return { x: item[0], y: item[1] };
        }
        if (matrixRows && isScalarRow(item)) {
          matrixRowPaths.push(itemPath);
          return { cells: item };
        }
        return visit(item, itemPath, null, [...ancestors, null]);
      });
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => (
        [key, visit(item, childPath(path, key), key, [...ancestors, key])]
      )));
    }

    return value;
  };

  return {
    value: visit(input),
    repairedPaths,
    repairCount: repairedPaths.length,
    matrixRowPaths,
  };
};

/**
 * Return every Firestore-illegal direct nested-array path. This is deliberately
 * generic so a future authoring shape cannot slip past Preflight merely because
 * it was not anticipated by the auto-repair list above.
 */
export const findFirestoreUnsafeNestedArrays = (input) => {
  const paths = [];

  const visit = (value, path = '$') => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (Array.isArray(item)) paths.push(itemPath);
        visit(item, itemPath);
      });
      return;
    }

    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, item]) => {
        visit(item, childPath(path, key));
      });
    }
  };

  visit(input);
  return paths;
};
