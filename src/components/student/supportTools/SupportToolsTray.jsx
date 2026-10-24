import { useEffect, useMemo, useRef, useState } from 'react';
import { MathText } from '../../common/MathText.jsx';
import {
  SUPPORT_TOOL, TOOL_STATE, supportToolsForItem, toolEvidenceRecords, visibleTools, withTranslation,
} from '../../../platform/language/supportToolsModel.js';
import { LANGUAGE_NAMES, resolveTranslation } from '../../../platform/language/translationProviders.js';
import { loadMathGlossary } from '../../../platform/language/mathVocabulary.js';
import { speakAloud, speechAvailable, stopSpeaking } from '../../../platform/language/speechText.js';
import { questionReadingText } from '../../../platform/language/questionReading.js';
import { secureVocabularyEntries } from '../../../platform/assessment/secureSupportPanels.js';

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
  minHeight: 40, padding: '7px 12px', borderRadius: 999, border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))', cursor: 'pointer',
};
const PANEL = {
  marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)',
  textAlign: 'left', maxHeight: 'min(40vh, 320px)', overflowY: 'auto', overscrollBehavior: 'contain', fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.5,
};
const ICON = {
  [SUPPORT_TOOL.TRANSLATE]: '文A',
  [SUPPORT_TOOL.VOCABULARY]: '📖',
  [SUPPORT_TOOL.READ_ALOUD]: '🔊',
  [SUPPORT_TOOL.SAY_IT]: '💬',
  'read-parts': '🔊',
};

// Not a support of its own: the parts of Read aloud, offered beside the work
// bar's whole-question Read.
const READ_PARTS = 'read-parts';
const languageName = (code) => LANGUAGE_NAMES[String(code || '').split('-')[0]] || String(code || '').toUpperCase();
const isSpanish = (code) => String(code || '').toLowerCase().startsWith('es');

