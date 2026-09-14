import { useCallback, useEffect, useState } from 'react';
import {
  DEPLOYED_COURSE_PATH_RELEASE,
} from '../../platform/path/pathReleaseManifest.generated.js';
import {
  RELEASE_PHASE_MESSAGES,
  describeReleaseCounts,
  describeReleaseDiagnostic,
} from '../../platform/path/pathReleaseV2Presentation.js';
import {
  fetchCoursePathReleaseStatus,
  publishCoursePathRelease,
  resumeCoursePathRelease,
} from '../../platform/path/pathReleaseV2Service.js';

// Administration -> My Math Path content coverage -> the course release control.
//
// ONE workflow replaces the old one-shot refresh: publish the certified release
// that was built and proved in CI, watch it move through its phases, and resume
// it if it stops. The page knows the difference between "Functions were
// deployed" and "students are being served this content", because those were
// the same button before and they are not the same fact.

const card = {
  border: '1px solid #d8dde6', borderRadius: 12, padding: '20px 22px',
  marginBottom: 20, textAlign: 'left', background: '#fff',
};
const primary = {
  minHeight: 42, padding: '0 16px', border: 0, borderRadius: 9,
  background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer',
};
const quiet = {
  minHeight: 38, padding: '0 13px', border: '1px solid #c7cdd6', borderRadius: 8,
  background: '#fff', color: '#3c4043', fontWeight: 700, cursor: 'pointer',
};

const STATUS_STYLE = {
  current: { background: '#e6f4ea', color: '#137333', border: '#a8dab5' },
  'activation-required': { background: '#fef7e0', color: '#7a4f00', border: '#f0d9a0' },
  running: { background: '#e8f0fe', color: '#174ea6', border: '#c5d5ef' },
  interrupted: { background: '#fef7e0', color: '#7a4f00', border: '#f0d9a0' },
  failed: { background: '#fce8e6', color: '#a50e0e', border: '#f2b8b5' },
  'no-artifact': { background: '#f1f3f4', color: '#3c4043', border: '#d8dde6' },
  'deployment-mismatch': { background: '#fce8e6', color: '#a50e0e', border: '#f2b8b5' },
};

const PHASE_ORDER = ['created', 'validating', 'staging', 'activating', 'coverage', 'verifying', 'complete'];

const shortHash = (value) => (value ? String(value).slice(0, 12) : '—');

