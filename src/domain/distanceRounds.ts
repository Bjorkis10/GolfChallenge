import { getDistanceRoundsConfigKey } from './configKey';
import {
  MAX_PRESET_DISTANCES_COUNT,
  validateChallengeDistancesList,
} from './matSettings';
import {
  CompletedDistanceRoundsRecord,
  DistanceRoundsAttempt,
  DistanceRoundsConfig,
  DistanceRoundsDistanceStat,
  DistanceRoundsSessionState,
  DistanceRoundsSummary,
  MissBreakdown,
  MissDetails,
  POINTS_PER_MADE_PUTT,
  PuttOutcome,
  PuttsPerDistanceOption,
  RoundsOption,
  VALID_PUTTS_PER_DISTANCE,
  VALID_ROUNDS_OPTIONS,
} from './types';

export interface DistanceRoundsSetupInput {
  readonly distancesMetres: readonly number[];
  readonly puttsPerDistance: number;
  readonly rounds: number;
}

export interface DistanceRoundsSetupValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly config?: DistanceRoundsConfig;
}

export interface DistanceRoundsTargetStep {
  readonly isComplete: boolean;
  readonly attemptNumber: number; // 1-based next attempt (or totalAttempts if complete)
  readonly completedAttemptsCount: number;
  readonly totalAttempts: number;
  readonly roundNumber: number; // 1-based
  readonly totalRounds: number;
  readonly distanceIndex: number; // 0-based
  readonly distanceMetres: number;
  readonly puttInSetNumber: number; // 1-based within current distance set
  readonly puttsPerDistance: number;
}

function isPuttsPerDistanceOption(value: number): value is PuttsPerDistanceOption {
  return (VALID_PUTTS_PER_DISTANCE as readonly number[]).includes(value);
}

function isRoundsOption(value: number): value is RoundsOption {
  return (VALID_ROUNDS_OPTIONS as readonly number[]).includes(value);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Validates Distance Rounds setup parameters against `maxUsableDistanceMetres` (<= 3.0m).
 */
export function validateDistanceRoundsSetup(
  input: DistanceRoundsSetupInput,
  maxUsableDistanceMetres: number
): DistanceRoundsSetupValidationResult {
  const errors: string[] = [];

  const distancesCheck = validateChallengeDistancesList(
    input.distancesMetres,
    maxUsableDistanceMetres,
    1,
    MAX_PRESET_DISTANCES_COUNT
  );

  if (!distancesCheck.valid) {
    errors.push(...distancesCheck.errors);
  }

  if (!isPuttsPerDistanceOption(input.puttsPerDistance)) {
    errors.push(
      `Putts per distance must be one of ${VALID_PUTTS_PER_DISTANCE.join(', ')}.`
    );
  }

  if (!isRoundsOption(input.rounds)) {
    errors.push(`Number of rounds must be one of ${VALID_ROUNDS_OPTIONS.join(', ')}.`);
  }

  if (
    errors.length > 0 ||
    !isPuttsPerDistanceOption(input.puttsPerDistance) ||
    !isRoundsOption(input.rounds)
  ) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: [],
    config: {
      mode: 'distance_rounds',
      unit: 'm',
      distancesMetres: distancesCheck.normalizedDistances,
      puttsPerDistance: input.puttsPerDistance,
      rounds: input.rounds,
      pointsPerMake: POINTS_PER_MADE_PUTT,
    },
  };
}

/**
 * Total number of putts in a Distance Rounds session.
 */
export function getTotalPlannedAttempts(config: DistanceRoundsConfig): number {
  return (
    config.distancesMetres.length * config.puttsPerDistance * config.rounds
  );
}

/**
 * Generates a unique session identifier without external dependencies.
 */
export function generateSessionId(now: Date = new Date()): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `dr_${now.getTime()}_${randomSuffix}`;
}

/**
 * Starts a new in-progress Distance Rounds session.
 */
