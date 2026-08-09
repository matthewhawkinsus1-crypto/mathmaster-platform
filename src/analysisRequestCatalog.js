// The legal values for `analysisRequests[].kind` and `[].feature`, in one place.
//
// These lists exist because an AI author guessed. Asked to fix a lesson, it
// rewrote `"kind": "positive"` — which was correct — as `"kind": "point"`, and
// the renderer's fallback branch turned each part into a click-a-point task
// labelled "point" with zero valid points and a "Does not exist" button. The
// question shipped, rendered, and could not be answered.
//
// Nothing had told the model which strings were legal, and nothing rejected an
// illegal one. Both are fixed by generating the contract text and the validator
// from this file, so the list a model is given is the list the renderer honours.

// Kinds answered by typing an interval or an inequality.
export const NOTATION_ANALYSIS_KINDS = Object.freeze([
  'domain', 'range', 'increasing', 'decreasing', 'constant', 'positive', 'negative',
]);

// Named features answered by clicking the graph, typing coordinates, or both.
// Each needs `"kind": "point"` plus a `feature` from this list.
export const POINT_FEATURES = Object.freeze([
  'xIntercepts', 'yIntercept', 'vertex', 'localMaximum', 'localMinimum', 'center',
]);

export const ANALYSIS_KINDS = Object.freeze([...NOTATION_ANALYSIS_KINDS, 'point']);

export const ANALYSIS_NOTATIONS = Object.freeze(['interval', 'inequality', 'set']);

export const isNotationKind = (kind) => NOTATION_ANALYSIS_KINDS.includes(String(kind));

/**
 * Validate one analysis request. Returns a list of human-readable problems,
 * each naming the field and the values that would have worked, so the message
 * can be pasted straight back to the model that produced the JSON.
 */
export const validateAnalysisRequest = (request, { label = 'analysisRequests entry' } = {}) => {
  const errors = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return [`${label} must be an object`];
  }

  const kind = String(request.kind ?? '');
  if (!kind) {
    errors.push(`${label} needs a \`kind\` (${ANALYSIS_KINDS.join(', ')})`);
  } else if (!ANALYSIS_KINDS.includes(kind)) {
    errors.push(`${label} has kind "${kind}", which is not a value MathMaster renders. Use one of: ${ANALYSIS_KINDS.join(', ')}`);
  }

  // The single most damaging mistake: "point" without a feature renders an
  // empty click target that no student can satisfy.
  if (kind === 'point') {
    const feature = String(request.feature ?? '');
    if (!feature) {
      errors.push(`${label} uses kind "point", which also needs a \`feature\`: ${POINT_FEATURES.join(', ')}. To ask where a function is positive or negative, use kind "positive" or "negative" instead`);
    } else if (!POINT_FEATURES.includes(feature)) {
      errors.push(`${label} has feature "${feature}", which MathMaster cannot locate. Use one of: ${POINT_FEATURES.join(', ')}`);
    }
  }

  if (request.notation !== undefined && !ANALYSIS_NOTATIONS.includes(String(request.notation))) {
    errors.push(`${label} has notation "${request.notation}". Use one of: ${ANALYSIS_NOTATIONS.join(', ')}`);
  }

  return errors;
};

export const validateAnalysisRequests = (requests) => {
  if (!Array.isArray(requests) || !requests.length) return [];
  return requests.flatMap((request, index) => validateAnalysisRequest(request, {
    label: `analysisRequests[${index}]${request?.id ? ` ("${request.id}")` : ''}`,
  }));
};
