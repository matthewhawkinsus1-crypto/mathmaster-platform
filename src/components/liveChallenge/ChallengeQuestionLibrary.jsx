import { useMemo, useState } from 'react';
import { seedPathQuestionBank } from '../../platform/path/pathCoverageService.js';
import {
  challengeQuestionsFromAssignment,
  normalizeChallengeQuestionPackage,
} from '../../platform/liveChallenge/challengeQuestionImport.js';

const box = { border: '1px solid #d8dde6', borderRadius: 12, padding: 16, background: '#fff' };
const input = { width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #b7bec8', borderRadius: 8, marginTop: 6 };
const button = { minHeight: 42, padding: '9px 14px', borderRadius: 8, border: '1px solid #9bb8e8', background: '#fff', color: '#174ea6', fontWeight: 850, cursor: 'pointer' };

const progressLabel = (progress) => {
  if (!progress) return '';
  if (progress.phase === 'validating') return `Validating secure package · ${progress.chunk} of ${progress.chunks}`;
  if (progress.phase === 'importing') return `Importing secure package · ${progress.chunk} of ${progress.chunks}`;
  if (progress.phase === 'coverage') return 'Rebuilding Path and Live Challenge coverage…';
  return 'Working…';
};

function ImportResult({ result }) {
  if (!result) return null;
  const count = Number(result.documentCount ?? result.received ?? 0) || 0;
  const accepted = Number(result.accepted ?? result.wouldAccept ?? 0) || 0;
  const rejected = Array.isArray(result.rejected) ? result.rejected.length : 0;
  const byReason = result.rejectionSummary?.byReason || {};
  return (
    <div aria-live="polite" style={{ marginTop: 12, padding: 12, borderRadius: 9, background: result.imported ? '#e6f4ea' : '#fff4ce', color: result.imported ? '#137333' : '#7a4f00' }}>
      <strong>{result.imported ? 'Question library updated.' : 'Nothing was imported.'}</strong>
      <div style={{ marginTop: 4 }}>{count} supplied · {accepted} accepted · {rejected} rejected.</div>
      {Object.keys(byReason).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <strong>Why items were rejected:</strong>{' '}
          {Object.entries(byReason).map(([reason, amount]) => `${reason} (${amount})`).join(' · ')}
        </div>
      )}
      {!result.imported && rejected > 0 && (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          The secure importer validates the entire package before writing anything, so a partly valid package cannot leave the bank half-updated.
        </div>
      )}
    </div>
  );
}

