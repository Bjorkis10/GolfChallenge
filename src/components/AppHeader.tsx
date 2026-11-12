import { formatMetres, MatSettings } from '../domain/matSettings';

export type ShellTab = 'challenges' | 'history' | 'settings';

interface AppHeaderProps {
  readonly activeTab: ShellTab;
  readonly onSelectTab: (tab: ShellTab) => void;
  readonly settings: MatSettings;
}

export function AppHeader({ activeTab, onSelectTab, settings }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__top">
        <div className="app-brand">
          <div className="app-brand__mark" aria-hidden="true">
            3m
          </div>
          <div>
            <h1 className="app-brand__title">GolfChallenge</h1>
            <p className="app-brand__subtitle">Home Putting Mat Practice</p>
          </div>
        </div>

        <div className="mat-summary-pill" aria-label="Configured usable mat distance">
          <span>Mat: {formatMetres(settings.physicalMatLengthMetres)}</span>
          <span aria-hidden="true">•</span>
          <span>Usable: up to {formatMetres(settings.maxUsableDistanceMetres)}</span>
        </div>
      </div>

      <nav className="app-nav" role="tablist" aria-label="Main navigation">
        <button
          type="button"
          role="tab"
          id="tab-challenges"
          aria-controls="panel-challenges"
          aria-selected={activeTab === 'challenges'}
          className="app-nav__tab"
          onClick={() => onSelectTab('challenges')}
        >
          Practice Challenges
        </button>
        <button
          type="button"
          role="tab"
          id="tab-history"
          aria-controls="panel-history"
          aria-selected={activeTab === 'history'}
          className="app-nav__tab"
          onClick={() => onSelectTab('history')}
        >
          History &amp; Data
        </button>
        <button
          type="button"
          role="tab"
          id="tab-settings"
          aria-controls="panel-settings"
          aria-selected={activeTab === 'settings'}
          className="app-nav__tab"
          onClick={() => onSelectTab('settings')}
        >
          Mat Settings
        </button>
      </nav>
    </header>
  );
}
