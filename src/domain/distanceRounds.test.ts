import { describe, expect, it } from 'vitest';
import {
  areConfigsComparable,
  getConfigKey,
  getDistanceRoundsConfigKey,
} from './configKey';
import {
  buildCompletedDistanceRoundsRecord,
  calculateDistanceRoundsSummary,
  createDistanceRoundsSession,
  getCurrentTargetStep,
  recordDistanceRoundsPutt,
  undoLastDistanceRoundsPutt,
  updateLastMissedPuttDetails,
  validateDistanceRoundsSetup,
} from './distanceRounds';
import {
  evaluatePersonalBestForSession,
  getPersonalBestForConfigKey,
  removeCompletedSessionById,
  upsertCompletedSession,
} from './personalBests';

describe('configKey & comparability', () => {
  it('produces identical canonical configKey regardless of input distance order', () => {
    const keyA = getDistanceRoundsConfigKey({
      distancesMetres: [2.5, 1.0, 2.0, 1.5],
      puttsPerDistance: 5,
      rounds: 1,
    });
    const keyB = getDistanceRoundsConfigKey({
      distancesMetres: [1.0, 1.5, 2.0, 2.5],
      puttsPerDistance: 5,
      rounds: 1,
    });

    expect(keyA).toBe('distance_rounds:v1:unit=m:d=1.0,1.5,2.0,2.5:putts=5:rounds=1:pts=1');
    expect(keyA).toBe(keyB);
  });

  it('distinguishes configs with different distances, puttsPerDistance, or rounds', () => {
    const baseVal = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 2.0], puttsPerDistance: 3, rounds: 1 },
      3.0
    ).config!;
    const diffDist = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 2.5], puttsPerDistance: 3, rounds: 1 },
      3.0
    ).config!;
    const diffPutts = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 2.0], puttsPerDistance: 5, rounds: 1 },
      3.0
    ).config!;
    const diffRounds = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 2.0], puttsPerDistance: 3, rounds: 2 },
      3.0
    ).config!;

    expect(areConfigsComparable(baseVal, diffDist)).toBe(false);
    expect(areConfigsComparable(baseVal, diffPutts)).toBe(false);
    expect(areConfigsComparable(baseVal, diffRounds)).toBe(false);
    expect(getConfigKey(baseVal)).toBe(
      'distance_rounds:v1:unit=m:d=1.0,2.0:putts=3:rounds=1:pts=1'
    );
  });
});

describe('validateDistanceRoundsSetup', () => {
  it('validates all challenge distances against maxUsableDistanceMetres (0.5m <= d <= maxUsableDistanceMetres <= 3.0m)', () => {
    const valid = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 1.8, 2.5], puttsPerDistance: 5, rounds: 2 },
      2.6
    );
    expect(valid.valid).toBe(true);
    expect(valid.config?.distancesMetres).toEqual([1.0, 1.8, 2.5]);

    const exceedsUsable = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 2.8], puttsPerDistance: 5, rounds: 1 },
      2.6
    );
    expect(exceedsUsable.valid).toBe(false);
    expect(exceedsUsable.errors[0]).toContain('exceeds your configured usable mat distance');

    const exceedsPhysicalMat = validateDistanceRoundsSetup(
      { distancesMetres: [1.0, 3.2], puttsPerDistance: 5, rounds: 1 },
      3.0
    );
    expect(exceedsPhysicalMat.valid).toBe(false);

    const belowMin = validateDistanceRoundsSetup(
      { distancesMetres: [0.4, 1.5], puttsPerDistance: 3, rounds: 1 },
      3.0
    );
    expect(belowMin.valid).toBe(false);
  });

  it('rejects unsupported puttsPerDistance or rounds options', () => {
    const badPutts = validateDistanceRoundsSetup(
      { distancesMetres: [1.5], puttsPerDistance: 4, rounds: 1 },
      3.0
    );
    expect(badPutts.valid).toBe(false);

    const badRounds = validateDistanceRoundsSetup(
      { distancesMetres: [1.5], puttsPerDistance: 5, rounds: 4 },
      3.0
    );
    expect(badRounds.valid).toBe(false);
  });
});

