import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluateFunctionSpec } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import openSortBoardGrader from '../../../functions/shared/serverGrading/tools/openSortBoard.mjs';
import { openSortProgress, openSortSettings, sortCardTable } from './openSortMath';
import { readGraphPointCoordinates } from '../../graphPointUtils.js';
import { SubmitText } from '../shared/ToolRuntimeContext';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import FocusSafeButton from '../../components/common/FocusSafeButton.jsx';
import MathText from '../../components/common/MathText.jsx';
import {
  cardName,
  categoryButtonName,
  focusAfterPlacement,
  focusAfterRemovingGroup,
  focusAfterReturn,
  groupNameInputLabel,
  placeButtonName,
  placeButtonText,
  placedCardName,
  placementAnnouncement,
  rationaleInputLabel,
  removeGroupName,
} from './openSortBoardA11y.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', fontWeight: 800, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: 9, border: '1px solid var(--mm-tint-border)', borderRadius: 8, fontSize: 'calc(15 * var(--mm-px))' };

const functionFor = (spec) => (x) => evaluateFunctionSpec(spec || {}, x);
const pointPair = (point) => readGraphPointCoordinates(point) || [Number.NaN, Number.NaN];

// A circle or a sideways parabola is ONE relation, drawn as one curve in one
// style. Passed as two functions, the plane drew the upper branch solid blue and
// the lower dashed red — two relations, or a part left out — and gave away the
// "two outputs" idea the card is sorted on (walkthrough 2026-10-22, DOL #3 PR 12).
const SAME_CURVE = { stroke: '#1a73e8', strokeWidth: 3 };
const previewLayers = (spec = {}, bounds = {}) => {
  const type = spec.type || 'linear';
  if (type === 'verticalLine') return { functions: [], verticalLines: [Number(spec.x ?? spec.verticalX ?? 0)] };
  if (type === 'circle') {
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    const radius = Math.max(0.1, Number(spec.radius ?? spec.r ?? 3));
    const points = Array.from({ length: 121 }, (_, index) => {
      const angle = (index / 120) * 2 * Math.PI;
      return [h + radius * Math.cos(angle), k + radius * Math.sin(angle)];
    });
    return { functions: [], verticalLines: [], polylines: [{ points, ...SAME_CURVE }] };
  }
  if (type === 'sidewaysParabola') {
    const a = Number(spec.a ?? 1);
    const h = Number(spec.h ?? 0);
    const k = Number(spec.k ?? 0);
    // x = a(y − k)² + h, traced along y across the visible window.
    const yMin = Number(bounds.yMin ?? -6);
    const yMax = Number(bounds.yMax ?? 6);
    const points = Array.from({ length: 121 }, (_, index) => {
      const y = yMin + ((yMax - yMin) * index) / 120;
      return [a * (y - k) ** 2 + h, y];
    });
    return { functions: [], verticalLines: [], polylines: [{ points, ...SAME_CURVE }] };
  }
  return { functions: [functionFor(spec)], verticalLines: [] };
};

