import { FormEvent, useState } from 'react';
import { getPuttingLadderConfigKey } from '../domain/configKey';
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
  buildCompletedPuttingLadderRecord,
  calculatePuttingLadderSummary,
  createPuttingLadderSession,
  getCurrentLadderTargetStep,
  MIN_LADDER_DISTANCES_COUNT,
  recordPuttingLadderPutt,
  undoLastPuttingLadderPutt,
  updateLastPuttingLadderMissedPuttDetails,
  validatePuttingLadderSetup,
} from '../domain/puttingLadder';
import {
  AttemptBudgetOption,
  CompletedPuttingLadderRecord,
  CompletedSessionRecord,
  MissDirection,
  MissDistance,
  PuttOutcome,
  PuttingLadderConfig,
  PuttingLadderSessionState,
  PuttingLadderSummary,
  VALID_ATTEMPT_BUDGETS,
} from '../domain/types';

interface PuttingLadderFlowProps {
  readonly settings: MatSettings;
  readonly activeSession: PuttingLadderSessionState | null;
  readonly history: readonly CompletedSessionRecord[];
  readonly onUpdateSession: (nextSession: PuttingLadderSessionState | null) => void;
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

function formatLadderBenchmarkSummary(summary: PuttingLadderSummary): string {
  if (summary.cleared) {
    return `Ladder Cleared (${summary.rungsCompleted}/${summary.totalRungs} rungs) in ${summary.attemptsUsed}/${summary.attemptBudget} attempts (${summary.attemptsRemaining} remaining)`;
  }
  return `${summary.rungsCompleted}/${summary.totalRungs} rungs completed (${summary.attemptsUsed}/${summary.attemptBudget} attempts used)`;
}

export function PuttingLadderFlow({
  settings,
  activeSession,
  history,
  onUpdateSession,
  onAbandonSession,
  onBackToChallenges,
}: PuttingLadderFlowProps) {
  const [setupDistances, setSetupDistances] = useState<number[]>(() =>
    settings.defaultDistancesMetres.filter(
      (d) => d <= settings.maxUsableDistanceMetres
    )
  );
  const [attemptBudget, setAttemptBudget] = useState<AttemptBudgetOption>(15);
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
      validSetupDistances.length >= MIN_LADDER_DISTANCES_COUNT
        ? getPuttingLadderConfigKey({
            distancesMetres: validSetupDistances,
            attemptBudget,
          })
        : null;

    const rawExistingPb = candidateConfigKey
      ? getPersonalBestForConfigKey(history, candidateConfigKey)
      : null;
    const existingPb: CompletedPuttingLadderRecord | null =
      rawExistingPb && rawExistingPb.mode === 'putting_ladder'
        ? rawExistingPb
        : null;

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
        setSetupError(`${formatMetres(rounded)} is already in this ladder setup.`);
        return;
      }

      if (validSetupDistances.length >= MAX_PRESET_DISTANCES_COUNT) {
        setSetupError(
          `You can include at most ${MAX_PRESET_DISTANCES_COUNT} ladder distances.`
        );
        return;
      }

