import { useRef, useState } from 'react';
import {
  CONTRACT_SCHEMA_NAME,
  buildAuthoringContract,
  buildFixRequest,
} from './platform/contract/authoringContract';

// The whole intake surface. Two things a teacher can do: get the contract to
// hand an AI, and bring the resulting JSON in. No raw JSON editing, no manual
// question programming, no on-screen schema dump — Preflight is where the
// teacher makes decisions, and it opens by itself once the JSON reads.

const card = {
  border: '1px solid #d9e2f1',
  borderRadius: 14,
  background: '#fff',
  padding: '20px 22px',
  textAlign: 'left',
};

const primaryButton = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  minHeight: 46, padding: '0 20px', border: 0, borderRadius: 10,
  background: '#1a73e8', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
};

const secondaryButton = {
  ...primaryButton,
  background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8',
};

const stepBadge = (number) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, borderRadius: 999, background: '#1a73e8', color: '#fff',
    fontWeight: 900, fontSize: 13, flexShrink: 0,
  }}>{number}</span>
);

// Clipboard read needs permission and is unavailable over plain http, so every
// caller has to cope with it failing rather than assuming a string comes back.
const readClipboardText = async () => {
  if (!navigator.clipboard?.readText) {
    throw new Error('This browser will not let a page read the clipboard. Use Upload JSON or drag the file in instead.');
  }
  const text = await navigator.clipboard.readText();
  if (!String(text || '').trim()) throw new Error('The clipboard is empty. Copy the AI\'s JSON first, then try again.');
  return text;
};

const writeClipboardText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // execCommand is deprecated but is the only fallback in http contexts.
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand?.('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Copying is blocked in this browser.');
};

