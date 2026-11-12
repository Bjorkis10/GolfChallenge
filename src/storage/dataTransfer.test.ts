import { describe, expect, it } from 'vitest';
import {
  buildCompletedDistanceRoundsRecord,
  createDistanceRoundsSession,
  recordDistanceRoundsPutt,
  validateDistanceRoundsSetup,
} from '../domain/distanceRounds';
import {
  buildPersonalBestGroups,
  filterHistoryByMode,
  getPersonalBestSessionIds,
} from '../domain/historyView';
import { DEFAULT_MAT_SETTINGS, MatSettings } from '../domain/matSettings';
import {
  buildCompletedPaceControlRecord,
  createPaceControlSession,
  recordPaceControlPutt,
  validatePaceControlSetup,
} from '../domain/paceControl';
import {
  buildCompletedPuttingLadderRecord,
  createPuttingLadderSession,
  recordPuttingLadderPutt,
  validatePuttingLadderSetup,
} from '../domain/puttingLadder';
import { CompletedSessionRecord } from '../domain/types';
import {
  buildExportPayload,
  serializeExport,
  validateImportText,
} from './dataTransfer';
import {
  KeyValueStorageLike,
  STORAGE_KEY_V1,
  SettingsStorageService,
} from './settingsStorage';

class MemoryStorage implements KeyValueStorageLike {
  public readonly store = new Map<string, string>();
  public failWrites = false;
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const fixedNow = () => new Date('2026-11-12T20:00:00.000Z');

function drRecord(id: string, makes: number, completedMinute: number): CompletedSessionRecord {
  const config = validateDistanceRoundsSetup(
    { distancesMetres: [1.0, 2.0], puttsPerDistance: 3, rounds: 1 },
    3.0
  ).config!;
  let session = createDistanceRoundsSession(config, {
    sessionId: id,
    startedAt: '2026-11-12T10:00:00.000Z',
  });
  for (let i = 0; i < 6; i += 1) {
    session = recordDistanceRoundsPutt(session, i < makes ? 'made' : 'missed', {
      recordedAt: `2026-11-12T10:0${completedMinute}:00.000Z`,
    });
  }
  return buildCompletedDistanceRoundsRecord(session);
}

function ladderRecord(id: string): CompletedSessionRecord {
  const config = validatePuttingLadderSetup(
    { distancesMetres: [1.0, 2.0], attemptBudget: 10 },
    3.0
  ).config!;
  let session = createPuttingLadderSession(config, {
    sessionId: id,
    startedAt: '2026-11-12T11:00:00.000Z',
  });
  session = recordPuttingLadderPutt(session, 'made');
  session = recordPuttingLadderPutt(session, 'made');
  return buildCompletedPuttingLadderRecord(session);
}

function paceRecord(id: string): CompletedSessionRecord {
  const config = validatePaceControlSetup(
    { targetDistancesMetres: [1.5, 2.5], zoneDepthMetres: 0.4, puttsPerDistance: 3 },
    3.0
  ).config!;
  let session = createPaceControlSession(config, {
    sessionId: id,
    startedAt: '2026-11-12T12:00:00.000Z',
  });
  for (let i = 0; i < 6; i += 1) {
    session = recordPaceControlPutt(session, i % 2 === 0 ? 'in_zone' : 'short');
  }
  return buildCompletedPaceControlRecord(session);
}

const customSettings: MatSettings = {
  unit: 'm',
  physicalMatLengthMetres: 3.0,
  maxUsableDistanceMetres: 2.6,
  defaultDistancesMetres: [1.0, 2.0],
};

function exportText(history: readonly CompletedSessionRecord[], settings = customSettings) {
  return serializeExport(buildExportPayload(settings, history, fixedNow));
}

describe('export / import validation', () => {
  it('round-trips a valid export with all three game modes', () => {
    const history = [drRecord('dr1', 4, 1), ladderRecord('pl1'), paceRecord('pc1')];
    const result = validateImportText(exportText(history));

    expect(result.valid).toBe(true);
    expect(result.settings).toEqual(customSettings);
    expect(result.history).toHaveLength(3);
    expect(result.history?.map((r) => r.sessionId)).toEqual(['dr1', 'pl1', 'pc1']);
    expect(result.history).toEqual(history);
    expect(result.preview?.countsByMode).toEqual({
      distance_rounds: 1,
      putting_ladder: 1,
      pace_control: 1,
    });
    expect(result.preview?.comparableConfigCount).toBe(3);
  });

  it('rejects malformed JSON and non-backup roots', () => {
    expect(validateImportText('{ not json').valid).toBe(false);
    expect(validateImportText('[1,2,3]').valid).toBe(false);
    expect(validateImportText('null').valid).toBe(false);
    expect(validateImportText('{"schemaVersion":1}').valid).toBe(false);
  });

  it('rejects a wrong schemaVersion', () => {
    const payload = JSON.parse(exportText([drRecord('dr1', 3, 1)]));
    payload.schemaVersion = 2;
    const result = validateImportText(JSON.stringify(payload));
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/schema version/i);
  });

  it('rejects settings above the 3.0m mat and invalid usable distances', () => {
    const payload = JSON.parse(exportText([]));
    payload.settings.maxUsableDistanceMetres = 3.5;
    expect(validateImportText(JSON.stringify(payload)).valid).toBe(false);

    const payload2 = JSON.parse(exportText([]));
    payload2.settings.defaultDistancesMetres = [1.0, 3.4];
    expect(validateImportText(JSON.stringify(payload2)).valid).toBe(false);
  });

  it('rejects session configs with out-of-bounds distances', () => {
    const payload = JSON.parse(exportText([drRecord('dr1', 3, 1)]));
    payload.history[0].config.distancesMetres = [1.0, 3.5];
    expect(validateImportText(JSON.stringify(payload)).valid).toBe(false);

    const ladder = JSON.parse(exportText([ladderRecord('pl1')]));
    ladder.history[0].config.distancesMetres = [1.0, 4.0];
    expect(validateImportText(JSON.stringify(ladder)).valid).toBe(false);
  });

  it('rejects out-of-bounds attempt distances', () => {
    const payload = JSON.parse(exportText([drRecord('dr1', 3, 1)]));
    payload.history[0].attempts[0].distanceMetres = 3.6;
    expect(validateImportText(JSON.stringify(payload)).valid).toBe(false);
  });

  it('rejects invalid pace zone depth', () => {
    const payload = JSON.parse(exportText([paceRecord('pc1')]));
    payload.history[0].config.zoneDepthMetres = 0.9;
    expect(validateImportText(JSON.stringify(payload)).valid).toBe(false);
  });

  it('rejects invalid attempts (bad outcome, wrong type, too many)', () => {
    const badOutcome = JSON.parse(exportText([drRecord('dr1', 3, 1)]));
    badOutcome.history[0].attempts[0].outcome = 'holed';
    expect(validateImportText(JSON.stringify(badOutcome)).valid).toBe(false);

    const paceBad = JSON.parse(exportText([paceRecord('pc1')]));
    paceBad.history[0].attempts[0].outcome = 'made';
    expect(validateImportText(JSON.stringify(paceBad)).valid).toBe(false);

    const notArray = JSON.parse(exportText([ladderRecord('pl1')]));
    notArray.history[0].attempts = 'nope';
    expect(validateImportText(JSON.stringify(notArray)).valid).toBe(false);

    const tooMany = JSON.parse(exportText([drRecord('dr1', 3, 1)]));
    tooMany.history[0].attempts.push({ ...tooMany.history[0].attempts[0] });
    expect(validateImportText(JSON.stringify(tooMany)).valid).toBe(false);
  });

  it('rejects duplicate session ids and a non-array history', () => {
    const dup = JSON.parse(exportText([drRecord('same', 3, 1), drRecord('same', 2, 2)]));
    expect(validateImportText(JSON.stringify(dup)).valid).toBe(false);

    const notArray = JSON.parse(exportText([]));
    notArray.history = {};
    expect(validateImportText(JSON.stringify(notArray)).valid).toBe(false);
  });

  it('leaves existing storage untouched when an import is rejected', () => {
    const storage = new MemoryStorage();
    const service = new SettingsStorageService(storage);
    service.loadSettings(fixedNow);
    service.saveSettings(customSettings, fixedNow);
    service.saveActiveSession(
      createDistanceRoundsSession(
        validateDistanceRoundsSetup(
          { distancesMetres: [1.0], puttsPerDistance: 3, rounds: 1 },
          3.0
        ).config!,
        { sessionId: 'dr_before', startedAt: '2026-11-12T09:00:00.000Z' }
      ),
      fixedNow
    );
    const before = storage.getItem(STORAGE_KEY_V1);

    const payload = JSON.parse(exportText([drRecord('dr1', 3, 1)]));
    payload.settings.maxUsableDistanceMetres = 9;
    const result = validateImportText(JSON.stringify(payload));
    expect(result.valid).toBe(false);
    // Validation is in-memory only: storage is byte-for-byte identical.
    expect(storage.getItem(STORAGE_KEY_V1)).toBe(before);
    expect(validateImportText('garbage').valid).toBe(false);
    expect(storage.getItem(STORAGE_KEY_V1)).toBe(before);
  });
});