export function createDistanceRoundsSession(
  config: DistanceRoundsConfig,
  options?: { sessionId?: string; startedAt?: string }
): DistanceRoundsSessionState {
  const startedAt = options?.startedAt ?? new Date().toISOString();
  const sessionId = options?.sessionId ?? generateSessionId(new Date(startedAt));

  return {
    sessionId,
    mode: 'distance_rounds',
    status: 'in_progress',
    startedAt,
    completedAt: null,
    config,
    configKey: getDistanceRoundsConfigKey(config),
    attempts: [],
  };
}

/**
 * Computes which round, distance, and putt-in-set corresponds to a 0-based attempt index.
 */
export function getAttemptCoordinates(
  config: DistanceRoundsConfig,
  attemptIndexZeroBased: number
): {
  roundNumber: number;
  distanceIndex: number;
  distanceMetres: number;
  puttInSetNumber: number;
} {
  const puttsPerRound = config.distancesMetres.length * config.puttsPerDistance;
  const roundIndex = Math.floor(attemptIndexZeroBased / puttsPerRound);
  const indexWithinRound = attemptIndexZeroBased % puttsPerRound;
  const distanceIndex = Math.floor(indexWithinRound / config.puttsPerDistance);
  const puttInSetIndex = indexWithinRound % config.puttsPerDistance;

  return {
    roundNumber: roundIndex + 1,
    distanceIndex,
    distanceMetres: config.distancesMetres[distanceIndex],
    puttInSetNumber: puttInSetIndex + 1,
  };
}

/**
 * Returns the current target step for an active or completed Distance Rounds session.
 */
