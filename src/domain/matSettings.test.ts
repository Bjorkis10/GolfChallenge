import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAT_SETTINGS,
  PHYSICAL_MAT_LENGTH_METRES,
  buildRecommendedDistancesForUsableLimit,
  formatMetres,
  validateChallengeDistance,
  validateChallengeDistancesList,
  validateMatSettings,
} from './matSettings';

describe('matSettings domain validation', () => {
  it('defines a fixed 3.0m physical mat length and valid defaults <= 3.0m', () => {
    expect(PHYSICAL_MAT_LENGTH_METRES).toBe(3.0);
    expect(DEFAULT_MAT_SETTINGS.unit).toBe('m');
    expect(DEFAULT_MAT_SETTINGS.maxUsableDistanceMetres).toBeLessThanOrEqual(3.0);
    expect(
      DEFAULT_MAT_SETTINGS.defaultDistancesMetres.every((d) => d >= 0.5 && d <= 3.0)
    ).toBe(true);

    const validation = validateMatSettings(DEFAULT_MAT_SETTINGS);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('rejects any usable mat distance or challenge distance exceeding 3.0m', () => {
    const overMatUsable = validateMatSettings({
      ...DEFAULT_MAT_SETTINGS,
      maxUsableDistanceMetres: 3.1,
    });
    expect(overMatUsable.valid).toBe(false);
    expect(overMatUsable.errors.some((e) => e.includes('3.0m'))).toBe(true);

    const overMatChallengeDist = validateChallengeDistance(3.2, 3.0);
    expect(overMatChallengeDist).toContain('3.0m');
  });

  it('validates challenge distances against the configured maxUsableDistanceMetres', () => {
    const maxUsable = 2.4;

    expect(validateChallengeDistance(2.0, maxUsable)).toBeNull();
    expect(validateChallengeDistance(2.4, maxUsable)).toBeNull();

    const overUsableError = validateChallengeDistance(2.5, maxUsable);
    expect(overUsableError).not.toBeNull();
    expect(overUsableError).toContain('2.5m');
    expect(overUsableError).toContain('2.4m');

    const tooShortError = validateChallengeDistance(0.4, maxUsable);
    expect(tooShortError).not.toBeNull();
    expect(tooShortError).toContain('0.5m');
  });

  it('rejects settings where defaultDistancesMetres exceed maxUsableDistanceMetres', () => {
    const result = validateMatSettings({
      unit: 'm',
      physicalMatLengthMetres: 3.0,
      maxUsableDistanceMetres: 2.5,
      defaultDistancesMetres: [1.0, 1.5, 2.0, 2.5, 3.0],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds your configured usable mat distance'))).toBe(
      true
    );
  });

  it('rejects non-metre units, duplicate distances, and non-0.1m increments', () => {
    const wrongUnit = validateMatSettings({
      ...DEFAULT_MAT_SETTINGS,
      unit: 'ft',
    });
    expect(wrongUnit.valid).toBe(false);
    expect(wrongUnit.errors[0]).toContain('metres');

    const duplicateList = validateChallengeDistancesList([1.0, 1.5, 1.5], 2.5);
    expect(duplicateList.valid).toBe(false);
    expect(duplicateList.errors).toContain('Distances must be unique.');

    const nonTenthStep = validateChallengeDistance(1.25, 2.5);
    expect(nonTenthStep).toContain('0.1m increments');
  });

  it('sorts valid distances ascending and builds recommended presets within usable limit', () => {
    const listResult = validateChallengeDistancesList([2.4, 1.0, 1.8], 2.5);
    expect(listResult.valid).toBe(true);
    expect(listResult.normalizedDistances).toEqual([1.0, 1.8, 2.4]);

    const recommended = buildRecommendedDistancesForUsableLimit(2.3);
    expect(recommended).toEqual([1.0, 1.5, 2.0, 2.3]);
    expect(recommended.every((d) => d <= 2.3)).toBe(true);
    expect(formatMetres(2)).toBe('2.0m');
  });
});
