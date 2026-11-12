import { describe, expect, it } from 'vitest';
import {
  areConfigsComparable,
  getConfigKey,
  getPuttingLadderConfigKey,
} from './configKey';
import {
  evaluatePersonalBestForSession,
  getPersonalBestForConfigKey,
  removeCompletedSessionById,
  upsertCompletedSession,
} from './personalBests';
import {
  buildCompletedPuttingLadderRecord,
  calculatePuttingLadderSummary,
  createPuttingLadderSession,
  getCurrentLadderTargetStep,
  recordPuttingLadderPutt,
  undoLastPuttingLadderPutt,
  updateLastPuttingLadderMissedPuttDetails,
  validatePuttingLadderSetup,
} from './puttingLadder';
import { CompletedSessionRecord } from './types';

describe('Putting Ladder configKey & setup validation', () => {
  it('produces canonical Putting Ladder configKey regardless of input distance order', () => {
    const keyA = getPuttingLadderConfigKey({
      distancesMetres: [2.5, 1.0, 2.0, 1.5],
      attemptBudget: 15,
    });
    const keyB = getPuttingLadderConfigKey({
      distancesMetres: [1.0, 1.5, 2.0, 2.5],
      attemptBudget: 15,
    });

    expect(keyA).toBe(
      'putting_ladder:v1:unit=m:d=1.0,1.5,2.0,2.5:budget=15:finish=complete'
    );
    expect(keyA).toBe(keyB);
  });

  it('distinguishes Putting Ladder configs with different distances or attemptBudget', () => {
    const baseCfg = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 1.5, 2.0], attemptBudget: 10 },
      3.0
    ).config!;
    const diffDistCfg = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 1.5, 2.5], attemptBudget: 10 },
      3.0
    ).config!;
    const diffBudgetCfg = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 1.5, 2.0], attemptBudget: 15 },
      3.0
    ).config!;

    expect(areConfigsComparable(baseCfg, diffDistCfg)).toBe(false);
    expect(areConfigsComparable(baseCfg, diffBudgetCfg)).toBe(false);
    expect(getConfigKey(baseCfg)).toBe(
      'putting_ladder:v1:unit=m:d=1.0,1.5,2.0:budget=10:finish=complete'
    );
  });

  it('requires at least 2 distances ordered shortest to longest within maxUsableDistanceMetres (<= 3.0m) and a valid attemptBudget', () => {
    const valid = validatePuttingLadderSetup(
      { distancesMetres: [2.5, 1.0, 1.8], attemptBudget: 15 },
      2.6
    );
    expect(valid.valid).toBe(true);
    expect(valid.config?.distancesMetres).toEqual([1.0, 1.8, 2.5]);

    const onlyOneDistance = validatePuttingLadderSetup(
      { distancesMetres: [1.5], attemptBudget: 15 },
      3.0
    );
    expect(onlyOneDistance.valid).toBe(false);
    expect(onlyOneDistance.errors[0]).toContain('at least 2');

    const exceedsUsable = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 2.8], attemptBudget: 15 },
      2.6
    );
    expect(exceedsUsable.valid).toBe(false);
    expect(exceedsUsable.errors[0]).toContain(
      'exceeds your configured usable mat distance'
    );

    const exceedsPhysicalMat = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 3.1], attemptBudget: 15 },
      3.0
    );
    expect(exceedsPhysicalMat.valid).toBe(false);

    const invalidBudget = validatePuttingLadderSetup(
      { distancesMetres: [1.0, 2.0], attemptBudget: 12 },
      3.0
    );
    expect(invalidBudget.valid).toBe(false);
    expect(invalidBudget.errors[0]).toContain('Attempt budget must be one of');
  });
});

