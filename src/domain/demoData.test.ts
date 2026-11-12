import { describe, expect, it } from 'vitest';
import { validateImportText, buildExportPayload, serializeExport } from '../storage/dataTransfer';
import { DEFAULT_MAT_SETTINGS } from './matSettings';
import { DEMO_SESSION_ID_PREFIX, buildDemoHistory, isDemoRecord } from './demoData';

describe('demo data', () => {
  const demo = buildDemoHistory();

  it('contains completed sample sessions for all three modes', () => {
    expect(new Set(demo.map((r) => r.mode))).toEqual(
      new Set(['distance_rounds', 'putting_ladder', 'pace_control'])
    );
    for (const record of demo) {
      expect(record.completedAt).toBeTruthy();
      expect(record.sessionId.startsWith(DEMO_SESSION_ID_PREFIX)).toBe(true);
      expect(isDemoRecord(record)).toBe(true);
    }
  });

  it('is deterministic and structurally valid (passes the real import validator)', () => {
    expect(buildDemoHistory()).toEqual(demo);
    const text = serializeExport(buildExportPayload(DEFAULT_MAT_SETTINGS, demo));
    expect(validateImportText(text).valid).toBe(true);
  });

  it('has fully completed sessions (ladder clears and budget exhaustion)', () => {
    const ladders = demo.filter((r) => r.mode === 'putting_ladder');
    expect(ladders.map((r) => r.summary.completionReason).sort()).toEqual([
      'budget_exhausted',
      'ladder_cleared',
    ]);
  });
});

import { describeSessionChange } from './announcements';
import { createPaceControlSession, recordPaceControlPutt, undoLastPaceControlPutt } from './paceControl';

describe('session announcements', () => {
  const config = {
    mode: 'pace_control',
    unit: 'm',
    targetDistancesMetres: [1.5],
    zoneDepthMetres: 0.3,
    puttsPerDistance: 3,
  } as const;

  it('announces logging, completion and undo', () => {
    const start = createPaceControlSession(config);
    expect(describeSessionChange(null, start)).toBe('Session started.');
    const one = recordPaceControlPutt(start, 'short');
    expect(describeSessionChange(start, one)).toBe('Putt 1 logged: Short at 1.5m.');
    const two = recordPaceControlPutt(one, 'in_zone');
    const three = recordPaceControlPutt(two, 'in_zone');
    expect(describeSessionChange(two, three)).toContain('Session complete. 2 of 3 putts in zone.');
    const undone = undoLastPaceControlPutt(three);
    expect(describeSessionChange(three, undone)).toBe('Putt 3 undone. Session reopened.');
    expect(describeSessionChange(undone, null)).toBe('Session closed.');
  });
});
