import { useEffect, useMemo, useRef, useState } from 'react';
import { MathText } from '../../common/MathText.jsx';
import {
  SUPPORT_TOOL, TOOL_STATE, supportToolsForItem, toolEvidenceRecords, visibleTools, withTranslation,
} from '../../../platform/language/supportToolsModel.js';
import { LANGUAGE_NAMES, resolveTranslation } from '../../../platform/language/translationProviders.js';
import { loadMathGlossary } from '../../../platform/language/mathVocabulary.js';
import { speakAloud, speechAvailable, stopSpeaking } from '../../../platform/language/speechText.js';

/*
 * THE SUPPORT TOOLS TRAY — loaded only for a student entitled to a language
 * tool (StudentSupportTools.jsx StudentSupportTray). It sits INLINE under the
 * task, never over it: the answer fields, the graph, the Step Algebra
 * workspace and the calculator stay where they are, and a panel scrolls inside
 * itself on a phone. Labels are neutral ("Support tools"), never a program.
 *
 * Evidence (onEvidence) is the support evidence system's: each tool's state
 * once per item (available / provided / not applicable / unavailable — see
 * platform/language/supportToolsModel.js), and "used" the first time the
 * student opens a tool on an item. Hovering or reopening records nothing.
 */

const BUTTON = {
  minHeight: 40, padding: '7px 12px', borderRadius: 999, border: '1px solid #c5d5ef',
  background: 'var(--mm-surface)', color: '#174ea6', fontWeight: 800, fontSize: 13, cursor: 'pointer',
};
const PANEL = {
  marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid #d8dde6', background: 'var(--mm-surface)',
  textAlign: 'left', maxHeight: 'min(40vh, 320px)', overflowY: 'auto', overscrollBehavior: 'contain', fontSize: 14, lineHeight: 1.5,
};
const ICON = {
  [SUPPORT_TOOL.TRANSLATE]: '文A',
  [SUPPORT_TOOL.VOCABULARY]: '📖',
  [SUPPORT_TOOL.READ_ALOUD]: '🔊',
  [SUPPORT_TOOL.SAY_IT]: '💬',
};

const languageName = (code) => LANGUAGE_NAMES[String(code || '').split('-')[0]] || String(code || '').toUpperCase();
const isSpanish = (code) => String(code || '').toLowerCase().startsWith('es');

