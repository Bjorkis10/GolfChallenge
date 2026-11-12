export type GameMode = 'distance_rounds' | 'putting_ladder' | 'pace_control';

export type MissDirection = 'left' | 'center' | 'right';
export type MissDistance = 'short' | 'good' | 'long';

export interface MissDetails {
  readonly direction?: MissDirection;
  readonly distance?: MissDistance;
}

export const VALID_PUTTS_PER_DISTANCE = [3, 5, 10] as const;
export type PuttsPerDistanceOption = (typeof VALID_PUTTS_PER_DISTANCE)[number];

export const VALID_ROUNDS_OPTIONS = [1, 2, 3] as const;
export type RoundsOption = (typeof VALID_ROUNDS_OPTIONS)[number];

export const VALID_ATTEMPT_BUDGETS = [10, 15, 20, 30] as const;
export type AttemptBudgetOption = (typeof VALID_ATTEMPT_BUDGETS)[number];

export const VALID_ZONE_DEPTHS_METRES = [0.2, 0.3, 0.4, 0.5, 0.6] as const;
export type ZoneDepthOption = (typeof VALID_ZONE_DEPTHS_METRES)[number];

export const POINTS_PER_MADE_PUTT = 1 as const;
export const POINTS_PER_IN_ZONE_PUTT = 1 as const;

export interface DistanceRoundsConfig {
  readonly mode: 'distance_rounds';
  readonly unit: 'm';
  readonly distancesMetres: readonly number[];
  readonly puttsPerDistance: PuttsPerDistanceOption;
  readonly rounds: RoundsOption;
  readonly pointsPerMake: typeof POINTS_PER_MADE_PUTT;
}

export interface PuttingLadderConfig {
  readonly mode: 'putting_ladder';
  readonly unit: 'm';
  readonly distancesMetres: readonly number[];
  readonly attemptBudget: AttemptBudgetOption;
}

export interface PaceControlConfig {
  readonly mode: 'pace_control';
  readonly unit: 'm';
  readonly targetDistancesMetres: readonly number[];
  readonly zoneDepthMetres: ZoneDepthOption;
  readonly puttsPerDistance: PuttsPerDistanceOption;
}

export type ChallengeConfig =
  | DistanceRoundsConfig
  | PuttingLadderConfig
  | PaceControlConfig;

export type PuttOutcome = 'made' | 'missed';

export interface DistanceRoundsAttempt {
  readonly attemptNumber: number; // 1-based overall attempt index
  readonly roundNumber: number; // 1-based round index
  readonly distanceIndex: number; // 0-based index into config.distancesMetres
  readonly puttInSetNumber: number; // 1-based putt index within current distance set
  readonly distanceMetres: number;
  readonly outcome: PuttOutcome;
  readonly missDetails?: MissDetails;
  readonly recordedAt: string; // ISO timestamp
}

export interface DistanceRoundsDistanceStat {
  readonly distanceMetres: number;
  readonly makes: number;
  readonly attempts: number;
  readonly makePercentage: number; // 0 to 100, rounded to 1 decimal place
  readonly points: number;
}

export interface MissBreakdown {
  readonly totalMisses: number;
  readonly directionCounts: {
    readonly left: number;
    readonly center: number;
    readonly right: number;
    readonly untagged: number;
  };
  readonly distanceCounts: {
    readonly short: number;
    readonly good: number;
    readonly long: number;
    readonly untagged: number;
  };
}

export interface DistanceRoundsSummary {
  readonly totalPoints: number;
  readonly maxPossiblePoints: number;
  readonly totalMakes: number;
  readonly totalAttempts: number;
  readonly overallMakePercentage: number; // 0 to 100, rounded to 1 decimal place
  readonly byDistance: readonly DistanceRoundsDistanceStat[];
  readonly missBreakdown: MissBreakdown;
}

export type SessionLifecycleStatus = 'in_progress' | 'completed';

export interface DistanceRoundsSessionState {
  readonly sessionId: string;
  readonly mode: 'distance_rounds';
  readonly status: SessionLifecycleStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly config: DistanceRoundsConfig;
  readonly configKey: string;
  readonly attempts: readonly DistanceRoundsAttempt[];
}

