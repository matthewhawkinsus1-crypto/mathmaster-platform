import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluateFunctionSpec } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import { scoreOpenSort } from './openSortMath';
import { readGraphPointCoordinates } from '../../graphPointUtils.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid #c9d6e8', background: '#fff', fontWeight: 800, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: 9, border: '1px solid #c9d6e8', borderRadius: 8, fontSize: 15 };

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
        <CoordinatePlane width={300} height={220} xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 6} yMin={bounds.yMin ?? -6} yMax={bounds.yMax ?? 6} points={item.points.map(pointPair)} ariaLabel={item.ariaLabel || `Graph ${item.label || item.id}`} />
      </div>
    );
  }
  return item?.text ? <div style={{ marginTop: 7, color: '#3c4756', lineHeight: 1.45 }}>{item.text}</div> : null;
};

const emptyGroups = (count) => Array.from({ length: count }, (_, index) => ({ id: `group-${index + 1}`, name: '', rationale: '', itemIds: [] }));

export default function OpenSortBoard({ questionData = {}, onAction }) {
  const items = Array.isArray(questionData.items) ? questionData.items : [];
  const minGroups = Math.max(2, Number(questionData.minGroups || 2));
  const maxGroups = Math.max(minGroups, Number(questionData.maxGroups || 5));
  const rationaleMinLength = Math.max(0, Number(questionData.rationaleMinLength ?? 12));
  const requireRationale = questionData.requireRationale !== false;
  const requireGroupNames = questionData.requireGroupNames !== false;
  const [groups, setGroups] = useState(() => emptyGroups(minGroups));
  const [selectedId, setSelectedId] = useState(null);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const assignedIds = useMemo(() => new Set(groups.flatMap((group) => group.itemIds)), [groups]);
  const unassigned = items.filter((item) => !assignedIds.has(String(item.id)));

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

  const usedGroups = groups.filter((group) => group.itemIds.length);
  const rationaleComplete = !requireRationale || usedGroups.every((group) => group.rationale.trim().length >= rationaleMinLength);
  const namesComplete = !requireGroupNames || usedGroups.every((group) => group.name.trim().length >= 2);
  const ready = unassigned.length === 0 && usedGroups.length >= minGroups && namesComplete && rationaleComplete;

  const check = () => {
    const result = scoreOpenSort({ items, responseGroups: groups, validSchemes: questionData.validSchemes || [] });
    const parts = [
      { id: 'partition', label: 'Mathematical grouping', isComplete: unassigned.length === 0, isCorrect: result.isCorrect },
      { id: 'names', label: 'Group names', isComplete: namesComplete, isCorrect: namesComplete, graded: false },
      { id: 'rationale', label: 'Group explanations', isComplete: rationaleComplete, isCorrect: rationaleComplete, graded: false },
    ];
    submit(
      { isCorrect: result.isCorrect && namesComplete && rationaleComplete, score: result.isCorrect ? 1 : result.score },
      { groups: groups.map(({ id, name, rationale, itemIds }) => ({ id, name, rationale, itemIds })) },
      { matchedSchemeId: result.matchedSchemeId, parts },
    );
  };

  const itemById = (id) => items.find((item) => String(item.id) === String(id));

  return (
    <ToolShell title="Open Sort Board" subtitle="There can be more than one mathematically valid way to organize the same graphs. Build a defensible partition, then explain your thinking." badge="Multiple valid sorts">
      <TaskCard
        question={questionData}
        task="Sort every card into at least two groups. Name your groups and explain the mathematical feature that makes each group belong together."
        steps={[
          'Tap a card to select it, then tap a group to place it there.',
          'Create another group if your sorting idea needs one.',
          'Name each group and explain the mathematical characteristic you used.',
          'Check your sort. MathMaster accepts any partition that matches one of the mathematically valid sorting schemes authored for this task.',
        ]}
        note="Your explanations are saved for your teacher. The automatic grade checks the mathematics of the grouping; it does not pretend to judge the quality of your prose."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.85fr) minmax(0, 1.65fr)', gap: 18 }} className="mathmaster-open-sort-layout">
        <Panel title={`Cards to sort (${unassigned.length} remaining)`}>
          <div style={{ display: 'grid', gap: 10 }}>
            {unassigned.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(String(item.id))} aria-pressed={selectedId === String(item.id)} style={{ ...button, textAlign: 'left', border: selectedId === String(item.id) ? '3px solid #1a73e8' : '1px solid #c9d6e8', background: selectedId === String(item.id) ? '#eef4ff' : '#fff' }}>
                <strong>{item.label || item.id}</strong>
                <SortItemPreview item={item} />
              </button>
            ))}
            {!unassigned.length && <p style={{ color: '#137333', fontWeight: 800 }}>✓ Every card has been placed.</p>}
          </div>
        </Panel>

        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map((group, groupIndex) => (
            <Panel key={group.id} title={`Group ${groupIndex + 1}${group.name ? ` · ${group.name}` : ''}`}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Name this group" style={{ ...input, flex: '1 1 190px' }} />
                <button type="button" disabled={!selectedId} onClick={() => moveSelected(group.id)} style={{ ...button, background: selectedId ? '#1a73e8' : '#f1f3f4', color: selectedId ? '#fff' : '#80868b', border: 0 }}>{selectedId ? 'Place selected card here' : 'Select a card first'}</button>
                {groups.length > minGroups && <button type="button" onClick={() => removeGroup(group.id)} style={{ ...button, color: '#a50e0e' }}>Remove group</button>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 52, padding: 9, borderRadius: 9, border: '1px dashed #9bb8e8', background: '#fff' }}>
                {group.itemIds.map((id) => {
                  const item = itemById(id);
                  return <button type="button" key={id} onClick={() => returnItem(id)} title="Tap to move this card again" style={{ ...button, minHeight: 36, padding: '6px 9px', background: '#eef4ff', color: '#174ea6' }}>{item?.label || id} ↩</button>;
                })}
                {!group.itemIds.length && <span style={{ color: '#80868b', alignSelf: 'center' }}>No cards in this group yet.</span>}
              </div>
              {requireRationale && (
                <label style={{ display: 'block', marginTop: 10, fontWeight: 800, color: '#3c4756' }}>
                  Why do these belong together?
                  <textarea value={group.rationale} onChange={(event) => updateGroup(group.id, { rationale: event.target.value })} placeholder="Describe the graph characteristic you used." rows={2} style={{ ...input, minHeight: 72, resize: 'vertical' }} />
                  <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#5f6b7a' }}>{Math.min(group.rationale.trim().length, rationaleMinLength)}/{rationaleMinLength} characters needed before checking</span>
                </label>
              )}
            </Panel>
          ))}
          {groups.length < maxGroups && <button type="button" onClick={addGroup} style={{ ...button, justifySelf: 'start' }}>+ Add another group</button>}
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={check} disabled={!ready} style={{ ...button, background: ready ? '#1a73e8' : '#dadce0', color: ready ? '#fff' : '#5f6368', border: 0, minHeight: 46 }}>Check my sort</button>
        {!ready && <span style={{ color: '#5f6b7a', fontSize: 13 }}>{unassigned.length ? `Place ${unassigned.length} remaining card${unassigned.length === 1 ? '' : 's'}.` : usedGroups.length < minGroups ? `Use at least ${minGroups} groups.` : !namesComplete ? 'Give each used group a short mathematical name.' : !rationaleComplete ? 'Finish the explanation for each used group.' : 'Finish the sort.'}</span>}
        {feedback && <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Valid mathematical sort' : 'Revise the grouping'}</ResultPill>}
      </div>
      {feedback && !feedback.isCorrect && <p style={{ color: '#5f6b7a', lineHeight: 1.55 }}>Your cards do not yet form one of the valid mathematical partitions for this set. Look for a characteristic that is true for every card inside a group and meaningfully separates it from the other groups.</p>}
      <HintPanel hints={questionData.hints || [
        'Pick one feature you can see on every graph — for example straight versus curved, continuous versus discrete, or always increasing versus changing direction.',
        'A good category rule must work for every card you put in that category, not just most of them.',
        'Try comparing pairs of graphs first. If two share an important feature, see which other graphs share it too.',
      ]} onHintUsed={() => onAction?.('HINT_USED')} />
    </ToolShell>
  );
}
