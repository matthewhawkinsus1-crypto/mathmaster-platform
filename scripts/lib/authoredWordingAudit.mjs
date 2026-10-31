/*
 * THE AUTHORED-WORDING AUDIT (CT17; the findings VH-14 and VH-35 of the
 * accessibility review).
 *
 * Two things in the VPAT were marked "not audited" because nothing could say:
 *
 *   1.3.3 Sensory Characteristics   Does an authored question point at a figure by
 *                                   its colour alone ("the red line")?
 *   3.1.2 Language of Parts         Does an authored English field hold a passage in
 *                                   another language that nothing marks?
 *
 * This reads every string in the authored content (the lesson imports, the
 * assignment documents and the question banks) and counts both. It only
 * reports: it never edits a file, and it reads no stored library.
 *
 * WHAT IS "MARKED". The platform has one way to carry another language: an
 * item's `translations` map ({ es: { prompt, hints, solutionReview } }), which the
 * student's screen shows with `lang` set to the key (src/platform/supports/
 * SupportedText.jsx, src/platform/language/authoredTranslation.js). Text under a
 * `translations` key is marked. Any other string is the item's own English, so a
 * passage in Spanish (or in another script) there is unmarked: a screen reader
 * reads it with English pronunciation. An inline `lang` has no authored
 * markup to carry it, so the way to mark a passage is to move it into a translation.
 *
 * WHAT IS A COLOUR-ONLY REFERENCE. A colour word that names which part of a
 * figure to look at: "the red line", "the blue and the green curves", "points
 * drawn in orange". A student who cannot tell the colours apart has nothing else
 * to go by. A colour that is a property of what a word problem counts ("7 red
 * markers and 5 blue markers") is data, and is counted apart so the two are not
 * confused. Shape and position references ("the round button", "the graph on
 * the left") are listed as judgement: they may be fine where the same thing
 * is also said another way.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Where authored content lives: the lesson imports, assignment documents and shipped banks. */
export const AUTHORED_CONTENT_SOURCES = Object.freeze([
  'teacher-import-jsons',
  'docs/assignments',
  'functions/seeds',
  'drafts/district-dol2',
]);

/* ------------------------------------------------------------------ reading text */

/** The words of a string: its mathematics ($…$, \(…\), \[…\]) and its {{placeholders}} taken out. */
export const proseOf = (value) => String(value ?? '')
  .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ')
  .replace(/\{\{[^}]*\}\}/g, ' ');

const wordsOf = (text) => text.toLowerCase().match(/\p{L}+/gu) || [];
const all = (pattern, text) => [...String(text).matchAll(pattern)].map((match) => match[0].replace(/\s+/g, ' ').trim());

/* ------------------------------------------------------------ colour and sensory */

const COLOURS = 'red|blue|green|orange|purple|yellow|pink|black|white|gray|grey|brown|teal|violet|gold|silver|magenta|cyan|crimson|maroon|navy|indigo';
// The parts of a figure a student is told to look at. Not the things a word problem counts
// (marbles, tiles, beads, markers, cards, spinner sections, "the red ones"), which are data.
const FIGURE_PARTS = 'lines?|curves?|graphs?|points?|dots?|bars?|regions?|areas?|segments?|arrows?|rays?|parabolas?|circles?|triangles?|squares?|rectangles?|shapes?|polygons?|functions?|paths?|plots?|columns?|buttons?|icons?|labels?|angles?|vertex|vertices|sides?|edges?|figures?|diagrams?|slices?';
const DETERMINER = 'the|this|that|each|both|these|those';
const MARKING_VERBS = 'shown|drawn|marked|colou?red|plotted|graphed|highlighted|shaded|labell?ed|printed|written|displayed|circled|underlined';

const COLOUR_AS_REFERENCE = [
  // "the red line", "the dashed red line", "the red dashed line", "each blue curve"
  new RegExp(`\\b(?:${DETERMINER})\\s+(?:[\\w-]+\\s+)?(?:${COLOURS})\\s+(?:[\\w-]+\\s+)?(?:${FIGURE_PARTS})\\b`, 'gi'),
  // "the red and the blue lines", "both the red and blue curves"
  new RegExp(`\\b(?:${DETERMINER})\\s+(?:${COLOURS})\\s+(?:and|or)\\s+(?:the\\s+)?(?:${COLOURS})\\s+(?:${FIGURE_PARTS})\\b`, 'gi'),
  // "points drawn in red", "the region shaded in green"
  new RegExp(`\\b(?:${MARKING_VERBS})\\s+(?:in|with)\\s+(?:${COLOURS})\\b`, 'gi'),
];
const COLOUR_WORD = new RegExp(`\\b(?:${COLOURS})\\b`, 'i');

