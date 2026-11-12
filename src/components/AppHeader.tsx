import { KeyboardEvent } from 'react';
import { formatMetres, MatSettings } from '../domain/matSettings';

export type ShellTab = 'challenges' | 'history' | 'settings';

interface AppHeaderProps {
  readonly activeTab: ShellTab;
  readonly onSelectTab: (tab: ShellTab) => void;
  readonly settings: MatSettings;
}

const TABS: readonly { id: ShellTab; label: string }[] = [
  { id: 'challenges', label: 'Practice Challenges' },
  { id: 'history', label: 'History & Data' },
  { id: 'settings', label: 'Mat Settings' },
];

export function AppHeader({ activeTab, onSelectTab, settings }: AppHeaderProps) {
  // WAI-ARIA tabs pattern: roving tabindex, Arrow/Home/End move focus and activate.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onSelectTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

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
        {TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              // Only the selected tab controls a rendered panel (one panel is mounted at a time).
              aria-controls={selected ? 'main-tabpanel' : undefined}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="app-nav__tab"
              onClick={() => onSelectTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
