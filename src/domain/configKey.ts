import { roundToTenthMetre } from './matSettings';
import { DistanceRoundsConfig } from './types';

export interface DistanceRoundsConfigKeyInput {
  readonly distancesMetres: readonly number[];
  readonly puttsPerDistance: number;
  readonly rounds: number;
  readonly unit?: 'm';
  readonly pointsPerMake?: number;
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
 * Produces a deterministic configuration key for any supported challenge configuration.
 */
export function getConfigKey(config: DistanceRoundsConfig): string {
  switch (config.mode) {
    case 'distance_rounds':
      return getDistanceRoundsConfigKey(config);
  }
}

/**
 * Returns true if and only if two configurations produce the exact same canonical configKey.
 */
export function areConfigsComparable(
  a: DistanceRoundsConfig,
  b: DistanceRoundsConfig
): boolean {
  return getConfigKey(a) === getConfigKey(b);
}