describe('confirmed import replacement', () => {
  it('replaces settings and history, keeps the active session, and survives reload', () => {
    const storage = new MemoryStorage();
    const service = new SettingsStorageService(storage);
    service.loadSettings(fixedNow);
    service.saveActiveSession(
      createDistanceRoundsSession(
        validateDistanceRoundsSetup(
          { distancesMetres: [1.0], puttsPerDistance: 3, rounds: 1 },
          3.0
        ).config!,
        { sessionId: 'active_1', startedAt: '2026-11-12T09:00:00.000Z' }
      ),
      fixedNow
    );

    const imported = validateImportText(exportText([drRecord('dr1', 4, 1), paceRecord('pc1')]));
    const result = service.replaceWithImportedData(
      imported.settings!,
      imported.history!,
      fixedNow
    );
    expect(result.replaced).toBe(true);
    expect(result.savedToStorage).toBe(true);

    const reloaded = new SettingsStorageService(storage).loadSettings(fixedNow);
    expect(reloaded.settings).toEqual(customSettings);
    expect(reloaded.history.map((r) => r.sessionId)).toEqual(['dr1', 'pc1']);
    expect(reloaded.activeSession?.sessionId).toBe('active_1');
  });

  it('rolls back and reports failure when the storage write fails', () => {
    const storage = new MemoryStorage();
    const service = new SettingsStorageService(storage);
    service.loadSettings(fixedNow);
    service.saveActiveSession(null, fixedNow);
    const before = storage.getItem(STORAGE_KEY_V1);

    storage.failWrites = true;
    const result = service.replaceWithImportedData(customSettings, [drRecord('dr1', 4, 1)], fixedNow);
    expect(result.replaced).toBe(false);
    expect(result.history).toHaveLength(0);
    expect(storage.getItem(STORAGE_KEY_V1)).toBe(before);
    expect(service.loadSettings(fixedNow).settings).toEqual(DEFAULT_MAT_SETTINGS);
  });

  it('blocks import while unreadable data is preserved', () => {
    const storage = new MemoryStorage();
    storage.store.set(STORAGE_KEY_V1, '{broken');
    // Backup writes fail by making every write throw after the corrupt value is seeded.
    storage.failWrites = true;
    const service = new SettingsStorageService(storage);
    const loaded = service.loadSettings(fixedNow);
    expect(loaded.health).toBe('corrupted_preserved_locked');

    const result = service.replaceWithImportedData(customSettings, [], fixedNow);
    expect(result.replaced).toBe(false);
    expect(storage.getItem(STORAGE_KEY_V1)).toBe('{broken');
  });
});

