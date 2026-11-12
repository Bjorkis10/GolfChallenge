import {
  buildCompletedDistanceRoundsRecord,
  calculateDistanceRoundsSummary,
  getTotalPlannedAttempts,
  validateDistanceRoundsSetup,
} from '../domain/distanceRounds';
import {
  DEFAULT_MAT_SETTINGS,
  MatSettings,
  MIN_PUTTING_DISTANCE_METRES,
  PHYSICAL_MAT_LENGTH_METRES,
  validateMatSettings,
} from '../domain/matSettings';
import {
  removeCompletedSessionById,
  upsertCompletedSession,
} from '../domain/personalBests';
import {
  buildCompletedPaceControlRecord,
  calculatePaceControlSummary,
  getTotalPlannedPaceAttempts,
  validatePaceControlSetup,
} from '../domain/paceControl';
import {
  buildCompletedPuttingLadderRecord,
  calculatePuttingLadderSummary,
  validatePuttingLadderSetup,
} from '../domain/puttingLadder';
import {
  ActiveSessionState,
  CompletedSessionRecord,
  DistanceRoundsAttempt,
  PaceControlAttempt,
  PaceControlConfig,
  PuttingLadderAttempt,
  PuttingLadderConfig,
} from '../domain/types';

export const STORAGE_KEY_V1 = 'golf_challenge_app_v1';
export const STORAGE_BACKUP_PREFIX = 'golf_challenge_app_v1_corrupt_backup_';

export interface StorageEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly settings: MatSettings;
  readonly activeSession?: ActiveSessionState | null;
  readonly history?: readonly CompletedSessionRecord[];
}

export type StorageHealthMode =
  | 'ok'
  | 'storage_unavailable'
  | 'corrupted_backed_up'
  | 'corrupted_preserved_locked';

export interface StorageLoadState {
  readonly settings: MatSettings;
  readonly activeSession: ActiveSessionState | null;
  readonly history: readonly CompletedSessionRecord[];
  readonly health: StorageHealthMode;
  readonly message: string | null;
  readonly backupKey: string | null;
}

export interface StorageSaveResult {
  readonly savedToStorage: boolean;
  readonly health: StorageHealthMode;
  readonly message: string | null;
  readonly activeSession: ActiveSessionState | null;
  readonly history: readonly CompletedSessionRecord[];
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

function isValidAttemptDistance(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PUTTING_DISTANCE_METRES &&
    value <= PHYSICAL_MAT_LENGTH_METRES
  );
}

function validateAttemptsArray(
  rawAttempts: unknown,
  maxTotalAttempts: number
): DistanceRoundsAttempt[] | null {
  if (!Array.isArray(rawAttempts) || rawAttempts.length > maxTotalAttempts) {
    return null;
  }

  const validated: DistanceRoundsAttempt[] = [];
  for (const item of rawAttempts) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.attemptNumber !== 'number' ||
      typeof rec.roundNumber !== 'number' ||
      typeof rec.distanceIndex !== 'number' ||
      typeof rec.puttInSetNumber !== 'number' ||
      !isValidAttemptDistance(rec.distanceMetres) ||
      (rec.outcome !== 'made' && rec.outcome !== 'missed') ||
      typeof rec.recordedAt !== 'string'
    ) {
      return null;
    }
    validated.push({
      attemptNumber: rec.attemptNumber,
      roundNumber: rec.roundNumber,
      distanceIndex: rec.distanceIndex,
      puttInSetNumber: rec.puttInSetNumber,
      distanceMetres: rec.distanceMetres,
      outcome: rec.outcome,
      ...(typeof rec.missDetails === 'object' && rec.missDetails !== null
        ? { missDetails: rec.missDetails as DistanceRoundsAttempt['missDetails'] }
        : {}),
      recordedAt: rec.recordedAt,
    });
  }
  return validated;
}

