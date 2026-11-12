import { FormEvent, useState } from 'react';
import { getDistanceRoundsConfigKey } from '../domain/configKey';
import {
  buildCompletedDistanceRoundsRecord,
  calculateDistanceRoundsSummary,
  createDistanceRoundsSession,
  getCurrentTargetStep,
  recordDistanceRoundsPutt,
  undoLastDistanceRoundsPutt,
  updateLastMissedPuttDetails,
  validateDistanceRoundsSetup,
} from '../domain/distanceRounds';
import {
  formatMetres,
  MAX_PRESET_DISTANCES_COUNT,
  MIN_PUTTING_DISTANCE_METRES,
  MatSettings,
  roundToTenthMetre,
  validateChallengeDistance,
} from '../domain/matSettings';
import {
  evaluatePersonalBestForSession,
  getPersonalBestForConfigKey,
} from '../domain/personalBests';
import {
  CompletedSessionRecord,
  DistanceRoundsConfig,
  DistanceRoundsSessionState,
  MissDirection,
  MissDistance,
  PuttOutcome,
  PuttsPerDistanceOption,
  RoundsOption,
  VALID_PUTTS_PER_DISTANCE,
  VALID_ROUNDS_OPTIONS,
} from '../domain/types';

interface DistanceRoundsFlowProps {
  readonly settings: MatSettings;
  readonly activeSession: DistanceRoundsSessionState | null;
  readonly history: readonly CompletedSessionRecord[];
  readonly onUpdateSession: (nextSession: DistanceRoundsSessionState | null) => void;
  readonly onAbandonSession: () => void;
  readonly onBackToChallenges: () => void;
}

const MISS_DIRECTIONS: readonly { value: MissDirection; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const MISS_DISTANCES: readonly { value: MissDistance; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'good', label: 'Good Pace' },
  { value: 'long', label: 'Long' },
];