export default function PathReleaseV2Panel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchCoursePathReleaseStatus());
    } catch (caught) {
      setStatus(null);
      setError(caught?.message || 'Could not read the Path release status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (mode) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ phase: 'created', label: RELEASE_PHASE_MESSAGES.created });
    try {
      const runner = mode === 'resume' ? resumeCoursePathRelease : publishCoursePathRelease;
      const outcome = await runner({ onProgress: setProgress });
      setResult(outcome);
      await load();
    } catch (caught) {
      setError(caught?.message || 'The Path release could not be started.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const state = status?.status || (loading ? 'running' : 'no-artifact');
  const palette = STATUS_STYLE[state] || STATUS_STYLE['no-artifact'];
  const diagnostic = describeReleaseDiagnostic(result?.diagnostic || status?.lastError || status?.job?.lastError);
  const activePhase = progress?.phase || status?.phase || null;

  return (
    <section style={{ ...card, background: palette.background, borderColor: palette.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>Course Path release</h3>
          <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.55, maxWidth: 760 }}>
            Grade 6, Grade 7, Grade 8, Algebra I and Algebra II built-in content is published as one certified
            release. It was compiled, Firestore-certified and proved issuable by the production issuer before it
            was deployed, so publishing compares it with production and writes only what actually changed.
          </p>
        </div>
        <button type="button" style={quiet} onClick={load} disabled={loading || busy}>
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <p role="status" style={{ margin: '14px 0 4px', fontWeight: 900, fontSize: 15, color: palette.color }}>
        {loading ? 'Checking the deployed release…' : (status?.label || 'Unknown release state')}
      </p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', margin: '10px 0 0', fontSize: 13 }}>
        <dt style={{ color: '#5f6368' }}>Deployed (certified)</dt>
        <dd style={{ margin: 0 }}>
          <code>{status?.deployed?.releaseId || DEPLOYED_COURSE_PATH_RELEASE.releaseId || '—'}</code>
          {' · '}hash <code>{shortHash(status?.deployed?.contentHash || DEPLOYED_COURSE_PATH_RELEASE.contentHash)}</code>
          {' · '}{status?.deployed?.questionCount ?? DEPLOYED_COURSE_PATH_RELEASE.questionCount} questions
        </dd>
        <dt style={{ color: '#5f6368' }}>Active in production</dt>
        <dd style={{ margin: 0 }}>
          <code>{status?.activeReleaseId || 'none'}</code>
          {status?.active?.status ? ` · ${status.active.status}` : ''}
          {' · '}hash <code>{shortHash(status?.active?.contentHash)}</code>
        </dd>
        <dt style={{ color: '#5f6368' }}>This browser bundle</dt>
        <dd style={{ margin: 0 }}>
          <code>{DEPLOYED_COURSE_PATH_RELEASE.releaseId || '—'}</code>
          {' · '}built {DEPLOYED_COURSE_PATH_RELEASE.builtAt || 'unknown'}
        </dd>
      </dl>

      {status?.status === 'deployment-mismatch' && status.mismatch ? (
        <div role="alert" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 9, background: '#fff', border: '1px solid #f2b8b5' }}>
          <strong style={{ color: '#a50e0e' }}>Hosting and path-admin were deployed from different builds.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
            <li>This page was built for <code>{status.mismatch.browserReleaseId || 'no release'}</code>.</li>
            <li>The server has <code>{status.mismatch.serverReleaseId || 'no release'}</code>.</li>
            <li>Differs: {status.mismatch.differs.join(', ')}.</li>
          </ul>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#5f6368' }}>
            Deploy Hosting and the path-admin codebase from the same build, then reload this page.
          </p>
        </div>
      ) : null}

      {busy || (status?.job && !['complete', null].includes(status.job.phase)) ? (
        <ol style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {PHASE_ORDER.map((phase) => {
            const reached = PHASE_ORDER.indexOf(activePhase) >= PHASE_ORDER.indexOf(phase);
            const isCurrent = activePhase === phase;
            const staging = phase === 'staging' && (progress?.totalChunks || status?.job?.totalChunks);
            return (
              <li key={phase} style={{
                fontSize: 13, fontWeight: isCurrent ? 900 : 600,
                color: isCurrent ? '#174ea6' : reached ? '#137333' : '#80868b',
              }}>
                {reached ? '●' : '○'} {RELEASE_PHASE_MESSAGES[phase]}
                {staging
                  ? ` ${progress?.completedChunks ?? status?.job?.completedChunks ?? 0} / ${progress?.totalChunks ?? status?.job?.totalChunks ?? 0}`
                  : ''}
              </li>
            );
          })}
        </ol>
      ) : null}

      {status?.job?.counts ? (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#3c4043' }}>
          Change plan: {describeReleaseCounts(status.job.counts)}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button
          type="button"
          style={primary}
          onClick={() => run('publish')}
          disabled={busy || loading || status?.status === 'current' || status?.status === 'no-artifact' || status?.status === 'deployment-mismatch'}
        >
          {busy ? 'Publishing…' : 'Publish certified course Path release'}
        </button>
        {status?.status === 'interrupted' || status?.status === 'failed' ? (
          <button type="button" style={quiet} onClick={() => run('resume')} disabled={busy}>
            Resume release
          </button>
        ) : null}
      </div>

      {status?.status === 'current' ? (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#137333', fontWeight: 700 }}>
          Production is current. Republishing this release would write no question documents.
        </p>
      ) : null}

      {result?.ok && result.status === 'already-active' ? (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#137333', fontWeight: 700 }}>
          Production is already serving this certified release.
        </p>
      ) : null}

      {result?.ok && result.status === 'complete' ? (
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 9, background: '#fff', border: '1px solid #a8dab5' }}>
          <strong style={{ color: '#137333' }}>Release complete.</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>{describeReleaseCounts(result.counts)}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5f6368' }}>
            Coverage rebuilt for {result.coverage?.courses?.join(', ') || 'no courses'}
            {result.coverage?.skipped?.length ? ` · unchanged: ${result.coverage.skipped.join(', ')}` : ''}
            {typeof result.coverage?.issuerRuns === 'number' ? ` · issuer runs: ${result.coverage.issuerRuns}` : ''}
          </p>
        </div>
      ) : null}

      {diagnostic ? (
        <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 9, background: '#fff', border: '1px solid #f2b8b5' }}>
          <strong style={{ color: '#a50e0e' }}>{diagnostic.headline}</strong>
          {diagnostic.where ? <p style={{ margin: '6px 0 0', fontSize: 13, color: '#3c4043' }}>{diagnostic.where}</p> : null}
          {diagnostic.code ? <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5f6368' }}><code>{diagnostic.code}</code></p> : null}
          {diagnostic.nextAction ? (
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>
              <strong>{diagnostic.recoverable ? 'Recoverable.' : 'Not recoverable without a rebuild.'}</strong>{' '}
              {diagnostic.nextAction}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: '#a50e0e', fontWeight: 700 }}>{error}</p>
      ) : null}
    </section>
  );
}
