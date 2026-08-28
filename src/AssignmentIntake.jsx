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
  assignmentAiFallbackRecommended,
  buildAssignmentWithAI,
} from './services/assignmentAiService.js';

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

const fieldLabel = {
  display: 'grid',
  gap: 6,
  color: '#334155',
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle = {
  minHeight: 44,
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #b8c8df',
  borderRadius: 9,
  padding: '9px 11px',
  background: '#fff',
  color: '#172033',
  fontSize: 14,
};

const stepBadge = (number) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 999, background: '#1a73e8', color: '#fff',
    fontWeight: 900, fontSize: 13, flexShrink: 0,
  }}>{number}</span>
);

const SECTION_ORDER = ['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test'];

const modeLabel = {
  shared: 'Same problem for everyone',
  personalized: 'Same task, different numbers',
  adaptive: 'Adaptive within the standard',
};

const CREATOR_STEPS = Object.freeze([
  { number: 1, label: 'Lesson', detail: 'Course, purpose, and what students learn' },
  { number: 2, label: 'Sections & rigor', detail: 'Warm-Up, Classwork, Practice, DOL, quiz/test' },
  { number: 3, label: 'Supports & outputs', detail: 'Student plans, Honors, PDFs' },
  { number: 4, label: 'Build & review', detail: 'AI result, MathMaster review, then assign' },
]);

const readClipboardText = async () => {
  if (!navigator.clipboard?.readText) {
    throw new Error('This browser will not let a page read the clipboard. Use Upload Assignment File or drag the file in instead.');
  }
  const text = await navigator.clipboard.readText();
  if (!String(text || '').trim()) throw new Error('The clipboard is empty. Copy the AI\'s finished assignment first, then try again.');
  return text;
};