describe('Putting Ladder progression, clearing final rung, and budget exhaustion', () => {
  const threeRungConfig = validatePuttingLadderSetup(
    { distancesMetres: [1.0, 1.8, 2.5], attemptBudget: 10 },
    3.0
  ).config!;

  it('advances 1 rung on Made, stays on current rung on Missed, and completes immediately as cleared when making the final distance', () => {
    let session = createPuttingLadderSession(threeRungConfig, {
      sessionId: 'pl_clear_1',
      startedAt: '2026-11-12T12:00:00.000Z',
    });

    expect(getCurrentLadderTargetStep(session)).toMatchObject({
      isComplete: false,
      cleared: false,
      attemptNumber: 1,
      attemptsUsed: 0,
      attemptsRemaining: 10,
      currentRungIndex: 0,
      currentRungNumber: 1,
      totalRungs: 3,
      rungsCompleted: 0,
      distanceMetres: 1.0,
    });

    // Attempt 1: Made at 1.0m -> advances to rung 2 (1.8m)
    session = recordPuttingLadderPutt(session, 'made');
    expect(getCurrentLadderTargetStep(session)).toMatchObject({
      isComplete: false,
      currentRungIndex: 1,
      currentRungNumber: 2,
      rungsCompleted: 1,
      distanceMetres: 1.8,
      attemptsUsed: 1,
      attemptsRemaining: 9,
    });

    // Attempt 2: Missed at 1.8m -> stays at rung 2 (1.8m), with optional miss details
    session = recordPuttingLadderPutt(session, 'missed');
    session = updateLastPuttingLadderMissedPuttDetails(session, {
      direction: 'left',
      distance: 'short',
    });
    expect(session.attempts[1].missDetails).toEqual({
      direction: 'left',
      distance: 'short',
    });
    expect(getCurrentLadderTargetStep(session)).toMatchObject({
      isComplete: false,
      currentRungIndex: 1,
      currentRungNumber: 2,
      rungsCompleted: 1,
      distanceMetres: 1.8,
      attemptsUsed: 2,
      attemptsRemaining: 8,
    });

    // Attempt 3: Made at 1.8m -> advances to final rung 3 (2.5m)
    session = recordPuttingLadderPutt(session, 'made');
    expect(getCurrentLadderTargetStep(session)).toMatchObject({
      isComplete: false,
      currentRungIndex: 2,
      currentRungNumber: 3,
      rungsCompleted: 2,
      distanceMetres: 2.5,
      attemptsUsed: 3,
      attemptsRemaining: 7,
    });

    // Attempt 4: Made at final rung 2.5m -> immediately completes ladder as cleared!
    session = recordPuttingLadderPutt(session, 'made', {
      recordedAt: '2026-11-12T12:03:00.000Z',
    });
    expect(session.status).toBe('completed');
    expect(session.completedAt).toBe('2026-11-12T12:03:00.000Z');

    // Duplicate-submission protection: extra taps after clearing are ignored
    const afterDuplicate = recordPuttingLadderPutt(session, 'made');
    expect(afterDuplicate).toBe(session);
    expect(afterDuplicate.attempts).toHaveLength(4);

    const summary = calculatePuttingLadderSummary(session);
    expect(summary.cleared).toBe(true);
    expect(summary.completionReason).toBe('ladder_cleared');
    expect(summary.rungsCompleted).toBe(3);
    expect(summary.totalRungs).toBe(3);
    expect(summary.highestDistanceClearedMetres).toBe(2.5);
    expect(summary.farthestDistanceReachedMetres).toBe(2.5);
    expect(summary.attemptsUsed).toBe(4);
    expect(summary.attemptsRemaining).toBe(6);
    expect(summary.totalMakes).toBe(3);
    expect(summary.overallMakePercentage).toBe(75.0);
    expect(summary.byRung).toEqual([
      {
        rungNumber: 1,
        distanceMetres: 1.0,
        makes: 1,
        attempts: 1,
        makePercentage: 100.0,
        cleared: true,
      },
      {
        rungNumber: 2,
        distanceMetres: 1.8,
        makes: 1,
        attempts: 2,
        makePercentage: 50.0,
        cleared: true,
      },
      {
        rungNumber: 3,
        distanceMetres: 2.5,
        makes: 1,
        attempts: 1,
        makePercentage: 100.0,
        cleared: true,
      },
    ]);
  });

  it('completes as budget_exhausted (cleared: false) when all attempts are used without clearing the final rung', () => {
    let session = createPuttingLadderSession(threeRungConfig, {
      sessionId: 'pl_exhaust_1',
      startedAt: '2026-11-12T13:00:00.000Z',
    });

    // Make Rung 1 (1.0m) on Attempt 1, then miss 9 times at Rung 2 (1.8m)
    session = recordPuttingLadderPutt(session, 'made');
    for (let i = 0; i < 8; i += 1) {
      session = recordPuttingLadderPutt(session, 'missed');
      expect(session.status).toBe('in_progress');
    }

    // 10th attempt is a miss -> exhausts budget of 10
    session = recordPuttingLadderPutt(session, 'missed', {
      missDetails: { direction: 'right', distance: 'long' },
      recordedAt: '2026-11-12T13:05:00.000Z',
    });

    expect(session.status).toBe('completed');
    expect(session.attempts).toHaveLength(10);

    // Duplicate-submission protection after budget exhaustion
    expect(recordPuttingLadderPutt(session, 'made')).toBe(session);

    const summary = calculatePuttingLadderSummary(session);
    expect(summary.cleared).toBe(false);
    expect(summary.completionReason).toBe('budget_exhausted');
    expect(summary.rungsCompleted).toBe(1);
    expect(summary.totalRungs).toBe(3);
    expect(summary.highestDistanceClearedMetres).toBe(1.0);
    expect(summary.farthestDistanceReachedMetres).toBe(1.8);
    expect(summary.attemptsUsed).toBe(10);
    expect(summary.attemptsRemaining).toBe(0);
    expect(summary.byRung[0].cleared).toBe(true);
    expect(summary.byRung[1].cleared).toBe(false);
    expect(summary.byRung[2].cleared).toBe(false);
  });
});

