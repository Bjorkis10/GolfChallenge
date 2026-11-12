import {
  CompletedDistanceRoundsRecord,
  CompletedPaceControlRecord,
  CompletedPuttingLadderRecord,
  CompletedSessionRecord,
} from './types';

export type PersonalBestStatus =
  | 'first_for_config'
  | 'new_personal_best'
  | 'tied_personal_best'
  | 'below_personal_best';

export interface PersonalBestEvaluation {
  readonly configKey: string;
  readonly status: PersonalBestStatus;
  readonly isPersonalBest: boolean;
  readonly bestRecord: CompletedSessionRecord;
  readonly previousBestRecord: CompletedSessionRecord | null;
  readonly pointsDeltaFromPreviousBest: number | null;
  readonly matchingSessionCount: number;
}

/**
 * Compares two completed Distance Rounds records with the same configKey.
 * Returns > 0 if `a` scored higher than `b`, < 0 if lower, 0 if tied.
 */
export function compareDistanceRoundsScores(
  a: CompletedDistanceRoundsRecord,
  b: CompletedDistanceRoundsRecord
): number {
  if (a.summary.totalPoints !== b.summary.totalPoints) {
    return a.summary.totalPoints - b.summary.totalPoints;
  }
  return a.summary.totalMakes - b.summary.totalMakes;
}

/**
 * Compares two completed Putting Ladder records with the same configKey.
 * Ranked by:
 * 1) `cleared` status (`true` > `false`)
 * 2) `rungsCompleted` (higher > lower)
 * 3) Efficiency: fewer `attemptsUsed` / more `attemptsRemaining`
 */
export function comparePuttingLadderScores(
  a: CompletedPuttingLadderRecord,
  b: CompletedPuttingLadderRecord
): number {
  if (a.summary.cleared !== b.summary.cleared) {
    return a.summary.cleared ? 1 : -1;
  }
  if (a.summary.rungsCompleted !== b.summary.rungsCompleted) {
    return a.summary.rungsCompleted - b.summary.rungsCompleted;
  }
  if (a.summary.attemptsRemaining !== b.summary.attemptsRemaining) {
    return a.summary.attemptsRemaining - b.summary.attemptsRemaining;
  }
  return b.summary.attemptsUsed - a.summary.attemptsUsed;
}

/**
 * Compares two completed Pace Control records with the same configKey.
 * Ranked by total In Zone points (higher is better). Equal points imply equal
 * Short + Long totals, so ties are genuine ties.
 */
export function comparePaceControlScores(
  a: CompletedPaceControlRecord,
  b: CompletedPaceControlRecord
): number {
  return a.summary.totalPoints - b.summary.totalPoints;
}

/**
 * Compares two completed session records of the same mode and configKey.
 * Returns > 0 if `a` is better than `b`, < 0 if worse, 0 if tied.
 */
export function compareComparableSessionScores(
  a: CompletedSessionRecord,
  b: CompletedSessionRecord
): number {
  if (a.mode === 'distance_rounds' && b.mode === 'distance_rounds') {
    return compareDistanceRoundsScores(a, b);
  }
  if (a.mode === 'putting_ladder' && b.mode === 'putting_ladder') {
    return comparePuttingLadderScores(a, b);
  }
  if (a.mode === 'pace_control' && b.mode === 'pace_control') {
    return comparePaceControlScores(a, b);
  }
  return 0;
}

/**
 * Finds the personal best record for a specific canonical `configKey`.
 * If two sessions are tied on score, the earliest completed record is retained as the benchmark holder.
 */
