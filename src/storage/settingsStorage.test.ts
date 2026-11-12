import { describe, expect, it } from 'vitest';
import { DEFAULT_MAT_SETTINGS, MatSettings } from '../domain/matSettings';
import {
  KeyValueStorageLike,
  STORAGE_BACKUP_PREFIX,
  STORAGE_KEY_V1,
  SettingsStorageService,
} from './settingsStorage';

class InMemoryTestStorage implements KeyValueStorageLike {
  public readonly store = new Map<string, string>();
  public failBackupWrites = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  setItem(key: string, value: string): void {
    if (this.failBackupWrites && key.startsWith(STORAGE_BACKUP_PREFIX)) {
      throw new Error('QuotaExceededError: Cannot write backup key');
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('SettingsStorageService', () => {
  const fixedNow = () => new Date('2026-11-12T20:00:00.000Z');

  it('loads default 3.0m mat settings when storage is empty and persists valid updates', () => {
    const mockStorage = new InMemoryTestStorage();
    const service = new SettingsStorageService(mockStorage);

    const initial = service.loadSettings(fixedNow);
    expect(initial.health).toBe('ok');
    expect(initial.settings).toEqual(DEFAULT_MAT_SETTINGS);

    const customSettings: MatSettings = {
      unit: 'm',
      physicalMatLengthMetres: 3.0,
      maxUsableDistanceMetres: 2.6,
      defaultDistancesMetres: [1.0, 1.5, 2.0, 2.6],
    };

    const saveResult = service.saveSettings(customSettings, fixedNow);
    expect(saveResult.savedToStorage).toBe(true);
    expect(saveResult.health).toBe('ok');

    const reloaded = service.loadSettings(fixedNow);
    expect(reloaded.health).toBe('ok');
    expect(reloaded.settings).toEqual(customSettings);
  });

  it('handles unavailable storage gracefully with an accurate warning message', () => {
    const service = new SettingsStorageService(null);
    const loaded = service.loadSettings(fixedNow);
    expect(loaded.health).toBe('storage_unavailable');
    expect(loaded.message).toContain('unavailable');

    const customSettings: MatSettings = {
      unit: 'm',
      physicalMatLengthMetres: 3.0,
      maxUsableDistanceMetres: 2.4,
      defaultDistancesMetres: [1.0, 1.8, 2.4],
    };

    const saved = service.saveSettings(customSettings, fixedNow);
    expect(saved.savedToStorage).toBe(false);
    expect(saved.health).toBe('storage_unavailable');
    expect(service.loadSettings(fixedNow).settings).toEqual(customSettings);
  });

  it('backs up corrupted JSON before loading defaults when backup write succeeds', () => {
    const mockStorage = new InMemoryTestStorage();
    const corruptedRaw = '{corrupted_json: true';
    mockStorage.setItem(STORAGE_KEY_V1, corruptedRaw);

    const service = new SettingsStorageService(mockStorage);
    const loaded = service.loadSettings(fixedNow);

    expect(loaded.health).toBe('corrupted_backed_up');
    expect(loaded.backupKey).toBe(`${STORAGE_BACKUP_PREFIX}${fixedNow().getTime()}`);
    expect(mockStorage.getItem(loaded.backupKey!)).toBe(corruptedRaw);
    expect(loaded.settings).toEqual(DEFAULT_MAT_SETTINGS);
    expect(loaded.message).toContain('backed up');
  });

  it('preserves the original unreadable value and prevents overwriting when backup fails', () => {
    const mockStorage = new InMemoryTestStorage();
    const unreadablePayload = JSON.stringify({
      schemaVersion: 99,
      importantLegacyUserData: 'do-not-lose-me',
    });
    mockStorage.setItem(STORAGE_KEY_V1, unreadablePayload);
    mockStorage.failBackupWrites = true;

    const service = new SettingsStorageService(mockStorage);
    const loaded = service.loadSettings(fixedNow);

    expect(loaded.health).toBe('corrupted_preserved_locked');
    expect(loaded.backupKey).toBeNull();
    expect(loaded.message).toContain('preserved untouched');
    // Original value in STORAGE_KEY_V1 is untouched
    expect(mockStorage.getItem(STORAGE_KEY_V1)).toBe(unreadablePayload);

    // Attempting to save new settings updates in-memory state ONLY and does NOT overwrite STORAGE_KEY_V1
    const nextSettings: MatSettings = {
      unit: 'm',
      physicalMatLengthMetres: 3.0,
      maxUsableDistanceMetres: 2.5,
      defaultDistancesMetres: [1.0, 2.0, 2.5],
    };
    const saveAttempt = service.saveSettings(nextSettings, fixedNow);
    expect(saveAttempt.savedToStorage).toBe(false);
    expect(saveAttempt.health).toBe('corrupted_preserved_locked');
    expect(mockStorage.getItem(STORAGE_KEY_V1)).toBe(unreadablePayload);

    // Only an explicit user-confirmed reset overwrites STORAGE_KEY_V1
    const afterReset = service.forceResetCorruptedStorage(fixedNow);
    expect(afterReset.health).toBe('ok');
    expect(mockStorage.getItem(STORAGE_KEY_V1)).not.toBe(unreadablePayload);
  });
});
