import { useEffect, useId, useState } from 'react';
import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';
import { REFERENCE_CARD_TEXT, readingFor, referenceCardFor } from './referenceCardLibrary.js';

/*
 * THE PINNED REFERENCE CARDS (WE-H; WORKED_EXAMPLES.md sections 4 and 5).
 *
 * Above the work on a Classwork or Practice question whose lesson declares a
 * card (referenceCardRule.js decides where; QuestionEngine loads this only
 * there, so a DOL, quiz or test never fetches it). Each card is the built-in
 * card for its skill (referenceCardLibrary.js): its title, each formula, and
 * its parts named in a disclosure. The disclosure starts open on a wide
 * screen and closed on a phone, so the formula stays in sight above the work
 * and the parts are one tap away.
 *
 * Read aloud and Translate read the whole card, for the student entitled to
 * them, through the same actions as every other support text
 * (SupportedText.jsx). Its Spanish is the platform's own words for the card,
 * with the same mathematics, so Translate needs no language pack for it.
 *
 * NEVER A GRADE PATH. `onShown` is called once the card is on the screen, and
 * the question records that as a fact (`referenceCardShown`,
 * supportUseMemory.js), the way it records an example it opened by itself:
 * never help asked for, never a change to a score or to independence.
 *
 * `cards` is [{ id, skill }]; one whose skill has no built-in card is not
 * shown. With none to show, nothing is drawn and `onShown` is not called.
 */
const NARROW_QUERY = '(max-width: 600px)';
const narrowScreen = () => {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
  } catch {
    return false;
  }
};

const cardStyle = {
  display: 'grid',
  gap: 8,
  minWidth: 0,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--mm-tint-border, var(--mm-border))',
  borderLeft: '4px solid var(--mm-primary-border, var(--mm-border))',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text)',
};
const formulaStyle = {
  display: 'block',
  margin: 0,
  minWidth: 0,
  maxWidth: '100%',
  overflowWrap: 'anywhere',
  lineHeight: 1.6,
};
const summaryStyle = {
  cursor: 'pointer',
  fontWeight: 800,
  color: 'var(--mm-primary-text)',
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
};

function ReferenceCard({ entry, card, openParts, readAloud, translation, onSupportEvidence }) {
  const words = REFERENCE_CARD_TEXT.en;
  const titleId = useId();
  const spanish = String(translation?.language || '').toLowerCase().startsWith('es');
  return (
    <article data-reference-card={entry.id} data-reference-card-skill={card.skill} aria-labelledby={titleId} style={cardStyle}>
      <p id={titleId} style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'baseline' }}>
        <span data-reference-card-name="" style={{ fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{words.name}</span>
        <span data-reference-card-title="" style={{ fontWeight: 800, color: 'var(--mm-text-strong, var(--mm-text))' }}>{card.title.en}</span>
      </p>
      <ul data-reference-card-formulas="" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {card.formulas.map((formula, index) => (
          <li key={`formula-${index}`} data-reference-card-formula="" style={{ minWidth: 0 }}>
            <MathText as="p" style={formulaStyle}>
              {`${formula.label.en}: $${formula.latex}$`}
            </MathText>
          </li>
        ))}
      </ul>
      <details data-reference-card-parts="" open={openParts}>
        <summary style={summaryStyle}>{words.parts}</summary>
        <dl style={{ margin: '4px 0 0', display: 'grid', gap: 6 }}>
          {card.parts.map((part, index) => (
            <div key={`part-${index}`} data-reference-card-part="" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline', minWidth: 0 }}>
              <dt style={{ fontWeight: 800, minWidth: 0 }}><MathText>{`$${part.latex}$`}</MathText></dt>
              <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}><MathText>{part.says.en}</MathText></dd>
            </div>
          ))}
        </dl>
      </details>
      <SupportedTextActions
        text={readingFor(card, 'en')}
        authored={spanish ? { text: readingFor(card, 'es') } : null}
        readAloud={readAloud}
        translation={translation}
        label={words.readLabel}
        onEvidence={onSupportEvidence}
      />
    </article>
  );
}

export default function ReferenceCards({ cards = [], readAloud = null, translation = null, onSupportEvidence = null, onShown = null }) {
  const shown = (Array.isArray(cards) ? cards : [])
    .map((entry) => ({ entry, card: referenceCardFor(entry?.skill) }))
    .filter(({ card }) => Boolean(card));
  const [openParts] = useState(() => !narrowScreen());
  const anyShown = shown.length > 0;
  useEffect(() => {
    if (anyShown) onShown?.();
  }, [anyShown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!anyShown) return null;
  const words = REFERENCE_CARD_TEXT.en;
  return (
    <section className="mathmaster-reference-cards" data-reference-cards="" aria-label={shown.length > 1 ? words.names : words.name} style={{ display: 'grid', gap: 8, minWidth: 0, textAlign: 'start' }}>
      <p data-reference-card-note="" style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 600 }}>{words.note}</p>
      {shown.map(({ entry, card }) => (
        <ReferenceCard key={entry.id} entry={entry} card={card} openParts={openParts} readAloud={readAloud} translation={translation} onSupportEvidence={onSupportEvidence} />
      ))}
    </section>
  );
}