export function getPersonalBestForConfigKey(
  history: readonly CompletedSessionRecord[],
  configKey: string
): CompletedSessionRecord | null {
  const matching = history.filter((record) => record.configKey === configKey);
  if (matching.length === 0) {
    return null;
  }

  let best = matching[0];
  for (let i = 1; i < matching.length; i += 1) {
    const candidate = matching[i];
    const diff = compareComparableSessionScores(candidate, best);
    if (diff > 0) {
      best = candidate;
    } else if (diff === 0 && candidate.completedAt < best.completedAt) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Returns a map from `configKey` to its best `CompletedSessionRecord` across all history.
 */
export function getAllPersonalBestsByConfigKey(
  history: readonly CompletedSessionRecord[]
): ReadonlyMap<string, CompletedSessionRecord> {
  const uniqueKeys = new Set(history.map((item) => item.configKey));
  const map = new Map<string, CompletedSessionRecord>();
  for (const key of uniqueKeys) {
    const best = getPersonalBestForConfigKey(history, key);
    if (best) {
      map.set(key, best);
    }
  }
  return map;
}

/**
 * Evaluates how a completed session compares against all other sessions with the exact same `configKey`.
 */
export function evaluatePersonalBestForSession(
  history: readonly CompletedSessionRecord[],
  currentRecord: CompletedSessionRecord
): PersonalBestEvaluation {
  const otherMatching = history.filter(
    (record) =>
      record.configKey === currentRecord.configKey &&
      record.sessionId !== currentRecord.sessionId
  );

  const combinedMatching = [...otherMatching, currentRecord];
  const previousBestRecord = getPersonalBestForConfigKey(
    otherMatching,
    currentRecord.configKey
  );
  const bestRecord =
    getPersonalBestForConfigKey(combinedMatching, currentRecord.configKey) ??
    currentRecord;

  if (!previousBestRecord) {
    return {
      configKey: currentRecord.configKey,
      status: 'first_for_config',
      isPersonalBest: true,
      bestRecord: currentRecord,
      previousBestRecord: null,
      pointsDeltaFromPreviousBest: null,
      matchingSessionCount: combinedMatching.length,
    };
  }

  const diff = compareComparableSessionScores(currentRecord, previousBestRecord);
  const delta =
    (currentRecord.mode === 'distance_rounds' &&
      previousBestRecord.mode === 'distance_rounds') ||
    (currentRecord.mode === 'pace_control' &&
      previousBestRecord.mode === 'pace_control')
      ? currentRecord.summary.totalPoints - previousBestRecord.summary.totalPoints
      : null;

  if (diff > 0) {
    return {
      configKey: currentRecord.configKey,
      status: 'new_personal_best',
      isPersonalBest: true,
      bestRecord: currentRecord,
      previousBestRecord,
      pointsDeltaFromPreviousBest: delta,
      matchingSessionCount: combinedMatching.length,
    };
  }

  if (diff === 0) {
    return {
      configKey: currentRecord.configKey,
      status: 'tied_personal_best',
      isPersonalBest: true,
      bestRecord,
      previousBestRecord,
      pointsDeltaFromPreviousBest: delta !== null ? 0 : null,
      matchingSessionCount: combinedMatching.length,
    };
  }

  return {
    configKey: currentRecord.configKey,
    status: 'below_personal_best',
    isPersonalBest: false,
    bestRecord,
    previousBestRecord,
    pointsDeltaFromPreviousBest: delta,
    matchingSessionCount: combinedMatching.length,
  };
}

/**
 * Inserts or updates a completed session in history by `sessionId` so re-completing a session
 * after Undo updates the existing entry rather than creating duplicates.
 */
export function upsertCompletedSession(
  history: readonly CompletedSessionRecord[],
  record: CompletedSessionRecord
): CompletedSessionRecord[] {
  const existingIndex = history.findIndex((item) => item.sessionId === record.sessionId);
  if (existingIndex === -1) {
    return [record, ...history];
  }
  const updated = [...history];
  updated[existingIndex] = record;
  return updated;
}

/**
 * Removes a completed session record by `sessionId` (e.g., when Undo is triggered immediately
 * after the final putt to reopen the session).
 */
export function removeCompletedSessionById(
  history: readonly CompletedSessionRecord[],
  sessionId: string
): CompletedSessionRecord[] {
  return history.filter((item) => item.sessionId !== sessionId);
}
