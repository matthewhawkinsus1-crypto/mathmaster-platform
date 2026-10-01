import { supportLabel } from '../../../../functions/shared/supportCatalog.mjs';
import { PROVENANCE_LABEL } from '../../../../functions/shared/supportEvidenceModel.mjs';
import { SupportClassificationTag } from '../SupportProfileEditor.jsx';
import { fromSupportProvenance } from '../../../platform/caseReview/caseProvenance.js';
import { ConditionTag, EmptyNote, Prov, day, when } from './CaseReviewParts.jsx';

/*
 * SUPPORT EVIDENCE — PR #401's records, as PR #401 defines them. Configured,
 * Available, Provided, Used and Staff documented stay separate categories, and
 * academic results are never used to infer whether a support was provided.
 * The full Student Support Evidence Report is one click away.
 */

export default function CaseSupportTab({ model, onOpenSupportReport = null }) {
  const { profile, summary, service } = model.supportEvidence;
  const current = profile.current;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-support-profile">
        <h2 id="cr-support-profile">Support profile in effect</h2>
        {current ? (
          <div className="cr-card">
            <p className="cr-note" style={{ margin: 0 }}>
              {profile.status === 'unversioned' ? 'Recorded before versioning (no dates or source)' : `Revision ${current.revision} · effective ${current.effectiveStart}${current.effectiveEnd ? ` to ${current.effectiveEnd}` : ''}${current.sourceLabel ? ` · ${current.sourceLabel}` : ''}`}
              {' '}<Prov level={fromSupportProvenance(current.provenance)} />
            </p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Accommodations:</strong> {current.accommodations.map((entry) => `${entry.label}${entry.detail ? ` (${entry.detail})` : ''}`).join('; ') || 'None'}</p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Modifications:</strong> {current.modifications.length ? current.modifications.map((entry) => entry.label).join('; ') : 'None — grade-level expectations'}</p>
          </div>
        ) : <EmptyNote>No support profile is recorded in MathMaster for this period.</EmptyNote>}
        {profile.warnings.map((warning) => <div key={`${warning.code}-${warning.message}`} className="tw-notice" data-tone="warning">{warning.message}</div>)}
        {onOpenSupportReport && <div><button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenSupportReport(model.meta.studentId)}>Open the full Student Support Evidence Report</button></div>}
      </section>

      <section className="cr-section" aria-labelledby="cr-support-counts">
        <h2 id="cr-support-counts">Supports in this period</h2>
        <p className="cr-note">Configured is not available, available is not used, and no record is not "not provided". Academic results are never used to infer whether a support was provided.</p>
        {summary.supports.length ? (
          <div className="cr-scroll-x">
            <table className="cr-table">
              <thead><tr><th>Support</th><th>Type</th><th>Configured</th><th>Assignments available</th><th>Assignments provided</th><th>Uses</th><th>Staff documented</th></tr></thead>
              <tbody>
                {summary.supports.map((support) => (
                  <tr key={support.supportId}>
                    <td>{support.label}</td>
                    <td><SupportClassificationTag supportId={support.supportId} classification={support.classification} /></td>
                    <td>{support.configured ? 'Yes' : 'No'}</td>
                    <td className="cr-num">{support.measurable.includes('available') ? support.assignmentsAvailable : 'n/a'}</td>
                    <td className="cr-num">{support.measurable.includes('provided') ? support.assignmentsProvided : 'n/a'}</td>
                    <td className="cr-num">{support.measurable.includes('used') ? support.uses : 'n/a'}</td>
                    <td className="cr-num">{support.staffRecords}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote>No support is configured and no support record exists in MathMaster for this period.</EmptyNote>}
        <p className="cr-note">Service time recorded by staff in MathMaster: {service.totalMinutes} minutes. {service.disclaimer}</p>
      </section>

      <section className="cr-section" aria-labelledby="cr-support-assignments">
        <h2 id="cr-support-assignments">By assignment</h2>
        <div className="cr-scroll-x">
          <table className="cr-table">
            <thead><tr><th>Assignment</th><th>Condition</th><th>Profile revision</th><th>Individualized due</th><th>Supports (record in MathMaster)</th><th>Staff records</th></tr></thead>
            <tbody>
              {model.assignments.map((entry) => {
                const row = entry.supportRow;
                return (
                  <tr key={entry.assignmentId}>
                    <td>{entry.title}</td>
                    <td><ConditionTag value={row.condition.value} />{row.condition.modifications.length ? ` ${row.condition.modifications.map(supportLabel).join(', ')}` : ''}</td>
                    <td>{row.governing.revision !== null ? `Revision ${row.governing.revision}` : 'None recorded'} <span className="cr-note">({PROVENANCE_LABEL[row.governing.provenance]})</span></td>
                    <td>{row.individualizedDue ? day(row.individualizedDue.dueAtMs) : '—'}</td>
                    <td>{row.supports.length ? row.supports.map((support) => {
                      const parts = [support.configured ? 'configured' : '', support.available ? `available` : '', support.provided ? 'provided' : '', support.used ? `used ${support.used}×` : '', support.documented ? `staff ${support.documented}×` : ''].filter(Boolean);
                      return `${support.label}: ${parts.join(', ') || 'not recorded'}`;
                    }).join(' · ') : '—'}</td>
                    <td>{row.staffEvents.length ? row.staffEvents.map((event) => `${supportLabel(event.supportId)} ${when(event.occurredAtMs)}`).join(' · ') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
