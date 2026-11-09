import { LINE_DIFFICULTY_OPTIONS } from '../../../functions/shared/lineGraphConfig.mjs';
import { LINE_GRAPH_FORMAT, LINE_ITEM_TYPE, lineGraphFormatOfMode } from '../../../functions/shared/lineGraphRules.mjs';
import { rushPlayingCount, rushRaceRows } from '../../platform/liveChallenge/rushStandingsModel.js';
import { useChallengeClock } from '../../platform/liveChallenge/challengeHooks.js';
import { roundWaitingOnExtendedTime } from '../../platform/liveChallenge/liveChallengeProjectorModel.js';
import { ChallengeClockText, useLowTime } from './ChallengeShellParts.jsx';
import { GameReportTable } from './GameReportTable.jsx';

/*
 * GRAPH THE LINE ON THE TEACHER'S SCREENS.
 *
 * The host sees the race — how many lines each student has right this round,
 * and in a Classic or Sprint round who has finished — and, after the game,
 * the class's breakdown. Never an equation and never a line during a round:
 * the room's public card carries neither (each student may have their own),
 * and the projector is for the whole room. The race board is the rush's
 * (GraphFeatureRushHost.RushRaceBoard): the same public race fields.
 */

const FORMAT_WORDS = Object.freeze({
  [LINE_GRAPH_FORMAT.CLASSIC]: 'Classic',
  [LINE_GRAPH_FORMAT.SPRINT]: 'Sprint',
  [LINE_GRAPH_FORMAT.RUSH]: 'Rush',
});

// No-break spaces: a form is never split across two lines.
const SHORT_FORM = Object.freeze({
  slopeIntercept: 'y\u00a0=\u00a0mx\u00a0+\u00a0b',
  standard: 'Ax\u00a0+\u00a0By\u00a0=\u00a0C',
  pointSlope: 'point-slope',
});

const triesWords = (tries) => (Number(tries) === 0 ? 'tries until right' : `${tries} ${Number(tries) === 1 ? 'try' : 'tries'}`);

/** The settings a Graph the Line room runs with, in one line. */
export function lineSettingsLine(room = {}) {
  const config = room.lineGraph?.config || {};
  const format = lineGraphFormatOfMode(room.challengeMode);
  const itemTypes = Array.isArray(config.itemTypes) ? config.itemTypes : [];
  const doing = itemTypes.includes(LINE_ITEM_TYPE.GRAPH) && itemTypes.includes(LINE_ITEM_TYPE.NAME)
    ? `Graph it + Name it (${config.nameStyle === 'build' ? 'build' : 'choose'})`
    : itemTypes.includes(LINE_ITEM_TYPE.NAME) ? `Name it (${config.nameStyle === 'build' ? 'build' : 'choose'})` : 'Graph it';
  return [
    FORMAT_WORDS[format] || null,
    format === LINE_GRAPH_FORMAT.SPRINT && config.sprintLength ? `${config.sprintLength} lines` : null,
    `${room.roundCount || 1} round${Number(room.roundCount) === 1 ? '' : 's'}`,
    `${room.roundSeconds || 60}s each`,
    room.scoringStrategyId === 'grandPrix' ? 'Grand Prix' : 'Correct Count',
    // "Standard difficulty": next to "Ax + By = C", a bare "Standard" reads as the form.
    LINE_DIFFICULTY_OPTIONS.find((option) => option.id === config.difficulty)?.label?.concat(' difficulty') || null,
    doing,
    (Array.isArray(config.forms) ? config.forms : []).map((form) => SHORT_FORM[form] || form).join(', ') || null,
    config.specialLines ? 'x = h, y = k' : null,
    config.triesPerItem !== undefined ? triesWords(config.triesPerItem) : null,
    config.showMethod ? 'method required' : null,
  ].filter(Boolean).join(' · ');
}

const RUNNING_WORDS = Object.freeze({
  [LINE_GRAPH_FORMAT.CLASSIC]: 'Students are graphing this round\'s line.',
  [LINE_GRAPH_FORMAT.SPRINT]: 'Students are working through their set.',
  [LINE_GRAPH_FORMAT.RUSH]: 'Students are graphing as many lines as they can.',
});

/**
 * The teacher console's live panel for a Graph the Line round, on the room's
 * own clock (and the console's calibrated offset): the countdown, time left,
 * "Time!", and who is playing and finished.
 */
