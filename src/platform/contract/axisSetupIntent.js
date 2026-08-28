const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const axisQuantityChoicesFromIntent = (question = {}, axis = {}) => {
  const x = isObject(axis.x) ? axis.x : {};
  const y = isObject(axis.y) ? axis.y : {};
  return asArray(question.quantities).map((quantity) => {
    if (!isObject(quantity)) return quantity;
    if (quantity.id === question.correctIndependentId) {
      return {
        ...quantity,
        label: clean(x.label) || quantity.label,
        unit: clean(x.unit || quantity.unit),
      };
    }
    if (quantity.id === question.correctDependentId) {
      return {
        ...quantity,
        label: clean(y.label) || quantity.label,
        unit: clean(y.unit || quantity.unit),
      };
    }
    return quantity;
  });
};

export const blankAxisGraphFromIntent = ({
  question = {},
  functionSpec = null,
  tableInfo = null,
  evaluateFunction = null,
} = {}) => {
  const authored = isObject(question.graph) ? question.graph : {};
  const domain = isObject(functionSpec?.domain) ? functionSpec.domain : {};
  const xValues = asArray(tableInfo?.xValues)
    .map(finiteNumber)
    .filter((value) => value !== null);

  let xMin = finiteNumber(authored.xMin);
  let xMax = finiteNumber(authored.xMax);
  if (xMin === null) xMin = finiteNumber(domain.min);
  if (xMax === null) xMax = finiteNumber(domain.max);
  if (xMin === null && xValues.length) xMin = Math.min(...xValues);
  if (xMax === null && xValues.length) xMax = Math.max(...xValues);
  if (xMin === null) xMin = 0;
  if (xMax === null) xMax = xMin + 10;
  if (xMax <= xMin) xMax = xMin + 1;

  const sampleXs = xValues.length ? xValues : [xMin, xMax];
  const yValues = typeof evaluateFunction === 'function' && isObject(functionSpec)
    ? sampleXs.map((x) => evaluateFunction(functionSpec, x)).filter((value) => Number.isFinite(value))
    : [];

  let yMin = finiteNumber(authored.yMin);
  let yMax = finiteNumber(authored.yMax);
  if (yMin === null && yValues.length) yMin = Math.min(...yValues);
  if (yMax === null && yValues.length) yMax = Math.max(...yValues);
  if (yMin === null) yMin = 0;
  if (yMax === null) yMax = yMin + 10;
  if (yMin >= 0) yMin = 0;
  if (yMax <= yMin) yMax = yMin + 1;

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    axisDisplay: {
      showAxisTitles: true,
      showAxisSymbols: true,
      showXTickLabels: false,
      showYTickLabels: false,
    },
  };
};

export const axisExpectedOptions = (primary, alternatives) => {
  const values = [primary, ...asArray(alternatives)]
    .map((value) => clean(value))
    .filter(Boolean);
  return [...new Set(values)];
};