export interface PuttingLadderAttempt {
  readonly attemptNumber: number; // 1-based attempt index (1..attemptBudget)
  readonly rungIndex: number; // 0-based index into config.distancesMetres
  readonly distanceMetres: number;
  readonly outcome: PuttOutcome;
  readonly missDetails?: MissDetails;
  readonly recordedAt: string; // ISO timestamp
}

export interface PuttingLadderRungStat {
  readonly rungNumber: number; // 1-based rung number
  readonly distanceMetres: number;
  readonly makes: number;
  readonly attempts: number;
  readonly makePercentage: number; // 0 to 100, rounded to 1 decimal place
  readonly cleared: boolean;
}

export type PuttingLadderCompletionReason =
  | 'in_progress'
  | 'ladder_cleared'
  | 'budget_exhausted';

export interface PuttingLadderSummary {
  readonly cleared: boolean;
  readonly completionReason: PuttingLadderCompletionReason;
  readonly rungsCompleted: number;
  readonly totalRungs: number;
  readonly highestDistanceClearedMetres: number | null;
  readonly farthestDistanceReachedMetres: number;
  readonly attemptsUsed: number;
  readonly attemptBudget: number;
  readonly attemptsRemaining: number;
  readonly totalMakes: number;
  readonly overallMakePercentage: number; // 0 to 100, rounded to 1 decimal place
  readonly byRung: readonly PuttingLadderRungStat[];
  readonly missBreakdown: MissBreakdown;
}

export interface PuttingLadderSessionState {
  readonly sessionId: string;
  readonly mode: 'putting_ladder';
  readonly status: SessionLifecycleStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly config: PuttingLadderConfig;
  readonly configKey: string;
  readonly attempts: readonly PuttingLadderAttempt[];
}

export type PaceOutcome = 'short' | 'in_zone' | 'long';

export interface PaceControlAttempt {
  readonly attemptNumber: number; // 1-based overall putt index
  readonly distanceIndex: number; // 0-based index into config.targetDistancesMetres
  readonly puttInSetNumber: number; // 1-based putt index within current distance
  readonly distanceMetres: number;
  readonly outcome: PaceOutcome;
  readonly recordedAt: string; // ISO timestamp
}

export interface PaceDispersion {
  readonly short: number;
  readonly inZone: number;
  readonly long: number;
}

export interface PaceControlDistanceStat {
  readonly distanceMetres: number;
  readonly attempts: number;
  readonly counts: PaceDispersion;
  readonly percentages: PaceDispersion; // 0 to 100, rounded to 1 decimal place
  readonly points: number;
}

export interface PaceControlSummary {
  readonly totalPoints: number;
  readonly maxPossiblePoints: number;
  readonly totalAttempts: number;
  readonly counts: PaceDispersion;
  readonly percentages: PaceDispersion; // 0 to 100, rounded to 1 decimal place
  readonly byDistance: readonly PaceControlDistanceStat[];
}

export interface PaceControlSessionState {
  readonly sessionId: string;
  readonly mode: 'pace_control';
  readonly status: SessionLifecycleStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly config: PaceControlConfig;
  readonly configKey: string;
  readonly attempts: readonly PaceControlAttempt[];
}

export type ActiveSessionState =
  | DistanceRoundsSessionState
  | PuttingLadderSessionState
  | PaceControlSessionState;

export interface CompletedDistanceRoundsRecord {
  readonly sessionId: string;
  readonly mode: 'distance_rounds';
  readonly configKey: string;
  readonly config: DistanceRoundsConfig;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly attempts: readonly DistanceRoundsAttempt[];
  readonly summary: DistanceRoundsSummary;
}

export interface CompletedPuttingLadderRecord {
  readonly sessionId: string;
  readonly mode: 'putting_ladder';
  readonly configKey: string;
  readonly config: PuttingLadderConfig;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly attempts: readonly PuttingLadderAttempt[];
  readonly summary: PuttingLadderSummary;
}

export interface CompletedPaceControlRecord {
  readonly sessionId: string;
  readonly mode: 'pace_control';
  readonly configKey: string;
  readonly config: PaceControlConfig;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly attempts: readonly PaceControlAttempt[];
  readonly summary: PaceControlSummary;
}

export type CompletedSessionRecord =
  | CompletedDistanceRoundsRecord
  | CompletedPuttingLadderRecord
  | CompletedPaceControlRecord;
