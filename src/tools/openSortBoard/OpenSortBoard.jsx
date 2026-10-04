import React, { useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluateFunctionSpec } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import openSortBoardGrader from '../../../functions/shared/serverGrading/tools/openSortBoard.mjs';
import { openSortProgress, openSortSettings } from './openSortMath';
import { readGraphPointCoordinates } from '../../graphPointUtils.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', fontWeight: 800, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: 9, border: '1px solid var(--mm-tint-border)', borderRadius: 8, fontSize: 15 };

const functionFor = (spec) => (x) => evaluateFunctionSpec(spec || {}, x);
const pointPair = (point) => readGraphPointCoordinates(point) || [Number.NaN, Number.NaN];

const previewLayers = (spec = {}) => {
  const type = spec.type || 'linear';
  if (type === 'verticalLine') return { functions: [], verticalLines: [Number(spec.x ?? spec.verticalX ?? 0)] };
  if (type === 'circle') {
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const radius = Math.max(0.1, Number(spec.radius ?? spec.r ?? 3));
    const branch = (sign) => (x) => {
      const inside = radius ** 2 - (Number(x) - h) ** 2;
      return inside < 0 ? Number.NaN : k + sign * Math.sqrt(inside);
    };
    return { functions: [branch(1), branch(-1)], verticalLines: [] };
  }
  if (type === 'sidewaysParabola') {
    const a = Number(spec.a ?? 1);
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const branch = (sign) => (x) => {
      const inside = (Number(x) - h) / a;
      return inside < 0 ? Number.NaN : k + sign * Math.sqrt(inside);
    };
    return { functions: [branch(1), branch(-1)], verticalLines: [] };
  }
  return { functions: [functionFor(spec)], verticalLines: [] };
};

