// The secure-item access components, mounted alone, in a real browser.
//
// Scenes (?scene=):
//   answer   one SecureMathAnswerField; the driver sets the field, types the
//            way a student does, and reads back exactly what was emitted.
//   held     one number field MOUNTED read-only with an answer in it, as a
//            recorded or closed item opens; window.__mmSetReadOnly(false)
//            unlocks it. (Made read-only after mounting, MathLive happened to
//            refuse a typed backslash; mounted read-only, MathInput inserted
//            it — so the read-only checks run here.)
//   item     a secure item the way the integrator wires these components:
//            an exam toolbar with the tools secureExamTools.js resolves for
//            the exam (?examType=digitalSAT|act|tsia2|asvab|courseTest&
//            itemCalculator=…&sessionCalculator=…), the prompt with
//            SecureItemAccessSupports (?supports=full|practiceOnly|none|
//            spanishOnly), and the typed answer (?profile=number|…).
//            ?translations=authored gives the item an authored Spanish prompt.
//            The toolbar's height is measured into --mm-exam-toolbar-offset
//            and the question column is padded by useExamToolRoom(...) while
//            a tool is open — the two things INTEGRATION asks the container
//            to do. window.__mmNextItem() moves to another item WITHOUT
//            remounting; window.__mmSetWorkView(true) lays QuestionEngine's
//            Work View layer (WorkViewShell.css) over the page.
//
// Speech is stubbed: what Read aloud would say is recorded on
// window.__mmSpoken instead of spoken, so the driver can prove it is the
// prompt and nothing else.
//
// Run via tests/browser/secureAccessParity.mjs.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/components/common/WorkViewShell.css';
import MathText from '../../src/components/common/MathText.jsx';
import SecureMathAnswerField from '../../src/components/assessment/SecureMathAnswerField.jsx';
import SecureItemAccessSupports from '../../src/components/assessment/SecureItemAccessSupports.jsx';
import SatReferenceSheet from '../../src/components/assessment/SatReferenceSheet.jsx';
import GraphingCalculatorPanel from '../../src/components/assessment/GraphingCalculatorPanel.jsx';
import { resolveSecureExamTools } from '../../src/platform/assessment/secureExamTools.js';
import { useExamToolRoom } from '../../src/components/assessment/examToolDrawerHooks.js';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') || 'answer';
// ?theme=dark: the app's dark tokens (theme/tokens.css keys them on <html>).
if (params.get('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

window.__mmEmitted = [];
window.__mmSpoken = [];
window.__mmEvidence = [];

// A speech engine that records instead of speaking (headless Chromium has no
// voices). Same surface the platform's speechText.js uses.
const fakeSpeech = {
  speaking: false,
  speak(utterance) { window.__mmSpoken.push(String(utterance?.text ?? '')); this.speaking = true; },
  cancel() { this.speaking = false; },
  getVoices() { return []; },
  addEventListener() {},
  removeEventListener() {},
};
try { Object.defineProperty(window, 'speechSynthesis', { value: fakeSpeech, configurable: true }); } catch { /* keep the real one */ }

function AnswerScene() {
  const [field, setField] = useState({ id: 'answer', label: 'Answer', inputProfile: 'number' });
  const [value, setValue] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  // A fresh field per trial, as answerRoundTrip does: clearing a MathLive
  // field by keystroke is unreliable.
  const [nonce, setNonce] = useState(0);

  window.__mmSetField = (next) => { setField(next); setValue(''); window.__mmEmitted = []; setNonce((current) => current + 1); };
  window.__mmReset = () => { setValue(''); window.__mmEmitted = []; setNonce((current) => current + 1); };
  window.__mmSetReadOnly = (next) => setReadOnly(Boolean(next));
  window.__mmSetValue = (next) => setValue(next);

  return (
    <main style={{ width: 'min(820px, 100%)', margin: '0 auto', padding: '28px 18px 64px', boxSizing: 'border-box' }}>
      <section style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 'clamp(18px, 4vw, 30px)' }}>
        <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Secure exam question</div>
        <h1 style={{ color: 'var(--mm-text-strong)', fontSize: 'clamp(20px, 4vw, 27px)', lineHeight: 1.45, margin: '10px 0 24px' }}>
          What is the value of the expression shown?
        </h1>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} data-nonce={nonce} data-profile={field.inputProfile}>
          <legend style={{ fontSize: 13, fontWeight: 900, color: 'var(--mm-text)', marginBottom: 7 }}>{field.label}</legend>
          <SecureMathAnswerField
            key={`${field.inputProfile}-${nonce}`}
            field={field}
            value={value}
            readOnly={readOnly}
            autoFocus
            onChange={(next) => { window.__mmEmitted.push(next); setValue(next); }}
          />
        </fieldset>
        <pre data-emitted style={{ marginTop: 14, fontSize: 12, color: 'var(--mm-text-muted)', whiteSpace: 'pre-wrap' }}>{value}</pre>
      </section>
    </main>
  );
}

