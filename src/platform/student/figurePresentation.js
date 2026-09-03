/*
 * WHICH FIGURES SHOULD OPEN AT FULL SIZE.
 *
 * The three-column domain-and-range layout — domain left of the graph, range
 * right of it — only exists when the figure is enlarged, because embedded in
 * the question column there is not room for 230 + graph + 230. So the best
 * layout for the most common graph question sits behind a button most students
 * will never press, and everyone else reads that question through a 220px rail
 * with two keypads stacked in it.
 *
 * The fix is to open those questions enlarged. That is a real imposition — a
 * full-window panel a student did not ask for — so three rules hold it in
 * check:
 *
 *   IT OPENS ONLY WHERE IT PAYS. A question whose figure is already the width
 *   of the screen gains nothing and would be interrupted for no reason.
 *
 *   CLOSING IT MEANS IT. A student who closes an auto-opened figure is saying
 *   they would rather work embedded, and that answer is remembered. Re-opening
 *   it on the next question would turn a helpful default into something they
 *   have to dismiss thirteen times in one assignment.
 *
 *   IT IS NEVER THE ONLY WAY OUT. The enlarged view already closes on Escape,
 *   on the Close control, and on a backdrop click. Auto-opening adds no new way
 *   in without those staying exactly as they are.
 *
 * The policy is a pure function of the question so it can be tested without a
 * browser, and so an author can always override it per question.
 */

// Question shapes where the enlarged layout is materially better, not merely
// bigger. Each one puts response fields BESIDE the figure instead of under it.
const FULL_WIDTH_ANALYSIS_KINDS = Object.freeze(['domain', 'range']);

/*
 * WHICH TOOLS OPEN AT FULL SIZE, AND THE ONE TEST THAT DECIDES IT.
 *
 *   Does the student have to AIM at the figure to answer?
 *
 * That is the whole rule, and it sorts the tool set cleanly. Plotting a point,
 * dragging an interval endpoint, placing a transformed image — all of these are
 * precision tasks against a plane that the embedded column squeezes to a few
 * hundred pixels, which is the original complaint: a target a few pixels across.
 *
 * Reading a graph is not aiming. A student answering "what is the y-intercept"
 * looks at the figure and types; a bigger figure is nicer and a full-window
 * panel they did not ask for is an interruption. Those tools keep the Enlarge
 * button and do not open themselves.
 *
 * A TOOL ONLY QUALIFIES ONCE ITS ENLARGED VIEW CARRIES ITS CONTROLS. The
 * enlarged view is a modal. A tool that wraps only its plane leaves the Check
 * button and the task list behind the backdrop, so opening it automatically
 * would drop the student into a dead end they have to close before they can
 * answer. Every id below wraps its whole split.
 */
const AIMING_TOOLS = Object.freeze([
  'graphing2',
  'transformations',
  'intervalNumberLine',
]);

const list = (value) => (Array.isArray(value) ? value : []);

const analysisKinds = (question = {}) => list(question.analysisRequests)
  .map((request) => String(request?.kind || '').trim())
  .filter(Boolean);

/**
 * A domain-and-range question: two notation answers read off one graph.
 *
 * This is the shape the three-column layout was written for, and the shape
 * whose embedded rail carries two permanently open keypads.
 */
export const isDomainRangeQuestion = (question = {}) => {
  const kinds = analysisKinds(question);
  if (kinds.length !== 2) return false;
  return FULL_WIDTH_ANALYSIS_KINDS.every((kind) => kinds.includes(kind));
};

/**
 * Whether this figure should open enlarged.
 *
 * `viewportWidth` gates it because the enlarged layout only reshapes itself at
 * 1050px and above; below that the panel would be a full-window interruption
 * showing the same single column the student already had.
 */
export const isAimingTool = (toolId) => AIMING_TOOLS.includes(String(toolId || ''));

export const shouldOpenFigureEnlarged = ({
  question = {},
  toolId = '',
  viewportWidth = 0,
  dismissed = false,
  minimumWidth = 1050,
} = {}) => {
  // An author's explicit choice outranks everything, in both directions.
  if (question?.presentEnlarged === false) return false;
  if (dismissed) return false;
  if (!(Number(viewportWidth) >= minimumWidth)) return false;
  if (question?.presentEnlarged === true) return true;
  return isAimingTool(toolId) || isDomainRangeQuestion(question);
};

/**
 * Where a student's "I would rather work embedded" is remembered.
 *
 * Keyed by shape rather than by question: the answer to "do I want the big
 * panel for domain-and-range questions" is the same on the second one as on the
 * first, and asking again each time is the behaviour this is meant to avoid.
 */
export const figureDismissalKey = (question = {}, toolId = '') => {
  if (question?.presentEnlarged === true) return 'mm.figure.enlarged.authored';
  if (isAimingTool(toolId)) return `mm.figure.enlarged.${toolId}`;
  return isDomainRangeQuestion(question) ? 'mm.figure.enlarged.domainRange' : null;
};

export default shouldOpenFigureEnlarged;
