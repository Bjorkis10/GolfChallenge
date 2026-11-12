import { calculateDistanceRoundsSummary } from './distanceRounds';
import { formatMetres } from './matSettings';
import { calculatePaceControlSummary } from './paceControl';
import { calculatePuttingLadderSummary } from './puttingLadder';
import { ActiveSessionState } from './types';

type AnyAttempt = ActiveSessionState['attempts'][number];

const OUTCOME_LABELS: Record<string, string> = {
  made: 'Made',
  missed: 'Missed',
  short: 'Short',
  in_zone: 'In zone',
  long: 'Long',
};

function describeCompletion(session: ActiveSessionState): string {
  if (session.mode === 'distance_rounds') {
    const s = calculateDistanceRoundsSummary(session);
    return `Session complete. ${s.totalPoints} of ${s.maxPossiblePoints} points.`;
  }
  if (session.mode === 'putting_ladder') {
    const s = calculatePuttingLadderSummary(session);
    return s.cleared
      ? `Ladder cleared in ${s.attemptsUsed} putts.`
      : `Ladder complete. ${s.rungsCompleted} of ${s.totalRungs} rungs cleared.`;
  }
  const s = calculatePaceControlSummary(session);
  return `Session complete. ${s.totalPoints} of ${s.maxPossiblePoints} putts in zone.`;
}

function describeAttempt(attempt: AnyAttempt): string {
  return `Putt ${attempt.attemptNumber} logged: ${OUTCOME_LABELS[attempt.outcome] ?? attempt.outcome} at ${formatMetres(attempt.distanceMetres)}.`;
}

/**
 * Pure helper: the screen-reader announcement for a change in the active session, or null when
 * nothing worth announcing changed.
 */
export function describeSessionChange(
  prev: ActiveSessionState | null,
  next: ActiveSessionState | null
): string | null {
  if (prev === next) return null;
  if (!prev && next) {
    return next.status === 'completed' ? null : 'Session started.';
  }
  if (prev && !next) return 'Session closed.';
  if (!prev || !next) return null;
  if (prev.sessionId !== next.sessionId) return 'New session started.';

  const before = prev.attempts.length;
  const after = next.attempts.length;
  if (after > before) {
    const last = next.attempts[after - 1];
    return `${describeAttempt(last)}${next.status === 'completed' ? ` ${describeCompletion(next)}` : ''}`;
  }
  if (after < before) {
    return `Putt ${before} undone.${prev.status === 'completed' ? ' Session reopened.' : ''}`;
  }
  const lastPrev = prev.attempts[before - 1];
  const lastNext = next.attempts[after - 1];
  if (lastPrev && lastNext && JSON.stringify(lastPrev) !== JSON.stringify(lastNext)) {
    return 'Miss details updated.';
  }
  return null;
}