const PROFILES = {
  full: { accommodations: ['text-to-speech', 'glossary-lookup', 'chunked-directions', 'sentence-frames'], translationLanguage: 'es' },
  // Read aloud limited to practice by the plan: not on a test.
  practiceOnly: {
    supportPlan: {
      windows: [{
        effectiveStart: '2026-01-01', status: 'active', revision: 1, translationLanguage: null,
        accommodations: [{ id: 'text-to-speech', appliesTo: ['practice'] }, { id: 'glossary-lookup', appliesTo: [] }],
      }],
    },
  },
  // Translate alone: the language is the plan, no other tool.
  spanishOnly: { accommodations: [], translationLanguage: 'es' },
  none: null,
};

const ITEMS = [
  {
    questionInstanceId: 'harness-item-1',
    prompt: 'A line has a slope of $\\frac{3}{4}$ and a y-intercept of $-2$. If $4x - 3 = 0$, what is the value of $x$?',
  },
  {
    questionInstanceId: 'harness-item-2',
    prompt: 'What is the value of $x$ if $2x + 5 = 11$?',
  },
];

const itemAt = (index) => ({
  ...ITEMS[index % ITEMS.length],
  // An authored translation of the prompt, as a secure payload could carry it.
  ...(params.get('translations') === 'authored' ? {
    translations: { es: { prompt: index % ITEMS.length === 0
      ? 'Una recta tiene una pendiente de $\\frac{3}{4}$ y una intersección con el eje y de $-2$. Si $4x - 3 = 0$, ¿cuál es el valor de $x$?'
      : '¿Cuál es el valor de $x$ si $2x + 5 = 11$?' } },
  } : {}),
  // Answer-bearing data a real secure payload never carries — here only so the
  // driver can prove no support reads beyond the prompt.
  choices: [{ id: 'c1', label: 'CHOICE-TEXT-MUST-NOT-BE-READ' }],
  stimulus: { text: 'STIMULUS-MUST-NOT-BE-READ' },
  calculatorPolicy: params.get('itemCalculator') || 'inherit',
  examCalculatorMode: params.get('itemCalculator') || null,
});

