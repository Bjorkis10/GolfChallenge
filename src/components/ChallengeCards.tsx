import { formatMetres, MatSettings } from '../domain/matSettings';
import {
  ActiveSessionState,
  CompletedSessionRecord,
} from '../domain/types';

interface ChallengeCardsProps {
  readonly settings: MatSettings;
  readonly activeSession: ActiveSessionState | null;
  readonly history: readonly CompletedSessionRecord[];
  readonly onOpenSettings: () => void;
  readonly onOpenDistanceRounds: () => void;
}

interface UnavailableChallengeDefinition {
  readonly id: string;
  readonly title: string;
  readonly milestoneLabel: string;
  readonly summary: string;
  readonly rules: readonly string[];
  readonly inputFormat: string;
}

const UNAVAILABLE_CHALLENGES: readonly UnavailableChallengeDefinition[] = [
  {
    id: 'putting-ladder',
    title: 'Putting Ladder',
    milestoneLabel: 'Not yet available (Milestone 3)',
    summary:
      'Climb from your shortest mark to your longest usable mat distance within a fixed attempt budget.',
    rules: [
      'Advance to the next distance after a make; stay at the current distance after a miss.',
      'Fixed attempt budget (e.g., 15 putts) with clear completion upon making the final distance.',
      'Supports single-step Undo, auto-resume on refresh, and comparable personal bests.',
    ],
    inputFormat: 'Primary input: Made / Missed',
  },
  {
    id: 'pace-control',
    title: 'Pace Control',
    milestoneLabel: 'Not yet available (Milestone 4)',
    summary:
      'Mark a physical target zone on your 3.0m mat and practice stopping the ball inside the zone.',
    rules: [
      'Record each putt as Short, In Zone, or Long.',
      '1 point for each ball finishing inside the marked target zone.',
      'Summarizes short/in-zone/long dispersion across each target distance.',
    ],
    inputFormat: 'Primary input: Short / In Zone / Long',
  },
];

export function ChallengeCards({
  settings,
  activeSession,
  history,
  onOpenSettings,
  onOpenDistanceRounds,
}: ChallengeCardsProps) {
  const formattedDistances = settings.defaultDistancesMetres
    .map((d) => formatMetres(d))
    .join(', ');

  const distanceRoundsSessions = history.filter(
    (item) => item.mode === 'distance_rounds'
  );

  return (
    <section
      id="panel-challenges"
      role="tabpanel"
      aria-labelledby="tab-challenges"
    >
      <div className="section-header">
        <h2 className="section-header__title">Practice Challenges</h2>
        <p className="section-header__lead">
          Select an available putting challenge below, or adjust your 3.0m mat’s usable
          putting distance and default marks.
        </p>
      </div>

      <div className="mat-overview-bar">
        <div className="mat-overview-bar__details">
          <span className="mat-overview-bar__label">Active Mat Configuration</span>
          <span className="mat-overview-bar__values">
            Max usable: <strong>{formatMetres(settings.maxUsableDistanceMetres)}</strong> (on{' '}
            {formatMetres(settings.physicalMatLengthMetres)} mat) • Default distances:{' '}
            <strong>{formattedDistances}</strong>
          </span>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onOpenSettings}
        >
          Adjust Mat Distances
        </button>
      </div>

      <div className="challenge-grid" style={{ marginTop: 'var(--space-4)' }}>
        {/* Distance Rounds (Available in Milestone 2) */}
        <article className="challenge-card challenge-card--available">
          <div className="challenge-card__header">
            <h3 className="challenge-card__title">Distance Rounds</h3>
            <span className="badge-available" aria-label="Availability status">
              <span aria-hidden="true">●</span>
              Available
            </span>
          </div>

          <p className="challenge-card__description">
            Hit a fixed number of putts (3, 5, or 10) from each configured mat distance
            across 1 to 3 rounds to measure make rate across your usable putting range.
          </p>

          <ul className="challenge-card__rules">
            <li>
              Uses your configured mat distances (all validated within your usable distance
              up to 3.0m).
            </li>
            <li>
              1 point per made putt, with makes, attempts, and make percentage reported per
              distance and overall.
            </li>
            <li>
              Default single-tap Made / Missed logging with optional non-blocking direction
              and distance miss tags.
            </li>
          </ul>

          <div className="challenge-card__footer">
            <span>Primary input: Made / Missed</span>
            <span>
              {distanceRoundsSessions.length === 0
                ? 'No completed sessions yet'
                : `${distanceRoundsSessions.length} completed ${
                    distanceRoundsSessions.length === 1 ? 'session' : 'sessions'
                  }`}
            </span>
          </div>

          <div className="challenge-card__actions">
            <button
              type="button"
              className="btn btn--primary btn--large-action"
              onClick={onOpenDistanceRounds}
            >
              {activeSession
                ? activeSession.status === 'completed'
                  ? 'View Completed Session Summary'
                  : `Resume Active Session (${activeSession.attempts.length} putts logged)`
                : 'Configure & Start Distance Rounds'}
            </button>
          </div>
        </article>

        {/* Putting Ladder & Pace Control (Not yet available in Milestone 2) */}
        {UNAVAILABLE_CHALLENGES.map((challenge) => (
          <article key={challenge.id} className="challenge-card">
            <div className="challenge-card__header">
              <h3 className="challenge-card__title">{challenge.title}</h3>
              <span className="badge-unavailable" aria-label="Availability status">
                <span aria-hidden="true">⏳</span>
                {challenge.milestoneLabel}
              </span>
            </div>

            <p className="challenge-card__description">{challenge.summary}</p>

            <ul className="challenge-card__rules">
              {challenge.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>

            <div className="challenge-card__footer">
              <span>{challenge.inputFormat}</span>
              <span>No sessions recorded yet</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
