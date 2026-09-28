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

/** Relationship labels are displayed only beside an earned algebraic result. */
export function parallelPlaneRelationships(forms, variables) {
  const descriptions = [];
  for (let i = 0; i < forms.length; i += 1) {
    for (let j = i + 1; j < forms.length; j += 1) {
      const a = forms[i]; const b = forms[j];
      if (!a || !b) continue;
      const pivot = variables.find((v) => Math.abs(a.coefficients[v]) > 1e-9);
      if (!pivot) continue;
      const ratio = b.coefficients[pivot] / a.coefficients[pivot];
      if (!ratio || !variables.every((v) => Math.abs(b.coefficients[v] - ratio * a.coefficients[v]) < 1e-9)) continue;
      const coincident = Math.abs(b.constant - ratio * a.constant) < 1e-9;
      descriptions.push(`Planes ${i + 1} and ${j + 1} are ${coincident ? 'coincident' : 'parallel and distinct'}.`);
    }
  }
  return descriptions;
}
