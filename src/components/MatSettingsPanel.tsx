import { FormEvent, useState } from 'react';
import {
  buildRecommendedDistancesForUsableLimit,
  DEFAULT_MAT_SETTINGS,
  DISTANCE_STEP_METRES,
  formatMetres,
  MatSettings,
  MAX_PRESET_DISTANCES_COUNT,
  MIN_PUTTING_DISTANCE_METRES,
  MIN_USABLE_DISTANCE_METRES,
  PHYSICAL_MAT_LENGTH_METRES,
  roundToTenthMetre,
  validateChallengeDistance,
  validateMatSettings,
} from '../domain/matSettings';

interface MatSettingsPanelProps {
  readonly settings: MatSettings;
  readonly onSaveSettings: (nextSettings: MatSettings) => {
    savedToStorage: boolean;
    message: string | null;
  };
}

export function MatSettingsPanel({
  settings,
  onSaveSettings,
}: MatSettingsPanelProps) {
  const [maxUsable, setMaxUsable] = useState<number>(
    settings.maxUsableDistanceMetres
  );
  const [distances, setDistances] = useState<number[]>(
    settings.defaultDistancesMetres
  );
  const [newDistanceInput, setNewDistanceInput] = useState<string>('1.8');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const applyAndPersist = (nextMaxUsable: number, nextDistances: number[], notice?: string) => {
    const candidate: MatSettings = {
      unit: 'm',
      physicalMatLengthMetres: PHYSICAL_MAT_LENGTH_METRES,
      maxUsableDistanceMetres: nextMaxUsable,
      defaultDistancesMetres: nextDistances,
    };

    const validation = validateMatSettings(candidate);
    if (!validation.valid || !validation.settings) {
      setErrorMessage(validation.errors.join(' '));
      setStatusMessage(null);
      return false;
    }

    setMaxUsable(validation.settings.maxUsableDistanceMetres);
    setDistances(validation.settings.defaultDistancesMetres);
    setErrorMessage(null);

    const saveOutcome = onSaveSettings(validation.settings);
    if (saveOutcome.savedToStorage) {
      setStatusMessage(notice ?? 'Mat settings saved to browser storage.');
    } else {
      setStatusMessage(
        saveOutcome.message ??
          'Mat settings applied for this session (browser storage write skipped).'
      );
    }
    return true;
  };

  const handleUsableDistanceChange = (rawNext: number) => {
    const roundedNext = roundToTenthMetre(rawNext);
    if (
      roundedNext < MIN_USABLE_DISTANCE_METRES ||
      roundedNext > PHYSICAL_MAT_LENGTH_METRES
    ) {
      setErrorMessage(
        `Maximum usable distance must be between ${formatMetres(MIN_USABLE_DISTANCE_METRES)} and ${formatMetres(PHYSICAL_MAT_LENGTH_METRES)}.`
      );
      return;
    }

    // Keep any existing distances that still fit; if any exceeded the new usable limit, filter/adjust them
    const withinLimit = distances.filter((d) => d <= roundedNext);
    const hadTrimmed = withinLimit.length < distances.length;
    const nextDistances =
      withinLimit.length > 0
        ? withinLimit
        : buildRecommendedDistancesForUsableLimit(roundedNext);

    const trimNote = hadTrimmed
      ? `Usable distance updated to ${formatMetres(roundedNext)}. Default distances exceeding ${formatMetres(roundedNext)} were removed.`
      : `Maximum usable putting distance updated to ${formatMetres(roundedNext)}.`;

    applyAndPersist(roundedNext, nextDistances, trimNote);
  };

  const handleAddDistance = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number.parseFloat(newDistanceInput);
    const singleError = validateChallengeDistance(parsed, maxUsable);
    if (singleError) {
      setErrorMessage(singleError);
      setStatusMessage(null);
      return;
    }

    const rounded = roundToTenthMetre(parsed);
    if (distances.includes(rounded)) {
      setErrorMessage(`${formatMetres(rounded)} is already in your default distances.`);
      setStatusMessage(null);
      return;
    }

    if (distances.length >= MAX_PRESET_DISTANCES_COUNT) {
      setErrorMessage(
        `You can configure at most ${MAX_PRESET_DISTANCES_COUNT} default distances.`
      );
      setStatusMessage(null);
      return;
    }

    const nextDistances = [...distances, rounded].sort((a, b) => a - b);
    applyAndPersist(
      maxUsable,
      nextDistances,
      `Added ${formatMetres(rounded)} to default putting distances.`
    );
  };

  const handleRemoveDistance = (target: number) => {
    if (distances.length <= 1) {
      setErrorMessage('Keep at least one default putting distance.');
      setStatusMessage(null);
      return;
    }
    const nextDistances = distances.filter((d) => d !== target);
    applyAndPersist(
      maxUsable,
      nextDistances,
      `Removed ${formatMetres(target)} from default putting distances.`
    );
  };

  const handleApplyRecommendedForLimit = () => {
    const recommended = buildRecommendedDistancesForUsableLimit(maxUsable);
    applyAndPersist(
      maxUsable,
      recommended,
      `Applied recommended distances up to ${formatMetres(maxUsable)}.`
    );
  };

  const handleResetDefaults = () => {
    applyAndPersist(
      DEFAULT_MAT_SETTINGS.maxUsableDistanceMetres,
      DEFAULT_MAT_SETTINGS.defaultDistancesMetres,
      'Restored default 3.0m mat settings.'
    );
  };

  return (
    <section
      id="panel-settings"
      role="tabpanel"
      aria-labelledby="tab-settings"
    >
      <div className="section-header">
        <h2 className="section-header__title">3.0m Mat Settings</h2>
        <p className="section-header__lead">
          Your physical putting mat is fixed at <strong>3.0m</strong>. Set your
          maximum usable putting distance based on where your cup sits, and
          choose the default distances used across challenges.
        </p>
      </div>

      <div className="settings-card">
        <div className="field-group">
          <label className="field-group__label" htmlFor="usable-distance-slider">
            Maximum Usable Putting Distance (up to 3.0m)
          </label>
          <p className="field-group__hint">
            All challenge distances are validated against this limit so you are
            never asked to putt from off the back of your mat.
          </p>

          <div className="usable-distance-control">
            <button
              type="button"
              className="btn btn--secondary btn--stepper"
              aria-label="Decrease usable distance by 0.1 metres"
              disabled={maxUsable <= MIN_USABLE_DISTANCE_METRES}
              onClick={() =>
                handleUsableDistanceChange(maxUsable - DISTANCE_STEP_METRES)
              }
            >
              −0.1m
            </button>

            <input
              id="usable-distance-slider"
              className="usable-slider"
              type="range"
              min={MIN_USABLE_DISTANCE_METRES}
              max={PHYSICAL_MAT_LENGTH_METRES}
              step={DISTANCE_STEP_METRES}
              value={maxUsable}
              onChange={(e) =>
                handleUsableDistanceChange(Number.parseFloat(e.target.value))
              }
            />

            <button
              type="button"
              className="btn btn--secondary btn--stepper"
              aria-label="Increase usable distance by 0.1 metres"
              disabled={maxUsable >= PHYSICAL_MAT_LENGTH_METRES}
              onClick={() =>
                handleUsableDistanceChange(maxUsable + DISTANCE_STEP_METRES)
              }
            >
              +0.1m
            </button>

            <output
              htmlFor="usable-distance-slider"
              className="usable-distance-readout"
              aria-live="polite"
            >
              {formatMetres(maxUsable)}
            </output>
          </div>
        </div>

        <div className="field-group">
          <span className="field-group__label">
            Default Putting Distances ({distances.length} of {MAX_PRESET_DISTANCES_COUNT} max)
          </span>
          <p className="field-group__hint">
            Allowed range: <strong>{formatMetres(MIN_PUTTING_DISTANCE_METRES)}</strong> to{' '}
            <strong>{formatMetres(maxUsable)}</strong> in 0.1m steps.
          </p>

          <div className="distance-chips" role="list" aria-label="Configured default distances">
            {distances.map((dist) => (
              <span key={dist} className="distance-chip" role="listitem">
                <span>{formatMetres(dist)}</span>
                <button
                  type="button"
                  className="distance-chip__remove"
                  aria-label={`Remove ${formatMetres(dist)}`}
                  onClick={() => handleRemoveDistance(dist)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <form className="add-distance-row" onSubmit={handleAddDistance} noValidate>
            <label htmlFor="add-distance-input" className="sr-only">
              Add distance in metres
            </label>
            <input
              id="add-distance-input"
              className="number-input"
              type="number"
              inputMode="decimal"
              min={MIN_PUTTING_DISTANCE_METRES}
              max={maxUsable}
              step={DISTANCE_STEP_METRES}
              value={newDistanceInput}
              onChange={(e) => setNewDistanceInput(e.target.value)}
            />
            <button type="submit" className="btn btn--primary">
              Add Distance (m)
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleApplyRecommendedForLimit}
            >
              Evenly Space up to {formatMetres(maxUsable)}
            </button>
          </form>
        </div>

        {errorMessage && (
          <div className="feedback-msg feedback-msg--error" role="alert">
            {errorMessage}
          </div>
        )}

        {statusMessage && !errorMessage && (
          <div className="feedback-msg feedback-msg--success" role="status" aria-live="polite">
            {statusMessage}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Physical mat length: {formatMetres(PHYSICAL_MAT_LENGTH_METRES)} (metres only)
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleResetDefaults}
          >
            Reset to 3.0m Defaults
          </button>
        </div>
      </div>
    </section>
  );
}