describe('Putting Ladder Personal Best ranking and post-final-putt Undo', () => {
  const twoRungConfig = validatePuttingLadderSetup(
    { distancesMetres: [1.0, 2.0], attemptBudget: 10 },
    3.0
  ).config!;

  it('ranks comparable Putting Ladder sessions by cleared status, then rungsCompleted, then efficiency (fewer attemptsUsed)', () => {
    // Session A: Not cleared, 1/2 rungs completed (10 attempts used)
    let sessionA = createPuttingLadderSession(twoRungConfig, {
      sessionId: 'pl_a',
      startedAt: '2026-11-12T08:00:00.000Z',
    });
    sessionA = recordPuttingLadderPutt(sessionA, 'made'); // Rung 1 cleared
    for (let i = 0; i < 9; i += 1) {
      sessionA = recordPuttingLadderPutt(sessionA, 'missed', {
        recordedAt: '2026-11-12T08:05:00.000Z',
      });
    }
    const recA = buildCompletedPuttingLadderRecord(sessionA);

    // Session B: Cleared (2/2 rungs) in 5 attempts (5 remaining)
    let sessionB = createPuttingLadderSession(twoRungConfig, {
      sessionId: 'pl_b',
      startedAt: '2026-11-12T09:00:00.000Z',
    });
    sessionB = recordPuttingLadderPutt(sessionB, 'missed');
    sessionB = recordPuttingLadderPutt(sessionB, 'made');
    sessionB = recordPuttingLadderPutt(sessionB, 'missed');
    sessionB = recordPuttingLadderPutt(sessionB, 'missed');
    sessionB = recordPuttingLadderPutt(sessionB, 'made', {
      recordedAt: '2026-11-12T09:05:00.000Z',
    });
    const recB = buildCompletedPuttingLadderRecord(sessionB);

    // Session C: Cleared (2/2 rungs) in 2 attempts (8 remaining) -> more efficient than B!
    let sessionC = createPuttingLadderSession(twoRungConfig, {
      sessionId: 'pl_c',
      startedAt: '2026-11-12T10:00:00.000Z',
    });
    sessionC = recordPuttingLadderPutt(sessionC, 'made');
    sessionC = recordPuttingLadderPutt(sessionC, 'made', {
      recordedAt: '2026-11-12T10:02:00.000Z',
    });
    const recC = buildCompletedPuttingLadderRecord(sessionC);

    let history: CompletedSessionRecord[] = [recA];
    expect(getPersonalBestForConfigKey(history, twoRungConfigKey())?.sessionId).toBe(
      'pl_a'
    );

    const evalB = evaluatePersonalBestForSession(history, recB);
    expect(evalB.status).toBe('new_personal_best');
    history = upsertCompletedSession(history, recB);
    expect(getPersonalBestForConfigKey(history, twoRungConfigKey())?.sessionId).toBe(
      'pl_b'
    );

    const evalC = evaluatePersonalBestForSession(history, recC);
    expect(evalC.status).toBe('new_personal_best');
    history = upsertCompletedSession(history, recC);
    expect(getPersonalBestForConfigKey(history, twoRungConfigKey())?.sessionId).toBe(
      'pl_c'
    );
  });

  it('reopens after final putt (both cleared and budget-exhausted) and updates history & personal best without duplicates', () => {
    let history: CompletedSessionRecord[] = [];

    // 1. User completes ladder in 2 attempts (accidental tap on 2nd putt)
    let session = createPuttingLadderSession(twoRungConfig, {
      sessionId: 'pl_undo_test',
      startedAt: '2026-11-12T14:00:00.000Z',
    });
    session = recordPuttingLadderPutt(session, 'made'); // Rung 1
    session = recordPuttingLadderPutt(session, 'made', {
      recordedAt: '2026-11-12T14:01:00.000Z',
    }); // Rung 2 -> cleared in 2 attempts!

    expect(session.status).toBe('completed');
    history = upsertCompletedSession(
      history,
      buildCompletedPuttingLadderRecord(session)
    );
    expect(history).toHaveLength(1);
    expect(
      (history[0] as ReturnType<typeof buildCompletedPuttingLadderRecord>).summary
        .attemptsUsed
    ).toBe(2);

    // 2. User immediately taps Undo Final Putt -> reopens at Rung 2, Attempt 2 of 10
    session = undoLastPuttingLadderPutt(session);
    history = removeCompletedSessionById(history, session.sessionId);

    expect(session.status).toBe('in_progress');
    expect(session.completedAt).toBeNull();
    expect(session.attempts).toHaveLength(1);
    expect(getCurrentLadderTargetStep(session)).toMatchObject({
      isComplete: false,
      currentRungNumber: 2,
      attemptNumber: 2,
      distanceMetres: 2.0,
    });
    expect(history).toHaveLength(0);

    // 3. User logs the actual outcome: Missed on attempt 2, then Made on attempt 3 -> cleared in 3 attempts
    session = recordPuttingLadderPutt(session, 'missed');
    session = recordPuttingLadderPutt(session, 'made', {
      recordedAt: '2026-11-12T14:02:00.000Z',
    });

    expect(session.status).toBe('completed');
    const updatedRecord = buildCompletedPuttingLadderRecord(session);
    history = upsertCompletedSession(history, updatedRecord);

    expect(history).toHaveLength(1);
    expect(history[0].sessionId).toBe('pl_undo_test');
    expect(updatedRecord.summary.cleared).toBe(true);
    expect(updatedRecord.summary.attemptsUsed).toBe(3);
    expect(updatedRecord.summary.attemptsRemaining).toBe(7);

    const pb = getPersonalBestForConfigKey(history, session.configKey);
    expect(pb?.sessionId).toBe('pl_undo_test');
    if (pb && pb.mode === 'putting_ladder') {
      expect(pb.summary.attemptsUsed).toBe(3);
    }

    // 4. Also verify post-final-putt Undo when completed via budget exhaustion
    let exhaustSession = createPuttingLadderSession(twoRungConfig, {
      sessionId: 'pl_undo_exhaust',
      startedAt: '2026-11-12T15:00:00.000Z',
    });
    exhaustSession = recordPuttingLadderPutt(exhaustSession, 'made'); // Rung 1
    for (let i = 0; i < 9; i += 1) {
      exhaustSession = recordPuttingLadderPutt(exhaustSession, 'missed', {
        recordedAt: '2026-11-12T15:05:00.000Z',
      });
    }
    expect(exhaustSession.status).toBe('completed');
    expect(calculatePuttingLadderSummary(exhaustSession).cleared).toBe(false);
    history = upsertCompletedSession(
      history,
      buildCompletedPuttingLadderRecord(exhaustSession)
    );
    expect(history).toHaveLength(2);

    // Undo final (10th) putt -> reopens session at Attempt 10 of 10, Rung 2
    exhaustSession = undoLastPuttingLadderPutt(exhaustSession);
    history = removeCompletedSessionById(history, exhaustSession.sessionId);
    expect(exhaustSession.status).toBe('in_progress');
    expect(exhaustSession.attempts).toHaveLength(9);
    expect(history).toHaveLength(1);

    // Now make the 10th putt -> clears ladder on Attempt 10!
    exhaustSession = recordPuttingLadderPutt(exhaustSession, 'made', {
      recordedAt: '2026-11-12T15:06:00.000Z',
    });
    expect(exhaustSession.status).toBe('completed');
    const convertedToClearRecord = buildCompletedPuttingLadderRecord(exhaustSession);
    expect(convertedToClearRecord.summary.cleared).toBe(true);
    expect(convertedToClearRecord.summary.attemptsUsed).toBe(10);
    history = upsertCompletedSession(history, convertedToClearRecord);
    expect(history).toHaveLength(2);
    expect(
      history.filter((r) => r.sessionId === 'pl_undo_exhaust')
    ).toHaveLength(1);
  });

  function twoRungConfigKey(): string {
    return getConfigKey(twoRungConfig);
  }
});