const SHAPE_ONLY = new RegExp(`\\b(?:${DETERMINER})\\s+(?:round|circular|square|triangular|star|heart|diamond)(?:-shaped)?\\s+(?:button|icon|marker|symbol|point|dot|key|handle)\\b`, 'gi');
const FIGURE_NOUN = 'graph|figure|table|diagram|picture|chart|plot|image|panel';
const POSITION_ONLY = [
  new RegExp(`\\b(?:${DETERMINER})\\s+(?:${FIGURE_NOUN})s?\\s+(?:on|to|at)\\s+the\\s+(?:left|right|top|bottom)\\b`, 'gi'),
  new RegExp(`\\b(?:${DETERMINER})\\s+(?:left|right|top|bottom)(?:-hand)?\\s+(?:${FIGURE_NOUN})\\b`, 'gi'),
];

/* --------------------------------------------------------------------- language */

// Letters of scripts the platform has no language pack for. Greek is mathematics (π, θ, Δ), and Latin
// letters with accents are told apart below by what the word is.
const OTHER_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Bengali}\p{Script=Tamil}]+/gu;

// Spanish words that are not English words, so one of them in a sentence is a signal and two are a language.
const SPANISH_WORDS = new Set((
  'el la los las del una unos unas para por con pero sus esta este estos estas cuál cuáles cuánto cuántos cuántas qué cómo dónde cuándo '
  + 'resuelve encuentra calcula escribe dibuja determina explica completa elige selecciona grafica simplifica '
  + 'ecuación ecuaciones función funciones gráfica tabla número números respuesta pregunta triángulo círculo ángulo '
  + 'cada entre sobre tiene tienen hay también porque desde hasta más menos igual cuando donde'
).split(' '));
const ENGLISH_WORDS = new Set('the a an of and to in is are for with that this which what how on at by it as be or if from not your you each find solve write'.split(' '));
export const SPANISH_PUNCTUATION = /[¿¡]/;

/**
 * Spanish in a piece of prose: the Spanish-only words it uses (two distinct ones, and more of
 * them than English function words), or a Spanish question or exclamation mark.
 */
export const spanishEvidence = (prose) => {
  if (SPANISH_PUNCTUATION.test(prose)) return [prose.match(SPANISH_PUNCTUATION)[0]];
  const words = wordsOf(prose);
  const spanish = words.filter((word) => SPANISH_WORDS.has(word));
  const english = words.filter((word) => ENGLISH_WORDS.has(word));
  return new Set(spanish).size >= 2 && spanish.length > english.length ? [...new Set(spanish)] : [];
};

// English words that are written with an accent (loanwords and names), which are not a passage in another language.
const ACCENTED_ENGLISH = new Set(['café', 'cafés', 'résumé', 'naïve', 'fiancé', 'fiancée', 'pólya', 'erdős', 'gödel', 'poincaré', 'möbius']);

/** The words that use a Latin letter beyond ASCII (é, ñ, ü), minus the English ones above. × and ÷ are not letters. */
export const accentedWords = (prose) => (String(prose).match(/\p{L}+/gu) || [])
  .filter((word) => /[À-ɏ]/u.test(word))
  .filter((word) => !ACCENTED_ENGLISH.has(word.toLowerCase()));

/* --------------------------------------------------------------------- the classes */

/**
 * Each class: where it looks (`prose` = the words, math taken out), `find(prose)` → the snippets
 * that show it, and whether it is a defect (`certain`) or a prompt for a person to look (`certain: false`).
 */
export const AUDIT_CLASSES = Object.freeze([
  {
    id: 'colourOnlyReference',
    label: 'a colour that names the part of a figure to look at ("the red line", "points drawn in blue")',
    source: 'CT17 VH-14 (WCAG 1.3.3, 1.4.1)',
    certain: true,
    find: (prose) => COLOUR_AS_REFERENCE.flatMap((pattern) => all(pattern, prose)),
  },
  {
    id: 'shapeOnlyReference',
    label: 'a shape that names a control or mark ("the round button"); may be fine where it is also named another way',
    source: 'CT17 VH-14 (WCAG 1.3.3)',
    certain: false,
    find: (prose) => all(SHAPE_ONLY, prose),
  },
  {
    id: 'positionOnlyReference',
    label: 'a position that names a figure ("the graph on the left"); may be fine where it is also named another way',
    source: 'CT17 VH-14 (WCAG 1.3.3)',
    certain: false,
    find: (prose) => POSITION_ONLY.flatMap((pattern) => all(pattern, prose)),
  },
  {
    id: 'otherScript',
    label: 'a passage in a script the platform has no language for (Chinese, Cyrillic, Arabic, …) outside a translation',
    source: 'CT17 VH-35 (WCAG 3.1.2)',
    certain: true,
    find: (prose) => all(OTHER_SCRIPT, prose),
  },
  {
    id: 'spanishPassage',
    label: 'Spanish in an English field, outside a translation',
    source: 'CT17 VH-35 (WCAG 3.1.2)',
    certain: true,
    find: (prose) => spanishEvidence(prose),
  },
  {
    id: 'accentedWord',
    label: 'a word with an accent or other mark beyond ASCII that is not a known English loanword or name; may be another language',
    source: 'CT17 VH-35 (WCAG 3.1.2)',
    certain: false,
    find: accentedWords,
  },
]);

