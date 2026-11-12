import { FormEvent, useState } from 'react';
import { getPaceControlConfigKey } from '../domain/configKey';
import {
  formatMetres,
  MAX_PRESET_DISTANCES_COUNT,
  MIN_PUTTING_DISTANCE_METRES,
  MatSettings,
  roundToTenthMetre,
  validateChallengeDistance,
} from '../domain/matSettings';
import {
  buildCompletedPaceControlRecord,
  calculatePaceControlSummary,
  createPaceControlSession,
  getCurrentPaceTargetStep,
  recordPaceControlPutt,
  undoLastPaceControlPutt,
  validatePaceControlSetup,
} from '../domain/paceControl';
import {
  evaluatePersonalBestForSession,
  getPersonalBestForConfigKey,
} from '../domain/personalBests';
import {
  CompletedPaceControlRecord,
  CompletedSessionRecord,
  PaceControlConfig,
  PaceControlSessionState,
  PaceControlSummary,
  PaceDispersion,
  PaceOutcome,
  PuttsPerDistanceOption,
  VALID_PUTTS_PER_DISTANCE,
  VALID_ZONE_DEPTHS_METRES,
  ZoneDepthOption,
} from '../domain/types';

interface PaceControlFlowProps {
  readonly settings: MatSettings;
  readonly activeSession: PaceControlSessionState | null;
  readonly history: readonly CompletedSessionRecord[];
  readonly onUpdateSession: (nextSession: PaceControlSessionState | null) => void;
  readonly onAbandonSession: () => void;
  readonly onBackToChallenges: () => void;
}

const OUTCOME_LABELS: Record<PaceOutcome, string> = {
  short: 'Short',
  in_zone: 'In Zone',
  long: 'Long',
};

function formatDispersion(percentages: PaceDispersion): string {
  return `${percentages.short.toFixed(1)}% Short • ${percentages.inZone.toFixed(1)}% In Zone • ${percentages.long.toFixed(1)}% Long`;
}

function formatPaceBenchmark(summary: PaceControlSummary): string {
  return `${summary.totalPoints}/${summary.maxPossiblePoints} pts (${summary.percentages.inZone.toFixed(1)}% In Zone)`;
}

function DispersionBar({ percentages }: { readonly percentages: PaceDispersion }) {
  return (
    <div className="dispersion-bar" aria-hidden="true">
      <span
        className="dispersion-bar__seg--short"
        style={{ width: `${percentages.short}%` }}
      />
      <span
        className="dispersion-bar__seg--zone"
        style={{ width: `${percentages.inZone}%` }}
      />
      <span
        className="dispersion-bar__seg--long"
        style={{ width: `${percentages.long}%` }}
      />
    </div>
  );
}

