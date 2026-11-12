import { getPuttingLadderConfigKey } from './configKey';
import {
  MAX_PRESET_DISTANCES_COUNT,
  validateChallengeDistancesList,
} from './matSettings';
import {
  AttemptBudgetOption,
  CompletedPuttingLadderRecord,
  MissBreakdown,
  MissDetails,
  PuttOutcome,
  PuttingLadderAttempt,
  PuttingLadderCompletionReason,
  PuttingLadderConfig,
  PuttingLadderRungStat,
  PuttingLadderSessionState,
  PuttingLadderSummary,
  VALID_ATTEMPT_BUDGETS,
} from './types';

export const MIN_LADDER_DISTANCES_COUNT = 2;

export interface PuttingLadderSetupInput {
  readonly distancesMetres: readonly number[];
  readonly attemptBudget: number;
}

export interface PuttingLadderSetupValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly config?: PuttingLadderConfig;
}

export interface PuttingLadderTargetStep {
  readonly isComplete: boolean;
  readonly cleared: boolean;
  readonly attemptNumber: number; // 1-based next attempt (or attemptsUsed if complete)
  readonly attemptsUsed: number;
  readonly attemptBudget: number;
  readonly attemptsRemaining: number;
  readonly currentRungIndex: number; // 0-based
  readonly currentRungNumber: number; // 1-based
  readonly totalRungs: number;
  readonly rungsCompleted: number;
  readonly distanceMetres: number;
}

function isAttemptBudgetOption(value: number): value is AttemptBudgetOption {
  return (VALID_ATTEMPT_BUDGETS as readonly number[]).includes(value);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Validates Putting Ladder setup parameters against `maxUsableDistanceMetres` (<= 3.0m).
 * Requires at least 2 distances ordered shortest to longest.
 */
export function validatePuttingLadderSetup(
  input: PuttingLadderSetupInput,
  maxUsableDistanceMetres: number
): PuttingLadderSetupValidationResult {
  const errors: string[] = [];

  const distancesCheck = validateChallengeDistancesList(
    input.distancesMetres,
    maxUsableDistanceMetres,
    MIN_LADDER_DISTANCES_COUNT,
    MAX_PRESET_DISTANCES_COUNT
  );

  if (!distancesCheck.valid) {
    errors.push(...distancesCheck.errors);
  }

  if (!isAttemptBudgetOption(input.attemptBudget)) {
    errors.push(
      `Attempt budget must be one of ${VALID_ATTEMPT_BUDGETS.join(', ')}.`
    );
  }

  if (errors.length > 0 || !isAttemptBudgetOption(input.attemptBudget)) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: [],
    config: {
      mode: 'putting_ladder',
      unit: 'm',
      distancesMetres: distancesCheck.normalizedDistances,
      attemptBudget: input.attemptBudget,
    },
  };
}

/**
 * Generates a unique Putting Ladder session identifier without external dependencies.
 */
export function generateLadderSessionId(now: Date = new Date()): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `pl_${now.getTime()}_${randomSuffix}`;
}

/**
 * Starts a new in-progress Putting Ladder session.
 */
export function createPuttingLadderSession(
  config: PuttingLadderConfig,
  options?: { sessionId?: string; startedAt?: string }
): PuttingLadderSessionState {
  const startedAt = options?.startedAt ?? new Date().toISOString();
  const sessionId =
    options?.sessionId ?? generateLadderSessionId(new Date(startedAt));

  return {
    sessionId,
    mode: 'putting_ladder',
    status: 'in_progress',
    startedAt,
    completedAt: null,
    config,
    configKey: getPuttingLadderConfigKey(config),
    attempts: [],
  };
}

/**
 * Evaluates the ladder progression state after replaying the recorded attempts.
 */
export function evaluateLadderProgress(
  config: PuttingLadderConfig,
  attempts: readonly PuttingLadderAttempt[]
): {
  rungsCompleted: number;
  cleared: boolean;
  isBudgetExhausted: boolean;
  isComplete: boolean;
  currentRungIndex: number;
  farthestRungIndexReached: number;
} {
  const totalRungs = config.distancesMetres.length;
  let rungsCompleted = 0;
  let farthestRungIndexReached = 0;

  for (const attempt of attempts) {
    if (attempt.rungIndex > farthestRungIndexReached) {
      farthestRungIndexReached = attempt.rungIndex;
    }
    if (attempt.outcome === 'made' && rungsCompleted < totalRungs) {
      rungsCompleted += 1;
      if (rungsCompleted < totalRungs && rungsCompleted > farthestRungIndexReached) {
        farthestRungIndexReached = rungsCompleted;
      }
    }
  }

  const cleared = rungsCompleted >= totalRungs;
  const isBudgetExhausted = !cleared && attempts.length >= config.attemptBudget;
  const isComplete = cleared || isBudgetExhausted;
  const currentRungIndex = Math.min(rungsCompleted, totalRungs - 1);

  return {
    rungsCompleted,
    cleared,
    isBudgetExhausted,
    isComplete,
    currentRungIndex,
    farthestRungIndexReached,
  };
}

