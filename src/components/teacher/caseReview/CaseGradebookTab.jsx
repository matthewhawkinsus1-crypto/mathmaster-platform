import { useState } from 'react';
import {
  COLUMN_ROLES, COLUMN_ROLE_LABEL, GRADEBOOK_LAYOUT, IMPORT_LIMITS, applyColumnRoles, columnRolesFromLayout, detectGradebookLayout,
  extractStudentGradebook, parseDelimitedText,
} from '../../../platform/caseReview/sisGradebookImport.js';
import { RECONCILIATION_STATUS } from '../../../platform/caseReview/sisReconciliation.js';
import { CASE_PROVENANCE } from '../../../platform/caseReview/caseProvenance.js';
import { EmptyNote, Prov, day, when } from './CaseReviewParts.jsx';

/*
 * OFFICIAL GRADE RECONCILIATION — import a current gradebook snapshot,
 * read-only. The file is read in this browser; every other student's row is
 * dropped before anything is shown; nothing changes a grade. The teacher sees
 * (and may correct) how each column was read, confirms or overrides each item
 * match, and may save the one-student snapshot with this case file.
 */

const STATUS_KIND = {
  [RECONCILIATION_STATUS.MATCH]: 'good',
  [RECONCILIATION_STATUS.NOT_EXPORTED_SAME]: 'good',
  [RECONCILIATION_STATUS.OFFICIAL_DIFFERS_FROM_EXPORT]: 'bad',
  [RECONCILIATION_STATUS.NOT_EXPORTED_DIFFERS]: 'bad',
  [RECONCILIATION_STATUS.CHANGED_SINCE_EXPORT]: 'warn',
  [RECONCILIATION_STATUS.OFFICIAL_BLANK]: 'warn',
  [RECONCILIATION_STATUS.MATHMASTER_NO_GRADE]: 'warn',
};
const STATUS_SHORT = {
  match: 'Matches export',
  'official-differs-from-export': 'Differs from export',
  'changed-since-export': 'Changed since export',
  'not-exported-same': 'Same (no export record)',
  'not-exported-differs': 'Differs (no export record)',
  'official-blank': 'Gradebook blank / mark',
  'official-excused': 'Excused in gradebook',
  'mathmaster-no-grade': 'No MathMaster grade yet',
  'unmatched-sis-item': 'No MathMaster match',
};
const LAYOUT_LABEL = { wide: 'one row per student', long: 'one row per student per item', 'mathmaster-teams': 'MathMaster TEAMS upload file' };