export function PaceControlFlow({
  settings,
  activeSession,
  history,
  onUpdateSession,
  onAbandonSession,
  onBackToChallenges,
}: PaceControlFlowProps) {
  const [setupDistances, setSetupDistances] = useState<number[]>(() =>
    settings.defaultDistancesMetres.filter(
      (d) => d <= settings.maxUsableDistanceMetres
    )
  );
  const [zoneDepth, setZoneDepth] = useState<ZoneDepthOption>(0.3);
  const [puttsPerDistance, setPuttsPerDistance] =
    useState<PuttsPerDistanceOption>(5);
  const [customDistanceInput, setCustomDistanceInput] = useState<string>('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [confirmingAbandon, setConfirmingAbandon] = useState<boolean>(false);

  const validSetupDistances = setupDistances.filter(
    (d) => d >= MIN_PUTTING_DISTANCE_METRES && d <= settings.maxUsableDistanceMetres
  );

  // ---------------- SETUP VIEW ----------------
  if (!activeSession) {
    const candidateConfigKey =
      validSetupDistances.length >= 1
        ? getPaceControlConfigKey({
            targetDistancesMetres: validSetupDistances,
            zoneDepthMetres: zoneDepth,
            puttsPerDistance,
          })
        : null;

    const rawExistingPb = candidateConfigKey
      ? getPersonalBestForConfigKey(history, candidateConfigKey)
      : null;
    const existingPb: CompletedPaceControlRecord | null =
      rawExistingPb && rawExistingPb.mode === 'pace_control' ? rawExistingPb : null;

    const handleAddSetupDistance = (e: FormEvent) => {
      e.preventDefault();
      setSetupError(null);

      const trimmed = customDistanceInput.trim();
      if (!trimmed) {
        setSetupError('Enter a distance in metres (e.g., 1.8).');
        return;
      }

      const parsed = Number(trimmed);
      const singleErr = validateChallengeDistance(
        parsed,
        settings.maxUsableDistanceMetres
      );
      if (singleErr) {
        setSetupError(singleErr);
        return;
      }

      const rounded = roundToTenthMetre(parsed);
      if (validSetupDistances.includes(rounded)) {
        setSetupError(`${formatMetres(rounded)} is already a target distance.`);
        return;
      }
      if (validSetupDistances.length >= MAX_PRESET_DISTANCES_COUNT) {
        setSetupError(
          `You can include at most ${MAX_PRESET_DISTANCES_COUNT} target distances.`
        );
        return;
      }

      setSetupDistances(
        [...validSetupDistances, rounded].sort((a, b) => a - b)
      );
      setCustomDistanceInput('');
    };

    const handleRemoveSetupDistance = (distToRemove: number) => {
      setSetupError(null);
      if (validSetupDistances.length <= 1) {
        setSetupError('Pace Control needs at least 1 target distance.');
        return;
      }
      setSetupDistances(validSetupDistances.filter((d) => d !== distToRemove));
    };

    const handleUseMatDefaults = () => {
      setSetupError(null);
      setSetupDistances(
        settings.defaultDistancesMetres.filter(
          (d) => d <= settings.maxUsableDistanceMetres
        )
      );
    };

    const handleStartSession = () => {
      setSetupError(null);
      const validation = validatePaceControlSetup(
        {
          targetDistancesMetres: validSetupDistances,
          zoneDepthMetres: zoneDepth,
          puttsPerDistance,
        },
        settings.maxUsableDistanceMetres
      );
      if (!validation.valid || !validation.config) {
        setSetupError(validation.errors.join(' '));
        return;
      }
      onUpdateSession(createPaceControlSession(validation.config));
    };

    const totalPutts = validSetupDistances.length * puttsPerDistance;

    return (
      <section aria-labelledby="pc-setup-title" className="settings-card">
        <div className="challenge-flow-topbar">
          <div>
            <span className="eyebrow-label">Challenge 3 • Setup</span>
            <h2 id="pc-setup-title" className="section-header__title">
              Pace Control Setup
            </h2>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onBackToChallenges}
          >
            ← All Challenges
          </button>
        </div>

        <div className="rules-explainer-box">
          <h3 className="rules-explainer-box__title">
            How Pace Control Works &amp; Scores
          </h3>
          <ul className="challenge-card__rules">
            <li>
              <strong>Mark a target zone:</strong> with tape or a marker, mark a zone{' '}
              <strong>{formatMetres(zoneDepth)} deep</strong> centred on each target
              distance, measured from your start line.
            </li>
            <li>
              <strong>Log where the ball stops:</strong> <strong>Short</strong> (stopped
              before the zone), <strong>In Zone</strong>, or <strong>Long</strong> (stopped
              beyond it).
            </li>
            <li>
              <strong>Scoring:</strong> 1 point per In Zone putt. Short and Long score 0.
              Dispersion (% Short / In Zone / Long) is reported per distance and overall.
            </li>
            <li>
              Target distances must stay within your usable mat limit of{' '}
              <strong>{formatMetres(settings.maxUsableDistanceMetres)}</strong>.
            </li>
          </ul>
        </div>

        <div className="field-group">
          <div className="field-group__header-row">
            <label className="field-group__label" htmlFor="pc-add-distance-input">
              Target Distances ({validSetupDistances.length} of{' '}
              {MAX_PRESET_DISTANCES_COUNT} max)
            </label>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleUseMatDefaults}
            >
              Reset to Mat Defaults
            </button>
          </div>
          <p className="field-group__hint">
            Each distance must be between {formatMetres(MIN_PUTTING_DISTANCE_METRES)} and{' '}
            {formatMetres(settings.maxUsableDistanceMetres)}.
          </p>

          <div
            className="distance-chips"
            role="list"
            aria-label="Selected target distances"
          >
            {validSetupDistances.map((d) => (
              <span key={d} className="distance-chip" role="listitem">
                {formatMetres(d)}
                <button
                  type="button"
                  className="distance-chip__remove"
                  onClick={() => handleRemoveSetupDistance(d)}
                  aria-label={`Remove ${formatMetres(d)}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <form className="add-distance-row" onSubmit={handleAddSetupDistance} noValidate>
            <input
              id="pc-add-distance-input"
              type="number"
              step="0.1"
              min={MIN_PUTTING_DISTANCE_METRES}
              max={settings.maxUsableDistanceMetres}
              placeholder={`e.g. ${formatMetres(
                Math.min(1.8, settings.maxUsableDistanceMetres)
              ).replace('m', '')}`}
              value={customDistanceInput}
              onChange={(e) => {
                setCustomDistanceInput(e.target.value);
                setSetupError(null);
              }}
              className="number-input"
              aria-label={`Add target distance in metres up to ${formatMetres(
                settings.maxUsableDistanceMetres
              )}`}
            />
            <button type="submit" className="btn btn--secondary">
              + Add Distance (m)
            </button>
          </form>
        </div>

        <div className="field-group">
          <span className="field-group__label" id="pc-zone-label">
            Physical Target Zone Depth
          </span>
          <div
            className="option-pill-group option-pill-group--5"
            role="group"
            aria-labelledby="pc-zone-label"
          >
            {VALID_ZONE_DEPTHS_METRES.map((option) => (
              <button
                key={option}
                type="button"
                className={`option-pill ${zoneDepth === option ? 'option-pill--active' : ''}`}
                aria-pressed={zoneDepth === option}
                onClick={() => setZoneDepth(option)}
              >
                {formatMetres(option)}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <span className="field-group__label" id="pc-putts-label">
            Putts per Distance
          </span>
          <div
            className="option-pill-group"
            role="group"
            aria-labelledby="pc-putts-label"
          >
            {VALID_PUTTS_PER_DISTANCE.map((option) => (
              <button
                key={option}
                type="button"
                className={`option-pill ${puttsPerDistance === option ? 'option-pill--active' : ''}`}
                aria-pressed={puttsPerDistance === option}
                onClick={() => setPuttsPerDistance(option)}
              >
                {option} putts
              </button>
            ))}
          </div>
        </div>

        <div className="setup-preview-bar">
          <div>
            <div className="setup-preview-bar__title">
              <strong>{validSetupDistances.length}</strong>{' '}
              {validSetupDistances.length === 1 ? 'distance' : 'distances'} (
              {validSetupDistances.map(formatMetres).join(', ')}) • Zone:{' '}
              <strong>{formatMetres(zoneDepth)}</strong> • <strong>{totalPutts} putts</strong>{' '}
              total (max {totalPutts} pts)
            </div>
            <div className="setup-preview-bar__subtitle">
              {existingPb ? (
                <>
                  Comparable Personal Best for this exact setup:{' '}
                  <strong>{formatPaceBenchmark(existingPb.summary)}</strong>
                </>
              ) : (
                'No personal best recorded yet for this exact setup.'
              )}
            </div>
          </div>
        </div>

        {setupError && (
          <div className="feedback-msg feedback-msg--error" role="alert">
            {setupError}
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--large-action"
          onClick={handleStartSession}
        >
          Start Pace Control ({totalPutts} Putts)
        </button>
      </section>
    );
  }

  // ---------------- ACTIVE OR COMPLETED SESSION ----------------
  const liveSummary = calculatePaceControlSummary(activeSession);
  const step = getCurrentPaceTargetStep(activeSession);
  const lastAttempt =
    activeSession.attempts.length > 0
      ? activeSession.attempts[activeSession.attempts.length - 1]
      : null;

  const handleRecordOutcome = (outcome: PaceOutcome) => {
    setConfirmingAbandon(false);
    onUpdateSession(recordPaceControlPutt(activeSession, outcome));
  };

  const handleUndo = () => {
    setConfirmingAbandon(false);
    onUpdateSession(undoLastPaceControlPutt(activeSession));
  };

  const handlePlayAgainSameConfig = (config: PaceControlConfig) => {
    onUpdateSession(createPaceControlSession(config));
  };

  // ---------------- COMPLETED SUMMARY VIEW ----------------
  if (activeSession.status === 'completed') {
    const completedRecord = buildCompletedPaceControlRecord(activeSession);
    const pbEval = evaluatePersonalBestForSession(history, completedRecord);
    const bestRecord: CompletedPaceControlRecord =
      pbEval.bestRecord.mode === 'pace_control' ? pbEval.bestRecord : completedRecord;
    const previousBest: CompletedPaceControlRecord | null =
      pbEval.previousBestRecord && pbEval.previousBestRecord.mode === 'pace_control'
        ? pbEval.previousBestRecord
        : null;

    return (
      <section aria-labelledby="pc-summary-title" className="settings-card">
        <div className="challenge-flow-topbar">
          <div>
            <span className="eyebrow-label">Pace Control • Completed</span>
            <h2 id="pc-summary-title" className="section-header__title">
              Pace Control Summary
            </h2>
          </div>
          <span className="mat-summary-pill">
            {activeSession.config.targetDistancesMetres.map(formatMetres).join(', ')} •{' '}
            {formatMetres(activeSession.config.zoneDepthMetres)} zone •{' '}
            {activeSession.config.puttsPerDistance} putts each
          </span>
        </div>

        <div
          className={`pb-callout ${pbEval.isPersonalBest ? 'pb-callout--highlight' : ''}`}
          role="status"
        >
          <div className="pb-callout__badge">
            {pbEval.status === 'first_for_config' && '★ First Benchmark for This Setup'}
            {pbEval.status === 'new_personal_best' && '★ New Comparable Personal Best!'}
            {pbEval.status === 'tied_personal_best' && '★ Tied Comparable Personal Best!'}
            {pbEval.status === 'below_personal_best' && 'Comparable Personal Best Reference'}
          </div>
          <div className="pb-callout__body">
            {pbEval.status === 'first_for_config' && (
              <p style={{ marginBottom: 0 }}>
                You set your initial benchmark:{' '}
                <strong>{formatPaceBenchmark(completedRecord.summary)}</strong> for this
                exact Pace Control setup.
              </p>
            )}
            {pbEval.status === 'new_personal_best' && previousBest && (
              <p style={{ marginBottom: 0 }}>
                New record: <strong>{formatPaceBenchmark(completedRecord.summary)}</strong> —
                beating your previous best of{' '}
                <strong>{formatPaceBenchmark(previousBest.summary)}</strong>
                {pbEval.pointsDeltaFromPreviousBest !== null &&
                  ` (+${pbEval.pointsDeltaFromPreviousBest} pts)`}
                !
              </p>
            )}
            {pbEval.status === 'tied_personal_best' && (
              <p style={{ marginBottom: 0 }}>
                You matched your personal best:{' '}
                <strong>{formatPaceBenchmark(bestRecord.summary)}</strong> for this exact
                setup.
              </p>
            )}
            {pbEval.status === 'below_personal_best' && (
              <p style={{ marginBottom: 0 }}>
                Comparable Personal Best for this exact setup:{' '}
                <strong>{formatPaceBenchmark(bestRecord.summary)}</strong>. (
                {pbEval.matchingSessionCount} completed sessions with this setup)
              </p>
            )}
          </div>
        </div>

        <div className="summary-score-grid">
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">In Zone Points</span>
            <span className="summary-stat-box__value">
              {liveSummary.totalPoints} <small>/ {liveSummary.maxPossiblePoints} pts</small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">% Short</span>
            <span className="summary-stat-box__value">
              {liveSummary.percentages.short.toFixed(1)}%{' '}
              <small>({liveSummary.counts.short})</small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">% In Zone</span>
            <span className="summary-stat-box__value">
              {liveSummary.percentages.inZone.toFixed(1)}%{' '}
              <small>({liveSummary.counts.inZone})</small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">% Long</span>
            <span className="summary-stat-box__value">
              {liveSummary.percentages.long.toFixed(1)}%{' '}
              <small>({liveSummary.counts.long})</small>
            </span>
          </div>
        </div>

        <div className="field-group">
          <h3 className="field-group__label">Overall Dispersion</h3>
          <DispersionBar percentages={liveSummary.percentages} />
          <p className="field-group__hint" style={{ marginBottom: 0 }}>
            {formatDispersion(liveSummary.percentages)}
          </p>
        </div>

        <div className="field-group">
          <h3 className="field-group__label">Per-Distance Breakdown</h3>
          <div className="distance-breakdown-table-wrap">
            <table className="distance-breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Distance</th>
                  <th scope="col">Short</th>
                  <th scope="col">In Zone</th>
                  <th scope="col">Long</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                {liveSummary.byDistance.map((row) => (
                  <tr key={row.distanceMetres}>
                    <td>
                      <strong>{formatMetres(row.distanceMetres)}</strong>
                    </td>
                    <td>
                      {row.counts.short} ({row.percentages.short.toFixed(1)}%)
                    </td>
                    <td>
                      {row.counts.inZone} ({row.percentages.inZone.toFixed(1)}%)
                    </td>
                    <td>
                      {row.counts.long} ({row.percentages.long.toFixed(1)}%)
                    </td>
                    <td>
                      {row.points} / {activeSession.config.puttsPerDistance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="undo-reopen-bar">
          <div>
            <strong>Tapped the wrong result on the final putt?</strong>
            <p className="field-group__hint" style={{ marginBottom: 0 }}>
              Undo reopens this session at putt #{activeSession.attempts.length} and updates
              your saved result and Personal Best without creating duplicate history
              entries.
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={handleUndo}>
            ↶ Undo Final Putt
          </button>
        </div>

        <div className="summary-actions-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => handlePlayAgainSameConfig(activeSession.config)}
          >
            Play Again (Same Setup)
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => onUpdateSession(null)}
          >
            Configure New Setup
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              onUpdateSession(null);
              onBackToChallenges();
            }}
          >
            Done • All Challenges
          </button>
        </div>
      </section>
    );
  }

  // ---------------- IN-PROGRESS LOGGING VIEW ----------------
  const { zoneDepthMetres } = activeSession.config;

  return (
    <section aria-labelledby="pc-active-title" className="settings-card">
      <div className="challenge-flow-topbar">
        <div>
          <span className="eyebrow-label">Pace Control • In Progress (Auto-Saved)</span>
          <h2 id="pc-active-title" className="section-header__title">
            Distance {step.distanceNumber} of {step.totalDistances} • Putt{' '}
            {step.puttInSetNumber} of {step.puttsPerDistance}
          </h2>
        </div>
        <span className="mat-summary-pill">
          Putt {step.attemptNumber} of {step.totalAttempts} • {liveSummary.totalPoints} pts
        </span>
      </div>

      <div className="active-target-banner" aria-live="polite">
        <div className="active-target-banner__distance-block">
          <span className="active-target-banner__eyebrow">Target Distance</span>
          <span className="active-target-banner__distance">
            {formatMetres(step.distanceMetres)}
          </span>
        </div>
        <div className="active-target-banner__meta">
          <div>
            Where did the ball stop relative to the{' '}
            <strong>{formatMetres(zoneDepthMetres)}</strong> target zone?
          </div>
          <div className="active-target-banner__sub">
            1 point for In Zone • 0 for Short or Long
          </div>
        </div>
      </div>

      <div className="logging-pace-grid">
        <button
          type="button"
          className="btn btn--log-pace"
          onClick={() => handleRecordOutcome('short')}
        >
          <span className="btn__log-icon" aria-hidden="true">
            ↓
          </span>
          <span className="btn__log-text">
            <strong>Short</strong>
            <small>Stopped before the zone • 0 pts</small>
          </span>
        </button>

        <button
          type="button"
          className="btn btn--log-pace btn--log-pace-zone"
          onClick={() => handleRecordOutcome('in_zone')}
        >
          <span className="btn__log-icon" aria-hidden="true">
            ◎
          </span>
          <span className="btn__log-text">
            <strong>In Zone</strong>
            <small>Stopped inside the zone • 1 pt</small>
          </span>
        </button>

        <button
          type="button"
          className="btn btn--log-pace"
          onClick={() => handleRecordOutcome('long')}
        >
          <span className="btn__log-icon" aria-hidden="true">
            ↑
          </span>
          <span className="btn__log-text">
            <strong>Long</strong>
            <small>Stopped beyond the zone • 0 pts</small>
          </span>
        </button>
      </div>

      <div className="field-group">
        <span className="field-group__label">Distance Progress</span>
        <div className="live-distance-strip">
          {liveSummary.byDistance.map((stat, idx) => {
            const isCurrent = idx === step.distanceIndex;
            const isDone = stat.attempts >= step.puttsPerDistance;
            return (
              <div
                key={stat.distanceMetres}
                className={`live-distance-pill ${isCurrent ? 'live-distance-pill--current' : ''} ${isDone ? 'live-distance-pill--cleared' : ''}`}
              >
                <span className="live-distance-pill__dist">
                  {formatMetres(stat.distanceMetres)}
                </span>
                <span className="live-distance-pill__tally">
                  {stat.attempts === 0
                    ? '○ Upcoming'
                    : `${isDone ? '✓' : '●'} S ${stat.counts.short} • Z ${stat.counts.inZone} • L ${stat.counts.long}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="session-controls-bar">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!lastAttempt}
          onClick={handleUndo}
        >
          ↶ Undo Last Putt
          {lastAttempt
            ? ` (#${lastAttempt.attemptNumber} ${OUTCOME_LABELS[lastAttempt.outcome]})`
            : ''}
        </button>

        {!confirmingAbandon ? (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => setConfirmingAbandon(true)}
          >
            Abandon Session
          </button>
        ) : (
          <div
            className="abandon-confirm-group"
            role="group"
            aria-label="Confirm abandon session"
          >
            <span className="abandon-confirm-group__label">
              Discard this Pace Control session?
            </span>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                setConfirmingAbandon(false);
                onAbandonSession();
              }}
            >
              Yes, Abandon
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmingAbandon(false)}
            >
              Keep Playing
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