function validateLadderAttemptsArray(
  rawAttempts: unknown,
  config: PuttingLadderConfig
): PuttingLadderAttempt[] | null {
  if (!Array.isArray(rawAttempts) || rawAttempts.length > config.attemptBudget) {
    return null;
  }

  const totalRungs = config.distancesMetres.length;
  const validated: PuttingLadderAttempt[] = [];
  for (const item of rawAttempts) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.attemptNumber !== 'number' ||
      typeof rec.rungIndex !== 'number' ||
      rec.rungIndex < 0 ||
      rec.rungIndex >= totalRungs ||
      !isValidAttemptDistance(rec.distanceMetres) ||
      (rec.outcome !== 'made' && rec.outcome !== 'missed') ||
      typeof rec.recordedAt !== 'string'
    ) {
      return null;
    }
    validated.push({
      attemptNumber: rec.attemptNumber,
      rungIndex: rec.rungIndex,
      distanceMetres: rec.distanceMetres,
      outcome: rec.outcome,
      ...(typeof rec.missDetails === 'object' && rec.missDetails !== null
        ? { missDetails: rec.missDetails as PuttingLadderAttempt['missDetails'] }
        : {}),
      recordedAt: rec.recordedAt,
    });
  }
  return validated;
}

function validatePaceAttemptsArray(
  rawAttempts: unknown,
  config: PaceControlConfig
): PaceControlAttempt[] | null {
  const maxAttempts = getTotalPlannedPaceAttempts(config);
  if (!Array.isArray(rawAttempts) || rawAttempts.length > maxAttempts) {
    return null;
  }

  const validated: PaceControlAttempt[] = [];
  for (const item of rawAttempts) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.attemptNumber !== 'number' ||
      typeof rec.distanceIndex !== 'number' ||
      rec.distanceIndex < 0 ||
      rec.distanceIndex >= config.targetDistancesMetres.length ||
      typeof rec.puttInSetNumber !== 'number' ||
      !isValidAttemptDistance(rec.distanceMetres) ||
      (rec.outcome !== 'short' && rec.outcome !== 'in_zone' && rec.outcome !== 'long') ||
      typeof rec.recordedAt !== 'string'
    ) {
      return null;
    }
    validated.push({
      attemptNumber: rec.attemptNumber,
      distanceIndex: rec.distanceIndex,
      puttInSetNumber: rec.puttInSetNumber,
      distanceMetres: rec.distanceMetres,
      outcome: rec.outcome,
      recordedAt: rec.recordedAt,
    });
  }
  return validated;
}

function validatePaceConfig(rawConfig: Record<string, unknown>) {
  return validatePaceControlSetup(
    {
      targetDistancesMetres: Array.isArray(rawConfig.targetDistancesMetres)
        ? (rawConfig.targetDistancesMetres as number[])
        : [],
      zoneDepthMetres: Number(rawConfig.zoneDepthMetres),
      puttsPerDistance: Number(rawConfig.puttsPerDistance),
    },
    PHYSICAL_MAT_LENGTH_METRES
  );
}

