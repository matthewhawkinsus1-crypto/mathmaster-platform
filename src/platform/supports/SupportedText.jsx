import { useEffect, useRef, useState } from 'react';
import MathText from '../../components/common/MathText.jsx';
import { speakAloud } from '../language/speechText.js';
import { resolveTranslation, TRANSLATION_COVERAGE } from '../language/translationProviders.js';

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
 *   onEvidence   (supportId, eventType) — 'text-to-speech' / 'translation'
 *                'used', recorded like the prompt's own use
 *
 * A student with neither sees the text and nothing else.
 */
const actionStyle = {
  minHeight: 32,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
};

export const SupportedTextActions = ({ text, readAloud = null, translation = null, onEvidence = null, label = 'this' }) => {
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const textRef = useRef(text);
  useEffect(() => {
    // A new message is a new translation request.
    if (textRef.current !== text) {
      textRef.current = text;
      setTranslated(null);
    }
  }, [text]);
  if (!text || (!readAloud && !translation)) return null;
  const read = () => {
    const spoken = translated?.text || text;
    const language = translated?.text ? translation.language : (readAloud.language || 'en');
    if (speakAloud(spoken, { language })) onEvidence?.('text-to-speech', 'used');
  };
  const translate = async () => {
    if (translating) return;
    if (translated) {
      setTranslated(null);
      return;
    }
    setTranslating(true);
    try {
      const result = await resolveTranslation({ text, language: translation.language });
      const usable = result?.text && [TRANSLATION_COVERAGE.FULL, TRANSLATION_COVERAGE.PARTIAL].includes(result.coverage);
      setTranslated(usable ? { text: result.text } : { text: null, unavailable: true });
      if (usable) onEvidence?.('translation', 'used');
    } finally {
      setTranslating(false);
    }
  };
  return (
    <span data-supported-text-actions="" style={{ display: 'block', marginTop: 8 }}>
      <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
        {readAloud && (
          <button type="button" style={actionStyle} onClick={read} aria-label={`Read ${label} aloud`}>
            <span aria-hidden="true">🔊</span> Read
          </button>
        )}
        {translation && (
          <button type="button" style={actionStyle} onClick={translate} aria-pressed={Boolean(translated?.text)} aria-label={`Translate ${label}`}>
            {translating ? 'Translating…' : translated?.text ? 'Show English' : 'Translate'}
          </button>
        )}
      </span>
      {translated?.text && (
        <span lang={translation.language} style={{ display: 'block', marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-surface-tint)', color: 'var(--mm-text)', fontWeight: 600 }}>
          <MathText>{translated.text}</MathText>
        </span>
      )}
      {translated?.unavailable && (
        <span role="status" style={{ display: 'block', marginTop: 6, color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 600 }}>
          A translation is not available for this text yet.
        </span>
      )}
    </span>
  );
};

export default SupportedTextActions;
