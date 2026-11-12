import { formatMetres } from './matSettings';
import { getAllPersonalBestsByConfigKey } from './personalBests';
import { CompletedSessionRecord, GameMode } from './types';

export type HistoryFilter = 'all' | GameMode;

export const GAME_MODE_LABELS: Readonly<Record<GameMode, string>> = {
  distance_rounds: 'Distance Rounds',
  putting_ladder: 'Putting Ladder',
  pace_control: 'Pace Control',
};

export function filterHistoryByMode(
  history: readonly CompletedSessionRecord[],
  filter: HistoryFilter
): CompletedSessionRecord[] {
  return history.filter((item) => filter === 'all' || item.mode === filter);
}

export function sortNewestFirst(
  history: readonly CompletedSessionRecord[]
): CompletedSessionRecord[] {
  return [...history].sort((a, b) =>
    a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0
  );
}

export function describeRecordConfig(record: CompletedSessionRecord): string {
  switch (record.mode) {
    case 'distance_rounds':
      return `${record.config.distancesMetres.map(formatMetres).join(', ')} · ${record.config.puttsPerDistance} putts each · ${record.config.rounds} round${record.config.rounds === 1 ? '' : 's'}`;
    case 'putting_ladder':
      return `${record.config.distancesMetres.map(formatMetres).join(' → ')} · ${record.config.attemptBudget} putt budget`;
    case 'pace_control':
      return `${record.config.targetDistancesMetres.map(formatMetres).join(', ')} · ${formatMetres(record.config.zoneDepthMetres)} zone · ${record.config.puttsPerDistance} putts each`;
  }
}

export function describeRecordScore(record: CompletedSessionRecord): string {
  switch (record.mode) {
    case 'distance_rounds':
      return `${record.summary.totalPoints}/${record.summary.maxPossiblePoints} pts (${record.summary.overallMakePercentage}% made)`;
    case 'putting_ladder':
      return record.summary.cleared
        ? `Cleared in ${record.summary.attemptsUsed}/${record.summary.attemptBudget} putts`
        : `${record.summary.rungsCompleted}/${record.summary.totalRungs} rungs, ${record.summary.attemptsUsed}/${record.summary.attemptBudget} putts`;
    case 'pace_control':
      return `${record.summary.totalPoints}/${record.summary.maxPossiblePoints} in zone (${record.summary.percentages.inZone}%)`;
  }
}

export interface PersonalBestGroup {
  readonly configKey: string;
  readonly mode: GameMode;
  readonly best: CompletedSessionRecord;
  readonly sessionCount: number;
}

/**
 * Personal bests grouped by comparable configKey (derived on demand from history, so deleting
 * a session recalculates automatically). Ordered by game mode, then most recent best first.
 */
export function buildPersonalBestGroups(
  history: readonly CompletedSessionRecord[]
): PersonalBestGroup[] {
  const bests = getAllPersonalBestsByConfigKey(history);
  const groups: PersonalBestGroup[] = [];
  for (const [configKey, best] of bests) {
    groups.push({
      configKey,
      mode: best.mode,
      best,
      sessionCount: history.filter((item) => item.configKey === configKey).length,
    });
  }
  const modeOrder: GameMode[] = ['distance_rounds', 'putting_ladder', 'pace_control'];
  return groups.sort((a, b) =>
    a.mode !== b.mode
      ? modeOrder.indexOf(a.mode) - modeOrder.indexOf(b.mode)
      : a.best.completedAt < b.best.completedAt
        ? 1
        : -1
  );
}

/** Set of sessionIds that currently hold the personal best for their configKey. */
export function getPersonalBestSessionIds(
  history: readonly CompletedSessionRecord[]
): ReadonlySet<string> {
  return new Set(Array.from(getAllPersonalBestsByConfigKey(history).values(), (r) => r.sessionId));
}
