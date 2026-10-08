import React, { useEffect, useRef, useState } from 'react';
import {
  MAX_CATALOG_ITEMS,
  MAX_DESCRIPTION_LENGTH,
  MAX_ITEM_COST,
  MAX_LABEL_LENGTH,
  MAX_WEEKLY_LIMIT,
  MIN_ITEM_COST,
} from '../../../functions/shared/classRewardCatalog.mjs';
import {
  availableStarters,
  catalogIsFull,
  catalogPayload,
  draftChanged,
  draftFromCatalog,
  draftItemProblem,
  draftProblem,
  emptyCatalogItem,
  teacherRewardActionError,
} from '../../platform/rewards/classRewardsModel.js';
import { useClassRewardCatalog } from '../../platform/rewards/useClassRewards.js';
import { readClassRewardDraft, writeClassRewardDraft } from '../../platform/rewards/classRewardDraftStore.js';
import './rewards.css';

/*
 * THE TEACHER'S CLASS REWARD LIST: add, edit, turn off, remove, save.
 *
 * Class rewards are things a teacher hands out in the room — a seat choice,
 * music, being the DJ — priced in Class Points. They never touch a grade:
 * the server refuses any item that mentions homework, extra credit, a quiz
 * and so on (classRewardCatalog.mjs), and this editor shows that refusal on
 * the item before Save is ever pressed. The Practice Pass is separate and
 * unchanged.
 *
 * Edits are a local draft until Save. Save sends the revision the draft
 * started from, so a save from a second, stale tab is refused instead of
 * silently overwriting the first ("Reload" brings the newer list in).
 *
 * Props: classId (required), className (optional, for the heading).
 */
const LIMIT_OPTIONS = [0, ...Array.from({ length: MAX_WEEKLY_LIMIT }, (_, index) => index + 1)];
const limitText = (value) => (value === 0 ? 'No weekly limit' : value === 1 ? 'Once a week per student' : `${value} times a week per student`);

function ItemEditor({ item, index, onChange, onRemove, disabled }) {
  const problem = draftItemProblem(item);
  const fieldId = (name) => `class-reward-${item.itemId}-${name}`;
  const problemId = `class-reward-${item.itemId}-problem`;
  const invalid = (field) => (problem && (problem.field === field || (!problem.field && field === 'label')) ? 'true' : undefined);
  return (
    // A full-width grid: .rw-row's space-between would otherwise shrink the
    // column to its content and leave the fields narrow on a wide screen.
    <li className="rw-row" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'stretch', alignItems: 'stretch' }} data-qa="catalog-item">
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <label className="rw-label" htmlFor={fieldId('label')}>
          Reward name
          <input
            id={fieldId('label')}
            className="rw-input"
            value={item.label}
            maxLength={MAX_LABEL_LENGTH}
            disabled={disabled}
            aria-invalid={invalid('label')}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => onChange(index, { label: event.target.value })}
            placeholder="Choose your seat for a day"
          />
        </label>
        <label className="rw-label" htmlFor={fieldId('description')}>
          What the student gets (optional)
          <input
            id={fieldId('description')}
            className="rw-input"
            value={item.description || ''}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={disabled}
            aria-invalid={invalid('description')}
            onChange={(event) => onChange(index, { description: event.target.value })}
          />
        </label>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <label className="rw-label" htmlFor={fieldId('cost')}>
            Price (Class Points)
            <input
              id={fieldId('cost')}
              className="rw-input"
              type="number"
              inputMode="numeric"
              min={MIN_ITEM_COST}
              max={MAX_ITEM_COST}
              step={1}
              value={item.cost}
              disabled={disabled}
              aria-invalid={invalid('cost')}
              onChange={(event) => onChange(index, { cost: event.target.value === '' ? '' : Number(event.target.value) })}
            />
          </label>
          <label className="rw-label" htmlFor={fieldId('limit')}>
            How often
            <select
              id={fieldId('limit')}
              className="rw-input"
              value={Number(item.weeklyLimitPerStudent) || 0}
              disabled={disabled}
              onChange={(event) => onChange(index, { weeklyLimitPerStudent: Number(event.target.value) })}
            >
              {LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{limitText(value)}</option>)}
            </select>
          </label>
        </div>
      </div>
      {/* Linked to the name field, not an alert: a blank new row is not news. */}
      {problem && <p id={problemId} className="rw-feedback rw-feedback--bad" style={{ margin: 0 }}>{problem.message}</p>}
      <div className="rw-actions" style={{ marginTop: 0 }}>
        <label className="rw-choice" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={item.active !== false}
            disabled={disabled}
            onChange={(event) => onChange(index, { active: event.target.checked })}
          />
          <span>{item.active !== false ? 'Students can use it' : 'Turned off (hidden from students)'}</span>
        </label>
        <button type="button" className="rw-button rw-button--quiet rw-button--small" disabled={disabled} onClick={() => onRemove(index)}>
          Remove
        </button>
      </div>
    </li>
  );
}