/**
 * Returns the current target step for an active or completed Putting Ladder session.
 */
export function getCurrentLadderTargetStep(
  session: PuttingLadderSessionState
): PuttingLadderTargetStep {
  const totalRungs = session.config.distancesMetres.length;
  const progress = evaluateLadderProgress(session.config, session.attempts);
  const attemptsUsed = session.attempts.length;
  const attemptsRemaining = Math.max(
    0,
    session.config.attemptBudget - attemptsUsed
  );
  const isComplete = session.status === 'completed' || progress.isComplete;

  return {
    isComplete,
    cleared: progress.cleared,
    attemptNumber: isComplete ? attemptsUsed : attemptsUsed + 1,
    attemptsUsed,
    attemptBudget: session.config.attemptBudget,
    attemptsRemaining,
    currentRungIndex: progress.currentRungIndex,
    currentRungNumber: progress.currentRungIndex + 1,
    totalRungs,
    rungsCompleted: progress.rungsCompleted,
    distanceMetres: session.config.distancesMetres[progress.currentRungIndex],
  };
}

function sanitizeMissDetails(details?: MissDetails): MissDetails | undefined {
  if (!details) {
    return undefined;
  }
  const hasDirection =
    details.direction === 'left' ||
    details.direction === 'center' ||
    details.direction === 'right';
  const hasDistance =
    details.distance === 'short' ||
    details.distance === 'good' ||
    details.distance === 'long';

  if (!hasDirection && !hasDistance) {
    return undefined;
  }

  return {
    ...(hasDirection ? { direction: details.direction } : {}),
    ...(hasDistance ? { distance: details.distance } : {}),
  };
}

/**
 * Logs a putt outcome ('made' | 'missed') at the current ladder rung.
 * - Advance 1 distance rung on Made; stay at current distance rung on Missed.
 * - Making a putt on the final configured distance immediately completes the ladder (`cleared: true`).
 * - Reaching `attemptBudget` without clearing the final distance completes the session (`cleared: false`).
 * - Includes duplicate-submission protection: if already completed, returns unchanged.
 */
export function recordPuttingLadderPutt(
  session: PuttingLadderSessionState,
  outcome: PuttOutcome,
  options?: { missDetails?: MissDetails; recordedAt?: string }
): PuttingLadderSessionState {
  const currentProgress = evaluateLadderProgress(
    session.config,
    session.attempts
  );

  // Duplicate-submission protection
  if (session.status === 'completed' || currentProgress.isComplete) {
    return session;
  }

  const recordedAt = options?.recordedAt ?? new Date().toISOString();
  const rungIndex = currentProgress.currentRungIndex;
  const distanceMetres = session.config.distancesMetres[rungIndex];
  const cleanMissDetails =
    outcome === 'missed' ? sanitizeMissDetails(options?.missDetails) : undefined;

  const nextAttempt: PuttingLadderAttempt = {
    attemptNumber: session.attempts.length + 1,
    rungIndex,
    distanceMetres,
    outcome,
    ...(cleanMissDetails ? { missDetails: cleanMissDetails } : {}),
    recordedAt,
  };

  const nextAttempts = [...session.attempts, nextAttempt];
  const nextProgress = evaluateLadderProgress(session.config, nextAttempts);

  return {
    ...session,
    status: nextProgress.isComplete ? 'completed' : 'in_progress',
    completedAt: nextProgress.isComplete ? recordedAt : null,
    attempts: nextAttempts,
  };
}

/**
 * Non-blocking optional miss detail update for the most recently logged putt.
 * Only applies if the last recorded putt was a miss.
 */
export function updateLastPuttingLadderMissedPuttDetails(
  session: PuttingLadderSessionState,
  missDetails: MissDetails | undefined
): PuttingLadderSessionState {
  if (session.attempts.length === 0) {
    return session;
  }

  const lastIndex = session.attempts.length - 1;
  const lastAttempt = session.attempts[lastIndex];
  if (lastAttempt.outcome !== 'missed') {
    return session;
  }

  const cleanDetails = sanitizeMissDetails(missDetails);
  const updatedAttempt: PuttingLadderAttempt = {
    attemptNumber: lastAttempt.attemptNumber,
    rungIndex: lastAttempt.rungIndex,
    distanceMetres: lastAttempt.distanceMetres,
    outcome: 'missed',
    ...(cleanDetails ? { missDetails: cleanDetails } : {}),
    recordedAt: lastAttempt.recordedAt,
  };

  const nextAttempts = [...session.attempts];
  nextAttempts[lastIndex] = updatedAttempt;

  return {
    ...session,
    attempts: nextAttempts,
  };
}