function TranslatePanel({ tool }) {
  const translation = tool.translation;
  if (!translation) return null;
  if (translation.provider === 'authored') {
    // The task above is already shown in the student's language; the panel
    // offers the original beside it.
    return (
      <div data-support-panel="translate">
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5f6368' }}>English</div>
        <MathText as="div">{translation.original}</MathText>
      </div>
    );
  }
  return (
    <div data-support-panel="translate" lang={translation.language}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#5f6368' }}>
        {languageName(translation.language)}{tool.coverage === 'partial' ? ' · some sentences are in English' : ''}
      </div>
      <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
        {(translation.sentences || []).filter((sentence) => !sentence.mathOnly || translation.sentences.length === 1).map((sentence, index) => (
          <div key={index} data-translated={sentence.translated ? 'true' : 'false'}>
            <MathText>{sentence.text}</MathText>
            {!sentence.translated && !sentence.mathOnly && <span style={{ marginLeft: 6, fontSize: 11, color: '#5f6368' }}>(English)</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function VocabularyPanel({ tool, language, onFailed }) {
  const [glossary, setGlossary] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadMathGlossary().then((entries) => { if (alive) setGlossary(entries); }).catch(() => {
      if (!alive) return;
      setFailed(true);
      onFailed?.();
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return <div role="status" data-support-panel="vocabulary">Vocabulary could not load. Your teacher can see this.</div>;
  if (!glossary) return <div role="status" data-support-panel="vocabulary">Loading vocabulary…</div>;
  const spanish = isSpanish(language);
  return (
    <dl data-support-panel="vocabulary" style={{ margin: 0, display: 'grid', gap: 8 }}>
      {(tool.termIds || []).map((id) => glossary[id]).filter(Boolean).map((entry) => (
        <div key={entry.term}>
          <dt style={{ fontWeight: 900 }}>
            {entry.term}
            {spanish && <span lang="es" style={{ fontWeight: 700, color: '#5f6368' }}> · {entry.es.term}</span>}
          </dt>
          <dd style={{ margin: '2px 0 0' }}>
            <div>{entry.definition}</div>
            {spanish && <div lang="es" style={{ color: '#3c4043' }}>{entry.es.definition}</div>}
            {entry.example && <div style={{ fontSize: 12.5, color: '#5f6368' }}>Example: <MathText>{entry.example}</MathText></div>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SayItPanel({ tool, language }) {
  const spanish = isSpanish(language);
  return (
    <ul data-support-panel="say-it" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
      {(tool.frames || []).map((frame) => (
        <li key={frame.en}>
          <div>{frame.en}</div>
          {spanish && frame.es && <div lang="es" style={{ color: '#5f6368' }}>{frame.es}</div>}
        </li>
      ))}
    </ul>
  );
}

function StepsBox({ tool, open, onToggle }) {
  const steps = tool.chunks?.steps || [];
  return (
    <div data-support-steps style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid #c5d5ef', background: 'var(--mm-info-bg, #eef4ff)', textAlign: 'left' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ ...BUTTON, minHeight: 32, padding: '3px 10px', fontSize: 12.5 }}>
        {open ? 'Hide steps ▴' : `${tool.label} ▾`}
      </button>
      {open && (
        <ol style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 3 }}>
          {steps.map((step, index) => (
            <li key={index}>
              <MathText>{step.text}</MathText>
              {Array.isArray(step.options) && step.options.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                  {step.options.map((option) => <li key={option}>{option}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function SupportToolsTray({
  entitlement,
  prompt = '',
  question = null,
  toolType = '',
  surface = 'assignment',
  itemKey = '',
  includeReadAloud = true,
  onEvidence = null,
  onModel = null,
  className = '',
}) {
  const [speech] = useState(() => speechAvailable());
  const [translation, setTranslation] = useState(null);
  const [openTool, setOpenTool] = useState(null);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [speechFailed, setSpeechFailed] = useState(false);
  const [glossaryFailed, setGlossaryFailed] = useState(false);
  const recordedRef = useRef(new Set());
  const evidenceRef = useRef(onEvidence);
  evidenceRef.current = onEvidence;
  const modelRef = useRef(onModel);
  modelRef.current = onModel;

  const wantsTranslation = entitlement?.tools?.includes(SUPPORT_TOOL.TRANSLATE);
  const originalPrompt = typeof question?.authoredPrompt === 'string' ? question.authoredPrompt : prompt;

  // A new item starts closed and clean.
  useEffect(() => {
    setOpenTool(null);
    setStepsOpen(true);
    setSpeechFailed(false);
    setGlossaryFailed(false);
    setTranslation(null);
    stopSpeaking();
  }, [itemKey]);

  useEffect(() => {
    if (!wantsTranslation) return undefined;
    let alive = true;
    resolveTranslation({ question, text: originalPrompt, language: entitlement.language })
      .then((result) => { if (alive) setTranslation(result); });
    return () => { alive = false; };
  }, [itemKey, wantsTranslation, entitlement?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => {
    const base = supportToolsForItem({ entitlement, prompt, question, toolType, speech: speech && !speechFailed });
    const withLanguage = withTranslation(base, translation);
    const tools = withLanguage.tools
      .filter((tool) => includeReadAloud || tool.tool !== SUPPORT_TOOL.READ_ALOUD)
      .map((tool) => (tool.tool === SUPPORT_TOOL.VOCABULARY && glossaryFailed
        ? { ...tool, state: TOOL_STATE.UNAVAILABLE, reason: 'glossary-load-failed' }
        : tool));
    return { ...withLanguage, tools };
  }, [entitlement, prompt, question, toolType, speech, speechFailed, translation, includeReadAloud, glossaryFailed]);

  // What this item actually offered — once per item and fact.
  useEffect(() => {
    modelRef.current?.(model);
    toolEvidenceRecords(model, { surface, toolType }).forEach((record) => {
      const key = `${itemKey}|${record.supportId}|${record.eventType}|${record.variant || ''}`;
      if (recordedRef.current.has(key)) return;
      recordedRef.current.add(key);
      evidenceRef.current?.(record);
    });
  }, [model, itemKey, surface, toolType]);

  const recordUse = (tool) => {
    const key = `${itemKey}|${tool.supportId}|used`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);
    evidenceRef.current?.({ supportId: tool.supportId, eventType: 'used', details: { surface } });
  };

  const shown = visibleTools(model);
  const steps = shown.find((tool) => tool.tool === SUPPORT_TOOL.BREAK_IT_DOWN);
  const buttons = shown.filter((tool) => tool.tool !== SUPPORT_TOOL.BREAK_IT_DOWN);
  if (!shown.length) return null;

  const press = (tool) => {
    if (tool.tool === SUPPORT_TOOL.READ_ALOUD) {
      const spokenLanguage = question?.authoredPrompt !== undefined ? entitlement.language : 'en';
      if (speakAloud(prompt, { language: spokenLanguage })) recordUse(tool);
      else setSpeechFailed(true);
      return;
    }
    setOpenTool((current) => (current === tool.tool ? null : tool.tool));
    recordUse(tool);
  };
  const open = buttons.find((tool) => tool.tool === openTool) || null;

  return (
    <div className={`mathmaster-support-tray${className ? ` ${className}` : ''}`} data-student-support-tray={surface} role="group" aria-label="Support tools">
      {buttons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '.04em' }}>Support tools</span>
          {buttons.map((tool) => (
            <button
              key={tool.tool}
              type="button"
              data-support-tool={tool.tool}
              aria-expanded={tool.tool === SUPPORT_TOOL.READ_ALOUD ? undefined : openTool === tool.tool}
              onClick={() => press(tool)}
              style={{ ...BUTTON, background: openTool === tool.tool ? '#e8f0fe' : BUTTON.background }}
            >
              <span aria-hidden="true">{ICON[tool.tool]}</span> {tool.label}
            </button>
          ))}
        </div>
      )}
      {speechFailed && <div role="status" style={{ marginTop: 6, fontSize: 12, color: '#7a4f00', fontWeight: 700 }}>Read aloud is not working in this browser. Your teacher can see this.</div>}
      {open && (
        <div role="region" aria-label={open.label} style={PANEL}>
          {open.tool === SUPPORT_TOOL.TRANSLATE && <TranslatePanel tool={open} />}
          {open.tool === SUPPORT_TOOL.VOCABULARY && <VocabularyPanel tool={open} language={entitlement.language} onFailed={() => setGlossaryFailed(true)} />}
          {open.tool === SUPPORT_TOOL.SAY_IT && <SayItPanel tool={open} language={entitlement.language} />}
        </div>
      )}
      {steps && <StepsBox tool={steps} open={stepsOpen} onToggle={() => setStepsOpen((current) => !current)} />}
    </div>
  );
}
