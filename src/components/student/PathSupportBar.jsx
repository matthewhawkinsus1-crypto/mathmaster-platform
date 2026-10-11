import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';
import { speakAloud, speechTextFor } from '../../platform/language/speechText.js';
import { pathDeliveryFact, toolsEntitlementFromPath } from '../../platform/language/supportToolsEntitlement.js';
import { StudentSupportTray } from './StudentSupportTools.jsx';

// The supports a student is entitled to, on the Path, actually rendered.
//
// WHAT THIS FIXES. The Path's primary renderer read no support presentation at
// all. A student authorized for text-to-speech, large text, high contrast or a
// reduced-clutter view got none of them the moment they left the assignment
// screen and opened My Math Path — the accommodation simply stopped existing.
//
// It also closes the telemetry hole. "Presented" must mean the control was on
// the screen, not that the profile contained the word. This component is what
// knows the difference, so it reports what it actually rendered and what the
// student actually pressed, and the server intersects that with the authorized
// set before believing any of it.

/**
 * Speak text that a human would recognise as mathematics — the one reader the
 * assignment's Read button uses too (platform/language/speechText.js).
 * Re-exported under its long-standing name.
 */
export { speechTextFor };

const speak = (text) => speakAloud(text, { language: 'en' });

const BUTTON = {
  minHeight: 40, padding: '8px 13px', borderRadius: 999,
  border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)',
  fontWeight: 800, fontSize: 13, cursor: 'pointer',
};

/**
 * Presentation styles a support turns on.
 *
 * Returned rather than applied globally so the Path card can carry them: a
 * student with large text needs the MATHEMATICS to grow, not just the page
 * chrome around it.
 */
export const supportPresentationStyle = (active = []) => {
  const on = new Set(active);
  const style = {};
  if (on.has(SUPPORT.LARGE_TEXT)) {
    style.fontSize = '1.18em';
    style.lineHeight = 1.7;
  }
  if (on.has(SUPPORT.HIGH_CONTRAST)) {
    style.background = '#000';
    style.color = '#fff';
    style.borderColor = '#fff';
  }
  return style;
};

export default function PathSupportBar({
  // Which supports the SERVER said apply to this question. The client renders
  // from this list and never from a profile it read itself — that is what stops
  // a browser from showing itself an accommodation nobody authorized.
  applicableSupports = [],
  // What should be read aloud: prompt, context and the choices, in the order a
  // student would meet them.
  speechText = '',
  questionInstanceId = '',
  onDelivery = null,
  disabled = false,
  // The language Support tools (translation, vocabulary, Break it down, Help
  // me say it) use the same tray as assignments, from the same server list.
  prompt = '',
  toolType = '',
  supportLanguage = null,
  // The player's pathUniversalDesignRole: 'practice' adds the universal
  // Vocabulary and Read aloud; null (the default) adds nothing.
  universalDesignRole = null,
}) {
  const applicable = useMemo(
    () => (Array.isArray(applicableSupports) ? applicableSupports : []),
    [applicableSupports],
  );
  const [used, setUsed] = useState([]);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);
  // What the language tray actually showed for this question (canonical ids).
  const [trayPresented, setTrayPresented] = useState([]);
  const deliveryRef = useRef(onDelivery);
  deliveryRef.current = onDelivery;

  // A new question is a fresh delivery record.
  useEffect(() => { setUsed([]); setTtsUnavailable(false); setTrayPresented([]); }, [questionInstanceId]);

  const languageTools = useMemo(
    () => toolsEntitlementFromPath({ applicableSupports: applicable, translationLanguage: supportLanguage, activityRole: universalDesignRole }),
    [applicable, supportLanguage, universalDesignRole],
  );
  // The tray reports each tool's state and each first use; on the Path those
  // facts travel with the attempt, where the server intersects them with what
  // it authorized (supportEntitlements.mjs reconcileSupportDelivery).
  const onTrayEvidence = useCallback((record) => {
    const fact = pathDeliveryFact(record, applicable);
    if (!fact) return;
    const add = (current) => (current.includes(fact.supportId) ? current : [...current, fact.supportId]);
    if (fact.field === 'presented') setTrayPresented(add);
    else setUsed(add);
  }, [applicable]);

  const speechAvailable = typeof window !== 'undefined' && Boolean(window.speechSynthesis);
  const wantsTts = applicable.includes(SUPPORT.TEXT_TO_SPEECH);

  // PRESENTED is what this component actually put on the screen. A
  // text-to-speech entitlement on a browser with no speech synthesis is
  // authorized, applicable, and NOT presented — and saying so is the whole
  // point: an administrator needs to find that, not have it papered over.
  const presented = useMemo(() => applicable.filter((supportId) => {
    if (supportId === SUPPORT.TEXT_TO_SPEECH) return speechAvailable && Boolean(speechText);
    // Language tools: only what the tray actually showed for this question.
    if (trayPresented.includes(supportId)) return true;
    // Presentation supports are applied to the card itself below.
    return [SUPPORT.LARGE_TEXT, SUPPORT.HIGH_CONTRAST, SUPPORT.DECLUTTER, SUPPORT.VISUAL_CHUNKING]
      .includes(supportId);
  }), [applicable, speechAvailable, speechText, trayPresented]);

  useEffect(() => {
    deliveryRef.current?.({ presented, used });
  }, [presented, used]);

  const markUsed = (supportId) => setUsed((current) => (
    current.includes(supportId) ? current : [...current, supportId]
  ));

  // Nothing authorized and nothing universal: no bar at all.
  if (!applicable.length && !languageTools.tools.length) return null;

  const tray = languageTools.tools.length ? (
    <StudentSupportTray
      entitlement={languageTools}
      prompt={prompt}
      toolType={toolType}
      surface="path"
      itemKey={questionInstanceId}
      // The bar's own "Read this to me" reads the whole card, choices included,
      // for a student entitled to text-to-speech; everyone else's universal
      // Read aloud is the tray's.
      includeReadAloud={!wantsTts}
      onEvidence={onTrayEvidence}
    />
  ) : null;

  return (
    <>
    <div
      role="group"
      aria-label="Your learning supports"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}
    >
      {wantsTts && speechAvailable && Boolean(speechText) && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const spoke = speak(speechText);
            if (spoke) markUsed(SUPPORT.TEXT_TO_SPEECH);
            else setTtsUnavailable(true);
          }}
          style={BUTTON}
        >
          <span aria-hidden="true">🔊</span> Read this to me
        </button>
      )}

      {wantsTts && speechAvailable && (
        <button
          type="button"
          onClick={() => window.speechSynthesis.cancel()}
          style={{ ...BUTTON, borderColor: 'var(--mm-border)', color: 'var(--mm-text-muted)' }}
        >
          Stop reading
        </button>
      )}

      {/* Said plainly rather than hidden. A support that could not be delivered
          is information the student and the teacher both need. */}
      {wantsTts && (!speechAvailable || ttsUnavailable) && (
        <span role="status" style={{ fontSize: 12, color: 'var(--mm-warning-text)', fontWeight: 700 }}>
          Read-aloud is not working in this browser. Your teacher can see this.
        </span>
      )}
    </div>
    {tray && <div style={{ marginBottom: 12 }}>{tray}</div>}
    </>
  );
}
