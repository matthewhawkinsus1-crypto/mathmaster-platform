import SolutionReviewPanel from '../../SolutionReviewPanel.jsx';

/*
 * A registry tool's worked solution — the one review panel
 * (src/SolutionReviewPanel.jsx) with the tool's own builder
 * (toolSolutionReview.js). Kept as an entry point for callers that render a
 * tool review directly; QuestionEngine renders SolutionReviewPanel itself.
 */
export default function ToolSolutionReview({ question, wasCorrect = false, ...supports }) {
  return <SolutionReviewPanel question={question} isToolQuestion wasCorrect={wasCorrect} {...supports} />;
}
