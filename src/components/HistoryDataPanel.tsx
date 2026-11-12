import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  GAME_MODE_LABELS,
  HistoryFilter,
  buildPersonalBestGroups,
  describeRecordConfig,
  describeRecordScore,
  filterHistoryByMode,
  getPersonalBestSessionIds,
  sortNewestFirst,
} from '../domain/historyView';
import { formatMetres, MatSettings } from '../domain/matSettings';
import { ActiveSessionState, CompletedSessionRecord } from '../domain/types';
import {
  ImportValidationResult,
  buildExportFileName,
  buildExportPayload,
  serializeExport,
  validateImportText,
} from '../storage/dataTransfer';

export interface HistoryActionResult {
  readonly ok: boolean;
  readonly message: string | null;
}

interface HistoryDataPanelProps {
  readonly settings: MatSettings;
  readonly history: readonly CompletedSessionRecord[];
  readonly activeSession: ActiveSessionState | null;
  readonly onDeleteSession: (sessionId: string) => HistoryActionResult;
  readonly onImportData: (
    settings: MatSettings,
    history: readonly CompletedSessionRecord[]
  ) => HistoryActionResult;
}

const FILTERS: readonly { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'distance_rounds', label: GAME_MODE_LABELS.distance_rounds },
  { value: 'putting_ladder', label: GAME_MODE_LABELS.putting_ladder },
  { value: 'pace_control', label: GAME_MODE_LABELS.pace_control },
];

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function BreakdownTable({ record }: { record: CompletedSessionRecord }) {
  if (record.mode === 'distance_rounds') {
    return (
      <div className="distance-breakdown-table-wrap">
        <table className="distance-breakdown-table">
          <thead>
            <tr>
              <th>Distance</th>
              <th>Made</th>
              <th>Make %</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {record.summary.byDistance.map((row) => (
              <tr key={row.distanceMetres}>
                <td>{formatMetres(row.distanceMetres)}</td>
                <td>
                  {row.makes}/{row.attempts}
                </td>
                <td>{row.makePercentage}%</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (record.mode === 'putting_ladder') {
    return (
      <div className="distance-breakdown-table-wrap">
        <table className="distance-breakdown-table">
          <thead>
            <tr>
              <th>Rung</th>
              <th>Distance</th>
              <th>Made</th>
              <th>Make %</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {record.summary.byRung.map((row) => (
              <tr key={row.rungNumber}>
                <td>{row.rungNumber}</td>
                <td>{formatMetres(row.distanceMetres)}</td>
                <td>
                  {row.makes}/{row.attempts}
                </td>
                <td>{row.attempts === 0 ? '–' : `${row.makePercentage}%`}</td>
                <td>
                  {row.cleared ? 'Cleared' : row.attempts > 0 ? 'Not cleared' : 'Not reached'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="distance-breakdown-table-wrap">
      <table className="distance-breakdown-table">
        <thead>
          <tr>
            <th>Distance</th>
            <th>Short</th>
            <th>In zone</th>
            <th>Long</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {record.summary.byDistance.map((row) => (
            <tr key={row.distanceMetres}>
              <td>{formatMetres(row.distanceMetres)}</td>
              <td>
                {row.counts.short} ({row.percentages.short}%)
              </td>
              <td>
                {row.counts.inZone} ({row.percentages.inZone}%)
              </td>
              <td>
                {row.counts.long} ({row.percentages.long}%)
              </td>
              <td>{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryDataPanel({
  settings,
  history,
  activeSession,
  onDeleteSession,
  onImportData,
}: HistoryDataPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(
    null
  );
  const [importResult, setImportResult] = useState<ImportValidationResult | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => sortNewestFirst(filterHistoryByMode(history, filter)),
    [history, filter]
  );
  const pbGroups = useMemo(() => buildPersonalBestGroups(history), [history]);
  const pbSessionIds = useMemo(() => getPersonalBestSessionIds(history), [history]);

  const handleExport = () => {
    const text = serializeExport(buildExportPayload(settings, history));
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice({
      kind: 'success',
      text: `Exported ${history.length} session${history.length === 1 ? '' : 's'} and your mat settings.`,
    });
  };

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice(null);
    try {
      const text = await file.text();
      setImportResult(validateImportText(text));
    } catch {
      setImportResult({ valid: false, errors: ['The file could not be read.'] });
    }
    setImportFileName(file.name);
  };

  const cancelImport = () => {
    setImportResult(null);
    setImportFileName(null);
  };

  const confirmImport = () => {
    if (!importResult?.valid || !importResult.settings || !importResult.history) return;
    const result = onImportData(importResult.settings, importResult.history);
    setImportResult(null);
    setImportFileName(null);
    setExpandedId(null);
    setConfirmDeleteId(null);
    setNotice({
      kind: result.ok ? 'success' : 'error',
      text:
        result.message ??
        (result.ok ? 'Import complete. Saved data was replaced.' : 'Import failed.'),
    });
  };

  const handleDelete = (sessionId: string) => {
    const result = onDeleteSession(sessionId);
    setConfirmDeleteId(null);
    if (expandedId === sessionId) setExpandedId(null);
    setNotice({
      kind: result.ok ? 'success' : 'error',
      text: result.message ?? 'Session deleted. Personal bests were recalculated.',
    });
  };

  const preview = importResult?.preview;

  return (
    <section className="settings-card" aria-labelledby="history-heading">
      <div className="section-header">
        <h2 className="section-header__title" id="history-heading">
          History &amp; Data
        </h2>
        <p className="section-header__lead">
          Completed sessions, comparable personal bests, and backup. Scores are practice aids
          for tracking consistency on your home mat.
        </p>
      </div>

      {notice ? (
        <p
          className={`feedback-msg ${notice.kind === 'error' ? 'feedback-msg--error' : 'feedback-msg--success'}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="rules-explainer-box">
        <h3 className="rules-explainer-box__title">Backup &amp; restore</h3>
        <p style={{ marginBottom: 0 }}>
          Your data lives only in this browser and{' '}
          <strong>can be cleared by the browser</strong> (cleared site data, private browsing,
          storage pressure). <strong>Export is your backup</strong> — download a JSON file
          regularly and keep it somewhere safe.
        </p>
        <div className="summary-actions-row">
          <button type="button" className="btn btn--primary" onClick={handleExport}>
            Export JSON backup
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON backup…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChosen}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a JSON backup file to import"
          />
        </div>
      </div>

      {importResult && !importResult.valid ? (
        <div className="feedback-msg feedback-msg--error" role="alert">
          <strong>Import rejected{importFileName ? ` (${importFileName})` : ''}.</strong>{' '}
          Your saved data was not changed.
          <ul style={{ margin: '4px 0 0', paddingLeft: '1.25rem' }}>
            {importResult.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
          <div className="summary-actions-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={cancelImport}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {importResult?.valid && preview ? (
        <div className="undo-reopen-bar" role="region" aria-label="Import preview">
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>Import preview{importFileName ? ` — ${importFileName}` : ''}</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: '1.25rem' }}>
              <li>
                {preview.sessionCount} session{preview.sessionCount === 1 ? '' : 's'} (
                {GAME_MODE_LABELS.distance_rounds}: {preview.countsByMode.distance_rounds},{' '}
                {GAME_MODE_LABELS.putting_ladder}: {preview.countsByMode.putting_ladder},{' '}
                {GAME_MODE_LABELS.pace_control}: {preview.countsByMode.pace_control})
              </li>
              <li>
                {preview.comparableConfigCount} comparable challenge setup
                {preview.comparableConfigCount === 1 ? '' : 's'}
              </li>
              <li>
                Usable mat distance {formatMetres(preview.settings.maxUsableDistanceMetres)};
                default distances{' '}
                {preview.settings.defaultDistancesMetres.map(formatMetres).join(', ')}
              </li>
              {preview.exportedAt ? <li>Exported {formatDateTime(preview.exportedAt)}</li> : null}
            </ul>
            <p style={{ margin: '8px 0 0' }}>
              <strong>Confirming replaces</strong> your current {history.length} saved session
              {history.length === 1 ? '' : 's'} and mat settings.
              {activeSession ? ' Your session in progress is kept.' : ''}
            </p>
          </div>
          <div className="abandon-confirm-group">
            <button type="button" className="btn btn--danger" onClick={confirmImport}>
              Replace saved data
            </button>
            <button type="button" className="btn btn--secondary" onClick={cancelImport}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="field-group">
        <h3 className="field-group__label">Personal bests (comparable setups)</h3>
        <p className="field-group__hint">
          Bests are only compared between sessions with exactly the same distances and rules.
        </p>
        {pbGroups.length === 0 ? (
          <p className="field-group__hint">
            No completed sessions yet, so there are no personal bests.
          </p>
        ) : (
          <ul className="history-list" aria-label="Personal bests by setup">
            {pbGroups.map((group) => (
              <li key={group.configKey} className="history-item">
                <div className="history-item__head">
                  <div>
                    <span className="eyebrow-label">{GAME_MODE_LABELS[group.mode]}</span>
                    <strong>{describeRecordScore(group.best)}</strong>
                    <div className="field-group__hint" style={{ marginBottom: 0 }}>
                      {describeRecordConfig(group.best)}
                    </div>
                  </div>
                  <div className="history-item__meta">
                    <span>Set {formatDateTime(group.best.completedAt)}</span>
                    <span>
                      {group.sessionCount} session{group.sessionCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="field-group">
        <h3 className="field-group__label">Session history</h3>
        <div
          className="option-pill-group option-pill-group--4"
          role="group"
          aria-label="Filter by game mode"
        >
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`option-pill ${filter === item.value ? 'option-pill--active' : ''}`}
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="field-group__hint">
            {history.length === 0
              ? 'No completed sessions yet. Finish a challenge and it will appear here.'
              : 'No completed sessions for this game mode.'}
          </p>
        ) : (
          <ul className="history-list" aria-label="Completed sessions">
            {visible.map((record) => {
              const expanded = expandedId === record.sessionId;
              const isPb = pbSessionIds.has(record.sessionId);
              const isActive = activeSession?.sessionId === record.sessionId;
              const panelId = `history-detail-${record.sessionId}`;
              return (
                <li key={record.sessionId} className="history-item">
                  <div className="history-item__head">
                    <div>
                      <span className="eyebrow-label">{GAME_MODE_LABELS[record.mode]}</span>
                      <strong>{describeRecordScore(record)}</strong>
                      {isPb ? (
                        <span className="badge-available" style={{ marginLeft: 8 }}>
                          ★ Personal best
                        </span>
                      ) : null}
                      <div className="field-group__hint" style={{ marginBottom: 0 }}>
                        {describeRecordConfig(record)}
                      </div>
                    </div>
                    <div className="history-item__meta">
                      <span>{formatDateTime(record.completedAt)}</span>
                    </div>
                  </div>
                  <div className="summary-actions-row">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setExpandedId(expanded ? null : record.sessionId)}
                    >
                      {expanded ? 'Hide breakdown' : 'Show breakdown'}
                    </button>
                    {confirmDeleteId === record.sessionId ? (
                      <span className="abandon-confirm-group">
                        <span className="abandon-confirm-group__label">
                          Delete this session permanently?
                        </span>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => handleDelete(record.sessionId)}
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={isActive}
                        onClick={() => setConfirmDeleteId(record.sessionId)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {isActive ? (
                    <p className="field-group__hint" style={{ marginBottom: 0 }}>
                      This session is still open on its challenge summary; close it there to
                      delete it.
                    </p>
                  ) : null}
                  {expanded ? (
                    <div id={panelId}>
                      <BreakdownTable record={record} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
