import { describe, expect, it } from 'vitest';
import {
  areConfigsComparable,
  getConfigKey,
  getPaceControlConfigKey,
} from './configKey';
import {
  buildCompletedPaceControlRecord,
  calculatePaceControlSummary,
  createPaceControlSession,
  getCurrentPaceTargetStep,
  recordPaceControlPutt,
  undoLastPaceControlPutt,
  validatePaceControlSetup,
} from './paceControl';
import {
  evaluatePersonalBestForSession,
  getPersonalBestForConfigKey,
  removeCompletedSessionById,
  upsertCompletedSession,
} from './personalBests';
import {
  CompletedSessionRecord,
  PaceControlConfig,
  PaceControlSessionState,
  PaceOutcome,
} from './types';

function makeConfig(
  distances: number[] = [1.5, 2.0],
  puttsPerDistance = 3,
  zone = 0.3
): PaceControlConfig {
  const result = validatePaceControlSetup(
    {
      targetDistancesMetres: distances,
      zoneDepthMetres: zone,
      puttsPerDistance,
    },
    3.0
  );
  if (!result.config) throw new Error(result.errors.join(' '));
  return result.config;
}

function play(
  session: PaceControlSessionState,
  outcomes: PaceOutcome[]
): PaceControlSessionState {
  let s = session;
  outcomes.forEach((o, i) => {
    s = recordPaceControlPutt(s, o, {
      recordedAt: `2026-11-12T20:00:${String(i).padStart(2, '0')}.000Z`,
    });
  });
  return s;
}

describe('Pace Control setup validation & configKey', () => {
  it('accepts valid setup and normalizes distances', () => {
    const result = validatePaceControlSetup(
      { targetDistancesMetres: [2.5, 1.5, 2.0], zoneDepthMetres: 0.3, puttsPerDistance: 5 },
      3.0
    );
    expect(result.valid).toBe(true);
    expect(result.config?.targetDistancesMetres).toEqual([1.5, 2.0, 2.5]);
  });

  it('rejects distances beyond usable distance, below 0.5m, duplicates, and empty lists', () => {
    expect(
      validatePaceControlSetup(
        { targetDistancesMetres: [1.0, 2.8], zoneDepthMetres: 0.3, puttsPerDistance: 5 },
        2.6
      ).valid
    ).toBe(false);
    expect(
      validatePaceControlSetup(
        { targetDistancesMetres: [0.4], zoneDepthMetres: 0.3, puttsPerDistance: 5 },
        3.0
      ).valid
    ).toBe(false);
    expect(
      validatePaceControlSetup(
        { targetDistancesMetres: [3.1], zoneDepthMetres: 0.3, puttsPerDistance: 5 },
        3.0
      ).valid
    ).toBe(false);
    expect(
      validatePaceControlSetup(
        { targetDistancesMetres: [1.5, 1.5], zoneDepthMetres: 0.3, puttsPerDistance: 5 },
        3.0
      ).valid
    ).toBe(false);
    expect(
      validatePaceControlSetup(
        { targetDistancesMetres: [], zoneDepthMetres: 0.3, puttsPerDistance: 5 },
        3.0
      ).valid
    ).toBe(false);
  });

  it('rejects invalid zone depths and putts per distance', () => {
    for (const zone of [0.1, 0.25, 0.7, Number.NaN]) {
      expect(
        validatePaceControlSetup(
          { targetDistancesMetres: [1.5], zoneDepthMetres: zone, puttsPerDistance: 5 },
          3.0
        ).valid
      ).toBe(false);
    }
    expect(
      validatePaceControlSetup(
        { targetDistancesMetres: [1.5], zoneDepthMetres: 0.2, puttsPerDistance: 4 },
        3.0
      ).valid
    ).toBe(false);
    for (const zone of [0.2, 0.3, 0.4, 0.5, 0.6]) {
      expect(
        validatePaceControlSetup(
          { targetDistancesMetres: [1.5], zoneDepthMetres: zone, puttsPerDistance: 10 },
          3.0
        ).valid
      ).toBe(true);
    }
  });

  it('produces the canonical configKey regardless of distance order', () => {
    const a = getPaceControlConfigKey({
      targetDistancesMetres: [2.5, 1.5, 2.0],
      zoneDepthMetres: 0.3,
      puttsPerDistance: 5,
    });
    const b = getPaceControlConfigKey({
      targetDistancesMetres: [1.5, 2.0, 2.5],
      zoneDepthMetres: 0.3,
      puttsPerDistance: 5,
    });
    expect(a).toBe('pace_control:v1:unit=m:d=1.5,2.0,2.5:zone=0.3:putts=5');
    expect(a).toBe(b);
    expect(getConfigKey(makeConfig([1.5, 2.0, 2.5], 5))).toBe(a);
  });

  it('treats different zone depth or putts per distance as non-comparable', () => {
    expect(areConfigsComparable(makeConfig([1.5], 5, 0.3), makeConfig([1.5], 5, 0.3))).toBe(true);
    expect(areConfigsComparable(makeConfig([1.5], 5, 0.3), makeConfig([1.5], 5, 0.4))).toBe(false);
    expect(areConfigsComparable(makeConfig([1.5], 5, 0.3), makeConfig([1.5], 3, 0.3))).toBe(false);
  });
});

