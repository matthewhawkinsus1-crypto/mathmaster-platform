import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MathText } from '../common/MathText.jsx';
import {
  SUPPORT_TOOL, TOOL_STATE, supportToolsForItem, toolEvidenceRecords, visibleTools, withTranslation,
} from '../../platform/language/supportToolsModel.js';
import { resolveTranslation } from '../../platform/language/translationProviders.js';
import { loadMathGlossary } from '../../platform/language/mathVocabulary.js';
import { speakAloud, speechAvailable, stopSpeaking } from '../../platform/language/speechText.js';
import { SECURE_ACCESS_TOOLS } from '../../platform/assessment/secureItemAccess.js';
import { secureTranslationView, secureVocabularyEntries } from '../../platform/assessment/secureSupportPanels.js';

/*
 * THE SUPPORT TOOLS TRAY, AS A SECURE ITEM SHOWS IT.
 *
 * Loaded only for a student entitled to one of the three tools
 * (SecureItemAccessSupports.jsx), and built from the same parts as the tray on
 * every assignment (src/components/student/supportTools/SupportToolsTray.jsx):
 * the same per-item model (supportToolsModel.js), the same translation
 * providers, the same glossary, the same speech and the same evidence records.
 * What differs is what a panel may show beside a test item, decided in
 * src/platform/assessment/secureSupportPanels.js:
 *
 *   Vocabulary  the word and its definition — never the glossary's worked
 *               example, which can be the item worked for the student.
 *   Translate   an authored translation as the translation (a secure item's
 *               prompt is never replaced by it, so the assignment tray's
 *               "English original" panel would repeat the English).
 *   Read aloud  the prompt on screen, with Stop reading once it has started on
 *               THIS item — a new item starts with nothing to stop.
 *
 * It sits inline under the prompt, never over it, and every control is at
 * least 44px for a test taken on a phone.
 */

const BUTTON = {
  minHeight: 44, padding: '7px 12px', borderRadius: 999, border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 13, cursor: 'pointer',
};
const STOP_BUTTON = { ...BUTTON, border: '1px solid var(--mm-border)', color: 'var(--mm-text-muted)' };
const PANEL = {
  marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)',
  textAlign: 'left', maxHeight: 'min(40vh, 320px)', overflowY: 'auto', overscrollBehavior: 'contain', fontSize: 14, lineHeight: 1.5,
};
const PANEL_LABEL = { fontSize: 12, fontWeight: 800, color: 'var(--mm-text-muted)' };
const ICON = {
  [SUPPORT_TOOL.TRANSLATE]: '文A',
  [SUPPORT_TOOL.VOCABULARY]: '📖',
  [SUPPORT_TOOL.READ_ALOUD]: '🔊',
};