const writeClipboardText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
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
  const [creatorPlan, setCreatorPlan] = useState(() => defaultAssignmentCreatorPlan('algebra1'));
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const fileInputRef = useRef(null);

  const clearFailure = () => setFailure(null);

  const setPlanField = (field, value) => {
    setCreatorPlan((current) => ({ ...current, [field]: value }));
  };

  const setSectionField = (role, field, value) => {
    setCreatorPlan((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [role]: {
          ...current.sections[role],
          [field]: value,
        },
      },
    }));
  };

  const setOutputField = (field, value) => {
    setCreatorPlan((current) => ({
      ...current,
      outputs: { ...current.outputs, [field]: value },
    }));
  };

  const handleCopyBuildRequest = async () => {
    try {
      const request = buildAssignmentCreatorRequest(creatorPlan);
      await writeClipboardText(request);
      toastSuccess?.(
        'Assignment build request copied',
        'Paste it into ChatGPT, Claude, or Gemini. The request already includes your course, sections, delivery choices, PDF choices, Honors/CCMR rules, and MathMaster’s current authoring requirements.',
      );
    } catch (error) {
      toastError?.('Finish the assignment plan', error.message);
    }
  };

  const handleBuildInsideMathMaster = async () => {
    clearFailure();
    setAiBusy(true);
    try {
      const request = buildAssignmentCreatorRequest(creatorPlan);
      const built = await buildAssignmentWithAI(request);
      await acceptJson(built.assignmentJson, 'Built in MathMaster');
    } catch (error) {
      if (assignmentAiFallbackRecommended(error)) {
        toastInfo?.(
          'Built-in AI is unavailable right now',
          'Your assignment plan is safe. Use “Copy Complete AI Build Request” and paste it into ChatGPT, Claude, or Gemini, then bring the finished assignment back here.',
        );
      } else {
        toastError?.('Could not build the assignment', error.message);
      }
    } finally {
      setAiBusy(false);
    }
  };

  const handleCopyContract = async () => {
    try {
      const contract = buildAuthoringContract({ courseId: creatorPlan.courseId });
      await writeClipboardText(contract);
      toastSuccess?.(
        'Technical authoring contract copied',
        `Copied ${CONTRACT_SCHEMA_NAME} authoring instructions (${Math.round(contract.length / 1000)} KB).`,
      );
    } catch (error) {
      toastError?.('Could not copy the authoring contract', error.message);
    }
  };

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
            : 'Review the details and publish from Preflight.',
        );
      } else {
        setFailure({
          sourceName,
          rawJson: text,
          errors: result?.errors?.length ? result.errors : ['MathMaster could not read this assignment.'],
          warnings: result?.warnings || [],
          sourceSchemaVersion: result?.sourceSchemaVersion || (/"schemaVersion"\s*:\s*5\b/.test(String(text || '')) ? 5 : null),
          compilerDefect: result?.compilerDefect === true,
        });
      }
    } catch (error) {
      setFailure({
        sourceName,
        rawJson: text,
        errors: [error.message],
        warnings: [],
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
          '# MathMaster assignment compiler defect',
          '',
          'The assignment uses the current MathMaster format, but MathMaster failed while selecting or building its internal renderer/runtime contract.',
          'Do not repair this by adding type/toolId/functionSpec/analysisRequests plumbing or by switching to an older assignment format.',
          '',
          '## Compiler errors',
          ...failure.errors.map((error, index) => `${index + 1}. ${error}`),
          '',
          '## Original assignment intent',
          failure.rawJson,
        ].join('\n');
        await writeClipboardText(report);
        toastInfo?.('Platform bug report copied', 'This report is for the MathMaster coding workflow, not the assignment-writing AI.');
        return;
      }
      await writeClipboardText(buildFixRequest(failure));
      toastInfo?.(
        'Fix request copied',
        'Paste it into the same AI conversation, then bring the corrected assignment back to MathMaster.',
      );
    } catch (error) {
      toastError?.('Could not copy the fix request', error.message);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 16, marginBottom: 34 }}>
      <nav
        aria-label="Assignment creator steps"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
          gap: 8,
          padding: 10,
          border: '1px solid #d9e2f1',
          borderRadius: 14,
          background: '#f8fafc',
        }}
      >
        {CREATOR_STEPS.map((step) => (
          <div key={step.number} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '8px 9px' }}>
            <span style={{
              display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 999,
              background: '#e8f0fe', color: '#174ea6', fontWeight: 900, fontSize: 12, flexShrink: 0,
            }}>{step.number}</span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', color: '#172033', fontSize: 13 }}>{step.label}</strong>
              <span style={{ display: 'block', color: '#64748b', fontSize: 11.5, lineHeight: 1.35 }}>{step.detail}</span>
            </span>
          </div>
        ))}
      </nav>
      <div style={{ ...card, background: 'linear-gradient(135deg,#f8fbff,#eef4ff)', borderColor: '#9bb8e8' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {stepBadge(1)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 19, color: '#172033' }}>1. Lesson and purpose</h3>
              <span style={{
                border: '1px solid #9bb8e8', borderRadius: 999, padding: '4px 9px',
                color: '#174ea6', background: '#fff', fontSize: 11, fontWeight: 900,
              }}>NO CODE REQUIRED</span>
            </div>
            <p style={{ margin: '0 0 16px', color: '#5f6b7a', lineHeight: 1.55, fontSize: 14 }}>
              Choose the instructional structure here. MathMaster turns these choices into one complete AI build request,
              including the current standards, interaction rules, CCMR fidelity requirements, and printable-output rules.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
              gap: 12,
              marginBottom: 14,
            }}>
              <label style={fieldLabel}>
                Course
                <select
                  value={creatorPlan.courseId}
                  onChange={(event) => setPlanField('courseId', event.target.value)}
                  style={inputStyle}
                >
                  <option value="algebra1">Algebra I</option>
                  <option value="algebra2">Algebra II</option>
                </select>
              </label>

              <label style={fieldLabel}>
                Assignment title
                <input
                  value={creatorPlan.title}
                  onChange={(event) => setPlanField('title', event.target.value)}
                  placeholder="Example: Operations on Functions"
                  style={inputStyle}
                />
              </label>

              <label style={fieldLabel}>
                Instructional purpose
                <select
                  value={creatorPlan.instructionalPurpose}
                  onChange={(event) => setPlanField('instructionalPurpose', event.target.value)}
                  style={inputStyle}
                >
                  <option value="lesson">New lesson / instruction</option>
                  <option value="review">Review / spiral</option>
                  <option value="intervention">Intervention</option>
                  <option value="assessment">Assessment</option>
                </select>
              </label>

              <label style={fieldLabel}>
                Gradebook purpose
                <select
                  value={creatorPlan.gradingPurpose}
                  onChange={(event) => setPlanField('gradingPurpose', event.target.value)}
                  style={inputStyle}
                >
                  <option value="classwork">Classwork</option>
                  <option value="practice">Practice</option>
                  <option value="quiz">Quiz</option>
                  <option value="test">Test</option>
                  <option value="warmup">Warm-Up</option>
                </select>
              </label>
            </div>

            <label style={{ ...fieldLabel, marginBottom: 16 }}>
              What are students learning or practicing?
              <textarea
                value={creatorPlan.topic}
                onChange={(event) => setPlanField('topic', event.target.value)}
                placeholder="Describe the lesson, standards, source lesson, representations, or skills. Example: Students evaluate functions, perform operations on functions, and compose functions using equations and tables."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, minHeight: 96 }}
              />
            </label>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 900, color: '#172033', fontSize: 14, marginBottom: 8 }}>2. Sections, student versions, and rigor</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
                gap: 10,
                alignItems: 'end',
                marginBottom: 10,
              }}>
                <label style={fieldLabel}>
                  Rigor emphasis
                  <select
                    value={creatorPlan.rigorPreset}
                    onChange={(event) => setPlanField('rigorPreset', event.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(CREATOR_RIGOR_PRESETS).map(([value, preset]) => (
                      <option key={value} value={value}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                <div style={{
                  minHeight: 44, boxSizing: 'border-box', padding: '9px 11px',
                  border: '1px solid #d9e2f1', borderRadius: 9, background: '#f8fafc',
                  color: '#5f6b7a', fontSize: 12.5, lineHeight: 1.45,
                }}>
                  {CREATOR_RIGOR_PRESETS[creatorPlan.rigorPreset]?.summary}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 10 }}>
                {SECTION_ORDER.map((role) => {
                  const section = creatorPlan.sections[role];
                  return (
                    <div
                      key={role}
                      style={{
                        border: section.enabled ? '1px solid #9bb8e8' : '1px solid #d9e2f1',
                        borderRadius: 11,
                        padding: 12,
                        background: section.enabled ? '#fff' : '#f8fafc',
                        opacity: section.enabled ? 1 : 0.72,
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#172033', marginBottom: 10 }}>
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          onChange={(event) => setSectionField(role, 'enabled', event.target.checked)}
                        />
                        {section.label}
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 8 }}>
                        <label style={{ ...fieldLabel, fontSize: 11 }}>
                          Questions
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={section.count}
                            disabled={!section.enabled}
                            onChange={(event) => setSectionField(role, 'count', event.target.value)}
                            style={{ ...inputStyle, minHeight: 40 }}
                          />
                        </label>
                        <label style={{ ...fieldLabel, fontSize: 11 }}>
                          Student version
                          <select
                            value={section.mode}
                            disabled={!section.enabled}
                            onChange={(event) => setSectionField(role, 'mode', event.target.value)}
                            style={{ ...inputStyle, minHeight: 40 }}
                          >
                            {Object.entries(modeLabel).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
                Same problem is best when the class needs one common example. Same task, different numbers discourages copying without changing rigor.
                Adaptive may adjust difficulty/reasoning only inside the assigned standard and role-based limits.
              </p>
            </div>

            <div style={{ fontWeight: 900, color: '#172033', fontSize: 14, margin: '2px 0 8px' }}>
              3. Supports, Honors, and outputs
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
              gap: 12,
              marginBottom: 14,
            }}>
              <div style={{ border: '1px solid #d9e2f1', borderRadius: 11, padding: 12 }}>
                <div style={{ fontWeight: 900, color: '#172033', marginBottom: 5 }}>Assignment outputs</div>
                <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>
                  Optional — PDFs are off by default so a digital assignment can be saved to the Library immediately.
                  Turn on only the copies you want; any PDF can also be enabled later from Assignment Setup.
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={creatorPlan.outputs.studentWorksheetPdf}
                    onChange={(event) => setOutputField('studentWorksheetPdf', event.target.checked)}
                  />
                  Printable student worksheet PDF
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={creatorPlan.outputs.teacherWorksheetPdf}
                    onChange={(event) => setOutputField('teacherWorksheetPdf', event.target.checked)}
                  />
                  Teacher copy PDF with answers/available solutions
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={creatorPlan.outputs.answerKeyPdf}
                    onChange={(event) => setOutputField('answerKeyPdf', event.target.checked)}
                  />
                  Compact answer-key PDF
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={creatorPlan.outputs.lessonNotesPdf}
                    onChange={(event) => setOutputField('lessonNotesPdf', event.target.checked)}
                  />
                  Separate 1–2 page lesson-notes PDF
                </label>
              </div>

              <div style={{ border: '1px solid #c8d8ef', borderRadius: 11, padding: 12, background: '#f7faff' }}>
                <div style={{ fontWeight: 900, color: '#174ea6', marginBottom: 5 }}>Student support plans · automatic</div>
                <div style={{ color: '#526274', fontSize: 13, lineHeight: 1.5 }}>
                  MathMaster applies each student&apos;s authorized IEP/504/EB access supports at delivery.
                  Accommodations are not stored in this assignment and do not change the assessed standard.
                  Modified curriculum is handled through its separate reporting path.
                </div>
              </div>

              <div style={{ border: '1px solid #c9ddc8', borderRadius: 11, padding: 12, background: '#f7fbf6' }}>
                <div style={{ fontWeight: 900, color: '#245b2a', marginBottom: 5 }}>Honors + CCMR</div>
                <div style={{ color: '#48624b', fontSize: 13, lineHeight: 1.5 }}>
                  No Honors checkbox is needed here. Honors is inherited from the destination class in Preflight.
                  Honors-ready Practice keeps course TEKS, adds depth/transfer, and preserves the recent authentic CCMR target of about 15%.
                </div>
              </div>
            </div>

            <label style={{ ...fieldLabel, marginBottom: 14 }}>
              Additional directions <span style={{ color: '#64748b', fontWeight: 600 }}>(optional)</span>
              <textarea
                value={creatorPlan.teacherNotes}
                onChange={(event) => setPlanField('teacherNotes', event.target.value)}
                placeholder="Example: Use the district Lesson 2 vocabulary; do not introduce logarithms yet; include at least two table-based questions."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
              />
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleBuildInsideMathMaster}
                disabled={busy || aiBusy}
                style={{ ...primaryButton, opacity: busy || aiBusy ? 0.6 : 1 }}
              >
                {aiBusy ? '✨ Building assignment…' : '✨ Build Assignment in MathMaster'}
              </button>
              <button
                type="button"
                onClick={handleCopyBuildRequest}
                disabled={busy || aiBusy}
                style={{ ...secondaryButton, opacity: busy || aiBusy ? 0.6 : 1 }}
              >
                📋 Copy Complete AI Build Request
              </button>
              <details>
                <summary style={{ cursor: 'pointer', color: '#174ea6', fontWeight: 800, fontSize: 13 }}>
                  Advanced
                </summary>
                <button type="button" onClick={handleCopyContract} style={{ ...secondaryButton, marginTop: 8, minHeight: 38, fontSize: 13 }}>
                  Copy technical authoring contract
                </button>
              </details>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {stepBadge(4)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#172033' }}>4. Review the AI result in MathMaster</h3>
            <p style={{ margin: '0 0 14px', color: '#5f6b7a', lineHeight: 1.55, fontSize: 14 }}>
              “Build Assignment in MathMaster” sends your plan through the protected server AI when it is configured.
              You can also paste or upload a finished assignment from ChatGPT, Claude, or Gemini.
              Either route goes through the same MathMaster checks for standards, grading, mobile inputs, supports, adaptive rigor, CCMR fidelity, and PDF renderability before Assignment Review.
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
              <button type="button" onClick={handlePaste} disabled={busy || aiBusy} style={{ ...primaryButton, opacity: busy || aiBusy ? 0.6 : 1 }}>
                📥 Paste AI Assignment
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || aiBusy} style={{ ...secondaryButton, opacity: busy || aiBusy ? 0.6 : 1 }}>
                ⬆ Upload Assignment File
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
            This assignment needs attention{failure.sourceName ? ` — ${failure.sourceName}` : ''}
          </h3>
          <p style={{ margin: '0 0 10px', color: '#5f6b7a', fontSize: 13, lineHeight: 1.55 }}>
            {failure.compilerDefect
              ? 'The assignment contains enough mathematical intent, but MathMaster failed while building its renderer/runtime plumbing. This is a platform defect; do not rewrite the assignment into an older format.'
              : Number(failure.sourceSchemaVersion) === 5
                ? 'MathMaster owns renderer plumbing. The remaining issue should be a genuine mathematical/content omission or a malformed assignment field.'
                : 'This file uses an older unsupported assignment format. Recreate the assignment with the creator above.'}
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
            {Number(failure.sourceSchemaVersion) === 5 && (
              <button type="button" onClick={handleCopyFixRequest} style={primaryButton}>
                {failure.compilerDefect ? '📋 Copy Platform Bug Report' : '📋 Copy AI Fix Request'}
              </button>
            )}
            <button type="button" onClick={clearFailure} style={secondaryButton}>Dismiss</button>
          </div>
        </div>
      )}
    </section>
  );
}