function validateStoredActiveSession(
  rawSession: unknown
): { valid: boolean; session: ActiveSessionState | null; reason?: string } {
  if (rawSession === undefined || rawSession === null) {
    return { valid: true, session: null };
  }
  if (typeof rawSession !== 'object') {
    return { valid: false, session: null, reason: 'Saved active session is malformed.' };
  }

  const rec = rawSession as Record<string, unknown>;
  if (
    typeof rec.sessionId !== 'string' ||
    (rec.mode !== 'distance_rounds' &&
      rec.mode !== 'putting_ladder' &&
      rec.mode !== 'pace_control') ||
    (rec.status !== 'in_progress' && rec.status !== 'completed') ||
    typeof rec.startedAt !== 'string' ||
    typeof rec.configKey !== 'string' ||
    typeof rec.config !== 'object' ||
    rec.config === null
  ) {
    return {
      valid: false,
      session: null,
      reason: 'Saved active session fields are invalid.',
    };
  }

  const rawConfig = rec.config as Record<string, unknown>;

  if (rec.mode === 'distance_rounds') {
    const configValidation = validateDistanceRoundsSetup(
      {
        distancesMetres: Array.isArray(rawConfig.distancesMetres)
          ? (rawConfig.distancesMetres as number[])
          : [],
        puttsPerDistance: Number(rawConfig.puttsPerDistance),
        rounds: Number(rawConfig.rounds),
      },
      PHYSICAL_MAT_LENGTH_METRES
    );

    if (!configValidation.valid || !configValidation.config) {
      return {
        valid: false,
        session: null,
        reason: `Saved active session config is invalid: ${configValidation.errors.join(' ')}`,
      };
    }

    const maxAttempts = getTotalPlannedAttempts(configValidation.config);
    const attempts = validateAttemptsArray(rec.attempts, maxAttempts);
    if (!attempts) {
      return {
        valid: false,
        session: null,
        reason: 'Saved active session attempts are invalid.',
      };
    }

    return {
      valid: true,
      session: {
        sessionId: rec.sessionId,
        mode: 'distance_rounds',
        status: rec.status,
        startedAt: rec.startedAt,
        completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : null,
        config: configValidation.config,
        configKey: rec.configKey,
        attempts,
      },
    };
  }

  if (rec.mode === 'pace_control') {
    const paceConfigValidation = validatePaceConfig(rawConfig);
    if (!paceConfigValidation.valid || !paceConfigValidation.config) {
      return {
        valid: false,
        session: null,
        reason: `Saved active Pace Control session config is invalid: ${paceConfigValidation.errors.join(' ')}`,
      };
    }
    const paceAttempts = validatePaceAttemptsArray(
      rec.attempts,
      paceConfigValidation.config
    );
    if (!paceAttempts) {
      return {
        valid: false,
        session: null,
        reason: 'Saved active Pace Control session attempts are invalid.',
      };
    }
    return {
      valid: true,
      session: {
        sessionId: rec.sessionId,
        mode: 'pace_control',
        status: rec.status,
        startedAt: rec.startedAt,
        completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : null,
        config: paceConfigValidation.config,
        configKey: rec.configKey,
        attempts: paceAttempts,
      },
    };
  }

  // mode === 'putting_ladder'
  const ladderConfigValidation = validatePuttingLadderSetup(
    {
      distancesMetres: Array.isArray(rawConfig.distancesMetres)
        ? (rawConfig.distancesMetres as number[])
        : [],
      attemptBudget: Number(rawConfig.attemptBudget),
    },
    PHYSICAL_MAT_LENGTH_METRES
  );

  if (!ladderConfigValidation.valid || !ladderConfigValidation.config) {
    return {
      valid: false,
      session: null,
      reason: `Saved active ladder session config is invalid: ${ladderConfigValidation.errors.join(' ')}`,
    };
  }

  const ladderAttempts = validateLadderAttemptsArray(
    rec.attempts,
    ladderConfigValidation.config
  );
  if (!ladderAttempts) {
    return {
      valid: false,
      session: null,
      reason: 'Saved active ladder session attempts are invalid.',
    };
  }

  return {
    valid: true,
    session: {
      sessionId: rec.sessionId,
      mode: 'putting_ladder',
      status: rec.status,
      startedAt: rec.startedAt,
      completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : null,
      config: ladderConfigValidation.config,
      configKey: rec.configKey,
      attempts: ladderAttempts,
    },
  };
}

