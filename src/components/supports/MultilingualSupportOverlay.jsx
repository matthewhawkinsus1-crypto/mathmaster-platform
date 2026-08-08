import { useState } from 'react';

/*
 * Phase 4 — Emergent Bilingual language support.
 *
 * Translates the *prompt wording* only. Mathematical expressions, numbers and
 * symbols are never passed through translation, because changing them would
 * change the item being assessed rather than making it accessible.
 */

const MATH_GLOSSARY_ES = {
  slope: { termEs: 'Pendiente', def: 'La inclinación de una línea (cambio en y sobre cambio en x).' },
  'y-intercept': { termEs: 'Intersección en y', def: 'El punto donde la gráfica cruza el eje y.' },
  'x-intercept': { termEs: 'Intersección en x', def: 'El punto donde la gráfica cruza el eje x.' },
  'system of equations': { termEs: 'Sistema de ecuaciones', def: 'Dos o más ecuaciones con las mismas variables.' },
  domain: { termEs: 'Dominio', def: 'El conjunto de todos los valores de entrada posibles (x).' },
  range: { termEs: 'Rango', def: 'El conjunto de todos los valores de salida posibles (y).' },
  function: { termEs: 'Función', def: 'Una relación donde cada entrada tiene exactamente una salida.' },
  vertex: { termEs: 'Vértice', def: 'El punto más alto o más bajo de una parábola.' },
  coefficient: { termEs: 'Coeficiente', def: 'El número que multiplica a una variable.' },
  expression: { termEs: 'Expresión', def: 'Números y variables combinados con operaciones, sin signo igual.' },
};

export default function MultilingualSupportOverlay({
  englishText,
  spanishTranslationText,
  enabled,
  telemetryLogger,
  glossaryEnabled = true,
}) {
  const [showSpanish, setShowSpanish] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState(null);

  if (!enabled) return null;

  const toggleTranslation = () => {
    const next = !showSpanish;
    setShowSpanish(next);
    if (next) telemetryLogger?.logUsed?.('spanishTranslation', { action: 'toggle_on' });
  };

  const openGlossaryTerm = (termKey) => {
    const entry = MATH_GLOSSARY_ES[termKey.toLowerCase()];
    if (!entry) return;
    setSelectedTerm({ key: termKey, ...entry });
    telemetryLogger?.logUsed?.('glossaryLookup', { term: termKey });
  };

  // Only offer glossary chips for terms that actually appear in this prompt.
  const relevantTerms = glossaryEnabled
    ? Object.keys(MATH_GLOSSARY_ES).filter((term) => String(englishText || '').toLowerCase().includes(term))
    : [];

  return (
    <div style={{ marginBottom: '12px', textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
        {spanishTranslationText && (
          <button
            type="button"
            onClick={toggleTranslation}
            aria-pressed={showSpanish}
            style={{
              minHeight: '38px', padding: '0 12px', fontSize: '13px', borderRadius: '999px',
              border: '1px solid var(--mm-primary, #1a73e8)',
              background: showSpanish ? 'var(--mm-primary-soft, #e8f0fe)' : '#fff',
              color: 'var(--mm-primary, #1a73e8)', cursor: 'pointer', fontWeight: 700,
            }}
          >
            🌐 {showSpanish ? 'Show in English' : 'Traducir al Español'}
          </button>
        )}
        {relevantTerms.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => openGlossaryTerm(term)}
            style={{
              minHeight: '38px', padding: '0 10px', fontSize: '12px', borderRadius: '999px',
              border: '1px dashed var(--mm-success, #188038)', background: '#fff',
              color: 'var(--mm-success-text, #137333)', cursor: 'pointer', fontWeight: 700,
            }}
          >
            📖 {term}
          </button>
        ))}
      </div>

      <div style={{ fontSize: '15px', lineHeight: 1.55, color: 'var(--mm-ink, #202124)' }}>
        {showSpanish && spanishTranslationText ? (
          <div style={{ background: 'var(--mm-surface-sunken, #f8f9fa)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--mm-primary, #1a73e8)' }}>
            <span style={{ fontSize: '11px', color: 'var(--mm-primary, #1a73e8)', fontWeight: 900, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Español · traducción de apoyo
            </span>
            {spanishTranslationText}
          </div>
        ) : (
          <div>{englishText}</div>
        )}
      </div>

      {selectedTerm && (
        <div
          role="note"
          style={{ marginTop: '10px', padding: '12px 14px', background: 'var(--mm-success-soft, #e6f4ea)', borderRadius: '8px', border: '1px solid #ceebe1', fontSize: '13px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontWeight: 900, color: 'var(--mm-success-text, #137333)' }}>
            <span>📖 {selectedTerm.key} · {selectedTerm.termEs}</span>
            <button type="button" onClick={() => setSelectedTerm(null)} aria-label="Close glossary" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px' }}>✕</button>
          </div>
          <div style={{ marginTop: '5px', color: 'var(--mm-ink, #202124)' }}>{selectedTerm.def}</div>
        </div>
      )}
    </div>
  );
}
