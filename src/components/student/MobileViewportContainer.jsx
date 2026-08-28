import React, { useEffect, useRef, useState } from 'react';
import QuestionPrompt from '../../QuestionPrompt';
import './MathToolMobileLayout.css';
import '../../platform/mobile/MobileInteractionFoundation.css';
import {
  scheduleHorizontalViewportStabilization,
  scrollFocusedControlVertically,
  stabilizeHorizontalViewport,
} from '../../platform/mobile/mobileFocusViewport.js';

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
  const focusedScrollerLockRef = useRef({ element: null, left: 0 });
  const [isPromptCollapsed, setIsPromptCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [isLandscape, setIsLandscape] = useState(detectLandscape);
  const [numericTarget, setNumericTarget] = useState(null);
  const [visualViewport, setVisualViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? Number(window.visualViewport?.width || window.innerWidth || 0) : 0,
    height: typeof window !== 'undefined' ? Number(window.visualViewport?.height || window.innerHeight || 0) : 0,
    offsetTop: typeof window !== 'undefined' ? Number(window.visualViewport?.offsetTop || 0) : 0,
    offsetLeft: typeof window !== 'undefined' ? Number(window.visualViewport?.offsetLeft || 0) : 0,
  }));

  useEffect(() => {
    const updateViewportMode = () => {
      const mobile = detectMobile();
      setIsMobile(mobile);
      setIsLandscape(detectLandscape());
      setVisualViewport({
        width: Number(window.visualViewport?.width || window.innerWidth || 0),
        height: Number(window.visualViewport?.height || window.innerHeight || 0),
        offsetTop: Number(window.visualViewport?.offsetTop || 0),
        offsetLeft: Number(window.visualViewport?.offsetLeft || 0),
      });
    };
    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    window.addEventListener('orientationchange', updateViewportMode);
    window.visualViewport?.addEventListener('resize', updateViewportMode);
    window.visualViewport?.addEventListener('scroll', updateViewportMode);
    return () => {
      window.removeEventListener('resize', updateViewportMode);
      window.removeEventListener('orientationchange', updateViewportMode);
      window.visualViewport?.removeEventListener('resize', updateViewportMode);
      window.visualViewport?.removeEventListener('scroll', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const promptPanel = root.querySelector('.question-prompt-panel');
    const toolWorkspace = root.querySelector('.mathmaster-question-tool-workspace');
    const workflowWorkspace = root.querySelector('.workflow-focus__workspace');
    const assignmentStage = root.closest('.mathmaster-question-stage');
    const assignmentShell = root.closest('.mathmaster-assignment-shell');
    const assignmentScreen = root.closest('.mathmaster-assignment-screen');
    // Horizontal focus panning is not a phone-only defect. Chrome on a
    // Chromebook/desktop can pan an overflow:clip/hidden element to expose the
    // MathLive caret, producing the dramatic whole-question jump teachers were
    // seeing in domain/range fields. Lock every page-level question wrapper on
    // every device; intentional horizontal scrollers live inside dedicated
    // local-scroll elements and are not included here.
    const locked = [
      root,
      promptPanel,
      toolWorkspace,
      workflowWorkspace,
      assignmentStage,
      assignmentShell,
      assignmentScreen,
    ].filter(Boolean);

    const forceZero = () => stabilizeHorizontalViewport({ root });
    const onLockedScroll = (event) => {
      if (Math.abs(Number(event.currentTarget?.scrollLeft || 0)) > 0.5) {
        event.currentTarget.scrollLeft = 0;
      }
    };
    const onWindowScroll = () => {
      if (Math.abs(Number(window.scrollX || 0)) > 0.5 || Math.abs(Number(window.visualViewport?.offsetLeft || 0)) > 0.5) {
        forceZero();
      }
    };

    locked.forEach((element) => element.addEventListener('scroll', onLockedScroll, { passive: true }));
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.visualViewport?.addEventListener('scroll', onWindowScroll, { passive: true });

    forceZero();

    return () => {
      locked.forEach((element) => element.removeEventListener('scroll', onLockedScroll));
      window.removeEventListener('scroll', onWindowScroll);
      window.visualViewport?.removeEventListener('scroll', onWindowScroll);
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
    const target = event.target;
    if (isMobile && target?.matches?.(NUMERIC_SELECTOR)) setNumericTarget(target);

    // Remember the local horizontal position at focus time. Some MathLive and
    // browser caret routines scroll the nearest overflow:auto ancestor after
    // EVERY keystroke. If that ancestor is the tool workspace, page-level
    // scroll locks alone cannot stop the visible sideways jump.
    const localScroller = target?.closest?.('.question-prompt-panel, .math-tool-workspace, .mathmaster-mobile-local-scroll');
    focusedScrollerLockRef.current = {
      element: localScroller || null,
      left: Number(localScroller?.scrollLeft || 0),
    };

    // NEVER use scrollIntoView() for mobile answer controls. Even with
    // inline:'nearest', Safari/Chrome may programmatically change scrollLeft on
    // overflow:hidden ancestors. The result looks like the entire question
    // jumps sideways while the student types. Move only the nearest local
    // scroll container vertically and then restore page-level x position.
    window.requestAnimationFrame(() => {
      if (isMobile) scrollFocusedControlVertically(target, { root: rootRef.current });
      scheduleHorizontalViewportStabilization({ root: rootRef.current });
    });
  };

  const restoreFocusedHorizontalPosition = () => {
    const lock = focusedScrollerLockRef.current;
    const restore = () => {
      if (lock.element?.isConnected && Math.abs(Number(lock.element.scrollLeft || 0) - Number(lock.left || 0)) > 0.5) {
        lock.element.scrollLeft = Number(lock.left || 0);
      }
      stabilizeHorizontalViewport({ root: rootRef.current });
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(restore);
    window.requestAnimationFrame(restore);
  };

  const handleInputCapture = () => {
    restoreFocusedHorizontalPosition();
  };

  const handleKeyDownCapture = (event) => {
    if (event.key?.length === 1 || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      restoreFocusedHorizontalPosition();
    }
  };

  const handleBlurCapture = (event) => {
    if (rootRef.current?.contains?.(event.relatedTarget)) return;
    focusedScrollerLockRef.current = { element: null, left: 0 };
    scheduleHorizontalViewportStabilization({ root: rootRef.current });
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
    return <div
      ref={rootRef}
      className="mathmaster-desktop-question-content mathmaster-mobile-interaction-root"
      onFocusCapture={handleFocusCapture}
      onInputCapture={handleInputCapture}
      onKeyDownCapture={handleKeyDownCapture}
      onBlurCapture={handleBlurCapture}
    >{contextPanel}{responseFields}{toolWorkspace}{actionButtons}</div>;
  }

  return (
    <div
      ref={rootRef}
      onFocusCapture={handleFocusCapture}
      onInputCapture={handleInputCapture}
      onKeyDownCapture={handleKeyDownCapture}
      onBlurCapture={handleBlurCapture}
      className={`mathmaster-question-container mathmaster-mobile-interaction-root ${isLandscape ? 'mode-landscape' : 'mode-portrait'} ${numericTarget ? 'numeric-keypad-open' : ''}`}
      style={{
        '--mm-visual-viewport-width': `${visualViewport.width}px`,
        '--mm-visual-viewport-height': `${visualViewport.height}px`,
        '--mm-visual-viewport-offset-top': `${visualViewport.offsetTop}px`,
        '--mm-visual-viewport-offset-left': `${visualViewport.offsetLeft}px`,
      }}
    >
      <section className="question-prompt-panel" aria-label="Question prompt and response controls">
        <div className="question-prompt-heading">
          <span>YOUR TASK</span>
          {!isLandscape && <button type="button" onClick={() => setIsPromptCollapsed((current) => !current)}>{isPromptCollapsed ? 'Show Prompt ▼' : 'Minimize ▲'}</button>}
        </div>
        {!isPromptCollapsed && <div className="prompt-body"><QuestionPrompt variant="plain" style={{ color: '#202124', fontWeight: 800, fontSize: 18, margin: 0 }}>{promptText || 'Complete the math task.'}</QuestionPrompt>{contextPanel}</div>}
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