function validateStoredHistory(
  rawHistory: unknown
): { valid: boolean; history: CompletedSessionRecord[]; reason?: string } {
  if (rawHistory === undefined) {
    return { valid: true, history: [] };
  }
  if (!Array.isArray(rawHistory)) {
    return {
      valid: false,
      history: [],
      reason: 'Saved session history must be an array.',
    };
  }

  const validated: CompletedSessionRecord[] = [];
  const seenSessionIds = new Set<string>();
  for (const item of rawHistory) {
    if (typeof item !== 'object' || item === null) {
      return {
        valid: false,
        history: [],
        reason: 'Saved session history contains an invalid entry.',
      };
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.sessionId === 'string') {
      if (seenSessionIds.has(rec.sessionId)) {
        return {
          valid: false,
          history: [],
          reason: `Saved session history contains a duplicate session id (${rec.sessionId}).`,
        };
      }
      seenSessionIds.add(rec.sessionId);
    }
    if (
      typeof rec.sessionId !== 'string' ||
      (rec.mode !== 'distance_rounds' &&
        rec.mode !== 'putting_ladder' &&
        rec.mode !== 'pace_control') ||
      typeof rec.configKey !== 'string' ||
      typeof rec.startedAt !== 'string' ||
      typeof rec.completedAt !== 'string' ||
      typeof rec.config !== 'object' ||
      rec.config === null
    ) {
      return {
        valid: false,
        history: [],
        reason: 'Saved session history record is missing required fields.',
      };
    }

    const rawConfig = rec.config as Record<string, unknown>;

    if (rec.mode === 'distance_rounds') {
      const configValidation = validateDistanceRoundsSetup(
        {
          distancesMetres: Array.isArray(rawConfig.distancesMetres)
            ? (rawConfig.distancesMetres as number[])
            : [],
          puttsPerDistance: Number(rawConfig.puttsPerDistance),
          rounds: Number(rawConfig.rounds),
        },
        PHYSICAL_MAT_LENGTH_METRES
      );

      if (!configValidation.valid || !configValidation.config) {
        return {
          valid: false,
          history: [],
          reason: 'Saved session history contains an invalid challenge configuration.',
        };
      }

      const maxAttempts = getTotalPlannedAttempts(configValidation.config);
      const attempts = validateAttemptsArray(rec.attempts ?? [], maxAttempts);
      if (!attempts) {
        return {
          valid: false,
          history: [],
          reason: 'Saved session history contains invalid attempt records.',
        };
      }

      const summary = calculateDistanceRoundsSummary({
        config: configValidation.config,
        attempts,
      });

      validated.push({
        sessionId: rec.sessionId,
        mode: 'distance_rounds',
        configKey: rec.configKey,
        config: configValidation.config,
        startedAt: rec.startedAt,
        completedAt: rec.completedAt,
        attempts,
        summary,
      });
    } else if (rec.mode === 'pace_control') {
      const paceConfigValidation = validatePaceConfig(rawConfig);
      if (!paceConfigValidation.valid || !paceConfigValidation.config) {
        return {
          valid: false,
          history: [],
          reason: 'Saved session history contains an invalid Pace Control configuration.',
        };
      }

      const paceAttempts = validatePaceAttemptsArray(
        rec.attempts ?? [],
        paceConfigValidation.config
      );
      if (!paceAttempts) {
        return {
          valid: false,
          history: [],
          reason: 'Saved session history contains invalid Pace Control attempt records.',
        };
      }

      validated.push({
        sessionId: rec.sessionId,
        mode: 'pace_control',
        configKey: rec.configKey,
        config: paceConfigValidation.config,
        startedAt: rec.startedAt,
        completedAt: rec.completedAt,
        attempts: paceAttempts,
        summary: calculatePaceControlSummary({
          config: paceConfigValidation.config,
          attempts: paceAttempts,
        }),
      });
    } else {
      const ladderConfigValidation = validatePuttingLadderSetup(
        {
          distancesMetres: Array.isArray(rawConfig.distancesMetres)
            ? (rawConfig.distancesMetres as number[])
            : [],
          attemptBudget: Number(rawConfig.attemptBudget),
        },
        PHYSICAL_MAT_LENGTH_METRES
      );

      if (!ladderConfigValidation.valid || !ladderConfigValidation.config) {
        return {
          valid: false,
          history: [],
          reason: 'Saved session history contains an invalid ladder configuration.',
        };
      }

      const ladderAttempts = validateLadderAttemptsArray(
        rec.attempts ?? [],
        ladderConfigValidation.config
      );
      if (!ladderAttempts) {
        return {
          valid: false,
          history: [],
          reason: 'Saved session history contains invalid ladder attempt records.',
        };
      }

      const summary = calculatePuttingLadderSummary({
        config: ladderConfigValidation.config,
        attempts: ladderAttempts,
      });

      validated.push({
        sessionId: rec.sessionId,
        mode: 'putting_ladder',
        configKey: rec.configKey,
        config: ladderConfigValidation.config,
        startedAt: rec.startedAt,
        completedAt: rec.completedAt,
        attempts: ladderAttempts,
        summary,
      });
    }
  }

  return { valid: true, history: validated };
}

export function parseAndValidateEnvelope(raw: string): {
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
      reason: `Saved mat settings are invalid: ${Array.from(new Set(settingsValidation.errors)).join(' ')}`,
    };
  }

  const sessionValidation = validateStoredActiveSession(record.activeSession);
  if (!sessionValidation.valid) {
    return {
      valid: false,
      reason: sessionValidation.reason ?? 'Saved active session is invalid.',
    };
  }

  const historyValidation = validateStoredHistory(record.history);
  if (!historyValidation.valid) {
    return {
      valid: false,
      reason: historyValidation.reason ?? 'Saved session history is invalid.',
    };
  }

  return {
    valid: true,
    envelope: {
      schemaVersion: 1,
      updatedAt:
        typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
      settings: settingsValidation.settings,
      activeSession: sessionValidation.session,
      history: historyValidation.history,
    },
  };
}