describe('Pace Control progression & dispersion', () => {
  it('advances distance by distance and completes after the final putt', () => {
    let s = createPaceControlSession(makeConfig([1.5, 2.0], 3), { sessionId: 'pc1' });
    expect(getCurrentPaceTargetStep(s)).toMatchObject({
      distanceMetres: 1.5,
      puttInSetNumber: 1,
      attemptNumber: 1,
      totalAttempts: 6,
    });

    s = play(s, ['short', 'in_zone', 'long']);
    expect(s.status).toBe('in_progress');
    expect(getCurrentPaceTargetStep(s)).toMatchObject({
      distanceMetres: 2.0,
      distanceNumber: 2,
      puttInSetNumber: 1,
    });

    s = play(s, ['in_zone', 'in_zone']);
    expect(s.status).toBe('in_progress');
    s = recordPaceControlPutt(s, 'short');
    expect(s.status).toBe('completed');
    expect(s.completedAt).not.toBeNull();
    expect(s.attempts[3].distanceMetres).toBe(2.0);
  });

  it('ignores duplicate submissions after completion', () => {
    const done = play(createPaceControlSession(makeConfig([1.5], 3)), [
      'in_zone',
      'in_zone',
      'in_zone',
    ]);
    expect(done.status).toBe('completed');
    expect(recordPaceControlPutt(done, 'short')).toBe(done);
  });

  it('computes points, counts and dispersion per distance and overall', () => {
    const s = play(createPaceControlSession(makeConfig([1.5, 2.0], 3)), [
      'short',
      'in_zone',
      'long',
      'in_zone',
      'in_zone',
      'short',
    ]);
    const summary = calculatePaceControlSummary(s);
    expect(summary.totalPoints).toBe(3);
    expect(summary.maxPossiblePoints).toBe(6);
    expect(summary.counts).toEqual({ short: 2, inZone: 3, long: 1 });
    expect(summary.percentages).toEqual({ short: 33.3, inZone: 50, long: 16.7 });
    expect(summary.byDistance[0]).toMatchObject({
      distanceMetres: 1.5,
      attempts: 3,
      points: 1,
      counts: { short: 1, inZone: 1, long: 1 },
      percentages: { short: 33.3, inZone: 33.3, long: 33.3 },
    });
    expect(summary.byDistance[1]).toMatchObject({
      distanceMetres: 2.0,
      points: 2,
      percentages: { short: 33.3, inZone: 66.7, long: 0 },
    });
  });

  it('returns zero percentages when nothing is logged', () => {
    const summary = calculatePaceControlSummary(
      createPaceControlSession(makeConfig([1.5], 3))
    );
    expect(summary.percentages).toEqual({ short: 0, inZone: 0, long: 0 });
    expect(summary.totalPoints).toBe(0);
  });

  it('undoes mid-session putts and is a no-op with no putts', () => {
    const fresh = createPaceControlSession(makeConfig([1.5], 3));
    expect(undoLastPaceControlPutt(fresh)).toBe(fresh);
    const s = undoLastPaceControlPutt(play(fresh, ['short', 'long']));
    expect(s.attempts).toHaveLength(1);
    expect(s.attempts[0].outcome).toBe('short');
  });
});

