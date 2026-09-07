import { useRef, useState } from 'react';
import {
  CONTRACT_SCHEMA_NAME,
  buildAuthoringContract,
  buildFixRequest,
} from './platform/contract/authoringContract';
import {
  buildAssignmentCreatorRequest,
  CREATOR_RIGOR_PRESETS,
  defaultAssignmentCreatorPlan,
} from './components/teacher/assignmentCreatorPlan.js';
import {
  assignmentAiDiagnostics,
  assignmentAiFailureMessage,
  assignmentAiFallbackRecommended,
  buildAssignmentWithAI,
} from './services/assignmentAiService.js';

const card = {
  border: '1px solid #d9e2f1',
  borderRadius: 12,
  background: '#fff',
  padding: 18,
};

const sectionHeading = {
  margin: '0 0 8px',
  fontSize: 18,
  color: '#202124',
};

const labelStyle = {
  display: 'grid',
  gap: 6,
  color: '#3c4043',
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 40,
  borderRadius: 8,
  border: '1px solid #c5d2e4',
  padding: '8px 10px',
  font: 'inherit',
  fontWeight: 600,
  background: '#fff',
  color: '#202124',
};

const primaryButton = {
  minHeight: 40,
  padding: '9px 14px',
  border: 0,
  borderRadius: 8,
  background: '#174ea6',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
};

const secondaryButton = {
  minHeight: 40,
  padding: '9px 14px',
  border: '1px solid #c5d2e4',
  borderRadius: 8,
  background: '#fff',
  color: '#174ea6',
  fontWeight: 900,
  cursor: 'pointer',
};

const defaultRejectedAssignment = null;

