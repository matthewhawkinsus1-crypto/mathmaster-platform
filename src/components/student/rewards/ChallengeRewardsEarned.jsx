import React from 'react';
import { REWARD_DEFINITIONS } from '../../../../functions/shared/rewardGrants.mjs';
import { grantDisplayName, grantReason, rewardsFromChallenge } from '../../../platform/rewards/rewardWallet.js';
import '../../rewards/rewards.css';

/*
 * "What did I EARN?" on a finished Live Challenge — separate from "how did I
 * PLAY?". Placement and game points are the match; this card is only the
 * rewards that reached the student's wallet, read from the wallet itself.
 *
 * Rewards are delivered just after the match ends, so for a moment there may
 * be nothing to show; the card says rewards appear as they arrive rather than
 * claiming the student earned nothing.
 */
export default function ChallengeRewardsEarned({ roomId, grants = [], transactions = [], onOpenRewards = null }) {
  const earned = rewardsFromChallenge({ roomId, grants, transactions });
  const hasAny = earned.items.length > 0 || earned.points > 0;
  return (
    <section aria-labelledby="challenge-rewards-heading" aria-live="polite" className={`rw-card rw-card--pass${hasAny ? ' rw-celebrate' : ''}`} style={{ marginTop: 16 }}>
      <h2 id="challenge-rewards-heading" style={{ fontSize: 18 }}>Rewards earned</h2>
      {!hasAny ? (
        <p className="rw-muted" style={{ marginTop: 6 }}>Rewards from this challenge show up here and in My Rewards as soon as they are added.</p>
      ) : (
        <ul className="rw-list">
          {earned.items.map((grant) => (
            <li key={grant.grantId} className="rw-row">
              <span className="rw-row__main">
                <span className="rw-row__title">{REWARD_DEFINITIONS[grant.rewardCode]?.icon} {grantDisplayName(grant)}</span>
                {grantReason(grant) && <span className="rw-muted" style={{ display: 'block' }}>{grantReason(grant)}</span>}
              </span>
              <span className="rw-chip rw-chip--ok">Added to My Rewards</span>
            </li>
          ))}
          {earned.points > 0 && (
            <li className="rw-row">
              <span className="rw-row__main">
                <span className="rw-row__title">⭐ +{earned.points} Class Points</span>
                {earned.pointReasons.length > 0 && <span className="rw-muted" style={{ display: 'block' }}>{earned.pointReasons.join(' · ')}</span>}
              </span>
              <span className="rw-chip rw-chip--ok">Added</span>
            </li>
          )}
        </ul>
      )}
      {onOpenRewards && hasAny && (
        <div className="rw-actions"><button type="button" className="rw-button rw-button--secondary" onClick={onOpenRewards}>Open My Rewards</button></div>
      )}
    </section>
  );
}