/**
 * Undoes the most recent putt in a Putting Ladder session.
 * If called immediately after the final putt (whether completed by clearing the final distance
 * or exhausting the attempt budget), reopens the session (`status: 'in_progress'`, `completedAt: null`).
 */
export function undoLastPuttingLadderPutt(
  session: PuttingLadderSessionState
): PuttingLadderSessionState {
  if (session.attempts.length === 0) {
    return session;
  }

  const nextAttempts = session.attempts.slice(0, -1);
  return {
    ...session,
    status: 'in_progress',
    completedAt: null,
    attempts: nextAttempts,
  };
}

/**
 * Computes live or final summary statistics for a Putting Ladder session.
 */
export function calculatePuttingLadderSummary(
  session: Pick<PuttingLadderSessionState, 'config' | 'attempts'>
): PuttingLadderSummary {
  const totalRungs = session.config.distancesMetres.length;
  const progress = evaluateLadderProgress(session.config, session.attempts);
  const attemptsUsed = session.attempts.length;
  const attemptBudget = session.config.attemptBudget;
  const attemptsRemaining = Math.max(0, attemptBudget - attemptsUsed);

  let completionReason: PuttingLadderCompletionReason = 'in_progress';
  if (progress.cleared) {
    completionReason = 'ladder_cleared';
  } else if (progress.isBudgetExhausted) {
    completionReason = 'budget_exhausted';
  }

  const highestDistanceClearedMetres =
    progress.rungsCompleted > 0
      ? session.config.distancesMetres[progress.rungsCompleted - 1]
      : null;

  const farthestDistanceReachedMetres =
    session.config.distancesMetres[progress.farthestRungIndexReached];

  const byRung: PuttingLadderRungStat[] = session.config.distancesMetres.map(
    (distanceMetres, rungIndex) => {
      const matching = session.attempts.filter(
        (attempt) => attempt.rungIndex === rungIndex
      );
      const makes = matching.filter((attempt) => attempt.outcome === 'made').length;
      const attempts = matching.length;
      const makePercentage =
        attempts > 0 ? roundToOneDecimal((makes / attempts) * 100) : 0;

      return {
        rungNumber: rungIndex + 1,
        distanceMetres,
        makes,
        attempts,
        makePercentage,
        cleared: rungIndex < progress.rungsCompleted,
      };
    }
  );

  const totalMakes = session.attempts.filter((a) => a.outcome === 'made').length;
  const overallMakePercentage =
    attemptsUsed > 0 ? roundToOneDecimal((totalMakes / attemptsUsed) * 100) : 0;

  const misses = session.attempts.filter((a) => a.outcome === 'missed');
  let dirLeft = 0;
  let dirCenter = 0;
  let dirRight = 0;
  let dirUntagged = 0;

  let distShort = 0;
  let distGood = 0;
  let distLong = 0;
  let distUntagged = 0;

  for (const miss of misses) {
    const dir = miss.missDetails?.direction;
    if (dir === 'left') dirLeft += 1;
    else if (dir === 'center') dirCenter += 1;
    else if (dir === 'right') dirRight += 1;
    else dirUntagged += 1;

    const dist = miss.missDetails?.distance;
    if (dist === 'short') distShort += 1;
    else if (dist === 'good') distGood += 1;
    else if (dist === 'long') distLong += 1;
    else distUntagged += 1;
  }

  const missBreakdown: MissBreakdown = {
    totalMisses: misses.length,
    directionCounts: {
      left: dirLeft,
      center: dirCenter,
      right: dirRight,
      untagged: dirUntagged,
    },
    distanceCounts: {
      short: distShort,
      good: distGood,
      long: distLong,
      untagged: distUntagged,
    },
  };

  return {
    cleared: progress.cleared,
    completionReason,
    rungsCompleted: progress.rungsCompleted,
    totalRungs,
    highestDistanceClearedMetres,
    farthestDistanceReachedMetres,
    attemptsUsed,
    attemptBudget,
    attemptsRemaining,
    totalMakes,
    overallMakePercentage,
    byRung,
    missBreakdown,
  };
}

/**
 * Builds a CompletedPuttingLadderRecord from a completed session state.
 */
export function buildCompletedPuttingLadderRecord(
  session: PuttingLadderSessionState
): CompletedPuttingLadderRecord {
  const completedAt = session.completedAt ?? new Date().toISOString();
  return {
    sessionId: session.sessionId,
    mode: 'putting_ladder',
    configKey: session.configKey,
    config: session.config,
    startedAt: session.startedAt,
    completedAt,
    attempts: session.attempts,
    summary: calculatePuttingLadderSummary(session),
  };
}
