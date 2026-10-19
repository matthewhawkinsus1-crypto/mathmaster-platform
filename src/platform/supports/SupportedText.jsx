import { useEffect, useState } from 'react';
import MathText from '../../components/common/MathText.jsx';
import { speakAloud } from '../language/speechText.js';
import {
  LANGUAGE_NAMES, resolveTranslation, resolveTranslationNow, TRANSLATION_COVERAGE, TRANSLATION_GAP,
} from '../language/translationProviders.js';

/*
 * READ ALOUD AND TRANSLATE FOR WHAT MATHMASTER SAYS BACK.
 *
 * The prompt already has both (the work bar's Read button, the Support tools
 * tray). Feedback, hints and the worked solution are text the student did not
 * have before the attempt, so a student entitled to Read aloud or Translate
 * gets the same two actions beside each of them — and only that student:
 *
 *   readAloud    { language } when Read aloud is offered (entitled AND the
 *                browser can speak), else null
 *   translation  { language } when Translate is entitled, else null
 *   onEvidence   (supportId, eventType, details) — 'text-to-speech' /
 *                'translation' 'used', recorded like the prompt's own use;
 *                'translation' 'unavailable' when this text has none
 *
 * A student with neither sees the text and nothing else.
 *
 * TRANSLATE IS NEVER A DEAD BUTTON (pass 3, HELP-3). The translation is looked
 * up as soon as the text is shown (translationProviders.js: the student's own
 * language pack, loaded only for a student entitled to Translate). Translate
 * appears only when it will show the text in the student's language; when it
 * cannot, the student is told so in one plain line instead — "Translate isn't
 * available in Vietnamese yet" (no language pack), or "No Spanish translation
 * for this text yet" (a sentence the pack does not know, such as a hint a
 * teacher wrote). The mathematics is carried through untouched either way.
 */
const shortLanguageName = (code) => {
  const name = LANGUAGE_NAMES[String(code || '').toLowerCase().split('-')[0]];
  return name ? name.replace(/\s*\(.*\)\s*$/, '') : String(code || '').toUpperCase();
};

/** What the student is told when a text cannot be translated. */
export const translationUnavailableMessage = ({ language, reason } = {}) => {
  const name = shortLanguageName(language);
  if (reason === TRANSLATION_GAP.NO_PACK) return `Translate isn’t available in ${name} yet.`;
  if (reason === TRANSLATION_GAP.LOAD_FAILED) return `${name} could not load right now, so this stays in English.`;
  return `No ${name} translation for this text yet.`;
};

/*
 * The evidence a support text records when it cannot be translated: only the
 * fields firestore.rules evidenceDetailsValid accepts (its `surface` list names
 * screens, not this text, so none is sent).
 */
export const translationUnavailableDetails = ({ language, reason } = {}) => ({
  language: String(language || '').slice(0, 12),
  reason: String(reason || TRANSLATION_GAP.NO_RESOURCE).slice(0, 48),
});

const usableTranslation = (result) => Boolean(result?.text)
  && [TRANSLATION_COVERAGE.FULL, TRANSLATION_COVERAGE.PARTIAL].includes(result.coverage);

// 44px: a student's control like any other (it was 32, under the platform's
// minimum, wherever a worked solution, hint or feedback carried it).
const actionStyle = {
  minHeight: 44,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontSize: 'calc(13 * var(--mm-px))',
  fontWeight: 800,
  cursor: 'pointer',
};

export const SupportedTextActions = ({ text, readAloud = null, translation = null, onEvidence = null, label = 'this' }) => {
  const language = translation?.language || null;
  // The translation of THIS text in THIS language, looked up once it is shown.
  const lookupKey = `${language || ''}|${text || ''}`;
  // Known at once when the student's pack is already loaded (or there is no
  // pack for the language); otherwise looked up below.
  const [lookup, setLookup] = useState(() => (language && text ? { key: lookupKey, result: resolveTranslationNow({ text, language }) } : null));
  const [showTranslated, setShowTranslated] = useState(false);
  useEffect(() => {
    setShowTranslated(false);
    if (!language || !text) return undefined;
    let alive = true;
    const settle = (result) => {
      if (!alive) return;
      setLookup({ key: lookupKey, result });
      if (!usableTranslation(result) && result?.coverage !== TRANSLATION_COVERAGE.NOT_APPLICABLE) {
        onEvidence?.('translation', 'unavailable', translationUnavailableDetails({ language, reason: result?.reason }));
      }
    };
    const now = resolveTranslationNow({ text, language });
    if (now) settle(now);
    else resolveTranslation({ text, language }).then(settle);
    return () => { alive = false; };
  }, [lookupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!text || (!readAloud && !translation)) return null;
  const result = lookup?.key === lookupKey ? lookup.result : null;
  const translated = translation && usableTranslation(result) ? result : null;
  // Only mathematics: nothing to translate, and nothing to say about it.
  const nothingToTranslate = result?.coverage === TRANSLATION_COVERAGE.NOT_APPLICABLE;
  const unavailable = translation && result && !translated && !nothingToTranslate;
  const shown = showTranslated && translated;
  const read = () => {
    const spoken = shown ? translated.text : text;
    const spokenLanguage = shown ? language : (readAloud.language || 'en');
    if (speakAloud(spoken, { language: spokenLanguage })) onEvidence?.('text-to-speech', 'used');
  };
  const toggleTranslation = () => {
    if (!translated) return;
    if (!showTranslated) onEvidence?.('translation', 'used');
    setShowTranslated((current) => !current);
  };
  if (!readAloud && !translated && !unavailable) return null;
  return (
    <span data-supported-text-actions="" style={{ display: 'block', marginTop: 8 }}>
      <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {readAloud && (
          <button type="button" style={actionStyle} onClick={read} aria-label={`Read ${label} aloud`}>
            <span aria-hidden="true">🔊</span> Read
          </button>
        )}
        {translated && (
          <button type="button" style={actionStyle} onClick={toggleTranslation} aria-pressed={Boolean(shown)} aria-label={`Translate ${label}`} data-translate-ready="">
            {shown ? 'Show English' : 'Translate'}
          </button>
        )}
        {unavailable && (
          <span data-translation-unavailable={result.reason || ''} style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 600 }}>
            {translationUnavailableMessage({ language, reason: result.reason })}
          </span>
        )}
      </span>
      {shown && (
        <span lang={language} data-translated-text="" style={{ display: 'block', marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-surface-tint)', color: 'var(--mm-text)', fontWeight: 600 }}>
          <MathText>{translated.text}</MathText>
          {translated.coverage === TRANSLATION_COVERAGE.PARTIAL && (
            <span lang="en" style={{ display: 'block', marginTop: 4, color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 600 }}>
              Some sentences are still in English.
            </span>
          )}
        </span>
      )}
    </span>
  );
};

export default SupportedTextActions;
