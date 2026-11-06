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
 *             { item }: the same, marked as the item's own words (slice 3):
 *             a description in another language marks the English words in
 *             them lang="en" (sayFigureParts, figureReadings.js describedIn);
 *             { id, args }: a platform sentence or phrase, said with the
 *             words for `id`;
 *             { english }: platform English with no message (a tool's own
 *             sentence, an author's description), said only in English;
 *             { english, say }: a tool's own sentence with its messages
 *             (slice 3): said in English as the tool says it, and in
 *             another language from the messages, which the tool says its
 *             English from, so the two cannot drift.
 *   arg       a string or a number (a value, a coordinate, a count: the same
 *             in every language), { item } (the item's own words), a message,
 *             or an array of args (a list, joined by the language's own rule).
 *
 * sayFigure(segments, words) is the text, or null when any piece has no
 * words in that language. A figure is said in a language completely or not
 * at all: the reader then reads its English and says so (questionReading.js).
 */

/** One message: a platform sentence or phrase and its pieces. */
export const say = (id, ...args) => ({ id, args });

/** Platform English with no message: said only in English. */
export const englishOnly = (text) => ({ english: String(text ?? '') });

/**
 * A tool's own sentence about what it draws, and the same sentence as
 * messages (AX05, slice 3): its English is said as the tool says it, and
 * another language says the messages with its own words.
 */
export const toolSentence = (english, segments) => ({ english: String(english ?? ''), say: Array.isArray(segments) ? segments : [] });

/**
 * The item's own words in a message (a point's label, an axis title, a task):
 * said as written in every language, and known as the item's (AX05, slice 3).
 */
export const itemWords = (text) => ({ item: String(text ?? '') });

/** The language an item's own words are written in: MathMaster's content is English. */
export const ITEM_LANGUAGE = 'en';

// `options.english`: platform English with no message is said as written.
// `options.mark`: what an item's own words are said as (sayFigureParts).
const renderArg = (arg, words, options) => {
  if (Array.isArray(arg)) {
    const items = arg.map((item) => renderArg(item, words, options));
    return items.includes(null) ? null : items;
  }
  if (typeof arg === 'number' || typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object') return renderSegment(arg, words, options);
  return null;
};

function renderSegment(segment, words, options) {
  if (typeof segment === 'string') return segment;
  if (!segment || typeof segment !== 'object') return null;
  if (typeof segment.item === 'string') return options.mark ? options.mark(segment.item) : segment.item;
  if (typeof segment.english === 'string') {
    if (options.english) return segment.english;
    // A tool's own sentence that has its messages: said from them.
    return Array.isArray(segment.say) ? renderSegments(segment.say, words, options) : null;
  }
  const word = words?.[segment.id];
  if (typeof word !== 'function') return null;
  const args = (Array.isArray(segment.args) ? segment.args : []).map((arg) => renderArg(arg, words, options));
  if (args.includes(null)) return null;
  const text = word(...args);
  return typeof text === 'string' ? text : null;
}

function renderSegments(segments, words, options) {
  const parts = segments.map((segment) => renderSegment(segment, words, options));
  if (parts.includes(null)) return null;
  return parts.filter((part) => part !== '').join(' ');
}

/**
 * The segments said with `words`, one space between them; null when any
 * piece cannot be said in that language. `english: true` is the figure's own
 * English, where platform English with no message is said as written.
 */
export const sayFigure = (segments, words, { english = false } = {}) => {
  if (!Array.isArray(segments) || !words) return null;
  return renderSegments(segments, words, { english });
};

// Where an item's own words sit in a text while it is said: two private-use
// characters around their number, which no figure's text holds.
const PLACE = /\uE000(\d+)\uE001/;
// Words, not a name: two letters in a row that are not both capitals.
// "Hours studied", "popcorn" and "Plot the point where x = 0" are English
// words; "A", "P₁" or "AB" names a point, and is said in the reader's
// language, as the mathematics is.
const holdsWords = (text) => /\p{L}\p{Ll}|\p{Ll}\p{L}/u.test(text);

/**
 * The text sayFigure gives in another language, in parts: { text }, and
 * { text, lang } for the item's own words where they hold words of the
 * item's language (slice 3), so a description can mark them and a screen
 * reader says them in that language. Null when sayFigure is. A part's `lang`
 * is only ever the item's language: the rest is the description's.
 */
export const sayFigureParts = (segments, words, { itemLanguage = ITEM_LANGUAGE } = {}) => {
  if (!Array.isArray(segments) || !words) return null;
  const items = [];
  const mark = (text) => {
    items.push(text);
    return `\uE000${items.length - 1}\uE001`;
  };
  const marked = renderSegments(segments, words, { mark });
  if (marked == null) return null;
  const parts = [];
  marked.split(PLACE).forEach((piece, index) => {
    const own = index % 2 === 1;
    const text = own ? items[Number(piece)] : piece;
    if (!text) return;
    const lang = own && holdsWords(text) ? itemLanguage : undefined;
    const last = parts[parts.length - 1];
    if (last && last.lang === lang) last.text += text;
    else parts.push(lang ? { text, lang } : { text });
  });
  return parts;
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