// The classes that read the words of another language, which a translation's own text is allowed to hold.
const LANGUAGE_CLASSES = Object.freeze(['otherScript', 'spanishPassage', 'accentedWord']);

/** What `colourAsData` counts: a colour word in a string that is not a colour-only reference. */
export const COLOUR_AS_DATA = Object.freeze({
  id: 'colourAsData',
  label: 'a colour that is a property of what a word problem counts ("7 red markers"); not a reference to a figure',
  information: true,
});

/** The snippets of every class in one authored string: { classId: [snippet, …] }. */
export const findWordingProblems = (value) => {
  const prose = proseOf(value);
  const out = {};
  for (const auditClass of AUDIT_CLASSES) {
    const hits = auditClass.find(prose);
    if (hits.length) out[auditClass.id] = hits;
  }
  if (!out.colourOnlyReference && COLOUR_WORD.test(prose)) out[COLOUR_AS_DATA.id] = [prose.match(COLOUR_WORD)[0]];
  return out;
};

/* ------------------------------------------------------------------- the content */

/**
 * Every string of a parsed document: [{ path, text, marked }]. `marked` is true under a
 * `translations` key, whose text is shown with its language set.
 */
export const stringsOf = (document) => {
  const found = [];
  const visit = (value, where, marked) => {
    if (typeof value === 'string') found.push({ path: where, text: value, marked });
    else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${where}[${index}]`, marked));
    else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => visit(entry, `${where}.${key}`, marked || key === 'translations'));
    }
  };
  visit(document, '', false);
  return found;
};

/** Every .json file under `target` (a file or a folder). */
export const jsonFilesUnder = (target) => {
  if (!statSync(target, { throwIfNoEntry: false })) return [];
  if (statSync(target).isFile()) return target.endsWith('.json') ? [target] : [];
  return readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => jsonFilesUnder(path.join(target, entry.name)))
    .sort();
};

/** Findings of a list of strings (see stringsOf): [{ classId, snippet, path, text }]. A marked string may hold another language. */
export const auditStrings = (strings) => strings.flatMap(({ path: where, text, marked }) => (
  Object.entries(findWordingProblems(text))
    .filter(([classId]) => !(marked && LANGUAGE_CLASSES.includes(classId)))
    .map(([classId, snippets]) => ({ classId, snippet: snippets[0], path: where, text }))
));

/**
 * Audits every .json file under `targets` (paths, relative to `root` unless absolute). Per class: the
 * strings that show it, the files they are in, and every finding with its place.
 */
export const auditContent = ({ root = REPO, targets = AUTHORED_CONTENT_SOURCES } = {}) => {
  const classes = Object.fromEntries([...AUDIT_CLASSES, COLOUR_AS_DATA].map((auditClass) => [
    auditClass.id,
    {
      id: auditClass.id,
      label: auditClass.label,
      source: auditClass.source || 'CT17',
      certain: auditClass.certain ?? false,
      information: Boolean(auditClass.information),
      strings: 0,
      files: new Set(),
      findings: [],
    },
  ]));
  let files = 0;
  let strings = 0;
  let markedStrings = 0;
  for (const target of targets) {
    for (const file of jsonFilesUnder(path.isAbsolute(target) ? target : path.join(root, target))) {
      let document;
      try { document = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
      files += 1;
      const found = stringsOf(document);
      strings += found.length;
      markedStrings += found.filter((entry) => entry.marked).length;
      const relative = path.relative(root, file);
      for (const finding of auditStrings(found)) {
        const entry = classes[finding.classId];
        entry.strings += 1;
        entry.files.add(relative);
        entry.findings.push({ file: relative, ...finding });
      }
    }
  }
  return { files, strings, markedStrings, classes };
};
