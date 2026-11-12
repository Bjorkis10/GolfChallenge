import { useMemo, useState } from 'react';
import { AppHeader, ShellTab } from './components/AppHeader';
import { ChallengeCards } from './components/ChallengeCards';
import { MatSettingsPanel } from './components/MatSettingsPanel';
import { StorageBanner } from './components/StorageBanner';
import { MatSettings } from './domain/matSettings';
import {
  SettingsStorageService,
  StorageHealthMode,
} from './storage/settingsStorage';

export function App() {
  const storageService = useMemo(() => new SettingsStorageService(), []);
  const initialLoad = useMemo(() => storageService.loadSettings(), [storageService]);

  const [activeTab, setActiveTab] = useState<ShellTab>('challenges');
  const [settings, setSettings] = useState<MatSettings>(initialLoad.settings);
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

  const handleResetCorruptedStorage = () => {
    const resetState = storageService.forceResetCorruptedStorage();
    setSettings(resetState.settings);
    setStorageHealth(resetState.health);
    setStorageMessage(resetState.message);
  };

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
          <ChallengeCards
            settings={settings}
            onOpenSettings={() => setActiveTab('settings')}
          />
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
          <strong>Local Practice Storage:</strong> Settings and future session history are
          stored locally in this browser. Clearing site data removes local data—JSON export
          backup will be added alongside session history.
        </p>
        <p style={{ marginBottom: 0 }}>
          Practice scores track personal consistency on your home mat and are not validated
          measures of on-course golfing ability.
        </p>
      </footer>
    </div>
  );
}