/*
 * Keyed by class so switching classes always starts a fresh editor: an
 * unsaved draft, its base revision and the just-saved marker all belong to
 * ONE class. Kept in place, a draft for class A could be saved over class B's
 * list (same revision number, so the stale-tab check would not catch it).
 * Done here rather than asked of the caller, so no mounting can get it wrong.
 */
// `ownerUid`: the signed-in teacher's auth uid, so unsaved edits are kept for
// this tab and account (classRewardDraftStore.js) and cleared at sign-out.
export default function ClassRewardCatalogEditor({ classId, className = '', ownerUid = null }) {
  return <ClassCatalogEditorBody key={classId || 'no-class'} classId={classId} className={className} ownerUid={ownerUid} />;
}

function ClassCatalogEditorBody({ classId, className, ownerUid }) {
  const { catalog, loaded, unavailable, save } = useClassRewardCatalog({ classId, enabled: Boolean(classId) });
  // Unsaved edits from an earlier visit to this class come back, and say so.
  const [kept] = useState(() => readClassRewardDraft({ ownerUid, classId }));
  const [draft, setDraft] = useState(() => kept?.draft || []);
  const [baseRevision, setBaseRevision] = useState(() => kept?.baseRevision || 0);
  const [dirty, setDirty] = useState(() => Boolean(kept));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(() => (kept ? { kind: 'info', text: 'Your unsaved changes to this list were kept. Save them, or reload the saved list.' } : null));
  const [stale, setStale] = useState(false);
  const [startersOpen, setStartersOpen] = useState(false);
  const inFlight = useRef(false);
  const savedRevision = useRef(0);

  // The server's list replaces the draft only while the teacher has not
  // started editing; otherwise their work is kept and Save will say if the
  // list moved underneath them.
  useEffect(() => {
    if (dirty) return;
    // Just saved, and the listener has not caught up yet: keep the saved draft
    // on screen rather than flashing the list from before the save.
    if ((Number(catalog?.revision) || 0) < savedRevision.current) return;
    setDraft(draftFromCatalog(catalog));
    setBaseRevision(Number(catalog?.revision) || 0);
    // An empty list opens the suggestions: the fastest start is one click.
    if (!draftFromCatalog(catalog).length) setStartersOpen(true);
  }, [catalog, dirty]);

  // While the list has unsaved changes they are kept for this tab, and leaving
  // the page asks first.
  useEffect(() => {
    writeClassRewardDraft({ ownerUid, classId, draft: dirty ? draft : null, baseRevision });
  }, [ownerUid, classId, draft, dirty, baseRevision]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next) => { setDraft(next); setDirty(true); setFeedback(null); };
  const changeItem = (index, patch) => update(draft.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const removeItem = (index) => update(draft.filter((_, position) => position !== index));
  const addItem = () => update([...draft, emptyCatalogItem(draft)]);
  const addStarter = (starter) => update([...draft, { ...starter, active: true }]);
  const reload = () => {
    setDraft(draftFromCatalog(catalog));
    setBaseRevision(Number(catalog?.revision) || 0);
    setDirty(false);
    setStale(false);
    setFeedback(null);
  };

  const problem = draftProblem(classId, draft);
  const changed = draftChanged(catalog, draft);
  const full = catalogIsFull(draft);
  const starters = availableStarters(draft);

  const onSave = async () => {
    if (inFlight.current || problem || !changed) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await save({ classId, items: catalogPayload(draft), baseRevision });
      savedRevision.current = Number(result?.catalog?.revision) || baseRevision + 1;
      setBaseRevision(savedRevision.current);
      setDirty(false);
      setStale(false);
      setFeedback({ kind: 'ok', text: 'Saved. Students see the new list now.' });
    } catch (error) {
      if (error?.details?.reason === 'stale-revision' || /changed somewhere else/.test(String(error?.message || ''))) setStale(true);
      setFeedback({ kind: 'bad', text: teacherRewardActionError(error) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="class-reward-editor-heading" className="rw-card" data-qa="class-reward-editor">
      <h2 id="class-reward-editor-heading">🎁 Class rewards{className ? ` — ${className}` : ''}</h2>
      <p className="rw-text">
        Things you hand out in class that students buy with Class Points. They never change a grade or required work —
        a reward that mentions homework, extra credit, a quiz or a test is refused. The Practice Pass stays available as before.
      </p>
      {unavailable && <p className="rw-feedback rw-feedback--info" role="status">The reward list could not load. Check again in a minute.</p>}
      {!loaded && !unavailable && <p className="rw-muted" role="status">Loading…</p>}

      {loaded && !unavailable && (
        <>
          {draft.length === 0 ? (
            <p className="rw-muted" style={{ marginTop: 12 }}>No class rewards yet. Start from a suggestion below, or add your own.</p>
          ) : (
            <ul className="rw-list" aria-label="Your class rewards">
              {draft.map((item, index) => (
                <ItemEditor key={item.itemId} item={item} index={index} onChange={changeItem} onRemove={removeItem} disabled={busy} />
              ))}
            </ul>
          )}

          <div className="rw-actions">
            <button type="button" className="rw-button rw-button--secondary" disabled={busy || full} onClick={addItem}>Add a reward</button>
            {full && <span className="rw-muted">{MAX_CATALOG_ITEMS} rewards is the most a class can have. Remove one to add another.</span>}
          </div>

          {starters.length > 0 && !full && (
            <details className="rw-disclosure" open={startersOpen} onToggle={(event) => setStartersOpen(event.currentTarget.open)}>
              <summary>Suggestions you can add in one click</summary>
              <ul className="rw-list">
                {starters.map((starter) => (
                  <li key={starter.itemId} className="rw-row">
                    <span className="rw-row__main">
                      <span className="rw-row__title">{starter.label}</span>
                      <span className="rw-muted" style={{ display: 'block' }}>{starter.cost} points · {limitText(starter.weeklyLimitPerStudent)}</span>
                    </span>
                    <button type="button" className="rw-button rw-button--secondary rw-button--small" disabled={busy} onClick={() => addStarter(starter)} aria-label={`Add ${starter.label}`}>
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {problem && draft.length > 0 && draft.every((item) => !draftItemProblem(item)) && (
            <p className="rw-feedback rw-feedback--bad" role="alert">{problem}</p>
          )}
          {feedback && (
            <p className={`rw-feedback ${feedback.kind === 'ok' ? 'rw-feedback--ok' : feedback.kind === 'info' ? 'rw-feedback--info' : 'rw-feedback--bad'}`} role={feedback.kind === 'bad' ? 'alert' : 'status'}>
              {feedback.text}
            </p>
          )}
          <div className="rw-actions">
            <button type="button" className="rw-button" disabled={busy || Boolean(problem) || !changed} onClick={onSave}>
              {busy ? 'Saving…' : 'Save rewards'}
            </button>
            {(dirty || stale) && (
              <button type="button" className="rw-button rw-button--quiet" disabled={busy} onClick={reload}>
                {stale ? 'Reload the newer list' : 'Undo my changes'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
