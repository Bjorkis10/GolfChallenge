import {
  DEFAULT_MAT_SETTINGS,
  MatSettings,
  validateMatSettings,
} from '../domain/matSettings';

export const STORAGE_KEY_V1 = 'golf_challenge_app_v1';
export const STORAGE_BACKUP_PREFIX = 'golf_challenge_app_v1_corrupt_backup_';

export interface StorageEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly settings: MatSettings;
}

export type StorageHealthMode =
  | 'ok'
  | 'storage_unavailable'
  | 'corrupted_backed_up'
  | 'corrupted_preserved_locked';

export interface StorageLoadState {
  readonly settings: MatSettings;
  readonly health: StorageHealthMode;
  readonly message: string | null;
  readonly backupKey: string | null;
}

export interface StorageSaveResult {
  readonly savedToStorage: boolean;
  readonly health: StorageHealthMode;
  readonly message: string | null;
}

export interface KeyValueStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultBrowserStorage(): KeyValueStorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const probeKey = '__golf_challenge_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseAndValidateEnvelope(raw: string): {
  valid: boolean;
  envelope?: StorageEnvelopeV1;
  reason?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      reason: 'Saved browser data is not valid JSON.',
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      valid: false,
      reason: 'Saved browser data has an unexpected root structure.',
    };
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return {
      valid: false,
      reason: `Unsupported saved data schema version (${String(record.schemaVersion)}).`,
    };
  }

  const settingsValidation = validateMatSettings(record.settings);
  if (!settingsValidation.valid || !settingsValidation.settings) {
    return {
      valid: false,
      reason: `Saved mat settings are invalid: ${settingsValidation.errors.join(' ')}`,
    };
  }

  return {
    valid: true,
    envelope: {
      schemaVersion: 1,
      updatedAt:
        typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
      settings: settingsValidation.settings,
    },
  };
}

export class SettingsStorageService {
  private readonly storage: KeyValueStorageLike | null;
  private health: StorageHealthMode = 'ok';
  private message: string | null = null;
  private backupKey: string | null = null;
  private inMemorySettings: MatSettings = DEFAULT_MAT_SETTINGS;

  constructor(customStorage?: KeyValueStorageLike | null) {
    this.storage =
      customStorage !== undefined ? customStorage : getDefaultBrowserStorage();
    if (!this.storage) {
      this.health = 'storage_unavailable';
      this.message =
        'Browser local storage is unavailable (private browsing or restricted storage). Settings will apply for this tab only and cannot be persisted across reloads.';
    }
  }

