/*
 * HOW A REGISTRY TOOL'S HINTS REACH THE PLATFORM'S ONE LADDER
 * (student pass 3, HELP-10).
 *
 * A tool's hints follow what is on screen — its mode, its stage — so only the
 * tool can say what they are. Inside a question the tool no longer shows them
 * itself: each mounted HintPanel PUBLISHES its rungs here, and QuestionEngine
 * puts them into the platform ladder (questionHints.js), where the release
 * rule (one more hint per attempt) and the leak guard apply to them. A panel
 * that unmounts withdraws its rungs, as a stage the student has left should.
 *
 *   const channel = createToolHintChannel((hints) => …);
 *   const withdraw = channel.publish(['first rung', 'second rung']);
 *   withdraw();
 *
 * `onChange` hears the rungs of every mounted panel, in the order the panels
 * published, without repeats — and only when that list changes, so a tool
 * re-rendering with the same rungs does not re-render the question.
 *
 * React-free so the rule can be tested in node.
 */
const clean = (value) => String(value ?? '').trim();

/** A tool's rungs as plain text; anything that is not text is not a rung. */
export const publishableHints = (hints) => (Array.isArray(hints) ? hints : [])
  .map((hint) => (typeof hint === 'string' ? clean(hint) : ''))
  .filter(Boolean);

export const createToolHintChannel = (onChange = null) => {
  let nextToken = 1;
  let published = [];
  let last = '';
  const merged = () => {
    const seen = new Set();
    return published.flatMap((entry) => entry.hints).filter((hint) => {
      const key = hint.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const notify = () => {
    const hints = merged();
    const key = JSON.stringify(hints);
    if (key === last) return;
    last = key;
    if (typeof onChange === 'function') onChange(hints);
  };
  return Object.freeze({
    /** A mounted panel's rungs; returns the function that withdraws them. */
    publish(hints) {
      const token = nextToken;
      nextToken += 1;
      published = [...published, { token, hints: publishableHints(hints) }];
      notify();
      return () => {
        published = published.filter((entry) => entry.token !== token);
        notify();
      };
    },
    /** Every mounted panel's rungs, merged. */
    current: merged,
  });
};

export default createToolHintChannel;
