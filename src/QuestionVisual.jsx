import GraphDisplay from './GraphDisplay';
import MathDisplay from './MathDisplay';

export default function QuestionVisual({ question, includeGraph = true }) {
  const visual = question?.visual;
  const graph = question?.graph || (visual?.type === 'graph' ? visual : null);
  const mathSpec = question?.mathDisplay || question?.supportingMath;

  return (
    <>
      {mathSpec && (
        <div
          style={{
            fontSize: '26px',
            color: '#1a73e8',
            background: '#f8f9fa',
            borderRadius: '10px',
            padding: '16px 20px',
            margin: '22px auto',
            width: 'fit-content',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <MathDisplay
            value={typeof mathSpec === 'string' ? mathSpec : mathSpec.value}
            format={typeof mathSpec === 'string' ? 'auto' : mathSpec.format || 'auto'}
            ariaLabel={
              typeof mathSpec === 'string'
                ? 'Supporting mathematical expression'
                : mathSpec.ariaLabel || 'Supporting mathematical expression'
            }
          />
        </div>
      )}
      {includeGraph && graph && (
        <GraphDisplay graph={graph} title={question?.graphTitle || 'Question graph'} />
      )}
    </>
  );
}
