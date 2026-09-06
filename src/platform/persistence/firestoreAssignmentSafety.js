const FIRESTORE_COORDINATE_LIST_KEYS = new Set([
  'xIntercepts',
  'points',
  'pairs',
  'orderedPairs',
  'relation',
  'sourcePoints',
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

/**
 * Firestore rejects an array that directly contains another array. Assignment
 * authoring commonly expresses coordinate lists as [[x, y], ...], however, so
 * repair only fields whose contract is explicitly point-list shaped. Unknown
 * nested arrays are intentionally left untouched for Preflight to block rather
 * than guessing at table/matrix semantics.
 */
export const repairKnownFirestoreNestedArrays = (input) => {
  const repairedPaths = [];

  const visit = (value, path = '$', parentKey = null) => {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (FIRESTORE_COORDINATE_LIST_KEYS.has(parentKey) && isCoordinatePair(item)) {
          repairedPaths.push(itemPath);
          return { x: item[0], y: item[1] };
        }
        return visit(item, itemPath, null);
      });
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => (
        [key, visit(item, childPath(path, key), key)]
      )));
    }

    return value;
  };

  return {
    value: visit(input),
    repairedPaths,
    repairCount: repairedPaths.length,
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
