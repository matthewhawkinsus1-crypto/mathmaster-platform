// Turning what a tool collected into what the server grades.
//
// The Path Tool Contract (functions/shared/pathToolContracts.mjs) defines the
// raw shape each tool's grader expects. The interactive tools in the registry
// already hand back exactly that shape — `{ arrows, domain, range, isFunction }`
// from the mapping diagram, `{ intervals, notation }` from the number line —
// so for those there is nothing to translate.
//
// The older grader components report a QuestionEngine `answerState` instead:
// per-part labels, correctness and the student's response. Correctness in there
// is the browser's opinion and is thrown away. Only the RESPONSES are read, and
// this file is what reads them.
//
// If a tool is added to the contract and not here, `buildRawPathResponse`
// returns null and the caller must refuse to submit rather than send something
// the server will grade as wrong.

const responseOf = (parts, id) => parts.find((part) => part.id === id)?.response;

const parseJson = (value) => {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const parseOrderedPair = (value) => {
  const text = String(value ?? '').trim().replace(/^[([]/, '').replace(/[)\]]$/, '');
  const [left, right] = text.split(',');
  const x = Number(left);
  const y = Number(right);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const BUILDERS = {
  algebra: ({ parts, responseKey }) => ({ value: String(responseOf(parts, 'x') ?? responseKey ?? '') }),

  system: ({ parts, responseKey }) => {
    const pair = parseOrderedPair(responseKey);
    return {
      ...(pair || {}),
      value: String(responseKey ?? ''),
      // SystemGrader collects the point; a classification only exists when some
      // other tool collected one.
      ...(responseOf(parts, 'classification') !== undefined
        ? { classification: String(responseOf(parts, 'classification')) }
        : {}),
    };
  },

  // The workspace ends on an equation, and that equation is the answer.
  stepAlgebra: ({ parts }) => ({ finalEquation: String(responseOf(parts, 'algebra-objective') ?? '') }),

  multiAnswer: ({ parts }) => ({
    responses: Object.fromEntries(parts.map((part) => [part.id, part.response ?? ''])),
  }),

  // The graphing workspace stores its whole state in the response key, which is
  // literally `JSON.stringify({ construction, analysis })`.
  functionInvestigation: ({ responseKey }) => {
    const state = parseJson(responseKey);
    if (!state) return null;
    return {
      placements: state.construction?.placements || {},
      markerPlacements: state.construction?.markerPlacements || {},
      answers: state.analysis?.answers || {},
      selections: state.analysis?.selections || {},
    };
  },
};

/**
 * The student's raw work, in the shape this tool's server grader expects.
 *
 * Returns null when the tool has no translation here — the caller must treat
 * that as "cannot submit securely", never as "submit something".
 */
export const buildRawPathResponse = ({ pathToolId, answerState }) => {
  const build = BUILDERS[pathToolId];
  if (!build) return null;
  return build({
    parts: Array.isArray(answerState?.parts) ? answerState.parts : [],
    responseKey: answerState?.responseKey ?? '',
  });
};

export const hasRawResponseBuilder = (pathToolId) => Boolean(BUILDERS[pathToolId]);

/**
 * The question object a tool renders from, rebuilt out of the public payload.
 *
 * `pathToolId` is the tool's own authoring type, so this is the ordinary
 * question shape with the answer fields simply absent.
 */
export const questionFromToolPayload = (toolPayload) => (
  toolPayload?.pathToolId
    ? { type: toolPayload.pathToolId, ...(toolPayload.tool || {}) }
    : null
);

export default buildRawPathResponse;

// Exported so a test can check that the shapes these build are the shapes the
// server graders accept. A renderer sending `{answers}` to a grader validating
// `{responses}` rejects every submission, and the student is told their
// perfectly good answer was "not in the shape this question expects".
export const PATH_TOOL_RESPONSE_BUILDERS = BUILDERS;