export function DistanceRoundsFlow({
  settings,
  activeSession,
  history,
  onUpdateSession,
  onAbandonSession,
  onBackToChallenges,
}: DistanceRoundsFlowProps) {
  // Setup state (used when activeSession === null)
  const [setupDistances, setSetupDistances] = useState<number[]>(() =>
    settings.defaultDistancesMetres.filter(
      (d) => d <= settings.maxUsableDistanceMetres
    )
  );
  const [puttsPerDistance, setPuttsPerDistance] =
    useState<PuttsPerDistanceOption>(5);
  const [rounds, setRounds] = useState<RoundsOption>(1);
  const [customDistanceInput, setCustomDistanceInput] = useState<string>('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [confirmingAbandon, setConfirmingAbandon] = useState<boolean>(false);

  // Ensure setup distances stay valid if user changed maxUsableDistanceMetres in settings
  const validSetupDistances = setupDistances.filter(
    (d) => d >= MIN_PUTTING_DISTANCE_METRES && d <= settings.maxUsableDistanceMetres
  );

  // ---------------- SETUP VIEW ----------------
  if (!activeSession) {
    const candidateConfigKey =
      validSetupDistances.length > 0
        ? getDistanceRoundsConfigKey({
            distancesMetres: validSetupDistances,
            puttsPerDistance,
            rounds,
          })
        : null;

    const rawExistingPb = candidateConfigKey
      ? getPersonalBestForConfigKey(history, candidateConfigKey)
      : null;
    const existingPb =
      rawExistingPb && rawExistingPb.mode === 'distance_rounds'
        ? rawExistingPb
        : null;

    const totalPlannedPutts =
      validSetupDistances.length * puttsPerDistance * rounds;

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
        setSetupError(`${formatMetres(rounded)} is already in this session setup.`);
        return;
      }

      if (validSetupDistances.length >= MAX_PRESET_DISTANCES_COUNT) {
        setSetupError(
          `You can include at most ${MAX_PRESET_DISTANCES_COUNT} distances.`
        );
        return;
      }

      const next = [...validSetupDistances, rounded].sort((a, b) => a - b);
      setSetupDistances(next);
      setCustomDistanceInput('');
    };

    const handleRemoveSetupDistance = (distToRemove: number) => {
      setSetupError(null);
      if (validSetupDistances.length <= 1) {
        setSetupError('Select at least 1 putting distance for Distance Rounds.');
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
      const validation = validateDistanceRoundsSetup(
        {
          distancesMetres: validSetupDistances,
          puttsPerDistance,
          rounds,
        },
        settings.maxUsableDistanceMetres
      );

      if (!validation.valid || !validation.config) {
        setSetupError(validation.errors.join(' '));
        return;
      }

      const newSession = createDistanceRoundsSession(validation.config);
      onUpdateSession(newSession);
    };

    return (
      <section aria-labelledby="dr-setup-title" className="settings-card">
        <div className="challenge-flow-topbar">
          <div>
            <span className="eyebrow-label">Challenge 1 • Setup</span>
            <h2 id="dr-setup-title" className="section-header__title">
              Distance Rounds Setup
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
            How Distance Rounds Is Scored
          </h3>
          <ul className="challenge-card__rules">
            <li>
              <strong>1 point per made putt</strong> across each configured distance and
              round.
            </li>
            <li>
              Reports <strong>points, makes, attempts, and make %</strong> per distance
              and overall.
            </li>
            <li>
              Single-tap <strong>Made / Missed</strong> logging, with optional non-blocking
              miss tags (<em>Direction: Left / Center / Right</em> and{' '}
              <em>Distance: Short / Good Pace / Long</em>).
            </li>
            <li>
              All distances must stay within your configured usable mat limit of{' '}
              <strong>{formatMetres(settings.maxUsableDistanceMetres)}</strong> (on your{' '}
              {formatMetres(settings.physicalMatLengthMetres)} mat).
            </li>
          </ul>
        </div>

        {/* Distances selection */}
        <div className="field-group">
          <div className="field-group__header-row">
            <label className="field-group__label" htmlFor="dr-add-distance-input">
              Challenge Distances ({validSetupDistances.length} of{' '}
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
            aria-label="Selected challenge distances"
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
              id="dr-add-distance-input"
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
              aria-label={`Add distance in metres up to ${formatMetres(
                settings.maxUsableDistanceMetres
              )}`}
            />
            <button type="submit" className="btn btn--secondary">
              + Add Distance (m)
            </button>
          </form>
        </div>

        {/* Putts per distance */}
        <div className="field-group">
          <span className="field-group__label" id="dr-putts-per-dist-label">
            Putts per Distance
          </span>
          <div
            className="option-pill-group"
            role="group"
            aria-labelledby="dr-putts-per-dist-label"
          >
            {VALID_PUTTS_PER_DISTANCE.map((option) => (
              <button
                key={option}
                type="button"
                className={`option-pill ${
                  puttsPerDistance === option ? 'option-pill--active' : ''
                }`}
                aria-pressed={puttsPerDistance === option}
                onClick={() => setPuttsPerDistance(option)}
              >
                {option} putts
              </button>
            ))}
          </div>
        </div>

        {/* Rounds */}
        <div className="field-group">
          <span className="field-group__label" id="dr-rounds-label">
            Number of Rounds
          </span>
          <div
            className="option-pill-group"
            role="group"
            aria-labelledby="dr-rounds-label"
          >
            {VALID_ROUNDS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`option-pill ${
                  rounds === option ? 'option-pill--active' : ''
                }`}
                aria-pressed={rounds === option}
                onClick={() => setRounds(option)}
              >
                {option} {option === 1 ? 'round' : 'rounds'}
              </button>
            ))}
          </div>
        </div>

        {/* Setup Summary & Comparable PB Preview */}
        <div className="setup-preview-bar">
          <div>
            <div className="setup-preview-bar__title">
              Session Total: <strong>{totalPlannedPutts} putts</strong> (Max{' '}
              <strong>{totalPlannedPutts} points</strong>)
            </div>
            <div className="setup-preview-bar__subtitle">
              {existingPb ? (
                <>
                  Comparable Personal Best for this exact setup:{' '}
                  <strong>
                    {existingPb.summary.totalPoints} /{' '}
                    {existingPb.summary.maxPossiblePoints} pts (
                    {existingPb.summary.overallMakePercentage.toFixed(1)}%)
                  </strong>
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
          Start Distance Rounds ({totalPlannedPutts} Putts)
        </button>
      </section>
    );
  }

  // ---------------- ACTIVE OR COMPLETED SESSION ----------------
  const liveSummary = calculateDistanceRoundsSummary(activeSession);
  const step = getCurrentTargetStep(activeSession);
  const lastAttempt =
    activeSession.attempts.length > 0
      ? activeSession.attempts[activeSession.attempts.length - 1]
      : null;

  const handleRecordOutcome = (outcome: PuttOutcome) => {
    setConfirmingAbandon(false);
    const updated = recordDistanceRoundsPutt(activeSession, outcome);
    onUpdateSession(updated);
  };

  const handleToggleMissDirection = (direction: MissDirection) => {
    if (!lastAttempt || lastAttempt.outcome !== 'missed') return;
    const currentDir = lastAttempt.missDetails?.direction;
    const nextDir = currentDir === direction ? undefined : direction;
    const updated = updateLastMissedPuttDetails(activeSession, {
      direction: nextDir,
      distance: lastAttempt.missDetails?.distance,
    });
    onUpdateSession(updated);
  };

  const handleToggleMissDistance = (distance: MissDistance) => {
    if (!lastAttempt || lastAttempt.outcome !== 'missed') return;
    const currentDist = lastAttempt.missDetails?.distance;
    const nextDist = currentDist === distance ? undefined : distance;
    const updated = updateLastMissedPuttDetails(activeSession, {
      direction: lastAttempt.missDetails?.direction,
      distance: nextDist,
    });
    onUpdateSession(updated);
  };

  const handleUndo = () => {
    setConfirmingAbandon(false);
    const reopenedOrUndone = undoLastDistanceRoundsPutt(activeSession);
    onUpdateSession(reopenedOrUndone);
  };

  const handlePlayAgainSameConfig = (config: DistanceRoundsConfig) => {
    const freshSession = createDistanceRoundsSession(config);
    onUpdateSession(freshSession);
  };

  // ---------------- COMPLETED SUMMARY VIEW ----------------
  if (activeSession.status === 'completed') {
    const completedRecord = buildCompletedDistanceRoundsRecord(activeSession);
    const pbEval = evaluatePersonalBestForSession(history, completedRecord);
    const bestDrRecord =
      pbEval.bestRecord.mode === 'distance_rounds'
        ? pbEval.bestRecord
        : completedRecord;
    const previousBestDrRecord =
      pbEval.previousBestRecord &&
      pbEval.previousBestRecord.mode === 'distance_rounds'
        ? pbEval.previousBestRecord
        : null;

    return (
      <section aria-labelledby="dr-summary-title" className="settings-card">
        <div className="challenge-flow-topbar">
          <div>
            <span className="eyebrow-label">Distance Rounds • Session Complete</span>
            <h2 id="dr-summary-title" className="section-header__title">
              Session Summary
            </h2>
          </div>
          <span className="mat-summary-pill">
            {activeSession.config.distancesMetres.map(formatMetres).join(', ')} •{' '}
            {activeSession.config.puttsPerDistance} putts ×{' '}
            {activeSession.config.rounds}{' '}
            {activeSession.config.rounds === 1 ? 'round' : 'rounds'}
          </span>
        </div>

        {/* Comparable Personal Best Banner */}
        <div
          className={`pb-callout ${
            pbEval.isPersonalBest ? 'pb-callout--highlight' : ''
          }`}
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
                You set your initial benchmark of{' '}
                <strong>
                  {completedRecord.summary.totalPoints} /{' '}
                  {completedRecord.summary.maxPossiblePoints} pts (
                  {completedRecord.summary.overallMakePercentage.toFixed(1)}%)
                </strong>{' '}
                for this exact configuration.
              </p>
            )}
            {pbEval.status === 'new_personal_best' && previousBestDrRecord && (
              <p style={{ marginBottom: 0 }}>
                New record of{' '}
                <strong>
                  {completedRecord.summary.totalPoints} /{' '}
                  {completedRecord.summary.maxPossiblePoints} pts (
                  {completedRecord.summary.overallMakePercentage.toFixed(1)}%)
                </strong>{' '}
                — improved by{' '}
                <strong>+{pbEval.pointsDeltaFromPreviousBest} pts</strong> over your
                previous best of {previousBestDrRecord.summary.totalPoints} pts!
              </p>
            )}
            {pbEval.status === 'tied_personal_best' && (
              <p style={{ marginBottom: 0 }}>
                You matched your personal best of{' '}
                <strong>
                  {bestDrRecord.summary.totalPoints} /{' '}
                  {bestDrRecord.summary.maxPossiblePoints} pts (
                  {bestDrRecord.summary.overallMakePercentage.toFixed(1)}%)
                </strong>{' '}
                for this exact configuration.
              </p>
            )}
            {pbEval.status === 'below_personal_best' && (
              <p style={{ marginBottom: 0 }}>
                Comparable Personal Best for this exact setup:{' '}
                <strong>
                  {bestDrRecord.summary.totalPoints} /{' '}
                  {bestDrRecord.summary.maxPossiblePoints} pts (
                  {bestDrRecord.summary.overallMakePercentage.toFixed(1)}%)
                </strong>
                . ({pbEval.matchingSessionCount} completed sessions with this setup)
              </p>
            )}
          </div>
        </div>

        {/* Primary Score Readout */}
        <div className="summary-score-grid">
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Total Score</span>
            <span className="summary-stat-box__value">
              {liveSummary.totalPoints}{' '}
              <small>/ {liveSummary.maxPossiblePoints} pts</small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Overall Makes</span>
            <span className="summary-stat-box__value">
              {liveSummary.totalMakes} <small>/ {liveSummary.totalAttempts}</small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Overall Make %</span>
            <span className="summary-stat-box__value">
              {liveSummary.overallMakePercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Per-Distance Table */}
        <div className="field-group">
          <h3 className="field-group__label">Per-Distance Breakdown</h3>
          <div className="distance-breakdown-table-wrap">
            <table className="distance-breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Distance</th>
                  <th scope="col">Makes / Attempts</th>
                  <th scope="col">Make %</th>
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
                      {row.makes} / {row.attempts}
                    </td>
                    <td>{row.makePercentage.toFixed(1)}%</td>
                    <td>{row.points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Optional Miss Tagging for Final Putt (if final putt was a miss) */}
        {lastAttempt && lastAttempt.outcome === 'missed' && (
          <div className="miss-tagger-card">
            <div className="miss-tagger-card__header">
              <strong>
                Optional Miss Details for Final Putt (#{lastAttempt.attemptNumber} at{' '}
                {formatMetres(lastAttempt.distanceMetres)})
              </strong>
              <span className="miss-tagger-card__hint">
                Tap to tag or update direction &amp; pace
              </span>
            </div>

            <div className="miss-tagger-row">
              <span className="miss-tagger-row__label">Direction:</span>
              <div className="miss-tagger-buttons">
                {MISS_DIRECTIONS.map((dir) => {
                  const selected = lastAttempt.missDetails?.direction === dir.value;
                  return (
                    <button
                      key={dir.value}
                      type="button"
                      className={`btn btn--tag ${selected ? 'btn--tag-active' : ''}`}
                      aria-pressed={selected}
                      onClick={() => handleToggleMissDirection(dir.value)}
                    >
                      {dir.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="miss-tagger-row">
              <span className="miss-tagger-row__label">Distance:</span>
              <div className="miss-tagger-buttons">
                {MISS_DISTANCES.map((dist) => {
                  const selected = lastAttempt.missDetails?.distance === dist.value;
                  return (
                    <button
                      key={dist.value}
                      type="button"
                      className={`btn btn--tag ${selected ? 'btn--tag-active' : ''}`}
                      aria-pressed={selected}
                      onClick={() => handleToggleMissDistance(dist.value)}
                    >
                      {dist.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Miss Tendency Breakdown if any misses were recorded */}
        {liveSummary.missBreakdown.totalMisses > 0 && (
          <div className="field-group">
            <h3 className="field-group__label">
              Miss Tendencies ({liveSummary.missBreakdown.totalMisses}{' '}
              {liveSummary.missBreakdown.totalMisses === 1 ? 'miss' : 'misses'})
            </h3>
            <div className="miss-summary-grid">
              <div className="miss-summary-card">
                <span className="miss-summary-card__title">Direction Tags</span>
                <p style={{ marginBottom: 0 }}>
                  Left: <strong>{liveSummary.missBreakdown.directionCounts.left}</strong> •{' '}
                  Center:{' '}
                  <strong>{liveSummary.missBreakdown.directionCounts.center}</strong> •{' '}
                  Right:{' '}
                  <strong>{liveSummary.missBreakdown.directionCounts.right}</strong> •{' '}
                  Untagged:{' '}
                  <strong>{liveSummary.missBreakdown.directionCounts.untagged}</strong>
                </p>
              </div>
              <div className="miss-summary-card">
                <span className="miss-summary-card__title">Distance / Pace Tags</span>
                <p style={{ marginBottom: 0 }}>
                  Short: <strong>{liveSummary.missBreakdown.distanceCounts.short}</strong> •{' '}
                  Good Pace:{' '}
                  <strong>{liveSummary.missBreakdown.distanceCounts.good}</strong> • Long:{' '}
                  <strong>{liveSummary.missBreakdown.distanceCounts.long}</strong> •{' '}
                  Untagged:{' '}
                  <strong>{liveSummary.missBreakdown.distanceCounts.untagged}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Post-Final-Putt Undo Box */}
        <div className="undo-reopen-bar">
          <div>
            <strong>Tapped the wrong result on the final putt?</strong>
            <p className="field-group__hint" style={{ marginBottom: 0 }}>
              Undo reopens this session at putt #{activeSession.attempts.length} and
              updates your saved result and Personal Best without creating duplicate
              history entries.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleUndo}
          >
            ↶ Undo Final Putt
          </button>
        </div>

        {/* Summary Footer Actions */}
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
  return (
    <section aria-labelledby="dr-active-title" className="settings-card">
      <div className="challenge-flow-topbar">
        <div>
          <span className="eyebrow-label">
            Distance Rounds • In Progress (Auto-Saved)
          </span>
          <h2 id="dr-active-title" className="section-header__title">
            Round {step.roundNumber} of {step.totalRounds} • Putt {step.attemptNumber} of{' '}
            {step.totalAttempts}
          </h2>
        </div>
        <span className="mat-summary-pill">
          Score: {liveSummary.totalPoints} pts ({liveSummary.totalMakes}/
          {liveSummary.totalAttempts})
        </span>
      </div>

      {/* Prominent Target Distance Callout */}
      <div className="active-target-banner">
        <div className="active-target-banner__distance-block">
          <span className="active-target-banner__eyebrow">Current Putting Distance</span>
          <span className="active-target-banner__distance">
            {formatMetres(step.distanceMetres)}
          </span>
        </div>
        <div className="active-target-banner__meta">
          <div>
            Putt <strong>{step.puttInSetNumber}</strong> of{' '}
            <strong>{step.puttsPerDistance}</strong> at{' '}
            <strong>{formatMetres(step.distanceMetres)}</strong>
          </div>
          <div className="active-target-banner__sub">
            1 point per made putt • Overall progress: {step.completedAttemptsCount} /{' '}
            {step.totalAttempts} logged
          </div>
        </div>
      </div>

      {/* Primary Single-Tap Logging Buttons (min 56px height) */}
      <div className="logging-primary-grid">
        <button
          type="button"
          className="btn btn--log-made"
          onClick={() => handleRecordOutcome('made')}
        >
          <span className="btn__log-icon" aria-hidden="true">
            ✓
          </span>
          <span className="btn__log-text">
            <strong>Made Putt</strong>
            <small>+1 point • Advance</small>
          </span>
        </button>

        <button
          type="button"
          className="btn btn--log-missed"
          onClick={() => handleRecordOutcome('missed')}
        >
          <span className="btn__log-icon" aria-hidden="true">
            ✕
          </span>
          <span className="btn__log-text">
            <strong>Missed Putt</strong>
            <small>0 points • Advance</small>
          </span>
        </button>
      </div>

      {/* Non-Blocking Optional Miss Details for the Most Recent Putt */}
      {lastAttempt && lastAttempt.outcome === 'missed' && (
        <div className="miss-tagger-card" role="region" aria-label="Optional miss details">
          <div className="miss-tagger-card__header">
            <strong>
              Optional Miss Tags for Putt #{lastAttempt.attemptNumber} (
              {formatMetres(lastAttempt.distanceMetres)})
            </strong>
            <span className="miss-tagger-card__hint">
              Optional — or tap Made/Missed above to log your next putt immediately
            </span>
          </div>

          <div className="miss-tagger-row">
            <span className="miss-tagger-row__label">Direction:</span>
            <div className="miss-tagger-buttons">
              {MISS_DIRECTIONS.map((dir) => {
                const selected = lastAttempt.missDetails?.direction === dir.value;
                return (
                  <button
                    key={dir.value}
                    type="button"
                    className={`btn btn--tag ${selected ? 'btn--tag-active' : ''}`}
                    aria-pressed={selected}
                    onClick={() => handleToggleMissDirection(dir.value)}
                  >
                    {dir.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="miss-tagger-row">
            <span className="miss-tagger-row__label">Distance:</span>
            <div className="miss-tagger-buttons">
              {MISS_DISTANCES.map((dist) => {
                const selected = lastAttempt.missDetails?.distance === dist.value;
                return (
                  <button
                    key={dist.value}
                    type="button"
                    className={`btn btn--tag ${selected ? 'btn--tag-active' : ''}`}
                    aria-pressed={selected}
                    onClick={() => handleToggleMissDistance(dist.value)}
                  >
                    {dist.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Per-Distance Live Strip */}
      <div className="field-group">
        <span className="field-group__label">Distance Progress</span>
        <div className="live-distance-strip">
          {liveSummary.byDistance.map((stat, idx) => {
            const isCurrent = idx === step.distanceIndex;
            return (
              <div
                key={stat.distanceMetres}
                className={`live-distance-pill ${
                  isCurrent ? 'live-distance-pill--current' : ''
                }`}
              >
                <span className="live-distance-pill__dist">
                  {formatMetres(stat.distanceMetres)}
                </span>
                <span className="live-distance-pill__tally">
                  {stat.makes}/{stat.attempts} ({stat.makePercentage.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Undo & Abandon Session Controls */}
      <div className="session-controls-bar">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!lastAttempt}
          onClick={handleUndo}
        >
          ↶ Undo Last Putt
          {lastAttempt
            ? ` (#${lastAttempt.attemptNumber} ${
                lastAttempt.outcome === 'made' ? 'Made' : 'Missed'
              })`
            : ''}
        </button>

        {!confirmingAbandon ? (
          <button
            type="button"
            className="btn btn--danger"
            id="abandon-trigger"
            onClick={() => setConfirmingAbandon(true)}
          >
            Abandon Session
          </button>
        ) : (
          <div className="abandon-confirm-group" role="group" aria-label="Confirm abandon session">
            <span className="abandon-confirm-group__label">Discard this session?</span>
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
              autoFocus
              onClick={() => {
                setConfirmingAbandon(false);
                window.setTimeout(() => document.getElementById("abandon-trigger")?.focus(), 0);
              }}
            >
              Keep Playing
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
