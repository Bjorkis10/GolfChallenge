import { roundToTenthMetre } from './matSettings';
import { ChallengeConfig } from './types';

export interface DistanceRoundsConfigKeyInput {
  readonly distancesMetres: readonly number[];
  readonly puttsPerDistance: number;
  readonly rounds: number;
  readonly unit?: 'm';
  readonly pointsPerMake?: number;
}

export interface PuttingLadderConfigKeyInput {
  readonly distancesMetres: readonly number[];
  readonly attemptBudget: number;
  readonly unit?: 'm';
}

export interface PaceControlConfigKeyInput {
  readonly targetDistancesMetres: readonly number[];
  readonly zoneDepthMetres: number;
  readonly puttsPerDistance: number;
  readonly unit?: 'm';
}

/**
 * Normalizes an array of distances to sorted, unique 0.1m values formatted with 1 decimal place.
 */
export function normalizeDistancesForConfigKey(distancesMetres: readonly number[]): string {
  const uniqueRounded = Array.from(
    new Set(distancesMetres.map((d) => roundToTenthMetre(d)))
  ).sort((a, b) => a - b);

  return uniqueRounded.map((d) => d.toFixed(1)).join(',');
}

/**
 * Produces the canonical fingerprint for a Distance Rounds configuration:
 * `distance_rounds:v1:unit=m:d=1.0,1.5,2.0,2.5:putts=5:rounds=1:pts=1`
 */
export function getDistanceRoundsConfigKey(input: DistanceRoundsConfigKeyInput): string {
  const unit = input.unit ?? 'm';
  const pts = input.pointsPerMake ?? 1;
  const distancesSegment = normalizeDistancesForConfigKey(input.distancesMetres);
  return `distance_rounds:v1:unit=${unit}:d=${distancesSegment}:putts=${input.puttsPerDistance}:rounds=${input.rounds}:pts=${pts}`;
}

/**
 * Produces the canonical fingerprint for a Putting Ladder configuration:
 * `putting_ladder:v1:unit=m:d=1.0,1.5,2.0,2.5:budget=15:finish=complete`
 */
export function getPuttingLadderConfigKey(input: PuttingLadderConfigKeyInput): string {
  const unit = input.unit ?? 'm';
  const distancesSegment = normalizeDistancesForConfigKey(input.distancesMetres);
  return `putting_ladder:v1:unit=${unit}:d=${distancesSegment}:budget=${input.attemptBudget}:finish=complete`;
}

/**
 * Produces the canonical fingerprint for a Pace Control configuration:
 * `pace_control:v1:unit=m:d=1.5,2.0,2.5:zone=0.3:putts=5`
 */
export function getPaceControlConfigKey(input: PaceControlConfigKeyInput): string {
  const unit = input.unit ?? 'm';
  const distancesSegment = normalizeDistancesForConfigKey(input.targetDistancesMetres);
  const zone = roundToTenthMetre(input.zoneDepthMetres).toFixed(1);
  return `pace_control:v1:unit=${unit}:d=${distancesSegment}:zone=${zone}:putts=${input.puttsPerDistance}`;
}

/**
 * Produces a deterministic configuration key for any supported challenge configuration.
 */
export function getConfigKey(config: ChallengeConfig): string {
  switch (config.mode) {
    case 'distance_rounds':
      return getDistanceRoundsConfigKey(config);
    case 'putting_ladder':
      return getPuttingLadderConfigKey(config);
    case 'pace_control':
      return getPaceControlConfigKey(config);
  }
}

/**
 * Returns true if and only if two configurations produce the exact same canonical configKey.
 */
export function areConfigsComparable(
  a: ChallengeConfig,
  b: ChallengeConfig
): boolean {
  return getConfigKey(a) === getConfigKey(b);
}