function ImportPanel({ student, onUse, onSave, saving, saveError }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');

  const readFile = async (file) => {
    setError('');
    setDraft(null);
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxBytes) { setError('That file is larger than 5 MB.'); return; }
    const text = await file.text();
    const parsed = parseDelimitedText(text);
    const layout = detectGradebookLayout(parsed.rows, { fileName: file.name });
    const header = layout.headerIndex >= 0 ? parsed.rows[layout.headerIndex] : [];
    setDraft({ fileName: file.name, rows: parsed.rows, layout, header, roles: columnRolesFromLayout(layout, header), confirmedRowIndex: null });
  };

  if (!draft) {
    return (
      <div className="cr-card" data-case-sis-import>
        <h3>Import current gradebook snapshot</h3>
        <p className="cr-note" style={{ margin: 0 }}>
          A CSV exported from the official gradebook (TEAMS, Skyward or similar). Read-only: nothing changes a grade. The file is read in this browser
          and only this student&apos;s row is kept.
        </p>
        <label className="cr-field"><span>Gradebook file (.csv, .tsv, .txt)</span>
          <input className="cr-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Gradebook file" onChange={(event) => readFile(event.target.files?.[0])} />
        </label>
        {error && <div className="tw-notice" data-tone="danger" role="alert">{error}</div>}
      </div>
    );
  }

  const layout = draft.layout.layout === GRADEBOOK_LAYOUT.MATHMASTER_TEAMS || draft.layout.layout === GRADEBOOK_LAYOUT.UNKNOWN
    ? draft.layout
    : applyColumnRoles(draft.layout, draft.header, draft.roles);
  const extracted = extractStudentGradebook({ rows: draft.rows, layout, student, confirmedRowIndex: draft.confirmedRowIndex, fileName: draft.fileName });
  const usable = extracted.matchedBy && extracted.items.length > 0;
  const snapshot = usable ? {
    ...extracted, source: { fileName: draft.fileName, layout: layout.layout }, importedAtMs: Date.now(), saved: false,
  } : null;
  const roleOptions = COLUMN_ROLES[layout.layout] || [];
  return (
    <div className="cr-card" data-case-sis-preview>
      <h3>{draft.fileName}</h3>
      {layout.layout === GRADEBOOK_LAYOUT.UNKNOWN
        ? <div className="tw-notice" data-tone="warning">{layout.reason}</div>
        : <p className="cr-note" style={{ margin: 0 }}>Read as: {LAYOUT_LABEL[layout.layout]}{layout.headerIndex >= 0 ? ` · header on row ${layout.headerIndex + 1}` : ''} · {extracted.otherStudentRowsDiscarded} other student row{extracted.otherStudentRowsDiscarded === 1 ? '' : 's'} dropped.</p>}
      {roleOptions.length > 0 && (
        <details>
          <summary>How each column was read (correct it if needed)</summary>
          <div className="cr-scroll-x">
            <table className="cr-table">
              <thead><tr><th>Column</th><th>Read as</th></tr></thead>
              <tbody>
                {draft.header.map((cell, index) => (
                  <tr key={`${cell}-${index}`}>
                    <td>{cell || `Column ${index + 1}`}</td>
                    <td>
                      <select className="tw-select" aria-label={`Role of column ${cell || index + 1}`} value={draft.roles[index] || 'ignore'} onChange={(event) => setDraft((current) => ({ ...current, roles: current.roles.map((role, roleIndex) => (roleIndex === index ? event.target.value : role)) }))}>
                        {roleOptions.map((role) => <option key={role} value={role}>{COLUMN_ROLE_LABEL[role]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {layout.reason && <p className="cr-note">{layout.reason}</p>}
        </details>
      )}
      {extracted.notes.map((note) => <p key={note} className="cr-note" style={{ margin: 0 }}>{note}</p>)}
      {!extracted.matchedBy && extracted.nameCandidates.map((candidate) => (
        <div key={candidate.rowIndex} className="tw-notice" data-tone="warning">
          Row {candidate.rowIndex + 1} is named “{candidate.name}”. Names are not unique.{' '}
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => setDraft((current) => ({ ...current, confirmedRowIndex: candidate.rowIndex }))}>Use this row — it is this student</button>
        </div>
      ))}
      {usable && <p className="cr-note" style={{ margin: 0 }}>{extracted.items.length} item{extracted.items.length === 1 ? '' : 's'} for this student{extracted.officialAverage !== null ? ` · official average ${extracted.officialAverage}` : ' · no official average in the file'}.</p>}
      <div className="tw-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="tw-btn tw-btn--primary tw-btn--sm" disabled={!usable} onClick={() => { onUse(snapshot); setDraft(null); }}>Compare with MathMaster</button>
        <button type="button" className="tw-btn tw-btn--sm" disabled={!usable || saving} onClick={async () => { const saved = await onSave({ extracted, layout: layout.layout, fileName: draft.fileName }); if (saved) setDraft(null); }}>{saving ? 'Saving…' : 'Compare and save with this case file'}</button>
        <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => setDraft(null)}>Discard</button>
      </div>
      {saveError && <div className="tw-notice" data-tone="danger" role="alert">{saveError}</div>}
    </div>
  );
}

export default function CaseGradebookTab({
  model, student, savedSnapshots = [], onUseSnapshot, onSaveSnapshot, onClearSnapshot, onConfirmMatch, saving = false, saveError = '',
}) {
  const sis = model.sis;
  const parts = model.assignments.flatMap((entry) => entry.gradeItems.map((item) => ({
    key: `${entry.assignmentId}|${item.key === 'assignment' ? '' : item.key}`,
    assignmentId: entry.assignmentId,
    sectionKey: item.key === 'assignment' ? '' : item.key,
    label: item.key === 'assignment' ? entry.title : `${entry.title} — ${item.label}`,
  })));
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-gradebook">
        <h2 id="cr-gradebook">Official grade reconciliation</h2>
        <p className="cr-note">
          MathMaster grade contributions are not the official cycle average: categories and weights are set in the gradebook. Import a current
          gradebook export to compare item by item. MathMaster never guesses a district&apos;s weighting.
        </p>
        <ImportPanel student={student} onUse={onUseSnapshot} onSave={onSaveSnapshot} saving={saving} saveError={saveError} />
        {savedSnapshots.length > 0 && (
          <div className="cr-card">
            <h3>Saved snapshots for this student</h3>
            <ul className="cr-lines">
              {savedSnapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  {snapshot.source.fileName || 'Gradebook file'} · imported {when(snapshot.importedAtMs)}{snapshot.importedByEmail ? ` by ${snapshot.importedByEmail}` : ''}{' '}
                  <button type="button" className="tw-btn tw-btn--sm" onClick={() => onUseSnapshot(snapshot)}>Compare</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {sis ? (
        <>
          <section className="cr-section" aria-labelledby="cr-gradebook-reconciliation" data-case-reconciliation>
            <h2 id="cr-gradebook-reconciliation">
              {sis.meta.fileName || 'Imported gradebook'} <Prov level={CASE_PROVENANCE.SIS} />
            </h2>
            <p className="cr-note">
              {sis.meta.saved ? 'Saved with this case file' : 'Imported in this session (not saved)'}{sis.meta.importedAtMs ? ` · ${day(sis.meta.importedAtMs)}` : ''} ·
              {' '}{sis.reconciliation.counts.items} items · {sis.reconciliation.counts.agree} agree · {sis.reconciliation.counts.differ} differ ·
              {' '}{sis.reconciliation.counts.changedSinceExport} changed since export · {sis.reconciliation.counts.unmatchedSisItems} with no MathMaster match ·
              {' '}{sis.reconciliation.counts.missingFromSis} MathMaster parts not in the file. {sis.reconciliation.note}
            </p>
            <div className="cr-scroll-x">
              <table className="cr-table">
                <thead><tr><th>Gradebook item</th><th>Category</th><th>Official</th><th>Matched MathMaster work</th><th>MathMaster now</th><th>Last exported</th><th>Comparison</th></tr></thead>
                <tbody>
                  {sis.reconciliation.rows.map((row) => (
                    <tr key={row.itemName} data-sis-status={row.status}>
                      <td>{row.itemName}</td>
                      <td>{row.category || '—'}</td>
                      <td className="cr-num">{row.excused ? 'EX' : (row.officialScore ?? (row.officialScoreText || '—'))}</td>
                      <td>
                        <select
                          className="tw-select"
                          aria-label={`MathMaster match for ${row.itemName}`}
                          value={row.match ? `${row.match.assignmentId}|${row.match.sectionKey}` : 'none'}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === 'none') onConfirmMatch(row.itemName, { none: true });
                            else {
                              const [assignmentId, sectionKey] = value.split('|');
                              onConfirmMatch(row.itemName, { assignmentId, sectionKey });
                            }
                          }}
                        >
                          <option value="none">No MathMaster match</option>
                          {parts.map((part) => <option key={part.key} value={part.key}>{part.label}</option>)}
                        </select>
                        {row.match && <div className="cr-note">{row.match.method === 'teacher-confirmed' ? 'Confirmed by you' : 'Matched by title'}</div>}
                      </td>
                      <td className="cr-num">{row.mathMasterScore ?? '—'}</td>
                      <td className="cr-num">{row.exportedScore ?? '—'}</td>
                      <td><span className="cr-tag" data-kind={STATUS_KIND[row.status] || ''} title={row.statusLabel}>{STATUS_SHORT[row.status] || row.status}</span>{row.difference ? <div className="cr-note">difference {row.difference > 0 ? '+' : ''}{row.difference}</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sis.reconciliation.missingFromSis.length > 0 && (
              <details className="tw-disclosure">
                <summary>MathMaster work not in this gradebook file ({sis.reconciliation.missingFromSis.length})</summary>
                <div className="tw-disclosure__body"><ul className="cr-lines">{sis.reconciliation.missingFromSis.map((row) => <li key={`${row.assignmentId}|${row.sectionKey}`}>{row.label} — MathMaster {row.mathMasterScore ?? '—'} · {row.exportLabel || 'export state not loaded'}</li>)}</ul></div>
              </details>
            )}
            <div><button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={onClearSnapshot}>Stop comparing</button></div>
          </section>

          <section className="cr-section" aria-labelledby="cr-gradebook-contribution" data-case-official-contribution>
            <h2 id="cr-gradebook-contribution">What is contributing to the official cycle grade</h2>
            {sis.contribution.sufficient ? (
              <>
                <p className="cr-note">{sis.contribution.explanation}</p>
                <div className="cr-scroll-x">
                  <table className="cr-table">
                    <thead><tr><th>Category</th><th>Weight</th><th>Category average</th><th>Average points carried</th><th>Points below full</th></tr></thead>
                    <tbody>{sis.contribution.categories.map((row) => <tr key={row.name}><td>{row.name}</td><td className="cr-num">{row.weightShare}%</td><td className="cr-num">{row.average}%</td><td className="cr-num">{row.contributionPoints}</td><td className="cr-num">{row.pointsBelowFull}</td></tr>)}</tbody>
                  </table>
                </div>
                <h3>Items costing the most average points</h3>
                <ul className="cr-lines">{sis.contribution.rankedByImpact.slice(0, 8).map((row) => <li key={`${row.category}-${row.name}`}>{row.name} ({row.category}, {row.score}%): {row.pointsBelowFull} points below full credit</li>)}</ul>
              </>
            ) : <div className="tw-notice" data-tone="warning">{sis.contribution.explanation}</div>}
          </section>
        </>
      ) : <EmptyNote>No gradebook snapshot is being compared.</EmptyNote>}
    </>
  );
}