describe('history deletion and personal best recalculation', () => {
  function seededService() {
    const storage = new MemoryStorage();
    const service = new SettingsStorageService(storage);
    service.loadSettings(fixedNow);
    const history = [drRecord('dr_low', 2, 1), drRecord('dr_best', 5, 2), ladderRecord('pl1')];
    const imported = validateImportText(exportText(history));
    service.replaceWithImportedData(imported.settings!, imported.history!, fixedNow);
    return { service, storage };
  }

  it('deleting the personal best promotes the next best for the same configKey', () => {
    const { service } = seededService();
    const before = service.loadSettings(fixedNow).history;
    expect(getPersonalBestSessionIds(before).has('dr_best')).toBe(true);

    const result = service.deleteCompletedSession('dr_best', fixedNow);
    expect(result.deleted).toBe(true);
    expect(result.history.map((r) => r.sessionId)).toEqual(['dr_low', 'pl1']);

    const ids = getPersonalBestSessionIds(result.history);
    expect(ids.has('dr_low')).toBe(true);
    expect(ids.has('dr_best')).toBe(false);
    // Other setups' bests are unaffected.
    expect(ids.has('pl1')).toBe(true);
    const groups = buildPersonalBestGroups(result.history);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.best.sessionId === 'dr_low')?.sessionCount).toBe(1);
  });

  it('deleting the only session of a setup removes its personal best group', () => {
    const { service } = seededService();
    const result = service.deleteCompletedSession('pl1', fixedNow);
    expect(buildPersonalBestGroups(result.history).map((g) => g.mode)).toEqual([
      'distance_rounds',
    ]);
  });

  it('persists deletion and leaves the active session unaffected', () => {
    const { service, storage } = seededService();
    const active = createDistanceRoundsSession(
      validateDistanceRoundsSetup(
        { distancesMetres: [1.5], puttsPerDistance: 3, rounds: 1 },
        3.0
      ).config!,
      { sessionId: 'active_9', startedAt: '2026-11-12T13:00:00.000Z' }
    );
    const withActive = recordDistanceRoundsPutt(active, 'made');
    service.saveActiveSession(withActive, fixedNow);

    const result = service.deleteCompletedSession('dr_low', fixedNow);
    expect(result.deleted).toBe(true);
    expect(result.activeSession).toEqual(withActive);

    const reloaded = new SettingsStorageService(storage).loadSettings(fixedNow);
    expect(reloaded.history.map((r) => r.sessionId)).toEqual(['dr_best', 'pl1']);
    expect(reloaded.activeSession).toEqual(withActive);
  });

  it('refuses to delete a session that is still the open summary and unknown ids', () => {
    const { service } = seededService();
    const record = drRecord('summary_open', 3, 3);
    const config = (record as Extract<CompletedSessionRecord, { mode: 'distance_rounds' }>).config;
    let session = createDistanceRoundsSession(config, { sessionId: 'summary_open' });
    for (let i = 0; i < 6; i += 1) {
      session = recordDistanceRoundsPutt(session, 'made');
    }
    service.saveActiveSession(session, fixedNow);

    const blocked = service.deleteCompletedSession('summary_open', fixedNow);
    expect(blocked.deleted).toBe(false);
    expect(blocked.history.some((r) => r.sessionId === 'summary_open')).toBe(true);
    expect(service.deleteCompletedSession('nope', fixedNow).deleted).toBe(false);
  });

  it('filters history by game mode', () => {
    const history = [drRecord('a', 3, 1), ladderRecord('b'), paceRecord('c'), drRecord('d', 1, 2)];
    expect(filterHistoryByMode(history, 'all')).toHaveLength(4);
    expect(filterHistoryByMode(history, 'distance_rounds').map((r) => r.sessionId)).toEqual([
      'a',
      'd',
    ]);
    expect(filterHistoryByMode(history, 'putting_ladder')).toHaveLength(1);
    expect(filterHistoryByMode(history, 'pace_control')).toHaveLength(1);
  });
});
