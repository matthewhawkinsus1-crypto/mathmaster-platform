import { useState } from 'react';

import { runAssignmentAiSelfTest } from '../../services/assignmentAiService.js';

const panel = {
  border: '1px solid #dadce0',
  borderRadius: 12,
  padding: '20px 22px',
  marginBottom: 18,
  background: '#fff',
};

// Each stage/code the self-test can report, paired with the one action that
// actually resolves it. Without this an administrator sees a provider error
// string and still has to guess whether it is billing, entitlement or egress.
const REMEDIES = Object.freeze({
  secret: 'Set the server secret, then redeploy the AI functions: firebase functions:secrets:set OPENAI_API_KEY --project mathmaster-aleks',
  'resource-exhausted': 'OpenAI accepted the credential but refused the work. Check billing and usage limits on the OpenAI API project, or wait out a rate limit.',
  'failed-precondition': 'OpenAI rejected the request itself — usually a bad credential or a model this API project cannot serve. Check the key and the configured model.',
  unavailable: 'MathMaster could not reach OpenAI at all. This is network egress from Cloud Functions, not a MathMaster setting.',
  'deadline-exceeded': 'OpenAI accepted the request but did not answer in time. Retry; if it persists, lower OPENAI_ASSIGNMENT_REASONING_EFFORT.',
  internal: 'OpenAI answered with something MathMaster could not use. The exact provider status is in the diagnostics below and in Cloud Logging.',
});

const rowStyle = { display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid #f1f3f4', fontSize: 13 };

export default function AssignmentAiHealth() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runCheck = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await runAssignmentAiSelfTest());
    } catch (checkError) {
      // A thrown error here means the callable itself did not run — not
      // reachable, not deployed, or not permitted for this account.
      setError(
        String(checkError?.message || checkError || '')
          .replace(/^Firebase:\s*/i, '')
          .trim() || 'The self-test could not be reached.',
      );
    } finally {
      setBusy(false);
    }
  };

  const diagnostics = result?.diagnostics || null;
  const remedy = result && !result.ok ? (REMEDIES[result.stage === 'secret' ? 'secret' : result.code] || null) : null;

  return (
    <section style={panel}>
      <h2 style={{ margin: 0, fontSize: 19 }}>Assignment AI health</h2>
      <p style={{ margin: '6px 0 14px', color: '#5f6368', fontSize: 13.5, lineHeight: 1.5 }}>
        Makes one very small real request to the AI provider and reports exactly what came back.
        It proves the server credential, the model entitlement, the billing quota and the network
        path in a single check, so &ldquo;the AI is not working&rdquo; resolves to one specific cause.
        No assignment content and no student information is sent.
      </p>

      <button
        type="button"
        onClick={runCheck}
        disabled={busy}
        style={{ minHeight: 44, padding: '10px 18px', border: 0, borderRadius: 9, background: busy ? '#9aa0a6' : '#1a73e8', color: '#fff', fontWeight: 900, fontSize: 14.5, cursor: busy ? 'progress' : 'pointer' }}
      >
        {busy ? 'Checking the AI provider…' : 'Run AI connection check'}
      </button>

      {error && (
        <div style={{ marginTop: 14, padding: '12px 14px', border: '1px solid #f28b82', borderRadius: 9, background: '#fce8e6', color: '#a50e0e', fontSize: 13.5, lineHeight: 1.5 }}>
          <strong>The self-test could not run.</strong>
          <div style={{ marginTop: 5 }}>{error}</div>
          <div style={{ marginTop: 7, color: '#7a1c1c' }}>
            If this says the function was not found, deploy it:
            {' '}<code>firebase deploy --only functions:assignmentAiSelfTest --project mathmaster-aleks</code>
          </div>
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 14,
            padding: '13px 15px',
            border: `1px solid ${result.ok ? '#a8dab5' : '#f6c26b'}`,
            borderRadius: 9,
            background: result.ok ? '#e6f4ea' : '#fef7e0',
            color: result.ok ? '#137333' : '#7a4f00',
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          <strong>{result.ok ? 'The internal AI is reachable and working.' : 'The internal AI is not usable right now.'}</strong>
          <div style={{ marginTop: 5 }}>{result.message}</div>
          {remedy && <div style={{ marginTop: 8, fontWeight: 700 }}>{remedy}</div>}
        </div>
      )}

      {(diagnostics || result) && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, color: '#3c4043' }}>Diagnostics</h3>
          <div style={{ border: '1px solid #e8eaed', borderRadius: 9, padding: '4px 13px' }}>
            {[
              ['Configured model', result?.requestedModel],
              ['Model that answered', diagnostics?.servedModel],
              ['Provider response status', diagnostics?.responseStatus],
              ['Stopped early because', diagnostics?.incompleteReason],
              ['Provider error code', result?.code],
              ['HTTP status', result?.httpStatus],
              ['Round trip', diagnostics?.elapsedMs ? `${Math.round(diagnostics.elapsedMs / 1000)}s` : null],
              ['Reasoning tokens used', diagnostics?.reasoningTokens || null],
            ]
              .filter(([, value]) => value !== null && value !== undefined && value !== '')
              .map(([label, value]) => (
                <div key={label} style={rowStyle}>
                  <span style={{ minWidth: 190, color: '#5f6368' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: '#202124' }}>{String(value)}</span>
                </div>
              ))}
          </div>
          <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 12.5, lineHeight: 1.5 }}>
            Every teacher-facing AI failure is now recorded the same way, in Cloud Logging under
            {' '}<code>Integrated assignment AI failed</code> and in the <code>assignmentAiAudit</code> collection.
          </p>
        </div>
      )}
    </section>
  );
}