function TranslatePanel({ translation }) {
  const view = secureTranslationView(translation);
  if (!view) return null;
  return (
    <div data-support-panel="translate" lang={view.language || undefined}>
      <div style={PANEL_LABEL}>{view.languageName}{view.partial ? ' · some sentences are in English' : ''}</div>
      <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
        {view.lines.map((line, index) => (
          <div key={index} data-translated={line.translated ? 'true' : 'false'}>
            <MathText>{line.text}</MathText>
            {!line.translated && !line.mathOnly && <span lang="en" style={{ marginLeft: 6, fontSize: 11, color: 'var(--mm-text-muted)' }}>(English)</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function VocabularyPanel({ termIds, language, onFailed }) {
  const [glossary, setGlossary] = useState(null);
  const [failed, setFailed] = useState(false);
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  useEffect(() => {
    let alive = true;
    loadMathGlossary().then((entries) => { if (alive) setGlossary(entries); }).catch(() => {
      if (!alive) return;
      setFailed(true);
      onFailedRef.current?.();
    });
    return () => { alive = false; };
  }, []);
  if (failed) return <div role="status" data-support-panel="vocabulary">Vocabulary could not load. Your teacher can see this.</div>;
  if (!glossary) return <div role="status" data-support-panel="vocabulary">Loading vocabulary…</div>;
  return (
    <dl data-support-panel="vocabulary" style={{ margin: 0, display: 'grid', gap: 8 }}>
      {secureVocabularyEntries(glossary, termIds, { language }).map((entry) => (
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

/**
 * @param entitlement  { tools, language } — already limited to the secure tools
 * @param prompt       the prompt, and nothing else of the item
 * @param question     securePromptOnly(question): the prompt and an authored
 *                     translation of it, if any
 * @param itemKey      the issued item; a new key starts the tray clean
 * @param onEvidence   optional: ({ supportId, eventType, details }) => void
 */
export default function SecureSupportToolsTray({
  entitlement,
  prompt = '',
  question = null,
  itemKey = '',
  surface = 'secure-item',
  onEvidence = null,
}) {
  const [speech] = useState(() => speechAvailable());
  // Kept with the item and language it was resolved for, so the previous
  // item's translation never reaches this item's model or evidence.
  const [resolved, setResolved] = useState(null);
  const [openTool, setOpenTool] = useState(null);
  const [speechFailed, setSpeechFailed] = useState(false);
  const [glossaryFailed, setGlossaryFailed] = useState(false);
  const [readingStarted, setReadingStarted] = useState(false);
  const recordedRef = useRef(new Set());
  const evidenceRef = useRef(onEvidence);
  evidenceRef.current = onEvidence;

  const tools = useMemo(
    () => (entitlement?.tools || []).filter((tool) => SECURE_ACCESS_TOOLS.includes(tool)),
    [entitlement],
  );
  const safeEntitlement = useMemo(() => ({ tools, language: entitlement?.language || null }), [tools, entitlement]);
  const wantsTranslation = tools.includes(SUPPORT_TOOL.TRANSLATE);

  // A new item starts closed and quiet: nothing open, nothing being read, and
  // no Stop reading left over from the item before.
  useEffect(() => {
    setOpenTool(null);
    setSpeechFailed(false);
    setGlossaryFailed(false);
    setReadingStarted(false);
    stopSpeaking();
  }, [itemKey]);

  // Leaving the item for good ends any reading.
  useEffect(() => () => stopSpeaking(), []);

  const translationKey = `${itemKey}|${safeEntitlement.language || ''}`;
  useEffect(() => {
    if (!wantsTranslation) return undefined;
    let alive = true;
    resolveTranslation({ question, text: prompt, language: safeEntitlement.language })
      .then((result) => { if (alive) setResolved({ key: translationKey, result }); });
    return () => { alive = false; };
  }, [translationKey, wantsTranslation]); // eslint-disable-line react-hooks/exhaustive-deps
  const translation = resolved?.key === translationKey ? resolved.result : null;

  const model = useMemo(() => {
    const base = supportToolsForItem({ entitlement: safeEntitlement, prompt, question, toolType: '', speech: speech && !speechFailed });
    const withLanguage = withTranslation(base, translation);
    return {
      ...withLanguage,
      tools: withLanguage.tools.map((tool) => (tool.tool === SUPPORT_TOOL.VOCABULARY && glossaryFailed
        ? { ...tool, state: TOOL_STATE.UNAVAILABLE, reason: 'glossary-load-failed' }
        : tool)),
    };
  }, [safeEntitlement, prompt, question, speech, speechFailed, translation, glossaryFailed]);

  // What this item offered — once per item and fact, as on every assignment.
  useEffect(() => {
    toolEvidenceRecords(model, { surface }).forEach((record) => {
      const key = `${itemKey}|${record.supportId}|${record.eventType}|${record.variant || ''}`;
      if (recordedRef.current.has(key)) return;
      recordedRef.current.add(key);
      evidenceRef.current?.(record);
    });
  }, [model, itemKey, surface]);

  const recordUse = (tool) => {
    const key = `${itemKey}|${tool.supportId}|used`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);
    evidenceRef.current?.({ supportId: tool.supportId, eventType: 'used', details: { surface } });
  };

  const buttons = visibleTools(model);
  if (!buttons.length) return null;

  const press = (tool) => {
    if (tool.tool === SUPPORT_TOOL.READ_ALOUD) {
      // The prompt on screen, in English: a secure item's prompt is not replaced.
      if (speakAloud(prompt, { language: 'en' })) {
        recordUse(tool);
        setReadingStarted(true);
      } else {
        setSpeechFailed(true);
      }
      return;
    }
    setOpenTool((current) => (current === tool.tool ? null : tool.tool));
    recordUse(tool);
  };
  const open = buttons.find((tool) => tool.tool === openTool) || null;

  return (
    <div className="mathmaster-support-tray" data-student-support-tray={surface} role="group" aria-label="Support tools" style={{ margin: '0 0 16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--mm-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Support tools</span>
        {buttons.map((tool) => (
          <button
            key={tool.tool}
            type="button"
            data-support-tool={tool.tool}
            aria-expanded={tool.tool === SUPPORT_TOOL.READ_ALOUD ? undefined : openTool === tool.tool}
            onClick={() => press(tool)}
            style={{ ...BUTTON, background: openTool === tool.tool ? 'var(--mm-primary-soft)' : BUTTON.background }}
          >
            <span aria-hidden="true">{ICON[tool.tool]}</span> {tool.label}
          </button>
        ))}
        {readingStarted && (
          <button
            type="button"
            data-support-stop-reading
            onClick={() => {
              stopSpeaking();
              setReadingStarted(false);
            }}
            style={STOP_BUTTON}
          >
            <span aria-hidden="true">■</span> Stop reading
          </button>
        )}
      </div>
      {speechFailed && <div role="status" style={{ marginTop: 6, fontSize: 12, color: 'var(--mm-warning-text)', fontWeight: 700 }}>Read aloud is not working in this browser. Your teacher can see this.</div>}
      {open && (
        <div role="region" aria-label={open.label} style={PANEL}>
          {open.tool === SUPPORT_TOOL.TRANSLATE && <TranslatePanel translation={open.translation} />}
          {open.tool === SUPPORT_TOOL.VOCABULARY && <VocabularyPanel termIds={open.termIds} language={safeEntitlement.language} onFailed={() => setGlossaryFailed(true)} />}
        </div>
      )}
    </div>
  );
}