describe('Pace Control personal bests & post-final-putt undo', () => {
  const config = makeConfig([1.5], 3);

  function completed(id: string, outcomes: PaceOutcome[], at: string) {
    const s = play(createPaceControlSession(config, { sessionId: id }), outcomes);
    return buildCompletedPaceControlRecord({ ...s, completedAt: at });
  }

  it('ranks comparable sessions by points and keeps the earliest on ties', () => {
    const low = completed('a', ['short', 'short', 'in_zone'], '2026-11-12T10:00:00.000Z');
    const high = completed('b', ['in_zone', 'in_zone', 'long'], '2026-11-12T11:00:00.000Z');
    const tie = completed('c', ['in_zone', 'long', 'in_zone'], '2026-11-12T12:00:00.000Z');

    expect(getPersonalBestForConfigKey([low, high], low.configKey)?.sessionId).toBe('b');
    expect(getPersonalBestForConfigKey([high, tie], low.configKey)?.sessionId).toBe('b');

    const evalNew = evaluatePersonalBestForSession([low], high);
    expect(evalNew.status).toBe('new_personal_best');
    expect(evalNew.pointsDeltaFromPreviousBest).toBe(1);
    expect(evaluatePersonalBestForSession([high], tie).status).toBe('tied_personal_best');
    expect(evaluatePersonalBestForSession([high], low).status).toBe('below_personal_best');
    expect(evaluatePersonalBestForSession([], low).status).toBe('first_for_config');
  });

  it('does not compare sessions with a different configKey', () => {
    const other = buildCompletedPaceControlRecord({
      ...play(
        createPaceControlSession(makeConfig([1.5], 3, 0.4), { sessionId: 'z' }),
        ['in_zone', 'in_zone', 'in_zone']
      ),
    });
    const mine = completed('a', ['short', 'short', 'short'], '2026-11-12T10:00:00.000Z');
    expect(evaluatePersonalBestForSession([other], mine).status).toBe('first_for_config');
  });

  it('Undo right after the final putt reopens the session and updates history & PB without duplicates', () => {
    let history: CompletedSessionRecord[] = [];
    let s = play(createPaceControlSession(config, { sessionId: 'pc_undo' }), [
      'in_zone',
      'in_zone',
      'in_zone',
    ]);
    expect(s.status).toBe('completed');
    history = upsertCompletedSession(history, buildCompletedPaceControlRecord(s));
    expect(getPersonalBestForConfigKey(history, s.configKey)).toMatchObject({
      summary: { totalPoints: 3 },
    });

    s = undoLastPaceControlPutt(s);
    expect(s.status).toBe('in_progress');
    expect(s.completedAt).toBeNull();
    history = removeCompletedSessionById(history, s.sessionId);
    expect(history).toHaveLength(0);

    s = recordPaceControlPutt(s, 'long');
    expect(s.status).toBe('completed');
    history = upsertCompletedSession(history, buildCompletedPaceControlRecord(s));
    history = upsertCompletedSession(history, buildCompletedPaceControlRecord(s));
    expect(history).toHaveLength(1);
    expect(getPersonalBestForConfigKey(history, s.configKey)).toMatchObject({
      summary: { totalPoints: 2, counts: { short: 0, inZone: 2, long: 1 } },
    });
  });
});
