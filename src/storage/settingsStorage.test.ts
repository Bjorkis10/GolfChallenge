import { describe, expect, it } from 'vitest';
import {
  createDistanceRoundsSession,
  recordDistanceRoundsPutt,
  undoLastDistanceRoundsPutt,
  validateDistanceRoundsSetup,
} from '../domain/distanceRounds';
import { DEFAULT_MAT_SETTINGS, MatSettings } from '../domain/matSettings';
import { getPersonalBestForConfigKey } from '../domain/personalBests';
import {
  createPaceControlSession,
  recordPaceControlPutt,
  undoLastPaceControlPutt,
  validatePaceControlSetup,
} from '../domain/paceControl';
import {
  createPuttingLadderSession,
  recordPuttingLadderPutt,
  undoLastPuttingLadderPutt,
  validatePuttingLadderSetup,
} from '../domain/puttingLadder';
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
    expect(initial.activeSession).toBeNull();
    expect(initial.history).toEqual([]);

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

  it('persists activeSession for auto-resume across reloads and syncs post-final-putt Undo with history without duplicates', () => {
    const mockStorage = new InMemoryTestStorage();
    const service = new SettingsStorageService(mockStorage);
    service.loadSettings(fixedNow);

    const config = validateDistanceRoundsSetup(
      { distancesMetres: [1.0], puttsPerDistance: 3, rounds: 1 },
      3.0
    ).config!;

    let session = createDistanceRoundsSession(config, {
      sessionId: 'dr_session_101',
      startedAt: '2026-11-12T20:00:00.000Z',
    });
    session = recordDistanceRoundsPutt(session, 'made');
    session = recordDistanceRoundsPutt(session, 'made');
    service.saveActiveSession(session, fixedNow);

    // Simulate page refresh with a new service instance
    const reloadedService = new SettingsStorageService(mockStorage);
    const reloadedState = reloadedService.loadSettings(fixedNow);
    expect(reloadedState.activeSession?.sessionId).toBe('dr_session_101');
    expect(reloadedState.activeSession?.status).toBe('in_progress');
    expect(reloadedState.activeSession?.attempts).toHaveLength(2);
    expect(reloadedState.history).toHaveLength(0);

    // Log final putt as 'made' (3/3 = 3 pts)
    const activeDr = reloadedState.activeSession!;
    if (activeDr.mode !== 'distance_rounds') {
      throw new Error('Expected distance_rounds session');
    }
    let completed = recordDistanceRoundsPutt(
      activeDr,
      'made',
      { recordedAt: '2026-11-12T20:01:00.000Z' }
    );
    const afterComplete = reloadedService.saveActiveSession(completed, fixedNow);
    expect(afterComplete.history).toHaveLength(1);
    const firstHist = afterComplete.history[0];
    expect(firstHist.mode === 'distance_rounds' && firstHist.summary.totalPoints).toBe(3);

    // Trigger post-final-putt Undo to reopen session
    const reopened = undoLastDistanceRoundsPutt(completed);
    const afterUndo = reloadedService.saveActiveSession(reopened, fixedNow);
    expect(afterUndo.activeSession?.status).toBe('in_progress');
    expect(afterUndo.activeSession?.attempts).toHaveLength(2);
    expect(afterUndo.history).toHaveLength(0);
    expect(
      getPersonalBestForConfigKey(afterUndo.history, completed.configKey)
    ).toBeNull();

    // Log final putt as 'missed' (2/3 = 2 pts) and verify updated history and PB without duplicates
    completed = recordDistanceRoundsPutt(reopened, 'missed', {
      recordedAt: '2026-11-12T20:02:00.000Z',
    });
    const afterRecomplete = reloadedService.saveActiveSession(completed, fixedNow);
    expect(afterRecomplete.history).toHaveLength(1);
    expect(afterRecomplete.history[0].sessionId).toBe('dr_session_101');
    const updatedHist = afterRecomplete.history[0];
    expect(
      updatedHist.mode === 'distance_rounds' && updatedHist.summary.totalPoints
    ).toBe(2);
    const pb = getPersonalBestForConfigKey(
      afterRecomplete.history,
      completed.configKey
    );
    expect(pb && pb.mode === 'distance_rounds' && pb.summary.totalPoints).toBe(2);
  });

  it('persists Putting Ladder activeSession, completed history, and post-final-putt Undo reopen without duplicates', () => {
    const mockStorage = new InMemoryTestStorage();
    const service = new SettingsStorageService(mockStorage);
    service.loadSettings(fixedNow);

    const ladderConfig = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 2.0], attemptBudget: 10 },
      3.0
    ).config!;

    let session = createPuttingLadderSession(ladderConfig, {
      sessionId: 'pl_session_202',
      startedAt: '2026-11-12T20:10:00.000Z',
    });
    session = recordPuttingLadderPutt(session, 'made'); // Rung 1 cleared
    service.saveActiveSession(session, fixedNow);

    // Reload from storage
    const reloadedService = new SettingsStorageService(mockStorage);
    const reloadedState = reloadedService.loadSettings(fixedNow);
    expect(reloadedState.activeSession?.mode).toBe('putting_ladder');
    expect(reloadedState.activeSession?.sessionId).toBe('pl_session_202');

    // Clear final rung on attempt 2
    let completed = recordPuttingLadderPutt(session, 'made', {
      recordedAt: '2026-11-12T20:11:00.000Z',
    });
    const afterComplete = reloadedService.saveActiveSession(completed, fixedNow);
    expect(afterComplete.history).toHaveLength(1);
    expect(afterComplete.history[0].mode).toBe('putting_ladder');
    if (afterComplete.history[0].mode === 'putting_ladder') {
      expect(afterComplete.history[0].summary.cleared).toBe(true);
      expect(afterComplete.history[0].summary.attemptsUsed).toBe(2);
    }

    // Undo final putt -> reopens session and removes completion record
    const reopened = undoLastPuttingLadderPutt(completed);
    const afterUndo = reloadedService.saveActiveSession(reopened, fixedNow);
    expect(afterUndo.activeSession?.status).toBe('in_progress');
    expect(afterUndo.history).toHaveLength(0);

    // Miss attempt 2, then make attempt 3 -> cleared in 3 attempts, 1 history record
    let afterMiss = recordPuttingLadderPutt(reopened, 'missed');
    completed = recordPuttingLadderPutt(afterMiss, 'made', {
      recordedAt: '2026-11-12T20:12:00.000Z',
    });
    const afterRecomplete = reloadedService.saveActiveSession(completed, fixedNow);
    expect(afterRecomplete.history).toHaveLength(1);
    expect(afterRecomplete.history[0].sessionId).toBe('pl_session_202');
    if (afterRecomplete.history[0].mode === 'putting_ladder') {
      expect(afterRecomplete.history[0].summary.cleared).toBe(true);
      expect(afterRecomplete.history[0].summary.attemptsUsed).toBe(3);
    }
  });
  it('persists Pace Control activeSession, completed history, and post-final-putt Undo reopen without duplicates', () => {
    const mockStorage = new InMemoryTestStorage();
    const service = new SettingsStorageService(mockStorage);
    service.loadSettings(fixedNow);

    const config = validatePaceControlSetup(
      { targetDistancesMetres: [1.5, 2.0], zoneDepthMetres: 0.3, puttsPerDistance: 3 },
      3.0
    ).config!;

    let session = createPaceControlSession(config, {
      sessionId: 'pc_session_303',
      startedAt: '2026-11-12T20:20:00.000Z',
    });
    session = recordPaceControlPutt(session, 'in_zone');
    session = recordPaceControlPutt(session, 'short');
    service.saveActiveSession(session, fixedNow);

    // Auto-resume across reload
    const reloadedService = new SettingsStorageService(mockStorage);
    const reloaded = reloadedService.loadSettings(fixedNow);
    expect(reloaded.health).toBe('ok');
    expect(reloaded.activeSession?.mode).toBe('pace_control');
    expect(reloaded.activeSession?.attempts).toHaveLength(2);

    // Finish with 4 more putts
    let completed = session;
    for (const outcome of ['long', 'in_zone', 'in_zone', 'in_zone'] as const) {
      completed = recordPaceControlPutt(completed, outcome);
    }
    expect(completed.status).toBe('completed');
    const afterComplete = reloadedService.saveActiveSession(completed, fixedNow);
    expect(afterComplete.history).toHaveLength(1);
    const first = afterComplete.history[0];
    expect(first.mode === 'pace_control' && first.summary.totalPoints).toBe(4);

    // Undo after final putt reopens and removes the saved result
    const reopened = undoLastPaceControlPutt(completed);
    const afterUndo = reloadedService.saveActiveSession(reopened, fixedNow);
    expect(afterUndo.activeSession?.status).toBe('in_progress');
    expect(afterUndo.history).toHaveLength(0);

    // Re-complete with a different result: one history entry, updated PB
    const recompleted = recordPaceControlPutt(reopened, 'long');
    const afterRecomplete = reloadedService.saveActiveSession(recompleted, fixedNow);
    expect(afterRecomplete.history).toHaveLength(1);
    expect(afterRecomplete.history[0].sessionId).toBe('pc_session_303');
    const pb = getPersonalBestForConfigKey(
      afterRecomplete.history,
      recompleted.configKey
    );
    expect(pb && pb.mode === 'pace_control' && pb.summary.totalPoints).toBe(3);

    // Survives a reload
    const final = new SettingsStorageService(mockStorage).loadSettings(fixedNow);
    expect(final.history).toHaveLength(1);
    expect(final.activeSession?.status).toBe('completed');
  });

  it('backs up rather than loads a saved Pace Control session with an invalid zone depth', () => {
    const mockStorage = new InMemoryTestStorage();
    const service = new SettingsStorageService(mockStorage);
    service.loadSettings(fixedNow);
    const config = validatePaceControlSetup(
      { targetDistancesMetres: [1.5], zoneDepthMetres: 0.3, puttsPerDistance: 3 },
      3.0
    ).config!;
    service.saveActiveSession(
      createPaceControlSession(config, { sessionId: 'bad' }),
      fixedNow
    );

    const envelope = JSON.parse(mockStorage.store.get(STORAGE_KEY_V1)!);
    envelope.activeSession.config.zoneDepthMetres = 0.9;
    mockStorage.store.set(STORAGE_KEY_V1, JSON.stringify(envelope));

    const loaded = new SettingsStorageService(mockStorage).loadSettings(fixedNow);
    expect(loaded.health).toBe('corrupted_backed_up');
    expect(loaded.activeSession).toBeNull();
    expect(
      Array.from(mockStorage.store.keys()).some((k) => k.startsWith(STORAGE_BACKUP_PREFIX))
    ).toBe(true);
  });
});
