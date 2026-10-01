import React, { useMemo, useState } from 'react';
import StudentGlobalNav, { STUDENT_DESTINATION } from '../StudentGlobalNav.jsx';
import ClassPointsWallet from '../ClassPointsWallet.jsx';
import ClassPointsCelebrations from '../ClassPointsCelebrations.jsx';
import UsePracticePassDialog from './UsePracticePassDialog.jsx';
import RewardHistory from './RewardHistory.jsx';
import { formatStudentName } from '../../../platform/studentName.js';
import {
  PRACTICE_PASS,
  describeExpiry,
  describeGrantSource,
  formatRewardDate,
  grantDisplayName,
  grantReason,
} from '../../../platform/rewards/rewardWallet.js';
import '../../rewards/rewards.css';

/*
 * MY REWARDS — ONE PLACE A STUDENT CAN ANSWER:
 *
 *   What do I have?           Practice Passes (×n), badges, Class Points
 *   What does each one do?    one plain sentence, from the shared catalog
 *   Can I use it now?         the button says so, or says why not
 *   What happened when I did? Practice excused for … (and History)
 *   What did I earn before?   History, loaded only when opened
 *
 * Presentational: the wallet arrives already built (rewardWallet.js), and the
 * one action — using a pass — goes through `onUsePracticePass`, which calls
 * the server. Nothing here counts down optimistically: every number comes from
 * the live listener, so a pass used in another tab disappears here too.
 */

