import { getPaceControlConfigKey } from './configKey';
import {
  MAX_PRESET_DISTANCES_COUNT,
  roundToTenthMetre,
  validateChallengeDistancesList,
} from './matSettings';
import {
  CompletedPaceControlRecord,
  PaceControlAttempt,
  PaceControlConfig,
  PaceControlDistanceStat,
  PaceControlSessionState,
  PaceControlSummary,
  PaceDispersion,
  PaceOutcome,
  POINTS_PER_IN_ZONE_PUTT,
  PuttsPerDistanceOption,
  VALID_PUTTS_PER_DISTANCE,
  VALID_ZONE_DEPTHS_METRES,
  ZoneDepthOption,
} from './types';

export interface PaceControlSetupInput {
  readonly targetDistancesMetres: readonly number[];
  readonly zoneDepthMetres: number;
  readonly puttsPerDistance: number;
}

export interface PaceControlSetupValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly config?: PaceControlConfig;
}

export interface PaceControlTargetStep {
  readonly isComplete: boolean;
  readonly attemptNumber: number; // 1-based next putt (or total if complete)
  readonly totalAttempts: number;
  readonly distanceIndex: number; // 0-based
  readonly distanceNumber: number; // 1-based
  readonly totalDistances: number;
  readonly puttInSetNumber: number; // 1-based
  readonly puttsPerDistance: number;
  readonly distanceMetres: number;
}

function isPuttsPerDistanceOption(value: number): value is PuttsPerDistanceOption {
  return (VALID_PUTTS_PER_DISTANCE as readonly number[]).includes(value);
}

function toZoneDepthOption(value: number): ZoneDepthOption | null {
  const rounded = roundToTenthMetre(value);
  if (!Number.isFinite(value) || Math.abs(value - rounded) > 1e-6) {
    return null;
  }
  return (
    VALID_ZONE_DEPTHS_METRES.find((depth) => depth === rounded) ?? null
  );
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getTotalPlannedPaceAttempts(
  config: Pick<PaceControlConfig, 'targetDistancesMetres' | 'puttsPerDistance'>
): number {
  return config.targetDistancesMetres.length * config.puttsPerDistance;
}

/**
 * Validates Pace Control setup: target distances (0.5m <= d <= maxUsableDistanceMetres <= 3.0m),
 * physical zone depth (0.2m–0.6m in 0.1m steps) and putts per distance (3 | 5 | 10).
 */
export function validatePaceControlSetup(
  input: PaceControlSetupInput,
  maxUsableDistanceMetres: number
): PaceControlSetupValidationResult {
  const errors: string[] = [];

  const distancesCheck = validateChallengeDistancesList(
    input.targetDistancesMetres,
    maxUsableDistanceMetres,
    1,
    MAX_PRESET_DISTANCES_COUNT
  );
  if (!distancesCheck.valid) {
    errors.push(...distancesCheck.errors);
  }

  const zoneDepth = toZoneDepthOption(input.zoneDepthMetres);
  if (zoneDepth === null) {
    errors.push(
      `Target zone depth must be one of ${VALID_ZONE_DEPTHS_METRES.map((d) => `${d.toFixed(1)}m`).join(', ')}.`
    );
  }

  if (!isPuttsPerDistanceOption(input.puttsPerDistance)) {
    errors.push(
      `Putts per distance must be one of ${VALID_PUTTS_PER_DISTANCE.join(', ')}.`
    );
  }

  if (
    errors.length > 0 ||
    zoneDepth === null ||
    !isPuttsPerDistanceOption(input.puttsPerDistance)
  ) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    config: {
      mode: 'pace_control',
      unit: 'm',
      targetDistancesMetres: distancesCheck.normalizedDistances,
      zoneDepthMetres: zoneDepth,
      puttsPerDistance: input.puttsPerDistance,
    },
  };
}

export function generatePaceSessionId(now: Date = new Date()): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `pc_${now.getTime()}_${randomSuffix}`;
}

export function createPaceControlSession(
  config: PaceControlConfig,
  options?: { sessionId?: string; startedAt?: string }
): PaceControlSessionState {
  const startedAt = options?.startedAt ?? new Date().toISOString();
  const sessionId =
    options?.sessionId ?? generatePaceSessionId(new Date(startedAt));

  return {
    sessionId,
    mode: 'pace_control',
    status: 'in_progress',
    startedAt,
    completedAt: null,
    config,
    configKey: getPaceControlConfigKey(config),
    attempts: [],
  };
}

/**
 * Returns the current target step. Putts progress distance by distance, in ascending order.
 */
