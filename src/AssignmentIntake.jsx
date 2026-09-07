import { useCallback, useEffect, useMemo, useState } from 'react';
import AssignmentIntakeBase from './AssignmentIntakeBase.jsx';
import IncompleteAssignmentRepairCenter from './components/teacher/IncompleteAssignmentRepairCenter.jsx';
import { canSalvageV5IntakeResult } from './platform/preflight/assignmentAuthoringState.js';
import {
  deleteIncompleteAssignmentDraft,
  listIncompleteAssignmentDrafts,
  restoreIncompleteAssignmentV5,
  saveIncompleteAssignmentDraft,
} from './platform/preflight/incompleteAssignmentDraftStore.js';

const card = {
  border: '1px solid #f1c27d',
  borderRadius: 12,
  background: '#fff8e1',
  padding: 16,
  textAlign: 'left',
};

const button = {
  minHeight: 36,
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid #b7c7de',
  background: '#fff',
  color: '#174ea6',
  fontWeight: 900,
  cursor: 'pointer',
};

export default function AssignmentIntake(props) {
  const { onJsonReady, toastSuccess, toastError, toastInfo } = props;
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [draftBusyId, setDraftBusyId] = useState(null);
  const [repairDraftId, setRepairDraftId] = useState(null);

  const refreshDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      setDrafts(await listIncompleteAssignmentDrafts());
    } catch (error) {
      console.warn('Could not load incomplete assignment drafts:', error);
      setDrafts([]);
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  const handleJsonReady = useCallback(async ({ text, sourceName }) => {
    const result = await onJsonReady({ text, sourceName });
    if (result?.ok || !canSalvageV5IntakeResult(result)) return result;

    try {
      const saved = await saveIncompleteAssignmentDraft({
        intakeResult: result,
        rawText: text,
        sourceName,
      });
      // Put the saved record on screen immediately so the teacher never sees a
      // parseable V5 assignment as a rejected upload while a refresh is in
      // flight. The refresh then reconciles with Firestore as the source of
      // truth, and the same draft is kept open in Repair Center.
      setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)]);
      setRepairDraftId(saved.id);
      await refreshDrafts();
      setRepairDraftId(saved.id);
      toastInfo?.(
        'Saved to Incomplete Assignments',
        `${saved.authoringReview?.blockingCount || result.errors?.length || 1} blocking question issue${(saved.authoringReview?.blockingCount || result.errors?.length || 1) === 1 ? '' : 's'} found. The assignment was preserved and its Repair Center is open below; only the questions that need attention block publication.`,
      );
      // Saving a salvageable V5 is a successful intake outcome even though the
      // assignment is not publishable yet. Returning ok:true prevents the base
      // intake from showing its hard-rejection panel. `salvaged` keeps this
      // distinct from a fully valid assignment for callers and regression tests.
      return {
        ...result,
        ok: true,
        salvaged: true,
        incompleteDraftId: saved.id,
        teacherReviewContext: saved.teacherReviewContext,
        authoringState: saved.authoringState,
      };
    } catch (error) {
      console.error('Could not save salvageable Assignment V5 draft:', error);
      toastError?.('Could not save incomplete assignment', error?.message || 'MathMaster found repairable issues but could not preserve the draft.');
      return result;
    }
  }, [onJsonReady, refreshDrafts, toastError, toastInfo]);

  const openDraftForReview = async (draft) => {
    setDraftBusyId(draft.id);
    try {
      const assignmentV5 = restoreIncompleteAssignmentV5(draft);
      const result = await onJsonReady({
        text: JSON.stringify(assignmentV5),
        sourceName: `Incomplete · ${draft.title}`,
      });
      if (result?.ok) {
        toastSuccess?.('Assignment Review opened', 'The repaired draft now passes the assignment checks. Finish the normal review before saving it to the Library or assigning it to a class.');
      } else if (canSalvageV5IntakeResult(result)) {
        toastInfo?.('This draft still needs repair', `${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} remain. The saved draft is still safe in Incomplete Assignments.`);
      } else {
        toastError?.('Draft could not be reopened', result?.errors?.[0] || 'The saved assignment is no longer a repairable Assignment V5 object.');
      }
    } catch (error) {
      toastError?.('Could not open incomplete assignment', error?.message || 'MathMaster could not restore this draft.');
    } finally {
      setDraftBusyId(null);
    }
  };

  const removeDraft = async (draft) => {
    setDraftBusyId(draft.id);
    try {
      await deleteIncompleteAssignmentDraft(draft.id);
      if (repairDraftId === draft.id) setRepairDraftId(null);
      await refreshDrafts();
      toastSuccess?.('Incomplete draft deleted', `“${draft.title}” was removed from Incomplete Assignments.`);
    } catch (error) {
      toastError?.('Could not delete incomplete assignment', error?.message || 'The draft could not be removed.');
    } finally {
      setDraftBusyId(null);
    }
  };

  const updateDraftInList = useCallback((nextDraft) => {
    if (!nextDraft?.id) return;
    setDrafts((current) => current.map((draft) => (draft.id === nextDraft.id ? nextDraft : draft)));
  }, []);

  const draftSummary = useMemo(() => {
    const blockers = drafts.reduce((sum, draft) => sum + Number(draft.authoringReview?.blockingCount || 0), 0);
    return { count: drafts.length, blockers };
  }, [drafts]);

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <AssignmentIntakeBase
        {...props}
        onJsonReady={handleJsonReady}
      />

      <section style={card} aria-label="Incomplete Assignments">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: '#7a4f00', fontSize: 18 }}>Incomplete Assignments</h3>
            <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.45 }}>
              Parseable assignments with blocking question issues are saved here automatically instead of being discarded. They stay out of the normal Library until repaired and reviewed.
            </p>
          </div>
          {!loadingDrafts && draftSummary.count > 0 && (
            <span style={{ padding: '5px 9px', borderRadius: 999, background: '#fff', color: '#7a4f00', fontSize: 12, fontWeight: 900 }}>
              {draftSummary.count} draft{draftSummary.count === 1 ? '' : 's'} · {draftSummary.blockers} blocker{draftSummary.blockers === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {loadingDrafts ? (
          <p style={{ margin: '12px 0 0', color: '#5f6368' }}>Loading incomplete assignments…</p>
        ) : drafts.length === 0 ? (
          <p style={{ margin: '12px 0 0', color: '#5f6368' }}>No incomplete assignments are waiting for repair.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {drafts.map((draft) => {
              const busy = draftBusyId === draft.id;
              const repairOpen = repairDraftId === draft.id;
              const blockingCount = Number(draft.authoringReview?.blockingCount || 0);
              const questionCount = Number(draft.authoringReview?.questionCount || 0);
              return (
                <article key={draft.id} style={{ padding: 12, borderRadius: 9, border: '1px solid #e3c892', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#202124' }}>{draft.title || 'Incomplete Assignment'}</strong>
                      <div style={{ marginTop: 4, color: '#5f6368', fontSize: 12 }}>
                        {questionCount} question{questionCount === 1 ? '' : 's'} · {blockingCount} blocking issue{blockingCount === 1 ? '' : 's'} · revision {Number(draft.assignmentRevision) || 1} · saved {String(draft.updatedAt || draft.createdAt || '').replace('T', ' ').replace('Z', '')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" disabled={busy} onClick={() => setRepairDraftId(repairOpen ? null : draft.id)} style={{ ...button, borderColor: '#1a73e8', background: repairOpen ? '#e8f0fe' : '#fff', opacity: busy ? 0.6 : 1 }}>
                        {repairOpen ? 'Close Repair Center' : 'Open Repair Center'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => openDraftForReview(draft)} style={{ ...button, opacity: busy ? 0.6 : 1 }}>
                        {busy ? 'Opening…' : 'Recheck / Open Review'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => removeDraft(draft)} style={{ ...button, color: '#a50e0e', borderColor: '#f1b6b2', opacity: busy ? 0.6 : 1 }}>
                        Delete Draft
                      </button>
                    </div>
                  </div>

                  {repairOpen && (
                    <IncompleteAssignmentRepairCenter
                      draft={draft}
                      onSaved={updateDraftInList}
                      onClose={() => setRepairDraftId(null)}
                      toastSuccess={toastSuccess}
                      toastError={toastError}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}