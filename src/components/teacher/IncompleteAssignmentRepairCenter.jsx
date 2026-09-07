import { useMemo, useState } from 'react';
import {
  commitStagedQuestionRepairImport,
  parseSingleQuestionRepairJson,
  stageBatchQuestionRepairImport,
  stageSingleQuestionRepairImport,
} from '../../platform/preflight/questionRepairImport.js';
import { parseQuestionBatchRepairResponse } from '../../platform/contract/questionBatchRepairPacket.js';
import { buildAssignmentRepairCenterModel } from '../../platform/preflight/assignmentRepairCenterModel.js';
import { resolveTeacherReviewFlag } from '../../platform/preflight/teacherReviewContext.js';
import { buildAssignmentV5PreflightModel } from '../../platform/preflight/assignmentV5PreflightModel.js';

/*
 * NOTHING A TEACHER PASTES IS APPLIED UNTIL THEY HAVE SEEN WHAT IT DOES.
 *
 * The obvious build of this screen takes pasted AI output and writes it into
 * the draft. By the time the teacher can see that the "repair" broke the
 * question, the original is gone. So pasting only ever STAGES: the before and
 * after, the fields that changed, and any blocking issue the replacement would
 * introduce are all on screen first, and applying is a separate button that
 * stays disabled while the staged repair is unsafe.
 *
 * TEACHER FLAGS ARE NOT CLOSED BY AN IMPORT. When the questions being repaired
 * carry the teacher's own notes, committing records the revision that may have
 * addressed them and leaves them open. Only "Verify fixed" — a person, looking
 * at the result — closes one.
 */

