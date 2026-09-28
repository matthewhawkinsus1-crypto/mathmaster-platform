/** Respond to the submitted misconception without naming the right option. */
export function spatialMisconceptionFeedback(fields, responses, parts = []) {
  const wrong = fields.filter((field, index) => parts[index]?.isCorrect !== true)
    .map((field) => String(responses[field.id] || '')).join(' ').toLowerCase();
  if (/origin|\(0,\s*0,\s*0\)|all.*zero/.test(wrong)) return 'Does a statement with no variables fix any coordinate? Test whether it is true only at the origin or regardless of the coordinates.';
  if (/coincident|parallel|same plane|identical/.test(wrong)) return 'Compare the coefficient ratios and the constant ratio together. Matching directions alone do not tell you whether two planes occupy the same position.';
  if (/two|first.*second|only.*plane/.test(wrong)) return 'A system solution must satisfy all three equations simultaneously. Show the remaining plane and check whether it contains the same points.';
  if (/one|single|unique/.test(wrong)) return 'Trace what the planes share as you rotate the model. Does the shared set stop at one point, extend farther, or disappear when all three planes are considered?';
  return 'A system solution must satisfy all three equations at once. Compare what all three planes share, including any planes that are currently hidden.';
}

const EPS = 1e-9;

/** Every pair of planes, in authored order: `1-2`, `1-3`, `2-3`. */
export const planePairs = (count = 3) => {
  const pairs = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) pairs.push({ id: `${i + 1}-${j + 1}`, first: i + 1, second: j + 1 });
  }
  return pairs;
};

/**
 * How each pair of planes meets: `line`, `parallel` (parallel and distinct) or
 * `coincident`. Used only to JUDGE the relationships a student states after
 * earning their classification — never shown before they answer (#392).
 */
export function planeRelationshipTypes(forms, variables) {
  const types = {};
  for (const { id, first, second } of planePairs(forms.length)) {
    const a = forms[first - 1];
    const b = forms[second - 1];
    if (!a || !b) continue;
    const pivot = variables.find((v) => Math.abs(a.coefficients[v]) > EPS);
    const ratio = pivot ? b.coefficients[pivot] / a.coefficients[pivot] : 0;
    const proportional = Boolean(ratio) && variables.every((v) => Math.abs(b.coefficients[v] - ratio * a.coefficients[v]) < EPS);
    types[id] = !proportional ? 'line' : Math.abs(b.constant - ratio * a.constant) < EPS ? 'coincident' : 'parallel';
  }
  return types;
}

const RELATIONSHIP_TEXT = {
  line: 'meet in a line',
  parallel: 'are parallel and distinct',
  coincident: 'are coincident (same plane)',
};

export const PLANE_RELATIONSHIP_OPTIONS = Object.freeze(Object.entries(RELATIONSHIP_TEXT).map(([value, label]) => ({ value, label })));

/** Relationship sentences, for display once the student has stated them. */
export function parallelPlaneRelationships(forms, variables) {
  const types = planeRelationshipTypes(forms, variables);
  return planePairs(forms.length)
    .filter(({ id }) => types[id] === 'parallel' || types[id] === 'coincident')
    .map(({ id, first, second }) => `Planes ${first} and ${second} ${types[id] === 'coincident' ? 'are coincident' : 'are parallel and distinct'}.`);
}

export const describePlaneRelationships = (answers = {}, count = 3) => planePairs(count)
  .map(({ id, first, second }) => `Planes ${first} and ${second} ${RELATIONSHIP_TEXT[answers[id]] || '—'}.`);

/**
 * The first pair the student has wrong, with a nudge tied to the confusion
 * they showed — never the relationship itself.
 */
export function planeRelationshipFeedback(answers = {}, truth = {}) {
  const pair = planePairs(3).find(({ id }) => truth[id] && answers[id] !== truth[id]);
  if (!pair) return null;
  const chosen = answers[pair.id];
  const actual = truth[pair.id];
  const names = `Planes ${pair.first} and ${pair.second}`;
  if (!chosen) return `Decide how ${names} meet before checking.`;
  if (chosen !== 'line' && actual !== 'line') {
    return `For ${names}, compare the coefficient ratio and the constant ratio together. Matching directions alone do not tell you whether two planes occupy the same position.`;
  }
  if (chosen === 'line') {
    return `Are the x-, y- and z-coefficients of ${names} in the same ratio? Two planes with the same direction never cross along a single line.`;
  }
  return `Check the ratios of the x-, y- and z-coefficients of ${names}. Parallel or coincident planes need every coefficient in the same ratio.`;
}
