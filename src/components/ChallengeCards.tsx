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
  readonly onOpenPuttingLadder: () => void;
  readonly onOpenPaceControl: () => void;
}

export function ChallengeCards({
  settings,
  activeSession,
  history,
  onOpenSettings,
  onOpenDistanceRounds,
  onOpenPuttingLadder,
  onOpenPaceControl,
}: ChallengeCardsProps) {
  const formattedDistances = settings.defaultDistancesMetres
    .map((d) => formatMetres(d))
    .join(', ');

  const distanceRoundsSessions = history.filter(
    (item) => item.mode === 'distance_rounds'
  );
  const puttingLadderSessions = history.filter(
    (item) => item.mode === 'putting_ladder'
  );

  const paceControlSessions = history.filter(
    (item) => item.mode === 'pace_control'
  );
  const activePaceSession =
    activeSession && activeSession.mode === 'pace_control'
      ? activeSession
      : null;

  const activeDrSession =
    activeSession && activeSession.mode === 'distance_rounds'
      ? activeSession
      : null;
  const activeLadderSession =
    activeSession && activeSession.mode === 'putting_ladder'
      ? activeSession
      : null;

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
              {activeDrSession
                ? activeDrSession.status === 'completed'
                  ? 'View Completed Session Summary'
                  : `Resume Active Session (${activeDrSession.attempts.length} putts logged)`
                : 'Configure & Start Distance Rounds'}
            </button>
          </div>
        </article>

        {/* Putting Ladder (Available in Milestone 3) */}
        <article className="challenge-card challenge-card--available">
          <div className="challenge-card__header">
            <h3 className="challenge-card__title">Putting Ladder</h3>
            <span className="badge-available" aria-label="Availability status">
              <span aria-hidden="true">●</span>
              Available
            </span>
          </div>

          <p className="challenge-card__description">
            Climb from your shortest mark to your longest usable mat distance within a
            fixed attempt budget (10, 15, 20, or 30 putts).
          </p>

          <ul className="challenge-card__rules">
            <li>
              Advance 1 distance rung after a Made putt; stay at your current distance rung
              after a Missed putt.
            </li>
            <li>
              Making a putt on the final configured distance immediately completes the
              ladder as Cleared, ranked by cleared status, rungs completed, and efficiency.
            </li>
            <li>
              Supports single-tap Made / Missed logging, optional miss tags, Undo (including
              post-final-putt reopen), auto-resume, and comparable personal bests.
            </li>
          </ul>

          <div className="challenge-card__footer">
            <span>Primary input: Made / Missed</span>
            <span>
              {puttingLadderSessions.length === 0
                ? 'No completed sessions yet'
                : `${puttingLadderSessions.length} completed ${
                    puttingLadderSessions.length === 1 ? 'session' : 'sessions'
                  }`}
            </span>
          </div>

          <div className="challenge-card__actions">
            <button
              type="button"
              className="btn btn--primary btn--large-action"
              onClick={onOpenPuttingLadder}
            >
              {activeLadderSession
                ? activeLadderSession.status === 'completed'
                  ? 'View Completed Ladder Summary'
                  : `Resume Active Ladder (${activeLadderSession.attempts.length} putts logged)`
                : 'Configure & Start Putting Ladder'}
            </button>
          </div>
        </article>

        {/* Pace Control (Available in Milestone 4) */}
        <article className="challenge-card challenge-card--available">
          <div className="challenge-card__header">
            <h3 className="challenge-card__title">Pace Control</h3>
            <span className="badge-available" aria-label="Availability status">
              <span aria-hidden="true">●</span>
              Available
            </span>
          </div>

          <p className="challenge-card__description">
            Mark a physical target zone (0.2m to 0.6m deep) on your 3.0m mat and practice
            stopping the ball inside it from each target distance.
          </p>

          <ul className="challenge-card__rules">
            <li>Record each putt as Short, In Zone, or Long with a single tap.</li>
            <li>1 point for each ball finishing In Zone; Short and Long score 0.</li>
            <li>
              Reports % Short / % In Zone / % Long per target distance and overall, with
              comparable personal bests.
            </li>
          </ul>

          <div className="challenge-card__footer">
            <span>Primary input: Short / In Zone / Long</span>
            <span>
              {paceControlSessions.length === 0
                ? 'No completed sessions yet'
                : `${paceControlSessions.length} completed ${
                    paceControlSessions.length === 1 ? 'session' : 'sessions'
                  }`}
            </span>
          </div>

          <div className="challenge-card__actions">
            <button
              type="button"
              className="btn btn--primary btn--large-action"
              onClick={onOpenPaceControl}
            >
              {activePaceSession
                ? activePaceSession.status === 'completed'
                  ? 'View Completed Pace Control Summary'
                  : `Resume Active Session (${activePaceSession.attempts.length} putts logged)`
                : 'Configure & Start Pace Control'}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