      const next = [...validSetupDistances, rounded].sort((a, b) => a - b);
      setSetupDistances(next);
      setCustomDistanceInput('');
    };

    const handleRemoveSetupDistance = (distToRemove: number) => {
      setSetupError(null);
      if (validSetupDistances.length <= MIN_LADDER_DISTANCES_COUNT) {
        setSetupError(
          `Putting Ladder requires at least ${MIN_LADDER_DISTANCES_COUNT} distances ordered shortest to longest.`
        );
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
      const validation = validatePuttingLadderSetup(
        {
          distancesMetres: validSetupDistances,
          attemptBudget,
        },
        settings.maxUsableDistanceMetres
      );

      if (!validation.valid || !validation.config) {
        setSetupError(validation.errors.join(' '));
        return;
      }

      const newSession = createPuttingLadderSession(validation.config);
      onUpdateSession(newSession);
    };

    return (
      <section aria-labelledby="pl-setup-title" className="settings-card">
        <div className="challenge-flow-topbar">
          <div>
            <span className="eyebrow-label">Challenge 2 • Setup</span>
            <h2 id="pl-setup-title" className="section-header__title">
              Putting Ladder Setup
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
            How Putting Ladder Works &amp; Ranks
          </h3>
          <ul className="challenge-card__rules">
            <li>
              <strong>Climb from shortest to longest:</strong> Advance 1 distance rung
              on a <strong>Made</strong> putt; stay at your current distance rung on a{' '}
              <strong>Missed</strong> putt.
            </li>
            <li>
              <strong>Clear the Final Distance:</strong> Making a putt on the final
              configured distance immediately completes the ladder as{' '}
              <strong>Ladder Cleared!</strong>
            </li>
            <li>
              <strong>Comparable Ranking:</strong> Ranked first by{' '}
              <strong>Cleared status</strong>, then by <strong>rungs completed</strong>,
              then by <strong>efficiency</strong> (fewer attempts used / more attempts
              remaining).
            </li>
            <li>
              All ladder distances must stay within your usable mat limit of{' '}
              <strong>{formatMetres(settings.maxUsableDistanceMetres)}</strong> (minimum{' '}
              {MIN_LADDER_DISTANCES_COUNT} distances).
            </li>
          </ul>
        </div>

        {/* Ladder distances selection */}
        <div className="field-group">
          <div className="field-group__header-row">
            <label className="field-group__label" htmlFor="pl-add-distance-input">
              Ladder Rungs — Shortest to Longest ({validSetupDistances.length} of{' '}
              {MAX_PRESET_DISTANCES_COUNT} max, min {MIN_LADDER_DISTANCES_COUNT})
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
            Each rung distance must be between{' '}
            {formatMetres(MIN_PUTTING_DISTANCE_METRES)} and{' '}
            {formatMetres(settings.maxUsableDistanceMetres)}.
          </p>

          <div
            className="distance-chips"
            role="list"
            aria-label="Selected ladder rung distances"
          >
            {validSetupDistances.map((d, index) => (
              <span key={d} className="distance-chip" role="listitem">
                <small className="distance-chip__rung-label">R{index + 1}</small>{' '}
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

          <form
            className="add-distance-row"
            onSubmit={handleAddSetupDistance}
            noValidate
          >
            <input
              id="pl-add-distance-input"
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
              aria-label={`Add ladder distance in metres up to ${formatMetres(
                settings.maxUsableDistanceMetres
              )}`}
            />
            <button type="submit" className="btn btn--secondary">
              + Add Rung (m)
            </button>
          </form>
        </div>

        {/* Attempt Budget */}
        <div className="field-group">
          <span className="field-group__label" id="pl-budget-label">
            Fixed Attempt Budget
          </span>
          <div
            className="option-pill-group option-pill-group--4"
            role="group"
            aria-labelledby="pl-budget-label"
          >
            {VALID_ATTEMPT_BUDGETS.map((option) => (
              <button
                key={option}
                type="button"
                className={`option-pill ${
                  attemptBudget === option ? 'option-pill--active' : ''
                }`}
                aria-pressed={attemptBudget === option}
                onClick={() => setAttemptBudget(option)}
              >
                {option} putts
              </button>
            ))}
          </div>
        </div>

        {/* Setup Summary & Comparable PB Preview */}
        <div className="setup-preview-bar">
          <div>
            <div className="setup-preview-bar__title">
              Ladder Setup:{' '}
              <strong>{validSetupDistances.length} distance rungs</strong> (
              {validSetupDistances.map(formatMetres).join(' → ')}) • Budget:{' '}
              <strong>{attemptBudget} attempts</strong>
            </div>
            <div className="setup-preview-bar__subtitle">
              {existingPb ? (
                <>
                  Comparable Personal Best for this exact setup:{' '}
                  <strong>{formatLadderBenchmarkSummary(existingPb.summary)}</strong>
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
          Start Putting Ladder ({validSetupDistances.length} Rungs • {attemptBudget}{' '}
          Attempts)
        </button>
      </section>
    );
  }

  // ---------------- ACTIVE OR COMPLETED SESSION ----------------
  const liveSummary = calculatePuttingLadderSummary(activeSession);
  const step = getCurrentLadderTargetStep(activeSession);
  const lastAttempt =
    activeSession.attempts.length > 0
      ? activeSession.attempts[activeSession.attempts.length - 1]
      : null;

  const handleRecordOutcome = (outcome: PuttOutcome) => {
    setConfirmingAbandon(false);
    const updated = recordPuttingLadderPutt(activeSession, outcome);
    onUpdateSession(updated);
  };

  const handleToggleMissDirection = (direction: MissDirection) => {
    if (!lastAttempt || lastAttempt.outcome !== 'missed') return;
    const currentDir = lastAttempt.missDetails?.direction;
    const nextDir = currentDir === direction ? undefined : direction;
    const updated = updateLastPuttingLadderMissedPuttDetails(activeSession, {
      direction: nextDir,
      distance: lastAttempt.missDetails?.distance,
    });
    onUpdateSession(updated);
  };

  const handleToggleMissDistance = (distance: MissDistance) => {
    if (!lastAttempt || lastAttempt.outcome !== 'missed') return;
    const currentDist = lastAttempt.missDetails?.distance;
    const nextDist = currentDist === distance ? undefined : distance;
    const updated = updateLastPuttingLadderMissedPuttDetails(activeSession, {
      direction: lastAttempt.missDetails?.direction,
      distance: nextDist,
    });
    onUpdateSession(updated);
  };

  const handleUndo = () => {
    setConfirmingAbandon(false);
    const reopenedOrUndone = undoLastPuttingLadderPutt(activeSession);
    onUpdateSession(reopenedOrUndone);
  };

  const handlePlayAgainSameConfig = (config: PuttingLadderConfig) => {
    const freshSession = createPuttingLadderSession(config);
    onUpdateSession(freshSession);
  };

  // ---------------- COMPLETED SUMMARY VIEW ----------------
  if (activeSession.status === 'completed') {
    const completedRecord = buildCompletedPuttingLadderRecord(activeSession);
    const pbEval = evaluatePersonalBestForSession(history, completedRecord);
    const bestLadderRecord: CompletedPuttingLadderRecord =
      pbEval.bestRecord.mode === 'putting_ladder'
        ? pbEval.bestRecord
        : completedRecord;
    const previousBestLadderRecord: CompletedPuttingLadderRecord | null =
      pbEval.previousBestRecord &&
      pbEval.previousBestRecord.mode === 'putting_ladder'
        ? pbEval.previousBestRecord
        : null;

    return (
      <section aria-labelledby="pl-summary-title" className="settings-card">
        <div className="challenge-flow-topbar">
          <div>
            <span className="eyebrow-label">
              Putting Ladder •{' '}
              {liveSummary.cleared ? 'Ladder Cleared!' : 'Attempt Budget Exhausted'}
            </span>
            <h2 id="pl-summary-title" className="section-header__title">
              {liveSummary.cleared
                ? 'Ladder Cleared!'
                : 'Putting Ladder Summary'}
            </h2>
          </div>
          <span className="mat-summary-pill">
            {activeSession.config.distancesMetres.map(formatMetres).join(' → ')} •{' '}
            {activeSession.config.attemptBudget} attempt budget
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
                You set your initial benchmark:{' '}
                <strong>{formatLadderBenchmarkSummary(completedRecord.summary)}</strong>{' '}
                for this exact ladder configuration.
              </p>
            )}
            {pbEval.status === 'new_personal_best' && previousBestLadderRecord && (
              <p style={{ marginBottom: 0 }}>
                New record:{' '}
                <strong>{formatLadderBenchmarkSummary(completedRecord.summary)}</strong>{' '}
                — beating your previous best of{' '}
                <strong>
                  {formatLadderBenchmarkSummary(previousBestLadderRecord.summary)}
                </strong>
                !
              </p>
            )}
            {pbEval.status === 'tied_personal_best' && (
              <p style={{ marginBottom: 0 }}>
                You matched your personal best:{' '}
                <strong>{formatLadderBenchmarkSummary(bestLadderRecord.summary)}</strong>{' '}
                for this exact ladder configuration.
              </p>
            )}
            {pbEval.status === 'below_personal_best' && (
              <p style={{ marginBottom: 0 }}>
                Comparable Personal Best for this exact setup:{' '}
                <strong>{formatLadderBenchmarkSummary(bestLadderRecord.summary)}</strong>.
                ({pbEval.matchingSessionCount} completed sessions with this setup)
              </p>
            )}
          </div>
        </div>

        {/* Primary Score Readout */}
        <div className="summary-score-grid">
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Ladder Status</span>
            <span className="summary-stat-box__value">
              {liveSummary.cleared ? 'Cleared ✓' : 'Incomplete'}
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Rungs Cleared</span>
            <span className="summary-stat-box__value">
              {liveSummary.rungsCompleted}{' '}
              <small>/ {liveSummary.totalRungs} rungs</small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Attempts &amp; Efficiency</span>
            <span className="summary-stat-box__value">
              {liveSummary.attemptsUsed}{' '}
              <small>
                / {liveSummary.attemptBudget} ({liveSummary.attemptsRemaining} left)
              </small>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-box__label">Overall Make %</span>
            <span className="summary-stat-box__value">
              {liveSummary.overallMakePercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Per-Rung Table */}
        <div className="field-group">
          <h3 className="field-group__label">Per-Rung Breakdown</h3>
          <div className="distance-breakdown-table-wrap">
            <table className="distance-breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Rung</th>
                  <th scope="col">Distance</th>
                  <th scope="col">Status</th>
                  <th scope="col">Makes / Attempts</th>
                  <th scope="col">Make %</th>
                </tr>
              </thead>
              <tbody>
                {liveSummary.byRung.map((row) => (
                  <tr key={row.distanceMetres}>
                    <td>Rung {row.rungNumber}</td>
                    <td>
                      <strong>{formatMetres(row.distanceMetres)}</strong>
                    </td>
                    <td>
                      {row.cleared ? (
                        <span className="rung-status-cleared">✓ Cleared</span>
                      ) : row.attempts > 0 ? (
                        <span>Attempted</span>
                      ) : (
                        <span>Not Reached</span>
                      )}
                    </td>
                    <td>
                      {row.makes} / {row.attempts}
                    </td>
                    <td>{row.makePercentage.toFixed(1)}%</td>
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
              Undo reopens this ladder session at attempt #{activeSession.attempts.length}{' '}
              and updates your saved result and Personal Best without creating duplicate
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
  const isFinalRung = step.currentRungNumber === step.totalRungs;
  const nextRungDistance = !isFinalRung
    ? activeSession.config.distancesMetres[step.currentRungIndex + 1]
    : null;

  return (
    <section aria-labelledby="pl-active-title" className="settings-card">
      <div className="challenge-flow-topbar">
        <div>
          <span className="eyebrow-label">
            Putting Ladder • In Progress (Auto-Saved)
          </span>
          <h2 id="pl-active-title" className="section-header__title">
            Rung {step.currentRungNumber} of {step.totalRungs} • Attempt{' '}
            {step.attemptNumber} of {step.attemptBudget}
          </h2>
        </div>
        <span className="mat-summary-pill">
          Cleared: {step.rungsCompleted}/{step.totalRungs} • Remaining:{' '}
          {step.attemptsRemaining} {step.attemptsRemaining === 1 ? 'putt' : 'putts'}
        </span>
      </div>

      {/* Prominent Target Distance Callout */}
      <div className="active-target-banner">
        <div className="active-target-banner__distance-block">
          <span className="active-target-banner__eyebrow">
            Current Ladder Rung ({step.currentRungNumber} of {step.totalRungs})
          </span>
          <span className="active-target-banner__distance">
            {formatMetres(step.distanceMetres)}
          </span>
        </div>
        <div className="active-target-banner__meta">
          <div>
            {isFinalRung ? (
              <>
                <strong>Final Rung!</strong> Make this putt at{' '}
                <strong>{formatMetres(step.distanceMetres)}</strong> to clear the
                ladder!
              </>
            ) : (
              <>
                Make to advance to{' '}
                <strong>{formatMetres(nextRungDistance!)}</strong> • Miss stays at{' '}
                <strong>{formatMetres(step.distanceMetres)}</strong>
              </>
            )}
          </div>
          <div className="active-target-banner__sub">
            Attempt budget: {step.attemptsUsed} used / {step.attemptBudget} total (
            <strong>{step.attemptsRemaining} remaining</strong>)
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
            <small>
              {isFinalRung
                ? 'Clear Final Rung & Finish!'
                : `Advance to ${formatMetres(nextRungDistance!)}`}
            </small>
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
            <small>Stay at {formatMetres(step.distanceMetres)}</small>
          </span>
        </button>
      </div>

      {/* Non-Blocking Optional Miss Details for the Most Recent Putt */}
      {lastAttempt && lastAttempt.outcome === 'missed' && (
        <div
          className="miss-tagger-card"
          role="region"
          aria-label="Optional miss details"
        >
          <div className="miss-tagger-card__header">
            <strong>
              Optional Miss Tags for Attempt #{lastAttempt.attemptNumber} (
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

      {/* Ladder Rungs Live Strip */}
      <div className="field-group">
        <span className="field-group__label">Ladder Rung Progression</span>
        <div className="live-distance-strip">
          {liveSummary.byRung.map((stat, idx) => {
            const isCurrent = idx === step.currentRungIndex;
            const isCleared = stat.cleared;
            return (
              <div
                key={stat.distanceMetres}
                className={`live-distance-pill ${
                  isCurrent ? 'live-distance-pill--current' : ''
                } ${isCleared ? 'live-distance-pill--cleared' : ''}`}
              >
                <span className="live-distance-pill__dist">
                  R{stat.rungNumber}: {formatMetres(stat.distanceMetres)}
                </span>
                <span className="live-distance-pill__tally">
                  {isCleared
                    ? `✓ Cleared (${stat.makes}/${stat.attempts})`
                    : isCurrent
                    ? `● Current (${stat.makes}/${stat.attempts})`
                    : `○ Upcoming`}
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
          <div
            className="abandon-confirm-group"
            role="group"
            aria-label="Confirm abandon session"
          >
            <span className="abandon-confirm-group__label">
              Discard this ladder session?
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