function PracticePassCard({ wallet, newGrantIds, onOpen, unavailable, nowMs }) {
  const passes = wallet.practicePasses;
  const points = wallet.classPoints;
  const canUse = !unavailable && (passes.count > 0 || points.canBuyPass);
  const isNew = passes.grants.some((grant) => newGrantIds.has(grant.grantId));
  return (
    <section aria-labelledby="practice-pass-heading" className={`rw-card rw-card--pass${isNew ? ' rw-celebrate' : ''}`}>
      <div className="rw-reward-head">
        <span className="rw-reward-icon" aria-hidden="true">{PRACTICE_PASS.icon}</span>
        <div style={{ minWidth: 0 }}>
          <h2 id="practice-pass-heading">
            Practice Pass {isNew && <span className="rw-chip rw-chip--new">New</span>}
          </h2>
          <div className="rw-count" aria-label={`${passes.count} available`}>
            {passes.count}<small>available</small>
          </div>
        </div>
      </div>
      <p className="rw-text">{PRACTICE_PASS.studentDescription}</p>
      {passes.count > 0 && passes.nextExpiry && (
        <p className={passes.expiringSoonCount ? 'rw-chip rw-chip--warn' : 'rw-muted'} style={{ marginTop: 8 }}>
          {passes.expiringSoonCount
            ? `⏳ ${passes.expiringSoonCount} expire${passes.expiringSoonCount === 1 ? 's' : ''} ${describeExpiry(passes.nextExpiry, nowMs)} — use it or lose it`
            : `Next one expires ${describeExpiry(passes.nextExpiry, nowMs)}`}
        </p>
      )}
      {passes.count === 0 && (
        <p className="rw-muted" style={{ marginTop: 8 }}>
          {points.canBuyPass
            ? 'You have no passes, but you can trade 100 Class Points for one.'
            : `Earn one in a Live Challenge or from your teacher — or save up 100 Class Points (${points.pointsNeeded} more to go).`}
        </p>
      )}
      <div className="rw-actions">
        <button type="button" className="rw-button" disabled={!canUse} onClick={onOpen}>
          {passes.count > 0 ? 'Use a Practice Pass' : 'Trade 100 points for a pass'}
        </button>
      </div>
      {passes.count > 0 && (
        <details className="rw-disclosure">
          <summary>Where my passes came from</summary>
          <ul className="rw-list">
            {passes.grants.map((grant) => (
              <li key={grant.grantId} className="rw-row">
                <span className="rw-row__main">
                  <span className="rw-row__title">{describeGrantSource(grant)}</span>
                  {grantReason(grant) && <span className="rw-muted"> — {grantReason(grant)}</span>}
                  <span className="rw-muted" style={{ display: 'block' }}>
                    {formatRewardDate(grant.awardedAt, nowMs)}
                    {grant.expiresAt ? ` · expires ${describeExpiry(grant.expiresAt, nowMs)}` : ' · never expires'}
                  </span>
                </span>
                {newGrantIds.has(grant.grantId) && <span className="rw-chip rw-chip--new">New</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="rw-muted" style={{ marginTop: 10 }}>{PRACTICE_PASS.studentHowToUse}</p>
    </section>
  );
}

export default function StudentRewardsCenter({
  student = {},
  wallet,
  classPoints = null,
  inventoryUnavailable = false,
  redemptions = [],
  eligibleAssignments = [],
  onUsePracticePass,
  loadHistory,
  newGrantIds = new Set(),
  supportPresentation = {},
  onNavigate = null,
  onLogout = null,
  nowMs = Date.now(),
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const newIds = useMemo(() => (newGrantIds instanceof Set ? newGrantIds : new Set(newGrantIds || [])), [newGrantIds]);

  return (
    <div
      className={`rw-page ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{ fontSize: supportPresentation.largeText ? '120%' : undefined }}
    >
      <div className="rw-page__inner">
        <header className="rw-header">
          <div style={{ textAlign: 'left' }}>
            <h1>My Rewards</h1>
            <p>{formatStudentName(student, { lastFirst: false })}{student.classPeriod ? ` · ${student.classPeriod}` : ''}</p>
          </div>
          <StudentGlobalNav current={STUDENT_DESTINATION.REWARDS} onNavigate={onNavigate} onLogout={onLogout} dense />
        </header>

        {inventoryUnavailable && (
          <p className="rw-feedback rw-feedback--info" role="status">
            Your rewards could not load right now. Nothing is lost — check again in a minute.
          </p>
        )}

        <div className="rw-grid rw-grid--two">
          <PracticePassCard
            wallet={wallet}
            newGrantIds={newIds}
            onOpen={() => setDialogOpen(true)}
            unavailable={inventoryUnavailable}
            nowMs={nowMs}
          />
          <ClassPointsWallet
            account={classPoints?.account}
            transactions={classPoints?.transactions || []}
            unavailable={Boolean(classPoints?.unavailable)}
          />
        </div>

        {wallet.badges.length > 0 && (
          <section aria-labelledby="badges-heading" className="rw-card">
            <h2 id="badges-heading">🏅 Badges</h2>
            <ul className="rw-list">
              {wallet.badges.map((grant) => (
                <li key={grant.grantId} className={`rw-row${newIds.has(grant.grantId) ? ' rw-celebrate' : ''}`}>
                  <span className="rw-row__main">
                    <span className="rw-row__title">{grantDisplayName(grant)}</span>
                    <span className="rw-muted" style={{ display: 'block' }}>
                      {[describeGrantSource(grant), grantReason(grant), formatRewardDate(grant.awardedAt, nowMs)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {newIds.has(grant.grantId) ? <span className="rw-chip rw-chip--new">New</span> : <span className="rw-chip rw-chip--ok">Earned</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {wallet.excusedAssignments.length > 0 && (
          <section aria-labelledby="excused-heading" className="rw-card">
            <h2 id="excused-heading">Practice excused</h2>
            <p className="rw-muted">These assignments have Practice marked Excused because you used a Practice Pass.</p>
            <ul className="rw-list">
              {wallet.excusedAssignments.map((redemption) => (
                <li key={redemption.redemptionId} className="rw-row">
                  <span className="rw-row__main">
                    <span className="rw-row__title">{redemption.assignmentTitle || 'Assignment'}</span>
                    <span className="rw-muted" style={{ display: 'block' }}>
                      Used {formatRewardDate(redemption.redeemedAt, nowMs)} · {redemption.paidWith === 'pass' ? 'with a Practice Pass' : 'with 100 Class Points'}
                    </span>
                  </span>
                  <span className="rw-chip rw-chip--pass">✓ Excused</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <RewardHistory loadHistory={loadHistory} redemptions={redemptions} nowMs={nowMs} />

        {classPoints && <ClassPointsCelebrations announcements={classPoints.announcements} />}
      </div>

      {dialogOpen && (
        <UsePracticePassDialog
          wallet={wallet}
          eligibleAssignments={eligibleAssignments}
          onUse={onUsePracticePass}
          onClose={() => setDialogOpen(false)}
          nowMs={nowMs}
        />
      )}
    </div>
  );
}