export function TranslatePanel({ tool }) {
  const translation = tool.translation;
  if (!translation) return null;
  if (translation.provider === 'authored') {
    // The task above is already shown in the student's language; the panel
    // offers the original beside it.
    return (
      <div data-support-panel="translate">
        <div style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>English</div>
        <MathText as="div">{translation.original}</MathText>
      </div>
    );
  }
  return (
    <div data-support-panel="translate" lang={translation.language}>
      <div style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>
        {languageName(translation.language)}{tool.coverage === 'partial' ? ' · some sentences are in English' : ''}
      </div>
      <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
        {(translation.sentences || []).filter((sentence) => !sentence.mathOnly || translation.sentences.length === 1).map((sentence, index) => {
          // A sentence the pack could not translate is English, and its
          // mathematics is said in English; every other formula is said in the
          // panel's language (AX06).
          const english = !sentence.translated && !sentence.mathOnly;
          return (
            <div key={index} lang={english ? 'en' : undefined} data-translated={sentence.translated ? 'true' : 'false'}>
              <MathText language={english ? 'en' : translation.language}>{sentence.text}</MathText>
              {english && <span style={{ marginLeft: 6, fontSize: 'calc(11 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>(English)</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/*
 * Each term with its definition, and — unless `showExamples` is false — the
 * glossary's worked example. On a secure test item it is false (RichQuestion-
 * Runtime's tray entitlement): an example applies the word, and can apply it
 * to exactly what the item asks, so the terms come through the same
 * example-free helper the secure field item's tray uses.
 */
function VocabularyPanel({ tool, language, onFailed, showExamples = true }) {
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
  if (!showExamples) {
    return (
      <dl data-support-panel="vocabulary" data-vocabulary-examples="none" style={{ margin: 0, display: 'grid', gap: 8 }}>
        {secureVocabularyEntries(glossary, tool.termIds, { language }).map((entry) => (
          <div key={entry.id} data-vocabulary-term={entry.id}>
            <dt style={{ fontWeight: 900 }}>
              {entry.term}
              {entry.translation && <span lang={entry.translation.language} style={{ fontWeight: 700, color: 'var(--mm-text-muted)' }}> · {entry.translation.term}</span>}
            </dt>
            <dd style={{ margin: '2px 0 0' }}>
              <div>{entry.definition}</div>
              {entry.translation && <div lang={entry.translation.language} style={{ color: 'var(--mm-text)' }}>{entry.translation.definition}</div>}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  const spanish = isSpanish(language);
  return (
    <dl data-support-panel="vocabulary" style={{ margin: 0, display: 'grid', gap: 8 }}>
      {(tool.termIds || []).map((id) => glossary[id]).filter(Boolean).map((entry) => (
        <div key={entry.term}>
          <dt style={{ fontWeight: 900 }}>
            {entry.term}
            {spanish && <span lang="es" style={{ fontWeight: 700, color: 'var(--mm-text-muted)' }}> · {entry.es.term}</span>}
          </dt>
          <dd style={{ margin: '2px 0 0' }}>
            <div>{entry.definition}</div>
            {spanish && <div lang="es" style={{ color: 'var(--mm-text)' }}>{entry.es.definition}</div>}
            {entry.example && <div style={{ fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Example: <MathText>{entry.example}</MathText></div>}
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
          {spanish && frame.es && <div lang="es" style={{ color: 'var(--mm-text-muted)' }}>{frame.es}</div>}
        </li>
      ))}
    </ul>
  );
}

/*
 * HEAR ONE PART AGAIN (pass 3, HELP-6). Read aloud says the whole question;
 * a student who missed the choices of part 2, or the matrix, plays just that
 * part. The parts are the reader's own (platform/language/questionReading.js),
 * in screen order.
 */
function ReadPartsPanel({ parts, onRead }) {
  return (
    <div data-support-panel="read-parts">
      <div style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>Hear one part again</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {parts.map((part) => (
          <button key={part.id} type="button" data-read-part={part.kind} onClick={() => onRead(part)} aria-label={`Read ${part.label} aloud`} style={{ ...BUTTON, minHeight: 36 }}>
            <span aria-hidden="true">🔊</span> {part.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepsBox({ tool, open, onToggle }) {
  const steps = tool.chunks?.steps || [];
  return (
    <div data-support-steps style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-info-bg, var(--mm-primary-subtle))', textAlign: 'left', fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.5 }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ ...BUTTON, minHeight: 32, padding: '3px 10px', fontSize: 'calc(12.5 * var(--mm-px))' }}>
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
  readingParts = null,
  readingLanguage = null,
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
  // Kept with the item and language it was resolved for: on the render where
  // the item changes, the previous item's translation must not reach the
  // model (or its evidence) before the reset below runs.
  const [resolved, setResolved] = useState(null);
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
    stopSpeaking();
  }, [itemKey]);

  const translationKey = `${itemKey}|${entitlement?.language || ''}`;
  useEffect(() => {
    if (!wantsTranslation) return undefined;
    let alive = true;
    resolveTranslation({ question, text: originalPrompt, language: entitlement.language })
      .then((result) => { if (alive) setResolved({ key: translationKey, result }); });
    return () => { alive = false; };
  }, [translationKey, wantsTranslation]); // eslint-disable-line react-hooks/exhaustive-deps
  const translation = resolved?.key === translationKey ? resolved.result : null;

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
    // A universal-design tool is not a plan support; its use is not evidence.
    if (tool.universal) return;
    const key = `${itemKey}|${tool.supportId}|used`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);
    evidenceRef.current?.({ supportId: tool.supportId, eventType: 'used', details: { surface } });
  };

  // What Read aloud says: the whole question, in parts — or, from a host that
  // passes none, the prompt alone.
  const parts = Array.isArray(readingParts) && readingParts.length ? readingParts : null;
  const wholeReading = parts ? questionReadingText(parts) : prompt;
  // Read aloud is entitled here but the work bar carries the whole-question
  // Read (includeReadAloud false): the tray still offers the parts.
  const readAloudTool = (model.tools || []).find((tool) => tool.tool === SUPPORT_TOOL.READ_ALOUD);
  const entitledReadAloud = entitlement?.tools?.includes(SUPPORT_TOOL.READ_ALOUD);
  const partsOffered = Boolean(parts && parts.length > 1 && speech && !speechFailed && entitledReadAloud);
  const partsOnly = partsOffered && !readAloudTool;

  const shown = visibleTools(model);
  const steps = shown.find((tool) => tool.tool === SUPPORT_TOOL.BREAK_IT_DOWN);
  const buttons = shown.filter((tool) => tool.tool !== SUPPORT_TOOL.BREAK_IT_DOWN);
  if (!shown.length && !partsOnly) return null;

  const spokenLanguage = readingLanguage || (question?.authoredPrompt !== undefined ? entitlement.language : 'en');
  const readTool = readAloudTool || { tool: SUPPORT_TOOL.READ_ALOUD, supportId: 'text-to-speech', universal: entitlement?.universal?.includes(SUPPORT_TOOL.READ_ALOUD) };
  const readPart = (part) => {
    if (speakAloud(part.text, { language: spokenLanguage, functionNames: part.functionNames })) recordUse(readTool);
    else setSpeechFailed(true);
  };
  const press = (tool) => {
    if (tool.tool === SUPPORT_TOOL.READ_ALOUD) {
      if (speakAloud(wholeReading, { language: spokenLanguage })) {
        recordUse(tool);
        // The parts open under it, so the student can hear one again.
        if (partsOffered) setOpenTool(SUPPORT_TOOL.READ_ALOUD);
      } else setSpeechFailed(true);
      return;
    }
    if (tool.tool === READ_PARTS) {
      setOpenTool((current) => (current === READ_PARTS ? null : READ_PARTS));
      return;
    }
    setOpenTool((current) => (current === tool.tool ? null : tool.tool));
    recordUse(tool);
  };
  const partsButton = partsOnly ? [{ tool: READ_PARTS, label: 'Read a part' }] : [];
  const allButtons = [...buttons, ...partsButton];
  const open = allButtons.find((tool) => tool.tool === openTool) || null;
  const partsOpen = partsOffered && (openTool === READ_PARTS || openTool === SUPPORT_TOOL.READ_ALOUD);

  return (
    <div className={`mathmaster-support-tray${className ? ` ${className}` : ''}`} data-student-support-tray={surface} role="group" aria-label="Support tools">
      {allButtons.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 900, color: 'var(--mm-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Support tools</span>
          {allButtons.map((tool) => (
            <button
              key={tool.tool}
              type="button"
              data-support-tool={tool.tool}
              aria-expanded={tool.tool === SUPPORT_TOOL.READ_ALOUD ? (partsOffered ? partsOpen : undefined) : openTool === tool.tool}
              onClick={() => press(tool)}
              style={{ ...BUTTON, background: openTool === tool.tool ? 'var(--mm-primary-soft)' : BUTTON.background }}
            >
              <span aria-hidden="true">{ICON[tool.tool]}</span> {tool.label}
            </button>
          ))}
        </div>
      )}
      {speechFailed && <div role="status" style={{ marginTop: 6, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-warning-text)', fontWeight: 700 }}>Read aloud is not working in this browser. Your teacher can see this.</div>}
      {partsOpen && (
        <div role="region" aria-label="Read a part" style={PANEL}>
          <ReadPartsPanel parts={parts} onRead={readPart} />
        </div>
      )}
      {open && !partsOpen && open.tool !== SUPPORT_TOOL.READ_ALOUD && (
        <div role="region" aria-label={open.label} style={PANEL}>
          {open.tool === SUPPORT_TOOL.TRANSLATE && <TranslatePanel tool={open} />}
          {open.tool === SUPPORT_TOOL.VOCABULARY && <VocabularyPanel tool={open} language={entitlement.language} showExamples={entitlement.showExamples !== false} onFailed={() => setGlossaryFailed(true)} />}
          {open.tool === SUPPORT_TOOL.SAY_IT && <SayItPanel tool={open} language={entitlement.language} />}
        </div>
      )}
      {steps && <StepsBox tool={steps} open={stepsOpen} onToggle={() => setStepsOpen((current) => !current)} />}
    </div>
  );
}
