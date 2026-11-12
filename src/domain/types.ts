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

export const POINTS_PER_MADE_PUTT = 1 as const;

export interface DistanceRoundsConfig {
  readonly mode: 'distance_rounds';
  readonly unit: 'm';
  readonly distancesMetres: readonly number[];
  readonly puttsPerDistance: PuttsPerDistanceOption;
  readonly rounds: RoundsOption;
  readonly pointsPerMake: typeof POINTS_PER_MADE_PUTT;
}

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

export type ActiveSessionState = DistanceRoundsSessionState;

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

export type CompletedSessionRecord = CompletedDistanceRoundsRecord;
