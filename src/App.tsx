import { useMemo, useState } from 'react';
import { AppHeader, ShellTab } from './components/AppHeader';
import { ChallengeCards } from './components/ChallengeCards';
import { DistanceRoundsFlow } from './components/DistanceRoundsFlow';
import { MatSettingsPanel } from './components/MatSettingsPanel';
import { PaceControlFlow } from './components/PaceControlFlow';
import { PuttingLadderFlow } from './components/PuttingLadderFlow';
import { StorageBanner } from './components/StorageBanner';
import { MatSettings } from './domain/matSettings';
import {
  ActiveSessionState,
  CompletedSessionRecord,
} from './domain/types';
import {
  SettingsStorageService,
  StorageHealthMode,
} from './storage/settingsStorage';

type ChallengesSubView = 'overview' | 'distance_rounds' | 'putting_ladder' | 'pace_control';

export function App() {
  const storageService = useMemo(() => new SettingsStorageService(), []);
  const initialLoad = useMemo(() => storageService.loadSettings(), [storageService]);

  const [activeTab, setActiveTab] = useState<ShellTab>('challenges');
  // Auto-resume into the active challenge flow if an active or just-completed session is present on load
  const [challengesView, setChallengesView] = useState<ChallengesSubView>(() =>
    initialLoad.activeSession ? initialLoad.activeSession.mode : 'overview'
  );
  const [settings, setSettings] = useState<MatSettings>(initialLoad.settings);
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(
    initialLoad.activeSession
  );
  const [history, setHistory] = useState<readonly CompletedSessionRecord[]>(
    initialLoad.history
  );
  const [storageHealth, setStorageHealth] = useState<StorageHealthMode>(
    initialLoad.health
  );
  const [storageMessage, setStorageMessage] = useState<string | null>(
    initialLoad.message
  );

  const handleSaveSettings = (nextSettings: MatSettings) => {
    const result = storageService.saveSettings(nextSettings);
    setSettings(nextSettings);
    setStorageHealth(result.health);
    setStorageMessage(result.message);
    return {
      savedToStorage: result.savedToStorage,
      message: result.message,
    };
  };

  const handleUpdateSession = (nextSession: ActiveSessionState | null) => {
    const result = storageService.saveActiveSession(nextSession);
    setActiveSession(result.activeSession);
    setHistory(result.history);
    setStorageHealth(result.health);
    setStorageMessage(result.message);
  };

  const handleAbandonSession = () => {
    const result = storageService.abandonActiveSession();
    setActiveSession(result.activeSession);
    setHistory(result.history);
    setStorageHealth(result.health);
    setStorageMessage(result.message);
    setChallengesView('overview');
  };

  const handleResetCorruptedStorage = () => {
    const resetState = storageService.forceResetCorruptedStorage();
    setSettings(resetState.settings);
    setActiveSession(resetState.activeSession);
    setHistory(resetState.history);
    setStorageHealth(resetState.health);
    setStorageMessage(resetState.message);
    setChallengesView('overview');
  };

  const activeDrSession =
    activeSession && activeSession.mode === 'distance_rounds'
      ? activeSession
      : null;
  const activeLadderSession =
    activeSession && activeSession.mode === 'putting_ladder'
      ? activeSession
      : null;

  const activePaceSession =
    activeSession && activeSession.mode === 'pace_control'
      ? activeSession
      : null;

  return (
    <div className="app-shell">
      <AppHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        settings={settings}
      />

      <StorageBanner
        health={storageHealth}
        message={storageMessage}
        onResetCorruptedStorage={handleResetCorruptedStorage}
      />

      <main>
        {activeTab === 'challenges' ? (
          challengesView === 'distance_rounds' ? (
            <DistanceRoundsFlow
              key={`dr-${settings.maxUsableDistanceMetres}-${settings.defaultDistancesMetres.join(',')}`}
              settings={settings}
              activeSession={activeDrSession}
              history={history}
              onUpdateSession={handleUpdateSession}
              onAbandonSession={handleAbandonSession}
              onBackToChallenges={() => setChallengesView('overview')}
            />
          ) : challengesView === 'putting_ladder' ? (
            <PuttingLadderFlow
              key={`pl-${settings.maxUsableDistanceMetres}-${settings.defaultDistancesMetres.join(',')}`}
              settings={settings}
              activeSession={activeLadderSession}
              history={history}
              onUpdateSession={handleUpdateSession}
              onAbandonSession={handleAbandonSession}
              onBackToChallenges={() => setChallengesView('overview')}
            />
          ) : challengesView === 'pace_control' ? (
            <PaceControlFlow
              key={`pc-${settings.maxUsableDistanceMetres}-${settings.defaultDistancesMetres.join(',')}`}
              settings={settings}
              activeSession={activePaceSession}
              history={history}
              onUpdateSession={handleUpdateSession}
              onAbandonSession={handleAbandonSession}
              onBackToChallenges={() => setChallengesView('overview')}
            />
          ) : (
            <ChallengeCards
              settings={settings}
              activeSession={activeSession}
              history={history}
              onOpenSettings={() => setActiveTab('settings')}
              onOpenDistanceRounds={() => setChallengesView('distance_rounds')}
              onOpenPuttingLadder={() => setChallengesView('putting_ladder')}
              onOpenPaceControl={() => setChallengesView('pace_control')}
            />
          )
        ) : (
          <MatSettingsPanel
            key={`${settings.maxUsableDistanceMetres}-${settings.defaultDistancesMetres.join(',')}`}
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}
      </main>

      <footer className="app-footer">
        <p style={{ marginBottom: 0 }}>
          <strong>Local Practice Storage:</strong> Settings, active sessions, and completed
          session history are stored locally in this browser. Clearing site data removes
          local data—JSON export backup will be added in Milestone 5.
        </p>
        <p style={{ marginBottom: 0 }}>
          Practice scores track personal consistency on your home mat and are not validated
          measures of on-course golfing ability.
        </p>
      </footer>
    </div>
  );
}
