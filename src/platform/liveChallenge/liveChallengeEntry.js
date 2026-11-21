import { typedEntryNotice } from '../../../functions/shared/typedEntryGuard.mjs';

/*
 * WHEN A LIVE CHALLENGE ANSWER MAY BE LOCKED IN (#557, #558).
 *
 * The round is graded by My Math Path's field comparison, which refuses an
 * entry left unfinished (`12 +`, `4*`) or longer than an answer may be
 * (functions/shared/typedEntryGuard.mjs). A lock-in cannot be taken back, so
 * the box must say so first: locked in unseen, `12 +` for a field keyed 12
 * lost the round with nothing on the screen to say why.
 *
 * `kind` is how LiveChallengeFieldQuestion draws the field: 'choice' is never
 * typed, 'text' is a box of words (read for its length only, as My Math
 * Path's is: pathResponseEntry.js), 'math' is the math editor. The keys are
 * not on the device, so none is consulted. A lock-in is the round's one
 * answer, not a try: the sentence names no try.
 */
export const liveChallengeEntryProblem = (kind, value) => {
  if (kind === 'choice') return '';
  const message = typedEntryNotice(value, { words: kind === 'text', tries: false });
  return message ? `${message} It cannot be locked in as it is.` : '';
};

/** Every field answered, with an entry that can be locked in. `fields` are `{ id, kind }`. */
export const liveChallengeResponseComplete = (fields = [], responses = {}) => fields.length > 0
  && fields.every(({ id, kind }) => String(responses[id] ?? '').trim() !== '' && !liveChallengeEntryProblem(kind, responses[id]));