export function getCurrentTargetStep(
  session: DistanceRoundsSessionState
): DistanceRoundsTargetStep {
  const totalAttempts = getTotalPlannedAttempts(session.config);
  const completedCount = session.attempts.length;

  if (session.status === 'completed' || completedCount >= totalAttempts) {
    const lastIndex = Math.max(0, totalAttempts - 1);
    const coords = getAttemptCoordinates(session.config, lastIndex);
    return {
      isComplete: true,
      attemptNumber: totalAttempts,
      completedAttemptsCount: completedCount,
      totalAttempts,
      roundNumber: coords.roundNumber,
      totalRounds: session.config.rounds,
      distanceIndex: coords.distanceIndex,
      distanceMetres: coords.distanceMetres,
      puttInSetNumber: coords.puttInSetNumber,
      puttsPerDistance: session.config.puttsPerDistance,
    };
  }

  const coords = getAttemptCoordinates(session.config, completedCount);
  return {
    isComplete: false,
    attemptNumber: completedCount + 1,
    completedAttemptsCount: completedCount,
    totalAttempts,
    roundNumber: coords.roundNumber,
    totalRounds: session.config.rounds,
    distanceIndex: coords.distanceIndex,
    distanceMetres: coords.distanceMetres,
    puttInSetNumber: coords.puttInSetNumber,
    puttsPerDistance: session.config.puttsPerDistance,
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
 * Logs a putt outcome ('made' | 'missed') for the current step.
 * Includes duplicate-submission protection: if the session is already completed, returns unchanged.
 */
export function recordDistanceRoundsPutt(
  session: DistanceRoundsSessionState,
  outcome: PuttOutcome,
  options?: { missDetails?: MissDetails; recordedAt?: string }
): DistanceRoundsSessionState {
  const totalAttempts = getTotalPlannedAttempts(session.config);

  // Duplicate-submission protection
  if (session.status === 'completed' || session.attempts.length >= totalAttempts) {
    return session;
  }

  const recordedAt = options?.recordedAt ?? new Date().toISOString();
  const attemptIndex = session.attempts.length;
  const coords = getAttemptCoordinates(session.config, attemptIndex);
  const cleanMissDetails =
    outcome === 'missed' ? sanitizeMissDetails(options?.missDetails) : undefined;

  const nextAttempt: DistanceRoundsAttempt = {
    attemptNumber: attemptIndex + 1,
    roundNumber: coords.roundNumber,
    distanceIndex: coords.distanceIndex,
    puttInSetNumber: coords.puttInSetNumber,
    distanceMetres: coords.distanceMetres,
    outcome,
    ...(cleanMissDetails ? { missDetails: cleanMissDetails } : {}),
    recordedAt,
  };

  const nextAttempts = [...session.attempts, nextAttempt];
  const isNowComplete = nextAttempts.length === totalAttempts;

  return {
    ...session,
    status: isNowComplete ? 'completed' : 'in_progress',
    completedAt: isNowComplete ? recordedAt : null,
    attempts: nextAttempts,
  };
}

/**
 * Non-blocking optional miss detail update for the most recently logged putt.
 * Only applies if the last recorded putt was a miss.
 */
export function updateLastMissedPuttDetails(
  session: DistanceRoundsSessionState,
  missDetails: MissDetails | undefined
): DistanceRoundsSessionState {
  if (session.attempts.length === 0) {
    return session;
  }

  const lastIndex = session.attempts.length - 1;
  const lastAttempt = session.attempts[lastIndex];
  if (lastAttempt.outcome !== 'missed') {
    return session;
  }

  const cleanDetails = sanitizeMissDetails(missDetails);
  const updatedAttempt: DistanceRoundsAttempt = {
    attemptNumber: lastAttempt.attemptNumber,
    roundNumber: lastAttempt.roundNumber,
    distanceIndex: lastAttempt.distanceIndex,
    puttInSetNumber: lastAttempt.puttInSetNumber,
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
 * Undoes the most recent putt.
 * If called immediately after the final putt (when `status === 'completed'`),
 * reopens the session (`status: 'in_progress'`, `completedAt: null`).
 */
export function undoLastDistanceRoundsPutt(
  session: DistanceRoundsSessionState
): DistanceRoundsSessionState {
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
 * Computes live or final summary statistics for a Distance Rounds session.
 */
export function calculateDistanceRoundsSummary(
  session: Pick<DistanceRoundsSessionState, 'config' | 'attempts'>
): DistanceRoundsSummary {
  const maxPossiblePoints =
    getTotalPlannedAttempts(session.config) * session.config.pointsPerMake;

  const byDistance: DistanceRoundsDistanceStat[] =
    session.config.distancesMetres.map((distanceMetres, distanceIndex) => {
      const matching = session.attempts.filter(
        (attempt) => attempt.distanceIndex === distanceIndex
      );
      const makes = matching.filter((attempt) => attempt.outcome === 'made').length;
      const attempts = matching.length;
      const makePercentage =
        attempts > 0 ? roundToOneDecimal((makes / attempts) * 100) : 0;
      const points = makes * session.config.pointsPerMake;

      return {
        distanceMetres,
        makes,
        attempts,
        makePercentage,
        points,
      };
    });

  const totalMakes = session.attempts.filter((a) => a.outcome === 'made').length;
  const totalAttempts = session.attempts.length;
  const totalPoints = totalMakes * session.config.pointsPerMake;
  const overallMakePercentage =
    totalAttempts > 0 ? roundToOneDecimal((totalMakes / totalAttempts) * 100) : 0;

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
    totalPoints,
    maxPossiblePoints,
    totalMakes,
    totalAttempts,
    overallMakePercentage,
    byDistance,
    missBreakdown,
  };
}

/**
 * Builds a CompletedDistanceRoundsRecord from a completed session state.
 */
export function buildCompletedDistanceRoundsRecord(
  session: DistanceRoundsSessionState
): CompletedDistanceRoundsRecord {
  const completedAt = session.completedAt ?? new Date().toISOString();
  return {
    sessionId: session.sessionId,
    mode: 'distance_rounds',
    configKey: session.configKey,
    config: session.config,
    startedAt: session.startedAt,
    completedAt,
    attempts: session.attempts,
    summary: calculateDistanceRoundsSummary(session),
  };
}
