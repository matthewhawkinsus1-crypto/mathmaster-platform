import React, { useEffect, useRef, useState } from 'react';
import QuestionPrompt from '../../QuestionPrompt';
import './MathToolMobileLayout.css';

const NUMERIC_SELECTOR = 'input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"], input[data-mathmaster-mobile-keypad="true"]';
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '.'];
const detectMobile = () => typeof window !== 'undefined' && (window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches === true);
const detectLandscape = () => detectMobile() && window.innerWidth > window.innerHeight && window.innerHeight <= 500;

const setReactInputValue = (element, value) => {
  if (!element) return;
  const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
  const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set : null;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

export const MobileViewportContainer = ({
  promptText,
  contextPanel = null,
  toolWorkspace,
  actionButtons = null,
  responseFields = null,
}) => {
  const rootRef = useRef(null);
  const [isPromptCollapsed, setIsPromptCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [isLandscape, setIsLandscape] = useState(detectLandscape);
  const [numericTarget, setNumericTarget] = useState(null);

  useEffect(() => {
    const updateViewportMode = () => {
      const mobile = detectMobile();
      setIsMobile(mobile);
      setIsLandscape(detectLandscape());
    };
    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    window.addEventListener('orientationchange', updateViewportMode);
    window.visualViewport?.addEventListener('resize', updateViewportMode);
    return () => {
      window.removeEventListener('resize', updateViewportMode);
      window.removeEventListener('orientationchange', updateViewportMode);
      window.visualViewport?.removeEventListener('resize', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isMobile) return undefined;
    const originals = new Map();
    const prepareNumericInputs = (scope) => {
      const candidates = [
        ...(scope?.matches?.(NUMERIC_SELECTOR) ? [scope] : []),
        ...(scope?.querySelectorAll?.(NUMERIC_SELECTOR) || []),
      ];
      candidates.forEach((input) => {
        if (!originals.has(input)) originals.set(input, input.getAttribute('inputmode'));
        input.setAttribute('inputmode', 'none');
        input.setAttribute('data-mathmaster-mobile-keypad', 'true');
      });
    };
    prepareNumericInputs(root);
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => (
      [...mutation.addedNodes].forEach((node) => node.nodeType === 1 && prepareNumericInputs(node))
    )));
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      originals.forEach((inputMode, input) => {
        if (!input?.isConnected) return;
        if (inputMode === null) input.removeAttribute('inputmode');
        else input.setAttribute('inputmode', inputMode);
        input.removeAttribute('data-mathmaster-mobile-keypad');
      });
    };
  }, [isMobile]);

  const handleFocusCapture = (event) => {
    if (!isMobile) return;
    const target = event.target;
    if (target?.matches?.(NUMERIC_SELECTOR)) setNumericTarget(target);
  };

  const applyKey = (key) => {
    if (!numericTarget?.isConnected) {
      setNumericTarget(null);
      return;
    }
    const current = String(numericTarget.value ?? '');
    if (key === 'clear') setReactInputValue(numericTarget, '');
    else if (key === 'backspace') setReactInputValue(numericTarget, current.slice(0, -1));
    else if (key === '±') {
      if (!current) setReactInputValue(numericTarget, '0');
      else setReactInputValue(numericTarget, current.startsWith('-') ? current.slice(1) : `-${current}`);
    } else if (key === '.' && current.includes('.')) return;
    else setReactInputValue(numericTarget, `${current}${key}`);
    numericTarget.focus({ preventScroll: true });
  };

  const numericKeypad = isMobile && numericTarget ? (
    <div className="mathmaster-mobile-numeric-keypad" role="group" aria-label="Number keypad">
      <div className="mathmaster-mobile-keypad-grid">
        {KEYS.map((key) => <button key={key} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyKey(key)}>{key}</button>)}
      </div>
      <div className="mathmaster-mobile-keypad-actions">
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyKey('backspace')}>⌫</button>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyKey('clear')}>Clear</button>
        <button type="button" className="mathmaster-keypad-done" onClick={() => { numericTarget.blur(); setNumericTarget(null); }}>Done</button>
      </div>
    </div>
  ) : null;

  if (!isMobile) {
    return <div ref={rootRef} className="mathmaster-desktop-question-content" onFocusCapture={handleFocusCapture}>{contextPanel}{responseFields}{toolWorkspace}{actionButtons}</div>;
  }

  return (
    <div ref={rootRef} onFocusCapture={handleFocusCapture} className={`mathmaster-question-container ${isLandscape ? 'mode-landscape' : 'mode-portrait'} ${numericTarget ? 'numeric-keypad-open' : ''}`}>
      <section className="question-prompt-panel" aria-label="Question prompt and response controls">
        <div className="question-prompt-heading">
          <span>QUESTION</span>
          {!isLandscape && <button type="button" onClick={() => setIsPromptCollapsed((current) => !current)}>{isPromptCollapsed ? 'Show Prompt ▼' : 'Minimize ▲'}</button>}
        </div>
        {!isPromptCollapsed && <div className="prompt-body"><QuestionPrompt>{promptText || 'Complete the math task.'}</QuestionPrompt>{contextPanel}</div>}
        {responseFields && <div className="response-inputs-section">{responseFields}</div>}
        {isLandscape && actionButtons && <div className="landscape-action-bar">{actionButtons}</div>}
      </section>

      <main className="math-tool-workspace">{toolWorkspace}</main>

      {!isLandscape && actionButtons && <div className="portrait-action-bar">{actionButtons}</div>}
      {numericKeypad}
    </div>
  );
};

export default MobileViewportContainer;