  public loadSettings(now: () => Date = () => new Date()): StorageLoadState {
    if (!this.storage) {
      return {
        settings: this.inMemorySettings,
        health: 'storage_unavailable',
        message: this.message,
        backupKey: null,
      };
    }

    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY_V1);
    } catch {
      this.health = 'storage_unavailable';
      this.message =
        'Could not read from browser local storage. Changes are kept in memory for this session only.';
      return {
        settings: this.inMemorySettings,
        health: this.health,
        message: this.message,
        backupKey: null,
      };
    }

    if (raw === null) {
      this.health = 'ok';
      this.message = null;
      this.inMemorySettings = DEFAULT_MAT_SETTINGS;
      return {
        settings: this.inMemorySettings,
        health: 'ok',
        message: null,
        backupKey: null,
      };
    }

    const result = parseAndValidateEnvelope(raw);
    if (result.valid && result.envelope) {
      this.health = 'ok';
      this.message = null;
      this.inMemorySettings = result.envelope.settings;
      return {
        settings: this.inMemorySettings,
        health: 'ok',
        message: null,
        backupKey: this.backupKey,
      };
    }

    // Data in STORAGE_KEY_V1 is unreadable or invalid.
    // Attempt to back it up to a dedicated key before allowing any overwrite.
    const candidateBackupKey = `${STORAGE_BACKUP_PREFIX}${now().getTime()}`;
    try {
      this.storage.setItem(candidateBackupKey, raw);
      const verifiedBackup = this.storage.getItem(candidateBackupKey);
      if (verifiedBackup !== raw) {
        throw new Error('Backup verification mismatch.');
      }

      this.backupKey = candidateBackupKey;
      this.health = 'corrupted_backed_up';
      this.message = `${result.reason ?? 'Saved settings were unreadable.'} The original raw data was backed up to "${candidateBackupKey}" and default 3.0m mat settings were loaded.`;
      this.inMemorySettings = DEFAULT_MAT_SETTINGS;

      return {
        settings: this.inMemorySettings,
        health: this.health,
        message: this.message,
        backupKey: this.backupKey,
      };
    } catch {
      // Backup failed: strictly preserve the original value in STORAGE_KEY_V1 and lock writes!
      this.health = 'corrupted_preserved_locked';
      this.backupKey = null;
      this.message = `${result.reason ?? 'Saved settings were unreadable.'} Automatic backup failed, so the original data in "${STORAGE_KEY_V1}" has been preserved untouched and saving is paused. Use "Reset Corrupted Storage" only if you want to replace the unreadable data with fresh defaults.`;
      this.inMemorySettings = DEFAULT_MAT_SETTINGS;

      return {
        settings: this.inMemorySettings,
        health: this.health,
        message: this.message,
        backupKey: null,
      };
    }
  }

  public saveSettings(
    nextSettings: MatSettings,
    now: () => Date = () => new Date()
  ): StorageSaveResult {
    const validation = validateMatSettings(nextSettings);
    if (!validation.valid || !validation.settings) {
      return {
        savedToStorage: false,
        health: this.health,
        message: validation.errors.join(' '),
      };
    }

    this.inMemorySettings = validation.settings;

    if (!this.storage) {
      this.health = 'storage_unavailable';
      this.message =
        'Browser local storage is unavailable. Settings updated in memory for this session only.';
      return {
        savedToStorage: false,
        health: this.health,
        message: this.message,
      };
    }

    // Critical safeguard: never overwrite STORAGE_KEY_V1 if unreadable data could not be backed up!
    if (this.health === 'corrupted_preserved_locked') {
      return {
        savedToStorage: false,
        health: this.health,
        message:
          'Settings updated in memory only. Browser storage write was skipped to preserve unreadable existing data that could not be backed up.',
      };
    }

    const envelope: StorageEnvelopeV1 = {
      schemaVersion: 1,
      updatedAt: now().toISOString(),
      settings: validation.settings,
    };

    try {
      this.storage.setItem(STORAGE_KEY_V1, JSON.stringify(envelope));
      if (this.health === 'corrupted_backed_up') {
        // Keep the backupKey record, clear error once user saves new settings after successful backup
        this.message = `Settings saved. Previous unreadable data remains preserved at "${this.backupKey}".`;
      } else {
        this.health = 'ok';
        this.message = null;
      }
      return {
        savedToStorage: true,
        health: this.health,
        message: this.message,
      };
    } catch {
      this.health = 'storage_unavailable';
      this.message =
        'Failed to write settings to browser storage (storage quota may be full). Settings are active in memory for this session.';
      return {
        savedToStorage: false,
        health: this.health,
        message: this.message,
      };
    }
  }

  /**
   * Explicit user action to clear unreadable data and write fresh default settings.
   */
  public forceResetCorruptedStorage(now: () => Date = () => new Date()): StorageLoadState {
    this.inMemorySettings = DEFAULT_MAT_SETTINGS;
    if (!this.storage) {
      this.health = 'storage_unavailable';
      return {
        settings: this.inMemorySettings,
        health: this.health,
        message: this.message,
        backupKey: null,
      };
    }

    try {
      const envelope: StorageEnvelopeV1 = {
        schemaVersion: 1,
        updatedAt: now().toISOString(),
        settings: DEFAULT_MAT_SETTINGS,
      };
      this.storage.setItem(STORAGE_KEY_V1, JSON.stringify(envelope));
      this.health = 'ok';
      this.message = null;
      return {
        settings: this.inMemorySettings,
        health: 'ok',
        message: null,
        backupKey: this.backupKey,
      };
    } catch {
      this.health = 'storage_unavailable';
      this.message =
        'Could not reset browser local storage because writes are failing. Default settings are active in memory.';
      return {
        settings: this.inMemorySettings,
        health: this.health,
        message: this.message,
        backupKey: this.backupKey,
      };
    }
  }
}
