export const PHYSICAL_MAT_LENGTH_METRES = 3.0;
export const MIN_PUTTING_DISTANCE_METRES = 0.5;
export const MIN_USABLE_DISTANCE_METRES = 1.0;
export const DISTANCE_STEP_METRES = 0.1;
export const MAX_PRESET_DISTANCES_COUNT = 6;

export interface MatSettings {
  readonly unit: 'm';
  readonly physicalMatLengthMetres: 3.0;
  readonly maxUsableDistanceMetres: number;
  readonly defaultDistancesMetres: number[];
}

export interface MatSettingsValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly settings?: MatSettings;
}

export const DEFAULT_MAT_SETTINGS: MatSettings = {
  unit: 'm',
  physicalMatLengthMetres: PHYSICAL_MAT_LENGTH_METRES,
  maxUsableDistanceMetres: 3.0,
  defaultDistancesMetres: [1.0, 1.5, 2.0, 2.5, 3.0],
};

/**
 * Rounds a metre measurement to the nearest 0.1m to avoid floating-point drift.
 */
export function roundToTenthMetre(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Formats a distance in metres consistently (e.g., 1 -> "1.0m", 2.5 -> "2.5m").
 */
export function formatMetres(value: number): string {
  return `${roundToTenthMetre(value).toFixed(1)}m`;
}

/**
 * Validates whether a single putting distance is valid for the configured usable mat distance.
 */
export function validateChallengeDistance(
  distanceMetres: number,
  maxUsableDistanceMetres: number
): string | null {
  if (!Number.isFinite(distanceMetres)) {
    return 'Distance must be a valid number in metres.';
  }
  const roundedMax = roundToTenthMetre(maxUsableDistanceMetres);
  if (
    !Number.isFinite(roundedMax) ||
    roundedMax < MIN_USABLE_DISTANCE_METRES ||
    roundedMax > PHYSICAL_MAT_LENGTH_METRES
  ) {
    return `Maximum usable distance must be between ${formatMetres(MIN_USABLE_DISTANCE_METRES)} and ${formatMetres(PHYSICAL_MAT_LENGTH_METRES)}.`;
  }

  const rounded = roundToTenthMetre(distanceMetres);
  if (Math.abs(distanceMetres - rounded) > 1e-6) {
    return 'Distance must be in 0.1m increments.';
  }
  if (rounded < MIN_PUTTING_DISTANCE_METRES) {
    return `Distance must be at least ${formatMetres(MIN_PUTTING_DISTANCE_METRES)}.`;
  }
  if (rounded > PHYSICAL_MAT_LENGTH_METRES) {
    return `Distance cannot exceed the ${formatMetres(PHYSICAL_MAT_LENGTH_METRES)} physical mat length.`;
  }
  if (rounded > roundedMax) {
    return `Distance (${formatMetres(rounded)}) exceeds your configured usable mat distance of ${formatMetres(roundedMax)}.`;
  }
  return null;
}

/**
 * Validates a list of challenge distances against the configured maximum usable distance.
 */
export function validateChallengeDistancesList(
  distancesMetres: readonly number[],
  maxUsableDistanceMetres: number,
  minCount = 1,
  maxCount = MAX_PRESET_DISTANCES_COUNT
): { valid: boolean; errors: string[]; normalizedDistances: number[] } {
  const errors: string[] = [];

  if (!Array.isArray(distancesMetres) || distancesMetres.length < minCount) {
    errors.push(
      minCount === 1
        ? 'Select at least 1 putting distance.'
        : `Select at least ${minCount} putting distances.`
    );
    return { valid: false, errors, normalizedDistances: [] };
  }

  if (distancesMetres.length > maxCount) {
    errors.push(`You can configure at most ${maxCount} distances.`);
  }

  const normalizedSet = new Set<number>();
  for (const rawDist of distancesMetres) {
    const distError = validateChallengeDistance(rawDist, maxUsableDistanceMetres);
    if (distError) {
      errors.push(distError);
    } else {
      normalizedSet.add(roundToTenthMetre(rawDist));
    }
  }

  if (normalizedSet.size !== distancesMetres.length && errors.length === 0) {
    errors.push('Distances must be unique.');
  }

  const normalizedDistances = Array.from(normalizedSet).sort((a, b) => a - b);

  return {
    valid: errors.length === 0,
    errors,
    normalizedDistances,
  };
}

/**
 * Validates an arbitrary candidate object or input values as MatSettings.
 */
export function validateMatSettings(candidate: unknown): MatSettingsValidationResult {
  if (typeof candidate !== 'object' || candidate === null) {
    return { valid: false, errors: ['Mat settings must be an object.'] };
  }

  const record = candidate as Record<string, unknown>;
  const errors: string[] = [];

  if (record.unit !== 'm') {
    errors.push('Only metres ("m") are supported in version 1.');
  }

  if (record.physicalMatLengthMetres !== PHYSICAL_MAT_LENGTH_METRES) {
    errors.push(`Physical mat length must be ${formatMetres(PHYSICAL_MAT_LENGTH_METRES)}.`);
  }

  const rawMaxUsable = record.maxUsableDistanceMetres;
  if (typeof rawMaxUsable !== 'number' || !Number.isFinite(rawMaxUsable)) {
    errors.push('Maximum usable distance must be a valid number.');
    return { valid: false, errors };
  }

  const roundedMaxUsable = roundToTenthMetre(rawMaxUsable);
  if (Math.abs(rawMaxUsable - roundedMaxUsable) > 1e-6) {
    errors.push('Maximum usable distance must use 0.1m increments.');
  }
  if (roundedMaxUsable < MIN_USABLE_DISTANCE_METRES) {
    errors.push(
      `Maximum usable distance must be at least ${formatMetres(MIN_USABLE_DISTANCE_METRES)}.`
    );
  }
  if (roundedMaxUsable > PHYSICAL_MAT_LENGTH_METRES) {
    errors.push(
      `Maximum usable distance cannot exceed the ${formatMetres(PHYSICAL_MAT_LENGTH_METRES)} mat length.`
    );
  }

  if (!Array.isArray(record.defaultDistancesMetres)) {
    errors.push('Default putting distances must be a list of numbers.');
    return { valid: false, errors };
  }

  const rawDistances = record.defaultDistancesMetres;
  if (!rawDistances.every((item): item is number => typeof item === 'number')) {
    errors.push('Every default putting distance must be a number in metres.');
    return { valid: false, errors };
  }

  const listResult = validateChallengeDistancesList(
    rawDistances,
    roundedMaxUsable,
    1,
    MAX_PRESET_DISTANCES_COUNT
  );
  if (!listResult.valid) {
    errors.push(...listResult.errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    settings: {
      unit: 'm',
      physicalMatLengthMetres: PHYSICAL_MAT_LENGTH_METRES,
      maxUsableDistanceMetres: roundedMaxUsable,
      defaultDistancesMetres: listResult.normalizedDistances,
    },
  };
}

/**
 * Generates evenly spaced recommended distances that fit within maxUsableDistanceMetres (<= 3.0m).
 */
export function buildRecommendedDistancesForUsableLimit(maxUsableDistanceMetres: number): number[] {
  const clampedMax = Math.min(
    PHYSICAL_MAT_LENGTH_METRES,
    Math.max(MIN_USABLE_DISTANCE_METRES, roundToTenthMetre(maxUsableDistanceMetres))
  );

  const standardSteps = [1.0, 1.5, 2.0, 2.5, 3.0].filter((d) => d <= clampedMax);
  if (standardSteps.length > 0 && standardSteps[standardSteps.length - 1] < clampedMax) {
    standardSteps.push(clampedMax);
  }
  if (standardSteps.length === 0) {
    return [clampedMax];
  }
  return Array.from(new Set(standardSteps)).sort((a, b) => a - b);
}