export function getCurrentPaceTargetStep(
  session: Pick<PaceControlSessionState, 'config' | 'attempts' | 'status'>
): PaceControlTargetStep {
  const { config } = session;
  const totalAttempts = getTotalPlannedPaceAttempts(config);
  const attemptsLogged = session.attempts.length;
  const isComplete = session.status === 'completed' || attemptsLogged >= totalAttempts;
  const cursor = Math.min(attemptsLogged, totalAttempts - 1);
  const distanceIndex = Math.floor(cursor / config.puttsPerDistance);

  return {
    isComplete,
    attemptNumber: isComplete ? totalAttempts : attemptsLogged + 1,
    totalAttempts,
    distanceIndex,
    distanceNumber: distanceIndex + 1,
    totalDistances: config.targetDistancesMetres.length,
    puttInSetNumber: (cursor % config.puttsPerDistance) + 1,
    puttsPerDistance: config.puttsPerDistance,
    distanceMetres: config.targetDistancesMetres[distanceIndex],
  };
}

/**
 * Logs a Short / In Zone / Long result for the next putt.
 * Duplicate-submission protection: once all putts are logged the session is returned unchanged.
 */
export function recordPaceControlPutt(
  session: PaceControlSessionState,
  outcome: PaceOutcome,
  options?: { recordedAt?: string }
): PaceControlSessionState {
  const totalAttempts = getTotalPlannedPaceAttempts(session.config);
  if (
    session.status === 'completed' ||
    session.attempts.length >= totalAttempts
  ) {
    return session;
  }
  if (outcome !== 'short' && outcome !== 'in_zone' && outcome !== 'long') {
    return session;
  }

  const recordedAt = options?.recordedAt ?? new Date().toISOString();
  const step = getCurrentPaceTargetStep(session);
  const nextAttempt: PaceControlAttempt = {
    attemptNumber: session.attempts.length + 1,
    distanceIndex: step.distanceIndex,
    puttInSetNumber: step.puttInSetNumber,
    distanceMetres: step.distanceMetres,
    outcome,
    recordedAt,
  };

  const nextAttempts = [...session.attempts, nextAttempt];
  const isComplete = nextAttempts.length >= totalAttempts;

  return {
    ...session,
    status: isComplete ? 'completed' : 'in_progress',
    completedAt: isComplete ? recordedAt : null,
    attempts: nextAttempts,
  };
}

/**
 * Undoes the most recent putt. Called right after the final putt, it reopens the session
 * (`in_progress`, `completedAt: null`).
 */
export function undoLastPaceControlPutt(
  session: PaceControlSessionState
): PaceControlSessionState {
  if (session.attempts.length === 0) {
    return session;
  }
  return {
    ...session,
    status: 'in_progress',
    completedAt: null,
    attempts: session.attempts.slice(0, -1),
  };
}

function tally(attempts: readonly PaceControlAttempt[]): PaceDispersion {
  let short = 0;
  let inZone = 0;
  let long = 0;
  for (const attempt of attempts) {
    if (attempt.outcome === 'short') short += 1;
    else if (attempt.outcome === 'in_zone') inZone += 1;
    else if (attempt.outcome === 'long') long += 1;
  }
  return { short, inZone, long };
}

function toPercentages(counts: PaceDispersion, total: number): PaceDispersion {
  if (total === 0) {
    return { short: 0, inZone: 0, long: 0 };
  }
  return {
    short: roundToOneDecimal((counts.short / total) * 100),
    inZone: roundToOneDecimal((counts.inZone / total) * 100),
    long: roundToOneDecimal((counts.long / total) * 100),
  };
}

/**
 * Computes points, counts and dispersion percentages per target distance and overall.
 */
export function calculatePaceControlSummary(
  session: Pick<PaceControlSessionState, 'config' | 'attempts'>
): PaceControlSummary {
  const { config, attempts } = session;

  const byDistance: PaceControlDistanceStat[] = config.targetDistancesMetres.map(
    (distanceMetres, distanceIndex) => {
      const matching = attempts.filter((a) => a.distanceIndex === distanceIndex);
      const counts = tally(matching);
      return {
        distanceMetres,
        attempts: matching.length,
        counts,
        percentages: toPercentages(counts, matching.length),
        points: counts.inZone * POINTS_PER_IN_ZONE_PUTT,
      };
    }
  );

  const counts = tally(attempts);
  return {
    totalPoints: counts.inZone * POINTS_PER_IN_ZONE_PUTT,
    maxPossiblePoints: getTotalPlannedPaceAttempts(config) * POINTS_PER_IN_ZONE_PUTT,
    totalAttempts: attempts.length,
    counts,
    percentages: toPercentages(counts, attempts.length),
    byDistance,
  };
}

export function buildCompletedPaceControlRecord(
  session: PaceControlSessionState
): CompletedPaceControlRecord {
  return {
    sessionId: session.sessionId,
    mode: 'pace_control',
    configKey: session.configKey,
    config: session.config,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? new Date().toISOString(),
    attempts: session.attempts,
    summary: calculatePaceControlSummary(session),
  };
}