export function LineGraphHostStatus({ room, players = [], clockOffsetMs = 0, joinedCount = 0, finishedCount = 0, closing = false }) {
  const roundIndex = Number(room.currentRound) || 0;
  const closed = room.roundState === 'closed';
  const format = lineGraphFormatOfMode(room.challengeMode);
  const finishes = format !== LINE_GRAPH_FORMAT.RUSH;
  const clock = useChallengeClock(room, clockOffsetMs);
  const low = useLowTime(room, clockOffsetMs);
  const counting = clock.stage === 'countdown';
  const timeUp = clock.stage === 'roundLocked';
  const playing = rushPlayingCount(players, roundIndex);
  const right = rushRaceRows(players, roundIndex).reduce((sum, row) => sum + row.completed, 0);
  // Past the class's buzzer while students with extended time finish their
  // set (Classic, Sprint). The teacher's console alone says why, and the rule.
  const extraTime = roundWaitingOnExtendedTime({ room, locked: timeUp, joinedCount, answeredCount: finishedCount });
  let headline = RUNNING_WORDS[format] || RUNNING_WORDS[LINE_GRAPH_FORMAT.RUSH];
  if (closed) headline = `Round ${roundIndex + 1} results`;
  else if (counting) headline = 'Get ready — the round is about to start.';
  else if (extraTime) headline = 'Time is up, and the race is decided. Students with extra time are finishing their lines — those count for their practice, not the race.';
  else if (timeUp) headline = 'Time! Saving the last answers, then the results.';
  else if (finishes && joinedCount > 0 && finishedCount >= joinedCount) headline = 'Everyone has finished. Results are coming up.';
  return (
    <section data-mm-live-status={clock.stage} style={{ background: 'var(--mm-surface)', border: '2px solid #1a73e8', borderRadius: 14, padding: 20, textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ color: 'var(--mm-primary)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 1000, textTransform: 'uppercase' }}>Round {roundIndex + 1} of {room.roundCount} · Graph the Line</div>
          <div style={{ marginTop: 8, fontSize: 'calc(20 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-strong)' }}>{headline}</div>
          <div style={{ marginTop: 6, color: 'var(--mm-text-muted)' }}>{lineSettingsLine(room)}</div>
        </div>
        <div style={{ minWidth: 150, textAlign: 'center', padding: 12, borderRadius: 12, background: low || timeUp ? 'var(--mm-error-bg)' : 'var(--mm-info-bg)', color: low || timeUp ? 'var(--mm-error-text)' : 'var(--mm-info-text)' }}>
          <div style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 900, textTransform: 'uppercase' }}>{closed ? 'Round closed' : closing ? 'Closing…' : counting ? 'Starts in' : timeUp ? 'Time!' : 'Time left'}</div>
          <div style={{ fontSize: 'calc(38 * var(--mm-px))', fontWeight: 1000, fontVariantNumeric: 'tabular-nums' }}>{closed ? '—' : counting ? clock.countdownStep : <ChallengeClockText room={room} clockOffsetMs={clockOffsetMs} />}</div>
        </div>
      </div>
      {!closed && (
        <div style={{ marginTop: 14, fontWeight: 800, color: 'var(--mm-text-muted)' }}>
          {playing} of {joinedCount} playing{finishes ? ` · ${finishedCount} finished` : ''} · {right} line{right === 1 ? '' : 's'} right this round
        </div>
      )}
    </section>
  );
}

const pct = (value) => (value == null ? '—' : `${value}%`);
const results = (row) => `${row.completed}/${row.items} right · ${pct(row.accuracyPercent)} of checks right`;
const wrongLines = (row) => `${row.count} wrong line${row.count === 1 ? '' : 's'}`;
const TOTALS = { display: 'flex', gap: 18, flexWrap: 'wrap', margin: 0, padding: 0, listStyle: 'none', fontSize: 'calc(14 * var(--mm-px))', color: 'var(--mm-text)' };

/**
 * The after-game breakdown: by form, by item type, by difficulty, the mistakes, by student.
 *
 * Read by a screen reader as the rush report is (teacher features walk, item 11): the totals are
 * a list, and each breakdown a heading and a table named by it (GameReportTable), a row header for what
 * the row counts and column names for a screen reader only. The students, inside "By student", are
 * a list: a student's entry can carry a second line, the mistake they made most, which is no
 * column. What the teacher sees is unchanged.
 */
export function LineGraphReport({ report }) {
  const lines = report?.lineGraph;
  if (!lines) return null;
  const table = (rows, title, key, column) => (
    <GameReportTable data-mm-line-report={key} title={title} columns={[column, 'Results']} rows={rows} value={results} />
  );
  const students = Array.isArray(lines.players) ? lines.players.filter((player) => player.joined) : [];
  return (
    <section style={{ display: 'grid', gap: 14 }} data-mm-line-report="summary">
      <ul style={TOTALS}>
        <li><strong>{lines.itemsCompleted}</strong> of {lines.itemsAttempted} lines right</li>
        <li>Accuracy <strong>{pct(lines.accuracyPercent)}</strong> of checks</li>
        <li><strong>{lines.itemsEnded}</strong> shown or skipped</li>
      </ul>
      {lines.byForm?.length > 0 && table(lines.byForm, 'By form, hardest first', 'byForm', 'Form of equation')}
      {lines.byItemType?.length > 1 && table(lines.byItemType, 'Graph it and Name it', 'byItemType', 'What students do')}
      {lines.byTier?.length > 1 && table(lines.byTier, 'By difficulty', 'byTier', 'Difficulty')}
      {lines.mistakes?.length > 0 && (
        <GameReportTable
          data-mm-line-report="mistakes"
          title="The mistakes the class made, most first"
          columns={['Mistake', 'Wrong lines']}
          rows={lines.mistakes.slice(0, 8).map((row) => ({ ...row, key: row.code }))}
          value={wrongLines}
        >
          <p style={{ margin: '6px 0 0', fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>A mistake is named only when the line could have come from nothing else; the rest are described by what was true of the line.</p>
        </GameReportTable>
      )}
      {students.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 900 }}>By student (game names)</summary>
          {/* A student's name keeps the width of its longest word: with none, a long line of numbers on a phone
              took the whole row and ran over the name. */}
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
            {students.map((player) => (
              <li key={player.studentId || player.alias} style={{ display: 'grid', gridTemplateColumns: 'minmax(min-content, 1fr) auto', gap: 4, padding: '6px 0', borderBottom: '1px solid var(--mm-divider)', fontSize: 'calc(14 * var(--mm-px))' }}>
                <span style={{ fontWeight: 800 }}>{player.alias}</span>
                <span style={{ color: 'var(--mm-text-muted)' }}>
                  {player.itemsCompleted} right · {pct(player.accuracyPercent)}
                  {/* Lines finished in extended time, after the buzzer: theirs, never the race's. */}
                  {player.itemsCompletedInExtraTime > 0 ? ` · ${player.itemsCompletedInExtraTime} in extra time` : ''}
                </span>
                {player.topMistake && <span style={{ gridColumn: '1 / -1', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>Most often: {player.topMistake}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