const SortItemPreview = ({ item }) => {
  if (item?.graphSpec) {
    const bounds = item.graph || item.graphBounds || { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
    const layers = previewLayers(item.graphSpec);
    return (
      <div style={{ maxWidth: 220, margin: '4px auto 0' }}>
        <CoordinatePlane
          // Sits inside the card's own selection button: a nested button is
          // invalid markup and its press would also pick the card.
          enlargeable={false}
          width={300}
          height={220}
          xMin={Number(bounds.xMin ?? -6)} xMax={Number(bounds.xMax ?? 6)}
          yMin={Number(bounds.yMin ?? -6)} yMax={Number(bounds.yMax ?? 6)}
          functions={layers.functions}
          verticalLines={layers.verticalLines}
          ariaLabel={item.ariaLabel || `Graph ${item.label || item.id}`}
        />
      </div>
    );
  }
  if (Array.isArray(item?.points)) {
    const bounds = item.graph || { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
    return (
      <div style={{ maxWidth: 220, margin: '4px auto 0' }}>
        <CoordinatePlane enlargeable={false} width={300} height={220} xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 6} yMin={bounds.yMin ?? -6} yMax={bounds.yMax ?? 6} points={item.points.map(pointPair)} ariaLabel={item.ariaLabel || `Graph ${item.label || item.id}`} />
      </div>
    );
  }
  return item?.text ? <div style={{ marginTop: 7, color: 'var(--mm-text)', lineHeight: 1.45 }}>{item.text}</div> : null;
};

const emptyGroups = (count) => Array.from({ length: count }, (_, index) => ({ id: `group-${index + 1}`, name: '', rationale: '', itemIds: [] }));

export default function OpenSortBoard({ questionData = {}, onAction }) {
  const items = Array.isArray(questionData.items) ? questionData.items : [];
  // What the board asks for — shared with the grader, so the Check gate below
  // and the completeness the server records are one definition.
  const settings = openSortSettings(questionData);
  const { controlled, categories, minGroups, maxGroups, rationaleMinLength, requireRationale } = settings;
  const [groups, setGroups] = usePersistentToolState('groups', () => (
    controlled
      ? categories.map((category) => ({ id: String(category.id), name: String(category.label), rationale: '', itemIds: [] }))
      : emptyGroups(minGroups)
  ));
  const [selectedId, setSelectedId] = useState(null);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const { unassigned, usedGroups, namesComplete, rationaleComplete, ready } = openSortProgress({ settings, items, groups });

  const updateGroup = (id, patch) => {
    clearFeedback();
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  };

  const moveSelected = (groupId) => {
    if (!selectedId) return;
    clearFeedback();
    setGroups((current) => current.map((group) => ({
      ...group,
      itemIds: group.id === groupId
        ? [...group.itemIds.filter((id) => id !== selectedId), selectedId]
        : group.itemIds.filter((id) => id !== selectedId),
    })));
    setSelectedId(null);
  };

  const placeItem = (itemId, groupId) => {
    if (!itemId || !groupId) return;
    clearFeedback();
    const id = String(itemId);
    setGroups((current) => current.map((group) => ({
      ...group,
      itemIds: group.id === String(groupId)
        ? [...group.itemIds.filter((entry) => entry !== id), id]
        : group.itemIds.filter((entry) => entry !== id),
    })));
    setSelectedId(null);
  };

  const returnItem = (itemId) => {
    clearFeedback();
    setGroups((current) => current.map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => id !== itemId) })));
    setSelectedId(itemId);
  };

  const addGroup = () => {
    if (groups.length >= maxGroups) return;
    setGroups((current) => [...current, { id: `group-${Date.now()}`, name: '', rationale: '', itemIds: [] }]);
    clearFeedback();
  };

  const removeGroup = (id) => {
    if (groups.length <= minGroups) return;
    setGroups((current) => current.filter((group) => group.id !== id));
    clearFeedback();
  };

  // The student's work: exactly the groups on the board. Reported live so a
  // deadline can finalize it, and submitted as-is by Check.
  const work = { groups: groups.map(({ id, name, rationale, itemIds }) => ({ id, name, rationale, itemIds })) };
  useReportToolWork(work);

  /*
   * THE VERDICT IS THE SHARED GRADER'S (functions/shared/serverGrading/tools/
   * openSortBoard.mjs), through the same bounded bytes the server re-grades.
   * Only non-secret metadata rides along: never the matched scheme, which
   * names the answer key.
   */
  const check = () => {
    const result = gradeToolCheck(openSortBoardGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode: controlled ? 'controlled' : 'open', parts: result.parts },
    );
  };

  const itemById = (id) => items.find((item) => String(item.id) === String(id));

  return (
    <ToolShell
      title={controlled ? 'Controlled Sort' : 'Open Sort Board'}
      subtitle={controlled
        ? 'Every card belongs in one teacher-defined category. Place each card, then check the complete sort.'
        : 'There can be more than one mathematically valid way to organize the same graphs. Build a defensible partition, then explain your thinking.'}
      badge={controlled ? 'Fixed categories' : 'Multiple valid sorts'}
    >
      <TaskCard
        question={questionData}
        task={controlled
          ? 'Place every card into one of the provided categories. Each card has one correct destination.'
          : 'Sort every card into at least two groups. Name your groups and explain the mathematical feature that makes each group belong together.'}
        steps={controlled ? [
          'Read or inspect one card.',
          'Tap the category that best describes it.',
          'Tap a placed card to move it back if you want to change your choice.',
          'Check the sort after every card has been placed.',
        ] : [
          'Tap a card to select it, then tap a group to place it there.',
          'Create another group if your sorting idea needs one.',
          'Name each group and explain the mathematical characteristic you used.',
          'Check your sort. MathMaster accepts any partition that matches one of the mathematically valid sorting schemes authored for this task.',
        ]}
        note={controlled ? 'The categories are fixed, so the automatic grade checks the exact mathematical classification.' : 'Your explanations are saved for your teacher. The automatic grade checks the mathematics of the grouping; it does not pretend to judge the quality of your prose.'}
      />

      {controlled ? (
        <>
          <Panel title={`Cards to classify (${unassigned.length} remaining)`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 }}>
              {unassigned.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--mm-tint-border)', borderRadius: 12, padding: 10, background: 'var(--mm-surface)' }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>{item.label || item.id}</strong>
                  <SortItemPreview item={item} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8, marginTop: 10 }}>
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => placeItem(item.id, category.id)}
                        style={{ ...button, minHeight: 48, background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)' }}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!unassigned.length && <p style={{ color: 'var(--mm-success-text)', fontWeight: 800 }}>✓ Every card has been classified.</p>}
            </div>
          </Panel>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12, marginTop: 12 }}>
            {groups.map((group) => (
              <Panel key={group.id} title={group.name}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 52 }}>
                  {group.itemIds.map((id) => {
                    const item = itemById(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        onClick={() => returnItem(id)}
                        title="Tap to move this card again"
                        style={{ ...button, minHeight: 40, background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)' }}
                      >
                        {item?.label || id} ↩
                      </button>
                    );
                  })}
                  {!group.itemIds.length && <span style={{ color: 'var(--mm-text-subtle)', alignSelf: 'center' }}>No cards here yet.</span>}
                </div>
              </Panel>
            ))}
          </div>
        </>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 240px), 0.85fr) minmax(0, 1.65fr)', gap: 18 }} className="mathmaster-open-sort-layout">
        <Panel title={`Cards to sort (${unassigned.length} remaining)`}>
          <div style={{ display: 'grid', gap: 10 }}>
            {unassigned.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(String(item.id))} aria-pressed={selectedId === String(item.id)} style={{ ...button, textAlign: 'left', border: selectedId === String(item.id) ? '3px solid #1a73e8' : '1px solid var(--mm-tint-border)', background: selectedId === String(item.id) ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)' }}>
                <strong>{item.label || item.id}</strong>
                <SortItemPreview item={item} />
              </button>
            ))}
            {!unassigned.length && <p style={{ color: 'var(--mm-success-text)', fontWeight: 800 }}>✓ Every card has been placed.</p>}
          </div>
        </Panel>

        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map((group, groupIndex) => (
            <Panel key={group.id} title={`Group ${groupIndex + 1}${group.name ? ` · ${group.name}` : ''}`}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Name this group" style={{ ...input, flex: '1 1 190px' }} />
                <button type="button" disabled={!selectedId} onClick={() => moveSelected(group.id)} style={{ ...button, background: selectedId ? '#1a73e8' : 'var(--mm-surface-control)', color: selectedId ? '#fff' : 'var(--mm-text-subtle)', border: 0 }}>{selectedId ? 'Place selected card here' : 'Select a card first'}</button>
                {groups.length > minGroups && <button type="button" onClick={() => removeGroup(group.id)} style={{ ...button, color: 'var(--mm-error-text)' }}>Remove group</button>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 52, padding: 9, borderRadius: 9, border: '1px dashed var(--mm-primary-border)', background: 'var(--mm-surface)' }}>
                {group.itemIds.map((id) => {
                  const item = itemById(id);
                  return <button type="button" key={id} onClick={() => returnItem(id)} title="Tap to move this card again" style={{ ...button, minHeight: 36, padding: '6px 9px', background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)' }}>{item?.label || id} ↩</button>;
                })}
                {!group.itemIds.length && <span style={{ color: 'var(--mm-text-subtle)', alignSelf: 'center' }}>No cards in this group yet.</span>}
              </div>
              {requireRationale && (
                <label style={{ display: 'block', marginTop: 10, fontWeight: 800, color: 'var(--mm-text)' }}>
                  Why do these belong together?
                  <textarea value={group.rationale} onChange={(event) => updateGroup(group.id, { rationale: event.target.value })} placeholder="Describe the graph characteristic you used." rows={2} style={{ ...input, minHeight: 72, resize: 'vertical' }} />
                  <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--mm-text-muted)' }}>{Math.min(group.rationale.trim().length, rationaleMinLength)}/{rationaleMinLength} characters needed before checking</span>
                </label>
              )}
            </Panel>
          ))}
          {groups.length < maxGroups && <button type="button" onClick={addGroup} style={{ ...button, justifySelf: 'start' }}>+ Add another group</button>}
        </div>
      </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={check} disabled={!ready} style={{ ...button, background: ready ? '#1a73e8' : '#dadce0', color: ready ? '#fff' : 'var(--mm-text-muted)', border: 0, minHeight: 46 }}>Check my sort</button>
        {!ready && <span style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>{unassigned.length ? `Place ${unassigned.length} remaining card${unassigned.length === 1 ? '' : 's'}.` : usedGroups.length < minGroups ? `Use at least ${minGroups} groups.` : !namesComplete ? 'Give each used group a short mathematical name.' : !rationaleComplete ? 'Finish the explanation for each used group.' : 'Finish the sort.'}</span>}
        {feedback && <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? (controlled ? 'Correct classification' : 'Valid mathematical sort') : (controlled ? 'Some cards need to move' : 'Revise the grouping')}</ResultPill>}
      </div>
      {feedback && !feedback.isCorrect && <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>{controlled ? 'At least one card is in the wrong category. Recheck the defining feature of each fixed category, move any card you want to change, and try again.' : 'Your cards do not yet form one of the valid mathematical partitions for this set. Look for a characteristic that is true for every card inside a group and meaningfully separates it from the other groups.'}</p>}
      <HintPanel hints={questionData.hints || (controlled ? [
        'Use the category definitions as tests. A card should satisfy exactly one of them.',
        'If a graph rises from left to right, that is positive association; if it falls, that is negative association.',
        'If the points do not show a consistent upward or downward linear pattern, use the no-correlation category.',
      ] : [
        'Pick one feature you can see on every graph — for example straight versus curved, continuous versus discrete, or always increasing versus changing direction.',
        'A good category rule must work for every card you put in that category, not just most of them.',
        'Try comparing pairs of graphs first. If two share an important feature, see which other graphs share it too.',
      ])} onHintUsed={() => onAction?.('HINT_USED')} />
    </ToolShell>
  );
}