function ItemScene() {
  const examType = params.get('examType') || 'digitalSAT';
  const profileKey = params.get('profile') || 'number';
  const supportsKey = params.get('supports') || 'full';
  const sessionCalculatorMode = params.get('sessionCalculator') || (examType === 'digitalSAT' || examType === 'act' ? 'graphing' : null);
  const [value, setValue] = useState('');
  const [itemIndex, setItemIndex] = useState(0);
  const [workView, setWorkView] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(64);
  const headerRef = useRef(null);
  const columnRef = useRef(null);
  const item = useMemo(() => itemAt(itemIndex), [itemIndex]);
  const tools = useMemo(() => resolveSecureExamTools({ examType, sessionCalculatorMode, question: item }), [examType, sessionCalculatorMode, item]);
  window.__mmTools = tools;
  window.__mmNextItem = () => setItemIndex((current) => current + 1);
  window.__mmSetWorkView = (next) => setWorkView(Boolean(next));
  const field = { id: 'answer', label: 'Your answer', inputProfile: profileKey };

  // What the integrator does: the toolbar's real height into the offset the
  // drawers open below, and room for every open drawer beside the question.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => setToolbarHeight(Math.ceil(header.getBoundingClientRect().height)));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const room = useExamToolRoom(columnRef, { referenceSheetOpen: sheetOpen, graphingCalculatorOpen: calculatorOpen });
  window.__mmRoom = { ...room, sheetOpen, calculatorOpen, toolbarHeight };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--mm-surface-sunken)', '--mm-exam-toolbar-offset': `${toolbarHeight}px` }}>
      <header ref={headerRef} style={{ position: 'sticky', top: 0, zIndex: 50, minHeight: 64, padding: '10px 16px', boxSizing: 'border-box', background: '#202124', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div><strong>{examType === 'digitalSAT' ? 'Digital SAT Math' : examType}</strong><div style={{ fontSize: 12, color: '#bdc1c6' }}>Question {3 + itemIndex} of 44</div></div>
        <div data-exam-tools style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tools.referenceSheet && <SatReferenceSheet onOpenChange={setSheetOpen} />}
          <GraphingCalculatorPanel available={tools.graphingCalculator} onOpenChange={setCalculatorOpen} />
        </div>
      </header>
      <div ref={columnRef} data-question-column-room style={{ paddingLeft: room.paddingLeft, paddingRight: room.paddingRight, boxSizing: 'border-box' }}>
        <main style={{ width: 'min(820px, 100%)', margin: '0 auto', padding: '28px 18px 64px', boxSizing: 'border-box' }}>
          <section data-question style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 'clamp(18px, 4vw, 30px)' }}>
            <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Secure exam question</div>
            <MathText as="h1" style={{ color: 'var(--mm-text-strong)', fontSize: 'clamp(20px, 4vw, 27px)', lineHeight: 1.45, margin: '10px 0 16px', fontWeight: 760 }}>{item.prompt}</MathText>
            <SecureItemAccessSupports question={item} studentSupportProfile={PROFILES[supportsKey] ?? null} onSupportEvidence={(record) => window.__mmEvidence.push(record)} />
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 900, color: 'var(--mm-text)', marginBottom: 7 }}>{field.label}</legend>
              <SecureMathAnswerField field={field} value={value} onChange={(next) => { window.__mmEmitted.push(next); setValue(next); }} />
            </fieldset>
          </section>
        </main>
      </div>
      {/* QuestionEngine's "Enlarge question" layer, with its real stylesheet. */}
      {workView && <div className="mathmaster-work-view-host" data-open="true" data-harness-work-view><div style={{ gridRow: 3, padding: 24 }}>Enlarged question</div></div>}
    </div>
  );
}

function HeldScene() {
  const [value, setValue] = useState('\\frac{3}{4}');
  const [readOnly, setReadOnly] = useState(true);
  window.__mmSetReadOnly = (next) => setReadOnly(Boolean(next));
  return (
    <main style={{ width: 'min(820px, 100%)', margin: '0 auto', padding: '28px 18px 64px', boxSizing: 'border-box' }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 900, color: 'var(--mm-text)', marginBottom: 7 }}>Answer</legend>
        <SecureMathAnswerField
          field={{ id: 'answer', label: 'Answer', inputProfile: 'number' }}
          value={value}
          readOnly={readOnly}
          onChange={(next) => { window.__mmEmitted.push(next); setValue(next); }}
        />
      </fieldset>
      <button type="button" data-after-field>After the field</button>
    </main>
  );
}

const SCENES = { answer: AnswerScene, item: ItemScene, held: HeldScene };
const Scene = SCENES[scene] || AnswerScene;

createRoot(document.getElementById('root')).render(<Scene />);
window.__mmScene = scene;