describe('Distance Rounds gameplay, miss tagging, duplicate protection, and Undo', () => {
  const twoDistConfig = validateDistanceRoundsSetup(
    { distancesMetres: [1.0, 2.0], puttsPerDistance: 3, rounds: 1 },
    3.0
  ).config!; // 6 total putts

  it('steps through distances, supports independent optional miss tags, and prevents duplicate submission after completion', () => {
    let session = createDistanceRoundsSession(twoDistConfig, {
      sessionId: 'session_1',
      startedAt: '2026-11-12T10:00:00.000Z',
    });

    expect(getCurrentTargetStep(session)).toMatchObject({
      isComplete: false,
      attemptNumber: 1,
      totalAttempts: 6,
      roundNumber: 1,
      distanceMetres: 1.0,
      puttInSetNumber: 1,
    });

    // Log 3 putts at 1.0m: Made, Missed (tagged left + short), Made
    session = recordDistanceRoundsPutt(session, 'made');
    session = recordDistanceRoundsPutt(session, 'missed');
    session = updateLastMissedPuttDetails(session, {
      direction: 'left',
      distance: 'short',
    });
    expect(session.attempts[1].missDetails).toEqual({
      direction: 'left',
      distance: 'short',
    });
    session = recordDistanceRoundsPutt(session, 'made');

    // Now on 2.0m (putt 4 of 6)
    expect(getCurrentTargetStep(session)).toMatchObject({
      isComplete: false,
      attemptNumber: 4,
      distanceMetres: 2.0,
      puttInSetNumber: 1,
    });

    // Log 3 putts at 2.0m: Missed (direction only: right), Missed (distance only: long), Made
    session = recordDistanceRoundsPutt(session, 'missed', {
      missDetails: { direction: 'right' },
    });
    session = recordDistanceRoundsPutt(session, 'missed', {
      missDetails: { distance: 'long' },
    });
    session = recordDistanceRoundsPutt(session, 'made', {
      recordedAt: '2026-11-12T10:05:00.000Z',
    });

    expect(session.status).toBe('completed');
    expect(session.completedAt).toBe('2026-11-12T10:05:00.000Z');
    expect(session.attempts).toHaveLength(6);

    // Duplicate-submission protection: further record calls do nothing
    const afterDuplicate = recordDistanceRoundsPutt(session, 'made');
    expect(afterDuplicate).toBe(session);
    expect(afterDuplicate.attempts).toHaveLength(6);

    const summary = calculateDistanceRoundsSummary(session);
    expect(summary.totalPoints).toBe(3);
    expect(summary.maxPossiblePoints).toBe(6);
    expect(summary.totalMakes).toBe(3);
    expect(summary.totalAttempts).toBe(6);
    expect(summary.overallMakePercentage).toBe(50.0);
    expect(summary.byDistance).toEqual([
      {
        distanceMetres: 1.0,
        makes: 2,
        attempts: 3,
        makePercentage: 66.7,
        points: 2,
      },
      {
        distanceMetres: 2.0,
        makes: 1,
        attempts: 3,
        makePercentage: 33.3,
        points: 1,
      },
    ]);
    expect(summary.missBreakdown).toEqual({
      totalMisses: 3,
      directionCounts: { left: 1, center: 0, right: 1, untagged: 1 },
      distanceCounts: { short: 1, good: 0, long: 1, untagged: 1 },
    });
  });

  it('reopens a completed session on post-final-putt Undo and updates history & personal best without duplicates', () => {
    const shortConfig = validateDistanceRoundsSetup(
      { distancesMetres: [1.5], puttsPerDistance: 3, rounds: 1 },
      3.0
    ).config!; // 3 putts total

    // Prior completed session with 2 pts
    let priorSession = createDistanceRoundsSession(shortConfig, {
      sessionId: 'prior_session',
      startedAt: '2026-11-12T09:00:00.000Z',
    });
    priorSession = recordDistanceRoundsPutt(priorSession, 'made');
    priorSession = recordDistanceRoundsPutt(priorSession, 'made');
    priorSession = recordDistanceRoundsPutt(priorSession, 'missed', {
      recordedAt: '2026-11-12T09:02:00.000Z',
    });
    const priorRecord = buildCompletedDistanceRoundsRecord(priorSession);

    let history = upsertCompletedSession([], priorRecord);
    expect(getPersonalBestForConfigKey(history, shortConfigKey(shortConfig))?.summary.totalPoints).toBe(2);

    // Current session: user accidentally taps Made on final putt for 3/3 (3 pts)
    let active = createDistanceRoundsSession(shortConfig, {
      sessionId: 'current_session',
      startedAt: '2026-11-12T10:00:00.000Z',
    });
    active = recordDistanceRoundsPutt(active, 'made');
    active = recordDistanceRoundsPutt(active, 'made');
    active = recordDistanceRoundsPutt(active, 'made', {
      recordedAt: '2026-11-12T10:02:00.000Z',
    });

    expect(active.status).toBe('completed');
    const initialCompletedRecord = buildCompletedDistanceRoundsRecord(active);
    history = upsertCompletedSession(history, initialCompletedRecord);

    expect(history).toHaveLength(2);
    expect(getPersonalBestForConfigKey(history, active.configKey)?.sessionId).toBe(
      'current_session'
    );
    expect(
      getPersonalBestForConfigKey(history, active.configKey)?.summary.totalPoints
    ).toBe(3);

    // User immediately triggers Undo after final putt!
    active = undoLastDistanceRoundsPutt(active);
    history = removeCompletedSessionById(history, active.sessionId);

    expect(active.status).toBe('in_progress');
    expect(active.completedAt).toBeNull();
    expect(active.attempts).toHaveLength(2);
    // History no longer has the premature completion, and PB reverts to prior_session (2 pts)
    expect(history).toHaveLength(1);
    expect(getPersonalBestForConfigKey(history, active.configKey)?.sessionId).toBe(
      'prior_session'
    );
    expect(
      getPersonalBestForConfigKey(history, active.configKey)?.summary.totalPoints
    ).toBe(2);

    // User now logs the true final putt outcome ('missed') -> 2/3 (2 pts)
    active = recordDistanceRoundsPutt(active, 'missed', {
      recordedAt: '2026-11-12T10:03:00.000Z',
    });
    expect(active.status).toBe('completed');
    const updatedCompletedRecord = buildCompletedDistanceRoundsRecord(active);
    history = upsertCompletedSession(history, updatedCompletedRecord);

    // Verify no duplicate history entries and updated PB evaluation
    expect(history).toHaveLength(2);
    expect(
      history.filter((r) => r.sessionId === 'current_session')
    ).toHaveLength(1);
    expect(
      history.find((r) => r.sessionId === 'current_session')?.summary.totalPoints
    ).toBe(2);

    const pbEval = evaluatePersonalBestForSession(history, updatedCompletedRecord);
    expect(pbEval.status).toBe('tied_personal_best');
    expect(pbEval.bestRecord.summary.totalPoints).toBe(2);
  });
});

function shortConfigKey(config: Parameters<typeof getConfigKey>[0]): string {
  return getConfigKey(config);
}
