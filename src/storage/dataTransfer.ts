import { MatSettings } from '../domain/matSettings';
import { CompletedSessionRecord, GameMode } from '../domain/types';
import { parseAndValidateEnvelope } from './settingsStorage';

export const EXPORT_APP_ID = 'golf-challenge';

export interface ExportPayloadV1 {
  readonly schemaVersion: 1;
  readonly app: typeof EXPORT_APP_ID;
  readonly exportedAt: string;
  readonly updatedAt: string;
  readonly settings: MatSettings;
  readonly history: readonly CompletedSessionRecord[];
}

export interface ImportPreview {
  readonly exportedAt: string | null;
  readonly settings: MatSettings;
  readonly sessionCount: number;
  readonly countsByMode: Readonly<Record<GameMode, number>>;
  readonly comparableConfigCount: number;
}

export interface ImportValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly settings?: MatSettings;
  readonly history?: readonly CompletedSessionRecord[];
  readonly preview?: ImportPreview;
}

export function buildExportPayload(
  settings: MatSettings,
  history: readonly CompletedSessionRecord[],
  now: () => Date = () => new Date()
): ExportPayloadV1 {
  const timestamp = now().toISOString();
  return {
    schemaVersion: 1,
    app: EXPORT_APP_ID,
    exportedAt: timestamp,
    updatedAt: timestamp,
    settings,
    history,
  };
}

export function serializeExport(payload: ExportPayloadV1): string {
  return JSON.stringify(payload, null, 2);
}

export function buildExportFileName(now: () => Date = () => new Date()): string {
  return `golf-challenge-backup-${now().toISOString().slice(0, 10)}.json`;
}

/**
 * Validates import text entirely in memory. Never touches storage. Reuses the same
 * validators as storage loading (schemaVersion, mat settings <= 3.0m, every session record).
 */
export function validateImportText(text: string): ImportValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { valid: false, errors: ['The file is not valid JSON.'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ['The file does not contain a GolfChallenge backup object.'] };
  }
  const record = parsed as Record<string, unknown>;
  if (record.settings === undefined || !Array.isArray(record.history)) {
    return {
      valid: false,
      errors: ['A backup must include both "settings" and a "history" list.'],
    };
  }

  const result = parseAndValidateEnvelope(text);
  if (!result.valid || !result.envelope) {
    return { valid: false, errors: [result.reason ?? 'The backup could not be validated.'] };
  }

  const history = result.envelope.history ?? [];
  const countsByMode: Record<GameMode, number> = {
    distance_rounds: 0,
    putting_ladder: 0,
    pace_control: 0,
  };
  for (const item of history) {
    countsByMode[item.mode] += 1;
  }

  return {
    valid: true,
    errors: [],
    settings: result.envelope.settings,
    history,
    preview: {
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : null,
      settings: result.envelope.settings,
      sessionCount: history.length,
      countsByMode,
      comparableConfigCount: new Set(history.map((item) => item.configKey)).size,
    },
  };
}
