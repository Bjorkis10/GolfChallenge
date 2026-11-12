import {
  buildCompletedDistanceRoundsRecord,
  createDistanceRoundsSession,
  recordDistanceRoundsPutt,
} from './distanceRounds';
import {
  buildCompletedPaceControlRecord,
  createPaceControlSession,
  recordPaceControlPutt,
} from './paceControl';
import {
  buildCompletedPuttingLadderRecord,
  createPuttingLadderSession,
  recordPuttingLadderPutt,
} from './puttingLadder';
import {
  CompletedSessionRecord,
  DistanceRoundsConfig,
  PaceControlConfig,
  PaceOutcome,
  PuttOutcome,
  PuttingLadderConfig,
} from './types';

/**
 * Sample sessions for the optional Demo Data preview. They are built in memory only, carry a
 * `demo_` session id prefix, and are never written to storage or included in exports.
 */
export const DEMO_SESSION_ID_PREFIX = 'demo_';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_BASE_TIME = Date.UTC(2026, 0, 5, 18, 0, 0);

function isoAt(dayOffset: number, secondsIn: number): string {
  return new Date(DEMO_BASE_TIME + dayOffset * DAY_MS + secondsIn * 1000).toISOString();
}

const DR_CONFIG: DistanceRoundsConfig = {
  mode: 'distance_rounds',
  unit: 'm',
  distancesMetres: [1.0, 1.5, 2.0, 2.5],
  puttsPerDistance: 5,
  rounds: 1,
  pointsPerMake: 1,
};

const LADDER_CONFIG: PuttingLadderConfig = {
  mode: 'putting_ladder',
  unit: 'm',
  distancesMetres: [1.0, 1.5, 2.0, 2.5],
  attemptBudget: 15,
};

const PACE_CONFIG: PaceControlConfig = {
  mode: 'pace_control',
  unit: 'm',
  targetDistancesMetres: [1.5, 2.0, 2.5],
  zoneDepthMetres: 0.3,
  puttsPerDistance: 5,
};

function demoDistanceRounds(index: number, dayOffset: number, pattern: string) {
  const startedAt = isoAt(dayOffset, 0);
  let session = createDistanceRoundsSession(DR_CONFIG, {
    sessionId: `${DEMO_SESSION_ID_PREFIX}dr_${index}`,
    startedAt,
  });
  [...pattern].forEach((ch, i) => {
    const outcome: PuttOutcome = ch === 'M' ? 'made' : 'missed';
    session = recordDistanceRoundsPutt(session, outcome, { recordedAt: isoAt(dayOffset, 20 * (i + 1)) });
  });
  return buildCompletedDistanceRoundsRecord(session);
}

function demoLadder(index: number, dayOffset: number, pattern: string) {
  let session = createPuttingLadderSession(LADDER_CONFIG, {
    sessionId: `${DEMO_SESSION_ID_PREFIX}pl_${index}`,
    startedAt: isoAt(dayOffset, 0),
  });
  [...pattern].forEach((ch, i) => {
    const outcome: PuttOutcome = ch === 'M' ? 'made' : 'missed';
    session = recordPuttingLadderPutt(session, outcome, { recordedAt: isoAt(dayOffset, 20 * (i + 1)) });
  });
  return buildCompletedPuttingLadderRecord(session);
}

function demoPace(index: number, dayOffset: number, pattern: string) {
  let session = createPaceControlSession(PACE_CONFIG, {
    sessionId: `${DEMO_SESSION_ID_PREFIX}pc_${index}`,
    startedAt: isoAt(dayOffset, 0),
  });
  const map: Record<string, PaceOutcome> = { S: 'short', Z: 'in_zone', L: 'long' };
  [...pattern].forEach((ch, i) => {
    session = recordPaceControlPutt(session, map[ch], { recordedAt: isoAt(dayOffset, 20 * (i + 1)) });
  });
  return buildCompletedPaceControlRecord(session);
}

/** M = made, X = missed (20 putts: 4 distances x 5). */
export function buildDemoHistory(): readonly CompletedSessionRecord[] {
  return [
    demoDistanceRounds(1, 0, 'MMMMXMMXXMMXXXMXXXXX'),
    demoDistanceRounds(2, 3, 'MMMMMMMXMMMXXMMXXMXX'),
    demoDistanceRounds(3, 7, 'MMMMMMMMXMMMMXMMMXXM'),
    demoLadder(1, 1, 'MXMXXMM'),
    demoLadder(2, 5, 'MXXXMXXXXMXXXXX'),
    demoPace(1, 2, 'ZSZLZZSZLZSLZLZ'),
    demoPace(2, 6, 'ZZSZZZLZZLZSZZL'),
  ];
}

export function isDemoRecord(record: { readonly sessionId: string }): boolean {
  return record.sessionId.startsWith(DEMO_SESSION_ID_PREFIX);
}