export default function ChallengeQuestionLibrary({ assignments = [], onImported = null }) {
  const [tab, setTab] = useState('upload');
  const [assignmentId, setAssignmentId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const assignmentOptions = useMemo(() => (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => challengeQuestionsFromAssignment(assignment).length > 0)
    .slice(0, 100), [assignments]);

  const runImport = async (questions) => {
    setBusy(true);
    setError('');
    setResult(null);
    setProgress(null);
    try {
      const normalized = normalizeChallengeQuestionPackage(questions);
      const imported = await seedPathQuestionBank(normalized, { onProgress: setProgress });
      setResult(imported);
      if (imported?.imported) onImported?.(imported);
    } catch (importError) {
      setError(importError?.message || 'Those questions could not be imported.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const readUpload = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      await runImport(text);
    } catch (readError) {
      setError(readError?.message || 'That JSON file could not be read.');
    }
  };

  const importAssignment = async () => {
    const assignment = assignmentOptions.find((entry) => String(entry.id) === String(assignmentId));
    if (!assignment) {
      setError('Choose an assignment first.');
      return;
    }
    const questions = challengeQuestionsFromAssignment(assignment);
    if (!questions.length) {
      setError('That assignment does not contain questions that can be sent to the importer.');
      return;
    }
    await runImport(questions);
  };

  return (
    <details style={{ ...box, marginTop: 14 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: 16 }}>Question Library</summary>
      <p style={{ color: '#5f6368', lineHeight: 1.55, marginBottom: 12 }}>
        Add questions here without leaving Live Challenge. This uses the same secure My Math Path bank and the same server validator as normal Path imports—there is not a second answer bank to maintain.
      </p>

      {/* WHAT MAKES A QUESTION INTERACTIVE.
          A teacher opens this because "Interactive tools only" came up short,
          and uploading more typed-answer questions does not fix that. The one
          field that decides it is `pathToolId`, so it is named here rather
          than left to be discovered. */}
      <p style={{ color: '#3c4043', lineHeight: 1.55, marginBottom: 12, fontSize: 13 }}>
        Most of the secure bank is typed or chosen answers, so <strong>Interactive tools only</strong> draws from a
        small pool. Give a question a <code>pathToolId</code> — <code>stepAlgebra</code>, <code>graphing2</code>,{' '}
        <code>systemsWorkspace</code>, <code>intervalNumberLine</code>, <code>relationMapping</code>,{' '}
        <code>dataModelingLab</code>, <code>functionInvestigation</code> — and it becomes an interactive round here.
        Released SAT, ACT, TSIA2 and ASVAB content is refused on purpose; that moves only through its own release
        refresh.
      </p>

      <div role="tablist" aria-label="Question library import method" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')} style={{ ...button, background: tab === 'upload' ? '#e8f0fe' : '#fff' }}>Upload JSON</button>
        <button type="button" role="tab" aria-selected={tab === 'assignment'} onClick={() => setTab('assignment')} style={{ ...button, background: tab === 'assignment' ? '#e8f0fe' : '#fff' }}>Import from assignment</button>
        <button type="button" role="tab" aria-selected={tab === 'paste'} onClick={() => setTab('paste')} style={{ ...button, background: tab === 'paste' ? '#e8f0fe' : '#fff' }}>Paste / create JSON</button>
      </div>

      {tab === 'upload' && (
        <div style={{ marginTop: 14 }}>
          <label style={{ fontWeight: 800 }}>Upload JSON
            <input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => readUpload(event.target.files?.[0])} style={{ ...input, background: '#fff' }} />
          </label>
          <div style={{ marginTop: 6, color: '#5f6368', fontSize: 13 }}>A raw array or an object containing documents, items, or questions is accepted.</div>
        </div>
      )}

      {tab === 'assignment' && (
        <div style={{ marginTop: 14 }}>
          <label style={{ fontWeight: 800 }}>MathMaster assignment
            <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} style={input}>
              <option value="">Choose an assignment…</option>
              {assignmentOptions.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>{assignment.title || assignment.id}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || !assignmentId} onClick={importAssignment} style={{ ...button, marginTop: 10, opacity: busy || !assignmentId ? .55 : 1 }}>Import assignment questions</button>
          <div style={{ marginTop: 6, color: '#5f6368', fontSize: 13 }}>The server will accept only questions that satisfy the secure Path/Live Challenge contract. Unsupported assignment-only shapes are reported, not silently rewritten.</div>
        </div>
      )}

      {tab === 'paste' && (
        <div style={{ marginTop: 14 }}>
          <label style={{ fontWeight: 800 }}>Paste / create JSON
            <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={10} spellCheck={false} placeholder='[{"id":"...","courseId":"algebra1",...}]' style={{ ...input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', resize: 'vertical' }} />
          </label>
          <button type="button" disabled={busy || !jsonText.trim()} onClick={() => runImport(jsonText)} style={{ ...button, marginTop: 10, opacity: busy || !jsonText.trim() ? .55 : 1 }}>Validate & import JSON</button>
        </div>
      )}

      {busy && <div role="status" style={{ marginTop: 12, color: '#174ea6', fontWeight: 800 }}>{progressLabel(progress) || 'Preparing secure import…'}</div>}
      {error && <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 9, background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}
      <ImportResult result={result} />
    </details>
  );
}