export class SettingsStorageService {
  private readonly storage: KeyValueStorageLike | null;
  private health: StorageHealthMode = 'ok';
  private message: string | null = null;
  private backupKey: string | null = null;
  private inMemorySettings: MatSettings = DEFAULT_MAT_SETTINGS;
  private inMemoryActiveSession: ActiveSessionState | null = null;
  private inMemoryHistory: readonly CompletedSessionRecord[] = [];

  constructor(customStorage?: KeyValueStorageLike | null) {
    this.storage =
      customStorage !== undefined ? customStorage : getDefaultBrowserStorage();
    if (!this.storage) {
      this.health = 'storage_unavailable';
      this.message =
        'Browser local storage is unavailable (private browsing or restricted storage). Settings and sessions will apply for this tab only and cannot be persisted across reloads.';
    }
  }

  public loadSettings(now: () => Date = () => new Date()): StorageLoadState {
    if (!this.storage) {
      return {
        settings: this.inMemorySettings,
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
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
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
        health: this.health,
        message: this.message,
        backupKey: null,
      };
    }

    if (raw === null) {
      this.health = 'ok';
      this.message = null;
      this.inMemorySettings = DEFAULT_MAT_SETTINGS;
      this.inMemoryActiveSession = null;
      this.inMemoryHistory = [];
      return {
        settings: this.inMemorySettings,
        activeSession: null,
        history: [],
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
      this.inMemoryActiveSession = result.envelope.activeSession ?? null;
      this.inMemoryHistory = result.envelope.history ?? [];
      return {
        settings: this.inMemorySettings,
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
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
      this.inMemoryActiveSession = null;
      this.inMemoryHistory = [];

      return {
        settings: this.inMemorySettings,
        activeSession: null,
        history: [],
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
      this.inMemoryActiveSession = null;
      this.inMemoryHistory = [];

      return {
        settings: this.inMemorySettings,
        activeSession: null,
        history: [],
        health: this.health,
        message: this.message,
        backupKey: null,
      };
    }
  }

  private persistCurrentMemoryEnvelope(now: () => Date): StorageSaveResult {
    if (!this.storage) {
      this.health = 'storage_unavailable';
      this.message =
        'Browser local storage is unavailable. Changes updated in memory for this session only.';
      return {
        savedToStorage: false,
        health: this.health,
        message: this.message,
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    }

    // Critical safeguard: never overwrite STORAGE_KEY_V1 if unreadable data could not be backed up!
    if (this.health === 'corrupted_preserved_locked') {
      return {
        savedToStorage: false,
        health: this.health,
        message:
          'Updated in memory only. Browser storage write was skipped to preserve unreadable existing data that could not be backed up.',
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    }

    const envelope: StorageEnvelopeV1 = {
      schemaVersion: 1,
      updatedAt: now().toISOString(),
      settings: this.inMemorySettings,
      activeSession: this.inMemoryActiveSession,
      history: this.inMemoryHistory,
    };

    try {
      this.storage.setItem(STORAGE_KEY_V1, JSON.stringify(envelope));
      if (this.health === 'corrupted_backed_up') {
        this.message = `Changes saved. Previous unreadable data remains preserved at "${this.backupKey}".`;
      } else {
        this.health = 'ok';
        this.message = null;
      }
      return {
        savedToStorage: true,
        health: this.health,
        message: this.message,
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    } catch {
      this.health = 'storage_unavailable';
      this.message =
        'Failed to write to browser storage (storage quota may be full). Changes are active in memory for this session.';
      return {
        savedToStorage: false,
        health: this.health,
        message: this.message,
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
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
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    }

    this.inMemorySettings = validation.settings;
    return this.persistCurrentMemoryEnvelope(now);
  }

  /**
   * Saves the active session state and synchronizes completed history:
   * - When `nextSession` is `completed`, upserts its CompletedSessionRecord in `history` by `sessionId` (preventing duplicates).
   * - When `nextSession` is `in_progress` (including when reopened via Undo after the final putt),
   *   removes any premature completion record for `nextSession.sessionId` from `history`.
   * - When `nextSession` is `null` (finishing/closing summary), clears `activeSession` while keeping `history`.
   */
  public saveActiveSession(
    nextSession: ActiveSessionState | null,
    now: () => Date = () => new Date()
  ): StorageSaveResult {
    this.inMemoryActiveSession = nextSession;

    if (nextSession !== null) {
      if (nextSession.status === 'completed') {
        const record: CompletedSessionRecord =
          nextSession.mode === 'distance_rounds'
            ? buildCompletedDistanceRoundsRecord(nextSession)
            : nextSession.mode === 'putting_ladder'
              ? buildCompletedPuttingLadderRecord(nextSession)
              : buildCompletedPaceControlRecord(nextSession);
        this.inMemoryHistory = upsertCompletedSession(this.inMemoryHistory, record);
      } else {
        this.inMemoryHistory = removeCompletedSessionById(
          this.inMemoryHistory,
          nextSession.sessionId
        );
      }
    }

    return this.persistCurrentMemoryEnvelope(now);
  }

  /**
   * Deletes one completed session from history. The active session is never touched, and a
   * session that is still the active (summary) session cannot be deleted from history.
   */
  public deleteCompletedSession(
    sessionId: string,
    now: () => Date = () => new Date()
  ): StorageSaveResult & { readonly deleted: boolean } {
    const exists = this.inMemoryHistory.some((item) => item.sessionId === sessionId);
    const isActive = this.inMemoryActiveSession?.sessionId === sessionId;
    if (!exists || isActive) {
      return {
        deleted: false,
        savedToStorage: false,
        health: this.health,
        message: isActive
          ? 'This session is still open on the challenge summary. Close it there first.'
          : 'Session not found in history.',
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    }
    const previousHistory = this.inMemoryHistory;
    this.inMemoryHistory = removeCompletedSessionById(previousHistory, sessionId);
    const result = this.persistCurrentMemoryEnvelope(now);
    return { ...result, deleted: true };
  }

  /**
   * Replaces saved settings and history with already-validated imported data. The active
   * session is left untouched. Refuses while unreadable data is being preserved, and rolls
   * back the in-memory state if a real storage write fails, so nothing is half-replaced.
   */
  public replaceWithImportedData(
    settings: MatSettings,
    history: readonly CompletedSessionRecord[],
    now: () => Date = () => new Date()
  ): StorageSaveResult & { readonly replaced: boolean } {
    if (this.health === 'corrupted_preserved_locked') {
      return {
        replaced: false,
        savedToStorage: false,
        health: this.health,
        message:
          'Import blocked: unreadable saved data is being preserved. Reset corrupted storage first if you want to replace it.',
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    }
    const previousSettings = this.inMemorySettings;
    const previousHistory = this.inMemoryHistory;
    this.inMemorySettings = settings;
    this.inMemoryHistory = history;
    const result = this.persistCurrentMemoryEnvelope(now);
    if (!result.savedToStorage && this.storage) {
      this.inMemorySettings = previousSettings;
      this.inMemoryHistory = previousHistory;
      return {
        replaced: false,
        savedToStorage: false,
        health: result.health,
        message: `Import failed: ${result.message ?? 'could not write to browser storage.'} Your existing data was not changed.`,
        activeSession: this.inMemoryActiveSession,
        history: this.inMemoryHistory,
      };
    }
    return { ...result, replaced: true };
  }

  /**
   * Explicitly abandons the current session without saving it to history.
   */
  public abandonActiveSession(now: () => Date = () => new Date()): StorageSaveResult {
    if (this.inMemoryActiveSession) {
      this.inMemoryHistory = removeCompletedSessionById(
        this.inMemoryHistory,
        this.inMemoryActiveSession.sessionId
      );
    }
    this.inMemoryActiveSession = null;
    return this.persistCurrentMemoryEnvelope(now);
  }

  /**
   * Explicit user action to clear unreadable data and write fresh default settings.
   */
  public forceResetCorruptedStorage(now: () => Date = () => new Date()): StorageLoadState {
    this.inMemorySettings = DEFAULT_MAT_SETTINGS;
    this.inMemoryActiveSession = null;
    this.inMemoryHistory = [];

    if (!this.storage) {
      this.health = 'storage_unavailable';
      return {
        settings: this.inMemorySettings,
        activeSession: null,
        history: [],
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
        activeSession: null,
        history: [],
      };
      this.storage.setItem(STORAGE_KEY_V1, JSON.stringify(envelope));
      this.health = 'ok';
      this.message = null;
      return {
        settings: this.inMemorySettings,
        activeSession: null,
        history: [],
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
        activeSession: null,
        history: [],
        health: this.health,
        message: this.message,
        backupKey: this.backupKey,
      };
    }
  }
}