// A table of values, drawn with spans in a grid rather than a <table>: the
// card holding it is a button in an open sort, where only phrasing content is
// valid. It reads in order as "x, −2, 0, 3; y, 5, 1, 4".
// Each cell draws its right and bottom edge, the grid its top and left: one
// line between cells, never two.
const TABLE_CELL = { padding: '3px 8px', borderRight: '1px solid var(--mm-tint-border)', borderBottom: '1px solid var(--mm-tint-border)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
const SortItemTable = ({ table }) => (
  <span
    data-sort-card-table="true"
    style={{ display: 'inline-grid', gridTemplateColumns: `auto repeat(${table.x.length}, auto)`, marginTop: 7, borderTop: '1px solid var(--mm-tint-border)', borderLeft: '1px solid var(--mm-tint-border)', color: 'var(--mm-text)' }}
  >
    <span style={{ ...TABLE_CELL, fontWeight: 800, fontStyle: 'italic' }}>x</span>
    {table.x.map((value, index) => <span key={`x${index}`} style={TABLE_CELL}>{value}</span>)}
    <span style={{ ...TABLE_CELL, fontWeight: 800, fontStyle: 'italic' }}>y</span>
    {table.y.map((value, index) => <span key={`y${index}`} style={TABLE_CELL}>{value}</span>)}
  </span>
);

const SortItemPreview = ({ item }) => {
  const table = sortCardTable(item?.table);
  if (table) {
    return (
      <>
        {item?.text ? <span style={{ display: 'block', marginTop: 7, color: 'var(--mm-text)', lineHeight: 1.45 }}>{item.text}</span> : null}
        <SortItemTable table={table} />
      </>
    );
  }
  if (item?.graphSpec) {
    const bounds = item.graph || item.graphBounds || { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
    const layers = previewLayers(item.graphSpec, bounds);
    return (
      <div style={{ maxWidth: 220, margin: '4px auto 0' }}>
        <CoordinatePlane
          // Sits inside the card's own selection button: a nested button is
          // invalid markup and its press would also pick the card.
          enlargeable={false}
          width={300}
          height={220}
          // A circle drawn with unequal units is an ellipse (walkthrough
          // 2026-10-23, DOL #3 Review Q12, Card E): one unit is one unit both ways.
          equalUnits={item.graphSpec?.type === 'circle'}
          xMin={Number(bounds.xMin ?? -6)} xMax={Number(bounds.xMax ?? 6)}
          yMin={Number(bounds.yMin ?? -6)} yMax={Number(bounds.yMax ?? 6)}
          functions={layers.functions}
          polylines={layers.polylines || []}
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

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

const emptyGroups = (count) => Array.from({ length: count }, (_, index) => ({ id: `group-${index + 1}`, name: '', rationale: '', itemIds: [] }));

export default function OpenSortBoard({ questionData = {}, onAction }) {
  const items = Array.isArray(questionData.items) ? questionData.items : [];
  // What the board asks for — shared with the grader, so the Check gate below
  // and the completeness the server records are one definition.
  const settings = openSortSettings(questionData);
  // How many sorts the item accepts, where the delivered question still says
  // (a server-graded copy may not). "Multiple valid sorts" stood on items with
  // exactly one (walkthrough 2026-10-22, DOL #3 PR 10).
  const authoredSortCount = Array.isArray(questionData.validSchemes) ? questionData.validSchemes.length : 0;
  const { controlled, categories, minGroups, maxGroups, rationaleMinLength, requireRationale } = settings;
  const [groups, setGroups] = usePersistentToolState('groups', () => (
    controlled
      ? categories.map((category) => ({ id: String(category.id), name: String(category.label), rationale: '', itemIds: [] }))
      : emptyGroups(minGroups)
  ));
  const [selectedId, setSelectedId] = useState(null);
  // Speech, not work: the polite read-out of the last placement (A11Y-7).
  const [announcement, setAnnouncement] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const { unassigned, usedGroups, namesComplete, rationaleComplete, ready } = openSortProgress({ settings, items, groups });

  /*
   * UNIVERSAL UNDO (TOOL-2). The board's whole answer is `groups`: placements,
   * group names, explanations, and which groups exist — so removing a group,
   * with its name and its two-sentence explanation, is one Undo away. A run of
   * typing in one name or explanation is one step (mathUndoStack.js). The
   * history is this device's only and never rides the synced draft
   * (persistedMathUndo.js).
   */
  const undoState = useMemo(() => ({ groups }), [groups]);
  const restoreBoard = useCallback((restored) => {
    setGroups(Array.isArray(restored?.groups) ? restored.groups : []);
    setSelectedId(null);
    setAnnouncement('');
    clearFeedback();
  }, [setGroups, clearFeedback]);
  useMathUndoHistory({
    label: 'Undo your last change to the sort',
    state: undoState,
    onRestore: restoreBoard,
    resetKey: questionUndoResetKey(questionData),
    persist: true,
  });

  /*
   * WHERE FOCUS GOES AFTER A PRESS (A11Y-2, openSortBoardA11y.js). Asked for by
   * the handler, resolved after the board has re-rendered, so the target
   * exists: cards and group headings are found by their data attributes.
   */
  const boardRef = useRef(null);
  const [focusRequest, setFocusRequest] = useState(null);
  useEffect(() => {
    if (!focusRequest) return;
    setFocusRequest(null);
    const root = boardRef.current;
    if (!root) return;
    const target = focusRequest.kind === 'card'
      ? root.querySelector(`[data-sort-card="${CSS.escape(focusRequest.id)}"]`)
      : root.querySelector(`[data-sort-group="${CSS.escape(focusRequest.id)}"] h3`);
    if (!target) return;
    if (target.tagName === 'H3') target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: false });
  }, [focusRequest]);

  const itemById = (id) => items.find((item) => String(item.id) === String(id));

  const updateGroup = (id, patch) => {
    clearFeedback();
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  };

  const announcePlacement = (itemId, groupId) => {
    const index = groups.findIndex((group) => group.id === String(groupId));
    if (index < 0) return;
    setAnnouncement(placementAnnouncement({
      card: cardName(itemById(itemId), itemId),
      group: groups[index],
      index,
      remaining: unassigned.filter((item) => String(item.id) !== String(itemId)).length,
      controlled,
    }));
  };

  const moveSelected = (groupId) => {
    if (!selectedId) return;
    clearFeedback();
    const placed = selectedId;
    setGroups((current) => current.map((group) => ({
      ...group,
      itemIds: group.id === groupId
        ? [...group.itemIds.filter((id) => id !== placed), placed]
        : group.itemIds.filter((id) => id !== placed),
    })));
    setSelectedId(null);
    announcePlacement(placed, groupId);
    setFocusRequest(focusAfterPlacement({ unplacedBefore: unassigned, placedId: placed, groupId }));
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
    announcePlacement(id, groupId);
    setFocusRequest(focusAfterPlacement({ unplacedBefore: unassigned, placedId: id, groupId }));
  };

  const returnItem = (itemId) => {
    clearFeedback();
    setGroups((current) => current.map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => id !== itemId) })));
    setSelectedId(itemId);
    setAnnouncement('');
    // The button pressed was the placed card, which is gone from its group:
    // focus follows the card back to the cards still to place.
    setFocusRequest(focusAfterReturn(itemId));
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
    setFocusRequest(focusAfterRemovingGroup({ groupsBefore: groups, removedId: id }));
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

  // A PLACED CARD STILL SHOWS WHAT IT SAYS. It collapsed to "Card C ↩", so a
  // student checking their groups could not see the table, graph or sentence
  // being judged without taking the card out (walkthrough 2026-10-22, DOL #3
  // PR 10 and PR 12). It keeps its preview; Move puts it back.
  const placedCard = ({ id, group, groupIndex, controlled: inFixedCategory }) => {
    const item = itemById(id);
    const card = cardName(item, id);
    return (
      <div key={id} data-placed-card={id} style={{ flex: '1 1 170px', minWidth: 0, border: '1px solid var(--mm-primary-border)', borderRadius: 10, padding: 8, background: 'var(--mm-primary-subtle)' }}>
        <strong style={{ display: 'block', marginBottom: 4, color: 'var(--mm-primary-text)' }}><MathText>{card}</MathText></strong>
        {item ? <SortItemPreview item={item} /> : null}
        <button type="button" onClick={() => returnItem(id)} aria-label={placedCardName({ card, group, index: groupIndex, controlled: inFixedCategory })} title="Select to move this card again" style={{ ...button, minHeight: 44, marginTop: 6, padding: '6px 10px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)' }}>
          Move <span aria-hidden="true">↩</span>
        </button>
      </div>
    );
  };

  return (
    <ToolShell
      title={controlled ? 'Controlled Sort' : 'Open Sort Board'}
      subtitle={controlled
        ? 'Every card belongs in one teacher-defined category. Place each card, then check the complete sort.'
        : 'There can be more than one mathematically valid way to organize the same graphs. Build a defensible partition, then explain your thinking.'}
      badge={controlled ? 'Fixed categories' : authoredSortCount > 1 ? 'Multiple valid sorts' : 'Make your own groups'}
    >
      <TaskCard
        question={questionData}
        task={controlled
          ? 'Place every card into one of the provided categories. Each card has one correct destination.'
          : 'Sort every card into at least two groups. Name your groups and explain the mathematical feature that makes each group belong together.'}
        stepsAreControls
        steps={controlled ? [
          'Read or inspect one card.',
          'Select the category that best describes it.',
          'Select a placed card to move it back if you want to change your choice.',
          'When every card is placed, submit your sort.',
        ] : [
          'Select a card, then select a group to place it there.',
          'Create another group if your sorting idea needs one.',
          'Name each group and explain the mathematical characteristic you used.',
          authoredSortCount > 1
            ? 'Submit your sort when it is finished. More than one way of grouping can be right, as long as every card in a group shares the feature you named.'
            : 'Submit your sort when it is finished: every card in a group should share the feature you named.',
        ]}
        note={controlled ? 'The categories are fixed, so the automatic grade checks the exact mathematical classification.' : 'Your explanations are saved for your teacher. The automatic grade checks the mathematics of the grouping; it does not pretend to judge the quality of your prose.'}
      />

      <p role="status" aria-live="polite" style={srOnly}>{announcement}</p>

      {controlled ? (
        <div ref={boardRef}>
          <Panel title={`Cards to classify (${unassigned.length} remaining)`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 }}>
              {unassigned.map((item) => {
                const card = cardName(item);
                return (
                  <div key={item.id} style={{ border: '1px solid var(--mm-tint-border)', borderRadius: 12, padding: 10, background: 'var(--mm-surface)' }}>
                    {/* A card named by its mathematics ("1/x^(1/2)" on a Rational
                        Exponents card) shows it typeset, not its keystrokes. */}
                    <strong style={{ display: 'block', marginBottom: 6 }}><MathText>{card}</MathText></strong>
                    <SortItemPreview item={item} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8, marginTop: 10 }}>
                      {categories.map((category, categoryIndex) => (
                        <button
                          key={category.id}
                          type="button"
                          // The first category of each card is where focus lands
                          // when the card before it is placed (A11Y-2).
                          data-sort-card={categoryIndex === 0 ? String(item.id) : undefined}
                          aria-label={categoryButtonName({ category, card })}
                          onClick={() => placeItem(item.id, category.id)}
                          style={{ ...button, minHeight: 48, background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)' }}
                        >
                          {category.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!unassigned.length && <p style={{ color: 'var(--mm-success-text)', fontWeight: 800 }}>✓ Every card has been classified.</p>}
            </div>
          </Panel>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12, marginTop: 12 }}>
            {groups.map((group, groupIndex) => (
              <div key={group.id} data-sort-group={group.id}>
                <Panel title={group.name}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 52 }}>
                    {group.itemIds.map((id) => placedCard({ id, group, groupIndex, controlled: true }))}
                    {!group.itemIds.length && <span style={{ color: 'var(--mm-text-subtle)', alignSelf: 'center' }}>No cards here yet.</span>}
                  </div>
                </Panel>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div ref={boardRef} style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 240px), 0.85fr) minmax(0, 1.65fr)', gap: 18 }} className="mathmaster-open-sort-layout">
        <Panel title={`Cards to sort (${unassigned.length} remaining)`}>
          <div style={{ display: 'grid', gap: 10 }}>
            {unassigned.map((item) => (
              <button key={item.id} type="button" data-sort-card={String(item.id)} onClick={() => setSelectedId(String(item.id))} aria-pressed={selectedId === String(item.id)} style={{ ...button, textAlign: 'left', border: selectedId === String(item.id) ? '3px solid #1a73e8' : '1px solid var(--mm-tint-border)', background: selectedId === String(item.id) ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)' }}>
                <strong><MathText>{cardName(item)}</MathText></strong>
                <SortItemPreview item={item} />
              </button>
            ))}
            {!unassigned.length && <p style={{ color: 'var(--mm-success-text)', fontWeight: 800 }}>✓ Every card has been placed.</p>}
          </div>
        </Panel>

        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map((group, groupIndex) => {
            const selectedCard = selectedId ? cardName(itemById(selectedId), selectedId) : '';
            return (
              <div key={group.id} data-sort-group={group.id}>
                <Panel title={`Group ${groupIndex + 1}${group.name ? ` · ${group.name}` : ''}`}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                    <input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Name this group" aria-label={groupNameInputLabel(groupIndex)} style={{ ...input, flex: '1 1 190px' }} />
                    {/* Disables itself on the press that places the card; focus
                        has already been sent on to the next card (A11Y-2), and
                        while it is still here it stays focusable. */}
                    <FocusSafeButton enabled={Boolean(selectedId)} onClick={() => moveSelected(group.id)} aria-label={placeButtonName({ selectedCard, group, index: groupIndex })} style={{ ...button, background: selectedId ? '#1a73e8' : 'var(--mm-surface-control)', color: selectedId ? '#fff' : 'var(--mm-text-subtle)', border: 0 }}>{placeButtonText(selectedCard)}</FocusSafeButton>
                    {groups.length > minGroups && <button type="button" onClick={() => removeGroup(group.id)} aria-label={removeGroupName(group, groupIndex)} style={{ ...button, color: 'var(--mm-error-text)' }}>Remove group</button>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 52, padding: 9, borderRadius: 9, border: '1px dashed var(--mm-primary-border)', background: 'var(--mm-surface)' }}>
                    {group.itemIds.map((id) => placedCard({ id, group, groupIndex, controlled: false }))}
                    {!group.itemIds.length && <span style={{ color: 'var(--mm-text-subtle)', alignSelf: 'center' }}>No cards in this group yet.</span>}
                  </div>
                  {/* The explanation is for the teacher, never marked right or
                      wrong (GR16): the counter is only the length the Check
                      waits for, and once that is met it says who reads it. */}
                  {requireRationale && (
                    <label style={{ display: 'block', marginTop: 10, fontWeight: 800, color: 'var(--mm-text)' }}>
                      Why do these belong together? <span data-rationale-audience="" style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}>For your teacher</span>
                      <textarea value={group.rationale} onChange={(event) => updateGroup(group.id, { rationale: event.target.value })} aria-label={rationaleInputLabel(group, groupIndex)} placeholder="Describe the feature every card in this group shares." rows={2} style={{ ...input, fontFamily: 'inherit', minHeight: 72, resize: 'vertical' }} />
                      <span style={{ display: 'block', marginTop: 4, fontSize: 'calc(11 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{group.rationale.trim().length < rationaleMinLength
                        ? `${group.rationale.trim().length}/${rationaleMinLength} characters needed before checking`
                        : 'Saved for your teacher. It is not marked right or wrong.'}</span>
                    </label>
                  )}
                </Panel>
              </div>
            );
          })}
          {groups.length < maxGroups && <button type="button" onClick={addGroup} style={{ ...button, justifySelf: 'start' }}>+ Add another group</button>}
        </div>
      </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" data-work-view-check="true" onClick={check} disabled={!ready} style={{ ...button, background: ready ? '#1a73e8' : '#dadce0', color: ready ? '#fff' : 'var(--mm-text-muted)', border: 0, minHeight: 46 }}><SubmitText>Check my sort</SubmitText></button>
        {!ready && <span style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>{unassigned.length ? `Place ${unassigned.length} remaining card${unassigned.length === 1 ? '' : 's'}.` : usedGroups.length < minGroups ? `Use at least ${minGroups} groups.` : !namesComplete ? 'Give each used group a short mathematical name.' : !rationaleComplete ? 'Finish the explanation for each used group.' : 'Finish the sort.'}</span>}
        {feedback && <ResultPill ok={feedback.isCorrect} message={feedback.isCorrect ? null : (controlled ? 'At least one card is in the wrong category. Recheck the defining feature of each fixed category, move any card you want to change, and try again.' : 'Not every group holds together yet. A group needs one feature that every card in it has and the cards in your other groups do not. Check each card against its group\'s name.')}>{feedback.isCorrect ? (controlled ? 'Correct classification' : 'Valid mathematical sort') : (controlled ? 'Some cards need to move' : 'Revise the grouping')}</ResultPill>}
      </div>
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
