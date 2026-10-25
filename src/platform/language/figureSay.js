/*
 * WHAT A FIGURE SAYS, IN THE READER'S LANGUAGE (AX05).
 *
 * Read aloud read every figure in English, even under an authored Spanish
 * translation: the descriptions are generated English (graphDescription.js,
 * numberLineDescription.js). The generators already build them from a small
 * set of the platform's own sentences with the figure's numbers in them —
 * "x from −6 to 6, y from −6 to 6.", "2 lines.", "Shaded from a closed dot at
 * 3 to the right, ending in an arrow." So each sentence is kept as a message,
 * an id and its pieces, and the English is said from it. The same message is
 * said in another language from that language's own words, written for it
 * (./packs/esFigures.js) — never by translating the English, and never by a
 * machine on the device.
 *
 *   segment   a string: the item's own words (a point's label, an axis
 *             title, a caption), said as written in every language, as the
 *             screen shows them;
 *             { id, args }: a platform sentence or phrase, said with the
 *             words for `id`;
 *             { english }: platform English with no message (a tool's own
 *             sentence, an author's description), said only in English.
 *   arg       a string or a number (a value, a coordinate, a count: the same
 *             in every language), a message, or an array of args (a list,
 *             joined by the language's own rule).
 *
 * sayFigure(segments, words) is the text, or null when any piece has no
 * words in that language. A figure is said in a language completely or not
 * at all: the reader then reads its English and says so (questionReading.js).
 */

/** One message: a platform sentence or phrase and its pieces. */
export const say = (id, ...args) => ({ id, args });

/** Platform English with no message: said only in English. */
export const englishOnly = (text) => ({ english: String(text ?? '') });

const renderArg = (arg, words, english) => {
  if (Array.isArray(arg)) {
    const items = arg.map((item) => renderArg(item, words, english));
    return items.includes(null) ? null : items;
  }
  if (typeof arg === 'number' || typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object') return renderSegment(arg, words, english);
  return null;
};

function renderSegment(segment, words, english) {
  if (typeof segment === 'string') return segment;
  if (!segment || typeof segment !== 'object') return null;
  if (typeof segment.english === 'string') return english ? segment.english : null;
  const word = words?.[segment.id];
  if (typeof word !== 'function') return null;
  const args = (Array.isArray(segment.args) ? segment.args : []).map((arg) => renderArg(arg, words, english));
  if (args.includes(null)) return null;
  const text = word(...args);
  return typeof text === 'string' ? text : null;
}

/**
 * The segments said with `words`, one space between them; null when any
 * piece cannot be said in that language. `english: true` is the figure's own
 * English, where platform English with no message is said as written.
 */
export const sayFigure = (segments, words, { english = false } = {}) => {
  if (!Array.isArray(segments) || !words) return null;
  const parts = segments.map((segment) => renderSegment(segment, words, english));
  if (parts.includes(null)) return null;
  return parts.filter((part) => part !== '').join(' ');
};

/** Several pieces of one figure's reading: null if any piece has none. */
export const joinFigureSays = (...pieces) => (pieces.some((piece) => !Array.isArray(piece)) ? null : pieces.flat());

/*
 * A language's words for figures, loaded only when a reading is in that
 * language: a student who reads in English never downloads them, and none of
 * it is on the first load.
 */
const FIGURE_WORD_LOADERS = {
  es: () => import('./packs/esFigures.js'),
};
const baseLanguage = (language) => String(language || '').trim().toLowerCase().split('-')[0];

/** { language, words, label(english) } for a language, or null when there are none. */
export const loadFigureWords = (language) => {
  const loader = FIGURE_WORD_LOADERS[baseLanguage(language)];
  if (!loader) return Promise.resolve(null);
  return loader().then((module) => module.default || module);
};
