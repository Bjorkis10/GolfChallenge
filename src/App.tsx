import { useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, ShellTab } from './components/AppHeader';
import { ChallengeCards } from './components/ChallengeCards';
import { HistoryDataPanel } from './components/HistoryDataPanel';
import { DistanceRoundsFlow } from './components/DistanceRoundsFlow';
import { MatSettingsPanel } from './components/MatSettingsPanel';
import { PaceControlFlow } from './components/PaceControlFlow';
import { PuttingLadderFlow } from './components/PuttingLadderFlow';
import { StorageBanner } from './components/StorageBanner';
import { describeSessionChange } from './domain/announcements';
import { buildDemoHistory } from './domain/demoData';
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

  // Demo preview: in-memory only, never saved, never exported (see HistoryDataPanel).
  const [demoMode, setDemoMode] = useState(false);
  const demoHistory = useMemo(() => buildDemoHistory(), []);
  useEffect(() => {
    if (activeTab !== 'history') setDemoMode(false);
  }, [activeTab]);

  // Screen-reader announcements for logging / undo / completion, derived from session changes.
  const [announcement, setAnnouncement] = useState('');
  const prevSessionRef = useRef<ActiveSessionState | null>(activeSession);
  useEffect(() => {
    const message = describeSessionChange(prevSessionRef.current, activeSession);
    prevSessionRef.current = activeSession;
    if (message) setAnnouncement(message);
  }, [activeSession]);

  // Focus management: after a view change (not a tab-key press), move focus to the new heading.
  const tabNavRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstViewRender = useRef(true);
  const sessionPhase = activeSession ? activeSession.status : 'none';
  useEffect(() => {
    if (firstViewRender.current) {
      firstViewRender.current = false;
      return;
    }
    if (tabNavRef.current) {
      tabNavRef.current = false;
      return;
    }
    const heading = mainRef.current?.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [activeTab, challengesView, sessionPhase]);

  const handleSelectTab = (tab: ShellTab) => {
    if (tab !== activeTab) tabNavRef.current = true;
    setActiveTab(tab);
  };

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

  const handleDeleteHistorySession = (sessionId: string) => {
    const result = storageService.deleteCompletedSession(sessionId);
    setHistory(result.history);
    setStorageHealth(result.health);
    setStorageMessage(result.message);
    return {
      ok: result.deleted,
      message: result.deleted
        ? result.savedToStorage
          ? 'Session deleted. Personal bests were recalculated.'
          : 'Session deleted in memory only — it could not be saved to browser storage.'
        : result.message,
    };
  };

  const handleImportData = (
    nextSettings: MatSettings,
    nextHistory: readonly CompletedSessionRecord[]
  ) => {
    const result = storageService.replaceWithImportedData(nextSettings, nextHistory);
    if (!result.replaced) {
      return { ok: false, message: result.message };
    }
    setSettings(nextSettings);
    setHistory(result.history);
    setStorageHealth(result.health);
    setStorageMessage(result.message);
    return {
      ok: true,
      message: result.savedToStorage
        ? `Import complete: ${nextHistory.length} session${nextHistory.length === 1 ? '' : 's'} and mat settings replaced.`
        : 'Import applied in memory only — browser storage is unavailable, so export again to keep it.',
    };
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
        onSelectTab={handleSelectTab}
        settings={settings}
      />

      <StorageBanner
        health={storageHealth}
        message={storageMessage}
        onResetCorruptedStorage={handleResetCorruptedStorage}
      />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <main ref={mainRef}>
        <div
          id="main-tabpanel"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
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
        ) : activeTab === 'history' ? (
          <HistoryDataPanel
            settings={settings}
            history={demoMode ? demoHistory : history}
            activeSession={demoMode ? null : activeSession}
            demoMode={demoMode}
            onToggleDemoMode={setDemoMode}
            onDeleteSession={handleDeleteHistorySession}
            onImportData={handleImportData}
          />
        ) : (
          <MatSettingsPanel
            key={`${settings.maxUsableDistanceMetres}-${settings.defaultDistancesMetres.join(',')}`}
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}
        </div>
      </main>

      <footer className="app-footer">
        <p style={{ marginBottom: 0 }}>
          <strong>Local Practice Storage:</strong> Settings, active sessions, and completed
          session history are stored locally in this browser, and the browser can clear them
          (for example when site data is cleared). Use Export JSON backup in History &amp; Data
          to keep a copy.
        </p>
        <p style={{ marginBottom: 0 }}>
          Practice scores track personal consistency on your home mat and are not validated
          measures of on-course golfing ability.
        </p>
      </footer>
    </div>
  );
}
