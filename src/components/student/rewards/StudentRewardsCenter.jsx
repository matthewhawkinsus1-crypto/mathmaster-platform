import React, { useMemo, useState } from 'react';
import StudentGlobalNav, { STUDENT_DESTINATION } from '../StudentGlobalNav.jsx';
import ClassPointsWallet from '../ClassPointsWallet.jsx';
import ClassPointsCelebrations from '../ClassPointsCelebrations.jsx';
import UsePracticePassDialog from './UsePracticePassDialog.jsx';
import RewardHistory from './RewardHistory.jsx';
import ClassRewardsShelf from './ClassRewardsShelf.jsx';
import { STUDENT_SELF_NEUTRAL_LABEL, formatStudentName } from '../../../platform/studentName.js';
import {
  PRACTICE_PASS,
  badgeView,
  describeExpiry,
  describeGrantSource,
  formatRewardDate,
  grantReason,
} from '../../../platform/rewards/rewardWallet.js';
import { useStudentClassRewards } from '../../../platform/rewards/useClassRewards.js';
import '../../rewards/rewards.css';

/*
 * MY REWARDS — ONE PLACE A STUDENT CAN ANSWER:
 *
 *   What do I have?           Practice Passes (×n), badges, Class Points
 *   What does each one do?    one plain sentence, from the shared catalog
 *   What else can I spend on? my teacher's class rewards (non-academic)
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
  // The teacher's class rewards: { catalog, requests, unavailable, redeem }.
  // When the caller does not pass them, this screen opens its own listeners
  // for the signed-in student's class — only for a real student (role,
  // id and class of record), never in a teacher's preview.
  classRewards = undefined,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const newIds = useMemo(() => (newGrantIds instanceof Set ? newGrantIds : new Set(newGrantIds || [])), [newGrantIds]);
  const ownClassRewards = useStudentClassRewards({
    studentId: student?.role === 'student' ? student.id : null,
    classId: student?.role === 'student' ? student.classId : null,
    enabled: classRewards === undefined,
  });
  const shelfData = classRewards === undefined ? ownClassRewards : (classRewards || {});
  const pointsKnown = Boolean(classPoints) && !classPoints.unavailable;

  return (
    <div
      className={`rw-page ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{ fontSize: supportPresentation.largeText ? '120%' : undefined }}
    >
      <div className="rw-page__inner">
        <header className="rw-header">
          <div style={{ textAlign: 'left' }}>
            <h1>My Rewards</h1>
            <p>{formatStudentName(student, { lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL })}{student.classPeriod ? ` · ${student.classPeriod}` : ''}</p>
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

        {/* Practice Pass stays first; the teacher's own rewards come next. */}
        <ClassRewardsShelf
          catalog={shelfData.catalog || null}
          requests={shelfData.requests || []}
          balance={pointsKnown ? Number(classPoints?.account?.balance) || 0 : 0}
          balanceKnown={pointsKnown}
          unavailable={Boolean(shelfData.unavailable)}
          onRedeem={shelfData.redeem}
          nowMs={nowMs}
        />

        {wallet.badges.length > 0 && (
          <section aria-labelledby="badges-heading" className="rw-card">
            <h2 id="badges-heading">🏅 Badges</h2>
            {/* Grouped by what they recognize, so growth, effort and mastery
                read as achievements in their own right, not only wins. */}
            {(wallet.badgeGroups || [{ group: 'all', heading: null, badges: wallet.badges }]).map((group) => (
              <div key={group.group} data-qa={`badge-group-${group.group}`}>
                {group.heading && <h3 style={{ marginTop: 12 }}>{group.heading}</h3>}
                <ul className="rw-list">
                  {group.badges.map((grant) => {
                    const view = badgeView(grant);
                    return (
                      <li key={grant.grantId} className={`rw-row${newIds.has(grant.grantId) ? ' rw-celebrate' : ''}`}>
                        <span className="rw-reward-icon" aria-hidden="true" style={{ fontSize: 24 }}>{view.icon}</span>
                        <span className="rw-row__main">
                          <span className="rw-row__title">{view.label}</span>
                          {view.description && <span className="rw-muted" style={{ display: 'block' }}>{view.description}</span>}
                          <span className="rw-muted" style={{ display: 'block' }}>
                            {[describeGrantSource(grant), grantReason(grant) !== view.label ? grantReason(grant) : null, formatRewardDate(grant.awardedAt, nowMs)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {newIds.has(grant.grantId) ? <span className="rw-chip rw-chip--new">New</span> : <span className="rw-chip rw-chip--ok">Earned</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
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
