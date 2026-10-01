/*
 * Grading declaration for the `literalWorkspace` question surface: a `literal`
 * question that asked to be solved on the balance (`workspace: true`,
 * `solveOnBalance: true` or `presentation: 'workspace'`).
 *
 * Before this surface existed the server regraded such a question as a typed
 * literal answer and marked every correct workspace solve WRONG (the final
 * equation `\frac{A}{b} = h|{}` is not the expression `A/b`). Now:
 *
 *   workspace   QuestionEngine opens StepByStepAlgebra on the question
 *               buildLiteralWorkspaceQuestion builds. The work is the Step
 *               Algebra work shape (toolId `literalWorkspace`), graded by the
 *               same shared grader on the same built question: the letter
 *               isolated, and the isolated side equivalent to the original
 *               formula.
 *   answerBox   the workspace could not be built (no formula with one equals
 *               sign, no `solveFor`), so QuestionEngine shows LiteralGrader
 *               with a notice. That answer is an ordinary literal answer and
 *               is graded by the ordinary literal grader against
 *               `acceptedAnswers`.
 *
 * The mode is decided here with a parser-free check (a field holding `=` and
 * a letter to solve for); the grader rebuilds the workspace question and falls
 * back to the answer box exactly when QuestionEngine does.
 *
 * Light: declarations only. The grader is ../../questionGraders/literalWorkspace.mjs.
 */
import { serverGradingSupport as ordinaryServerGradingSupport } from '../../../ordinaryResponseGrading.mjs';
import { declareQuestionGrader } from '../../surfaceDeclarations.mjs';
import { literalWorkspaceLooksBuildable } from '../../stepAlgebraRouting.mjs';

const NO_KEY = 'A literal question that asked for the balance but whose formula or `solveFor` cannot be read is shown '
  + 'in the typed LiteralGrader instead; that answer is graded by the ordinary literal grader, which compares it with '
  + '`acceptedAnswers`. With no `acceptedAnswers` the server has no key for the typed answer, so the device verdict is '
  + 'kept (sanitized and attempt-bounded).';

export const resolveLiteralWorkspaceMode = (question = {}) => (literalWorkspaceLooksBuildable(question) ? 'workspace' : 'answerBox');

export default declareQuestionGrader({
  graderVersion: 'literal-workspace-v1',
  supports: (question) => {
    const mode = resolveLiteralWorkspaceMode(question);
    if (mode === 'workspace') return { supported: true, mode };
    const ordinary = ordinaryServerGradingSupport(question);
    return ordinary.supported
      ? { supported: true, mode }
      : { supported: false, reason: ordinary.reason || 'no-answer-key', mode, blocker: NO_KEY };
  },
  blocker: NO_KEY,
});
