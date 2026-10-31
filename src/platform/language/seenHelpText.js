/*
 * THE HELP A STUDENT HAS SEEN, AS TEXT (AX43).
 *
 * The Vocabulary tool found its words in the prompt only, so a student who
 * opened a hint that said "negative reciprocal" or read feedback that said
 * "slope" could not look those words up. Vocabulary now also lists the words in
 * the hints and the feedback on the student's screen.
 *
 * ONLY WHAT IS ON THEIR SCREEN. A hint that has not been revealed is not help
 * the student has seen: the ladder holds the next rungs, and a word in one of
 * them would hand over what the hint is saving (and, for a hint they never ask
 * for, a word the tool had no business offering). So this takes the ladder with
 * the count that is revealed and reads that many, never the rest; and the
 * caller passes feedback only where the screen shows it (an assessment shows
 * none until the teacher releases it).
 *
 * Pure: no React.
 */

// Enough for every hint and message a question shows; a cap, not a limit anyone meets.
const MAX_CHARACTERS = 4000;

const textOf = (entry) => (typeof entry === 'string' ? entry : typeof entry?.text === 'string' ? entry.text : '');

/**
 * `hints` is the whole ladder, `revealed` how many of its first rungs the
 * student has opened. `diagnosis` is "What might have gone wrong", once asked
 * for; `feedback` the outcome words on screen (a string or a list of them).
 */
export const seenHelpText = ({ hints = [], revealed = 0, diagnosis = '', feedback = [] } = {}) => {
  const count = Math.max(0, Math.floor(Number(revealed) || 0));
  const revealedHints = (Array.isArray(hints) ? hints : []).slice(0, count).map(textOf);
  const feedbackLines = (Array.isArray(feedback) ? feedback : [feedback]).map(textOf);
  return [...revealedHints, textOf(diagnosis), ...feedbackLines]
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_CHARACTERS);
};