export default function AssignmentIntake({
  onJsonReady,
  toastSuccess,
  toastError,
  toastInfo,
}) {
  const [dropActive, setDropActive] = useState(false);
  const [authoringCourse, setAuthoringCourse] = useState('algebra1');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const fileInputRef = useRef(null);

  const clearFailure = () => setFailure(null);

  const handleCopyContract = async () => {
    try {
      const contract = buildAuthoringContract({ courseId: authoringCourse });
      await writeClipboardText(contract);
      toastSuccess?.(
        'Instructions copied',
        `Paste them into ChatGPT, Claude or Gemini, then describe the assignment you want. MathMaster now sends a compact authoring contract (${Math.round(contract.length / 1000)} KB) and repairs renderer plumbing automatically.`,
      );
    } catch (error) {
      toastError?.('Could not copy the instructions', error.message);
    }
  };

  // One path for every source of JSON, so paste, upload and drop behave alike.
  const acceptJson = async (text, sourceName) => {
    clearFailure();
    setBusy(true);
    try {
      const result = await onJsonReady({ text, sourceName });
      if (result?.ok) {
        const repairCount = Array.isArray(result.repairs) ? result.repairs.length : 0;
        toastSuccess?.(
          'Assignment read',
          repairCount
            ? `MathMaster repaired ${repairCount} authoring detail${repairCount === 1 ? '' : 's'} automatically. Review the assignment in Preflight.`
            : 'Review the details and publish from the preflight screen.',
        );
      } else {
        setFailure({
          sourceName,
          rawJson: text,
          errors: result?.errors?.length ? result.errors : ['MathMaster could not read this JSON.'],
          warnings: result?.warnings || [],
          sourceSchemaVersion: result?.sourceSchemaVersion || (/"schemaVersion"\s*:\s*5\b/.test(String(text || '')) ? 5 : null),
          compilerDefect: result?.compilerDefect === true,
        });
      }
    } catch (error) {
      setFailure({
        sourceName, rawJson: text, errors: [error.message], warnings: [],
        sourceSchemaVersion: /"schemaVersion"\s*:\s*5\b/.test(String(text || '')) ? 5 : null,
        compilerDefect: false,
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await readClipboardText();
      await acceptJson(text, 'Pasted from clipboard');
    } catch (error) {
      toastError?.('Could not read the clipboard', error.message);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      if (!/\.json$/i.test(file.name || '')) throw new Error('Choose a .json file.');
      if (file.size > 5 * 1024 * 1024) throw new Error('That file is larger than 5 MB.');
      const text = await file.text();
      await acceptJson(text, file.name);
    } catch (error) {
      toastError?.('Could not read that file', error.message);
    }
  };

  const handleCopyFixRequest = async () => {
    if (!failure) return;
    try {
      if (failure.compilerDefect) {
        const report = [
          '# MathMaster V5 compiler defect',
          '',
          'The outside AI supplied Authoring Intent V5, but MathMaster failed while converting that intent into its internal renderer/runtime contract.',
          'Do not repair this by converting the assignment to V4 or adding type/toolId/functionSpec/analysisRequests plumbing to the AI JSON.',
          '',
          '## Compiler errors',
          ...failure.errors.map((error, index) => `${index + 1}. ${error}`),
          '',
          '## Original V5 intent',
          failure.rawJson,
        ].join('\n');
        await writeClipboardText(report);
        toastInfo?.('Platform bug report copied', 'This report is for the MathMaster coding workflow, not for the assignment-writing AI.');
        return;
      }
      await writeClipboardText(buildFixRequest(failure));
      toastInfo?.(
        'Fix request copied',
        Number(failure.sourceSchemaVersion) === 5
          ? 'Paste it into the same AI conversation. The request keeps the assignment in Authoring Intent V5 so renderer details remain MathMaster’s job.'
          : 'Paste it into the same AI conversation, then bring the corrected JSON back with Paste JSON from Clipboard.',
      );
    } catch (error) {
      toastError?.('Could not copy the fix request', error.message);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 16, marginBottom: 34 }}>
      <div style={{ ...card, background: 'linear-gradient(135deg,#f8fbff,#eef4ff)', borderColor: '#9bb8e8' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {stepBadge(1)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#172033' }}>Create with AI</h3>
            <p style={{ margin: '0 0 14px', color: '#5f6b7a', lineHeight: 1.55, fontSize: 14 }}>
              Copy MathMaster&apos;s authoring instructions, paste them into any AI assistant, and describe
              the assignment you want — for example <em>&ldquo;an Algebra I assignment on systems with
              5 classwork questions and a 2-question DOL&rdquo;</em>. The instructions are generated from this
              build, so the AI sees the current tools, standards and rules.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontWeight: 700, fontSize: 14 }}>
                Course
                <select
                  value={authoringCourse}
                  onChange={(event) => setAuthoringCourse(event.target.value)}
                  style={{ minHeight: 42, border: '1px solid #9bb8e8', borderRadius: 9, padding: '0 10px', background: '#fff', color: '#172033', fontWeight: 700 }}
                >
                  <option value="algebra1">Algebra I</option>
                  <option value="algebra2">Algebra II</option>
                </select>
              </label>
              <button type="button" onClick={handleCopyContract} style={primaryButton}>
                📋 Copy AI Assignment Builder Instructions
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {stepBadge(2)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#172033' }}>Bring Assignment into MathMaster</h3>
            <p style={{ margin: '0 0 14px', color: '#5f6b7a', lineHeight: 1.55, fontSize: 14 }}>
              Paste the AI&apos;s JSON, upload a <code>.json</code> file, or drag one in. MathMaster checks it
              and opens the preflight review, where you set classes, dates, folder and publishing.
            </p>

            <div
              className="mathmaster-json-dropzone"
              onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropActive(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false); }}
              onDrop={(event) => { event.preventDefault(); setDropActive(false); handleFile(event.dataTransfer?.files?.[0]); }}
              style={{
                padding: '22px 18px',
                border: `2px dashed ${dropActive ? '#1a73e8' : '#c5d5ef'}`,
                borderRadius: 12,
                background: dropActive ? '#e8f0fe' : '#f8fbff',
                transition: 'background 120ms ease, border-color 120ms ease',
                display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
              }}
            >
              <button type="button" onClick={handlePaste} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }}>
                📥 Paste JSON from Clipboard
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} style={{ ...secondaryButton, opacity: busy ? 0.6 : 1 }}>
                ⬆ Upload JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ''; }}
                style={{ display: 'none' }}
              />
              <span style={{ color: '#5f6b7a', fontSize: 13 }}>or drag a .json file here</span>
            </div>
          </div>
        </div>
      </div>

      {failure && (
        <div style={{ ...card, borderColor: '#f1a5a0', background: '#fff8f7' }} role="alert">
          <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#a50e0e' }}>
            This JSON needs a fix{failure.sourceName ? ` — ${failure.sourceName}` : ''}
          </h3>
          <p style={{ margin: '0 0 10px', color: '#5f6b7a', fontSize: 13, lineHeight: 1.55 }}>
            {failure.compilerDefect
              ? 'The V5 intent contains enough student-facing information, but MathMaster failed while compiling its own renderer/runtime plumbing. This is a platform defect — do not send the assignment back to the AI as V4.'
              : Number(failure.sourceSchemaVersion) === 5
                ? 'MathMaster repairs V5 renderer plumbing automatically. Any remaining item below should describe a genuine mathematical/content omission. The copied repair request keeps schemaVersion 5.'
                : 'MathMaster already repairs formatting, aliases, mixed fixed/generated delivery, and ordinary graph viewport issues. Anything still listed below could not be repaired safely without changing meaning.'}
          </p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 20, color: '#3c4756', lineHeight: 1.6, fontSize: 13 }}>
            {failure.errors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {failure.warnings.length > 0 && (
            <details style={{ marginBottom: 14 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#7a4f01', fontSize: 13 }}>
                {failure.warnings.length} warning{failure.warnings.length === 1 ? '' : 's'}
              </summary>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#5f6b7a', fontSize: 13, lineHeight: 1.6 }}>
                {failure.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </details>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleCopyFixRequest} style={primaryButton}>
              {failure.compilerDefect ? '📋 Copy Platform Bug Report' : '📋 Copy AI Fix Request'}
            </button>
            <button type="button" onClick={clearFailure} style={secondaryButton}>Dismiss</button>
          </div>
        </div>
      )}
    </section>
  );
}
