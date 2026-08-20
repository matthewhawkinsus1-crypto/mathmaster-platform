import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';

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
 * Speak text that a human would recognise as mathematics.
 *
 * Reading raw LaTeX aloud produces "backslash frac brace 3 brace brace 4"
 * which is worse than silence. This is not a full MathML reader — it turns the
 * notation this platform actually authors into spoken English and leaves the
 * rest alone.
 */
export const speechTextFor = (raw) => {
  let text = String(raw || '');
  if (!text.trim()) return '';
  text = text
    .replace(/\$\$?/g, ' ')
    .replace(/\\dfrac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, ' $1 over $2 ')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, ' $1 over $2 ')
    .replace(/\\sqrt\[3\]\s*\{([^{}]+)\}/g, ' the cube root of $1 ')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, ' the square root of $1 ')
    .replace(/\\log_\{?(\w+)\}?/g, ' log base $1 of ')
    .replace(/\^\{?\(?-1\)?\}?/g, ' inverse ')
    .replace(/\^\{?2\}?/g, ' squared ')
    .replace(/\^\{?3\}?/g, ' cubed ')
    .replace(/\^\{([^{}]+)\}/g, ' to the power $1 ')
    .replace(/\^(-?\d+)/g, ' to the power $1 ')
    .replace(/\\le\b|<=/g, ' is less than or equal to ')
    .replace(/\\ge\b|>=/g, ' is greater than or equal to ')
    .replace(/\\ne\b|!=/g, ' is not equal to ')
    .replace(/\\pm\b/g, ' plus or minus ')
    .replace(/\\infty/g, ' infinity ')
    .replace(/\\cdot|\\times/g, ' times ')
    .replace(/\\div/g, ' divided by ')
    .replace(/\\left|\\right/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\|([^|]+)\|/g, ' the absolute value of $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
};

const speak = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  const spoken = speechTextFor(text);
  if (!spoken) return false;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(spoken));
  return true;
};

const BUTTON = {
  minHeight: 40, padding: '8px 13px', borderRadius: 999,
  border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6',
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
}) {
  const applicable = useMemo(
    () => (Array.isArray(applicableSupports) ? applicableSupports : []),
    [applicableSupports],
  );
  const [used, setUsed] = useState([]);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);
  const deliveryRef = useRef(onDelivery);
  deliveryRef.current = onDelivery;

  // A new question is a fresh delivery record.
  useEffect(() => { setUsed([]); setTtsUnavailable(false); }, [questionInstanceId]);

  const speechAvailable = typeof window !== 'undefined' && Boolean(window.speechSynthesis);
  const wantsTts = applicable.includes(SUPPORT.TEXT_TO_SPEECH);

  // PRESENTED is what this component actually put on the screen. A
  // text-to-speech entitlement on a browser with no speech synthesis is
  // authorized, applicable, and NOT presented — and saying so is the whole
  // point: an administrator needs to find that, not have it papered over.
  const presented = useMemo(() => applicable.filter((supportId) => {
    if (supportId === SUPPORT.TEXT_TO_SPEECH) return speechAvailable && Boolean(speechText);
    // Presentation supports are applied to the card itself below.
    return [SUPPORT.LARGE_TEXT, SUPPORT.HIGH_CONTRAST, SUPPORT.DECLUTTER, SUPPORT.VISUAL_CHUNKING]
      .includes(supportId);
  }), [applicable, speechAvailable, speechText]);

  useEffect(() => {
    deliveryRef.current?.({ presented, used });
  }, [presented, used]);

  const markUsed = (supportId) => setUsed((current) => (
    current.includes(supportId) ? current : [...current, supportId]
  ));

  if (!applicable.length) return null;

  return (
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
          style={{ ...BUTTON, borderColor: '#dadce0', color: '#5f6368' }}
        >
          Stop reading
        </button>
      )}

      {/* Said plainly rather than hidden. A support that could not be delivered
          is information the student and the teacher both need. */}
      {wantsTts && (!speechAvailable || ttsUnavailable) && (
        <span role="status" style={{ fontSize: 12, color: '#7a4f00', fontWeight: 700 }}>
          Read-aloud is not working in this browser. Your teacher can see this.
        </span>
      )}
    </div>
  );
}