export default function AssignmentIntake({
  onJsonReady,
  toastSuccess,
  toastError,
  toastInfo,
}) {
  const [mode, setMode] = useState('ai');
  const [busy, setBusy] = useState(false);
  const [aiPlan, setAiPlan] = useState(() => defaultAssignmentCreatorPlan());
  const [jsonText, setJsonText] = useState('');
  const [sourceName, setSourceName] = useState('Pasted assignment JSON');
  const [rejectedAssignment, setRejectedAssignment] = useState(defaultRejectedAssignment);
  const [contractCopied, setContractCopied] = useState(false);
  const fileInputRef = useRef(null);

  const acceptJson = async ({ text = jsonText, name = sourceName } = {}) => {
    if (!String(text || '').trim()) {
      toastError?.('Nothing to review', 'Paste or upload an Assignment V5 JSON file first.');
      return null;
    }
    setBusy(true);
    try {
      const result = await onJsonReady({ text, sourceName: name });
      if (result?.ok) {
        setRejectedAssignment(null);
        toastSuccess?.('Assignment Review opened', 'MathMaster loaded the assignment into Preflight so you can review classes, dates, sections, rigor, and publishing before anything is saved or posted.');
        return result;
      }

      const errors = Array.isArray(result?.errors) ? result.errors : ['MathMaster could not read this assignment.'];
      const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
      const compilerDefect = result?.compilerDefect === true;
      const fixRequest = buildFixRequest({
        errors,
        warnings,
        sourceSchemaVersion: result?.sourceSchemaVersion,
        compilerDefect,
      });
      setRejectedAssignment({
        sourceName: name,
        errors,
        warnings,
        compilerDefect,
        fixRequest,
      });
      return result;
    } catch (error) {
      toastError?.('Could not review assignment', error?.message || 'MathMaster could not process the assignment JSON.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const generateWithAi = async () => {
    setBusy(true);
    try {
      const request = buildAssignmentCreatorRequest(aiPlan);
      const result = await buildAssignmentWithAI(request);
      const text = JSON.stringify(result.assignment, null, 2);
      setJsonText(text);
      setSourceName('MathMaster AI assignment');
      const review = await onJsonReady({ text, sourceName: 'MathMaster AI assignment' });
      if (review?.ok) {
        setRejectedAssignment(null);
        toastSuccess?.('Assignment built and opened for review', 'MathMaster AI created the V5 assignment. Nothing is published until you approve it in Assignment Review.');
      } else {
        const errors = Array.isArray(review?.errors) ? review.errors : ['MathMaster could not validate the generated assignment.'];
        const warnings = Array.isArray(review?.warnings) ? review.warnings : [];
        setRejectedAssignment({
          sourceName: 'MathMaster AI assignment',
          errors,
          warnings,
          compilerDefect: review?.compilerDefect === true,
          fixRequest: buildFixRequest({
            errors,
            warnings,
            sourceSchemaVersion: review?.sourceSchemaVersion,
            compilerDefect: review?.compilerDefect === true,
          }),
        });
      }
    } catch (error) {
      const diagnostics = assignmentAiDiagnostics(error);
      const fallback = assignmentAiFallbackRecommended(error);
      toastError?.(
        'MathMaster AI could not build the assignment',
        assignmentAiFailureMessage(error),
      );
      if (fallback) {
        toastInfo?.(
          'Use your preferred AI instead',
          `MathMaster AI is unavailable right now. Copy the ${CONTRACT_SCHEMA_NAME} contract below into ChatGPT, Claude, or Gemini, then paste the returned JSON here. ${diagnostics.requestId ? `Request ${diagnostics.requestId}.` : ''}`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setJsonText(text);
    setSourceName(file.name || 'Uploaded assignment JSON');
    setMode('json');
    await acceptJson({ text, name: file.name || 'Uploaded assignment JSON' });
  };

  const copyAuthoringContract = async () => {
    const contract = buildAuthoringContract();
    try {
      await navigator.clipboard.writeText(contract);
      setContractCopied(true);
      window.setTimeout(() => setContractCopied(false), 1800);
    } catch (error) {
      toastError?.('Could not copy contract', error?.message || 'Select the contract text and copy it manually.');
    }
  };

  const copyFixRequest = async () => {
    if (!rejectedAssignment?.fixRequest) return;
    try {
      await navigator.clipboard.writeText(rejectedAssignment.fixRequest);
      toastSuccess?.('AI fix request copied', 'Paste it into the same AI conversation that created the assignment.');
    } catch (error) {
      toastError?.('Could not copy fix request', error?.message || 'Copy the repair text manually.');
    }
  };

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...card, paddingBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setMode('ai')}
            style={{ ...secondaryButton, ...(mode === 'ai' ? { background: '#e8f0fe', borderColor: '#8ab4f8' } : {}) }}
          >
            Build with MathMaster AI
          </button>
          <button
            type="button"
            onClick={() => setMode('json')}
            style={{ ...secondaryButton, ...(mode === 'json' ? { background: '#e8f0fe', borderColor: '#8ab4f8' } : {}) }}
          >
            Paste / Upload JSON
          </button>
          <button type="button" onClick={copyAuthoringContract} style={secondaryButton}>
            {contractCopied ? 'Contract copied' : `Copy ${CONTRACT_SCHEMA_NAME} contract`}
          </button>
        </div>
      </div>

      {mode === 'ai' ? (
        <div style={card}>
          <h3 style={sectionHeading}>Build a V5 assignment</h3>
          <p style={{ margin: '0 0 14px', color: '#5f6368', lineHeight: 1.5 }}>
            MathMaster AI creates the assignment JSON, then opens the same Assignment Review used for uploads. Nothing is posted until you approve it.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>Course
              <select value={aiPlan.courseId} onChange={(event) => setAiPlan((current) => ({ ...current, courseId: event.target.value }))} style={inputStyle}>
                <option value="algebra1">Algebra I</option>
                <option value="algebra2">Algebra II</option>
              </select>
            </label>
            <label style={labelStyle}>Topic / TEKS
              <input value={aiPlan.topic} onChange={(event) => setAiPlan((current) => ({ ...current, topic: event.target.value }))} style={inputStyle} placeholder="e.g. Domain and range · A.2A" />
            </label>
            <label style={labelStyle}>Rigor
              <select value={aiPlan.rigorPreset} onChange={(event) => setAiPlan((current) => ({ ...current, rigorPreset: event.target.value }))} style={inputStyle}>
                {Object.entries(CREATOR_RIGOR_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Approximate class time
              <select value={aiPlan.durationMinutes} onChange={(event) => setAiPlan((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} style={inputStyle}>
                {[30, 45, 60, 75, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
            </label>
          </div>
          <label style={{ ...labelStyle, marginTop: 12 }}>What should this assignment do?
            <textarea value={aiPlan.teacherIntent} onChange={(event) => setAiPlan((current) => ({ ...current, teacherIntent: event.target.value }))} style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} placeholder="Describe the lesson, representations, tools, scaffolds, or constraints you want." />
          </label>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={generateWithAi} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Building…' : 'Build Assignment'}
            </button>
          </div>
        </div>
      ) : (
        <div style={card}>
          <h3 style={sectionHeading}>Paste or upload Assignment V5 JSON</h3>
          <p style={{ margin: '0 0 14px', color: '#5f6368', lineHeight: 1.5 }}>
            JSON from ChatGPT, Claude, Gemini, or another MathMaster export goes through the same validator and Assignment Review.
          </p>
          <textarea value={jsonText} onChange={(event) => { setJsonText(event.target.value); setSourceName('Pasted assignment JSON'); }} style={{ ...inputStyle, minHeight: 220, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }} placeholder="Paste the complete Assignment V5 JSON object here." />
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={(event) => handleFile(event.target.files?.[0])} style={{ display: 'none' }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => acceptJson()} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Checking…' : 'Open Assignment Review'}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} style={secondaryButton}>Upload JSON file</button>
          </div>
        </div>
      )}

      {rejectedAssignment && (
        <div style={{ ...card, borderColor: rejectedAssignment.compilerDefect ? '#f6aea8' : '#f9ab00', background: rejectedAssignment.compilerDefect ? '#fce8e6' : '#fff8e1' }}>
          <h3 style={{ ...sectionHeading, color: rejectedAssignment.compilerDefect ? '#a50e0e' : '#7a4f00' }}>
            {rejectedAssignment.compilerDefect ? 'MathMaster needs a renderer fix' : 'This assignment needs attention'}
          </h3>
          <p style={{ margin: '0 0 10px', color: '#5f6368' }}>{rejectedAssignment.sourceName}</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {rejectedAssignment.errors.map((message, index) => (
              <div key={`error-${index}`} style={{ padding: '8px 10px', borderRadius: 7, background: '#fff', border: '1px solid rgba(0,0,0,.08)', color: '#3c4043', fontSize: 13 }}>
                {message}
              </div>
            ))}
          </div>
          {rejectedAssignment.warnings.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#5f6368' }}>{rejectedAssignment.warnings.length} warning{rejectedAssignment.warnings.length === 1 ? '' : 's'}</summary>
              <ul style={{ marginBottom: 0 }}>
                {rejectedAssignment.warnings.map((message, index) => <li key={`warning-${index}`}>{message}</li>)}
              </ul>
            </details>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copyFixRequest} style={primaryButton}>Copy AI Fix Request</button>
            <button type="button" onClick={() => setRejectedAssignment(null)} style={secondaryButton}>Dismiss</button>
          </div>
        </div>
      )}
    </section>
  );
}