const panel = { border: '1px solid #d8dde6', borderRadius: 12, background: '#fff', padding: 16, textAlign: 'left' };
const label = { fontWeight: 800, display: 'block', marginBottom: 4 };
const area = {
  width: '100%', boxSizing: 'border-box', minHeight: 96, padding: 10,
  border: '1px solid #b7bec8', borderRadius: 8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, resize: 'vertical',
};
const input = { width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #b7bec8', borderRadius: 8 };
const button = {
  minHeight: 40, padding: '9px 14px', borderRadius: 8, border: '1px solid #9bb8e8',
  background: '#fff', color: '#174ea6', fontWeight: 900, cursor: 'pointer',
};
const primary = { ...button, background: '#174ea6', color: '#fff', borderColor: '#174ea6' };

export default function IncompleteAssignmentRepairCenter({
  draft = null,
  assignmentV5 = null,
  teacherReviewContext = null,
  currentRevision = null,
  onCommit = null,
  onTeacherReviewContextChange = null,
  toastError = null,
  toastSuccess = null,
}) {
  const [questionId, setQuestionId] = useState('');
  const [singleJson, setSingleJson] = useState('');
  const [batchJson, setBatchJson] = useState('');
  const [staged, setStaged] = useState(null);
  const [error, setError] = useState('');

  const repairCenterModel = useMemo(() => {
    if (!assignmentV5) return { questions: [], summary: null };
    const preflight = buildAssignmentV5PreflightModel(assignmentV5);
    return buildAssignmentRepairCenterModel({
      assignmentV5,
      diagnostics: preflight.diagnostics,
      teacherReviewContext,
    });
  }, [assignmentV5, teacherReviewContext]);

  const revision = Number.isFinite(Number(currentRevision))
    ? Number(currentRevision)
    : Number(draft?.assignmentRevision) || null;

  const stage = (run) => {
    setError('');
    try {
      setStaged(run());
    } catch (stagingError) {
      setStaged(null);
      setError(stagingError?.message || 'That repair could not be staged.');
    }
  };

  const stageSingle = () => stage(() => stageSingleQuestionRepairImport({
    assignmentV5,
    questionId: questionId.trim(),
    replacementQuestion: parseSingleQuestionRepairJson(singleJson, { expectedQuestionId: questionId.trim() }),
    baseRevision: revision,
    currentRevision: revision,
    teacherReviewContext,
  }));

  const stageBatch = () => stage(() => stageBatchQuestionRepairImport({
    assignmentV5,
    parsedResponse: parseQuestionBatchRepairResponse(batchJson, {
      expectedAssignmentId: assignmentV5?.assignment?.assignmentId || null,
      expectedBaseRevision: revision,
      allowedQuestionIds: repairCenterModel.questions.map((row) => row.questionId).filter(Boolean),
    }),
    baseRevision: revision,
    currentRevision: revision,
    teacherReviewContext,
  }));

  const applyStaged = () => {
    setError('');
    try {
      const committed = commitStagedQuestionRepairImport({
        stagedImport: staged,
        teacherReviewContext,
        currentRevision: revision,
        nextRevision: (revision ?? 0) + 1,
      });
      onCommit?.(committed);
      setStaged(null);
      setSingleJson('');
      setBatchJson('');
      toastSuccess?.('Repair applied', 'The draft was revalidated and saved at the next revision.');
    } catch (commitError) {
      setError(commitError?.message || 'That repair could not be applied.');
      toastError?.('Repair not applied', commitError?.message || 'The staged repair is not safe to apply.');
    }
  };

  const verifyFlagFixed = (flagId) => {
    try {
      onTeacherReviewContextChange?.(resolveTeacherReviewFlag(teacherReviewContext, flagId, { status: 'fixed' }));
    } catch (verifyError) {
      setError(verifyError?.message || 'That flag could not be verified.');
    }
  };

  const results = Array.isArray(staged?.questionResults) ? staged.questionResults : [];
  const pendingFlagIds = Array.isArray(staged?.pendingTeacherFlagIds) ? staged.pendingTeacherFlagIds : [];

  return (
    <section style={{ ...panel, marginTop: 14 }} aria-label="Repair Center">
      <h3 style={{ margin: 0, fontSize: 17 }}>Repair Center</h3>
      <p style={{ margin: '5px 0 14px', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>
        Pasting stages a repair so you can read it first. Nothing is written to the draft until you apply it.
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={label} htmlFor="repair-question-id">Question to repair (questionId)</label>
          <input
            id="repair-question-id"
            style={input}
            value={questionId}
            onChange={(event) => setQuestionId(event.target.value)}
            placeholder="q-cw-1"
            list="repair-center-question-ids"
          />
          <datalist id="repair-center-question-ids">
            {repairCenterModel.questions.map((row) => (
              <option key={row.questionId} value={row.questionId}>
                {`Question ${row.questionNumber} · ${row.status}`}
              </option>
            ))}
          </datalist>
        </div>

        <div>
          <label style={label} htmlFor="repair-single-json">Paste repaired question JSON</label>
          <textarea
            id="repair-single-json"
            style={area}
            value={singleJson}
            spellCheck={false}
            onChange={(event) => setSingleJson(event.target.value)}
          />
          <button type="button" style={{ ...button, marginTop: 8 }} disabled={!questionId.trim() || !singleJson.trim()} onClick={stageSingle}>
            Stage single repair
          </button>
        </div>

        <div>
          <label style={label} htmlFor="repair-batch-json">Paste batch repair JSON</label>
          <textarea
            id="repair-batch-json"
            style={area}
            value={batchJson}
            spellCheck={false}
            onChange={(event) => setBatchJson(event.target.value)}
          />
          <button type="button" style={{ ...button, marginTop: 8 }} disabled={!batchJson.trim()} onClick={stageBatch}>
            Stage batch repair
          </button>
        </div>
      </div>

      {error && <div role="alert" style={{ marginTop: 12, padding: 11, borderRadius: 8, background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}

      {staged && (
        <div style={{ marginTop: 16, borderTop: '1px solid #e8eaed', paddingTop: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>Before / after changes</h4>
          {results.map((result) => (
            <article key={result.questionId} style={{ marginBottom: 12, padding: 11, borderRadius: 9, border: '1px solid #e3e7ee' }}>
              <strong>{result.questionId}</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#3c4043' }}>
                {(result.diff || []).map((change) => (
                  <li key={change.path}>
                    <code>{change.path}</code>: {JSON.stringify(change.before)} → {JSON.stringify(change.after)}
                  </li>
                ))}
                {(result.diff || []).length === 0 && <li>No field changed.</li>}
              </ul>

              <div style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 12.5 }}>Revalidation</strong>
                {result.canCommit ? (
                  <div style={{ color: '#137333', fontSize: 12.5 }}>Introduces no new blocking issue.</div>
                ) : (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#a50e0e', fontSize: 12.5 }}>
                    {(result.validation?.newBlockingDiagnostics || []).map((entry, index) => (
                      <li key={`${result.questionId}-${index}`}>{entry.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}

          {pendingFlagIds.length > 0 && (
            <div style={{ marginTop: 10, padding: 11, borderRadius: 9, background: '#fff8e1', border: '1px solid #f1c27d' }}>
              <strong style={{ color: '#7a4f00' }}>Teacher verification required</strong>
              <p style={{ margin: '4px 0 8px', fontSize: 12.5, color: '#5f6368', lineHeight: 1.45 }}>
                These are your own notes. Applying the repair records the revision that may have addressed them; it does not close them.
              </p>
              {pendingFlagIds.map((flagId) => (
                <button key={flagId} type="button" style={{ ...button, marginRight: 8 }} onClick={() => verifyFlagFixed(flagId)}>
                  Verify fixed · {flagId}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            style={{ ...primary, marginTop: 12, opacity: staged.canCommit ? 1 : 0.5, cursor: staged.canCommit ? 'pointer' : 'not-allowed' }}
            disabled={!staged.canCommit}
            onClick={applyStaged}
          >
            Apply staged repair
          </button>
          {!staged.canCommit && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: '#a50e0e' }}>
              This repair would introduce a new blocking issue, so it cannot be applied.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
